import { physicsFrom } from './physics.js';

// The team members who wait on the drop line and fall as the balls. The team's own list lives
// in the shared store (the members table); this one seeds it and serves ?demo and ?local.
// Each member's physics is the shared settings nudged by their own traits:
// - scale: size as a share of the settings size, 0.9 to 1. Never above 1, because the settings
//   size sets how many slots fit on the board.
// - softness, bounce: added to the settings value, then kept within 0 to 100.
// lines: what they say in a speech bubble, by situation (see SITUATIONS).
export const SITUATIONS = {
  pick: 'just picked for the next drop',
  wait: 'standing on the drop line, chatting',
  drop: 'dropped, or re-dropped',
  bounce: 'flung by a bumper or off a settled ball',
  bump: 'running into another falling member',
  win: 'over their slot on the result',
};

export const DEFAULT_TEAM = [
  { id: 'jungwon', name: '고정원', color: '#5ab8ff', scale: 1, softness: 0, bounce: 0,
    lines: {
      pick: ['저요!', '맡겨 주세요', '좋아, 가 보자'],
      wait: ['오늘 뭐 먹지?', '아무거나 좋아요', '국물 땡긴다'],
      drop: ['가 볼까~', '간다!', '믿고 맡겨요'],
      bounce: ['어어어?', '으악!', '튕긴다~'],
      bump: ['앗 죄송!', '부딪혔다!', '비켜 줘요~'],
      win: ['여기 좋다!', '내가 골랐어요', '가시죠!'],
    },
  },
  { id: 'dongwon', name: '김동원', color: '#ffb347', scale: 0.95, softness: 0, bounce: 20,
    lines: {
      pick: ['나야 나!', '고기 각이다', '오예!'],
      wait: ['배고파요…', '고기 먹자!', '나 골라줘!'],
      drop: ['출동!', '고기 어디야!', '비켜요~'],
      bounce: ['끼얏호!', '우왕!', '한 번 더!'],
      bump: ['밀지 마요!', '내 자리야!', '하이파이브!'],
      win: ['고기 맞죠?', '대박!', '잘 먹겠습니다'],
    },
  },
  { id: 'sungmin', name: '박성민', color: '#7bd389', scale: 1, softness: -40, bounce: -10,
    lines: {
      pick: ['제가 가죠', '든든하게 다녀올게요', '믿어 보세요'],
      wait: ['든든하게 가죠', '어제 거기 또?', '밥이 최고'],
      drop: ['묵직하게 간다', '갑니다', '흔들리지 않아'],
      bounce: ['윽!', '끄떡없어', '아프잖아'],
      bump: ['어딜!', '안 밀려', '꿈쩍도 안 해'],
      win: ['든든하네', '좋습니다', '여기로 가죠'],
    },
  },
  { id: 'junhyuk', name: '손준혁', color: '#ff8ad8', scale: 0.9, softness: 0, bounce: 25,
    lines: {
      pick: ['야호, 나다!', '빨리 던져 줘요', '준비 완료!'],
      wait: ['빨리 가요!', '면 먹고 싶다', '나 던져 줘'],
      drop: ['슝~', '날아간다!', '야호!'],
      bounce: ['통통!', '한 번 더!', '재밌다!'],
      bump: ['통!', '같이 가요!', '나 먼저!'],
      win: ['면이다!', '됐다!', '빨리 가요!'],
    },
  },
  { id: 'eunseol', name: '조은설', color: '#c38bff', scale: 0.92, softness: 0, bounce: -10,
    lines: {
      pick: ['저요?', '잘 골라 볼게요', '두근두근…'],
      wait: ['가볍게 먹을래요', '새로운 데 가 봐요', '디저트도?'],
      drop: ['살살 가요', '어디 가지?', '두근두근'],
      bounce: ['앗!', '어머!', '아이고'],
      bump: ['어머 죄송해요', '살살요!', '깜짝이야'],
      win: ['괜찮네요', '좋아요!', '디저트도 먹어요'],
    },
  },
  { id: 'beomgyu', name: '최범규', color: '#4fd1c5', scale: 0.98, softness: -20, bounce: 10,
    lines: {
      pick: ['드디어!', '매운 데로 갈게요', '가즈아 준비'],
      wait: ['점심 시간이다!', '매운 거 어때요', '줄 안 서는 데로'],
      drop: ['가즈아!', '갑니다~', '맵게 가자'],
      bounce: ['오잉?', '하하!', '어지러워'],
      bump: ['길 막지 마~', '충돌!', '하하 미안'],
      win: ['여기다!', '줄 없겠지?', '맛있겠다'],
    },
  },
];

// Said when a member's row has no lines for a situation.
const FALLBACK_LINES = { pick: ['저요!'], wait: ['배고파요'], drop: ['간다!'], bounce: ['으악!'], bump: ['앗!'], win: ['여기다!'] };
const COLOR = /^#[0-9a-f]{6}$/i;
const clamp = (v, lo, hi, fallback) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

// A member as edited by hand in the shared table: traits kept in range, blank lines dropped,
// and a missing situation filled in, so a typo there can never break a round.
export function parseMember(raw) {
  const lines = {};
  for (const when of Object.keys(SITUATIONS)) {
    const said = (raw.lines?.[when] ?? []).map((l) => String(l).trim()).filter(Boolean);
    lines[when] = said.length > 0 ? said : FALLBACK_LINES[when];
  }
  return {
    id: String(raw.id),
    name: String(raw.name ?? raw.id).trim(),
    color: COLOR.test(raw.color ?? '') ? raw.color : '#ffe066',
    scale: clamp(raw.scale, 0.9, 1, 1),
    softness: clamp(raw.softness, -100, 100, 0),
    bounce: clamp(raw.bounce, -100, 100, 0),
    lines,
  };
}

export function memberPhysics(settings, member) {
  return physicsFrom({
    ...settings,
    size: Math.round(settings.size * Math.min(1, member.scale)),
    softness: clamp(settings.softness + member.softness, 0, 100, settings.softness),
    bounce: clamp(settings.bounce + member.bounce, 0, 100, settings.bounce),
  });
}
