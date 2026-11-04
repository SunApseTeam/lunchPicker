import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/domain/settings.js';
import { DT, boardWidth, createBoard, equalWidths, mulberry32, randomBumpers } from '../src/domain/physics.js';
import { createRound, stepRound } from '../src/domain/round.js';
import { TEAM, memberPhysics } from '../src/domain/team.js';

test('every member fits the board the settings size was built for', () => {
  for (const size of [24, 40, DEFAULT_SETTINGS.size, 56]) {
    for (const m of TEAM) {
      const r = memberPhysics({ ...DEFAULT_SETTINGS, size }, m).radius;
      assert.ok(r <= size && r >= size * 0.85 - 1, `${m.id} at size ${size}: ${r}`);
    }
  }
  assert.equal(new Set(TEAM.map((m) => m.id)).size, TEAM.length);
  for (const m of TEAM) assert.ok(m.lines.length > 0, `${m.id} has something to say`);
});

test('a mixed team drops from its spots, lands in distinct places and finishes', () => {
  const rng = mulberry32(7);
  for (let round = 0; round < 24; round++) {
    const n = 4 + (round % 4);
    const k = 1 + (round % 3);
    const chosen = [...TEAM].sort(() => rng() - 0.5).slice(0, k);
    const board = createBoard(equalWidths(n), DEFAULT_SETTINGS.size, randomBumpers(rng, boardWidth(n)));
    const spots = chosen.map((_, i) => ((i + 1) * board.width) / (k + 1));
    const players = chosen.map((m, i) => ({ physics: memberPhysics(DEFAULT_SETTINGS, m), x: spots[i] }));
    const r = createRound(board, players, rng);
    r.world.balls.forEach((b, i) => assert.equal(Math.round(b.cx), Math.round(spots[i]), 'drops where it waited'));
    for (let i = 0; i < 60 / DT && !r.done; i++) stepRound(r);
    assert.ok(r.done, `round ${round} (${k} of ${n}) finished`);
    assert.equal(r.winners.length, k);
    assert.equal(new Set(r.winners).size, k, `distinct places: ${r.winners}`);
  }
});
