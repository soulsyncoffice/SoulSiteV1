import { useEffect, useMemo, useState } from 'react'
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

function ConnectionsDesk({ part = 'icebreakers' }) {
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
      {part === 'icebreakers' ? <DailyIcebreaker
        prompt={prompt}
        ownSubmitted={Boolean(desk.icebreaker)}
        partnerSubmitted={false}
        ownAnswer={desk.icebreaker}
        onSubmitAnswer={async ({ answer }) => save({ ...readDesk(), icebreaker: answer })}
        onSkip={async () => save({ ...readDesk(), icebreaker: '' })}
      /> : null}
      {part === 'dates' ? <CuratedDateProposals
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
      /> : null}
      {part === 'activities' ? <MutualActivities
        activities={activities}
        consentByActivity={consentByActivity}
        onSetConsent={async ({ activityId, accepted }) => save({
          ...readDesk(),
          activityConsent: {
            ...(readDesk().activityConsent || {}),
            [activityId]: { ownAccepted: accepted, partnerAccepted: false },
          },
        })}
      /> : null}
      {part === 'voice' ? <PrivateCallSurface capability={{ providerReady: false }} /> : null}
    </div>
  )
}

function ProgressionDesk({ part = 'prompts' }) {
  const [consent, setConsent] = useState({ status: 'inactive', selfConsent: false, partnerConsent: false })
  const [steps, setSteps] = useState([])
  const [left, setLeft] = useState({ conversationPace: 3, weekendRhythm: 3, planningStyle: 3, socialEnergy: 3 })
  const [right, setRight] = useState({ conversationPace: 4, weekendRhythm: 2, planningStyle: 3, socialEnergy: 5 })

  return (
    <div className="field-stack">
      {part === 'prompts' ? <IcebreakerGame /> : null}
      {part === 'reflection' ? <DailyReflection
        day={todayKey()}
        moderateText={async (text) => approveText(text)}
        onSave={async (entry) => writeDesk({ ...readDesk(), reflection: entry })}
        onRetract={async () => writeDesk({ ...readDesk(), reflection: null })}
      /> : null}
      {part === 'consent' ? <><MutualProgression
        state={consent}
        onAction={async ({ type }) => {
          if (type === 'request') setConsent({ status: 'pending', selfConsent: true, partnerConsent: false })
          if (type === 'retract') setConsent({ status: 'inactive', selfConsent: false, partnerConsent: false })
          if (type === 'end') setConsent({ status: 'ended', selfConsent: false, partnerConsent: false })
        }}
      />
      <CooperativeEvent event={cooperativeEvent} consentState={consent} completedStepIds={steps} onComplete={({ stepId }) => setSteps((current) => [...current, stepId])} />
      </> : null}
      {part === 'alignment' ? <><AlignmentReflection leftPreferences={left} rightPreferences={right} />
      <div className="field-sliders">
        {ALIGNMENT_DIMENSIONS.map((dimension) => (
          <label key={dimension.id}>
            Your {dimension.label}: {left[dimension.id]}
            <input type="range" min="1" max="5" value={left[dimension.id]} onChange={(event) => setLeft((current) => ({ ...current, [dimension.id]: Number(event.target.value) }))} />
            Another stated preference: {right[dimension.id]}
            <input type="range" min="1" max="5" value={right[dimension.id]} onChange={(event) => setRight((current) => ({ ...current, [dimension.id]: Number(event.target.value) }))} />
          </label>
        ))}
      </div></> : null}
      {part === 'safety' ? <FeedbackSafetyForm
        moderateText={async (text) => approveText(text)}
        onFeedback={async (payload) => writeDesk({ ...readDesk(), feedback: [...(readDesk().feedback || []), payload] })}
        onReport={async (payload) => writeDesk({ ...readDesk(), reports: [...(readDesk().reports || []), payload] })}
      /> : null}
    </div>
  )
}

export default function SoulField({ profiles = [], onClose, section = 'play', sub = '', inline = false }) {
  const discoveryProfiles = useMemo(() => profiles.map((profile) => ({
    profileId: profile.id,
    displayName: profile.name,
    connectionIntent: 'open-to-exploring',
    hobbies: profile.tags || [],
    musicGenres: [],
    cultureInterests: [],
  })), [profiles])

  const body = (
    <>
        {section === 'connections' ? <ConnectionsDesk part={sub || 'icebreakers'} /> : null}
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
        {section === 'progression' ? <ProgressionDesk part={sub || 'prompts'} /> : null}
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
    </>
  )
  if (inline) return <div className="field-inline">{body}</div>
  return (
    <div className="field-overlay">
      <div className="field-panel">
        <button type="button" onClick={onClose}>Back to home</button>
        {body}
      </div>
    </div>
  )
}
