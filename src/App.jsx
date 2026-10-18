import { useEffect, useMemo, useState } from 'react'
import './App.css'

const tierConfiguration = {
  Free: 5,
  Standard: 20,
  Pro: 50,
}

const profileStorageKey = 'soulsync.profileId'

function getYesCountStorageKey(userId) {
  const today = new Date().toISOString().slice(0, 10)
  return `soulsync.yesCount.${userId}.${today}`
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || `Request failed (${response.status}).`)
    error.status = response.status
    throw error
  }

  return payload
}

function getCompatibilityScore(profile) {
  if (typeof profile?.score === 'number') return profile.score
  const { pace = 0, values = 0, lifestyle = 0, money = 0 } = profile?.compatibility || {}
  return Math.round((pace + values + lifestyle + money) / 4)
}

function SoulOrb({ accent }) {
  return (
    <div className="orb-stage" style={{ '--orb-accent': accent }}>
      <div className="orb-glow" />
      <div className="orb-shell">
        <div className="orb-core" />
        <div className="orb-ripple orb-ripple-one" />
        <div className="orb-ripple orb-ripple-two" />
      </div>
    </div>
  )
}

function App() {
  const [tier, setTier] = useState('Free')
  const [tiers, setTiers] = useState(tierConfiguration)
  const [dailyLimit, setDailyLimit] = useState(tierConfiguration.Free)
  const [profiles, setProfiles] = useState([])
  const [profileIndex, setProfileIndex] = useState(0)
  const [profileId, setProfileId] = useState(null)
  const [yesCount, setYesCount] = useState(0)
  const [decision, setDecision] = useState('No decision yet')
  const [matchState, setMatchState] = useState(null)
  const [isReady, setIsReady] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let isActive = true

    async function initialize() {
      try {
        const id = localStorage.getItem(profileStorageKey) || crypto.randomUUID()
        localStorage.setItem(profileStorageKey, id)
        const config = await request('/api/config')
        if (!isActive) return

        const nextTiers = config.tiers || tierConfiguration
        setTiers(nextTiers)
        setDailyLimit(nextTiers.Free ?? tierConfiguration.Free)
        const profileResponse = await request('/api/profiles')
        if (!isActive) return

        const nextProfiles = profileResponse.profiles || []
        setProfiles(nextProfiles)
        setProfileId(id)
        setYesCount(Number(localStorage.getItem(getYesCountStorageKey(id))) || 0)
        setIsReady(true)
      } catch (initializationError) {
        if (!isActive) return
        setError(initializationError.message)
        setIsReady(true)
      }
    }

    initialize()
    return () => {
      isActive = false
    }
  }, [])

  const currentProfile = profiles[profileIndex]
  const compatibilityScore = useMemo(
    () => getCompatibilityScore(currentProfile),
    [currentProfile],
  )
  const remainingSelections = Math.max(dailyLimit - yesCount, 0)

  const handleTierChange = (nextTier) => {
    setTier(nextTier)
    setDailyLimit(tiers[nextTier] ?? tierConfiguration.Free)
    setDecision('Daily limit updated')
  }

  const handleDecisionClick = async (nextDecision) => {
    if (!currentProfile || !profileId || isSubmitting) return
    if (nextDecision && yesCount >= dailyLimit) {
      setDecision('Daily YES limit reached for this tier.')
      return
    }

    setIsSubmitting(true)
    setError('')
    try {
      const result = await request('/api/decision', {
        method: 'POST',
        body: JSON.stringify({
          userId: profileId,
          profileId: currentProfile.id,
          action: nextDecision ? 'yes' : 'no',
          tier,
        }),
      })

      if (typeof result.remaining === 'number' && typeof result.limit === 'number') {
        const count = Math.max(result.limit - result.remaining, 0)
        setYesCount(count)
        localStorage.setItem(getYesCountStorageKey(profileId), String(count))
      }

      setDecision(
        result.match
          ? 'Compatibility window open. Date planning is available.'
          : result.message || 'Decision recorded.',
      )
      setMatchState(result.match || null)
      setProfileIndex((index) => (index + 1) % profiles.length)
    } catch (voteError) {
      if (voteError.status === 429) {
        setYesCount(dailyLimit)
        localStorage.setItem(getYesCountStorageKey(profileId), String(dailyLimit))
      }
      setError(voteError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Anonymous discovery</p>
          <h1>SoulSite</h1>
        </div>
        <div className="tier-picker">
          <label htmlFor="tier">Access tier</label>
          <select
            id="tier"
            value={tier}
            onChange={(event) => handleTierChange(event.target.value)}
          >
            {Object.keys(tiers).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="experience-grid">
        <section className="profile-panel">
          <div className="status-row">
            <span className="pill">{remainingSelections} YES left today</span>
            <span className="pill muted">No messaging • No face photos</span>
          </div>

          {currentProfile ? (
            <>
              <div className="orb-card">
                <SoulOrb accent={currentProfile.accent || '#8c8cff'} />
                <div className="name-block">
                  <h2>{currentProfile.name || 'A new connection'}</h2>
                  <p>
                    {currentProfile.age ? `${currentProfile.age} • ` : ''}
                    {currentProfile.distance || 'Nearby'}
                  </p>
                </div>
              </div>

              <div className="profile-copy">
                <p className="intention">{currentProfile.intention}</p>
                <p className="energy">{currentProfile.energy}</p>
                <p>{currentProfile.bio}</p>
              </div>

              <div className="tag-list">
                {(currentProfile.tags || []).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state" role="status">
              {error ? `Backend unavailable: ${error}` : isReady ? 'No profiles are available yet.' : 'Connecting to the local backend…'}
            </div>
          )}

          <div className="action-row">
            <button
              type="button"
              className="ghost-button"
              disabled={!currentProfile || isSubmitting}
              onClick={() => handleDecisionClick(false)}
            >
              NO
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={!currentProfile || isSubmitting}
              onClick={() => handleDecisionClick(true)}
            >
              {isSubmitting ? 'SENDING…' : 'YES'}
            </button>
          </div>
        </section>

        <aside className="insight-panel">
          <div className="panel-block">
            <p className="eyebrow">Compatibility signal</p>
            <div className="score-row">
              <strong>{compatibilityScore}%</strong>
              <span>mutual alignment</span>
            </div>
            <div className="meter">
              <span style={{ width: `${compatibilityScore}%` }} />
            </div>
          </div>

          <div className="panel-block">
            <p className="eyebrow">Why this profile resonates</p>
            <ul className="value-list">
              {(currentProfile?.values || []).map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
          </div>

          <div className="panel-block status-panel">
            <p className="eyebrow">Decision state</p>
            <p aria-live="polite">{error || decision}</p>
            {matchState ? (
              <div className="sync-box">
                <span>{matchState.label}</span>
                <strong>{matchState.venue}</strong>
                <small>{matchState.time}</small>
              </div>
            ) : null}
          </div>
        </aside>
      </main>
    </div>
  )
}

export default App
