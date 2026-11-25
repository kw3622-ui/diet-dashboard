-- v0.5.2 운동 장소 설정
-- 사용자마다 장소별로 할 수 있는 근력 종목(종목 사전 key 또는 'custom:이름')과 집 장비를 저장한다.
-- 형식: {"version":1,"company":[key...],"apartment":[key...],"homeEquipment":["pullup_bar"...],"setupDone":true,"updatedAt":"..."}
-- null이면 아직 설정하지 않은 것. 기존 profiles RLS(본인 행만 수정)가 그대로 적용된다.

alter table public.profiles add column if not exists workout_places jsonb;

alter table public.profiles drop constraint if exists profiles_workout_places_check;
alter table public.profiles add constraint profiles_workout_places_check check (
  workout_places is null
  or (jsonb_typeof(workout_places) = 'object' and pg_column_size(workout_places) <= 32768)
);

comment on column public.profiles.workout_places is 'v0.5.2 운동 장소 설정: {version, company[], apartment[], homeEquipment[], setupDone, updatedAt}. 종목은 exercise_library의 key 또는 custom:이름.';
