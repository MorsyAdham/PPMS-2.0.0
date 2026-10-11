-- Row-level security — is RLS on for every PPMS table? (read-only)
select c.relname as table_name,
       c.relrowsecurity as rls_on,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and (c.relname like 'kd2\_%' or c.relname like 'f100\_%' or c.relname like 'planning\_%'
       or c.relname like 'production\_issue%' or c.relname in ('plan_versions', 'assembly_plan', 'vehicle_units', 'ppms_system_notice'))
order by rls_on, table_name;
