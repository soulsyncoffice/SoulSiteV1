import { useState } from 'react'
import {
  assessmentDimensions,
  buildAssessmentSubmission,
  getActiveAssessmentQuestions,
  validateAssessmentResult,
} from './assessmentSchema.js'

export default function AssessmentPanel({ onAssess }) {
  const [answers, setAnswers] = useState({})
  const [consented, setConsented] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const activeQuestions = getActiveAssessmentQuestions(answers)
  const ready = activeQuestions.every(({ id, options }) =>
    options.some(({ value }) => value === answers[id]),
  )

  function updateAnswer(questionId, answer) {
    setAnswers((current) => {
      const next = { ...current, [questionId]: answer }
      if (questionId === 'priority') {
        const activeIds = new Set(getActiveAssessmentQuestions(next).map(({ id }) => id))
        Object.keys(next).forEach((id) => {
          if (!activeIds.has(id)) delete next[id]
        })
      }
      return next
    })
    setResult(null)
    setError('')
  }

  async function submitAssessment() {
    if (!onAssess || submitting) return
    setError('')
    setSubmitting(true)
    try {
      const submission = buildAssessmentSubmission(answers, consented)
      const serverResult = await onAssess(submission)
      setResult(validateAssessmentResult(serverResult, submission.answers))
    } catch (assessmentError) {
      setError(assessmentError.message || 'The assessment could not be completed.')
    } finally {
      setSubmitting(false)
    }
  }

  function resetAssessment() {
    setAnswers({})
    setConsented(false)
    setResult(null)
    setError('')
  }

  return (
    <section aria-labelledby="assessment-title" className="profile-builder__card profile-builder__assessment">
      <p className="profile-builder__eyebrow">OPT-IN · PRIVATE REFLECTION</p>
      <h2 id="assessment-title">Values and connection assessment</h2>
      <p>
        Optional, non-clinical reflection on stated preferences. Questions adapt to your first
        answer. Answers are not added to your profile and are submitted only after explicit consent
        through the connected assessment handler. The server—not this browser—must calculate any
        scores and write each named-dimension explanation.
      </p>
      {!result && (
        <>
          <div className="profile-builder__assessment-questions">
            {activeQuestions.map((question) => (
              <fieldset className="profile-builder__assessment-question" key={question.id}>
                <legend>{question.prompt}</legend>
                {question.options.map((option) => (
                  <label className="profile-builder__toggle" key={option.value}>
                    <input
                      checked={answers[question.id] === option.value}
                      name={`assessment-${question.id}`}
                      onChange={() => updateAnswer(question.id, option.value)}
                      type="radio"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          <label className="profile-builder__toggle">
            <input
              checked={consented}
              onChange={(event) => setConsented(event.target.checked)}
              type="checkbox"
            />
            <span>
              I choose to submit these private assessment answers to the connected SoulSite
              assessment service for a private result.
            </span>
          </label>
          <p className="profile-builder__hint">
            No answer is required. You may stop or reset at any time. Avoid entering sensitive
            details; this assessment asks only about preferences.
          </p>
          <button
            className="profile-builder__button profile-builder__button--primary"
            disabled={!onAssess || !consented || !ready || submitting}
            onClick={submitAssessment}
            type="button"
          >
            {submitting ? 'Preparing private result…' : 'Submit opt-in assessment'}
          </button>
          {!onAssess && (
            <p className="profile-builder__hint">
              Assessment submission is unavailable until a server-backed onAssess handler is connected.
            </p>
          )}
        </>
      )}
      {result && (
        <div className="profile-builder__assessment-results">
          <h3>Your server-generated reflections</h3>
          {result.dimensions.map((dimension) => (
            <article className="profile-builder__dimension" key={dimension.id}>
              <div>
                <h4>{dimension.label}</h4>
                {dimension.score !== null && <span>{dimension.score} / 100</span>}
              </div>
              <p>{dimension.explanation}</p>
              <p className="profile-builder__hint">
                Based on: {dimension.evidence.map((id) => id).join(', ')}
              </p>
            </article>
          ))}
          <p className="profile-builder__hint">{result.disclaimer}</p>
          <button
            className="profile-builder__button profile-builder__button--quiet"
            onClick={resetAssessment}
            type="button"
          >
            Clear answers and result
          </button>
        </div>
      )}
      {error && <p aria-live="assertive" className="profile-builder__error">{error}</p>}
      <p className="profile-builder__hint">
        Named dimensions: {assessmentDimensions.map(({ label }) => label).join(' · ')}. Explanations
        and optional scores come only from the assessment server; the client never ranks or scores
        you.
      </p>
    </section>
  )
}
