import { todayString } from '../domain/date.js';
import { DEFAULT_MENUS } from '../domain/menu.js';
import { DEFAULT_TEAM } from '../domain/team.js';

// Store port held in memory and filled with about six months of made-up lunches, for looking
// at the stats screen before real records pile up, and a few weeks of made-up votes, each member
// leaning toward a couple of places and a favourite for some weekdays, for trying out the
// recommendations. Nothing is saved; a reload starts over.
const DAYS_BACK = 185;

function sampleRows(today) {
  let seed = 20261030;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const extra = [{ name: '홍콩반점', tags: ['중식', '짬뽕'] }, { name: '샐러디', tags: ['샐러드'] }, { name: '김밥천국', tags: [] }];
  const menus = [...DEFAULT_MENUS, ...extra].map(({ name, tags }, i) => ({
    id: `demo-m${i}`,
    name,
    hidden: name === '샐러디',
    tags: [...tags],
    createdAt: '2026-01-01T00:00:00Z',
  }));
  const visits = [];
  for (let back = DAYS_BACK; back >= 0; back--) {
    const day = new Date(today);
    day.setDate(day.getDate() - back);
    const weekday = day.getDay();
    if (weekday === 0 || weekday === 6 || rng() < 0.2) continue;
    const date = todayString(day);
    const picks = rng() < 0.2 ? 2 : 1;
    for (let k = 0; k < picks; k++) {
      // Skewed toward the front of the list so the ranking has clear leaders; 노모어피자 is left
      // out lately so the "not visited lately" card has something to show.
      let menu = menus[Math.floor(rng() ** 1.7 * (menus.length - 1))];
      if (menu.name === '노모어피자' && back < 60) menu = menus[0];
      const source = rng() < 0.12 ? 'manual' : 'spin';
      // Records made by a round say which member took the team there.
      const memberId = source === 'spin' ? DEFAULT_TEAM[Math.floor(rng() * DEFAULT_TEAM.length)].id : null;
      visits.push({
        id: `demo-v${visits.length}`,
        menuId: menu.id,
        memberId,
        visitedOn: date,
        source,
        canceled: rng() < 0.04,
        createdAt: `${date}T03:0${k}:00Z`,
      });
    }
  }
  // Votes only for the last few weeks, as if they had only lately started being kept.
  const votes = [];
  const shown = menus.filter((m) => !m.hidden);
  DEFAULT_TEAM.forEach((member, i) => {
    const liked = [shown[i % shown.length], shown[(i * 3 + 1) % shown.length]];
    for (let back = 30; back >= 1; back--) {
      const day = new Date(today);
      day.setDate(day.getDate() - back);
      const weekday = day.getDay();
      if (weekday === 0 || weekday === 6 || rng() < 0.35) continue;
      const menu = weekday === 1 + (i % 5) ? liked[1] : rng() < 0.6 ? liked[0] : shown[Math.floor(rng() * shown.length)];
      votes.push({ id: `demo-vote${votes.length}`, memberId: member.id, menuId: menu.id, balls: 1, votedOn: todayString(day), createdAt: `${todayString(day)}T03:00:00Z` });
    }
  });
  return { menus, visits, votes };
}

export function createDemoStore() {
  const { menus, visits, votes } = sampleRows(new Date());
  let n = 0;
  return {
    async listMembers() {
      return DEFAULT_TEAM;
    },
    async listMenus() {
      return menus.map((m) => ({ ...m }));
    },
    async insertMenus(added) {
      const rows = added.map(({ name, tags }) => ({ id: `demo-new${++n}`, name, hidden: false, tags, createdAt: new Date().toISOString() }));
      menus.push(...rows);
      return rows.map((r) => ({ ...r }));
    },
    async updateMenu(id, patch) {
      Object.assign(menus.find((m) => m.id === id), patch);
    },
    async listVisits() {
      return visits.map((v) => ({ memberId: null, ...v }));
    },
    async insertVisits(rows) {
      const createdAt = new Date().toISOString();
      visits.push(...rows.map((r) => ({ id: `demo-new${++n}`, ...r, canceled: false, createdAt })));
    },
    async updateVisit(id, patch) {
      Object.assign(visits.find((v) => v.id === id), patch);
    },
    async listVotes() {
      return votes.map((v) => ({ ...v }));
    },
    async insertVotes(rows) {
      const createdAt = new Date().toISOString();
      votes.push(...rows.map((r) => ({ id: `demo-new${++n}`, ...r, createdAt })));
    },
  };
}
