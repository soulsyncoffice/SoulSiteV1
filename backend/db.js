const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname,'soulsync.sqlite'));

db.exec(`
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  orb JSON,
  tags TEXT,
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id TEXT,
  target_id TEXT,
  vote INTEGER,
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  a TEXT,
  b TEXT,
  score REAL,
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id TEXT,
  target_id TEXT,
  reason TEXT,
  created_at INTEGER
);
`);

module.exports = db;
