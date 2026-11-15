// The weapon the player sees: one view model per weapon, a muzzle flash, and the
// kick and reload motion. It owns no numbers — the sim owns ammo, cooldowns and
// spread; this only shows them. Switching swaps the model in the player's hands.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MODELS = {
  pistol: { receiver: [0.07, 0.09, 0.26], barrel: [0.04, 0.04, 0.14], grip: [0.06, 0.12, 0.08], offset: [0.22, -0.2, -0.38] },
  rifle: { receiver: [0.09, 0.1, 0.42], barrel: [0.045, 0.045, 0.4], grip: [0.075, 0.08, 0.22], offset: [0.26, -0.23, -0.52] },
  smg: { receiver: [0.08, 0.09, 0.3], barrel: [0.05, 0.05, 0.22], grip: [0.07, 0.09, 0.18], offset: [0.24, -0.19, -0.38] },
};

export function createWeaponView(camera) {
  const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sodium), roughness: 0.5, metalness: 0.2 });
  const polymerMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8a6b45'), roughness: 0.85, metalness: 0.05 });

  const models = {};
  for (const [id, spec] of Object.entries(MODELS)) {
    const model = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(...spec.receiver), bodyMat);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(...spec.barrel), gripMat);
    barrel.position.set(0, 0.025, -(spec.receiver[2] / 2 + spec.barrel[2] / 2 - 0.04));
    const stock = new THREE.Mesh(new THREE.BoxGeometry(...spec.grip), gripMat);
    stock.position.set(0, -0.02, spec.receiver[2] / 2 + 0.04);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06), accentMat);
    sight.position.set(0, spec.receiver[1] / 2 + 0.02, -0.05);
    model.add(receiver, barrel, stock, sight);
    model.position.set(...spec.offset);
    model.visible = false;
    camera.add(model);
    models[id] = model;
  }

  // Rifle, rebuilt as a recognisable rifle instead of a beige box: a dark
  // metal receiver, a tan polymer handguard over the barrel, a curved
  // magazine, a stock, a pistol grip, and front + rear sights.
  const rifle = models.rifle;
  rifle.clear();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.42), bodyMat);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.34), gripMat);
  barrel.position.set(0, 0.03, -0.36);
  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.24), polymerMat);
  handguard.position.set(0, 0.01, -0.26);
  const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.17, 0.1), polymerMat);
  magazine.position.set(0, -0.12, -0.02);
  magazine.rotation.x = 0.28;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.2), polymerMat);
  stock.position.set(0, -0.01, 0.3);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.08), polymerMat);
  grip.position.set(0, -0.1, 0.12);
  grip.rotation.x = 0.35;
  const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.03), accentMat);
  frontSight.position.set(0, 0.085, -0.48);
  const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.05), accentMat);
  rearSight.position.set(0, 0.075, 0.05);
  rifle.add(receiver, barrel, handguard, magazine, stock, grip, frontSight, rearSight);
  // Smaller and further forward than v1: at the old offset the stock sat
  // 12 cm from the camera and filled the frame — and hid the muzzle flash.
  rifle.scale.setScalar(0.85);

  // The grenade in hand: a small dark sphere with a pin.
  const grenade = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), gripMat);
  const pin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), accentMat);
  pin.position.set(0.06, 0.05, 0);
  grenade.add(shell, pin);
  grenade.position.set(0.24, -0.2, -0.4);
  grenade.visible = false;
  camera.add(grenade);

  // Small on purpose: at 1 m from the camera a 0.32 m plane subtends ~200 px
  // and reads as a wall, not a flash. 0.16 m is a bright star at the muzzle.
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0'), transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.26, -0.21, -1.0);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.sodium), 0, 5);
  flashLight.position.set(0.26, -0.19, -0.7);
  camera.add(flashLight);

  let current = 'pistol';
  let flashLeft = 0;
  let kick = 0;
  let reloadDip = 0;
  models.pistol.visible = true;

  return {
    show(id) {
      if (current === id) return;
      models[current].visible = false;
      grenade.visible = false;
      current = id;
      if (id === 'grenade') grenade.visible = true;
      else models[id].visible = true;
    },
    fire() {
      flashLeft = 0.05; // ~50 ms: one bright frame, then gone
      kick = 0.055;
    },
    setReload(fraction) {
      reloadDip = fraction;
    },
    step(dt) {
      flashLeft = Math.max(0, flashLeft - dt);
      kick += (0 - kick) * Math.min(1, dt * 14);
      const model = current === 'grenade' ? grenade : models[current];
      const base = MODELS[current] ? MODELS[current].offset[2] : -0.4;
      model.position.z = base + kick;
      model.rotation.x = kick * 2.2 - reloadDip * 0.55;
      flash.visible = flashLeft > 0;
      flash.rotation.z = flashLeft * 30;
      flashLight.intensity = flashLeft > 0 ? 26 : 0;
    },
  };
}
