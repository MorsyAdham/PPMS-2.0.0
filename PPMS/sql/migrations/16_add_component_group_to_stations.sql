-- ═══════════════════════════════════════════════════════════════════
-- KD2  :  Add component_group to kd2_process_stations
-- Run once in Supabase SQL editor (run AFTER migration 15)
--
-- Migration 15 added component_group at the CATEGORY level, but that
-- was too coarse — for K9, both Hull and Turret stations share the
-- same category codes (welding, machining, shot_blasting_painting).
-- The correct granularity is the STATION level.
--
-- This migration:
--   1. Adds component_group to kd2_process_stations
--   2. Seeds K9 stations using station_code prefix patterns:
--        k9_hull_*    → 'Hull'
--        k9_turret_*  → 'Turret'
--        k9_assembly_* | k9_processing_* | k9_final_test_*
--                     → 'Assembly & Processing and Testing'
--   3. Leaves K10 / K11 as NULL  (no component separator in Gantt)
--
-- The category-level column from migration 15 is left in place but
-- is no longer used by the application code.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.kd2_process_stations
    ADD COLUMN IF NOT EXISTS component_group text;

COMMENT ON COLUMN public.kd2_process_stations.component_group IS
    'High-level component group shown as a visual separator in the '
    'process-view Gantt and schedule export. '
    'NULL = no separator for this vehicle / station combination. '
    'Currently only populated for K9 (Hull / Turret / Assembly & Processing and Testing).';

-- ── Seed K9 Hull stations ─────────────────────────────────────────
UPDATE public.kd2_process_stations
SET component_group = 'Hull'
WHERE vehicle_type = 'K9'
  AND station_code LIKE 'k9_hull_%';

-- ── Seed K9 Turret stations ───────────────────────────────────────
UPDATE public.kd2_process_stations
SET component_group = 'Turret'
WHERE vehicle_type = 'K9'
  AND station_code LIKE 'k9_turret_%';

-- ── Seed K9 Assembly + Processing + Final Test stations ───────────
-- Hull and Turret come together here to complete the K9.
UPDATE public.kd2_process_stations
SET component_group = 'Assembly & Processing and Testing'
WHERE vehicle_type = 'K9'
  AND (
      station_code LIKE 'k9_assembly_%'
   OR station_code LIKE 'k9_processing_%'
   OR station_code LIKE 'k9_final_test_%'
  );

-- K10 and K11 keep component_group = NULL (no separator in Gantt).
