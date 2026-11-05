// The ground the balls fall over, in the current theme: a seamless tile fixed to the board, so
// the pegs never seem to slide over it, and the theme's weather moving on top.
import { rand } from './themes/art.js';

const TILE = 760;
// Tile pixels per board unit, so the ground stays sharp when the camera zooms in.
const SHARP = 2;

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

function buildTile(theme) {
  const canvas = document.createElement('canvas');
  canvas.width = TILE * SHARP;
  canvas.height = TILE * SHARP;
  const ctx = canvas.getContext('2d');
  ctx.scale(SHARP, SHARP);
  theme.tile(ctx, rand(7), wrapped, TILE);
  return canvas;
}

export function createGround() {
  // One pattern per theme, made the first time that theme is shown.
  const patterns = new Map();
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  // cam: the board point at the screen centre and its zoom. width, height: canvas CSS pixels.
  function draw(ctx, { theme, width, height, dpr, now, cam, board }) {
    if (!patterns.has(theme.id)) patterns.set(theme.id, ctx.createPattern(buildTile(theme), 'repeat'));
    const pattern = patterns.get(theme.id);
    const k = cam.scale * dpr;
    const ox = dpr * (width / 2 - cam.x * cam.scale);
    const oy = dpr * (height / 2 - cam.y * cam.scale);
    pattern.setTransform(new DOMMatrix().translate(ox, oy).scale(k / SHARP));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width * dpr, height * dpr);
    // The weather draws in board space (fixed to the ground) or screen space (blowing across
    // the view), switching with these.
    theme.weather(ctx, {
      t: still ? 0 : now,
      still,
      width,
      height,
      board,
      boardSpace: () => ctx.setTransform(k, 0, 0, k, ox, oy),
      screenSpace: () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0),
    });
    ctx.restore();
  }

  return { draw };
}
