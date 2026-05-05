'use strict';

window.PPMSModuleRuntime = (() => {
    const MODULE_KEY = 'ppms_active_module';
    const SESSION_KEY = 'kd1_session';
    const VEHICLES = ['K9', 'K10', 'K11'];

    const MODULES = {
        kd1: {
            id: 'kd1',
            badge: 'KD1',
            title: 'Production Planning & Monitoring Control',
            subtitle: 'Plan vs Actual Tracking System',
            tableTitle: 'Assembly Plan Details',
            unitLabel: 'Unit',
            categories: ['Assembly', 'Final Test', 'Processing'],
        },
        kd2: {
            id: 'kd2',
            badge: 'KD2',
            title: 'Production Planning & Monitoring Control',
            subtitle: 'Battalion Planning and Progress Control',
            tableTitle: 'KD2 Battalion Plan Details',
            unitLabel: 'Battalion / Unit',
            categories: [
                'Welding',
                'Machining',
                'Shot Blasting and Painting',
                'Assembly',
                'Processing',
                'Final Test',
            ],
        },
    };
    const KD2_CATEGORY_CODES = new Set(['welding', 'machining', 'shot_blasting_painting', 'assembly', 'processing', 'final_test']);
    const NON_WORK_MODULE_ID = 'kd2';
    const KD2_IMPORT_COLUMNS = [
        'battalion_code',
        'vehicle_type',
        'unit_serial',
        'unit_label',
        'category_code',
        'station_code',
        'planned_start_date',
        'duration_working_days',
        'remark',
    ];
    const KD2_IMPORT_REQUIRED_COLUMNS = KD2_IMPORT_COLUMNS.filter(column => column !== 'remark');
    const KD2_SATURDAY_WORKING = true;

    let dbRef = null;
    let helpers = { reloadAll: null };
    let wired = false;
    const state = {
        battalions: [],
        planningInputs: [],
        categories: [],
        stations: [],
        routes: [],
        leadTimes: [],
        vehicleUnits: [],
        nonWorkDays: [],
        nonWorkDaySet: new Set(),
        routeVehicle: 'K9',
        timelineRows: [],
        timelineEditMode: false,
        timelineMoveMode: 'block',
        timelineSelectLaneMode: false,
        timelineSelectedIds: new Set(),
        timelineLastDragAt: 0,
        timelinePlacementActive: false,
        timelinePlacementMenuOpen: false,
        timelinePlacementVehicle: 'K9',
        timelinePlacementStationCode: '',
        templateRemovedStations: new Set(),
        templateNewRowCounter: 0,
    };

    function getActiveModule() {
        const stored = localStorage.getItem(MODULE_KEY);
        return MODULES[stored] ? stored : 'kd1';
    }

    function isKD2() {
        return getActiveModule() === 'kd2';
    }

    function setActiveModule(moduleId) {
        localStorage.setItem(MODULE_KEY, MODULES[moduleId] ? moduleId : 'kd1');
    }

    function getActiveConfig() {
        return MODULES[getActiveModule()];
    }

    function getCurrentUser() {
        try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
    }

    function canManageKD2() {
        const role = getCurrentUser()?.role;
        return ['master_admin', 'admin', 'planner'].includes(role);
    }

    function stationCodeMatchesVehicle(vehicleType, stationCode) {
        return String(stationCode || '').toLowerCase().startsWith(`${String(vehicleType || '').toLowerCase()}_`);
    }

    function workCenterTokens(workCenter) {
        return String(workCenter || '')
            .toUpperCase()
            .match(/A\d{2}/g) || [];
    }

    function stationAllowedForVehicle(row) {
        if (!row || !stationCodeMatchesVehicle(row.vehicle_type, row.station_code)) return false;
        if (row.category_code !== 'assembly') return true;
        const tokens = workCenterTokens(row.work_center);
        if (!tokens.length) return false;
        const allowed = row.vehicle_type === 'K9'
            ? new Set(['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11'])
            : new Set(['A01', 'A02', 'A12', 'A13', 'A14', 'A15']);
        return tokens.some(token => allowed.has(token));
    }

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function toast(message, type = 'info') {
        if (typeof window.showToast === 'function') window.showToast(message, type);
        else console[type === 'error' ? 'error' : 'log'](message);
    }

    function populateCategoryFilter(categories) {
        const sel = document.getElementById('filterCategory');
        if (!sel) return;
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">All Categories</option>';
        categories.forEach(category => {
            const opt = document.createElement('option');
            opt.value = category;
            opt.textContent = category;
            sel.appendChild(opt);
        });
        if ([...sel.options].some(opt => opt.value === currentVal)) sel.value = currentVal;
    }

    function setDisplay(id, visible) {
        const el = document.getElementById(id);
        if (el) el.style.display = visible ? '' : 'none';
    }

    function applyModuleShell() {
        const config = getActiveConfig();
        document.body.dataset.module = config.id;
        setText('moduleBadge', config.badge);
        setText('brandTitle', config.title);
        setText('brandSubtitle', config.subtitle);
        setText('tableTitle', config.tableTitle);
        setText('filterUnitLabel', config.unitLabel);
        populateCategoryFilter(config.categories);

        const selector = document.getElementById('moduleSelector');
        if (selector) selector.value = config.id;

        setDisplay('filterBattalionGroup', isKD2());
        setDisplay('kd2PhaseSection', isKD2());
        setDisplay('kd2WorkspaceSection', isKD2());
        setDisplay('ganttSection', true);
        setDisplay('vpxSection', true);
        setDisplay('chartsSection', true);
        setDisplay('btnImport', !isKD2());
        setDisplay('btnKd2DownloadTemplate', isKD2());
        setDisplay('btnKd2UploadPlan', isKD2());
        setDisplay('btnGanttEdit', true);
        setDisplay('btnReports', true);
        if (isKD2()) {
            const legacyImportPanel = document.getElementById('importPanel');
            if (legacyImportPanel) legacyImportPanel.style.display = 'none';
        }
        if (!isKD2()) {
            const kd2ImportPanel = document.getElementById('kd2ImportPanel');
            if (kd2ImportPanel) kd2ImportPanel.style.display = 'none';
        }
        setText('ganttTitle', isKD2() ? 'KD2 Planning Gantt' : 'Production Master Schedule');
        setText('ganttSubtitle', isKD2() ? 'Battalion Plan · Daily Gantt View' : 'Assembly Plan · Daily Gantt View');
        setText('btnGanttEditLabel', isKD2() ? 'Edit Gantt' : 'Edit Plan');
        setText('vpxTitle', isKD2() ? 'KD2 VPX Matrix' : 'Vehicle Production Progress');
        setText('vpxSubtitle', isKD2() ? 'Battalion-by-station planned vs actual · hover for details' : 'Station-by-station planned vs actual · hover for details');
    }

    function getCategory(processStation, row) {
        return row?.category || {
            'Welding': 'Welding',
            'Machining': 'Machining',
            'Shot Blasting and Painting': 'Shot Blasting and Painting',
            'Assembly': 'Assembly',
            'Processing': 'Processing',
            'Final Test': 'Final Test',
        }[processStation] || 'Other';
    }

    async function queryAll(query) {
        const rows = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
            const { data, error } = await query.range(from, from + pageSize - 1);
            if (error) throw error;
            if (!data?.length) break;
            rows.push(...data);
            if (data.length < pageSize) break;
            from += pageSize;
        }
        return rows;
    }

    function parseDateLocal(dateStr) {
        return new Date(`${dateStr}T00:00:00`);
    }

    function localDateStr(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '—';
        return parseDateLocal(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function normalizeNoWorkLabel(label) {
        const trimmed = String(label ?? '').trim();
        return trimmed || null;
    }

    function buildDateRange(startDateStr, endDateStr) {
        if (!startDateStr || !endDateStr || endDateStr < startDateStr) return [];
        const dates = [];
        let cursor = startDateStr;
        let guard = 0;
        while (cursor <= endDateStr && guard < 1000) {
            dates.push(cursor);
            cursor = addDays(cursor, 1);
            guard += 1;
        }
        return dates;
    }

    function formatNoWorkRange(startDateStr, endDateStr) {
        if (!startDateStr) return '—';
        if (!endDateStr || startDateStr === endDateStr) return formatDate(startDateStr);
        return `${formatDate(startDateStr)} -> ${formatDate(endDateStr)}`;
    }

    function getNonWorkDayGroups(rows = state.nonWorkDays) {
        const sortedRows = rows
            .filter(row => row?.module_id === NON_WORK_MODULE_ID && row.off_date)
            .slice()
            .sort((a, b) => String(a.off_date).localeCompare(String(b.off_date)));
        const groups = [];
        sortedRows.forEach(row => {
            const label = normalizeNoWorkLabel(row.label);
            const current = groups[groups.length - 1];
            if (!current || current.label !== label || addDays(current.end, 1) !== row.off_date) {
                groups.push({
                    start: row.off_date,
                    end: row.off_date,
                    label,
                    rows: [row],
                });
                return;
            }
            current.end = row.off_date;
            current.rows.push(row);
        });
        return groups;
    }

    function getNonWorkDayGroupByStart(startDateStr) {
        return getNonWorkDayGroups().find(group => group.start === startDateStr) || null;
    }

    function parseNoWorkEditingIds() {
        return String(document.getElementById('kd2NoWorkIds')?.value || '')
            .split(',')
            .map(value => parseInt(value.trim(), 10))
            .filter(Number.isFinite);
    }

    function noWorkDateSetsEqual(left, right) {
        if (left.size !== right.size) return false;
        for (const value of left) {
            if (!right.has(value)) return false;
        }
        return true;
    }

    function makeNoWorkAuditRecordId(dates = []) {
        const filtered = dates.filter(Boolean).sort();
        if (!filtered.length) return 'kd2:no-work';
        return filtered.length === 1
            ? `kd2:no-work:${filtered[0]}`
            : `kd2:no-work:${filtered[0]}..${filtered[filtered.length - 1]}`;
    }

    function weekLabel(dateStr) {
        if (typeof window.weekLabel === 'function') return window.weekLabel(dateStr);
        const date = parseDateLocal(dateStr);
        const target = new Date(date.valueOf());
        const dayNr = (date.getDay() + 6) % 7;
        target.setDate(target.getDate() - dayNr + 3);
        const firstThursday = new Date(target.getFullYear(), 0, 4);
        const diff = target - firstThursday;
        const week = 1 + Math.round(diff / 604800000);
        return `FW${String(week).padStart(2, '0')}`;
    }

    function syncNonWorkDays(rows = []) {
        state.nonWorkDays = rows
            .filter(row => row?.module_id === NON_WORK_MODULE_ID && row.off_date)
            .map(row => ({ ...row, label: normalizeNoWorkLabel(row.label) }))
            .sort((a, b) => String(a.off_date).localeCompare(String(b.off_date)));
        state.nonWorkDaySet = new Set(state.nonWorkDays.map(row => row.off_date));
    }

    function withWorkingRules(rules = {}) {
        return {
            skipFriday: rules.skipFriday !== false,
            includeSaturday: KD2_SATURDAY_WORKING,
            offDates: rules.offDates instanceof Set ? rules.offDates : state.nonWorkDaySet,
        };
    }

    function isNonWorkDate(dateStr, rules = {}) {
        return withWorkingRules(rules).offDates.has(dateStr);
    }

    function isWorkingDay(date, rules) {
        const safeRules = withWorkingRules(rules);
        const day = date.getDay();
        if (safeRules.skipFriday && day === 5) return false;
        if (!safeRules.includeSaturday && day === 6) return false;
        if (safeRules.offDates.has(localDateStr(date))) return false;
        return true;
    }

    function normalizeWorkingDate(dateStr, rules) {
        const date = parseDateLocal(dateStr);
        while (!isWorkingDay(date, rules)) date.setDate(date.getDate() - 1);
        return date;
    }

    function previousWorkingDate(dateStr, rules) {
        const date = parseDateLocal(dateStr);
        date.setDate(date.getDate() - 1);
        while (!isWorkingDay(date, rules)) date.setDate(date.getDate() - 1);
        return localDateStr(date);
    }

    function normalizeWorkingDateForward(dateStr, rules) {
        const date = parseDateLocal(dateStr);
        while (!isWorkingDay(date, rules)) date.setDate(date.getDate() + 1);
        return date;
    }

    function nextWorkingDate(dateStr, rules) {
        const date = parseDateLocal(dateStr);
        date.setDate(date.getDate() + 1);
        while (!isWorkingDay(date, rules)) date.setDate(date.getDate() + 1);
        return localDateStr(date);
    }

    function buildBackwardWindow(endDateStr, durationDays, rules) {
        const end = normalizeWorkingDate(endDateStr, rules);
        const start = new Date(end);
        let remaining = durationDays;
        while (remaining > 1) {
            start.setDate(start.getDate() - 1);
            while (!isWorkingDay(start, rules)) start.setDate(start.getDate() - 1);
            remaining -= 1;
        }
        return { start: localDateStr(start), end: localDateStr(end) };
    }

    function countWorkingDaysInclusive(startDateStr, endDateStr, rules) {
        if (!startDateStr || !endDateStr || startDateStr > endDateStr) return 0;
        let current = startDateStr;
        let count = 0;
        let guard = 0;
        while (current <= endDateStr && guard < 1000) {
            if (isWorkingDay(parseDateLocal(current), rules)) count += 1;
            current = addDays(current, 1);
            guard += 1;
        }
        return count;
    }

    function durationFromPlannedWindow(startDateStr, endDateStr, rules) {
        if (!startDateStr || !endDateStr || startDateStr > endDateStr) return 0;
        const workingDuration = Math.max(countWorkingDaysInclusive(startDateStr, endDateStr, rules), 1);
        const normalizedWindow = buildForwardWindow(startDateStr, workingDuration, rules);
        if (normalizedWindow.start === startDateStr && normalizedWindow.end === endDateStr) {
            return workingDuration;
        }
        return Math.max(dayDiff(startDateStr, endDateStr) + 1, 1);
    }

    function shiftPlanWindowByCalendarDays(startDateStr, endDateStr, deltaDays, rules) {
        const duration = Math.max(durationFromPlannedWindow(startDateStr, endDateStr, rules), 1);
        const shiftedStart = addDays(startDateStr, deltaDays);
        return buildForwardWindow(shiftedStart, duration, rules);
    }

    function buildForwardWindow(startDateStr, durationDays, rules) {
        const start = normalizeWorkingDateForward(startDateStr, rules);
        const end = new Date(start);
        let remaining = durationDays;
        while (remaining > 1) {
            end.setDate(end.getDate() + 1);
            while (!isWorkingDay(end, rules)) end.setDate(end.getDate() + 1);
            remaining -= 1;
        }
        return { start: localDateStr(start), end: localDateStr(end) };
    }

    function minDateStr(values) {
        return values.reduce((min, value) => !min || value < min ? value : min, '');
    }

    function maxDateStr(values) {
        return values.reduce((max, value) => !max || value > max ? value : max, '');
    }

    function chunk(items, size) {
        const result = [];
        for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
        return result;
    }

    function addDays(dateStr, days) {
        const date = parseDateLocal(dateStr);
        date.setDate(date.getDate() + days);
        return localDateStr(date);
    }

    function dayDiff(startDateStr, endDateStr) {
        const start = parseDateLocal(startDateStr);
        const end = parseDateLocal(endDateStr);
        return Math.round((end - start) / 86400000);
    }

    function vehicleSortValue(vehicle) {
        const idx = VEHICLES.indexOf(vehicle);
        return idx === -1 ? 999 : idx;
    }

    async function writeAudit(action, tableName, recordId, before, after) {
        try {
            if (window.__ppmsShared?.auditLog) {
                await window.__ppmsShared.auditLog(action, tableName, recordId, before, after);
                return;
            }
            const user = getCurrentUser();
            if (!user || !dbRef) return;
            await dbRef.from('planning_audit_log').insert({
                user_id: user.id,
                user_email: user.email,
                user_role: user.role,
                action,
                table_name: tableName,
                record_id: String(recordId ?? ''),
                data_before: before ? JSON.parse(JSON.stringify(before)) : null,
                data_after: after ? JSON.parse(JSON.stringify(after)) : null,
                ip_address: window.__ppmsShared?.getCachedIP?.() || user.ip || 'unknown',
            });
        } catch (error) {
            console.warn('KD2 audit write skipped:', error.message);
        }
    }

    function getBattalionFilterValue() {
        return document.getElementById('filterBattalion')?.value?.trim() || '';
    }

    function updateGenerationTarget() {
        const battalion = getBattalionFilterValue();
        setText('kd2GenerationTarget', battalion ? `Generate plan for ${battalion}` : 'Select a battalion filter to generate a plan.');
    }

    async function loadFilters(db) {
        const [rows, categoryRows, battalions] = await Promise.all([
            queryAll(db.from('kd2_plan_live').select('vehicle, vehicle_no, week, category')),
            queryAll(db.from('kd2_process_categories').select('category_code, category_name, category_sequence').eq('is_active', true).order('category_sequence')),
            queryAll(db.from('kd2_battalions').select('battalion_code').order('battalion_code')),
        ]);
        const activeCategoryNames = new Set(categoryRows
            .filter(row => KD2_CATEGORY_CODES.has(row.category_code))
            .map(row => row.category_name)
            .filter(Boolean));
        const categories = MODULES.kd2.categories.filter(category => activeCategoryNames.has(category));
        return {
            battalions: battalions.map(row => row.battalion_code).filter(Boolean),
            vehicles: [...new Set(rows.map(row => row.vehicle).filter(Boolean))].sort(),
            units: [...new Set(rows.map(row => row.vehicle_no).filter(Boolean))].sort(),
            weeks: [...new Set(rows.map(row => row.week).filter(Boolean))].sort((a, b) => {
                const aNum = parseInt(String(a).replace(/\D/g, ''), 10) || 0;
                const bNum = parseInt(String(b).replace(/\D/g, ''), 10) || 0;
                return aNum - bNum;
            }),
            categories: categories.length ? categories : MODULES.kd2.categories,
        };
    }

    function applyTimeFrame(query, filters) {
        if (filters.timeFrame === 'day') return query.eq('start_date', filters.today);
        if (filters.timeFrame === 'week') return query.gte('start_date', filters.weekStart).lte('start_date', filters.weekEnd);
        if (filters.timeFrame === 'month') return query.gte('start_date', filters.monthStart).lte('start_date', filters.monthEnd);
        if (filters.timeFrame === 'custom') {
            if (filters.startDate) query = query.gte('start_date', filters.startDate);
            if (filters.endDate) query = query.lte('end_date', filters.endDate);
        }
        return query;
    }

    async function loadData(db, filters) {
        let query = db.from('kd2_plan_live').select('*');
        if (filters.battalion) query = query.eq('battalion_code', filters.battalion);
        if (filters.vehicle) query = query.eq('vehicle', filters.vehicle);
        if (filters.unit) query = query.eq('vehicle_no', filters.unit);
        if (filters.week) query = query.lte('start_date', filters.weekEndForFilter).gte('end_date', filters.weekStartForFilter);
        query = applyTimeFrame(query, filters);
        const rows = await queryAll(query);
        const detailMap = new Map();
        if (rows.length) {
            const ids = rows.map(row => row.id).filter(Boolean);
            for (const batch of chunk(ids, 500)) {
                const detailRows = await queryAll(
                    db.from('kd2_plan')
                        .select('id, battalion_id, vehicle_type, unit_serial, unit_label, category_code, station_code, planned_start_date, planned_end_date, planning_source')
                        .in('id', batch)
                );
                detailRows.forEach(row => detailMap.set(row.id, row));
            }
        }
        return rows.map(row => ({
            ...row,
            battalion_id: detailMap.get(row.id)?.battalion_id ?? null,
            unit_serial: detailMap.get(row.id)?.unit_serial ?? null,
            vehicle_type: detailMap.get(row.id)?.vehicle_type ?? row.vehicle,
            unit_label: detailMap.get(row.id)?.unit_label ?? row.vehicle_no,
            planning_source: detailMap.get(row.id)?.planning_source ?? null,
            progress: {
                id: row.progress_id || null,
                completed: !!row.completed,
                completion_date: row.completion_date || null,
                actual_start_date: row.actual_start_date || null,
                notes: row.notes || null,
                updated_at: row.progress_updated_at || null,
            },
        }));
    }

    async function loadPlanningSnapshot(db) {
        if (!isKD2()) return;
        const statusEl = document.getElementById('kd2PhaseStatus');
        const battalionCountEl = document.getElementById('kd2BattalionCount');
        const battalionNoteEl = document.getElementById('kd2BattalionNote');
        const routeCountEl = document.getElementById('kd2RouteCount');
        const routeNoteEl = document.getElementById('kd2RouteNote');
        const leadStatusEl = document.getElementById('kd2LeadTimeStatus');
        const leadNoteEl = document.getElementById('kd2LeadTimeNote');
        try {
            const [battalions, categories, stations, leadTimes] = await Promise.all([
                queryAll(db.from('kd2_battalions').select('battalion_code, delivery_deadline')),
                queryAll(db.from('kd2_process_categories').select('category_code, category_name, category_sequence').eq('is_active', true).order('category_sequence')),
                queryAll(db.from('kd2_process_stations').select('vehicle_type, station_code, station_name').eq('is_active', true)),
                queryAll(db.from('kd2_process_lead_times').select('lead_time_days')),
            ]);
            const distinctCategories = [...new Set(categories.map(row => row.category_name))];
            const validStations = stations.filter(row => stationAllowedForVehicle(row));
            const confirmedLeadTimes = leadTimes.filter(row => row.lead_time_days !== null).length;
            const deadlinesSet = battalions.filter(row => row.delivery_deadline).length;
            if (statusEl) statusEl.textContent = battalions.length || categories.length ? 'KD2 schema detected' : 'Waiting for KD2 tables';
            if (battalionCountEl) battalionCountEl.textContent = `${battalions.length} configured`;
            if (battalionNoteEl) battalionNoteEl.textContent = deadlinesSet ? `${deadlinesSet} battalion deadlines are already loaded.` : 'No battalion deadlines loaded yet.';
            if (routeCountEl) routeCountEl.textContent = `${distinctCategories.length} categories / ${validStations.length} stations`;
            if (routeNoteEl) routeNoteEl.textContent = distinctCategories.length ? distinctCategories.join(' -> ') : 'Route masters are still empty.';
            if (leadStatusEl) leadStatusEl.textContent = `${confirmedLeadTimes}/${leadTimes.length || 0} confirmed`;
            if (leadNoteEl) leadNoteEl.textContent = confirmedLeadTimes === leadTimes.length && leadTimes.length > 0 ? 'Every seeded route step has a lead time.' : 'Unknown lead times remain intentionally blank until confirmed.';
        } catch (error) {
            if (statusEl) statusEl.textContent = 'Upload KD2 schema first';
            if (battalionCountEl) battalionCountEl.textContent = '0 configured';
            if (battalionNoteEl) battalionNoteEl.textContent = 'Run the SQL schema in Supabase, then refresh this page.';
            if (routeCountEl) routeCountEl.textContent = '0 steps';
            if (routeNoteEl) routeNoteEl.textContent = 'The KD2 route master is not available yet.';
            if (leadStatusEl) leadStatusEl.textContent = '0 confirmed';
            if (leadNoteEl) leadNoteEl.textContent = 'Lead times will remain blank until business confirmation.';
            console.warn('KD2 snapshot load skipped:', error.message);
        }
    }

    function escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async function loadWorkspaceData() {
        if (!dbRef || !isKD2()) return;
        const [battalions, planningInputs, categories, stations, routes, leadTimes, vehicleUnits] = await Promise.all([
            queryAll(dbRef.from('kd2_battalions').select('*').order('battalion_code')),
            queryAll(dbRef.from('kd2_planning_inputs').select('*').order('battalion_id')),
            queryAll(dbRef.from('kd2_process_categories').select('*').eq('is_active', true).order('vehicle_type').order('category_sequence')),
            queryAll(dbRef.from('kd2_process_stations').select('*').eq('is_active', true).order('vehicle_type').order('route_sequence')),
            queryAll(dbRef.from('kd2_process_routes').select('*').eq('is_active', true).order('vehicle_type').order('route_sequence')),
            queryAll(dbRef.from('kd2_process_lead_times').select('*').order('vehicle_type').order('planning_level')),
            queryAll(dbRef.from('kd2_vehicle_units').select('*').order('battalion_id').order('vehicle_type').order('unit_serial')),
        ]);
        let nonWorkDays = [];
        try {
            nonWorkDays = await queryAll(
                dbRef.from('planning_non_work_days')
                    .select('*')
                    .eq('module_id', NON_WORK_MODULE_ID)
                    .order('off_date')
            );
        } catch (error) {
            console.warn('KD2 non-work days load skipped:', error.message);
        }
        state.battalions = battalions;
        state.planningInputs = planningInputs;
        state.categories = categories.filter(row => KD2_CATEGORY_CODES.has(row.category_code));
        state.stations = stations.filter(row =>
            KD2_CATEGORY_CODES.has(row.category_code) &&
            stationAllowedForVehicle(row)
        );
        const validStationKeys = new Set(state.stations.map(row => `${row.vehicle_type}||${row.station_code}`));
        state.routes = routes.filter(row =>
            KD2_CATEGORY_CODES.has(row.category_code) &&
            validStationKeys.has(`${row.vehicle_type}||${row.station_code}`)
        );
        state.leadTimes = leadTimes;
        state.vehicleUnits = vehicleUnits;
        syncNonWorkDays(nonWorkDays);
    }

    function inputFor(battalionId, vehicleType) {
        return state.planningInputs.find(row => row.battalion_id === battalionId && row.vehicle_type === vehicleType) || null;
    }

    function renderPlanningInputs() {
        const tbody = document.getElementById('kd2InputsBody');
        if (!tbody) return;
        if (!state.battalions.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="table-empty">Create a battalion to start KD2 planning inputs.</td></tr>';
            return;
        }

        const rows = [];
        state.battalions.forEach(battalion => {
            VEHICLES.forEach(vehicle => {
                const input = inputFor(battalion.id, vehicle);
                const qty = input?.required_quantity ?? '';
                const deadline = input?.delivery_deadline || battalion.delivery_deadline || '';
                const status = input?.assumptions_status || 'pending';
                rows.push(`
                    <tr>
                        <td><strong>${escapeHtml(battalion.battalion_code)}</strong>${battalion.battalion_name ? `<span class="kd2-inline-meta">${escapeHtml(battalion.battalion_name)}</span>` : ''}</td>
                        <td>${vehicle}</td>
                        <td class="mono">${qty === '' ? '—' : qty}</td>
                        <td class="mono">${deadline ? formatDate(deadline) : '—'}</td>
                        <td>${input ? (input.skip_friday ? 'Skip' : 'Work') : 'Skip'}</td>
                        <td>Work</td>
                        <td><span class="badge badge-${status === 'confirmed' ? 'completed' : 'planned'}">${status === 'confirmed' ? 'Confirmed' : 'Pending'}</span></td>
                        <td><button class="kd2-action-link" data-kd2-edit-battalion="${battalion.id}">Edit</button></td>
                    </tr>
                `);
            });
        });

        tbody.innerHTML = rows.join('');
        tbody.querySelectorAll('[data-kd2-edit-battalion]').forEach(btn => {
            btn.addEventListener('click', () => openPlanningModal(parseInt(btn.dataset.kd2EditBattalion, 10)));
        });
    }

    function leadTimeText(vehicleType, categoryCode, stationCode) {
        const stationLead = state.leadTimes.find(row =>
            row.vehicle_type === vehicleType &&
            row.planning_level === 'station' &&
            row.station_code === stationCode &&
            row.lead_time_days !== null
        );
        if (stationLead) return `${Math.ceil(Number(stationLead.lead_time_days))}d`;

        const categoryLead = state.leadTimes.find(row =>
            row.vehicle_type === vehicleType &&
            row.planning_level === 'category' &&
            row.category_code === categoryCode &&
            row.lead_time_days !== null
        );
        return categoryLead ? `${Math.ceil(Number(categoryLead.lead_time_days))}d category` : 'Pending';
    }

    function leadTimeRecord(vehicleType, planningLevel, categoryCode, stationCode = null) {
        return state.leadTimes.find(row =>
            row.vehicle_type === vehicleType &&
            row.planning_level === planningLevel &&
            row.category_code === categoryCode &&
            (planningLevel === 'category' ? !row.station_code : row.station_code === stationCode)
        ) || null;
    }

    function setLeadTimeError(message) {
        const el = document.getElementById('kd2LeadTimeError');
        if (!el) return;
        el.textContent = message;
        el.style.display = message ? 'flex' : 'none';
    }

    function closeLeadTimeModal() {
        const overlay = document.getElementById('kd2LeadTimeOverlay');
        if (overlay) overlay.style.display = 'none';
        setLeadTimeError('');
    }

    function renderLeadTimeEditor() {
        const container = document.getElementById('kd2LeadTimeBody');
        const summary = document.getElementById('kd2LeadTimeSummary');
        if (!container || !summary) return;

        const vehicle = state.routeVehicle;
        const categories = state.categories
            .filter(row => row.vehicle_type === vehicle)
            .sort((a, b) => a.category_sequence - b.category_sequence);
        const stations = state.stations
            .filter(row => row.vehicle_type === vehicle)
            .sort((a, b) => a.route_sequence - b.route_sequence);

        if (!categories.length) {
            summary.textContent = `${vehicle} route master is not loaded yet.`;
            container.innerHTML = '<div class="empty-state"><p>No KD2 route categories were found for this vehicle.</p></div>';
            return;
        }

        const totalRows = categories.length + stations.length;
        const confirmedRows = categories.filter(category => {
            const record = leadTimeRecord(vehicle, 'category', category.category_code);
            return record?.lead_time_days !== null;
        }).length + stations.filter(station => {
            const record = leadTimeRecord(vehicle, 'station', station.category_code, station.station_code);
            return record?.lead_time_days !== null;
        }).length;

        summary.textContent = `${vehicle} lead times: ${confirmedRows}/${totalRows} confirmed. Leave unknown values blank so they remain pending.`;
        container.innerHTML = categories.map(category => {
            const categoryLead = leadTimeRecord(vehicle, 'category', category.category_code);
            const categoryStations = stations.filter(station => station.category_code === category.category_code);
            return `
                <section class="kd2-leadtime-category" data-kd2-lead-category data-lead-id="${categoryLead?.id || ''}" data-category-code="${escapeHtml(category.category_code)}">
                    <div class="kd2-leadtime-head">
                        <div>
                            <strong>${escapeHtml(category.category_name)}</strong>
                            <span class="kd2-leadtime-code">${escapeHtml(category.category_code)} · Category ${category.category_sequence}</span>
                        </div>
                        <span class="kd2-route-badge">${leadTimeText(vehicle, category.category_code, null)}</span>
                    </div>
                    <div class="kd2-modal-grid kd2-leadtime-form">
                        <div class="form-group">
                            <label class="form-label">Category Lead Time (Days)</label>
                            <input type="number" min="0.25" step="0.25" class="filter-control" data-field="leadTime" value="${categoryLead?.lead_time_days ?? ''}" placeholder="Blank = pending" />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Source <span class="form-label-optional">(optional)</span></label>
                            <input type="text" class="filter-control" data-field="source" value="${escapeHtml(categoryLead?.lead_time_source || '')}" placeholder="Optional source" />
                        </div>
                        <div class="form-group" style="grid-column:1/-1">
                            <label class="form-label">Notes <span class="form-label-optional">(optional)</span></label>
                            <input type="text" class="filter-control" data-field="notes" value="${escapeHtml(categoryLead?.notes || '')}" placeholder="Keep business values pending until confirmed" />
                        </div>
                    </div>
                    <div class="kd2-leadtime-table-wrap">
                        <table class="table kd2-leadtime-table">
                            <thead>
                                <tr>
                                    <th>Station</th>
                                    <th>Route</th>
                                    <th>Lead Time (Days)</th>
                                    <th>Source</th>
                                    <th>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${categoryStations.map(station => {
                                    const stationLead = leadTimeRecord(vehicle, 'station', station.category_code, station.station_code);
                                    return `
                                        <tr data-kd2-lead-station data-lead-id="${stationLead?.id || ''}" data-category-code="${escapeHtml(station.category_code)}" data-station-code="${escapeHtml(station.station_code)}">
                                            <td>
                                                <strong>${escapeHtml(station.station_name)}</strong>
                                                <span class="kd2-inline-meta">${escapeHtml(station.work_center || station.station_code)}</span>
                                            </td>
                                            <td>
                                                <input type="number" min="1" step="1" class="filter-control kd2-route-sequence-input" data-field="routeSequence" value="${station.route_sequence}" title="Stations with the same route run in parallel" />
                                            </td>
                                            <td><input type="number" min="0.25" step="0.25" class="filter-control" data-field="leadTime" value="${stationLead?.lead_time_days ?? ''}" placeholder="Blank = pending" /></td>
                                            <td><input type="text" class="filter-control" data-field="source" value="${escapeHtml(stationLead?.lead_time_source || '')}" placeholder="Optional source" /></td>
                                            <td><input type="text" class="filter-control" data-field="notes" value="${escapeHtml(stationLead?.notes || '')}" placeholder="Optional note" /></td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </section>
            `;
        }).join('');
    }

    async function openLeadTimeModal() {
        if (!canManageKD2()) {
            toast('Only planners and admins can edit KD2 lead times.', 'error');
            return;
        }
        try {
            if (!state.categories.length || !state.stations.length) await loadWorkspaceData();
        } catch (error) {
            toast(`KD2 route setup load failed: ${error.message}`, 'error');
            return;
        }
        renderLeadTimeEditor();
        setLeadTimeError('');
        document.getElementById('kd2LeadTimeOverlay').style.display = 'flex';
    }

    function parseLeadTimeValue(rawValue) {
        const trimmed = String(rawValue ?? '').trim();
        if (!trimmed) return null;
        const value = Number(trimmed);
        if (!Number.isFinite(value) || value <= 0) return NaN;
        return value;
    }

    function parseRouteSequenceValue(rawValue) {
        const value = parseInt(String(rawValue ?? '').trim(), 10);
        return Number.isFinite(value) && value > 0 ? value : NaN;
    }

    async function saveLeadTimes() {
        if (!dbRef) return;
        if (!canManageKD2()) {
            toast('Only planners and admins can edit KD2 lead times.', 'error');
            return;
        }

        const vehicle = state.routeVehicle;
        const categoryNodes = [...document.querySelectorAll('[data-kd2-lead-category]')];
        const stationNodes = [...document.querySelectorAll('[data-kd2-lead-station]')];
        const before = state.leadTimes.filter(row => row.vehicle_type === vehicle);
        const routeBefore = state.stations
            .filter(row => row.vehicle_type === vehicle)
            .map(row => ({ station_code: row.station_code, route_sequence: row.route_sequence }));
        const updates = [];
        const inserts = [];
        const routeUpdates = [];

        for (const node of [...categoryNodes, ...stationNodes]) {
            const leadTime = parseLeadTimeValue(node.querySelector('[data-field="leadTime"]')?.value);
            if (Number.isNaN(leadTime)) {
                setLeadTimeError('Lead time must be blank or greater than 0.');
                return;
            }
            if (node.hasAttribute('data-kd2-lead-station')) {
                const routeSequence = parseRouteSequenceValue(node.querySelector('[data-field="routeSequence"]')?.value);
                if (Number.isNaN(routeSequence)) {
                    setLeadTimeError('Route must be a whole number greater than 0. Use the same route number for parallel stations.');
                    return;
                }
                routeUpdates.push({
                    station_code: node.dataset.stationCode,
                    category_code: node.dataset.categoryCode,
                    route_sequence: routeSequence,
                });
            }
            const payload = {
                vehicle_type: vehicle,
                category_code: node.dataset.categoryCode,
                station_code: node.hasAttribute('data-kd2-lead-station') ? node.dataset.stationCode : null,
                planning_level: node.hasAttribute('data-kd2-lead-station') ? 'station' : 'category',
                lead_time_days: leadTime,
                lead_time_source: node.querySelector('[data-field="source"]')?.value?.trim() || null,
                notes: node.querySelector('[data-field="notes"]')?.value?.trim() || null,
            };
            const leadId = parseInt(node.dataset.leadId, 10);
            if (leadId) updates.push({ id: leadId, ...payload });
            else inserts.push(payload);
        }

        try {
            if (updates.length) {
                const { error } = await dbRef.from('kd2_process_lead_times').upsert(updates, { onConflict: 'id' });
                if (error) throw error;
            }
            if (inserts.length) {
                const { error } = await dbRef.from('kd2_process_lead_times').insert(inserts);
                if (error) throw error;
            }

            for (const route of routeUpdates) {
                const { error: stationError } = await dbRef
                    .from('kd2_process_stations')
                    .update({ route_sequence: route.route_sequence })
                    .eq('vehicle_type', vehicle)
                    .eq('station_code', route.station_code);
                if (stationError) throw stationError;

                const { error: routeError } = await dbRef
                    .from('kd2_process_routes')
                    .upsert({
                        vehicle_type: vehicle,
                        category_code: route.category_code,
                        station_code: route.station_code,
                        route_sequence: route.route_sequence,
                        is_active: true,
                    }, { onConflict: 'vehicle_type,station_code' });
                if (routeError) throw routeError;
            }

            await writeAudit('UPSERT', 'kd2_process_lead_times', vehicle, before, [...updates, ...inserts]);
            await writeAudit('UPDATE', 'kd2_process_routes', vehicle, routeBefore, routeUpdates);
            closeLeadTimeModal();
            toast(`KD2 route and lead-time setup saved for ${vehicle}.`, 'success');
            await refreshWorkspace();
            await helpers.reloadAll?.();
        } catch (error) {
            setLeadTimeError(error.message);
        }
    }

    function renderRouteFlow() {
        const container = document.getElementById('kd2RouteFlow');
        if (!container) return;

        const vehicle = state.routeVehicle;
        const categories = state.categories.filter(row => row.vehicle_type === vehicle);
        const stations = state.stations.filter(row => row.vehicle_type === vehicle);
        if (!categories.length) {
            container.innerHTML = '<div class="empty-state"><p>No KD2 route master loaded yet.</p></div>';
            return;
        }

        container.innerHTML = categories.map(category => {
            const categoryStations = stations
                .filter(station => station.category_code === category.category_code)
                .sort((a, b) => a.station_sequence_in_category - b.station_sequence_in_category);

            return `
                <div class="kd2-route-category">
                    <div class="kd2-route-category-head">
                        <div>
                            <div class="kd2-route-category-title">${escapeHtml(category.category_name)}</div>
                            <span class="kd2-inline-meta">Category sequence ${category.category_sequence}</span>
                        </div>
                        <span class="kd2-route-badge">${leadTimeText(vehicle, category.category_code, null)}</span>
                    </div>
                    <div class="kd2-route-stations">
                        ${categoryStations.map(station => `
                            <div class="kd2-route-station">
                                <span class="kd2-route-station-name">${escapeHtml(station.station_name)}</span>
                                <span class="kd2-route-station-meta">${escapeHtml(station.work_center || station.station_code)} · Route ${station.route_sequence} · ${leadTimeText(vehicle, category.category_code, station.station_code)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    function categoryClassName(category) {
        return `kd2-bar-${String(category || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')}`;
    }

    function setPlanEditError(message) {
        const el = document.getElementById('kd2PlanEditError');
        if (!el) return;
        el.textContent = message;
        el.style.display = message ? 'flex' : 'none';
    }

    function closePlanEdit() {
        const overlay = document.getElementById('kd2PlanEditOverlay');
        if (overlay) overlay.style.display = 'none';
        setPlanEditError('');
    }

    function closeOpenBarMenus() {
        document.querySelectorAll('.gc-bar-menu-open').forEach(bar => bar.classList.remove('gc-bar-menu-open'));
        document.querySelectorAll('.gc-row-menu-open').forEach(row => row.classList.remove('gc-row-menu-open'));
        document.querySelectorAll('.gc-bar-menu-trigger').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
    }

    function timelineLaneKey(row) {
        return [row.battalion_id ?? row.battalion_code ?? '', row.vehicle ?? row.vehicle_type ?? '', row.unit_serial ?? row.vehicle_no ?? ''].join('||');
    }

    function escapeSelectorValue(value) {
        if (window.CSS?.escape) return window.CSS.escape(value);
        return String(value).replace(/["\\]/g, '\\$&');
    }

    function getVehicleFilterValue() {
        return document.getElementById('filterVehicle')?.value?.trim() || '';
    }

    function getUnitFilterValue() {
        return document.getElementById('filterUnit')?.value?.trim() || '';
    }

    function formatUnitLabel(vehicle, unitSerial, preferredLabel = '') {
        return preferredLabel || `${vehicle}-${String(unitSerial).padStart(2, '0')}`;
    }

    function laneDescriptorFromRow(row) {
        const vehicle = row.vehicle || row.vehicle_type || '';
        const unitSerial = parseInt(row.unit_serial, 10) || null;
        return {
            key: timelineLaneKey(row),
            battalion_id: row.battalion_id ?? null,
            battalion_code: row.battalion_code || '',
            vehicle_type: vehicle,
            unit_serial: unitSerial,
            unit_label: formatUnitLabel(vehicle, unitSerial || 0, row.unit_label || row.vehicle_no || ''),
            vehicle_no: row.vehicle_no || row.unit_label || formatUnitLabel(vehicle, unitSerial || 0, ''),
        };
    }

    function laneMatchesUnitFilter(lane, unitFilter) {
        if (!unitFilter) return true;
        const tokens = new Set([
            String(lane.unit_label || '').trim(),
            String(lane.vehicle_no || '').trim(),
            lane.unit_serial ? String(lane.unit_serial) : '',
            lane.unit_serial ? formatUnitLabel(lane.vehicle_type, lane.unit_serial, '') : '',
        ].filter(Boolean));
        return tokens.has(unitFilter);
    }

    function buildTimelineLaneDefinitions(rows = state.timelineRows) {
        const laneMap = new Map();
        const addLane = lane => {
            if (!lane?.key) return;
            if (!laneMap.has(lane.key)) laneMap.set(lane.key, { ...lane });
            else laneMap.set(lane.key, { ...laneMap.get(lane.key), ...lane });
        };

        rows.forEach(row => addLane(laneDescriptorFromRow(row)));

        const battalionFilter = getBattalionFilterValue();
        const vehicleFilter = getVehicleFilterValue();
        const unitFilter = getUnitFilterValue();
        const vehicles = vehicleFilter && VEHICLES.includes(vehicleFilter) ? [vehicleFilter] : VEHICLES;

        state.battalions.forEach(battalion => {
            if (battalionFilter && battalion.battalion_code !== battalionFilter) return;
            vehicles.forEach(vehicle => {
                const input = inputFor(battalion.id, vehicle);
                const configuredUnitRows = state.vehicleUnits.filter(row => row.battalion_id === battalion.id && row.vehicle_type === vehicle);
                const laneRows = rows.filter(row => row.battalion_id === battalion.id && (row.vehicle_type || row.vehicle) === vehicle);
                const rowSerials = laneRows.map(row => parseInt(row.unit_serial, 10)).filter(Number.isFinite);
                const configuredSerials = configuredUnitRows.map(row => parseInt(row.unit_serial, 10)).filter(Number.isFinite);
                const quantity = Math.max(parseInt(input?.required_quantity, 10) || 0, ...configuredSerials, ...rowSerials, 0);
                if (quantity < 1 && !laneRows.length && !configuredUnitRows.length) return;

                const units = new Map();
                for (let serial = 1; serial <= quantity; serial += 1) {
                    const configured = configuredUnitRows.find(row => parseInt(row.unit_serial, 10) === serial);
                    units.set(serial, {
                        unit_serial: serial,
                        unit_label: formatUnitLabel(vehicle, serial, configured?.unit_label || ''),
                    });
                }
                configuredUnitRows.forEach(row => {
                    const serial = parseInt(row.unit_serial, 10);
                    if (!Number.isFinite(serial) || serial < 1) return;
                    units.set(serial, {
                        unit_serial: serial,
                        unit_label: formatUnitLabel(vehicle, serial, row.unit_label || ''),
                    });
                });
                laneRows.forEach(row => {
                    const serial = parseInt(row.unit_serial, 10);
                    if (!Number.isFinite(serial) || serial < 1) return;
                    units.set(serial, {
                        unit_serial: serial,
                        unit_label: formatUnitLabel(vehicle, serial, row.unit_label || row.vehicle_no || ''),
                    });
                });

                [...units.values()]
                    .filter(unit => laneMatchesUnitFilter({
                        unit_label: unit.unit_label,
                        vehicle_no: unit.unit_label,
                        unit_serial: unit.unit_serial,
                        vehicle_type: vehicle,
                    }, unitFilter))
                    .sort((a, b) => a.unit_serial - b.unit_serial)
                    .forEach(unit => {
                        addLane({
                            key: [battalion.id, vehicle, unit.unit_serial].join('||'),
                            battalion_id: battalion.id,
                            battalion_code: battalion.battalion_code,
                            vehicle_type: vehicle,
                            unit_serial: unit.unit_serial,
                            unit_label: unit.unit_label,
                            vehicle_no: unit.unit_label,
                        });
                    });
            });
        });

        return [...laneMap.values()].sort((a, b) =>
            String(a.battalion_code || '').localeCompare(String(b.battalion_code || '')) ||
            vehicleSortValue(a.vehicle_type) - vehicleSortValue(b.vehicle_type) ||
            (a.unit_serial || 0) - (b.unit_serial || 0) ||
            String(a.unit_label || '').localeCompare(String(b.unit_label || ''))
        );
    }

    function firstPlacementStation(vehicle) {
        return state.stations
            .filter(row => row.vehicle_type === vehicle)
            .sort((a, b) =>
                (a.category_sequence || 9999) - (b.category_sequence || 9999) ||
                (a.route_sequence || 9999) - (b.route_sequence || 9999) ||
                (a.station_sequence_in_category || 9999) - (b.station_sequence_in_category || 9999)
            )[0] || null;
    }

    function currentPlacementStation() {
        return state.stations.find(row =>
            row.vehicle_type === state.timelinePlacementVehicle &&
            row.station_code === state.timelinePlacementStationCode
        ) || null;
    }

    function setTimelinePlacementVehicle(vehicle) {
        const safeVehicle = VEHICLES.includes(vehicle) ? vehicle : 'K9';
        state.timelinePlacementVehicle = safeVehicle;
        const hasSelectedStation = state.stations.some(row =>
            row.vehicle_type === safeVehicle &&
            row.station_code === state.timelinePlacementStationCode
        );
        if (!hasSelectedStation) {
            state.timelinePlacementStationCode = firstPlacementStation(safeVehicle)?.station_code || '';
        }
        syncTimelinePlacementUi();
    }

    function setTimelinePlacementStation(stationCode, vehicle = state.timelinePlacementVehicle) {
        if (vehicle && vehicle !== state.timelinePlacementVehicle) {
            state.timelinePlacementVehicle = vehicle;
        }
        const station = state.stations.find(row => row.vehicle_type === state.timelinePlacementVehicle && row.station_code === stationCode) || null;
        if (!station) {
            state.timelinePlacementStationCode = firstPlacementStation(state.timelinePlacementVehicle)?.station_code || '';
        } else {
            state.timelinePlacementStationCode = station.station_code;
        }
        syncTimelinePlacementUi();
    }

    function setTimelinePlacementMenuOpen(on) {
        state.timelinePlacementMenuOpen = !!on;
        const timelineMenu = document.getElementById('kd2TimelineVisualMenu');
        if (timelineMenu) timelineMenu.style.display = state.timelinePlacementMenuOpen ? '' : 'none';
        const ganttPlacementBar = document.getElementById('ganttVisualPlacementBar');
        if (ganttPlacementBar) ganttPlacementBar.style.display = state.timelinePlacementMenuOpen ? '' : 'none';
        ['btnKd2VisualAdd', 'btnGanttVisualAdd'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.setAttribute('aria-expanded', state.timelinePlacementMenuOpen ? 'true' : 'false');
        });
    }

    function renderPlacementPalette(containerId, { activateOnSelect = false, closeMenuOnSelect = false } = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const vehicle = state.timelinePlacementVehicle;
        const groups = state.categories
            .filter(row => row.vehicle_type === vehicle)
            .sort((a, b) => (a.category_sequence || 9999) - (b.category_sequence || 9999))
            .map(category => ({
                category,
                stations: state.stations
                    .filter(row => row.vehicle_type === vehicle && row.category_code === category.category_code)
                    .sort((a, b) => (a.route_sequence || 9999) - (b.route_sequence || 9999) || (a.station_sequence_in_category || 9999) - (b.station_sequence_in_category || 9999)),
            }))
            .filter(group => group.stations.length);

        if (!groups.length) {
            container.innerHTML = '<div class="empty-state"><p>No KD2 stations are available for this vehicle.</p></div>';
            return;
        }

        container.innerHTML = groups.map(group => `
            <div class="kd2-timeline-palette-group">
                <div class="kd2-timeline-palette-group-title">${escapeHtml(group.category.category_name)}</div>
                <div class="kd2-timeline-palette-items">
                    ${group.stations.map(station => `
                        <button
                            type="button"
                            class="kd2-timeline-palette-item${state.timelinePlacementStationCode === station.station_code ? ' kd2-timeline-palette-item-active' : ''}"
                            data-kd2-placement-station="${escapeHtml(station.station_code)}"
                            data-kd2-placement-vehicle="${escapeHtml(vehicle)}">
                            <strong>${escapeHtml(station.station_name)}</strong>
                            <span>${escapeHtml(station.work_center || station.station_code)} · Route ${escapeHtml(station.route_sequence)}</span>
                            <span>${escapeHtml(leadTimeText(vehicle, station.category_code, station.station_code))}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        `).join('');

        container.querySelectorAll('[data-kd2-placement-station]').forEach(btn => {
            btn.addEventListener('click', () => {
                setTimelinePlacementStation(btn.dataset.kd2PlacementStation, btn.dataset.kd2PlacementVehicle);
                if (activateOnSelect) beginTimelinePlacement({ keepMenuState: !closeMenuOnSelect });
                if (closeMenuOnSelect) setTimelinePlacementMenuOpen(false);
            });
        });
    }

    function syncTimelinePlacementUi() {
        const bar = document.getElementById('kd2TimelinePlacementBar');
        const summary = document.getElementById('kd2TimelinePlacementSummary');
        const hint = document.getElementById('kd2TimelinePlacementHint');
        const ganttSummary = document.getElementById('ganttVisualPlacementSummary');
        const ganttHint = document.getElementById('ganttVisualPlacementHint');
        const timelineVehicle = document.getElementById('kd2TimelinePlacementVehicle');
        const ganttVehicle = document.getElementById('ganttVisualPlacementVehicle');
        if (timelineVehicle && timelineVehicle.value !== state.timelinePlacementVehicle) timelineVehicle.value = state.timelinePlacementVehicle;
        if (ganttVehicle && ganttVehicle.value !== state.timelinePlacementVehicle) ganttVehicle.value = state.timelinePlacementVehicle;

        const station = currentPlacementStation();
        const summaryText = station
            ? `${station.station_name} is active. Click once on a ${station.vehicle_type} lane and date to place it.`
            : 'Select a station block, then place it on a matching lane.';
        const hintText = station
            ? 'Friday and saved no-work days are normalized automatically when the new KD2 block is created.'
            : 'The selected station stays active until you change it or cancel placement mode.';
        if (summary) summary.textContent = summaryText;
        if (hint) hint.textContent = hintText;
        if (ganttSummary) ganttSummary.textContent = summaryText;
        if (ganttHint) ganttHint.textContent = hintText;
        if (bar) bar.style.display = state.timelinePlacementActive ? '' : 'none';
        ['btnKd2VisualAdd', 'btnGanttVisualAdd'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.setAttribute('aria-pressed', state.timelinePlacementActive ? 'true' : 'false');
        });

        renderPlacementPalette('kd2TimelineVisualPalette', { activateOnSelect: true, closeMenuOnSelect: true });
        renderPlacementPalette('ganttVisualPalette', { activateOnSelect: true, closeMenuOnSelect: false });
    }

    function syncTimelineSelectionUi() {
        const count = [...state.timelineSelectedIds].filter(id => state.timelineRows.some(row => row.id === id)).length;
        const countEl = document.getElementById('kd2TimelineSelectionCount');
        if (countEl) countEl.textContent = `${count} selected`;
        document.querySelectorAll('[data-kd2-select-id]').forEach(btn => {
            const selected = state.timelineSelectedIds.has(parseInt(btn.dataset.kd2SelectId, 10));
            btn.classList.toggle('kd2-timeline-select-active', selected);
            btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        document.querySelectorAll('[data-kd2-plan-id]').forEach(bar => {
            const selected = state.timelineSelectedIds.has(parseInt(bar.dataset.kd2PlanId, 10));
            bar.classList.toggle('kd2-timeline-bar-selected', selected);
        });
    }

    function setTimelineMoveMode(mode) {
        state.timelineMoveMode = ['lane', 'from-block'].includes(mode) ? mode : 'block';
        document.querySelectorAll('.kd2-timeline-mode-btn[data-mode="block"], .kd2-timeline-mode-btn[data-mode="from-block"], .kd2-timeline-mode-btn[data-mode="lane"]').forEach(btn => {
            btn.classList.toggle('kd2-timeline-mode-active', btn.dataset.mode === state.timelineMoveMode);
        });
    }

    function setTimelineSelectLaneMode(on, { skipRender = false } = {}) {
        state.timelineSelectLaneMode = !!on;
        const btn = document.getElementById('btnKd2TimelineSelectLane');
        if (btn) {
            btn.classList.toggle('kd2-timeline-mode-active', state.timelineSelectLaneMode);
            btn.setAttribute('aria-pressed', state.timelineSelectLaneMode ? 'true' : 'false');
        }
        if (!skipRender) renderSchedule();
    }

    function setTimelineEditMode(on) {
        state.timelineEditMode = !!on;
        if (!state.timelineEditMode) {
            state.timelineMoveMode = 'block';
            state.timelineSelectLaneMode = false;
            state.timelineSelectedIds.clear();
            state.timelinePlacementActive = false;
        }
        const editBtn = document.getElementById('btnKd2TimelineEdit');
        const editBar = document.getElementById('kd2TimelineEditBar');
        if (editBtn) editBtn.style.display = state.timelineEditMode ? 'none' : '';
        if (editBar) editBar.style.display = state.timelineEditMode ? 'flex' : 'none';
        setTimelineMoveMode(state.timelineMoveMode);
        setTimelineSelectLaneMode(state.timelineSelectLaneMode, { skipRender: true });
        syncTimelineSelectionUi();
        syncTimelinePlacementUi();
        renderSchedule();
    }

    function buildTimelineGroups(rows) {
        const rowsByLane = new Map();
        rows
            .slice()
            .sort((a, b) => {
                const battalionCmp = String(a.battalion_code || '').localeCompare(String(b.battalion_code || ''));
                if (battalionCmp !== 0) return battalionCmp;
                const vehicleCmp = vehicleSortValue(a.vehicle) - vehicleSortValue(b.vehicle);
                if (vehicleCmp !== 0) return vehicleCmp;
                const unitCmp = String(a.vehicle_no || '').localeCompare(String(b.vehicle_no || ''), undefined, { numeric: true });
                if (unitCmp !== 0) return unitCmp;
                return comparePlanRowsByLaneOrder(a, b);
            })
            .forEach(row => {
                const key = timelineLaneKey(row);
                if (!rowsByLane.has(key)) rowsByLane.set(key, []);
                rowsByLane.get(key).push(row);
            });

        return buildTimelineLaneDefinitions(state.timelineRows).map(lane => {
            const laneRows = rowsByLane.get(lane.key) || [];
            const meta = laneRows.length
                ? `${laneRows.length} block${laneRows.length === 1 ? '' : 's'} · ${minDateStr(laneRows.map(row => row.start_date))} -> ${maxDateStr(laneRows.map(row => row.end_date))}`
                : 'No visible blocks in the current timeline window';
            return {
                key: lane.key,
                label: `${lane.battalion_code || '—'} · ${lane.vehicle_type || '—'} · ${lane.unit_label || lane.vehicle_no || '—'}`,
                meta,
                lane,
                rows: laneRows,
            };
        });
    }

    async function persistTimelineChanges(changes, auditRecordId) {
        if (!changes.length) return;
        const beforeRows = changes.map(change => ({
            id: change.id,
            battalion_id: change.oldBattalionId,
            vehicle_type: change.oldVehicleType,
            unit_serial: change.oldUnitSerial,
            unit_label: change.oldUnitLabel || null,
            station_code: change.stationCode || null,
            planned_start_date: change.oldStart,
            planned_end_date: change.oldEnd,
            schedule_week: weekLabel(change.oldStart),
        }));
        const updatedRows = [];
        for (const change of changes) {
            const payload = {
                battalion_id: change.newBattalionId,
                vehicle_type: change.newVehicleType,
                unit_serial: change.newUnitSerial,
                unit_label: change.newUnitLabel || null,
                planned_start_date: change.newStart,
                planned_end_date: change.newEnd,
                schedule_week: weekLabel(change.newStart),
            };
            const { data, error } = await dbRef
                .from('kd2_plan')
                .update(payload)
                .eq('id', change.id)
                .select('*')
                .single();
            if (error) throw error;
            updatedRows.push(data);
        }
        await writeAudit('UPDATE', 'kd2_plan', auditRecordId, beforeRows, updatedRows);
    }

    function timelineLaneFromTrack(track) {
        if (!track) return null;
        const battalionId = parseInt(track.dataset.battalionId || '', 10);
        const unitSerial = parseInt(track.dataset.unitSerial || '', 10);
        return {
            key: track.dataset.kd2LaneKey || '',
            battalion_id: Number.isFinite(battalionId) ? battalionId : null,
            battalion_code: track.dataset.battalionCode || '',
            vehicle_type: track.dataset.vehicleType || '',
            unit_serial: Number.isFinite(unitSerial) ? unitSerial : null,
            unit_label: track.dataset.unitLabel || '',
        };
    }

    function dateFromTrackPointer(track, clientX) {
        const viewStart = track.dataset.viewStart || '';
        const totalDays = parseInt(track.dataset.totalDays || '', 10) || 1;
        const rect = track.getBoundingClientRect();
        if (!viewStart || !rect.width) return '';
        const offset = Math.max(0, Math.min(rect.width - 1, clientX - rect.left));
        const dayWidth = rect.width / Math.max(totalDays, 1);
        const dayOffset = Math.max(0, Math.min(totalDays - 1, Math.floor(offset / Math.max(dayWidth, 1))));
        return addDays(viewStart, dayOffset);
    }

    function applyTimelinePreviewWindow(bar, viewStart, viewEnd, totalDays, window) {
        const clippedStart = window.start < viewStart ? viewStart : window.start;
        const clippedEnd = window.end > viewEnd ? viewEnd : window.end;
        const startOffset = Math.max(dayDiff(viewStart, clippedStart), 0);
        const span = Math.max(dayDiff(clippedStart, clippedEnd) + 1, 1);
        bar.style.left = `${(startOffset / totalDays) * 100}%`;
        bar.style.width = `${(span / totalDays) * 100}%`;
    }

    function clearTimelineDropTargets() {
        document.querySelectorAll('.kd2-timeline-track-drop-target').forEach(node => node.classList.remove('kd2-timeline-track-drop-target'));
    }

    async function loadTimelineMoveRows(anchorRow) {
        let rowsToMove = [{
            id: anchorRow.id,
            battalion_id: anchorRow.battalion_id,
            vehicle_type: anchorRow.vehicle_type || anchorRow.vehicle,
            unit_serial: anchorRow.unit_serial,
            unit_label: anchorRow.unit_label || anchorRow.vehicle_no || null,
            route_sequence: anchorRow.route_sequence,
            station_sequence_in_category: anchorRow.station_sequence_in_category,
            station_code: anchorRow.station_code,
            planned_start_date: anchorRow.start_date,
            planned_end_date: anchorRow.end_date,
        }];
        if (!['lane', 'from-block'].includes(state.timelineMoveMode) || !anchorRow.battalion_id || !(anchorRow.vehicle_type || anchorRow.vehicle)) {
            return rowsToMove;
        }
        let query = dbRef
            .from('kd2_plan')
            .select('id, battalion_id, vehicle_type, unit_serial, unit_label, route_sequence, station_sequence_in_category, station_code, planned_start_date, planned_end_date')
            .eq('battalion_id', anchorRow.battalion_id)
            .eq('vehicle_type', anchorRow.vehicle_type || anchorRow.vehicle);
        query = anchorRow.unit_serial === null
            ? query.is('unit_serial', null)
            : query.eq('unit_serial', anchorRow.unit_serial);
        const { data, error } = await query;
        if (error) throw error;
        if (!data?.length) return rowsToMove;
        return state.timelineMoveMode === 'from-block'
            ? getPlanMoveRowsFromAnchor({
                id: anchorRow.id,
                battalion_id: anchorRow.battalion_id,
                vehicle_type: anchorRow.vehicle_type || anchorRow.vehicle,
                unit_serial: anchorRow.unit_serial,
                route_sequence: anchorRow.route_sequence,
                station_sequence_in_category: anchorRow.station_sequence_in_category,
                station_code: anchorRow.station_code,
            }, data)
            : data;
    }

    async function ensureTimelineMoveAllowed(rowsToMove, destinationLane) {
        if (!rowsToMove.length || !destinationLane) return;
        const wrongVehicle = rowsToMove.find(row => (row.vehicle_type || row.vehicle) !== destinationLane.vehicle_type);
        if (wrongVehicle) {
            throw new Error(`Lane move blocked: ${wrongVehicle.station_code} belongs to ${(wrongVehicle.vehicle_type || wrongVehicle.vehicle)} and cannot move to a ${destinationLane.vehicle_type} lane.`);
        }
        const stationCodes = [...new Set(rowsToMove.map(row => row.station_code).filter(Boolean))];
        if (!stationCodes.length) return;

        let query = dbRef
            .from('kd2_plan')
            .select('id, station_code')
            .eq('battalion_id', destinationLane.battalion_id)
            .eq('vehicle_type', destinationLane.vehicle_type)
            .in('station_code', stationCodes);
        query = destinationLane.unit_serial === null
            ? query.is('unit_serial', null)
            : query.eq('unit_serial', destinationLane.unit_serial);
        const excludedIds = rowsToMove.map(row => row.id).filter(Boolean);
        if (excludedIds.length) {
            query = query.not('id', 'in', `(${excludedIds.join(',')})`);
        }
        const { data, error } = await query;
        if (error) throw error;
        if (data?.length) {
            const duplicates = [...new Set(data.map(row => row.station_code).filter(Boolean))];
            throw new Error(`Lane move blocked: ${duplicates.join(', ')} already exists on ${destinationLane.battalion_code} / ${destinationLane.vehicle_type} / ${destinationLane.unit_label}.`);
        }
    }

    async function moveTimelineBlock(anchorRow, deltaDays, destinationLane = null) {
        if (!dbRef) return { laneChanged: false, movedCount: 0 };
        const rowsToMove = await loadTimelineMoveRows(anchorRow);
        const destination = destinationLane || laneDescriptorFromRow(anchorRow);
        if (!destination?.battalion_id || !destination?.vehicle_type || !destination?.unit_serial) {
            throw new Error('Destination lane details are incomplete.');
        }
        const laneChanged = destination.key !== timelineLaneKey(anchorRow);
        if (laneChanged) await ensureTimelineMoveAllowed(rowsToMove, destination);

        const rules = planningRulesFor(destination.battalion_id, destination.vehicle_type);
        const changes = rowsToMove.map(row => {
            const window = shiftPlanWindowByCalendarDays(row.planned_start_date, row.planned_end_date, deltaDays, rules);
            return {
                id: row.id,
                stationCode: row.station_code,
                oldBattalionId: row.battalion_id,
                oldVehicleType: row.vehicle_type,
                oldUnitSerial: row.unit_serial,
                oldUnitLabel: row.unit_label || null,
                oldStart: row.planned_start_date,
                oldEnd: row.planned_end_date,
                newBattalionId: destination.battalion_id,
                newVehicleType: destination.vehicle_type,
                newUnitSerial: destination.unit_serial,
                newUnitLabel: destination.unit_label || null,
                newStart: window.start,
                newEnd: window.end,
            };
        });
        await persistTimelineChanges(
            changes,
            state.timelineMoveMode === 'lane'
                ? `timeline-lane:${timelineLaneKey(anchorRow)}:${destination.key}`
                : state.timelineMoveMode === 'from-block'
                    ? `timeline-from-block:${timelineLaneKey(anchorRow)}:${anchorRow.id}:${destination.key}`
                    : `timeline-block:${anchorRow.id}:${destination.key}`
        );
        return { laneChanged, movedCount: changes.length };
    }

    function wireTimelineDrag(totalDays, viewStart) {
        if (!state.timelineEditMode) return;
        document.querySelectorAll('.kd2-timeline-track[data-kd2-track]').forEach(track => {
            track.addEventListener('pointerup', async event => {
                if (!state.timelinePlacementActive) return;
                if (event.target.closest('.kd2-timeline-bar')) return;
                if (!canManageKD2()) {
                    toast('Only planners and admins can add KD2 plan rows.', 'error');
                    return;
                }
                const station = currentPlacementStation();
                const lane = timelineLaneFromTrack(track);
                if (!station) {
                    toast('Select a KD2 station before placing a block.', 'error');
                    return;
                }
                if (!lane?.battalion_id || !lane?.unit_serial) {
                    toast('The selected lane is missing battalion or unit details.', 'error');
                    return;
                }
                if (lane.vehicle_type !== station.vehicle_type) {
                    toast(`Placement blocked: ${station.station_name} belongs to ${station.vehicle_type} and must be placed on a matching lane.`, 'error');
                    return;
                }
                const plannedStart = dateFromTrackPointer(track, event.clientX);
                if (!plannedStart) return;
                try {
                    const duration = defaultDurationForStation(station.vehicle_type, station.category_code, station.station_code);
                    if (!duration) throw new Error(`Missing default duration for ${station.station_name}.`);
                    await createPlanBlock({
                        battalionId: lane.battalion_id,
                        vehicle: lane.vehicle_type,
                        unitSerial: lane.unit_serial,
                        unitLabel: lane.unit_label,
                        stationCode: station.station_code,
                        startDate: plannedStart,
                        duration,
                        remark: null,
                    });
                    state.timelineLastDragAt = Date.now();
                    toast(`KD2 block placed on ${lane.battalion_code} / ${lane.unit_label}.`, 'success');
                    await helpers.reloadAll?.();
                } catch (error) {
                    toast(`KD2 placement failed: ${error.message}`, 'error');
                }
            });
        });
        document.querySelectorAll('.kd2-timeline-bar[data-kd2-plan-id]').forEach(bar => {
            bar.addEventListener('pointerdown', event => {
                if (!state.timelineEditMode) return;
                if (!canManageKD2()) {
                    toast('Only planners and admins can edit KD2 plan rows.', 'error');
                    return;
                }
                if (event.target.closest('[data-kd2-select-id]')) return;
                if (state.timelinePlacementActive) return;

                event.preventDefault();
                const planId = parseInt(bar.dataset.kd2PlanId, 10);
                const anchorRow = state.timelineRows.find(row => row.id === planId);
                if (!anchorRow) return;
                const track = bar.closest('.kd2-timeline-track');
                if (!track) return;

                const isResize = event.target.closest('[data-kd2-resize]');
                const resizeEdge = isResize?.dataset.kd2Resize || '';
                const dayWidth = track.getBoundingClientRect().width / Math.max(totalDays, 1);
                const viewEnd = track.dataset.viewEnd || addDays(viewStart, totalDays - 1);
                const startX = event.clientX;
                let deltaDays = 0;
                let activeDropTrack = null;

                const previewIds = resizeEdge
                    ? new Set([anchorRow.id])
                    : state.timelineMoveMode === 'lane'
                        ? new Set(state.timelineRows.filter(row => timelineLaneKey(row) === timelineLaneKey(anchorRow)).map(row => row.id))
                        : state.timelineMoveMode === 'from-block'
                            ? new Set(getPlanMoveRowsFromAnchor(anchorRow, state.timelineRows).map(row => row.id))
                            : new Set([anchorRow.id]);
                const previewBars = [...document.querySelectorAll('.kd2-timeline-bar[data-kd2-plan-id]')]
                    .filter(item => previewIds.has(parseInt(item.dataset.kd2PlanId, 10)));

                bar.setPointerCapture(event.pointerId);
                previewBars.forEach(item => {
                    item.style.transition = 'none';
                    item.classList.add(resizeEdge ? 'kd2-timeline-bar-resizing' : 'kd2-timeline-bar-dragging');
                });

                const onMove = moveEvent => {
                    if (resizeEdge) {
                        const pointerDate = dateFromTrackPointer(track, moveEvent.clientX);
                        if (!pointerDate) return;
                        const rules = planningRulesFor(anchorRow.battalion_id, anchorRow.vehicle_type || anchorRow.vehicle);
                        const previewWindow = resizeEdge === 'left'
                            ? buildBackwardWindow(anchorRow.end_date, Math.max(durationFromPlannedWindow(pointerDate, anchorRow.end_date, rules), 1), rules)
                            : buildForwardWindow(anchorRow.start_date, Math.max(durationFromPlannedWindow(anchorRow.start_date, pointerDate, rules), 1), rules);
                        applyTimelinePreviewWindow(bar, viewStart, viewEnd, totalDays, previewWindow);
                        return;
                    }

                    const deltaPx = moveEvent.clientX - startX;
                    deltaDays = Math.round(deltaPx / Math.max(dayWidth, 1));
                    previewBars.forEach(item => {
                        item.style.transform = `translateX(${deltaDays * dayWidth}px)`;
                    });
                    clearTimelineDropTargets();
                    const dropTrack = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest('.kd2-timeline-track[data-kd2-track]');
                    if (dropTrack && dropTrack !== track) {
                        dropTrack.classList.add('kd2-timeline-track-drop-target');
                        activeDropTrack = dropTrack;
                    } else {
                        activeDropTrack = null;
                    }
                };

                const onUp = async upEvent => {
                    try { bar.releasePointerCapture(event.pointerId); } catch { /* noop */ }
                    bar.removeEventListener('pointermove', onMove);
                    bar.removeEventListener('pointerup', onUp);
                    clearTimelineDropTargets();
                    previewBars.forEach(item => {
                        item.style.transform = '';
                        item.style.transition = '';
                        item.classList.remove('kd2-timeline-bar-resizing', 'kd2-timeline-bar-dragging');
                    });
                    if (resizeEdge) {
                        bar.style.left = '';
                        bar.style.width = '';
                        const pointerDate = dateFromTrackPointer(track, upEvent.clientX);
                        if (!pointerDate) return;
                        const rules = planningRulesFor(anchorRow.battalion_id, anchorRow.vehicle_type || anchorRow.vehicle);
                        const window = resizeEdge === 'left'
                            ? buildBackwardWindow(anchorRow.end_date, Math.max(durationFromPlannedWindow(pointerDate, anchorRow.end_date, rules), 1), rules)
                            : buildForwardWindow(anchorRow.start_date, Math.max(durationFromPlannedWindow(anchorRow.start_date, pointerDate, rules), 1), rules);
                        if (window.start === anchorRow.start_date && window.end === anchorRow.end_date) return;
                        state.timelineLastDragAt = Date.now();
                        try {
                            await persistTimelineChanges([{
                                id: anchorRow.id,
                                stationCode: anchorRow.station_code,
                                oldBattalionId: anchorRow.battalion_id,
                                oldVehicleType: anchorRow.vehicle_type || anchorRow.vehicle,
                                oldUnitSerial: anchorRow.unit_serial,
                                oldUnitLabel: anchorRow.unit_label || anchorRow.vehicle_no || null,
                                oldStart: anchorRow.start_date,
                                oldEnd: anchorRow.end_date,
                                newBattalionId: anchorRow.battalion_id,
                                newVehicleType: anchorRow.vehicle_type || anchorRow.vehicle,
                                newUnitSerial: anchorRow.unit_serial,
                                newUnitLabel: anchorRow.unit_label || anchorRow.vehicle_no || null,
                                newStart: window.start,
                                newEnd: window.end,
                            }], `timeline-resize:${anchorRow.id}:${resizeEdge}`);
                            toast('KD2 block resized.', 'success');
                            await helpers.reloadAll?.();
                        } catch (error) {
                            toast(`KD2 resize failed: ${error.message}`, 'error');
                        }
                        return;
                    }

                    if (!deltaDays && !activeDropTrack) return;
                    const destinationLane = activeDropTrack ? timelineLaneFromTrack(activeDropTrack) : laneDescriptorFromRow(anchorRow);
                    state.timelineLastDragAt = Date.now();
                    try {
                        const result = await moveTimelineBlock(anchorRow, deltaDays, destinationLane);
                        toast(
                            result.laneChanged
                                ? 'KD2 block moved to a new lane.'
                                : state.timelineMoveMode === 'lane'
                                    ? 'KD2 lane rescheduled.'
                                    : state.timelineMoveMode === 'from-block'
                                        ? 'KD2 downstream lane blocks rescheduled.'
                                        : 'KD2 block rescheduled.',
                            'success'
                        );
                        await helpers.reloadAll?.();
                    } catch (error) {
                        toast(`KD2 reschedule failed: ${error.message}`, 'error');
                    }
                };

                bar.addEventListener('pointermove', onMove);
                bar.addEventListener('pointerup', onUp);
            });
        });
    }

    function renderSchedule(rows = state.timelineRows) {
        if (!isKD2()) return;
        const legend = document.getElementById('kd2TimelineLegend');
        const wrap = document.getElementById('kd2TimelineWrap');
        const startInput = document.getElementById('kd2TimelineStart');
        const endInput = document.getElementById('kd2TimelineEnd');
        if (!legend || !wrap || !startInput || !endInput) return;

        state.timelineRows = Array.isArray(rows) ? rows.slice() : [];
        const timelineRows = state.timelineRows.filter(row => row.start_date && row.end_date);
        const laneDefinitions = buildTimelineLaneDefinitions(state.timelineRows);
        const canRenderEmptyLanes = laneDefinitions.length > 0;
        if (!timelineRows.length && !canRenderEmptyLanes) {
            legend.innerHTML = '';
            wrap.innerHTML = '<div class="empty-state"><p>Generate or add a KD2 plan block to view the schedule.</p></div>';
            syncTimelineSelectionUi();
            syncTimelinePlacementUi();
            return;
        }

        const naturalStart = timelineRows.length
            ? timelineRows.reduce((min, row) => !min || row.start_date < min ? row.start_date : min, '')
            : (startInput.value || localDateStr(new Date()));
        const naturalEnd = timelineRows.length
            ? timelineRows.reduce((max, row) => !max || row.end_date > max ? row.end_date : max, '')
            : (endInput.value || addDays(naturalStart, 13));
        if (!startInput.value) startInput.value = naturalStart;
        if (!endInput.value) endInput.value = naturalEnd;

        let viewStart = startInput.value || naturalStart;
        let viewEnd = endInput.value || naturalEnd;
        if (viewStart > viewEnd) {
            const temp = viewStart;
            viewStart = viewEnd;
            viewEnd = temp;
            startInput.value = viewStart;
            endInput.value = viewEnd;
        }

        const visibleRows = timelineRows.filter(row => row.end_date >= viewStart && row.start_date <= viewEnd);
        const groups = buildTimelineGroups(visibleRows);
        if (!visibleRows.length && !groups.length) {
            legend.innerHTML = '';
            wrap.innerHTML = '<div class="empty-state"><p>No KD2 plan rows fall inside the selected timeline window.</p></div>';
            syncTimelineSelectionUi();
            syncTimelinePlacementUi();
            return;
        }

        const visibleCategories = [...new Set(visibleRows.map(row => row.category).filter(Boolean))];
        const visibleOffDays = [...state.nonWorkDaySet].filter(day => day >= viewStart && day <= viewEnd);
        legend.innerHTML = visibleCategories.map(category => `
            <span class="kd2-legend-item">
                <span class="kd2-legend-swatch ${categoryClassName(category)}"></span>
                ${escapeHtml(category)}
            </span>
        `).join('') + (visibleOffDays.length ? `
            <span class="kd2-legend-item">
                <span class="kd2-legend-swatch kd2-legend-offday"></span>
                No-work Day
            </span>
        ` : '');

        const totalDays = Math.max(dayDiff(viewStart, viewEnd) + 1, 1);
        const days = [];
        for (let i = 0; i < totalDays; i += 1) {
            const day = addDays(viewStart, i);
            const dayClasses = ['kd2-timeline-day'];
            if (parseDateLocal(day).getDay() === 5) dayClasses.push('kd2-timeline-day-friday');
            if (state.nonWorkDaySet.has(day)) dayClasses.push('kd2-timeline-day-off');
            days.push(`<div class="${dayClasses.join(' ')}"><strong>${escapeHtml(day.slice(8))}</strong>${escapeHtml(day.slice(5, 7))}</div>`);
        }
        wrap.innerHTML = `
            <div class="kd2-timeline-head" style="grid-template-columns: 240px repeat(${totalDays}, minmax(44px, 1fr));">
                <div class="kd2-timeline-corner">Battalion / Unit</div>
                ${days.join('')}
            </div>
            ${groups.map(group => {
                const laneRows = state.timelineRows.filter(row => timelineLaneKey(row) === group.key);
                const zoneHtml = visibleOffDays.map(day => {
                    const startOffset = Math.max(dayDiff(viewStart, day), 0);
                    return `<div class="kd2-timeline-track-zone" style="left:${(startOffset / totalDays) * 100}%;width:${(1 / totalDays) * 100}%;" title="${escapeHtml(day)}"></div>`;
                }).join('');
                const laneSelected = laneRows.length > 0 && laneRows.every(row => state.timelineSelectedIds.has(row.id));
                const bars = group.rows.map(row => {
                    const clippedStart = row.start_date < viewStart ? viewStart : row.start_date;
                    const clippedEnd = row.end_date > viewEnd ? viewEnd : row.end_date;
                    const startOffset = Math.max(dayDiff(viewStart, clippedStart), 0);
                    const span = Math.max(dayDiff(clippedStart, clippedEnd) + 1, 1);
                    const left = `${(startOffset / totalDays) * 100}%`;
                    const width = `${(span / totalDays) * 100}%`;
                    return `
                        <button
                            type="button"
                            class="kd2-timeline-bar ${categoryClassName(row.category)}${state.timelineSelectedIds.has(row.id) ? ' kd2-timeline-bar-selected' : ''}"
                            data-kd2-plan-id="${row.id}"
                            data-kd2-lane-key="${escapeHtml(group.key)}"
                            style="left:${left};width:${width};"
                            title="${escapeHtml(`${group.label} | ${row.work_center || row.station_code || 'No work center'} | ${row.process_station} | ${row.start_date} -> ${row.end_date}`)}">
                            ${state.timelineEditMode ? `<span class="kd2-timeline-select${state.timelineSelectedIds.has(row.id) ? ' kd2-timeline-select-active' : ''}" data-kd2-select-id="${row.id}" aria-pressed="${state.timelineSelectedIds.has(row.id) ? 'true' : 'false'}"></span>` : ''}
                            ${state.timelineEditMode ? '<span class="kd2-timeline-resize kd2-timeline-resize-left" data-kd2-resize="left"></span>' : ''}
                            <span class="kd2-timeline-bar-title">${escapeHtml([row.work_center, row.process_station || row.station_name || row.category || 'Block'].filter(Boolean).join(' · '))}</span>
                            ${state.timelineEditMode ? '<span class="kd2-timeline-resize kd2-timeline-resize-right" data-kd2-resize="right"></span>' : ''}
                        </button>
                    `;
                }).join('');
                const emptyLane = !bars ? '<div class="kd2-timeline-empty-lane">No blocks in view for this lane.</div>' : '';

                return `
                    <div class="kd2-timeline-row" style="grid-template-columns: 240px repeat(${totalDays}, minmax(44px, 1fr));">
                        <div class="kd2-timeline-label">
                            <div class="kd2-timeline-label-copy">
                                <strong>${escapeHtml(group.label)}</strong>
                                <span>${escapeHtml(group.meta)}</span>
                            </div>
                            ${state.timelineEditMode && state.timelineSelectLaneMode ? `<button type="button" class="kd2-timeline-lane-action" data-kd2-lane-select="${escapeHtml(group.key)}">${laneSelected ? 'Clear lane' : 'Select lane'}</button>` : ''}
                        </div>
                        <div
                            class="kd2-timeline-track${state.timelineEditMode ? ' kd2-timeline-edit-active' : ''}${state.timelinePlacementActive ? ' kd2-timeline-track-placement' : ''}"
                            style="grid-column: 2 / span ${totalDays};"
                            data-total-days="${totalDays}"
                            data-view-start="${escapeHtml(viewStart)}"
                            data-view-end="${escapeHtml(viewEnd)}"
                            data-kd2-track="true"
                            data-kd2-lane-key="${escapeHtml(group.key)}"
                            data-battalion-id="${escapeHtml(group.lane?.battalion_id ?? '')}"
                            data-battalion-code="${escapeHtml(group.lane?.battalion_code || '')}"
                            data-vehicle-type="${escapeHtml(group.lane?.vehicle_type || '')}"
                            data-unit-serial="${escapeHtml(group.lane?.unit_serial ?? '')}"
                            data-unit-label="${escapeHtml(group.lane?.unit_label || '')}">
                            ${zoneHtml}
                            ${bars}
                            ${emptyLane}
                        </div>
                    </div>
                `;
            }).join('')}
        `;

        wrap.querySelectorAll('[data-kd2-select-id]').forEach(btn => {
            btn.addEventListener('click', event => {
                event.stopPropagation();
                const id = parseInt(btn.dataset.kd2SelectId, 10);
                if (state.timelineSelectedIds.has(id)) state.timelineSelectedIds.delete(id);
                else state.timelineSelectedIds.add(id);
                syncTimelineSelectionUi();
            });
        });
        wrap.querySelectorAll('[data-kd2-lane-select]').forEach(btn => {
            btn.addEventListener('click', () => {
                const group = groups.find(item => item.key === btn.dataset.kd2LaneSelect);
                if (!group) return;
                const laneRows = state.timelineRows.filter(row => timelineLaneKey(row) === group.key);
                const laneSelected = laneRows.length > 0 && laneRows.every(row => state.timelineSelectedIds.has(row.id));
                laneRows.forEach(row => {
                    if (laneSelected) state.timelineSelectedIds.delete(row.id);
                    else state.timelineSelectedIds.add(row.id);
                });
                renderSchedule();
            });
        });
        wrap.querySelectorAll('[data-kd2-plan-id]').forEach(btn => {
            btn.addEventListener('click', event => {
                if (state.timelinePlacementActive) return;
                if (event.target.closest('[data-kd2-select-id]')) return;
                if (event.target.closest('[data-kd2-resize]')) return;
                if (Date.now() - state.timelineLastDragAt < 400) return;
                openPlanEdit(parseInt(btn.dataset.kd2PlanId, 10));
            });
        });
        wireTimelineDrag(totalDays, viewStart);
        syncTimelineSelectionUi();
        syncTimelinePlacementUi();
    }

    function openPlanEdit(planId) {
        if (!canManageKD2()) {
            toast('Only planners and admins can edit KD2 plan rows.', 'error');
            return;
        }
        const row = state.timelineRows.find(item => item.id === planId);
        if (!row) {
            toast('Selected KD2 plan row is not loaded in the current view.', 'error');
            return;
        }

        closeOpenBarMenus();
        document.getElementById('kd2PlanEditId').value = String(row.id);
        document.getElementById('kd2PlanEditInfo').textContent = `${row.battalion_code || '—'} · ${row.vehicle || '—'} · ${row.vehicle_no || '—'} · ${row.process_station || row.station_name || 'Plan block'}`;
        document.getElementById('kd2PlanEditStart').value = row.start_date || '';
        document.getElementById('kd2PlanEditEnd').value = row.end_date || '';
        document.getElementById('kd2PlanEditRemark').value = row.remark || '';
        setPlanEditError('');
        document.getElementById('kd2PlanEditOverlay').style.display = 'flex';
    }

    function setNoWorkError(message) {
        const el = document.getElementById('kd2NoWorkError');
        if (!el) return;
        el.textContent = message;
        el.style.display = message ? 'flex' : 'none';
    }

    function resetNoWorkForm() {
        const idsInput = document.getElementById('kd2NoWorkIds');
        const startInput = document.getElementById('kd2NoWorkStart');
        const endInput = document.getElementById('kd2NoWorkEnd');
        const labelInput = document.getElementById('kd2NoWorkLabel');
        const saveBtn = document.getElementById('btnKd2NoWorkAdd');
        const cancelBtn = document.getElementById('btnKd2NoWorkCancelEdit');
        if (idsInput) idsInput.value = '';
        if (startInput) startInput.value = '';
        if (endInput) endInput.value = '';
        if (labelInput) labelInput.value = '';
        if (saveBtn) saveBtn.textContent = 'Add Range';
        if (cancelBtn) cancelBtn.style.display = 'none';
    }

    function startNoWorkEdit(startDateStr) {
        const group = getNonWorkDayGroupByStart(startDateStr);
        if (!group) return;
        const idsInput = document.getElementById('kd2NoWorkIds');
        const startInput = document.getElementById('kd2NoWorkStart');
        const endInput = document.getElementById('kd2NoWorkEnd');
        const labelInput = document.getElementById('kd2NoWorkLabel');
        const saveBtn = document.getElementById('btnKd2NoWorkAdd');
        const cancelBtn = document.getElementById('btnKd2NoWorkCancelEdit');
        if (idsInput) idsInput.value = group.rows.map(row => row.id).join(',');
        if (startInput) startInput.value = group.start || '';
        if (endInput) endInput.value = group.end || group.start || '';
        if (labelInput) labelInput.value = group.label || '';
        if (saveBtn) saveBtn.textContent = 'Save Changes';
        if (cancelBtn) cancelBtn.style.display = '';
    }

    function renderNoWorkDays() {
        const list = document.getElementById('kd2NoWorkList');
        if (!list) return;
        const groups = getNonWorkDayGroups();
        if (!groups.length) {
            list.innerHTML = '<div class="empty-state"><p>No KD2 no-work days are stored yet.</p></div>';
            return;
        }
        list.innerHTML = groups.map(group => `
            <div class="kd2-no-work-item">
                <div class="kd2-no-work-copy">
                    <strong>${escapeHtml(formatNoWorkRange(group.start, group.end))}</strong>
                    <span>${escapeHtml(group.label || 'No label')}</span>
                </div>
                <div class="kd2-no-work-actions">
                    <button type="button" class="btn btn-ghost btn-sm" data-kd2-no-work-edit="${group.start}">Edit</button>
                    <button type="button" class="btn btn-ghost btn-kd2-danger btn-sm" data-kd2-no-work-delete="${group.start}">Delete</button>
                </div>
            </div>
        `).join('');
        list.querySelectorAll('[data-kd2-no-work-edit]').forEach(btn => {
            btn.addEventListener('click', () => startNoWorkEdit(btn.dataset.kd2NoWorkEdit));
        });
        list.querySelectorAll('[data-kd2-no-work-delete]').forEach(btn => {
            btn.addEventListener('click', () => deleteNoWorkDay(btn.dataset.kd2NoWorkDelete));
        });
    }

    function closeNoWorkModal() {
        document.getElementById('kd2NoWorkOverlay').style.display = 'none';
        setNoWorkError('');
        resetNoWorkForm();
    }

    function openNoWorkModal() {
        if (!canManageKD2()) {
            toast('Only planners and admins can manage KD2 no-work days.', 'error');
            return;
        }
        setNoWorkError('');
        resetNoWorkForm();
        renderNoWorkDays();
        document.getElementById('kd2NoWorkOverlay').style.display = 'flex';
    }

    async function addNoWorkDay() {
        if (!dbRef) return;
        const editingIds = parseNoWorkEditingIds();
        const editingIdSet = new Set(editingIds);
        const startDate = document.getElementById('kd2NoWorkStart')?.value;
        const endDate = document.getElementById('kd2NoWorkEnd')?.value || startDate;
        const label = normalizeNoWorkLabel(document.getElementById('kd2NoWorkLabel')?.value);
        if (!startDate) {
            setNoWorkError('Choose a start date to save.');
            return;
        }
        if (!endDate) {
            setNoWorkError('Choose an end date to save.');
            return;
        }
        if (endDate < startDate) {
            setNoWorkError('End date must be the same as or after the start date.');
            return;
        }
        const requestedDates = buildDateRange(startDate, endDate);
        try {
            const existingRows = editingIds.length
                ? state.nonWorkDays.filter(row => editingIdSet.has(row.id))
                : [];
            if (editingIds.length && existingRows.length !== editingIds.length) {
                setNoWorkError('The selected no-work range could not be found. Refresh the page and try again.');
                return;
            }
            const requestedDateSet = new Set(requestedDates);
            const duplicate = state.nonWorkDays.find(row => requestedDateSet.has(row.off_date) && !editingIdSet.has(row.id)) || null;
            if (duplicate) {
                setNoWorkError(`A KD2 no-work day already exists on ${formatDate(duplicate.off_date)}. Edit the existing range instead.`);
                return;
            }
            const previousOffDates = new Set(state.nonWorkDaySet);
            const nextOffDates = new Set(previousOffDates);
            existingRows.forEach(row => nextOffDates.delete(row.off_date));
            requestedDates.forEach(date => nextOffDates.add(date));
            const payload = requestedDates.map(offDate => ({
                module_id: NON_WORK_MODULE_ID,
                off_date: offDate,
                label,
            }));
            const query = dbRef.from('planning_non_work_days');
            const { data, error } = editingIds.length
                ? await query.upsert(payload, { onConflict: 'module_id,off_date' }).select('*')
                : await query.insert(payload).select('*');
            if (error) throw error;
            if (editingIds.length) {
                const staleIds = existingRows
                    .filter(row => !requestedDateSet.has(row.off_date))
                    .map(row => row.id)
                    .filter(Number.isFinite);
                if (staleIds.length) {
                    const { error: deleteError } = await dbRef
                        .from('planning_non_work_days')
                        .delete()
                        .in('id', staleIds)
                        .eq('module_id', NON_WORK_MODULE_ID);
                    if (deleteError) throw deleteError;
                }
            }
            await writeAudit(
                editingIds.length ? 'UPDATE' : 'INSERT',
                'planning_non_work_days',
                makeNoWorkAuditRecordId(requestedDates),
                existingRows,
                data
            );
            const rescheduledCount = !noWorkDateSetsEqual(previousOffDates, nextOffDates)
                ? await recalculatePlanWindowsForNonWorkDayChange(previousOffDates, nextOffDates, `kd2-non-work:${requestedDates[0]}`)
                : 0;
            resetNoWorkForm();
            await refreshWorkspace();
            renderNoWorkDays();
            updatePlanCreateEndFromDuration();
            const baseMessage = editingIds.length ? 'KD2 no-work range updated.' : 'KD2 no-work range saved.';
            toast(rescheduledCount ? `${baseMessage} ${rescheduledCount} plan block(s) recalculated.` : baseMessage, 'success');
            await helpers.reloadAll?.();
        } catch (error) {
            setNoWorkError(error.message);
        }
    }

    async function deleteNoWorkDay(startDateStr) {
        if (!dbRef || !startDateStr) return;
        const group = getNonWorkDayGroupByStart(startDateStr);
        if (!group?.rows?.length) return;
        const ids = group.rows.map(row => row.id).filter(Number.isFinite);
        const before = group.rows.slice();
        try {
            const previousOffDates = new Set(state.nonWorkDaySet);
            const { error } = await dbRef
                .from('planning_non_work_days')
                .delete()
                .in('id', ids)
                .eq('module_id', NON_WORK_MODULE_ID);
            if (error) throw error;
            await writeAudit('DELETE', 'planning_non_work_days', makeNoWorkAuditRecordId(before.map(row => row.off_date)), before, null);
            const nextOffDates = new Set(previousOffDates);
            before.forEach(row => nextOffDates.delete(row.off_date));
            const rescheduledCount = !noWorkDateSetsEqual(previousOffDates, nextOffDates)
                ? await recalculatePlanWindowsForNonWorkDayChange(previousOffDates, nextOffDates, `kd2-non-work-delete:${group.start}`)
                : 0;
            if (parseNoWorkEditingIds().some(id => ids.includes(id))) resetNoWorkForm();
            await refreshWorkspace();
            renderNoWorkDays();
            updatePlanCreateEndFromDuration();
            toast(rescheduledCount ? `KD2 no-work range deleted. ${rescheduledCount} plan block(s) recalculated.` : 'KD2 no-work range deleted.', 'success');
            await helpers.reloadAll?.();
        } catch (error) {
            setNoWorkError(error.message);
        }
    }

    function setKd2ImportError(message) {
        const el = document.getElementById('kd2ImportError');
        if (!el) return;
        el.textContent = message;
        el.style.display = message ? 'flex' : 'none';
    }

    function setKd2ImportSummary(message) {
        const el = document.getElementById('kd2ImportSummary');
        if (!el) return;
        el.textContent = message;
        el.style.display = message ? 'block' : 'none';
    }

    function setKd2ImportErrors(items = []) {
        const el = document.getElementById('kd2ImportErrors');
        if (!el) return;
        if (!items.length) {
            el.style.display = 'none';
            el.textContent = '';
            return;
        }
        el.textContent = items.join('\n');
        el.style.display = 'block';
    }

    function openKd2ImportPanel() {
        document.getElementById('kd2ImportPanel').style.display = 'block';
        setKd2ImportError('');
        setKd2ImportSummary('Upload one CSV or Excel file. Generated templates read the "Data" sheet; generic Excel uploads still use the first sheet when "Data" is absent.');
        setKd2ImportErrors([]);
    }

    function closeKd2ImportPanel() {
        document.getElementById('kd2ImportPanel').style.display = 'none';
        const fileInput = document.getElementById('kd2ImportFile');
        if (fileInput) fileInput.value = '';
        setKd2ImportError('');
        setKd2ImportSummary('');
        setKd2ImportErrors([]);
    }

    function normalizeImportDateValue(value) {
        if (!value && value !== 0) return '';
        if (value instanceof Date && !Number.isNaN(value.valueOf())) return localDateStr(value);
        if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
            const parsed = window.XLSX.SSF.parse_date_code(value);
            if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
        }
        const trimmed = String(value).trim();
        if (!trimmed) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        const parsed = new Date(trimmed);
        return Number.isNaN(parsed.valueOf()) ? '' : localDateStr(parsed);
    }

    function buildImportKey(row) {
        return [row.battalion_id, row.vehicle_type, row.unit_serial, row.station_code].join('||');
    }

    function templateExampleRow() {
        const battalion = state.battalions[0];
        const station = state.stations.find(row => row.vehicle_type === 'K9') || state.stations[0];
        const category = station
            ? state.categories.find(row => row.vehicle_type === station.vehicle_type && row.category_code === station.category_code)
            : null;
        return {
            battalion_code: battalion?.battalion_code || 'BTL-01',
            vehicle_type: station?.vehicle_type || 'K9',
            unit_serial: 1,
            unit_label: station?.vehicle_type ? `${station.vehicle_type}-01` : 'K9-01',
            category_code: category?.category_code || station?.category_code || 'welding',
            station_code: station?.station_code || 'k9_station_code',
            planned_start_date: localDateStr(new Date()),
            duration_working_days: 2,
            remark: 'Example row',
        };
    }

    function kd2TemplateInstructionRows() {
        return [
            ['KD2 Import Template'],
            ['Use the "Data" sheet for importable rows. Keep the header row exactly as delivered.'],
            [],
            ['Field', 'Required', 'Description'],
            ['battalion_code', 'Yes', 'Existing KD2 battalion code in Supabase.'],
            ['vehicle_type', 'Yes', 'Vehicle family. Allowed values: K9, K10, K11.'],
            ['unit_serial', 'Yes', 'Positive integer that identifies the unit inside the battalion and vehicle.'],
            ['unit_label', 'No', 'Optional display label for the unit.'],
            ['category_code', 'Yes', 'KD2 process category code already configured for the selected vehicle.'],
            ['station_code', 'Yes', 'KD2 station code already configured for the selected vehicle.'],
            ['planned_start_date', 'Yes', 'Enter YYYY-MM-DD. If the date lands on a KD2 no-work day or other off-day rule, import shifts it forward to the next valid working day.'],
            ['duration_working_days', 'Yes', 'Whole working-day duration. The system calculates planned_end_date from KD2 working-day rules and saved no-work days.'],
            ['remark', 'No', 'Optional planner note stored on the imported plan block.'],
            [],
            ['Import Rules'],
            ['1', 'Upload the "Data" sheet from this template, or any sheet that uses the same column headers.'],
            ['2', 'Generated templates are read from the "Data" sheet automatically. Generic uploads still default to the first sheet when "Data" is absent.'],
            ['3', 'Rows are matched by battalion_code + vehicle_type + unit_serial + station_code. Existing rows are updated; missing rows are inserted.'],
            ['4', 'Leave blank rows out. One row represents one KD2 plan block.'],
        ];
    }

    function downloadKd2Template() {
        if (typeof window.XLSX === 'undefined') {
            toast('SheetJS is not loaded yet.', 'error');
            return;
        }
        const example = templateExampleRow();
        const instructionsSheet = window.XLSX.utils.aoa_to_sheet(kd2TemplateInstructionRows());
        instructionsSheet['!cols'] = [
            { wch: 24 },
            { wch: 12 },
            { wch: 96 },
        ];
        const dataSheet = window.XLSX.utils.aoa_to_sheet([
            KD2_IMPORT_COLUMNS,
            KD2_IMPORT_COLUMNS.map(column => example[column] ?? ''),
        ]);
        dataSheet['!cols'] = KD2_IMPORT_COLUMNS.map(column => ({ wch: Math.max(column.length + 2, 18) }));
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, instructionsSheet, 'Instructions');
        window.XLSX.utils.book_append_sheet(wb, dataSheet, 'Data');
        window.XLSX.writeFile(wb, `KD2_plan_template_${localDateStr(new Date())}.xlsx`);
    }

    function readKd2ImportRows(matrix) {
        const rows = [];
        if (!matrix.length) return rows;
        const headerMap = matrix[0].map(value => String(value ?? '').trim().toLowerCase());
        const missingColumns = KD2_IMPORT_REQUIRED_COLUMNS.filter(column => !headerMap.includes(column));
        if (missingColumns.length) {
            throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
        }
        for (let i = 1; i < matrix.length; i += 1) {
            const rawRow = matrix[i];
            const rowObj = {};
            KD2_IMPORT_COLUMNS.forEach(column => {
                const index = headerMap.indexOf(column);
                rowObj[column] = index >= 0 ? rawRow[index] : '';
            });
            if (String(rowObj.battalion_code || '').trim().toLowerCase().startsWith('instructions:')) continue;
            const isBlank = KD2_IMPORT_COLUMNS.every(column => String(rowObj[column] ?? '').trim() === '');
            if (isBlank) continue;
            rows.push({ sheetRow: i + 1, ...rowObj });
        }
        return rows;
    }

    async function importKd2PlanFile() {
        if (!dbRef) return;
        if (!canManageKD2()) {
            toast('Only planners and admins can import KD2 plans.', 'error');
            return;
        }
        const file = document.getElementById('kd2ImportFile')?.files?.[0];
        if (!file) {
            setKd2ImportError('Choose a CSV or Excel file first.');
            return;
        }
        if (typeof window.XLSX === 'undefined') {
            setKd2ImportError('SheetJS is not loaded yet.');
            return;
        }
        setKd2ImportError('');
        setKd2ImportErrors([]);
        setKd2ImportSummary('Reading file...');
        try {
            await loadWorkspaceData();
            const buffer = await file.arrayBuffer();
            const workbook = window.XLSX.read(buffer, { type: 'array', cellDates: true });
            const sheetName = workbook.SheetNames.includes('Data') ? 'Data' : workbook.SheetNames[0];
            const importSheet = workbook.Sheets[sheetName];
            const matrix = window.XLSX.utils.sheet_to_json(importSheet, { header: 1, raw: true, defval: '' });
            const importRows = readKd2ImportRows(matrix);
            if (!importRows.length) throw new Error('No import rows were found in the uploaded file.');

            const battalionByCode = new Map(state.battalions.map(row => [String(row.battalion_code || '').toUpperCase(), row]));
            const categoryByKey = new Map(state.categories.map(row => [`${row.vehicle_type}||${row.category_code}`.toUpperCase(), row]));
            const stationByKey = new Map(state.stations.map(row => [`${row.vehicle_type}||${row.station_code}`.toUpperCase(), row]));
            const errors = [];
            const payloads = [];

            importRows.forEach(row => {
                const battalionCode = String(row.battalion_code || '').trim().toUpperCase();
                const vehicleType = String(row.vehicle_type || '').trim().toUpperCase();
                const categoryCode = String(row.category_code || '').trim();
                const stationCode = String(row.station_code || '').trim();
                const unitSerial = parseInt(String(row.unit_serial || '').trim(), 10);
                const duration = parseInt(String(row.duration_working_days || '').trim(), 10);
                const plannedStart = normalizeImportDateValue(row.planned_start_date);
                const battalion = battalionByCode.get(battalionCode);
                const category = categoryByKey.get(`${vehicleType}||${categoryCode}`.toUpperCase());
                const station = stationByKey.get(`${vehicleType}||${stationCode}`.toUpperCase());
                if (!battalion) errors.push(`Row ${row.sheetRow}: unknown battalion_code "${row.battalion_code}".`);
                if (!VEHICLES.includes(vehicleType)) errors.push(`Row ${row.sheetRow}: vehicle_type must be K9, K10, or K11.`);
                if (!Number.isFinite(unitSerial) || unitSerial < 1) errors.push(`Row ${row.sheetRow}: unit_serial must be a positive integer.`);
                if (!category) errors.push(`Row ${row.sheetRow}: unknown category_code "${row.category_code}" for ${vehicleType || 'vehicle'}.`);
                if (!station) errors.push(`Row ${row.sheetRow}: unknown station_code "${row.station_code}" for ${vehicleType || 'vehicle'}.`);
                if (category && station && category.category_code !== station.category_code) {
                    errors.push(`Row ${row.sheetRow}: station_code "${row.station_code}" does not belong to category_code "${row.category_code}".`);
                }
                if (!plannedStart) errors.push(`Row ${row.sheetRow}: planned_start_date is invalid.`);
                if (!Number.isFinite(duration) || duration < 1) errors.push(`Row ${row.sheetRow}: duration_working_days must be a positive integer.`);
                if (battalion && VEHICLES.includes(vehicleType) && Number.isFinite(unitSerial) && unitSerial > 0 && station && plannedStart && Number.isFinite(duration) && duration > 0) {
                    const rules = planningRulesFor(battalion.id, vehicleType);
                    const window = buildForwardWindow(plannedStart, duration, rules);
                    payloads.push({
                        battalion_id: battalion.id,
                        vehicle_type: vehicleType,
                        unit_serial: unitSerial,
                        unit_label: String(row.unit_label || '').trim() || null,
                        category_code: station.category_code,
                        station_code: station.station_code,
                        category_sequence: category?.category_sequence || 1,
                        station_sequence_in_category: station.station_sequence_in_category,
                        route_sequence: station.route_sequence,
                        schedule_week: weekLabel(window.start),
                        planned_start_date: window.start,
                        planned_end_date: window.end,
                        planning_source: 'import',
                        remark: String(row.remark || '').trim() || null,
                    });
                }
            });

            if (errors.length) {
                setKd2ImportSummary(`Import rejected. ${errors.length} row issue(s) were found.`);
                setKd2ImportErrors(errors);
                return;
            }

            const battalionIds = [...new Set(payloads.map(row => row.battalion_id))];
            const existingRows = battalionIds.length
                ? await queryAll(dbRef.from('kd2_plan').select('*').in('battalion_id', battalionIds))
                : [];
            const beforeMap = new Map(existingRows.map(row => [buildImportKey(row), row]));
            const upsertedRows = [];
            for (const batch of chunk(payloads, 200)) {
                const { data, error } = await dbRef
                    .from('kd2_plan')
                    .upsert(batch, { onConflict: 'battalion_id,vehicle_type,unit_serial,station_code' })
                    .select('*');
                if (error) throw error;
                upsertedRows.push(...(data || []));
            }

            const inserted = upsertedRows.filter(row => !beforeMap.has(buildImportKey(row)));
            const updated = upsertedRows.filter(row => beforeMap.has(buildImportKey(row)));
            if (inserted.length) {
                await writeAudit('INSERT', 'kd2_plan', 'kd2-import-insert', null, inserted);
            }
            if (updated.length) {
                await writeAudit(
                    'UPDATE',
                    'kd2_plan',
                    'kd2-import-update',
                    updated.map(row => beforeMap.get(buildImportKey(row))),
                    updated
                );
            }

            setKd2ImportSummary(`Imported ${upsertedRows.length} row(s): ${inserted.length} inserted, ${updated.length} updated.`);
            setKd2ImportErrors([]);
            toast(`KD2 import completed: ${upsertedRows.length} row(s).`, 'success');
            await helpers.reloadAll?.();
        } catch (error) {
            setKd2ImportError(error.message);
        }
    }

    function setPlanCreateError(message) {
        const el = document.getElementById('kd2PlanCreateError');
        if (!el) return;
        el.textContent = message;
        el.style.display = message ? 'flex' : 'none';
    }

    function closePlanCreateModal() {
        const overlay = document.getElementById('kd2PlanCreateOverlay');
        if (overlay) overlay.style.display = 'none';
        setPlanCreateError('');
    }

    function selectedCreateStation() {
        const vehicle = document.getElementById('kd2PlanCreateVehicle')?.value || 'K9';
        const stationCode = document.getElementById('kd2PlanCreateStation')?.value || '';
        return state.stations.find(row => row.vehicle_type === vehicle && row.station_code === stationCode) || null;
    }

    function updatePlanCreateCategory() {
        const categoryEl = document.getElementById('kd2PlanCreateCategory');
        if (!categoryEl) return;
        const station = selectedCreateStation();
        if (!station) {
            categoryEl.textContent = 'Select a station to resolve the KD2 category.';
            return;
        }
        const category = state.categories.find(row =>
            row.vehicle_type === station.vehicle_type &&
            row.category_code === station.category_code
        );
        categoryEl.textContent = category
            ? `${category.category_name} · ${station.work_center || station.station_code} · Route ${station.route_sequence} · Station ${station.station_sequence_in_category}`
            : `${station.category_code} · Route ${station.route_sequence}`;
    }

    function populatePlanCreateStations(preserveValue = '') {
        const vehicle = document.getElementById('kd2PlanCreateVehicle')?.value || 'K9';
        const stationSelect = document.getElementById('kd2PlanCreateStation');
        if (!stationSelect) return;

        const categories = state.categories
            .filter(row => row.vehicle_type === vehicle)
            .sort((a, b) => a.category_sequence - b.category_sequence);

        if (!categories.length) {
            stationSelect.innerHTML = '<option value="">No KD2 route stations available</option>';
            updatePlanCreateCategory();
            return;
        }

        stationSelect.innerHTML = categories.map(category => {
            const categoryStations = state.stations
                .filter(row => row.vehicle_type === vehicle && row.category_code === category.category_code)
                .sort((a, b) => a.station_sequence_in_category - b.station_sequence_in_category);

            if (!categoryStations.length) return '';
            return `
                <optgroup label="${escapeHtml(category.category_name)}">
                    ${categoryStations.map(station => `
                        <option value="${escapeHtml(station.station_code)}">
                            ${escapeHtml(station.station_name)} · ${escapeHtml(station.work_center || station.station_code)} · Route ${station.route_sequence}
                        </option>
                    `).join('')}
                </optgroup>
            `;
        }).join('');

        const options = [...stationSelect.options];
        if (preserveValue && options.some(option => option.value === preserveValue)) stationSelect.value = preserveValue;
        updatePlanCreateCategory();
    }

    function planCreateUnitOptions() {
        const battalionId = parseInt(document.getElementById('kd2PlanCreateBattalion')?.value || '', 10);
        const vehicle = document.getElementById('kd2PlanCreateVehicle')?.value || 'K9';
        if (!battalionId || !vehicle) return [];

        const input = inputFor(battalionId, vehicle);
        const quantity = parseInt(input?.required_quantity, 10) || 0;
        const unitMap = new Map(
            state.vehicleUnits
                .filter(row => row.battalion_id === battalionId && row.vehicle_type === vehicle)
                .map(row => [row.unit_serial, row])
        );

        const serials = new Set();
        for (let i = 1; i <= quantity; i += 1) serials.add(i);
        unitMap.forEach((_, serial) => serials.add(serial));

        return [...serials]
            .sort((a, b) => a - b)
            .map(serial => {
                const unit = unitMap.get(serial);
                const label = unit?.unit_label || `${vehicle}-${String(serial).padStart(2, '0')}`;
                const code = unit?.unit_code || '';
                return { serial, label, code };
            });
    }

    function populatePlanCreateUnits(preserveValue = '') {
        const unitSelect = document.getElementById('kd2PlanCreateUnit');
        if (!unitSelect) return;

        const units = planCreateUnitOptions();
        if (!units.length) {
            unitSelect.innerHTML = '<option value="">No units configured for this battalion and vehicle</option>';
            return;
        }

        unitSelect.innerHTML = units.map(unit => `
            <option value="${unit.serial}" data-unit-label="${escapeHtml(unit.label)}">
                ${escapeHtml(unit.label)}${unit.code ? ` · ${escapeHtml(unit.code)}` : ''}
            </option>
        `).join('');

        if (preserveValue && [...unitSelect.options].some(option => option.value === preserveValue)) {
            unitSelect.value = preserveValue;
        }
    }

    function currentPlanCreateMode() {
        return document.querySelector('#kd2PlanCreateModeToggle .kd2-create-mode-btn.active')?.dataset.mode || 'block';
    }

    function syncPlanCreateUiState() {
        const mode = currentPlanCreateMode();
        const isTemplate = mode === 'template';
        const modeGroup = document.getElementById('kd2PlanCreateModeGroup');
        const stationGroup = document.getElementById('kd2PlanCreateStation')?.closest('.form-group');
        const categoryGroup = document.getElementById('kd2PlanCreateCategory')?.closest('.form-group');
        const durationGroup = document.getElementById('kd2PlanCreateDuration')?.closest('.form-group');
        const endGroup = document.getElementById('kd2PlanCreateEnd')?.closest('.form-group');
        const remarkGroup = document.getElementById('kd2PlanCreateRemark')?.closest('.form-group');
        const editorWrap = document.getElementById('kd2TemplateEditorWrap');
        const title = document.getElementById('kd2PlanCreateTitle');
        const saveBtn = document.getElementById('btnKd2PlanCreateSave');

        document.querySelectorAll('[data-kd2-plan-create-form]').forEach(node => {
            node.style.display = '';
        });
        if (modeGroup) modeGroup.style.display = '';
        if (stationGroup) stationGroup.style.display = isTemplate ? 'none' : '';
        if (categoryGroup) categoryGroup.style.display = isTemplate ? 'none' : '';
        if (durationGroup) durationGroup.style.display = isTemplate ? 'none' : '';
        if (endGroup) endGroup.style.display = isTemplate ? 'none' : '';
        if (remarkGroup) remarkGroup.style.display = isTemplate ? 'none' : '';
        if (editorWrap) editorWrap.style.display = isTemplate ? 'block' : 'none';
        if (title) {
            title.textContent = isTemplate ? 'Add KD2 Template' : 'Add KD2 Plan Block';
        }
        if (saveBtn) {
            saveBtn.textContent = isTemplate ? 'Add Template to Plan' : 'Add to KD2 Plan';
        }
        if (isTemplate) renderTemplateEditor();
        else {
            updatePlanCreateCategory();
            updatePlanCreateDurationFromStation(true);
        }
        syncTimelinePlacementUi();
    }

    function setPlanCreateMode(mode) {
        const safeMode = mode === 'template' ? 'template' : 'block';
        document.querySelectorAll('#kd2PlanCreateModeToggle .kd2-create-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === safeMode);
        });
        syncPlanCreateUiState();
    }

    function defaultDurationForStation(vehicle, categoryCode, stationCode) {
        return resolveLeadTime(vehicle, categoryCode, stationCode);
    }

    async function createPlanBlock({ battalionId, vehicle, unitSerial, unitLabel, stationCode, startDate, duration, remark, planningSource = 'manual' }) {
        if (!dbRef) return null;
        const battalion = state.battalions.find(row => row.id === battalionId) || null;
        const station = state.stations.find(row => row.vehicle_type === vehicle && row.station_code === stationCode) || null;
        const category = state.categories.find(row => row.vehicle_type === vehicle && row.category_code === station?.category_code) || null;
        if (!battalion || !station || !category) {
            throw new Error('The selected KD2 route definition is incomplete.');
        }
        if (!startDate || !duration || duration < 1 || !unitSerial) {
            throw new Error('Battalion, vehicle, unit, station, planned start, and duration are required.');
        }

        let duplicateQuery = dbRef
            .from('kd2_plan')
            .select('id')
            .eq('battalion_id', battalion.id)
            .eq('vehicle_type', vehicle)
            .eq('station_code', station.station_code);
        duplicateQuery = unitSerial === null
            ? duplicateQuery.is('unit_serial', null)
            : duplicateQuery.eq('unit_serial', unitSerial);
        const { data: duplicate, error: duplicateError } = await duplicateQuery.maybeSingle();
        if (duplicateError) throw duplicateError;
        if (duplicate) {
            throw new Error('A KD2 plan block for this battalion, unit serial, and station already exists.');
        }

        const window = buildForwardWindow(startDate, duration, planningRulesFor(battalion.id, vehicle));
        const payload = {
            battalion_id: battalion.id,
            vehicle_type: vehicle,
            unit_serial: unitSerial,
            unit_label: unitLabel || null,
            category_code: category.category_code,
            station_code: station.station_code,
            category_sequence: category.category_sequence,
            station_sequence_in_category: station.station_sequence_in_category,
            route_sequence: station.route_sequence,
            schedule_week: weekLabel(window.start),
            planned_start_date: window.start,
            planned_end_date: window.end,
            planning_source: planningSource,
            remark: remark || null,
        };
        const { data, error } = await dbRef
            .from('kd2_plan')
            .insert(payload)
            .select('*')
            .single();
        if (error) throw error;
        await writeAudit('INSERT', 'kd2_plan', data.id, null, payload);
        return data;
    }

    function beginTimelinePlacement({ keepMenuState = false } = {}) {
        const station = currentPlacementStation();
        if (!station) {
            setPlanCreateError('Select a station block before starting visual placement.');
            return;
        }
        state.timelinePlacementActive = true;
        if (!keepMenuState) setTimelinePlacementMenuOpen(false);
        if (document.getElementById('kd2PlanCreateOverlay')?.style.display === 'flex') closePlanCreateModal();
        if (!state.timelineEditMode) setTimelineEditMode(true);
        else {
            syncTimelinePlacementUi();
            renderSchedule();
        }
        toast(`Placement mode active for ${station.station_name}.`, 'info');
    }

    function cancelTimelinePlacement({ skipRender = false } = {}) {
        state.timelinePlacementActive = false;
        setTimelinePlacementMenuOpen(false);
        syncTimelinePlacementUi();
        if (!skipRender) renderSchedule();
    }

    async function toggleTimelineVisualMenu(forceOpen = null) {
        const shouldOpen = forceOpen === null ? !state.timelinePlacementMenuOpen : !!forceOpen;
        if (!shouldOpen) {
            setTimelinePlacementMenuOpen(false);
            return;
        }
        if (!canManageKD2()) {
            toast('Only planners and admins can add KD2 plan rows.', 'error');
            return;
        }
        try {
            if (!state.battalions.length || !state.stations.length) await loadWorkspaceData();
        } catch (error) {
            toast(`KD2 setup load failed: ${error.message}`, 'error');
            return;
        }
        const defaultVehicle = getVehicleFilterValue() || state.timelinePlacementVehicle || 'K9';
        setTimelinePlacementVehicle(defaultVehicle);
        setTimelinePlacementMenuOpen(shouldOpen);
        syncTimelinePlacementUi();
    }

    function updatePlanCreateEndFromDuration() {
        const start = document.getElementById('kd2PlanCreateStart')?.value;
        const duration = parseInt(document.getElementById('kd2PlanCreateDuration')?.value || '', 10);
        const endInput = document.getElementById('kd2PlanCreateEnd');
        if (!start || !duration || duration < 1 || !endInput) return;
        const battalionId = parseInt(document.getElementById('kd2PlanCreateBattalion')?.value || '', 10);
        const vehicle = document.getElementById('kd2PlanCreateVehicle')?.value || 'K9';
        const window = buildForwardWindow(start, duration, planningRulesFor(battalionId, vehicle));
        endInput.value = window.end;
    }

    function updatePlanCreateDurationFromStation(force = false) {
        const station = selectedCreateStation();
        const durationInput = document.getElementById('kd2PlanCreateDuration');
        if (!station || !durationInput) return;
        const duration = defaultDurationForStation(station.vehicle_type, station.category_code, station.station_code);
        if (force || !durationInput.value) {
            durationInput.value = duration || '';
        }
        updatePlanCreateEndFromDuration();
    }

    function templateRowsForVehicle(vehicle) {
        return routeItemsForVehicle(vehicle).map(item => ({
            ...item,
            duration: defaultDurationForStation(vehicle, item.route.category_code, item.route.station_code),
        }));
    }

    function slugifyStationName(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 42) || 'custom_block';
    }

    function templateCategoryOptions(vehicle, selected = 'assembly') {
        return state.categories
            .filter(row => row.vehicle_type === vehicle)
            .sort((a, b) => a.category_sequence - b.category_sequence)
            .map(row => `<option value="${escapeHtml(row.category_code)}" ${row.category_code === selected ? 'selected' : ''}>${escapeHtml(row.category_name)}</option>`)
            .join('');
    }

    function nextTemplateRoute(vehicle) {
        const routes = routeItemsForVehicle(vehicle).map(item => parseInt(item.route.route_sequence, 10) || 0);
        return Math.max(0, ...routes) + 1;
    }

    function renderTemplateEditor() {
        const container = document.getElementById('kd2TemplateEditor');
        if (!container) return;
        const vehicle = document.getElementById('kd2PlanCreateVehicle')?.value || 'K9';
        const rows = templateRowsForVehicle(vehicle)
            .filter(item => !state.templateRemovedStations.has(item.route.station_code));
        if (!rows.length) {
            container.innerHTML = '<div class="empty-state"><p>No route template is available for this vehicle.</p></div><div class="kd2-template-new-rows" id="kd2TemplateNewRows"></div>';
            return;
        }
        const groups = groupRouteItems(rows);
        container.innerHTML = groups.map(group => `
            <div class="kd2-template-route">
                <div class="kd2-template-route-label">Route ${group.sequence}${group.items.length > 1 ? ' · Parallel' : ''}</div>
                ${group.items.map(item => `
                    <div class="kd2-template-row" data-kd2-template-row data-existing="true" data-category-code="${escapeHtml(item.route.category_code)}" data-station-code="${escapeHtml(item.route.station_code)}">
                        <span>
                            <strong>${escapeHtml(item.station.station_name)}</strong>
                            <small>${escapeHtml(item.category.category_name)} · ${escapeHtml(item.station.work_center || item.station.station_code)}</small>
                        </span>
                        <input type="number" min="1" step="1" class="filter-control kd2-template-route-input" data-field="routeSequence" data-category-code="${escapeHtml(item.route.category_code)}" data-station-code="${escapeHtml(item.route.station_code)}" value="${item.route.route_sequence}" title="Same route number = parallel" />
                        <input type="number" min="1" step="1" class="filter-control kd2-template-duration" data-category-code="${escapeHtml(item.route.category_code)}" data-station-code="${escapeHtml(item.route.station_code)}" value="${item.duration || ''}" placeholder="days" />
                        <button type="button" class="kd2-template-remove" data-kd2-template-remove="${escapeHtml(item.route.station_code)}" title="Remove from template">&times;</button>
                    </div>
                `).join('')}
            </div>
        `).join('') + '<div class="kd2-template-new-rows" id="kd2TemplateNewRows"></div>';
    }

    function addTemplateDraftRow() {
        const container = document.getElementById('kd2TemplateNewRows') || document.getElementById('kd2TemplateEditor');
        if (!container) return;
        const vehicle = document.getElementById('kd2PlanCreateVehicle')?.value || 'K9';
        state.templateNewRowCounter += 1;
        const rowId = `new_${state.templateNewRowCounter}`;
        container.insertAdjacentHTML('beforeend', `
            <div class="kd2-template-route kd2-template-draft" data-kd2-template-draft="${rowId}">
                <div class="kd2-template-route-label">New Block</div>
                <div class="kd2-template-row kd2-template-row-new" data-kd2-template-row data-new="true">
                    <input type="text" class="filter-control kd2-template-name-input" data-field="stationName" placeholder="Station name" />
                    <select class="filter-control kd2-template-category-input" data-field="categoryCode">${templateCategoryOptions(vehicle)}</select>
                    <input type="text" class="filter-control kd2-template-workcenter-input" data-field="workCenter" placeholder="Work center" />
                    <input type="number" min="1" step="1" class="filter-control kd2-template-route-input" data-field="routeSequence" value="${nextTemplateRoute(vehicle)}" title="Same route number = parallel" />
                    <input type="number" min="1" step="1" class="filter-control kd2-template-duration" data-field="duration" placeholder="days" />
                    <button type="button" class="kd2-template-remove" data-kd2-template-remove-draft="${rowId}" title="Remove new block">&times;</button>
                </div>
            </div>
        `);
    }

    function readTemplateRows() {
        const vehicle = document.getElementById('kd2PlanCreateVehicle')?.value || 'K9';
        const rows = [];
        document.querySelectorAll('[data-kd2-template-row]').forEach(node => {
            const isNew = node.dataset.new === 'true';
            const durationInput = node.querySelector('.kd2-template-duration');
            const duration = parseInt(durationInput?.value || '', 10);
            const routeInput = node.querySelector('.kd2-template-route-input');
            const routeSequence = parseRouteSequenceValue(routeInput?.value);
            const categoryCode = isNew
                ? node.querySelector('[data-field="categoryCode"]')?.value
                : node.dataset.categoryCode;
            const stationName = isNew ? node.querySelector('[data-field="stationName"]')?.value?.trim() : '';
            const workCenter = isNew ? node.querySelector('[data-field="workCenter"]')?.value?.trim() : '';
            rows.push({
                isNew,
                vehicle_type: vehicle,
                category_code: categoryCode,
                station_code: isNew ? null : node.dataset.stationCode,
                station_name: stationName,
                work_center: workCenter,
                route_sequence: routeSequence,
                planning_level: 'station',
                lead_time_days: Number.isFinite(duration) && duration > 0 ? duration : null,
                lead_time_source: 'KD2 template',
                notes: 'Editable route template default',
            });
        });
        return rows;
    }

    async function saveTemplateDefaults({ silent = false } = {}) {
        if (!dbRef) return false;
        const rows = readTemplateRows();
        const selectedVehicle = document.getElementById('kd2PlanCreateVehicle')?.value || 'K9';
        if (!rows.length && !state.templateRemovedStations.size) {
            setPlanCreateError('No template rows are available to save.');
            return false;
        }
        const missingName = rows.find(row => row.isNew && !row.station_name);
        if (missingName) {
            setPlanCreateError('Every new template block needs a station name.');
            return false;
        }
        const missingCategory = rows.find(row => !row.category_code);
        if (missingCategory) {
            setPlanCreateError('Every template row needs a category.');
            return false;
        }
        const invalid = rows.find(row => row.lead_time_days === null);
        if (invalid) {
            setPlanCreateError('Every template row needs a duration before saving or adding the template.');
            return false;
        }
        const invalidRoute = rows.find(row => Number.isNaN(row.route_sequence));
        if (invalidRoute) {
            setPlanCreateError('Every template row needs a route number greater than 0. Same route number means parallel.');
            return false;
        }
        const vehicle = rows[0]?.vehicle_type || selectedVehicle;
        const before = state.leadTimes.filter(row => row.vehicle_type === vehicle);
        const routeBefore = state.stations
            .filter(row => row.vehicle_type === vehicle)
            .map(row => ({ station_code: row.station_code, route_sequence: row.route_sequence }));
        const existingCodes = new Set(state.stations.map(row => `${row.vehicle_type}||${row.station_code}`));
        const categorySequenceCounters = new Map();
        for (const row of rows) {
            if (!row.isNew) continue;
            const base = `${row.vehicle_type.toLowerCase()}_${row.category_code}_${slugifyStationName(row.station_name)}`;
            let stationCode = base;
            let suffix = 2;
            while (existingCodes.has(`${row.vehicle_type}||${stationCode}`) || rows.some(other => other !== row && other.station_code === stationCode)) {
                stationCode = `${base}_${suffix}`;
                suffix += 1;
            }
            row.station_code = stationCode;
            existingCodes.add(`${row.vehicle_type}||${stationCode}`);
            const key = `${row.vehicle_type}||${row.category_code}`;
            const currentMax = categorySequenceCounters.get(key) ?? Math.max(0, ...state.stations
                .filter(item => item.vehicle_type === row.vehicle_type && item.category_code === row.category_code)
                .map(item => parseInt(item.station_sequence_in_category, 10) || 0));
            row.station_sequence_in_category = currentMax + 1;
            categorySequenceCounters.set(key, row.station_sequence_in_category);
        }
        const leadRows = rows.map(({ isNew, route_sequence, station_name, work_center, station_sequence_in_category, ...row }) => row);

        for (const row of rows) {
            const stationPayload = row.isNew
                ? {
                    vehicle_type: row.vehicle_type,
                    category_code: row.category_code,
                    station_code: row.station_code,
                    station_name: row.station_name,
                    work_center: row.work_center || null,
                    station_sequence_in_category: row.station_sequence_in_category,
                    route_sequence: row.route_sequence,
                    is_active: true,
                    notes: 'Added from KD2 template editor',
                }
                : { route_sequence: row.route_sequence, is_active: true };
            const stationQuery = row.isNew
                ? dbRef.from('kd2_process_stations').upsert(stationPayload, { onConflict: 'vehicle_type,station_code' })
                : dbRef.from('kd2_process_stations').update(stationPayload).eq('vehicle_type', row.vehicle_type).eq('station_code', row.station_code);
            const { error: stationError } = await stationQuery;
            if (stationError) throw stationError;

            const { error: routeError } = await dbRef
                .from('kd2_process_routes')
                .upsert({
                    vehicle_type: row.vehicle_type,
                    category_code: row.category_code,
                    station_code: row.station_code,
                    route_sequence: row.route_sequence,
                    is_active: true,
                }, { onConflict: 'vehicle_type,station_code' });
            if (routeError) throw routeError;
        }

        if (leadRows.length) {
            const { error } = await dbRef
                .from('kd2_process_lead_times')
                .upsert(leadRows, { onConflict: 'vehicle_type,category_code,station_code,planning_level' });
            if (error) throw error;
        }

        for (const stationCode of state.templateRemovedStations) {
            const { error: stationError } = await dbRef
                .from('kd2_process_stations')
                .update({ is_active: false })
                .eq('vehicle_type', vehicle)
                .eq('station_code', stationCode);
            if (stationError) throw stationError;

            const { error: routeError } = await dbRef
                .from('kd2_process_routes')
                .update({ is_active: false })
                .eq('vehicle_type', vehicle)
                .eq('station_code', stationCode);
            if (routeError) throw routeError;
        }

        await writeAudit('UPSERT', 'kd2_process_lead_times', vehicle || 'template', before, leadRows);
        await writeAudit('UPDATE', 'kd2_process_routes', vehicle || 'template', routeBefore, rows.map(row => ({
            station_code: row.station_code,
            route_sequence: row.route_sequence,
        })));
        state.templateRemovedStations.clear();
        await loadWorkspaceData();
        renderTemplateEditor();
        updatePlanCreateDurationFromStation(true);
        if (!silent) toast('KD2 template defaults saved.', 'success');
        return true;
    }

    async function openPlanCreateModal() {
        if (!canManageKD2()) {
            toast('Only planners and admins can add KD2 plan rows.', 'error');
            return;
        }
        try {
            if (!state.battalions.length || !state.stations.length) await loadWorkspaceData();
        } catch (error) {
            toast(`KD2 setup load failed: ${error.message}`, 'error');
            return;
        }
        if (!state.battalions.length) {
            toast('Create or bootstrap a KD2 battalion before adding plan blocks.', 'error');
            return;
        }

        const battalionSelect = document.getElementById('kd2PlanCreateBattalion');
        const currentBattalion = getBattalionFilterValue();
        battalionSelect.innerHTML = state.battalions.map(row => `
            <option value="${row.id}">${escapeHtml(row.battalion_code)}${row.battalion_name ? ` · ${escapeHtml(row.battalion_name)}` : ''}</option>
        `).join('');

        const filteredBattalion = state.battalions.find(row => row.battalion_code === currentBattalion);
        battalionSelect.value = String(filteredBattalion?.id || state.battalions[0].id);
        state.templateRemovedStations.clear();
        state.templateNewRowCounter = 0;
        const defaultDate = document.getElementById('kd2TimelineStart')?.value || localDateStr(new Date());
        const defaultVehicle = getVehicleFilterValue() || state.timelinePlacementVehicle || 'K9';
        document.getElementById('kd2PlanCreateVehicle').value = defaultVehicle;
        setTimelinePlacementVehicle(defaultVehicle);
        document.getElementById('kd2PlanCreateStart').value = defaultDate;
        document.getElementById('kd2PlanCreateEnd').value = defaultDate;
        document.getElementById('kd2PlanCreateDuration').value = '';
        document.getElementById('kd2PlanCreateRemark').value = '';
        populatePlanCreateStations();
        populatePlanCreateUnits();
        if (selectedCreateStation()?.station_code) {
            state.timelinePlacementStationCode = selectedCreateStation().station_code;
        } else if (!state.timelinePlacementStationCode) {
            state.timelinePlacementStationCode = firstPlacementStation(defaultVehicle)?.station_code || '';
        }
        setPlanCreateMode('block');
        setPlanCreateError('');
        syncTimelinePlacementUi();
        document.getElementById('kd2PlanCreateOverlay').style.display = 'flex';
    }

    function setPlanningError(message) {
        const el = document.getElementById('kd2PlanningError');
        if (!el) return;
        el.textContent = message;
        el.style.display = message ? 'flex' : 'none';
    }

    function resetPlanningModal() {
        document.getElementById('kd2BattalionId').value = '';
        document.getElementById('kd2BattalionCode').value = '';
        document.getElementById('kd2BattalionName').value = '';
        document.getElementById('kd2BattalionDeadline').value = '';
        document.getElementById('kd2BattalionNotes').value = '';
        VEHICLES.forEach(vehicle => {
            document.getElementById(`kd2Qty${vehicle}`).value = '';
            document.getElementById(`kd2Deadline${vehicle}`).value = '';
            document.getElementById(`kd2Status${vehicle}`).value = 'pending';
            document.getElementById(`kd2SkipFriday${vehicle}`).checked = true;
        });
        setPlanningError('');
    }

    function openPlanningModal(battalionId = null) {
        if (!canManageKD2()) {
            toast('Only planners and admins can manage KD2 planning inputs.', 'error');
            return;
        }

        resetPlanningModal();
        if (battalionId) {
            const battalion = state.battalions.find(row => row.id === battalionId);
            if (battalion) {
                document.getElementById('kd2BattalionId').value = battalion.id;
                document.getElementById('kd2BattalionCode').value = battalion.battalion_code || '';
                document.getElementById('kd2BattalionName').value = battalion.battalion_name || '';
                document.getElementById('kd2BattalionDeadline').value = battalion.delivery_deadline || '';
                document.getElementById('kd2BattalionNotes').value = battalion.notes || '';
            }

            VEHICLES.forEach(vehicle => {
                const input = inputFor(battalionId, vehicle);
                if (!input) return;
                document.getElementById(`kd2Qty${vehicle}`).value = input.required_quantity ?? '';
                document.getElementById(`kd2Deadline${vehicle}`).value = input.delivery_deadline || '';
                document.getElementById(`kd2Status${vehicle}`).value = input.assumptions_status || 'pending';
                document.getElementById(`kd2SkipFriday${vehicle}`).checked = input.skip_friday !== false;
            });
        }

        document.getElementById('kd2PlanningOverlay').style.display = 'flex';
    }

    function closePlanningModal() {
        document.getElementById('kd2PlanningOverlay').style.display = 'none';
    }

    async function savePlanningInputs() {
        if (!dbRef) return;
        if (!canManageKD2()) {
            toast('Only planners and admins can manage KD2 planning inputs.', 'error');
            return;
        }

        const battalionId = document.getElementById('kd2BattalionId').value;
        const battalionCode = document.getElementById('kd2BattalionCode').value.trim();
        const battalionName = document.getElementById('kd2BattalionName').value.trim();
        const battalionDeadline = document.getElementById('kd2BattalionDeadline').value || null;
        const battalionNotes = document.getElementById('kd2BattalionNotes').value.trim();

        if (!battalionCode) {
            setPlanningError('Battalion code is required.');
            return;
        }

        try {
            const existingBattalion = battalionId
                ? state.battalions.find(row => String(row.id) === String(battalionId)) || null
                : null;
            const existingInputs = battalionId
                ? VEHICLES.map(vehicle => inputFor(parseInt(battalionId, 10), vehicle)).filter(Boolean)
                : [];
            let battalion;
            if (battalionId) {
                const { data, error } = await dbRef
                    .from('kd2_battalions')
                    .update({
                        battalion_code: battalionCode,
                        battalion_name: battalionName || null,
                        delivery_deadline: battalionDeadline,
                        notes: battalionNotes || null,
                    })
                    .eq('id', battalionId)
                    .select()
                    .single();
                if (error) throw error;
                battalion = data;
            } else {
                const { data, error } = await dbRef
                    .from('kd2_battalions')
                    .insert({
                        battalion_code: battalionCode,
                        battalion_name: battalionName || null,
                        delivery_deadline: battalionDeadline,
                        notes: battalionNotes || null,
                    })
                    .select()
                    .single();
                if (error) throw error;
                battalion = data;
            }

            const inputRows = VEHICLES.map(vehicle => {
                const qtyRaw = document.getElementById(`kd2Qty${vehicle}`).value.trim();
                return {
                    battalion_id: battalion.id,
                    vehicle_type: vehicle,
                    required_quantity: qtyRaw === '' ? null : parseInt(qtyRaw, 10),
                    delivery_deadline: document.getElementById(`kd2Deadline${vehicle}`).value || null,
                    skip_friday: document.getElementById(`kd2SkipFriday${vehicle}`).checked,
                    include_saturday: KD2_SATURDAY_WORKING,
                    assumptions_status: document.getElementById(`kd2Status${vehicle}`).value,
                    notes: null,
                };
            });

            const { error: upsertError } = await dbRef
                .from('kd2_planning_inputs')
                .upsert(inputRows, { onConflict: 'battalion_id,vehicle_type' });
            if (upsertError) throw upsertError;

            await writeAudit(
                battalionId ? 'UPDATE' : 'CREATE',
                'kd2_battalions',
                battalion.id,
                existingBattalion,
                battalion
            );
            await writeAudit(
                'UPSERT',
                'kd2_planning_inputs',
                battalion.id,
                existingInputs,
                inputRows
            );

            toast('KD2 planning inputs saved.', 'success');
            closePlanningModal();
            await refreshWorkspace();
            await helpers.reloadAll?.();
        } catch (error) {
            setPlanningError(error.message);
        }
    }

    function buildUnitsForVehicle(battalionId, vehicleType, quantity, unitRows) {
        const map = new Map(
            unitRows
                .filter(row => row.battalion_id === battalionId && row.vehicle_type === vehicleType)
                .map(row => [row.unit_serial, row])
        );
        const units = [];
        for (let i = 1; i <= quantity; i += 1) {
            const unit = map.get(i);
            units.push({ unit_serial: i, unit_label: unit?.unit_label || null });
        }
        return units;
    }

    function routeItemsForVehicle(vehicle) {
        return state.routes
            .filter(row => row.vehicle_type === vehicle && stationCodeMatchesVehicle(vehicle, row.station_code))
            .sort((a, b) =>
                (parseInt(a.route_sequence, 10) || 9999) - (parseInt(b.route_sequence, 10) || 9999) ||
                String(a.station_code || '').localeCompare(String(b.station_code || ''))
            )
            .map(route => ({
                route,
                station: state.stations.find(item =>
                    item.vehicle_type === vehicle &&
                    item.station_code === route.station_code &&
                    stationAllowedForVehicle(item)
                ),
                category: state.categories.find(item => item.vehicle_type === vehicle && item.category_code === route.category_code),
            }))
            .filter(item => item.station && item.category);
    }

    function groupRouteItems(routeItems) {
        const groups = [];
        routeItems.forEach(item => {
            const sequence = parseInt(item.route.route_sequence, 10) || 9999;
            let group = groups.find(row => row.sequence === sequence);
            if (!group) {
                group = { sequence, items: [] };
                groups.push(group);
            }
            group.items.push(item);
        });
        groups.forEach(group => group.items.sort((a, b) =>
            (parseInt(a.station?.station_sequence_in_category, 10) || 9999) -
            (parseInt(b.station?.station_sequence_in_category, 10) || 9999) ||
            String(a.station?.station_name || '').localeCompare(String(b.station?.station_name || ''))
        ));
        return groups.sort((a, b) => a.sequence - b.sequence);
    }

    function planningRulesFor(battalionId, vehicle) {
        return planningRulesForOffDates(battalionId, vehicle, state.nonWorkDaySet);
    }

    function planningRulesForOffDates(battalionId, vehicle, offDates) {
        const input = inputFor(battalionId, vehicle);
        return withWorkingRules({
            skipFriday: input?.skip_friday !== false,
            includeSaturday: KD2_SATURDAY_WORKING,
            offDates,
        });
    }

    function workingRulesForPlanRow(row) {
        return planningRulesFor(row?.battalion_id, row?.vehicle || row?.vehicle_type);
    }

    function shiftPlanRowToStart(row, startDateStr) {
        const rules = workingRulesForPlanRow(row);
        const duration = Math.max(durationFromPlannedWindow(row?.start_date, row?.end_date, rules), 1);
        return buildForwardWindow(startDateStr, duration, rules);
    }

    function getGanttSpecialZones(startDate = '', endDate = '') {
        return getNonWorkDayGroups()
            .filter(group => !startDate || !endDate || (group.start <= endDate && group.end >= startDate))
            .map(group => ({
                start: group.start,
                end: group.end,
                type: 'holiday',
                label: group.label || 'No-work Day',
            }));
    }

    function planLaneKey(row) {
        return [row?.battalion_id ?? '', row?.vehicle_type ?? '', row?.unit_serial ?? ''].join('||');
    }

    function routeSequenceValue(row) {
        return parseInt(row?.route_sequence, 10) || 9999;
    }

    function stationSequenceValue(row) {
        return parseInt(row?.station_sequence_in_category, 10) || 9999;
    }

    function comparePlanRowsByLaneOrder(a, b) {
        return routeSequenceValue(a) - routeSequenceValue(b) ||
            stationSequenceValue(a) - stationSequenceValue(b) ||
            String(a.station_code || '').localeCompare(String(b.station_code || '')) ||
            String(a.planned_start_date || a.start_date || '').localeCompare(String(b.planned_start_date || b.start_date || '')) ||
            (a.id || 0) - (b.id || 0);
    }

    function sortPlanRowsForRecalc(rows = []) {
        return rows.slice().sort(comparePlanRowsByLaneOrder);
    }

    function getPlanMoveRowsFromAnchor(anchorRow, rows = []) {
        if (!anchorRow) return [];
        const laneRows = sortPlanRowsForRecalc(rows.filter(row => planLaneKey(row) === planLaneKey(anchorRow)));
        if (!laneRows.length) return [];
        const anchor = laneRows.find(row => row.id === anchorRow.id);
        if (!anchor) return [];
        const anchorRouteSequence = routeSequenceValue(anchor);
        return laneRows.filter(row => routeSequenceValue(row) >= anchorRouteSequence);
    }

    async function recalculatePlanWindowsForNonWorkDayChange(previousOffDates, nextOffDates, auditLabel) {
        if (!dbRef) return 0;
        const { data: planRows, error } = await dbRef
            .from('kd2_plan')
            .select('id, battalion_id, vehicle_type, unit_serial, unit_label, route_sequence, station_sequence_in_category, station_code, planned_start_date, planned_end_date, schedule_week')
            .order('battalion_id')
            .order('vehicle_type')
            .order('unit_serial')
            .order('route_sequence')
            .order('station_sequence_in_category');
        if (error) throw error;
        if (!planRows?.length) return 0;

        const lanes = new Map();
        planRows.forEach(row => {
            const key = planLaneKey(row);
            if (!lanes.has(key)) lanes.set(key, []);
            lanes.get(key).push(row);
        });

        const changes = [];
        lanes.forEach(laneRows => {
            const orderedRows = sortPlanRowsForRecalc(laneRows);
            const groups = [];
            orderedRows.forEach(row => {
                const routeSequence = parseInt(row.route_sequence, 10) || 9999;
                let group = groups.find(item => item.routeSequence === routeSequence);
                if (!group) {
                    group = { routeSequence, rows: [] };
                    groups.push(group);
                }
                group.rows.push(row);
            });
            if (!groups.length) return;

            let currentStart = minDateStr(groups[0].rows.map(row => row.planned_start_date));
            groups.forEach(group => {
                const groupEnds = [];
                group.rows.forEach(row => {
                    const oldRules = planningRulesForOffDates(row.battalion_id, row.vehicle_type, previousOffDates);
                    const newRules = planningRulesForOffDates(row.battalion_id, row.vehicle_type, nextOffDates);
                    const duration = Math.max(durationFromPlannedWindow(row.planned_start_date, row.planned_end_date, oldRules), 1);
                    const window = buildForwardWindow(currentStart, duration, newRules);
                    if (window.start !== row.planned_start_date || window.end !== row.planned_end_date) {
                        changes.push({
                            id: row.id,
                            stationCode: row.station_code,
                            oldBattalionId: row.battalion_id,
                            oldVehicleType: row.vehicle_type,
                            oldUnitSerial: row.unit_serial,
                            oldUnitLabel: row.unit_label || null,
                            oldStart: row.planned_start_date,
                            oldEnd: row.planned_end_date,
                            newBattalionId: row.battalion_id,
                            newVehicleType: row.vehicle_type,
                            newUnitSerial: row.unit_serial,
                            newUnitLabel: row.unit_label || null,
                            newStart: window.start,
                            newEnd: window.end,
                        });
                    }
                    groupEnds.push(window.end);
                });
                if (groupEnds.length) {
                    const nextStartRules = planningRulesForOffDates(group.rows[0].battalion_id, group.rows[0].vehicle_type, nextOffDates);
                    currentStart = nextWorkingDate(maxDateStr(groupEnds), nextStartRules);
                }
            });
        });

        if (!changes.length) return 0;
        await persistTimelineChanges(changes, auditLabel || 'kd2-non-work-day-recalc');
        return changes.length;
    }

    function resolveLeadTime(vehicleType, categoryCode, stationCode) {
        const stationLead = state.leadTimes.find(row =>
            row.vehicle_type === vehicleType &&
            row.planning_level === 'station' &&
            row.station_code === stationCode &&
            row.lead_time_days !== null
        );
        if (stationLead) {
            const value = Math.ceil(Number(stationLead.lead_time_days));
            return Number.isFinite(value) && value > 0 ? value : null;
        }

        const categoryLead = state.leadTimes.find(row =>
            row.vehicle_type === vehicleType &&
            row.planning_level === 'category' &&
            row.category_code === categoryCode &&
            row.lead_time_days !== null
        );
        if (!categoryLead) return null;
        const value = Math.ceil(Number(categoryLead.lead_time_days));
        return Number.isFinite(value) && value > 0 ? value : null;
    }

    async function generatePlan() {
        if (!dbRef) return;
        if (!canManageKD2()) {
            toast('Only planners and admins can generate KD2 plans.', 'error');
            return;
        }

        const battalionCode = getBattalionFilterValue();
        if (!battalionCode) {
            toast('Select a KD2 battalion filter before generating a plan.', 'error');
            return;
        }

        try {
            await loadWorkspaceData();
            const battalion = state.battalions.find(row => row.battalion_code === battalionCode);
            if (!battalion) {
                toast('Selected battalion was not found.', 'error');
                return;
            }

            const { data: existingPlans, error: existingError } = await dbRef
                .from('kd2_plan')
                .select('id')
                .eq('battalion_id', battalion.id);
            if (existingError) throw existingError;
            if ((existingPlans || []).length && !window.confirm(`Replace existing KD2 plan rows for ${battalionCode}?`)) return;

            const { data: unitRows, error: unitError } = await dbRef
                .from('kd2_vehicle_units')
                .select('*')
                .eq('battalion_id', battalion.id);
            if (unitError) throw unitError;

            const planRows = [];
            const issues = [];

            for (const vehicle of VEHICLES) {
                const planningInput = inputFor(battalion.id, vehicle);
                const quantity = planningInput?.required_quantity;
                if (!quantity || quantity <= 0) continue;

                const deadline = planningInput.delivery_deadline || battalion.delivery_deadline;
                if (!deadline) {
                    issues.push(`${vehicle}: missing deadline`);
                    continue;
                }

                const rules = planningRulesFor(battalion.id, vehicle);
                const routeRows = routeItemsForVehicle(vehicle);
                const routeGroups = groupRouteItems(routeRows);

                if (!routeRows.length) {
                    issues.push(`${vehicle}: route definition missing`);
                    continue;
                }

                const missingLead = routeRows.find(item => !resolveLeadTime(vehicle, item.route.category_code, item.route.station_code));
                if (missingLead) {
                    issues.push(`${vehicle}: missing lead time for ${missingLead.station?.station_name || missingLead.route.station_code}`);
                    continue;
                }

                const units = buildUnitsForVehicle(battalion.id, vehicle, quantity, unitRows || []);
                units.forEach(unit => {
                    let currentEnd = deadline;
                    const reversed = [];
                    for (let i = routeGroups.length - 1; i >= 0; i -= 1) {
                        const group = routeGroups[i];
                        const groupRows = [];
                        for (const item of group.items) {
                            const duration = resolveLeadTime(vehicle, item.route.category_code, item.route.station_code);
                            if (!duration) {
                                issues.push(`${vehicle}: invalid lead time for ${item.station?.station_name || item.route.station_code}`);
                                groupRows.length = 0;
                                break;
                            }
                            const window = buildBackwardWindow(currentEnd, duration, rules);
                            if (!window.start || !window.end || window.start > window.end) {
                                issues.push(`${vehicle}: invalid planning window for ${item.station?.station_name || item.route.station_code}`);
                                groupRows.length = 0;
                                break;
                            }
                            groupRows.push({
                                battalion_id: battalion.id,
                                vehicle_type: vehicle,
                                unit_serial: unit.unit_serial,
                                unit_label: unit.unit_label,
                                category_code: item.route.category_code,
                                station_code: item.route.station_code,
                                category_sequence: item.category?.category_sequence || item.route.route_sequence,
                                station_sequence_in_category: item.station?.station_sequence_in_category || 1,
                                route_sequence: item.route.route_sequence,
                                schedule_week: weekLabel(window.start),
                                planned_start_date: window.start,
                                planned_end_date: window.end,
                                planning_source: 'generated',
                                remark: null,
                            });
                        }
                        if (groupRows.length !== group.items.length) {
                            reversed.length = 0;
                            break;
                        }
                        reversed.push(...groupRows);
                        currentEnd = previousWorkingDate(minDateStr(groupRows.map(row => row.planned_start_date)), rules);
                    }
                    if (reversed.length === routeRows.length) planRows.push(...reversed.reverse());
                });
            }

            if (!planRows.length) {
                const message = issues.length ? `Generation blocked: ${issues.join(' | ')}` : 'No valid planning inputs were found for the selected battalion.';
                setText('kd2GenerationResult', message);
                toast(message, 'error');
                return;
            }

            await dbRef.from('kd2_plan').delete().eq('battalion_id', battalion.id);
            for (const batch of chunk(planRows, 500)) {
                const { error } = await dbRef.from('kd2_plan').insert(batch);
                if (error) throw error;
            }

            const result = issues.length
                ? `Generated ${planRows.length} plan rows. Pending items: ${issues.join(' | ')}`
                : `Generated ${planRows.length} plan rows for ${battalionCode}.`;
            await writeAudit('GENERATE', 'kd2_plan', battalion.id, { battalion_code: battalionCode }, {
                battalion_code: battalionCode,
                generated_rows: planRows.length,
                pending_items: issues,
            });
            setText('kd2GenerationResult', result);
            toast(`KD2 plan generated for ${battalionCode}.`, 'success');
            await helpers.reloadAll?.();
            await refreshWorkspace();
        } catch (error) {
            setText('kd2GenerationResult', `Generation failed: ${error.message}`);
            toast(`KD2 generation failed: ${error.message}`, 'error');
        }
    }

    async function bootstrapBattalions() {
        if (!dbRef) return;
        if (!canManageKD2()) {
            toast('Only planners and admins can bootstrap KD2 battalions.', 'error');
            return;
        }

        try {
            await loadWorkspaceData();
            const existingCodes = new Set(state.battalions.map(row => row.battalion_code));
            const baseline = Array.from({ length: 5 }, (_, index) => ({
                battalion_code: `BTL-${String(index + 1).padStart(2, '0')}`,
                battalion_name: `Battalion ${index + 1}`,
                delivery_deadline: null,
                notes: 'Bootstrap baseline shell',
            }));
            const missing = baseline.filter(row => !existingCodes.has(row.battalion_code));
            if (!missing.length) {
                toast('The default 5 battalion baseline already exists.', 'info');
                return;
            }

            const { data: insertedBattalions, error: battalionError } = await dbRef
                .from('kd2_battalions')
                .insert(missing)
                .select('*');
            if (battalionError) throw battalionError;

            const planningRows = (insertedBattalions || []).flatMap(battalion => VEHICLES.map(vehicle => ({
                battalion_id: battalion.id,
                vehicle_type: vehicle,
                required_quantity: null,
                delivery_deadline: null,
                skip_friday: true,
                include_saturday: KD2_SATURDAY_WORKING,
                assumptions_status: 'pending',
                notes: 'Bootstrap baseline shell',
            })));
            if (planningRows.length) {
                const { error: planningError } = await dbRef
                    .from('kd2_planning_inputs')
                    .upsert(planningRows, { onConflict: 'battalion_id,vehicle_type' });
                if (planningError) throw planningError;
            }

            await writeAudit('BOOTSTRAP', 'kd2_battalions', 'baseline-5', null, {
                battalions: missing.map(row => row.battalion_code),
                planning_rows: planningRows.length,
            });

            toast(`Bootstrapped ${missing.length} battalion shells.`, 'success');
            await refreshWorkspace();
            await helpers.reloadAll?.();
        } catch (error) {
            toast(`KD2 bootstrap failed: ${error.message}`, 'error');
        }
    }

    async function savePlanEdit() {
        if (!dbRef) return;
        if (!canManageKD2()) {
            toast('Only planners and admins can edit KD2 plan rows.', 'error');
            return;
        }

        const id = parseInt(document.getElementById('kd2PlanEditId').value, 10);
        const plannedStart = document.getElementById('kd2PlanEditStart').value;
        const plannedEnd = document.getElementById('kd2PlanEditEnd').value;
        const remark = document.getElementById('kd2PlanEditRemark').value.trim();
        if (!id) {
            setPlanEditError('KD2 plan row is missing.');
            return;
        }
        if (!plannedStart || !plannedEnd) {
            setPlanEditError('Both planned start and planned end are required.');
            return;
        }
        if (plannedStart > plannedEnd) {
            setPlanEditError('Planned end must be on or after planned start.');
            return;
        }

        const before = state.timelineRows.find(row => row.id === id) || null;
        try {
            const rules = planningRulesFor(before?.battalion_id, before?.vehicle);
            const duration = Math.max(durationFromPlannedWindow(plannedStart, plannedEnd, rules), 1);
            const normalizedWindow = buildForwardWindow(plannedStart, duration, rules);
            const payload = {
                planned_start_date: normalizedWindow.start,
                planned_end_date: normalizedWindow.end,
                schedule_week: weekLabel(normalizedWindow.start),
                remark: remark || null,
            };
            const { data, error } = await dbRef
                .from('kd2_plan')
                .update(payload)
                .eq('id', id)
                .select('*')
                .single();
            if (error) throw error;

            await writeAudit('UPDATE', 'kd2_plan', id, before, data);
            closePlanEdit();
            toast('KD2 plan block updated.', 'success');
            await helpers.reloadAll?.();
        } catch (error) {
            setPlanEditError(error.message);
        }
    }

    async function savePlanCreateTemplate() {
        const battalionId = parseInt(document.getElementById('kd2PlanCreateBattalion').value, 10);
        const vehicle = document.getElementById('kd2PlanCreateVehicle').value;
        const unitSelect = document.getElementById('kd2PlanCreateUnit');
        const unitSerial = parseInt(unitSelect.value, 10);
        const selectedUnitLabel = unitSelect.selectedOptions[0]?.dataset.unitLabel || '';
        const startDate = document.getElementById('kd2PlanCreateStart').value;

        if (!battalionId || !vehicle || !unitSerial || !startDate) {
            setPlanCreateError('Battalion, vehicle, unit, and planned start are required for a template.');
            return;
        }

        const battalion = state.battalions.find(row => row.id === battalionId);
        if (!battalion) {
            setPlanCreateError('Selected battalion was not found.');
            return;
        }

        try {
            const saved = await saveTemplateDefaults({ silent: true });
            if (!saved) return;

            const routeRows = templateRowsForVehicle(vehicle);
            const routeGroups = groupRouteItems(routeRows);
            if (!routeRows.length) {
                setPlanCreateError('The selected vehicle has no route template.');
                return;
            }
            const missingDuration = routeRows.find(item => !item.duration);
            if (missingDuration) {
                setPlanCreateError(`Missing duration for ${missingDuration.station?.station_name || missingDuration.route.station_code}.`);
                return;
            }

            const stationCodes = routeRows.map(item => item.route.station_code);
            const { data: duplicateRows, error: duplicateError } = await dbRef
                .from('kd2_plan')
                .select('station_code')
                .eq('battalion_id', battalion.id)
                .eq('vehicle_type', vehicle)
                .eq('unit_serial', unitSerial)
                .in('station_code', stationCodes);
            if (duplicateError) throw duplicateError;
            if ((duplicateRows || []).length) {
                setPlanCreateError(`This unit already has ${duplicateRows.length} template station block(s). Delete or edit existing blocks first.`);
                return;
            }

            const rules = planningRulesFor(battalionId, vehicle);
            let currentStart = localDateStr(normalizeWorkingDateForward(startDate, rules));
            const planRows = [];
            routeGroups.forEach(group => {
                const groupRows = group.items.map(item => {
                    const window = buildForwardWindow(currentStart, item.duration, rules);
                    return {
                        battalion_id: battalion.id,
                        vehicle_type: vehicle,
                        unit_serial: unitSerial,
                        unit_label: selectedUnitLabel || null,
                        category_code: item.route.category_code,
                        station_code: item.route.station_code,
                        category_sequence: item.category.category_sequence,
                        station_sequence_in_category: item.station.station_sequence_in_category,
                        route_sequence: item.route.route_sequence,
                        schedule_week: weekLabel(window.start),
                        planned_start_date: window.start,
                        planned_end_date: window.end,
                        planning_source: 'manual',
                        remark: 'Template',
                    };
                });
                planRows.push(...groupRows);
                currentStart = nextWorkingDate(maxDateStr(groupRows.map(row => row.planned_end_date)), rules);
            });

            const { data, error } = await dbRef
                .from('kd2_plan')
                .insert(planRows)
                .select('*');
            if (error) throw error;

            await writeAudit('INSERT', 'kd2_plan', `${vehicle}-template`, null, data || planRows);
            const undoPayloads = planRows.map(row => ({ ...row }));
            const undoAction = {
                label: `template add (${vehicle})`,
                insertedIds: (data || []).map(row => row.id).filter(Boolean),
                async undo() {
                    if (!this.insertedIds.length) return;
                    const { error: deleteError } = await dbRef
                        .from('kd2_plan')
                        .delete()
                        .in('id', this.insertedIds);
                    if (deleteError) throw deleteError;
                    await writeAudit('DELETE', 'kd2_plan', `${vehicle}-template-undo`, { ids: this.insertedIds }, null);
                },
                async redo() {
                    const { data: redone, error: redoError } = await dbRef
                        .from('kd2_plan')
                        .insert(undoPayloads)
                        .select('*');
                    if (redoError) throw redoError;
                    this.insertedIds = (redone || []).map(row => row.id).filter(Boolean);
                    await writeAudit('INSERT', 'kd2_plan', `${vehicle}-template-redo`, null, redone || undoPayloads);
                },
            };
            window.__ppmsShared?.registerGanttUndoAction?.(undoAction);
            closePlanCreateModal();
            toast(`KD2 ${vehicle} template added to plan.`, 'success');
            await helpers.reloadAll?.();
        } catch (error) {
            setPlanCreateError(error.message);
        }
    }

    async function savePlanCreate() {
        if (!dbRef) return;
        if (!canManageKD2()) {
            toast('Only planners and admins can add KD2 plan rows.', 'error');
            return;
        }
        if (currentPlanCreateMode() === 'template') {
            await savePlanCreateTemplate();
            return;
        }

        const battalionId = parseInt(document.getElementById('kd2PlanCreateBattalion').value, 10);
        const vehicle = document.getElementById('kd2PlanCreateVehicle').value;
        const unitSelect = document.getElementById('kd2PlanCreateUnit');
        const unitSerial = parseInt(unitSelect.value, 10);
        const selectedUnitLabel = unitSelect.selectedOptions[0]?.dataset.unitLabel || '';
        const startDate = document.getElementById('kd2PlanCreateStart').value;
        const duration = parseInt(document.getElementById('kd2PlanCreateDuration').value || '', 10);
        const remark = document.getElementById('kd2PlanCreateRemark').value.trim();
        const station = selectedCreateStation();

        if (!battalionId || !vehicle || !station || !startDate || !duration || duration < 1 || !unitSerial) {
            setPlanCreateError('Battalion, vehicle, unit, station, planned start, and a valid duration are required.');
            return;
        }

        try {
            await createPlanBlock({
                battalionId,
                vehicle,
                unitSerial,
                unitLabel: selectedUnitLabel || null,
                stationCode: station.station_code,
                startDate,
                duration,
                remark,
            });
            closePlanCreateModal();
            toast('KD2 plan block added.', 'success');
            await helpers.reloadAll?.();
        } catch (error) {
            setPlanCreateError(error.message);
        }
    }

    async function deletePlanBlock() {
        if (!dbRef) return;
        if (!canManageKD2()) {
            toast('Only planners and admins can delete KD2 plan rows.', 'error');
            return;
        }

        const id = parseInt(document.getElementById('kd2PlanEditId').value, 10);
        const before = state.timelineRows.find(row => row.id === id) || null;
        if (!id || !before) {
            setPlanEditError('KD2 plan row is missing from the current view.');
            return;
        }

        if (!window.confirm(`Delete "${before.process_station || before.station_name || 'plan block'}" for ${before.battalion_code || '—'} / ${before.vehicle || '—'} / ${before.vehicle_no || '—'}?`)) {
            return;
        }

        try {
            const { error } = await dbRef.from('kd2_plan').delete().eq('id', id);
            if (error) throw error;
            await writeAudit('DELETE', 'kd2_plan', id, before, null);
            closePlanEdit();
            toast('KD2 plan block deleted.', 'success');
            await helpers.reloadAll?.();
        } catch (error) {
            setPlanEditError(error.message);
        }
    }

    async function refreshWorkspace() {
        if (!isKD2() || !dbRef) return;
        try {
            await loadWorkspaceData();
            renderPlanningInputs();
            renderRouteFlow();
            if (document.getElementById('kd2LeadTimeOverlay')?.style.display === 'flex') renderLeadTimeEditor();
            if (document.getElementById('kd2NoWorkOverlay')?.style.display === 'flex') renderNoWorkDays();
            if (document.getElementById('kd2PlanCreateOverlay')?.style.display === 'flex') updatePlanCreateEndFromDuration();
            updateGenerationTarget();
            syncTimelinePlacementUi();
        } catch (error) {
            console.warn('KD2 workspace refresh skipped:', error.message);
        }
    }

    function wireEvents() {
        if (wired) return;
        wired = true;

        document.getElementById('moduleSelector')?.addEventListener('change', event => {
            setActiveModule(event.target.value);
            applyModuleShell();
            window.location.reload();
        });

        document.getElementById('filterBattalion')?.addEventListener('change', updateGenerationTarget);
        document.getElementById('btnKd2RefreshInputs')?.addEventListener('click', refreshWorkspace);
        document.getElementById('btnKd2Bootstrap')?.addEventListener('click', bootstrapBattalions);
        document.getElementById('btnKd2NewBattalion')?.addEventListener('click', () => openPlanningModal(null));
        document.getElementById('btnKd2GeneratePlan')?.addEventListener('click', generatePlan);
        document.getElementById('btnKd2ManageLeadTimes')?.addEventListener('click', openLeadTimeModal);
        document.getElementById('btnKd2AddBlock')?.addEventListener('click', () => openPlanCreateModal());
        document.getElementById('btnKd2VisualAdd')?.addEventListener('click', event => {
            event.stopPropagation();
            toggleTimelineVisualMenu();
        });
        document.getElementById('btnGanttVisualAdd')?.addEventListener('click', event => {
            event.stopPropagation();
            toggleTimelineVisualMenu();
        });
        document.getElementById('btnKd2TimelineRefresh')?.addEventListener('click', () => renderSchedule());
        document.getElementById('btnKd2TimelineEdit')?.addEventListener('click', () => setTimelineEditMode(true));
        document.getElementById('btnKd2TimelineEditDone')?.addEventListener('click', () => setTimelineEditMode(false));
        document.getElementById('btnKd2TimelineModeBlock')?.addEventListener('click', () => {
            setTimelineMoveMode('block');
            renderSchedule();
        });
        document.getElementById('btnKd2TimelineModeFromBlock')?.addEventListener('click', () => {
            setTimelineMoveMode('from-block');
            renderSchedule();
        });
        document.getElementById('btnKd2TimelineModeLane')?.addEventListener('click', () => {
            setTimelineMoveMode('lane');
            renderSchedule();
        });
        document.getElementById('btnKd2TimelineSelectLane')?.addEventListener('click', () => {
            setTimelineSelectLaneMode(!state.timelineSelectLaneMode);
        });
        document.getElementById('kd2TimelinePlacementVehicle')?.addEventListener('change', event => {
            setTimelinePlacementVehicle(event.target.value);
        });
        document.getElementById('ganttVisualPlacementVehicle')?.addEventListener('change', event => {
            setTimelinePlacementVehicle(event.target.value);
        });
        document.getElementById('btnKd2TimelinePlacementCancel')?.addEventListener('click', () => {
            cancelTimelinePlacement();
        });
        document.getElementById('btnGanttVisualPlacementCancel')?.addEventListener('click', () => {
            cancelTimelinePlacement();
        });
        document.getElementById('btnKd2NoWorkDays')?.addEventListener('click', openNoWorkModal);
        document.getElementById('btnKd2DownloadTemplate')?.addEventListener('click', downloadKd2Template);
        document.getElementById('btnKd2UploadPlan')?.addEventListener('click', () => {
            const panel = document.getElementById('kd2ImportPanel');
            if (!panel) return;
            if (panel.style.display === 'none' || window.getComputedStyle(panel).display === 'none') openKd2ImportPanel();
            else closeKd2ImportPanel();
        });
        document.getElementById('btnKd2ImportSubmit')?.addEventListener('click', importKd2PlanFile);
        document.getElementById('btnKd2ImportCancel')?.addEventListener('click', closeKd2ImportPanel);

        document.getElementById('kd2PlanningClose')?.addEventListener('click', closePlanningModal);
        document.getElementById('btnKd2PlanningCancel')?.addEventListener('click', closePlanningModal);
        document.getElementById('btnKd2PlanningSave')?.addEventListener('click', savePlanningInputs);
        document.getElementById('kd2PlanningOverlay')?.addEventListener('click', function (e) {
            if (e.target === this) closePlanningModal();
        });
        document.getElementById('kd2PlanEditClose')?.addEventListener('click', closePlanEdit);
        document.getElementById('btnKd2PlanEditCancel')?.addEventListener('click', closePlanEdit);
        document.getElementById('btnKd2PlanEditSave')?.addEventListener('click', savePlanEdit);
        document.getElementById('btnKd2PlanDelete')?.addEventListener('click', deletePlanBlock);
        document.getElementById('kd2PlanEditOverlay')?.addEventListener('click', function (e) {
            if (e.target === this) closePlanEdit();
        });
        document.getElementById('kd2NoWorkClose')?.addEventListener('click', closeNoWorkModal);
        document.getElementById('btnKd2NoWorkDone')?.addEventListener('click', closeNoWorkModal);
        document.getElementById('btnKd2NoWorkAdd')?.addEventListener('click', addNoWorkDay);
        document.getElementById('btnKd2NoWorkCancelEdit')?.addEventListener('click', resetNoWorkForm);
        document.getElementById('kd2NoWorkOverlay')?.addEventListener('click', function (e) {
            if (e.target === this) closeNoWorkModal();
        });
        document.getElementById('kd2PlanCreateClose')?.addEventListener('click', closePlanCreateModal);
        document.getElementById('btnKd2PlanCreateCancel')?.addEventListener('click', closePlanCreateModal);
        document.getElementById('btnKd2PlanCreateSave')?.addEventListener('click', savePlanCreate);
        document.getElementById('kd2PlanCreateOverlay')?.addEventListener('click', function (e) {
            if (e.target === this) closePlanCreateModal();
        });
        document.getElementById('kd2PlanCreateBattalion')?.addEventListener('change', () => {
            populatePlanCreateUnits();
            updatePlanCreateEndFromDuration();
        });
        document.getElementById('kd2PlanCreateVehicle')?.addEventListener('change', () => {
            setTimelinePlacementVehicle(document.getElementById('kd2PlanCreateVehicle').value || 'K9');
            state.templateRemovedStations.clear();
            state.templateNewRowCounter = 0;
            populatePlanCreateStations();
            populatePlanCreateUnits();
            if (currentPlanCreateMode() === 'template') renderTemplateEditor();
            else updatePlanCreateDurationFromStation(true);
        });
        document.getElementById('kd2PlanCreateStation')?.addEventListener('change', () => {
            const station = selectedCreateStation();
            if (station) setTimelinePlacementStation(station.station_code, station.vehicle_type);
            updatePlanCreateCategory();
            updatePlanCreateDurationFromStation(true);
        });
        document.getElementById('kd2PlanCreateStart')?.addEventListener('change', updatePlanCreateEndFromDuration);
        document.getElementById('kd2PlanCreateDuration')?.addEventListener('input', updatePlanCreateEndFromDuration);
        document.getElementById('kd2PlanCreateModeToggle')?.addEventListener('click', e => {
            const btn = e.target.closest('.kd2-create-mode-btn');
            if (!btn) return;
            setPlanCreateMode(btn.dataset.mode);
        });
        document.getElementById('btnKd2TemplateSave')?.addEventListener('click', async () => {
            try {
                await saveTemplateDefaults();
            } catch (error) {
                setPlanCreateError(error.message);
            }
        });
        document.getElementById('btnKd2TemplateAddBlock')?.addEventListener('click', addTemplateDraftRow);
        document.getElementById('kd2TemplateEditor')?.addEventListener('click', e => {
            const removeExisting = e.target.closest('[data-kd2-template-remove]');
            if (removeExisting) {
                state.templateRemovedStations.add(removeExisting.dataset.kd2TemplateRemove);
                removeExisting.closest('[data-kd2-template-row]')?.remove();
                return;
            }
            const removeDraft = e.target.closest('[data-kd2-template-remove-draft]');
            if (removeDraft) {
                removeDraft.closest('[data-kd2-template-draft]')?.remove();
            }
        });
        document.getElementById('kd2LeadTimeClose')?.addEventListener('click', closeLeadTimeModal);
        document.getElementById('btnKd2LeadTimeCancel')?.addEventListener('click', closeLeadTimeModal);
        document.getElementById('btnKd2LeadTimeSave')?.addEventListener('click', saveLeadTimes);
        document.getElementById('kd2LeadTimeOverlay')?.addEventListener('click', function (e) {
            if (e.target === this) closeLeadTimeModal();
        });

        document.querySelectorAll('.kd2-route-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                state.routeVehicle = btn.dataset.vehicle;
                document.querySelectorAll('.kd2-route-tab').forEach(item => item.classList.remove('kd2-route-tab-active'));
                btn.classList.add('kd2-route-tab-active');
                renderRouteFlow();
                if (document.getElementById('kd2LeadTimeOverlay')?.style.display === 'flex') renderLeadTimeEditor();
            });
        });
        document.addEventListener('click', event => {
            if (!state.timelinePlacementMenuOpen) return;
            if (event.target.closest('#kd2VisualAddShell') || event.target.closest('#ganttVisualAddShell') || event.target.closest('#ganttVisualPlacementBar')) return;
            const ganttPlacementBar = document.getElementById('ganttVisualPlacementBar');
            if (ganttPlacementBar && window.getComputedStyle(ganttPlacementBar).display !== 'none') return;
            setTimelinePlacementMenuOpen(false);
        });
    }

    function initialize(db, runtimeHelpers = {}) {
        dbRef = db;
        helpers = { ...helpers, ...runtimeHelpers };
        wireEvents();
        if (isKD2()) refreshWorkspace();
    }

    document.addEventListener('DOMContentLoaded', () => {
        applyModuleShell();
        wireEvents();
    });

    return {
        getActiveModule,
        getActiveConfig,
        isKD2,
        setActiveModule,
        getCategory,
        applyModuleShell,
        initialize,
        loadFilters,
        loadData,
        loadPlanningSnapshot,
        refreshWorkspace,
        renderSchedule,
        openPlanEdit,
        openPlanCreateModal,
        openNoWorkModal,
        toggleTimelineVisualMenu,
        shiftPlanRowToStart,
        getGanttSpecialZones,
        comparePlanRowsByLaneOrder,
        getPlanMoveRowsFromAnchor,
    };
})();
