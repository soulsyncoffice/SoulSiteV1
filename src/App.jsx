import { useMemo, useState } from 'react'
import './App.css'

const profiles = [
  {
    id: 'nova',
    name: 'Nova',
    age: 29,
    distance: '8 km away',
    intention: 'Serious relationship',
    energy: 'Thoughtful evenings, slow-burn chemistry',
    tags: ['Deep conversations', 'Nature walks', 'Live music'],
    values: ['Honesty over hype', 'Warm routines', 'Mutual growth'],
    bio:
      'I like people whose curiosity feels as alive as their kindness. My ideal first meeting is a quiet venue with good coffee, a long walk, and a space to hear each other without rushing.',
    compatibility: {
      pace: 92,
      values: 88,
      lifestyle: 85,
      money: 75,
    },
    accent: '#8c8cff',
  },
  {
    id: 'sol',
    name: 'Sol',
    age: 31,
    distance: '12 km away',
    intention: 'Casual dating with potential',
    energy: 'Curious, outdoorsy, low-pressure',
    tags: ['Street food', 'Bookshops', 'Weekend hikes'],
    values: ['Playful sincerity', 'Shared adventure', 'Respectful boundaries'],
    bio:
      'I build my life around creative work, honest laughter, and the kind of connection that feels unforced. I prefer to meet somewhere public, warm, and easy to walk away from if the energy isn’t right.',
    compatibility: {
      pace: 79,
      values: 90,
      lifestyle: 88,
      money: 82,
    },
    accent: '#74e9d8',
  },
  {
    id: 'tide',
    name: 'Tide',
    age: 27,
    distance: '6 km away',
    intention: 'Friendship with romantic potential',
    energy: 'Slow, steady, emotionally mature',
    tags: ['Gallery visits', 'Cinema', 'Pottery'],
    values: ['Clear communication', 'Kindness first', 'Shared rituals'],
    bio:
      'I enjoy people who are thoughtful, grounded, and interested in the deeper texture of a life. I am happiest when conversation flows naturally and plans feel like an invitation, not a performance.',
    compatibility: {
      pace: 84,
      values: 93,
      lifestyle: 82,
      money: 73,
    },
    accent: '#f4a2ff',
  },
]

const tierConfiguration = {
  Free: 5,
  Standard: 20,
  Pro: 50,
}

function getCompatibilityScore(profile) {
  const { pace, values, lifestyle, money } = profile.compatibility
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
  const [dailyLimit, setDailyLimit] = useState(tierConfiguration.Free)
  const [profileIndex, setProfileIndex] = useState(0)
  const [yesCount, setYesCount] = useState(0)
  const [decision, setDecision] = useState('No decision yet')
  const [matchState, setMatchState] = useState(null)

  const currentProfile = profiles[profileIndex]
  const compatibilityScore = useMemo(
    () => getCompatibilityScore(currentProfile),
    [currentProfile],
  )
  const remainingSelections = Math.max(dailyLimit - yesCount, 0)

  const handleTierChange = (nextTier) => {
    setTier(nextTier)
    setDailyLimit(tierConfiguration[nextTier])
    setDecision('Daily limit updated')
  }

  const handleDecisionClick = (nextDecision) => {
    if (nextDecision === 'yes' && yesCount >= dailyLimit) {
      setDecision('Daily YES limit reached for this tier.')
      return
    }

    if (nextDecision === 'yes') {
      const updatedCount = yesCount + 1
      setYesCount(updatedCount)
      const isStrongMatch = compatibilityScore >= 85
      setDecision(
        isStrongMatch ? 'Mutual sync detected. Date planning is available.' : 'Interested. Compatibility is being reviewed.',
      )
      setMatchState(
        isStrongMatch
          ? {
              label: 'Compatibility window open',
              venue: 'Moonlit rooftop cinema',
              time: 'Saturday • 7:30 PM',
            }
          : null,
      )
    } else {
      setDecision('Profile dismissed without revealing identity.')
      setMatchState(null)
    }

    setProfileIndex((previousIndex) => (previousIndex + 1) % profiles.length)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Anonymous discovery</p>
          <h1>Soul Sync</h1>
        </div>
        <div className="tier-picker">
          <label htmlFor="tier">Access tier</label>
          <select
            id="tier"
            value={tier}
            onChange={(event) => handleTierChange(event.target.value)}
          >
            {Object.keys(tierConfiguration).map((option) => (
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

          <div className="orb-card">
            <SoulOrb accent={currentProfile.accent} />
            <div className="name-block">
              <h2>{currentProfile.name}</h2>
              <p>
                {currentProfile.age} • {currentProfile.distance}
              </p>
            </div>
          </div>

          <div className="profile-copy">
            <p className="intention">{currentProfile.intention}</p>
            <p className="energy">{currentProfile.energy}</p>
            <p>{currentProfile.bio}</p>
          </div>

          <div className="tag-list">
            {currentProfile.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>

          <div className="action-row">
            <button type="button" className="ghost-button" onClick={() => handleDecisionClick('no')}>
              NO
            </button>
            <button type="button" className="primary-button" onClick={() => handleDecisionClick('yes')}>
              YES
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
              {currentProfile.values.map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
          </div>

          <div className="panel-block status-panel">
            <p className="eyebrow">Decision state</p>
            <p>{decision}</p>
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
