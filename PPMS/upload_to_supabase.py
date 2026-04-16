"""
KD1 Assembly Plan — Excel → Supabase Uploader
=============================================
Usage:
    pip install pandas openpyxl supabase
    python upload_to_supabase.py --file "your_plan.xlsx"

Optional flags:
    --sheet     Sheet name or index (default: 0 = first sheet)
    --batch     Rows per batch insert (default: 50)
    --dry-run   Preview parsed rows without uploading
"""

import argparse
import sys
from datetime import datetime

import pandas as pd
from supabase import create_client, Client

# ──────────────────────────────────────────────────────────────────
# CONFIGURATION — replace with your Supabase project credentials
# ──────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://biqwfqkuhebxcfucangt.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcXdmcWt1aGVieGNmdWNhbmd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzNzM5NzQsImV4cCI6MjA4MTk0OTk3NH0.QkASAl8yzXfxVq0b0FdkXHTOpblldr2prCnImpV8ml8"
TABLE_NAME   = "assembly_plan"

# Excel column  →  Supabase column
COLUMN_MAP = {
    "VEHICLE":          "vehicle",
    "VEHICLE NO":       "vehicle_no",
    "PROCESS/STATION":  "process_station",
    "WEEK":             "week",
    "START DATE":       "start_date",
    "END DATE":         "end_date",
    "REMARK":           "remark",
}

# ──────────────────────────────────────────────────────────────────
# DATE PARSING
# Handles: "23-Feb-26", "23-Feb-2026", datetime objects, NaT
# ──────────────────────────────────────────────────────────────────
def parse_date(value) -> str | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None

    try:
        # Let pandas intelligently parse any date format
        dt = pd.to_datetime(value, errors="coerce")
        if pd.isna(dt):
            print(f"  ⚠  Could not parse date: '{value}' — will be skipped")
            return None
        return dt.strftime("%Y-%m-%d")
    except Exception:
        print(f"  ⚠  Could not parse date: '{value}' — will be skipped")
        return None


# ──────────────────────────────────────────────────────────────────
# ROW BUILDER
# ──────────────────────────────────────────────────────────────────
def build_row(raw: dict) -> dict | None:
    """Map one Excel row → Supabase payload. Returns None if invalid."""
    row = {}
    for excel_col, db_col in COLUMN_MAP.items():
        row[db_col] = raw.get(excel_col)

    # Normalise strings
    for key in ("vehicle", "vehicle_no", "process_station", "week", "remark"):
        v = row.get(key)
        row[key] = str(v).strip() if v is not None and not (isinstance(v, float) and pd.isna(v)) else None

    # Parse dates
    row["start_date"] = parse_date(row["start_date"])
    row["end_date"]   = parse_date(row["end_date"])

    # Required fields check
    missing = [f for f in ("vehicle", "vehicle_no", "process_station", "start_date", "end_date")
               if not row.get(f)]
    if missing:
        return None   # silently skip header repeats / blank rows

    # Empty remark → empty string
    if not row["remark"]:
        row["remark"] = ""

    return row


# ──────────────────────────────────────────────────────────────────
# BATCH UPLOAD
# ──────────────────────────────────────────────────────────────────
def upload_batches(client: Client, rows: list[dict], batch_size: int):
    total   = len(rows)
    success = 0
    failed  = 0

    for i in range(0, total, batch_size):
        batch = rows[i : i + batch_size]
        try:
            res = client.table(TABLE_NAME).insert(batch).execute()
            success += len(batch)
            print(f"  ✓  Batch {i // batch_size + 1}: inserted {len(batch)} rows "
                  f"({success}/{total})")
        except Exception as e:
            failed += len(batch)
            print(f"  ✗  Batch {i // batch_size + 1} failed: {e}")

    return success, failed


# ──────────────────────────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Upload KD1 Assembly Plan Excel → Supabase")
    parser.add_argument("--file",    required=True, help="Path to the Excel file (.xlsx)")
    parser.add_argument("--sheet",   default=0,     help="Sheet name or index (default: 0)")
    parser.add_argument("--batch",   type=int, default=50, help="Rows per batch (default: 50)")
    parser.add_argument("--dry-run", action="store_true",  help="Parse only; do not upload")
    args = parser.parse_args()

    # ── 1. Read Excel ────────────────────────────────────────────
    print(f"\n📂 Reading file : {args.file}")
    try:
        sheet = int(args.sheet) if str(args.sheet).isdigit() else args.sheet
        df = pd.read_excel(
            args.file,
            sheet_name=sheet,
            dtype=str,          # read everything as string first
            keep_default_na=False,
        )
    except FileNotFoundError:
        sys.exit(f"❌  File not found: {args.file}")
    except Exception as e:
        sys.exit(f"❌  Failed to read Excel: {e}")

    # Strip column name whitespace
    df.columns = [str(c).strip() for c in df.columns]

    # Drop rows where every mapped column is empty (section dividers etc.)
    df.dropna(how="all", inplace=True)

    print(f"   Sheet       : {df.attrs.get('sheet_name', sheet)}")
    print(f"   Raw rows    : {len(df)}")
    print(f"   Columns     : {list(df.columns)}")

    # Check required columns exist
    missing_cols = [c for c in COLUMN_MAP if c not in df.columns]
    if missing_cols:
        sys.exit(f"❌  Missing columns in Excel: {missing_cols}\n"
                 f"   Found: {list(df.columns)}")

    # ── 2. Parse rows ────────────────────────────────────────────
    print("\n🔄 Parsing rows…")
    rows    = []
    skipped = 0

    for _, raw in df.iterrows():
        row = build_row(raw.to_dict())
        if row:
            rows.append(row)
        else:
            skipped += 1

    print(f"   Valid rows  : {len(rows)}")
    print(f"   Skipped     : {skipped} (blank / missing required fields)")

    if not rows:
        sys.exit("❌  No valid rows to upload.")

    # ── 3. Dry-run preview ───────────────────────────────────────
    if args.dry_run:
        print("\n🔍 DRY RUN — first 5 parsed rows:\n")
        for r in rows[:5]:
            print(" ", r)
        print(f"\n✅ Dry run complete. {len(rows)} rows would be uploaded.")
        return

    # ── 4. Connect to Supabase ───────────────────────────────────
    print("\n🔗 Connecting to Supabase…")
    if "YOUR_SUPABASE" in SUPABASE_URL or "YOUR_PUBLIC" in SUPABASE_KEY:
        sys.exit("❌  Please set SUPABASE_URL and SUPABASE_KEY in the script.")

    try:
        client = create_client(SUPABASE_URL, SUPABASE_KEY)
        # Quick connectivity check
        client.table(TABLE_NAME).select("id").limit(1).execute()
        print("   Connected ✓")
    except Exception as e:
        sys.exit(f"❌  Supabase connection failed: {e}")

    # ── 5. Upload ────────────────────────────────────────────────
    print(f"\n🚀 Uploading {len(rows)} rows in batches of {args.batch}…\n")
    success, failed = upload_batches(client, rows, args.batch)

    # ── 6. Summary ───────────────────────────────────────────────
    print(f"\n{'─'*40}")
    print(f"  Total parsed : {len(rows)}")
    print(f"  Inserted     : {success}")
    print(f"  Failed       : {failed}")
    print(f"{'─'*40}")
    if failed == 0:
        print("✅ Upload complete!\n")
    else:
        print("⚠  Upload finished with errors. Check messages above.\n")


if __name__ == "__main__":
    main()