import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

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

export default router;
