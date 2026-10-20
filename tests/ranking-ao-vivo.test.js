import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRanking } from '../ranking-data.js';
import { juntarRanking, premioDoRanking, TEMPORADA_HISTORICO } from '../services/ranking-ao-vivo.js';

const E5 = '9fa30297-2e53-46bd-8b10-ae282ab2ddae';
const E6 = '906d4fb7-8cfb-446e-8231-34a32b623119';
const etapas = [{ id: E5, nome: '5ª Etapa', ordem: 5 }, { id: E6, nome: '6ª Etapa', ordem: 6 }];
const feed = (jogadores = [], arrecadacao = [], eventId = TEMPORADA_HISTORICO) => ({ temporada: { eventId, nome: 'Home Game KING Live' }, etapas, jogadores, arrecadacao });
const jog = (nome, torneios) => ({ nome, pontos: torneios.reduce((s, t) => s + t.pontos, 0), torneios });
const hist = () => buildRanking();
const achar = (r, nome) => r.find((p) => p.nome === nome);

test('sem resultados na 6ª o ranking é idêntico ao histórico (Etapa 5 do StackPlus ignorada)', () => {
  const e5 = [jog('Gustavo Greco', [{ etapaId: E5, torneio: 'Main Event', posicao: 1, pontos: 200 }])];
  assert.deepEqual(juntarRanking(hist(), feed(e5)), hist());
});

test('etapa ignorada não soma', () => {
  const antes = achar(hist(), 'Douglas Martins Soler').total;
  const r = juntarRanking(hist(), feed([jog('Douglas Martins Soler', [{ etapaId: E5, torneio: 'Main Event', posicao: 7, pontos: 80 }])]));
  assert.equal(achar(r, 'Douglas Martins Soler').total, antes);
});

test('apelido junta no jogador do histórico', () => {
  const antes = achar(hist(), 'Douglas Martins Soler');
  const r = juntarRanking(hist(), feed([jog('Douglas Martins Soler', [{ etapaId: E6, torneio: 'High Roller', posicao: 4, pontos: 70 }])]));
  const d = achar(r, 'Douglas Martins Soler');
  assert.equal(d.total, antes.total + 70);
  assert.deepEqual(d.etapas.at(-1), { nome: '6ª Etapa', pontos: 70, torneios: [{ nome: 'High Roller', pontos: 70, pos: 4 }] });
  assert.equal(r.filter((p) => p.nome.toLowerCase().includes('soler')).length, 1);
});

test('adrian e fred ligam ao histórico', () => {
  const r = juntarRanking(hist(), feed([
    jog('Adrian Moro Moz', [{ etapaId: E6, torneio: 'Main Event', posicao: 9, pontos: 60 }]),
    jog('Fred Garlipp', [{ etapaId: E6, torneio: 'Main Event', posicao: 10, pontos: 40 }]),
  ]));
  assert.equal(achar(r, 'Adrian Moz').total, achar(hist(), 'Adrian Moz').total + 60);
  assert.equal(achar(r, 'Fred Garlip').total, achar(hist(), 'Fred Garlip').total + 40);
  assert.equal(achar(r, 'Adrian Moro Moz'), undefined);
});

test('jogador novo entra com nome em caixa título', () => {
  const r = juntarRanking(hist(), feed([jog('BRUNO NOVAES DA PURIFICAÇÃO', [{ etapaId: E6, torneio: 'Super 50', posicao: 1, pontos: 80 }])]));
  assert.deepEqual(achar(r, 'Bruno Novaes da Purificação'), { nome: 'Bruno Novaes da Purificação', total: 80, etapas: [{ nome: '6ª Etapa', pontos: 80, torneios: [{ nome: 'Super 50', pontos: 80, pos: 1 }] }] });
});

test('outra temporada não soma histórico nem 23.641', () => {
  const f = feed([jog('Gustavo Greco', [{ etapaId: 'x', torneio: 'Main Event', posicao: 1, pontos: 200 }])], [{ etapaId: 'x', torneio: 'Main Event', status: 'RUNNING', pct: 5, garantido: 25000, totalRanking: 0 }], 'evento-2027');
  f.etapas = [{ id: 'x', nome: '1ª Etapa', ordem: 1 }];
  assert.deepEqual(juntarRanking(hist(), f), [{ nome: 'Gustavo Greco', total: 200, etapas: [{ nome: '1ª Etapa', pontos: 200, torneios: [{ nome: 'Main Event', pontos: 200, pos: 1 }] }] }]);
  assert.equal(premioDoRanking(f).total, 1250);
});

test('premio pela regra da planilha', () => {
  const p = premioDoRanking(feed([], [
    { etapaId: E6, torneio: 'High Roller', status: 'RUNNING', pct: 5, garantido: 25000, totalRanking: 300 },
    { etapaId: E6, torneio: 'Main Event', status: 'REGISTRATION', pct: 5, garantido: 25000, totalRanking: 0 },
    { etapaId: E6, torneio: 'Super 50', status: 'RUNNING', pct: 5, garantido: null, totalRanking: 169 },
    { etapaId: E5, torneio: 'Main Event', status: 'FINISHED', pct: 5, garantido: 25000, totalRanking: 889.5 },
  ]));
  assert.equal(p.total, 25060);
  assert.deepEqual(p.premios, [
    { posicao: 1, pct: 35, valor: 8771 },
    { posicao: 2, pct: 25, valor: 6265 },
    { posicao: 3, pct: 18, valor: 4510.8 },
    { posicao: 4, pct: 12, valor: 3007.2 },
    { posicao: 5, pct: 10, valor: 2506 },
  ]);
});
