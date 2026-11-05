// 잔디밭: the balls fall through a meadow. Pegs are little white flowers, bumpers pink blossoms,
// the side walls hedges, the floor a fence and the slots picnic mats. Overhead, cloud shadows
// drift by, with petals blowing about and two butterflies.
import { bumperBase, bumperSpring, cloudShadows, drifters, driftPos, pegBase, puffRows, wallBump } from './art.js';

const PINK = '#ff4d7d';
const PETAL_INK = 'rgba(120, 110, 80, 0.6)';
const GROUND_INK = 'rgba(96, 128, 72, 0.45)';
const WALL = { dark: '#679c4b', base: '#8cc46c', light: '#a9d88a', outline: 'rgba(80, 110, 58, 0.8)', shadow: 'rgba(40, 70, 28, 0.35)' };

function tinyFlower(ctx, x, y, p, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = PETAL_INK;
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * p * 0.8, y + Math.sin(a) * p * 0.8, p * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#ffd75e';
  ctx.beginPath();
  ctx.arc(x, y, p * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

function tuft(ctx, x, y, s) {
  ctx.strokeStyle = GROUND_INK;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (const [dx, lean] of [[-3, -0.5], [0, 0.1], [3, 0.6]]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * s, y);
    ctx.quadraticCurveTo(x + dx * s + lean * 2 * s, y - 4 * s, x + dx * s + lean * 4 * s, y - 7 * s);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

function speck(ctx, x, y, petal, color) {
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * petal, y + Math.sin(a) * petal, petal * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffe28a';
  ctx.beginPath();
  ctx.arc(x, y, petal * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function butterfly(ctx, x, y, flap, tint) {
  const w = 9 * (0.35 + 0.65 * Math.abs(Math.sin(flap)));
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(150, 120, 40, 0.8)';
  ctx.fillStyle = tint;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + side * w * 0.6, y - 3, w * 0.62, 6, side * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x + side * w * 0.45, y + 4, w * 0.42, 4, -side * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(90, 80, 50, 0.9)';
  ctx.beginPath();
  ctx.moveTo(x, y - 6);
  ctx.lineTo(x, y + 7);
  ctx.stroke();
}

const petals = drifters(16, 11);
const flyers = [
  { speed: 34, y: 0.22, sway: 26, tint: '#fff1a6', phase: 0 },
  { speed: 26, y: 0.7, sway: 34, tint: '#fbd3e6', phase: 3.1 },
];

export const meadow = {
  id: 'meadow',
  name: '잔디밭',
  icon: '🌿',
  glow: PINK,
  pegShadow: 'rgba(60, 90, 40, 0.18)',
  dropLine: 'rgba(80, 110, 58, 0.3)',
  wood: { fill: '#c8955f', ink: '#8a5f38' },
  wall: WALL,
  poke: ['#ffffff', '#ffc4d4'],
  trigger: { cap: '#ffcf3f', rim: '#b9791a', glow: '#ffe27a' },

  // Background flowers stay tiny and faint so they never pass for the pegs, and there are no
  // bushes, which would pass for walls.
  tile(ctx, rnd, wrapped, size) {
    ctx.fillStyle = '#d5ebb5';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 12; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 60 + rnd() * 90;
      wrapped(x, y, r, (px, py) => {
        const g = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, 'rgba(240, 250, 220, 0.55)');
        g.addColorStop(1, 'rgba(240, 250, 220, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - r, py - r, r * 2, r * 2);
      });
    }
    for (let i = 0; i < 150; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const s = 0.8 + rnd() * 0.6;
      wrapped(x, y, 12, (px, py) => tuft(ctx, px, py, s));
    }
    const colors = ['#ffffff', '#f7c6d9', '#cdb8f0', '#ffd1a8'];
    for (let i = 0; i < 26; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const p = 1.8 + rnd() * 0.8;
      wrapped(x, y, 8, (px, py) => speck(ctx, px, py, p, colors[i % colors.length]));
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    for (let i = 0; i < 80; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 1.2 + rnd() * 1.1;
      wrapped(x, y, 3, (px, py) => {
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  },

  weather(ctx, { t, still, width, height, board, boardSpace, screenSpace }) {
    boardSpace();
    cloudShadows(ctx, t, board, 'rgba(60, 96, 44, 0.10)');
    if (still) return;
    screenSpace();
    for (const p of petals) {
      const { x, y } = driftPos(p, t, width, height);
      const size = 3 + p.size * 2.5;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 1.3 + p.spin);
      ctx.fillStyle = p.pick < 0.6 ? 'rgba(255, 196, 214, 0.85)' : 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.ellipse(0, 0, size, size * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (const f of flyers) {
      const x = ((t * f.speed + f.phase * 200) % (width + 80)) - 40;
      const y = height * f.y + Math.sin(t * 0.9 + f.phase) * f.sway;
      butterfly(ctx, x, y, t * 11 + f.phase, f.tint);
    }
  },

  // A peg is a little white flower with a dark-inked rim; a knock blushes it pink for a moment.
  peg(ctx, peg, glow) {
    const { x, y, r } = peg;
    pegBase(ctx, peg, glow, PINK, this.pegShadow);
    const turn = x * 0.37 + y * 0.11;
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = PETAL_INK;
    ctx.fillStyle = glow > 0.3 ? '#ffc4d4' : '#ffffff';
    for (let i = 0; i < 5; i++) {
      const a = turn + (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75, r * 0.64, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  },

  // A bumper is a pink blossom, turning slowly.
  bumper(ctx, peg, since, now, glow) {
    const r = bumperSpring(ctx, peg, since, now, PINK);
    bumperBase(ctx, peg, r, glow, PINK, this.pegShadow);
    const turn = now * 0.4 + peg.x;
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = 'rgba(200, 70, 115, 0.75)';
    ctx.fillStyle = '#ff9bbb';
    for (let i = 0; i < 8; i++) {
      const a = turn + (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(peg.x + Math.cos(a) * r * 0.85, peg.y + Math.sin(a) * r * 0.85, r * 0.55, r * 0.36, a, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd0de';
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, r * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd75e';
    ctx.strokeStyle = PETAL_INK;
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  },

  // Leafy puffs with a few tiny flowers tucked in.
  wallTexture(ctx, { inner, side, top, bottom, far, w }) {
    puffRows(inner, side, top, bottom, far, 34, (x, y, step, row) => {
      ctx.fillStyle = (row + Math.round(x / step)) % 3 === 0 ? WALL.light : WALL.base;
      ctx.beginPath();
      ctx.arc(x, y, step * 0.58, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(80, 110, 58, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, step * 0.58, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    });
    let n = 0;
    for (let y = top + 50; y < bottom - 20; y += 70) {
      tinyFlower(ctx, inner + side * (16 + ((n * 37) % Math.max(1, w - 30))), y, 4.5, ['#ffffff', '#f7c6d9', '#cdb8f0'][n % 3]);
      n++;
    }
  },

  // A wall bump is a round bush pushing out of the hedge.
  wallBump(ctx, peg, board, glow) {
    wallBump(ctx, peg, board, glow, { ...WALL, light: '#c6eba8' }, (x, y) => tinyFlower(ctx, x, y, 4, '#ffffff'));
  },
};
