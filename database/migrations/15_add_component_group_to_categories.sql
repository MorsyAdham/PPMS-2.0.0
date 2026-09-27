-- ═══════════════════════════════════════════════════════════════════
-- KD2  :  Add component_group to kd2_process_categories
-- Run once in Supabase SQL editor
--
-- Adds a nullable text column that labels each process category with
-- the high-level physical component it belongs to (e.g. "Hull",
-- "Turret", "Hull - Assembly", "Turret Assembly",
-- "Processing and Testing").
--
-- Only K9 rows are seeded — K10 / K11 remain NULL so no component
-- separator is shown for those vehicles in the Gantt / export.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.kd2_process_categories
    ADD COLUMN IF NOT EXISTS component_group text;

COMMENT ON COLUMN public.kd2_process_categories.component_group IS
    'High-level component group shown as a visual separator in the '
    'process-view Gantt and schedule export. '
    'NULL = no separator for this vehicle / category combination. '
    'Currently only populated for K9.';

-- ── Seed K9 component groups ─────────────────────────────────────
UPDATE public.kd2_process_categories
SET component_group = CASE category_code
    WHEN 'welding'                THEN 'Hull'
    WHEN 'machining'              THEN 'Turret'
    WHEN 'shot_blasting_painting' THEN 'Hull - Assembly'
    WHEN 'assembly'               THEN 'Turret Assembly'
    WHEN 'processing'             THEN 'Processing and Testing'
    WHEN 'final_test'             THEN 'Processing and Testing'
    ELSE NULL
END
WHERE vehicle_type = 'K9';

-- K10 and K11 keep component_group = NULL (no separator in Gantt).
