// 계곡: the balls fall in front of a waterfall in a canyon. The water pours over a rock lip at the
// top and down behind the whole board, foaming at the bottom with spray leaping up over the
// slots. The side walls are layered red rock and the floor logs. In place of pegs, vines hang from
// branches and sway in the wind; a ball that reaches a vine's tip swings on it like Tarzan (see
// vineField in domain/physics.js; drawn by ui/plinko/vines.js). Pegs and bumpers, for a board
// made under another map, are wet river stones and mossy boulders.
import { bumperBase, bumperSpring, drifters, driftPos, pegBase, wallBump } from './art.js';

const AQUA = '#1fa5b8';
const STONE_INK = 'rgba(55, 70, 85, 0.6)';
const MOSS = '#6aa84a';
const WALL = { dark: '#8a5236', base: '#b5754c', light: '#d99c6c', outline: 'rgba(90, 45, 22, 0.8)', shadow: 'rgba(30, 60, 75, 0.35)' };

// Where the water pours over the lip, in board units.
const LIP = 40;
// The falling water: curtains side by side, each a little thicker or thinner, and streaks racing
// down them, white and blue, each its own lane, length and speed.
const CURTAINS = 14;
const streaks = Array.from({ length: 150 }, (_, i) => ({
  x: (i * 0.6180339887) % 1,
  length: 140 + ((i * 37) % 180),
  speed: 1000 + ((i * 53) % 600),
  phase: (i * 0.391) % 1,
  wide: 2 + ((i * 7) % 4),
  blue: i % 4 === 0,
}));
// Spray leaping up off the pool at the bottom and falling back: where along the board, how long a
// leap takes, how fast it starts up and sideways.
const drops = Array.from({ length: 140 }, (_, i) => ({
  x: (i * 0.6180339887 + 0.3) % 1,
  period: 0.8 + ((i * 37) % 10) / 12,
  up: 450 + ((i * 53) % 9) * 50,
  side: (((i * 29) % 11) - 5) * 16,
  size: 2.5 + (i % 3) * 1.2,
}));
// The water lands this far above the slot floor, so the foam and spray show over the slots.
const SPLASH = 70;
const SPRAY_GRAVITY = 1400;
const spray = drifters(22, 29);

function moss(ctx, x, y, s) {
  ctx.fillStyle = MOSS;
  for (const [dx, dy, r] of [[-0.6, 0.1, 0.55], [0, -0.2, 0.7], [0.6, 0.1, 0.5]]) {
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(200, 235, 150, 0.7)';
  ctx.beginPath();
  ctx.arc(x - 0.2 * s, y - 0.45 * s, 0.25 * s, 0, Math.PI * 2);
  ctx.fill();
}

export const canyon = {
  id: 'canyon',
  name: '계곡',
  icon: '🏞️',
  feature: 'vines',
  glow: AQUA,
  pegShadow: 'rgba(20, 70, 90, 0.22)',
  dropLine: 'rgba(30, 90, 110, 0.3)',
  wood: { fill: '#a27b54', ink: '#6b4c30' },
  wall: WALL,
  poke: ['#ffffff', '#bfeaf3'],

  // Wet dark rock, the cliff the water falls down and the canyon around it, with moss and cracks.
  tile(ctx, rnd, wrapped, size) {
    ctx.fillStyle = '#5f7b80';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 30; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 40 + rnd() * 90;
      const dark = rnd() < 0.5;
      wrapped(x, y, r, (px, py) => {
        const g = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, dark ? 'rgba(40, 60, 65, 0.35)' : 'rgba(150, 175, 170, 0.3)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - r, py - r, r * 2, r * 2);
      });
    }
    ctx.strokeStyle = 'rgba(30, 45, 50, 0.35)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 40; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const bend = [rnd(), rnd(), rnd()].map((v) => (v - 0.5) * 30);
      wrapped(x, y, 50, (px, py) => {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + bend[0], py + 16);
        ctx.lineTo(px + bend[1], py + 32);
        ctx.lineTo(px + bend[2], py + 44);
        ctx.stroke();
      });
    }
    for (let i = 0; i < 26; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const s = 4 + rnd() * 5;
      wrapped(x, y, 12, (px, py) => moss(ctx, px, py, s));
    }
  },

  // The waterfall: curtains of water pouring over the lip and down behind the board, streaks
  // racing down them, foam churning at the bottom with spray leaping up, and mist rising. Spray
  // also drifts across the screen.
  weather(ctx, { t, still, width, height, board, boardSpace, screenSpace }) {
    boardSpace();
    const left = -10;
    const right = board.width + 10;
    const splash = board.floorY - SPLASH;
    const bottom = splash + 10;
    const step = (right - left) / CURTAINS;
    // A thin sheet everywhere, and curtains over it, each fading out at its sides so they blend.
    ctx.fillStyle = 'rgba(200, 236, 245, 0.55)';
    ctx.fillRect(left, LIP, right - left, bottom - LIP);
    for (let i = -1; i <= CURTAINS; i++) {
      const thick = 0.35 + 0.25 * Math.sin(i * 2.4) + 0.06 * Math.sin(t * 1.7 + i);
      const x0 = left + (i - 0.4) * step;
      const x1 = left + (i + 1.4) * step;
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, 'rgba(240, 252, 255, 0)');
      g.addColorStop(0.5, `rgba(240, 252, 255, ${Math.max(0, thick)})`);
      g.addColorStop(1, 'rgba(240, 252, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(Math.max(left, x0), LIP, Math.min(right, x1) - Math.max(left, x0), bottom - LIP);
    }
    // The lip: a rock edge with the water bulging over it.
    ctx.fillStyle = '#4c6368';
    ctx.fillRect(left - 40, LIP - 22, right - left + 80, 22);
    ctx.fillStyle = 'rgba(240, 252, 255, 0.9)';
    ctx.beginPath();
    ctx.moveTo(left, LIP - 6);
    for (let x = left; x <= right; x += 30) ctx.quadraticCurveTo(x + 15, LIP - 12 + 3 * Math.sin(x * 0.05 + t * 4), x + 30, LIP - 6);
    ctx.lineTo(right, LIP + 26);
    ctx.lineTo(left, LIP + 26);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, LIP, right - left, bottom - LIP);
    ctx.clip();
    const span = bottom - LIP + 320;
    ctx.lineCap = 'round';
    for (const s of streaks) {
      const x = left + s.x * (right - left);
      const y = LIP - 320 + ((s.phase * span + t * s.speed) % span);
      ctx.strokeStyle = s.blue ? 'rgba(80, 160, 190, 0.35)' : 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = s.wide;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + s.length);
      ctx.stroke();
    }
    ctx.restore();
    ctx.lineCap = 'butt';
    // Mist rising off the pool.
    for (let i = 0; i < 9; i++) {
      const rise = (t * 22 + i * 37) % 170;
      const x = ((i + 0.5) / 9) * board.width + Math.sin(t * 0.4 + i * 1.7) * 40;
      const y = splash - rise;
      const r = 120 + rise * 0.6;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255, 255, 255, ${0.35 * (1 - rise / 170)})`);
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // The pool the water lands in, under the slots.
    const pool = ctx.createLinearGradient(0, splash, 0, board.height + 120);
    pool.addColorStop(0, 'rgba(150, 215, 228, 0.95)');
    pool.addColorStop(1, 'rgba(70, 150, 170, 0.95)');
    ctx.fillStyle = pool;
    ctx.fillRect(left - 40, splash, right - left + 80, board.height + 120 - splash);
    // Foam churning where the water lands.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (let i = 0; i < 34; i++) {
      const x = left + ((i + 0.5) / 34) * (right - left) + Math.sin(t * 2 + i) * 6;
      const y = splash + Math.sin(t * 3 + i * 1.3) * 6;
      const r = 24 + 9 * Math.sin(t * 2.3 + i * 1.7);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Spray leaping up off the foam and falling back.
    for (const d of drops) {
      const tt = (t + d.x * 7.3) % d.period;
      const y = splash - (d.up * tt - 0.5 * SPRAY_GRAVITY * tt * tt);
      if (y > splash) continue;
      ctx.globalAlpha = 0.9 * (1 - tt / d.period);
      ctx.beginPath();
      ctx.arc(left + d.x * (right - left) + d.side * tt, y, d.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (still) return;
    screenSpace();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    for (const p of spray) {
      const { x, y } = driftPos(p, t, width, height, 0.6, -0.35);
      ctx.globalAlpha = 0.4 + 0.5 * p.pick;
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + p.size * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  // A peg is a wet river stone, a little flattened, with a shine on top; a knock glints it aqua.
  peg(ctx, peg, glow) {
    const { x, y, r } = peg;
    pegBase(ctx, peg, glow, AQUA, this.pegShadow);
    const tilt = ((x * 0.37 + y * 0.11) % 1) - 0.5;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.2);
    g.addColorStop(0, glow > 0.3 ? '#d8f6fa' : '#c9d2d6');
    g.addColorStop(1, glow > 0.3 ? '#5fc3d1' : '#7d8b93');
    ctx.fillStyle = g;
    ctx.strokeStyle = STONE_INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.12, r * 0.9, tilt * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.38, r * 0.18, -0.4, 0, Math.PI * 2);
    ctx.fill();
  },

  // A bumper is a round boulder with a cap of moss, breathing like the other maps' bumpers.
  bumper(ctx, peg, since, now, glow) {
    const r = bumperSpring(ctx, peg, since, now, AQUA);
    bumperBase(ctx, peg, r, glow, AQUA, this.pegShadow);
    const g = ctx.createRadialGradient(peg.x - r * 0.3, peg.y - r * 0.35, r * 0.1, peg.x, peg.y, r * 1.1);
    g.addColorStop(0, '#b9a58c');
    g.addColorStop(1, '#6e5e4c');
    ctx.fillStyle = g;
    ctx.strokeStyle = 'rgba(60, 45, 30, 0.7)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = MOSS;
    ctx.beginPath();
    ctx.ellipse(peg.x, peg.y - r * 0.75, r * 1.05, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(200, 235, 150, 0.8)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(peg.x + (i - 1.5) * r * 0.45, peg.y - r * 0.3 + (i % 2) * 3, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  // Layers of red rock, cracked here and there, with moss on the ledges and water dripping down.
  wallTexture(ctx, { inner, side, top, bottom, far, w }) {
    const x = Math.min(inner, far);
    const shades = [WALL.base, WALL.light, WALL.base, WALL.dark];
    let n = 0;
    for (let y = top; y < bottom; y += 26 + (n % 3) * 8, n++) {
      ctx.fillStyle = shades[n % shades.length];
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s <= w; s += 24) ctx.lineTo(x + s, y + Math.sin((s + n * 41) * 0.05) * 3);
      ctx.lineTo(x + w, y + 30);
      ctx.lineTo(x, y + 30);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(80, 40, 20, 0.35)';
    ctx.lineWidth = 1.5;
    n = 0;
    for (let y = top + 40; y < bottom - 20; y += 90, n++) {
      const cx = inner + side * (14 + ((n * 53) % Math.max(1, w - 28)));
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.lineTo(cx + side * 6, y + 14);
      ctx.lineTo(cx - side * 2, y + 26);
      ctx.stroke();
      moss(ctx, inner + side * (12 + ((n * 29) % Math.max(1, w - 24))), y + 48, 6);
    }
  },

  // A wall bump is a rock ledge pushing out, with a tuft of moss.
  wallBump(ctx, peg, board, glow) {
    wallBump(ctx, peg, board, glow, WALL, (x, y) => moss(ctx, x, y - 6, 5));
  },
};
