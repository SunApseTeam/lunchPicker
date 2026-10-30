import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/domain/settings.js';
import {
  DT,
  boardWidth,
  createBoard,
  equalWidths,
  maxSlots,
  minSlotWidth,
  mulberry32,
  physicsFrom,
  randomBumpers,
} from '../src/domain/physics.js';
import { createRound, stepRound } from '../src/domain/round.js';

const physics = physicsFrom(DEFAULT_SETTINGS);

function runRound(n, k, seed, maxSeconds, widths = equalWidths(n), phys = physics) {
  const round = createRound(createBoard(widths, phys.radius), k, mulberry32(seed), phys);
  const events = [];
  for (let i = 0; i < maxSeconds / DT && !round.done; i++) stepRound(round, (e) => events.push(e));
  return { round, events };
}

test('picking k of n always yields k distinct slots', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const { round } = runRound(6, 3, seed, 90);
    assert.ok(round.done, `round ${seed} finished`);
    assert.equal(new Set(round.winners).size, 3, `round ${seed} winners distinct: ${round.winners}`);
  }
});

test('crowded rounds finish, with balls bouncing off settled ones and re-drops sorting out the rest', () => {
  let slotBounces = 0;
  let redrops = 0;
  for (const [n, k, seeds] of [[10, 5, 12], [6, 5, 6]]) {
    for (let seed = 1; seed <= seeds; seed++) {
      const { round, events } = runRound(n, k, seed, 120);
      assert.ok(round.done, `n=${n} k=${k} round ${seed} finished`);
      assert.equal(new Set(round.winners).size, k);
      slotBounces += events.filter((e) => e.kind === 'slotBounce').length;
      redrops += events.filter((e) => e.type === 'redrop').length;
    }
  }
  assert.ok(slotBounces > 0, 'a ball landing on a settled ball was flung off it');
  assert.ok(redrops > 0, 'same-slot landings were re-dropped');
});

test('a single drop settles within 20 simulated seconds, at the softest and the firmest setting', () => {
  for (const softness of [100, 0]) {
    const phys = physicsFrom({ ...DEFAULT_SETTINGS, softness });
    for (let seed = 1; seed <= 40; seed++) {
      const { round } = runRound(8, 1, seed, 20, equalWidths(8), phys);
      assert.ok(round.done, `softness ${softness} drop ${seed} settled`);
    }
  }
});

test('the candidate cap keeps every equal-width slot wide enough for a ball', () => {
  assert.equal(maxSlots(DEFAULT_SETTINGS.size), 10);
  for (let size = 24; size <= 56; size += 4) {
    const n = maxSlots(size);
    assert.ok(1200 / n >= minSlotWidth(size), `size ${size}: ${n} slots of ${1200 / n}px fit a ball`);
  }
});

test('the landing slot does not simply follow the starting position', () => {
  const n = 8;
  const rng = mulberry32(99);
  const starts = [];
  const ends = [];
  // As in the game, every drop gets its own bumper layout.
  for (let i = 0; i < 150; i++) {
    const round = createRound(createBoard(equalWidths(n), physics.radius, randomBumpers(rng)), 1, rng, physics);
    starts.push(round.world.balls[0].cx);
    for (let s = 0; s < 40 / DT && !round.done; s++) stepRound(round);
    ends.push(round.world.balls[0].cx);
  }
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const ms = mean(starts);
  const me = mean(ends);
  const cov = mean(starts.map((s, i) => (s - ms) * (ends[i] - me)));
  const sd = (a, m) => Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
  const corr = cov / (sd(starts, ms) * sd(ends, me));
  assert.ok(Math.abs(corr) < 0.3, `start/landing correlation ${corr.toFixed(2)} is weak`);
});

test('once a ball stops bouncing in a slot the result follows within about a second', () => {
  const board = createBoard(equalWidths(8), physics.radius);
  const lags = [];
  for (let seed = 1; seed <= 30; seed++) {
    const round = createRound(board, 1, mulberry32(seed), physics);
    let t = 0;
    let lastBounce = 0;
    for (let i = 0; i < 30 / DT && !round.done; i++) {
      stepRound(round);
      t += DT;
      const ball = round.world.balls[0];
      if (ball.zone === null || Math.hypot(ball.vx, ball.vy) > 200) lastBounce = t;
    }
    assert.ok(round.done, `drop ${seed} finished`);
    lags.push(t - lastBounce);
  }
  assert.ok(Math.max(...lags) < 1.2, `slowest wait after the last bounce ${Math.max(...lags).toFixed(2)}s`);
});

test('a landed ball often bounces on into another slot', () => {
  let landed = 0;
  let moved = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const rng = mulberry32(seed);
    const round = createRound(createBoard(equalWidths(6), physics.radius, randomBumpers(rng)), 1, rng, physics);
    const ball = round.world.balls[0];
    let first = null;
    for (let i = 0; i < 30 / DT && !round.done; i++) {
      stepRound(round);
      if (first === null && ball.onFloor) first = ball.zone;
    }
    landed += 1;
    if (round.winners[0] !== first) moved += 1;
  }
  assert.ok(moved / landed > 0.3 && moved / landed < 0.7, `${moved} of ${landed} balls moved on from their first slot`);
});

test('every round can get its own bumper layout, and none of them traps a ball', () => {
  const layouts = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const bumpers = randomBumpers(mulberry32(seed));
    layouts.add(JSON.stringify(bumpers));
    assert.equal(bumpers.length, 6);
    for (const a of bumpers) {
      assert.ok(a.row >= 1 && a.row <= 6, `bumper row ${a.row}`);
      for (const b of bumpers) {
        if (a !== b) assert.ok(Math.abs(a.row - b.row) > 1 || Math.abs(a.x - b.x) > 190, 'bumpers do not touch');
      }
    }
    const board = createBoard(equalWidths(6), physics.radius, bumpers);
    assert.equal(board.pegs.filter((p) => p.kind === 'bumper').length, 6);
    const round = createRound(board, 3, mulberry32(seed), physics);
    for (let i = 0; i < 90 / DT && !round.done; i++) stepRound(round);
    assert.ok(round.done, `layout ${seed} finished`);
  }
  assert.ok(layouts.size > 25, `${layouts.size} different layouts`);
});

test('with few slots the board narrows, so a slot is about as wide for 2 as for 6', () => {
  for (let n = 2; n <= 6; n++) {
    const board = createBoard(equalWidths(n), physics.radius);
    const slot = board.slotEdges[1] - board.slotEdges[0];
    assert.equal(board.width, boardWidth(n));
    assert.ok(slot >= 195 && slot <= 225, `${n} slots are ${slot.toFixed(0)}px wide`);
    assert.ok(board.pegs.every((p) => p.x >= 0 && p.x <= board.width), `${n} slots: pegs stay on the board`);
  }
  assert.equal(boardWidth(9), 1200);
});

test('narrow boards finish even when nearly every slot gets a ball', () => {
  for (let n = 2; n <= 5; n++) {
    for (let seed = 1; seed <= 6; seed++) {
      const rng = mulberry32(seed * 13 + n);
      const round = createRound(createBoard(equalWidths(n), physics.radius, randomBumpers(rng, boardWidth(n))), Math.max(1, n - 1), rng, physics);
      for (let i = 0; i < 120 / DT && !round.done; i++) stepRound(round);
      assert.ok(round.done, `${n} slots, round ${seed} finished`);
      assert.equal(new Set(round.winners).size, Math.max(1, n - 1));
    }
  }
});
