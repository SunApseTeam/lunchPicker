import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekdayOf } from '../src/domain/date.js';
import { computeStats } from '../src/domain/stats.js';

const menus = [
  { id: 'a', name: '국밥', hidden: false },
  { id: 'b', name: '돈까스', hidden: false },
  { id: 'c', name: '초밥', hidden: false },
  { id: 'd', name: '샐러드', hidden: true },
];
let n = 0;
const visit = (menuId, visitedOn, extra = {}) => ({
  id: `v${++n}`,
  menuId,
  visitedOn,
  source: 'spin',
  canceled: false,
  createdAt: `${visitedOn}T12:00:0${n % 10}Z`,
  ...extra,
});

const visits = [
  visit('a', '2026-10-26'),
  visit('a', '2026-10-27'),
  visit('b', '2026-10-27'),
  visit('b', '2026-10-28', { canceled: true }),
  visit('d', '2026-09-01'),
  visit('a', '2026-05-04', { source: 'manual' }),
];
const stats = computeStats(menus, visits, '2026-10-30');

test('weekday names follow the calendar', () => {
  assert.equal(weekdayOf('2026-10-26'), '월');
  assert.equal(weekdayOf('2026-11-01'), '일');
});

test('canceled visits count nowhere but stay in the timeline', () => {
  assert.equal(stats.totalVisits, 5);
  assert.equal(stats.totalDays, 4);
  assert.equal(stats.timeline.length, 6);
  assert.ok(stats.timeline.some((v) => v.canceled));
});

test('ranking orders by count and keeps hidden menus in history', () => {
  assert.deepEqual(
    stats.ranking.map((r) => [r.name, r.count, r.lastVisit]),
    [['국밥', 3, '2026-10-27'], ['돈까스', 1, '2026-10-27'], ['샐러드', 1, '2026-09-01']],
  );
});

test('stale list puts never-visited menus first and skips hidden ones', () => {
  assert.deepEqual(
    stats.stale.map((s) => [s.name, s.daysSince]),
    [['초밥', null], ['국밥', 3], ['돈까스', 3]],
  );
});

test('weekday pattern starts on Monday and names the usual pick', () => {
  assert.deepEqual(
    stats.weekdays.map((d) => [d.label, d.count, d.top]),
    [['월', 2, '국밥'], ['화', 3, '국밥'], ['수', 0, null], ['목', 0, null], ['금', 0, null]],
  );
});

test('monthly pattern covers the last six months, oldest first', () => {
  assert.deepEqual(
    stats.months.map((m) => [m.key, m.count]),
    [['2026-05', 1], ['2026-06', 0], ['2026-07', 0], ['2026-08', 0], ['2026-09', 1], ['2026-10', 3]],
  );
  assert.deepEqual(computeStats(menus, [], '2026-02-10').months.map((m) => m.key), [
    '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02',
  ]);
});

test('timeline lists the newest day first', () => {
  assert.equal(stats.timeline[0].visitedOn, '2026-10-28');
  assert.equal(stats.timeline.at(-1).visitedOn, '2026-05-04');
});
