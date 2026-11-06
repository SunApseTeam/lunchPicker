import { menuIcon } from '../../domain/icon.js';
import { searchMenus } from '../../domain/search.js';
import { $, escapeHtml } from '../shared/dom.js';

// Little faces for the members who voted: their photo, or their initial in their colour.
export function faceChips(voters, faceUrl) {
  return voters
    .map(({ member, count }) => {
      const url = faceUrl(member);
      const face = url ? `<img src="${escapeHtml(url)}" alt="">` : `<i style="--c:${member.color}">${escapeHtml(member.name.slice(0, 1))}</i>`;
      return `<span class="face" title="${escapeHtml(member.name)}${count > 1 ? ` 공 ${count}개` : ''}">${face}${count > 1 ? `<b>${count}</b>` : ''}</span>`;
    })
    .join('');
}

// The sidebar: today's votes at the top, then the place list with inline rename, tags,
// hide/unhide and the add form, filtered by the search box. A place someone voted for shows
// their faces. It owns only the rename and search state; everything else comes from main.
// tally: the voted menus as from votes.tally().
export function createMenuPanel({ onRename, onHide, onUnhide, onAdd, onIcon, onTags }) {
  let editingId = null;
  let query = '';
  let last = { menus: [], tally: [], faceUrl: () => null };

  function renderVotes() {
    const { menus, tally, faceUrl } = last;
    const byId = new Map(menus.map((m) => [m.id, m]));
    const rows = tally.filter((t) => byId.has(t.menuId));
    $('#vote-summary').innerHTML = rows.length
      ? rows.map((t) => `<li data-id="${t.menuId}"><span class="ico">${menuIcon(byId.get(t.menuId))}</span><span class="nm">${escapeHtml(byId.get(t.menuId).name)}</span><span class="faces">${faceChips(t.voters, faceUrl)}</span><b>공 ${t.balls}</b></li>`).join('')
      : '<li class="empty">보드 위 팀원 얼굴을 누르거나 1~9 키를 눌러 메뉴를 골라 주세요. 얼굴을 아래 가게로 끌어다 놓아도 돼요.</li>';
  }

  function render(menus = last.menus, tally = last.tally, faceUrl = last.faceUrl) {
    last = { menus, tally, faceUrl };
    renderVotes();
    const voted = new Map(tally.map((t) => [t.menuId, t]));
    const visible = searchMenus(menus.filter((m) => !m.hidden), query);
    const hidden = searchMenus(menus.filter((m) => m.hidden), query);
    $('#menu-list').innerHTML = visible
      .map((m) => {
        const votes = voted.get(m.id);
        const name =
          editingId === m.id
            ? `<input class="rename" data-id="${m.id}" value="${escapeHtml(m.name)}" maxlength="20" aria-label="가게 이름 수정">`
            : `<button class="name" data-action="edit" data-id="${m.id}" aria-describedby="name-tip">${escapeHtml(m.name)}</button>`;
        const tags = m.tags.length
          ? `<button class="row-tags" data-action="tags" data-id="${m.id}" title="태그 편집">${m.tags.map((t) => `<span>#${escapeHtml(t)}</span>`).join('')}</button>`
          : '';
        return `<li data-id="${m.id}"${votes ? ' class="voted"' : ''}>
        <button class="icon-btn" data-action="icon" data-id="${m.id}" title="아이콘 바꾸기" aria-label="${escapeHtml(m.name)} 아이콘 바꾸기">${menuIcon(m)}</button>
        <div class="info">${name}<div class="meta">${tags}${votes ? `<span class="faces">${faceChips(votes.voters, faceUrl)}</span>` : ''}</div></div>
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
