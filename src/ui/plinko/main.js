import { createLunchService } from '../../application/lunch.js';
import { todayString } from '../../domain/date.js';
import { DT, boardWidth, createBoard, maxSlots, mulberry32, randomBumpers, slotWidthsWithTrigger } from '../../domain/physics.js';
import { createRound, stepAfter, stepRound } from '../../domain/round.js';
import { menuIcon } from '../../domain/icon.js';
import { DEFAULT_SETTINGS } from '../../domain/settings.js';
import { DEFAULT_TEAM, memberPhysics, parseMember } from '../../domain/team.js';
import { ballsOf, castVote, countVotes, dropVote, firstStage, maxWant, nextStage, tally, voteProblem } from '../../domain/votes.js';
import { loadSettings, saveSettings } from '../../infrastructure/settings-storage.js';
import { readSnapshot, writeSnapshot } from '../../infrastructure/snapshot.js';
import { createStore, storeMode } from '../../infrastructure/store.js';
import { teamPhotoUrls } from '../../infrastructure/team-photos.js';
import { $, escapeHtml, markMode, toast } from '../shared/dom.js';
import { createAudio } from './audio.js';
import { createBench } from './bench.js';
import { createFaces } from './faces.js';
import { createIconPicker } from './icon-picker.js';
import { createMenuPanel } from './menu-panel.js';
import { SLOT_COLORS, createRenderer } from './render.js';
import { THEMES } from './themes/index.js';
import { createSettingsDialog } from './settings-dialog.js';
import { createTagEditor } from './tag-editor.js';
import { createVotePicker } from './vote-picker.js';

// Balls brushing past each other are not worth a line; a real knock is.
const BUMP_SPEED = 250;
const SLOWMO_SCALE = 0.4;
// How long the note says who is out before the rest drop again for what is left to pick.
const BETWEEN_TIME = 3.2;

const mode = storeMode();
const lunch = createLunchService(createStore(mode), () => todayString());
markMode(mode);
const audio = createAudio();
const canvas = $('#board');
const renderer = createRenderer(canvas);

// The scene is drawn at once and filled in as things arrive: the team and the places first,
// then the face photos. Until the team is here the ledge is empty and shows it is loading.
// On the shared store, what came last time is kept in this browser and shown straight away
// while the fresh copy loads.
const snapshots = mode === 'shared';
const keptTeam = snapshots ? readSnapshot('members')?.map(parseMember) : null;
const keptMenus = snapshots ? readSnapshot('menus') : null;
let loading = { team: true, menus: true };
let bench = createBench([]);
let faces = createFaces([], teamPhotoUrls);

// The team comes from the shared store; if it cannot be reached, the last team seen here or else
// the built-in team still plays.
async function loadTeam() {
  try {
    const team = await lunch.listMembers();
    if (snapshots) writeSnapshot('members', team);
    return team;
  } catch (err) {
    toast(err.message, true);
    return keptTeam ?? DEFAULT_TEAM.map(parseMember);
  }
}

function showTeam(team) {
  bench = createBench(team);
  faces = createFaces(team, teamPhotoUrls);
  loading = { ...loading, team: false };
  // Everyone hops onto the ledge as they arrive.
  const now = performance.now() / 1000;
  for (const m of team) renderer.jiggle(m, now);
  renderControls();
}

let settings = loadSettings(DEFAULT_SETTINGS);
audio.setMuted(!settings.sound);
renderer.setTheme(settings.theme);
let menus = keptMenus ?? [];
const menuById = (id) => menus.find((m) => m.id === id) ?? { id, name: '?', tags: [] };
// Today's votes, member id -> { menuId, count }, and how many menus to pick. want is what was asked
// for; fewer voted menus cap it (see wantNow).
let votes = new Map();
let want = 1;
const wantNow = () => Math.min(want, maxWant(votes));
const ballCount = () => [...votes.values()].reduce((n, v) => n + v.count, 0);
const votesReady = () => !voteProblem(votes, maxSlots(settings.size));

// What each slot on the board is, left to right: { kind: 'win' | 'lose' | 'trigger' | 'wait' }, a
// slot per ball and among them the spring trigger's, which is nobody's. 'wait' slots stand in
// until there are votes enough to play.
let slots = [];
let board = null;
// The bumpers stay put for a round; slotSeed places the trigger slot and the winning slots, and
// 칸 섞기 draws a new one.
let bumperSeed = Math.random() * 2 ** 32;
let slotSeed = Math.random() * 2 ** 32;
// n slots for the balls, k of them winning, with the trigger slot slipped in among them.
function layOut(n, k) {
  const rng = mulberry32(bumperSeed);
  const bumpers = randomBumpers(rng, boardWidth(n + 1));
  const draw = mulberry32(slotSeed);
  const at = Math.floor(draw() * (n + 1));
  const kinds = shuffle(Array.from({ length: n }, (_, i) => (k === 0 ? 'wait' : i < k ? 'win' : 'lose')), draw);
  slots = [...kinds.slice(0, at), 'trigger', ...kinds.slice(at)].map((kind) => ({ kind }));
  board = createBoard(slotWidthsWithTrigger(n, settings.size, at), settings.size, bumpers, at);
}
layOut(2, 0);

// idle: board ready. running: balls in flight. between: two winning slots went to one menu, and
// the rest are about to play again for what is left. result: the picks shown, waiting for 확정 or
// 다시. stage: the balls in play (stage.balls[i] is player i of the round), what is left to pick
// and what is picked so far (see domain/votes.js). voters: everyone who dropped at the start.
let phase = { name: 'idle', round: null, stage: null, voters: new Set() };
const ballOf = (ball) => phase.stage?.balls[ball.player];
// A member standing past the board's edge, or behind a neighbour, starts the drop elsewhere;
// for a moment they are drawn swooping over from where they stood.
const HOP_TIME = 0.35;
let hop = null;
function liftOf(ball, now) {
  const t = hop && ball.id <= hop.gap.length ? (now - hop.at) / HOP_TIME : 1;
  if (t >= 1) return null;
  const k = (1 - t) ** 2;
  const g = hop.gap[ball.id - 1];
  return { x: g.x * k, y: g.y * k };
}
let timeScale = 1;
let accumulator = 0;
let saving = false;

const benchSpots = () => bench.spots(board, (m) => memberPhysics(settings, m).radius);

function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Slots line up with a round's balls, so only rebuild while idle. Slots are not equally likely
// (bumpers and walls shape where balls land), so fairness comes from where the winning slots go,
// drawn afresh every round. A vote changing keeps the draw.
function rebuildBoard({ reshuffle = false } = {}) {
  if (phase.name !== 'idle') return;
  if (reshuffle) {
    bumperSeed = Math.random() * 2 ** 32;
    slotSeed = Math.random() * 2 ** 32;
  }
  if (votesReady()) layOut(ballCount(), wantNow());
  else layOut(2, 0);
}

// 칸 섞기: before a drop, the winning slots and the trigger slot move, always somewhere new; the
// bumpers stay put. The slots slide over from where they stood.
function shuffleSlots() {
  if (phase.name !== 'idle' || !votesReady()) return;
  const before = slots;
  const centres = board.slotEdges.slice(1).map((x, i) => (board.slotEdges[i] + x) / 2);
  const key = (list) => list.map((s) => s.kind).join();
  for (let tries = 0; tries < 20 && key(slots) === key(before); tries++) {
    slotSeed = Math.random() * 2 ** 32;
    layOut(ballCount(), wantNow());
  }
  // Each slot slides from where the one before it of the same kind stood, in order.
  const from = new Map();
  before.forEach((s, i) => from.set(s.kind, [...(from.get(s.kind) ?? []), centres[i]]));
  const fromX = slots.map((s) => from.get(s.kind).shift());
  renderer.slideSlots(board, fromX, performance.now() / 1000);
  audio.shuffle();
}

function setPhase(next) {
  phase = next;
  document.body.dataset.phase = next.name;
  renderControls();
  renderResult();
}

// Everyone who voted falls from where they wait on the drop line, a ball per vote.
function drop() {
  if (phase.name !== 'idle' || dropProblem()) return;
  votePicker.close();
  audio.unlock();
  const balls = ballsOf(votes, bench.order());
  play(firstStage(balls, wantNow()), new Set(balls.map((b) => b.member.id)));
}

// Drops a stage's balls on the board as it is laid out, each from where its member stands.
function play(stage, voters) {
  accumulator = 0;
  const spots = benchSpots();
  const spotOf = (m) => spots.find((s) => s.member.id === m.id);
  const players = stage.balls.map((b) => ({ physics: memberPhysics(settings, b.member), x: spotOf(b.member).x }));
  const wins = slots.flatMap((s, i) => (s.kind === 'win' ? [i] : []));
  const round = createRound(board, players, Math.random, wins);
  // Where each one really starts (on the board, clear of the others) versus where they stood.
  const now = performance.now() / 1000;
  hop = {
    at: now,
    gap: round.world.balls.map((b) => {
      const from = spotOf(stage.balls[b.player].member);
      return { x: from.x - b.cx, y: from.y - b.cy };
    }),
  };
  setPhase({ name: 'running', round, stage, voters });
  for (const m of new Set(stage.balls.map((b) => b.member))) bench.shout(m, 'drop', now);
}

// After a round: the menus in the winning slots are picked. If one menu took two of them, the
// note says so, and a moment later the rest play again for what is left on a board of their own.
function settleRound() {
  const next = nextStage(phase.stage, phase.round.winners.map((w) => w.player));
  if (next.want === 0) {
    setPhase({ ...phase, name: 'result', picked: next.picked });
    return;
  }
  setPhase({ ...phase, name: 'between', next, at: performance.now() / 1000 });
}

function playOn() {
  const { next, voters } = phase;
  slotSeed = Math.random() * 2 ** 32;
  layOut(next.balls.length, next.want);
  audio.shuffle();
  play(next, voters);
}

function backToIdle() {
  bench.reshuffle();
  bench.quiet(performance.now() / 1000);
  phase = { name: 'idle', round: null, stage: null, voters: new Set() };
  rebuildBoard({ reshuffle: true });
  setPhase(phase);
}

async function confirmResult() {
  if (phase.name !== 'result' || saving) return;
  const { picked } = phase;
  saving = true;
  try {
    await lunch.recordPicks(picked.map(({ menuId, member }) => ({ menuId, memberId: member.id })));
    toast(`${picked.map(({ menuId }) => menuById(menuId).name).join(', ')} 기록 완료. 맛있게 드세요!`);
    backToIdle();
  } catch (err) {
    toast(err.message, true);
  } finally {
    saving = false;
  }
}

// Changing the votes while a result is up means the team wants another go on new terms: the result closes unrecorded and a fresh board is set up. False while balls
// are still falling.
function leaveResult() {
  if (phase.name === 'result') backToIdle();
  return phase.name === 'idle';
}

function retry() {
  if (phase.name !== 'result') return;
  backToIdle();
  drop();
}

function onEngineEvent(event) {
  const now = performance.now() / 1000;
  const who = (ball) => ballOf(ball)?.member;
  renderer.onEvent(event, now);
  // Plain knocks are everywhere; only being flung (a bumper, or bouncing off a ball in a slot)
  // gets a line.
  if (event.type === 'hit' && (event.kind === 'bumper' || event.kind === 'slotBounce')) bench.shout(who(event.ball), 'bounce', now);
  // Two falling members running into each other both have something to say about it.
  if (event.type === 'hit' && event.kind === 'ball' && event.speed > BUMP_SPEED) {
    bench.shout(who(event.ball), 'bump', now);
    bench.shout(who(event.target), 'bump', now);
  }
  if (event.type === 'hit') audio.hit(event.kind, event.speed, event.ball.cx, board.width);
  else if (event.type === 'settle') audio.settle(event.ball.cx, board.width);
  else if (event.type === 'redrop') {
    audio.redrop();
    bench.shout(who(event.ball), 'drop', now);
  } else if (event.type === 'open') {
    audio.open();
  } else if (event.type === 'trigger') {
    audio.trigger(event.ball.cx, board.width);
    bench.shout(who(event.ball), 'trigger', now);
  } else if (event.type === 'spring') {
    audio.spring();
  } else if (event.type === 'claim' && event.win && phase.round.wins) {
    // Into a winning slot: a burst of colour over it.
    renderer.celebrate(board, [event.slot]);
  } else if (event.type === 'unclaim') {
    // Knocked out of the slot they had: they have something to say about that, and losing a
    // winning slot cracks.
    if (phase.round.wins?.has(event.slot)) audio.pop(event.ball.cx, board.width);
    bench.shout(who(event.ball), 'bounce', now);
  } else if (event.type === 'done') {
    settleRound();
    if (phase.name !== 'result') return;
    audio.win(phase.picked.length);
    renderer.celebrate(board, event.winners);
    for (const { member } of phase.picked) bench.shout(member, 'win', now);
  }
}

// Slow motion is for the moment of truth: every ball still moving is past the pegs and one of them
// is not yet in a slot.
function inFinale(round) {
  const moving = round.world.balls.filter((b) => !b.settled);
  return moving.length > 0 && moving.every((b) => b.cy > board.pegBottom + 30) && moving.some((b) => b.zone === null);
}

let last = performance.now();
function frame(nowMs) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (nowMs - last) / 1000);
  last = nowMs;
  let slowmo = false;
  if (phase.name === 'running') {
    slowmo = inFinale(phase.round);
    timeScale += ((slowmo ? SLOWMO_SCALE : 1) - timeScale) * (1 - Math.exp(-6 * dt));
    accumulator += dt * timeScale;
    for (let steps = 0; accumulator >= DT && steps < 40 && phase.name === 'running'; steps++) {
      stepRound(phase.round, onEngineEvent);
      accumulator -= DT;
    }
  } else {
    timeScale = 1;
  }
  // After a round, the ones who did not win keep tumbling down to rest.
  if (phase.name === 'result' || phase.name === 'between') {
    accumulator += dt;
    for (let steps = 0; accumulator >= DT && steps < 40; steps++) {
      stepAfter(phase.round);
      accumulator -= DT;
    }
  }
  const now = nowMs / 1000;
  if (phase.name === 'between' && now - phase.at > BETWEEN_TIME) playOn();
  const away = phase.voters;
  const spots = benchSpots();
  const bounds = bench.bounds(spots, board);
  const owners = phase.round?.owners;
  // A winning slot taken shows the menu of the ball in it.
  const shown = slots.map((s, i) => (s.kind === 'win' && owners?.has(i) ? { ...s, menu: menuById(ballOf(owners.get(i)).menuId) } : s));
  const voteOf = (member) => {
    const vote = votes.get(member.id);
    return vote ? { menu: menuById(vote.menuId), count: vote.count } : null;
  };
  renderer.draw({
    board,
    world: phase.round?.world,
    slots: shown,
    winners: phase.name === 'result' ? phase.round.winners.map((w) => w.slot) : null,
    view: { mode: phase.name === 'between' ? 'result' : phase.name, slowmo },
    now,
    dt,
    bench: { spots, bounds, dragged: press?.at ? { member: press.member, ...press.at } : null, voteOf, speeches: bench.chatter(now, spots, away, bounds), away, shoutOf: bench.shoutOf, loading: loading.team, radius: settings.size },
    liftOf,
    memberOf: (ball) => ballOf(ball)?.member,
    menuOf: (ball) => (ballOf(ball) ? menuById(ballOf(ball).menuId) : null),
    faces,
  });
}

function dropProblem() {
  if (loading.menus) return '가게 목록을 불러오는 중이에요';
  if (loading.team) return '팀원을 불러오는 중이에요';
  return voteProblem(votes, maxSlots(settings.size));
}

function renderControls() {
  const busy = phase.name === 'running' || phase.name === 'between';
  const balls = ballCount();
  const kinds = new Set([...votes.values()].map((v) => v.menuId)).size;
  $('#voter-count').textContent = votes.size;
  $('#want-count').textContent = wantNow();
  $('#want-less').disabled = busy || wantNow() <= 1;
  $('#want-more').disabled = busy || wantNow() >= maxWant(votes);
  $('#vote-status').textContent = votes.size ? `메뉴 ${kinds}가지 · 공 ${balls}개 · 당첨 칸 ${wantNow()}개` : '';
  const problem = dropProblem();
  $('#drop-hint').textContent = problem;
  $('#drop').disabled = Boolean(problem) || phase.name !== 'idle';
  $('#shuffle').disabled = phase.name !== 'idle' || !votesReady();
  $('#drop').textContent = busy ? '떨어지는 중…' : balls > 0 ? `공 ${balls}개 떨어뜨리기` : '떨어뜨리기';
}

const faceImg = (member) => {
  const url = faces.url(member);
  return url ? `<img src="${escapeHtml(url)}" alt="">` : '';
};
const pickChips = (picked) => picked.map(({ menuId, member }) => `<li>${faceImg(member)}${menuIcon(menuById(menuId))} ${escapeHtml(menuById(menuId).name)}</li>`).join('');

function renderResult() {
  const overlay = $('#result');
  // Between rounds: who took what, and that the rest go again.
  const note = $('#stage-note');
  note.hidden = phase.name !== 'between';
  if (phase.name === 'between') {
    const { next } = phase;
    const people = new Set(next.balls.map((b) => b.member.id)).size;
    note.innerHTML = `<p>같은 메뉴가 겹쳤어요!</p><ul>${pickChips(next.picked)}</ul><small>남은 ${people}명이 메뉴 ${next.want}개를 두고 다시 겨뤄요</small>`;
  }
  const sofar = $('#picked-so-far');
  sofar.hidden = !(phase.name === 'running' && phase.stage.picked.length > 0);
  if (!sofar.hidden) sofar.querySelector('ul').innerHTML = pickChips(phase.stage.picked);
  if (phase.name !== 'result') {
    overlay.hidden = true;
    return;
  }
  const { picked } = phase;
  $('#result-title').textContent = picked.length > 1 ? `오늘은 ${picked.length}곳으로 나눠 가요` : '오늘의 점심은';
  $('#result-names').innerHTML = picked
    .map(({ menuId, member }, i) => {
      const menu = menuById(menuId);
      const who = `<span class="who">${faceImg(member)}${escapeHtml(member.name)} 픽</span>`;
      return `<li style="--chip:${SLOT_COLORS[(i * 3) % SLOT_COLORS.length]}">${who}${menuIcon(menu)} ${escapeHtml(menu.name)}</li>`;
    })
    .join('');
  overlay.hidden = false;
  $('#confirm').focus();
}

// The shared store can be unreachable; keep the last list on screen and say why.
async function loadMenus() {
  try {
    menus = await lunch.listMenus();
    if (snapshots) writeSnapshot('menus', menus);
  } catch (err) {
    toast(err.message, true);
  }
}

function renderMenus() {
  menuPanel.render(menus, tally(votes, bench.order()), (m) => faces.url(m));
  renderControls();
}

async function refreshMenus() {
  await loadMenus();
  rebuildBoard();
  renderMenus();
}

async function attempt(action) {
  try {
    await action();
    return true;
  } catch (err) {
    toast(err.message, true);
    return false;
  }
}

const menuPanel = createMenuPanel({
  async onRename(id, name) {
    await attempt(() => lunch.renameMenu(id, name));
    await refreshMenus();
  },
  // A hidden place takes its votes with it.
  async onHide(id) {
    if (!leaveResult()) return;
    votes = new Map([...votes].filter(([, v]) => v.menuId !== id));
    await attempt(() => lunch.setMenuHidden(id, true));
    await refreshMenus();
  },
  async onUnhide(id) {
    if (!leaveResult()) return;
    await attempt(() => lunch.setMenuHidden(id, false));
    await refreshMenus();
  },
  onIcon(menu) {
    iconPicker.open(menu);
  },
  onTags(menu) {
    tagEditor.open(menu, menus);
  },
  async onAdd(name) {
    if (!leaveResult()) return false;
    const added = await attempt(() => lunch.addMenu(name));
    await refreshMenus();
    return added;
  },
});

const iconPicker = createIconPicker({
  async onPick(id, icon) {
    await attempt(() => lunch.setMenuIcon(id, icon));
    await refreshMenus();
  },
});

const tagEditor = createTagEditor({
  async onChange(id, tags) {
    const saved = await attempt(() => lunch.setMenuTags(id, tags));
    await refreshMenus();
    return saved;
  },
});

function applySettings(next) {
  const sizeChanged = next.size !== settings.size;
  settings = next;
  saveSettings(settings);
  audio.setMuted(!settings.sound);
  renderer.setTheme(settings.theme);
  renderThemes();
  if (sizeChanged) rebuildBoard();
  settingsDialog.render();
  renderControls();
}

const settingsDialog = createSettingsDialog({
  settings: () => settings,
  onChange: applySettings,
  sizeNote: (s) => `이 크기로는 공을 최대 ${maxSlots(s.size)}개까지 떨어뜨릴 수 있어요. 다음 판부터 적용돼요.`,
});

// The map theme buttons on the board: the picked one shows its name.
function renderThemes() {
  $('#theme-picker').innerHTML = THEMES.map(
    (t) => `<button type="button" data-theme="${t.id}" aria-pressed="${t.id === settings.theme}" title="${escapeHtml(t.name)}"><span aria-hidden="true">${t.icon}</span><b>${escapeHtml(t.name)}</b></button>`,
  ).join('');
}
$('#theme-picker').addEventListener('click', (e) => {
  const button = e.target instanceof Element && e.target.closest('button[data-theme]');
  if (button && button.dataset.theme !== settings.theme) applySettings({ ...settings, theme: button.dataset.theme });
});

// Votes. Each change shows at once on the line, in the sidebar, on the board and in the picker.
function afterVotes() {
  rebuildBoard();
  renderMenus();
  const member = votePicker.member();
  if (member) votePicker.update(pickerState(member));
}

function vote(member, menuId) {
  if (!leaveResult()) return;
  votes = castVote(votes, member.id, menuId);
  const now = performance.now() / 1000;
  bench.cheer(member, now);
  renderer.jiggle(member, now);
  afterVotes();
}

const votePicker = createVotePicker({
  onVote: vote,
  onCount(member, delta) {
    if (!leaveResult()) return;
    votes = countVotes(votes, member.id, delta);
    renderer.jiggle(member, performance.now() / 1000);
    afterVotes();
  },
  onClear(member) {
    if (!leaveResult()) return;
    votes = dropVote(votes, member.id);
    bench.hush(member);
    afterVotes();
  },
});

function pickerState(member) {
  return { menus, vote: votes.get(member.id) ?? null, tally: tally(votes, bench.order()), faceUrl: (m) => faces.url(m) };
}

// Pressing a waiting member opens the window to pick their menu under their face, or closes it.
function openPicker(member) {
  if (!member || phase.name === 'running' || phase.name === 'between') return;
  if (votePicker.member() === member) return votePicker.close();
  const spot = benchSpots().find((s) => s.member === member);
  const rect = canvas.getBoundingClientRect();
  const at = renderer.toScreen(spot.x, spot.y, spot.r);
  renderer.jiggle(member, performance.now() / 1000);
  votePicker.open(member, { x: rect.left + at.x, y: rect.top + at.y, r: at.r }, pickerState(member));
}

function setWant(delta) {
  if (!leaveResult()) return;
  want = Math.min(Math.max(1, wantNow() + delta), maxWant(votes));
  rebuildBoard();
  renderControls();
}

function boardPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return renderer.toBoard(e.clientX - rect.left, e.clientY - rect.top);
}

function memberAt(e) {
  if (phase.name === 'running') return null;
  const p = boardPoint(e);
  return bench.hit(benchSpots(), p.x, p.y);
}

function poke(e) {
  const rect = canvas.getBoundingClientRect();
  renderer.poke(e.clientX - rect.left, e.clientY - rect.top, performance.now() / 1000);
}

// Pressing a waiting member and letting go opens their menu picker; pressing and moving drags
// them along the line to another place, where they stay when let go, or onto a place in the
// sidebar, which votes for it. press: the member held down, or null.
const DRAG_FROM = 8;
let press = null;
let pressEndedAt = -Infinity;
canvas.addEventListener('pointerdown', (e) => {
  const member = memberAt(e);
  if (member) press = { member, id: e.pointerId, startX: e.clientX, startY: e.clientY, dragging: false, at: null, from: bench.order().indexOf(member), over: null };
});
// A touch that starts on a member is theirs, not the page's to scroll. That also stops the click
// a tap would make, so pointerup opens their picker instead.
canvas.addEventListener('touchstart', (e) => {
  if (press) e.preventDefault();
}, { passive: false });
canvas.addEventListener('pointermove', (e) => {
  if (press?.id === e.pointerId) {
    if (!press.dragging && Math.hypot(e.clientX - press.startX, e.clientY - press.startY) > DRAG_FROM) {
      if (!leaveResult()) {
        press = null;
        return;
      }
      press.dragging = true;
      press.at = boardPoint(e);
      // Keep getting this pointer's moves when it leaves the canvas.
      canvas.setPointerCapture(e.pointerId);
    }
    if (press.dragging) {
      press.at = boardPoint(e);
      const over = placeUnder(e);
      if (over !== press.over) {
        press.over?.classList.remove('drop-target');
        over?.classList.add('drop-target');
        press.over = over;
      }
      // Over the sidebar the member keeps their place in the line.
      bench.move(press.member, over ? press.from : bench.placeAt(benchSpots(), press.at.x));
      canvas.style.cursor = 'grabbing';
      return;
    }
  }
  canvas.style.cursor = memberAt(e) ? 'grab' : '';
});
canvas.addEventListener('pointerup', (e) => {
  if (press?.id !== e.pointerId) return;
  if (!press.dragging) {
    poke(e);
    openPicker(press.member);
  } else if (press.over) {
    press.over.classList.remove('drop-target');
    vote(press.member, press.over.dataset.id);
  }
  press = null;
  pressEndedAt = e.timeStamp;
  canvas.style.cursor = memberAt(e) ? 'grab' : '';
});
canvas.addEventListener('pointercancel', () => {
  press?.over?.classList.remove('drop-target');
  press = null;
});
// The place in the sidebar under the pointer, if any: a row of the list or of today's votes.
function placeUnder(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  return el?.closest('#menu-list li[data-id], #vote-summary li[data-id]') ?? null;
}
// Any other click on the scene gets a little reaction. A press on a member was dealt with on
// pointerup, and the click that follows it is skipped.
canvas.addEventListener('click', (e) => {
  if (e.timeStamp - pressEndedAt < 400) return;
  votePicker.close();
  poke(e);
});
$('#result-close').addEventListener('click', leaveResult);
$('#drop').addEventListener('click', drop);
$('#shuffle').addEventListener('click', shuffleSlots);
$('#want-less').addEventListener('click', () => setWant(-1));
$('#want-more').addEventListener('click', () => setWant(1));
$('#confirm').addEventListener('click', confirmResult);
$('#retry').addEventListener('click', retry);

document.addEventListener('keydown', (e) => {
  if (settingsDialog.isOpen() || iconPicker.isOpen() || tagEditor.isOpen()) return;
  if (e.target instanceof Element && e.target.closest('input, textarea')) return;
  // Space only ever means "drop", and on a result Enter only ever means "confirm": neither may
  // press whichever button holds focus. Letter keys go by e.code so they work with the Korean
  // IME on (R types ㄱ there).
  if (e.code === 'Space') {
    e.preventDefault();
    drop();
  } else if (e.code === 'KeyS') {
    shuffleSlots();
  } else if (/^Digit[1-9]$/.test(e.code)) {
    e.preventDefault();
    openPicker(bench.byKey(Number(e.code.slice(5))));
  } else if (phase.name !== 'result') {
    return;
  } else if (e.key === 'Enter') {
    e.preventDefault();
    confirmResult();
  } else if (e.code === 'KeyR') {
    retry();
  } else if (e.key === 'Escape' || e.code === 'KeyX') {
    leaveResult();
  }
});

// ?debug exposes read-only state so a headless browser can check what is on screen.
if (new URLSearchParams(location.search).has('debug')) {
  window.__plinko = {
    phase: () => phase.name,
    balls: () => phase.round?.world.balls ?? [],
    closed: () => [...(phase.round?.world.closed ?? [])],
    visible: renderer.visible,
    bench: () => benchSpots().map((s) => ({ id: s.member.id, x: s.x, y: s.y, r: s.r, vote: votes.get(s.member.id) ?? null })),
    members: () => phase.stage?.balls.map((b) => b.member.id) ?? [],
    winners: () => phase.round?.winners ?? null,
    picked: () => (phase.picked ?? phase.next?.picked ?? phase.stage?.picked ?? []).map((p) => ({ menuId: p.menuId, member: p.member.id })),
    slots: () => slots.map((s) => s.kind),
    trigger: () => ({ slot: board.triggerSlot, opened: phase.round?.trigger.openAt ?? null, pressed: phase.round?.trigger.at ?? null }),
    said: () => (phase.stage?.balls ?? []).map((b) => bench.shoutOf(b.member, performance.now() / 1000)?.line ?? null),
  };
}

new ResizeObserver(() => renderer.resize()).observe(canvas);
window.addEventListener('resize', () => renderer.resize());

settingsDialog.render();
renderThemes();
setPhase({ name: 'idle', round: null, stage: null, voters: new Set() });
renderer.resize();
requestAnimationFrame(frame);
// The scene stays covered until the web fonts are in (or 3 seconds, as the page text does), so
// names and lines never show in a stand-in font first.
Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 3000))]).then(() => $('#stage-loading').remove());

// The team and the places are fetched side by side; each shows up as soon as it is in. What was
// kept from last time shows first, and gives way only if the fresh copy differs.
if (keptTeam) showTeam(keptTeam);
loadTeam().then((team) => {
  const same = keptTeam && JSON.stringify(team) === JSON.stringify(keptTeam);
  if (!same && phase.name === 'idle') showTeam(team);
});
// Today's votes start empty: the team picks where it feels like going each day.
const showMenus = () => {
  loading = { ...loading, menus: false };
  rebuildBoard();
  renderMenus();
};
if (keptMenus) showMenus();
loadMenus().then(showMenus);

// Fonts, photos and the logo are kept in this browser for the next visit (see sw.js).
if ('serviceWorker' in navigator && mode !== 'demo') navigator.serviceWorker.register('sw.js').catch(() => {});
