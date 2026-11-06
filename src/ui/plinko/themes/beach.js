// 바닷가: the balls fall over a sandy beach. Pegs are sand dollars, bumpers orange starfish, the
// side walls breakwaters of round stones, the floor driftwood and the slots beach towels.
// Cloud shadows and seagulls pass over, and foam bubbles drift by.
import { bumperBase, bumperSpring, cloudShadows, drifters, driftPos, pegBase, puffRows, wallBump } from './art.js';

const CORAL = '#ff8a4c';
const INK = 'rgba(150, 110, 60, 0.55)';
const WALL = { dark: '#71858f', base: '#97a9b1', light: '#c3d1d6', outline: 'rgba(62, 80, 90, 0.8)', shadow: 'rgba(60, 50, 30, 0.35)' };

function shell(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x, y + s);
  ctx.arc(x, y + s, s * 1.6, -Math.PI * 0.8, -Math.PI * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function gull(ctx, x, y, flap) {
  const lift = 4 + 3 * Math.sin(flap);
  ctx.strokeStyle = 'rgba(70, 80, 95, 0.75)';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 12, y - lift);
  ctx.quadraticCurveTo(x - 6, y - lift - 4, x, y);
  ctx.quadraticCurveTo(x + 6, y - lift - 4, x + 12, y - lift);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function starPath(ctx, x, y, r, inner, turn, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = turn + (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const d = i % 2 === 0 ? r : r * inner;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    else ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.closePath();
}

const foam = drifters(14, 23);
const gulls = [
  { speed: 40, y: 0.18, sway: 18, phase: 0 },
  { speed: 31, y: 0.62, sway: 24, phase: 2.4 },
];

export const beach = {
  id: 'beach',
  name: '바닷가',
  icon: '🏖️',
  glow: CORAL,
  pegShadow: 'rgba(120, 90, 40, 0.2)',
  dropLine: 'rgba(150, 110, 60, 0.35)',
  wood: { fill: '#cdb08a', ink: '#8a6c48' },
  wall: WALL,
  poke: ['#ffffff', '#bfe9f5'],

  // Sand with ripples the tide left, scattered shells and pebbles, and glints.
  tile(ctx, rnd, wrapped, size) {
    ctx.fillStyle = '#f3e1b6';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 12; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 70 + rnd() * 100;
      wrapped(x, y, r, (px, py) => {
        const g = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, 'rgba(255, 246, 222, 0.6)');
        g.addColorStop(1, 'rgba(255, 246, 222, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - r, py - r, r * 2, r * 2);
      });
    }
    ctx.strokeStyle = 'rgba(190, 150, 95, 0.28)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const len = 20 + rnd() * 30;
      wrapped(x, y, len, (px, py) => {
        ctx.beginPath();
        ctx.moveTo(px - len, py);
        ctx.quadraticCurveTo(px, py - 6, px + len, py);
        ctx.stroke();
      });
    }
    ctx.lineCap = 'butt';
    const shells = ['#ffffff', '#ffd9cc', '#f7c6d9', '#ffe9b8'];
    for (let i = 0; i < 22; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const s = 2 + rnd() * 1.4;
      wrapped(x, y, 8, (px, py) => shell(ctx, px, py, s, shells[i % shells.length]));
    }
    for (let i = 0; i < 40; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 1.5 + rnd() * 2;
      ctx.fillStyle = ['rgba(170, 150, 130, 0.5)', 'rgba(140, 150, 160, 0.45)'][i % 2];
      wrapped(x, y, 4, (px, py) => {
        ctx.beginPath();
        ctx.ellipse(px, py, r, r * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    for (let i = 0; i < 70; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 0.9 + rnd();
      wrapped(x, y, 3, (px, py) => {
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  },

  weather(ctx, { t, still, width, height, board, boardSpace, screenSpace }) {
    boardSpace();
    cloudShadows(ctx, t, board, 'rgba(120, 90, 50, 0.09)');
    if (still) return;
    screenSpace();
    for (const b of foam) {
      const { x, y } = driftPos(b, t, width, height, 0.7, -0.35);
      const r = 2.5 + b.size * 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillStyle = 'rgba(200, 236, 248, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    for (const g of gulls) {
      const x = ((t * g.speed + g.phase * 220) % (width + 80)) - 40;
      const y = height * g.y + Math.sin(t * 0.7 + g.phase) * g.sway;
      gull(ctx, x, y, t * 6 + g.phase);
    }
  },

  // A peg is a sand dollar: a pale disc with a five-petal print.
  peg(ctx, peg, glow) {
    const { x, y, r } = peg;
    pegBase(ctx, peg, glow, CORAL, this.pegShadow);
    ctx.fillStyle = glow > 0.3 ? '#ffd2b8' : '#fbf3e4';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const turn = x * 0.37 + y * 0.11;
    ctx.fillStyle = 'rgba(190, 150, 100, 0.55)';
    for (let i = 0; i < 5; i++) {
      const a = turn + (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, r * 0.28, r * 0.12, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  },

  // A bumper is an orange starfish, turning slowly.
  bumper(ctx, peg, since, now, glow) {
    const r = bumperSpring(ctx, peg, since, now, CORAL);
    bumperBase(ctx, peg, r, glow, CORAL, this.pegShadow);
    const turn = now * 0.4 + peg.x;
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#ff9a5c';
    ctx.strokeStyle = 'rgba(190, 80, 40, 0.85)';
    ctx.lineWidth = 2;
    starPath(ctx, peg.x, peg.y, r * 1.25, 0.45, turn);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd0a8';
    for (let i = 0; i < 5; i++) {
      const a = turn + (i / 5) * Math.PI * 2 - Math.PI / 2;
      for (const d of [0.35, 0.65]) {
        ctx.beginPath();
        ctx.arc(peg.x + Math.cos(a) * r * d, peg.y + Math.sin(a) * r * d, r * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#ffc184';
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineJoin = 'miter';
  },

  // Round stones piled up, with a shell here and there.
  wallTexture(ctx, { inner, side, top, bottom, far, w }) {
    puffRows(inner, side, top, bottom, far, 38, (x, y, step, row, col) => {
      const k = (row * 7 + col * 3) % 5;
      ctx.fillStyle = k === 0 ? WALL.light : k === 3 ? '#8a9ca5' : WALL.base;
      ctx.beginPath();
      ctx.ellipse(x, y, step * 0.6, step * 0.48, (k - 2) * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(62, 80, 90, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.ellipse(x - step * 0.18, y - step * 0.16, step * 0.16, step * 0.08, -0.4, 0, Math.PI * 2);
      ctx.fill();
    });
    let n = 0;
    for (let y = top + 60; y < bottom - 20; y += 90) {
      shell(ctx, inner + side * (18 + ((n * 41) % Math.max(1, w - 34))), y, 4, ['#ffffff', '#ffd9cc', '#ffe9b8'][n % 3]);
      n++;
    }
  },

  wallBump(ctx, peg, board, glow) {
    wallBump(ctx, peg, board, glow, WALL, (x, y) => shell(ctx, x, y, 4, '#ffd9cc'));
  },
};
