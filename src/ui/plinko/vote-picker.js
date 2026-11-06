import { menuIcon } from '../../domain/icon.js';
import { searchMenus } from '../../domain/search.js';
import { MAX_VOTES } from '../../domain/votes.js';
import { $, escapeHtml } from '../shared/dom.js';

// The little window that opens under a waiting member's face to pick their menu. The menus
// others already picked come first, one tap each; below them a search box (initials and
// nicknames work, as in the sidebar) and the menus it finds, Enter taking the first. A member who
// has voted can put more balls on their menu or take the vote back. On a phone it is a sheet
// rising from the bottom.
//
// open(member, at, state): at is the face's centre and radius in page pixels; state is
// { menus, vote, tally, faceUrl } with vote the member's own ({ menuId, count }) or null and
// tally the voted menus as from votes.tally().
export function createVotePicker({ onVote, onCount, onClear }) {
  const root = $('#vote-picker');
  const input = $('#vote-search');
  let member = null;
  let state = null;

  const face = (m) => {
    const url = state.faceUrl(m);
    return url ? `<img src="${escapeHtml(url)}" alt="" title="${escapeHtml(m.name)}">` : `<i style="--c:${m.color}" title="${escapeHtml(m.name)}">${escapeHtml(m.name.slice(0, 1))}</i>`;
  };

  function found() {
    const visible = state.menus.filter((m) => !m.hidden);
    return input.value.trim() ? searchMenus(visible, input.value) : visible;
  }

  function render() {
    const { vote, tally, menus } = state;
    $('#vote-who').textContent = `${member.name}의 메뉴`;
    const byId = new Map(menus.map((m) => [m.id, m]));
    const taken = tally.filter((t) => byId.has(t.menuId));
    $('#vote-taken').hidden = taken.length === 0;
    $('#vote-taken').innerHTML = taken
      .map((t) => {
        const m = byId.get(t.menuId);
        const mine = vote?.menuId === m.id ? ' aria-pressed="true"' : '';
        return `<button type="button" data-menu="${m.id}"${mine}><span class="ico">${menuIcon(m)}</span><span class="nm">${escapeHtml(m.name)}</span><span class="faces">${t.voters.map((v) => face(v.member)).join('')}</span></button>`;
      })
      .join('');
    const list = found();
    $('#vote-results').innerHTML = list.length
      ? list
          .map((m, i) => `<li><button type="button" data-menu="${m.id}"${vote?.menuId === m.id ? ' aria-pressed="true"' : ''}${i === 0 && input.value.trim() ? ' class="first"' : ''}><span class="ico">${menuIcon(m)}</span>${escapeHtml(m.name)}</button></li>`)
          .join('')
      : `<li class="none">'${escapeHtml(input.value.trim())}' 가게가 없어요</li>`;
    $('#vote-foot').hidden = !vote;
    if (vote) {
      $('#vote-count').textContent = `공 ${vote.count}개`;
      $('#vote-less').disabled = vote.count <= 1;
      $('#vote-more').disabled = vote.count >= MAX_VOTES;
    }
  }

  function place(at) {
    root.hidden = false;
    if (matchMedia('(max-width: 860px)').matches) {
      root.style.left = '';
      root.style.top = '';
      return;
    }
    const w = root.offsetWidth;
    const h = root.offsetHeight;
    const left = Math.min(Math.max(at.x - w / 2, 8), innerWidth - w - 8);
    const below = at.y + at.r + 12;
    const top = below + h > innerHeight - 8 ? Math.max(8, at.y - at.r - 12 - h) : below;
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
  }

  function open(m, at, next) {
    member = m;
    state = next;
    input.value = '';
    render();
    place(at);
    // On a touch screen the keyboard would cover half the window before anyone asked for it.
    if (!matchMedia('(pointer: coarse)').matches) input.focus();
  }

  // Called by main after every change, so the window shows the vote as it now stands.
  function update(next) {
    if (!member) return;
    state = next;
    render();
  }

  function close() {
    if (!member) return;
    member = null;
    // Focus left in the hidden window would swallow the next key (a number to pick the next member).
    if (root.contains(document.activeElement)) document.activeElement.blur();
    root.hidden = true;
  }

  function pick(menuId) {
    const m = member;
    close();
    onVote(m, menuId);
  }

  root.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target.closest('button') : null;
    if (!target || !member) return;
    if (target.dataset.menu) pick(target.dataset.menu);
    else if (target.id === 'vote-less') onCount(member, -1);
    else if (target.id === 'vote-more') onCount(member, 1);
    else if (target.id === 'vote-clear') {
      const m = member;
      close();
      onClear(m);
    } else if (target.id === 'vote-close') close();
  });
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      const [first] = found();
      if (first) pick(first.id);
    }
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  });
  // A press anywhere else closes it, except the press that opened it (on the canvas, handled
  // there).
  document.addEventListener('pointerdown', (e) => {
    if (member && !root.contains(e.target) && e.target.id !== 'board') close();
  });

  return { open, update, close, isOpen: () => member !== null, member: () => member };
}
