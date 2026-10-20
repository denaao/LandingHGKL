import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etapasDoFeed, rankingGeralDoFeed, rankingEtapaDoFeed, mesasDoFeed, etapaDaTemporada } from '../services/batalha-map.js';

const temporada = {
  temporada: { eventId: 'ev1', nome: 'KING 2026' },
  etapas: [
    { id: 't3', nome: '3a ETAPA - Batalha', status: 'FINISHED', fase: 'FINISHED' },
    { id: 't6', nome: '6ª Etapa', status: 'RUNNING', fase: 'QUALIFYING' },
  ],
  equipes: [
    { colocacao: 1, nome: 'Garagentos', total: 1073, base: 500, etapas: [{ id: 't3', nome: '3a ETAPA - Batalha', pontos: 543 }, { id: 't6', nome: '6ª Etapa', pontos: 30 }] },
    { colocacao: 2, nome: 'Crazy Nuts', total: 125, base: 125, etapas: [] },
  ],
};

test('etapasDoFeed lista da mais nova para a mais antiga', () => {
  assert.deepEqual(etapasDoFeed(temporada), [
    { id: 't6', nome: '6ª Etapa', status: 'running' },
    { id: 't3', nome: '3a ETAPA - Batalha', status: 'finished' },
  ]);
});

test('rankingGeralDoFeed no formato do ranking-geral', () => {
  assert.deepEqual(rankingGeralDoFeed(temporada), [
    { team_nome: 'Garagentos', total_points: 1073, etapas: [{ nome: '3a ETAPA - Batalha', points: 543 }, { nome: '6ª Etapa', points: 30 }] },
    { team_nome: 'Crazy Nuts', total_points: 125, etapas: [] },
  ]);
});

test('rankingEtapaDoFeed no formato do ranking da etapa', () => {
  const classificacao = {
    etapa: { id: 't6', nome: '6ª Etapa', fase: 'FINAL' },
    equipes: [{
      colocacao: 1, nome: 'Garagentos', classificatoria: 30, final: 80, total: 110,
      detalhes: [
        { jogador: 'João', mesa: 2, fase: 'QUALIFYING', posicao: 1, pontos: 30 },
        { jogador: 'João', mesa: 1, fase: 'FINAL', posicao: 1, pontos: 80 },
      ],
    }],
  };
  assert.deepEqual(rankingEtapaDoFeed(classificacao), [{
    team_id: 'Garagentos', team_nome: 'Garagentos', qualifying_points: 30, final_points: 80, total_points: 110,
    details: [
      { player_nome: 'João', mesa: 2, phase: 'qualifying', position: 1, points: 30 },
      { player_nome: 'João', mesa: 1, phase: 'final', position: 1, points: 80 },
    ],
  }]);
});

test('mesasDoFeed converte posição em ordem de eliminação', () => {
  const jogadores = Array.from({ length: 7 }, (_, i) => ({ jogador: `Vivo ${i + 1}`, equipe: 'A', eliminado: false, posicao: null, pontos: null }));
  jogadores.push({ jogador: 'Oitavo', equipe: 'B', eliminado: true, posicao: 8, pontos: 8 });
  const out = mesasDoFeed({ mesas: [{ numero: 3, fase: 'QUALIFYING', jogadores }] });
  assert.equal(out.length, 1);
  assert.equal(out[0].numero, 3);
  assert.equal(out[0].phase, 'qualifying');
  assert.equal(out[0].seats.length, 8);
  assert.deepEqual(out[0].seats[0], { player_nome: 'Vivo 1', team_nome: 'A', elimination_order: null, points: 0 });
  assert.deepEqual(out[0].seats[7], { player_nome: 'Oitavo', team_nome: 'B', elimination_order: 1, points: 8 });
});

test('nomes vindos do StackPlus saem com HTML escapado', () => {
  const t = { ...temporada, equipes: [{ colocacao: 1, nome: '<img src=x onerror=alert(1)>', total: 10, base: 10, etapas: [{ id: 't6', nome: 'Etapa "6"', pontos: 0 }] }] };
  const [linha] = rankingGeralDoFeed(t);
  assert.equal(linha.team_nome, '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(linha.etapas[0].nome, 'Etapa &quot;6&quot;');
  const mesas = mesasDoFeed({ mesas: [{ numero: 1, fase: 'QUALIFYING', jogadores: [{ jogador: "<b>O'Neil</b>", equipe: '<i>', eliminado: false, posicao: null, pontos: null }] }] });
  assert.equal(mesas[0].seats[0].player_nome, '&lt;b&gt;O&#39;Neil&lt;/b&gt;');
  assert.equal(mesas[0].seats[0].team_nome, '&lt;i&gt;');
  assert.equal(etapasDoFeed({ etapas: [{ id: 'a"b', nome: '<x>', status: 'RUNNING' }] })[0].nome, '&lt;x&gt;');
});

test('etapaDaTemporada só aceita id que está na temporada', () => {
  assert.equal(etapaDaTemporada(temporada, 't6'), true);
  assert.equal(etapaDaTemporada(temporada, 'inventado'), false);
});
