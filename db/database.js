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

  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    etapa_id INTEGER NOT NULL REFERENCES etapas(id),
    nome TEXT NOT NULL,
    registration_token TEXT UNIQUE NOT NULL,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL REFERENCES teams(id),
    nome TEXT NOT NULL
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
`);

export default db;
