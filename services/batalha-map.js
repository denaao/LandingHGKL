// Converte o feed do StackPlus para o JSON que ranking-batalha.html e a seção
// Batalha HG do index.html já consomem (o mesmo das rotas SQLite antigas).

const FASE = { QUALIFYING: 'qualifying', FINAL: 'final' };

export function etapasDoFeed(temporada) {
  return [...temporada.etapas].reverse().map((e) => ({ id: e.id, nome: e.nome, status: String(e.status).toLowerCase() }));
}

export function rankingGeralDoFeed(temporada) {
  return temporada.equipes.map((e) => ({
    team_nome: e.nome,
    total_points: e.total,
    etapas: e.etapas.map((x) => ({ nome: x.nome, points: x.pontos })),
  }));
}

export function rankingEtapaDoFeed(classificacao) {
  return classificacao.equipes.map((e) => ({
    team_id: e.nome,
    team_nome: e.nome,
    qualifying_points: e.classificatoria,
    final_points: e.final,
    total_points: e.total,
    details: e.detalhes.map((d) => ({
      player_nome: d.jogador, mesa: d.mesa, phase: FASE[d.fase] ?? 'qualifying', position: d.posicao, points: d.pontos,
    })),
  }));
}

// A página recalcula a posição como `total + 1 - elimination_order`; aqui é o inverso.
export function mesasDoFeed({ mesas }) {
  return mesas.map((m) => {
    const total = m.jogadores.length;
    return {
      numero: m.numero,
      phase: FASE[m.fase] ?? 'qualifying',
      seats: m.jogadores.map((j) => ({
        player_nome: j.jogador,
        team_nome: j.equipe,
        elimination_order: j.eliminado ? total + 1 - j.posicao : null,
        points: j.pontos ?? 0,
      })),
    };
  });
}
