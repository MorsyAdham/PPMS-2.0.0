# KD2 Production Plan Discussion

## Confirmed process logic update

KD2 should now be treated as a production route that:

- Has the same downstream flow as KD1 after assembly
- Includes additional upstream steps before assembly

The confirmed common downstream tail is:

1. Assembly
2. Processing
3. Final Test

This means KD2 is not only a copy of the KD1 assembly stage. It is a broader route where the unknown part is the set of upstream steps that feed into the same final KD1-style completion flow.

## Current KD1 system observations

After reviewing `Planning-Monitoring-System`, the current app is built as a single-page KD1 system:

- Branding and session keys are KD1-specific (`KD1`, `kd1_session`, `kd1_theme`).
- The main load path reads from `assembly_plan` and joins `assembly_progress`.
- The primary table is assembly-oriented: `Vehicle`, `Unit`, `Station / Process`, `Week`, planned dates, actual dates, status, and action.
- Categories are hard-coded around `Assembly`, `Final Test`, and `Processing`.

This means KD2 should **not** be added by mixing new rows into the existing KD1 tables. That would make the current logic harder to maintain and would create ambiguity in reports, filters, status logic, and admin actions.

## Recommended direction

The cleanest approach is to add **a separate KD2 module inside the same system**, but keep its data model and screens independent from KD1.

Recommended structure:

1. Keep the existing KD1 pages and tables unchanged.
2. Add a new navigation entry or tab for `KD2 Production Plan`.
3. Build KD2 screens with their own filters, tables, and calculations.
4. Store KD2 data in separate Supabase tables.

## Suggested KD2 data separation

Instead of reusing `assembly_plan`, create new KD2 tables such as:

- `kd2_production_plan`
- `kd2_production_progress`
- `kd2_vehicle_units` if KD2 needs separate unit-code mapping
- `kd2_audit_log` only if KD2 changes should be audited independently

Suggested KD2 plan fields:

- `id`
- `battalion_no`
- `vehicle_type` (`K9`, `K10`, `K11`)
- `vehicle_no`
- `process_step`
- `step_sequence`
- `planned_start_date`
- `planned_end_date`
- `actual_start_date`
- `actual_end_date`
- `status`
- `remark`
- `deadline`

KD2 also has a fixed battalion structure that should be represented explicitly in the data:

- Total battalions: `5`
- Per battalion: `18 K9`, `3 K10`, `4 K11`

That means the KD2 plan should support battalion-based filtering and reporting from day one.

## Suggested KD2 UI sections

KD2 should have its own page or major section with separate components:

### 1. KD2 Summary

- Total planned vehicles
- Vehicles in progress
- Delayed steps
- Vehicles at risk against deadline

### 2. KD2 Plan Table

This should be different from KD1 assembly detail. Suggested columns:

- Battalion
- Vehicle Type
- Vehicle No
- Process Step
- Sequence
- Planned Start
- Planned End
- Actual Start
- Actual End
- Delay
- Status
- Notes

### 2a. KD2 Filters

KD2 should add a dedicated `Battalion` filter in addition to the existing style of filters. Suggested filters:

- Battalion (`All`, `Battalion 1`, `Battalion 2`, `Battalion 3`, `Battalion 4`, `Battalion 5`)
- Vehicle Type (`All`, `K9`, `K10`, `K11`)
- Process Step
- Status
- Date range or week

This filter should apply to all KD2 views: summary cards, plan table, Gantt, and reports.

### 3. KD2 Process Flow Table

This table should show the full route per vehicle.

At this stage, the route should be split into:

- Category-specific upstream steps before assembly: pending confirmation
- Shared downstream steps:
  - Assembly
  - Processing
  - Final Test

This is important because KD2 is a full production flow, not only structure assembly plus downstream work.

### 4. KD2 Planning Inputs Table

This should be separate from execution tracking and hold planning assumptions:

- Battalion
- Vehicle type
- Battalion quantity
- Delivery deadline
- Lead time per process step
- Total lead time
- Required production start date

Because each battalion has a known required mix, the default planning input for one battalion should start as:

- `K9 = 18`
- `K10 = 3`
- `K11 = 4`

If all 5 battalions follow the same structure, the system can prefill these values and allow edits only if the business later confirms an exception.

## Architecture recommendation

Two safe options:

### Option A: Separate KD2 page

Examples:

- `index.html` remains KD1
- add `kd2.html`
- add `kd2.js`
- add shared helpers later if needed

This is the safest option because KD2 logic will be large and structurally different.

### Option B: Shared shell, separate feature modules

Examples:

- `index.html` contains navigation for `KD1` and `KD2`
- `app.js` is split later into `kd1-module.js`, `kd2-module.js`, `shared.js`

This is cleaner long-term, but only worth doing if you plan to support multiple programs beyond KD1 and KD2.

For now, I recommend **Option A**.

## Why KD2 should stay separate from KD1

- KD1 is assembly-control focused.
- KD2 needs upstream production planning logic.
- KD2 includes 5 battalions, so battalion-level filtering and reporting are required.
- KD2 will use different process steps, lead-time assumptions, and possibly different reports.
- Mixing both in one table will make imports, filters, Gantt logic, and progress updates harder to trust.

## Proposed next step

Before editing the system, we should define:

1. The exact KD2 upstream process-step list for each category.
2. Whether battalions should be stored as `1-5` or by named labels.
3. Which KD2 tables are planning-only and which are execution/progress tables.
4. Whether KD2 needs its own Gantt view.
5. Whether KD2 should support import from Excel/CSV in the same way as KD1.
6. Whether KD2 users and permissions should be shared with KD1 or separated.

Once you confirm those points, I can turn this into a concrete implementation plan without touching the current KD1 system.
