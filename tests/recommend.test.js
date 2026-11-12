import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, josa, recommend } from '../src/domain/recommend.js';

const menus = [
  { id: 'ra', name: '라면순두부', tags: ['한식'], hidden: false },
  { id: 'ido', name: '이도곰탕', tags: ['한식'], hidden: false },
  { id: 'doi', name: '도이', tags: ['중식'], hidden: false },
  { id: 'pizza', name: '노모어피자', tags: ['피자'], hidden: false },
  { id: 'gone', name: '샐러디', tags: ['샐러드'], hidden: true },
];
// 2026-11-11 is a Wednesday.
const today = '2026-11-11';
const vote = (menuId, votedOn, memberId = 'sm') => ({ memberId, menuId, votedOn, balls: 1, createdAt: `${votedOn}T03:00:00Z` });
const visit = (menuId, visitedOn, memberId = null) => ({ menuId, visitedOn, memberId, canceled: false, source: 'spin' });
const option = (r, kind) => r.options.find((o) => o.kind === kind);

test('the right particle follows a name', () => {
  assert.equal(josa('라면순두부', '을', '를'), '를');
  assert.equal(josa('이도곰탕', '을', '를'), '을');
  assert.equal(josa('BBQ', '을', '를'), '을(를)');
});

test('with no records at all it still suggests places, never a hidden one, each on a place of its own', () => {
  const r = recommend('sm', { menus, today });
  assert.ok(r.options.length >= 2);
  assert.ok(r.options.every((o) => menus.find((m) => m.id === o.menuId && !m.hidden)));
  assert.equal(new Set(r.options.map((o) => o.menuId)).size, r.options.length);
  assert.equal(r.summary.picks, 0);
  assert.match(r.note, /아직 고른 기록이 없어서/);
  assert.ok(!option(r, 'revisit') && !option(r, 'join'), 'nothing to come back to, nobody to join');
});

test('the draw is the same all day for a member, and differs between members and days', () => {
  const visits = [visit('ra', '2026-11-03', 'sm'), visit('ido', '2026-10-20', 'sm')];
  const first = (memberId, day) => recommend(memberId, { menus, visits, today: day }).options.map((o) => o.kind).join();
  assert.equal(first('sm', today), first('sm', today));
  const draws = new Set();
  for (const day of ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17', '2026-11-18']) draws.add(first('sm', day));
  assert.ok(draws.size > 1, 'other days draw other orders');
});

test('over many days each kind leads about as often as its weight', () => {
  const votes = [];
  for (let i = 1; i <= 40; i++) votes.push(vote(i % 3 ? 'ra' : 'ido', `2026-${String(8 + Math.floor(i / 28)).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`));
  const lead = new Map();
  for (let d = 0; d < 400; d++) {
    const day = new Date(Date.UTC(2027, 0, 1) + d * 86400000).toISOString().slice(0, 10);
    const kind = recommend('sm', { menus, votes, today: day, othersToday: [{ name: '고정원', menuId: 'doi' }] }).options[0].kind;
    lead.set(kind, (lead.get(kind) ?? 0) + 1);
  }
  assert.ok(lead.get('habit') > lead.get('explore'), `habit ${lead.get('habit')} vs explore ${lead.get('explore')}`);
  assert.ok((lead.get('explore') ?? 0) >= 40, `new places lead now and then: ${lead.get('explore')}`);
});

test('the habit kind: with no picks of their own, the team\'s liking and freshness decide', () => {
  const visits = [
    visit('ra', '2026-11-10'), visit('ra', '2026-11-03'), visit('ra', '2026-10-27'),
    visit('ido', '2026-10-20'), visit('ido', '2026-10-13'), visit('ido', '2026-10-06'),
    visit('doi', '2026-11-05'),
  ];
  const habit = option(recommend('sm', { menus, visits, today }), 'habit');
  assert.equal(habit.menuId, 'ido', 'the team likes it and has not been for weeks; 라순 was yesterday');
  assert.ok(habit.reasons.some((t) => t.includes('22일째')), habit.reasons.join(' / '));
});

test('the habit kind: a weekday habit wins and is the reason, but only when it is that weekday\'s top pick', () => {
  const votes = [
    vote('doi', '2026-11-04'), vote('doi', '2026-10-28'), vote('doi', '2026-10-21'), // Wednesdays
    vote('ra', '2026-11-03'), vote('ra', '2026-11-02'), vote('ra', '2026-10-27'), vote('ra', '2026-10-26'),
  ];
  const r = recommend('sm', { menus, votes, today });
  assert.equal(option(r, 'habit').menuId, 'doi');
  assert.equal(option(r, 'habit').reasons[0], '역시 수요일엔 도이! 3번 중 3번 고르셨어요');
  assert.equal(r.note, null, 'enough to go on');
  assert.deepEqual(r.summary.top[0], { menuId: 'ra', count: 4 });
  assert.deepEqual(r.summary.weekdays.find((d) => d.label === '수'), { label: '수', menuId: 'doi', count: 3 });
  // The team went to 도이 yesterday: 라순 leads, and Wednesdays are not its reason.
  const after = option(recommend('sm', { menus, votes, visits: [visit('doi', '2026-11-10')], today }), 'habit');
  assert.equal(after.menuId, 'ra');
  assert.equal(after.reasons[0], '지금까지 7번 중 4번 라면순두부를 고르셨어요');
});

test('trying something new: a place never picked, one the team has never been to first', () => {
  const votes = [vote('ra', '2026-11-04'), vote('ra', '2026-11-03')];
  const visits = [visit('ra', '2026-11-04'), visit('doi', '2026-10-01')];
  const explore = option(recommend('sm', { menus, votes, visits, today }), 'explore');
  assert.ok(['ido', 'pizza'].includes(explore.menuId), `never picked and never visited: ${explore.menuId}`);
  assert.match(explore.reasons[0], /^새로운 도전! 아직 한 번도 안 고르신 .+에 도전해 보세요$/);
  assert.equal(explore.reasons[1], '팀이 아직 한 번도 안 간 곳이에요');
});

test('coming back: a place picked before and not for three weeks', () => {
  const votes = [vote('ido', '2026-10-01'), vote('ido', '2026-10-08'), vote('ra', '2026-11-10')];
  const revisit = option(recommend('sm', { menus, votes, today }), 'revisit');
  assert.equal(revisit.menuId, 'ido');
  assert.deepEqual(revisit.reasons, ['그리운 맛! 이도곰탕을 34일째 안 고르셨어요', '전에 2번 고르신 곳이에요']);
  const once = recommend('sm', { menus, votes: [vote('ido', '2026-10-01'), vote('ra', '2026-11-10')], today });
  assert.ok(!option(once, 'revisit'), 'a single pick long ago is not a habit to come back to');
});

test('joining in: a place the others have voted for today, naming them', () => {
  const join = option(recommend('sm', { menus, today, othersToday: [{ name: '고정원', menuId: 'pizza' }, { name: '김동원', menuId: 'pizza' }] }), 'join');
  assert.equal(join.menuId, 'pizza');
  assert.equal(join.reasons[0], '벌써 고정원님, 김동원님이 고른 노모어피자에 합류할래요?');
});

test('widening a taste: another place with a tag they pick, hardly picked yet', () => {
  const votes = [vote('ra', '2026-11-04'), vote('ra', '2026-11-03'), vote('ra', '2026-11-02')];
  const similar = option(recommend('sm', { menus, votes, today }), 'similar');
  assert.equal(similar.menuId, 'ido');
  assert.deepEqual(similar.reasons, ['#한식 좋아하시면 이도곰탕도 있어요', '아직 안 고르신 곳이에요']);
});

test('a day\'s last vote counts once, and old winning picks fill the days with no vote', () => {
  const votes = [vote('doi', '2026-11-10'), { ...vote('ra', '2026-11-10'), createdAt: '2026-11-10T04:00:00Z' }];
  const visits = [visit('ido', '2026-11-03', 'sm'), visit('ido', '2026-11-10', 'sm'), visit('pizza', '2026-11-03', 'other')];
  const r = recommend('sm', { menus, votes, visits, today });
  assert.equal(r.summary.picks, 2, 'one pick for 11/10 (the later vote) and one for 11/03 (a winning pick)');
  assert.deepEqual(r.summary.top.map((t) => t.menuId).sort(), ['ido', 'ra']);
  assert.match(r.note, /2번뿐/);
});

test('every kind has a title', () => {
  for (const kind of Object.values(KINDS)) assert.ok(kind.title && kind.weight > 0);
});
