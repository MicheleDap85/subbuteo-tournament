import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import PlayersTable from '../components/PlayersTable'
import PlayerForm from '../components/PlayerForm'
import ClubsForm from '../components/ClubsForm'
import TournamentForm from '../components/TournamentForm'
import EnrollmentManager from '../components/EnrollmentManager'
import DrawActions from '../components/DrawActions'

export default function Admin() {
  const [players, setPlayers] = useState([])
  const [clubs, setClubs] = useState([])
  const [tournament, setTournament] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function loadClubs() {
    const { data, error } = await supabase.from('clubs').select('*').order('name', { ascending: true })
    if (error) throw error
    setClubs(data || [])
  }

  async function loadPlayers() {
    const { data, error } = await supabase
      .from('players')
      .select('*, clubs:club_id(id, name, logo_url)')
      .order('fisct_ranking', { ascending: false })
    if (error) throw error
    setPlayers(data || [])
  }

  async function loadTournament() {
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    setTournament(data || null)
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        await Promise.all([loadClubs(), loadPlayers(), loadTournament()])
      } catch (err) {
        console.error(err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function handlePlayerCreated() { await loadPlayers() }
  async function handleClubCreated() { await loadClubs() }
  async function handleTournamentChanged() { await loadTournament() }

  return (
    <div className="container py-4">
      <h1 className="h3 mb-4">Admin</h1>
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="row g-4">
        {/* COLONNA SINISTRA: Club + Giocatore */}
        <div className="col-12 col-lg-4">
          <div className="card mb-4">
            <div className="card-body">
              <h2 className="h5 mb-3">Nuovo Club</h2>
              <ClubsForm onCreated={handleClubCreated} />
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h2 className="h5 mb-3">Nuovo Giocatore</h2>
              <PlayerForm clubs={clubs} onCreated={handlePlayerCreated} />
            </div>
          </div>
        </div>

        {/* COLONNA DESTRA: Giocatori + Torneo */}
        <div className="col-12 col-lg-8">
          <div className="card mb-4">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h2 className="h5 mb-0">Giocatori</h2>
                <button
                  className="btn btn-sm btn-outline-light"
                  onClick={async () => { await loadPlayers() }}
                >Aggiorna</button>
              </div>
              {loading ? <p className="text-secondary">Caricamento…</p> : <PlayersTable players={players} onChange={handlePlayerCreated} />}
            </div>
          </div>

          {/* TORNEO */}
          <div className="card">
            <div className="card-body">
              <h2 className="h5 mb-3">Torneo</h2>
              <TournamentForm tournament={tournament} onChange={handleTournamentChanged} />

              {tournament && (
                <>
                  <hr className="my-4" />
                  <h3 className="h6 mb-3">Iscrizioni</h3>
                  <EnrollmentManager tournament={tournament} />

                  <hr className="my-4" />
                  <h3 className="h6 mb-3">Fasce, sorteggio gruppi e turni</h3>
                  <DrawActions tournament={tournament} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}