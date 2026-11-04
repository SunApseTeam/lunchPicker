// The team waiting on the drop line. Clicking a member toggles them in or out of the next drop;
// the ones picked fall from where they stand. Their order is reshuffled every round, so where
// someone stands gives them no edge. Waiting members chatter, each on their own clock, and the
// falling ones call out what happens to them.
const GAP = 18;
// How long a bubble stays up, by situation. A win line stays until the next round.
const LIFE = { wait: 2.2, drop: 1.4, bounce: 1.1, bump: 1.1, win: Infinity };
// Knocks come thick and fast, so a member calls one out at most this often.
const KNOCK_QUIET = 1.5;
const KNOCKS = new Set(['bounce', 'bump']);
// A waiting member pauses this long (seconds, picked at random) between lines.
const PAUSE = [1.2, 5];
// Bubble width on the board, roughly, to keep two bubbles from covering each other.
export const BUBBLE_FONT = 28;
const bubbleWidth = (line) => line.length * BUBBLE_FONT + 36;

export function createBench(team, rng = Math.random) {
  const shuffle = (list) => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const pause = () => PAUSE[0] + rng() * (PAUSE[1] - PAUSE[0]);

  let order = shuffle(team);
  const selected = new Set();
  // What each member is saying: member id -> { member, line, at, life, when }.
  const said = new Map();
  // When each waiting member next wants to talk. Staggered from the start.
  const nextAt = new Map(team.map((m) => [m.id, rng() * PAUSE[1]]));

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

  const live = (s, now) => s && now - s.at < s.life;

  // Waiting members talk whenever they feel like it, several at once. A line waits a moment if
  // its bubble would cover one already up. Members in `away` (falling now) do not chatter.
  function chatter(now, list, away, width) {
    const up = list.filter((s) => live(said.get(s.member.id), now) && said.get(s.member.id).when === 'wait');
    // Where the bubble ends up: centred over the speaker, slid inward near a wall.
    const span = (s, line) => {
      const w = bubbleWidth(line);
      const left = Math.min(Math.max(s.x - w / 2, 8), width - 8 - w);
      return [left, left + w];
    };
    for (const spot of shuffle(list)) {
      const { member } = spot;
      if (away.has(member.id) || live(said.get(member.id), now) || now < nextAt.get(member.id)) continue;
      const line = pick(member.lines.wait);
      const [a, b] = span(spot, line);
      const covers = up.some((o) => {
        const [c, d] = span(o, said.get(o.member.id).line);
        return a < d + 8 && c < b + 8;
      });
      if (covers) {
        nextAt.set(member.id, now + 0.3 + rng() * 0.7);
        continue;
      }
      say(member, 'wait', now, line);
      up.push(spot);
      nextAt.set(member.id, now + LIFE.wait + pause());
    }
    return list.filter((s) => !away.has(s.member.id)).map((s) => said.get(s.member.id)).filter((s) => live(s, now) && s.when === 'wait');
  }

  function say(member, when, now, line = pick(member.lines[when])) {
    said.set(member.id, { member, line, at: now, life: LIFE[when], when });
  }

  // A falling member calls out a drop, a knock or the result.
  function shout(member, when, now) {
    if (!member) return;
    const last = said.get(member.id);
    if (KNOCKS.has(when) && last && now - last.at < Math.max(KNOCK_QUIET, last.life)) return;
    say(member, when, now);
  }

  function shoutOf(member, now) {
    const s = member && said.get(member.id);
    return live(s, now) && s.when !== 'wait' ? s : null;
  }

  return {
    spots,
    hit,
    toggle,
    chatter,
    shout,
    shoutOf,
    // Back to the drop line: win lines end, and everyone starts chatting again soon.
    quiet(now) {
      said.clear();
      for (const m of team) nextAt.set(m.id, now + rng() * 2);
    },
    isSelected: (member) => selected.has(member.id),
    chosen: () => order.filter((m) => selected.has(m.id)),
    count: () => selected.size,
    byKey: (n) => order[n - 1] ?? null,
    reshuffle() {
      order = shuffle(order);
    },
  };
}
