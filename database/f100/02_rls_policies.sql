-- ═══════════════════════════════════════════════════════════════════
-- F100 – KD2  :  Row Level Security policies
-- The app uses a custom auth system (planning_app_users table) and
-- the Supabase client runs as the `anon` role.  Access control is
-- enforced at the application layer, so policies allow anon full
-- access — mirroring the existing F200 KD2 table configuration.
-- Run after 01_create_tables.sql
-- ═══════════════════════════════════════════════════════════════════

-- Enable RLS on all F100 tables
ALTER TABLE public.f100_parts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.f100_processes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.f100_plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.f100_gun_assembly  ENABLE ROW LEVEL SECURITY;

-- ─── f100_parts ──────────────────────────────────────────────────
CREATE POLICY "f100_parts_select" ON public.f100_parts
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "f100_parts_insert" ON public.f100_parts
    FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "f100_parts_update" ON public.f100_parts
    FOR UPDATE TO anon, authenticated USING (true);

CREATE POLICY "f100_parts_delete" ON public.f100_parts
    FOR DELETE TO anon, authenticated USING (true);

-- ─── f100_processes ──────────────────────────────────────────────
CREATE POLICY "f100_processes_select" ON public.f100_processes
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "f100_processes_insert" ON public.f100_processes
    FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "f100_processes_update" ON public.f100_processes
    FOR UPDATE TO anon, authenticated USING (true);

CREATE POLICY "f100_processes_delete" ON public.f100_processes
    FOR DELETE TO anon, authenticated USING (true);

-- ─── f100_plans ──────────────────────────────────────────────────
CREATE POLICY "f100_plans_select" ON public.f100_plans
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "f100_plans_insert" ON public.f100_plans
    FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "f100_plans_update" ON public.f100_plans
    FOR UPDATE TO anon, authenticated USING (true);

CREATE POLICY "f100_plans_delete" ON public.f100_plans
    FOR DELETE TO anon, authenticated USING (true);

-- ─── f100_gun_assembly ───────────────────────────────────────────
CREATE POLICY "f100_gun_assembly_select" ON public.f100_gun_assembly
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "f100_gun_assembly_insert" ON public.f100_gun_assembly
    FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "f100_gun_assembly_update" ON public.f100_gun_assembly
    FOR UPDATE TO anon, authenticated USING (true);

CREATE POLICY "f100_gun_assembly_delete" ON public.f100_gun_assembly
    FOR DELETE TO anon, authenticated USING (true);
