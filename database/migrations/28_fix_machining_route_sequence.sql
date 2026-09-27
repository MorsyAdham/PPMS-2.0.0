-- ═══════════════════════════════════════════════════════════════════
-- KD2 : Migration 28 — Fix MACHINING 1ST/2ND route_sequence order
--
-- Problem:
--   k9_machining_machining_1st_2nd_2 plan rows carry route_sequence=12
--   (a legacy value from before migration 17, left in place by migration 25).
--   QUALIFYING / FORM MOLDING (k9_hull_qualifying_form_mold) is at
--   route_sequence=14.
--
--   Anywhere the UI sorts by route_sequence from plan rows, MACHINING(12)
--   appears before QUALIFYING(14), which is the wrong process order.
--   The station definitions table had k9_machining_machining_1st_2nd_2
--   at route_sequence=1012 (also wrong).
--
-- Correct order from migration 17:
--   route_seq=14 → QUALIFYING / FORM MOLDING  (k9_hull_qualifying_form_mold)
--   route_seq=15 → MACHINING 1ST/2ND           (k9_hull_machining_1st)
--
-- Fix:
--   Update kd2_plan rows only. kd2_process_stations is NOT touched
--   because a trigger on that table recomputes station_sequence_in_category
--   on any UPDATE, which would collide with k9_hull_machining_1st's (K9,
--   machining, 2) entry.  The station definition does not need to change
--   because getStationRouteOrder() finds k9_hull_machining_1st (route_seq=15)
--   first and stops — k9_machining_machining_1st_2nd_2 is skipped since the
--   name 'MACHINING 1ST/2ND' is already in the map at that point.
--
-- Tables touched: kd2_plan only
-- Safe to re-run (idempotent — already-correct rows are no-ops).
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.kd2_plan
SET route_sequence = 15
WHERE vehicle_type = 'K9'
  AND station_code = 'k9_machining_machining_1st_2nd_2';

COMMIT;
