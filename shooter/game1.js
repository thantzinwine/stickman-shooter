// ============================================================
//  STICKMAN SHOOTER — Enhanced Edition v2.0 (FIXED)
//  Phaser 3 + PeerJS  |  PvA · Local PvP · Online PvP
// ============================================================

// ── Constants ────────────────────────────────────────────────
const GAME_W     = 1100;
const GAME_H     = 600;
const GRAVITY_Y  = 900;
const MOVE_SPEED = 185;
const JUMP_VEL   = -540;
const SWORD_RANGE  = 68;
const SWORD_DAMAGE = 14;
const SWORD_RATE   = 680;
const MAX_ENERGY       = 100;
const ENERGY_DRAIN     = 30;     // energy consumed per second while flying
const ENERGY_REGEN     = 20;     // energy restored per second after the delay
const ENERGY_REGEN_DELAY = 1500; // ms without flying before regen starts
const FLY_VEL          = -250;

// Weapon definitions
const WEAPONS = {
    pistol: {
        name: 'Pistol', mag: 6, reserve: 30, damage: 20,
        bulletSpeed: 650, fireRate: 380, reloadTime: 1200,
        spread: 0.04, color: 0xffd700, label: '🔫 Pistol',
    },
    akm: {
        name: 'AKM', mag: 30, reserve: 90, damage: 13,
        bulletSpeed: 800, fireRate: 100, reloadTime: 2200,
        spread: 0.08, color: 0xff6600, label: '🔥 AKM',
    },
    launcher: {
        name: 'Launcher', mag: 1, reserve: 3, damage: 0,
        splashDamage: 60, splashRadius: 100,
        bulletSpeed: 420, fireRate: 1500, reloadTime: 3000,
        spread: 0, color: 0xff3333, label: '💥 Launcher',
    },
};

// Available skins (client-side): id, display colors
const SKINS = {
    default: { id: 'default', name: 'Default', body: 0x00ccff, detail: 0x0077aa },
    gold:    { id: 'gold',    name: 'Golden Armor', body: 0xffd166, detail: 0xcc9a22 },
    stealth: { id: 'stealth', name: 'Stealth Suit',  body: 0x222222, detail: 0x555555 },
    neon:    { id: 'neon',    name: 'Neon Glow',     body: 0xff44ff, detail: 0x880088 },
};

// Available maps (server-agnostic; layout drawn by _buildMap)
const MAPS = [
    {
        id: 'classic', name: 'CLASSIC', desc: 'Balanced · open lanes',
        color: 0x2f9e44, colorDark: 0x1f6b2e,
        layout: [
            [140, 460, 180, 20], [440, 388, 210, 20], [750, 458, 185, 20],
            [290, 292, 165, 20], [640, 288, 165, 20], [468, 188, 150, 20],
        ],
    },
    {
        id: 'towers', name: 'TOWERS', desc: 'Vertical · climb & dive',
        color: 0x3b7dd8, colorDark: 0x275494,
        layout: [
            [60, 450, 130, 20], [220, 340, 120, 20], [380, 250, 120, 20], [540, 160, 120, 20],
            [760, 240, 120, 20], [910, 360, 120, 20], [470, 60, 140, 20],
        ],
    },
    {
        id: 'ruins', name: 'RUINS', desc: 'Asymmetric · close quarters',
        color: 0xd9843b, colorDark: 0x9a5c24,
        layout: [
            [140, 470, 150, 20], [500, 420, 170, 20], [860, 460, 150, 20],
            [280, 330, 140, 20], [680, 300, 150, 20], [400, 220, 140, 20], [680, 120, 120, 20],
            [180, 140, 120, 20],
        ],
    },
];

// ── Character texture builder ───────────────────────────────
// Renders a "real" game character (helmeted soldier) as runtime Phaser
// textures instead of a stickman line figure. Frames: stand, walk1/walk2
// (2-frame run cycle), fly (jet flame). Textures are global, keyed by skin.
function drawCharFrame(g, bC, dC, variant) {
    const OUT = 0x0a0e14;
    const limb = (x1, y1, x2, y2, w) => {
        g.lineStyle(w, OUT, 1);
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
        g.lineStyle(Math.max(1, w * 0.55), bC, 1);
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
    };

    let legs, arms;
    if (variant === 'walk1') {
        legs = [[16, 40, 24, 48], [11, 40, 6, 48]];
        arms = [[18, 26, 25, 31], [12, 26, 5, 33]];
    } else if (variant === 'walk2') {
        legs = [[16, 40, 6, 48], [11, 40, 24, 48]];
        arms = [[18, 26, 11, 33], [12, 26, 25, 31]];
    } else if (variant === 'fly') {
        legs = [[13, 40, 12, 45], [17, 40, 18, 45]];
        arms = [[18, 26, 26, 30], [12, 26, 4, 30]];
    } else { // stand
        legs = [[16, 40, 22, 48], [11, 40, 8, 48]];
        arms = [[18, 26, 23, 36], [12, 26, 7, 36]];
    }

    // Jetpack on the back (left side when facing right)
    g.fillStyle(OUT, 1); g.fillRoundedRect(4, 20, 6, 17, 3);
    g.fillStyle(dC, 1);  g.fillRoundedRect(5, 21, 4, 15, 2);

    // Limbs
    arms.forEach(a => limb(a[0], a[1], a[2], a[3], 4.5));
    legs.forEach(l => limb(l[0], l[1], l[2], l[3], 4.5));

    // Torso
    g.fillStyle(bC, 1);
    g.fillRoundedRect(9, 21, 12, 20, 4);
    g.lineStyle(1.5, OUT, 1);
    g.strokeRoundedRect(9, 21, 12, 20, 4);
    g.fillStyle(dC, 1);
    g.fillRect(12, 27, 6, 7);      // chest plate
    g.fillRect(9, 36, 12, 4);      // belt

    // Neck
    limb(15, 21, 15, 17, 4);

    // Head (helmet)
    g.fillStyle(bC, 1);
    g.fillRoundedRect(9, 6, 12, 13, 4);
    g.lineStyle(1.5, OUT, 1);
    g.strokeRoundedRect(9, 6, 12, 13, 4);
    g.fillStyle(dC, 1);
    g.fillRect(14, 9, 7, 7);       // visor (front half)
    g.fillStyle(0xffffff, 0.75);
    g.fillRect(15, 10, 2, 2);      // visor glint

    // Jet flame while flying
    if (variant === 'fly') {
        g.fillStyle(0xff7700, 0.9);
        g.fillTriangle(9, 42, 14, 40, 11, 48);
        g.fillStyle(0x00ccff, 0.95);
        g.fillTriangle(10.5, 41, 13, 41, 12, 46);
    }
}

// Generate + cache the character sprite set for every skin. Safe to call
// repeatedly: the texture-exists guard makes it a no-op after first run.
function buildCharTextures(scene) {
    const TM = scene.textures;
    if (TM.exists('ss-' + SKINS.default.id + '-stand')) return;
    for (const key of Object.keys(SKINS)) {
        const skin = SKINS[key];
        ['stand', 'walk1', 'walk2', 'fly'].forEach(v => {
            const g = scene.make.graphics({ add: false });
            drawCharFrame(g, skin.body, skin.detail, v);
            g.generateTexture('ss-' + key + '-' + v, 30, 48);
            g.destroy();
        });
        if (!scene.anims.exists('ss-' + key + '-walk')) {
            scene.anims.create({
                key: 'ss-' + key + '-walk',
                frames: [
                    { key: 'ss-' + key + '-walk1' },
                    { key: 'ss-' + key + '-walk2' },
                ],
                frameRate: 10,
                yoyo: true,
                repeat: -1,
            });
        }
    }
}

// ── Button factory ──────────────────────────────────────────
function makeButton(scene, x, y, label, w, h, topColor, botColor, onDown) {
    const btn = scene.add.graphics();
    const txt = scene.add.text(x, y, label, {
        fontFamily: "'Segoe UI', sans-serif",
        fontSize: '21px', fontStyle: 'bold',
        color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);

    const render = (hover) => {
        btn.clear();
        const c1 = hover ? Phaser.Display.Color.ValueToColor(topColor).brighten(20).color : topColor;
        btn.fillStyle(c1, 1);
        btn.fillRoundedRect(x - w/2, y - h/2, w, h, 11);
        btn.fillGradientStyle(c1, c1, botColor, botColor, 1);
        btn.fillRoundedRect(x - w/2, y - h/2, w, h, 11);
        if (hover) {
            btn.lineStyle(2, 0xffffff, 0.45);
            btn.strokeRoundedRect(x - w/2, y - h/2, w, h, 11);
        }
    };
    render(false);

    const zone = scene.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerover',  () => { render(true);  txt.setScale(1.05); });
    zone.on('pointerout',   () => { render(false); txt.setScale(1.0); });
    zone.on('pointerdown',  () => {
        scene.tweens.add({ targets: [btn, txt], scaleX: 0.95, scaleY: 0.95, duration: 80, yoyo: true });
        scene.time.delayedCall(160, onDown);
    });

    return { btn, txt, zone };
}

// ── Touch controls (mobile) ─────────────────────────────────
// Circular hold button (JUMP / FLY / RELOAD).
class TouchButton {
    constructor(scene, x, y, r, label) {
        this.scene = scene;
        this.held = false;
        this.just = false;

        const g = scene.add.graphics().setDepth(40).setScrollFactor(0);
        const t = scene.add.text(x, y, label, {
            fontFamily: "'Segoe UI', sans-serif", fontSize: '15px', fontStyle: 'bold',
            color: '#ffffff', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(41);

        const draw = (active) => {
            g.clear();
            g.fillStyle(0xffffff, active ? 0.32 : 0.14);
            g.fillCircle(x, y, r);
            g.lineStyle(2, 0xffffff, active ? 0.6 : 0.3);
            g.strokeCircle(x, y, r);
        };
        draw(false);

        const zone = scene.add.circle(x, y, r + 8, 0xffffff, 0).setScrollFactor(0).setDepth(40)
            .setInteractive({ useHandCursor: false });
        zone.on('pointerdown', () => { this.held = true; this.just = true; draw(true); });
        const up = () => { if (!this.held) return; this.held = false; draw(false); };
        zone.on('pointerup', up);
        zone.on('pointerout', up);
        zone.on('pointerupoutside', up);

        this.g = g; this.t = t; this.zone = zone; this.x = x; this.y = y; this.r = r;
    }

    setVisible(v) {
        this.g.setVisible(v); this.t.setVisible(v);
        if (v) this.zone.setInteractive({ useHandCursor: false });
        else this.zone.disableInteractive();
    }
}

// Virtual joystick / aim wheel. Drag anywhere from the base;
// tracks the pointer even outside the circle. On release calls
// onUp(moved) where `moved` is true if the drag exceeded the deadzone.
class WheelJoy {
    constructor(scene, x, y, r, onMove, onUp) {
        this.scene = scene;
        this.x = x; this.y = y; this.r = r;
        this.onMove = onMove || (() => {});
        this.onUp   = onUp   || (() => {});
        this.pointer = null;
        this.dx = 0; this.dy = 0;
        this.moved = false;

        this.base = scene.add.graphics().setDepth(40).setScrollFactor(0);
        this.knob = scene.add.graphics().setDepth(41).setScrollFactor(0);
        this._drawBase();
        this._drawKnob(0, 0);

        const zone = scene.add.circle(x, y, r + 8, 0xffffff, 0).setScrollFactor(0).setDepth(40)
            .setInteractive({ useHandCursor: false });
        zone.on('pointerdown', p => {
            if (this.pointer) return;
            this.pointer = p;
            this.moved = false;
            this._update(p);
        });
        scene.input.on('pointermove', p => { if (p === this.pointer) this._update(p); });

        const up = p => {
            if (p !== this.pointer) return;
            this.pointer = null;
            const wasMoved = this.moved;
            this.moved = false;
            this.dx = 0; this.dy = 0;
            this._drawKnob(0, 0);
            this.onUp(wasMoved);
        };
        scene.input.on('pointerup', up);
        scene.input.on('pointerupoutside', up);

        this.zone = zone;
    }

    _update(p) {
        const dx = p.x - this.x, dy = p.y - this.y;
        const len = Math.hypot(dx, dy);
        if (len > 14) this.moved = true;
        const max = this.r * 0.7;
        const k = len > max ? max / len : 1;
        this.dx = (dx * k) / max;
        this.dy = (dy * k) / max;
        this._drawKnob(dx * k, dy * k);
        this.onMove(this.dx, this.dy);
    }

    _drawBase() {
        const g = this.base; g.clear();
        g.fillStyle(0xffffff, 0.08);
        g.fillCircle(this.x, this.y, this.r);
        g.lineStyle(2, 0xffffff, 0.18);
        g.strokeCircle(this.x, this.y, this.r);
        g.lineStyle(1, 0xffffff, 0.1);
        g.strokeCircle(this.x, this.y, 8);
    }

    _drawKnob(kx, ky) {
        const g = this.knob; g.clear();
        g.fillStyle(0xffffff, 0.28);
        g.fillCircle(this.x + kx, this.y + ky, this.r * 0.42);
        g.lineStyle(2, 0xffffff, 0.35);
        g.strokeCircle(this.x + kx, this.y + ky, this.r * 0.42);
    }

    setVisible(v) {
        this.base.setVisible(v); this.knob.setVisible(v);
        if (v) this.zone.setInteractive({ useHandCursor: false });
        else this.zone.disableInteractive();
    }
}

// Settings for mobile control layout: positions/sizes persisted to localStorage.
const MOBILE_CTRL_KEY = 'stickman-mobile-controls';
function loadMobileLayout() {
    try { return JSON.parse(localStorage.getItem(MOBILE_CTRL_KEY)) || {}; } catch (_) { return {}; }
}
function saveMobileLayout(l) {
    try { localStorage.setItem(MOBILE_CTRL_KEY, JSON.stringify(l)); } catch (_) {}
}

// Full touch layout: left wheel = move, right wheel = AIM ONLY (no fire),
// FIRE (top-right) + JUMP / FLY buttons. Positions & sizes are adjustable in
// layout-edit mode and persisted. Exposes a per-frame input state.
class MobileControls {
    constructor(scene, opts) {
        this.scene = scene;
        this.opts = opts || {};
        this.onFireWhenAimed = this.opts.fire || (() => {});
        this.moveLeft  = false;
        this.moveRight = false;
        this.aimAngle  = null;
        this.aiming    = false;
        this.fireHeld  = false;
        this.fireJust  = false;
        this.layout    = loadMobileLayout();

        const defaultLayout = {
            fire: { x: 1030, y: 140, r: 46 },
            jump: { x: 755,  y: 480, r: 44 },
            fly:  { x: 860,  y: 480, r: 44 },
            move: { x: 105,  y: 505, r: 62 },
            aim:  { x: 1000, y: 500, r: 60 },
        };
        // Merge persisted over defaults so every control has coords.
        for (const k of Object.keys(defaultLayout)) {
            this.layout[k] = { ...defaultLayout[k], ...(this.layout[k] || {}) };
        }

        const FB = (k) => this.layout[k];
        const roll = (opt) => ((typeof opt === 'number') ? opt : opt);

        this.fireBtn = new TouchButton(scene, FB('fire').x, FB('fire').y, FB('fire').r, 'FIRE');
        this.jumpBtn = new TouchButton(scene, FB('jump').x, FB('jump').y, FB('jump').r, 'JUMP');
        this.flyBtn  = new TouchButton(scene, FB('fly').x,  FB('fly').y,  FB('fly').r,  'FLY');

        this.fireBtn.zone.on('pointerdown', () => { this.fireHeld = true; this.fireJust = true; });
        const fireUp = () => { this.fireHeld = false; };
        this.fireBtn.zone.on('pointerup', fireUp);
        this.fireBtn.zone.on('pointerout', fireUp);
        this.fireBtn.zone.on('pointerupoutside', fireUp);

        this.moveJoy = new WheelJoy(scene, FB('move').x, FB('move').y, FB('move').r, (dx) => {
            const dz = 0.22;
            this.moveLeft  = dx < -dz;
            this.moveRight = dx > dz;
        }, () => { this.moveLeft = this.moveRight = false; });

        this.aimJoy = new WheelJoy(scene, FB('aim').x, FB('aim').y, FB('aim').r, (dx, dy) => {
            this.aiming = true;
            this.aimAngle = Math.atan2(dy, dx);
        }, () => {
            this.aiming = false;
        });

        this._labels = {
            move: scene.add.text(FB('move').x, FB('move').y + FB('move').r + 18, 'MOVE', {
                fontFamily: "'Segoe UI', sans-serif", fontSize: '12px', color: '#7799bb',
            }).setOrigin(0.5).setScrollFactor(0).setDepth(39),
            aim: scene.add.text(FB('aim').x, FB('aim').y + FB('aim').r + 18, 'AIM', {
                fontFamily: "'Segoe UI', sans-serif", fontSize: '12px', color: '#ff8855',
            }).setOrigin(0.5).setScrollFactor(0).setDepth(39),
        };

        this._buildSettingsBtn();
        this._editMode = false;
    }

    // A small gear in the top-left that toggles layout-edit mode where the
    // touch controls can be dragged and resized. Persists to localStorage.
    _buildSettingsBtn() {
        const s = this.scene, x = 32, y = 34;
        const g = s.add.graphics().setScrollFactor(0).setDepth(50);
        g.fillStyle(0x000000, 0.35);
        g.fillCircle(x, y, 20);
        g.lineStyle(2, 0xffffff, 0.7);
        g.strokeCircle(x, y, 20);
        const t = s.add.text(x, y, '⚙', {
            fontFamily: "'Segoe UI', sans-serif", fontSize: '20px', color: '#ffffff',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(51);

        const zone = s.add.circle(x, y, 28, 0xffffff, 0).setScrollFactor(0).setDepth(50)
            .setInteractive({ useHandCursor: false });
        zone.on('pointerup', () => this.toggleEdit());

        this._gearG = g; this._gearT = t; this._gearZone = zone;

        // Edit-mode overlay: hint text + bigger/smaller buttons.
        const hint = s.add.text(GAME_W/2, 70,
            'EDIT MODE — drag buttons to reposition. Use + / − to resize. Tap ⚙ to finish.',
            { fontFamily: "'Segoe UI', sans-serif", fontSize: '13px', color: '#ffdd88' })
            .setOrigin(0.5).setScrollFactor(0).setDepth(52);
        hint.setVisible(false);

        const mkCircle = (cx, cy, r, sym, cb) => {
            const cg = s.add.graphics().setScrollFactor(0).setDepth(52);
            cg.fillStyle(0x114488, 0.85);
            cg.fillCircle(cx, cy, r);
            cg.lineStyle(2, 0xffffff, 0.7);
            cg.strokeCircle(cx, cy, r);
            const ct = s.add.text(cx, cy, sym, {
                fontFamily: "'Segoe UI', sans-serif", fontSize: '22px', fontStyle: 'bold', color: '#ffffff',
            }).setOrigin(0.5).setScrollFactor(0).setDepth(53);
            const cz = s.add.circle(cx, cy, r + 6, 0xffffff, 0).setScrollFactor(0).setDepth(52)
                .setInteractive({ useHandCursor: false });
            cz.on('pointerup', cb);
            return [cg, ct, cz];
        };
        const plus  = mkCircle(120, 120, 26, '+', () => this.scaleControls(1.12));
        const minus = mkCircle(210, 120, 26, '−', () => this.scaleControls(0.89));
        const reset = mkCircle(300, 120, 26, '↺', () => {
            localStorage.removeItem(MOBILE_CTRL_KEY);
            this.layout = loadMobileLayout();
            const defaults = {
                fire: { x: 1030, y: 140, r: 46 },
                jump: { x: 755,  y: 480, r: 44 },
                fly:  { x: 860,  y: 480, r: 44 },
                move: { x: 105,  y: 505, r: 62 },
                aim:  { x: 1000, y: 500, r: 60 },
            };
            for (const k of Object.keys(defaults)) this.layout[k] = { ...defaults[k] };
            this.applyLayout();
        });
        this._editOverlay = [hint, ...plus, ...minus, ...reset];
        this._editOverlay.forEach(o => o.setVisible(false));
    }

    toggleEdit() {
        this._editMode = !this._editMode;
        this.enableLayoutEdit(this._editMode);
        this._editOverlay.forEach(o => o.setVisible(this._editMode));
        if (!this._editMode) this.applyLayout();
    }

    get jumpJust() { return this.jumpBtn.just; }
    get flyHeld()  { return this.flyBtn.held; }

    consume() {
        this.jumpBtn.just = false;
        this.fireJust = false;
    }

    // Angle to fire at: last aim-wheel angle, else a facing-based fallback.
    aimOrFallback() {
        const ch = this.opts.char ? this.opts.char() : null;
        if (this.aimAngle != null) return this.aimAngle;
        const fallback = ch ? (ch.facing === 1 ? 0 : Math.PI) : 0;
        return fallback;
    }

    // Layout edit mode: lets a device-user drag controls around and scale them.
    enableLayoutEdit(on) {
        if (typeof on === 'undefined') on = !this._layoutEdit;
        this._layoutEdit = !!on;
        const zones = [
            [this.jumpBtn.zone, 'jump'],
            [this.flyBtn.zone,  'fly'],
            [this.fireBtn.zone, 'fire'],
            [this.moveJoy.zone, 'move'],
            [this.aimJoy.zone,  'aim'],
        ];

        const drag = (zone, key) => {
            zone.off('drag');
            zone.on('drag', (ptr, gx, gy) => {
                const s = this.layout[key];
                s.x = gx; s.y = gy;
                this.applyLayout();
                saveMobileLayout(this.layout);
            });
        };
        for (const [zone, key] of zones) {
            if (on) {
                zone.setInteractive({ draggable: true });
                drag(zone, key);
            } else if (zone.input) {
                zone.input.draggable = false;
                zone.off('drag');
            }
        }
    }

    applyLayout() {
        const FB = (k) => this.layout[k];
        const applyBtn = (btn, k) => {
            btn.x = FB(k).x; btn.y = FB(k).y; btn.r = FB(k).r;
            btn.g.clear();
            btn.g.fillStyle(0xffffff, 0.14);
            btn.g.fillCircle(FB(k).x, FB(k).y, FB(k).r);
            btn.g.lineStyle(2, 0xffffff, 0.3);
            btn.g.strokeCircle(FB(k).x, FB(k).y, FB(k).r);
            btn.t.setPosition(FB(k).x, FB(k).y);
            btn.zone.setPosition(FB(k).x, FB(k).y).setRadius(FB(k).r + 8);
        };
        applyBtn(this.jumpBtn, 'jump');
        applyBtn(this.flyBtn,  'fly');
        applyBtn(this.fireBtn, 'fire');

        this.moveJoy.x = FB('move').x; this.moveJoy.y = FB('move').y; this.moveJoy.r = FB('move').r;
        this.aimJoy.x  = FB('aim').x;  this.aimJoy.y  = FB('aim').y;  this.aimJoy.r  = FB('aim').r;
        this.moveJoy._drawBase(); this.moveJoy._drawKnob(0, 0);
        this.aimJoy._drawBase();  this.aimJoy._drawKnob(0, 0);

        this._labels.move.setPosition(FB('move').x, FB('move').y + FB('move').r + 18);
        this._labels.aim.setPosition(FB('aim').x,  FB('aim').y  + FB('aim').r + 18);
    }

    scaleControls(factor) {
        for (const k of ['fire', 'jump', 'fly', 'move', 'aim']) {
            this.layout[k].r = Math.max(18, Math.round(this.layout[k].r * factor));
        }
        saveMobileLayout(this.layout);
        this.applyLayout();
    }

    hide() {
        this.jumpBtn.setVisible(false);
        this.flyBtn.setVisible(false);
        this.fireBtn.setVisible(false);
        this.moveJoy.setVisible(false);
        this.aimJoy.setVisible(false);
        this._labels.move.setVisible(false);
        this._labels.aim.setVisible(false);
        this._gearG.setVisible(false);
        this._gearT.setVisible(false);
        this._gearZone.disableInteractive();
        this._editOverlay.forEach(o => o.setVisible(false));
    }
}

// ── Background painter ──────────────────────────────────────
function paintBackground(scene) {
    const bg = scene.add.graphics();
    bg.fillGradientStyle(0x050510, 0x050510, 0x0c1e3c, 0x0c1e3c, 1);
    bg.fillRect(0, 0, GAME_W, GAME_H);
    const sg = scene.add.graphics();
    sg.fillStyle(0xffffff, 1);
    for (let i = 0; i < 110; i++) {
        sg.fillCircle(
            Phaser.Math.Between(0, GAME_W),
            Phaser.Math.Between(0, GAME_H * 0.78),
            Math.random() < 0.12 ? 1.6 : 0.7
        );
    }
    const hg = scene.add.graphics();
    hg.fillStyle(0x0b1c35, 1);
    hg.fillEllipse(200,  GAME_H - 50, 420, 190);
    hg.fillEllipse(620,  GAME_H - 55, 500, 210);
    hg.fillEllipse(990,  GAME_H - 42, 380, 165);
}

// ============================================================
//  MENU SCENE
// ============================================================
class MenuScene extends Phaser.Scene {
    constructor() { super({ key: 'MenuScene' }); }

    create() {
        paintBackground(this);
        window.GameAPI?.playMusic();

        const ensureAuth = (cb) => {
            if (window.GameAuth && window.GameAuth.ensureAuth) return window.GameAuth.ensureAuth(cb);
            const loggedIn = !!(window.GameAuth && window.GameAuth.isLoggedIn && window.GameAuth.isLoggedIn());
            if (!loggedIn) {
                const overlay = document.getElementById('auth-overlay');
                if (overlay) overlay.classList.remove('hidden');
                alert('Please log in first to play the game.');
                return;
            }
            cb();
        };

        // Decorative characters (live sprites)
        buildCharTextures(this);
        const lg = this.add.sprite(200, 410, 'ss-default-stand').setAlpha(0.85).setDepth(1).setScale(1.4);
        const rg = this.add.sprite(900, 410, 'ss-gold-stand').setAlpha(0.85).setDepth(1).setScale(1.4).setFlipX(true);
        lg.play('ss-default-walk');
        rg.play('ss-gold-walk');
        this.tweens.add({ targets: lg, y: '-=14', duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        this.tweens.add({ targets: rg, y: '-=14', duration: 1050, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: 300 });

        // Title
        const title = this.add.text(GAME_W / 2, 115, 'STICKMAN SHOOTER', {
            fontFamily: "'Segoe UI', sans-serif",
            fontSize: '68px', fontStyle: 'bold',
            color: '#00e5ff',
            stroke: '#002233', strokeThickness: 9,
            shadow: { blur: 35, color: '#00e5ff', fill: true },
        }).setOrigin(0.5).setDepth(5);

        this.add.text(GAME_W / 2, 195, 'Mini Militia Style Combat', {
            fontFamily: "'Segoe UI', sans-serif",
            fontSize: '20px', color: '#8899cc',
        }).setOrigin(0.5).setDepth(5);

        this.tweens.add({ targets: title, scaleX: 1.025, scaleY: 1.025, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

        // Buttons
        makeButton(this, GAME_W/2, 270, '⚔  PLAYER  vs  AI', 360, 58, 0x006633, 0x004422, () => {
            ensureAuth(() => this.scene.start('MapSelectScene', { next: 'GameScene' }));
        });
        makeButton(this, GAME_W/2, 345, '👥  PLAYER  vs  PLAYER', 360, 58, 0x002288, 0x001155, () => {
            ensureAuth(() => this.scene.start('PvPMenuScene'));
        });
        makeButton(this, GAME_W/2, 420, '🛒  SHOP', 280, 48, 0x885500, 0x553300, () => {
            window.location.href = 'shop.html';
        });
        makeButton(this, GAME_W/2, 470, '📋  HOW TO PLAY', 280, 44, 0x444466, 0x222233, () => {
            this.scene.start('HowToScene');
        });
        const logoutButton = makeButton(this, GAME_W/2, 525, '↪  LOGOUT', 280, 32, 0x662233, 0x441522, () => {
            window.GameAuth?.logout();
        });
        const updateLogoutVisibility = () => {
            const visible = !!window.GameAuth?.isLoggedIn();
            logoutButton.btn.setVisible(visible);
            logoutButton.txt.setVisible(visible);
            if (visible) logoutButton.zone.setInteractive({ useHandCursor: true });
            else logoutButton.zone.disableInteractive();
        };
        updateLogoutVisibility();
        this.time.delayedCall(300, updateLogoutVisibility);

        this.add.text(GAME_W - 8, GAME_H - 8, 'v2.0  |  Phaser 3', {
            fontSize: '11px', color: '#333355',
        }).setOrigin(1, 1).setDepth(5);
    }
}

// ============================================================
//  HOW TO PLAY SCENE
// ============================================================
class HowToScene extends Phaser.Scene {
    constructor() { super({ key: 'HowToScene' }); }

    create() {
        paintBackground(this);
        this.add.text(GAME_W/2, 50, '📋  HOW TO PLAY', {
            fontFamily: "'Segoe UI', sans-serif",
            fontSize: '40px', fontStyle: 'bold', color: '#00e5ff',
            stroke: '#002233', strokeThickness: 7,
        }).setOrigin(0.5);

        const controls = [
            ['🎮 PLAYER CONTROLS', ''],
            ['Move', 'A / D'],
            ['Jump', 'W or SPACE'],
            ['Jetpack / Fly', 'Hold SHIFT  (drains energy bar)'],
            ['Aim', 'Mouse aims — click to shoot'],
            ['Shoot / Swing Sword', 'Left Mouse Click'],
            ['Reload', 'R'],
            ['Drop Weapon', 'Q'],
            ['', ''],
            ['👥 LOCAL PvP — PLAYER 2 CONTROLS', ''],
            ['Move', '← / →  Arrow Keys'],
            ['Jump', '↑  Arrow Key'],
            ['Jetpack / Fly', 'Hold CTRL'],
            ['Shoot / Swing', 'L  key'],
            ['Reload', 'K  key'],
            ['', ''],
            ['📱 MOBILE (auto-detected)', ''],
            ['Move', 'Left wheel — drag the joystick'],
            ['Aim + Fire', 'Right wheel — drag to aim, release to shoot'],
            ['Jump / Fly / Reload', 'On-screen buttons'],
            ['', ''],
            ['💡 TIPS', ''],
            ['Hearts', 'Restore +20 HP  (spawn every 15–45 sec)'],
            ['Weapons', 'Spawn every 10 sec — stand over to pick up'],
            ['Launcher', 'Explodes on impact — area damage!'],
            ['Energy', 'Regenerates 1.5s after you stop flying'],
        ];

        let y = 96;
        controls.forEach(([k, v]) => {
            if (!k && !v) { y += 5; return; }
            const isHeader = !v;
            this.add.text(isHeader ? GAME_W/2 : 205, y,
                isHeader ? k : k + ':',
                {
                    fontFamily: "'Segoe UI', sans-serif",
                    fontSize: isHeader ? '14px' : '12px',
                    fontStyle: isHeader ? 'bold' : 'normal',
                    color: isHeader ? '#00ccff' : '#ccccdd',
                }
            ).setOrigin(isHeader ? 0.5 : 0);
            if (v) {
                this.add.text(GAME_W - 205, y, v, {
                    fontFamily: "'Courier New', monospace",
                    fontSize: '12px', color: '#ffdd44',
                }).setOrigin(1, 0);
            }
            y += isHeader ? 20 : 17;
        });

        makeButton(this, GAME_W/2, GAME_H - 50, '← BACK TO MENU', 250, 48, 0x444466, 0x222233, () => {
            this.scene.start('MenuScene');
        });
    }
}

// ============================================================
//  PvP MENU SCENE
// ============================================================
class PvPMenuScene extends Phaser.Scene {
    constructor() { super({ key: 'PvPMenuScene' }); }

    create() {
        paintBackground(this);
        this._peer = null;
        this._conn = null;
        this._inputActive = false;
        this._codeTyped   = '';

        const ensureAuth = (cb) => {
            if (window.GameAuth && window.GameAuth.ensureAuth) return window.GameAuth.ensureAuth(cb);
            const loggedIn = !!(window.GameAuth && window.GameAuth.isLoggedIn && window.GameAuth.isLoggedIn());
            if (!loggedIn) { const overlay = document.getElementById('auth-overlay'); if (overlay) overlay.classList.remove('hidden'); alert('Please log in first to play.'); return; }
            cb();
        };

        this.add.text(GAME_W/2, 60, '👥  PLAYER  vs  PLAYER', {
            fontFamily: "'Segoe UI', sans-serif",
            fontSize: '44px', fontStyle: 'bold', color: '#4488ff',
            stroke: '#001133', strokeThickness: 7,
        }).setOrigin(0.5);

        this._group = this.add.group();
        this._showMain();

        this.input.keyboard.on('keydown', e => this._onKey(e));
        this.events.on('shutdown', () => this._clearJoinInput());
    }

    _clearGroup() {
        this._group.getChildren().slice().forEach(c => c.destroy());
        this._group.clear(true, true);
    }

    _showMain() {
        this._clearGroup();
        const add = (o) => this._group.addMultiple([o.btn, o.txt, o.zone]);

        add(makeButton(this, GAME_W/2, 220, '🖥  LOCAL  (Same Screen)', 380, 62, 0x005533, 0x003322, () => {
            ensureAuth(() => this.scene.start('MapSelectScene', { next: 'PvPLocalScene' }));
        }));
        add(makeButton(this, GAME_W/2, 310, '🌐  ONLINE  (Room Code)', 380, 62, 0x330088, 0x220055, () => {
            this._showOnlineOptions();
        }));
        add(makeButton(this, GAME_W/2, 500, '← BACK', 240, 48, 0x333355, 0x222233, () => {
            this.scene.start('MenuScene');
        }));
    }

    _showOnlineOptions() {
        this._clearGroup();
        const add = (o) => this._group.addMultiple([o.btn, o.txt, o.zone]);

        add(makeButton(this, GAME_W/2, 230, '🏠  CREATE ROOM', 340, 62, 0x006644, 0x004433, () => this._showCreate()));
        add(makeButton(this, GAME_W/2, 320, '🔗  JOIN ROOM', 340, 62, 0xaa4400, 0x773300, () => this._showJoin()));
        add(makeButton(this, GAME_W/2, 500, '← BACK', 240, 48, 0x333355, 0x222233, () => this._showMain()));
    }

    _showCreate() {
        this._clearGroup();
        this._destroyPeer();

        const status = this.add.text(GAME_W/2, 200, '⏳  Connecting to signaling server…', {
            fontFamily: "'Segoe UI', sans-serif", fontSize: '18px', color: '#aaaacc',
        }).setOrigin(0.5);
        this._group.add(status);

        const code = this._genCode();

        try {
            this._peer = new Peer(code, {
                config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
            });

            this._peer.on('open', id => {
                status.setAlpha(0);
                const codeLbl = this.add.text(GAME_W/2, 260, 'YOUR ROOM CODE', {
                    fontFamily: "'Segoe UI', sans-serif", fontSize: '15px', color: '#8899bb',
                }).setOrigin(0.5);
                const codeDisp = this.add.text(GAME_W/2, 335, id, {
                    fontFamily: "'Courier New', monospace", fontSize: '62px', fontStyle: 'bold',
                    color: '#00ffcc', stroke: '#003322', strokeThickness: 5,
                    shadow: { blur: 22, color: '#00ffcc', fill: true },
                }).setOrigin(0.5);
                const waitTxt = this.add.text(GAME_W/2, 395, '⏳  Waiting for opponent…', {
                    fontFamily: "'Segoe UI', sans-serif", fontSize: '18px', color: '#aaaacc',
                }).setOrigin(0.5);
                this.tweens.add({ targets: waitTxt, alpha: 0.25, duration: 850, yoyo: true, repeat: -1 });

                const copyLbl = this.add.text(GAME_W/2, 428, '', {
                    fontFamily: "'Segoe UI', sans-serif", fontSize: '13px', color: '#66ff99',
                }).setOrigin(0.5);
                const copy = makeButton(this, GAME_W/2, 462, '📋  COPY CODE', 230, 40, 0x225588, 0x163a5c, () => {
                    try {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            navigator.clipboard.writeText(id).catch(() => {});
                        } else {
                            const ta = document.createElement('textarea');
                            ta.value = id; document.body.appendChild(ta); ta.select();
                            document.execCommand('copy'); ta.remove();
                        }
                        copyLbl.setText('Copied!  Send it to a friend.');
                    } catch (e) { copyLbl.setText('Could not copy — tell them the code.'); }
                });

                this._group.addMultiple([codeLbl, codeDisp, waitTxt, copyLbl, copy.btn, copy.txt, copy.zone]);
            });

            this._peer.on('connection', conn => {
                conn.on('open', () => {
                    const ref = this._peer; this._peer = null;
                    // Host picks (or auto-randoms) the map, then the match starts.
                    this.scene.start('MapSelectScene', {
                        next: 'PvPOnlineScene',
                        extra: { isHost: true, peer: ref, conn },
                    });
                });
            });

            this._peer.on('error', err => {
                status.setText('⚠  Error: ' + err.type + '\n\nTry again or check your internet.');
                status.setColor('#ff5555');
            });

        } catch (e) {
            status.setText('⚠  PeerJS is unavailable: ' + (e && e.message ? e.message : String(e))
                + '\n\nMake sure you are online, then go back and retry.');
            status.setColor('#ff5555');
        }

        const back = makeButton(this, GAME_W/2, 510, '← CANCEL', 240, 48, 0x333355, 0x222233, () => {
            this._destroyPeer(); this._showOnlineOptions();
        });
        this._group.addMultiple([back.btn, back.txt, back.zone]);
    }

    _showJoin() {
        this._clearGroup();
        this._destroyPeer();
        this._inputActive = true;
        this._codeTyped   = '';

        this.add.text(GAME_W/2, 195, 'Enter Room Code:', {
            fontFamily: "'Segoe UI', sans-serif", fontSize: '22px', color: '#ccccee',
        }).setOrigin(0.5);

        const ibg = this.add.graphics();
        ibg.fillStyle(0x111133, 1);
        ibg.lineStyle(2, 0x4466cc, 1);
        ibg.fillRoundedRect(GAME_W/2 - 185, 240, 370, 72, 9);
        ibg.strokeRoundedRect(GAME_W/2 - 185, 240, 370, 72, 9);

        this._inputDisp = this.add.text(GAME_W/2, 276, '______', {
            fontFamily: "'Courier New', monospace", fontSize: '52px', fontStyle: 'bold',
            color: '#00ffcc', letterSpacing: 14,
        }).setOrigin(0.5);

        this.add.text(GAME_W/2, 330, '(type the 6-character code, then press ENTER)', {
            fontFamily: "'Segoe UI', sans-serif", fontSize: '13px', color: '#556677',
        }).setOrigin(0.5);

        this._statusJoin = this.add.text(GAME_W/2, 360, '', {
            fontFamily: "'Segoe UI', sans-serif", fontSize: '16px', color: '#ffaa44',
        }).setOrigin(0.5);

        const connect = makeButton(this, GAME_W/2, 420, '🔗  CONNECT', 280, 54, 0xaa4400, 0x772200, () => this._tryJoin());
        const back = makeButton(this, GAME_W/2, 500, '← BACK', 220, 46, 0x333355, 0x222233, () => {
            if (this._conn) { try { this._conn.close(); } catch (_) {} this._conn = null; }
            this._inputActive = false; this._clearJoinInput(); this._destroyPeer(); this._showOnlineOptions();
        });
        this._group.addMultiple([ibg, this._inputDisp, this._statusJoin,
            connect.btn, connect.txt, connect.zone, back.btn, back.txt, back.zone]);

        // On touch devices the Phaser keyboard never fires, so bring up a
        // native HTML input (and on-screen keyboard) for the room code.
        if (this._isMobile()) this._setupJoinInput();
    }

    _isMobile() {
        return !!(navigator && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent))
            || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    }

    _setupJoinInput() {
        this._clearJoinInput();
        // Map the join input box (game coords: centered at GAME_W/2, y=276,
        // ~370x72) to screen coordinates under Phaser Scale.FIT (z=min, centered).
        const w = window.innerWidth, h = window.innerHeight;
        const z = Math.min(w / GAME_W, h / GAME_H);
        const worldX = GAME_W / 2, worldY = 276;
        const sx = w / 2 + (worldX - GAME_W / 2) * z;
        const sy = h / 2 + (worldY - GAME_H / 2) * z;
        const inputW = 370 * z, inputH = 72 * z;

        const el = document.createElement('input');
        el.type = 'text';
        el.id = 'join-code-input';
        el.autocapitalize = 'characters';
        el.autocomplete = 'off';
        el.spellcheck = false;
        el.maxLength = 6;
        el.setAttribute('inputmode', 'text');
        el.style.position = 'fixed';
        el.style.left = (sx - inputW / 2) + 'px';
        el.style.top  = (sy - inputH / 2 + 4 * z) + 'px';
        el.style.width = inputW + 'px';
        el.style.height = inputH + 'px';
        el.style.fontSize = (Math.max(24, 40 * z)) + 'px';
        el.style.fontFamily = "'Courier New', monospace";
        el.style.fontWeight = 'bold';
        el.style.textAlign = 'center';
        el.style.letterSpacing = (0.18 * inputW) + 'px';
        el.style.color = '#00ffcc';
        el.style.background = '#0a0f22';
        el.style.border = '2px solid #4466cc';
        el.style.borderRadius = '8px';
        el.style.outline = 'none';
        el.style.zIndex = 100;
        el.style.pointerEvents = 'auto';

        el.addEventListener('input', () => {
            const v = el.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
            el.value = v;
            this._codeTyped = v;
            if (this._inputDisp) this._inputDisp.setText(v.padEnd(6, '_'));
        });
        el.addEventListener('keydown', ev => {
            if (ev.key === 'Enter') { ev.preventDefault(); this._tryJoin(); }
        });

        document.body.appendChild(el);
        this._joinInput = el;
        setTimeout(() => { try { el.focus(); } catch (_) {} }, 250);
    }

    _clearJoinInput() {
        if (this._joinInput) {
            try { this._joinInput.remove(); } catch (_) {}
            this._joinInput = null;
        }
    }

    _tryJoin() {
        if (this._codeTyped.length < 1) {
            this._statusJoin.setText('⚠  Please enter a room code!');
            return;
        }
        const code = this._codeTyped.toUpperCase().trim();
        this._statusJoin.setText('Connecting to room ' + code + '…');
        this._statusJoin.setColor('#aaaaff');

        try {
            this._destroyPeer();
            this._peer = new Peer({
                config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
            });
            this._peer.on('open', () => {
                const conn = this._peer.connect(code);
                conn.on('open', () => {
                    this._statusJoin.setText('✅  Connected! Waiting for host’s map…');
                    this._statusJoin.setColor('#00ff88');
                    this._conn = conn;

                    const pendingMap = (data) => {
                        if (!data || data.type !== 'MAP') return;
                        try { conn.off('data', pendingMap); } catch (_) { try { conn.removeListener('data', pendingMap); } catch (_) {} }
                        this._statusJoin.setText('Map: ' + MAPS.find(m => m.id === data.map)?.name + '  —  starting!');
                        this._statusJoin.setColor('#00ff88');
                        this.time.delayedCall(600, () => {
                            this._inputActive = false;
                            this._clearJoinInput();
                            const ref = this._peer; this._peer = null; this._conn = null;
                            this.scene.start('PvPOnlineScene', { isHost: false, peer: ref, conn, mapId: data.map });
                        });
                    };
                    conn.on('data', pendingMap);

                    // Safety: if the host never picks a map, say so.
                    this.time.delayedCall(20000, () => {
                        if (this._conn && this._statusJoin && !this._launching) {
                            this._statusJoin.setText('⚠  No map received — is the host still there?');
                            this._statusJoin.setColor('#ff5555');
                        }
                    });
                });
                conn.on('error', err => {
                    this._statusJoin.setText('⚠  Connection failed: ' + String(err));
                    this._statusJoin.setColor('#ff5555');
                });
            });
            this._peer.on('error', err => {
                this._statusJoin.setText('⚠  ' + err.type + '  —  Room not found: ' + code);
                this._statusJoin.setColor('#ff5555');
            });
        } catch (e) {
            this._statusJoin.setText('⚠  PeerJS is unavailable: ' + (e && e.message ? e.message : String(e))
                + '\n\nMake sure you are online, then go back and retry.');
            this._statusJoin.setColor('#ff5555');
        }
    }

    _onKey(e) {
        if (!this._inputActive) return;
        if (this._joinInput) return;
        if (e.key === 'Backspace') {
            this._codeTyped = this._codeTyped.slice(0, -1);
        } else if (e.key === 'Enter') {
            this._tryJoin();
            return;
        } else if (/^[A-Za-z0-9]$/.test(e.key) && this._codeTyped.length < 6) {
            this._codeTyped += e.key.toUpperCase();
        }
        if (this._inputDisp) {
            this._inputDisp.setText(this._codeTyped.padEnd(6, '_'));
        }
    }

    _genCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    }

    _destroyPeer() {
        if (this._peer) { try { this._peer.destroy(); } catch (_) {} this._peer = null; }
    }
}

// ============================================================
//  BASE GAME SCENE
// ============================================================
class BaseGameScene extends Phaser.Scene {

    init(data) {
        this.mapId = (data && data.mapId) || 'classic';
    }

    _genTextures() {
        if (!this.textures.exists('bullet')) {
            const g = this.make.graphics({ add: false });
            g.fillStyle(0xffffff, 1); g.fillCircle(4, 4, 4);
            g.generateTexture('bullet', 8, 8); g.destroy();
        }
        if (!this.textures.exists('rocket')) {
            const g = this.make.graphics({ add: false });
            g.fillStyle(0xffffff, 1); g.fillCircle(6, 6, 6);
            g.generateTexture('rocket', 12, 12); g.destroy();
        }
    }

    _createWorld() {
        this.gameOver  = false;
        // Reset per-run handles: on scene.restart() the same instance is reused
        // and the old touch/aim graphics were cleared, so stale refs would
        // otherwise suppress (or break) recreation.
        this._touch = null;
        this._aimG  = null;
        window.GameAPI?.playMusic();
        this._genTextures();
        buildCharTextures(this);
        paintBackground(this);

        this.platforms   = this.physics.add.staticGroup();
        this.bullets     = this.physics.add.group();
        this.weapPickups = this.physics.add.staticGroup();
        this.heartGroup  = this.physics.add.staticGroup();

        this._buildMap();
    }

    _buildMap() {
        const M = MAPS.find(m => m.id === this.mapId) || MAPS[0];
        const g = this.add.graphics();
        this._plat(g, 0, GAME_H - 30, GAME_W, 30, 0x3d6b30, 0x2d4a22);
        M.layout.forEach(pl => this._plat(g, pl[0], pl[1], pl[2], pl[3], 0x4e7622, 0x3d5c1a));
    }

    _plat(g, x, y, w, h, topColor, bodyColor) {
        g.fillStyle(bodyColor, 1); g.fillRect(x, y, w, h);
        g.fillStyle(topColor,  1); g.fillRect(x, y, w, 6);
        const r = this.add.rectangle(x + w/2, y + h/2, w, h);
        this.physics.add.existing(r, true);
        this.platforms.add(r);
    }

    _makeChar(x, y, isP1) {
        const body = this.add.rectangle(x, y, 22, 44, 0, 0);
        this.physics.add.existing(body);
        body.body.setCollideWorldBounds(true);
        body.body.setGravityY(GRAVITY_Y);
        body.body.setMaxVelocityY(720);

        const skinId = (isP1 && window.__selectedSkin) ? window.__selectedSkin : 'default';
        const sprite   = this.add.sprite(x, y + 22, 'ss-' + skinId + '-stand').setOrigin(0.5, 1).setDepth(5);
        const weapGfx  = this.add.graphics().setDepth(6);
        const swordGfx = this.add.graphics().setDepth(7);

        const char = {
            body, sprite, weapGfx, swordGfx,
            isP1,
                skin: skinId,
            hp: 100, maxHp: 100,
            energy: MAX_ENERGY,
            isFlying: false,
            regenDelay: ENERGY_REGEN_DELAY,
            facing: isP1 ? 1 : -1,
            aimAngle: isP1 ? 0 : Math.PI,
            onGround: false,
            weapon: null,
            swingTimer: 0,
            swingActive: false,
            swingFrame: 0,
            dead: false,
        };
        this._drawChar(char);
        return char;
    }

    _drawChar(char) {
        const cx = char.body.x;
        const cy = char.body.y;
        const skinKey = (char.skin && SKINS[char.skin]) ? char.skin : 'default';
        const prefix  = 'ss-' + skinKey;
        const sprint  = Math.abs(char.body.body.velocity.x) > 20;
        const wantWalk = !char.dead && !char.isFlying && sprint;
        const animKey = prefix + '-walk';
        const curAnim = char.sprite.anims.currentAnim ? char.sprite.anims.currentAnim.key : null;

        if (wantWalk) {
            if (curAnim !== animKey) {
                if (curAnim) char.sprite.stop();
                if (this.anims.exists(animKey)) char.sprite.play(animKey);
                else char.sprite.setTexture(prefix + '-walk1');
            }
        } else {
            if (curAnim) char.sprite.stop();
            const frame = char.isFlying ? 'fly' : 'stand';
            if (char.sprite.texture.key !== prefix + '-' + frame) {
                char.sprite.setTexture(prefix + '-' + frame);
            }
        }
        char.sprite.setFlipX(char.facing === -1);
        char.sprite.setPosition(cx, cy + 22);

        char.weapGfx.clear();
        if (char.weapon) {
            const def  = WEAPONS[char.weapon.type];
            const offX = char.facing * 16;
            char.weapGfx.fillStyle(def.color, 1);
            char.weapGfx.fillRoundedRect(
                char.facing === 1 ? offX - 4  : offX - 20,
                -21, 24, 9, 2
            );
            char.weapGfx.fillRect(
                char.facing === 1 ? offX + 20 : offX - 28,
                -19, char.facing * 10, 4
            );
        } else {
            const sc = char.isP1 ? 0x88ddff : 0xff9999;
            char.weapGfx.lineStyle(3, sc, 1);
            char.weapGfx.beginPath();
            char.weapGfx.moveTo(char.facing * 8, -21);
            char.weapGfx.lineTo(char.facing * 34, -9);
            char.weapGfx.strokePath();
            char.weapGfx.lineStyle(4, sc, 0.7);
            char.weapGfx.beginPath();
            char.weapGfx.moveTo(char.facing * 8, -26);
            char.weapGfx.lineTo(char.facing * 8, -14);
            char.weapGfx.strokePath();
        }
        char.weapGfx.setPosition(cx, cy);

        char.swordGfx.clear();
        if (char.swingActive) {
            const t   = char.swingFrame / 10;
            const sc2 = char.isP1 ? 0x88ddff : 0xff9999;
            char.swordGfx.lineStyle(3, sc2, 1 - t * 0.5);
            char.swordGfx.beginPath();
            const sx = cx + char.facing * 8, sy = cy - 21;
            const ang = t * Math.PI * 0.85;
            char.swordGfx.moveTo(sx, sy);
            char.swordGfx.lineTo(
                sx + char.facing * Math.cos(ang) * 38,
                sy + Math.sin(ang) * 30
            );
            char.swordGfx.strokePath();
        }
    }

    // ✅ FIXED: Complete collider setup
    _setupColliders(p1, p2) {
        // Player vs platforms
        this.physics.add.collider(p1.body, this.platforms);
        this.physics.add.collider(p2.body, this.platforms);

        // ✅ FIX: Bullets vs platforms - proper callback with both objects
        this.physics.add.collider(this.bullets, this.platforms, (bullet, platform) => {
            if (!bullet.active) return;
            if (bullet.bData?.type === 'launcher') {
                this._explode(bullet.x, bullet.y, bullet.bData);
            }
            bullet.destroy();
        });

        // ✅ FIX: Bullets vs player bodies - proper overlap with both objects
        // Phaser delivers the callback args as (player, bullet) for group-vs-body
        // overlaps, so pick whichever arg carries `bData` as the bullet.
        this.physics.add.overlap(this.bullets, p1.body, (a, b) => {
            const bullet = a.bData ? a : b;
            if (!bullet?.active || bullet.bData?.owner === p1) return;
            this._handleBulletHit(bullet, p1);
        });

        this.physics.add.overlap(this.bullets, p2.body, (a, b) => {
            const bullet = a.bData ? a : b;
            if (!bullet?.active || bullet.bData?.owner === p2) return;
            this._handleBulletHit(bullet, p2);
        });

        // Weapon pickups
        this.physics.add.overlap(p1.body, this.weapPickups, (player, hit) => {
            if (hit.pickupData) this._grabWeapon(p1, hit);
        });
        this.physics.add.overlap(p2.body, this.weapPickups, (player, hit) => {
            if (hit.pickupData) this._grabWeapon(p2, hit);
        });

        // Heart pickups
        this.physics.add.overlap(p1.body, this.heartGroup, (player, hit) => {
            if (hit.active && hit.hData) this._grabHeart(p1, hit);
        });
        this.physics.add.overlap(p2.body, this.heartGroup, (player, hit) => {
            if (hit.active && hit.hData) this._grabHeart(p2, hit);
        });
    }

    // ✅ NEW: Helper method for bullet hit handling
    _handleBulletHit(bullet, target) {
        if (!bullet?.bData) return;
        if (bullet.bData.type === 'launcher') {
            this._explode(bullet.x, bullet.y, bullet.bData);
        } else {
            this._damage(target, bullet.bData.damage);
            this._floatTxt(target.body.x, target.body.y - 40, bullet.bData.damage, 0xff4444);
        }
        bullet.destroy();
    }

    _startTimers() {
        this.time.delayedCall(8000, this._spawnWeapon, [], this);
        this.time.addEvent({ delay: 10000, callback: this._spawnWeapon, callbackScope: this, loop: true });
        this._scheduleHeart();
    }

    _spawnWeapon() {
        if (this.gameOver) return;
        const keys = Object.keys(WEAPONS);
        const type = keys[Phaser.Math.Between(0, keys.length - 1)];
        const def  = WEAPONS[type];
        const sx   = Phaser.Math.Between(90, GAME_W - 90);
        const sy   = Phaser.Math.Between(100, GAME_H - 200);

        const wg = this.add.graphics().setDepth(3);
        wg.fillStyle(def.color, 1);
        wg.fillRoundedRect(-15, -9, 30, 18, 4);
        wg.fillStyle(0xffffff, 0.5); wg.fillRect(-5, -6, 17, 4);
        wg.fillStyle(def.color, 1);  wg.fillRect(15, -3, 9, 5);
        wg.setPosition(sx, sy);

        const lbl = this.add.text(sx, sy - 24, def.label, {
            fontSize: '11px', color: '#' + def.color.toString(16).padStart(6, '0'),
            fontFamily: "'Segoe UI', sans-serif", stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(3);

        this.tweens.add({ targets: [wg, lbl], y: '-=9', duration: 920, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

        const hit = this.add.rectangle(sx, sy, 34, 34, 0, 0);
        this.physics.add.existing(hit, true);
        hit.pickupData = { type, mag: def.mag, reserve: def.reserve, wg, lbl };
        this.weapPickups.add(hit);

        this.time.delayedCall(15000, () => {
            if (hit.active) { wg.destroy(); lbl.destroy(); hit.destroy(); }
        });
    }

    _grabWeapon(char, hit) {
        if (!hit.active || !hit.pickupData) return;
        const pd = hit.pickupData;
        char.weapon = { type: pd.type, mag: pd.mag, reserve: pd.reserve, lastShot: 0, reloading: false };
        pd.wg.destroy(); pd.lbl.destroy(); hit.destroy();
        window.GameAPI?.playSfx('pickup');
        this._floatTxt(char.body.x, char.body.y - 55, '+ ' + WEAPONS[pd.type].name, WEAPONS[pd.type].color, '14px');
    }

    _scheduleHeart() {
        this.time.delayedCall(Phaser.Math.Between(15000, 45000), () => {
            this._spawnHeart();
            this._scheduleHeart();
        });
    }

    _spawnHeart() {
        if (this.gameOver) return;
        const sx = Phaser.Math.Between(90, GAME_W - 90);
        const sy = Phaser.Math.Between(100, GAME_H - 200);

        const hg = this.add.graphics().setDepth(3);
        hg.fillStyle(0xff4466, 1);
        hg.fillCircle(-6, -5, 7);
        hg.fillCircle(6,  -5, 7);
        hg.fillTriangle(-13, -1, 13, -1, 0, 12);
        hg.setPosition(sx, sy);
        this.tweens.add({ targets: hg, y: '-=9', duration: 820, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

        const hit = this.add.rectangle(sx, sy, 28, 28, 0, 0);
        this.physics.add.existing(hit, true);
        hit.hData = { hg };
        this.heartGroup.add(hit);

        this.time.delayedCall(22000, () => {
            if (hit.active) { hg.destroy(); hit.destroy(); }
        });
    }

    _grabHeart(char, hit) {
        if (!hit.active || !hit.hData || char.hp >= char.maxHp) return;
        const healed = 20;
        char.hp = Math.min(char.maxHp, char.hp + healed);
        hit.hData.hg.destroy();
        hit.destroy();
        window.GameAPI?.playSfx('heal');
        this._floatTxt(char.body.x, char.body.y - 55, '+' + healed + ' HP', 0x00ff88, '16px');
    }

    _sword(attacker, target) {
        const now = this.time.now;
        if (now - attacker.swingTimer < SWORD_RATE) return;
        attacker.swingTimer  = now;
        attacker.swingActive = true;
        attacker.swingFrame  = 0;
        window.GameAPI?.playSfx('sword');

        const dist = Phaser.Math.Distance.Between(
            attacker.body.x, attacker.body.y,
            target.body.x, target.body.y
        );
        if (dist < SWORD_RANGE && !target.dead) {
            this._damage(target, SWORD_DAMAGE);
            this._floatTxt(target.body.x, target.body.y - 40, SWORD_DAMAGE, 0xffffff);
        }
    }

    // ✅ FIXED: Spawn bullet with proper physics
    _spawnBullet(char, angleRad) {
        if (!char.weapon) return false;
        const w   = char.weapon;
        const def = WEAPONS[w.type];
        const now = this.time.now;

        if (w.reloading || w.mag <= 0) { this._reload(char); return false; }
        if (now - w.lastShot < def.fireRate) return false;

        w.lastShot = now;
        w.mag--;

        const isRocket = w.type === 'launcher';
        const tex  = isRocket ? 'rocket' : 'bullet';
        const spX  = char.body.x + char.facing * 32;
        const spY  = char.body.y - 18;

        const aimMode = angleRad !== undefined;
        const angle = aimMode
            ? angleRad
            : (Math.random() - 0.5) * def.spread;
        if (aimMode) char.facing = Math.cos(angle) >= 0 ? 1 : -1;

        const bullet = this.physics.add.image(spX, spY, tex);
        bullet.setTint(def.color);
        bullet.setDepth(8);
        bullet.setDisplaySize(8, 8);

        // Add to the group FIRST: PhysicsGroup.add() applies the group's body
        // defaults (velocity 0, allowGravity true) to the child, so body
        // configuration must come after.
        this.bullets.add(bullet);

        bullet.body.setAllowGravity(isRocket);
        if (isRocket) bullet.body.setGravityY(80);
        bullet.body.setMaxVelocity(1600, 1600);
        bullet.body.setVelocity(
            (aimMode ? 1 : char.facing) * Math.cos(angle) * def.bulletSpeed,
            Math.sin(angle) * def.bulletSpeed
        );
        
        // Set proper body size for collision
        bullet.body.setSize(6, 6);
        bullet.body.setOffset(1, 1);
        
        bullet.bData = {
            owner: char, type: w.type, damage: def.damage,
            splash: def.splashDamage || 0,
            radius: def.splashRadius || 0,
        };
        window.GameAPI?.playSfx(isRocket ? 'launcher' : (w.type === 'akm' ? 'rifle' : 'gun'));
        this._flash(spX, spY, def.color);

        if (w.mag <= 0 && w.reserve > 0) this._reload(char);
        return true;
    }

    _reload(char) {
        if (!char.weapon) return;
        const w = char.weapon, def = WEAPONS[w.type];
        if (w.reloading || w.reserve <= 0 || w.mag === def.mag) return;
        w.reloading = true;
        window.GameAPI?.playSfx('reload');
        this.time.delayedCall(def.reloadTime, () => {
            if (!char.weapon || char.weapon !== w) return;
            const take = Math.min(def.mag - w.mag, w.reserve);
            w.mag += take; w.reserve -= take; w.reloading = false;
        });
    }

    _damage(char, amount) {
        if (char.dead || amount <= 0) return;
        char.hp = Math.max(0, char.hp - amount);
        window.GameAPI?.playSfx('hit');
        if (char.hp <= 0) this._die(char);
    }

    _die(char) {
        if (char.dead) return;
        char.dead    = true;
        this.gameOver = true;
        window.GameAPI?.playSfx('defeat');
        this.tweens.add({ targets: char.sprite, angle: 360, alpha: 0, duration: 800, ease: 'Power2' });
        char.weapGfx.setVisible(false);
        char.swordGfx.clear();
        char.body.body.setVelocityY(JUMP_VEL * 0.5);
        this.time.delayedCall(500, () => {
            if (char.body?.body) { char.body.body.setVelocity(0, 0); char.body.body.setAllowGravity(false); }
        });

        const winner = char.isP1 ? this._p2Name + ' WINS!' : this._p1Name + ' WINS!';
        const color  = char.isP1 ? 0xff4444 : 0x00ccff;
        this.time.delayedCall(950, () => this._gameOverScreen(winner, color));
    }

    _gameOverScreen(text, color) {
        if (this._touch) this._touch.hide();
        const ov = this.add.rectangle(GAME_W/2, GAME_H/2, GAME_W, GAME_H, 0x000000, 0).setDepth(20);
        this.tweens.add({ targets: ov, alpha: 0.65, duration: 600 });

        const col = '#' + color.toString(16).padStart(6, '0');
        const bann = this.add.text(GAME_W/2, GAME_H/2 - 55, text, {
            fontFamily: "'Segoe UI', sans-serif",
            fontSize: '72px', fontStyle: 'bold', color: col,
            stroke: '#000000', strokeThickness: 9,
            shadow: { blur: 28, color: col, fill: true },
        }).setOrigin(0.5).setDepth(21).setAlpha(0);
        this.tweens.add({ targets: bann, alpha: 1, y: GAME_H/2 - 65, duration: 720, ease: 'Back.Out' });

        this._goBtn(GAME_W/2 - 135, GAME_H/2 + 50, '↺  REMATCH', 0x003388, () => this.scene.restart());
        this._goBtn(GAME_W/2 + 135, GAME_H/2 + 50, '🏠  MENU',   0x333355, () => this.scene.start('MenuScene'));
    }

    _goBtn(x, y, lbl, col, cb) {
        const W = 210, H = 50;
        const bg = this.add.graphics().setDepth(21);
        bg.fillStyle(col, 1); bg.fillRoundedRect(x - W/2, y - H/2, W, H, 9);
        const tx = this.add.text(x, y, lbl, {
            fontFamily: "'Segoe UI', sans-serif", fontSize: '18px', fontStyle: 'bold',
            color: '#fff', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(22);
        const zo = this.add.zone(x, y, W, H).setDepth(23).setInteractive({ useHandCursor: true });
        zo.on('pointerdown', () => this.time.delayedCall(120, cb));
        zo.on('pointerover', () => { bg.setAlpha(0.75); tx.setScale(1.05); });
        zo.on('pointerout',  () => { bg.setAlpha(1.00); tx.setScale(1.00); });
    }

    _explode(x, y, bData) {
        const eg = this.add.graphics().setDepth(10);
        eg.fillStyle(0xff7700, 0.75); eg.fillCircle(0, 0, bData.radius);
        eg.fillStyle(0xffff00, 0.50); eg.fillCircle(0, 0, bData.radius * 0.55);
        eg.fillStyle(0xffffff, 0.30); eg.fillCircle(0, 0, bData.radius * 0.25);
        eg.setPosition(x, y);
        this.cameras.main.shake(280, 0.014);

        [this.p1Char, this.p2Char].forEach(char => {
            if (char.dead) return;
            const dist = Phaser.Math.Distance.Between(x, y, char.body.x, char.body.y);
            if (dist < bData.radius) {
                const dmg = Math.round(bData.splash * (1 - dist / bData.radius));
                this._damage(char, dmg);
                this._floatTxt(char.body.x, char.body.y - 52, dmg, 0xff7700);
            }
        });
        this.tweens.add({ targets: eg, alpha: 0, scaleX: 1.6, scaleY: 1.6, duration: 560, onComplete: () => eg.destroy() });
    }

    _flash(x, y, color) {
        const f = this.add.graphics().setDepth(9);
        f.fillStyle(color, 0.9); f.fillCircle(0, 0, 9); f.setPosition(x, y);
        this.tweens.add({ targets: f, alpha: 0, scaleX: 2.2, scaleY: 2.2, duration: 130, onComplete: () => f.destroy() });
    }

    _floatTxt(x, y, msg, color, size) {
        const col = '#' + (color || 0xff4444).toString(16).padStart(6, '0');
        const t = this.add.text(x, y, '' + msg, {
            fontFamily: "'Segoe UI', sans-serif",
            fontSize: size || '18px', fontStyle: 'bold',
            color: col, stroke: '#000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(15);
        this.tweens.add({ targets: t, y: y - 52, alpha: 0, duration: 980, ease: 'Power2', onComplete: () => t.destroy() });
    }

    _tickSwings() {
        [this.p1Char, this.p2Char].forEach(c => {
            if (c.swingActive) {
                c.swingFrame++;
                if (c.swingFrame >= 10) { c.swingActive = false; c.swingFrame = 0; c.swordGfx.clear(); }
            }
        });
    }

    _cleanBullets() {
        this.bullets.getChildren().forEach(b => {
            if (b.x < -120 || b.x > GAME_W + 120 || b.y > GAME_H + 100 || b.y < -150) {
                b.destroy();
            }
        });
    }

    // ✅ FIXED: HUD with HP + energy bar
    _buildHUD(p1Name, p2Name) {
        this._p1Name = p1Name; this._p2Name = p2Name;
        const D = 30;
        this.ui = {};

        // P1 (top-left)
        this.add.text(14, 8, '👤 ' + p1Name, {
            fontSize: '13px', fontFamily: "'Segoe UI', sans-serif",
            color: '#00ccff', fontStyle: 'bold',
        }).setScrollFactor(0).setDepth(D);

        this.ui.p1HpBg  = this.add.rectangle(114, 27, 200, 14, 0x2a2a2a).setOrigin(0.5).setScrollFactor(0).setDepth(D);
        this.ui.p1HpBar = this.add.rectangle(14, 20, 200, 14, 0x00ff66).setOrigin(0, 0).setScrollFactor(0).setDepth(D+1);
        this.ui.p1HpTxt = this.add.text(114, 27, '100', { fontSize: '10px', fontFamily: "'Segoe UI', sans-serif", color: '#fff' }).setOrigin(0.5).setScrollFactor(0).setDepth(D+2);
        this.ui.p1EnBg  = this.add.rectangle(114, 42, 200, 7, 0x2a2a2a).setOrigin(0.5).setScrollFactor(0).setDepth(D);
        this.ui.p1EnBar = this.add.rectangle(14, 39, 200, 7, 0x00aaff).setOrigin(0, 0).setScrollFactor(0).setDepth(D+1);
        this.ui.p1WeapTxt   = this.add.text(14, 52, 'Sword ⚔', { fontSize: '11px', fontFamily: "'Segoe UI', sans-serif", color: '#ffdd44' }).setScrollFactor(0).setDepth(D);
        this.ui.p1ReloadTxt = this.add.text(14, 66, '', { fontSize: '12px', fontFamily: "'Segoe UI', sans-serif", color: '#ff8800', fontStyle: 'bold' }).setScrollFactor(0).setDepth(D);

        // P2 (top-right)
        const rx = GAME_W - 214;
        this.add.text(rx, 8, p2Name + ' 🤖', {
            fontSize: '13px', fontFamily: "'Segoe UI', sans-serif",
            color: '#ff4444', fontStyle: 'bold',
        }).setScrollFactor(0).setDepth(D);

        this.ui.p2HpBg  = this.add.rectangle(rx + 100, 27, 200, 14, 0x2a2a2a).setOrigin(0.5).setScrollFactor(0).setDepth(D);
        this.ui.p2HpBar = this.add.rectangle(rx, 20, 200, 14, 0xff2244).setOrigin(0, 0).setScrollFactor(0).setDepth(D+1);
        this.ui.p2HpTxt = this.add.text(rx + 100, 27, '100', { fontSize: '10px', fontFamily: "'Segoe UI', sans-serif", color: '#fff' }).setOrigin(0.5).setScrollFactor(0).setDepth(D+2);
        this.ui.p2EnBg  = this.add.rectangle(rx + 100, 42, 200, 7, 0x2a2a2a).setOrigin(0.5).setScrollFactor(0).setDepth(D);
        this.ui.p2EnBar = this.add.rectangle(rx, 39, 200, 7, 0x00aaff).setOrigin(0, 0).setScrollFactor(0).setDepth(D+1);
        this.ui.p2WeapTxt = this.add.text(rx, 52, 'Sword ⚔', { fontSize: '11px', fontFamily: "'Segoe UI', sans-serif", color: '#ffdd44' }).setScrollFactor(0).setDepth(D);
    }

    _updateHUD() {
        if (!this.ui || !this.p1Char || !this.p2Char) return;
        const p1 = this.p1Char, p2 = this.p2Char;

        // P1 HP
        const r1 = p1.hp / p1.maxHp;
        this.ui.p1HpBar.width = Math.max(0, r1 * 200);
        this.ui.p1HpBar.fillColor = r1 > 0.5 ? 0x00ff66 : r1 > 0.25 ? 0xffaa00 : 0xff2244;
        this.ui.p1HpTxt.setText(p1.hp + '/' + p1.maxHp);
        this.ui.p1WeapTxt.setText(!p1.weapon ? 'Sword ⚔' : WEAPONS[p1.weapon.type].name + '  ' + p1.weapon.mag + '/' + p1.weapon.reserve);
        this.ui.p1ReloadTxt.setText(p1.weapon?.reloading ? '↺  RELOADING…' : '');

        // P1 energy
        const e1 = p1.energy / MAX_ENERGY;
        this.ui.p1EnBar.width = Math.max(0, e1 * 200);
        this.ui.p1EnBar.fillColor = e1 > 0.2 ? 0x00aaff : 0xff4444;

        // P2 HP
        const r2 = p2.hp / p2.maxHp;
        this.ui.p2HpBar.width = Math.max(0, r2 * 200);
        this.ui.p2HpBar.fillColor = r2 > 0.5 ? 0xff2244 : r2 > 0.25 ? 0xff8800 : 0xff0000;
        this.ui.p2HpTxt.setText(p2.hp + '/' + p2.maxHp);
        this.ui.p2WeapTxt.setText(!p2.weapon ? 'Sword ⚔' : WEAPONS[p2.weapon.type].name + '  ' + p2.weapon.mag + '/' + p2.weapon.reserve);

        // P2 energy
        const e2 = p2.energy / MAX_ENERGY;
        this.ui.p2EnBar.width = Math.max(0, e2 * 200);
        this.ui.p2EnBar.fillColor = e2 > 0.2 ? 0x00aaff : 0xff4444;
    }

    _moveChar(char, leftDown, rightDown, jumpJust, flyDown, dt) {
        if (char.dead) return;
        const vb = char.body.body;
        char.onGround = vb.blocked.down;

        if (leftDown)       { vb.setVelocityX(-MOVE_SPEED); char.facing = -1; }
        else if (rightDown) { vb.setVelocityX( MOVE_SPEED); char.facing =  1; }
        else                { vb.setVelocityX(vb.velocity.x * 0.77); }

        if (jumpJust && char.onGround) {
            vb.setVelocityY(JUMP_VEL);
            if (char.isP1) window.GameAPI?.playSfx('jump');
        }

        this._handleFly(char, flyDown, dt);
    }

    // Jet engine: hold the fly key to lift off. Drains energy while airborne;
    // once energy hits 0 flying stops, and regen starts after the delay.
    _handleFly(char, flyDown, dt) {
        if (char.dead) return;
        if (flyDown && char.energy > 0) {
            char.isFlying = true;
            char.body.body.setVelocityY(FLY_VEL);
            char.energy = Math.max(0, char.energy - ENERGY_DRAIN * dt);
            char.regenDelay = 0;
        } else {
            char.isFlying = false;
            char.regenDelay = Math.min(ENERGY_REGEN_DELAY, char.regenDelay + dt * 1000);
        }
        if (char.regenDelay >= ENERGY_REGEN_DELAY) {
            char.energy = Math.min(MAX_ENERGY, char.energy + ENERGY_REGEN * dt);
        }
    }

    // ── Aiming + mobile touch ──────────────────────────────
    _isTouch() {
        if (window.__forceTouch === true)  return true;
        if (window.__forceTouch === false) return false;
        const d = this.sys.game.device;
        return !!(d.input && d.input.touch)
            || (navigator && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent))
            || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    }

    _setupTouch(fireCb, getChar) {
        if (this._touch) return;
        this._touch = new MobileControls(this, { fire: fireCb, char: getChar });
    }

    // Point the local character's aim at the mouse (desktop) or use the
    // touch aim wheel (mobile).
    _updateAim(char) {
        if (char.dead) return;
        if (this._touch) {
            if (this._touch.aimAngle != null) {
                char.aimAngle = this._touch.aimAngle;
                if (this._touch.aiming) char.facing = Math.cos(char.aimAngle) >= 0 ? 1 : -1;
            }
        } else {
            const ptr = this.input.activePointer;
            const a = Math.atan2(ptr.worldY - (char.body.y - 18), ptr.worldX - char.body.x);
            char.aimAngle = a;
            char.facing = Math.cos(a) >= 0 ? 1 : -1;
        }
    }

    // Faint aim guide: a line from the muzzle toward aimAngle.
    _drawAimLine(char) {
        if (!this._aimG) this._aimG = this.add.graphics().setDepth(4);
        const g = this._aimG;
        g.clear();
        if (!char || char.dead || char.aimAngle == null) return;
        const sx = char.body.x, sy = char.body.y - 18;
        const a  = char.aimAngle, len = 64;
        const ex = sx + Math.cos(a) * len, ey = sy + Math.sin(a) * len;
        g.lineStyle(2, char.isP1 ? 0x00ccff : 0xff4444, 0.3);
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.strokePath();
        g.fillStyle(0xffffff, 0.5);
        g.fillCircle(ex, ey, 3);
    }
}

// ============================================================
//  GAME SCENE — Player vs AI
// ============================================================
class GameScene extends BaseGameScene {
    constructor() { super({ key: 'GameScene' }); }

    preload() { this._genTextures(); }

    create() {
        this._createWorld();
        this.p1Char = this._makeChar(180, 340, true);
        this.p2Char = this._makeChar(900, 340, false);
        this._setupColliders(this.p1Char, this.p2Char);
        this._startTimers();
        this._buildHUD('PLAYER', 'ENEMY AI');
        this.cameras.main.setBounds(0, 0, GAME_W, GAME_H);

        this.keys = this.input.keyboard.addKeys({
            left:   Phaser.Input.Keyboard.KeyCodes.A,
            right:  Phaser.Input.Keyboard.KeyCodes.D,
            jump:   Phaser.Input.Keyboard.KeyCodes.W,
            jump2:  Phaser.Input.Keyboard.KeyCodes.SPACE,
            fly:    Phaser.Input.Keyboard.KeyCodes.SHIFT,
            reload: Phaser.Input.Keyboard.KeyCodes.R,
            drop:   Phaser.Input.Keyboard.KeyCodes.Q,
        });

        this.input.on('pointerdown', ptr => {
            if (this.gameOver || this._touch) return;
            if (ptr.rightButtonDown()) return;
            const p = this.p1Char;
            const a = Math.atan2(ptr.worldY - (p.body.y - 18), ptr.worldX - p.body.x);
            this._firePlayer(a);
        });

        if (this._isTouch()) {
            this._setupTouch((a) => this._firePlayer(a), () => this.p1Char);
        }
    }

    // Fire toward an angle: sword when unarmed, bullet otherwise.
    // `justPress` is true only on the newly-pressed fire edge, so the melee
    // sword swings once per press while held-fire still auto-shoots bullets.
    _firePlayer(angle, justPress) {
        const p = this.p1Char;
        if (this.gameOver || p.dead) return;
        p.facing = Math.cos(angle) >= 0 ? 1 : -1;
        if (!p.weapon) {
            if (justPress !== false) this._sword(p, this.p2Char);
        } else {
            this._spawnBullet(p, angle);
        }
    }

    update(time, delta) {
        if (this.gameOver) return;
        const dt = delta / 1000;

        const k = this.keys;
        const p = this.p1Char;
        const t = this._touch;
        const jumpJust = (Phaser.Input.Keyboard.JustDown(k.jump) || Phaser.Input.Keyboard.JustDown(k.jump2)) || (t ? t.jumpJust : false);
        this._moveChar(p,
            k.left.isDown || (t ? t.moveLeft : false),
            k.right.isDown || (t ? t.moveRight : false),
            jumpJust,
            k.fly.isDown || (t ? t.flyHeld : false),
            dt
        );
        if (Phaser.Input.Keyboard.JustDown(k.reload)) this._reload(p);
        if (Phaser.Input.Keyboard.JustDown(k.drop)) p.weapon = null;
        if (t && t.fireHeld) this._firePlayer(t.aimOrFallback(), t.fireJust);
        this._updateAim(p);
        this._drawChar(p);
        this._drawAimLine(p);
        if (t) t.consume();

        this._aiTick(time, dt);
        this._updateHUD();
        this._tickSwings();
        this._cleanBullets();
    }

    _aiTick(time, dt) {
        const ai = this.p2Char, pl = this.p1Char;
        if (ai.dead || pl.dead) return;
        const vb = ai.body.body;
        ai.onGround = vb.blocked.down;

        const dx   = pl.body.x - ai.body.x;
        const dy   = pl.body.y - ai.body.y;
        const dist = Math.hypot(dx, dy);
        ai.facing  = dx > 0 ? 1 : -1;

        const shouldFly = (
            dist > 180 ||            // if player far, use jet to close distance
            dy < -60 ||              // if player is above, try to lift
            (Math.abs(dy) > 90 && ai.energy > 20)
        );

        if (dist > 55) vb.setVelocityX(ai.facing * MOVE_SPEED * 0.88);
        else           vb.setVelocityX(0);

        if ((vb.blocked.left || vb.blocked.right) && ai.onGround) vb.setVelocityY(JUMP_VEL);
        if (dy < -60 && ai.onGround) vb.setVelocityY(JUMP_VEL);

        this._handleFly(ai, shouldFly, dt);


        // Use jet engine when appropriate
        this._handleFly(ai, shouldFly, dt);

        if (!ai.weapon) {
            if (dist < SWORD_RANGE + 10) this._sword(ai, pl);
        } else {
            const range = ai.weapon.type === 'launcher' ? 290 : 490;
            if (dist < range) this._aiShoot(ai, time);
            if (ai.weapon.mag <= 0 && !ai.weapon.reloading) this._reload(ai);
        }

        this._drawChar(ai);
    }

    _aiShoot(ai, time) {
        const w = ai.weapon, def = WEAPONS[w.type];
        if (!w || w.reloading || w.mag <= 0) return;
        if (time - w.lastShot < def.fireRate * 1.45) return;

        w.lastShot = time; w.mag--;
        const pl = this.p1Char;
        const baseAngle = Math.atan2((pl.body.y - 15) - ai.body.y, pl.body.x - ai.body.x);
        const angle = baseAngle + (Math.random() - 0.5) * (def.spread + 0.09);
        
        const isR = w.type === 'launcher';
        const spX = ai.body.x + ai.facing * 32, spY = ai.body.y - 18;

        const bullet = this.physics.add.image(spX, spY, isR ? 'rocket' : 'bullet');
        bullet.setTint(0xff8800).setDepth(8);
        bullet.setDisplaySize(8, 8);
        this.bullets.add(bullet);
        bullet.body.setAllowGravity(isR);
        if (isR) bullet.body.setGravityY(80);
        bullet.body.setMaxVelocity(1600, 1600);
        bullet.body.setVelocity(Math.cos(angle) * def.bulletSpeed, Math.sin(angle) * def.bulletSpeed);
        bullet.body.setSize(6, 6);
        bullet.body.setOffset(1, 1);
        bullet.bData = { 
            owner: ai, 
            type: w.type, 
            damage: def.damage, 
            splash: def.splashDamage || 0, 
            radius: def.splashRadius || 0 
        };
        window.GameAPI?.playSfx(isR ? 'launcher' : (w.type === 'akm' ? 'rifle' : 'gun'));
        this._flash(spX, spY, 0xff8800);
        if (w.mag <= 0 && w.reserve > 0) this._reload(ai);
    }
}

// ============================================================
//  PvP LOCAL SCENE
// ============================================================
class PvPLocalScene extends BaseGameScene {
    constructor() { super({ key: 'PvPLocalScene' }); }

    preload() { this._genTextures(); }

    create() {
        this._createWorld();
        this.p1Char = this._makeChar(180, 340, true);
        this.p2Char = this._makeChar(900, 340, false);
        this._setupColliders(this.p1Char, this.p2Char);
        this._startTimers();
        this._buildHUD('PLAYER 1', 'PLAYER 2');
        this.cameras.main.setBounds(0, 0, GAME_W, GAME_H);

        this.k1 = this.input.keyboard.addKeys({
            left:   Phaser.Input.Keyboard.KeyCodes.A,
            right:  Phaser.Input.Keyboard.KeyCodes.D,
            jump:   Phaser.Input.Keyboard.KeyCodes.W,
            fly:    Phaser.Input.Keyboard.KeyCodes.SHIFT,
            shoot:  Phaser.Input.Keyboard.KeyCodes.F,
            reload: Phaser.Input.Keyboard.KeyCodes.R,
        });

        this.k2 = this.input.keyboard.addKeys({
            left:   Phaser.Input.Keyboard.KeyCodes.LEFT,
            right:  Phaser.Input.Keyboard.KeyCodes.RIGHT,
            jump:   Phaser.Input.Keyboard.KeyCodes.UP,
            fly:    Phaser.Input.Keyboard.KeyCodes.CTRL,
            shoot:  Phaser.Input.Keyboard.KeyCodes.L,
            reload: Phaser.Input.Keyboard.KeyCodes.K,
        });

        this.add.text(GAME_W/2, GAME_H - 8,
            'P1: A/D · W Jump · SHIFT Fly · F Attack · R Reload     ||     P2: ←/→ · ↑ Jump · CTRL Fly · L Attack · K Reload',
            { fontSize: '10px', fontFamily: "'Segoe UI', sans-serif", color: '#666688' }
        ).setOrigin(0.5, 1).setScrollFactor(0).setDepth(30);
    }

    update(time, delta) {
        if (this.gameOver) return;
        const dt = delta / 1000;

        this._handleLocal(this.p1Char, this.k1, this.p2Char, dt);
        this._handleLocal(this.p2Char, this.k2, this.p1Char, dt);
        this._updateHUD();
        this._tickSwings();
        this._cleanBullets();
    }

    _handleLocal(char, keys, opponent, dt) {
        this._moveChar(char,
            keys.left.isDown, keys.right.isDown,
            Phaser.Input.Keyboard.JustDown(keys.jump),
            keys.fly.isDown,
            dt
        );
        if (Phaser.Input.Keyboard.JustDown(keys.shoot)) {
            if (!char.weapon) this._sword(char, opponent);
            else this._spawnBullet(char);
        }
        if (Phaser.Input.Keyboard.JustDown(keys.reload)) this._reload(char);
        this._drawChar(char);
    }
}

// ============================================================
//  PvP ONLINE SCENE
// ============================================================
class PvPOnlineScene extends BaseGameScene {
    constructor() { super({ key: 'PvPOnlineScene' }); }

    init(data) {
        this._isHost  = data.isHost;
        this._peer    = data.peer;
        this._conn    = data.conn;
        this._syncT   = 0;
        this._syncHz  = 50;
        this.mapId    = (data && data.mapId) || 'classic';
    }

    preload() { this._genTextures(); }

    create() {
        this._createWorld();

        this.p1Char = this._makeChar(180, 340, true);
        this.p2Char = this._makeChar(900, 340, false);
        this._setupColliders(this.p1Char, this.p2Char);
        this._startTimers();
        this._buildHUD(this._isHost ? 'YOU (HOST)' : 'OPPONENT', this._isHost ? 'OPPONENT' : 'YOU (GUEST)');
        this.cameras.main.setBounds(0, 0, GAME_W, GAME_H);

        this._local  = this._isHost ? this.p1Char : this.p2Char;
        this._remote = this._isHost ? this.p2Char : this.p1Char;

        this.keys = this.input.keyboard.addKeys({
            left:   Phaser.Input.Keyboard.KeyCodes.A,
            right:  Phaser.Input.Keyboard.KeyCodes.D,
            jump:   Phaser.Input.Keyboard.KeyCodes.W,
            jump2:  Phaser.Input.Keyboard.KeyCodes.SPACE,
            fly:    Phaser.Input.Keyboard.KeyCodes.SHIFT,
            reload: Phaser.Input.Keyboard.KeyCodes.R,
            drop:   Phaser.Input.Keyboard.KeyCodes.Q,
        });
        this.input.on('pointerdown', ptr => {
            if (this.gameOver || this._touch) return;
            if (ptr.rightButtonDown()) return;
            const c = this._local;
            const a = Math.atan2(ptr.worldY - (c.body.y - 18), ptr.worldX - c.body.x);
            this._fireLocal(a);
        });

        if (this._isTouch()) {
            this._setupTouch((a) => this._fireLocal(a), () => this._local);
        }

        if (this._conn) {
            this._conn.on('data',  data => this._onData(data));
            this._conn.on('close', ()   => this._floatTxt(GAME_W/2, 80, 'Opponent disconnected', 0xff5555, '20px'));
        } else {
            this._floatTxt(GAME_W/2, 80, '⚠ No connection — press ESC for menu', 0xff5555, '18px');
        }

        this.input.keyboard.once('keydown-ESC', () => {
            this._cleanup(); this.scene.start('MenuScene');
        });
    }

    _cleanup() {
        try { if (this._conn) this._conn.close(); } catch (_) {}
        try { if (this._peer) this._peer.destroy(); } catch (_) {}
    }

    _onData(data) {
        if (!data) return;
        const rem = this._remote;
        switch (data.type) {
            case 'STATE':
                if (rem.dead) break;
                rem.body.body.reset(data.bx, data.by);
                rem.body.body.setVelocity(data.vx, data.vy);
                rem.facing   = data.facing;
                rem.hp       = data.hp;
                rem.weapon   = data.weapon || null;
                rem.isFlying = !!data.flying;
                if (data.hp <= 0 && !rem.dead) this._die(rem);
                else this._drawChar(rem);
                break;

            case 'BULLET': {
                const isR  = data.weapType === 'launcher';
                const bull = this.physics.add.image(data.x, data.y, isR ? 'rocket' : 'bullet');
                bull.setTint(data.color).setDepth(8);
                bull.setDisplaySize(8, 8);
                this.bullets.add(bull);
                bull.body.setAllowGravity(isR);
                if (isR) bull.body.setGravityY(80);
                bull.body.setMaxVelocity(1600, 1600);
                bull.body.setVelocity(data.vx, data.vy);
                bull.body.setSize(6, 6);
                bull.body.setOffset(1, 1);
                bull.bData = { owner: rem, type: data.weapType, damage: data.damage, splash: data.splash || 0, radius: data.radius || 0 };
                break;
            }

            case 'SWORD':
                this._sword(rem, this._local);
                break;
        }
    }

    _sendState() {
        if (!this._conn?.open) return;
        const c = this._local;
        const b = c.body.body;
        this._conn.send({
            type:     'STATE',
            bx:       b.x,
            by:       b.y,
            vx:       b.velocity.x,
            vy:       b.velocity.y,
            facing:   c.facing,
            hp:       c.hp,
            flying:   c.isFlying,
            weapon:   c.weapon ? { type: c.weapon.type, mag: c.weapon.mag, reserve: c.weapon.reserve } : null,
        });
    }

    _netShoot(angle) {
        const c   = this._local;
        const w   = c.weapon;
        if (!w) return;
        const def = WEAPONS[w.type];
        const fired = this._spawnBullet(c, angle);
        if (fired && this._conn?.open) {
            const isR = w.type === 'launcher';
            const spX = c.body.x + c.facing * 32, spY = c.body.y - 18;
            const a = angle !== undefined ? angle : 0;
            this._conn.send({
                type:    'BULLET',
                x: spX, y: spY,
                vx: Math.cos(a) * def.bulletSpeed,
                vy: Math.sin(a) * def.bulletSpeed,
                weapType: w.type, damage: def.damage,
                splash: def.splashDamage || 0, radius: def.splashRadius || 0,
                isLauncher: isR, color: def.color,
            });
        }
    }

    // Fire toward an angle: sword when unarmed, networked bullet otherwise.
    // `justPress` is true only on a fresh fire edge (melee swings once).
    _fireLocal(angle, justPress) {
        const c = this._local;
        if (this.gameOver || c.dead) return;
        if (!c.weapon) {
            if (justPress !== false) {
                c.facing = Math.cos(angle) >= 0 ? 1 : -1;
                this._sword(c, this._remote);
            }
        } else {
            this._netShoot(angle);
        }
    }

    update(time, delta) {
        if (this.gameOver) return;
        const dt = delta / 1000;
        const k  = this.keys;
        const c  = this._local;
        const t  = this._touch;
        const jumpJust = (Phaser.Input.Keyboard.JustDown(k.jump) || Phaser.Input.Keyboard.JustDown(k.jump2)) || (t ? t.jumpJust : false);
        this._moveChar(c,
            k.left.isDown || (t ? t.moveLeft : false),
            k.right.isDown || (t ? t.moveRight : false),
            jumpJust,
            k.fly.isDown || (t ? t.flyHeld : false),
            dt
        );
        if (Phaser.Input.Keyboard.JustDown(k.reload)) this._reload(c);
        if (Phaser.Input.Keyboard.JustDown(k.drop))   c.weapon = null;
        if (t && t.fireHeld) this._fireLocal(t.aimOrFallback(), t.fireJust);
        this._updateAim(c);
        this._drawChar(c);
        this._drawAimLine(c);
        if (t) t.consume();

        this._updateHUD();
        this._tickSwings();
        this._cleanBullets();

        if (time - this._syncT > this._syncHz) {
            this._syncT = time;
            this._sendState();
        }
    }

    _sword(attacker, target) {
        super._sword(attacker, target);
        if (attacker === this._local && this._conn?.open) {
            this._conn.send({ type: 'SWORD' });
        }
    }
}

// ============================================================
//  MAP SELECT SCENE (chooses a battlefield before every match)
// ============================================================
class MapSelectScene extends Phaser.Scene {
    constructor() { super({ key: 'MapSelectScene' }); }

    init(data) {
        this._next     = data.next || 'GameScene';
        this._extra    = data.extra || {};
        this._mapId    = null;
        this._left     = 10;
    }

    create() {
        paintBackground(this);

        this.add.text(GAME_W/2, 55, '🗺  SELECT MAP', {
            fontFamily: "'Segoe UI', sans-serif",
            fontSize: '40px', fontStyle: 'bold', color: '#00e5ff',
            stroke: '#002233', strokeThickness: 7,
        }).setOrigin(0.5);
        this.add.text(GAME_W/2, 92, 'Pick a battlefield — or wait 10s and a random one is chosen', {
            fontFamily: "'Segoe UI', sans-serif", fontSize: '14px', color: '#8899bb',
        }).setOrigin(0.5);

        const _this = this;
        MAPS.forEach((m, i) => {
            const y = 175 + i * 92;
            // Skyline strip preview (scaled platforms + ground line)
            const pvs = this.add.graphics();
            const s = 0.11, px0 = _this ? (GAME_W/2 - 280) : 0, baseY = y + 8;
            pvs.fillStyle(0x1a2440, 0.85);
            pvs.fillRect(px0 - 4, baseY - 46, 128, 50);
            pvs.fillStyle(0x3355aa, 0.9);
            m.layout.forEach(pl => {
                pvs.fillRect(px0 + pl[0] * s, baseY - (pl[1] / 600) * 44, pl[2] * s, 3);
            });
            pvs.fillStyle(0x88dd66, 1);
            pvs.fillRect(px0, baseY + 2, 122, 3); // ground line

            makeButton(this, GAME_W/2, y, '▶  ' + m.name + '   —   ' + m.desc, 620, 64, m.color, m.colorDark, () => {
                this._go(m.id);
            });
        });

        makeButton(this, GAME_W/2, 485, '🎲  RANDOM', 300, 56, 0x335577, 0x223344, () => {
            this._go(null);
        });

        this._cdTxt = this.add.text(GAME_W/2, 548, 'Auto-random in 10s…', {
            fontFamily: "'Segoe UI', sans-serif", fontSize: '15px', color: '#aabbdd',
        }).setOrigin(0.5);

        this._tick = this.time.addEvent({
            delay: 1000, loop: true, callback: () => {
                this._left -= 1;
                this._cdTxt.setText('Auto-random in ' + Math.max(0, this._left) + 's…');
                if (this._left <= 0) this._go(null);
            },
        });

        this.input.keyboard.once('keydown-ESC', () => this._exit());
    }

    _go(mapId) {
        if (this._launching) return;
        this._launching = true;
        if (this._tick) this._tick.remove(false);
        if (!mapId) mapId = MAPS[Phaser.Math.Between(0, MAPS.length - 1)].id;
        // Host: tell the guest which map was chosen, then both start the match.
        if (this._extra.isHost && this._extra.conn && this._extra.conn.open) {
            try { this._extra.conn.send({ type: 'MAP', map: mapId }); } catch (_) {}
        }
        this.scene.start(this._next, { ...this._extra, mapId });
    }

    _exit() {
        if (this._extra.conn) { try { this._extra.conn.close(); } catch (_) {} }
        if (this._extra.peer) { try { this._extra.peer.destroy(); } catch (_) {} }
        this.scene.start('PvPMenuScene', { });
    }
}

// ============================================================
//  PHASER CONFIG
// ============================================================

const config = {
    type:   Phaser.AUTO,
    width:  GAME_W,
    height: GAME_H,
    parent: 'game-container',
    backgroundColor: '#030308',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: GAME_W,
        height: GAME_H,
    },
    input: {
        activePointers: 4,
    },
    physics: {
        default: 'arcade',
        arcade:  { gravity: { y: 0 }, debug: false },
    },
    scene: [MenuScene, HowToScene, MapSelectScene, PvPMenuScene, GameScene, PvPLocalScene, PvPOnlineScene],
};

const GAME = new Phaser.Game(config);

// Audio manager: public sound-library effects with a WebAudio fallback.
const AudioManager = (function(){
    let ctx = null, musicTrack = null, musicIndex = 0;
    let settings = { muted: false, master: 0.7, music: 0.16, sfx: 0.3, track: 0 };
    const musicTracks = [
        'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
        'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    ];
    const effectUrls = {
        gun: 'https://labs.phaser.io/assets/audio/SoundEffects/shot1.wav',
        rifle: 'https://labs.phaser.io/assets/audio/SoundEffects/shot2.wav',
        launcher: 'https://labs.phaser.io/assets/audio/SoundEffects/explosion.mp3',
        sword: 'https://assets.mixkit.co/active_storage/sfx/1485/1485-preview.mp3',
    };
    function ensure() {
        if (ctx) return;
        ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return {
        playSfx(type) {
            try {
                if (effectUrls[type]) {
                    const sound = new Audio(effectUrls[type]);
                    sound.volume = (type === 'launcher' ? 0.42 : 0.3) * settings.master * settings.sfx;
                    if (settings.muted) return;
                    sound.play().catch(() => this.playTone(type));
                    return;
                }
                this.playTone(type);
            } catch (e) { /* ignore */ }
        },
        playTone(type) {
            try {
                ensure();
                if (ctx.state === 'suspended') ctx.resume();
                if (settings.muted) return;
                const g = ctx.createGain(); g.gain.value = 0.12 * settings.master * settings.sfx;
                const o = ctx.createOscillator();
                const tones = {
                    gun: [900, 0.06, 'square'], rifle: [740, 0.08, 'square'], launcher: [90, 0.28, 'sawtooth'],
                    sword: [320, 0.12, 'sawtooth'],
                    reload: [180, 0.16, 'triangle'], pickup: [660, 0.12, 'sine'],
                    heal: [520, 0.14, 'sine'], hit: [120, 0.08, 'square'],
                    defeat: [70, 0.35, 'sawtooth'], jump: [260, 0.08, 'triangle'],
                };
                const [frequency, duration, wave] = tones[type] || tones.hit;
                o.type = wave;
                o.frequency.value = frequency;
                o.connect(g); g.connect(ctx.destination);
                o.start(); o.stop(ctx.currentTime + duration);
            } catch (e) { /* ignore */ }
        },
        playMusic() {
            try {
                if (settings.muted || settings.music <= 0) return;
                if (!musicTrack || musicIndex !== settings.track) {
                    if (musicTrack) { musicTrack.pause(); musicTrack = null; }
                    musicIndex = settings.track;
                    musicTrack = new Audio(musicTracks[musicIndex]);
                    musicTrack.volume = settings.master * settings.music;
                    musicTrack.onended = () => {
                        musicIndex = (musicIndex + 1) % musicTracks.length;
                        musicTrack = null;
                        this.playMusic();
                    };
                }
                musicTrack.play().catch(() => {});
            } catch (e) {}
        },
        setSoundSettings(next) {
            settings = { ...settings, ...next };
            if (musicTrack) musicTrack.volume = settings.muted ? 0 : settings.master * settings.music;
            if (settings.muted || settings.music <= 0) this.stopMusic();
            else this.playMusic();
        },
        stopMusic() { try { if (musicTrack) { musicTrack.pause(); musicTrack.currentTime = 0; musicTrack = null; } } catch(e){} }
    };
})();

// Global API exposed for the UI to call into the game
window.GameAPI = {
    goHome() {
        window.ShopUI?.close();
        if (GAME.scene.isActive('MenuScene')) return;
        GAME.scene.start('MenuScene');
    },
    setLocalSkin(skinId) {
        try {
            for (const key in GAME.scene.keys) {
                const sc = GAME.scene.keys[key];
                if (sc && sc.p1Char) { sc.p1Char.skin = skinId; sc._drawChar(sc.p1Char); }
            }
            window.__selectedSkin = skinId;
        } catch (e) { console.warn('setLocalSkin failed', e); }
    },
    setSoundSettings(ss) { AudioManager.setSoundSettings(ss); },
    playSfx(name) { AudioManager.playSfx(name); },
    playMusic() { AudioManager.playMusic(); },
    stopMusic() { AudioManager.stopMusic(); }
};

let savedSoundSettings = null;
try { savedSoundSettings = JSON.parse(localStorage.getItem('sound-settings') || 'null'); } catch (_) { localStorage.removeItem('sound-settings'); }
if (savedSoundSettings) AudioManager.setSoundSettings(savedSoundSettings);

// Apply selected skin when new characters are created (small helper)
(function(){
    const oldMake = BaseGameScene.prototype._makeChar;
    BaseGameScene.prototype._makeChar = function(x,y,isP1){
        const c = oldMake.call(this,x,y,isP1);
        if (isP1 && window.__selectedSkin) c.skin = window.__selectedSkin;
        return c;
    };
})();