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

export function createRound(board, pickCount, rng, physics) {
  const world = createWorld(board, rng, physics);
  for (let i = 0; i < pickCount; i++) randomDrop(world);
  return { world, pickCount, done: false, winners: null };
}

function resolveDuplicates(round, emit) {
  const bySlot = new Map();
  for (const ball of round.world.balls) {
    const kept = bySlot.get(ball.slot);
    if (!kept || ball.enteredAt < kept.enteredAt) bySlot.set(ball.slot, ball);
  }
  const losers = round.world.balls.filter((b) => bySlot.get(b.slot) !== b);
  for (const ball of losers) {
    removeBall(round.world, ball);
    emit({ type: 'redrop', ball, slot: ball.slot });
    randomDrop(round.world);
  }
  return losers.length === 0;
}

export function stepRound(round, emit = () => {}) {
  if (round.done) return;
  stepWorld(round.world, emit);
  const balls = round.world.balls;
  if (!balls.every((b) => b.settled)) return;
  if (!resolveDuplicates(round, emit)) return;
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
