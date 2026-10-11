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

| Tab | Monitor | Control |
|---|---|---|
| Overview | Site up/response time and version, deploy sync, database health, public-key exposure check, today's activity, KD2 progress by vehicle type and battalion | — |
| Deploy | Uncommitted files, origin ahead/behind, files not yet deployed, app vs app-v2 drift | Fetch, push to origin, `deploy.sh` for app/ or app-v2/ |
| Users | Accounts, roles, modules, last sign-in | Role, modules, export, activate/disable (audited; last Master Admin protected) |
| Notice & maintenance | Current banner | Banner text/level, read-only mode for everyone except Master Admin |
| Activity | Active users today, new issues, latest audit log | — |
| Backups & SQL | Table row counts, existing backups | JSON backup of all PPMS tables to `BACKUP_DIR`; saved read-only SQL checks (`checks/*.sql`) |

## Safety

- Listens on 127.0.0.1 only, checks the Host header and requires a per-start
  token, so other websites cannot call it.
- Touches PPMS tables only — the Supabase project is shared with SIMS,
  Assembly, Machining and others.
- Never reads `password_hash` except inside a full backup. Backups must live
  outside the repository (refused otherwise) — keep that folder private.
- The service key bypasses all database security. Never commit `.env`.
