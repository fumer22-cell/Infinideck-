/** Tiny 8-bit synth. All sounds are generated; no audio files. */
let ctx: AudioContext | null = null;
let muted = false;
export function setMuted(m: boolean) {
  muted = m;
}

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.08, when = 0, slideTo?: number) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.08, when = 0) {
  const a = ac();
  if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  const g = a.createGain();
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(g).connect(a.destination);
  src.start(a.currentTime + when);
}

export const sfx = {
  tap: () => tone(660, 0.05, 'square', 0.04),
  flip: () => {
    tone(440, 0.06, 'triangle', 0.08);
    tone(880, 0.08, 'triangle', 0.06, 0.05);
  },
  hit: () => {
    noise(0.12, 0.12);
    tone(180, 0.12, 'square', 0.08, 0, 60);
  },
  crit: () => {
    noise(0.2, 0.16);
    tone(300, 0.2, 'sawtooth', 0.08, 0, 50);
    tone(900, 0.1, 'square', 0.05, 0.05);
  },
  miss: () => tone(220, 0.25, 'triangle', 0.1, 0, 110),
  hurt: () => {
    noise(0.15, 0.14);
    tone(120, 0.2, 'sawtooth', 0.08, 0, 50);
  },
  heal: () => [523, 659, 784].forEach((f, i) => tone(f, 0.12, 'triangle', 0.07, i * 0.07)),
  shield: () => tone(300, 0.15, 'square', 0.06, 0, 600),
  coin: () => {
    tone(988, 0.06, 'square', 0.05);
    tone(1319, 0.15, 'square', 0.05, 0.06);
  },
  kill: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.1, 'square', 0.06, i * 0.06)),
  levelUp: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 5 ? 0.4 : 0.14, 'square', 0.07, i * 0.12)),
  death: () => [330, 311, 294, 262, 196].forEach((f, i) => tone(f, 0.35, 'triangle', 0.1, i * 0.3)),
  victory: () => [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'square', 0.06, i * 0.13)),
  boss: () => [110, 104, 98, 92].forEach((f, i) => tone(f, 0.4, 'sawtooth', 0.07, i * 0.25)),
  poison: () => tone(200, 0.2, 'sawtooth', 0.05, 0, 400),
};
