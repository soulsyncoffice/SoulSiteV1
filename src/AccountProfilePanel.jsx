import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { profileFields, profileVisibilityOptions } from '../shared-types/profileFields.js'
import { supabase, supabaseConfigured } from './supabaseClient.js'
import './AccountProfilePanel.css'

const initialProfile = Object.fromEntries(profileFields.map(({ key }) => [key, '']))

function getNextPrompt(profile) {
  const importantKeys = ['relationshipIntent', 'communicationStyle', 'values', 'idealSunday']
  const nextField = importantKeys
    .map((key) => profileFields.find((field) => field.key === key))
    .find((field) => !profile[field.key]?.trim())

  return nextField
    ? `SoulMind: ${nextField.prompt}`
    : 'SoulMind: Your core introduction is taking shape. Add only details that feel true and comfortable to share.'
}

async function profileRequest(accessToken, method, body, route = '/api/me/profile') {
  const response = await fetch(route, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const result = response.status === 204 ? {} : await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || `Profile request failed (${response.status}).`)
  return result
}

function AccountProfilePanel({ onClose }) {
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signupAge, setSignupAge] = useState('')
  const [recoveryPassword, setRecoveryPassword] = useState('')
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('')
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const [adultConfirmed, setAdultConfirmed] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [profile, setProfile] = useState(initialProfile)
  const [visibility, setVisibility] = useState({})
  const [overview, setOverview] = useState('')
  const [overviewQuestion, setOverviewQuestion] = useState('')
  const [overviewConsent, setOverviewConsent] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoadedProfile, setHasLoadedProfile] = useState(false)

  useEffect(() => {
    if (!supabase) return undefined
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message)
      setSession(data?.session ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setError('')
      setMessage('')
      if (!nextSession) {
        setProfile(initialProfile)
        setVisibility({})
        setOverview('')
        setOverviewQuestion('')
        setHasLoadedProfile(false)
      }
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let isActive = true
    async function loadProfile() {
      if (!session?.access_token) {
        setHasLoadedProfile(false)
        return
      }

      setIsLoading(true)
      setError('')
      try {
        const result = await profileRequest(session.access_token, 'GET')
        if (!isActive) return
        setProfile({
          ...initialProfile,
          age: String(accountAge ?? ''),
          ...result.profile,
        })
        setVisibility(result.visibility || {})
        setOverview(result.overview || '')
        setHasLoadedProfile(true)
      } catch (loadError) {
        if (isActive) setError(loadError.message)
      } finally {
        if (isActive) setIsLoading(false)
      }
    }
    loadProfile()
    return () => { isActive = false }
  }, [accountAge, session?.access_token])

  const completedCount = useMemo(
    () => profileFields.filter(({ key }) => profile[key]?.trim()).length,
    [profile],
  )
  const accountAge = session?.user?.user_metadata?.age

  const updateProfileField = (key, value) => {
    setProfile((current) => ({ ...current, [key]: value }))
    if (overview) {
      setOverview('')
      setMessage('Profile details changed. Save your profile and generate a fresh overview to keep it accurate.')
    }
    setOverviewQuestion('')
  }

  const handleAuthentication = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setIsLoading(true)
    try {
      if (!supabase) throw new Error('Account services are not configured.')
      if (isSignUp && !adultConfirmed) throw new Error('Confirm that you are at least 18 to create a SoulSite account.')
      if (isSignUp && (!/^\d{1,3}$/.test(signupAge) || Number(signupAge) < 18 || Number(signupAge) > 120)) {
        throw new Error('SoulSite is for adults 18 and over. Enter your age to continue.')
      }
      const operation = isSignUp
        ? supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { data: { adult_confirmed: true, age: Number(signupAge) } },
          })
        : supabase.auth.signInWithPassword({ email: email.trim(), password })
      const { data, error: authError } = await operation
      if (authError) throw authError
      if (isSignUp && !data.session) {
        setMessage('Check your email to confirm your account, then return here to sign in.')
      } else {
        setSession(data.session)
        setMessage(isSignUp ? 'Your account is ready. Complete your private profile when you are comfortable.' : 'You are signed in.')
      }
    } catch (authError) {
      setError(authError.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!session?.access_token) return
    setError('')
    setMessage('')
    setIsLoading(true)
    try {
      const result = await profileRequest(session.access_token, 'PUT', { profile, visibility, overview })
      setProfile({ ...initialProfile, ...result.profile })
      setVisibility(result.visibility || {})
      setOverview(result.overview || '')
      setMessage('Your profile is saved privately to your account.')
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!session?.access_token || !window.confirm('Delete your saved profile? This cannot be undone.')) return
    setError('')
    setMessage('')
    setIsLoading(true)
    try {
      await profileRequest(session.access_token, 'DELETE')
      setProfile(initialProfile)
      setVisibility({})
      setOverview('')
      setMessage('Your saved profile has been deleted.')
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportProfile = () => {
    const exportFile = {
      application: 'SoulSite',
      exportedAt: new Date().toISOString(),
      accountEmail: session.user.email,
      profile,
      visibilityPreferences: visibility,
      overview,
    }
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(exportFile, null, 2)], {
      type: 'application/json',
    }))
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = 'soulsite-private-profile.json'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }

  const handleDeleteAccount = async () => {
    if (!session?.access_token) return
    if (!window.confirm('Permanently delete your SoulSite account and private profile? This cannot be undone.')) return
    setError('')
    setMessage('')
    setIsLoading(true)
    try {
      const { data, error: reauthenticationError } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: deleteAccountPassword,
      })
      if (reauthenticationError) throw new Error('Confirm your current password to delete your account.')
      await profileRequest(data.session.access_token, 'DELETE', undefined, '/api/me/account')
      await supabase.auth.signOut({ scope: 'local' })
      setSession(null)
      setProfile(initialProfile)
      setVisibility({})
      setOverview('')
      setDeleteAccountPassword('')
      setMessage('Your account and private profile have been deleted.')
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGenerateOverview = async () => {
    if (!session?.access_token || !overviewConsent) return
    setError('')
    setMessage('')
    setOverviewQuestion('')
    setIsLoading(true)
    try {
      const result = await profileRequest(session.access_token, 'POST', {
        consentToExternalProcessing: true,
      })
      if (result.status === 'needs_more_information') {
        setOverviewQuestion(result.question)
        setMessage('SoulMind needs a little more detail. Update and save the relevant profile field, then try again.')
      } else {
        setOverview(result.overview)
        setMessage('Your personalized, 500-word draft is saved privately to your account.')
      }
    } catch (generationError) {
      setError(generationError.message)
    } finally {
      setIsLoading(false)
      setOverviewConsent(false)
    }
  }

  const handleSignOut = async () => {
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(signOutError.message)
    else {
      setSession(null)
      setProfile(initialProfile)
      setVisibility({})
      setOverview('')
      setMessage('You are signed out.')
    }
  }

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      setError('Enter your account email first.')
      return
    }
    setError('')
    setMessage('')
    setIsLoading(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      })
      if (resetError) throw resetError
      setMessage('If an account exists for that address, a password reset email has been sent.')
    } catch (resetError) {
      setError(resetError.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasswordUpdate = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setIsLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: recoveryPassword })
      if (updateError) throw updateError
      setIsPasswordRecovery(false)
      setRecoveryPassword('')
      setMessage('Your password has been updated.')
    } catch (updateError) {
      setError(updateError.message)
    } finally {
      setIsLoading(false)
    }
  }

  return createPortal(
    <div className="account-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section aria-labelledby="account-title" aria-modal="true" className="account-panel" role="dialog">
        <button aria-label="Close profile panel" className="account-close" onClick={onClose} type="button">×</button>
        <p className="account-kicker">YOUR PRIVATE SPACE</p>
        <h2 id="account-title">{session ? 'Your SoulSite profile' : 'Join the field'}</h2>
        <p className="account-intro">
          Your full profile is private to your account. Visibility choices are saved as preferences;
          discovery publication is not enabled until the matching access controls are released.
        </p>

        {!supabaseConfigured ? (
          <div className="account-notice" role="status">
            Account setup is not configured on this deployment. Set the Supabase project URL and
            publishable key in the browser environment and the URL and anon key on the server.
          </div>
        ) : null}

        {!session ? (
          <form className="account-form" onSubmit={handleAuthentication}>
            <label>
              Email
              <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
            </label>
            <label>
              Password
              <input
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                minLength={12}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
              <small>Use at least 12 characters. Supabase enforces the project password policy.</small>
            </label>
            {isSignUp ? (
              <>
                <label>
                  Age
                  <input
                    inputMode="numeric"
                    max="120"
                    min="18"
                    onChange={(event) => setSignupAge(event.target.value)}
                    required
                    type="number"
                    value={signupAge}
                  />
                  <small>This self-reported age is used to enforce the 18+ account requirement.</small>
                </label>
                <label className="account-checkbox">
                  <input checked={adultConfirmed} onChange={(event) => setAdultConfirmed(event.target.checked)} type="checkbox" />
                  <span>I confirm that I am 18 or older. This is a self-declaration, not identity verification.</span>
                </label>
              </>
            ) : null}
            <button className="account-submit" disabled={isLoading || !supabaseConfigured} type="submit">
              {isLoading ? 'PLEASE WAIT…' : isSignUp ? 'CREATE ACCOUNT' : 'SIGN IN'}
            </button>
            <button className="account-text-button" onClick={() => setIsSignUp((value) => !value)} type="button">
              {isSignUp ? 'Already have an account? Sign in' : 'New to SoulSite? Create an account'}
            </button>
            {!isSignUp ? (
              <button className="account-text-button" disabled={isLoading || !supabaseConfigured} onClick={handlePasswordReset} type="button">
                Forgot your password?
              </button>
            ) : null}
          </form>
        ) : (
          <>
            <div className="account-user-line">
              <span>{session.user.email}</span>
              <button className="account-text-button" onClick={handleSignOut} type="button">Sign out</button>
            </div>
            {isPasswordRecovery ? (
              <form className="account-form" onSubmit={handlePasswordUpdate}>
                <label>
                  New password
                  <input
                    autoComplete="new-password"
                    minLength={12}
                    onChange={(event) => setRecoveryPassword(event.target.value)}
                    required
                    type="password"
                    value={recoveryPassword}
                  />
                </label>
                <button className="account-submit" disabled={isLoading} type="submit">UPDATE PASSWORD</button>
              </form>
            ) : null}
            {!isPasswordRecovery ? <div className="soulmind-guide">
              <strong>SOULMIND · PROFILE GUIDE</strong>
              <span>{completedCount} of {profileFields.length} areas have your own details.</span>
              <p>{getNextPrompt(profile)}</p>
              <small>Guidance is currently rule-based. SoulMind will not invent information or send profile details to an AI provider. Age and safety answers are self-reported, not identity-verified.</small>
            </div> : null}
            {!isPasswordRecovery ? <form className="account-form profile-form" onSubmit={handleSave}>
              {profileFields.map((field) => (
                <div className="profile-field" key={field.key}>
                  <label htmlFor={`profile-${field.key}`}>{field.label}</label>
                  {field.key === 'age' ? (
                    <input
                      id={`profile-${field.key}`}
                      inputMode="numeric"
                      maxLength={field.maxLength}
                      onChange={(event) => updateProfileField(field.key, event.target.value)}
                      value={profile[field.key]}
                    />
                  ) : (
                    <textarea
                      id={`profile-${field.key}`}
                      maxLength={field.maxLength}
                      onChange={(event) => updateProfileField(field.key, event.target.value)}
                      placeholder={field.prompt}
                      rows={field.maxLength > 1000 ? 4 : 3}
                      value={profile[field.key]}
                    />
                  )}
                  <select
                    aria-label={`${field.label} visibility preference`}
                    onChange={(event) => setVisibility((value) => ({ ...value, [field.key]: event.target.value }))}
                    value={visibility[field.key] || 'private'}
                  >
                    {profileVisibilityOptions.map((option) => (
                      <option key={option} value={option}>
                        {option === 'mutual_consent' ? 'Only after mutual consent' : option === 'matches' ? 'Matches' : 'Private'}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div className="account-actions">
                <button className="account-submit" disabled={isLoading || !hasLoadedProfile} type="submit">
                  {isLoading ? 'SAVING…' : 'SAVE PRIVATE PROFILE'}
                </button>
                <button className="account-text-button" disabled={!hasLoadedProfile} onClick={handleExportProfile} type="button">
                  Export a copy of my private profile
                </button>
                <button className="account-delete" disabled={isLoading || !hasLoadedProfile} onClick={handleDelete} type="button">
                  Delete saved profile
                </button>
                <div className="account-delete-section">
                  <label>
                    Confirm password to permanently delete account
                    <input
                      autoComplete="current-password"
                      onChange={(event) => setDeleteAccountPassword(event.target.value)}
                      type="password"
                      value={deleteAccountPassword}
                    />
                  </label>
                  <button
                    className="account-delete"
                    disabled={isLoading || !deleteAccountPassword}
                    onClick={handleDeleteAccount}
                    type="button"
                  >
                    Delete account and private profile
                  </button>
                </div>
              </div>
            </form> : null}
            {!isPasswordRecovery ? (
              <section aria-labelledby="overview-heading" className="soulmind-overview">
                <h3 id="overview-heading">SoulMind · your overview</h3>
                <p>
                  SoulMind sends your saved profile answers to OpenAI for this request. OpenAI processes
                  them under its own privacy and retention terms; SoulSite does not control that processing.
                  The result is a private draft for you to review, not an automatically published profile.
                </p>
                <label className="account-checkbox">
                  <input
                    checked={overviewConsent}
                    onChange={(event) => setOverviewConsent(event.target.checked)}
                    type="checkbox"
                  />
                  <span>I explicitly consent to send my saved profile answers to OpenAI to generate this story.</span>
                </label>
                <button
                  className="account-submit"
                  disabled={isLoading || !hasLoadedProfile || !overviewConsent}
                  onClick={handleGenerateOverview}
                  type="button"
                >
                  {isLoading ? 'SOULMIND IS WRITING…' : 'GENERATE MY 500-WORD OVERVIEW'}
                </button>
                {overviewQuestion ? (
                  <div aria-live="polite" className="soulmind-question">
                    <strong>SoulMind needs your input</strong>
                    <p>{overviewQuestion}</p>
                    <span>Add your answer to the relevant profile field, save, then request a new draft.</span>
                  </div>
                ) : null}
                {overview ? (
                  <article aria-label="Your private SoulSite overview" className="soulmind-story">
                    <h4>SoulSite's Overview</h4>
                    <p>{overview}</p>
                    <small>AI-generated from your saved answers. Review carefully; the draft may need corrections. It is private and is not shown to matches.</small>
                  </article>
                ) : null}
              </section>
            ) : null}
          </>
        )}

        {message ? <p aria-live="polite" className="account-message">{message}</p> : null}
        {error ? <p aria-live="assertive" className="account-error">{error}</p> : null}
        <p className="account-footnote">
          Do not enter passwords, phone numbers, email addresses, social handles, exact addresses, or links in profile answers.
        </p>
      </section>
    </div>,
    document.body,
  )
}

export default AccountProfilePanel
