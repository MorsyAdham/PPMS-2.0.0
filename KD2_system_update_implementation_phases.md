# KD2 System Update Implementation Phases


1. [Document Purpose](#document-purpose)
2. [PPMS Current-System Review Summary](#ppms-current-system-review-summary)
3. [Confirmed Direction for KD2](#confirmed-direction-for-kd2)
4. [Recommended Delivery Strategy](#recommended-delivery-strategy)
5. [Phase 0: Current-State Validation and KD2 Scope Freeze](#phase-0-current-state-validation-and-kd2-scope-freeze)
6. [Phase 1: KD2 Functional Mapping on Top of PPMS](#phase-1-kd2-functional-mapping-on-top-of-ppms)
7. [Phase 2: Data Model and Separation Design](#phase-2-data-model-and-separation-design)
8. [Phase 3: Planning Logic and Scheduling Rules](#phase-3-planning-logic-and-scheduling-rules)
9. [Phase 4: Screen, Navigation, and User-Role Design](#phase-4-screen-navigation-and-user-role-design)
10. [Phase 5: Backend and Database Implementation](#phase-5-backend-and-database-implementation)
11. [Phase 6: Frontend Adaptation in PPMS](#phase-6-frontend-adaptation-in-ppms)
12. [Phase 7: Data Initialization and Migration Setup](#phase-7-data-initialization-and-migration-setup)
13. [Phase 8: Validation, Pilot, and Controlled Business Use](#phase-8-validation-pilot-and-controlled-business-use)
14. [Phase 9: Release, Support, and Controlled Enhancement](#phase-9-release-support-and-controlled-enhancement)
15. [Open Items Requiring Business Confirmation](#open-items-requiring-business-confirmation)
16. [Expected Final Result](#expected-final-result)

---

## Document Purpose

This document defines the implementation phases required to add `KD2` into the existing `PPMS` platform after review of the current `KD1` system already built inside `PPMS/`.

The objective is not to design a completely new product from zero. The objective is to extend the current production-planning and monitoring platform in a controlled way so that:

- `KD1` remains stable
- `KD2` is introduced as a clearly separated module or operating mode
- existing useful PPMS capabilities are reused where practical
- `KD2` business rules are implemented without weakening current `KD1` workflows

---

## PPMS Current-System Review Summary

The current `PPMS` system is already more advanced than a simple planning prototype. Based on review of `PPMS/index.html`, `PPMS/login.html`, `PPMS/app.js`, `PPMS/styles.css`, and `PPMS/upload_to_supabase.py`, the present baseline is:

### Current module identity

- the live interface is branded as `KD1`
- the system is a browser-based production-planning and monitoring tool
- the frontend is written in vanilla JavaScript
- the backend data layer is based on `Supabase`

### Current business functions already implemented

- login page with role-based access
- summary cards for planned, completed, late, overdue, and progress percent
- filter bar by vehicle, unit, category, week, and date range
- production master schedule in Gantt view
- editable Gantt planning with drag rescheduling
- add, edit, and delete plan blocks directly from the Gantt
- VPX vehicle production progress matrix
- plan table with inline actual-start updates and completion handling
- progress tracking against plan
- PDF and Excel export
- bulk plan import from pasted rows
- separate Python upload utility for Excel-to-Supabase loading
- unit-code management
- user management
- audit log review

### Current core PPMS data structures already in use

- `assembly_plan`
- `assembly_progress`
- `vehicle_units`
- `planning_app_users`
- `planning_audit_log`

### Current role structure already implemented

- `master_admin`
- `admin`
- `planner`
- `viewer`

### Current planning logic already implemented

- task status is derived from `planned end date`, `actual start date`, and `completion date`
- current status set is:
  - `Planned`
  - `In Progress`
  - `Completed`
  - `Late Completion`
  - `Overdue`
- schedule week is derived from `start_date`
- Gantt rescheduling skips `Friday`
- `Saturday` can be optionally included during Gantt editing
- current process grouping is:
  - `Assembly`
  - `Processing`
  - `Final Test`

### Important implication for KD2

`KD2` should now be treated as an enhancement of an existing operational platform, not as a blank-sheet development effort. The safest and fastest path is to reuse the current PPMS architecture, workflows, permissions, and reporting patterns while adding strict structural separation for `KD2`.

---

## Confirmed Direction for KD2

The following direction remains valid after the system review:

- `KD2` must remain separate from `KD1`
- `KD2` must support battalion-based planning
- `KD2` must support `K9`, `K10`, and `K11`
- `KD2` does not stop at assembly only
- `KD2` will be implemented as a switchable module inside the same PPMS page shell
- all current `KD1` features are required in `KD2`, with additional `KD2`-specific capabilities added on top
- `KD2` ends with the same downstream route already used in PPMS:
  1. `Assembly`
  2. `Processing`
  3. `Final Test`
- the upstream `KD2` route before `Assembly` is confirmed as:
  1. `cutting`
  2. `part machining`
  3. `sub weldment`
  4. `main weldment`
  5. `structure machining`
  6. `qualifing`
  7. `foam`
  8. `pre processing`
- `KD2` battalion planning will use `5` battalions in total
- the approved battalion mix remains:
  - `K9 = 18`
  - `K10 = 3`
  - `K11 = 4`

This means `KD2` should be implemented as a separate planning structure that can still reuse the PPMS interaction model already proven in `KD1`.

---

## Recommended Delivery Strategy

The recommended strategy is to extend `PPMS` into a dual-module platform:

- preserve the current `KD1` workflow as-is
- add `KD2` as a switchable module inside the same PPMS page shell
- reuse current UI patterns where they already fit business needs
- provide all current `KD1` features in `KD2`, then extend them for `KD2` needs
- create separate `KD2` tables and logic rather than mixing `KD2` rows into current `KD1` tables without distinction
- keep reporting, permissions, auditability, and scheduling behavior aligned where appropriate

This approach is preferred because the current PPMS already contains working capability for:

- plan input
- plan visualization
- progress monitoring
- reporting
- role control
- audit logging

The main gap is not general system capability. The main gap is `KD2`-specific data structure, planning route definition, and controlled module separation.

---

## Phase 0: Current-State Validation and KD2 Scope Freeze

### Objective

Confirm the real PPMS baseline and freeze the `KD2` scope before system changes begin.

### Why this phase is required

The old document assumed a more generic future-state system. The reviewed PPMS already has many live capabilities. Before changing it, the project team must agree exactly what will be reused, what must remain untouched, and what `KD2` needs beyond current `KD1`.

### Main activities

- confirm that the reviewed `PPMS` baseline is the approved starting point
- confirm that `KD2` will be implemented as a switchable module inside the same page shell
- confirm that all current `KD1` features must also exist in `KD2`
- identify the additional `KD2` features that must be added beyond the current `KD1` feature set
- confirm that `KD1` tables and screens must remain stable during `KD2` delivery
- confirm that `KD2` will use separate tables from `KD1`
- confirm battalion structure assumptions for `KD2`
- confirm the approved `KD2` battalion baseline:
  - total battalions = `5`
  - `K9 = 18`
  - `K10 = 3`
  - `K11 = 4`
- confirm the approved `KD2` upstream route before `Assembly`:
  - `cutting`
  - `part machining`
  - `sub weldment`
  - `main weldment`
  - `structure machining`
  - `qualifing`
  - `foam`
  - `pre processing`
- confirm that `Assembly` onward follows the same downstream route as `KD1`
- document any remaining unknown production values as pending confirmation

### Deliverables

- approved PPMS current-state baseline
- approved `KD2` release-one scope
- explicit reuse list from current PPMS
- explicit no-change list for `KD1`
- approved decision that `KD2` is switchable inside the same PPMS shell
- approved decision that `KD2` uses separate tables from `KD1`
- approved battalion baseline for `KD2`
- approved upstream process route baseline for `KD2`
- open-items register for unresolved `KD2` business rules

### Exit criteria

This phase is complete when business and system owners agree on what `PPMS` already does today, that `KD2` will run as a switchable module inside the same shell, that `KD2` will use separate tables, what `KD2` must add, and what `KD1` must not be disrupted by.

---

## Phase 1: KD2 Functional Mapping on Top of PPMS

### Objective

Translate `KD2` business needs into PPMS-compatible functional requirements.

### Why this phase is required

The current PPMS contains functions that may be reused directly, reused with change, or replaced for `KD2`. This must be mapped intentionally rather than assumed.

### Main activities

- map current `KD1` PPMS functions against `KD2` needs
- define the `KD2` user journey from planning input to progress follow-up
- determine whether `KD2` requires the same summary cards now used in `KD1`
- determine whether `KD2` requires the same filter model
- determine whether `KD2` requires the same Gantt editing behavior
- determine whether the current VPX matrix concept is suitable for `KD2`
- define `KD2` import requirements
- define `KD2` export and reporting expectations
- define whether unit-code handling is shared or separate for `KD2`
- define whether user permissions stay shared or require `KD2`-specific permission control later

### Recommended reuse mapping

The following current PPMS capabilities should be considered reusable first:

- login and role handling
- filter bar behavior
- summary cards
- plan table structure
- export framework
- audit log framework
- unit-code maintenance pattern
- user-management pattern

The following capabilities likely require adaptation, not direct reuse:

- Gantt route logic
- VPX station columns
- import format
- category logic
- status and delay calculations if `KD2` route rules differ

### Deliverables

- `KD2` functional requirements mapped to current PPMS features
- reuse matrix showing reuse, adapt, or build-new decision for each major function
- user workflow definition for `KD2`
- screen-level functional baseline for implementation

### Exit criteria

This phase is complete when the team can state exactly how `KD2` fits into the current PPMS behavior and where dedicated `KD2` logic is required.

---

## Phase 2: Data Model and Separation Design

### Objective

Design the `KD2` data model and separation boundary from current `KD1` structures.

### Why this phase is required

The current PPMS tables are `KD1`-specific in naming and behavior. `KD2` should not be forced into these tables in a way that creates ambiguity, reporting confusion, or high maintenance risk.

### Main activities

- define whether `KD2` uses fully separate tables or a shared table with strict module identifiers
- define the preferred table naming strategy
- define battalion, vehicle, and unit identity rules for `KD2`
- define `KD2` process-step storage
- define storage for planning deadlines and lead times
- define storage for calculated dates versus manual entries
- define whether `KD2` needs separate unit-code mapping
- define whether audit logging stays in the same log table with module tagging

### Preferred architecture principle

The preferred design is separate `KD2` operational tables, while still reusing the same Supabase project and frontend platform.

### Recommended `KD2` tables

- `kd2_plan`
- `kd2_progress`
- `kd2_planning_inputs`
- `kd2_process_routes`
- `kd2_process_lead_times`
- `kd2_battalions`
- `kd2_vehicle_units` if unit mapping must be independent

### Shared-support tables that may stay common

- `planning_app_users`
- `planning_audit_log`

### Deliverables

- approved `KD2` data model
- confirmed module-separation rule between `KD1` and `KD2`
- field dictionary for `KD2`
- decision note for shared versus separate support tables

### Exit criteria

This phase is complete when the team can implement the `KD2` backend without risking confusion between current `KD1` records and future `KD2` records.

---

## Phase 3: Planning Logic and Scheduling Rules

### Objective

Define the `KD2` planning and scheduling rules to be implemented in PPMS.

### Why this phase is required

The current PPMS scheduling behavior is task-based and already includes week derivation, status calculation, and Gantt movement logic. `KD2` must extend this with battalion-driven planning and category-specific upstream process routes.

### Main activities

- define the full `KD2` route structure by vehicle type or category
- use the confirmed upstream steps before `Assembly` as the initial route baseline:
  - `cutting`
  - `part machining`
  - `sub weldment`
  - `main weldment`
  - `structure machining`
  - `qualifing`
  - `foam`
  - `pre processing`
- define step sequence logic
- define lead-time rules by vehicle type and process step
- define battalion quantity effect on planning
- define backward scheduling from delivery deadline
- define the rule for missing lead times or incomplete route definitions
- define whether `KD2` uses the same `Friday` non-working rule
- define whether `Saturday` remains optional in planning edits
- define whether capacity, overlap, or parallel processing is included in release one

### Current PPMS logic to review for reuse

- week generation from `start_date`
- date shifting during Gantt movement
- status calculation from plan and actual dates
- delay calculation rules

### Deliverables

- approved `KD2` planning-rule specification
- route and lead-time definition by category
- backward-planning rule set
- exception handling rules for incomplete data

### Exit criteria

This phase is complete when developers can implement the `KD2` scheduling engine and screen behavior from written rules instead of assumptions.

---

## Phase 4: Screen, Navigation, and User-Role Design

### Objective

Define how `KD2` will appear and behave inside the current PPMS user experience.

### Why this phase is required

The current PPMS interface is already structured around a `KD1` identity. `KD2` needs a clear user-facing separation so planners do not mix the two operational models.

### Main activities

- define whether users enter `KD2` from a new top-level navigation entry or a module selector
- define branding and page identity so `KD2` is visually distinguishable from `KD1`
- define which existing sections are reused in `KD2`
- define how filters must change for battalion-based planning
- define how `KD2` summary cards should be calculated
- define the `KD2` Gantt layout if included in release one
- define the `KD2` matrix or route-visibility screen
- define whether `KD2` requires its own import panel and report modal
- define which actions are available by role for `KD2`

### Minimum recommended `KD2` interface areas

1. `KD2 Summary`
2. `KD2 Filters`
3. `KD2 Battalion Plan Table`
4. `KD2 Route / Process Flow View`
5. `KD2 Planning Inputs View`
6. `KD2 Progress Tracking View`

### Deliverables

- approved `KD2` screen map
- approved navigation and branding approach
- role-action matrix for `KD2`
- view-level behavior for each `KD2` section

### Exit criteria

This phase is complete when the frontend work can begin without ambiguity about where `KD2` lives in PPMS or what each screen must show.

---

## Phase 5: Backend and Database Implementation

### Objective

Build the backend structures needed for `KD2` while keeping current `KD1` stable.

### Why this phase is required

The current PPMS frontend depends heavily on live Supabase reads and writes. `KD2` should first receive a stable database foundation before complex UI adaptation starts.

### Main activities

- create `KD2` tables in Supabase
- implement field constraints and keys
- implement route and lead-time storage
- implement planning-input storage
- implement progress storage
- implement audit logging for `KD2` actions
- define or implement row-level validation rules
- prepare backend query patterns for `KD2` summaries, tables, Gantt, and reports

### Recommended implementation rule

No change to current `KD1` table behavior should be released unless it is required for shared platform stability and is regression-tested.

### Deliverables

- working `KD2` backend tables
- validated field structure
- stable query model for `KD2`
- confirmed auditability for `KD2` changes

### Exit criteria

This phase is complete when `KD2` data can be stored, retrieved, updated, and validated independently of `KD1`.

---

## Phase 6: Frontend Adaptation in PPMS

### Objective

Implement the `KD2` frontend inside the existing PPMS application structure.

### Why this phase is required

This phase converts the data and rule design into working user behavior while preserving current PPMS strengths.

### Main activities

- add `KD2` navigation or module selection
- build `KD2` filter behavior
- build `KD2` summary cards
- build `KD2` plan and progress tables
- adapt or rebuild the Gantt for `KD2`
- adapt or rebuild the VPX-style matrix for `KD2`
- add `KD2` import handling if required
- add `KD2` report export if required
- connect all `KD2` screens to the new Supabase tables
- ensure audit logging records `KD2` changes clearly

### Areas of the current frontend likely to be reused

- page shell
- header and role display
- filter-control styling
- summary-card styling
- modal patterns
- export infrastructure
- toast and validation patterns

### Areas likely to require new logic

- route generation
- battalion-level calculations
- station or process-column definitions
- date-calculation engine for `KD2`
- import template and parser

### Deliverables

- working `KD2` PPMS frontend
- connected user workflows for planning and progress updates
- stable UI separation between `KD1` and `KD2`
- usable screens for controlled pilot activity

### Exit criteria

This phase is complete when `KD2` can be used end to end in the PPMS interface without requiring manual database intervention.

---

## Phase 7: Data Initialization and Migration Setup

### Objective

Prepare `KD2` baseline data, imports, and startup configuration for first business use.

### Why this phase is required

The current PPMS already supports manual import and external Excel upload. `KD2` requires controlled startup data so the module begins with valid route definitions and not with incomplete system configuration.

### Main activities

- load confirmed battalion baseline data
- load confirmed vehicle and unit structures
- load confirmed process routes
- load confirmed lead times
- prepare `KD2` import format if external loading is needed
- decide whether the current Python uploader should be duplicated or adapted for `KD2`
- keep all unknown values blank or explicitly marked as pending
- confirm default filter and startup views for `KD2`

### Data control rule

Unconfirmed business assumptions must not be loaded into live `KD2` tables as if they were approved values.

### Deliverables

- initialized `KD2` baseline data
- approved import template or upload method
- controlled startup configuration
- documented handling of pending values

### Exit criteria

This phase is complete when pilot users can open `KD2` and begin planning without constructing the system setup manually from scratch.

---

## Phase 8: Validation, Pilot, and Controlled Business Use

### Objective

Validate that `KD2` works correctly inside PPMS before wider release.

### Why this phase is required

The current PPMS already appears operational for `KD1`. Any `KD2` addition must prove both its own correctness and non-regression against existing `KD1`.

### Main activities

- validate `KD2` data separation from `KD1`
- validate route logic and sequencing
- validate backward-planning calculations
- validate battalion behavior
- validate summary, table, Gantt, and route views
- validate role permissions
- validate audit logging
- validate import and export behavior
- run pilot scenarios with confirmed examples
- run regression checks on current `KD1`

### Validation focus

- `KD2` functional correctness
- `KD2` calculation correctness
- `KD2` usability
- `KD1` regression protection
- shared-platform stability

### Deliverables

- validation results
- pilot feedback
- defect list and correction actions
- release recommendation or hold recommendation

### Exit criteria

This phase is complete when business users trust `KD2` outputs and system owners confirm that current `KD1` behavior remains safe.

---

## Phase 9: Release, Support, and Controlled Enhancement

### Objective

Move `KD2` into controlled operational use and define its support path.

### Why this phase is required

System delivery is incomplete until ownership, support, and future change control are defined.

### Main activities

- release the approved `KD2` module in PPMS
- define ownership of planning inputs and progress updates
- define responsibility for route and lead-time master data
- define support ownership for defects and enhancements
- provide user guidance on `KD1` versus `KD2`
- establish change-control rules for future route updates
- monitor the first live operating period

### Deliverables

- live `KD2` module
- operational ownership model
- controlled support model
- user guidance for module usage
- post-release monitoring and enhancement process

### Exit criteria

This phase is complete when `KD2` is live, owned, supportable, and managed under clear change-control rules.

---

## Open Items Requiring Business Confirmation

The following items remain open and should not be invented during implementation:

- lead time for each `KD2` process step by vehicle type
- final deadline rules by battalion
- whether `KD2` uses the same non-working-day rule as current `KD1`
- whether `KD2` requires a VPX-style matrix in release one
- whether unit-code mapping is shared with `KD1` or separated
- whether current PPMS roles are sufficient for `KD2`
- whether `KD2` import must follow the current `KD1` import style
- whether `KD2` reporting must match current `KD1` PDF and Excel output scope

---

## Expected Final Result

After these phases are completed, the PPMS platform should provide:

- a stable existing `KD1` module that remains operational
- a separate and controlled `KD2` module switchable inside the same PPMS page shell
- battalion-based planning for `K9`, `K10`, and `K11`
- visibility from `cutting -> part machining -> sub weldment -> main weldment -> structure machining -> qualifing -> foam -> pre processing -> Assembly -> Processing -> Final Test`
- controlled storage of `KD2` planning data, route data, and progress data
- reusable PPMS strengths such as permissions, exports, and auditability
- validated `KD2` calculations without weakening `KD1`
- a controlled platform basis for future `KD2` enhancement after first release
