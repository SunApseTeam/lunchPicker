const PENTATONIC = [0, 2, 4, 7, 9];
const MIN_GAP = { peg: 0.018, bumper: 0.05, divider: 0.04, floor: 0.05, wall: 0.06, ball: 0.04, slotBounce: 0.1 };

function noteFreq(step) {
  const octave = Math.floor(step / PENTATONIC.length);
  const semis = PENTATONIC[step % PENTATONIC.length] + 12 * octave;
  return 392 * 2 ** (semis / 12);
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let noise = null;
  let muted = false;
  const lastAt = {};

  function ensure() {
    if (ctx) return;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  function voice(type, freq, gain, decay, at = ctx.currentTime, pan = 0, sweepTo = null) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const panner = ctx.createStereoPanner();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, at + decay);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(gain, at + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    panner.pan.value = pan;
    osc.connect(amp).connect(panner).connect(master);
    osc.start(at);
    osc.stop(at + decay + 0.02);
  }

  function thump(freq, gain, decay, pan) {
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    const panner = ctx.createStereoPanner();
    src.buffer = noise;
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 1.4;
    const at = ctx.currentTime;
    amp.gain.setValueAtTime(gain, at);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    panner.pan.value = pan;
    src.connect(filter).connect(amp).connect(panner).connect(master);
    src.start(at);
    src.stop(at + decay + 0.02);
  }

  return {
    unlock() {
      ensure();
      if (ctx.state === 'suspended') ctx.resume();
    },
    setMuted(value) {
      muted = value;
    },
    get muted() {
      return muted;
    },
    hit(kind, strength, x, boardWidth) {
      if (muted || !ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      if (now - (lastAt[kind] ?? 0) < MIN_GAP[kind]) return;
      lastAt[kind] = now;
      const pan = (x / boardWidth) * 1.6 - 0.8;
      const loud = Math.min(1, strength / 1400);
      if (kind === 'peg') {
        const step = Math.round((1 - x / boardWidth) * 9);
        voice('triangle', noteFreq(step), 0.05 + 0.18 * loud, 0.16, now, pan);
      } else if (kind === 'bumper') {
        voice('sine', 720, 0.35, 0.28, now, pan, 160);
        voice('square', 180, 0.06, 0.12, now, pan);
      } else if (kind === 'slotBounce') {
        voice('sine', 260, 0.4, 0.4, now, pan, 900);
        voice('triangle', 130, 0.12, 0.25, now, pan, 300);
      } else if (kind === 'ball') {
        voice('sine', 1700 + Math.random() * 300, 0.08 + 0.12 * loud, 0.05, now, pan);
      } else if (kind === 'wall') {
        thump(900, 0.12 * loud, 0.06, pan);
      } else {
        thump(kind === 'floor' ? 260 : 520, 0.1 + 0.3 * loud, 0.09, pan);
      }
    },
    settle(x, boardWidth) {
      if (muted || !ctx) return;
      voice('sine', 160, 0.25, 0.18, ctx.currentTime, (x / boardWidth) * 1.6 - 0.8, 90);
    },
    redrop() {
      if (muted || !ctx) return;
      voice('sawtooth', 900, 0.08, 0.35, ctx.currentTime, 0, 140);
    },
    win(count) {
      if (muted || !ctx) return;
      const at = ctx.currentTime + 0.05;
      [0, 2, 4, 5, 7].forEach((step, i) => {
        voice('triangle', noteFreq(step + 5), 0.18, 0.5, at + i * 0.09);
        voice('sine', noteFreq(step + 10), 0.07, 0.4, at + i * 0.09);
      });
      voice('triangle', noteFreq(15), 0.22, 1.1, at + 0.5);
      if (count > 1) voice('triangle', noteFreq(17), 0.16, 1.1, at + 0.62);
    },
  };
}
