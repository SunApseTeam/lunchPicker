import { createLunchService } from '../../application/lunch.js';
import { todayString } from '../../domain/date.js';
import { DT, createBoard, equalWidths, maxSlots, physicsFrom } from '../../domain/physics.js';
import { createRound, stepRound } from '../../domain/round.js';
import { menuIcon } from '../../domain/icon.js';
import { DEFAULT_SETTINGS } from '../../domain/settings.js';
import { loadSettings, saveSettings } from '../../infrastructure/settings-storage.js';
import { createStore, storeMode } from '../../infrastructure/store.js';
import { $, escapeHtml, markMode, toast } from '../shared/dom.js';
import { createAudio } from './audio.js';
import { createIconPicker } from './icon-picker.js';
import { createMenuPanel } from './menu-panel.js';
import { SLOT_COLORS, createRenderer } from './render.js';
import { createSettingsDialog } from './settings-dialog.js';

const MAX_PICK = 5;
const SLOWMO_SCALE = 0.4;

const mode = storeMode();
const lunch = createLunchService(createStore(mode), () => todayString());
markMode(mode);
const audio = createAudio();
const canvas = $('#board');
const renderer = createRenderer(canvas);

let settings = loadSettings(DEFAULT_SETTINGS);
audio.setMuted(!settings.sound);
let menus = [];
const candidateIds = new Set();
let pickCount = 1;
let slotMenus = [];
let board = createBoard(equalWidths(2), settings.size);

// idle: board ready. running: balls in flight. result: winners shown, waiting for 확정 or 다시.
let phase = { name: 'idle', round: null };
let timeScale = 1;
let accumulator = 0;
let saving = false;

const maxCandidates = () => maxSlots(settings.size);
const candidates = () => menus.filter((m) => !m.hidden && candidateIds.has(m.id));
const maxPick = () => Math.max(1, Math.min(MAX_PICK, candidates().length - 1));

function candidatesValid() {
  const n = candidates().length;
  return n >= 2 && n <= maxCandidates();
}

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
// reshuffles; a rename, icon or size change keeps today's order when the candidates are the same.
function rebuildBoard({ reshuffle = false } = {}) {
  if (phase.name !== 'idle') return;
  const next = candidatesValid() ? candidates() : null;
  const same = next && next.length === slotMenus.length && slotMenus.every((s) => next.some((m) => m.id === s.id));
  if (!next) slotMenus = [{ name: '?' }, { name: '?' }];
  else if (same && !reshuffle) slotMenus = slotMenus.map((s) => next.find((m) => m.id === s.id));
  else slotMenus = shuffle(next);
  board = createBoard(equalWidths(slotMenus.length), settings.size);
  pickCount = Math.min(pickCount, maxPick());
}

function setPhase(next) {
  phase = next;
  document.body.dataset.phase = next.name;
  renderControls();
  renderResult();
}

function drop() {
  if (phase.name !== 'idle' || !candidatesValid()) return;
  audio.unlock();
  accumulator = 0;
  setPhase({ name: 'running', round: createRound(board, pickCount, Math.random, physicsFrom(settings)) });
}

function backToIdle() {
  phase = { name: 'idle', round: null };
  rebuildBoard({ reshuffle: true });
  setPhase(phase);
}

async function confirmResult() {
  if (phase.name !== 'result' || saving) return;
  const picked = phase.round.winners.map((slot) => slotMenus[slot]);
  saving = true;
  try {
    await lunch.recordPicks(picked.map((m) => m.id));
    toast(`${picked.map((m) => m.name).join(', ')} 기록 완료. 맛있게 드세요!`);
    backToIdle();
  } catch (err) {
    toast(err.message, true);
  } finally {
    saving = false;
  }
}

function retry() {
  if (phase.name !== 'result') return;
  backToIdle();
  drop();
}

function onEngineEvent(event) {
  const now = performance.now() / 1000;
  renderer.onEvent(event, now);
  if (event.type === 'hit') audio.hit(event.kind, event.speed, event.ball.cx, board.width);
  else if (event.type === 'settle') audio.settle(event.ball.cx, board.width);
  else if (event.type === 'redrop') audio.redrop();
  else if (event.type === 'done') {
    audio.win(event.winners.length);
    renderer.celebrate(board, event.winners);
    setPhase({ name: 'result', round: phase.round });
  }
}

// Slow motion is for the moment of truth: past the pegs, not yet in a slot. Once every moving
// ball is in a slot the outcome is decided, so time runs at full speed to the result.
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
  renderer.draw({
    board,
    balls: phase.round?.world.balls ?? [],
    slotMenus,
    winners: phase.name === 'result' ? phase.round.winners : null,
    view: { mode: phase.name, slowmo },
    now: nowMs / 1000,
    dt,
  });
}

function renderControls() {
  const n = candidates().length;
  $('#candidate-count').textContent = n;
  $('#pick-count').textContent = pickCount;
  const idle = phase.name === 'idle';
  $('#pick-minus').disabled = pickCount <= 1 || !idle;
  $('#pick-plus').disabled = pickCount >= maxPick() || !idle;
  const max = maxCandidates();
  const problem =
    n < 2
      ? '후보를 2개 이상 골라 주세요'
      : n > max
        ? `지금 구슬 크기로는 후보를 ${max}개까지 넣을 수 있어요`
        : '';
  $('#drop-hint').textContent = problem;
  $('#drop').disabled = Boolean(problem) || !idle;
  $('#drop').textContent = phase.name === 'running' ? '떨어지는 중…' : pickCount > 1 ? `구슬 ${pickCount}개 떨어뜨리기` : '구슬 떨어뜨리기';
}

function renderResult() {
  const overlay = $('#result');
  if (phase.name !== 'result') {
    overlay.hidden = true;
    return;
  }
  const picked = phase.round.winners.map((slot) => ({ menu: slotMenus[slot], color: SLOT_COLORS[slot % SLOT_COLORS.length] }));
  $('#result-title').textContent = picked.length > 1 ? `오늘은 ${picked.length}곳으로 나눠 가요` : '오늘의 점심은';
  $('#result-names').innerHTML = picked
    .map(({ menu, color }) => `<li style="--chip:${color}">${menuIcon(menu)} ${escapeHtml(menu.name)}</li>`)
    .join('');
  overlay.hidden = false;
  $('#confirm').focus();
}

// The shared store can be unreachable; keep the last list on screen and say why.
async function loadMenus() {
  try {
    menus = await lunch.listMenus();
  } catch (err) {
    toast(err.message, true);
  }
}

function renderMenus() {
  menuPanel.render(menus, candidateIds);
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
    if (checked) candidateIds.add(id);
    else candidateIds.delete(id);
    rebuildBoard();
    renderMenus();
  },
  async onRename(id, name) {
    await attempt(() => lunch.renameMenu(id, name));
    await refreshMenus();
  },
  async onHide(id) {
    candidateIds.delete(id);
    await attempt(() => lunch.setMenuHidden(id, true));
    await refreshMenus();
  },
  async onUnhide(id) {
    candidateIds.add(id);
    await attempt(() => lunch.setMenuHidden(id, false));
    await refreshMenus();
  },
  onIcon(menu) {
    iconPicker.open(menu);
  },
  async onAdd(name) {
    const added = await attempt(async () => candidateIds.add((await lunch.addMenu(name)).id));
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

function applySettings(next) {
  const sizeChanged = next.size !== settings.size;
  settings = next;
  saveSettings(settings);
  audio.setMuted(!settings.sound);
  if (sizeChanged) rebuildBoard();
  settingsDialog.render();
  renderControls();
}

const settingsDialog = createSettingsDialog({
  settings: () => settings,
  onChange: applySettings,
  sizeNote: (s) => `이 크기로는 후보를 최대 ${maxSlots(s.size)}개까지 넣을 수 있어요. 다음 판부터 적용돼요.`,
});

$('#pick-minus').addEventListener('click', () => {
  pickCount = Math.max(1, pickCount - 1);
  renderControls();
});
$('#pick-plus').addEventListener('click', () => {
  pickCount = Math.min(maxPick(), pickCount + 1);
  renderControls();
});
$('#drop').addEventListener('click', drop);
$('#confirm').addEventListener('click', confirmResult);
$('#retry').addEventListener('click', retry);

document.addEventListener('keydown', (e) => {
  if (settingsDialog.isOpen() || iconPicker.isOpen()) return;
  if (e.target instanceof Element && e.target.closest('input, textarea')) return;
  // Space only ever means "drop"; never let it press whichever button holds focus.
  if (e.code === 'Space') {
    e.preventDefault();
    drop();
  } else if (e.key === 'Enter' && phase.name === 'result' && e.target.tagName !== 'BUTTON') {
    confirmResult();
  } else if (e.code === 'KeyR' && phase.name === 'result') {
    retry();
  }
});

// ?debug exposes read-only state so a headless browser can check what is on screen.
if (new URLSearchParams(location.search).has('debug')) {
  window.__plinko = { phase: () => phase.name, balls: () => phase.round?.world.balls ?? [], visible: renderer.visible };
}

new ResizeObserver(() => renderer.resize()).observe(canvas);
window.addEventListener('resize', () => renderer.resize());

await loadMenus();
for (const m of menus) if (!m.hidden) candidateIds.add(m.id);
rebuildBoard();
renderMenus();
settingsDialog.render();
setPhase({ name: 'idle', round: null });
renderer.resize();
requestAnimationFrame(frame);
