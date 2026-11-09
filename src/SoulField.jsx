import { useEffect, useMemo, useState } from 'react'
import {
  createInitialState,
  levels,
  simulateStep,
} from './game/index.js'
import {
  CuratedDateProposals,
  DailyIcebreaker,
  MutualActivities,
  PrivateCallSurface,
} from './interactions/index.js'
import ProfileBuilder from './profile/ProfileBuilder.jsx'
import { assessmentDimensions } from './profile/assessmentSchema.js'
import {
  AlignmentReflection,
  CooperativeEvent,
  DailyReflection,
  FeedbackSafetyForm,
  IcebreakerGame,
  MutualProgression,
} from './progression/ProgressionFeatures.jsx'
import { ALIGNMENT_DIMENSIONS } from './progression/domain.js'
import TrustPrivacyHub from './trust/TrustPrivacyHub.jsx'
import './SoulField.css'

const storageKey = 'soulsite.fieldDesk'
const tileLabels = {
  '#': 'Wall',
  '.': 'Open path',
  S: 'Start',
  R: 'Checkpoint',
  E: 'Exit',
  C: 'Collectible',
  T: 'Switch',
  G: 'Locked gate',
  H: 'Hazard, returns you to the checkpoint',
  P: 'Co-op plate',
  B: 'Locked path',
}

const activities = [
  { id: 'library-hour', title: 'Library hour', description: 'Sit with a shared question and no agenda.', durationMinutes: 60 },
  { id: 'market-walk', title: 'Market walk', description: 'A public, low-pressure walk through a busy place.', durationMinutes: 90 },
  { id: 'kitchen-table', title: 'Kitchen table', description: 'Cook something simple and talk while it simmers.', durationMinutes: 120 },
]

const cooperativeEvent = {
  id: 'lantern-walk',
  title: 'Lantern walk',
  visibility: 'private',
  steps: [
    { id: 'meet', label: 'Agree on a public meeting point' },
    { id: 'walk', label: 'Take the walk only if both still want to' },
    { id: 'close', label: 'End the evening without a required follow-up' },
  ],
}

const sections = [
  ['play', 'Play'],
  ['connections', 'Connections'],
  ['trust', 'Trust'],
  ['progression', 'Progression'],
  ['profile', 'Profile builder'],
]

function readDesk() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '{}')
  } catch {
    return {}
  }
}

function writeDesk(next) {
  localStorage.setItem(storageKey, JSON.stringify(next))
}

function approveText(text) {
  if (/https?:\/\/|@|www\./i.test(text)) {
    return { status: 'rejected', reason: 'Contact details and links stay out of the field.' }
  }
  return { status: 'approved' }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function SoulGame() {
  const [levelId, setLevelId] = useState(levels[0].id)
  const [activePlayer, setActivePlayer] = useState('p1')
  const [completed, setCompleted] = useState(() => readDesk().completedLevels || [])
  const level = levels.find((item) => item.id === levelId) || levels[0]
  const playerCount = level.mode === 'co-op' ? 2 : 1
  const [game, setGame] = useState(() => createInitialState(level, playerCount))

  useEffect(() => {
    setActivePlayer('p1')
    setGame(createInitialState(level, level.mode === 'co-op' ? 2 : 1))
  }, [level])

  useEffect(() => {
    if (game.status !== 'complete' || completed.includes(level.id)) return
    const next = [...completed, level.id]
    setCompleted(next)
    writeDesk({ ...readDesk(), completedLevels: next })
  }, [completed, game.status, level.id])

  function act(input) {
    setGame((current) => simulateStep(level, current, [{ playerId: activePlayer, input }]))
  }

  useEffect(() => {
    function onKey(event) {
      const input = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'Enter', ' '].includes(event.key)
        ? event.key
        : null
      if (!input) return
      event.preventDefault()
      act(input)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const width = level.layout[0]?.length || 1
  return (
    <section className="field-game" aria-labelledby="field-game-title">
      <div className="field-game-copy">
        <p className="field-kicker">Recovered game · 20 authored levels</p>
        <h2 id="field-game-title">{level.world}: {level.title}</h2>
        <p>{level.accessibilityNotes}</p>
        <p className="field-note">
          This is the authored module from the game branch. It is turn-based and playable now.
          It is 20 distinct levels across 10 worlds, not the planned 500-level catalog.
        </p>
        <label>
          Level
          <select value={level.id} onChange={(event) => setLevelId(event.target.value)}>
            {levels.map((item) => (
              <option key={item.id} value={item.id}>
                {completed.includes(item.id) ? '✓ ' : ''}{item.world} {item.number}: {item.title} ({item.mode})
              </option>
            ))}
          </select>
        </label>
        {level.mode === 'co-op' ? (
          <div className="field-player-switch" role="group" aria-label="Active soul">
            <button type="button" aria-pressed={activePlayer === 'p1'} onClick={() => setActivePlayer('p1')}>Soul 1</button>
            <button type="button" aria-pressed={activePlayer === 'p2'} onClick={() => setActivePlayer('p2')}>Soul 2</button>
          </div>
        ) : null}
        <p role="status">
          {game.status === 'complete' ? 'Level complete.' : `Turn ${game.tick}. Collected ${game.progress.collected.length}. Switches ${game.progress.activated.length}.`}
        </p>
        <div className="field-pad" role="group" aria-label="Movement">
          <button type="button" onClick={() => act('up')}>Up</button>
          <button type="button" onClick={() => act('left')}>Left</button>
          <button type="button" onClick={() => act('down')}>Down</button>
          <button type="button" onClick={() => act('right')}>Right</button>
          <button type="button" onClick={() => act('interact')}>Interact</button>
          <button type="button" onClick={() => setGame(createInitialState(level, playerCount))}>Restart</button>
        </div>
      </div>
      <div className="field-board" style={{ '--cols': width }} role="img" aria-label={`${level.title} map`}>
        {level.layout.flatMap((row, y) => [...row].map((tile, x) => {
          const players = game.players.filter((player) => player.x === x && player.y === y)
          const label = players.length
            ? `${players.map((player) => player.id).join(' and ')} on ${tileLabels[tile] || tile}`
            : tileLabels[tile] || tile
          return (
            <span className={`field-tile tile-${tile === '#' ? 'wall' : 'open'}${players.length ? ' has-player' : ''}`} key={`${x}-${y}`} title={label}>
              <span className="field-glyph">{tile === '.' ? '' : tile}</span>
              {players.map((player) => <i key={player.id}>{player.id === 'p2' ? '2' : '1'}</i>)}
            </span>
          )
        }))}
      </div>
    </section>
  )
}

function ConnectionsDesk() {
  const [desk, setDesk] = useState(readDesk)
  const prompt = { id: `daily-${todayKey()}`, date: todayKey(), prompt: 'What would make an ordinary evening feel well spent?' }
  const proposals = desk.proposals || []
  const consentByActivity = desk.activityConsent || {}

  function save(next) {
    writeDesk(next)
    setDesk(next)
  }

  return (
    <div className="field-stack">
      <DailyIcebreaker
        prompt={prompt}
        ownSubmitted={Boolean(desk.icebreaker)}
        partnerSubmitted={false}
        ownAnswer={desk.icebreaker}
        onSubmitAnswer={async ({ answer }) => save({ ...readDesk(), icebreaker: answer })}
        onSkip={async () => save({ ...readDesk(), icebreaker: '' })}
      />
      <CuratedDateProposals
        activities={activities}
        proposals={proposals}
        onPropose={async (draft) => {
          const next = {
            ...readDesk(),
            proposals: [...(readDesk().proposals || []), {
              id: `proposal-${Date.now()}`,
              activityId: draft.activityId,
              note: draft.note,
              proposedAt: draft.proposedAt,
              status: 'pending',
              permissions: { canRespond: false, canCancel: true },
            }],
          }
          save(next)
        }}
        onCancel={async ({ proposalId }) => save({
          ...readDesk(),
          proposals: (readDesk().proposals || []).map((item) => item.id === proposalId ? { ...item, status: 'cancelled', permissions: { canRespond: false, canCancel: false } } : item),
        })}
      />
      <MutualActivities
        activities={activities}
        consentByActivity={consentByActivity}
        onSetConsent={async ({ activityId, accepted }) => save({
          ...readDesk(),
          activityConsent: {
            ...(readDesk().activityConsent || {}),
            [activityId]: { ownAccepted: accepted, partnerAccepted: false },
          },
        })}
      />
      <PrivateCallSurface capability={{ providerReady: false }} />
    </div>
  )
}

function ProgressionDesk() {
  const [consent, setConsent] = useState({ status: 'inactive', selfConsent: false, partnerConsent: false })
  const [steps, setSteps] = useState([])
  const [left, setLeft] = useState({ conversationPace: 3, weekendRhythm: 3, planningStyle: 3, socialEnergy: 3 })
  const [right, setRight] = useState({ conversationPace: 4, weekendRhythm: 2, planningStyle: 3, socialEnergy: 5 })

  return (
    <div className="field-stack">
      <IcebreakerGame />
      <DailyReflection
        day={todayKey()}
        moderateText={async (text) => approveText(text)}
        onSave={async (entry) => writeDesk({ ...readDesk(), reflection: entry })}
        onRetract={async () => writeDesk({ ...readDesk(), reflection: null })}
      />
      <MutualProgression
        state={consent}
        onAction={async ({ type }) => {
          if (type === 'request') setConsent({ status: 'pending', selfConsent: true, partnerConsent: false })
          if (type === 'retract') setConsent({ status: 'inactive', selfConsent: false, partnerConsent: false })
          if (type === 'end') setConsent({ status: 'ended', selfConsent: false, partnerConsent: false })
        }}
      />
      <CooperativeEvent event={cooperativeEvent} consentState={consent} completedStepIds={steps} onComplete={({ stepId }) => setSteps((current) => [...current, stepId])} />
      <AlignmentReflection leftPreferences={left} rightPreferences={right} />
      <div className="field-sliders">
        {ALIGNMENT_DIMENSIONS.map((dimension) => (
          <label key={dimension.id}>
            Your {dimension.label}: {left[dimension.id]}
            <input type="range" min="1" max="5" value={left[dimension.id]} onChange={(event) => setLeft((current) => ({ ...current, [dimension.id]: Number(event.target.value) }))} />
            Another stated preference: {right[dimension.id]}
            <input type="range" min="1" max="5" value={right[dimension.id]} onChange={(event) => setRight((current) => ({ ...current, [dimension.id]: Number(event.target.value) }))} />
          </label>
        ))}
      </div>
      <FeedbackSafetyForm
        moderateText={async (text) => approveText(text)}
        onFeedback={async (payload) => writeDesk({ ...readDesk(), feedback: [...(readDesk().feedback || []), payload] })}
        onReport={async (payload) => writeDesk({ ...readDesk(), reports: [...(readDesk().reports || []), payload] })}
      />
    </div>
  )
}

export default function SoulField({ profiles = [], onClose }) {
  const [section, setSection] = useState('play')
  const discoveryProfiles = useMemo(() => profiles.map((profile) => ({
    profileId: profile.id,
    displayName: profile.name,
    connectionIntent: 'open-to-exploring',
    hobbies: profile.tags || [],
    musicGenres: [],
    cultureInterests: [],
  })), [profiles])

  return (
    <div className="field-overlay">
      <div className="field-panel">
        <header className="field-bar">
          <div>
            <p className="field-kicker">Recovered from unmerged branches</p>
            <h2>The field desk</h2>
          </div>
          <button type="button" onClick={onClose}>Back to home</button>
        </header>
        <nav className="field-tabs" aria-label="Recovered features">
          {sections.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={section === id} onClick={() => setSection(id)}>{label}</button>
          ))}
        </nav>
        {section === 'play' ? <SoulGame /> : null}
        {section === 'connections' ? <ConnectionsDesk /> : null}
        {section === 'trust' ? (
          <TrustPrivacyHub
            discoveryProfiles={discoveryProfiles}
            onSavePreferences={async (payload) => writeDesk({ ...readDesk(), preferences: payload })}
            onSaveAreaConsent={async (payload) => writeDesk({ ...readDesk(), areaConsent: payload })}
            onRevokeAreaConsent={async () => writeDesk({ ...readDesk(), areaConsent: null })}
            onBlockProfile={async (payload) => writeDesk({ ...readDesk(), blocks: [...(readDesk().blocks || []), payload] })}
            onSubmitSafetyReport={async (payload) => writeDesk({ ...readDesk(), reports: [...(readDesk().reports || []), payload] })}
            onSaveSafetyPlan={async (payload) => writeDesk({ ...readDesk(), safetyPlan: payload })}
            onCheckIn={async (payload) => writeDesk({ ...readDesk(), checkIns: [...(readDesk().checkIns || []), payload] })}
            onSaveJournalEntry={async (payload) => writeDesk({ ...readDesk(), journal: [...(readDesk().journal || []), payload] })}
            onExportJournal={async () => {
              const blob = new Blob([JSON.stringify(readDesk().journal || [], null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const link = document.createElement('a')
              link.href = url
              link.download = 'soulsite-journal.json'
              link.click()
              URL.revokeObjectURL(url)
            }}
            onDeleteJournalEntries={async () => writeDesk({ ...readDesk(), journal: [] })}
          />
        ) : null}
        {section === 'progression' ? <ProgressionDesk /> : null}
        {section === 'profile' ? (
          <ProfileBuilder
            initialProfile={readDesk().profileBuilder || {}}
            onSave={async (draft) => {
              const saved = { ...draft, id: draft.id || 'local-profile' }
              writeDesk({ ...readDesk(), profileBuilder: saved })
              return saved
            }}
            onDelete={async () => writeDesk({ ...readDesk(), profileBuilder: null })}
            onAssess={async ({ answers }) => ({
              schemaVersion: 1,
              disclaimer: 'This local reading only restates your selected answers. It is not a personality score or a match prediction.',
              dimensions: assessmentDimensions.map((dimension) => ({
                ...dimension,
                score: null,
                explanation: 'No score is calculated in the browser. Your answers stay on this device unless you export them.',
                evidence: Object.keys(answers),
              })),
            })}
          />
        ) : null}
      </div>
    </div>
  )
}
