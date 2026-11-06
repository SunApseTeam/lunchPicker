import { menuIcon } from '../../domain/icon.js';
import { searchMenus } from '../../domain/search.js';
import { $, escapeHtml } from '../shared/dom.js';

// A checked place can take more than one slot when more people want it: + adds one, − takes
// one back. Full means the board has no room for another slot.
function slotStepper(m, slots, full) {
  const name = escapeHtml(m.name);
  return `<span class="slots">
    <button data-action="fewer" data-id="${m.id}" ${slots > 1 ? '' : 'disabled'} title="칸 하나 빼기" aria-label="${name} 칸 하나 빼기">−</button>
    <b>칸 ${slots}</b>
    <button data-action="more" data-id="${m.id}" ${full ? 'disabled' : ''} title="원하는 사람이 더 있으면 칸 하나 더" aria-label="${name} 칸 하나 더">+</button>
  </span>`;
}

// The place list in the sidebar: today's candidate checkboxes with how many slots each takes,
// inline rename, tags, hide/unhide and the add form, filtered by the search box. It owns only
// the rename and search state; everything else comes from main.
export function createMenuPanel({ onToggle, onSlots, onRename, onHide, onUnhide, onAdd, onIcon, onTags }) {
  let editingId = null;
  let query = '';
  let last = { menus: [], picks: new Map(), full: false };

  function render(menus = last.menus, picks = last.picks, full = last.full) {
    last = { menus, picks, full };
    const visible = searchMenus(menus.filter((m) => !m.hidden), query);
    const hidden = searchMenus(menus.filter((m) => m.hidden), query);
    $('#menu-list').innerHTML = visible
      .map((m) => {
        const checked = picks.has(m.id) ? 'checked' : '';
        const name =
          editingId === m.id
            ? `<input class="rename" data-id="${m.id}" value="${escapeHtml(m.name)}" maxlength="20" aria-label="가게 이름 수정">`
            : `<button class="name" data-action="edit" data-id="${m.id}" aria-describedby="name-tip">${escapeHtml(m.name)}</button>`;
        const tags = m.tags.length
          ? `<button class="row-tags" data-action="tags" data-id="${m.id}" title="태그 편집">${m.tags.map((t) => `<span>#${escapeHtml(t)}</span>`).join('')}</button>`
          : '';
        return `<li class="${checked ? '' : 'off'}">
        <label class="check"><input type="checkbox" data-action="toggle" data-id="${m.id}" ${checked} aria-label="${escapeHtml(m.name)} 오늘 후보"><span></span></label>
        <button class="icon-btn" data-action="icon" data-id="${m.id}" title="아이콘 바꾸기" aria-label="${escapeHtml(m.name)} 아이콘 바꾸기">${menuIcon(m)}</button>
        <div class="info">${name}<div class="meta">${tags}${checked ? slotStepper(m, picks.get(m.id), full) : ''}</div></div>
        <button class="tag-btn" data-action="tags" data-id="${m.id}" title="태그 달기" aria-label="${escapeHtml(m.name)} 태그 편집">#</button>
        <button class="ghost" data-action="hide" data-id="${m.id}" title="숨기기">숨김</button>
      </li>`;
      })
      .join('');
    $('#hidden-count').textContent = hidden.length;
    $('#hidden-wrap').hidden = hidden.length === 0;
    if (query && hidden.length > 0) $('#hidden-wrap').open = true;
    const nothing = Boolean(query) && visible.length === 0 && hidden.length === 0;
    $('#search-empty').hidden = !nothing;
    if (nothing) $('#search-empty span').textContent = `'${query.trim()}' 가게가 없어요`;
    $('#hidden-list').innerHTML = hidden
      .map((m) => `<li><span class="icon-btn" aria-hidden="true">${menuIcon(m)}</span><span class="name">${escapeHtml(m.name)}</span><button class="ghost" data-action="unhide" data-id="${m.id}">다시 보이기</button></li>`)
      .join('');
    const input = $('#menu-list .rename');
    if (input) {
      input.focus();
      input.select();
    }
  }

  // One fixed-position tip shared by every name: the list scrolls, so a per-row tip would be clipped.
  const tip = document.createElement('div');
  tip.id = 'name-tip';
  tip.role = 'tooltip';
  tip.hidden = true;
  tip.textContent = '이름 바꾸려면 더블클릭';
  document.body.append(tip);

  function showTip(btn) {
    tip.hidden = false;
    const r = btn.getBoundingClientRect();
    const half = tip.offsetWidth / 2;
    const x = Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8);
    const below = r.top < tip.offsetHeight + 12;
    tip.style.left = `${x}px`;
    tip.style.top = `${below ? r.bottom + 6 : r.top - tip.offsetHeight - 6}px`;
  }

  function startRename(id) {
    tip.hidden = true;
    editingId = id;
    render();
  }

  function commitRename(input) {
    editingId = null;
    onRename(input.dataset.id, input.value);
  }

  $('#menu-list').addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    if (target.dataset.action === 'hide') {
      onHide(target.dataset.id);
    } else if (target.dataset.action === 'icon') {
      onIcon(last.menus.find((m) => m.id === target.dataset.id));
    } else if (target.dataset.action === 'tags') {
      onTags(last.menus.find((m) => m.id === target.dataset.id));
    } else if (target.dataset.action === 'more') {
      onSlots(target.dataset.id, 1);
    } else if (target.dataset.action === 'fewer') {
      onSlots(target.dataset.id, -1);
    }
  });

  $('#menu-list').addEventListener('dblclick', (e) => {
    const target = e.target.closest('[data-action="edit"]');
    if (target) startRename(target.dataset.id);
  });

  const nameOf = (e) => e.target.closest?.('button.name');
  $('#menu-list').addEventListener('pointerover', (e) => {
    const btn = nameOf(e);
    if (btn) showTip(btn);
  });
  $('#menu-list').addEventListener('pointerout', (e) => {
    if (nameOf(e)) tip.hidden = true;
  });
  $('#menu-list').addEventListener('focusin', (e) => {
    const btn = nameOf(e);
    if (btn && btn.matches(':focus-visible')) showTip(btn);
  });
  $('#menu-list').addEventListener('scroll', () => { tip.hidden = true; }, true);

  $('#menu-list').addEventListener('change', (e) => {
    if (e.target.dataset.action === 'toggle') onToggle(e.target.dataset.id, e.target.checked);
  });

  $('#menu-list').addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === 'F2') && e.target.matches('[data-action="edit"]')) {
      e.preventDefault();
      startRename(e.target.dataset.id);
      return;
    }
    if (!e.target.classList.contains('rename')) return;
    if (e.key === 'Enter') commitRename(e.target);
    if (e.key === 'Escape') {
      editingId = null;
      render();
    }
  });

  $('#menu-list').addEventListener('focusout', (e) => {
    if (nameOf(e)) tip.hidden = true;
    if (e.target.classList.contains('rename') && editingId) commitRename(e.target);
  });

  $('#hidden-list').addEventListener('click', (e) => {
    const target = e.target.closest('[data-action="unhide"]');
    if (target) onUnhide(target.dataset.id);
  });

  async function addFromSearch() {
    if (await onAdd(query)) {
      query = '';
      $('#menu-search').value = '';
      render();
    }
  }

  $('#menu-search').addEventListener('input', (e) => {
    query = e.target.value;
    render();
  });
  $('#menu-search').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      query = '';
      e.target.value = '';
      render();
    } else if (e.key === 'Enter' && !$('#search-empty').hidden) {
      addFromSearch();
    }
  });
  $('#search-add').addEventListener('click', addFromSearch);

  $('#add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await onAdd($('#add-input').value)) $('#add-input').value = '';
  });

  return { render };
}
