# Project Structure

This repository contains planning documents plus the PPMS web application.

## Top Level

```text
.
|-- AGENTS.md
|-- PROJECT_STRUCTURE.md
|-- docs/
|   |-- planning/
|   |   |-- F200_K9_K10_K11_plan_structure.md
|   |   |-- KD2_project_status_checklist.md
|   |   |-- KD2_separation_discussion.md
|   |   `-- KD2_system_update_implementation_phases.md
|   `-- engineering/
|       `-- PPMS_ENGINEERING_STRUCTURE.md
`-- PPMS/
    |-- index.html
    |-- login.html
    |-- system-test.html
    |-- assets/
    |   |-- favicon.png
    |   |-- icons/
    |   `-- images/
    |-- archive/
    |   |-- legacy/
    |   |   `-- README.md
    |   `-- obfuscated/
    |       |-- app-obfuscator.js
    |       `-- login-obfuscator.html
    |-- data/
    |   `-- workbooks/
    |       `-- KD1 PLAN RIMELINE - 22 FEB 2026.xlsx
    |-- scripts/
    |   |-- app.js
    |   |-- gantt-module.js
    |   |-- kd2.js
    |   |-- system-test.js
    |   |-- core/
    |   |-- features/
    |   |-- pages/
    |   `-- templates/
    |-- sql/
    |   |-- migrations/
    |   |-- schema/
    |   `-- views/
    |-- styles/
    |   |-- base.css
    |   |-- theme.css
    |   |-- layout.css
    |   |-- styles.css
    |   |-- system-test.css
    |   |-- components/
    |   |-- features/
    |   `-- pages/
    `-- tools/
        `-- upload_to_supabase.py
```

## Folder Purpose

- `docs/planning/`: Business and planning source documents for F200 and KD2.
- `docs/engineering/`: Implementation-facing ownership and extension rules.
- `PPMS/`: Main application root and browser entry pages.
- `PPMS/assets/`: Shared static files used by active pages.
- `PPMS/archive/`: Old or special-purpose files kept for reference, not active runtime files.
- `PPMS/data/workbooks/`: Excel inputs or reference workbooks.
- `PPMS/scripts/core/`: Shared runtime helpers and bootstrap logic.
- `PPMS/scripts/pages/`: Page entry modules loaded by the three HTML shells.
- `PPMS/scripts/features/`: Feature-owned modules and future runtime splits.
- `PPMS/scripts/templates/`: JS-rendered page and dialog templates.
- `PPMS/sql/schema/`: Base schema definitions.
- `PPMS/sql/migrations/`: SQL deltas and corrective scripts.
- `PPMS/sql/views/`: Views and derived SQL artifacts.
- `PPMS/styles/components/`: Shared component styles.
- `PPMS/styles/features/`: Feature-owned styles.
- `PPMS/styles/pages/`: Page-only styles.
- `PPMS/tools/`: Local support scripts such as upload utilities.

## Working Rules

- Keep entry pages in `PPMS/` unless there is a strong reason to change the browser entry path.
- Put new planning documents in `docs/planning/`.
- Put shared JavaScript in `PPMS/scripts/core/`, page bootstraps in `PPMS/scripts/pages/`, and feature logic in `PPMS/scripts/features/`.
- Put shared dialogs and layout fragments in `PPMS/scripts/templates/`.
- Put CSS into `PPMS/styles/components/`, `PPMS/styles/features/`, or `PPMS/styles/pages/` according to ownership.
- Put SQL changes in `PPMS/sql/schema/`, `PPMS/sql/migrations/`, or `PPMS/sql/views/`.
- Put helper scripts in `PPMS/tools/`.
- Move outdated or one-off files into `PPMS/archive/` instead of leaving them beside active code.
