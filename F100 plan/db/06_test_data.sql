-- ═══════════════════════════════════════════════════════════════════
-- F100 – KD2  :  TEST DATA  (insert only — run 07_clean_test_data.sql to remove)
-- SAFE: touches ONLY f100_* tables.  Does NOT modify F200-KD1 or KD2 data.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Test battalion ───────────────────────────────────────────
INSERT INTO public.f100_battalions (id, battalion_code, battalion_name, notes)
VALUES (
    'ffffffff-0001-0000-0000-000000000001',
    'TEST-BAT-1',
    '1st Test Battalion',
    'TEST DATA — safe to delete via 07_clean_test_data.sql'
)
ON CONFLICT (battalion_code) DO NOTHING;

-- ─── 2. Vehicle units for test battalion  (4 K9, 1 K10, 1 K11) ──
INSERT INTO public.f100_vehicle_units (battalion_id, vehicle_type, unit_serial, unit_label)
SELECT
    'ffffffff-0001-0000-0000-000000000001',
    v.vehicle_type,
    v.unit_serial,
    v.vehicle_type || '-' || LPAD(v.unit_serial::text, 2, '0')
FROM (VALUES
    ('K9',  1),
    ('K9',  2),
    ('K9',  3),
    ('K9',  4),
    ('K10', 1),
    ('K11', 1)
) AS v(vehicle_type, unit_serial)
ON CONFLICT (battalion_id, vehicle_type, unit_serial) DO NOTHING;

-- ─── 3. Plan rows for K9 unit 1 — Breech Block steps 1–3 (Planned) ──
INSERT INTO public.f100_plans
    (battalion_code, vehicle_type, serial_number, part_id, process_id,
     planned_start_date, planned_end_date, status)
SELECT
    'TEST-BAT-1',
    'K9',
    1,
    p.id,
    pr.id,
    ('2026-06-01'::date + (pr.rn - 1) * INTERVAL '3 days')::date,
    ('2026-06-01'::date + (pr.rn - 1) * INTERVAL '3 days' + INTERVAL '2 days')::date,
    'Planned'
FROM public.f100_parts p
JOIN LATERAL (
    SELECT fp.id, ROW_NUMBER() OVER (ORDER BY fp.sort_order) AS rn
    FROM public.f100_processes fp
    WHERE fp.part_id = p.id
    ORDER BY fp.sort_order
    LIMIT 3
) AS pr ON true
WHERE p.part_number = '20026528'   -- Breech Block
ON CONFLICT DO NOTHING;

-- ─── 4. K9 unit 2 — Breech Block steps 1–2 (In Progress) ────────
INSERT INTO public.f100_plans
    (battalion_code, vehicle_type, serial_number, part_id, process_id,
     planned_start_date, planned_end_date, actual_start_date, status)
SELECT
    'TEST-BAT-1',
    'K9',
    2,
    p.id,
    pr.id,
    ('2026-05-25'::date + (pr.rn - 1) * INTERVAL '3 days')::date,
    ('2026-05-25'::date + (pr.rn - 1) * INTERVAL '3 days' + INTERVAL '2 days')::date,
    ('2026-05-25'::date + (pr.rn - 1) * INTERVAL '3 days')::date,
    'In Progress'
FROM public.f100_parts p
JOIN LATERAL (
    SELECT fp.id, ROW_NUMBER() OVER (ORDER BY fp.sort_order) AS rn
    FROM public.f100_processes fp
    WHERE fp.part_id = p.id
    ORDER BY fp.sort_order
    LIMIT 2
) AS pr ON true
WHERE p.part_number = '20026528'
ON CONFLICT DO NOTHING;

-- ─── 5. K9 unit 3 — Breech Block step 1 (Completed) ─────────────
INSERT INTO public.f100_plans
    (battalion_code, vehicle_type, serial_number, part_id, process_id,
     planned_start_date, planned_end_date, actual_start_date, actual_end_date, status)
SELECT
    'TEST-BAT-1',
    'K9',
    3,
    p.id,
    fp.id,
    '2026-05-18'::date,
    '2026-05-20'::date,
    '2026-05-18'::date,
    '2026-05-20'::date,
    'Completed'
FROM public.f100_parts p
JOIN public.f100_processes fp ON fp.part_id = p.id
WHERE p.part_number = '20026528'
ORDER BY fp.sort_order
LIMIT 1
ON CONFLICT DO NOTHING;

-- ─── 6. K10 unit 1 — Breech Ring step 1 (Planned) ───────────────
INSERT INTO public.f100_plans
    (battalion_code, vehicle_type, serial_number, part_id, process_id,
     planned_start_date, planned_end_date, status)
SELECT
    'TEST-BAT-1',
    'K10',
    1,
    p.id,
    fp.id,
    '2026-06-05'::date,
    '2026-06-08'::date,
    'Planned'
FROM public.f100_parts p
JOIN public.f100_processes fp ON fp.part_id = p.id
WHERE p.part_number = 'EGK955424'   -- Breech Ring
ORDER BY fp.sort_order
LIMIT 1
ON CONFLICT DO NOTHING;

-- ─── 7. K11 unit 1 — Muzzle Brake step 1 (Planned) ──────────────
INSERT INTO public.f100_plans
    (battalion_code, vehicle_type, serial_number, part_id, process_id,
     planned_start_date, planned_end_date, status)
SELECT
    'TEST-BAT-1',
    'K11',
    1,
    p.id,
    fp.id,
    '2026-06-08'::date,
    '2026-06-12'::date,
    'Planned'
FROM public.f100_parts p
JOIN public.f100_processes fp ON fp.part_id = p.id
WHERE p.part_number = 'EGK955308'   -- Muzzle Brake
ORDER BY fp.sort_order
LIMIT 1
ON CONFLICT DO NOTHING;

COMMIT;

-- Verify
SELECT
    pl.battalion_code,
    pl.vehicle_type,
    pl.serial_number,
    pa.part_name,
    fp.process_name,
    pl.planned_start_date,
    pl.planned_end_date,
    pl.status
FROM public.f100_plans pl
JOIN public.f100_parts pa ON pa.id = pl.part_id
JOIN public.f100_processes fp ON fp.id = pl.process_id
WHERE pl.battalion_code = 'TEST-BAT-1'
ORDER BY pl.vehicle_type, pl.serial_number, pl.planned_start_date;
