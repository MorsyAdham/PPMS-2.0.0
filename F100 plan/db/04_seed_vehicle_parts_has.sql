-- ═══════════════════════════════════════════════════════════════════
-- F100 – KD2  :  Seed HAS vehicle parts and their processes
-- Run after 03_seed_gun_parts.sql
-- DOOWON rows are left empty — admin panel populates them.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Insert HAS vehicle parts ─────────────────────────────────────
-- UUID prefix: 22222222-00NN-0000-0000-000000000000  (NN = 01-16)
INSERT INTO public.f100_parts
    (id, module, part_number, part_name, manufacturer, vehicles, qty_per_vehicle, sort_order)
VALUES
    ('22222222-0001-0000-0000-000000000000', 'vehicle', '60343861',           'Joystick bracket',              'HAS', '{K9}',         1,  10),
    ('22222222-0002-0000-0000-000000000000', 'vehicle', '60343684',           'Bracket',                       'HAS', '{K9}',         1,  20),
    ('22222222-0003-0000-0000-000000000000', 'vehicle', '60343685',           'Bracket',                       'HAS', '{K9}',         1,  30),
    ('22222222-0004-0000-0000-000000000000', 'vehicle', '60343686',           'Boss',                          'HAS', '{K9}',         2,  40),
    ('22222222-0005-0000-0000-000000000000', 'vehicle', '60348010',           'Driver seat support',           'HAS', '{K9,K10,K11}', 1,  50),
    ('22222222-0006-0000-0000-000000000000', 'vehicle', '10910084',           'Driver seat base',              'HAS', '{K9,K10,K11}', 1,  60),
    ('22222222-0007-0000-0000-000000000000', 'vehicle', 'EGK974242/60360242', 'Gun travel lock_Support',       'HAS', '{K9}',         1,  70),
    ('22222222-0008-0000-0000-000000000000', 'vehicle', 'EGK974246/60360246', 'Gun travel lock_Jaw',           'HAS', '{K9}',         1,  80),
    ('22222222-0009-0000-0000-000000000000', 'vehicle', 'EGK974250/60360250', 'Gun travel lock_Bracket',       'HAS', '{K9}',         1,  90),
    ('22222222-0010-0000-0000-000000000000', 'vehicle', 'EGK974257/60360257', 'Gun travel lock_Rod arm',       'HAS', '{K9}',         1, 100),
    ('22222222-0011-0000-0000-000000000000', 'vehicle', 'EGK921772',          'Idler housing Assembly',        'HAS', '{K9,K10,K11}', 2, 110),
    ('22222222-0012-0000-0000-000000000000', 'vehicle', 'EGK921773/60349773', 'Idler housing',                 'HAS', '{K9,K10,K11}', 2, 120),
    ('22222222-0013-0000-0000-000000000000', 'vehicle', 'Q25025211',          'Right charge rack_Machined',    'HAS', '{K10}',        1, 130),
    ('22222222-0014-0000-0000-000000000000', 'vehicle', 'Q25025212U',         'Right charge rack_Welded',      'HAS', '{K10}',        1, 140),
    ('22222222-0015-0000-0000-000000000000', 'vehicle', 'Q25025301',          'Left charge rack_Machined',     'HAS', '{K10}',        1, 150),
    ('22222222-0016-0000-0000-000000000000', 'vehicle', 'Q25025302U',         'Left charge rack_Welded',       'HAS', '{K10}',        1, 160)
ON CONFLICT (id) DO NOTHING;


-- ─── 60343861 Joystick bracket (10 steps) ─────────────────────────
INSERT INTO public.f100_processes (part_id, step_number, process_name, sort_order) VALUES
    ('22222222-0001-0000-0000-000000000000',  10, 'INPUT Mat.',     10),
    ('22222222-0001-0000-0000-000000000000',  20, 'MARKING',        20),
    ('22222222-0001-0000-0000-000000000000',  30, 'FACE MILLING',   30),
    ('22222222-0001-0000-0000-000000000000',  40, 'DRILLING',       40),
    ('22222222-0001-0000-0000-000000000000',  50, 'DEBUR/INSERT',   50),
    ('22222222-0001-0000-0000-000000000000',  60, 'INSPECTION',     60),
    ('22222222-0001-0000-0000-000000000000',  70, 'CHROMATE',       70),
    ('22222222-0001-0000-0000-000000000000',  80, 'PAINTING',       80),
    ('22222222-0001-0000-0000-000000000000',  90, 'INSPECTION',     90),
    ('22222222-0001-0000-0000-000000000000', 100, 'DELIVERY',      100)
ON CONFLICT (part_id, step_number) DO NOTHING;


-- ─── 60343684 Bracket (7 steps) ───────────────────────────────────
INSERT INTO public.f100_processes (part_id, step_number, process_name, sort_order) VALUES
    ('22222222-0002-0000-0000-000000000000',  10, 'KITTING',        10),
    ('22222222-0002-0000-0000-000000000000',  20, 'WELDING',        20),
    ('22222222-0002-0000-0000-000000000000',  30, 'INSPECTION',     30),
    ('22222222-0002-0000-0000-000000000000',  40, 'PHOSPHATE COAT', 40),
    ('22222222-0002-0000-0000-000000000000',  50, 'PAINTING',       50),
    ('22222222-0002-0000-0000-000000000000',  60, 'INSPECTION',     60),
    ('22222222-0002-0000-0000-000000000000',  70, 'DELIVERY',       70)
ON CONFLICT (part_id, step_number) DO NOTHING;


-- ─── 60343685 Bracket (9 steps, step 40 unlabelled in source) ─────
INSERT INTO public.f100_processes (part_id, step_number, process_name, sort_order) VALUES
    ('22222222-0003-0000-0000-000000000000',  10, 'INPUT Mat.',              10),
    ('22222222-0003-0000-0000-000000000000',  20, 'MARKING',                 20),
    ('22222222-0003-0000-0000-000000000000',  30, 'FACE MILLING',            30),
    ('22222222-0003-0000-0000-000000000000',  50, 'DRILLING',                50),
    ('22222222-0003-0000-0000-000000000000',  60, 'BORING',                  60),
    ('22222222-0003-0000-0000-000000000000',  70, 'FACE MILLING',            70),
    ('22222222-0003-0000-0000-000000000000',  80, 'FACE MILLING/DRILLING',   80),
    ('22222222-0003-0000-0000-000000000000',  90, 'DEBUR',                   90),
    ('22222222-0003-0000-0000-000000000000', 100, 'INSPECTION',             100)
ON CONFLICT (part_id, step_number) DO NOTHING;


-- ─── 60343686 Boss (4 steps) ──────────────────────────────────────
INSERT INTO public.f100_processes (part_id, step_number, process_name, sort_order) VALUES
    ('22222222-0004-0000-0000-000000000000',  10, 'INPUT Mat.',  10),
    ('22222222-0004-0000-0000-000000000000',  20, 'CUTTING',     20),
    ('22222222-0004-0000-0000-000000000000',  30, 'TURNING',     30),
    ('22222222-0004-0000-0000-000000000000',  40, 'INSPECTION',  40)
ON CONFLICT (part_id, step_number) DO NOTHING;


-- ─── 60348010 Driver seat support (9 steps) ───────────────────────
INSERT INTO public.f100_processes (part_id, step_number, process_name, sort_order) VALUES
    ('22222222-0005-0000-0000-000000000000',  10, 'INPUT Mat.',          10),
    ('22222222-0005-0000-0000-000000000000',  20, 'MARKING',             20),
    ('22222222-0005-0000-0000-000000000000',  30, 'FACE MILLING/BORING', 30),
    ('22222222-0005-0000-0000-000000000000',  40, 'DEBUR',               40),
    ('22222222-0005-0000-0000-000000000000',  50, 'INSPECTION',          50),
    ('22222222-0005-0000-0000-000000000000',  60, 'CHROMATE',            60),
    ('22222222-0005-0000-0000-000000000000',  70, 'PAINTING',            70),
    ('22222222-0005-0000-0000-000000000000',  80, 'INSPECTION',          80),
    ('22222222-0005-0000-0000-000000000000',  90, 'DELIVERY',            90)
ON CONFLICT (part_id, step_number) DO NOTHING;


-- ─── 10910084 Driver seat base (8 steps) ──────────────────────────
INSERT INTO public.f100_processes (part_id, step_number, process_name, sort_order) VALUES
    ('22222222-0006-0000-0000-000000000000',  10, 'KITTING',    10),
    ('22222222-0006-0000-0000-000000000000',  20, 'CLEANING',   20),
    ('22222222-0006-0000-0000-000000000000',  30, 'WELDING',    30),
    ('22222222-0006-0000-0000-000000000000',  40, 'INSPECTION', 40),
    ('22222222-0006-0000-0000-000000000000',  50, 'CHROMATE',   50),
    ('22222222-0006-0000-0000-000000000000',  60, 'PAINTING',   60),
    ('22222222-0006-0000-0000-000000000000',  70, 'INSPECTION', 70),
    ('22222222-0006-0000-0000-000000000000',  80, 'DELIVERY',   80)
ON CONFLICT (part_id, step_number) DO NOTHING;


-- ─── EGK974242/60360242 Gun travel lock_Support (12 steps) ────────
INSERT INTO public.f100_processes (part_id, step_number, process_name, sort_order) VALUES
    ('22222222-0007-0000-0000-000000000000',  10, 'INPUT Mat.',               10),
    ('22222222-0007-0000-0000-000000000000',  20, 'MARKING',                  20),
    ('22222222-0007-0000-0000-000000000000',  30, 'FACE MILLING',             30),
    ('22222222-0007-0000-0000-000000000000',  40, 'FACE MILLING/DRILL/BORING',40),
    ('22222222-0007-0000-0000-000000000000',  50, 'FACE MILLING/DRILLING',    50),
    ('22222222-0007-0000-0000-000000000000',  60, 'DRILLING/TAPPING',         60),
    ('22222222-0007-0000-0000-000000000000',  70, 'DEBUR/TAPPING',            70),
    ('22222222-0007-0000-0000-000000000000',  80, 'INSPECTION',               80),
    ('22222222-0007-0000-0000-000000000000',  90, 'PHOSPHATE COAT',           90),
    ('22222222-0007-0000-0000-000000000000', 100, 'PAINTING',                100),
    ('22222222-0007-0000-0000-000000000000', 110, 'INSPECTION',              110),
    ('22222222-0007-0000-0000-000000000000', 120, 'DELIVERY',                120)
ON CONFLICT (part_id, step_number) DO NOTHING;


-- ─── EGK974246/60360246 Gun travel lock_Jaw (10 steps) ────────────
-- Source lists duplicate step 30 — corrected to sequential numbering
INSERT INTO public.f100_processes (part_id, step_number, process_name, sort_order) VALUES
    ('22222222-0008-0000-0000-000000000000',  10, 'INPUT Mat.',              10),
    ('22222222-0008-0000-0000-000000000000',  20, 'MARKING',                 20),
    ('22222222-0008-0000-0000-000000000000',  30, 'FACE MILLING',            30),
    ('22222222-0008-0000-0000-000000000000',  40, 'DRILLING',                40),
    ('22222222-0008-0000-0000-000000000000',  50, 'DEBUR/DRILLING/TAPPING',  50),
    ('22222222-0008-0000-0000-000000000000',  60, 'INSPECTION',              60),
    ('22222222-0008-0000-0000-000000000000',  70, 'PHOSPHATE COAT',          70),
    ('22222222-0008-0000-0000-000000000000',  80, 'PAINTING',                80),
    ('22222222-0008-0000-0000-000000000000',  90, 'INSPECTION',              90),
    ('22222222-0008-0000-0000-000000000000', 100, 'DELIVERY',               100)
ON CONFLICT (part_id, step_number) DO NOTHING;


-- ─── EGK974250/60360250 Gun travel lock_Bracket (10 steps) ────────
-- Source lists 11 step numbers with 10 process names; extra step 110 omitted
INSERT INTO public.f100_processes (part_id, step_number, process_name, sort_order) VALUES
    ('22222222-0009-0000-0000-000000000000',  10, 'INPUT Mat.',             10),
    ('22222222-0009-0000-0000-000000000000',  20, 'MARKING',                20),
    ('22222222-0009-0000-0000-000000000000',  30, 'FACE MILLING/DRILLING',  30),
    ('22222222-0009-0000-0000-000000000000',  40, 'FACE MILLING/BORING',    40),
    ('22222222-0009-0000-0000-000000000000',  50, 'DEBUR/TAPPING',          50),
    ('22222222-0009-0000-0000-000000000000',  60, 'INSPECTION',             60),
    ('22222222-0009-0000-0000-000000000000',  70, 'PHOSPHATE COAT',         70),
    ('22222222-0009-0000-0000-000000000000',  80, 'PAINTING',               80),
    ('22222222-0009-0000-0000-000000000000',  90, 'INSPECTION',             90),
    ('22222222-0009-0000-0000-000000000000', 100, 'DELIVERY',              100)
ON CONFLICT (part_id, step_number) DO NOTHING;


-- ─── EGK974257/60360257 Gun travel lock_Rod arm (10 steps) ────────
INSERT INTO public.f100_processes (part_id, step_number, process_name, sort_order) VALUES
    ('22222222-0010-0000-0000-000000000000',  10, 'INPUT Mat.',            10),
    ('22222222-0010-0000-0000-000000000000',  20, 'MARKING',               20),
    ('22222222-0010-0000-0000-000000000000',  30, 'FACE MILLING/DRILLING', 30),
    ('22222222-0010-0000-0000-000000000000',  40, 'TAPPING',               40),
    ('22222222-0010-0000-0000-000000000000',  50, 'DEBUR',                 50),
    ('22222222-0010-0000-0000-000000000000',  60, 'INSPECTION',            60),
    ('22222222-0010-0000-0000-000000000000',  70, 'PHOSPHATE COAT',        70),
    ('22222222-0010-0000-0000-000000000000',  80, 'PAINTING',              80),
    ('22222222-0010-0000-0000-000000000000',  90, 'INSPECTION',            90),
    ('22222222-0010-0000-0000-000000000000', 100, 'DELIVERY',             100)
ON CONFLICT (part_id, step_number) DO NOTHING;


-- ─── EGK921772 Idler housing Assembly (4 steps) ───────────────────
INSERT INTO public.f100_processes (part_id, step_number, process_name, sort_order) VALUES
    ('22222222-0011-0000-0000-000000000000',  10, 'KITTING',    10),
    ('22222222-0011-0000-0000-000000000000',  20, 'ASSEMBLY',   20),
    ('22222222-0011-0000-0000-000000000000',  30, 'INSPECTION', 30),
    ('22222222-0011-0000-0000-000000000000',  40, 'DELIVERY',   40)
ON CONFLICT (part_id, step_number) DO NOTHING;


-- ─── EGK921773/60349773 Idler housing (9 steps) ───────────────────
INSERT INTO public.f100_processes (part_id, step_number, process_name, sort_order) VALUES
    ('22222222-0012-0000-0000-000000000000',  10, 'INPUT Mat.',            10),
    ('22222222-0012-0000-0000-000000000000',  20, 'MARKING',               20),
    ('22222222-0012-0000-0000-000000000000',  30, 'FACE MILLING/DRILL',    30),
    ('22222222-0012-0000-0000-000000000000',  40, 'FACE MILLING/BORING',   40),
    ('22222222-0012-0000-0000-000000000000',  50, 'DEBUR/TAPPING',         50),
    ('22222222-0012-0000-0000-000000000000',  60, 'INSPECTION',            60),
    ('22222222-0012-0000-0000-000000000000',  70, 'PHOSPHATE COAT',        70),
    ('22222222-0012-0000-0000-000000000000',  80, 'PAINTING',              80),
    ('22222222-0012-0000-0000-000000000000',  90, 'INSPECTION',            90)
ON CONFLICT (part_id, step_number) DO NOTHING;


-- ─── Q25025211 Right charge rack_Machined (10 steps) ──────────────
INSERT INTO public.f100_processes (part_id, step_number, process_name, sort_order) VALUES
    ('22222222-0013-0000-0000-000000000000',  10, 'KITTING',                          10),
    ('22222222-0013-0000-0000-000000000000',  20, 'MARKING',                          20),
    ('22222222-0013-0000-0000-000000000000',  30, 'FACE MILLING/DRILLING/TAPPING 1',  30),
    ('22222222-0013-0000-0000-000000000000',  40, 'FACE MILLING/BORING/TAPPING 2',    40),
    ('22222222-0013-0000-0000-000000000000',  50, 'DEBUR/INSERT ASSEMBLY',            50),
    ('22222222-0013-0000-0000-000000000000',  60, 'CLEANING',                         60),
    ('22222222-0013-0000-0000-000000000000',  70, 'CHROMATE',                         70),
    ('22222222-0013-0000-0000-000000000000',  80, 'PAINTING',                         80),
    ('22222222-0013-0000-0000-000000000000',  90, 'INSPECTION',                       90),
    ('22222222-0013-0000-0000-000000000000', 100, 'DELIVERY',                        100)
ON CONFLICT (part_id, step_number) DO NOTHING;


-- ─── Q25025212U Right charge rack_Welded (5 steps) ────────────────
INSERT INTO public.f100_processes (part_id, step_number, process_name, sort_order) VALUES
    ('22222222-0014-0000-0000-000000000000',  10, 'KITTING',    10),
    ('22222222-0014-0000-0000-000000000000',  20, 'CLEANING',   20),
    ('22222222-0014-0000-0000-000000000000',  30, 'WELDING',    30),
    ('22222222-0014-0000-0000-000000000000',  40, 'INSPECTION', 40),
    ('22222222-0014-0000-0000-000000000000',  50, 'DELIVERY',   50)
ON CONFLICT (part_id, step_number) DO NOTHING;


-- ─── Q25025301 Left charge rack_Machined (10 steps) ───────────────
INSERT INTO public.f100_processes (part_id, step_number, process_name, sort_order) VALUES
    ('22222222-0015-0000-0000-000000000000',  10, 'KITTING',                          10),
    ('22222222-0015-0000-0000-000000000000',  20, 'MARKING',                          20),
    ('22222222-0015-0000-0000-000000000000',  30, 'FACE MILLING/DRILLING/TAPPING 1',  30),
    ('22222222-0015-0000-0000-000000000000',  40, 'FACE MILLING/BORING/TAPPING 2',    40),
    ('22222222-0015-0000-0000-000000000000',  50, 'DEBUR/INSERT ASSEMBLY',            50),
    ('22222222-0015-0000-0000-000000000000',  60, 'CLEANING',                         60),
    ('22222222-0015-0000-0000-000000000000',  70, 'CHROMATE',                         70),
    ('22222222-0015-0000-0000-000000000000',  80, 'PAINTING',                         80),
    ('22222222-0015-0000-0000-000000000000',  90, 'INSPECTION',                       90),
    ('22222222-0015-0000-0000-000000000000', 100, 'DELIVERY',                        100)
ON CONFLICT (part_id, step_number) DO NOTHING;


-- ─── Q25025302U Left charge rack_Welded (5 steps) ─────────────────
-- Source lists steps 10 20 30 40 60 (no step 50); preserved as-is
INSERT INTO public.f100_processes (part_id, step_number, process_name, sort_order) VALUES
    ('22222222-0016-0000-0000-000000000000',  10, 'KITTING',    10),
    ('22222222-0016-0000-0000-000000000000',  20, 'CLEANING',   20),
    ('22222222-0016-0000-0000-000000000000',  30, 'WELDING',    30),
    ('22222222-0016-0000-0000-000000000000',  40, 'INSPECTION', 40),
    ('22222222-0016-0000-0000-000000000000',  60, 'DELIVERY',   60)
ON CONFLICT (part_id, step_number) DO NOTHING;


COMMIT;
