import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/domain/settings.js';
import { DT, boardWidth, createBoard, equalWidths, mulberry32, randomBumpers } from '../src/domain/physics.js';
import { createRound, stepRound } from '../src/domain/round.js';
import { DEFAULT_TEAM as TEAM, SITUATIONS, memberPhysics, parseMember } from '../src/domain/team.js';
import { createLunchService } from '../src/application/lunch.js';

test('every member fits the board the settings size was built for', () => {
  for (const size of [24, 40, DEFAULT_SETTINGS.size, 56]) {
    for (const m of TEAM) {
      const r = memberPhysics({ ...DEFAULT_SETTINGS, size }, m).radius;
      assert.ok(r <= size && r >= size * 0.9 - 1, `${m.id} at size ${size}: ${r}`);
    }
  }
  assert.equal(new Set(TEAM.map((m) => m.id)).size, TEAM.length);
  for (const m of TEAM) {
    for (const when of Object.keys(SITUATIONS)) assert.ok(m.lines[when]?.length > 0, `${m.id} has a ${when} line`);
  }
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

test('a hand-edited member row is kept in range and never left speechless', () => {
  const m = parseMember({ id: 'x', name: ' 새 팀원 ', color: 'red', scale: 1.4, softness: 300, bounce: 'lots', lines: { wait: ['  ', '안녕'], drop: null } });
  assert.equal(m.name, '새 팀원');
  assert.match(m.color, /^#[0-9a-f]{6}$/i);
  assert.equal(m.scale, 1);
  assert.equal(m.softness, 100);
  assert.equal(m.bounce, 0);
  assert.deepEqual(m.lines.wait, ['안녕']);
  for (const when of Object.keys(SITUATIONS)) assert.ok(m.lines[when].length > 0, `${when} filled in`);
});

test('the team comes from the store, skipping inactive rows, and an empty table means the built-in team', async () => {
  const rows = [{ ...TEAM[0], active: true }, { ...TEAM[1], active: false }];
  const lunch = (members) => createLunchService({ listMembers: async () => members }, () => '2026-11-04');
  assert.deepEqual((await lunch(rows).listMembers()).map((m) => m.id), [TEAM[0].id]);
  assert.equal((await lunch([]).listMembers()).length, TEAM.length);
});

test('when the whole team votes, every ball, at its member’s size and bounce, takes a slot of its own', () => {
  const rng = mulberry32(21);
  for (let round = 0; round < 8; round++) {
    const n = TEAM.length;
    const k = 1 + (round % 3);
    const board = createBoard(equalWidths(n), DEFAULT_SETTINGS.size, randomBumpers(rng, boardWidth(n)));
    const wins = [...Array(n).keys()].sort(() => rng() - 0.5).slice(0, k).sort((a, b) => a - b);
    const step = board.width / n;
    const players = TEAM.map((m, i) => ({ physics: memberPhysics(DEFAULT_SETTINGS, m), x: step * (i + 0.5) }));
    const r = createRound(board, players, rng, wins);
    for (let i = 0; i < 90 / DT && !r.done; i++) stepRound(r);
    assert.ok(r.done, `round ${round} (${k} winning of ${n}) finished`);
    assert.deepEqual(r.winners.map((w) => w.slot), wins);
    assert.equal(new Set(r.winners.map((w) => w.player)).size, k, 'a different ball in each winning slot');
  }
});
