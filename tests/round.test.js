import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALL } from '../src/domain/settings.js';
import {
  DT,
  GEOMETRY,
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

const slotsOf = (round) => round.winners.map((w) => w.slot);

const physics = physicsFrom(BALL);
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
    assert.equal(new Set(slotsOf(round)).size, 3, `round ${seed} winners distinct: ${slotsOf(round)}`);
  }
});

test('crowded rounds finish, with balls bouncing off settled ones and re-drops sorting out the rest', () => {
  let slotBounces = 0;
  let redrops = 0;
  for (const [n, k, seeds] of [[10, 5, 12], [6, 5, 6]]) {
    for (let seed = 1; seed <= seeds; seed++) {
      const { round, events } = runRound(n, k, seed, 120);
      assert.ok(round.done, `n=${n} k=${k} round ${seed} finished`);
      assert.equal(new Set(slotsOf(round)).size, k);
      slotBounces += events.filter((e) => e.kind === 'slotBounce').length;
      redrops += events.filter((e) => e.type === 'redrop').length;
    }
  }
  assert.ok(slotBounces > 0, 'a ball landing on a settled ball was flung off it');
  assert.ok(redrops > 0, 'same-slot landings were re-dropped');
});

test('as many balls as slots: each ball takes a slot of its own, and the round ends once the winning slots are taken', () => {
  for (const [n, k] of [[3, 1], [6, 2], [8, 1]]) {
    for (let seed = 1; seed <= 6; seed++) {
      const rng = mulberry32(seed * 7 + n);
      const at = seed % (n + 1);
      const board = createBoard(slotWidthsWithTrigger(n, physics.radius, at), physics.radius, randomBumpers(rng, boardWidth(n + 1)), at);
      const wins = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((i) => i !== at && i <= n).slice(seed % 2, (seed % 2) + k);
      const round = createRound(board, players(n), rng, wins);
      for (let i = 0; i < 90 / DT && !round.done; i++) stepRound(round);
      assert.ok(round.done, `${n} balls, round ${seed} finished`);
      assert.deepEqual(slotsOf(round), wins, `${n} balls, round ${seed}: one winner for each winning slot`);
      const owners = [...round.owners.values()];
      assert.equal(new Set(owners).size, owners.length, 'no ball holds two slots');
      assert.equal(new Set(round.winners.map((w) => w.player)).size, k, 'each winning slot is held by a different ball');
    }
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
    const phys = physicsFrom({ ...BALL, softness });
    for (let seed = 1; seed <= 40; seed++) {
      const { round } = runRound(8, 1, seed, 20, equalWidths(8), phys);
      assert.ok(round.done, `softness ${softness} drop ${seed} settled`);
    }
  }
});

test('the candidate cap keeps every slot beside the trigger slot wide enough for a ball', () => {
  assert.equal(maxSlots(BALL.size), 8);
  for (let size = 24; size <= 56; size += 4) {
    const n = maxSlots(size);
    const room = (GEOMETRY.width - triggerWidth(size)) / n;
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
    if (round.winners[0].slot !== first) moved += 1;
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
  assert.equal(boardWidth(9), GEOMETRY.width);
});

test('narrow boards finish even when nearly every slot gets a ball', () => {
  for (let n = 2; n <= 5; n++) {
    for (let seed = 1; seed <= 6; seed++) {
      const rng = mulberry32(seed * 13 + n);
      const round = createRound(createBoard(equalWidths(n), physics.radius, randomBumpers(rng, boardWidth(n))), players(Math.max(1, n - 1)), rng);
      for (let i = 0; i < 120 / DT && !round.done; i++) stepRound(round);
      assert.ok(round.done, `${n} slots, round ${seed} finished`);
      assert.equal(new Set(slotsOf(round)).size, Math.max(1, n - 1));
    }
  }
});

test('every board has full peg rows that sit evenly between its walls', () => {
  for (let slots = 2; slots <= 13; slots++) {
    const board = createBoard(equalWidths(slots), physics.radius, []);
    for (let row = 0; row < board.pegRows; row++) {
      const y = board.pegTop + row * board.rowGap;
      const xs = board.pegs.filter((p) => p.kind !== 'wall' && p.y === y).map((p) => p.x);
      const left = xs[0];
      const right = board.width - xs.at(-1);
      assert.ok(Math.abs(left - right) < 1, `${slots} slots, row ${row}: ${left} to the left wall, ${right} to the right`);
      assert.ok(left <= 129 + board.colGap / 2 + 1, `${slots} slots, row ${row}: no column missing at the edge (${left})`);
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

test('the trigger slot opens when the first ball lands elsewhere, then is pressed at most once, springing every slot at that moment', () => {
  let pressedRounds = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const at = 1;
    const widths = slotWidthsWithTrigger(3, physics.radius, at);
    const board = createBoard(widths, physics.radius, [], at);
    const x = (board.slotEdges[at] + board.slotEdges[at + 1]) / 2;
    const round = createRound(board, [0.3, 0.5, 0.7].map((f, i) => ({ physics, x: i === 1 ? x : board.width * f })), mulberry32(seed));
    assert.ok(round.world.closed.has(at), `seed ${seed}: shut at the start`);
    const events = [];
    let openedWith = null;
    for (let i = 0; i < 90 / DT && !round.done; i++) {
      stepRound(round, (e) => {
        events.push({ ...e, step: i });
        if (e.type === 'open') openedWith = round.world.balls.filter((b) => b.onFloor && !b.onLid).map((b) => b.zone);
      });
    }
    assert.ok(round.done, `seed ${seed}: finished`);
    assert.ok(!slotsOf(round).includes(at), `seed ${seed}: the trigger slot is nobody's place`);
    const opens = events.filter((e) => e.type === 'open');
    assert.equal(opens.length, 1, `seed ${seed}: opened once`);
    assert.ok(openedWith.some((z) => z !== at) && !openedWith.includes(at), `seed ${seed}: opened by a landing in another slot`);
    const presses = events.filter((e) => e.type === 'trigger');
    const springs = events.filter((e) => e.type === 'spring');
    assert.ok(presses.length <= 1, `seed ${seed}: pressed at most once`);
    assert.equal(springs.length, presses.length, `seed ${seed}: a spring for each press`);
    if (presses.length === 0) continue;
    pressedRounds += 1;
    assert.ok(presses[0].step >= opens[0].step, `seed ${seed}: not pressed while shut`);
    assert.equal(springs[0].step, presses[0].step, `seed ${seed}: the springs go off the moment it is pressed`);
    assert.ok(springs[0].balls.includes(presses[0].ball), `seed ${seed}: the one who pressed it is thrown up too`);
  }
  assert.ok(pressedRounds >= 4, `pressed in ${pressedRounds} of 12 rounds`);
});

test('with a chaos delay, the trigger slot opens that long after the first landing, not before', () => {
  for (const delay of [2, 5]) {
    const at = 1;
    const board = createBoard(slotWidthsWithTrigger(3, physics.radius, at), physics.radius, [], at);
    // One ball more than there are places, so the round runs on until the slot opens.
    const round = createRound(board, [0.2, 0.5, 0.8, 0.9].map((f) => ({ physics, x: board.width * f })), mulberry32(delay), null, { chaosDelay: delay });
    let landed = null;
    let opened = null;
    for (let i = 0; i < 30 / DT && opened === null; i++) {
      stepRound(round, (e) => {
        if (e.type === 'open') opened = round.world.time;
      });
      if (landed === null && round.world.balls.some((b) => b.onFloor && !b.onLid && b.zone !== at)) landed = round.world.time;
      if (opened === null) assert.ok(round.world.closed.has(at), `delay ${delay}: still shut at ${round.world.time.toFixed(2)}s`);
    }
    assert.ok(opened !== null, `delay ${delay}: opened`);
    assert.ok(Math.abs(opened - landed - delay) < 0.05, `delay ${delay}: landed at ${landed.toFixed(2)}s, opened at ${opened.toFixed(2)}s`);
  }
});

test('once open, the button reaches past the slot mouth: a ball just above it presses it, and the slot is covered soon after', () => {
  const at = 2;
  const board = createBoard(slotWidthsWithTrigger(2, physics.radius, at), physics.radius, [], at);
  const round = createRound(board, [{ physics, x: board.slotEdges[1] / 2 }], mulberry32(5));
  for (let i = 0; i < 30 / DT && round.trigger.openAt === null; i++) stepRound(round);
  assert.notEqual(round.trigger.openAt, null, 'opened by the first landing');
  assert.ok(!round.world.closed.has(at), 'open');
  // Hanging just over the mouth, not yet in the slot, as if it had rolled up to it.
  const x = (board.slotEdges[at] + board.slotEdges[at + 1]) / 2;
  const ball = dropBall(round.world, x, 0, physics, board.dividerTop - 16 - physics.radius);
  ball.player = 0;
  const types = [];
  stepRound(round, (e) => types.push(e.type));
  assert.equal(round.trigger.by, ball);
  assert.ok(types.includes('spring'));
  for (let i = 0; i < 0.6 / DT; i++) stepRound(round);
  assert.ok(round.world.closed.has(at), 'covered once the springs have gone off');
});

test('a ball left sitting on a lid, with nowhere to slide to, is dropped again, glowing', () => {
  const board = createBoard(equalWidths(2), physics.radius, []);
  const round = createRound(board, [{ physics, x: board.width * 0.25 }], mulberry32(2));
  round.world.closed = new Set([0, 1]);
  const redrops = [];
  for (let i = 0; i < 8 / DT && redrops.length === 0; i++) stepRound(round, (e) => e.type === 'redrop' && redrops.push(e));
  assert.equal(redrops.length, 1, 'dropped again off the lid');
  assert.ok(round.world.balls[0].charged, 'glows on the way down');
});

test('a ball comes to rest in the middle of its slot\'s bowl', () => {
  const board = createBoard(equalWidths(4), physics.radius, []);
  for (const [i, f] of [0.12, 0.4, 0.63, 0.88].entries()) {
    const world = createWorld(board, mulberry32(10 + i), physics);
    const ball = dropBall(world, board.width * f, 0, physics, board.dividerTop - physics.radius - 5);
    for (let s = 0; s < 6 / DT; s++) stepWorld(world);
    const mid = (board.slotEdges[ball.zone] + board.slotEdges[ball.zone + 1]) / 2;
    assert.ok(Math.abs(ball.cx - mid) < 25, `dropped at ${f}: rests ${Math.round(ball.cx - mid)}px from the middle`);
  }
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
  assert.ok(top < board.pegBottom - 2 * board.rowGap, `flies up through the bottom peg rows (to ${Math.round(board.pegBottom - top)} above them)`);
});

test('a board without a trigger never springs', () => {
  const round = createRound(createBoard(equalWidths(3), physics.radius), players(2), mulberry32(3));
  const types = new Set();
  for (let i = 0; i < 60 / DT && !round.done; i++) stepRound(round, (e) => types.add(e.type));
  assert.ok(round.done);
  assert.ok(!types.has('trigger') && !types.has('spring'));
});
