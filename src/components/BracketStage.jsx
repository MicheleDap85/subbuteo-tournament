// src/components/BracketStage.jsx
import React from 'react'

const RN_LABEL = {
  barrage: 'Barrage',
  quarter: 'Quarti',
  semi: 'Semifinali',
  final: 'Finale',
  third: '3° posto'
}

function MatchCard({ fx, result }) {
  const scoreFT = result ? `${Number(result.ftH||0)}–${Number(result.ftA||0)}` : '–'
  const et =
    result && (result.etH != null || result.etA != null)
      ? `  ET ${Number(result.etH||0)}–${Number(result.etA||0)}`
      : ''
  const pens =
    result && (result.penH != null || result.penA != null)
      ? `  Rig ${Number(result.penH||0)}–${Number(result.penA||0)}`
      : ''

  return (
    <div className="border rounded p-2 bg-dark-subtle">
      <div className="small text-secondary mb-1">
        {fx.is_third_place ? '3º posto' : RN_LABEL[fx.round_name] || fx.round_name}
      </div>

      <div className="fw-semibold text-truncate">
        {fx.home?.first_name} {fx.home?.last_name} <span className="text-secondary">vs</span> {fx.away?.first_name} {fx.away?.last_name}
      </div>

      <div className="mt-1">
        <span className="badge text-bg-secondary">FT {scoreFT}</span>
        {et && <span className="badge text-bg-secondary ms-1">{et}</span>}
        {pens && <span className="badge text-bg-secondary ms-1">{pens}</span>}
      </div>
    </div>
  )
}

export default function BracketStage({ title, rounds }) {
  // rounds è un oggetto: { quarter: [fx], semi: [fx], final: [fx], third: [fx] }
  // Ogni fx: { id, round_name, is_third_place, home, away, score }
  const colOrder = ['quarter', 'semi', 'final', 'third']
  const visibleCols = colOrder.filter(k => (rounds[k] && rounds[k].length))

  return (
    <div className="card mb-4">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h2 className="h5 mb-0">{title}</h2>
        <small className="text-secondary">Schema ad albero</small>
      </div>

      <div className="card-body">
        <div className="d-flex flex-row gap-3 overflow-auto">
          {visibleCols.map((k) => (
            <div key={k} className="d-flex flex-column" style={{ minWidth: 260 }}>
              <div className="fw-bold mb-2">{RN_LABEL[k] || k}</div>
              <div className="d-flex flex-column gap-2">
                {rounds[k].map(fx => (
                  <MatchCard key={fx.id} fx={fx} result={fx.score} />
                ))}
              </div>
            </div>
          ))}
          {visibleCols.length === 0 && (
            <div className="text-secondary">Nessuna partita disponibile in questo stage.</div>
          )}
        </div>
      </div>
    </div>
  )
}