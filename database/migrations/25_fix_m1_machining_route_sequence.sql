-- ═══════════════════════════════════════════════════════════════════
-- KD2 : Migration 25 — Fix M1 machining route_sequence mismatch
--
-- Migration 24 correctly moved M1 to station k9_machining_machining_1st_2nd_2
-- but set route_sequence = 1012 (from the station definition) instead of
-- route_sequence = 12 (what all M2–M18 plan rows store).
-- The VPX column key includes route_sequence, so M1 still renders as a
-- separate column.
--
-- Fix: align M1's route_sequence and station_sequence_in_category to 12.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.kd2_plan
SET route_sequence               = 12,
    station_sequence_in_category = 12
WHERE vehicle_type  = 'K9'
  AND station_code  = 'k9_machining_machining_1st_2nd_2'
  AND route_sequence = 1012;

COMMIT;
