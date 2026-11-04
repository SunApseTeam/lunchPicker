import { DT, createWorld, dropBall, removeBall, stepWorld } from './physics.js';

const DROP_MARGIN = 30;

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

// players: one { physics, x? } per ball. groups[slot] names what a slot stands for. Two slots
// with the same group count as one place, so a place wanted twice can take two slots and still
// be picked at most once. By default every slot is its own group.
export function createRound(board, players, rng, groups = board.slotEdges.slice(1).map((_, i) => i)) {
  const world = createWorld(board, rng, players[0].physics);
  players.forEach((player, i) => dropPlayer(world, player, i, player.x));
  // owners: group -> the ball that claimed it.
  return { world, players, groups, owners: new Map(), done: false, winners: null };
}

// The first ball to settle in a place claims it for the rest of the round, even while a knock
// sets it wobbling, and the place's other slots close. A ball that was already on its way into
// one of them, or into the claimed slot, is re-dropped as soon as it settles. A claim is only
// lost if its ball leaves the place.
function claimPlaces(round, emit) {
  const { world, groups, owners } = round;
  for (const [group, ball] of owners) if (ball.zone === null || groups[ball.zone] !== group) owners.delete(group);
  const claimed = new Set(owners.values());
  const fresh = world.balls.filter((b) => b.settled && !claimed.has(b)).sort((a, b) => a.enteredAt - b.enteredAt);
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
  const balls = round.world.balls;
  if (!balls.every((b) => b.settled)) return;
  round.done = true;
  // winners[i] is where player i landed.
  round.winners = round.players.map((_, i) => balls.find((b) => b.player === i).slot);
  emit({ type: 'done', winners: round.winners });
}

export function simulateSingleDrop(board, rng, physics, maxSeconds = 60) {
  const round = createRound(board, [{ physics }], rng);
  const steps = Math.round(maxSeconds / DT);
  for (let i = 0; i < steps && !round.done; i++) stepRound(round);
  return round.done ? round.winners[0] : null;
}
