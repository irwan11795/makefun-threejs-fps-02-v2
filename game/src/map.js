// KESTREL YARD — the map, as plain data. No three.js here: world.js builds the
// meshes from this, and the sim (bots, bullets, grenades) reads the same numbers,
// so what the player sees is exactly what the sim collides with.
//
// Layout (x east, z south; attackers spawn south, defenders north):
//   north wall z=-16 · south wall z=+16 · west wall x=-22 · east wall x=+22
//   Site A "Foundry" east, Site B "Silo" west — both north of mid.
//   Mid is split by a long rust container; two connector lanes run either side.
export const MAP = {
  name: 'Kestrel Yard',
  bounds: { x0: -22, x1: 22, z0: -16, z1: 16, wallHeight: 5 },
  // Axis-aligned boxes {x0,y0,z0,x1,y1,z1}. The floor is the y=0 plane, not a box.
  colliders: [
    // Outer walls.
    { x0: -22.4, y0: 0, z0: -16.4, x1: 22.4, y1: 5, z1: -16 },
    { x0: -22.4, y0: 0, z0: 16, x1: 22.4, y1: 5, z1: 16.4 },
    { x0: -22.4, y0: 0, z0: -16, x1: -22, y1: 5, z1: 16 },
    { x0: 22, y0: 0, z0: -16, x1: 22.4, y1: 5, z1: 16 },
    // Mid: one long rust container splitting the yard, with gaps at both ends.
    { x0: -2.5, y0: 0, z0: -3, x1: 2.5, y1: 2.6, z1: 3 },
    // Mid crates (crouch cover).
    { x0: -6, y0: 0, z0: 1, x1: -4.5, y1: 1.1, z1: 2.5 },
    { x0: 4.5, y0: 0, z0: -2.5, x1: 6, y1: 1.1, z1: -1 },
    // Lane walls: force the two connector lanes. Wall A stops short of mid so the
    // south gap is the east chokepoint; wall B leaves a north gap on the west side.
    { x0: 6, y0: 0, z0: -8, x1: 6.4, y1: 3, z1: -2 },
    { x0: -6.4, y0: 0, z0: -2, x1: -6, y1: 3, z1: 8 },
    // Site A — Foundry block + crates.
    { x0: 12, y0: 0, z0: -13, x1: 20, y1: 3.2, z1: -9 },
    { x0: 9, y0: 0, z0: -11, x1: 11, y1: 1.2, z1: -9.5 },
    { x0: 13, y0: 0, z0: -6, x1: 15, y1: 1.2, z1: -4.5 },
    // Site B — Silo block + crates.
    { x0: -20, y0: 0, z0: -13, x1: -12, y1: 3.2, z1: -9 },
    { x0: -11, y0: 0, z0: -11, x1: -9, y1: 1.2, z1: -9.5 },
    { x0: -15, y0: 0, z0: -6, x1: -13, y1: 1.2, z1: -4.5 },
    // South crates + low platform (jumpable, 0.9 high).
    { x0: 8, y0: 0, z0: 4, x1: 10, y1: 1.1, z1: 6 },
    { x0: -10, y0: 0, z0: 4, x1: -8, y1: 1.1, z1: 6 },
    { x0: 16, y0: 0, z0: 2, x1: 18, y1: 1.1, z1: 4 },
    { x0: -18, y0: 0, z0: 2, x1: -16, y1: 1.1, z1: 4 },
    { x0: 14, y0: 0, z0: 9, x1: 20, y1: 0.9, z1: 12 },
  ],
  sites: {
    A: { name: 'Foundry', center: { x: 16, z: -6.5 }, radius: 3.5 },
    B: { name: 'Silo', center: { x: -16, z: -6.5 }, radius: 3.5 },
  },
  spawns: {
    attackers: [
      { x: 0, z: 13, yaw: 0 },
      { x: -3, z: 14, yaw: 0 },
      { x: 3, z: 14, yaw: 0 },
    ],
    defenders: [
      { x: 12, z: -6.5, yaw: 0 },
      { x: 19, z: -6.5, yaw: 0 },
      { x: -12, z: -6.5, yaw: 0 },
      { x: -19, z: -6.5, yaw: 0 },
    ],
  },
  // Waypoint graph for bot movement. Nodes are walkable points; links are walkable
  // straight lines (checked by hand against the colliders above: no link crosses a
  // box, and no node sits inside one — the mid container blocks every diagonal
  // crossing, so north/south traffic goes around its ends via the side lanes).
  waypoints: [
    { id: 0, x: 0, z: 13, links: [1, 2, 3] },
    { id: 1, x: -4, z: 13, links: [0, 4, 19] },
    { id: 2, x: 4, z: 13, links: [0, 5, 20] },
    { id: 3, x: 0, z: 8, links: [0, 4, 5] },
    { id: 4, x: -4, z: 6, links: [1, 3, 7] },
    { id: 5, x: 4, z: 6, links: [2, 3, 8] },
    { id: 7, x: -4, z: -2.5, links: [4, 10] },
    { id: 8, x: 4, z: 0, links: [5, 11] },
    { id: 9, x: 0, z: -4, links: [10, 12] },
    { id: 10, x: -10, z: -4, links: [7, 9, 13, 19] },
    { id: 11, x: 10, z: -1, links: [8, 14, 20] },
    { id: 12, x: 0, z: -8, links: [9, 13] },
    { id: 13, x: -13, z: -6.5, links: [10, 12, 15] },
    { id: 14, x: 13, z: -7.5, links: [11, 16] },
    { id: 15, x: -16, z: -6.5, links: [13, 17] },
    { id: 16, x: 16, z: -6.5, links: [14, 18] },
    { id: 17, x: -18, z: -6.5, links: [15] },
    { id: 18, x: 18, z: -6.5, links: [16] },
    { id: 19, x: -12, z: 8, links: [1, 10] },
    { id: 20, x: 12, z: 8, links: [2, 11] },
  ],
  // Hold spots per site: waypoint ids a defender rotates between while holding.
  holds: { A: [14, 16, 18, 11], B: [13, 15, 17, 10] },
};
