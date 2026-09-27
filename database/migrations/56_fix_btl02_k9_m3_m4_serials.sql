-- Migration 56: Correct BTL-02 K9 unit serial numbers (data fix)
--
-- Already applied to the live database on 2026-09-27 — kept here as a record.
-- Re-running is safe: both statements are guarded.
--
-- BTL-02 K9 was registered with 17 units: M4 was missing and M3 carried
-- EGY N26031. Confirmed with the planner: serials run in unit order,
-- Mn = EGY N(26027 + n), so M3 = EGY N26030 and M4 = EGY N26031.
-- Applies to K9 in BTL-02 only. No kd2_plan rows existed for BTL-02.

update public.kd2_vehicle_units
set unit_code = 'EGY N26030', updated_at = timezone('utc', now())
where battalion_id = (select id from public.kd2_battalions where battalion_code = 'BTL-02')
  and vehicle_type = 'K9' and unit_serial = 3 and unit_code = 'EGY N26031';

insert into public.kd2_vehicle_units (battalion_id, vehicle_type, unit_serial, unit_label, unit_code)
select id, 'K9', 4, 'M4', 'EGY N26031'
from public.kd2_battalions
where battalion_code = 'BTL-02'
on conflict (battalion_id, vehicle_type, unit_serial) do nothing;
