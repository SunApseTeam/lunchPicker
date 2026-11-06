import { $ } from '../shared/dom.js';

// The records and stats, unrolled over the board from the sidebar's edge instead of opened as a
// page of their own: the sidebar stays where it is, and closing rolls them back to the left. The
// stats page itself (stats.html, with ?embed) is shown in a frame, loaded the first time it is
// opened and refreshed every time after, so a lunch just recorded is already there.
// onToggle(open) is called once it starts opening or closing.
export function createStatsPanel({ onToggle = () => {} } = {}) {
  const panel = $('#stats-panel');
  const frame = $('#stats-frame');
  const tab = $('#stats-tab');
  // With motion turned down it simply appears and goes, with no transition to wait for.
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let open = false;

  function src() {
    const url = new URL('stats.html', location.href);
    url.search = location.search;
    url.searchParams.set('embed', '');
    return url.href;
  }

  function show() {
    if (open) return;
    open = true;
    if (!frame.src) frame.src = src();
    else frame.contentWindow?.postMessage({ type: 'lunch:refresh' }, location.origin);
    panel.hidden = false;
    // A frame later, so the closed state is drawn first and the unrolling animates.
    requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('open')));
    tab.setAttribute('aria-expanded', 'true');
    tab.setAttribute('aria-label', '기록 닫기');
    onToggle(true);
  }

  function hide() {
    if (!open) return;
    open = false;
    panel.classList.remove('open');
    if (still) panel.hidden = true;
    tab.setAttribute('aria-expanded', 'false');
    tab.setAttribute('aria-label', '기록과 통계 열기');
    onToggle(false);
  }

  // Hidden once rolled up, so it takes no clicks or focus.
  panel.addEventListener('transitionend', (e) => {
    if (e.target === panel && !open) panel.hidden = true;
  });

  tab.addEventListener('click', () => (open ? hide() : show()));
  $('#stats-close').addEventListener('click', hide);
  // Esc pressed inside the frame closes it too.
  window.addEventListener('message', (e) => {
    if (e.origin === location.origin && e.data?.type === 'lunch:close') hide();
  });

  return { show, hide, isOpen: () => open };
}
