export function initFeature() {
    return `
        <!-- ═══════════════════════════════════════════════ FILTER BAR -->
        <section class="filter-section" aria-label="Filters">
            <div class="filter-grid">
                <div class="filter-item">
                    <label class="filter-label" for="filterVehicle">Vehicle</label>
                    <select id="filterVehicle" class="filter-control">
                        <option value="">All Vehicles</option>
                    </select>
                </div>
                <div class="filter-item" id="filterK9ComponentGroup" style="display:none;">
                    <label class="filter-label" for="filterK9Component">K9 Component</label>
                    <select id="filterK9Component" class="filter-control">
                        <option value="">All Components</option>
                        <option value="Hull">Hull</option>
                        <option value="Turret">Turret</option>
                    </select>
                </div>
                <div class="filter-item" id="filterBattalionGroup" style="display:none;">
                    <label class="filter-label" for="filterBattalion">Battalion</label>
                    <select id="filterBattalion" class="filter-control">
                        <option value="">All Battalions</option>
                    </select>
                </div>
                <div class="filter-item">
                    <label class="filter-label" for="filterUnit" id="filterUnitLabel">Unit</label>
                    <select id="filterUnit" class="filter-control">
                        <option value="">All Units</option>
                    </select>
                </div>
                <div class="filter-item">
                    <label class="filter-label" for="filterCategory">Category</label>
                    <select id="filterCategory" class="filter-control">
                        <option value="">All Categories</option>
                        <option value="Assembly">Assembly</option>
                        <option value="Final Test">Final Test</option>
                        <option value="Processing">Processing</option>
                    </select>
                </div>
                <div class="filter-item">
                    <label class="filter-label" for="filterWeek">Week</label>
                    <select id="filterWeek" class="filter-control">
                        <option value="">All Weeks</option>
                    </select>
                </div>
                <div class="filter-item">
                    <label class="filter-label" for="filterTimeFrame">Time Frame</label>
                    <select id="filterTimeFrame" class="filter-control">
                        <option value="all">All Time</option>
                        <option value="day">Today</option>
                        <option value="week">This Week</option>
                        <option value="month">This Month</option>
                        <option value="custom">Custom Range</option>
                    </select>
                </div>
                <div class="filter-item" id="customDateStart" style="display:none;">
                    <label class="filter-label" for="filterStartDate">Start Date</label>
                    <input type="date" id="filterStartDate" class="filter-control" />
                </div>
                <div class="filter-item" id="customDateEnd" style="display:none;">
                    <label class="filter-label" for="filterEndDate">End Date</label>
                    <input type="date" id="filterEndDate" class="filter-control" />
                </div>
                <div class="filter-item filter-actions">
                    <button class="btn btn-primary" id="btnApply">
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 5h14M6 10h8M9 15h2" />
                        </svg>
                        Apply Filters
                    </button>
                    <button class="btn btn-ghost" id="btnReset">Reset</button>
                </div>
            </div>
        </section>
`.trim();
}


