import { menuIcon } from '../../domain/icon.js';
import { searchMenus } from '../../domain/search.js';
import { MAX_VOTES } from '../../domain/votes.js';
import { $, escapeHtml } from '../shared/dom.js';

// The little window that opens under a waiting member's face to pick their menu. The menus
// others already picked come first, one tap each; below them a search box (initials and
// nicknames work, as in the sidebar) and the menus it finds. A name no place has yet can be added
// right there and picked in one go, and a hidden place's name brings it back. ↑/↓ move through
// the choices and Enter takes the one lit up, the first found by default. A member who has voted
// can take the vote back (the red button at the top) or put more balls on their menu. On a phone
// it is a sheet rising from the bottom.
//
// open(member, at, state): at is the face's centre and radius in page pixels; state is
// { menus, vote, tally, faceUrl } with vote the member's own ({ menuId, count }) or null and
// tally the voted menus as from votes.tally().
export function createVotePicker({ onVote, onAdd, onRevive, onCount, onClear }) {
  const root = $('#vote-picker');
  const input = $('#vote-search');
  let member = null;
  let state = null;
  // Which choice Enter takes, as an index into choices(); -1 for none.
  let active = -1;

  const face = (m) => {
    const url = state.faceUrl(m);
    return url ? `<img src="${escapeHtml(url)}" alt="" title="${escapeHtml(m.name)}">` : `<i style="--c:${m.color}" title="${escapeHtml(m.name)}">${escapeHtml(m.name.slice(0, 1))}</i>`;
  };

  const query = () => input.value.trim().replace(/\s+/g, ' ');

  function found() {
    const visible = state.menus.filter((m) => !m.hidden);
    return query() ? searchMenus(visible, query()) : visible;
  }

  // What the typed name would do if no place shown has it: add a new place, or bring back the
  // hidden one with that name. null when a place on the list already has it, or nothing is typed.
  function newName() {
    const name = query();
    if (!name) return null;
    const same = state.menus.find((m) => m.name.toLowerCase() === name.toLowerCase());
    if (!same) return { add: name };
    return same.hidden ? { revive: same } : null;
  }

  function render() {
    const { vote, tally, menus } = state;
    $('#vote-who').textContent = `${member.name}의 메뉴`;
    $('#vote-clear').hidden = !vote;
    const byId = new Map(menus.map((m) => [m.id, m]));
    const taken = tally.filter((t) => byId.has(t.menuId));
    $('#vote-taken').hidden = taken.length === 0;
    $('#vote-taken').innerHTML = taken
      .map((t) => {
        const m = byId.get(t.menuId);
        const mine = vote?.menuId === m.id ? ' aria-pressed="true"' : '';
        return `<button type="button" data-choice data-menu="${m.id}"${mine}><span class="ico">${menuIcon(m)}</span><span class="nm">${escapeHtml(m.name)}</span><span class="faces">${t.voters.map((v) => face(v.member)).join('')}</span></button>`;
      })
      .join('');
    const list = found();
    const extra = newName();
    const rows = list.map((m) => `<li><button type="button" data-choice data-menu="${m.id}"${vote?.menuId === m.id ? ' aria-pressed="true"' : ''}><span class="ico">${menuIcon(m)}</span>${escapeHtml(m.name)}</button></li>`);
    if (extra?.add) rows.push(`<li><button type="button" data-choice data-add class="new">＋ '${escapeHtml(extra.add)}' 새 가게로 추가하고 고르기</button></li>`);
    if (extra?.revive) rows.push(`<li><button type="button" data-choice data-revive="${extra.revive.id}" class="new">↺ 숨긴 '${escapeHtml(extra.revive.name)}' 다시 꺼내서 고르기</button></li>`);
    $('#vote-results').innerHTML = rows.join('');
    $('#vote-foot').hidden = !vote;
    if (vote) {
      $('#vote-count').textContent = `공 ${vote.count}개`;
      $('#vote-less').disabled = vote.count <= 1;
      $('#vote-more').disabled = vote.count >= MAX_VOTES;
    }
    light();
  }

  const choices = () => [...root.querySelectorAll('[data-choice]')];

  // Lights up the active choice and keeps it in view.
  function light() {
    choices().forEach((el, i) => el.classList.toggle('active', i === active));
    choices()[active]?.scrollIntoView({ block: 'nearest' });
  }

  // While a name is typed, Enter takes the first thing it finds (or adds it); with nothing typed,
  // nothing until an arrow key picks something.
  function resetActive() {
    active = query() ? root.querySelectorAll('#vote-taken [data-choice]').length : -1;
    if (active >= choices().length) active = -1;
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
    active = -1;
    enterAfterComposing = false;
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

  // Takes a choice: a place, the new name, or the hidden place to bring back.
  function choose(el) {
    const m = member;
    close();
    if (el.dataset.menu) onVote(m, el.dataset.menu);
    else if (el.dataset.revive) onRevive(m, el.dataset.revive);
    else if ('add' in el.dataset) onAdd(m, query());
  }

  root.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target.closest('button') : null;
    if (!target || !member) return;
    if ('choice' in target.dataset) choose(target);
    else if (target.id === 'vote-less') onCount(member, -1);
    else if (target.id === 'vote-more') onCount(member, 1);
    else if (target.id === 'vote-clear') {
      const m = member;
      close();
      onClear(m);
    } else if (target.id === 'vote-close') close();
  });
  input.addEventListener('input', () => {
    render();
    resetActive();
    light();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.isComposing) {
      e.preventDefault();
      const n = choices().length;
      if (n === 0) return;
      active = e.key === 'ArrowDown' ? (active + 1) % n : (active <= 0 ? n : active) - 1;
      light();
    } else if (e.key === 'Enter' && e.target === input) {
      e.preventDefault();
      // Enter on a Korean syllable still being typed first finishes it: take the choice once the
      // finished name has been searched.
      if (e.isComposing) enterAfterComposing = true;
      else takeActive();
    }
  });
  let enterAfterComposing = false;
  function takeActive() {
    const el = choices()[active];
    if (el) choose(el);
  }
  input.addEventListener('compositionend', () => {
    if (!enterAfterComposing) return;
    enterAfterComposing = false;
    setTimeout(takeActive);
  });
  // A press anywhere else closes it, except the press that opened it (on the canvas, handled
  // there).
  document.addEventListener('pointerdown', (e) => {
    if (member && !root.contains(e.target) && e.target.id !== 'board') close();
  });

  return { open, update, close, isOpen: () => member !== null, member: () => member };
}
