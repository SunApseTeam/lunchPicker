// The team waiting on the drop line. Clicking a member toggles them in or out of the next drop;
// the ones picked fall from where they stand. Their order is reshuffled every round, so where
// someone stands gives them no edge. One member at a time says a line in a speech bubble.
const GAP = 18;
const SAY_EVERY = 2.6;
// How long a bubble stays up, by situation. A win line stays until the next round.
const LIFE = { wait: 2.5, drop: 1.4, bounce: 1.1, win: Infinity };
// Knocks come thick and fast, so a member says a bounce line at most this often.
const BOUNCE_QUIET = 1.5;

export function createBench(team, rng = Math.random) {
  let order = shuffle(team, rng);
  const selected = new Set();
  let turn = 0;
  let saidAt = -Infinity;
  let speech = null;
  // Lines said by the members who are falling: member id -> { line, at, life, when }.
  const shouts = new Map();
  const pick = (list) => list[Math.floor(rng() * list.length)];

  function shuffle(list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Spots spread evenly over the board. On a narrow board the members stand smaller while they
  // wait; radius(member) is their real size, the one they fall at.
  function spots(board, radius) {
    const step = board.width / order.length;
    return order.map((member, i) => {
      const r = Math.min(radius(member), step / 2 - GAP / 2);
      return { member, x: step * (i + 0.5), y: board.dropY, r };
    });
  }

  function hit(list, x, y) {
    return list.find((s) => Math.hypot(s.x - x, s.y - y) <= s.r + 6)?.member ?? null;
  }

  function toggle(member) {
    if (selected.has(member.id)) selected.delete(member.id);
    else selected.add(member.id);
  }

  // Waiting members take turns talking: a new line every few seconds, never twice in a row from
  // the same member. Members in `away` (dropping right now) do not talk.
  function talk(now, away = new Set()) {
    if (now - saidAt < SAY_EVERY) return speech;
    const waiting = order.filter((m) => !away.has(m.id));
    if (waiting.length === 0) return (speech = null);
    turn += 1;
    const member = waiting[turn % waiting.length];
    saidAt = now;
    speech = { member, line: pick(member.lines.wait), at: now, life: LIFE.wait };
    return speech;
  }

  function shout(member, when, now) {
    if (!member) return;
    const last = shouts.get(member.id);
    if (when === 'bounce' && last && now - last.at < Math.max(BOUNCE_QUIET, last.life)) return;
    shouts.set(member.id, { line: pick(member.lines[when]), at: now, life: LIFE[when], when });
  }

  function shoutOf(member, now) {
    const s = member && shouts.get(member.id);
    return s && now - s.at < s.life ? s : null;
  }

  return {
    spots,
    hit,
    toggle,
    talk,
    shout,
    shoutOf,
    quiet: () => shouts.clear(),
    isSelected: (member) => selected.has(member.id),
    chosen: () => order.filter((m) => selected.has(m.id)),
    count: () => selected.size,
    byKey: (n) => order[n - 1] ?? null,
    reshuffle() {
      order = shuffle(order);
    },
  };
}
