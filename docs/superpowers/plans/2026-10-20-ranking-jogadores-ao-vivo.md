# Ranking de Jogadores ao vivo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o Ranking de Jogadores e o arrecadado/prêmios do kingjogos.com.br passam a somar o histórico (Etapas 1–5) com o StackPlus ao vivo (6ª etapa em diante).

**Architecture:**
- **StackPlus:** ganha uma rota no feed público existente (`/public/equipes`, mesma chave, host e regra de temporada) com:
  - o ranking individual ao vivo, por torneio, incluindo os em andamento;
  - os dados de arrecadação dos torneios que contam.
- **Landing:** junta isso ao `ranking-data.js` por jogador (apelidos), calcula o arrecadado pela regra da planilha e serve tudo no formato atual de `/ranking`. A nova fonte só vale com `RANKING_FONTE=stackplus`.

**Tech Stack:**
- StackPlus (`C:\dev\sp-equipes\apps\api`): Express, Prisma, Vitest.
- Landing (`C:\dev\landinghgkl`): Express ESM, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-20-ranking-jogadores-ao-vivo-design.md`

## Global Constraints

- Em produção e validado antes de 22/10/2026.
- O formato de `GET /ranking` não muda: `[{nome, total, etapas:[{nome, pontos, torneios:[{nome, pontos, pos}]}]}]`. O app do StackPlus (`HgklRankingModal`) consome esse formato.
- Histórico, os R$ 23.641,00 e as etapas ignoradas valem só quando a temporada for o evento `226fabbf-2809-4a13-b7e0-f2bc79be4c5e`.
- Etapas do StackPlus ignoradas na temporada 2026: só `9fa30297-2e53-46bd-8b10-ae282ab2ddae` (Etapa 5).
- Apelidos novos: `adrianmoromoz → adrianmoz` e `fredgarlipp → fredgarlip`.
- Arrecadado:
  - torneio com garantido: `pct/100 × garantido` (só depois que sai de REGISTRATION, e nunca se CANCELED);
  - sem garantido: `totalRanking`;
  - só torneios com `countsForRanking`.
- Prêmios: 35/25/18/12/10 % do total, em centavos.
- Feed: nada de CPF, contato, comanda ou valor por jogador.
- Atualização no site em ≤ 15 s.
- Sem `RANKING_FONTE`, o site fica exatamente como hoje.

## Review Focus

1. **StackPlus fora do ar logo depois de um deploy** (sem cache): `/ranking` devolve só o histórico, igual a hoje. Coberto no Task 4 (`sem StackPlus devolve o histórico`).
2. **Jogador caiu antes do fim do late reg** (position null): não aparece com pontos. Coberto no Task 1 (`eliminado sem posição não pontua`).
3. **Temporada de 2027:** o histórico de 2026 some. Coberto no Task 3 (`outra temporada não soma histórico nem 23.641`).
4. **Etapa 5 vinda do StackPlus:** não conta duas vezes. Coberto no Task 3 (`etapa ignorada não soma`).
5. **Grafia diferente já mapeada** (Adrian/Fred e os apelidos da Etapa 5): uma linha só. Coberto no Task 3 (`apelido junta no jogador do histórico`).

---

### Task 1: StackPlus: ranking da temporada incluindo torneios em andamento

**Files:**
- Modify: `C:\dev\sp-equipes\apps\api\src\modules\ranking\ranking.service.ts` (`getEventTournamentRanking`, ~150)
- Test: `C:\dev\sp-equipes\apps\api\tests\integration\public-equipes.integration.test.ts`

**Interfaces:**
- Produz: `getEventTournamentRanking(eventId, modelId?, stageId?, opts?: { emAndamento?: boolean })`.
  - Com `emAndamento: true`, o filtro de status vira `{ in: ['RUNNING', 'ON_BREAK', 'FINISHED'] }` e o cache usa a chave `…:live`, com TTL normal.
  - Sem `opts`, o comportamento é idêntico ao de hoje.

- [ ] **Step 1:** Escrever os testes, chamando o service direto:
  - `ranking ao vivo pontua torneio em andamento`: torneio RUNNING com `countsForRanking`, modelo FIXED `{1:200, 2:160, 3:130}`, 3 jogadores. Eliminar 1 com `position: 3` → `emAndamento: true` devolve esse jogador com 130. Sem `opts`, a lista vem vazia.
  - `eliminado sem posição não pontua`: jogador ELIMINATED com `position: null` não aparece.
- [ ] **Step 2:** `npx vitest run tests/integration/public-equipes.integration.test.ts` → os dois FALHAM.
- [ ] **Step 3:** Implementar o parâmetro.
- [ ] **Step 4:** Rodar o mesmo comando e `npx vitest run tests/integration -t ranking` → PASS. Os testes antigos de ranking continuam verdes.
- [ ] **Step 5:** Commit `feat(ranking): opcao de ranking ao vivo incluindo torneios em andamento`.

### Task 2: StackPlus: rota `/public/equipes/ranking-jogadores`

**Files:**
- Modify: `C:\dev\sp-equipes\apps\api\src\modules\public\public-equipes.service.ts`
- Modify: `C:\dev\sp-equipes\apps\api\src\modules\public\public-equipes.routes.ts`
- Test: `C:\dev\sp-equipes\apps\api\tests\integration\public-equipes.integration.test.ts`

**Interfaces:**
- Consome: `getEventTournamentRanking(..., { emAndamento: true })` (Task 1) e `eventosDoSite(hostId)`.
- Produz `rankingDeJogadores(hostId)`. Resposta de `GET /public/equipes/ranking-jogadores`:
  ```
  { temporada: { eventId, nome },
    etapas: [{ id, nome, ordem }],                       // Stage do evento, por orderIndex
    jogadores: [{ nome, pontos,
                  torneios: [{ etapaId, torneio, posicao, pontos }] }],
    arrecadacao: [{ etapaId, torneio, status, pct, garantido, totalRanking }] }  // só countsForRanking, sem CANCELED
  ```
  - Temporada: evento do site (`eventosDoSite`) mais recente, já começado, não cancelado, com pelo menos um torneio `countsForRanking`.
  - A trava `EQUIPES_PUBLIC_EVENT_ID` também vale.
  - Valores numéricos como `number`.

- [ ] **Step 1:** Escrever os testes:
  - `ranking-jogadores traz temporada, etapas e jogador pontuado ao vivo`: dois stages, torneio RUNNING com 1 eliminado pontuado. Esperado `jogadores[0]` = `{ nome, pontos: 130, torneios: [{ etapaId, torneio, posicao: 3, pontos: 130 }] }`.
  - `arrecadacao traz garantido, pct e totalRanking só de quem conta`: um torneio com `guaranteedPrize: 25000, rankingRetentionPct: 5` aparece; um torneio sem `countsForRanking` não aparece.
  - `ranking-jogadores não expõe cpf nem comanda`: `JSON.stringify` sem `cpf|comanda|email`.
  - `ranking-jogadores 404 para evento de outro cliente do host`.
- [ ] **Step 2:** Rodar e confirmar que FALHAM (rota inexistente).
- [ ] **Step 3:** Implementar o service e a rota (mesmo `hostDaChave`).
- [ ] **Step 4:** Rodar os testes do arquivo, `npm run typecheck` e `npm run lint` → PASS.
- [ ] **Step 5:** Commit `feat(ranking): feed publico do ranking de jogadores ao vivo para o kingjogos`.

### Task 3: Landing: juntar histórico + StackPlus e calcular o prêmio

**Files:**
- Modify: `C:\dev\landinghgkl\ranking-data.js`
  - mantém `export default buildRanking()`;
  - acrescenta `export { buildRanking, normalizePlayerKey, toTitleCase, PLAYER_DISPLAY_NAMES }`;
  - acrescenta os 2 apelidos.
- Create: `C:\dev\landinghgkl\services\ranking-ao-vivo.js`
- Test: `C:\dev\landinghgkl\tests\ranking-ao-vivo.test.js`

**Interfaces:**
- Constantes exportadas:
  - `TEMPORADA_HISTORICO = '226fabbf-2809-4a13-b7e0-f2bc79be4c5e'`
  - `ETAPAS_NO_HISTORICO = ['9fa30297-2e53-46bd-8b10-ae282ab2ddae']`
  - `ARRECADADO_HISTORICO = 23641`
  - `PCT_PREMIOS = [35, 25, 18, 12, 10]`
- `juntarRanking(historico, feed)` devolve o formato de `/ranking`:
  - `historico` é a saída de `buildRanking()`.
  - Usa o histórico só se `feed.temporada.eventId === TEMPORADA_HISTORICO`.
  - Agrupa os torneios do jogador por `etapaId` → `{nome: etapa.nome, pontos, torneios:[{nome: torneio, pontos, pos: posicao}]}`.
  - Ignora as etapas de `ETAPAS_NO_HISTORICO` (só na temporada 2026).
  - Casa os jogadores por `normalizePlayerKey`. Jogador novo leva o nome de `PLAYER_DISPLAY_NAMES`, ou o nome em `toTitleCase`.
  - Etapas do StackPlus ficam depois das do histórico, pela `ordem`.
  - Ordenação final igual à do `buildRanking`.
- `premioDoRanking(feed)` devolve `{ total, premios: [{ posicao, pct, valor }] }` pela regra da planilha. A base é 23.641 só na temporada 2026. Valores arredondados a 2 casas.

- [ ] **Step 1:** Escrever os testes, com fixture do feed no formato do Task 2:
  - `apelido junta no jogador do histórico`: "Douglas Martins Soler", com 70 pts na 6ª etapa, soma no total do histórico dele e ganha a etapa `6ª Etapa`.
  - `adrian e fred ligam ao histórico`: "Adrian Moro Moz" vai para "Adrian Moz".
  - `jogador novo entra com nome em caixa título`: "BRUNO NOVAES DA PURIFICAÇÃO" vira "Bruno Novaes da Purificação".
  - `etapa ignorada não soma`: torneio com `etapaId` 9fa30297 não muda nenhum total.
  - `outra temporada não soma histórico nem 23.641`: eventId diferente → só os jogadores do feed, e `premioDoRanking(...).total` é só o do feed.
  - `sem resultados na 6ª o ranking é idêntico ao histórico`: `deepEqual(juntarRanking(hist, feedVazio2026), hist)`.
  - `premio pela regra da planilha`: HR garantido 25000 RUNNING (1250) + ME garantido 25000 REGISTRATION (0) + Super 50 sem garantido `totalRanking: 169` + torneio CANCELED ignorado → total `23641 + 1250 + 169 = 25060`, prêmios `[8771, 6265, 4510.8, 3007.2, 2506]`.
- [ ] **Step 2:** `npm test` → FALHA (módulo inexistente).
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: junta ranking historico com StackPlus e calcula premio do ranking`.

### Task 4: Landing: rotas e página

**Files:**
- Modify: `C:\dev\landinghgkl\index.js` (`/ranking`, ~64; nova rota `GET /api/public/premio-ranking`)
- Modify: `C:\dev\landinghgkl\public\index.html` (bloco `#ranking .fotografo-info` e `loadRankingFromApi`, ~1691)
- Test: `C:\dev\landinghgkl\tests\ranking-rotas.test.js`

**Interfaces:**
- Consome: `createFeed` (`services/stackplus-feed.js`), `juntarRanking`, `premioDoRanking` (Task 3) e `buildRanking`.
- Produz:
  - `respostaRanking(feed, historico)`: `RANKING_FONTE=stackplus` → feed + junção. Se falhar sem cache, devolve `historico`.
  - `respostaPremio(feed)`: em falha, devolve o prêmio só com a base de 23.641.
  - Ficam num módulo testável (`services/ranking-rotas.js`) e são usadas por `index.js`.

- [ ] **Step 1:** Testes:
  - `sem StackPlus devolve o histórico`: feed que lança → `respostaRanking` igual ao histórico.
  - `sem StackPlus o prêmio é a base 23.641`.
- [ ] **Step 2:** `npm test` → FALHA.
- [ ] **Step 3:** Implementar o módulo e as rotas. No `index.html`:
  - `loadRankingFromApi` a cada 10 s, mantendo o conteúdo em caso de falha;
  - nova `loadPremioRanking()` preenche o total e os 5 valores (ids novos nos elementos atuais), a cada 10 s;
  - o HTML estático atual fica como conteúdo inicial.
- [ ] **Step 4:** `npm test` → PASS. Smoke local com o StackPlus local (banco de teste) e `RANKING_FONTE=stackplus`:
  - antes de eliminar: `/ranking` idêntico ao de hoje e prêmio = R$ 23.641,00;
  - depois de eliminar alguém: aparece em ≤ 15 s na página.
- [ ] **Step 5:** Commit `feat: Ranking de Jogadores e premio atualizam ao vivo pelo StackPlus`.

### Task 5: Colocar no ar (com o dono, passo a passo)

- [ ] **Step 1:** PR no StackPlus. Merge depois do CI verde, com ok do dono.
- [ ] **Step 2:** Deploy da landing **sem** `RANKING_FONTE`. Com ok do dono.
- [ ] **Step 3:** Paridade em produção, sem ligar no site: rodar `juntarRanking` local contra o feed de produção e comparar com o `/ranking` atual. Tem que dar idêntico, jogador por jogador, e o prêmio tem que dar 23.641 + o que já houver da 6ª etapa (antes de começar: 23.641).
- [ ] **Step 4:** O dono define `RANKING_FONTE=stackplus` no Railway da landing. Conferir a home.
