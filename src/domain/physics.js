import { DEFAULT_SETTINGS } from './settings.js';

// Soft-body Plinko. Each ball is a ring of points kept round by skin, pressure and
// shape-matching constraints (position-based dynamics), so it squishes against pegs.
export const DT = 1 / 240;
const ITER = 8;
const POINTS = 24;
const POINT_R = 2;
const SKIN = 4;
const MERGE_LIMIT = 0.6;
const SLOT_MARGIN = 24;
const MAX_SLOT_BOUNCES = 2;
// A ball that lands on a settled ball is sent on toward a free slot every time, up to this
// safety cap, rather than left to pile up on it.
const MAX_SETTLED_BOUNCES = 8;
// A ball coming down onto one resting in a slot shoves it the other way: up to this speed, in
// proportion to how fast the newcomer was falling (from SHOVE_FROM up). Hard enough, it knocks
// the resting ball over the divider and out of its slot.
const SHOVE = 600;
const SHOVE_FROM = 250;
const SHOVE_FULL = 1100;
// The spring under the slots: how hard it throws every ball in them straight back up. 1250 lifts
// a ball about 330, past the bottom peg row 250 above the floor, so it is thrown back among the
// pegs and bumpers and lands all over again.
const SPRING_SPEED = 1250;
// Bumper kicks and peg scatter set how wild a path looks. Tuned on single drops: about five
// sharp left-right reversals per drop and 1.3 board widths of sideways travel, while the landing
// slot stays unrelated to where the ball was dropped.
const BUMPER_KICK = 2400;
const PEG_SCATTER = 300;
const AIR_DRAG = 0.9995;
const PEG_RESTITUTION = 0.7;
// The slot floor is springy, and the dividers are about half as high as a ball is tall, so more
// than half the balls bounce out of the slot they land in first (measured over single drops: 62%
// at the default size 56, 65% at 54, 71% at 48). Landings slower
// than FLOOR_MIN_SPEED (a ball already resting and jiggling) get no bounce, so a settled ball
// stays put.
const FLOOR_RESTITUTION = 0.7;
const FLOOR_MIN_SPEED = 150;
const DIVIDER_PER_RADIUS = 0.55;
// A lid tilts toward the nearest open slot: a ball resting on it slides off at this sideways
// acceleration instead of rolling to and fro between the divider tops.
const LID_TILT = 1400;
// The floor grips a ball; a lid is slick, or the grip would hold a ball against the tilt.
const FLOOR_FRICTION = 0.35;
const LID_FRICTION = 0.02;

const SETTLE_RADIUS = 5;
const SETTLE_TIME = 0.35;
const SHAKE_RADIUS = 10;
const SHAKE_TIME = 0.8;
// Once a ball has stopped bouncing in a slot, its jiggle and sloshing die down fast and it counts
// as settled sooner, instead of waiting out every tremor of the jelly.
const SLOT_WOBBLE_DAMPING = 0.98;
const SLOT_DRAG = 0.985;
const CALM_SPEED = 80;
const CALM_TIME = 0.15;

export const GEOMETRY = {
  // The widest board, used from six slots up. Fewer slots get a narrower one: see boardWidth.
  width: 1200,
  gravity: 2400,
  // The band above the drop line holds the team's speech bubbles while they wait to drop.
  dropY: 170,
  pegTop: 300,
  pegRows: 8,
  rowGap: 125,
  colGap: 190,
  // Pegs big enough that a falling ball meets plenty of them.
  pegRadius: 13,
  bumperRadius: 18,
  wallBumpRadius: 45,
  dividerHalfWidth: 4,
  // Space from the bottom peg row down to the slot floor. A ball bouncing out of its slot needs
  // headroom under the bottom pegs to carry over into the next one, and a ball coming off the
  // bottom wall bump would otherwise drop straight into the edge slot.
  slotRoom: 250,
};
const BUMPER_COUNT = 8;
// The outermost pegs of the even rows stand this far in from the walls: a full-size ball (56) still
// fits past the peg with a few pixels to spare.
const PEG_MARGIN = 129;

export function physicsFrom(settings) {
  const soft = settings.softness / 100;
  const bounce = settings.bounce / 100;
  // Jelly changes shape easily but keeps its volume: softness lowers shape and skin
  // stiffness only, while pressure stays high so crowded balls can't squash into each other.
  return {
    radius: settings.size,
    shape: 0.2 * (1 - soft) + 0.006,
    edge: 0.85 - soft * 0.6,
    pressure: 0.7 + bounce * 0.25,
    damping: 0.992 + bounce * 0.0075,
  };
}

export function minSlotWidth(radius) {
  return 2 * radius + SLOT_MARGIN;
}

// The trigger slot: one extra slot, among the places' slots, with a button for a floor. It is
// exactly as wide as the biggest ball, narrower than theirs. With the whole team dropping and any
// ball reaching its floor pressing it, that set it off in 100% (2 places), 88% (4) and 93% (6) of
// 40 rounds each. Narrower slots press less (80 wide: 63%, 45%, 55%), but a big ball can then lodge
// across the mouth and the round never ends.
export function triggerWidth(radius) {
  return 2 * radius;
}

// The board for n places has room for one slot more (a peg gap wider, up to the full width);
// the trigger slot takes its width at `at` and the places share the rest equally.
export function slotWidthsWithTrigger(n, radius, at) {
  const width = boardWidth(n + 1);
  const place = (width - triggerWidth(radius)) / n;
  const widths = Array.from({ length: n }, () => place);
  widths.splice(at, 0, triggerWidth(radius));
  return widths;
}

// How many places fit beside the trigger slot at the full width.
export function maxSlots(radius) {
  return Math.min(12, Math.floor((GEOMETRY.width - triggerWidth(radius)) / minSlotWidth(radius)));
}

export function equalWidths(n) {
  return Array.from({ length: n }, () => GEOMETRY.width / n);
}

// A board for few slots is narrower, so each slot stays about as wide as on the full board
// (220px for two, 200px for six): picking from two should feel as tight as picking from six.
// The width is always a whole number of peg gaps, so the lattice and its wall clearances are
// the same at every size.
export function boardWidth(slotCount) {
  const g = GEOMETRY;
  return Math.min(g.width, 2 * PEG_MARGIN + g.colGap * Math.max(1, slotCount - 1));
}

// Even rows leave 116px to the wall, wider than a ball. Odd rows stop well short of the
// wall and get a half-round bump centred on it, which always pushes balls inward:
// any gap narrower than a ball between a peg and the wall becomes a pocket.
function pegColumns(width, row) {
  const first = row % 2 === 1 ? PEG_MARGIN + GEOMETRY.colGap / 2 : PEG_MARGIN;
  const xs = [];
  for (let x = first; x <= width - first + 1; x += GEOMETRY.colGap) xs.push(x);
  return xs;
}

// Each round gets its own bumper layout: as many bumpers as the board is wide for, plus one, so
// even the narrowest board has four. Bumpers skip the top row (straight under the drop) and an
// even row's outermost peg: a bumper there narrows the wall gap below a big ball. The bottom row
// may have them, kicking balls about just over the slots. No two bumpers touch, so their kicks
// never stack.
export function randomBumpers(rng, width = GEOMETRY.width) {
  const g = GEOMETRY;
  const spots = [];
  for (let row = 1; row < g.pegRows; row++) {
    for (const x of pegColumns(width, row)) {
      if (row % 2 === 1 || (x > PEG_MARGIN && x < width - PEG_MARGIN)) spots.push({ row, x });
    }
  }
  const count = Math.round((BUMPER_COUNT * width) / g.width) + 1;
  // Random picks that may not touch can box themselves in short of the count, so a few fresh
  // tries are made and the fullest kept.
  let best = [];
  for (let attempt = 0; attempt < 12 && best.length < count; attempt++) {
    const left = [...spots];
    const picked = [];
    while (picked.length < count && left.length > 0) {
      const [spot] = left.splice(Math.floor(rng() * left.length), 1);
      if (picked.some((p) => Math.abs(p.row - spot.row) <= 1 && Math.abs(p.x - spot.x) <= g.colGap)) continue;
      picked.push(spot);
    }
    if (picked.length > best.length) best = picked;
  }
  return best;
}

function buildPegs(g, width, bumpers) {
  const pegs = [];
  for (let row = 0; row < g.pegRows; row++) {
    const y = g.pegTop + row * g.rowGap;
    for (const x of pegColumns(width, row)) {
      const bumper = bumpers.some((b) => b.row === row && b.x === x);
      pegs.push({ x, y, r: bumper ? g.bumperRadius : g.pegRadius, kind: bumper ? 'bumper' : 'peg' });
    }
    if (row % 2 === 1) {
      pegs.push({ x: 0, y, r: g.wallBumpRadius, kind: 'wall' });
      pegs.push({ x: width, y, r: g.wallBumpRadius, kind: 'wall' });
    }
  }
  return pegs;
}

// The layout the simulation tests run on. On a narrower board the spots past its edge drop out.
export const FIXED_BUMPERS = [
  { row: 1, x: 410 }, { row: 1, x: 790 }, { row: 3, x: 600 }, { row: 5, x: 220 }, { row: 5, x: 980 }, { row: 6, x: 505 },
];

// triggerSlot: which slot is the spring trigger's, or none. See slotWidthsWithTrigger.
export function createBoard(slotWidths, radius = DEFAULT_SETTINGS.size, bumpers = FIXED_BUMPERS, triggerSlot = null) {
  const g = GEOMETRY;
  const width = boardWidth(slotWidths.length);
  const total = slotWidths.reduce((a, b) => a + b, 0);
  const slotEdges = [0];
  for (const w of slotWidths) slotEdges.push(slotEdges.at(-1) + (w / total) * width);
  slotEdges[slotEdges.length - 1] = width;
  const dividers = slotEdges.slice(1, -1);
  const pegBottom = g.pegTop + (g.pegRows - 1) * g.rowGap;
  const floorY = pegBottom + g.slotRoom;
  // Dividers are lower than a ball is tall, in proportion to it, so balls of every size can
  // bounce over them about as often.
  const dividerTop = floorY - radius * DIVIDER_PER_RADIUS;
  const pegs = buildPegs(g, width, bumpers);
  const caps = dividers.map((x) => ({ x, y: dividerTop, r: g.dividerHalfWidth, kind: 'divider' }));
  return {
    ...g,
    width,
    ballRadius: radius,
    pegs,
    obstacles: pegs.concat(caps),
    pegBottom,
    dividerTop,
    // Lids sit just above the divider caps, so a ball sliding along one does not snag on a cap.
    lidY: dividerTop - g.dividerHalfWidth - 2,
    floorY,
    height: floorY + 90,
    slotEdges,
    dividers,
    triggerSlot,
  };
}

// The spring under every slot throws each ball in them back up, a little sideways, so even a
// ball that had settled goes round again. Returns the balls thrown.
export function springSlots(world) {
  const { rng } = world;
  const thrown = world.balls.filter((b) => b.zone !== null);
  for (const b of thrown) {
    setVelocity(b, (rng() * 2 - 1) * 260, -(SPRING_SPEED + rng() * 200));
    // In the air at once: no slot drag, and its slot bounces start afresh.
    b.bounceAt = world.time;
    b.slotBounces = 0;
  }
  return thrown;
}

export function slotAt(board, x) {
  const e = board.slotEdges;
  for (let i = 0; i < e.length - 1; i++) if (x < e[i + 1]) return i;
  return e.length - 2;
}

export function createWorld(board, rng, physics = physicsFrom(DEFAULT_SETTINGS)) {
  // closed: empty slots with a lid over them. The round decides which.
  return { board, rng, physics, time: 0, balls: [], nextId: 1, touching: new Set(), closed: new Set() };
}

// A closed slot has a lid just above the divider tops: a ball coming down onto it lands there as
// on the floor, bounces and slides off toward a free slot (see lidTilt). A ball already below
// the lid when it closes stays under it.
function floorUnder(world, b) {
  const { board } = world;
  return b.cy < board.lidY && world.closed.has(slotAt(board, b.cx)) ? board.lidY : board.floorY;
}

// Which way (-1 or 1) the nearest free slot is from x: one with no lid and no settled ball in
// it. 0 when there is none.
function towardFree(world, x) {
  const e = world.board.slotEdges;
  const taken = new Set(world.balls.filter((b) => b.settled).map((b) => b.slot));
  let best = null;
  for (let i = 0; i < e.length - 1; i++) {
    if (world.closed.has(i) || taken.has(i)) continue;
    const mid = (e[i] + e[i + 1]) / 2;
    if (best === null || Math.abs(mid - x) < Math.abs(best - x)) best = mid;
  }
  return best === null ? 0 : Math.sign(best - x);
}

// Sideways acceleration on a ball resting on a lid, as if the lid sloped toward a free slot.
function lidTilt(world, b) {
  return b.onLid ? towardFree(world, b.cx) * LID_TILT : 0;
}

// Each ball carries its own physics (size, softness, bounce), so team members can differ.
export function dropBall(world, x, vx = 0, phys = world.physics, y = world.board.dropY) {
  const R = phys.radius;
  const pts = [];
  const rest = [];
  for (let i = 0; i < POINTS; i++) {
    const a = (i / POINTS) * Math.PI * 2;
    const px = x + Math.cos(a) * R;
    const py = y + Math.sin(a) * R;
    pts.push({ x: px, y: py, px: px - vx * DT, py });
    rest.push({ x: Math.cos(a) * R, y: Math.sin(a) * R });
  }
  const ball = {
    id: world.nextId++,
    phys,
    pts,
    rest,
    R,
    area0: Math.PI * R * R * 0.98,
    edge0: 2 * R * Math.sin(Math.PI / POINTS),
    cx: x,
    cy: y,
    vx,
    vy: 0,
    angle: 0,
    squeeze: 0,
    bottom: y + R,
    bumpAt: -9,
    bounceAt: -9,
    calmSince: 0,
    settledAt: 0,
    slotBounces: 0,
    shake: { x, y, since: world.time, count: 0 },
    still: { x, y, since: world.time },
    zone: null,
    enteredAt: 0,
    settled: false,
    slot: null,
    onFloor: false,
    touching: new Set(),
  };
  world.balls.push(ball);
  return ball;
}

export function removeBall(world, ball) {
  world.balls = world.balls.filter((b) => b !== ball);
}

function centroid(b) {
  let x = 0;
  let y = 0;
  for (const p of b.pts) {
    x += p.x;
    y += p.y;
  }
  b.cx = x / POINTS;
  b.cy = y / POINTS;
}

function area(b) {
  let a = 0;
  for (let i = 0; i < POINTS; i++) {
    const p = b.pts[i];
    const q = b.pts[(i + 1) % POINTS];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function setVelocity(b, vx, vy) {
  for (const p of b.pts) {
    p.px = p.x - vx * DT;
    p.py = p.y - vy * DT;
  }
}

function translate(b, x, y) {
  for (const p of b.pts) {
    p.x += x;
    p.y += y;
    p.px += x;
    p.py += y;
  }
  b.cx += x;
  b.cy += y;
}

function inside(pts, x, y) {
  let hit = false;
  for (let i = 0, j = POINTS - 1; i < POINTS; j = i++) {
    const a = pts[i];
    const c = pts[j];
    if (a.y > y !== c.y > y && x < ((c.x - a.x) * (y - a.y)) / (c.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

function nearestEdge(pts, x, y) {
  let best = null;
  for (let i = 0; i < POINTS; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % POINTS];
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const t = Math.min(1, Math.max(0, ((x - p.x) * ex + (y - p.y) * ey) / (ex * ex + ey * ey || 1e-6)));
    const cx = p.x + ex * t;
    const cy = p.y + ey * t;
    const d = Math.hypot(cx - x, cy - y);
    if (!best || d < best.d) best = { p, q, t, cx, cy, d };
  }
  return best;
}

function constrain(b, phys) {
  for (let i = 0; i < POINTS; i++) {
    const p = b.pts[i];
    const q = b.pts[(i + 1) % POINTS];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const d = Math.hypot(dx, dy) || 1e-6;
    const c = ((d - b.edge0) / d) * 0.5 * phys.edge;
    p.x += dx * c;
    p.y += dy * c;
    q.x -= dx * c;
    q.y -= dy * c;
  }
  let perimeter = 0;
  for (let i = 0; i < POINTS; i++) {
    const p = b.pts[i];
    const q = b.pts[(i + 1) % POINTS];
    perimeter += Math.hypot(q.x - p.x, q.y - p.y);
  }
  const push = ((b.area0 - area(b)) / perimeter) * phys.pressure;
  const moves = b.pts.map((p, i) => {
    const prev = b.pts[(i + POINTS - 1) % POINTS];
    const next = b.pts[(i + 1) % POINTS];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const l = Math.hypot(tx, ty) || 1e-6;
    return { x: (ty / l) * push, y: (-tx / l) * push };
  });
  b.pts.forEach((p, i) => {
    p.x += moves[i].x;
    p.y += moves[i].y;
  });

  centroid(b);
  let s = 0;
  let c = 0;
  b.pts.forEach((p, i) => {
    const q = b.rest[i];
    const dx = p.x - b.cx;
    const dy = p.y - b.cy;
    s += q.x * dy - q.y * dx;
    c += q.x * dx + q.y * dy;
  });
  b.angle = Math.atan2(s, c);
  const cos = Math.cos(b.angle);
  const sin = Math.sin(b.angle);
  b.pts.forEach((p, i) => {
    const q = b.rest[i];
    p.x += (b.cx + q.x * cos - q.y * sin - p.x) * phys.shape;
    p.y += (b.cy + q.x * sin + q.y * cos - p.y) * phys.shape;
  });
}

function pushPointOut(p, cx, cy, minDist, friction) {
  const dx = p.x - cx;
  const dy = p.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minDist * minDist) return false;
  const d = Math.sqrt(d2) || 1e-6;
  const nx = dx / d;
  const ny = dy / d;
  p.x = cx + nx * minDist;
  p.y = cy + ny * minDist;
  const vx = p.x - p.px;
  const vy = p.y - p.py;
  const vn = vx * nx + vy * ny;
  p.px += (vx - vn * nx) * friction;
  p.py += (vy - vn * ny) * friction;
  return true;
}

// Obstacles are tested against the skin's edges, not only its points: when the jelly
// stretches, a peg slips between two points, ends up inside the body and the ball hangs on it.
function collideEdge(p, q, ob) {
  const ex = q.x - p.x;
  const ey = q.y - p.y;
  const t = Math.min(1, Math.max(0, ((ob.x - p.x) * ex + (ob.y - p.y) * ey) / (ex * ex + ey * ey || 1e-6)));
  const dx = p.x + ex * t - ob.x;
  const dy = p.y + ey * t - ob.y;
  const min = ob.r + POINT_R;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return null;
  const d = Math.sqrt(d2) || 1e-6;
  const nx = dx / d;
  const ny = dy / d;
  const w1 = 1 - t;
  const w2 = t;
  const s = (min - d) / (w1 * w1 + w2 * w2);
  for (const [pt, w] of [[p, w1], [q, w2]]) {
    pt.x += nx * s * w;
    pt.y += ny * s * w;
    const vx = pt.x - pt.px;
    const vy = pt.y - pt.py;
    const vn = vx * nx + vy * ny;
    pt.px += (vx - vn * nx) * 0.2 * w;
    pt.py += (vy - vn * ny) * 0.2 * w;
  }
  return { nx, ny };
}

// A peg that ends up inside the body (a ball crushed onto it by others) is expelled by moving
// the whole ball off it, using the body's actual outline: a stretched ball moved by its rest
// radius alone still has the peg inside, and folding only the nearest skin gets pushed back in.
function expel(b, ob) {
  const dx = b.cx - ob.x;
  const dy = b.cy - ob.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / d;
  const uy = dy / d;
  let back = Infinity;
  for (const p of b.pts) back = Math.min(back, (p.x - ob.x) * ux + (p.y - ob.y) * uy);
  const shift = Math.max(0, ob.r + POINT_R - back);
  translate(b, ux * shift, uy * shift);
}

function collideStatic(world, b) {
  const { board } = world;
  const floor = floorUnder(world, b);
  const friction = floor === board.lidY ? LID_FRICTION : FLOOR_FRICTION;
  const reach = b.R * 1.6;
  for (const ob of board.obstacles) {
    if (Math.abs(b.cx - ob.x) > reach + ob.r || Math.abs(b.cy - ob.y) > reach + ob.r) continue;
    if (inside(b.pts, ob.x, ob.y)) {
      expel(b, ob);
      b.touching.add(ob);
      continue;
    }
    for (let i = 0; i < POINTS; i++) {
      const hit = collideEdge(b.pts[i], b.pts[(i + 1) % POINTS], ob);
      if (!hit) continue;
      b.touching.add(ob);
      if (ob.kind === 'bumper' && world.time - b.bumpAt > 0.2) {
        b.bumpAt = world.time;
        const kick = BUMPER_KICK * DT;
        for (const q of b.pts) {
          q.px -= hit.nx * kick;
          q.py -= hit.ny * kick;
        }
      }
    }
  }
  for (const p of b.pts) {
    if (p.y > board.dividerTop - 4) {
      for (const x of board.dividers) {
        if (Math.abs(p.x - x) > board.dividerHalfWidth + 4) continue;
        const cy = Math.min(Math.max(p.y, board.dividerTop), board.floorY);
        pushPointOut(p, x, cy, board.dividerHalfWidth + POINT_R, 0.2);
      }
    }
    if (p.x < POINT_R) {
      p.x = POINT_R;
      p.py += (p.y - p.py) * 0.3;
    } else if (p.x > board.width - POINT_R) {
      p.x = board.width - POINT_R;
      p.py += (p.y - p.py) * 0.3;
    }
    if (p.y > floor - POINT_R) {
      p.y = floor - POINT_R;
      p.px += (p.x - p.px) * friction;
    }
  }
}

function collideBalls(world) {
  const balls = world.balls;
  // Solver fallback: once two bodies are this deep in each other, edge-by-edge pushes can no
  // longer tell which way is out, so the whole balls are pulled apart first.
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i];
      const b = balls[j];
      const min = (a.R + b.R) * MERGE_LIMIT;
      const dx = b.cx - a.cx;
      const dy = b.cy - a.cy;
      const d = Math.hypot(dx, dy);
      if (d >= min) continue;
      const ux = d > 1e-3 ? dx / d : 1;
      const uy = d > 1e-3 ? dy / d : 0;
      const half = (min - d) / 2;
      translate(a, -ux * half, -uy * half);
      translate(b, ux * half, uy * half);
    }
  }
  // Balls keep a thin skin gap. Contact is resolved before a point gets inside: once a point is
  // deep in, the nearest edge can be the far side and the fix pushes it straight through.
  for (const a of balls) {
    for (const b of balls) {
      if (a === b || Math.hypot(a.cx - b.cx, a.cy - b.cy) > (a.R + b.R) * 1.4) continue;
      for (const p of a.pts) {
        const ins = inside(b.pts, p.x, p.y);
        const e = nearestEdge(b.pts, p.x, p.y);
        if (!ins && e.d >= SKIN) continue;
        const d = e.d || 1e-6;
        const k = ins ? (d + SKIN) / d : -(SKIN - d) / d;
        const dx = ((e.cx - p.x) * k) / 2;
        const dy = ((e.cy - p.y) * k) / 2;
        p.x += dx;
        p.y += dy;
        const w1 = 1 - e.t;
        const w2 = e.t;
        const s = 1 / (w1 * w1 + w2 * w2);
        e.p.x -= dx * s * w1;
        e.p.y -= dy * s * w1;
        e.q.x -= dx * s * w2;
        e.q.y -= dy * s * w2;
        world.touching.add(a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`);
      }
    }
  }
}

function touches(a, b) {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.R + b.R + SKIN + 6;
}

// A ball counts as in a slot once its underside is below the divider tops, or when it rests on
// a ball that is already in that slot: a pile in one slot is a duplicate to re-drop, not a stall.
function assignZones(world) {
  const { board, balls } = world;
  for (const b of balls) {
    b.zone = b.bottom > board.dividerTop + 8 ? slotAt(board, b.cx) : null;
    b.stacked = false;
  }
  for (let pass = 0; pass < 2; pass++) {
    for (const b of balls) {
      if (b.zone !== null) continue;
      const base = balls.find((o) => o.zone !== null && o.cy > b.cy && slotAt(board, b.cx) === o.zone && touches(b, o));
      if (base) {
        b.zone = base.zone;
        b.stacked = true;
      }
    }
  }
}

// Time a ball has stayed within `radius` of an anchor point; jelly jitters in place, so
// "still" means not drifting, not zero velocity.
function stillFor(tracker, b, radius, now) {
  if (Math.hypot(b.cx - tracker.x, b.cy - tracker.y) > radius) {
    tracker.x = b.cx;
    tracker.y = b.cy;
    tracker.since = now;
    tracker.count = 0;
  }
  return now - tracker.since;
}

// A ball that lands on one already sitting in a slot is flung up and sideways, usually over the
// divider into the next slot. Capped per ball: crowded slots otherwise ping-pong for many seconds.
function slotBounces(world, emit) {
  const { board, balls, rng } = world;
  for (const a of balls) {
    const landedOnBall = a.zone === null || a.stacked;
    if (!landedOnBall || world.time - a.bounceAt < 0.35) continue;
    const base = balls.find((b) => b !== a && b.zone !== null && !b.stacked && b.cy > a.cy && Math.hypot(b.vx, b.vy) < 80 && touches(a, b));
    if (!base || a.slotBounces >= (base.settled ? MAX_SETTLED_BOUNCES : MAX_SLOT_BOUNCES)) continue;
    const dx = a.cx - base.cx;
    let side = (base.settled && towardFree(world, a.cx)) || (Math.abs(dx) > 6 ? Math.sign(dx) : rng() < 0.5 ? -1 : 1);
    const hop = board.width / (board.slotEdges.length - 1);
    if (a.cx + side * hop < 0 || a.cx + side * hop > board.width) side = -side;
    const fall = a.inVy ?? a.vy;
    setVelocity(a, side * (430 + rng() * 120), -(760 + rng() * 120));
    const shove = SHOVE * Math.min(1, Math.max(0, (fall - SHOVE_FROM) / (SHOVE_FULL - SHOVE_FROM)));
    if (shove > 0) setVelocity(base, -side * shove * 0.6, -shove);
    else for (const p of base.pts) if (p.y < base.cy) p.py -= 5;
    a.bounceAt = world.time;
    a.slotBounces += 1;
    emit({ type: 'hit', kind: 'slotBounce', ball: a, target: base, speed: 900 });
  }
}

function updateBall(world, b, emit) {
  const { board, rng } = world;
  const now = world.time;
  if (b.zone !== b.lastZone) {
    b.lastZone = b.zone;
    b.enteredAt = now;
  }
  if (b.zone === null || Math.hypot(b.vx, b.vy) > CALM_SPEED) b.calmSince = now;
  const still = stillFor(b.still, b, SETTLE_RADIUS, now) >= SETTLE_TIME;
  const settled = b.zone !== null && (still || now - b.calmSince >= CALM_TIME);
  if (settled && !b.settled) {
    b.settled = true;
    b.settledAt = now;
    b.slot = b.zone;
    emit({ type: 'settle', ball: b });
  } else if (!settled && b.settled) {
    b.settled = false;
    b.slot = null;
  }
  // A ball making no progress outside the slots (balanced or wedged on a peg) gets a shake,
  // like tapping a real board: toward the middle near a wall, harder each time it repeats.
  if (b.zone === null && stillFor(b.shake, b, SHAKE_RADIUS, now) > SHAKE_TIME) {
    const nearWall = b.cx < 220 || b.cx > board.width - 220;
    const side = nearWall ? Math.sign(board.width / 2 - b.cx) : rng() < 0.5 ? -1 : 1;
    const power = 1 + 0.5 * Math.min(b.shake.count, 4);
    setVelocity(b, side * 300 * power, -240 * power);
    b.shake.count += 1;
    b.shake.since = now;
  }
}

// A soft ball soaks up most of an impact, so on its own it barely scatters sideways and its
// landing slot follows its starting x too closely. Each fresh peg contact gets a random sideways
// nudge, like the spin a real ball picks up, to keep the outcome well mixed.
function scatter(world, b) {
  const kick = (world.rng() * 2 - 1) * PEG_SCATTER * DT;
  for (const p of b.pts) p.px -= kick;
}

// Position projection stops a ball dead against a peg, so it slides around pegs instead of
// bouncing off them and the path follows the peg layout. On a fresh contact, part of the
// incoming speed is handed back outward along the contact normal.
function rebound(b, nx, ny, restitution) {
  const vn = b.inVx * nx + b.inVy * ny;
  if (vn >= 0) return;
  const push = -vn * restitution * DT;
  for (const p of b.pts) {
    p.px -= nx * push;
    p.py -= ny * push;
  }
}

// When the floor is first touched only the skin's underside has stopped; the rest of the body
// is still falling. The whole ball leaves upward at the restitution share of its landing speed
// and keeps its sideways speed, like a rubber ball.
function bounceOffFloor(b) {
  const dvx = b.inVx - b.vx;
  const dvy = -FLOOR_RESTITUTION * b.inVy - b.vy;
  for (const p of b.pts) {
    p.px -= dvx * DT;
    p.py -= dvy * DT;
  }
}

function emitContacts(world, emit, before) {
  const { board } = world;
  for (const b of world.balls) {
    const speed = Math.hypot(b.vx, b.vy);
    for (const ob of b.touching) {
      if (before.get(b)?.has(ob)) continue;
      if (ob.kind === 'peg' || ob.kind === 'wall') {
        const d = Math.hypot(b.cx - ob.x, b.cy - ob.y) || 1e-6;
        rebound(b, (b.cx - ob.x) / d, (b.cy - ob.y) / d, PEG_RESTITUTION);
        scatter(world, b);
      }
      if (speed > 60) {
        emit({ type: 'hit', kind: ob.kind, ball: b, target: ob, speed, nx: (b.cx - ob.x) / b.R, ny: (b.cy - ob.y) / b.R });
      }
    }
    const floor = floorUnder(world, b);
    const onFloor = b.bottom >= floor - POINT_R - 0.5;
    b.onLid = onFloor && floor === board.lidY;
    if (onFloor && !b.onFloor && b.inVy > FLOOR_MIN_SPEED) {
      bounceOffFloor(b);
      scatter(world, b);
      // The jelly squashes and springs back over the next moments; slot damping would eat that.
      b.bounceAt = world.time;
    }
    if (onFloor && !b.onFloor && speed > 60) emit({ type: 'hit', kind: b.onLid ? 'lid' : 'floor', ball: b, speed, nx: 0, ny: -1 });
    b.onFloor = onFloor;
  }
}

export function stepWorld(world, emit = () => {}) {
  const { board } = world;
  const before = new Map(world.balls.map((b) => [b, b.touching]));
  const pairsBefore = world.touching;
  world.touching = new Set();
  for (const b of world.balls) {
    b.touching = new Set();
    // Damping applies to the wobble only (each point's motion relative to the whole ball).
    // Damping whole-ball motion acts like thick air: it ate sideways bounces and made the
    // landing slot follow the starting x.
    let mx = 0;
    let my = 0;
    for (const p of b.pts) {
      mx += p.x - p.px;
      my += p.y - p.py;
    }
    const inSlot = b.zone !== null && world.time - b.bounceAt > 0.35;
    const tilt = lidTilt(world, b) * DT * DT;
    const drag = inSlot ? SLOT_DRAG : AIR_DRAG;
    const damping = inSlot ? b.phys.damping * SLOT_WOBBLE_DAMPING : b.phys.damping;
    mx = (mx / POINTS) * drag;
    my = (my / POINTS) * drag;
    for (const p of b.pts) {
      const vx = mx + (p.x - p.px - mx) * damping;
      const vy = my + (p.y - p.py - my) * damping;
      p.px = p.x;
      p.py = p.y;
      p.x += vx + tilt;
      p.y += vy + board.gravity * DT * DT;
    }
  }
  for (let k = 0; k < ITER; k++) {
    for (const b of world.balls) constrain(b, b.phys);
    for (const b of world.balls) centroid(b);
    collideBalls(world);
    // Static obstacles get the last word: a neighbour shoving skin into a peg must not stick.
    for (const b of world.balls) collideStatic(world, b);
  }
  world.time += DT;
  for (const b of world.balls) {
    b.inVx = b.vx;
    b.inVy = b.vy + board.gravity * DT;
    centroid(b);
    b.vx = (b.cx - (b.prevCx ?? b.cx)) / DT;
    b.vy = (b.cy - (b.prevCy ?? b.cy)) / DT;
    b.prevCx = b.cx;
    b.prevCy = b.cy;
    let min = Infinity;
    let max = 0;
    let bottom = -Infinity;
    for (const p of b.pts) {
      const d = Math.hypot(p.x - b.cx, p.y - b.cy);
      min = Math.min(min, d);
      max = Math.max(max, d);
      bottom = Math.max(bottom, p.y);
    }
    b.squeeze = 1 - min / max;
    b.bottom = bottom;
  }
  emitContacts(world, emit, before);
  for (const key of world.touching) {
    if (pairsBefore.has(key)) continue;
    const [a, b] = key.split(':').map((id) => world.balls.find((x) => x.id === Number(id)));
    const speed = Math.hypot(a.vx - b.vx, a.vy - b.vy);
    if (speed > 60) emit({ type: 'hit', kind: 'ball', ball: a, target: b, speed, nx: 0, ny: 0 });
  }
  assignZones(world);
  slotBounces(world, emit);
  for (const b of world.balls) updateBall(world, b, emit);
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
