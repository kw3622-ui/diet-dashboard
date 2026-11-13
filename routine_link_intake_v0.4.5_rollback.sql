-- v0.4.5 되돌리기: 운영 화면을 v0.4.4 이하로 먼저 되돌린 뒤 실행.
alter table public.routines drop column if exists link_intake;
