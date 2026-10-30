import { weekdayOf } from '../../domain/date.js';
import { escapeHtml } from '../shared/dom.js';

// HTML for each stats card, built from computeStats() output. No DOM access here.
const STALE_SHOWN = 8;
export const EMPTY = '<p class="empty">아직 기록이 없어요. 플링코에서 "여기 간다!"를 누르면 쌓여요.</p>';

export function shortDate(date) {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d} (${weekdayOf(date)})`;
}

export function renderRanking(ranking) {
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

export function renderStale(stale) {
  return `<ul class="stale">${stale
    .slice(0, STALE_SHOWN)
    .map((s, i) => {
      const cls = s.daysSince === null ? 'never' : i < 3 ? 'top' : '';
      const ago = s.daysSince === null ? '아직 한 번도 안 감' : s.daysSince === 0 ? '오늘 감' : `${s.daysSince}일 전`;
      return `<li class="${cls}"><span class="name">${escapeHtml(s.name)}</span><span class="ago">${ago}</span></li>`;
    })
    .join('')}</ul>`;
}

export function renderColumns(rows, tooltip) {
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

export function groupByDay(timeline) {
  const days = [];
  for (const v of timeline) {
    if (days.at(-1)?.date !== v.visitedOn) days.push({ date: v.visitedOn, visits: [] });
    days.at(-1).visits.push(v);
  }
  return days;
}

export function renderTimeline(days) {
  if (days.length === 0) return EMPTY;
  return days
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

export function renderMenuOptions(menus) {
  return (
    '<option value="">메뉴 선택</option>' +
    menus
      .filter((m) => !m.hidden)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`)
      .join('')
  );
}
