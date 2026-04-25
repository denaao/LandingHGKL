import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join, parse } from 'path';
import fs from 'fs';
import crypto from 'crypto';

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

// ── SCHEMA BASE ──
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
      if (playerCols.length > 0) {
        // Tabela antiga existe — recriar com nova estrutura
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
        // Tabela não existe ainda — criar do zero
        db.exec(`
          CREATE TABLE players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER,
            etapa_team_id INTEGER,
            nome TEXT NOT NULL
          );
        `);
      }
      console.log('[DB] Migration 1: players atualizada com etapa_team_id');
    } catch (e) {
      console.error('[DB] Migration 1 erro:', e.message);
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
      console.log('[DB] Migration 2: teams migradas para global_teams + etapa_teams');
    } catch (e) {
      console.error('[DB] Migration 2 erro:', e.message);
    }
  }
}

// ── SEED: Pontos históricos (antes do sistema de etapas) ──
{
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
}

// ── MIGRATION 3: Normalizar nomes de global_teams + adicionar equipes faltantes ──
{
  // Renomear variantes para nomes canônicos (só altera o nome, preserva id e todos os dados vinculados)
  const renames = [
    ['Barão Poker',         'Poker Barão'],
    ['Bussines Poker',      'Business Poker'],
    ['Esporte da mente 01', 'Esporte da Mente Zero 1'],
    ['Fenix Poker',         'Fênix'],
    ['Leva o restinho',     'Leva o Restinho Team'],
  ];

  // Todos os 15 times que devem existir em global_teams
  const allCanonical = [
    'Garagentos', 'Pesadelo', 'Marcão 42 Poker Team', 'Esporte da Mente Zero 1',
    'Call por Blefe', 'Leva o Restinho Team', 'Business Poker', 'Arena Poker',
    'Poker Barão', 'Fênix', 'Suprema', 'Crazy Nuts', 'Paga o Careca',
    'De Tudo um Poker', 'Ghost Poker',
  ];

  try {
    db.transaction(() => {
      for (const [variant, canonical] of renames) {
        const variantRow = db.prepare('SELECT id FROM global_teams WHERE nome = ?').get(variant);
        if (!variantRow) continue;
        const canonicalRow = db.prepare('SELECT id FROM global_teams WHERE nome = ?').get(canonical);
        if (canonicalRow) {
          // Canônico já existe: mover etapa_teams do variante para o canônico
          db.prepare('UPDATE OR IGNORE etapa_teams SET global_team_id = ? WHERE global_team_id = ?').run(canonicalRow.id, variantRow.id);
          db.prepare('DELETE FROM etapa_teams WHERE global_team_id = ?').run(variantRow.id);
          db.prepare('DELETE FROM global_teams WHERE id = ?').run(variantRow.id);
        } else {
          // Renomear direto (id preservado, FK intacta)
          db.prepare('UPDATE global_teams SET nome = ? WHERE id = ?').run(canonical, variantRow.id);
        }
      }
      // Inserir equipes que ainda não existem
      const ins = db.prepare('INSERT OR IGNORE INTO global_teams (nome) VALUES (?)');
      for (const nome of allCanonical) ins.run(nome);
    })();
    console.log('[DB] Migration 3: global_teams normalizados e completos');
  } catch (e) {
    console.error('[DB] Migration 3 erro:', e.message);
  }
}

export default db;
