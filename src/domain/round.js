import { DT, createWorld, dropBall, removeBall, stepWorld } from './physics.js';

const DROP_MARGIN = 30;
// How long everyone must have been down in the slots before the result is called.
const DOWN_HOLD = 0.5;

const clearOf = (world, x, y, r) => world.balls.every((b) => Math.hypot(b.cx - x, b.cy - y) > b.R + r + 8);

// A player is one ball to drop: its physics, and optionally where it waits on the drop line.
// A player without a spot, or a re-drop, starts at a random x on the drop line.
function dropPlayer(world, player, index, spot) {
  const { board, rng } = world;
  const r = player.physics.radius;
  const lo = DROP_MARGIN + r;
  const hi = board.width - DROP_MARGIN - r;
  let x = spot ?? lo + rng() * (hi - lo);
  for (let tries = 0; spot == null && tries < 40 && !clearOf(world, x, board.dropY, r); tries++) x = lo + rng() * (hi - lo);
  // Neighbours on the line can stand closer than two balls: the later one starts a ball higher.
  let y = board.dropY;
  while (!clearOf(world, x, y, r)) y -= 2 * r + 8;
  const ball = dropBall(world, Math.min(Math.max(x, r), board.width - r), (rng() - 0.5) * 120, player.physics, y);
  ball.player = index;
  return ball;
}

// players: one { physics, x?, counts? } per ball. A player with counts: false is along for the
// ride: it falls, knocks the others about and lands somewhere, but never claims a place, is
// never re-dropped and is not waited for. groups[slot] names what a slot stands for. Two slots
// with the same group count as one place, so a place wanted twice can take two slots and still
// be picked at most once. By default every slot is its own group.
export function createRound(board, players, rng, groups = board.slotEdges.slice(1).map((_, i) => i)) {
  const world = createWorld(board, rng, players[0].physics);
  players.forEach((player, i) => dropPlayer(world, player, i, player.x));
  // owners: group -> the ball that claimed it.
  return { world, players, groups, owners: new Map(), done: false, winners: null };
}

const counts = (round, ball) => round.players[ball.player].counts !== false;

// The first ball to settle in a place claims it for the rest of the round, even while a knock
// sets it wobbling, and the place's other slots close. A ball that was already on its way into
// one of them, or into the claimed slot, is re-dropped as soon as it settles. A claim is lost
// if its ball leaves the place, say knocked out by a ball landing on it.
function claimPlaces(round, emit) {
  const { world, groups, owners } = round;
  for (const [group, ball] of owners) {
    if (ball.zone !== null && groups[ball.zone] === group) continue;
    owners.delete(group);
    emit({ type: 'unclaim', ball });
  }
  const claimed = new Set(owners.values());
  const fresh = world.balls.filter((b) => b.settled && counts(round, b) && !claimed.has(b)).sort((a, b) => a.enteredAt - b.enteredAt);
  for (const ball of fresh) {
    if (owners.has(groups[ball.slot])) {
      removeBall(world, ball);
      emit({ type: 'redrop', ball, slot: ball.slot });
      dropPlayer(world, round.players[ball.player], ball.player, null);
    } else {
      owners.set(groups[ball.slot], ball);
    }
  }
  world.closed = new Set(groups.flatMap((group, slot) => (owners.has(group) && owners.get(group).zone !== slot ? [slot] : [])));
}

export function stepRound(round, emit = () => {}) {
  if (round.done) return;
  stepWorld(round.world, emit);
  claimPlaces(round, emit);
  // The result waits until everyone is down in the slots: a straggler landing late can still
  // knock a counted ball out of its place. It is called once everyone has come to rest, or once
  // the ones still jostling in the slots have been down there a moment.
  const balls = round.world.balls.filter((b) => counts(round, b));
  const down = balls.every((b) => b.settled) && round.world.balls.every((b) => b.settled || b.zone !== null);
  if (!down) {
    round.downSince = null;
    return;
  }
  round.downSince ??= round.world.time;
  const still = round.world.balls.every((b) => b.settled);
  if (!still && round.world.time - round.downSince < DOWN_HOLD) return;
  round.done = true;
  // winners[i] is where player i landed, or null for a player that does not count.
  round.winners = round.players.map((p, i) => (p.counts === false ? null : balls.find((b) => b.player === i).slot));
  emit({ type: 'done', winners: round.winners.filter((w) => w !== null) });
}

// After the result the rest carry on falling and find a place to rest, while the players who
// count stay exactly where they landed, however hard they are bumped.
export function stepAfter(round) {
  const keep = round.world.balls.filter((b) => counts(round, b)).map((b) => ({ b, cx: b.cx, cy: b.cy, pts: b.pts.map((p) => ({ x: p.x, y: p.y })) }));
  stepWorld(round.world);
  for (const { b, cx, cy, pts } of keep) {
    b.pts.forEach((p, i) => {
      p.x = p.px = pts[i].x;
      p.y = p.py = pts[i].y;
    });
    b.cx = cx;
    b.cy = cy;
    b.vx = 0;
    b.vy = 0;
  }
}

export function simulateSingleDrop(board, rng, physics, maxSeconds = 60) {
  const round = createRound(board, [{ physics }], rng);
  const steps = Math.round(maxSeconds / DT);
  for (let i = 0; i < steps && !round.done; i++) stepRound(round);
  return round.done ? round.winners[0] : null;
}
