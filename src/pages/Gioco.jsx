// src/pages/Gioco.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import SlotCard from '../components/SlotCard'

/**
 * Helper: carica tutte le fixture dei gironi per una lista di round_id
 * e le raggruppa per round_id in una Map.
 */
async function fetchFixturesForRounds(roundIds) {
  if (!roundIds.length) return new Map()

  const { data: fx, error } = await supabase
    .from('fixtures')
    .select(`
      id, round_id, field_number, stage,
      home:home_player_id(first_name,last_name),
      away:away_player_id(first_name,last_name),
      referee:referee_player_id(first_name,last_name)
    `)
    .in('round_id', roundIds)
    .eq('stage', 'group') // 👈 mostra SOLO i gironi in questa pagina
    .order('id', { ascending: true })

  if (error) throw error

  const byRound = new Map()
  for (const id of roundIds) byRound.set(id, [])
  for (const f of fx || []) {
    const arr = byRound.get(f.round_id) || []
    arr.push(f)
    byRound.set(f.round_id, arr)
  }
  return byRound
}

export default function Gioco() {
  const [tournament, setTournament] = useState(null)
  const [rounds, setRounds] = useState([]) // { id, group_id, index_small }
  const [slots, setSlots] = useState([])   // [{ roundIndex, slotInRound, waveIndex, fixtures: [...] }]
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function loadGame() {
    try {
      setLoading(true)
      setError(null)

      // 1) Torneo più recente
      const { data: t, error: tErr } = await supabase
        .from('tournaments')
        .select('id, name, fields_total')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (tErr) throw tErr
      if (!t) {
        setTournament(null)
        setRounds([])
        setSlots([])
        return
      }
      setTournament(t)

      // 2) Gruppi del torneo
      const { data: groups, error: gErr } = await supabase
        .from('groups')
        .select('id')
        .eq('tournament_id', t.id)
      if (gErr) throw gErr
      const groupIds = (groups || []).map(g => g.id)
      if (!groupIds.length) {
        setRounds([])
        setSlots([])
        return
      }

      // 3) Rounds dei gironi (ordinati per "turno" crescente)
      const { data: rs, error: rErr } = await supabase
        .from('rounds')
        .select('id, group_id, index_small')
        .in('group_id', groupIds)
        .order('index_small', { ascending: true })
      if (rErr) throw rErr
      setRounds(rs || [])
      const roundIds = (rs || []).map(r => r.id)
      if (!roundIds.length) {
        setSlots([])
        return
      }

      // 4) Fixture per tutti i round dei gironi (senza usare variabile r fuori scope)
      const byRound = await fetchFixturesForRounds(roundIds)

      // 5) Costruzione degli "slot" per UI:
      //    - raggruppiamo per "index_small" (Turno N) unendo tutti i gruppi
      //    - spezzamo in "waves" in base ai campi disponibili (fields_total)
      const fields = Math.max(1, Number(t.fields_total || 1))
      const byIndex = new Map() // key: index_small -> array fixtures (sommate su tutti i gruppi)

      for (const r of (rs || [])) {
        const list = byRound.get(r.id) || []
        const acc = byIndex.get(r.index_small) || []
        acc.push(...list)
        byIndex.set(r.index_small, acc)
      }

      const nextSlots = []
      const orderedByIndex = [...byIndex.entries()].sort((a, b) => a[0] - b[0])

      for (const [idxSmall, fixtures] of orderedByIndex) {
        // per ogni Turno (index_small) suddividi in blocchi della dimensione dei campi disponibili
        const waves = Math.ceil((fixtures.length || 0) / fields)
        for (let w = 0; w < waves; w++) {
          const slice = fixtures.slice(w * fields, (w + 1) * fields)
          nextSlots.push({
            roundIndex: idxSmall, // "Turno N"
            slotInRound: w + 1,   // numero progressivo della wave nello stesso turno
            waveIndex: w + 1,     // uguale allo slotInRound, utile per etichetta
            fixtures: slice
          })
        }
      }

      setSlots(nextSlots)
    } catch (e) {
      console.error(e)
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadGame() }, [])

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h3 mb-0">Gioco (Gironi)</h1>
        <div className="d-flex align-items-center gap-2">
          {tournament && (
            <small className="text-secondary">Torneo: <strong>{tournament.name}</strong></small>
          )}
          <button className="btn btn-outline-light btn-sm" onClick={loadGame} disabled={loading}>
            {loading ? '...' : 'Aggiorna'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {!tournament && !loading && (
        <p className="text-secondary">Nessun torneo attivo.</p>
      )}

      <div className="d-flex flex-column gap-3">
        {slots.map((slot, i) => (
          <SlotCard
            key={`${slot.roundIndex}-${slot.slotInRound}-${i}`}
            slot={slot}
            tournamentId={tournament?.id}
            onAnyConfirmed={loadGame}
          />
        ))}
      </div>

      {slots.length === 0 && !loading && (
        <p className="text-secondary mt-3">Nessuna partita dei gironi da mostrare.</p>
      )}
    </div>
  )
}
