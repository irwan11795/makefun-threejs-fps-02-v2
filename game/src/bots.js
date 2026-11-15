// Bot brains: one job — decide what a bot does each fixed step. Bots see through
// the same line-of-sight test as everything else, walk the waypoint graph, hold
// sites, rotate to a planted bomb and defuse it, and shoot back in bursts with
// distance-based accuracy. No three.js: positions are plain {x, y, z}.
import { MAP } from './map.js';
import { hasLineOfSight, moveBody } from './collide.js';
import { WEAPONS } from './weapons.js';
import { clamp, range, pick } from './rng.js';

const BOT_SPEED = 3.4;
const ENGAGE_SPEED = 1.6;
const SIGHT_RANGE = 30;
const FOV_COS = 0.42; // ~100 degrees of vision
const RADIUS = 0.34;
const HEIGHT = 1.72;

export const BOT_NAMES = {
  defend: ['Rook', 'Havoc', 'Sable', 'Wren'],
  attack: ['Ivy', 'Juno'],
};

function dist2d(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function nearestWaypoint(pos) {
  let best = MAP.waypoints[0];
  let bestD = Infinity;
  for (const node of MAP.waypoints) {
    const d = Math.hypot(node.x - pos.x, node.z - pos.z);
    if (d < bestD) {
      bestD = d;
      best = node;
    }
  }
  return best.id;
}

// Breadth-first path on the waypoint graph. Returns a list of node ids.
export function findPath(fromId, toId) {
  if (fromId === toId) return [toId];
  const prev = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length > 0) {
    const current = queue.shift();
    const node = MAP.waypoints.find((n) => n.id === current);
    for (const link of node.links) {
      if (prev.has(link)) continue;
      prev.set(link, current);
      if (link === toId) {
        const path = [toId];
        let step = current;
        while (step !== null) {
          path.unshift(step);
          step = prev.get(step);
        }
        return path;
      }
      queue.push(link);
    }
  }
  return [toId];
}

function eyeOf(entity) {
  return { x: entity.pos.x, y: entity.pos.y + 1.55, z: entity.pos.z };
}

function hitChance(dist, targetSpeed, targetCrouching, botMoving) {
  let p = dist <= 8 ? 0.45 : dist <= 15 ? 0.3 : dist <= 22 ? 0.2 : 0.12;
  if (targetSpeed > 3) p *= 0.65;
  if (targetCrouching) p *= 0.8;
  if (botMoving) p *= 0.85;
  return p;
}

function angleTo(bot, point) {
  return Math.atan2(-(point.x - bot.pos.x), -(point.z - bot.pos.z));
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function turnToward(bot, targetYaw, dt, rate) {
  const diff = angleDiff(targetYaw, bot.yaw);
  const step = clamp(diff, -rate * dt, rate * dt);
  bot.yaw += step;
  return Math.abs(diff) < 0.05;
}

export function createBot(id, team, name, spawn, site) {
  return {
    id,
    team,
    isPlayer: false,
    name,
    site: site || null,
    pos: { x: spawn.x, y: 0, z: spawn.z },
    vel: { x: 0, y: 0, z: 0 },
    yaw: spawn.yaw,
    pitch: 0,
    hp: 100,
    armor: 0,
    alive: true,
    weapon: 'rifle',
    mag: WEAPONS.rifle.mag,
    reserve: WEAPONS.rifle.reserve,
    cooldown: 0,
    reloadLeft: 0,
    crouching: false,
    onGround: true,
    height: HEIGHT,
    state: 'hold',
    target: null,
    reactAt: 0,
    burstLeft: 0,
    nextShotAt: 0,
    strafeDir: 0,
    strafeUntil: 0,
    path: [],
    pathIndex: 0,
    holdUntil: 0,
    holdYaw: 0,
    investigate: null,
    defuseProgress: 0,
    fall: 0,
    walkPhase: 0,
    lastSeen: null,
    // Grenade + hearing state (throwGrenade / reactToSound below).
    grenadesLeft: 1,
    grenadeCooldown: 0,
    hearCooldown: 0,
    lastKnownPlayer: null,
  };
}

// reactToSound: a loud noise (gunfire, explosion) near the bot turns it
// toward the noise and sends it to investigate, unless it is already
// fighting or it heard something moments ago (3 s cooldown per bot).
export function reactToSound(bot, pos, now, radius) {
  if (!bot.alive || bot.state === 'engage' || bot.state === 'defuse') return false;
  if (now < bot.hearCooldown) return false;
  if (Math.hypot(pos.x - bot.pos.x, pos.z - bot.pos.z) > radius) return false;
  bot.investigate = { x: pos.x, z: pos.z, at: now };
  setPathTo(bot, nearestWaypoint(pos));
  bot.state = 'patrol';
  bot.hearCooldown = now + 3;
  return true;
}

// throwGrenade: lob a frag at a target point. One per bot per round, then
// an 8 s cooldown. The sim owns the grenade entity (sim.throwGrenadeBy);
// this only decides and spends the bot's grenade.
export function throwGrenade(sim, bot, target) {
  if (!bot.alive || bot.grenadesLeft <= 0) return false;
  if (sim.now < bot.grenadeCooldown) return false;
  if (sim.phase !== 'live' && sim.phase !== 'planted') return false;
  if (!sim.throwGrenadeBy(bot, target)) return false;
  bot.grenadesLeft -= 1;
  bot.grenadeCooldown = sim.now + 8;
  return true;
}

function visibleEnemy(sim, bot) {
  let best = null;
  let bestD = Infinity;
  const eye = eyeOf(bot);
  for (const other of sim.entities) {
    if (!other.alive || other.team === bot.team) continue;
    const d = dist2d(bot.pos, other.pos);
    if (d > SIGHT_RANGE) continue;
    const targetEye = { x: other.pos.x, y: other.pos.y + 1.2, z: other.pos.z };
    if (!hasLineOfSight(sim.colliders, eye, targetEye)) continue;
    const toTarget = angleTo(bot, other.pos);
    const facing = Math.abs(angleDiff(toTarget, bot.yaw)) < Math.acos(FOV_COS) + 0.6;
    const close = d < 6;
    if (!facing && !close) continue;
    if (d < bestD) {
      bestD = d;
      best = other;
    }
  }
  return best ? { enemy: best, dist: bestD } : null;
}

function moveAlongPath(sim, bot, dt, speed) {
  if (bot.pathIndex >= bot.path.length) return true;
  const node = MAP.waypoints.find((n) => n.id === bot.path[bot.pathIndex]);
  const dx = node.x - bot.pos.x;
  const dz = node.z - bot.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.6) {
    bot.pathIndex += 1;
    return bot.pathIndex >= bot.path.length;
  }
  const vx = (dx / d) * speed;
  const vz = (dz / d) * speed;
  bot.vel.x = vx;
  bot.vel.z = vz;
  bot.vel.y = 0;
  moveBody(sim.colliders, bot.pos, bot.vel, dt, RADIUS, HEIGHT);
  bot.pos.y = 0;
  turnToward(bot, angleTo(bot, { x: node.x, z: node.z }), dt, 6);
  bot.walkPhase += dt * speed * 2.2;
  return false;
}

function setPathTo(bot, nodeId) {
  const from = nearestWaypoint(bot.pos);
  bot.path = findPath(from, nodeId);
  bot.pathIndex = 0;
}

export function updateBot(sim, bot, dt) {
  if (!bot.alive) {
    bot.fall = Math.min(1, bot.fall + dt / 0.4);
    return;
  }
  const now = sim.now;
  const random = sim.random;
  // No fighting during the buy phase: bots walk to their spots, but nobody
  // shoots before the round starts.
  const canFight = sim.phase === 'live' || sim.phase === 'planted';
  bot.cooldown = Math.max(0, bot.cooldown - dt);
  if (bot.reloadLeft > 0) {
    bot.reloadLeft = Math.max(0, bot.reloadLeft - dt);
    if (bot.reloadLeft === 0) {
      const need = WEAPONS.rifle.mag - bot.mag;
      const take = Math.min(need, bot.reserve);
      bot.mag += take;
      bot.reserve -= take;
    }
  }

  // Hearing: an enemy shot nearby pulls the bot to investigate, and an
  // explosion is louder still. reactToSound owns the cooldown + pathing.
  if (canFight && bot.state !== 'engage' && bot.state !== 'defuse') {
    for (const shot of sim.shots) {
      if (shot.team === bot.team || now - shot.at > 1.5) continue;
      if (reactToSound(bot, shot.pos, now, 20)) break;
    }
    if (bot.state !== 'patrol') {
      for (const boom of sim.fx.explosions) {
        if (reactToSound(bot, boom.pos, now, 30)) break;
      }
    }
  }

  const seen = canFight ? visibleEnemy(sim, bot) : null;
  if (seen) {
    if (bot.target !== seen.enemy) {
      bot.target = seen.enemy;
      bot.reactAt = now + range(random, 0.35, 0.7);
      bot.burstLeft = 0;
    }
    bot.lastSeen = { x: seen.enemy.pos.x, z: seen.enemy.pos.z, at: now };
    if (seen.enemy.isPlayer) bot.lastKnownPlayer = { x: seen.enemy.pos.x, z: seen.enemy.pos.z, at: now };
    bot.state = 'engage';
  } else if (bot.target && bot.lastSeen && now - bot.lastSeen.at > 2.5) {
    bot.target = null;
    bot.state = bot.team === 'defend' ? 'hold' : 'follow';
  }

  // Grenades: a defender lobs one at the planter the moment the bomb starts
  // going down, or at the player's last known spot once the player has been
  // hidden behind cover for over 4 s; an attacker lobs one at a defender it
  // recently saw while pushing a site. Never while engaging or defusing.
  if (canFight && bot.state !== 'engage' && bot.state !== 'defuse' && bot.grenadesLeft > 0) {
    const player = sim.entities.find((e) => e.isPlayer);
    if (bot.team === 'defend' && sim.bomb.plantProgress > 0.5 && player && player.alive
      && dist2d(bot.pos, player.pos) < 20) {
      throwGrenade(sim, bot, { x: player.pos.x, z: player.pos.z });
    } else if (bot.team === 'defend' && sim.bomb.state !== 'planted' && bot.lastKnownPlayer && now - bot.lastKnownPlayer.at > 4
      && dist2d(bot.pos, bot.lastKnownPlayer) < 18) {
      const target = bot.lastKnownPlayer;
      bot.lastKnownPlayer = null;
      throwGrenade(sim, bot, { x: target.x, z: target.z });
    } else if (bot.team === 'attack' && bot.lastSeen && now - bot.lastSeen.at < 4
      && (bot.state === 'follow' || bot.state === 'patrol')) {
      throwGrenade(sim, bot, { x: bot.lastSeen.x, z: bot.lastSeen.z });
    }
  }

  if (bot.state === 'engage' && bot.target) {
    const target = bot.target;
    if (!target.alive) {
      bot.target = null;
      bot.state = bot.team === 'defend' ? 'hold' : 'follow';
      return;
    }
    const d = dist2d(bot.pos, target.pos);
    turnToward(bot, angleTo(bot, target.pos), dt, 9);
    // Strafe: sidestep while shooting, so the bot is not a still target.
    if (now > bot.strafeUntil) {
      bot.strafeDir = random() < 0.5 ? -1 : 1;
      bot.strafeUntil = now + range(random, 0.6, 1.2);
    }
    const strafeAngle = bot.yaw + (Math.PI / 2) * bot.strafeDir;
    const moving = d > 10 || bot.strafeDir !== 0;
    bot.vel.x = Math.sin(strafeAngle) * ENGAGE_SPEED * (d > 10 ? 0.4 : 1);
    bot.vel.z = Math.cos(strafeAngle) * ENGAGE_SPEED * (d > 10 ? 0.4 : 1);
    if (d > 10) {
      // Close the distance a little while strafing.
      bot.vel.x += Math.sin(bot.yaw) * -ENGAGE_SPEED * 0.5;
      bot.vel.z += Math.cos(bot.yaw) * -ENGAGE_SPEED * 0.5;
    }
    moveBody(sim.colliders, bot.pos, bot.vel, dt, RADIUS, HEIGHT);
    bot.pos.y = 0;
    bot.walkPhase += dt * 3;

    if (now >= bot.reactAt && bot.reloadLeft === 0) {
      if (bot.burstLeft <= 0) {
        bot.burstLeft = 3 + Math.floor(random() * 3);
        bot.nextShotAt = now + range(random, 0.5, 0.9);
      } else if (now >= bot.nextShotAt && bot.cooldown === 0) {
        if (bot.mag <= 0) {
          bot.reloadLeft = WEAPONS.rifle.reload;
        } else {
          bot.mag -= 1;
          bot.cooldown = WEAPONS.rifle.gap;
          bot.burstLeft -= 1;
          bot.nextShotAt = now + WEAPONS.rifle.gap;
          const targetSpeed = Math.hypot(target.vel.x, target.vel.z);
          const p = hitChance(d, targetSpeed, target.crouching, moving);
          const from = { x: bot.pos.x, y: bot.pos.y + 1.45, z: bot.pos.z };
          const to = { x: target.pos.x, y: target.pos.y + 1.2, z: target.pos.z };
          sim.fx.tracers.push({ from, to, team: bot.team, ttl: 0.07 });
          if (random() < p) {
            const head = random() < 0.12;
            const damage = head ? WEAPONS.rifle.damage * WEAPONS.rifle.headMult : WEAPONS.rifle.damage;
            sim.damageEntity(target, damage, bot, head);
          }
        }
      }
    }
    return;
  }

  // Bomb planted: defenders converge on the site and defuse.
  if (sim.bomb.state === 'planted' && bot.team === 'defend') {
    const bombPos = sim.bomb.pos;
    const d = dist2d(bot.pos, bombPos);
    if (d < 1.6) {
      bot.state = 'defuse';
      bot.defuseProgress += dt;
      turnToward(bot, angleTo(bot, bombPos), dt, 6);
      if (bot.defuseProgress >= 5) {
        sim.defuseBomb(bot);
      }
      return;
    }
    bot.defuseProgress = 0;
    if (bot.state !== 'rotate' || bot.pathIndex >= bot.path.length) {
      setPathTo(bot, nearestWaypoint(bombPos));
      bot.state = 'rotate';
    }
    moveAlongPath(sim, bot, dt, BOT_SPEED);
    return;
  }

  if (bot.team === 'defend') {
    // Hold the assigned site, rotating between its hold spots.
    if (bot.state !== 'hold' || bot.pathIndex >= bot.path.length) {
      if (now >= bot.holdUntil) {
        const spot = pick(random, MAP.holds[bot.site]);
        setPathTo(bot, spot);
        bot.holdUntil = now + range(random, 8, 14);
        bot.state = 'hold';
        // Face the likely approach: the site's open side.
        bot.holdYaw = bot.site === 'A' ? Math.PI * 0.75 : Math.PI * 0.25;
      }
    }
    const arrived = moveAlongPath(sim, bot, dt, BOT_SPEED);
    if (arrived) turnToward(bot, bot.holdYaw, dt, 3);
    return;
  }

  // Friendly attackers: stay near the player, push toward the site the player
  // is closest to when the player is already up the map.
  const player = sim.entities.find((e) => e.isPlayer);
  if (!player || !player.alive) {
    // Player down: fall back to the nearest site and hold it.
    if (bot.state !== 'hold' || bot.pathIndex >= bot.path.length) {
      const site = sim.bomb.state === 'planted' ? sim.bomb.site : 'A';
      setPathTo(bot, MAP.holds[site][0]);
      bot.state = 'hold';
    }
    moveAlongPath(sim, bot, dt, BOT_SPEED);
    return;
  }
  const dPlayer = dist2d(bot.pos, player.pos);
  if (dPlayer > 7) {
    if (bot.state !== 'follow' || bot.pathIndex >= bot.path.length) {
      const near = nearestWaypoint(player.pos);
      setPathTo(bot, near);
      bot.state = 'follow';
    }
    moveAlongPath(sim, bot, dt, BOT_SPEED * 1.15);
  } else {
    bot.vel.x = 0;
    bot.vel.z = 0;
    turnToward(bot, player.yaw, dt, 3);
  }
}
