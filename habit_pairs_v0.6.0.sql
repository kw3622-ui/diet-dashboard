-- v0.6.0 짝 습관: 하고 싶은 습관(루틴 이름) vs 버릴 습관, 최소 버전, 주간 점검.
-- 판단과 계산은 화면에서 한다(규칙). AI 한마디는 v0.6.1에서 habit_weekly_reviews.ai_note에 저장한다.

-- 1) 루틴: 버릴 습관(선택), 최소 버전(선택)
alter table public.routines add column if not exists bad_habit text not null default '' check (char_length(bad_habit) <= 60);
alter table public.routines add column if not exists min_version text not null default '' check (char_length(min_version) <= 60);
comment on column public.routines.bad_habit is 'v0.6.0 버릴 습관(짝 습관). 비어 있으면 일반 루틴.';
comment on column public.routines.min_version is 'v0.6.0 힘든 날의 최소 버전(예: 1쪽만). "조금이라도 했어요"에 표시.';

-- 2) 하루 기록: mini(조금이라도 함 = 지킴으로 셈), slipped(버릴 습관을 함). 횟수 루틴은 버릴 습관 횟수를 bad_value에.
alter table public.routine_checks drop constraint if exists routine_checks_status_check;
alter table public.routine_checks add constraint routine_checks_status_check
  check (status in ('done', 'progress', 'skipped', 'mini', 'slipped'));
alter table public.routine_checks add column if not exists bad_value integer not null default 0 check (bad_value between 0 and 1000000);
comment on column public.routine_checks.bad_value is 'v0.6.0 횟수형 짝 습관에서 버릴 습관을 한 횟수.';

-- 3) 주간 점검: 주(월요일 시작)마다 한 줄. 점검을 끝낸 시각과 AI 한마디(v0.6.1).
create table if not exists public.habit_weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  reviewed_at timestamptz,
  ai_note text not null default '' check (char_length(ai_note) <= 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);
comment on table public.habit_weekly_reviews is 'v0.6.0 주간 습관 점검(주마다 한 줄). 본인 것만.';

alter table public.habit_weekly_reviews enable row level security;
drop policy if exists habit_weekly_reviews_select_own on public.habit_weekly_reviews;
create policy habit_weekly_reviews_select_own on public.habit_weekly_reviews for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists habit_weekly_reviews_insert_own on public.habit_weekly_reviews;
create policy habit_weekly_reviews_insert_own on public.habit_weekly_reviews for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists habit_weekly_reviews_update_own on public.habit_weekly_reviews;
create policy habit_weekly_reviews_update_own on public.habit_weekly_reviews for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists habit_weekly_reviews_delete_own on public.habit_weekly_reviews;
create policy habit_weekly_reviews_delete_own on public.habit_weekly_reviews for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.habit_weekly_reviews from anon, authenticated;
grant select, insert, update, delete on public.habit_weekly_reviews to authenticated;
