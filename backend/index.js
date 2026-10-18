const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./db');
const { recordVote, checkMutual } = require('./matchEngine');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.post('/api/profile', (req, res) => {
  const id = crypto.randomUUID();
  const { orb, tags } = req.body;
  const stmt = db.prepare('INSERT INTO profiles (id,orb,tags,created_at) VALUES (?,?,?,?)');
  stmt.run(id, JSON.stringify(orb||{}), (tags||'').join(','), Date.now());
  res.json({ id });
});

app.post('/api/report', (req, res) => {
  const { reporter_id, target_id, reason } = req.body;
  const stmt = db.prepare('INSERT INTO reports (reporter_id,target_id,reason,created_at) VALUES (?,?,?,?)');
  stmt.run(reporter_id, target_id, reason||'', Date.now());
  res.json({ ok: true });
});

app.get('/api/candidates', (req,res)=>{
  const exclude = req.query.exclude || '';
  const stmt = db.prepare('SELECT id, orb, tags FROM profiles WHERE id != ? ORDER BY RANDOM() LIMIT 5');
  const rows = stmt.all(exclude).map(r => ({ id: r.id, orb: JSON.parse(r.orb||'{}'), tags: (r.tags||'').split(',') }));
  res.json(rows);
});

app.post('/api/vote', (req,res)=>{
  const { voter_id, target_id, vote } = req.body;
  recordVote(voter_id, target_id, !!vote);
  const matched = checkMutual(voter_id, target_id);
  if (matched) {
    io.to(voter_id).emit('match', { with: target_id });
    io.to(target_id).emit('match', { with: voter_id });
  }
  res.json({ ok: true, matched });
});

io.on('connection', socket => {
  // use socket.id as ephemeral user id for prototype; clients should map to server profile id
  socket.on('identify', (profileId) => {
    socket.join(profileId);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log('Server running on port',PORT));
