import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { recomputeStandings } from '../lib/standings'

export default function MatchRow({ fixture, tournamentId, phase, onConfirmed }) {
  const [homeGoals, setHomeGoals] = useState(0)
  const [awayGoals, setAwayGoals] = useState(0)
  const [saving, setSaving] = useState(false)
  const [confirmed, setConfirmed] = useState(false) // <<< dichiarato a livello top del componente

  const confirmEnabled = phase === 'FT'

  // Carica eventuale risultato già presente e “blocca” se esiste
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
        setConfirmed(true) // risultato già presente -> blocca
      }
    })()
    return () => { ignore = true }
  }, [fixture.id])

  async function confirmResult(){
    try{
      setSaving(true)
      const payload = {
        fixture_id: fixture.id,
        home_goals_ft: Number(homeGoals||0),
        away_goals_ft: Number(awayGoals||0),
        went_extra_time: false
      }
      const { data: existing } = await supabase
        .from('results').select('id').eq('fixture_id', fixture.id).maybeSingle()

      if (existing?.id) {
        const { error: uErr } = await supabase.from('results').update(payload).eq('id', existing.id)
        if (uErr) throw uErr
      } else {
        const { error: iErr } = await supabase.from('results').insert([payload])
        if (iErr) throw iErr
      }

      if (fixture.stage === 'group'){
        await recomputeStandings(tournamentId)
      }

      setConfirmed(true)      // <<< blocca input e bottone
      onConfirmed?.()         // segnala allo SlotCard (che potrà bloccare il timer quando tutte confermate)
    }catch(err){
      alert(err.message)
    }finally{
      setSaving(false)
    }
  }

  return (
    <div className="d-flex align-items-center gap-2">
      <div className="flex-grow-1">
        <div className="fw-semibold text-truncate">
          {fixture.home.first_name} {fixture.home.last_name}
          <span className="text-secondary"> vs </span>
          {fixture.away.first_name} {fixture.away.last_name}
        </div>
        <div className="small text-secondary">
          Arbitro: {fixture.referee?.first_name} {fixture.referee?.last_name || ''} • Campo: <strong>{fixture.field_number ?? '-'}</strong>
        </div>
      </div>

      <input
        type="number"
        className="form-control form-control-sm text-end"
        style={{ width: 70 }}
        value={homeGoals}
        onChange={e=>setHomeGoals(e.target.value)}
        disabled={confirmed}
      />
      <span className="mx-1">–</span>
      <input
        type="number"
        className="form-control form-control-sm"
        style={{ width: 70 }}
        value={awayGoals}
        onChange={e=>setAwayGoals(e.target.value)}
        disabled={confirmed}
      />

      <button
        className={`btn btn-sm ${confirmed ? 'btn-secondary' : 'btn-success'}`}
        disabled={!confirmEnabled || saving || confirmed}
        onClick={confirmResult}
        title={!confirmEnabled ? 'Si abilita a fine 2° tempo' : ''}
      >
        {saving ? '...' : confirmed ? 'Confermato' : 'Conferma'}
      </button>
    </div>
  )
}