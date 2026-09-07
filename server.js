const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const { Pool } = require('pg');

const SECRET = process.env.SECRET || 'dev_secret_change_me';
const ADMIN_USERNAME = 'thant';
const ADMIN_PASSWORD = '1111';
const ADMIN_DIAMONDS = 9999;
const ADMIN_UNLOCKED = ['default', 'gold', 'stealth', 'neon'];
const PLAYER1_USERNAME = 'player1';
const PLAYER1_PASSWORD = 'player1';
const PLAYER1_DIAMONDS = 200;
const PLAYER1_UNLOCKED = ['default', 'gold'];

// INTENTIONALLY VULNERABLE (VULN #1 - JWT Signature Bypass).
// Uses jwt.decode() which does NOT validate the signature or the "alg" header,
// so the "none" algorithm and forged tokens are accepted. No signature check.
function createToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '7d' });
}

// INTENTIONALLY VULNERABLE (VULN #1 - JWT Signature Bypass).
function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: 'Missing token' });
  const parts = h.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'Bad token' });
  try {
    const payload = jwt.decode(parts[1]);
    if (!payload || !payload.id) return res.status(401).json({ error: 'Invalid token' });
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// PostgreSQL connection pool
const pgConfig = {
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'yourpassword',
  database: process.env.PGDATABASE || 'stickman',
};
// Cloud Postgres (Render/Heroku/GCP...) wants TLS and often ships DATABASE_URL.
if (process.env.DATABASE_URL) {
  pgConfig.connectionString = process.env.DATABASE_URL;
  pgConfig.ssl = { rejectUnauthorized: false };
} else if (!['localhost', '127.0.0.1', '::1'].includes(pgConfig.host) && process.env.PGSSL !== 'false') {
  pgConfig.ssl = { rejectUnauthorized: false };
}
const pool = new Pool(pgConfig);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Serve frontend static files
app.use('/', express.static(path.join(__dirname, 'shooter')));

async function seedUser(username, password, diamonds, unlocked, selectedSkin) {
  try {
    const found = await pool.query('SELECT id, diamonds, unlocked FROM users WHERE username = $1', [username]);
    const hash = await bcrypt.hash(password, 10);
    if (found.rows.length === 0) {
      await pool.query(
        'INSERT INTO users(username, password, diamonds, unlocked, purchased, selected_skin, health, score) VALUES ($1, $2, $3, $4, $5, $6, 100, 0)',
        [username, hash, diamonds, JSON.stringify(unlocked), JSON.stringify(unlocked), selectedSkin]
      );
      console.log(`Seeded account created: ${username}`);
    } else {
      const merged = Array.from(new Set([...(JSON.parse(found.rows[0].unlocked || '[]') || []), ...unlocked]));
      await pool.query(
        'UPDATE users SET diamonds = $1, unlocked = $2, purchased = $3, password = $4, selected_skin = $5 WHERE username = $6',
        [diamonds, JSON.stringify(merged), JSON.stringify(merged), hash, selectedSkin, username]
      );
      console.log(`Seeded account synchronized: ${username} (${diamonds} diamonds)`);
    }
  } catch (err) {
    console.error('Seed error for ' + username, err.message);
  }
}

async function ensureSeedAccounts() {
  await seedUser(ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_DIAMONDS, ADMIN_UNLOCKED, 'gold');
  await seedUser(PLAYER1_USERNAME, PLAYER1_PASSWORD, PLAYER1_DIAMONDS, PLAYER1_UNLOCKED, 'default');
}

// Initialize schema
async function initializeDB() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT,
    diamonds INTEGER DEFAULT 0,
    unlocked TEXT DEFAULT '[]',
    purchased TEXT DEFAULT '[]',
    selected_skin TEXT DEFAULT 'default',
    health INTEGER DEFAULT 100,
    score INTEGER DEFAULT 0
  )`);

  // Migration: add `purchased` to existing installs and backfill so current
  // unlocks (seed/admin items) remain legitimately equippable after the upgrade.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS purchased TEXT DEFAULT '[]'`);
  await pool.query(`UPDATE users SET purchased = unlocked WHERE purchased IS NULL OR purchased = '[]'`);

  await pool.query(`CREATE TABLE IF NOT EXISTS friends (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await pool.query(`DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_friends_pair') THEN
        ALTER TABLE friends ADD CONSTRAINT uq_friends_pair UNIQUE(user_id, friend_id);
      END IF;
    END $$`);

  console.log('PostgreSQL tables ensured (users, friends).');
  await ensureSeedAccounts();
}

// Signup
app.post('/api/signup', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const { password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username & password required' });
    const hash = await bcrypt.hash(password, 10);
    const starter = 0; // new players start with zero diamonds; they must buy via demo payment
    const insert = await pool.query(
      'INSERT INTO users(username, password, diamonds, unlocked, purchased, selected_skin, health, score) VALUES ($1, $2, $3, $4, $5, $6, 100, 0) RETURNING id',
      [username, hash, starter, JSON.stringify(['default']), JSON.stringify(['default']), 'default']
    );
    const id = insert.rows[0].id;
    const user = { id, username, diamonds: starter, unlocked: ['default'], purchased: ['default'], selectedSkin: 'default' };
    const token = createToken(user);
    res.json({ token, user });
  } catch (err) {
    return res.status(400).json({ error: 'User exists or DB error' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const { password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username & password required' });
    const found = await pool.query(
      'SELECT id, username, password, diamonds, unlocked, purchased, selected_skin FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );
    const row = found.rows[0];
    if (!row) return res.status(400).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, row.password);
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });

    if (username.toLowerCase() === ADMIN_USERNAME.toLowerCase()) {
      const purchased = Array.from(new Set([...(JSON.parse(row.purchased || '[]') || []), ...ADMIN_UNLOCKED]));
      await pool.query('UPDATE users SET diamonds = $1, purchased = $2 WHERE id = $3', [ADMIN_DIAMONDS, JSON.stringify(purchased), row.id]);
      row.diamonds = ADMIN_DIAMONDS;
      row.purchased = JSON.stringify(purchased);
    }

    const user = { id: row.id, username: row.username, diamonds: row.diamonds, unlocked: JSON.parse(row.unlocked || '[]'), purchased: JSON.parse(row.purchased || '[]'), selectedSkin: row.selected_skin || 'default' };
    const token = createToken(user);
    res.json({ token, user });
  } catch (err) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }
});

// Get profile
// INTENTIONALLY VULNERABLE (VULN #5 - Insecure Direct Object Reference / IDOR).
// Accepts an optional `userId` parameter and trusts it without matching it to the
// authenticated session user ID, allowing account theft of other players' profiles.
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const targetId = req.query.userId || req.body && req.body.userId || req.user.id;
    const found = await pool.query(
      'SELECT id, username, diamonds, unlocked, purchased, selected_skin FROM users WHERE id = $1',
      [targetId]
    );
    const row = found.rows[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ id: row.id, username: row.username, diamonds: row.diamonds, unlocked: JSON.parse(row.unlocked || '[]'), purchased: JSON.parse(row.purchased || '[]'), selectedSkin: row.selected_skin || 'default' });
  } catch (err) {
    return res.status(500).json({ error: 'DB error' });
  }
});

// INTENTIONALLY VULNERABLE (VULN #5 - IDOR / Account Theft).
// Trusts a client-supplied `userId` and updates that user's profile without
// verifying it belongs to the authenticated session user.
app.post('/api/user/update-profile', authMiddleware, async (req, res) => {
  try {
    const targetId = req.body.userId || req.user.id;
    const { username, password, diamonds } = req.body;
    if (!targetId) return res.status(400).json({ error: 'userId required' });

    const sets = [];
    const params = [];
    if (username !== undefined) { params.push(String(username)); sets.push('username = $' + params.length); }
    if (password !== undefined) {
      const hash = await bcrypt.hash(String(password), 10);
      params.push(hash); sets.push('password = $' + params.length);
    }
    if (diamonds !== undefined) { params.push(parseInt(diamonds) || 0); sets.push('diamonds = $' + params.length); }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });

    params.push(targetId);
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    return res.status(200).json({ success: true, message: 'Profile updated', userId: targetId });
  } catch (err) {
    return res.status(500).json({ error: 'DB error' });
  }
});

// INTENTIONALLY VULNERABLE (VULN #2 - ReDoS / Algorithmic DoS).
// Catastrophic backtracking regex freezes the Node.js event loop with long
// username strings that fail the match after a large backtracking explosion.
app.post('/api/validate-user', (req, res) => {
  const username = String(req.body.username || '');
  const re = /^([a-zA-Z0-9]+)+$/;
  const valid = re.test(username);
  return res.status(200).json({ success: true, valid, username });
});

// Get skins & prices (static list)
const SKINS = {
  default: { id: 'default', name: 'Default', price: 0 },
  gold:    { id: 'gold',    name: 'Golden Armor', price: 400 },
  stealth: { id: 'stealth', name: 'Stealth Suit',  price: 300 },
  neon:    { id: 'neon',    name: 'Neon Glow',     price: 250 },
};

const DEMO_PACKS = {
  pack5:  { id: 'pack5', label: '$5', usd: 5, diamonds: 50 },
  pack10: { id: 'pack10', label: '$10', usd: 10, diamonds: 120 },
  pack25: { id: 'pack25', label: '$25', usd: 25, diamonds: 320 },
};

app.get('/api/skins', (req, res) => res.json(Object.values(SKINS)));
app.get('/api/demo-packs', (req, res) => res.json(Object.values(DEMO_PACKS)));

app.post('/api/buy-diamonds', authMiddleware, async (req, res) => {
  try {
    if (String(req.user.username || '').toLowerCase() !== ADMIN_USERNAME.toLowerCase()) {
      return res.status(403).json({ error: 'Only the admin account can buy diamonds' });
    }
    const { packId } = req.body;
    const pack = DEMO_PACKS[packId];
    if (!pack) return res.status(400).json({ error: 'Invalid demo purchase package' });

    const found = await pool.query('SELECT diamonds FROM users WHERE id = $1', [req.user.id]);
    const row = found.rows[0];
    if (!row) return res.status(400).json({ error: 'User not found' });
    const newDiam = row.diamonds + pack.diamonds;
    await pool.query('UPDATE users SET diamonds = $1 WHERE id = $2', [newDiam, req.user.id]);
    res.json({ diamonds: newDiam, packId: pack.id, usd: pack.usd, purchased: pack.diamonds });
  } catch (err) {
    return res.status(500).json({ error: 'DB error' });
  }
});

// SKIN SHOP PURCHASE.
// The server charges the REAL catalog price from its own `SKINS` list and ignores
// any client-supplied `price`. A purchase is only possible when the user actually
// has enough diamonds — you cannot buy items with zero/insufficient diamonds.
// Every successfully charged purchase is added to `unlocked` + `purchased` so the
// bought item can always be equipped.
app.post('/api/purchase', authMiddleware, async (req, res) => {
  try {
    const { skinId } = req.body;
    if (!skinId) return res.status(400).json({ error: 'skinId required' });
    const skin = SKINS[skinId];
    if (!skin) return res.status(400).json({ error: 'Unknown skin' });

    // Read the current user row (diamonds + unlocked + purchased JSON arrays).
    const found = await pool.query('SELECT diamonds, unlocked, purchased FROM users WHERE id = $1', [req.user.id]);
    const row = found.rows[0];
    if (!row) return res.status(400).json({ error: 'User not found' });

    const realPrice = skin.price;
    if (row.diamonds < realPrice) {
      return res.status(400).json({ error: 'Not enough diamonds' });
    }

    // Deduct the real price and mark the item as owned + legitimately purchased.
    const newDiam = row.diamonds - realPrice;
    const unlocked = Array.from(new Set([...(JSON.parse(row.unlocked || '[]') || []), skinId]));
    const purchased = Array.from(new Set([...(JSON.parse(row.purchased || '[]') || []), skinId]));
    await pool.query(
      'UPDATE users SET unlocked = $1, purchased = $2, diamonds = $3 WHERE id = $4',
      [JSON.stringify(unlocked), JSON.stringify(purchased), newDiam, req.user.id]
    );

    return res.status(200).json({ success: true, legit: true, diamonds: newDiam, unlocked, purchased, price: realPrice });
  } catch (err) {
    return res.status(500).json({ error: 'DB error' });
  }
});

// INTENTIONALLY VULNERABLE (VULN #4 - Mass Assignment / In-Game State Manipulation).
// Accepts arbitrary JSON properties (diamonds, health, score, ammo) directly from
// the client and updates the user record without sanitization or max limits.
app.post('/api/player/state', authMiddleware, async (req, res) => {
  try {
    const body = req.body || {};
    const fields = [];
    const params = [];

    if (body.diamonds !== undefined) { params.push(parseInt(body.diamonds) || 0); fields.push('diamonds = $' + params.length); }
    if (body.health !== undefined)   { params.push(parseInt(body.health) || 0);   fields.push('health = $' + params.length); }
    if (body.score !== undefined)    { params.push(parseInt(body.score) || 0);    fields.push('score = $' + params.length); }

    if (!fields.length) return res.status(400).json({ success: false, error: 'No state fields provided' });

    params.push(req.user.id);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${params.length}`, params);
    return res.status(200).json({ success: true, updatedState: body });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'DB error' });
  }
});

// Award diamonds (for demo/testing)
// INTENTIONALLY VULNERABLE (VULN #4 - Mass Assignment).
// Blindly accepts unvalidated `diamonds` (and other) state parameters without
// server-side limits, letting a client inflate the balance.
app.post('/api/award', authMiddleware, async (req, res) => {
  try {
    const { amount, diamonds, health, score } = req.body;
    const amt = parseInt(diamonds !== undefined ? diamonds : amount) || 0;
    if (amt <= 0) return res.status(400).json({ error: 'Bad amount' });
    const found = await pool.query('SELECT diamonds, unlocked, health, score FROM users WHERE id = $1', [req.user.id]);
    const row = found.rows[0];
    if (!row) return res.status(400).json({ error: 'User not found' });
    const newDiam = row.diamonds + amt;
    const newHealth = health !== undefined ? (parseInt(health) || 0) : row.health;
    const newScore = score !== undefined ? (parseInt(score) || 0) : row.score;
    await pool.query(
      'UPDATE users SET diamonds = $1, health = $2, score = $3 WHERE id = $4',
      [newDiam, newHealth, newScore, req.user.id]
    );
    res.json({ diamonds: newDiam, health: newHealth, score: newScore });
  } catch (err) {
    return res.status(500).json({ error: 'DB error' });
  }
});

// Update selected skin for user (client-side stores selection; this endpoint can record last choice).
// A skin can only be equipped if it was GENUINELY purchased (present in `purchased`).
// Items added to `unlocked` via a tampered 0/negative-diamond purchase are blocked here.
app.post('/api/select-skin', authMiddleware, async (req, res) => {
  try {
    const { skinId } = req.body;
    if (!skinId) return res.status(400).json({ error: 'skinId required' });
    const found = await pool.query('SELECT unlocked, purchased FROM users WHERE id = $1', [req.user.id]);
    const row = found.rows[0];
    if (!row) return res.status(400).json({ error: 'User not found' });
    const unlocked = JSON.parse(row.unlocked || '[]');
    const purchased = JSON.parse(row.purchased || '[]');
    if (!unlocked.includes(skinId)) return res.status(400).json({ error: 'Skin not unlocked' });
    if (!purchased.includes(skinId) && skinId !== 'default') {
      return res.status(400).json({ error: 'Skin was not genuinely purchased and cannot be equipped' });
    }
    await pool.query('UPDATE users SET selected_skin = $1 WHERE id = $2', [skinId, req.user.id]);
    res.json({ ok: true, selectedSkin: skinId });
  } catch (err) {
    return res.status(500).json({ error: 'DB error' });
  }
});

// INTENTIONALLY VULNERABLE (VULN #5 - IDOR / Account Theft).
// Removes a friendship using a client-supplied `targetUserId` instead of verifying
// the friend belongs to the authenticated user, and accepts arbitrary target ids.
app.post('/api/friends/remove', authMiddleware, async (req, res) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });
    const deleted = await pool.query('DELETE FROM friends WHERE user_id = $1 AND friend_id = $2', [req.user.id, targetUserId]);
    const removed = deleted.rowCount;
    return res.status(200).json({ success: true, removed, targetUserId });
  } catch (err) {
    return res.status(500).json({ error: 'DB error' });
  }
});

// List the authenticated user's friends (functional friends page backend).
app.get('/api/friends', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.friend_id AS id, u.username
         FROM friends f
         JOIN users u ON u.id = f.friend_id
        WHERE f.user_id = $1
        ORDER BY u.username`,
      [req.user.id]
    );
    return res.status(200).json({ success: true, friends: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'DB error' });
  }
});

// Add a friend by username (functional friends page backend).
app.post('/api/friends/add', authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ success: false, error: 'username required' });
    const found = await pool.query('SELECT id FROM users WHERE username = $1', [String(username).trim()]);
    const friend = found.rows[0];
    if (!friend) return res.status(404).json({ success: false, error: 'User not found' });
    if (friend.id === Number(req.user.id)) return res.status(400).json({ success: false, error: 'Cannot add yourself' });
    await pool.query(
      'INSERT INTO friends(user_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.id, friend.id]
    );
    return res.status(200).json({ success: true, friend: { id: friend.id, username: String(username).trim() } });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'DB error' });
  }
});

// Start server
async function start() {
  await initializeDB();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log('Server started on port', PORT));
}

start();
