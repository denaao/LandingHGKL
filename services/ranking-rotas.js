import { juntarRanking, premioDoRanking, TEMPORADA_HISTORICO } from './ranking-ao-vivo.js';

const RANKING_JOGADORES = '/public/equipes/ranking-jogadores';
// Sem StackPlus (fora do ar logo depois de um deploy): o site mostra o histórico, como antes.
const SO_HISTORICO = { temporada: { eventId: TEMPORADA_HISTORICO }, etapas: [], jogadores: [], arrecadacao: [] };

export async function respostaRanking(feed, historico) {
  try {
    return juntarRanking(historico, await feed.get(RANKING_JOGADORES));
  } catch (e) {
    console.error('[ranking] StackPlus indisponível, servindo histórico:', e.message);
    return historico;
  }
}

export async function respostaPremio(feed) {
  try {
    return premioDoRanking(await feed.get(RANKING_JOGADORES));
  } catch (e) {
    console.error('[ranking] StackPlus indisponível, servindo arrecadado do histórico:', e.message);
    return premioDoRanking(SO_HISTORICO);
  }
}
