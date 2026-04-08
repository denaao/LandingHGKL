import { Router } from 'express';
import db from '../database.js';

const router = Router();
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'dk3qmdebu';
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || '';
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || '';
const GALLERY_TAG_ALIASES = {
  aniversariodenao: 'niverdenaao',
  aniversariodenaao: 'niverdenaao'
};

const CANONICAL_TAG_EQUIVALENTS = Object.entries(GALLERY_TAG_ALIASES).reduce((acc, [alias, canonical]) => {
  if (!acc[canonical]) {
    acc[canonical] = new Set([canonical]);
  }
  acc[canonical].add(alias);
  return acc;
}, {});

function getCloudinaryAuthHeader() {
  const token = Buffer.from(`${CLOUDINARY_API_KEY}:${CLOUDINARY_API_SECRET}`).toString('base64');
  return `Basic ${token}`;
}

function normalizeGalleryTag(value) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9_-]/g, '');

  return GALLERY_TAG_ALIASES[normalized] || normalized;
}

async function fetchCloudinaryGalleryTags() {
  if (!CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    const error = new Error('Cloudinary credentials are not configured');
    error.statusCode = 503;
    throw error;
  }

  const tagCounts = new Map();
  let nextCursor = null;

  do {
    const url = new URL(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/resources/image`);
    url.searchParams.set('max_results', '500');
    url.searchParams.set('tags', 'true');

    if (nextCursor) {
      url.searchParams.set('next_cursor', nextCursor);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: getCloudinaryAuthHeader()
      }
    });

    if (!response.ok) {
      const detail = await response.text();
      const error = new Error(`Cloudinary returned HTTP ${response.status}: ${detail}`);
      error.statusCode = 502;
      throw error;
    }

    const payload = await response.json();
    const resources = Array.isArray(payload.resources) ? payload.resources : [];

    for (const resource of resources) {
      const tags = Array.isArray(resource.tags) ? resource.tags : [];
      for (const rawTag of tags) {
        const tag = normalizeGalleryTag(rawTag);
        if (!tag) continue;
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    nextCursor = payload.next_cursor || null;
  } while (nextCursor);

  return Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .filter((item) => item.count > 0)
    .sort((a, b) => a.tag.localeCompare(b.tag, 'pt-BR', { numeric: true, sensitivity: 'base' }));
}

function getEquivalentTagsForSearch(tag) {
  const canonical = normalizeGalleryTag(tag);
  if (!canonical) return [];

  const equivalents = CANONICAL_TAG_EQUIVALENTS[canonical];
  if (!equivalents) return [canonical];

  return Array.from(equivalents);
}

function buildTagSearchExpression(tag) {
  const tags = getEquivalentTagsForSearch(tag);
  if (tags.length === 0) return '';

  if (tags.length === 1) {
    return `resource_type:image AND tags=${tags[0]}`;
  }

  const tagExpr = tags.map((currentTag) => `tags=${currentTag}`).join(' OR ');
  return `resource_type:image AND (${tagExpr})`;
}

async function fetchCloudinaryPhotosByTag(tag) {
  if (!CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    const error = new Error('Cloudinary credentials are not configured');
    error.statusCode = 503;
    throw error;
  }

  const expression = buildTagSearchExpression(tag);
  if (!expression) {
    return [];
  }

  const resourcesByAsset = new Map();
  let nextCursor = null;

  do {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/resources/search`, {
      method: 'POST',
      headers: {
        Authorization: getCloudinaryAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        expression,
        max_results: 100,
        next_cursor: nextCursor || undefined,
        sort_by: [{ created_at: 'desc' }]
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      const error = new Error(`Cloudinary returned HTTP ${response.status}: ${detail}`);
      error.statusCode = 502;
      throw error;
    }

    const payload = await response.json();
    const resources = Array.isArray(payload.resources) ? payload.resources : [];

    for (const resource of resources) {
      const id = resource.asset_id || `${resource.public_id}.${resource.format || 'jpg'}`;
      if (!resourcesByAsset.has(id)) {
        resourcesByAsset.set(id, {
          asset_id: resource.asset_id,
          public_id: resource.public_id,
          format: resource.format,
          secure_url: resource.secure_url
        });
      }
    }

    nextCursor = payload.next_cursor || null;
  } while (nextCursor);

  return Array.from(resourcesByAsset.values());
}

// Get team info by registration token
router.get('/register/:token', (req, res) => {
  const team = db.prepare(`
    SELECT t.*, e.nome as etapa_nome, e.status as etapa_status
    FROM teams t
    JOIN etapas e ON t.etapa_id = e.id
    WHERE t.registration_token = ?
  `).get(req.params.token);

  if (!team) return res.status(404).json({ error: 'Link inválido' });

  const players = db.prepare('SELECT * FROM players WHERE team_id = ? ORDER BY id').all(team.id);
  res.json({ ...team, players });
});

// Register players for a team
router.post('/register/:token', (req, res) => {
  const team = db.prepare(`
    SELECT t.*, e.status as etapa_status
    FROM teams t
    JOIN etapas e ON t.etapa_id = e.id
    WHERE t.registration_token = ?
  `).get(req.params.token);

  if (!team) return res.status(404).json({ error: 'Link inválido' });
  if (team.etapa_status !== 'registration') {
    return res.status(400).json({ error: 'Inscrições encerradas para esta etapa' });
  }

  const { players } = req.body;
  if (!players || players.length !== 8) {
    return res.status(400).json({ error: 'Precisa de exatamente 8 jogadores' });
  }

  for (const name of players) {
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Todos os nomes são obrigatórios' });
    }
  }

  // Remove existing players and add new ones
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM players WHERE team_id = ?').run(team.id);
    const insert = db.prepare('INSERT INTO players (team_id, nome) VALUES (?, ?)');
    for (const name of players) {
      insert.run(team.id, name.trim());
    }
  });
  transaction();

  res.json({ ok: true });
});

// ── PUBLIC RANKING ──

router.get('/public/etapas', (req, res) => {
  const etapas = db.prepare("SELECT id, nome, status FROM etapas ORDER BY id DESC").all();
  res.json(etapas);
});

router.get('/public/etapas/:id/ranking', (req, res) => {
  const etapaId = req.params.id;
  const teams = db.prepare('SELECT * FROM teams WHERE etapa_id = ? ORDER BY id').all(etapaId);
  const ranking = [];

  for (const team of teams) {
    const qualifyingPoints = db.prepare(`
      SELECT COALESCE(SUM(s.points), 0) as total
      FROM seats s
      JOIN tables_t t ON s.table_id = t.id
      JOIN players p ON s.player_id = p.id
      WHERE p.team_id = ? AND t.etapa_id = ? AND t.phase = 'qualifying'
    `).get(team.id, etapaId);

    const finalPoints = db.prepare(`
      SELECT COALESCE(SUM(s.points), 0) as total
      FROM seats s
      JOIN tables_t t ON s.table_id = t.id
      JOIN players p ON s.player_id = p.id
      WHERE p.team_id = ? AND t.etapa_id = ? AND t.phase = 'final'
    `).get(team.id, etapaId);

    const playerDetails = db.prepare(`
      SELECT p.nome as player_nome, tb.numero as mesa,
             tb.phase, s.elimination_order, s.points,
             ((SELECT COUNT(*) FROM seats WHERE table_id = s.table_id) + 1 - s.elimination_order) as position
      FROM seats s
      JOIN players p ON s.player_id = p.id
      JOIN tables_t tb ON s.table_id = tb.id
      WHERE p.team_id = ? AND tb.etapa_id = ? AND s.elimination_order IS NOT NULL
      ORDER BY tb.phase, tb.numero
    `).all(team.id, etapaId);

    ranking.push({
      team_id: team.id,
      team_nome: team.nome,
      qualifying_points: qualifyingPoints.total,
      final_points: finalPoints.total,
      total_points: qualifyingPoints.total + finalPoints.total,
      details: playerDetails
    });
  }

  ranking.sort((a, b) => b.total_points - a.total_points);
  res.json(ranking);
});

router.get('/public/ranking-geral', (req, res) => {
  const etapas = db.prepare("SELECT * FROM etapas ORDER BY id").all();
  const teamTotals = {};

  for (const etapa of etapas) {
    const teams = db.prepare('SELECT * FROM teams WHERE etapa_id = ?').all(etapa.id);
    for (const team of teams) {
      const pts = db.prepare(`
        SELECT COALESCE(SUM(s.points), 0) as total
        FROM seats s
        JOIN tables_t t ON s.table_id = t.id
        JOIN players p ON s.player_id = p.id
        WHERE p.team_id = ? AND t.etapa_id = ?
      `).get(team.id, etapa.id);

      const key = team.nome;
      if (!teamTotals[key]) {
        teamTotals[key] = { team_nome: team.nome, total_points: 0, etapas: [] };
      }
      if (pts.total > 0) {
        teamTotals[key].total_points += pts.total;
        teamTotals[key].etapas.push({ nome: etapa.nome, points: pts.total });
      }
    }
  }

  const ranking = Object.values(teamTotals)
    .filter(t => t.total_points > 0)
    .sort((a, b) => b.total_points - a.total_points);

  res.json(ranking);
});

router.get('/public/etapas/:id/tables', (req, res) => {
  const tables = db.prepare('SELECT * FROM tables_t WHERE etapa_id = ? ORDER BY phase, numero').all(req.params.id);
  for (const table of tables) {
    table.seats = db.prepare(`
      SELECT s.id as seat_id, s.elimination_order, s.points,
             p.id as player_id, p.nome as player_nome,
             t.id as team_id, t.nome as team_nome
      FROM seats s
      JOIN players p ON s.player_id = p.id
      JOIN teams t ON p.team_id = t.id
      WHERE s.table_id = ?
      ORDER BY s.id
    `).all(table.id);
  }
  res.json(tables);
});

router.get('/gallery-tags', async (req, res) => {
  try {
    const tags = await fetchCloudinaryGalleryTags();
    res.json(tags);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: 'Nao foi possivel carregar as tags da galeria',
      detail: error.message
    });
  }
});

router.get('/gallery-photos/:tag', async (req, res) => {
  try {
    const tag = normalizeGalleryTag(req.params.tag);
    const resources = await fetchCloudinaryPhotosByTag(tag);
    res.json({ resources });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: 'Nao foi possivel carregar as fotos da galeria',
      detail: error.message
    });
  }
});

export default router;
