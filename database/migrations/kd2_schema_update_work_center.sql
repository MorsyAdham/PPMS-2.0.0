begin;

alter table if exists public.kd2_process_stations
add column if not exists work_center text;

update public.kd2_process_categories
set
    category_sequence = category_sequence + 1000,
    is_active = false
where category_code in (
    'cutting',
    'part_machining',
    'sub_weldment',
    'main_weldment',
    'structure_machining',
    'qualifing',
    'foam',
    'pre_processing'
);

alter table if exists public.kd2_process_stations
    drop constraint if exists kd2_process_stations_vehicle_type_route_sequence_key;

alter table if exists public.kd2_process_routes
    drop constraint if exists kd2_process_routes_vehicle_type_route_sequence_key;

delete from public.kd2_process_routes
where
    (vehicle_type = 'K9' and station_code not like 'k9\_%' escape '\') or
    (vehicle_type = 'K10' and station_code not like 'k10\_%' escape '\') or
    (vehicle_type = 'K11' and station_code not like 'k11\_%' escape '\');

delete from public.kd2_process_stations
where
    (vehicle_type = 'K9' and station_code not like 'k9\_%' escape '\') or
    (vehicle_type = 'K10' and station_code not like 'k10\_%' escape '\') or
    (vehicle_type = 'K11' and station_code not like 'k11\_%' escape '\');

update public.kd2_process_routes
set is_active = false
where
    (vehicle_type = 'K9' and station_code in ('k9_assembly_electric_interior', 'k9_assembly_automation', 'k9_assembly_final_assembly')) or
    (vehicle_type in ('K10', 'K11') and station_code like '%_assembly_interior');

update public.kd2_process_stations
set is_active = false
where
    (vehicle_type = 'K9' and station_code in ('k9_assembly_electric_interior', 'k9_assembly_automation', 'k9_assembly_final_assembly')) or
    (vehicle_type in ('K10', 'K11') and station_code like '%_assembly_interior');

update public.kd2_process_stations
set
    station_sequence_in_category = station_sequence_in_category + 1000,
    route_sequence = route_sequence + 1000,
    is_active = false
where category_code in (
    'cutting',
    'part_machining',
    'sub_weldment',
    'main_weldment',
    'structure_machining',
    'qualifing',
    'foam',
    'pre_processing'
);

update public.kd2_process_stations
set
    station_sequence_in_category = station_sequence_in_category + 1000,
    route_sequence = route_sequence + 1000,
    is_active = false
where station_code not like 'k9\_%' escape '\'
  and station_code not like 'k10\_%' escape '\'
  and station_code not like 'k11\_%' escape '\';

update public.kd2_process_routes
set
    route_sequence = route_sequence + 1000,
    is_active = false
where category_code in (
    'cutting',
    'part_machining',
    'sub_weldment',
    'main_weldment',
    'structure_machining',
    'qualifing',
    'foam',
    'pre_processing'
);

update public.kd2_process_routes
set
    route_sequence = route_sequence + 1000,
    is_active = false
where station_code not like 'k9\_%' escape '\'
  and station_code not like 'k10\_%' escape '\'
  and station_code not like 'k11\_%' escape '\';

insert into public.kd2_process_categories (vehicle_type, category_code, category_name, category_sequence, notes, is_active)
values
    ('K9', 'welding', 'Welding', 1, 'KD2 upstream welding and final weld steps', true),
    ('K9', 'machining', 'Machining', 2, 'KD2 qualifying and machining steps', true),
    ('K9', 'shot_blasting_painting', 'Shot Blasting and Painting', 3, 'KD2 cleaning, shot blasting, painting, inspection, and re-tapping steps', true),
    ('K9', 'assembly', 'Assembly', 4, 'KD1 downstream assembly route reused for KD2', true),
    ('K9', 'processing', 'Processing', 5, 'KD1 downstream processing route reused for KD2', true),
    ('K9', 'final_test', 'Final Test', 6, 'KD1 downstream final-test route reused for KD2', true),
    ('K10', 'welding', 'Welding', 1, 'KD2 upstream welding and final weld steps', true),
    ('K10', 'machining', 'Machining', 2, 'KD2 qualifying and machining steps', true),
    ('K10', 'shot_blasting_painting', 'Shot Blasting and Painting', 3, 'KD2 cleaning, shot blasting, painting, inspection, repair, and re-tapping steps', true),
    ('K10', 'assembly', 'Assembly', 4, 'KD1 downstream assembly route reused for KD2', true),
    ('K10', 'processing', 'Processing', 5, 'KD1 downstream processing route reused for KD2', true),
    ('K10', 'final_test', 'Final Test', 6, 'KD1 downstream final-test route reused for KD2', true),
    ('K11', 'welding', 'Welding', 1, 'KD2 upstream welding and final weld steps', true),
    ('K11', 'machining', 'Machining', 2, 'KD2 qualifying and machining steps', true),
    ('K11', 'shot_blasting_painting', 'Shot Blasting and Painting', 3, 'KD2 cleaning, shot blasting, painting, inspection, repair, and re-tapping steps', true),
    ('K11', 'assembly', 'Assembly', 4, 'KD1 downstream assembly route reused for KD2', true),
    ('K11', 'processing', 'Processing', 5, 'KD1 downstream processing route reused for KD2', true),
    ('K11', 'final_test', 'Final Test', 6, 'KD1 downstream final-test route reused for KD2', true)
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
    notes,
    is_active
)
select
    vehicle_type,
    category_code,
    station_code,
    station_name,
    work_center,
    station_sequence_in_category,
    route_sequence,
    notes,
    true
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

insert into public.kd2_process_routes (vehicle_type, category_code, station_code, route_sequence, is_active)
select
    vehicle_type,
    category_code,
    station_code,
    route_sequence,
    true
from public.kd2_process_stations
where is_active = true
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
where is_active = true
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
where is_active = true
on conflict (vehicle_type, category_code, station_code, planning_level) do nothing;

drop view if exists public.kd2_plan_live;

create view public.kd2_plan_live as
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
