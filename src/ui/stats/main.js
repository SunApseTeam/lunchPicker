import { createLunchService } from '../../application/lunch.js';
import { todayString } from '../../domain/date.js';
import { createStore, storeMode } from '../../infrastructure/store.js';
import { teamPhotoUrls } from '../../infrastructure/team-photos.js';
import { $, markMode, toast } from '../shared/dom.js';
import {
  EMPTY,
  groupByDay,
  renderColumns,
  renderMenuOptions,
  renderRanking,
  renderStale,
  renderTags,
  renderTimeline,
  renderWinners,
  shortDate,
} from './views.js';

const PAGE_DAYS = 14;
// Shown inside the plinko page's records panel (?embed): no way back of its own, the panel has
// one, and Esc closes the panel.
const embedded = new URLSearchParams(location.search).has('embed');
if (embedded) {
  document.documentElement.classList.add('embed');
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.target.closest?.('input, select, textarea')) parent.postMessage({ type: 'lunch:close' }, location.origin);
  });
}

const mode = storeMode();
const lunch = createLunchService(createStore(mode), () => todayString());
markMode(mode);
let shownDays = PAGE_DAYS;
// The visit whose place is being changed, if any.
let editing = null;
// Who is on the team, to show who took everyone to each place. Not having it only hides that.
const members = new Map((await lunch.listMembers().catch(() => [])).map((m) => [m.id, m]));
const photoOf = (m) => teamPhotoUrls(m.id)[0];

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
  $('#winners').innerHTML = renderWinners(stats.winners, { members, photoOf });
  $('#stale').innerHTML = hasVisits ? renderStale(stats.stale) : EMPTY;
  $('#weekdays').innerHTML = hasVisits ? renderColumns(stats.weekdays, (r) => `${r.label}요일 ${r.count}번${topNote(r)}`) : EMPTY;
  $('#months').innerHTML = hasVisits ? renderColumns(stats.months, (r) => `${r.label} ${r.count}번${topNote(r)}`) : EMPTY;
  $('#tags').innerHTML = hasVisits ? renderTags(stats.tags, stats.untaggedVisits) : EMPTY;
  const days = groupByDay(stats.timeline);
  $('#timeline').innerHTML = renderTimeline(days.slice(0, shownDays), { editing, menus, members, photoOf });
  $('#timeline select[data-change]')?.focus();
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
  const target = e.target instanceof Element ? e.target : null;
  const edit = target?.closest('button[data-edit]');
  if (edit || target?.closest('button[data-stop-edit]')) {
    editing = edit ? edit.dataset.edit : null;
    render();
    return;
  }
  const button = target?.closest('button[data-id]');
  if (!button) return;
  const cancel = button.dataset.cancel === 'true';
  attempt(async () => {
    await lunch.setVisitCanceled(button.dataset.id, cancel);
    toast(cancel ? '기록을 취소했어요' : '기록을 되돌렸어요');
  });
});

// Picking another place moves the record there; who took the team there stays.
$('#timeline').addEventListener('change', (e) => {
  const select = e.target instanceof Element && e.target.closest('select[data-change]');
  if (!select?.value) return;
  const name = select.selectedOptions[0].textContent;
  editing = null;
  attempt(async () => {
    await lunch.changeVisitMenu(select.dataset.change, select.value);
    toast(`${name}(으)로 바꿨어요`);
  });
});
$('#timeline').addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !editing) return;
  editing = null;
  render();
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
// The panel asks for fresh numbers each time it is opened again.
window.addEventListener('message', (e) => {
  if (e.origin === location.origin && e.data?.type === 'lunch:refresh') render();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') render();
});

await render();
