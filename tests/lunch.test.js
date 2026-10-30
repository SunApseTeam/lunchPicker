import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLunchService } from '../src/application/lunch.js';
import { DEFAULT_MENUS } from '../src/domain/menu.js';

// An in-memory store that honours the port documented in src/application/lunch.js.
function memoryStore() {
  const menus = [];
  const visits = [];
  let n = 0;
  return {
    visits,
    async listMenus() {
      return menus.map((m) => ({ ...m }));
    },
    async insertMenus(names) {
      const rows = names.map((name) => ({ id: `m${++n}`, name, hidden: false, createdAt: `t${n}` }));
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

test('an empty store starts with the default menus', async () => {
  const { lunch } = setup();
  assert.deepEqual((await lunch.listMenus()).map((m) => m.name), DEFAULT_MENUS);
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
  await lunch.recordPicks([a.id, b.id]);
  assert.deepEqual(
    store.visits.map((v) => [v.menuId, v.visitedOn, v.source]),
    [[a.id, '2026-10-30', 'spin'], [b.id, '2026-10-30', 'spin']],
  );
});

test('manual visits cannot be dated in the future', async () => {
  const { lunch } = setup();
  const [a] = await lunch.listMenus();
  assert.throws(() => lunch.addManualVisit(a.id, '2026-10-31'), /앞으로의 날짜/);
  await lunch.addManualVisit(a.id, '2026-10-29');
});

test('a canceled visit drops out of the stats and comes back when restored', async () => {
  const { lunch, store } = setup();
  const [a] = await lunch.listMenus();
  await lunch.recordPicks([a.id]);
  const id = store.visits[0].id;
  await lunch.setVisitCanceled(id, true);
  assert.equal((await lunch.loadStats()).stats.totalVisits, 0);
  await lunch.setVisitCanceled(id, false);
  assert.equal((await lunch.loadStats()).stats.totalVisits, 1);
});
