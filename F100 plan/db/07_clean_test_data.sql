-- ═══════════════════════════════════════════════════════════════════
-- F100 – KD2  :  CLEAN TEST DATA
-- Removes ONLY data inserted by 06_test_data.sql.
-- SAFE: touches ONLY f100_* tables scoped to battalion_code = 'TEST-BAT-1'.
-- Does NOT modify any F200-KD1 or F200-KD2 tables.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Remove plan rows for the test battalion
--    (f100_plans references battalion_code, not battalion id, so filter directly)
DELETE FROM public.f100_plans
WHERE battalion_code = 'TEST-BAT-1';

-- 2. Remove vehicle units for the test battalion
DELETE FROM public.f100_vehicle_units
WHERE battalion_id = 'ffffffff-0001-0000-0000-000000000001';

-- 3. Remove the test battalion itself
DELETE FROM public.f100_battalions
WHERE id = 'ffffffff-0001-0000-0000-000000000001';

COMMIT;

-- Confirm cleanup
SELECT
    'f100_plans remaining for TEST-BAT-1' AS check_label,
    COUNT(*) AS remaining
FROM public.f100_plans
WHERE battalion_code = 'TEST-BAT-1'
UNION ALL
SELECT
    'f100_battalions remaining for TEST-BAT-1',
    COUNT(*)
FROM public.f100_battalions
WHERE battalion_code = 'TEST-BAT-1';
