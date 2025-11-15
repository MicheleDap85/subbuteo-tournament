import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { recomputeStandings } from '../lib/standings'
import MatchTimer from './MatchTimer'
import SlotRow from './SlotRow'

export default function SlotCard({
  slot = { roundIndex: 1, slotInRound: 1, waveIndex: 1, fixtures: [] },
  tournamentId,
  onAnyConfirmed
}) {
  // slot = { roundIndex, slotInRound, waveIndex, fixtures: [...] }
  const [phase, setPhase] = useState('pre')
  const [saving, setSaving] = useState(false)
  const [confirmedAll, setConfirmedAll] = useState(false)
  // { [fixtureId]: { home:number, away:number, existing:boolean } }
  const [scores, setScores] = useState({})

  // Turno visuale: (round-1)*2 + slotInRound
  const displayTurn = Math.max(
    1,
    ((slot?.roundIndex ?? 1) - 1) * 2 + (slot?.slotInRound ?? 1)
  )
  const confirmEnabled = phase === 'FT' && !confirmedAll

  // Carica risultati già presenti per le fixture dello slot
  useEffect(() => {
    let ignore = false
    ;(async () => {
      const fx = Array.isArray(slot?.fixtures) ? slot.fixtures : []
      const ids = fx.map(f => f.id)
      if (!ids.length) {
        setScores({})
        setConfirmedAll(false)
        return
      }

      const { data, error } = await supabase
        .from('results')
        .select('fixture_id, home_goals_ft, away_goals_ft')
        .in('fixture_id', ids)

      if (error) {
        console.error('Load results error:', error)
        if (!ignore) { setScores({}); setConfirmedAll(false) }
        return
      }

      const byId = {}
      for (const f of fx) {
        byId[f.id] = { home: 0, away: 0, existing: false }
      }
      for (const r of (data || [])) {
        byId[r.fixture_id] = {
          home: Number(r.home_goals_ft ?? 0),
          away: Number(r.away_goals_ft ?? 0),
          existing: true
        }
      }

      if (!ignore) {
        setScores(byId)
        const allExisting = fx.length > 0 && fx.every(f => byId[f.id]?.existing)
        setConfirmedAll(allExisting)
      }
    })()
    return () => { ignore = true }
  }, [slot?.fixtures])

  function updateScore(fixtureId, val){
    setScores(prev => ({
      ...prev,
      [fixtureId]: {
        ...(prev[fixtureId] || { home: 0, away: 0, existing: false }),
        ...val
      }
    }))
  }

  async function confirmAll(){
    if (!confirmEnabled) return
    try{
      setSaving(true)

      const fx = Array.isArray(slot?.fixtures) ? slot.fixtures : []
      const rows = fx.map(fxItem => {
        const s = scores[fxItem.id] || { home: 0, away: 0 }
        return {
          fixture_id: fxItem.id,
          home_goals_ft: Number(s.home || 0),
          away_goals_ft: Number(s.away || 0),
          went_extra_time: false
        }
      })

      // salva tutti i risultati dello slot
      if (rows.length) {
        const { error: upErr } = await supabase
          .from('results')
          .upsert(rows, { onConflict: 'fixture_id' })
        if (upErr) throw upErr
      }

      // ricomputa standings (fase gironi)
      if (tournamentId) {
        await recomputeStandings(tournamentId)
      }

      // marca come confermato e blocca UI
      setScores(prev => {
        const clone = { ...prev }
        for (const fxItem of fx) {
          if (!clone[fxItem.id]) clone[fxItem.id] = { home: 0, away: 0, existing: true }
          else clone[fxItem.id].existing = true
        }
        return clone
      })
      setConfirmedAll(true)
      onAnyConfirmed?.()
    }catch(err){
      alert(err.message)
    }finally{
      setSaving(false)
    }
  }

  // Se slot invalido, mostra card neutra
  if (!slot || !Array.isArray(slot.fixtures)) {
    return (
      <div className="card">
        <div className="card-body text-secondary">Nessuna partita in questo slot.</div>
      </div>
    )
  }

  return (
    <div className="card h-100">
      <div className="card-body d-flex flex-column">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div className="fw-semibold">
            Turno {displayTurn}{' '}
            {slot?.waveIndex > 1 && (
              <span className="small text-secondary">(onda {slot.waveIndex})</span>
            )}
          </div>
          {/* Timer bloccato quando turno confermato */}
          <MatchTimer onPhaseChange={setPhase} locked={confirmedAll} />
        </div>

        {/* Elenco partite dello slot */}
        <div className="d-flex flex-column gap-2">
          {slot.fixtures.map(fx => {
            const sc = scores[fx.id] || { home: 0, away: 0, existing: false }
            const showScore = confirmedAll || sc.existing
            return (
              <SlotRow
                key={fx.id}
                fixture={fx}
                value={{ home: sc.home, away: sc.away }}
                onChange={(val)=> updateScore(fx.id, val)}
                disabled={confirmedAll}
                showScore={showScore}
                showFT={confirmedAll}
              />
            )
          })}
          {slot.fixtures.length === 0 && (
            <div className="text-secondary">Nessuna partita.</div>
          )}
        </div>

        <div className="mt-3 d-flex gap-2">
          <button
            className="btn btn-success flex-grow-1"
            onClick={confirmAll}
            disabled={!confirmEnabled || saving}
            title={!confirmEnabled ? 'Disponibile a fine 2° tempo' : ''}
          >
            {saving ? 'Salvataggio…' : 'Conferma turno'}
          </button>
          {confirmedAll && (
            <span className="align-self-center text-success fw-semibold">✅ Turno confermato</span>
          )}
        </div>
      </div>
    </div>
  )
}