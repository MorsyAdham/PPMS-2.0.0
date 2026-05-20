/* ================================================================
   KD1 Assembly Control System — app.js
   Production-ready vanilla JS + Supabase + Chart.js
   ================================================================ */

'use strict';

/* ──────────────────────────────────────────────────────────────────
   1. CONFIGURATION — Replace with your Supabase project credentials
   ────────────────────────────────────────────────────────────────── */
const SUPABASE_URL = "https://biqwfqkuhebxcfucangt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcXdmcWt1aGVieGNmdWNhbmd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzNzM5NzQsImV4cCI6MjA4MTk0OTk3NH0.QkASAl8yzXfxVq0b0FdkXHTOpblldr2prCnImpV8ml8";

/* ──────────────────────────────────────────────────────────────────
   2. AUTH — session helpers (must be at top so every function below
      can call them; SESSION_KEY is a const that must be initialised
      before getCurrentUser() runs for the first time)
   ────────────────────────────────────────────────────────────────── */
const SESSION_KEY = 'kd1_session';

function getCurrentUser() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function isMasterAdmin() { return getCurrentUser()?.role === 'master_admin'; }
function isAdmin() { return ['master_admin', 'admin'].includes(getCurrentUser()?.role); }
function isPlanner() { return ['master_admin', 'admin', 'planner'].includes(getCurrentUser()?.role); }
function canWrite() { return isAdmin(); }      // admin data edits (start/complete/notes)
function canEditPlan() { return isMasterAdmin() || getCurrentUser()?.role === 'planner'; }  // Gantt plan edits
function getCachedIP() { return getCurrentUser()?.ip || 'unknown'; }

async function sha256(str) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Write one entry to planning_audit_log.
 * Silently swallows errors so audit failures never break the UI.
 */
async function auditLog(action, table, recId, before, after) {
    const user = getCurrentUser();
    if (!user || !db) return;
    try {
        await db.from('planning_audit_log').insert({
            user_id: user.id,
            user_email: user.email,
            user_role: user.role,
            action,
            table_name: table,
            record_id: String(recId ?? ''),
            data_before: before ? JSON.parse(JSON.stringify(before)) : null,
            data_after: after ? JSON.parse(JSON.stringify(after)) : null,
            ip_address: getCachedIP(),
        });
    } catch (e) {
        console.warn('Audit log write failed (non-fatal):', e.message);
    }
}

window.__ppmsShared = {
    auditLog: (...args) => auditLog(...args),
    getCurrentUser,
    getCachedIP,
};

function populateNavbar() {
    const user = getCurrentUser();
    if (!user) return;

    const chip = document.getElementById('navUserChip');
    if (chip) chip.style.display = 'flex';

    const avatar = document.getElementById('navUserAvatar');
    if (avatar) avatar.textContent = (user.name || user.email).charAt(0).toUpperCase();

    const nameEl = document.getElementById('navUserName');
    if (nameEl) nameEl.textContent = user.name || user.email;

    const roleBadge = document.getElementById('navRoleBadge');
    if (roleBadge) {
        const labels = { master_admin: 'Master Admin', admin: 'Admin', planner: 'Planner', viewer: 'Viewer' };
        roleBadge.textContent = labels[user.role] || user.role;
        roleBadge.className = `nav-role-badge role-${user.role.replace('_', '-')}`;
    }

    const logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) logoutBtn.style.display = 'flex';

    if (isAdmin()) {
        const ucBtn = document.getElementById('btnUnitCodes');
        if (ucBtn) ucBtn.style.display = 'flex';
    }
    if (isMasterAdmin()) {
        const auditBtn = document.getElementById('btnAuditLog');
        if (auditBtn) auditBtn.style.display = 'flex';
        const umBtn = document.getElementById('btnUserMgmt');
        if (umBtn) umBtn.style.display = 'flex';
    }

    // Viewer: CSS disables all edit controls
    if (!canWrite()) document.body.classList.add('viewer-mode');
    // Hide Edit Plan button unless user can edit the schedule
    const btnEdit = document.getElementById('btnGanttEdit');
    if (btnEdit) btnEdit.style.display = canEditPlan() ? '' : 'none';
}

async function doLogout() {
    const user = getCurrentUser();
    if (user && db) {
        try {
            await db.from('planning_audit_log').insert({
                user_id: user.id,
                user_email: user.email,
                user_role: user.role,
                action: 'LOGOUT',
                ip_address: getCachedIP(),
            });
        } catch (e) { /* non-fatal */ }
    }
    sessionStorage.removeItem(SESSION_KEY);
    window.location.href = 'login.html';
}


/* ──────────────────────────────────────────────────────────────────
   STATION CODE LOOKUP
   Returns the station code (A01, A02, …) for a given
   process_station name + vehicle type.
   ────────────────────────────────────────────────────────────────── */
const _STATION_CODES = {
    'Suspension': 'A01',
    'Interior': 'A03',
    'Turret/Gun': 'A05/A11',
    'Hydraulic': 'A06',
    'Bore Sight': 'A07',
    'Turret': 'A08',
    'T/Electric (TURRET)': 'A09',
    'Hyd / Sub (TURRET)': 'A10',
    'Electric/Interior': 'A12',
    'Automation': 'A14',
    'Final Assembly': 'A15',
};

function getStationCode(station, vehicle) {
    if (_STATION_CODES[station]) return _STATION_CODES[station];
    const isK9 = /K9/i.test(String(vehicle || ''));
    // H/Electric → A02 (K9), Track → A02 (K10/K11)
    if (station === 'H/Electric') return isK9 ? 'A02' : '';
    if (station === 'Track') return isK9 ? '' : 'A02';
    // Engine → A04 (K9), A13 (K10/K11)
    if (station === 'Engine') return isK9 ? 'A04' : 'A13';
    return '';
}

/* ──────────────────────────────────────────────────────────────────
   CATEGORY MAP — process_station → category
   ────────────────────────────────────────────────────────────────── */
const CATEGORY_MAP = {
    // Assembly
    'Suspension': 'Assembly',
    'Turret': 'Assembly',
    'T/Electric (TURRET)': 'Assembly',
    'Hyd / Sub (TURRET)': 'Assembly',
    'H/Electric': 'Assembly',
    'Interior': 'Assembly',
    'Engine': 'Assembly',
    'Turret/Gun': 'Assembly',
    'Hydraulic': 'Assembly',
    'Bore Sight': 'Assembly',
    'Track': 'Assembly',
    'Electric/Interior': 'Assembly',
    'Automation': 'Assembly',
    'Final Assembly': 'Assembly',
    // Final Test
    '#1Insp': 'Final Test',
    'TEST RUN': 'Final Test',
    'Performance test': 'Final Test',
    'REPAIR': 'Final Test',
    'CHECK': 'Final Test',
    'Powerpack check': 'Final Test',
    'Final Check': 'Final Test',
    // Processing
    'Processing': 'Processing',
    'Clean/dry': 'Processing',
    'Masking': 'Processing',
    'Sanding': 'Processing',
    'Painting': 'Processing',
    'Touch-up': 'Processing',
    'Attaching': 'Processing',
};

/* Station default durations (working days) */
const STATION_DEFAULTS = {
    // Assembly (2 days each)
    'Suspension': 2,
    'Turret': 2,
    'T/Electric (TURRET)': 2,
    'Hyd / Sub (TURRET)': 2,
    'H/Electric': 2,
    'Interior': 2,
    'Engine': 2,
    'Turret/Gun': 2,
    'Hydraulic': 2,
    'Bore Sight': 2,
    'Track': 2,
    'Electric/Interior': 2,
    'Automation': 2,
    'Final Assembly': 2,
    // Final Test
    '#1Insp': 1,
    'TEST RUN': 3,
    'Performance test': 3,
    'REPAIR': 1,
    'CHECK': 1,
    'Powerpack check': 1,
    'Final Check': 1,
    // Processing
    'Processing': 5,
};

function getCategory(processStation) {
    const key = String(processStation ?? '').trim();
    if (!key) return 'Other';

    // Exact match first
    if (CATEGORY_MAP[key]) return CATEGORY_MAP[key];

    // Case-insensitive exact match
    const lower = key.toLowerCase();
    for (const k of Object.keys(CATEGORY_MAP)) {
        if (k.toLowerCase() === lower) return CATEGORY_MAP[k];
    }

    // Loose match: prefix/contains checks to handle minor variants
    for (const k of Object.keys(CATEGORY_MAP)) {
        const kl = k.toLowerCase();
        if (lower.startsWith(kl) || kl.startsWith(lower) || lower.includes(kl) || kl.includes(lower)) {
            return CATEGORY_MAP[k];
        }
    }

    return 'Other';
}

function getModuleRuntime() {
    return window.PPMSModuleRuntime || null;
}

function getActiveModuleId() {
    return getModuleRuntime()?.getActiveModule?.() || 'kd1';
}

function isKD2Module() {
    return getActiveModuleId() === 'kd2';
}

function isF100KD2Module() {
    return getActiveModuleId() === 'f100kd2';
}

function isF200Module() {
    const id = getActiveModuleId();
    return id === 'kd1' || id === 'kd2';
}

function getActiveModuleConfig() {
    return getModuleRuntime()?.getActiveConfig?.() || null;
}

function getModuleBadge() {
    return getActiveModuleConfig()?.badge || (isKD2Module() ? 'F200 – KD2' : 'F200 – KD1');
}

function getModuleReportTitle() {
    if (isF100KD2Module()) return 'F100 Part Manufacturing Progress Control';
    return isKD2Module() ? 'F200 Battalion Planning and Progress Control' : 'F200 Assembly Control System';
}

function getModuleReportSubtitle() {
    if (isF100KD2Module()) return 'Gun and Vehicle Part Plan vs Actual';
    return isKD2Module() ? 'Manual and generated plan export' : 'Plan vs Actual Tracking System';
}

function getModuleCategory(processStation, row = null) {
    return getModuleRuntime()?.getCategory?.(processStation, row) || getCategory(processStation);
}

function syncReportCategoryOptions() {
    const source = document.getElementById('filterCategory');
    const target = document.getElementById('reportCategory');
    if (!source || !target) return;
    const currentVal = target.value;
    target.innerHTML = source.innerHTML;
    if ([...target.options].some(opt => opt.value === currentVal)) {
        target.value = currentVal;
    }
}

function populateCategorySelect(values) {
    const sel = document.getElementById('filterCategory');
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">All Categories</option>';
    values.forEach(value => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value;
        sel.appendChild(opt);
    });
    if ([...sel.options].some(opt => opt.value === currentVal)) {
        sel.value = currentVal;
    }
}

function getModuleProgressTable() {
    return isKD2Module() ? 'kd2_progress' : 'assembly_progress';
}

function getModulePlanTable() {
    return isKD2Module() ? 'kd2_plan' : 'assembly_plan';
}

function getModulePlanDatePayload(startDate, endDate, remark = undefined) {
    const payload = isKD2Module()
        ? {
            planned_start_date: startDate,
            planned_end_date: endDate,
            schedule_week: weekLabel(startDate),
        }
        : {
            start_date: startDate,
            end_date: endDate,
            week: weekLabel(startDate),
        };
    if (remark !== undefined) {
        payload.remark = remark;
    }
    return payload;
}

function samePlanLane(a, b) {
    if (!a || !b) return false;
    if (isKD2Module() && (a.battalion_code || '') !== (b.battalion_code || '')) return false;
    return a.vehicle === b.vehicle && a.vehicle_no === b.vehicle_no;
}

function buildVisibleGanttDays(startDate, endDate) {
    if (!startDate || !endDate || startDate > endDate) return [];
    return generateDateRange(startDate, endDate)
        .filter(d => new Date(d + 'T00:00:00').getDay() !== 5);
}

function resolveVisibleGanttColumn(dayIndex, dateStr, clampFallback) {
    if (dayIndex[dateStr] !== undefined) return dayIndex[dateStr];
    for (let n = 1; n <= 3; n++) {
        const next = addDays(dateStr, n);
        if (dayIndex[next] !== undefined) return dayIndex[next];
    }
    for (let n = 1; n <= 3; n++) {
        const prev = addDays(dateStr, -n);
        if (dayIndex[prev] !== undefined) return dayIndex[prev];
    }
    return clampFallback;
}

function compareGanttLanePriority(a, b) {
    const pa = _laneOrder[a.task.id] ?? 0;
    const pb = _laneOrder[b.task.id] ?? 0;
    if (pa !== pb) return pa - pb;
    if (a.si !== b.si) return a.si - b.si;
    if (a.ei !== b.ei) return a.ei - b.ei;
    return (a.task.id ?? 0) - (b.task.id ?? 0);
}

function buildPositionedGanttLaneTasks(tasks, startDate, endDate) {
    const days = buildVisibleGanttDays(startDate, endDate);
    const numDays = days.length;
    if (!numDays) return [];
    const dayIndex = Object.fromEntries(days.map((d, i) => [d, i]));
    const positioned = tasks
        .map(task => {
            const rawSi = task.start_date < startDate ? 0 : resolveVisibleGanttColumn(dayIndex, task.start_date, null);
            const rawEi = task.end_date > endDate ? numDays - 1 : resolveVisibleGanttColumn(dayIndex, task.end_date, null);
            if (rawSi === null || rawEi === null || rawSi > rawEi) return null;
            return { task, si: rawSi, ei: rawEi };
        })
        .filter(Boolean)
        .sort(compareGanttLanePriority);

    const laneEndAt = [];
    // Pack greedily from lane 0. Only honour a preferred lane for blocks the user
    // explicitly moved; everything else always floats to the topmost free row.
    positioned.forEach(item => {
        const preferred = Number.isFinite(_ganttManualLane[item.task.id])
            ? _ganttManualLane[item.task.id]
            : 0;
        let lane = preferred;
        while (laneEndAt[lane] !== undefined && laneEndAt[lane] >= item.si) lane++;
        item.lane = lane;
        laneEndAt[lane] = item.ei;
        _ganttVisualLane[item.task.id] = lane;
    });

    return positioned;
}

function moveGanttBlockOneLane(planId, direction, startDate, endDate) {
    const anchorTask = currentData.find(row => row.id === planId);
    if (!anchorTask || !Number.isFinite(direction)) return false;

    const laneTasks = currentData.filter(row => samePlanLane(row, anchorTask));
    const positioned = buildPositionedGanttLaneTasks(laneTasks, startDate, endDate);
    const anchor = positioned.find(item => item.task.id === planId);
    if (!anchor) return false;

    const targetLane = Math.max(0, anchor.lane + direction);
    if (targetLane === anchor.lane) return false;

    const neighbor = positioned
        .filter(item =>
            item.task.id !== planId &&
            item.lane === targetLane &&
            item.si <= anchor.ei &&
            item.ei >= anchor.si
        )
        .sort((a, b) => {
            const overlapA = Math.min(anchor.ei, a.ei) - Math.max(anchor.si, a.si);
            const overlapB = Math.min(anchor.ei, b.ei) - Math.max(anchor.si, b.si);
            if (overlapA !== overlapB) return overlapB - overlapA;
            return compareGanttLanePriority(a, b);
        })[0];

    if (neighbor) {
        _ganttManualLane[neighbor.task.id] = anchor.lane;
        _ganttVisualLane[neighbor.task.id] = anchor.lane;
    }
    _ganttManualLane[planId] = targetLane;
    _ganttVisualLane[planId] = targetLane;
    return true;
}

function getKd2ForwardMoveRows(anchorTask, rows = []) {
    const helper = getModuleRuntime()?.getPlanMoveRowsFromAnchor;
    if (typeof helper !== 'function') return anchorTask ? [anchorTask] : [];
    const moveRows = helper(anchorTask, rows);
    return moveRows?.length ? moveRows : (anchorTask ? [anchorTask] : []);
}

function normalizeKd2PlanRowForGantt(row) {
    return {
        ...row,
        vehicle: row.vehicle ?? row.vehicle_type,
        vehicle_no: row.vehicle_no ?? row.unit_serial,
        start_date: row.start_date ?? row.planned_start_date,
        end_date: row.end_date ?? row.planned_end_date,
    };
}

async function fetchKd2LaneRowsForGantt(task) {
    if (!db || !task?.battalion_id || !(task.vehicle_type || task.vehicle)) return [];
    let query = db
        .from('kd2_plan')
        .select('id, battalion_id, vehicle_type, unit_serial, route_sequence, station_sequence_in_category, station_code, planned_start_date, planned_end_date')
        .eq('battalion_id', task.battalion_id)
        .eq('vehicle_type', task.vehicle_type || task.vehicle);
    query = task.unit_serial === null
        ? query.is('unit_serial', null)
        : query.eq('unit_serial', task.unit_serial);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(normalizeKd2PlanRowForGantt);
}

async function resolveGanttMoveSet(task) {
    if (!task) return [];
    if (_ganttMoveMode === 'lane') {
        if (isKD2Module()) {
            const laneRows = await fetchKd2LaneRowsForGantt(task);
            if (laneRows.length) return laneRows;
        }
        return currentData.filter(row => samePlanLane(row, task));
    }
    if (_ganttMoveMode === 'from-block') {
        if (isKD2Module()) {
            const laneRows = await fetchKd2LaneRowsForGantt(task);
            if (laneRows.length) return getKd2ForwardMoveRows(task, laneRows);
        }
        return getKd2ForwardMoveRows(task, currentData);
    }
    if (_ganttMoveMode === 'plan') return currentData;
    return _selectedGanttPlanIds.has(task.id) && _selectedGanttPlanIds.size > 1
        ? currentData.filter(row => _selectedGanttPlanIds.has(row.id))
        : [task];
}

function getModuleGanttZones(startDate = '', endDate = '') {
    const runtimeZones = getModuleRuntime()?.getGanttSpecialZones?.(startDate, endDate);
    return [...SPECIAL_ZONES, ...(Array.isArray(runtimeZones) ? runtimeZones : [])];
}

function getUnitCodeTitle() {
    return isKD2Module() ? 'KD2 Unit Codes' : 'Unit Codes';
}

function ordinalLabel(num) {
    const mod100 = num % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${num}th`;
    const mod10 = num % 10;
    if (mod10 === 1) return `${num}st`;
    if (mod10 === 2) return `${num}nd`;
    if (mod10 === 3) return `${num}rd`;
    return `${num}th`;
}

function getKd2BaselineBattalions() {
    return Array.from({ length: 5 }, (_, index) => {
        const num = index + 1;
        return {
            battalion_code: `BTL-${String(num).padStart(2, '0')}`,
            battalion_name: `${ordinalLabel(num)} Battalion`,
            delivery_deadline: null,
            notes: 'Bootstrap baseline shell',
        };
    });
}

function getKd2BattalionOptionLabel(row) {
    const num = parseInt(String(row?.battalion_code || row?.battalion_name || '').match(/(\d+)/)?.[1] || '', 10);
    if (Number.isFinite(num) && num > 0 && num <= 5) return `${ordinalLabel(num)} Battalion`;
    return row?.battalion_name || row?.battalion_code || 'Battalion';
}

function setUnitCodesShell() {
    const isKD2 = isKD2Module();
    const battalionHeader = document.getElementById('ucHeaderBattalion');
    const battalionGroup = document.getElementById('ucBattalionGroup');
    const title = document.getElementById('unitCodesTitleText');
    const vehicleHeader = document.getElementById('ucHeaderVehicle');
    const unitHeader = document.getElementById('ucHeaderUnit');
    const codeHeader = document.getElementById('ucHeaderCode');
    const unitSelect = document.getElementById('ucUnit');
    const unitText = document.getElementById('ucUnitText');
    if (title) title.textContent = getUnitCodeTitle();
    if (vehicleHeader) vehicleHeader.textContent = 'Vehicle';
    if (unitHeader) unitHeader.textContent = isKD2 ? 'Unit Name' : 'Unit';
    if (codeHeader) codeHeader.textContent = 'Unit Code';
    if (battalionHeader) battalionHeader.style.display = isKD2 ? '' : 'none';
    if (battalionGroup) battalionGroup.style.display = isKD2 ? '' : 'none';
    if (unitSelect) unitSelect.style.display = isKD2 ? 'none' : '';
    if (unitText) unitText.style.display = isKD2 ? '' : 'none';
}

async function loadKd2Battalions() {
    const { data, error } = await db.from('kd2_battalions').select('id, battalion_code, battalion_name, delivery_deadline, notes').order('battalion_code');
    if (error) throw error;

    const battalions = data || [];
    const baseline = getKd2BaselineBattalions();
    const existingCodes = new Set(battalions.map(row => row.battalion_code));
    const missing = baseline.filter(row => !existingCodes.has(row.battalion_code));
    if (!missing.length) return battalions;

    const { data: insertedBattalions, error: insertError } = await db
        .from('kd2_battalions')
        .insert(missing)
        .select('id, battalion_code, battalion_name, delivery_deadline, notes');
    if (insertError) throw insertError;

    const planningRows = (insertedBattalions || []).flatMap(battalion => ['K9', 'K10', 'K11'].map(vehicle => ({
        battalion_id: battalion.id,
        vehicle_type: vehicle,
        required_quantity: null,
        delivery_deadline: null,
        skip_friday: true,
        include_saturday: false,
        assumptions_status: 'pending',
        notes: 'Bootstrap baseline shell',
    })));
    if (planningRows.length) {
        const { error: planningError } = await db
            .from('kd2_planning_inputs')
            .upsert(planningRows, { onConflict: 'battalion_id,vehicle_type' });
        if (planningError) throw planningError;
    }

    await auditLog('BOOTSTRAP', 'kd2_battalions', 'baseline-5', null, {
        battalions: missing.map(row => row.battalion_code),
        planning_rows: planningRows.length,
    });

    return battalions.concat(insertedBattalions || []).sort((a, b) =>
        String(a.battalion_code || '').localeCompare(String(b.battalion_code || ''), undefined, { numeric: true })
    );
}

function normalizeKd2UnitName(rawValue) {
    const label = String(rawValue || '').trim();
    if (!label) return null;
    const match = label.match(/(\d+)$/);
    if (!match) return { label, unitSerial: NaN };
    const unitSerial = parseInt(match[1], 10);
    return { label, unitSerial };
}

function getRowCode(row) {
    if (isKD2Module()) {
        return row.work_center || row.station_code || row.category_code || '—';
    }
    return getStationCode(row.process_station, row.vehicle) || '—';
}

function getRowUnitMeta(row) {
    if (isKD2Module()) {
        return row.battalion_code ? `<br><span class="unit-code-badge">${esc(row.battalion_code)}</span>` : '';
    }
    const code = getUnitCode(row.vehicle, row.vehicle_no);
    return code ? `<br><span class="unit-code-badge">${esc(code)}</span>` : '';
}

let db = null;
let barChartInst = null;
let lineChartInst = null;
let currentData = [];      // flat merged rows
let unitCodeMap = {};      // { 'K9||M1': 'EGY N25020', ... }
let unitRegistryRows = [];
let activePlanId = null;    // plan row being marked complete

/* ──────────────────────────────────────────────────────────────────
   3. ENTRY POINT
   ────────────────────────────────────────────────────────────────── */
async function initializeApp() {
    // ── Auth guard — redirect to login if no valid session ───────────
    if (!getCurrentUser()) { window.location.replace('login.html'); return; }
    populateNavbar();

    startClock();

    // Init Supabase client
    try {
        const _noopStorage = {
            getItem: () => null,
            setItem: () => { },
            removeItem: () => { },
        };
        db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
                storage: _noopStorage,
            },
        });
        setConnStatus('connected', 'Connected');
    } catch (err) {
        setConnStatus('error', 'Connection Error');
        showToast('Failed to initialise Supabase. Check your credentials.', 'error');
        console.error(err);
        return;
    }

    wireEvents();
    getModuleRuntime()?.initialize?.(db, {
        reloadAll: async () => {
            await loadFilters();
            await loadData();
        },
    });

    await loadFilters();
    await loadData();
    await getModuleRuntime()?.refreshWorkspace?.();
}

/* ──────────────────────────────────────────────────────────────────
   4. FILTERS
   ────────────────────────────────────────────────────────────────── */
async function loadFilters() {
    try {
        if (isKD2Module() && getModuleRuntime()?.loadFilters) {
            const kd2Filters = await getModuleRuntime().loadFilters(db);
            populateSelect('filterBattalion', kd2Filters.battalions || [], 'All Battalions');
            populateSelect('filterVehicle', kd2Filters.vehicles, 'All Vehicles');
            populateSelect('filterWeek', kd2Filters.weeks, 'All Weeks');
            populateCategorySelect(kd2Filters.categories || []);
            await loadUnitCodes();
            populateUnitFilter(null);
            await getModuleRuntime().loadPlanningSnapshot?.(db);
            return;
        }

        // Paginate to get all vehicles/weeks (same 1000-row limit applies)
        let plans = [];
        let fFrom = 0;
        while (true) {
            const { data: page, error } = await db
                .from('assembly_plan')
                .select('vehicle, vehicle_no, start_date, week')
                .range(fFrom, fFrom + 999);
            if (error) throw error;
            if (!page?.length) break;
            plans = plans.concat(page);
            if (page.length < 1000) break;
            fFrom += 1000;
        }

        await loadUnitCodes();
        const vehicles = [...new Set([
            ...plans.map(r => r.vehicle),
            ...unitRegistryRows.map(r => r.vehicle),
        ].filter(Boolean))].sort(vehicleSort);
        const weeks = [...new Set(plans.map(r => r.start_date ? weekLabel(r.start_date) : r.week).filter(Boolean))]
            .sort((a, b) => parseInt(a.replace(/[^0-9]/g, ''), 10) - parseInt(b.replace(/[^0-9]/g, ''), 10));

        populateSelect('filterVehicle', vehicles, 'All Vehicles');
        populateSelect('filterWeek', weeks, 'All Weeks');
        populateUnitFilter(null);

    } catch (err) {
        showToast('Failed to load filter options.', 'error');
        console.error(err);
    }
}

function populateSelect(id, values, placeholder) {
    const sel = document.getElementById(id);
    const currentVal = sel.value;
    sel.innerHTML = `<option value="">${placeholder}</option>`;
    values.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        sel.appendChild(opt);
    });
    if (currentVal) sel.value = currentVal;
}

/** Load vehicle_units table into unitCodeMap */
async function loadUnitCodes() {
    try {
        unitCodeMap = {};
        unitRegistryRows = [];
        if (isKD2Module()) {
            const [{ data: units, error: unitsError }, { data: battalions, error: battalionError }] = await Promise.all([
                db.from('kd2_vehicle_units').select('battalion_id, vehicle_type, unit_serial, unit_label, unit_code'),
                db.from('kd2_battalions').select('id, battalion_code'),
            ]);
            if (unitsError) throw unitsError;
            if (battalionError) throw battalionError;
            const battalionMap = Object.fromEntries((battalions || []).map(row => [row.id, row.battalion_code]));
            (units || []).forEach(r => {
                const code = r.unit_code || '';
                const battalionCode = battalionMap[r.battalion_id] || '';
                const fallbackLabel = battalionCode
                    ? `${battalionCode} / ${r.vehicle_type}-${String(r.unit_serial).padStart(2, '0')}`
                    : `${r.vehicle_type}-${String(r.unit_serial).padStart(2, '0')}`;
                if (r.unit_label) unitCodeMap[r.vehicle_type + '||' + r.unit_label] = code;
                unitCodeMap[r.vehicle_type + '||' + fallbackLabel] = code;
                unitRegistryRows.push({
                    battalion_id: r.battalion_id,
                    battalion_code: battalionCode || '—',
                    vehicle: r.vehicle_type,
                    vehicle_type: r.vehicle_type,
                    vehicle_no: r.unit_label || fallbackLabel,
                    unit_serial: r.unit_serial,
                    unit_label: r.unit_label || fallbackLabel,
                    unit_code: code,
                });
            });
            return;
        }

        const { data, error } = await db.from('vehicle_units').select('vehicle, vehicle_no, unit_code');
        if (error) throw error;
        (data || []).forEach(r => {
            unitCodeMap[r.vehicle + '||' + r.vehicle_no] = r.unit_code || '';
            unitRegistryRows.push({
                vehicle: r.vehicle,
                vehicle_no: r.vehicle_no,
                unit_code: r.unit_code || '',
            });
        });
    } catch (e) {
        console.warn('Unit codes table not found or error — unit codes disabled:', e.message);
        unitCodeMap = {};
        unitRegistryRows = [];
    }
}

function getRegisteredUnitNames(vehicle = null, fallbackRows = currentData) {
    return [...new Set([
        ...unitRegistryRows
            .filter(row => !vehicle || row.vehicle === vehicle)
            .map(row => row.vehicle_no),
        ...((fallbackRows || [])
            .filter(row => !vehicle || row.vehicle === vehicle)
            .map(row => row.vehicle_no)),
    ].filter(Boolean))].sort(naturalSort);
}

/** Populate unit filter. When vehicle is given, shows "M1 · code"; otherwise shows "K9 · M1 · code"
 *  so the vehicle context is always captured in data-vehicle for correct filtering. */
function populateUnitFilter(vehicle = null) {
    const sel = document.getElementById('filterUnit');
    const prevVal = sel.value;
    const prevVehicle = sel.options[sel.selectedIndex]?.dataset?.vehicle || '';
    sel.innerHTML = '<option value="">All Units</option>';

    const pairs = [];
    const seen = new Set();
    [...unitRegistryRows, ...(currentData || [])].forEach(r => {
        const v = r.vehicle || r.vehicle_type || '';
        const u = r.vehicle_no || '';
        if (!v || !u) return;
        if (vehicle && v !== vehicle) return;
        const key = v + '||' + u;
        if (!seen.has(key)) { seen.add(key); pairs.push({ v, u }); }
    });
    pairs.sort((a, b) => {
        const vc = vehicleSort(a.v, b.v);
        return vc !== 0 ? vc : naturalSort(a.u, b.u);
    });

    pairs.forEach(({ v, u }) => {
        const code = unitCodeMap[v + '||' + u] || '';
        const opt = document.createElement('option');
        opt.value = u;
        opt.dataset.vehicle = v;
        const base = code ? u + ' · ' + code : u;
        opt.textContent = vehicle ? base : v + ' · ' + base;
        sel.appendChild(opt);
    });

    if (prevVal) {
        const idx = [...sel.options].findIndex(o => o.value === prevVal && o.dataset.vehicle === prevVehicle);
        if (idx >= 0) sel.selectedIndex = idx;
        else {
            const fallback = [...sel.options].findIndex(o => o.value === prevVal);
            if (fallback >= 0) sel.selectedIndex = fallback;
        }
    }
}

/** Called when filterVehicle changes — cascade unit dropdown */
function onVehicleFilterChange() {
    const vehicle = getVal('filterVehicle');
    populateUnitFilter(vehicle || null);
    
    // Show K9 component filter only when K9 is selected
    const k9ComponentGroup = document.getElementById('filterK9ComponentGroup');
    if (k9ComponentGroup) {
        k9ComponentGroup.style.display = vehicle === 'K9' ? 'flex' : 'none';
        if (vehicle !== 'K9') {
            setVal('filterK9Component', '');
        }
    }
}

/* ──────────────────────────────────────────────────────────────────
   5. DATA LOADING
   ────────────────────────────────────────────────────────────────── */

/** Save current table scroll position and return it */
function saveScrollPos() {
    const wrap = document.getElementById('tableWrap') || document.querySelector('.table-scroll-wrap');
    return { top: wrap?.scrollTop || 0, left: wrap?.scrollLeft || 0, el: wrap };
}
/** Restore scroll position (deferred to after DOM paint) */
function restoreScrollPos(pos) {
    if (!pos?.el) return;
    requestAnimationFrame(() => {
        pos.el.scrollTop = pos.top;
        pos.el.scrollLeft = pos.left;
    });
}

/**
 * Re-render all derived views (table, summary, charts, VPX, Gantt)
 * from currentData without touching the DB.  Always preserves scroll.
 * Call this after any in-memory mutation of currentData.
 */
function refreshAllViews() {
    const category = getVal('filterCategory');
    const displayData = category
        ? currentData.filter(r => getModuleCategory(r.process_station, r) === category)
        : currentData;

    const pos = saveScrollPos();
    renderTable(displayData);
    restoreScrollPos(pos);

    updateSummary(displayData);
    renderCharts(displayData);
    renderVPX(displayData);
    if (isKD2Module()) {
        // Ensure KD2 schedule uses the same filtered view as other components
        getModuleRuntime()?.renderSchedule?.(displayData);
    }

    const gsEl = document.getElementById('ganttStart');
    const geEl = document.getElementById('ganttEnd');
    if (!gsEl?.value || !geEl?.value) setGanttRangeFromData(displayData);
    renderGantt(displayData, gsEl?.value, geEl?.value);
}

async function loadData() {
    try {
        setTableLoading(true);

        // F100-KD2 has its own data loader — stub until Phase 3 is built
        if (isF100KD2Module()) {
            currentData = [];
            renderTable([]);
            updateSummary([]);
            renderCharts([]);
            renderVPX([]);
            return;
        }

        if (isKD2Module() && getModuleRuntime()?.loadData) {
            const week = getVal('filterWeek');
            const wr = week ? isoWeekDateRange(week) : null;
            const _unitSel = document.getElementById('filterUnit');
            const _unitVehicle = _unitSel?.options[_unitSel.selectedIndex]?.dataset?.vehicle || '';
            currentData = await getModuleRuntime().loadData(db, {
                vehicle: getVal('filterVehicle') || _unitVehicle,
                battalion: getVal('filterBattalion'),
                unit: getVal('filterUnit'),
                week,
                weekStartForFilter: wr?.weekStart || null,
                weekEndForFilter: wr?.weekEnd || null,
                timeFrame: getVal('filterTimeFrame'),
                today: todayStr(),
                ...currentWeekRange(),
                ...currentMonthRange(),
                startDate: getVal('filterStartDate'),
                endDate: getVal('filterEndDate'),
                k9Component: getVal('filterK9Component'),
            });

            currentData.sort((a, b) => {
                const vCmp = vehicleSort(a.vehicle, b.vehicle); if (vCmp !== 0) return vCmp;
                const uCmp = naturalSort(a.vehicle_no, b.vehicle_no); if (uCmp !== 0) return uCmp;
                const kd2Compare = getModuleRuntime()?.comparePlanRowsByLaneOrder;
                if (typeof kd2Compare === 'function') return kd2Compare(a, b);
                const rA = parseInt(a.route_sequence, 10) || 9999;
                const rB = parseInt(b.route_sequence, 10) || 9999;
                if (rA !== rB) return rA - rB;
                const wA = parseInt((a.week || '').replace(/\D/g, ''), 10) || 9999;
                const wB = parseInt((b.week || '').replace(/\D/g, ''), 10) || 9999;
                if (wA !== wB) return wA - wB;
                return (a.start_date || '').localeCompare(b.start_date || '');
            });

            const category = getVal('filterCategory');
            const displayData = category
                ? currentData.filter(r => getModuleCategory(r.process_station, r) === category)
                : currentData;

            renderTable(displayData);
            updateSummary(displayData);
            renderCharts(displayData);
            renderVPX(displayData);
            await getModuleRuntime().loadPlanningSnapshot?.(db);
            await getModuleRuntime().refreshWorkspace?.();
            await getModuleRuntime().renderSchedule?.(currentData);
            const gsEl = document.getElementById('ganttStart');
            const geEl = document.getElementById('ganttEnd');
            if (!gsEl?.value || !geEl?.value) setGanttRangeFromData(displayData);
            renderGantt(displayData, gsEl?.value, geEl?.value);
            return;
        }

        // Build query
        let query = db
            .from('assembly_plan')
            .select(`
        id, vehicle, vehicle_no, process_station, week,
        start_date, end_date, remark,
        assembly_progress (
          id, completed, completion_date, actual_start_date, notes, updated_at
        )
      `);

        // Vehicle filter — also inherit from unit option's data-vehicle when vehicle filter is unset
        const _unitSelA = document.getElementById('filterUnit');
        const _unitVehicleA = _unitSelA?.options[_unitSelA.selectedIndex]?.dataset?.vehicle || '';
        const vehicle = getVal('filterVehicle') || _unitVehicleA;
        if (vehicle) query = query.eq('vehicle', vehicle);

        // Unit filter
        const unit = getVal('filterUnit');
        if (unit) query = query.eq('vehicle_no', unit);

        // Week filter — include all tasks whose date range overlaps the selected ISO week
        const week = getVal('filterWeek');
        if (week) {
            const wr = isoWeekDateRange(week);
            if (wr) {
                // Task overlaps week if: start_date <= weekEnd AND end_date >= weekStart
                query = query
                    .lte('start_date', wr.weekEnd)
                    .gte('end_date', wr.weekStart);
            }
        }

        // Time-frame filter
        const tf = getVal('filterTimeFrame');
        const today = todayStr();

        if (tf === 'day') {
            query = query.eq('start_date', today);

        } else if (tf === 'week') {
            const { weekStart, weekEnd } = currentWeekRange();
            query = query.gte('start_date', weekStart).lte('start_date', weekEnd);

        } else if (tf === 'month') {
            const { monthStart, monthEnd } = currentMonthRange();
            query = query.gte('start_date', monthStart).lte('start_date', monthEnd);

        } else if (tf === 'custom') {
            const sd = getVal('filterStartDate');
            const ed = getVal('filterEndDate');
            if (sd) query = query.gte('start_date', sd);
            if (ed) query = query.lte('end_date', ed);
        }

        // Supabase returns max 1000 rows by default — fetch all pages
        let allData = [];
        let from = 0;
        const PAGE = 1000;
        while (true) {
            const { data: page, error: pageErr } = await query.range(from, from + PAGE - 1);
            if (pageErr) throw pageErr;
            if (!page?.length) break;
            allData = allData.concat(page);
            if (page.length < PAGE) break;  // last page
            from += PAGE;
        }
        const data = allData;

        // Flatten progress — handle both array (old) and single object (new, after UNIQUE constraint)
        // PostgREST returns a single object instead of array when it detects a 1:1 relationship
        currentData = data.map(plan => {
            const raw = plan.assembly_progress;
            let prog = null;
            if (raw) {
                if (Array.isArray(raw)) {
                    // Legacy: array of rows — take most recently updated
                    if (raw.length > 0) {
                        prog = raw.slice().sort((a, b) =>
                            (b.updated_at || '').localeCompare(a.updated_at || '')
                        )[0];
                    }
                } else if (typeof raw === 'object') {
                    // PostgREST 1:1 mode: single object returned directly
                    prog = raw;
                }
            }
            return { ...plan, progress: prog };
        });

        // Sort: vehicle → unit → week (numeric FW01…) → planned start_date
        currentData.sort((a, b) => {
            const vCmp = vehicleSort(a.vehicle, b.vehicle); if (vCmp !== 0) return vCmp;
            const uCmp = naturalSort(a.vehicle_no, b.vehicle_no); if (uCmp !== 0) return uCmp;
            const wA = parseInt((a.week || '').replace(/\D/g, ''), 10) || 9999;
            const wB = parseInt((b.week || '').replace(/\D/g, ''), 10) || 9999;
            if (wA !== wB) return wA - wB;
            return (a.start_date || '').localeCompare(b.start_date || '');
        });

        // DEBUG: log category distribution to aid troubleshooting when filters return no rows
        try {
            const catCounts = {};
            currentData.forEach(r => {
                const c = getModuleCategory(r.process_station, r);
                catCounts[c] = (catCounts[c] || 0) + 1;
            });
            console.info('PPMS: categoryCounts', catCounts);
            const otherSamples = currentData.filter(r => getModuleCategory(r.process_station, r) === 'Other')
                .slice(0, 8)
                .map(r => ({ station: r.process_station, vehicle: r.vehicle, week: r.week }));
            if (otherSamples.length) console.warn('PPMS: sample process_station mapping to Other', otherSamples);
        } catch (e) {
            console.warn('PPMS: category debug failed', e.message || e);
        }

        // Category filter (client-side — maps process_station → category)
        const category = getVal('filterCategory');
        const displayData = category
            ? currentData.filter(r => getModuleCategory(r.process_station, r) === category)
            : currentData;

        renderTable(displayData);
        updateSummary(displayData);
        renderCharts(displayData);
        renderVPX(displayData);   // use same filtered data as table/charts

        // Auto-set gantt range from data on first load or when inputs are empty
        const gsEl = document.getElementById('ganttStart');
        const geEl = document.getElementById('ganttEnd');
        if (!gsEl?.value || !geEl?.value) setGanttRangeFromData(displayData);
        renderGantt(displayData, gsEl?.value, geEl?.value);

    } catch (err) {
        showToast('Error loading data: ' + err.message, 'error');
        console.error(err);
    } finally {
        setTableLoading(false);
    }
}

/* ──────────────────────────────────────────────────────────────────
   6. STATUS CALCULATION
   ────────────────────────────────────────────────────────────────── */
function calculateStatus(row) {
    const today = todayStr();
    const completed = row.progress?.completed || false;
    const compDate = row.progress?.completion_date || null;
    const actualStart = row.progress?.actual_start_date || null;
    const endDate = row.end_date;

    // Completed on time: done and finished by the planned end date
    if (completed && compDate && compDate <= endDate) return 'Completed';
    // Late: done but finished after the planned end date
    if (completed && compDate && compDate > endDate) return 'Late Completion';
    // Overdue: not done and today is past the planned end date
    if (!completed && today > endDate) return 'Overdue';
    // In Progress: actual start date has been entered but not yet complete
    if (!completed && actualStart) return 'In Progress';
    // Planned: nothing recorded yet
    return 'Planned';
}

function ganttHighlightState(row) {
    const completed = row.progress?.completed || false;
    const compDate = row.progress?.completion_date || null;
    const actualStart = row.progress?.actual_start_date || null;
    const endDate = row.end_date;
    const today = todayStr();

    if (completed && compDate && compDate < endDate) return 'early';
    if (completed && compDate && compDate > endDate) return 'late';
    if (!completed && today > endDate) return 'late';
    if (!completed && actualStart) return 'progress';
    if (completed && compDate) return 'complete';
    return 'planned';
}

function delayDays(row) {
    const completed = row.progress?.completed || false;
    const compDate = row.progress?.completion_date || null;
    const actualStart = row.progress?.actual_start_date || null;
    const plannedStart = row.start_date;
    const endDate = row.end_date;
    const today = todayStr();

    // Completed late: how many days after end date it was finished
    if (completed && compDate && compDate > endDate) {
        return daysBetween(endDate, compDate);
    }
    // Overdue: how many days past the end date without completion
    if (!completed && today > endDate) {
        return daysBetween(endDate, today);
    }
    // In Progress but started late: show start delay as a warning
    if (!completed && actualStart && actualStart > plannedStart) {
        return daysBetween(plannedStart, actualStart);
    }
    return 0;
}

/* ──────────────────────────────────────────────────────────────────
   7. TABLE RENDERING
   ────────────────────────────────────────────────────────────────── */
function renderTable(data) {
    const tbody = document.getElementById('tableBody');
    document.getElementById('rowCount').textContent = `${data.length} record${data.length !== 1 ? 's' : ''}`;

    if (!data.length) {
        tbody.innerHTML = `
      <tr>
        <td colspan="13" class="table-empty">
          <div class="empty-state">
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="6" y="6" width="36" height="36" rx="4"/><path d="M16 24h16M24 16v16"/></svg>
            <p>No records match the current filters.</p>
          </div>
        </td>
      </tr>`;
        return;
    }

    tbody.innerHTML = data.map((row, idx) => {
        const status = calculateStatus(row);
        const delay = delayDays(row);
        const badgeCls = `badge badge-${status.toLowerCase().replace(' ', '-').replace('late-completion', 'late')}`;
        const compDate = row.progress?.completion_date || null;
        const actualStart = row.progress?.actual_start_date || '';
        const isDone = status === 'Completed' || status === 'Late Completion';

        // ── Delay label ───────────────────────────────────────────────
        let delayHtml;
        if (delay > 0 && (status === 'Late Completion' || status === 'Overdue')) {
            delayHtml = `<span class="delay-positive">+${delay}d</span>`;
        } else if (delay > 0 && status === 'In Progress') {
            delayHtml = `<span class="delay-positive" title="Started ${delay}d late">+${delay}d start</span>`;
        } else if (status === 'Completed') {
            delayHtml = `<span class="delay-zero">On Time</span>`;
        } else {
            delayHtml = `<span class="delay-none">—</span>`;
        }

        // ── Actual Start — always an editable inline date input ───────
        const startInputHtml = `
      <div class="inline-date-wrap">
        <input type="date"
          class="inline-date-input"
          data-plan-id="${row.id}"
          value="${actualStart}"
          title="Actual start date" />
        ${actualStart
                ? `<button class="inline-icon-btn inline-start-clear" data-plan-id="${row.id}" title="Clear start date">✕</button>`
                : ''}
      </div>`;

        // ── Completed On — text display + edit pencil + clear ✕ ──────
        // When a date is set: show formatted date, edit button, clear button.
        // The edit button swaps the cell contents to a live date-input on click.
        const compCellHtml = compDate
            ? `<div class="inline-date-wrap" id="comp-wrap-${row.id}">
           <span class="inline-date-done" id="comp-display-${row.id}">${formatDate(compDate)}</span>
           <button class="inline-icon-btn inline-comp-edit"
             data-plan-id="${row.id}"
             data-current="${compDate}"
             title="Edit completion date">✎</button>
           <button class="inline-icon-btn inline-comp-clear"
             data-plan-id="${row.id}"
             title="Clear completion date">✕</button>
         </div>`
            : `<div class="inline-date-wrap" id="comp-wrap-${row.id}">
           <span class="inline-date-none">—</span>
         </div>`;

        // ── Completion note icon ─────────────────────────────────────
        const note = row.progress?.notes || '';
        const noteBtn = note
            ? `<button class="btn-note-icon" data-plan-id="${row.id}" title="${esc(note)}">
           <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7">
             <rect x="2" y="2" width="12" height="12" rx="2"/>
             <path d="M5 6h6M5 8.5h6M5 11h4"/>
           </svg>
         </button>`
            : '';

        // ── Action — Mark Complete button for non-done rows ───────────
        const kd2EditBtn = isKD2Module()
            ? `<button class="btn btn-ghost btn-sm btn-kd2-edit-plan" data-plan-id="${row.id}">Edit</button>`
            : '';
        const actionHtml = isDone
            ? `<div class="action-cell">${noteBtn}${kd2EditBtn}<button class="btn btn-done" disabled>✓ Done</button></div>`
            : `<div class="action-cell">${noteBtn}${kd2EditBtn}<button class="btn btn-action" data-plan-id="${row.id}" data-idx="${idx}">Mark Complete</button></div>`;

        return `
      <tr>
        <td class="mono">${idx + 1}</td>
        <td><strong>${esc(row.vehicle)}</strong></td>
        <td class="mono">${esc(row.vehicle_no)}${getRowUnitMeta(row)}</td>
        <td>${esc(row.process_station)}</td>
        <td class="mono station-code-cell">${esc(getRowCode(row))}</td>
        <td class="mono">${esc(row.week || '—')}</td>
        <td class="mono">${formatDate(row.start_date)}</td>
        <td class="mono">${formatDate(row.end_date)}</td>
        <td>${startInputHtml}</td>
        <td>${compCellHtml}</td>
        <td><span class="${badgeCls}">${status}</span></td>
        <td>${delayHtml}</td>
        <td>${actionHtml}</td>
      </tr>`;
    }).join('');

    // ── Actual Start: save on change ──────────────────────────────
    tbody.querySelectorAll('.inline-date-input').forEach(input => {
        input.addEventListener('change', () =>
            saveActualStart(parseInt(input.dataset.planId), input.value)
        );
    });
    tbody.querySelectorAll('.inline-start-clear').forEach(btn => {
        btn.addEventListener('click', () =>
            saveActualStart(parseInt(btn.dataset.planId), '')
        );
    });

    // ── Completed On: edit pencil → swap display for live input ──
    tbody.querySelectorAll('.inline-comp-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            const planId = parseInt(btn.dataset.planId);
            const current = btn.dataset.current;
            const wrap = document.getElementById(`comp-wrap-${planId}`);
            if (!wrap) return;

            // Replace wrap contents with an active date input
            wrap.innerHTML = `
        <input type="date"
          class="inline-date-input inline-comp-active"
          data-plan-id="${planId}"
          value="${current}"
          title="Edit completion date" />
        <button class="inline-icon-btn inline-comp-cancel"
          data-plan-id="${planId}"
          data-original="${current}"
          title="Cancel">✕</button>`;

            const newInput = wrap.querySelector('.inline-comp-active');
            newInput.focus();

            newInput.addEventListener('change', () =>
                saveCompletionDate(planId, newInput.value)
            );

            // Cancel restores original display without saving
            wrap.querySelector('.inline-comp-cancel').addEventListener('click', () =>
                saveCompletionDate(planId, current, /* silent */ true)
            );
        });
    });

    // ── Completed On: clear button ────────────────────────────────
    tbody.querySelectorAll('.inline-comp-clear').forEach(btn => {
        btn.addEventListener('click', () =>
            saveCompletionDate(parseInt(btn.dataset.planId), '')
        );
    });

    // ── Note icon — show popover on click ───────────────────────
    tbody.querySelectorAll('.btn-note-icon').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.note-popover').forEach(p => p.remove());

            const planId = parseInt(btn.dataset.planId);
            const note = btn.getAttribute('title');

            const popover = document.createElement('div');
            popover.className = 'note-popover';
            popover.dataset.planId = planId;

            function renderView() {
                const adminBtns = isAdmin() ? `
          <button class="note-action-btn note-edit-btn" title="Edit note">
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z"/></svg>
          </button>
          <button class="note-action-btn note-delete-btn" title="Delete note">
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 3.5h10M5 3.5V2h4v1.5M5.5 6v5M8.5 6v5M3 3.5l.7 8h6.6l.7-8"/></svg>
          </button>` : '';

                popover.innerHTML = `
          <div class="note-popover-header">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7">
              <rect x="2" y="2" width="12" height="12" rx="2"/>
              <path d="M5 6h6M5 8.5h6M5 11h4"/>
            </svg>
            Completion Note
            <div class="note-popover-actions">
              ${adminBtns}
              <button class="note-popover-close" title="Close">✕</button>
            </div>
          </div>
          <div class="note-popover-body">${esc(popover._currentNote ?? note)}</div>`;

                popover.querySelector('.note-popover-close').addEventListener('click', () => popover.remove());

                if (isAdmin()) {
                    popover.querySelector('.note-edit-btn').addEventListener('click', (e) => {
                        e.stopPropagation();
                        renderEdit();
                    });

                    popover.querySelector('.note-delete-btn').addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (!confirm('Delete this completion note?')) return;
                        await saveNoteOnly(planId, '');
                        btn.setAttribute('title', '');
                        btn.closest('.action-cell').querySelector('.btn-note-icon')?.remove();
                        popover.remove();
                    });
                }
            }

            function renderEdit() {
                const current = popover._currentNote ?? note;
                popover.innerHTML = `
          <div class="note-popover-header">
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z"/></svg>
            Edit Note
            <button class="note-popover-close" title="Cancel">✕</button>
          </div>
          <div class="note-popover-edit-body">
            <textarea class="note-edit-textarea" rows="4" placeholder="Completion note…">${esc(current)}</textarea>
            <div class="note-edit-footer">
              <button class="btn btn-primary btn-sm note-save-btn">Save</button>
              <button class="btn btn-ghost btn-sm note-cancel-btn">Cancel</button>
            </div>
          </div>`;

                const ta = popover.querySelector('.note-edit-textarea');
                ta.focus();
                ta.setSelectionRange(ta.value.length, ta.value.length);

                popover.querySelector('.note-popover-close').addEventListener('click', () => {
                    renderView();
                });
                popover.querySelector('.note-cancel-btn').addEventListener('click', () => {
                    renderView();
                });
                popover.querySelector('.note-save-btn').addEventListener('click', async () => {
                    const newNote = ta.value.trim();
                    await saveNoteOnly(planId, newNote);
                    popover._currentNote = newNote;
                    btn.setAttribute('title', newNote);
                    // If note was cleared, remove the icon button entirely and close
                    if (!newNote) {
                        btn.closest('.action-cell')?.querySelector('.btn-note-icon')?.remove();
                        popover.remove();
                        return;
                    }
                    renderView();
                });
            }

            popover._currentNote = note;
            renderView();

            document.body.appendChild(popover);

            // Position below the button
            const rect = btn.getBoundingClientRect();
            const pw = 280;
            let left = rect.left + window.scrollX;
            if (left + pw > window.innerWidth - 16) left = window.innerWidth - pw - 16;
            popover.style.left = left + 'px';
            popover.style.top = (rect.bottom + window.scrollY + 6) + 'px';
            popover.style.width = pw + 'px';

            setTimeout(() => document.addEventListener('click', function handler(ev) {
                if (!popover.contains(ev.target)) {
                    popover.remove();
                    document.removeEventListener('click', handler);
                }
            }), 0);
        });
    });

    // ── Mark Complete button ──────────────────────────────────────
    tbody.querySelectorAll('.btn-action').forEach(btn => {
        btn.addEventListener('click', () => openCompleteModal(
            parseInt(btn.dataset.planId),
            parseInt(btn.dataset.idx)
        ));
    });
    tbody.querySelectorAll('.btn-kd2-edit-plan').forEach(btn => {
        btn.addEventListener('click', () => {
            getModuleRuntime()?.openPlanEdit?.(parseInt(btn.dataset.planId, 10));
        });
    });
}

/* ──────────────────────────────────────────────────────────────────
   8. SUMMARY CARDS
   ────────────────────────────────────────────────────────────────── */
function updateSummary(data) {
    const total = data.length;
    const completed = data.filter(r => calculateStatus(r) === 'Completed').length;
    const late = data.filter(r => calculateStatus(r) === 'Late Completion').length;
    const overdue = data.filter(r => calculateStatus(r) === 'Overdue').length;
    const pct = total ? Math.round(((completed + late) / total) * 100) : 0;

    animateCount('sumPlanned', total);
    animateCount('sumCompleted', completed);
    animateCount('sumLate', late);
    animateCount('sumOverdue', overdue);
    document.getElementById('sumProgress').textContent = `${pct}%`;
    document.getElementById('progressBarFill').style.width = `${pct}%`;
}

/* ──────────────────────────────────────────────────────────────────
   9. CHARTS
   ────────────────────────────────────────────────────────────────── */

/* ================================================================
   VEHICLE PRODUCTION PROGRESS MATRIX (VPX)
   ================================================================ */

// Station column definitions — ordered exactly as they flow in production
/**
 * VPX column definitions.
 *
 * Each column has:
 *   code    — the station code shown in the header (A01, A05/A11, …)
 *   name    — full station name shown as column tooltip
 *   resolve — function(vehicle) → station key to look up in row.stations,
 *             or null if this column is N/A for that vehicle
 *   group   — column group label
 *
 * Vehicle-specific rules:
 *   A02 → H/Electric (K9 family) | Track (K10/K11 family)
 *   A04 → Engine (K9 only — K10/K11 show this station at A13)
 *   A13 → Engine (K10/K11 only)
 */
const _isK9 = v => /K9/i.test(String(v));
const _isK10K11 = v => /K1[01]/i.test(String(v));

const VPX_COLUMNS = [
    // ── Assembly ──────────────────────────────────────────────────────
    {
        code: 'A01', name: 'Suspension',
        resolve: () => 'Suspension',
        group: 'Assembly',
    },
    {
        code: 'A02', name: 'H/Electric (K9) · Track (K10/K11)',
        resolve: v => _isK9(v) ? 'H/Electric' : 'Track',
        group: 'Assembly',
    },
    {
        code: 'A03', name: 'Interior',
        resolve: () => 'Interior',
        group: 'Assembly',
    },
    {
        code: 'A04', name: 'Engine (K9)',
        resolve: v => _isK9(v) ? 'Engine' : null,   // K10/K11 use A13
        group: 'Assembly',
    },
    {
        code: 'A05/A11', name: 'Turret/Gun',
        resolve: () => 'Turret/Gun',
        group: 'Assembly',
    },
    {
        code: 'A06', name: 'Hydraulic',
        resolve: () => 'Hydraulic',
        group: 'Assembly',
    },
    {
        code: 'A07', name: 'Bore Sight',
        resolve: () => 'Bore Sight',
        group: 'Assembly',
    },
    {
        code: 'A08', name: 'Turret',
        resolve: () => 'Turret',
        group: 'Assembly',
    },
    {
        code: 'A09', name: 'T/Electric (TURRET)',
        resolve: () => 'T/Electric (TURRET)',
        group: 'Assembly',
    },
    {
        code: 'A10', name: 'Hyd / Sub (TURRET)',
        resolve: () => 'Hyd / Sub (TURRET)',
        group: 'Assembly',
    },
    {
        code: 'A12', name: 'Electric/Interior',
        resolve: () => 'Electric/Interior',
        group: 'Assembly',
    },
    {
        code: 'A13', name: 'Engine (K10/K11)',
        resolve: v => _isK9(v) ? null : 'Engine',   // K9 uses A04
        group: 'Assembly',
    },
    {
        code: 'A14', name: 'Automation',
        resolve: () => 'Automation',
        group: 'Assembly',
    },
    {
        code: 'A15', name: 'Final Assembly',
        resolve: () => 'Final Assembly',
        group: 'Assembly',
    },
    // ── Processing ────────────────────────────────────────────────────
    {
        code: 'Proc.', name: 'Processing',
        resolve: () => 'Processing',
        group: 'Processing',
    },
    // ── Final Inspection ──────────────────────────────────────────────
    {
        code: 'F.Insp', name: 'Final Inspection',
        resolve: () => 'Final Inspection',
        group: 'Final Inspection',
    },
    // ── Final Test ────────────────────────────────────────────────────
    {
        code: 'F.Chk', name: 'Final Check',
        resolve: () => 'Final Check',
        group: 'Final Test',
    },
];

function getVpxDisplayMeta() {
    return isKD2Module()
        ? {
            headerLabel: 'Battalion · Vehicle · Unit',
            exportTitle: 'Battalion Progress Matrix',
            exportSubtitle: 'Battalion-by-station planned vs actual',
            footerApp: 'KD2 Battalion Planning and Progress Control',
            workbookCreator: 'KD2 Battalion Planning and Progress Control',
            keyTitle: 'KD2 VPX — Key & Legend',
            filenamePrefix: 'KD2_BattalionProgress',
            emptyMessage: 'Load KD2 plan data to view the progress matrix.',
            noColumnsMessage: 'No KD2 station data is available for the current filters.',
        }
        : {
            headerLabel: 'Vehicle · Unit',
            exportTitle: 'Vehicle Production Progress',
            exportSubtitle: 'Station-by-Station Planned vs Actual',
            footerApp: 'KD1 Assembly Control System',
            workbookCreator: 'KD1 Assembly Control System',
            keyTitle: 'KD1 VPX — Key & Legend',
            filenamePrefix: 'KD1_VehicleProgress',
            emptyMessage: 'Load data to view the progress matrix.',
            noColumnsMessage: 'No station data matches the known column list.',
        };
}

function getKd2VpxColumnMeta(task) {
    const routeSequence = parseInt(task.route_sequence, 10) || parseInt(task.step_sequence, 10) || 9999;
    const group = task.category || getModuleCategory(task.process_station, task) || 'Other';
    const name = task.process_station || task.station_name || task.station_code || 'Station';
    const workCenter = String(task.work_center || '').trim();
    return {
        key: `${String(routeSequence).padStart(4, '0')}||${group}||${name}`,
        code: workCenter || name,
        name,
        group,
        order: routeSequence,
    };
}

function getVpxTaskStationKey(task) {
    if (!isKD2Module()) return task.process_station;
    return getKd2VpxColumnMeta(task).key;
}

function buildVpxColumns(data) {
    if (!isKD2Module()) return VPX_COLUMNS;

    const cols = new Map();
    data.forEach(task => {
        const meta = getKd2VpxColumnMeta(task);
        if (!cols.has(meta.key)) {
            cols.set(meta.key, {
                ...meta,
                vehicles: new Set(),
            });
        }
        cols.get(meta.key).vehicles.add(task.vehicle || '');
    });

    // Override order from module runtime route data (task.route_sequence may be absent in the view)
    const rt = getModuleRuntime?.();
    if (rt?.getStationRouteOrder) {
        const mergedOrder = new Map();
        ['K9', 'K10', 'K11'].forEach(v => {
            rt.getStationRouteOrder(v).forEach((seq, stationName) => {
                if (!mergedOrder.has(stationName) || seq < mergedOrder.get(stationName)) {
                    mergedOrder.set(stationName, seq);
                }
            });
        });
        cols.forEach(col => {
            if (mergedOrder.has(col.name)) col.order = mergedOrder.get(col.name);
        });
    }

    return [...cols.values()]
        .sort((a, b) => {
            if (a.order !== b.order) return a.order - b.order;
            const groupCmp = String(a.group || '').localeCompare(String(b.group || ''));
            if (groupCmp !== 0) return groupCmp;
            return String(a.name || '').localeCompare(String(b.name || ''));
        })
        .map(col => ({
            code: col.code,
            name: col.name,
            group: col.group,
            resolve: vehicle => col.vehicles.has(vehicle) ? col.key : null,
        }));
}

function buildVpxRows(data) {
    const rowMap = {};
    data.forEach(task => {
        const rowKey = isKD2Module()
            ? [task.battalion_code || '', task.vehicle || '', task.vehicle_no || ''].join('||')
            : [task.vehicle || '', task.vehicle_no || ''].join('||');
        if (!rowMap[rowKey]) {
            rowMap[rowKey] = {
                battalion_code: task.battalion_code || '',
                vehicle: task.vehicle,
                vehicle_no: task.vehicle_no,
                stations: {},
            };
        }
        const stationKey = getVpxTaskStationKey(task);
        const existing = rowMap[rowKey].stations[stationKey];
        if (!existing || task.end_date > existing.end_date) {
            rowMap[rowKey].stations[stationKey] = task;
        }
    });

    return Object.values(rowMap).sort((a, b) => {
        if (isKD2Module()) {
            const battalionCmp = String(a.battalion_code || '').localeCompare(String(b.battalion_code || ''), undefined, { numeric: true });
            if (battalionCmp !== 0) return battalionCmp;
        }
        const vc = vehicleSort(a.vehicle, b.vehicle);
        if (vc !== 0) return vc;
        return naturalSort(a.vehicle_no, b.vehicle_no);
    });
}

function getVpxTitleParts() {
    const parts = [getModuleBadge()];
    const battalion = isKD2Module() ? getVal('filterBattalion') : '';
    const vehicle = getVal('filterVehicle');
    const unit = getVal('filterUnit');
    const category = getVal('filterCategory');
    if (battalion) parts.push(battalion);
    if (vehicle) parts.push(vehicle);
    if (unit) parts.push(unit);
    if (category) parts.push(category);
    parts.push(getVpxDisplayMeta().exportTitle);
    return parts;
}

function getVpxRowPrimaryLabel(row) {
    return isKD2Module() ? `${row.vehicle} · ${row.vehicle_no}` : row.vehicle_no;
}

function getVpxRowSecondaryLabel(row) {
    const unitCode = getUnitCode(row.vehicle, row.vehicle_no);
    if (isKD2Module()) return [row.battalion_code || '', unitCode || ''].filter(Boolean).join(' · ');
    return unitCode;
}

function getVpxExportLabel(row) {
    if (!isKD2Module()) return row.vehicle + '\n' + unitLabel(row.vehicle, row.vehicle_no);
    return [row.battalion_code || '—', `${row.vehicle} · ${unitLabel(row.vehicle, row.vehicle_no)}`].join('\n');
}

function renderVPX(data) {
    const container = document.getElementById('vpxMatrix');
    if (!container) return;
    const meta = getVpxDisplayMeta();

    if (!data?.length) {
        container.innerHTML = `<div class="vpx-empty">${meta.emptyMessage}</div>`;
        return;
    }

    const rows = buildVpxRows(data);
    const activeCols = buildVpxColumns(data).filter(col =>
        rows.some(row => { const k = col.resolve(row.vehicle); return k !== null && row.stations[k]; })
    );

    if (!activeCols.length) {
        container.innerHTML = `<div class="vpx-empty">${meta.noColumnsMessage}</div>`;
        return;
    }

    // Column group spans
    const groups = [];
    activeCols.forEach(col => {
        if (!groups.length || groups[groups.length - 1].label !== col.group)
            groups.push({ label: col.group, span: 1 });
        else
            groups[groups.length - 1].span++;
    });

    function grpSlug(g) { return g.toLowerCase().replace(/[^a-z0-9]+/g, '-'); }

    let html = '<table class="vpx-table" role="grid"><thead>';

    // Group header row
    html += `<tr class="vpx-group-row"><th class="vpx-th-vehicle" rowspan="2">${meta.headerLabel.replace(/ · /g, ' &middot; ')}</th>`;
    groups.forEach(g => {
        html += '<th class="vpx-th-group vpx-grp-' + grpSlug(g.label) + '" colspan="' + g.span + '">' + g.label + '</th>';
    });
    html += '</tr><tr class="vpx-col-row">';
    activeCols.forEach((col, ci) => {
        html += '<th class="vpx-th-col vpx-grp-' + grpSlug(col.group) + '" data-col="' + ci + '" title="' + col.name + '">' + col.code + '</th>';
    });
    html += '</tr></thead><tbody>';

    rows.forEach((row, ri) => {
        const prevRow = ri > 0 ? rows[ri - 1] : null;
        const prevBattalion = prevRow?.battalion_code || null;
        const prevVehicle = prevRow?.vehicle || null;

        if (isKD2Module()) {
            // For KD2, add group header when battalion changes
            if (row.battalion_code !== prevBattalion) {
                html += '<tr class="vpx-row vpx-row-group vpx-row-battalion">';
                html += '<td class="vpx-td-vehicle vpx-td-group vpx-td-battalion" colspan="1">'
                    + '<div class="vpx-grp-inner">'
                    + '<svg class="vpx-bat-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M6 9h4M4 6h8M4 12h8"/></svg>'
                    + '<span class="vpx-battalion-name">' + esc(row.battalion_code || '—') + '</span>'
                    + '</div>'
                    + '</td>';
                activeCols.forEach(() => { html += '<td class="vpx-group-fill vpx-group-battalion"></td>'; });
                html += '</tr>';
            }

            // Add group header when vehicle changes within same battalion
            if (row.vehicle !== prevVehicle) {
                html += '<tr class="vpx-row vpx-row-group vpx-row-vehicle">';
                html += '<td class="vpx-td-vehicle vpx-td-group vpx-td-vehicle" colspan="1">'
                    + '<div class="vpx-grp-inner">'
                    + '<span class="vpx-veh-badge">' + esc(row.vehicle) + '</span>'
                    + '</div>'
                    + '</td>';
                activeCols.forEach(() => { html += '<td class="vpx-group-fill vpx-group-vehicle"></td>'; });
                html += '</tr>';
            }
        } else if (row.vehicle !== prevVehicle) {
            // For KD1, add group header only for vehicle changes
            html += '<tr class="vpx-row vpx-row-group">';
            html += '<td class="vpx-td-vehicle vpx-td-group" colspan="1">'
                + '<div class="vpx-grp-inner">'
                + '<span class="vpx-veh-badge">' + esc(row.vehicle) + '</span>'
                + '</div>'
                + '</td>';
            activeCols.forEach(() => { html += '<td class="vpx-group-fill"></td>'; });
            html += '</tr>';
        }

        html += '<tr class="vpx-row" data-ri="' + ri + '">';
        var primaryLabel = getVpxRowPrimaryLabel(row);
        var secondaryLabel = getVpxRowSecondaryLabel(row);
        html += '<td class="vpx-td-vehicle vpx-td-unit">'
            + '<div class="vpx-unit-inner">'
            + '<span class="vpx-unit-dot"></span>'
            + '<div class="vpx-unit-text">'
            + '<span class="vpx-unit-name">' + esc(primaryLabel) + '</span>'
            + (secondaryLabel ? '<span class="vpx-unit-code">' + esc(secondaryLabel) + '</span>' : '')
            + '</div>'
            + '</div>'
            + '</td>';

        activeCols.forEach((col, ci) => {
            var grpCls = 'vpx-grp-' + grpSlug(col.group);
            var stationKey = col.resolve(row.vehicle);

            if (stationKey === null) {
                html += '<td class="vpx-cell vpx-cell-na ' + grpCls + '" data-ri="' + ri + '" data-ci="' + ci + '" title="' + col.name + ' — N/A for ' + esc(row.vehicle) + '"><span class="vpx-na">N/A</span></td>';
                return;
            }

            var task = row.stations[stationKey];
            if (!task) {
                html += '<td class="vpx-cell vpx-cell-empty ' + grpCls + '" data-ri="' + ri + '" data-ci="' + ci + '" title="' + col.name + ' — not yet planned">—</td>';
                return;
            }

            var status = calculateStatus(task);
            var planned = task.end_date;
            var actual = (task.progress && task.progress.completion_date) || null;
            var actStart = (task.progress && task.progress.actual_start_date) || null;

            var dotClass = status === 'Completed' ? 'vpx-dot-ok'
                : status === 'In Progress' ? 'vpx-dot-prog'
                    : status === 'Late Completion' ? 'vpx-dot-late'
                        : status === 'Overdue' ? 'vpx-dot-over'
                            : 'vpx-dot-plan';

            var tipParts = [
                col.code + '  ' + task.process_station,
                'Planned    : ' + formatDate(task.start_date) + ' \u2192 ' + formatDate(planned),
                actStart ? 'Actual start: ' + formatDate(actStart) : null,
                actual ? 'Completed   : ' + formatDate(actual) : null,
                'Status     : ' + status,
                task.remark ? 'Remark      : ' + task.remark : null,
            ].filter(Boolean).join('\n');

            var statusSlug = status.toLowerCase().replace(/\s+/g, '-').replace('late-completion', 'late');

            // Short date ranges for planned and actual (no year)
            var planRange = formatDateShort(task.start_date) + ' → ' + formatDateShort(planned);
            var actRange = actStart
                ? formatDateShort(actStart) + ' → ' + (actual ? formatDateShort(actual) : '?')
                : (actual ? '? → ' + formatDateShort(actual) : null);

            html += '<td class="vpx-cell ' + grpCls + ' vpx-status-' + statusSlug + '" data-ri="' + ri + '" data-ci="' + ci + '" title="' + tipParts.replace(/"/g, "'") + '">'
                + '<span class="vpx-dot ' + dotClass + '"></span>'
                + '<div class="vpx-dates">'
                + '<span class="vpx-date-plan">' + planRange + '</span>'
                + '<span class="vpx-date-act' + (actRange ? '' : ' vpx-date-none') + '">' + (actRange || '—') + '</span>'
                + '</div></td>';
        });

        html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}
function renderCharts(data) {
    renderBarChart(data);
    renderLineChart(data);
}

function getChartGrouping(data) {
    if (!isKD2Module()) {
        return {
            keyLabel: 'vehicle',
            labels: [...new Set(data.map(row => row.vehicle).filter(Boolean))].sort(vehicleSort),
            valueFor: row => row.vehicle || 'Unknown',
        };
    }

    const battalions = [...new Set(data.map(row => row.battalion_code).filter(Boolean))].sort(naturalSort);
    if (battalions.length > 1) {
        return {
            keyLabel: 'battalion',
            labels: battalions,
            valueFor: row => row.battalion_code || 'Unknown',
        };
    }

    const vehicles = [...new Set(data.map(row => row.vehicle).filter(Boolean))].sort(vehicleSort);
    if (vehicles.length > 1) {
        return {
            keyLabel: 'vehicle',
            labels: vehicles,
            valueFor: row => row.vehicle || 'Unknown',
        };
    }

    const units = [...new Set(data.map(row => row.vehicle_no).filter(Boolean))].sort(naturalSort);
    if (units.length > 1) {
        return {
            keyLabel: 'unit',
            labels: units,
            valueFor: row => row.vehicle_no || 'Unknown',
        };
    }

    const categoryOrder = getActiveModuleConfig()?.categories || [];
    const categories = [...new Set(data.map(row => getModuleCategory(row.process_station, row)).filter(Boolean))]
        .sort((a, b) => {
            const aIdx = categoryOrder.indexOf(a);
            const bIdx = categoryOrder.indexOf(b);
            if (aIdx !== -1 || bIdx !== -1) {
                if (aIdx === -1) return 1;
                if (bIdx === -1) return -1;
                return aIdx - bIdx;
            }
            return naturalSort(a, b);
        });
    return {
        keyLabel: 'category',
        labels: categories,
        valueFor: row => getModuleCategory(row.process_station, row) || 'Other',
    };
}

function updateChartHeadings(grouping) {
    const barTitle = document.getElementById('barChartTitle');
    const barSubtitle = document.getElementById('barChartSubtitle');
    const lineTitle = document.getElementById('lineChartTitle');
    const lineSubtitle = document.getElementById('lineChartSubtitle');
    const groupingLabel = grouping ? grouping.charAt(0).toUpperCase() + grouping.slice(1) : 'Vehicle';

    if (barTitle) barTitle.textContent = 'Status Breakdown';
    if (barSubtitle) {
        barSubtitle.textContent = `Planned · Completed · Late Completion · Overdue by ${groupingLabel}`;
    }
    if (lineTitle) lineTitle.textContent = 'Cumulative Progress';
    if (lineSubtitle) {
        lineSubtitle.textContent = isKD2Module()
            ? 'Planned block completion vs actual completion'
            : 'Planned Completion vs Actual';
    }
}

function renderBarChart(data) {
    const grouping = getChartGrouping(data);
    const labels = grouping.labels;
    updateChartHeadings(grouping.keyLabel);

    const counts = labels.map(label => {
        const rows = data.filter(row => grouping.valueFor(row) === label);
        return {
            planned: rows.filter(r => calculateStatus(r) === 'Planned').length,
            completed: rows.filter(r => calculateStatus(r) === 'Completed').length,
            late: rows.filter(r => calculateStatus(r) === 'Late Completion').length,
            overdue: rows.filter(r => calculateStatus(r) === 'Overdue').length,
        };
    });

    const cfg = {
        type: 'bar',
        data: {
            labels: labels.length ? labels : ['No Data'],
            datasets: [
                {
                    label: 'Planned',
                    data: counts.map(c => c.planned),
                    backgroundColor: 'rgba(59,130,246,.75)',
                    borderColor: '#3b82f6',
                    borderWidth: 1,
                    borderRadius: 4,
                },
                {
                    label: 'Completed',
                    data: counts.map(c => c.completed),
                    backgroundColor: 'rgba(34,197,94,.75)',
                    borderColor: '#22c55e',
                    borderWidth: 1,
                    borderRadius: 4,
                },
                {
                    label: 'Late',
                    data: counts.map(c => c.late),
                    backgroundColor: 'rgba(59,130,246,.75)',
                    borderColor: '#3b82f6',
                    borderWidth: 1,
                    borderRadius: 4,
                },
                {
                    label: 'Overdue',
                    data: counts.map(c => c.overdue),
                    backgroundColor: 'rgba(239,68,68,.75)',
                    borderColor: '#ef4444',
                    borderWidth: 1,
                    borderRadius: 4,
                },
            ],
        },
        options: chartOptions(isKD2Module() ? 'Plan Blocks' : 'Status Count'),
    };

    if (barChartInst) barChartInst.destroy();
    barChartInst = new Chart(document.getElementById('barChart'), cfg);
}

function renderLineChart(data) {
    // Build daily timeline between min start_date and today
    if (!data.length) {
        if (lineChartInst) lineChartInst.destroy();
        lineChartInst = null;
        updateChartHeadings(getChartGrouping(data).keyLabel);
        return;
    }

    const dates = data.map(r => r.end_date).sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];

    const timeline = generateDateRange(minDate, maxDate);

    // Cumulative planned (tasks whose end_date <= date)
    const plannedCum = timeline.map(d =>
        data.filter(r => r.end_date <= d).length
    );

    // Cumulative actual completed (tasks completed by that date)
    const actualCum = timeline.map(d =>
        data.filter(r => {
            const s = calculateStatus(r);
            const cd = r.progress?.completion_date;
            return (s === 'Completed' || s === 'Late Completion') && cd && cd <= d;
        }).length
    );

    const labels = timeline.map(d => formatDate(d));

    const cfg = {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Planned (cumulative)',
                    data: plannedCum,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59,130,246,.08)',
                    borderWidth: 2,
                    fill: true,
                    tension: .35,
                    pointRadius: timeline.length > 30 ? 0 : 3,
                },
                {
                    label: 'Actual (cumulative)',
                    data: actualCum,
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34,197,94,.08)',
                    borderWidth: 2,
                    fill: true,
                    tension: .35,
                    pointRadius: timeline.length > 30 ? 0 : 3,
                    borderDash: [],
                },
            ],
        },
        options: {
            ...chartOptions(isKD2Module() ? 'Cumulative Plan Blocks' : 'Cumulative Tasks'),
            scales: {
                x: {
                    ticks: {
                        color: themeChartColors().text,
                        font: { family: 'DM Mono', size: 10 },
                        maxTicksLimit: 10,
                        maxRotation: 45,
                    },
                    grid: { color: themeChartColors().grid },
                },
                y: {
                    ticks: {
                        color: themeChartColors().text,
                        font: { family: 'DM Mono', size: 11 },
                        stepSize: 1,
                    },
                    grid: { color: themeChartColors().grid },
                    beginAtZero: true,
                },
            },
        },
    };

    if (lineChartInst) lineChartInst.destroy();
    lineChartInst = new Chart(document.getElementById('lineChart'), cfg);
}

function chartOptions(yLabel) {
    const c = themeChartColors();
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: {
                    color: c.text,
                    font: { family: 'Inter', size: 11 },
                    boxWidth: 12,
                    padding: 14,
                },
            },
            tooltip: {
                backgroundColor: c.tooltipBg,
                borderColor: c.tooltipBdr,
                borderWidth: 1,
                titleColor: c.tooltipTtl,
                bodyColor: c.tooltipBdy,
                padding: 10,
            },
        },
        scales: {
            x: {
                ticks: { color: c.text, font: { family: 'DM Mono', size: 11 } },
                grid: { color: c.grid },
            },
            y: {
                ticks: {
                    color: c.text,
                    font: { family: 'DM Mono', size: 11 },
                    stepSize: 1,
                },
                grid: { color: c.grid },
                beginAtZero: true,
                title: {
                    display: true,
                    text: yLabel,
                    color: c.axisLabel,
                    font: { size: 10, family: 'Inter' },
                },
            },
        },
    };
}

/* ──────────────────────────────────────────────────────────────────
   10. MARK COMPLETE
   ────────────────────────────────────────────────────────────────── */
/* ──────────────────────────────────────────────────────────────────
   10. MARK COMPLETE  /  SAVE ACTUAL START
   ────────────────────────────────────────────────────────────────── */

/**
 * Called automatically when the inline date input changes.
 * Pass empty string to clear the start date back to null.
 */
async function saveActualStart(planId, dateValue) {
    if (!canWrite()) { showToast('Viewer accounts cannot edit data.', 'error'); return; }

    const valueToSave = dateValue || null;

    try {
        // Fetch ALL rows for this plan_id — guard against duplicate rows
        const progressTable = getModuleProgressTable();
        const { data: allRows } = await db
            .from(progressTable).select('*').eq('plan_id', planId).order('updated_at', { ascending: false });

        const snapBefore = allRows?.[0] || null;

        // If duplicates exist, delete the extras to keep the table clean
        if (allRows && allRows.length > 1) {
            const extraIds = allRows.slice(1).map(r => r.id);
            await db.from(progressTable).delete().in('id', extraIds);
        }

        if (snapBefore) {
            const { error } = await db
                .from(progressTable)
                .update({ actual_start_date: valueToSave, updated_at: new Date().toISOString() })
                .eq('id', snapBefore.id);
            if (error) throw error;
        } else if (valueToSave) {
            const { error } = await db
                .from(progressTable)
                .insert({ plan_id: planId, actual_start_date: valueToSave, completed: false, updated_at: new Date().toISOString() });
            if (error) throw error;
        }

        // Snapshot after for audit
        const { data: snapAfter } = await db
            .from(progressTable).select('*').eq('plan_id', planId).maybeSingle();

        await auditLog(
            snapBefore ? 'UPDATE' : 'INSERT',
            progressTable, planId, snapBefore || null, snapAfter || null
        );

        showToast(valueToSave ? 'Start date saved.' : 'Start date cleared.', 'success');
        // In-place update: patch currentData and re-render without scroll reset
        const row = currentData.find(t => t.id === planId);
        if (row) {
            row.progress = snapAfter || row.progress || {};
            row.progress.actual_start_date = valueToSave;
            refreshAllViews();
        } else {
            await loadData();
        }

    } catch (err) {
        showToast('Error saving start date: ' + err.message, 'error');
        console.error(err);
    }
}

async function saveCompletionDate(planId, dateValue, silent = false) {
    // silent = cancel — just reload display without writing
    if (silent) { refreshAllViews(); return; }
    if (!canWrite()) { showToast('Viewer accounts cannot edit data.', 'error'); return; }

    const valueToSave = dateValue || null;

    try {
        const progressTable = getModuleProgressTable();
        const { data: allRowsC } = await db
            .from(progressTable).select('*').eq('plan_id', planId).order('updated_at', { ascending: false });

        const snapBefore = allRowsC?.[0] || null;

        if (allRowsC && allRowsC.length > 1) {
            const extraIds = allRowsC.slice(1).map(r => r.id);
            await db.from(progressTable).delete().in('id', extraIds);
        }

        if (snapBefore) {
            const { error } = await db
                .from(progressTable)
                .update({ completed: !!valueToSave, completion_date: valueToSave, updated_at: new Date().toISOString() })
                .eq('id', snapBefore.id);
            if (error) throw error;
        } else if (valueToSave) {
            const { error } = await db
                .from(progressTable)
                .insert({ plan_id: planId, completed: true, completion_date: valueToSave, updated_at: new Date().toISOString() });
            if (error) throw error;
        }

        const { data: snapAfter } = await db
            .from(progressTable).select('*').eq('plan_id', planId).maybeSingle();

        await auditLog(
            snapBefore ? 'UPDATE' : 'INSERT',
            progressTable, planId, snapBefore || null, snapAfter || null
        );

        showToast(valueToSave ? 'Completion date saved.' : 'Completion date cleared.', 'success');
        const row2 = currentData.find(t => t.id === planId);
        if (row2) {
            row2.progress = snapAfter || row2.progress || {};
            row2.progress.completed = !!valueToSave;
            row2.progress.completion_date = valueToSave;
            refreshAllViews();
        } else {
            await loadData();
        }

    } catch (err) {
        showToast('Error saving completion date: ' + err.message, 'error');
        console.error(err);
    }
}

/**
 * Save (or clear) just the notes field on an existing progress row.
 * Does NOT touch completed / completion_date.
 */
async function saveNoteOnly(planId, noteText) {
    const valueToSave = noteText.trim() || null;
    try {
        const progressTable = getModuleProgressTable();
        const { data: existing } = await db
            .from(progressTable)
            .select('id, notes')
            .eq('plan_id', planId)
            .maybeSingle();

        if (existing) {
                const before = { notes: existing.notes };
                const { error } = await db
                    .from(progressTable)
                    .update({ notes: valueToSave, updated_at: new Date().toISOString() })
                    .eq('id', existing.id);
                if (error) throw error;
            await auditLog('UPDATE', progressTable, planId,
                before, { notes: valueToSave });
            showToast(valueToSave ? 'Note updated.' : 'Note deleted.', 'success');
        } else {
            showToast('No progress record found to update.', 'error');
        }
    } catch (err) {
        showToast('Error saving note: ' + err.message, 'error');
        console.error(err);
    }
}

function openCompleteModal(planId, idx) {
    activePlanId = planId;
    // Always look up by planId — idx can drift after in-place re-renders
    const row = currentData.find(t => t.id === planId) || currentData[idx];
    const actualStart = row.progress?.actual_start_date;

    document.getElementById('modalInfo').innerHTML = `
    <strong>${esc(row.vehicle)} · ${esc(row.vehicle_no)}${getUnitCode(row.vehicle, row.vehicle_no) ? ' <span style="font-weight:400;opacity:.7;font-size:.85em">(' + esc(getUnitCode(row.vehicle, row.vehicle_no)) + ')</span>' : ''}</strong><br>
    ${esc(row.process_station)}<br>
    <small>Planned: ${formatDate(row.start_date)} → ${formatDate(row.end_date)}</small>
    ${actualStart ? `<br><small>Actual start: ${formatDate(actualStart)}</small>` : ''}
  `;
    document.getElementById('modalDate').value = todayStr();
    document.getElementById('modalNotes').value = row.progress?.notes || '';

    document.getElementById('modalOverlay').style.display = 'flex';
}

function closeModal() {
    document.getElementById('modalOverlay').style.display = 'none';
    activePlanId = null;
}

async function markComplete() {
    if (!canWrite()) { showToast('Viewer accounts cannot edit data.', 'error'); return; }
    if (!activePlanId) return;

    const planId = activePlanId;
    const compDate = document.getElementById('modalDate').value;
    const notes = document.getElementById('modalNotes').value.trim();

    if (!compDate) { showToast('Please select a completion date.', 'error'); return; }

    closeModal();

    try {
        const progressTable = getModuleProgressTable();
        const { data: allRowsM } = await db
            .from(progressTable).select('*').eq('plan_id', planId).order('updated_at', { ascending: false });

        const snapBefore = allRowsM?.[0] || null;

        if (allRowsM && allRowsM.length > 1) {
            const extraIds = allRowsM.slice(1).map(r => r.id);
            await db.from(progressTable).delete().in('id', extraIds);
        }

        const payload = {
            plan_id: planId,
            completed: true,
            completion_date: compDate,
            notes,
            actual_start_date: snapBefore?.actual_start_date || null,
            updated_at: new Date().toISOString(),
        };

        let opError;
        if (snapBefore) {
                const { error } = await db
                    .from(progressTable)
                    .update({ completed: true, completion_date: compDate, notes, updated_at: payload.updated_at })
                    .eq('id', snapBefore.id);
                opError = error;
        } else {
            const { error } = await db.from(progressTable).insert(payload);
            opError = error;
        }
        if (opError) throw opError;

        const { data: snapAfter } = await db
            .from(progressTable).select('*').eq('plan_id', planId).maybeSingle();

        await auditLog(
            snapBefore ? 'UPDATE' : 'INSERT',
            progressTable, planId, snapBefore || null, snapAfter || null
        );

        showToast('Progress saved successfully.', 'success');
        const mRow = currentData.find(t => t.id === planId);
        if (mRow) {
            mRow.progress = snapAfter || mRow.progress || {};
            mRow.progress.completed = true;
            mRow.progress.completion_date = compDate;
            mRow.progress.notes = notes || null;
            refreshAllViews();
        } else {
            await loadData();
        }

    } catch (err) {
        showToast('Error saving progress: ' + err.message, 'error');
        console.error(err);
    }
}

/* ──────────────────────────────────────────────────────────────────
   11. IMPORT CSV
   ────────────────────────────────────────────────────────────────── */
async function importPlan() {
    if (!canWrite()) { showToast('Viewer accounts cannot import data.', 'error'); return; }
    if (isKD2Module()) { showToast('KD2 import is not enabled in this phase yet.', 'error'); return; }

    const raw = document.getElementById('importText').value.trim();
    if (!raw) { showToast('No data pasted.', 'error'); return; }

    const lines = raw.split('\n').filter(l => l.trim());
    const rows = [];

    for (const line of lines) {
        const parts = line.split(/,|\t/).map(p => p.trim());
        if (parts.length < 6) continue;
        const [vehicle, vehicle_no, process_station, week, rawStart, rawEnd, ...remarkParts] = parts;
        const start_date = parseDateStr(rawStart);
        const end_date = parseDateStr(rawEnd);
        if (!start_date || !end_date) continue;
        const computedWeek = start_date ? weekLabel(start_date) : (week || null);
        rows.push({ vehicle, vehicle_no, process_station, week: computedWeek, start_date, end_date, remark: remarkParts.join(',').trim() });
    }

    if (!rows.length) { showToast('No valid rows found. Check format.', 'error'); return; }

    try {
        const { error } = await db.from('assembly_plan').insert(rows);
        if (error) throw error;

        await auditLog('INSERT', 'assembly_plan', 'bulk-import', null,
            { rows_added: rows.length });

        showToast(`${rows.length} rows imported successfully.`, 'success');
        document.getElementById('importText').value = '';
        document.getElementById('importPanel').style.display = 'none';
        await loadFilters();
        await loadData();

    } catch (err) {
        showToast('Import error: ' + err.message, 'error');
        console.error(err);
    }
}

/* ──────────────────────────────────────────────────────────────────
   12. EVENT WIRING
   ────────────────────────────────────────────────────────────────── */
function wireEvents() {
    // Filters
    document.getElementById('btnApply').addEventListener('click', loadData);
    document.getElementById('btnReset').addEventListener('click', resetFilters);
    document.getElementById('btnGanttLegendToggle')?.addEventListener('click', () => {
        _ganttLegendOpen = !_ganttLegendOpen;
        syncGanttLegendUi();
    });

    // Cascade: when vehicle changes, update unit dropdown to match
    document.getElementById('filterVehicle')?.addEventListener('change', onVehicleFilterChange);
    
    // Reload data when K9 component filter changes
    document.getElementById('filterK9Component')?.addEventListener('change', loadData);
    document.getElementById('filterTimeFrame').addEventListener('change', function () {
        const isCustom = this.value === 'custom';
        document.getElementById('customDateStart').style.display = isCustom ? '' : 'none';
        document.getElementById('customDateEnd').style.display = isCustom ? '' : 'none';
    });

    // Import panel
    document.getElementById('btnImport').addEventListener('click', () => {
        const panel = document.getElementById('importPanel');
        panel.style.display = panel.style.display === 'none' ? '' : 'none';
    });
    document.getElementById('btnImportSubmit').addEventListener('click', importPlan);
    document.getElementById('btnImportCancel').addEventListener('click', () => {
        document.getElementById('importPanel').style.display = 'none';
    });

    // Modal — Mark Complete
    document.getElementById('modalConfirm').addEventListener('click', markComplete);
    document.getElementById('modalCancel').addEventListener('click', closeModal);
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', function (e) {
        if (e.target === this) closeModal();
    });

    // Gantt controls
    wireGanttControls();
    bindVpxFullscreenUi();

    // Report modal
    wireReportModal();

    // ── Auth controls ────────────────────────────────────────────────
    document.getElementById('btnLogout')?.addEventListener('click', doLogout);

    // Unit Codes (admin+ — button hidden for viewers/planners)
    document.getElementById('btnUnitCodes')?.addEventListener('click', openUnitCodes);
    document.getElementById('unitCodesClose')?.addEventListener('click', closeUnitCodes);
    document.getElementById('unitCodesOverlay')?.addEventListener('click', function (e) {
        if (e.target === this) closeUnitCodes();
    });
    document.getElementById('btnAddUnitCode')?.addEventListener('click', () => openUcForm(null));
    document.getElementById('btnUcSave')?.addEventListener('click', saveUnitCode);
    document.getElementById('btnUcCancel')?.addEventListener('click', closeUcForm);
    document.getElementById('ucFormClose')?.addEventListener('click', closeUcForm);
    document.getElementById('ucBattalion')?.addEventListener('change', populateUcUnits);
    document.getElementById('ucVehicle')?.addEventListener('change', populateUcUnits);

    // User Management (master_admin only — button hidden for others)
    document.getElementById('btnUserMgmt')?.addEventListener('click', openUserMgmt);
    document.getElementById('userMgmtClose')?.addEventListener('click', closeUserMgmt);
    document.getElementById('userMgmtOverlay')?.addEventListener('click', function (e) {
        if (e.target === this) closeUserMgmt();
    });
    document.getElementById('btnAddUser')?.addEventListener('click', () => openUserForm(null));
    document.getElementById('btnUmSave')?.addEventListener('click', saveUser);
    document.getElementById('btnUmCancel')?.addEventListener('click', closeUserForm);
    document.getElementById('umFormClose')?.addEventListener('click', closeUserForm);

    // Audit Log (master_admin only — button hidden for others)
    document.getElementById('btnAuditLog')?.addEventListener('click', openAuditLog);
    document.getElementById('auditLogClose')?.addEventListener('click', closeAuditLog);
    document.getElementById('auditLogOverlay')?.addEventListener('click', function (e) {
        if (e.target === this) closeAuditLog();
    });
    document.getElementById('btnAlApply')?.addEventListener('click', () => loadAuditLog(true));
    document.getElementById('btnAlReset')?.addEventListener('click', resetAuditFilters);

    // ── Live table search (wire ONCE here, not inside resetFilters) ────
    document.getElementById('tableSearch')?.addEventListener('input', function () {
        const q = this.value.trim().toLowerCase();
        const cat = getVal('filterCategory');
        const base = cat ? currentData.filter(r => getModuleCategory(r.process_station, r) === cat) : currentData;
        const filtered = q ? base.filter(r =>
            (r.vehicle || '').toLowerCase().includes(q) ||
            (r.vehicle_no || '').toLowerCase().includes(q) ||
            (r.process_station || '').toLowerCase().includes(q) ||
            (r.remark || '').toLowerCase().includes(q) ||
            (r.week || '').toLowerCase().includes(q)
        ) : base;
        const pos = saveScrollPos();
        renderTable(filtered);
        document.getElementById('rowCount').textContent =
            filtered.length + ' record' + (filtered.length !== 1 ? 's' : '') + (q ? ' (filtered)' : '');
        restoreScrollPos(pos);
    });

    // VPX PDF export
    document.getElementById('btnVpxPdf')?.addEventListener('click', exportVpxPDF);
    document.getElementById('btnVpxExcel')?.addEventListener('click', exportVpxExcel);
}

function resetFilters() {
    ['filterBattalion', 'filterVehicle', 'filterUnit', 'filterWeek', 'filterCategory'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const tf = document.getElementById('filterTimeFrame');
    if (tf) tf.value = 'all';
    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    document.getElementById('customDateStart').style.display = 'none';
    document.getElementById('customDateEnd').style.display = 'none';
    const srch = document.getElementById('tableSearch');
    if (srch) srch.value = '';
    // Restore full unit list with no vehicle scope
    populateUnitFilter(null);
    loadData();
}

/* ──────────────────────────────────────────────────────────────────
   13. UI UTILITIES
   ────────────────────────────────────────────────────────────────── */
function setConnStatus(state, label) {
    const el = document.getElementById('connIndicator');
    const lbl = el.querySelector('.conn-label');
    el.className = `conn-indicator ${state}`;
    lbl.textContent = label;
}

function setTableLoading(loading) {
    const tbody = document.getElementById('tableBody');
    if (loading) {
        tbody.innerHTML = `
      <tr>
        <td colspan="13" class="table-empty">
          <div class="empty-state">
            <span class="spinner"></span>
            <p>Loading data…</p>
          </div>
        </td>
      </tr>`;
    }
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function animateCount(id, target) {
    const el = document.getElementById(id);
    const start = parseInt(el.textContent) || 0;
    const dur = 400;
    const t0 = performance.now();

    function step(now) {
        const p = Math.min((now - t0) / dur, 1);
        el.textContent = Math.round(start + (target - start) * easeOut(p));
        if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

function startClock() {
    function tick() {
        const now = new Date();
        document.getElementById('headerClock').textContent =
            now.toLocaleTimeString('en-GB', { hour12: false });
        document.getElementById('headerDate').textContent =
            now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    tick();
    setInterval(tick, 1000);
}

/* ──────────────────────────────────────────────────────────────────
   14. DATE / STRING UTILITIES
   ────────────────────────────────────────────────────────────────── */

/**
 * Natural (numeric-aware) string comparison.
 * "K9" < "K10" < "K11",  "M1" < "M2" < "M10"
 * Splits each string into alternating text/number chunks and
 * compares numbers numerically, text alphabetically.
 */
function naturalSort(a, b) {
    const re = /(\d+)|(\D+)/g;
    const tokA = String(a ?? '').match(re) || [];
    const tokB = String(b ?? '').match(re) || [];
    const len = Math.max(tokA.length, tokB.length);

    for (let i = 0; i < len; i++) {
        if (i >= tokA.length) return -1;
        if (i >= tokB.length) return 1;
        const numA = parseFloat(tokA[i]);
        const numB = parseFloat(tokB[i]);
        const cmp = (!isNaN(numA) && !isNaN(numB))
            ? numA - numB
            : tokA[i].localeCompare(tokB[i]);
        if (cmp !== 0) return cmp;
    }
    return 0;
}

/**
 * Vehicle-specific sort: K9 → K10 → K11 → K9-FOC → K10-FOC → K11-FOC
 * Rule: non-FOC variants come before FOC variants; within each group,
 * sort numerically (naturalSort on the base number).
 */
function vehicleSort(a, b) {
    const focA = /foc/i.test(String(a));
    const focB = /foc/i.test(String(b));
    if (focA !== focB) return focA ? 1 : -1;   // non-FOC first
    return naturalSort(a, b);                   // same group → numeric order
}
function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

function formatDate(isoStr) {
    if (!isoStr || isoStr === '—') return '—';
    const d = new Date(isoStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Short date — "01 Jan" (no year), used in VPX cells */
function formatDateShort(isoStr) {
    if (!isoStr || isoStr === '—') return '—';
    const d = new Date(isoStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/** Return the unit code for a vehicle+unit combo, or '' */
function getUnitCode(vehicle, vehicle_no) {
    return unitCodeMap[vehicle + '||' + vehicle_no] || '';
}

/** Format unit label: "M1" or "M1 · EGY N25020" */
function unitLabel(vehicle, vehicle_no) {
    const code = getUnitCode(vehicle, vehicle_no);
    return code ? vehicle_no + ' · ' + code : vehicle_no;
}

function daysBetween(from, to) {
    const a = new Date(from + 'T00:00:00');
    const b = new Date(to + 'T00:00:00');
    return Math.max(0, Math.round((b - a) / 86400000));
}

function currentWeekRange() {
    const now = new Date();
    const day = now.getDay();            // 0=Sun … 6=Sat
    // Work week: Saturday(6) -> Thursday(4); Friday(5) is skipped.
    const diff = day === 6 ? 0 : day === 5 ? -6 : -(day + 1);
    const sat = new Date(now);
    sat.setDate(now.getDate() + diff);
    const thu = new Date(sat);
    thu.setDate(sat.getDate() + 5);
    return {
        weekStart: localDateStr(sat),
        weekEnd: localDateStr(thu),
    };
}

function currentMonthRange() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const monthStart = new Date(y, m, 1).toISOString().slice(0, 10);
    const monthEnd = new Date(y, m + 1, 0).toISOString().slice(0, 10);
    return { monthStart, monthEnd };
}

function generateDateRange(startStr, endStr) {
    const dates = [];
    const cur = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00');

    while (cur <= end) {
        dates.push(cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() + 1);
    }
    return dates;
}

/** Parse dates like "23-Feb-26", "23-Feb-2026", or ISO "2026-02-23" */
function parseDateStr(raw) {
    if (!raw) return null;
    raw = raw.trim();

    // Already ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    // DD-Mon-YY or DD-Mon-YYYY
    const m = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
    if (m) {
        const months = {
            jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
            jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
        };
        const day = m[1].padStart(2, '0');
        const mon = months[m[2].toLowerCase()];
        let yr = m[3];
        if (yr.length === 2) yr = '20' + yr;
        if (!mon) return null;
        return `${yr}-${mon}-${day}`;
    }

    return null;
}

function getVal(id) {
    return document.getElementById(id)?.value?.trim() || '';
}

function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ──────────────────────────────────────────────────────────────────
   15. BOOTSTRAP
   ────────────────────────────────────────────────────────────────── */

/* ================================================================
   THEME ENGINE  — dark (default) / light
   Preference stored in localStorage so it survives page reloads.
   Applied on <html> via data-theme attribute to leverage CSS vars.
   Must run synchronously before DOMContentLoaded to prevent flash.
   ================================================================ */
const THEME_KEY = 'kd1_theme';

(function applyStoredTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light') document.documentElement.setAttribute('data-theme', 'light');
})();

function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
}

function setTheme(theme) {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem(THEME_KEY, theme);
    // Re-render charts with correct palette for new theme
    if (currentData.length) refreshAllViews();
}

function toggleTheme() {
    setTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark');
}

/** Return the correct colour set for charts based on current theme */
function themeChartColors() {
    const light = getCurrentTheme() === 'light';
    return {
        text: light ? '#475569' : '#7a8baa',
        grid: light ? '#e2e8f0' : '#2a3350',
        tooltipBg: light ? '#1e293b' : '#161b27',
        tooltipBdr: light ? '#334155' : '#2a3350',
        tooltipTtl: light ? '#f1f5f9' : '#e2e8f4',
        tooltipBdy: light ? '#94a3b8' : '#7a8baa',
        axisLabel: light ? '#94a3b8' : '#4a5575',
    };
}

document.addEventListener('DOMContentLoaded', () => {
    // Wire theme toggle
    document.getElementById('btnTheme')?.addEventListener('click', toggleTheme);
    document.getElementById('btnGanttTheme')?.addEventListener('click', toggleTheme);
    initializeApp();
});
/* ================================================================
   GANTT CHART ADDITIONS — append to bottom of app.js
   Then apply the two small patches described at the bottom.
   ================================================================ */

/* ──────────────────────────────────────────────────────────────────
   GANTT CONSTANTS
   ────────────────────────────────────────────────────────────────── */
const GANTT_LABEL_W = 220;   // px — frozen left label column width
const GANTT_DAY_W = 36;    // px — width of each day column
const GANTT_ROW_H = 40;    // px — unit row height
const GANTT_GRP_H = 30;    // px — vehicle group header row height

// Colour palette for process stations (cycles if > 10 unique stations)
const GANTT_PALETTE = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
    '#06b6d4', '#f97316', '#84cc16', '#6366f1', '#e11d48',
    '#0ea5e9', '#a855f7', '#d97706', '#4ade80', '#38bdf8',
];
const _stationColors = {};
let _colorIdx = 0;

function ganttStationColor(name) {
    if (!_stationColors[name]) {
        _stationColors[name] = GANTT_PALETTE[_colorIdx++ % GANTT_PALETTE.length];
    }
    return _stationColors[name];
}
window.__ppmsGanttStationColor = ganttStationColor;

/* ──────────────────────────────────────────────────────────────────
   SPECIAL BACKGROUND ZONES
   Add / edit entries here to show coloured bands on the gantt.
   type must match a CSS class: gc-zone-{type}
   ────────────────────────────────────────────────────────────────── */
const SPECIAL_ZONES = [
    // { start: '2026-03-20', end: '2026-03-25', type: 'holiday', label: 'Public Holiday' },
    // { start: '2026-03-26', end: '2026-04-05', type: 'fat',     label: 'FAT Period'     },
];

/* ──────────────────────────────────────────────────────────────────
   FISCAL WEEK NUMBER  (production week starts Saturday)
   ────────────────────────────────────────────────────────────────── */
function getISOWeekInfoForDate(d) {
    const thu = new Date(d);
    thu.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3);
    const year = thu.getFullYear();
    const jan4 = new Date(year, 0, 4);
    const week = 1 + Math.round((thu - jan4) / (7 * 86400000));
    return { week, year };
}

/**
 * Production FW label. A production week runs Saturday -> Thursday,
 * with Friday excluded. The FW number is anchored to that window's Thursday.
 */
function getISOWeekInfo(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    const startOffset = day === 6 ? 0 : day === 5 ? -6 : -(day + 1);
    const productionThu = new Date(d);
    productionThu.setDate(d.getDate() + startOffset + 5);
    return getISOWeekInfoForDate(productionThu);
}

/** Return ISO week number (1–53) for a date string. */
function getISOWeek(dateStr) {
    return getISOWeekInfo(dateStr).week;
}

/**
 * Return a "FW##" label derived from a task's start_date.
 * This is the canonical week stored on every plan row.
 */
function weekLabel(dateStr) {
    const { week } = getISOWeekInfo(dateStr);
    return 'FW' + String(week).padStart(2, '0');
}

/**
 * Given a week label like "FW09" (optionally "FW9"), return the
 * Saturday and Thursday production window for the current or nearest year.
 * Returns { weekStart, weekEnd } as YYYY-MM-DD strings.
 */
function isoWeekDateRange(label) {
    const num = parseInt(label.replace(/[^0-9]/g, ''), 10);
    if (!num) return null;
    // Determine which year: use the year whose FW#{num} is closest to today
    const todayD = new Date(todayStr() + 'T00:00:00');
    const year = todayD.getFullYear();
    // Jan 4 of that year is always in ISO week 1. Use that week number,
    // but expose the production window as Saturday -> Thursday.
    function weekStart(y) {
        const jan4 = new Date(y, 0, 4);
        const w1Mon = new Date(jan4);
        w1Mon.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
        const mon = new Date(w1Mon);
        mon.setDate(w1Mon.getDate() + (num - 1) * 7);
        const sat = new Date(mon);
        sat.setDate(mon.getDate() - 2);
        const thu = new Date(sat);
        thu.setDate(sat.getDate() + 5);
        return { weekStart: localDateStr(sat), weekEnd: localDateStr(thu) };
    }
    // Try current year; if the week is in the past by more than 26 weeks, try next year
    const r = weekStart(year);
    const delta = (new Date(r.weekStart + 'T00:00:00') - todayD) / 86400000;
    if (delta < -183) return weekStart(year + 1);
    return r;
}

/* ──────────────────────────────────────────────────────────────────
   WIRE GANTT CONTROLS  — call from wireEvents()
   ────────────────────────────────────────────────────────────────── */
function wireGanttControls() {
    const gsEl = document.getElementById('ganttStart');
    const geEl = document.getElementById('ganttEnd');

    document.getElementById('btnGanttRefresh')?.addEventListener('click', () => {
        renderGantt(currentData, gsEl?.value, geEl?.value);
    });
    syncGanttLegendUi();
}

function setGanttRangeFromData(data) {
    if (!data?.length) return;
    let minDate = '', maxDate = '';
    for (const r of data) {
        const s = r.start_date || '';
        const e = r.end_date || '';
        if (s && (!minDate || s < minDate)) minDate = s;
        if (e && (!maxDate || e > maxDate)) maxDate = e;
    }
    if (!minDate || !maxDate) return;
    const gsEl = document.getElementById('ganttStart');
    const geEl = document.getElementById('ganttEnd');
    if (gsEl) gsEl.value = minDate;
    if (geEl) geEl.value = maxDate;
}

/* ──────────────────────────────────────────────────────────────────
   MAIN RENDER FUNCTION
   Call:  renderGantt(plansArray, 'YYYY-MM-DD', 'YYYY-MM-DD')
   ────────────────────────────────────────────────────────────────── */
function renderGantt(plans, startDate, endDate) {
    const inner = document.getElementById('ganttInner');
    if (!inner) return;
    const previousGanttScroll = saveGanttScrollPos();

    if (!startDate || !endDate || startDate > endDate) {
        inner.innerHTML = `
      <div class="gantt-empty-state">
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="6" y="6" width="36" height="36" rx="4"/>
          <path d="M14 18h20M14 26h12M14 34h8"/>
        </svg>
        <p>Load data and set a date range, then click <strong>Refresh</strong> to render the schedule.</p>
      </div>`;
        const legend = document.getElementById('ganttLegend');
        if (legend) legend.innerHTML = '';
        syncGanttLegendUi();
        _ganttHasRenderedOnce = false;
        return;
    }

    // ── 1. Build day array (Fridays excluded from grid) ─────────────
    const allDays = generateDateRange(startDate, endDate);
    // Strip out every Friday — they are never shown as columns
    const days = allDays.filter(d => new Date(d + 'T00:00:00').getDay() !== 5);
    const numDays = days.length;
    const totalW = numDays * GANTT_DAY_W;
    const innerW = GANTT_LABEL_W + totalW;
    const today = todayStr();

    // Pre-compute metadata for each non-Friday day
    const dayMeta = days.map(d => {
        const dt = new Date(d + 'T00:00:00');
        const dow = dt.getDay();
        return {
            date: d,
            dayNum: dt.getDate(),
            month: dt.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
            isoWeek: getISOWeek(d),
            isSat: dow === 6,
            isToday: d === today,
        };
    });

    // Fast lookup: date string → column index (Fridays have no entry)
    const dayIndex = Object.fromEntries(days.map((d, i) => [d, i]));
    const specialZones = getModuleGanttZones(startDate, endDate);
    const isKd2ProcessView = isKD2Module() && getModuleRuntime()?.currentTimelineViewMode?.() === 'process';
    const holidayStatusByDay = new Map();
    const holidayLabelsByDay = new Map();
    specialZones
        .filter(zone => (zone?.type === 'holiday' || zone?.type === 'holiday-inactive') && zone.start && zone.end)
        .forEach(zone => {
            const label = String(zone.label || 'No-work Day').trim() || 'No-work Day';
            const isInactive = zone.type === 'holiday-inactive';
            let cursor = zone.start;
            let guard = 0;
            while (cursor <= zone.end && guard++ < 400) {
                if (dayIndex[cursor] !== undefined) {
                    holidayStatusByDay.set(cursor, isInactive ? 'inactive' : 'active');
                    if (!holidayLabelsByDay.has(cursor)) holidayLabelsByDay.set(cursor, new Set());
                    holidayLabelsByDay.get(cursor).add(label);
                }
                cursor = addDays(cursor, 1);
            }
        });

    /**
     * Resolve a date to the nearest column index.
     * If the date is a Friday (not in dayIndex), snap forward to Saturday
     * (or Monday if Saturday is also absent), then fall back to clamping.
     */
    function resolveCol(dateStr, clampFallback) {
        if (dayIndex[dateStr] !== undefined) return dayIndex[dateStr];
        // Try next few days
        for (let n = 1; n <= 3; n++) {
            const next = addDays(dateStr, n);
            if (dayIndex[next] !== undefined) return dayIndex[next];
        }
        // Try previous days
        for (let n = 1; n <= 3; n++) {
            const prev = addDays(dateStr, -n);
            if (dayIndex[prev] !== undefined) return dayIndex[prev];
        }
        return clampFallback;
    }

    // ── 2. Group plans ─────────────────────────────────────────────
    // Only include tasks that overlap the visible date range
    const visible = plans.filter(p =>
        p.start_date <= endDate && p.end_date >= startDate
    );

    const groups = {};
    const laneMetaMap = {};
    const ensureGroupLane = (groupKey, laneKey) => {
        if (!groups[groupKey]) groups[groupKey] = {};
        if (!groups[groupKey][laneKey]) groups[groupKey][laneKey] = [];
    };
    const laneMetaKey = (groupKey, laneKey) => `${groupKey}|||${laneKey}`;
    const vehicleFilter = getVal('filterVehicle');
    const unitFilter = getVal('filterUnit');
    const battalionFilter = isKD2Module() ? getVal('filterBattalion') : '';
    const _unitSelG = document.getElementById('filterUnit');
    const _unitVehicleG = _unitSelG?.options[_unitSelG?.selectedIndex]?.dataset?.vehicle || '';
    const effectiveVehicleFilter = vehicleFilter || _unitVehicleG;
    if (!isKd2ProcessView) {
        unitRegistryRows
            .filter(row =>
                (!effectiveVehicleFilter || row.vehicle === effectiveVehicleFilter) &&
                (!unitFilter || row.vehicle_no === unitFilter) &&
                (!battalionFilter || !isKD2Module() || row.battalion_code === battalionFilter)
            )
            .forEach(row => {
                const groupKey = isKD2Module() ? (row.battalion_code || '—') : row.vehicle;
                const laneKey = isKD2Module() ? `${row.vehicle}||${row.vehicle_no}` : row.vehicle_no;
                ensureGroupLane(groupKey, laneKey);
                laneMetaMap[laneMetaKey(groupKey, laneKey)] = {
                    battalion_id: row.battalion_id ?? null,
                    battalion_code: row.battalion_code || '',
                    vehicle_type: row.vehicle_type || row.vehicle || '',
                    unit_serial: row.unit_serial ?? null,
                    unit_label: row.unit_label || row.vehicle_no || '',
                };
            });
    }
    visible.forEach(p => {
        const groupKey = isKd2ProcessView
            ? (p.vehicle || '—')
            : (isKD2Module() ? (p.battalion_code || '—') : p.vehicle);
        const laneKey = isKd2ProcessView
            ? (p.process_station || '—')
            : (isKD2Module() ? `${p.vehicle}||${p.vehicle_no}` : p.vehicle_no);
        ensureGroupLane(groupKey, laneKey);
        groups[groupKey][laneKey].push(p);
        laneMetaMap[laneMetaKey(groupKey, laneKey)] = {
            battalion_id: p.battalion_id ?? null,
            battalion_code: p.battalion_code || '',
            vehicle_type: p.vehicle_type || p.vehicle || '',
            unit_serial: p.unit_serial ?? null,
            unit_label: p.unit_label || p.vehicle_no || '',
        };
    });

    const groupKeys = Object.keys(groups).sort((a, b) =>
        isKd2ProcessView
            ? vehicleSort(a, b)
            : isKD2Module()
                ? a.localeCompare(b, undefined, { numeric: true })
                : vehicleSort(a, b)
    );

    if (!groupKeys.length) {
        clearGanttHoverGuide();
        inner.innerHTML = `
      <div class="gantt-empty-state">
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="6" y="6" width="36" height="36" rx="4"/>
          <path d="M14 24h20M24 14v20"/>
        </svg>
        <p>No tasks fall within the selected date range.</p>
      </div>`;
        const legend = document.getElementById('ganttLegend');
        if (legend) legend.innerHTML = '';
        syncGanttLegendUi();
        const zoneKeyEl = document.getElementById('ganttZoneKey');
        if (zoneKeyEl) zoneKeyEl.style.display = 'none';
        _ganttHasRenderedOnce = false;
        return;
    }

    // ── 3. Header HTML ─────────────────────────────────────────────
    let mHtml = `<div class="gh-corner" style="width:${GANTT_LABEL_W}px;height:28px"></div>`;
    let wHtml = `<div class="gh-corner" style="width:${GANTT_LABEL_W}px;height:22px"></div>`;
    let dHtml = `<div class="gh-corner gh-corner-label" style="width:${GANTT_LABEL_W}px;height:28px">${isKd2ProcessView ? 'Vehicle / Station' : isKD2Module() ? 'Battalion / Vehicle / Unit' : 'Vehicle / Unit'}</div>`;

    let runMonth = '', runMonthSpan = 0;
    let runWeek = -1, runWeekSpan = 0;

    dayMeta.forEach((dm, i) => {
        // Month grouping
        if (dm.month !== runMonth) {
            if (runMonth) {
                mHtml += `<div class="gh-month" style="width:${runMonthSpan * GANTT_DAY_W}px">${runMonth}</div>`;
            }
            runMonth = dm.month; runMonthSpan = 1;
        } else { runMonthSpan++; }

        // Fiscal week grouping
        if (dm.isoWeek !== runWeek) {
            if (runWeek !== -1) {
                wHtml += `<div class="gh-week" style="width:${runWeekSpan * GANTT_DAY_W}px">FW${runWeek}</div>`;
            }
            runWeek = dm.isoWeek; runWeekSpan = 1;
        } else { runWeekSpan++; }

        // Day cell
        const holidayLabels = holidayLabelsByDay.get(dm.date);
        const dayTitle = holidayLabels?.size ? ` title="${esc([...holidayLabels].join(', '))}"` : '';
        const holidayStatus = holidayStatusByDay.get(dm.date) || '';
        const holidayClass = holidayStatus === 'inactive'
            ? ' gh-day-holiday-inactive'
            : holidayStatus === 'active'
                ? ' gh-day-holiday'
                : '';
        dHtml += `<div class="gh-day${dm.isSat ? ' gh-day-sat' : ''}${holidayClass}${dm.isToday ? ' gh-day-today' : ''}"
      data-gantt-date="${dm.date}" style="width:${GANTT_DAY_W}px;height:28px"${dayTitle}>${dm.dayNum}</div>`;
    });

    // Flush last groups
    mHtml += `<div class="gh-month" style="width:${runMonthSpan * GANTT_DAY_W}px">${runMonth}</div>`;
    wHtml += `<div class="gh-week"  style="width:${runWeekSpan * GANTT_DAY_W}px">FW${runWeek}</div>`;

    // ── 4. Background day cells (shared template per row) ─────────
    const bgCells = dayMeta.map(dm =>
        `<div class="gc-cell${dm.isSat ? ' gc-cell-sat' : ''}" data-gantt-date="${dm.date}" style="width:${GANTT_DAY_W}px"></div>`
    ).join('');

    // ── 5. Special zone bands ──────────────────────────────────────
    let zonesHtml = '';
    specialZones.forEach(z => {
        // Clamp zone to visible range
        const s = z.start > startDate ? z.start : startDate;
        const e = z.end < endDate ? z.end : endDate;
        const si = dayIndex[s] ?? resolveCol(s, null);
        const ei = dayIndex[e] ?? resolveCol(e, null);
        if (si === null || ei === null || si > ei) return;

        const left = GANTT_LABEL_W + si * GANTT_DAY_W;
        const width = (ei - si + 1) * GANTT_DAY_W;
        const isHolidayZone = z.type === 'holiday' || z.type === 'holiday-inactive';
        const zoneTitle = isHolidayZone ? '' : ` title="${esc(z.label || z.type)}"`;
        const zoneLabel = isHolidayZone ? '' : `<span class="gc-zone-label">${esc(z.label || z.type)}</span>`;
        zonesHtml += `
      <div class="gc-zone gc-zone-${esc(z.type)}"
           style="left:${left}px;width:${width}px"${zoneTitle}>
        ${zoneLabel}
      </div>`;
    });

    // Today marker
    const todayCol = dayIndex[today] ?? resolveCol(today, null);
    if (todayCol !== null) {
        const todayLeft = GANTT_LABEL_W + todayCol * GANTT_DAY_W + Math.floor(GANTT_DAY_W / 2);
        zonesHtml += `<div class="gc-today-line" style="left:${todayLeft}px"></div>`;
    }

    // ── 6. Body rows ───────────────────────────────────────────────
    let bodyHtml = zonesHtml;

    groupKeys.forEach(groupKey => {
        const unitKeys = Object.keys(groups[groupKey]).sort((a, b) => {
            if (isKd2ProcessView) {
                const routeOrder = getModuleRuntime()?.getStationRouteOrder?.(groupKey) || new Map();
                const seqA = routeOrder.get(a) ?? 9999;
                const seqB = routeOrder.get(b) ?? 9999;
                if (seqA !== seqB) return seqA - seqB;
                return a.localeCompare(b, undefined, { numeric: true });
            }
            if (!isKD2Module()) return naturalSort(a, b);
            const [vehicleA, ...unitAParts] = a.split('||');
            const [vehicleB, ...unitBParts] = b.split('||');
            const vehicleCmp = vehicleSort(vehicleA, vehicleB);
            if (vehicleCmp !== 0) return vehicleCmp;
            return naturalSort(unitAParts.join('||'), unitBParts.join('||'));
        });

        // Vehicle group header row
        bodyHtml += `
      <div class="gr gr-group" style="height:${GANTT_GRP_H}px">
        <div class="gr-label gr-group-label" style="width:${GANTT_LABEL_W}px">
          <svg class="gr-label-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="2" y="3" width="12" height="10" rx="1.5"/>
            <path d="M5 8h6M5 11h4"/>
          </svg>
          ${esc(groupKey)}
        </div>
        <div class="gr-track gr-track-group" style="width:${totalW}px">${bgCells}</div>
      </div>`;

        const vehicleSections = (!isKd2ProcessView && isKD2Module())
            ? [...new Set(unitKeys.map(unit => unit.split('||')[0]).filter(Boolean))]
                .sort(vehicleSort)
                .map(vehicle => ({
                    vehicle,
                    units: unitKeys.filter(unit => unit.startsWith(vehicle + '||')),
                }))
            : [{ vehicle: groupKey, units: unitKeys }];

        vehicleSections.forEach(section => {
            if (!isKd2ProcessView && isKD2Module() && section.units.length) {
                bodyHtml += `
      <div class="gr gr-subgroup" style="height:${Math.max(30, GANTT_GRP_H - 8)}px">
        <div class="gr-label gr-subgroup-label" style="width:${GANTT_LABEL_W}px">
          <span class="gr-subgroup-badge">${esc(section.vehicle)}</span>
        </div>
        <div class="gr-track gr-track-subgroup" style="width:${totalW}px">${bgCells}</div>
      </div>`;
            }

            section.units.forEach(unit => {
            const tasks = groups[groupKey][unit] || [];
            const laneVehicle = isKd2ProcessView ? groupKey : (isKD2Module() ? unit.split('||')[0] : groupKey);
            const laneUnit = isKd2ProcessView ? unit : (isKD2Module() ? unit.split('||').slice(1).join('||') : unit);
            const laneMeta = laneMetaMap[laneMetaKey(groupKey, unit)] || {};

            // ── Lane assignment for overlapping bars ─────────────────────
            const positioned = buildPositionedGanttLaneTasks(tasks, startDate, endDate);
            const numLanes = positioned.length
                ? Math.max(...positioned.map(item => item.lane)) + 1
                : 1;
            const BAR_H = 22;   // px — bar height per lane
            const BAR_GAP = 6;    // px — gap between lanes
            const LANE_H = BAR_H + BAR_GAP;
            const rowH = Math.max(GANTT_ROW_H, numLanes * LANE_H + BAR_GAP * 2);

            // ── Build bar HTML ───────────────────────────────────────────
            const bars = positioned.map(({ task, si, ei, lane }) => {
                const left = si * GANTT_DAY_W;
                const width = Math.max((ei - si + 1) * GANTT_DAY_W - 3, 6);
                // Vertical centre of this lane
                const topPx = BAR_GAP + lane * LANE_H + Math.floor((LANE_H - BAR_H) / 2);

                const color = ganttStationColor(task.process_station);
                const status = calculateStatus(task);
                const highlightState = ganttHighlightState(task);
                const actualStart = task.progress?.actual_start_date || null;

                let extraCls = ` gc-bar-state-${highlightState}`;
                if (status === 'Overdue') extraCls += ' gc-bar-overdue';

                let actualStartMarker = '';
                if (actualStart && dayIndex[actualStart] !== undefined) {
                    const aIdx = dayIndex[actualStart];
                    const tickLeft = (aIdx - si) * GANTT_DAY_W;
                    const tickColor = actualStart > task.start_date ? '#ef4444' : '#22c55e';
                    actualStartMarker = `<div class="gc-actual-start-tick" style="left:${tickLeft}px;border-color:${tickColor}" title="Actual start: ${formatDate(actualStart)}"></div>`;
                }

                const tip = [
                    isKD2Module() ? `${task.battalion_code || '—'}  ${task.vehicle}  ${task.vehicle_no}` : `${task.vehicle}  ${task.vehicle_no}`,
                    `Station      : ${task.process_station}`,
                    isKD2Module() ? `Work Center  : ${getRowCode(task)}` : '',
                    `Planned      : ${formatDate(task.start_date)} → ${formatDate(task.end_date)}`,
                    actualStart ? `Actual Start : ${formatDate(actualStart)}` : '',
                    task.progress?.completion_date ? `Completed    : ${formatDate(task.progress.completion_date)}` : '',
                    `Status       : ${status}`,
                    task.remark ? `Remark       : ${task.remark}` : '',
                ].filter(Boolean).join('\n');

                const menuIsOpen = _openGanttBlockMenuPlanId === task.id;
                const isSelected = _selectedGanttPlanIds.has(task.id);
                const blockMenu = _ganttEditMode ? `
          <button type="button" class="gc-bar-select${isSelected ? ' gc-bar-select-active' : ''}" data-plan-id="${task.id}" title="Select block" aria-label="Select block" aria-pressed="${isSelected ? 'true' : 'false'}"></button>
          <button type="button" class="gc-bar-menu-trigger" data-plan-id="${task.id}" title="Block options" aria-label="Block options" aria-expanded="${menuIsOpen ? 'true' : 'false'}">
            <span class="gc-bar-menu-trigger-dots" aria-hidden="true">
              <span class="gc-bar-menu-trigger-dot"></span>
              <span class="gc-bar-menu-trigger-dot"></span>
              <span class="gc-bar-menu-trigger-dot"></span>
            </span>
          </button>
          <div class="gc-bar-menu" role="menu" aria-label="Block options">
            <div class="gc-bar-menu-head">
              <div class="gc-bar-menu-title-wrap">
                <span class="gc-bar-menu-title">Block Actions</span>
                <span class="gc-bar-menu-subtitle">Move or update this block</span>
              </div>
              <button type="button" class="gc-bar-menu-close" data-plan-id="${task.id}" aria-label="Close block options">&times;</button>
            </div>
            <div class="gc-bar-menu-body">
              <button type="button" class="gc-bar-menu-item gc-bar-menu-item-move gc-bar-lane-up" data-plan-id="${task.id}" role="menuitem">
                <span class="gc-bar-menu-icon" aria-hidden="true">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M8 12V4"/>
                    <path d="M4.75 7.25 8 4l3.25 3.25"/>
                  </svg>
                </span>
                <span class="gc-bar-menu-copy">
                  <span class="gc-bar-menu-label">Move up</span>
                  <span class="gc-bar-menu-hint">Swap with the block above</span>
                </span>
              </button>
              <button type="button" class="gc-bar-menu-item gc-bar-menu-item-move gc-bar-lane-dn" data-plan-id="${task.id}" role="menuitem">
                <span class="gc-bar-menu-icon" aria-hidden="true">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M8 4v8"/>
                    <path d="m4.75 8.75 3.25 3.25 3.25-3.25"/>
                  </svg>
                </span>
                <span class="gc-bar-menu-copy">
                  <span class="gc-bar-menu-label">Move down</span>
                  <span class="gc-bar-menu-hint">Swap with the block below</span>
                </span>
              </button>
              <button type="button" class="gc-bar-menu-item gc-bar-menu-edit" data-plan-id="${task.id}" role="menuitem">
                <span class="gc-bar-menu-icon" aria-hidden="true">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3.25 12.75h2.2l6.05-6.05-2.2-2.2-6.05 6.05v2.2Z"/>
                    <path d="m8.55 4.5 2.2 2.2"/>
                  </svg>
                </span>
                <span class="gc-bar-menu-copy">
                  <span class="gc-bar-menu-label">Edit</span>
                  <span class="gc-bar-menu-hint">Change dates and details</span>
                </span>
              </button>
              <button type="button" class="gc-bar-menu-item gc-bar-menu-delete gc-bar-menu-danger" data-plan-id="${task.id}" role="menuitem">
                <span class="gc-bar-menu-icon" aria-hidden="true">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3.75 4.75h8.5"/>
                    <path d="M6.25 4.75V3.5h3.5v1.25"/>
                    <path d="M5 6.25v5.25"/>
                    <path d="M8 6.25v5.25"/>
                    <path d="M11 6.25v5.25"/>
                    <path d="M4.5 4.75l.55 7.1a1 1 0 0 0 1 .9h3.9a1 1 0 0 0 1-.9l.55-7.1"/>
                  </svg>
                </span>
                <span class="gc-bar-menu-copy">
                  <span class="gc-bar-menu-label">Delete</span>
                  <span class="gc-bar-menu-hint">Remove this block from the plan</span>
                </span>
              </button>
            </div>
          </div>` : '';
                return `<div class="gc-bar${extraCls}${menuIsOpen ? ' gc-bar-menu-open' : ''}${isSelected ? ' gc-bar-selected' : ''}"
          data-plan-id="${task.id}"
          style="left:${left}px;width:${width}px;height:${BAR_H}px;top:${topPx}px;transform:none;background:${color}"
          title="${esc(tip)}">
          ${actualStartMarker}
          <span class="gc-bar-text">${esc(isKd2ProcessView ? `${task.battalion_code || '—'} · ${task.vehicle_no}` : isKD2Module() ? `${getRowCode(task)} · ${task.process_station}` : task.process_station)}</span>
          ${blockMenu}
        </div>`;
            }).join('');

            const rowMenuOpen = _ganttEditMode && positioned.some(item => item.task.id === _openGanttBlockMenuPlanId);
            const anchorTask = positioned[0]?.task || null;
            const laneSelected = anchorTask
                ? currentData.filter(row => samePlanLane(row, anchorTask)).every(row => _selectedGanttPlanIds.has(row.id))
                : false;
            bodyHtml += `
        <div class="gr${rowMenuOpen ? ' gc-row-menu-open' : ''}" style="height:${rowH}px">
          <div class="gr-label gr-unit-label" style="width:${GANTT_LABEL_W}px">
            <span class="gr-unit-dot"></span>
            <span class="gr-unit-name">${esc(isKd2ProcessView ? laneUnit : isKD2Module() ? `${laneVehicle} · ${unitLabel(laneVehicle, laneUnit)}` : unitLabel(laneVehicle, laneUnit))}</span>
            ${isKD2Module() && _ganttEditMode && _ganttSelectLaneMode && anchorTask ? `<button type="button" class="gantt-lane-select-btn" data-gantt-lane-select="${anchorTask.id}" aria-pressed="${laneSelected ? 'true' : 'false'}">${laneSelected ? 'Clear lane' : 'Select lane'}</button>` : ''}
          </div>
          <div class="gr-track" style="width:${totalW}px;height:${rowH}px"
            data-kd2-track="${isKD2Module() ? 'true' : ''}"
            data-kd2-lane-key="${esc(unit)}"
            data-battalion-id="${esc(laneMeta.battalion_id ?? '')}"
            data-battalion-code="${esc(laneMeta.battalion_code || groupKey || '')}"
            data-vehicle-type="${esc(laneMeta.vehicle_type || laneVehicle || '')}"
            data-unit-serial="${esc(laneMeta.unit_serial ?? '')}"
            data-unit-label="${esc(laneMeta.unit_label || laneUnit || '')}"
            data-gantt-days="${esc(days.join(','))}">
            ${bgCells}
            ${bars}
          </div>
        </div>`;
            });
        });
    });

    // ── 7. Assemble ────────────────────────────────────────────────
    clearGanttHoverGuide();
    inner.innerHTML = `
    <div class="gantt-wrap" style="min-width:${innerW}px">
      <div class="gantt-head">
        <div class="gh-row gh-row-month">${mHtml}</div>
        <div class="gh-row gh-row-week">${wHtml}</div>
        <div class="gh-row gh-row-day">${dHtml}</div>
      </div>
      <div class="gantt-body">${bodyHtml}</div>
    </div>`;
    wireGanttHoverGuide();

    // ── 8. Legend ──────────────────────────────────────────────────
    const legend = document.getElementById('ganttLegend');
    if (legend) {
        const legendStations = [...new Set(visible.map(plan => String(plan.process_station || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        legend.innerHTML = legendStations.length ? `
      <div class="gantt-legend-head">
        <span class="gantt-legend-title">Visible Stations</span>
        <span class="gantt-legend-meta">${legendStations.length} station${legendStations.length === 1 ? '' : 's'} in range</span>
      </div>
      <div class="gantt-legend-grid">
        ${legendStations.map(name => `
          <div class="gantt-legend-item">
            <span class="gantt-legend-dot" style="background:${ganttStationColor(name)}"></span>
            <span class="gantt-legend-label">${esc(name)}</span>
          </div>
        `).join('')}
      </div>` : '';
    }
    syncGanttLegendUi();

    // ── 9. Show zone key bar if zones exist ────────────────────────
    const zoneKeyEl = document.getElementById('ganttZoneKey');
    if (zoneKeyEl) zoneKeyEl.style.display = specialZones.length ? 'flex' : 'none';

    // ── 10. Preserve viewport after edits/reloads ──────────────────
    if (_ganttHasRenderedOnce && previousGanttScroll) {
        restoreGanttScrollPos(previousGanttScroll);
    } else if (dayIndex[today] !== undefined) {
        const scrollRoot = document.getElementById('ganttScrollRoot');
        if (scrollRoot) {
            const todayPx = GANTT_LABEL_W + dayIndex[today] * GANTT_DAY_W;
            const offset = Math.max(0, todayPx - scrollRoot.clientWidth / 2);
            setTimeout(() => { scrollRoot.scrollLeft = offset; }, 60);
        }
    }
    _ganttHasRenderedOnce = true;
    requestAnimationFrame(positionOpenGanttBlockMenu);
}

/* ================================================================
   REPORT ENGINE
   PDF  → jsPDF + jsPDF-AutoTable
   Excel→ SheetJS (XLSX)
   ================================================================ */

/* ─── Report definitions ────────────────────────────────────────── */
const REPORT_TYPES = {
    full: { label: 'Full Report', filter: () => true },
    today: { label: "Today's Plan", filter: r => r.start_date <= todayStr() && r.end_date >= todayStr() },
    overdue: { label: 'Overdue Report', filter: r => calculateStatus(r) === 'Overdue' },
    inprogress: { label: 'In Progress Report', filter: r => calculateStatus(r) === 'In Progress' },
    completed: { label: 'Completed Report', filter: r => ['Completed', 'Late Completion'].includes(calculateStatus(r)) },
    late: { label: 'Late Completions', filter: r => calculateStatus(r) === 'Late Completion' },
    planned: { label: 'Not Started Report', filter: r => calculateStatus(r) === 'Planned' },
    vehicle: {
        label: 'By Vehicle Report', filter: r => {
            const v = getVal('filterVehicle');
            return v ? r.vehicle === v : true;
        }
    },
};

/* ─── Build the row array for a report ─────────────────────────── */
function buildReportRows(typeKey, fromDate, toDate, category) {
    const def = REPORT_TYPES[typeKey];
    if (!def) return [];

    let rows = currentData.filter(def.filter);

    if (fromDate) rows = rows.filter(r => r.start_date >= fromDate);
    if (toDate) rows = rows.filter(r => r.start_date <= toDate);
    if (category) rows = rows.filter(r => getModuleCategory(r.process_station, r) === category);

    return rows;
}

/* ─── Column config ─────────────────────────────────────────────── */
const REPORT_COLUMNS = [
    { header: '#', key: (r, i) => i + 1 },
    { header: 'Vehicle', key: r => r.vehicle },
    { header: 'Unit', key: r => r.vehicle_no },
    { header: 'Station', key: r => r.process_station },
    { header: 'Code / Work Center', key: r => getRowCode(r) },
    { header: 'Category', key: r => getModuleCategory(r.process_station, r) },
    { header: 'Week', key: r => r.week || '—' },
    { header: 'Planned Start', key: r => formatDate(r.start_date) },
    { header: 'Planned End', key: r => formatDate(r.end_date) },
    { header: 'Actual Start', key: r => r.progress?.actual_start_date ? formatDate(r.progress.actual_start_date) : '—' },
    { header: 'Completed On', key: r => r.progress?.completion_date ? formatDate(r.progress.completion_date) : '—' },
    { header: 'Status', key: r => calculateStatus(r) },
    {
        header: 'Delay (days)', key: r => {
            const d = delayDays(r);
            return d > 0 ? `+${d}d` : calculateStatus(r) === 'Completed' ? 'On Time' : '—';
        }
    },
    { header: 'Remark', key: r => r.remark || '' },
    { header: 'Completion Note', key: r => r.progress?.notes || '' },
];

/* ─── Status → colour map for PDF ──────────────────────────────── */
const STATUS_COLORS = {
    'Completed': [34, 197, 94],
    'Late Completion': [59, 130, 246],  // blue
    'Overdue': [220, 38, 38],
    'In Progress': [245, 158, 11],
    'Planned': [59, 130, 246],
};

/* ─── Summary stats block ───────────────────────────────────────── */
function buildSummaryStats(rows) {
    const total = rows.length;
    const completed = rows.filter(r => calculateStatus(r) === 'Completed').length;
    const late = rows.filter(r => calculateStatus(r) === 'Late Completion').length;
    const overdue = rows.filter(r => calculateStatus(r) === 'Overdue').length;
    const inProgress = rows.filter(r => calculateStatus(r) === 'In Progress').length;
    const planned = rows.filter(r => calculateStatus(r) === 'Planned').length;
    const pct = total ? Math.round(((completed + late) / total) * 100) : 0;
    return { total, completed, late, overdue, inProgress, planned, pct };
}

/* ══════════════════════════════════════════════════════════════════
   PDF EXPORT  — white / print-friendly theme
   ══════════════════════════════════════════════════════════════════ */
function exportPDF(typeKey, fromDate, toDate, category) {
    const def = REPORT_TYPES[typeKey];
    const rows = buildReportRows(typeKey, fromDate, toDate, category);

    if (!rows.length) {
        showToast('No data matches this report criteria.', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const MARGIN = 14;
    const now = new Date().toLocaleString('en-GB');
    const stats = buildSummaryStats(rows);
    const vehicle = getVal('filterVehicle') || 'All';
    const battalion = isKD2Module() ? (getVal('filterBattalion') || 'All') : '';
    const moduleBadge = getModuleBadge();
    const moduleTitle = getModuleReportTitle();
    const moduleSubtitle = getModuleReportSubtitle();

    // ── White page background ─────────────────────────────────────────
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

    // ── Header band — navy blue accent bar ───────────────────────────
    doc.setFillColor(30, 58, 138);      // navy
    doc.rect(0, 0, PAGE_W, 20, 'F');

    // Module badge box
    doc.setFillColor(59, 130, 246);
    doc.roundedRect(MARGIN, 4, 18, 12, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(moduleBadge, MARGIN + 9, 11.5, { align: 'center' });

    // Title
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text(moduleTitle, MARGIN + 22, 10);

    // Sub-title / report label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(147, 197, 253);   // light blue
    doc.text(`${moduleSubtitle.toUpperCase()} · ${def.label.toUpperCase()}`, MARGIN + 22, 16);

    // Generated timestamp (right-aligned)
    doc.setFontSize(7.5);
    doc.setTextColor(186, 230, 253);
    doc.text(`Generated: ${now}`, PAGE_W - MARGIN, 16, { align: 'right' });

    // ── Active filter chips (vehicle / category / date) ───────────────
    let chipX = MARGIN;
    const chipY = 24;
    const chipH = 6;
    const chipPad = 3;
    const chips = [];
    if (battalion && battalion !== 'All') chips.push(`Battalion: ${battalion}`);
    if (vehicle !== 'All') chips.push(`Vehicle: ${vehicle}`);
    if (category) chips.push(`Category: ${category}`);
    if (fromDate || toDate) chips.push(`Date: ${fromDate || '…'} → ${toDate || '…'}`);

    chips.forEach(label => {
        const w = doc.getTextWidth(label) + chipPad * 2;
        doc.setFillColor(239, 246, 255);
        doc.setDrawColor(147, 197, 253);
        doc.roundedRect(chipX, chipY, w, chipH, 1, 1, 'FD');
        doc.setTextColor(30, 64, 175);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.text(label, chipX + chipPad, chipY + chipH - 1.5);
        chipX += w + 4;
    });

    // ── Summary stats row ─────────────────────────────────────────────
    const stats_y = chips.length ? 34 : 26;
    const boxes = [
        { label: 'Total Tasks', value: stats.total, r: 30, g: 58, b: 138 },
        { label: 'Completed', value: stats.completed, r: 22, g: 163, b: 74 },
        { label: 'In Progress', value: stats.inProgress, r: 217, g: 119, b: 6 },
        { label: 'Overdue', value: stats.overdue, r: 220, g: 38, b: 38 },
        { label: 'Late Completion', value: stats.late, r: 59, g: 130, b: 246 },
        { label: 'Not Started', value: stats.planned, r: 100, g: 116, b: 139 },
        { label: 'Completion %', value: `${stats.pct}%`, r: 15, g: 118, b: 110 },
    ];

    const boxW = (PAGE_W - MARGIN * 2) / boxes.length;
    boxes.forEach((b, i) => {
        const bx = MARGIN + i * boxW;

        // Card background
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(b.r, b.g, b.b);
        doc.setLineWidth(0.4);
        doc.roundedRect(bx, stats_y, boxW - 2, 14, 2, 2, 'FD');

        // Top accent line
        doc.setFillColor(b.r, b.g, b.b);
        doc.rect(bx, stats_y, boxW - 2, 2, 'F');

        // Value
        doc.setTextColor(b.r, b.g, b.b);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(String(b.value), bx + (boxW - 2) / 2, stats_y + 8, { align: 'center' });

        // Label
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.text(b.label.toUpperCase(), bx + (boxW - 2) / 2, stats_y + 12.5, { align: 'center' });
    });

    // ── Data table ────────────────────────────────────────────────────
    const tableTop = stats_y + 18;
    const headers = REPORT_COLUMNS.map(c => c.header);
    const body = rows.map((r, i) => REPORT_COLUMNS.map(c => String(c.key(r, i) ?? '')));

    // Status badge colours for white background (darker shades)
    const STATUS_COLORS_LIGHT = {
        'Completed': { bg: [220, 252, 231], text: [21, 128, 61] },
        'Late Completion': { bg: [219, 234, 254], text: [37, 99, 235] },  // blue
        'Overdue': { bg: [254, 226, 226], text: [153, 27, 27] },
        'In Progress': { bg: [254, 243, 199], text: [146, 64, 14] },
        'Planned': { bg: [219, 234, 254], text: [30, 64, 175] },
    };

    doc.autoTable({
        startY: tableTop,
        head: [headers],
        body: body,
        margin: { left: MARGIN, right: MARGIN },
        styles: {
            fontSize: 7.5,
            cellPadding: 2.5,
            font: 'helvetica',
            textColor: [30, 41, 59],       // slate-800
            fillColor: [255, 255, 255],
            lineColor: [226, 232, 240],    // slate-200
            lineWidth: 0.25,
            overflow: 'linebreak',
        },
        headStyles: {
            fillColor: [30, 58, 138],      // navy — matches header bar
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 7,
            halign: 'center',
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252],      // slate-50
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 8 },
            1: { cellWidth: 16 },
            2: { cellWidth: 14 },
            3: { cellWidth: 28 },
            4: { cellWidth: 18 },
            5: { cellWidth: 12 },
            6: { cellWidth: 20 },
            7: { cellWidth: 20 },
            8: { cellWidth: 20 },
            9: { cellWidth: 20 },
            10: { halign: 'center', cellWidth: 18 },
            11: { halign: 'center', cellWidth: 16 },
            12: { cellWidth: 28, overflow: 'linebreak', valign: 'top' },
            13: { cellWidth: 40, overflow: 'linebreak', valign: 'top' },
        },
        didDrawCell(data) {
            if (data.section === 'body' && data.column.index === 10) {
                const status = data.cell.raw;
                const clr = STATUS_COLORS_LIGHT[status];
                if (clr) {
                    // Badge background
                    doc.setFillColor(...clr.bg);
                    doc.setDrawColor(...clr.bg);
                    const px = data.cell.x + 1;
                    const py = data.cell.y + 1.5;
                    const pw = data.cell.width - 2;
                    const ph = data.cell.height - 3;
                    doc.roundedRect(px, py, pw, ph, 1, 1, 'F');
                    // Badge text
                    doc.setTextColor(...clr.text);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(6);
                    doc.text(status, px + pw / 2, py + ph / 2 + 0.5, { align: 'center', baseline: 'middle' });
                }
            }
            // Delay cell — erase autoTable text then redraw in red
            if (data.section === 'body' && data.column.index === 11) {
                const val = String(data.cell.raw || '');
                if (val.startsWith('+')) {
                    // Cover the black text autoTable already drew
                    const bg = data.row.index % 2 === 0 ? [255, 255, 255] : [248, 250, 252];
                    doc.setFillColor(...bg);
                    doc.rect(data.cell.x + 0.2, data.cell.y + 0.2,
                        data.cell.width - 0.4, data.cell.height - 0.4, 'F');
                    // Redraw in red
                    doc.setTextColor(153, 27, 27);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(7);
                    doc.text(val, data.cell.x + data.cell.width / 2,
                        data.cell.y + data.cell.height / 2,
                        { align: 'center', baseline: 'middle' });
                }
            }
        },
        didDrawPage(data) {
            // Thin navy top stripe on continuation pages
            if (data.pageNumber > 1) {
                doc.setFillColor(30, 58, 138);
                doc.rect(0, 0, PAGE_W, 6, 'F');
                doc.setTextColor(186, 230, 253);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(6.5);
                doc.text(`${moduleBadge} ${moduleTitle} — ${def.label}`, MARGIN, 4.5);
            }
            // Footer separator line
            const pY = PAGE_H - 8;
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.3);
            doc.line(MARGIN, pY, PAGE_W - MARGIN, pY);

            doc.setFontSize(6.5);
            doc.setTextColor(148, 163, 184);
            doc.setFont('helvetica', 'normal');
            doc.text(`${moduleBadge} ${moduleTitle} — Confidential`, MARGIN, pY + 3.5);
            doc.text(
                `Page ${data.pageNumber} of ${doc.internal.getNumberOfPages()}`,
                PAGE_W - MARGIN, pY + 3.5, { align: 'right' }
            );
        },
    });

    // ── Save ─────────────────────────────────────────────────────────
    const catSuffix = category ? `_${category.replace(/\s+/g, '_')}` : '';
    const dateSuffix = new Date().toISOString().slice(0, 10);
    doc.save(`${moduleBadge}_${def.label.replace(/\s+/g, '_')}${catSuffix}_${dateSuffix}.pdf`);
    showToast(`PDF exported — ${rows.length} rows`, 'success');
}

/* ══════════════════════════════════════════════════════════════════
   EXCEL EXPORT
   ══════════════════════════════════════════════════════════════════ */
async function exportExcel(typeKey, fromDate, toDate, category) {
    if (typeof ExcelJS === 'undefined') {
        showToast('ExcelJS not loaded — please wait and try again.', 'error'); return;
    }

    const def = REPORT_TYPES[typeKey];
    const rows = buildReportRows(typeKey, fromDate, toDate, category);
    if (!rows.length) { showToast('No data matches this report criteria.', 'error'); return; }

    const stats = buildSummaryStats(rows);

    // ── Active filter labels for title ─────────────────────────────
    const moduleBadge = getModuleBadge();
    const fBattalion = isKD2Module() ? getVal('filterBattalion') : '';
    const fVehicle = getVal('filterVehicle');
    const fUnit = getVal('filterUnit');
    const fWeek = getVal('filterWeek');
    const fTF = getVal('filterTimeFrame');
    const fCategory = category || getVal('filterCategory');
    const fFrom = fromDate || getVal('filterStartDate');
    const fTo = toDate || getVal('filterEndDate');

    const titleParts = [moduleBadge];
    if (fBattalion) titleParts.push(fBattalion);
    if (fVehicle) titleParts.push(fVehicle);
    if (fUnit) titleParts.push(fUnit);
    if (fCategory) titleParts.push(fCategory);
    titleParts.push(def.label);
    const sheetTitle = titleParts.join(' · ');

    const filterChips = [];
    if (fBattalion) filterChips.push('Battalion: ' + fBattalion);
    if (fVehicle) filterChips.push('Vehicle: ' + fVehicle);
    if (fUnit) filterChips.push(isKD2Module()
        ? 'Unit: ' + fUnit
        : 'Unit: ' + (getUnitCode(fVehicle, fUnit) ? fUnit + ' · ' + getUnitCode(fVehicle, fUnit) : fUnit));
    if (fWeek) filterChips.push('Week: ' + fWeek);
    if (fTF && fTF !== 'custom') filterChips.push('Time Frame: ' + fTF);
    if (fFrom || fTo) filterChips.push('Dates: ' + (fFrom || '…') + ' → ' + (fTo || '…'));
    if (fCategory) filterChips.push('Category: ' + fCategory);

    // ── Colour palette (matches VPX Excel) ─────────────────────────
    const ST = {
        'Completed': { bg: 'FFdcfce7', fg: 'FF15803d', dot: 'FF22c55e' },
        'In Progress': { bg: 'FFfef9c3', fg: 'FF854d0e', dot: 'FFf59e0b' },
        'Late Completion': { bg: 'FFdbeafe', fg: 'FF1d4ed8', dot: 'FF3b82f6' },
        'Overdue': { bg: 'FFfee2e2', fg: 'FF991b1b', dot: 'FFdc2626' },
        'Planned': { bg: 'FFf8fafc', fg: 'FF475569', dot: 'FF94a3b8' },
    };
    const NAV = 'FF1e293b';
    const HDR = 'FFf1f5f9';
    const MUTE = 'FF64748b';
    const BORD = 'FFe2e8f0';
    const BORD_MED = 'FF94a3b8';
    const WHITE = 'FFffffff';
    const ALT = 'FFf9fafb';

    function border(style = 'thin') {
        return {
            top: { style, color: { argb: BORD } }, bottom: { style, color: { argb: BORD } },
            left: { style, color: { argb: BORD } }, right: { style, color: { argb: BORD } }
        };
    }
    function hdrBorder() {
        return {
            top: { style: 'medium', color: { argb: BORD_MED } }, bottom: { style: 'medium', color: { argb: BORD_MED } },
            left: { style: 'thin', color: { argb: BORD } }, right: { style: 'thin', color: { argb: BORD } }
        };
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = `${moduleBadge} ${getModuleReportTitle()}`;
    wb.created = new Date();

    // ════════════════════════════════════════════════════════════════
    //  SHEET 1 — Report Data
    // ════════════════════════════════════════════════════════════════
    const ws = wb.addWorksheet('Report Data', {
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
        views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }],
    });

    // Column config — add Unit Code after Unit
    const COLS = [
        { header: '#', width: 5, key: (r, i) => i + 1 },
        { header: 'Vehicle', width: 10, key: r => r.vehicle },
        { header: 'Unit', width: 10, key: r => r.vehicle_no },
        { header: isKD2Module() ? 'Battalion' : 'Unit Code', width: 16, key: r => isKD2Module() ? (r.battalion_code || '—') : (getUnitCode(r.vehicle, r.vehicle_no) || '—') },
        { header: 'Station', width: 26, key: r => r.process_station },
        { header: 'Code / Work Center', width: 18, key: r => getRowCode(r) },
        { header: 'Category', width: 16, key: r => getModuleCategory(r.process_station, r) },
        { header: 'Week', width: 8, key: r => r.week || '—' },
        { header: 'Planned Start', width: 14, key: r => r.start_date || '—' },
        { header: 'Planned End', width: 14, key: r => r.end_date || '—' },
        { header: 'Actual Start', width: 14, key: r => r.progress?.actual_start_date || '—' },
        { header: 'Completed On', width: 14, key: r => r.progress?.completion_date || '—' },
        { header: 'Status', width: 18, key: r => calculateStatus(r) },
        { header: 'Delay (days)', width: 13, key: r => { const d = delayDays(r); return d > 0 ? '+' + d + 'd' : calculateStatus(r) === 'Completed' ? 'On Time' : '—'; } },
        { header: 'Remark', width: 22, key: r => r.remark || '' },
        { header: 'Completion Note', width: 36, key: r => r.progress?.notes || '' },
    ];

    ws.columns = COLS.map(c => ({ width: c.width }));

    // ── Row 1: Title ───────────────────────────────────────────────
    ws.addRow([sheetTitle]);
    ws.mergeCells(1, 1, 1, COLS.length);
    const r1 = ws.getCell(1, 1);
    r1.font = { name: 'Calibri', size: 15, bold: true, color: { argb: NAV } };
    r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
    r1.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(1).height = 26;

    // ── Row 2: Filters & timestamp ─────────────────────────────────
    const filterStr = filterChips.length ? filterChips.join('   |   ') : 'No filters applied';
    ws.addRow(['Filters: ' + filterStr + '     Generated: ' + new Date().toLocaleString('en-GB')]);
    ws.mergeCells(2, 1, 2, COLS.length);
    const r2 = ws.getCell(2, 1);
    r2.font = { name: 'Calibri', size: 8, italic: true, color: { argb: MUTE } };
    r2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
    r2.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(2).height = 14;

    // ── Row 3: Blank spacer ────────────────────────────────────────
    ws.addRow([]);
    ws.getRow(3).height = 5;

    // ── Row 4: Column headers ──────────────────────────────────────
    ws.addRow(COLS.map(c => c.header));
    const hdrRow = ws.getRow(4);
    hdrRow.height = 18;
    COLS.forEach((_, ci) => {
        const cell = ws.getCell(4, ci + 1);
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: WHITE } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAV } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
        cell.border = hdrBorder();
    });

    // ── Data rows ──────────────────────────────────────────────────
    rows.forEach((r, ri) => {
        const status = calculateStatus(r);
        const st = ST[status] || ST['Planned'];
        const isAlt = ri % 2 === 1;
        const rowBg = isAlt ? ALT : WHITE;

        const values = COLS.map((c, ci) => c.key(r, ri));
        ws.addRow(values);
        const dataRow = ws.getRow(ri + 5);
        dataRow.height = 16;

        COLS.forEach((col, ci) => {
            const cell = ws.getCell(ri + 5, ci + 1);
            const colHdr = col.header;

            // Status cell — coloured badge
            if (colHdr === 'Status') {
                cell.font = { name: 'Calibri', size: 8, bold: true, color: { argb: st.fg } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: st.bg } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            }
            // Delay cell — red if positive
            else if (colHdr === 'Delay (days)') {
                const val = String(cell.value || '');
                const isLate = val.startsWith('+');
                cell.font = { name: 'Calibri', size: 8, bold: isLate, color: { argb: isLate ? 'FF991b1b' : 'FF475569' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isLate ? 'FFfee2e2' : rowBg } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            }
            // # column
            else if (colHdr === '#') {
                cell.font = { name: 'Calibri', size: 8, color: { argb: MUTE } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            }
            // Unit Code — muted
            else if (colHdr === 'Unit Code' || colHdr === 'Battalion') {
                cell.font = { name: 'Calibri', size: 8, italic: true, color: { argb: MUTE } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
                cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
            }
            // Notes — wrap text
            else if (colHdr === 'Completion Note' || colHdr === 'Remark') {
                cell.font = { name: 'Calibri', size: 8, color: { argb: NAV } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
                cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true, indent: 1 };
                dataRow.height = Math.max(dataRow.height, 28);
            }
            // Default
            else {
                cell.font = { name: 'Calibri', size: 8, color: { argb: NAV } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
                cell.alignment = { horizontal: ci === 0 ? 'center' : 'left', vertical: 'middle', indent: ci > 0 ? 1 : 0 };
            }
            cell.border = border();
        });
    });

    // ════════════════════════════════════════════════════════════════
    //  SHEET 2 — Summary
    // ════════════════════════════════════════════════════════════════
    const wsSumm = wb.addWorksheet('Summary');
    wsSumm.columns = [{ width: 24 }, { width: 16 }, { width: 14 }];

    // Title
    wsSumm.addRow([sheetTitle]);
    wsSumm.mergeCells(1, 1, 1, 3);
    const sT = wsSumm.getCell(1, 1);
    sT.font = { name: 'Calibri', size: 14, bold: true, color: { argb: NAV } };
    sT.alignment = { vertical: 'middle' };
    wsSumm.getRow(1).height = 26;

    wsSumm.addRow(['Generated: ' + new Date().toLocaleString('en-GB')]);
    wsSumm.mergeCells(2, 1, 2, 3);
    wsSumm.getCell(2, 1).font = { name: 'Calibri', size: 8, italic: true, color: { argb: MUTE } };
    wsSumm.getRow(2).height = 14;

    wsSumm.addRow([]); wsSumm.getRow(3).height = 8;

    // Active filters block
    if (filterChips.length) {
        wsSumm.addRow(['Active Filters']);
        wsSumm.mergeCells(4, 1, 4, 3);
        wsSumm.getCell(4, 1).font = { name: 'Calibri', size: 9, bold: true, color: { argb: MUTE } };
        wsSumm.getRow(4).height = 14;
        filterChips.forEach((chip, i) => {
            wsSumm.addRow(['', chip]);
            const chipCell = wsSumm.getCell(5 + i, 2);
            chipCell.font = { name: 'Calibri', size: 9, color: { argb: NAV } };
            wsSumm.mergeCells(5 + i, 2, 5 + i, 3);
            wsSumm.getRow(5 + i).height = 14;
        });
    }
    const summDataStart = filterChips.length ? 5 + filterChips.length + 1 : 4;

    // Stats header
    wsSumm.addRow([]);
    const shRow = wsSumm.addRow(['Metric', 'Count', '% of Total']);
    shRow.height = 17;
    [1, 2, 3].forEach(c => {
        const cell = wsSumm.getCell(shRow.number, c);
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: WHITE } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAV } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = hdrBorder();
    });

    const summRows = [
        { label: 'Total Tasks', val: stats.total, pct: '100%', bg: HDR, fg: NAV },
        { label: 'Completed', val: stats.completed, pct: Math.round(stats.completed / stats.total * 100) + '%', bg: ST['Completed'].bg, fg: ST['Completed'].fg },
        { label: 'In Progress', val: stats.inProgress, pct: Math.round(stats.inProgress / stats.total * 100) + '%', bg: ST['In Progress'].bg, fg: ST['In Progress'].fg },
        { label: 'Planned', val: stats.planned, pct: Math.round(stats.planned / stats.total * 100) + '%', bg: ST['Planned'].bg, fg: ST['Planned'].fg },
        { label: 'Overdue', val: stats.overdue, pct: Math.round(stats.overdue / stats.total * 100) + '%', bg: ST['Overdue'].bg, fg: ST['Overdue'].fg },
        { label: 'Late Completion', val: stats.late, pct: Math.round(stats.late / stats.total * 100) + '%', bg: ST['Late Completion'].bg, fg: ST['Late Completion'].fg },
        { label: 'Overall Progress', val: stats.pct + '%', pct: '', bg: 'FFe0f2fe', fg: 'FF0369a1' },
    ];
    summRows.forEach(sr => {
        const row = wsSumm.addRow([sr.label, sr.val, sr.pct]);
        row.height = 18;
        [1, 2, 3].forEach(c => {
            const cell = wsSumm.getCell(row.number, c);
            cell.font = { name: 'Calibri', size: 9, bold: c === 1, color: { argb: sr.fg } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sr.bg } };
            cell.alignment = { horizontal: c === 1 ? 'left' : 'center', vertical: 'middle', indent: c === 1 ? 1 : 0 };
            cell.border = border();
        });
    });

    // ════════════════════════════════════════════════════════════════
    //  SHEET 3 — By Vehicle Breakdown
    // ════════════════════════════════════════════════════════════════
    const wsBV = wb.addWorksheet('By Vehicle');
    const BV_HDR = ['Vehicle', 'Total', 'Completed', 'In Progress', 'Planned', 'Overdue', 'Late Completion', 'Progress %'];
    wsBV.columns = BV_HDR.map(() => ({ width: 16 }));

    wsBV.addRow([sheetTitle]);
    wsBV.mergeCells(1, 1, 1, BV_HDR.length);
    wsBV.getCell(1, 1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: NAV } };
    wsBV.getCell(1, 1).alignment = { vertical: 'middle' };
    wsBV.getRow(1).height = 22;
    wsBV.addRow([]); wsBV.getRow(2).height = 6;

    const bvHdrRow = wsBV.addRow(BV_HDR);
    bvHdrRow.height = 17;
    BV_HDR.forEach((_, ci) => {
        const cell = wsBV.getCell(3, ci + 1);
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: WHITE } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAV } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = hdrBorder();
    });

    const vehicles = [...new Set(rows.map(r => r.vehicle))].sort(vehicleSort);
    vehicles.forEach((v, vi) => {
        const vRows = rows.filter(r => r.vehicle === v);
        const s = buildSummaryStats(vRows);
        const isAlt = vi % 2 === 1;
        const rowBg = isAlt ? ALT : WHITE;
        const bvRow = wsBV.addRow([v, s.total, s.completed, s.inProgress, s.planned, s.overdue, s.late, s.pct + '%']);
        bvRow.height = 17;
        BV_HDR.forEach((hdr, ci) => {
            const cell = wsBV.getCell(bvRow.number, ci + 1);
            let bg = rowBg, fg = NAV, bold = false;
            if (hdr === 'Vehicle') { bold = true; }
            if (hdr === 'Progress %') { bg = s.pct >= 80 ? ST['Completed'].bg : s.pct >= 40 ? ST['In Progress'].bg : ST['Overdue'].bg; fg = s.pct >= 80 ? ST['Completed'].fg : s.pct >= 40 ? ST['In Progress'].fg : ST['Overdue'].fg; }
            if (hdr === 'Overdue' && s.overdue > 0) { bg = ST['Overdue'].bg; fg = ST['Overdue'].fg; }
            if (hdr === 'Late Completion' && s.late > 0) { bg = ST['Late Completion'].bg; fg = ST['Late Completion'].fg; }
            cell.font = { name: 'Calibri', size: 9, bold, color: { argb: fg } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            cell.alignment = { horizontal: ci === 0 ? 'left' : 'center', vertical: 'middle', indent: ci === 0 ? 1 : 0 };
            cell.border = border();
        });
    });

    // ── Save ───────────────────────────────────────────────────────
    showToast('Building Excel…', 'info');
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = moduleBadge + '_' + def.label.replace(/\s+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast(`Excel exported — ${rows.length} rows`, 'success');
}



/* ================================================================
   VPX — PDF EXPORT  (light mode, landscape A4)
   ================================================================ */
function exportVpxPDF() {
    if (!currentData?.length) {
        showToast('No data to export.', 'error');
        return;
    }
    const meta = getVpxDisplayMeta();

    // Apply same category filter as the table/VPX view
    const _vpxCategory = getVal('filterCategory');
    const vpxData = _vpxCategory
        ? currentData.filter(r => getModuleCategory(r.process_station, r) === _vpxCategory)
        : currentData;

    if (!vpxData.length) {
        showToast('No data matches the current filters.', 'error');
        return;
    }

    const _mainTitle = getVpxTitleParts().join(' ');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const PAGE_W = doc.internal.pageSize.getWidth();   // 297
    const PAGE_H = doc.internal.pageSize.getHeight();  // 210
    const MARGIN = 12;
    const now = new Date().toLocaleString('en-GB');

    // ── White background ────────────────────────────────────────────
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

    // ── Clean print-friendly header — black text on white ───────────
    // Top rule
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, 8, PAGE_W - MARGIN, 8);

    // Main title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text(_mainTitle, MARGIN, 15);

    // Sub-label (right-aligned)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(meta.exportSubtitle, PAGE_W - MARGIN, 12, { align: 'right' });
    doc.text('Generated: ' + now, PAGE_W - MARGIN, 17, { align: 'right' });

    // Bottom rule under header
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, 20, PAGE_W - MARGIN, 20);

    // ── Legend ──────────────────────────────────────────────────────
    const legY = 26;
    const legend = [
        { label: 'Completed', r: 34, g: 197, b: 94 },
        { label: 'In Progress', r: 245, g: 158, b: 11 },
        { label: 'Late Completion', r: 59, g: 130, b: 246 },
        { label: 'Overdue', r: 220, g: 38, b: 38 },
        { label: 'Planned', r: 148, g: 163, b: 184 },
    ];
    let legX = MARGIN;
    legend.forEach(l => {
        doc.setFillColor(l.r, l.g, l.b);
        doc.circle(legX + 1.5, legY, 1.5, 'F');
        doc.setTextColor(30, 41, 59);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.text(l.label, legX + 4.5, legY + 0.8);
        legX += doc.getTextWidth(l.label) + 9;
    });

    // ── Build table data ─────────────────────────────────────────────
    // Determine active columns (same logic as renderVPX)
    const rows = buildVpxRows(vpxData);
    const activeCols = buildVpxColumns(vpxData).filter(col =>
        rows.some(row => { const k = col.resolve(row.vehicle); return k !== null && row.stations[k]; })
    );
    if (!activeCols.length) {
        showToast(meta.noColumnsMessage, 'error');
        return;
    }

    // Status colour helper
    function statusDotRGB(status) {
        if (status === 'Completed') return [34, 197, 94];   // green
        if (status === 'In Progress') return [245, 158, 11];   // amber
        if (status === 'Late Completion') return [59, 130, 246];   // blue
        if (status === 'Overdue') return [220, 38, 38];   // red
        return [148, 163, 184];                                      // grey — Planned
    }

    // Column header
    const head = [[meta.headerLabel, ...activeCols.map(c => c.code)]];

    // Rows
    const body = rows.map(row => {
        return [
            getVpxExportLabel(row),
            ...activeCols.map(col => {
                const k = col.resolve(row.vehicle);
                if (k === null) return 'N/A';
                const task = row.stations[k];
                if (!task) return '—';
                const actual = task.progress?.completion_date || null;
                const actStart2 = task.progress?.actual_start_date || null;
                const planned = task.end_date;
                const planStr = (task.start_date ? task.start_date.slice(5) : '?') + ' > ' + (planned ? planned.slice(5) : '?');
                const actStr = actStart2
                    ? actStart2.slice(5) + ' > ' + (actual ? actual.slice(5) : '?')
                    : (actual ? '? > ' + actual.slice(5) : '');
                return planStr + (actStr ? '\n' + actStr : '');
            }),
        ];
    });

    // ── AutoTable ────────────────────────────────────────────────────
    const tableStartY = legY + 7;
    const colCount = 1 + activeCols.length;
    const vehicleColW = 22;
    const stationColW = Math.min(14, (PAGE_W - MARGIN * 2 - vehicleColW) / activeCols.length);

    doc.autoTable({
        startY: tableStartY,
        margin: { left: MARGIN, right: MARGIN },
        head: head,
        body: body,
        columnStyles: {
            0: { cellWidth: vehicleColW, fontStyle: 'bold' },
            ...Object.fromEntries(activeCols.map((_, i) => [i + 1, { cellWidth: stationColW, halign: 'center', fontSize: 5.5 }])),
        },
        headStyles: {
            fillColor: [241, 245, 249],
            textColor: [30, 41, 59],
            fontStyle: 'bold',
            fontSize: 6,
            cellPadding: 1.5,
            halign: 'center',
            lineColor: [148, 163, 184],
            lineWidth: 0.3,
        },
        styles: {
            fontSize: 6,
            cellPadding: 1.5,
            overflow: 'linebreak',
            lineColor: [226, 232, 240],
            lineWidth: 0.2,
            textColor: [30, 41, 59],
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252],
        },
        bodyStyles: {
            fillColor: [255, 255, 255],
        },
        // Colour each cell by status
        didDrawCell(data) {
            if (data.section !== 'body' || data.column.index === 0) return;
            const colIdx = data.column.index - 1;
            const col = activeCols[colIdx];
            const rowIdx = data.row.index;
            const rowData = rows[rowIdx];
            if (!col || !rowData) return;

            const k = col.resolve(rowData.vehicle);
            if (!k) return;
            const task = rowData.stations[k];
            if (!task) return;

            const status = calculateStatus(task);
            const [r, g, b] = statusDotRGB(status);

            // Tint background
            const alpha = 0.12;
            doc.setFillColor(
                Math.round(255 - (255 - r) * alpha),
                Math.round(255 - (255 - g) * alpha),
                Math.round(255 - (255 - b) * alpha)
            );
            doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');

            // Dot
            doc.setFillColor(r, g, b);
            doc.circle(data.cell.x + data.cell.width / 2, data.cell.y + 2, 1.2, 'F');

            // Re-draw text on top (autoTable text already drawn, need to redraw)
            const txt = data.cell.raw || '';
            const lines = String(txt).split('\n');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(5.5);
            doc.setTextColor(30, 41, 59);
            lines.forEach((line, li) => {
                doc.text(line, data.cell.x + data.cell.width / 2, data.cell.y + 4.5 + li * 3.2, { align: 'center' });
            });
        },
        // Column group header colours + suppress autoTable text in body station cells
        didParseCell(data) {
            if (data.section === 'head' && data.row.index === 0 && data.column.index > 0) {
                const col = activeCols[data.column.index - 1];
                if (col) {
                    const grpColors = {
                        'Welding': [153, 27, 27],
                        'Machining': [15, 118, 110],
                        'Shot Blasting and Painting': [107, 33, 168],
                        'Assembly': [71, 85, 105],
                        'Processing': [120, 53, 15],
                        'Final Inspection': [6, 95, 70],
                        'Final Test': [51, 65, 85],
                    };
                    const [r, g, b] = grpColors[col.group] || [30, 58, 138];
                    data.cell.styles.fillColor = [r, g, b];
                    data.cell.styles.textColor = [255, 255, 255];
                }
            }
            // Hide autoTable's own text for station cells — we redraw manually in didDrawCell
            if (data.section === 'body' && data.column.index > 0) {
                data.cell.styles.textColor = [255, 255, 255]; // invisible on white bg
            }
        },
    });

    // ── Footer ───────────────────────────────────────────────────────
    const fY = PAGE_H - 5;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, fY - 3, PAGE_W - MARGIN, fY - 3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(meta.footerApp + ' · ' + _mainTitle, MARGIN, fY);
    doc.text(`Page 1 of ${doc.internal.getNumberOfPages()}`, PAGE_W - MARGIN, fY, { align: 'right' });

    const ds = new Date().toISOString().slice(0, 10);
    doc.save(meta.filenamePrefix + '_' + ds + '.pdf');
    showToast('PDF exported successfully.', 'success');
}


/* ──────────────────────────────────────────────────────────────────
   VPX EXCEL EXPORT  (ExcelJS — full cell styling)
   ────────────────────────────────────────────────────────────────── */
async function exportVpxExcel() {
    if (!currentData?.length) { showToast('No data to export.', 'error'); return; }
    if (typeof ExcelJS === 'undefined') {
        showToast('ExcelJS not loaded yet — please wait a moment and try again.', 'error'); return;
    }
    const meta = getVpxDisplayMeta();

    const _fCategory = getVal('filterCategory');

    const vpxData = _fCategory
        ? currentData.filter(r => getModuleCategory(r.process_station, r) === _fCategory)
        : currentData;
    if (!vpxData.length) { showToast('No data matches the current filters.', 'error'); return; }

    const rows = buildVpxRows(vpxData);
    const activeCols = buildVpxColumns(vpxData).filter(col =>
        rows.some(row => { const k = col.resolve(row.vehicle); return k !== null && row.stations[k]; })
    );
    if (!activeCols.length) { showToast(meta.noColumnsMessage, 'error'); return; }

    const sheetTitle = getVpxTitleParts().join(' ');

    // ── Colour helpers ───────────────────────────────────────────────
    // ExcelJS argb = 'FF' + hex (no #)
    const STATUS_STYLE = {
        'Completed': { bg: 'FFdcfce7', fg: 'FF15803d', dot: 'FF22c55e' },
        'In Progress': { bg: 'FFfef9c3', fg: 'FF854d0e', dot: 'FFf59e0b' },
        'Late Completion': { bg: 'FFdbeafe', fg: 'FF1d4ed8', dot: 'FF3b82f6' },
        'Overdue': { bg: 'FFfee2e2', fg: 'FF991b1b', dot: 'FFdc2626' },
        'Planned': { bg: 'FFf8fafc', fg: 'FF475569', dot: 'FF94a3b8' },
        'N/A': { bg: 'FFf1f5f9', fg: 'FFcbd5e1', dot: null },
    };
    const GRP_COLOR = {
        'Welding': { bg: 'FF991b1b', fg: 'FFffffff' },
        'Machining': { bg: 'FF0f766e', fg: 'FFffffff' },
        'Shot Blasting and Painting': { bg: 'FF6b21a8', fg: 'FFffffff' },
        'Assembly': { bg: 'FF1e3a8a', fg: 'FFffffff' },
        'Processing': { bg: 'FF78350f', fg: 'FFffffff' },
        'Final Inspection': { bg: 'FF064e3b', fg: 'FFffffff' },
        'Final Test': { bg: 'FF334155', fg: 'FFffffff' },
    };

    function cellStyle(argbBg, argbFg, bold = false, sz = 9, wrap = false, hAlign = 'center', vAlign = 'middle') {
        return {
            font: { name: 'Calibri', size: sz, bold, color: { argb: argbFg } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: argbBg } },
            alignment: { horizontal: hAlign, vertical: vAlign, wrapText: wrap },
            border: {
                top: { style: 'thin', color: { argb: 'FFe2e8f0' } },
                bottom: { style: 'thin', color: { argb: 'FFe2e8f0' } },
                left: { style: 'thin', color: { argb: 'FFe2e8f0' } },
                right: { style: 'thin', color: { argb: 'FFe2e8f0' } },
            },
        };
    }

    // ════════════════════════════════════════════════════════════════
    //  SHEET 1 — VPX Matrix
    // ════════════════════════════════════════════════════════════════
    const wb = new ExcelJS.Workbook();
    wb.creator = meta.workbookCreator;
    wb.created = new Date();

    const ws = wb.addWorksheet('VPX Matrix', {
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
        views: [{ state: 'frozen', xSplit: 1, ySplit: 5 }],
    });

    const totalCols = 1 + activeCols.length;

    // ── Row 1: Main title ──────────────────────────────────────────
    ws.addRow([sheetTitle]);
    const titleRow = ws.getRow(1);
    titleRow.height = 24;
    const titleCell = ws.getCell('A1');
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF1e293b' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFffffff' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.mergeCells(1, 1, 1, totalCols);

    // ── Row 2: Sub-info ────────────────────────────────────────────
    ws.addRow([meta.exportSubtitle + '  |  Generated: ' + new Date().toLocaleString('en-GB')]);
    const subRow = ws.getRow(2);
    subRow.height = 15;
    const subCell = ws.getCell('A2');
    subCell.font = { name: 'Calibri', size: 8, italic: true, color: { argb: 'FF64748b' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFffffff' } };
    subCell.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.mergeCells(2, 1, 2, totalCols);

    // ── Row 3: blank spacer ────────────────────────────────────────
    ws.addRow([]);
    ws.getRow(3).height = 6;

    // ── Row 4: Group header ────────────────────────────────────────
    const grpRowData = [''];
    activeCols.forEach(col => grpRowData.push(col.group));
    ws.addRow(grpRowData);
    const grpRow = ws.getRow(4);
    grpRow.height = 18;

    // Style group header cells + merge consecutive same-group cells
    let grpStart = 2, grpCurrent = activeCols[0]?.group;
    const applyGrpMerge = (start, end, label) => {
        if (start < end) ws.mergeCells(4, start, 4, end);
        const gc = ws.getCell(4, start);
        const gClr = GRP_COLOR[label] || { bg: 'FF334155', fg: 'FFffffff' };
        gc.value = label;
        gc.font = { name: 'Calibri', size: 9, bold: true, color: { argb: gClr.fg } };
        gc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: gClr.bg } };
        gc.alignment = { horizontal: 'center', vertical: 'middle' };
    };
    activeCols.forEach((col, i) => {
        const colN = i + 2;
        if (col.group !== grpCurrent) {
            applyGrpMerge(grpStart, colN - 1, grpCurrent);
            grpStart = colN;
            grpCurrent = col.group;
        }
        if (i === activeCols.length - 1) applyGrpMerge(grpStart, colN, grpCurrent);
    });
    // Style the unit column header cell in row 4
    const unitHdr4 = ws.getCell(4, 1);
    unitHdr4.value = meta.headerLabel;
    unitHdr4.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFffffff' } };
    unitHdr4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e293b' } };
    unitHdr4.alignment = { horizontal: 'center', vertical: 'middle' };

    // ── Row 5: Station code header ─────────────────────────────────
    const codeRowData = [''];
    activeCols.forEach(col => codeRowData.push(col.code));
    ws.addRow(codeRowData);
    const codeRow = ws.getRow(5);
    codeRow.height = 16;
    for (let c = 1; c <= totalCols; c++) {
        const cell = ws.getCell(5, c);
        const isUnit = c === 1;
        cell.font = { name: 'Calibri', size: 8, bold: true, color: { argb: isUnit ? 'FFffffff' : 'FF1e293b' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isUnit ? 'FF1e293b' : 'FFf1f5f9' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
            top: { style: 'medium', color: { argb: 'FF94a3b8' } },
            bottom: { style: 'medium', color: { argb: 'FF94a3b8' } },
            left: { style: 'thin', color: { argb: 'FFe2e8f0' } },
            right: { style: 'thin', color: { argb: 'FFe2e8f0' } },
        };
        if (c === 1) cell.value = '';
        else {
            const col = activeCols[c - 2];
            cell.value = col ? col.code : '';
        }
    }

    // ── Data rows ──────────────────────────────────────────────────
    let prevVehicle = null;
    let excelRowIdx = 6;

    rows.forEach((row, ri) => {
        // Vehicle group separator row
        if (!isKD2Module() && row.vehicle !== prevVehicle) {
            ws.addRow([row.vehicle]);
            const vRow = ws.getRow(excelRowIdx);
            vRow.height = 14;
            ws.mergeCells(excelRowIdx, 1, excelRowIdx, totalCols);
            const vc = ws.getCell(excelRowIdx, 1);
            vc.value = row.vehicle;
            vc.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFffffff' } };
            vc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
            vc.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
            prevVehicle = row.vehicle;
            excelRowIdx++;
        }

        // Unit data row
        const dataRowArr = [getVpxExportLabel(row)];
        activeCols.forEach(col => {
            const k = col.resolve(row.vehicle);
            if (k === null) { dataRowArr.push('N/A'); return; }
            const task = row.stations[k];
            if (!task) { dataRowArr.push(''); return; }
            const status = calculateStatus(task);
            const actStart = task.progress?.actual_start_date;
            const actEnd = task.progress?.completion_date;
            const planStr = (task.start_date || '?').slice(5) + ' > ' + (task.end_date || '?').slice(5);
            const actStr = actStart
                ? actStart.slice(5) + ' > ' + (actEnd ? actEnd.slice(5) : '?')
                : (actEnd ? '? > ' + actEnd.slice(5) : '');
            // Value: Status on line 1, planned on line 2, actual on line 3
            dataRowArr.push(status + '\n' + planStr + (actStr ? '\n' + actStr : ''));
        });

        ws.addRow(dataRowArr);
        const dRow = ws.getRow(excelRowIdx);
        dRow.height = 34;

        // Unit label cell
        const unitCell = ws.getCell(excelRowIdx, 1);
        unitCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF1e293b' } };
        unitCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf8fafc' } };
        unitCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };
        unitCell.border = {
            top: { style: 'thin', color: { argb: 'FFe2e8f0' } },
            bottom: { style: 'thin', color: { argb: 'FFe2e8f0' } },
            right: { style: 'medium', color: { argb: 'FF94a3b8' } },
        };

        // Station cells
        activeCols.forEach((col, ci) => {
            const c = ci + 2;
            const cell = ws.getCell(excelRowIdx, c);
            const k = col.resolve(row.vehicle);
            if (k === null) {
                cell.value = 'N/A';
                cell.font = { name: 'Calibri', size: 7, color: { argb: 'FFcbd5e1' }, italic: true };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf8fafc' } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = { top: { style: 'thin', color: { argb: 'FFe2e8f0' } }, bottom: { style: 'thin', color: { argb: 'FFe2e8f0' } }, left: { style: 'thin', color: { argb: 'FFe2e8f0' } }, right: { style: 'thin', color: { argb: 'FFe2e8f0' } } };
                return;
            }
            const task = row.stations[k];
            if (!task) {
                cell.value = '';
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFffffff' } };
                cell.border = { top: { style: 'thin', color: { argb: 'FFe2e8f0' } }, bottom: { style: 'thin', color: { argb: 'FFe2e8f0' } }, left: { style: 'thin', color: { argb: 'FFe2e8f0' } }, right: { style: 'thin', color: { argb: 'FFe2e8f0' } } };
                return;
            }
            const status = calculateStatus(task);
            const st = STATUS_STYLE[status] || STATUS_STYLE['Planned'];
            const actStart = task.progress?.actual_start_date;
            const actEnd = task.progress?.completion_date;
            const planStr = (task.start_date || '?').slice(5) + ' > ' + (task.end_date || '?').slice(5);
            const actStr = actStart
                ? actStart.slice(5) + ' > ' + (actEnd ? actEnd.slice(5) : '?')
                : (actEnd ? '? > ' + actEnd.slice(5) : '');

            cell.value = {
                richText: [
                    { text: status + '\n', font: { bold: true, size: 8, color: { argb: st.fg }, name: 'Calibri' } },
                    { text: 'P: ' + planStr, font: { size: 7, color: { argb: 'FF475569' }, name: 'Calibri' } },
                    ...(actStr ? [{ text: '\nA: ' + actStr, font: { size: 7, bold: true, color: { argb: st.fg }, name: 'Calibri' } }] : []),
                ]
            };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: st.bg } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFe2e8f0' } },
                bottom: { style: 'thin', color: { argb: 'FFe2e8f0' } },
                left: { style: 'thin', color: { argb: 'FFe2e8f0' } },
                right: { style: 'thin', color: { argb: 'FFe2e8f0' } },
            };
        });

        excelRowIdx++;
    });

    // ── Column widths ──────────────────────────────────────────────
    ws.getColumn(1).width = 24;
    activeCols.forEach((_, i) => { ws.getColumn(i + 2).width = 15; });

    // ════════════════════════════════════════════════════════════════
    //  SHEET 2 — Key / Legend
    // ════════════════════════════════════════════════════════════════
    const wsKey = wb.addWorksheet('Key & Legend');
    wsKey.views = [{}];
    wsKey.getColumn(1).width = 5;
    wsKey.getColumn(2).width = 22;
    wsKey.getColumn(3).width = 50;
    wsKey.getColumn(4).width = 22;
    wsKey.getColumn(5).width = 22;

    // Title
    wsKey.addRow(['', meta.keyTitle]);
    wsKey.mergeCells(1, 2, 1, 5);
    const keyTitle = wsKey.getCell(1, 2);
    keyTitle.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1e293b' } };
    keyTitle.alignment = { vertical: 'middle' };
    wsKey.getRow(1).height = 24;

    wsKey.addRow([]);
    wsKey.getRow(2).height = 8;

    // Status section header
    wsKey.addRow(['', 'STATUS COLOURS']);
    wsKey.mergeCells(3, 2, 3, 5);
    const secHdr = wsKey.getCell(3, 2);
    secHdr.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF64748b' } };
    secHdr.border = { bottom: { style: 'medium', color: { argb: 'FFcbd5e1' } } };
    wsKey.getRow(3).height = 16;

    // Column headers for legend table
    wsKey.addRow(['', 'Status', 'What it means', 'Planned Dates', 'Actual Dates']);
    const legHdrRow = wsKey.getRow(4);
    legHdrRow.height = 16;
    [2, 3, 4, 5].forEach(c => {
        const cell = wsKey.getCell(4, c);
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFffffff' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e293b' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { bottom: { style: 'medium', color: { argb: 'FF334155' } } };
    });

    const legendRows = [
        { status: 'Completed', meaning: 'Task finished on or before the planned end date.', plan: 'Start > End', actual: 'ActStart > ActEnd' },
        { status: 'In Progress', meaning: 'Actual start recorded but task is not yet complete.', plan: 'Start > End', actual: 'ActStart > ?' },
        { status: 'Late Completion', meaning: 'Task completed after the planned end date.', plan: 'Start > End', actual: 'ActStart > ActEnd (late)' },
        { status: 'Overdue', meaning: 'Not complete and today is past the planned end date.', plan: 'Start > End', actual: '(none)' },
        { status: 'Planned', meaning: 'Not yet started — no actual dates recorded.', plan: 'Start > End', actual: '(none)' },
        { status: 'N/A', meaning: 'This station does not apply to this vehicle type.', plan: '—', actual: '—' },
    ];

    legendRows.forEach((lr, i) => {
        wsKey.addRow(['', lr.status, lr.meaning, lr.plan, lr.actual]);
        const r = i + 5;
        const st = STATUS_STYLE[lr.status] || { bg: 'FFf1f5f9', fg: 'FF475569' };
        wsKey.getRow(r).height = 20;
        [2, 3, 4, 5].forEach(c => {
            const cell = wsKey.getCell(r, c);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: st.bg } };
            cell.font = { name: 'Calibri', size: 9, bold: c === 2, color: { argb: st.fg } };
            cell.alignment = { vertical: 'middle', wrapText: true, horizontal: c === 2 ? 'center' : 'left', indent: c > 2 ? 1 : 0 };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFe2e8f0' } },
                bottom: { style: 'thin', color: { argb: 'FFe2e8f0' } },
                left: { style: 'thin', color: { argb: 'FFe2e8f0' } },
                right: { style: 'thin', color: { argb: 'FFe2e8f0' } },
            };
        });
    });

    // Spacer
    wsKey.addRow([]); wsKey.getRow(11).height = 12;

    // Reading guide section
    wsKey.addRow(['', 'HOW TO READ A CELL']);
    wsKey.mergeCells(12, 2, 12, 5);
    const secHdr2 = wsKey.getCell(12, 2);
    secHdr2.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF64748b' } };
    secHdr2.border = { bottom: { style: 'medium', color: { argb: 'FFcbd5e1' } } };
    wsKey.getRow(12).height = 16;

    const guideRows = [
        ['', 'Line 1', 'Status label (e.g. Completed, Overdue…)', '', ''],
        ['', 'Line 2', 'P: MM-DD > MM-DD   Planned start to planned end', '', ''],
        ['', 'Line 3', 'A: MM-DD > MM-DD   Actual start to actual end (if recorded)', '', ''],
        ['', 'Empty cell', 'Station not yet planned for this unit', '', ''],
        ['', 'N/A', 'Station does not apply to this vehicle type', '', ''],
    ];
    guideRows.forEach((gr, i) => {
        wsKey.addRow(gr);
        const r = i + 13;
        wsKey.getRow(r).height = 16;
        const lbl = wsKey.getCell(r, 2);
        const desc = wsKey.getCell(r, 3);
        lbl.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF334155' } };
        lbl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf1f5f9' } };
        lbl.alignment = { vertical: 'middle', horizontal: 'center' };
        desc.font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };
        desc.alignment = { vertical: 'middle', indent: 1 };
        wsKey.mergeCells(r, 3, r, 5);
        [2, 3].forEach(c => {
            wsKey.getCell(r, c).border = {
                top: { style: 'thin', color: { argb: 'FFe2e8f0' } },
                bottom: { style: 'thin', color: { argb: 'FFe2e8f0' } },
                left: { style: 'thin', color: { argb: 'FFe2e8f0' } },
                right: { style: 'thin', color: { argb: 'FFe2e8f0' } },
            };
        });
    });

    // ── Save ───────────────────────────────────────────────────────
    showToast('Building Excel…', 'info');
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = meta.filenamePrefix + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Excel exported successfully.', 'success');
}


/* ─── Wire the modal ────────────────────────────────────────────── */
function wireReportModal() {
    const overlay = document.getElementById('reportModalOverlay');
    const close = () => { overlay.style.display = 'none'; };

    document.getElementById('btnReports').addEventListener('click', () => {
        syncReportCategoryOptions();
        updateReportPreview();
        overlay.style.display = 'flex';
    });
    document.getElementById('reportModalClose').addEventListener('click', close);
    document.getElementById('reportModalCancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // Live preview count when type, dates, or category change
    overlay.querySelectorAll('input[name="reportType"]').forEach(radio => {
        radio.addEventListener('change', updateReportPreview);
    });
    document.getElementById('reportDateFrom').addEventListener('change', updateReportPreview);
    document.getElementById('reportDateTo').addEventListener('change', updateReportPreview);
    document.getElementById('reportCategory').addEventListener('change', updateReportPreview);

    document.getElementById('btnExportPDF').addEventListener('click', () => {
        const type = document.querySelector('input[name="reportType"]:checked')?.value || 'full';
        exportPDF(type, getVal('reportDateFrom'), getVal('reportDateTo'), getVal('reportCategory'));
    });

    document.getElementById('btnExportExcel').addEventListener('click', async () => {
        const type = document.querySelector('input[name="reportType"]:checked')?.value || 'full';
        await exportExcel(type, getVal('reportDateFrom'), getVal('reportDateTo'), getVal('reportCategory'));
    });
}

function updateReportPreview() {
    const type = document.querySelector('input[name="reportType"]:checked')?.value || 'full';
    const from = getVal('reportDateFrom');
    const to = getVal('reportDateTo');
    const category = getVal('reportCategory');
    const count = buildReportRows(type, from, to, category).length;
    const bar = document.getElementById('reportPreviewBar');
    const cnt = document.getElementById('reportPreviewCount');
    const hint = bar?.querySelector('.report-preview-hint');

    const catLabel = category ? ` · ${category}` : '';
    if (cnt) cnt.textContent = `${count} task${count !== 1 ? 's' : ''} match${catLabel}`;
    if (hint) hint.textContent = count ? 'Ready to export' : 'No tasks match — adjust filters or date range';
    if (bar) bar.style.borderColor = count ? 'rgba(79,142,247,.4)' : 'rgba(239,68,68,.4)';
}

/* ================================================================
   USER MANAGEMENT  (master_admin only)
   ================================================================ */
let _auditLogOffset = 0;
const AUDIT_PAGE_SIZE = 50;

/* ──────────────────────────────────────────────────────────────────
   UNIT CODES MANAGEMENT
   ────────────────────────────────────────────────────────────────── */

function openUnitCodes() {
    setUnitCodesShell();
    document.getElementById('unitCodesOverlay').style.display = 'flex';
    loadUcTable();
}
function closeUnitCodes() {
    document.getElementById('unitCodesOverlay').style.display = 'none';
    closeUcForm();
}

async function loadUcTable() {
    const tbody = document.getElementById('ucTableBody');
    const colSpan = isKD2Module() ? 5 : 4;
    tbody.innerHTML = `<tr><td colspan="${colSpan}" class="table-empty"><span class="spinner"></span> Loading…</td></tr>`;
    try {
        if (isKD2Module()) {
            const [{ data: units, error: unitsError }, { data: battalions, error: battalionError }] = await Promise.all([
                db.from('kd2_vehicle_units').select('*'),
                db.from('kd2_battalions').select('id, battalion_code'),
            ]);
            if (unitsError) throw unitsError;
            if (battalionError) throw battalionError;

            const battalionMap = Object.fromEntries((battalions || []).map(row => [row.id, row.battalion_code]));
            const sorted = (units || []).slice().sort((a, b) => {
                const battalionCmp = String(battalionMap[a.battalion_id] || '').localeCompare(String(battalionMap[b.battalion_id] || ''), undefined, { numeric: true });
                if (battalionCmp !== 0) return battalionCmp;
                const vc = vehicleSort(a.vehicle_type, b.vehicle_type);
                if (vc !== 0) return vc;
                return (a.unit_serial || 0) - (b.unit_serial || 0);
            });

            document.getElementById('ucCount').textContent = sorted.length + ' units';
            if (!sorted.length) {
                tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No KD2 unit codes yet. Click "Add / Edit Code" to begin.</td></tr>';
                return;
            }

            tbody.innerHTML = sorted.map(r => `
      <tr>
        <td>${esc(battalionMap[r.battalion_id] || '—')}</td>
        <td>${esc(r.vehicle_type)}</td>
        <td>${esc(r.unit_label || `${r.vehicle_type}-${String(r.unit_serial).padStart(2, '0')}`)}</td>
        <td class="mono">${esc(r.unit_code || '')}</td>
        <td>
          <button class="btn btn-xs btn-ghost" onclick="openUcForm(${r.id})">Edit</button>
          <button class="btn btn-xs btn-danger" onclick="deleteUnitCode(${r.id})">Delete</button>
        </td>
      </tr>`).join('');
            return;
        }

        const { data, error } = await db.from('vehicle_units').select('*');
        if (error) throw error;

        const sorted = (data || []).slice().sort((a, b) => {
            const vc = vehicleSort(a.vehicle, b.vehicle);
            if (vc !== 0) return vc;
            return naturalSort(a.vehicle_no, b.vehicle_no);
        });

        document.getElementById('ucCount').textContent = sorted.length + ' units';
        if (!sorted.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="table-empty">No unit codes yet. Click "Add / Edit Code" to begin.</td></tr>';
            return;
        }
        tbody.innerHTML = sorted.map(r => `
      <tr>
        <td>${esc(r.vehicle)}</td>
        <td>${esc(r.vehicle_no)}</td>
        <td class="mono">${esc(r.unit_code)}</td>
        <td>
          <button class="btn btn-xs btn-ghost" onclick="openUcForm(${r.id})">Edit</button>
          <button class="btn btn-xs btn-danger" onclick="deleteUnitCode(${r.id})">Delete</button>
        </td>
      </tr>`).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="${colSpan}" class="table-empty">Error loading unit codes.</td></tr>`;
        console.error(e);
    }
}

async function openUcForm(id) {
    setUnitCodesShell();
    // Hide table + toolbar so form footer (Save button) is not clipped
    document.getElementById('ucTableBody').closest('.um-table-wrap').style.display = 'none';
    document.querySelector('#unitCodesOverlay .um-toolbar').style.display = 'none';
    document.getElementById('ucForm').style.display = 'block';
    document.getElementById('ucFormTitle').textContent = id ? (isKD2Module() ? 'Edit KD2 Unit Code' : 'Edit Unit Code') : (isKD2Module() ? 'Add KD2 Unit Code' : 'Add Unit Code');
    document.getElementById('ucFormError').textContent = '';

    const vSel = document.getElementById('ucVehicle');
    const bSel = document.getElementById('ucBattalion');
    const unitText = document.getElementById('ucUnitText');

    if (isKD2Module()) {
        vSel.innerHTML = ['K9', 'K10', 'K11'].map(v => `<option value="${v}">${v}</option>`).join('');
        let battalions = [];
        try {
            battalions = await loadKd2Battalions();
        } catch (error) {
            document.getElementById('ucFormError').textContent = error.message;
            return;
        }
        bSel.innerHTML = battalions.map(row => `<option value="${row.id}">${esc(getKd2BattalionOptionLabel(row))}</option>`).join('');

        if (id) {
            const { data } = await db.from('kd2_vehicle_units').select('*').eq('id', id).maybeSingle();
            if (data) {
                document.getElementById('ucEditId').value = id;
                bSel.value = String(data.battalion_id);
                vSel.value = data.vehicle_type;
                unitText.value = data.unit_label || `M${data.unit_serial}`;
                document.getElementById('ucCode').value = data.unit_code || '';
                return;
            }
        }

        const currentBattalion = getVal('filterBattalion');
        const currentBattalionRow = battalions.find(row => row.battalion_code === currentBattalion);
        const battalionOption = currentBattalionRow ? [...bSel.options].find(opt => opt.value === String(currentBattalionRow.id)) : null;
        if (battalionOption) bSel.value = battalionOption.value;
        const currentVehicle = getVal('filterVehicle');
        if (['K9', 'K10', 'K11'].includes(currentVehicle)) vSel.value = currentVehicle;
        document.getElementById('ucEditId').value = '';
        unitText.value = '';
        document.getElementById('ucCode').value = '';
        return;
    }

    const vehicles = [...new Set(currentData.map(r => r.vehicle))].sort(vehicleSort);
    vSel.innerHTML = vehicles.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');

    if (id) {
        const { data } = await db.from('vehicle_units').select('*').eq('id', id).maybeSingle();
        if (data) {
            document.getElementById('ucEditId').value = id;
            vSel.value = data.vehicle;
            await populateUcUnits();
            document.getElementById('ucUnit').value = data.vehicle_no;
            document.getElementById('ucCode').value = data.unit_code;
            return;
        }
    }
    document.getElementById('ucEditId').value = '';
    await populateUcUnits();
    if (unitText) unitText.value = '';
    document.getElementById('ucCode').value = '';
}

async function populateUcUnits() {
    const vehicle = document.getElementById('ucVehicle')?.value;
    const uSel = document.getElementById('ucUnit');
    if (!uSel) return;

    if (isKD2Module()) {
        uSel.innerHTML = '';
        return;
    }

    const units = [...new Set(currentData.filter(r => r.vehicle === vehicle).map(r => r.vehicle_no))].sort(naturalSort);
    uSel.innerHTML = units.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
}

function closeUcForm() {
    document.getElementById('ucForm').style.display = 'none';
    // Restore table + toolbar
    document.getElementById('ucTableBody').closest('.um-table-wrap').style.display = '';
    document.querySelector('#unitCodesOverlay .um-toolbar').style.display = '';
}

async function saveUnitCode() {
    const id = document.getElementById('ucEditId').value;
    const vehicle = document.getElementById('ucVehicle').value.trim();
    const unit = isKD2Module()
        ? document.getElementById('ucUnitText').value.trim()
        : document.getElementById('ucUnit').value.trim();
    const code = document.getElementById('ucCode').value.trim();
    const errEl = document.getElementById('ucFormError');

    if (!vehicle || !unit || !code) { errEl.textContent = 'All fields are required.'; return; }

    try {
        if (isKD2Module()) {
            const battalionId = parseInt(document.getElementById('ucBattalion').value, 10);
            const unitEntry = normalizeKd2UnitName(document.getElementById('ucUnitText')?.value);
            if (!battalionId || !unitEntry?.label) {
                errEl.textContent = 'Battalion, vehicle, unit name, and code are required.';
                return;
            }
            if (!Number.isFinite(unitEntry.unitSerial) || unitEntry.unitSerial <= 0) {
                errEl.textContent = 'KD2 unit name must end with a positive number, for example M1.';
                return;
            }

            let error;
            if (id) {
                ({ error } = await db.from('kd2_vehicle_units')
                    .update({
                        battalion_id: battalionId,
                        vehicle_type: vehicle,
                        unit_serial: unitEntry.unitSerial,
                        unit_label: unitEntry.label,
                        unit_code: code,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', id));
            } else {
                ({ error } = await db.from('kd2_vehicle_units')
                    .upsert({
                        battalion_id: battalionId,
                        vehicle_type: vehicle,
                        unit_serial: unitEntry.unitSerial,
                        unit_label: unitEntry.label,
                        unit_code: code,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'battalion_id,vehicle_type,unit_serial' }));
            }
            if (error) throw error;

            await loadUnitCodes();
            populateUnitFilter(getVal('filterVehicle') || null);
            refreshAllViews();
            closeUcForm();
            loadUcTable();
            showToast('KD2 unit code saved.', 'success');
            return;
        }

        let error;
        if (id) {
            ({ error } = await db.from('vehicle_units')
                .update({ vehicle, vehicle_no: unit, unit_code: code, updated_at: new Date().toISOString() })
                .eq('id', id));
        } else {
            ({ error } = await db.from('vehicle_units')
                .upsert({ vehicle, vehicle_no: unit, unit_code: code, updated_at: new Date().toISOString() },
                    { onConflict: 'vehicle,vehicle_no' }));
        }
        if (error) throw error;

        // Refresh in-memory map and re-render
        await loadUnitCodes();
        populateUnitFilter(getVal('filterVehicle') || null);
        refreshAllViews();
        closeUcForm();
        loadUcTable();
        showToast('Unit code saved.', 'success');
    } catch (e) {
        errEl.textContent = e.message;
    }
}

async function deleteUnitCode(id) {
    if (!confirm('Delete this unit code?')) return;
    try {
        const { error } = await db.from(isKD2Module() ? 'kd2_vehicle_units' : 'vehicle_units').delete().eq('id', id);
        if (error) throw error;
        await loadUnitCodes();
        populateUnitFilter(getVal('filterVehicle') || null);
        refreshAllViews();
        loadUcTable();
        showToast(isKD2Module() ? 'KD2 unit code deleted.' : 'Unit code deleted.', 'success');
    } catch (e) {
        showToast('Delete failed: ' + e.message, 'error');
    }
}

function openUserMgmt() {
    document.getElementById('userMgmtOverlay').style.display = 'flex';
    loadUserList();
}
function closeUserMgmt() {
    document.getElementById('userMgmtOverlay').style.display = 'none';
    closeUserForm();
}

async function loadUserList() {
    const tbody = document.getElementById('umTableBody');
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty"><div class="empty-state"><span class="spinner"></span><p>Loading…</p></div></td></tr>`;

    const { data: users, error } = await db
        .from('planning_app_users')
        .select('id,email,full_name,role,is_active,created_at')
        .order('created_at', { ascending: true });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty"><div class="empty-state"><p>Error loading users.</p></div></td></tr>`;
        return;
    }

    document.getElementById('umUserCount').textContent =
        `${users.length} user${users.length !== 1 ? 's' : ''}`;

    const currentUserId = getCurrentUser()?.id;

    tbody.innerHTML = users.map(u => {
        const isMe = u.id === currentUserId;
        return `
    <tr>
      <td><strong>${esc(u.full_name)}</strong>${isMe ? ' <span style="font-size:.68rem;color:var(--clr-accent)">(you)</span>' : ''}</td>
      <td class="mono" style="font-size:.8rem">${esc(u.email)}</td>
      <td><span class="role-pill ${u.role}">${u.role.replace('_', ' ')}</span></td>
      <td><span class="status-pill ${u.is_active ? 'active' : 'inactive'}">${u.is_active ? 'Active' : 'Inactive'}</span></td>
      <td class="mono" style="font-size:.75rem;color:var(--clr-text-muted)">${new Date(u.created_at).toLocaleDateString('en-GB')}</td>
      <td>
        <div class="um-action-cell">
          <button class="btn-um-edit" onclick="openUserForm('${u.id}')">Edit</button>
          ${!isMe ? `<button class="btn-um-del" onclick="deleteUser('${u.id}','${esc(u.full_name)}')">Delete</button>` : ''}
        </div>
      </td>
    </tr>`;
    }).join('');
}

async function openUserForm(userId) {
    const form = document.getElementById('umForm');
    form.style.display = '';
    document.getElementById('umFormTitle').textContent = userId ? 'Edit User' : 'Add New User';
    document.getElementById('umEditId').value = userId || '';
    document.getElementById('umFullName').value = '';
    document.getElementById('umEmail').value = '';
    document.getElementById('umRole').value = 'viewer';
    document.getElementById('umPassword').value = '';
    document.getElementById('umActive').value = 'true';
    document.getElementById('umFormError').textContent = '';

    const hint = document.getElementById('umPasswordHint');
    if (hint) hint.style.display = userId ? 'inline' : 'none';

    if (userId) {
        const { data } = await db.from('planning_app_users').select('*').eq('id', userId).maybeSingle();
        if (data) {
            document.getElementById('umFullName').value = data.full_name;
            document.getElementById('umEmail').value = data.email;
            document.getElementById('umRole').value = data.role;
            document.getElementById('umActive').value = String(data.is_active);
        }
    }

    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeUserForm() {
    document.getElementById('umForm').style.display = 'none';
}

async function saveUser() {
    const userId = document.getElementById('umEditId').value;
    const fullName = document.getElementById('umFullName').value.trim();
    const email = document.getElementById('umEmail').value.trim().toLowerCase();
    const role = document.getElementById('umRole').value;
    const password = document.getElementById('umPassword').value;
    const isActive = document.getElementById('umActive').value === 'true';
    const errEl = document.getElementById('umFormError');
    errEl.textContent = '';

    if (!fullName || !email) { errEl.textContent = 'Name and email are required.'; return; }
    if (!userId && !password) { errEl.textContent = 'Password is required for new users.'; return; }

    const payload = { full_name: fullName, email, role, is_active: isActive, updated_at: new Date().toISOString() };
    if (password) payload.password_hash = await sha256(password);

    try {
        if (userId) {
            const { data: before } = await db.from('planning_app_users').select('*').eq('id', userId).maybeSingle();
            const { error } = await db.from('planning_app_users').update(payload).eq('id', userId);
            if (error) throw error;
            const { data: after } = await db.from('planning_app_users').select('id,email,full_name,role,is_active').eq('id', userId).maybeSingle();
            const safeBefore = { ...before }; delete safeBefore.password_hash;
            const safeAfter = { ...after }; delete safeAfter.password_hash;
            await auditLog('UPDATE', 'planning_app_users', userId, safeBefore, safeAfter);
            showToast('User updated.', 'success');
        } else {
            payload.created_at = new Date().toISOString();
            const { data: inserted, error } = await db.from('planning_app_users').insert(payload).select('id,email,full_name,role').single();
            if (error) throw error;
            await auditLog('INSERT', 'planning_app_users', inserted.id, null,
                { email: inserted.email, full_name: inserted.full_name, role: inserted.role });
            showToast('User created.', 'success');
        }
        closeUserForm();
        loadUserList();
    } catch (e) {
        errEl.textContent = e.message?.includes('duplicate') ? 'Email already exists.' : (e.message || 'Save failed.');
    }
}

async function deleteUser(userId, name) {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    const { data: before } = await db.from('planning_app_users')
        .select('id,email,full_name,role').eq('id', userId).maybeSingle();
    const { error } = await db.from('planning_app_users').delete().eq('id', userId);
    if (error) { showToast('Delete failed: ' + error.message, 'error'); return; }
    await auditLog('DELETE', 'planning_app_users', userId, before, null);
    showToast(`User "${name}" deleted.`, 'success');
    loadUserList();
}

/* ================================================================
   AUDIT LOG VIEWER  (master_admin only)
   ================================================================ */
let _auditTotal = 0;
const _diffStore = {};

function openAuditLog() {
    document.getElementById('auditLogOverlay').style.display = 'flex';
    _auditLogOffset = 0;
    loadAuditLog(true);
}
function closeAuditLog() {
    document.getElementById('auditLogOverlay').style.display = 'none';
}

function resetAuditFilters() {
    document.getElementById('alFilterAction').value = '';
    document.getElementById('alFilterTable').value = '';
    document.getElementById('alFilterDate').value = '';
    _auditLogOffset = 0;
    loadAuditLog(true);
}

async function loadAuditLog(reset = false) {
    if (reset) _auditLogOffset = 0;

    const action = document.getElementById('alFilterAction').value;
    const table = document.getElementById('alFilterTable').value;
    const date = document.getElementById('alFilterDate').value;
    const tbody = document.getElementById('alTableBody');

    if (reset) {
        tbody.innerHTML = `<tr><td colspan="8" class="table-empty"><div class="empty-state"><span class="spinner"></span><p>Loading…</p></div></td></tr>`;
    }

    let query = db
        .from('planning_audit_log')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(_auditLogOffset, _auditLogOffset + AUDIT_PAGE_SIZE - 1);

    if (action) query = query.eq('action', action);
    if (table) query = query.eq('table_name', table);
    if (date) query = query
        .gte('created_at', date + 'T00:00:00')
        .lte('created_at', date + 'T23:59:59');

    const { data, count, error } = await query;

    if (error) {
        tbody.innerHTML = `<tr><td colspan="8" class="table-empty"><div class="empty-state"><p>Error: ${esc(error.message)}</p></div></td></tr>`;
        return;
    }

    _auditTotal = count || 0;
    document.getElementById('alEntryCount').textContent = `${_auditTotal} entries`;

    const rows = (data || []).map((entry, idx) => {
        const hasDiff = entry.data_before || entry.data_after;
        const dt = new Date(entry.created_at);
        const rowId = `al-row-${_auditLogOffset + idx}`;
        if (hasDiff) _diffStore[rowId] = { before: entry.data_before, after: entry.data_after };
        return `
    <tr id="${rowId}">
      <td class="mono" style="font-size:.75rem;white-space:nowrap">
        ${dt.toLocaleDateString('en-GB')} ${dt.toLocaleTimeString('en-GB', { hour12: false })}
      </td>
      <td style="font-size:.8rem">${esc(entry.user_email)}</td>
      <td><span class="role-pill ${entry.user_role}">${entry.user_role.replace('_', ' ')}</span></td>
      <td><span class="al-action ${entry.action}">${entry.action}</span></td>
      <td class="mono" style="font-size:.75rem;color:var(--clr-text-muted)">${esc(entry.table_name || '—')}</td>
      <td class="mono" style="font-size:.75rem;color:var(--clr-text-muted)">${esc(entry.record_id || '—')}</td>
      <td class="mono" style="font-size:.75rem;color:var(--clr-text-muted)">${esc(entry.ip_address || '—')}</td>
      <td>
        ${hasDiff
                ? `<button class="al-diff-btn" onclick="toggleDiff(this,'${rowId}')">View diff</button>`
                : '<span style="color:var(--clr-text-dim);font-size:.75rem">—</span>'}
      </td>
    </tr>`;
    });

    if (reset) {
        tbody.innerHTML = rows.join('') ||
            `<tr><td colspan="8" class="table-empty"><div class="empty-state"><p>No audit entries match the filters.</p></div></td></tr>`;
    } else {
        rows.forEach(r => tbody.insertAdjacentHTML('beforeend', r));
    }

    _auditLogOffset += (data?.length || 0);

    const moreBtn = document.getElementById('btnAlMore');
    if (moreBtn) {
        moreBtn.style.display = (_auditLogOffset < _auditTotal) ? '' : 'none';
        moreBtn.onclick = () => loadAuditLog(false);
    }
}

function toggleDiff(btn, rowId) {
    const existing = document.getElementById('diff-' + rowId);
    if (existing) { existing.remove(); btn.textContent = 'View diff'; return; }

    btn.textContent = 'Hide diff';
    const { before, after } = _diffStore[rowId] || {};
    const tr = document.getElementById(rowId);
    const diffRow = document.createElement('tr');
    diffRow.id = 'diff-' + rowId;
    diffRow.className = 'al-diff-row';
    diffRow.innerHTML = `
    <td colspan="8">
      <div class="al-diff-wrap">
        <div class="al-diff-panel">
          <h5>Before</h5>
          <pre>${esc(before ? JSON.stringify(before, null, 2) : '(none)')}</pre>
        </div>
        <div class="al-diff-panel">
          <h5>After</h5>
          <pre>${esc(after ? JSON.stringify(after, null, 2) : '(none)')}</pre>
        </div>
      </div>
    </td>`;
    tr.insertAdjacentElement('afterend', diffRow);
}


/* ================================================================
   GANTT EDIT MODE — drag-to-reschedule with cascade + Friday skip
   ================================================================ */

let _ganttEditMode = false;
let _ganttSatAllowed = false;
let _ganttSatAsked = false;
let _ganttMoveMode = 'single';
let _ganttSelectLaneMode = false;
let _openGanttBlockMenuPlanId = null;
const _selectedGanttPlanIds = new Set();
const _laneOrder = {};
const _ganttVisualLane = {};
const _ganttManualLane = {}; // lanes set explicitly by the user via move-up/down buttons
let _ganttLegendOpen = false;
let _ganttFullscreenEventsBound = false;
let _ganttFullscreenHandlersBound = false;
let _vpxFullscreenEventsBound = false;
let _vpxFullscreenHandlersBound = false;
let _ganttHoverDate = '';
let _ganttHoverRowEl = null;
let _ganttHasRenderedOnce = false;

/* ── Undo / Redo stacks ─────────────────────────────────────────── */
// Each entry: array of { id, newStart, newEnd, oldStart, oldEnd }
const _undoStack = [];
const _redoStack = [];
const _UNDO_LIMIT = 50;

function getGanttCardHost() {
    return document.getElementById('ganttCard');
}

function isGanttFullscreen() {
    const host = getGanttCardHost();
    return !!host && document.fullscreenElement === host;
}

function syncGanttFullscreenButtons() {
    const active = isGanttFullscreen();
    const label = active ? 'Exit Full Screen' : 'Full Screen';
    const host = getGanttCardHost();
    if (host) host.classList.toggle('is-fullscreen', active);
    [
        ['btnGanttFullscreen', 'btnGanttFullscreenLabel'],
    ].forEach(([buttonId, labelId]) => {
        const btn = document.getElementById(buttonId);
        if (btn) {
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            btn.setAttribute('title', label);
        }
        const span = document.getElementById(labelId);
        if (span) span.textContent = label;
    });
}

async function toggleGanttFullscreen(forceOn = null) {
    const host = getGanttCardHost();
    if (!host) return;
    const active = isGanttFullscreen();
    const shouldEnter = forceOn === null ? !active : !!forceOn;
    if (shouldEnter === active) {
        syncGanttFullscreenButtons();
        return;
    }
    try {
        if (shouldEnter) {
            if (!host.requestFullscreen) throw new Error('Fullscreen is not supported in this browser.');
            await host.requestFullscreen();
        } else if (document.fullscreenElement && document.exitFullscreen) {
            await document.exitFullscreen();
        }
    } catch (error) {
        showToast('Fullscreen could not be opened: ' + error.message, 'error');
    } finally {
        syncGanttFullscreenButtons();
    }
}

function bindGanttFullscreenUi() {
    if (!_ganttFullscreenHandlersBound) {
        _ganttFullscreenHandlersBound = true;
        document.getElementById('btnGanttFullscreen')?.addEventListener('click', () => toggleGanttFullscreen());
    }
    if (!_ganttFullscreenEventsBound) {
        _ganttFullscreenEventsBound = true;
        document.addEventListener('fullscreenchange', syncGanttFullscreenButtons);
    }
    syncGanttFullscreenButtons();
}

function getVpxCardHost() {
    return document.getElementById('vpxCard');
}

function isVpxFullscreen() {
    const host = getVpxCardHost();
    return !!host && document.fullscreenElement === host;
}

function syncVpxFullscreenButtons() {
    const active = isVpxFullscreen();
    const label = active ? 'Exit Full Screen' : 'Full Screen';
    const host = getVpxCardHost();
    if (host) host.classList.toggle('is-fullscreen', active);
    [
        ['btnVpxFullscreen', 'btnVpxFullscreenLabel'],
    ].forEach(([buttonId, labelId]) => {
        const btn = document.getElementById(buttonId);
        if (btn) {
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            btn.setAttribute('title', label);
        }
        const span = document.getElementById(labelId);
        if (span) span.textContent = label;
    });
}

async function toggleVpxFullscreen(forceOn = null) {
    const host = getVpxCardHost();
    if (!host) return;
    const active = isVpxFullscreen();
    const shouldEnter = forceOn === null ? !active : !!forceOn;
    if (shouldEnter === active) {
        syncVpxFullscreenButtons();
        return;
    }
    try {
        if (shouldEnter) {
            if (!host.requestFullscreen) throw new Error('Fullscreen is not supported in this browser.');
            await host.requestFullscreen();
        } else if (document.fullscreenElement && document.exitFullscreen) {
            await document.exitFullscreen();
        }
    } catch (error) {
        showToast('Fullscreen could not be opened: ' + error.message, 'error');
    } finally {
        syncVpxFullscreenButtons();
    }
}

function bindVpxFullscreenUi() {
    if (!_vpxFullscreenHandlersBound) {
        _vpxFullscreenHandlersBound = true;
        document.getElementById('btnVpxFullscreen')?.addEventListener('click', () => toggleVpxFullscreen());
    }
    if (!_vpxFullscreenEventsBound) {
        _vpxFullscreenEventsBound = true;
        document.addEventListener('fullscreenchange', syncVpxFullscreenButtons);
    }
    syncVpxFullscreenButtons();
}

function positionOpenGanttBlockMenu() {
    document.querySelectorAll('.gc-bar-menu-below').forEach(bar => bar.classList.remove('gc-bar-menu-below'));
    const bar = document.querySelector('.gc-bar-menu-open');
    if (!bar) return;

    const menu = bar.querySelector('.gc-bar-menu');
    if (!menu) return;

    const scrollRoot = document.getElementById('ganttScrollRoot');
    const barRect = bar.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const topBoundary = scrollRoot
        ? Math.max(scrollRoot.getBoundingClientRect().top + 8, 8)
        : 8;
    const bottomBoundary = scrollRoot
        ? Math.min(scrollRoot.getBoundingClientRect().bottom - 8, window.innerHeight - 8)
        : window.innerHeight - 8;

    const spaceAbove = barRect.top - topBoundary;
    const spaceBelow = bottomBoundary - barRect.bottom;
    const shouldOpenBelow = menuRect.top < topBoundary && spaceBelow > spaceAbove;

    if (shouldOpenBelow) bar.classList.add('gc-bar-menu-below');
}

function syncGanttLegendUi() {
    const legend = document.getElementById('ganttLegend');
    const btn = document.getElementById('btnGanttLegendToggle');
    const label = document.getElementById('btnGanttLegendToggleLabel');
    const hasContent = !!legend?.innerHTML?.trim();
    if (legend) legend.style.display = hasContent && _ganttLegendOpen ? '' : 'none';
    if (btn) {
        btn.disabled = !hasContent;
        btn.setAttribute('aria-expanded', hasContent && _ganttLegendOpen ? 'true' : 'false');
    }
    if (label) label.textContent = hasContent && _ganttLegendOpen ? 'Hide Legend' : 'Show Legend';
}

function clearGanttHoverGuide() {
    if (_ganttHoverRowEl) {
        _ganttHoverRowEl.classList.remove('gantt-hover-row');
        _ganttHoverRowEl = null;
    }
    if (_ganttHoverDate) {
        document.querySelectorAll(`[data-gantt-date="${_ganttHoverDate}"]`).forEach(node => {
            node.classList.remove('gantt-hover-col');
        });
        _ganttHoverDate = '';
    }
}

function syncGanttHoverGuide(rowEl, dateStr) {
    if (_ganttHoverRowEl !== rowEl) {
        if (_ganttHoverRowEl) _ganttHoverRowEl.classList.remove('gantt-hover-row');
        _ganttHoverRowEl = rowEl || null;
        _ganttHoverRowEl?.classList.add('gantt-hover-row');
    }
    if (_ganttHoverDate !== dateStr) {
        if (_ganttHoverDate) {
            document.querySelectorAll(`[data-gantt-date="${_ganttHoverDate}"]`).forEach(node => {
                node.classList.remove('gantt-hover-col');
            });
        }
        _ganttHoverDate = dateStr || '';
        if (_ganttHoverDate) {
            document.querySelectorAll(`[data-gantt-date="${_ganttHoverDate}"]`).forEach(node => {
                node.classList.add('gantt-hover-col');
            });
        }
    }
}

function resolveGanttHoverDate(track, clientX) {
    const days = String(track?.dataset?.ganttDays || '').split(',').filter(Boolean);
    if (!days.length) return '';
    const rect = track.getBoundingClientRect();
    if (!rect.width) return '';
    const offset = Math.max(0, Math.min(rect.width - 1, clientX - rect.left));
    const dayWidth = rect.width / Math.max(days.length, 1);
    const index = Math.max(0, Math.min(days.length - 1, Math.floor(offset / Math.max(dayWidth, 1))));
    return days[index] || '';
}

function _ganttHoverMoveHandler(event) {
    const track = event.target.closest('.gr-track[data-gantt-days]');
    const row = track?.closest('.gr');
    const dateStr = track ? resolveGanttHoverDate(track, event.clientX) : '';
    if (!track || !row || !dateStr) {
        clearGanttHoverGuide();
        return;
    }
    syncGanttHoverGuide(row, dateStr);
}

function _ganttHoverLeaveHandler() {
    clearGanttHoverGuide();
}

function wireGanttHoverGuide() {
    const inner = document.getElementById('ganttInner');
    if (!inner) return;
    inner.removeEventListener('pointermove', _ganttHoverMoveHandler);
    inner.removeEventListener('pointerleave', _ganttHoverLeaveHandler);
    inner.addEventListener('pointermove', _ganttHoverMoveHandler);
    inner.addEventListener('pointerleave', _ganttHoverLeaveHandler);
}

function saveGanttScrollPos() {
    const root = document.getElementById('ganttScrollRoot');
    if (!root) return null;
    return {
        left: root.scrollLeft || 0,
        top: root.scrollTop || 0,
    };
}

function restoreGanttScrollPos(pos) {
    const root = document.getElementById('ganttScrollRoot');
    if (!root || !pos) return;
    requestAnimationFrame(() => {
        root.scrollLeft = pos.left || 0;
        root.scrollTop = pos.top || 0;
    });
}

function _pushUndo(changes) {
    _undoStack.push(changes);
    if (_undoStack.length > _UNDO_LIMIT) _undoStack.shift();
    _redoStack.length = 0;      // new action clears redo branch
    _syncUndoButtons();
}

function _pushUndoAction(action) {
    _undoStack.push(action);
    if (_undoStack.length > _UNDO_LIMIT) _undoStack.shift();
    _redoStack.length = 0;
    _syncUndoButtons();
}

if (window.__ppmsShared) {
    window.__ppmsShared.registerGanttUndoAction = action => _pushUndoAction(action);
}

function _syncUndoButtons() {
    const btnU = document.getElementById('btnGanttUndo');
    const btnR = document.getElementById('btnGanttRedo');
    if (btnU) {
        btnU.disabled = _undoStack.length === 0;
        btnU.setAttribute('title', _undoStack.length
            ? 'Undo last move (' + _undoStack.length + ' in history)'
            : 'Nothing to undo');
    }
    if (btnR) {
        btnR.disabled = _redoStack.length === 0;
        btnR.setAttribute('title', _redoStack.length
            ? 'Redo (' + _redoStack.length + ' available)'
            : 'Nothing to redo');
    }
}

function _clearUndoHistory() {
    _undoStack.length = 0;
    _redoStack.length = 0;
    _syncUndoButtons();
}

function _syncSelectedBlockUi() {
    const validIds = new Set(currentData.map(row => row.id));
    [..._selectedGanttPlanIds].forEach(id => {
        if (!validIds.has(id)) _selectedGanttPlanIds.delete(id);
    });
    document.querySelectorAll('.gc-bar[data-plan-id]').forEach(bar => {
        const id = parseInt(bar.dataset.planId, 10);
        const selected = _selectedGanttPlanIds.has(id);
        bar.classList.toggle('gc-bar-selected', selected);
        const btn = bar.querySelector('.gc-bar-select');
        if (btn) {
            btn.classList.toggle('gc-bar-select-active', selected);
            btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
        }
    });
    const count = _selectedGanttPlanIds.size;
    const countEl = document.getElementById('ganttSelectedCount');
    const delBtn = document.getElementById('btnDeleteSelectedBlocks');
    if (countEl) countEl.textContent = String(count);
    if (delBtn) delBtn.disabled = count === 0;
    document.querySelectorAll('[data-gantt-lane-select]').forEach(btn => {
        const planId = parseInt(btn.dataset.ganttLaneSelect, 10);
        const anchor = currentData.find(row => row.id === planId);
        if (!anchor) return;
        const laneRows = currentData.filter(row => samePlanLane(row, anchor));
        const allSelected = laneRows.length > 0 && laneRows.every(row => _selectedGanttPlanIds.has(row.id));
        btn.textContent = allSelected ? 'Clear lane' : 'Select lane';
        btn.setAttribute('aria-pressed', allSelected ? 'true' : 'false');
    });
}

function toggleGanttLaneSelection(task, forceSelect = null) {
    if (!task) return;
    const laneRows = currentData.filter(row => samePlanLane(row, task));
    if (!laneRows.length) return;
    const shouldSelect = forceSelect === null
        ? !laneRows.every(row => _selectedGanttPlanIds.has(row.id))
        : !!forceSelect;
    laneRows.forEach(row => {
        if (shouldSelect) _selectedGanttPlanIds.add(row.id);
        else _selectedGanttPlanIds.delete(row.id);
    });
    _syncSelectedBlockUi();
}

function setGanttLaneSelectMode(on) {
    _ganttSelectLaneMode = !!on && isKD2Module();
    const btn = document.getElementById('gmtSelectLane');
    if (btn) {
        btn.classList.toggle('gmt-active', _ganttSelectLaneMode);
        btn.setAttribute('aria-pressed', _ganttSelectLaneMode ? 'true' : 'false');
    }
    const gsEl = document.getElementById('ganttStart');
    const geEl = document.getElementById('ganttEnd');
    if (gsEl?.value && geEl?.value) renderGantt(currentData, gsEl.value, geEl.value);
}

function syncGanttModuleEditControls() {
    const isKd2 = isKD2Module();
    const kd2Tools = document.getElementById('ganttKd2EditTools');
    const planBtn = document.getElementById('gmtPlan');
    const fromBlockBtn = document.getElementById('gmtFromBlock');
    const satWrap = document.getElementById('ganttSatToggleWrap');
    const visualAddShell = document.getElementById('ganttVisualAddShell');
    const viewToggleWrap = document.getElementById('ganttViewToggleWrap');
    if (kd2Tools) kd2Tools.style.display = _ganttEditMode && isKd2 ? 'inline-flex' : 'none';
    if (visualAddShell) visualAddShell.style.display = _ganttEditMode && isKd2 ? 'inline-flex' : 'none';
    if (planBtn) planBtn.style.display = isKd2 ? 'none' : '';
    if (fromBlockBtn) fromBlockBtn.style.display = isKd2 ? '' : 'none';
    if (satWrap) satWrap.style.display = isKd2 ? 'none' : '';
    if (viewToggleWrap) viewToggleWrap.style.display = isKd2 ? '' : 'none';
    if ((!_ganttEditMode || !isKd2) && getModuleRuntime()?.toggleTimelineVisualMenu) {
        getModuleRuntime().toggleTimelineVisualMenu(false);
    }
    if (isKd2 && _ganttMoveMode === 'plan') _ganttMoveMode = 'single';
    if (!isKd2 && _ganttMoveMode === 'from-block') _ganttMoveMode = 'single';
    if (!isKd2) _ganttSelectLaneMode = false;
    const moveToggle = document.getElementById('ganttMoveToggle');
    if (moveToggle) {
        moveToggle.querySelectorAll('.gmt-btn[data-mode]').forEach(btn => {
            btn.classList.toggle('gmt-active', btn.dataset.mode === _ganttMoveMode);
        });
    }
    const btn = document.getElementById('gmtSelectLane');
    if (btn) {
        btn.classList.toggle('gmt-active', _ganttSelectLaneMode);
        btn.setAttribute('aria-pressed', _ganttSelectLaneMode ? 'true' : 'false');
    }
}

/* ── Toggle edit mode ────────────────────────────────────────────── */
function setGanttEditMode(on) {
    _ganttEditMode = on;
    if (!on) {
        _openGanttBlockMenuPlanId = null;
        _selectedGanttPlanIds.clear();
        _ganttSelectLaneMode = false;
    }
    document.getElementById('ganttEditBar').style.display = on ? 'flex' : 'none';
    document.getElementById('btnGanttEdit').style.display = on ? 'none' : '';
    // Sync undo button states whenever edit mode changes
    _syncUndoButtons();
    syncGanttModuleEditControls();

    // Sync Saturday checkbox with current session value
    const satCk = document.getElementById('ganttSatToggle');
    if (satCk) satCk.checked = _ganttSatAllowed;

    // Re-render so bars get / lose draggable handles
    const gsEl = document.getElementById('ganttStart');
    const geEl = document.getElementById('ganttEnd');
    renderGantt(currentData, gsEl?.value, geEl?.value);

    // Toggle CSS edit-mode class on the gantt body
    const body = document.querySelector('.gantt-body');
    if (body) body.classList.toggle('gantt-edit-active', on);
    _syncSelectedBlockUi();
}

/* ── Saturday modal (promise-based) ─────────────────────────────── */
function askSaturday() {
    return new Promise(resolve => {
        if (_ganttSatAsked) { resolve(_ganttSatAllowed); return; }
        const overlay = document.getElementById('satModalOverlay');
        overlay.style.display = 'flex';

        const yes = document.getElementById('satModalYes');
        const no = document.getElementById('satModalNo');

        function finish(allow) {
            overlay.style.display = 'none';
            _ganttSatAsked = true;
            _ganttSatAllowed = allow;
            yes.removeEventListener('click', onYes);
            no.removeEventListener('click', onNo);
            resolve(allow);
        }
        function onYes() { finish(true); }
        function onNo() { finish(false); }
        yes.addEventListener('click', onYes);
        no.addEventListener('click', onNo);
    });
}

/* ── Date arithmetic helpers ─────────────────────────────────────── */

/** Add `n` calendar days to a YYYY-MM-DD string */
/**
 * Format a Date object as YYYY-MM-DD using LOCAL date parts.
 * This avoids the UTC-rollback bug: toISOString() converts to UTC first,
 * which subtracts hours for timezones east of UTC (e.g. Cairo UTC+2),
 * causing dates to silently shift back by one day.
 */
function localDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}

function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return localDateStr(d);
}

/** Difference in calendar days: dateB − dateA (positive = B is after A) */
function dayDiff(dateA, dateB) {
    const a = new Date(dateA + 'T00:00:00');
    const b = new Date(dateB + 'T00:00:00');
    return Math.round((b - a) / 86400000);
}

/**
 * Advance a date forward if it lands on a non-working day.
 * Friday (5) is always skipped.
 * Saturday (6) skipped unless allowSat === true.
 */
function skipNonWorking(dateStr, allowSat) {
    const d = new Date(dateStr + 'T00:00:00');
    const skip = day => day === 5 || (!allowSat && day === 6);
    let guard = 0;
    while (skip(d.getDay()) && guard++ < 7) {
        d.setDate(d.getDate() + 1);
    }
    return localDateStr(d);
}

function isMoveWorkingDay(dateStr, allowSat) {
    const day = new Date(dateStr + 'T00:00:00').getDay();
    if (day === 5) return false;
    if (!allowSat && day === 6) return false;
    return true;
}

function nextMoveWorkingDate(dateStr, allowSat, direction = 1) {
    let d = dateStr;
    let guard = 0;
    while (!isMoveWorkingDay(d, allowSat) && guard++ < 14) {
        d = addDays(d, direction >= 0 ? 1 : -1);
    }
    return d;
}

function countWorkingDaysInclusive(startStr, endStr, allowSat) {
    let d = startStr;
    let count = 0;
    let guard = 0;
    while (d <= endStr && guard++ < 1000) {
        if (isMoveWorkingDay(d, allowSat)) count += 1;
        d = addDays(d, 1);
    }
    return Math.max(1, count);
}

function addWorkingDaysInclusive(startStr, durationDays, allowSat) {
    let d = nextMoveWorkingDate(startStr, allowSat, 1);
    let worked = 1;
    let guard = 0;
    while (worked < durationDays && guard++ < 1000) {
        d = addDays(d, 1);
        if (isMoveWorkingDay(d, allowSat)) worked += 1;
    }
    return d;
}

function shiftDateByGanttColumns(dateStr, deltaColumns, allowSat) {
    if (!deltaColumns) return nextMoveWorkingDate(dateStr, allowSat, 1);
    let d = dateStr;
    let moved = 0;
    const direction = deltaColumns > 0 ? 1 : -1;
    const target = Math.abs(deltaColumns);
    let guard = 0;
    while (moved < target && guard++ < 1000) {
        d = addDays(d, direction);
        if (isMoveWorkingDay(d, allowSat)) moved += 1;
    }
    return nextMoveWorkingDate(d, allowSat, direction);
}

function isVisibleGanttDate(dateStr) {
    return new Date(dateStr + 'T00:00:00').getDay() !== 5;
}

function shiftDateByVisibleGanttColumns(dateStr, deltaColumns) {
    if (!deltaColumns) return dateStr;
    let d = dateStr;
    let moved = 0;
    const direction = deltaColumns > 0 ? 1 : -1;
    const target = Math.abs(deltaColumns);
    let guard = 0;
    while (moved < target && guard++ < 1000) {
        d = addDays(d, direction);
        if (isVisibleGanttDate(d)) moved += 1;
    }
    return d;
}

/**
 * Shift a task by rendered Gantt columns, not raw calendar days.
 * This preserves the visible bar width when Friday is hidden from the grid.
 */
function shiftTask(task, deltaColumns, allowSat) {
    const newStart = shiftDateByVisibleGanttColumns(task.start_date, deltaColumns);
    const newEnd = shiftDateByVisibleGanttColumns(task.end_date, deltaColumns);
    return { newStart, newEnd };
}

function shiftTaskForGanttEdit(task, deltaColumns, allowSat) {
    if (isKD2Module()) {
        const targetStart = shiftDateByVisibleGanttColumns(task.start_date, deltaColumns);
        const shifted = getModuleRuntime()?.shiftPlanRowToStart?.(task, targetStart);
        if (shifted?.start && shifted?.end) {
            return { newStart: shifted.start, newEnd: shifted.end };
        }
    }
    return shiftTask(task, deltaColumns, allowSat);
}

/* ── Cascade logic ───────────────────────────────────────────────── */
/**
 * Given a moved task and the shift delta, cascade all subsequent tasks
 * of the same vehicle+unit that originally started ON OR AFTER the
 * moved task's original start date (excluding the moved task itself).
 *
 * Returns an array of { id, newStart, newEnd, oldStart, oldEnd }.
 */
function cascadeTasks(movedTask, deltaDays, allowSat) {
    const { start_date: origStart, id: movedId } = movedTask;

    const siblings = currentData.filter(t =>
        samePlanLane(t, movedTask) &&
        t.id !== movedId &&
        t.start_date > origStart   // strictly AFTER the moved task (avoids overlap-lock)
    );

    return siblings.map(t => {
        const { newStart, newEnd } = shiftTask(t, deltaDays, allowSat);
        return { id: t.id, newStart, newEnd, oldStart: t.start_date, oldEnd: t.end_date, task: t };
    });
}

/* ── Save plan changes to Supabase — single batch upsert ────────── */
/**
 * Low-level batch date update — fires DB writes in parallel.
 * Used by both savePlanChanges AND undo/redo.
 * Does NOT push to undo stack or show "saving" toast.
 * Returns true on success, false on error.
 */
async function _applyDateChanges(changes) {
    const results = await Promise.all(
        changes.map(ch =>
            db.from(getModulePlanTable())
                .update(getModulePlanDatePayload(ch.newStart, ch.newEnd))
                .eq('id', ch.id)
                .select('id')
        )
    );
    const failed = results.filter(r => r.error);
    if (failed.length) throw new Error(failed[0].error.message);

    changes.forEach(ch => {
        const row = currentData.find(t => t.id === ch.id);
        if (row) {
            row.start_date = ch.newStart;
            row.end_date = ch.newEnd;
            row.week = weekLabel(ch.newStart);
        }
    });
}

async function savePlanChanges(changes) {
    if (!changes.length) return;

    showToast(`Saving ${changes.length} block${changes.length > 1 ? 's' : ''}…`, 'info');

    try {
        await _applyDateChanges(changes);

        await auditLog('UPDATE', getModulePlanTable(), 'batch-move',
            { count: changes.length, ids: changes.map(c => c.id) },
            { count: changes.length, sample: { id: changes[0].id, newStart: changes[0].newStart } }
        );

        showToast(`${changes.length} block${changes.length > 1 ? 's' : ''} rescheduled ✓`, 'success');
        _pushUndo(changes);
        refreshAllViews();
    } catch (err) {
        showToast('Error saving plan: ' + err.message, 'error');
        console.error(err);
        await loadData();
    }
}


/* ── Undo / Redo ─────────────────────────────────────────────────── */

async function undoGantt() {
    if (!_undoStack.length) return;
    const changes = _undoStack.pop();

    if (!Array.isArray(changes)) {
        showToast(`Undoing ${changes.label || 'action'}…`, 'info');
        try {
            await changes.undo?.();
            _redoStack.push(changes);
            _syncUndoButtons();
            showToast('Undo applied ✓', 'success');
            await loadData();
        } catch (err) {
            _undoStack.push(changes);
            showToast('Undo failed: ' + err.message, 'error');
            console.error(err);
            await loadData();
        }
        return;
    }

    // Invert: swap newStart↔oldStart, newEnd↔oldEnd
    const inverse = changes.map(ch => ({
        id: ch.id,
        newStart: ch.oldStart,
        newEnd: ch.oldEnd,
        oldStart: ch.newStart,
        oldEnd: ch.newEnd,
    }));

    showToast(`Undoing ${inverse.length} block move${inverse.length > 1 ? 's' : ''}…`, 'info');
    try {
        await _applyDateChanges(inverse);
        await auditLog('UPDATE', getModulePlanTable(), 'undo',
            { count: inverse.length }, { count: inverse.length, sample: { id: inverse[0].id, newStart: inverse[0].newStart } });

        _redoStack.push(changes);   // original forward changes become redo
        _syncUndoButtons();
        showToast('Undo applied ✓', 'success');
        refreshAllViews();
    } catch (err) {
        _undoStack.push(changes);   // put back on failure
        showToast('Undo failed: ' + err.message, 'error');
        console.error(err);
        await loadData();
    }
}

async function redoGantt() {
    if (!_redoStack.length) return;
    const changes = _redoStack.pop();

    if (!Array.isArray(changes)) {
        showToast(`Redoing ${changes.label || 'action'}…`, 'info');
        try {
            await changes.redo?.();
            _undoStack.push(changes);
            _syncUndoButtons();
            showToast('Redo applied ✓', 'success');
            await loadData();
        } catch (err) {
            _redoStack.push(changes);
            showToast('Redo failed: ' + err.message, 'error');
            console.error(err);
            await loadData();
        }
        return;
    }

    showToast(`Redoing ${changes.length} block move${changes.length > 1 ? 's' : ''}…`, 'info');
    try {
        await _applyDateChanges(changes);
        await auditLog('UPDATE', getModulePlanTable(), 'redo',
            { count: changes.length }, { count: changes.length, sample: { id: changes[0].id, newStart: changes[0].newStart } });

        _undoStack.push(changes);   // goes back onto undo stack
        _syncUndoButtons();
        showToast('Redo applied ✓', 'success');
        refreshAllViews();
    } catch (err) {
        _redoStack.push(changes);   // put back on failure
        showToast('Redo failed: ' + err.message, 'error');
        console.error(err);
        await loadData();
    }
}
/* ── Drag-and-drop engine attached to rendered bars ─────────────── */

/**
 * Called from renderGantt after bars are injected into the DOM.
 * Finds all .gc-bar[data-plan-id] elements and attaches pointer-drag handlers.
 */
function wireGanttDragEdit(dayIndex, days) {
    if (!_ganttEditMode) return;

    const bars = document.querySelectorAll('.gc-bar[data-plan-id]');
    bars.forEach(bar => {
        bar.style.cursor = 'grab';
        bar.addEventListener('pointerdown', onBarPointerDown);
    });

    function onBarPointerDown(e) {
        if (!_ganttEditMode) return;
        if (!canEditPlan()) { showToast('Only planners and admins can edit the plan.', 'error'); return; }
        // Let block menu controls handle their own clicks instead of starting a drag.
        if (e.target.closest('.gc-bar-menu') || e.target.closest('.gc-bar-menu-trigger') || e.target.closest('.gc-bar-select') || e.target.closest('.gc-bar-delete') || e.target.closest('.gc-bar-edit') || e.target.closest('.gc-bar-lane')) return;

        e.preventDefault();
        const bar = e.currentTarget;
        const planId = parseInt(bar.dataset.planId);
        const task = currentData.find(t => t.id === planId);
        if (!task) return;

        const previewMoveSet = _ganttMoveMode === 'lane'
            ? currentData.filter(row => samePlanLane(row, task))
            : _ganttMoveMode === 'from-block'
                ? getKd2ForwardMoveRows(task, currentData)
                : _selectedGanttPlanIds.has(planId) && _selectedGanttPlanIds.size > 1 && _ganttMoveMode === 'single'
                    ? currentData.filter(row => _selectedGanttPlanIds.has(row.id))
                    : [task];
        const selectedDragIds = previewMoveSet.map(row => row.id);
        const dragBars = [...document.querySelectorAll('.gc-bar[data-plan-id]')]
            .filter(item => selectedDragIds.includes(parseInt(item.dataset.planId, 10)));
        const origLeftById = new Map(dragBars.map(item => [parseInt(item.dataset.planId, 10), parseInt(item.style.left)]));

        bar.setPointerCapture(e.pointerId);
        dragBars.forEach(item => {
            item.style.cursor = 'grabbing';
            item.style.opacity = '0.75';
            item.style.zIndex = '999';
            item.style.boxShadow = '0 8px 32px rgba(0,0,0,.6), 0 0 0 2px #4f8ef7';
            item.style.transition = 'none';
        });

        const startX = e.clientX;
        let deltaPx = 0;
        let deltaDays = 0;

        function onMove(ev) {
            deltaPx = ev.clientX - startX;
            deltaDays = Math.round(deltaPx / GANTT_DAY_W);
            dragBars.forEach(item => {
                const id = parseInt(item.dataset.planId, 10);
                item.style.left = ((origLeftById.get(id) ?? parseInt(item.style.left)) + deltaDays * GANTT_DAY_W) + 'px';
            });
        }

        async function onUp() {
            bar.releasePointerCapture(e.pointerId);
            bar.removeEventListener('pointermove', onMove);
            bar.removeEventListener('pointerup', onUp);
            dragBars.forEach(item => {
                item.style.cursor = 'grab';
                item.style.opacity = '1';
                item.style.zIndex = '';
                item.style.transition = '';
            });

            if (deltaDays === 0) {
                dragBars.forEach(item => {
                    const id = parseInt(item.dataset.planId, 10);
                    item.style.left = (origLeftById.get(id) ?? parseInt(item.style.left)) + 'px';
                });
                return;
            }

            const allowSat = isKD2Module() ? false : await askSaturday();
            const moveSet = await resolveGanttMoveSet(task);
            const allChanges = moveSet.map(t => {
                const { newStart, newEnd } = shiftTaskForGanttEdit(t, deltaDays, allowSat);
                return { id: t.id, newStart, newEnd, oldStart: t.start_date, oldEnd: t.end_date };
            });

            dragBars.forEach(item => {
                const id = parseInt(item.dataset.planId, 10);
                item.style.left = (origLeftById.get(id) ?? parseInt(item.style.left)) + 'px';
            }); // reset; re-render fixes it

            await savePlanChanges(allChanges);

            const gsEl = document.getElementById('ganttStart');
            const geEl = document.getElementById('ganttEnd');
            renderGantt(currentData, gsEl?.value, geEl?.value);
        }

        bar.addEventListener('pointermove', onMove);
        bar.addEventListener('pointerup', onUp);
    }
}

/* ── Wire into ganttControls (extend wireGanttControls) ─────────── */
const _origWireGantt = wireGanttControls;
wireGanttControls = function () {
    _origWireGantt();

    document.getElementById('btnGanttViewUnit')?.addEventListener('click', () => {
        getModuleRuntime()?.setTimelineViewMode?.('unit', { skipRender: true });
        const gsEl = document.getElementById('ganttStart');
        const geEl = document.getElementById('ganttEnd');
        if (gsEl?.value && geEl?.value) renderGantt(currentData, gsEl.value, geEl.value);
    });
    document.getElementById('btnGanttViewProcess')?.addEventListener('click', () => {
        getModuleRuntime()?.setTimelineViewMode?.('process', { skipRender: true });
        const gsEl = document.getElementById('ganttStart');
        const geEl = document.getElementById('ganttEnd');
        if (gsEl?.value && geEl?.value) renderGantt(currentData, gsEl.value, geEl.value);
    });

    document.getElementById('btnGanttEdit')?.addEventListener('click', () => setGanttEditMode(true));
    document.getElementById('btnGanttEditDone')?.addEventListener('click', () => {
        _ganttSatAsked = false; // reset for next edit session
        setGanttEditMode(false);
    });

    // Saturday toggle checkbox (updates the session preference live)
    document.getElementById('ganttSatToggle')?.addEventListener('change', function () {
        _ganttSatAllowed = this.checked;
        _ganttSatAsked = true;
    });

    // Move-mode toggle
    document.getElementById('ganttMoveToggle')?.addEventListener('click', function (e) {
        const btn = e.target.closest('.gmt-btn');
        if (!btn) return;
        _ganttMoveMode = btn.dataset.mode;
        this.querySelectorAll('.gmt-btn').forEach(b => b.classList.toggle('gmt-active', b === btn));
    });
    document.getElementById('gmtSelectLane')?.addEventListener('click', () => {
        setGanttLaneSelectMode(!_ganttSelectLaneMode);
    });
    document.getElementById('btnGanttNoWorkDays')?.addEventListener('click', () => {
        if (!isKD2Module()) return;
        getModuleRuntime()?.openNoWorkModal?.();
    });

    // Undo / Redo buttons
    document.getElementById('btnGanttUndo')?.addEventListener('click', undoGantt);
    document.getElementById('btnGanttRedo')?.addEventListener('click', redoGantt);
    document.getElementById('btnDeleteSelectedBlocks')?.addEventListener('click', deleteSelectedGanttBlocks);

    // Keyboard: Ctrl+Z = undo, Ctrl+Y or Ctrl+Shift+Z = redo (only while in edit mode)
    document.addEventListener('keydown', function (e) {
        if (!_ganttEditMode) return;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
        if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undoGantt(); }
        if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redoGantt(); }
    });
    syncGanttModuleEditControls();
};

/* ── Patch renderGantt to pass data-plan-id on bars and wire drag ── */
/* ── Extend renderGantt: wire drag handles + re-apply edit class ── */
const _origRenderGantt = renderGantt;
renderGantt = function (plans, startDate, endDate) {
    _origRenderGantt(plans, startDate, endDate);

    // data-plan-id is now baked directly into each bar's HTML, so no
    // post-render tagging is needed.  We only need to attach drag handlers.
    if (!plans?.length || !startDate || !endDate) return;

    const days2 = generateDateRange(startDate, endDate)
        .filter(d => new Date(d + 'T00:00:00').getDay() !== 5);   // exclude Fridays
    const dayIdx2 = {};
    days2.forEach((d, i) => { dayIdx2[d] = i; });

    wireGanttDragEdit(dayIdx2, days2);

    // Re-apply edit-active CSS class (re-render rebuilds the DOM)
    if (_ganttEditMode) {
        const body = document.querySelector('.gantt-body');
        if (body) body.classList.add('gantt-edit-active');
    }
    _syncSelectedBlockUi();
};

/* ================================================================
   GANTT BLOCK MANAGEMENT — delete & add
   ================================================================ */

function showGanttConfirmDialog({
    title = 'Confirm Action',
    message = '',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
} = {}) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');

        overlay.innerHTML = `
            <div class="modal" style="max-width:420px">
                <div class="modal-header">
                    <h4 class="modal-title">${esc(title)}</h4>
                    <button class="modal-close" type="button" aria-label="Close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="modal-info" style="white-space:pre-line">${esc(message)}</div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-ghost" type="button" data-confirm-cancel>${esc(cancelLabel)}</button>
                    <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-confirm-ok>${esc(confirmLabel)}</button>
                </div>
            </div>`;

        const host = isGanttFullscreen() ? (getGanttCardHost() || document.body) : document.body;
        host.appendChild(overlay);

        const cancelBtn = overlay.querySelector('[data-confirm-cancel]');
        const confirmBtn = overlay.querySelector('[data-confirm-ok]');
        const closeBtn = overlay.querySelector('.modal-close');

        function cleanup(result) {
            document.removeEventListener('keydown', onKeyDown, true);
            overlay.remove();
            resolve(result);
        }

        function onKeyDown(event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                cleanup(false);
            }
        }

        overlay.addEventListener('click', event => {
            if (event.target === overlay) cleanup(false);
        });
        cancelBtn?.addEventListener('click', () => cleanup(false));
        closeBtn?.addEventListener('click', () => cleanup(false));
        confirmBtn?.addEventListener('click', () => cleanup(true));
        document.addEventListener('keydown', onKeyDown, true);
        confirmBtn?.focus();
    });
}

function cloneGanttTaskSnapshot(task) {
    return JSON.parse(JSON.stringify(task));
}

function planRestorePayload(task) {
    if (isKD2Module()) {
        return {
            id: task.id,
            battalion_id: task.battalion_id,
            vehicle_type: task.vehicle_type || task.vehicle,
            unit_serial: task.unit_serial ?? task.vehicle_no ?? null,
            unit_label: task.unit_label ?? task.vehicle_no ?? null,
            category_code: task.category_code ?? null,
            station_code: task.station_code ?? null,
            planned_start_date: task.planned_start_date || task.start_date,
            planned_end_date: task.planned_end_date || task.end_date,
            planning_source: task.planning_source || 'manual',
            remark: task.remark || null,
        };
    }
    return {
        id: task.id,
        vehicle: task.vehicle,
        vehicle_no: task.vehicle_no,
        process_station: task.process_station,
        week: task.week || weekLabel(task.start_date),
        start_date: task.start_date,
        end_date: task.end_date,
        remark: task.remark || null,
    };
}

function progressRestorePayload(task) {
    if (!task?.progress?.id) return null;
    return {
        id: task.progress.id,
        plan_id: task.id,
        completed: !!task.progress.completed,
        completion_date: task.progress.completion_date || null,
        actual_start_date: task.progress.actual_start_date || null,
        notes: task.progress.notes || null,
        updated_at: task.progress.updated_at || new Date().toISOString(),
    };
}

async function removeGanttTaskSnapshots(tasks, auditLabel = 'delete') {
    if (!tasks.length) return;
    const progressIds = tasks.map(task => task.progress?.id).filter(Boolean);
    if (progressIds.length) {
        const { error: progressError } = await db.from(getModuleProgressTable()).delete().in('id', progressIds);
        if (progressError) throw progressError;
    }

    const planIds = tasks.map(task => task.id);
    const { error } = await db.from(getModulePlanTable()).delete().in('id', planIds);
    if (error) throw error;

    if (tasks.length === 1) {
        const task = tasks[0];
        await auditLog('DELETE', getModulePlanTable(), task.id, {
            vehicle: task.vehicle,
            vehicle_no: task.vehicle_no,
            process_station: task.process_station,
            start_date: task.start_date,
            end_date: task.end_date,
        }, null);
        return;
    }

    await auditLog('DELETE', getModulePlanTable(), auditLabel, {
        count: tasks.length,
        ids: planIds,
    }, null);
}

async function restoreGanttTaskSnapshots(tasks, auditLabel = 'restore') {
    if (!tasks.length) return;
    const planPayload = tasks.map(planRestorePayload);
    const { error: planError } = await db.from(getModulePlanTable()).upsert(planPayload, { onConflict: 'id' });
    if (planError) throw planError;

    const progressPayload = tasks.map(progressRestorePayload).filter(Boolean);
    if (progressPayload.length) {
        const { error: progressError } = await db.from(getModuleProgressTable()).upsert(progressPayload, { onConflict: 'id' });
        if (progressError) throw progressError;
    }

    await auditLog('INSERT', getModulePlanTable(), auditLabel, null, {
        count: tasks.length,
        ids: tasks.map(task => task.id),
    });
}

/* ── Delete a block ──────────────────────────────────────────────── */
async function deleteGanttBlock(planId) {
    if (!canEditPlan()) { showToast('Only planners and admins can delete blocks.', 'error'); return; }

    const task = currentData.find(t => t.id === planId);
    if (!task) return;

    const confirmed = await showGanttConfirmDialog({
        title: 'Delete Block',
        message: `Delete "${task.process_station}" for ${task.vehicle} ${task.vehicle_no}?\n${formatDate(task.start_date)} -> ${formatDate(task.end_date)}\n\nYou can undo this from Gantt history.`,
        confirmLabel: 'Delete',
        danger: true,
    });
    if (!confirmed) return;

    try {
        const snapshots = [cloneGanttTaskSnapshot(task)];
        await removeGanttTaskSnapshots(snapshots, 'delete-single');

        // Remove from in-memory data
        currentData = currentData.filter(t => t.id !== planId);
        delete _ganttVisualLane[planId];
        delete _ganttManualLane[planId];
        _selectedGanttPlanIds.delete(planId);
        _pushUndoAction({
            label: 'block delete',
            undo: () => restoreGanttTaskSnapshots(snapshots, 'undo-delete'),
            redo: () => removeGanttTaskSnapshots(snapshots, 'redo-delete'),
        });

        showToast(`"${task.process_station}" deleted.`, 'success');

        const gsEl = document.getElementById('ganttStart');
        const geEl = document.getElementById('ganttEnd');
        renderGantt(currentData, gsEl?.value, geEl?.value);

    } catch (err) {
        showToast('Delete failed: ' + err.message, 'error');
        console.error(err);
    }
}

async function deleteSelectedGanttBlocks() {
    if (!canEditPlan()) { showToast('Only planners and admins can delete blocks.', 'error'); return; }
    const selectedTasks = currentData.filter(task => _selectedGanttPlanIds.has(task.id));
    if (!selectedTasks.length) return;
    const confirmed = await showGanttConfirmDialog({
        title: 'Delete Selected Blocks',
        message: `Delete ${selectedTasks.length} selected block${selectedTasks.length > 1 ? 's' : ''}?\n\nYou can undo this from Gantt history.`,
        confirmLabel: 'Delete',
        danger: true,
    });
    if (!confirmed) return;

    try {
        const snapshots = selectedTasks.map(cloneGanttTaskSnapshot);
        const planIds = snapshots.map(task => task.id);
        await removeGanttTaskSnapshots(snapshots, 'batch-delete');

        currentData = currentData.filter(task => !planIds.includes(task.id));
        planIds.forEach(id => { delete _ganttVisualLane[id]; delete _ganttManualLane[id]; });
        planIds.forEach(id => _selectedGanttPlanIds.delete(id));
        _pushUndoAction({
            label: `${snapshots.length} block delete${snapshots.length > 1 ? 's' : ''}`,
            undo: () => restoreGanttTaskSnapshots(snapshots, 'undo-batch-delete'),
            redo: () => removeGanttTaskSnapshots(snapshots, 'redo-batch-delete'),
        });
        _syncSelectedBlockUi();
        showToast(`${selectedTasks.length} selected block${selectedTasks.length > 1 ? 's' : ''} deleted.`, 'success');

        const gsEl = document.getElementById('ganttStart');
        const geEl = document.getElementById('ganttEnd');
        renderGantt(currentData, gsEl?.value, geEl?.value);
    } catch (err) {
        showToast('Delete failed: ' + err.message, 'error');
        console.error(err);
    }
}

/* ── Wire bar action buttons via event delegation on ganttInner ── */
function wireBarDeleteButtons() {
    // Use event delegation on the gantt body — avoids the timing race
    // where pointerdown captures before click fires on child buttons.
    const inner = document.getElementById('ganttInner');
    if (!inner) return;

    // Remove any existing delegated listener before re-adding (avoids duplicates)
    inner.removeEventListener('click', _ganttBarClickHandler);
    inner.addEventListener('click', _ganttBarClickHandler);
}

function _ganttBarClickHandler(e) {
    const placementTrack = e.target.closest('.gr-track[data-kd2-track="true"]');
    const clickedBar = e.target.closest('.gc-bar');
    if (placementTrack && !clickedBar && isKD2Module() && getModuleRuntime()?.isPlacementActive?.()) {
        e.stopPropagation();
        const days = String(placementTrack.dataset.ganttDays || '').split(',').filter(Boolean);
        if (days.length) {
            const rect = placementTrack.getBoundingClientRect();
            const offset = Math.max(0, Math.min(rect.width - 1, e.clientX - rect.left));
            const dayWidth = rect.width / Math.max(days.length, 1);
            const dayIndex = Math.max(0, Math.min(days.length - 1, Math.floor(offset / Math.max(dayWidth, 1))));
            const plannedStart = days[dayIndex] || '';
            if (plannedStart) {
                getModuleRuntime()?.placePlanBlockFromGanttTrack?.(placementTrack, plannedStart);
            }
        }
        return;
    }
    const laneSelectBtn = e.target.closest('[data-gantt-lane-select]');
    if (laneSelectBtn) {
        e.stopPropagation();
        const planId = parseInt(laneSelectBtn.dataset.ganttLaneSelect, 10);
        const task = currentData.find(row => row.id === planId);
        if (task) toggleGanttLaneSelection(task);
        return;
    }
    const selectBtn = e.target.closest('.gc-bar-select');
    if (selectBtn) {
        e.stopPropagation();
        const planId = parseInt(selectBtn.dataset.planId, 10);
        const task = currentData.find(row => row.id === planId);
        if (_ganttSelectLaneMode && isKD2Module() && task) {
            toggleGanttLaneSelection(task);
            return;
        }
        if (_selectedGanttPlanIds.has(planId)) _selectedGanttPlanIds.delete(planId);
        else _selectedGanttPlanIds.add(planId);
        _syncSelectedBlockUi();
        return;
    }
    const menuTrigger = e.target.closest('.gc-bar-menu-trigger');
    if (menuTrigger) {
        e.stopPropagation();
        _openGanttBlockMenuPlanId = parseInt(menuTrigger.dataset.planId);
        document.querySelectorAll('.gc-bar-menu-open').forEach(bar => bar.classList.remove('gc-bar-menu-open', 'gc-bar-menu-below'));
        document.querySelectorAll('.gc-row-menu-open').forEach(row => row.classList.remove('gc-row-menu-open'));
        const bar = menuTrigger.closest('.gc-bar');
        if (bar) bar.classList.add('gc-bar-menu-open');
        const row = menuTrigger.closest('.gr');
        if (row) row.classList.add('gc-row-menu-open');
        document.querySelectorAll('.gc-bar-menu-trigger').forEach(btn => btn.setAttribute('aria-expanded', btn === menuTrigger ? 'true' : 'false'));
        requestAnimationFrame(positionOpenGanttBlockMenu);
        return;
    }
    const menuClose = e.target.closest('.gc-bar-menu-close');
    if (menuClose) {
        e.stopPropagation();
        const planId = parseInt(menuClose.dataset.planId);
        if (_openGanttBlockMenuPlanId === planId) _openGanttBlockMenuPlanId = null;
        const bar = menuClose.closest('.gc-bar');
        if (bar) bar.classList.remove('gc-bar-menu-open', 'gc-bar-menu-below');
        menuClose.closest('.gr')?.classList.remove('gc-row-menu-open');
        bar?.querySelector('.gc-bar-menu-trigger')?.setAttribute('aria-expanded', 'false');
        return;
    }
    // Delete button
    const delBtn = e.target.closest('.gc-bar-delete, .gc-bar-menu-delete');
    if (delBtn) {
        e.stopPropagation();
        const planId = parseInt(delBtn.dataset.planId);
        deleteGanttBlock(planId);
        return;
    }
    // Edit button
    const editBtn = e.target.closest('.gc-bar-edit, .gc-bar-menu-edit');
    if (editBtn) {
        e.stopPropagation();
        const planId = parseInt(editBtn.dataset.planId);
        if (isKD2Module()) {
            getModuleRuntime()?.openPlanEdit?.(planId);
            return;
        }
        openEditBlockModal(planId);
        return;
    }
    // Lane up button — decrease priority number (moves bar toward lane 0 = top)
    const laneUp = e.target.closest('.gc-bar-lane-up');
    if (laneUp) {
        e.stopPropagation();
        const planId = parseInt(laneUp.dataset.planId);
        const gsEl = document.getElementById('ganttStart');
        const geEl = document.getElementById('ganttEnd');
        moveGanttBlockOneLane(planId, -1, gsEl?.value, geEl?.value);
        renderGantt(currentData, gsEl?.value, geEl?.value);
        return;
    }
    // Lane down button — increase priority number (moves bar toward higher lanes)
    const laneDown = e.target.closest('.gc-bar-lane-dn');
    if (laneDown) {
        e.stopPropagation();
        const planId = parseInt(laneDown.dataset.planId);
        const gsEl = document.getElementById('ganttStart');
        const geEl = document.getElementById('ganttEnd');
        moveGanttBlockOneLane(planId, 1, gsEl?.value, geEl?.value);
        renderGantt(currentData, gsEl?.value, geEl?.value);
        return;
    }
}

/* ── Add Block modal ─────────────────────────────────────────────── */
function openAddBlockModal() {
    if (!canEditPlan()) { showToast('Only planners and admins can add blocks.', 'error'); return; }
    if (isKD2Module()) {
        getModuleRuntime()?.openPlanCreateModal?.();
        return;
    }

    const overlay = document.getElementById('addBlockOverlay');

    // Populate vehicle dropdown from current data + "+ New Vehicle" option
    const vehicles = [...new Set(currentData.map(t => t.vehicle))].sort(vehicleSort);
    const vSel = document.getElementById('abVehicle');
    vSel.innerHTML =
        vehicles.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('') +
        `<option value="__new__">+ New Vehicle…</option>`;

    // Reset fields
    document.getElementById('abStart').value = todayStr();
    document.getElementById('abRemark').value = '';
    document.getElementById('abNewVehicle').value = '';
    document.getElementById('abNewVehicleGroup').style.display = 'none';
    document.getElementById('abError').style.display = 'none';

    // Populate unit dropdown for first vehicle
    updateAbUnits();
    updateAbPreview();

    overlay.style.display = 'flex';
}

function closeAddBlockModal() {
    document.getElementById('addBlockOverlay').style.display = 'none';
}

function updateAbUnits() {
    const vSel = document.getElementById('abVehicle');
    const vehicle = vSel.value;
    const uSel = document.getElementById('abUnit');
    const newVGrp = document.getElementById('abNewVehicleGroup');
    const newUGrp = document.getElementById('abNewUnitGroup');

    if (vehicle === '__new__') {
        newVGrp.style.display = 'block';
        uSel.innerHTML = `<option value="__new__">+ New Unit…</option>`;
        newUGrp.style.display = 'block';
        return;
    }
    newVGrp.style.display = 'none';

    const units = [...new Set(
        currentData.filter(t => t.vehicle === vehicle).map(t => t.vehicle_no)
    )].sort(naturalSort);

    uSel.innerHTML =
        units.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join('') +
        `<option value="__new__">+ New Unit…</option>`;

    const uVal = uSel.value;
    newUGrp.style.display = (uVal === '__new__') ? 'block' : 'none';
}

/**
 * Compute end date from start + working-day duration,
 * skipping Friday and (optionally) Saturday.
 */
function computeEndDate(startStr, durationDays, allowSat) {
    let d = new Date(startStr + 'T00:00:00');
    let worked = 0;
    const isFri = day => day === 5;
    const isSat = day => day === 6;

    while (worked < durationDays) {
        const dow = d.getDay();
        if (!isFri(dow) && !(isSat(dow) && !allowSat)) {
            worked++;
        }
        if (worked < durationDays) d.setDate(d.getDate() + 1);
    }
    return localDateStr(d);
}

function updateAbPreview() {
    const station = document.getElementById('abStation').value;
    const startStr = document.getElementById('abStart').value;
    const durStr = document.getElementById('abDuration').value;

    // Auto-fill duration when station changes
    if (STATION_DEFAULTS[station] !== undefined) {
        document.getElementById('abDuration').value = STATION_DEFAULTS[station];
    }

    const duration = parseInt(document.getElementById('abDuration').value) || 1;
    const preview = document.getElementById('abPreview');
    const text = document.getElementById('abPreviewText');

    if (startStr && duration > 0) {
        const allowSat = document.getElementById('ganttSatToggle')?.checked || false;
        const endStr = computeEndDate(startStr, duration, allowSat);
        text.textContent = `${formatDate(startStr)} → ${formatDate(endStr)}`;
        preview.style.display = 'flex';
    } else {
        preview.style.display = 'none';
    }
}

async function saveAddBlock() {
    // Resolve new vehicle / unit names
    let vehicle = document.getElementById('abVehicle').value;
    if (vehicle === '__new__') {
        vehicle = document.getElementById('abNewVehicle').value.trim();
        if (!vehicle) {
            const errEl = document.getElementById('abError');
            errEl.textContent = 'Please enter a name for the new vehicle.';
            errEl.style.display = 'flex'; return;
        }
    }
    let unit = document.getElementById('abUnit').value;
    if (unit === '__new__') {
        unit = document.getElementById('abNewUnit').value.trim();
        if (!unit) {
            const errEl = document.getElementById('abError');
            errEl.textContent = 'Please enter a name for the new unit.';
            errEl.style.display = 'flex'; return;
        }
    }
    const station = document.getElementById('abStation').value;
    const startStr = document.getElementById('abStart').value;
    const duration = parseInt(document.getElementById('abDuration').value) || 0;
    const remark = document.getElementById('abRemark').value.trim();
    const errEl = document.getElementById('abError');

    errEl.style.display = 'none';

    if (!vehicle || !unit || !station || !startStr || duration < 1) {
        errEl.textContent = 'Please fill in all required fields with a valid duration.';
        errEl.style.display = 'flex';
        return;
    }

    // Skip Friday for start date
    const allowSat = document.getElementById('ganttSatToggle')?.checked || false;
    const adjStart = skipNonWorking(startStr, allowSat);
    const endStr = computeEndDate(adjStart, duration, allowSat);

    const payload = {
        vehicle,
        vehicle_no: unit,
        process_station: station,
        start_date: adjStart,
        end_date: endStr,
        week: weekLabel(adjStart),   // auto-computed from start date
        remark: remark || null,
    };

    try {
        const { data: inserted, error } = await db
            .from('assembly_plan')
            .insert(payload)
            .select()
            .single();

        if (error) throw error;

        await auditLog('INSERT', 'assembly_plan', inserted.id, null, payload);

        // Add to in-memory data with no progress
        currentData.push({ ...inserted, progress: null });
        currentData.sort((a, b) => {
            const vCmp = vehicleSort(a.vehicle, b.vehicle); if (vCmp) return vCmp;
            const uCmp = naturalSort(a.vehicle_no, b.vehicle_no); if (uCmp) return uCmp;
            return (a.start_date || '').localeCompare(b.start_date || '');
        });

        showToast(`"${station}" added to ${vehicle} ${unit}`, 'success');
        closeAddBlockModal();

        const gsEl = document.getElementById('ganttStart');
        const geEl = document.getElementById('ganttEnd');
        renderGantt(currentData, gsEl?.value, geEl?.value);

    } catch (err) {
        errEl.textContent = 'Save failed: ' + err.message;
        errEl.style.display = 'flex';
        console.error(err);
    }
}

/* ── Extend wireGanttControls with add/delete wiring ────────────── */
const _origWireGanttFull = wireGanttControls;
wireGanttControls = function () {
    _origWireGanttFull();
    bindGanttFullscreenUi();

    // Add Block modal
    document.getElementById('btnAddBlock')?.addEventListener('click', openAddBlockModal);
    document.getElementById('addBlockClose')?.addEventListener('click', closeAddBlockModal);
    document.getElementById('btnAddBlockCancel')?.addEventListener('click', closeAddBlockModal);
    document.getElementById('addBlockOverlay')?.addEventListener('click', function (e) {
        if (e.target === this) closeAddBlockModal();
    });
    document.getElementById('btnAddBlockSave')?.addEventListener('click', saveAddBlock);

    // Live preview wiring
    document.getElementById('abStation')?.addEventListener('change', updateAbPreview);
    document.getElementById('abStart')?.addEventListener('change', updateAbPreview);
    document.getElementById('abDuration')?.addEventListener('input', updateAbPreview);
    document.getElementById('abVehicle')?.addEventListener('change', () => {
        updateAbUnits();
        updateAbPreview();
    });
    document.getElementById('abUnit')?.addEventListener('change', () => {
        const newUGrp = document.getElementById('abNewUnitGroup');
        if (newUGrp) newUGrp.style.display =
            document.getElementById('abUnit').value === '__new__' ? 'block' : 'none';
        updateAbPreview();
    });
};

/* ── Extend wireGanttDragEdit to also wire delete buttons ────────── */
const _origWireGanttDragEdit = wireGanttDragEdit;
wireGanttDragEdit = function (dayIndex, days) {
    _origWireGanttDragEdit(dayIndex, days);
    if (_ganttEditMode) wireBarDeleteButtons();
};

/* ================================================================
   EDIT BLOCK MODAL — change start date, duration, week, remark
   ================================================================ */

function openEditBlockModal(planId) {
    if (!canEditPlan()) { showToast('Only planners and admins can edit blocks.', 'error'); return; }

    const task = currentData.find(t => t.id === planId);
    if (!task) return;

    document.getElementById('ebPlanId').value = planId;
    document.getElementById('ebBlockInfo').textContent =
        `${task.vehicle} ${task.vehicle_no} — ${task.process_station}`;
    document.getElementById('ebStart').value = task.start_date;
    document.getElementById('ebRemark').value = task.remark || '';
    document.getElementById('ebError').style.display = 'none';
    const badge = document.getElementById('ebWeekBadge');
    if (badge) badge.textContent = task.start_date ? weekLabel(task.start_date) : '—';

    // Compute current duration in calendar days, then re-express as working days
    const calDays = dayDiff(task.start_date, task.end_date);
    document.getElementById('ebDuration').value = Math.max(1, calDays);

    updateEbPreview();

    document.getElementById('editBlockOverlay').style.display = 'flex';
}

function closeEditBlockModal() {
    document.getElementById('editBlockOverlay').style.display = 'none';
}

function updateEbPreview() {
    const startStr = document.getElementById('ebStart').value;
    const duration = parseInt(document.getElementById('ebDuration').value) || 0;
    const preview = document.getElementById('ebPreview');
    const text = document.getElementById('ebPreviewText');

    // Update auto-computed week badge
    const badge = document.getElementById('ebWeekBadge');
    if (badge) badge.textContent = startStr ? weekLabel(startStr) : '—';

    if (startStr && duration > 0) {
        const allowSat = document.getElementById('ganttSatToggle')?.checked || false;
        const endStr = computeEndDate(startStr, duration, allowSat);
        text.textContent = `${formatDate(startStr)} → ${formatDate(endStr)}`;
        preview.style.display = 'flex';
    } else {
        preview.style.display = 'none';
    }
}

async function saveEditBlock() {
    const planId = parseInt(document.getElementById('ebPlanId').value);
    const startStr = document.getElementById('ebStart').value;
    const duration = parseInt(document.getElementById('ebDuration').value) || 0;
    const remark = document.getElementById('ebRemark').value.trim();
    const errEl = document.getElementById('ebError');

    errEl.style.display = 'none';

    if (!startStr || duration < 1) {
        errEl.textContent = 'Please set a valid start date and duration (at least 1 day).';
        errEl.style.display = 'flex';
        return;
    }

    const task = currentData.find(t => t.id === planId);
    if (!task) return;

    const allowSat = document.getElementById('ganttSatToggle')?.checked || false;
    const adjStart = skipNonWorking(startStr, allowSat);
    const endStr = computeEndDate(adjStart, duration, allowSat);

    const before = {
        start_date: task.start_date, end_date: task.end_date,
        week: task.week, remark: task.remark
    };
    const computedWeek = weekLabel(adjStart);
    const after = {
        start_date: adjStart, end_date: endStr,
        week: computedWeek, remark: remark || null
    };

    try {
        const { error } = await db
            .from('assembly_plan')
            .update({
                start_date: adjStart, end_date: endStr,
                week: computedWeek, remark: remark || null
            })
            .eq('id', planId);

        if (error) throw error;

        await auditLog('UPDATE', 'assembly_plan', planId, before, after);

        // Update in-memory
        Object.assign(task, {
            start_date: adjStart, end_date: endStr,
            week: computedWeek, remark: remark || null
        });

        showToast('Block updated.', 'success');
        closeEditBlockModal();

        const gsEl = document.getElementById('ganttStart');
        const geEl = document.getElementById('ganttEnd');
        renderGantt(currentData, gsEl?.value, geEl?.value);

    } catch (err) {
        errEl.textContent = 'Save failed: ' + err.message;
        errEl.style.display = 'flex';
        console.error(err);
    }
}

/* Wire edit block modal from wireEvents */
(function wireEditBlock() {
    // Called on DOMContentLoaded, safe to query the DOM
    window.addEventListener('DOMContentLoaded', () => {
        document.getElementById('editBlockClose')?.addEventListener('click', closeEditBlockModal);
        document.getElementById('btnEditBlockCancel')?.addEventListener('click', closeEditBlockModal);
        document.getElementById('btnEditBlockSave')?.addEventListener('click', saveEditBlock);
        document.getElementById('editBlockOverlay')?.addEventListener('click', function (e) {
            if (e.target === this) closeEditBlockModal();
        });
        document.getElementById('ebStart')?.addEventListener('change', updateEbPreview);
        document.getElementById('ebDuration')?.addEventListener('input', updateEbPreview);
    });
})();
