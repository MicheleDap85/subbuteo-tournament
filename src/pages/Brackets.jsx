import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import BracketStage from '../components/BracketStage'

function emptyRounds() {
  return { barrage: [], quarter: [], semi: [], final: [], third: [] }
}

function groupByRoundName(fixtures) {
  const rounds = emptyRounds()
  for (const f of (fixtures || [])) {
    if (f.is_third_place) {
      rounds.third.push(f)
    } else {
      const k = f.round_name || 'unknown'
      if (!rounds[k]) rounds[k] = []
      rounds[k].push(f)
    }
  }
  // Ordina stabilmente per id per avere UI deterministica
  Object.keys(rounds).forEach(k => {
    rounds[k] = rounds[k].slice().sort((a,b) => a.id - b.id)
  })
  return rounds
}

export default function Brackets() {
  const [tournament, setTournament] = useState(null)
  const [goldRounds, setGoldRounds] = useState(emptyRounds())
  const [silverRounds, setSilverRounds] = useState(emptyRounds())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    try {
      setLoading(true); setError(null)

      // Torneo più recente
      const { data: t, error: tErr } = await supabase
        .from('tournaments')
        .select('id, name')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (tErr) throw tErr
      if (!t) { setTournament(null); setGoldRounds(emptyRounds()); setSilverRounds(emptyRounds()); return }
      setTournament(t)

      // Fixtures KO (no group)
      const { data: fx, error: fErr } = await supabase
        .from('fixtures')
        .select(`
          id, tournament_id, stage, round_name, round_order, is_third_place,
          home:home_player_id(first_name,last_name),
          away:away_player_id(first_name,last_name)
        `)
        .eq('tournament_id', t.id)
        .neq('stage', 'group')
        .order('round_order', { ascending: true })
        .order('id', { ascending: true })
      if (fErr) throw fErr

      const ids = (fx || []).map(f => f.id)
      let scoreById = {}
      if (ids.length) {
        const { data: rs, error: rErr } = await supabase
          .from('results')
          .select('fixture_id, home_goals_ft, away_goals_ft, et_home_goals, et_away_goals, pen_home_goals, pen_away_goals')
          .in('fixture_id', ids)
        if (rErr) throw rErr
        for (const r of (rs || [])) {
          scoreById[r.fixture_id] = {
            ftH: r.home_goals_ft, ftA: r.away_goals_ft,
            etH: r.et_home_goals, etA: r.et_away_goals,
            penH: r.pen_home_goals, penA: r.pen_away_goals
          }
        }
      }

      const decorated = (fx || []).map(f => ({ ...f, score: scoreById[f.id] || null }))
      const gold = decorated.filter(f => f.stage === 'gold')
      const silver = decorated.filter(f => f.stage === 'silver')

      setGoldRounds(groupByRoundName(gold))
      setSilverRounds(groupByRoundName(silver))
    } catch (e) {
      console.error(e)
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h3 mb-0">Tabelloni (Schema ad albero)</h1>
        <div className="d-flex align-items-center gap-2">
          {tournament && <small className="text-secondary">Torneo: <strong>{tournament.name}</strong></small>}
          <button className="btn btn-outline-light btn-sm" onClick={load} disabled={loading}>
            {loading ? '...' : 'Aggiorna'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <BracketStage title="Fase Gold" rounds={goldRounds} />
      <BracketStage title="Fase Silver" rounds={silverRounds} />

      {!loading && !Object.values(goldRounds).some(a => a.length) && !Object.values(silverRounds).some(a => a.length) && (
        <p className="text-secondary">Nessuna partita KO trovata. Genera i tabelloni da “Tabelloni” e riprova.</p>
      )}
    </div>
  )
}