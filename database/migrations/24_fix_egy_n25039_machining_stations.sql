-- ═══════════════════════════════════════════════════════════════════
-- KD2 : Migration 24 — Fix M1 (EGY N25039) machining station mismatch
--
-- Problem (confirmed by diagnostic):
--   Two near-identical K9 machining stations exist from testing:
--
--   k9_machining_machining_1st_2nd   route=1011  used by: M1 only      ← wrong
--   k9_machining_machining_1st_2nd_2 route=1012  used by: M2–M18       ← canonical
--
--   Both share station_name='MACHINING 1ST/2ND' but the different
--   route_sequence and station_code cause a separate VPX column for M1.
--
-- What this migration does:
--   1. Re-points M1's single kd2_plan row from the wrong station code
--      to the canonical one, syncing route_sequence and
--      station_sequence_in_category to match.
--   2. Deletes the wrong station definition k9_machining_machining_1st_2nd
--      from kd2_process_stations. kd2_process_routes and
--      kd2_process_lead_times cascade automatically.
--
-- Tables touched: kd2_plan, kd2_process_stations,
--                 kd2_process_routes (cascade), kd2_process_lead_times (cascade).
-- kd2_progress is NOT touched (no progress row exists for this plan row
-- since M1's machining block was never started).
-- Safe to re-run (idempotent — WHERE guards prevent double execution).
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Sync the canonical station's metadata into M1's plan row ───
--        We pull category_sequence, station_sequence_in_category, and
--        route_sequence directly from the canonical station so that
--        M1's plan row is byte-for-byte identical to M2–M18's rows.

UPDATE public.kd2_plan AS p
SET station_code                 = 'k9_machining_machining_1st_2nd_2',
    category_code                = canon.category_code,
    category_sequence            = canon_cat.category_sequence,
    station_sequence_in_category = canon.station_sequence_in_category,
    route_sequence               = canon.route_sequence
FROM public.kd2_process_stations AS canon
JOIN public.kd2_process_categories AS canon_cat
    ON canon_cat.vehicle_type = canon.vehicle_type
   AND canon_cat.category_code = canon.category_code
WHERE canon.vehicle_type = 'K9'
  AND canon.station_code = 'k9_machining_machining_1st_2nd_2'
  AND p.vehicle_type     = 'K9'
  AND p.station_code     = 'k9_machining_machining_1st_2nd';


-- ─── 2. Delete the wrong station definition ────────────────────────
--        No kd2_plan rows reference it anymore (step 1 re-pointed them).
--        CASCADE removes the matching rows in kd2_process_routes and
--        kd2_process_lead_times automatically.

DELETE FROM public.kd2_process_stations
WHERE vehicle_type  = 'K9'
  AND station_code  = 'k9_machining_machining_1st_2nd'
  AND NOT EXISTS (
      SELECT 1 FROM public.kd2_plan p
      WHERE p.vehicle_type = 'K9'
        AND p.station_code = 'k9_machining_machining_1st_2nd'
  );


-- ─── Verification (run after COMMIT) ──────────────────────────────
--
--   -- Should return 0 rows:
--   SELECT id FROM public.kd2_plan
--   WHERE vehicle_type = 'K9' AND station_code = 'k9_machining_machining_1st_2nd';
--
--   -- Should return 0 rows:
--   SELECT station_code FROM public.kd2_process_stations
--   WHERE vehicle_type = 'K9' AND station_code = 'k9_machining_machining_1st_2nd';
--
--   -- Should now show M1 alongside M2–M18 in the same column in the VPX.

COMMIT;
