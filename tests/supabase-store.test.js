import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseStore } from '../src/infrastructure/supabase-store.js';

// Replays what PostgREST answers, so the adapter's requests and its reading of the replies can
// be checked without touching the team's database.
function fakeFetch(reply) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, ...init, body: init.body && JSON.parse(init.body) });
    return reply(url, init);
  };
  return calls;
}

const store = () => createSupabaseStore('https://x.supabase.co', 'sb_publishable_test');

test('a write answered with 201 and no body succeeds', async () => {
  const calls = fakeFetch(() => new Response(null, { status: 201 }));
  await store().insertVisits([{ menuId: 'm1', visitedOn: '2026-10-30', source: 'spin' }]);
  assert.equal(calls[0].url, 'https://x.supabase.co/rest/v1/visits');
  assert.equal(calls[0].headers.apikey, 'sb_publishable_test');
  assert.deepEqual(calls[0].body, [{ menu_id: 'm1', member_id: null, visited_on: '2026-10-30', source: 'spin' }]);
});

test('rows come back in the app shape, read page by page', async () => {
  const row = { id: 'v1', menu_id: 'm1', visited_on: '2026-10-30', source: 'spin', canceled: false, created_at: 't' };
  const calls = fakeFetch((url) => Response.json(url.includes('offset=0') ? Array(1000).fill(row) : [row]));
  const visits = await store().listVisits();
  assert.equal(visits.length, 1001);
  assert.deepEqual(visits[0], { id: 'v1', menuId: 'm1', memberId: null, visitedOn: '2026-10-30', source: 'spin', canceled: false, createdAt: 't' });
  assert.equal(calls.length, 2);
});

test('a duplicate name and a refused request become readable errors', async () => {
  fakeFetch(() => Response.json({ code: '23505' }, { status: 409 }));
  await assert.rejects(store().insertMenus([{ name: '국밥', tags: [] }]), /같은 이름/);
  fakeFetch(() => Response.json({ code: '42501' }, { status: 401 }));
  await assert.rejects(store().updateVisit('v1', { canceled: true }), /42501/);
  globalThis.fetch = async () => {
    throw new TypeError('offline');
  };
  await assert.rejects(store().listMenus(), /연결하지 못했어요/);
});

test('menus carry their tags both ways', async () => {
  const calls = fakeFetch((url, init) =>
    init.method === 'POST'
      ? Response.json([{ id: 'm1', name: '도이', hidden: false, icon: null, tags: ['중식'], created_at: 't' }], { status: 201 })
      : new Response(null, { status: 204 }),
  );
  const [menu] = await store().insertMenus([{ name: '도이', tags: ['중식'] }]);
  assert.deepEqual(calls[0].body, [{ name: '도이', tags: ['중식'] }]);
  assert.deepEqual(menu.tags, ['중식']);
  await store().updateMenu('m1', { tags: ['중식', '짬뽕'] });
  assert.deepEqual(calls[1].body, { tags: ['중식', '짬뽕'] });
});

test('team members come back with their lines grouped by situation', async () => {
  const row = { id: 'jungwon', name: '고정원', color: '#5ab8ff', scale: 1, softness: 0, bounce: 0, active: true,
    lines_pick: ['p'], lines_wait: ['a'], lines_drop: ['b'], lines_bounce: ['c'], lines_bump: ['d'], lines_win: ['e'], lines_trigger: ['f'], created_at: 't' };
  const calls = fakeFetch(() => Response.json([row]));
  const [m] = await store().listMembers();
  assert.match(calls[0].url, /\/rest\/v1\/members\?select=\*/);
  assert.deepEqual(m.lines, { pick: ['p'], wait: ['a'], drop: ['b'], bounce: ['c'], bump: ['d'], win: ['e'], trigger: ['f'] });
  assert.equal(m.active, true);
});

test('a visit keeps who took the team there, and moving it sends the column name', async () => {
  let calls = fakeFetch(() => new Response(null, { status: 201 }));
  await store().insertVisits([{ menuId: 'm1', memberId: 'jungwon', visitedOn: '2026-10-30', source: 'spin' }]);
  assert.equal(calls[0].body[0].member_id, 'jungwon');
  calls = fakeFetch(() => new Response(null, { status: 204 }));
  await store().updateVisit('v1', { menuId: 'm2' });
  assert.deepEqual(calls[0].body, { menu_id: 'm2' });
  assert.equal(calls[0].method, 'PATCH');
  fakeFetch(() => Response.json([{ id: 'v1', menu_id: 'm1', visited_on: 'd', source: 'spin', canceled: false, created_at: 't' }]));
  assert.equal((await store().listVisits())[0].memberId, null, 'older rows have no member');
});
