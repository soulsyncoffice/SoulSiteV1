import { useEffect, useState } from 'react'
import { profileFields, profileVisibilityOptions } from '../shared-types/profileFields.js'
import ProfileBuilder from './profile/ProfileBuilder.jsx'
import { assessmentDimensions } from './profile/assessmentSchema.js'
import './siteChrome.css'

export const TOKEN_KEY = 'soulsite.localToken'

const tabs = [
  { id: 'home', label: 'Home' },
  { id: 'play', label: 'Play' },
  { id: 'profile', label: 'Profile', subs: [['editor', 'Questionnaire'], ['builder', 'Soul builder']] },
  { id: 'map', label: 'Map' },
  { id: 'connections', label: 'Connections', subs: [['icebreakers', 'Icebreakers'], ['dates', 'Dates'], ['activities', 'Activities'], ['voice', 'Voice']] },
  { id: 'trust', label: 'Trust' },
  { id: 'progression', label: 'Field', subs: [['prompts', 'Prompts'], ['reflection', 'Reflection'], ['consent', 'Consent'], ['alignment', 'Alignment'], ['safety', 'Safety']] },
  { id: 'settings', label: 'Settings' },
  { id: 'signin', label: 'Sign in' },
]

function hashFor(route) {
  if (route.tab === 'arcade') return '#/arcade'
  return `#/${route.tab}${route.sub ? `/${route.sub}` : ''}`
}

function parseHash() {
  if (window.location.hash.startsWith('#/arcade')) return { tab: 'arcade', sub: '' }
  const [tab, sub = ''] = window.location.hash.replace(/^#\/?/, '').split('/')
  const known = tabs.find((item) => item.id === tab)
  return { tab: known ? known.id : 'home', sub }
}

export function useSiteRoute() {
  const [route, setRoute] = useState(parseHash)
  const [intro, setIntro] = useState(true)
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '')

  useEffect(() => {
    const timer = window.setTimeout(() => setIntro(false), 3000)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    function onPop(event) {
      if (window.location.hash.startsWith('#/arcade') || event.state?.tab === 'arcade') {
        const next = { tab: 'arcade', sub: '' }
        window.history.pushState({ soulsite: true, ...next }, '', hashFor(next))
        setRoute(next)
        return
      }
      if (!event.state?.soulsite) {
        const next = { tab: 'home', sub: '' }
        window.history.pushState({ soulsite: true, ...next }, '', hashFor(next))
        setRoute(next)
        return
      }
      setRoute({ tab: event.state.tab || 'home', sub: event.state.sub || '' })
    }
    const current = parseHash()
    window.history.replaceState({ soulsite: true, ...current }, '', hashFor(current))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (!token) return undefined
    let active = true
    fetch('/api/session', { headers: { Authorization: `Bearer local.${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error('Session expired')
        return response.json()
      })
      .then((payload) => {
        if (active) setUser(payload.user)
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY)
        if (active) {
          setToken('')
          setUser(null)
        }
      })
    return () => {
      active = false
    }
  }, [token])

  function navigate(tab, sub = '') {
    const next = { tab, sub }
    window.history.pushState({ soulsite: true, ...next }, '', hashFor(next))
    setRoute(next)
    setIntro(false)
  }

  function signIn(nextToken, nextUser) {
    localStorage.setItem(TOKEN_KEY, nextToken)
    setToken(nextToken)
    setUser(nextUser)
    navigate('home')
  }

  function signOut() {
    const current = token
    localStorage.removeItem(TOKEN_KEY)
    setToken('')
    setUser(null)
    if (current) {
      fetch('/api/session', { method: 'DELETE', headers: { Authorization: `Bearer local.${current}` } }).catch(() => {})
    }
    navigate('signin')
  }

  return { route, intro, user, token, navigate, signIn, signOut, dismissIntro: () => setIntro(false) }
}

export function SiteHeader({ route, user, onNavigate }) {
  const current = tabs.find((tab) => tab.id === route.tab) || tabs[0]
  return (
    <header className="site-header">
      <button className="site-brand" onClick={() => onNavigate('home')} type="button">
        <span className="site-mark" aria-hidden="true" />
        <span>Soul<span>Site</span></span>
      </button>
      <nav className="site-tabs" aria-label="SoulSite">
        {tabs.filter((tab) => tab.id !== 'signin' || !user).map((tab) => (
          <button
            aria-current={route.tab === tab.id ? 'page' : undefined}
            key={tab.id}
            onClick={() => onNavigate(tab.id, tab.subs?.[0]?.[0] || '')}
            type="button"
          >
            <i />
            {tab.id === 'signin' && user ? user.username : tab.label}
          </button>
        ))}
        {user ? (
          <button aria-current={route.tab === 'signin' ? 'page' : undefined} onClick={() => onNavigate('signin')} type="button">
            <i />
            {user.username}
          </button>
        ) : null}
      </nav>
      {current.subs ? (
        <nav className="site-subtabs" aria-label={`${current.label} sections`}>
          {current.subs.map(([id, label]) => (
            <button aria-current={route.sub === id ? 'page' : undefined} key={id} onClick={() => onNavigate(current.id, id)} type="button">
              {label}
            </button>
          ))}
        </nav>
      ) : <div className="site-subtabs site-subtabs-empty" />}
    </header>
  )
}

export function IntroOverlay({ onSkip }) {
  return (
    <div className="intro-overlay" role="status">
      <div className="intro-orb" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="intro-word">Soul<span>Site</span></p>
      <p>Tuning the field</p>
      <div className="intro-track"><b /></div>
      <button onClick={onSkip} type="button">Enter</button>
    </div>
  )
}

export function SignInDesk({ onSignedIn }) {
  const [mode, setMode] = useState('signin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [age, setAge] = useState('18')
  const [adult, setAdult] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await fetch(mode === 'signin' ? '/api/session/login' : '/api/session/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'signin'
          ? { username, password }
          : { username, password, age: Number(age), adultConfirmed: adult }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || 'Sign-in failed.')
      onSignedIn(payload.token, payload.user)
    } catch (signInError) {
      setError(signInError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="desk-card signin-card">
      <p className="desk-kicker">Local field account</p>
      <h2>{mode === 'signin' ? 'Sign in' : 'Create your account'}</h2>
      <p>This deployment signs you in on SoulSite itself. Email accounts remain available when Supabase is configured.</p>
      <form onSubmit={submit}>
        <label>Name<input autoComplete="username" onChange={(event) => setUsername(event.target.value)} required value={username} /></label>
        <label>Password<input autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
        {mode === 'register' ? (
          <>
            <label>Age<input max="120" min="18" onChange={(event) => setAge(event.target.value)} required type="number" value={age} /></label>
            <label className="check-line"><input checked={adult} onChange={(event) => setAdult(event.target.checked)} required type="checkbox" /> I confirm I am 18 or older.</label>
          </>
        ) : null}
        <button disabled={busy} type="submit">{busy ? 'Opening…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
      </form>
      <button className="text-switch" onClick={() => setMode(mode === 'signin' ? 'register' : 'signin')} type="button">
        {mode === 'signin' ? 'New here? Create an account' : 'Already have a name? Sign in'}
      </button>
      {error ? <p className="desk-error" role="alert">{error}</p> : null}
    </section>
  )
}

export function MapDesk({ onOpenSignIn }) {
  const [map, setMap] = useState(null)
  const [areaId, setAreaId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/map')
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.message || 'Map unavailable')
        setMap(payload)
        setAreaId(payload.areas?.[0]?.id || '')
      })
      .catch((mapError) => setError(mapError.message))
  }, [])

  const area = map?.areas?.find((item) => item.id === areaId)
  return (
    <section className="desk-card">
      <p className="desk-kicker">Coarse areas only</p>
      <h2>Where the field is gathering</h2>
      <p>{map?.note || 'Locations are broad areas, never an exact address.'}</p>
      {error ? <p className="desk-error">{error}</p> : null}
      <div className="area-grid">
        {(map?.areas || []).map((item) => (
          <button className={item.id === areaId ? 'is-active' : ''} key={item.id} onClick={() => setAreaId(item.id)} type="button">
            <strong>{item.name}</strong>
            <span>{item.count} souls</span>
            <small>{item.hint}</small>
          </button>
        ))}
      </div>
      {area ? (
        <ul className="soul-list">
          {area.souls.map((soul) => (
            <li key={soul.id}>
              <button onClick={onOpenSignIn} type="button">{soul.name}</button>
              <span>{soul.intention}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

const settingDefaults = {
  motion: 'cinematic',
  textScale: '100',
  glow: 'soft',
  mapVisible: false,
  notifications: false,
  showScores: true,
  pace: 'gentle',
}

export function SettingsDesk({ user, token, onSignOut, onPlan }) {
  const [settings, setSettings] = useState(() => ({ ...settingDefaults, ...JSON.parse(localStorage.getItem('soulsite.settings') || '{}') }))
  const [plan, setPlan] = useState(user?.activePlan || 'Free')

  function update(key, value) {
    const next = { ...settings, [key]: value }
    setSettings(next)
    localStorage.setItem('soulsite.settings', JSON.stringify(next))
    document.documentElement.style.setProperty('--site-text-scale', `${next.textScale}%`)
    document.documentElement.dataset.motion = next.motion
  }

  return (
    <section className="desk-card settings-grid">
      <div>
        <p className="desk-kicker">Your controls</p>
        <h2>Settings</h2>
        <p>These preferences stay on this device. Provider features such as voice calls and billing stay off until a service is connected.</p>
      </div>
      <label>Motion<select onChange={(event) => update('motion', event.target.value)} value={settings.motion}><option value="cinematic">Cinematic</option><option value="gentle">Gentle</option><option value="reduced">Reduced</option></select></label>
      <label>Text size<select onChange={(event) => update('textScale', event.target.value)} value={settings.textScale}><option value="100">Standard</option><option value="112">Large</option><option value="125">Larger</option></select></label>
      <label>Glow<select onChange={(event) => update('glow', event.target.value)} value={settings.glow}><option value="soft">Soft</option><option value="bright">Bright</option><option value="off">Off</option></select></label>
      <label>Discovery pace<select onChange={(event) => update('pace', event.target.value)} value={settings.pace}><option value="gentle">Gentle</option><option value="steady">Steady</option><option value="quick">Quick</option></select></label>
      <label className="check-line"><input checked={settings.showScores} onChange={(event) => update('showScores', event.target.checked)} type="checkbox" /> Show alignment readings</label>
      <label className="check-line"><input checked={settings.notifications} onChange={(event) => update('notifications', event.target.checked)} type="checkbox" /> Keep a local reminder preference</label>
      <label className="check-line"><input checked={settings.mapVisible} onChange={(event) => update('mapVisible', event.target.checked)} type="checkbox" /> Appear as a count on the coarse map</label>
      {user?.role === 'admin' ? (
        <label>Admin plan
          <select onChange={(event) => { setPlan(event.target.value); onPlan?.(event.target.value) }} value={plan}>
            {Object.keys(user.plans || {}).map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
      ) : <p>Signed-in members use the Free rhythm unless an admin unlocks another plan.</p>}
      {user ? <button onClick={onSignOut} type="button">Sign out {user.username}</button> : <p>Sign in to save a profile to your account. Token ready: {token ? 'yes' : 'no'}.</p>}
    </section>
  )
}

export function ProfileDesk({ token, sub, onOpenSignIn }) {
  const [profile, setProfile] = useState({})
  const [visibility, setVisibility] = useState({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return undefined
    let active = true
    fetch('/api/me/profile', { headers: { Authorization: `Bearer local.${token}` } })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.message || 'Could not load profile')
        if (!active) return
        setProfile(payload.profile || {})
        setVisibility(payload.visibility || {})
      })
      .catch((loadError) => {
        if (active) setError(loadError.message)
      })
    return () => {
      active = false
    }
  }, [token])

  async function save(event) {
    event.preventDefault()
    setError('')
    const response = await fetch('/api/me/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer local.${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, visibility }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) setError(payload.message || 'Could not save profile')
    else setMessage('Saved to your account. More depth helps, but 20 words is allowed too.')
  }

  if (!token) {
    return (
      <section className="desk-card">
        <h2>Your profile stays locked until you sign in</h2>
        <button onClick={onOpenSignIn} type="button">Open sign in</button>
      </section>
    )
  }

  if (sub === 'builder') {
    return (
      <ProfileBuilder
        initialProfile={JSON.parse(localStorage.getItem('soulsite.builder') || '{}')}
        onSave={async (draft) => {
          const saved = { ...draft, id: draft.id || 'local-profile' }
          localStorage.setItem('soulsite.builder', JSON.stringify(saved))
          return saved
        }}
        onDelete={async () => localStorage.removeItem('soulsite.builder')}
        onAssess={async ({ answers }) => ({
          schemaVersion: 1,
          disclaimer: 'This reading only restates your answers. It is not a score.',
          dimensions: assessmentDimensions.map((dimension) => ({
            ...dimension,
            score: null,
            explanation: 'No score is calculated in the browser.',
            evidence: Object.keys(answers),
          })),
        })}
      />
    )
  }

  return (
    <form className="desk-card profile-form" onSubmit={save}>
      <p className="desk-kicker">Write as much as you want</p>
      <h2>My profile</h2>
      <p>Twenty words or two thousand. The more depth, the clearer the field, but nothing here forces a length.</p>
      {profileFields.map((field) => {
        const words = (profile[field.key] || '').trim().split(/\s+/).filter(Boolean).length
        return (
          <label key={field.key}>
            {field.label}
            <small>{field.prompt} · {words} words</small>
            {field.maxLength > 300 ? (
              <textarea onChange={(event) => setProfile((current) => ({ ...current, [field.key]: event.target.value }))} rows={field.maxLength > 2000 ? 8 : 4} value={profile[field.key] || ''} />
            ) : (
              <input onChange={(event) => setProfile((current) => ({ ...current, [field.key]: event.target.value }))} value={profile[field.key] || ''} />
            )}
            <select aria-label={`${field.label} visibility`} onChange={(event) => setVisibility((current) => ({ ...current, [field.key]: event.target.value }))} value={visibility[field.key] || 'private'}>
              {profileVisibilityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        )
      })}
      <button type="submit">Save profile</button>
      {message ? <p role="status">{message}</p> : null}
      {error ? <p className="desk-error" role="alert">{error}</p> : null}
    </form>
  )
}
