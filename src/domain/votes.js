// Today's votes. Each member who votes puts one or more votes on one menu, and every vote is a
// ball on the board. The board has a slot per ball, `want` of them winning: a ball that ends up
// in a winning slot wins its menu. When two winning slots go to the same menu, that menu is
// picked once and the balls of every menu picked so far step aside; the rest play again for
// what is left to pick (see nextStage).
//
// votes: Map member id -> { menuId, count }.

// The most votes one member may cast.
export const MAX_VOTES = 3;

export function castVote(votes, memberId, menuId) {
  const next = new Map(votes);
  next.set(memberId, { menuId, count: votes.get(memberId)?.count ?? 1 });
  return next;
}

export function countVotes(votes, memberId, delta) {
  const vote = votes.get(memberId);
  if (!vote) return votes;
  const count = Math.min(MAX_VOTES, Math.max(1, vote.count + delta));
  return new Map(votes).set(memberId, { ...vote, count });
}

export function dropVote(votes, memberId) {
  const next = new Map(votes);
  next.delete(memberId);
  return next;
}

// The voted menus, each with who voted for it and how many balls it has, most balls first.
export function tally(votes, members) {
  const byMenu = new Map();
  for (const member of members) {
    const vote = votes.get(member.id);
    if (!vote) continue;
    if (!byMenu.has(vote.menuId)) byMenu.set(vote.menuId, { menuId: vote.menuId, voters: [], balls: 0 });
    const entry = byMenu.get(vote.menuId);
    entry.voters.push({ member, count: vote.count });
    entry.balls += vote.count;
  }
  return [...byMenu.values()].sort((a, b) => b.balls - a.balls);
}

// One ball per vote, the members in the order given (the line they wait in): [{ member, menuId }].
export function ballsOf(votes, members) {
  return members.flatMap((member) => {
    const vote = votes.get(member.id);
    return vote ? Array.from({ length: vote.count }, () => ({ member, menuId: vote.menuId })) : [];
  });
}

// How many menus can be picked: at least one menu must lose.
export const maxWant = (votes) => Math.max(1, new Set([...votes.values()].map((v) => v.menuId)).size - 1);

// Why the balls cannot be dropped yet, or '' when they can. maxBalls: how many slots fit.
export function voteProblem(votes, maxBalls) {
  if (votes.size === 0) return '팀원 얼굴을 눌러 먹고 싶은 메뉴를 골라 주세요';
  const menus = new Set([...votes.values()].map((v) => v.menuId)).size;
  if (menus < 2) return '서로 다른 메뉴가 2가지 이상 있어야 해요';
  const balls = [...votes.values()].reduce((n, v) => n + v.count, 0);
  if (balls > maxBalls) return `지금 구슬 크기로는 공을 ${maxBalls}개까지 떨어뜨릴 수 있어요`;
  return '';
}

// A stage is one round of play: { balls, want, picked }. balls: the balls dropping, as from
// ballsOf. want: how many menus are still to be picked. picked: the menus picked so far, each
// with the member whose ball won it, [{ menuId, member }].
export function firstStage(balls, want) {
  return { balls, want, picked: [] };
}

// After a round: wins lists the balls (indices into stage.balls) in the winning slots, left to
// right. Each menu among them is picked, once, for the member whose ball got there first in that
// order. If that picks all that was wanted, the next stage has nothing left to pick; otherwise
// the balls of the menus now picked step aside and the rest play for what is left.
export function nextStage(stage, wins) {
  const picked = [...stage.picked];
  for (const i of wins) {
    const { menuId, member } = stage.balls[i];
    if (!picked.some((p) => p.menuId === menuId)) picked.push({ menuId, member });
  }
  const fresh = picked.length - stage.picked.length;
  const taken = new Set(picked.map((p) => p.menuId));
  return { balls: stage.balls.filter((b) => !taken.has(b.menuId)), want: stage.want - fresh, picked };
}
