// Keyboard and mouse, and the pointer lock that turns the mouse into look.
// Plain browser APIs only. Edge-triggered actions (buy, grenade, weapon switch)
// are queued here and consumed once by main.js each frame.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = { keys, locked: false, firing: false, lookX: 0, lookY: 0, plant: false };
  const queue = [];

  function setKey(event, down) {
    if (down) keys.add(event.code);
    else keys.delete(event.code);
    if (event.code === 'Space') event.preventDefault();
    if (down && !event.repeat) {
      if (event.code === 'KeyB') queue.push({ type: 'buy' });
      if (event.code === 'KeyG' || event.code === 'Digit4') queue.push({ type: 'grenade' });
      if (event.code === 'Digit1') queue.push({ type: 'weapon', weapon: 'pistol' });
      if (event.code === 'Digit2') queue.push({ type: 'weapon', weapon: 'rifle' });
      if (event.code === 'Digit3') queue.push({ type: 'weapon', weapon: 'smg' });
    }
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => {
    keys.clear();
    state.firing = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (state.locked && event.button === 0) state.firing = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    takeQueue() {
      return queue.splice(0, queue.length);
    },
  };
}
