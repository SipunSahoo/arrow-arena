// Runs INSIDE the game's own context on the server (after game.js), so it uses the game's functions and state directly.
// One shared arena: real players join, bots fill the empty seats up to SLOTS.
var ROOM = (function () {
  const SLOTS = 8;          // bots top the arena up to this many fighters
  const MAX_HUMANS = 16;
  settings.difficulty = 'normal';

  // nobody is "the local player" on the server; a far-away stand-in keeps player-only code harmless
  player = { x: 1e9, y: 1e9, r: 22, level: 1, dead: true, face: 0, draw: 0, vision: 0, slots: [{ type: 'classic', tier: 1 }], cur: 0, up: freshUpgrades(), isBot: false };
  fighters = []; arrows = []; stuck = []; particles = []; rings = []; texts = []; feed = []; bolts = [];
  orbs = []; powerups = []; quivers = []; puTimer = 3; qTimer = 6;
  for (let i = 0; i < ORB_TARGET; i++) spawnAmbientOrb();
  for (let i = 0; i < 3; i++) spawnQuiver();

  const BOT_NAMES = ['Raze', 'Nova', 'Kuro', 'Blitz', 'Vex', 'Sora', 'Echo', 'Mira', 'Taro', 'Zed', 'Lumi', 'Kai'];
  function addBot() {
    const used = new Set(fighters.map(f => f.name));
    const f = new Fighter(BOT_NAMES.find(n => !used.has(n)) || 'Bot', COLORS[Math.floor(Math.random() * COLORS.length)], true);
    fighters.push(f);
  }
  let rosterVer = 0;
  function balance() {
    const humans = fighters.filter(f => !f.isBot).length, want = Math.max(0, SLOTS - humans);
    let bots = fighters.length - humans;
    while (bots < want) { addBot(); bots++; }
    while (bots > want) {   // a bot leaves: one that is knocked out, else the lowest level
      const b = fighters.filter(f => f.isBot).sort((x, y) => (x.dead === y.dead ? x.level - y.level : x.dead ? -1 : 1))[0];
      fighters.splice(fighters.indexOf(b), 1); bots--;
    }
    rosterVer++;
  }
  balance();

  // ----- effects become events the phones replay -----
  let events = [];
  sparks = (x, y, col, n, speed) => { events.push(['s', Math.round(x), Math.round(y), col, n, speed || 260]); };
  ring = (x, y, r0, r1, life, col, w, arc) => { events.push(['r', Math.round(x), Math.round(y), Math.round(r0), Math.round(r1), +life.toFixed(2), col, w || 4, arc ? [+arc[0].toFixed(2), +arc[1].toFixed(2)] : 0]); };
  popText = (x, y, txt, col, big) => { events.push(['t', Math.round(x), Math.round(y), String(txt), col, big ? 1 : 0]); };
  shockwave = f => { events.push(['w', f.id]); };
  buzz = () => {};

  // ----- players -----
  const ctl = new Map();   // fighter id -> latest controls from that player's phone
  function addHuman(profile) {
    if (fighters.filter(f => !f.isBot).length >= MAX_HUMANS) return null;
    const p = profile || {};
    const f = new Fighter(cleanName(p.name) || 'Archer', COLORS.includes(p.color) ? p.color : COLORS[0], false, GEARS[p.gear] ? p.gear : 'none');
    fighters.push(f);
    ctl.set(f.id, { I: { mx: 0, my: 0, aim: f.face, m1: false, block: false }, ev: [] });
    balance();
    return f.id;
  }
  function removeHuman(id) {
    const i = fighters.findIndex(f => f.id === id);
    if (i >= 0) fighters.splice(i, 1);
    ctl.delete(id);
    balance();
  }
  const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  function setInput(id, m) {
    const c = ctl.get(id); if (!c) return;
    c.I.mx = num(m.mx, -1, 1, 0); c.I.my = num(m.my, -1, 1, 0);
    c.I.aim = num(m.aim, -10, 10, c.I.aim);
    c.I.m1 = !!m.m1; c.I.block = !!m.block;
    if (Array.isArray(m.ev)) for (const e of m.ev.slice(0, 8)) c.ev.push(e);
  }
  function humanIntent(f) {
    const c = ctl.get(f.id);
    const I = { ...c.I };
    for (const e of c.ev) {
      if (e === 'dash') I.dash = true;
      else if (e === 'next') I.slotStep = 1;
      else if (e === 'prev') I.slotStep = -1;
      else if (e === 'swap') I.swap = true;
      else if (Array.isArray(e) && e[0] === 'slot') I.slot = num(e[1], 0, MAX_SLOTS - 1, 0) | 0;
      else if (Array.isArray(e) && e[0] === 'pick' && f.offer && f.offer.level === e[2]) pickOffer(num(e[1], 0, 2, 0) | 0, f);
    }
    c.ev = [];
    return I;
  }

  // ----- one tick -----
  function tick(dt) {
    const sb = bolts.length, ss = stuck.length;
    const intents = fighters.map(f => (f.isBot ? botIntent(f, dt) : humanIntent(f)));
    simStep(dt, intents);
    for (const b of bolts.slice(sb)) events.push(['b', Math.round(b.x1), Math.round(b.y1), Math.round(b.x2), Math.round(b.y2)]);
    for (const s of stuck.slice(ss)) events.push(['k', Math.round(s.x), Math.round(s.y), +s.ang.toFixed(2), s.weapon]);
    for (const e of feed) e.t -= dt;
    feed = feed.filter(e => e.t > 0);
    particles = []; rings = []; texts = []; bolts = []; stuck = [];   // the server draws nothing
  }

  // ----- what the phones are sent -----
  const W_IDX = WEAPON_IDS, P_IDX = Object.keys(POWERUPS);
  const KINDS = ['normal', 'full', 'gold', 'rage', 'ice', ...WEAPON_IDS];
  function flags(f) {
    return (f.dead ? 1 : 0) | (f.drawing ? 2 : 0) | (f.blocking ? 4 : 0) | (f.dashT > 0 ? 8 : 0) | (f.awaken > 0 ? 16 : 0) | (f.rage > 0 ? 32 : 0)
      | (f.frozen > 0 ? 64 : 0) | (f.slow > 0 ? 128 : 0) | (f.poison > 0 ? 256 : 0) | (f.burn > 0 ? 512 : 0) | (f.iframe > 0 ? 1024 : 0)
      | (f.bounty ? 2048 : 0) | (f.stun > 0 ? 4096 : 0) | (f.ragdoll > 0 ? 8192 : 0) | (f.guardBreak > 0 ? 16384 : 0) | (f.flash > 0 ? 32768 : 0)
      | (f.haste > 0 ? 65536 : 0) | (f.recoil > 0 ? 131072 : 0);
  }
  let snapN = 0, sentRoster = -1;
  function shared() {
    snapN++;
    const out = {
      type: 's',
      f: fighters.map(f => [f.id, Math.round(f.x), Math.round(f.y), +f.face.toFixed(2), Math.ceil(Math.max(0, f.hp)), f.maxHp, +f.r.toFixed(1), f.level, f.kills, f.deaths,
        flags(f), +f.draw.toFixed(2), W_IDX.indexOf(f.weapon), f.tier, +f.spin.toFixed(2), +f.deathT.toFixed(1), Math.round(f.bubble), f.poisonStacks]),
      a: arrows.map(a => [Math.round(a.x), Math.round(a.y), Math.round(a.vx), Math.round(a.vy), W_IDX.indexOf(a.weapon || 'classic'), KINDS.indexOf(a.kind), a.tier || 1]),
      q: quivers.map(q => [Math.round(q.x), Math.round(q.y), W_IDX.indexOf(q.type), q.tier, q.life ? +(q.life - q.t).toFixed(1) : -1]),
      p: powerups.map(p => [Math.round(p.x), Math.round(p.y), P_IDX.indexOf(p.type)]),
      fe: feed.map(e => [e.k, e.kc, e.v, e.vc, +e.t.toFixed(1)]),
      e: events,
    };
    if (snapN % 4 === 1) { out.o = []; for (const o of orbs) out.o.push(Math.round(o.x), Math.round(o.y), o.v); }
    if (sentRoster !== rosterVer || snapN % 40 === 1) { out.ro = fighters.map(f => [f.id, f.name, f.color, f.gear, f.isBot ? 1 : 0]); sentRoster = rosterVer; }
    events = [];
    return out;
  }
  function me(id) {
    const f = fighters.find(x => x.id === id); if (!f) return null;
    const U = f.up, up = {}; for (const k in U) if (U[k]) up[k] = U[k];
    const spd = 240 * (f.awaken > 0 ? 1.2 : 1) * (1 + 0.08 * U.speed) * (f.haste > 0 ? 1.35 : 1) * speedFor(f.level) * (f.slow > 0 ? 0.55 : 1);
    const sc = f.swapCand;
    return {
      id, slots: f.slots.map(s => [W_IDX.indexOf(s.type), s.tier]), cur: f.cur, dc: f.dashCharges, dcd: +f.cd.dash.toFixed(2),
      xp: f.xp, pend: f.pendingChoices, up, spd: Math.round(spd), vis: +f.vision.toFixed(1), rage: +f.rage.toFixed(1), haste: +f.haste.toFixed(1),
      aw: +Math.max(0, f.awaken).toFixed(1), stun: f.stun > 0 || f.ragdoll > 0 || f.lock > 0 ? 1 : 0,
      offer: f.offer ? { level: f.offer.level, cards: f.offer.cards.map(c => (c.arrow ? [W_IDX.indexOf(c.type), c.tier] : c.id)) } : null,
      swap: sc ? [Math.round(sc.x), Math.round(sc.y), W_IDX.indexOf(sc.type), sc.tier] : null,
    };
  }
  return { addHuman, removeHuman, setInput, tick, shared, me, humans: () => fighters.filter(f => !f.isBot).length };
})();
