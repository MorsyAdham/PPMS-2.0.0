-- ================================================================
-- Migration 33: Add module column to production_issues
--
-- Each module (kd1, kd2, f100kd2) has its own isolated issues list.
-- Existing rows default to 'kd1'.
-- ================================================================

ALTER TABLE public.production_issues
ADD COLUMN IF NOT EXISTS module text NOT NULL DEFAULT 'kd1'
    CHECK (module IN ('kd1', 'kd2', 'f100kd2'));

CREATE INDEX IF NOT EXISTS idx_production_issues_module
    ON public.production_issues (module);
