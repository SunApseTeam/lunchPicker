import { DT, createWorld, dropBall, removeBall, springSlots, stepWorld } from './physics.js';

const DROP_MARGIN = 30;
// How long a ball may sit on a lid, sliding or wobbling, before it is dropped again.
const LID_WAIT = 1.2;
// How far the trigger button reaches: this far above the slot's mouth, and this far past its
// sides.
const BUTTON_REACH = 28;
const BUTTON_REACH_SIDE = 16;
// The trigger slot's cover shuts this long after the button is pressed, once the springs have
// thrown everyone out.
const COVER_AFTER = 0.5;
// How long everyone must have been down in the slots before the result is called.
const DOWN_HOLD = 0.5;
// How long the result waits for the others once every winning slot is taken.
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

// players: one { physics, x? } per ball. Every slot holds one ball. wins lists the slots that
// win: the round is over once every one of them is taken. Without it, every ball wins the slot
// it takes, and the round is over once each has one.
export function createRound(board, players, rng, wins = null) {
  const world = createWorld(board, rng, players[0].physics);
  if (board.triggerSlot !== null) world.closed.add(board.triggerSlot);
  players.forEach((player, i) => dropPlayer(world, player, i, player.x));
  // owners: slot -> the ball that claimed it.
  // trigger: when the trigger slot opened, and who pressed its button and when. It works once a
  // round, and its slot is covered again soon after.
  return { world, players, wins: wins && new Set(wins), owners: new Map(), done: false, winners: null, trigger: { openAt: null, by: null, at: null } };
}

// Takes a ball off the board and drops it again from the top. It glows until it settles.
function dropAgain(round, ball, emit) {
  removeBall(round.world, ball);
  emit({ type: 'redrop', ball, slot: ball.slot });
  const again = dropPlayer(round.world, round.players[ball.player], ball.player, null);
  again.charged = true;
}

// A ball stuck on a lid, with nowhere to slide to or wobbling on the spot, holds the round up:
// after a moment there it is dropped again.
function offLids(round, emit) {
  const { world } = round;
  for (const b of [...world.balls]) {
    if (!b.onLid) {
      b.lidSince = null;
      continue;
    }
    b.lidSince ??= world.time;
    if (world.time - b.lidSince > LID_WAIT) dropAgain(round, b, emit);
  }
}

// A slot holds one ball. The first to settle in it claims it, even while a knock sets it
// wobbling, and loses it only by leaving, say knocked out by a ball landing on it. A ball that
// comes to rest in a slot already claimed, on top of its owner, is dropped again, and so is one
// at rest in the trigger slot, which is nobody's.
function claimSlots(round, emit) {
  const { world, owners } = round;
  for (const [slot, ball] of owners) {
    if (ball.zone === slot) continue;
    owners.delete(slot);
    emit({ type: 'unclaim', ball, slot });
  }
  const claimed = new Set(owners.values());
  const fresh = world.balls.filter((b) => b.settled && !claimed.has(b)).sort((a, b) => a.enteredAt - b.enteredAt);
  for (const ball of fresh) {
    if (ball.slot === world.board.triggerSlot || owners.has(ball.slot)) {
      dropAgain(round, ball, emit);
    } else {
      owners.set(ball.slot, ball);
      ball.charged = false;
      emit({ type: 'claim', ball, slot: ball.slot, win: !round.wins || round.wins.has(ball.slot) });
    }
  }
  // Once the free slots left all win or all lose, who wins is settled, short of a knock-out:
  // from then on nobody is knocked out, and the balls still looking are drawn into the free slots.
  if (round.wins) {
    const free = round.world.board.slotEdges.slice(1).map((_, i) => i).filter((i) => i !== world.board.triggerSlot && !owners.has(i));
    world.endgame = free.length > 0 && (free.every((i) => round.wins.has(i)) || free.every((i) => !round.wins.has(i)));
  }
  const { triggerSlot } = world.board;
  const { openAt, at } = round.trigger;
  if (triggerSlot === null) return;
  if (openAt === null || (at !== null && world.time - at >= COVER_AFTER)) world.closed.add(triggerSlot);
  else world.closed.delete(triggerSlot);
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
  pressTrigger(round, emit);
  offLids(round, emit);
  claimSlots(round, emit);
  // The result waits until every winning slot is taken, and then for the rest to come down: a
  // straggler landing late can still knock a winner out of its slot. It is called once everyone
  // has come to rest, once the ones still jostling in the slots have been down there a moment, or
  // once the winners have held their slots a while, whatever the others are up to.
  const { world, owners } = round;
  const time = world.time;
  const taken = round.wins ? [...round.wins].every((slot) => owners.has(slot)) : owners.size === round.players.length;
  if (!taken) {
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
  // winners: the winning slots left to right, each with the player whose ball holds it.
  round.winners = [...(round.wins ?? owners.keys())].sort((a, b) => a - b).map((slot) => ({ slot, player: owners.get(slot).player }));
  emit({ type: 'done', winners: round.winners.map((w) => w.slot) });
}

// After the result the rest carry on falling and find a place to rest, while the winners stay
// exactly where they landed, however hard they are bumped.
export function stepAfter(round) {
  const held = new Set(round.winners?.map((w) => round.owners.get(w.slot)) ?? []);
  const keep = round.world.balls.filter((b) => held.has(b)).map((b) => ({ b, cx: b.cx, cy: b.cy, pts: b.pts.map((p) => ({ x: p.x, y: p.y })) }));
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
  return round.done ? round.winners[0].slot : null;
}
