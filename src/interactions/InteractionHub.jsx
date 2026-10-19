import { useId, useMemo, useState } from 'react'
import {
  getVoiceCallAvailability,
  validateCuratedActivities,
  validateDailyIcebreaker,
  validatePlainText,
  validateProposalDraft,
  validateProposalRecords,
} from './contracts.js'
import { getMutualActivityStatus } from './state.js'
import './interactions.css'

function failureMessage(error) {
  return error instanceof Error ? error.message : 'The interaction could not be completed.'
}

function useActionFeedback() {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  function reportError(error) {
    setMessage(`Unable to complete this action: ${failureMessage(error)}`)
  }

  async function run(callback, payload, successMessage) {
    if (typeof callback !== 'function') {
      setMessage('This action is not connected to the service yet.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      await callback(payload)
      setMessage(successMessage)
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  return { busy, message, reportError, run }
}

function DataError({ children }) {
  return <p className="soul-interaction__notice" role="alert">{children}</p>
}

export function DailyIcebreaker({
  prompt: rawPrompt,
  ownSubmitted = false,
  partnerSubmitted = false,
  ownAnswer,
  partnerAnswer,
  onSubmitAnswer,
  onSkip,
}) {
  const feedback = useActionFeedback()
  const answerFieldId = useId()
  const titleId = useId()
  const prompt = validateDailyIcebreaker(rawPrompt)
  const [answer, setAnswer] = useState('')
  const revealAnswers = ownSubmitted === true && partnerSubmitted === true
  const safeOwnAnswer = validatePlainText(ownAnswer, 'Your answer', 1000, { required: false })
  const safePartnerAnswer = validatePlainText(partnerAnswer, 'Partner answer', 1000, { required: false })

  return (
    <section className="soul-interaction" aria-labelledby={titleId}>
      <p className="soul-interaction__eyebrow">TODAY’S PAIR PROMPT · {prompt.date}</p>
      <h2 id={titleId}>A small question, for both of you</h2>
      <p className="soul-interaction__prompt">{prompt.prompt}</p>
      {ownSubmitted === true ? (
        <p role="status">Your answer is submitted. {partnerSubmitted === true ? 'Both answers are unlocked.' : 'Your partner’s answer stays private until they submit.'}</p>
      ) : (
        <form onSubmit={(event) => {
          event.preventDefault()
          let safeAnswer
          try {
            safeAnswer = validatePlainText(answer, 'Answer', 1000)
          } catch (error) {
            feedback.reportError(error)
            return
          }
          void feedback.run(onSubmitAnswer, { promptId: prompt.id, answer: safeAnswer }, 'Answer submitted privately.')
        }}>
          <label className="soul-interaction__label" htmlFor={answerFieldId}>Your answer</label>
          <textarea
            id={answerFieldId}
            maxLength={1000}
            required
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
          />
          <div className="soul-interaction__actions">
            <button type="submit" disabled={feedback.busy || !answer.trim()}>Submit privately</button>
            {typeof onSkip === 'function' && (
              <button
                type="button"
                className="soul-interaction__secondary"
                disabled={feedback.busy}
                onClick={() => void feedback.run(onSkip, { promptId: prompt.id }, 'Prompt skipped.')}
              >
                Skip today’s prompt
              </button>
            )}
          </div>
        </form>
      )}
      {revealAnswers && (
        <div className="soul-interaction__answers" aria-live="polite">
          <h3>Shared answers</h3>
          <p><strong>Your answer:</strong> {safeOwnAnswer || 'Answer submitted'}</p>
          <p><strong>Your partner’s answer:</strong> {safePartnerAnswer || 'Answer submitted'}</p>
        </div>
      )}
      <p className="soul-interaction__feedback" role="status" aria-live="polite">{feedback.message}</p>
    </section>
  )
}

export function CuratedDateProposals({
  activities: rawActivities,
  proposals: rawProposals = [],
  onPropose,
  onRespond,
  onCancel,
}) {
  const feedback = useActionFeedback()
  const activities = useMemo(() => validateCuratedActivities(rawActivities), [rawActivities])
  const proposals = useMemo(() => validateProposalRecords(rawProposals), [rawProposals])
  const formId = useId()
  const titleId = useId()
  const [activityId, setActivityId] = useState(activities[0]?.id ?? '')
  const [note, setNote] = useState('')
  const [proposedAt, setProposedAt] = useState('')
  const selectedActivityId = activities.some((activity) => activity.id === activityId)
    ? activityId
    : activities[0]?.id ?? ''

  async function propose(event) {
    event.preventDefault()
    try {
      const draft = validateProposalDraft({ activityId: selectedActivityId, note, proposedAt })
      await feedback.run(onPropose, draft, 'Date idea sent. It is not confirmed until your match accepts.')
    } catch (error) {
      feedback.reportError(error)
    }
  }

  return (
    <section className="soul-interaction" aria-labelledby={titleId}>
      <p className="soul-interaction__eyebrow">CURATED DATE IDEAS</p>
      <h2 id={titleId}>Suggest something to do together</h2>
      {activities.length === 0 ? (
        <p>No curated activities are available right now.</p>
      ) : (
        <form onSubmit={(event) => void propose(event)}>
          <label className="soul-interaction__label" htmlFor={`${formId}-activity`}>Activity</label>
          <select id={`${formId}-activity`} value={selectedActivityId} onChange={(event) => setActivityId(event.target.value)}>
            {activities.map((activity) => (
              <option key={activity.id} value={activity.id}>{activity.title}</option>
            ))}
          </select>
          <p className="soul-interaction__detail">
            {activities.find((activity) => activity.id === selectedActivityId)?.description}
          </p>
          <label className="soul-interaction__label" htmlFor={`${formId}-time`}>Optional time</label>
          <input id={`${formId}-time`} type="datetime-local" value={proposedAt} onChange={(event) => setProposedAt(event.target.value)} />
          <label className="soul-interaction__label" htmlFor={`${formId}-note`}>Note (optional)</label>
          <textarea id={`${formId}-note`} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
          <button type="submit" disabled={feedback.busy || !selectedActivityId}>Send date idea</button>
        </form>
      )}
      <div className="soul-interaction__proposal-list" aria-label="Date proposals">
        {proposals.map((proposal) => {
          const activity = activities.find((item) => item.id === proposal.activityId)
          return (
            <article className="soul-interaction__proposal" key={proposal.id}>
              <h3>{activity?.title ?? 'Date idea'}</h3>
              {proposal.note && <p>{proposal.note}</p>}
              {proposal.proposedAt && <p>Suggested time: {proposal.proposedAt}</p>}
              <p>Status: <strong>{proposal.status}</strong></p>
              {proposal.status === 'pending' && (proposal.permissions.canRespond || proposal.permissions.canCancel) && (
                <div className="soul-interaction__actions">
                  {proposal.permissions.canRespond && (
                    <>
                      <button type="button" disabled={feedback.busy} onClick={() => void feedback.run(onRespond, { proposalId: proposal.id, response: 'accept' }, 'Proposal accepted.')}>Accept</button>
                      <button type="button" className="soul-interaction__secondary" disabled={feedback.busy} onClick={() => void feedback.run(onRespond, { proposalId: proposal.id, response: 'decline' }, 'Proposal declined.')}>Decline</button>
                    </>
                  )}
                  {proposal.permissions.canCancel && (
                    <button type="button" className="soul-interaction__secondary" disabled={feedback.busy} onClick={() => void feedback.run(onCancel, { proposalId: proposal.id }, 'Proposal cancelled.')}>Cancel</button>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>
      <p className="soul-interaction__feedback" role="status" aria-live="polite">{feedback.message}</p>
    </section>
  )
}

export function MutualActivities({ activities: rawActivities, consentByActivity = {}, onSetConsent }) {
  const feedback = useActionFeedback()
  const activities = useMemo(() => validateCuratedActivities(rawActivities), [rawActivities])
  const titleId = useId()

  return (
    <section className="soul-interaction" aria-labelledby={titleId}>
      <p className="soul-interaction__eyebrow">MUTUAL ACTIVITIES</p>
      <h2 id={titleId}>Choose an activity together</h2>
      <p>Activities begin only after both people opt in. Either person can change their own consent.</p>
      <div className="soul-interaction__activity-list">
        {activities.map((activity) => {
          const consent = consentByActivity[activity.id] ?? { ownAccepted: false, partnerAccepted: false }
          const status = getMutualActivityStatus(consent)
          return (
            <article className="soul-interaction__proposal" key={activity.id}>
              <h3>{activity.title}</h3>
              <p>{activity.description}</p>
              <p>Status: <strong>{status}</strong></p>
              <button
                type="button"
                className={consent.ownAccepted ? 'soul-interaction__secondary' : ''}
                disabled={feedback.busy || status === 'cancelled'}
                aria-pressed={consent.ownAccepted}
                onClick={() => void feedback.run(onSetConsent, {
                  activityId: activity.id,
                  accepted: !consent.ownAccepted,
                }, consent.ownAccepted ? 'Your consent was withdrawn.' : 'Your opt-in was sent. The activity starts only when both opt in.')}
              >
                {consent.ownAccepted ? 'Withdraw my opt-in' : 'I’m interested'}
              </button>
            </article>
          )
        })}
      </div>
      <p className="soul-interaction__feedback" role="status" aria-live="polite">{feedback.message}</p>
    </section>
  )
}

export function PrivateCallSurface({ capability, onRequestCall }) {
  const feedback = useActionFeedback()
  const availability = getVoiceCallAvailability(capability)
  const ready = availability.available && typeof onRequestCall === 'function'
  const titleId = useId()

  return (
    <section className="soul-interaction" aria-labelledby={titleId}>
      <p className="soul-interaction__eyebrow">PRIVATE VOICE</p>
      <h2 id={titleId}>Voice call</h2>
      {!availability.available ? (
        <p role="status">{availability.reason} Calls remain unavailable until the service configures a vetted provider and confirms both participants’ entitlement and consent.</p>
      ) : typeof onRequestCall !== 'function' ? (
        <p role="status">The provider capability is approved, but the call-request integration is not connected.</p>
      ) : (
        <p role="status">Provider-ready for {availability.providerId}. This surface only submits a call request; it does not capture audio or create a media session.</p>
      )}
      <button
        type="button"
        disabled={!ready || feedback.busy}
        onClick={() => void feedback.run(onRequestCall, { providerId: availability.providerId }, 'Call request submitted. No audio session is created by this interface.')}
      >
        Request a private call
      </button>
      <p className="soul-interaction__feedback" role="status" aria-live="polite">{feedback.message}</p>
    </section>
  )
}

export function InteractionDataError({ message }) {
  return <DataError>{message}</DataError>
}
