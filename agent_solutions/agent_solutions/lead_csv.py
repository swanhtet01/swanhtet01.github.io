from __future__ import annotations

import csv
from io import StringIO

from pydantic import ValidationError

from .contracts import LeadFitRequest, LeadImportRow


MAX_CSV_BYTES = 5 * 1024 * 1024
MAX_CSV_ROWS = 1000
REQUIRED_COLUMNS = {"lead_id", "business_name", "permission_status"}
KNOWN_COLUMNS = {
    "lead_id",
    "business_name",
    "industry",
    "city",
    "public_summary",
    "website",
    "source_url",
    "source_owner",
    "permission_status",
    "do_not_contact",
}


class LeadCsvError(ValueError):
    """Raised when an imported CSV cannot meet the lead-source contract."""


def _boolean(value: str, *, row_number: int) -> bool:
    normalized = value.strip().lower()
    if normalized in {"", "0", "false", "no", "n"}:
        return False
    if normalized in {"1", "true", "yes", "y"}:
        return True
    raise LeadCsvError(
        f"Row {row_number}: do_not_contact must be true/false, yes/no, or 1/0."
    )


def _fieldnames(reader: csv.DictReader[str]) -> list[str]:
    raw_fields = reader.fieldnames
    if not raw_fields:
        raise LeadCsvError("CSV must include a header row.")
    fields = [str(field or "").strip() for field in raw_fields]
    if any(not field for field in fields):
        raise LeadCsvError("CSV headers must not be blank.")
    if len(fields) != len(set(fields)):
        raise LeadCsvError("CSV headers must be unique.")
    missing = sorted(REQUIRED_COLUMNS.difference(fields))
    if missing:
        raise LeadCsvError(f"CSV is missing required columns: {', '.join(missing)}.")
    return fields


def parse_lead_csv(payload: bytes) -> LeadFitRequest:
    if len(payload) > MAX_CSV_BYTES:
        raise LeadCsvError("CSV exceeds the 5 MB upload limit.")
    try:
        text = payload.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise LeadCsvError("CSV must be UTF-8 encoded.") from error

    reader = csv.DictReader(StringIO(text))
    fields = _fieldnames(reader)
    leads: list[LeadImportRow] = []
    for row_number, row in enumerate(reader, start=2):
        normalized = {
            key: str(row.get(key) or "").strip()
            for key in fields
            if key in KNOWN_COLUMNS
        }
        if not any(normalized.values()):
            continue
        normalized["do_not_contact"] = _boolean(
            normalized.get("do_not_contact", ""), row_number=row_number
        )
        try:
            leads.append(LeadImportRow.model_validate(normalized))
        except ValidationError as error:
            first = error.errors()[0]
            field = ".".join(str(item) for item in first["loc"])
            raise LeadCsvError(f"Row {row_number}: invalid {field}.") from error
        if len(leads) > MAX_CSV_ROWS:
            raise LeadCsvError("CSV has more than 1,000 usable lead rows.")

    if not leads:
        raise LeadCsvError("CSV contains no usable lead rows.")
    return LeadFitRequest(leads=leads)
