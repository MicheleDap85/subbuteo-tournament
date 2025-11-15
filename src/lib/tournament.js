import { supabase } from './supabaseClient'

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Calcola fasce 1..4 in base a fisct_ranking (decrescente).
 * Scrive nella tabella tiers.
 */
export async function computeTiers(tournamentId) {
  // 1) leggi solo gli ID iscritti
  const { data: enr, error: e1 } = await supabase
    .from('enrollments')
    .select('player_id')
    .eq('tournament_id', tournamentId)

  if (e1) throw e1
  const playerIds = (enr || []).map(e => e.player_id)
  if (!playerIds.length) throw new Error('Nessun iscritto')

  // 2) carica i players di questi ID
  const { data: players, error: e2 } = await supabase
    .from('players')
    .select('id, fisct_ranking')
    .in('id', playerIds)

  if (e2) throw e2

  // 3) ordina per ranking desc e verifica multiplo di 4
  const sorted = [...players].sort((a,b) => (b.fisct_ranking || 0) - (a.fisct_ranking || 0))
  if (sorted.length % 4 !== 0) {
    throw new Error('Il numero di iscritti deve essere un multiplo di 4')
  }

  const n = sorted.length
  const block = n / 4

  const tiersRows = sorted.map((p, i) => ({
    tournament_id: tournamentId,
    player_id: p.id,
    tier: Math.floor(i / block) + 1
  }))

  // 4) pulisci e inserisci
  const { error: delErr } = await supabase.from('tiers').delete().eq('tournament_id', tournamentId)
  if (delErr) throw delErr

  const { error: insErr } = await supabase.from('tiers').insert(tiersRows)
  if (insErr) throw insErr

  return tiersRows
}

/**
 * Crea gruppi da 4 con 1 giocatore per fascia.
 * Restituisce array di gruppi con membri.
 */
export async function drawGroups(tournamentId) {
  // leggi solo player_id + tier dal torneo
  const { data: rows, error } = await supabase
    .from('tiers')
    .select('player_id, tier')
    .eq('tournament_id', tournamentId)

  if (error) throw error

  const byTier = [1,2,3,4].map(t => shuffle(rows.filter(r => r.tier === t)))
  const groupsCount = byTier[0]?.length || 0
  if (!groupsCount || byTier.some(tArr => tArr.length !== groupsCount)) {
    throw new Error('Fasce incoerenti: ricrea le fasce')
  }

  // pulizia (se rifai sorteggio)
  const { data: oldGroups } = await supabase
    .from('groups')
    .select('id')
    .eq('tournament_id', tournamentId)

  if (oldGroups?.length) {
    const oldIds = oldGroups.map(g => g.id)
    await supabase.from('group_members').delete().in('group_id', oldIds)
    await supabase.from('groups').delete().eq('tournament_id', tournamentId)
  }

  // crea gruppi A, B, C...
  const groupNames = Array.from({ length: groupsCount }, (_, i) => String.fromCharCode(65 + i))
  const { data: createdGroups, error: gErr } = await supabase
    .from('groups')
    .insert(groupNames.map(name => ({ tournament_id: tournamentId, name })))
    .select('id, name')

  if (gErr) throw gErr

  // distribuisci 1 per fascia per gruppo
  const members = []
  for (let g = 0; g < groupsCount; g++) {
    const groupId = createdGroups[g].id
    for (let t = 0; t < 4; t++) {
      const row = byTier[t][g]
      members.push({ group_id: groupId, player_id: row.player_id, tier: row.tier })
    }
  }

  const { error: mErr } = await supabase.from('group_members').insert(members)
  if (mErr) throw mErr

  return { groups: createdGroups, members }
}

/**
 * Genera i 3 turni del girone per ogni gruppo da 4 (A,B,C,D per tier 1..4).
 */
export async function buildGroupRoundsAndFixtures(tournamentId) {
  const { data: groups, error: gErr } = await supabase
    .from('groups')
    .select('id, name')
    .eq('tournament_id', tournamentId)
  if (gErr) throw gErr

  for (const g of groups) {
    const { data: members, error: mErr } = await supabase
      .from('group_members')
      .select('player_id, tier')
      .eq('group_id', g.id)
      .order('tier', { ascending: true })
    if (mErr) throw mErr

    if (members.length !== 4) throw new Error(`Il gruppo ${g.name} non ha 4 giocatori`)

    const [A,B,C,D] = members.map(x => x.player_id)

    // 3 rounds
    const { data: rounds, error: rErr } = await supabase
      .from('rounds')
      .insert([
        { tournament_id: tournamentId, group_id: g.id, index_small: 1 },
        { tournament_id: tournamentId, group_id: g.id, index_small: 2 },
        { tournament_id: tournamentId, group_id: g.id, index_small: 3 },
      ])
      .select('id, index_small')
    if (rErr) throw rErr

    const r1 = rounds.find(r=>r.index_small===1).id
    const r2 = rounds.find(r=>r.index_small===2).id
    const r3 = rounds.find(r=>r.index_small===3).id

    // Ogni turno ha 2 partite: slot_in_round = 1 (prima) e 2 (seconda).
    const f = [
      // Turno 1
      { tournament_id: tournamentId, group_id: g.id, round_id: r1, stage: 'group', home_player_id: A, away_player_id: B, referee_player_id: null, slot_in_round: 1 },
      { tournament_id: tournamentId, group_id: g.id, round_id: r1, stage: 'group', home_player_id: C, away_player_id: D, referee_player_id: null, slot_in_round: 2 },
      // Turno 2
      { tournament_id: tournamentId, group_id: g.id, round_id: r2, stage: 'group', home_player_id: A, away_player_id: C, referee_player_id: null, slot_in_round: 1 },
      { tournament_id: tournamentId, group_id: g.id, round_id: r2, stage: 'group', home_player_id: B, away_player_id: D, referee_player_id: null, slot_in_round: 2 },
      // Turno 3
      { tournament_id: tournamentId, group_id: g.id, round_id: r3, stage: 'group', home_player_id: A, away_player_id: D, referee_player_id: null, slot_in_round: 1 },
      { tournament_id: tournamentId, group_id: g.id, round_id: r3, stage: 'group', home_player_id: B, away_player_id: C, referee_player_id: null, slot_in_round: 2 },
    ]

    const { error: fErr } = await supabase.from('fixtures').insert(f)
    if (fErr) throw fErr
  }

  return true
}



/**
 * Assegna numeri di campo alle partite per round, in base a fields_total.
 */
export async function assignFieldsPerRound(tournamentId) {
  const { data: tour, error: tErr } = await supabase
    .from('tournaments')
    .select('id, fields_total')
    .eq('id', tournamentId)
    .single()
  if (tErr) throw tErr

  const fields = Math.max(1, tour.fields_total || 1)

  const { data: rounds, error: rErr } = await supabase
    .from('rounds')
    .select('id, index_small')
    .eq('tournament_id', tournamentId)
    .order('index_small', { ascending: true })
  if (rErr) throw rErr

  const roundIndexes = [...new Set(rounds.map(r=>r.index_small))].sort((a,b)=>a-b)

  for (const idx of roundIndexes) {
    const roundIds = rounds.filter(r=>r.index_small===idx).map(r=>r.id)

    // 1) prima tutte le partite slot_in_round = 1 (prime partite del turno dei vari gironi)
    for (const slotIn of [1, 2]) {
      const { data: fixes, error: fErr } = await supabase
        .from('fixtures')
        .select('id')
        .in('round_id', roundIds)
        .eq('slot_in_round', slotIn)
        .order('id', { ascending: true })
      if (fErr) throw fErr

      // assegna i campi in blocchi da "fields"
      let field = 1
      for (let i=0; i<fixes.length; i++) {
        const { error: uErr } = await supabase
          .from('fixtures')
          .update({ field_number: field })
          .eq('id', fixes[i].id)
        if (uErr) throw uErr
        field++
        if (field > fields) field = 1
      }
    }
  }

  return true
}


/**
 * Assegna arbitri globalmente per slot:
 * - mai dallo stesso girone della partita
 * - preferenza per arbitri di club diversi dai due giocatori
 * Richiede che i campi siano già stati assegnati (field_number) per derivare gli slot.
 */
export async function assignRefereesGlobal(tournamentId) {
  // 1) Giocatori iscritti al torneo
  const { data: enr, error: e1 } = await supabase
    .from('enrollments')
    .select('player_id')
    .eq('tournament_id', tournamentId)
  if (e1) throw e1
  const allPlayerIds = (enr || []).map(e => e.player_id)

  // 2) Mappa player -> club
  const { data: players, error: e2 } = await supabase
    .from('players')
    .select('id, club_id')
    .in('id', allPlayerIds)
  if (e2) throw e2
  const clubByPlayer = new Map(players.map(p => [p.id, p.club_id || null]))

  // 3) Mappa player -> group (solo gironi)
  const { data: gm, error: e3 } = await supabase
    .from('group_members')
    .select('group_id, player_id, groups:group_id(id)')
    .in('player_id', allPlayerIds)
  if (e3) throw e3
  const groupByPlayer = new Map(gm.map(r => [r.player_id, r.group_id]))

  // 4) Prendi i rounds in ordine e tutte le fixtures (con field_number)
  const { data: rounds, error: rErr } = await supabase
    .from('rounds')
    .select('id, index_small')
    .eq('tournament_id', tournamentId)
    .order('index_small', { ascending: true })
  if (rErr) throw rErr

  const roundIndexes = [...new Set(rounds.map(r=>r.index_small))].sort((a,b)=>a-b)

  // Numero campi (per dimensionare slot)
  const { data: tour, error: tErr } = await supabase
    .from('tournaments')
    .select('fields_total')
    .eq('id', tournamentId)
    .single()
  if (tErr) throw tErr
  const fields = Math.max(1, tour.fields_total || 1)

  for (const idx of roundIndexes) {
    const roundIds = rounds.filter(r=>r.index_small===idx).map(r=>r.id)

    const { data: fixes, error: fErr } = await supabase
      .from('fixtures')
      .select('id, group_id, field_number, home_player_id, away_player_id, referee_player_id')
      .in('round_id', roundIds)
      .order('id', { ascending: true })
    if (fErr) throw fErr

    // Ordina per field_number se già presente, altrimenti mantieni l'ordine
    const fixtures = [...fixes].sort((a,b) => {
      const af = a.field_number ?? 9999
      const bf = b.field_number ?? 9999
      if (af !== bf) return af - bf
      return a.id.localeCompare(b.id)
    })

    // Suddividi in slot da "fields" partite parallele
    for (let start = 0; start < fixtures.length; start += fields) {
      const slot = fixtures.slice(start, start + fields)

      // Giocatori in campo in questo slot
      const playingInSlot = new Set()
      slot.forEach(m => {
        playingInSlot.add(m.home_player_id)
        playingInSlot.add(m.away_player_id)
      })

      // Non riutilizzare lo stesso arbitro nello slot
      const usedRefs = new Set()

      // Per ogni match nello slot, assegna arbitro
      for (const match of slot) {
        const homeClub = clubByPlayer.get(match.home_player_id)
        const awayClub = clubByPlayer.get(match.away_player_id)

        // Candidati: tutti gli iscritti NON in campo nello slot, NON dello stesso girone della partita
        const candidates = allPlayerIds.filter(pid => {
          if (playingInSlot.has(pid)) return false
          if (groupByPlayer.get(pid) === match.group_id) return false // vincolo: non stesso girone
          if (usedRefs.has(pid)) return false
          return true
        })

        if (candidates.length === 0) {
          // Non assegnare arbitro violando la regola: lasciamo null e segnaliamo con errore esplicito
          throw new Error(`Non ci sono candidati arbitri disponibili per il round ${idx}. Aumenta i partecipanti o i campi.`)
        }

        // Preferenza: club diverso da entrambi i giocatori
        const preferred = candidates.filter(pid => {
          const c = clubByPlayer.get(pid)
          return c !== homeClub && c !== awayClub
        })

        const refId = (preferred[0] ?? candidates[0])

        // Aggiorna fixture
        const { error: uErr } = await supabase
          .from('fixtures')
          .update({ referee_player_id: refId })
          .eq('id', match.id)
        if (uErr) throw uErr

        usedRefs.add(refId)
      }
    }
  }

  return true
}
