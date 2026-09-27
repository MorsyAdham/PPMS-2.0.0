-- ═══════════════════════════════════════════════════════════════════
-- KD2 : Migration 23 — Move DEBURRING (TURRET) to Shot Blasting & Painting
--
-- k9_turret_deburring is in category 'machining' (seq=5).
-- It belongs in 'shot_blasting_painting'.
-- Existing kd2_plan blocks for this station also carry category_code
-- = 'machining' and must be updated to match.
--
-- Strategy: assign seq=99 in shot_blasting_painting (no shifting of
-- other stations required; display order is driven by route_sequence
-- anyway). category_sequence changes from 2 → 3 in plan rows.
--
-- Tables touched: kd2_process_stations, kd2_process_routes,
--                 kd2_process_lead_times, kd2_plan.
-- kd2_progress is NOT touched.
-- Safe to re-run (idempotent via WHERE guards).
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Station reference ──────────────────────────────────────────
UPDATE public.kd2_process_stations
SET category_code                = 'shot_blasting_painting',
    station_sequence_in_category = 99,
    route_sequence               = 30
WHERE vehicle_type = 'K9'
  AND station_code = 'k9_turret_deburring'
  AND category_code = 'machining';

-- ─── 2. Routes ────────────────────────────────────────────────────
UPDATE public.kd2_process_routes
SET category_code  = 'shot_blasting_painting',
    route_sequence = 30
WHERE vehicle_type = 'K9'
  AND station_code = 'k9_turret_deburring';

-- ─── 3. Lead times ────────────────────────────────────────────────
UPDATE public.kd2_process_lead_times
SET category_code = 'shot_blasting_painting'
WHERE vehicle_type = 'K9'
  AND station_code = 'k9_turret_deburring'
  AND category_code = 'machining';

-- ─── 4. Plan rows (the blocks already entered in the system) ──────
-- category_sequence: machining=2 → shot_blasting_painting=3
-- station_sequence_in_category: keep in sync with the station (99)
-- route_sequence: 30
UPDATE public.kd2_plan
SET category_code                = 'shot_blasting_painting',
    category_sequence            = 3,
    station_sequence_in_category = 99,
    route_sequence               = 30
WHERE vehicle_type  = 'K9'
  AND station_code  = 'k9_turret_deburring'
  AND category_code = 'machining';

COMMIT;
