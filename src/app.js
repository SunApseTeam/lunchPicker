import { DEFAULT_SETTINGS, DT, createBoard, equalWidths, maxSlots, physicsFrom } from './engine.js';
import { createRound, stepRound } from './round.js';
import { SLOT_COLORS, createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { createStore, loadSettings, saveSettings, todayString } from './store.js';

const MAX_PICK = 5;
const SLOWMO_SCALE = 0.4;

const store = createStore();
const audio = createAudio();
const canvas = document.querySelector('#board');
const renderer = createRenderer(canvas);
const $ = (sel) => document.querySelector(sel);

let settings = loadSettings(DEFAULT_SETTINGS);
audio.setMuted(!settings.sound);
let menus = [];
const candidateIds = new Set();
let pickCount = 1;
let editingId = null;
let slotMenus = [];
let board = createBoard(equalWidths(2), settings.size);

function maxCandidates() {
  return maxSlots(settings.size);
}

// idle: board ready. running: balls in flight. result: winners shown, waiting for 확정 or 다시.
let phase = { name: 'idle', round: null };
let timeScale = 1;
let accumulator = 0;
let saving = false;

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function candidates() {
  return menus.filter((m) => !m.hidden && candidateIds.has(m.id));
}

function maxPick() {
  return Math.max(1, Math.min(MAX_PICK, candidates().length - 1));
}

function candidatesValid() {
  const n = candidates().length;
  return n >= 2 && n <= maxCandidates();
}

// Slot indices in a finished round point into slotMenus, so only rebuild while idle.
// Slots are not equally likely (bumpers and walls shape where balls land), so fairness comes
// from the shuffle: every menu is equally likely to sit in every slot.
function rebuildBoard() {
  if (phase.name !== 'idle') return;
  slotMenus = candidatesValid() ? shuffle(candidates()) : [{ name: '?' }, { name: '?' }];
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
  rebuildBoard();
  setPhase(phase);
}

async function confirmResult() {
  if (phase.name !== 'result' || saving) return;
  const picked = phase.round.winners.map((slot) => slotMenus[slot]);
  saving = true;
  try {
    await store.addVisits(picked.map((m) => m.id), todayString(), 'spin');
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

function inFinale(round) {
  const moving = round.world.balls.filter((b) => !b.settled);
  return moving.length > 0 && moving.every((b) => b.cy > board.pegBottom + 30);
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

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function renderMenus() {
  const visible = menus.filter((m) => !m.hidden);
  const hidden = menus.filter((m) => m.hidden);
  $('#menu-list').innerHTML = visible
    .map((m) => {
      const checked = candidateIds.has(m.id) ? 'checked' : '';
      const name =
        editingId === m.id
          ? `<input class="rename" data-id="${m.id}" value="${escapeHtml(m.name)}" maxlength="20" aria-label="메뉴 이름 수정">`
          : `<button class="name" data-action="edit" data-id="${m.id}" title="눌러서 이름 수정">${escapeHtml(m.name)}</button>`;
      return `<li class="${checked ? '' : 'off'}">
        <label class="check"><input type="checkbox" data-action="toggle" data-id="${m.id}" ${checked} aria-label="${escapeHtml(m.name)} 오늘 후보"><span></span></label>
        ${name}
        <button class="ghost" data-action="hide" data-id="${m.id}" title="숨기기">숨김</button>
      </li>`;
    })
    .join('');
  $('#hidden-count').textContent = hidden.length;
  $('#hidden-wrap').hidden = hidden.length === 0;
  $('#hidden-list').innerHTML = hidden
    .map((m) => `<li><span class="name">${escapeHtml(m.name)}</span><button class="ghost" data-action="unhide" data-id="${m.id}">다시 보이기</button></li>`)
    .join('');
  const input = $('#menu-list .rename');
  if (input) {
    input.focus();
    input.select();
  }
  renderControls();
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

const SLIDERS = ['size', 'softness', 'bounce'];

function renderSettings() {
  for (const key of SLIDERS) {
    $(`#set-${key}`).value = settings[key];
    $(`#set-${key}-v`).textContent = settings[key];
  }
  $('#set-sound').checked = settings.sound;
  $('#size-note').textContent = `이 크기로는 후보를 최대 ${maxCandidates()}개까지 넣을 수 있어요. 다음 판부터 적용돼요.`;
}

// Size changes the board geometry; keep today's slot order instead of reshuffling on every
// slider tick, unless the current order no longer fits.
function applySettings(next) {
  const sizeChanged = next.size !== settings.size;
  settings = next;
  saveSettings(settings);
  audio.setMuted(!settings.sound);
  if (sizeChanged && phase.name === 'idle') {
    const fits = candidatesValid() && slotMenus.length === candidates().length && slotMenus.every((m) => candidateIds.has(m.id));
    if (fits) board = createBoard(equalWidths(slotMenus.length), settings.size);
    else rebuildBoard();
  }
  renderSettings();
  renderControls();
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
    .map(({ menu, color }) => `<li style="--chip:${color}">${escapeHtml(menu.name)}</li>`)
    .join('');
  overlay.hidden = false;
  $('#confirm').focus();
}

let toastTimer = null;
function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// The shared store can be unreachable; keep the last list on screen and say why.
async function loadMenus() {
  try {
    menus = await store.listMenus();
  } catch (err) {
    toast(err.message, true);
  }
}

async function refreshMenus() {
  await loadMenus();
  rebuildBoard();
  renderMenus();
}

async function attempt(action) {
  try {
    await action();
  } catch (err) {
    toast(err.message, true);
  }
}

async function commitRename(input) {
  const id = input.dataset.id;
  const value = input.value;
  editingId = null;
  await attempt(() => store.renameMenu(id, value));
  await refreshMenus();
}

$('#menu-list').addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const id = target.dataset.id;
  if (target.dataset.action === 'edit') {
    editingId = id;
    renderMenus();
  } else if (target.dataset.action === 'hide') {
    candidateIds.delete(id);
    attempt(() => store.setHidden(id, true)).then(refreshMenus);
  }
});

$('#menu-list').addEventListener('change', (e) => {
  if (e.target.dataset.action !== 'toggle') return;
  if (e.target.checked) candidateIds.add(e.target.dataset.id);
  else candidateIds.delete(e.target.dataset.id);
  rebuildBoard();
  renderMenus();
});

$('#menu-list').addEventListener('keydown', (e) => {
  if (!e.target.classList.contains('rename')) return;
  if (e.key === 'Enter') commitRename(e.target);
  if (e.key === 'Escape') {
    editingId = null;
    renderMenus();
  }
});

$('#menu-list').addEventListener('focusout', (e) => {
  if (e.target.classList.contains('rename') && editingId) commitRename(e.target);
});

$('#hidden-list').addEventListener('click', (e) => {
  const target = e.target.closest('[data-action="unhide"]');
  if (!target) return;
  candidateIds.add(target.dataset.id);
  attempt(() => store.setHidden(target.dataset.id, false)).then(refreshMenus);
});

$('#add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#add-input');
  await attempt(async () => {
    const menu = await store.addMenu(input.value);
    candidateIds.add(menu.id);
    input.value = '';
  });
  await refreshMenus();
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
const settingsDialog = $('#settings');
for (const key of SLIDERS) {
  $(`#set-${key}`).addEventListener('input', (e) => applySettings({ ...settings, [key]: Number(e.target.value) }));
}
$('#set-sound').addEventListener('change', (e) => applySettings({ ...settings, sound: e.target.checked }));
$('#settings-reset').addEventListener('click', () => applySettings({ ...DEFAULT_SETTINGS }));
$('#open-settings').addEventListener('click', () => {
  renderSettings();
  settingsDialog.showModal();
});
for (const id of ['#settings-close', '#settings-dismiss']) $(id).addEventListener('click', () => settingsDialog.close());
settingsDialog.addEventListener('click', (e) => {
  if (e.target === settingsDialog) settingsDialog.close();
});

document.addEventListener('keydown', (e) => {
  if (settingsDialog.open) return;
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
renderSettings();
setPhase({ name: 'idle', round: null });
renderer.resize();
requestAnimationFrame(frame);
