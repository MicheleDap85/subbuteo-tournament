import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Gironi(){
  const [tournament, setTournament] = useState(null)
  const [groups, setGroups] = useState([])
  const [fixturesByGroup, setFixturesByGroup] = useState({})
  const [standingsByGroup, setStandingsByGroup] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const subRef = useRef(null)

  async function load(){
    try{
      setLoading(true)
      setError(null)

      // Torneo più recente
      const { data: t, error: tErr } = await supabase
        .from('tournaments')
        .select('id, name, status, fields_total')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (tErr) throw tErr

      setTournament(t || null)
      if (!t) {
        setGroups([]); setFixturesByGroup({}); setStandingsByGroup({})
        setLastUpdate(new Date())
        return
      }

      // Gruppi del torneo
      const { data: gs, error: gErr } = await supabase
        .from('groups')
        .select('id, name')
        .eq('tournament_id', t.id)
        .order('name', { ascending: true })
      if (gErr) throw gErr
      setGroups(gs || [])

      const nextFixtures = {}
      const nextStandings = {}

      for (const g of (gs || [])) {
        // Membri del gruppo
        const { data: members, error: mErr } = await supabase
          .from('group_members')
          .select('player_id, tier, players:player_id(id, first_name, last_name)')
          .eq('group_id', g.id)
          .order('tier', { ascending: true })
        if (mErr) throw mErr

        // Turni del gruppo
        const { data: rounds, error: rErr } = await supabase
          .from('rounds')
          .select('id, index_small')
          .eq('group_id', g.id)
          .order('index_small', { ascending: true })
        if (rErr) throw rErr

        const fixtures = []

        for (const r of (rounds || [])) {
          // 1) prendo le fixture del turno
          const { data: fx, error: fErr } = await supabase
            .from('fixtures')
            .select(`
              id, field_number,
              home:home_player_id(first_name,last_name),
              away:away_player_id(first_name,last_name),
              referee:referee_player_id(first_name,last_name)
            `)
            .eq('round_id', r.id)
          if (fErr) throw fErr

          const list = fx || []
          const fxIds = list.map(m => m.id)

          // 2) prendo i risultati separatamente e li mappo per fixture_id
          let resultsByFixtureId = {}
          if (fxIds.length) {
            const { data: res, error: rsErr } = await supabase
              .from('results')
              .select('fixture_id, home_goals_ft, away_goals_ft')
              .in('fixture_id', fxIds)
            if (rsErr) throw rsErr
            for (const row of (res || [])) {
              resultsByFixtureId[row.fixture_id] = {
                h: Number(row.home_goals_ft ?? 0),
                a: Number(row.away_goals_ft ?? 0),
              }
            }
          }

          // 3) arricchisco le fixture con il punteggio (se presente)
          const enriched = list.map(m => ({
            ...m,
            score: resultsByFixtureId[m.id] || null
          }))

          fixtures.push({ round: r.index_small, matches: enriched })
        }

        nextFixtures[g.id] = { members: members || [], fixtures }

        // Classifica del gruppo
        const { data: st, error: sErr } = await supabase
          .from('standings')
          .select(`
            player_id, played, won, drawn, lost, gf, ga, gd, points,
            players:player_id(first_name,last_name)
          `)
          .eq('group_id', g.id)
        if (sErr) throw sErr

        const ordered = (st || []).sort((a,b) =>
          (b.points - a.points) || (b.gd - a.gd) || (b.gf - a.gf)
        )
        nextStandings[g.id] = ordered
      }

      setFixturesByGroup(nextFixtures)
      setStandingsByGroup(nextStandings)
      setLastUpdate(new Date())
    }catch(err){
      console.error(err)
      setError(err.message || String(err))
    }finally{
      setLoading(false)
    }
  }

  // Prima load
  useEffect(()=>{ load() }, [])

  // Realtime: ricarica su cambi standings/results
  useEffect(() => {
    if (!tournament?.id) return

    if (subRef.current) {
      supabase.removeChannel(subRef.current)
      subRef.current = null
    }

    const ch = supabase
      .channel('gironi-live')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'standings',
        filter: `tournament_id=eq.${tournament.id}`
      }, () => load())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'results'
      }, () => load())
      .subscribe()

    subRef.current = ch
    return () => {
      if (subRef.current) supabase.removeChannel(subRef.current)
      subRef.current = null
    }
  }, [tournament?.id])

  return (
    <div className="container py-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h1 className="h3 mb-0">Gironi &amp; Turni</h1>
        <div className="d-flex align-items-center gap-2">
          {lastUpdate && (
            <small className="text-secondary">
              Ultimo aggiornamento: {lastUpdate.toLocaleTimeString()}
            </small>
          )}
          <button className="btn btn-sm btn-outline-light" onClick={load} disabled={loading}>
            {loading ? '...' : 'Aggiorna'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {!tournament && <p className="text-secondary">Nessun torneo trovato.</p>}
      {tournament && <p className="text-secondary">Torneo: <strong>{tournament.name}</strong></p>}

      {groups.length === 0 && !loading && (
        <p className="text-secondary">Nessun girone generato.</p>
      )}

      <div className="row g-4">
        {groups.map(g => {
          const data = fixturesByGroup[g.id] || { members:[], fixtures:[] }
          const standings = standingsByGroup[g.id] || []

          return (
            <div className="col-12" key={g.id}>
              <div className="card">
                <div className="card-body">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <h2 className="h5 mb-0">Gruppo {g.name}</h2>
                    <small className="text-secondary">
                      {data.members.length ? `${data.members.length} giocatori` : ''}
                    </small>
                  </div>

                  {/* Membri del gruppo */}
                  <div className="mb-3">
                    <strong>Giocatori:</strong>{' '}
                    {data.members.length
                      ? data.members.map(m => `${m.players.first_name} ${m.players.last_name} (F${m.tier})`).join(', ')
                      : <span className="text-secondary">—</span>}
                  </div>

                  {/* Turni e partite */}
                  {data.fixtures.length ? (
                    data.fixtures.map(f => (
                      <div key={f.round} className="mb-3">
                        <div className="fw-bold mb-1">Turno {f.round}</div>
                        <div className="row g-2">
                          {f.matches.map((m) => (
                            <div className="col-12 col-md-6" key={m.id}>
                              <div className="p-2 border rounded d-flex justify-content-between align-items-center">
                                <div className="text-truncate">
                                  <div className="text-truncate text-secondary">
                                    {m.home.first_name} {m.home.last_name}{' '}
                                    <span className="text-secondary">vs</span>{' '}
                                    {m.away.first_name} {m.away.last_name}
                                  </div>
                                  <div className="small text-secondary">
                                    Arbitro: {m.referee?.first_name} {m.referee?.last_name || ''}
                                  </div>
                                </div>

                                <div className="d-flex align-items-center gap-2 ms-3">
                                  {/* Campo */}
                                  <div className="small text-nowrap">
                                    Campo: <strong>{m.field_number || '-'}</strong>
                                  </div>

                                  {/* Risultato se presente (dalla mappa locale) */}
                                  {m.score && (
                                    <span className="badge bg-success">
                                      {m.score.h}–{m.score.a}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-secondary">Nessuna partita.</p>
                  )}

                  {/* Classifica */}
                  <hr className="my-3" />
                  <div className="table-responsive">
                    <table className="table table-dark table-striped align-middle mb-0">
                      <thead>
                        <tr>
                          <th>Classifica</th>
                          <th className="text-end">G</th>
                          <th className="text-end">V</th>
                          <th className="text-end">N</th>
                          <th className="text-end">P</th>
                          <th className="text-end">GF</th>
                          <th className="text-end">GA</th>
                          <th className="text-end">DG</th>
                          <th className="text-end">Pt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {standings.length ? (
                          standings.map((row, idx) => (
                            <tr key={row.player_id}>
                              <td className="text-truncate">
                                {idx + 1}. {row.players.first_name} {row.players.last_name}
                              </td>
                              <td className="text-end">{row.played}</td>
                              <td className="text-end">{row.won}</td>
                              <td className="text-end">{row.drawn}</td>
                              <td className="text-end">{row.lost}</td>
                              <td className="text-end">{row.gf}</td>
                              <td className="text-end">{row.ga}</td>
                              <td className="text-end">{row.gd}</td>
                              <td className="text-end">{row.points}</td>
                            </tr>
                          ))
                        ) : (
                          <tr><td colSpan="9" className="text-secondary">Nessuna partita confermata.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
