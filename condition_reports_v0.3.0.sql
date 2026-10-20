create table if not exists public.condition_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  condition_key text not null,
  condition_label text not null,
  window_start date not null,
  window_end date not null,
  status text not null default 'insufficient'
    check (status in ('improving', 'stable', 'needs_attention', 'insufficient')),
  report_data jsonb not null default '{}'::jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.condition_reports is
  '설정에 등록한 기저질환별 최근 60일 생활습관 분석 이력. 재분석 때마다 새 행을 남긴다.';

create index if not exists condition_reports_user_condition_created_idx
  on public.condition_reports (user_id, condition_key, created_at desc);

alter table public.condition_reports enable row level security;

drop policy if exists condition_reports_select_own on public.condition_reports;
create policy condition_reports_select_own
  on public.condition_reports for select
  using ((select auth.uid()) = user_id);

drop policy if exists condition_reports_insert_own on public.condition_reports;
create policy condition_reports_insert_own
  on public.condition_reports for insert
  with check ((select auth.uid()) = user_id);

