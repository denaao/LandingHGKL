# Batalha HG ao vivo: StackPlus abastece o kingjogos.com.br

Data: 2026-10-20 · Prazo duro: 6ª etapa, 22–23/10/2026

## Por quê

A Batalha de Home Games (torneio de equipes da KING Live) hoje é lançada no admin
da landing (`/admin/etapa.html`, SQLite). O StackPlus já tem torneio de equipes
completo (sorteio, mini-mesas, mesa final, pontuação por colocação, tempo real
por Socket.IO), mas nada disso chega ao site público. O dono quer:

- lançar a Batalha **só no StackPlus**, a partir da 6ª etapa (22–23/10);
- o kingjogos.com.br mostrar a classificação **ao vivo**, sem ninguém mexer no site;
- **ano que vem** tudo rodar pelo StackPlus sem ajustes manuais no site.

## Contexto (como é hoje)

- kingjogos.com.br = este repo (`landinghgkl`), Express + SQLite, Railway.
- Páginas que mostram a Batalha:
  - `public/ranking-batalha.html`: ranking geral, seletor de etapas, ranking da
    etapa (classificatória/final/total + detalhes por jogador) e mesas.
  - `public/index.html`, seção "Batalha HG" (`#hg-ranking-tbody`): ranking geral.
- Rotas atuais da landing (`routes/public.js`): `/api/public/etapas`,
  `/api/public/etapas/:id/ranking`, `/api/public/etapas/:id/tables`,
  `/api/public/ranking-geral` (soma `team_base_points` + etapas `finished`,
  com `TEAM_NAME_ALIASES`).
- StackPlus (`C:\dev\sp-equipes`, Express + Prisma/Postgres, Railway):
  - Modelos `Equipe`, `EquipeMembro`, `EquipeTorneioConfig`, `EquipeInscricao`,
    `EquipeResultado` (schema.prisma ~4388–4552). **Não confundir com `Team`**
    (staking).
  - Uma temporada = **um evento**; cada etapa é um torneio dentro dele.
  - Ranking acumulado do evento: `GET /equipes/evento/:eventId/ranking` (autenticado).
  - Classificação do torneio: `EquipeService.classificacaoDoTorneio` / `classificacaoParaTv`.
  - Eliminação grava `EquipeResultado` via `registrarEliminacaoTx` (`tournament.service.ts:5189`).
  - Modelo de feed público existente: `modules/public/public-ranking.routes.ts`
    (`/public/spt`, API key + rate limit + trava por evento via env), consumido
    por polling pelo site da Suprema Poker Tour.
  - Importação do sistema antigo: `POST /equipes/evento/:eventId/importacao(/previa)`,
    formato `origem: 'torneiodeequipes'` (`equipe-importacao.ts`). **Não cobre
    pontos-base** (`team_base_points` — pontos históricos anteriores ao sistema
    de etapas, 14 equipes, seed em `database.js`).

## Objetivos

1. Durante a 6ª etapa, cada eliminação lançada no StackPlus aparece no
   `ranking-batalha.html` e na seção Batalha HG do `index.html` em poucos
   segundos (alvo: ≤ 15 s), sem recarregar a página.
2. O ranking geral da temporada 2026 no site é o acumulado do StackPlus e bate
   com o que o site mostra hoje antes da 6ª etapa (pontos-base + etapas já jogadas).
3. Virada de ano sem mexer em código nem em configuração do site: quando a
   temporada 2027 (novo evento) começar no StackPlus, o site passa a mostrá-la sozinho.

## Não-objetivos

- Ranking de Jogadores individual (`/ranking`, `ranking-data.js`): fica como está.
- Arquivo/consulta de temporadas passadas no site: desejável, fica para depois.
- Desligar ou apagar o admin da landing e o SQLite: só deixam de ser a fonte.
  Ficam como estão (servem de backup/rollback).
- Mudar o app `C:\dev\Equipes\Torneiodeequipes`.

## Anti-objetivos (falha mesmo que "funcione")

- Site mostrar ranking errado ou zerado durante a 6ª etapa.
- Chave de API exposta no navegador.
- Precisar editar código/env/HTML do site em 2027 para trocar de temporada.
- Feed público vazar dados de outros eventos/clientes do StackPlus ou dados
  financeiros (inscrições, PIX, prêmios em dinheiro).

## Desenho

### StackPlus: feed público da Batalha (novo)

Rotas só de leitura, no mesmo padrão de `/public/spt` (API key própria,
rate limit), por exemplo em `/public/equipes`:

- **temporada atual**: devolve o evento corrente da Batalha KING. A regra de
  "qual é o evento atual" vive no StackPlus, não no site. *(Minha decisão)*
  A chave fica amarrada ao organizador/clube KING, não a um `eventId`, e o
  StackPlus escolhe o evento mais recente desse dono que tenha torneio de
  equipes. Como identificar o "dono KING" no modelo do StackPlus fica com o builder.
- **ranking acumulado** da temporada: equipes, total, pontos por etapa.
- **etapas** (torneios de equipes do evento) com status/fase.
- **classificação de uma etapa**: classificatória, final, total e detalhes
  por jogador (nome, mesa, fase, posição, pontos). É o que o
  `ranking-batalha.html` já exibe.
- **mesas de uma etapa** (opcional se apertar o prazo).

Só nomes, posições e pontos. Nada de dinheiro, telefone, e-mail ou documento.

### Histórico 2026 dentro do StackPlus

- Exportar as etapas já jogadas do SQLite da landing (produção) no formato
  `torneiodeequipes` e importar no evento da temporada 2026 pela importação
  existente.
- Pontos-base (`team_base_points`): o StackPlus precisa de um jeito de
  registrar pontos iniciais por equipe no evento, somados no ranking acumulado.
  O formato (campo na `Equipe`, tabela de ajuste etc.) fica com o builder.
- **Fonte do histórico: o SQLite da landing em produção** (é o que o site
  mostra hoje e o que vale). Não usar o Postgres do `Torneiodeequipes`. *(Minha decisão)*
  O script existente `apps/api/scripts/equipes/exportar-sistema-antigo.ts` lê
  o Postgres antigo e precisa ser adaptado ou ter uma versão que leia o SQLite
  (as tabelas são as mesmas).
- **Nomes oficiais das equipes (aprovados pelo dono):** os 18 nomes canônicos
  que o `/api/public/ranking-geral` da landing devolve hoje, já com os
  `TEAM_NAME_ALIASES` aplicados: Garagentos, Pesadelo, Fênix, Leva o Restinho Team,
  Poker Barão, Business Poker, Arena Poker, Esporte da Mente Zero 1,
  Marcão 42 Poker Team, Call por Blefe, Ghost Poker, NSOP TEAM, Suprema,
  Liga Feminina Poker Campinas PINK, Crazy Nuts, Paga o Careca,
  Liga feminina poker Campinas BLACK, De Tudo um Poker.
  *(Minha decisão)* Corrigir só o espaço duplo do nome da PINK e manter o resto como está.
- A importação casa equipes **pelo nome exato** (`findFirst({ eventId, name })`).
  Antes de importar, conferir as equipes que já existam no evento 2026 do
  StackPlus. Se alguma tiver grafia diferente, renomear para o nome oficial
  (ou ligar as duas), para não duplicar.
- O estado do evento 2026 no StackPlus (se existe, se a 6ª etapa e as equipes
  já foram criadas) **não foi confirmado**. O primeiro passo do plano é
  verificar isso em produção e criar o que faltar, antes de importar.
- Critério de aceite: o ranking acumulado do StackPlus, antes da 6ª etapa,
  é igual ao `/api/public/ranking-geral` da landing em produção, equipe por equipe.

### kingjogos.com.br (landing)

- O servidor da landing chama o feed do StackPlus com a chave guardada em env
  (`STACKPLUS_*`). O navegador nunca fala com o StackPlus direto. Cache curto
  no servidor (~5 s) para não multiplicar chamadas por visitante.
- As rotas públicas atuais da landing passam a responder com dados do
  StackPlus, **mantendo o formato JSON** que as páginas já consomem. Assim
  `ranking-batalha.html` e `index.html` mudam o mínimo possível.
  *(Minha decisão; se o builder achar melhor um formato novo, ajusta as páginas.)*
- As páginas recarregam os dados sozinhas a cada ~10 s enquanto abertas.
- Se o StackPlus estiver fora do ar, o site mostra o último dado bom em cache,
  em vez de erro.
- O formato antigo usa ids numéricos de etapa; o StackPlus usa ids string.
  O builder adapta.

### Tempo real

Polling (servidor da landing → StackPlus; navegador → landing). Não usa socket
no site público. *(Minha decisão: é o padrão que já funciona com o site da SPT e é
mais simples de colocar no ar em 2 dias.)*

## Restrições

- Tem que estar em produção nos dois sistemas e validado **antes de 22/10**.
- StackPlus: seguir CLAUDE.md do repo (autorização no service layer por
  `eventId`, sem RLS, migrations Prisma com `docker-migrate.sh` no deploy).
- Deploy: StackPlus API no Railway; landing no Railway (push na `main`).
- Plano B *(minha decisão)*: ninguém lança em paralelo no admin antigo. Se o
  StackPlus ficar fora do ar durante a etapa, o site segue mostrando o último
  dado em cache. Voltar a landing a ler do SQLite (flag/env) só vale **antes
  da primeira eliminação** da 6ª etapa. Depois disso, o SQLite não tem a 6ª etapa.

## Deixado para o builder

- Nome/caminho exato das rotas, formato do JSON do feed, middleware de chave.
- Como identificar o evento/organizador KING e o critério de "temporada atual".
- Modelo para pontos-base no StackPlus.
- Script de exportação SQLite → formato `torneiodeequipes`.
- Intervalos exatos de cache/polling (dentro do alvo de ≤ 15 s).
