// The DOM HUD: health, armour, ammo, money, timer, score, kill feed, bomb status,
// crosshair spread, banners and the buy menu. It never touches the simulation;
// main.js pushes numbers in and reads the button callbacks out.
import { SHOP } from './economy.js';

const COPY = {
  start: {
    title: 'Kestrel Yard',
    copy: 'A dusk container yard. Plant the bomb at Foundry or Silo — or drop every defender. First to 5 rounds takes the yard.',
    action: 'Click to play',
  },
  paused: {
    title: 'Kestrel Yard',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundWin: {
    title: 'Round won',
    copy: 'The yard is yours — for now.',
    action: 'Next round',
  },
  planted: {
    title: 'Bomb planted',
    copy: 'Hold the site. The defenders are coming.',
    action: 'Next round',
  },
  down: {
    title: 'You are down',
    copy: 'Your team fights on without you.',
    action: 'Next round',
  },
  roundLoss: {
    title: 'Round lost',
    copy: 'The defenders hold the yard.',
    action: 'Next round',
  },
  matchWin: {
    title: 'Yard taken',
    copy: 'Vanguard takes Kestrel Yard.',
    action: 'Play again',
  },
  matchLoss: {
    title: 'Yard lost',
    copy: 'Ember keeps Kestrel Yard.',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const vignette = $('damage');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const armorFill = $('armor-fill');
  const armorRow = $('armor-row');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammo = $('ammo');
  const weaponName = $('weapon-name');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const roundValue = $('round-value');
  const scoreAttack = $('score-attack');
  const scoreDefend = $('score-defend');
  const feed = $('feed');
  const bombBar = $('bomb-bar');
  const bombFill = $('bomb-fill');
  const bombLabel = $('bomb-label');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const buyMenu = $('buy-menu');
  const buyList = $('buy-list');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerCopy = $('banner-copy');
  let hitTimer = 0;
  let bannerTimer = 0;
  let lastFeed = 0;
  // Shot mode (?shot=): the staged frame is frozen, so time-based UI hiding
  // makes no sense — a banner hidden by its timer after the freeze would
  // vanish from the captured frame. main.js turns this on for every shot.
  let shotMode = false;

  // Build the buy menu from the shop table, so its prices can never drift.
  for (const item of SHOP) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'buy-item';
    button.dataset.item = item.id;
    button.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">$${item.price}</span>`;
    buyList.appendChild(button);
  }

  return {
    setHealth(hp, armor) {
      healthFill.style.width = `${Math.max(0, hp)}%`;
      healthValue.textContent = String(Math.max(0, Math.ceil(hp)));
      armorRow.style.display = armor > 0 ? 'flex' : 'none';
      armorFill.style.width = `${Math.max(0, Math.min(100, armor * 2))}%`;
    },
    setAmmo(mag, reserve, name, grenades) {
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammo.classList.toggle('empty', mag === 0);
      weaponName.textContent = grenades > 0 ? `${name} · ${grenades} grenade${grenades > 1 ? 's' : ''}` : name;
    },
    setMoney(value) {
      moneyValue.textContent = `$${value}`;
    },
    setTimer(seconds, phase) {
      const total = Math.max(0, Math.ceil(seconds));
      timerValue.textContent = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
      timerValue.classList.toggle('urgent', total <= 10 && phase !== 'buy');
    },
    setScore(attack, defend, round) {
      scoreAttack.textContent = String(attack);
      scoreDefend.textContent = String(defend);
      roundValue.textContent = `Round ${round}`;
    },
    setSpread(spread) {
      // Crosshair gap grows with spread, in pixels.
      const gap = 4 + Math.min(26, spread * 900);
      crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      // In shot mode the frame is frozen for capture: a hitmarker cleared by
      // its timer after the freeze would vanish from the captured frame.
      if (shotMode) return;
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 180);
    },
    setFeed(entries) {
      if (entries.length === lastFeed) return;
      lastFeed = entries.length;
      feed.innerHTML = '';
      for (const entry of entries.slice(-5)) {
        const line = document.createElement('div');
        line.className = 'feed-line';
        line.textContent = `${entry.killer} ${entry.headshot ? '⌖' : '×'} ${entry.victim}`;
        feed.appendChild(line);
      }
    },
    setBomb(state, fuse, site) {
      if (state === 'planted') {
        bombBar.hidden = false;
        bombFill.style.width = `${Math.max(0, (fuse / 40) * 100)}%`;
        bombLabel.textContent = `Bomb at ${site} — ${Math.ceil(fuse)}s`;
      } else {
        bombBar.hidden = true;
      }
    },
    setPlant(progress) {
      if (progress > 0) {
        plantBar.hidden = false;
        plantFill.style.width = `${Math.min(100, progress * 100)}%`;
      } else {
        plantBar.hidden = true;
      }
    },
    showBanner(mode, detail) {
      const text = COPY[mode];
      bannerTitle.textContent = detail || text.title;
      bannerCopy.textContent = text.copy;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      // In shot mode the frame is frozen for capture: the banner must stay
      // up until the export, so it never auto-hides there.
      if (!shotMode) {
        bannerTimer = setTimeout(() => {
          banner.hidden = true;
        }, 3800);
      }
    },
    hideBanner() {
      banner.hidden = true;
    },
    // Shot mode (?shot=): banners never auto-hide, so the frozen frame keeps
    // them. Normal play is untouched — this is only on for staged captures.
    setShotMode(on) {
      shotMode = Boolean(on);
    },
    showOverlay(mode, detail) {
      const text = COPY[mode];
      title.textContent = detail || text.title;
      copy.textContent = text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    setBuy(open, money, owned) {
      buyMenu.hidden = !open;
      for (const button of buyList.children) {
        const item = SHOP.find((s) => s.id === button.dataset.item);
        const affordable = money >= item.price;
        const isOwned = owned.includes(item.id);
        button.classList.toggle('cant', !affordable && !isOwned);
        button.classList.toggle('owned', isOwned);
      }
    },
    onBuy(handler) {
      buyList.addEventListener('click', (event) => {
        const button = event.target.closest('.buy-item');
        if (button) handler(button.dataset.item);
      });
    },
  };
}
