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

// Normaliza nome de equipe para chave de alias (remove acentos, espaços, lowercase)
function normalizeTeamKey(nome) {
  return String(nome || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

router.get('/public/ranking-geral', (req, res) => {
  // Carrega aliases do banco
  const aliasRows = db.prepare('SELECT alias, canonical_nome FROM team_aliases').all();
  const aliasMap = {};
  for (const row of aliasRows) aliasMap[row.alias] = row.canonical_nome;

  function canonicalName(nome) {
    const key = normalizeTeamKey(nome);
    return aliasMap[key] || nome;
  }

  // Começa com pontos históricos (base)
  const teamTotals = {};
  const baseRows = db.prepare('SELECT team_nome, points FROM team_base_points').all();
  for (const row of baseRows) {
    teamTotals[row.team_nome] = { team_nome: row.team_nome, total_points: row.points, etapas: [] };
  }

  // Soma pontos de todas as etapas finalizadas no banco
  const etapas = db.prepare("SELECT * FROM etapas WHERE status = 'finished' ORDER BY id").all();
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

      if (pts.total <= 0) continue;

      const canonical = canonicalName(team.nome);
      if (!teamTotals[canonical]) {
        teamTotals[canonical] = { team_nome: canonical, total_points: 0, etapas: [] };
      }
      teamTotals[canonical].total_points += pts.total;
      teamTotals[canonical].etapas.push({ nome: etapa.nome, points: pts.total });
    }
  }

  const ranking = Object.values(teamTotals)
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

// ── RELATÓRIO PÚBLICO DA ETAPA ──

router.get('/public/etapas/:id/report', (req, res) => {
  const etapaId = req.params.id;
  const etapa = db.prepare('SELECT * FROM etapas WHERE id = ?').get(etapaId);
  if (!etapa) return res.status(404).send('<h1>Etapa não encontrada</h1>');

  const teams = db.prepare('SELECT * FROM teams WHERE etapa_id = ? ORDER BY id').all(etapaId);
  const tables = db.prepare('SELECT * FROM tables_t WHERE etapa_id = ? ORDER BY phase, numero').all(etapaId);

  for (const table of tables) {
    table.seats = db.prepare(`
      SELECT s.*, p.nome as player_nome, t.nome as team_nome,
             ((SELECT COUNT(*) FROM seats WHERE table_id = s.table_id) + 1 - s.elimination_order) as position
      FROM seats s JOIN players p ON s.player_id = p.id JOIN teams t ON p.team_id = t.id
      WHERE s.table_id = ? ORDER BY CASE WHEN s.elimination_order IS NULL THEN 0 ELSE 1 END, s.elimination_order DESC
    `).all(table.id);
  }

  const ranking = [];
  for (const team of teams) {
    const qp = db.prepare(`SELECT COALESCE(SUM(s.points),0) as total FROM seats s JOIN tables_t t ON s.table_id=t.id JOIN players p ON s.player_id=p.id WHERE p.team_id=? AND t.etapa_id=? AND t.phase='qualifying'`).get(team.id, etapaId);
    const fp = db.prepare(`SELECT COALESCE(SUM(s.points),0) as total FROM seats s JOIN tables_t t ON s.table_id=t.id JOIN players p ON s.player_id=p.id WHERE p.team_id=? AND t.etapa_id=? AND t.phase='final'`).get(team.id, etapaId);
    const details = db.prepare(`
      SELECT p.nome as player_nome, tb.numero as mesa, tb.phase, s.points,
             ((SELECT COUNT(*) FROM seats WHERE table_id=s.table_id)+1-s.elimination_order) as position
      FROM seats s JOIN players p ON s.player_id=p.id JOIN tables_t tb ON s.table_id=tb.id
      WHERE p.team_id=? AND tb.etapa_id=? AND s.elimination_order IS NOT NULL ORDER BY tb.phase, tb.numero
    `).all(team.id, etapaId);
    ranking.push({ nome: team.nome, qualifying: qp.total, final: fp.total, total: qp.total + fp.total, details });
  }
  ranking.sort((a, b) => b.total - a.total);

  const medals = ['🥇', '🥈', '🥉'];
  const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];

  const rankingRows = ranking.map((team, i) => {
    const color = i < 3 ? medalColors[i] : '#ccc';
    const medal = i < 3 ? medals[i] : `${i + 1}º`;
    return `
      <tr class="${i < 3 ? 'top' + (i+1) : ''}">
        <td class="pos-cell">${medal}</td>
        <td class="team-name">${team.nome}</td>
        <td class="pts-cell">${team.qualifying}</td>
        <td class="pts-cell">${team.final}</td>
        <td class="pts-cell total-pts" style="color:${color}">${team.total}</td>
      </tr>`;
  }).join('');

  const teamCards = ranking.map((team, i) => {
    const badge = i < 3
      ? `<span class="badge" style="background:${medalColors[i]};color:#000">${medals[i]} ${i+1}º lugar</span>`
      : `<span class="badge badge-default">${i+1}º lugar</span>`;
    const detailRows = team.details.length > 0
      ? team.details.map(d => {
          const phase = d.phase === 'final' ? '🏆 Mesa Final' : `Mesa ${d.mesa}`;
          return `<div class="detail-row">
            <span class="detail-phase">${phase}</span>
            <span class="detail-player">${d.player_nome}</span>
            <span class="detail-right"><span class="detail-pos">${d.position}º</span><span class="detail-pts">${d.points} pts</span></span>
          </div>`;
        }).join('')
      : '<div class="detail-row empty">Sem resultados registrados</div>';
    return `
      <div class="team-card">
        <div class="team-card-header">
          <div>
            ${badge}
            <div class="team-card-name">${team.nome}</div>
          </div>
          <div class="team-total">${team.total}<span>pts</span></div>
        </div>
        <div class="team-subtotals">
          <span>Classificatória: <strong>${team.qualifying}</strong></span>
          <span>Final: <strong>${team.final}</strong></span>
        </div>
        <div class="team-details">${detailRows}</div>
      </div>`;
  }).join('');

  const qualifying = tables.filter(t => t.phase === 'qualifying');
  const finalTables = tables.filter(t => t.phase === 'final');

  const renderTable = (table) => {
    const label = table.phase === 'final' ? '🏆 Mesa Final' : `Mesa ${table.numero}`;
    const seatRows = table.seats.map(s => {
      if (s.elimination_order !== null) {
        return `<div class="seat eliminated">
          <div class="seat-info"><span class="seat-name">${s.player_nome}</span><span class="seat-team">${s.team_nome}</span></div>
          <div class="seat-result"><span class="seat-pos">${s.position}º</span><span class="seat-pts">${s.points} pts</span></div>
        </div>`;
      }
      return `<div class="seat">
        <div class="seat-info"><span class="seat-name">${s.player_nome}</span><span class="seat-team">${s.team_nome}</span></div>
        <div class="seat-result"><span class="seat-active">em jogo</span></div>
      </div>`;
    }).join('');
    return `<div class="mesa-card"><div class="mesa-header">${label}</div>${seatRows}</div>`;
  };

  const qualifyingSection = qualifying.length > 0 ? `
    <h2 class="section-title">Fase Classificatória</h2>
    <div class="mesas-grid">${qualifying.map(renderTable).join('')}</div>` : '';

  const finalSection = finalTables.length > 0 ? `
    <h2 class="section-title">Mesa Final</h2>
    <div class="mesas-grid single">${finalTables.map(renderTable).join('')}</div>` : '';

  const geradoEm = new Date().toLocaleString('pt-BR');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${etapa.nome} — Resultado</title>
  <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0d0d0d; color: #e0e0e0; font-family: 'Inter', sans-serif; padding: 1.5rem 1rem 4rem; -webkit-text-size-adjust: 100%; }
    .page { max-width: 860px; margin: 0 auto; }

    /* HEADER */
    .report-header { text-align: center; padding: 1.5rem 0 2rem; border-bottom: 2px solid #c9a227; margin-bottom: 2rem; }
    .report-logo { font-family: 'Oswald', sans-serif; font-size: .8rem; letter-spacing: .25em; color: #c9a227; text-transform: uppercase; margin-bottom: .4rem; }
    .report-title { font-family: 'Oswald', sans-serif; font-size: clamp(1.6rem, 6vw, 2.4rem); font-weight: 700; color: #fff; line-height: 1.1; }
    .report-sub { font-size: .82rem; color: #777; margin-top: .4rem; }

    /* SECTIONS */
    .section-title { font-family: 'Oswald', sans-serif; font-size: 1.1rem; font-weight: 600; color: #c9a227; text-transform: uppercase; letter-spacing: .1em; margin: 2rem 0 .8rem; padding-bottom: .4rem; border-bottom: 1px solid #2a2a2a; }

    /* RANKING TABLE */
    .ranking-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: 10px; }
    .ranking-table { width: 100%; min-width: 360px; border-collapse: collapse; background: #161616; }
    .ranking-table thead tr { background: #1f1a0e; }
    .ranking-table th { padding: .6rem .75rem; text-align: left; font-size: .65rem; font-weight: 600; letter-spacing: .1em; color: #c9a227; text-transform: uppercase; white-space: nowrap; }
    .ranking-table td { padding: .7rem .75rem; border-bottom: 1px solid #1e1e1e; font-size: .88rem; }
    .ranking-table tr:last-child td { border-bottom: none; }
    .ranking-table tr.top1 td { background: rgba(255,215,0,.06); }
    .ranking-table tr.top2 td { background: rgba(192,192,192,.04); }
    .ranking-table tr.top3 td { background: rgba(205,127,50,.04); }
    .pos-cell { font-size: 1rem; width: 2.5rem; }
    .team-name { font-weight: 600; color: #fff; }
    .pts-cell { text-align: right; color: #aaa; font-size: .82rem; white-space: nowrap; }
    .total-pts { font-weight: 700; font-size: .95rem !important; }

    /* TEAM CARDS */
    .team-card { background: #161616; border: 1px solid #252525; border-radius: 10px; padding: 1rem 1rem 0; margin-bottom: .8rem; }
    .team-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: .5rem; gap: .5rem; }
    .team-card-name { font-family: 'Oswald', sans-serif; font-size: 1.2rem; font-weight: 600; color: #fff; margin-top: .25rem; line-height: 1.2; }
    .badge { display: inline-block; padding: .12rem .5rem; border-radius: 4px; font-size: .65rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
    .badge-default { background: #2a2a2a; color: #888; }
    .team-total { font-family: 'Oswald', sans-serif; font-size: 1.8rem; font-weight: 700; color: #c9a227; line-height: 1; text-align: right; flex-shrink: 0; }
    .team-total span { display: block; font-size: .75rem; color: #555; font-family: 'Inter', sans-serif; font-weight: 400; }
    .team-subtotals { font-size: .75rem; color: #555; margin-bottom: .75rem; display: flex; gap: 1rem; flex-wrap: wrap; }
    .team-subtotals strong { color: #888; }
    .team-details { border-top: 1px solid #1e1e1e; }
    .detail-row { display: flex; align-items: center; gap: .5rem; padding: .45rem 0; border-bottom: 1px solid #1a1a1a; font-size: .8rem; flex-wrap: nowrap; }
    .detail-row:last-child { border-bottom: none; }
    .detail-row.empty { color: #444; font-style: italic; padding: .6rem 0; }
    .detail-phase { color: #c9a227; font-weight: 600; min-width: 90px; flex-shrink: 0; font-size: .75rem; }
    .detail-player { color: #ccc; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .detail-right { display: flex; gap: .5rem; align-items: center; flex-shrink: 0; margin-left: auto; }
    .detail-pos { color: #888; font-size: .75rem; }
    .detail-pts { color: #c9a227; font-weight: 600; font-size: .78rem; }

    /* MESAS */
    .mesas-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: .75rem; }
    .mesas-grid.single { grid-template-columns: minmax(240px, 420px); }
    .mesa-card { background: #161616; border: 1px solid #252525; border-radius: 10px; overflow: hidden; }
    .mesa-header { background: #1f1a0e; padding: .55rem .9rem; font-family: 'Oswald', sans-serif; font-size: .95rem; font-weight: 600; color: #c9a227; letter-spacing: .05em; }
    .seat { display: flex; justify-content: space-between; align-items: center; padding: .45rem .9rem; border-top: 1px solid #1e1e1e; gap: .5rem; }
    .seat.eliminated { opacity: .7; }
    .seat-info { display: flex; flex-direction: column; gap: .1rem; min-width: 0; }
    .seat-name { font-size: .82rem; font-weight: 600; color: #ddd; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .seat-team { font-size: .68rem; color: #555; }
    .seat-result { text-align: right; flex-shrink: 0; }
    .seat-pos { display: block; font-size: .82rem; font-weight: 700; color: #c9a227; }
    .seat-pts { display: block; font-size: .68rem; color: #555; }
    .seat-active { font-size: .72rem; color: #4caf50; font-weight: 600; }

    /* FOOTER */
    .report-footer { text-align: center; margin-top: 2.5rem; font-size: .7rem; color: #3a3a3a; border-top: 1px solid #1a1a1a; padding-top: 1.2rem; }

    @media (max-width: 480px) {
      body { padding: 1rem .75rem 3rem; }
      .mesas-grid { grid-template-columns: 1fr; }
      .detail-phase { min-width: 75px; }
      .ranking-table th:nth-child(3),
      .ranking-table td:nth-child(3),
      .ranking-table th:nth-child(4),
      .ranking-table td:nth-child(4) { display: none; }
    }
  </style>
</head>
<body>
<div class="page">
  <div class="report-header">
    <div class="report-logo">Home Game King Live</div>
    <div class="report-title">${etapa.nome}</div>
    <div class="report-sub">Resultado Final</div>
  </div>

  <h2 class="section-title">🏆 Ranking Final</h2>
  <div class="ranking-wrap">
    <table class="ranking-table">
      <thead><tr>
        <th>Pos</th><th>Equipe</th>
        <th style="text-align:right">Classif.</th>
        <th style="text-align:right">Final</th>
        <th style="text-align:right">Total</th>
      </tr></thead>
      <tbody>${rankingRows}</tbody>
    </table>
  </div>

  <h2 class="section-title">Detalhamento por Equipe</h2>
  ${teamCards}

  ${qualifyingSection}
  ${finalSection}

  <div class="report-footer">Gerado em ${geradoEm} &mdash; Home Game King Live &mdash; kingjogos.com.br</div>
</div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
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
