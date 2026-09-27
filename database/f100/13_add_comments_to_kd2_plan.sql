-- ═══════════════════════════════════════════════════════════════════
-- F200 – KD2  :  Add structured comments column to kd2_plan
-- Run once in Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.kd2_plan
    ADD COLUMN IF NOT EXISTS comments jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.kd2_plan.comments IS
    'Array of {user, text, at} comment objects added by any user';
