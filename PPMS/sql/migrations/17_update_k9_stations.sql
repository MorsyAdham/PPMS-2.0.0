-- ═══════════════════════════════════════════════════════════════════
-- KD2 : Restructure K9 station names, work centers, and sequences
-- Run once in Supabase SQL editor  (run AFTER migrations 15 and 16)
--
-- What this migration does:
--   1. Temporarily shifts all K9 sequences by +1000 to allow safe
--      re-ordering without unique-constraint violations mid-transaction.
--   2. Updates station names and work centers to exact customer data.
--   3. Inserts new stations for parallel work centers (W11/W12,
--      W13/W14, W15/W16, W17/W18) and missing stations (PAINTING,
--      GUN BARREL SUB-Ass'y).
--   4. Sets removed/merged stations to is_active = false.
--   5. Assigns final station_sequence_in_category and route_sequence
--      for every K9 station.
--   6. Syncs kd2_process_routes and kd2_process_lead_times.
--   7. Seeds component_group on new stations (idempotent with mig 16).
--
-- SAFETY: Only station reference data is changed.
--         kd2_plan / kd2_progress rows are NOT touched.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Shift all K9 sequences by +1000 to avoid conflicts ────────
UPDATE public.kd2_process_stations
SET station_sequence_in_category = station_sequence_in_category + 1000,
    route_sequence               = route_sequence + 1000
WHERE vehicle_type = 'K9';


-- ─── 2. Update names and work centers ─────────────────────────────

-- HULL — WELDING
UPDATE public.kd2_process_stations SET station_name = 'FLOOR',             work_center = 'W05, W06'  WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_floor';
UPDATE public.kd2_process_stations SET station_name = 'LOWER HULL',        work_center = 'W07'       WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_lower_hull';
UPDATE public.kd2_process_stations SET station_name = 'LOWER HULL',        work_center = 'W08'       WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_lower_hull';
UPDATE public.kd2_process_stations SET station_name = 'UPPER HULL 1ST',    work_center = 'W20 ROBOT' WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_upper_hull_1st';
UPDATE public.kd2_process_stations SET station_name = 'UPPER HULL 2ND',    work_center = 'W21 ROBOT' WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_upper_hull_2nd';
UPDATE public.kd2_process_stations SET station_name = 'MARRIAGE 1ST',      work_center = 'W11'       WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_marriage_1st';
UPDATE public.kd2_process_stations SET station_name = 'MARRIAGE 2ND',      work_center = 'W13'       WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_marriage_2nd';
UPDATE public.kd2_process_stations SET station_name = 'STOWAGE 1ST',       work_center = 'W15'       WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_stowage_1st';
UPDATE public.kd2_process_stations SET station_name = 'STOWAGE 2ND',       work_center = 'W17'       WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_stowage_2nd';
UPDATE public.kd2_process_stations SET station_name = 'FINAL 1ST',         work_center = 'W19'       WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_final_weld_1st';
UPDATE public.kd2_process_stations SET station_name = 'FINAL 2ND WELDING', work_center = null        WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_final_weld_2nd';

-- HULL — MACHINING
UPDATE public.kd2_process_stations SET station_name = 'QUALIFYING / FORM MOLDING', work_center = null        WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_qualifying_form_mold';
UPDATE public.kd2_process_stations SET station_name = 'MACHINING 1ST/2ND',         work_center = 'M02 P/M'  WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_machining_1st';
UPDATE public.kd2_process_stations SET is_active = false WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_machining_2nd';

-- HULL — SHOT BLASTING / PAINTING
UPDATE public.kd2_process_stations SET station_name = 'DEBURRING',      work_center = null WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_deburring';
UPDATE public.kd2_process_stations SET station_name = 'STEAM CLEANING',  work_center = null WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_steam_cleaning';
UPDATE public.kd2_process_stations SET station_name = 'SHOT BLASTING',   work_center = null WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_shot_blasting';
UPDATE public.kd2_process_stations SET station_name = 'RE-TAPPING',      work_center = null WHERE vehicle_type = 'K9' AND station_code = 'k9_hull_painting_re_tapping';

-- TURRET — WELDING
UPDATE public.kd2_process_stations SET station_name = 'BOTTOM PLATE',      work_center = 'W24'       WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_bottom_plate';
UPDATE public.kd2_process_stations SET station_name = 'TOP PLATE',         work_center = 'W25'       WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_top_plate';
UPDATE public.kd2_process_stations SET station_name = 'MARRIAGE 1ST',      work_center = 'W22 ROBOT' WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_marriage_1st';
UPDATE public.kd2_process_stations SET station_name = 'MARRIAGE 2ND',      work_center = 'W23 ROBOT' WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_marriage_2nd';
UPDATE public.kd2_process_stations SET station_name = 'STOWAGE',           work_center = 'W28'       WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_stowage';
UPDATE public.kd2_process_stations SET station_name = 'FINAL 1ST WELDING', work_center = 'W27'       WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_final_weld_1st';
UPDATE public.kd2_process_stations SET station_name = 'FINAL 2ND WELDING', work_center = 'W29'       WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_final_weld_2nd';

-- TURRET — MACHINING
UPDATE public.kd2_process_stations SET station_name = 'QUALIFYING', work_center = null       WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_qualifying';
UPDATE public.kd2_process_stations SET station_name = 'MACHINING',  work_center = 'M01 P/M'  WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_machining';
UPDATE public.kd2_process_stations SET station_name = 'DEBURRING',  work_center = null        WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_deburring';

-- TURRET — SHOT BLASTING / PAINTING
UPDATE public.kd2_process_stations SET station_name = 'STEAM CLEANING', work_center = null WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_steam_cleaning';
UPDATE public.kd2_process_stations SET station_name = 'SHOT BLASTING',  work_center = null WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_shot_blasting';
UPDATE public.kd2_process_stations SET station_name = 'PAINTING',        work_center = null WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_painting';
UPDATE public.kd2_process_stations SET station_name = 'RE-TAPPING',      work_center = null WHERE vehicle_type = 'K9' AND station_code = 'k9_turret_re_tapping';

-- ASSEMBLY
UPDATE public.kd2_process_stations SET station_name = 'SUSPENSION & TRACK Ass''y', work_center = 'A1'  WHERE vehicle_type = 'K9' AND station_code = 'k9_assembly_suspension';
UPDATE public.kd2_process_stations SET station_name = 'ELECTRIC DEVICE',            work_center = 'A2'  WHERE vehicle_type = 'K9' AND station_code = 'k9_assembly_h_electric';
UPDATE public.kd2_process_stations SET station_name = 'INTERIOR',                   work_center = 'A3'  WHERE vehicle_type = 'K9' AND station_code = 'k9_assembly_interior';
UPDATE public.kd2_process_stations SET station_name = 'ENGINE',                     work_center = 'A4'  WHERE vehicle_type = 'K9' AND station_code = 'k9_assembly_engine';
UPDATE public.kd2_process_stations SET station_name = 'TURRET - AMMO RACK',         work_center = 'A8'  WHERE vehicle_type = 'K9' AND station_code = 'k9_assembly_turret';
UPDATE public.kd2_process_stations SET station_name = 'TURRET - DOOR/ELECTRIC',     work_center = 'A9'  WHERE vehicle_type = 'K9' AND station_code = 'k9_assembly_t_electric_turret';
UPDATE public.kd2_process_stations SET station_name = 'TURRET - HYDRAULIC DEVICE',  work_center = 'A10' WHERE vehicle_type = 'K9' AND station_code = 'k9_assembly_hyd_sub_turret';
UPDATE public.kd2_process_stations SET station_name = 'TURRET/GUN MARRIAGE',        work_center = 'A5'  WHERE vehicle_type = 'K9' AND station_code = 'k9_assembly_turret_gun';
UPDATE public.kd2_process_stations SET station_name = 'HYDRAULIC SYSTEM',           work_center = 'A6'  WHERE vehicle_type = 'K9' AND station_code = 'k9_assembly_hydraulic';
UPDATE public.kd2_process_stations SET station_name = 'BORE-SIGHTING',              work_center = 'A7'  WHERE vehicle_type = 'K9' AND station_code = 'k9_assembly_bore_sight';

-- PROCESSING
UPDATE public.kd2_process_stations SET is_active = false WHERE vehicle_type = 'K9' AND station_code = 'k9_processing_processing';
UPDATE public.kd2_process_stations SET station_name = 'Clean / DRY', work_center = 'P1' WHERE vehicle_type = 'K9' AND station_code = 'k9_processing_clean_dry';
UPDATE public.kd2_process_stations SET station_name = 'Masking',      work_center = 'P1' WHERE vehicle_type = 'K9' AND station_code = 'k9_processing_masking';
UPDATE public.kd2_process_stations SET station_name = 'Sanding',      work_center = 'P1' WHERE vehicle_type = 'K9' AND station_code = 'k9_processing_sanding';
UPDATE public.kd2_process_stations SET station_name = 'Painting',     work_center = 'P1' WHERE vehicle_type = 'K9' AND station_code = 'k9_processing_painting';
UPDATE public.kd2_process_stations SET station_name = 'Touch-up',     work_center = 'P1' WHERE vehicle_type = 'K9' AND station_code = 'k9_processing_touch_up';
UPDATE public.kd2_process_stations SET station_name = 'Attaching',    work_center = 'P1' WHERE vehicle_type = 'K9' AND station_code = 'k9_processing_attaching';

-- FINAL TEST
UPDATE public.kd2_process_stations SET station_name = '#1 INSPECTION',             work_center = 'G1' WHERE vehicle_type = 'K9' AND station_code = 'k9_final_test_1insp';
UPDATE public.kd2_process_stations SET station_name = 'TEST RUN',                  work_center = 'Q1' WHERE vehicle_type = 'K9' AND station_code = 'k9_final_test_test_run';
UPDATE public.kd2_process_stations SET station_name = 'ADJUSTMENT AND INSPECTION', work_center = 'G2' WHERE vehicle_type = 'K9' AND station_code = 'k9_final_test_performance_test';
UPDATE public.kd2_process_stations SET station_name = 'REPAIR / CHECK',            work_center = null WHERE vehicle_type = 'K9' AND station_code = 'k9_final_test_repair';
UPDATE public.kd2_process_stations SET station_name = 'FINAL CHECK',               work_center = 'P2' WHERE vehicle_type = 'K9' AND station_code = 'k9_final_test_final_check';
UPDATE public.kd2_process_stations SET is_active = false WHERE vehicle_type = 'K9' AND station_code IN ('k9_final_test_check', 'k9_final_test_powerpack_check');


-- ─── 3. Insert new stations ────────────────────────────────────────
-- Parallel hull welding work centers (W12, W14, W16, W18) and missing
-- hull painting step and gun barrel sub-assembly.

INSERT INTO public.kd2_process_stations
    (vehicle_type, category_code, station_code, station_name, work_center,
     station_sequence_in_category, route_sequence, notes)
VALUES
    ('K9','welding',              'k9_hull_marriage_1st_w12', 'MARRIAGE 1ST',          'W12',  6, 6,  'K9 hull – parallel W12'),
    ('K9','welding',              'k9_hull_marriage_2nd_w14', 'MARRIAGE 2ND',          'W14',  8, 8,  'K9 hull – parallel W14'),
    ('K9','welding',              'k9_hull_stowage_1st_w16',  'STOWAGE 1ST',           'W16', 10, 10, 'K9 hull – parallel W16'),
    ('K9','welding',              'k9_hull_stowage_2nd_w18',  'STOWAGE 2ND',           'W18', 12, 12, 'K9 hull – parallel W18'),
    ('K9','shot_blasting_painting','k9_hull_painting',         'PAINTING',              null,   4, 20, 'K9 hull painting step'),
    ('K9','assembly',             'k9_assembly_gun_barrel',   'GUN BARREL SUB-Ass''y', 'A11',  8, 43, 'K9 gun barrel sub-assembly')
ON CONFLICT (vehicle_type, station_code) DO UPDATE SET
    station_name               = excluded.station_name,
    work_center                = excluded.work_center,
    station_sequence_in_category = excluded.station_sequence_in_category,
    route_sequence             = excluded.route_sequence,
    is_active                  = true;


-- ─── 4. Assign final sequences ─────────────────────────────────────
-- Route sequence reflects the full process order:
--   Hull welding (1-13) → Hull machining (14-15) → Hull SBP (16-21)
--   → Turret welding (22-27) → Turret machining (28-30)
--   → Turret SBP (31-35) → Assembly (36-46)
--   → Final test (47-50) → Processing (51-56) → Final test (57)

-- HULL WELDING  (seq_in_cat 1-14 within 'welding' category)
UPDATE public.kd2_process_stations SET station_sequence_in_category =  1, route_sequence =  1 WHERE vehicle_type='K9' AND station_code='k9_hull_floor';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  2, route_sequence =  2 WHERE vehicle_type='K9' AND station_code='k9_hull_lower_hull';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  3, route_sequence =  3 WHERE vehicle_type='K9' AND station_code='k9_hull_upper_hull_1st';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  4, route_sequence =  4 WHERE vehicle_type='K9' AND station_code='k9_hull_upper_hull_2nd';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  5, route_sequence =  5 WHERE vehicle_type='K9' AND station_code='k9_hull_marriage_1st';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  6, route_sequence =  6 WHERE vehicle_type='K9' AND station_code='k9_hull_marriage_1st_w12';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  7, route_sequence =  7 WHERE vehicle_type='K9' AND station_code='k9_hull_marriage_2nd';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  8, route_sequence =  8 WHERE vehicle_type='K9' AND station_code='k9_hull_marriage_2nd_w14';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  9, route_sequence =  9 WHERE vehicle_type='K9' AND station_code='k9_hull_stowage_1st';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 10, route_sequence = 10 WHERE vehicle_type='K9' AND station_code='k9_hull_stowage_1st_w16';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 11, route_sequence = 11 WHERE vehicle_type='K9' AND station_code='k9_hull_stowage_2nd';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 12, route_sequence = 12 WHERE vehicle_type='K9' AND station_code='k9_hull_stowage_2nd_w18';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 13, route_sequence = 13 WHERE vehicle_type='K9' AND station_code='k9_hull_final_weld_1st';
-- Final Weld 2nd stays in 'welding' category but displays after machining/SBP steps
UPDATE public.kd2_process_stations SET station_sequence_in_category = 14, route_sequence = 18 WHERE vehicle_type='K9' AND station_code='k9_hull_final_weld_2nd';

-- HULL MACHINING  (seq_in_cat 1-2 within 'machining')
UPDATE public.kd2_process_stations SET station_sequence_in_category =  1, route_sequence = 14 WHERE vehicle_type='K9' AND station_code='k9_hull_qualifying_form_mold';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  2, route_sequence = 15 WHERE vehicle_type='K9' AND station_code='k9_hull_machining_1st';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 99, route_sequence =999 WHERE vehicle_type='K9' AND station_code='k9_hull_machining_2nd';

-- HULL SHOT BLASTING / PAINTING  (seq_in_cat 1-5 within 'shot_blasting_painting')
UPDATE public.kd2_process_stations SET station_sequence_in_category = 1, route_sequence = 16 WHERE vehicle_type='K9' AND station_code='k9_hull_deburring';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 2, route_sequence = 17 WHERE vehicle_type='K9' AND station_code='k9_hull_steam_cleaning';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 3, route_sequence = 19 WHERE vehicle_type='K9' AND station_code='k9_hull_shot_blasting';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 4, route_sequence = 20 WHERE vehicle_type='K9' AND station_code='k9_hull_painting';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 5, route_sequence = 21 WHERE vehicle_type='K9' AND station_code='k9_hull_painting_re_tapping';

-- TURRET WELDING  (seq_in_cat continues from hull: 15-21)
UPDATE public.kd2_process_stations SET station_sequence_in_category = 15, route_sequence = 22 WHERE vehicle_type='K9' AND station_code='k9_turret_bottom_plate';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 16, route_sequence = 23 WHERE vehicle_type='K9' AND station_code='k9_turret_top_plate';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 17, route_sequence = 24 WHERE vehicle_type='K9' AND station_code='k9_turret_marriage_1st';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 18, route_sequence = 25 WHERE vehicle_type='K9' AND station_code='k9_turret_marriage_2nd';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 19, route_sequence = 26 WHERE vehicle_type='K9' AND station_code='k9_turret_stowage';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 20, route_sequence = 27 WHERE vehicle_type='K9' AND station_code='k9_turret_final_weld_1st';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 21, route_sequence = 32 WHERE vehicle_type='K9' AND station_code='k9_turret_final_weld_2nd';

-- TURRET MACHINING  (seq_in_cat continues from hull: 3-5)
UPDATE public.kd2_process_stations SET station_sequence_in_category = 3, route_sequence = 28 WHERE vehicle_type='K9' AND station_code='k9_turret_qualifying';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 4, route_sequence = 29 WHERE vehicle_type='K9' AND station_code='k9_turret_machining';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 5, route_sequence = 30 WHERE vehicle_type='K9' AND station_code='k9_turret_deburring';

-- TURRET SHOT BLASTING / PAINTING  (seq_in_cat continues from hull: 6-9)
UPDATE public.kd2_process_stations SET station_sequence_in_category = 6, route_sequence = 31 WHERE vehicle_type='K9' AND station_code='k9_turret_steam_cleaning';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 7, route_sequence = 33 WHERE vehicle_type='K9' AND station_code='k9_turret_shot_blasting';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 8, route_sequence = 34 WHERE vehicle_type='K9' AND station_code='k9_turret_painting';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 9, route_sequence = 35 WHERE vehicle_type='K9' AND station_code='k9_turret_re_tapping';

-- ASSEMBLY  (seq_in_cat 1-11, route 36-46)
-- Order: A1 Suspension → A2 Electric → A3 Interior → A4 Engine →
--        A8 Turret sub-stations (3 + gun barrel) → A5 Turret/Gun →
--        A6 Hydraulic → A7 Bore-Sighting
UPDATE public.kd2_process_stations SET station_sequence_in_category =  1, route_sequence = 36 WHERE vehicle_type='K9' AND station_code='k9_assembly_suspension';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  2, route_sequence = 37 WHERE vehicle_type='K9' AND station_code='k9_assembly_h_electric';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  3, route_sequence = 38 WHERE vehicle_type='K9' AND station_code='k9_assembly_interior';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  4, route_sequence = 39 WHERE vehicle_type='K9' AND station_code='k9_assembly_engine';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  5, route_sequence = 40 WHERE vehicle_type='K9' AND station_code='k9_assembly_turret';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  6, route_sequence = 41 WHERE vehicle_type='K9' AND station_code='k9_assembly_t_electric_turret';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  7, route_sequence = 42 WHERE vehicle_type='K9' AND station_code='k9_assembly_hyd_sub_turret';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  8, route_sequence = 43 WHERE vehicle_type='K9' AND station_code='k9_assembly_gun_barrel';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  9, route_sequence = 44 WHERE vehicle_type='K9' AND station_code='k9_assembly_turret_gun';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 10, route_sequence = 45 WHERE vehicle_type='K9' AND station_code='k9_assembly_hydraulic';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 11, route_sequence = 46 WHERE vehicle_type='K9' AND station_code='k9_assembly_bore_sight';

-- FINAL TEST  (route 47-50, then 57; inactive pushed to high seq)
UPDATE public.kd2_process_stations SET station_sequence_in_category =  1, route_sequence =  47 WHERE vehicle_type='K9' AND station_code='k9_final_test_1insp';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  2, route_sequence =  48 WHERE vehicle_type='K9' AND station_code='k9_final_test_test_run';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  3, route_sequence =  49 WHERE vehicle_type='K9' AND station_code='k9_final_test_performance_test';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  4, route_sequence =  50 WHERE vehicle_type='K9' AND station_code='k9_final_test_repair';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 96, route_sequence = 996 WHERE vehicle_type='K9' AND station_code='k9_final_test_check';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 97, route_sequence = 997 WHERE vehicle_type='K9' AND station_code='k9_final_test_powerpack_check';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  5, route_sequence =  57 WHERE vehicle_type='K9' AND station_code='k9_final_test_final_check';

-- PROCESSING  (route 51-56; old 'Processing' station inactive)
UPDATE public.kd2_process_stations SET station_sequence_in_category = 99, route_sequence = 999 WHERE vehicle_type='K9' AND station_code='k9_processing_processing';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  1, route_sequence =  51 WHERE vehicle_type='K9' AND station_code='k9_processing_clean_dry';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  2, route_sequence =  52 WHERE vehicle_type='K9' AND station_code='k9_processing_masking';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  3, route_sequence =  53 WHERE vehicle_type='K9' AND station_code='k9_processing_sanding';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  4, route_sequence =  54 WHERE vehicle_type='K9' AND station_code='k9_processing_painting';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  5, route_sequence =  55 WHERE vehicle_type='K9' AND station_code='k9_processing_touch_up';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  6, route_sequence =  56 WHERE vehicle_type='K9' AND station_code='k9_processing_attaching';


-- ─── 5. Sync kd2_process_routes ───────────────────────────────────

-- Insert routes for the six new stations
INSERT INTO public.kd2_process_routes (vehicle_type, category_code, station_code, route_sequence)
SELECT vehicle_type, category_code, station_code, route_sequence
FROM public.kd2_process_stations
WHERE vehicle_type = 'K9'
  AND station_code IN (
      'k9_hull_marriage_1st_w12','k9_hull_marriage_2nd_w14',
      'k9_hull_stowage_1st_w16', 'k9_hull_stowage_2nd_w18',
      'k9_hull_painting',        'k9_assembly_gun_barrel')
ON CONFLICT (vehicle_type, station_code) DO UPDATE SET
    category_code  = excluded.category_code,
    route_sequence = excluded.route_sequence,
    is_active      = true;

-- Sync route_sequence and is_active for all existing K9 routes
UPDATE public.kd2_process_routes r
SET route_sequence = s.route_sequence,
    is_active      = s.is_active
FROM public.kd2_process_stations s
WHERE r.vehicle_type = s.vehicle_type
  AND r.station_code = s.station_code
  AND s.vehicle_type = 'K9';


-- ─── 6. Add lead-time rows for new stations ────────────────────────
INSERT INTO public.kd2_process_lead_times
    (vehicle_type, category_code, station_code, planning_level, lead_time_days, notes)
SELECT vehicle_type, category_code, station_code, 'station', null,
       'Pending business confirmation'
FROM public.kd2_process_stations
WHERE vehicle_type = 'K9'
  AND station_code IN (
      'k9_hull_marriage_1st_w12','k9_hull_marriage_2nd_w14',
      'k9_hull_stowage_1st_w16', 'k9_hull_stowage_2nd_w18',
      'k9_hull_painting',        'k9_assembly_gun_barrel')
ON CONFLICT (vehicle_type, category_code, station_code, planning_level) DO NOTHING;


-- ─── 7. Seed component_group for new K9 stations ──────────────────
-- Idempotent with migration 16 — only sets NULL rows so existing
-- values are not overwritten.
ALTER TABLE public.kd2_process_stations
    ADD COLUMN IF NOT EXISTS component_group text;

UPDATE public.kd2_process_stations
SET component_group = 'Hull'
WHERE vehicle_type = 'K9'
  AND station_code LIKE 'k9_hull_%'
  AND component_group IS NULL;

UPDATE public.kd2_process_stations
SET component_group = 'Turret'
WHERE vehicle_type = 'K9'
  AND station_code LIKE 'k9_turret_%'
  AND component_group IS NULL;

UPDATE public.kd2_process_stations
SET component_group = 'Assembly & Processing and Testing'
WHERE vehicle_type = 'K9'
  AND (   station_code LIKE 'k9_assembly_%'
       OR station_code LIKE 'k9_processing_%'
       OR station_code LIKE 'k9_final_test_%')
  AND component_group IS NULL;


COMMIT;
