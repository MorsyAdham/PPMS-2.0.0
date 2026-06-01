-- ═══════════════════════════════════════════════════════════════════
-- KD2 : Migration 20 — Three fixes
--
--   1. LOWER HULL parallel W07 / W08
--      Add a second station entry k9_hull_lower_hull_w08 so both
--      lines appear as parallel Gantt lanes in one 'LOWER HULL' row
--      (same pattern as MARRIAGE 1ST W11/W12).
--
--   2. Component-group corrections for PAINTING stations
--      Ensure hull PAINTING → 'Hull', turret → 'Turret',
--      processing Painting → 'Assembly & Processing and Testing'.
--
--   3. Rename turret PAINTING to 'PAINTING (TURRET)'
--      Hull and turret both had station_name = 'PAINTING'; since the
--      Gantt groups by station_name, turret tasks merged into the Hull
--      section.  Distinct names put each in its own section.
--
-- Also repairs any stuck station_sequence_in_category values ≥ 100
-- left by a partial run of migration 17 (which used a +1000 temp
-- offset that was never restored for some stations).
--
-- SAFETY: Only kd2_process_stations and kd2_process_routes are
--         touched.  kd2_plan / kd2_progress are NOT modified.
--         kd2_plan_live derives process_station from station_name via
--         JOIN on station_code, so it auto-reflects the rename.
--
-- Run AFTER migrations 15–19.  Safe to re-run (idempotent).
-- NOTE: Skip migration 18 — this migration supersedes it.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Fix LOWER HULL W07 ──────────────────────────────────────────

UPDATE public.kd2_process_stations
SET work_center = 'W07'
WHERE vehicle_type = 'K9'
  AND station_code = 'k9_hull_lower_hull';

-- ─── 2. Re-seed ALL K9 welding station_sequence_in_category ─────────
--        This also repairs any 1000+ stuck values from a partial
--        migration 17 run.
--
--        Strategy:
--          a) Park every K9 welding station at current_seq + 10000
--             (guaranteed not to conflict even if some are at 1000+)
--          b) Insert / upsert k9_hull_lower_hull_w08 at seq = 3
--          c) Set every other station to its correct final seq
--             (1,2,4,5,…,22 — W08 occupies 3)

-- Step 2a: park at +10000
UPDATE public.kd2_process_stations
SET station_sequence_in_category = station_sequence_in_category + 10000
WHERE vehicle_type = 'K9'
  AND category_code = 'welding';

-- Step 2b: insert / upsert parallel W08 station at seq 3, route_seq 2
INSERT INTO public.kd2_process_stations
    (vehicle_type, category_code, station_code, station_name, work_center,
     station_sequence_in_category, route_sequence, component_group, notes)
VALUES
    ('K9', 'welding', 'k9_hull_lower_hull_w08', 'LOWER HULL', 'W08',
     3, 2, 'Hull', 'K9 hull – parallel W08 lower hull line')
ON CONFLICT (vehicle_type, station_code) DO UPDATE SET
    station_name                 = excluded.station_name,
    work_center                  = excluded.work_center,
    station_sequence_in_category = excluded.station_sequence_in_category,
    route_sequence               = excluded.route_sequence,
    component_group              = excluded.component_group,
    is_active                    = true;

-- Step 2c: restore every K9 welding station to its correct seq
--          (slots 1–2 = LOWER HULL W07/W08, 3 = W08 already set above,
--           existing stations shift by +1 to make room for W08)
UPDATE public.kd2_process_stations SET station_sequence_in_category =  1 WHERE vehicle_type='K9' AND station_code='k9_hull_floor';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  2 WHERE vehicle_type='K9' AND station_code='k9_hull_lower_hull';
-- seq 3 = k9_hull_lower_hull_w08 (already set in step 2b)
UPDATE public.kd2_process_stations SET station_sequence_in_category =  4 WHERE vehicle_type='K9' AND station_code='k9_hull_upper_hull_1st';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  5 WHERE vehicle_type='K9' AND station_code='k9_hull_upper_hull_2nd';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  6 WHERE vehicle_type='K9' AND station_code='k9_hull_marriage_1st';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  7 WHERE vehicle_type='K9' AND station_code='k9_hull_marriage_1st_w12';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  8 WHERE vehicle_type='K9' AND station_code='k9_hull_marriage_2nd';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  9 WHERE vehicle_type='K9' AND station_code='k9_hull_marriage_2nd_w14';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 10 WHERE vehicle_type='K9' AND station_code='k9_hull_stowage_1st';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 11 WHERE vehicle_type='K9' AND station_code='k9_hull_stowage_1st_w16';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 12 WHERE vehicle_type='K9' AND station_code='k9_hull_stowage_2nd';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 13 WHERE vehicle_type='K9' AND station_code='k9_hull_stowage_2nd_w18';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 14 WHERE vehicle_type='K9' AND station_code='k9_hull_final_weld_1st';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 15 WHERE vehicle_type='K9' AND station_code='k9_hull_final_weld_2nd';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 16 WHERE vehicle_type='K9' AND station_code='k9_turret_bottom_plate';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 17 WHERE vehicle_type='K9' AND station_code='k9_turret_top_plate';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 18 WHERE vehicle_type='K9' AND station_code='k9_turret_marriage_1st';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 19 WHERE vehicle_type='K9' AND station_code='k9_turret_marriage_2nd';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 20 WHERE vehicle_type='K9' AND station_code='k9_turret_stowage';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 21 WHERE vehicle_type='K9' AND station_code='k9_turret_final_weld_1st';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 22 WHERE vehicle_type='K9' AND station_code='k9_turret_final_weld_2nd';

-- ─── 3. Route entry for new station ────────────────────────────────

INSERT INTO public.kd2_process_routes (vehicle_type, category_code, station_code, route_sequence)
SELECT vehicle_type, category_code, station_code, route_sequence
FROM public.kd2_process_stations
WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_lower_hull_w08'
ON CONFLICT (vehicle_type, station_code) DO UPDATE SET
    category_code  = excluded.category_code,
    route_sequence = excluded.route_sequence,
    is_active      = true;

-- ─── 4. Lead-time row for new station ──────────────────────────────

INSERT INTO public.kd2_process_lead_times
    (vehicle_type, category_code, station_code, planning_level, lead_time_days, notes)
SELECT vehicle_type, category_code, station_code, 'station', null,
       'Pending business confirmation'
FROM public.kd2_process_stations
WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_lower_hull_w08'
ON CONFLICT (vehicle_type, category_code, station_code, planning_level) DO NOTHING;

-- ─── 5. Rename turret PAINTING → 'PAINTING (TURRET)' ───────────────

UPDATE public.kd2_process_stations
SET station_name = 'PAINTING (TURRET)'
WHERE vehicle_type = 'K9'
  AND station_code = 'k9_turret_painting';

-- ─── 6. Re-seed component_group for all painting stations ──────────

UPDATE public.kd2_process_stations
SET component_group = 'Hull'
WHERE vehicle_type = 'K9'
  AND station_code IN ('k9_hull_painting', 'k9_hull_lower_hull_w08');

UPDATE public.kd2_process_stations
SET component_group = 'Turret'
WHERE vehicle_type = 'K9'
  AND station_code = 'k9_turret_painting';

UPDATE public.kd2_process_stations
SET component_group = 'Assembly & Processing and Testing'
WHERE vehicle_type = 'K9'
  AND station_code = 'k9_processing_painting';

-- ─── 7. Sync kd2_process_routes for all changed stations ───────────

UPDATE public.kd2_process_routes r
SET route_sequence = s.route_sequence,
    is_active      = s.is_active
FROM public.kd2_process_stations s
WHERE r.vehicle_type = s.vehicle_type
  AND r.station_code = s.station_code
  AND s.vehicle_type = 'K9'
  AND s.station_code IN (
      'k9_hull_lower_hull',
      'k9_hull_lower_hull_w08',
      'k9_hull_painting',
      'k9_turret_painting',
      'k9_processing_painting'
  );

COMMIT;
