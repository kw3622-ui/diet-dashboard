-- v0.4.4 되돌리기: 운영 화면과 서버를 v0.4.3 / diet-ai v0.0.18로 먼저 되돌린 뒤 실행.
-- 복용 등록·체크가 모두 지워진다. 사진·글로 남긴 건강식품 기록(category '건강식품')은 남고 포장 문구·AI 참고만 지워진다.
drop table if exists public.intake_checks;
drop table if exists public.intake_items;
alter table public.profiles drop column if exists intake_pharmacist_ack;
alter table public.logs drop column if exists supplement_info;
