import { $, escapeHtml } from '../shared/dom.js';

// The menu list in the sidebar: today's candidate checkboxes, inline rename, hide/unhide and
// the add form. It owns only the rename-in-progress state; everything else comes from main.
export function createMenuPanel({ onToggle, onRename, onHide, onUnhide, onAdd }) {
  let editingId = null;
  let last = { menus: [], candidateIds: new Set() };

  function render(menus = last.menus, candidateIds = last.candidateIds) {
    last = { menus, candidateIds };
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

  $('#add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await onAdd($('#add-input').value)) $('#add-input').value = '';
  });

  return { render };
}
