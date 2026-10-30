import { WEEKDAYS, dayNumber, weekdayOf } from './date.js';
import { menuIcon } from './icon.js';

// Pure stats over the store's rows.
const MONTHS_SHOWN = 6;

// The menu visited most in a bucket; ties go to the one visited most recently.
function leader(visits, names) {
  const tally = new Map();
  for (const v of visits) {
    const t = tally.get(v.menuId) ?? { count: 0, last: '' };
    t.count += 1;
    if (v.visitedOn > t.last) t.last = v.visitedOn;
    tally.set(v.menuId, t);
  }
  let best = null;
  for (const [id, t] of tally) {
    if (!best || t.count > best.count || (t.count === best.count && t.last > best.last)) best = { id, ...t };
  }
  return best ? names.get(best.id) : null;
}

export function computeStats(menus, visits, today) {
  const names = new Map(menus.map((m) => [m.id, m.name]));
  const icons = new Map(menus.map((m) => [m.id, menuIcon(m)]));
  const active = visits.filter((v) => !v.canceled);

  const byMenu = new Map();
  for (const v of active) {
    const entry = byMenu.get(v.menuId) ?? { id: v.menuId, name: names.get(v.menuId) ?? '?', icon: icons.get(v.menuId), count: 0, lastVisit: '' };
    entry.count += 1;
    if (v.visitedOn > entry.lastVisit) entry.lastVisit = v.visitedOn;
    byMenu.set(v.menuId, entry);
  }
  const ranking = [...byMenu.values()].sort(
    (a, b) => b.count - a.count || b.lastVisit.localeCompare(a.lastVisit) || a.name.localeCompare(b.name, 'ko'),
  );

  // Only menus still on the list: a hidden menu is not a place anyone can be nudged toward.
  const stale = menus
    .filter((m) => !m.hidden)
    .map((m) => {
      const last = byMenu.get(m.id)?.lastVisit;
      return { id: m.id, name: m.name, icon: icons.get(m.id), daysSince: last ? dayNumber(today) - dayNumber(last) : null };
    })
    .sort((a, b) => (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity) || a.name.localeCompare(b.name, 'ko'));

  const weekdays = WEEKDAYS.map((label) => {
    const inDay = active.filter((v) => weekdayOf(v.visitedOn) === label);
    return { label, count: inDay.length, top: leader(inDay, names) };
  });
  // Monday first; the weekend shows up only when someone actually logged a weekend lunch.
  const weekdayRows = [...weekdays.slice(1), weekdays[0]].filter((d, i) => i < 5 || d.count > 0);

  const [ty, tm] = today.split('-').map(Number);
  const months = [];
  for (let back = MONTHS_SHOWN - 1; back >= 0; back--) {
    const index = ty * 12 + (tm - 1) - back;
    const key = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
    const inMonth = active.filter((v) => v.visitedOn.startsWith(key));
    months.push({ key, label: `${(index % 12) + 1}월`, count: inMonth.length, top: leader(inMonth, names) });
  }

  // A visit counts once for each tag its place has now; places without tags are counted apart.
  const tagsOf = new Map(menus.map((m) => [m.id, m.tags ?? []]));
  const tagCount = new Map();
  let untaggedVisits = 0;
  for (const v of active) {
    const tags = tagsOf.get(v.menuId) ?? [];
    if (tags.length === 0) untaggedVisits += 1;
    for (const t of tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  }
  const tags = [...tagCount]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ko'));

  const timeline = visits
    .map((v) => ({ ...v, name: names.get(v.menuId) ?? '?', icon: icons.get(v.menuId) }))
    .sort((a, b) => b.visitedOn.localeCompare(a.visitedOn) || b.createdAt.localeCompare(a.createdAt));

  return {
    totalVisits: active.length,
    totalDays: new Set(active.map((v) => v.visitedOn)).size,
    ranking,
    stale,
    weekdays: weekdayRows,
    months,
    tags,
    untaggedVisits,
    timeline,
  };
}
