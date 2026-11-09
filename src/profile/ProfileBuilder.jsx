import { useMemo, useState } from 'react'
import {
  allProfileFieldIds,
  createDefaultOverviewSelection,
  profileSections,
} from './profileSchema.js'
import AssessmentPanel from './AssessmentPanel.jsx'
import { countOverviewWords, generateOverview, getMissingOverviewQuestions } from './soulmind.js'
import './ProfileBuilder.css'

const blankConsent = {
  shareWithMembers: false,
  shareOverview: false,
  personalizeExperience: false,
}

function profilePayload(answers, skippedSections, consent, overview, includeInOverview, id) {
  return {
    id: id || null,
    schemaVersion: 1,
    answers,
    skippedSections,
    consent,
    overview: overview || null,
    includeInOverview,
  }
}

function downloadProfile(profile) {
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'soulsite-profile.json'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export default function ProfileBuilder({ initialProfile = {}, onSave, onDelete, onExport, onAssess }) {
  const [answers, setAnswers] = useState(() => ({ ...(initialProfile.answers || {}) }))
  const [skippedSections, setSkippedSections] = useState(
    () => new Set(initialProfile.skippedSections || []),
  )
  const [includeInOverview, setIncludeInOverview] = useState(() => ({
    ...createDefaultOverviewSelection(),
    ...(initialProfile.includeInOverview || {}),
  }))
  const [consent, setConsent] = useState(() => ({
    ...blankConsent,
    ...(initialProfile.consent || {}),
  }))
  const [overview, setOverview] = useState(initialProfile.overview || '')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [savedProfileId, setSavedProfileId] = useState(initialProfile.id || null)

  const missingQuestions = useMemo(() => getMissingOverviewQuestions(answers), [answers])
  const overviewWordCount = countOverviewWords(overview)
  const overviewHasInvalidLength = Boolean(overview) && overviewWordCount !== 500

  function updateAnswer(fieldId, value) {
    setAnswers((current) => ({ ...current, [fieldId]: value }))
    setOverview('')
    setStatus('')
  }

  function skipSection(section) {
    setAnswers((current) => {
      const next = { ...current }
      section.fields.forEach(({ id }) => {
        delete next[id]
      })
      return next
    })
    setSkippedSections((current) => new Set(current).add(section.id))
    setOverview('')
    setStatus(`${section.title} was skipped and its answers were cleared from this draft.`)
    setError('')
  }

  function restoreSection(sectionId) {
    setSkippedSections((current) => {
      const next = new Set(current)
      next.delete(sectionId)
      return next
    })
    setStatus('Section restored. Previously cleared answers are not recovered.')
  }

  function prepareOverview() {
    setError('')
    setStatus('')
    if (missingQuestions.length) {
      setStatus('Answer the follow-up questions below before SoulMind can prepare the overview.')
      return
    }

    try {
      setOverview(generateOverview(answers, includeInOverview))
      setStatus('Overview prepared locally. Review the sources and edit the draft before saving.')
    } catch (generationError) {
      setError(generationError.message || 'The overview could not be prepared.')
    }
  }

  async function saveProfile() {
    if (!onSave || saving || overviewHasInvalidLength) return
    setSaving(true)
    setError('')
    setStatus('')
    try {
      const saved = await onSave(
        profilePayload(
          answers,
          [...skippedSections],
          { ...consent },
          overview,
          { ...includeInOverview },
          savedProfileId,
        ),
      )
      if (saved?.id) setSavedProfileId(saved.id)
      setStatus('Your profile was saved.')
    } catch (saveError) {
      setError(saveError.message || 'Your profile could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteProfile() {
    if (!onDelete || !savedProfileId) return
    setError('')
    try {
      await onDelete(savedProfileId)
      setSavedProfileId(null)
      setAnswers({})
      setOverview('')
      setConsent({ ...blankConsent })
      setSkippedSections(new Set())
      setIncludeInOverview(createDefaultOverviewSelection())
      setConfirmDelete(false)
      setStatus('The saved profile was deleted.')
    } catch (deleteError) {
      setError(deleteError.message || 'The saved profile could not be deleted.')
    }
  }

  function exportProfile() {
    const profile = profilePayload(
      answers,
      [...skippedSections],
      { ...consent },
      overview,
      { ...includeInOverview },
      savedProfileId,
    )
    if (onExport) {
      try {
        Promise.resolve(onExport(profile)).catch((exportError) => {
          setError(exportError.message || 'The profile could not be exported.')
        })
      } catch (exportError) {
        setError(exportError.message || 'The profile could not be exported.')
      }
      return
    }
    downloadProfile(profile)
  }

  return (
    <main className="profile-builder">
      <header className="profile-builder__header">
        <p className="profile-builder__eyebrow">SOULSITE · YOUR PROFILE</p>
        <h1>Build a profile that feels like you</h1>
        <p>
          Answer only what you want to share. Every question is optional; the three marked answers
          are needed only if you ask SoulMind to prepare your 500-word overview.
        </p>
        <p className="profile-builder__privacy">
          Private by default. Nothing is sent to an AI service or shared unless you opt in and your
          connected account explicitly supports that choice.
        </p>
      </header>

      <div className="profile-builder__content">
        <section aria-labelledby="profile-privacy-title" className="profile-builder__card">
          <h2 id="profile-privacy-title">Your privacy choices</h2>
          <p>All choices start off. Review them before saving; your save handler must enforce them.</p>
          <label className="profile-builder__toggle">
            <input
              checked={consent.shareWithMembers}
              onChange={(event) =>
                setConsent((current) => ({ ...current, shareWithMembers: event.target.checked }))
              }
              type="checkbox"
            />
            <span> I consent to show my profile to other members.</span>
          </label>
          <label className="profile-builder__toggle">
            <input
              checked={consent.shareOverview}
              onChange={(event) =>
                setConsent((current) => ({ ...current, shareOverview: event.target.checked }))
              }
              type="checkbox"
            />
            <span> I consent to show SoulSite’s Overview to other members.</span>
          </label>
          <label className="profile-builder__toggle">
            <input
              checked={consent.personalizeExperience}
              onChange={(event) =>
                setConsent((current) => ({
                  ...current,
                  personalizeExperience: event.target.checked,
                }))
              }
              type="checkbox"
            />
            <span> I consent to use my answers to personalize my own SoulSite experience.</span>
          </label>
          <p className="profile-builder__hint">
            Turning on overview sharing does not turn on profile sharing. Do not enter passwords,
            government ID numbers, precise addresses, sexual health details, or trauma details.
          </p>
        </section>

        <AssessmentPanel onAssess={onAssess} />

        <div className="profile-builder__sections">
          {profileSections.map((section) => {
            const isSkipped = skippedSections.has(section.id)
            return (
              <section className="profile-builder__card" key={section.id}>
                <div className="profile-builder__section-heading">
                  <div>
                    <p className="profile-builder__eyebrow">
                      {section.sensitive ? 'OPTIONAL · PERSONAL' : 'OPTIONAL'}
                    </p>
                    <h2>{section.title}</h2>
                    <p>{section.description}</p>
                  </div>
                  {isSkipped ? (
                    <button
                      className="profile-builder__button profile-builder__button--quiet"
                      onClick={() => restoreSection(section.id)}
                      type="button"
                    >
                      Restore section
                    </button>
                  ) : (
                    <button
                      className="profile-builder__button profile-builder__button--quiet"
                      onClick={() => skipSection(section)}
                      type="button"
                    >
                      Skip &amp; clear section
                    </button>
                  )}
                </div>
                {!isSkipped && (
                  <div className="profile-builder__fields">
                    {section.fields.map((field) => (
                      <div className="profile-builder__field" key={field.id}>
                        <label htmlFor={`profile-${field.id}`}>
                          {field.prompt}
                          {field.overviewRequired && (
                            <span className="profile-builder__required">
                              {' '}
                              · needed for overview only
                            </span>
                          )}
                        </label>
                        <p className="profile-builder__hint">{field.helpText}</p>
                        <textarea
                          id={`profile-${field.id}`}
                          maxLength={1200}
                          onChange={(event) => updateAnswer(field.id, event.target.value)}
                          placeholder="Write as much or as little as you like…"
                          rows={3}
                          value={answers[field.id] || ''}
                        />
                        <label className="profile-builder__toggle profile-builder__toggle--small">
                          <input
                            checked={includeInOverview[field.id] || false}
                            disabled={field.overviewRequired}
                            onChange={(event) =>
                              {
                                setIncludeInOverview((current) => ({
                                  ...current,
                                  [field.id]: event.target.checked,
                                }))
                                setOverview('')
                              }
                            }
                            type="checkbox"
                          />
                          <span>
                            Include this answer in SoulSite’s Overview
                            {field.overviewRequired ? ' (required)' : ''}
                          </span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>

        <section aria-labelledby="soulmind-title" className="profile-builder__card profile-builder__soulmind">
          <p className="profile-builder__eyebrow">SOULMIND · LOCAL WRITING SUPPORT</p>
          <h2 id="soulmind-title">SoulSite’s Overview</h2>
          <p>
            SoulMind uses a deterministic template in this browser; it does not call an AI or send
            your answers anywhere. Facts stay in your words and are tied to their prompts. Selected
            personal sections default out of the overview.
          </p>
          {missingQuestions.length > 0 && (
            <div aria-live="polite" className="profile-builder__followups">
              <h3>Before writing, please answer these neutrally worded questions:</h3>
              <ul>
                {missingQuestions.map(({ id, question }) => (
                  <li key={id}>
                    <a href={`#profile-${id}`}>{question}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            className="profile-builder__button profile-builder__button--primary"
            onClick={prepareOverview}
            type="button"
          >
            Prepare 500-word overview
          </button>
          {overview && (
            <div className="profile-builder__review">
              <div className="profile-builder__review-heading">
                <h3>Review and edit before saving</h3>
                <span aria-live="polite">{overviewWordCount} / 500 words</span>
              </div>
              <p className="profile-builder__hint">
                The first lines explain the source and repetition. The profile answers are
                JSON-quoted with their prompts; editing this draft is always your choice.
              </p>
              <textarea
                aria-label="Review and edit SoulSite’s Overview"
                onChange={(event) => setOverview(event.target.value)}
                rows={18}
                value={overview}
              />
              {overviewHasInvalidLength && (
                <p className="profile-builder__error">
                  Keep the overview at exactly 500 words, or remove it before saving your profile.
                </p>
              )}
              <button
                className="profile-builder__button profile-builder__button--quiet"
                onClick={() => setOverview('')}
                type="button"
              >
                Remove overview draft
              </button>
            </div>
          )}
        </section>

        <section aria-label="Profile actions" className="profile-builder__actions">
          <button
            className="profile-builder__button profile-builder__button--primary"
            disabled={!onSave || saving || overviewHasInvalidLength}
            onClick={saveProfile}
            type="button"
          >
            {saving ? 'Saving…' : 'Save private profile'}
          </button>
          {!onSave && <p className="profile-builder__hint">Saving is unavailable until an auth-aware onSave handler is connected.</p>}
          <button className="profile-builder__button" onClick={exportProfile} type="button">
            Export profile JSON
          </button>
          {savedProfileId && onDelete && (
            confirmDelete ? (
              <div className="profile-builder__delete-confirm">
                <p>This permanently deletes the saved profile through your connected account.</p>
                <button
                  className="profile-builder__button profile-builder__button--danger"
                  onClick={deleteProfile}
                  type="button"
                >
                  Confirm delete
                </button>
                <button
                  className="profile-builder__button profile-builder__button--quiet"
                  onClick={() => setConfirmDelete(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="profile-builder__button profile-builder__button--danger"
                onClick={() => setConfirmDelete(true)}
                type="button"
              >
                Delete saved profile
              </button>
            )
          )}
          <p aria-live="polite" className="profile-builder__status">{status}</p>
          {error && <p aria-live="assertive" className="profile-builder__error">{error}</p>}
          {overviewHasInvalidLength && (
            <p className="profile-builder__hint">Remove the edited overview or restore its exact 500-word length before saving.</p>
          )}
          <p className="profile-builder__hint">
            The connected account owns persistence, authorization, and deletion. This module never
            stores profile answers itself.
          </p>
        </section>
      </div>

      <footer className="profile-builder__footer">
        <span>{allProfileFieldIds.length} optional prompts · skip any section</span>
        <span>Private until you choose otherwise</span>
      </footer>
    </main>
  )
}
