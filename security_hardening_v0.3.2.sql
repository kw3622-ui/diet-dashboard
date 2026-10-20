begin;

-- Browser clients never need direct anonymous access to application tables.
revoke all on table public.profiles, public.logs, public.daily_reports,
  public.period_reports, public.condition_reports, public.food_health_tags,
  public.meal_statuses, public.period_goals, public.rpg_profiles,
  public.rpg_inventory, public.rpg_events from anon;

-- Remove privileges that are unnecessary for the authenticated web client and
-- are not protected by row-level policies in the same way as normal row DML.
revoke truncate, references, trigger on table public.profiles, public.logs,
  public.daily_reports, public.period_reports, public.condition_reports,
  public.food_health_tags, public.meal_statuses, public.period_goals,
  public.rpg_profiles, public.rpg_inventory, public.rpg_events from authenticated;

-- Keep only operations used by the application. Row ownership is still
-- enforced by the RLS policies below.
revoke all on table public.profiles, public.logs, public.daily_reports,
  public.period_reports, public.condition_reports, public.food_health_tags,
  public.meal_statuses, public.period_goals, public.rpg_profiles,
  public.rpg_inventory, public.rpg_events from authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.logs to authenticated;
grant select, insert, update on table public.daily_reports, public.period_reports to authenticated;
grant select, insert on table public.condition_reports to authenticated;
grant select, insert, update, delete on table public.food_health_tags,
  public.meal_statuses, public.period_goals, public.rpg_profiles,
  public.rpg_inventory, public.rpg_events to authenticated;

-- SECURITY DEFINER helpers must never inherit PostgreSQL's default PUBLIC
-- execute grant. Only signed-in users can call them; both functions also check
-- the caller's auth.uid()/admin state internally.
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.admin_user_activity_stats() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_user_activity_stats() to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (select auth.uid()) is not null
    and coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false);
$$;

create or replace function public.admin_user_activity_stats()
returns table(
  user_id uuid,
  total_logs bigint,
  active_days_7d bigint,
  active_days_30d bigint,
  last_log_date date,
  last_log_category text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    l.user_id,
    count(*) as total_logs,
    count(distinct l.log_date) filter (where l.log_date >= (current_date - interval '7 days')) as active_days_7d,
    count(distinct l.log_date) filter (where l.log_date >= (current_date - interval '30 days')) as active_days_30d,
    max(l.log_date) as last_log_date,
    (array_agg(l.category order by l.log_date desc, l.log_time desc))[1] as last_log_category
  from public.logs l
  where (select auth.uid()) is not null and public.is_admin()
  group by l.user_id;
$$;

-- Prevent a direct API update from changing identity, creation time, admin
-- status, or a user's own approval status. Admins may still approve another
-- member through the existing management screen.
create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if (select auth.uid()) is not null then
    if new.id is distinct from old.id
       or new.created_at is distinct from old.created_at
       or new.is_admin is distinct from old.is_admin then
      raise exception 'Protected profile fields cannot be changed.' using errcode = '42501';
    end if;

    if old.id = (select auth.uid()) then
      if new.is_approved is distinct from old.is_approved then
        raise exception 'Users cannot change their own approval state.' using errcode = '42501';
      end if;
    elsif not public.is_admin() then
      raise exception 'Only administrators can update another profile.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_profile_security_fields() from public, anon, authenticated;
drop trigger if exists protect_profile_security_fields_before_update on public.profiles;
create trigger protect_profile_security_fields_before_update
before update on public.profiles
for each row execute function public.protect_profile_security_fields();

-- Restrict legacy PUBLIC-targeted policies to signed-in users and add the
-- missing UPDATE ownership checks.
alter policy "본인 기록만 삭제" on public.logs to authenticated;
alter policy "본인 기록만 수정" on public.logs to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "본인 기록만 조회" on public.logs to authenticated;
alter policy "본인 기록만 추가" on public.logs to authenticated;

alter policy "본인 하루평가만 수정" on public.daily_reports to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "본인 하루평가만 조회" on public.daily_reports to authenticated;
alter policy "본인 하루평가만 추가" on public.daily_reports to authenticated;

alter policy "본인 기간리포트만 수정" on public.period_reports to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "본인 기간리포트만 조회" on public.period_reports to authenticated;
alter policy "본인 기간리포트만 추가" on public.period_reports to authenticated;

alter policy condition_reports_insert_own on public.condition_reports to authenticated;
alter policy condition_reports_select_own on public.condition_reports to authenticated;

alter policy "본인 프로필 생성" on public.profiles to authenticated
  with check ((select auth.uid()) = id and is_admin = false and is_approved = false);
alter policy "본인 프로필만 조회" on public.profiles to authenticated;
alter policy "본인 프로필만 수정" on public.profiles to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
alter policy "관리자는 전체 프로필 조회" on public.profiles to authenticated;
alter policy "관리자는 전체 프로필 승인수정" on public.profiles to authenticated
  using (public.is_admin())
  with check (public.is_admin());

commit;
