# PPMS Performance Backlog

Speed and memory improvements that are planned but not built yet. They are kept here so they are not forgotten. Each item applies to `app/` and must be mirrored to `app-v2/`.

## 1. Already done (for reference)

| Version | Change |
|---|---|
| v135 | Only one plan load at a time. Co-editors' changes are collected (1.2 s quiet, 5 s max) before one reload. |
| v136 | Lighter Gantt: CSS grid background instead of one cell per day. |
| v137 | Off-screen views redraw only when scrolled into view. The Plan Table is drawn in batches of 150 rows. Edit controls on Gantt blocks are built on hover. |
| v138 | Co-editors' changes are applied incrementally: only the changed blocks are fetched. |
| v140 | Background tabs pause redraws and polling, then catch up once when shown. Live updates are filtered to the open plan version. Export libraries (jsPDF, autoTable, SheetJS, ExcelJS) load on first use. Live updates redraw only the Gantt rows that changed. |
| v147 | The hidden KD2 workspace timeline (~5,000 elements) is no longer drawn on every load and live update. Gantt bars no longer carry a CSS filter at rest (it made every bar its own layer). Your own drags and resizes redraw only the changed Gantt rows. After an edit, the Plan Table and VPX redraw only when on screen. Gantt rows scrolled out of view skip layout and painting (`content-visibility`). Comment notifications receive only the open plan version's rows. Hidden tabs send the "online" signal every 60 s instead of 12 s. Full Gantt redraw with two battalions: 2.3 s → about 0.1 s. |

Measured on the real plan (1,202 blocks, 139 Gantt rows) after v140:

- full Gantt redraw: about 0.53 s;
- a co-editor's change: about 0.11 s, with 1 row replaced.

## 2. Still to do

Items are listed in suggested order.

### 2.1 Filter the comment-notification channel by plan version — done in v147

- **Today:** `startCommentNotifSync` listens to every `kd2_plan` and `f100_plans` update, in every plan version. So every tab still receives every block edit, even though the main live-update channel is now version-filtered. This cancels part of the v140 saving.
- **Change:**
  - Add `filter: plan_version_id=eq.<active id>` for the module that is open.
  - Keep the other module unfiltered, or filter it only when its active version is known.
  - Skip the localStorage read when the `comments` value has not changed.
- **Effort:** small. **Risk:** low. Check that comment notifications from other versions are not expected first.

### 2.2 Pause the presence heartbeat in hidden tabs — done in v147

- **Today:** presence sends a heartbeat every 12 s, even from a hidden tab.
- **Change:** slow it to about 60 s while the tab is hidden, and send one immediately when the tab is shown again. Users who are away would still show as online, as long as the pruning window allows for the slower beat.
- **Effort:** small. **Risk:** low. Check the active-users panel with two accounts.

### 2.3 Safety valve for slow PCs

- **Today:** if a PC cannot keep up, it redraws continuously while others edit.
- **Change:** if three live redraws in a row take longer than about 1.5 s, stop redrawing automatically. Show a "New changes — click to refresh" chip instead, and resume normal behaviour after the user refreshes.
- **Effort:** small to medium. **Risk:** low.

### 2.4 Draw only the visible part of the Gantt (virtualisation) — mostly solved in v147

Measured on 5 Oct 2026 with two battalions (2,160 blocks, 139 rows, 366 days): a full Gantt redraw takes about 1.25 s, of which about 0.9 s is layout of the bars. Only 12% of the timeline is on screen at once (1,644 of 13,176 px).

v147 lets the browser skip rows that are scrolled out of view (`content-visibility: auto`), which brought a full redraw to about 0.1 s without changing how the Gantt is built. Full virtualisation is only worth doing if more battalions push it back above about 0.5 s.


- **Today:** every row and the full date range are drawn, even though only part is on screen. This is fine at 139 rows, but grows with every battalion added.
- **Change:**
  - Draw only the rows in view, plus a buffer.
  - Add rows as the user scrolls, using spacer elements to keep the total height.
  - Optionally do the same for date columns.
- **Must keep working:**
  - drag across rows;
  - lane select;
  - reorder route;
  - export;
  - hover guide;
  - scroll restore;
  - fullscreen.
- **Effort:** large. **Risk:** medium. Do this when more battalions are loaded, or if users report slowness.

### 2.5 Move heavy calculations off the main thread

- **Today:** the delivery forecast (`planForecast`), the analytics charts and the Executive Report models run on the page thread, so the screen can stutter briefly on slower PCs.
- **Change:** run them in a Web Worker and send back only the results.
- **Effort:** medium. **Risk:** low. They are pure calculations, but the data has to be passed as plain objects.

### 2.6 Build Gantt rows only for changed lanes

- **Today:**
  - A live update builds the HTML for all rows, about 0.1 s, then replaces only the changed ones.
  - The browser layout work is already avoided; the remaining cost is building the text.
- **Change:** cache each row's HTML by lane key and rebuild only lanes that contain changed block ids. Fall back to a full build when the layout changes.
- **Effort:** medium. **Risk:** medium. Row height, progress text and status colours depend on all blocks in the lane.

### 2.7 Version-filter progress changes

- **Today:** `kd2_progress` changes (actual start, completion, X-ray) arrive from all plan versions, because the table has no `plan_version_id` column. Each change costs one small fetch.
- **Change:** this needs either a `plan_version_id` column on `kd2_progress`, or a database view that adds it. That is a database change, so it must not break `app/` before the security cut-over.
- **Effort:** medium. **Risk:** low.

## 3. Known small gaps from v140

- A deleted block that is outside your current filter is ignored by the live update. The filter dropdown lists (battalions, weeks) refresh on the next reload instead of straight away.
- Background-tab catch-up was tested by simulating the tab being shown again. Real tab switching with two users should be confirmed during normal use.
