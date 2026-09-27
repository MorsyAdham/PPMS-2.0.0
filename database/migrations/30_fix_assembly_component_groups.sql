-- ═══════════════════════════════════════════════════════════════════
-- KD2 : Migration 30 — Assign correct component_group to K9
--        assembly / processing / final_test stations
--
-- Problem:
--   Migration 16 assigned component_group = 'Assembly & Processing
--   and Testing' to ALL k9_assembly_*, k9_processing_*, and
--   k9_final_test_* stations. This is too coarse: hull units
--   (e.g. A1–A7) have their own assembly stations, and turret units
--   (e.g. A8, A9, A10) have separate turret assembly stations.
--
-- Logic (data-driven — no unit names are hardcoded):
--   Uses kd2_plan_live (which exposes vehicle_no / unit_code) to
--   identify which units are hull-only vs turret.
--
--   • "Turret units" = vehicle_no values that have plan rows for
--                      stations with station_code LIKE 'k9_turret_%'
--   • "Hull-only units" = vehicle_no values with k9_hull_* rows
--                         AND no k9_turret_* rows
--
--   For each assembly/processing/final_test station:
--     - Rows ONLY from turret units → component_group = 'Turret'
--     - Otherwise                  → component_group = 'Hull'
--
-- Preview (run first to review):
-- ───────────────────────────────────────────────────────────────────
-- WITH turret_units AS (
--     SELECT DISTINCT vehicle_no FROM public.kd2_plan_live
--     WHERE  vehicle = 'K9' AND station_code LIKE 'k9_turret_%'
-- ),
-- hull_only_units AS (
--     SELECT DISTINCT vehicle_no FROM public.kd2_plan_live
--     WHERE  vehicle = 'K9' AND station_code LIKE 'k9_hull_%'
--       AND  vehicle_no NOT IN (SELECT vehicle_no FROM turret_units)
-- )
-- SELECT ps.station_code, ps.station_name, ps.category_code,
--        ps.component_group AS current_group,
--        CASE
--          WHEN EXISTS (
--            SELECT 1 FROM public.kd2_plan_live p
--            JOIN turret_units tu ON p.vehicle_no = tu.vehicle_no
--            WHERE p.vehicle = 'K9' AND p.station_code = ps.station_code
--          ) AND NOT EXISTS (
--            SELECT 1 FROM public.kd2_plan_live p
--            JOIN hull_only_units hu ON p.vehicle_no = hu.vehicle_no
--            WHERE p.vehicle = 'K9' AND p.station_code = ps.station_code
--          ) THEN 'Turret'
--          ELSE 'Hull'
--        END AS new_group
-- FROM public.kd2_process_stations ps
-- WHERE ps.vehicle_type = 'K9'
--   AND ps.category_code IN ('assembly', 'processing', 'final_test')
-- ORDER BY ps.route_sequence;
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

WITH turret_units AS (
    SELECT DISTINCT vehicle_no FROM public.kd2_plan_live
    WHERE  vehicle     = 'K9'
      AND  station_code LIKE 'k9_turret_%'
),
hull_only_units AS (
    SELECT DISTINCT vehicle_no FROM public.kd2_plan_live
    WHERE  vehicle     = 'K9'
      AND  station_code LIKE 'k9_hull_%'
      AND  vehicle_no NOT IN (SELECT vehicle_no FROM turret_units)
)
UPDATE public.kd2_process_stations ps
SET component_group =
    CASE
        -- Station has rows ONLY for turret units (A8, A9, A10, …) → Turret
        WHEN EXISTS (
            SELECT 1 FROM public.kd2_plan_live p
            JOIN turret_units tu ON p.vehicle_no = tu.vehicle_no
            WHERE p.vehicle = 'K9' AND p.station_code = ps.station_code
        ) AND NOT EXISTS (
            SELECT 1 FROM public.kd2_plan_live p
            JOIN hull_only_units hu ON p.vehicle_no = hu.vehicle_no
            WHERE p.vehicle = 'K9' AND p.station_code = ps.station_code
        ) THEN 'Turret'
        -- Station has rows for hull units → Hull
        ELSE 'Hull'
    END
WHERE ps.vehicle_type  = 'K9'
  AND ps.category_code IN ('assembly', 'processing', 'final_test');

COMMIT;
