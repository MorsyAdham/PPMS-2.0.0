-- ═══════════════════════════════════════════════════════════════════
-- F100 – KD2  :  Table definitions
-- Run once in Supabase SQL editor (public schema)
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. f100_parts ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.f100_parts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    module          text NOT NULL CHECK (module IN ('gun', 'vehicle')),
    part_number     text NOT NULL,
    part_name       text NOT NULL,
    manufacturer    text,                        -- null for gun parts; 'HAS'|'DOOWON' for vehicle
    vehicles        text[] NOT NULL DEFAULT '{}',-- e.g. '{K9}' or '{K9,K10,K11}'
    qty_per_vehicle int  NOT NULL DEFAULT 1,
    sort_order      int  NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.f100_parts IS
    'Master list of gun and vehicle parts for F100-KD2';

-- ─── 2. f100_processes ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.f100_processes (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    part_id      uuid NOT NULL REFERENCES public.f100_parts(id) ON DELETE CASCADE,
    step_number  int  NOT NULL,   -- 10, 20, 30 … matches operation numbering
    process_name text NOT NULL,
    sort_order   int  NOT NULL DEFAULT 0,
    UNIQUE (part_id, step_number)
);

COMMENT ON TABLE public.f100_processes IS
    'Ordered process steps for each F100 part';

-- ─── 3. f100_plans ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.f100_plans (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    part_id             uuid NOT NULL REFERENCES public.f100_parts(id)     ON DELETE CASCADE,
    process_id          uuid NOT NULL REFERENCES public.f100_processes(id) ON DELETE CASCADE,
    battalion_code      text NOT NULL,
    vehicle_type        text,         -- 'K9'|'K10'|'K11'; NULL for gun parts
    serial_number       int,          -- unit serial within vehicle type; NULL for gun parts
    planned_start_date  date,
    planned_end_date    date,
    actual_start_date   date,
    actual_end_date     date,
    status              text NOT NULL DEFAULT 'Planned'
                        CHECK (status IN ('Planned','In Progress','Completed','Overdue','Late Completion')),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.f100_plans IS
    'Per-part per-process planned and actual dates for F100-KD2';

-- ─── 4. f100_gun_assembly ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.f100_gun_assembly (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    battalion_code      text NOT NULL,
    assembly_step       text NOT NULL,
    parallel_group      int  NOT NULL DEFAULT 1,  -- steps with same number run concurrently
    planned_start_date  date,
    planned_end_date    date,
    actual_start_date   date,
    actual_end_date     date,
    status              text NOT NULL DEFAULT 'Planned'
                        CHECK (status IN ('Planned','In Progress','Completed','Overdue','Late Completion')),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.f100_gun_assembly IS
    'Final gun assembly sequence steps (post-machining) for F100-KD2';

-- ─── Indexes ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_f100_processes_part    ON public.f100_processes(part_id);
CREATE INDEX IF NOT EXISTS idx_f100_plans_part        ON public.f100_plans(part_id);
CREATE INDEX IF NOT EXISTS idx_f100_plans_process     ON public.f100_plans(process_id);
CREATE INDEX IF NOT EXISTS idx_f100_plans_battalion   ON public.f100_plans(battalion_code);
CREATE INDEX IF NOT EXISTS idx_f100_assembly_battalion ON public.f100_gun_assembly(battalion_code);
