import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function EnrollmentManager({ tournament }) {
  const [players, setPlayers] = useState([])
  const [enrolledIds, setEnrolledIds] = useState(new Set())
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    setError(null)
    const [{ data: p }, { data: e }] = await Promise.all([
      supabase.from('players').select('id, first_name, last_name, fisct_ranking, club_id'),
      supabase.from('enrollments').select('player_id').eq('tournament_id', tournament.id)
    ])
    setPlayers(p || [])
    setEnrolledIds(new Set((e||[]).map(x=>x.player_id)))
  }

  useEffect(()=>{ load() }, [tournament?.id])

  function toggle(id) {
    const next = new Set(enrolledIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setEnrolledIds(next)
  }

  async function save() {
    try{
      setSaving(true)
      // rimuovi tutto e reinserisci (semplice per ora)
      await supabase.from('enrollments').delete().eq('tournament_id', tournament.id)
      if (enrolledIds.size){
        const rows = Array.from(enrolledIds).map(pid => ({ tournament_id: tournament.id, player_id: pid }))
        const { error } = await supabase.from('enrollments').insert(rows)
        if (error) throw error
      }
      alert('Iscrizioni salvate.')
    }catch(err){
      setError(err.message)
    }finally{
      setSaving(false)
    }
  }

  return (
    <div>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive" style={{maxHeight: 320, overflow:'auto'}}>
        <table className="table table-dark table-striped align-middle">
          <thead>
            <tr>
              <th style={{width:50}}></th>
              <th>Giocatore</th>
              <th className="text-end">Ranking</th>
            </tr>
          </thead>
          <tbody>
            {players.map(p => (
              <tr key={p.id}>
                <td>
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={enrolledIds.has(p.id)}
                    onChange={()=>toggle(p.id)}
                  />
                </td>
                <td>{p.first_name} {p.last_name}</td>
                <td className="text-end">{p.fisct_ranking ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 d-flex gap-2">
        <button className="btn btn-outline-light" onClick={load}>Ricarica</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvataggio…' : 'Salva iscrizioni'}</button>
      </div>
    </div>
  )
}