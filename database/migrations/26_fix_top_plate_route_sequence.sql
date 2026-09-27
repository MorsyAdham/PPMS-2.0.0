-- ═══════════════════════════════════════════════════════════════════
-- KD2 : Migration 26 — Fix TOP PLATE route_sequence mismatch
--
-- k9_turret_top_plate plan rows are split across two route_sequence
-- values, causing a duplicate VPX column:
--
--   route_sequence = 19  station_sequence_in_category = 12  → M5–M15 (11 rows)  ← stale
--   route_sequence = 23  station_sequence_in_category = 17  → M16–M18 (3 rows)  ← correct
--
-- Aligns M5–M15 to the correct values so all 14 vehicles share
-- the same VPX column.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.kd2_plan
SET route_sequence               = 23,
    station_sequence_in_category = 17
WHERE vehicle_type  = 'K9'
  AND station_code  = 'k9_turret_top_plate'
  AND route_sequence = 19;

COMMIT;
