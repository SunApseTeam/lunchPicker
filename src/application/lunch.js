import { checkIcon } from '../domain/icon.js';
import { DEFAULT_MENUS, normalizeMenuName } from '../domain/menu.js';
import { computeStats } from '../domain/stats.js';

// Use cases for both pages. The store is a plain row store; every rule lives here or in domain/.
//
// Store port (see infrastructure/ for the localStorage and Supabase adapters):
//   listMenus()               -> [{ id, name, hidden, icon, createdAt }]  (icon may be missing)
//   insertMenus(names)        -> the inserted menus
//   updateMenu(id, patch)     patch: { name }, { hidden } or { icon }
//   listVisits()              -> [{ id, menuId, visitedOn, source, canceled, createdAt }]
//   insertVisits(rows)        rows: [{ menuId, visitedOn, source: 'spin' | 'manual' }]
//   updateVisit(id, patch)    patch: { canceled }
//
// today() returns 'YYYY-MM-DD' so tests can pin the date.
export function createLunchService(store, today) {
  async function listMenus() {
    const menus = await store.listMenus();
    if (menus.length > 0) return menus;
    // A brand-new store starts with the default list. If two first visitors race, the
    // store's unique names keep one copy and the loser's insert fails harmlessly.
    await store.insertMenus(DEFAULT_MENUS).catch(() => {});
    return store.listMenus();
  }

  return {
    listMenus,

    async addMenu(name) {
      const [menu] = await store.insertMenus([normalizeMenuName(name, await store.listMenus())]);
      return menu;
    },

    async renameMenu(id, name) {
      await store.updateMenu(id, { name: normalizeMenuName(name, await store.listMenus(), id) });
    },

    setMenuHidden(id, hidden) {
      return store.updateMenu(id, { hidden });
    },

    // null clears a picked icon so the menu goes back to the one guessed from its name.
    setMenuIcon(id, icon) {
      return store.updateMenu(id, { icon: checkIcon(icon) });
    },

    // Every winner of a round is recorded: the team splits up and goes to all of them.
    recordPicks(menuIds) {
      return store.insertVisits(menuIds.map((menuId) => ({ menuId, visitedOn: today(), source: 'spin' })));
    },

    addManualVisit(menuId, visitedOn) {
      if (visitedOn > today()) throw new Error('앞으로의 날짜는 기록할 수 없어요');
      return store.insertVisits([{ menuId, visitedOn, source: 'manual' }]);
    },

    // Visits are never deleted, only marked canceled, so a mistaken cancel can be undone.
    setVisitCanceled(id, canceled) {
      return store.updateVisit(id, { canceled });
    },

    async loadStats() {
      const [menus, visits] = await Promise.all([listMenus(), store.listVisits()]);
      return { menus, stats: computeStats(menus, visits, today()) };
    },
  };
}
