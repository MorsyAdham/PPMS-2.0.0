"""Build the PPMS User Manual as a Word document.

Source of truth: app/scripts/features/help/manual-content.js (the same
content the in-app Help page and the assistant use).
Screenshots:     app/assets/help/<section id>.jpg (optional per section).
Output:          app/assets/help/PPMS_User_Manual.docx  (served by the app's
                 Help page "Word" button) and a copy in docs/manual/.

Usage:  python tools/build_manual_docx.py
Needs:  node (to read the JS module) and python-docx.
"""
import datetime
import json
import shutil
import subprocess
from pathlib import Path

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / 'app'
CONTENT = APP / 'scripts' / 'features' / 'help' / 'manual-content.js'
IMAGES = APP / 'assets' / 'help'
OUT_APP = IMAGES / 'PPMS_User_Manual.docx'
OUT_DOCS = ROOT / 'docs' / 'manual' / 'PPMS_User_Manual.docx'

ACCENT = RGBColor(0x1E, 0x3A, 0x8A)
MUTED = RGBColor(0x64, 0x74, 0x8B)
TEXT = RGBColor(0x0F, 0x17, 0x2A)
MODULE_LABELS = {'all': 'All modules', 'kd1': 'KD1', 'kd2': 'F200-KD2', 'f100kd2': 'F100-KD2'}


def load_content():
    script = (
        "import(process.argv[1]).then(m => process.stdout.write(JSON.stringify("
        "{groups: m.MANUAL_GROUPS, sections: m.MANUAL_SECTIONS, roles: m.ROLE_LABELS})))"
    )
    out = subprocess.run(['node', '-e', script, CONTENT.as_uri()], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def shade(cell, hex_fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_fill)
    tc_pr.append(shd)


def add_toc(doc):
    """A real Word table of contents field (Word fills it on open / F9)."""
    p = doc.add_paragraph()
    run = p.add_run()
    fld_begin = OxmlElement('w:fldChar'); fld_begin.set(qn('w:fldCharType'), 'begin')
    instr = OxmlElement('w:instrText'); instr.set(qn('xml:space'), 'preserve'); instr.text = 'TOC \\o "1-2" \\h \\z \\u'
    fld_sep = OxmlElement('w:fldChar'); fld_sep.set(qn('w:fldCharType'), 'separate')
    placeholder = OxmlElement('w:t'); placeholder.text = 'Right-click here and choose "Update Field" to build the table of contents.'
    fld_end = OxmlElement('w:fldChar'); fld_end.set(qn('w:fldCharType'), 'end')
    for el in (fld_begin, instr, fld_sep, placeholder, fld_end):
        run._r.append(el)


def update_fields_on_open(doc):
    settings = doc.settings.element
    el = OxmlElement('w:updateFields')
    el.set(qn('w:val'), 'true')
    settings.append(el)


def set_base_styles(doc):
    normal = doc.styles['Normal']
    normal.font.name = 'Calibri'
    normal.font.size = Pt(11)
    normal.font.color.rgb = TEXT
    for name, size in (('Heading 1', 20), ('Heading 2', 14)):
        st = doc.styles[name]
        st.font.name = 'Calibri'
        st.font.size = Pt(size)
        st.font.bold = True
        st.font.color.rgb = ACCENT


def add_footer(section):
    p = section.footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run('PPMS User Manual  ·  Page ')
    r.font.size = Pt(8); r.font.color.rgb = MUTED
    run = p.add_run()
    for kind, text in (('begin', None), (None, 'PAGE'), ('end', None)):
        if kind:
            f = OxmlElement('w:fldChar'); f.set(qn('w:fldCharType'), kind); run._r.append(f)
        else:
            t = OxmlElement('w:instrText'); t.set(qn('xml:space'), 'preserve'); t.text = text; run._r.append(t)
    run.font.size = Pt(8)


def build():
    data = load_content()
    groups, sections, roles = data['groups'], data['sections'], data['roles']

    doc = Document()
    set_base_styles(doc)
    sec = doc.sections[0]
    sec.orientation = WD_ORIENT.PORTRAIT
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    for side in ('left_margin', 'right_margin'):
        setattr(sec, side, Cm(2))
    sec.top_margin = sec.bottom_margin = Cm(2)
    add_footer(sec)

    # ── Cover ──
    for _ in range(6):
        doc.add_paragraph()
    t = doc.add_paragraph(); t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = t.add_run('PPMS'); r.bold = True; r.font.size = Pt(40); r.font.color.rgb = ACCENT
    t = doc.add_paragraph(); t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = t.add_run('Production Planning & Monitoring System'); r.font.size = Pt(18); r.font.color.rgb = TEXT
    t = doc.add_paragraph(); t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = t.add_run('User Manual'); r.bold = True; r.font.size = Pt(26); r.font.color.rgb = TEXT
    for _ in range(3):
        doc.add_paragraph()
    t = doc.add_paragraph(); t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = t.add_run(f'Modules: KD1 · F200-KD2 · F100-KD2\nEdition: {datetime.date.today():%d %B %Y}')
    r.font.size = Pt(11); r.font.color.rgb = MUTED
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

    # ── Contents ──
    doc.add_heading('Contents', level=1)
    add_toc(doc)
    doc.add_paragraph()
    note = doc.add_paragraph()
    r = note.add_run('Screens in this manual are shown in the Light theme. The same manual is available inside PPMS '
                     'from the menu (☰) → Help & User Manual, where it can be searched and filtered by your role.')
    r.italic = True; r.font.size = Pt(9); r.font.color.rgb = MUTED

    # ── Chapters ──
    for gi, group in enumerate(groups, 1):
        items = [s for s in sections if s['group'] == group]
        if not items:
            continue
        doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
        doc.add_heading(f'{gi:02d}  {group}', level=1)

        for s in items:
            doc.add_heading(s['title'], level=2)

            meta = doc.add_table(rows=1, cols=2)
            meta.alignment = WD_TABLE_ALIGNMENT.LEFT
            for cell, (label, value) in zip(meta.rows[0].cells, (
                    ('Who can use it', roles.get(s['roles'], s['roles'])),
                    ('Applies to', MODULE_LABELS.get(s['modules'], s['modules'])))):
                shade(cell, 'EFF6FF')
                p = cell.paragraphs[0]
                a = p.add_run(f'{label}: '); a.bold = True; a.font.size = Pt(9); a.font.color.rgb = ACCENT
                b = p.add_run(value); b.font.size = Pt(9)

            doc.add_paragraph(s['summary'])

            img = IMAGES / f"{s['id']}.jpg"
            if img.exists():
                pic = doc.add_paragraph(); pic.alignment = WD_ALIGN_PARAGRAPH.CENTER
                # Natural size (~110 px per inch), capped at the text width, so
                # small panels aren't blown up and blurred
                from PIL import Image as _Img
                with _Img.open(img) as im_:
                    w_cm = min(16.5, im_.width / 110 * 2.54)
                pic.add_run().add_picture(str(img), width=Cm(w_cm))
                cap = doc.add_paragraph(); cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
                c = cap.add_run(f"Figure: {s['title']}"); c.italic = True; c.font.size = Pt(8); c.font.color.rgb = MUTED

            if s.get('steps'):
                h = doc.add_paragraph(); hr = h.add_run('How to'); hr.bold = True; hr.font.color.rgb = ACCENT
                # Numbered by hand: Word's "List Number" style keeps counting
                # across topics instead of restarting at 1.
                for i, step in enumerate(s['steps'], 1):
                    p = doc.add_paragraph()
                    p.paragraph_format.left_indent = Cm(0.9)
                    p.paragraph_format.first_line_indent = Cm(-0.6)
                    p.paragraph_format.space_after = Pt(3)
                    n = p.add_run(f'{i}.  '); n.bold = True; n.font.color.rgb = ACCENT
                    p.add_run(step)
                doc.add_paragraph()

            if s.get('tips'):
                tip = doc.add_table(rows=1, cols=1)
                cell = tip.rows[0].cells[0]
                shade(cell, 'FEF3C7')
                p = cell.paragraphs[0]
                r = p.add_run('Tips'); r.bold = True; r.font.size = Pt(10)
                for t_ in s['tips']:
                    q = cell.add_paragraph(f'•  {t_}')
                    q.runs[0].font.size = Pt(10)
                doc.add_paragraph()

    update_fields_on_open(doc)
    OUT_APP.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT_APP)
    OUT_DOCS.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(OUT_APP, OUT_DOCS)
    with_img = sum(1 for s in sections if (IMAGES / f"{s['id']}.jpg").exists())
    print(f'Saved {OUT_APP.relative_to(ROOT)} and {OUT_DOCS.relative_to(ROOT)} '
          f'({len(sections)} topics, {with_img} with screenshots)')


if __name__ == '__main__':
    build()
