// Collision against the map's plain AABBs. No three.js: positions are {x, y, z}
// and boxes are {x0, y0, z0, x1, y1, z1} from map.js, so node can test this too.
export function boxOverlaps(box, x, y, z, radius, height, lift) {
  return (
    x + radius > box.x0 &&
    x - radius < box.x1 &&
    y + lift < box.y1 &&
    y + height - lift > box.y0 &&
    z + radius > box.z0 &&
    z - radius < box.z1
  );
}

export function hitsAny(colliders, x, y, z, radius, height, lift) {
  for (const box of colliders) {
    if (boxOverlaps(box, x, y, z, radius, height, lift)) return box;
  }
  return null;
}

// Move a standing body one axis at a time; a blocked axis stops dead, the other
// keeps sliding, so walls never swallow the mover.
export function moveBody(colliders, pos, vel, dt, radius, height) {
  const nextX = pos.x + vel.x * dt;
  if (!hitsAny(colliders, nextX, pos.y, pos.z, radius, height, 0.04)) pos.x = nextX;
  else vel.x = 0;
  const nextZ = pos.z + vel.z * dt;
  if (!hitsAny(colliders, pos.x, pos.y, nextZ, radius, height, 0.04)) pos.z = nextZ;
  else vel.z = 0;
  pos.y += vel.y * dt;
  const hit = hitsAny(colliders, pos.x, pos.y, pos.z, radius, height, 0);
  if (hit && vel.y <= 0) {
    pos.y = hit.y1;
    vel.y = 0;
    return true; // on ground (on a box top or the floor plane handled by caller)
  }
  if (hit) {
    pos.y = hit.y0 - height;
    vel.y = 0;
  }
  if (pos.y < 0) {
    pos.y = 0;
    vel.y = 0;
    return true;
  }
  return false;
}

// Slab test: does the segment a→b hit the box? Used for line of sight.
export function segmentHitsBox(a, b, box) {
  let tmin = 0;
  let tmax = 1;
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const axes = [
    [a.x, d.x, box.x0, box.x1],
    [a.y, d.y, box.y0, box.y1],
    [a.z, d.z, box.z0, box.z1],
  ];
  for (const [origin, dir, lo, hi] of axes) {
    if (Math.abs(dir) < 1e-9) {
      if (origin < lo || origin > hi) return false;
    } else {
      let t1 = (lo - origin) / dir;
      let t2 = (hi - origin) / dir;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}

export function hasLineOfSight(colliders, a, b) {
  for (const box of colliders) {
    if (segmentHitsBox(a, b, box)) return false;
  }
  return true;
}

// Distance from a point to the nearest point of a box (0 when inside).
export function distanceToBox(point, box) {
  const dx = Math.max(box.x0 - point.x, 0, point.x - box.x1);
  const dy = Math.max(box.y0 - point.y, 0, point.y - box.y1);
  const dz = Math.max(box.z0 - point.z, 0, point.z - box.z1);
  return Math.hypot(dx, dy, dz);
}
