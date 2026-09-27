-- ═══════════════════════════════════════════════════════════════════
-- KD2 : Migration 29 — Remove unused process stations (non-K11)
--       + fix k9_machining_machining_1st_2nd_2 route_sequence
--
-- Step 1 — Delete unused stations
--   Delete any kd2_process_stations row where:
--     • vehicle_type is NOT 'K11'  (all K11 stations are kept)
--     • AND no kd2_plan row references that (vehicle_type, station_code)
--
--   Cascade tables that auto-clean on delete:
--     • kd2_process_lead_times    (ON DELETE CASCADE)
--     • kd2_template_layout_items (ON DELETE CASCADE)
--
--   kd2_plan FK has no ON DELETE clause (defaults to RESTRICT), so
--   Postgres will reject the DELETE if any plan row still points to a
--   station — the WHERE subquery is a belt-and-braces guard.
--
-- Step 2 — Fix k9_machining_machining_1st_2nd_2 route_sequence
--   This station has plan rows (not deleted in step 1) but its
--   station-definition route_sequence is 1012 — a legacy value.
--   Correct value is 15 (matching MACHINING 1ST/2ND in the hull flow).
--
--   Previous attempt (migration 28) could only update kd2_plan rows
--   because k9_hull_machining_1st (also machining, seq=15) was still
--   present and caused a unique constraint collision via the
--   station_sequence_in_category trigger when we tried to change
--   route_sequence on kd2_process_stations.
--
--   Step 1 deletes k9_hull_machining_1st (no plan rows → removed).
--   With that conflict gone, the UPDATE in step 2 is safe.
--
-- Tables touched: kd2_process_stations, kd2_process_lead_times (cascade),
--                 kd2_template_layout_items (cascade)
-- Safe to re-run: step 1 deletes nothing extra on re-run (no unused rows
--                 remain); step 2 is idempotent.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ── Step 1: delete unused non-K11 stations ───────────────────────
DELETE FROM public.kd2_process_stations
WHERE  vehicle_type <> 'K11'
  AND  NOT EXISTS (
         SELECT 1 FROM public.kd2_plan p
         WHERE  p.vehicle_type = kd2_process_stations.vehicle_type
           AND  p.station_code = kd2_process_stations.station_code
       );

-- ── Step 2: fix route_sequence for the surviving machining station ─
-- k9_hull_machining_1st (the conflicting entry at seq=15) was just
-- deleted above, so this UPDATE no longer triggers a constraint error.
UPDATE public.kd2_process_stations
SET    route_sequence = 15
WHERE  vehicle_type  = 'K9'
  AND  station_code  = 'k9_machining_machining_1st_2nd_2';

COMMIT;
