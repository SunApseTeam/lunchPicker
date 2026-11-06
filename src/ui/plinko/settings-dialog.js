import { CHAOS_DELAY_MAX, DEFAULT_SETTINGS, SPEEDS } from '../../domain/settings.js';
import { $ } from '../shared/dom.js';

// The gear-icon popup: sound on or off, how fast the balls fall, and how long after the first
// landing the 혼란 button opens. It reports every change through onChange and redraws from
// settings(). They are kept in this browser (localStorage) for the next visit.
export function createSettingsDialog({ settings, onChange }) {
  const dialog = $('#settings');
  const speed = $('#set-speed');
  const chaos = $('#set-chaos');
  speed.max = SPEEDS.length - 1;
  chaos.max = CHAOS_DELAY_MAX;

  function render() {
    const current = settings();
    $('#set-sound').checked = current.sound;
    const at = SPEEDS.indexOf(current.speed);
    speed.value = at < 0 ? SPEEDS.indexOf(1) : at;
    $('#set-speed-v').textContent = `${current.speed}배`;
    chaos.value = current.chaosDelay;
    $('#set-chaos-v').textContent = current.chaosDelay === 0 ? '바로' : `${current.chaosDelay}초`;
  }

  $('#set-sound').addEventListener('change', (e) => onChange({ ...settings(), sound: e.target.checked }));
  speed.addEventListener('input', (e) => onChange({ ...settings(), speed: SPEEDS[Number(e.target.value)] }));
  chaos.addEventListener('input', (e) => onChange({ ...settings(), chaosDelay: Number(e.target.value) }));
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
