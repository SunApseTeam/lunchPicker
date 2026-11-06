import { DT, createWorld, dropBall, removeBall, springSlots, stepWorld } from './physics.js';

const DROP_MARGIN = 30;
// How long a decider may sit on a lid, sliding or wobbling, before it is dropped again.
const LID_WAIT = 1.2;
// How far the trigger button reaches: this far above the slot's mouth, and this far past its
// sides.
const BUTTON_REACH = 28;
const BUTTON_REACH_SIDE = 16;
// The trigger slot's cover shuts this long after the button is pressed, once the springs have
// thrown everyone out.
const COVER_AFTER = 0.5;
// A re-dropped decider bursts a non-decider it comes this close to.
const POP_GAP = 6;
// How long everyone must have been down in the slots before the result is called.
const DOWN_HOLD = 0.5;
// How long the result waits for the others once every decider has come to rest.
const STRAGGLER_WAIT = 3;

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
  if (board.triggerSlot !== null) world.closed.add(board.triggerSlot);
  players.forEach((player, i) => dropPlayer(world, player, i, player.x));
  // owners: group -> the ball that claimed it.
  // trigger: when the trigger slot opened, and who pressed its button and when. It works once a
  // round, and its slot is covered again soon after.
  return { world, players, groups, owners: new Map(), done: false, winners: null, trigger: { openAt: null, by: null, at: null } };
}

const counts = (round, ball) => round.players[ball.player].counts !== false;

// Takes a ball off the board and drops its member again from the top. A decider dropped again
// glows: it bursts any non-decider it touches on the way (see popInTheWay) until it settles.
function dropAgain(round, ball, emit) {
  removeBall(round.world, ball);
  emit({ type: 'redrop', ball, slot: ball.slot });
  const again = dropPlayer(round.world, round.players[ball.player], ball.player, null);
  again.charged = counts(round, again);
}

// A decider stuck on a lid, with nowhere to slide to or wobbling on the spot, holds the round
// up: after a moment there they are dropped again.
function offLids(round, emit) {
  const { world } = round;
  for (const b of [...world.balls]) {
    if (!b.onLid || !counts(round, b)) {
      b.lidSince = null;
      continue;
    }
    b.lidSince ??= world.time;
    if (world.time - b.lidSince > LID_WAIT) dropAgain(round, b, emit);
  }
}

// A glowing decider bursts the non-deciders it runs into, so nobody lying in the way, in a slot
// or on top of one, keeps the round from ending.
function popInTheWay(round, emit) {
  const { world } = round;
  for (const b of world.balls.filter((x) => x.charged)) {
    for (const o of world.balls.filter((x) => !counts(round, x))) {
      if (Math.hypot(b.cx - o.cx, b.cy - o.cy) > b.R + o.R + POP_GAP) continue;
      removeBall(world, o);
      emit({ type: 'pop', ball: b, target: o });
    }
  }
}

// The first ball to settle in a place claims it for the rest of the round, even while a knock
// sets it wobbling. A place's other slots close as soon as a decider is in one of its slots,
// claimed or still on its way down, so nobody follows them in. A ball that was already on its
// way into one of them, or into the claimed slot, is re-dropped as soon as it settles. A claim is
// lost if its ball leaves the place, say knocked out by a ball landing on it.
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
    // The trigger slot is nobody's place: a ball that comes to rest there goes round again.
    if (ball.slot === world.board.triggerSlot || owners.has(groups[ball.slot])) {
      dropAgain(round, ball, emit);
    } else {
      owners.set(groups[ball.slot], ball);
      ball.charged = false;
    }
  }
  // held: group -> its slots with a decider in them.
  const held = new Map();
  const hold = (slot) => {
    const group = groups[slot];
    if (group === null || group === undefined) return;
    if (!held.has(group)) held.set(group, new Set());
    held.get(group).add(slot);
  };
  for (const ball of owners.values()) hold(ball.zone);
  for (const b of world.balls) if (counts(round, b) && b.zone !== null) hold(b.zone);
  world.closed = new Set(groups.flatMap((group, slot) => (held.has(group) && !held.get(group).has(slot) ? [slot] : [])));
  const { triggerSlot } = world.board;
  const { openAt, at } = round.trigger;
  if (triggerSlot !== null && (openAt === null || (at !== null && world.time - at >= COVER_AFTER))) world.closed.add(triggerSlot);
}

// The trigger slot starts shut under a lid. It opens once the first ball comes down onto the
// floor of another slot. From then on any ball reaching its mouth presses the button, however it
// got there, once a round, and at that very moment every ball in every slot is thrown back up,
// the one that pressed it too. Soon after, the slot is covered for the rest of the round.
function pressTrigger(round, emit) {
  const { world, trigger } = round;
  const { board } = world;
  const slot = board.triggerSlot;
  if (slot === null || trigger.by) return;
  if (trigger.openAt === null) {
    if (!world.balls.some((b) => b.onFloor && !b.onLid && b.zone !== slot)) return;
    trigger.openAt = world.time;
    emit({ type: 'open', slot });
  }
  const x0 = board.slotEdges[slot] - BUTTON_REACH_SIDE;
  const x1 = board.slotEdges[slot + 1] + BUTTON_REACH_SIDE;
  const ball = world.balls.find((b) => b.cx > x0 && b.cx < x1 && b.bottom > board.dividerTop - BUTTON_REACH);
  if (!ball) return;
  trigger.by = ball;
  trigger.at = world.time;
  emit({ type: 'trigger', ball });
  emit({ type: 'spring', balls: springSlots(world, [ball]) });
}

export function stepRound(round, emit = () => {}) {
  if (round.done) return;
  stepWorld(round.world, emit);
  popInTheWay(round, emit);
  pressTrigger(round, emit);
  offLids(round, emit);
  claimPlaces(round, emit);
  // The result waits until every decider has come to rest and everyone else is down in the
  // slots: a straggler landing late can still knock a counted ball out of its place. It is called
  // once everyone has come to rest, once the ones still jostling in the slots have been down there
  // a moment, or once the deciders have rested a while, whatever the others are up to.
  const { world } = round;
  const time = world.time;
  const balls = world.balls.filter((b) => counts(round, b));
  if (!balls.every((b) => b.settled)) {
    round.decidedSince = null;
    round.downSince = null;
    return;
  }
  round.decidedSince ??= time;
  if (world.balls.every((b) => b.settled || b.zone !== null)) round.downSince ??= time;
  else round.downSince = null;
  const still = world.balls.every((b) => b.settled);
  const down = round.downSince !== null && time - round.downSince >= DOWN_HOLD;
  if (!still && !down && time - round.decidedSince < STRAGGLER_WAIT) return;
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
