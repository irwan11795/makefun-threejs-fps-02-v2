// Shot-mode HUD tests: run with `node --test test/shot.test.mjs`.
// The banner must stay up while a staged frame is frozen for capture, and the
// title overlay's hidden property must actually toggle (the CSS fix in
// game/index.html makes the attribute effective in the browser — the v1 bug
// was that author `display: flex` on #overlay beat the UA [hidden] rule, so
// the menu could never hide at all).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHud } from '../game/src/hud.js';
import { createShotDownload, setShotStatus } from '../game/src/shotdownload.js';
import { createMinimap } from '../game/src/minimap.js';

function makeElement() {
  const listeners = {};
  const classes = new Set();
  return {
    style: { setProperty() {} },
    // Recording classList: add/remove/toggle actually track, so tests can
    // observe 'on' (hitmarker), 'cant' (unaffordable buy item) and friends.
    classList: {
      add(c) { classes.add(c); },
      remove(c) { classes.delete(c); },
      toggle(c, force) {
        if (force === undefined) { if (classes.has(c)) classes.delete(c); else classes.add(c); }
        else if (force) classes.add(c);
        else classes.delete(c);
      },
      contains(c) { return classes.has(c); },
    },
    classes,
    dataset: {},
    children: [],
    textContent: '',
    innerHTML: '',
    hidden: false,
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    // click(isTrusted): the stub for a real user click (true) vs the
    // programmatic a.click() in attach() (false, the default).
    click(isTrusted = false) {
      for (const fn of listeners.click ?? []) fn({ isTrusted });
    },
    focus() {},
  };
}

function makeDocument() {
  const ids = ['overlay', 'overlay-title', 'overlay-copy', 'play', 'crosshair',
    'hitmarker', 'damage', 'health-fill', 'health-value', 'armor-fill', 'armor-row',
    'ammo-mag', 'ammo-reserve', 'ammo', 'weapon-name', 'money-value', 'timer-value',
    'round-value', 'score-attack', 'score-defend', 'feed', 'bomb-bar', 'bomb-fill',
    'bomb-label', 'plant-bar', 'plant-fill', 'buy-menu', 'buy-list', 'banner',
    'banner-title', 'banner-copy', 'shot-status'];
  // Mirror the hidden attributes in game/index.html: these start hidden.
  const hiddenAtStart = new Set(['bomb-bar', 'plant-bar', 'buy-menu', 'banner', 'shot-status']);
  const elements = new Map(ids.map((id) => {
    const el = makeElement();
    el.hidden = hiddenAtStart.has(id);
    return [id, el];
  }));
  return {
    getElementById(id) { return elements.get(id); },
    createElement() { return makeElement(); },
    body: makeElement(),
    elements,
  };
}

// Fake URL API: createObjectURL hands out blob:test/N, revokeObjectURL
// records what was freed — so the blob lifetime is asserted, not assumed.
function makeUrlApi() {
  let next = 1;
  const created = [];
  const revoked = [];
  return {
    createObjectURL() { const url = `blob:test/${next}`; next += 1; created.push(url); return url; },
    revokeObjectURL(url) { revoked.push(url); },
    created,
    revoked,
  };
}

// Manual timer queue: setTimeout records (with its delay), clearTimeout
// cancels, runAll fires everything pending — so the 3800 ms banner timer is
// tested instantly. runUpTo(ms) fires only timers whose delay is at most ms
// (delays are absolute from creation, so call it with increasing ms).
function installManualTimers() {
  const pending = new Map();
  let nextId = 1;
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, ms = 0) => { const id = nextId; nextId += 1; pending.set(id, { fn, ms }); return id; };
  globalThis.clearTimeout = (id) => { pending.delete(id); };
  return {
    runAll() { for (const { fn } of [...pending.values()]) fn(); pending.clear(); },
    runUpTo(ms) {
      for (const [id, timer] of [...pending.entries()]) {
        if (timer.ms <= ms) { pending.delete(id); timer.fn(); }
      }
    },
    restore() { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; },
  };
}

function withHud(fn) {
  const timers = installManualTimers();
  const doc = makeDocument();
  const realDocument = globalThis.document;
  globalThis.document = doc;
  try {
    const hud = createHud();
    fn(hud, doc, timers);
  } finally {
    globalThis.document = realDocument;
    timers.restore();
  }
}

function withDownload(fn) {
  const timers = installManualTimers();
  const doc = makeDocument();
  const urlApi = makeUrlApi();
  try {
    fn(doc, urlApi, timers);
  } finally {
    timers.restore();
  }
}

test('banner stays up in shot mode after its hide timer would have fired', () => {
  withHud((hud, doc, timers) => {
    hud.setShotMode(true);
    hud.showBanner('roundWin');
    assert.equal(doc.elements.get('banner').hidden, false);
    assert.equal(doc.elements.get('banner-title').textContent, 'Round won');
    timers.runAll();
    assert.equal(doc.elements.get('banner').hidden, false, 'banner hid during a frozen shot');
  });
});

test('banner still auto-hides in normal play', () => {
  withHud((hud, doc, timers) => {
    hud.showBanner('roundWin');
    assert.equal(doc.elements.get('banner').hidden, false);
    timers.runAll();
    assert.equal(doc.elements.get('banner').hidden, true, 'banner never auto-hid in normal play');
  });
});

test('shot mode can be turned off again', () => {
  withHud((hud, doc, timers) => {
    hud.setShotMode(true);
    hud.setShotMode(false);
    hud.showBanner('roundWin');
    timers.runAll();
    assert.equal(doc.elements.get('banner').hidden, true);
  });
});

test('overlay hidden property toggles with hide/show', () => {
  withHud((hud, doc) => {
    const overlay = doc.elements.get('overlay');
    assert.equal(overlay.hidden, false, 'overlay starts visible (title screen)');
    hud.hideOverlay();
    assert.equal(overlay.hidden, true, 'hideOverlay did not set hidden');
    hud.showOverlay('start');
    assert.equal(overlay.hidden, false, 'showOverlay did not clear hidden');
    assert.equal(doc.elements.get('overlay-title').textContent, 'Kestrel Yard');
    hud.hideOverlay();
    assert.equal(overlay.hidden, true);
  });
});

// --- Shot-download anchor + blob lifetime (shotdownload.js) ---
// The capturing browser has no JS eval and cannot click display:none
// elements, and the old code revoked the blob URL after 5 s — dead by the
// time anyone could click. These tests pin the fixed behaviour.

test('download anchor is a visible, named link — never display:none', () => {
  withDownload((doc, urlApi) => {
    const download = createShotDownload(doc, urlApi);
    const anchor = download.attach({ size: 100 }, '1-start.png');
    assert.equal(anchor.id, 'shot-download');
    assert.equal(anchor.textContent, 'Download 1-start.png');
    assert.equal(anchor.download, '1-start.png');
    assert.equal(anchor.href, urlApi.created[0]);
    assert.notEqual(anchor.style.display, 'none', 'anchor is display:none — the browser cannot click it');
    assert.ok(doc.body.children.includes(anchor), 'anchor is not in the document body');
  });
});

test('blob URL survives past 5 s — the old early revoke is gone', () => {
  withDownload((doc, urlApi, timers) => {
    const download = createShotDownload(doc, urlApi);
    download.attach({ size: 100 }, '2-play.png');
    timers.runUpTo(5000);
    assert.deepEqual(urlApi.revoked, [], 'blob URL revoked within 5 s of creation');
    assert.equal(download.url, urlApi.created[0], 'live URL lost before any click');
  });
});

test('the automatic click does not retire the URL', () => {
  withDownload((doc, urlApi, timers) => {
    const download = createShotDownload(doc, urlApi);
    download.attach({ size: 100 }, '3-plant.png');
    // attach() already did its untrusted a.click(); run past the 1 s
    // click-revoke window to prove it scheduled nothing.
    timers.runUpTo(5000);
    assert.deepEqual(urlApi.revoked, [], 'untrusted auto-click revoked the URL');
    assert.equal(download.url, urlApi.created[0]);
  });
});

test('a trusted click retires the URL 1 s later and cancels the expiry', () => {
  withDownload((doc, urlApi, timers) => {
    const download = createShotDownload(doc, urlApi);
    const anchor = download.attach({ size: 100 }, '4-end.png');
    anchor.click(true);
    timers.runUpTo(999);
    assert.deepEqual(urlApi.revoked, [], 'URL revoked before the 1 s grace');
    timers.runUpTo(1000);
    assert.deepEqual(urlApi.revoked, [urlApi.created[0]], 'trusted click did not revoke the URL');
    assert.equal(download.url, null);
    timers.runAll();
    assert.deepEqual(urlApi.revoked, [urlApi.created[0]], 'expiry fired after the click revoke');
  });
});

test('10-minute expiry revokes an unclicked URL', () => {
  withDownload((doc, urlApi, timers) => {
    const download = createShotDownload(doc, urlApi);
    download.attach({ size: 100 }, '1-start.png');
    timers.runUpTo(599999);
    assert.deepEqual(urlApi.revoked, [], 'URL revoked before the 10-minute timeout');
    timers.runUpTo(600000);
    assert.deepEqual(urlApi.revoked, [urlApi.created[0]], '10-minute expiry did not revoke the URL');
    assert.equal(download.url, null);
  });
});

test('setShotStatus shows the export state as visible text', () => {
  withDownload((doc) => {
    const status = doc.elements.get('shot-status');
    status.hidden = true; // mirrors the hidden attribute in game/index.html
    setShotStatus(doc, 'Shot ready — 1-start.png (page-png)');
    assert.equal(status.hidden, false, 'status line stayed hidden in shot mode');
    assert.equal(status.textContent, 'Shot ready — 1-start.png (page-png)');
    setShotStatus(doc, 'Shot export failed (error) — no file downloaded');
    assert.equal(status.textContent, 'Shot export failed (error) — no file downloaded');
  });
});

// --- Buy stage (the 2-buy shot) ---

test('buy menu opens with money and prices, affordable items not marked cant', () => {
  withHud((hud, doc) => {
    const menu = doc.elements.get('buy-menu');
    assert.equal(menu.hidden, true, 'buy menu starts visible');
    hud.setMoney(4000);
    assert.equal(doc.elements.get('money-value').textContent, '$4000');
    hud.setBuy(true, 4000, ['pistol']);
    assert.equal(menu.hidden, false, 'buy menu did not open');
    const buttons = doc.elements.get('buy-list').children;
    const byId = Object.fromEntries(buttons.map((b) => [b.dataset.item, b]));
    assert.equal(byId.rifle.classList.contains('cant'), false, 'rifle marked unaffordable with $4,000');
    assert.equal(byId.grenade.classList.contains('cant'), false, 'grenade marked unaffordable with $4,000');
    assert.equal(byId.rifle.classList.contains('owned'), false, 'rifle marked owned before buying');
    // Same menu, broke: the $2,700 rifle is out of reach at $800.
    hud.setBuy(true, 800, ['pistol']);
    assert.equal(byId.rifle.classList.contains('cant'), true, 'rifle not marked unaffordable with $800');
    assert.equal(byId.grenade.classList.contains('cant'), false, 'grenade marked unaffordable with $800');
    hud.setBuy(false, 800, ['pistol']);
    assert.equal(menu.hidden, true, 'buy menu did not close');
  });
});

// --- Hitmarker in shot mode ---

test('hitmarker stays on in shot mode after its hold timer would have fired', () => {
  withHud((hud, doc, timers) => {
    hud.setShotMode(true);
    hud.hitMarker(true, 90);
    const marker = doc.elements.get('hitmarker');
    assert.equal(marker.classList.contains('on'), true, 'hitmarker never turned on');
    timers.runAll();
    assert.equal(marker.classList.contains('on'), true, 'hitmarker cleared during a frozen shot');
  });
});

test('hitmarker still clears in normal play', () => {
  withHud((hud, doc, timers) => {
    hud.hitMarker(false, 90);
    const marker = doc.elements.get('hitmarker');
    assert.equal(marker.classList.contains('on'), true);
    timers.runAll();
    assert.equal(marker.classList.contains('on'), false, 'hitmarker never cleared in normal play');
  });
});

// --- Minimap fog-of-war ---

function makeMinimapDoc() {
  const calls = [];
  const store = {};
  const ctx = new Proxy({}, {
    get(_t, prop) {
      if (prop in store) return store[prop];
      return (...args) => { calls.push(String(prop)); };
    },
    set(_t, prop, value) {
      if (prop === 'fillStyle' || prop === 'strokeStyle') calls.push(`${prop}:${value}`);
      store[prop] = value;
      return true;
    },
  });
  const canvas = { getContext: () => ctx };
  return { doc: { getElementById: (id) => (id === 'minimap' ? canvas : null) }, calls };
}

function makeMinimapSim(enemyLastSeenAt) {
  return {
    now: 100,
    bomb: { state: 'carried', pos: null },
    player: { pos: { x: 0, z: 13 }, yaw: 0 },
    entities: [
      { isPlayer: true, team: 'attack', alive: true, pos: { x: 0, z: 13 } },
      { id: 'ally-0', isPlayer: false, team: 'attack', alive: true, pos: { x: -3, z: 12 }, lastSeen: null },
      { id: 'enemy-0', isPlayer: false, team: 'defend', alive: true, pos: { x: 12, z: -6 }, lastSeen: enemyLastSeenAt },
    ],
  };
}

test('minimap shows a recently seen enemy but hides a stale one', () => {
  const seen = makeMinimapDoc();
  createMinimap(seen.doc, makeMinimapSim({ x: 12, z: -6, at: 99 })).draw();
  assert.ok(seen.calls.includes('fillStyle:#e0524d'), 'recently seen enemy not drawn on the minimap');
  assert.ok(seen.calls.includes('fillStyle:#4da3e0'), 'friendly not drawn on the minimap');
  const stale = makeMinimapDoc();
  createMinimap(stale.doc, makeMinimapSim({ x: 12, z: -6, at: 90 })).draw();
  assert.ok(!stale.calls.includes('fillStyle:#e0524d'), 'enemy seen 10 s ago still drawn — fog-of-war broken');
  assert.ok(stale.calls.includes('fillStyle:#4da3e0'), 'friendly missing when the enemy is stale');
});
