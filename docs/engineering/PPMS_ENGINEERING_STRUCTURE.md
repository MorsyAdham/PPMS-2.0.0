# PPMS Engineering Structure

This document defines the active PPMS runtime structure after the ES-module shell refactor.

## Ownership Map

- `PPMS/index.html`, `PPMS/login.html`, `PPMS/system-test.html`: thin browser entry shells only.
- `PPMS/scripts/core/`: shared bootstrapping, storage, guards, DOM helpers, client creation, and cross-feature utilities.
- `PPMS/scripts/pages/`: one entry module per HTML page. Each page owns page-level boot order.
- `PPMS/scripts/features/`: feature-owned markup and future runtime splits. Each active feature module should expose `initFeature(context)`.
- `PPMS/scripts/templates/`: JS-rendered dialogs or reusable page-layout fragments. Keep modal markup here instead of inline in HTML shells.
- `PPMS/styles/components/`: shared components that can be reused by multiple features.
- `PPMS/styles/features/`: feature-scoped styles. Keep selectors near the owning feature instead of adding unrelated rules to a single global file.
- `PPMS/styles/pages/`: page-only styles such as login or the internal test harness.
- `PPMS/sql/schema/`: base schema definitions.
- `PPMS/sql/migrations/`: one-way schema deltas and corrective SQL.
- `PPMS/sql/views/`: SQL views or derived read models.
- `PPMS/archive/`: inactive files only. Nothing in this folder should be part of an active runtime import path.

## Adding A Page

1. Create a thin HTML shell in `PPMS/` with a single mount node such as `#pageRoot`.
2. Add one page entry module under `PPMS/scripts/pages/` and load it with `type="module"`.
3. Put page-specific layout fragments in `PPMS/scripts/templates/` or feature modules rather than hard-coding them in the HTML shell.
4. Put page-only CSS in `PPMS/styles/pages/`.

## Adding A Feature

1. Create or extend one folder under `PPMS/scripts/features/`.
2. Keep the public surface small: `initFeature(context)` plus any internal helpers required by that feature.
3. Accept dependencies explicitly through the `context` object instead of reading loose globals.
4. Put feature selectors in `PPMS/styles/features/`.
5. If the feature needs dialogs, add them through `PPMS/scripts/templates/modal-registry.js`.

## Shared Logic Rules

- Put Supabase access setup in `PPMS/scripts/core/supabase-client.js`.
- Put session, roles, and navigation guards in `PPMS/scripts/core/session.js` and `PPMS/scripts/core/guards.js`.
- Put generic DOM/event utilities in `PPMS/scripts/core/dom.js` and `PPMS/scripts/core/events.js`.
- If a helper cannot be owned clearly by one feature, move it into `core/`.
- Do not add new inline runtime JavaScript to page HTML.

## Archive Rules

- Move obfuscated, superseded, or one-off reference files into `PPMS/archive/`.
- Archived files may be kept for traceability, but active pages must not import them.
- If a legacy file is still needed temporarily, keep it outside `archive/` until the replacement is complete.
