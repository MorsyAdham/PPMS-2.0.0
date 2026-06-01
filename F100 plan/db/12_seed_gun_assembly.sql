-- ═══════════════════════════════════════════════════════════════════
-- F100 – KD2  :  Seed gun assembly sequence (§5.2 of implementation plan)
-- Run after 01_create_tables.sql and 05_battalions_units.sql
--
-- Assembly sequence (post-machining, per implementation plan §5.2):
--
--   Parallel group 1 — starts simultaneously:
--     Stream A:  Breech Mechanism  →  Breech Mechanism TEST
--     Stream B:  Gun Mount Assembly  →  Pressure TEST
--     Stream C:  Tube Assembly
--
--   Parallel group 2 — starts after group 1 streams complete:
--     Sequential:  Armament Assembly (A)  →  Gymna Test  →  Firing Cylinder Test
--
-- One row is inserted per battalion × assembly step.
-- Uses a cross-join with f100_battalions so it works for any
-- number of battalions already in the table.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- Step definitions (parallel_group determines which steps start together)
WITH steps(assembly_step, parallel_group, sort_order) AS (
    VALUES
    -- Group 1 — parallel streams (machined sub-assemblies)
    ('Breech Mechanism',        1,  10),
    ('Gun Mount Assembly',      1,  20),
    ('Tube Assembly',           1,  30),
    -- Group 2 — after group 1 (testing / validation per stream)
    ('Breech Mechanism TEST',   2,  40),
    ('Pressure TEST',           2,  50),
    -- Group 3 — final integration sequence (sequential)
    ('Armament Assembly (A)',   3,  60),
    ('Gymna Test',              4,  70),
    ('Firing Cylinder Test',    5,  80)
)
INSERT INTO public.f100_gun_assembly (battalion_code, assembly_step, parallel_group, status)
SELECT
    b.battalion_code,
    s.assembly_step,
    s.parallel_group,
    'Planned'
FROM public.f100_battalions b
CROSS JOIN steps s
ON CONFLICT DO NOTHING;

COMMIT;
