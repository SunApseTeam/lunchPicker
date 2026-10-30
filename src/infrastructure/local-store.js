// Store port on this browser's localStorage, for development and as the fallback when no
// Supabase project is configured.
const KEY = 'lunch-plinko:v1';

// crypto.randomUUID only exists on https and localhost; a LAN http URL must still work.
const newId = () => crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function createLocalStore() {
  let state = load() ?? { menus: [], visits: [] };
  // The plinko page and the stats page may be open side by side; read the latest copy before
  // every change so one tab never saves over what the other just wrote.
  const fresh = () => {
    state = load() ?? state;
  };
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      throw new Error('브라우저 저장소에 저장하지 못했어요');
    }
  };
  const insert = (list, rows) => {
    list.push(...rows);
    try {
      save();
    } catch (err) {
      list.splice(-rows.length);
      throw err;
    }
    return rows.map((r) => ({ ...r }));
  };

  return {
    async listMenus() {
      fresh();
      return state.menus.map((m) => ({ ...m }));
    },
    async insertMenus(names) {
      fresh();
      const createdAt = new Date().toISOString();
      return insert(state.menus, names.map((name) => ({ id: newId(), name, hidden: false, createdAt })));
    },
    async updateMenu(id, patch) {
      fresh();
      Object.assign(state.menus.find((m) => m.id === id), patch);
      save();
    },
    async listVisits() {
      fresh();
      return state.visits.map((v) => ({ ...v }));
    },
    async insertVisits(rows) {
      fresh();
      const createdAt = new Date().toISOString();
      insert(state.visits, rows.map((r) => ({ id: newId(), ...r, canceled: false, createdAt })));
    },
    async updateVisit(id, patch) {
      fresh();
      Object.assign(state.visits.find((v) => v.id === id), patch);
      save();
    },
  };
}
