-- ================================================================
-- Migration 57: User-managed Production Issue categories
-- ================================================================
--
-- Categories were a fixed list enforced by a check constraint on
-- production_issues.category (migration 32). Users now need to add their
-- own categories from the Report Issue form, so the list moves into a table
-- and the check constraint is replaced by a foreign key to it.
--
-- Safe for the current app/: it keeps working before and after this runs
-- (the app falls back to the built-in 10 categories if the table is missing).
-- Existing issues are unaffected — every value they use is seeded below.

create table if not exists public.production_issue_categories (
    code             text primary key,
    label            text not null,
    sort_order       integer not null default 500,
    is_active        boolean not null default true,
    created_by_name  text,
    created_by_email text,
    created_at       timestamptz not null default timezone('utc', now())
);

-- Labels are unique regardless of case ("Painting" vs "painting")
create unique index if not exists uq_production_issue_categories_label
    on public.production_issue_categories (lower(label));

-- Built-in categories. New ones get sort_order 500 (after these, before Other).
insert into public.production_issue_categories (code, label, sort_order) values
    ('cutting',        'Cutting',        10),
    ('part_machining', 'Part Machining', 20),
    ('welding',        'Welding',        30),
    ('machining',      'Machining',      40),
    ('accessories',    'Accessories',    50),
    ('cables',         'Cables',         60),
    ('material',       'Material',       70),
    ('assembly',       'Assembly',       80),
    ('quality',        'Quality',        90),
    ('other',          'Other',          1000)
on conflict (code) do nothing;

-- Replace the fixed check constraint with a foreign key to the table
do $$
declare
    c record;
begin
    for c in
        select con.conname
        from pg_constraint con
        join pg_class rel on rel.oid = con.conrelid
        join pg_namespace ns on ns.oid = rel.relnamespace
        where ns.nspname = 'public'
          and rel.relname = 'production_issues'
          and con.contype = 'c'
          and pg_get_constraintdef(con.oid) ilike '%category%'
    loop
        execute format('alter table public.production_issues drop constraint %I', c.conname);
    end loop;
end $$;

alter table public.production_issues
    drop constraint if exists production_issues_category_fkey;
alter table public.production_issues
    add constraint production_issues_category_fkey
    foreign key (category) references public.production_issue_categories (code)
    on update cascade;

-- Same access model as production_issues (migration 32) until the SC-01
-- security rebuild replaces it.
alter table public.production_issue_categories enable row level security;

drop policy if exists "allow_all_authenticated" on public.production_issue_categories;
create policy "allow_all_authenticated"
    on public.production_issue_categories
    for all
    using (true)
    with check (true);
