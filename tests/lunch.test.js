import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLunchService } from '../src/application/lunch.js';
import { DEFAULT_MENUS } from '../src/domain/menu.js';

// An in-memory store that honours the port documented in src/application/lunch.js.
function memoryStore() {
  const menus = [];
  const visits = [];
  const votes = [];
  let n = 0;
  return {
    visits,
    votes,
    async listVotes() {
      return votes.map((v) => ({ ...v }));
    },
    async insertVotes(rows) {
      votes.push(...rows.map((r) => ({ id: `vote${++n}`, ...r, createdAt: `t${n}` })));
    },
    async listMenus() {
      return menus.map((m) => ({ ...m }));
    },
    async insertMenus(added) {
      const rows = added.map(({ name, tags }) => ({ id: `m${++n}`, name, hidden: false, tags, createdAt: `t${n}` }));
      menus.push(...rows);
      return rows;
    },
    async updateMenu(id, patch) {
      Object.assign(menus.find((m) => m.id === id), patch);
    },
    async listVisits() {
      return visits.map((v) => ({ ...v }));
    },
    async insertVisits(rows) {
      visits.push(...rows.map((r) => ({ id: `v${++n}`, ...r, canceled: false, createdAt: `t${n}` })));
    },
    async updateVisit(id, patch) {
      Object.assign(visits.find((v) => v.id === id), patch);
    },
  };
}

const setup = () => {
  const store = memoryStore();
  return { store, lunch: createLunchService(store, () => '2026-10-30') };
};

test('an empty store starts with the default places and their tags', async () => {
  const { lunch } = setup();
  assert.deepEqual((await lunch.listMenus()).map(({ name, tags }) => ({ name, tags })), DEFAULT_MENUS);
});

test('menu names are trimmed and unique ignoring case, hidden ones included', async () => {
  const { lunch } = setup();
  const menus = await lunch.listMenus();
  assert.equal((await lunch.addMenu('  마라탕   샹궈 ')).name, '마라탕 샹궈');
  await lunch.setMenuHidden(menus[0].id, true);
  await assert.rejects(lunch.addMenu(menus[0].name), /숨긴 메뉴/);
  await assert.rejects(lunch.renameMenu(menus[1].id, '마라탕 샹궈'), /이미 있어요/);
  await lunch.renameMenu(menus[1].id, menus[1].name);
});

test('confirmed picks are recorded for today, one visit per winner', async () => {
  const { lunch, store } = setup();
  const [a, b] = await lunch.listMenus();
  await lunch.recordPicks([{ menuId: a.id, memberId: 'jungwon' }, { menuId: b.id }]);
  assert.deepEqual(
    store.visits.map((v) => [v.menuId, v.visitedOn, v.source]),
    [[a.id, '2026-10-30', 'spin'], [b.id, '2026-10-30', 'spin']],
  );
});

test('a pick records who took the team there, and a record can be moved to the place really gone to', async () => {
  const { lunch, store } = setup();
  const [a, b] = await lunch.listMenus();
  await lunch.recordPicks([{ menuId: a.id, memberId: 'jungwon' }, { menuId: b.id }]);
  assert.deepEqual(store.visits.map((v) => v.memberId), ['jungwon', null]);
  await lunch.changeVisitMenu(store.visits[0].id, b.id);
  assert.equal(store.visits[0].menuId, b.id);
  assert.equal(store.visits[0].memberId, 'jungwon', 'who took them there stays');
  await assert.rejects(lunch.changeVisitMenu(store.visits[0].id, 'nope'), /없는 가게/);
});

test('a confirmed round’s votes are kept, dated today, and come back with the history', async () => {
  const { lunch, store } = setup();
  const [a, b] = await lunch.listMenus();
  await lunch.recordVotes([{ memberId: 'jungwon', menuId: a.id, balls: 2 }, { memberId: 'sungmin', menuId: b.id, balls: 1 }]);
  await lunch.recordVotes([]);
  assert.deepEqual(store.votes.map((v) => [v.memberId, v.menuId, v.balls, v.votedOn]), [['jungwon', a.id, 2, '2026-10-30'], ['sungmin', b.id, 1, '2026-10-30']]);
  const history = await lunch.loadHistory();
  assert.equal(history.votes.length, 2);
  assert.ok(history.menus.length > 0 && Array.isArray(history.visits));
});

test('manual visits cannot be dated in the future', async () => {
  const { lunch } = setup();
  const [a] = await lunch.listMenus();
  assert.throws(() => lunch.addManualVisit(a.id, '2026-10-31'), /앞으로의 날짜/);
  await lunch.addManualVisit(a.id, '2026-10-29');
});

test('a record added by hand can name whose pick it was, or nobody', async () => {
  const { lunch, store } = setup();
  const [a] = await lunch.listMenus();
  await lunch.addManualVisit(a.id, '2026-10-29');
  await lunch.addManualVisit(a.id, '2026-10-28', 'jungwon');
  assert.deepEqual(store.visits.map((v) => [v.memberId ?? null, v.source]), [[null, 'manual'], ['jungwon', 'manual']]);
  assert.deepEqual((await lunch.loadStats()).stats.winners.map((w) => [w.memberId, w.count]), [['jungwon', 1]]);
});

test('a canceled visit drops out of the stats and comes back when restored', async () => {
  const { lunch, store } = setup();
  const [a] = await lunch.listMenus();
  await lunch.recordPicks([{ menuId: a.id }]);
  const id = store.visits[0].id;
  await lunch.setVisitCanceled(id, true);
  assert.equal((await lunch.loadStats()).stats.totalVisits, 0);
  await lunch.setVisitCanceled(id, false);
  assert.equal((await lunch.loadStats()).stats.totalVisits, 1);
});

test('tags are optional, cleaned up and capped', async () => {
  const { lunch } = setup();
  const menu = await lunch.addMenu('도이');
  assert.deepEqual(menu.tags, []);
  await lunch.setMenuTags(menu.id, [' #중식 ', '짬뽕', '중식', '#  탕수육  ']);
  assert.deepEqual((await lunch.listMenus()).find((m) => m.id === menu.id).tags, ['중식', '짬뽕', '탕수육']);
  await assert.rejects(lunch.setMenuTags(menu.id, ['#']), /태그를 입력/);
  await assert.rejects(lunch.setMenuTags(menu.id, ['아주아주아주긴태그이름']), /10자/);
  await assert.rejects(lunch.setMenuTags(menu.id, ['a', 'b', 'c', 'd', 'e', 'f']), /5개/);
  await lunch.setMenuTags(menu.id, []);
  assert.deepEqual((await lunch.listMenus()).find((m) => m.id === menu.id).tags, []);
});
