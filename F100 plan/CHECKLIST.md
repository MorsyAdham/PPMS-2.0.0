# F100 – KD2 Build Checklist

> Status key: ⬜ Not started · 🔄 In progress · ✅ Done

---

## Phase 1 — Rename Existing Modules ✅

Rename display labels only. Internal IDs (`kd1`, `kd2`) and localStorage keys stay unchanged to avoid breaking existing data.

- ✅ Change module selector options: `KD1` → `F200 – KD1`, `KD2` → `F200 – KD2`
- ✅ Change module badge text: `KD1` → `F200 – KD1`, `KD2` → `F200 – KD2`
- ✅ Add `F100 – KD2` option to module selector
- ✅ Register `f100kd2` in `MODULES` registry with badge, title, subtitle, categories
- ✅ Add `isF100KD2()` and `isF200Module()` helpers in `kd2.js` + exported from runtime
- ✅ Add `isF100KD2Module()` / `isF200Module()` wrappers in `app.js`
- ✅ Update `applyModuleShell()` — hide F200-only sections when F100-KD2 active; set correct labels for all 3 modules
- ✅ Guard `loadData()` — F100-KD2 returns empty set (stub) until Phase 3 data loader is built
- ✅ Update report title/subtitle helpers for F100-KD2

---

## Phase 2 — Database Setup ✅

- ✅ Create `f100_parts` table in Supabase (`db/01_create_tables.sql`)
- ✅ Create `f100_processes` table in Supabase (`db/01_create_tables.sql`)
- ✅ Create `f100_plans` table in Supabase (`db/01_create_tables.sql`)
- ✅ Create `f100_gun_assembly` table in Supabase (`db/01_create_tables.sql`)
- ✅ Set RLS policies (mirror F200 KD2 tables) (`db/02_rls_policies.sql`)
- ✅ Seed gun parts (Breech Block, Breech Ring, Muzzle Brake, Evacuator, Cylinder Recuperator, Cradle Assy) (`db/03_seed_gun_parts.sql`)
- ✅ Seed all gun part processes from main plan.txt (`db/03_seed_gun_parts.sql`)
- ✅ Seed HAS vehicle parts (16 parts) with processes (`db/04_seed_vehicle_parts_has.sql`)
- ✅ Leave DOOWON rows empty (admin panel will populate)

---

## Phase 3 — Module Shell & Filters ✅

- ✅ Create `PPMS/scripts/features/f100/kd2/shell/index.js` (placeholder for Phase 7 admin panel)
- ✅ Register F100-KD2 in module bootstrap / `applyModuleShell()` (already done in Phase 1; extended in Phase 3 to manage filter visibility)
- ✅ Implement Gun / Vehicle Parts toggle (`f100Mode` select; mutually exclusive primary filter)
- ✅ Gun secondary filter: `f100GunPart` — specific gun part or all (populated from Supabase on demand)
- ✅ Vehicle secondary filter: `f100Manufacturer` — HAS | DOOWON | All
- ✅ Vehicle secondary filter: `f100VehicleType` — K9 | K10 | K11 | All
- ✅ Wire filter changes → `loadF100Data()` (all four F100 selects trigger `loadData`)
- ✅ Load F100 data from Supabase on filter change (`loadF100Data()` in app.js joins f100_parts + f100_processes + f100_plans)

---

## Phase 4 — Table View

- ⬜ Build `renderF100Table(data)` with columns:
  - Battalion, Part, Part No., Manufacturer, Vehicle, Serial, Step, Process,
    Planned Start, Planned End, Actual Start, Actual End, Status, % Done
- ⬜ Compute % Done client-side (completed units ÷ total units)
- ⬜ Sort / search support

---

## Phase 5 — F100 VPX

- ⬜ Build `buildF100VpxRows()` — rows = parts (gun) or part × vehicle (vehicle mode)
- ⬜ Build `buildF100VpxColumns()` — columns = process steps per part
- ⬜ Render cell: status dot + planned dates + actual dates + % completion bar
- ⬜ Compute cell % = completed units ÷ total applicable units
- ⬜ Hover tooltip: process name + dates + progress bar + unit count + delay note
- ⬜ Battalion sticky group row (same stacking as F200 VPX)
- ⬜ Part sticky sub-group row
- ⬜ Column group colour stripes per part (matching F200 pattern)
- ⬜ Light / dark theme support

---

## Phase 6 — F100 Gantt

- ⬜ Build F100 row-builder for gun mode:
  - Battalion → Part (group) → Process (row with bar)
- ⬜ Build F100 row-builder for vehicle mode:
  - Battalion → Vehicle type (group) → Part (sub-group) → Process (row)
- ⬜ Pass rows to existing `renderGantt()` engine (reuse F200 engine)
- ⬜ Verify lane packing works correctly
- ⬜ Verify edit mode (drag / resize) works
- ⬜ Bar label: `#step_number PROCESS_NAME`
- ⬜ Hover tooltip matching VPX tooltip content

---

## Phase 7 — Admin Panel: Manage Parts & Processes

- ⬜ Create admin modal (triggered from module header button)
- ⬜ **Parts tab**: list, add, edit, delete `f100_parts` rows
- ⬜ **Processes tab**: select part → list, add, edit, delete `f100_processes` rows
- ⬜ **Plans tab**: bulk entry / CSV import for `f100_plans`
- ⬜ Reorder parts via drag handle
- ⬜ Reorder processes via step number
- ⬜ Wire save → reload data

---

## Phase 8 — Gun Assembly View

- ⬜ Add sub-view toggle (machining / assembly) in gun mode
- ⬜ Render `f100_gun_assembly` rows as Gantt bars
- ⬜ Visual grouping by parallel group (group 1 runs concurrently, group 2 after)
- ⬜ Assembly step labels match: Breech Mechanism, Gun Mount Assembly, Tube Assembly, Armament Assembly (A)

---

## Cross-cutting / Ongoing

- ✅ Create implementation plan (`F100-KD2-implementation-plan.md`)
- ✅ Create this checklist
- ⬜ F100-KD2 module loads independently without breaking F200-KD1 / F200-KD2
- ⬜ All new features tested in both light and dark theme
- ⬜ All changes committed to main with descriptive messages
