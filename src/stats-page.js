import { computeStats, weekdayOf } from './stats.js';
import { createStore, todayString } from './store.js';

const PAGE_DAYS = 14;
const STALE_SHOWN = 8;
const EMPTY = '<p class="empty">아직 기록이 없어요. 플링코에서 "여기 간다!"를 누르면 쌓여요.</p>';

const store = createStore();
const $ = (sel) => document.querySelector(sel);
let shownDays = PAGE_DAYS;

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function shortDate(date) {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d} (${weekdayOf(date)})`;
}

function renderRanking(ranking) {
  if (ranking.length === 0) return EMPTY;
  const max = ranking[0].count;
  return `<ul class="hbars">${ranking
    .map(
      (r, i) => `<li title="${escapeHtml(r.name)}: ${r.count}번, 마지막 ${shortDate(r.lastVisit)}">
        <span class="rank">${i + 1}</span>
        <span class="name">${escapeHtml(r.name)}</span>
        <span class="track"><span class="bar" style="width:${(r.count / max) * 100}%"></span></span>
        <span class="val">${r.count}번</span>
      </li>`,
    )
    .join('')}</ul>`;
}

function renderStale(stale, hasVisits) {
  if (!hasVisits) return EMPTY;
  return `<ul class="stale">${stale
    .slice(0, STALE_SHOWN)
    .map((s, i) => {
      const cls = s.daysSince === null ? 'never' : i < 3 ? 'top' : '';
      const ago = s.daysSince === null ? '아직 한 번도 안 감' : s.daysSince === 0 ? '오늘 감' : `${s.daysSince}일 전`;
      return `<li class="${cls}"><span class="name">${escapeHtml(s.name)}</span><span class="ago">${ago}</span></li>`;
    })
    .join('')}</ul>`;
}

function renderColumns(rows, hasVisits, tooltip) {
  if (!hasVisits) return EMPTY;
  const max = Math.max(1, ...rows.map((r) => r.count));
  return `<div class="vbars">${rows
    .map(
      (r) => `<div class="col" title="${escapeHtml(tooltip(r))}">
        <span class="val">${r.count || ''}</span>
        <span class="track"><span class="bar" style="height:${(r.count / max) * 100}%"></span></span>
        <span class="label">${r.label}</span>
        <span class="top">${r.top ? escapeHtml(r.top) : '&nbsp;'}</span>
      </div>`,
    )
    .join('')}</div>`;
}

function renderTimeline(timeline) {
  if (timeline.length === 0) {
    $('#more').hidden = true;
    return EMPTY;
  }
  const days = [];
  for (const v of timeline) {
    if (days.at(-1)?.date !== v.visitedOn) days.push({ date: v.visitedOn, visits: [] });
    days.at(-1).visits.push(v);
  }
  $('#more').hidden = days.length <= shownDays;
  return days
    .slice(0, shownDays)
    .map(
      (day) => `<div class="day"><time datetime="${day.date}">${shortDate(day.date)}</time><ul>${day.visits
        .map(
          (v) => `<li class="visit${v.canceled ? ' canceled' : ''}">
            <span class="name">${escapeHtml(v.name)}</span>
            ${v.source === 'manual' ? '<small>직접 추가</small>' : ''}
            ${v.canceled ? '<small>취소됨</small>' : ''}
            <button data-id="${v.id}" data-cancel="${!v.canceled}">${v.canceled ? '되돌리기' : '취소'}</button>
          </li>`,
        )
        .join('')}</ul></div>`,
    )
    .join('');
}

function renderAddForm(menus) {
  const select = $('#add-menu');
  const keep = select.value;
  select.innerHTML =
    '<option value="">메뉴 선택</option>' +
    menus
      .filter((m) => !m.hidden)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`)
      .join('');
  select.value = keep;
  const date = $('#add-date');
  date.max = todayString();
  if (!date.value) date.value = todayString();
}

async function render() {
  let menus, visits;
  try {
    [menus, visits] = await Promise.all([store.listMenus(), store.listVisits()]);
  } catch (err) {
    toast(err.message, true);
    return;
  }
  const stats = computeStats(menus, visits, todayString());
  const hasVisits = stats.totalVisits > 0;
  $('#summary').innerHTML = hasVisits
    ? `<b>${stats.totalDays}</b>일 동안 <b>${stats.totalVisits}</b>번 기록했어요`
    : '아직 기록이 없어요';
  $('#ranking').innerHTML = renderRanking(stats.ranking);
  $('#stale').innerHTML = renderStale(stats.stale, hasVisits);
  $('#weekdays').innerHTML = renderColumns(stats.weekdays, hasVisits, (r) => `${r.label}요일 ${r.count}번${r.top ? `, 제일 많이 간 곳 ${r.top}` : ''}`);
  $('#months').innerHTML = renderColumns(stats.months, hasVisits, (r) => `${r.label} ${r.count}번${r.top ? `, 제일 많이 간 곳 ${r.top}` : ''}`);
  $('#timeline').innerHTML = renderTimeline(stats.timeline);
  renderAddForm(menus);
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

async function attempt(action) {
  try {
    await action();
  } catch (err) {
    toast(err.message, true);
  }
  await render();
}

$('#timeline').addEventListener('click', (e) => {
  const button = e.target instanceof Element && e.target.closest('button[data-id]');
  if (!button) return;
  const cancel = button.dataset.cancel === 'true';
  attempt(async () => {
    await store.setCanceled(button.dataset.id, cancel);
    toast(cancel ? '기록을 취소했어요' : '기록을 되돌렸어요');
  });
});

$('#add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const menuId = $('#add-menu').value;
  const date = $('#add-date').value;
  if (!menuId || !date) return;
  const name = $('#add-menu').selectedOptions[0].textContent;
  attempt(async () => {
    await store.addVisits([menuId], date, 'manual');
    $('#add-menu').value = '';
    toast(`${shortDate(date)} ${name} 추가했어요`);
  });
});

$('#more').addEventListener('click', () => {
  shownDays += PAGE_DAYS;
  render();
});

// Others record lunches too: refresh when this tab comes back into view, and pick up the plinko
// page's writes live when both run on this browser's own storage.
window.addEventListener('storage', render);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') render();
});

await render();
