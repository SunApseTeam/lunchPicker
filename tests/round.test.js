import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/domain/settings.js';
import {
  DT,
  createBoard,
  equalWidths,
  maxSlots,
  minSlotWidth,
  mulberry32,
  physicsFrom,
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
  const board = createBoard(equalWidths(n), physics.radius);
  const rng = mulberry32(99);
  const starts = [];
  const ends = [];
  for (let i = 0; i < 150; i++) {
    const round = createRound(board, 1, rng, physics);
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

test('once a ball sits deep in a slot the result follows within about a second', () => {
  const board = createBoard(equalWidths(8), physics.radius);
  const lags = [];
  for (let seed = 1; seed <= 30; seed++) {
    const round = createRound(board, 1, mulberry32(seed), physics);
    let t = 0;
    let deepSince = null;
    for (let i = 0; i < 30 / DT && !round.done; i++) {
      stepRound(round);
      t += DT;
      const ball = round.world.balls[0];
      const deep = ball.zone !== null && ball.bottom > board.dividerTop + 40;
      if (!deep) deepSince = null;
      else deepSince ??= t;
    }
    assert.ok(round.done, `drop ${seed} finished`);
    lags.push(t - deepSince);
  }
  assert.ok(Math.max(...lags) < 1.2, `slowest wait after landing ${Math.max(...lags).toFixed(2)}s`);
});
