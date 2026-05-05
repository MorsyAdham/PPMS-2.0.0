# Project Structure

This repository contains planning documents plus the PPMS web application.

## Top Level

```text
.
|-- AGENTS.md
|-- PROJECT_STRUCTURE.md
|-- docs/
|   `-- planning/
|       |-- F200_K9_K10_K11_plan_structure.md
|       |-- KD2_project_status_checklist.md
|       |-- KD2_separation_discussion.md
|       `-- KD2_system_update_implementation_phases.md
`-- PPMS/
    |-- index.html
    |-- login.html
    |-- system-test.html
    |-- assets/
    |   `-- favicon.png
    |-- archive/
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
    |   `-- system-test.js
    |-- sql/
    |   |-- kd2_schema_update_work_center.sql
    |   |-- planning_non_work_days_delta.sql
    |   `-- supabase_kd2_schema.sql
    |-- styles/
    |   |-- styles.css
    |   `-- system-test.css
    `-- tools/
        `-- upload_to_supabase.py
```

## Folder Purpose

- `docs/planning/`: Business and planning source documents for F200 and KD2.
- `PPMS/`: Main application root and browser entry pages.
- `PPMS/assets/`: Shared static files used by active pages.
- `PPMS/archive/`: Old or special-purpose files kept for reference, not active runtime files.
- `PPMS/data/workbooks/`: Excel inputs or reference workbooks.
- `PPMS/scripts/`: Application JavaScript modules and test harness logic.
- `PPMS/sql/`: Database schema and update scripts.
- `PPMS/styles/`: Stylesheets separated from page HTML.
- `PPMS/tools/`: Local support scripts such as upload utilities.

## Working Rules

- Keep entry pages in `PPMS/` unless there is a strong reason to change the browser entry path.
- Put new planning documents in `docs/planning/`.
- Put new JavaScript in `PPMS/scripts/` and new CSS in `PPMS/styles/`.
- Put SQL changes in `PPMS/sql/`.
- Put helper scripts in `PPMS/tools/`.
- Move outdated or one-off files into `PPMS/archive/` instead of leaving them beside active code.
