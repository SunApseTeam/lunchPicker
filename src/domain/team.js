import { physicsFrom } from './physics.js';

// The team members who wait on the drop line and fall as the balls. Each one's physics is the
// shared settings nudged by their own traits:
// - scale: size as a share of the settings size, 0.85 to 1. Never above 1, because the settings
//   size sets how many slots fit on the board.
// - softness, bounce: added to the settings value, then kept within 0 to 100.
// lines: what they say in a speech bubble, by situation. wait: in turns while standing on the
// drop line. drop: as they fall. bounce: when a bumper or a ball flings them. win: on the result.
export const TEAM = [
  { id: 'jungwon', name: '고정원', color: '#5ab8ff', scale: 1, softness: 0, bounce: 0,
    lines: {
      wait: ['오늘 뭐 먹지?', '아무거나 좋아요', '국물 땡긴다'],
      drop: ['가 볼까~', '간다!', '믿고 맡겨요'],
      bounce: ['어어어?', '으악!', '튕긴다~'],
      win: ['여기 좋다!', '내가 골랐어요', '가시죠!'],
    },
  },
  { id: 'dongwon', name: '김동원', color: '#ffb347', scale: 0.92, softness: 0, bounce: 20,
    lines: {
      wait: ['배고파요…', '고기 먹자!', '나 골라줘!'],
      drop: ['출동!', '고기 어디야!', '비켜요~'],
      bounce: ['끼얏호!', '우왕!', '한 번 더!'],
      win: ['고기 맞죠?', '대박!', '잘 먹겠습니다'],
    },
  },
  { id: 'sungmin', name: '박성민', color: '#7bd389', scale: 1, softness: -40, bounce: -10,
    lines: {
      wait: ['든든하게 가죠', '어제 거기 또?', '밥이 최고'],
      drop: ['묵직하게 간다', '갑니다', '흔들리지 않아'],
      bounce: ['윽!', '끄떡없어', '아프잖아'],
      win: ['든든하네', '좋습니다', '여기로 가죠'],
    },
  },
  { id: 'junhyuk', name: '손준혁', color: '#ff8ad8', scale: 0.85, softness: 0, bounce: 25,
    lines: {
      wait: ['빨리 가요!', '면 먹고 싶다', '나 던져 줘'],
      drop: ['슝~', '날아간다!', '야호!'],
      bounce: ['통통!', '한 번 더!', '재밌다!'],
      win: ['면이다!', '됐다!', '빨리 가요!'],
    },
  },
  { id: 'eunseol', name: '조은설', color: '#c38bff', scale: 0.88, softness: 0, bounce: -10,
    lines: {
      wait: ['가볍게 먹을래요', '새로운 데 가 봐요', '디저트도?'],
      drop: ['살살 가요', '어디 가지?', '두근두근'],
      bounce: ['앗!', '어머!', '아이고'],
      win: ['괜찮네요', '좋아요!', '디저트도 먹어요'],
    },
  },
  { id: 'beomgyu', name: '최범규', color: '#4fd1c5', scale: 0.96, softness: -20, bounce: 10,
    lines: {
      wait: ['점심 시간이다!', '매운 거 어때요', '줄 안 서는 데로'],
      drop: ['가즈아!', '갑니다~', '맵게 가자'],
      bounce: ['오잉?', '하하!', '어지러워'],
      win: ['여기다!', '줄 없겠지?', '맛있겠다'],
    },
  },
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
