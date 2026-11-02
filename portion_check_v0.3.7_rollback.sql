-- v0.3.7 되돌리기: Edge Function을 diet-ai_v0.0.11.ts로 먼저 되돌린 뒤 실행
alter table public.logs drop column if exists portion_check;
