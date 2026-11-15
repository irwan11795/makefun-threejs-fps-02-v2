// Weapon definitions: one table owns every number the gunplay reads. Damage is
// per hit; headshots multiply by headMult. Spread is in radians of cone half-angle.
export const WEAPONS = {
  pistol: {
    id: 'pistol',
    name: 'P9 Sidearm',
    price: 0,
    auto: false,
    damage: 34,
    headMult: 2,
    mag: 12,
    reserve: 60,
    gap: 0.22,
    reload: 1.4,
    spreadStill: 0.0018,
    spreadMove: 0.02,
    kick: 0.006,
    range: 60,
  },
  rifle: {
    id: 'rifle',
    name: 'VK-7 Rifle',
    price: 2700,
    auto: true,
    damage: 33,
    headMult: 3,
    mag: 30,
    reserve: 90,
    gap: 0.096,
    reload: 1.9,
    spreadStill: 0.0022,
    spreadMove: 0.028,
    kick: 0.009,
    range: 80,
  },
  smg: {
    id: 'smg',
    name: 'KX-9 SMG',
    price: 1500,
    auto: true,
    damage: 26,
    headMult: 2,
    mag: 32,
    reserve: 96,
    gap: 0.07,
    reload: 1.6,
    spreadStill: 0.0035,
    spreadMove: 0.032,
    kick: 0.005,
    range: 50,
  },
};

export const GRENADE = {
  id: 'grenade',
  name: 'Frag Grenade',
  price: 300,
  maxCarry: 2,
  fuse: 2.2,
  radius: 5,
  damageCenter: 120,
  damageEdge: 20,
};

export const ARMOR = { name: 'Kevlar Vest', price: 650, value: 50 };

// Spread grows with movement speed and with sustained fire (bloom), so stopping
// to aim pays and spraying on the move does not.
export function spreadFor(def, speed, moveRef, bloom) {
  const moving = Math.min(1, speed / moveRef);
  return def.spreadStill + moving * def.spreadMove + bloom;
}

export function damageFor(def, headshot) {
  return headshot ? def.damage * def.headMult : def.damage;
}
