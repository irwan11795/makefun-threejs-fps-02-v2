// Round economy: what a kill, a win and a loss pay, and what the buy menu sells.
// One table, one rule each — the sim calls these, the HUD reads the same numbers.
import { WEAPONS, GRENADE, ARMOR } from './weapons.js';

export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  assistReward: 150,
  winReward: 3250,
  lossReward: 1900,
  lossStreakBonus: 500,
  maxLossReward: 2900,
  maxRounds: 9,
  winRounds: 5,
  buySeconds: 12,
  roundSeconds: 100,
  plantSeconds: 3,
  defuseSeconds: 5,
  fuseSeconds: 40,
};

export const SHOP = [
  { id: 'rifle', name: WEAPONS.rifle.name, price: WEAPONS.rifle.price, key: '1', desc: 'Full-auto rifle · 33 dmg · 30-round mag' },
  { id: 'smg', name: WEAPONS.smg.name, price: WEAPONS.smg.price, key: '2', desc: 'Fast SMG · 26 dmg · 32-round mag' },
  { id: 'grenade', name: GRENADE.name, price: GRENADE.price, key: '3', desc: 'Frag grenade · 120 dmg at the centre' },
  { id: 'armor', name: ARMOR.name, price: ARMOR.price, key: '4', desc: 'Halves damage until 50 armour is gone' },
  { id: 'ammo', name: 'Reserve ammo', price: 200, key: '5', desc: 'Refill the reserve of the held weapon' },
];

export function lossRewardFor(streak) {
  return Math.min(ECONOMY.maxLossReward, ECONOMY.lossReward + ECONOMY.lossStreakBonus * Math.max(0, streak - 1));
}
