import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import MatchTimer from '../components/MatchTimer'
import KoMatchRow from '../components/KoMatchRow'
import { progressKoIfRoundComplete } from '../lib/knockout'

function groupBy(arr, keyFn) {
  const m = new Map()
  for (const x of arr || []) {
    const k = keyFn(x)
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(x)
  }
  return m
}

export default function GiocoKO() {
  const [tournament, setTournament] = useState(null)
  const [fixtures, setFixtures] = useState([])
  const [players, setPlayers] = useState([])
  const [currentRound, setCurrentRound] = useState(null)
  const [slots, setSlots] = useState([])
  const [lockedSlots, setLockedSlots] = useState({}) // { [slotIndex]: true }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  function isScored(fx) {
    return !!fx.score
  }

  async function loadKO() {
    try {
      setLoading(true); setError(null)

      const { data: t } = await supabase
        .from('tournaments')
        .select('id, name, fields_total')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!t) { setTournament(null); setFixtures([]); setPlayers([]); setCurrentRound(null); setSlots([]); return }
      setTournament(t)
      const fields = Math.max(1, Number(t.fields_total || 1))

      // giocatori iscritti
      const { data: enr } = await supabase
        .from('enrollments')
        .select('player_id, players:player_id(id, first_name, last_name)')
        .eq('tournament_id', t.id)
      const allPlayers = (enr || []).map(e => e.players).filter(Boolean)
      setPlayers(allPlayers)

      // fixtures KO + join risultati
      const { data: fxRaw } = await supabase
        .from('fixtures')
        .select(`
          id, tournament_id, stage, round_name, round_order, field_number,
          home_player_id, away_player_id, referee_player_id, referee_external_name,
          home:home_player_id(first_name,last_name),
          away:away_player_id(first_name,last_name)
        `)
        .eq('tournament_id', t.id)
        .neq('stage', 'group')
        .order('round_order', { ascending: true })
        .order('id', { ascending: true })

      const ids = (fxRaw || []).map(f => f.id)
      let scoreById = {}
      if (ids.length) {
        const { data: rs } = await supabase
          .from('results')
          .select('fixture_id, home_goals_ft, away_goals_ft, et_home_goals, et_away_goals, pen_home_goals, pen_away_goals')
          .in('fixture_id', ids)
        for (const r of (rs || [])) {
          scoreById[r.fixture_id] = {
            ftH: r.home_goals_ft, ftA: r.away_goals_ft,
            etH: r.et_home_goals, etA: r.et_away_goals,
            penH: r.pen_home_goals, penA: r.pen_away_goals
          }
        }
      }

      const fx = (fxRaw || []).map(f => ({ ...f, score: scoreById[f.id] || null }))
      setFixtures(fx)

      // round attivo = primo con qualche partita senza score
      const byRoundOrder = groupBy(fx, f => f.round_order ?? 0)
      const candidateOrders = [...byRoundOrder.keys()].sort((a, b) => a - b)
      let activeOrder = null
      for (const ord of candidateOrders) {
        const list = byRoundOrder.get(ord) || []
        const hasOpen = list.some(f => !isScored(f))
        if (hasOpen) { activeOrder = ord; break }
      }
      if (activeOrder === null && candidateOrders.length) {
        activeOrder = candidateOrders[candidateOrders.length - 1]
      }

      const activeFixtures = (byRoundOrder.get(activeOrder) || [])
      const roundName = activeFixtures[0]?.round_name || null
      setCurrentRound(roundName ? { name: roundName, order: activeOrder } : null)

      // costruisci waves per numero campi
      const waves = []
      for (let w = 0; w < Math.ceil(activeFixtures.length / fields); w++) {
        const slice = activeFixtures.slice(w * fields, (w + 1) * fields)

        // giocatori liberi in questa wave
        const busyIds = new Set(slice.flatMap(f => [f.home_player_id, f.away_player_id]).filter(Boolean))
        const freePlayers = allPlayers.filter(p => !busyIds.has(p.id))

        waves.push({
          index: w + 1,
          fixtures: slice,
          fieldsUsed: slice.map(f => f.field_number).filter(x => x != null),
          freePlayers
        })
      }
      setSlots(waves)

      // sblocca lock per waves con fixture riaperte
      setLockedSlots(prev => {
        const next = { ...prev }
        for (const wave of waves) {
          const allScored = wave.fixtures.every(isScored)
          if (!allScored) next[wave.index] = false
        }
        return next
      })
    } catch (e) {
      console.error(e)
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadKO() }, [])

  async function handleConfirmWave(slotIndex) {
    // Abilita lock per la wave
    setLockedSlots(s => ({ ...s, [slotIndex]: true }))

    // Se l'intero round è completato, avanza
    try {
      await progressKoIfRoundComplete(tournament.id)
    } catch (e) {
      console.error('[KO] progressKoIfRoundComplete', e)
    } finally {
      await loadKO()
    }
  }

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h3 mb-0">Gioco (Fasi KO)</h1>
        <div className="d-flex align-items-center gap-2">
          {tournament && (
            <small className="text-secondary">Torneo: <strong>{tournament.name}</strong></small>
          )}
          <button className="btn btn-outline-light btn-sm" onClick={loadKO} disabled={loading}>
            {loading ? (
              <>
                <span className="loading-spinner me-1" style={{ display: 'inline-block' }}></span>
                Caricamento...
              </>
            ) : 'Aggiorna'}
          </button>
        </div>
      </div>

      {currentRound && (
        <div className="alert alert-secondary py-2" style={{ animation: 'slideInUp 0.4s ease-out' }}>
          Round attivo: <strong>{currentRound.name}</strong>
        </div>
      )}
      {error && <div className="alert alert-danger" style={{ animation: 'slideInUp 0.4s ease-out' }}>{error}</div>}
      {!fixtures.length && !loading && <p className="text-secondary">Nessuna partita KO.</p>}

      {/* Waves del round attivo */}
      <div className="d-flex flex-column gap-4">
        {slots.map((slot) => {
          const fieldsLabel = slot.fieldsUsed.length
            ? `Campi attivi: ${slot.fieldsUsed.join(', ')}`
            : `Campi attivi: assegnare numeri di campo`
          const allScored = slot.fixtures.every(isScored)
          const locked = !!lockedSlots[slot.index]

          return (
            <div key={slot.index} className="card">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <div className="fw-bold">{fieldsLabel}</div>
                  <MatchTimer onPhaseChange={()=>{}} locked={locked} allowExtraTime />
                </div>

                <div className="d-flex flex-column gap-2 mb-2">
                  {slot.fixtures.map(fx => (
                    <KoMatchRow
                      key={fx.id}
                      fx={fx}
                      tournamentId={tournament?.id}
                      locked={locked}
                      onSaved={loadKO}
                      availableReferees={slot.freePlayers}
                    />
                  ))}
                </div>

                <div className="d-flex justify-content-end">
                  <button
                    className="btn btn-success"
                    disabled={!allScored || locked}
                    onClick={() => handleConfirmWave(slot.index)}
                  >
                    Conferma turno
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {slots.length === 0 && !loading && (
        <p className="text-secondary mt-3">Nessuna wave da giocare nel round attivo.</p>
      )}
    </div>
  )
}
