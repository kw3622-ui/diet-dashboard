-- v0.4.5 루틴 "복용 체크를 다 하면 자동 완료". 판단은 화면에서 한다(체크가 있으면 체크가 우선).
alter table public.routines add column if not exists link_intake boolean not null default false;
comment on column public.routines.link_intake is 'v0.4.5 복용 연결: 루틴 시간대(아침·점심·저녁·자기 전)의 등록 약·건강식품을 모두 체크하면 자동 완료. 다른 시간대는 그날 전체, 등록이 없으면 건강식품 기록이 있을 때.';
