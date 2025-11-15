import { supabase } from './supabaseClient'

function emptyRow(tournament_id, group_id, player_id){
  return { tournament_id, group_id, player_id, played:0, won:0, drawn:0, lost:0, gf:0, ga:0, gd:0, points:0 }
}
function applyResult(row, gf, ga){
  row.played += 1
  row.gf += gf
  row.ga += ga
  row.gd = row.gf - row.ga
  if (gf > ga){ row.won += 1; row.points += 3 }
  else if (gf === ga){ row.drawn += 1; row.points += 1 }
  else { row.lost += 1 }
}

/**
 * Ricomputa le standings leggendo i risultati F/T direttamente da `results`
 * e joinando verso `fixtures` (affidabile con Supabase/PostgREST).
 */
export async function recomputeStandings(tournamentId){
  // gruppi del torneo
  const { data: groups, error: gErr } = await supabase
    .from('groups')
    .select('id')
    .eq('tournament_id', tournamentId)
  if (gErr) throw gErr

  // reset standings del torneo
  const { error: delErr } = await supabase.from('standings').delete().eq('tournament_id', tournamentId)
  if (delErr) throw delErr

  for (const g of (groups || [])) {
    // risultati delle partite di girone del gruppo g
    const { data: res, error: rErr } = await supabase
      .from('results')
      .select(`
        fixture_id, home_goals_ft, away_goals_ft,
        fixtures:fixture_id (
          group_id, stage,
          home_player_id, away_player_id
        )
      `)
    if (rErr) throw rErr

    // filtra solo le partite di questo gruppo e di stage 'group'
    const rows = (res || []).filter(r =>
      r.fixtures?.group_id === g.id && r.fixtures?.stage === 'group'
    )

    if (!rows.length) continue

    const table = new Map() // player_id -> row

    const ensure = (pid) => {
      if (!table.has(pid)) table.set(pid, emptyRow(tournamentId, g.id, pid))
      return table.get(pid)
    }

    for (const r of rows) {
      const homeId = r.fixtures.home_player_id
      const awayId = r.fixtures.away_player_id
      const hg = Number(r.home_goals_ft || 0)
      const ag = Number(r.away_goals_ft || 0)

      applyResult(ensure(homeId), hg, ag)
      applyResult(ensure(awayId), ag, hg)
    }

    const values = Array.from(table.values())
    if (values.length){
      const { error: insErr } = await supabase.from('standings').insert(values)
      if (insErr) throw insErr
    }
  }

  return true
}
