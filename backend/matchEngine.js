const db = require('./db');
const now = () => Date.now();

function recordVote(voterId, targetId, vote) {
  const stmt = db.prepare('INSERT INTO votes (voter_id,target_id,vote,created_at) VALUES (?,?,?,?)');
  stmt.run(voterId, targetId, vote ? 1 : 0, now());
}

function checkMutual(voterId, targetId) {
  const s = db.prepare('SELECT vote FROM votes WHERE voter_id=? AND target_id=? ORDER BY id DESC LIMIT 1');
  const v1 = s.get(voterId, targetId);
  const v2 = s.get(targetId, voterId);
  if (v1 && v2 && v1.vote === 1 && v2.vote === 1) {
    // create match
    const insert = db.prepare('INSERT INTO matches (a,b,score,created_at) VALUES (?,?,?,?)');
    insert.run(voterId, targetId, 1.0, now());
    return true;
  }
  return false;
}

module.exports = { recordVote, checkMutual };
