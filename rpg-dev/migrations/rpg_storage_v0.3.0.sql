begin;

create table if not exists public.rpg_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  character_gender text not null default 'male' check (character_gender in ('male','female')),
  level integer not null default 1 check (level between 1 and 99),
  xp integer not null default 0 check (xp >= 0),
  hp integer not null default 100 check (hp between 0 and 100),
  growth_stage integer not null default 1 check (growth_stage between 1 and 5),
  good_momentum integer not null default 0 check (good_momentum between 0 and 7),
  caution_momentum integer not null default 0 check (caution_momentum between 0 and 7),
  rules_version text not null default 'rpg-v0.3.0',
  last_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rpg_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null,
  item_level integer not null default 1 check (item_level between 1 and 5),
  durability integer not null default 100 check (durability between 0 and 100),
  equipped boolean not null default true,
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, item_key)
);

create table if not exists public.food_health_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_id uuid not null references public.logs(id) on delete cascade,
  food_index smallint not null default 0 check (food_index >= 0),
  food_name text not null,
  tag_key text not null,
  tag_label text not null,
  disease_key text not null default 'general',
  polarity text not null check (polarity in ('helpful','caution','neutral')),
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  source text not null default 'ai' check (source in ('ai','rule','manual')),
  evidence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (log_id, food_index, tag_key, disease_key)
);

create table if not exists public.rpg_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_id uuid references public.logs(id) on delete cascade,
  event_date date not null default current_date,
  event_type text not null,
  rule_key text not null,
  delta jsonb not null default '{}'::jsonb,
  summary text,
  rules_version text not null default 'rpg-v0.3.0',
  created_at timestamptz not null default now()
);

create index if not exists rpg_inventory_user_id_idx on public.rpg_inventory(user_id);
create index if not exists food_health_tags_user_log_idx on public.food_health_tags(user_id, log_id);
create index if not exists food_health_tags_user_disease_idx on public.food_health_tags(user_id, disease_key, polarity);
create index if not exists rpg_events_user_date_idx on public.rpg_events(user_id, event_date desc);
create index if not exists rpg_events_log_id_idx on public.rpg_events(log_id);

alter table public.rpg_profiles enable row level security;
alter table public.rpg_inventory enable row level security;
alter table public.food_health_tags enable row level security;
alter table public.rpg_events enable row level security;

drop policy if exists "rpg_profiles_select_own" on public.rpg_profiles;
drop policy if exists "rpg_profiles_insert_own" on public.rpg_profiles;
drop policy if exists "rpg_profiles_update_own" on public.rpg_profiles;
drop policy if exists "rpg_profiles_delete_own" on public.rpg_profiles;
create policy "rpg_profiles_select_own" on public.rpg_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "rpg_profiles_insert_own" on public.rpg_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "rpg_profiles_update_own" on public.rpg_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "rpg_profiles_delete_own" on public.rpg_profiles for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "rpg_inventory_select_own" on public.rpg_inventory;
drop policy if exists "rpg_inventory_insert_own" on public.rpg_inventory;
drop policy if exists "rpg_inventory_update_own" on public.rpg_inventory;
drop policy if exists "rpg_inventory_delete_own" on public.rpg_inventory;
create policy "rpg_inventory_select_own" on public.rpg_inventory for select to authenticated using ((select auth.uid()) = user_id);
create policy "rpg_inventory_insert_own" on public.rpg_inventory for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "rpg_inventory_update_own" on public.rpg_inventory for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "rpg_inventory_delete_own" on public.rpg_inventory for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "food_health_tags_select_own" on public.food_health_tags;
drop policy if exists "food_health_tags_insert_own" on public.food_health_tags;
drop policy if exists "food_health_tags_update_own" on public.food_health_tags;
drop policy if exists "food_health_tags_delete_own" on public.food_health_tags;
create policy "food_health_tags_select_own" on public.food_health_tags for select to authenticated using ((select auth.uid()) = user_id);
create policy "food_health_tags_insert_own" on public.food_health_tags for insert to authenticated with check (
  (select auth.uid()) = user_id and exists (select 1 from public.logs l where l.id = log_id and l.user_id = (select auth.uid()))
);
create policy "food_health_tags_update_own" on public.food_health_tags for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.logs l where l.id = log_id and l.user_id = (select auth.uid())));
create policy "food_health_tags_delete_own" on public.food_health_tags for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "rpg_events_select_own" on public.rpg_events;
drop policy if exists "rpg_events_insert_own" on public.rpg_events;
drop policy if exists "rpg_events_delete_own" on public.rpg_events;
create policy "rpg_events_select_own" on public.rpg_events for select to authenticated using ((select auth.uid()) = user_id);
create policy "rpg_events_insert_own" on public.rpg_events for insert to authenticated with check (
  (select auth.uid()) = user_id and (log_id is null or exists (select 1 from public.logs l where l.id = log_id and l.user_id = (select auth.uid())))
);
create policy "rpg_events_delete_own" on public.rpg_events for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.rpg_profiles, public.rpg_inventory, public.food_health_tags, public.rpg_events from anon;
grant select, insert, update, delete on public.rpg_profiles, public.rpg_inventory, public.food_health_tags, public.rpg_events to authenticated;

comment on table public.rpg_profiles is '건강 수호자 RPG의 사용자별 현재 상태와 계산 스냅샷';
comment on table public.rpg_inventory is '사용자별 RPG 장비 등급, 내구도와 착용 상태';
comment on table public.food_health_tags is '식사 기록의 음식 하나하나에 연결된 질환별 도움/주의 태그';
comment on table public.rpg_events is '고정된 게임 규칙으로 계산된 보너스, 피해, 회복 등의 감사 기록';

commit;

