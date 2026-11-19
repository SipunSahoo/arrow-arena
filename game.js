'use strict';
// Arrow Arena prototype 0.6: top-down free-for-all archery brawler. Everyone starts with Classic arrows and can carry
// three types; stronger types (tiers I-III) come from level-ups and from quivers found on the ground.
// XP, levels, upgrades, power-ups and three bot difficulties.
// Plain canvas, no libraries.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const ARENA_R = 1200;
const DRAW_TIME = 0.75;      // seconds to a full draw
const SHOT_CD = 0.45;        // gap after every shot, so tapping cannot out-damage full draws
const EFFECT_CHARGE = 0.5;   // an arrow's type effect (burn, freeze, poison, chain, blast) needs at least half a draw
const ORB_TARGET = 150;      // loose XP dots kept on the ground
const MAX_LEVEL = 20;
const DASH_CHARGES = 2;      // double dash: two charges
const DASH_RECHARGE = 1.6;   // seconds to refill one charge
const DASH_BUFFER = 0.25;    // a press during a dash is kept this long, so a double tap chains
const BASE_R = 22;
const sizeFor = level => BASE_R + (level - 1) * 1.0;        // level 20 is almost twice as wide: an easier target
const speedFor = level => 1 - 0.012 * (level - 1);          // and about a quarter slower
const xpNeed = level => 6 + level * 6;

const UPGRADES = [
  { id: 'dmg', name: 'Sharp Arrows', desc: '+15% damage on everything you shoot', max: 5 },
  { id: 'draw', name: 'Quick Draw', desc: 'Draw the bow 15% faster', max: 4 },
  { id: 'speed', name: 'Swift Feet', desc: '+8% move speed', max: 4 },
  { id: 'hp', name: 'Vitality', desc: '+20 max HP, and heals 20 now', max: 5 },
  { id: 'multi', name: 'Multishot', desc: 'One more arrow on every bow shot', max: 3 },
  { id: 'pierce', name: 'Piercing Tips', desc: 'Bow arrows pass through one more enemy', max: 2 },
  { id: 'range', name: 'Longbow', desc: 'Arrows fly 20% faster and further', max: 3 },
  { id: 'vamp', name: 'Lifesteal', desc: 'Heal 4% of the damage you deal', max: 3 },
  { id: 'reload', name: 'Steady Hands', desc: 'Ready to shoot again 20% sooner', max: 3 },
  { id: 'magnet', name: 'Magnet', desc: 'Pull XP dots from 50% further away', max: 3 },
  { id: 'ricochet', name: 'Ricochet', desc: 'Arrows bounce off rocks and walls once more', max: 2 },
  { id: 'regen', name: 'Regeneration', desc: 'Heal 1.5 HP every second', max: 3 },
  { id: 'back', name: 'Back Shot', desc: 'Every bow shot also fires one arrow behind you', max: 1 },
  { id: 'ice', name: 'Frost Tips', desc: 'Fully drawn arrows slow whoever they hit', max: 1 },
];
const UP_COL = { dmg: '#ff6b6b', draw: '#ffb020', speed: '#5ab0ff', hp: '#4ade80', multi: '#f472b6', pierce: '#8fe3ff', range: '#e8d9b0',
  vamp: '#ef4444', reload: '#c084fc', magnet: '#5eead4', ricochet: '#facc15', regen: '#86efac', back: '#fb923c', ice: '#bfe9ff' };
// Draws an upgrade's symbol centred on (x, y), about 2*s wide. Drawn in a 20x20 box and scaled.
function drawUpIcon(g, id, x, y, s, col = UP_COL[id]) {
  g.save(); g.translate(x, y); g.scale(s / 10, s / 10);
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round';
  const line = (pts) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); };
  const arrow = (x1, y1, x2, y2, hs = 4) => {
    line([x1, y1, x2, y2]);
    const a = Math.atan2(y2 - y1, x2 - x1);
    g.beginPath(); g.moveTo(x2 + Math.cos(a) * 2, y2 + Math.sin(a) * 2);
    g.lineTo(x2 - Math.cos(a - 0.5) * hs, y2 - Math.sin(a - 0.5) * hs); g.lineTo(x2 - Math.cos(a + 0.5) * hs, y2 - Math.sin(a + 0.5) * hs); g.closePath(); g.fill();
  };
  switch (id) {
    case 'dmg': g.beginPath(); g.moveTo(9, -9); g.lineTo(-3, -6); g.lineTo(6, 3); g.closePath(); g.fill(); line([-8, 8, 2, -2]); line([-9, -4, -9, 2]); line([-12, -1, -6, -1]); break;
    case 'draw': g.beginPath(); g.arc(-6, 0, 9, -1.2, 1.2); g.stroke(); line([-2.7, -8.4, -2.7, 8.4]); arrow(-2, 0, 9, 0); line([2, -6, 6, -6]); line([2, 6, 6, 6]); break;
    case 'speed': line([-9, -7, -2, 0, -9, 7]); line([0, -7, 7, 0, 0, 7]); break;
    case 'hp': g.beginPath(); g.moveTo(0, 8); g.bezierCurveTo(-13, -1, -6, -12, 0, -4); g.bezierCurveTo(6, -12, 13, -1, 0, 8); g.fill(); break;
    case 'multi': arrow(-8, 8, 8, -8, 3.5); arrow(-8, 8, 9, 0, 3.5); arrow(-8, 8, 0, -9, 3.5); break;
    case 'pierce': g.beginPath(); g.arc(1, 0, 5, 0, TAU); g.stroke(); arrow(-10, 0, 9, 0); break;
    case 'range': arrow(-10, 2, 9, 2); line([-5, -6, -5, -2]); line([0, -6, 0, -2]); line([5, -6, 5, -2]); break;
    case 'vamp': g.beginPath(); g.moveTo(0, -9); g.bezierCurveTo(4, -3, 8, 1, 7, 4); g.arc(0, 4, 7, 0, Math.PI); g.bezierCurveTo(-8, 1, -4, -3, 0, -9); g.fill(); break;
    case 'reload': g.beginPath(); g.arc(0, 0, 7, -0.3, 4.4); g.stroke(); arrow(-2.2, -6.6, 2.5, -6.8, 4); line([0, -3, 0, 0, 3, 2]); break;
    case 'magnet': g.lineWidth = 4; g.beginPath(); g.moveTo(-6, -8); g.lineTo(-6, 0); g.arc(0, 0, 6, Math.PI, 0, true); g.lineTo(6, -8); g.stroke();
      g.strokeStyle = '#ffffff'; g.beginPath(); g.moveTo(-6, -8); g.lineTo(-6, -5); g.moveTo(6, -8); g.lineTo(6, -5); g.stroke(); break;
    case 'ricochet': g.lineWidth = 3; line([9, -10, 9, 10]); g.lineWidth = 2.2; line([-9, 7, 6, -1]); arrow(6, -1, -6, -8, 3.5); break;
    case 'regen': g.beginPath(); g.arc(0, 0, 8, 0.4, TAU - 0.4); g.stroke(); line([0, -4, 0, 4]); line([-4, 0, 4, 0]); break;
    case 'back': arrow(1, 0, 10, 0, 3.5); arrow(-1, 0, -10, 0, 3.5); g.beginPath(); g.arc(0, 0, 2, 0, TAU); g.fill(); break;
    case 'ice': for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3, c = Math.cos(a) * 9, n = Math.sin(a) * 9; line([-c, -n, c, n]);
        for (const sg of [-1, 1]) { const bx = c * 0.6 * sg, by = n * 0.6 * sg, pa = a + Math.PI / 2; line([bx, by, bx + Math.cos(pa) * 2.5 + c * 0.2 * sg, by + Math.sin(pa) * 2.5 + n * 0.2 * sg]); line([bx, by, bx - Math.cos(pa) * 2.5 + c * 0.2 * sg, by - Math.sin(pa) * 2.5 + n * 0.2 * sg]); } } break;
  }
  g.restore();
}
const freshUpgrades = () => Object.fromEntries(UPGRADES.map(u => [u.id, 0]));

const POWERUPS = {
  rage: { col: '#ff4d4d', label: 'RAGE', sym: '×2', note: 'double damage for 10s' },
  haste: { col: '#5ab0ff', label: 'HASTE', sym: '»', note: 'faster moving and drawing for 10s' },
  bubble: { col: '#7ad7ff', label: 'SHIELD', sym: '◆', note: 'absorbs the next 40 damage' },
  heal: { col: '#4ade80', label: 'HEAL', sym: '+', note: '+40 HP' },
  vision: { col: '#c084fc', label: 'VISION', sym: '◎', note: 'see much more of the arena for 15s' },
  volley: { col: '#ffc400', label: 'VOLLEY', sym: '✸', note: 'a ring of 16 arrows, then 10s of faster, stronger shots' },
};
// Volley is the rare one: one slot in nine.
const POWERUP_ROLL = ['rage', 'haste', 'bubble', 'heal', 'vision', 'rage', 'haste', 'bubble', 'heal', 'vision', 'volley'];
const VISION_ZOOM = 0.72;   // camera scale while VISION is active: about twice the arena area on screen

// Arrow types. Everyone carries all of them and switches between them (Q / E, wheel, 1-7, or SWITCH on a phone).
const WEAPONS = {
  classic: { name: 'Classic', col: '#e8d9b0', desc: 'Balanced. A full draw hits hardest', dmg: 1, speed: 1, draw: 1 },
  fire: { name: 'Fire', col: '#ff6a00', desc: 'Sets enemies on fire: extra damage over 3 seconds', dmg: 0.85, speed: 1, draw: 1 },
  frost: { name: 'Frost', col: '#9be7ff', desc: 'Slows on hit. A full draw freezes them solid', dmg: 0.85, speed: 1, draw: 1 },
  explosive: { name: 'Explosive', col: '#ff8a3d', desc: 'Explodes where it lands. A full draw blows people away', dmg: 0.65, speed: 0.9, draw: 0.85 },
  piercing: { name: 'Piercing', col: '#8fe3ff', desc: 'Goes through everyone. A full draw breaks shields', dmg: 0.9, speed: 1.35, draw: 0.95 },
  poison: { name: 'Poison', col: '#7bd85c', desc: 'Poison that stacks up to 3 times', dmg: 0.8, speed: 1, draw: 1.05 },
  lightning: { name: 'Lightning', col: '#ffe95a', desc: 'Very fast. Jumps to a second enemy', dmg: 0.8, speed: 1.25, draw: 1 },
};
const WEAPON_IDS = Object.keys(WEAPONS);
const SPECIAL_IDS = WEAPON_IDS.filter(id => id !== 'classic');
const RARITY = { fire: 3, frost: 3, poison: 3, explosive: 2, piercing: 2, lightning: 2 };   // higher = more common
const MAX_SLOTS = 3;
const DROP_LIFE = 6;   // seconds a dropped quiver (from a knock-out or a swap) stays on the ground
const ROMAN = ['', 'I', 'II', 'III'];
const tierMult = t => 1 + 0.25 * (t - 1);   // tier II hits 25% harder, tier III 50%
function rollType(exclude = []) {
  const pool = SPECIAL_IDS.filter(id => !exclude.includes(id));
  const list = pool.length ? pool : SPECIAL_IDS;
  let total = 0; for (const id of list) total += RARITY[id];
  let r = Math.random() * total;
  for (const id of list) { r -= RARITY[id]; if (r <= 0) return id; }
  return list[0];
}
// luck plus level: the higher the level, the better the odds of tier II and III
function rollTier(level) {
  const r = Math.random(), t3 = Math.min(0.04 + level * 0.02, 0.35), t2 = Math.min(0.22 + level * 0.03, 0.5);
  return r < t3 ? 3 : r < t3 + t2 ? 2 : 1;
}

// How the bots play. "hard" is how they played before 0.4.
const DIFFICULTY = {
  easy: { name: 'Easy', aim: 0.32, lead: 0.3, dodge: 1.2, dashDodge: 0.35, block: 0.5, skill: 0.3, wait: [0.4, 1.0], full: 0.2, dmg: 0.65, playerBias: 1.6, keep: [300, 420] },
  normal: { name: 'Normal', aim: 0.2, lead: 0.55, dodge: 3.5, dashDodge: 0.5, block: 0.8, skill: 0.6, wait: [0.15, 0.5], full: 0.35, dmg: 0.85, playerBias: 1.25, keep: [260, 380] },
  hard: { name: 'Hard', aim: 0.12, lead: 0.8, dodge: 7, dashDodge: 0.6, block: 1, skill: 1, wait: [0, 0.12], full: 0.45, dmg: 1, playerBias: 1, keep: [240, 340] },
};
const settings = { difficulty: 'easy' };
try {
  const saved = JSON.parse(localStorage.getItem('arrowArena.settings') || '{}');
  if (DIFFICULTY[saved.difficulty]) settings.difficulty = saved.difficulty;
} catch (e) { /* storage blocked: defaults are fine */ }
function saveSettings() { try { localStorage.setItem('arrowArena.settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } }
const D = () => DIFFICULTY[settings.difficulty];

// ---------- canvas ----------
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1, VIEW = 1, zoom = 1, VS = 1;   // VS = VIEW x zoom, the scale actually drawn
// UIS: on phones the whole game (arena, HUD, buttons) is drawn this much bigger. W and H are the game's own
// units (screen pixels / UIS), so every layout rule below stays the same and simply comes out larger.
let UIS = 1, PHONE = false;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 3);
  const cw = window.innerWidth, chh = window.innerHeight, m = Math.min(cw, chh);
  PHONE = m < 500 && window.matchMedia('(pointer: coarse)').matches;
  UIS = PHONE ? clamp(m / 285, 1.05, 1.35) : 1;
  W = cw / UIS; H = chh / UIS;
  canvas.width = Math.round(cw * DPR); canvas.height = Math.round(chh * DPR);
  canvas.style.width = cw + 'px'; canvas.style.height = chh + 'px';
  // phones also zoom the arena in: archers were half size before
  VIEW = PHONE ? clamp(Math.min(W, H) / 420, 0.66, 1) : clamp(Math.min(W, H) / 820, 0.5, 1.05);
  VS = VIEW * zoom;
}
// size factor for the touch controls (in game units)
const touchK = () => clamp(Math.min(W, H) / 400, 0.8, 1.1);
window.addEventListener('resize', resize);
resize();

// ---------- arena ----------
let seed = 7;
const srand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pillars = [];
for (let i = 0; i < 20; i++) {
  for (let tries = 0; tries < 60; tries++) {
    const a = srand() * TAU, d = 200 + srand() * (ARENA_R - 320), r = 32 + srand() * 48;
    const x = Math.cos(a) * d, y = Math.sin(a) * d;
    if (pillars.every(p => Math.hypot(p.x - x, p.y - y) > p.r + r + 110)) { pillars.push({ x, y, r }); break; }
  }
}

// ---------- world state ----------
let fighters = [], arrows = [], stuck = [], particles = [], rings = [], texts = [], feed = [];
let orbs = [], powerups = [], puTimer = 3, bolts = [], quivers = [], qTimer = 6;
let hitStop = 0, shake = 0, running = false, paused = false, choosing = false;
let offer = null;   // the 3 cards for the oldest level-up you have not picked yet
let player = null;
const cam = { x: 0, y: 0 };

function freeSpot(margin = 45) {
  let best = null, bestScore = -1;
  for (let i = 0; i < 40; i++) {
    const a = rand(0, TAU), d = Math.sqrt(Math.random()) * (ARENA_R - 100);
    const x = Math.cos(a) * d, y = Math.sin(a) * d;
    if (pillars.some(p => Math.hypot(p.x - x, p.y - y) < p.r + margin)) continue;
    let near = 1e9;
    for (const f of fighters) if (!f.dead && f.x !== undefined) near = Math.min(near, Math.hypot(f.x - x, f.y - y));
    if (near > bestScore) { bestScore = near; best = { x, y }; }
    if (near > 500) break;
  }
  return best || { x: 0, y: 0 };
}

class Fighter {
  constructor(name, color, isBot) {
    this.name = name; this.color = color; this.isBot = isBot;
    this.r = 22; this.kills = 0; this.deaths = 0;
    this.ai = { target: null, retarget: 0, strafe: 1, strafeT: 0, block: 0, flee: 0, want: 0.6, keep: rand(...D().keep), aimErr: 0, wait: 0, switchT: rand(3, 8) };
    this.spawn();
  }
  spawn() {
    const p = freeSpot();
    Object.assign(this, {
      x: p.x, y: p.y, vx: 0, vy: 0, maxHp: 100, hp: 100, face: rand(0, TAU), dead: false, deathT: 0,
      stun: 0, ragdoll: 0, spin: 0, spinV: 0, shotCd: 0, draw: 0, drawing: false, recoil: 0,
      blocking: false, dashT: 0, lock: 0, cd: { dash: 0 }, dashCharges: DASH_CHARGES, dashBuf: 0,
      awaken: 0, slow: 0, flash: 0, iframe: 1.2, lastHitBy: null, lastHitT: 0, guardBreak: 0,
      r: BASE_R, bounty: false, level: 1, xp: 0, xpTotal: 0, up: freshUpgrades(), pendingChoices: 0, rage: 0, haste: 0, bubble: 0, vision: 0,
      slots: [{ type: 'classic', tier: 1 }], cur: 0, weapon: 'classic', tier: 1,
      burn: 0, burnTick: 0, burnBy: null, poison: 0, poisonStacks: 0, poisonTick: 0, poisonBy: null, frozen: 0,
    });
  }
  get canAct() { return !this.dead && this.stun <= 0 && this.ragdoll <= 0 && this.dashT <= 0 && this.lock <= 0; }
}

// ---------- effects ----------
function sparks(x, y, col, n, speed = 260) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(speed * 0.3, speed);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: rand(0.2, 0.45), col, size: rand(2, 4.5) });
  }
}
function ring(x, y, r0, r1, life, col, w = 4, arc = null) { rings.push({ x, y, r0, r1, t: 0, life, col, w, arc }); }
function popText(x, y, txt, col, big = false) { texts.push({ x, y, txt, col, t: 0, life: 0.8, big }); }

// ---------- XP, levels, upgrades ----------
function dropOrbs(x, y, total, burst) {
  while (total > 0) {
    const v = total >= 5 ? 5 : 1; total -= v;
    const a = rand(0, TAU), s = burst ? rand(80, 320) : 0;
    orbs.push({ x, y, v, vx: Math.cos(a) * s, vy: Math.sin(a) * s, ambient: !burst });
  }
}
function spawnAmbientOrb() {
  const a = rand(0, TAU), d = Math.sqrt(Math.random()) * (ARENA_R - 60);
  const x = Math.cos(a) * d, y = Math.sin(a) * d;
  if (pillars.some(p => Math.hypot(p.x - x, p.y - y) < p.r + 10)) return;
  orbs.push({ x, y, v: 1, vx: 0, vy: 0, ambient: true });
}
function gainXp(f, v) {
  if (f.level >= MAX_LEVEL) return;
  f.xp += v; f.xpTotal += v;
  while (f.level < MAX_LEVEL && f.xp >= xpNeed(f.level)) {
    f.xp -= xpNeed(f.level); f.level++; f.r = sizeFor(f.level);
    ring(f.x, f.y, 10, 70, 0.4, '#5eead4', 4);
    popText(f.x, f.y - 46, `LEVEL ${f.level}`, '#5eead4', true);
    if (f.isBot) {
      const opts = availableUpgrades(f); if (opts.length) applyUpgrade(f, opts[Math.floor(Math.random() * opts.length)].id);
      if (f.level % 3 === 0) giveArrow(f, rollType(f.slots.map(sl => sl.type)), rollTier(f.level));
    }
    else f.pendingChoices++;
  }
}
const availableUpgrades = f => UPGRADES.filter(u => f.up[u.id] < u.max);
function applyUpgrade(f, id) {
  f.up[id]++;
  if (id === 'hp') { f.maxHp += 20; f.hp = Math.min(f.maxHp, f.hp + 20); }
}

function grabPowerup(f, p) {
  const P = POWERUPS[p.type];
  if (p.type === 'rage') f.rage = 10;
  if (p.type === 'haste') f.haste = 10;
  if (p.type === 'bubble') f.bubble = 40;
  if (p.type === 'heal') f.hp = Math.min(f.maxHp, f.hp + 40);
  if (p.type === 'volley') { awaken(f); return; }
  if (p.type === 'vision') f.vision = 15;
  ring(p.x, p.y, 10, 80, 0.4, P.col, 5);
  popText(f.x, f.y - 46, P.label, P.col, true);
}

function selectSlot(f, i) {
  if (i < 0 || i >= f.slots.length || (i === f.cur && f.weapon === f.slots[i].type)) return;
  f.cur = i; f.weapon = f.slots[i].type; f.tier = f.slots[i].tier;
  f.drawing = false; f.draw = 0; f.shotCd = Math.max(f.shotCd, 0.18);
  if (f === player) popText(f.x, f.y - 46, `${WEAPONS[f.weapon].name.toUpperCase()} ${ROMAN[f.tier]}`, WEAPONS[f.weapon].col);
}
// Would this arrow be worth taking? (a new type, or a better tier of one you carry)
function wantsArrow(f, type, tier) {
  const has = f.slots.find(s => s.type === type);
  return has ? tier > has.tier : true;
}
// Take an arrow type. Full quiver: it swaps out the one in your hand (or your weakest special) and drops it.
function giveArrow(f, type, tier) {
  if (!wantsArrow(f, type, tier)) return false;
  const name = `${WEAPONS[type].name.toUpperCase()} ${ROMAN[tier]}`;
  const has = f.slots.find(s => s.type === type);
  if (has) {
    has.tier = tier; if (f.weapon === type) f.tier = tier;
    if (f === player) popText(f.x, f.y - 46, name + ' ▲', WEAPONS[type].col, true);
    return true;
  }
  if (f.slots.length < MAX_SLOTS) {
    f.slots.push({ type, tier });
    if (f === player) popText(f.x, f.y - 46, name, WEAPONS[type].col, true);
    return true;
  }
  const i = swapIndex(f);
  const old = f.slots[i];
  f.slots[i] = { type, tier };
  quivers.push({ x: f.x + rand(-30, 30), y: f.y + rand(-30, 30), type: old.type, tier: old.tier, t: 0, holdFrom: f, holdT: 2, life: DROP_LIFE });
  if (f.cur === i) { f.weapon = type; f.tier = tier; f.drawing = false; f.draw = 0; }
  if (f === player) popText(f.x, f.y - 46, `${name} (dropped ${WEAPONS[old.type].name})`, WEAPONS[type].col, true);
  return true;
}
// With a full quiver, a new type replaces the arrow in your hand, Classic included.
function swapIndex(f) { return f.cur; }
const quiverFullFor = (f, q) => f.slots.length >= MAX_SLOTS && !f.slots.some(sl => sl.type === q.type);
// bots only swap when the new one is a better tier than what it would replace
const botWants = (f, q) => {
  if (!wantsArrow(f, q.type, q.tier)) return false;
  if (!quiverFullFor(f, q)) return true;
  const out = f.slots[swapIndex(f)];
  return q.type !== 'classic' && (out.type === 'classic' || q.tier > out.tier);
};
let swapCand = null;   // a quiver the player stands on but can only take by swapping (R / SWAP)

function spawnQuiver() {
  const s = freeSpot(60);
  quivers.push({ ...s, type: rollType(), tier: rollTier(player ? player.level : 1), t: 0 });
}

function updatePickups(dt) {
  swapCand = null;
  // loose XP: keep the ground stocked
  let ambient = 0; for (const o of orbs) if (o.ambient) ambient++;
  for (let i = 0; i < 4 && ambient + i < ORB_TARGET; i++) if (Math.random() < 0.5) spawnAmbientOrb();
  for (const o of orbs) {
    if (o.vx || o.vy) { o.x += o.vx * dt; o.y += o.vy * dt; o.vx *= Math.exp(-4 * dt); o.vy *= Math.exp(-4 * dt); if (Math.abs(o.vx) + Math.abs(o.vy) < 5) o.vx = o.vy = 0; }
    const d0 = Math.hypot(o.x, o.y); if (d0 > ARENA_R - 20) { o.x *= (ARENA_R - 20) / d0; o.y *= (ARENA_R - 20) / d0; }
  }
  for (const f of fighters) {
    if (f.dead) continue;
    const reach = 75 * (1 + 0.5 * f.up.magnet);
    for (const o of orbs) {
      if (o.taken) continue;
      const dx = f.x - o.x, dy = f.y - o.y, d = Math.hypot(dx, dy);
      if (d < f.r + 6) { o.taken = true; gainXp(f, o.v); continue; }
      if (d < reach) { const s = Math.min(d, 560 * dt); o.x += dx / d * s; o.y += dy / d * s; }
    }
    for (const p of powerups) {
      if (p.taken) continue;
      if (Math.hypot(f.x - p.x, f.y - p.y) < f.r + 18) { p.taken = true; grabPowerup(f, p); }
    }
    for (const q of quivers) {
      if (q.taken || (q.holdFrom === f && q.holdT > 0)) continue;
      if (Math.hypot(f.x - q.x, f.y - q.y) >= f.r + 24) continue;
      if (quiverFullFor(f, q)) {
        if (f === player) { if (wantsArrow(f, q.type, q.tier)) swapCand = q; continue; }
        if (!botWants(f, q)) continue;
      }
      if (giveArrow(f, q.type, q.tier)) { q.taken = true; ring(q.x, q.y, 8, 60, 0.35, WEAPONS[q.type].col, 4); }
    }
  }
  quivers = quivers.filter(q => !q.taken);
  for (const q of quivers) { q.t += dt; if (q.holdT > 0) q.holdT -= dt; }
  quivers = quivers.filter(q => !q.life || q.t < q.life);   // dropped arrows vanish; the ones that spawn stay
  qTimer -= dt;
  if (qTimer <= 0) { qTimer = rand(9, 15); if (quivers.length < 4) spawnQuiver(); }
  orbs = orbs.filter(o => !o.taken);
  powerups = powerups.filter(p => !p.taken);
  puTimer -= dt;
  if (puTimer <= 0) {
    puTimer = rand(8, 13);
    if (powerups.length < 4) {
      const s = freeSpot(60);
      powerups.push({ ...s, type: POWERUP_ROLL[Math.floor(Math.random() * POWERUP_ROLL.length)], t: 0 });
    }
  }
  for (const p of powerups) p.t += dt;
}

// ---------- combat ----------
function applyHit(a, t, o) {
  if (t.dead || t.iframe > 0) return false;
  const dir = o.dir !== undefined ? o.dir : Math.atan2(t.y - a.y, t.x - a.x);
  const mult = (1 + 0.15 * a.up.dmg) * (a.rage > 0 ? 2 : 1) * (a.awaken > 0 ? 1.3 : 1) * slayerBonus(a, t);
  let dmg = o.dmg * mult * (a.isBot ? D().dmg : 1), kb = o.kb || 0, stun = o.stun || 0, rag = o.ragdoll || 0;
  let col = a.rage > 0 ? '#ff7a7a' : '#ffd27a';
  let blocked = false;
  const shieldFacing = !o.unblockable && angDiff(t.face, dir + Math.PI) < 1.3;
  if (t.blocking && shieldFacing) {
    if (o.guardBreak) {
      t.blocking = false; t.stun = 1.0; t.guardBreak = 1.0; dmg *= 0.6; kb = 200; rag = 0;
      popText(t.x, t.y - 40, 'SHIELD BROKEN', '#ff5a5a', true); ring(t.x, t.y, 10, 70, 0.35, '#ff5a5a');
    } else {
      dmg *= 0.12; kb *= 0.3; stun = 0; rag = 0; col = '#7ad7ff'; blocked = true;
    }
  }
  if (t.bubble > 0) {
    const soak = Math.min(t.bubble, dmg); t.bubble -= soak; dmg -= soak; col = '#7ad7ff';
    if (t.bubble <= 0) { ring(t.x, t.y, 20, 60, 0.3, '#7ad7ff'); popText(t.x, t.y - 46, 'BUBBLE POPPED', '#7ad7ff'); }
  }
  t.hp -= dmg;
  if (dmg >= 0.5) popText(t.x + rand(-10, 10), t.y - 30, Math.round(dmg).toString(), col, dmg >= 13);
  if (a.up.vamp && a !== t && !a.dead) a.hp = Math.min(a.maxHp, a.hp + dmg * 0.04 * a.up.vamp);
  t.flash = 0.1;
  t.stun = Math.max(t.stun, stun);
  if (o.slow) t.slow = Math.max(t.slow, o.slow);
  if (rag > 0) {
    t.ragdoll = Math.max(t.ragdoll, rag);
    t.spinV = (Math.random() < 0.5 ? -1 : 1) * rand(10, 16);
    t.dashT = 0;
  }
  if (stun > 0 || rag > 0) { t.drawing = false; t.draw = 0; t.blocking = false; }
  t.vx += Math.cos(dir) * kb; t.vy += Math.sin(dir) * kb;
  t.lastHitBy = a; t.lastHitT = 5;
  sparks(t.x - Math.cos(dir) * t.r, t.y - Math.sin(dir) * t.r, col, rag > 0 ? 14 : 6);
  if (a === player || t === player) {
    hitStop = Math.max(hitStop, rag > 0 ? 0.06 : dmg >= 13 ? 0.04 : 0.02);
    shake = Math.max(shake, rag > 0 ? 10 : dmg >= 13 ? 6 : 3);
  }
  if (t.hp <= 0) killFighter(t, a);
  return blocked ? 'blocked' : true;
}

// Damage from burning or poison: no knockback, no flash.
function dotHit(t, src, amount, col) {
  if (t.dead) return;
  let dmg = amount * (src ? (1 + 0.15 * src.up.dmg) * (src.isBot ? D().dmg : 1) * slayerBonus(src, t) : 1);
  if (t.bubble > 0) { const soak = Math.min(t.bubble, dmg); t.bubble -= soak; dmg -= soak; }
  if (dmg <= 0) return;
  t.hp -= dmg;
  popText(t.x + rand(-14, 14), t.y - 26, Math.max(1, Math.round(dmg)).toString(), col);
  if (src && src !== t) { t.lastHitBy = src; t.lastHitT = Math.max(t.lastHitT, 3); }
  if (t.hp <= 0) killFighter(t, src);
}

// What an arrow's type does after it lands on someone.
function weaponOnHit(a, t) {
  const src = a.owner;
  if (a.charge < EFFECT_CHARGE) return;
  if (a.weapon === 'fire') { t.burn = 3; t.burnBy = src; t.burnTier = a.tier; t.burnTick = Math.min(t.burnTick || 0.5, 0.5); }
  if (a.weapon === 'frost') {
    t.slow = Math.max(t.slow, 1.3);
    if (a.charge >= 0.98 && !t.dead) { const fz = 0.6 + 0.2 * a.tier; t.stun = Math.max(t.stun, fz); t.frozen = fz; t.drawing = false; t.draw = 0; ring(t.x, t.y, 10, 40, 0.3, '#9be7ff'); }
  }
  if (a.weapon === 'poison') { t.poison = 4; t.poisonBy = src; t.poisonTier = a.tier; t.poisonStacks = Math.min(3, t.poisonStacks + 1); }
  if (a.weapon === 'lightning') {
    let best = null, bd = 210;
    for (const n of fighters) {
      if (n === src || n === t || n.dead) continue;
      const d = Math.hypot(n.x - t.x, n.y - t.y); if (d < bd) { bd = d; best = n; }
    }
    if (best) {
      bolts.push({ x1: t.x, y1: t.y, x2: best.x, y2: best.y, t: 0 });
      applyHit(src, best, { dmg: a.dmg * 0.6, kb: 60, stun: 0.15, dir: Math.atan2(best.y - t.y, best.x - t.x) });
    }
  }
}

// The Blast arrow type: a small explosion wherever it lands.
function miniBlast(x, y, owner, charge, skip, tier = 1) {
  if (charge < EFFECT_CHARGE) { sparks(x, y, '#ff8a3d', 5, 140); return; }   // a quick shot only fizzles
  const big = charge >= 0.98, R = big ? 105 : 70;
  ring(x, y, 6, R, 0.3, '#ff8a3d', big ? 7 : 5);
  sparks(x, y, '#ff8a3d', big ? 22 : 12, big ? 420 : 300);
  for (const t of fighters) {
    if (t === owner || t === skip || t.dead) continue;
    if (Math.hypot(t.x - x, t.y - y) < R + t.r) applyHit(owner, t, { dmg: (4 + 7 * charge) * tierMult(tier), kb: big ? 600 : 300, stun: 0.2, ragdoll: big ? 0.45 : 0, dir: Math.atan2(t.y - y, t.x - x), unblockable: true });
  }
  if (big && Math.hypot(player.x - x, player.y - y) < 600) shake = Math.max(shake, 7);
}

// Giant slayer: +5% damage for every level the target is above you, up to +60%.
const slayerBonus = (a, t) => 1 + 0.05 * clamp(t.level - a.level, 0, 12);
// Bounty: a fighter far ahead of everyone (level 6+, 3+ levels clear) is marked and hunted.
function updateBounty() {
  const alive = fighters.filter(f => !f.dead).sort((x, y) => y.level - x.level);
  for (const f of fighters) f.bounty = false;
  if (alive.length > 1 && alive[0].level >= 6 && alive[0].level - alive[1].level >= 3) alive[0].bounty = true;
}

function killFighter(t, a) {
  t.hp = 0; t.dead = true; t.deathT = 3; t.ragdoll = 1.4; t.spinV = rand(12, 18); t.deaths++;
  t.blocking = false; t.drawing = false; t.awaken = 0;
  const killer = a && a !== t ? a : (t.lastHitBy !== t ? t.lastHitBy : null);
  if (killer) { killer.kills++; killer.hp = Math.min(killer.maxHp, killer.hp + 15); }
  feed.unshift({ k: killer ? killer.name : '', kc: killer ? killer.color : '#fff', v: t.name, vc: t.color, t: 6 });
  if (feed.length > 5) feed.pop();
  ring(t.x, t.y, 10, 110, 0.5, '#ffffff', 5);
  sparks(t.x, t.y, t.color, 24, 380);
  // half their XP spills on the ground; a bounty spills three quarters, and the hunter is healed in full
  dropOrbs(t.x, t.y, 4 + Math.floor(t.xpTotal * (t.bounty ? 0.75 : 0.5)), true);
  if (t.bounty && killer) { killer.hp = killer.maxHp; popText(t.x, t.y - 60, 'BOUNTY CLAIMED', '#ffc400', true); ring(t.x, t.y, 20, 200, 0.6, '#ffc400', 7); }
  for (const sl of t.slots) if (sl.type !== 'classic') quivers.push({ x: t.x + rand(-40, 40), y: t.y + rand(-40, 40), type: sl.type, tier: sl.tier, t: 0, life: DROP_LIFE });
  if (t === player || killer === player) shake = Math.max(shake, 14);
}

function spawnArrow(f, ang, o) {
  const sp = o.speed;
  arrows.push({
    x: f.x + Math.cos(ang) * (f.r + 10), y: f.y + Math.sin(ang) * (f.r + 10),
    vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, ang, owner: f, life: o.life || 0.9,
    dmg: o.dmg, kb: o.kb || 0, stun: o.stun || 0, ragdoll: o.ragdoll || 0, slow: o.slow || 0,
    pierce: !!o.pierce, pierceLeft: o.pierceLeft || 0, bounces: o.bounces ?? f.up.ricochet,
    guardBreak: !!o.guardBreak, blast: !!o.blast, kind: o.kind || 'normal', hit: new Set(),
    weapon: o.weapon || null, charge: o.charge || 0, tier: o.tier || 1,
  });
}

// Full-draw shockwave: a forward wave and a body ring in the arrow type colour, plus that type's own burst.
function shockwave(f) {
  const a = f.face, c = Math.cos(a), sn = Math.sin(a), tx = f.x + c * (f.r + 16), ty = f.y + sn * (f.r + 16);
  const col = f.rage > 0 ? '#ff4d4d' : f.awaken > 0 ? '#ffc400' : WEAPONS[f.weapon].col;
  ring(tx, ty, 6, 100, 0.36, col, 9, [a - 0.9, a + 0.9]);
  ring(tx, ty, 6, 70, 0.3, col, 4, [a - 0.7, a + 0.7]);
  ring(tx, ty, 4, 46, 0.22, '#ffffff', 3, [a - 0.6, a + 0.6]);
  ring(f.x, f.y, f.r, f.r + 34, 0.25, col, 3);
  const burst = (n, cols, spdLo, spdHi, spread, size, life, drift = 0) => {
    for (let i = 0; i < n; i++) {
      const ang = a + rand(-spread, spread), sp = rand(spdLo, spdHi);
      particles.push({ x: tx, y: ty, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp + drift, t: 0, life: rand(life * 0.6, life), col: cols[i % cols.length], size: rand(size * 0.6, size) });
    }
  };
  switch (f.weapon) {
    case 'fire': burst(16, ['#ff6a00', '#ffb020', '#ffd24a'], 120, 360, 0.7, 5, 0.5, -60); break;
    case 'frost': burst(14, ['#bfe9ff', '#ffffff', '#9be7ff'], 160, 380, 0.8, 4, 0.45); ring(tx, ty, 8, 52, 0.4, '#e6f8ff', 2); break;
    case 'explosive': burst(10, ['#ff8a3d', '#ffcf5a'], 180, 420, 0.9, 5, 0.35); burst(10, ['#6b6b6b', '#8a8a8a'], 40, 140, 1.2, 8, 0.6); break;
    case 'piercing': burst(8, ['#8fe3ff', '#ffffff'], 700, 1100, 0.06, 3, 0.22); break;
    case 'poison': burst(14, ['#7bd85c', '#a6f07a', '#4a9a35'], 80, 260, 0.8, 5, 0.6, 40); break;
    case 'lightning':
      for (let i = 0; i < 3; i++) { const ang = a + rand(-0.6, 0.6), L = rand(50, 90); bolts.push({ x1: tx, y1: ty, x2: tx + Math.cos(ang) * L, y2: ty + Math.sin(ang) * L, t: 0 }); }
      burst(8, ['#ffe95a', '#ffffff'], 200, 420, 0.7, 3, 0.3); break;
    default: burst(10, ['#fff3c4', '#ffffff'], 160, 360, 0.6, 3, 0.3);
  }
  if (f === player) shake = Math.max(shake, 3);
}

function fireBow(f, charge) {
  const c = clamp(charge, 0.2, 1), full = c >= 0.98, U = f.up, Wp = WEAPONS[f.weapon];
  const base = {
    speed: (650 + 800 * c) * (1 + 0.2 * U.range) * Wp.speed, life: 0.85 * (1 + 0.15 * U.range),
    dmg: (3 + 13 * Math.pow(c, 1.5)) * Wp.dmg * tierMult(f.tier), tier: f.tier, kb: full ? 320 : 90 * c, stun: full ? 0.3 : 0.12, pierceLeft: U.pierce,
    slow: full && U.ice ? 1.5 : 0, weapon: f.weapon, charge: c,
    bounces: f.weapon === 'explosive' ? 0 : U.ricochet,
    pierce: f.weapon === 'piercing', guardBreak: f.weapon === 'piercing' && full,
    kind: f.rage > 0 ? 'rage' : f.awaken > 0 ? 'gold' : f.weapon !== 'classic' ? f.weapon : U.ice && full ? 'ice' : full ? 'full' : 'normal',
  };
  spawnArrow(f, f.face, base);
  for (let i = 1; i <= U.multi; i++) spawnArrow(f, f.face + (i % 2 ? 1 : -1) * 0.13 * Math.ceil(i / 2), { ...base, dmg: base.dmg * 0.7 });
  if (U.back) spawnArrow(f, f.face + Math.PI, { ...base, dmg: base.dmg * 0.7 });
  f.shotCd = SHOT_CD * (f.awaken > 0 ? 0.6 : 1) * (1 - 0.2 * U.reload); f.recoil = 0.12;
  f.vx -= Math.cos(f.face) * 40 * c; f.vy -= Math.sin(f.face) * 40 * c;
  if (full) shockwave(f);
}

function awaken(f) {
  f.awaken = 10; f.hp = Math.min(f.maxHp, f.hp + 20); f.lock = 0.3;
  ring(f.x, f.y, 20, 220, 0.6, '#ffc400', 8);
  popText(f.x, f.y - 50, 'STORM VOLLEY', '#ffc400', true);
  for (let i = 0; i < 16; i++) spawnArrow(f, f.face + (i / 16) * TAU, { speed: 1100, dmg: 8, kb: 220, stun: 0.25, kind: 'gold', life: 0.6, bounces: 0 });
  if (f === player) shake = 14;
}

// ---------- movement ----------
function moveBody(f, dt) {
  f.x += f.vx * dt; f.y += f.vy * dt;
  const e = f.ragdoll > 0 ? 0.6 : 0;
  for (const p of pillars) {
    const dx = f.x - p.x, dy = f.y - p.y, d = Math.hypot(dx, dy) || 1, min = p.r + f.r;
    if (d < min) {
      const nx = dx / d, ny = dy / d;
      f.x = p.x + nx * min; f.y = p.y + ny * min;
      const vn = f.vx * nx + f.vy * ny;
      if (vn < 0) {
        f.vx -= (1 + e) * vn * nx; f.vy -= (1 + e) * vn * ny;
        if (e > 0 && -vn > 350) { sparks(f.x - nx * f.r, f.y - ny * f.r, '#c9b38a', 10, 200); if (f === player) shake = Math.max(shake, 8); }
      }
    }
  }
  const d = Math.hypot(f.x, f.y), max = ARENA_R - f.r;
  if (d > max) {
    const nx = -f.x / d, ny = -f.y / d;
    f.x = -nx * max; f.y = -ny * max;
    const vn = f.vx * nx + f.vy * ny;
    if (vn < 0) { f.vx -= (1 + e) * vn * nx; f.vy -= (1 + e) * vn * ny; }
  }
}

function updateFighter(f, dt, I) {
  const fast = f.awaken > 0, U = f.up;
  // dash charges refill one at a time
  if (f.dashCharges < DASH_CHARGES) {
    f.cd.dash -= dt;
    if (f.cd.dash <= 0) { f.dashCharges++; f.cd.dash = f.dashCharges < DASH_CHARGES ? DASH_RECHARGE : 0; }
  } else f.cd.dash = 0;
  if (I.dash) f.dashBuf = DASH_BUFFER; else f.dashBuf = Math.max(0, f.dashBuf - dt);
  f.shotCd = Math.max(0, f.shotCd - dt); f.recoil = Math.max(0, f.recoil - dt);
  f.flash = Math.max(0, f.flash - dt); f.iframe = Math.max(0, f.iframe - dt); f.stun = Math.max(0, f.stun - dt);
  f.lock = Math.max(0, f.lock - dt); f.slow = Math.max(0, f.slow - dt);
  f.guardBreak = Math.max(0, f.guardBreak - dt); f.lastHitT = Math.max(0, f.lastHitT - dt);
  f.rage = Math.max(0, f.rage - dt); f.haste = Math.max(0, f.haste - dt); f.vision = Math.max(0, f.vision - dt);
  if (f.awaken > 0) {
    f.awaken -= dt;
    if (Math.random() < dt * 30) particles.push({ x: f.x + rand(-18, 18), y: f.y + rand(-18, 18), vx: rand(-20, 20), vy: rand(-90, -40), t: 0, life: 0.5, col: '#ffc400', size: rand(2, 4) });
  }
  if (f.rage > 0 && Math.random() < dt * 20) particles.push({ x: f.x + rand(-16, 16), y: f.y + rand(-16, 16), vx: 0, vy: rand(-80, -40), t: 0, life: 0.4, col: '#ff4d4d', size: 3 });
  if (f.ragdoll > 0) { f.ragdoll -= dt; f.spin += f.spinV * dt; f.spinV *= Math.exp(-3 * dt); if (f.ragdoll <= 0) f.spin = 0; }

  if (f.dead) {
    f.deathT -= dt;
    f.vx *= Math.exp(-3 * dt); f.vy *= Math.exp(-3 * dt);
    moveBody(f, dt);
    if (f.deathT <= 0) { f.spawn(); if (f === player) offer = null; }
    return;
  }
  if (U.regen) f.hp = Math.min(f.maxHp, f.hp + 1.5 * U.regen * dt);
  f.frozen = Math.max(0, f.frozen - dt);
  if (f.burn > 0) {
    f.burn -= dt; f.burnTick -= dt;
    if (Math.random() < dt * 25) particles.push({ x: f.x + rand(-14, 14), y: f.y + rand(-14, 14), vx: rand(-15, 15), vy: rand(-90, -50), t: 0, life: 0.35, col: Math.random() < 0.5 ? '#ff6a00' : '#ffb020', size: rand(2, 4) });
    if (f.burnTick <= 0) { f.burnTick = 0.5; dotHit(f, f.burnBy, 1.6 * tierMult(f.burnTier || 1), '#ff8a3d'); if (f.dead) return; }
  }
  if (f.poison > 0) {
    f.poison -= dt; f.poisonTick -= dt;
    if (Math.random() < dt * 10) particles.push({ x: f.x + rand(-14, 14), y: f.y + rand(-14, 14), vx: 0, vy: rand(-40, -20), t: 0, life: 0.5, col: '#7bd85c', size: rand(2, 4) });
    if (f.poisonTick <= 0) { f.poisonTick = 0.5; dotHit(f, f.poisonBy, 0.9 * f.poisonStacks * tierMult(f.poisonTier || 1), '#7bd85c'); if (f.dead) return; }
    if (f.poison <= 0) f.poisonStacks = 0;
  }
  if (f.dashT > 0) {
    f.dashT -= dt;
    particles.push({ x: f.x, y: f.y, vx: 0, vy: 0, t: 0, life: 0.25, col: f.color, size: f.r * 0.8, ghost: true });
  }

  if (!f.dead && I.swap && f === player && swapCand && !swapCand.taken && giveArrow(f, swapCand.type, swapCand.tier)) { swapCand.taken = true; ring(swapCand.x, swapCand.y, 8, 60, 0.35, WEAPONS[swapCand.type].col, 4); swapCand = null; }
  if (!f.dead && I.slot !== undefined) selectSlot(f, I.slot);
  if (!f.dead && I.slotStep) selectSlot(f, (f.cur + I.slotStep + f.slots.length) % f.slots.length);
  f.blocking = !!I.block && f.canAct;
  if ((f.canAct || f.blocking) && I.aim !== undefined) f.face = I.aim;
  if (!f.canAct || f.blocking) { f.drawing = false; f.draw = 0; }

  if (f.canAct) {
    let mx = I.mx || 0, my = I.my || 0;
    const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
    let sp = 240 * (fast ? 1.2 : 1) * (1 + 0.08 * U.speed) * (f.haste > 0 ? 1.35 : 1) * speedFor(f.level);
    if (f.blocking) sp = 95; else if (f.drawing) sp *= 0.6;
    if (f.slow > 0) sp *= 0.55;
    const k = 1 - Math.exp(-14 * dt);
    f.vx += (mx * sp - f.vx) * k; f.vy += (my * sp - f.vy) * k;
    if (!f.blocking) {
      if (f.dashBuf > 0 && f.dashCharges > 0) {
        let dx = mx, dy = my;
        if (Math.hypot(dx, dy) < 0.2) { dx = Math.cos(f.face); dy = Math.sin(f.face); }
        const dl = Math.hypot(dx, dy);
        f.vx = dx / dl * 950; f.vy = dy / dl * 950; f.dashT = 0.17; f.dashBuf = 0;
        f.dashCharges--; if (f.cd.dash <= 0) f.cd.dash = DASH_RECHARGE;
        f.iframe = Math.max(f.iframe, 0.2); f.drawing = false; f.draw = 0;
      } else if (I.m1 && f.shotCd <= 0) {
        const rate = (fast ? 2 : 1) * (1 + 0.15 * U.draw) * (f.haste > 0 ? 1.4 : 1) * WEAPONS[f.weapon].draw;
        f.drawing = true; f.draw = Math.min(1, f.draw + dt * rate / DRAW_TIME);
      } else if (f.drawing && !I.m1) {
        fireBow(f, f.draw); f.drawing = false; f.draw = 0;
      }
    }
  } else {
    const k = f.ragdoll > 0 ? 2.2 : f.dashT > 0 ? 2.5 : 7;
    f.vx *= Math.exp(-k * dt); f.vy *= Math.exp(-k * dt);
  }
  moveBody(f, dt);
}


function separate() {
  for (let i = 0; i < fighters.length; i++) {
    const a = fighters[i]; if (a.dead) continue;
    for (let j = i + 1; j < fighters.length; j++) {
      const b = fighters[j]; if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, min = a.r + b.r;
      if (d < min) {
        const push = (min - d) / 2, nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      }
    }
  }
}

function bounceArrow(a, nx, ny) {
  const vn = a.vx * nx + a.vy * ny;
  a.vx -= 2 * vn * nx; a.vy -= 2 * vn * ny;
  a.ang = Math.atan2(a.vy, a.vx); a.bounces--; a.life = Math.max(a.life, 0.35);
  a.x += nx * 6; a.y += ny * 6;
  sparks(a.x, a.y, '#ffe7a8', 4, 140);
}

function updateArrows(dt) {
  for (const a of arrows) {
    a.life -= dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(a.vx, a.vy) * dt / 14));
    for (let s = 0; s < steps && a.life > 0; s++) {
      a.x += a.vx * dt / steps; a.y += a.vy * dt / steps;
      const dc = Math.hypot(a.x, a.y);
      const wall = dc > ARENA_R - 4;
      const pil = pillars.find(q => Math.hypot(q.x - a.x, q.y - a.y) < q.r);
      if (wall || pil) {
        if (a.bounces > 0) {
          if (wall) bounceArrow(a, -a.x / dc, -a.y / dc);
          else { const px = a.x - pil.x, py = a.y - pil.y, pd = Math.hypot(px, py) || 1; bounceArrow(a, px / pd, py / pd); }
          continue;
        }
        a.life = 0; a.done = true;
        if (a.weapon === 'explosive') miniBlast(a.x, a.y, a.owner, a.charge, null, a.tier);
        else { stuck.push({ x: a.x, y: a.y, ang: a.ang, t: 0, life: 4, kind: a.kind, weapon: a.weapon || 'classic' }); sparks(a.x, a.y, '#c9b38a', 4, 120); }
        break;
      }
      for (const t of fighters) {
        if (t === a.owner || t.dead || a.hit.has(t)) continue;
        if (Math.hypot(t.x - a.x, t.y - a.y) < t.r + 4) {
          a.hit.add(t);
          if (t.iframe > 0) continue;   // dodged: the arrow flies on
          const res = applyHit(a.owner, t, { dmg: a.dmg, kb: a.kb, stun: a.stun, ragdoll: a.ragdoll, slow: a.slow, guardBreak: a.guardBreak, dir: a.ang });
          if (res === true && a.weapon) weaponOnHit(a, t);
          if (a.weapon === 'explosive') { miniBlast(a.x, a.y, a.owner, a.charge, t, a.tier); a.life = 0; a.done = true; break; }
          if (a.pierce) continue;
          if (a.pierceLeft > 0) { a.pierceLeft--; continue; }
          a.life = 0; a.done = true; break;
        }
      }
    }
    if (a.kind === 'pierce' && Math.random() < 0.8) particles.push({ x: a.x, y: a.y, vx: 0, vy: 0, t: 0, life: 0.25, col: '#8fe3ff', size: 3 });
    if (a.weapon && a.weapon !== 'classic' && Math.random() < 0.6) particles.push({ x: a.x, y: a.y, vx: rand(-25, 25), vy: rand(-25, 25), t: 0, life: 0.25, col: WEAPONS[a.weapon].col, size: 3 });
  }
  // an explosive arrow that runs out of flight explodes where it lands
  arrows = arrows.filter(a => {
    if (a.life > 0) return true;
    if (a.weapon === 'explosive' && !a.done) miniBlast(a.x, a.y, a.owner, a.charge, null, a.tier);
    return false;
  });
  for (const s of stuck) s.t += dt;
  stuck = stuck.filter(s => s.t < s.life);
  if (stuck.length > 120) stuck.splice(0, stuck.length - 120);

}

// ---------- bot brain ----------
function incomingArrow(f) {
  for (const a of arrows) {
    if (a.owner === f || a.hit.has(f)) continue;
    const rx = f.x - a.x, ry = f.y - a.y, d = Math.hypot(rx, ry);
    if (d > 260) continue;
    const sp = Math.hypot(a.vx, a.vy), ux = a.vx / sp, uy = a.vy / sp;
    const along = rx * ux + ry * uy;
    if (along < 0) continue;
    const miss = Math.abs(rx * uy - ry * ux);
    if (miss < f.r + 10) return a;
  }
  return null;
}

function nearestPickup(f, list, range) {
  let best = null, bd = range;
  for (const o of list) { const d = Math.hypot(o.x - f.x, o.y - f.y); if (d < bd) { bd = d; best = o; } }
  return best;
}

function botIntent(f, dt) {
  const ai = f.ai, I = { mx: 0, my: 0, aim: f.face }, DF = D();
  if (f.dead) return I;
  ai.retarget -= dt; ai.wait -= dt;
  if (!ai.target || ai.target.dead || ai.retarget <= 0) {
    let best = null, bd = 1e9;
    for (const t of fighters) {
      if (t === f || t.dead) continue;
      // on easier settings bots pick on each other more than on you
      const d = dist(f, t) * rand(0.7, 1.3) * (t === player ? DF.playerBias : 1) * (t.bounty ? 0.45 : 1);
      if (d < bd) { bd = d; best = t; }
    }
    ai.target = best; ai.retarget = rand(3, 6); ai.aimErr = rand(-DF.aim, DF.aim);
  }
  if (f.lastHitBy && f.lastHitBy !== f && !f.lastHitBy.dead && f.lastHitT > 4.6) ai.target = f.lastHitBy;
  const t = ai.target;
  if (!t) return I;
  const dx = t.x - f.x, dy = t.y - f.y, d = Math.hypot(dx, dy) || 1;

  // lead the shot: aim where the target will be when the arrow arrives
  const speed = (650 + 800 * Math.max(f.draw, 0.3)) * (1 + 0.2 * f.up.range);
  const tt = d / speed;
  const lx = t.x + t.vx * tt * DF.lead, ly = t.y + t.vy * tt * DF.lead;
  I.aim = Math.atan2(ly - f.y, lx - f.x) + ai.aimErr * (0.5 + Math.random() * 0.5);
  I.tx = t.x + t.vx * 0.6; I.ty = t.y + t.vy * 0.6;

  ai.strafeT -= dt;
  if (ai.strafeT <= 0) { ai.strafe = Math.random() < 0.5 ? -1 : 1; ai.strafeT = rand(0.7, 1.8); ai.aimErr = rand(-DF.aim, DF.aim); }
  ai.flee -= dt;
  if (f.hp < f.maxHp * 0.25 && ai.flee <= -3 && Math.random() < dt * 0.4) ai.flee = rand(1.5, 3);

  const ux = dx / d, uy = dy / d, px = -uy * ai.strafe, py = ux * ai.strafe;
  let mx, my;
  if (ai.flee > 0) { mx = -ux + px * 0.5; my = -uy + py * 0.5; }
  else if (d > ai.keep + 120) { mx = ux + px * 0.4; my = uy + py * 0.4; }
  else if (d < ai.keep - 90) { mx = -ux + px * 0.6; my = -uy + py * 0.6; }
  else { mx = px; my = py; }
  // grab a nearby power-up, or hoover XP when no one is close
  const goal = nearestPickup(f, powerups, 420)
    || nearestPickup(f, quivers.filter(q => botWants(f, q) && !(q.holdFrom === f && q.holdT > 0)), 520)
    || (d > ai.keep + 60 || ai.flee > 0 ? nearestPickup(f, orbs, 230) : null);
  if (goal) { const gx = goal.x - f.x, gy = goal.y - f.y, gd = Math.hypot(gx, gy) || 1; mx = mx * 0.35 + gx / gd; my = my * 0.35 + gy / gd; }
  for (const p of pillars) {
    const qx = f.x - p.x, qy = f.y - p.y, qd = Math.hypot(qx, qy) || 1;
    if (qd < p.r + f.r + 45) { mx += (qx / qd) * 0.9; my += (qy / qd) * 0.9; }
  }
  const fromCentre = Math.hypot(f.x, f.y);
  if (fromCentre > ARENA_R - 150) { mx -= f.x / fromCentre; my -= f.y / fromCentre; }
  I.mx = mx; I.my = my;

  // dodge or shield an arrow that is about to hit
  const threat = incomingArrow(f);
  if (threat && Math.random() < dt * DF.dodge) {
    if (f.dashCharges > 0 && Math.random() < DF.dashDodge) {
      const tx = -threat.vy, ty = threat.vx, s = Math.random() < 0.5 ? -1 : 1;
      I.mx = tx * s; I.my = ty * s; I.dash = true; return I;
    }
    if (Math.random() < DF.block) ai.block = rand(0.3, 0.6);
  }
  ai.block -= dt;
  if (ai.block > 0) { I.block = true; I.aim = threat ? Math.atan2(-threat.vy, -threat.vx) : I.aim; return I; }

  // switch arrows now and then; smarter bots grab Piercing against a raised shield
  ai.switchT -= dt;
  const pierceSlot = f.slots.findIndex(sl => sl.type === 'piercing');
  if (t.blocking && pierceSlot >= 0 && f.cur !== pierceSlot && Math.random() < dt * 2 * DF.skill) I.slot = pierceSlot;
  else if (ai.switchT <= 0) {
    ai.switchT = rand(6, 14);
    // mostly hold the strongest special arrow
    let best = 0; f.slots.forEach((sl, i) => { if (sl.type !== 'classic' && (best === 0 || sl.tier > f.slots[best].tier)) best = i; });
    I.slot = Math.random() < 0.7 ? best : Math.floor(Math.random() * f.slots.length);
  }
  // bow: hold until the wanted charge, then let go and take a breather
  if (d < 750) {
    if (f.drawing && f.draw >= ai.want) {
      I.m1 = false; ai.want = Math.random() < DF.full ? 1 : rand(0.3, 0.8); ai.wait = rand(...DF.wait);
      ai.aimErr = rand(-DF.aim, DF.aim);
    } else I.m1 = f.shotCd <= 0 && ai.wait <= 0;
  }
  return I;
}

// ---------- input ----------
const keys = new Set(), pressed = new Set();
const mouse = { x: 0, y: 0, l: false, r: false };
let touchMode = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches;

// Pointer lock: the game keeps the mouse, so the cursor can never leave the window mid-fight.
// We draw our own crosshair and move it with the raw mouse movement, clamped to the screen.
const canLock = 'requestPointerLock' in canvas;
let wasLocked = false;
const isLocked = () => document.pointerLockElement === canvas;
function lockPointer() {
  if (touchMode || !canLock || isLocked()) return;
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* plain cursor still works */ }
}
const pauseEl = document.getElementById('pause');
function setPaused(on) {
  paused = on; pauseEl.style.display = on ? 'flex' : 'none';
  if (on) {
    mouse.l = mouse.r = false; keys.clear(); joy.id = null; aimStick.id = null; aimStick.pendingT = 0; cardTouch.id = null; btnTouches.clear();
    if (isLocked()) document.exitPointerLock();   // a held mouse would send every click to the game, not the menu
    buildPickers(document.getElementById('pausePickers'));
  }
}
document.addEventListener('pointerlockchange', () => {
  if (isLocked()) { wasLocked = true; return; }
  if (running && !choosing && !touchMode && wasLocked) setPaused(true);   // Esc, alt-tab, etc.
});
document.getElementById('resume').addEventListener('click', () => { setPaused(false); pressed.clear(); lockPointer(); });

// Arrow type and difficulty pickers, used on the start menu and the pause screen.
function buildPickers(el) {
  if (!el) return;
  el.innerHTML = '';
  const diffRow = document.createElement('div'); diffRow.className = 'seg';
  for (const [id, d] of Object.entries(DIFFICULTY)) {
    const b = document.createElement('button');
    b.textContent = d.name; b.className = id === settings.difficulty ? 'on' : '';
    b.addEventListener('click', () => {
      settings.difficulty = id; saveSettings();
      for (const f of fighters) if (f.isBot) f.ai.keep = rand(...D().keep);
      refreshPickers();
    });
    diffRow.appendChild(b);
  }
  const lab1 = document.createElement('div'); lab1.className = 'plabel'; lab1.textContent = 'Bot difficulty';
  el.append(lab1, diffRow);
}
function refreshPickers() {
  buildPickers(document.getElementById('menuPickers'));
  if (paused) buildPickers(document.getElementById('pausePickers'));
}
buildPickers(document.getElementById('menuPickers'));
// top-right controls on phones and tablets
function switchRect() {
  const k = touchK(), w = 196 * k, h = 60 * k;
  return { x: W - 12 - w, y: 10, w, h, k };
}
// SWAP sits under the arrow panel; on screens too short for that (it would cover SHIELD) it moves to the top centre
function swapRect() {
  const r = switchRect(), rect = { x: r.x, y: r.y + r.h + 8, w: r.w, h: 40 * r.k, k: r.k };
  const sh = touchButtons().find(b => b.id === 'block');
  const hitsShield = sh && rect.y + rect.h > sh.y - sh.r && rect.x < sh.x + sh.r && rect.x + rect.w > sh.x - sh.r;
  if (!hitsShield) return rect;
  const left = 20 + Math.min(300, W * 0.34), right = r.x - 108;
  return { ...rect, x: left + Math.max(0, (right - left - rect.w) / 2), y: 10, w: Math.min(rect.w, right - left) };
}
const pauseBtn = () => { const r = switchRect(); return { x: r.x - 30, y: r.y + r.h / 2, r: 20 }; };
const fsBtn = () => { const r = switchRect(); return { x: r.x - 78, y: r.y + r.h / 2, r: 20 }; };

// Full screen (Android and iPad; iPhone Safari only allows it from the home-screen icon)
const fsEl = document.documentElement;
const canFullscreen = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function enterFullscreen() {
  if (!canFullscreen || isFullscreen()) return;
  try {
    const r = (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl, { navigationUI: 'hide' });
    const lock = () => { try { const p = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not allowed here */ } };
    if (r && r.then) r.then(lock).catch(() => {}); else lock();
  } catch (e) { /* not allowed here */ }
}
function toggleFullscreen() {
  if (isFullscreen()) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* ignore */ } }
  else enterFullscreen();
}

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (running && !paused && offer && ['z', 'x', 'c'].includes(k)) { pickOffer(['z', 'x', 'c'].indexOf(k)); e.preventDefault(); return; }
  if (!keys.has(k)) pressed.add(k);
  keys.add(k);
  if ([' ', 'tab'].includes(k)) e.preventDefault();
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
canvas.addEventListener('wheel', e => { e.preventDefault(); if (running && !paused && !choosing) pressed.add(e.deltaY > 0 ? 'wheeldown' : 'wheelup'); }, { passive: false });
window.addEventListener('blur', () => { keys.clear(); mouse.l = mouse.r = false; });
document.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  touchMode = false;
  if (isLocked()) { mouse.x = clamp(mouse.x + e.movementX, 0, W); mouse.y = clamp(mouse.y + e.movementY, 0, H); }
  else { mouse.x = e.clientX / UIS; mouse.y = e.clientY / UIS; }
});
let clickTaken = false;   // a click that picked a card must not also shoot
canvas.addEventListener('mousedown', e => {
  if (running && !choosing && !paused && !touchMode && canLock && !isLocked() && !wasLocked) lockPointer();
  if (e.button === 0 && running && !paused && !touchMode && offerHit(mouse.x, mouse.y) >= 0) { pickOffer(offerHit(mouse.x, mouse.y)); clickTaken = true; return; }
  if (e.button === 0) mouse.l = true;
  if (e.button === 2) mouse.r = true;
});
window.addEventListener('mouseup', e => { if (e.button === 0) { mouse.l = false; clickTaken = false; } if (e.button === 2) mouse.r = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// Touch layout, by screen quarter:
//   left half          = move stick (starts wherever the thumb lands)
//   bottom-right quarter = aim-and-shoot stick (starts wherever the thumb lands: press, drag to aim, let go to fire)
//   top-right quarter  = arrow panel, SWAP, pause, full screen
// DASH and SHIELD sit inside the bottom-right quarter and win when touched directly.
// Facing has one owner at a time: while the right thumb is down or the bow is drawn, only the aim drag turns you;
// otherwise you face the way you walk.
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const aimStick = { id: null, ox: 0, oy: 0, x: 0, y: 0, lockAng: 0, pendingT: 0 };
const AIM_DEADZONE = 18;
const cardTouch = { id: null, idx: -1, sx: 0, sy: 0 };   // a thumb that landed on a level-up card
let aimedOnce = false;   // the shoot-zone hint goes away after the first aim
const inShootZone = (x, y) => x >= W / 2 && y >= H / 2;
const inMoveZone = x => x < W / 2;
const btnTouches = new Map(); // touch id -> button id
const btnPressed = new Set();
function touchButtons() {
  const k = touchK();
  const cx = W - 128 * k, cy = H - 105 * k, R = 125 * k;
  const at = (deg, rad, rr) => ({ x: cx + Math.cos(deg * Math.PI / 180) * rad, y: cy + Math.sin(deg * Math.PI / 180) * rad, r: rr * k });
  return [
    { id: 'dash', label: 'DASH', ...at(175, R + 4 * k, 36) },
    { id: 'block', label: 'SHIELD', ...at(222, R + 4 * k, 36) },
  ];
}
// touches in game units (screen pixels / UIS)
const scaledTouches = e => [...e.changedTouches].map(t => ({ identifier: t.identifier, clientX: t.clientX / UIS, clientY: t.clientY / UIS }));
function handleTouchStart(e) {
  e.preventDefault(); touchMode = true;
  const pb = pauseBtn(), fb = fsBtn(), sr = switchRect();
  const btns = touchButtons();
  for (const t of scaledTouches(e)) {
    const tx = t.clientX, ty = t.clientY;
    const oh = offerHit(tx, ty);
    if (running && oh >= 0 && cardTouch.id === null) { Object.assign(cardTouch, { id: t.identifier, idx: oh, sx: tx, sy: ty }); continue; }
    if (running && Math.hypot(tx - pb.x, ty - pb.y) < pb.r + 12) { setPaused(true); return; }
    if (canFullscreen && Math.hypot(tx - fb.x, ty - fb.y) < fb.r + 12) { toggleFullscreen(); continue; }
    if (tx >= sr.x - 6 && tx <= sr.x + sr.w + 6 && ty >= sr.y - 6 && ty <= sr.y + sr.h + 6) { btnPressed.add('switch'); continue; }
    const wr = swapRect();
    if (swapCand && tx >= wr.x && tx <= wr.x + wr.w && ty >= wr.y - 4 && ty <= wr.y + wr.h + 4) { btnPressed.add('swap'); continue; }
    const hit = btns.find(b => Math.hypot(tx - b.x, ty - b.y) < b.r + 6);
    if (hit) { btnTouches.set(t.identifier, hit.id); btnPressed.add(hit.id); continue; }
    if (inShootZone(tx, ty) && aimStick.id === null) {
      // the stick starts under the thumb, aiming where you already face, and a tap is never lost
      Object.assign(aimStick, { id: t.identifier, ox: tx, oy: ty, x: tx, y: ty, lockAng: player ? player.face : 0, pendingT: 0.35 });
      continue;
    }
    if (inMoveZone(tx) && joy.id === null) { joy.id = t.identifier; joy.ox = joy.x = tx; joy.oy = joy.y = ty; }
  }
}
function handleTouchMove(e) {
  e.preventDefault();
  for (const t of scaledTouches(e)) {
    if (t.identifier === cardTouch.id && Math.hypot(t.clientX - cardTouch.sx, t.clientY - cardTouch.sy) > 14) {
      // it was a drag, not a tap: hand the thumb to the stick for the zone it started in
      const { sx, sy } = cardTouch; cardTouch.id = null;
      if (inShootZone(sx, sy) && aimStick.id === null) Object.assign(aimStick, { id: t.identifier, ox: sx, oy: sy, x: t.clientX, y: t.clientY, lockAng: player.face, pendingT: 0.35 });
      else if (inMoveZone(sx) && joy.id === null) Object.assign(joy, { id: t.identifier, ox: sx, oy: sy, x: t.clientX, y: t.clientY });
    }
    if (t.identifier === joy.id) { joy.x = t.clientX; joy.y = t.clientY; }
    if (t.identifier === aimStick.id) { aimStick.x = t.clientX; aimStick.y = t.clientY; }
  }
}
function handleTouchEnd(e) {
  e.preventDefault();
  for (const t of scaledTouches(e)) {
    if (t.identifier === cardTouch.id) { if (offerHit(t.clientX, t.clientY) === cardTouch.idx) pickOffer(cardTouch.idx); cardTouch.id = null; }
    if (t.identifier === joy.id) joy.id = null;
    if (t.identifier === aimStick.id) aimStick.id = null;
    btnTouches.delete(t.identifier);
  }
}
canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });
const btnHeld = id => [...btnTouches.values()].includes(id);

function playerIntent(dt) {
  const I = { mx: 0, my: 0, aim: player.face };
  if (touchMode) {
    if (joy.id !== null) {
      const dx = joy.x - joy.ox, dy = joy.y - joy.oy, m = Math.hypot(dx, dy);
      if (m > 8) { I.mx = dx / Math.max(m, 55); I.my = dy / Math.max(m, 55); }
    }
    // facing: only the aim stick turns the bow
    const aiming = aimStick.id !== null;
    if (aiming) {
      const ax = aimStick.x - aimStick.ox, ay = aimStick.y - aimStick.oy;
      if (Math.hypot(ax, ay) > AIM_DEADZONE) { aimStick.lockAng = Math.atan2(ay, ax); aimedOnce = true; }
      I.aim = aimStick.lockAng;
    }
    // with the right thumb up, the bow keeps pointing where it was last aimed; the move stick never turns it
    // hold to draw; a tap shorter than one frame still starts a draw, then the release fires it
    if (aimStick.pendingT > 0) aimStick.pendingT = player.drawing ? 0 : aimStick.pendingT - dt;
    I.m1 = aiming || aimStick.pendingT > 0;
    I.block = btnHeld('block');
    if (btnPressed.has('dash')) I.dash = true;
    if (btnPressed.has('switch')) I.slotStep = 1;
    if (btnPressed.has('swap')) I.swap = true;
  } else {
    I.mx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    I.my = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    const wx = (mouse.x - W / 2) / VS + cam.x, wy = (mouse.y - H / 2) / VS + cam.y;
    I.aim = Math.atan2(wy - player.y, wx - player.x);
    I.tx = wx; I.ty = wy;
    I.m1 = mouse.l || keys.has('j');
    I.block = mouse.r || keys.has('f');
    I.dash = pressed.has(' ') || pressed.has('shift');
    if (pressed.has('e') || pressed.has('wheeldown')) I.slotStep = 1;
    if (pressed.has('q') || pressed.has('wheelup')) I.slotStep = -1;
    for (let i = 0; i < MAX_SLOTS; i++) if (pressed.has(String(i + 1))) I.slot = i;
    if (pressed.has('r')) I.swap = true;
  }
  return I;
}

// ---------- level-up choice ----------
const levelEl = document.getElementById('levelup');
const cardsEl = document.getElementById('cards');
let cardChoices = [];
function arrowOffer(level) {
  // a new type you don't carry, or (sometimes, or when you carry everything) a better tier of one you do
  const specials = player.slots.filter(sl => sl.type !== 'classic');
  const upgradable = specials.filter(sl => sl.tier < 3);
  if (upgradable.length && (Math.random() < 0.35 || specials.length >= MAX_SLOTS - 1)) {
    const sl = upgradable[Math.floor(Math.random() * upgradable.length)];
    return { arrow: true, type: sl.type, tier: sl.tier + 1 };
  }
  return { arrow: true, type: rollType(player.slots.map(sl => sl.type)), tier: Math.max(rollTier(level), level >= 9 ? 2 : 1) };
}
function buildOffer() {
  const lvl = player.level - player.pendingChoices + 1;
  const opts = availableUpgrades(player), cards = [];
  if (lvl % 3 === 0) cards.push(arrowOffer(lvl));
  while (cards.length < Math.min(3, opts.length + (lvl % 3 === 0 ? 1 : 0))) {
    const u = opts[Math.floor(Math.random() * opts.length)];
    if (!cards.includes(u)) cards.push(u);
  }
  return cards.length ? { level: lvl, cards } : null;
}
function ensureOffer() {
  if (player.dead || player.pendingChoices <= 0) { offer = null; return; }
  if (!offer) { offer = buildOffer(); if (!offer) player.pendingChoices = 0; }
}
function pickOffer(i) {
  if (!offer || !offer.cards[i]) return false;
  const c = offer.cards[i];
  if (c.arrow) giveArrow(player, c.type, c.tier);
  else { applyUpgrade(player, c.id); popText(player.x, player.y - 46, c.name, UP_COL[c.id], true); }
  player.pendingChoices--; offer = null; ensureOffer();
  return true;
}
// where the strip sits: bottom centre. Phone: between the thumbs, clear of DASH. Laptop: just above the arrow bar.
function offerLayout() {
  if (!offer) return null;
  const n = offer.cards.length, gap = 8;
  let w, x0, y0, ch;
  if (touchMode) {
    const dash = touchButtons().find(b => b.id === 'dash');
    // a drag that starts on a card becomes the move stick, so the strip may sit over the move zone
    const left = 12, right = Math.min(dash.x - dash.r - 10, W - 12);
    w = Math.min(460, right - left); x0 = left + (right - left - w) / 2; ch = 42; y0 = H - ch - 10;
  } else {
    w = Math.min(620, W - 360); x0 = (W - w) / 2; ch = 60; y0 = H - 104 - ch;
  }
  const cw = (w - gap * (n - 1)) / n;
  return { y0, cw, ch, cards: offer.cards.map((c, i) => ({ c, x: x0 + i * (cw + gap), y: y0, w: cw, h: ch })) };
}
function offerHit(x, y) {
  const L = offerLayout(); if (!L) return -1;
  return L.cards.findIndex(k => x >= k.x - 4 && x <= k.x + k.w + 4 && y >= k.y - 4 && y <= k.y + k.h + 4);
}
function drawOffer() {
  const L = offerLayout(); if (!L) return;
  const keysTxt = ['Z', 'X', 'C'];
  // the title sits over the cards themselves, shrunk to their width
  const first = L.cards[0], lastC = L.cards[L.cards.length - 1], mid = (first.x + lastC.x + lastC.w) / 2, span = lastC.x + lastC.w - first.x;
  const more = player.pendingChoices > 1 ? ` · ${player.pendingChoices - 1} more waiting` : '';
  const title = `LEVEL ${offer.level} · PICK ONE${touchMode ? '' : ' (Z X C or click)'}${more}`;
  let tz = 12; ctx.font = `800 ${tz}px system-ui, sans-serif`;
  while (tz > 8 && ctx.measureText(title).width > span) { tz--; ctx.font = `800 ${tz}px system-ui, sans-serif`; }
  ctx.textAlign = 'center'; ctx.fillStyle = '#5eead4'; ctx.fillText(title, mid, L.y0 - 7);
  L.cards.forEach((k, i) => {
    const c = k.c, col = c.arrow ? WEAPONS[c.type].col : UP_COL[c.id];
    ctx.fillStyle = '#0b0e14e6'; roundRect(k.x, k.y, k.w, k.h, 9); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; roundRect(k.x, k.y, k.w, k.h, 9); ctx.stroke();
    if (!touchMode) { ctx.textAlign = 'left'; ctx.fillStyle = '#ffb020'; ctx.font = '800 10px system-ui, sans-serif'; ctx.fillText(keysTxt[i], k.x + 6, k.y + 12); }
    const fit = (txt, size, maxW) => { let z = size; ctx.font = `800 ${z}px system-ui, sans-serif`; while (z > 7 && ctx.measureText(txt).width > maxW) { z--; ctx.font = `800 ${z}px system-ui, sans-serif`; } };
    ctx.textAlign = 'center';
    if (c.arrow) {
      drawArrowArt(ctx, c.type, k.x + k.w / 2, k.y + k.h * 0.36, 0, Math.min(k.w * 0.62, k.h * 1.9), c.tier >= 3 ? { glow: 8 } : {});
      const t = `${WEAPONS[c.type].name} ${ROMAN[c.tier]}`;
      fit(t, touchMode ? 11 : 13, k.w - 10); ctx.fillStyle = col; ctx.fillText(t, k.x + k.w / 2, k.y + k.h - 9);
    } else {
      // the symbol on the left, recognisable without reading
      const is = Math.min(k.h * 0.32, 15), iw = is * 2 + 10;
      ctx.beginPath(); ctx.arc(k.x + 6 + is + 1, k.y + k.h / 2, is + 3, 0, TAU); ctx.fillStyle = col + '22'; ctx.fill();
      drawUpIcon(ctx, c.id, k.x + 6 + is + 1, k.y + k.h / 2, is);
      const tx = k.x + iw + (k.w - iw) / 2, tw = k.w - iw - 6;
      const head = touchMode ? `${c.name} · ${player.up[c.id]}/${c.max}` : c.name;
      fit(head, touchMode ? 11 : 13, tw); ctx.fillStyle = col; ctx.fillText(head, tx, k.y + (touchMode ? 17 : 24));
      ctx.fillStyle = '#c8ced8'; ctx.font = `600 ${touchMode ? 9 : 10}px system-ui, sans-serif`;
      let d = c.desc; while (d.length > 8 && ctx.measureText(d).width > tw) d = d.slice(0, -2);
      if (d !== c.desc) d = d.trimEnd() + '…';
      ctx.fillText(d, tx, k.y + (touchMode ? 32 : 40));
      if (!touchMode) { ctx.fillStyle = '#9aa3b2'; ctx.font = '700 9px system-ui, sans-serif'; ctx.fillText(`${player.up[c.id]} / ${c.max}`, tx, k.y + k.h - 5); }
    }
  });
}

// ---------- game setup ----------
function newGame() {
  fighters = []; arrows = []; stuck = []; particles = []; rings = []; texts = []; feed = [];
  orbs = []; powerups = []; puTimer = 3; quivers = []; qTimer = 6;
  player = new Fighter('You', '#ffb020', false);
  fighters.push(player);
  const bots = [['Raze', '#ff5a5a'], ['Nova', '#5ab0ff'], ['Kuro', '#a77bff'], ['Blitz', '#4ade80'], ['Vex', '#f472b6'], ['Sora', '#22d3ee']];
  for (const [n, c] of bots) fighters.push(new Fighter(n, c, true));
  for (let i = 0; i < ORB_TARGET; i++) spawnAmbientOrb();
  for (let i = 0; i < 3; i++) spawnQuiver();
  cam.x = player.x; cam.y = player.y;
}

// ---------- drawing ----------
function inView(x, y, pad = 60) {
  return Math.abs(x - cam.x) < W / 2 / VS + pad && Math.abs(y - cam.y) < H / 2 / VS + pad;
}
function drawArena() {
  ctx.fillStyle = '#0d0f14'; ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, ARENA_R, 0, TAU);
  ctx.fillStyle = '#1d2a22'; ctx.fill();
  ctx.clip();
  ctx.strokeStyle = '#223127'; ctx.lineWidth = 2;
  const x0 = Math.floor((cam.x - W / 2 / VS) / 100) * 100, x1 = cam.x + W / 2 / VS;
  const y0 = Math.floor((cam.y - H / 2 / VS) / 100) * 100, y1 = cam.y + H / 2 / VS;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 100) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  for (let y = y0; y <= y1; y += 100) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 260, 0, TAU); ctx.strokeStyle = '#2a3b30'; ctx.lineWidth = 6; ctx.stroke();
  ctx.restore();
  ctx.beginPath(); ctx.arc(0, 0, ARENA_R, 0, TAU); ctx.strokeStyle = '#4a3d2c'; ctx.lineWidth = 16; ctx.stroke();
  for (const p of pillars) {
    if (!inView(p.x, p.y, p.r + 20)) continue;
    ctx.beginPath(); ctx.arc(p.x + 8, p.y + 10, p.r, 0, TAU); ctx.fillStyle = '#0a0c11aa'; ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fillStyle = '#4a4f5c'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#2c303a'; ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x - p.r * 0.25, p.y - p.r * 0.25, p.r * 0.45, 0, TAU); ctx.fillStyle = '#5a606e'; ctx.fill();
  }
}

function drawPickups() {
  const now = performance.now();
  for (const o of orbs) {
    if (!inView(o.x, o.y)) continue;
    const big = o.v >= 5, r = big ? 7 : 4.5;
    ctx.beginPath(); ctx.arc(o.x, o.y, r + 4, 0, TAU); ctx.fillStyle = big ? '#a78bfa33' : '#5eead433'; ctx.fill();
    ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, TAU); ctx.fillStyle = big ? '#c4b5fd' : '#5eead4'; ctx.fill();
  }
  for (const q of quivers) {
    if (!inView(q.x, q.y)) continue;
    const left = q.life ? q.life - q.t : Infinity;
    if (left < 2 && Math.floor(now / 110) % 2) continue;   // blinks before it vanishes
    const col = WEAPONS[q.type].col, bob = Math.sin(now / 300 + q.x) * 3, pulse = 22 + Math.sin(now / 200) * 2 + q.tier * 3;
    if (q.life) {   // timer ring: shrinks as the dropped quiver runs out
      ctx.beginPath(); ctx.arc(q.x, q.y + bob, pulse + 5, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, left / q.life));
      ctx.strokeStyle = left < 2 ? '#ff5a5a' : '#ffffffaa'; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(q.x, q.y + bob, pulse, 0, TAU); ctx.fillStyle = col + '2a'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = col + '99'; ctx.stroke();
    drawArrowArt(ctx, q.type, q.x, q.y + bob, -0.6, 46, q.tier >= 2 ? { glow: q.tier * 5 } : {});
    ctx.textAlign = 'center'; ctx.font = '800 10px system-ui, sans-serif'; ctx.fillStyle = col;
    ctx.fillText(`${WEAPONS[q.type].name.toUpperCase()} ${ROMAN[q.tier]}`, q.x, q.y + bob + pulse + 12);
  }
  for (const p of powerups) {
    if (!inView(p.x, p.y)) continue;
    const P = POWERUPS[p.type], bob = Math.sin(now / 250 + p.x) * 3;
    ctx.beginPath(); ctx.arc(p.x, p.y + bob, 24 + Math.sin(now / 180) * 2, 0, TAU); ctx.fillStyle = P.col + '33'; ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, p.y + bob, 16, 0, TAU); ctx.fillStyle = '#0d0f14'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = P.col; ctx.stroke();
    ctx.fillStyle = P.col; ctx.textAlign = 'center'; ctx.font = '800 14px system-ui, sans-serif';
    ctx.fillText(P.sym, p.x, p.y + bob + 5);
    ctx.font = '700 10px system-ui, sans-serif'; ctx.fillText(P.label, p.x, p.y + bob + 32);
  }
}

// ---------- arrow art: one drawing per type, used in flight, on the ground, in the HUD and on cards ----------
const ART = {
  classic: { shaft: '#a47a48', fletch: '#f2efe8', head: '#d9dde3' },
  fire: { shaft: '#4a2414', fletch: '#ff6a00', head: '#ff6a00' },
  frost: { shaft: '#d8eef7', fletch: '#9be7ff', head: '#e6f8ff' },
  explosive: { shaft: '#6b5a3a', fletch: '#ff8a3d', head: '#c9ccd1' },
  piercing: { shaft: '#b8c4d0', fletch: '#8fe3ff', head: '#eef4fa' },
  poison: { shaft: '#3d3324', fletch: '#7bd85c', head: '#a6f07a' },
  lightning: { shaft: '#33334d', fletch: '#ffe95a', head: '#fff27a' },
};
// Draws a whole arrow centred on (x, y), pointing along ang, len pixels long.
function drawArrowArt(g, type, x, y, ang, len, opts = {}) {
  const A = ART[type] || ART.classic, L = len, w = Math.max(1.6, L * 0.045);
  g.save(); g.translate(x, y); g.rotate(ang);
  const tail = -L / 2, tip = L / 2, headLen = type === 'piercing' ? L * 0.3 : L * 0.2, neck = tip - headLen, hw = L * 0.075;
  if (opts.glow) { g.shadowColor = opts.glowCol || WEAPONS[type].col; g.shadowBlur = opts.glow; }
  g.fillStyle = A.fletch;
  for (const sg of [-1, 1]) {
    g.beginPath(); g.moveTo(tail + L * 0.02, 0);
    g.quadraticCurveTo(tail + L * 0.08, sg * L * 0.12, tail + L * 0.25, sg * L * 0.02);
    g.lineTo(tail + L * 0.22, 0); g.closePath(); g.fill();
  }
  g.fillStyle = '#2b2b2b'; g.fillRect(tail - w * 0.5, -w, w * 1.4, w * 2);
  g.strokeStyle = A.shaft; g.lineWidth = w; g.lineCap = 'round';
  g.beginPath(); g.moveTo(tail, 0); g.lineTo(neck + 1, 0); g.stroke(); g.lineCap = 'butt';
  g.shadowBlur = 0;
  const edge = Math.max(1, w * 0.4);
  if (type === 'lightning') {
    g.fillStyle = A.head; g.strokeStyle = '#8a7400'; g.lineWidth = edge;
    g.beginPath(); g.moveTo(neck, -hw * 0.4); g.lineTo(neck + headLen * 0.45, -hw * 1.1); g.lineTo(neck + headLen * 0.4, -hw * 0.15);
    g.lineTo(tip, 0); g.lineTo(neck + headLen * 0.55, hw * 1.1); g.lineTo(neck + headLen * 0.6, hw * 0.15); g.lineTo(neck, hw * 0.4); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#ffe95a'; g.lineWidth = edge;
    g.beginPath(); g.moveTo(tail + L * 0.3, 0); g.lineTo(tail + L * 0.36, -w * 1.6); g.lineTo(tail + L * 0.42, w * 1.6); g.lineTo(tail + L * 0.48, 0); g.stroke();
  } else if (type === 'frost') {
    g.fillStyle = A.head; g.strokeStyle = '#5bc6ee'; g.lineWidth = edge;
    g.beginPath(); g.moveTo(neck - headLen * 0.15, 0); g.lineTo(neck + headLen * 0.35, -hw * 1.15); g.lineTo(tip, 0); g.lineTo(neck + headLen * 0.35, hw * 1.15); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#ffffff'; g.beginPath(); g.moveTo(neck + headLen * 0.2, 0); g.lineTo(tip - headLen * 0.15, 0); g.stroke();
    g.fillStyle = '#bfe9ff';
    for (const k of [0.3, 0.48]) { const sx = tail + L * k; g.beginPath(); g.moveTo(sx, -w * 0.5); g.lineTo(sx + L * 0.03, -w * 2.4); g.lineTo(sx + L * 0.06, -w * 0.5); g.fill(); }
  } else if (type === 'piercing') {
    g.fillStyle = A.head; g.strokeStyle = '#6aa9c8'; g.lineWidth = edge;
    g.beginPath(); g.moveTo(neck, -hw * 0.55); g.lineTo(tip, 0); g.lineTo(neck, hw * 0.55); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#8fe3ff'; g.fillRect(neck - L * 0.04, -hw * 0.75, L * 0.04, hw * 1.5);
  } else {
    g.fillStyle = A.head; g.strokeStyle = '#3a3a3a'; g.lineWidth = edge;
    g.beginPath(); g.moveTo(neck, -hw); g.lineTo(tip, 0); g.lineTo(neck, hw); g.lineTo(neck + headLen * 0.2, 0); g.closePath(); g.fill(); g.stroke();
  }
  if (type === 'fire') {
    const fl = Math.sin(performance.now() / 60) * 0.15;
    g.fillStyle = '#ff6a00bb';
    g.beginPath(); g.moveTo(tip, 0); g.quadraticCurveTo(neck, -hw * (2.3 + fl), neck - headLen * 1.4, 0); g.quadraticCurveTo(neck, hw * (2.3 - fl), tip, 0); g.fill();
    g.fillStyle = '#ffd24acc';
    g.beginPath(); g.moveTo(tip - headLen * 0.15, 0); g.quadraticCurveTo(neck, -hw * 1.1, neck - headLen * 0.7, 0); g.quadraticCurveTo(neck, hw * 1.1, tip - headLen * 0.15, 0); g.fill();
  }
  if (type === 'explosive') {
    const bx = neck - L * 0.07, br = L * 0.08;
    g.fillStyle = '#2b2b2b'; g.beginPath(); g.arc(bx, 0, br, 0, TAU); g.fill();
    g.fillStyle = '#5a5a5a'; g.beginPath(); g.arc(bx - br * 0.3, -br * 0.3, br * 0.3, 0, TAU); g.fill();
    g.strokeStyle = '#c9a36a'; g.lineWidth = edge; g.beginPath(); g.moveTo(bx, -br); g.quadraticCurveTo(bx + br * 0.4, -br * 1.6, bx + br, -br * 1.7); g.stroke();
    g.fillStyle = '#ffcf5a'; g.beginPath(); g.arc(bx + br, -br * 1.7, Math.max(1.2, br * 0.32), 0, TAU); g.fill();
  }
  if (type === 'poison') {
    g.fillStyle = '#7bd85c';
    for (const [k, dy] of [[0.15, 1.7], [0.45, 2.6]]) { g.beginPath(); g.arc(neck + headLen * k, hw * dy, Math.max(1, w * 0.75), 0, TAU); g.fill(); }
    g.strokeStyle = '#7bd85c'; g.lineWidth = edge; g.beginPath(); g.moveTo(neck + headLen * 0.15, hw * 0.6); g.lineTo(neck + headLen * 0.15, hw * 1.5); g.stroke();
  }
  g.restore();
}
const iconCache = new Map();
function arrowIconURL(type, tier) {
  const key = type + tier; if (iconCache.has(key)) return iconCache.get(key);
  const c = document.createElement('canvas'); c.width = 240; c.height = 80;
  drawArrowArt(c.getContext('2d'), type, 120, 40, 0, 210, { glow: tier >= 3 ? 16 : tier === 2 ? 7 : 0 });
  const url = c.toDataURL(); iconCache.set(key, url); return url;
}
function tierPips(x, y, tier, col, r = 3) {
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + i * (r * 3), y, r, 0, TAU); ctx.fillStyle = i < tier ? col : '#ffffff26'; ctx.fill(); }
}

function drawFighter(f) {
  ctx.save();
  if (f.dead) ctx.globalAlpha = Math.max(0, Math.min(1, f.deathT / 1.5)) * 0.8;
  ctx.beginPath(); ctx.ellipse(f.x + 3, f.y + 6, f.r, f.r * 0.7, 0, 0, TAU);
  ctx.fillStyle = '#00000066'; ctx.fill();
  ctx.translate(f.x, f.y);
  if (f.awaken > 0) {
    ctx.beginPath(); ctx.arc(0, 0, f.r + 9 + Math.sin(performance.now() / 90) * 3, 0, TAU);
    ctx.strokeStyle = '#ffc40099'; ctx.lineWidth = 5; ctx.stroke();
  }
  if (f.rage > 0 && !f.dead) {
    ctx.beginPath(); ctx.arc(0, 0, f.r + 5, 0, TAU); ctx.strokeStyle = '#ff4d4d88'; ctx.lineWidth = 4; ctx.stroke();
  }
  if (f.bubble > 0 && !f.dead) {
    ctx.beginPath(); ctx.arc(0, 0, f.r + 13, 0, TAU); ctx.fillStyle = '#7ad7ff1f'; ctx.fill();
    ctx.strokeStyle = '#7ad7ffaa'; ctx.lineWidth = 2; ctx.stroke();
  }
  if (f.drawing && !f.dead) {
    ctx.beginPath(); ctx.arc(0, 0, f.r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * f.draw);
    ctx.strokeStyle = f.draw >= 1 ? '#fff3c4' : '#ffffff70'; ctx.lineWidth = 3; ctx.stroke();
  }
  if (f.iframe > 0 && !f.dead && f.dashT <= 0 && Math.floor(performance.now() / 80) % 2) ctx.globalAlpha *= 0.5;
  ctx.rotate(f.face + f.spin);
  ctx.scale(f.r / BASE_R, f.r / BASE_R);
  const R = BASE_R;
  ctx.fillStyle = f.color; ctx.strokeStyle = '#0b0d12'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(6, 0, 8, 0, TAU); ctx.fillStyle = '#ffffff55'; ctx.fill();
  ctx.fillStyle = '#6b4a2a'; ctx.fillRect(-R - 4, -12, 10, 8);
  const bowX = R - 4 - f.recoil * 20, bowR = 22;
  const tipX = bowX + Math.cos(1.05) * bowR, tipY = Math.sin(1.05) * bowR;
  const pull = f.drawing ? f.draw * 20 : 0;
  ctx.strokeStyle = '#ddd2bd'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(tipX, -tipY); ctx.lineTo(tipX - pull, 0); ctx.lineTo(tipX, tipY); ctx.stroke();
  ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(bowX, 0, bowR, -1.05, 1.05); ctx.stroke(); ctx.lineCap = 'butt';
  if (f.drawing) drawArrowArt(ctx, f.weapon, tipX - pull + 16, 0, 0, 34);
  ctx.fillStyle = f.color; ctx.strokeStyle = '#0b0d12'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(bowX + bowR, 0, 6.5, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(tipX - pull, 0, 6.5, 0, TAU); ctx.fill(); ctx.stroke();
  if (f.flash > 0) { ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fillStyle = '#ffffffcc'; ctx.fill(); }
  if (f.frozen > 0) { ctx.beginPath(); ctx.arc(0, 0, R + 3, 0, TAU); ctx.fillStyle = '#bfe9ffaa'; ctx.fill(); ctx.strokeStyle = '#e6f8ff'; ctx.lineWidth = 2; ctx.stroke(); }
  else if (f.slow > 0) { ctx.beginPath(); ctx.arc(0, 0, R + 2, 0, TAU); ctx.strokeStyle = '#9be7ff88'; ctx.lineWidth = 2; ctx.stroke(); }
  if (f.poison > 0) { ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fillStyle = `rgba(123,216,92,${0.12 * f.poisonStacks})`; ctx.fill(); }
  if (f.blocking) {
    ctx.beginPath(); ctx.arc(0, 0, R + 14, -1.15, 1.15); ctx.strokeStyle = '#7ad7ff'; ctx.lineWidth = 6; ctx.stroke();
  }
  ctx.restore();

  if (f.dead) return;
  const bx = f.x - 26, by = f.y - f.r - 22;
  ctx.fillStyle = '#000000aa'; ctx.fillRect(bx - 1, by - 1, 54, 7);
  ctx.fillStyle = f.hp > f.maxHp * 0.5 ? '#4ade80' : f.hp > f.maxHp * 0.25 ? '#facc15' : '#ef4444';
  ctx.fillRect(bx, by, 52 * Math.max(0, f.hp) / f.maxHp, 5);
  ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = f === player ? '#ffb020' : '#e8ecf3';
  ctx.fillText(`${f.name} · ${f.level}`, f.x, by - 5);
  if (f.bounty) {
    const cx = f.x, cy = by - 22;
    ctx.fillStyle = '#ffc400'; ctx.beginPath();
    ctx.moveTo(cx - 12, cy + 6); ctx.lineTo(cx - 12, cy - 4); ctx.lineTo(cx - 6, cy + 1); ctx.lineTo(cx, cy - 8); ctx.lineTo(cx + 6, cy + 1); ctx.lineTo(cx + 12, cy - 4); ctx.lineTo(cx + 12, cy + 6); ctx.closePath(); ctx.fill();
    ctx.font = '800 9px system-ui, sans-serif'; ctx.fillText('BOUNTY', cx, cy - 12);
  }
  if (f.stun > 0 && f.ragdoll <= 0) {
    ctx.fillStyle = f.guardBreak > 0 ? '#ff5a5a' : '#facc15';
    ctx.fillText('✦', f.x - 10 + Math.sin(performance.now() / 70) * 6, by - 18);
  }
}

function drawWorld() {
  drawPickups();
  if (player.drawing && !player.dead) {
    const len = 140 + 420 * player.draw;
    ctx.save(); ctx.setLineDash([8, 10]); ctx.strokeStyle = `rgba(255,243,196,${0.15 + 0.35 * player.draw})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(player.x, player.y);
    ctx.lineTo(player.x + Math.cos(player.face) * len, player.y + Math.sin(player.face) * len); ctx.stroke(); ctx.restore();
  }
  for (const s of stuck) {
    if (!inView(s.x, s.y)) continue;
    ctx.globalAlpha = Math.min(1, s.life - s.t);
    drawArrowArt(ctx, s.weapon || 'classic', s.x - Math.cos(s.ang) * 8, s.y - Math.sin(s.ang) * 8, s.ang, 28);
  }
  ctx.globalAlpha = 1;
  for (const r of rings) {
    const k = r.t / r.life;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * k, r.arc ? r.arc[0] : 0, r.arc ? r.arc[1] : TAU);
    ctx.globalAlpha = 1 - k; ctx.strokeStyle = r.col; ctx.lineWidth = r.w; ctx.stroke(); ctx.globalAlpha = 1;
  }
  for (const p of particles) {
    if (!p.ghost) continue;
    ctx.globalAlpha = (1 - p.t / p.life) * 0.35;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fillStyle = p.col; ctx.fill();
  }
  ctx.globalAlpha = 1;
  const order = [...fighters].sort((a, b) => (a.dead === b.dead ? a.y - b.y : a.dead ? -1 : 1));
  for (const f of order) drawFighter(f);
  for (const a of arrows) {
    const glow = a.kind === 'rage' ? '#ff4d4d' : a.kind === 'gold' ? '#ffc400' : a.tier >= 3 ? WEAPONS[a.weapon || 'classic'].col : null;
    drawArrowArt(ctx, a.weapon || 'classic', a.x - Math.cos(a.ang) * 17, a.y - Math.sin(a.ang) * 17, a.ang, 36, glow ? { glow: 10, glowCol: glow } : {});
  }
  for (const b of bolts) {
    ctx.globalAlpha = 1 - b.t / 0.18; ctx.strokeStyle = '#ffe95a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(b.x1, b.y1);
    for (let i = 1; i < 6; i++) {
      const k = i / 6, j = (Math.random() - 0.5) * 22;
      const nx = -(b.y2 - b.y1), ny = b.x2 - b.x1, nl = Math.hypot(nx, ny) || 1;
      ctx.lineTo(b.x1 + (b.x2 - b.x1) * k + nx / nl * j, b.y1 + (b.y2 - b.y1) * k + ny / nl * j);
    }
    ctx.lineTo(b.x2, b.y2); ctx.stroke(); ctx.globalAlpha = 1;
  }
  for (const p of particles) {
    if (p.ghost) continue;
    ctx.globalAlpha = 1 - p.t / p.life;
    if (p.streak) { ctx.strokeStyle = p.col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y - 18); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    else { ctx.fillStyle = p.col; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const t of texts) {
    const k = t.t / t.life;
    ctx.globalAlpha = 1 - k * k;
    ctx.font = `800 ${t.big ? 20 : 15}px system-ui, sans-serif`;
    ctx.lineWidth = 4; ctx.strokeStyle = '#000';
    ctx.strokeText(t.txt, t.x, t.y - k * 34); ctx.fillStyle = t.col; ctx.fillText(t.txt, t.x, t.y - k * 34);
  }
  ctx.globalAlpha = 1;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function cdFraction(id) {
  if (id === 'dash') return player.dashCharges >= DASH_CHARGES ? 0 : player.cd.dash / DASH_RECHARGE;
  return 0;
}

function drawHud() {
  const bw = touchMode ? Math.min(300, W * 0.34) : Math.min(360, W - 32), bx = touchMode ? 12 : (W - bw) / 2, by = touchMode ? 10 : 14;
  ctx.fillStyle = '#000000aa'; roundRect(bx - 4, by - 4, bw + 8, 37, 8); ctx.fill();
  ctx.fillStyle = '#3a1010'; ctx.fillRect(bx, by, bw, 14);
  ctx.fillStyle = player.hp > player.maxHp * 0.5 ? '#4ade80' : player.hp > player.maxHp * 0.25 ? '#facc15' : '#ef4444';
  ctx.fillRect(bx, by, bw * Math.max(0, player.hp) / player.maxHp, 14);
  if (player.bubble > 0) { ctx.fillStyle = '#7ad7ffaa'; ctx.fillRect(bx, by + 10, bw * Math.min(1, player.bubble / player.maxHp), 4); }
  ctx.fillStyle = '#0f2a28'; ctx.fillRect(bx, by + 18, bw, 11);
  ctx.fillStyle = '#5eead4';
  ctx.fillRect(bx, by + 18, player.level >= MAX_LEVEL ? bw : bw * player.xp / xpNeed(player.level), 11);
  ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
  ctx.fillText(`HP ${Math.ceil(Math.max(0, player.hp))} / ${player.maxHp}`, bx + 4, by + 11);
  ctx.fillStyle = '#ffffff'; ctx.font = '800 9px system-ui, sans-serif';
  ctx.fillText(player.level >= MAX_LEVEL ? `LEVEL ${player.level} · MAX` : `LEVEL ${player.level} · ${player.xp} / ${xpNeed(player.level)} XP`, bx + 4, by + 27);
  ctx.textAlign = 'right'; ctx.fillStyle = WEAPONS[player.weapon].col; ctx.font = '800 9px system-ui, sans-serif';
  ctx.fillText(touchMode ? D().name.toUpperCase() : `${WEAPONS[player.weapon].name.toUpperCase()} ${ROMAN[player.tier]} · ${D().name.toUpperCase()}`, bx + bw - 4, by + 27);
  ctx.textAlign = 'right'; ctx.fillStyle = '#ffc400'; ctx.font = '700 11px system-ui, sans-serif';
  if (player.awaken > 0) ctx.fillText(`VOLLEY ${Math.ceil(player.awaken)}s`, bx + bw - 4, by + 11);
  const buffs = [];
  if (player.rage > 0) buffs.push([`RAGE ${Math.ceil(player.rage)}s`, '#ff4d4d']);
  if (player.haste > 0) buffs.push([`HASTE ${Math.ceil(player.haste)}s`, '#5ab0ff']);
  if (player.bubble > 0) buffs.push([`SHIELD ${Math.ceil(player.bubble)}`, '#7ad7ff']);
  if (player.vision > 0) buffs.push([`VISION ${Math.ceil(player.vision)}s`, '#c084fc']);
  if (buffs.length) {
    ctx.font = '800 12px system-ui, sans-serif'; ctx.textAlign = 'center';
    const gap = 110, start = W / 2 - (buffs.length - 1) * gap / 2;
    buffs.forEach(([t, c], i) => { ctx.fillStyle = c; ctx.fillText(t, start + i * gap, by + 60); });
  }

  const compact = W < 640 || H < 500;
  let lb = [...fighters].sort((a, b) => b.kills - a.kills || b.level - a.level);
  if (compact) { const top = lb.slice(0, 3); if (!top.includes(player)) top.push(player); lb = top; } else lb = lb.slice(0, 7);
  const lx = 12, ly = touchMode ? 52 : compact ? 60 : 14;
  ctx.fillStyle = '#00000088'; roundRect(lx, ly, 150, 22 + lb.length * 17, 8); ctx.fill();
  ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#9aa3b2';
  ctx.fillText('PLAYER', lx + 10, ly + 15); ctx.textAlign = 'right'; ctx.fillText('LV   KILLS', lx + 140, ly + 15);
  lb.forEach((f, i) => {
    ctx.fillStyle = f === player ? '#ffb020' : f.color;
    ctx.font = `${f === player ? 800 : 600} 12px system-ui, sans-serif`;
    ctx.textAlign = 'left'; ctx.fillText(f.name, lx + 10, ly + 33 + i * 17);
    ctx.textAlign = 'right'; ctx.fillStyle = '#5eead4'; ctx.fillText(`${f.level}`, lx + 96, ly + 33 + i * 17);
    ctx.fillStyle = '#e8ecf3'; ctx.fillText(`${f.kills}`, lx + 140, ly + 33 + i * 17);
  });

  // phones: owned upgrades as a row of symbols with counts
  if (compact) {
    const owned = UPGRADES.filter(u => player.up[u.id] > 0);
    owned.forEach((u, i) => {
      const cx = lx + 12 + (i % 6) * 26, cy = ly + 34 + lb.length * 17 + Math.floor(i / 6) * 26;
      ctx.beginPath(); ctx.arc(cx, cy, 11, 0, TAU); ctx.fillStyle = '#000000aa'; ctx.fill();
      drawUpIcon(ctx, u.id, cx, cy, 7);
      if (player.up[u.id] > 1) { ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '800 8px system-ui, sans-serif'; ctx.fillText(player.up[u.id], cx + 9, cy + 10); }
    });
  }
  // owned upgrades (desktop: a named list)
  if (!compact) {
    const owned = UPGRADES.filter(u => player.up[u.id] > 0);
    if (owned.length) {
      const oy = ly + 30 + lb.length * 17;
      ctx.fillStyle = '#00000088'; roundRect(lx, oy, 150, 22 + owned.length * 16, 8); ctx.fill();
      ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#9aa3b2';
      ctx.fillText('UPGRADES', lx + 10, oy + 15);
      owned.forEach((u, i) => {
        drawUpIcon(ctx, u.id, lx + 16, oy + 27 + i * 16, 6);
        ctx.textAlign = 'left'; ctx.fillStyle = '#e8ecf3'; ctx.font = '600 11px system-ui, sans-serif';
        ctx.fillText(u.name, lx + 28, oy + 31 + i * 16);
        ctx.textAlign = 'right'; ctx.fillStyle = '#5eead4'; ctx.fillText(`×${player.up[u.id]}`, lx + 140, oy + 31 + i * 16);
      });
    }
  }

  ctx.font = '700 13px system-ui, sans-serif';
  feed.forEach((e, i) => {
    const y = touchMode ? 24 + i * 20 : (compact ? 70 : 22) + i * 22;
    ctx.globalAlpha = Math.min(1, e.t);
    ctx.textAlign = 'right';
    const right = touchMode ? W / 2 + 70 : W - 12;
    const vw = ctx.measureText(e.v).width;
    ctx.fillStyle = e.vc; ctx.fillText(e.v, right, y);
    if (e.k) {
      ctx.fillStyle = '#9aa3b2'; ctx.fillText(' ➶ ', right - vw, y);
      const kw = ctx.measureText(' ➶ ').width;
      ctx.fillStyle = e.kc; ctx.fillText(e.k, right - vw - kw, y);
    }
  });
  ctx.globalAlpha = 1;

  if (touchMode && H > W) {
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffb020'; ctx.font = '700 13px system-ui, sans-serif';
    ctx.fillText('Turn your phone sideways to play', W / 2, 80);
  }
  drawSwapPrompt();
  drawOffer();
  drawBountyHud();
  if (touchMode) drawTouch();
  else drawArrowBar();

  if (player.dead) {
    ctx.fillStyle = '#000000aa'; ctx.fillRect(0, H / 2 - 40, W, 80);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '800 26px system-ui, sans-serif';
    ctx.fillText(`KNOCKED OUT · back in ${Math.max(1, Math.ceil(player.deathT))} · level resets`, W / 2, H / 2 + 9);
  }
  if (!touchMode && !paused && !choosing) drawCrosshair();
}

function drawCrosshair() {
  const x = mouse.x, y = mouse.y;
  ctx.lineWidth = 2; ctx.strokeStyle = '#000000aa';
  ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU);
  ctx.moveTo(x - 16, y); ctx.lineTo(x - 5, y); ctx.moveTo(x + 5, y); ctx.lineTo(x + 16, y);
  ctx.moveTo(x, y - 16); ctx.lineTo(x, y - 5); ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 16);
  ctx.stroke();
  if (player.drawing) {
    ctx.beginPath(); ctx.arc(x, y, 15, -Math.PI / 2, -Math.PI / 2 + TAU * player.draw);
    ctx.strokeStyle = player.draw >= 1 ? '#fff3c4' : '#ffb020'; ctx.lineWidth = 3; ctx.stroke();
  }
}

// one dot per dash charge
function dashPips(cx, cy, r) {
  for (let i = 0; i < DASH_CHARGES; i++) {
    ctx.beginPath(); ctx.arc(cx + (i - (DASH_CHARGES - 1) / 2) * r * 3, cy, r, 0, TAU);
    ctx.fillStyle = i < player.dashCharges ? '#ffb020' : '#ffffff26'; ctx.fill();
  }
}

function drawArrowBar() {
  const gap = 8, dashW = 76, sw = Math.min(170, (W - 40 - dashW - gap * MAX_SLOTS) / MAX_SLOTS), h = 64;
  const total = dashW + MAX_SLOTS * (sw + gap);
  let x = (W - total) / 2; const y = H - h - 14;
  const frac = clamp(cdFraction('dash'), 0, 1);
  ctx.fillStyle = '#000000aa'; roundRect(x, y, dashW, h, 10); ctx.fill();
  if (frac > 0) { ctx.fillStyle = '#ffffff18'; ctx.fillRect(x, y + h * (1 - frac), dashW, h * frac); }
  ctx.strokeStyle = player.dashCharges > 0 ? '#ffb020' : '#3a4357'; ctx.lineWidth = 2; roundRect(x, y, dashW, h, 10); ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffb020'; ctx.font = '800 13px system-ui, sans-serif'; ctx.fillText('SPACE', x + dashW / 2, y + 22);
  ctx.fillStyle = '#e8ecf3'; ctx.font = '600 11px system-ui, sans-serif'; ctx.fillText(frac > 0 ? `Dash ${player.cd.dash.toFixed(1)}` : 'Dash x2', x + dashW / 2, y + 40);
  dashPips(x + dashW / 2, y + 53, 4);
  x += dashW + gap;
  for (let i = 0; i < MAX_SLOTS; i++) {
    const sl = player.slots[i], on = sl && i === player.cur, col = sl ? WEAPONS[sl.type].col : '#3a4357';
    ctx.fillStyle = on ? '#1c2330ee' : '#000000aa'; roundRect(x, y, sw, h, 10); ctx.fill();
    ctx.strokeStyle = on ? col : sl ? '#2a3140' : '#232a37'; ctx.lineWidth = on ? 3 : 2;
    if (!sl) ctx.setLineDash([5, 5]);
    roundRect(x, y, sw, h, 10); ctx.stroke(); ctx.setLineDash([]);
    ctx.textAlign = 'left'; ctx.fillStyle = on ? col : '#6b7383'; ctx.font = '800 12px system-ui, sans-serif'; ctx.fillText(String(i + 1), x + 8, y + 16);
    if (sl) {
      drawArrowArt(ctx, sl.type, x + sw / 2, y + 24, 0, sw * 0.78, sl.tier >= 3 ? { glow: 10 } : {});
      ctx.textAlign = 'left'; ctx.fillStyle = on ? '#fff' : '#c8ced8'; ctx.font = '700 11px system-ui, sans-serif';
      ctx.fillText(WEAPONS[sl.type].name, x + 8, y + h - 10);
      tierPips(x + sw - 28, y + h - 14, sl.tier, col);
    } else {
      ctx.textAlign = 'center'; ctx.fillStyle = '#4a5263'; ctx.font = '600 11px system-ui, sans-serif'; ctx.fillText('empty', x + sw / 2, y + h / 2 + 4);
    }
    x += sw + gap;
  }
  if (offer) return;   // the level-up strip sits here
  ctx.textAlign = 'center'; ctx.fillStyle = '#9aa3b2'; ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillText('Q / E, mouse wheel or 1 2 3 to switch arrows · find more on the ground and at every 3rd level', W / 2, y - 10);
}

function drawSwitchPanel() {
  const r = switchRect(), sl = player.slots[player.cur], col = WEAPONS[sl.type].col, k = r.k;
  ctx.fillStyle = '#0b0e14dd'; roundRect(r.x, r.y, r.w, r.h, 12); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 2.5; roundRect(r.x, r.y, r.w, r.h, 12); ctx.stroke();
  drawArrowArt(ctx, sl.type, r.x + r.w * 0.27, r.y + r.h * 0.5, -0.35, r.w * 0.44, sl.tier >= 3 ? { glow: 10 } : {});
  const tx = r.x + r.w * 0.53;
  const title = `${WEAPONS[sl.type].name.toUpperCase()} ${ROMAN[sl.tier]}`;
  let tsz = Math.round(14 * k);
  ctx.font = `800 ${tsz}px system-ui, sans-serif`;
  while (tsz > 8 && ctx.measureText(title).width > r.x + r.w - tx - 8) { tsz--; ctx.font = `800 ${tsz}px system-ui, sans-serif`; }
  ctx.textAlign = 'left'; ctx.fillStyle = col;
  ctx.fillText(title, tx, r.y + r.h * 0.38);
  // one chip per slot: filled = carried, outlined = in hand
  for (let i = 0; i < MAX_SLOTS; i++) {
    const s2 = player.slots[i], cx = tx + i * 18 * k, cy = r.y + r.h * 0.6, cw = 14 * k, ch = 9 * k;
    ctx.fillStyle = s2 ? WEAPONS[s2.type].col : '#ffffff1f'; ctx.fillRect(cx, cy, cw, ch);
    if (i === player.cur) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(cx - 1.5, cy - 1.5, cw + 3, ch + 3); }
  }
  const hint = player.slots.length > 1 ? 'TAP TO SWITCH ⟳' : 'FIND MORE ARROWS';
  let hsz = Math.round(8 * k + 1);
  ctx.font = `700 ${hsz}px system-ui, sans-serif`;
  while (hsz > 6 && ctx.measureText(hint).width > r.x + r.w - tx - 8) { hsz--; ctx.font = `700 ${hsz}px system-ui, sans-serif`; }
  ctx.fillStyle = '#9aa3b2'; ctx.fillText(hint, tx, r.y + r.h * 0.9);
}

// Bounty: a crown over the hunted one, an arrow at the screen edge pointing to them, and a warning if it is you
function drawBountyHud() {
  const b = fighters.find(f => f.bounty && !f.dead);
  if (!b) return;
  if (b === player) {
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffc400'; ctx.font = '800 13px system-ui, sans-serif';
    ctx.fillText('YOU HAVE A BOUNTY · everyone is hunting you', W / 2, H * 0.32);
    return;
  }
  const sx = (b.x - cam.x) * VS + W / 2, sy = (b.y - cam.y) * VS + H / 2;
  if (sx > 30 && sx < W - 30 && sy > 30 && sy < H - 30) return;   // on screen: the crown is enough
  const ang = Math.atan2(sy - H / 2, sx - W / 2), m = 46;
  const ex = clamp(W / 2 + Math.cos(ang) * W, m, W - m), ey = clamp(H / 2 + Math.sin(ang) * H, m + 40, H - m);
  ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang);
  ctx.fillStyle = '#ffc400'; ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffc400'; ctx.font = '800 10px system-ui, sans-serif';
  ctx.fillText(`BOUNTY ${b.name} · LV ${b.level}`, ex, ey + 24);
}

function drawSwapPrompt() {
  if (!swapCand || player.dead) return;
  const out = player.slots[swapIndex(player)], qcol = WEAPONS[swapCand.type].col;
  const label = `SWAP ${WEAPONS[out.type].name.toUpperCase()} ${ROMAN[out.tier]} → ${WEAPONS[swapCand.type].name.toUpperCase()} ${ROMAN[swapCand.tier]}`;
  if (touchMode) {
    const r = swapRect();
    ctx.fillStyle = '#2a1d05ee'; roundRect(r.x, r.y, r.w, r.h, 10); ctx.fill();
    ctx.strokeStyle = qcol; ctx.lineWidth = 2.5; roundRect(r.x, r.y, r.w, r.h, 10); ctx.stroke();
    const short = `SWAP → ${WEAPONS[swapCand.type].name.toUpperCase()} ${ROMAN[swapCand.tier]}`;
    let fsz = Math.round(13 * r.k + 1);
    ctx.font = `800 ${fsz}px system-ui, sans-serif`;
    while (fsz > 8 && ctx.measureText(short).width > r.w - 16) { fsz--; ctx.font = `800 ${fsz}px system-ui, sans-serif`; }
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.fillText(short, r.x + r.w / 2, r.y + r.h / 2 + fsz * 0.35);
  } else {
    ctx.textAlign = 'center'; ctx.font = '800 14px system-ui, sans-serif';
    const L = offerLayout(), y = L ? L.y0 - 30 : H - 150, text = `R  ·  ${label}`, w = ctx.measureText(text).width + 30;
    ctx.fillStyle = '#2a1d05ee'; roundRect(W / 2 - w / 2, y - 20, w, 30, 8); ctx.fill();
    ctx.strokeStyle = qcol; ctx.lineWidth = 2; roundRect(W / 2 - w / 2, y - 20, w, 30, 8); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillText(text, W / 2, y);
  }
}

function drawTouch() {
  drawSwitchPanel();
  const pb = pauseBtn();
  ctx.beginPath(); ctx.arc(pb.x, pb.y, pb.r, 0, TAU); ctx.fillStyle = '#00000088'; ctx.fill();
  ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(pb.x - 6, pb.y - 7, 4, 14); ctx.fillRect(pb.x + 2, pb.y - 7, 4, 14);
  if (canFullscreen) {
    const fb = fsBtn(), q = 7, e = 4, full = isFullscreen();
    ctx.beginPath(); ctx.arc(fb.x, fb.y, fb.r, 0, TAU); ctx.fillStyle = '#00000088'; ctx.fill();
    ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cx = fb.x + sx * q, cy = fb.y + sy * q, d = full ? -1 : 1;
      ctx.moveTo(cx, cy - sy * e * d); ctx.lineTo(cx, cy); ctx.lineTo(cx - sx * e * d, cy);
    }
    ctx.stroke();
  }
  if (joy.id !== null) {
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 58, 0, TAU); ctx.fillStyle = '#ffffff14'; ctx.fill();
    ctx.strokeStyle = '#ffffff40'; ctx.lineWidth = 2; ctx.stroke();
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, m = Math.hypot(dx, dy), k = m > 55 ? 55 / m : 1;
    ctx.beginPath(); ctx.arc(joy.ox + dx * k, joy.oy + dy * k, 26, 0, TAU); ctx.fillStyle = '#ffffff55'; ctx.fill();
  } else {
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff40'; ctx.font = '600 13px system-ui, sans-serif';
    if (!offer) ctx.fillText('drag here to move', W * 0.22, H - 60);
  }
  // aim-and-shoot stick: floats under the thumb anywhere in the bottom-right quarter
  const k = touchK(), wcol = WEAPONS[player.weapon].col;
  if (aimStick.id !== null) {
    const R = 60 * k, ax = aimStick.x - aimStick.ox, ay = aimStick.y - aimStick.oy, m = Math.hypot(ax, ay), kk = m > R ? R / m : 1;
    ctx.beginPath(); ctx.arc(aimStick.ox, aimStick.oy, R, 0, TAU); ctx.fillStyle = '#00000055'; ctx.fill();
    ctx.strokeStyle = wcol; ctx.lineWidth = 3; ctx.stroke();
    if (player.drawing) {
      ctx.beginPath(); ctx.arc(aimStick.ox, aimStick.oy, R + 6, -Math.PI / 2, -Math.PI / 2 + TAU * player.draw);
      ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 4; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(aimStick.ox + ax * kk, aimStick.oy + ay * kk, 24 * k, 0, TAU); ctx.fillStyle = wcol + 'aa'; ctx.fill();
  } else {
    // a resting hint where the right thumb usually lands
    const hx = W - 128 * k, hy = H - 105 * k, r = 56 * k;
    ctx.beginPath(); ctx.arc(hx, hy, r, 0, TAU); ctx.fillStyle = '#00000066'; ctx.fill();
    ctx.strokeStyle = wcol + 'aa'; ctx.lineWidth = 3; ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '800 12px system-ui, sans-serif'; ctx.fillText('SHOOT', hx, hy + 2);
    ctx.fillStyle = '#9aa3b2'; ctx.font = '700 8px system-ui, sans-serif'; ctx.fillText('OR ANYWHERE', hx, hy + 15);
    if (!aimedOnce && !offer) {
      ctx.fillStyle = '#ffffff55'; ctx.textAlign = 'left';
      ctx.font = '800 11px system-ui, sans-serif'; ctx.fillText('SHOOT ZONE', W / 2 + 12, H - 38);
      ctx.font = '600 11px system-ui, sans-serif'; ctx.fillText('press · drag to aim · let go', W / 2 + 12, H - 22);
    }
  }
  for (const b of touchButtons()) {
    const frac = clamp(cdFraction(b.id), 0, 1);
    const held = btnHeld(b.id);
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fillStyle = held ? '#ffb02066' : '#00000088'; ctx.fill();
    const ready = b.id === 'dash' ? player.dashCharges > 0 : frac <= 0;
    ctx.lineWidth = 3; ctx.strokeStyle = ready ? '#ffb020aa' : '#3a4357'; ctx.stroke();
    if (frac > 0) {
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
      ctx.closePath(); ctx.fillStyle = '#ffffff22'; ctx.fill();
    }
    ctx.textAlign = 'center'; ctx.fillStyle = ready ? '#fff' : '#8a93a3';
    ctx.font = `800 ${b.label.length > 1 ? 11 : 16}px system-ui, sans-serif`;
    ctx.fillText(b.label, b.x, b.y + (b.id === 'dash' ? 2 : 5));
    if (b.id === 'dash') dashPips(b.x, b.y + b.r * 0.45, Math.max(2.5, b.r * 0.1));
  }
}

// ---------- main loop ----------
let last = performance.now();
let cursorHidden = false;
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  const hide = running && !touchMode && !paused && !choosing;
  if (hide !== cursorHidden) { canvas.style.cursor = hide ? 'none' : 'default'; cursorHidden = hide; }
  if (running && !paused && !choosing) {
    if (hitStop > 0) hitStop -= dt;
    else {
      const intents = fighters.map(f => (f === player ? playerIntent(dt) : botIntent(f, dt)));
      pressed.clear(); btnPressed.clear();
      fighters.forEach((f, i) => updateFighter(f, dt, intents[i]));
      separate();
      updateArrows(dt);
      updatePickups(dt);
      for (const p of particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (!p.streak) { p.vx *= 0.92; p.vy *= 0.92; } }
      particles = particles.filter(p => p.t < p.life);
      for (const r of rings) r.t += dt;
      rings = rings.filter(r => r.t < r.life);
      for (const t of texts) t.t += dt;
      texts = texts.filter(t => t.t < t.life);
      for (const e of feed) e.t -= dt;
      feed = feed.filter(e => e.t > 0);
      for (const b of bolts) b.t += dt;
      bolts = bolts.filter(b => b.t < 0.18);
    }
    ensureOffer();
    updateBounty();
    // the camera leans toward the aim so you can see further ahead
    const lean = player.dead ? 0 : 60 + 60 * player.draw;
    const tx = player.x + Math.cos(player.face) * lean, ty = player.y + Math.sin(player.face) * lean;
    const k = 1 - Math.exp(-6 * dt);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    shake *= Math.exp(-10 * dt);
    // VISION eases the camera out, and back in when it ends (or when you are knocked out)
    const zt = player.vision > 0 && !player.dead ? VISION_ZOOM : 1;
    zoom += (zt - zoom) * (1 - Math.exp(-3 * dt)); VS = VIEW * zoom;
  }

  ctx.setTransform(DPR * UIS, 0, 0, DPR * UIS, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (player) {
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
    ctx.save();
    ctx.translate(W / 2 + sx, H / 2 + sy); ctx.scale(VS, VS); ctx.translate(-cam.x, -cam.y);
    drawArena(); drawWorld();
    ctx.restore();
    if (running) drawHud();
  }
  requestAnimationFrame(frame);
}

newGame();
document.getElementById('play').addEventListener('click', () => {
  document.getElementById('menu').style.display = 'none';
  running = true; last = performance.now();
  mouse.x = W / 2 + 120; mouse.y = H / 2;
  if (touchMode || window.matchMedia('(pointer: coarse)').matches) enterFullscreen();
  lockPointer();
});
requestAnimationFrame(frame);
