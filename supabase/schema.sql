-- 점심 플링코 공유 저장소. Supabase 대시보드의 SQL Editor에 통째로 붙여 넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.

create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 20),
  hidden boolean not null default false,
  icon text check (icon is null or char_length(icon) <= 16),
  tags text[] not null default '{}' check (cardinality(tags) <= 5 and char_length(array_to_string(tags, '')) <= 60),
  created_at timestamptz not null default now()
);
-- Projects created before menu icons and tags existed.
alter table public.menus add column if not exists icon text check (icon is null or char_length(icon) <= 16);
alter table public.menus add column if not exists tags text[] not null default '{}'
  check (cardinality(tags) <= 5 and char_length(array_to_string(tags, '')) <= 60);
create unique index if not exists menus_name_unique on public.menus (lower(name));

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.menus (id),
  visited_on date not null,
  source text not null check (source in ('spin', 'manual')),
  canceled boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists visits_visited_on on public.visits (visited_on);

-- 로그인 없는 방문자(anon)는 읽기, 추가, 수정만 할 수 있습니다. 삭제 정책이 없으므로 삭제는 막힙니다.
alter table public.menus enable row level security;
alter table public.visits enable row level security;

drop policy if exists "anon read menus" on public.menus;
drop policy if exists "anon add menus" on public.menus;
drop policy if exists "anon edit menus" on public.menus;
create policy "anon read menus" on public.menus for select to anon using (true);
create policy "anon add menus" on public.menus for insert to anon with check (true);
create policy "anon edit menus" on public.menus for update to anon using (true) with check (true);

drop policy if exists "anon read visits" on public.visits;
drop policy if exists "anon add visits" on public.visits;
drop policy if exists "anon edit visits" on public.visits;
create policy "anon read visits" on public.visits for select to anon using (true);
create policy "anon add visits" on public.visits for insert to anon with check (true);
create policy "anon edit visits" on public.visits for update to anon using (true) with check (true);

grant select, insert, update on public.menus, public.visits to anon;
revoke delete, truncate on public.menus, public.visits from anon;

-- 팀원: 보드 위에서 기다리다 구슬이 되어 떨어지는 사람들. Table Editor에서 직접 고칩니다.
-- scale은 설정 크기에 곱하는 값(0.85~1), softness와 bounce는 설정값에 더하는 값입니다.
-- lines_* 는 상황별 말풍선 대사: 기다릴 때, 떨어질 때, 튕길 때, 서로 부딪힐 때, 결과.
-- 사진은 Storage의 공개 team 버킷에 <id>.png (눌린 얼굴은 <id>-squish.png) 로 둡니다.
create table if not exists public.members (
  id text primary key check (id ~ '^[a-z0-9-]{1,30}$'),
  name text not null check (char_length(name) between 1 and 10),
  color text not null default '#ffe066' check (color ~* '^#[0-9a-f]{6}$'),
  scale numeric(3, 2) not null default 1 check (scale between 0.85 and 1),
  softness integer not null default 0 check (softness between -100 and 100),
  bounce integer not null default 0 check (bounce between -100 and 100),
  lines_wait text[] not null default '{}',
  lines_drop text[] not null default '{}',
  lines_bounce text[] not null default '{}',
  lines_bump text[] not null default '{}',
  lines_win text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 팀원 목록은 누구나 읽기만 합니다. 고치는 건 Supabase 대시보드에서.
alter table public.members enable row level security;
drop policy if exists "anon read members" on public.members;
create policy "anon read members" on public.members for select to anon using (true);
grant select on public.members to anon;
revoke insert, update, delete, truncate on public.members from anon;

insert into public.members (id, name, color, scale, softness, bounce, lines_wait, lines_drop, lines_bounce, lines_bump, lines_win) values
  ('jungwon', '고정원', '#5ab8ff', 1, 0, 0, array['오늘 뭐 먹지?', '아무거나 좋아요', '국물 땡긴다'], array['가 볼까~', '간다!', '믿고 맡겨요'], array['어어어?', '으악!', '튕긴다~'], array['앗 죄송!', '부딪혔다!', '비켜 줘요~'], array['여기 좋다!', '내가 골랐어요', '가시죠!']),
  ('dongwon', '김동원', '#ffb347', 0.92, 0, 20, array['배고파요…', '고기 먹자!', '나 골라줘!'], array['출동!', '고기 어디야!', '비켜요~'], array['끼얏호!', '우왕!', '한 번 더!'], array['밀지 마요!', '내 자리야!', '하이파이브!'], array['고기 맞죠?', '대박!', '잘 먹겠습니다']),
  ('sungmin', '박성민', '#7bd389', 1, -40, -10, array['든든하게 가죠', '어제 거기 또?', '밥이 최고'], array['묵직하게 간다', '갑니다', '흔들리지 않아'], array['윽!', '끄떡없어', '아프잖아'], array['어딜!', '안 밀려', '꿈쩍도 안 해'], array['든든하네', '좋습니다', '여기로 가죠']),
  ('junhyuk', '손준혁', '#ff8ad8', 0.85, 0, 25, array['빨리 가요!', '면 먹고 싶다', '나 던져 줘'], array['슝~', '날아간다!', '야호!'], array['통통!', '한 번 더!', '재밌다!'], array['통!', '같이 가요!', '나 먼저!'], array['면이다!', '됐다!', '빨리 가요!']),
  ('eunseol', '조은설', '#c38bff', 0.88, 0, -10, array['가볍게 먹을래요', '새로운 데 가 봐요', '디저트도?'], array['살살 가요', '어디 가지?', '두근두근'], array['앗!', '어머!', '아이고'], array['어머 죄송해요', '살살요!', '깜짝이야'], array['괜찮네요', '좋아요!', '디저트도 먹어요']),
  ('beomgyu', '최범규', '#4fd1c5', 0.96, -20, 10, array['점심 시간이다!', '매운 거 어때요', '줄 안 서는 데로'], array['가즈아!', '갑니다~', '맵게 가자'], array['오잉?', '하하!', '어지러워'], array['길 막지 마~', '충돌!', '하하 미안'], array['여기다!', '줄 없겠지?', '맛있겠다'])
on conflict (id) do nothing;
