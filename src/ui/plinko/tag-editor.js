import { searchMenus } from '../../domain/search.js';
import { checkTags, tagsInUse } from '../../domain/tag.js';
import { $, escapeHtml, toast } from '../shared/dom.js';

const SUGGESTIONS = 12;

// Popup for one place's tags. Every add or remove is saved at once through onChange(id, tags),
// which resolves to false when the save failed. Tags other places use are offered as one-click
// chips, narrowed by what is typed.
export function createTagEditor({ onChange }) {
  const dialog = $('#tag-editor');
  let menu = null;
  let tags = [];
  let known = [];

  function render() {
    $('#tag-current').innerHTML = tags
      .map((t) => `<li>#${escapeHtml(t)}<button type="button" data-remove="${escapeHtml(t)}" aria-label="${escapeHtml(t)} 태그 빼기" title="빼기">×</button></li>`)
      .join('');
    const typed = $('#tag-input').value.replace(/^[#\s]+/, '');
    const unused = known.filter((t) => !tags.some((own) => own.toLowerCase() === t.toLowerCase()));
    const offered = searchMenus(unused.map((t) => ({ name: t })), typed).slice(0, SUGGESTIONS);
    $('#tag-suggest').innerHTML = offered.map(({ name }) => `<button type="button" data-add="${escapeHtml(name)}">#${escapeHtml(name)}</button>`).join('');
    $('#tag-suggest-label').hidden = offered.length === 0;
  }

  async function save(next) {
    let clean;
    try {
      clean = checkTags(next);
    } catch (err) {
      toast(err.message, true);
      return false;
    }
    const before = tags;
    tags = clean;
    render();
    if (await onChange(menu.id, clean)) return true;
    tags = before;
    render();
    return false;
  }

  // "한식, 국밥" or "#한식 #국밥" adds both.
  async function addTyped() {
    const parts = $('#tag-input').value.split(/[,#]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return;
    if (await save([...tags, ...parts])) $('#tag-input').value = '';
    render();
  }

  function open(target, menus) {
    menu = target;
    tags = [...target.tags];
    known = tagsInUse(menus);
    $('#tag-editor-title').textContent = `${target.name} 태그`;
    $('#tag-input').value = '';
    render();
    dialog.showModal();
    $('#tag-input').focus();
  }

  $('#tag-form').addEventListener('submit', (e) => {
    e.preventDefault();
    addTyped();
  });
  $('#tag-input').addEventListener('input', render);
  $('#tag-current').addEventListener('click', (e) => {
    const button = e.target.closest('[data-remove]');
    if (button) save(tags.filter((t) => t !== button.dataset.remove));
  });
  $('#tag-suggest').addEventListener('click', async (e) => {
    const button = e.target.closest('[data-add]');
    if (button && (await save([...tags, button.dataset.add]))) $('#tag-input').value = '';
    render();
  });
  for (const id of ['#tag-editor-close', '#tag-editor-dismiss']) $(id).addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  return { open, isOpen: () => dialog.open };
}
