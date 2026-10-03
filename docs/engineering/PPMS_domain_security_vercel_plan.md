# PPMS — Domain, Security and Vercel Migration Plan

| | |
|---|---|
| **Document** | PPMS_domain_security_vercel_plan.md |
| **Status** | Plan — ready to execute when approved |
| **Owner** | Adham Morsy (PPMS administrator) |
| **Scope** | Buy and connect the `ppms.app` domain · secure the system in `app-v2/` (closes **SC-01**) · move from GitHub Pages to Vercel · redirect the old address |
| **Applies to** | All modules (F200 KD1, F200 KD2, F100 KD2) and all users |
| **Written** | October 2026 (PPMS v139) |

---

## Contents

1. [Summary](#1-summary)
2. [Where we are today](#2-where-we-are-today)
3. [Where we want to be](#3-where-we-want-to-be)
4. [Key facts behind the plan](#4-key-facts-behind-the-plan)
5. [Recommended hosting and database](#5-recommended-hosting-and-database) — options compared, pros and cons, recommendation
6. [Phase overview and timeline](#6-phase-overview-and-timeline)
7. [Phase 0 — Preparation](#7-phase-0--preparation)
8. [Phase 1 — Buy the domain](#8-phase-1--buy-the-domain)
9. [Phase 2 — Build the secure system in app-v2](#9-phase-2--build-the-secure-system-in-app-v2)
10. [Phase 3 — Staging on Vercel](#10-phase-3--staging-on-vercel)
11. [Phase 4 — Cut-over day](#11-phase-4--cut-over-day)
12. [Phase 5 — Redirect the old GitHub Pages address](#12-phase-5--redirect-the-old-github-pages-address)
13. [Phase 6 — After cut-over](#13-phase-6--after-cut-over)
14. [Rollback plan](#14-rollback-plan)
15. [Costs](#15-costs)
16. [Risks and how we handle them](#16-risks-and-how-we-handle-them)
17. [How Claude can implement this end to end](#17-how-claude-can-implement-this-end-to-end)
18. [Appendices](#18-appendices) — DNS records · role permission matrix · test checklist · user email templates · glossary

---

## 1. Summary

PPMS works well, but it has one serious open issue (**SC-01**): anyone who has the public database key can read and change every table, because the database cannot tell one user from another. This plan fixes that properly, gives PPMS a professional address (**https://ppms.app**), and moves hosting to Vercel — in a way that never breaks the system people use every day.

**The approach in one paragraph:** we build the secure version in `app-v2/` against a **separate staging copy** of the database, so the live system is untouched. When it has passed testing, we pick a quiet day for **cut-over**: apply the security changes to the live database, publish `app-v2` on Vercel at `ppms.app`, switch the old GitHub Pages site to a page that **redirects everyone to the new address**, and retire the old database keys. Users sign in once with the new login and carry on.

**Recommended setup (Section 5):** Supabase Pro for the database, login and live updates, and Vercel Pro for hosting — the smallest, safest change from today. Cloudflare Pages is the free-hosting alternative; company servers (self-hosted Supabase) if IT does not allow cloud storage.

**Nothing in this plan needs to be bought now.** The domain (`ppms.app`) and any paid plans are bought only at the step where they are needed (Section 8, Section 15).

---

## 2. Where we are today

```text
 Browser (app/ — GitHub Pages)                           Supabase (one shared project)
 https://morsyadham.github.io/Planning-Monitoring-System
 ┌───────────────────────────────┐   public anon key    ┌──────────────────────────────┐
 │ login page: SHA-256(password) │ ───────────────────► │ planning_app_users (readable) │
 │ compares hash in the browser  │                      │ kd2_*, f100_*, assembly_*,    │
 │ role checks done in browser   │ ◄─────────────────── │ production_issues, audit log  │
 └───────────────────────────────┘   every table:       │ RLS: "anon … USING (true)"    │
                                      read/write/delete  └──────────────────────────────┘
```

| Area | Today | Risk |
|---|---|---|
| Login | Custom table `planning_app_users`; password stored as **unsalted SHA-256**, compared in the browser | The user table must be readable by anyone for login to work; hashes are weak |
| Database access | One public **anon key** in `app/scripts/core/config.js`; policies allow `anon` to select/insert/update/delete | Anyone with the key (it is in both public GitHub repos) can read or change all data |
| Roles | Viewer / Operator / Planner / Master Admin enforced **only in the browser** | A user can bypass them with the browser's developer tools |
| Audit log | Written **by the browser** | Can be skipped or forged |
| Hosting | GitHub Pages, public repo `Planning-Monitoring-System` | Source and key are public (acceptable *after* the fix — see Section 4) |
| Address | `morsyadham.github.io/Planning-Monitoring-System` | Long, personal-looking |

`app-v2/` exists and is identical to `app/` except one stylesheet change — **the security work has not started yet**, so this plan starts from a clean, known point.

---

## 3. Where we want to be

```text
 Browser (app-v2 → Vercel)          https://ppms.app
 ┌────────────────────────────┐  publishable key + user's login token   ┌─────────────────────────────────┐
 │ Supabase Auth sign-in      │ ──────────────────────────────────────► │ auth.users  (bcrypt passwords)  │
 │ (password never leaves as  │                                         │ profiles: role, modules, export │
 │  a comparable hash)        │ ◄────────────────────────────────────── │ RLS: per role + per module      │
 │ security headers, HTTPS    │   only rows this user may see/change    │ audit log written by triggers   │
 └────────────────────────────┘                                         │ admin actions via Edge Function │
            ▲                                                           └─────────────────────────────────┘
            │  old address redirects here
 morsyadham.github.io/Planning-Monitoring-System  →  https://ppms.app
```

| Area | Target |
|---|---|
| Login | **Supabase Auth** (industry-standard, bcrypt-hashed passwords, rate-limited, optional MFA for admins) |
| Database access | **Row Level Security (RLS)** on every table: a request is allowed only if the signed-in user's role and modules allow it. The browser key alone grants **nothing** |
| Roles | Enforced **in the database**; the browser only hides buttons for convenience |
| Privileged actions | Creating users, changing roles → a server-side **Edge Function** that checks the caller is a Master Admin |
| Audit log | Written by **database triggers** — complete and tamper-proof |
| Keys | New Supabase **publishable** key in the browser; **secret** key only on servers; the old (public) keys **disabled** |
| Hosting | **Vercel**, from a **private** repository, with security headers |
| Address | **https://ppms.app**; the old GitHub address redirects there |

---

## 4. Key facts behind the plan

Understanding these avoids common mistakes:

1. **The browser key is meant to be public.** Every web app that talks to Supabase from the browser ships a public key (anon / *publishable*). Hiding it is impossible — the browser has to send it. **Security comes from the database rules (RLS) and real user logins, not from hiding that key.** Once RLS is in place, the public key on its own can do nothing.
2. **The secret key must never reach the browser.** Supabase's `service_role` / *secret* key bypasses all rules. It is used only inside Edge Functions, Vercel environment variables, or on your own PC for one-off admin scripts — never in `app-v2/` files and never in git.
3. **The live database is shared with today's system.** Changing its rules early would break `app/` for everyone (this is a standing rule in `AGENTS.md`). That is why all security work is built and tested on a **staging copy** (Phase 3) and applied to the live database only on cut-over day (Phase 4).
4. **Old passwords can't be copied into Supabase Auth.** They are SHA-256, which Supabase Auth does not accept. We therefore migrate each user **automatically at their first sign-in** (Section 9.3) — they type their usual password once and are moved across invisibly.
5. **`.app` domains are HTTPS-only.** Browsers refuse plain `http://` for every `.app` site. Vercel and GitHub Pages both issue free certificates automatically; the only effect is that the site is reachable a few minutes after DNS is set, once the certificate is issued.
6. **Vercel's free (Hobby) plan is for personal, non-commercial use.** A company production system should run on **Vercel Pro** (Section 15). Testing on Hobby is fine.
7. **Supabase free projects pause after 7 days without use and have no automatic backups you can restore yourself.** Daily use keeps it awake, but a production system should be on **Supabase Pro** for daily backups (Section 15).

---

## 5. Recommended hosting and database

PPMS does not have to stay on the technology it uses today. This section compares every realistic setup we discussed and recommends one. The rest of the plan is written for the recommended setup; Section 5.6 explains what changes if a different one is chosen.

### 5.1 What PPMS needs from its hosting and database

| # | Requirement | Why it matters for PPMS |
|---|---|---|
| R1 | **Real database security** — per-user login and per-role rules on the server | Closes SC-01; required for any setup |
| R2 | **Live updates** (realtime changes, presence, broadcast) | Co-editing, "Plan updated by …", Live edits panel, notifications |
| R3 | **Relational data (SQL)** with joins, views and transactions | Plans, progress, routes, versions and the `kd2_plan_live` view are relational |
| R4 | **Reliable backups** you can restore yourself | Production data entered daily |
| R5 | **Low maintenance** | One administrator; no full-time IT/DevOps |
| R6 | **Reasonable cost** for ~10–50 internal users | Internal company tool |
| R7 | **Small migration effort** from today | The app (≈ 25 000 lines) is written against Supabase's client and PostgreSQL |
| R8 | **Data location and control** acceptable to the company | Defence-related production data — company / client policy may restrict where it is stored |
| R9 | **Fast, global, HTTPS static hosting** with security headers and custom domain | `ppms.app`, security headers, instant deploys |
| R10 | **Company single sign-on (SSO)** — *nice to have* | Sign in with company Microsoft / Google accounts |

> **Check first (R8):** ask the company's IT / security team whether production data for this programme may be stored with a cloud provider, and if so in which region. If cloud storage is **not** allowed, only setups **F** and **G** below are possible.

### 5.2 Setups compared

| | Setup | Hosting | Database & auth |
|---|---|---|---|
| **A** | *Today (no change)* | GitHub Pages | Supabase Free, custom login, open RLS |
| **B** | **Vercel + Supabase** *(this plan's baseline)* | Vercel | Supabase (Auth + RLS) |
| **C** | Cloudflare Pages + Supabase | Cloudflare Pages | Supabase (Auth + RLS) |
| **D** | Netlify + Supabase | Netlify | Supabase (Auth + RLS) |
| **E** | Firebase | Firebase Hosting | Firestore + Firebase Auth |
| **F** | Microsoft Azure | Azure Static Web Apps | Azure Database for PostgreSQL + Entra ID (company Microsoft accounts) + an API layer |
| **G** | Company servers (on-premises) | Company web server (IIS / Nginx) | Self-hosted Supabase **or** PostgreSQL + own API, inside the company network |
| **H** | Full-stack rewrite | Vercel (Next.js) | Neon / any PostgreSQL + Auth.js + own API |

### 5.3 Full comparison

**Scores:** ●●● strong · ●● adequate · ● weak · — not met

| Criterion | A Today | **B Vercel + Supabase** | C Cloudflare + Supabase | D Netlify + Supabase | E Firebase | F Azure | G On-premises | H Rewrite |
|---|---|---|---|---|---|---|---|---|
| R1 Security (once built) | — (SC-01 open) | ●●● | ●●● | ●●● | ●●● | ●●● | ●●● (depends on IT) | ●●● |
| R2 Live updates | ●●● | ●●● (Supabase Realtime) | ●●● | ●●● | ●●● | ● (needs SignalR / Web PubSub) | ●●● self-hosted Supabase · ● plain PostgreSQL | ● (must build) |
| R3 Relational SQL | ●●● | ●●● | ●●● | ●●● | ● (document DB) | ●●● | ●●● | ●●● |
| R4 Backups | ● (free: none to restore) | ●●● (Supabase Pro daily) | ●●● | ●●● | ●● | ●●● | ●● (IT must run them) | ●●● |
| R5 Low maintenance | ●●● | ●●● | ●●● | ●●● | ●●● | ●● | ● | ●● |
| R6 Cost (monthly, approx.) | 0 | ~$45 (Vercel Pro 1 seat + Supabase Pro) | ~$25 (Cloudflare free + Supabase Pro) | ~$25–45 | pay-as-you-go, low | ~$30–80 | hardware + IT time | ~$20–45 + build cost |
| R7 Migration effort | none | **low** (same database, same client) | **low** | **low** | **very high** (rewrite data layer) | **high** (new API + realtime) | medium (self-hosted Supabase) to high | **very high** |
| R8 Data location / control | provider region | Supabase region of choice | same as B | same as B | Google region of choice | Azure region; company tenant | **full control, company network** | provider of choice |
| R9 Static hosting & headers | ● (no custom headers) | ●●● | ●●● | ●●● | ●●● | ●●● | ●● | ●●● |
| R10 Company SSO | — | ●● (Supabase Auth: Azure/Google SSO on Pro) | ●● | ●● | ●● | ●●● (Entra ID native) | ●● (via IT) | ●●● |
| Commercial use on the plan used | n/a | Vercel **Pro** required | ✓ on free plan | ✓ on free plan | ✓ | ✓ | ✓ | ✓ |
| Preview / staging deployments | — | ●●● | ●●● | ●●● | ●● | ●● | ● | ●●● |
| Automation by Claude in this workspace | ●●● | ●●● (Vercel connector available) | ●● (CLI) | ●● (CLI) | ●● | ●● | ● (needs IT access) | ●●● |
| Vendor lock-in | low | low (static files + standard PostgreSQL) | low | low | **high** | medium | none | low |

### 5.4 Pros and cons

**A — Today: GitHub Pages + Supabase Free (no change)**
- ✅ Free; already works; nothing to do.
- ❌ **SC-01: data open to anyone with the public key** — not acceptable to keep.
- ❌ No restorable backups on the free plan; project pauses after 7 days without use.
- ❌ GitHub Pages can't set security headers; source must be public on the free plan.
- **Verdict:** must change — at least the security part.

**B — Vercel + Supabase (Auth + RLS)** — *recommended*
- ✅ Keeps the database, the Supabase client and all existing code — the **smallest, safest migration**.
- ✅ Supabase Realtime already powers co-editing; PostgreSQL + RLS is a proven security model.
- ✅ Vercel: instant deploys, preview environments for testing, security headers, free HTTPS, works from a private repo; `app-v2` already deploys to Vercel.
- ✅ Claude can automate it end to end (Vercel connector + Supabase CLI).
- ❌ Vercel Pro is required for company use (per deploying member).
- ❌ Two providers to manage (Vercel + Supabase).

**C — Cloudflare Pages + Supabase**
- ✅ Same database benefits as B; **hosting free even for commercial use**, unlimited bandwidth, excellent global network.
- ✅ Cloudflare Access can put staging (or the whole site) behind company login for free (up to 50 users).
- ❌ Moving DNS to Cloudflare is recommended for the best results (a bit more setup).
- ❌ The existing `--v2` Vercel setup would be replaced; slightly less automation from this workspace.
- **Verdict:** the best **budget** alternative to B — almost identical result, lower cost.

**D — Netlify + Supabase**
- ✅ Very similar to B/C; commercial use allowed on the free plan.
- ❌ No advantage over B or C for PPMS; smaller free build/bandwidth allowances.
- **Verdict:** fine, but no reason to pick it over B or C.

**E — Firebase (Firestore + Firebase Auth)**
- ✅ Excellent realtime and auth; mature; pay-as-you-go.
- ❌ **Document database, not SQL** — every query, view, join and migration would have to be rewritten; reporting becomes harder.
- ❌ Very high migration effort and strong lock-in.
- **Verdict:** not suitable — too much rework for no gain.

**F — Microsoft Azure (Static Web Apps + Azure PostgreSQL + Entra ID)**
- ✅ Sign in with **company Microsoft accounts** (SSO, MFA and leaver handling by IT).
- ✅ Data in the company's own Azure tenant — attractive if IT already uses Azure / Microsoft 365.
- ❌ No built-in equivalent of Supabase's RLS-with-browser-access and Realtime: needs an **API layer** and a realtime service (SignalR / Web PubSub) — a large rebuild.
- ❌ Higher cost and more administration.
- **Verdict:** consider only if IT **requires** Microsoft hosting/SSO.

**G — Company servers (on-premises)**
- ✅ **Full control** — data never leaves the company network; satisfies the strictest policies.
- ✅ **Self-hosted Supabase** (Docker) keeps the same app, RLS and Realtime — migration effort is moderate.
- ❌ The company's IT must run servers, updates, security patches, backups and HTTPS certificates.
- ❌ Access from outside the office needs VPN; `ppms.app` would point to a company address or not be used.
- **Verdict:** the right choice **only if cloud storage is not allowed** — then choose self-hosted Supabase rather than a rebuild.

**H — Full-stack rewrite (Next.js + Neon/PostgreSQL + own API)**
- ✅ Maximum flexibility; server-rendered pages; every rule in your own API.
- ❌ Rebuilding ≈ 25 000 lines and the realtime layer — months of work and new bugs.
- **Verdict:** not justified; B reaches the same security with a fraction of the effort.

### 5.5 Recommendation

**Recommended: B — Vercel (Pro) for hosting + Supabase (Pro) for database, login and live updates.**

| Choice | Recommendation | Reason |
|---|---|---|
| Database | **Supabase Pro** (PostgreSQL) | Keeps all existing data, queries and realtime; daily backups; no pausing; RLS + Auth close SC-01 |
| Login | **Supabase Auth** (+ optional company SSO later) | Bcrypt passwords, rate limits, MFA; users keep their password (Section 9.3) |
| Hosting | **Vercel Pro** (1 deploying seat) | Already used for `app-v2`; previews, headers, private repo; fully automatable from this workspace |
| Domain | **ppms.app** at GoDaddy, DNS pointed to Vercel | As planned |
| Database region | The Supabase region closest to Egypt that IT accepts (e.g. EU – Frankfurt) | Speed and data-location policy |

**If budget matters most:** choose **C (Cloudflare Pages + Supabase Pro)** — the same security and features with free hosting.
**If IT forbids cloud storage:** choose **G with self-hosted Supabase** on company servers.
**Avoid:** E (Firebase) and H (rewrite) — high effort, no benefit for PPMS.

### 5.6 If a different setup is chosen

| Setup | What changes in this plan |
|---|---|
| **C Cloudflare Pages** | Replace "Vercel" with Cloudflare Pages in Phases 3–6: project root `app-v2/`; headers in a `_headers` file instead of `vercel.json`; environment variables in Pages settings; DNS records from Cloudflare (or move the domain's nameservers to Cloudflare); staging protected by Cloudflare Access |
| **D Netlify** | As C, with `netlify.toml` / `_headers` and Netlify's DNS records |
| **G On-premises** | Phase 3 runs on a company server: install self-hosted Supabase (Docker), restore the backup, apply the same migrations 60–69; host `app-v2/` on IIS/Nginx with the same headers; IT provides HTTPS and backups; the redirect (Phase 5) points to the internal address |
| **F Azure** | A separate project plan is needed (API layer + realtime rebuild); Phases 0, 1 and 5 still apply |

---

## 6. Phase overview and timeline

| Phase | What | Who | Effort | Live system affected? |
|---|---|---|---|---|
| **0** | Preparation: decisions, inventory, backups | Adham (+ Claude) | 0.5 day | No |
| **1** | Buy `ppms.app` | Adham (payment) | 30 min | No |
| **2** | Build secure `app-v2` (Auth, RLS, functions, headers) | Claude (+ Adham reviews) | 4–6 days | No |
| **3** | Staging on Vercel with a copy of the database; test every role | Claude + 2–3 test users | 2–3 days | No |
| **4** | Cut-over (quiet day, ~2–3 h window) | Claude + Adham | ½ day | **Yes — planned window** |
| **5** | Redirect old GitHub Pages address | Claude | 30 min (part of Phase 4) | Old address now redirects |
| **6** | Clean up: merge folders, close SC-01, monitor | Claude | 1 day | No |

**Suggested calendar:** Phases 0–3 can run in the background over 2 weeks while PPMS is used normally. Cut-over on a **Thursday afternoon** (lowest activity before the Friday weekend), announced one week ahead.

**Order of the domain:** the cleanest path is to buy `ppms.app` during Phase 3 and point it **straight at Vercel** — users only ever see `ppms.app` on the new, secure system. (If you want the nicer address earlier, Appendix A.3 shows how to point it at GitHub Pages first; moving it later is a 5-minute DNS change.)

---

## 7. Phase 0 — Preparation

### 7.1 Decisions to confirm

| # | Decision | Recommended |
|---|---|---|
| D1 | Domain | `ppms.app` (available when checked, Oct 2026) |
| D2 | Registrar | GoDaddy (as discussed) — keep it there; only DNS records change |
| D3 | Hosting after cut-over | Vercel (Pro plan for production) |
| D4 | Staging database | A second Supabase project, `ppms-staging` (free) |
| D5 | Password migration | Automatic on first sign-in (Section 9.3); admin reset as fallback |
| D6 | MFA (two-step login) | Required for Master Admins, optional for others |
| D7 | Workspace repo visibility | Make `PPMS-2.0.0` **private** once Vercel deploys from it |
| D8 | Cut-over date | A Thursday afternoon, announced one week ahead |
| D9 | Hosting and database (Section 5) | Vercel Pro + Supabase Pro (alternatives: Cloudflare Pages; on-premises if IT requires) |
| D10 | Database region and data policy | Confirm with IT where production data may be stored (Section 5.1, R8) |

### 7.2 Inventory (fill in before starting)

- [ ] Supabase project URL and which tables exist (export the list from the Table Editor).
- [ ] Number of users in `planning_app_users`, their roles, modules and `can_export`.
- [ ] Which Supabase Realtime channels the app uses (postgres changes + broadcast: audit, presence, edit activity — listed in Section 9.7).
- [ ] Any scripts that use the database directly (`tools/upload_to_supabase.py`) and which key they use.
- [ ] Who needs to know about the change (all users, IT, management).

### 7.3 Safety net

- [ ] **Full database backup** from Supabase (Database → Backups, or `pg_dump` — Appendix C.1). Keep it outside the repo.
- [ ] Note the current live version (e.g. v139) and git commit.
- [ ] Confirm `tools/deploy.sh` and `tools/deploy.sh --v2` both work.

---

## 8. Phase 1 — Buy the domain

> Do this during Phase 3 (or whenever you are ready). It costs money, so it is a step you perform; everything after the purchase can be done by Claude.

### 8.1 At GoDaddy

1. Search **`ppms.app`** and add it to the cart.
2. **Term:** 1 year with **auto-renew ON** — or 2–3 years if the renewal price equals the first-year price. *Check the renewal price in the cart before paying.*
3. **Protection:** the basic **Domain Privacy / Protection** tier (hides your personal details from the public registry). "Full" protection (extra verification before transfers) is optional insurance.
4. **Skip:** SSL certificates, website builder, hosting, and (unless you want `name@ppms.app` addresses) email. Vercel/GitHub provide free HTTPS.
5. Register it with an email address the company will keep long-term.

### 8.2 Secure the GoDaddy account (5 minutes, free, important)

- [ ] Turn on **two-step verification** (Account Settings → Login & PIN).
- [ ] Turn on **Domain Lock** (prevents unauthorised transfers; on by default).
- [ ] Turn on **auto-renew** and check the saved payment method's expiry date.
- [ ] Add a second, trusted contact if your company requires it.

### 8.3 Verify

`ppms.app` appears under **My Products → Domains** with status *Active*. No DNS records are needed yet — Phase 3/4 adds them.

---

## 9. Phase 2 — Build the secure system in app-v2

All work in this phase happens in `app-v2/` and in new files under `database/migrations/`. **Nothing is applied to the live database in this phase.** Each new migration is written so it can be applied to staging now and to production at cut-over.

### 9.1 New database objects (migrations 60–69, reserved)

| Migration | Purpose |
|---|---|
| `60_profiles.sql` | `public.profiles` (id = `auth.users.id`, email, full_name, role, modules[], can_export, is_active, legacy_user_id). Copied from `planning_app_users` |
| `61_auth_helpers.sql` | SQL helpers used by every policy: `app_role()`, `app_is_active()`, `app_has_module(text)`, `app_role_at_least(text)` — `security definer`, `stable`, fixed `search_path` |
| `62_rls_enable_all.sql` | `alter table … enable row level security` on **every** public table; drop all old `TO anon … USING (true)` policies |
| `63_rls_read.sql` | Read policies: signed-in, active users with access to that module |
| `64_rls_write.sql` | Write policies per role (see Appendix B) |
| `65_audit_triggers.sql` | Triggers that write `planning_audit_log` server-side with `auth.uid()`; client inserts no longer needed |
| `66_revoke_anon.sql` | `revoke all on all tables in schema public from anon`; the legacy user table becomes unreadable |
| `67_realtime_authorization.sql` | RLS on `realtime.messages` so broadcast/presence channels require sign-in |
| `68_legacy_login_bridge.sql` | Support for first-sign-in migration (Section 9.3) |
| `69_security_tests.sql` | Re-runnable checks (Appendix C.3) |

### 9.2 Roles and modules in the database

- `profiles.role` ∈ `viewer`, `operator`, `planner`, `master_admin` (`admin` → `operator`, as today).
- `profiles.modules` ⊆ `kd1`, `kd2`, `f100kd2`.
- Every policy calls the helpers, e.g. *a planner with module `kd2` may update `kd2_plan`*; *an operator may update `kd2_progress` but not `kd2_plan`*. Full matrix: **Appendix B**.
- `is_active = false` → the user can sign in but every query returns nothing; the app shows "account deactivated" (same message as today).

### 9.3 Login migration (users keep their password)

Goal: nobody needs a new password and nobody is locked out.

1. Before cut-over, a one-off admin script (run on a PC with the **secret** key, never committed) creates a Supabase Auth account for each user **without a password**, and a matching `profiles` row.
2. New login page in `app-v2`:
   - Try `supabase.auth.signInWithPassword(email, password)`.
   - If that fails **and** the user has not been migrated yet, call the Edge Function **`migrate-login`** with the email and password.
3. `migrate-login` (server-side, has the secret key):
   - Looks up the legacy row, checks `SHA-256(password)` against the stored hash, and that the user is active.
   - If it matches: sets that password on the Supabase Auth account (now stored with bcrypt), marks the profile as migrated, and **wipes the legacy hash**.
   - Returns OK; the page signs in normally.
   - Rate-limited and always returns the same error for "wrong password" and "no such user".
4. After ~30 days, users who never signed in are given a reset link by the admin; the legacy table is then dropped.

**Fallback:** a Master Admin can send any user a password-reset email, or set a temporary password that must be changed at first sign-in.

### 9.4 Server-side functions (Supabase Edge Functions)

| Function | Who may call it | What it does |
|---|---|---|
| `migrate-login` | Anyone (rate-limited) | Section 9.3 |
| `admin-users` | Master Admin only (checked from the caller's token + profile) | Create user, change role/modules/`can_export`, activate/deactivate, send reset email. Uses the secret key internally |
| *(optional)* `export-report` | Users with `can_export` | Only if exports should be enforced server-side; otherwise the button visibility + RLS read rules are enough |

### 9.5 Client changes in app-v2

| File / area | Change |
|---|---|
| `scripts/core/config.js` | Supabase URL + **publishable** key only (public by design). No secret ever |
| `scripts/core/supabase-client.js` | One shared client with `persistSession: true`, `autoRefreshToken: true` |
| `scripts/pages/login-page.js` | Supabase Auth sign-in + `migrate-login` fallback; remove SHA-256 and direct user-table read; "Forgot password?" link |
| `scripts/core/session.js` / `guards.js` | Session = Supabase session + `profiles` row; role checks read the profile (still used to hide buttons) |
| User Management (`app.js`) | Calls `admin-users` instead of writing `planning_app_users` |
| Change password | `supabase.auth.updateUser({ password })` |
| Sign out | `supabase.auth.signOut()` |
| Audit log | Stop writing from the browser (triggers do it); keep the reading screen |
| Realtime | Channels become `private: true`; postgres-changes now respect RLS automatically |
| Idle timeout | Sign out after N hours of inactivity (configurable) |

### 9.6 Security headers (Vercel)

`app-v2/vercel.json` adds, for every page:

| Header | Value (summary) | Why |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | HTTPS only |
| `Content-Security-Policy` | `default-src 'self'`; scripts from self + the CDNs PPMS uses (jsdelivr, cdnjs); connect to the Supabase URL (https + wss); `frame-ancestors 'none'` | Blocks injected scripts and click-jacking |
| `X-Content-Type-Options` | `nosniff` | |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | |
| `Permissions-Policy` | camera, microphone, geolocation off | |

> The current app uses inline `onclick=` handlers in a few places; the CSP allows them initially (`'unsafe-inline'` for scripts) and they are removed as a follow-up so the CSP can be tightened.

### 9.7 Supabase settings checklist (dashboard)

- [ ] **API keys:** create the new **publishable** and **secret** keys (Settings → API Keys). The app uses the publishable key; servers use the secret key.
- [ ] **Auth → Providers → Email:** enable; *disable public sign-ups* (only admins create users); confirm email optional (internal users).
- [ ] **Auth → Policies:** minimum password length 10; enable leaked-password protection (if on the plan).
- [ ] **Auth → Rate limits:** keep defaults or tighten sign-in attempts.
- [ ] **Auth → URL configuration:** Site URL `https://ppms.app`; redirect URLs `https://ppms.app/**` and the staging URL.
- [ ] **Auth → MFA:** enable TOTP; require it for Master Admins (enforced in `admin-users` + UI).
- [ ] **SMTP:** a real sender (e.g. `no-reply@ppms.app` via a mail provider) so password-reset emails arrive reliably.
- [ ] **Realtime:** enable Realtime Authorization; channels used: `ppms-audit-notif`, `ppms-edit-activity`, presence, `kd2_plan_realtime`, `f100_plans_realtime`, comment channels.
- [ ] **Security Advisor** (Database → Advisors): zero errors.
- [ ] **Backups:** daily (Pro) or scheduled `pg_dump` (free) — Appendix C.1.

### 9.8 Secrets — where each one lives

| Secret | Lives in | Never in |
|---|---|---|
| Supabase **publishable** key | `app-v2/scripts/core/config.js` (public, safe after RLS) | — |
| Supabase **secret** key | Supabase Edge Function secrets; your PC's environment for one-off scripts | Git, browser files, chat, email |
| Supabase database password | Password manager | Git |
| Vercel token / GoDaddy API key | Password manager / local environment while a task runs | Git |
| SMTP password | Supabase Auth SMTP settings | Git |

Add `.env`, `.env.*`, `*.secret*` to `.gitignore`; scan the repo before making it private and after (Appendix C.4).

### 9.9 Definition of done for Phase 2

- [ ] All migrations 60–69 apply cleanly to a fresh copy of the database.
- [ ] Every table has RLS enabled and no `anon` policy (checked by `69_security_tests.sql`).
- [ ] With only the publishable key and no sign-in, every table read returns 0 rows and every write fails.
- [ ] Each role passes the test checklist (Appendix C.2).
- [ ] No secret in `app-v2/` or git history of `app-v2/` (scan).

---

## 10. Phase 3 — Staging on Vercel

### 10.1 Staging database

1. Create a second Supabase project **`ppms-staging`** (free plan is enough).
2. Restore a recent backup of production into it (Appendix C.1).
3. Apply migrations 60–69 to staging.
4. Create test accounts for each role (`test-viewer@…`, `test-operator@…`, etc.), and migrate 2–3 real users to rehearse Section 9.3.

### 10.2 Vercel project

1. Create a Vercel project from the workspace repo, **root directory `app-v2/`**, branch `v2` (as `deploy.sh --v2` already publishes), framework *Other* (static).
2. Environment variables (Project → Settings → Environment Variables): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` for **Preview** (staging values) and **Production** (production values). A tiny build step writes them into `config.js` so the same code points at staging or production by environment.
3. Preview address: the Vercel URL, or `staging.ppms.app` once the domain is bought (CNAME → Vercel).
4. **Deployment Protection:** keep Preview deployments behind Vercel login so only testers can open staging.

### 10.3 Testing on staging

- Run the full role checklist (Appendix C.2) with the test accounts and 2–3 real users.
- Check every screen, export (PDF / Excel / Word), the Executive Report, the guided tour, live co-editing between two browsers, and the update notice.
- Security tests (Appendix C.3): try reading and writing with only the publishable key; try an operator editing the plan; try a viewer creating an issue — **all must fail**.
- Fix, redeploy to staging, repeat until clean. Record results in `docs/bug-log.txt`.

**Exit criteria:** zero failed checks, testers sign off, Adham approves the cut-over date.

---

## 11. Phase 4 — Cut-over day

**Window:** about 2–3 hours, a quiet afternoon. Users are told one week and one day before (Appendix D).

### 11.1 Before the window (day before)

- [ ] Final staging sign-off; `app-v2` code frozen.
- [ ] Domain bought and DNS access ready.
- [ ] Banner deployed to the current site: *"PPMS will move to https://ppms.app on Thursday 14:00–16:00. Please save your work before 14:00."*

### 11.2 Steps (in order)

| # | Step | Detail | Check |
|---|---|---|---|
| 1 | Freeze | Ask users to stop editing; wait until Active Users is empty | Nobody editing |
| 2 | Backup | Full production backup (Appendix C.1) | File saved and readable |
| 3 | Apply migrations | Run 60–69 on **production** | `69_security_tests.sql` passes |
| 4 | Create Auth accounts | Run the one-off script (Section 9.3 step 1) | Count = number of users |
| 5 | Deploy | `bash tools/deploy.sh --v2` then promote to Vercel **Production** | Vercel URL loads |
| 6 | Domain → Vercel | Add `ppms.app` and `www.ppms.app` in Vercel; add the DNS records at GoDaddy (Appendix A.1) | Vercel shows *Valid*; `https://ppms.app` loads with a padlock |
| 7 | Smoke test | Sign in as each role on `https://ppms.app`; one edit, one issue, one export | All pass |
| 8 | Redirect old site | Publish the redirect site to GitHub Pages (Phase 5) | Old address lands on `ppms.app` |
| 9 | Rotate keys | Disable the **legacy** anon and service_role keys in Supabase | Old key returns 401 |
| 10 | Announce | Send the "PPMS has moved" email (Appendix D.2) | — |

> **Why step 9 is last:** the old site stops working the moment its key is disabled. By then everyone is already redirected to the new one.

### 11.3 After the window

- Watch Supabase logs (Auth and API) and Vercel logs for errors for 48 hours.
- Help users who can't sign in (most common: typing the old email incorrectly; use a reset link).
- Keep the pre-cut-over backup for at least 90 days.

---

## 12. Phase 5 — Redirect the old GitHub Pages address

GitHub Pages cannot send server redirects, so we publish a tiny site that redirects in the browser, **keeping the rest of the address** so old bookmarks and links still land on the right page.

### 12.1 What gets published to the `Planning-Monitoring-System` repo

| File | Purpose |
|---|---|
| `index.html` | "PPMS has moved" page; redirects immediately with `location.replace('https://ppms.app' + path + search + hash)` and a `<meta http-equiv="refresh">` fallback; shows a big **Go to PPMS** button for browsers that block scripts |
| `404.html` | Same redirect, so deep links (`…/index.html?jump=…`) also move |
| `login.html` | Same redirect |
| `version.json` | Points to a final version so any page still open shows the blinking **update** chip, whose "Load latest version" leads to the moved page |

### 12.2 How long to keep it

At least **12 months**. GitHub Pages is free; the redirect costs nothing to keep and catches old bookmarks, emails and documents.

### 12.3 Repository after cut-over

- Archive the `Planning-Monitoring-System` repo's old code (keep it — it is the history), leaving only the redirect files on its Pages branch.
- `tools/deploy.sh` (without `--v2`) is changed to publish **only** the redirect, so nobody can accidentally re-publish the old, insecure app.

---

## 13. Phase 6 — After cut-over

1. **Single folder again:** `app-v2/` becomes `app/` (as `README.md` describes); `deploy.sh` publishes to Vercel; `--v2` is removed.
2. **Drop the legacy login:** after 30 days, remove `planning_app_users` (after confirming every active user has migrated).
3. **Close SC-01** in `docs/bug-log.txt` with the cut-over date and migration numbers.
4. **Make the workspace repo private** (Vercel keeps deploying from it).
5. **Tighten the CSP** by removing inline handlers.
6. **Update documentation:** `README.md` (live address, deploy), `AGENTS.md`, the user manual (sign-in topic, password reset, MFA), the guided tour.
7. **Quarterly checks:** Supabase Security Advisor, user list review (deactivate leavers), backup restore test, domain renewal date.

---

## 14. Rollback plan

| Problem found | Action | Time |
|---|---|---|
| Before step 3 (no database change yet) | Stop; remove the banner. Nothing to undo | Minutes |
| After migrations, before redirect | Restore the step-2 backup **or** run the down-migration (`60–69` each ship with a `-- down` section), keep users on the old site | 15–30 min |
| After redirect, before key rotation | Re-publish the old app to GitHub Pages (`git` history of `production/main`), remove the redirect; DNS can stay (ppms.app simply shows the new app to testers) | 10 min |
| After key rotation | Re-enable the legacy keys in Supabase (they can be re-enabled), then as above | 10 min |

Rule: **decide go / no-go at step 7 (smoke test).** If anything fails there, roll back rather than fix live.

---

## 15. Costs

| Item | When | Approx. cost | Notes |
|---|---|---|---|
| `ppms.app` at GoDaddy | Phase 1 | Annual fee shown at checkout (check the **renewal** price) | Add basic privacy; skip other add-ons |
| Vercel | Testing: Hobby (free). Production: **Pro** | Pro is billed per team member per month | Hobby terms exclude commercial use |
| Supabase production | Recommended: **Pro** | Monthly per project | Daily backups, no pausing, higher limits |
| Supabase staging | Free | 0 | Can be paused/deleted after cut-over |
| *Alternative:* Cloudflare Pages instead of Vercel | — | 0 (free plan allows commercial use) | Section 5, setup C |
| GitHub Pages redirect | — | 0 | Keep 12 months+ |
| SMTP for reset emails | Optional | Free tier of a mail provider is usually enough | Needed for reliable password-reset emails |

*Prices change; confirm on each provider's pricing page on the day you buy.*

---

## 16. Risks and how we handle them

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A user can't sign in after cut-over | Medium | Low | Automatic migration (8.3); admin reset link; support window after cut-over |
| An RLS rule is too strict and blocks a real task | Medium | Medium | Role checklist on staging (Appendix C.2); fix as a small migration |
| An RLS rule is too loose | Low | High | Security tests with publishable key only (C.3); Supabase Security Advisor |
| Live data changes during cut-over | Low | Medium | Freeze + Active Users check (step 1) |
| DNS takes longer than expected | Low | Low | Keep the old site live until `ppms.app` verifies; redirect only after step 6 passes |
| Secret key leaks | Low | High | Never in git or browser; rotate immediately in Supabase if exposed |
| Domain lapses | Low | High | Auto-renew + two-step on GoDaddy + calendar reminder |
| Supabase free project paused / no backup | Medium | High | Production on Pro; scheduled `pg_dump` otherwise |

---

## 17. How Claude can implement this end to end

Everything except **payment** and a few **one-time approvals** can be done by Claude in this workspace. This section lists exactly what Claude does, what it needs from you, and where you stay in control.

### 17.1 What only you can do

| You do | Why |
|---|---|
| Pay for `ppms.app` (and Vercel Pro / Supabase Pro if chosen) | Payment |
| Approve each **production** database step on cut-over day | Live data — Claude always asks first |
| Sign in once to Supabase, Vercel and GoDaddy to create access tokens (or approve the Vercel connector) | Account ownership |
| Choose the cut-over date and send (or approve) the user emails | Communication |

### 17.2 Access Claude needs (temporary, revocable)

| Access | How it's given | Used for | Revoke after |
|---|---|---|---|
| **Supabase** | Supabase personal access token + project ref in a local `.env` (git-ignored), or the Supabase CLI logged in on this PC | Creating staging, applying migrations, deploying Edge Functions, setting Auth options | Cut-over + 30 days |
| **Supabase secret key** | Local environment variable only while a script runs | One-off user creation script | Immediately (and the key is rotated) |
| **Vercel** | The Vercel connector already available in this workspace, or `vercel login` | Project, environment variables, domains, deployments | Keep (needed for future deploys) |
| **GitHub** | `gh auth login` (already used for pushes) | Pages settings, publishing the redirect, making the repo private | Keep |
| **GoDaddy** *(optional)* | GoDaddy **API key + secret** (developer.godaddy.com) in a local `.env` | Writing the DNS records automatically | After DNS is verified |

> Without GoDaddy API access, Claude gives you the exact records and you paste them (5 minutes).

### 17.3 What Claude does, phase by phase

**Phase 0**
- Produces the inventory (tables, users per role, realtime channels) from the code and — with read access — from Supabase.
- Takes and verifies the backup (`pg_dump`, Appendix C.1).

**Phase 2 (fully automatable)**
- Writes migrations 60–69 with matching down-migrations and the security test script.
- Writes the Edge Functions `migrate-login` and `admin-users`, deploys them to staging (`supabase functions deploy`).
- Rewrites login, session, guards, User Management, password change, sign-out, realtime channels and audit logging in `app-v2/`.
- Adds `vercel.json` (headers), the config build step, `.gitignore` rules, and a secret scan.
- Updates the user manual (sign-in, reset, MFA) and the guided tour.

**Phase 3**
- Creates the `ppms-staging` Supabase project, restores the backup, applies migrations.
- Creates the Vercel project (root `app-v2/`, branch `v2`), sets Preview/Production environment variables, enables Deployment Protection.
- Creates test users per role and runs the role checklist + security tests in the browser (as done for previous releases), recording results.

**Phase 1 / 4 (after you pay)**
- Adds `ppms.app` + `www.ppms.app` to Vercel and either writes the DNS records through the GoDaddy API or gives you the exact values; waits for verification and HTTPS.
- On cut-over day, runs each step in Section 11.2 **only after your go-ahead for that step**, checking each result before the next.
- Publishes the redirect site to GitHub Pages and verifies old links land on `ppms.app`.
- Disables the legacy Supabase keys (after you confirm) and verifies the old key is rejected.

**Phase 6**
- Merges `app-v2/` into `app/`, updates `deploy.sh`, `README.md`, `AGENTS.md`, closes SC-01 in the bug log, makes the repo private, tightens the CSP.

### 17.4 Commands Claude would use (for reference)

```bash
# Supabase (CLI)
supabase login                                   # once, opens the browser
supabase link --project-ref <staging-ref>
supabase db push                                 # apply migrations 60–69
supabase functions deploy migrate-login admin-users
supabase secrets set SUPABASE_SECRET_KEY=...     # function secrets (never in git)

# Vercel
vercel link                                      # project root: app-v2/
vercel env add SUPABASE_URL production
vercel domains add ppms.app
vercel --prod

# GitHub
gh api -X PUT repos/MorsyAdham/Planning-Monitoring-System/pages -f cname=''   # remove old custom domain if any
gh repo edit MorsyAdham/PPMS-2.0.0 --visibility private --accept-visibility-change-consequences

# GoDaddy (optional API)
curl -X PUT https://api.godaddy.com/v1/domains/ppms.app/records/A/@ \
     -H "Authorization: sso-key $GD_KEY:$GD_SECRET" -H "Content-Type: application/json" \
     -d '[{"data":"76.76.21.21","ttl":600}]'

# Verification
nslookup ppms.app
curl -I https://ppms.app
```

### 17.5 Guard-rails Claude follows

- **Asks before** every production database change, key rotation, DNS change and anything that affects live users.
- **Never** writes a secret into a tracked file, a commit message, the browser code or the chat.
- **Backs up** before every production change and states how to roll back.
- **Tests on staging first**, reports results (including failures) before proposing to go live.
- Keeps `app/` working until cut-over (the `AGENTS.md` rule).

---

## 18. Appendices

### Appendix A — DNS records

**A.1 `ppms.app` → Vercel (recommended)** — enter at GoDaddy → My Products → `ppms.app` → DNS. *Use the exact values Vercel shows in Project → Settings → Domains; these are the usual ones.*

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | `76.76.21.21` | 600 |
| CNAME | `www` | `cname.vercel-dns.com` | 600 |
| CNAME | `staging` *(optional)* | `cname.vercel-dns.com` | 600 |

Remove GoDaddy's default "Parked" A record and any default `www` record first.

**A.2 Verify**

```bash
nslookup ppms.app            # should return 76.76.21.21
nslookup www.ppms.app        # should point to Vercel
curl -I https://ppms.app     # HTTP/2 200 and a strict-transport-security header
```

**A.3 Optional interim: `ppms.app` → GitHub Pages (before Vercel)**

| Type | Name | Value |
|---|---|---|
| A | `@` | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (four records) |
| AAAA | `@` | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` |
| CNAME | `www` | `morsyadham.github.io` |

Then: add a `CNAME` file containing `ppms.app` to `app/` (so `deploy.sh` keeps it), set the custom domain in the repo's Settings → Pages and tick **Enforce HTTPS**. At cut-over, replace these records with A.1 and remove the custom domain from GitHub Pages.

### Appendix B — Role permission matrix (enforced by RLS)

| Data | Viewer | Operator | Planner | Master Admin |
|---|---|---|---|---|
| Read plans, progress, issues (allowed modules) | ✓ | ✓ | ✓ | ✓ |
| `*_progress` (actual dates, X-ray, completion) | — | write | write | write |
| Comments, delay reasons | — | write | write | write |
| `production_issues` | — | create; edit own | create; edit own | all |
| Issue drafts | — | own only | own only | own only |
| `kd2_plan`, `f100_plans`, `assembly_plan` | — | — | write | write |
| Processes, routes, lead times, no-work days, route order | — | — | write | write |
| Plan versions | — | create / rename | all | all (incl. delete) |
| Unit codes | — | write | write | write |
| Profiles (users) | own row (read) | own row (read) | own row (read) | all (via `admin-users`) |
| Audit log | — | — | — | read (written by triggers) |

*Every row is also limited to the modules in the user's profile.*

### Appendix C — Scripts and checklists

**C.1 Backup and restore**

```bash
# Backup (connection string from Supabase → Settings → Database)
pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --file=ppms_YYYYMMDD.dump
# Restore into staging
pg_restore --no-owner --dbname="$STAGING_DB_URL" ppms_YYYYMMDD.dump
```

**C.2 Role test checklist** (run for each role on staging, then smoke-test on production)

- [ ] Sign in / sign out / wrong password message.
- [ ] Sees only allowed modules; switching module works.
- [ ] Viewer: can browse and export (if `can_export`); every edit control hidden **and** any forced edit is rejected by the database.
- [ ] Operator: record actual start / completion, comment, delay reason, X-ray, report and edit own issue; **cannot** move Gantt blocks.
- [ ] Planner: everything above + edit Gantt, add work, reorder / hide / delete processes, manage processes, plan versions.
- [ ] Master Admin: User Management via `admin-users`, Audit Log, Active Users.
- [ ] Live co-editing between two users; update notice; guided tour; Executive Report.

**C.3 Security tests** (must all **fail** / return nothing)

- [ ] With only the publishable key (no sign-in): select from every table → 0 rows; insert/update/delete → error.
- [ ] Signed in as Viewer: insert into `kd2_progress` → error.
- [ ] Signed in as Operator: update `kd2_plan` → error.
- [ ] Signed in as a user without `f100kd2`: select from `f100_plans` → 0 rows.
- [ ] Read `planning_app_users` / `password_hash` → no access.
- [ ] Insert into `planning_audit_log` from the browser → error (triggers only).
- [ ] Subscribe to a private realtime channel without sign-in → refused.
- [ ] After cut-over: the legacy anon key → 401.

**C.4 Secret scan**

```bash
git grep -nE "service_role|sb_secret_|eyJhbGciOi" -- app-v2 tools database   # must find no secret keys
```

### Appendix D — User email templates

**D.1 One week before**

> **Subject: PPMS is moving to https://ppms.app on Thursday**
> Dear all, on **Thursday [date], 14:00–16:00**, PPMS moves to its new secure address **https://ppms.app**. Please **save your work before 14:00**. After the move, sign in with your **usual email and password** — the old link will take you to the new address automatically. Thank you, Adham

**D.2 After cut-over**

> **Subject: PPMS is now at https://ppms.app**
> Dear all, PPMS is now available at **https://ppms.app** with improved security. Sign in with your usual email and password. If you have any trouble signing in, reply to this email and I'll help straight away. Please update your bookmarks. Thank you, Adham

### Appendix E — Glossary

| Term | Meaning |
|---|---|
| **RLS (Row Level Security)** | Database rules that decide, row by row, what each signed-in user may read or change |
| **Supabase Auth** | Supabase's login service — stores passwords safely (bcrypt) and issues a token per user |
| **Publishable / anon key** | The public key every browser uses to reach Supabase; harmless once RLS is in place |
| **Secret / service_role key** | Server-only key that bypasses RLS; must never be public |
| **Edge Function** | Small server-side program in Supabase, used for actions that need the secret key |
| **DNS record** | Tells the internet where a domain points (A = an IP address, CNAME = another name) |
| **Cut-over** | The planned moment users move from the old system to the new one |
| **Staging** | A private copy of the system and database for testing before going live |
| **CSP** | Content-Security-Policy — a browser rule that blocks scripts from unexpected places |
