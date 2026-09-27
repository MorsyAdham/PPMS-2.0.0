-- ================================================================
-- Migration 34: Enable Supabase realtime on production_issues
--
-- Required so the app can receive live INSERT events and notify
-- other connected users when a new issue is reported.
-- ================================================================

alter publication supabase_realtime add table public.production_issues;
