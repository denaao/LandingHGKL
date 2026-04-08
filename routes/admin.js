import { Router } from 'express';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import db from '../database.js';
import { requireAuth } from '../middleware/auth.js';
import { executeDraw } from '../services/draw.js';
import { getQualifyingPoints, getFinalPoints, eliminationToPosition } from '../services/scoring.js';

const router = Router();
router.use(requireAuth);

// ── ETAPAS ──

router.get('/etapas', (req, res) => {
  const etapas = db.prepare('SELECT * FROM etapas ORDER BY id DESC').all();
  res.json(etapas);
});

router.post('/etapas', (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });
  const result = db.prepare('INSERT INTO etapas (nome) VALUES (?)').run(nome);
  res.json({ id: result.lastInsertRowid, nome, status: 'registration' });
});

router.patch('/etapas/:id', (req, res) => {
  const { status } = req.body;
  const valid = ['registration', 'qualifying', 'final', 'finished'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Status inválido' });
  db.prepare('UPDATE etapas SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

router.delete('/etapas/:id', (req, res) => {
  const etapaId = req.params.id;
  const tableIds = db.prepare('SELECT id FROM tables_t WHERE etapa_id = ?').all(etapaId).map(r => r.id);
  if (tableIds.length > 0) {
    const placeholders = tableIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM seats WHERE table_id IN (${placeholders})`).run(...tableIds);
  }
  db.prepare('DELETE FROM tables_t WHERE etapa_id = ?').run(etapaId);
  const teamIds = db.prepare('SELECT id FROM teams WHERE etapa_id = ?').all(etapaId).map(r => r.id);
  if (teamIds.length > 0) {
    const placeholders = teamIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM players WHERE team_id IN (${placeholders})`).run(...teamIds);
  }
  db.prepare('DELETE FROM teams WHERE etapa_id = ?').run(etapaId);
  db.prepare('DELETE FROM etapas WHERE id = ?').run(etapaId);
  res.json({ ok: true });
});

// ── TEAMS ──

router.get('/etapas/:id/teams', (req, res) => {
  const teams = db.prepare('SELECT * FROM teams WHERE etapa_id = ? ORDER BY id').all(req.params.id);
  for (const team of teams) {
    team.players = db.prepare('SELECT * FROM players WHERE team_id = ? ORDER BY id').all(team.id);
  }
  res.json(teams);
});

router.post('/etapas/:id/teams', (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome da equipe obrigatório' });
  const token = crypto.randomUUID();
  const result = db.prepare('INSERT INTO teams (etapa_id, nome, registration_token) VALUES (?, ?, ?)').run(req.params.id, nome, token);
  res.json({ id: result.lastInsertRowid, nome, registration_token: token });
});

router.delete('/teams/:id', (req, res) => {
  db.prepare('DELETE FROM players WHERE team_id = ?').run(req.params.id);
  db.prepare('DELETE FROM teams WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── DRAW ──

router.post('/etapas/:id/draw', (req, res) => {
  const etapaId = req.params.id;
  const etapa = db.prepare('SELECT * FROM etapas WHERE id = ?').get(etapaId);
  if (!etapa) return res.status(404).json({ error: 'Etapa não encontrada' });

  // Check if draw already exists
  const existing = db.prepare('SELECT COUNT(*) as count FROM tables_t WHERE etapa_id = ? AND phase = ?').get(etapaId, 'qualifying');
  if (existing.count > 0) return res.status(400).json({ error: 'Sorteio já realizado. Apague as mesas antes de sortear novamente.' });

  // Get teams with players
  const teams = db.prepare('SELECT * FROM teams WHERE etapa_id = ?').all(etapaId);
  for (const team of teams) {
    team.players = db.prepare('SELECT * FROM players WHERE team_id = ?').all(team.id);
  }

  try {
    const tables = executeDraw(teams);

    const insertTable = db.prepare('INSERT INTO tables_t (etapa_id, numero, phase) VALUES (?, ?, ?)');
    const insertSeat = db.prepare('INSERT INTO seats (table_id, player_id) VALUES (?, ?)');

    const transaction = db.transaction(() => {
      for (const table of tables) {
        const result = insertTable.run(etapaId, table.numero, 'qualifying');
        const tableId = result.lastInsertRowid;
        for (const player of table.players) {
          insertSeat.run(tableId, player.id);
        }
      }
    });
    transaction();

    db.prepare('UPDATE etapas SET status = ? WHERE id = ?').run('qualifying', etapaId);
    res.json({ ok: true, tables: tables.length });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/etapas/:id/tables', (req, res) => {
  const etapaId = req.params.id;
  const tableIds = db.prepare('SELECT id FROM tables_t WHERE etapa_id = ?').all(etapaId).map(r => r.id);
  if (tableIds.length > 0) {
    const placeholders = tableIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM seats WHERE table_id IN (${placeholders})`).run(...tableIds);
  }
  db.prepare('DELETE FROM tables_t WHERE etapa_id = ?').run(etapaId);
  db.prepare('UPDATE etapas SET status = ? WHERE id = ?').run('registration', etapaId);
  res.json({ ok: true });
});

// ── TABLES & SEATS ──

router.get('/etapas/:id/tables', (req, res) => {
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

router.patch('/seats/:id/eliminate', (req, res) => {
  const rawOrder = Number(req.body?.elimination_order);
  if (!Number.isInteger(rawOrder) || rawOrder < 1) {
    return res.status(400).json({ error: 'Ordem de eliminação inválida' });
  }

  const elimination_order = rawOrder;
  const seat = db.prepare('SELECT s.*, t.phase, t.etapa_id FROM seats s JOIN tables_t t ON s.table_id = t.id WHERE s.id = ?').get(req.params.id);
  if (!seat) return res.status(404).json({ error: 'Seat não encontrado' });

  const etapa = db.prepare('SELECT status FROM etapas WHERE id = ?').get(seat.etapa_id);
  if (etapa && etapa.status === 'finished') return res.status(400).json({ error: 'Etapa encerrada. Valores congelados.' });

  const alreadyEliminated = seat.elimination_order !== null;
  if (alreadyEliminated) {
    return res.status(400).json({ error: 'Jogador já eliminado nesta mesa' });
  }

  const expectedOrder = db.prepare(
    'SELECT COUNT(*) as count FROM seats WHERE table_id = ? AND elimination_order IS NOT NULL'
  ).get(seat.table_id).count + 1;

  if (elimination_order !== expectedOrder) {
    return res.status(409).json({
      error: `Ordem inválida para esta mesa. Use a ordem ${expectedOrder}`
    });
  }

  const duplicateOrder = db.prepare(
    'SELECT id FROM seats WHERE table_id = ? AND elimination_order = ? LIMIT 1'
  ).get(seat.table_id, elimination_order);

  if (duplicateOrder) {
    return res.status(409).json({
      error: `A ordem ${elimination_order} já foi usada nesta mesa`
    });
  }

  const totalPlayers = db.prepare('SELECT COUNT(*) as count FROM seats WHERE table_id = ?').get(seat.table_id).count;
  if (elimination_order > totalPlayers) {
    return res.status(400).json({ error: 'Ordem de eliminação acima do total de jogadores da mesa' });
  }

  const position = eliminationToPosition(elimination_order, totalPlayers);

  let points;
  if (seat.phase === 'qualifying') {
    points = getQualifyingPoints(position);
  } else {
    points = getFinalPoints(position);
  }

  db.prepare('UPDATE seats SET elimination_order = ?, points = ? WHERE id = ?').run(elimination_order, points, req.params.id);
  res.json({ ok: true, position, points });
});

router.patch('/seats/:id/clear', (req, res) => {
  const seat = db.prepare('SELECT s.*, t.etapa_id FROM seats s JOIN tables_t t ON s.table_id = t.id WHERE s.id = ?').get(req.params.id);
  if (seat) {
    const etapa = db.prepare('SELECT status FROM etapas WHERE id = ?').get(seat.etapa_id);
    if (etapa && etapa.status === 'finished') return res.status(400).json({ error: 'Etapa encerrada. Valores congelados.' });
  }
  db.prepare('UPDATE seats SET elimination_order = NULL, points = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── FINAL TABLE ──

router.post('/etapas/:id/final', (req, res) => {
  const etapaId = req.params.id;
  const { representatives } = req.body;
  // representatives = [{ team_id, player_id }] - 8 entries

  if (!representatives || representatives.length < 1) {
    return res.status(400).json({ error: 'Precisa de pelo menos 1 representante' });
  }

  // Check if final table already exists
  const existing = db.prepare('SELECT COUNT(*) as count FROM tables_t WHERE etapa_id = ? AND phase = ?').get(etapaId, 'final');
  if (existing.count > 0) return res.status(400).json({ error: 'Mesa final já criada' });

  const insertTable = db.prepare('INSERT INTO tables_t (etapa_id, numero, phase) VALUES (?, ?, ?)');
  const insertSeat = db.prepare('INSERT INTO seats (table_id, player_id) VALUES (?, ?)');

  const transaction = db.transaction(() => {
    const result = insertTable.run(etapaId, 1, 'final');
    const tableId = result.lastInsertRowid;
    for (const rep of representatives) {
      insertSeat.run(tableId, rep.player_id);
    }
  });
  transaction();

  db.prepare('UPDATE etapas SET status = ? WHERE id = ?').run('final', etapaId);
  res.json({ ok: true });
});

// ── RANKING ──

router.get('/etapas/:id/ranking', (req, res) => {
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
      SELECT p.nome as player_nome, t2.nome as team_nome, tb.numero as mesa,
             tb.phase, s.elimination_order, s.points,
             CASE WHEN tb.phase = 'qualifying' THEN (
               (SELECT COUNT(*) FROM seats WHERE table_id = s.table_id) + 1 - s.elimination_order
             ) ELSE (
               (SELECT COUNT(*) FROM seats WHERE table_id = s.table_id) + 1 - s.elimination_order
             ) END as position
      FROM seats s
      JOIN players p ON s.player_id = p.id
      JOIN teams t2 ON p.team_id = t2.id
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

// ── PDF REPORT ──

router.get('/etapas/:id/pdf', (req, res) => {
  const etapaId = req.params.id;
  const etapa = db.prepare('SELECT * FROM etapas WHERE id = ?').get(etapaId);
  if (!etapa) return res.status(404).json({ error: 'Etapa não encontrada' });

  const teams = db.prepare('SELECT * FROM teams WHERE etapa_id = ? ORDER BY id').all(etapaId);
  const tables = db.prepare('SELECT * FROM tables_t WHERE etapa_id = ? ORDER BY phase, numero').all(etapaId);

  // Build ranking
  const ranking = [];
  for (const team of teams) {
    const qp = db.prepare(`
      SELECT COALESCE(SUM(s.points), 0) as total FROM seats s
      JOIN tables_t t ON s.table_id = t.id JOIN players p ON s.player_id = p.id
      WHERE p.team_id = ? AND t.etapa_id = ? AND t.phase = 'qualifying'
    `).get(team.id, etapaId);
    const fp = db.prepare(`
      SELECT COALESCE(SUM(s.points), 0) as total FROM seats s
      JOIN tables_t t ON s.table_id = t.id JOIN players p ON s.player_id = p.id
      WHERE p.team_id = ? AND t.etapa_id = ? AND t.phase = 'final'
    `).get(team.id, etapaId);
    const details = db.prepare(`
      SELECT p.nome as player_nome, tb.numero as mesa, tb.phase, s.points,
             ((SELECT COUNT(*) FROM seats WHERE table_id = s.table_id) + 1 - s.elimination_order) as position
      FROM seats s JOIN players p ON s.player_id = p.id JOIN tables_t tb ON s.table_id = tb.id
      WHERE p.team_id = ? AND tb.etapa_id = ? AND s.elimination_order IS NOT NULL
      ORDER BY tb.phase, tb.numero
    `).all(team.id, etapaId);
    ranking.push({ nome: team.nome, qualifying: qp.total, final: fp.total, total: qp.total + fp.total, details });
  }
  ranking.sort((a, b) => b.total - a.total);

  // Generate PDF
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${etapa.nome.replace(/\s+/g, '_')}_resultado.pdf"`);
  doc.pipe(res);

  // Header
  doc.fontSize(24).font('Helvetica-Bold').text('BATALHA DE HOME GAMES', { align: 'center' });
  doc.fontSize(16).font('Helvetica').text(`${etapa.nome} — Resultado Final`, { align: 'center' });
  doc.moveDown(1.5);

  // Ranking table
  doc.fontSize(14).font('Helvetica-Bold').text('RANKING FINAL');
  doc.moveDown(0.5);

  const col1 = 50, col2 = 80, col3 = 300, col4 = 380, col5 = 460;
  doc.fontSize(9).font('Helvetica-Bold');
  doc.text('POS', col1, doc.y, { continued: false });
  let headerY = doc.y - 11;
  doc.text('EQUIPE', col2, headerY);
  doc.text('CLASSIF.', col3, headerY);
  doc.text('FINAL', col4, headerY);
  doc.text('TOTAL', col5, headerY);
  doc.moveDown(0.3);
  doc.moveTo(col1, doc.y).lineTo(540, doc.y).stroke();
  doc.moveDown(0.3);

  ranking.forEach((team, i) => {
    const y = doc.y;
    doc.fontSize(9).font(i < 3 ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(`${i + 1}`, col1, y);
    doc.text(team.nome, col2, y);
    doc.text(`${team.qualifying}`, col3, y);
    doc.text(`${team.final}`, col4, y);
    doc.text(`${team.total}`, col5, y);
    doc.moveDown(0.2);
  });

  // Details per team
  doc.addPage();
  doc.fontSize(14).font('Helvetica-Bold').text('DETALHAMENTO POR EQUIPE');
  doc.moveDown(0.5);

  ranking.forEach((team, i) => {
    if (doc.y > 700) doc.addPage();
    doc.fontSize(11).font('Helvetica-Bold').text(`${i + 1}. ${team.nome} — ${team.total} pts`);
    doc.fontSize(8).font('Helvetica').text(`Classificatória: ${team.qualifying} | Final: ${team.final}`);
    doc.moveDown(0.3);

    if (team.details.length > 0) {
      team.details.forEach(d => {
        const phase = d.phase === 'final' ? 'Final' : `Mesa ${d.mesa}`;
        doc.fontSize(8).font('Helvetica').text(`  ${d.player_nome} — ${phase} — ${d.position}o lugar — ${d.points} pts`);
      });
    } else {
      doc.fontSize(8).font('Helvetica').text('  Sem resultados registrados.');
    }
    doc.moveDown(0.5);
  });

  // Mesa details
  if (tables.length > 0) {
    doc.addPage();
    doc.fontSize(14).font('Helvetica-Bold').text('MESAS');
    doc.moveDown(0.5);

    for (const table of tables) {
      if (doc.y > 680) doc.addPage();
      const label = table.phase === 'final' ? 'Mesa Final' : `Mesa ${table.numero}`;
      doc.fontSize(11).font('Helvetica-Bold').text(label);
      doc.moveDown(0.2);

      const seats = db.prepare(`
        SELECT s.*, p.nome as player_nome, t.nome as team_nome
        FROM seats s JOIN players p ON s.player_id = p.id JOIN teams t ON p.team_id = t.id
        WHERE s.table_id = ? ORDER BY CASE WHEN s.elimination_order IS NULL THEN 0 ELSE 1 END, s.elimination_order
      `).all(table.id);

      seats.forEach(s => {
        if (s.elimination_order !== null) {
          const total = seats.length;
          const pos = total + 1 - s.elimination_order;
          doc.fontSize(8).font('Helvetica').text(`  ${pos}o — ${s.player_nome} (${s.team_nome}) — ${s.points} pts`);
        } else {
          doc.fontSize(8).font('Helvetica').text(`  - ${s.player_nome} (${s.team_nome}) — em jogo`);
        }
      });
      doc.moveDown(0.5);
    }
  }

  // Footer
  doc.fontSize(7).font('Helvetica').text(`Gerado em ${new Date().toLocaleString('pt-BR')} — Home Game King Live`, 50, 770, { align: 'center' });

  doc.end();
});

export default router;
