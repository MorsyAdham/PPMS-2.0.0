// PPMS Control Panel — local monitoring and admin dashboard.
//
//   node tools/control-panel/server.mjs      (or double-click start.cmd)
//
// Runs only on this computer (127.0.0.1). Settings and the Supabase service
// key live in tools/control-panel/.env, which git ignores — see .env.example.
// No npm packages: Node 18+ built-ins only.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

/* ── Settings ─────────────────────────────────────────────────── */
function loadEnv(file) {
    const env = {};
    if (!fs.existsSync(file)) return env;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return env;
}
const ENV = { ...loadEnv(path.join(HERE, '.env')) };

// The public URL and anon key come from the app's own config unless overridden.
const appConfig = fs.readFileSync(path.join(ROOT, 'app/scripts/core/config.js'), 'utf8');
const pick = re => (appConfig.match(re) || [])[1];
const SUPABASE_URL = (ENV.SUPABASE_URL || pick(/SUPABASE_URL\s*=\s*'([^']+)'/) || '').replace(/\/$/, '');
const ANON_KEY = ENV.SUPABASE_ANON_KEY || pick(/SUPABASE_KEY\s*=\s*'([^']+)'/) || '';
const SERVICE_KEY = ENV.SUPABASE_SERVICE_KEY || '';
const ACCESS_TOKEN = ENV.SUPABASE_ACCESS_TOKEN || '';
const PROJECT_REF = (SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1] || '';
const LIVE_URL = (ENV.LIVE_URL || 'https://morsyadham.github.io/Planning-Monitoring-System/').replace(/\/?$/, '/');
const V2_URL = ENV.V2_URL ? ENV.V2_URL.replace(/\/?$/, '/') : '';
const BACKUP_DIR = path.resolve(ENV.BACKUP_DIR || 'D:\\PPMS_backups');
const PORT = Number(ENV.PORT) || 4317;
const PANEL_NAME = 'control-panel@local';

// PPMS tables only — the Supabase project is shared with SIMS, Assembly,
// Machining and others, whose tables this panel never touches.
const PPMS_TABLES = [
    'planning_app_users', 'planning_audit_log', 'plan_versions', 'planning_non_work_days',
    'assembly_plan', 'vehicle_units',
    'kd2_battalions', 'kd2_vehicle_units', 'kd2_plan', 'kd2_progress', 'kd2_planning_inputs',
    'kd2_process_categories', 'kd2_process_stations', 'kd2_process_routes', 'kd2_process_lead_times',
    'kd2_plan_route_order', 'kd2_template_layout_items',
    'f100_battalions', 'f100_vehicle_units', 'f100_plans', 'f100_parts', 'f100_processes',
    'production_issues', 'production_issue_categories', 'production_issue_drafts',
    'ppms_system_notice',
];
// Checked with the PUBLIC key: if any of these answer, anyone on the internet can read them.
const EXPOSURE_TABLES = ['planning_app_users', 'planning_audit_log', 'kd2_plan', 'production_issues', 'users'];
const USER_COLS = 'id,email,full_name,role,is_active,modules,can_export,created_at';
const ROLES = ['viewer', 'operator', 'planner', 'master_admin'];
const MODULES = ['kd1', 'kd2', 'f100kd2'];

/* ── Supabase REST ────────────────────────────────────────────── */
async function sb(pathq, { method = 'GET', body, key = SERVICE_KEY, prefer, range } = {}) {
    if (!SUPABASE_URL) throw new Error('SUPABASE_URL is not set');
    if (!key) throw new Error('SUPABASE_SERVICE_KEY is not set in tools/control-panel/.env');
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (prefer) headers.Prefer = prefer;
    if (range) { headers['Range-Unit'] = 'items'; headers.Range = range; }
    const t0 = performance.now();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathq}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
    });
    const ms = Math.round(performance.now() - t0);
    const text = method === 'HEAD' ? '' : await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
        const msg = (data && (data.message || data.hint)) || `${res.status} ${res.statusText}`;
        const err = new Error(msg);
        err.status = res.status;
        throw err;
    }
    return { data, ms, status: res.status, headers: res.headers };
}

async function count(table, filter = '', key = SERVICE_KEY) {
    const r = await sb(`${table}?select=*&limit=1${filter}`, { method: 'HEAD', key, prefer: 'count=exact' });
    const total = (r.headers.get('content-range') || '').split('/')[1];
    return total && total !== '*' ? Number(total) : null;
}

async function fetchAll(pathq, pageSize = 1000) {
    const rows = [];
    for (let from = 0; ; from += pageSize) {
        const { data } = await sb(pathq, { range: `${from}-${from + pageSize - 1}` });
        rows.push(...(data || []));
        if (!data || data.length < pageSize) return rows;
    }
}

async function writeAudit(action, recordId, before, after) {
    try {
        await sb('planning_audit_log', {
            method: 'POST', prefer: 'return=minimal',
            body: {
                user_email: PANEL_NAME, user_role: 'master_admin', action,
                table_name: action === 'NOTICE' ? 'ppms_system_notice' : 'planning_app_users',
                record_id: String(recordId ?? ''), data_before: before ?? null, data_after: after ?? null,
                ip_address: '127.0.0.1', created_at: new Date().toISOString(),
            },
        });
        return true;
    } catch (e) {
        console.warn('Audit write failed (non-fatal):', e.message);
        return false;
    }
}

/* ── Git / shell ──────────────────────────────────────────────── */
function git(...args) {
    return new Promise(resolve => {
        execFile('git', args, { cwd: ROOT, maxBuffer: 8 << 20, windowsHide: true }, (err, stdout, stderr) => {
            resolve({ ok: !err, out: String(stdout).trimEnd(), err: String(stderr).trim() });
        });
    });
}

function findBash() {
    if (process.platform !== 'win32') return 'bash';
    const candidates = [
        'C:\\Program Files\\Git\\bin\\bash.exe',
        'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Programs\\Git\\bin\\bash.exe'),
    ];
    // Plain "bash" on Windows can be WSL's, which would run deploy.sh in the wrong environment.
    return candidates.find(p => fs.existsSync(p)) || null;
}

/* ── Jobs (deploy, push, fetch, backup) — one at a time ────────── */
const jobs = new Map();
let runningJob = null;

function newJob(title) {
    if (runningJob) throw httpError(409, `"${runningJob.title}" is still running.`);
    const job = { id: crypto.randomUUID(), title, status: 'running', output: '', exitCode: null, started: new Date().toISOString(), ended: null };
    jobs.set(job.id, job);
    runningJob = job;
    return job;
}
function endJob(job, code) {
    job.exitCode = code;
    job.status = code === 0 ? 'done' : 'failed';
    job.ended = new Date().toISOString();
    if (runningJob === job) runningJob = null;
}
function runCommand(title, cmd, args) {
    const job = newJob(title);
    job.output += `$ ${[path.basename(cmd), ...args].join(' ')}\n`;
    const child = spawn(cmd, args, { cwd: ROOT, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    child.stdout.on('data', d => { job.output += d; });
    child.stderr.on('data', d => { job.output += d; });
    child.on('error', e => { job.output += `\n${e.message}\n`; endJob(job, 1); });
    child.on('close', code => { job.output += `\n[exit ${code}]\n`; endJob(job, code ?? 1); });
    return job;
}
function runTask(title, fn) {
    const job = newJob(title);
    const log = line => { job.output += line + '\n'; };
    fn(log).then(() => endJob(job, 0), e => { log(`ERROR: ${e.message}`); endJob(job, 1); });
    return job;
}

/* ── Monitors ─────────────────────────────────────────────────── */
async function probeSite(base) {
    const out = { url: base, up: false, ms: null, status: null, version: null, error: null };
    try {
        const t0 = performance.now();
        const res = await fetch(base, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
        out.ms = Math.round(performance.now() - t0);
        out.status = res.status;
        out.up = res.ok;
        await res.arrayBuffer();
    } catch (e) { out.error = e.message; }
    try {
        const res = await fetch(`${base}version.json?t=${Date.now()}`, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
        if (res.ok) {
            const v = await res.json();
            out.version = { label: v.label, version: v.version, deployedAt: v.deployedAt, notes: v.notes };
        }
    } catch {}
    return out;
}

async function siteStatus() {
    const [live, v2] = await Promise.all([probeSite(LIVE_URL), V2_URL ? probeSite(V2_URL) : null]);
    return { live, v2, checkedAt: new Date().toISOString() };
}

const STAMP_FILES = [':(exclude)version.json', ':(exclude)scripts/core/build-info.js'];
async function deployedDiff(remoteBranch, folder) {
    const ref = await git('rev-parse', '--verify', '-q', `${remoteBranch}^{commit}`);
    if (!ref.ok) return { known: false };
    const diff = await git('diff', '--name-only', `HEAD:${folder}`, remoteBranch, '--', '.', ...STAMP_FILES);
    const last = await git('log', '-1', '--format=%s%x1f%cr', remoteBranch);
    const [subject, when] = last.out.split('\x1f');
    const files = diff.out ? diff.out.split('\n') : [];
    return { known: true, inSync: diff.ok && files.length === 0, files: files.slice(0, 30), fileCount: files.length, lastDeploy: { subject, when } };
}

async function gitStatus() {
    const [branch, status, log, aheadBehind, appVsV2] = await Promise.all([
        git('rev-parse', '--abbrev-ref', 'HEAD'),
        git('status', '--porcelain=v1', '-uall'),
        git('log', '-8', '--format=%h%x1f%s%x1f%cr%x1f%an'),
        git('rev-list', '--left-right', '--count', 'origin/main...HEAD'),
        git('diff', '--name-only', 'HEAD:app', 'HEAD:app-v2'),
    ]);
    const changes = status.out ? status.out.split('\n').map(l => ({ code: l.slice(0, 2).trim(), file: l.slice(3).replace(/^"|"$/g, '') })) : [];
    const [behind, ahead] = (aheadBehind.out || '0 0').split(/\s+/).map(Number);
    const [prodMain, prodV2] = await Promise.all([deployedDiff('production/main', 'app'), deployedDiff('production/v2', 'app-v2')]);
    return {
        branch: branch.out,
        changes: {
            app: changes.filter(c => c.file.startsWith('app/')),
            appV2: changes.filter(c => c.file.startsWith('app-v2/')),
            other: changes.filter(c => !c.file.startsWith('app/') && !c.file.startsWith('app-v2/')),
        },
        origin: { ahead, behind, known: aheadBehind.ok },
        deploy: { app: prodMain, appV2: prodV2 },
        appVsV2: appVsV2.out ? appVsV2.out.split('\n') : [],
        commits: log.out ? log.out.split('\n').map(l => { const [hash, subject, when, author] = l.split('\x1f'); return { hash, subject, when, author }; }) : [],
        bash: !!findBash(),
    };
}

async function dbStatus() {
    const out = { configured: !!SERVICE_KEY, reachable: false, ms: null, error: null, tables: [], exposure: [], users: null, checks: [] };
    if (!SERVICE_KEY) { out.error = 'Add SUPABASE_SERVICE_KEY to tools/control-panel/.env'; return out; }
    try {
        const r = await sb('plan_versions?select=id&limit=1');
        out.reachable = true;
        out.ms = r.ms;
    } catch (e) { out.error = e.message; return out; }

    out.tables = await Promise.all(PPMS_TABLES.map(async t => {
        try { return { table: t, rows: await count(t) }; } catch (e) { return { table: t, rows: null, error: e.message }; }
    }));
    out.exposure = await Promise.all(EXPOSURE_TABLES.map(async t => {
        try {
            const rows = await count(t, '', ANON_KEY);
            return { table: t, readable: rows !== null && rows > 0, rows };
        } catch (e) { return { table: t, readable: false, status: e.status || null }; }
    }));
    try {
        const users = await sb('planning_app_users?select=role,is_active');
        const list = users.data || [];
        out.users = {
            total: list.length,
            active: list.filter(u => u.is_active).length,
            masterAdmins: list.filter(u => u.is_active && u.role === 'master_admin').length,
        };
    } catch {}
    const checks = [
        ['KD2 stations without a work centre', 'kd2_process_stations', '&work_center=is.null'],
        ['Issue drafts waiting', 'production_issue_drafts', ''],
        ['Inactive user accounts', 'planning_app_users', '&is_active=eq.false'],
    ];
    out.checks = await Promise.all(checks.map(async ([label, t, f]) => {
        try { return { label, value: await count(t, f) }; } catch (e) { return { label, value: null, error: e.message }; }
    }));
    return out;
}

function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

async function activity() {
    const since7 = new Date(Date.now() - 7 * 864e5).toISOString();
    const [recent, today, issues] = await Promise.all([
        sb('planning_audit_log?select=created_at,user_email,user_role,action,table_name,record_id,plan_version_name&order=created_at.desc&limit=60'),
        fetchAll(`planning_audit_log?select=user_email,action,created_at&created_at=gte.${encodeURIComponent(startOfToday())}&order=created_at.desc`),
        sb(`production_issues?select=id,title,status,priority,category,reporter_name,created_at&created_at=gte.${encodeURIComponent(since7)}&order=created_at.desc&limit=30`),
    ]);
    const byUser = {};
    for (const r of today) {
        const u = byUser[r.user_email || '—'] ||= { email: r.user_email || '—', actions: 0, logins: 0, last: r.created_at };
        u.actions++;
        if (r.action === 'LOGIN') u.logins++;
    }
    return {
        recent: recent.data || [],
        today: {
            actions: today.length,
            logins: today.filter(r => r.action === 'LOGIN').length,
            users: Object.values(byUser).sort((a, b) => b.actions - a.actions),
        },
        newIssues: issues.data || [],
    };
}

async function kpis() {
    const today = new Date().toISOString().slice(0, 10);
    const { data: versions } = await sb('plan_versions?select=id,name&module_id=eq.kd2&is_baseline=eq.true&limit=1');
    const version = versions?.[0] || null;
    const [battalions, plan, issues] = await Promise.all([
        sb('kd2_battalions?select=id,battalion_code,battalion_name,delivery_deadline&order=battalion_code'),
        version ? fetchAll(`kd2_plan?select=id,battalion_id,vehicle_type,planned_end_date,kd2_progress(completed,actual_start_date)&plan_version_id=eq.${version.id}&order=id`) : [],
        sb('production_issues?select=status,priority'),
    ]);
    const prog = r => (Array.isArray(r.kd2_progress) ? r.kd2_progress[0] : r.kd2_progress) || {};
    const tally = () => ({ steps: 0, done: 0, started: 0, overdue: 0, lastPlannedEnd: null });
    const add = (t, r) => {
        const p = prog(r);
        t.steps++;
        if (p.completed) t.done++;
        else if (p.actual_start_date) t.started++;
        if (!p.completed && r.planned_end_date < today) t.overdue++;
        if (!t.lastPlannedEnd || r.planned_end_date > t.lastPlannedEnd) t.lastPlannedEnd = r.planned_end_date;
    };
    const total = tally();
    const byType = {};
    const byBtl = {};
    for (const r of plan) {
        add(total, r);
        add(byType[r.vehicle_type] ||= tally(), r);
        add(byBtl[r.battalion_id] ||= tally(), r);
    }
    const openIssues = (issues.data || []).filter(i => i.status === 'open' || i.status === 'in_progress');
    const byPriority = {};
    for (const i of openIssues) byPriority[i.priority] = (byPriority[i.priority] || 0) + 1;
    return {
        version,
        today,
        kd2: total,
        byType,
        battalions: (battalions.data || []).filter(b => byBtl[b.id]).map(b => ({ ...b, ...byBtl[b.id] })),
        issues: { open: openIssues.length, byPriority },
    };
}

/* ── Users ────────────────────────────────────────────────────── */
async function listUsers() {
    const [{ data: users }, logins] = await Promise.all([
        sb(`planning_app_users?select=${USER_COLS}&order=full_name`),
        sb('planning_audit_log?select=user_email,created_at&action=eq.LOGIN&order=created_at.desc&limit=3000'),
    ]);
    const lastLogin = {};
    for (const l of logins.data || []) {
        const k = String(l.user_email || '').toLowerCase();
        if (!lastLogin[k]) lastLogin[k] = l.created_at;
    }
    return users.map(u => ({ ...u, last_login: lastLogin[String(u.email || '').toLowerCase()] || null }));
}

async function updateUser(id, body) {
    if (!/^[\w-]{1,64}$/.test(id)) throw httpError(400, 'Bad user id');
    const patch = {};
    if ('is_active' in body) patch.is_active = !!body.is_active;
    if ('can_export' in body) patch.can_export = !!body.can_export;
    if ('role' in body) {
        if (!ROLES.includes(body.role)) throw httpError(400, 'Unknown role');
        patch.role = body.role;
    }
    if ('modules' in body) {
        if (!Array.isArray(body.modules) || !body.modules.length || body.modules.some(m => !MODULES.includes(m))) throw httpError(400, 'Pick at least one valid module');
        patch.modules = [...new Set(body.modules)];
    }
    if (!Object.keys(patch).length) throw httpError(400, 'Nothing to change');

    const { data: before } = await sb(`planning_app_users?select=${USER_COLS}&id=eq.${id}`);
    if (!before?.length) throw httpError(404, 'User not found');
    const user = before[0];
    const losesAdmin = user.role === 'master_admin' && user.is_active
        && (patch.is_active === false || (patch.role && patch.role !== 'master_admin'));
    if (losesAdmin) {
        const admins = await count('planning_app_users', '&role=eq.master_admin&is_active=eq.true');
        if (admins <= 1) throw httpError(409, 'This is the last active Master Admin — refusing to lock everyone out.');
    }
    const { data: after } = await sb(`planning_app_users?id=eq.${id}&select=${USER_COLS}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
    const changedBefore = Object.fromEntries(Object.keys(patch).map(k => [k, user[k]]));
    const audited = await writeAudit('UPDATE', id, { ...changedBefore, _ctx: user.email }, { ...patch, _ctx: user.email });
    return { user: after?.[0], audited };
}

/* ── Notice ───────────────────────────────────────────────────── */
async function getNotice() {
    try {
        const { data } = await sb('ppms_system_notice?select=*&id=eq.1');
        return { installed: true, notice: data?.[0] || null };
    } catch (e) {
        return { installed: false, error: e.message };
    }
}
async function setNotice(body) {
    const level = ['info', 'warning', 'critical'].includes(body.level) ? body.level : 'info';
    const row = {
        id: 1,
        active: !!body.active,
        level,
        message: String(body.message || '').slice(0, 500),
        read_only: !!body.read_only,
        updated_by: PANEL_NAME,
        updated_at: new Date().toISOString(),
    };
    const { data } = await sb('ppms_system_notice?on_conflict=id', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=representation' });
    await writeAudit('NOTICE', 1, null, row);
    return { installed: true, notice: data?.[0] || row };
}

/* ── Backups ──────────────────────────────────────────────────── */
function backupDirIsSafe() {
    const rel = path.relative(ROOT, BACKUP_DIR);
    return rel.startsWith('..') || path.isAbsolute(rel);   // must be OUTSIDE the (public) repo
}
async function listBackups() {
    if (!fs.existsSync(BACKUP_DIR)) return { dir: BACKUP_DIR, safe: backupDirIsSafe(), backups: [] };
    const entries = await fsp.readdir(BACKUP_DIR, { withFileTypes: true });
    const backups = [];
    for (const e of entries.filter(e => e.isDirectory() && e.name.startsWith('ppms_'))) {
        const dir = path.join(BACKUP_DIR, e.name);
        let manifest = null;
        try { manifest = JSON.parse(await fsp.readFile(path.join(dir, 'manifest.json'), 'utf8')); } catch {}
        let bytes = 0;
        for (const f of await fsp.readdir(dir)) bytes += (await fsp.stat(path.join(dir, f))).size;
        backups.push({ name: e.name, path: dir, bytes, createdAt: manifest?.createdAt || null, tables: manifest?.tables?.length || null, complete: !!manifest?.complete });
    }
    backups.sort((a, b) => b.name.localeCompare(a.name));
    return { dir: BACKUP_DIR, safe: backupDirIsSafe(), backups };
}
async function runBackup(log) {
    if (!backupDirIsSafe()) throw new Error(`BACKUP_DIR (${BACKUP_DIR}) is inside the repository — choose a folder outside it.`);
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const dir = path.join(BACKUP_DIR, `ppms_${stamp}`);
    await fsp.mkdir(dir, { recursive: true });
    log(`Backing up ${PPMS_TABLES.length} PPMS tables to ${dir}`);
    const manifest = { createdAt: new Date().toISOString(), project: PROJECT_REF, complete: false, tables: [] };
    for (const t of PPMS_TABLES) {
        let rows;
        try { rows = await fetchAll(`${t}?select=*&order=id`); }
        catch {
            try { rows = await fetchAll(`${t}?select=*`); }
            catch (e) { log(`  ${t}: SKIPPED (${e.message})`); manifest.tables.push({ table: t, error: e.message }); continue; }
        }
        await fsp.writeFile(path.join(dir, `${t}.json`), JSON.stringify(rows));
        manifest.tables.push({ table: t, rows: rows.length });
        log(`  ${t}: ${rows.length} rows`);
    }
    manifest.complete = manifest.tables.every(t => !t.error);
    await fsp.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
    log(manifest.complete ? 'Backup complete.' : 'Backup finished with skipped tables (see above).');
}

/* ── Saved SQL checks (Supabase Management API) ──────────────── */
function listChecks() {
    const files = [{ id: 'security_inventory', file: path.join(ROOT, 'database/schema/security_inventory.sql') }];
    const dir = path.join(HERE, 'checks');
    if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
            files.push({ id: f.replace(/\.sql$/, ''), file: path.join(dir, f) });
        }
    }
    return files.filter(c => fs.existsSync(c.file)).map(c => {
        const sql = fs.readFileSync(c.file, 'utf8');
        const title = (sql.match(/^--\s*(.+)$/m) || [])[1] || c.id;
        return { ...c, title, rel: path.relative(ROOT, c.file).split(path.sep).join('/') };
    });
}
async function runCheck(id) {
    if (!ACCESS_TOKEN) throw httpError(400, 'Add SUPABASE_ACCESS_TOKEN (a personal access token) to tools/control-panel/.env to run SQL checks.');
    const check = listChecks().find(c => c.id === id);
    if (!check) throw httpError(404, 'Unknown check');
    const t0 = performance.now();
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: fs.readFileSync(check.file, 'utf8') }),
        signal: AbortSignal.timeout(60000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw httpError(res.status, data?.message || `Supabase returned ${res.status}`);
    return { id, title: check.title, ms: Math.round(performance.now() - t0), rows: Array.isArray(data) ? data : [] };
}

/* ── HTTP ─────────────────────────────────────────────────────── */
const TOKEN = crypto.randomBytes(24).toString('hex');
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
function send(res, status, body, type = 'application/json; charset=utf-8') {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
    res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
async function readJson(req) {
    let size = 0;
    const chunks = [];
    for await (const c of req) { size += c.length; if (size > 1 << 20) throw httpError(413, 'Body too large'); chunks.push(c); }
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw httpError(400, 'Bad JSON'); }
}
function tokenOk(req) {
    const given = Buffer.from(String(req.headers['x-panel-token'] || ''));
    const want = Buffer.from(TOKEN);
    return given.length === want.length && crypto.timingSafeEqual(given, want);
}

const routes = {
    'GET /api/config': async () => ({
        supabase: SUPABASE_URL, project: PROJECT_REF, serviceKey: !!SERVICE_KEY, accessToken: !!ACCESS_TOKEN,
        liveUrl: LIVE_URL, v2Url: V2_URL, backupDir: BACKUP_DIR, root: ROOT, bash: !!findBash(),
    }),
    'GET /api/site': siteStatus,
    'GET /api/git': gitStatus,
    'GET /api/db': dbStatus,
    'GET /api/activity': activity,
    'GET /api/kpis': kpis,
    'GET /api/users': listUsers,
    'GET /api/notice': getNotice,
    'PUT /api/notice': (req, body) => setNotice(body),
    'GET /api/backups': listBackups,
    'POST /api/backup': () => runTask('Database backup', runBackup),
    'GET /api/checks': async () => listChecks().map(({ id, title, rel }) => ({ id, title, rel })),
    'POST /api/checks/run': (req, body) => runCheck(String(body.id || '')),
    'POST /api/git/fetch': () => runCommand('Fetch origin + production', 'git', ['fetch', '--all', '--prune']),
    'POST /api/git/push': () => runCommand('Push to origin', 'git', ['push', 'origin', 'HEAD']),
    'POST /api/deploy': (req, body) => {
        const bash = findBash();
        if (!bash) throw httpError(500, 'Git Bash not found — install Git for Windows.');
        const args = ['tools/deploy.sh'];
        if (body.target === 'v2') args.push('--v2');
        else if (body.target !== 'app') throw httpError(400, 'target must be app or v2');
        const msg = String(body.message || '').trim();
        if (msg) args.push(msg);
        return runCommand(body.target === 'v2' ? 'Deploy app-v2 → v2 (Vercel)' : 'Deploy app → live site', bash, args);
    },
    'GET /api/jobs': async () => [...jobs.values()].slice(-10).reverse().map(({ output, ...j }) => j),
};

const server = http.createServer(async (req, res) => {
    try {
        if (!ALLOWED_HOSTS.has(req.headers.host)) return send(res, 403, 'Forbidden host', 'text/plain');
        const url = new URL(req.url, `http://${req.headers.host}`);
        if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
            const html = (await fsp.readFile(path.join(HERE, 'index.html'), 'utf8')).replace('__PANEL_TOKEN__', TOKEN);
            return send(res, 200, html, 'text/html; charset=utf-8');
        }
        if (!url.pathname.startsWith('/api/')) return send(res, 404, 'Not found', 'text/plain');
        if (!tokenOk(req)) return send(res, 401, { error: 'Reload the panel (the server restarted).' });
        const origin = req.headers.origin;
        if (origin && !ALLOWED_HOSTS.has(origin.replace(/^https?:\/\//, ''))) return send(res, 403, { error: 'Bad origin' });

        const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readJson(req) : {};
        let m;
        if (req.method === 'GET' && (m = url.pathname.match(/^\/api\/jobs\/([\w-]+)$/))) {
            const job = jobs.get(m[1]);
            return job ? send(res, 200, job) : send(res, 404, { error: 'No such job' });
        }
        if (req.method === 'PATCH' && (m = url.pathname.match(/^\/api\/users\/([\w-]+)$/))) {
            return send(res, 200, await updateUser(m[1], body));
        }
        const handler = routes[`${req.method} ${url.pathname}`];
        if (!handler) return send(res, 404, { error: 'Unknown endpoint' });
        send(res, 200, await handler(req, body));
    } catch (e) {
        send(res, e.status && e.status < 600 ? e.status : 500, { error: e.message });
    }
});

const link = `http://127.0.0.1:${PORT}/`;
function openBrowser() {
    if (process.argv.includes('--no-open')) return;
    const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', link]] : process.platform === 'darwin' ? ['open', [link]] : ['xdg-open', [link]];
    spawn(opener[0], opener[1], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}
server.on('error', e => {
    if (e.code !== 'EADDRINUSE') throw e;
    console.log(`Port ${PORT} is already in use — the panel is probably already running. Opening ${link}`);
    console.log('If that page does not load, close the other window or set PORT in .env.');
    openBrowser();
});
server.listen(PORT, '127.0.0.1', () => {
    console.log(`PPMS Control Panel running at ${link}  (Ctrl+C to stop)`);
    if (!SERVICE_KEY) console.log('Note: no SUPABASE_SERVICE_KEY in tools/control-panel/.env — database panels are off.');
    openBrowser();
});
