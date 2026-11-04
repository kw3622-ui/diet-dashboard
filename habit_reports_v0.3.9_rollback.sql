-- v0.3.9 되돌리기: Edge Function을 diet-ai_v0.0.13.ts로 먼저 되돌린 뒤 실행. 저장된 습관 분석 이력도 함께 지워진다.
drop table if exists public.habit_reports;
