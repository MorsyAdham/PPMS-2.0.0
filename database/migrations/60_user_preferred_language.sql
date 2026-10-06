-- 60 · Interface language per user
-- Stores each user's chosen interface language (English, Korean, Arabic) so it
-- follows them to any device. Additive only: older app versions ignore it, and
-- the app keeps working (language saved in the browser) until this has run.

alter table public.planning_app_users
    add column if not exists preferred_language text
    check (preferred_language in ('en', 'ko', 'ar'));

comment on column public.planning_app_users.preferred_language is
    'Interface language: en | ko | ar (null = English / the browser''s last choice)';
