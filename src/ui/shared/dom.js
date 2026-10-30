export const $ = (sel) => document.querySelector(sel);

export function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

let toastTimer = null;
export function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

const MODE_NOTES = {
  demo: '예시 데이터 · 바꿔도 저장되지 않아요',
  local: '시험 모드 · 이 브라우저에만 저장돼요',
};

// Outside the shared store, say so on screen and keep the mode when moving between pages.
export function markMode(mode) {
  const note = MODE_NOTES[mode];
  if (!note) return;
  const el = document.createElement('div');
  el.className = 'mode-banner';
  el.textContent = note;
  document.body.append(el);
  for (const a of document.querySelectorAll('a[data-keep-mode]')) a.search = location.search;
}
