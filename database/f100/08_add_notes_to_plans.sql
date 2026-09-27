-- ═══════════════════════════════════════════════════════════════════
-- F100 – KD2  :  Add notes column to f100_plans
-- Run once in Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.f100_plans
    ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.f100_plans.notes IS
    'Free-text remarks / completion notes for this plan entry';
