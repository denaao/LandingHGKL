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
  CREATE TABLE IF NOT EXISTS team_base_points (
    team_nome TEXT PRIMARY KEY,
    points INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS team_aliases (
    alias TEXT PRIMARY KEY,
    canonical_nome TEXT NOT NULL
  );

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

// Seed pontos históricos (antes da Etapa 3 — não duplicar com o que já está no banco)
const seedBasePoints = db.prepare('INSERT OR IGNORE INTO team_base_points (team_nome, points) VALUES (?, ?)');
const basePoints = [
  ['Garagentos',             500],
  ['Pesadelo',               416],
  ['Marcão 42 Poker Team',   372],
  ['Esporte da Mente Zero 1',358],
  ['Call por Blefe',         337],
  ['Leva o Restinho Team',   321],
  ['Business Poker',         308],
  ['Arena Poker',            305],
  ['Poker Barão',            302],
  ['Fênix',                  251],
  ['Suprema',                192],
  ['Crazy Nuts',             125],
  ['Paga o Careca',          100],
  ['De Tudo um Poker',        92],
];
db.transaction(() => { for (const [nome, pts] of basePoints) seedBasePoints.run(nome, pts); })();

// Aliases: nome usado no cadastro → nome canônico do ranking
const seedAlias = db.prepare('INSERT OR IGNORE INTO team_aliases (alias, canonical_nome) VALUES (?, ?)');
const aliases = [
  ['baraopoker',           'Poker Barão'],
  ['pokerarao',            'Poker Barão'],
  ['fenixpoker',           'Fênix'],
  ['fenix',                'Fênix'],
  ['esportedamente01',     'Esporte da Mente Zero 1'],
  ['esportedamentezero1',  'Esporte da Mente Zero 1'],
  ['bussinespoker',        'Business Poker'],
  ['businesspoker',        'Business Poker'],
  ['leavorestinho',        'Leva o Restinho Team'],
  ['leavorestinhosteam',   'Leva o Restinho Team'],
  ['leavorestinhoteam',    'Leva o Restinho Team'],
  ['garagentos',           'Garagentos'],
  ['pesadelo',             'Pesadelo'],
  ['ghostpoker',           'Ghost Poker'],
];
db.transaction(() => { for (const [alias, canonical] of aliases) seedAlias.run(alias, canonical); })();

export default db;
