'use strict';
// Arrow Arena game server: one shared arena over WebSockets.
// It runs the game's own rules (game.js) with the screen parts replaced by stand-ins, 30 times a second,
// and sends every connected phone a picture of the arena 20 times a second.
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 8787;
const TICK = 1 / 30, SEND_EVERY = 1 / 20;

// game.js sits next to this folder in the repo; a deploy may copy it in beside index.js
const gamePath = [path.join(__dirname, 'game.js'), path.join(__dirname, '..', 'game.js')].find(p => fs.existsSync(p));
if (!gamePath) throw new Error('game.js not found');

// ---------- a browser stand-in: anything the game touches for drawing quietly does nothing ----------
function blackhole() {
  const fn = function () {};
  const p = new Proxy(fn, {
    get(t, k) { if (k === Symbol.toPrimitive) return () => 0; if (k === 'then') return undefined; return p; },
    set() { return true; }, apply() { return p; }, construct() { return p; },
  });
  return p;
}
const BH = blackhole();
const sandbox = {
  console, Math, Date, JSON, Map, Set, Symbol, Proxy, Number, String, Array, Object, Boolean, RegExp, Error, isFinite, parseInt, parseFloat,
  setTimeout, clearTimeout,
  performance: { now: () => performance.now() },
  document: {
    getElementById: () => BH, createElement: () => BH, addEventListener() {}, documentElement: BH,
    fullscreenEnabled: false, webkitFullscreenEnabled: false, pointerLockElement: null, exitPointerLock() {},
  },
  localStorage: { getItem: () => null, setItem() {} },
  navigator: { maxTouchPoints: 0, userAgent: 'server', vibrate() {} },
  screen: {}, location: { search: '' },
  requestAnimationFrame() {}, matchMedia: () => ({ matches: false }), addEventListener() {},
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(gamePath, 'utf8'), sandbox, { filename: 'game.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, 'room.js'), 'utf8'), sandbox, { filename: 'room.js' });
const ROOM = sandbox.ROOM;

// ---------- network ----------
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end(`Arrow Arena server · ${ROOM.humans()} playing\n`);
});
const wss = new WebSocketServer({ server, maxPayload: 4096 });
const clients = new Map();   // socket -> { id, msgs, windowStart }

wss.on('connection', ws => {
  const c = { id: null, msgs: 0, windowStart: Date.now() };
  clients.set(ws, c);
  ws.on('message', raw => {
    const now = Date.now();
    if (now - c.windowStart > 1000) { c.windowStart = now; c.msgs = 0; }
    if (++c.msgs > 90) return;   // more than 90 messages a second: ignore the extra
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.type === 'join' && c.id === null) {
      c.id = ROOM.addHuman(m.profile);
      if (c.id === null) { ws.send(JSON.stringify({ type: 'full' })); ws.close(); return; }
      ws.send(JSON.stringify({ type: 'welcome', id: c.id }));
    } else if (m.type === 'in' && c.id !== null) {
      ROOM.setInput(c.id, m);
    }
  });
  ws.on('close', () => { if (c.id !== null) ROOM.removeHuman(c.id); clients.delete(ws); });
  ws.on('error', () => {});
});

// ---------- the clock ----------
let acc = 0, sendAcc = 0, prev = performance.now();
setInterval(() => {
  const now = performance.now();
  acc += Math.min(0.25, (now - prev) / 1000); prev = now;
  while (acc >= TICK) { ROOM.tick(TICK); acc -= TICK; sendAcc += TICK; }
  if (sendAcc >= SEND_EVERY && clients.size) {
    sendAcc = 0;
    const base = ROOM.shared();
    for (const [ws, c] of clients) {
      if (c.id === null || ws.readyState !== 1) continue;
      if (ws.bufferedAmount > 256 * 1024) continue;   // a slow phone skips a picture instead of falling behind
      ws.send(JSON.stringify({ ...base, me: ROOM.me(c.id) }));
    }
  } else if (sendAcc >= SEND_EVERY) { sendAcc = 0; ROOM.shared(); }
}, 1000 / 60);

server.listen(PORT, () => console.log(`Arrow Arena server on port ${PORT}`));
