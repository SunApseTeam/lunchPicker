import { createLunchService } from '../../application/lunch.js';
import { todayString } from '../../domain/date.js';
import { createStore, storeMode } from '../../infrastructure/store.js';
import { $, markMode, toast } from '../shared/dom.js';
import {
  EMPTY,
  groupByDay,
  renderColumns,
  renderMenuOptions,
  renderRanking,
  renderStale,
  renderTimeline,
  shortDate,
} from './views.js';

const PAGE_DAYS = 14;

const mode = storeMode();
const lunch = createLunchService(createStore(mode), () => todayString());
markMode(mode);
let shownDays = PAGE_DAYS;

const topNote = (r) => (r.top ? `, 제일 많이 간 곳 ${r.top}` : '');

async function render() {
  let menus, stats;
  try {
    ({ menus, stats } = await lunch.loadStats());
  } catch (err) {
    toast(err.message, true);
    return;
  }
  const hasVisits = stats.totalVisits > 0;
  $('#summary').innerHTML = hasVisits
    ? `<b>${stats.totalDays}</b>일 동안 <b>${stats.totalVisits}</b>번 기록했어요`
    : '아직 기록이 없어요';
  $('#ranking').innerHTML = renderRanking(stats.ranking);
  $('#stale').innerHTML = hasVisits ? renderStale(stats.stale) : EMPTY;
  $('#weekdays').innerHTML = hasVisits ? renderColumns(stats.weekdays, (r) => `${r.label}요일 ${r.count}번${topNote(r)}`) : EMPTY;
  $('#months').innerHTML = hasVisits ? renderColumns(stats.months, (r) => `${r.label} ${r.count}번${topNote(r)}`) : EMPTY;
  const days = groupByDay(stats.timeline);
  $('#timeline').innerHTML = renderTimeline(days.slice(0, shownDays));
  $('#more').hidden = days.length <= shownDays;

  const select = $('#add-menu');
  const keep = select.value;
  select.innerHTML = renderMenuOptions(menus);
  select.value = keep;
  const date = $('#add-date');
  date.max = todayString();
  if (!date.value) date.value = todayString();
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
    await lunch.setVisitCanceled(button.dataset.id, cancel);
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
    await lunch.addManualVisit(menuId, date);
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
