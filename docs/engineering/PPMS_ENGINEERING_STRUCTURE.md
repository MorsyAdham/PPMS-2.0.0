# PPMS Engineering Structure

This document defines the PPMS runtime structure. The live app lives in `app/`; database SQL lives in `database/` and is not deployed.

## Ownership Map

- `app/index.html`, `app/login.html`: thin browser entry shells only.
- `app/scripts/core/`: shared bootstrapping, storage, guards, DOM helpers, client creation, and cross-feature utilities.
- `app/scripts/pages/`: one entry module per HTML page. Each page owns page-level boot order.
- `app/scripts/features/`: feature-owned markup and future runtime splits. Each active feature module should expose `initFeature(context)`.
- `app/scripts/templates/`: JS-rendered dialogs or reusable page-layout fragments. Keep modal markup here instead of inline in HTML shells.
- `app/styles/components/`: shared components that can be reused by multiple features.
- `app/styles/features/`: feature-scoped styles. Keep selectors near the owning feature instead of adding unrelated rules to a single global file.
- `app/styles/pages/`: page-only styles such as login.
- `database/schema/`: base schema definitions.
- `database/migrations/`: one-way schema deltas and corrective SQL, numbered in the order they were applied.

## Adding A Page

1. Create a thin HTML shell in `app/` with a single mount node such as `#pageRoot`.
2. Add one page entry module under `app/scripts/pages/` and load it with `type="module"`.
3. Put page-specific layout fragments in `app/scripts/templates/` or feature modules rather than hard-coding them in the HTML shell.
4. Put page-only CSS in `app/styles/pages/`.

## Adding A Feature

1. Create or extend one folder under `app/scripts/features/`.
2. Keep the public surface small: `initFeature(context)` plus any internal helpers required by that feature.
3. Accept dependencies explicitly through the `context` object instead of reading loose globals.
4. Put feature selectors in `app/styles/features/`.
5. If the feature needs dialogs, add them through `app/scripts/templates/modal-registry.js`.

## Shared Logic Rules

- Put Supabase access setup in `app/scripts/core/supabase-client.js`.
- Put session, roles, and navigation guards in `app/scripts/core/session.js` and `app/scripts/core/guards.js`.
- Put generic DOM/event utilities in `app/scripts/core/dom.js` and `app/scripts/core/events.js`.
- If a helper cannot be owned clearly by one feature, move it into `core/`.
- Do not add new inline runtime JavaScript to page HTML.
