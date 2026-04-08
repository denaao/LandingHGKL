import db from './database.js';
import { getQualifyingPoints } from './services/scoring.js';

// Find Etapa 1
const etapa = db.prepare("SELECT * FROM etapas WHERE nome = 'Etapa 1'").get();
if (!etapa) { console.log('Etapa 1 nao encontrada. Rode seed-data.js primeiro.'); process.exit(1); }

// Check if tables already exist
const existing = db.prepare('SELECT COUNT(*) as c FROM tables_t WHERE etapa_id = ?').get(etapa.id);
if (existing.c > 0) { console.log('Etapa 1 ja tem mesas cadastradas, pulando.'); process.exit(0); }

// Helper: find player by name (partial match)
function findPlayer(name, teamName) {
  const players = db.prepare(`
    SELECT p.id, p.nome, t.nome as team_nome FROM players p
    JOIN teams t ON p.team_id = t.id
    WHERE t.etapa_id = ?
  `).all(etapa.id);

  const nameNorm = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Try exact team + fuzzy name
  for (const p of players) {
    const pNorm = p.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const tNorm = p.team_nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const teamNorm = teamName ? teamName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '';
    if (pNorm.includes(nameNorm) || nameNorm.includes(pNorm)) {
      if (!teamName || tNorm.includes(teamNorm) || teamNorm.includes(tNorm)) {
        return p;
      }
    }
  }
  return null;
}

// Mesa data: position 1 = winner (30pts), position 8 = first out (8pts)
// Format: [playerName, teamName]
const mesas = [
  { numero: 1, players: [
    ["Eduardo Yoshi", "Esporte da Mente Zero 1"],
    ["Vasco Tavares", "Suprema"],
    ["Ricardo Schiavo", "Garagentos"],
    ["Rodrigo Floriano", "Leva o Restinho Team"],
    ["Julio Cesar Betim", "Pesadelo"],
    ["Renan Rodrigues dos Santos", "Call por Blefe"],
    ["Vinicius Romanini", "Crazy Nuts"],
    ["Eduardo Fonseca", "Marcão 42 Poker Team"],
  ]},
  { numero: 2, players: [
    ["Daniel de Almeida", "Crazy Nuts"],
    ["Pedro Bertolino", "Call por Blefe"],
    ["Hélio Diniz", "Arena Poker"],
    ["Luciana Wada", "Leva o Restinho Team"],
    ["Rodrigo Carmo dos Santos", "Poker Barão"],
    ["Yann do Vale Martins", "Ney Bosco"],
    ["Rafael Silva", "Suprema"],
    ["Breno Morais", "Paga o Careca"],
  ]},
  { numero: 3, players: [
    ["Thiago Ferreira Cardoso", "Arena Poker"],
    ["Felipe Justo", "Marcão 42 Poker Team"],
    ["Gustavo Luiz Machado", "Paga o Careca"],
    ["Felipe Ferraz", "Call por Blefe"],
    ["Jonathas Leles", "Esporte da Mente Zero 1"],
    ["Guilherme Ommundsen", "Ney Bosco"],
    ["Luciano Takahashi", "Business Poker"],
    ["Fernando Alvaladejo", "Poker Barão"],
  ]},
  { numero: 4, players: [
    ["Alejandro Parra", "Esporte da Mente Zero 1"],
    ["Andre Assad Mell", "Business Poker"],
    ["Waldenei Silva", "Garagentos"],
    ["Cahuê Silva", "Paga o Careca"],
    ["Ney Bosco", "Ney Bosco"],
    ["Felype Magnusson Dantas", "Pesadelo"],
    ["Renan Gustavo da Silva", "Poker Barão"],
    [null, null], // FOI EMBORA
  ]},
  { numero: 5, players: [
    ["Jamilson Everton Domenica", "Pesadelo"],
    ["Wiliian Henrique Bernardo", "Poker Barão"],
    ["Josimar Zininho", "Arena Poker"],
    ["Gustavo Ferraz de Campos", "Call por Blefe"],
    ["Gilda Kinjo", "Leva o Restinho Team"],
    ["Caio Fernandes", "Paga o Careca"],
    ["Vinicius Ramos Silva", "Esporte da Mente Zero 1"],
    ["Leonardo Migliorança", "Marcão 42 Poker Team"],
  ]},
  { numero: 6, players: [
    ["Adriano Henrique Moretti", "Esporte da Mente Zero 1"],
    ["André Soares Gonzales", "Poker Barão"],
    ["Adir Borin Junior", "Crazy Nuts"],
    ["José Navarrete", "Garagentos"],
    ["Vladimir Rondelli", "Paga o Careca"],
    ["Wellington Andrade", "Pesadelo"],
    ["Carlos Paiva", "Ney Bosco"],
    ["Geraldo Magela Júnior", "Business Poker"],
  ]},
  { numero: 7, players: [
    ["Guilherme Barbi", "Garagentos"],
    ["Ricardo Rodrigues Coutinho", "Pesadelo"],
    ["Jocimar Daniel", "Leva o Restinho Team"],
    ["Sandro Roberto Disselle", "Esporte da Mente Zero 1"],
    ["Eric Silveira", "Business Poker"],
    ["Matheus Chierice", "Call por Blefe"],
    ["Rogerio Carnieli", "Marcão 42 Poker Team"],
    ["Maciel Aparecido Zininho", "Arena Poker"],
  ]},
  { numero: 8, players: [
    ["Michel Marcos Eloi", "Arena Poker"],
    ["Arnaldo", "Suprema"],
    ["Thiago Machado de Camargo", "Business Poker"],
    ["Marcos W Sousa", "Crazy Nuts"],
    ["Danilo Mendes", "Marcão 42 Poker Team"],
    ["Carolina da Fonseca Torelli", "Call por Blefe"],
    ["Pablo Lobo", "Garagentos"],
    ["Guilherme Santos", "Ney Bosco"],
  ]},
  { numero: 9, players: [
    ["Julio Cesar", "Suprema"],
    ["Gabriel Draetta", "Garagentos"],
    ["Reginaldo Silveira", "Marcão 42 Poker Team"],
    [null, null], // FOI EMBORA
    ["Emerson Weber Sampaio", "Ney Bosco"],
    ["Marcos Satoshi Odo", "Call por Blefe"],
    ["Vinicius Faccas", "Crazy Nuts"],
    ["Renne Vedrossi", "Business Poker"],
  ]},
  { numero: 10, players: [
    ["Marco Antonio Mendes", "Marcão 42 Poker Team"],
    ["Guilherme Mendonça", "Garagentos"],
    ["Fabiano Ap dos Santos Ramos", "Arena Poker"],
    ["Linconl Carlos dos Santos", "Esporte da Mente Zero 1"],
    ["Marcos W Sousa", "Crazy Nuts"],
    ["Celso Roberto Franco de Camargo", "Business Poker"],
    ["Roberto Moriya", "Leva o Restinho Team"],
    ["Ricardo Gonçalves Ferreira", "Pesadelo"],
  ]},
  { numero: 11, players: [
    ["Breno Lenzi", "Suprema"],
    ["Luiz Donizete dos Santos Junior", "Leva o Restinho Team"],
    ["Sergio B Barbosa", "Garagentos"],
    ["Anderson Martinez de Morais", "Call por Blefe"],
    ["Marcus Vinícius Scarabucci", "Business Poker"],
    ["Eder Cardillo Barbosa", "Poker Barão"],
    ["João Henrique Amaral", "Paga o Careca"],
    ["Ademir Lopes Soares", "Pesadelo"],
  ]},
  { numero: 12, players: [
    ["Kleber Neves", "Pesadelo"],
    ["Fernando Egami", "Leva o Restinho Team"],
    ["Matheus", "Suprema"],
    ["Estefani", "Suprema"],
    ["Felipe Yuaso", "Paga o Careca"],
    ["Kleber Savoia", "Crazy Nuts"],
    ["Lazaro Cesar Siqueira", "Poker Barão"],
    ["Juliana Viana", "Ney Bosco"],
  ]},
  { numero: 13, players: [
    ["Emerson Tesuo Sato", "Arena Poker"],
    ["Ricardo Matias Petiross", "Poker Barão"],
    ["Fernando Seike", "Esporte da Mente Zero 1"],
    ["Lucas Terzi", "Marcão 42 Poker Team"],
    [null, null], // FOI EMBORA
    ["Johnny da Silva", "Ney Bosco"],
    ["Etiene Athyde", "Suprema"],
    ["João Rodrigo Nickel", "Crazy Nuts"],
  ]},
];

const insertTable = db.prepare('INSERT INTO tables_t (etapa_id, numero, phase) VALUES (?, ?, ?)');
const insertSeat = db.prepare('INSERT INTO seats (table_id, player_id, elimination_order, points) VALUES (?, ?, ?, ?)');

const transaction = db.transaction(() => {
  for (const mesa of mesas) {
    const tableResult = insertTable.run(etapa.id, mesa.numero, 'qualifying');
    const tableId = tableResult.lastInsertRowid;
    let skipped = 0;

    mesa.players.forEach((entry, i) => {
      const [playerName, teamName] = entry;
      if (!playerName) { skipped++; return; } // FOI EMBORA

      const player = findPlayer(playerName, teamName);
      if (!player) {
        console.log(`  WARN: Jogador nao encontrado: ${playerName} - ${teamName}`);
        return;
      }

      const position = i + 1; // 1 = winner, 8 = last place
      const totalPlayers = mesa.players.filter(e => e[0] !== null).length;
      const eliminationOrder = totalPlayers + 1 - position; // convert position to elimination order
      const points = getQualifyingPoints(position);

      insertSeat.run(tableId, player.id, eliminationOrder, points);
    });

    const seated = mesa.players.filter(e => e[0] !== null).length;
    console.log(`Mesa ${mesa.numero}: ${seated} jogadores inseridos`);
  }
});

transaction();

// Update etapa status to qualifying
db.prepare("UPDATE etapas SET status = 'qualifying' WHERE id = ?").run(etapa.id);
console.log('\nResultados da Etapa 1 inseridos com sucesso!');
