import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALL } from '../src/domain/settings.js';
import {
  DT,
  FIXED_BUMPERS,
  GEOMETRY,
  boardWidth,
  branchTop,
  createBoard,
  createWorld,
  dropBall,
  equalWidths,
  mulberry32,
  physicsFrom,
  randomVineField,
  stepWorld,
  vineAngle,
} from '../src/domain/physics.js';
import { createRound, stepRound } from '../src/domain/round.js';

const physics = physicsFrom(BALL);
const g = GEOMETRY;
const fieldFor = (seed, rows = g.pegRows) => randomVineField(mulberry32(seed), boardWidth(6), rows);
const vineBoard = (field) => createBoard(equalWidths(6), BALL.size, FIXED_BUMPERS, null, field.rows ?? g.pegRows, field);

test('a vine hangs near each peg place below the top row, on a branch, and there are no pegs or bumpers', () => {
  for (const rows of [8, 12]) {
    for (let seed = 1; seed <= 20; seed++) {
      const field = randomVineField(mulberry32(seed), boardWidth(6), rows);
      const plain = createBoard(equalWidths(6), BALL.size, FIXED_BUMPERS, null, rows);
      const board = createBoard(equalWidths(6), BALL.size, FIXED_BUMPERS, null, rows, field);
      assert.deepEqual(board.pegs, plain.pegs.filter((p) => p.kind === 'wall'), 'only the wall bumps stay');
      const places = plain.pegs.filter((p) => p.kind !== 'wall' && p.y > g.pegTop);
      assert.equal(board.vines.length, places.length);
      for (const p of places) {
        assert.ok(board.vines.some((v) => Math.abs(v.x - p.x) <= 20 && Math.abs(v.y + v.length - p.y) <= 25), `a tip near ${p.x},${p.y}`);
      }
      for (const v of board.vines) {
        assert.ok(board.branches.some((b) => v.x >= b.x0 && v.x <= b.x1 && Math.abs(branchTop(b, v.x) - v.y) < 1e-9), 'tied on a branch');
        assert.ok(v.y > g.dropY, 'tied below the drop line');
      }
    }
  }
  assert.deepEqual(createBoard(equalWidths(6)).vines, [], 'other maps have none');
});

test('every vine is its own: length, stiffness, sway and kick vary, and the field differs between rounds', () => {
  const { vines } = fieldFor(1);
  for (const key of ['length', 'spring', 'sway', 'rate', 'kick']) {
    const values = vines.map((v) => v[key]);
    assert.ok(Math.max(...values) - Math.min(...values) > 0.3 * Math.max(...values), `${key} varies: ${Math.min(...values).toFixed(2)}..${Math.max(...values).toFixed(2)}`);
  }
  assert.ok(vines.every((v) => v.spring > 0 && v.length > 90));
  assert.notDeepEqual(fieldFor(1).branches, fieldFor(2).branches);
  assert.deepEqual(fieldFor(1), fieldFor(1), 'the same seed, the same field');
});

test('the vines sway in the wind, each as far and as fast as its own', () => {
  const [a, b] = fieldFor(3).vines;
  const angles = Array.from({ length: 80 }, (_, i) => vineAngle(a, i * 0.2));
  assert.ok(Math.max(...angles) > a.sway * 0.8 && Math.min(...angles) < -a.sway * 0.8, 'swings both ways');
  assert.ok(angles.every((x) => Math.abs(x) <= a.sway + 1e-9), 'within its reach');
  assert.notEqual(vineAngle(a, 3).toFixed(3), vineAngle(b, 3).toFixed(3), 'neighbours out of step');
});

// A ball dropped just left of a vine's tip at a moment it hangs straight down.
function swingOn(vine, steps = 2 / DT) {
  const board = vineBoard({ branches: [], vines: [vine] });
  const world = createWorld(board, mulberry32(1), physics);
  world.time = (2 * Math.PI - vine.phase) / vine.rate;
  const ball = dropBall(world, vine.x - 20, 0, physics, vine.y + vine.length - 15);
  const events = [];
  let leapt = null;
  let sank = 0;
  for (let i = 0; i < steps && !leapt; i++) {
    stepWorld(world, (e) => {
      if (e.type === 'vine') events.push({ ...e, x: ball.cx, t: world.time });
    });
    if (ball.vine) sank = Math.max(sank, Math.hypot(ball.cx - vine.x, ball.cy - vine.y) - vine.length);
    if (events.at(-1)?.action !== 'release') continue;
    // The leap shows in the ball's speed over the next step.
    stepWorld(world);
    leapt = { vx: ball.vx, vy: ball.vy };
  }
  return { events, leapt, sank };
}

const vine = { x: 509, y: g.pegTop + 2 * g.rowGap - 200, length: 200, sway: 0.3, rate: 1, phase: 1, spring: 1500, kick: 1 };

test('a ball falling onto a vine tip swings across to the other side and leaps off', () => {
  const { events, leapt } = swingOn(vine);
  const [grab, release] = events;
  assert.equal(grab?.action, 'grab', 'caught the tip');
  assert.equal(release?.action, 'release', 'let go of it');
  assert.ok(release.x > vine.x + 30, `caught on the left, let go on the right: ${release.x.toFixed(0)}`);
  assert.ok(release.t - grab.t >= 0.2 && release.t - grab.t < 1.7, `held on a while: ${(release.t - grab.t).toFixed(2)}s`);
  assert.ok(leapt.vx > 200 && leapt.vy < 0, `leapt onward and up: ${leapt.vx.toFixed(0)}, ${leapt.vy.toFixed(0)}`);
});

test('a stretchier vine gives under the ball, and a springier one throws it harder', () => {
  const stiff = swingOn(vine);
  const soft = swingOn({ ...vine, spring: 400 });
  assert.ok(soft.sank > stiff.sank + 3, `sinks past its length: ${soft.sank.toFixed(1)} vs ${stiff.sank.toFixed(1)}`);
  const strong = swingOn({ ...vine, kick: 1.35 });
  assert.ok(Math.hypot(strong.leapt.vx, strong.leapt.vy) > Math.hypot(stiff.leapt.vx, stiff.leapt.vy), 'leaps off faster');
});

test('rounds on the vine map still end with distinct winners, and balls do swing', () => {
  let caught = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const board = createBoard(equalWidths(6), BALL.size, [], null, g.pegRows, fieldFor(seed * 7));
    const round = createRound(board, Array.from({ length: 6 }, () => ({ physics })), mulberry32(seed));
    for (let i = 0; i < 90 / DT && !round.done; i++) stepRound(round, (e) => (caught += e.type === 'vine' && e.action === 'grab'));
    assert.ok(round.done, `round ${seed} finished`);
    assert.equal(new Set(round.winners.map((w) => w.slot)).size, 6);
  }
  assert.ok(caught >= 60, `vines caught ${caught} times in 10 rounds`);
});
