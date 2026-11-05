import { createLunchService } from '../../application/lunch.js';
import { todayString } from '../../domain/date.js';
import { DT, boardWidth, createBoard, equalWidths, maxSlots, mulberry32, randomBumpers, randomTrigger } from '../../domain/physics.js';
import { createRound, stepAfter, stepRound } from '../../domain/round.js';
import { menuIcon } from '../../domain/icon.js';
import { DEFAULT_SETTINGS } from '../../domain/settings.js';
import { DEFAULT_TEAM, memberPhysics, parseMember } from '../../domain/team.js';
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

const MAX_PICK = 5;
// Balls brushing past each other are not worth a line; a real knock is.
const BUMP_SPEED = 250;
const SLOWMO_SCALE = 0.4;

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
// Today's candidates: place id -> how many slots it takes. A place more people want gets more
// slots, so it is likelier to be picked, but it is still one place: see createRound's groups.
const picks = new Map();
let slotMenus = [];
// One seed per round: the layout stays put while candidates are toggled, and fits whatever
// board width the slot count gives.
// The spring trigger moves with them, to one of the hard-to-reach spots clear of the bumpers.
let bumperSeed = Math.random() * 2 ** 32;
function boardFor(n) {
  const rng = mulberry32(bumperSeed);
  const bumpers = randomBumpers(rng, boardWidth(n));
  return createBoard(equalWidths(n), settings.size, bumpers, randomTrigger(rng, boardWidth(n), bumpers));
}
let board = boardFor(2);

// idle: board ready. running: balls in flight. result: winners shown, waiting for 확정 or 다시.
// members[i] is the team member who fell as player i of the round.
let phase = { name: 'idle', round: null, members: [] };
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

const maxCandidates = () => maxSlots(settings.size);
const candidates = () => menus.filter((m) => !m.hidden && picks.has(m.id));
const candidateSlots = () => candidates().flatMap((m) => Array(picks.get(m.id)).fill(m));
const maxPick = () => Math.max(1, Math.min(MAX_PICK, candidates().length - 1));
const benchSpots = () => bench.spots(board, (m) => memberPhysics(settings, m).radius);

function candidatesValid() {
  return candidates().length >= 2 && candidateSlots().length <= maxCandidates();
}

const idsKey = (list) => list.map((m) => m.id).sort().join();

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Slot indices in a finished round point into slotMenus, so only rebuild while idle.
// Slots are not equally likely (bumpers and walls shape where balls land), so fairness comes
// from the shuffle: every menu is equally likely to sit in every slot. Every new round
// reshuffles the menus and moves the bumpers; a rename, icon or size change keeps today's
// order when the candidates are the same.
function rebuildBoard({ reshuffle = false } = {}) {
  if (phase.name !== 'idle') return;
  const next = candidatesValid() ? candidateSlots() : null;
  const same = next && idsKey(next) === idsKey(slotMenus);
  if (!next) slotMenus = [{ name: '?' }, { name: '?' }];
  else if (same && !reshuffle) slotMenus = slotMenus.map((s) => next.find((m) => m.id === s.id));
  else slotMenus = shuffle(next);
  if (reshuffle) bumperSeed = Math.random() * 2 ** 32;
  board = boardFor(slotMenus.length);
}

function setPhase(next) {
  phase = next;
  document.body.dataset.phase = next.name;
  renderControls();
  renderResult();
}

// Everyone falls from where they wait on the drop line; only the picked members' landings count.
// The rest are along to knock them about.
function drop() {
  if (phase.name !== 'idle' || dropProblem()) return;
  audio.unlock();
  accumulator = 0;
  const spots = benchSpots();
  const members = spots.map((s) => s.member);
  const from = spots;
  const players = members.map((m, i) => ({ physics: memberPhysics(settings, m), x: from[i].x, counts: bench.isSelected(m) }));
  const round = createRound(board, players, Math.random, slotMenus.map((m) => m.id));
  // Where each one really starts (on the board, clear of the others) versus where they stood.
  const now = performance.now() / 1000;
  hop = { at: now, gap: round.world.balls.map((b) => ({ x: from[b.player].x - b.cx, y: from[b.player].y - b.cy })) };
  setPhase({ name: 'running', round, members });
  for (const m of bench.chosen()) bench.shout(m, 'drop', now);
}

// Who counts in the round on screen, and where they landed: [{ member, slot }].
function results() {
  return phase.round.winners.flatMap((slot, i) => (slot === null ? [] : [{ member: phase.members[i], slot }]));
}

function backToIdle() {
  bench.reshuffle();
  bench.quiet(performance.now() / 1000);
  phase = { name: 'idle', round: null, members: [] };
  rebuildBoard({ reshuffle: true });
  setPhase(phase);
}

async function confirmResult() {
  if (phase.name !== 'result' || saving) return;
  const picked = results().map(({ slot, member }) => ({ menu: slotMenus[slot], member }));
  saving = true;
  try {
    await lunch.recordPicks(picked.map(({ menu, member }) => ({ menuId: menu.id, memberId: member.id })));
    toast(`${picked.map(({ menu }) => menu.name).join(', ')} 기록 완료. 맛있게 드세요!`);
    backToIdle();
  } catch (err) {
    toast(err.message, true);
  } finally {
    saving = false;
  }
}

// Changing the candidates or who drops while a result is up means the team wants another
// go on new terms: the result closes unrecorded and a fresh board is set up. False while balls
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
  renderer.onEvent(event, now);
  // Plain knocks are everywhere; only being flung (a bumper, or bouncing off a ball in a slot)
  // gets a line.
  if (event.type === 'hit' && (event.kind === 'bumper' || event.kind === 'slotBounce')) bench.shout(phase.members[event.ball.player], 'bounce', now);
  // Two falling members running into each other both have something to say about it.
  if (event.type === 'hit' && event.kind === 'ball' && event.speed > BUMP_SPEED) {
    bench.shout(phase.members[event.ball.player], 'bump', now);
    bench.shout(phase.members[event.target.player], 'bump', now);
  }
  if (event.type === 'hit') audio.hit(event.kind, event.speed, event.ball.cx, board.width);
  else if (event.type === 'settle') audio.settle(event.ball.cx, board.width);
  else if (event.type === 'redrop') {
    audio.redrop();
    bench.shout(phase.members[event.ball.player], 'drop', now);
  } else if (event.type === 'trigger') {
    audio.trigger(event.ball.cx, board.width);
    bench.shout(phase.members[event.ball.player], 'trigger', now);
  } else if (event.type === 'windup') {
    audio.windUp();
  } else if (event.type === 'spring') {
    audio.spring();
  } else if (event.type === 'unclaim') {
    // Knocked out of the place they had: they have something to say about that.
    bench.shout(phase.members[event.ball.player], 'bounce', now);
  } else if (event.type === 'done') {
    audio.win(event.winners.length);
    renderer.celebrate(board, event.winners);
    for (const { member } of results()) bench.shout(member, 'win', now);
    setPhase({ ...phase, name: 'result' });
  }
}

// Slow motion is for the moment of truth: a picked member past the pegs, not yet in a slot. The
// others bouncing about in the slots do not hold it in slow motion.
function inFinale(round) {
  const moving = round.world.balls.filter((b) => !b.settled && round.players[b.player].counts);
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
  // After the result, the members who did not count keep tumbling down to rest.
  if (phase.name === 'result') {
    accumulator += dt;
    for (let steps = 0; accumulator >= DT && steps < 40; steps++) {
      stepAfter(phase.round);
      accumulator -= DT;
    }
  }
  const now = nowMs / 1000;
  const away = new Set(phase.members.map((m) => m.id));
  const spots = benchSpots();
  const bounds = bench.bounds(spots, board);
  renderer.draw({
    board,
    world: phase.round?.world,
    slotMenus,
    winners: phase.name === 'result' ? results().map(({ slot }) => slot) : null,
    view: { mode: phase.name, slowmo },
    now,
    dt,
    bench: { spots, bounds, isSelected: bench.isSelected, speeches: bench.chatter(now, spots, away, bounds), away, shoutOf: bench.shoutOf, loading: loading.team, radius: settings.size },
    liftOf,
    memberOf: (ball) => phase.members[ball.player],
    pickedOf: (ball) => phase.round?.players[ball.player].counts === true,
    faces,
  });
}

function dropProblem() {
  if (loading.menus) return '가게 목록을 불러오는 중이에요';
  if (loading.team) return '팀원을 불러오는 중이에요';
  const n = candidates().length;
  const max = maxCandidates();
  if (n < 2) return '후보를 2개 이상 골라 주세요';
  if (candidateSlots().length > max) return `지금 구슬 크기로는 칸을 ${max}개까지 만들 수 있어요`;
  if (bench.count() === 0) return '보드 위 팀원을 누르거나 1~6 키로 골라 주세요';
  if (bench.count() > maxPick()) return `후보가 ${n}곳이라 ${maxPick()}명까지 떨어질 수 있어요`;
  return '';
}

function renderControls() {
  const n = candidates().length;
  const slots = candidateSlots().length;
  $('#candidate-count').textContent = slots > n ? `${n}곳 · 칸 ${slots}` : n;
  const chosen = bench.chosen();
  $('#pick-count').textContent = `${chosen.length}명`;
  $('#pick-names').textContent = chosen.map((m) => m.name).join(', ');
  const problem = dropProblem();
  $('#drop-hint').textContent = problem;
  $('#drop').disabled = Boolean(problem) || phase.name !== 'idle';
  $('#drop').textContent = phase.name === 'running' ? '떨어지는 중…' : chosen.length > 1 ? `${chosen.length}명 떨어뜨리기` : '떨어뜨리기';
}

function renderResult() {
  const overlay = $('#result');
  if (phase.name !== 'result') {
    overlay.hidden = true;
    return;
  }
  const picked = results().map(({ slot, member }) => ({ menu: slotMenus[slot], color: SLOT_COLORS[slot % SLOT_COLORS.length], member }));
  $('#result-title').textContent = picked.length > 1 ? `오늘은 ${picked.length}곳으로 나눠 가요` : '오늘의 점심은';
  $('#result-names').innerHTML = picked
    .map(({ menu, color, member }) => {
      const face = faces.url(member);
      const who = `<span class="who">${face ? `<img src="${escapeHtml(face)}" alt="">` : ''}${escapeHtml(member.name)}</span>`;
      return `<li style="--chip:${color}">${who}${menuIcon(menu)} ${escapeHtml(menu.name)}</li>`;
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
  menuPanel.render(menus, picks, candidateSlots().length >= maxCandidates());
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
  onToggle(id, checked) {
    if (!leaveResult()) return;
    if (checked) picks.set(id, 1);
    else picks.delete(id);
    rebuildBoard();
    renderMenus();
  },
  // One more (or one fewer) slot for a place, when more people want it.
  onSlots(id, delta) {
    if (!leaveResult() || !picks.has(id)) return;
    const next = picks.get(id) + delta;
    if (next < 1 || (delta > 0 && candidateSlots().length >= maxCandidates())) return;
    picks.set(id, next);
    rebuildBoard();
    renderMenus();
  },
  async onRename(id, name) {
    await attempt(() => lunch.renameMenu(id, name));
    await refreshMenus();
  },
  async onHide(id) {
    if (!leaveResult()) return;
    picks.delete(id);
    await attempt(() => lunch.setMenuHidden(id, true));
    await refreshMenus();
  },
  async onUnhide(id) {
    if (!leaveResult()) return;
    picks.set(id, 1);
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
    const added = await attempt(async () => picks.set((await lunch.addMenu(name)).id, 1));
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
  sizeNote: (s) => `이 크기로는 후보를 최대 ${maxSlots(s.size)}개까지 넣을 수 있어요. 다음 판부터 적용돼요.`,
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

// Clicking a waiting member picks them for the next drop, or puts them back.
function toggleMember(member) {
  if (!member || !leaveResult()) return;
  // Picking past the limit swaps out the latest pick. Before two places are chosen there is no
  // limit to go by yet but the usual cap.
  const now = performance.now() / 1000;
  bench.toggle(member, now, candidates().length >= 2 ? maxPick() : MAX_PICK);
  renderer.jiggle(member, now);
  renderControls();
}

function memberAt(e) {
  if (phase.name === 'running') return null;
  const rect = canvas.getBoundingClientRect();
  const p = renderer.toBoard(e.clientX - rect.left, e.clientY - rect.top);
  return bench.hit(benchSpots(), p.x, p.y);
}
// Any click on the scene gets a little reaction; a click on a waiting member also picks them.
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const now = performance.now() / 1000;
  renderer.poke(e.clientX - rect.left, e.clientY - rect.top, now);
  const member = memberAt(e);
  toggleMember(member);
});
canvas.addEventListener('pointermove', (e) => {
  canvas.style.cursor = memberAt(e) ? 'pointer' : '';
});
$('#result-close').addEventListener('click', leaveResult);
$('#drop').addEventListener('click', drop);
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
  } else if (/^Digit[1-9]$/.test(e.code) && phase.name !== 'running') {
    toggleMember(bench.byKey(Number(e.code.slice(5))));
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
    bench: () => benchSpots().map((s) => ({ id: s.member.id, x: s.x, y: s.y, r: s.r, picked: bench.isSelected(s.member) })),
    members: () => phase.members.map((m) => m.id),
    winners: () => phase.round?.winners ?? null,
    trigger: () => ({ at: board.trigger, pressed: phase.round?.trigger.at ?? null, sprung: phase.round?.trigger.sprung ?? false }),
    said: () => phase.members.map((m) => bench.shoutOf(m, performance.now() / 1000)?.line ?? null),
  };
}

new ResizeObserver(() => renderer.resize()).observe(canvas);
window.addEventListener('resize', () => renderer.resize());

settingsDialog.render();
renderThemes();
setPhase({ name: 'idle', round: null, members: [] });
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
// Today's candidates start empty: the team picks where it feels like going each day.
const showMenus = () => {
  loading = { ...loading, menus: false };
  rebuildBoard();
  renderMenus();
};
if (keptMenus) showMenus();
loadMenus().then(showMenus);

// Fonts, photos and the logo are kept in this browser for the next visit (see sw.js).
if ('serviceWorker' in navigator && mode !== 'demo') navigator.serviceWorker.register('sw.js').catch(() => {});
