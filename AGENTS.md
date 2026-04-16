# Repository Guidelines

## Project Structure & Module Organization

This workspace mixes planning documents with a small web prototype. The main planning source is [`F200_K9_K10_K11_plan_structure.md`](./F200_K9_K10_K11_plan_structure.md). Related business notes such as `KD2_separation_discussion.md` and `KD2_system_update_implementation_phases.md` live at the repository root.

The `PPMS/` folder contains the lightweight application assets:

- `PPMS/index.html` and `PPMS/login.html` for entry pages
- `PPMS/app.js` for client-side behavior
- `PPMS/styles.css` for styling
- `PPMS/upload_to_supabase.py` for data upload support

Keep new Markdown documents at the root only when they directly support the F200 planning flow. Keep app-specific files inside `PPMS/`.

## Build, Test, and Development Commands

There is no formal build pipeline. Use lightweight local checks:

- `Get-ChildItem -Force` — inspect workspace contents
- `rg --files` — list files quickly
- `Get-Content .\F200_K9_K10_K11_plan_structure.md` — review the main planning document
- `Get-Content .\PPMS\app.js` — inspect frontend logic

For frontend review, open `PPMS/index.html` in a browser and verify layout, interactions, and asset loading manually.

## Coding Style & Naming Conventions

Write Markdown in clear business English with short sections and ordered headings. Preserve manufacturing terms exactly as defined in source material, including names such as `Sub weldment` and `Structure machining (Ingersoll)`.

Use descriptive file names with underscores, for example `F200_<scope>_summary.md`. For web files, follow the existing simple naming style: `index.html`, `app.js`, `styles.css`.

## Testing Guidelines

There is no automated test suite. Validate changes by checking Markdown rendering, table readability, and consistency of quantities, lead times, and backward-planning logic. For `PPMS/`, test the affected page manually in-browser and confirm there are no broken links or missing assets.

## Commit & Pull Request Guidelines

Git history is not available in this workspace snapshot, so use short imperative commit messages such as `Clarify K9 assembly lead-time inputs` or `Update PPMS login page copy`.

Pull requests should include:

- a short summary of the change
- the business reason for it
- source references when planning values or deadlines change
- screenshots only when document formatting or frontend UI changed

## Document Control

Do not invent missing production values. Leave unknown items blank or mark them as pending confirmation. When changing assumptions, state whether they apply to `K9`, `K10`, `K11`, or all vehicle types.
