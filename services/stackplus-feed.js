// Cliente do feed público da Batalha no StackPlus (/public/equipes).
//
// O site não pode congelar nem derrubar o StackPlus em dia de etapa:
// - uma busca por caminho de cada vez, por mais visitantes que cheguem juntos;
// - dado vencido: espera a busca nova por até `esperaMs`; se o StackPlus demorar,
//   devolve o antigo e a atualização segue em segundo plano;
// - depois de uma falha, espera `backoffMs` antes de tentar de novo;
// - toda falha vai para o log, mesmo quando o cache cobre.
export function createFeed({ baseUrl, apiKey, ttlMs = 5000, backoffMs = 15000, esperaMs = 1500, fetchImpl = fetch, log = console.error }) {
  const cache = new Map(); // path -> { valor, em }
  const emVoo = new Map(); // path -> Promise
  const falhouEm = new Map(); // path -> timestamp

  function buscar(path) {
    if (emVoo.has(path)) return emVoo.get(path);
    const p = (async () => {
      try {
        const res = await fetchImpl(`${baseUrl}${path}`, {
          headers: { 'x-api-key': apiKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`StackPlus respondeu ${res.status}`);
        const valor = await res.json();
        cache.set(path, { valor, em: Date.now() });
        falhouEm.delete(path);
        return valor;
      } catch (e) {
        falhouEm.set(path, Date.now());
        log(`[batalha] falha ao ler ${path}: ${e.message}`);
        throw e;
      } finally {
        emVoo.delete(path);
      }
    })();
    emVoo.set(path, p);
    return p;
  }

  async function get(path) {
    const guardado = cache.get(path);
    if (!guardado) {
      // Sem cache e com falha recente: responde na hora (quem chama cai no plano B)
      // em vez de deixar cada visitante esperando o timeout de novo.
      if (Date.now() - (falhouEm.get(path) ?? 0) < backoffMs) throw new Error(`StackPlus indisponível (aguardando ${backoffMs / 1000}s)`);
      return buscar(path);
    }
    const vencido = Date.now() - guardado.em >= ttlMs;
    const esperando = Date.now() - (falhouEm.get(path) ?? 0) < backoffMs;
    if (!vencido || esperando) return guardado.valor;
    const novo = buscar(path).catch(() => guardado.valor);
    const antigo = new Promise((r) => setTimeout(() => r(guardado.valor), esperaMs).unref?.());
    return Promise.race([novo, antigo]);
  }

  // Idade do dado em cache, em segundos (null = nunca leu).
  function idade(path) {
    const guardado = cache.get(path);
    return guardado ? Math.round((Date.now() - guardado.em) / 1000) : null;
  }

  return { get, idade };
}
