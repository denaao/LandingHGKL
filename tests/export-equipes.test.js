import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { canonicalTeamName } from '../services/team-names.js';
import { exportarEquipes } from '../services/export-equipes.js';

function banco() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE etapas (id INTEGER PRIMARY KEY, nome TEXT, status TEXT, created_at TEXT);
    CREATE TABLE global_teams (id INTEGER PRIMARY KEY, nome TEXT UNIQUE);
    CREATE TABLE etapa_teams (id INTEGER PRIMARY KEY, etapa_id INTEGER, global_team_id INTEGER, registration_token TEXT);
    CREATE TABLE players (id INTEGER PRIMARY KEY, etapa_team_id INTEGER, nome TEXT);
    CREATE TABLE tables_t (id INTEGER PRIMARY KEY, etapa_id INTEGER, numero INTEGER, phase TEXT);
    CREATE TABLE seats (id INTEGER PRIMARY KEY, table_id INTEGER, player_id INTEGER, elimination_order INTEGER, points INTEGER);
    CREATE TABLE team_base_points (team_nome TEXT PRIMARY KEY, points INTEGER);
  `);
  return db;
}

// Etapa 5 finalizada: Garagentos (2 jogadores) x Liga PINK (nome com espaço duplo) numa mesa de 4.
function semear(db) {
  db.exec(`
    INSERT INTO etapas VALUES (5, '5º Etapa BHG', 'finished', '2026-06-20 18:00:00');
    INSERT INTO etapas VALUES (9, 'Etapa teste', 'registration', '2026-07-01 18:00:00');
    INSERT INTO global_teams VALUES (1, 'Garagentos'), (2, 'Liga Feminina  Poker Campinas PINK'), (3, 'Fenix Poker');
    INSERT INTO etapa_teams VALUES (10, 5, 1, 'a'), (11, 5, 2, 'b'), (12, 5, 3, 'c'), (20, 9, 1, 'd');
    INSERT INTO players VALUES (100, 10, 'João'), (101, 10, 'Ana'), (102, 11, 'Bia'), (103, 11, 'Cris'), (104, 12, 'Sem Mesa'), (200, 20, 'Teste');
    INSERT INTO tables_t VALUES (1, 5, 1, 'qualifying'), (2, 9, 1, 'qualifying');
    INSERT INTO seats VALUES (1, 1, 100, 4, 30), (2, 1, 102, 3, 25), (3, 1, 101, 2, 22), (4, 1, 103, 1, 18), (5, 2, 200, 1, 30);
    INSERT INTO team_base_points VALUES ('Garagentos', 500), ('Fenix Poker', 251), ('Crazy Nuts', 125);
  `);
}

test('canonical colapsa espaço duplo e aplica alias', () => {
  assert.equal(canonicalTeamName('Fenix Poker'), 'Fênix');
  assert.equal(canonicalTeamName('Liga Feminina  Poker Campinas PINK'), 'Liga Feminina Poker Campinas PINK');
  assert.equal(canonicalTeamName('  Garagentos '), 'Garagentos');
});

test('export ignora etapa não finalizada', () => {
  const db = banco(); semear(db);
  const out = exportarEquipes(db);
  assert.equal(out.origem, 'torneiodeequipes');
  assert.deepEqual(out.etapas.map(e => e.id), [5]);
});

test('export inclui pontos-base com nome canônico', () => {
  const db = banco(); semear(db);
  const out = exportarEquipes(db);
  assert.deepEqual(out.pontosBase, [
    { nome: 'Crazy Nuts', pontos: 125 },
    { nome: 'Fênix', pontos: 251 },
    { nome: 'Garagentos', pontos: 500 },
  ]);
});

test('export usa nomes canônicos e deixa de fora equipe sem pontos na etapa', () => {
  const db = banco(); semear(db);
  const [etapa] = exportarEquipes(db).etapas;
  assert.deepEqual(etapa.equipes.map(e => e.nome), ['Garagentos', 'Liga Feminina Poker Campinas PINK']);
  assert.equal(etapa.mesas[0].fase, 'qualifying');
  assert.deepEqual(etapa.mesas[0].assentos[0], { jogadorId: 100, ordemEliminacao: 4, pontos: 30 });
});

test('soma dos pontos exportados por equipe == ranking-geral', () => {
  const db = banco(); semear(db);
  const out = exportarEquipes(db);
  const total = new Map(out.pontosBase.map(b => [b.nome, b.pontos]));
  for (const etapa of out.etapas) {
    const equipeDoJogador = new Map(etapa.equipes.flatMap(e => e.jogadores.map(j => [j.id, e.nome])));
    for (const m of etapa.mesas) for (const a of m.assentos) {
      const nome = equipeDoJogador.get(a.jogadorId);
      total.set(nome, (total.get(nome) ?? 0) + a.pontos);
    }
  }
  assert.equal(total.get('Garagentos'), 500 + 30 + 22);
  assert.equal(total.get('Liga Feminina Poker Campinas PINK'), 25 + 18);
  assert.equal(total.get('Fênix'), 251);
});
