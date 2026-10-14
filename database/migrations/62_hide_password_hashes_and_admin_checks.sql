-- 62_hide_password_hashes_and_admin_checks.sql
--
-- Part A — hide password hashes from the public (anon) key.
--   Until now anyone with the public key could download every user's
--   password_hash. Sign-in and "change my password" now compare the hash
--   inside the database (functions below) and never return it; then the
--   public roles lose the right to READ the password_hash column. They can
--   still WRITE it (User Management sets passwords), and every other column
--   stays readable, so the live app keeps working.
--
--   ORDER MATTERS: deploy the app version that calls ppms_login /
--   ppms_check_password (v167+) BEFORE running this file. Older app versions
--   read password_hash directly and would stop signing in.
--
--   Applies to all modules (KD1, KD2, F100). This is a stop-gap: the full fix
--   (Supabase Auth + row-level security, SC-01) replaces it at cut-over.
--
-- Part B — read-only diagnostic queries for the local control panel.
--   ppms_admin_query(q) runs a SELECT and returns the rows as JSON. Only the
--   service_role (the panel's key, kept on the admin's PC) may call it, it is
--   called over GET so PostgREST runs it in a READ ONLY transaction, it is
--   STABLE (writes inside it are rejected) and it times out after 15 s.
--
-- Safe to re-run.

-- ── Part A ─────────────────────────────────────────────────────────────
create or replace function public.ppms_login(p_email text, p_password_hash text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select jsonb_build_object(
        'id', u.id, 'email', u.email, 'full_name', u.full_name, 'role', u.role,
        'is_active', u.is_active, 'modules', u.modules, 'can_export', u.can_export)
    from public.planning_app_users u
    where u.email = p_email and u.password_hash = p_password_hash
    limit 1;
$$;

create or replace function public.ppms_check_password(p_user_id text, p_password_hash text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.planning_app_users u
        where u.id::text = p_user_id and u.password_hash = p_password_hash);
$$;

revoke all on function public.ppms_login(text, text) from public;
revoke all on function public.ppms_check_password(text, text) from public;
grant execute on function public.ppms_login(text, text) to anon, authenticated;
grant execute on function public.ppms_check_password(text, text) to anon, authenticated;

-- Table-wide SELECT → SELECT on every column except password_hash.
-- NOTE: a column added to planning_app_users later must be granted here too.
do $$
declare
    cols text;
begin
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
      into cols
      from information_schema.columns
     where table_schema = 'public' and table_name = 'planning_app_users'
       and column_name <> 'password_hash';
    execute 'revoke select on public.planning_app_users from anon, authenticated';
    execute format('grant select (%s) on public.planning_app_users to anon, authenticated', cols);
end $$;

-- ── Part B ─────────────────────────────────────────────────────────────
create or replace function public.ppms_admin_query(q text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '15s'
as $$
declare
    result jsonb;
begin
    execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', q) into result;
    return result;
end;
$$;

revoke all on function public.ppms_admin_query(text) from public, anon, authenticated;
grant execute on function public.ppms_admin_query(text) to service_role;

-- PostgREST must see the new functions.
notify pgrst, 'reload schema';
