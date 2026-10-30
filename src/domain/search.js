// Menu search tuned for Korean typing. A query matches a name or one of its tags by any of:
//   plain text      "찌개" in 김치찌개, ignoring case and spaces
//   initials        "ㄱㅊㅉㄱ" or "ㄱㅊ" for 김치찌개
//   unfinished      "김ㅊ", "짜자" while the IME is still composing a syllable
//   short forms     "김찌" for 김치찌개 (its syllables in order)
//   wrong keyboard  "rlacl" typed with the Korean IME off, read as 김치 on a 2-set layout
// Lower scores are better matches.
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅗㅏ', 'ㅗㅐ', 'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅔ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ'];
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
// Standalone compound jamo the IME shows mid-word, split the same way as above.
const COMPOUND = {
  ㄳ: 'ㄱㅅ', ㄵ: 'ㄴㅈ', ㄶ: 'ㄴㅎ', ㄺ: 'ㄹㄱ', ㄻ: 'ㄹㅁ', ㄼ: 'ㄹㅂ', ㄽ: 'ㄹㅅ', ㄾ: 'ㄹㅌ', ㄿ: 'ㄹㅍ', ㅀ: 'ㄹㅎ', ㅄ: 'ㅂㅅ',
  ㅘ: 'ㅗㅏ', ㅙ: 'ㅗㅐ', ㅚ: 'ㅗㅣ', ㅝ: 'ㅜㅓ', ㅞ: 'ㅜㅔ', ㅟ: 'ㅜㅣ', ㅢ: 'ㅡㅣ',
};
const QWERTY = {
  q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ', y: 'ㅛ', u: 'ㅕ', i: 'ㅑ', o: 'ㅐ', p: 'ㅔ',
  a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ', h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ',
  z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ',
  Q: 'ㅃ', W: 'ㅉ', E: 'ㄸ', R: 'ㄲ', T: 'ㅆ', O: 'ㅒ', P: 'ㅖ',
};
const SYLLABLE_START = 0xac00;
const SYLLABLE_END = 0xd7a3;

const isSyllable = (ch) => ch.charCodeAt(0) >= SYLLABLE_START && ch.charCodeAt(0) <= SYLLABLE_END;
const normalize = (s) => s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

function jamo(text) {
  let out = '';
  for (const ch of text) {
    if (isSyllable(ch)) {
      const code = ch.charCodeAt(0) - SYLLABLE_START;
      out += CHO[Math.floor(code / 588)] + JUNG[Math.floor((code % 588) / 28)] + JONG[code % 28];
    } else {
      out += COMPOUND[ch] ?? ch;
    }
  }
  return out;
}

function initials(text) {
  let out = '';
  for (const ch of text) out += isSyllable(ch) ? CHO[Math.floor((ch.charCodeAt(0) - SYLLABLE_START) / 588)] : ch;
  return out;
}

const isAllInitials = (s) => [...s].every((ch) => CHO.includes(ch));

function inOrder(needle, haystack) {
  let i = 0;
  for (const ch of haystack) if (ch === needle[i]) i += 1;
  return i === needle.length;
}

export function matchScore(name, query) {
  const q = normalize(query);
  if (!q) return 0;
  const n = normalize(name);
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.includes(q)) return 2;
  if (isAllInitials(q)) {
    const ini = initials(n);
    if (ini.startsWith(q)) return 3;
    if (ini.includes(q)) return 4;
  }
  const nj = jamo(n);
  const qj = jamo(q);
  if (nj.startsWith(qj)) return 5;
  if (nj.includes(qj)) return 6;
  if ([...q].every(isSyllable) && q.length >= 2 && inOrder([...q], [...n])) return 7;
  const typed = [...query.replace(/\s/g, '')].map((ch) => QWERTY[ch] ?? QWERTY[ch.toLowerCase()] ?? '').join('');
  if (/^[a-z]+$/i.test(query.replace(/\s/g, '')) && typed && nj.includes(typed)) return 8;
  return null;
}

// A tag hit ranks just behind the same kind of hit on the name.
function menuScore(menu, query) {
  const scores = [matchScore(menu.name, query), ...(menu.tags ?? []).map((t) => matchScore(t, query))]
    .map((s, i) => (s === null ? null : s + (i > 0 ? 0.5 : 0)))
    .filter((s) => s !== null);
  return scores.length > 0 ? Math.min(...scores) : null;
}

// Matching menus, best first; ties keep the list's own order.
export function searchMenus(menus, query) {
  return menus
    .map((menu, i) => ({ menu, i, score: menuScore(menu, query) }))
    .filter((r) => r.score !== null)
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .map((r) => r.menu);
}
