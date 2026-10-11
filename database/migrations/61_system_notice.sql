-- 61_system_notice.sql
--
-- System notice / maintenance switch, set from the local control panel
-- (tools/control-panel). One row (id = 1):
--   active     — show the banner to every signed-in user
--   level      — info | warning | critical (banner colour)
--   message    — the banner text
--   read_only  — maintenance mode: every user except master_admin works as
--                a viewer until it is switched off
--
-- The app only READS this table. It is written by the control panel with
-- the service key, so there are no insert/update policies for the public
-- roles. Adding it changes nothing for the live app until the app code that
-- reads it is deployed, and the app ignores the table if it is missing.
--
-- Safe to re-run.
begin;

create table if not exists public.ppms_system_notice (
    id          smallint primary key default 1 check (id = 1),
    active      boolean not null default false,
    level       text not null default 'info' check (level in ('info', 'warning', 'critical')),
    message     text not null default '',
    read_only   boolean not null default false,
    updated_by  text,
    updated_at  timestamptz not null default timezone('utc', now())
);

insert into public.ppms_system_notice (id) values (1) on conflict (id) do nothing;

alter table public.ppms_system_notice enable row level security;

drop policy if exists ppms_system_notice_read on public.ppms_system_notice;
create policy ppms_system_notice_read on public.ppms_system_notice
    for select to anon, authenticated using (true);

revoke insert, update, delete on public.ppms_system_notice from anon, authenticated;
grant select on public.ppms_system_notice to anon, authenticated;

commit;

-- Live updates: the banner and read-only mode reach open sessions at once.
do $$
begin
    begin
        alter publication supabase_realtime add table public.ppms_system_notice;
    exception
        when duplicate_object then null;
        when undefined_object then null;
    end;
end $$;
