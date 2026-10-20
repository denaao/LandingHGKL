import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFeed } from '../services/stackplus-feed.js';

function fakeFetch(respostas) {
  const chamadas = [];
  const fn = async (url, opts) => {
    chamadas.push({ url, opts });
    const r = respostas.shift();
    if (r instanceof Error) throw r;
    return { ok: r.status === 200, status: r.status, json: async () => r.body };
  };
  fn.chamadas = chamadas;
  return fn;
}

test('feed usa cache dentro do ttl', async () => {
  const fetchImpl = fakeFetch([{ status: 200, body: { a: 1 } }]);
  const feed = createFeed({ baseUrl: 'https://sp.test/api', apiKey: 'k', ttlMs: 5000, fetchImpl });
  assert.deepEqual(await feed.get('/public/equipes/temporada'), { a: 1 });
  assert.deepEqual(await feed.get('/public/equipes/temporada'), { a: 1 });
  assert.equal(fetchImpl.chamadas.length, 1);
  assert.equal(fetchImpl.chamadas[0].url, 'https://sp.test/api/public/equipes/temporada');
  assert.equal(fetchImpl.chamadas[0].opts.headers['x-api-key'], 'k');
});

test('serve cache antigo quando o fetch falha', async () => {
  const fetchImpl = fakeFetch([{ status: 200, body: { v: 'bom' } }, new Error('ECONNRESET'), { status: 502, body: {} }]);
  const feed = createFeed({ baseUrl: 'https://sp.test/api', apiKey: 'k', ttlMs: 0, fetchImpl });
  assert.deepEqual(await feed.get('/x'), { v: 'bom' });
  assert.deepEqual(await feed.get('/x'), { v: 'bom' });
  assert.deepEqual(await feed.get('/x'), { v: 'bom' });
});

test('sem cache e com falha lança', async () => {
  const fetchImpl = fakeFetch([{ status: 503, body: {} }]);
  const feed = createFeed({ baseUrl: 'https://sp.test/api', apiKey: 'k', fetchImpl });
  await assert.rejects(() => feed.get('/x'));
});
