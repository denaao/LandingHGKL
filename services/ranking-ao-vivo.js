import { normalizePlayerKey, toTitleCase, PLAYER_DISPLAY_NAMES } from '../ranking-data.js';

// Ranking de Jogadores = histórico digitado (ranking-data.js, temporada 2026) +
// StackPlus ao vivo (6ª etapa em diante). O histórico só vale na temporada 2026:
// em 2027 o feed devolve outro evento e o site mostra só o StackPlus.
export const TEMPORADA_HISTORICO = '226fabbf-2809-4a13-b7e0-f2bc79be4c5e';
// Etapas do StackPlus que já estão no ranking-data.js (Etapa 5): não contam de novo.
export const ETAPAS_NO_HISTORICO = ['9fa30297-2e53-46bd-8b10-ae282ab2ddae'];
// Arrecadado das Etapas 1–5 pela planilha (5% de cada torneio que conta).
export const ARRECADADO_HISTORICO = 23641;
export const PCT_PREMIOS = [35, 25, 18, 12, 10];

const centavos = (v) => Math.round(v * 100) / 100;

function ehTemporadaHistorico(feed) {
  return feed?.temporada?.eventId === TEMPORADA_HISTORICO;
}

function etapaConta(feed, etapaId) {
  return !(ehTemporadaHistorico(feed) && ETAPAS_NO_HISTORICO.includes(etapaId));
}

export function juntarRanking(historico, feed) {
  const base = ehTemporadaHistorico(feed) ? historico : [];
  const jogadores = new Map(base.map((p) => [normalizePlayerKey(p.nome), {
    nome: p.nome, total: p.total, etapas: p.etapas.map((e) => ({ ...e, torneios: [...e.torneios] })),
  }]));
  const etapas = new Map((feed.etapas || []).map((e) => [e.id, e]));
  const ordem = (id) => etapas.get(id)?.ordem ?? Number.MAX_SAFE_INTEGER;

  for (const j of feed.jogadores || []) {
    const torneios = j.torneios.filter((t) => t.pontos > 0 && etapaConta(feed, t.etapaId));
    if (!torneios.length) continue;
    const chave = normalizePlayerKey(j.nome);
    if (!jogadores.has(chave)) {
      jogadores.set(chave, { nome: toTitleCase(PLAYER_DISPLAY_NAMES.get(chave) || j.nome), total: 0, etapas: [] });
    }
    const p = jogadores.get(chave);
    const porEtapa = new Map();
    for (const t of [...torneios].sort((a, b) => ordem(a.etapaId) - ordem(b.etapaId))) {
      if (!porEtapa.has(t.etapaId)) porEtapa.set(t.etapaId, { nome: etapas.get(t.etapaId)?.nome ?? 'Etapa', pontos: 0, torneios: [] });
      const e = porEtapa.get(t.etapaId);
      e.pontos = centavos(e.pontos + t.pontos);
      e.torneios.push({ nome: t.torneio, pontos: t.pontos, pos: t.posicao });
      p.total = centavos(p.total + t.pontos);
    }
    p.etapas.push(...porEtapa.values());
  }

  return [...jogadores.values()]
    .filter((p) => p.total > 0)
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}

// Regra da planilha: com garantido, pct × garantido assim que o torneio começa;
// sem garantido, o que o StackPlus separou para o ranking (totalRanking).
export function premioDoRanking(feed) {
  let total = ehTemporadaHistorico(feed) ? ARRECADADO_HISTORICO : 0;
  for (const t of feed.arrecadacao || []) {
    if (t.status === 'CANCELED' || !etapaConta(feed, t.etapaId)) continue;
    if (t.garantido != null) {
      if (t.status !== 'REGISTRATION') total += (t.pct / 100) * t.garantido;
    } else {
      total += t.totalRanking;
    }
  }
  total = centavos(total);
  return {
    total,
    premios: PCT_PREMIOS.map((pct, i) => ({ posicao: i + 1, pct, valor: centavos((total * pct) / 100) })),
  };
}
