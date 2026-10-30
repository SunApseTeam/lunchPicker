// Store port on Supabase's REST API (PostgREST) called with fetch, so the page still needs no
// build step or client library. The row policies in supabase/schema.sql decide what anon may do.
const PAGE = 1000;

const toMenu = (r) => ({ id: r.id, name: r.name, hidden: r.hidden, icon: r.icon ?? null, tags: r.tags ?? [], createdAt: r.created_at });
const toVisit = (r) => ({
  id: r.id,
  menuId: r.menu_id,
  visitedOn: r.visited_on,
  source: r.source,
  canceled: r.canceled,
  createdAt: r.created_at,
});

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
    // Writes without Prefer: return=representation answer with an empty body.
    const text = await res.text();
    return text ? JSON.parse(text) : null;
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

  return {
    async listMenus() {
      return (await getAll('menus?select=*&order=created_at.asc,name.asc')).map(toMenu);
    },
    async insertMenus(menus) {
      const rows = await request('menus', {
        method: 'POST',
        body: menus.map(({ name, tags }) => ({ name, tags })),
        prefer: 'return=representation',
      });
      return rows.map(toMenu);
    },
    async updateMenu(id, patch) {
      await request(`menus?id=eq.${id}`, { method: 'PATCH', body: patch });
    },
    async listVisits() {
      return (await getAll('visits?select=*&order=visited_on.desc,created_at.desc')).map(toVisit);
    },
    async insertVisits(rows) {
      await request('visits', {
        method: 'POST',
        body: rows.map((r) => ({ menu_id: r.menuId, visited_on: r.visitedOn, source: r.source })),
      });
    },
    async updateVisit(id, patch) {
      await request(`visits?id=eq.${id}`, { method: 'PATCH', body: patch });
    },
  };
}
