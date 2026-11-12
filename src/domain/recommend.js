import { WEEKDAYS, dayNumber, weekdayOf } from './date.js';

// Menu suggestions for one member, of several kinds, with plain reasons, worked out from the
// records alone.
//
// What a member picked: their saved votes (one per day: the last of the day), and on days with no
// saved vote, the records that name them as the one whose pick won. The second goes back further
// than the votes, so even a member with no saved votes yet has something to go on.
//
// The kinds of suggestion (KINDS), each with its own way of choosing a place:
//   단골        the place that scores best on the member's habits, the team's liking and
//               freshness (see scoreOf);
//   새로운 도전  a place the member has never picked, the team's untried ones first;
//   오랜만에     a place the member picked at least twice and has not for three weeks;
//   합류        a place someone else has already voted for today;
//   취향 넓히기  a place sharing a tag with what they pick, that they have hardly picked.
// A kind with nothing to offer is left out. Which kind comes first is drawn by weight, once per
// member per day (the same draw all day), and the rest follow in drawn order, each on a place of
// its own. The member's habits weigh more as their picks pile up, and trying something new weighs
// more while there are few.
//
// Returns null when no place is on the list, else
// { options: [{ kind, title, menuId, reasons: [string] }], note: string | null,
//   summary: { picks, top: [{ menuId, count }], weekdays: [{ label, menuId, count }] } }
// note says how little there was to go on, when that is so.
//
// othersToday: what the others have voted for today, [{ name, menuId }].

// How many picks it takes for the member's own habits to weigh as much as the team's.
const TRUST_AT = 4;
// A weekday pattern needs this many picks on that weekday to be trusted on its own.
const WEEKDAY_FULL = 2;
// A place not picked for this long is one to come back to.
const MISSED_AFTER = 21;

export const KINDS = {
  habit: { title: '🍚 단골 추천', weight: 45 },
  explore: { title: '🌱 새로운 도전', weight: 20 },
  revisit: { title: '🕰️ 오랜만에', weight: 15 },
  join: { title: '🤝 합류하기', weight: 10 },
  similar: { title: '🏷️ 취향 넓히기', weight: 10 },
};

// The particle that follows a name: 을/를, 이/가, 은/는, …, by whether it ends in a consonant.
export function josa(word, withFinal, withoutFinal) {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return `${withFinal}(${withoutFinal})`;
  return (code - 0xac00) % 28 === 0 ? withoutFinal : withFinal;
}

// The same numbers for the same member on the same day.
function seeded(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The member's picks, newest first, one per day: [{ menuId, date }].
function picksOf(memberId, votes, visits) {
  const byDay = new Map();
  const sorted = votes.filter((v) => v.memberId === memberId).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  for (const v of sorted) byDay.set(v.votedOn, v.menuId);
  for (const v of visits) {
    if (v.canceled || v.memberId !== memberId || byDay.has(v.visitedOn)) continue;
    byDay.set(v.visitedOn, v.menuId);
  }
  return [...byDay].map(([date, menuId]) => ({ date, menuId })).sort((a, b) => b.date.localeCompare(a.date));
}

const tally = (list) => {
  const counts = new Map();
  for (const id of list) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
};

// Ranked by count, ties to the one picked most recently (list is newest first).
const ranked = (list) => {
  const counts = tally(list);
  return [...counts].map(([menuId, count]) => ({ menuId, count, first: list.indexOf(menuId) })).sort((a, b) => b.count - a.count || a.first - b.first);
};

const object = (name) => `${name}${josa(name, '을', '를')}`;

export function recommend(memberId, { menus, votes = [], visits = [], today, othersToday = [] }) {
  const places = menus.filter((m) => !m.hidden);
  if (places.length === 0) return null;
  const byId = new Map(menus.map((m) => [m.id, m]));
  const picks = picksOf(memberId, votes, visits).filter((p) => byId.has(p.menuId));
  const n = picks.length;
  const weekday = weekdayOf(today);
  const onDay = picks.filter((p) => weekdayOf(p.date) === weekday);

  const mine = tally(picks.map((p) => p.menuId));
  const mineOnDay = tally(onDay.map((p) => p.menuId));
  const lastMine = new Map();
  for (const p of picks) if (!lastMine.has(p.menuId)) lastMine.set(p.menuId, p.date);
  const tagWeight = new Map();
  for (const p of picks) for (const t of byId.get(p.menuId).tags ?? []) tagWeight.set(t, (tagWeight.get(t) ?? 0) + 1 / n);
  const topTag = (m) => (m.tags ?? []).reduce((a, t) => ((tagWeight.get(t) ?? 0) > (tagWeight.get(a) ?? -1) ? t : a), null);

  const went = visits.filter((v) => !v.canceled);
  const team = tally(went.map((v) => v.menuId));
  const teamMax = Math.max(1, ...team.values());
  const lastVisit = new Map();
  for (const v of went) if (!lastVisit.has(v.menuId) || v.visitedOn > lastVisit.get(v.menuId)) lastVisit.set(v.menuId, v.visitedOn);
  const daysSince = (id) => (lastVisit.has(id) ? dayNumber(today) - dayNumber(lastVisit.get(id)) : null);

  const trust = n / (n + TRUST_AT);
  const dayTrust = Math.min(1, onDay.length / WEEKDAY_FULL);
  const affinityOf = (m) => Math.max(0, ...(m.tags ?? []).map((t) => tagWeight.get(t) ?? 0));
  // How well a place suits the member today: their habits, the team's liking, freshness.
  const scoreOf = (m) => {
    const share = n ? (mine.get(m.id) ?? 0) / n : 0;
    const dayShare = onDay.length ? (mineOnDay.get(m.id) ?? 0) / onDay.length : 0;
    const own = 0.55 * share + 0.3 * dayShare * dayTrust + 0.15 * affinityOf(m);
    const liked = (team.get(m.id) ?? 0) / teamMax;
    const d = daysSince(m.id);
    const fresh = d === null ? 0.12 : d <= 1 ? -0.45 : d <= 3 ? -0.15 : Math.min(0.15, (d / 21) * 0.15);
    return trust * own + (1 - trust) * 0.5 * liked + fresh;
  };
  const byScore = (list) => [...list].sort((a, b) => scoreOf(b) - scoreOf(a) || a.name.localeCompare(b.name, 'ko'));
  // Places the team went to today or yesterday are not suggested by the kinds that look elsewhere.
  const notJustNow = (m) => (daysSince(m.id) ?? Infinity) > 1;
  const teamNote = (m) => {
    const d = daysSince(m.id);
    if (d === null) return '팀이 아직 한 번도 안 간 곳이에요';
    if (d >= 7) return `팀이 ${d}일째 안 갔어요`;
    return null;
  };

  // Each kind: its candidates, best first, and the reasons for one of them.
  const kinds = {
    habit: {
      candidates: byScore(places),
      reasons: (m) => {
        const dayCount = mineOnDay.get(m.id) ?? 0;
        const count = mine.get(m.id) ?? 0;
        const dayTop = Math.max(0, ...mineOnDay.values());
        const lines = [];
        // A weekday habit is a reason only when it is that weekday's top pick.
        if (dayCount >= WEEKDAY_FULL && dayCount === dayTop) lines.push(`역시 ${weekday}요일엔 ${m.name}! ${onDay.length}번 중 ${dayCount}번 고르셨어요`);
        else if (count > 0) lines.push(`지금까지 ${n}번 중 ${count}번 ${object(m.name)} 고르셨어요`);
        else if (affinityOf(m) > 0) lines.push(`자주 고르시는 #${topTag(m)} 가게예요`);
        else if (team.get(m.id)) lines.push(`팀이 ${team.get(m.id)}번 간 곳이에요`);
        lines.push(teamNote(m));
        return lines;
      },
    },
    explore: {
      candidates: places
        .filter((m) => !mine.has(m.id) && notJustNow(m))
        .sort((a, b) => Number(daysSince(a.id) !== null) - Number(daysSince(b.id) !== null) || scoreOf(b) - scoreOf(a) || a.name.localeCompare(b.name, 'ko')),
      reasons: (m) => [`새로운 도전! 아직 한 번도 안 고르신 ${m.name}에 도전해 보세요`, teamNote(m) ?? (team.get(m.id) ? `팀은 ${team.get(m.id)}번 간 곳이에요` : null)],
    },
    revisit: {
      candidates: places
        .filter((m) => (mine.get(m.id) ?? 0) >= 2 && dayNumber(today) - dayNumber(lastMine.get(m.id)) >= MISSED_AFTER && notJustNow(m))
        .sort((a, b) => mine.get(b.id) - mine.get(a.id) || a.name.localeCompare(b.name, 'ko')),
      reasons: (m) => [`그리운 맛! ${object(m.name)} ${dayNumber(today) - dayNumber(lastMine.get(m.id))}일째 안 고르셨어요`, `전에 ${mine.get(m.id)}번 고르신 곳이에요`],
    },
    join: {
      candidates: byScore(places.filter((m) => othersToday.some((o) => o.menuId === m.id))),
      reasons: (m) => {
        const who = othersToday.filter((o) => o.menuId === m.id).map((o) => `${o.name}님`);
        const lead = who.length > 2 ? `${who.slice(0, 2).join(', ')} 외 ${who.length - 2}명` : who.join(', ');
        return [`벌써 ${lead}이 고른 ${m.name}에 합류할래요?`, (mine.get(m.id) ?? 0) > 0 ? `지금까지 ${mine.get(m.id)}번 고르신 곳이기도 해요` : null];
      },
    },
    similar: {
      candidates: byScore(places.filter((m) => affinityOf(m) > 0 && (mine.get(m.id) ?? 0) <= 1 && notJustNow(m))),
      reasons: (m) => [`#${topTag(m)} 좋아하시면 ${m.name}도 있어요`, (mine.get(m.id) ?? 0) === 0 ? '아직 안 고르신 곳이에요' : '딱 한 번 고르신 곳이에요'],
    },
  };

  // The draw: kinds by weight, without putting one back, the same all day for this member.
  const weightOf = (kind) => KINDS[kind].weight * (kind === 'habit' ? 0.5 + 0.5 * trust : kind === 'explore' ? 1.5 - 0.5 * trust : 1);
  let left = Object.keys(kinds).filter((k) => kinds[k].candidates.length > 0);
  const rng = seeded(`${memberId}|${today}`);
  const order = [];
  while (left.length) {
    const total = left.reduce((s, k) => s + weightOf(k), 0);
    let r = rng() * total;
    const k = left.find((kind) => (r -= weightOf(kind)) < 0) ?? left.at(-1);
    order.push(k);
    left = left.filter((x) => x !== k);
  }
  // Each kind on a place of its own, handed out to the kinds with the fewest places to offer
  // first, so a kind with one place keeps it; a kind left with nothing new is dropped.
  const used = new Set();
  const chosen = new Map();
  for (const kind of [...order].sort((a, b) => kinds[a].candidates.length - kinds[b].candidates.length)) {
    const m = kinds[kind].candidates.find((c) => !used.has(c.id));
    if (!m) continue;
    used.add(m.id);
    chosen.set(kind, m);
  }
  const options = order
    .filter((kind) => chosen.has(kind))
    .map((kind) => ({ kind, title: KINDS[kind].title, menuId: chosen.get(kind).id, reasons: kinds[kind].reasons(chosen.get(kind)).filter(Boolean).slice(0, 2) }));

  const note = n === 0 ? '아직 고른 기록이 없어서 팀 기록으로 골랐어요' : n < TRUST_AT ? `고른 기록이 ${n}번뿐이라 팀 기록도 섞었어요` : null;
  const weekdays = WEEKDAYS.slice(1, 6).map((label) => {
    const [top] = ranked(picks.filter((p) => weekdayOf(p.date) === label).map((p) => p.menuId));
    return top ? { label, menuId: top.menuId, count: top.count } : { label, menuId: null, count: 0 };
  });
  return {
    options,
    note,
    summary: { picks: n, top: ranked(picks.map((p) => p.menuId)).slice(0, 3).map(({ menuId, count }) => ({ menuId, count })), weekdays },
  };
}
