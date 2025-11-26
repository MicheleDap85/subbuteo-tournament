// src/components/MatchTimer.jsx
import { useEffect, useRef, useState } from 'react'

/**
 * Timer per ondate (wave) con:
 * - Pre-countdown 5s
 * - 1° tempo, intervallo, 2° tempo
 * - (opzionale) Supplementari (2×10')
 *
 * Props:
 * - locked: blocca tutti i controlli (es. dopo conferma turno)
 * - onPhaseChange: callback(phase) ad ogni cambio fase
 */
export default function MatchTimer({
  locked = false,
  onPhaseChange,
  preMs = 5000,
  halfDurationMs = 15 * 60 * 1000,
  etHalfDurationMs = 10 * 60 * 1000,
  allowExtraTime = true
}) {
  const [phase, setPhase] = useState('idle')
  const [remaining, setRemaining] = useState(0)
  const [running, setRunning] = useState(false)

  const tickRef = useRef(null)
  const lastTsRef = useRef(null)

  function notify(p) { onPhaseChange && onPhaseChange(p) }

  function setPhaseAndTime(p, ms) {
    setPhase(p)
    setRemaining(ms)
    notify(p)
  }

  // === controlli principali ===
  function startRegular() {
    if (locked) return
    if (['idle', 'FT', 'ET_FT'].includes(phase)) {
      setPhaseAndTime('pre', preMs)
      setRunning(true)
    }
  }

  function startET() {
    if (locked) return
    if (phase === 'FT') {
      setPhaseAndTime('et_pre', preMs)
      setRunning(true)
    }
  }

  function pause() { if (!locked) setRunning(false) }
  function resume() { if (!locked && remaining > 0) setRunning(true) }
  function reset() {
    if (locked) return
    setRunning(false)
    setPhase('idle')
    setRemaining(0)
    notify('idle')
  }

  // === avanzamento fasi ===
  useEffect(() => {
    if (!running) { lastTsRef.current = null; return }

    function raf(ts) {
      if (!lastTsRef.current) lastTsRef.current = ts
      const delta = ts - lastTsRef.current
      lastTsRef.current = ts

      setRemaining(prev => {
        const next = prev - delta
        if (next > 0) return next

        // tempo scaduto → avanza fase
        switch (phase) {
          case 'pre': setPhaseAndTime('H1', halfDurationMs); break
          case 'H1': setPhaseAndTime('break', 0); break
          case 'break': setPhaseAndTime('H2', halfDurationMs); break
          case 'H2': setPhaseAndTime('FT', 0); setRunning(false); break
          case 'et_pre': setPhaseAndTime('ET_SD', etHalfDurationMs); break
          case 'ET_SD': setPhaseAndTime('ET_FT', 0); setRunning(false); break
          default: setRunning(false)
        }
        return 0
      })

      tickRef.current = requestAnimationFrame(raf)
    }

    tickRef.current = requestAnimationFrame(raf)
    return () => { if (tickRef.current) cancelAnimationFrame(tickRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, phase])

  // === se locked → blocca subito ===
  useEffect(() => {
    if (locked) {
      setRunning(false)
    }
  }, [locked])

  // === UI helper ===
  function fmt(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000))
    const m = Math.floor(total / 60).toString().padStart(2, '0')
    const s = (total % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const labelPhase = ({
    idle: 'Pronto',
    pre: 'Pre (5s)',
    H1: '1° Tempo',
    break: 'Intervallo',
    H2: '2° Tempo',
    FT: 'Fine tempi regolamentari',
    et_pre: 'Pre Supplementari (5s)',
    ET_SD: 'Supplementari (Sudden Death)',
    ET_FT: 'Fine Supplementari'
  })[phase] || phase

  // === pulsanti disabilitati se locked ===
  const disabledAll = locked
  const canStartET = allowExtraTime && !locked && phase === 'FT'

  // === testo button aggiornato ===
  const startETButtonLabel = 'Avvia Supplementari (SD)'

  return (
    <div className="d-flex flex-column flex-sm-row align-items-sm-center gap-2">
      <span className="badge bg-dark">{labelPhase}</span>
      <strong className="fs-5">{fmt(remaining)}</strong>

      <div className="d-flex flex-wrap gap-2">
        <button className="btn btn-sm btn-primary"
                onClick={startRegular}
                disabled={disabledAll || !['idle', 'FT', 'ET_FT'].includes(phase)}>
          Avvia
        </button>
        <button className="btn btn-sm btn-outline-light"
                onClick={pause}
                disabled={disabledAll || !running}>
          Pausa
        </button>
        <button className="btn btn-sm btn-outline-light"
                onClick={resume}
                disabled={disabledAll || running || remaining <= 0}>
          Riprendi
        </button>
        <button className="btn btn-sm btn-secondary"
                onClick={reset}
                disabled={disabledAll || (phase === 'idle' && remaining === 0)}>
          Reset
        </button>

        {allowExtraTime && (
          <button className="btn btn-sm btn-warning"
                  onClick={startET}
                  disabled={disabledAll || !canStartET}>
            {startETButtonLabel}
          </button>
        )}
      </div>
    </div>
  )
}
