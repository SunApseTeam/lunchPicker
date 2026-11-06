import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_VOTES, ballsOf, castVote, countVotes, dropVote, firstStage, maxWant, nextStage, tally, voteProblem } from '../src/domain/votes.js';

const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() }));

test('a member votes for one menu: voting again moves the vote and keeps how many', () => {
  let votes = castVote(new Map(), 'a', 'kimchi');
  votes = countVotes(votes, 'a', 1);
  votes = castVote(votes, 'a', 'gukbap');
  assert.deepEqual(votes.get('a'), { menuId: 'gukbap', count: 2 });
  assert.equal(dropVote(votes, 'a').size, 0);
});

test('a member casts between one and MAX_VOTES votes', () => {
  let votes = castVote(new Map(), 'a', 'kimchi');
  votes = countVotes(votes, 'a', -1);
  assert.equal(votes.get('a').count, 1);
  for (let i = 0; i < 10; i++) votes = countVotes(votes, 'a', 1);
  assert.equal(votes.get('a').count, MAX_VOTES);
  assert.equal(countVotes(votes, 'b', 1), votes, 'no vote, nothing to count');
});

test('every vote is a ball, in the order the members stand', () => {
  const votes = new Map([['a', { menuId: 'x', count: 2 }], ['c', { menuId: 'y', count: 1 }]]);
  assert.deepEqual(ballsOf(votes, [c, b, a]).map((ball) => `${ball.member.id}:${ball.menuId}`), ['c:y', 'a:x', 'a:x']);
});

test('the tally lists each voted menu with its voters, most balls first', () => {
  const votes = new Map([['a', { menuId: 'x', count: 1 }], ['b', { menuId: 'y', count: 1 }], ['c', { menuId: 'y', count: 2 }]]);
  const t = tally(votes, [a, b, c, d]);
  assert.deepEqual(t.map((e) => [e.menuId, e.balls, e.voters.map((v) => v.member.id)]), [['y', 3, ['b', 'c']], ['x', 1, ['a']]]);
});

test('at least one voted menu must lose, and there must be room for every ball', () => {
  const one = new Map([['a', { menuId: 'x', count: 1 }], ['b', { menuId: 'x', count: 1 }]]);
  assert.match(voteProblem(new Map(), 8), /골라/);
  assert.match(voteProblem(one, 8), /2가지/);
  assert.equal(maxWant(one), 1);
  const three = new Map([['a', { menuId: 'x', count: 3 }], ['b', { menuId: 'y', count: 3 }], ['c', { menuId: 'z', count: 3 }]]);
  assert.equal(voteProblem(three, 9), '');
  assert.match(voteProblem(three, 8), /8개/);
  assert.equal(maxWant(three), 2);
});

test('two winning slots on one menu pick it once; its balls step aside and the rest play for what is left', () => {
  const balls = [
    { member: a, menuId: 'x' },
    { member: b, menuId: 'x' },
    { member: c, menuId: 'y' },
    { member: d, menuId: 'z' },
    { member: d, menuId: 'z' },
  ];
  const stage = nextStage(firstStage(balls, 2), [1, 0]);
  assert.deepEqual(stage.picked, [{ menuId: 'x', member: b }], 'credited to the first winner, left to right');
  assert.equal(stage.want, 1);
  assert.deepEqual(stage.balls.map((ball) => ball.menuId), ['y', 'z', 'z']);
  const last = nextStage(stage, [2]);
  assert.equal(last.want, 0);
  assert.deepEqual(last.picked.map((p) => [p.menuId, p.member.id]), [['x', 'b'], ['z', 'd']]);
});

test('distinct winners pick everything wanted in one go', () => {
  const balls = [{ member: a, menuId: 'x' }, { member: b, menuId: 'y' }, { member: c, menuId: 'z' }];
  const stage = nextStage(firstStage(balls, 2), [0, 2]);
  assert.equal(stage.want, 0);
  assert.deepEqual(stage.picked.map((p) => p.menuId), ['x', 'z']);
});
