# Batalha HG ao vivo (StackPlus → kingjogos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a Batalha HG passa a ser lançada só no StackPlus, e o kingjogos.com.br mostra a classificação das equipes ao vivo, já na 6ª etapa (22–23/10/2026). Em 2027 o site troca de temporada sem ajuste nenhum.

**Architecture:** o StackPlus ganha um feed público só de leitura (`/public/equipes`), protegido por API key e amarrado ao host KING. O próprio StackPlus decide qual evento é a "temporada atual". A landing troca a fonte das rotas `/api/public/etapas*` e `/api/public/ranking-geral`: em vez do SQLite, ela lê esse feed com cache curto e fallback para o último dado bom, mantendo o JSON que as páginas já usam. O histórico de 2026 entra no StackPlus pela importação existente, estendida com pontos-base.

**Tech Stack:**
- StackPlus (`C:\dev\sp-equipes\apps\api`): Express 4, TypeScript, Prisma/Postgres, Zod, Vitest.
- Landing (`C:\dev\landinghgkl`): Express, better-sqlite3, ESM, `node:test` (Node 20).

**Spec:** `docs/superpowers/specs/2026-10-20-batalha-hg-stackplus-design.md`

## Global Constraints

- Produção validada nos dois sistemas **antes de 22/10/2026**.
- O feed expõe só nomes de equipe e jogador, mesa, fase, posição e pontos. Nada de dinheiro (`premio`, `prizeAmount`), CPF, e-mail ou telefone.
- A chave de API fica só no servidor da landing (env), nunca no navegador.
- Trocar de temporada não pode exigir mudança de código, env ou HTML.
- StackPlus: seguir `C:\dev\sp-equipes\CLAUDE.md` (mudança mínima, nova migration e nunca editar as existentes, ownership por `eventId` no service).
- Landing: o Ranking de Jogadores individual (`/ranking`) não muda.
- Alvo de atraso no site: ≤ 15 s depois de cada eliminação.
- Nomes oficiais das equipes = os canônicos do `/api/public/ranking-geral` atual. A única mudança é colapsar espaços duplos ("Liga Feminina  Poker Campinas PINK" → "Liga Feminina Poker Campinas PINK").

## Review Focus

1. **StackPlus fora do ar ou lento durante a etapa:** o site continua mostrando o último dado bom, sem erro. É coberto no Task 5 (`serve cache antigo quando o fetch falha`).
2. **Etapa da 6ª com ids string (uuid):** as abas e as URLs de `ranking-batalha.html` funcionam. Hoje `selectEtapa(${e.id})` vai sem aspas e quebra com uuid. É coberto no Task 6.
3. **Equipe só com pontos-base** (Marcão 42, Call por Blefe, Suprema, Crazy Nuts, Paga o Careca, De Tudo um Poker): ela aparece no ranking geral do StackPlus mesmo sem etapa importada. É coberto no Task 2 (`cria equipe que só tem pontos-base`).
4. **Chave de outro cliente ou evento de outro host:** o feed não devolve nada fora do host KING. É coberto no Task 3 (`404 para torneio de outro host`).
5. **Importação repetida** (alguém clica duas vezes): os pontos-base não são somados de novo, porque são *definidos*, não somados. É coberto no Task 2 (`reimportar não duplica pontos-base`).

---

### Task 1: StackPlus: pontos-base por equipe no ranking acumulado

**Files:**
- Modify: `C:\dev\sp-equipes\apps\api\prisma\schema.prisma` (model `Equipe`, ~4388)
- Create: `C:\dev\sp-equipes\apps\api\prisma\migrations\20261020120000_equipes_pontos_base\migration.sql`
- Modify: `C:\dev\sp-equipes\apps\api\src\modules\equipe\equipe.service.ts` (`rankingDoEvento`, ~1275)
- Test: `C:\dev\sp-equipes\apps\api\tests\integration\torneio-de-equipes.integration.test.ts`

**Interfaces:**
- Produz: `Equipe.basePoints Int @default(0)`, com o comentário `/// Pontos trazidos de antes do sistema de etapas (temporada importada). Somados no ranking do evento.`
- Produz: as linhas de `rankingDoEvento` ganham `base: number`, e `total` passa a incluir `base`.

- [ ] **Step 1:** Escrever o teste `ranking do evento soma pontos-base da equipe`. Uma equipe com `basePoints: 500` e 30 pontos num torneio deve ter `linha.total === 530` e `linha.base === 500`. Uma equipe com `basePoints: 92` e sem torneio aparece com `total === 92`.
- [ ] **Step 2:** Rodar `pnpm --filter api test -- torneio-de-equipes` e confirmar que FALHA (o campo `basePoints` não existe).
- [ ] **Step 3:** Adicionar o campo e a migration (`ALTER TABLE "Equipe" ADD COLUMN "basePoints" INTEGER NOT NULL DEFAULT 0;`). Em `rankingDoEvento`, inicializar `total` com `e.basePoints` e expor `base`.
- [ ] **Step 4:** Rodar `pnpm --filter api exec prisma generate`, depois `pnpm --filter api test -- torneio-de-equipes` e `pnpm --filter api typecheck`. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(equipes): pontos-base por equipe somados no ranking do evento`.

### Task 2: StackPlus: importação aceita pontos-base

**Files:**
- Modify: `C:\dev\sp-equipes\apps\api\src\modules\equipe\equipe-importacao.ts` (`dadosAntigosSchema`)
- Modify: `C:\dev\sp-equipes\apps\api\src\modules\equipe\equipe-importacao.service.ts` (`importarEtapas`, `previaDaImportacao`)
- Test: `C:\dev\sp-equipes\apps\api\tests\integration\equipes-importacao.integration.test.ts`

**Interfaces:**
- Consome: `Equipe.basePoints` (Task 1).
- Produz: um campo opcional no schema, `pontosBase: z.array(z.object({ nome: z.string().min(1).max(120), pontos: z.number().int().min(0) })).max(200).optional().default([])`.
- Produz: `importarEtapas` devolve também `pontosBase: number`, o número de equipes atualizadas.

- [ ] **Step 1:** Escrever os testes:
  - `importa pontos-base e cria equipe que só tem pontos-base`: `pontosBase: [{nome:'Garagentos',pontos:500},{nome:'Crazy Nuts',pontos:125}]` mais uma etapa com Garagentos. Esperado: as duas equipes existem no evento, `basePoints` é 500 e 125, e `rankingDoEvento` mostra Crazy Nuts com total 125.
  - `reimportar não duplica pontos-base`: importar duas vezes deixa `basePoints === 500`.
- [ ] **Step 2:** Rodar `pnpm --filter api test -- equipes-importacao` e confirmar que FALHA.
- [ ] **Step 3:** Implementar. Depois do loop de etapas, para cada item de `pontosBase`, procurar a equipe com `findFirst({ eventId, name })`. Se não existir, criar com `captainId/createdByUserId = userId` e `importedFrom = 'torneiodeequipes:base'`. Em seguida, **atribuir** (`update`) `basePoints = pontos`. A prévia lista quantas equipes recebem pontos-base. A tela de importação (`web-events/app/event/[id]/equipes/importar/page.tsx`) mostra essa contagem; mudança mínima de texto.
- [ ] **Step 4:** Rodar `pnpm --filter api test -- equipes-importacao` e `pnpm --filter api typecheck`. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(equipes): importacao aceita pontos-base por equipe`.

### Task 3: StackPlus: feed público `/public/equipes`

**Files:**
- Modify: `C:\dev\sp-equipes\apps\api\src\middlewares\api-key.middleware.ts`
- Create: `C:\dev\sp-equipes\apps\api\src\modules\public\public-equipes.routes.ts`
- Create: `C:\dev\sp-equipes\apps\api\src\modules\public\public-equipes.service.ts`
- Modify: `C:\dev\sp-equipes\apps\api\src\routes\index.ts` (ao lado de `/public/spt`, ~176)
- Test: `C:\dev\sp-equipes\apps\api\tests\integration\public-equipes.integration.test.ts` (seguir `fixtures.ts`/`setup.ts`)

**Interfaces:**
- Middleware: `makeApiKeyAuth(envVar: string)`. O `apiKeyAuth` atual passa a ser `makeApiKeyAuth('SPT_PUBLIC_API_KEY')`, com o mesmo comportamento.
- Envs novas: `EQUIPES_PUBLIC_API_KEY` e `EQUIPES_PUBLIC_HOST_ID` (o `hostId` do evento KING). Sem uma delas, o feed responde 503 (fail-closed).
- Service:
  - `temporadaAtual(hostId: string): Promise<{ eventId: string; nome: string } | null>`: o `Event` mais recente (`startDate desc`) daquele host que tenha pelo menos um torneio com `equipeConfig` e não esteja cancelado.
  - `rankingDaTemporada(hostId)`: devolve `{ temporada: {eventId,nome}, etapas: {id,nome,status,fase}[], equipes: {colocacao,nome,total,base,etapas:{id,nome,pontos}[]}[] }`. Reusa `rankingDoEvento(eventId, null)`.
  - `classificacaoDaEtapa(hostId, tournamentId)`: devolve `{ etapa: {id,nome,fase}, equipes: {colocacao,nome,classificatoria,final,total,detalhes:{jogador,mesa,fase,posicao,pontos}[]}[] }`. Reusa `classificacaoDoTorneio`. **Não** inclui `premio`.
  - `mesasDaEtapa(hostId, tournamentId)`: devolve `{ mesas: {numero,fase,jogadores:{jogador,equipe,eliminado:boolean,posicao:number|null,pontos:number|null}[]}[] }`. Os jogadores vivos vêm de `EquipeInscricaoJogador → tournamentPlayer.tableNumber`; os eliminados, de `EquipeResultado`.
- Rotas (todas `GET`, com `makeApiKeyAuth('EQUIPES_PUBLIC_API_KEY')` e `publicApiLimiter`):
  - `/public/equipes/temporada`
  - `/public/equipes/etapas/:tournamentId/classificacao`
  - `/public/equipes/etapas/:tournamentId/mesas`

  Um torneio que não pertence a um evento do host responde 404.

- [ ] **Step 1:** Escrever os testes:
  - `401 sem chave`.
  - `temporada pega o evento mais recente do host com torneio de equipes`: dois eventos do mesmo host; só o mais novo tem equipes; esperado o mais novo. Um evento mais novo **sem** equipes é ignorado.
  - `ranking soma pontos-base e etapas`.
  - `classificacao não expõe premio nem documento`: o `JSON.stringify` da resposta não contém `premio`, `prizeAmount` nem `cpf`.
  - `404 para torneio de outro host`.
  - `mesas mostram vivo e eliminado com posição e pontos`.
- [ ] **Step 2:** Rodar `pnpm --filter api test -- public-equipes` e confirmar que FALHA.
- [ ] **Step 3:** Implementar o middleware, o service e as rotas. Escrever um comentário no topo do router no mesmo tom do `public-ranking.routes.ts`: consumido por www.kingjogos.com.br por polling, read-only, não financeiro.
- [ ] **Step 4:** Rodar `pnpm --filter api test`, `pnpm --filter api typecheck` e `pnpm --filter api lint`. Esperado: tudo PASS. Os testes do SPT continuam verdes.
- [ ] **Step 5:** Commit `feat(equipes): feed publico da Batalha para o kingjogos`.

### Task 4: Landing: exportar histórico no formato `torneiodeequipes`

**Files:**
- Create: `C:\dev\landinghgkl\services\team-names.js`
- Modify: `C:\dev\landinghgkl\routes\public.js` (remover `TEAM_NAME_ALIASES`/`canonicalTeamName` locais e importar do módulo novo)
- Modify: `C:\dev\landinghgkl\routes\admin.js` (nova rota, atrás de `requireAuth`)
- Create: `C:\dev\landinghgkl\services\export-equipes.js`
- Test: `C:\dev\landinghgkl\tests\export-equipes.test.js`, mais `"test": "node --test tests/"` no `package.json`

**Interfaces:**
- `canonicalTeamName(nome: string): string`: aplica os aliases e colapsa espaços repetidos/aparas.
- `exportarEquipes(db): { origem:'torneiodeequipes', exportadoEm, etapas:[...], pontosBase:[{nome,pontos}] }`:
  - Inclui só as etapas com `status='finished'`.
  - As etapas seguem o formato de `dadosAntigosSchema` (`equipes[].nome` canônico, `equipeGlobalId`, `jogadores`, `mesas[].assentos{jogadorId,ordemEliminacao,pontos}`).
  - `pontosBase` vem de `team_base_points`, com o nome canônico.
- Rota `GET /api/admin/export-equipes`: responde o JSON como download (`Content-Disposition: attachment; filename="batalha-hg-2026.json"`).

- [ ] **Step 1:** Escrever os testes com SQLite em memória (criar só as tabelas usadas):
  - `canonical colapsa espaço duplo e aplica alias`: `'Fenix Poker'` vira `'Fênix'`, e `'Liga Feminina  Poker Campinas PINK'` vira `'Liga Feminina Poker Campinas PINK'`.
  - `export ignora etapa não finalizada`.
  - `export inclui pontos-base com nome canônico`.
  - `soma dos pontos exportados por equipe == ranking-geral`: base mais os assentos das etapas finalizadas dá o mesmo total, equipe por equipe.
- [ ] **Step 2:** Rodar `npm test` e confirmar que FALHA.
- [ ] **Step 3:** Implementar `team-names.js`, `export-equipes.js` e a rota.
- [ ] **Step 4:** Rodar `npm test` e esperar PASS. Depois, `node index.js` e `curl` na rota sem login deve dar 401.
- [ ] **Step 5:** Commit `feat: exporta historico da Batalha para importacao no StackPlus`.

### Task 5: Landing: fonte StackPlus para as rotas públicas da Batalha

**Files:**
- Create: `C:\dev\landinghgkl\services\stackplus-feed.js`
- Create: `C:\dev\landinghgkl\services\batalha-map.js`
- Modify: `C:\dev\landinghgkl\routes\public.js` (`/public/etapas`, `/public/etapas/:id/ranking`, `/public/etapas/:id/tables`, `/public/ranking-geral`)
- Test: `C:\dev\landinghgkl\tests\stackplus-feed.test.js`, `C:\dev\landinghgkl\tests\batalha-map.test.js`

**Interfaces:**
- Envs: `BATALHA_FONTE` (`stackplus` | qualquer outro valor = SQLite como hoje), `STACKPLUS_API_URL` (ex.: `https://<api>/api`) e `STACKPLUS_EQUIPES_KEY`.
- `createFeed({ baseUrl, apiKey, ttlMs = 5000, fetchImpl = fetch })` devolve `{ get(path): Promise<any> }`:
  - Cacheia por `path` durante `ttlMs` e manda o header `x-api-key`.
  - Se o fetch falhar e houver um valor antigo, devolve esse valor (nunca lança enquanto tiver algo em cache).
  - Sem cache e com falha, lança.
- Mapeadores em `batalha-map.js`, que convertem o feed (Task 3) para o JSON **atual** das páginas:
  - `etapasDoFeed(temporada)` dá `[{id, nome, status}]`. Inclui todas as etapas da temporada, as importadas e as do StackPlus, em ordem decrescente.
  - `rankingGeralDoFeed(temporada)` dá `[{team_nome, total_points, etapas:[{nome, points}]}]`.
  - `rankingEtapaDoFeed(classificacao)` dá `[{team_id, team_nome, qualifying_points, final_points, total_points, details:[{player_nome, mesa, phase:'qualifying'|'final', position, points}]}]`.
  - `mesasDoFeed(mesas)` dá `[{numero, phase, seats:[{player_nome, team_nome, elimination_order, points}]}]`. O `elimination_order` vem de `total + 1 - posicao`, porque a página converte de volta, e é `null` para quem está vivo.
- Fase do StackPlus para a da página: `QUALIFYING` vira `'qualifying'` e `FINAL` vira `'final'`.

- [ ] **Step 1:** Escrever os testes:
  - `feed usa cache dentro do ttl`: duas chamadas fazem 1 fetch.
  - `serve cache antigo quando o fetch falha`.
  - `sem cache e com falha lança`.
  - Um teste por mapeador, com uma fixture do formato do Task 3 e a saída exata esperada. Inclui `mesasDoFeed` com 8 jogadores e o 8º colocado eliminado, que dá `elimination_order 1`.
- [ ] **Step 2:** Rodar `npm test` e confirmar que FALHA.
- [ ] **Step 3:** Implementar. Nas 4 rotas, quando `BATALHA_FONTE === 'stackplus'`, ler do feed e mapear. Se falhar sem cache, responder `503 {error}`. Caso contrário, manter o código SQLite atual intacto, que é o rollback.
- [ ] **Step 4:** Rodar `npm test` e esperar PASS.
- [ ] **Step 5:** Commit `feat: Batalha HG le ranking ao vivo do StackPlus`.

### Task 6: Landing: páginas aceitam ids string e atualizam sozinhas

**Files:**
- Modify: `C:\dev\landinghgkl\public\ranking-batalha.html` (`renderTabs`, ~150)
- Modify: `C:\dev\landinghgkl\public\index.html` (`loadHgRanking`, ~1734)

- [ ] **Step 1:** Em `renderTabs`, trocar `onclick="selectEtapa(${e.id})"` por um id com aspas e escape (`selectEtapa('${String(e.id).replace(/'/g, "\\'")}')`). As URLs `fetch` usam `encodeURIComponent(currentEtapaId)`.
- [ ] **Step 2:** Diminuir o `setInterval` de `ranking-batalha.html` de 15000 para 10000. No `index.html`, chamar `loadHgRanking` a cada 15 s (`setInterval(loadHgRanking, 15000)`).
- [ ] **Step 3:** Verificar localmente com `BATALHA_FONTE=stackplus` apontando para um StackPlus de dev/staging (ou para o fixture do Task 5 servido por um stub). As abas abrem com uuid, a página atualiza sozinha e não aparece erro no console. Verificar também com `BATALHA_FONTE` vazio: tudo igual a hoje.
- [ ] **Step 4:** Commit `feat: paginas da Batalha aceitam etapa do StackPlus e atualizam sozinhas`.

### Task 7: Colocar no ar e validar (com o dono, passo a passo)

Cada passo que mexe em produção **pede confirmação do dono antes**.

- [ ] **Step 1: Deploy do StackPlus.** Fazer merge/push da `main` do `sp-equipes`; o Railway roda `docker-migrate.sh`. Definir `EQUIPES_PUBLIC_API_KEY` (gerada com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) e `EQUIPES_PUBLIC_HOST_ID`. Conferir com `curl -H "x-api-key: …" <api>/api/public/equipes/temporada`: deve responder 200.
- [ ] **Step 2: Evento 2026 no StackPlus.** Confirmar com o dono que o evento da temporada existe, que a 6ª etapa está criada como torneio de equipes e quais equipes já foram cadastradas. Renomear para o nome oficial qualquer equipe com grafia diferente.
- [ ] **Step 3: Importar o histórico.** Fazer deploy da landing (Tasks 4–6) **com `BATALHA_FONTE` vazio**. O dono, logado no admin da landing, baixa `/api/admin/export-equipes` e importa no StackPlus (evento → Equipes → Importar).
- [ ] **Step 4: Paridade.** Comparar `/public/equipes/temporada` com o `/api/public/ranking-geral` da landing, equipe por equipe. Os totais têm que ser iguais. A referência de hoje é Garagentos 1043, Pesadelo 1001, Fênix 918 … De Tudo um Poker 92.
- [ ] **Step 5: Virar a fonte.** Na landing do Railway, definir `BATALHA_FONTE=stackplus`, `STACKPLUS_API_URL` e `STACKPLUS_EQUIPES_KEY`. Conferir o `ranking-batalha.html` e a seção do `index.html` em www.kingjogos.com.br.
- [ ] **Step 6: Ensaio.** **Não** criar um evento de teste do mesmo host: ele viraria a "temporada atual". Criar um torneio de equipes de teste **dentro do evento 2026**, eliminar um jogador e ver o site mudar em ≤ 15 s. Depois, **cancelar** esse torneio (`rankingDoEvento` ignora `CANCELED`) e conferir que o ranking voltou aos números da paridade.
- [ ] **Step 7: Plano B registrado.** Até a primeira eliminação da 6ª etapa, voltar é só apagar `BATALHA_FONTE`. Depois disso, o site fica no cache se o StackPlus cair.
