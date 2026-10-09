"""Build the PPMS User Manual as a Word document.

Source of truth: app/scripts/features/help/manual-content.js (the same
content the in-app Help page and the assistant use).
Screenshots:     app/assets/help/<section id>.jpg (optional per section).
Output:          app/assets/help/PPMS_User_Manual.docx (all roles) plus one
                 edition per role (PPMS_User_Manual_<Role>.docx), served by
                 the Help page's "Word" button for the chosen role, and
                 copies in docs/manual/.

Layout: cover · about this manual · quick reference (roles, statuses,
shortcuts) · contents · one chapter per group (banner + introduction,
then topics with step badges, Tips / Recommended / Caution boxes and
figure captions) · glossary.

Usage:  python tools/build_manual_docx.py
Needs:  node (to read the JS module), python-docx and Pillow.
"""
import datetime
import json
import shutil
import subprocess
from pathlib import Path

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / 'app'
CONTENT = APP / 'scripts' / 'features' / 'help' / 'manual-content.js'
IMAGES = APP / 'assets' / 'help'

# One edition per role, filtered like the Help page's "Topics for" choice:
# a topic is in a role's edition when that role can use it (rank >= the
# topic's minimum). File names match features/help/index.js.
ROLE_RANK = {'viewer': 0, 'operator': 1, 'planner': 2, 'master_admin': 3}
SECTION_MIN_RANK = {'all': 0, 'operator': 1, 'planner': 2, 'master_admin': 3}
EDITIONS = {
    None: ('PPMS_User_Manual.docx', 'Viewers, Operators, Planners and Master Admins'),
    'viewer': ('PPMS_User_Manual_Viewer.docx', 'Viewer — topics a Viewer can use'),
    'operator': ('PPMS_User_Manual_Operator.docx', 'Operator — topics an Operator can use'),
    'planner': ('PPMS_User_Manual_Planner.docx', 'Planner — topics a Planner can use'),
    'master_admin': ('PPMS_User_Manual_Master_Admin.docx', 'Master Admin — every topic'),
}

NAVY = '1E3A8A'
ACCENT = RGBColor(0x1E, 0x3A, 0x8A)
ACCENT_2 = RGBColor(0x25, 0x63, 0xEB)
MUTED = RGBColor(0x64, 0x74, 0x8B)
TEXT = RGBColor(0x0F, 0x17, 0x2A)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
MODULE_LABELS = {'all': 'All modules', 'kd1': 'KD1', 'kd2': 'F200-KD2', 'f100kd2': 'F100-KD2'}

CALLOUTS = {
    'tips':        ('Tips',        'FEF3C7', 'D97706'),
    'recommended': ('Recommended', 'DCFCE7', '16A34A'),
    'cautions':    ('Caution',     'FEE2E2', 'DC2626'),
}

# Quick reference — what each role can do (✓ = yes)
ROLE_MATRIX = [
    ('View every screen, filter and the charts',            (1, 1, 1, 1)),
    ('Export reports (with the "Can export" permission)',   (1, 1, 1, 1)),
    ('Record actual start and completion dates',            (0, 1, 1, 1)),
    ('Comments, delay reasons and X-ray results',           (0, 1, 1, 1)),
    ('Report and update production issues',                 (0, 1, 1, 1)),
    ('Unit Codes and plan versions',                        (0, 1, 1, 1)),
    ('Edit the Gantt: move, resize, add, delete blocks',    (0, 0, 1, 1)),
    ('Reorder route, hide or delete processes',             (0, 0, 1, 1)),
    ('Manage Processes, lead times, no-work days',          (0, 0, 1, 1)),
    ('User Management, Audit Log, Active Users',            (0, 0, 0, 1)),
]
STATUSES = [
    ('Completed',        'DCFCE7', 'Finished on or before the planned end date.'),
    ('Late Completion',  'FFEDD5', 'Finished, but after the planned end date.'),
    ('In Progress',      'FEF3C7', 'Started (actual start recorded) and not finished yet.'),
    ('Overdue',          'FEE2E2', 'Not started and already past the planned end date.'),
    ('Planned',          'DBEAFE', 'Not started yet and not yet due.'),
]
SHORTCUTS = [
    ('Esc', 'Close a dialog, menu, the manual or the guided tour'),
    ('Ctrl + Enter', 'Save the issue you are writing'),
    ('← / →', 'Previous / next issue in the issue details · Back / next in the guided tour'),
    ('F5', 'Reload the page'),
    ('Ctrl + Shift + R', 'Hard reload — use if the page looks out of date'),
]


def load_content():
    script = (
        "import(process.argv[1]).then(m => process.stdout.write(JSON.stringify("
        "{groups: m.MANUAL_GROUPS, sections: m.MANUAL_SECTIONS, roles: m.ROLE_LABELS,"
        " intros: m.GROUP_INTROS || {}, glossary: m.GLOSSARY || []})))"
    )
    out = subprocess.run(['node', '-e', script, CONTENT.as_uri()], capture_output=True, text=True, check=True, encoding='utf-8')
    return json.loads(out.stdout)


# ── low-level helpers ────────────────────────────────────────────
def shade(cell, hex_fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_fill)
    tc_pr.append(shd)


def cell_borders(cell, **edges):
    """edges: top/left/bottom/right = (size_eighths, hex) or None for no border."""
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = OxmlElement('w:tcBorders')
    for edge in ('top', 'left', 'bottom', 'right'):
        el = OxmlElement(f'w:{edge}')
        spec = edges.get(edge)
        if spec:
            el.set(qn('w:val'), 'single')
            el.set(qn('w:sz'), str(spec[0]))
            el.set(qn('w:color'), spec[1])
        else:
            el.set(qn('w:val'), 'nil')
        borders.append(el)
    tc_pr.append(borders)


def cell_margins(cell, top=80, bottom=80, left=140, right=140):
    tc_pr = cell._tc.get_or_add_tcPr()
    mar = OxmlElement('w:tcMar')
    for k, v in (('top', top), ('bottom', bottom), ('start', left), ('end', right)):
        el = OxmlElement(f'w:{k}')
        el.set(qn('w:w'), str(v))
        el.set(qn('w:type'), 'dxa')
        mar.append(el)
    tc_pr.append(mar)


def no_table_borders(table):
    tbl_pr = table._tbl.tblPr
    borders = OxmlElement('w:tblBorders')
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        el = OxmlElement(f'w:{edge}')
        el.set(qn('w:val'), 'nil')
        borders.append(el)
    tbl_pr.append(borders)


def keep_with_next(paragraph):
    paragraph.paragraph_format.keep_with_next = True


def para(container, text='', size=None, bold=False, italic=False, color=None, align=None, space_after=None, space_before=None):
    p = container.add_paragraph()
    if text:
        r = p.add_run(text)
        r.bold = bold
        r.italic = italic
        if size:
            r.font.size = Pt(size)
        if color is not None:
            r.font.color.rgb = color
    if align is not None:
        p.alignment = align
    if space_after is not None:
        p.paragraph_format.space_after = Pt(space_after)
    if space_before is not None:
        p.paragraph_format.space_before = Pt(space_before)
    return p


def field(run, code):
    for kind, text in (('begin', None), (None, code), ('separate', None), (None, '1'), ('end', None)):
        if kind:
            f = OxmlElement('w:fldChar')
            f.set(qn('w:fldCharType'), kind)
            run._r.append(f)
        elif text == code:
            t = OxmlElement('w:instrText')
            t.set(qn('xml:space'), 'preserve')
            t.text = f' {code} '
            run._r.append(t)
        else:
            t = OxmlElement('w:t')
            t.text = text
            run._r.append(t)


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
    el = OxmlElement('w:updateFields')
    el.set(qn('w:val'), 'true')
    doc.settings.element.append(el)


def set_base_styles(doc):
    normal = doc.styles['Normal']
    normal.font.name = 'Calibri'
    normal.element.rPr.rFonts.set(qn('w:eastAsia'), 'Calibri')
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = TEXT
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.12
    for name, size, color, before, after in (('Heading 1', 22, ACCENT, 0, 6), ('Heading 2', 14, ACCENT, 16, 4), ('Heading 3', 11, ACCENT_2, 10, 3)):
        st = doc.styles[name]
        st.font.name = 'Calibri'
        st.font.size = Pt(size)
        st.font.bold = True
        st.font.color.rgb = color
        st.paragraph_format.space_before = Pt(before)
        st.paragraph_format.space_after = Pt(after)
        st.paragraph_format.keep_with_next = True


AUTHOR = 'Adham Morsy'  # footer credit, as on the hand-edited 07 Oct 2026 manual


def header_footer(section, edition):
    section.different_first_page_header_footer = True  # clean cover
    hp = section.header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r = hp.add_run('PPMS User Manual')
    r.font.size = Pt(8); r.font.color.rgb = MUTED

    fp = section.footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    a = fp.add_run(f'Production Planning & Monitoring System  ·  {AUTHOR}  ·  Page ')  # edition date is on the cover
    a.font.size = Pt(8); a.font.color.rgb = MUTED
    b = fp.add_run(); b.font.size = Pt(8); b.font.color.rgb = MUTED; field(b, 'PAGE')
    c = fp.add_run(' of '); c.font.size = Pt(8); c.font.color.rgb = MUTED
    d = fp.add_run(); d.font.size = Pt(8); d.font.color.rgb = MUTED; field(d, 'NUMPAGES')


# ── building blocks ──────────────────────────────────────────────
def banner(doc, kicker, title, fill=NAVY, height_cm=None):
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    no_table_borders(t)
    c = t.rows[0].cells[0]
    shade(c, fill)
    cell_margins(c, 260, 260, 320, 320)
    p = c.paragraphs[0]
    r = p.add_run(kicker); r.font.size = Pt(10); r.bold = True; r.font.color.rgb = RGBColor(0xBF, 0xDB, 0xFE)
    p2 = c.add_paragraph()
    r2 = p2.add_run(title); r2.font.size = Pt(22); r2.bold = True; r2.font.color.rgb = WHITE
    p2.paragraph_format.space_after = Pt(0)
    if height_cm:
        t.rows[0].height = Cm(height_cm)
    return t


def callout(doc, kind, items):
    label, fill, border = CALLOUTS[kind]
    t = doc.add_table(rows=1, cols=1)
    no_table_borders(t)
    c = t.rows[0].cells[0]
    shade(c, fill)
    cell_borders(c, left=(36, border))
    cell_margins(c, 90, 90, 200, 160)
    p = c.paragraphs[0]
    r = p.add_run(label)
    r.bold = True; r.font.size = Pt(9.5); r.font.color.rgb = RGBColor.from_string(border)
    p.paragraph_format.space_after = Pt(2)
    for it in items:
        q = c.add_paragraph()
        q.paragraph_format.left_indent = Cm(0.35)
        q.paragraph_format.first_line_indent = Cm(-0.35)
        q.paragraph_format.space_after = Pt(1)
        rr = q.add_run('•  ' + it); rr.font.size = Pt(9.5)
    para(doc, space_after=2)


def steps_block(doc, steps):
    h = para(doc, 'STEP BY STEP', size=8.5, bold=True, color=MUTED, space_before=4, space_after=3)
    keep_with_next(h)
    t = doc.add_table(rows=len(steps), cols=2)
    no_table_borders(t)
    t.autofit = False
    for i, step in enumerate(steps):
        num, txt = t.rows[i].cells
        num.width = Cm(0.8); txt.width = Cm(15.6)
        num.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
        cell_margins(num, 30, 30, 40, 40)
        cell_margins(txt, 40, 60, 120, 40)
        np_ = num.paragraphs[0]
        np_.alignment = WD_ALIGN_PARAGRAPH.CENTER
        nr = np_.add_run(str(i + 1)); nr.bold = True; nr.font.size = Pt(9); nr.font.color.rgb = WHITE
        shade(num, '2563EB')
        tp = txt.paragraphs[0]
        tp.paragraph_format.space_after = Pt(0)
        tp.add_run(step).font.size = Pt(10)
    para(doc, space_after=2)


def meta_row(doc, s, roles):
    t = doc.add_table(rows=1, cols=2)
    no_table_borders(t)
    for cell, (label, value) in zip(t.rows[0].cells, (
            ('Who can use it', roles.get(s['roles'], s['roles'])),
            ('Applies to', MODULE_LABELS.get(s['modules'], s['modules'])))):
        shade(cell, 'EFF6FF')
        cell_margins(cell, 50, 50, 120, 120)
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        a = p.add_run(f'{label}: '); a.bold = True; a.font.size = Pt(8.5); a.font.color.rgb = ACCENT
        b = p.add_run(value); b.font.size = Pt(8.5)
    para(doc, space_after=1)


def simple_table(doc, header, rows, widths, header_fill=NAVY, zebra='F8FAFC', first_col_fills=None):
    t = doc.add_table(rows=1 + len(rows), cols=len(header))
    t.style = 'Table Grid'
    t.autofit = False
    for i, h in enumerate(header):
        c = t.rows[0].cells[i]
        c.width = widths[i]
        shade(c, header_fill)
        cell_margins(c, 70, 70, 110, 110)
        p = c.paragraphs[0]; p.paragraph_format.space_after = Pt(0)
        r = p.add_run(h); r.bold = True; r.font.size = Pt(9); r.font.color.rgb = WHITE
    for ri, row in enumerate(rows, start=1):
        for ci, val in enumerate(row):
            c = t.rows[ri].cells[ci]
            c.width = widths[ci]
            cell_margins(c, 60, 60, 110, 110)
            if first_col_fills and ci == 0 and first_col_fills[ri - 1]:
                shade(c, first_col_fills[ri - 1])
            elif ri % 2 == 0:
                shade(c, zebra)
            p = c.paragraphs[0]; p.paragraph_format.space_after = Pt(0)
            if val in ('✓', '—'):
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            r = p.add_run(val); r.font.size = Pt(9)
            if val == '✓':
                r.bold = True; r.font.color.rgb = RGBColor(0x16, 0xA3, 0x4A)
            elif val == '—':
                r.font.color.rgb = MUTED
    return t


def page_break(doc):
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


# ── document ─────────────────────────────────────────────────────
def build(role=None, data=None):
    data = data or load_content()
    groups, sections, roles = data['groups'], data['sections'], data['roles']
    if role:
        sections = [s for s in sections if ROLE_RANK[role] >= SECTION_MIN_RANK.get(s['roles'], 0)]
    file_name, covers = EDITIONS[role]
    out_app = IMAGES / file_name
    out_docs = ROOT / 'docs' / 'manual' / file_name
    intros, glossary = data['intros'], data['glossary']
    by_id = {s['id']: s for s in sections}
    edition = f'{datetime.date.today():%d %B %Y}'

    doc = Document()
    set_base_styles(doc)
    sec = doc.sections[0]
    sec.orientation = WD_ORIENT.PORTRAIT
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    sec.left_margin = sec.right_margin = Cm(2)
    sec.top_margin = Cm(1.8); sec.bottom_margin = Cm(1.8)
    header_footer(sec, edition)

    # ── Cover ──
    for _ in range(3):
        para(doc)
    cover = doc.add_table(rows=1, cols=1)
    no_table_borders(cover)
    c = cover.rows[0].cells[0]
    shade(c, NAVY)
    cell_margins(c, 700, 700, 500, 500)
    p = c.paragraphs[0]
    r = p.add_run('PPMS'); r.bold = True; r.font.size = Pt(54); r.font.color.rgb = WHITE
    p = c.add_paragraph(); r = p.add_run('Production Planning & Monitoring System'); r.font.size = Pt(17); r.font.color.rgb = RGBColor(0xBF, 0xDB, 0xFE)
    p = c.add_paragraph(); p.paragraph_format.space_before = Pt(26)
    r = p.add_run('User Manual'); r.bold = True; r.font.size = Pt(32); r.font.color.rgb = WHITE
    p = c.add_paragraph(); r = p.add_run('Step-by-step guides, tips and recommendations for every screen'); r.font.size = Pt(12); r.font.color.rgb = RGBColor(0xDB, 0xEA, 0xFE)
    para(doc, space_after=18)
    info = doc.add_table(rows=3, cols=2)
    no_table_borders(info)
    for row, (k, v) in zip(info.rows, (('Modules', 'F200 – KD1 · F200 – KD2 · F100 – KD2'),
                                       ('Covers', covers),
                                       ('Edition', edition))):
        a, b = row.cells
        a.width = Cm(3.2); b.width = Cm(13)
        ra = a.paragraphs[0].add_run(k.upper()); ra.bold = True; ra.font.size = Pt(8.5); ra.font.color.rgb = MUTED
        rb = b.paragraphs[0].add_run(v); rb.font.size = Pt(10.5)
    page_break(doc)

    # ── About this manual ──
    doc.add_heading('About this manual', level=1)
    para(doc, 'This manual explains how to use PPMS, chapter by chapter, in the same order as the screen. '
              'Every topic says who can use it and which module it applies to, explains what it does, and then gives '
              'numbered steps. Where it helps, you will also find these boxes:')
    callout(doc, 'tips', ['Handy extra information and shortcuts.'])
    callout(doc, 'recommended', ['How we recommend using the feature — good practice from daily use.'])
    callout(doc, 'cautions', ['Something to watch out for, such as an action that cannot be undone.'])
    para(doc, 'The same manual is built into PPMS: open the menu (☰) → Help & User Manual, where it can be searched and '
              'filtered to your role. For a quick visual introduction, choose ☰ → Guided tour. Screens are shown in the Light theme.',
         italic=True, color=MUTED, size=9.5)
    page_break(doc)

    # ── Quick reference ──
    doc.add_heading('Quick reference', level=1)
    doc.add_heading('What each role can do', level=3)
    simple_table(doc, ['Action', 'Viewer', 'Operator', 'Planner', 'Master Admin'],
                 [[a] + ['✓' if f else '—' for f in flags] for a, flags in ROLE_MATRIX],
                 [Cm(8.2), Cm(2), Cm(2), Cm(2), Cm(2.6)])
    para(doc, space_after=4)
    doc.add_heading('Task statuses', level=3)
    simple_table(doc, ['Status', 'Meaning'], [[s, m] for s, _, m in STATUSES], [Cm(4), Cm(12.8)],
                 first_col_fills=[f for _, f, _ in STATUSES])
    para(doc, space_after=4)
    doc.add_heading('Keyboard shortcuts', level=3)
    simple_table(doc, ['Keys', 'What it does'], [list(x) for x in SHORTCUTS], [Cm(4), Cm(12.8)])
    page_break(doc)

    # ── Contents ──
    doc.add_heading('Contents', level=1)
    add_toc(doc)

    # ── Chapters ──
    fig = 0
    for gi, group in enumerate(groups, 1):
        items = [s for s in sections if s['group'] == group]
        if not items:
            continue
        page_break(doc)
        h = doc.add_heading(f'{gi:02d}  {group}', level=1)
        h.paragraph_format.space_after = Pt(2)
        intro = intros.get(group)
        if intro:
            ip = para(doc, intro, size=11, color=MUTED, space_after=10)
        topics = para(doc, 'In this chapter: ' + ' · '.join(s['title'] for s in items), size=9, italic=True, color=MUTED, space_after=8)

        for s in items:
            doc.add_heading(s['title'], level=2)
            meta_row(doc, s, roles)
            lead = para(doc, s['summary'], size=11, space_after=6)
            for d in s.get('details') or []:
                para(doc, d, space_after=6)

            img = IMAGES / f"{s['id']}.jpg"
            if img.exists():
                fig += 1
                pic = doc.add_paragraph(); pic.alignment = WD_ALIGN_PARAGRAPH.CENTER
                keep_with_next(pic)
                from PIL import Image as _Img
                with _Img.open(img) as im_:
                    w_cm = min(16.5, im_.width / 110 * 2.54)
                pic.add_run().add_picture(str(img), width=Cm(w_cm))
                cap = para(doc, f"Figure {fig} — {s['title']}", size=8.5, italic=True, color=MUTED,
                           align=WD_ALIGN_PARAGRAPH.CENTER, space_after=8)

            if s.get('steps'):
                steps_block(doc, s['steps'])
            for kind in ('tips', 'recommended', 'cautions'):
                if s.get(kind):
                    callout(doc, kind, s[kind])
            rel = [by_id[r]['title'] for r in (s.get('related') or []) if r in by_id]
            if rel:
                pr = doc.add_paragraph()
                pr.paragraph_format.space_after = Pt(10)
                a = pr.add_run('See also: '); a.bold = True; a.font.size = Pt(9); a.font.color.rgb = ACCENT
                b = pr.add_run(' · '.join(rel)); b.italic = True; b.font.size = Pt(9); b.font.color.rgb = MUTED

    # ── Glossary ──
    if glossary:
        page_break(doc)
        doc.add_heading('Glossary', level=1)
        para(doc, 'The terms used in PPMS and in this manual.', color=MUTED, space_after=8)
        simple_table(doc, ['Term', 'Meaning'], [list(g) for g in glossary], [Cm(4.6), Cm(12.2)])

    update_fields_on_open(doc)
    out_app.parent.mkdir(parents=True, exist_ok=True)
    doc.save(out_app)
    out_docs.parent.mkdir(parents=True, exist_ok=True)
    try:
        shutil.copyfile(out_app, out_docs)
    except PermissionError:
        print(f'  ! docs/manual/{file_name} is open (Word?) — not updated; close it and run again')
    with_img = sum(1 for s in sections if (IMAGES / f"{s['id']}.jpg").exists())
    print(f'Saved {file_name} ({len(sections)} topics, {with_img} with screenshots, {len(glossary)} glossary terms)')


if __name__ == '__main__':
    content = load_content()
    for edition_role in EDITIONS:
        build(edition_role, content)
