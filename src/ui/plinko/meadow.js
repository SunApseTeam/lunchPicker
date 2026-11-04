// A soft hand-drawn meadow behind the board: pastel grass with little tufts, flowers and bushes,
// drifting slowly on a seamless tile, and a butterfly or two fluttering across. It is drawn in
// screen space, so it stays put while the camera zooms and follows the balls.
const TILE = 760;
const DRIFT = { x: 9, y: 6 };
const GRASS = '#d5ebb5';
const INK = 'rgba(96, 128, 72, 0.55)';

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

function flower(ctx, x, y, petal, color) {
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = 'rgba(110, 120, 90, 0.55)';
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * petal, y + Math.sin(a) * petal, petal * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#ffd75e';
  ctx.beginPath();
  ctx.arc(x, y, petal * 0.6, 0, Math.PI * 2);
  ctx.fill();
}

// A round bush: overlapping puffs with a scalloped darker rim and a few flowers on top.
function bush(ctx, x, y, r, rnd) {
  const puffs = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2;
    return { x: x + Math.cos(a) * r * 0.62, y: y + Math.sin(a) * r * 0.5, r: r * (0.42 + rnd() * 0.12) };
  });
  ctx.fillStyle = '#86b866';
  for (const p of puffs) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#a8d488';
  for (const p of puffs) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.7, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 3; i++) flower(ctx, x + (rnd() - 0.5) * r, y + (rnd() - 0.5) * r * 0.7, 3.2, ['#f7c6d9', '#cdb8f0', '#ffffff'][i]);
}

function buildTile(scale) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(TILE * scale);
  canvas.height = Math.round(TILE * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const rnd = rand(7);
  ctx.fillStyle = GRASS;
  ctx.fillRect(0, 0, TILE, TILE);
  // Lighter patches of sunlight.
  for (let i = 0; i < 12; i++) {
    const x = rnd() * TILE;
    const y = rnd() * TILE;
    const r = 60 + rnd() * 70;
    wrapped(x, y, r, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(240, 250, 220, 0.55)');
      g.addColorStop(1, 'rgba(240, 250, 220, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
  const bushes = [{ x: 610, y: 90, r: 50 }, { x: 130, y: 300, r: 40 }, { x: 470, y: 600, r: 34 }];
  for (const b of bushes) wrapped(b.x, b.y, b.r * 1.3, (px, py) => bush(ctx, px, py, b.r, rand(b.x)));
  const clear = (x, y) => bushes.every((b) => Math.hypot(b.x - x, b.y - y) > b.r * 1.4);
  for (let i = 0; i < 150; i++) {
    const x = rnd() * TILE;
    const y = rnd() * TILE;
    const s = 0.8 + rnd() * 0.6;
    if (clear(x, y)) wrapped(x, y, 12, (px, py) => tuft(ctx, px, py, s));
  }
  const colors = ['#ffffff', '#f7c6d9', '#cdb8f0', '#ffffff', '#ffd1a8'];
  for (let i = 0; i < 34; i++) {
    const x = rnd() * TILE;
    const y = rnd() * TILE;
    if (clear(x, y)) wrapped(x, y, 12, (px, py) => flower(ctx, px, py, 3.4 + rnd() * 1.2, colors[i % colors.length]));
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  for (let i = 0; i < 80; i++) {
    const x = rnd() * TILE;
    const y = rnd() * TILE;
    wrapped(x, y, 3, (px, py) => {
      ctx.beginPath();
      ctx.arc(px, py, 1.4 + rnd() * 1.2, 0, Math.PI * 2);
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
  let tile = null;
  let pattern = null;
  let builtFor = 0;
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const flyers = [
    { speed: 34, y: 0.22, sway: 26, tint: '#fff1a6', phase: 0 },
    { speed: 26, y: 0.7, sway: 34, tint: '#fbd3e6', phase: 3.1 },
  ];

  // width, height: the canvas in CSS pixels; dpr: device pixels per CSS pixel.
  function draw(ctx, width, height, now, dpr) {
    if (!tile || builtFor !== dpr) {
      tile = buildTile(dpr);
      pattern = ctx.createPattern(tile, 'repeat');
      builtFor = dpr;
    }
    const t = still ? 0 : now;
    const ox = ((t * DRIFT.x) % TILE) * dpr;
    const oy = ((t * DRIFT.y) % TILE) * dpr;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(-ox, -oy);
    ctx.fillStyle = pattern;
    ctx.fillRect(ox, oy, width * dpr, height * dpr);
    ctx.restore();
    if (still) return;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const f of flyers) {
      const span = width + 80;
      const x = ((t * f.speed + f.phase * 200) % span) - 40;
      const y = height * f.y + Math.sin(t * 0.9 + f.phase) * f.sway;
      butterfly(ctx, x, y, t * 11 + f.phase, f.tint);
    }
    ctx.restore();
  }

  return { draw };
}
