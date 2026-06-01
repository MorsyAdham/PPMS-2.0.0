-- ═══════════════════════════════════════════════════════════════════
-- F100 – KD2  :  Add structured comments column to f100_plans
-- Run once in Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.f100_plans
    ADD COLUMN IF NOT EXISTS comments jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.f100_plans.comments IS
    'Array of {user, text, at} comment objects added by any user';
