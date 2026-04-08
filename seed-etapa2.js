import crypto from 'crypto';
import db from './database.js';
import { getQualifyingPoints, getFinalPoints } from './services/scoring.js';

const etapaExists = db.prepare("SELECT * FROM etapas WHERE nome = 'Etapa 2'").get();
if (etapaExists) { console.log('Etapa 2 ja existe, pulando.'); process.exit(0); }

const etapaResult = db.prepare("INSERT INTO etapas (nome) VALUES ('Etapa 2')").run();
const etapaId = etapaResult.lastInsertRowid;
console.log(`Etapa 2 criada (id=${etapaId})`);

// ── TEAMS + PLAYERS ──
const teamsData = [
  { nome: "Leva o Restinho Team", players: ["Jocimar Daniel","Luciana Wada","Fernando Egami","Gilda Kinjo","Rodrigo Floriano","Luiz Donizete dos Santos Junior","Marco Antônio","Jeferson Rocha"] },
  { nome: "Crazy Nuts", players: ["João Rodrigo Nickel","Vinicius Romanini","Marcos W Sousa","Vinicius Faccas","Daniel de Almeida","Marco Antonio Evangelista","Kleber Savoia","Adir Borin Junior"] },
  { nome: "Arena Poker", players: ["Renato Favarim","Hélio Diniz","Fabiano Aparecido dos Santos Ramos","Emerson Tesuo Sato","Aline Anibal","Devanil Vilanova","Marcio Recchia","Josimar Zininho"] },
  { nome: "Poker Barão", players: ["Wiliian Henrique Bernardo","Lazaro Cesar Siqueira","Eder Cardillo Barbosa","Caio Turner","João Guilherne","Igor Camargo","Breno Morais","Adrian Moro Moz"] },
  { nome: "Esporte da Mente Zero 1", players: ["Linconl Carlos dos Santos","Vinicius Ramos Silva","Adriano Henrique Moretti","Alejandro Parra","Eduardo Yoshi","Sandro Roberto Disselle","Fernando Seike","Jonathas Leles"] },
  { nome: "Marcão 42 Poker Team", players: ["Rogerio Carnieli","Marco Antonio Mendes","Eduardo Fonseca","Felipe Justo","Geraldo Pereira","Diego Rodrigues","Igor Rodrigues","Leonardo Migliorança"] },
  { nome: "Garagentos", players: ["Ricardo Schiavo","Waldenei Silva","Guilherme Mendonça","José Navarrete","Sergio B Barbosa","Ricardo Borin","Guilherme Drumond","Anesio Junqueira"] },
  { nome: "Pesadelo", players: ["Kleber Neves","Ricardo Rodrigues Coutinho","Ademir Lopes Soares","Wellington Andrade","Jeferson Carlos","Eduardo Agostini","Igor Pedrotti","Ricardo Gonçalves Ferreira"] },
  { nome: "Call por Blefe", players: ["Pedro Bertolino","Felipe Ferraz","Matheus Chierice","Renan Rodrigues dos Santos","Marcos Satoshi Odo","Carolina da Fonseca Torelli","David Thiago","Fabio Chirice"] },
  { nome: "Business Poker", players: ["Geraldo Magela Júnior","Eric Silveira","Renne Vedrossi","Thiago Machado de Camargo","Celso Roberto Franco de Camargo","Alcides Teixeira","Volnei Serafim","André Assad Mell"] },
  { nome: "Fênix", players: ["André Tarifa","Leandro Cesar","Denis de Andrade","Ricardo Oliveira","Helena Gentil","Wlelis Silva","Angelica","Luiza"] },
];

const insertTeam = db.prepare('INSERT INTO teams (etapa_id, nome, registration_token) VALUES (?, ?, ?)');
const insertPlayer = db.prepare('INSERT INTO players (team_id, nome) VALUES (?, ?)');

const teamMap = {};
const transaction1 = db.transaction(() => {
  for (const team of teamsData) {
    const token = crypto.randomUUID();
    const result = insertTeam.run(etapaId, team.nome, token);
    const teamId = result.lastInsertRowid;
    teamMap[team.nome] = teamId;
    const playerMap = {};
    for (const player of team.players) {
      const pResult = insertPlayer.run(teamId, player);
      playerMap[player] = pResult.lastInsertRowid;
    }
    teamMap[team.nome + '_players'] = playerMap;
    console.log(`  ${team.nome}: ${team.players.length} jogadores`);
  }
});
transaction1();
console.log(`${teamsData.length} equipes cadastradas.\n`);

// ── HELPER: find player ID ──
function fp(name, teamName) {
  const players = teamMap[teamName + '_players'];
  if (!players) { console.log(`WARN: Team not found: ${teamName}`); return null; }
  // Try exact
  if (players[name]) return players[name];
  // Try fuzzy
  const nameNorm = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [pName, pId] of Object.entries(players)) {
    const pNorm = pName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (pNorm.includes(nameNorm) || nameNorm.includes(pNorm)) return pId;
  }
  console.log(`WARN: Player not found: ${name} - ${teamName}`);
  return null;
}

// ── MESAS ──
const mesas = [
  { numero: 1, players: [
    [fp("Anesio Junqueira","Garagentos"), 30],
    [fp("Wlelis Silva","Fênix"), 25],
    [fp("Alcides Teixeira","Business Poker"), 22],
    [fp("Ademir Lopes Soares","Pesadelo"), 18],
    [fp("Carolina da Fonseca Torelli","Call por Blefe"), 15],
    [fp("Geraldo Pereira","Marcão 42 Poker Team"), 12],
    [fp("Jocimar Daniel","Leva o Restinho Team"), 10],
  ]},
  { numero: 2, players: [
    [fp("Luiz Donizete dos Santos Junior","Leva o Restinho Team"), 30],
    [fp("Pedro Bertolino","Call por Blefe"), 25],
    [fp("Thiago Machado de Camargo","Business Poker"), 22],
    [fp("Ricardo Rodrigues Coutinho","Pesadelo"), 18],
    [fp("André Tarifa","Fênix"), 15],
    [fp("Waldenei Silva","Garagentos"), 12],
    [fp("Fabiano Aparecido dos Santos Ramos","Arena Poker"), 10],
  ]},
  { numero: 3, players: [
    [fp("Ricardo Oliveira","Fênix"), 30],
    [fp("Renan Rodrigues dos Santos","Call por Blefe"), 25],
    [fp("Geraldo Magela Júnior","Business Poker"), 22],
    [fp("Hélio Diniz","Arena Poker"), 18],
    [fp("Jeferson Carlos","Pesadelo"), 15],
    [fp("Caio Turner","Poker Barão"), 12],
    [fp("Rodrigo Floriano","Leva o Restinho Team"), 10],
  ]},
  { numero: 4, players: [
    [fp("Fernando Egami","Leva o Restinho Team"), 30],
    [fp("Fabio Chirice","Call por Blefe"), 25],
    [fp("Celso Roberto Franco de Camargo","Business Poker"), 22],
    [fp("Denis de Andrade","Fênix"), 18],
    [fp("Aline Anibal","Arena Poker"), 15],
    [fp("Vinicius Ramos Silva","Esporte da Mente Zero 1"), 12],
    [fp("Adrian Moro Moz","Poker Barão"), 10],
  ]},
  { numero: 5, players: [
    [fp("Felipe Justo","Marcão 42 Poker Team"), 30],
    [fp("Leandro Cesar","Fênix"), 25],
    [fp("Luciana Wada","Leva o Restinho Team"), 22],
    [fp("Adriano Henrique Moretti","Esporte da Mente Zero 1"), 18],
    [fp("Devanil Vilanova","Arena Poker"), 15],
    [fp("João Guilherne","Poker Barão"), 12],
    [fp("Renne Vedrossi","Business Poker"), 10],
  ]},
  { numero: 6, players: [
    [fp("Angelica","Fênix"), 30],
    [fp("Volnei Serafim","Business Poker"), 25],
    [fp("Eder Cardillo Barbosa","Poker Barão"), 22],
    [fp("Eduardo Fonseca","Marcão 42 Poker Team"), 18],
    [fp("José Navarrete","Garagentos"), 15],
    [fp("Gilda Kinjo","Leva o Restinho Team"), 12],
    [fp("Jonathas Leles","Esporte da Mente Zero 1"), 10],
  ]},
  { numero: 7, players: [
    [fp("Eric Silveira","Business Poker"), 30],
    [fp("Ricardo Schiavo","Garagentos"), 25],
    [fp("Wiliian Henrique Bernardo","Poker Barão"), 22],
    [fp("Sandro Roberto Disselle","Esporte da Mente Zero 1"), 18],
    [fp("Rogerio Carnieli","Marcão 42 Poker Team"), 15],
    [fp("Ricardo Gonçalves Ferreira","Pesadelo"), 12],
    [fp("Josimar Zininho","Arena Poker"), 10],
    [fp("Marco Antônio","Leva o Restinho Team"), 8],
  ]},
  { numero: 8, players: [
    [fp("Guilherme Drumond","Garagentos"), 30],
    [fp("Kleber Neves","Pesadelo"), 25],
    [fp("Matheus Chierice","Call por Blefe"), 22],
    [fp("Jeferson Rocha","Leva o Restinho Team"), 18],
    [fp("Emerson Tesuo Sato","Arena Poker"), 15],
    [fp("Lazaro Cesar Siqueira","Poker Barão"), 12],
    [fp("Eduardo Yoshi","Esporte da Mente Zero 1"), 10],
    [fp("Marco Antonio Mendes","Marcão 42 Poker Team"), 8],
  ]},
  { numero: 9, players: [
    [fp("Luiza","Fênix"), 30],
    [fp("Eduardo Agostini","Pesadelo"), 25],
    [fp("David Thiago","Call por Blefe"), 22],
    [fp("Leonardo Migliorança","Marcão 42 Poker Team"), 18],
    [fp("Linconl Carlos dos Santos","Esporte da Mente Zero 1"), 15],
    [fp("Ricardo Borin","Garagentos"), 12],
    [fp("Igor Camargo","Poker Barão"), 10],
    [fp("Renato Favarim","Arena Poker"), 8],
  ]},
  { numero: 10, players: [
    [fp("Marco Antonio Mendes","Marcão 42 Poker Team"), 30],
    [fp("Marcos Satoshi Odo","Call por Blefe"), 25],
    [fp("Guilherme Mendonça","Garagentos"), 22],
    [fp("Igor Pedrotti","Pesadelo"), 18],
    [fp("Diego Rodrigues","Marcão 42 Poker Team"), 15],
    [fp("Breno Morais","Poker Barão"), 12],
    [fp("Fernando Seike","Esporte da Mente Zero 1"), 10],
  ]},
  { numero: 11, players: [
    [fp("Sergio B Barbosa","Garagentos"), 30],
    [fp("Felipe Ferraz","Call por Blefe"), 25],
    [fp("Igor Rodrigues","Marcão 42 Poker Team"), 22],
    [fp("Helena Gentil","Fênix"), 18],
    [fp("Wellington Andrade","Pesadelo"), 15],
    [fp("Alejandro Parra","Esporte da Mente Zero 1"), 12],
    [fp("Marcio Recchia","Arena Poker"), 10],
  ]},
];

// Insert tables and seats
const insertTable = db.prepare('INSERT INTO tables_t (etapa_id, numero, phase) VALUES (?, ?, ?)');
const insertSeat = db.prepare('INSERT INTO seats (table_id, player_id, elimination_order, points) VALUES (?, ?, ?, ?)');

const transaction2 = db.transaction(() => {
  for (const mesa of mesas) {
    const tableResult = insertTable.run(etapaId, mesa.numero, 'qualifying');
    const tableId = tableResult.lastInsertRowid;
    const validPlayers = mesa.players.filter(e => e[0] !== null);
    validPlayers.forEach((entry, i) => {
      const [playerId, points] = entry;
      const position = i + 1;
      const eliminationOrder = validPlayers.length + 1 - position;
      insertSeat.run(tableId, playerId, eliminationOrder, points);
    });
    console.log(`Mesa ${mesa.numero}: ${validPlayers.length} jogadores`);
  }
});
transaction2();

// ── MESA FINAL ──
const finalResults = [
  ["Garagentos", 80],
  ["Pesadelo", 70],
  ["Fênix", 60],
  ["Business Poker", 40],
  ["Marcão 42 Poker Team", 34],
  ["Poker Barão", 30],
  ["Call por Blefe", 26],
  ["Leva o Restinho Team", 22],
];

const transaction3 = db.transaction(() => {
  const tableResult = insertTable.run(etapaId, 1, 'final');
  const tableId = tableResult.lastInsertRowid;
  finalResults.forEach((entry, i) => {
    const [teamName, points] = entry;
    const teamId = teamMap[teamName];
    // Get first player of team
    const player = db.prepare("SELECT id FROM players WHERE team_id = ? ORDER BY id LIMIT 1").get(teamId);
    if (!player) { console.log(`WARN: No player for ${teamName}`); return; }
    const eliminationOrder = 8 - i;
    insertSeat.run(tableId, player.id, eliminationOrder, points);
    console.log(`  FT ${i+1}o: ${teamName} - ${points} pts`);
  });
});
transaction3();

db.prepare("UPDATE etapas SET status = 'finished' WHERE id = ?").run(etapaId);
console.log('\nEtapa 2 completa!');
