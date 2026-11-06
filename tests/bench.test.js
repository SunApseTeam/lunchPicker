import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/domain/physics.js';
import { DEFAULT_TEAM, parseMember } from '../src/domain/team.js';
import { createBench } from '../src/ui/plinko/bench.js';

const team = DEFAULT_TEAM.map(parseMember);
test('a member who votes answers with a pick line, and taking the vote back takes it back', () => {
  const bench = createBench(team, mulberry32(2));
  const m = team[0];
  const spots = team.map((member, i) => ({ member, x: i * 200, y: 0, r: 50 }));
  bench.cheer(m, 10);
  const said = bench.chatter(10.1, spots, new Set(), { lo: 0, hi: 1200 }).find((s) => s.member === m);
  assert.ok(m.lines.pick.includes(said?.line), `said ${said?.line}`);
  bench.hush(m);
  assert.ok(!bench.chatter(10.6, spots, new Set(), { lo: 0, hi: 1200 }).some((s) => s.member === m && s.when === 'pick'));
});

test('a member dragged along the line stands where they are let go, the others closing up', () => {
  const bench = createBench(team, mulberry32(3));
  const board = { width: 1200, dropY: 0 };
  const spots = () => bench.spots(board, () => 50);
  const before = spots().map((s) => s.member);
  const dragged = before[1];
  bench.move(dragged, bench.placeAt(spots(), spots()[4].x + 20));
  const after = spots().map((s) => s.member);
  assert.equal(after[4], dragged);
  assert.deepEqual(after.filter((m) => m !== dragged), before.filter((m) => m !== dragged));
  assert.equal(bench.byKey(5), dragged, 'number keys follow the new order');
  assert.equal(bench.placeAt(spots(), -500), 0);
  assert.equal(bench.placeAt(spots(), 5000), team.length - 1);
});
