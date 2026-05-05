export function initFeature() {
    return `
        <!-- ═══════════════════════════════════════════════ CHARTS -->
        <section class="charts-section" id="chartsSection" aria-label="Charts">
            <div class="charts-grid">
                <div class="chart-card">
                    <div class="chart-card-header">
                        <h3 class="chart-title" id="barChartTitle">Status Breakdown</h3>
                        <span class="chart-subtitle" id="barChartSubtitle">Planned · Completed · Late Completion · Overdue</span>
                    </div>
                    <div class="chart-canvas-wrap">
                        <canvas id="barChart"></canvas>
                    </div>
                </div>
                <div class="chart-card">
                    <div class="chart-card-header">
                        <h3 class="chart-title" id="lineChartTitle">Cumulative Progress</h3>
                        <span class="chart-subtitle" id="lineChartSubtitle">Planned Completion vs Actual</span>
                    </div>
                    <div class="chart-canvas-wrap">
                        <canvas id="lineChart"></canvas>
                    </div>
                </div>
            </div>
        </section>
`.trim();
}


