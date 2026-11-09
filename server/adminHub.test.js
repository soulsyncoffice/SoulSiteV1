import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import Database from 'better-sqlite3'
import { createLocalAuth } from './localSession.js'
import { createAdminRouter, createTelemetry, readPublicContent } from './adminHub.js'

function authHeader(token) {
  return { Authorization: ['Bearer', `local.${token}`].join(' ') }
}

function boot() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE profiles (
      id TEXT PRIMARY KEY, name TEXT, age INTEGER, distance TEXT, intention TEXT,
      energy TEXT, bio TEXT, accent TEXT, profile_values TEXT, tags TEXT, compatibility TEXT
    );
    CREATE TABLE decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, profile_id TEXT,
      decision TEXT, tier TEXT, date_key TEXT
    );
  `)
  db.prepare(`
    INSERT INTO profiles (id, name, age, distance, intention, energy, bio, accent, profile_values, tags, compatibility)
    VALUES ('nova', 'Nova', 29, '8 km away', 'Serious', 'Slow', 'A long note', '#8c8cff', '["Honesty"]', '["Music"]', '{"pace":90}')
  `).run()
  const localAuth = createLocalAuth(db)
  const telemetry = createTelemetry()
  const app = express()
  app.use(express.json())
  app.use(telemetry.middleware)
  app.get('/api/content', (_req, res) => res.json({ overrides: readPublicContent(db) }))
  app.use('/api/admin', createAdminRouter({ db, localAuth, telemetry, dbPath: ':memory:' }))
  return { app, localAuth, telemetry, db }
}

async function withServer(run) {
  const ctx = boot()
  const server = await new Promise((resolve) => {
    const listening = ctx.app.listen(0, '127.0.0.1', () => resolve(listening))
  })
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    await run(base, ctx)
  } finally {
    ctx.telemetry.stop()
    await new Promise((resolve) => server.close(resolve))
  }
}

test('admin pulse and soul edits are rejected for everyone else', async () => {
  await withServer(async (base, { localAuth }) => {
    const blocked = await fetch(`${base}/api/admin/pulse`)
    assert.equal(blocked.status, 401)
    const member = localAuth.register({ username: 'River', password: 'lantern-path', age: 29, adultConfirmed: true })
    const memberPulse = await fetch(`${base}/api/admin/pulse`, {
      headers: authHeader(member.token),
    })
    assert.equal(memberPulse.status, 403)
    const admin = localAuth.login('Admin', '5051')
    const pulse = await fetch(`${base}/api/admin/pulse`, {
      headers: authHeader(admin.token),
    })
    assert.equal(pulse.status, 200)
    const body = await pulse.json()
    assert.equal(body.services[0].status, 'live')
    assert.equal(body.db.souls, 1)
  })
})

test('admin can correct a soul and publish field copy', async () => {
  await withServer(async (base, { localAuth }) => {
    const admin = localAuth.login('Admin', '5051')
    const headers = { ...authHeader(admin.token), 'Content-Type': 'application/json' }
    const edited = await fetch(`${base}/api/admin/souls/nova`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ bio: 'A corrected note from the hub.' }),
    })
    assert.equal(edited.status, 200)
    assert.match((await edited.json()).soul.bio, /corrected note/)
    const copy = await fetch(`${base}/api/admin/content/home.intro`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ value: 'The field is tuned.' }),
    })
    assert.equal(copy.status, 200)
    const pub = await fetch(`${base}/api/content`)
    assert.equal((await pub.json()).overrides['home.intro'], 'The field is tuned.')
    const issue = await fetch(`${base}/api/admin/issues`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ source: 'home.signal', message: 'Signal dropped', fix: 'Retried the field read', status: 'fixed' }),
    })
    assert.equal(issue.status, 201)
  })
})
