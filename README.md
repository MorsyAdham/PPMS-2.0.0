# PPMS — Production Planning & Monitoring System

Planning workspace for the F200 (K9 / K10 / K11) and F100 programmes, plus the
PPMS web app that tracks the plans against actual production.

**Live site:** https://morsyadham.github.io/Planning-Monitoring-System/

## Folder layout

```text
.
├── app/                 CURRENT live app (GitHub Pages) — bug fixes only
│   ├── index.html       Main dashboard entry page
│   ├── login.html       Login entry page
│   ├── assets/          Images, icons, favicon
│   ├── scripts/         JavaScript (app.js, kd2.js, core/, features/, pages/, templates/)
│   └── styles/          CSS (base, theme, components/, features/, pages/)
├── app-v2/              NEW secure app (same layout as app/), Vercel — replaces app/ at cut-over
├── database/            Supabase SQL — kept in git, never deployed
│   ├── migrations/      Numbered schema changes, applied in order in the Supabase SQL editor
│   ├── schema/          Base KD2 schema
│   └── f100/            F100 tables, policies and seed data
├── docs/
│   ├── planning/        F200 / KD2 planning documents
│   ├── f100/            F100 implementation plan and checklist
│   ├── engineering/     Code structure guide for app/
│   └── bug-log.txt      Running log of reported issues and fixes
├── data/workbooks/      Reference Excel plans
└── tools/
    ├── deploy.sh              Publish app/ to the live site
    └── upload_to_supabase.py  Import an Excel plan into Supabase
```

## Modules

The app has three modules, chosen after login:

| Module | What it plans |
|---|---|
| F200-KD1 | Original K9/K10/K11 assembly plan (`assembly_plan` table) |
| F200-KD2 | Battalion-based K9/K10/K11 plan (`kd2_*` tables, `kd2.js`) |
| F100-KD2 | Gun and vehicle parts (`f100_*` tables) |

## Running locally

There is no build step. Serve `app/` with any static server (for example the
VS Code Live Server extension, opened on `app/index.html`). The app talks
directly to the shared Supabase project, so local changes see live data.

## Making a change

1. Edit files in `app/` (code) or `database/migrations/` (SQL).
2. Test the affected page in the browser.
3. Commit to `main` and push to `origin` (this workspace repo).
4. Deploy: `bash tools/deploy.sh` — see below.

New SQL goes in `database/migrations/` with the next free number
(e.g. `56_short_description.sql`) and is run by hand in the Supabase SQL editor.

## Two app folders (temporary, until the security cut-over)

- `app/` is the system everyone uses today. Only bug fixes go here, and any
  fix made here must also be applied to `app-v2/`.
- `app-v2/` is the same app being upgraded for security (SC-01: Supabase Auth
  login and database access rules). It is deployed to Vercel for testing.
  No database changes that affect `app/` are made until cut-over.
- At cut-over the database rules are applied, users move to the Vercel site,
  and `app-v2/` becomes `app/` again — back to a single folder.

## Deploying

The live site is GitHub Pages on the
[`Planning-Monitoring-System`](https://github.com/MorsyAdham/Planning-Monitoring-System)
repo, whose contents are exactly `app/`.

```bash
bash tools/deploy.sh                 # app/    -> main (live site), reuses the latest commit message
bash tools/deploy.sh "Fix unit filter serials"
bash tools/deploy.sh --v2            # app-v2/ -> v2 branch (Vercel)
```

The script copies `app/` into a temporary checkout of the live repo, commits
and pushes. It refuses to run if `app/` has uncommitted changes. One-time
setup on a new machine:

```bash
git remote add production https://github.com/MorsyAdham/Planning-Monitoring-System.git
```

## Repositories

| Remote | Repo | Contents |
|---|---|---|
| `origin` | `MorsyAdham/PPMS-2.0.0` | This whole workspace (source of truth) |
| `production` | `MorsyAdham/Planning-Monitoring-System` | `main` = deployed `app/` (GitHub Pages); `v2` = deployed `app-v2/` (Vercel) — do not edit directly |
