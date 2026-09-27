-- ================================================================
-- Migration 32: Create production_issues table
-- ================================================================

create table if not exists public.production_issues (
    id                  bigint generated always as identity primary key,
    title               text not null,
    description         text,
    category            text not null
                            check (category in (
                                'cutting', 'part_machining', 'welding', 'machining',
                                'accessories', 'cables', 'material', 'assembly',
                                'quality', 'other'
                            )),
    proposed_solution   text,
    status              text not null default 'open'
                            check (status in ('open', 'in_progress', 'resolved', 'closed')),
    priority            text not null default 'medium'
                            check (priority in ('low', 'medium', 'high', 'critical')),
    reporter_name       text,
    reporter_email      text not null,
    updated_by_name     text,
    updated_by_email    text,
    created_at          timestamptz not null default timezone('utc', now()),
    updated_at          timestamptz not null default timezone('utc', now()),
    resolved_at         timestamptz,
    notes               text
);

-- updated_at trigger function (reuse if already exists)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at := timezone('utc', now());
    return new;
end;
$$;

drop trigger if exists trg_production_issues_updated_at on public.production_issues;
create trigger trg_production_issues_updated_at
    before update on public.production_issues
    for each row execute procedure public.set_updated_at();

-- RLS: enable but allow all authenticated requests (app handles auth via session)
alter table public.production_issues enable row level security;

drop policy if exists "allow_all_authenticated" on public.production_issues;
create policy "allow_all_authenticated"
    on public.production_issues
    for all
    using (true)
    with check (true);

-- Useful indexes
create index if not exists idx_production_issues_status   on public.production_issues (status);
create index if not exists idx_production_issues_priority on public.production_issues (priority);
create index if not exists idx_production_issues_category on public.production_issues (category);
create index if not exists idx_production_issues_reporter on public.production_issues (reporter_email);
create index if not exists idx_production_issues_created  on public.production_issues (created_at desc);
