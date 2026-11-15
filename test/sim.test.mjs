// Headless tests for the Kestrel Yard sim: run with `node --test test/sim.test.mjs`.
// No browser, no three.js — the sim modules are pure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../game/src/map.js';
import { boxOverlaps, segmentHitsBox, hasLineOfSight } from '../game/src/collide.js';
import { WEAPONS, spreadFor, damageFor } from '../game/src/weapons.js';
import { ECONOMY, lossRewardFor } from '../game/src/economy.js';
import { createSim } from '../game/src/sim.js';
import { findPath, reactToSound, throwGrenade } from '../game/src/bots.js';
import { stepPlayer, createPlayerState } from '../game/src/player.js';

const STEP = 1 / 60;

function keys(...codes) {
  return new Set(codes);
}

function runSteps(sim, seconds, input) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) sim.step(STEP, input);
}

// --- Map sanity ---

test('every waypoint link is symmetric', () => {
  for (const node of MAP.waypoints) {
    for (const link of node.links) {
      const other = MAP.waypoints.find((n) => n.id === link);
      assert.ok(other, `node ${node.id} links to missing ${link}`);
      assert.ok(other.links.includes(node.id), `link ${node.id}->${link} has no reverse`);
    }
  }
});

test('no waypoint or spawn sits inside a collider', () => {
  const points = [
    ...MAP.waypoints.map((n) => [n.x, n.z]),
    ...MAP.spawns.attackers.map((s) => [s.x, s.z]),
    ...MAP.spawns.defenders.map((s) => [s.x, s.z]),
  ];
  for (const [x, z] of points) {
    for (const box of MAP.colliders) {
      assert.ok(!boxOverlaps(box, x, 0, z, 0.34, 1.72, 0.04), `point (${x},${z}) inside ${JSON.stringify(box)}`);
    }
  }
});

test('every waypoint link is walkable (sampled, bot radius)', () => {
  for (const node of MAP.waypoints) {
    for (const link of node.links) {
      const other = MAP.waypoints.find((n) => n.id === link);
      const length = Math.hypot(other.x - node.x, other.z - node.z);
      const samples = Math.max(2, Math.ceil(length / 0.25));
      for (let i = 0; i <= samples; i += 1) {
        const x = node.x + ((other.x - node.x) * i) / samples;
        const z = node.z + ((other.z - node.z) * i) / samples;
        for (const box of MAP.colliders) {
          assert.ok(!boxOverlaps(box, x, 0, z, 0.34, 1.72, 0.04), `link ${node.id}->${link} crosses ${JSON.stringify(box)} at (${x.toFixed(2)},${z.toFixed(2)})`);
        }
      }
    }
  }
});

test('the waypoint graph is connected', () => {
  for (const from of MAP.waypoints) {
    for (const to of MAP.waypoints) {
      const path = findPath(from.id, to.id);
      assert.ok(path.length > 0 && path[path.length - 1] === to.id, `no path ${from.id}->${to.id}`);
    }
  }
});

test('line of sight is blocked by the mid container', () => {
  const a = { x: 0, y: 1.5, z: 8 };
  const b = { x: 0, y: 1.5, z: -8 };
  assert.equal(hasLineOfSight(MAP.colliders, a, b), false);
  const c = { x: -10, y: 1.5, z: 8 };
  const d = { x: -10, y: 1.5, z: -8 };
  assert.equal(hasLineOfSight(MAP.colliders, c, d), true);
  assert.equal(segmentHitsBox(a, b, MAP.colliders[4]), true);
});

// --- Player movement ---

test('player walks forward and a wall stops them', () => {
  const sim = createSim(7);
  const p = sim.player;
  // Start east of the mid container so the walk north is unobstructed.
  p.pos = { x: 4, y: 0, z: 13 };
  const z0 = p.pos.z;
  runSteps(sim, 1, { keys: keys('KeyW'), firing: false, plant: false });
  assert.ok(z0 - p.pos.z > 4, `walked only ${z0 - p.pos.z}`);
  // Walk north into the wall for 5 seconds.
  runSteps(sim, 5, { keys: keys('KeyW'), firing: false, plant: false });
  assert.ok(p.pos.z > -16 + 0.34, `passed the north wall: z=${p.pos.z}`);
  assert.ok(p.pos.z < -12, `did not reach the wall: z=${p.pos.z}`);
});

test('crouching is slower than walking', () => {
  const sim = createSim(7);
  const p = sim.player;
  runSteps(sim, 1, { keys: keys('KeyW', 'ControlLeft'), firing: false, plant: false });
  const crouchDist = 13 - p.pos.z;
  const sim2 = createSim(7);
  runSteps(sim2, 1, { keys: keys('KeyW'), firing: false, plant: false });
  const walkDist = 13 - sim2.player.pos.z;
  assert.ok(crouchDist < walkDist * 0.6, `crouch ${crouchDist} vs walk ${walkDist}`);
});

// --- Weapons ---

test('spread punishes moving, headshots pay', () => {
  const still = spreadFor(WEAPONS.rifle, 0, 5.2, 0);
  const moving = spreadFor(WEAPONS.rifle, 5.2, 5.2, 0);
  assert.ok(moving > still * 5, `still ${still} moving ${moving}`);
  assert.equal(damageFor(WEAPONS.rifle, true), 99);
  assert.equal(damageFor(WEAPONS.rifle, false), 33);
});

test('loss reward grows with the streak and caps', () => {
  assert.equal(lossRewardFor(1), 1900);
  assert.equal(lossRewardFor(2), 2400);
  assert.equal(lossRewardFor(5), 2900);
});

// --- Economy ---

test('buying a rifle costs money and swaps the weapon', () => {
  const sim = createSim(7);
  assert.equal(sim.buy('rifle'), false, 'bought a rifle with $800');
  sim.money = 3000;
  assert.equal(sim.buy('rifle'), true);
  assert.equal(sim.player.weapon, 'rifle');
  assert.equal(sim.money, 300);
  assert.equal(sim.player.ammo.rifle.mag, 30);
});

test('a player kill pays $300', () => {
  const sim = createSim(7);
  const enemy = sim.entities.find((e) => e.team === 'defend');
  const before = sim.money;
  sim.damageEntity(enemy, 200, sim.player, false);
  assert.equal(enemy.alive, false);
  assert.equal(sim.money, before + ECONOMY.killReward);
});

// --- Rounds and the bomb ---

test('planting then letting the fuse run out wins the round for attackers', () => {
  const sim = createSim(11);
  // Skip the buy phase.
  runSteps(sim, 13, { keys: keys(), firing: false, plant: false });
  assert.equal(sim.phase, 'live');
  // Clear site A first: planting in the open with two defenders on it is a
  // death sentence, as it should be — the test clears the site, then plants.
  for (const e of sim.entities.filter((x) => x.team === 'defend' && x.site === 'A')) {
    sim.damageEntity(e, 500, sim.player, false);
  }
  // Walk the player onto site A and hold E.
  sim.player.pos = { x: 16, y: 0, z: -6.5 };
  sim.player.vel = { x: 0, y: 0, z: 0 };
  runSteps(sim, 4, { keys: keys('KeyE'), firing: false, plant: true });
  assert.equal(sim.bomb.state, 'planted');
  assert.equal(sim.phase, 'planted');
  // The fuse is a 40-second config value; fast-forward it to test the expiry.
  sim.bomb.fuse = 0.5;
  runSteps(sim, 1, { keys: keys(), firing: false, plant: false });
  assert.equal(sim.bomb.state, 'exploded');
  assert.equal(sim.phase, 'over');
  assert.equal(sim.roundWinner, 'attack');
  assert.equal(sim.match.attack, 1);
});

test('defenders defuse a planted bomb when the attackers are all down', () => {
  const sim = createSim(11);
  runSteps(sim, 13, { keys: keys(), firing: false, plant: false });
  // Clear site A so the player survives the 3-second plant.
  for (const e of sim.entities.filter((x) => x.team === 'defend' && x.site === 'A')) {
    sim.damageEntity(e, 500, sim.player, false);
  }
  sim.player.pos = { x: 16, y: 0, z: -6.5 };
  sim.player.vel = { x: 0, y: 0, z: 0 };
  runSteps(sim, 4, { keys: keys('KeyE'), firing: false, plant: true });
  assert.equal(sim.bomb.state, 'planted');
  // Kill every attacker: the round must not end while the bomb is planted.
  for (const e of sim.entities.filter((x) => x.team === 'attack')) sim.damageEntity(e, 500, null, false);
  assert.equal(sim.phase, 'planted');
  // The B defenders rotate across the map (~15 s) and defuse (5 s). Stop
  // checking the moment the bomb state changes — the next round resets it.
  let resolved = false;
  for (let i = 0; i < 30 * 60; i += 1) {
    sim.step(STEP, { keys: keys(), firing: false, plant: false });
    if (sim.bomb.state !== 'planted') {
      resolved = true;
      break;
    }
  }
  assert.ok(resolved, 'bomb never resolved');
  assert.equal(sim.bomb.state, 'defused');
  assert.equal(sim.roundWinner, 'defend');
});

test('eliminating every defender wins the round', () => {
  const sim = createSim(11);
  runSteps(sim, 13, { keys: keys(), firing: false, plant: false });
  for (const e of sim.entities.filter((x) => x.team === 'defend')) sim.damageEntity(e, 500, sim.player, false);
  sim.step(STEP, { keys: keys(), firing: false, plant: false });
  assert.equal(sim.phase, 'over');
  assert.equal(sim.roundWinner, 'attack');
});

test('a grenade explodes and hurts a bot standing on it', () => {
  const sim = createSim(11);
  runSteps(sim, 13, { keys: keys(), firing: false, plant: false });
  const enemy = sim.entities.find((e) => e.team === 'defend');
  sim.player.grenades = 1;
  sim.player.pos = { x: enemy.pos.x, y: 0, z: enemy.pos.z + 1.5 };
  sim.player.yaw = 0;
  sim.player.pitch = -1.2; // lob it down at the bot's feet, not over its head
  assert.equal(sim.throwGrenade(), true);
  const hpBefore = enemy.hp;
  runSteps(sim, 3, { keys: keys(), firing: false, plant: false });
  assert.equal(sim.grenades.length, 0);
  assert.ok(enemy.hp < hpBefore, `grenade did no damage: ${hpBefore} -> ${enemy.hp}`);
});

// --- Bots ---

test('a defender sees the player in the open and engages', () => {
  const sim = createSim(11);
  runSteps(sim, 13, { keys: keys(), firing: false, plant: false });
  const defender = sim.entities.find((e) => e.team === 'defend' && e.site === 'A');
  // Put the player in the open, south of the A site, facing the defender.
  sim.player.pos = { x: 13, y: 0, z: -1 };
  sim.player.vel = { x: 0, y: 0, z: 0 };
  defender.pos = { x: 13, y: 0, z: -6.5 };
  defender.yaw = 0;
  let engaged = false;
  for (let i = 0; i < 120; i += 1) {
    sim.step(STEP, { keys: keys(), firing: false, plant: false });
    if (defender.state === 'engage') {
      engaged = true;
      break;
    }
  }
  assert.ok(engaged, `defender never engaged (state ${defender.state})`);
});

test('a defender walks its hold route and arrives', () => {
  const sim = createSim(11);
  runSteps(sim, 13, { keys: keys(), firing: false, plant: false });
  const defender = sim.entities.find((e) => e.team === 'defend' && e.site === 'B');
  const start = { ...defender.pos };
  runSteps(sim, 20, { keys: keys(), firing: false, plant: false });
  const moved = Math.hypot(defender.pos.x - start.x, defender.pos.z - start.z);
  assert.ok(moved > 1, `defender never moved: ${moved}`);
});

test('a bot turns toward nearby gunfire and investigates it', () => {
  const sim = createSim(11);
  runSteps(sim, 13, { keys: keys(), firing: false, plant: false });
  const defender = sim.entities.find((e) => e.team === 'defend' && e.site === 'B');
  assert.equal(defender.state, 'hold');
  // A shot 10 m away, inside the 20 m hearing radius.
  const heard = reactToSound(defender, { x: defender.pos.x + 10, z: defender.pos.z }, sim.now, 20);
  assert.equal(heard, true);
  assert.equal(defender.state, 'patrol');
  assert.ok(defender.investigate, 'no investigate target set');
  // Cooldown: the same bot ignores a second noise 1 s later.
  assert.equal(reactToSound(defender, { x: defender.pos.x, z: defender.pos.z }, sim.now + 1, 20), false);
  // Out of range: a shot 30 m away is not heard.
  const far = sim.entities.find((e) => e.team === 'defend' && e.site === 'A');
  assert.equal(reactToSound(far, { x: far.pos.x + 30, z: far.pos.z }, sim.now, 20), false);
});

test('a defender lobs a grenade at the player planting the bomb', () => {
  const sim = createSim(11);
  runSteps(sim, 13, { keys: keys(), firing: false, plant: false });
  const defender = sim.entities.find((e) => e.team === 'defend' && e.site === 'A');
  // Planting in progress at site A, defender close by, not engaging.
  defender.pos = { x: 13, y: 0, z: -3 };
  defender.state = 'hold';
  sim.player.pos = { x: 16, y: 0, z: -6.5 };
  sim.bomb.plantProgress = 1;
  assert.equal(defender.grenadesLeft, 1);
  const thrown = throwGrenade(sim, defender, { x: sim.player.pos.x, z: sim.player.pos.z });
  assert.equal(thrown, true);
  assert.equal(defender.grenadesLeft, 0);
  assert.equal(sim.grenades.length, 1);
  // Spent: no second grenade until the next round resets the stock.
  assert.equal(throwGrenade(sim, defender, { x: sim.player.pos.x, z: sim.player.pos.z }), false);
});

test('a defender shells the last known spot of a player hidden over 4 s', () => {
  const sim = createSim(11);
  runSteps(sim, 13, { keys: keys(), firing: false, plant: false });
  const defender = sim.entities.find((e) => e.team === 'defend' && e.site === 'A');
  // North of the mid container, so the player (south of it) is out of sight:
  // the container blocks the line, the defender cannot engage instead.
  defender.pos = { x: 0, y: 0, z: -8 };
  defender.state = 'hold';
  sim.player.pos = { x: 0, y: 0, z: 8 };
  defender.lastKnownPlayer = { x: 4, z: 0, at: sim.now - 5 };
  const before = sim.grenades.length;
  // Step the sim: the hidden-player rule fires inside updateBot.
  runSteps(sim, 0.2, { keys: keys(), firing: false, plant: false });
  assert.ok(sim.grenades.length > before, 'no grenade thrown at the hidden player');
  assert.equal(defender.grenadesLeft, 0);
  assert.ok(sim.grenades.some((g) => g.owner === defender), 'the defender did not throw its grenade');
});

// --- Full-match smoke test ---

test('scripted rounds complete without exceptions and the match ends', () => {
  const sim = createSim(99);
  let guard = 0;
  while (!sim.matchOver && guard < 60 * 60 * 12) {
    // Scripted player: aim at the nearest visible defender and "land" a shot
    // every half second; otherwise walk toward the nearest site.
    const p = sim.player;
    const foes = sim.entities.filter((e) => e.team === 'defend' && e.alive);
    const input = { keys: new Set(), firing: false, plant: false };
    if (p.alive && foes.length > 0 && (sim.phase === 'live' || sim.phase === 'planted')) {
      const foe = foes[0];
      p.yaw = Math.atan2(-(foe.pos.x - p.pos.x), -(foe.pos.z - p.pos.z));
      if (guard % 30 === 0) sim.damageEntity(foe, 40, p, false);
      if (sim.bomb.state === 'carried' && Math.hypot(p.pos.x - 16, p.pos.z + 6.5) < 3) input.plant = true;
      else if (sim.bomb.state === 'carried') {
        input.keys.add('KeyW');
        p.yaw = Math.atan2(-(16 - p.pos.x), -(-6.5 - p.pos.z));
      }
    }
    sim.step(STEP, input);
    guard += 1;
  }
  assert.ok(sim.matchOver, 'match never ended');
  assert.ok(sim.match.attack + sim.match.defend >= 5, `match ended early: ${JSON.stringify(sim.match)}`);
});
