# PPMS Control Panel

A local dashboard to monitor and control PPMS. It runs only on this computer
(`http://127.0.0.1:4317`) and is never deployed.

## Start

Double-click `start.cmd`, or run `node tools/control-panel/server.mjs`. The
browser opens automatically (`--no-open` to skip). Stop with Ctrl+C.

## One-time setup

1. Copy `.env.example` to `.env` (git-ignored) and paste the Supabase
   **service_role** key (Project Settings → API). Without it, only the site and
   deploy panels work.
2. Optional: add `SUPABASE_ACCESS_TOKEN` (Account → Access Tokens) to run the
   saved SQL checks.
3. Run `database/migrations/61_system_notice.sql` in the Supabase SQL editor
   and deploy the app version that reads it, to enable the banner and
   maintenance mode.

## What it does

Every page starts with a short explanation, and **Help & glossary** explains
the terms. **Overview → Needs attention** lists anything wrong, with a button to
the page that fixes it.

| Page | Monitor | Control |
|---|---|---|
| Overview | Site up/speed/version, database health, security, today's users, KD2 progress per plan version | — |
| Activity & audit log | Who is active today, new issues, searchable audit log with before/after detail | — |
| Users & access | All accounts, role, modules, export, last sign-in | Add user, edit, reset password, disable/enable, delete (last Master Admin protected) |
| Plan versions | Every KD1/KD2/F100 plan revision with row counts | Rename, archive, restore (won't archive a baseline or the last available version) |
| Production issues | Open / in progress / critical counts, full list | Change status and priority |
| Announcements | Current banner | Banner text and colour, maintenance (read-only) mode, live preview |
| Releases & app version | Version users are on, full version history, unpublished/uncommitted code, app vs app-v2 drift | Publish to live or test site, **restore an earlier version** (`tools/rollback.sh`), push to GitHub |
| Database & backups | Public-key exposure check, table sizes, backups | One-click JSON backup; read-only SQL checks (`checks/*.sql`) |

Every change made from the panel is written to the PPMS audit log as
`control-panel@local`.

## Safety

- Listens on 127.0.0.1 only, checks the Host header and requires a per-start
  token, so other websites cannot call it.
- Touches PPMS tables only — the Supabase project is shared with SIMS,
  Assembly, Machining and others.
- Never reads `password_hash` except inside a full backup. Backups must live
  outside the repository (refused otherwise) — keep that folder private.
- The service key bypasses all database security. Never commit `.env`.
