"""List every interface text marked for translation in app/scripts.

Finds _t("…") / _t('…') calls with a literal first argument, plus texts
that reach _t() through a variable (listed in DYNAMIC below — keep it in
step when such a list changes). Prints JSON: { "English text": "area", … }.

usage: python tools/i18n_extract.py > extracted.json
"""
import json, os, re, sys

ROOT = os.path.join(os.path.dirname(__file__), '..', 'app', 'scripts')
AREA_BY_FILE = {
    'shell/page-chrome.js': 'Header & menus',
    'filters/': 'Filter bar',
    'summary/': 'Executive Summary',
    'gantt-module.js': 'Gantt',
    'gantt/index.js': 'Gantt',
    'app.js': 'Gantt / shared',
    'kd2.js': 'Gantt / shared',
    'login-layout.js': 'Sign-in page',
    'login-page.js': 'Sign-in page',
    'index-page.js': 'Header & menus',
    'core/i18n.js': 'Header & menus',
}
# Texts passed to _t() through variables / maps
DYNAMIC = {
    'Gantt': [
        'Moves only the block you drag (or every selected block, if several are selected).',
        'Moves the process you drag and every process after it on this vehicle — the rest of its line (e.g. Hull), then Assembly. The parallel line (Turret) stays.',
        'Moves every block of this vehicle that starts on or after the one you drag — all lines (Hull, Turret and Assembly) together.',
        'Moves the process you drag and the later processes of the same component only (Hull, Turret or Assembly). No other component moves.',
        "Moves every block of the component you drag (its whole Hull, Turret or Assembly sequence) on this vehicle. No other component moves.",
        'Moves every process of the vehicle you drag.',
        'Moves the process you drag and every process after it (rest of its line, then Assembly) — on this vehicle and on every later vehicle of the same battalion and type.',
        'Moves every process of this vehicle and of every later vehicle of the same battalion and type.',
        'Moves this block and every block queued after it at the same station, across all vehicles.',
        'Moves every block in the plan.',
        'Completed', 'Completed early', 'Completed late', 'In progress', 'Overdue', 'Planned',
        'Planned', 'Actual start', 'Completed', 'Overdue by', 'Finished late by', 'Finished', 'Expected finish',
        'Line', 'Work center', 'Manufacturer', 'Remark', 'Comments',
        'Production Master Schedule', 'Assembly Plan · Daily Gantt View',
        'Apply filters to load data, then click Refresh to render the schedule.',
    ],
    'Filter bar': ['Battalion / Unit', 'Battalion / Part', 'Vehicle', 'K9 Component', 'Battalion', 'Unit', 'Category', 'Week', 'Gun Part', 'Manufacturer',
                   'Custom dates', 'Status', 'Priority', 'Reporter'],
    'Executive Summary': ['Total planned', 'tasks in scope', 'Completed on time', 'In progress', 'Late completion',
                          'Overdue', 'past planned end', 'On time', 'Late', 'Not started'],
    'Header & menus': ['Connected', 'Connection Error'],
    'Loading screen': ['Loading', 'MODULE', 'SEC-CLR // AUTHORIZED', 'LINK STATUS:', 'HANDSHAKE', 'SECURE', 'FAILED',
                       'SYSTEMS ONLINE', 'Production Planning & Monitoring System', 'Connecting…',
                       'WELCOME', 'WELCOME, {name}', 'All systems ready', 'Connecting to database…', 'Connection failed',
                       'Preparing workspace…', 'Loading filters…', 'Loading plan data…', 'Rendering workspace…', 'Loading issues…'],
    'Gantt / shared': ['Delete {n} block', 'Delete {n} blocks', 'Shifting 1 vehicle ({b} blocks)…',
                       'Shifting {n} vehicles ({b} blocks)…', 'Saving {n} block…', 'Saving {n} blocks…',
                       '{n} block rescheduled ✓', '{n} blocks rescheduled ✓',
                       'Part / Process', 'Battalion / Vehicle / Unit', 'Vehicle / Station', 'Vehicle / Unit',
                       'Hull', 'Turret', 'Structure', 'Assembly', 'Assembly & Processing & Testing', 'Other'],
}
# Matches in comments / examples, not real interface text
SKIP = {'English text'}

def area_for(path):
    rel = path.replace('\\', '/')
    for k, v in AREA_BY_FILE.items():
        if k in rel:
            return v
    return 'Other'

CALL = re.compile(r"""_t\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')""")

def main():
    found = {}
    for dirpath, _, files in os.walk(ROOT):
        for f in files:
            if not f.endswith('.js') or f == 'strings.js':
                continue
            p = os.path.join(dirpath, f)
            src = open(p, encoding='utf-8').read()
            for m in CALL.finditer(src):
                text = (m.group(1) if m.group(1) is not None else m.group(2))
                text = text.encode('utf-8').decode('unicode_escape').encode('latin-1').decode('utf-8') if '\\' in text else text
                found.setdefault(text, area_for(p))
    for area, texts in DYNAMIC.items():
        for t in texts:
            found.setdefault(t, area)
    found.pop('', None)
    for k in SKIP:
        found.pop(k, None)
    json.dump(found, sys.stdout, ensure_ascii=False, indent=1)

main()
