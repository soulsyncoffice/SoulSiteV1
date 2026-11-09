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
import { createLocalAuth } from './localSession.js';
import { areaById, areaForProfile, mapAreas } from './mapAreas.js';

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
  {
    id: 'mica',
    name: 'Mica',
    age: 34,
    distance: 'Glass Orchard',
    intention: 'A steady, curious companionship',
    energy: 'Studio mornings, soup for friends, unhurried texts',
    tags: ['Ceramics', 'Crosswords', 'Rain walks'],
    values: ['Repair over performance', 'Shared silence', 'Gentle humor'],
    bio: 'I am at my best when a conversation can wander without anyone trying to win it. I like making things with my hands and learning how other people spend an ordinary Tuesday.',
    accent: '#f2c14e',
    compatibility: { pace: 86, values: 91, lifestyle: 80, money: 77 },
  },
  {
    id: 'oren',
    name: 'Oren',
    age: 28,
    distance: 'Moonmarket',
    intention: 'Friendship that might turn romantic',
    energy: 'Night markets, playlists, spontaneous museums',
    tags: ['Street food', 'Film scores', 'Board games'],
    values: ['Warm honesty', 'Shared curiosity', 'No rush'],
    bio: 'I collect small rituals: a good dumpling, a film I can quote badly, and people who text back when they mean it. I am looking for someone who can be playful and sincere in the same evening.',
    accent: '#ff8b6a',
    compatibility: { pace: 74, values: 83, lifestyle: 90, money: 70 },
  },
  {
    id: 'juniper',
    name: 'Juniper',
    age: 36,
    distance: 'Northline Gardens',
    intention: 'Serious relationship',
    energy: 'Garden plots, long letters, early nights',
    tags: ['Growing things', 'Libraries', 'Folk music'],
    values: ['Steadiness', 'Kind boundaries', 'Showing up'],
    bio: 'I have a soft spot for people who notice the weather and still keep their promises. My ideal connection has room for quiet, for jokes, and for telling the truth without making it a performance.',
    accent: '#8fd18a',
    compatibility: { pace: 90, values: 94, lifestyle: 86, money: 81 },
  },
  {
    id: 'sable',
    name: 'Sable',
    age: 32,
    distance: 'Harbor District',
    intention: 'Slow dating with a clear heart',
    energy: 'Ferry rides, notebooks, one good question',
    tags: ['Writing', 'Swimming', 'Jazz bars'],
    values: ['Direct kindness', 'Emotional range', 'Shared effort'],
    bio: 'I like people who can say what they want without shrinking the other person. I am affectionate, a little nocturnal, and happiest when plans feel chosen rather than performed.',
    accent: '#7aa2ff',
    compatibility: { pace: 81, values: 88, lifestyle: 76, money: 84 },
  },
  {
    id: 'quill',
    name: 'Quill',
    age: 30,
    distance: 'Lantern Quarter',
    intention: 'Dating with room to become serious',
    energy: 'Bookshops, late tea, collaborative playlists',
    tags: ['Poetry', 'Cooking', 'Trivia'],
    values: ['Wit with warmth', 'Consent', 'Curiosity'],
    bio: 'I am the person who will ask a slightly odd question and then actually listen to the answer. I want a connection that can hold both tenderness and a well-timed joke.',
    accent: '#e7a0ff',
    compatibility: { pace: 78, values: 89, lifestyle: 84, money: 73 },
  },
  {
    id: 'moss',
    name: 'Moss',
    age: 27,
    distance: 'Cedar Ridge',
    intention: 'Friendship first, romance if it fits',
    energy: 'Trail mornings, thrift finds, low-stakes hangouts',
    tags: ['Hiking', 'Thrifting', 'Birds'],
    values: ['Ease', 'Honesty', 'Outside time'],
    bio: 'I do not need a grand story on day one. I like walking until the conversation gets interesting, then seeing whether we both want to do it again.',
    accent: '#74e9d8',
    compatibility: { pace: 83, values: 80, lifestyle: 92, money: 76 },
  },
  {
    id: 'indigo',
    name: 'Indigo',
    age: 33,
    distance: 'Glass Orchard',
    intention: 'A thoughtful relationship',
    energy: 'Rehearsal rooms, shared cooking, Sunday resets',
    tags: ['Choir', 'Baking', 'City walks'],
    values: ['Harmony', 'Follow-through', 'Soft ambition'],
    bio: 'I care about how people treat the unglamorous parts of a week. I am looking for someone who can be romantic without losing their practical kindness.',
    accent: '#9b8cff',
    compatibility: { pace: 88, values: 90, lifestyle: 85, money: 79 },
  },
  {
    id: 'pebble',
    name: 'Pebble',
    age: 26,
    distance: 'Moonmarket',
    intention: 'Light dating with emotional honesty',
    energy: 'Arcade nights, zines, spontaneous picnics',
    tags: ['Zines', 'Arcade games', 'Picnics'],
    values: ['Play', 'Clear asks', 'No scorekeeping'],
    bio: 'I am playful, a bit chaotic, and surprisingly punctual. I want someone who can be silly in public and gentle when the day has been long.',
    accent: '#ffb4d9',
    compatibility: { pace: 70, values: 82, lifestyle: 87, money: 68 },
  },
  {
    id: 'lumen',
    name: 'Lumen',
    age: 38,
    distance: 'Northline Gardens',
    intention: 'Serious relationship',
    energy: 'Dawn swims, community dinners, long-range plans',
    tags: ['Swimming', 'Volunteering', 'Astronomy'],
    values: ['Patience', 'Shared responsibility', 'Wonder'],
    bio: 'I have learned to move slowly and mean it. I am drawn to people who can talk about the future without turning it into a test.',
    accent: '#f4a2ff',
    compatibility: { pace: 93, values: 91, lifestyle: 84, money: 86 },
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
app.use(express.json({ limit: '4mb' }));

const localAuth = createLocalAuth(db);

function readLocalToken(req) {
  const authorization = req.get('authorization') || '';
  const token = authorization.match(/^Bearer\s+local\.(\S+)$/i)?.[1];
  return token ? localAuth.readToken(token) : null;
}

async function requireAuthentication(req, res, next) {
  const localUser = readLocalToken(req);
  if (localUser) {
    req.authenticatedUser = {
      id: localUser.id,
      email: localUser.username,
      app_metadata: { provider: 'local' },
      user_metadata: {
        age: localUser.age,
        adult_confirmed: true,
        role: localUser.role,
      },
    };
    req.localUser = localUser;
    return next();
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(401).json({ message: 'Sign in to continue.' });
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

app.post('/api/session/register', (req, res) => {
  const result = localAuth.register(req.body || {});
  if (result.error) return res.status(400).json({ message: result.error });
  return res.status(201).json(result);
});

app.post('/api/session/login', (req, res) => {
  const result = localAuth.login(req.body?.username, req.body?.password);
  if (result.error) return res.status(401).json({ message: result.error });
  return res.json(result);
});

app.get('/api/session', (req, res) => {
  const user = readLocalToken(req);
  if (!user) return res.status(401).json({ message: 'Sign in to continue.' });
  return res.json({ user });
});

app.delete('/api/session', (req, res) => {
  const token = (req.get('authorization') || '').match(/^Bearer\s+local\.(\S+)$/i)?.[1];
  localAuth.revoke(token);
  return res.status(204).end();
});

app.get('/api/map', (_req, res) => {
  const records = db.prepare('SELECT id, name, intention, accent, age FROM profiles').all();
  const members = localAuth.visibleMembers();
  const areas = mapAreas.map((area) => {
    const souls = records
      .filter((profile) => areaForProfile(profile.id) === area.id)
      .map((profile) => ({
        id: profile.id,
        name: profile.name,
        intention: profile.intention,
        accent: profile.accent,
        age: profile.age,
      }));
    const locals = members
      .filter((member) => member.area === area.id)
      .map((member) => ({
        id: member.id,
        name: member.username,
        intention: 'Signed-in soul',
        accent: '#c5b9ff',
        age: null,
      }));
    const people = [...souls, ...locals];
    return { ...area, count: people.length, souls: people };
  });
  res.json({
    areas,
    total: areas.reduce((sum, area) => sum + area.count, 0),
    note: 'Locations are coarse areas only. SoulSite never shows an exact address or live coordinates.',
  });
});

app.get('/api/profiles', (_req, res) => {
  const records = db.prepare('SELECT * FROM profiles ORDER BY name').all();
  const serialized = records.map((profile) => {
    const area = areaById(areaForProfile(profile.id));
    return {
      ...profile,
      values: JSON.parse(profile.profile_values),
      tags: JSON.parse(profile.tags),
      compatibility: JSON.parse(profile.compatibility),
      score: getCompatibilityScore(JSON.parse(profile.compatibility)),
      areaId: area?.id || null,
      areaName: area?.name || 'Somewhere in the field',
    };
  });
  res.json({ profiles: serialized });
});

app.get('/api/me/profile', requireAuthentication, requireAdultAccount, async (req, res) => {
  if (req.localUser) {
    const saved = localAuth.readProfile(req.localUser.id);
    return res.json({
      profile: saved.profile,
      visibility: saved.visibility,
      overview: saved.overview,
      updatedAt: saved.updated_at,
    });
  }
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

  if (req.localUser) {
    const saved = localAuth.saveProfile(req.localUser.id, validated.profile, validated.visibility, validated.overview);
    return res.json({
      profile: saved.profile,
      visibility: saved.visibility,
      overview: saved.overview,
      updatedAt: saved.updated_at,
    });
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
    const records = req.localUser
      ? [localAuth.readProfile(req.localUser.id)]
      : await requestPrivateProfile(req, 'GET');
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

    const updated = req.localUser
      ? [localAuth.saveProfile(req.localUser.id, savedProfile.profile, savedProfile.visibility, generated.overview)]
      : await requestPrivateProfile(req, 'POST', {
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
  if (req.localUser) {
    if (req.localUser.role === 'admin') {
      return res.status(403).json({ message: 'The admin account cannot be deleted from the field.' });
    }
    localAuth.deleteAccount(req.localUser.id);
    db.prepare('DELETE FROM overview_generation_requests WHERE user_id = ?').run(req.localUser.id);
    return res.status(204).end();
  }
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
  if (req.localUser) {
    localAuth.deleteProfile(req.localUser.id);
    return res.status(204).end();
  }
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

  const actor = readLocalToken(req);
  if (action === 'yes' && actor?.role !== 'admin' && usedToday >= limit) {
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
