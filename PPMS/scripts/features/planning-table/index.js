export function initFeature() {
    return `
        <!-- ═══════════════════════════════════════════════ TABLE -->
        <section class="table-section" id="tableSection" aria-label="Assembly Plan Table">
            <div class="table-card">
                <div class="table-card-header">
                    <h3 class="table-title" id="tableTitle">Assembly Plan Details</h3>
                    <div class="table-search-wrap">
                        <svg class="table-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <circle cx="8.5" cy="8.5" r="5.5" />
                            <path d="M15 15l-3-3" />
                        </svg>
                        <input type="text" id="tableSearch" class="table-search-input"
                            placeholder="Search vehicle, unit, station…" autocomplete="off" name="table-search-x"
                            role="searchbox" />
                    </div>
                    <div class="table-actions-header">
                        <span class="row-count" id="rowCount">0 records</span>
                        <button class="btn btn-outline btn-sm" id="btnReports">
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M4 4h12v2H4zM4 9h8v2H4zM4 14h6v2H4z" />
                                <path d="M14 12l1.5 1.5L18 11" />
                            </svg>
                            Export Report
                        </button>
                        <button class="btn btn-outline btn-sm" id="btnKd2DownloadTemplate" style="display:none">
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M10 3v10m-4-4 4 4 4-4" />
                                <path d="M4 17h12" />
                            </svg>
                            Download Template
                        </button>
                        <button class="btn btn-outline btn-sm" id="btnKd2UploadPlan" style="display:none">
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M10 17V7m-4 4 4-4 4 4" />
                                <path d="M4 3h12" />
                            </svg>
                            Upload Plan
                        </button>
                        <button class="btn btn-outline btn-sm" id="btnImport">
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M10 3v10m-4-4 4 4 4-4" />
                                <path d="M3 17h14" />
                            </svg>
                            Import Plan
                        </button>
                    </div>
                </div>

                <!-- Import Panel (hidden by default) -->
                <div class="import-panel" id="importPanel" style="display:none;">
                    <div class="import-inner">
                        <h4 class="import-title">Paste CSV / Tab-Separated Plan Data</h4>
                        <p class="import-hint">Format: vehicle, vehicle_no, process_station, week, start_date
                            (DD-Mon-YY), end_date (DD-Mon-YY), remark</p>
                        <textarea id="importText" class="import-textarea"
                            placeholder="K9,M5,Powerpack Check,FW9,23-Feb-26,23-Feb-26,"></textarea>
                        <div class="import-footer">
                            <button class="btn btn-primary" id="btnImportSubmit">Import Rows</button>
                            <button class="btn btn-ghost" id="btnImportCancel">Cancel</button>
                        </div>
                    </div>
                </div>

                <div class="import-panel" id="kd2ImportPanel" style="display:none;">
                    <div class="import-inner">
                        <h4 class="import-title">Upload KD2 Plan File</h4>
                        <p class="import-hint">Required columns: battalion_code, vehicle_type, unit_serial, unit_label, category_code, station_code, planned_start_date, duration_working_days. Optional: remark.</p>
                        <input type="file" id="kd2ImportFile" class="kd2-file-input" accept=".csv,.xlsx,.xls" />
                        <div class="modal-info">Excel imports use the first sheet only. Dates should use YYYY-MM-DD when possible.</div>
                        <div class="ab-error" id="kd2ImportError" style="display:none"></div>
                        <div class="kd2-import-summary" id="kd2ImportSummary" style="display:none"></div>
                        <div class="kd2-import-errors" id="kd2ImportErrors" style="display:none"></div>
                        <div class="import-footer">
                            <button class="btn btn-primary" id="btnKd2ImportSubmit">Import File</button>
                            <button class="btn btn-ghost" id="btnKd2ImportCancel">Cancel</button>
                        </div>
                    </div>
                </div>

                <div class="table-responsive">
                    <table class="data-table" id="mainTable">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Vehicle</th>
                                <th>Unit</th>
                                <th>Station / Process</th>
                                <th>Code / Work Center</th>
                                <th>Week</th>
                                <th>Planned Start</th>
                                <th>Planned End</th>
                                <th>Actual Start</th>
                                <th>Completed On</th>
                                <th>Status</th>
                                <th>Delay (days)</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="tableBody">
                            <tr>
                                <td colspan="13" class="table-empty">
                                    <div class="empty-state">
                                        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
                                            <rect x="6" y="6" width="36" height="36" rx="4" />
                                            <path d="M16 24h16M24 16v16" />
                                        </svg>
                                        <p>No data loaded. Apply filters or import a plan.</p>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
`.trim();
}


