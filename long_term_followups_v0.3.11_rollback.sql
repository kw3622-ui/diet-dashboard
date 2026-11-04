-- v0.3.11 되돌리기: Edge Function을 diet-ai_v0.0.15.ts로 먼저 되돌린 뒤 실행. 저장된 질문과 답변도 함께 지워진다.
drop table if exists public.long_term_followups;
