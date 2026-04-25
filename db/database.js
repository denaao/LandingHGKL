import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, 'hgkl.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── SCHEMA BASE (idempotente) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS etapas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    status TEXT DEFAULT 'registration',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS global_teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS etapa_teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    etapa_id INTEGER NOT NULL REFERENCES etapas(id),
    global_team_id INTEGER NOT NULL REFERENCES global_teams(id),
    registration_token TEXT UNIQUE NOT NULL,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(etapa_id, global_team_id)
  );

  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    etapa_id INTEGER NOT NULL REFERENCES etapas(id),
    nome TEXT NOT NULL,
    registration_token TEXT UNIQUE NOT NULL,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tables_t (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    etapa_id INTEGER NOT NULL REFERENCES etapas(id),
    numero INTEGER NOT NULL,
    phase TEXT NOT NULL DEFAULT 'qualifying'
  );

  CREATE TABLE IF NOT EXISTS seats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id INTEGER NOT NULL REFERENCES tables_t(id),
    player_id INTEGER NOT NULL,
    elimination_order INTEGER,
    points INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS team_base_points (
    team_nome TEXT PRIMARY KEY,
    points INTEGER NOT NULL DEFAULT 0
  );
`);

// ── MIGRATION 1: Recriar players com team_id nullable + etapa_team_id ──
{
  const playerCols = db.prepare('PRAGMA table_info(players)').all().map(c => c.name);
  if (!playerCols.includes('etapa_team_id')) {
    db.pragma('foreign_keys = OFF');
    try {
      // Se players existe (schema antigo), migra. Se não existe, cria do zero.
      if (playerCols.length > 0) {
        db.exec(`
          CREATE TABLE players_mig (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER,
            etapa_team_id INTEGER,
            nome TEXT NOT NULL
          );
          INSERT INTO players_mig (id, team_id, nome)
            SELECT id, team_id, nome FROM players;
          DROP TABLE players;
          ALTER TABLE players_mig RENAME TO players;
        `);
      } else {
        db.exec(`
          CREATE TABLE players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER,
            etapa_team_id INTEGER,
            nome TEXT NOT NULL
          );
        `);
      }
    } catch (e) {
      console.error('[DB Migration 1] Erro ao recriar players:', e.message);
    }
    db.pragma('foreign_keys = ON');
  }
}

// ── MIGRATION 2: Mover teams -> global_teams + etapa_teams ──
{
  const globalCount = db.prepare('SELECT COUNT(*) as cnt FROM global_teams').get().cnt;
  const oldTeamCount = db.prepare('SELECT COUNT(*) as cnt FROM teams').get().cnt;

  if (globalCount === 0 && oldTeamCount > 0) {
    try {
      db.transaction(() => {
        const oldTeams = db.prepare('SELECT * FROM teams ORDER BY id').all();
        const insertGt = db.prepare('INSERT OR IGNORE INTO global_teams (nome) VALUES (?)');
        const findGt   = db.prepare('SELECT id FROM global_teams WHERE nome = ?');
        const insertEt = db.prepare(
          'INSERT OR IGNORE INTO etapa_teams (etapa_id, global_team_id, registration_token) VALUES (?, ?, ?)'
        );
        const findEt   = db.prepare('SELECT id FROM etapa_teams WHERE etapa_id = ? AND global_team_id = ?');
        const updPl    = db.prepare('UPDATE players SET etapa_team_id = ? WHERE team_id = ?');

        for (const team of oldTeams) {
          insertGt.run(team.nome);
          const gt = findGt.get(team.nome);
          insertEt.run(team.etapa_id, gt.id, team.registration_token);
          const et = findEt.get(team.etapa_id, gt.id);
          updPl.run(et.id, team.id);
        }
      })();
    } catch (e) {
      console.error('[DB Migration 2] Erro ao migrar teams:', e.message);
    }
  }
}

// ── SEED: Pontos históricos (antes do sistema de etapas) ──
const seedBase = db.prepare('INSERT OR IGNORE INTO team_base_points (team_nome, points) VALUES (?, ?)');
db.transaction(() => {
  for (const [nome, pts] of [
    ['Garagentos',              500],
    ['Pesadelo',                416],
    ['Marcão 42 Poker Team',    372],
    ['Esporte da Mente Zero 1', 358],
    ['Call por Blefe',          337],
    ['Leva o Restinho Team',    321],
    ['Business Poker',          308],
    ['Arena Poker',             305],
    ['Poker Barão',             302],
    ['Fênix',                   251],
    ['Suprema',                 192],
    ['Crazy Nuts',              125],
    ['Paga o Careca',           100],
    ['De Tudo um Poker',         92],
  ]) seedBase.run(nome, pts);
})();

export default db;
