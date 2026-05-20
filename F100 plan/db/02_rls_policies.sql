-- ═══════════════════════════════════════════════════════════════════
-- F100 – KD2  :  Row Level Security policies
-- Mirrors the pattern used on F200 KD2 tables
-- Run after 01_create_tables.sql
-- ═══════════════════════════════════════════════════════════════════

-- Enable RLS on all F100 tables
ALTER TABLE public.f100_parts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.f100_processes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.f100_plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.f100_gun_assembly  ENABLE ROW LEVEL SECURITY;

-- ─── f100_parts ──────────────────────────────────────────────────
-- Authenticated users can read all parts
CREATE POLICY "f100_parts_select" ON public.f100_parts
    FOR SELECT TO authenticated USING (true);

-- Only admin+ can insert / update / delete parts
CREATE POLICY "f100_parts_insert" ON public.f100_parts
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_id = auth.uid()
              AND role IN ('admin', 'master_admin')
        )
    );

CREATE POLICY "f100_parts_update" ON public.f100_parts
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_id = auth.uid()
              AND role IN ('admin', 'master_admin')
        )
    );

CREATE POLICY "f100_parts_delete" ON public.f100_parts
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_id = auth.uid()
              AND role IN ('admin', 'master_admin')
        )
    );

-- ─── f100_processes ──────────────────────────────────────────────
CREATE POLICY "f100_processes_select" ON public.f100_processes
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "f100_processes_insert" ON public.f100_processes
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_id = auth.uid()
              AND role IN ('admin', 'master_admin')
        )
    );

CREATE POLICY "f100_processes_update" ON public.f100_processes
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_id = auth.uid()
              AND role IN ('admin', 'master_admin')
        )
    );

CREATE POLICY "f100_processes_delete" ON public.f100_processes
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_id = auth.uid()
              AND role IN ('admin', 'master_admin')
        )
    );

-- ─── f100_plans ──────────────────────────────────────────────────
-- All authenticated users can read plans
CREATE POLICY "f100_plans_select" ON public.f100_plans
    FOR SELECT TO authenticated USING (true);

-- Admin+ can write plans
CREATE POLICY "f100_plans_insert" ON public.f100_plans
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_id = auth.uid()
              AND role IN ('admin', 'master_admin')
        )
    );

CREATE POLICY "f100_plans_update" ON public.f100_plans
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_id = auth.uid()
              AND role IN ('admin', 'master_admin')
        )
    );

CREATE POLICY "f100_plans_delete" ON public.f100_plans
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_id = auth.uid()
              AND role IN ('admin', 'master_admin')
        )
    );

-- ─── f100_gun_assembly ───────────────────────────────────────────
CREATE POLICY "f100_gun_assembly_select" ON public.f100_gun_assembly
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "f100_gun_assembly_insert" ON public.f100_gun_assembly
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_id = auth.uid()
              AND role IN ('admin', 'master_admin')
        )
    );

CREATE POLICY "f100_gun_assembly_update" ON public.f100_gun_assembly
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_id = auth.uid()
              AND role IN ('admin', 'master_admin')
        )
    );

CREATE POLICY "f100_gun_assembly_delete" ON public.f100_gun_assembly
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_id = auth.uid()
              AND role IN ('admin', 'master_admin')
        )
    );
