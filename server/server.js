import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = process.env.SOULSITE_DATA_DIR || path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'soulsync.db');
const staticDir = path.resolve(__dirname, '..', 'dist');
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim();
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

const configuredSupabaseValues = [supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey];
if (configuredSupabaseValues.some(Boolean) && !configuredSupabaseValues.every(Boolean)) {
  throw new Error('Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY together.');
}

if (supabaseUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new Error('SUPABASE_URL must be a valid URL.');
  }
  if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
    throw new Error('SUPABASE_URL must use HTTPS or HTTP.');
  }
}

const authEnabled = Boolean(supabaseUrl);
const supabaseAuthClient = authEnabled
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    })
  : null;
const supabaseAdminClient = authEnabled
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    })
  : null;

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
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', authEnabled });
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

async function authenticateRequest(req, res) {
  const authorization = req.get('authorization') || '';
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch?.[1].trim()) {
    res.status(401).json({ message: 'Sign in to save your decision.' });
    return null;
  }

  const accessToken = tokenMatch[1].trim();
  try {
    const { data, error } = await supabaseAuthClient.auth.getUser(accessToken);
    if (error || !data?.user) {
      res.status(401).json({ message: 'Your sign-in has expired. Please sign in again.' });
      return null;
    }

    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    return { user: data.user, client };
  } catch (error) {
    console.error('Supabase authentication verification failed:', error);
    res.status(503).json({ message: 'Authentication service is temporarily unavailable.' });
    return null;
  }
}

async function getAuthenticatedYesCount(client, userId, dateKey) {
  const { count, error } = await client
    .from('decisions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('date_key', dateKey)
    .eq('decision', 'yes');

  if (error) {
    console.error('Could not read authenticated decision count:', error);
    throw new Error('Decision storage is temporarily unavailable.');
  }
  return Number(count ?? 0);
}

app.get('/api/decision/usage', async (req, res) => {
  if (!authEnabled) {
    return res.status(404).json({ message: 'Authenticated usage is not enabled.' });
  }
  const auth = await authenticateRequest(req, res);
  if (!auth) return;

  try {
    const dateKey = new Date().toISOString().slice(0, 10);
    const usedToday = await getAuthenticatedYesCount(auth.client, auth.user.id, dateKey);
    return res.json({ usedToday });
  } catch (error) {
    console.error(error.message);
    return res.status(503).json({ message: error.message });
  }
});

app.get('/api/config', (_req, res) => {
  res.json({ tiers: tierConfig, authEnabled });
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

app.post('/api/decision', async (req, res) => {
  const { userId = 'demo-user', profileId, action, tier = 'Free' } = req.body ?? {};

  if (typeof profileId !== 'string' || !profileId || !['yes', 'no'].includes(action)) {
    return res.status(400).json({ message: 'profileId and a valid yes/no action are required.' });
  }

  const profile = profiles.find((entry) => entry.id === profileId);
  if (!profile) {
    return res.status(404).json({ message: 'Profile not found.' });
  }

  const normalizedTier = Object.hasOwn(tierConfig, tier) ? tier : 'Free';
  const dateKey = new Date().toISOString().slice(0, 10);
  const limit = tierConfig[normalizedTier];
  let ownerId = userId;
  let userClient;
  let usedToday;

  if (authEnabled) {
    const auth = await authenticateRequest(req, res);
    if (!auth) return;
    ownerId = auth.user.id;
    userClient = auth.client;
    try {
      usedToday = await getAuthenticatedYesCount(userClient, ownerId, dateKey);
    } catch (error) {
      console.error(error.message);
      return res.status(503).json({ message: error.message });
    }
  } else {
    usedToday = getDailyYesCount(ownerId, dateKey);
  }

  if (action === 'yes' && usedToday >= limit) {
    return res.status(429).json({
      message: 'Daily YES limit reached for this tier.',
      remaining: 0,
      limit,
    });
  }

  if (authEnabled) {
    const { error } = await supabaseAdminClient.from('decisions').insert({
      user_id: ownerId,
      profile_id: profileId,
      decision: action,
      tier: normalizedTier,
      date_key: dateKey,
    });
    if (error) {
      if (error.code === '23514' && error.message.includes('daily_yes_limit_reached')) {
        return res.status(429).json({
          message: 'Daily YES limit reached for this tier.',
          remaining: 0,
          limit,
        });
      }
      console.error('Could not save authenticated decision:', error);
      return res.status(503).json({ message: 'Decision storage is temporarily unavailable.' });
    }
  } else {
    db.prepare(`
      INSERT INTO decisions (user_id, profile_id, decision, tier, date_key)
      VALUES (?, ?, ?, ?, ?)
    `).run(ownerId, profileId, action, normalizedTier, dateKey);
  }

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

app.use((error, _req, res, next) => {
  console.error('Unhandled request error:', error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ message: 'The request could not be completed.' });
});

const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer from 1 to 65535.');
}
app.listen(port, '0.0.0.0', () => {
  console.log(`SoulSite server running on port ${port}`);
});
