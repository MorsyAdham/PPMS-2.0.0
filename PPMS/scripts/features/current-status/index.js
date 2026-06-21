export function initFeature() {
    return `
        <!-- ═══════════════════════════════════════════ CURRENT STATUS -->
        <section class="cs-section" id="statusSection" aria-label="Current Status" style="display:none">
            <div class="ppms-section-header">
                <h3 class="ppms-section-heading">Current Status</h3>
                <span class="ppms-section-sub">Plan position vs actual · Unit-by-unit variance</span>
            </div>

            <!-- Position banner: plan vs actual -->
            <div class="cs-banner">
                <div class="cs-pos-block">
                    <span class="cs-pos-label">Plan Position</span>
                    <span class="cs-pos-value" id="statusPlanPosition">—</span>
                    <span class="cs-pos-meta" id="statusPlanMeta">—</span>
                </div>
                <div class="cs-pos-sep">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                        <path d="M5 12h14M13 6l6 6-6 6"/>
                    </svg>
                    <span>vs actual</span>
                </div>
                <div class="cs-pos-block cs-pos-block--actual">
                    <span class="cs-pos-label">Actual Position</span>
                    <span class="cs-pos-value" id="statusActualPosition">—</span>
                    <span class="cs-pos-meta" id="statusActualMeta">—</span>
                </div>
                <div class="cs-gap-block">
                    <span class="cs-gap-label">Schedule Variance</span>
                    <span class="cs-gap-value" id="statusVariance">—</span>
                </div>
            </div>

            <!-- KPI row -->
            <div class="cs-kpi-row">
                <div class="cs-kpi-card">
                    <span class="cs-kpi-value" id="statusUnitsPlanDone">—</span>
                    <span class="cs-kpi-label">Units Planned Done</span>
                </div>
                <div class="cs-kpi-card cs-kpi-card--ok">
                    <span class="cs-kpi-value" id="statusUnitsActualDone">—</span>
                    <span class="cs-kpi-label">Units Actually Done</span>
                </div>
                <div class="cs-kpi-card cs-kpi-card--warn">
                    <span class="cs-kpi-value" id="statusUnitsBehind">—</span>
                    <span class="cs-kpi-label">Units Behind Plan</span>
                </div>
                <div class="cs-kpi-card cs-kpi-card--danger">
                    <span class="cs-kpi-value" id="statusTasksOverdue">—</span>
                    <span class="cs-kpi-label">Overdue Tasks</span>
                </div>
            </div>

            <!-- Unit table -->
            <div class="cs-table-wrap">
                <table class="data-table" id="statusTable">
                    <thead>
                        <tr>
                            <th>Unit</th>
                            <th>Vehicle</th>
                            <th>% Done</th>
                            <th>Overdue</th>
                            <th>Planned End</th>
                            <th>Actual End</th>
                            <th>Variance</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody id="statusTableBody">
                        <tr><td colspan="8" class="table-empty">Load plan data to view current status.</td></tr>
                    </tbody>
                </table>
            </div>
        </section>
`.trim();
}
