-- ═══════════════════════════════════════════════════════════════════
-- F100 – KD2  :  Add unit_code and unit_name columns to f100_vehicle_units
-- Run once in Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.f100_vehicle_units
    ADD COLUMN IF NOT EXISTS unit_code text,
    ADD COLUMN IF NOT EXISTS unit_name text;

COMMENT ON COLUMN public.f100_vehicle_units.unit_code IS
    'External alphanumeric vehicle identifier, e.g. EGY N25039';
COMMENT ON COLUMN public.f100_vehicle_units.unit_name IS
    'Descriptive display name for this vehicle unit';
