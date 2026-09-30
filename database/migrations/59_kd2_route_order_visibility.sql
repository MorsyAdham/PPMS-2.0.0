-- 59_kd2_route_order_visibility.sql
--
-- Per-plan-version visibility for KD2 processes (Gantt → Process view →
-- Edit → Reorder route → ⋯ menu).
--
--   visible  — normal (default).
--   hidden   — the process and its blocks stay in the plan version but are
--              left out of every view: Gantt, VPX, Plan Table, summary,
--              charts and exports. "Show in plan" brings them back.
--   removed  — "Delete from plan": the process's blocks in this version are
--              deleted and its lane no longer appears in this version.
--              The global process catalog and other plan versions are
--              untouched. "Restore" (Reorder route mode) brings the empty
--              lane back.
--
-- Stored on the existing per-version override table (migration 54), so it
-- is scoped to one plan version and survives reorders (the reorder upsert
-- only writes route columns). Additive with a default — the current live
-- app keeps working unchanged before and after this runs.
--
-- Safe to re-run.
begin;

alter table public.kd2_plan_route_order
    add column if not exists visibility text not null default 'visible';

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'kd2_plan_route_order_visibility_check'
    ) then
        alter table public.kd2_plan_route_order
            add constraint kd2_plan_route_order_visibility_check
            check (visibility in ('visible', 'hidden', 'removed'));
    end if;
end $$;

commit;
