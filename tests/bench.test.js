import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/domain/physics.js';
import { DEFAULT_TEAM, parseMember } from '../src/domain/team.js';
import { createBench } from '../src/ui/plinko/bench.js';

const team = DEFAULT_TEAM.map(parseMember);
const ids = (bench) => new Set(bench.chosen().map((m) => m.id));

test('picking past the limit swaps out the latest earlier pick, so the count stays put', () => {
  const bench = createBench(team, mulberry32(1));
  const [a, b, c, d] = team;
  bench.toggle(a, 0, 2);
  bench.toggle(b, 1, 2);
  bench.toggle(c, 2, 2);
  assert.deepEqual(ids(bench), new Set([a.id, c.id]));
  bench.toggle(d, 3, 2);
  assert.deepEqual(ids(bench), new Set([a.id, d.id]));
  bench.toggle(a, 4, 2);
  assert.deepEqual(ids(bench), new Set([d.id]), 'clicking a picked member unpicks them');
});

test('a picked member answers with a pick line, and unpicking takes it back', () => {
  const bench = createBench(team, mulberry32(2));
  const m = team[0];
  const spots = team.map((member, i) => ({ member, x: i * 200, y: 0, r: 50 }));
  bench.toggle(m, 10, 5);
  const said = bench.chatter(10.1, spots, new Set(), { lo: 0, hi: 1200 }).find((s) => s.member === m);
  assert.ok(m.lines.pick.includes(said?.line), `said ${said?.line}`);
  bench.toggle(m, 10.5, 5);
  assert.ok(!bench.chatter(10.6, spots, new Set(), { lo: 0, hi: 1200 }).some((s) => s.member === m && s.when === 'pick'));
});
