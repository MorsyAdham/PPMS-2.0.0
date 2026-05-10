'use strict';

(function () {
    const SUPABASE_URL = "https://biqwfqkuhebxcfucangt.supabase.co";
    const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcXdmcWt1aGVieGNmdWNhbmd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzNzM5NzQsImV4cCI6MjA4MTk0OTk3NH0.QkASAl8yzXfxVq0b0FdkXHTOpblldr2prCnImpV8ml8";

    const HISTORY_KEY = 'ppms_system_test_history_v1';
    const AUTO_RUN_KEY = 'ppms_system_test_autorun';
    const LABEL_KEY = 'ppms_system_test_label';

    let latestRun = null;

    document.addEventListener('DOMContentLoaded', () => {
        bindControls();
        hydratePreferences();
        renderHistory();
        if (document.getElementById('autoRunToggle').checked) {
            runChecks();
        }
    });

    function bindControls() {
        document.getElementById('btnRunChecks').addEventListener('click', runChecks);
        document.getElementById('btnSaveSnapshot').addEventListener('click', saveSnapshot);
        document.getElementById('btnClearHistory').addEventListener('click', clearHistory);
        document.getElementById('autoRunToggle').addEventListener('change', handleAutoRunChange);
        document.getElementById('updateLabel').addEventListener('input', handleLabelChange);
    }

    function hydratePreferences() {
        const autoRun = localStorage.getItem(AUTO_RUN_KEY) === 'true';
        const savedLabel = localStorage.getItem(LABEL_KEY) || '';
        document.getElementById('autoRunToggle').checked = autoRun;
        document.getElementById('updateLabel').value = savedLabel;
    }

    function handleAutoRunChange(event) {
        localStorage.setItem(AUTO_RUN_KEY, String(event.target.checked));
    }

    function handleLabelChange(event) {
        localStorage.setItem(LABEL_KEY, event.target.value);
    }

    async function runChecks() {
        setRunState('Running');
        setSaveDisabled(true);
        renderResultsLoading();
        renderRecommendations([{ title: 'Harness is running', text: 'Please wait while the page checks connectivity, table access, KD1 baseline, and KD2 readiness.' }]);

        const startedAt = new Date();
        const updateLabel = document.getElementById('updateLabel').value.trim();
        const client = createClient();

        const results = [];
        const connectivity = await smokeTest(client);
        results.push(connectivity);

        if (connectivity.severity !== 'fail') {
            const counts = await loadCounts(client);
            results.push(...buildAvailabilityResults(counts));
            results.push(...buildReadinessResults(counts));
        } else {
            results.push({
                group: 'Runner',
                name: 'Follow-on checks skipped',
                severity: 'fail',
                detail: 'The smoke test could not reach the PPMS data layer, so the harness stopped after the connectivity failure.',
            });
        }

        latestRun = {
            label: updateLabel || 'Unlabeled update',
            timestamp: startedAt.toISOString(),
            results,
            summary: summarize(results),
        };

        renderSummary(latestRun);
        renderResults(results);
        renderRecommendations(buildRecommendations(results));
        setRunState(latestRun.summary.overall.toUpperCase());
        setSaveDisabled(false);
    }

    function createClient() {
        const noopStorage = {
            getItem: () => null,
            setItem: () => { },
            removeItem: () => { },
        };

        return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
                storage: noopStorage,
            },
        });
    }

    async function smokeTest(client) {
        try {
            const { count, error } = await client
                .from('assembly_plan')
                .select('id', { count: 'exact', head: true });
            if (error) throw error;

            return {
                group: 'Connectivity',
                name: 'Supabase connection',
                severity: 'pass',
                detail: `Connected successfully. Sample query to assembly_plan returned count access (${count ?? 0} rows visible).`,
            };
        } catch (error) {
            return {
                group: 'Connectivity',
                name: 'Supabase connection',
                severity: 'fail',
                detail: `Connection failed: ${error.message}`,
            };
        }
    }

    async function loadCounts(client) {
        const tableNames = [
            'assembly_plan',
            'assembly_progress',
            'vehicle_units',
            'planning_app_users',
            'planning_audit_log',
            'kd2_battalions',
            'kd2_planning_inputs',
            'kd2_process_categories',
            'kd2_process_stations',
            'kd2_process_routes',
            'kd2_process_lead_times',
            'kd2_template_layout_items',
            'kd2_vehicle_units',
            'kd2_plan',
            'kd2_progress',
            'kd2_plan_live',
        ];

        const entries = await Promise.all(tableNames.map(async (name) => {
            const result = await countRows(client, name);
            return [name, result];
        }));

        const missingLeadTimes = await countNullRows(client, 'kd2_process_lead_times', 'lead_time_days');
        const battalionDeadlines = await countNonNullRows(client, 'kd2_battalions', 'delivery_deadline');

        return {
            tables: Object.fromEntries(entries),
            missingLeadTimes,
            battalionDeadlines,
        };
    }

    async function countRows(client, tableName) {
        try {
            const { count, error } = await client
                .from(tableName)
                .select('id', { count: 'exact', head: true });
            if (error) throw error;
            return { ok: true, count: count ?? 0 };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    }

    async function countNullRows(client, tableName, columnName) {
        try {
            const { count, error } = await client
                .from(tableName)
                .select('id', { count: 'exact', head: true })
                .is(columnName, null);
            if (error) throw error;
            return { ok: true, count: count ?? 0 };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    }

    async function countNonNullRows(client, tableName, columnName) {
        try {
            const { count, error } = await client
                .from(tableName)
                .select('id', { count: 'exact', head: true })
                .not(columnName, 'is', null);
            if (error) throw error;
            return { ok: true, count: count ?? 0 };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    }

    function buildAvailabilityResults(counts) {
        const results = [];
        const labelMap = {
            assembly_plan: 'KD1 plan table',
            assembly_progress: 'KD1 progress table',
            vehicle_units: 'Shared unit-code table',
            planning_app_users: 'Shared user table',
            planning_audit_log: 'Shared audit table',
            kd2_battalions: 'KD2 battalion table',
            kd2_planning_inputs: 'KD2 planning inputs table',
            kd2_process_categories: 'KD2 process categories table',
            kd2_process_stations: 'KD2 process stations table',
            kd2_process_routes: 'KD2 process routes table',
            kd2_process_lead_times: 'KD2 lead-time table',
            kd2_template_layout_items: 'KD2 template layout table',
            kd2_vehicle_units: 'KD2 vehicle units table',
            kd2_plan: 'KD2 plan table',
            kd2_progress: 'KD2 progress table',
            kd2_plan_live: 'KD2 live view',
        };

        Object.entries(labelMap).forEach(([tableName, title]) => {
            const info = counts.tables[tableName];
            results.push(info.ok
                ? {
                    group: 'Availability',
                    name: title,
                    severity: 'pass',
                    detail: `${tableName} is reachable and returned ${info.count} rows.`,
                }
                : {
                    group: 'Availability',
                    name: title,
                    severity: 'fail',
                    detail: `${tableName} is not healthy: ${info.error}`,
                });
        });

        return results;
    }

    function buildReadinessResults(counts) {
        const results = [];
        const get = (name) => counts.tables[name];

        results.push(compareExpected('KD2 battalion baseline', get('kd2_battalions'), 5, {
            pass: 'Five battalions are configured as expected.',
            warn: 'KD2 battalion count differs from the approved five-battalion baseline.',
            fail: 'KD2 battalion data is missing or inaccessible.',
        }));

        results.push(compareExpected('KD2 planning input baseline', get('kd2_planning_inputs'), 15, {
            pass: 'Fifteen battalion-by-vehicle planning rows are present.',
            warn: 'Planning inputs are not aligned with the expected 5 battalions x 3 vehicle types baseline.',
            fail: 'KD2 planning input data is missing or inaccessible.',
        }));

        results.push(compareExpected('KD2 route category baseline', get('kd2_process_categories'), 18, {
            pass: 'The baseline category setup matches 6 categories across K9, K10, and K11.',
            warn: 'Category count does not match the current release-one baseline.',
            fail: 'KD2 process categories are missing or inaccessible.',
        }));

        results.push(compareExpected('KD2 route station baseline', get('kd2_process_stations'), 148, {
            pass: 'The baseline station setup matches the seeded detailed KD2 route.',
            warn: 'Station count differs from the seeded baseline and should be reviewed after route edits.',
            fail: 'KD2 process stations are missing or inaccessible.',
        }));

        results.push(compareRelated('KD2 routes vs stations', get('kd2_process_routes'), get('kd2_process_stations'), {
            pass: 'The route table and station table are aligned by row count.',
            warn: 'Route rows and station rows do not match, so generation logic should be reviewed.',
            fail: 'Route or station data is missing or inaccessible.',
        }));

        results.push(nullCountCheck('KD2 confirmed lead times', counts.missingLeadTimes, {
            pass: 'All KD2 lead-time rows are confirmed.',
            warn: 'Some KD2 lead-time rows are still blank and will limit planning confidence.',
            fail: 'Lead-time confirmation could not be checked.',
        }));

        results.push(nonNullMinimumCheck('KD2 battalion deadlines', counts.battalionDeadlines, 1, {
            pass: 'At least one battalion deadline is loaded.',
            warn: 'No battalion deadlines are loaded yet.',
            fail: 'Battalion deadline readiness could not be checked.',
        }));

        results.push(minimumCheck('KD2 generated plan rows', get('kd2_plan'), 1, {
            pass: 'KD2 plan rows exist, so the generator has produced output.',
            warn: 'No KD2 plan rows exist yet. This may be acceptable early, but it means pilot execution is not ready.',
            fail: 'KD2 plan readiness could not be checked.',
        }));

        results.push(compareRelated('KD2 live view coverage', get('kd2_plan_live'), get('kd2_plan'), {
            pass: 'KD2 live view row count matches the underlying plan table.',
            warn: 'KD2 live view row count differs from kd2_plan and should be reviewed.',
            fail: 'KD2 live view coverage could not be checked.',
        }));

        results.push(minimumCheck('KD1 baseline data', get('assembly_plan'), 1, {
            pass: 'KD1 plan data exists and the legacy module still has accessible rows.',
            warn: 'KD1 plan table is reachable but currently empty.',
            fail: 'KD1 baseline data could not be checked.',
        }));

        return results;
    }

    function compareExpected(name, info, expectedCount, messages) {
        if (!info || !info.ok) {
            return { group: 'Readiness', name, severity: 'fail', detail: messages.fail };
        }
        if (info.count === expectedCount) {
            return { group: 'Readiness', name, severity: 'pass', detail: `${messages.pass} Current count: ${info.count}.` };
        }
        return { group: 'Readiness', name, severity: info.count === 0 ? 'fail' : 'warn', detail: `${messages.warn} Current count: ${info.count}, expected: ${expectedCount}.` };
    }

    function compareRelated(name, leftInfo, rightInfo, messages) {
        if (!leftInfo?.ok || !rightInfo?.ok) {
            return { group: 'Readiness', name, severity: 'fail', detail: messages.fail };
        }
        if (leftInfo.count === rightInfo.count) {
            return { group: 'Readiness', name, severity: 'pass', detail: `${messages.pass} Count: ${leftInfo.count}.` };
        }
        return { group: 'Readiness', name, severity: 'warn', detail: `${messages.warn} Left count: ${leftInfo.count}, right count: ${rightInfo.count}.` };
    }

    function nullCountCheck(name, info, messages) {
        if (!info?.ok) {
            return { group: 'Readiness', name, severity: 'fail', detail: messages.fail };
        }
        if (info.count === 0) {
            return { group: 'Readiness', name, severity: 'pass', detail: messages.pass };
        }
        return { group: 'Readiness', name, severity: 'warn', detail: `${messages.warn} Blank rows: ${info.count}.` };
    }

    function nonNullMinimumCheck(name, info, minimum, messages) {
        if (!info?.ok) {
            return { group: 'Readiness', name, severity: 'fail', detail: messages.fail };
        }
        if (info.count >= minimum) {
            return { group: 'Readiness', name, severity: 'pass', detail: `${messages.pass} Non-null rows: ${info.count}.` };
        }
        return { group: 'Readiness', name, severity: 'warn', detail: `${messages.warn} Non-null rows: ${info.count}.` };
    }

    function minimumCheck(name, info, minimum, messages) {
        if (!info?.ok) {
            return { group: 'Readiness', name, severity: 'fail', detail: messages.fail };
        }
        if (info.count >= minimum) {
            return { group: 'Readiness', name, severity: 'pass', detail: `${messages.pass} Current count: ${info.count}.` };
        }
        return { group: 'Readiness', name, severity: 'warn', detail: `${messages.warn} Current count: ${info.count}.` };
    }

    function summarize(results) {
        const pass = results.filter(item => item.severity === 'pass').length;
        const warn = results.filter(item => item.severity === 'warn').length;
        const fail = results.filter(item => item.severity === 'fail').length;
        const overall = fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass';
        return { pass, warn, fail, overall };
    }

    function renderSummary(run) {
        document.getElementById('summaryOverall').textContent = run.summary.overall.toUpperCase();
        document.getElementById('summaryPass').textContent = String(run.summary.pass);
        document.getElementById('summaryWarn').textContent = String(run.summary.warn);
        document.getElementById('summaryFail').textContent = String(run.summary.fail);
        document.getElementById('summaryTimestamp').textContent = `${run.label} • ${formatTimestamp(run.timestamp)}`;
    }

    function renderResultsLoading() {
        document.getElementById('resultsList').innerHTML = '<div class="empty-state">Running checks...</div>';
    }

    function renderResults(results) {
        const container = document.getElementById('resultsList');
        if (!results.length) {
            container.innerHTML = '<div class="empty-state">No results available.</div>';
            return;
        }

        container.innerHTML = results.map(item => `
            <article class="result-card">
                <div class="result-head">
                    <div>
                        <div class="result-title">${escapeHtml(item.name)}</div>
                        <div class="result-meta">${escapeHtml(item.group)}</div>
                    </div>
                    <span class="badge badge-${item.severity}">${item.severity.toUpperCase()}</span>
                </div>
                <div class="result-detail">${escapeHtml(item.detail)}</div>
            </article>
        `).join('');
    }

    function buildRecommendations(results) {
        const items = [];
        const failures = results.filter(item => item.severity === 'fail');
        const warnings = results.filter(item => item.severity === 'warn');

        if (failures.length === 0 && warnings.length === 0) {
            items.push({
                title: 'System health is clean',
                text: 'No warnings or failures were found in the current harness run.',
            });
            return items;
        }

        failures.forEach(item => {
            items.push({
                title: `Fix failure: ${item.name}`,
                text: item.detail,
            });
        });

        warnings.forEach(item => {
            items.push({
                title: `Review warning: ${item.name}`,
                text: item.detail,
            });
        });

        return items;
    }

    function renderRecommendations(items) {
        const container = document.getElementById('recommendations');
        if (!items.length) {
            container.innerHTML = '<div class="empty-state">No recommendations available.</div>';
            return;
        }

        container.innerHTML = items.map(item => `
            <article class="recommendation-item">
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(item.text)}</span>
            </article>
        `).join('');
    }

    function saveSnapshot() {
        if (!latestRun) return;
        const history = loadHistory();
        history.unshift({
            label: latestRun.label,
            timestamp: latestRun.timestamp,
            summary: latestRun.summary,
        });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
        renderHistory();
    }

    function renderHistory() {
        const container = document.getElementById('historyList');
        const history = loadHistory();
        if (!history.length) {
            container.innerHTML = '<div class="empty-state">No saved snapshots yet.</div>';
            return;
        }

        container.innerHTML = history.map(item => `
            <article class="history-item">
                <div class="history-head">
                    <div>
                        <div class="history-title">${escapeHtml(item.label)}</div>
                        <div class="history-meta">${formatTimestamp(item.timestamp)}</div>
                    </div>
                    <span class="badge badge-${item.summary.overall}">${item.summary.overall.toUpperCase()}</span>
                </div>
                <div class="history-meta">
                    Pass: ${item.summary.pass} · Warn: ${item.summary.warn} · Fail: ${item.summary.fail}
                </div>
            </article>
        `).join('');
    }

    function loadHistory() {
        try {
            return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        } catch {
            return [];
        }
    }

    function clearHistory() {
        localStorage.removeItem(HISTORY_KEY);
        renderHistory();
    }

    function setRunState(label) {
        document.getElementById('runStatus').textContent = label;
    }

    function setSaveDisabled(disabled) {
        document.getElementById('btnSaveSnapshot').disabled = disabled;
    }

    function formatTimestamp(value) {
        try {
            return new Date(value).toLocaleString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return value;
        }
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
})();
