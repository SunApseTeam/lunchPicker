import { SUPABASE_KEY, SUPABASE_URL } from './config.js';

// Two stores with one interface: this browser's localStorage, or the shared Supabase tables
// (menus, visits). Rows come back in the same camelCase shape from both.
const KEY = 'lunch-plinko:v1';
const DEFAULT_MENUS = ['김치찌개', '돈까스', '국밥', '짜장면', '쌀국수', '버거', '초밥', '샐러드'];

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

// crypto.randomUUID only exists on https and localhost; a LAN http URL must still work.
const newId = () => crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function seed() {
  const now = new Date().toISOString();
  return {
    menus: DEFAULT_MENUS.map((name) => ({ id: newId(), name, hidden: false, createdAt: now })),
    visits: [],
  };
}

// Settings are a per-viewer convenience, so they stay in this browser even once
// menus and visits move to the shared store.
const SETTINGS_KEY = 'lunch-plinko:settings';

export function loadSettings(defaults) {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) ?? {};
    return Object.fromEntries(
      Object.entries(defaults).map(([key, value]) => [key, typeof saved[key] === typeof value ? saved[key] : value]),
    );
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Blocked storage: the settings still apply for this visit.
  }
}

export function todayString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function cleanName(name, menus, exceptId) {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) throw new Error('메뉴 이름을 입력해 주세요');
  if (trimmed.length > 20) throw new Error('20자까지 입력할 수 있어요');
  const clash = menus.find((m) => m.id !== exceptId && m.name.toLowerCase() === trimmed.toLowerCase());
  if (clash) throw new Error(clash.hidden ? `'${clash.name}'은(는) 숨긴 메뉴에 있어요` : `'${clash.name}'은(는) 이미 있어요`);
  return trimmed;
}

export function createLocalStore() {
  let state = load() ?? seed();
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

  return {
    async listMenus() {
      fresh();
      return state.menus.map((m) => ({ ...m }));
    },
    async addMenu(name) {
      fresh();
      const menu = { id: newId(), name: cleanName(name, state.menus), hidden: false, createdAt: new Date().toISOString() };
      state.menus.push(menu);
      save();
      return { ...menu };
    },
    async renameMenu(id, name) {
      fresh();
      const menu = state.menus.find((m) => m.id === id);
      menu.name = cleanName(name, state.menus, id);
      save();
    },
    async setHidden(id, hidden) {
      fresh();
      state.menus.find((m) => m.id === id).hidden = hidden;
      save();
    },
    async addVisits(menuIds, visitedOn, source) {
      fresh();
      const createdAt = new Date().toISOString();
      const added = menuIds.map((menuId) => ({ id: newId(), menuId, visitedOn, source, canceled: false, createdAt }));
      state.visits.push(...added);
      try {
        save();
      } catch (err) {
        state.visits.splice(-added.length);
        throw err;
      }
    },
    // Visits are never deleted, only marked canceled, so a mistaken cancel can be undone.
    async setCanceled(id, canceled) {
      fresh();
      state.visits.find((v) => v.id === id).canceled = canceled;
      save();
    },
    async listVisits() {
      fresh();
      return state.visits.map((v) => ({ ...v }));
    },
  };
}

// Shared store: Supabase's REST API (PostgREST) called with fetch, so the page still needs no
// build step or client library. The row policies in supabase/schema.sql decide what anon may do.
const PAGE = 1000;

export function createSupabaseStore(url, key) {
  async function request(path, { method = 'GET', body, prefer } = {}) {
    let res;
    try {
      res = await fetch(`${url}/rest/v1/${path}`, {
        method,
        headers: { apikey: key, 'Content-Type': 'application/json', ...(prefer && { Prefer: prefer }) },
        body: body && JSON.stringify(body),
      });
    } catch {
      throw new Error('공유 저장소에 연결하지 못했어요. 인터넷 연결을 확인해 주세요');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (err.code === '23505') throw new Error('같은 이름의 메뉴가 이미 있어요');
      throw new Error(`공유 저장소 오류 (${err.code ?? res.status})`);
    }
    return res.status === 204 ? null : res.json();
  }

  // Supabase caps one response at 1000 rows, so read in pages until a short one comes back.
  async function getAll(path) {
    const rows = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = await request(`${path}&limit=${PAGE}&offset=${offset}`);
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  }

  const toMenu = (r) => ({ id: r.id, name: r.name, hidden: r.hidden, createdAt: r.created_at });
  const toVisit = (r) => ({
    id: r.id,
    menuId: r.menu_id,
    visitedOn: r.visited_on,
    source: r.source,
    canceled: r.canceled,
    createdAt: r.created_at,
  });

  async function listMenus() {
    const rows = await getAll('menus?select=*&order=created_at.asc,name.asc');
    if (rows.length > 0) return rows.map(toMenu);
    // A brand-new database starts with the same default list as a fresh browser.
    await request('menus', { method: 'POST', body: DEFAULT_MENUS.map((name) => ({ name })) }).catch(() => {});
    return (await getAll('menus?select=*&order=created_at.asc,name.asc')).map(toMenu);
  }

  return {
    listMenus,
    async addMenu(name) {
      const [row] = await request('menus', {
        method: 'POST',
        body: { name: cleanName(name, await listMenus()) },
        prefer: 'return=representation',
      });
      return toMenu(row);
    },
    async renameMenu(id, name) {
      await request(`menus?id=eq.${id}`, { method: 'PATCH', body: { name: cleanName(name, await listMenus(), id) } });
    },
    async setHidden(id, hidden) {
      await request(`menus?id=eq.${id}`, { method: 'PATCH', body: { hidden } });
    },
    async addVisits(menuIds, visitedOn, source) {
      await request('visits', { method: 'POST', body: menuIds.map((menu_id) => ({ menu_id, visited_on: visitedOn, source })) });
    },
    async setCanceled(id, canceled) {
      await request(`visits?id=eq.${id}`, { method: 'PATCH', body: { canceled } });
    },
    async listVisits() {
      return (await getAll('visits?select=*&order=visited_on.desc,created_at.desc')).map(toVisit);
    },
  };
}

export function createStore() {
  return SUPABASE_URL ? createSupabaseStore(SUPABASE_URL, SUPABASE_KEY) : createLocalStore();
}
