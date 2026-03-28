const SCORE_DEFAULT_BY_POSITION = {
	1: 120,
	2: 100,
	3: 90,
	4: 80,
	5: 70,
	6: 60,
	7: 54,
	8: 52,
	9: 50,
	10: 48,
	11: 46,
	12: 42,
	13: 40,
	14: 34,
	15: 30,
	16: 26,
	17: 24,
	18: 22,
	19: 20,
	20: 18,
	21: 16,
	22: 14,
	23: 12,
	24: 10,
};

const SCORE_HIGH_ROLLER_BY_POSITION = {
	1: 160,
	2: 120,
	3: 90,
	4: 70,
	5: 60,
	6: 50,
	7: 40,
	8: 34,
	9: 30,
	10: 26,
	11: 26,
	12: 26,
	13: 24,
	14: 24,
	15: 24,
	16: 22,
	17: 22,
	18: 22,
	19: 20,
	20: 20,
	21: 20,
	22: 20,
	23: 20,
	24: 20,
	25: 20,
	26: 20,
	27: 20,
	28: 20,
	29: 20,
	30: 20,
	31: 20,
	32: 20,
	33: 20,
	34: 20,
};

const SCORE_MAIN_EVENT_BY_POSITION = {
	1: 200,
	2: 160,
	3: 130,
	4: 110,
	5: 100,
	6: 90,
	7: 80,
	8: 70,
	9: 60,
	10: 40,
	11: 40,
	12: 40,
	13: 40,
	14: 40,
	15: 40,
	16: 40,
	17: 40,
	18: 40,
	19: 34,
	20: 34,
	21: 34,
	22: 34,
	23: 34,
	24: 34,
	25: 34,
	26: 34,
	27: 34,
	28: 30,
	29: 30,
	30: 30,
	31: 30,
	32: 30,
	33: 30,
	34: 30,
};

const SCORE_AMARELA_BY_POSITION = {
	1: 80,
	2: 70,
	3: 60,
	4: 40,
	5: 34,
	6: 30,
	7: 26,
	8: 22,
	9: 22,
	10: 18,
	11: 18,
	12: 18,
	13: 16,
	14: 16,
	15: 16,
	16: 14,
	17: 14,
	18: 14,
	19: 12,
	20: 12,
	21: 12,
	22: 12,
	23: 12,
	24: 12,
	25: 12,
	26: 12,
	27: 12,
	28: 10,
	29: 10,
	30: 10,
	31: 10,
	32: 10,
	33: 10,
	34: 10,
};

const TOURNAMENTS_BY_STAGE = {
	"Etapa 1": {
		"Last Chance": [
		"Matheus Lopo Silva",
		"Douglas Soler",
		"Erick Da Silva Costa",
		"Roberto De Oliveira",
		"Danielle Roio Loures",
		"Thiago Machado",
		"Helena Gentil",
		"Fagner Manoel Da Silva",
		"Gabriel Freire",
		"W Lelis",
		"Henrique Eizono",
		"Flavio De Araujo Paiva",
		"Rafael Loures",
		"Vitor Torres",
		"Andre Victor Goncalves De Souza",
		"Silverio Gentil",
		"Giordano Casteleti",
		"Carolina Da Fonseca Torelli",
		"Eduardo Yoshi",
		"Bruno Gambaro Pereira",
		"Mauro Rodrigues (zoio)",
		"Eduardo Aparecido Vieira",
		"Lazaro Cesar Siqueira",
		"Gilda Harumi Kimjo",
		"Ney Bosco",
		"Henrique Seabra",
		"Fernando Egami",
		"Felipe Yhara De Andrade",
		"Rauani Stivanillo",
		"Lair Lira",
		"Marcelei Adriana Silva",
		"Frabricio Batista",
		"Denao King",
		"David Thiago Emidio Dos Santos",
		],
		"Main Event": [
		"Santiago",
		"Douglas Soler",
		"Rafael Silva",
		"Nelson Junior",
		"Lair Lira",
		"Felipe Castanho De Oliveira Ferraz",
		"Carlos Ceroni",
		"Jose Maldonado",
		"Leonardo de Souza Mariano",
		"Carolina da Fonseca Torelli",
		"Eduardo Yoshi",
		"Alex Pereira de lima",
		"Matheus Lucena Francesquini",
		"Robson Andrade",
		"Gabrielle Paixao",
		"Arturo Duran",
		"Vinicius Varella",
		"Joao Rodrigo Nickel",
		"Breno do Nascimento",
		"Bruno Hirata",
		"",
		"Leandro Magui",
		"Rafael Marcos dos Santos",
		"Sandro Roberto Disselle",
		"Murilo Ceroni",
		"Matheus Chierec",
		"Giordano Casteleti",
		"Daniel Mote",
		"Antonio Jose Bassani",
		"Bruno Gambaro Pereira",
		"Jocimar Daniel",
		"Henry Julian Samurai",
		"Adriano Henrique Moretti",
		"Denao King",
		],
		"High Roller": [
		"Guilherme Santos",
		"Douglas Soler",
		"Arnaldo Fernandes",
		"Paulo Cesar capretti",
		"Jose Heraldo Vaughi Jr",
		"Marcelo Lanza",
		"Andre Gama",
		"Helio Bonatti",
		"Gabriel Afonso",
		"Eduardo Mamsho",
		"Joao Henrique Amaral",
		"Gustavo Luiz Machado",
		"Daniel Mote",
		"Breno Do Nascimento",
		"Kaue Raulli",
		"Linconi Carlos Dos Santos",
		"Cahue Silva",
		"Carlos Augusto Cavalheiro",
		"Matheus Nalesso",
		"Rafael Marcos Dos Santos",
		"Leandro Magui",
		"Gustavo Luiz Machado",
		"Helena Gentil",
		"Julio Cesar De Moraes Almeida",
		"Felipe Castanho De Oliveira Ferraz",
		"Thalisson Kaike",
		"Luciano Taka",
		"Junior Pattaro",
		],
	},
	"Etapa 2": {
		"High Roller": [
			"Andre Gama",
			"Rodrigo Clemente",
			"Rauani Stivanillo",
			"Vasco Tavares (suprema)",
			"Andre Moura Tarifa",
			"Wlelis",
			"Eduardo Yoshi",
			"Rafael Marcos Dos Santos",
			"Fernando Yudi Seike",
			"Pedro Santos",
			"Daniel Mote",
			"Vitor Torres",
			"Volnei Serafim",
			"Kaue Raulli",
			"Tanaka Yamaguchi",
			"Denao King",
			"Geraldo Magela",
			"Henry Julian Samurai",
		],
		"Main Event": [
			"Jaime Silva",
			"Daniel Fuzeto",
			"Wellington Andrade Da Silva",
			"Reginaldo Martins Da Silveira",
			"Vinicius Romanini",
			"Rafael Silva ( Suprema)",
			"Lucas Molina",
			"Eduardo Fonseca",
			"Etiene",
			"Rogerio Carnieri",
			"Carolina Da Fonseca Torelli",
			"Sandro Roberto Disselle",
			"Rauan Matheus",
			"Leandro Cesar De Araujo Melo",
			"Rodrigo Clemente",
			"Marcos Carneiro Antunes",
			"Helena Gentil",
			"Ariani Rinaldi",
			"Jonathas Castelani",
			"Bruno Gambaro Pereira",
			"Arthur Orse",
			"Fred Garlip",
			"Sergio Roberto Mota",
			"Wlelis",
			"Santiago",
			"Felipe Fernandes",
			"Claudio Silva",
			"Ricardo Oliveira",
			"Alcides Teixeira Vasconcelos Jr",
			"Giordano Casteleti",
			"Eduardo Yoshi",
		],
		"Super 50 - 1": [
			"Welton Borges Torelli",
			"Andre Moura Tarifa",
			"Vladimir Luis Rondelli Cardoso De Lima",
			"Alex Pereira De Lima",
			"Eduardo Nogueira",
			"Bruno Gambaro Pereira",
			"Santiago",
			"Felipe Fernandes",
			"Giordano Casteleti",
			"Gabriel De Lima Rodrigues Calado",
			"Wlelis",
			"Rafael Silva",
		],
		"Freeroll": [
			"David Thiago Emidio Dos Santos",
			"Rogerio Carnieri",
			"Eduardo Nogueira",
			"Joao Murilo Padovani",
			"Thiago Machado",
			"Helio Diniz",
			"Davanil Vila Nova",
			"Guilherme Jorge De Mendonca",
			"Fabiana Lopes Da Silva",
			"Aline Anibal",
			"Geovana Brandao",
			"Matheus de Lima Bosi",
			"Rauan Matheus",
			"Oponente (nao deixou nome)",
			"Rodrigo de Gaspari",
			"Oponente 2 (nao deixou nome)",
			"Vitor Henrique de Mattos",
			"Gabriel Freire",
			"Jocimar Daniel",
			"Gustavo Sopram",
			"Guilherme Moreno",
			"Lucas Augusto de Oliveira",
			"Andre Moura Tarifa",
			"Felipe Pires dos santos",
			"Fabiano Ramos",
			"Alex Pereira De lima",
			"Felipe Ferraz",
		],
		"Super 50 - 2": [
			"Felipe Suzuki",
			"Rodrigo Clemente",
			"Adrian Moz",
			"Gabriel Freire",
			"Victoria Avila",
			"Eduardo Nogueira",
			"Joao Guilherne Teixeira",
			"Diego Azenha",
			"Rauan Matheus",
			"Alex Pereira de LIma",
			"Cristofer Rogel",
			"Andre Moura Tarifa",
		],
	},
};

function getPointsByPosition(pos, tournamentName) {
	const tournamentKey = String(tournamentName || '').toLowerCase();

	if (tournamentKey === "last chance" || tournamentKey === "freeroll" || tournamentKey.startsWith("super 50")) {
		return SCORE_AMARELA_BY_POSITION[pos] || 0;
	}

	if (tournamentName === "High Roller") {
		return SCORE_HIGH_ROLLER_BY_POSITION[pos] || 0;
	}

	if (tournamentName === "Main Event") {
		return SCORE_MAIN_EVENT_BY_POSITION[pos] || 0;
	}

	return SCORE_DEFAULT_BY_POSITION[pos] || 0;
}

function normalizePlayerKey(name) {
	return String(name || "")
		.trim()
		.replace(/\(.*?\)/g, "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, "")
		.trim();
}

function buildRanking() {
	const players = new Map();

	Object.entries(TOURNAMENTS_BY_STAGE).forEach(([stageName, tournaments]) => {
		Object.entries(tournaments).forEach(([tournamentName, positions]) => {
			const seenInTournament = new Set();

			positions.forEach((rawName, index) => {
				const displayName = String(rawName || "").trim();
				if (!displayName) return;

				const playerKey = normalizePlayerKey(displayName);
				if (!playerKey) return;

				// Se o nome aparece duas vezes no mesmo torneio, mantemos a melhor colocacao (primeira ocorrencia).
				if (seenInTournament.has(playerKey)) return;
				seenInTournament.add(playerKey);

				const pos = index + 1;
				const points = getPointsByPosition(pos, tournamentName);

				if (!players.has(playerKey)) {
					players.set(playerKey, {
						nome: displayName,
						total: 0,
						etapasMap: new Map(),
					});
				}

				const player = players.get(playerKey);
				player.total += points;

				if (!player.etapasMap.has(stageName)) {
					player.etapasMap.set(stageName, {
						nome: stageName,
						pontos: 0,
						torneios: [],
					});
				}

				const stage = player.etapasMap.get(stageName);
				stage.pontos += points;
				stage.torneios.push({ nome: tournamentName, pontos: points, pos });
			});
		});
	});

	return Array.from(players.values())
		.map((p) => ({
			nome: p.nome,
			total: p.total,
			etapas: Array.from(p.etapasMap.values()).sort((a, b) => a.nome.localeCompare(b.nome)),
		}))
		.sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}

export default buildRanking();
