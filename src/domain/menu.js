// Each entry is a place to eat; its tags say what kind of food it serves.
export const DEFAULT_MENUS = [
  { name: '라면순두부', tags: ['한식'] },
  { name: '이도곰탕', tags: ['한식'] },
  { name: '도이', tags: ['중식'] },
  { name: '끝장', tags: ['칼국수'] },
  { name: '역삼라멘', tags: ['라멘'] },
  { name: '노모어피자', tags: ['피자'] },
];
export const MAX_NAME_LENGTH = 20;

// Names are unique ignoring case, hidden menus included, so a hidden menu is revived rather
// than duplicated.
export function normalizeMenuName(name, menus, exceptId) {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) throw new Error('가게 이름을 입력해 주세요');
  if (trimmed.length > MAX_NAME_LENGTH) throw new Error(`${MAX_NAME_LENGTH}자까지 입력할 수 있어요`);
  const clash = menus.find((m) => m.id !== exceptId && m.name.toLowerCase() === trimmed.toLowerCase());
  if (clash) throw new Error(clash.hidden ? `'${clash.name}'은(는) 숨긴 메뉴에 있어요` : `'${clash.name}'은(는) 이미 있어요`);
  return trimmed;
}
