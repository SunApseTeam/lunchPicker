import { physicsFrom } from './physics.js';

// The team members who wait on the drop line and fall as the balls. Each one's physics is the
// shared settings nudged by their own traits:
// - scale: size as a share of the settings size, 0.85 to 1. Never above 1, because the settings
//   size sets how many slots fit on the board.
// - softness, bounce: added to the settings value, then kept within 0 to 100.
// lines are what they say in their speech bubble while waiting.
export const TEAM = [
  { id: 'jungwon', name: '고정원', color: '#5ab8ff', scale: 1, softness: 0, bounce: 0, lines: ['오늘 뭐 먹지?', '아무거나 좋아요', '국물 땡긴다'] },
  { id: 'dongwon', name: '김동원', color: '#ffb347', scale: 0.92, softness: 0, bounce: 20, lines: ['배고파요…', '고기 먹자!', '나 골라줘!'] },
  { id: 'sungmin', name: '박성민', color: '#7bd389', scale: 1, softness: -40, bounce: -10, lines: ['든든하게 가죠', '어제 거기 또?', '밥이 최고'] },
  { id: 'junhyuk', name: '손준혁', color: '#ff8ad8', scale: 0.85, softness: 0, bounce: 25, lines: ['빨리 가요!', '면 먹고 싶다', '나 던져 줘'] },
  { id: 'eunseol', name: '조은설', color: '#c38bff', scale: 0.88, softness: 0, bounce: -10, lines: ['가볍게 먹을래요', '새로운 데 가 봐요', '디저트도?'] },
  { id: 'beomgyu', name: '최범규', color: '#4fd1c5', scale: 0.96, softness: -20, bounce: 10, lines: ['점심 시간이다!', '매운 거 어때요', '줄 안 서는 데로'] },
];

const clamp = (v) => Math.min(100, Math.max(0, v));

export function memberPhysics(settings, member) {
  return physicsFrom({
    ...settings,
    size: Math.round(settings.size * Math.min(1, member.scale)),
    softness: clamp(settings.softness + member.softness),
    bounce: clamp(settings.bounce + member.bounce),
  });
}
