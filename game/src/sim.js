// The sim: the single state store. One fixed-step update owns rounds, the bomb,
// grenades, damage, money and win/loss; the browser only renders this state and
// feeds it input. No three.js — node tests drive this directly.
import { MAP } from './map.js';
import { WEAPONS, GRENADE, ARMOR } from './weapons.js';
import { ECONOMY, SHOP, lossRewardFor } from './economy.js';
import { mulberry32, clamp, range } from './rng.js';
import { hitsAny } from './collide.js';
import { createPlayerState, stepPlayer, groundSpeed } from './player.js';
import { createBot, updateBot, BOT_NAMES } from './bots.js';

const FIXED_STEP = 1 / 60;

function siteOf(pos) {
  for (const key of ['A', 'B']) {
    const site = MAP.sites[key];
    if (Math.hypot(pos.x - site.center.x, pos.z - site.center.z) <= site.radius) return key;
  }
  return null;
}

export function createSim(seed) {
  const random = mulberry32(seed);
  const player = createPlayerState(MAP.spawns.attackers[0]);
  const entities = [player];
  MAP.spawns.attackers.slice(1).forEach((spawn, i) => {
    entities.push(createBot(`ally-${i}`, 'attack', BOT_NAMES.attack[i], spawn, null));
  });
  MAP.spawns.defenders.forEach((spawn, i) => {
    const site = i < 2 ? 'A' : 'B';
    entities.push(createBot(`enemy-${i}`, 'defend', BOT_NAMES.defend[i], spawn, site));
  });

  const sim = {
    seed,
    random,
    now: 0,
    colliders: MAP.colliders,
    phase: 'buy',
    round: 1,
    match: { attack: 0, defend: 0 },
    matchOver: false,
    matchWinner: null,
    roundWinner: null,
    timer: ECONOMY.buySeconds,
    money: ECONOMY.startMoney,
    lossStreak: 0,
    entities,
    player,
    bomb: { state: 'carried', site: null, pos: null, fuse: 0, plantProgress: 0, carrier: 'player' },
    grenades: [],
    shots: [],
    fx: { tracers: [], explosions: [], hits: [] },
    feed: [],
    roundEvents: [],
  };

  sim.damageEntity = function damageEntity(target, amount, attacker, headshot) {
    if (!target.alive) return false;
    let rest = amount;
    if (target.armor > 0) {
      const absorbed = Math.min(target.armor, amount * 0.5);
      target.armor -= absorbed;
      rest -= absorbed;
    }
    target.hp -= rest;
    sim.fx.hits.push({ pos: { x: target.pos.x, y: target.pos.y + 1.2, z: target.pos.z }, headshot: !!headshot, ttl: 0.25 });
    if (target.hp > 0) return false;
    target.hp = 0;
    target.alive = false;
    target.fall = 0;
    sim.feed.push({ killer: attacker ? attacker.name : '—', victim: target.name, headshot: !!headshot, at: sim.now });
    if (sim.feed.length > 6) sim.feed.shift();
    if (attacker && attacker.isPlayer) sim.money += ECONOMY.killReward;
    else if (attacker && attacker.team === 'attack') sim.money += ECONOMY.assistReward;
    return true;
  };

  sim.plantBomb = function plantBomb() {
    const site = siteOf(sim.player.pos);
    if (!site) return false;
    sim.bomb.state = 'planted';
    sim.bomb.site = site;
    sim.bomb.pos = { x: sim.player.pos.x, y: 0, z: sim.player.pos.z };
    sim.bomb.fuse = ECONOMY.fuseSeconds;
    sim.bomb.plantProgress = 0;
    sim.phase = 'planted';
    sim.roundEvents.push({ type: 'planted', site, at: sim.now });
    return true;
  };

  sim.defuseBomb = function defuseBomb(bot) {
    sim.bomb.state = 'defused';
    sim.roundEvents.push({ type: 'defused', by: bot.name, at: sim.now });
    endRound(sim, 'defend');
  };

  sim.buy = function buy(itemId) {
    if (sim.phase !== 'buy' || sim.matchOver) return false;
    const item = SHOP.find((s) => s.id === itemId);
    if (!item || sim.money < item.price) return false;
    const p = sim.player;
    if (itemId === 'rifle' || itemId === 'smg') {
      p.ammo[itemId] = { mag: WEAPONS[itemId].mag, reserve: WEAPONS[itemId].reserve };
      p.weapon = itemId;
    } else if (itemId === 'grenade') {
      if (p.grenades >= GRENADE.maxCarry) return false;
      p.grenades += 1;
    } else if (itemId === 'armor') {
      if (p.armor >= ARMOR.value) return false;
      p.armor = ARMOR.value;
    } else if (itemId === 'ammo') {
      p.ammo[p.weapon].reserve = WEAPONS[p.weapon].reserve;
    }
    sim.money -= item.price;
    return true;
  };

  sim.throwGrenade = function throwGrenade() {
    const p = sim.player;
    if (!p.alive || p.grenades <= 0) return false;
    if (sim.phase !== 'live' && sim.phase !== 'planted') return false;
    p.grenades -= 1;
    const dir = {
      x: -Math.sin(p.yaw) * Math.cos(p.pitch),
      y: Math.sin(p.pitch) + 0.28,
      z: -Math.cos(p.yaw) * Math.cos(p.pitch),
    };
    sim.grenades.push({
      pos: { x: p.pos.x + dir.x * 0.5, y: p.pos.y + p.eye, z: p.pos.z + dir.z * 0.5 },
      vel: { x: dir.x * 14, y: dir.y * 14 + 2, z: dir.z * 14 },
      fuse: GRENADE.fuse,
      owner: p,
    });
    return true;
  };

  // A bot's grenade: lobbed at a target point with an arc, same fuse and
  // blast as the player's (see bots.js throwGrenade, which decides + spends).
  sim.throwGrenadeBy = function throwGrenadeBy(entity, target) {
    if (!entity.alive || (sim.phase !== 'live' && sim.phase !== 'planted')) return false;
    const dx = target.x - entity.pos.x;
    const dz = target.z - entity.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 24) return false;
    const speed = Math.min(16, 7 + dist * 0.55);
    sim.grenades.push({
      pos: { x: entity.pos.x, y: entity.pos.y + 1.4, z: entity.pos.z },
      vel: { x: (dx / (dist || 1)) * speed, y: 5.5, z: (dz / (dist || 1)) * speed },
      fuse: GRENADE.fuse,
      owner: entity,
    });
    return true;
  };

  sim.step = function step(dt, input) {
    sim.now += dt;
    // Timers and phase transitions.
    if (sim.phase === 'buy') {
      sim.timer -= dt;
      if (sim.timer <= 0) {
        sim.phase = 'live';
        sim.timer = ECONOMY.roundSeconds;
      }
    } else if (sim.phase === 'live') {
      sim.timer -= dt;
      if (sim.timer <= 0) endRound(sim, 'defend');
    } else if (sim.phase === 'planted') {
      sim.bomb.fuse -= dt;
      if (sim.bomb.fuse <= 0) {
        sim.bomb.state = 'exploded';
        sim.fx.explosions.push({ pos: { ...sim.bomb.pos, y: 0.6 }, ttl: 1.2, big: true });
        endRound(sim, 'attack');
      }
    } else if (sim.phase === 'over') {
      sim.timer -= dt;
      if (sim.timer <= 0) {
        if (sim.matchOver) return;
        nextRound(sim);
      }
    }

    if (sim.phase === 'over' || sim.matchOver) {
      decayFx(sim, dt);
      return;
    }

    // Player movement + planting.
    const p = sim.player;
    if (p.alive) {
      stepPlayer(p, input.keys, dt, sim.colliders);
      p.cooldown = Math.max(0, p.cooldown - dt);
      if (p.reloadLeft > 0) {
        p.reloadLeft = Math.max(0, p.reloadLeft - dt);
        if (p.reloadLeft === 0) {
          const def = WEAPONS[p.weapon];
          const ammo = p.ammo[p.weapon];
          const need = def.mag - ammo.mag;
          const take = Math.min(need, ammo.reserve);
          ammo.mag += take;
          ammo.reserve -= take;
        }
      }
      if (sim.bomb.state === 'carried' && input.plant && siteOf(p.pos)) {
        const speed = groundSpeed(p);
        if (speed < 1 && !input.firing) {
          sim.bomb.plantProgress += dt;
          if (sim.bomb.plantProgress >= ECONOMY.plantSeconds) sim.plantBomb();
        } else {
          sim.bomb.plantProgress = 0;
        }
      } else {
        sim.bomb.plantProgress = 0;
      }
    }

    // Bots.
    for (const entity of sim.entities) {
      if (!entity.isPlayer) updateBot(sim, entity, dt);
    }

    // Grenades: gravity, bounce, fuse, blast.
    for (let i = sim.grenades.length - 1; i >= 0; i -= 1) {
      const g = sim.grenades[i];
      g.vel.y -= 18 * dt;
      const nx = g.pos.x + g.vel.x * dt;
      if (!hitsAny(sim.colliders, nx, g.pos.y, g.pos.z, 0.12, 0.24, 0)) g.pos.x = nx;
      else g.vel.x *= -0.45;
      const nz = g.pos.z + g.vel.z * dt;
      if (!hitsAny(sim.colliders, g.pos.x, g.pos.y, nz, 0.12, 0.24, 0)) g.pos.z = nz;
      else g.vel.z *= -0.45;
      g.pos.y += g.vel.y * dt;
      if (g.pos.y < 0.12) {
        g.pos.y = 0.12;
        g.vel.y = Math.abs(g.vel.y) * 0.45;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      g.fuse -= dt;
      if (g.fuse <= 0) {
        sim.grenades.splice(i, 1);
        sim.fx.explosions.push({ pos: { ...g.pos }, ttl: 0.9, big: false });
        for (const entity of sim.entities) {
          if (!entity.alive) continue;
          const d = Math.hypot(entity.pos.x - g.pos.x, entity.pos.z - g.pos.z);
          if (d > GRENADE.radius) continue;
          const damage = GRENADE.damageEdge + (GRENADE.damageCenter - GRENADE.damageEdge) * (1 - d / GRENADE.radius);
          sim.damageEntity(entity, damage, g.owner, false);
        }
      }
    }

    // Round end by elimination.
    if (sim.phase === 'live' || sim.phase === 'planted') {
      const attackersAlive = sim.entities.some((e) => e.team === 'attack' && e.alive);
      const defendersAlive = sim.entities.some((e) => e.team === 'defend' && e.alive);
      if (!defendersAlive) endRound(sim, 'attack');
      else if (!attackersAlive && sim.bomb.state !== 'planted') endRound(sim, 'defend');
    }

    decayFx(sim, dt);
  };

  return sim;
}

function decayFx(sim, dt) {
  for (const list of [sim.fx.tracers, sim.fx.explosions, sim.fx.hits]) {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      list[i].ttl -= dt;
      if (list[i].ttl <= 0) list.splice(i, 1);
    }
  }
  sim.shots = sim.shots.filter((s) => sim.now - s.at < 2);
}

function endRound(sim, winner) {
  if (sim.phase === 'over') return;
  sim.phase = 'over';
  sim.roundWinner = winner;
  sim.timer = 4;
  sim.match[winner] += 1;
  if (winner === 'attack') {
    sim.money += ECONOMY.winReward;
    sim.lossStreak = 0;
  } else {
    sim.money += lossRewardFor(sim.lossStreak + 1);
    sim.lossStreak += 1;
  }
  sim.roundEvents.push({ type: 'round', winner, round: sim.round, at: sim.now });
  if (sim.match[winner] >= ECONOMY.winRounds || sim.round >= ECONOMY.maxRounds) {
    sim.matchOver = true;
    sim.matchWinner = sim.match.attack > sim.match.defend ? 'attack' : 'defend';
  }
}

function nextRound(sim) {
  sim.round += 1;
  sim.phase = 'buy';
  sim.timer = ECONOMY.buySeconds;
  sim.roundWinner = null;
  sim.bomb = { state: 'carried', site: null, pos: null, fuse: 0, plantProgress: 0, carrier: 'player' };
  sim.grenades = [];
  sim.feed = [];
  const player = sim.player;
  player.pos = { x: MAP.spawns.attackers[0].x, y: 0, z: MAP.spawns.attackers[0].z };
  player.vel = { x: 0, y: 0, z: 0 };
  player.yaw = MAP.spawns.attackers[0].yaw;
  player.pitch = 0;
  player.hp = 100;
  player.alive = true;
  player.fall = 0;
  player.ammo[player.weapon] = { mag: WEAPONS[player.weapon].mag, reserve: WEAPONS[player.weapon].reserve };
  player.grenades = 0;
  player.cooldown = 0;
  player.reloadLeft = 0;
  let ally = 0;
  let enemy = 0;
  for (const entity of sim.entities) {
    if (entity.isPlayer) continue;
    const spawns = entity.team === 'attack' ? MAP.spawns.attackers : MAP.spawns.defenders;
    const index = entity.team === 'attack' ? 1 + ally++ : enemy++;
    const spawn = spawns[index];
    entity.pos = { x: spawn.x, y: 0, z: spawn.z };
    entity.vel = { x: 0, y: 0, z: 0 };
    entity.yaw = spawn.yaw;
    entity.hp = 100;
    entity.armor = 0;
    entity.alive = true;
    entity.fall = 0;
    entity.mag = WEAPONS.rifle.mag;
    entity.reserve = WEAPONS.rifle.reserve;
    entity.cooldown = 0;
    entity.reloadLeft = 0;
    entity.state = 'hold';
    entity.target = null;
    entity.path = [];
    entity.pathIndex = 0;
    entity.defuseProgress = 0;
    entity.holdUntil = 0;
    entity.grenadesLeft = 1;
    entity.grenadeCooldown = 0;
    entity.hearCooldown = 0;
    entity.lastKnownPlayer = null;
    entity.lastSeen = null;
  }
}

export { FIXED_STEP };
