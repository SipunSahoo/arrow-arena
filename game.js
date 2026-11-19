'use strict';
// Arrow Arena prototype 0.4: top-down free-for-all archery brawler with XP, levels, upgrades, power-ups,
// six arrow types and three bot difficulties.
// Plain canvas, no libraries.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const ARENA_R = 1200;
const DRAW_TIME = 0.75;      // seconds to a full draw
const SHOT_CD = 0.28;
const RAIN_RANGE = 420;
const ORB_TARGET = 150;      // loose XP dots kept on the ground
const MAX_LEVEL = 30;
const xpNeed = level => 6 + level * 6;

const SKILLS = [
  { key: 's1', label: '1', name: 'Triple Shot', cd: 6 },
  { key: 's2', label: '2', name: 'Piercing', cd: 9 },
  { key: 's3', label: '3', name: 'Arrow Rain', cd: 12 },
  { key: 's4', label: '4', name: 'Bomb Arrow', cd: 9 },
];

const UPGRADES = [
  { id: 'dmg', name: 'Sharp Arrows', desc: '+15% damage on everything you shoot', max: 5 },
  { id: 'draw', name: 'Quick Draw', desc: 'Draw the bow 15% faster', max: 4 },
  { id: 'speed', name: 'Swift Feet', desc: '+8% move speed', max: 4 },
  { id: 'hp', name: 'Vitality', desc: '+20 max HP, and heals 20 now', max: 5 },
  { id: 'multi', name: 'Multishot', desc: 'One more arrow on every bow shot', max: 3 },
  { id: 'pierce', name: 'Piercing Tips', desc: 'Bow arrows pass through one more enemy', max: 2 },
  { id: 'range', name: 'Longbow', desc: 'Arrows fly 20% faster and further', max: 3 },
  { id: 'vamp', name: 'Lifesteal', desc: 'Heal 4% of the damage you deal', max: 3 },
  { id: 'cdr', name: 'Focus', desc: 'Skills recharge 15% faster', max: 3 },
  { id: 'magnet', name: 'Magnet', desc: 'Pull XP dots from 50% further away', max: 3 },
  { id: 'ricochet', name: 'Ricochet', desc: 'Arrows bounce off rocks and walls once more', max: 2 },
  { id: 'regen', name: 'Regeneration', desc: 'Heal 1.5 HP every second', max: 3 },
  { id: 'back', name: 'Back Shot', desc: 'Every bow shot also fires one arrow behind you', max: 1 },
  { id: 'ice', name: 'Frost Tips', desc: 'Fully drawn arrows slow whoever they hit', max: 1 },
];
const freshUpgrades = () => Object.fromEntries(UPGRADES.map(u => [u.id, 0]));

const POWERUPS = {
  rage: { col: '#ff4d4d', label: 'RAGE', sym: '×2', note: 'double damage for 10s' },
  haste: { col: '#5ab0ff', label: 'HASTE', sym: '»', note: 'faster moving and drawing for 10s' },
  bubble: { col: '#7ad7ff', label: 'SHIELD', sym: '◆', note: 'absorbs the next 40 damage' },
  heal: { col: '#4ade80', label: 'HEAL', sym: '+', note: '+40 HP' },
};

// Arrow types: the bow's normal shots. Skills stay the same for everyone.
const WEAPONS = {
  classic: { name: 'Classic', col: '#e8d9b0', desc: 'Balanced. A full draw hits hardest', dmg: 1, speed: 1, draw: 1 },
  fire: { name: 'Fire', col: '#ff6a00', desc: 'Sets enemies on fire: extra damage over 3 seconds', dmg: 0.85, speed: 1, draw: 1 },
  frost: { name: 'Frost', col: '#9be7ff', desc: 'Slows on hit. A full draw freezes them solid', dmg: 0.85, speed: 1, draw: 1 },
  blast: { name: 'Blast', col: '#ff8a3d', desc: 'Explodes where it lands. Slower to draw', dmg: 0.65, speed: 0.9, draw: 0.85 },
  poison: { name: 'Poison', col: '#7bd85c', desc: 'Poison that stacks up to 3 times', dmg: 0.8, speed: 1, draw: 1.05 },
  lightning: { name: 'Lightning', col: '#ffe95a', desc: 'Very fast. Jumps to a second enemy', dmg: 0.8, speed: 1.25, draw: 1 },
};
const WEAPON_IDS = Object.keys(WEAPONS);

// How the bots play. "hard" is how they played before 0.4.
const DIFFICULTY = {
  easy: { name: 'Easy', aim: 0.32, lead: 0.3, dodge: 1.2, dashDodge: 0.35, block: 0.5, skill: 0.3, wait: [0.4, 1.0], full: 0.2, dmg: 0.65, playerBias: 1.6, keep: [300, 420] },
  normal: { name: 'Normal', aim: 0.2, lead: 0.55, dodge: 3.5, dashDodge: 0.5, block: 0.8, skill: 0.6, wait: [0.15, 0.5], full: 0.35, dmg: 0.85, playerBias: 1.25, keep: [260, 380] },
  hard: { name: 'Hard', aim: 0.12, lead: 0.8, dodge: 7, dashDodge: 0.6, block: 1, skill: 1, wait: [0, 0.12], full: 0.45, dmg: 1, playerBias: 1, keep: [240, 340] },
};
const settings = { weapon: 'classic', difficulty: 'easy' };
try {
  const saved = JSON.parse(localStorage.getItem('arrowArena.settings') || '{}');
  if (WEAPONS[saved.weapon]) settings.weapon = saved.weapon;
  if (DIFFICULTY[saved.difficulty]) settings.difficulty = saved.difficulty;
} catch (e) { /* storage blocked: defaults are fine */ }
function saveSettings() { try { localStorage.setItem('arrowArena.settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } }
const D = () => DIFFICULTY[settings.difficulty];

// ---------- canvas ----------
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1, VIEW = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  VIEW = clamp(Math.min(W, H) / 820, 0.5, 1.05);
}
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
let fighters = [], arrows = [], stuck = [], rains = [], particles = [], rings = [], texts = [], feed = [];
let orbs = [], powerups = [], puTimer = 3, bolts = [];
let hitStop = 0, shake = 0, running = false, paused = false, choosing = false;
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
    this.weapon = isBot ? WEAPON_IDS[Math.floor(Math.random() * WEAPON_IDS.length)] : settings.weapon;
    this.ai = { target: null, retarget: 0, strafe: 1, strafeT: 0, block: 0, flee: 0, want: 0.6, keep: rand(...D().keep), aimErr: 0, wait: 0 };
    this.spawn();
  }
  spawn() {
    const p = freeSpot();
    Object.assign(this, {
      x: p.x, y: p.y, vx: 0, vy: 0, maxHp: 100, hp: 100, face: rand(0, TAU), dead: false, deathT: 0,
      stun: 0, ragdoll: 0, spin: 0, spinV: 0, shotCd: 0, draw: 0, drawing: false, recoil: 0,
      blocking: false, dashT: 0, lock: 0, cd: { dash: 0, s1: 0, s2: 0, s3: 0, s4: 0 },
      ult: 0, awaken: 0, slow: 0, flash: 0, iframe: 1.2, lastHitBy: null, lastHitT: 0, guardBreak: 0,
      level: 1, xp: 0, xpTotal: 0, up: freshUpgrades(), pendingChoices: 0, rage: 0, haste: 0, bubble: 0,
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
function ring(x, y, r0, r1, life, col, w = 4) { rings.push({ x, y, r0, r1, t: 0, life, col, w }); }
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
    f.xp -= xpNeed(f.level); f.level++;
    ring(f.x, f.y, 10, 70, 0.4, '#5eead4', 4);
    popText(f.x, f.y - 46, `LEVEL ${f.level}`, '#5eead4', true);
    if (f.isBot) { const opts = availableUpgrades(f); if (opts.length) applyUpgrade(f, opts[Math.floor(Math.random() * opts.length)].id); }
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
  ring(p.x, p.y, 10, 80, 0.4, P.col, 5);
  popText(f.x, f.y - 46, P.label, P.col, true);
}

function updatePickups(dt) {
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
  }
  orbs = orbs.filter(o => !o.taken);
  powerups = powerups.filter(p => !p.taken);
  puTimer -= dt;
  if (puTimer <= 0) {
    puTimer = rand(8, 13);
    if (powerups.length < 4) {
      const types = Object.keys(POWERUPS), s = freeSpot(60);
      powerups.push({ ...s, type: types[Math.floor(Math.random() * types.length)], t: 0 });
    }
  }
  for (const p of powerups) p.t += dt;
}

// ---------- combat ----------
function applyHit(a, t, o) {
  if (t.dead || t.iframe > 0) return false;
  const dir = o.dir !== undefined ? o.dir : Math.atan2(t.y - a.y, t.x - a.x);
  const mult = (1 + 0.15 * a.up.dmg) * (a.rage > 0 ? 2 : 1) * (a.awaken > 0 ? 1.3 : 1);
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
      t.ult = Math.min(100, t.ult + 3);
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
  a.ult = Math.min(100, a.ult + dmg * 1.4);
  t.ult = Math.min(100, t.ult + dmg * 0.6);
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
  let dmg = amount * (src ? (1 + 0.15 * src.up.dmg) * (src.isBot ? D().dmg : 1) : 1);
  if (t.bubble > 0) { const soak = Math.min(t.bubble, dmg); t.bubble -= soak; dmg -= soak; }
  if (dmg <= 0) return;
  t.hp -= dmg;
  popText(t.x + rand(-14, 14), t.y - 26, Math.max(1, Math.round(dmg)).toString(), col);
  if (src && src !== t) { src.ult = Math.min(100, src.ult + dmg); t.lastHitBy = src; t.lastHitT = Math.max(t.lastHitT, 3); }
  if (t.hp <= 0) killFighter(t, src);
}

// What an arrow's type does after it lands on someone.
function weaponOnHit(a, t) {
  const src = a.owner;
  if (a.weapon === 'fire') { t.burn = 3; t.burnBy = src; t.burnTick = Math.min(t.burnTick || 0.5, 0.5); }
  if (a.weapon === 'frost') {
    t.slow = Math.max(t.slow, 1.3);
    if (a.charge >= 0.98 && !t.dead) { t.stun = Math.max(t.stun, 0.8); t.frozen = 0.8; t.drawing = false; t.draw = 0; ring(t.x, t.y, 10, 40, 0.3, '#9be7ff'); }
  }
  if (a.weapon === 'poison') { t.poison = 4; t.poisonBy = src; t.poisonStacks = Math.min(3, t.poisonStacks + 1); }
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
function miniBlast(x, y, owner, charge, skip) {
  ring(x, y, 6, 70, 0.28, '#ff8a3d', 5);
  sparks(x, y, '#ff8a3d', 12, 300);
  for (const t of fighters) {
    if (t === owner || t === skip || t.dead) continue;
    if (Math.hypot(t.x - x, t.y - y) < 70 + t.r) applyHit(owner, t, { dmg: 4 + 6 * charge, kb: 300, stun: 0.2, dir: Math.atan2(t.y - y, t.x - x), unblockable: true });
  }
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
  dropOrbs(t.x, t.y, 4 + Math.floor(t.xpTotal * 0.5), true);   // half their XP spills on the ground
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
    weapon: o.weapon || null, charge: o.charge || 0,
  });
}

function fireBow(f, charge) {
  const c = clamp(charge, 0.15, 1), full = c >= 0.98, U = f.up, Wp = WEAPONS[f.weapon];
  const base = {
    speed: (650 + 800 * c) * (1 + 0.2 * U.range) * Wp.speed, life: 0.85 * (1 + 0.15 * U.range),
    dmg: (5 + 11 * c) * Wp.dmg, kb: full ? 320 : 90 * c, stun: full ? 0.3 : 0.12, pierceLeft: U.pierce,
    slow: full && U.ice ? 1.5 : 0, weapon: f.weapon, charge: c,
    bounces: f.weapon === 'blast' ? 0 : U.ricochet,
    kind: f.rage > 0 ? 'rage' : f.awaken > 0 ? 'gold' : f.weapon !== 'classic' ? f.weapon : U.ice && full ? 'ice' : full ? 'full' : 'normal',
  };
  spawnArrow(f, f.face, base);
  for (let i = 1; i <= U.multi; i++) spawnArrow(f, f.face + (i % 2 ? 1 : -1) * 0.13 * Math.ceil(i / 2), { ...base, dmg: base.dmg * 0.7 });
  if (U.back) spawnArrow(f, f.face + Math.PI, { ...base, dmg: base.dmg * 0.7 });
  f.shotCd = SHOT_CD * (f.awaken > 0 ? 0.6 : 1); f.recoil = 0.12;
  f.vx -= Math.cos(f.face) * 40 * c; f.vy -= Math.sin(f.face) * 40 * c;
  if (full) sparks(f.x + Math.cos(f.face) * 30, f.y + Math.sin(f.face) * 30, '#ffe7a8', 5, 160);
}

function skillTriple(f) {
  f.cd.s1 = SKILLS[0].cd; f.lock = 0.15; f.recoil = 0.12;
  for (const off of [-0.22, 0, 0.22]) spawnArrow(f, f.face + off, { speed: 1150, dmg: 8, kb: 120, stun: 0.15 });
}
function skillPierce(f) {
  f.cd.s2 = SKILLS[1].cd; f.lock = 0.25; f.recoil = 0.15;
  spawnArrow(f, f.face, { speed: 1700, dmg: 14, kb: 260, stun: 0.4, pierce: true, guardBreak: true, kind: 'pierce', life: 0.8, bounces: 0 });
  ring(f.x + Math.cos(f.face) * 30, f.y + Math.sin(f.face) * 30, 4, 34, 0.2, '#8fe3ff');
}
function skillRain(f, tx, ty) {
  f.cd.s3 = SKILLS[2].cd; f.lock = 0.3;
  let dx = tx - f.x, dy = ty - f.y; const d = Math.hypot(dx, dy);
  if (d > RAIN_RANGE) { dx *= RAIN_RANGE / d; dy *= RAIN_RANGE / d; }
  rains.push({ x: f.x + dx, y: f.y + dy, owner: f, t: 0, delay: 0.55, dur: 1.5, tick: 0, r: 115 });
  for (let i = 0; i < 6; i++) particles.push({ x: f.x, y: f.y, vx: rand(-40, 40), vy: rand(-320, -200), t: 0, life: 0.35, col: '#ffe7a8', size: 3 });
}
function skillBlast(f) {
  f.cd.s4 = SKILLS[3].cd; f.lock = 0.22; f.recoil = 0.15;
  spawnArrow(f, f.face, { speed: 900, dmg: 6, kb: 80, blast: true, kind: 'blast', life: 0.7, bounces: 0 });
}
function explode(x, y, owner) {
  ring(x, y, 10, 120, 0.35, '#ff8a3d', 7);
  sparks(x, y, '#ff8a3d', 22, 420); sparks(x, y, '#ffd27a', 10, 260);
  for (const t of fighters) {
    if (t === owner || t.dead) continue;
    if (Math.hypot(t.x - x, t.y - y) < 110 + t.r) applyHit(owner, t, { dmg: 12, kb: 620, ragdoll: 0.6, dir: Math.atan2(t.y - y, t.x - x), unblockable: true });
  }
  if (Math.hypot(player.x - x, player.y - y) < 600) shake = Math.max(shake, 9);
}
function awaken(f) {
  f.awaken = 10; f.ult = 0; f.hp = Math.min(f.maxHp, f.hp + 20); f.lock = 0.3;
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
  const cdRate = dt * (fast ? 2 : 1) * (1 + 0.15 * U.cdr);
  for (const k in f.cd) f.cd[k] = Math.max(0, f.cd[k] - (k === 'dash' ? dt : cdRate));
  f.shotCd = Math.max(0, f.shotCd - dt); f.recoil = Math.max(0, f.recoil - dt);
  f.flash = Math.max(0, f.flash - dt); f.iframe = Math.max(0, f.iframe - dt); f.stun = Math.max(0, f.stun - dt);
  f.lock = Math.max(0, f.lock - dt); f.slow = Math.max(0, f.slow - dt);
  f.guardBreak = Math.max(0, f.guardBreak - dt); f.lastHitT = Math.max(0, f.lastHitT - dt);
  f.rage = Math.max(0, f.rage - dt); f.haste = Math.max(0, f.haste - dt);
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
    if (f.deathT <= 0) f.spawn();
    return;
  }
  if (U.regen) f.hp = Math.min(f.maxHp, f.hp + 1.5 * U.regen * dt);
  f.frozen = Math.max(0, f.frozen - dt);
  if (f.burn > 0) {
    f.burn -= dt; f.burnTick -= dt;
    if (Math.random() < dt * 25) particles.push({ x: f.x + rand(-14, 14), y: f.y + rand(-14, 14), vx: rand(-15, 15), vy: rand(-90, -50), t: 0, life: 0.35, col: Math.random() < 0.5 ? '#ff6a00' : '#ffb020', size: rand(2, 4) });
    if (f.burnTick <= 0) { f.burnTick = 0.5; dotHit(f, f.burnBy, 1.6, '#ff8a3d'); if (f.dead) return; }
  }
  if (f.poison > 0) {
    f.poison -= dt; f.poisonTick -= dt;
    if (Math.random() < dt * 10) particles.push({ x: f.x + rand(-14, 14), y: f.y + rand(-14, 14), vx: 0, vy: rand(-40, -20), t: 0, life: 0.5, col: '#7bd85c', size: rand(2, 4) });
    if (f.poisonTick <= 0) { f.poisonTick = 0.5; dotHit(f, f.poisonBy, 0.9 * f.poisonStacks, '#7bd85c'); if (f.dead) return; }
    if (f.poison <= 0) f.poisonStacks = 0;
  }
  if (f.dashT > 0) {
    f.dashT -= dt;
    particles.push({ x: f.x, y: f.y, vx: 0, vy: 0, t: 0, life: 0.25, col: f.color, size: f.r * 0.8, ghost: true });
  }

  f.blocking = !!I.block && f.canAct;
  if ((f.canAct || f.blocking) && I.aim !== undefined) f.face = I.aim;
  if (!f.canAct || f.blocking) { f.drawing = false; f.draw = 0; }

  if (f.canAct) {
    let mx = I.mx || 0, my = I.my || 0;
    const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
    let sp = 240 * (fast ? 1.2 : 1) * (1 + 0.08 * U.speed) * (f.haste > 0 ? 1.35 : 1);
    if (f.blocking) sp = 95; else if (f.drawing) sp *= 0.6;
    if (f.slow > 0) sp *= 0.55;
    const k = 1 - Math.exp(-14 * dt);
    f.vx += (mx * sp - f.vx) * k; f.vy += (my * sp - f.vy) * k;
    if (!f.blocking) {
      if (I.dash && f.cd.dash <= 0) {
        let dx = mx, dy = my;
        if (Math.hypot(dx, dy) < 0.2) { dx = Math.cos(f.face); dy = Math.sin(f.face); }
        const dl = Math.hypot(dx, dy);
        f.vx = dx / dl * 950; f.vy = dy / dl * 950; f.dashT = 0.17; f.cd.dash = 1.6;
        f.iframe = Math.max(f.iframe, 0.2); f.drawing = false; f.draw = 0;
      } else if (I.ult && f.ult >= 100) awaken(f);
      else if (I.s1 && f.cd.s1 <= 0) skillTriple(f);
      else if (I.s2 && f.cd.s2 <= 0) skillPierce(f);
      else if (I.s3 && f.cd.s3 <= 0) skillRain(f, I.tx ?? f.x + Math.cos(f.face) * 300, I.ty ?? f.y + Math.sin(f.face) * 300);
      else if (I.s4 && f.cd.s4 <= 0) skillBlast(f);
      else if (I.m1 && f.shotCd <= 0) {
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
        if (a.bounces > 0 && !a.blast) {
          if (wall) bounceArrow(a, -a.x / dc, -a.y / dc);
          else { const px = a.x - pil.x, py = a.y - pil.y, pd = Math.hypot(px, py) || 1; bounceArrow(a, px / pd, py / pd); }
          continue;
        }
        a.life = 0; a.done = true;
        if (a.blast) explode(a.x, a.y, a.owner);
        else if (a.weapon === 'blast') miniBlast(a.x, a.y, a.owner, a.charge, null);
        else { stuck.push({ x: a.x, y: a.y, ang: a.ang, t: 0, life: 4, kind: a.kind }); sparks(a.x, a.y, '#c9b38a', 4, 120); }
        break;
      }
      for (const t of fighters) {
        if (t === a.owner || t.dead || a.hit.has(t)) continue;
        if (Math.hypot(t.x - a.x, t.y - a.y) < t.r + 4) {
          a.hit.add(t);
          if (t.iframe > 0) continue;   // dodged: the arrow flies on
          if (a.blast) { a.life = 0; a.done = true; explode(a.x, a.y, a.owner); break; }
          const res = applyHit(a.owner, t, { dmg: a.dmg, kb: a.kb, stun: a.stun, ragdoll: a.ragdoll, slow: a.slow, guardBreak: a.guardBreak, dir: a.ang });
          if (res === true && a.weapon) weaponOnHit(a, t);
          if (a.weapon === 'blast') { miniBlast(a.x, a.y, a.owner, a.charge, t); a.life = 0; a.done = true; break; }
          if (a.pierce) continue;
          if (a.pierceLeft > 0) { a.pierceLeft--; continue; }
          a.life = 0; a.done = true; break;
        }
      }
    }
    if (a.kind === 'pierce' && Math.random() < 0.8) particles.push({ x: a.x, y: a.y, vx: 0, vy: 0, t: 0, life: 0.25, col: '#8fe3ff', size: 3 });
    if (a.weapon && a.weapon !== 'classic' && Math.random() < 0.6) particles.push({ x: a.x, y: a.y, vx: rand(-25, 25), vy: rand(-25, 25), t: 0, life: 0.25, col: WEAPONS[a.weapon].col, size: 3 });
    if (a.kind === 'blast' && Math.random() < 0.8) particles.push({ x: a.x, y: a.y, vx: rand(-30, 30), vy: rand(-30, 30), t: 0, life: 0.3, col: '#ff8a3d', size: 4 });
  }
  // a blast arrow that runs out of flight explodes where it lands
  arrows = arrows.filter(a => {
    if (a.life > 0) return true;
    if (a.blast && !a.done) explode(a.x, a.y, a.owner);
    return false;
  });
  for (const s of stuck) s.t += dt;
  stuck = stuck.filter(s => s.t < s.life);
  if (stuck.length > 120) stuck.splice(0, stuck.length - 120);

  for (const r of rains) {
    r.t += dt;
    if (r.t < r.delay) continue;
    r.tick -= dt;
    for (let i = 0; i < 3; i++) {
      const a = rand(0, TAU), d = Math.sqrt(Math.random()) * r.r;
      particles.push({ x: r.x + Math.cos(a) * d, y: r.y + Math.sin(a) * d - 40, vx: 0, vy: 420, t: 0, life: 0.1, col: '#e8d9b0', size: 2, streak: true });
    }
    if (r.tick <= 0) {
      r.tick = 0.15;
      for (const t of fighters) {
        if (t === r.owner || t.dead) continue;
        if (Math.hypot(t.x - r.x, t.y - r.y) < r.r + t.r * 0.5) applyHit(r.owner, t, { dmg: 3, slow: 0.4, unblockable: true, dir: Math.atan2(t.y - r.y, t.x - r.x), kb: 0 });
      }
    }
  }
  rains = rains.filter(r => r.t < r.delay + r.dur);
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
      const d = dist(f, t) * rand(0.7, 1.3) * (t === player ? DF.playerBias : 1);
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
  const goal = nearestPickup(f, powerups, 420) || (d > ai.keep + 60 || ai.flee > 0 ? nearestPickup(f, orbs, 230) : null);
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
    if (f.cd.dash <= 0 && Math.random() < DF.dashDodge) {
      const tx = -threat.vy, ty = threat.vx, s = Math.random() < 0.5 ? -1 : 1;
      I.mx = tx * s; I.my = ty * s; I.dash = true; return I;
    }
    if (Math.random() < DF.block) ai.block = rand(0.3, 0.6);
  }
  ai.block -= dt;
  if (ai.block > 0) { I.block = true; I.aim = threat ? Math.atan2(-threat.vy, -threat.vx) : I.aim; return I; }

  if (f.ult >= 100 && d < 260) { I.ult = true; return I; }
  if (ai.flee <= 0) {
    const sk = DF.skill;
    if (f.cd.s1 <= 0 && d < 420 && Math.random() < dt * 0.6 * sk) I.s1 = true;
    if (f.cd.s2 <= 0 && d < 650 && Math.random() < dt * 0.5 * sk) I.s2 = true;
    if (f.cd.s3 <= 0 && d < RAIN_RANGE && Math.random() < dt * 0.5 * sk) I.s3 = true;
    if (f.cd.s4 <= 0 && d < 420 && Math.random() < dt * 0.5 * sk) I.s4 = true;
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
    mouse.l = mouse.r = false; keys.clear(); joy.id = null; btnTouches.clear();
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
  const lab2 = document.createElement('div'); lab2.className = 'plabel'; lab2.textContent = 'Your arrows';
  const grid = document.createElement('div'); grid.className = 'wgrid';
  for (const id of WEAPON_IDS) {
    const w = WEAPONS[id], b = document.createElement('button');
    b.className = 'wcard' + (id === settings.weapon ? ' on' : '');
    b.style.setProperty('--wc', w.col);
    b.innerHTML = `<b>${w.name}</b><span>${w.desc}</span>`;
    b.addEventListener('click', () => {
      settings.weapon = id; saveSettings();
      if (player) player.weapon = id;
      refreshPickers();
    });
    grid.appendChild(b);
  }
  el.append(lab1, diffRow, lab2, grid);
}
function refreshPickers() {
  buildPickers(document.getElementById('menuPickers'));
  if (paused) buildPickers(document.getElementById('pausePickers'));
}
buildPickers(document.getElementById('menuPickers'));
const pauseBtn = () => ({ x: W - 30, y: 30, r: 20 });

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (choosing && ['1', '2', '3'].includes(k)) { pickCard(Number(k) - 1); e.preventDefault(); return; }
  if (!keys.has(k)) pressed.add(k);
  keys.add(k);
  if ([' ', 'tab'].includes(k)) e.preventDefault();
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); mouse.l = mouse.r = false; });
document.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  touchMode = false;
  if (isLocked()) { mouse.x = clamp(mouse.x + e.movementX, 0, W); mouse.y = clamp(mouse.y + e.movementY, 0, H); }
  else { mouse.x = e.clientX; mouse.y = e.clientY; }
});
canvas.addEventListener('mousedown', e => {
  if (running && !choosing && !paused && !touchMode && canLock && !isLocked() && !wasLocked) lockPointer();
  if (e.button === 0) mouse.l = true;
  if (e.button === 2) mouse.r = true;
});
window.addEventListener('mouseup', e => { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// touch: left side joystick, right side buttons
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const btnTouches = new Map(); // touch id -> button id
const btnPressed = new Set();
function touchButtons() {
  const k = clamp(Math.min(W, H) / 480, 0.62, 1);
  const cx = W - 128 * k, cy = H - 105 * k, R = 125 * k;
  const at = (deg, rad, rr) => ({ x: cx + Math.cos(deg * Math.PI / 180) * rad, y: cy + Math.sin(deg * Math.PI / 180) * rad, r: rr * k });
  return [
    { id: 'm1', label: 'SHOOT', x: cx, y: cy, r: 48 * k },
    { id: 'dash', label: 'DASH', ...at(180, R, 30) },
    { id: 'block', label: 'SHIELD', ...at(206, R, 30) },
    { id: 's1', label: '1', ...at(232, R, 27) },
    { id: 's2', label: '2', ...at(258, R, 27) },
    { id: 's3', label: '3', ...at(284, R, 27) },
    { id: 's4', label: '4', ...at(310, R, 27) },
    { id: 'ult', label: 'G', ...at(292, 205 * k, 30) },
  ];
}
function handleTouchStart(e) {
  e.preventDefault(); touchMode = true;
  const pb = pauseBtn();
  for (const t of e.changedTouches) if (running && Math.hypot(t.clientX - pb.x, t.clientY - pb.y) < pb.r + 12) { setPaused(true); return; }
  const btns = touchButtons();
  for (const t of e.changedTouches) {
    const hit = btns.find(b => Math.hypot(t.clientX - b.x, t.clientY - b.y) < b.r + 10);
    if (hit) { btnTouches.set(t.identifier, hit.id); btnPressed.add(hit.id); continue; }
    if (t.clientX < W * 0.55 && joy.id === null) { joy.id = t.identifier; joy.ox = joy.x = t.clientX; joy.oy = joy.y = t.clientY; }
  }
}
function handleTouchMove(e) {
  e.preventDefault();
  for (const t of e.changedTouches) if (t.identifier === joy.id) { joy.x = t.clientX; joy.y = t.clientY; }
}
function handleTouchEnd(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) joy.id = null;
    btnTouches.delete(t.identifier);
  }
}
canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });
const btnHeld = id => [...btnTouches.values()].includes(id);

function playerIntent() {
  const I = { mx: 0, my: 0, aim: player.face };
  if (touchMode) {
    if (joy.id !== null) {
      const dx = joy.x - joy.ox, dy = joy.y - joy.oy, m = Math.hypot(dx, dy);
      if (m > 8) { I.mx = dx / Math.max(m, 55); I.my = dy / Math.max(m, 55); }
    }
    // auto-aim: nearest enemy in range, leading a moving target
    let best = null, bd = 650;
    for (const t of fighters) { if (t === player || t.dead) continue; const d = dist(player, t); if (d < bd) { bd = d; best = t; } }
    if (best) {
      const tt = bd / (650 + 800 * Math.max(player.draw, 0.3));
      I.aim = Math.atan2(best.y + best.vy * tt * 0.8 - player.y, best.x + best.vx * tt * 0.8 - player.x);
      I.tx = best.x; I.ty = best.y;
    } else if (I.mx || I.my) I.aim = Math.atan2(I.my, I.mx);
    I.m1 = btnHeld('m1'); I.block = btnHeld('block');
    for (const id of ['dash', 's1', 's2', 's3', 's4', 'ult']) if (btnPressed.has(id)) I[id] = true;
  } else {
    I.mx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    I.my = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    const wx = (mouse.x - W / 2) / VIEW + cam.x, wy = (mouse.y - H / 2) / VIEW + cam.y;
    I.aim = Math.atan2(wy - player.y, wx - player.x);
    I.tx = wx; I.ty = wy;
    I.m1 = mouse.l || keys.has('j');
    I.block = mouse.r || keys.has('f');
    I.dash = pressed.has(' ') || pressed.has('shift');
    I.s1 = pressed.has('1'); I.s2 = pressed.has('2'); I.s3 = pressed.has('3'); I.s4 = pressed.has('4');
    I.ult = pressed.has('g');
  }
  return I;
}

// ---------- level-up choice ----------
const levelEl = document.getElementById('levelup');
const cardsEl = document.getElementById('cards');
let cardChoices = [];
function openChoice() {
  const opts = availableUpgrades(player);
  if (!opts.length) { player.pendingChoices = 0; return; }
  cardChoices = [];
  while (cardChoices.length < Math.min(3, opts.length)) {
    const u = opts[Math.floor(Math.random() * opts.length)];
    if (!cardChoices.includes(u)) cardChoices.push(u);
  }
  choosing = true;
  mouse.l = mouse.r = false; joy.id = null; btnTouches.clear();
  if (isLocked()) document.exitPointerLock();
  document.getElementById('lvtitle').textContent = `LEVEL ${player.level - player.pendingChoices + 1}`;
  cardsEl.innerHTML = '';
  cardChoices.forEach((u, i) => {
    const b = document.createElement('button');
    b.className = 'card';
    b.innerHTML = `<span class="key">${touchMode ? '' : i + 1}</span><b>${u.name}</b><span>${u.desc}</span><em>${player.up[u.id]} / ${u.max}</em>`;
    b.addEventListener('click', () => pickCard(i));
    cardsEl.appendChild(b);
  });
  levelEl.style.display = 'flex';
}
function pickCard(i) {
  if (!choosing || !cardChoices[i]) return;
  applyUpgrade(player, cardChoices[i].id);
  popText(player.x, player.y - 46, cardChoices[i].name, '#5eead4', true);
  player.pendingChoices--;
  choosing = false; levelEl.style.display = 'none';
  pressed.clear(); keys.clear();
  if (player.pendingChoices <= 0) lockPointer();
}

// ---------- game setup ----------
function newGame() {
  fighters = []; arrows = []; stuck = []; rains = []; particles = []; rings = []; texts = []; feed = [];
  orbs = []; powerups = []; puTimer = 3;
  player = new Fighter('You', '#ffb020', false);
  fighters.push(player);
  const bots = [['Raze', '#ff5a5a'], ['Nova', '#5ab0ff'], ['Kuro', '#a77bff'], ['Blitz', '#4ade80'], ['Vex', '#f472b6'], ['Sora', '#22d3ee']];
  for (const [n, c] of bots) fighters.push(new Fighter(n, c, true));
  for (let i = 0; i < ORB_TARGET; i++) spawnAmbientOrb();
  cam.x = player.x; cam.y = player.y;
}

// ---------- drawing ----------
function inView(x, y, pad = 60) {
  return Math.abs(x - cam.x) < W / 2 / VIEW + pad && Math.abs(y - cam.y) < H / 2 / VIEW + pad;
}
function drawArena() {
  ctx.fillStyle = '#0d0f14'; ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, ARENA_R, 0, TAU);
  ctx.fillStyle = '#1d2a22'; ctx.fill();
  ctx.clip();
  ctx.strokeStyle = '#223127'; ctx.lineWidth = 2;
  const x0 = Math.floor((cam.x - W / 2 / VIEW) / 100) * 100, x1 = cam.x + W / 2 / VIEW;
  const y0 = Math.floor((cam.y - H / 2 / VIEW) / 100) * 100, y1 = cam.y + H / 2 / VIEW;
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

const ARROW_COLS = { normal: '#e8d9b0', full: '#fff3c4', gold: '#ffc400', pierce: '#8fe3ff', blast: '#ff8a3d', rage: '#ff4d4d', ice: '#bfe9ff',
  classic: '#e8d9b0', fire: '#ff6a00', frost: '#9be7ff', poison: '#7bd85c', lightning: '#ffe95a' };
function drawArrowShape(x, y, ang, kind, fletch, len = 28) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const tx = x - c * len, ty = y - s * len;
  ctx.strokeStyle = '#8a6a3f'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
  ctx.fillStyle = ARROW_COLS[kind] || '#e8d9b0';
  ctx.beginPath(); ctx.moveTo(x + c * 7, y + s * 7); ctx.lineTo(x - s * 4, y + c * 4); ctx.lineTo(x + s * 4, y - c * 4); ctx.closePath(); ctx.fill();
  if (fletch) {
    ctx.strokeStyle = fletch; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tx, ty); ctx.lineTo(tx - c * 6 - s * 5, ty - s * 6 + c * 5);
    ctx.moveTo(tx, ty); ctx.lineTo(tx - c * 6 + s * 5, ty - s * 6 - c * 5);
    ctx.stroke();
  }
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
  ctx.fillStyle = f.color; ctx.strokeStyle = '#0b0d12'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, f.r, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(6, 0, 8, 0, TAU); ctx.fillStyle = '#ffffff55'; ctx.fill();
  ctx.fillStyle = '#6b4a2a'; ctx.fillRect(-f.r - 4, -12, 10, 8);
  const bowX = f.r - 4 - f.recoil * 20, bowR = 22;
  const tipX = bowX + Math.cos(1.05) * bowR, tipY = Math.sin(1.05) * bowR;
  const pull = f.drawing ? f.draw * 20 : 0;
  ctx.strokeStyle = '#ddd2bd'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(tipX, -tipY); ctx.lineTo(tipX - pull, 0); ctx.lineTo(tipX, tipY); ctx.stroke();
  ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(bowX, 0, bowR, -1.05, 1.05); ctx.stroke(); ctx.lineCap = 'butt';
  if (f.drawing) drawArrowShape(tipX - pull + 30, 0, 0, f.draw >= 1 ? 'full' : 'normal', null, 30);
  ctx.fillStyle = f.color; ctx.strokeStyle = '#0b0d12'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(bowX + bowR, 0, 6.5, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(tipX - pull, 0, 6.5, 0, TAU); ctx.fill(); ctx.stroke();
  if (f.flash > 0) { ctx.beginPath(); ctx.arc(0, 0, f.r, 0, TAU); ctx.fillStyle = '#ffffffcc'; ctx.fill(); }
  if (f.frozen > 0) { ctx.beginPath(); ctx.arc(0, 0, f.r + 3, 0, TAU); ctx.fillStyle = '#bfe9ffaa'; ctx.fill(); ctx.strokeStyle = '#e6f8ff'; ctx.lineWidth = 2; ctx.stroke(); }
  else if (f.slow > 0) { ctx.beginPath(); ctx.arc(0, 0, f.r + 2, 0, TAU); ctx.strokeStyle = '#9be7ff88'; ctx.lineWidth = 2; ctx.stroke(); }
  if (f.poison > 0) { ctx.beginPath(); ctx.arc(0, 0, f.r, 0, TAU); ctx.fillStyle = `rgba(123,216,92,${0.12 * f.poisonStacks})`; ctx.fill(); }
  if (f.blocking) {
    ctx.beginPath(); ctx.arc(0, 0, f.r + 14, -1.15, 1.15); ctx.strokeStyle = '#7ad7ff'; ctx.lineWidth = 6; ctx.stroke();
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
  for (const r of rains) {
    const warm = r.t < r.delay;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU);
    ctx.fillStyle = warm ? `rgba(255,90,90,${0.08 + 0.12 * (r.t / r.delay)})` : 'rgba(255,231,168,0.10)'; ctx.fill();
    ctx.strokeStyle = warm ? '#ff5a5a99' : '#ffe7a866'; ctx.lineWidth = 3; ctx.stroke();
  }
  for (const s of stuck) {
    if (!inView(s.x, s.y)) continue;
    ctx.globalAlpha = Math.min(1, s.life - s.t);
    drawArrowShape(s.x + Math.cos(s.ang) * 6, s.y + Math.sin(s.ang) * 6, s.ang, s.kind, '#b9b2a4', 22);
  }
  ctx.globalAlpha = 1;
  for (const r of rings) {
    const k = r.t / r.life;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * k, 0, TAU);
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
  for (const a of arrows) drawArrowShape(a.x, a.y, a.ang, a.kind, a.owner.color);
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
  if (id === 'ult') return 1 - player.ult / 100;
  if (id === 'dash') return player.cd.dash / 1.6;
  const s = SKILLS.find(s => s.key === id);
  return s ? player.cd[id] / s.cd : 0;
}

function drawHud() {
  const bw = Math.min(360, W - 32), bx = (W - bw) / 2, by = 14;
  ctx.fillStyle = '#000000aa'; roundRect(bx - 4, by - 4, bw + 8, 48, 8); ctx.fill();
  ctx.fillStyle = '#3a1010'; ctx.fillRect(bx, by, bw, 14);
  ctx.fillStyle = player.hp > player.maxHp * 0.5 ? '#4ade80' : player.hp > player.maxHp * 0.25 ? '#facc15' : '#ef4444';
  ctx.fillRect(bx, by, bw * Math.max(0, player.hp) / player.maxHp, 14);
  if (player.bubble > 0) { ctx.fillStyle = '#7ad7ffaa'; ctx.fillRect(bx, by + 10, bw * Math.min(1, player.bubble / player.maxHp), 4); }
  ctx.fillStyle = '#2a2410'; ctx.fillRect(bx, by + 18, bw, 7);
  ctx.fillStyle = player.ult >= 100 ? (Math.floor(performance.now() / 200) % 2 ? '#ffe680' : '#ffc400') : '#c99a00';
  ctx.fillRect(bx, by + 18, bw * player.ult / 100, 7);
  ctx.fillStyle = '#0f2a28'; ctx.fillRect(bx, by + 29, bw, 11);
  ctx.fillStyle = '#5eead4';
  ctx.fillRect(bx, by + 29, player.level >= MAX_LEVEL ? bw : bw * player.xp / xpNeed(player.level), 11);
  ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
  ctx.fillText(`HP ${Math.ceil(Math.max(0, player.hp))} / ${player.maxHp}`, bx + 4, by + 11);
  ctx.fillStyle = '#ffffff'; ctx.font = '800 9px system-ui, sans-serif';
  ctx.fillText(player.level >= MAX_LEVEL ? `LEVEL ${player.level} · MAX` : `LEVEL ${player.level} · ${player.xp} / ${xpNeed(player.level)} XP`, bx + 4, by + 38);
  ctx.textAlign = 'right'; ctx.fillStyle = WEAPONS[player.weapon].col; ctx.font = '800 9px system-ui, sans-serif';
  ctx.fillText(`${WEAPONS[player.weapon].name.toUpperCase()} ARROWS · ${D().name.toUpperCase()}`, bx + bw - 4, by + 38);
  ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = '700 11px system-ui, sans-serif';
  ctx.fillText(player.awaken > 0 ? `STORM VOLLEY ${Math.ceil(player.awaken)}s` : player.ult >= 100 ? 'ULT READY' : '', bx + bw - 4, by + 11);
  const buffs = [];
  if (player.rage > 0) buffs.push([`RAGE ${Math.ceil(player.rage)}s`, '#ff4d4d']);
  if (player.haste > 0) buffs.push([`HASTE ${Math.ceil(player.haste)}s`, '#5ab0ff']);
  if (player.bubble > 0) buffs.push([`SHIELD ${Math.ceil(player.bubble)}`, '#7ad7ff']);
  if (buffs.length) {
    ctx.font = '800 12px system-ui, sans-serif'; ctx.textAlign = 'center';
    const gap = 110, start = W / 2 - (buffs.length - 1) * gap / 2;
    buffs.forEach(([t, c], i) => { ctx.fillStyle = c; ctx.fillText(t, start + i * gap, by + 60); });
  }

  const compact = W < 640 || H < 500;
  let lb = [...fighters].sort((a, b) => b.kills - a.kills || b.level - a.level);
  if (compact) { const top = lb.slice(0, 3); if (!top.includes(player)) top.push(player); lb = top; } else lb = lb.slice(0, 7);
  const lx = 12, ly = compact ? 60 : 14;
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

  // owned upgrades (desktop only; phones are short on space)
  if (!compact) {
    const owned = UPGRADES.filter(u => player.up[u.id] > 0);
    if (owned.length) {
      const oy = ly + 30 + lb.length * 17;
      ctx.fillStyle = '#00000088'; roundRect(lx, oy, 150, 22 + owned.length * 16, 8); ctx.fill();
      ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#9aa3b2';
      ctx.fillText('UPGRADES', lx + 10, oy + 15);
      owned.forEach((u, i) => {
        ctx.textAlign = 'left'; ctx.fillStyle = '#e8ecf3'; ctx.font = '600 11px system-ui, sans-serif';
        ctx.fillText(u.name, lx + 10, oy + 31 + i * 16);
        ctx.textAlign = 'right'; ctx.fillStyle = '#5eead4'; ctx.fillText(`×${player.up[u.id]}`, lx + 140, oy + 31 + i * 16);
      });
    }
  }

  ctx.font = '700 13px system-ui, sans-serif';
  feed.forEach((e, i) => {
    const y = (compact || touchMode ? 70 : 22) + i * 22;
    ctx.globalAlpha = Math.min(1, e.t);
    ctx.textAlign = 'right';
    const right = W - 12;
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
  if (touchMode) drawTouch();
  else drawSkillBar();

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

function drawSkillBar() {
  const slots = [
    { id: 'dash', key: 'SPACE', name: 'Dash' },
    ...SKILLS.map(s => ({ id: s.key, key: s.label, name: s.name })),
    { id: 'ult', key: 'G', name: 'Volley' },
  ];
  const sw = 74, gap = 8, total = slots.length * sw + (slots.length - 1) * gap;
  let x = (W - total) / 2; const y = H - 84;
  for (const s of slots) {
    const frac = clamp(cdFraction(s.id), 0, 1);
    ctx.fillStyle = '#000000aa'; roundRect(x, y, sw, 66, 10); ctx.fill();
    if (frac > 0) { ctx.fillStyle = '#ffffff18'; ctx.fillRect(x, y + 66 * (1 - frac), sw, 66 * frac); }
    ctx.strokeStyle = frac <= 0 ? (s.id === 'ult' ? '#ffc400' : '#ffb020') : '#3a4357'; ctx.lineWidth = 2;
    roundRect(x, y, sw, 66, 10); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = frac <= 0 ? '#ffb020' : '#6b7383'; ctx.font = '800 16px system-ui, sans-serif';
    ctx.fillText(s.key, x + sw / 2, y + 26);
    ctx.fillStyle = '#e8ecf3'; ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(s.name, x + sw / 2, y + 47);
    if (frac > 0 && s.id !== 'ult') {
      const secs = s.id === 'dash' ? player.cd.dash : player.cd[s.id];
      ctx.fillStyle = '#fff'; ctx.font = '700 11px system-ui, sans-serif'; ctx.fillText(secs.toFixed(1), x + sw / 2, y + 61);
    }
    x += sw + gap;
  }
}

function drawTouch() {
  const pb = pauseBtn();
  ctx.beginPath(); ctx.arc(pb.x, pb.y, pb.r, 0, TAU); ctx.fillStyle = '#00000088'; ctx.fill();
  ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(pb.x - 6, pb.y - 7, 4, 14); ctx.fillRect(pb.x + 2, pb.y - 7, 4, 14);
  if (joy.id !== null) {
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 58, 0, TAU); ctx.fillStyle = '#ffffff14'; ctx.fill();
    ctx.strokeStyle = '#ffffff40'; ctx.lineWidth = 2; ctx.stroke();
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, m = Math.hypot(dx, dy), k = m > 55 ? 55 / m : 1;
    ctx.beginPath(); ctx.arc(joy.ox + dx * k, joy.oy + dy * k, 26, 0, TAU); ctx.fillStyle = '#ffffff55'; ctx.fill();
  } else {
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff40'; ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText('drag here to move', W * 0.22, H - 60);
  }
  for (const b of touchButtons()) {
    const frac = clamp(cdFraction(b.id), 0, 1);
    const held = btnHeld(b.id);
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fillStyle = held ? '#ffb02066' : '#00000088'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = frac <= 0 ? (b.id === 'ult' ? '#ffc400' : '#ffb020aa') : '#3a4357'; ctx.stroke();
    if (frac > 0) {
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
      ctx.closePath(); ctx.fillStyle = '#ffffff22'; ctx.fill();
    }
    if (b.id === 'm1' && player.drawing) {
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * player.draw);
      ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 4; ctx.stroke();
    }
    ctx.fillStyle = frac <= 0 ? '#fff' : '#8a93a3'; ctx.textAlign = 'center';
    ctx.font = `800 ${b.label.length > 1 ? 11 : 16}px system-ui, sans-serif`;
    ctx.fillText(b.label, b.x, b.y + 5);
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
      const intents = fighters.map(f => (f === player ? playerIntent() : botIntent(f, dt)));
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
    if (player.pendingChoices > 0 && !player.dead && hitStop <= 0) openChoice();
    // the camera leans toward the aim so you can see further ahead
    const lean = player.dead ? 0 : 60 + 60 * player.draw;
    const tx = player.x + Math.cos(player.face) * lean, ty = player.y + Math.sin(player.face) * lean;
    const k = 1 - Math.exp(-6 * dt);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    shake *= Math.exp(-10 * dt);
  }

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (player) {
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
    ctx.save();
    ctx.translate(W / 2 + sx, H / 2 + sy); ctx.scale(VIEW, VIEW); ctx.translate(-cam.x, -cam.y);
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
  lockPointer();
});
requestAnimationFrame(frame);
