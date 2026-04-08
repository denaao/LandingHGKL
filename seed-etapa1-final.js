import db from './database.js';
import { getFinalPoints } from './services/scoring.js';

const etapa = db.prepare("SELECT * FROM etapas WHERE nome = 'Etapa 1'").get();
if (!etapa) { console.log('Etapa 1 nao encontrada.'); process.exit(1); }

const existingFinal = db.prepare("SELECT COUNT(*) as c FROM tables_t WHERE etapa_id = ? AND phase = 'final'").get(etapa.id);
if (existingFinal.c > 0) { console.log('Mesa final da Etapa 1 ja existe, pulando.'); process.exit(0); }

// Final table results: position 1 = winner (80pts)
const finalResults = [
  "Esporte da Mente Zero 1",
  "Garagentos",
  "Pesadelo",
  "Arena Poker",
  "Marcão 42 Poker Team",
  "Poker Barão",
  "Leva o Restinho Team",
  "Suprema",
];

const insertTable = db.prepare('INSERT INTO tables_t (etapa_id, numero, phase) VALUES (?, ?, ?)');
const insertSeat = db.prepare('INSERT INTO seats (table_id, player_id, elimination_order, points) VALUES (?, ?, ?, ?)');

const transaction = db.transaction(() => {
  const tableResult = insertTable.run(etapa.id, 1, 'final');
  const tableId = tableResult.lastInsertRowid;

  finalResults.forEach((teamName, i) => {
    const team = db.prepare("SELECT * FROM teams WHERE etapa_id = ? AND nome = ?").get(etapa.id, teamName);
    if (!team) { console.log(`WARN: Equipe nao encontrada: ${teamName}`); return; }

    // Get first player of the team
    const player = db.prepare("SELECT * FROM players WHERE team_id = ? ORDER BY id LIMIT 1").get(team.id);
    if (!player) { console.log(`WARN: Sem jogadores: ${teamName}`); return; }

    const position = i + 1;
    const eliminationOrder = 8 + 1 - position;
    const points = getFinalPoints(position);

    insertSeat.run(tableId, player.id, eliminationOrder, points);
    console.log(`  ${position}o: ${player.nome} (${teamName}) - ${points} pts`);
  });
});
transaction();

db.prepare("UPDATE etapas SET status = 'finished' WHERE id = ?").run(etapa.id);
console.log('\nMesa final da Etapa 1 inserida e etapa encerrada!');
