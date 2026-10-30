// Each menu shows an emoji: the one someone picked, or else a guess from its tags, then its name
// (a place's name often says nothing about its food: 도이, 끝장).
// Rules are checked in order, so specific words come before the general ones they contain
// (마라탕 before 탕, 국수 before 국, 탕수육 before 탕).
const RULES = [
  [['마라'], '🌶️'],
  [['탕수육', '중식', '중국', '반점', '딤섬'], '🥡'],
  [['만두', '교자'], '🥟'],
  [['파스타', '스파게티', '양식'], '🍝'],
  [['라멘', '라면', '우동', '국수', '짜장', '짬뽕', '냉면', '소바', '면'], '🍜'],
  [['초밥', '스시', '사시미', '일식', '회'], '🍣'],
  [['카레', '커리'], '🍛'],
  [['김밥', '주먹밥', '오니기리'], '🍙'],
  [['떡볶이', '분식', '어묵', '오뎅'], '🍢'],
  [['돈까스', '돈가스', '돈카츠', '카츠'], '🐷'],
  [['튀김', '새우'], '🍤'],
  [['치킨', '닭강정', '닭'], '🍗'],
  [['족발', '보쌈', '수육'], '🍖'],
  [['고기', '삼겹', '갈비', '불고기', '스테이크', '소고기', '제육'], '🥩'],
  [['버거', 'burger'], '🍔'],
  [['피자', 'pizza'], '🍕'],
  [['샌드위치', '서브웨이', 'subway'], '🥪'],
  [['타코', '부리또', '멕시칸'], '🌮'],
  [['샐러드', '포케'], '🥗'],
  [['죽'], '🥣'],
  [['브런치', '토스트', '오믈렛'], '🍳'],
  [['빵', '베이글', '베이커리'], '🥯'],
  [['카페', '커피'], '☕'],
  [['생선', '고등어', '연어'], '🐟'],
  [['해물', '해산물', '조개', '낙지', '쭈꾸미', '주꾸미'], '🦐'],
  [['도시락', '정식', '백반', '한식'], '🍱'],
  [['찌개', '국밥', '탕', '전골', '국', '해장', '순두부'], '🍲'],
  [['덮밥', '비빔밥', '볶음밥', '밥'], '🍚'],
];
export const DEFAULT_ICON = '🍽️';

// What someone can pick by hand: every guessed icon plus a few more.
export const ICON_CHOICES = [
  ...new Set([...RULES.map(([, icon]) => icon), '🥘', '🫕', '🍝', '🥙', '🌯', '🍠', '🧆', '🥞', '☕', '🍰', DEFAULT_ICON]),
];

export function guessIcon(name) {
  const lower = name.toLowerCase();
  return RULES.find(([words]) => words.some((w) => lower.includes(w)))?.[1] ?? DEFAULT_ICON;
}

export function menuIcon(menu) {
  if (menu.icon) return menu.icon;
  for (const tag of menu.tags ?? []) {
    const icon = guessIcon(tag);
    if (icon !== DEFAULT_ICON) return icon;
  }
  return guessIcon(menu.name);
}

export function checkIcon(icon) {
  if (icon !== null && !ICON_CHOICES.includes(icon)) throw new Error('고를 수 없는 아이콘이에요');
  return icon;
}
