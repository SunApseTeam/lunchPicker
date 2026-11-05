// 밤하늘: the balls fall through a starry night. Pegs are little glowing stars, bumpers ringed
// planets, the side walls night clouds, the floor a moonlit rail and the slots soft rugs.
// Stars twinkle, fireflies wander and now and then a shooting star crosses.
import { bumperBase, bumperSpring, drifters, driftPos, pegBase, puffRows, wallBump } from './art.js';

const GOLD = '#ffd76a';
const WALL = { dark: '#2c3468', base: '#3d4784', light: '#5b66a8', outline: 'rgba(170, 180, 240, 0.7)', shadow: 'rgba(5, 8, 30, 0.5)' };

function sparkle(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

const fireflies = drifters(18, 41);
const twinkles = drifters(24, 43);

export const night = {
  id: 'night',
  name: '밤하늘',
  icon: '🌙',
  glow: GOLD,
  pegShadow: 'rgba(0, 0, 20, 0.3)',
  dropLine: 'rgba(200, 210, 255, 0.35)',
  wood: { fill: '#8f80c4', ink: '#4c3f86' },
  wall: WALL,
  poke: ['#fff3c4', '#b9c4ff'],
  trigger: { cap: '#ff5c8a', rim: '#a3264f', glow: '#ffb3c8' },

  // Deep blue with faint nebulae and a field of stars.
  tile(ctx, rnd, wrapped, size) {
    ctx.fillStyle = '#1f2753';
    ctx.fillRect(0, 0, size, size);
    const glows = ['rgba(130, 110, 210, 0.22)', 'rgba(80, 150, 210, 0.16)', 'rgba(210, 120, 190, 0.12)'];
    for (let i = 0; i < 10; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 90 + rnd() * 140;
      const c = glows[i % glows.length];
      wrapped(x, y, r, (px, py) => {
        const g = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, c);
        g.addColorStop(1, c.replace(/[\d.]+\)$/, '0)'));
        ctx.fillStyle = g;
        ctx.fillRect(px - r, py - r, r * 2, r * 2);
      });
    }
    for (let i = 0; i < 220; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 0.5 + rnd() * rnd() * 1.8;
      ctx.fillStyle = `rgba(255, 255, ${220 + Math.round(rnd() * 35)}, ${0.35 + rnd() * 0.6})`;
      wrapped(x, y, 3, (px, py) => {
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    for (let i = 0; i < 14; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 3 + rnd() * 3;
      wrapped(x, y, 8, (px, py) => sparkle(ctx, px, py, r, 'rgba(255, 246, 200, 0.7)'));
    }
  },

  weather(ctx, { t, still, width, height, screenSpace }) {
    if (still) return;
    screenSpace();
    for (const s of twinkles) {
      const a = 0.5 + 0.5 * Math.sin(t * (1.5 + s.speed * 0.05) + s.spin);
      sparkle(ctx, s.x * width, s.y * height, 2 + 4 * a * (0.5 + s.size), `rgba(255, 248, 210, ${0.25 + 0.6 * a})`);
    }
    for (const f of fireflies) {
      const { x, y } = driftPos(f, t * 0.5, width, height, Math.sin(f.spin) > 0 ? 1 : -1, -0.3);
      const wob = Math.sin(t * 2 + f.spin) * 8;
      const on = 0.4 + 0.6 * Math.max(0, Math.sin(t * 2.4 + f.spin * 3));
      const g = ctx.createRadialGradient(x + wob, y, 0, x + wob, y, 9);
      g.addColorStop(0, `rgba(255, 240, 150, ${0.9 * on})`);
      g.addColorStop(1, 'rgba(255, 240, 150, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x + wob, y, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    // A shooting star every eight seconds, crossing the upper sky in under a second.
    const cycle = t % 8;
    if (cycle < 0.9) {
      const k = cycle / 0.9;
      const n = Math.floor(t / 8);
      const sx = width * (0.15 + ((n * 0.37) % 0.6));
      const sy = height * (0.08 + ((n * 0.23) % 0.25));
      const x = sx + k * 260;
      const y = sy + k * 120;
      const g = ctx.createLinearGradient(x - 90, y - 42, x, y);
      g.addColorStop(0, 'rgba(255, 255, 255, 0)');
      g.addColorStop(1, `rgba(255, 255, 255, ${0.9 * (1 - k)})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 90, y - 42);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
  },

  // A peg is a small glowing star-orb.
  peg(ctx, peg, glow) {
    const { x, y, r } = peg;
    pegBase(ctx, peg, glow, GOLD, this.pegShadow);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
    g.addColorStop(0, 'rgba(255, 236, 160, 0.45)');
    g.addColorStop(1, 'rgba(255, 236, 160, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = glow > 0.3 ? '#ffe9a0' : '#fff6d6';
    ctx.strokeStyle = 'rgba(200, 160, 60, 0.8)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((x * 0.37 + y * 0.11) * 0.2);
    sparkle(ctx, 0, 0, r * 0.75, '#ffcf4a');
    ctx.restore();
  },

  // A bumper is a little ringed planet, its ring tilting as it turns.
  bumper(ctx, peg, since, now, glow) {
    const r = bumperSpring(ctx, peg, since, now, GOLD);
    bumperBase(ctx, peg, r, glow, GOLD, this.pegShadow);
    const tilt = -0.4 + 0.15 * Math.sin(now * 0.8 + peg.x);
    const ring = () => {
      ctx.beginPath();
      ctx.ellipse(peg.x, peg.y, r * 1.55, r * 0.42, tilt, 0, Math.PI * 2);
    };
    ctx.strokeStyle = '#ffd98a';
    ctx.lineWidth = 3.5;
    ctx.save();
    ctx.beginPath();
    ctx.rect(peg.x - r * 2, peg.y - r * 2, r * 4, r * 2);
    ctx.clip();
    ring();
    ctx.stroke();
    ctx.restore();
    const body = ctx.createRadialGradient(peg.x - r * 0.35, peg.y - r * 0.4, r * 0.1, peg.x, peg.y, r);
    body.addColorStop(0, '#ffc3d9');
    body.addColorStop(1, '#a979e0');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70, 40, 130, 0.7)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(peg.x, peg.y + r * 0.2, r * 0.8, r * 0.2, tilt, 0, Math.PI);
    ctx.stroke();
    ctx.strokeStyle = '#ffd98a';
    ctx.lineWidth = 3.5;
    ctx.save();
    ctx.beginPath();
    ctx.rect(peg.x - r * 2, peg.y, r * 4, r * 2);
    ctx.clip();
    ring();
    ctx.stroke();
    ctx.restore();
  },

  // Night clouds, with a star or two caught in them.
  wallTexture(ctx, { inner, side, top, bottom, far, w }) {
    puffRows(inner, side, top, bottom, far, 36, (x, y, step, row) => {
      ctx.fillStyle = (row + Math.round(x / step)) % 3 === 0 ? WALL.light : WALL.base;
      ctx.beginPath();
      ctx.arc(x, y, step * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(170, 180, 240, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, step * 0.6, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    });
    let n = 0;
    for (let y = top + 50; y < bottom - 20; y += 80) {
      sparkle(ctx, inner + side * (16 + ((n * 37) % Math.max(1, w - 30))), y, 5, 'rgba(255, 240, 180, 0.85)');
      n++;
    }
  },

  wallBump(ctx, peg, board, glow) {
    wallBump(ctx, peg, board, glow, WALL, (x, y) => sparkle(ctx, x, y, 5, 'rgba(255, 240, 180, 0.9)'));
  },
};
