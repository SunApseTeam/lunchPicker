import { DEFAULT_SETTINGS } from '../../domain/settings.js';
import { $ } from '../shared/dom.js';

const SLIDERS = ['size', 'softness', 'bounce'];

// The gear-icon popup. It reports every change through onChange and redraws from settings().
export function createSettingsDialog({ settings, onChange, sizeNote }) {
  const dialog = $('#settings');

  function render() {
    const current = settings();
    for (const key of SLIDERS) {
      $(`#set-${key}`).value = current[key];
      $(`#set-${key}-v`).textContent = current[key];
    }
    $('#set-sound').checked = current.sound;
    $('#size-note').textContent = sizeNote(current);
  }

  for (const key of SLIDERS) {
    $(`#set-${key}`).addEventListener('input', (e) => onChange({ ...settings(), [key]: Number(e.target.value) }));
  }
  $('#set-sound').addEventListener('change', (e) => onChange({ ...settings(), sound: e.target.checked }));
  $('#settings-reset').addEventListener('click', () => onChange({ ...DEFAULT_SETTINGS }));
  $('#open-settings').addEventListener('click', () => {
    render();
    dialog.showModal();
  });
  for (const id of ['#settings-close', '#settings-dismiss']) $(id).addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  return { render, isOpen: () => dialog.open };
}
