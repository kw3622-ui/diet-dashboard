-- v0.5.2 운동 장소 설정 되돌리기: 저장된 장소 설정도 함께 지워진다.
alter table public.profiles drop constraint if exists profiles_workout_places_check;
alter table public.profiles drop column if exists workout_places;
