# Multi-layer DoS lab

Three availability attacks against `server.js`, then a replay against the
hardened build (`server-secure.js`) to prove the fixes work. Run these from
an **attacker VM**; the vulnerable server runs on the host
(default `http://192.168.56.1:3000`).

## Cheap shot

Every script accepts `[base_url]` as its first argument and defaults to
`http://192.168.56.1:3000`.

## Layer 1 — ReDoS (algorithmic / single-packet DoS)

One request freezes the whole Node process. The poison regex is
`^([a-zA-Z0-9]+)+$` in `POST /api/validate-user` (server.js:223): nested,
unguarded quantifiers catastrophically backtrack on a long string + a
non-matching trailing character. Keep the payload under 95000 chars so
body-parser's 100kb limit doesn't reject it first.

```bash
python3 redos.py http://192.168.56.1:3000 90000
```

Expected output:
```
[baseline] /api/skins -> ('HTTP 200', 0.0xx)
[sent] 90001 chars, NO response after ...s (TimedOut) - server busy
[after] /api/skins -> ('TIMEOUT / UNREACHABLE', ...)   <- server frozen
```

Evidence: `top` showing `node` at ~100% CPU + the hanging probe. Restart the
vulnerable server (`node server.js`) once it is frozen before Layer 2.

## Layer 2 — bcrypt login flare (resource exhaustion)

No rate limiting on `/api/login`; every check runs bcrypt (cost 10,
~50-100ms CPU). Concurrent attackers queue enough bcrypt work to saturate
CPU + libuv threadpool so login latency explodes.

```bash
python3 login_flood.py http://192.168.56.1:3000 60 20
```

Expected: `post-flood` login probe takes many seconds vs <0.1s baseline,
while `/api/skins` (no bcrypt) keeps answering.
Evidence: `top` CPU spike + latency before/after (the 2 probes printed by the script).

## Layer 3 — slowloris (connection exhaustion)

Opens many sockets and drip-feeds headers so Node holds the connections
until resources run out. Pure stdlib (no install).

```bash
python3 slowloris.py http://192.168.56.1:3000 300
```

Run for ~10s (Ctrl+C to release). Evidence: connection build-up in
`ss -s` / `netstat` + degraded responsiveness while open.

## Full orchestration

```bash
bash run_all.sh http://192.168.56.1:3000
```

## Hardened replay (attack fails)

Run the SECURE twin on port 3001 (fixes: bounded regex + length cap on
`/api/validate-user`, in-memory rate limit on login/signup/validate-user,
clamped state endpoints, `jwt.verify`):

```bash
cd /path/to/app
npm install                 # install deps once on the host
PORT=3001 node server-secure.js
```

Then from the VM, replay all layers (same scripts, different URL):

```bash
# 1. ReDoS -> instant rejection, server stays responsive
python3 redos.py http://192.168.56.1:3001 90000
#    expect: [sent] HTTP 400 (valid:false / too long), server unaffected

# 2. login flood -> after ~5 rapid hits, Http 429 (Too many requests)
python3 login_flood.py http://192.168.56.1:3001 60 10

# 3. slow first, layer-1 baseline probe stays fast
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" http://192.168.56.1:3001/api/skins
```

Screenshot both runs side by side: frozen server on :3000, responsive +
429/400 on :3001.

## Evidence checklist for the report

- [ ] ReDoS: `top` CPU 100% + `/api/skins` TIMEOUT during the attack
- [ ] ReDoS blocked: same payload → fast `400`, server responsive
- [ ] Flood: login latency before vs after (probe lines)
- [ ] Flood blocked: `429 Too many requests`
- [ ] Slowloris: `ss -s` connection count climb / sockets held
- [ ] Same scripts, two outcomes (:3000 fail / :3001 blocked)