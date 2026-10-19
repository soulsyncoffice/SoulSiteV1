import { useState } from 'react'
import {
  ALIGNMENT_DIMENSIONS,
  ICEBREAKER_PROMPTS,
  SAFETY_REPORT_CATEGORIES,
  calculateExplainableAlignment,
  canAccessCooperativeEvent,
  chooseIcebreakerPrompt,
  retractPrivateReflection,
  savePrivateReflection,
  sendFeedback,
  sendSafetyReport,
  validateCooperativeEvent,
} from './domain.js'
import './progression.css'

function Status({ children, error = false }) {
  return <p className={error ? 'progression-status is-error' : 'progression-status'} role={error ? 'alert' : 'status'}>{children}</p>
}

export function IcebreakerGame() {
  const [round, setRound] = useState(0)
  const [seen, setSeen] = useState([])
  const prompt = chooseIcebreakerPrompt(round, seen)

  function nextPrompt() {
    if (!prompt) return
    setSeen((current) => [...current, prompt.id])
    setRound((current) => current + 1)
  }

  return (
    <section className="progression-card" aria-labelledby="icebreaker-title">
      <p className="progression-eyebrow">A private prompt game</p>
      <h2 id="icebreaker-title">A little more curious</h2>
      {prompt
        ? <><p className="progression-prompt">{prompt.prompt}</p><button type="button" onClick={nextPrompt}>Pass / next prompt</button></>
        : <><p>You’ve seen every prompt. Nothing was saved or shared.</p><button type="button" onClick={() => { setSeen([]); setRound(0) }}>Play again</button></>}
      <p className="progression-note">No names, chat, answers, or gameplay data are collected by this game.</p>
    </section>
  )
}

export function DailyReflection({ day, onSave, onRetract, moderateText }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setStatus('')
    setError('')
    try {
      await savePrivateReflection({ day, text }, { moderateText, onSave })
      setStatus('Reflection saved privately.')
      setText('')
    } catch (submissionError) {
      setError(submissionError.message || 'Could not save reflection.')
    } finally {
      setBusy(false)
    }
  }

  async function retract() {
    setBusy(true)
    setStatus('')
    setError('')
    try {
      await retractPrivateReflection(day, onRetract)
      setStatus('Reflection retracted.')
    } catch (submissionError) {
      setError(submissionError.message || 'Could not retract reflection.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="progression-card" aria-labelledby="reflection-title">
      <p className="progression-eyebrow">Only you</p>
      <h2 id="reflection-title">Daily reflection</h2>
      <form onSubmit={submit}>
        <label htmlFor="daily-reflection">What would you like to remember about today?</label>
        <textarea id="daily-reflection" maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} required />
        <div className="progression-actions">
          <button type="submit" disabled={busy}>Save privately</button>
          <button type="button" className="progression-secondary" onClick={retract} disabled={busy}>Retract today’s reflection</button>
        </div>
      </form>
      <p className="progression-note">Saving requires an authenticated adapter and explicit moderation approval. This component never stores drafts locally.</p>
      {status && <Status>{status}</Status>}
      {error && <Status error>{error}</Status>}
    </section>
  )
}

export function MutualProgression({ state, onAction }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const active = state?.status === 'active'

  async function act(type) {
    if (typeof onAction !== 'function') {
      setError('An authenticated progression adapter is required.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onAction({ type })
    } catch (actionError) {
      setError(actionError.message || 'Could not update progression consent.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="progression-card" aria-labelledby="mutual-title">
      <p className="progression-eyebrow">By mutual choice</p>
      <h2 id="mutual-title">Shared progression</h2>
      <p>{active ? 'Shared activities are available while both people consent.' : 'Shared progression stays closed until both people explicitly consent.'}</p>
      <p className="progression-note">The server must authenticate the caller, verify pair access, and enforce both consent records. Either person can withdraw at any time.</p>
      <div className="progression-actions">
        {!active && <button type="button" onClick={() => act('request')} disabled={busy || state?.status === 'ended'}>Request shared progression</button>}
        <button type="button" className="progression-secondary" onClick={() => act('retract')} disabled={busy || !state?.selfConsent}>Withdraw my consent</button>
        {active && <button type="button" className="progression-secondary" onClick={() => act('end')} disabled={busy}>End shared progression</button>}
      </div>
      {error && <Status error>{error}</Status>}
    </section>
  )
}

export function CooperativeEvent({ event, consentState, completedStepIds = [], onComplete }) {
  try {
    validateCooperativeEvent(event)
  } catch (error) {
    return <section className="progression-card"><Status error>{error.message}</Status></section>
  }
  if (!canAccessCooperativeEvent(event, consentState)) {
    return <section className="progression-card"><h2>Shared event unavailable</h2><p>It is available only with current mutual consent.</p></section>
  }
  const completed = new Set(completedStepIds)
  return (
    <section className="progression-card" aria-labelledby="cooperative-event-title">
      <p className="progression-eyebrow">Private, cooperative activity</p>
      <h2 id="cooperative-event-title">{event.title || 'A shared moment'}</h2>
      <ul className="progression-step-list">
        {event.steps.map((step) => (
          <li key={step.id}>
            <span>{step.label}</span>
            <button type="button" onClick={() => onComplete?.({ eventId: event.id, stepId: step.id })} disabled={completed.has(step.id) || typeof onComplete !== 'function'}>
              {completed.has(step.id) ? 'Done' : 'Mark complete'}
            </button>
          </li>
        ))}
      </ul>
      <p className="progression-note">No chat or participant ranking. The adapter must re-check event access and current mutual consent for every update.</p>
    </section>
  )
}

export function AlignmentReflection({ leftPreferences, rightPreferences }) {
  let alignment
  try {
    alignment = calculateExplainableAlignment(leftPreferences, rightPreferences)
  } catch (error) {
    return <section className="progression-card"><Status error>{error.message}</Status></section>
  }
  return (
    <section className="progression-card" aria-labelledby="alignment-title">
      <p className="progression-eyebrow">An explanation, not a verdict</p>
      <h2 id="alignment-title">Preference reflection: {alignment.score}%</h2>
      <ul className="progression-alignment-list">
        {alignment.dimensions.map((dimension) => (
          <li key={dimension.id}>
            <span>{dimension.label}</span>
            <span>{dimension.similarity}% similar</span>
            <small>{dimension.explanation}</small>
          </li>
        ))}
      </ul>
      <p className="progression-note">{alignment.disclaimer}</p>
    </section>
  )
}

export function FeedbackSafetyForm({ moderateText, onFeedback, onReport }) {
  const [mode, setMode] = useState('feedback')
  const [text, setText] = useState('')
  const [category, setCategory] = useState(SAFETY_REPORT_CATEGORIES[0])
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setStatus('')
    setError('')
    try {
      if (mode === 'feedback') {
        await sendFeedback(text, { moderateText, onFeedback })
      } else {
        await sendSafetyReport({ category, details: text }, { moderateText, onReport })
      }
      setStatus(mode === 'feedback' ? 'Feedback sent.' : 'Safety report sent.')
      setText('')
    } catch (submissionError) {
      setError(submissionError.message || 'Could not send your message.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="progression-card" aria-labelledby="feedback-title">
      <p className="progression-eyebrow">Help keep this space respectful</p>
      <h2 id="feedback-title">Feedback and safety</h2>
      <form onSubmit={submit}>
        <label htmlFor="feedback-mode">I want to</label>
        <select id="feedback-mode" value={mode} onChange={(event) => { setMode(event.target.value); setText('') }}>
          <option value="feedback">Share product feedback</option>
          <option value="report">Make a safety report</option>
        </select>
        {mode === 'report' && (
          <>
            <label htmlFor="safety-category">Safety concern</label>
            <select id="safety-category" value={category} onChange={(event) => setCategory(event.target.value)}>
              {SAFETY_REPORT_CATEGORIES.map((item) => <option key={item} value={item}>{item.replaceAll('-', ' ')}</option>)}
            </select>
          </>
        )}
        <label htmlFor="feedback-text">{mode === 'report' ? 'Optional details (category-only reports are accepted)' : 'Your feedback'}</label>
        <textarea id="feedback-text" maxLength={mode === 'report' ? 500 : 1000} value={text} onChange={(event) => setText(event.target.value)} required={mode === 'feedback'} />
        <button type="submit" disabled={busy}>Send {mode === 'report' ? 'safety report' : 'feedback'}</button>
      </form>
      <p className="progression-note">No recipient identity is accepted from the client. The authenticated server adapter must scope, authorize, moderate, and protect submitted content.</p>
      {status && <Status>{status}</Status>}
      {error && <Status error>{error}</Status>}
    </section>
  )
}

export function AlignmentPreferenceLabels() {
  return ALIGNMENT_DIMENSIONS.map(({ id, label }) => <span key={id}>{label}</span>)
}

export { ICEBREAKER_PROMPTS }
