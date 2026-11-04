-- v0.3.9: 전체 기간 습관 분석 결과. 사용자당 하루 1회(report_date는 한국 날짜).
-- snapshot: 서버가 계산한 월별 지표, report_data: AI 해석(서버가 검사한 값)
create table if not exists public.habit_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_date date not null,
  window_start date not null,
  window_end date not null,
  record_count integer not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  report_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, report_date)
);

comment on table public.habit_reports is
  'v0.3.9 전체 기간 습관 분석 이력. 사용자당 하루 1회(unique user_id, report_date). diet-ai habitReport가 저장한다.';

create index if not exists habit_reports_user_created_idx
  on public.habit_reports (user_id, created_at desc);

alter table public.habit_reports enable row level security;

drop policy if exists habit_reports_select_own on public.habit_reports;
create policy habit_reports_select_own
  on public.habit_reports for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists habit_reports_insert_own on public.habit_reports;
create policy habit_reports_insert_own
  on public.habit_reports for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- 수정·삭제 권한은 주지 않는다(이력은 남기기만 함). 회원 삭제 시에는 FK cascade로 함께 지워진다.
revoke all on public.habit_reports from anon, authenticated;
grant select, insert on public.habit_reports to authenticated;
