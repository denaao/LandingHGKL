// Cliente do feed público da Batalha no StackPlus (/public/equipes).
// Cache curto por caminho para não multiplicar chamadas por visitante; se o
// StackPlus falhar, devolve o último dado bom em vez de derrubar o site.
export function createFeed({ baseUrl, apiKey, ttlMs = 5000, fetchImpl = fetch }) {
  const cache = new Map();

  async function get(path) {
    const guardado = cache.get(path);
    if (guardado && Date.now() - guardado.em < ttlMs) return guardado.valor;
    try {
      const res = await fetchImpl(`${baseUrl}${path}`, {
        headers: { 'x-api-key': apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`StackPlus respondeu ${res.status}`);
      const valor = await res.json();
      cache.set(path, { valor, em: Date.now() });
      return valor;
    } catch (e) {
      if (guardado) return guardado.valor;
      throw e;
    }
  }

  return { get };
}
