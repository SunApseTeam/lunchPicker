import { menuIcon } from '../../domain/icon.js';
import { searchMenus } from '../../domain/search.js';
import { $, escapeHtml } from '../shared/dom.js';

// The menu list in the sidebar: today's candidate checkboxes, inline rename, hide/unhide and
// the add form, filtered by the search box. It owns only the rename and search state; everything
// else comes from main.
export function createMenuPanel({ onToggle, onRename, onHide, onUnhide, onAdd, onIcon }) {
  let editingId = null;
  let query = '';
  let last = { menus: [], candidateIds: new Set() };

  function render(menus = last.menus, candidateIds = last.candidateIds) {
    last = { menus, candidateIds };
    const visible = searchMenus(menus.filter((m) => !m.hidden), query);
    const hidden = searchMenus(menus.filter((m) => m.hidden), query);
    $('#menu-list').innerHTML = visible
      .map((m) => {
        const checked = candidateIds.has(m.id) ? 'checked' : '';
        const name =
          editingId === m.id
            ? `<input class="rename" data-id="${m.id}" value="${escapeHtml(m.name)}" maxlength="20" aria-label="메뉴 이름 수정">`
            : `<button class="name" data-action="edit" data-id="${m.id}" title="눌러서 이름 수정">${escapeHtml(m.name)}</button>`;
        return `<li class="${checked ? '' : 'off'}">
        <label class="check"><input type="checkbox" data-action="toggle" data-id="${m.id}" ${checked} aria-label="${escapeHtml(m.name)} 오늘 후보"><span></span></label>
        <button class="icon-btn" data-action="icon" data-id="${m.id}" title="아이콘 바꾸기" aria-label="${escapeHtml(m.name)} 아이콘 바꾸기">${menuIcon(m)}</button>
        ${name}
        <button class="ghost" data-action="hide" data-id="${m.id}" title="숨기기">숨김</button>
      </li>`;
      })
      .join('');
    $('#hidden-count').textContent = hidden.length;
    $('#hidden-wrap').hidden = hidden.length === 0;
    if (query && hidden.length > 0) $('#hidden-wrap').open = true;
    const nothing = Boolean(query) && visible.length === 0 && hidden.length === 0;
    $('#search-empty').hidden = !nothing;
    if (nothing) $('#search-empty span').textContent = `'${query.trim()}' 메뉴가 없어요`;
    $('#hidden-list').innerHTML = hidden
      .map((m) => `<li><span class="icon-btn" aria-hidden="true">${menuIcon(m)}</span><span class="name">${escapeHtml(m.name)}</span><button class="ghost" data-action="unhide" data-id="${m.id}">다시 보이기</button></li>`)
      .join('');
    const input = $('#menu-list .rename');
    if (input) {
      input.focus();
      input.select();
    }
  }

  function commitRename(input) {
    editingId = null;
    onRename(input.dataset.id, input.value);
  }

  $('#menu-list').addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    if (target.dataset.action === 'edit') {
      editingId = target.dataset.id;
      render();
    } else if (target.dataset.action === 'hide') {
      onHide(target.dataset.id);
    } else if (target.dataset.action === 'icon') {
      onIcon(last.menus.find((m) => m.id === target.dataset.id));
    }
  });

  $('#menu-list').addEventListener('change', (e) => {
    if (e.target.dataset.action === 'toggle') onToggle(e.target.dataset.id, e.target.checked);
  });

  $('#menu-list').addEventListener('keydown', (e) => {
    if (!e.target.classList.contains('rename')) return;
    if (e.key === 'Enter') commitRename(e.target);
    if (e.key === 'Escape') {
      editingId = null;
      render();
    }
  });

  $('#menu-list').addEventListener('focusout', (e) => {
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
