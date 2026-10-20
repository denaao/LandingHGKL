// Converte o feed do StackPlus para o JSON que ranking-batalha.html e a seção
// Batalha HG do index.html já consomem (o mesmo das rotas SQLite antigas).

const FASE = { QUALIFYING: 'qualifying', FINAL: 'final' };

// Nomes vêm do StackPlus (qualquer um cria equipe pelo app) e as páginas montam
// HTML com innerHTML: todo texto sai escapado daqui.
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Só pergunta ao StackPlus por etapa que existe na temporada (id inventado não gasta a cota do feed).
export function etapaDaTemporada(temporada, id) {
  return temporada.etapas.some((e) => e.id === id);
}

export function etapasDoFeed(temporada) {
  return [...temporada.etapas].reverse().map((e) => ({ id: e.id, nome: esc(e.nome), status: String(e.status).toLowerCase() }));
}

export function rankingGeralDoFeed(temporada) {
  return temporada.equipes.map((e) => ({
    team_nome: esc(e.nome),
    total_points: e.total,
    etapas: e.etapas.map((x) => ({ nome: esc(x.nome), points: x.pontos })),
  }));
}

export function rankingEtapaDoFeed(classificacao) {
  return classificacao.equipes.map((e) => ({
    team_id: esc(e.nome),
    team_nome: esc(e.nome),
    qualifying_points: e.classificatoria,
    final_points: e.final,
    total_points: e.total,
    details: e.detalhes.map((d) => ({
      player_nome: esc(d.jogador), mesa: d.mesa, phase: FASE[d.fase] ?? 'qualifying', position: d.posicao, points: d.pontos,
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
        player_nome: esc(j.jogador),
        team_nome: esc(j.equipe),
        elimination_order: j.eliminado ? total + 1 - j.posicao : null,
        points: j.pontos ?? 0,
      })),
    };
  });
}
