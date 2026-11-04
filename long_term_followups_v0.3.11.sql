-- v0.3.11: 장기 분석(습관 분석, 기저질환별 2개월 분석) 결과에 대한 질문과 답변. 분석 1개당 2회.
-- seq는 1 또는 2만 허용하고 (report_kind, report_id, seq)가 겹치지 않아 3번째 질문은 DB에서도 막힌다.
create table if not exists public.long_term_followups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_kind text not null check (report_kind in ('habit', 'condition')),
  report_id uuid not null,
  seq smallint not null check (seq between 1 and 2),
  question text not null check (char_length(question) between 1 and 300),
  answer text not null,
  created_at timestamptz not null default now(),
  unique (report_kind, report_id, seq)
);

comment on table public.long_term_followups is
  'v0.3.11 장기 분석 결과(habit_reports, condition_reports)에 대한 질문. 분석 1개당 2회. diet-ai longTermQuestion이 저장한다.';

create index if not exists long_term_followups_user_report_idx
  on public.long_term_followups (user_id, report_id);

alter table public.long_term_followups enable row level security;

drop policy if exists long_term_followups_select_own on public.long_term_followups;
create policy long_term_followups_select_own
  on public.long_term_followups for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists long_term_followups_insert_own on public.long_term_followups;
create policy long_term_followups_insert_own
  on public.long_term_followups for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on public.long_term_followups from anon, authenticated;
grant select, insert on public.long_term_followups to authenticated;
