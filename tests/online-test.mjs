// Online play in real browsers: a laptop and a phone join the same arena server and see each other.
//   node tests/online-test.mjs      (needs Playwright: npm i -g playwright, or set PLAYWRIGHT_PATH)
// Starts its own server on a free port and stops it afterwards.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const OUT = path.join(ROOT, 'test-output'); fs.mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (c, m) => { if (!c) throw new Error(m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
async function check(name, fn) {
  try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, String(e.message).split('\n')[0]]); }
}

const PORT = 8790 + Math.floor(Math.random() * 100);
const srv = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
let srvLog = ''; srv.stdout.on('data', d => (srvLog += d)); srv.stderr.on('data', d => (srvLog += d));
for (let i = 0; i < 50 && !srvLog.includes('port'); i++) await wait(100);
const BASE = `http://localhost:${PORT}`;

const browser = await chromium.launch();
const laptopCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const phoneCtx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
const laptop = await laptopCtx.newPage(), phone = await phoneCtx.newPage();
const errors = [];
for (const [n, p] of [['laptop', laptop], ['phone', phone]]) {
  p.on('pageerror', e => errors.push(`${n}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`${n}: ${m.text()}`); });
}
const view = p => p.evaluate(() => ({
  online: !!net, running, me: player && { id: player.id, x: player.x, y: player.y, name: player.name },
  fighters: fighters.map(f => ({ id: f.id, name: f.name, bot: f.isBot, x: f.x, y: f.y, dead: f.dead })),
}));
async function join(p, name) {
  await p.goto(BASE + '/');
  await p.fill('#pname', name);
  await p.click('#playOnline');
  await p.waitForFunction(() => !!net && running && !!player, null, { timeout: 15000 });
}

await check('the server hands out the game page, and /health answers', async () => {
  const page = await fetch(BASE + '/'); ok(page.status === 200 && (await page.text()).includes('game.js'), 'no page at /');
  const h = await fetch(BASE + '/health'); ok(h.status === 200 && (await h.text()).startsWith('ok'), 'no /health');
  const bad = await fetch(BASE + '/server/index.js'); ok(bad.status === 404, 'server source must not be served');
  const bad2 = await fetch(BASE + '/../README.md'); ok(bad2.status === 404, 'other files must not be served');
});

await check('the laptop joins online', async () => { await join(laptop, 'Alpha'); });
await check('the phone joins the same arena', async () => { await join(phone, 'Bravo'); });
await wait(800);

await check('each sees the other as a real player, and bots fill the arena to 8', async () => {
  const a = await view(laptop), b = await view(phone);
  ok(a.fighters.some(f => f.name === 'Bravo' && !f.bot), 'laptop does not see Bravo');
  ok(b.fighters.some(f => f.name === 'Alpha' && !f.bot), 'phone does not see Alpha');
  ok(a.fighters.length === 8 && b.fighters.length === 8, `fighters ${a.fighters.length} / ${b.fighters.length}`);
  ok(a.fighters.filter(f => f.bot).length === 6, 'expected 6 bots');
});

await check('the laptop walks right and the phone sees Alpha move', async () => {
  const before = (await view(phone)).fighters.find(f => f.name === 'Alpha');
  await laptop.keyboard.down('d'); await wait(1200); await laptop.keyboard.up('d'); await wait(400);
  const after = (await view(phone)).fighters.find(f => f.name === 'Alpha');
  ok(before && after, 'Alpha missing');
  ok(after.dead || before.dead || after.x - before.x > 80, `Alpha moved only ${Math.round(after.x - before.x)} px`);
});

await check('the phone moves with a thumb on the move stick and the laptop sees it', async () => {
  const before = (await view(laptop)).fighters.find(f => f.name === 'Bravo');
  const cdp = await phoneCtx.newCDPSession(phone);
  const pt = (x, y) => [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(150, 280) });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(150, 280 - i * 7) }); await wait(16); }
  await wait(1200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(400);
  const after = (await view(laptop)).fighters.find(f => f.name === 'Bravo');
  ok(before && after, 'Bravo missing');
  ok(after.dead || before.dead || before.y - after.y > 80, `Bravo moved only ${Math.round(before.y - after.y)} px up`);
});

await laptop.screenshot({ path: path.join(OUT, 'online-laptop.png') });
await phone.screenshot({ path: path.join(OUT, 'online-phone.png') });

await check('when the laptop leaves, the phone sees Alpha go and a bot take the seat', async () => {
  await laptopCtx.close(); await wait(1200);
  const b = await view(phone);
  ok(!b.fighters.some(f => f.name === 'Alpha'), 'Alpha still there');
  ok(b.fighters.length === 8 && b.fighters.filter(f => f.bot).length === 7, `fighters ${b.fighters.length}`);
});

await check('no errors in either browser', async () => { ok(!errors.length, errors.slice(0, 3).join(' | ')); });

await browser.close();
srv.kill();
for (const r of results) console.log(r.join('  '));
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
