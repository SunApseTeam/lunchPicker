// Small drawing helpers the map themes share.

export function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// A seeded random source, so a theme's ground comes out the same every time.
export function rand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The soft glow and drop shadow every peg sits on: the glow flares when it is knocked.
export function pegBase(ctx, { x, y, r }, glow, glowColor, shadow) {
  if (glow > 0) {
    ctx.fillStyle = hexToRgba(glowColor, 0.3 * glow);
    ctx.beginPath();
    ctx.arc(x, y, r * 1.5 + 12 * glow, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 4, r * 1.3, r * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
}

// How a bumper springs when hit: it pops big and wobbles back, and breathes a little at rest.
// Also draws the ring that rolls outward from a fresh hit. Returns the radius to draw at.
export function bumperSpring(ctx, peg, since, now, color) {
  const spring = since < 1 ? 0.7 * Math.exp(-5 * since) * Math.cos(24 * since) : 0;
  const scale = 1 + spring + 0.06 * Math.sin(now * 3 + peg.x);
  if (since < 0.45) {
    const t = since / 0.45;
    ctx.strokeStyle = hexToRgba(color, 0.6 * (1 - t));
    ctx.lineWidth = 6 * (1 - t) + 1;
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, peg.r * (1.6 + 3.4 * t), 0, Math.PI * 2);
    ctx.stroke();
  }
  return peg.r * scale;
}

// The halo and shadow under a bumper.
export function bumperBase(ctx, peg, r, glow, color, shadow) {
  ctx.fillStyle = hexToRgba(color, 0.12 + 0.3 * glow);
  ctx.beginPath();
  ctx.arc(peg.x, peg.y, r * 1.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(peg.x + 3, peg.y + 6, r * 1.4, r * 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Round puffs filling a wall already set as the clip, laid in staggered rows from `inner`
// outward to `far`. paint(x, y, size, row, col) draws one.
export function puffRows(inner, side, top, bottom, far, step, paint) {
  let row = 0;
  for (let yy = top + 12; yy < bottom + step; yy += step * 0.8, row++) {
    let col = 0;
    for (let xx = inner + side * (row % 2 ? step * 0.5 : 0); side < 0 ? xx > far - step : xx < far + step; xx += side * step, col++) {
      paint(xx, yy, step, row, col);
    }
  }
}

// A wall bump: a round puff of the wall pushing out into the board. clipped to the board side.
export function wallBump(ctx, peg, board, glow, { dark, base, light, outline }, extra) {
  const { x, y, r } = peg;
  const side = x <= 0 ? -1 : 1;
  ctx.save();
  ctx.beginPath();
  ctx.rect(side < 0 ? -1 : board.width - r - 2, y - r - 4, r + 3, r * 2 + 8);
  ctx.clip();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(x, y, r + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(x, y, r - 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = light;
  ctx.globalAlpha = 0.65 + 0.35 * glow;
  ctx.beginPath();
  ctx.ellipse(x - side * r * 0.35, y - r * 0.32, r * 0.32, r * 0.2, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, r, side < 0 ? -Math.PI / 2 : Math.PI / 2, side < 0 ? Math.PI / 2 : Math.PI * 1.5);
  ctx.stroke();
  extra?.(x - side * r * 0.5, y + r * 0.25, side);
  ctx.restore();
}

// Bits drifting across the screen (petals, snow, sparks), each from a fixed list of seeds.
export function drifters(count, seed) {
  const rnd = rand(seed);
  return Array.from({ length: count }, () => ({ x: rnd(), y: rnd(), speed: 18 + rnd() * 22, spin: rnd() * 6, size: rnd(), pick: rnd() }));
}

// Where a drifter is at time t, wrapping round the screen. slant and fall set its heading.
export function driftPos(d, t, width, height, slant = 1, fall = 0.6) {
  const wrap = (v, span) => (((v % span) + span) % span) - 30;
  return {
    x: wrap(d.x * (width + 60) + t * d.speed * slant, width + 60),
    y: wrap(d.y * (height + 60) + t * d.speed * fall, height + 60),
  };
}

// Soft shadows of clouds drifting across the board, in board space.
export function cloudShadows(ctx, t, board, color) {
  const span = board.width + 1600;
  for (const [i, c] of [0, 1, 2].entries()) {
    const speed = 16 + c * 5;
    const rx = 300 + c * 40;
    const x = ((t * speed + c * 0.37 * span) % span) - 800;
    const y = board.height * (0.15 + i * 0.33);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, color);
    g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, 170, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
