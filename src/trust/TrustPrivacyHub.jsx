import { useMemo, useState } from 'react'
import {
  AREA_CONSENT_TTL_MS,
  CONNECTION_INTENTS,
  SAFETY_REPORT_CATEGORIES,
  createDateSafetyPlan,
  createPrivateJournalEntry,
  createSafetyCheckIn,
  createSafetyReport,
  grantAreaConsent,
  isAreaConsentActive,
  projectDiscoveryProfiles,
  rankProfilesBySharedHobbies,
  revokeAreaConsent,
  validateDiscoveryPreferences,
} from './domain.js'
import { CLOSURE_TEMPLATES, TRUST_REFLECTION_PROMPTS } from './communication.js'
import './trust.css'

function useAction(callback, successMessage) {
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function run(payload) {
    setBusy(true)
    setStatus('')
    setError(false)
    try {
      if (typeof callback !== 'function') throw new Error('This action is not connected to a service yet.')
      await callback(payload)
      setStatus(successMessage)
      return true
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The action could not be completed.')
      setError(true)
      return false
    } finally {
      setBusy(false)
    }
  }

  return { run, status, busy, error, setStatus, setError }
}

function ActionStatus({ status, error = false }) {
  if (!status) return null
  return <p className={`trust-status${error ? ' is-error' : ''}`} role="status">{status}</p>
}

function TagInput({ label, value, onChange, hint }) {
  return (
    <label className="trust-field">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Separate items with commas"
      />
      {hint && <small>{hint}</small>}
    </label>
  )
}

function tagString(value) {
  return Array.isArray(value) ? value.join(', ') : ''
}

function parseTags(value) {
  return value.split(',').map((tag) => tag.trim()).filter(Boolean)
}

function PreferenceEditor({ initialPreferences = {}, onSavePreferences }) {
  const [draft, setDraft] = useState(() => ({
    connectionIntent: initialPreferences.connectionIntent || 'open-to-exploring',
    musicGenres: tagString(initialPreferences.musicGenres),
    cultureInterests: tagString(initialPreferences.cultureInterests),
    hobbies: tagString(initialPreferences.hobbies),
  }))
  const action = useAction(onSavePreferences, 'Your discovery preferences were saved.')

  async function save(event) {
    event.preventDefault()
    try {
      const preferences = validateDiscoveryPreferences({
        ...draft,
        musicGenres: parseTags(draft.musicGenres),
        cultureInterests: parseTags(draft.cultureInterests),
        hobbies: parseTags(draft.hobbies),
      })
      await action.run(preferences)
    } catch (error) {
      action.setStatus(error instanceof Error ? error.message : 'Check your preferences and try again.')
      action.setError(true)
    }
  }

  return (
    <form className="trust-form" onSubmit={save}>
      <label className="trust-field">
        <span>What kind of connection are you open to?</span>
        <select
          value={draft.connectionIntent}
          onChange={(event) => setDraft({ ...draft, connectionIntent: event.target.value })}
        >
          {CONNECTION_INTENTS.map((intent) => <option key={intent} value={intent}>{intent.replaceAll('-', ' ')}</option>)}
        </select>
      </label>
      <TagInput label="Music" value={draft.musicGenres} onChange={(musicGenres) => setDraft({ ...draft, musicGenres })} />
      <TagInput label="Culture and community" value={draft.cultureInterests} onChange={(cultureInterests) => setDraft({ ...draft, cultureInterests })} />
      <TagInput label="Hobbies" value={draft.hobbies} onChange={(hobbies) => setDraft({ ...draft, hobbies })} />
      <button type="submit" disabled={action.busy}>Save preferences</button>
      <ActionStatus status={action.status} error={action.error} />
    </form>
  )
}

function AreaConsent({ initialConsent, onSaveAreaConsent, onRevokeAreaConsent }) {
  const [consent, setConsent] = useState(initialConsent || null)
  const [areaLabel, setAreaLabel] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const grantAction = useAction(onSaveAreaConsent, 'Broad-area discovery is enabled for up to 30 days.')
  const revokeAction = useAction(onRevokeAreaConsent, 'Broad-area discovery consent was revoked.')
  const active = isAreaConsentActive(consent)

  async function grant(event) {
    event.preventDefault()
    try {
      if (!confirmed) throw new TypeError('Confirm consent before enabling area-based discovery.')
      const areaConsent = grantAreaConsent(areaLabel)
      if (await grantAction.run({ areaConsent })) setConsent(areaConsent)
    } catch (error) {
      grantAction.setStatus(error instanceof Error ? error.message : 'Area consent could not be saved.')
      grantAction.setError(true)
    }
  }

  async function revoke() {
    const revokedConsent = revokeAreaConsent(consent)
    if (await revokeAction.run({ areaConsent: revokedConsent })) setConsent(revokedConsent)
  }

  return (
    <div className="trust-stack">
      <p>Area is optional and user-entered. Only a broad city or region is used; this module never requests device location. Consent expires after 30 days.</p>
      {active && <p className="trust-consent-state">Sharing broad area: <strong>{consent.areaLabel}</strong></p>}
      <form className="trust-form" onSubmit={grant}>
        <label className="trust-field">
          <span>City or broad region</span>
          <input value={areaLabel} maxLength={64} onChange={(event) => setAreaLabel(event.target.value)} placeholder="For example, North London" />
        </label>
        <label className="trust-check">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>I consent to sharing this broad area for discovery. I can revoke it at any time.</span>
        </label>
        <div className="trust-actions">
          <button type="submit" disabled={grantAction.busy}>Share broad area</button>
          {active && <button type="button" className="trust-button-secondary" onClick={revoke} disabled={revokeAction.busy}>Revoke consent</button>}
        </div>
        <ActionStatus status={grantAction.status || revokeAction.status} error={grantAction.status ? grantAction.error : revokeAction.error} />
      </form>
      <small>Consent duration: {AREA_CONSENT_TTL_MS / (24 * 60 * 60 * 1000)} days maximum.</small>
    </div>
  )
}

function CandidateCard({ profile, ownHobbies, onBlockProfile, onSubmitSafetyReport }) {
  const blockAction = useAction(onBlockProfile, 'Block request submitted.')
  const reportAction = useAction(onSubmitSafetyReport, 'Private report submitted.')
  const [category, setCategory] = useState('safety-concern')
  const [details, setDetails] = useState('')

  async function report(event) {
    event.preventDefault()
    try {
      await reportAction.run(createSafetyReport({
        targetProfileId: profile.profileId,
        category,
        details,
      }))
    } catch (error) {
      reportAction.setStatus(error instanceof Error ? error.message : 'The report could not be submitted.')
      reportAction.setError(true)
    }
  }

  const sharedInterests = [...profile.musicGenres, ...profile.cultureInterests, ...profile.hobbies]
  const sharedHobbies = profile.hobbies.filter((hobby) => (
    ownHobbies.some((ownHobby) => ownHobby.toLocaleLowerCase() === hobby.toLocaleLowerCase())
  ))
  return (
    <article className="trust-candidate">
      <div className="trust-candidate-heading">
        <div>
          <h3>{profile.displayName}</h3>
          <p>{profile.connectionIntent.replaceAll('-', ' ')}</p>
        </div>
        <button type="button" className="trust-button-secondary" onClick={() => blockAction.run({ targetProfileId: profile.profileId })} disabled={blockAction.busy}>Block</button>
      </div>
      {profile.area && <p className="trust-area">{profile.area}</p>}
      {sharedHobbies.length > 0 && <p><strong>Shared hobbies:</strong> {sharedHobbies.join(' · ')}</p>}
      {sharedInterests.length > 0 && <p><strong>Music, culture, and hobbies:</strong> {sharedInterests.join(' · ')}</p>}
      <ActionStatus status={blockAction.status} error={blockAction.error} />
      <details className="trust-report">
        <summary>Report a concern</summary>
        <form className="trust-form" onSubmit={report}>
          <label className="trust-field">
            <span>Concern</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {SAFETY_REPORT_CATEGORIES.map((item) => <option key={item} value={item}>{item.replaceAll('-', ' ')}</option>)}
            </select>
          </label>
          <label className="trust-field">
            <span>Private details (optional)</span>
            <textarea maxLength={2000} value={details} onChange={(event) => setDetails(event.target.value)} rows={3} />
          </label>
          <button type="submit" disabled={reportAction.busy}>Submit private report</button>
          <ActionStatus status={reportAction.status} error={reportAction.error} />
        </form>
      </details>
    </article>
  )
}

function Discovery({ profiles, blockedProfileIds, ownHobbies, onBlockProfile, onSubmitSafetyReport }) {
  const projected = useMemo(
    () => rankProfilesBySharedHobbies(projectDiscoveryProfiles(profiles, blockedProfileIds), ownHobbies),
    [profiles, blockedProfileIds, ownHobbies],
  )
  return (
    <div className="trust-stack">
      <p>Discovery is based on interests and connection intentions, not photos or physical-appearance fields. Blocks are hidden here; the service must also enforce blocks on every request.</p>
      {projected.length === 0
        ? <p>No eligible profiles to show.</p>
        : <div className="trust-candidate-list">
          {projected.map((profile) => (
            <CandidateCard
              key={profile.profileId}
              profile={profile}
              ownHobbies={ownHobbies}
              onBlockProfile={onBlockProfile}
              onSubmitSafetyReport={onSubmitSafetyReport}
            />
          ))}
        </div>}
    </div>
  )
}

function SafetyTools({ onSaveSafetyPlan, onCheckIn }) {
  const [meetupLabel, setMeetupLabel] = useState('')
  const [expectedCheckInAt, setExpectedCheckInAt] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactMethod, setContactMethod] = useState('')
  const [shareContact, setShareContact] = useState(false)
  const planAction = useAction(onSaveSafetyPlan, 'Date safety plan submitted.')
  const checkInAction = useAction(onCheckIn, 'Check-in status submitted.')

  async function savePlan(event) {
    event.preventDefault()
    try {
      if ((contactName || contactMethod) && !shareContact) {
        throw new TypeError('Confirm before including trusted-contact details.')
      }
      const plan = createDateSafetyPlan({
        meetupLabel,
        expectedCheckInAt,
        trustedContact: shareContact ? { name: contactName, contactMethod } : null,
      })
      await planAction.run(plan)
    } catch (error) {
      planAction.setStatus(error instanceof Error ? error.message : 'Check the safety plan details and try again.')
    }
  }

  return (
    <div className="trust-stack">
      <p>Choose a check-in time and optionally add a trusted contact. Contact details stay out of discovery and are sent only to the configured safety-plan service.</p>
      <form className="trust-form" onSubmit={savePlan}>
        <label className="trust-field"><span>Private meet-up reminder</span><input value={meetupLabel} maxLength={100} onChange={(event) => setMeetupLabel(event.target.value)} placeholder="A reminder for you" /></label>
        <label className="trust-field"><span>Expected check-in</span><input type="datetime-local" value={expectedCheckInAt} onChange={(event) => setExpectedCheckInAt(event.target.value)} /></label>
        <label className="trust-field"><span>Trusted contact name (optional)</span><input value={contactName} maxLength={80} onChange={(event) => setContactName(event.target.value)} /></label>
        <label className="trust-field"><span>Trusted contact method (optional)</span><input value={contactMethod} maxLength={160} onChange={(event) => setContactMethod(event.target.value)} /></label>
        <label className="trust-check"><input type="checkbox" checked={shareContact} onChange={(event) => setShareContact(event.target.checked)} /><span>I consent to sending these details to the configured safety-plan service.</span></label>
        <button type="submit" disabled={planAction.busy}>Save private safety plan</button>
        <ActionStatus status={planAction.status} error={planAction.error} />
      </form>
      <div className="trust-checkin">
        <h3>Check in</h3>
        <button type="button" onClick={() => checkInAction.run(createSafetyCheckIn('safe'))} disabled={checkInAction.busy}>I’m safe</button>
        <button type="button" className="trust-button-secondary" onClick={() => checkInAction.run(createSafetyCheckIn('need-support'))} disabled={checkInAction.busy}>I need support</button>
        <ActionStatus status={checkInAction.status} error={checkInAction.error} />
      </div>
      <p className="trust-caveat">This UI alone does not send alerts, contact a trusted person, track location, or contact emergency services. Do not rely on a check-in unless the service confirms delivery.</p>
    </div>
  )
}

function Journal({ onSaveJournalEntry, onExportJournal, onDeleteJournalEntries }) {
  const [content, setContent] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const action = useAction(onSaveJournalEntry, 'Private journal entry saved.')
  const exportAction = useAction(onExportJournal, 'Export request completed by the configured service.')
  const deleteAction = useAction(onDeleteJournalEntries, 'Journal entries were deleted by the configured service.')

  function handlePrompt(prompt) {
    setContent((current) => current ? `${current}\n\n${prompt}\n` : `${prompt}\n`)
  }

  async function save(event) {
    event.preventDefault()
    try {
      const entry = createPrivateJournalEntry({ content })
      if (await action.run(entry)) setContent('')
    } catch (error) {
      action.setStatus(error instanceof Error ? error.message : 'The journal entry could not be saved.')
      action.setError(true)
    }
  }

  return (
    <div className="trust-stack">
      <p>Write only what you choose to keep. Journal text is never included in discovery. Save and access controls must be enforced by the authenticated service.</p>
      <form className="trust-form" onSubmit={save}>
        <div className="trust-prompt-list" aria-label="Optional reflection prompts">
          <span>Optional reflection prompts</span>
          {TRUST_REFLECTION_PROMPTS.map((prompt) => (
            <button key={prompt} type="button" className="trust-button-secondary" onClick={() => handlePrompt(prompt)}>{prompt}</button>
          ))}
        </div>
        <label className="trust-field"><span>Private reflection</span><textarea value={content} maxLength={12000} rows={6} onChange={(event) => setContent(event.target.value)} placeholder="This space is for you." /></label>
        <button type="submit" disabled={action.busy}>Save privately</button>
        <ActionStatus status={action.status} error={action.error} />
      </form>
      <div className="trust-form">
        <button type="button" className="trust-button-secondary" onClick={() => exportAction.run()} disabled={exportAction.busy}>Export my journal</button>
        <ActionStatus status={exportAction.status} error={exportAction.error} />
        <label className="trust-check">
          <input type="checkbox" checked={confirmDelete} onChange={(event) => setConfirmDelete(event.target.checked)} />
          <span>I understand this will permanently delete my saved journal entries.</span>
        </label>
        <button type="button" className="trust-button-secondary" onClick={() => deleteAction.run()} disabled={!confirmDelete || deleteAction.busy}>Delete all journal entries</button>
        <ActionStatus status={deleteAction.status} error={deleteAction.error} />
      </div>
    </div>
  )
}

function Communication() {
  const [selectedTemplate, setSelectedTemplate] = useState(CLOSURE_TEMPLATES[0].id)
  const selected = CLOSURE_TEMPLATES.find((template) => template.id === selectedTemplate)
  const [message, setMessage] = useState(selected.message)

  function chooseTemplate(event) {
    setSelectedTemplate(event.target.value)
    setMessage(CLOSURE_TEMPLATES.find((template) => template.id === event.target.value).message)
  }

  return (
    <div className="trust-stack">
      <p>Use or adapt a clear, kind boundary or closure note. Nothing is sent automatically; copy the text into a conversation only if you choose.</p>
      <label className="trust-field">
        <span>Message prompt</span>
        <select value={selectedTemplate} onChange={chooseTemplate}>
          {CLOSURE_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
        </select>
      </label>
      <label className="trust-field"><span>Edit your message</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} maxLength={1000} /></label>
      <p className="trust-caveat">You can leave a conversation or block someone without sending an explanation.</p>
    </div>
  )
}

export default function TrustPrivacyHub({
  discoveryProfiles = [],
  blockedProfileIds = [],
  initialPreferences,
  initialAreaConsent,
  onSavePreferences,
  onSaveAreaConsent,
  onRevokeAreaConsent,
  onBlockProfile,
  onSubmitSafetyReport,
  onSaveSafetyPlan,
  onCheckIn,
  onSaveJournalEntry,
  onExportJournal,
  onDeleteJournalEntries,
}) {
  return (
    <main className="trust-hub">
      <header className="trust-header">
        <p className="trust-eyebrow">SoulSite · trust and privacy</p>
        <h1>Connection, at your pace</h1>
        <p>Share only what feels right. Private actions are sent to your authenticated service through callbacks; this module never takes a user ID for authorization.</p>
      </header>
      <section className="trust-section" aria-labelledby="trust-discovery-title">
        <h2 id="trust-discovery-title">Discovery without appearance</h2>
        <PreferenceEditor initialPreferences={initialPreferences} onSavePreferences={onSavePreferences} />
        <Discovery
          profiles={discoveryProfiles}
          blockedProfileIds={blockedProfileIds}
          ownHobbies={initialPreferences?.hobbies || []}
          onBlockProfile={onBlockProfile}
          onSubmitSafetyReport={onSubmitSafetyReport}
        />
      </section>
      <section className="trust-section" aria-labelledby="trust-area-title">
        <h2 id="trust-area-title">Broad-area discovery</h2>
        <AreaConsent initialConsent={initialAreaConsent} onSaveAreaConsent={onSaveAreaConsent} onRevokeAreaConsent={onRevokeAreaConsent} />
      </section>
      <section className="trust-section" aria-labelledby="trust-safety-title">
        <h2 id="trust-safety-title">Date safety and check-ins</h2>
        <SafetyTools onSaveSafetyPlan={onSaveSafetyPlan} onCheckIn={onCheckIn} />
      </section>
      <section className="trust-section" aria-labelledby="trust-journal-title">
        <h2 id="trust-journal-title">Private journal</h2>
        <Journal
          onSaveJournalEntry={onSaveJournalEntry}
          onExportJournal={onExportJournal}
          onDeleteJournalEntries={onDeleteJournalEntries}
        />
      </section>
      <section className="trust-section" aria-labelledby="trust-communication-title">
        <h2 id="trust-communication-title">Respectful communication</h2>
        <Communication />
      </section>
    </main>
  )
}
