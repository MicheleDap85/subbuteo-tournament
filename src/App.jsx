import { Routes, Route, NavLink } from 'react-router-dom'
import Admin from './pages/Admin.jsx'
import Gironi from './pages/Gironi.jsx'
import Gioco from './pages/Gioco.jsx'
import Tabelloni from './pages/Tabelloni.jsx'
import GiocoKO from './pages/GiocoKO'
import Brackets from './pages/Brackets'
import Home from './pages/Home'





export default function App() {
  return (
    <>
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
        <div className="container">
          <NavLink className="navbar-brand" to="/">Subbuteo Tournaments</NavLink>
          <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav" aria-controls="nav" aria-expanded="false" aria-label="Toggle navigation">
            <span className="navbar-toggler-icon"></span>
          </button>

          <div className="collapse navbar-collapse" id="nav">
            <ul className="navbar-nav me-auto mb-2 mb-lg-0">
              <li className="nav-item"><NavLink className="nav-link" to="/">Home</NavLink></li>
              <li className="nav-item"><NavLink className="nav-link" to="/admin">Admin</NavLink></li>
              <li className="nav-item"><NavLink className="nav-link" to="/gironi">Gironi</NavLink></li>
              <li className="nav-item"><NavLink className="nav-link" to="/gioco">Gioco</NavLink></li>
              <li className="nav-item"><NavLink className="nav-link" to="/tabelloni">Tabelloni</NavLink></li>
              <li className="nav-item"><NavLink className="nav-link" to="/gioco-ko">Gioco KO</NavLink></li>
              <li className="nav-item"><NavLink className="nav-link" to="/brackets">Albero Finali</NavLink></li>
            </ul>
          </div>
        </div>
      </nav>

       

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/gironi" element={<Gironi />} />
        <Route path="/gioco" element={<Gioco />} />
        <Route path="/tabelloni" element={<Tabelloni />} />
        <Route path="/gioco-ko" element={<GiocoKO />} />
        <Route path="/brackets" element={<Brackets />} />
      </Routes>
    </>
  )
}
