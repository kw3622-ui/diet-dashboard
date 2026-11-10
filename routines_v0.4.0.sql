-- v0.4.0: 루틴(생활 습관). 사용자가 만든 루틴과 날짜별 체크를 저장한다. AI·Edge Function은 쓰지 않는다.
-- 반복: daily(매일) / weekly(요일, 0=일~6=토) / monthly(날짜 1~31, 없는 날짜는 그 달 말일로 처리) / interval(시작일부터 n일마다)
create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  emoji text not null default '✅' check (char_length(emoji) between 1 and 8),
  kind text not null default 'check' check (kind in ('check', 'count')),
  target integer not null default 1 check (target between 1 and 100000),
  step integer not null default 1 check (step between 1 and 100000),
  unit text not null default '' check (char_length(unit) <= 10),
  schedule_type text not null default 'daily' check (schedule_type in ('daily', 'weekly', 'monthly', 'interval')),
  weekdays smallint[] not null default '{}' check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  month_days smallint[] not null default '{}' check (month_days <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]::smallint[]),
  interval_days smallint check (interval_days between 2 and 365),
  start_date date not null default current_date,
  time_slot text not null default 'anytime' check (time_slot in ('morning', 'late_morning', 'lunch', 'afternoon', 'evening', 'bedtime', 'anytime')),
  time_of_day time,
  motto text not null default '' check (char_length(motto) <= 100),
  link_exercise boolean not null default false,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (schedule_type <> 'weekly' or cardinality(weekdays) > 0),
  check (schedule_type <> 'monthly' or cardinality(month_days) > 0),
  check (schedule_type <> 'interval' or interval_days is not null)
);

comment on table public.routines is 'v0.4.0 사용자 루틴(생활 습관). 본인 것만 읽고 쓴다.';

create table if not exists public.routine_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid not null references public.routines(id) on delete cascade,
  check_date date not null,
  status text not null check (status in ('done', 'progress', 'skipped')),
  value integer not null default 0 check (value between 0 and 1000000),
  note text not null default '' check (char_length(note) <= 300),
  updated_at timestamptz not null default now(),
  unique (routine_id, check_date)
);

comment on table public.routine_checks is 'v0.4.0 루틴 날짜별 체크. done=완료, progress=횟수형 진행 중 또는 메모만, skipped=건너뜀(쉬는 날, 연속 기록 유지).';

create index if not exists routines_user_idx on public.routines (user_id, sort_order);
create index if not exists routine_checks_user_date_idx on public.routine_checks (user_id, check_date);

alter table public.routines enable row level security;
alter table public.routine_checks enable row level security;

drop policy if exists routines_select_own on public.routines;
create policy routines_select_own on public.routines for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists routines_insert_own on public.routines;
create policy routines_insert_own on public.routines for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists routines_update_own on public.routines;
create policy routines_update_own on public.routines for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists routines_delete_own on public.routines;
create policy routines_delete_own on public.routines for delete to authenticated
  using ((select auth.uid()) = user_id);

-- 체크는 본인 루틴에만 달 수 있다.
drop policy if exists routine_checks_select_own on public.routine_checks;
create policy routine_checks_select_own on public.routine_checks for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists routine_checks_insert_own on public.routine_checks;
create policy routine_checks_insert_own on public.routine_checks for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())));
drop policy if exists routine_checks_update_own on public.routine_checks;
create policy routine_checks_update_own on public.routine_checks for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())));
drop policy if exists routine_checks_delete_own on public.routine_checks;
create policy routine_checks_delete_own on public.routine_checks for delete to authenticated
  using ((select auth.uid()) = user_id);

-- 설정의 "루틴 기능 사용"(계정마다, 기본 켜짐). profiles의 기존 RLS·권한·보안 트리거가 그대로 적용된다.
alter table public.profiles add column if not exists show_routines boolean not null default true;
comment on column public.profiles.show_routines is 'v0.4.0 루틴 기능 사용. false면 홈 루틴 칸과 루틴 탭을 숨긴다(기록은 유지).';

revoke all on public.routines, public.routine_checks from anon, authenticated;
grant select, insert, update, delete on public.routines, public.routine_checks to authenticated;
