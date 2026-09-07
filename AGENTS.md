# AGENTS.md

"Stickman Shooter" — a single-page Phaser 3 browser game (PvA, local PvP, online PvP). No build system, no tests, no lint/typecheck. Plain global-scope ES6 scripts loaded via `<script>` tags.

## Entry point and running

- `shooter/index.html` loads Phaser 3 from jsDelivr CDN, PeerJS (for online PvP), then `shooter/game1.js`. All three `<script>` tags are present.
- To run: open `shooter/index.html` in a browser (or serve `shooter/` with any static server). Internet is required for the CDNs. There is no other way to run/verify — no test command exists.

## Critical: file confusion

- **`shooter/game1.js` is the real game** and the only one `index.html` loads. Make all edits here.

## Architecture

- Everything lives in `game1.js` (~2500 lines), global scope: constants at top (`GAME_W` 1100×600, gravity, `WEAPONS` defs, jetpack `MAX_ENERGY`/`ENERGY_DRAIN`/`ENERGY_REGEN`/`ENERGY_REGEN_DELAY`/`FLY_VEL`, `MAPS` table, `SKINS` palette), texture builders (`drawCharFrame`, `buildCharTextures`, `_genTextures`), then scenes, then `Phaser.Game` config at the bottom.
- Characters are an invisible 22×44 arcade physics rectangle **plus a runtime-generated sprite texture** (`ss-{skin}-{stand|walk1|walk2|fly}`) with a 2-frame walk animation, drawn by `drawCharFrame` (helmet, torso, jetpack, jet flame). `_makeChar` creates `this.add.sprite`; `_drawChar` picks frame/animation from velocity+flying+dead state, flips by `facing`, positions at body center +22. Weapon + sword are a separate `Graphics` overlay (`weapGfx`). `drawStickman` still exists but is only used as fallback/leftover — new code uses sprites.
- `MAPS` (3 entries: classic, towers, ruins) each define `name`, `desc`, `colors` (bg/platform/ground), and `layout` `[x, y, w, h]` platform boxes. `_buildMap` parameterizes from `this.mapId` (set via `init(data)`).
- `BaseGameScene` holds all shared logic: world/map (`_buildMap`), characters (`_makeChar`), colliders (`_setupColliders`), bullets, weapon/heart pickups, HUD (HP + energy bars via `_buildHUD`/`_updateHUD`), jetpack (`_handleFly`), aim helpers (`_updateAim`, `_drawAimLine`), death (`_die` — tweens `char.sprite` now, not `gfx`). Subclasses: `GameScene` (PvA + `_aiTick`), `PvPLocalScene` (two keyboard bindings), `PvPOnlineScene` (PeerJS `STATE`/`BULLET`/`SWORD`/`MAP` messages at ~50 Hz).
- `MapSelectScene` runs before every match: 3 map cards + RANDOM + 10s auto-random countdown, launches `{next}` with `mapId` and forwards `extra` (host/peer/conn). For online host it sends `{type:'MAP', map}` over the conn before starting.
- Desktop aiming: bullets fire toward the mouse; `_spawnBullet(char, angleRad)` is angle-driven when given a radian angle, horizontal-with-spread otherwise. Online `_netShoot(angle)` sends the same angled velocity.
- Mobile (auto-detected via `_isTouch`, overridable with `window.__forceTouch`): `MobileControls` builds a left movement wheel, a right aim-and-fire wheel, and JUMP/FLY/RELOAD buttons (`TouchButton`/`WheelJoy`). Scene `update` ORs touch state with keyboard state. `index.html` sets `user-scalable=no` + `touch-action:none`; Phaser config uses `Scale.FIT` + `activePointers: 4`.
- Flow: `MenuScene` → `PvPMenuScene` or `MapSelectScene` → `GameScene` | `PvPLocalScene` | `PvPOnlineScene`. Menus route through `MapSelectScene` with `{next, extra}`. `HowToScene` is static help.
- Online room flow (PvPMenuScene): host presses CREATE ROOM → new Peer with random ID → shows code + COPY CODE button → on incoming conn → `MapSelectScene` (host picks map, sends MAP) → both start `PvPOnlineScene` with same `mapId`. Guest presses JOIN → enters code → connects → waits for host's MAP message before starting. Back/cancel paths destroy `conn`/`peer`.
- Bullet pitfall: an arcade `PhysicsGroup.add()` re-applies group defaults (`setVelocity(0)`, `setAllowGravity(true)`), so bullets must be added to `this.bullets` **before** setting velocity/gravity — done in `_spawnBullet`, `_aiShoot`, and online `_onData` BULLET case.
- `physics.add.overlap` callbacks receive `(object1, object2)` in the order of the call args — the guard `bullet.bData?.owner === p1` in `_setupColliders` depends on this, so handlers must not assume which arg is the bullet.
- Controls: move A/D, jump W/SPACE, fly SHIFT (PvA & online local P1), mouse to aim + click to shoot; local PvP P2: arrows + ↑, fly CTRL, shoot L, reload K. Mobile: left wheel move, right wheel aim+fire, on-screen JUMP/FLY/R.

## Deployment

- `Dockerfile` + `docker-compose.yml` + `.dockerignore` for internet hosting: PostgreSQL sidecar + Node app on port **8080**. `SECRET`, `PORT`, `PG*` are env-overridable (server.js and server-secure.js read `process.env.SECRET || 'dev_secret_change_me'`). Online PvP is peer-to-peer via PeerJS — the server only handles auth/shop, never game traffic.

## Conventions

- Emoji + section divider comment banners (`// ──`) for organization; no semicolon-free code, ES6 `class`/`const`.
- Gameplay numbers are hardcoded at the top (GAME_W/GAME_H, MOVE_SPEED, JUMP_VEL, WEAPONS table, MAPS) — tune there, not inline.
- Verify changes by reloading `index.html` in a browser and testing the affected mode (PvA / local PvP / online / map select).