# Ranking de Jogadores ao vivo: StackPlus abastece o kingjogos.com.br

Data: 2026-10-20 · Prazo: 6ª etapa, 22–23/10/2026 · Segue o padrão da Batalha
(`2026-10-20-batalha-hg-stackplus-design.md`, já em produção).

## Por quê

O Ranking de Jogadores do site (`/ranking`, seção `#ranking` do `index.html`) vem
de `ranking-data.js`: listas de colocação digitadas à mão por etapa/torneio,
tabelas de pontos, exceções de chop e apelidos. Cada torneio novo exige editar
o arquivo e publicar. O dono quer que, **ao ser eliminado no StackPlus, o ranking
do site já atualize**, e que o **valor arrecadado do ranking** e os prêmios dos 5
primeiros também se atualizem sozinhos.

## Contexto (fatos levantados)

- **Site hoje:**
  - `ranking-data.js` cobre as Etapas 1–5. O `buildRanking()` gera `[{nome, total, etapas:[{nome, pontos, torneios:[{nome, pontos, pos}]}]}]`, servido em `GET /ranking` (`index.js:64`).
  - O `index.html` carrega esse JSON uma vez (`loadRankingFromApi`, via `API_BASE`).
  - O arrecadado (R$ 23.641,00) e a tabela 35/25/18/12/10 % estão fixos no HTML (`#ranking .fotografo-info`).
- **StackPlus**, evento "Home Game KING Live 2026" (`226fabbf-…`, em DRAFT):
  - O evento tem *stages* (etapas). A Etapa 5 = stage `9fa30297-…` (Main Event, "High Roller -Botinha", "BATALHA DE H.G", todos FINISHED). A 6ª etapa = stage `906d4fb7-…` (Main Event, High Roller, Super 50, "#4 Batalha HG", em inscrições).
  - Os torneios que contam (ME, HR, Super 50) têm `countsForRanking=true`, `rankingModelId` (tabelas FIXED da KING já configuradas pelo dono) e `rankingRetentionPct=5`.
  - A **Etapa 5 do StackPlus bate posição por posição com a Etapa 5 do `ranking-data.js`** (53 colocações de ME + HR).
  - Ranking individual: `RankingService.getEventTournamentRanking` (`ranking.service.ts:150`) conta **só torneios FINISHED**, com `scoreTournament` (`lib/ranking-tournament.ts:154`) e cache de 60 s. `TournamentPlayer.position` é gravado na eliminação, mas só depois do fim do late reg (antes disso fica `null`). O campeão recebe a posição em `declareWinner`/`finishByDeal`.
  - Valores em R$ disponíveis: `Tournament.guaranteedPrize`, `rankingRetentionPct`, `totalRanking` (o que de fato foi separado), `prizePool`.
  - Feed público já existente no padrão a seguir: `/public/equipes` (chave `EQUIPES_PUBLIC_API_KEY`, host `EQUIPES_PUBLIC_HOST_ID`, evento por nome `EQUIPES_PUBLIC_EVENTO_NOME`="KING Live", temporada = evento mais recente do host com esse nome, já começado e não cancelado; trava opcional `EQUIPES_PUBLIC_EVENT_ID`).
  - No site, o cliente `services/stackplus-feed.js` faz cache, espera curta, backoff e log; `BATALHA_FONTE` liga e desliga a fonte.
- O app do jogador (`HgklRankingModal.tsx`) lê `https://www.kingjogos.com.br/ranking` nesse mesmo formato. Ele tem que continuar funcionando.

## Objetivos

1. **Ao vivo:** quando um jogador da 6ª etapa (ou etapa posterior) recebe colocação no StackPlus, o ranking do site mostra os pontos dele em ≤ 15 s, sem recarregar a página. Quem cai antes do fim do late reg aparece quando a posição for gravada; o campeão, quando for declarado.
2. **Sem contagem dupla:** as Etapas 1–5 continuam vindo do `ranking-data.js`. Do StackPlus entram só as etapas que ainda não estão no arquivo (a 6ª em diante).
3. **Mesmo jogador, uma linha:** os pontos do StackPlus somam no jogador do histórico, pela lista de ligação aprovada.
4. **Arrecadado e prêmios ao vivo:** o site mostra o total arrecadado (R$ 23.641,00 das Etapas 1–5 mais as etapas do StackPlus pela regra da planilha) e o valor dos 5 prêmios (35/25/18/12/10 %).
5. **2027 sem ajuste no código:** com o arquivo sem histórico da nova temporada, tudo vem do StackPlus. A temporada é escolhida pela mesma regra do feed da Batalha.

## Não-objetivos

- Mudar as tabelas de pontos, os chops ou o histórico das Etapas 1–5.
- Mudar o card do app do StackPlus. Ele continua lendo `/ranking` do site; o "R$ 10.000" fixo dele fica como está e vira só uma observação.
- Corrigir o cache de ranking do StackPlus fora do que o feed novo precisar.

## Anti-objetivos

- Jogador aparecendo em duas linhas por diferença de grafia já mapeada na lista de ligação.
- Etapa 5 contada duas vezes.
- Pontos para quem ainda pode voltar ao torneio (rebuy/late reg).
- Ranking zerado ou quebrado no site se o StackPlus cair.
- Quebrar o formato de `/ranking` que o app do StackPlus consome.
- Expor dado financeiro além do agregado do prêmio do ranking: nada de buy-in por jogador, comanda, CPF ou contato.

## Desenho

### Regras decididas pelo dono

- **Lista de ligação:** os nomes do StackPlus passam pelos mesmos `PLAYER_ALIASES`/`normalizePlayerKey` do `ranking-data.js`, mais dois apelidos novos:
  - `adrianmoromoz → adrianmoz`
  - `fredgarlipp → fredgarlip`
  - Carlos Eduardo Zaidel, Paulo Cesar Kachan, Fabiano Gonçalves de Souza Oliveira e Leonardo Galiano são **jogadores novos** (não ligar).
  - Nome sem correspondência entra como jogador novo, com o nome do StackPlus em Caixa Título (`toTitleCase`).
- **Arrecadado = regra da planilha:**
  - **Etapas 1–5:** valor fixo de R$ 23.641,00 (soma da planilha).
  - **Cada torneio do StackPlus que conta para o ranking, a partir da 6ª etapa:**
    - Com garantido: `rankingRetentionPct` × `guaranteedPrize`, somado assim que o torneio **começa** (sai de REGISTRATION). Valor fixo.
    - Sem garantido: o valor que o StackPlus separou para o ranking (`totalRanking`), que sobe a cada entrada. *(Minha decisão: é o "5% do que entrou" da planilha.)*
  - Batalha HG (torneio sem `countsForRanking`) não entra.
  - Exemplo da 6ª etapa: HR R$ 25.000 → R$ 1.250, ME R$ 25.000 → R$ 1.250, Super 50 → 5% do que entrar.
- **Prêmios:** 5 premiados, com 35/25/18/12/10 % do total, arredondados em centavos.

### StackPlus: feed novo (no mesmo router/chave/regra de temporada da Batalha)

- **Ranking individual ao vivo da temporada:** por etapa (stage), por jogador:
  - nome, pontos;
  - por torneio: nome, posição e pontos.

  Inclui torneios **em andamento e encerrados** que contam para o ranking. Só pontua quem já tem posição gravada e é elegível pelo `scoreTournament` (a regra de rebuy continua valendo). *(Minha decisão: reaproveitar `scoreTournament` por torneio em vez de alterar o `getEventTournamentRanking`, que o `/public/spt` e o app usam.)*
- **Arrecadado por torneio que conta:** etapa, nome, status, `rankingRetentionPct`, `guaranteedPrize` e `totalRanking`. O site aplica a regra.
- **Temporada:** mesma regra do feed da Batalha (host + "KING Live" no nome, já começado, não cancelado, trava opcional), trocando a exigência "tem torneio de equipes" por "tem torneio que conta para o ranking". O `eventId` vai na resposta.
- Mesmo cuidado do feed da Batalha: só eventos do host com "KING Live" no nome; nada fora disso; sem dados pessoais além do nome.

### kingjogos.com.br

- **Liga e desliga:** env `RANKING_FONTE=stackplus`, que reaproveita `STACKPLUS_API_URL`/`STACKPLUS_EQUIPES_KEY`. Sem a env, tudo fica exatamente como hoje (rollback).
- **`GET /ranking`:** passa a devolver histórico (`ranking-data.js`) + StackPlus, **no mesmo formato de hoje**. As etapas do StackPlus entram em `etapas[]` com o nome da etapa e os torneios dela.
- **Histórico preso à temporada 2026** *(minha decisão, para o objetivo 5 valer sem mexer no código)*: o `ranking-data.js`, os R$ 23.641,00 e a lista de etapas do StackPlus que já estão no arquivo (hoje só a Etapa 5, stage `9fa30297-…`) ficam associados ao evento `226fabbf-2809-4a13-b7e0-f2bc79be4c5e`. O histórico só é somado quando o feed devolve esse evento como temporada atual (o feed manda o `eventId`). Em 2027 o feed devolve o evento novo, e o site mostra só o StackPlus.
- **StackPlus fora do ar sem nada em cache** (por exemplo, logo depois de um deploy): o site mostra o ranking só com o histórico, como hoje, e não uma tela vazia.
- **Nova rota pública do prêmio:** `{ total, premios: [{ posicao, pct, valor }] }`.
- **`index.html`:**
  - o ranking recarrega a cada 10 s, mantendo o último dado bom em caso de falha;
  - o bloco "Arrecadado Ranking" e a tabela dos 5 prêmios passam a vir da rota nova;
  - o HTML atual fica como conteúdo inicial, para não aparecer vazio.
- **Cache e queda do StackPlus:** mesmo cliente `stackplus-feed.js` (cache curto, espera de 1,5 s, backoff, log, último dado bom).

## Restrições

- Em produção e validado **antes de 22/10** (mesmo ritual da Batalha: PR no StackPlus com CI, deploy, envs, paridade, ensaio local).
- **Paridade antes de ligar:** com `RANKING_FONTE=stackplus` e a 6ª etapa ainda sem resultados, `/ranking` precisa ser idêntico ao de hoje, jogador por jogador, e o arrecadado igual a R$ 23.641,00.
- Seguir o `CLAUDE.md` do StackPlus (mudança mínima, ownership por evento, nada de refatorar o ranking existente).

## Deixado para o builder

- Ordem das etapas no JSON (numérica pela ordem da etapa, não alfabética: "Etapa 10" depois de "Etapa 6").

- Nome e caminho das rotas novas e formato exato do JSON do feed.
- Como obter a lista de torneios/jogadores pontuados do StackPlus de forma eficiente.
- Como o `index.html` mostra "ao vivo" (por exemplo, "Atualizado hh:mm").
