# Repository Guidelines

## Project Structure

See [`README.md`](./README.md) for the full layout. In short:

- `app/` — the CURRENT live PPMS app (GitHub Pages). Bug fixes only.
- `app-v2/` — the new secure version in development (Vercel, `v2` branch). Security/auth work goes here. **Any bug fix made in `app/` must also be applied to `app-v2/`.** The two folders merge back into one `app/` at the security cut-over. Do not make database changes that would break `app/` before cut-over.
- `database/` — Supabase SQL (`migrations/`, `schema/`, `f100/`). Tracked in git, never deployed.
- `docs/planning/` — F200 / KD2 planning documents, including the main source [`F200_K9_K10_K11_plan_structure.md`](./docs/planning/F200_K9_K10_K11_plan_structure.md).
- `docs/f100/` — F100 plan documents. `docs/engineering/` — code structure guide for `app/`.
- `data/workbooks/` — reference Excel files. `tools/` — helper scripts, including `deploy.sh`.

Keep new planning Markdown under `docs/planning/`. Keep app files inside the matching `app/` subfolder (`scripts/`, `styles/`, `assets/`), not the `app/` root. New SQL goes in `database/migrations/` with the next free number.

## Build, Test, and Deploy

There is no build pipeline or automated test suite.

- Serve `app/` with a static server (e.g. VS Code Live Server on `app/index.html`) and test the affected page manually. Confirm there are no console errors, broken links, or missing assets.
- `node --check app/scripts/app.js` — quick syntax check after editing a script.
- A change is **not shipped** until it is deployed: commit, push to `origin`, then run `bash tools/deploy.sh` (for `app-v2/`: `bash tools/deploy.sh --v2`). The live site is GitHub Pages on the `production` remote (`MorsyAdham/Planning-Monitoring-System`), whose contents are exactly `app/`. Never edit or force-push the `production` repo directly.

## Coding Style & Naming Conventions

Write Markdown in clear business English with short sections and ordered headings. Preserve manufacturing terms exactly as defined in source material, including names such as `Sub weldment` and `Structure machining (Ingersoll)`.

Use descriptive file names with underscores, for example `F200_<scope>_summary.md`. For web files, follow the existing simple naming style: `index.html`, `app.js`, `styles.css`.

## Testing Guidelines

Validate document changes by checking Markdown rendering, table readability, and consistency of quantities, lead times, and backward-planning logic. For `app/`, test the affected page in-browser. KD2 unit labels (M1, M2…) repeat in every battalion, so check unit-level changes with more than one battalion.

## Commit & Pull Request Guidelines

Use short imperative commit messages such as `Clarify K9 assembly lead-time inputs` or `Fix KD2 unit filter serials`.

Pull requests should include:

- a short summary of the change
- the business reason for it
- source references when planning values or deadlines change
- screenshots only when document formatting or frontend UI changed

## Document Control

Do not invent missing production values. Leave unknown items blank or mark them as pending confirmation. When changing assumptions, state whether they apply to `K9`, `K10`, `K11`, or all vehicle types.
