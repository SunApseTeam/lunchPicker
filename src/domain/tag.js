// Tags say what a place serves ("피자", "한식"). They are optional and free-form: typed with or
// without a leading #, unique per place ignoring case, and capped so a row stays readable.
export const MAX_TAGS = 5;
export const MAX_TAG_LENGTH = 10;

export function normalizeTag(text) {
  const tag = text.trim().replace(/^#+/, '').trim().replace(/\s+/g, ' ');
  if (!tag) throw new Error('태그를 입력해 주세요');
  if (tag.length > MAX_TAG_LENGTH) throw new Error(`태그는 ${MAX_TAG_LENGTH}자까지 입력할 수 있어요`);
  return tag;
}

// A clean tag list to store. A tag already on the list (ignoring case) is dropped quietly.
export function checkTags(tags) {
  const out = [];
  for (const text of tags) {
    const tag = normalizeTag(text);
    if (!out.some((t) => t.toLowerCase() === tag.toLowerCase())) out.push(tag);
  }
  if (out.length > MAX_TAGS) throw new Error(`태그는 ${MAX_TAGS}개까지 달 수 있어요`);
  return out;
}

// Every tag in use, most used first, for suggestions.
export function tagsInUse(menus) {
  const count = new Map();
  for (const m of menus) for (const t of m.tags) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')).map(([t]) => t);
}
