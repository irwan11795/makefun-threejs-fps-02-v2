// Kestrel Yard's look, in one place: a dusk container yard — deep blue-grey sky,
// sodium-amber lamps, rust-red and teal containers, pale concrete. No other colour
// appears in the game code; the lighting makes every shade the scene needs.
export const PALETTE = {
  sky: '#20262e',
  surface: '#2b3138',
  concrete: '#454b54',
  rust: '#b4552d',
  teal: '#2e7f7a',
  sodium: '#ffb347',
  ink: '#ece7db',
  muted: '#8b939c',
  enemy: '#e0524d',
  friendly: '#4da3e0',
};

export function shade(name) {
  return PALETTE[name];
}
