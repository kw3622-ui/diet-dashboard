-- v0.4.0 되돌리기: 운영 화면을 v0.3.14로 먼저 되돌린 뒤 실행. 저장된 루틴과 체크가 모두 지워진다.
drop table if exists public.routine_checks;
drop table if exists public.routines;
alter table public.profiles drop column if exists show_routines;
