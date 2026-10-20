begin;

grant all on table public.profiles, public.logs, public.daily_reports,
  public.period_reports, public.condition_reports, public.food_health_tags,
  public.meal_statuses, public.rpg_profiles, public.rpg_inventory,
  public.rpg_events to anon, authenticated;
revoke all on table public.period_goals from anon;
grant select, insert, update, delete on table public.period_goals to authenticated;

grant execute on function public.is_admin() to public, anon, authenticated;
grant execute on function public.admin_user_activity_stats() to public, anon, authenticated;

drop trigger if exists protect_profile_security_fields_before_update on public.profiles;
drop function if exists public.protect_profile_security_fields();

alter policy "본인 기록만 삭제" on public.logs to public;
alter policy "본인 기록만 조회" on public.logs to public;
alter policy "본인 기록만 추가" on public.logs to public;
drop policy if exists "본인 기록만 수정" on public.logs;
create policy "본인 기록만 수정" on public.logs for update to public
  using ((select auth.uid()) = user_id);

alter policy "본인 하루평가만 조회" on public.daily_reports to public;
alter policy "본인 하루평가만 추가" on public.daily_reports to public;
drop policy if exists "본인 하루평가만 수정" on public.daily_reports;
create policy "본인 하루평가만 수정" on public.daily_reports for update to public
  using ((select auth.uid()) = user_id);

alter policy "본인 기간리포트만 조회" on public.period_reports to public;
alter policy "본인 기간리포트만 추가" on public.period_reports to public;
drop policy if exists "본인 기간리포트만 수정" on public.period_reports;
create policy "본인 기간리포트만 수정" on public.period_reports for update to public
  using ((select auth.uid()) = user_id);

alter policy condition_reports_insert_own on public.condition_reports to public;
alter policy condition_reports_select_own on public.condition_reports to public;

drop policy if exists "본인 프로필 생성" on public.profiles;
create policy "본인 프로필 생성" on public.profiles for insert to public
  with check ((select auth.uid()) = id);
alter policy "본인 프로필만 조회" on public.profiles to public;
drop policy if exists "본인 프로필만 수정" on public.profiles;
create policy "본인 프로필만 수정" on public.profiles for update to public
  using ((select auth.uid()) = id);
alter policy "관리자는 전체 프로필 조회" on public.profiles to public;
drop policy if exists "관리자는 전체 프로필 승인수정" on public.profiles;
create policy "관리자는 전체 프로필 승인수정" on public.profiles for update to public
  using (public.is_admin());

commit;
