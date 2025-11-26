import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import MatchTimer from './MatchTimer'
import { recomputeStandings } from '../lib/standings'

export default function MatchCard({ fixture, tournamentId, onConfirmed }) {
  const [homeGoals, setHomeGoals] = useState(0)
  const [awayGoals, setAwayGoals] = useState(0)
  const [phase, setPhase] = useState('pre')
  const [saving, setSaving] = useState(false)
  const confirmEnabled = phase === 'FT'

  // carica eventuale risultato già presente
  useEffect(() => {
    let ignore = false
    ;(async () => {
      const { data } = await supabase
        .from('results')
        .select('home_goals_ft, away_goals_ft')
        .eq('fixture_id', fixture.id)
        .maybeSingle()
      if (!ignore && data) {
        setHomeGoals(data.home_goals_ft ?? 0)
        setAwayGoals(data.away_goals_ft ?? 0)
      }
    })()
    return () => { ignore = true }
  }, [fixture.id])

  async function confirmResult(){
    try{
      setSaving(true)
      // upsert risultato FT
      const payload = {
        fixture_id: fixture.id,
        home_goals_ft: Number(homeGoals||0),
        away_goals_ft: Number(awayGoals||0),
        went_extra_time: false
      }
      // upsert: prova update, se 0 righe inserisci
      const { data: existing } = await supabase.from('results').select('id').eq('fixture_id', fixture.id).maybeSingle()
      if (existing?.id) {
        const { error: uErr } = await supabase.from('results').update(payload).eq('id', existing.id)
        if (uErr) throw uErr
      } else {
        const { error: iErr } = await supabase.from('results').insert([payload])
        if (iErr) throw iErr
      }

      // ricomputa standings solo per gironi
      if (fixture.stage === 'group'){
        await recomputeStandings(tournamentId)
      }

      onConfirmed?.()
    }catch(err){
      alert(err.message)
    }finally{
      setSaving(false)
    }
  }

  return (
    <div className="card h-100">
      <div className="card-body d-flex flex-column">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div className="small text-secondary">Campo <strong>{fixture.field_number ?? '-'}</strong></div>
          <div className="small text-secondary">Round {fixture.round_index ?? '?'}</div>
        </div>

        <div className="d-flex justify-content-between align-items-center mb-3">
          <div className="text-truncate">
            <div className="fw-semibold match-player-name">{fixture.home.first_name} {fixture.home.last_name}</div>
            <div className="small match-vs">vs</div>
            <div className="fw-semibold match-player-name">{fixture.away.first_name} {fixture.away.last_name}</div>
            <div className="small text-secondary">Arbitro: {fixture.referee?.first_name} {fixture.referee?.last_name}</div>
          </div>
          <div style={{minWidth:110}}>
            <MatchTimer onPhaseChange={setPhase} />
          </div>
        </div>

        <div className="row g-2 mb-3">
          <div className="col">
            <label className="form-label small">Gol Casa</label>
            <input type="number" className="form-control" value={homeGoals} onChange={e=>setHomeGoals(e.target.value)} />
          </div>
          <div className="col">
            <label className="form-label small">Gol Ospiti</label>
            <input type="number" className="form-control" value={awayGoals} onChange={e=>setAwayGoals(e.target.value)} />
          </div>
        </div>

        <div className="mt-auto">
          <button
            className="btn btn-success w-100"
            disabled={!confirmEnabled || saving}
            onClick={confirmResult}
            title={!confirmEnabled ? 'Attendi la fine del 2° tempo' : ''}
          >
            {saving ? 'Salvataggio…' : 'Conferma risultato'}
          </button>
        </div>
      </div>
    </div>
  )
}
