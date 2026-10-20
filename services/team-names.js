// Nomes variantes que devem ser tratados como o mesmo time
const TEAM_NAME_ALIASES = {
  'Esporte da mente 01':  'Esporte da Mente Zero 1',
  'Leva o restinho':      'Leva o Restinho Team',
  'Bussines Poker':       'Business Poker',
  'Fenix Poker':          'Fênix',
  'Barão Poker':          'Poker Barão',
};

// Nome oficial da equipe: sem espaço sobrando e com o alias aplicado.
export function canonicalTeamName(nome) {
  const limpo = String(nome).trim().replace(/\s+/g, ' ');
  return TEAM_NAME_ALIASES[limpo] || limpo;
}
