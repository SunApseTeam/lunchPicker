import { branchTop, vineAngle } from '../../domain/physics.js';

// The vines of the 계곡 map, which stand in for its pegs: this round's branches across the board,
// a few vines draped over each, each swaying in the wind with a leafy tip near where a peg would
// be. A stiffer vine is drawn thicker, a stretchier one thinner.
// A ball swinging on one pulls it taut to the ball, with a bright swoosh along the arc it has
// swung; once let go, the vine swings on a little before the wind takes it again.
const STEM = '#4f8a2e';
const STEM_INK = 'rgba(40, 70, 25, 0.85)';
const LEAF = '#7cc04f';
const LEAF_INK = 'rgba(45, 90, 30, 0.7)';
const BARK = '#7a5a3a';
const BARK_INK = 'rgba(60, 40, 22, 0.8)';
// How a vine swings on after a ball lets go: how fast it sways and how soon it calms.
const SWAY_RATE = 4;
const SWAY_CALM = 2.5;

export function createVines(ctx) {
  // vine -> how it was left: { at, angle } when a ball let go of it.
  const left = new Map();
  // vine -> where a ball caught it: { angle } in radians from straight down.
  const caught = new Map();

  function onEvent(event, now) {
    if (event.type !== 'vine') return;
    const { vine, ball } = event;
    if (event.action === 'grab') {
      left.delete(vine);
      caught.set(vine, { angle: Math.atan2(ball.cx - vine.x, ball.cy - vine.y) });
    } else {
      caught.delete(vine);
      left.set(vine, { at: now, angle: event.angle });
    }
  }

  function leaf(x, y, angle, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = LEAF;
    ctx.strokeStyle = LEAF_INK;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(size, 0, size, size * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // A branch, tilted a little, with tufts of leaves at its ends.
  function branch(b) {
    const top = (x) => branchTop(b, x) + Math.sin(x * 0.04 + b.y) * 2;
    ctx.lineCap = 'round';
    for (const [color, wide] of [[BARK_INK, 11], [BARK, 7.5]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = wide;
      ctx.beginPath();
      ctx.moveTo(b.x0, top(b.x0));
      for (let x = b.x0 + 20; x < b.x1; x += 20) ctx.lineTo(x, top(x));
      ctx.lineTo(b.x1, top(b.x1));
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    for (const [x, turn] of [[b.x0 + 6, -2.4], [b.x1 - 6, -0.7]]) {
      leaf(x, top(x) - 3, turn, 10);
      leaf(x, top(x) - 1, turn + 0.8, 8);
    }
  }

  // A vine draped over the branch at (x0, y0), hanging to (x1, y1), its tip a bunch of leaves.
  function vine(x0, y0, x1, y1, sag, tipLeaves, thick) {
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const cx = mx + (-(y1 - y0) / len) * sag;
    const cy = my + ((x1 - x0) / len) * sag;
    ctx.lineCap = 'round';
    for (const [color, wide] of [[STEM_INK, thick + 3], [STEM, thick]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = wide;
      ctx.beginPath();
      // Over the top of the branch first, then down.
      ctx.moveTo(x0 - 7, y0 + 4);
      ctx.quadraticCurveTo(x0 - 3, y0 - 9, x0 + 2, y0 - 2);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    for (let i = 1, t = 0.2; t < 0.9; t += 0.14, i++) {
      const u = 1 - t;
      const px = u * u * x0 + 2 * u * t * cx + t * t * x1;
      const py = u * u * y0 + 2 * u * t * cy + t * t * y1;
      leaf(px, py, Math.atan2(y1 - y0, x1 - x0) + (i % 2 ? 1 : -1) * 1.2, 8);
    }
    if (!tipLeaves) return;
    const down = Math.atan2(y1 - y0, x1 - x0);
    for (const turn of [-0.9, 0, 0.9]) leaf(x1, y1, down + turn, 10);
    ctx.fillStyle = '#c8ef8a';
    ctx.beginPath();
    ctx.arc(x1, y1, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // The swoosh: a bright band along the arc the ball has swung since it caught the vine.
  function swoosh(v, ball, now) {
    const from = caught.get(v);
    if (!from) return;
    const angle = Math.atan2(ball.cx - v.x, ball.cy - v.y);
    const r = Math.hypot(ball.cx - v.x, ball.cy - v.y);
    ctx.save();
    ctx.lineCap = 'round';
    for (const [color, alpha, wide] of [['190, 240, 110', 0.35, ball.R * 1.4], ['255, 255, 220', 0.7, ball.R * 0.45]]) {
      ctx.strokeStyle = `rgba(${color}, ${alpha + 0.08 * Math.sin(now * 20)})`;
      ctx.lineWidth = wide;
      ctx.beginPath();
      ctx.arc(v.x, v.y, r, Math.PI / 2 - from.angle, Math.PI / 2 - angle, angle > from.angle);
      ctx.stroke();
    }
    ctx.restore();
  }

  // world: the round being played on this board, if any: its clock sets the wind, so the vines
  // are drawn where the balls meet them, and it says who swings on which vine.
  function draw(board, world, now) {
    if (!board.vines?.length) return;
    const live = world?.board === board ? world : null;
    const t = live?.time ?? now;
    const holding = new Map((live?.vines ?? []).filter((v) => v.ball).map((v) => [v.vine, v.ball]));
    for (const b of board.branches) branch(b);
    for (const v of board.vines) {
      const thick = 3 + Math.min(3.5, v.spring / 400);
      const ball = holding.get(v);
      if (ball) {
        swoosh(v, ball, now);
        vine(v.x, v.y, ball.cx, ball.cy, 0, false, thick);
        continue;
      }
      const was = left.get(v);
      const after = was ? now - was.at : Infinity;
      const a = vineAngle(v, t) + (after < 3 ? was.angle * Math.exp(-after * SWAY_CALM) * Math.cos(after * SWAY_RATE) : 0);
      vine(v.x, v.y, v.x + Math.sin(a) * v.length, v.y + Math.cos(a) * v.length, -a * 14, true, thick);
    }
  }

  return { draw, onEvent };
}
