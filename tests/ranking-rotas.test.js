import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRanking } from '../ranking-data.js';
import { respostaRanking, respostaPremio } from '../services/ranking-rotas.js';

const feedQueCai = { get: async () => { throw new Error('StackPlus fora'); } };

test('sem StackPlus devolve o histórico', async () => {
  assert.deepEqual(await respostaRanking(feedQueCai, buildRanking()), buildRanking());
});

test('sem StackPlus o prêmio é a base 23.641', async () => {
  const p = await respostaPremio(feedQueCai);
  assert.equal(p.total, 23641);
  assert.equal(p.premios[0].valor, 8274.35);
});

test('com StackPlus junta o feed', async () => {
  const feed = { get: async () => ({ temporada: { eventId: '226fabbf-2809-4a13-b7e0-f2bc79be4c5e' }, etapas: [{ id: 'e6', nome: '6ª Etapa', ordem: 6 }], jogadores: [{ nome: 'Novo Jogador', pontos: 80, torneios: [{ etapaId: 'e6', torneio: 'Super 50', posicao: 1, pontos: 80 }] }], arrecadacao: [] }) };
  const r = await respostaRanking(feed, buildRanking());
  assert.equal(r.length, buildRanking().length + 1);
});
