// The ground the balls fall over: a soft hand-drawn meadow of grass, tufts and tiny flowers on a
// seamless tile. It is fixed to the board, so the flower pegs never seem to slide over it; what
// moves is the weather: cloud shadows drifting across, petals blowing by and two butterflies.
// Background flowers stay tiny and faint so they never pass for the pegs, and there are no bushes,
// which would pass for walls.
const TILE = 760;
// Tile pixels per board unit, so the grass stays sharp when the camera zooms in.
const SHARP = 2;
const GRASS = '#d5ebb5';
const INK = 'rgba(96, 128, 72, 0.45)';

function rand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Draws fn at (x, y) and again across each edge it might cross, so the tile wraps seamlessly.
function wrapped(x, y, reach, fn) {
  for (const dx of [-TILE, 0, TILE]) {
    for (const dy of [-TILE, 0, TILE]) {
      const px = x + dx;
      const py = y + dy;
      if (px > -reach && px < TILE + reach && py > -reach && py < TILE + reach) fn(px, py);
    }
  }
}

function tuft(ctx, x, y, s) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (const [dx, lean] of [[-3, -0.5], [0, 0.1], [3, 0.6]]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * s, y);
    ctx.quadraticCurveTo(x + dx * s + lean * 2 * s, y - 4 * s, x + dx * s + lean * 4 * s, y - 7 * s);
    ctx.stroke();
  }
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

function buildTile() {
  const canvas = document.createElement('canvas');
  canvas.width = TILE * SHARP;
  canvas.height = TILE * SHARP;
  const ctx = canvas.getContext('2d');
  ctx.scale(SHARP, SHARP);
  const rnd = rand(7);
  ctx.fillStyle = GRASS;
  ctx.fillRect(0, 0, TILE, TILE);
  for (let i = 0; i < 12; i++) {
    const x = rnd() * TILE;
    const y = rnd() * TILE;
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
    const x = rnd() * TILE;
    const y = rnd() * TILE;
    const s = 0.8 + rnd() * 0.6;
    wrapped(x, y, 12, (px, py) => tuft(ctx, px, py, s));
  }
  const colors = ['#ffffff', '#f7c6d9', '#cdb8f0', '#ffd1a8'];
  for (let i = 0; i < 26; i++) {
    const x = rnd() * TILE;
    const y = rnd() * TILE;
    const p = 1.8 + rnd() * 0.8;
    wrapped(x, y, 8, (px, py) => speck(ctx, px, py, p, colors[i % colors.length]));
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  for (let i = 0; i < 80; i++) {
    const x = rnd() * TILE;
    const y = rnd() * TILE;
    const r = 1.2 + rnd() * 1.1;
    wrapped(x, y, 3, (px, py) => {
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  return canvas;
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

export function createMeadow() {
  let pattern = null;
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const rnd = rand(11);
  const clouds = [0, 1, 2].map((i) => ({ y: 0.15 + i * 0.33, speed: 16 + i * 5, phase: i * 0.37, rx: 300 + i * 40, ry: 170 }));
  const petals = Array.from({ length: 16 }, () => ({ x: rnd(), y: rnd(), speed: 18 + rnd() * 22, spin: rnd() * 6, size: 3 + rnd() * 2.5, pink: rnd() < 0.6 }));
  const flyers = [
    { speed: 34, y: 0.22, sway: 26, tint: '#fff1a6', phase: 0 },
    { speed: 26, y: 0.7, sway: 34, tint: '#fbd3e6', phase: 3.1 },
  ];

  // cam: the board point at the screen centre and its zoom. width, height: canvas CSS pixels.
  function draw(ctx, { width, height, dpr, now, cam, board }) {
    if (!pattern) pattern = ctx.createPattern(buildTile(), 'repeat');
    const k = cam.scale * dpr;
    pattern.setTransform(new DOMMatrix().translate(dpr * (width / 2 - cam.x * cam.scale), dpr * (height / 2 - cam.y * cam.scale)).scale(k / SHARP));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width * dpr, height * dpr);
    ctx.restore();
    const t = still ? 0 : now;

    // Cloud shadows drift across the board's patch of meadow.
    ctx.save();
    ctx.setTransform(k, 0, 0, k, dpr * (width / 2 - cam.x * cam.scale), dpr * (height / 2 - cam.y * cam.scale));
    const span = board.width + 1600;
    for (const c of clouds) {
      const x = ((t * c.speed + c.phase * span) % span) - 800;
      const y = board.height * c.y;
      const g = ctx.createRadialGradient(x, y, 0, x, y, c.rx);
      g.addColorStop(0, 'rgba(60, 96, 44, 0.10)');
      g.addColorStop(1, 'rgba(60, 96, 44, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, c.rx, c.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (still) return;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const p of petals) {
      const x = (p.x * (width + 60) + t * p.speed) % (width + 60) - 30;
      const y = (p.y * (height + 60) + t * p.speed * 0.6) % (height + 60) - 30;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 1.3 + p.spin);
      ctx.fillStyle = p.pink ? 'rgba(255, 196, 214, 0.85)' : 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (const f of flyers) {
      const across = width + 80;
      const x = ((t * f.speed + f.phase * 200) % across) - 40;
      const y = height * f.y + Math.sin(t * 0.9 + f.phase) * f.sway;
      butterfly(ctx, x, y, t * 11 + f.phase, f.tint);
    }
    ctx.restore();
  }

  return { draw };
}
