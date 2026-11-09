import { useEffect, useState } from 'react'
import './admin.css'

const panels = [
  ['pulse', 'Pulse'],
  ['people', 'People'],
  ['souls', 'Souls'],
  ['network', 'Network'],
  ['copy', 'Field copy'],
  ['issues', 'Issues'],
]

function authHeaders(token, json = false) {
  return {
    Authorization: ['Bearer', `local.${token}`].join(' '),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  }
}

async function adminFetch(token, path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...authHeaders(token, Boolean(options.body)), ...options.headers },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message || 'The hub could not read that.')
  return payload
}

function Gate({ onSignedIn, onExit }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || 'Those details do not open the gate.')
      if (payload.user?.role !== 'admin') {
        await fetch('/api/session', { method: 'DELETE', headers: authHeaders(payload.token) }).catch(() => {})
        throw new Error('This gate is only for Admin.')
      }
      onSignedIn(payload.token, payload.user)
    } catch (gateError) {
      setError(gateError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-gate">
      <form onSubmit={submit}>
        <p className="admin-kicker">God mode</p>
        <h2>Admin gate</h2>
        <p>The field overview stays behind this door.</p>
        <label>Name<input autoComplete="username" onChange={(event) => setUsername(event.target.value)} required value={username} /></label>
        <label>Password<input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
        <div className="admin-actions">
          <button disabled={busy} type="submit">{busy ? 'Checking…' : 'Enter hub'}</button>
          <button onClick={onExit} type="button">Back</button>
        </div>
        {error ? <p className="admin-error" role="alert">{error}</p> : null}
      </form>
    </div>
  )
}

function Pulse({ pulse }) {
  const max = Math.max(1, ...(pulse?.requests.buckets || [1]))
  return (
    <div className="admin-grid">
      {[
        ['Accounts', pulse?.db.accounts],
        ['Souls', pulse?.db.souls],
        ['Decisions', pulse?.db.decisions],
        ['Open issues', pulse?.db.openIssues],
      ].map(([label, value]) => (
        <article className="admin-card" key={label}>
          <span>{label}</span>
          <strong>{value ?? '—'}</strong>
        </article>
      ))}
      <article className="admin-wide">
        <span>Live request pulse</span>
        <div className="admin-bars" aria-hidden="true">
          {(pulse?.requests.buckets || []).map((count, index) => (
            <b key={index} style={{ height: `${Math.max(6, (count / max) * 100)}%` }} />
          ))}
        </div>
      </article>
      <article className="admin-wide">
        <span>Curious signals by day</span>
        <div className="admin-bars" aria-label="Decisions by day">
          {(pulse?.decisionsByDay || []).map((day) => (
            <b key={day.day} title={`${day.day}: ${day.yes} yes`} style={{ height: `${Math.max(8, Number(day.yes) + Number(day.pass))}px` }} />
          ))}
        </div>
        {!pulse?.decisionsByDay?.length ? <small>No swipe signals yet. The chart fills as people choose.</small> : null}
      </article>
    </div>
  )
}

function People({ token }) {
  const [users, setUsers] = useState([])
  const [selected, setSelected] = useState(null)
  const [draft, setDraft] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    adminFetch(token, '/api/admin/users').then((payload) => setUsers(payload.users)).catch((loadError) => setError(loadError.message))
  }, [token])

  async function open(id) {
    setError('')
    const payload = await adminFetch(token, `/api/admin/users/${id}`)
    setSelected(payload)
    setDraft({
      age: payload.user.age || 18,
      area: payload.user.area || '',
      mapVisible: Boolean(payload.user.mapVisible),
      password: '',
      overview: payload.profile?.overview || '',
      profile: JSON.stringify(payload.profile?.profile || {}, null, 2),
    })
  }

  async function save(event) {
    event.preventDefault()
    setError('')
    try {
      const profile = JSON.parse(draft.profile || '{}')
      await adminFetch(token, `/api/admin/users/${selected.user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          age: Number(draft.age),
          area: draft.area || null,
          mapVisible: draft.mapVisible,
          ...(draft.password ? { password: draft.password } : {}),
          profile,
          overview: draft.overview,
        }),
      })
      setMessage('Saved. The field is using this correction.')
    } catch (saveError) {
      setError(saveError.message)
    }
  }

  return (
    <div className="admin-grid">
      <div className="admin-table-wrap">
        <span>Everyone on the field</span>
        <ul className="admin-feed">
          {users.map((user) => (
            <li key={user.id}>
              <button className="row" onClick={() => open(user.id)} type="button">
                <span>{user.role}</span>
                <strong>{user.username}</strong>
                <small>{user.sessions} sessions</small>
              </button>
            </li>
          ))}
        </ul>
        {error ? <p className="admin-error">{error}</p> : null}
      </div>
      {draft && selected ? (
        <form className="admin-editor" onSubmit={save}>
          <p className="admin-kicker">Inspect {selected.user.username}</p>
          <label>Age<input onChange={(event) => setDraft({ ...draft, age: event.target.value })} type="number" value={draft.age} /></label>
          <label>Coarse area<input onChange={(event) => setDraft({ ...draft, area: event.target.value })} value={draft.area} /></label>
          <label className="admin-actions"><input checked={draft.mapVisible} onChange={(event) => setDraft({ ...draft, mapVisible: event.target.checked })} type="checkbox" /> Visible as a count on the map</label>
          <label>Replacement password<input onChange={(event) => setDraft({ ...draft, password: event.target.value })} type="password" value={draft.password} /></label>
          <label>Overview<textarea onChange={(event) => setDraft({ ...draft, overview: event.target.value })} value={draft.overview} /></label>
          <label>Profile answers<textarea onChange={(event) => setDraft({ ...draft, profile: event.target.value })} value={draft.profile} /></label>
          <div className="admin-actions">
            <button type="submit">Save correction</button>
          </div>
          {message ? <p role="status">{message}</p> : null}
          <small>{selected.decisions?.length || 0} recorded signals.</small>
        </form>
      ) : null}
    </div>
  )
}

function Souls({ token, onChanged }) {
  const [souls, setSouls] = useState([])
  const [soul, setSoul] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    adminFetch(token, '/api/admin/souls').then((payload) => setSouls(payload.souls)).catch((loadError) => setError(loadError.message))
  }, [token])

  async function save(event) {
    event.preventDefault()
    setError('')
    try {
      const payload = await adminFetch(token, `/api/admin/souls/${soul.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: soul.name,
          age: Number(soul.age),
          distance: soul.distance,
          intention: soul.intention,
          energy: soul.energy,
          bio: soul.bio,
          accent: soul.accent,
          values: soul.values,
          tags: soul.tags,
        }),
      })
      setSoul(payload.soul)
      setSouls((current) => current.map((item) => (item.id === payload.soul.id ? payload.soul : item)))
      onChanged?.()
    } catch (saveError) {
      setError(saveError.message)
    }
  }

  return (
    <div className="admin-grid">
      <div className="admin-table-wrap">
        <ul className="admin-feed">
          {souls.map((item) => (
            <li key={item.id}>
              <button className="row" onClick={() => setSoul(item)} type="button">
                <span>{item.age}</span>
                <strong>{item.name}</strong>
                <small>{item.intention}</small>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {soul ? (
        <form className="admin-editor" onSubmit={save}>
          <p className="admin-kicker">Edit {soul.name}</p>
          <label>Name<input onChange={(event) => setSoul({ ...soul, name: event.target.value })} value={soul.name} /></label>
          <label>Age<input onChange={(event) => setSoul({ ...soul, age: event.target.value })} type="number" value={soul.age} /></label>
          <label>Coarse place<input onChange={(event) => setSoul({ ...soul, distance: event.target.value })} value={soul.distance} /></label>
          <label>Intention<input onChange={(event) => setSoul({ ...soul, intention: event.target.value })} value={soul.intention} /></label>
          <label>Energy<input onChange={(event) => setSoul({ ...soul, energy: event.target.value })} value={soul.energy} /></label>
          <label>Note<textarea onChange={(event) => setSoul({ ...soul, bio: event.target.value })} value={soul.bio} /></label>
          <label>Accent<input onChange={(event) => setSoul({ ...soul, accent: event.target.value })} value={soul.accent} /></label>
          <div className="admin-actions"><button type="submit">Save soul</button></div>
          {error ? <p className="admin-error">{error}</p> : null}
        </form>
      ) : null}
    </div>
  )
}

function Network({ pulse, token }) {
  const [health, setHealth] = useState(null)
  const [fix, setFix] = useState('')
  const [target, setTarget] = useState(null)
  const [message, setMessage] = useState('')

  async function probe() {
    const started = performance.now()
    const response = await fetch('/health')
    setHealth({ ok: response.ok, ms: Math.round(performance.now() - started) })
  }

  async function saveFix(event) {
    event.preventDefault()
    await adminFetch(token, '/api/admin/issues', {
      method: 'POST',
      body: JSON.stringify({
        source: `${target.method} ${target.path}`,
        message: `${target.status} in ${target.ms}ms`,
        fix,
        status: 'fixed',
      }),
    })
    setMessage('Fix noted and marked done.')
    setTarget(null)
    setFix('')
  }

  return (
    <div className="admin-grid">
      {(pulse?.services || []).map((service) => (
        <article className="admin-card" key={service.id}>
          <span className={service.status === 'live' ? 'tone-live' : 'tone-standby'}>{service.status}</span>
          <strong>{service.name}</strong>
          <small>{service.detail}</small>
        </article>
      ))}
      <article className="admin-wide">
        <span>This process</span>
        <strong>{pulse ? `${pulse.host} · ${pulse.cpus} cores` : 'Reading…'}</strong>
        <small>
          {pulse ? `${pulse.platform} · heap ${Math.round(pulse.memory.heapUsed / 1048576)} / ${Math.round(pulse.memory.heapTotal / 1048576)} MB · db ${pulse.db.bytes} bytes` : ''}
        </small>
        <div className="admin-actions">
          <button onClick={probe} type="button">Probe /health</button>
          {health ? <span className={health.ok ? 'tone-live' : 'tone-bad'}>{health.ok ? 'live' : 'down'} · {health.ms}ms</span> : null}
        </div>
      </article>
      <article className="admin-wide">
        <span>Recent faults. Click one, then edit the fix.</span>
        <ul className="admin-feed">
          {(pulse?.requests.recent || []).filter((item) => item.status >= 400).map((item) => (
            <li key={`${item.at}-${item.path}`}>
              <button className="row" onClick={() => setTarget(item)} type="button">
                <span className="is-bad">{item.status}</span>
                <strong>{item.method} {item.path}</strong>
                <small>{item.ms}ms</small>
              </button>
            </li>
          ))}
        </ul>
        {!pulse?.requests.recent?.some((item) => item.status >= 400) ? <small>No faults in this process window.</small> : null}
        {target ? (
          <form onSubmit={saveFix}>
            <label>Fix for {target.path}<textarea onChange={(event) => setFix(event.target.value)} value={fix} /></label>
            <button type="submit">Save fix</button>
            {message ? <p role="status">{message}</p> : null}
          </form>
        ) : null}
      </article>
    </div>
  )
}

function CopyDesk({ token, onChanged }) {
  const keys = ['home.eyebrow', 'home.headline', 'home.intro', 'signin.kicker', 'signin.lede']
  const [entries, setEntries] = useState({})
  const [message, setMessage] = useState('')

  useEffect(() => {
    adminFetch(token, '/api/admin/content')
      .then((payload) => setEntries(Object.fromEntries(payload.entries.map((entry) => [entry.key, entry.value]))))
      .catch(() => {})
  }, [token])

  async function save(key) {
    await adminFetch(token, `/api/admin/content/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value: entries[key] || '' }),
    })
    setMessage(`Saved ${key}`)
    onChanged?.()
  }

  return (
    <div className="admin-grid">
      {keys.map((key) => (
        <label className="admin-editor" key={key}>
          {key}
          <textarea onChange={(event) => setEntries({ ...entries, [key]: event.target.value })} value={entries[key] || ''} />
          <button onClick={() => save(key)} type="button">Save</button>
        </label>
      ))}
      {message ? <p role="status">{message}</p> : null}
    </div>
  )
}

function Issues({ token }) {
  const [issues, setIssues] = useState([])
  const [active, setActive] = useState(null)

  function load() {
    adminFetch(token, '/api/admin/issues').then((payload) => setIssues(payload.issues))
  }

  useEffect(load, [token])

  async function save(status) {
    await adminFetch(token, `/api/admin/issues/${active.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, fix: active.fix }),
    })
    setActive(null)
    load()
  }

  return (
    <div className="admin-grid">
      <ul className="admin-feed admin-wide">
        {issues.map((issue) => (
          <li key={issue.id}>
            <button className="row" onClick={() => setActive(issue)} type="button">
              <span>{issue.status}</span>
              <strong>{issue.message}</strong>
              <small>{issue.source}</small>
            </button>
          </li>
        ))}
      </ul>
      {active ? (
        <form className="admin-editor" onSubmit={(event) => { event.preventDefault(); save('fixed') }}>
          <label>Fix<textarea onChange={(event) => setActive({ ...active, fix: event.target.value })} value={active.fix || ''} /></label>
          <div className="admin-actions">
            <button type="submit">Mark fixed</button>
            <button onClick={() => save('open')} type="button">Keep open</button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

export function AdminHub({ user, token, panel, onSignedIn, onExit, onPanel, onChanged }) {
  const [pulse, setPulse] = useState(null)
  const [error, setError] = useState('')
  const ready = user?.role === 'admin' && token

  useEffect(() => {
    if (!ready) return undefined
    let active = true
    async function tick() {
      try {
        const payload = await adminFetch(token, '/api/admin/pulse')
        if (active) setPulse(payload)
      } catch (loadError) {
        if (active) setError(loadError.message)
      }
    }
    tick()
    const timer = window.setInterval(tick, 3000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [ready, token])

  if (!ready) return <Gate onExit={onExit} onSignedIn={onSignedIn} />

  return (
    <section className="admin-hub" aria-label="Admin hub">
      <aside className="admin-rail">
        <p>SoulSite</p>
        <h1>Admin hub</h1>
        {panels.map(([id, label]) => (
          <button className={panel === id ? 'is-active' : ''} key={id} onClick={() => onPanel(id)} type="button">{label}</button>
        ))}
        <button className="admin-back" onClick={onExit} type="button">Back to SoulSite</button>
      </aside>
      <div className="admin-main">
        <header className="admin-top">
          <div>
            <p className="admin-live"><i /> Live telemetry</p>
            <h2>{panels.find(([id]) => id === panel)?.[1] || 'Pulse'}</h2>
          </div>
          <span>{pulse?.now ? new Date(pulse.now).toLocaleTimeString() : 'linking'}</span>
        </header>
        {error ? <p className="admin-error">{error}</p> : null}
        {panel === 'people' ? <People token={token} /> : null}
        {panel === 'souls' ? <Souls onChanged={onChanged} token={token} /> : null}
        {panel === 'network' ? <Network pulse={pulse} token={token} /> : null}
        {panel === 'copy' ? <CopyDesk onChanged={onChanged} token={token} /> : null}
        {panel === 'issues' ? <Issues token={token} /> : null}
        {panel === 'pulse' || !panels.some(([id]) => id === panel) ? <Pulse pulse={pulse} /> : null}
      </div>
    </section>
  )
}

export function SiteInspector({ token, onChanged }) {
  const [armed, setArmed] = useState(() => sessionStorage.getItem('soulsite.inspect') === '1')
  const [target, setTarget] = useState(null)
  const [value, setValue] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    document.documentElement.classList.toggle('is-inspecting', armed)
    sessionStorage.setItem('soulsite.inspect', armed ? '1' : '0')
    if (!armed) return undefined
    function onClick(event) {
      const node = event.target.closest?.('[data-inspect]')
      if (!node) return
      event.preventDefault()
      event.stopPropagation()
      setTarget({
        kind: node.dataset.inspect,
        key: node.dataset.key || '',
        id: node.dataset.soul || '',
        field: node.dataset.field || 'bio',
        message: node.dataset.message || node.textContent || '',
      })
      setValue(node.dataset.value || node.textContent || '')
      setMessage('')
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [armed])

  async function save(event) {
    event.preventDefault()
    setMessage('')
      try {
      if (target.kind === 'soul') {
      await adminFetch(token, `/api/admin/souls/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ [target.field]: value }),
      })
    } else if (target.kind === 'copy') {
      await adminFetch(token, `/api/admin/content/${target.key}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      })
    } else {
      await adminFetch(token, '/api/admin/issues', {
        method: 'POST',
        body: JSON.stringify({ source: target.key || 'site', message: target.message, fix: value, status: 'fixed' }),
      })
    }
    setMessage('Saved from the page.')
    onChanged?.()
        } catch (saveError) {
          setMessage(saveError.message)
        }
      }

  return (
    <>
      <button className="inspect-toggle" onClick={() => setArmed((current) => !current)} type="button">
        {armed ? 'Inspecting' : 'Edit on site'}
      </button>
      {target ? (
        <form className="inspect-panel" onSubmit={save}>
          <p className="admin-kicker">{target.kind} · {target.key || target.id || 'error'}</p>
          <label>Correction<textarea onChange={(event) => setValue(event.target.value)} value={value} /></label>
          <div className="admin-actions">
            <button type="submit">Save edit</button>
            <button onClick={() => setTarget(null)} type="button">Close</button>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </form>
      ) : null}
    </>
  )
}
