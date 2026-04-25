import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, 'hgkl.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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
    player_id INTEGER NOT NULL REFERENCES players(id),
    elimination_order INTEGER,
    points INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS team_base_points (
    team_nome TEXT PRIMARY KEY,
    points INTEGER NOT NULL DEFAULT 0
  );
`);

// ── MIGRATION 1: Make players.team_id nullable, add etapa_team_id ──
{
  const cols = db.prepare('PRAGMA table_info(players)').all();
  const hasEtapaTeamId = cols.some(c => c.name === 'etapa_team_id');
  if (!hasEtapaTeamId) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER,
        etapa_team_id INTEGER REFERENCES etapa_teams(id),
        nome TEXT NOT NULL
      );
    `);
    // If old players table existed without etapa_team_id, recreate it
    const oldCols = db.prepare('PRAGMA table_info(players)').all().map(c => c.name);
    if (!oldCols.includes('etapa_team_id')) {
      db.exec(`
        ALTER TABLE players RENAME TO players_old;
        CREATE TABLE players (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          team_id INTEGER,
          etapa_team_id INTEGER REFERENCES etapa_teams(id),
          nome TEXT NOT NULL
        );
        INSERT INTO players (id, team_id, nome) SELECT id, team_id, nome FROM players_old;
        DROP TABLE players_old;
      `);
    }
    db.pragma('foreign_keys = ON');
  }
}

// ── MIGRATION 2: Move teams -> global_teams + etapa_teams ──
{
  const globalCount = db.prepare('SELECT COUNT(*) as cnt FROM global_teams').get().cnt;
  const oldTeamCount = db.prepare('SELECT COUNT(*) as cnt FROM teams').get().cnt;

  if (globalCount === 0 && oldTeamCount > 0) {
    db.transaction(() => {
      const oldTeams = db.prepare('SELECT * FROM teams ORDER BY id').all();
      for (const team of oldTeams) {
        let gt = db.prepare('SELECT id FROM global_teams WHERE nome = ?').get(team.nome);
        if (!gt) {
          const r = db.prepare('INSERT INTO global_teams (nome) VALUES (?)').run(team.nome);
          gt = { id: r.lastInsertRowid };
        }
        let et = db.prepare('SELECT id FROM etapa_teams WHERE etapa_id = ? AND global_team_id = ?').get(team.etapa_id, gt.id);
        if (!et) {
          const r = db.prepare('INSERT INTO etapa_teams (etapa_id, global_team_id, registration_token) VALUES (?, ?, ?)').run(team.etapa_id, gt.id, team.registration_token);
          et = { id: r.lastInsertRowid };
        }
        db.prepare('UPDATE players SET etapa_team_id = ? WHERE team_id = ?').run(et.id, team.id);
      }
    })();
  }
}

// ── SEED: Pontos históricos (antes das etapas no banco) ──
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
