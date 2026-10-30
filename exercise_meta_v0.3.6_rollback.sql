-- v0.3.6 되돌리기: 운동 분류 컬럼과 인덱스를 제거한다. 기존 기록 내용에는 영향이 없다.
drop index if exists public.logs_unclassified_exercise_idx;
alter table public.logs drop column if exists exercise_meta;
