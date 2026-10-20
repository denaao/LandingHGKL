import { canonicalTeamName } from './team-names.js';

// Exporta a Batalha no formato `torneiodeequipes` que a importação do StackPlus lê
// (evento → Equipes → Importar). Só etapas finalizadas, com os nomes oficiais, e
// os pontos-base (pontos de antes do sistema de etapas).
export function exportarEquipes(db) {
  const etapas = db.prepare("SELECT id, nome, status, created_at FROM etapas WHERE status = 'finished' ORDER BY id").all();

  const pontosDaEquipe = db.prepare(`
    SELECT COALESCE(SUM(s.points), 0) AS total
    FROM seats s JOIN tables_t t ON s.table_id = t.id JOIN players p ON s.player_id = p.id
    WHERE p.etapa_team_id = ? AND t.etapa_id = ?
  `);

  return {
    origem: 'torneiodeequipes',
    exportadoEm: new Date().toISOString(),
    etapas: etapas.map((etapa) => {
      const times = db.prepare(`
        SELECT et.id AS etapa_team_id, gt.id AS global_id, gt.nome
        FROM etapa_teams et JOIN global_teams gt ON et.global_team_id = gt.id
        WHERE et.etapa_id = ? ORDER BY gt.id
      `).all(etapa.id);

      // Mesma regra do ranking geral: equipe sem ponto na etapa não conta. Variantes
      // do mesmo nome viram UMA equipe (o primeiro id global é a referência).
      const porNome = new Map();
      for (const t of times) {
        if (pontosDaEquipe.get(t.etapa_team_id, etapa.id).total <= 0) continue;
        const nome = canonicalTeamName(t.nome);
        if (!porNome.has(nome)) porNome.set(nome, { id: t.etapa_team_id, equipeGlobalId: t.global_id, nome, jogadores: [] });
        const jogadores = db.prepare('SELECT id, nome FROM players WHERE etapa_team_id = ? ORDER BY id').all(t.etapa_team_id);
        porNome.get(nome).jogadores.push(...jogadores);
      }

      const mesas = db.prepare('SELECT id, numero, phase FROM tables_t WHERE etapa_id = ? ORDER BY id').all(etapa.id);
      return {
        id: etapa.id,
        nome: etapa.nome,
        status: etapa.status,
        jogadoresPorEquipe: 4,
        jogadoresPorMesa: 8,
        criadaEm: etapa.created_at ? new Date(etapa.created_at.replace(' ', 'T') + 'Z').toISOString() : '',
        equipes: [...porNome.values()],
        mesas: mesas.map((m) => ({
          id: m.id,
          numero: m.numero,
          fase: m.phase === 'final' ? 'final' : 'qualifying',
          assentos: db.prepare('SELECT player_id, elimination_order, points FROM seats WHERE table_id = ? ORDER BY id').all(m.id)
            .map((s) => ({ jogadorId: s.player_id, ordemEliminacao: s.elimination_order, pontos: s.points ?? 0 })),
        })),
      };
    }),
    pontosBase: db.prepare('SELECT team_nome, points FROM team_base_points').all()
      .map((b) => ({ nome: canonicalTeamName(b.team_nome), pontos: b.points }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  };
}
