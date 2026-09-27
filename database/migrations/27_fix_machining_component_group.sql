-- Migration 27 — Assign MACHINING 1ST/2ND station to Hull component group
-- k9_machining_machining_1st_2nd_2 has component_group=NULL because its station_code
-- prefix (k9_machining_) was not matched by migration 16's k9_hull_* pattern.
-- This station is a hull sub-process and must appear under the Hull section.

BEGIN;

UPDATE public.kd2_process_stations
SET component_group = 'Hull'
WHERE vehicle_type = 'K9'
  AND station_code = 'k9_machining_machining_1st_2nd_2';

COMMIT;
