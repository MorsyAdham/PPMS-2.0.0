-- Database connections — who is connected right now (read-only)
select coalesce(usename, '(system)') as db_user,
       coalesce(application_name, '') as application,
       state,
       count(*) as connections
from pg_stat_activity
where datname = current_database()
group by 1, 2, 3
order by connections desc;
