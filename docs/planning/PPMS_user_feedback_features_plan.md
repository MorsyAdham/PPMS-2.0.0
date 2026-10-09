# PPMS — User Feedback Features Plan

Status: items 2–4 and the report ordering are built and browser-tested (uncommitted). Item 1 preview built 2026-10-09 — **waiting for approval** (`docs/previews/delivery_dashboard_preview.html`). Live app is v160.
Every change in `app/` must also be copied to `app-v2/`. No database changes.

## 1. Delivery — full-screen management view (preview first)

User request: the delivery view must be large (full screen), organized, professional and accurate, because higher management will use it. **Build a preview page first and get approval before changing the system.**

Plan:
- Build a separate preview page (for example `docs/previews/delivery_dashboard_preview.html`) from live data, so the numbers are real.
- Use the existing forecast engine — `planForecast()` / `getPlanForecast()` in `app/scripts/app.js` (~line 5481). It already drives the Delivery card, the current Delivery Delay Analysis modal (`_showDeliveryAnalysisModal`, ~line 5674), the VPX Station Report and the Executive Report, so all figures will match.
- Proposed layout:
  - Headline: planned vs expected delivery, delay in working days, on-track / late status.
  - Per battalion and per vehicle (K9 / K10 / K11): planned finish, forecast finish, delay.
  - Unit table: every unit's planned vs forecast finish, worst first.
  - Where to act: stations adding the most delay, by category.
  - Short "how it is calculated" note (working days, Fridays excluded; process order; Hull and Turret in parallel, then Assembly).
- After approval: replace the modal with a full-screen view opened from the Delivery card.

## 2. VPX — enter / update production dates from the matrix

User request: an option to enter or update the production dates from the VPX, via a button that only shows when hovering a cell.

Plan:
- Add a pencil button to each Matrix-view cell that has a task (F200 in `renderVPX`, F100 in `renderF100VPX`). Hidden until the cell is hovered. Not in the Station Report view (those cells are projections).
- Show it only to roles that can already edit dates (`canWrite()`).
- The button opens a small popover: station / unit title, planned dates, **Actual start** and **Completed on** date inputs, a **Today** shortcut, **Clear**, Cancel / Save.
- Save through the existing `saveActualStart()` and `saveCompletionDate()` (~line 7610 / 7715), so audit log, notifications, co-editing broadcast and view refresh behave exactly like the Plan Table.
- Validation: completion not before actual start; no future dates.
- Full-screen VPX uses the browser's native full screen, so the popover must be appended to `document.fullscreenElement` when one is active (not `document.body`).
- Wire it next to `wireVpxDelayReasonModal()` (call site ~line 8552).

## 3. VPX — highlight the current cell, row and column

User request: highlight the cell, its column and its row so it is easy to see which cell you are on.

Plan:
- Delegated `mouseover` / `mouseleave` on `#vpxMatrix`: add `vpx-hl-row` to the row, `vpx-hl-col` to every cell with the same `data-ci` and to the header `th[data-col]`, and `vpx-hl-cell` to the cell itself.
- Use a background-image tint so the status colours stay visible; outline the hovered cell in the accent colour; accent bar on the sticky unit label.
- Keep the highlight while the date popover is open.
- Styles go in `app/styles/features/vpx.css` (light and dark themes).

## 4. Plan Details table — better filters

User feedback: the Unit filter only shows the unit name (M1, M2… repeat in every battalion and vehicle), and there is no Category filter.

Plan (`getTableFilterFields()` ~line 1604, `_thCell()` / `_renderThFilterMenu()` ~line 4743):
- Unit filter value for F200: `BTL-01 · K9 M2 · EGY N26011` (battalion · vehicle + unit · unit code), sorted naturally.
- New **Category** filter using `getModuleCategory(r.process_station, r)` — the same categories as the main Filters bar. Shown as a second filter button on the "Station / Process" header (no new column, so `colspan="12"` stays valid).
- Search box at the top of long filter menus (more than 8 options); keep the typed text when the menu re-renders.

## 5. Bugs fixed in v160 (already shipped)

- Manage Lead Times — category cards were squashed and hid their inputs (`.kd2-leadtime-category { flex-shrink: 0 }`).
- Gantt Reorder route — bars scrolled to the left painted over the station names while a row menu was open (`.gc-row-menu-open .gr-label { z-index: 82 }`).

## Finishing steps

1. Copy changes to `app-v2/`.
2. Add Korean and Arabic text for new UI strings in `tools/i18n_stage4_draft.py`, then rebuild `strings.js` with `tools/i18n_extract.py` + `tools/i18n_build.py`.
3. `node --check app/scripts/app.js`; test in the browser (KD2, more than one battalion; KD1; F100; light and dark theme; full-screen VPX).
4. Update the user manual topics (progress-matrix, plan-table, filters) and screenshots.
5. Commit, push and deploy only when asked (`bash tools/deploy.sh`).
