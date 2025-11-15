// src/pages/Home.jsx
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

function Section({ title, right, children }) {
  return (
    <div className="card mb-3">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h2 className="h6 mb-0">{title}</h2>
        {right}
      </div>
      <div className="card-body">
        {children}
      </div>
    </div>
  )
}

function MiniRow({ left, right, muted }) {
  return (
    <div className="d-flex justify-content-between">
      <div className={muted ? 'text-secondary' : ''}>{left}</div>
      <div className="fw-semibold">{right}</div>
    </div>
  )
}

export default function Home() {
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState([])

  const [tournament, setTournament] = useState(null)
  const [fields, setFields] = useState(1)

  const [clubs, setClubs] = useState([])
  const [players, setPlayers] = useState([])
  const [groups, setGroups] = useState([])
  const [groupRounds, setGroupRounds] = useState([])

  const [fixturesGroup, setFixturesGroup] = useState([])
  const [fixturesKO, setFixturesKO] = useState([])
  const [resultsByFixture, setResultsByFixture] = useState({})

  function pushErr(label, e) {
    console.error(`[Home] ${label}:`, e)
    setErrors(prev => [...prev, `${label}: ${e?.message || e}`])
  }

  async function load() {
    setLoading(true)
    setErrors([])

    try {
      // 1) Torneo più recente
      const { data: t, error: tErr } = await supabase
        .from('tournaments')
        .select('id, name, fields_total, created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (tErr) pushErr('tournaments', tErr)
      if (!t) {
        setTournament(null)
        setFields(1)
        setClubs([]); setPlayers([]); setGroups([]); setGroupRounds([])
        setFixturesGroup([]); setFixturesKO([]); setResultsByFixture({})
        setLoading(false)
        return
      }
      setTournament(t)
      setFields(Math.max(1, Number(t.fields_total || 1)))

      // 2) Clubs
      {
        const { data, error } = await supabase
          .from('clubs')
          .select('id, name, logo_url')
          .order('name', { ascending: true })
        if (error) pushErr('clubs', error)
        setClubs(data || [])
      }

      // 3) Enrollments -> players (senza join nidificata)
      {
        const { data: enr, error: enrErr } = await supabase
          .from('enrollments')
          .select('player_id')
          .eq('tournament_id', t.id)
        if (enrErr) pushErr('enrollments', enrErr)

        const ids = new Set((enr || []).map(e => e.player_id).filter(Boolean))



        try {
          const { data: allPlayers } = await supabase
            .from('players')
            .select('*')
            .throwOnError()

          console.log('[DBG] players sample row:', allPlayers?.[0])

          const normalized = (allPlayers || []).map(p => ({
            id: p.id ?? p.player_id ?? p.playerid ?? null,
            first_name: p.first_name ?? p.firstname ?? p.name ?? '',
            last_name: p.last_name ?? p.lastname ?? p.surname ?? '',
            ranking: p.ranking ?? p.rank ?? 0,
            club_id: p.club_id ?? p.clubid ?? p.club ?? null,
          })).filter(p => p.id && ids.has(p.id))

          setPlayers(normalized)
        } catch (e) {
          pushErr('players', e)
          setPlayers([])
        }
      }




      // 4) Groups
      {
        const { data, error } = await supabase
          .from('groups')
          .select('id, name')
          .eq('tournament_id', t.id)
          .order('name', { ascending: true })
        if (error) pushErr('groups', error)
        setGroups(data || [])
      }

      // 5) Rounds (dei gironi)
      {
        const groupIds = (groups || []).map(g => g.id)
        if (groupIds.length) {
          const { data, error } = await supabase
            .from('rounds')
            .select('id, group_id, index_small')
            .in('group_id', groupIds)
            .order('index_small', { ascending: true })
          if (error) pushErr('rounds', error)
          setGroupRounds(data || [])
        } else {
          setGroupRounds([])
        }
      }

      // 6) Fixtures (tutte)
      let allFx = []
      {
        const { data, error } = await supabase
          .from('fixtures')
          .select(`
            id, tournament_id, stage, round_id, round_name, round_order, field_number, is_third_place,
            home_player_id, away_player_id,
            home:home_player_id(first_name,last_name,club_id),
            away:away_player_id(first_name,last_name,club_id)
          `)
          .eq('tournament_id', t.id)
          .order('round_order', { ascending: true })
          .order('id', { ascending: true })
        if (error) pushErr('fixtures', error)
        allFx = data || []
        setFixturesGroup(allFx.filter(f => f.stage === 'group'))
        setFixturesKO(allFx.filter(f => f.stage !== 'group'))
      }

      // 7) Results
      {
        const ids = allFx.map(f => f.id)
        let map = {}
        if (ids.length) {
          const { data, error } = await supabase
            .from('results')
            .select('fixture_id, home_goals_ft, away_goals_ft, et_home_goals, et_away_goals, pen_home_goals, pen_away_goals')
            .in('fixture_id', ids)
          if (error) pushErr('results', error)
          for (const r of (data || [])) {
            map[r.fixture_id] = {
              ftH: r.home_goals_ft, ftA: r.away_goals_ft,
              etH: r.et_home_goals, etA: r.et_away_goals,
              penH: r.pen_home_goals, penA: r.pen_away_goals
            }
          }
        }
        setResultsByFixture(map)
      }
    } catch (e) {
      pushErr('unknown', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // ====== DERIVATI ======
  const playersByClub = useMemo(() => {
    const m = new Map()
    for (const c of clubs || []) m.set(c.id, { club: c, players: [] })
    for (const p of players || []) {
      const key = p?.club_id ?? -1
      if (!m.has(key)) m.set(key, { club: { id: -1, name: 'Senza club' }, players: [] })
      m.get(key).players.push(p)
    }
    return [...m.values()].sort((a, b) => (b.players.length - a.players.length))
  }, [clubs, players])

  function isPlayed(fx) { return !!resultsByFixture[fx.id] }

  const nextGroupWave = useMemo(() => {
    const fxG = fixturesGroup || []
    if (!fxG.length) return null
    const open = fxG.filter(f => !isPlayed(f))
    if (!open.length) return null

    // se round info manca, prendi semplicemente i primi N per numero campi
    return open.slice(0, Math.max(1, Number(fields || 1)))
  }, [fixturesGroup, resultsByFixture, fields])

  const nextKOWave = useMemo(() => {
    const ko = fixturesKO || []
    if (!ko.length) return null
    const open = ko.filter(f => !isPlayed(f))
    if (!open.length) return null
    const minOrder = Math.min(...open.map(f => f.round_order ?? 0))
    const roundFix = open.filter(f => (f.round_order ?? 0) === minOrder)
    return roundFix.slice(0, Math.max(1, Number(fields || 1)))
  }, [fixturesKO, resultsByFixture, fields])

  const latestResults = useMemo(() => {
    const all = [...(fixturesGroup || []), ...(fixturesKO || [])].filter(isPlayed)
    const ordered = all.sort((a, b) => (b.id - a.id))
    return ordered.slice(0, 6)
  }, [fixturesGroup, fixturesKO, resultsByFixture])

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h4 mb-0">Tornei Subbuteo / Calcio Tavolo</h1>
        <div className="d-flex gap-2">
          <Link className="btn btn-sm btn-outline-light" to="/admin">Admin</Link>
          <Link className="btn btn-sm btn-primary" to="/gioco">Gioco (Gironi)</Link>
          <Link className="btn btn-sm btn-warning" to="/gioco-ko">Gioco (KO)</Link>
          <Link className="btn btn-sm btn-outline-light" to="/tabelloni">Tabelloni</Link>
          <Link className="btn btn-sm btn-outline-light" to="/brackets">Albero Finali</Link>
        </div>
      </div>

      {loading && <div className="alert alert-secondary">Caricamento…</div>}

      {!!errors.length && (
        <div className="alert alert-danger">
          <div className="fw-bold mb-1">Errori di caricamento</div>
          <ul className="mb-0">
            {errors.map((e, i) => <li key={i} className="small">{e}</li>)}
          </ul>
        </div>
      )}

      {!tournament && !loading && (
        <div className="alert alert-info d-flex justify-content-between align-items-center">
          <div>Nessun torneo attivo. Crea/Seleziona un torneo in Admin.</div>
          <Link to="/admin" className="btn btn-sm btn-primary">Vai ad Admin</Link>
        </div>
      )}

      {tournament && (
        <Section
          title="Panoramica torneo"
          right={<small className="text-secondary">Ultimo aggiornamento: {new Date().toLocaleTimeString()}</small>}
        >
          <div className="row g-3">
            <div className="col-6 col-md-3">
              <MiniRow left="Torneo" right={tournament.name} />
              <MiniRow left="Campi disponibili" right={fields} muted />
            </div>
            <div className="col-6 col-md-3">
              <MiniRow left="Club" right={(clubs || []).length} />
              <MiniRow left="Iscritti" right={(players || []).length} muted />
            </div>
            <div className="col-6 col-md-3">
              <MiniRow left="Gironi" right={(groups || []).length} />
              <MiniRow left="Rounds gironi" right={(groupRounds || []).length} muted />
            </div>
            <div className="col-6 col-md-3">
              <MiniRow left="Partite gironi" right={(fixturesGroup || []).length} />
              <MiniRow left="Partite KO" right={(fixturesKO || []).length} muted />
            </div>
          </div>
        </Section>
      )}

      <Section
        title="Prossime partite (Gironi) — prima wave"
        right={<Link to="/gioco" className="btn btn-sm btn-outline-light">Vai a Gioco</Link>}
      >
        {nextGroupWave?.length ? (
          <div className="d-flex flex-column gap-2">
            {nextGroupWave.map(fx => (
              <div key={fx.id} className="d-flex justify-content-between align-items-center border rounded p-2">
                <div className="text-truncate">
                  <strong>{fx.home?.first_name} {fx.home?.last_name}</strong>
                  <span className="text-secondary"> vs </span>
                  <strong>{fx.away?.first_name} {fx.away?.last_name}</strong>
                </div>
                <span className="badge bg-secondary">Campo {fx.field_number ?? '-'}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-secondary">Nessuna partita in attesa nei gironi.</div>
        )}
      </Section>

      <Section
        title="Prossime partite (Fasi KO) — prima wave del round attivo"
        right={<Link to="/gioco-ko" className="btn btn-sm btn-outline-light">Vai a Gioco KO</Link>}
      >
        {nextKOWave?.length ? (
          <div className="d-flex flex-column gap-2">
            {nextKOWave.map(fx => (
              <div key={fx.id} className="d-flex justify-content-between align-items-center border rounded p-2">
                <div className="text-truncate">
                  <span className="badge text-bg-dark me-2">{fx.round_name}</span>
                  <strong>{fx.home?.first_name} {fx.home?.last_name}</strong>
                  <span className="text-secondary"> vs </span>
                  <strong>{fx.away?.first_name} {fx.away?.last_name}</strong>
                </div>
                <span className="badge bg-secondary">Campo {fx.field_number ?? '-'}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-secondary">Nessuna partita in attesa nelle fasi finali.</div>
        )}
      </Section>

      <Section
        title="Ultimi risultati"
        right={<Link to="/tabelloni" className="btn btn-sm btn-outline-light">Vedi tabelloni</Link>}
      >
        {(() => {
          const latest = [...(fixturesGroup || []), ...(fixturesKO || [])]
            .filter(f => resultsByFixture[f.id])
            .sort((a, b) => b.id - a.id)
            .slice(0, 6)

          if (!latest.length) return <div className="text-secondary">Nessun risultato registrato al momento.</div>

          return (
            <div className="row g-2">
              {latest.map(fx => {
                const s = resultsByFixture[fx.id]
                const ft = s ? `${Number(s.ftH || 0)}–${Number(s.ftA || 0)}` : '–'
                const et = s && (s.etH != null || s.etA != null) ? ` ET ${Number(s.etH || 0)}–${Number(s.etA || 0)}` : ''
                const pen = s && (s.penH != null || s.penA != null) ? ` Rig ${Number(s.penH || 0)}–${Number(s.penA || 0)}` : ''
                return (
                  <div key={fx.id} className="col-12 col-md-6">
                    <div className="border rounded p-2 h-100">
                      <div className="small text-secondary mb-1">
                        {fx.stage !== 'group' ? `KO · ${fx.round_name}${fx.is_third_place ? ' · 3° posto' : ''}` : 'Gironi'}
                      </div>
                      <div className="fw-semibold text-truncate">
                        {fx.home?.first_name} {fx.home?.last_name} <span className="text-secondary">vs</span> {fx.away?.first_name} {fx.away?.last_name}
                      </div>
                      <div className="mt-1">
                        <span className="badge text-bg-secondary">FT {ft}</span>
                        {et && <span className="badge text-bg-secondary ms-1">{et}</span>}
                        {pen && <span className="badge text-bg-secondary ms-1">{pen}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </Section>

      <Section title="Iscritti per Club" right={<Link to="/admin" className="btn btn-sm btn-outline-light">Gestisci</Link>}>
        {playersByClub.length ? (
          <div className="row g-2">
            {playersByClub.map(({ club, players }) => (
              <div key={club.id ?? 'none'} className="col-12 col-sm-6 col-lg-4">
                <div className="border rounded p-2 h-100 d-flex align-items-center justify-content-between">
                  <div className="me-3 text-truncate">
                    <div className="fw-semibold text-truncate">{club.name}</div>
                    <div className="small text-secondary">{players.length} iscritti</div>
                  </div>
                  {club.logo_url ? (
                    <img src={club.logo_url} alt={club.name} style={{ width: 40, height: 40, objectFit: 'contain' }} />
                  ) : (
                    <div className="rounded bg-secondary" style={{ width: 40, height: 40 }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-secondary">Non risultano club o iscritti.</div>
        )}
      </Section>
    </div>
  )
}
