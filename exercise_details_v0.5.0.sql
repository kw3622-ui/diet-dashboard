-- v0.5.0: 예전 운동 기록의 세트·유산소 숫자 읽기(diet-ai v0.0.21 readExerciseDetails) 전에 exercise_meta를 백업한다.
-- 테이블 구조는 바뀌지 않는다. exercise_meta(jsonb)에 version 2 값(sets, distanceKm, paceSecPerKm, avgHeartRate,
-- detailVersion, detailSource)이 더해질 뿐이고, 예전 화면은 새 값을 무시하고 그대로 동작한다.
-- 백업 테이블은 서버 관리자(service role)만 읽을 수 있다.

create table if not exists public.exercise_meta_backup_v050 (
  log_id uuid primary key,
  user_id uuid not null,
  exercise_meta jsonb,
  backed_up_at timestamptz not null default now()
);

comment on table public.exercise_meta_backup_v050 is
  'v0.5.0 세트·유산소 숫자 읽기 전 운동 기록 exercise_meta 백업. 되돌리기(exercise_details_v0.5.0_rollback.sql)에 쓴다.';

alter table public.exercise_meta_backup_v050 enable row level security;
revoke all on public.exercise_meta_backup_v050 from anon, authenticated;

insert into public.exercise_meta_backup_v050 (log_id, user_id, exercise_meta)
select id, user_id, exercise_meta
from public.logs
where category = '운동'
on conflict (log_id) do nothing;
