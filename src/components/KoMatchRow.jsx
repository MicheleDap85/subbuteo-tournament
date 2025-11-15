// src/components/KoMatchRow.jsx
import { useEffect, useMemo, useState } from 'react'
import { submitKoResult } from '../lib/knockout'
import { supabase } from '../lib/supabaseClient'

export default function KoMatchRow({
  fx,
  tournamentId,
  locked,
  onSaved,
  availableReferees = [] // [{id, first_name, last_name}]
}) {
  // stato punteggi
  const [ftH, setFtH] = useState(fx.score?.ftH ?? '')
  const [ftA, setFtA] = useState(fx.score?.ftA ?? '')
  const [useET, setUseET] = useState(fx.score?.etH != null || fx.score?.etA != null)
  const [etH, setEtH] = useState(fx.score?.etH ?? '')
  const [etA, setEtA] = useState(fx.score?.etA ?? '')
  const [usePens, setUsePens] = useState(fx.score?.penH != null || fx.score?.penA != null)
  const [penH, setPenH] = useState(fx.score?.penH ?? '')
  const [penA, setPenA] = useState(fx.score?.penA ?? '')

  // stato arbitro
  const initialRefType = fx.referee_player_id ? 'player' : (fx.referee_external_name ? 'external' : 'player')
  const [refType, setRefType] = useState(initialRefType) // 'player' | 'external'
  const [refereePlayerId, setRefereePlayerId] = useState(fx.referee_player_id ?? '')
  const [refereeExternalName, setRefereeExternalName] = useState(fx.referee_external_name ?? '')

  const [saving, setSaving] = useState(false)
  const [savingRef, setSavingRef] = useState(false)
  const [err, setErr] = useState(null)
  const [refErr, setRefErr] = useState(null)

  const disabled = !!locked || saving
  const disabledRef = !!locked || savingRef

  async function saveOne() {
    try {
      setSaving(true); setErr(null)
      await submitKoResult(tournamentId, fx.id, {
        ftH, ftA,
        useET, etH, etA,
        usePens, penH, penA
      })
      onSaved?.()
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  async function saveReferee() {
    try {
      setSavingRef(true); setRefErr(null)
      const patch = { referee_player_id: null, referee_external_name: null }
      if (refType === 'player') {
        patch.referee_player_id = refereePlayerId ? Number(refereePlayerId) : null
        patch.referee_external_name = null
      } else {
        patch.referee_player_id = null
        patch.referee_external_name = refereeExternalName?.trim() || null
      }
      const { error } = await supabase
        .from('fixtures')
        .update(patch)
        .eq('id', fx.id)
      if (error) throw error
      onSaved?.()
    } catch (e) {
      setRefErr(e.message || String(e))
    } finally {
      setSavingRef(false)
    }
  }

  return (
    <div className="border rounded p-2">
      {/* header riga: nomi + campo */}
      <div className="d-flex justify-content-between align-items-center">
        <div className="me-2 text-truncate">
          <strong>{fx.home?.first_name} {fx.home?.last_name}</strong>
          <span className="text-secondary"> vs </span>
          <strong>{fx.away?.first_name} {fx.away?.last_name}</strong>
          <span className="ms-2 badge bg-secondary">Campo {fx.field_number ?? '-'}</span>
        </div>
        {fx.score && (
          <span className="badge bg-success">
            {Number(fx.score.ftH ?? 0)}–{Number(fx.score.ftA ?? 0)}
          </span>
        )}
      </div>

      {/* FT */}
      <div className="d-flex align-items-center gap-2 mt-2">
        <input type="number" className="form-control form-control-sm text-end" style={{ width: 70 }}
               placeholder="FT H" value={ftH} onChange={e=>setFtH(e.target.value)} disabled={disabled} />
        <span>–</span>
        <input type="number" className="form-control form-control-sm" style={{ width: 70 }}
               placeholder="FT A" value={ftA} onChange={e=>setFtA(e.target.value)} disabled={disabled} />
      </div>

      {/* ET */}
      <div className="form-check form-switch mt-2">
        <input className="form-check-input" type="checkbox" id={`et-${fx.id}`}
               checked={useET} onChange={e=>setUseET(e.target.checked)} disabled={disabled} />
        <label className="form-check-label" htmlFor={`et-${fx.id}`}>Supplementari (2×10)</label>
      </div>
      {useET && (
        <div className="d-flex align-items-center gap-2 mt-1">
          <input type="number" className="form-control form-control-sm text-end" style={{ width: 70 }}
                 placeholder="ET H" value={etH} onChange={e=>setEtH(e.target.value)} disabled={disabled} />
          <span>–</span>
          <input type="number" className="form-control form-control-sm" style={{ width: 70 }}
                 placeholder="ET A" value={etA} onChange={e=>setEtA(e.target.value)} disabled={disabled} />
        </div>
      )}

      {/* PENS */}
      <div className="form-check form-switch mt-2">
        <input className="form-check-input" type="checkbox" id={`pen-${fx.id}`}
               checked={usePens} onChange={e=>setUsePens(e.target.checked)} disabled={disabled} />
        <label className="form-check-label" htmlFor={`pen-${fx.id}`}>Rigori</label>
      </div>
      {usePens && (
        <div className="d-flex align-items-center gap-2 mt-1">
          <input type="number" className="form-control form-control-sm text-end" style={{ width: 70 }}
                 placeholder="Rig H" value={penH} onChange={e=>setPenH(e.target.value)} disabled={disabled} />
          <span>–</span>
          <input type="number" className="form-control form-control-sm" style={{ width: 70 }}
                 placeholder="Rig A" value={penA} onChange={e=>setPenA(e.target.value)} disabled={disabled} />
        </div>
      )}

      {/* Arbitro */}
      <div className="mt-3">
        <div className="form-check form-check-inline">
          <input className="form-check-input" type="radio" id={`rptype-player-${fx.id}`}
                 checked={refType === 'player'} onChange={()=>setRefType('player')} disabled={disabledRef}/>
          <label className="form-check-label" htmlFor={`rptype-player-${fx.id}`}>Arbitro (Giocatore)</label>
        </div>
        <div className="form-check form-check-inline">
          <input className="form-check-input" type="radio" id={`rptype-external-${fx.id}`}
                 checked={refType === 'external'} onChange={()=>setRefType('external')} disabled={disabledRef}/>
          <label className="form-check-label" htmlFor={`rptype-external-${fx.id}`}>Arbitro esterno</label>
        </div>

        {refType === 'player' ? (
          <div className="mt-2 d-flex gap-2">
            <select className="form-select form-select-sm" style={{ maxWidth: 300 }}
                    value={refereePlayerId} onChange={e=>setRefereePlayerId(e.target.value)} disabled={disabledRef}>
              <option value="">— Seleziona giocatore libero —</option>
              {availableReferees.map(p => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name}
                </option>
              ))}
            </select>
            <button className="btn btn-sm btn-outline-light" onClick={saveReferee} disabled={disabledRef}>
              Salva arbitro
            </button>
          </div>
        ) : (
          <div className="mt-2 d-flex gap-2">
            <input className="form-control form-control-sm" style={{ maxWidth: 300 }}
                   placeholder="Nome arbitro esterno"
                   value={refereeExternalName}
                   onChange={e=>setRefereeExternalName(e.target.value)}
                   disabled={disabledRef}/>
            <button className="btn btn-sm btn-outline-light" onClick={saveReferee} disabled={disabledRef}>
              Salva arbitro
            </button>
          </div>
        )}
        {refErr && <div className="alert alert-danger py-1 px-2 small mt-2">{refErr}</div>}
      </div>

      {/* Azioni punteggio */}
      {err && <div className="alert alert-danger py-1 px-2 small mt-2">{err}</div>}
      <div className="mt-3 d-flex gap-2">
        <button className="btn btn-sm btn-success" onClick={saveOne} disabled={disabled}>
          {saving ? 'Salvataggio…' : 'Salva risultato'}
        </button>
      </div>
    </div>
  )
}
