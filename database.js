import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join, parse } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function resolveDbPath() {
  const requestedPath = process.env.DB_PATH
    || process.env.DATABASE_PATH
    || (process.env.NODE_ENV === 'production' ? '/app/db/hgkl.db' : join(__dirname, 'db', 'hgkl.db'));

  const parsed = parse(requestedPath);
  const hasExtension = parsed.ext.length > 0;
  let resolvedPath = requestedPath;

  if (!hasExtension) {
    resolvedPath = join(requestedPath, 'hgkl.db');
  } else if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isDirectory()) {
    // Some platforms mount volumes as directories even when a file-like path is configured.
    resolvedPath = join(requestedPath, 'hgkl.db');
  }

  fs.mkdirSync(dirname(resolvedPath), { recursive: true });
  return resolvedPath;
}

function openDatabase() {
  const primaryPath = resolveDbPath();
  const fallbacks = [
    primaryPath,
    '/app/db/hgkl.db',
    '/app/hgkl.db',
    '/tmp/hgkl.db'
  ];

  let lastError = null;
  for (const candidate of fallbacks) {
    try {
      fs.mkdirSync(dirname(candidate), { recursive: true });
      return new Database(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

const db = openDatabase();

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