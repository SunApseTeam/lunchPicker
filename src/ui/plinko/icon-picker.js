import { ICON_CHOICES, menuIcon } from '../../domain/icon.js';
import { $, escapeHtml } from '../shared/dom.js';

// Popup grid of emoji for one menu. onPick gets the emoji, or null for "guess from the name".
export function createIconPicker({ onPick }) {
  const dialog = $('#icon-picker');
  let menuId = null;

  function open(menu) {
    menuId = menu.id;
    const current = menuIcon(menu);
    $('#icon-picker-title').textContent = `${menu.name} 아이콘`;
    $('#icon-picker-grid').innerHTML = ICON_CHOICES.map(
      (icon) => `<button type="button" data-icon="${escapeHtml(icon)}" class="${icon === current ? 'on' : ''}" aria-label="${escapeHtml(icon)}">${icon}</button>`,
    ).join('');
    dialog.showModal();
  }

  function pick(icon) {
    dialog.close();
    onPick(menuId, icon);
  }

  $('#icon-picker-grid').addEventListener('click', (e) => {
    const button = e.target.closest('[data-icon]');
    if (button) pick(button.dataset.icon);
  });
  $('#icon-picker-auto').addEventListener('click', () => pick(null));
  $('#icon-picker-dismiss').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  return { open, isOpen: () => dialog.open };
}
