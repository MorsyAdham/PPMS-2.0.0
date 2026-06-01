-- ═══════════════════════════════════════════════════════════════════
-- KD2 : Migration 21 — Unique station names + FLOOR W06 parallel
--
--   1. RENAME all three PAINTING stations to unique names:
--        k9_hull_painting      → 'PAINTING (HULL)'
--        k9_turret_painting    → 'PAINTING (TURRET)'
--        k9_processing_painting→ 'PAINTING (PROCESSING)'
--      Hull painting was appearing in the Assembly section because its
--      component_group was wrong.  The rename and force-set (step 3)
--      together fix both the name conflict and the section placement.
--
--   2. RENAME all other turret stations that share a name with hull.
--      Each gets a '(TURRET)' suffix:
--      MARRIAGE 1ST, MARRIAGE 2ND, FINAL 2ND WELDING,
--      DEBURRING, STEAM CLEANING, SHOT BLASTING, RE-TAPPING.
--
--   3. FORCE-SET component_group for ALL K9 stations (removes any
--      incorrect values set by earlier partial migrations):
--        k9_hull_*     → 'Hull'
--        k9_turret_*   → 'Turret'
--        k9_assembly_* / k9_processing_* / k9_final_test_* →
--                         'Assembly & Processing and Testing'
--
--   4. Add FLOOR W06 parallel station (k9_hull_floor_w06).
--      Splits k9_hull_floor from 'W05, W06' combined to 'W05' only,
--      and adds k9_hull_floor_w06 with work_center='W06'.
--      Both share station_name='FLOOR' so they pack into parallel
--      sub-lanes in the Gantt (same pattern as MARRIAGE W11/W12).
--
--   5. Also fixes LOWER HULL W07 (idempotent) and inserts
--      k9_hull_lower_hull_w08 if missing (supersedes migration 20).
--
--   6. Re-seeds all K9 welding station_sequence_in_category values.
--      Uses +10000 park to avoid any unique-constraint conflicts.
--
-- SAFETY: Only kd2_process_stations, kd2_process_routes, and
--         kd2_process_lead_times are touched.
--         kd2_plan / kd2_progress are NOT modified.
--         kd2_plan_live derives process_station via JOIN on station_code,
--         so all station_name changes auto-reflect in the live view.
--
-- Run AFTER migrations 15–19.  Safe to re-run (idempotent).
-- Supersedes migration 20 — you do NOT need to run migration 20
-- separately if you run this migration.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Rename all three PAINTING stations to unique names ─────────
--        All three previously had 'PAINTING' or 'Painting' causing
--        hull painting to appear under Assembly in the process view.

UPDATE public.kd2_process_stations SET station_name = 'PAINTING (HULL)'
  WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_painting';

UPDATE public.kd2_process_stations SET station_name = 'PAINTING (TURRET)'
  WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_painting';

UPDATE public.kd2_process_stations SET station_name = 'PAINTING (PROCESSING)'
  WHERE vehicle_type = 'K9' AND station_code = 'k9_processing_painting';

-- ─── 2. Rename turret stations that duplicate hull names ───────────
--        (TURRET) suffix makes them distinct in the Gantt process view

UPDATE public.kd2_process_stations SET station_name = 'MARRIAGE 1ST (TURRET)'      WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_marriage_1st';
UPDATE public.kd2_process_stations SET station_name = 'MARRIAGE 2ND (TURRET)'      WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_marriage_2nd';
UPDATE public.kd2_process_stations SET station_name = 'FINAL 2ND WELDING (TURRET)' WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_final_weld_2nd';
UPDATE public.kd2_process_stations SET station_name = 'DEBURRING (TURRET)'         WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_deburring';
UPDATE public.kd2_process_stations SET station_name = 'STEAM CLEANING (TURRET)'    WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_steam_cleaning';
UPDATE public.kd2_process_stations SET station_name = 'SHOT BLASTING (TURRET)'     WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_shot_blasting';
UPDATE public.kd2_process_stations SET station_name = 'RE-TAPPING (TURRET)'        WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_re_tapping';

-- ─── 3. Force-set all K9 component_groups (unconditional) ─────────
--        Overrides any incorrect value from earlier partial migrations.

UPDATE public.kd2_process_stations
SET component_group = 'Hull'
WHERE vehicle_type = 'K9' AND station_code LIKE 'k9_hull_%';

UPDATE public.kd2_process_stations
SET component_group = 'Turret'
WHERE vehicle_type = 'K9' AND station_code LIKE 'k9_turret_%';

UPDATE public.kd2_process_stations
SET component_group = 'Assembly & Processing and Testing'
WHERE vehicle_type = 'K9'
  AND (   station_code LIKE 'k9_assembly_%'
       OR station_code LIKE 'k9_processing_%'
       OR station_code LIKE 'k9_final_test_%');

-- ─── 4. Fix LOWER HULL W07 work center ────────────────────────────
UPDATE public.kd2_process_stations
SET work_center = 'W07'
WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_lower_hull';

-- ─── 5. Fix FLOOR: split 'W05, W06' into two parallel stations ────
UPDATE public.kd2_process_stations
SET work_center = 'W05'
WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_floor';

-- ─── 6. Park all K9 welding sequences at +10000 ───────────────────
--        Clears any stuck 1000+ values and frees all sequence slots
--        for a clean re-seed in step 8.

UPDATE public.kd2_process_stations
SET station_sequence_in_category = station_sequence_in_category + 10000
WHERE vehicle_type = 'K9' AND category_code = 'welding';

-- ─── 7. Insert / upsert both new parallel stations ────────────────

-- FLOOR W06  (seq=2, route=1 — parallel with FLOOR W05 at route=1)
INSERT INTO public.kd2_process_stations
    (vehicle_type, category_code, station_code, station_name, work_center,
     station_sequence_in_category, route_sequence, component_group, notes)
VALUES
    ('K9', 'welding', 'k9_hull_floor_w06', 'FLOOR', 'W06',
     2, 1, 'Hull', 'K9 hull – parallel W06 floor line')
ON CONFLICT (vehicle_type, station_code) DO UPDATE SET
    station_name                 = excluded.station_name,
    work_center                  = excluded.work_center,
    station_sequence_in_category = excluded.station_sequence_in_category,
    route_sequence               = excluded.route_sequence,
    component_group              = excluded.component_group,
    is_active                    = true;

-- LOWER HULL W08  (seq=4, route=2 — parallel with LOWER HULL W07 at route=2)
INSERT INTO public.kd2_process_stations
    (vehicle_type, category_code, station_code, station_name, work_center,
     station_sequence_in_category, route_sequence, component_group, notes)
VALUES
    ('K9', 'welding', 'k9_hull_lower_hull_w08', 'LOWER HULL', 'W08',
     4, 2, 'Hull', 'K9 hull – parallel W08 lower hull line')
ON CONFLICT (vehicle_type, station_code) DO UPDATE SET
    station_name                 = excluded.station_name,
    work_center                  = excluded.work_center,
    station_sequence_in_category = excluded.station_sequence_in_category,
    route_sequence               = excluded.route_sequence,
    component_group              = excluded.component_group,
    is_active                    = true;

-- ─── 8. Restore all K9 welding station_sequence_in_category ────────
--        Full list of 25 welding stations (hull + turret).
--        Parallel pairs occupy adjacent slots.

-- Hull – FLOOR
UPDATE public.kd2_process_stations SET station_sequence_in_category =  1 WHERE vehicle_type='K9' AND station_code='k9_hull_floor';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  2 WHERE vehicle_type='K9' AND station_code='k9_hull_floor_w06';
-- Hull – LOWER HULL
UPDATE public.kd2_process_stations SET station_sequence_in_category =  3 WHERE vehicle_type='K9' AND station_code='k9_hull_lower_hull';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  4 WHERE vehicle_type='K9' AND station_code='k9_hull_lower_hull_w08';
-- Hull – UPPER HULL
UPDATE public.kd2_process_stations SET station_sequence_in_category =  5 WHERE vehicle_type='K9' AND station_code='k9_hull_upper_hull_1st';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  6 WHERE vehicle_type='K9' AND station_code='k9_hull_upper_hull_2nd';
-- Hull – MARRIAGE
UPDATE public.kd2_process_stations SET station_sequence_in_category =  7 WHERE vehicle_type='K9' AND station_code='k9_hull_marriage_1st';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  8 WHERE vehicle_type='K9' AND station_code='k9_hull_marriage_1st_w12';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  9 WHERE vehicle_type='K9' AND station_code='k9_hull_marriage_2nd';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 10 WHERE vehicle_type='K9' AND station_code='k9_hull_marriage_2nd_w14';
-- Hull – STOWAGE
UPDATE public.kd2_process_stations SET station_sequence_in_category = 11 WHERE vehicle_type='K9' AND station_code='k9_hull_stowage_1st';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 12 WHERE vehicle_type='K9' AND station_code='k9_hull_stowage_1st_w16';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 13 WHERE vehicle_type='K9' AND station_code='k9_hull_stowage_2nd';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 14 WHERE vehicle_type='K9' AND station_code='k9_hull_stowage_2nd_w18';
-- Hull – FINAL WELD
UPDATE public.kd2_process_stations SET station_sequence_in_category = 15 WHERE vehicle_type='K9' AND station_code='k9_hull_final_weld_1st';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 16 WHERE vehicle_type='K9' AND station_code='k9_hull_final_weld_2nd';
-- Turret – WELDING
UPDATE public.kd2_process_stations SET station_sequence_in_category = 17 WHERE vehicle_type='K9' AND station_code='k9_turret_bottom_plate';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 18 WHERE vehicle_type='K9' AND station_code='k9_turret_top_plate';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 19 WHERE vehicle_type='K9' AND station_code='k9_turret_marriage_1st';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 20 WHERE vehicle_type='K9' AND station_code='k9_turret_marriage_2nd';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 21 WHERE vehicle_type='K9' AND station_code='k9_turret_stowage';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 22 WHERE vehicle_type='K9' AND station_code='k9_turret_final_weld_1st';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 23 WHERE vehicle_type='K9' AND station_code='k9_turret_final_weld_2nd';

-- ─── 9. Sync kd2_process_routes ───────────────────────────────────

-- Ensure route entries exist for the two new stations
INSERT INTO public.kd2_process_routes (vehicle_type, category_code, station_code, route_sequence)
SELECT vehicle_type, category_code, station_code, route_sequence
FROM public.kd2_process_stations
WHERE vehicle_type = 'K9'
  AND station_code IN ('k9_hull_floor_w06', 'k9_hull_lower_hull_w08')
ON CONFLICT (vehicle_type, station_code) DO UPDATE SET
    category_code  = excluded.category_code,
    route_sequence = excluded.route_sequence,
    is_active      = true;

-- Sync route_sequence for all K9 welding routes
UPDATE public.kd2_process_routes r
SET route_sequence = s.route_sequence,
    is_active      = s.is_active
FROM public.kd2_process_stations s
WHERE r.vehicle_type = s.vehicle_type
  AND r.station_code = s.station_code
  AND s.vehicle_type = 'K9'
  AND s.category_code = 'welding';

-- ─── 10. Lead-time rows for new stations ──────────────────────────

INSERT INTO public.kd2_process_lead_times
    (vehicle_type, category_code, station_code, planning_level, lead_time_days, notes)
SELECT vehicle_type, category_code, station_code, 'station', null,
       'Pending business confirmation'
FROM public.kd2_process_stations
WHERE vehicle_type = 'K9'
  AND station_code IN ('k9_hull_floor_w06', 'k9_hull_lower_hull_w08')
ON CONFLICT (vehicle_type, category_code, station_code, planning_level) DO NOTHING;

COMMIT;
