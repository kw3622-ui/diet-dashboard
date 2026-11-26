-- v0.6.0 되돌리기: 운영 화면을 v0.5.6 이하로 먼저 되돌린 뒤 실행.
-- mini/slipped 기록은 예전 상태로 바꾼다(mini → done, slipped → 기록 지움). 버릴 습관·최소 버전·주간 점검은 지워진다.
update public.routine_checks set status = 'done' where status = 'mini';
delete from public.routine_checks where status = 'slipped' and note = '';
update public.routine_checks set status = 'progress' where status = 'slipped';
alter table public.routine_checks drop constraint if exists routine_checks_status_check;
alter table public.routine_checks add constraint routine_checks_status_check check (status in ('done', 'progress', 'skipped'));
alter table public.routine_checks drop column if exists bad_value;
alter table public.routines drop column if exists bad_habit;
alter table public.routines drop column if exists min_version;
drop table if exists public.habit_weekly_reviews;
