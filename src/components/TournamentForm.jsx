import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function TournamentForm({ tournament, onChange }) {
  const [name, setName] = useState(tournament?.name || '')
  const [fields, setFields] = useState(tournament?.fields_total || 2)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleCreate(e){
    e.preventDefault()
    try{
      setSaving(true)
      setError(null)
      if (tournament) {
        const { error } = await supabase.from('tournaments').update({
          name: name.trim(),
          fields_total: Number(fields||1)
        }).eq('id', tournament.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('tournaments').insert([{ name: name.trim(), fields_total: Number(fields||1), status: 'signup' }])
        if (error) throw error
      }
      onChange?.()
    }catch(err){
      setError(err.message)
    }finally{
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleCreate} className="row g-2">
      {error && <div className="col-12"><div className="alert alert-danger">{error}</div></div>}
      <div className="col-12 col-md-6">
        <label className="form-label">Nome torneo</label>
        <input className="form-control" value={name} onChange={e=>setName(e.target.value)} placeholder="es. Open di Lucera" required />
      </div>
      <div className="col-12 col-md-3">
        <label className="form-label">Campi</label>
        <input type="number" min="1" className="form-control" value={fields} onChange={e=>setFields(e.target.value)} />
      </div>
      <div className="col-12 col-md-3 d-flex align-items-end">
        <button className="btn btn-primary w-100" disabled={saving}>{saving ? 'Salvataggio…' : (tournament ? 'Aggiorna' : 'Crea')}</button>
      </div>
    </form>
  )
}