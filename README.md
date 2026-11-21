# Arrow Arena (working title): 1.1

Top-down free-for-all archery brawler (bows only), in the style of arrow .io games, with XP dots, levels, upgrade choices, power-ups, one shoot button and seven switchable arrow types (Classic, Fire, Frost, Explosive, Piercing, Poison, Lightning) and Easy / Normal / Hard bots.
All characters, names and moves are original.

Play: open `index.html` in Chrome (double-click). No install, no server.

- `index.html`: menu and controls
- `game.js`: the whole game (arena, combat, bots, touch controls, HUD)

Next stages: more characters, then Android / iPad builds.

## Online play (1.1)

**Play with friends anywhere: https://arrow-arena.onrender.com** (or the GitHub Pages link; both use the same server).
Everyone types a name and presses PLAY ONLINE: one shared arena, real players plus bots filling the empty seats up to 8, 16 players max.
The free Render plan sleeps after 15 minutes with nobody connected; the first visit after that takes about a minute.

- `server/` is the shared arena. It runs `game.js` itself (screen parts replaced by stand-ins), ticks 30 times a second,
  sends 20 pictures a second, and also serves the game page (only the listed files) plus `/health`.
- `net.js` is the phone side: sends controls, draws the server's pictures, predicts your own movement.
  It talks to the server it was loaded from; from GitHub Pages or a double-clicked file it uses `wss://arrow-arena.onrender.com`.
  `?server=ws://...` overrides it.
- `home.js` is the home screen: name, colour, headgear (saved on the device), and the two PLAY buttons.
- Run it locally: `cd server && npm install && node index.js`, then open http://localhost:8787 (friends on the same Wi-Fi: your PC's IP:8787).
- Test: `node tests/online-test.mjs` (a laptop and a phone browser join, see and move each other, one leaves; needs Playwright).
- Hosting: `render.yaml` (render.com → New → Blueprint → this repo). Render redeploys by itself on every push to `main`.
