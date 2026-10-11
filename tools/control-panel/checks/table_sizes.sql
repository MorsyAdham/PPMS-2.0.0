-- Table sizes — disk used by each PPMS table (read-only)
select c.relname as table_name,
       pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
       c.reltuples::bigint as approx_rows
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and (c.relname like 'kd2\_%' or c.relname like 'f100\_%' or c.relname like 'planning\_%'
       or c.relname like 'production\_issue%' or c.relname in ('plan_versions', 'assembly_plan', 'vehicle_units', 'ppms_system_notice'))
order by pg_total_relation_size(c.oid) desc;
