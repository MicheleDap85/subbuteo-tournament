import React from 'react'

/**
 * Determina il colore del badge in base al risultato
 * verde = vittoria primo giocatore
 * blu = pareggio
 * rosso = sconfitta primo giocatore
 */
function scoreBadgeClass(h, a) {
  if (h === null || a === null || isNaN(h) || isNaN(a)) return 'bg-secondary'
  if (h === a) return 'bg-primary text-light'   // pareggio
  return h > a ? 'bg-success text-light' : 'bg-danger text-light'
}

export default function SlotRow({ fixture, value, onChange, disabled, showScore = false, showFT = false }) {
  const home = Number(value?.home ?? 0)
  const away = Number(value?.away ?? 0)

  return (
    <div className="d-flex align-items-center gap-2">
      <div className="flex-grow-1">
        <div className="fw-semibold text-truncate text-secondary">
          <span className="text-secondary">{fixture.home.first_name} {fixture.home.last_name}</span>
          <span className="text-secondary"> vs </span>
          <span className="text-secondary">{fixture.away.first_name} {fixture.away.last_name}</span>
        </div>
        <div className="small text-secondary">
          Arbitro: {fixture.referee?.first_name} {fixture.referee?.last_name || ''} • Campo:{' '}
          <strong>{fixture.field_number ?? '-'}</strong>
        </div>
      </div>

      {/* input gol */}
      <input
        type="number"
        className="form-control form-control-sm text-end"
        style={{ width: 70 }}
        value={Number.isNaN(home) ? '' : home}
        onChange={(e)=> onChange?.({ home: e.target.value, away })}
        disabled={disabled}
      />
      <span className="mx-1">–</span>
      <input
        type="number"
        className="form-control form-control-sm"
        style={{ width: 70 }}
        value={Number.isNaN(away) ? '' : away}
        onChange={(e)=> onChange?.({ home, away: e.target.value })}
        disabled={disabled}
      />

      {/* Badge risultato + FT */}
      {showScore && (
        <div className="d-flex align-items-center gap-2 ms-2">
          <span className={`badge ${scoreBadgeClass(home, away)} px-3 py-2`}>
            {Number.isNaN(home) ? 0 : home}–{Number.isNaN(away) ? 0 : away}
          </span>
          {showFT && <span className="badge bg-dark border border-light-subtle">FT</span>}
        </div>
      )}
    </div>
  )
}
