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

test('chamadas simultâneas fazem um fetch só', async () => {
  const resolvers = [];
  const chamadas = [];
  const fetchImpl = (url) => { chamadas.push(url); return new Promise((r) => { resolvers.push(() => r({ ok: true, status: 200, json: async () => ({ v: 1 }) })); }); };
  const feed = createFeed({ baseUrl: 'https://sp.test/api', apiKey: 'k', fetchImpl });
  const a = feed.get('/x'); const b = feed.get('/x'); const c = feed.get('/x');
  await new Promise((r) => setImmediate(r));
  resolvers.forEach((r) => r());
  assert.deepEqual(await Promise.all([a, b, c]), [{ v: 1 }, { v: 1 }, { v: 1 }]);
  assert.equal(chamadas.length, 1);
});

test('cache vencido volta na hora e atualiza em segundo plano', async () => {
  let pendente = null;
  const fetchImpl = fakeFetch([{ status: 200, body: { v: 'velho' } }]);
  const lento = async () => { await new Promise((r) => { pendente = r; }); return { ok: true, status: 200, json: async () => ({ v: 'novo' }) }; };
  let usarLento = false;
  const feed = createFeed({ baseUrl: 'https://sp.test/api', apiKey: 'k', ttlMs: 0, esperaMs: 10, fetchImpl: (...a) => (usarLento ? lento(...a) : fetchImpl(...a)) });
  assert.deepEqual(await feed.get('/x'), { v: 'velho' });
  usarLento = true;
  const segunda = await Promise.race([feed.get('/x'), new Promise((r) => setTimeout(() => r('esperou o fetch'), 50))]);
  assert.deepEqual(segunda, { v: 'velho' });
  pendente?.();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(await feed.get('/x'), { v: 'novo' });
});

test('falha servida do cache fica registrada no log e espera antes de tentar de novo', async () => {
  const logs = [];
  const fetchImpl = fakeFetch([{ status: 200, body: { v: 1 } }, { status: 429, body: {} }]);
  const feed = createFeed({ baseUrl: 'https://sp.test/api', apiKey: 'k', ttlMs: 0, backoffMs: 60_000, fetchImpl, log: (m) => logs.push(m) });
  await feed.get('/x');
  await feed.get('/x');
  await new Promise((r) => setTimeout(r, 10));
  assert.match(logs.join('\n'), /429/);
  await feed.get('/x');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(fetchImpl.chamadas.length, 2);
});

test('cache vencido espera a busca nova quando o StackPlus responde rápido', async () => {
  const fetchImpl = fakeFetch([{ status: 200, body: { v: 'velho' } }, { status: 200, body: { v: 'novo' } }]);
  const feed = createFeed({ baseUrl: 'https://sp.test/api', apiKey: 'k', ttlMs: 0, fetchImpl });
  assert.deepEqual(await feed.get('/x'), { v: 'velho' });
  assert.deepEqual(await feed.get('/x'), { v: 'novo' });
});

test('sem cache, depois de uma falha não tenta de novo antes do backoff', async () => {
  const fetchImpl = fakeFetch([new Error('ECONNREFUSED'), { status: 200, body: { v: 1 } }]);
  const feed = createFeed({ baseUrl: 'https://sp.test/api', apiKey: 'k', backoffMs: 60_000, fetchImpl, log: () => {} });
  await assert.rejects(() => feed.get('/x'));
  await assert.rejects(() => feed.get('/x'));
  assert.equal(fetchImpl.chamadas.length, 1);
});
