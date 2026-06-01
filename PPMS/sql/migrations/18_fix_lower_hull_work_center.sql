-- ═══════════════════════════════════════════════════════════════════
-- KD2 : Correct LOWER HULL work center from W07 to W08
-- Run once in Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════════

UPDATE public.kd2_process_stations
SET work_center = 'W07, W08'
WHERE vehicle_type = 'K9'
  AND station_code = 'k9_hull_lower_hull';
