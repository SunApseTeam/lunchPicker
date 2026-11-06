import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/domain/settings.js';
import {
  DT,
  boardWidth,
  createBoard,
  createWorld,
  dropBall,
  equalWidths,
  maxSlots,
  minSlotWidth,
  mulberry32,
  physicsFrom,
  randomBumpers,
  slotWidthsWithTrigger,
  springSlots,
  stepWorld,
  triggerWidth,
} from '../src/domain/physics.js';
import { createRound, stepRound } from '../src/domain/round.js';

const physics = physicsFrom(DEFAULT_SETTINGS);
const players = (k, phys = physics) => Array.from({ length: k }, () => ({ physics: phys }));

function runRound(n, k, seed, maxSeconds, widths = equalWidths(n), phys = physics) {
  const round = createRound(createBoard(widths, phys.radius), players(k, phys), mulberry32(seed));
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

test('two slots for the same place count as one: a second ball in either is re-dropped', () => {
  // A place wanted twice gets two slots; picking two places must still name two different ones.
  const groups = ['라순', '도이', '라순', '끝장', '도이'];
  let redrops = 0;
  for (let seed = 1; seed <= 15; seed++) {
    const round = createRound(createBoard(equalWidths(groups.length), physics.radius), players(3), mulberry32(seed), groups);
    for (let i = 0; i < 120 / DT && !round.done; i++) stepRound(round, (e) => (redrops += e.type === 'redrop'));
    assert.ok(round.done, `round ${seed} finished`);
    const places = round.winners.map((slot) => groups[slot]);
    assert.equal(new Set(places).size, 3, `round ${seed} picked distinct places: ${places}`);
  }
  assert.ok(redrops > 0, 'landing in a second slot of a place already taken was re-dropped');
});

test('rounds with a place in several slots finish promptly: lids and claimed slots send balls on to free ones', () => {
  // Balls once got wedged under the bottom pegs or held on a lid, and a wobbling claimed ball
  // lost its place to a later one; each made rounds run on for a minute or more.
  const layouts = [['A', 'A', 'B', 'A', 'C'], ['B', 'C', 'A', 'A', 'A']];
  for (let seed = 1; seed <= 20; seed++) {
    const groups = layouts[seed % 2];
    const rng = mulberry32(seed);
    const board = createBoard(equalWidths(5), physics.radius, randomBumpers(rng, boardWidth(5)));
    const round = createRound(board, players(2), rng, groups);
    for (let i = 0; i < 40 / DT && !round.done; i++) stepRound(round);
    assert.ok(round.done, `round ${seed} finished within 40 s`);
    assert.notEqual(groups[round.winners[0]], groups[round.winners[1]], `round ${seed} picked two places`);
  }
});

test('no ball gets into a closed slot: one coming down on a lid slides off to an open slot', () => {
  // Two neighbouring closed slots, dropped onto right over the divider between them: the case
  // where a ball once rolled to and fro along the lids for good.
  const board = createBoard(equalWidths(5), physics.radius, []);
  const between = board.slotEdges[3];
  let lidHits = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const world = createWorld(board, mulberry32(seed), physics);
    world.closed = new Set([2, 3]);
    const ball = dropBall(world, between + (seed - 6) * 8, 0);
    for (let i = 0; i < 20 / DT && !ball.settled; i++) stepWorld(world, (e) => (lidHits += e.kind === 'lid'));
    assert.ok(ball.settled, `seed ${seed} settled within 20 s`);
    assert.ok(!world.closed.has(ball.slot), `seed ${seed} stayed out of the closed slots (slot ${ball.slot})`);
  }
  assert.ok(lidHits > 0, 'some balls came down on a lid');
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

test('the candidate cap keeps every slot beside the trigger slot wide enough for a ball', () => {
  assert.equal(maxSlots(DEFAULT_SETTINGS.size), 8);
  for (let size = 24; size <= 56; size += 4) {
    const n = maxSlots(size);
    const room = (1200 - triggerWidth(size)) / n;
    assert.ok(room >= minSlotWidth(size), `size ${size}: ${n} slots of ${room}px fit a ball`);
  }
});

test('the landing slot does not simply follow the starting position', () => {
  const n = 8;
  const rng = mulberry32(99);
  const starts = [];
  const ends = [];
  // As in the game, every drop gets its own bumper layout.
  for (let i = 0; i < 150; i++) {
    const round = createRound(createBoard(equalWidths(n), physics.radius, randomBumpers(rng)), players(1), rng);
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
    const round = createRound(board, players(1), mulberry32(seed));
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

// Over 300 drops about two in three move on (63% both with the old small pegs and the bigger ones
// with a bumper row over the slots); 120 drops keep the estimate within the bounds.
test('a landed ball often bounces on into another slot', () => {
  let landed = 0;
  let moved = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const rng = mulberry32(seed);
    const round = createRound(createBoard(equalWidths(6), physics.radius, randomBumpers(rng)), players(1), rng);
    const ball = round.world.balls[0];
    let first = null;
    for (let i = 0; i < 30 / DT && !round.done; i++) {
      stepRound(round);
      if (first === null && ball.onFloor) first = ball.zone;
    }
    landed += 1;
    if (round.winners[0] !== first) moved += 1;
  }
  assert.ok(moved / landed > 0.3 && moved / landed < 0.75, `${moved} of ${landed} balls moved on from their first slot`);
});

test('every round can get its own bumper layout, and none of them traps a ball', () => {
  const layouts = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const bumpers = randomBumpers(mulberry32(seed));
    layouts.add(JSON.stringify(bumpers));
    assert.equal(bumpers.length, 9);
    for (const a of bumpers) {
      assert.ok(a.row >= 1 && a.row <= 7, `bumper row ${a.row}`);
      for (const b of bumpers) {
        if (a !== b) assert.ok(Math.abs(a.row - b.row) > 1 || Math.abs(a.x - b.x) > 190, 'bumpers do not touch');
      }
    }
    const board = createBoard(equalWidths(6), physics.radius, bumpers);
    assert.equal(board.pegs.filter((p) => p.kind === 'bumper').length, 9);
    const round = createRound(board, players(3), mulberry32(seed));
    for (let i = 0; i < 90 / DT && !round.done; i++) stepRound(round);
    assert.ok(round.done, `layout ${seed} finished`);
  }
  assert.ok(layouts.size > 25, `${layouts.size} different layouts`);
});

test('even the narrowest boards get four bumpers', () => {
  for (const slots of [2, 3]) {
    for (let seed = 1; seed <= 10; seed++) assert.equal(randomBumpers(mulberry32(seed), boardWidth(slots)).length, 4, `${slots} slots`);
  }
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
      const round = createRound(createBoard(equalWidths(n), physics.radius, randomBumpers(rng, boardWidth(n))), players(Math.max(1, n - 1)), rng);
      for (let i = 0; i < 120 / DT && !round.done; i++) stepRound(round);
      assert.ok(round.done, `${n} slots, round ${seed} finished`);
      assert.equal(new Set(round.winners).size, Math.max(1, n - 1));
    }
  }
});

// The spring trigger slot: one extra slot among the places' slots, with a button for a floor.
test('the trigger slot sits among the places, which share the rest of the board equally', () => {
  for (let n = 2; n <= maxSlots(physics.radius); n++) {
    for (let at = 0; at <= n; at++) {
      const widths = slotWidthsWithTrigger(n, physics.radius, at);
      assert.equal(widths.length, n + 1);
      assert.ok(Math.abs(widths.reduce((a, b) => a + b, 0) - boardWidth(n + 1)) < 1e-6);
      assert.equal(widths[at], triggerWidth(physics.radius));
      for (const [i, w] of widths.entries()) if (i !== at) assert.ok(w >= minSlotWidth(physics.radius), `${n} places: ${Math.round(w)} fits a ball`);
    }
  }
});

test('a ball dropping into the trigger slot presses it once, springing every slot at that moment', () => {
  let pressedRounds = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const at = 1;
    const widths = slotWidthsWithTrigger(3, physics.radius, at);
    const board = createBoard(widths, physics.radius, [], at);
    const x = (board.slotEdges[at] + board.slotEdges[at + 1]) / 2;
    const round = createRound(board, [0.3, 0.5, 0.7, 0.5].map((f, i) => ({ physics, x: i === 1 ? x : board.width * f, counts: i < 2 })), mulberry32(seed));
    const events = [];
    for (let i = 0; i < 90 / DT && !round.done; i++) stepRound(round, (e) => events.push({ ...e, step: i }));
    assert.ok(round.done, `seed ${seed}: finished`);
    assert.ok(!round.winners.includes(at), `seed ${seed}: the trigger slot is nobody's place`);
    const presses = events.filter((e) => e.type === 'trigger');
    const springs = events.filter((e) => e.type === 'spring');
    assert.ok(presses.length <= 1, `seed ${seed}: pressed at most once`);
    assert.equal(springs.length, presses.length, `seed ${seed}: a spring for each press`);
    if (presses.length === 0) continue;
    pressedRounds += 1;
    assert.equal(springs[0].step, presses[0].step, `seed ${seed}: the springs go off the moment it is pressed`);
    assert.ok(springs[0].balls.includes(presses[0].ball), `seed ${seed}: the one who pressed it is thrown up too`);
  }
  assert.ok(pressedRounds >= 4, `pressed in ${pressedRounds} of 12 rounds`);
});

test('the springs throw every ball in the slots back up, settled ones too, and no other', () => {
  const board = createBoard(equalWidths(3), physics.radius);
  const world = createWorld(board, mulberry32(4), physics);
  const low = dropBall(world, board.width * 0.2, 0);
  const high = dropBall(world, board.width * 0.8, 0);
  for (let i = 0; i < 12 / DT && !low.settled; i++) stepWorld(world);
  high.pts.forEach((p) => {
    p.y = p.py = p.y - (high.cy - board.pegTop);
  });
  stepWorld(world);
  assert.ok(low.settled && high.zone === null);
  assert.deepEqual(springSlots(world), [low]);
  stepWorld(world);
  assert.ok(low.vy < -1000, `thrown up at ${Math.round(-low.vy)}`);
  let top = low.cy;
  for (let i = 0; i < 1 / DT; i++) {
    stepWorld(world);
    top = Math.min(top, low.cy);
  }
  assert.ok(top < board.pegBottom + 40, 'back up among the bottom pegs');
});

test('a board without a trigger never springs', () => {
  const round = createRound(createBoard(equalWidths(3), physics.radius), players(2), mulberry32(3));
  const types = new Set();
  for (let i = 0; i < 60 / DT && !round.done; i++) stepRound(round, (e) => types.add(e.type));
  assert.ok(round.done);
  assert.ok(!types.has('trigger') && !types.has('spring'));
});
