-- ═══════════════════════════════════════════════════════════════════
-- F100 – KD2  :  Battalions & Vehicle Units tables
-- Separate from F200 kd2_battalions / kd2_vehicle_units.
-- Run after 01_create_tables.sql
-- ═══════════════════════════════════════════════════════════════════

-- ─── f100_battalions ─────────────────────────────────────────────
-- One row per F100 battalion.  Codes are independent of F200 codes.
CREATE TABLE IF NOT EXISTS public.f100_battalions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    battalion_code  text NOT NULL UNIQUE,
    battalion_name  text,
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.f100_battalions IS
    'F100-KD2 battalions — independent of F200 kd2_battalions';

-- ─── f100_vehicle_units ──────────────────────────────────────────
-- One row per physical vehicle unit within each battalion.
-- Standard allocation per battalion: 18 × K9, 3 × K10, 4 × K11.
-- Populate via admin panel (Phase 7) or direct insert.
CREATE TABLE IF NOT EXISTS public.f100_vehicle_units (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    battalion_id    uuid NOT NULL REFERENCES public.f100_battalions(id) ON DELETE CASCADE,
    vehicle_type    text NOT NULL CHECK (vehicle_type IN ('K9', 'K10', 'K11')),
    unit_serial     int  NOT NULL CHECK (unit_serial > 0),
    unit_label      text,          -- e.g. 'K9-01' — auto-generate or set manually
    UNIQUE (battalion_id, vehicle_type, unit_serial)
);

COMMENT ON TABLE public.f100_vehicle_units IS
    'Physical vehicle units per F100 battalion (18 K9 + 3 K10 + 4 K11 each)';

-- ─── Link f100_plans → f100_battalions ───────────────────────────
-- Add FK so battalion_code in plans must be a known F100 battalion.
ALTER TABLE public.f100_plans
    ADD CONSTRAINT fk_f100_plans_battalion
    FOREIGN KEY (battalion_code) REFERENCES public.f100_battalions(battalion_code)
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- ─── Indexes ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_f100_battalions_code
    ON public.f100_battalions(battalion_code);

CREATE INDEX IF NOT EXISTS idx_f100_vehicle_units_battalion
    ON public.f100_vehicle_units(battalion_id);

CREATE INDEX IF NOT EXISTS idx_f100_vehicle_units_type
    ON public.f100_vehicle_units(battalion_id, vehicle_type);

-- ─── RLS — same open pattern as other F100 tables ────────────────
ALTER TABLE public.f100_battalions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.f100_vehicle_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "f100_battalions_select" ON public.f100_battalions
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "f100_battalions_insert" ON public.f100_battalions
    FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "f100_battalions_update" ON public.f100_battalions
    FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "f100_battalions_delete" ON public.f100_battalions
    FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "f100_vehicle_units_select" ON public.f100_vehicle_units
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "f100_vehicle_units_insert" ON public.f100_vehicle_units
    FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "f100_vehicle_units_update" ON public.f100_vehicle_units
    FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "f100_vehicle_units_delete" ON public.f100_vehicle_units
    FOR DELETE TO anon, authenticated USING (true);
