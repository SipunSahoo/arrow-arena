'use strict';
// Home screen: your name, colour and headgear (saved on this device), a live preview, and the two ways to play.
(function () {
  const pr = settings.profile;
  const nameEl = document.getElementById('pname');
  const colorsEl = document.getElementById('pcolors');
  const gearEl = document.getElementById('pgear');
  const prev = document.getElementById('preview');
  const menu = document.getElementById('menu');
  const note = document.getElementById('netNote');
  const onlineBtn = document.getElementById('playOnline');

  nameEl.value = pr.name;
  nameEl.addEventListener('input', () => { pr.name = cleanName(nameEl.value); saveSettings(); });
  // typing a name must not move the archer or trigger game keys
  nameEl.addEventListener('keydown', e => e.stopPropagation());

  function paintChoices() {
    colorsEl.innerHTML = '';
    for (const c of COLORS) {
      const b = document.createElement('button');
      b.style.background = c; b.className = c === pr.color ? 'on' : ''; b.setAttribute('aria-label', 'Colour ' + c);
      b.addEventListener('click', () => { pr.color = c; saveSettings(); paintChoices(); });
      colorsEl.appendChild(b);
    }
    gearEl.innerHTML = '';
    for (const id of GEAR_IDS) {
      const b = document.createElement('button');
      b.textContent = GEARS[id]; b.className = id === pr.gear ? 'on' : '';
      b.addEventListener('click', () => { pr.gear = id; saveSettings(); paintChoices(); });
      gearEl.appendChild(b);
    }
  }
  paintChoices();

  // the preview turns slowly while the home screen is open
  (function spin(t) {
    if (menu.style.display !== 'none') drawPreview(prev, pr, Math.sin(t / 900) * 0.9 - 0.4);
    requestAnimationFrame(spin);
  })(0);

  // play against bots, on this device
  document.getElementById('play').addEventListener('click', () => {
    grabScreen();
    newGame();
    startRun();
  });

  // play online: everyone shares one arena, bots fill the empty seats
  if (!SERVER_URL) {
    onlineBtn.disabled = true;
    note.textContent = 'Online play is being set up. Play vs bots for now.';
  }
  onlineBtn.addEventListener('click', () => {
    if (!SERVER_URL) return;
    grabScreen();
    onlineBtn.disabled = true; note.textContent = 'Connecting…';
    netConnect({ name: pr.name, color: pr.color, gear: pr.gear },
      () => { onlineBtn.disabled = false; note.textContent = ''; startRun(); },
      msg => { onlineBtn.disabled = false; note.textContent = msg; });
  });
})();
