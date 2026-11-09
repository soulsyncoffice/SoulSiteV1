import { useEffect, useRef, useState } from 'react'
import { drawRun } from './draw.js'
import { controlMap, createRun, stepRun } from './engine.js'
import { levels } from './levels.js'
import './arcade.css'

const SAVE_KEY = 'soulsite.fieldRun'

function readSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')
  } catch {
    return {}
  }
}

export function openArcadeWindow() {
  const url = `${window.location.origin}${window.location.pathname}#/arcade`
  const popup = window.open(url, 'soulsite-arcade', 'popup=yes,width=1120,height=740,left=80,top=40,resizable=yes')
  if (!popup) return false
  popup.focus()
  return true
}

export function ArcadeLauncher({ onPlayHere, onFocus }) {
  return (
    <section className="desk-card arcade-launcher">
      <p className="desk-kicker">Field Run</p>
      <h2>The arcade is open in its own window</h2>
      <p>Lumen runs, jumps, and fires across 20 stages. Echo can join as player two.</p>
      <button onClick={onFocus} type="button">Show the arcade window</button>
      <button onClick={onPlayHere} type="button">Play in this window instead</button>
    </section>
  )
}

export function ArcadeWindow({ popped = false, onExit, onPopOut }) {
  const [save, setSave] = useState(readSave)
  const [screen, setScreen] = useState('title')
  const [playerCount, setPlayerCount] = useState(save.playerCount || 1)
  const [levelNumber, setLevelNumber] = useState(save.level || 1)
  const unlocked = save.unlocked || 1

  function remember(next) {
    const stored = { ...readSave(), ...next }
    localStorage.setItem(SAVE_KEY, JSON.stringify(stored))
    setSave(stored)
  }

  function cleared(number) {
    remember({ unlocked: Math.max(unlocked, Math.min(20, number + 1)), level: Math.min(20, number + 1) })
    setScreen(number >= 20 ? 'done' : 'clear')
  }

  return (
    <section className={`arcade-window${popped ? ' is-popped' : ''}`} aria-label="Field Run">
      <header className="arcade-titlebar">
        <strong>Field Run</strong>
        <span>SoulSite arcade · {playerCount === 2 ? '2 players' : '1 player'}</span>
        <span>
          {onPopOut ? <button onClick={onPopOut} type="button">Pop out</button> : null}
          <button onClick={onExit} type="button">Back to SoulSite</button>
        </span>
      </header>
      <div className="arcade-stage">
        {screen === 'title' ? (
          <Title
            levelNumber={levelNumber}
            playerCount={playerCount}
            unlocked={unlocked}
            onPlayers={setPlayerCount}
            onLevel={setLevelNumber}
            onStart={() => {
              remember({ playerCount, level: levelNumber })
              setScreen('play')
            }}
          />
        ) : null}
        {screen === 'play' ? (
          <CanvasRun
            key={`${levelNumber}-${playerCount}`}
            levelNumber={levelNumber}
            playerCount={playerCount}
            onClear={() => cleared(levelNumber)}
          />
        ) : null}
        {screen === 'clear' || screen === 'done' ? (
          <div className="arcade-clear">
            <p className="desk-kicker">{screen === 'done' ? 'The beacon is lit' : 'Stage clear'}</p>
            <h2>{screen === 'done' ? 'Twenty lights' : levels[levelNumber - 1].name}</h2>
            <button
              onClick={() => {
                if (screen === 'done') {
                  setLevelNumber(1)
                  setScreen('title')
                  return
                }
                setLevelNumber((current) => Math.min(20, current + 1))
                setScreen('play')
              }}
              type="button"
            >
              {screen === 'done' ? 'Return to the title' : 'Next stage'}
            </button>
            <button onClick={() => setScreen('title')} type="button">Level select</button>
          </div>
        ) : null}
      </div>
      <footer className="arcade-legend">
        <span>Lumen: arrows, Space jump, F fire, I interact</span>
        <span>Echo: A D, W jump, S drop, G fire, U interact</span>
        <span>Esc pauses · Back stays in the title bar</span>
      </footer>
    </section>
  )
}

function Title({ playerCount, levelNumber, unlocked, onPlayers, onLevel, onStart }) {
  return (
    <div className="arcade-title">
      <p className="desk-kicker">A side-scrolling field</p>
      <h2>Field Run</h2>
      <p>Run the platforms, jump the gaps, fire at the shadows, and light the exit lantern.</p>
      <div role="group" aria-label="Players">
        <button aria-pressed={playerCount === 1} onClick={() => onPlayers(1)} type="button">1 player</button>
        <button aria-pressed={playerCount === 2} onClick={() => onPlayers(2)} type="button">2 players</button>
      </div>
      <div className="arcade-levels" aria-label="Levels">
        {levels.map((level) => (
          <button
            aria-pressed={level.id === levelNumber}
            disabled={level.id > unlocked}
            key={level.id}
            onClick={() => onLevel(level.id)}
            type="button"
          >
            {level.id}
          </button>
        ))}
      </div>
      <button onClick={onStart} type="button">Start {levels[levelNumber - 1].world}: {levels[levelNumber - 1].name}</button>
    </div>
  )
}

function CanvasRun({ levelNumber, playerCount, onClear }) {
  const canvasRef = useRef(null)
  const [paused, setPaused] = useState(false)
  const held = useRef({ p1: {}, p2: {} })
  const pausedRef = useRef(false)
  const onClearRef = useRef(onClear)
  pausedRef.current = paused
  onClearRef.current = onClear

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const state = createRun(levels[levelNumber - 1], playerCount)
    let frame = 0
    let clearTimer = 0
    let last = performance.now()
    let stopped = false

    function resize() {
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.max(640, Math.floor(rect.width * ratio))
      canvas.height = Math.max(360, Math.floor(rect.height * ratio))
    }
    resize()
    window.addEventListener('resize', resize)

    function loop(now) {
      if (stopped) return
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now
      if (!pausedRef.current) stepRun(state, dt, held.current)
      drawRun(ctx, state, canvas.width, canvas.height)
      if (state.status === 'clear') {
        clearTimer = window.setTimeout(() => onClearRef.current(), 700)
        stopped = true
        return
      }
      frame = window.requestAnimationFrame(loop)
    }
    frame = window.requestAnimationFrame(loop)
    return () => {
      stopped = true
      window.clearTimeout(clearTimer)
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [levelNumber, playerCount])

  useEffect(() => {
    function setKey(event, down) {
      const mapped = controlMap(event.key, event.code)
      if (event.key === 'Escape' && down) {
        event.preventDefault()
        setPaused((current) => !current)
        return
      }
      if (!mapped) return
      event.preventDefault()
      held.current[mapped.id][mapped.action] = down
    }
    const down = (event) => setKey(event, true)
    const up = (event) => setKey(event, false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  function hold(id, action, down) {
    held.current[id][action] = down
  }

  return (
    <>
      <canvas ref={canvasRef} aria-label="Field Run stage" />
      <div className="arcade-pad" aria-label="On-screen controls">
        <button onPointerDown={() => hold('p1', 'left', true)} onPointerUp={() => hold('p1', 'left', false)} type="button">Left</button>
        <button onPointerDown={() => hold('p1', 'right', true)} onPointerUp={() => hold('p1', 'right', false)} type="button">Right</button>
        <button onPointerDown={() => hold('p1', 'jump', true)} onPointerUp={() => hold('p1', 'jump', false)} type="button">Jump</button>
        <button onPointerDown={() => hold('p1', 'fire', true)} onPointerUp={() => hold('p1', 'fire', false)} type="button">Fire</button>
        <button onPointerDown={() => hold('p1', 'interact', true)} onPointerUp={() => hold('p1', 'interact', false)} type="button">Interact</button>
      </div>
      {paused ? (
        <div className="arcade-clear">
          <h2>Paused</h2>
          <button onClick={() => setPaused(false)} type="button">Resume</button>
        </div>
      ) : null}
    </>
  )
}
