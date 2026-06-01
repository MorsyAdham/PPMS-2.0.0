-- ═══════════════════════════════════════════════════════════════════
-- KD2 : Lock the exact display order for K9 Assembly, Processing
--       and Testing stations in both the Gantt and the export.
--
-- Safe to run standalone (before or after migration 17).
-- Idempotent — sets final route_sequence values; running twice is OK.
--
-- Desired order (route_seq 36 → 57):
--   Assembly    36  SUSPENSION & TRACK Ass'y  A1
--               37  ELECTRIC DEVICE           A2
--               38  INTERIOR                  A3
--               39  ENGINE                    A4
--               40  TURRET - AMMO RACK        A8
--               41  TURRET - DOOR/ELECTRIC    A9
--               42  TURRET - HYDRAULIC DEVICE A10
--               43  GUN BARREL SUB-Ass'y      A11
--               44  TURRET/GUN MARRIAGE       A5
--               45  HYDRAULIC SYSTEM          A6
--               46  BORE-SIGHTING             A7
--   Final test  47  #1 INSPECTION             G1
--               48  TEST RUN                  Q1
--               49  ADJUSTMENT AND INSPECTION G2
--               50  REPAIR / CHECK
--   Processing  51  Clean / DRY               P1
--               52  Masking                   P1
--               53  Sanding                   P1
--               54  Painting                  P1
--               55  Touch-up                  P1
--               56  Attaching                 P1
--   Final test  57  FINAL CHECK               P2
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Step 1: Park affected stations at safe temp route values ──────
-- Avoids any unique-index conflict on route_sequence (none exists, but
-- also safe for station_sequence_in_category which is unique within
-- category). We shift only the three affected category codes.
UPDATE public.kd2_process_stations
SET route_sequence               = route_sequence + 5000,
    station_sequence_in_category = station_sequence_in_category + 500
WHERE vehicle_type = 'K9'
  AND category_code IN ('assembly', 'processing', 'final_test');

-- ─── Step 2: Assembly (category_code = 'assembly') ────────────────
UPDATE public.kd2_process_stations SET station_sequence_in_category =  1, route_sequence =  36 WHERE vehicle_type='K9' AND station_code='k9_assembly_suspension';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  2, route_sequence =  37 WHERE vehicle_type='K9' AND station_code='k9_assembly_h_electric';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  3, route_sequence =  38 WHERE vehicle_type='K9' AND station_code='k9_assembly_interior';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  4, route_sequence =  39 WHERE vehicle_type='K9' AND station_code='k9_assembly_engine';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  5, route_sequence =  40 WHERE vehicle_type='K9' AND station_code='k9_assembly_turret';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  6, route_sequence =  41 WHERE vehicle_type='K9' AND station_code='k9_assembly_t_electric_turret';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  7, route_sequence =  42 WHERE vehicle_type='K9' AND station_code='k9_assembly_hyd_sub_turret';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  8, route_sequence =  43 WHERE vehicle_type='K9' AND station_code='k9_assembly_gun_barrel';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  9, route_sequence =  44 WHERE vehicle_type='K9' AND station_code='k9_assembly_turret_gun';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 10, route_sequence =  45 WHERE vehicle_type='K9' AND station_code='k9_assembly_hydraulic';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 11, route_sequence =  46 WHERE vehicle_type='K9' AND station_code='k9_assembly_bore_sight';

-- ─── Step 3: Final Test — Inspection / Test / Repair ──────────────
UPDATE public.kd2_process_stations SET station_sequence_in_category =  1, route_sequence =  47 WHERE vehicle_type='K9' AND station_code='k9_final_test_1insp';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  2, route_sequence =  48 WHERE vehicle_type='K9' AND station_code='k9_final_test_test_run';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  3, route_sequence =  49 WHERE vehicle_type='K9' AND station_code='k9_final_test_performance_test';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  4, route_sequence =  50 WHERE vehicle_type='K9' AND station_code='k9_final_test_repair';
-- Deactivated stations pushed to high seq (already inactive from mig 17)
UPDATE public.kd2_process_stations SET station_sequence_in_category = 96, route_sequence = 996 WHERE vehicle_type='K9' AND station_code='k9_final_test_check';
UPDATE public.kd2_process_stations SET station_sequence_in_category = 97, route_sequence = 997 WHERE vehicle_type='K9' AND station_code='k9_final_test_powerpack_check';

-- ─── Step 4: Processing — Painting sub-steps (P1) ─────────────────
UPDATE public.kd2_process_stations SET station_sequence_in_category = 99, route_sequence = 999 WHERE vehicle_type='K9' AND station_code='k9_processing_processing';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  1, route_sequence =  51 WHERE vehicle_type='K9' AND station_code='k9_processing_clean_dry';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  2, route_sequence =  52 WHERE vehicle_type='K9' AND station_code='k9_processing_masking';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  3, route_sequence =  53 WHERE vehicle_type='K9' AND station_code='k9_processing_sanding';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  4, route_sequence =  54 WHERE vehicle_type='K9' AND station_code='k9_processing_painting';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  5, route_sequence =  55 WHERE vehicle_type='K9' AND station_code='k9_processing_touch_up';
UPDATE public.kd2_process_stations SET station_sequence_in_category =  6, route_sequence =  56 WHERE vehicle_type='K9' AND station_code='k9_processing_attaching';

-- ─── Step 5: Final Test — Final Check (P2) ────────────────────────
UPDATE public.kd2_process_stations SET station_sequence_in_category =  5, route_sequence =  57 WHERE vehicle_type='K9' AND station_code='k9_final_test_final_check';

-- ─── Step 6: Sync kd2_process_routes ──────────────────────────────
UPDATE public.kd2_process_routes r
SET route_sequence = s.route_sequence,
    is_active      = s.is_active
FROM public.kd2_process_stations s
WHERE r.vehicle_type = s.vehicle_type
  AND r.station_code = s.station_code
  AND s.vehicle_type = 'K9'
  AND s.category_code IN ('assembly', 'processing', 'final_test');

COMMIT;
