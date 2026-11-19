'use strict';
// Online play. The shared server runs the arena; this file sends your controls and draws what the server sends back.
// Your own archer's movement is predicted here so it answers at once; everyone else is smoothed between pictures.

// Where the server lives. Filled in once it is hosted; ?server=ws://... overrides it for testing.
const SERVER_URL = new URLSearchParams(location.search).get('server') || '';

function netConnect(profile, onReady, onFail) {
  let ws, myId = null, ready = false;
  try { ws = new WebSocket(SERVER_URL); } catch (e) { onFail('Could not reach the server.'); return; }
  const byId = new Map(), roster = new Map();
  let lastSend = 0, sent = '', evq = [];
  const W_IDX = WEAPON_IDS, P_IDX = Object.keys(POWERUPS), KINDS = ['normal', 'full', 'gold', 'rage', 'ice', ...WEAPON_IDS];
  const failTimer = setTimeout(() => { if (!ready) { try { ws.close(); } catch (e) { /* ignore */ } onFail('The server did not answer. Try again in a minute (a sleeping server can take ~50 s to wake).'); } }, 60000);

  ws.onopen = () => ws.send(JSON.stringify({ type: 'join', profile }));
  ws.onerror = () => {};
  ws.onclose = () => {
    clearTimeout(failTimer);
    if (!ready) { onFail('Could not connect to the server.'); return; }
    // dropped mid-game: back to the home screen
    net = null; running = false; offer = null; swapCand = null;
    document.getElementById('menu').style.display = 'flex';
    document.getElementById('netNote').textContent = 'Disconnected from the server.';
    if (isLocked()) document.exitPointerLock();
    newGame();
  };
  ws.onmessage = ev => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.type === 'full') { onFail('The arena is full. Try again soon.'); return; }
    if (m.type === 'welcome') {
      myId = m.id; ready = true; clearTimeout(failTimer);
      // clear the offline world; the server's pictures fill it from now on
      fighters = []; arrows = []; stuck = []; particles = []; rings = []; texts = []; feed = []; bolts = []; orbs = []; powerups = []; quivers = [];
      player = null; offer = null; swapCand = null;
      net = api;
      onReady();
      return;
    }
    if (m.type === 's') apply(m);
  };

  // ---------- a picture of the arena arrives ----------
  function makeFighter(id) {
    return { id, x: 0, y: 0, tx: 0, ty: 0, face: 0, tface: 0, r: BASE_R, hp: 100, maxHp: 100, level: 1, kills: 0, deaths: 0, name: '', color: '#ffffff', gear: 'none', isBot: true,
      spin: 0, draw: 0, drawing: false, blocking: false, dead: false, deathT: 0, weapon: 'classic', tier: 1, recoil: 0, flash: 0, iframe: 0, dashT: 0, awaken: 0, rage: 0,
      frozen: 0, slow: 0, poison: 0, poisonStacks: 0, burn: 0, bubble: 0, bounty: false, stun: 0, ragdoll: 0, guardBreak: 0, haste: 0, vision: 0,
      slots: [{ type: 'classic', tier: 1 }], cur: 0, dashCharges: DASH_CHARGES, cd: { dash: 0 }, up: freshUpgrades(), xp: 0, pendingChoices: 0, vx: 0, vy: 0, spd: 240, fresh: true };
  }
  function apply(m) {
    if (m.ro) for (const [id, name, color, gear, bot] of m.ro) roster.set(id, { name, color, gear, isBot: !!bot });
    const seen = new Set();
    for (const r of m.f) {
      const [id, x, y, face, hp, maxHp, rad, level, kills, deaths, fl, draw, wi, tier, spin, deathT, bubble, pst] = r;
      let f = byId.get(id); if (!f) { f = makeFighter(id); byId.set(id, f); }
      seen.add(id);
      const ro = roster.get(id); if (ro) Object.assign(f, ro);
      if (f.fresh || Math.hypot(x - f.x, y - f.y) > 400) { f.x = x; f.y = y; f.fresh = false; }   // first sight or a respawn: jump
      f.tx = x; f.ty = y; f.tface = face;
      Object.assign(f, { hp, maxHp, r: rad, level, kills, deaths, draw, tier, spin, deathT, bubble, poisonStacks: pst, weapon: W_IDX[wi] || 'classic' });
      f.dead = !!(fl & 1); f.drawing = !!(fl & 2); f.blocking = !!(fl & 4); f.dashT = fl & 8 ? 0.1 : 0; f.awaken = fl & 16 ? 1 : 0;
      f.rage = fl & 32 ? 1 : 0; f.frozen = fl & 64 ? 1 : 0; f.slow = fl & 128 ? 1 : 0; f.poison = fl & 256 ? 1 : 0; f.burn = fl & 512 ? 1 : 0;
      f.iframe = fl & 1024 ? 1 : 0; f.bounty = !!(fl & 2048); f.stun = fl & 4096 ? 1 : 0; f.ragdoll = fl & 8192 ? 1 : 0; f.guardBreak = fl & 16384 ? 1 : 0;
      f.flash = fl & 32768 ? 0.1 : 0; f.haste = fl & 65536 ? 1 : 0; f.recoil = fl & 131072 ? 0.1 : 0;
    }
    for (const id of [...byId.keys()]) if (!seen.has(id)) byId.delete(id);
    fighters = m.f.map(r => byId.get(r[0]));
    player = byId.get(myId) || player;

    // your own state: arrows carried, dash charges, upgrades, the level-up cards, a swap you can make
    if (m.me && player) {
      const me = m.me;
      player.isBot = false;
      player.slots = me.slots.map(([t, tier]) => ({ type: W_IDX[t], tier }));
      player.cur = Math.min(me.cur, player.slots.length - 1);
      player.weapon = player.slots[player.cur].type; player.tier = player.slots[player.cur].tier;
      player.dashCharges = me.dc; player.cd.dash = me.dcd; player.xp = me.xp; player.pendingChoices = me.pend;
      player.up = Object.assign(freshUpgrades(), me.up); player.spd = me.spd;
      player.vision = me.vis; player.rage = me.rage; player.haste = me.haste; player.awaken = me.aw; player.stunned = !!me.stun;
      offer = me.offer ? { level: me.offer.level, cards: me.offer.cards.map(c => (Array.isArray(c) ? { arrow: true, type: W_IDX[c[0]], tier: c[1] } : UPGRADES.find(u => u.id === c))) } : null;
      swapCand = me.swap ? { x: me.swap[0], y: me.swap[1], type: W_IDX[me.swap[2]], tier: me.swap[3] } : null;
      // where the server has you: pull the prediction toward it (snap if far off)
      const ex = player.tx - player.x, ey = player.ty - player.y;
      if (Math.hypot(ex, ey) > 140 || player.dead) { player.x = player.tx; player.y = player.ty; }
      else { player.x += ex * 0.2; player.y += ey * 0.2; }
    }

    arrows = m.a.map(([x, y, vx, vy, wi, ki, tier]) => ({ x, y, vx, vy, ang: Math.atan2(vy, vx), weapon: W_IDX[wi] || 'classic', kind: KINDS[ki] || 'normal', tier, owner: {} }));
    quivers = m.q.map(([x, y, ti, tier, left]) => (left >= 0 ? { x, y, type: W_IDX[ti], tier, life: DROP_LIFE, t: DROP_LIFE - left } : { x, y, type: W_IDX[ti], tier, t: 0 }));
    powerups = m.p.map(([x, y, pi]) => ({ x, y, type: P_IDX[pi], t: 0 }));
    feed = m.fe.map(([k, kc, v, vc, t]) => ({ k, kc, v, vc, t }));
    if (m.o) { orbs = []; for (let i = 0; i < m.o.length; i += 3) orbs.push({ x: m.o[i], y: m.o[i + 1], v: m.o[i + 2], vx: 0, vy: 0 }); }

    // effects the server saw this moment
    for (const e of m.e) {
      if (e[0] === 's') sparks(e[1], e[2], e[3], e[4], e[5]);
      else if (e[0] === 'r') ring(e[1], e[2], e[3], e[4], e[5], e[6], e[7], e[8] || null);
      else if (e[0] === 't') popText(e[1], e[2], e[3], e[4], !!e[5]);
      else if (e[0] === 'w') { const f = byId.get(e[1]); if (f) shockwave(f); }
      else if (e[0] === 'b') bolts.push({ x1: e[1], y1: e[2], x2: e[3], y2: e[4], t: 0 });
      else if (e[0] === 'k') stuck.push({ x: e[1], y: e[2], ang: e[3], t: 0, life: 4, kind: e[4], weapon: e[4] || 'classic' });
    }
    if (stuck.length > 120) stuck.splice(0, stuck.length - 120);
  }

  // ---------- every frame while online ----------
  const api = {
    pick(i) { if (offer) evq.push(['pick', i, offer.level]); return true; },
    neutral() { send({ mx: 0, my: 0, aim: player ? player.face : 0, m1: false, block: false, ev: [] }, true); },
    step(dt) {
      if (!player) return;
      const I = playerIntent(dt);
      pressed.clear(); btnPressed.clear();
      if (I.dash) evq.push('dash');
      if (I.slotStep) evq.push(I.slotStep > 0 ? 'next' : 'prev');
      if (I.slot !== undefined) evq.push(['slot', I.slot]);
      if (I.swap) evq.push('swap');
      // your archer: face at once, move at once (the server confirms a moment later)
      if (!player.dead) {
        player.face = I.aim;
        if (!player.stunned) {
          let mx = I.mx, my = I.my; const mm = Math.hypot(mx, my); if (mm > 1) { mx /= mm; my /= mm; }
          let sp = player.spd || 240; if (I.block) sp = 95; else if (player.drawing) sp *= 0.6;
          const k = 1 - Math.exp(-14 * dt);
          player.vx += (mx * sp - player.vx) * k; player.vy += (my * sp - player.vy) * k;
          moveBody(player, dt);
        }
      }
      // everyone else glides toward where the server last put them
      const kk = 1 - Math.exp(-15 * dt);
      for (const f of fighters) {
        if (f === player) continue;
        f.x += (f.tx - f.x) * kk; f.y += (f.ty - f.y) * kk;
        f.face += Math.atan2(Math.sin(f.tface - f.face), Math.cos(f.tface - f.face)) * kk;
        // cosmetic trails the server does not send
        if (f.dashT > 0) particles.push({ x: f.x, y: f.y, vx: 0, vy: 0, t: 0, life: 0.25, col: f.color, size: f.r * 0.8, ghost: true });
      }
      for (const f of fighters) {
        if (f.dead) continue;
        if (f.burn && Math.random() < dt * 25) particles.push({ x: f.x + rand(-14, 14), y: f.y + rand(-14, 14), vx: rand(-15, 15), vy: rand(-90, -50), t: 0, life: 0.35, col: Math.random() < 0.5 ? '#ff6a00' : '#ffb020', size: rand(2, 4) });
        if (f.awaken && Math.random() < dt * 30) particles.push({ x: f.x + rand(-18, 18), y: f.y + rand(-18, 18), vx: rand(-20, 20), vy: rand(-90, -40), t: 0, life: 0.5, col: '#ffc400', size: rand(2, 4) });
        if (f === player && player.dashT > 0) particles.push({ x: f.x, y: f.y, vx: 0, vy: 0, t: 0, life: 0.25, col: f.color, size: f.r * 0.8, ghost: true });
      }
      for (const a of arrows) {
        a.x += a.vx * dt; a.y += a.vy * dt;
        if (a.weapon !== 'classic' && Math.random() < 0.5) particles.push({ x: a.x, y: a.y, vx: rand(-25, 25), vy: rand(-25, 25), t: 0, life: 0.25, col: WEAPONS[a.weapon].col, size: 3 });
      }
      for (const q of quivers) if (q.life) q.t += dt;
      // controls go out up to 30 times a second, at once when a button changes
      const msg = { mx: +I.mx.toFixed(2), my: +I.my.toFixed(2), aim: +I.aim.toFixed(3), m1: !!I.m1, block: !!I.block };
      const key = msg.mx + ',' + msg.my + ',' + msg.m1 + ',' + msg.block;
      const now = performance.now();
      if (evq.length || key !== sent.split('|')[0] || now - lastSend > 33) send(msg, false, key);
    },
  };
  function send(msg, force, key) {
    if (ws.readyState !== 1) return;
    msg.type = 'in'; msg.ev = evq; evq = [];
    ws.send(JSON.stringify(msg));
    lastSend = performance.now(); sent = (key || '') + '|';
  }
}
