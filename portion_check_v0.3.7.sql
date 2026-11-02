-- v0.3.7: 여러 인분을 나눠 먹은 식단 기록의 본인 섭취량 확인
alter table public.logs add column if not exists portion_check jsonb;
comment on column public.logs.portion_check is 'v0.3.7 본인 섭취량 확인. {version, dishes:[함께 주문한 음식], share: 0.5|1|1.5|2|null}. null이면 확인할 필요 없는 기록. diet-ai 서버가 판단해 저장.';
