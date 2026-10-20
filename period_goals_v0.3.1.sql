create table if not exists public.period_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_type text not null check (period_type in ('week', 'month')),
  period_start date not null,
  period_end date not null,
  status text not null default 'active' check (status in ('active', 'skipped')),
  exercise_target integer check (exercise_target is null or exercise_target between 0 and 200),
  alcohol_free_target integer check (alcohol_free_target is null or alcohol_free_target between 0 and 31),
  weight_target numeric(5,1) check (weight_target is null or weight_target between 20 and 400),
  bp_sys_target integer check (bp_sys_target is null or bp_sys_target between 60 and 300),
  bp_dia_target integer check (bp_dia_target is null or bp_dia_target between 30 and 200),
  sugar_target integer check (sugar_target is null or sugar_target between 40 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period_type, period_start),
  check (period_end >= period_start),
  constraint period_goals_range_shape_check check (
    (period_type = 'week' and extract(isodow from period_start) = 1 and period_end = period_start + 6)
    or
    (period_type = 'month' and period_start = date_trunc('month', period_start)::date
      and period_end = (date_trunc('month', period_start) + interval '1 month - 1 day')::date)
  ),
  constraint period_goals_status_values_check check (
    (status = 'active' and (
      exercise_target is not null or alcohol_free_target is not null or weight_target is not null
      or bp_sys_target is not null or bp_dia_target is not null or sugar_target is not null
    ))
    or (status = 'skipped' and (
      exercise_target is null and alcohol_free_target is null and weight_target is null
      and bp_sys_target is null and bp_dia_target is null and sugar_target is null
    ))
  )
);

create index if not exists period_goals_user_period_idx
  on public.period_goals (user_id, period_type, period_start desc);

alter table public.period_goals enable row level security;

drop policy if exists period_goals_select_own on public.period_goals;
create policy period_goals_select_own on public.period_goals
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists period_goals_insert_own on public.period_goals;
create policy period_goals_insert_own on public.period_goals
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists period_goals_update_own on public.period_goals;
create policy period_goals_update_own on public.period_goals
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists period_goals_delete_own on public.period_goals;
create policy period_goals_delete_own on public.period_goals
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.period_goals from authenticated;
grant select, insert, update, delete on table public.period_goals to authenticated;
revoke all on table public.period_goals from anon;

