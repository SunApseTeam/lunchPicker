// 눈밭: the balls fall over a snowfield while it snows. Pegs are ice discs with a snowflake,
// bumpers peppermint candies, the side walls snowbanks with holly berries, the floor a sled rail
// and the slots woolly blankets.
import { bumperBase, bumperSpring, cloudShadows, drifters, driftPos, pegBase, puffRows, wallBump } from './art.js';

const RED = '#ff5a6e';
const ICE_INK = 'rgba(90, 125, 170, 0.7)';
const WALL = { dark: '#a9bfd9', base: '#fbfdff', light: '#ffffff', outline: 'rgba(110, 140, 180, 0.85)', shadow: 'rgba(70, 100, 140, 0.3)' };

function flake(ctx, x, y, r) {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const ex = x + Math.cos(a) * r;
    const ey = y + Math.sin(a) * r;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    for (const s of [-1, 1]) {
      const bx = x + Math.cos(a) * r * 0.55;
      const by = y + Math.sin(a) * r * 0.55;
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(a + s * 0.8) * r * 0.3, by + Math.sin(a + s * 0.8) * r * 0.3);
    }
    ctx.stroke();
  }
}

function berries(ctx, x, y) {
  ctx.fillStyle = '#4f8f5a';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + s * 6, y - 2, 6, 3, s * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#e8394f';
  for (const [dx, dy] of [[-2, 2], [2, 2], [0, -1]]) {
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

const snow = drifters(60, 31);

export const snowfield = {
  id: 'snow',
  name: '눈밭',
  icon: '❄️',
  glow: RED,
  pegShadow: 'rgba(80, 110, 150, 0.18)',
  dropLine: 'rgba(110, 140, 180, 0.4)',
  wood: { fill: '#b98a62', ink: '#7d5638' },
  wall: WALL,
  poke: ['#ffffff', '#cfe3ff'],
  trigger: { cap: '#59b7ff', rim: '#2a6fb0', glow: '#cfe9ff' },

  // Snow with soft blue drifts, wind ridges and sparkles.
  tile(ctx, rnd, wrapped, size) {
    ctx.fillStyle = '#e9f0f8';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 14; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 70 + rnd() * 110;
      const light = i % 2 === 0;
      wrapped(x, y, r, (px, py) => {
        const g = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, light ? 'rgba(255, 255, 255, 0.8)' : 'rgba(196, 213, 236, 0.45)');
        g.addColorStop(1, light ? 'rgba(255, 255, 255, 0)' : 'rgba(196, 213, 236, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - r, py - r, r * 2, r * 2);
      });
    }
    ctx.strokeStyle = 'rgba(150, 175, 210, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < 50; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const len = 14 + rnd() * 26;
      wrapped(x, y, len, (px, py) => {
        ctx.beginPath();
        ctx.moveTo(px - len, py + 3);
        ctx.quadraticCurveTo(px, py - 5, px + len, py + 3);
        ctx.stroke();
      });
    }
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(150, 180, 220, 0.5)';
    ctx.lineWidth = 0.9;
    for (let i = 0; i < 18; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 3 + rnd() * 2;
      wrapped(x, y, 8, (px, py) => flake(ctx, px, py, r));
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    for (let i = 0; i < 110; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 0.9 + rnd() * 1.3;
      wrapped(x, y, 3, (px, py) => {
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  },

  weather(ctx, { t, still, width, height, board, boardSpace, screenSpace }) {
    boardSpace();
    cloudShadows(ctx, t, board, 'rgba(90, 120, 170, 0.10)');
    if (still) return;
    screenSpace();
    for (const s of snow) {
      const { x, y } = driftPos(s, t, width, height, 0.25 + 0.3 * Math.sin(t * 0.5 + s.spin), 1.4);
      const r = 1.5 + s.size * 3;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.6 + 0.35 * s.pick})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  // A peg is a disc of ice with a snowflake on it.
  peg(ctx, peg, glow) {
    const { x, y, r } = peg;
    pegBase(ctx, peg, glow, RED, this.pegShadow);
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, glow > 0.3 ? '#ffd0d6' : '#cfe2f7');
    ctx.fillStyle = g;
    ctx.strokeStyle = ICE_INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(80, 130, 190, 0.75)';
    ctx.lineWidth = 1.3;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(x * 0.37 + y * 0.11);
    flake(ctx, 0, 0, r * 0.68);
    ctx.restore();
  },

  // A bumper is a peppermint candy: red and white swirls, turning.
  bumper(ctx, peg, since, now, glow) {
    const r = bumperSpring(ctx, peg, since, now, RED);
    bumperBase(ctx, peg, r, glow, RED, this.pegShadow);
    const turn = now * 0.8 + peg.x;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ef3b53';
    for (let i = 0; i < 6; i++) {
      const a = turn + (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(peg.x, peg.y);
      ctx.arc(peg.x, peg.y, r, a, a + Math.PI / 6);
      ctx.quadraticCurveTo(peg.x + Math.cos(a + 0.9) * r * 0.5, peg.y + Math.sin(a + 0.9) * r * 0.5, peg.x, peg.y);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(160, 30, 50, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.ellipse(peg.x - r * 0.35, peg.y - r * 0.4, r * 0.3, r * 0.15, -0.6, 0, Math.PI * 2);
    ctx.fill();
  },

  // Heaped snow, with holly berries peeking out.
  wallTexture(ctx, { inner, side, top, bottom, far, w }) {
    puffRows(inner, side, top, bottom, far, 36, (x, y, step, row) => {
      ctx.fillStyle = (row + Math.round(x / step)) % 3 === 0 ? '#dbe7f5' : WALL.base;
      ctx.beginPath();
      ctx.arc(x, y, step * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(110, 145, 190, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, step * 0.6, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    });
    let n = 0;
    for (let y = top + 70; y < bottom - 20; y += 110) {
      berries(ctx, inner + side * (18 + ((n * 43) % Math.max(1, w - 34))), y);
      n++;
    }
  },

  wallBump(ctx, peg, board, glow) {
    wallBump(ctx, peg, board, glow, WALL, (x, y) => berries(ctx, x, y));
  },
};
