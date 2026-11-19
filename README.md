# Arrow Arena (working title): prototype 0.9

Top-down free-for-all archery brawler (bows only), in the style of arrow .io games, with XP dots, levels, upgrade choices, power-ups, one shoot button and seven switchable arrow types (Classic, Fire, Frost, Explosive, Piercing, Poison, Lightning) and Easy / Normal / Hard bots.
All characters, names and moves are original.

Play: open `index.html` in Chrome (double-click). No install, no server.

- `index.html`: menu and controls
- `game.js`: the whole game (arena, combat, bots, touch controls, HUD)

Next stages: online multiplayer, more characters, then Android / iPad builds.

## Online play (1.0)

- `server/` is the shared arena: one room, real players join, bots fill the empty seats up to 8, 16 players max.
  It runs `game.js` itself (screen parts replaced by stand-ins), ticks 30 times a second and sends 20 pictures a second.
- `net.js` is the phone side: sends controls, draws the server's pictures, predicts your own movement.
- `home.js` is the home screen: name, colour, headgear (saved on the device), and the two PLAY buttons.
- Run the server locally: `cd server && npm install && node index.js`, then open `index.html?server=ws://localhost:8787`.
- Hosting: `render.yaml` sets up a free Render web service. After it is live, put its address in `SERVER_URL` in `net.js`
  (`wss://<name>.onrender.com`).
