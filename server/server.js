import express from 'express';
import helmet from 'helmet';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAdultAccount } from './accountValidation.js';
import { hasContactInformation } from './contentPolicy.js';
import { buildOverviewRequest, parseOverviewResponse } from './overviewGeneration.js';
import { validateProfilePayload } from './profileValidation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = process.env.SOULSITE_DATA_DIR || path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'soulsync.db');
const staticDir = path.resolve(__dirname, '..', 'dist');
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const openAiApiKey = process.env.OPENAI_API_KEY || '';
const overviewModel = process.env.SOULSITE_OVERVIEW_MODEL || 'gpt-4.1-mini';

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    age INTEGER NOT NULL,
    distance TEXT NOT NULL,
    intention TEXT NOT NULL,
    energy TEXT NOT NULL,
    bio TEXT NOT NULL,
    accent TEXT NOT NULL,
    profile_values TEXT NOT NULL,
    tags TEXT NOT NULL,
    compatibility TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    tier TEXT NOT NULL,
    date_key TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS overview_generation_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    requested_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS overview_generation_requests_user_time
    ON overview_generation_requests (user_id, requested_at);
`);

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
    bio: 'I like people whose curiosity feels as alive as their kindness. My ideal first meeting is a quiet venue with good coffee, a long walk, and a space to hear each other without rushing.',
    accent: '#8c8cff',
    compatibility: {
      pace: 92,
      values: 88,
      lifestyle: 85,
      money: 75,
    },
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
    bio: 'I build my life around creative work, honest laughter, and the kind of connection that feels unforced. I prefer to meet somewhere public, warm, and easy to walk away from if the energy isn’t right.',
    accent: '#74e9d8',
    compatibility: {
      pace: 79,
      values: 90,
      lifestyle: 88,
      money: 82,
    },
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
    bio: 'I enjoy people who are thoughtful, grounded, and interested in the deeper texture of a life. I am happiest when conversation flows naturally and plans feel like an invitation, not a performance.',
    accent: '#f4a2ff',
    compatibility: {
      pace: 84,
      values: 93,
      lifestyle: 82,
      money: 73,
    },
  },
];

const insertProfile = db.prepare(`
  INSERT OR REPLACE INTO profiles (
    id, name, age, distance, intention, energy, bio, accent, profile_values, tags, compatibility
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const profile of profiles) {
  insertProfile.run(
    profile.id,
    profile.name,
    profile.age,
    profile.distance,
    profile.intention,
    profile.energy,
    profile.bio,
    profile.accent,
    JSON.stringify(profile.values),
    JSON.stringify(profile.tags),
    JSON.stringify(profile.compatibility),
  );
}

const tierConfig = { Free: 5, Standard: 20, Pro: 50 };

const app = express();
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : null;
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", ...(supabaseOrigin ? [supabaseOrigin] : [])],
      workerSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: null,
    },
  },
}));
app.use(express.json({ limit: '1mb' }));

async function requireAuthentication(req, res, next) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).json({ message: 'Account services are not configured.' });
  }

  const authorization = req.get('authorization') || '';
  const token = authorization.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) {
    return res.status(401).json({ message: 'Sign in to access this profile.' });
  }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      signal: AbortSignal.timeout(10000),
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      return res.status(401).json({ message: 'Your session is invalid or has expired. Sign in again.' });
    }

    const user = await response.json();
    if (!user.id) {
      return res.status(401).json({ message: 'Your session is invalid or has expired. Sign in again.' });
    }

    req.authenticatedUser = user;
    req.accessToken = token;
    return next();
  } catch (error) {
    console.error('Account identity verification failed:', error.message);
    return res.status(503).json({ message: 'Account verification is temporarily unavailable.' });
  }
}

function requireAdultAccount(req, res, next) {
  if (!isAdultAccount(req.authenticatedUser)) {
    return res.status(403).json({ message: 'SoulSite is for adults 18 and over. Account age checks are self-reported.' });
  }
  return next();
}

async function requestPrivateProfile(req, method, payload) {
  if (!supabaseServiceRoleKey) {
    throw new Error('Private profile storage is not configured.');
  }

  const url = new URL(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/private_profiles`);
  url.searchParams.set('select', 'profile,visibility,overview,updated_at');
  url.searchParams.set('id', `eq.${req.authenticatedUser.id}`);

  const headers = {
    apikey: supabaseServiceRoleKey,
    Authorization: `Bearer ${supabaseServiceRoleKey}`,
    Accept: 'application/json',
  };
  if (payload) {
    headers['Content-Type'] = 'application/json';
    headers.Prefer = 'resolution=merge-duplicates,return=representation';
  }

  const response = await fetch(url, {
    method,
    signal: AbortSignal.timeout(10000),
    headers,
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  if (!response.ok) {
    console.error(`Private profile request failed with status ${response.status}.`);
    throw new Error('Profile storage is temporarily unavailable.');
  }
  return response.status === 204 ? [] : response.json();
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const getCompatibilityScore = (profile) => {
  const compatibility = profile.compatibility ?? profile;
  const scores = [
    Number(compatibility.pace ?? 0),
    Number(compatibility.values ?? 0),
    Number(compatibility.lifestyle ?? 0),
    Number(compatibility.money ?? 0),
  ];
  return Math.round(scores.reduce((total, score) => total + score, 0) / scores.length);
};

const getDailyYesCount = (userId, dateKey) => {
  const result = db
    .prepare(`
      SELECT COUNT(*) AS count FROM decisions
      WHERE user_id = ? AND date_key = ? AND decision = 'yes'
    `)
    .get(userId, dateKey);

  return Number(result?.count ?? 0);
};

app.get('/api/config', (_req, res) => {
  res.json({ tiers: tierConfig });
});

app.get('/api/profiles', (_req, res) => {
  const records = db.prepare('SELECT * FROM profiles ORDER BY name').all();
  const serialized = records.map((profile) => ({
    ...profile,
    values: JSON.parse(profile.profile_values),
    tags: JSON.parse(profile.tags),
    compatibility: JSON.parse(profile.compatibility),
    score: getCompatibilityScore(JSON.parse(profile.compatibility)),
  }));
  res.json({ profiles: serialized });
});

app.get('/api/me/profile', requireAuthentication, requireAdultAccount, async (req, res) => {
  try {
    const records = await requestPrivateProfile(req, 'GET');
    const record = records[0];
    return res.json({
      profile: record?.profile ?? {},
      visibility: record?.visibility ?? {},
      overview: record?.overview ?? '',
      updatedAt: record?.updated_at ?? null,
    });
  } catch (error) {
    console.error('Could not load private profile:', error.message);
    return res.status(503).json({ message: error.message });
  }
});

app.put('/api/me/profile', requireAuthentication, requireAdultAccount, async (req, res) => {
  const payload = req.body && typeof req.body === 'object'
    ? {
        ...req.body,
        profile: {
          ...req.body.profile,
          age: req.body.profile?.age || String(req.authenticatedUser.user_metadata?.age ?? ''),
        },
      }
    : req.body;
  const validated = validateProfilePayload(payload);
  if (validated.error) return res.status(400).json({ message: validated.error });
  if (!validated.profile.age) {
    return res.status(400).json({ message: 'Confirm that you are at least 18 by entering your age before saving.' });
  }

  try {
    const records = await requestPrivateProfile(req, 'POST', {
      id: req.authenticatedUser.id,
      profile: validated.profile,
      visibility: validated.visibility,
      overview: validated.overview ?? null,
    });
    const record = records[0];
    if (!record) throw new Error('Profile storage did not confirm the saved profile.');
    return res.json({
      profile: record.profile,
      visibility: record.visibility,
      overview: record.overview,
      updatedAt: record.updated_at,
    });
  } catch (error) {
    console.error('Could not save private profile:', error.message);
    return res.status(503).json({ message: error.message });
  }
});

app.post('/api/me/overview', requireAuthentication, requireAdultAccount, async (req, res) => {
  if (req.body?.consentToExternalProcessing !== true) {
    return res.status(400).json({ message: 'Explicit consent to send your saved profile answers to the configured overview provider is required.' });
  }
  if (!openAiApiKey) {
    return res.status(503).json({ message: 'SoulMind story generation is not configured on this deployment.' });
  }

  const userId = req.authenticatedUser.id;
  db.prepare(`DELETE FROM overview_generation_requests WHERE requested_at < datetime('now', '-1 day')`).run();
  const recentRequests = Number(db.prepare(`
    SELECT COUNT(*) AS count
    FROM overview_generation_requests
    WHERE user_id = ? AND requested_at >= datetime('now', '-1 hour')
  `).get(userId)?.count ?? 0);
  if (recentRequests >= 3) {
    return res.status(429).json({ message: 'SoulMind story requests are limited to three per hour. Please try again later.' });
  }
  db.prepare('INSERT INTO overview_generation_requests (user_id, requested_at) VALUES (?, CURRENT_TIMESTAMP)').run(userId);

  try {
    const records = await requestPrivateProfile(req, 'GET');
    const savedProfile = records[0];
    if (!savedProfile?.profile || !savedProfile.profile.age) {
      return res.status(400).json({ message: 'Save your profile and confirm your age before asking SoulMind to write an overview.' });
    }

    const providerResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(45000),
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: overviewModel,
        messages: buildOverviewRequest(savedProfile.profile),
        response_format: { type: 'json_object' },
        max_completion_tokens: 1000,
        temperature: 0.4,
      }),
    });

    if (!providerResponse.ok) {
      console.error(`SoulMind overview provider returned status ${providerResponse.status}.`);
      return res.status(502).json({ message: 'SoulMind could not reach the story service. Try again later.' });
    }

    const providerPayload = await providerResponse.json();
    const content = providerPayload.choices?.[0]?.message?.content;
    const generated = parseOverviewResponse(content, savedProfile.profile);
    if (generated.status === 'needs_more_information') {
      return res.json(generated);
    }
    if (hasContactInformation(generated.overview)) {
      return res.status(502).json({ message: 'The generated draft included contact details and was not saved. Review your profile answers and try again.' });
    }

    const updated = await requestPrivateProfile(req, 'POST', {
      id: req.authenticatedUser.id,
      profile: savedProfile.profile,
      visibility: savedProfile.visibility,
      overview: generated.overview,
    });
    if (!updated[0]) throw new Error('Profile storage did not confirm the saved overview.');

    return res.json({
      status: 'ready',
      overview: updated[0].overview,
      updatedAt: updated[0].updated_at,
    });
  } catch (error) {
    console.error('Could not generate a private profile overview:', error.message);
    return res.status(502).json({ message: error.message.includes('exactly 500 words')
      ? error.message
      : 'SoulMind could not finish the story. Add more specific profile details and try again.' });
  }
});

app.delete('/api/me/account', requireAuthentication, async (req, res) => {
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/delete_own_auth_user`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${req.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    if (!response.ok) {
      console.error(`Account deletion request failed with status ${response.status}.`);
      return res.status(503).json({ message: 'Account deletion is temporarily unavailable.' });
    }
    db.prepare('DELETE FROM overview_generation_requests WHERE user_id = ?').run(req.authenticatedUser.id);
    return res.status(204).end();
  } catch (error) {
    console.error('Could not delete account:', error.message);
    return res.status(503).json({ message: 'Account deletion is temporarily unavailable.' });
  }
});

app.delete('/api/me/profile', requireAuthentication, async (req, res) => {
  try {
    await requestPrivateProfile(req, 'DELETE');
    return res.status(204).end();
  } catch (error) {
    console.error('Could not delete private profile:', error.message);
    return res.status(503).json({ message: error.message });
  }
});

app.post('/api/decision', (req, res) => {
  const { userId = 'demo-user', profileId, action, tier = 'Free' } = req.body ?? {};

  if (!profileId || !['yes', 'no'].includes(action)) {
    return res.status(400).json({ message: 'profileId and a valid yes/no action are required.' });
  }

  const dateKey = new Date().toISOString().slice(0, 10);
  const limit = tierConfig[tier] ?? tierConfig.Free;
  const usedToday = getDailyYesCount(userId, dateKey);

  if (action === 'yes' && usedToday >= limit) {
    return res.status(429).json({
      message: 'Daily YES limit reached for this tier.',
      remaining: 0,
      limit,
    });
  }

  const profile = profiles.find((entry) => entry.id === profileId);
  if (!profile) {
    return res.status(404).json({ message: 'Profile not found.' });
  }

  db.prepare(`
    INSERT INTO decisions (user_id, profile_id, decision, tier, date_key)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, profileId, action, tier, dateKey);

  const score = getCompatibilityScore(profile);

  if (action === 'yes') {
    const remaining = Math.max(limit - (usedToday + 1), 0);
    const match = score >= 85
      ? {
          label: 'Compatibility window open',
          venue: 'Moonlit rooftop cinema',
          time: 'Saturday • 7:30 PM',
        }
      : null;

    return res.json({
      message: match
        ? 'Mutual sync detected. Date planning is available.'
        : 'Interested. Compatibility is being reviewed.',
      remaining,
      limit,
      match,
      score,
    });
  }

  return res.json({
    message: 'Profile dismissed without revealing identity.',
    remaining: Math.max(limit - usedToday, 0),
    limit,
    score,
  });
});

app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'API route not found.' });
});

app.use(express.static(staticDir));

app.use((req, res, next) => {
  if (req.method !== 'GET' || !req.accepts('html')) {
    return next();
  }

  res.sendFile(path.join(staticDir, 'index.html'), (error) => {
    if (error) next(error);
  });
});

const port = Number(process.env.PORT || 3001);
app.listen(port, '0.0.0.0', () => {
  console.log(`SoulSite server running on port ${port}`);
});
