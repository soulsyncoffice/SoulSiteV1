import fs from 'node:fs'
import os from 'node:os'
import express from 'express'
import { hashPassword } from './localSession.js'
import { areaForProfile, mapAreas } from './mapAreas.js'

const soulFields = ['name', 'age', 'distance', 'intention', 'energy', 'bio', 'accent', 'values', 'tags']

export function ensureAdminTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_content (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS admin_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      message TEXT NOT NULL,
      fix TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

export function createTelemetry() {
  const state = {
    total: 0,
    errors: 0,
    buckets: Array.from({ length: 12 }, () => 0),
    index: 0,
    recent: [],
  }
  const timer = setInterval(() => {
    state.index = (state.index + 1) % state.buckets.length
    state.buckets[state.index] = 0
  }, 5000)
  timer.unref?.()
  return {
    state,
    stop() {
      clearInterval(timer)
    },
    middleware(req, res, next) {
      const started = Date.now()
      state.total += 1
      state.buckets[state.index] += 1
      res.on('finish', () => {
        if (res.statusCode >= 400) state.errors += 1
        state.recent.unshift({
          at: new Date().toISOString(),
          method: req.method,
          path: String(req.path || '').slice(0, 180),
          status: res.statusCode,
          ms: Date.now() - started,
        })
        state.recent = state.recent.slice(0, 40)
      })
      next()
    },
  }
}

function cleanText(value, max) {
  return String(value ?? '').replace(/\u0000/g, '').slice(0, max)
}

function readSoul(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    distance: row.distance,
    intention: row.intention,
    energy: row.energy,
    bio: row.bio,
    accent: row.accent,
    values: JSON.parse(row.profile_values),
    tags: JSON.parse(row.tags),
    compatibility: JSON.parse(row.compatibility),
  }
}

function validateSoulPatch(body) {
  const patch = {}
  if ('name' in body) {
    patch.name = cleanText(body.name, 80).trim()
    if (!patch.name) return { error: 'A soul needs a name.' }
  }
  if ('age' in body) {
    const age = Number(body.age)
    if (!Number.isInteger(age) || age < 18 || age > 120) return { error: 'Age must be a whole number from 18 to 120.' }
    patch.age = age
  }
  if ('distance' in body) {
    patch.distance = cleanText(body.distance, 80).trim()
    if (!patch.distance) return { error: 'Distance needs a coarse label, never an exact address.' }
  }
  if ('intention' in body) {
    patch.intention = cleanText(body.intention, 200).trim()
    if (!patch.intention) return { error: 'Intention cannot be empty.' }
  }
  if ('energy' in body) {
    patch.energy = cleanText(body.energy, 400).trim()
    if (!patch.energy) return { error: 'Energy cannot be empty.' }
  }
  if ('bio' in body) {
    patch.bio = cleanText(body.bio, 20000).trim()
    if (!patch.bio) return { error: 'The note cannot be empty.' }
  }
  if ('accent' in body) {
    patch.accent = cleanText(body.accent, 7).trim()
    if (!/^#[0-9a-fA-F]{6}$/.test(patch.accent)) return { error: 'Accent must be a #rrggbb colour.' }
  }
  for (const key of ['values', 'tags']) {
    if (!(key in body)) continue
    const list = Array.isArray(body[key])
      ? body[key]
      : String(body[key] || '').split('\n')
    patch[key] = list.map((item) => cleanText(item, 120).trim()).filter(Boolean).slice(0, 12)
  }
  if (!Object.keys(patch).length) return { error: 'Nothing to update.' }
  return { patch }
}

export function createAdminRouter({ db, localAuth, telemetry, dbPath }) {
  ensureAdminTables(db)
  const router = express.Router()

  router.use((req, res, next) => {
    const token = (req.get('authorization') || '').match(/^Bearer\s+local\.(\S+)$/i)?.[1]
    const user = token ? localAuth.readToken(token) : null
    if (!user) return res.status(401).json({ message: 'Sign in as Admin.' })
    if (user.role !== 'admin') return res.status(403).json({ message: 'Admin gate only.' })
    req.adminUser = user
    return next()
  })

  router.get('/pulse', (_req, res) => {
    const accounts = db.prepare('SELECT COUNT(*) AS count FROM local_accounts').get().count
    const sessions = db.prepare('SELECT COUNT(*) AS count FROM local_sessions').get().count
    const souls = db.prepare('SELECT COUNT(*) AS count FROM profiles').get().count
    const decisions = db.prepare('SELECT COUNT(*) AS count FROM decisions').get().count
    const openIssues = db.prepare(`SELECT COUNT(*) AS count FROM admin_issues WHERE status != 'fixed'`).get().count
    const byDay = db.prepare(`
      SELECT date_key AS day,
        SUM(CASE WHEN decision = 'yes' THEN 1 ELSE 0 END) AS yes,
        SUM(CASE WHEN decision != 'yes' THEN 1 ELSE 0 END) AS pass
      FROM decisions
      GROUP BY date_key
      ORDER BY date_key DESC
      LIMIT 14
    `).all().reverse()
    const soulRows = db.prepare('SELECT id FROM profiles').all()
    const members = localAuth.visibleMembers()
    const areas = mapAreas.map((area) => ({
      id: area.id,
      name: area.name,
      count: soulRows.filter((row) => areaForProfile(row.id) === area.id).length
        + members.filter((member) => member.area === area.id).length,
    }))
    let dbBytes = 0
    try {
      dbBytes = fs.statSync(dbPath).size
    } catch {
      dbBytes = 0
    }
    const memory = process.memoryUsage()
    res.json({
      now: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
      host: os.hostname(),
      platform: `${os.platform()} ${os.release()}`,
      cpus: os.cpus().length,
      memory: {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
      },
      db: { bytes: dbBytes, accounts, sessions, souls, decisions, openIssues },
      requests: {
        total: telemetry.state.total,
        errors: telemetry.state.errors,
        buckets: [...telemetry.state.buckets],
        recent: telemetry.state.recent,
      },
      services: [
        { id: 'api', name: 'SoulSite API', status: 'live', detail: `Process up ${Math.round(process.uptime())}s` },
        { id: 'db', name: 'Field database', status: 'live', detail: `${dbBytes} bytes on disk` },
        { id: 'static', name: 'Web host', status: fs.existsSync(new URL('../dist/index.html', import.meta.url)) ? 'live' : 'building', detail: 'Serves the built site' },
        { id: 'supabase', name: 'Supabase auth', status: process.env.SUPABASE_URL ? 'configured' : 'standby', detail: process.env.SUPABASE_URL ? 'External auth is configured' : 'Local accounts only' },
        { id: 'overview', name: 'Overview model', status: process.env.OPENAI_API_KEY ? 'configured' : 'standby', detail: process.env.OPENAI_API_KEY ? 'Model key is present' : 'Not connected' },
      ],
      decisionsByDay: byDay,
      areas,
    })
  })

  router.get('/users', (_req, res) => {
    const accounts = db.prepare(`
      SELECT id, username, age, role, area, map_visible, created_at
      FROM local_accounts
      ORDER BY created_at DESC
    `).all()
    const sessions = db.prepare('SELECT user_id, COUNT(*) AS count FROM local_sessions GROUP BY user_id').all()
    const counts = Object.fromEntries(sessions.map((row) => [row.user_id, row.count]))
    const people = accounts.map((account) => ({
      ...account,
      mapVisible: Boolean(account.map_visible),
      sessions: counts[account.id] || 0,
      kind: 'member',
    }))
    people.unshift({
      id: 'admin',
      username: 'Admin',
      age: 30,
      role: 'admin',
      area: null,
      mapVisible: false,
      created_at: null,
      sessions: counts.admin || 0,
      kind: 'admin',
    })
    res.json({ users: people })
  })

  router.get('/users/:id', (req, res) => {
    if (req.params.id === 'admin') {
      return res.json({
        user: { id: 'admin', username: 'Admin', role: 'admin', age: 30, area: null, mapVisible: false },
        profile: localAuth.readProfile('admin'),
        decisions: db.prepare('SELECT * FROM decisions WHERE user_id = ? ORDER BY id DESC LIMIT 40').all('admin'),
      })
    }
    const account = db.prepare('SELECT id, username, age, role, area, map_visible, created_at FROM local_accounts WHERE id = ?').get(req.params.id)
    if (!account) return res.status(404).json({ message: 'That person is not on this field.' })
    return res.json({
      user: { ...account, mapVisible: Boolean(account.map_visible) },
      profile: localAuth.readProfile(account.id),
      decisions: db.prepare('SELECT * FROM decisions WHERE user_id = ? ORDER BY id DESC LIMIT 40').all(account.id),
    })
  })

  router.patch('/users/:id', (req, res) => {
    if (req.params.id === 'admin') return res.status(400).json({ message: 'The Admin gate account is fixed.' })
    const account = db.prepare('SELECT id FROM local_accounts WHERE id = ?').get(req.params.id)
    if (!account) return res.status(404).json({ message: 'That person is not on this field.' })
    const body = req.body || {}
    if ('age' in body) {
      const age = Number(body.age)
      if (!Number.isInteger(age) || age < 18 || age > 120) return res.status(400).json({ message: 'Age must be a whole number from 18 to 120.' })
      db.prepare('UPDATE local_accounts SET age = ? WHERE id = ?').run(age, account.id)
    }
    if ('area' in body) {
      const area = body.area ? cleanText(body.area, 40) : null
      if (area && !mapAreas.some((item) => item.id === area)) return res.status(400).json({ message: 'Choose a known coarse area.' })
      db.prepare('UPDATE local_accounts SET area = ? WHERE id = ?').run(area, account.id)
    }
    if ('mapVisible' in body) {
      db.prepare('UPDATE local_accounts SET map_visible = ? WHERE id = ?').run(body.mapVisible ? 1 : 0, account.id)
    }
    if (body.password) {
      if (String(body.password).length < 8) return res.status(400).json({ message: 'A replacement password needs at least 8 characters.' })
      const { salt, hash } = hashPassword(body.password)
      db.prepare('UPDATE local_accounts SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, account.id)
    }
    if (body.profile && typeof body.profile === 'object') {
      localAuth.saveProfile(account.id, body.profile, body.visibility || {}, body.overview || null)
    }
    return res.json({ ok: true })
  })

  router.delete('/users/:id', (req, res) => {
    if (!localAuth.deleteAccount(req.params.id)) return res.status(400).json({ message: 'That account cannot be removed.' })
    return res.status(204).end()
  })

  router.get('/souls', (_req, res) => {
    const rows = db.prepare('SELECT * FROM profiles ORDER BY name').all()
    res.json({ souls: rows.map(readSoul) })
  })

  router.patch('/souls/:id', (req, res) => {
    const current = readSoul(db.prepare('SELECT * FROM profiles WHERE id = ?').get(req.params.id))
    if (!current) return res.status(404).json({ message: 'That soul is not in the field.' })
    const validated = validateSoulPatch(req.body || {})
    if (validated.error) return res.status(400).json({ message: validated.error })
    const next = { ...current, ...validated.patch }
    db.prepare(`
      UPDATE profiles
      SET name = ?, age = ?, distance = ?, intention = ?, energy = ?, bio = ?, accent = ?, profile_values = ?, tags = ?
      WHERE id = ?
    `).run(
      next.name,
      next.age,
      next.distance,
      next.intention,
      next.energy,
      next.bio,
      next.accent,
      JSON.stringify(next.values),
      JSON.stringify(next.tags),
      current.id,
    )
    return res.json({ soul: next })
  })

  router.get('/content', (_req, res) => {
    res.json({ entries: db.prepare('SELECT key, value, updated_at FROM admin_content ORDER BY key').all() })
  })

  router.put('/content/:key', (req, res) => {
    const key = cleanText(req.params.key, 80)
    if (!/^[\w.-]+$/.test(key)) return res.status(400).json({ message: 'Content keys use letters, numbers, dots, and dashes.' })
    const value = cleanText(req.body?.value, 4000)
    db.prepare(`
      INSERT INTO admin_content (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(key, value)
    return res.json({ key, value })
  })

  router.get('/issues', (_req, res) => {
    res.json({ issues: db.prepare('SELECT * FROM admin_issues ORDER BY id DESC LIMIT 80').all() })
  })

  router.post('/issues', (req, res) => {
    const message = cleanText(req.body?.message, 2000).trim()
    if (!message) return res.status(400).json({ message: 'Describe the error before saving a fix.' })
    const source = cleanText(req.body?.source || 'site', 120)
    const fix = cleanText(req.body?.fix, 8000)
    const status = req.body?.status === 'fixed' ? 'fixed' : 'open'
    const result = db.prepare(`
      INSERT INTO admin_issues (source, message, fix, status)
      VALUES (?, ?, ?, ?)
    `).run(source, message, fix, status)
    return res.status(201).json({ id: result.lastInsertRowid, source, message, fix, status })
  })

  router.patch('/issues/:id', (req, res) => {
    const issue = db.prepare('SELECT * FROM admin_issues WHERE id = ?').get(req.params.id)
    if (!issue) return res.status(404).json({ message: 'That issue is not on the board.' })
    const status = req.body?.status === 'fixed' ? 'fixed' : req.body?.status === 'open' ? 'open' : issue.status
    const fix = 'fix' in (req.body || {}) ? cleanText(req.body.fix, 8000) : issue.fix
    db.prepare(`UPDATE admin_issues SET status = ?, fix = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(status, fix, issue.id)
    return res.json({ ...issue, status, fix })
  })

  return router
}

export function readPublicContent(db) {
  ensureAdminTables(db)
  const entries = db.prepare('SELECT key, value FROM admin_content').all()
  return Object.fromEntries(entries.map((entry) => [entry.key, entry.value]))
}

export { soulFields }
