import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  computeTiers,
  drawGroups,
  buildGroupRoundsAndFixtures,
  assignFieldsPerRound,
  assignRefereesGlobal
} from '../lib/tournament'

export default function DrawActions({ tournament }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  async function runComputeTiers(){
    try{
      setBusy(true); setMsg(null); setErr(null)
      const tiers = await computeTiers(tournament.id)
      setMsg(`Fasce create: ${tiers.length} record`)
    }catch(e){ setErr(e.message) }
    finally{ setBusy(false) }
  }

  async function runDrawGroups(){
    try{
      setBusy(true); setMsg(null); setErr(null)
      const res = await drawGroups(tournament.id)
      setMsg(`Creati ${res.groups.length} gruppi con 4 membri ciascuno`)
      await supabase.from('tournaments').update({ status: 'draw' }).eq('id', tournament.id)
    }catch(e){ setErr(e.message) }
    finally{ setBusy(false) }
  }

  async function runBuildRounds(){
    try{
      setBusy(true); setMsg(null); setErr(null)
      await buildGroupRoundsAndFixtures(tournament.id)
      await assignFieldsPerRound(tournament.id)
      await assignRefereesGlobal(tournament.id) // arbitri globali: non del girone, preferibilmente club diverso
      await supabase.from('tournaments').update({ status: 'groups' }).eq('id', tournament.id)
      setMsg('Turni & partite generati, campi e arbitri assegnati')
    }catch(e){ setErr(e.message) }
    finally{ setBusy(false) }
  }

  return (
    <div>
      {err && <div className="alert alert-danger">{err}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}
      <div className="d-flex flex-wrap gap-2">
        <button className="btn btn-outline-light" disabled={busy} onClick={runComputeTiers}>1) Calcola Fasce</button>
        <button className="btn btn-outline-light" disabled={busy} onClick={runDrawGroups}>2) Sorteggio Gruppi</button>
        <button className="btn btn-primary" disabled={busy} onClick={runBuildRounds}>3) Genera Turni Gironi</button>
      </div>
      <p className="text-secondary small mt-2">Nota: puoi rieseguire gli step per rigenerare i dati (ripulisce fasce/gruppi/turni).</p>
    </div>
  )
}
