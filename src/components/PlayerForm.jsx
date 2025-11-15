import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function PlayerForm({ clubs, onCreated }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [ranking, setRanking] = useState('')
  const [clubId, setClubId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e){
    e.preventDefault()
    setError(null)
    try{
      setSaving(true)
      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        fisct_ranking: Number(ranking || 0),
        club_id: clubId || null
      }
      const { error } = await supabase.from('players').insert([payload])
      if (error) throw error
      setFirstName('')
      setLastName('')
      setRanking('')
      setClubId('')
      onCreated?.()
    }catch(err){
      setError(err.message)
    }finally{
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="row g-2">
        <div className="col-12 col-md-6">
          <label className="form-label">Nome</label>
          <input className="form-control" value={firstName} onChange={(e)=>setFirstName(e.target.value)} required />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label">Cognome</label>
          <input className="form-control" value={lastName} onChange={(e)=>setLastName(e.target.value)} required />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label">Ranking FISCT</label>
          <input type="number" inputMode="numeric" className="form-control" value={ranking} onChange={(e)=>setRanking(e.target.value)} placeholder="es. 1200" />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label">Club</label>
          <select className="form-select" value={clubId} onChange={(e)=>setClubId(e.target.value)}>
            <option value="">— Nessuno —</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="col-12">
          <button className="btn btn-primary w-100" disabled={saving}>
            {saving ? 'Salvataggio…' : 'Aggiungi Giocatore'}
          </button>
        </div>
      </div>
    </form>
  )
}
