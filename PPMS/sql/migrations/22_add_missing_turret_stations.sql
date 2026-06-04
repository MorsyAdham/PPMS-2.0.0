-- ═══════════════════════════════════════════════════════════════════
-- KD2 : Migration 22 — Activate missing Turret section stations
--
-- The following 6 stations exist in kd2_process_stations (seeded by
-- migration 17) but are not visible in the Turret section because
-- their component_group is NULL or wrong.  This migration:
--
--   1. Sets component_group = 'Turret' for all 6 stations.
--   2. Renames them with a (TURRET) suffix where needed to prevent
--      name collisions with identically-named Hull stations.
--   3. Ensures is_active = true for all 6.
--   4. INSERTs them if somehow missing (ON CONFLICT is idempotent).
--
-- Stations fixed:
--   k9_turret_final_weld_2nd   welding              FINAL 2ND WELDING (TURRET)
--   k9_turret_deburring        shot_blasting_painting  DEBURRING (TURRET)
--   k9_turret_steam_cleaning   shot_blasting_painting  STEAM CLEANING (TURRET)
--   k9_turret_shot_blasting    shot_blasting_painting  SHOT BLASTING (TURRET)
--   k9_turret_painting         shot_blasting_painting  PAINTING (TURRET)
--   k9_turret_re_tapping       shot_blasting_painting  RE-TAPPING (TURRET)
--
-- SAFETY: Only kd2_process_stations, kd2_process_routes, and
--         kd2_process_lead_times are touched.
--         kd2_plan / kd2_progress are NOT modified.
--
-- Safe to re-run (idempotent).
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Ensure all 6 stations exist with correct fields ────────────

INSERT INTO public.kd2_process_stations
    (vehicle_type, category_code, station_code, station_name, work_center,
     station_sequence_in_category, route_sequence, component_group, is_active)
VALUES
    ('K9', 'welding',               'k9_turret_final_weld_2nd', 'FINAL 2ND WELDING (TURRET)', null, null, 32, 'Turret', true),
    ('K9', 'shot_blasting_painting','k9_turret_deburring',       'DEBURRING (TURRET)',         null, null, 30, 'Turret', true),
    ('K9', 'shot_blasting_painting','k9_turret_steam_cleaning',  'STEAM CLEANING (TURRET)',    null, null, 31, 'Turret', true),
    ('K9', 'shot_blasting_painting','k9_turret_shot_blasting',   'SHOT BLASTING (TURRET)',     null, null, 33, 'Turret', true),
    ('K9', 'shot_blasting_painting','k9_turret_painting',        'PAINTING (TURRET)',          null, null, 34, 'Turret', true),
    ('K9', 'shot_blasting_painting','k9_turret_re_tapping',      'RE-TAPPING (TURRET)',        null, null, 35, 'Turret', true)
ON CONFLICT (vehicle_type, station_code) DO UPDATE SET
    station_name    = excluded.station_name,
    component_group = excluded.component_group,
    category_code   = excluded.category_code,
    route_sequence  = excluded.route_sequence,
    is_active       = true;

-- ─── 2. Sync kd2_process_routes for these stations ─────────────────

INSERT INTO public.kd2_process_routes (vehicle_type, category_code, station_code, route_sequence)
SELECT vehicle_type, category_code, station_code, route_sequence
FROM public.kd2_process_stations
WHERE vehicle_type = 'K9'
  AND station_code IN (
      'k9_turret_final_weld_2nd',
      'k9_turret_deburring',
      'k9_turret_steam_cleaning',
      'k9_turret_shot_blasting',
      'k9_turret_painting',
      'k9_turret_re_tapping'
  )
ON CONFLICT (vehicle_type, station_code) DO UPDATE SET
    category_code  = excluded.category_code,
    route_sequence = excluded.route_sequence,
    is_active      = true;

-- ─── 3. Lead-time placeholder rows (if not already present) ────────

INSERT INTO public.kd2_process_lead_times
    (vehicle_type, category_code, station_code, planning_level, lead_time_days, notes)
SELECT vehicle_type, category_code, station_code, 'station', null,
       'Pending business confirmation'
FROM public.kd2_process_stations
WHERE vehicle_type = 'K9'
  AND station_code IN (
      'k9_turret_final_weld_2nd',
      'k9_turret_deburring',
      'k9_turret_steam_cleaning',
      'k9_turret_shot_blasting',
      'k9_turret_painting',
      'k9_turret_re_tapping'
  )
ON CONFLICT (vehicle_type, category_code, station_code, planning_level) DO NOTHING;

COMMIT;
