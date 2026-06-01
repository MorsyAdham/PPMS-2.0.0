# F100 – KD2 Implementation Plan

---

## 1. Prerequisites: Rename Existing Modules

Before building F100, rename both existing modules so the sidebar and all internal references reflect the product line.

| Current name | New name |
|---|---|
| KD2 | F200 – KD2 |

**Scope:** module registry, sidebar labels, page titles, filter badge text, any hardcoded string that says "KD1" / "KD2" without a product qualifier.

---

## 2. Scope of F100 – KD2

- **Skip F100 – KD1** for now (gun assembly only, simpler, deferred).
- F100 – KD2 tracks manufacturing progress for **gun parts** and **vehicle parts** separately.
- Shares the Gantt engine from F200 – KD2 (re-use `renderGantt`, lane packing, edit mode).
- Has a **new VPX** tailored to part-level % completion rather than station-level status.
- Has a **new admin panel** for managing parts and their process lists.

---

## 3. Two Primary Filters (Mutually Exclusive)

A top-level toggle determines what the entire page shows. Gun and Vehicle Parts are **never displayed at the same time**.

```
[ Gun Parts ]  |  [ Vehicle Parts ]
```

Switching the toggle reloads data, resets all secondary filters, and swaps the VPX, table, and Gantt to the appropriate dataset.

### 3.1 Gun filter (secondary)
When Gun is active the user can optionally filter by a specific gun part (or show all parts).

### 3.2 Vehicle Parts filters (secondary)
When Vehicle Parts is active:
- **Manufacturer** — HAS | DOOWON (MOTROL skipped, starts KD3)
- **Vehicle type** — K9 | K10 | K11 | All

---

## 4. Data Model

### 4.1 New tables

#### `f100_parts`
Defines every part (gun or vehicle) with its metadata.

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| module | text | `'gun'` or `'vehicle'` |
| part_number | text | e.g. `20026528` |
| part_name | text | e.g. `Breech Block` |
| manufacturer | text | null for gun parts; `HAS`/`DOOWON` for vehicle |
| vehicles | text[] | e.g. `['K9']`, `['K9','K10','K11']` |
| qty_per_vehicle | int | 1, 2, … |
| process_count | int | derived from f100_processes; kept for quick lookup |
| sort_order | int | display ordering |
| created_at | timestamptz | |

#### `f100_processes`
Defines the ordered process list for each part.

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| part_id | uuid FK → f100_parts | |
| step_number | int | 10, 20, 30 … (matches operation numbering) |
| process_name | text | e.g. `MILLING`, `TURNING` |
| sort_order | int | display order |

#### `f100_plans`
One row per part × battalion × process, tracking planned and actual dates.

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| part_id | uuid FK → f100_parts | |
| process_id | uuid FK → f100_processes | |
| battalion_code | text | e.g. `1BN` |
| vehicle_type | text | `K9`/`K10`/`K11`; null for gun parts |
| serial_number | int | unit serial (1–18 for K9, etc.) |
| planned_start_date | date | |
| planned_end_date | date | |
| actual_start_date | date | nullable |
| actual_end_date | date | nullable |
| status | text | `Planned`/`In Progress`/`Completed`/`Overdue`/`Late Completion` |
| updated_at | timestamptz | |

#### `f100_gun_assembly`
Tracks the final gun assembly sequence (post-machining).

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| battalion_code | text | |
| assembly_step | text | `Breech Mechanism`, `Breech Mechanism TEST`, `Gun Mount Assembly`, etc. |
| planned_start_date | date | |
| planned_end_date | date | |
| actual_start_date | date | nullable |
| actual_end_date | date | nullable |
| status | text | |
| parallel_group | int | steps with same number run in parallel |

---

## 5. Seed Data: Parts and Processes

### 5.1 Gun Parts

| Part name | Part number | Processes |
|---|---|---|
| Breech Block | 20026528 | 19 |
| Breech Ring | EGK955424 | 21 |
| Muzzle Brake | EGK955308 | 24 |
| Evacuator | EGK955321 | 12 |
| Cylinder Recuperator | 20026661 | 22 |
| Cradle Assy | EGK955741 | 24 |

Seed all process rows from `main plan.txt` (step numbers and names are fully defined there).

### 5.2 Gun Assembly Sequence (post-machining)

```
Parallel group 1:
  - Breech Mechanism → Breech Mechanism TEST
  - Gun Mount Assembly → Pressure TEST
  - Tube Assembly

Parallel group 2 (after group 1):
  - Armament Assembly (A) → Gymna Test → Firing Cylinder Test
```

### 5.3 HAS Vehicle Parts (seed data from main plan.txt)

Battalion totals: **18 × K9 + 3 × K10 + 4 × K11 = 25 vehicles**

| Part number | Part name | Qty/vehicle | Vehicles | Processes |
|---|---|---|---|---|
| 60343861 | Joystick bracket | 1 | K9 | 10 |
| 60343684 | Bracket | 1 | K9 | 7 |
| 60343685 | Bracket | 1 | K9 | 10 |
| 60343686 | Boss | 2 | K9 | 4 |
| 60348010 | Driver seat support | 1 | K9/K10/K11 | 9 |
| 10910084 | Driver seat base | 1 | K9/K10/K11 | 8 |
| EGK974242/60360242 | Gun travel lock – Support | 1 | K9 | 12 |
| EGK974246/60360246 | Gun travel lock – Jaw | 1 | K9 | 10 |
| EGK974250/60360250 | Gun travel lock – Bracket | 1 | K9 | 11 |
| EGK974257/60360257 | Gun travel lock – Rod arm | 1 | K9 | 10 |
| EGK921772 | Idler housing Assembly | 2 | K9/K10/K11 | 4 |
| EGK921773/60349773 | Idler housing | 2 | K9/K10/K11 | 9 |
| Q25025211 | Right charge rack – Machined | 1 | K10 | 10 |
| Q25025212U | Right charge rack – Welded | 1 | K10 | 5 |
| Q25025301 | Left charge rack – Machined | 1 | K10 | 10 |
| Q25025302U | Left charge rack – Welded | 1 | K10 | 5 |

**DOOWON parts:** not yet provided — reserve table rows, add via admin panel later.

---

## 6. VPX (Vehicle/Part Progress Matrix) — F100 Version

### 6.1 Layout

Rows = **parts** (one row per part; in vehicle mode one row per part × vehicle type).  
Columns = **processes** (step #10, #20, …), grouped by part.

Left sticky column: part name + part number.  
Top sticky header row: process step numbers.

### 6.2 Cell content

Each cell represents one part × one process:

```
  ● (status dot)
  Plan: DD MMM – DD MMM
  Act:  DD MMM – DD MMM
  72%   (% of units completed for this step)
```

**% completion** = units where `actual_end_date IS NOT NULL` ÷ total units for this part.

For gun parts: 1 unit per gun (% is simply 0% or 100% per process).  
For vehicle parts: total units = `qty_per_vehicle × count(applicable vehicles in battalion)`.

### 6.3 Status dot logic (same as F200 – KD2)

| Dot colour | Condition |
|---|---|
| Green | Completed (all units done) |
| Amber | In Progress |
| Blue | Late Completion (done but past planned end) |
| Red pulse | Overdue (past planned end, not complete) |
| Dim | Planned (not started) |

### 6.4 Hover tooltip

```
┌──────────────────────────────────────────────┐
│  #30  GRINDING — Breech Block (20026528)     │
│  Planned:  01 Jan → 15 Jan 2025             │
│  Actual:   03 Jan → 18 Jan 2025             │
│  ─────────────────────────────────────────  │
│  Units complete: 14 / 18                    │
│  ██████████████░░░░  78%                    │
│  Late: 3 Jan delay on start                 │
└──────────────────────────────────────────────┘
```

The hover block shows:
- Process step + name + part name + part number
- Planned and actual date ranges
- Progress bar with unit count and %
- Any delay note (days late on start or end)

---

## 7. Gantt (F100 – KD2)

Re-use the F200 – KD2 Gantt engine with these row groupings:

**Gun mode:**
```
Battalion
  └── Part name (group row)
        └── Process #10, #20, … (individual Gantt bars)
```

**Vehicle mode:**
```
Battalion
  └── Vehicle type — K9 / K10 / K11 (group row)
        └── Part name (sub-group row)
              └── Process #10, #20, … (individual bars)
```

Each bar represents one part × process plan record.  
Bar label: `#step_number PROCESS_NAME`.  
Hover tooltip: same fields as VPX tooltip.

---

## 8. Table View

Flat table with columns:

| Battalion | Part | Part No. | Manufacturer | Vehicle | Serial | Step | Process | Planned Start | Planned End | Actual Start | Actual End | Status | % Done |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

Sortable and filterable (same filter bar pattern as F200).

---

## 9. Admin Panel: Manage Parts & Processes

Accessible from the module header (same UX as F200 – KD2's "Manage Processes" modal).

### 9.1 Parts tab
- List all parts (gun or vehicle depending on active filter toggle)
- Add / Edit / Delete part: part number, name, manufacturer, vehicles, qty/vehicle
- Reorder parts via drag-handle

### 9.2 Processes tab
- Select a part from a dropdown
- List its processes in step-number order
- Add / Edit / Delete process: step number, process name
- Reorder processes

### 9.3 Plans tab
- Bulk-import planned dates (CSV upload or row-by-row entry)
- One row per part × process × battalion × vehicle serial

---

## 10. Module Architecture

### 10.1 File structure (new files only)

```
PPMS/scripts/features/f100/
  index.js              ← module entry (registers with app bootstrap)
  kd2/
    shell/index.js      ← sidebar registration, filter bar HTML
    vpx/index.js        ← F100-specific VPX renderer
    admin/index.js      ← parts & processes admin modal

PPMS/styles/
  f100.css              ← F100-specific overrides (import in styles.css)
```

### 10.2 Module registration

Add `F100-KD2` to the module registry alongside `F200-KD1` and `F200-KD2`. The bootstrap reads the active module from user session / URL param and loads the appropriate runtime.

```js
// core/config.js (or module-registry.js)
const MODULES = {
  'F200-KD1': () => import('./features/kd1/...'),
  'F200-KD2': () => import('./features/kd2/...'),
  'F100-KD2': () => import('./features/f100/kd2/...'),
};
```

### 10.3 Shared functions to reuse from F200 – KD2

| Function | Usage in F100 |
|---|---|
| `renderGantt()` | Direct reuse, different row-builder |
| `setGanttRangeFromData()` | Direct reuse |
| `renderTable()` | Adapt column set |
| `showToast()`, `setTableLoading()` | Direct reuse |
| Status calculation logic | Wrap in `getF100Status(plan)` |
| `esc()`, date formatters | Direct reuse |

---

## 11. Implementation Phases

### Phase 1 — Rename existing modules
1. Update module registry strings: `KD1` → `F200-KD1`, `KD2` → `F200-KD2`
2. Update sidebar labels, page titles, filter badge text
3. Verify no regressions in F200 behaviour

### Phase 2 — Database setup
1. Create `f100_parts`, `f100_processes`, `f100_plans`, `f100_gun_assembly` tables in Supabase
2. Set up RLS policies (mirror F200 tables)
3. Seed gun parts and their processes from `main plan.txt`
4. Seed HAS vehicle parts and their processes
5. Leave DOOWON rows empty (admin panel will add them)

### Phase 3 — Module shell & filters
1. Create `features/f100/kd2/shell/index.js`
2. Register F100-KD2 in module bootstrap
3. Implement Gun / Vehicle Parts toggle (mutually exclusive)
4. Implement secondary filters (manufacturer, vehicle type for vehicle mode)

### Phase 4 — Table view
1. Adapt `renderTable()` for F100 columns
2. Add % completion column (computed client-side from plan rows)

### Phase 5 — F100 VPX
1. Build `buildF100VpxRows()` and `buildF100VpxColumns()` (columns = processes)
2. Build `renderF100VPX()` — cell shows dot + dates + % bar
3. Implement hover tooltip with progress bar and delay note
4. Wire battalion / part sticky row stacking (same z-index pattern as F200 VPX)

### Phase 6 — F100 Gantt
1. Write F100 row-builder that groups: Battalion → Part → Process (gun mode)
   or Battalion → Vehicle → Part → Process (vehicle mode)
2. Pass rows to existing `renderGantt()` engine
3. Verify lane packing and edit mode work correctly

### Phase 7 — Admin panel
1. Parts tab: CRUD for `f100_parts`
2. Processes tab: CRUD for `f100_processes` per part
3. Plans tab: bulk import / row entry for `f100_plans`
4. Wire save → reload data

### Phase 8 — Gun Assembly view
1. Separate sub-view (toggled from filter or a tab) showing assembly sequence
2. Gantt bars for each assembly step, grouped by parallel group
3. Timeline shows critical path visually

---

## 12. Open Questions / Decisions Needed

1. **Gun serial number**: Is there one gun per battalion, or multiple? How many guns does a battalion produce?
2. **DOOWON parts**: Need the full part list + processes before Phase 2 seed data is complete.
3. **F100 – KD1**: Confirm it is only Gun + Assembly only, no vehicle parts?
4. **Supabase project**: Same project as F200 or a separate project/schema?
5. **% completion for gun parts**: Since there is 1 gun per battalion, is the % simply 0%/100%? Or do we track by unit serial for multi-gun battalions?
6. **Assembly steps dependency**: Should the Gantt auto-block assembly steps if upstream machining is not complete?
7. **K10/K11 qty**: The file states 3 × K10 and 4 × K11 — are these fixed for the entire programme or configurable per battalion?
