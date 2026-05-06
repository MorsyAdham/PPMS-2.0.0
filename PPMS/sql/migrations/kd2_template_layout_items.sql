begin;

create table if not exists public.kd2_template_layout_items (
    id bigint generated always as identity primary key,
    vehicle_type text not null check (vehicle_type in ('K9', 'K10', 'K11')),
    sort_order integer not null check (sort_order > 0),
    kind text not null check (kind in ('process', 'space')),
    station_code text,
    parallel_with_previous boolean not null default false,
    gap_days integer,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (vehicle_type, sort_order),
    foreign key (vehicle_type, station_code)
        references public.kd2_process_stations (vehicle_type, station_code)
        on update cascade
        on delete cascade,
    check (
        (kind = 'process' and station_code is not null and gap_days is null)
        or
        (kind = 'space' and station_code is null and parallel_with_previous = false and gap_days is not null and gap_days > 0)
    )
);

create unique index if not exists idx_kd2_template_layout_items_station
    on public.kd2_template_layout_items (vehicle_type, station_code)
    where station_code is not null;

drop trigger if exists trg_kd2_template_layout_items_updated_at on public.kd2_template_layout_items;
create trigger trg_kd2_template_layout_items_updated_at
before update on public.kd2_template_layout_items
for each row execute function public.set_updated_at();

with route_seed as (
    select
        r.vehicle_type,
        row_number() over (
            partition by r.vehicle_type
            order by r.route_sequence, s.station_sequence_in_category, r.station_code
        ) as sort_order,
        'process'::text as kind,
        r.station_code,
        coalesce(
            lag(r.route_sequence) over (
                partition by r.vehicle_type
                order by r.route_sequence, s.station_sequence_in_category, r.station_code
            ) = r.route_sequence,
            false
        ) as parallel_with_previous,
        null::integer as gap_days
    from public.kd2_process_routes r
    join public.kd2_process_stations s
        on s.vehicle_type = r.vehicle_type
       and s.station_code = r.station_code
       and s.is_active = true
    where r.is_active = true
)
insert into public.kd2_template_layout_items (
    vehicle_type,
    sort_order,
    kind,
    station_code,
    parallel_with_previous,
    gap_days
)
select
    seed.vehicle_type,
    seed.sort_order,
    seed.kind,
    seed.station_code,
    seed.parallel_with_previous,
    seed.gap_days
from route_seed seed
where not exists (
    select 1
    from public.kd2_template_layout_items existing
    where existing.vehicle_type = seed.vehicle_type
)
on conflict (vehicle_type, sort_order) do nothing;

commit;
