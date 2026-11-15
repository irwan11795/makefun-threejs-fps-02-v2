// Player movement: acceleration, friction, gravity, crouch and jump, resolved as
// a box against the world's colliders one axis at a time. Pure: positions are
// plain {x, y, z}, so node tests can drive the player with synthetic keys.
import { hitsAny, moveBody } from './collide.js';

export const PLAYER = {
  radius: 0.34,
  standHeight: 1.72,
  crouchHeight: 1.12,
  standEye: 1.6,
  crouchEye: 1.02,
  walkSpeed: 5.2,
  crouchSpeed: 2.4,
  groundAccel: 42,
  airAccel: 9,
  friction: 9,
  gravity: 20,
  jumpSpeed: 6.2,
};

export function createPlayerState(spawn) {
  return {
    id: 'player',
    team: 'attack',
    isPlayer: true,
    name: 'You',
    pos: { x: spawn.x, y: 0, z: spawn.z },
    vel: { x: 0, y: 0, z: 0 },
    yaw: spawn.yaw,
    pitch: 0,
    eye: PLAYER.standEye,
    hp: 100,
    armor: 0,
    alive: true,
    weapon: 'pistol',
    ammo: {
      pistol: { mag: 12, reserve: 60 },
      rifle: { mag: 0, reserve: 0 },
      smg: { mag: 0, reserve: 0 },
    },
    grenades: 0,
    cooldown: 0,
    reloadLeft: 0,
    crouching: false,
    onGround: true,
    height: PLAYER.standHeight,
    fall: 0,
    walkPhase: 0,
  };
}

export function look(state, dx, dy, sensitivity = 0.0022) {
  state.yaw -= dx * sensitivity;
  state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * sensitivity));
}

export function recoil(state, pitchKick, yawKick) {
  state.pitch = Math.min(1.45, state.pitch + pitchKick);
  state.yaw += yawKick;
}

export function stepPlayer(state, keys, dt, colliders) {
  if (!state.alive) return;
  const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
  if (crouching && !state.crouching) {
    state.crouching = true;
    state.height = PLAYER.crouchHeight;
  } else if (!crouching && state.crouching && !hitsAny(colliders, state.pos.x, state.pos.y, state.pos.z, PLAYER.radius, PLAYER.standHeight, 0.02)) {
    state.crouching = false;
    state.height = PLAYER.standHeight;
  }
  const eyeTarget = state.crouching ? PLAYER.crouchEye : PLAYER.standEye;
  state.eye += (eyeTarget - state.eye) * Math.min(1, dt * 12);

  const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  let wishX = 0;
  let wishZ = 0;
  if (forward || strafe) {
    const sin = Math.sin(state.yaw);
    const cos = Math.cos(state.yaw);
    wishX = -sin * forward + cos * strafe;
    wishZ = -cos * forward - sin * strafe;
    const len = Math.hypot(wishX, wishZ);
    wishX /= len;
    wishZ /= len;
  }

  const speed = state.crouching ? PLAYER.crouchSpeed : PLAYER.walkSpeed;
  const blend = Math.min(1, ((state.onGround ? PLAYER.groundAccel : PLAYER.airAccel) * dt) / speed);
  state.vel.x += (wishX * speed - state.vel.x) * blend;
  state.vel.z += (wishZ * speed - state.vel.z) * blend;
  if (state.onGround && !wishX && !wishZ) {
    const damp = Math.max(0, 1 - PLAYER.friction * dt);
    state.vel.x *= damp;
    state.vel.z *= damp;
  }

  if (keys.has('Space') && state.onGround) {
    state.vel.y = PLAYER.jumpSpeed;
    state.onGround = false;
  }
  state.vel.y -= PLAYER.gravity * dt;
  state.onGround = moveBody(colliders, state.pos, state.vel, dt, PLAYER.radius, state.height);
  state.vel.y = Math.max(-30, state.vel.y);
  state.walkPhase += dt * Math.hypot(state.vel.x, state.vel.z) * 2.2;
}

export function groundSpeed(state) {
  return Math.hypot(state.vel.x, state.vel.z);
}
