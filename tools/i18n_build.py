"""(Re)build app/scripts/i18n/strings.js from the extracted texts.

Keeps every existing translation in strings.js, adds new texts with their
area, fills Korean / Arabic from a draft file when given, and drops texts
no longer used in the code (listed so nothing disappears silently).

usage:
  python tools/i18n_extract.py > extracted.json
  python tools/i18n_build.py extracted.json [tools/i18n_stage1_draft.py]
"""
import io, json, os, runpy, sys

HERE = os.path.dirname(__file__)
STRINGS = os.path.join(HERE, '..', 'app', 'scripts', 'i18n', 'strings.js')
AREA_ORDER = ['Header & menus', 'Filter bar', 'Executive Summary', 'Gantt', 'Gantt / shared', 'Sign-in page', 'Other']

HEADER = """// PPMS interface translations — English text -> { area, ko, ar }.
// Generated / updated by tools/i18n_build.py and tools/i18n_import.py.
// Edit through the Excel review sheet (tools/i18n_export.py), not by hand.
// Placeholders such as {n} must be kept exactly as they are.
"""

def load_strings():
    if not os.path.exists(STRINGS):
        return {}
    src = io.open(STRINGS, encoding='utf-8').read()
    body = src[src.index('export default') + len('export default'):].strip().rstrip(';').strip()
    return json.loads(body) if body.strip('{} \n') else {}

def save_strings(data):
    ordered = dict(sorted(data.items(), key=lambda kv: (AREA_ORDER.index(kv[1].get('area', 'Other')) if kv[1].get('area', 'Other') in AREA_ORDER else 99, kv[0].lower())))
    io.open(STRINGS, 'w', encoding='utf-8', newline='\n').write(HEADER + 'export default ' + json.dumps(ordered, ensure_ascii=False, indent=1) + ';\n')

def main():
    extracted = json.load(io.open(sys.argv[1], encoding='utf-8'))
    draft = runpy.run_path(sys.argv[2])['TR'] if len(sys.argv) > 2 else {}
    data = load_strings()
    out = {}
    for text, area in extracted.items():
        e = dict(data.get(text, {}))
        e['area'] = area
        ko, ar = draft.get(text, (None, None))
        if not e.get('ko') and ko: e['ko'] = ko
        if not e.get('ar') and ar: e['ar'] = ar
        out[text] = e
    dropped = [k for k in data if k not in out]
    save_strings(out)
    missing = [k for k, v in out.items() if not v.get('ko') or not v.get('ar')]
    print(f'{len(out)} texts · {len(missing)} without Korean/Arabic · {len(dropped)} no longer used')
    for k in missing: print('  missing:', k)
    for k in dropped: print('  dropped:', k)

main()
