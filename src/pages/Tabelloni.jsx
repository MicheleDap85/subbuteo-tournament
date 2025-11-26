import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { generateKnockout, submitKoResult } from '../lib/knockout'

const ROUND_LABEL = {
  barrage: 'Barrage',
  quarter: 'Quarti',
  semi: 'Semifinali',
  third: 'Finale 3º posto',
  final: 'Finale'
}

function byRoundOrder(a, b) { return (a.round_order ?? 0) - (b.round_order ?? 0) }

function FixtureCard({ fx, onSaved }) {
  const [ftH, setFtH] = useState(fx.score?.ftH ?? '')
  const [ftA, setFtA] = useState(fx.score?.ftA ?? '')
  const [useET, setUseET] = useState(fx.score?.etH != null || fx.score?.etA != null)
  const [etH, setEtH] = useState(fx.score?.etH ?? '')
  const [etA, setEtA] = useState(fx.score?.etA ?? '')
  const [usePens, setUsePens] = useState(fx.score?.penH != null || fx.score?.penA != null)
  const [penH, setPenH] = useState(fx.score?.penH ?? '')
  const [penA, setPenA] = useState(fx.score?.penA ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const hasResult = fx.score && (fx.score.ftH != null || fx.score.ftA != null)

  async function save() {
    try {
      setSaving(true)
      setErr(null)
      await submitKoResult(fx.tournament_id, fx.id, {
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

  return (
    <div className="p-2 border rounded h-100 fixture-card">
      <div className="small text-secondary mb-1 fixture-label">
        {fx.is_third_place ? '3º posto' : ROUND_LABEL[fx.round_name] || fx.round_name}
      </div>

      <div className="fw-semibold text-truncate fixture-matchup">
        {fx.home?.first_name} {fx.home?.last_name} <span className="fixture-vs">vs</span>{' '}
        {fx.away?.first_name} {fx.away?.last_name}
      </div>
      <div className="small text-secondary mb-2">Campo: <strong>{fx.field_number ?? '-'}</strong></div>

      {/* risultato attuale in badge */}
      {hasResult && (
        <div className="mb-2">
          <span className="badge bg-success">
            {Number(fx.score.ftH ?? 0)}–{Number(fx.score.ftA ?? 0)}
          </span>
          {(fx.score.etH != null || fx.score.etA != null) && (
            <span className="badge bg-primary ms-2">
              ET {Number(fx.score.etH ?? 0)}–{Number(fx.score.etA ?? 0)}
            </span>
          )}
          {(fx.score.penH != null || fx.score.penA != null) && (
            <span className="badge bg-dark ms-2">
              Rig {Number(fx.score.penH ?? 0)}–{Number(fx.score.penA ?? 0)}
            </span>
          )}
        </div>
      )}

      {/* form inserimento/aggiornamento */}
      <div className="d-flex align-items-center gap-2 mb-2">
        <input type="number" className="form-control form-control-sm text-end" style={{ width: 70 }}
          placeholder="FT H" value={ftH} onChange={e => setFtH(e.target.value)}
        />
        <span>–</span>
        <input type="number" className="form-control form-control-sm" style={{ width: 70 }}
          placeholder="FT A" value={ftA} onChange={e => setFtA(e.target.value)}
        />
      </div>

      <div className="form-check form-switch mb-2">
        <input className="form-check-input" type="checkbox" id={`et-${fx.id}`} checked={useET} onChange={e => setUseET(e.target.checked)} />
        <label className="form-check-label" htmlFor={`et-${fx.id}`}>Sudden Death</label>
      </div>
      {useET && (
        <div className="d-flex align-items-center gap-2 mb-2">
          <input type="number" className="form-control form-control-sm text-end" style={{ width: 70 }}
            placeholder="ET H" value={etH} onChange={e => setEtH(e.target.value)}
          />
          <span>–</span>
          <input type="number" className="form-control form-control-sm" style={{ width: 70 }}
            placeholder="ET A" value={etA} onChange={e => setEtA(e.target.value)}
          />
        </div>
      )}

      <div className="form-check form-switch mb-2">
        <input className="form-check-input" type="checkbox" id={`pen-${fx.id}`} checked={usePens} onChange={e => setUsePens(e.target.checked)} />
        <label className="form-check-label" htmlFor={`pen-${fx.id}`}>Rigori</label>
      </div>
      {usePens && (
        <div className="d-flex align-items-center gap-2 mb-2">
          <input type="number" className="form-control form-control-sm text-end" style={{ width: 70 }}
            placeholder="Rig H" value={penH} onChange={e => setPenH(e.target.value)}
          />
          <span>–</span>
          <input type="number" className="form-control form-control-sm" style={{ width: 70 }}
            placeholder="Rig A" value={penA} onChange={e => setPenA(e.target.value)}
          />
        </div>
      )}

      {err && <div className="alert alert-danger py-1 px-2 small mb-2">{err}</div>}

      <button className="btn btn-sm btn-success w-100" onClick={save} disabled={saving}>
        {saving ? 'Salvataggio…' : 'Conferma risultato KO'}
      </button>
    </div>
  )
}

export default function Tabelloni() {
  const [tournament, setTournament] = useState(null)
  const [gold, setGold] = useState([])
  const [silver, setSilver] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    try {
      setLoading(true); setError(null)

      // torneo più recente
      const { data: t } = await supabase
        .from('tournaments')
        .select('id, name')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setTournament(t || null)
      if (!t) { setGold([]); setSilver([]); return }

      // prende fixtures gold/silver con nomi giocatori
      async function fetchStage(stage) {
        const { data: fx } = await supabase
          .from('fixtures')
          .select(`
            id, tournament_id, stage, round_name, round_order, is_third_place, field_number,
            home_player_id, away_player_id,
            home:home_player_id(first_name,last_name),
            away:away_player_id(first_name,last_name)
          `)
          .eq('tournament_id', t.id)
          .eq('stage', stage)
          .order('round_order', { ascending: true })
          .order('id', { ascending: true })

        const ids = (fx || []).map(f => f.id)
        let resultsById = {}
        if (ids.length) {
          const { data: rs } = await supabase
            .from('results')
            .select('fixture_id, home_goals_ft, away_goals_ft, et_home_goals, et_away_goals, pen_home_goals, pen_away_goals')
            .in('fixture_id', ids)
          for (const r of (rs || [])) {
            resultsById[r.fixture_id] = {
              ftH: r.home_goals_ft, ftA: r.away_goals_ft,
              etH: r.et_home_goals, etA: r.et_away_goals,
              penH: r.pen_home_goals, penA: r.pen_away_goals
            }
          }
        }

        // arricchisci
        return (fx || []).map(f => ({ ...f, score: resultsById[f.id] || null }))
      }

      const g = await fetchStage('gold')
      const s = await fetchStage('silver')
      setGold(g)
      setSilver(s)
    } catch (err) {
      console.error(err)
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // raggruppa per round
  function groupByRound(list) {
    const m = new Map()
    for (const f of list) {
      const key = `${f.round_order || 0}|${f.round_name || ''}`
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(f)
    }
    const entries = [...m.entries()].map(([k, arr]) => {
      const [ord, name] = k.split('|')
      return { order: Number(ord), name, fixtures: arr }
    })
    entries.sort((a, b) => a.order - b.order)
    return entries
  }

  const goldRounds = useMemo(() => groupByRound(gold), [gold])
  const silverRounds = useMemo(() => groupByRound(silver), [silver])

  async function handleGenerate(){
  if (!tournament?.id) return
  try {
    const res = await generateKnockout(tournament.id)
    alert(`KO rigenerati.\nGold seeds: ${res.goldCount}\nSilver seeds: ${res.silverCount}`)
    await load()
  } catch (e) {

   console.error(e)
   alert(`Errore KO: ${e.message || JSON.stringify(e)}`)
  }
}



  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h3 mb-0">Tabelloni</h1>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-light btn-sm" onClick={load} disabled={loading}>
            {loading ? '...' : 'Aggiorna'}
          </button>
          <button className="btn btn-warning btn-sm" onClick={handleGenerate} disabled={!tournament}>
            Rigenera Gold/Silver
          </button>
        </div>
      </div>

      {tournament && <p className="text-secondary">Torneo: <strong>{tournament.name}</strong></p>}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="row g-4">
        {/* GOLD */}
        <div className="col-12 col-lg-6">
          <div className="card h-100">
            <div className="card-body">
              <h2 className="h5 mb-3">Fase Gold</h2>

              {goldRounds.length === 0 && <p className="text-secondary">Nessun tabellone. Premi “Rigenera”.</p>}



              {goldRounds.map(r => (
                <div key={`gold-${r.order}-${r.name}`} className="mb-4">
                  <div className="fw-bold mb-2">{ROUND_LABEL[r.name] || r.name}</div>
                  <div className="d-flex flex-column gap-2">
                    {r.fixtures.map(fx => (
                      <div key={fx.id}>
                        <FixtureCard fx={fx} onSaved={load} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}

            </div>
          </div>
        </div>

        {/* SILVER */}
        <div className="col-12 col-lg-6">
          <div className="card h-100">
            <div className="card-body">
              <h2 className="h5 mb-3">Fase Silver</h2>

              {silverRounds.length === 0 && <p className="text-secondary">Nessun tabellone. Premi “Rigenera”.</p>}



              {silverRounds.map(r => (
                <div key={`silver-${r.order}-${r.name}`} className="mb-4">
                  <div className="fw-bold mb-2">{ROUND_LABEL[r.name] || r.name}</div>
                  <div className="d-flex flex-column gap-2">
                    {r.fixtures.map(fx => (
                      <div key={fx.id}>
                        <FixtureCard fx={fx} onSaved={load} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}


              {/* Nota: le "Finali 3º posto" di Gold e Silver appaiono in sezioni distinte,
                  quindi puoi giocarle in contemporanea. Le finalissime sono in card separate. */}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
