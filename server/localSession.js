import crypto from 'node:crypto'

export const ADMIN_USERNAME = 'Admin'
export const ADMIN_PASSWORD = '5051'

const plans = {
  Free: { yesLimit: 5, voiceMessages: 0, calls: false, events: false },
  Standard: { yesLimit: 20, voiceMessages: 10, calls: false, events: true },
  Pro: { yesLimit: 50, voiceMessages: 30, calls: true, events: true },
  Unlimited: { yesLimit: null, voiceMessages: null, calls: true, events: true },
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(password), salt, 32).toString('hex') }
}

export function verifyPassword(password, salt, hash) {
  const next = crypto.scryptSync(String(password), salt, 32)
  const stored = Buffer.from(hash, 'hex')
  if (next.length !== stored.length) return false
  return crypto.timingSafeEqual(next, stored)
}

function safeEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue))
  const right = Buffer.from(String(rightValue))
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

export function createLocalAuth(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_accounts (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      age INTEGER NOT NULL,
      adult_confirmed INTEGER NOT NULL,
      role TEXT NOT NULL,
      area TEXT,
      map_visible INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS local_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS local_profiles (
      id TEXT PRIMARY KEY,
      profile_json TEXT NOT NULL,
      visibility_json TEXT NOT NULL,
      overview TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const findAccount = db.prepare('SELECT * FROM local_accounts WHERE username = ?')
  const insertAccount = db.prepare(`
    INSERT INTO local_accounts (id, username, password_hash, salt, age, adult_confirmed, role)
    VALUES (?, ?, ?, ?, ?, 1, 'member')
  `)
  const insertSession = db.prepare('INSERT INTO local_sessions (token_hash, user_id) VALUES (?, ?)')
  const findSession = db.prepare(`
    SELECT s.user_id, a.username, a.age, a.adult_confirmed, a.role, a.area, a.map_visible
    FROM local_sessions s
    LEFT JOIN local_accounts a ON a.id = s.user_id
    WHERE s.token_hash = ?
  `)
  const deleteSession = db.prepare('DELETE FROM local_sessions WHERE token_hash = ?')

  function publicUser(row, role = row?.role || 'member') {
    const isAdmin = role === 'admin'
    return {
      id: row?.id || row?.user_id || 'admin',
      username: isAdmin ? ADMIN_USERNAME : row.username,
      role: isAdmin ? 'admin' : 'member',
      age: isAdmin ? 30 : row.age,
      adultConfirmed: true,
      plans: isAdmin ? plans : { Free: plans.Free },
      activePlan: isAdmin ? 'Unlimited' : 'Free',
      features: {
        swipe: true,
        profile: true,
        map: true,
        settings: true,
        icebreakers: true,
        journal: true,
        reflections: true,
        datePlanning: true,
        activities: true,
        music: true,
        safety: true,
        progression: true,
        feedback: true,
        voice: isAdmin,
        calls: isAdmin,
        events: isAdmin,
        allPlans: isAdmin,
      },
    }
  }

  function issueSession(userId) {
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    insertSession.run(tokenHash, userId)
    return token
  }

  return {
    plans,
    register({ username, password, age, adultConfirmed }) {
      const name = String(username || '').trim()
      if (!name || name.length > 60) return { error: 'Choose a name between 1 and 60 characters.' }
      if (name.toLowerCase() === 'admin') return { error: 'That name is reserved.' }
      if (String(password || '').length < 8) return { error: 'Use a password of at least 8 characters.' }
      const numericAge = Number(age)
      if (adultConfirmed !== true || !Number.isInteger(numericAge) || numericAge < 18 || numericAge > 120) {
        return { error: 'SoulSite is for adults 18 and over. Confirm your age to create an account.' }
      }
      if (findAccount.get(name)) return { error: 'That name is already in the field. Sign in instead.' }
      const id = crypto.randomUUID()
      const { salt, hash } = hashPassword(password)
      insertAccount.run(id, name, hash, salt, numericAge)
      const token = issueSession(id)
      return { token, user: publicUser(findAccount.get(name)) }
    },
    login(username, password) {
      if (safeEqual(username, ADMIN_USERNAME) && safeEqual(password, ADMIN_PASSWORD)) {
        const token = issueSession('admin')
        return { token, user: publicUser({ id: 'admin' }, 'admin') }
      }
      const account = findAccount.get(String(username || '').trim())
      if (!account || !verifyPassword(password, account.salt, account.password_hash)) {
        return { error: 'Those sign-in details do not match a SoulSite account.' }
      }
      const token = issueSession(account.id)
      return { token, user: publicUser(account) }
    },
    readToken(token) {
      if (!token) return null
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
      const row = findSession.get(tokenHash)
      if (!row) return null
      if (row.user_id === 'admin') return publicUser({ id: 'admin' }, 'admin')
      if (!row.username) return null
      return publicUser(row)
    },
    revoke(token) {
      if (!token) return
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
      deleteSession.run(tokenHash)
    },
    saveProfile(userId, profile, visibility, overview = null) {
      db.prepare(`
        INSERT INTO local_profiles (id, profile_json, visibility_json, overview, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          profile_json = excluded.profile_json,
          visibility_json = excluded.visibility_json,
          overview = excluded.overview,
          updated_at = CURRENT_TIMESTAMP
      `).run(userId, JSON.stringify(profile), JSON.stringify(visibility), overview)
      return this.readProfile(userId)
    },
    readProfile(userId) {
      const row = db.prepare('SELECT * FROM local_profiles WHERE id = ?').get(userId)
      if (!row) return { profile: {}, visibility: {}, overview: '', updated_at: null }
      return {
        profile: JSON.parse(row.profile_json),
        visibility: JSON.parse(row.visibility_json),
        overview: row.overview || '',
        updated_at: row.updated_at,
      }
    },
    deleteProfile(userId) {
      db.prepare('DELETE FROM local_profiles WHERE id = ?').run(userId)
    },
    deleteAccount(userId) {
      if (userId === 'admin') return false
      db.prepare('DELETE FROM local_profiles WHERE id = ?').run(userId)
      db.prepare('DELETE FROM local_sessions WHERE user_id = ?').run(userId)
      db.prepare('DELETE FROM local_accounts WHERE id = ?').run(userId)
      return true
    },
    setPresence(userId, area, visible) {
      if (userId === 'admin') return
      db.prepare('UPDATE local_accounts SET area = ?, map_visible = ? WHERE id = ?').run(area, visible ? 1 : 0, userId)
    },
    visibleMembers() {
      return db.prepare(`
        SELECT id, username, area FROM local_accounts
        WHERE map_visible = 1 AND area IS NOT NULL
      `).all()
    },
  }
}
