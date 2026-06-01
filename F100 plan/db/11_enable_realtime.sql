-- ═══════════════════════════════════════════════════════════════════
-- F100 – KD2  :  Enable Supabase Realtime for f100_plans
-- Run once in Supabase SQL editor
--
-- Without this, the browser client's postgres_changes subscription
-- never fires and other users only see changes on manual refresh.
-- ═══════════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE public.f100_plans;
