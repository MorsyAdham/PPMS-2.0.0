begin;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

drop view if exists public.kd2_plan_live;
drop table if exists public.kd2_progress cascade;
drop table if exists public.kd2_plan cascade;
drop table if exists public.kd2_vehicle_units cascade;
drop table if exists public.kd2_planning_inputs cascade;
drop table if exists public.kd2_template_layout_items cascade;
drop table if exists public.kd2_process_lead_times cascade;
drop table if exists public.kd2_process_routes cascade;
drop table if exists public.kd2_process_stations cascade;
drop table if exists public.kd2_process_categories cascade;
drop table if exists public.kd2_battalions cascade;

create table if not exists public.kd2_battalions (
    id bigint generated always as identity primary key,
    battalion_code text not null unique,
    battalion_name text,
    delivery_deadline date,
    notes text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.kd2_process_categories (
    id bigint generated always as identity primary key,
    vehicle_type text not null check (vehicle_type in ('K9', 'K10', 'K11')),
    category_code text not null,
    category_name text not null,
    category_sequence integer not null check (category_sequence > 0),
    is_active boolean not null default true,
    notes text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (vehicle_type, category_code),
    unique (vehicle_type, category_sequence)
);

create table if not exists public.kd2_process_stations (
    id bigint generated always as identity primary key,
    vehicle_type text not null check (vehicle_type in ('K9', 'K10', 'K11')),
    category_code text not null,
    station_code text not null,
    station_name text not null,
    work_center text,
    station_sequence_in_category integer not null check (station_sequence_in_category > 0),
    route_sequence integer not null check (route_sequence > 0),
    is_active boolean not null default true,
    notes text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (vehicle_type, station_code),
    unique (vehicle_type, category_code, station_sequence_in_category),
    foreign key (vehicle_type, category_code)
        references public.kd2_process_categories (vehicle_type, category_code)
        on update cascade
        on delete cascade
);

create table if not exists public.kd2_process_routes (
    id bigint generated always as identity primary key,
    vehicle_type text not null check (vehicle_type in ('K9', 'K10', 'K11')),
    category_code text not null,
    station_code text not null,
    route_sequence integer not null check (route_sequence > 0),
    is_active boolean not null default true,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (vehicle_type, station_code),
    foreign key (vehicle_type, category_code)
        references public.kd2_process_categories (vehicle_type, category_code)
        on update cascade
        on delete cascade,
    foreign key (vehicle_type, station_code)
        references public.kd2_process_stations (vehicle_type, station_code)
        on update cascade
        on delete cascade
);

create table if not exists public.kd2_process_lead_times (
    id bigint generated always as identity primary key,
    vehicle_type text not null check (vehicle_type in ('K9', 'K10', 'K11')),
    category_code text not null,
    station_code text,
    planning_level text not null check (planning_level in ('category', 'station')),
    lead_time_days numeric(10,2),
    lead_time_source text,
    notes text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (vehicle_type, category_code, station_code, planning_level),
    foreign key (vehicle_type, category_code)
        references public.kd2_process_categories (vehicle_type, category_code)
        on update cascade
        on delete cascade,
    foreign key (vehicle_type, station_code)
        references public.kd2_process_stations (vehicle_type, station_code)
        on update cascade
        on delete cascade,
    check (
        (planning_level = 'category' and station_code is null)
        or
        (planning_level = 'station' and station_code is not null)
    )
);

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

create table if not exists public.kd2_planning_inputs (
    id bigint generated always as identity primary key,
    battalion_id bigint not null references public.kd2_battalions(id) on delete cascade,
    vehicle_type text not null check (vehicle_type in ('K9', 'K10', 'K11')),
    required_quantity integer check (required_quantity >= 0),
    delivery_deadline date,
    skip_friday boolean not null default true,
    include_saturday boolean not null default false,
    assumptions_status text not null default 'pending' check (assumptions_status in ('pending', 'confirmed')),
    notes text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (battalion_id, vehicle_type)
);

create table if not exists public.planning_non_work_days (
    id bigint generated always as identity primary key,
    module_id text not null,
    off_date date not null,
    label text,
    is_active boolean not null default true,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (module_id, off_date)
);

create table if not exists public.kd2_vehicle_units (
    id bigint generated always as identity primary key,
    battalion_id bigint not null references public.kd2_battalions(id) on delete cascade,
    vehicle_type text not null check (vehicle_type in ('K9', 'K10', 'K11')),
    unit_serial integer not null check (unit_serial > 0),
    unit_label text,
    unit_code text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (battalion_id, vehicle_type, unit_serial),
    unique (vehicle_type, unit_code)
);

create table if not exists public.kd2_plan (
    id bigint generated always as identity primary key,
    battalion_id bigint not null references public.kd2_battalions(id) on delete restrict,
    vehicle_type text not null check (vehicle_type in ('K9', 'K10', 'K11')),
    unit_serial integer check (unit_serial > 0),
    unit_label text,
    category_code text not null,
    station_code text not null,
    category_sequence integer not null check (category_sequence > 0),
    station_sequence_in_category integer not null check (station_sequence_in_category > 0),
    route_sequence integer not null check (route_sequence > 0),
    schedule_week text,
    planned_start_date date not null,
    planned_end_date date not null,
    planning_source text not null default 'manual' check (planning_source in ('manual', 'import', 'generated')),
    remark text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    check (planned_end_date >= planned_start_date),
    foreign key (vehicle_type, category_code)
        references public.kd2_process_categories (vehicle_type, category_code)
        on update cascade,
    foreign key (vehicle_type, station_code)
        references public.kd2_process_stations (vehicle_type, station_code)
        on update cascade,
    unique (battalion_id, vehicle_type, unit_serial, station_code)
);

create table if not exists public.kd2_progress (
    id bigint generated always as identity primary key,
    plan_id bigint not null unique references public.kd2_plan(id) on delete cascade,
    actual_start_date date,
    completion_date date,
    completed boolean not null default false,
    notes text,
    updated_at timestamptz not null default timezone('utc', now()),
    check (completion_date is null or actual_start_date is null or completion_date >= actual_start_date)
);

drop trigger if exists trg_kd2_battalions_updated_at on public.kd2_battalions;
create trigger trg_kd2_battalions_updated_at
before update on public.kd2_battalions
for each row execute function public.set_updated_at();

drop trigger if exists trg_kd2_process_categories_updated_at on public.kd2_process_categories;
create trigger trg_kd2_process_categories_updated_at
before update on public.kd2_process_categories
for each row execute function public.set_updated_at();

drop trigger if exists trg_kd2_process_stations_updated_at on public.kd2_process_stations;
create trigger trg_kd2_process_stations_updated_at
before update on public.kd2_process_stations
for each row execute function public.set_updated_at();

drop trigger if exists trg_kd2_process_routes_updated_at on public.kd2_process_routes;
create trigger trg_kd2_process_routes_updated_at
before update on public.kd2_process_routes
for each row execute function public.set_updated_at();

drop trigger if exists trg_kd2_process_lead_times_updated_at on public.kd2_process_lead_times;
create trigger trg_kd2_process_lead_times_updated_at
before update on public.kd2_process_lead_times
for each row execute function public.set_updated_at();

drop trigger if exists trg_kd2_template_layout_items_updated_at on public.kd2_template_layout_items;
create trigger trg_kd2_template_layout_items_updated_at
before update on public.kd2_template_layout_items
for each row execute function public.set_updated_at();

drop trigger if exists trg_kd2_planning_inputs_updated_at on public.kd2_planning_inputs;
create trigger trg_kd2_planning_inputs_updated_at
before update on public.kd2_planning_inputs
for each row execute function public.set_updated_at();

drop trigger if exists trg_planning_non_work_days_updated_at on public.planning_non_work_days;
create trigger trg_planning_non_work_days_updated_at
before update on public.planning_non_work_days
for each row execute function public.set_updated_at();

drop trigger if exists trg_kd2_vehicle_units_updated_at on public.kd2_vehicle_units;
create trigger trg_kd2_vehicle_units_updated_at
before update on public.kd2_vehicle_units
for each row execute function public.set_updated_at();

drop trigger if exists trg_kd2_plan_updated_at on public.kd2_plan;
create trigger trg_kd2_plan_updated_at
before update on public.kd2_plan
for each row execute function public.set_updated_at();

drop trigger if exists trg_kd2_progress_updated_at on public.kd2_progress;
create trigger trg_kd2_progress_updated_at
before update on public.kd2_progress
for each row execute function public.set_updated_at();

insert into public.kd2_process_categories (vehicle_type, category_code, category_name, category_sequence, notes)
values
    ('K9', 'welding', 'Welding', 1, 'KD2 upstream welding and final weld steps'),
    ('K9', 'machining', 'Machining', 2, 'KD2 qualifying and machining steps'),
    ('K9', 'shot_blasting_painting', 'Shot Blasting and Painting', 3, 'KD2 cleaning, shot blasting, painting, inspection, and re-tapping steps'),
    ('K9', 'assembly', 'Assembly', 4, 'KD1 downstream assembly route reused for KD2'),
    ('K9', 'processing', 'Processing', 5, 'KD1 downstream processing route reused for KD2'),
    ('K9', 'final_test', 'Final Test', 6, 'KD1 downstream final-test route reused for KD2'),
    ('K10', 'welding', 'Welding', 1, 'KD2 upstream welding and final weld steps'),
    ('K10', 'machining', 'Machining', 2, 'KD2 qualifying and machining steps'),
    ('K10', 'shot_blasting_painting', 'Shot Blasting and Painting', 3, 'KD2 cleaning, shot blasting, painting, inspection, repair, and re-tapping steps'),
    ('K10', 'assembly', 'Assembly', 4, 'KD1 downstream assembly route reused for KD2'),
    ('K10', 'processing', 'Processing', 5, 'KD1 downstream processing route reused for KD2'),
    ('K10', 'final_test', 'Final Test', 6, 'KD1 downstream final-test route reused for KD2'),
    ('K11', 'welding', 'Welding', 1, 'KD2 upstream welding and final weld steps'),
    ('K11', 'machining', 'Machining', 2, 'KD2 qualifying and machining steps'),
    ('K11', 'shot_blasting_painting', 'Shot Blasting and Painting', 3, 'KD2 cleaning, shot blasting, painting, inspection, repair, and re-tapping steps'),
    ('K11', 'assembly', 'Assembly', 4, 'KD1 downstream assembly route reused for KD2'),
    ('K11', 'processing', 'Processing', 5, 'KD1 downstream processing route reused for KD2'),
    ('K11', 'final_test', 'Final Test', 6, 'KD1 downstream final-test route reused for KD2')
on conflict (vehicle_type, category_code) do update
set
    category_name = excluded.category_name,
    category_sequence = excluded.category_sequence,
    notes = excluded.notes,
    is_active = true;

with station_seed (
    vehicle_type,
    category_code,
    station_code,
    station_name,
    work_center,
    station_sequence_in_category,
    route_sequence,
    notes
) as (
    values
    ('K9', 'welding', 'k9_hull_floor', 'Hull - Floor', 'W05, W06', 1, 1, 'K9 hull route'),
    ('K9', 'welding', 'k9_hull_lower_hull', 'Hull - Lower Hull', 'W07, W08', 2, 2, 'K9 hull route'),
    ('K9', 'welding', 'k9_hull_upper_hull_1st', 'Hull - Upper Hull 1st', 'W20', 3, 3, 'K9 hull route'),
    ('K9', 'welding', 'k9_hull_upper_hull_2nd', 'Hull - Upper Hull 2nd', 'W21', 4, 4, 'K9 hull route'),
    ('K9', 'welding', 'k9_hull_marriage_1st', 'Hull - Marriage 1st', 'W11, W12', 5, 5, 'K9 hull route'),
    ('K9', 'welding', 'k9_hull_marriage_2nd', 'Hull - Marriage 2nd', 'W13, W14', 6, 6, 'K9 hull route'),
    ('K9', 'welding', 'k9_hull_stowage_1st', 'Hull - Stowage 1st', 'W15, W16', 7, 7, 'K9 hull route'),
    ('K9', 'welding', 'k9_hull_stowage_2nd', 'Hull - Stowage 2nd', 'W16, W18', 8, 8, 'K9 hull route'),
    ('K9', 'welding', 'k9_hull_final_weld_1st', 'Hull - Final Weld 1st', 'W19', 9, 9, 'K9 hull route'),
    ('K9', 'machining', 'k9_hull_qualifying_form_mold', 'Hull - Qualifying Form Mold', null, 1, 10, 'K9 hull route'),
    ('K9', 'machining', 'k9_hull_machining_1st', 'Hull - Machining 1st', null, 2, 11, 'K9 hull route'),
    ('K9', 'machining', 'k9_hull_machining_2nd', 'Hull - Machining 2nd', null, 3, 12, 'K9 hull route'),
    ('K9', 'shot_blasting_painting', 'k9_hull_deburring', 'Hull - Deburring', null, 1, 13, 'K9 hull route'),
    ('K9', 'shot_blasting_painting', 'k9_hull_steam_cleaning', 'Hull - Steam cleaning', null, 2, 14, 'K9 hull route'),
    ('K9', 'welding', 'k9_hull_final_weld_2nd', 'Hull - Final Weld 2nd', null, 10, 15, 'K9 hull route'),
    ('K9', 'shot_blasting_painting', 'k9_hull_shot_blasting', 'Hull - Shot Blasting', null, 3, 16, 'K9 hull route'),
    ('K9', 'shot_blasting_painting', 'k9_hull_painting_re_tapping', 'Hull - Painting Re-tapping', null, 4, 17, 'K9 hull route'),
    ('K9', 'welding', 'k9_turret_bottom_plate', 'Turret - Bottom Plate', 'W24', 11, 1, 'K9 turret route parallel with hull route'),
    ('K9', 'welding', 'k9_turret_top_plate', 'Turret - Top Plate', 'W25, W26', 12, 2, 'K9 turret route parallel with hull route'),
    ('K9', 'welding', 'k9_turret_marriage_1st', 'Turret - Marriage 1st', 'W22', 13, 3, 'K9 turret route parallel with hull route'),
    ('K9', 'welding', 'k9_turret_marriage_2nd', 'Turret - Marriage 2nd', 'W23', 14, 4, 'K9 turret route parallel with hull route'),
    ('K9', 'welding', 'k9_turret_stowage', 'Turret - Stowage', 'W28', 15, 5, 'K9 turret route parallel with hull route'),
    ('K9', 'welding', 'k9_turret_final_weld_1st', 'Turret - Final Weld 1st', 'W19', 16, 6, 'K9 turret route parallel with hull route'),
    ('K9', 'machining', 'k9_turret_qualifying', 'Turret - Qualifying', null, 4, 10, 'K9 turret route parallel with hull route'),
    ('K9', 'machining', 'k9_turret_machining', 'Turret - Machining', null, 5, 11, 'K9 turret route parallel with hull route'),
    ('K9', 'machining', 'k9_turret_deburring', 'Turret - Deburring', null, 6, 12, 'K9 turret route parallel with hull route'),
    ('K9', 'shot_blasting_painting', 'k9_turret_steam_cleaning', 'Turret - Steam Cleaning', null, 5, 14, 'K9 turret route parallel with hull route'),
    ('K9', 'welding', 'k9_turret_final_weld_2nd', 'Turret - Final Weld 2nd', null, 17, 15, 'K9 turret route parallel with hull route'),
    ('K9', 'shot_blasting_painting', 'k9_turret_shot_blasting', 'Turret - Shot blasting', null, 6, 16, 'K9 turret route parallel with hull route'),
    ('K9', 'shot_blasting_painting', 'k9_turret_painting', 'Turret - Painting', null, 7, 17, 'K9 turret route parallel with hull route'),
    ('K9', 'shot_blasting_painting', 'k9_turret_re_tapping', 'Turret - Re-tapping', null, 8, 17, 'K9 turret route parallel with hull route'),
    ('K10', 'welding', 'k10_floor', 'Floor', null, 1, 1, 'K10 upstream route'),
    ('K10', 'welding', 'k10_lower_hull', 'Lower Hull', 'W09', 2, 2, 'K10 upstream route'),
    ('K10', 'welding', 'k10_hull_marriage_1st', 'Hull Marriage 1st', 'W30', 3, 3, 'K10 upstream route'),
    ('K10', 'welding', 'k10_hull_marriage_2nd_w31', 'Hull Marriage 2nd', 'W31', 4, 4, 'K10 upstream route'),
    ('K10', 'welding', 'k10_hull_marriage_2nd_w32', 'Hull Marriage 2nd', 'W32', 5, 5, 'K10 upstream route'),
    ('K10', 'welding', 'k10_stowage_1st', 'Stowage 1st', 'W33', 6, 6, 'K10 upstream route'),
    ('K10', 'welding', 'k10_stowage_2nd', 'Stowage 2nd', 'W34', 7, 7, 'K10 upstream route'),
    ('K10', 'welding', 'k10_hull_final_1st', 'Hull Final 1st', 'W35', 8, 8, 'K10 upstream route'),
    ('K10', 'machining', 'k10_first_qualifying_form_mold', '1st Qualifying Form Mold', null, 1, 9, 'K10 upstream route'),
    ('K10', 'machining', 'k10_hull_machining_1st', 'Hull Machining 1st', null, 2, 10, 'K10 upstream route'),
    ('K10', 'shot_blasting_painting', 'k10_steam_cleaning_1', 'Steam Cleaning', null, 1, 11, 'K10 upstream route'),
    ('K10', 'welding', 'k10_cargo_marriage', 'Cargo Marriage', 'W36, W38', 9, 12, 'K10 upstream route'),
    ('K10', 'welding', 'k10_cargo_stowage', 'Cargo Stowage', null, 10, 13, 'K10 upstream route'),
    ('K10', 'welding', 'k10_final_weld_1st', 'Final Weld 1st', null, 11, 14, 'K10 upstream route'),
    ('K10', 'machining', 'k10_second_qualifying_form_mold', '2nd Qualifying Form Mold', null, 3, 15, 'K10 upstream route'),
    ('K10', 'machining', 'k10_cargo_machining_2nd', 'Cargo Machining 2nd', null, 4, 16, 'K10 upstream route'),
    ('K10', 'shot_blasting_painting', 'k10_deburring', 'Deburring', null, 2, 17, 'K10 upstream route'),
    ('K10', 'shot_blasting_painting', 'k10_steam_cleaning_2', 'Steam Cleaning', null, 3, 18, 'K10 upstream route'),
    ('K10', 'welding', 'k10_final_weld_2nd', 'Final Weld 2nd', null, 12, 19, 'K10 upstream route'),
    ('K10', 'shot_blasting_painting', 'k10_inspection', 'Inspection', null, 4, 20, 'K10 upstream route'),
    ('K10', 'shot_blasting_painting', 'k10_repair', 'Repair', null, 5, 21, 'K10 upstream route'),
    ('K10', 'shot_blasting_painting', 'k10_shot_blasting', 'Shot Blasting', null, 6, 22, 'K10 upstream route'),
    ('K10', 'shot_blasting_painting', 'k10_painting', 'Painting', null, 7, 23, 'K10 upstream route'),
    ('K10', 'shot_blasting_painting', 'k10_re_tapping', 'Re-tapping', null, 8, 24, 'K10 upstream route'),
    ('K11', 'welding', 'k11_floor', 'Floor', null, 1, 1, 'K11 upstream route'),
    ('K11', 'welding', 'k11_lower_hull', 'Lower Hull', 'W09', 2, 2, 'K11 upstream route'),
    ('K11', 'welding', 'k11_hull_marriage_1st', 'Hull Marriage 1st', 'W30', 3, 3, 'K11 upstream route'),
    ('K11', 'welding', 'k11_hull_marriage_2nd_w31', 'Hull Marriage 2nd', 'W31', 4, 4, 'K11 upstream route'),
    ('K11', 'welding', 'k11_hull_marriage_2nd_w32', 'Hull Marriage 2nd', 'W32', 5, 5, 'K11 upstream route'),
    ('K11', 'welding', 'k11_stowage_1st', 'Stowage 1st', 'W33', 6, 6, 'K11 upstream route'),
    ('K11', 'welding', 'k11_stowage_2nd', 'Stowage 2nd', 'W34', 7, 7, 'K11 upstream route'),
    ('K11', 'welding', 'k11_hull_final_1st', 'Hull Final 1st', 'W35', 8, 8, 'K11 upstream route'),
    ('K11', 'machining', 'k11_first_qualifying_form_mold', '1st Qualifying Form Mold', null, 1, 9, 'K11 upstream route'),
    ('K11', 'machining', 'k11_hull_machining_1st', 'Hull Machining 1st', null, 2, 10, 'K11 upstream route'),
    ('K11', 'shot_blasting_painting', 'k11_steam_cleaning_1', 'Steam Cleaning', null, 1, 11, 'K11 upstream route'),
    ('K11', 'welding', 'k11_cargo_marriage', 'Cargo Marriage', 'W36, W38', 9, 12, 'K11 upstream route'),
    ('K11', 'welding', 'k11_cargo_stowage', 'Cargo Stowage', null, 10, 13, 'K11 upstream route'),
    ('K11', 'welding', 'k11_final_weld_1st', 'Final Weld 1st', null, 11, 14, 'K11 upstream route'),
    ('K11', 'machining', 'k11_second_qualifying_form_mold', '2nd Qualifying Form Mold', null, 3, 15, 'K11 upstream route'),
    ('K11', 'machining', 'k11_cargo_machining_2nd', 'Cargo Machining 2nd', null, 4, 16, 'K11 upstream route'),
    ('K11', 'shot_blasting_painting', 'k11_deburring', 'Deburring', null, 2, 17, 'K11 upstream route'),
    ('K11', 'shot_blasting_painting', 'k11_steam_cleaning_2', 'Steam Cleaning', null, 3, 18, 'K11 upstream route'),
    ('K11', 'welding', 'k11_final_weld_2nd', 'Final Weld 2nd', null, 12, 19, 'K11 upstream route'),
    ('K11', 'shot_blasting_painting', 'k11_inspection', 'Inspection', null, 4, 20, 'K11 upstream route'),
    ('K11', 'shot_blasting_painting', 'k11_repair', 'Repair', null, 5, 21, 'K11 upstream route'),
    ('K11', 'shot_blasting_painting', 'k11_shot_blasting', 'Shot Blasting', null, 6, 22, 'K11 upstream route'),
    ('K11', 'shot_blasting_painting', 'k11_painting', 'Painting', null, 7, 23, 'K11 upstream route'),
    ('K11', 'shot_blasting_painting', 'k11_re_tapping', 'Re-tapping', null, 8, 24, 'K11 upstream route'),
    ('K9', 'assembly', 'k9_assembly_suspension', 'Suspension', 'A01', 1, 32, 'KD1 downstream route'),
    ('K9', 'assembly', 'k9_assembly_h_electric', 'H/Electric', 'A02', 2, 33, 'KD1 downstream route'),
    ('K9', 'assembly', 'k9_assembly_interior', 'Interior', 'A03', 3, 34, 'KD1 downstream route'),
    ('K9', 'assembly', 'k9_assembly_engine', 'Engine', 'A04', 4, 35, 'KD1 downstream route'),
    ('K9', 'assembly', 'k9_assembly_turret_gun', 'Turret/Gun', 'A05/A11', 5, 36, 'KD1 downstream route'),
    ('K9', 'assembly', 'k9_assembly_hydraulic', 'Hydraulic', 'A06', 6, 37, 'KD1 downstream route'),
    ('K9', 'assembly', 'k9_assembly_bore_sight', 'Bore Sight', 'A07', 7, 38, 'KD1 downstream route'),
    ('K9', 'assembly', 'k9_assembly_turret', 'Turret', 'A08', 8, 33, 'KD1 downstream route parallel with A02'),
    ('K9', 'assembly', 'k9_assembly_t_electric_turret', 'T/Electric (TURRET)', 'A09', 9, 40, 'KD1 downstream route'),
    ('K9', 'assembly', 'k9_assembly_hyd_sub_turret', 'Hyd / Sub (TURRET)', 'A10', 10, 41, 'KD1 downstream route'),
    ('K9', 'processing', 'k9_processing_processing', 'Processing', 'Proc.', 1, 45, 'KD1 downstream route'),
    ('K9', 'processing', 'k9_processing_clean_dry', 'Clean/dry', null, 2, 46, 'KD1 downstream route'),
    ('K9', 'processing', 'k9_processing_masking', 'Masking', null, 3, 47, 'KD1 downstream route'),
    ('K9', 'processing', 'k9_processing_sanding', 'Sanding', null, 4, 48, 'KD1 downstream route'),
    ('K9', 'processing', 'k9_processing_painting', 'Painting', null, 5, 49, 'KD1 downstream route'),
    ('K9', 'processing', 'k9_processing_touch_up', 'Touch-up', null, 6, 50, 'KD1 downstream route'),
    ('K9', 'processing', 'k9_processing_attaching', 'Attaching', null, 7, 51, 'KD1 downstream route'),
    ('K9', 'final_test', 'k9_final_test_1insp', '#1Insp', null, 1, 52, 'KD1 downstream route'),
    ('K9', 'final_test', 'k9_final_test_test_run', 'TEST RUN', null, 2, 53, 'KD1 downstream route'),
    ('K9', 'final_test', 'k9_final_test_performance_test', 'Performance test', null, 3, 54, 'KD1 downstream route'),
    ('K9', 'final_test', 'k9_final_test_repair', 'REPAIR', null, 4, 55, 'KD1 downstream route'),
    ('K9', 'final_test', 'k9_final_test_check', 'CHECK', null, 5, 56, 'KD1 downstream route'),
    ('K9', 'final_test', 'k9_final_test_powerpack_check', 'Powerpack check', null, 6, 57, 'KD1 downstream route'),
    ('K9', 'final_test', 'k9_final_test_final_check', 'Final Check', 'F.Chk', 7, 58, 'KD1 downstream route'),
    ('K10', 'assembly', 'k10_assembly_suspension', 'Suspension', 'A01', 1, 25, 'KD1 downstream route'),
    ('K10', 'assembly', 'k10_assembly_track', 'Track', 'A02', 2, 26, 'KD1 downstream route'),
    ('K10', 'assembly', 'k10_assembly_engine', 'Engine', 'A13', 4, 28, 'KD1 downstream route'),
    ('K10', 'assembly', 'k10_assembly_electric_interior', 'Electric/Interior', 'A12', 5, 29, 'KD1 downstream route'),
    ('K10', 'assembly', 'k10_assembly_automation', 'Automation', 'A14', 6, 30, 'KD1 downstream route'),
    ('K10', 'assembly', 'k10_assembly_final_assembly', 'Final Assembly', 'A15', 7, 31, 'KD1 downstream route'),
    ('K10', 'processing', 'k10_processing_processing', 'Processing', 'Proc.', 1, 32, 'KD1 downstream route'),
    ('K10', 'processing', 'k10_processing_clean_dry', 'Clean/dry', null, 2, 33, 'KD1 downstream route'),
    ('K10', 'processing', 'k10_processing_masking', 'Masking', null, 3, 34, 'KD1 downstream route'),
    ('K10', 'processing', 'k10_processing_sanding', 'Sanding', null, 4, 35, 'KD1 downstream route'),
    ('K10', 'processing', 'k10_processing_painting', 'Painting', null, 5, 36, 'KD1 downstream route'),
    ('K10', 'processing', 'k10_processing_touch_up', 'Touch-up', null, 6, 37, 'KD1 downstream route'),
    ('K10', 'processing', 'k10_processing_attaching', 'Attaching', null, 7, 38, 'KD1 downstream route'),
    ('K10', 'final_test', 'k10_final_test_1insp', '#1Insp', null, 1, 39, 'KD1 downstream route'),
    ('K10', 'final_test', 'k10_final_test_test_run', 'TEST RUN', null, 2, 40, 'KD1 downstream route'),
    ('K10', 'final_test', 'k10_final_test_performance_test', 'Performance test', null, 3, 41, 'KD1 downstream route'),
    ('K10', 'final_test', 'k10_final_test_repair', 'REPAIR', null, 4, 42, 'KD1 downstream route'),
    ('K10', 'final_test', 'k10_final_test_check', 'CHECK', null, 5, 43, 'KD1 downstream route'),
    ('K10', 'final_test', 'k10_final_test_powerpack_check', 'Powerpack check', null, 6, 44, 'KD1 downstream route'),
    ('K10', 'final_test', 'k10_final_test_final_check', 'Final Check', 'F.Chk', 7, 45, 'KD1 downstream route'),
    ('K11', 'assembly', 'k11_assembly_suspension', 'Suspension', 'A01', 1, 25, 'KD1 downstream route'),
    ('K11', 'assembly', 'k11_assembly_track', 'Track', 'A02', 2, 26, 'KD1 downstream route'),
    ('K11', 'assembly', 'k11_assembly_engine', 'Engine', 'A13', 4, 28, 'KD1 downstream route'),
    ('K11', 'assembly', 'k11_assembly_electric_interior', 'Electric/Interior', 'A12', 5, 29, 'KD1 downstream route'),
    ('K11', 'assembly', 'k11_assembly_automation', 'Automation', 'A14', 6, 30, 'KD1 downstream route'),
    ('K11', 'assembly', 'k11_assembly_final_assembly', 'Final Assembly', 'A15', 7, 31, 'KD1 downstream route'),
    ('K11', 'processing', 'k11_processing_processing', 'Processing', 'Proc.', 1, 32, 'KD1 downstream route'),
    ('K11', 'processing', 'k11_processing_clean_dry', 'Clean/dry', null, 2, 33, 'KD1 downstream route'),
    ('K11', 'processing', 'k11_processing_masking', 'Masking', null, 3, 34, 'KD1 downstream route'),
    ('K11', 'processing', 'k11_processing_sanding', 'Sanding', null, 4, 35, 'KD1 downstream route'),
    ('K11', 'processing', 'k11_processing_painting', 'Painting', null, 5, 36, 'KD1 downstream route'),
    ('K11', 'processing', 'k11_processing_touch_up', 'Touch-up', null, 6, 37, 'KD1 downstream route'),
    ('K11', 'processing', 'k11_processing_attaching', 'Attaching', null, 7, 38, 'KD1 downstream route'),
    ('K11', 'final_test', 'k11_final_test_1insp', '#1Insp', null, 1, 39, 'KD1 downstream route'),
    ('K11', 'final_test', 'k11_final_test_test_run', 'TEST RUN', null, 2, 40, 'KD1 downstream route'),
    ('K11', 'final_test', 'k11_final_test_performance_test', 'Performance test', null, 3, 41, 'KD1 downstream route'),
    ('K11', 'final_test', 'k11_final_test_repair', 'REPAIR', null, 4, 42, 'KD1 downstream route'),
    ('K11', 'final_test', 'k11_final_test_check', 'CHECK', null, 5, 43, 'KD1 downstream route'),
    ('K11', 'final_test', 'k11_final_test_powerpack_check', 'Powerpack check', null, 6, 44, 'KD1 downstream route'),
    ('K11', 'final_test', 'k11_final_test_final_check', 'Final Check', 'F.Chk', 7, 45, 'KD1 downstream route')
)
insert into public.kd2_process_stations (
    vehicle_type,
    category_code,
    station_code,
    station_name,
    work_center,
    station_sequence_in_category,
    route_sequence,
    notes
)
select
    vehicle_type,
    category_code,
    station_code,
    station_name,
    work_center,
    station_sequence_in_category,
    route_sequence,
    notes
from station_seed
on conflict (vehicle_type, station_code) do update
set
    category_code = excluded.category_code,
    station_name = excluded.station_name,
    work_center = excluded.work_center,
    station_sequence_in_category = excluded.station_sequence_in_category,
    route_sequence = excluded.route_sequence,
    notes = excluded.notes,
    is_active = true;

insert into public.kd2_process_routes (vehicle_type, category_code, station_code, route_sequence)
select
    vehicle_type,
    category_code,
    station_code,
    route_sequence
from public.kd2_process_stations
on conflict (vehicle_type, station_code) do update
set
    category_code = excluded.category_code,
    route_sequence = excluded.route_sequence,
    is_active = true;

insert into public.kd2_process_lead_times (vehicle_type, category_code, station_code, planning_level, lead_time_days, notes)
select
    vehicle_type,
    category_code,
    null,
    'category',
    null,
    'Pending business confirmation'
from public.kd2_process_categories
on conflict (vehicle_type, category_code, station_code, planning_level) do nothing;

insert into public.kd2_process_lead_times (vehicle_type, category_code, station_code, planning_level, lead_time_days, notes)
select
    vehicle_type,
    category_code,
    station_code,
    'station',
    null,
    'Pending business confirmation'
from public.kd2_process_stations
on conflict (vehicle_type, category_code, station_code, planning_level) do nothing;

create or replace view public.kd2_plan_live as
select
    p.id,
    p.vehicle_type as vehicle,
    coalesce(
        p.unit_label,
        vu.unit_label,
        case
            when p.unit_serial is not null then concat(b.battalion_code, ' / ', p.vehicle_type, '-', lpad(p.unit_serial::text, 2, '0'))
            else b.battalion_code
        end
    ) as vehicle_no,
    c.category_name as category,
    c.category_code,
    s.station_name as process_station,
    s.station_code,
    s.work_center,
    p.schedule_week as week,
    p.planned_start_date as start_date,
    p.planned_end_date as end_date,
    p.remark,
    c.category_sequence as step_sequence,
    s.station_sequence_in_category,
    p.route_sequence,
    b.battalion_code,
    g.id as progress_id,
    g.completed,
    g.completion_date,
    g.actual_start_date,
    g.notes,
    g.updated_at as progress_updated_at
from public.kd2_plan p
join public.kd2_battalions b on b.id = p.battalion_id
join public.kd2_process_categories c
    on c.vehicle_type = p.vehicle_type
   and c.category_code = p.category_code
   and c.is_active = true
join public.kd2_process_stations s
    on s.vehicle_type = p.vehicle_type
   and s.station_code = p.station_code
   and s.is_active = true
left join public.kd2_vehicle_units vu
    on vu.battalion_id = p.battalion_id
   and vu.vehicle_type = p.vehicle_type
   and vu.unit_serial = p.unit_serial
left join public.kd2_progress g on g.plan_id = p.id;

commit;
