-- diet-dashboard v0.0.9
-- 실제 식사 기록(logs)과 사용자가 명시한 결식 상태를 분리해 보관한다.

create table if not exists public.meal_statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status_date date not null,
  meal_slot text not null check (meal_slot in ('breakfast', 'lunch', 'dinner')),
  status text not null default 'skipped' check (status = 'skipped'),
  confirmed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, status_date, meal_slot)
);

comment on table public.meal_statuses is
  '아침·점심·저녁의 명시적 안 먹음 상태. 행이 없으면 미기록이며 실제 섭취 기록은 logs에만 저장한다.';

create index if not exists meal_statuses_user_date_idx
  on public.meal_statuses (user_id, status_date);

alter table public.meal_statuses enable row level security;

drop policy if exists "Users can read own meal statuses" on public.meal_statuses;
create policy "Users can read own meal statuses"
  on public.meal_statuses for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own meal statuses" on public.meal_statuses;
create policy "Users can insert own meal statuses"
  on public.meal_statuses for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own meal statuses" on public.meal_statuses;
create policy "Users can update own meal statuses"
  on public.meal_statuses for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own meal statuses" on public.meal_statuses;
create policy "Users can delete own meal statuses"
  on public.meal_statuses for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.meal_statuses from anon;
grant select, insert, update, delete on table public.meal_statuses to authenticated;
grant select, insert, update, delete on table public.meal_statuses to service_role;

