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
