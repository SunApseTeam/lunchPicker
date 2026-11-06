import { weekdayOf } from '../../domain/date.js';
import { DEFAULT_ICON, menuIcon } from '../../domain/icon.js';
import { escapeHtml } from '../shared/dom.js';

// HTML for each stats card, built from computeStats() output. No DOM access here.
const STALE_SHOWN = 8;
export const EMPTY = '<p class="empty">아직 기록이 없어요. 플링코에서 "여기 간다!"를 누르면 쌓여요.</p>';

export function shortDate(date) {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d} (${weekdayOf(date)})`;
}

const MEDALS = [
  { label: '금메달', light: '#ffe58a', dark: '#c9971c', ribbon: '#ff5d8f' },
  { label: '은메달', light: '#f1f3f8', dark: '#8d96aa', ribbon: '#5ab8ff' },
  { label: '동메달', light: '#f2b77e', dark: '#a8642e', ribbon: '#4fd1c5' },
];

function medal(rank) {
  const m = MEDALS[rank - 1];
  return `<svg class="medal" viewBox="0 0 28 34" role="img" aria-label="${rank}위 ${m.label}">
    <defs><radialGradient id="medal-${rank}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${m.light}"/><stop offset="1" stop-color="${m.dark}"/></radialGradient></defs>
    <path d="M6 0h6l3.5 11h-6z" fill="${m.ribbon}"/><path d="M22 0h-6l-3.5 11h6z" fill="${m.ribbon}" opacity=".7"/>
    <circle cx="14" cy="21.5" r="11" fill="url(#medal-${rank})" stroke="${m.dark}" stroke-width="1.5"/>
    <circle cx="14" cy="21.5" r="7.5" fill="none" stroke="#fff" stroke-opacity=".55"/>
    <text x="14" y="25.5" text-anchor="middle" font-size="11" font-weight="700" fill="#14151f">${rank}</text>
  </svg>`;
}

// Ties share a place (two menus on 13 visits are both 2nd), so a tie for 1st gets two gold medals.
export function renderRanking(ranking) {
  if (ranking.length === 0) return EMPTY;
  const max = ranking[0].count;
  return `<ul class="hbars">${ranking
    .map((r) => {
      const place = 1 + ranking.filter((o) => o.count > r.count).length;
      return `<li class="${place <= 3 ? 'podium' : ''}" title="${escapeHtml(r.name)}: ${place}위, ${r.count}번, 마지막 ${shortDate(r.lastVisit)}">
        <span class="rank">${place <= 3 ? medal(place) : place}</span>
        <span class="name"><span class="emoji">${r.icon ?? DEFAULT_ICON}</span>${escapeHtml(r.name)}</span>
        <span class="track"><span class="bar" style="width:${(r.count / max) * 100}%"></span></span>
        <span class="val">${r.count}번</span>
      </li>`;
    })
    .join('')}</ul>`;
}

export function renderTags(tags, untaggedVisits) {
  if (tags.length === 0) return '<p class="empty">아직 태그가 달린 가게의 기록이 없어요. 플링코 화면에서 가게 옆 # 버튼으로 태그를 달 수 있어요.</p>';
  const max = tags[0].count;
  const rows = tags
    .map((t) => {
      const place = 1 + tags.filter((o) => o.count > t.count).length;
      return `<li title="#${escapeHtml(t.tag)}: ${t.count}번">
        <span class="rank">${place}</span>
        <span class="name">#${escapeHtml(t.tag)}</span>
        <span class="track"><span class="bar tag" style="width:${(t.count / max) * 100}%"></span></span>
        <span class="val">${t.count}번</span>
      </li>`;
    })
    .join('');
  const note = untaggedVisits > 0 ? `<p class="note">태그 없는 가게에 간 ${untaggedVisits}번은 빠져 있어요</p>` : '';
  return `<ul class="hbars">${rows}</ul>${note}`;
}

export function renderStale(stale) {
  return `<ul class="stale">${stale
    .slice(0, STALE_SHOWN)
    .map((s, i) => {
      const cls = s.daysSince === null ? 'never' : i < 3 ? 'top' : '';
      const ago = s.daysSince === null ? '아직 한 번도 안 감' : s.daysSince === 0 ? '오늘 감' : `${s.daysSince}일 전`;
      return `<li class="${cls}"><span class="name"><span class="emoji">${s.icon ?? DEFAULT_ICON}</span>${escapeHtml(s.name)}</span><span class="ago">${ago}</span></li>`;
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

// Whose picks took the team out most, with medals like the place ranking and the place their
// picks went to most. A member no longer on the team still shows, by the name '지난 팀원'.
export function renderWinners(winners, { members = new Map(), photoOf = () => null } = {}) {
  if (winners.length === 0) return '<p class="empty">아직 누가 뽑았는지 남은 기록이 없어요. 플링코에서 "여기 간다!"를 누르면 쌓여요.</p>';
  const max = winners[0].count;
  return `<ul class="hbars winners">${winners
    .map((w) => {
      const place = 1 + winners.filter((o) => o.count > w.count).length;
      const member = members.get(w.memberId);
      const name = member?.name ?? '지난 팀원';
      const photo = member && photoOf(member);
      const face = photo ? `<img src="${escapeHtml(photo)}" alt="" onerror="this.remove()">` : '';
      const top = w.top ? `<small class="top">${w.top.icon ?? DEFAULT_ICON} ${escapeHtml(w.top.name)}</small>` : '';
      return `<li class="${place <= 3 ? 'podium' : ''}" title="${escapeHtml(name)}: ${place}위, ${w.count}번 뽑힘, 마지막 ${shortDate(w.last)}">
        <span class="rank">${place <= 3 ? medal(place) : place}</span>
        <span class="name who" style="--who:${escapeHtml(member?.color ?? '#a7a49a')}">${face}<span>${escapeHtml(name)}${top}</span></span>
        <span class="track"><span class="bar win" style="width:${(w.count / max) * 100}%"></span></span>
        <span class="val">${w.count}번</span>
      </li>`;
    })
    .join('')}</ul>`;
}

// Who took the team there, when the record says: their face and name.
function taker(member, photo) {
  if (!member) return '';
  const face = photo ? `<img src="${escapeHtml(photo)}" alt="" onerror="this.remove()">` : '';
  return `<span class="who" style="--who:${escapeHtml(member.color)}">${face}${escapeHtml(member.name)}</span>`;
}

// editing: the visit whose place is being changed, shown as a list of places to pick from.
export function renderTimeline(days, { editing = null, menus = [], members = new Map(), photoOf = () => null } = {}) {
  if (days.length === 0) return EMPTY;
  return days
    .map(
      (day) => `<div class="day"><time datetime="${day.date}">${shortDate(day.date)}</time><ul>${day.visits
        .map((v) => {
          const member = members.get(v.memberId);
          if (v.id === editing) {
            return `<li class="visit editing">
              <select data-change="${v.id}" aria-label="간 곳 바꾸기">${renderMenuOptions(menus, v.menuId)}</select>
              <button data-stop-edit>그대로</button>
            </li>`;
          }
          return `<li class="visit${v.canceled ? ' canceled' : ''}">
            ${taker(member, member && photoOf(member))}
            <span class="name"><span class="emoji">${v.icon ?? DEFAULT_ICON}</span>${escapeHtml(v.name)}</span>
            ${v.source === 'manual' ? '<small>직접 추가</small>' : ''}
            ${v.canceled ? '<small>취소됨</small>' : ''}
            ${v.canceled ? '' : `<button data-edit="${v.id}" title="실제로 간 곳으로 바꾸기">바꾸기</button>`}
            <button data-id="${v.id}" data-cancel="${!v.canceled}">${v.canceled ? '되돌리기' : '취소'}</button>
          </li>`;
        })
        .join('')}</ul></div>`,
    )
    .join('');
}

// selected: the place already chosen, kept in the list even if it has since been hidden.
export function renderMenuOptions(menus, selected = '') {
  return (
    `<option value=""${selected ? '' : ' selected'}>가게 선택</option>` +
    menus
      .filter((m) => !m.hidden || m.id === selected)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .map((m) => `<option value="${m.id}"${m.id === selected ? ' selected' : ''}>${menuIcon(m)} ${escapeHtml(m.name)}</option>`)
      .join('')
  );
}
