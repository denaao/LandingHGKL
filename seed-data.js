import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import db from './db/database.js';

// ── ADMIN USER ──
const username = process.env.ADMIN_USERNAME || 'admin';
const password = process.env.ADMIN_PASSWORD || 'hgkl2026';
const existing = db.prepare('SELECT * FROM admin WHERE username = ?').get(username);
if (existing) {
  db.prepare('UPDATE admin SET password_hash = ? WHERE username = ?').run(bcrypt.hashSync(password, 10), username);
} else {
  db.prepare('INSERT INTO admin (username, password_hash) VALUES (?, ?)').run(username, bcrypt.hashSync(password, 10));
}
console.log(`Admin: ${username} / ${password}`);

// ── CHECK IF ETAPA 3 ALREADY EXISTS ──
const etapaExists = db.prepare("SELECT * FROM etapas WHERE nome = 'Etapa 3'").get();
if (etapaExists) {
  console.log('Etapa 3 ja existe, pulando seed de dados.');
  process.exit(0);
}

// ── ETAPA 3 ──
const etapaResult = db.prepare("INSERT INTO etapas (nome) VALUES ('Etapa 3')").run();
const etapaId = etapaResult.lastInsertRowid;
console.log(`Etapa 3 criada (id=${etapaId})`);

// ── TEAMS + PLAYERS ──
const teams = [
  { nome: "Crazy Nuts", players: ["João Rodrigo Nickel","Vinicius Romanini","Marcos W Sousa","Vinicius Faccas","Daniel de Almeida","Marco Antonio Evangelista","Kleber Savoia","Adir Borin Junior"] },
  { nome: "Arena Poker", players: ["Renato Favarim","Hélio Diniz","Fabiano Ap dos Santos Ramos","Thiago Ferreira Cardoso","Maciel Aparecido Zininho","Michel Marcos Eloi","Emerson Tesuo Sato","Josimar Zininho"] },
  { nome: "Poker Barão", players: ["Wiliian Henrique Bernardo","Fernando Alvaladejo","Lazaro Cesar Siqueira","Eder Cardillo Barbosa","Renan Gustavo da Silva","Rodrigo Carmo dos Santos","Ricardo Matias Petiross","André Soares Gonzales"] },
  { nome: "Esporte da Mente Zero 1", players: ["Linconl Carlos dos Santos","Vinicius Ramos Silva","Adriano Henrique Moretti","Alejandro Parra","Eduardo Yoshi","Sandro Roberto Disselle","Fernando Seike","Jonathas Leles"] },
  { nome: "Paga o Careca", players: ["Adrian Moro Moz","Breno Morais","João Henrique Amaral","Gustavo Luiz Machado","Caio Fernandes","Felipe Yuaso","Vladimir Rondelli","Cahuê Silva"] },
  { nome: "Marcão 42 Poker Team", players: ["Rogerio Carnieli","Danilo Mendes","Lucas Terzi","Marco Antonio Mendes","Eduardo Fonseca","Reginaldo Silveira","Felipe Justo","Leonardo Migliorança"] },
  { nome: "Garagentos", players: ["Ricardo Schiavo","Pablo Lobo","Waldenei Silva","Gabriel Draetta","Guilherme Mendonça","José Navarrete","Sergio B Barbosa","Guilherme Barbi"] },
  { nome: "Pesadelo", players: ["Kleber Neves","Ricardo Rodrigues Coutinho","Jamilson Everton Domenica","Ademir Lopes Soares","Julio Cesar Betim","Wellington Andrade","Felype Magnusson Dantas","Ricardo Gonçalves Ferreira"] },
  { nome: "Call por Blefe", players: ["Pedro Bertolino","Gustavo Ferraz de Campos","Felipe Ferraz","Matheus Chierice","Renan Rodrigues dos Santos","Marcos Satoshi Odo","Carolina da Fonseca Torelli","Anderson Martinez de Morais"] },
  { nome: "Business Poker", players: ["Geraldo Magela Júnior","Eric Silveira","Marcus Vinícius Scarabucci","Luciano Takahashi","Renne Vedrossi","Thiago Machado de Camargo","Celso Roberto Franco de Camargo","Andre Assad Mell"] },
  { nome: "Suprema", players: ["Rafael Silva","Breno Lenzi","Etiene Athyde","Matheus","Vasco Tavares","Estefani","Arnaldo","Julio Cesar"] },
  { nome: "Ney Bosco", players: ["Juliana Viana","Carlos Paiva","Johnny da Silva","Guilherme Ommundsen","Emerson Weber Sampaio","Yann do Vale Martins","Guilherme Santos","Ney Bosco"] },
  { nome: "Leva o Restinho Team", players: ["Jocimar Daniel","Luciana Wada","Fernando Egami","Gilda Kinjo","Rodrigo Floriano","Yang Sup Choi","Luiz Donizete dos Santos Junior","Roberto Moriya"] },
];

const insertTeam = db.prepare('INSERT INTO teams (etapa_id, nome, registration_token) VALUES (?, ?, ?)');
const insertPlayer = db.prepare('INSERT INTO players (team_id, nome) VALUES (?, ?)');

const transaction = db.transaction(() => {
  for (const team of teams) {
    const token = crypto.randomUUID();
    const result = insertTeam.run(etapaId, team.nome, token);
    const teamId = result.lastInsertRowid;
    for (const player of team.players) {
      insertPlayer.run(teamId, player);
    }
    console.log(`  ${team.nome}: 8 jogadores (token: ${token})`);
  }
});
transaction();

console.log(`\n${teams.length} equipes cadastradas na Etapa 3.`);
