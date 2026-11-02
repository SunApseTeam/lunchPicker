import { DT, createWorld, dropBall, removeBall, stepWorld } from './physics.js';

const DROP_MARGIN = 30;

function randomDrop(world) {
  const { board, rng } = world;
  const r = world.physics.radius;
  const lo = DROP_MARGIN + r;
  const hi = board.width - DROP_MARGIN - r;
  let x = lo + rng() * (hi - lo);
  for (let tries = 0; tries < 40; tries++) {
    const clear = world.balls.every((b) => b.cy > board.dropY + 2 * r || Math.abs(b.cx - x) > 2 * r + 8);
    if (clear) break;
    x = lo + rng() * (hi - lo);
  }
  return dropBall(world, x, (rng() - 0.5) * 120);
}

// groups[slot] names what a slot stands for. Two slots with the same group count as one place,
// so a place wanted twice can take two slots and still be picked at most once. By default
// every slot is its own group.
export function createRound(board, pickCount, rng, physics, groups = board.slotEdges.slice(1).map((_, i) => i)) {
  const world = createWorld(board, rng, physics);
  for (let i = 0; i < pickCount; i++) randomDrop(world);
  // owners: group -> the ball that claimed it.
  return { world, pickCount, groups, owners: new Map(), done: false, winners: null };
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
      randomDrop(world);
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
  round.winners = balls.map((b) => b.slot);
  emit({ type: 'done', winners: round.winners });
}

export function simulateSingleDrop(board, rng, physics, maxSeconds = 60) {
  const round = createRound(board, 1, rng, physics);
  const steps = Math.round(maxSeconds / DT);
  for (let i = 0; i < steps && !round.done; i++) stepRound(round);
  return round.done ? round.winners[0] : null;
}
