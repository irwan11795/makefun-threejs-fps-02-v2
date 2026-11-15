// Procedural WebAudio: every sound is synthesised — noise bursts and short
// tones, no audio files, no network. Guarded: if the browser has no
// AudioContext (or it throws), every method is a silent no-op. Shot mode
// disables sound entirely; M toggles mute in normal play.
export function createSound() {
  let ctx = null;
  let muted = false;
  let enabled = true;

  function ac() {
    if (!enabled || muted) return null;
    try {
      if (!ctx) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        ctx = new Ctor();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (err) {
      return null;
    }
  }

  function noiseBurst(duration, cutoff, gainValue) {
    const c = ac();
    if (!c) return;
    try {
      const length = Math.max(1, Math.floor(c.sampleRate * duration));
      const buffer = c.createBuffer(1, length, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = c.createBufferSource();
      source.buffer = buffer;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      const gain = c.createGain();
      gain.gain.value = gainValue;
      source.connect(filter).connect(gain).connect(c.destination);
      source.start();
    } catch (err) { /* silent: sound must never break the game */ }
  }

  function tone(freq, duration, gainValue, type = 'sine', when = 0) {
    const c = ac();
    if (!c) return;
    try {
      const osc = c.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const gain = c.createGain();
      const start = c.currentTime + when;
      gain.gain.setValueAtTime(gainValue, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain).connect(c.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    } catch (err) { /* silent */ }
  }

  const sound = {
    shot() { noiseBurst(0.09, 2800, 0.25); tone(95, 0.08, 0.2, 'sine'); },
    hit() { tone(1250, 0.05, 0.15, 'square'); },
    explosion() { noiseBurst(0.7, 420, 0.5); tone(55, 0.5, 0.3, 'sine'); },
    win() { tone(523, 0.16, 0.18); tone(784, 0.28, 0.18, 'sine', 0.16); },
    click() { tone(820, 0.04, 0.1, 'square'); },
    toggleMute() { muted = !muted; return muted; },
    setEnabled(value) { enabled = Boolean(value); },
    get muted() { return muted; },
  };

  try {
    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyM' && !event.repeat) sound.toggleMute();
    });
  } catch (err) { /* no window: node tests */ }

  return sound;
}
