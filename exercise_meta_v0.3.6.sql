-- v0.3.6: 운동 기록의 종류(근력/유산소/유연성)와 부위·세부 부위 분류를 저장한다.
-- 기존 logs 테이블의 RLS(본인 기록만 조회/추가/수정/삭제)와 테이블 권한이 그대로 적용된다.
-- 형식: {"version":1,"items":[{"name":"인클라인 덤벨 프레스","kind":"strength","targets":["chest.upper_chest"],"source":"dict","minutes":null}]}

alter table public.logs add column if not exists exercise_meta jsonb;

comment on column public.logs.exercise_meta is
  'v0.3.6 운동 분류. category=운동 기록에만 사용. null이면 아직 분류되지 않은 기록.';

-- 미분류 운동 기록을 빠르게 찾기 위한 부분 인덱스
create index if not exists logs_unclassified_exercise_idx
  on public.logs (user_id)
  where category = '운동' and exercise_meta is null;
