import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = process.env.SOULSITE_DATA_DIR || path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'soulsync.db');
const staticDir = path.resolve(__dirname, '..', 'dist');

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
  res.json({ status: 'ok' });
});

const getCompatibilityScore = (profile) => {
  const compatibility = profile.compatibility ?? {};
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
