export const DEFAULT_MENUS = ['김치찌개', '돈까스', '국밥', '짜장면', '쌀국수', '버거', '초밥', '샐러드'];
export const MAX_NAME_LENGTH = 20;

// Names are unique ignoring case, hidden menus included, so a hidden menu is revived rather
// than duplicated.
export function normalizeMenuName(name, menus, exceptId) {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) throw new Error('메뉴 이름을 입력해 주세요');
  if (trimmed.length > MAX_NAME_LENGTH) throw new Error(`${MAX_NAME_LENGTH}자까지 입력할 수 있어요`);
  const clash = menus.find((m) => m.id !== exceptId && m.name.toLowerCase() === trimmed.toLowerCase());
  if (clash) throw new Error(clash.hidden ? `'${clash.name}'은(는) 숨긴 메뉴에 있어요` : `'${clash.name}'은(는) 이미 있어요`);
  return trimmed;
}
