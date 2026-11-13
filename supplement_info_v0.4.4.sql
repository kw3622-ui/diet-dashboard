-- v0.4.4 건강식품·장기 복용약
-- 1) 사진·글로 기록한 건강식품(logs.category = '건강식품')의 포장 표시 기능성(labelClaim)과 AI 참고(aiNote).
-- 2) 복용 관리: 오래 먹는 건강식품·약을 등록(intake_items)하고 날짜·시간대별로 체크(intake_checks). 체크에는 AI를 쓰지 않는다.
--    약(kind = 'medicine')은 AI 설명·팁·궁합이 없고 AI 리포트에도 보내지 않는다(화면에서 지킴).

alter table public.logs add column if not exists supplement_info jsonb;
comment on column public.logs.supplement_info is 'v0.4.4 건강식품 기록 전용: {version, labelClaim(포장 문구 그대로), fromImage, aiNote(AI 참고)}. 다른 종류는 null.';

create table if not exists public.intake_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('supplement', 'medicine')),
  name text not null check (char_length(name) between 1 and 60),
  dose text not null default '' check (char_length(dose) <= 40),
  times text[] not null default '{morning}' check (cardinality(times) between 1 and 4 and times <@ array['morning', 'lunch', 'evening', 'bedtime']::text[]),
  note text not null default '' check (char_length(note) <= 100),
  start_date date not null default current_date,
  end_date date,
  stopped_at timestamptz,
  label_claim text not null default '' check (char_length(label_claim) <= 150),
  ai_note text not null default '' check (char_length(ai_note) <= 400),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check (kind = 'supplement' or (label_claim = '' and ai_note = ''))
);
comment on table public.intake_items is 'v0.4.4 오래 먹는 건강식품(supplement)·약(medicine) 등록. 본인 것만. 약에는 AI 설명을 저장하지 않는다.';

create table if not exists public.intake_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.intake_items(id) on delete cascade,
  check_date date not null,
  slot text not null check (slot in ('morning', 'lunch', 'evening', 'bedtime')),
  taken_time time,
  created_at timestamptz not null default now(),
  unique (item_id, check_date, slot)
);
comment on table public.intake_checks is 'v0.4.4 복용 체크(날짜·시간대마다 한 줄). 체크를 풀면 줄을 지운다.';

create index if not exists intake_items_user_idx on public.intake_items (user_id, kind, sort_order);
create index if not exists intake_checks_user_date_idx on public.intake_checks (user_id, check_date);

alter table public.intake_items enable row level security;
alter table public.intake_checks enable row level security;

drop policy if exists intake_items_select_own on public.intake_items;
create policy intake_items_select_own on public.intake_items for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists intake_items_insert_own on public.intake_items;
create policy intake_items_insert_own on public.intake_items for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists intake_items_update_own on public.intake_items;
create policy intake_items_update_own on public.intake_items for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists intake_items_delete_own on public.intake_items;
create policy intake_items_delete_own on public.intake_items for delete to authenticated
  using ((select auth.uid()) = user_id);

-- 체크는 본인 등록 항목에만 달 수 있다.
drop policy if exists intake_checks_select_own on public.intake_checks;
create policy intake_checks_select_own on public.intake_checks for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists intake_checks_insert_own on public.intake_checks;
create policy intake_checks_insert_own on public.intake_checks for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.intake_items i where i.id = item_id and i.user_id = (select auth.uid())));
drop policy if exists intake_checks_update_own on public.intake_checks;
create policy intake_checks_update_own on public.intake_checks for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.intake_items i where i.id = item_id and i.user_id = (select auth.uid())));
drop policy if exists intake_checks_delete_own on public.intake_checks;
create policy intake_checks_delete_own on public.intake_checks for delete to authenticated
  using ((select auth.uid()) = user_id);

-- 약과 건강식품을 함께 등록했을 때 "약사와 확인" 안내를 한 번 보고 닫았는지.
alter table public.profiles add column if not exists intake_pharmacist_ack boolean not null default false;
comment on column public.profiles.intake_pharmacist_ack is 'v0.4.4 약+건강식품 함께 등록 시 약사 확인 안내를 닫음.';

revoke all on public.intake_items, public.intake_checks from anon, authenticated;
grant select, insert, update, delete on public.intake_items, public.intake_checks to authenticated;
