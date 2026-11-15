// Yard props: barrels, pallets, sandbag lines, a crane silhouette at the
// yard edge, fence posts on the outer walls, scattered crates. Visual only —
// none of these collide, so the sim (map.js) and the seen map never disagree
// about where a player can walk. Fixed positions, no randomness.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

function mat(color, roughness = 0.85) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, metalness: 0.15 });
}

export function createProps(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const rust = mat(PALETTE.rust, 0.7);
  const teal = mat(PALETTE.teal, 0.7);
  const dark = mat(PALETTE.surface, 0.9);
  const wood = mat('#6d5136', 0.95);
  const sand = mat('#8a7a5c', 1);

  function add(mesh, x, y, z, ry = 0) {
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // Oil barrels, in two clusters near the walls.
  const barrelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.9, 14);
  for (const [x, z, m] of [
    [-20.5, 12, rust], [-19.7, 12.4, teal], [-20.2, 13.2, rust],
    [20.5, 12, teal], [19.7, 12.5, rust], [20.2, 13.1, teal],
    [-21, -14.5, rust], [21, -14.5, teal],
  ]) add(new THREE.Mesh(barrelGeo, m), x, 0.45, z);

  // Pallets: flat slatted boxes by the lanes.
  const palletGeo = new THREE.BoxGeometry(1.2, 0.12, 1);
  for (const [x, z, ry] of [[-8.5, 10.5, 0.3], [8.5, -10.5, -0.2], [-14, 12.5, 0.9], [14, 12.5, 0.1]]) {
    add(new THREE.Mesh(palletGeo, wood), x, 0.06, z, ry);
  }

  // Sandbag lines guarding the mid-lane mouths: two rows, two high.
  const bagGeo = new THREE.BoxGeometry(0.62, 0.24, 0.4);
  for (const [cx, cz, along] of [[-3.6, 4.4, 'x'], [3.6, -4.4, 'x']]) {
    for (let i = -2; i <= 2; i += 1) {
      for (let row = 0; row < 2; row += 1) {
        const x = along === 'x' ? cx + i * 0.65 : cx;
        const z = along === 'x' ? cz : cz + i * 0.65;
        add(new THREE.Mesh(bagGeo, sand), x, 0.12 + row * 0.24, z, along === 'x' ? 0 : Math.PI / 2);
      }
    }
  }

  // Scattered crates in the open, clear of the waypoint lanes.
  const crateGeo = new THREE.BoxGeometry(0.85, 0.85, 0.85);
  for (const [x, z, ry, m] of [
    [-8, -13.5, 0.2, wood], [8, -13.5, -0.4, wood], [-19, 0, 0.7, wood],
    [19, 0, -0.3, wood], [0, -12.5, 0.1, wood], [-12.5, 13.8, 0.5, wood],
  ]) add(new THREE.Mesh(crateGeo, m), x, 0.43, z, ry);

  // Crane silhouette beyond the north-east wall: dark truss tower + jib,
  // tall enough to read over the wall from anywhere in the yard.
  const crane = new THREE.Group();
  const towerGeo = new THREE.BoxGeometry(1.1, 17, 1.1);
  const tower = new THREE.Mesh(towerGeo, dark);
  tower.position.y = 8.5;
  const jib = new THREE.Mesh(new THREE.BoxGeometry(13, 0.7, 0.7), dark);
  jib.position.set(4.5, 16.6, 0);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(4, 0.9, 0.9), dark);
  counter.position.set(-3.2, 16.4, 0);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.4), dark);
  cab.position.set(0.6, 15.4, 0);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.5, 0.12), dark);
  hook.position.set(9.5, 14, 0);
  const load = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 1.4), rust);
  load.position.set(9.5, 11.4, 0);
  crane.add(tower, jib, counter, cab, hook, load);
  crane.position.set(28, 0, -20);
  crane.rotation.y = -0.5;
  group.add(crane);

  // Fence posts + top rail along the north wall, chain-link silhouette.
  const postGeo = new THREE.BoxGeometry(0.1, 1.6, 0.1);
  for (let x = -21; x <= 21; x += 3) {
    add(new THREE.Mesh(postGeo, dark), x, 5.8, -16.2);
  }
  add(new THREE.Mesh(new THREE.BoxGeometry(44, 0.08, 0.08), dark), 0, 6.55, -16.2);

  return { group };
}
