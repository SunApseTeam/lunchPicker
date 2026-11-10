import { checkIcon } from '../domain/icon.js';
import { DEFAULT_MENUS, normalizeMenuName } from '../domain/menu.js';
import { computeStats } from '../domain/stats.js';
import { checkTags } from '../domain/tag.js';
import { DEFAULT_TEAM, parseMember } from '../domain/team.js';

// Use cases for both pages. The store is a plain row store; every rule lives here or in domain/.
//
// Store port (see infrastructure/ for the localStorage and Supabase adapters):
//   listMenus()               -> [{ id, name, hidden, icon, tags, createdAt }]  (icon may be missing)
//   insertMenus(rows)         rows: [{ name, tags }] -> the inserted menus
//   updateMenu(id, patch)     patch: { name }, { hidden }, { icon } or { tags }
//   listVisits()              -> [{ id, menuId, memberId, visitedOn, source, canceled, createdAt }]
//                             (memberId: who took the team there; null for older and hand-added ones)
//   insertVisits(rows)        rows: [{ menuId, memberId?, visitedOn, source: 'spin' | 'manual' }]
//   updateVisit(id, patch)    patch: { canceled } or { menuId }
//   listMembers()             -> [{ id, name, color, scale, softness, bounce, lines, active }]
//                             (lines: { pick, wait, drop, bounce, bump, win }, each a list of strings)
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

  // The team is edited by hand in the shared table, so every row is checked here. An empty or
  // missing table falls back to the built-in team rather than an empty drop line.
  async function listMembers() {
    const rows = (await store.listMembers()).filter((r) => r.active !== false);
    return (rows.length > 0 ? rows : DEFAULT_TEAM).map(parseMember);
  }

  return {
    listMenus,
    listMembers,

    async addMenu(name) {
      const [menu] = await store.insertMenus([{ name: normalizeMenuName(name, await store.listMenus()), tags: [] }]);
      return menu;
    },

    async renameMenu(id, name) {
      await store.updateMenu(id, { name: normalizeMenuName(name, await store.listMenus(), id) });
    },

    setMenuHidden(id, hidden) {
      return store.updateMenu(id, { hidden });
    },

    // null clears a picked icon so the menu goes back to the one guessed from its tags and name.
    setMenuIcon(id, icon) {
      return store.updateMenu(id, { icon: checkIcon(icon) });
    },

    async setMenuTags(id, tags) {
      return store.updateMenu(id, { tags: checkTags(tags) });
    },

    // Every winner of a round is recorded, with the member who took the team there: the team
    // splits up and goes to all of them. picks: [{ menuId, memberId? }].
    recordPicks(picks) {
      return store.insertVisits(picks.map(({ menuId, memberId = null }) => ({ menuId, memberId, visitedOn: today(), source: 'spin' })));
    },

    // memberId: whose pick it was, if anyone's.
    addManualVisit(menuId, visitedOn, memberId = null) {
      if (visitedOn > today()) throw new Error('앞으로의 날짜는 기록할 수 없어요');
      return store.insertVisits([{ menuId, memberId, visitedOn, source: 'manual' }]);
    },

    // The place picked is not always the place gone to: a record can be moved to another place.
    async changeVisitMenu(id, menuId) {
      if (!(await store.listMenus()).some((m) => m.id === menuId)) throw new Error('없는 가게예요');
      return store.updateVisit(id, { menuId });
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
