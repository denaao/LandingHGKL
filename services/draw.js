// Draw algorithm: distribute players across tables
// Constraint: no two players from the same team at the same table
// Each table has exactly 8 players

export function executeDraw(teams) {
  // teams = [{ id, nome, players: [{ id, nome }] }]
  const N = teams.length; // number of teams = number of tables

  if (N < 2) throw new Error('Precisa de pelo menos 2 equipes para o sorteio');

  for (const team of teams) {
    if (team.players.length !== 8) {
      throw new Error(`Equipe "${team.nome}" não tem 8 jogadores (tem ${team.players.length})`);
    }
  }

  // Shuffle players within each team
  const shuffledTeams = teams.map(team => ({
    ...team,
    players: shuffle([...team.players])
  }));

  // Create N tables
  const tables = Array.from({ length: N }, (_, i) => ({
    numero: i + 1,
    players: []
  }));

  // Rotation assignment: player j of team i goes to table (i + j) % N
  // This guarantees no two players from the same team share a table (since N >= 8)
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < 8; j++) {
      const tableIndex = (i + j) % N;
      tables[tableIndex].players.push({
        ...shuffledTeams[i].players[j],
        team_id: shuffledTeams[i].id,
        team_nome: shuffledTeams[i].nome
      });
    }
  }

  // Shuffle seat order within each table
  for (const table of tables) {
    table.players = shuffle(table.players);
  }

  return tables;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
