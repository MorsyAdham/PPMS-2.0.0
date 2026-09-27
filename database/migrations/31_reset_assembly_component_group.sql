-- ═══════════════════════════════════════════════════════════════════
-- KD2 : Migration 31 — Restore K9 assembly/processing/final_test
--        component_group to 'Assembly & Processing and Testing'
--
-- Migration 30 changed some of these stations to 'Hull' or 'Turret'
-- so they would appear under the component filter.  Decision changed:
-- assembly / processing / final_test stations should NOT appear when
-- filtering by Hull or Turret — they only show with no component
-- filter selected.
--
-- This migration resets all three category codes back to the
-- original value set by migration 16.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.kd2_process_stations
SET    component_group = 'Assembly & Processing and Testing'
WHERE  vehicle_type  = 'K9'
  AND  category_code IN ('assembly', 'processing', 'final_test');

COMMIT;
