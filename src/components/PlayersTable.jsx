import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export default function PlayersTable({ players, onChange }) {
  const [savingId, setSavingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  async function updateRanking(id, newRanking){
    setSavingId(id)
    const { error } = await supabase.from('players').update({ fisct_ranking: Number(newRanking || 0) }).eq('id', id)
    setSavingId(null)
    if (error) { alert(error.message); return }
    onChange?.()
  }

  async function removePlayer(id){
    if (!confirm('Eliminare questo giocatore?')) return
    setDeletingId(id)
    const { error } = await supabase.from('players').delete().eq('id', id)
    setDeletingId(null)
    if (error) { alert(error.message); return }
    onChange?.()
  }

  return (
    <div className="table-responsive">
      <table className="table table-dark table-striped align-middle">
        <thead>
          <tr>
            <th>Giocatore</th>
            <th>Club</th>
            <th className="text-end">Ranking</th>
            <th style={{width:120}}></th>
          </tr>
        </thead>
        <tbody>
          {players.length === 0 && (
            <tr><td colSpan="4" className="text-secondary">Nessun giocatore inserito.</td></tr>
          )}
          {players.map(p => (
            <tr key={p.id}>
              <td>{p.first_name} {p.last_name}</td>
              <td>
  {p.clubs?.name ? (
    <div className="d-flex align-items-center gap-2">
      {p.clubs?.logo_url && (
        <img
          src={p.clubs.logo_url}
          alt=""
          width="24"
          height="24"
          style={{ objectFit: 'cover', borderRadius: '50%' }}
        />
      )}
      <span>{p.clubs.name}</span>
    </div>
  ) : (
    <span className="text-secondary">—</span>
  )}
</td>

              <td className="text-end">
                <input
                  type="number"
                  className="form-control form-control-sm text-end"
                  defaultValue={p.fisct_ranking}
                  onBlur={(e)=> {
                    const v = e.target.value
                    if (String(v) !== String(p.fisct_ranking)) updateRanking(p.id, v)
                  }}
                  disabled={savingId === p.id}
                  style={{maxWidth:120, marginLeft:'auto'}}
                />
              </td>
              <td className="text-end">
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={()=>removePlayer(p.id)}
                  disabled={deletingId === p.id}
                >
                  {deletingId === p.id ? '...' : 'Elimina'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}