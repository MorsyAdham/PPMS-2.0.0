-- 63_commands.sql
--
-- PPMS Commands: instructions sent to people inside PPMS.
-- A Master Admin or Planner writes a command and tags people with @ (one
-- person, a role group or @all). Each tagged person gets their own status
-- row (new → seen → ack → done) and can reply.
--
--   ppms_commands            one row per command (the text and options)
--   ppms_command_recipients  one row per person per command (their status)
--   ppms_command_replies     replies under a command
--
-- Applies to all modules (KD1, KD2, F100). Like the other PPMS tables until
-- the SC-01 security rebuild, these are read and written by the app with the
-- public key — do not put confidential content in commands.
--
-- Safe to re-run. Nothing existing is changed.
begin;

create table if not exists public.ppms_commands (
    id            bigint generated always as identity primary key,
    sender_id     text not null,
    sender_name   text,
    sender_email  text,
    body          text not null check (length(body) between 1 and 2000),
    parts         jsonb not null default '[]'::jsonb,   -- text + @tags, for display
    mentions      text[] not null default '{}',         -- what was typed: all / planners / user handles
    priority      text not null default 'normal' check (priority in ('normal', 'urgent')),
    due_date      date,
    about         text check (about is null or length(about) <= 200),
    created_at    timestamptz not null default timezone('utc', now())
);

create table if not exists public.ppms_command_recipients (
    command_id  bigint not null references public.ppms_commands(id) on delete cascade,
    user_id     text not null,
    user_name   text,
    user_email  text,
    status      text not null default 'new' check (status in ('new', 'seen', 'ack', 'done')),
    seen_at     timestamptz,
    ack_at      timestamptz,
    done_at     timestamptz,
    updated_at  timestamptz not null default timezone('utc', now()),
    primary key (command_id, user_id)
);
create index if not exists idx_ppms_command_recipients_user on public.ppms_command_recipients(user_id, status);

create table if not exists public.ppms_command_replies (
    id          bigint generated always as identity primary key,
    command_id  bigint not null references public.ppms_commands(id) on delete cascade,
    user_id     text not null,
    user_name   text,
    body        text not null check (length(body) between 1 and 1000),
    created_at  timestamptz not null default timezone('utc', now())
);
create index if not exists idx_ppms_command_replies_command on public.ppms_command_replies(command_id);

grant select, insert, update on public.ppms_commands, public.ppms_command_recipients, public.ppms_command_replies to anon, authenticated;
grant delete on public.ppms_commands to anon, authenticated;

commit;

-- Live delivery: new commands, status changes and replies reach open sessions at once.
do $$
declare t text;
begin
    foreach t in array array['ppms_commands', 'ppms_command_recipients', 'ppms_command_replies'] loop
        begin
            execute format('alter publication supabase_realtime add table public.%I', t);
        exception
            when duplicate_object then null;
            when undefined_object then null;
        end;
    end loop;
end $$;

notify pgrst, 'reload schema';
