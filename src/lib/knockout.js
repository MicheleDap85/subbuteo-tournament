import supabase from '../lib/supabaseClient.js'

/**
 * Restituisce tutte le fixture KO di un torneo (gold, silver, ecc.)
 * con risultati e info giocatori già joinate.
 */
export async function fetchKoFixtures(tournamentId) {
  const { data, error } = await supabase
    .from('fixtures')
    .select(`
      *,
      home:home_player_id ( id, name ),
      away:away_player_id ( id, name ),
      results (
        id,
        fixture_id,
        home_goals_ft,
        away_goals_ft,
        et_home_goals,
        et_away_goals,
        pen_home_goals,
        pen_away_goals,
        went_extra_time
      )
    `)
    .eq('tournament_id', tournamentId)
    .neq('stage', 'group')
    .order('stage', { ascending: true })
    .order('round_order', { ascending: true })
    .order('id', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Ritorna tutte le fixture KO di uno specifico stage e round
 */
export async function fetchKoRoundFixtures(tournamentId, stage, roundOrder) {
  const { data, error } = await supabase
    .from('fixtures')
    .select(`
      *,
      home:home_player_id ( id, name ),
      away:away_player_id ( id, name ),
      results (
        id,
        fixture_id,
        home_goals_ft,
        away_goals_ft,
        et_home_goals,
        et_away_goals,
        pen_home_goals,
        pen_away_goals,
        went_extra_time
      )
    `)
    .eq('tournament_id', tournamentId)
    .eq('stage', stage)
    .eq('round_order', roundOrder)
    .order('id', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Funzione di supporto per capire chi ha vinto una fixture KO
 */
function getWinnerId(fixture) {
  const res = fixture.results?.[0]
  if (!res) return null

  const {
    home_goals_ft,
    away_goals_ft,
    et_home_goals,
    et_away_goals,
    pen_home_goals,
    pen_away_goals,
    went_extra_time
  } = res

  // risultato finale dopo eventuali supplementari
  const h = Number(et_home_goals ?? home_goals_ft ?? 0)
  const a = Number(et_away_goals ?? away_goals_ft ?? 0)

  if (h > a) return fixture.home_player_id
  if (a > h) return fixture.away_player_id

  // in caso di pareggio, usa rigori
  if (pen_home_goals != null && pen_away_goals != null) {
    return pen_home_goals > pen_away_goals
      ? fixture.home_player_id
      : fixture.away_player_id
  }

  return null
}

/**
 * Quando tutte le partite di un round KO sono completate, crea il round successivo.
 * Funziona sia per gold che per silver.
 */
export async function progressKoIfRoundComplete(tournamentId) {
  const { data: fixtures, error } = await supabase
    .from('fixtures')
    .select(`
      *,
      results ( id, home_goals_ft, away_goals_ft, et_home_goals, et_away_goals, pen_home_goals, pen_away_goals )
    `)
    .eq('tournament_id', tournamentId)
    .neq('stage', 'group')
    .order('stage', { ascending: true })
    .order('round_order', { ascending: true })

  if (error) throw error
  if (!fixtures?.length) return

  const stages = [...new Set(fixtures.map(f => f.stage))]
  for (const stage of stages) {
    const stageFixtures = fixtures.filter(f => f.stage === stage)
    const rounds = [...new Set(stageFixtures.map(f => f.round_order))].sort((a, b) => a - b)

    for (const roundOrder of rounds) {
      const roundFixtures = stageFixtures.filter(f => f.round_order === roundOrder)
      const allHaveResults = roundFixtures.every(f => f.results?.length)

      if (!allHaveResults) continue // aspetta finché tutte hanno risultato

      // se il round successivo non esiste già, crealo
      const { data: nextExists, error: nextErr } = await supabase
        .from('fixtures')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('stage', stage)
        .eq('round_order', roundOrder + 1)
      if (nextErr) throw nextErr
      if (nextExists?.length) continue

      const winners = roundFixtures.map(getWinnerId).filter(Boolean)
      if (winners.length < 2) continue

      const nextRoundName =
        winners.length === 4 ? 'semi'
        : winners.length === 2 ? 'final'
        : 'completed'

      const newFixtures = []
      for (let i = 0; i < winners.length; i += 2) {
        newFixtures.push({
          tournament_id: tournamentId,
          stage,
          round_name: nextRoundName,
          round_order: roundOrder + 1,
          home_player_id: winners[i],
          away_player_id: winners[i + 1],
          is_third_place: false,
          field_number: null
        })
      }

      if (newFixtures.length) {
        const { error: insErr } = await supabase.from('fixtures').insert(newFixtures)
        if (insErr) throw insErr
      }
    }
  }
}

/**
 * Inserisce o aggiorna il risultato di una partita KO
 * e richiama progressKoIfRoundComplete per avanzare se serve.
 */
export async function submitKoResult(tournamentId, fixtureId, {
  ftH, ftA,
  useET, etH, etA,
  usePens, penH, penA
}) {
  const toNumOrNull = v => (v === '' || v === undefined || v === null) ? null : Number(v)

  const payload = {
    fixture_id: fixtureId,
    home_goals_ft: toNumOrNull(ftH),
    away_goals_ft: toNumOrNull(ftA),
    et_home_goals: useET ? toNumOrNull(etH) : null,
    et_away_goals: useET ? toNumOrNull(etA) : null,
    pen_home_goals: usePens ? toNumOrNull(penH) : null,
    pen_away_goals: usePens ? toNumOrNull(penA) : null,
    went_extra_time: !!useET
  }

  const { data: existing, error: selErr } = await supabase
    .from('results').select('id').eq('fixture_id', fixtureId).maybeSingle()
  if (selErr) throw selErr

  if (existing?.id) {
    const { error: upErr } = await supabase.from('results')
      .update(payload).eq('id', existing.id)
    if (upErr) throw upErr
  } else {
    const { error: insErr } = await supabase.from('results')
      .insert([payload])
    if (insErr) throw insErr
  }

  await progressKoIfRoundComplete(tournamentId)
}

/**
 * Genera i KO di partenza (quarti GOLD/SILVER) a partire dai ranking FISCT
 * Cancella eventuali KO preesistenti e reinserisce le fixture.
 */
export async function generateKnockout(tournamentId) {
  // 1) cancella eventuali KO preesistenti
  const { data: oldFx } = await supabase
    .from('fixtures')
    .select('id')
    .eq('tournament_id', tournamentId)
    .neq('stage', 'group')

  if (oldFx?.length) {
    const oldIds = oldFx.map(f => f.id)
    await supabase.from('results').delete().in('fixture_id', oldIds)
    await supabase.from('fixtures')
      .delete()
      .eq('tournament_id', tournamentId)
      .neq('stage', 'group')
  }

  // 2) prendi iscritti e ranking
  const { data: enr, error: e1 } = await supabase
    .from('enrollments')
    .select('player_id, players:player_id(id, fisct_ranking)')
    .eq('tournament_id', tournamentId)
  if (e1) throw e1

  const ranked = (enr || [])
    .map(e => ({ id: e.players?.id, r: Number(e.players?.fisct_ranking ?? 0) }))
    .filter(p => !!p.id)
    .sort((a, b) => b.r - a.r)

  const goldSeeds = ranked.slice(0, 8).map(x => x.id)
  const silverSeeds = ranked.slice(8, 16).map(x => x.id)

  // helper: crea accoppiamenti 1–8, 4–5, 2–7, 3–6
  function makeQuarters(ids) {
    if (ids.length < 8) return []
    const order = [0, 7, 3, 4, 1, 6, 2, 5]
    const pairs = []
    for (let i = 0; i < order.length; i += 2) {
      const h = ids[order[i]]
      const a = ids[order[i + 1]]
      pairs.push([h, a])
    }
    return pairs
  }

  const goldPairs = makeQuarters(goldSeeds)
  const silverPairs = makeQuarters(silverSeeds)

  const insertRows = []

  for (const [h, a] of goldPairs) {
    insertRows.push({
      tournament_id: tournamentId,
      stage: 'gold',
      round_name: 'quarter',
      round_order: 1,
      is_third_place: false,
      home_player_id: h,
      away_player_id: a,
      field_number: null
    })
  }
  for (const [h, a] of silverPairs) {
    insertRows.push({
      tournament_id: tournamentId,
      stage: 'silver',
      round_name: 'quarter',
      round_order: 1,
      is_third_place: false,
      home_player_id: h,
      away_player_id: a,
      field_number: null
    })
  }

  if (insertRows.length) {
    const { error: insErr } = await supabase.from('fixtures').insert(insertRows)
    if (insErr) throw insErr
  }

  return { goldCount: goldPairs.length * 2, silverCount: silverPairs.length * 2 }
}
