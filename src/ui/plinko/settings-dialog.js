import { CHAOS_DELAY_MAX, DEFAULT_SETTINGS, ROWS, SPEEDS } from '../../domain/settings.js';
import { $ } from '../shared/dom.js';

// The gear-icon popup: sound on or off, how fast the balls fall, how long the drop is (how many
// peg rows), and how long after the first landing the 혼란 button opens. It reports every change through onChange and redraws from
// settings(). They are kept in this browser (localStorage) for the next visit. Speed and drop
// length go in steps: each step is marked and labelled under its slider, a label can be pressed
// to jump there, and onStep (a click) is called whenever the value lands on another step.
export function createSettingsDialog({ settings, onChange, onStep = () => {} }) {
  const dialog = $('#settings');
  const speed = $('#set-speed');
  const chaos = $('#set-chaos');
  const rows = $('#set-rows');
  speed.max = SPEEDS.length - 1;
  rows.max = ROWS.length - 1;
  chaos.max = CHAOS_DELAY_MAX;

  // The marks under a stepped slider: one label per step, the current one lit.
  const STEPPED = [
    { input: speed, ticks: $('#set-speed-ticks'), steps: SPEEDS, label: (v) => `${v}배`, key: 'speed' },
    { input: rows, ticks: $('#set-rows-ticks'), steps: ROWS, label: (v) => `${v}`, key: 'rows' },
  ];
  for (const s of STEPPED) {
    s.ticks.innerHTML = s.steps.map((v, i) => `<button type="button" data-step="${i}">${s.label(v)}</button>`).join('');
    s.ticks.addEventListener('click', (e) => {
      const button = e.target instanceof Element ? e.target.closest('[data-step]') : null;
      if (button) step(s, Number(button.dataset.step));
    });
    s.input.addEventListener('input', (e) => step(s, Number(e.target.value)));
  }

  function step(s, i) {
    if (s.steps[i] === settings()[s.key]) return;
    onStep();
    onChange({ ...settings(), [s.key]: s.steps[i] });
  }

  function render() {
    const current = settings();
    $('#set-sound').checked = current.sound;
    const at = SPEEDS.indexOf(current.speed);
    speed.value = at < 0 ? SPEEDS.indexOf(1) : at;
    $('#set-speed-v').textContent = `${current.speed}배`;
    const row = ROWS.indexOf(current.rows);
    rows.value = row < 0 ? 0 : row;
    $('#set-rows-v').textContent = `핀 ${current.rows}줄`;
    chaos.value = current.chaosDelay;
    $('#set-chaos-v').textContent = current.chaosDelay === 0 ? '바로' : `${current.chaosDelay}초`;
    for (const s of STEPPED) {
      s.ticks.querySelectorAll('[data-step]').forEach((b, i) => b.setAttribute('aria-pressed', String(s.steps[i] === current[s.key])));
    }
  }

  $('#set-sound').addEventListener('change', (e) => onChange({ ...settings(), sound: e.target.checked }));
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
