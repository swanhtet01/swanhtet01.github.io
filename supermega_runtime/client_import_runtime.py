"""Fail-closed validation for four-product client import staging packages."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from hashlib import sha256
import hmac
import json
import re
import unicodedata
from typing import Any
from urllib.parse import urlsplit


CLIENT_IMPORT_PREVIEW_SCHEMA = "supermega.client_import_preview.v1"
CLIENT_IMPORT_STAGING_SCHEMA = "supermega.client_import_staging.v1"
CLIENT_IMPORT_VALIDATION_SCHEMA = "supermega.client_import_validation.v1"
CLIENT_IMPORT_MAX_PACKAGE_BYTES = 1024 * 1024
CLIENT_IMPORT_MAX_ROWS = 500
CLIENT_IMPORT_MAX_MAPPING_HEADER = CLIENT_IMPORT_MAX_PACKAGE_BYTES

CLIENT_IMPORT_PROFILE_IDS: dict[str, tuple[str, ...]] = {
    "commerce": ("social-commerce", "retail-wholesale", "restaurant-ordering"),
    "production": ("production-control", "maintenance-downtime", "quality-traceability"),
    "website": ("business-presence", "lead-generation", "catalog-showcase"),
    "ecommerce": ("social-storefront", "pickup-preorder", "wholesale-request"),
}

_DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
_SKU = re.compile(r"^[A-Z0-9][A-Z0-9._/-]{0,79}$")
_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_ASCII_INTEGER = re.compile(r"^[0-9]+$")
_FORMULA_PREFIX = re.compile(r"^[=+\-@]")
_MAX_SAFE_INTEGER = 9_007_199_254_740_991


@dataclass(frozen=True)
class ClientImportFieldSpec:
    identifier: str
    kind: str
    required: bool = True
    minimum: int | None = None
    maximum: int | None = None


@dataclass(frozen=True)
class ClientImportObjectSpec:
    identifier: str
    key_field: str
    fields: tuple[ClientImportFieldSpec, ...]
    target_surface: str
    required_capability: str


CLIENT_IMPORT_OBJECTS: dict[str, ClientImportObjectSpec] = {
    "commerce": ClientImportObjectSpec(
        identifier="shop_catalog",
        key_field="sku",
        target_surface="commerce",
        required_capability="commerce.write",
        fields=(
            ClientImportFieldSpec("sku", "sku", maximum=80),
            ClientImportFieldSpec("name", "text", maximum=180),
            ClientImportFieldSpec("onHand", "integer", minimum=0),
            ClientImportFieldSpec("reorderAt", "integer", minimum=0),
            ClientImportFieldSpec("price", "integer", minimum=1),
        ),
    ),
    "production": ClientImportObjectSpec(
        identifier="plant_jobs",
        key_field="jobCode",
        target_surface="production",
        required_capability="production.write",
        fields=(
            ClientImportFieldSpec("jobCode", "sku", maximum=80),
            ClientImportFieldSpec("productName", "text", maximum=180),
            ClientImportFieldSpec("targetQuantity", "integer", minimum=1),
            ClientImportFieldSpec("dueDate", "date"),
            ClientImportFieldSpec("line", "text", maximum=120),
        ),
    ),
    "website": ClientImportObjectSpec(
        identifier="website_pages",
        key_field="slug",
        target_surface="website",
        required_capability="website.write",
        fields=(
            ClientImportFieldSpec("slug", "slug", maximum=80),
            ClientImportFieldSpec("title", "text", maximum=120),
            ClientImportFieldSpec("headline", "text", maximum=180),
            ClientImportFieldSpec("body", "text", maximum=1200),
            ClientImportFieldSpec("contactUrl", "url", required=False),
        ),
    ),
    "ecommerce": ClientImportObjectSpec(
        identifier="storefront_merchandising",
        key_field="sku",
        target_surface="commerce",
        required_capability="commerce.write",
        fields=(
            ClientImportFieldSpec("sku", "sku", maximum=80),
            ClientImportFieldSpec("featured", "boolean"),
            ClientImportFieldSpec("collection", "text", maximum=120),
            ClientImportFieldSpec("displayName", "text", required=False, maximum=180),
            ClientImportFieldSpec("note", "text", required=False, maximum=300),
        ),
    ),
}


class ClientImportValidationError(ValueError):
    """Raised when a browser-created staging package is not authoritative."""


@dataclass(frozen=True)
class ClientImportValidationResult:
    product: str
    object_id: str
    workflow_template_id: str
    preview_digest: str
    row_count: int
    target_surface: str
    required_capability: str

    def to_dict(self) -> dict[str, object]:
        return {
            "contract": CLIENT_IMPORT_VALIDATION_SCHEMA,
            "status": "valid",
            "product": self.product,
            "object": self.object_id,
            "workflow_template_id": self.workflow_template_id,
            "preview_digest": self.preview_digest,
            "row_count": self.row_count,
            "checks": [
                "contract",
                "workflow_profile",
                "mapping",
                "row_schema",
                "field_values",
                "unique_keys",
                "source_rows",
                "preview_digest",
            ],
            "activation": {
                "status": "not_applied",
                "target_surface": self.target_surface,
                "required_capability": self.required_capability,
                "human_approval_required": True,
                "atomic_adapter_ready": False,
                "external_writes_performed": False,
            },
        }


def _fail(message: str) -> ClientImportValidationError:
    return ClientImportValidationError(message)


def _exact_object(value: object, field: str, expected: Sequence[str]) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise _fail(f"{field} must be an object.")
    expected_keys = frozenset(expected)
    actual_keys = frozenset(str(key) for key in value)
    if actual_keys != expected_keys or any(not isinstance(key, str) for key in value):
        raise _fail(f"{field} fields do not match the staging contract.")
    return value


def _utf16_length(value: str) -> int:
    return len(value.encode("utf-16-le")) // 2


def _has_control_character(value: str) -> bool:
    return any(ord(character) <= 31 or ord(character) == 127 for character in value)


def _text(
    value: object,
    field: str,
    *,
    maximum: int,
    allow_blank: bool = False,
    formula_safe: bool = True,
) -> str:
    if not isinstance(value, str):
        raise _fail(f"{field} must be text.")
    if value != value.strip():
        raise _fail(f"{field} must not have leading or trailing whitespace.")
    if not value and not allow_blank:
        raise _fail(f"{field} is required.")
    if unicodedata.normalize("NFC", value) != value:
        raise _fail(f"{field} must use normalized Unicode text.")
    if _has_control_character(value):
        raise _fail(f"{field} contains a control character.")
    if formula_safe and value and _FORMULA_PREFIX.match(value):
        raise _fail(f"{field} begins like a spreadsheet formula.")
    if _utf16_length(value) > maximum:
        raise _fail(f"{field} is longer than the supported limit.")
    return value


def _integer(value: str, field: str, minimum: int) -> None:
    if not _ASCII_INTEGER.fullmatch(value):
        raise _fail(f"{field} must use whole ASCII digits.")
    parsed = int(value)
    if parsed < minimum or parsed > _MAX_SAFE_INTEGER:
        raise _fail(f"{field} is outside the supported range.")


def _date(value: str, field: str) -> None:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise _fail(f"{field} must use YYYY-MM-DD.")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise _fail(f"{field} must be a real date.") from exc
    if parsed.isoformat() != value:
        raise _fail(f"{field} must be a canonical date.")


def _url(value: str, field: str) -> None:
    if "\\" in value or any(character.isspace() for character in value):
        raise _fail(f"{field} must be an HTTPS, mailto, or tel URL.")
    try:
        parsed = urlsplit(value)
        parsed.port
    except ValueError as exc:
        raise _fail(f"{field} must be an HTTPS, mailto, or tel URL.") from exc
    if parsed.scheme == "https":
        if not parsed.hostname or parsed.username or parsed.password:
            raise _fail(f"{field} must be a safe HTTPS URL.")
        return
    if parsed.scheme in {"mailto", "tel"} and parsed.path and not parsed.netloc:
        return
    raise _fail(f"{field} must be an HTTPS, mailto, or tel URL.")


def _field_value(value: object, field: ClientImportFieldSpec, path: str) -> str:
    text = _text(
        value,
        path,
        maximum=field.maximum or 1200,
        allow_blank=not field.required,
    )
    if not text:
        return text
    if field.kind == "integer":
        _integer(text, path, field.minimum or 0)
    elif field.kind == "sku" and not _SKU.fullmatch(text):
        raise _fail(f"{path} is not a canonical identifier.")
    elif field.kind == "slug" and not _SLUG.fullmatch(text):
        raise _fail(f"{path} is not a canonical URL slug.")
    elif field.kind == "date":
        _date(text, path)
    elif field.kind == "boolean" and text not in {"true", "false"}:
        raise _fail(f"{path} must be true or false.")
    elif field.kind == "url":
        _url(text, path)
    return text


def _package_size(value: Mapping[str, Any]) -> int:
    try:
        encoded = json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise _fail("The staging package must be finite JSON.") from exc
    return len(encoded)


def _normalize_header(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).lower()
    output: list[str] = []
    for character in normalized:
        if character.isalnum():
            output.append(character)
        elif output and output[-1] != "_":
            output.append("_")
    return "".join(output).strip("_")


def _preview_digest(
    *,
    product: str,
    object_id: str,
    workflow_template_id: str,
    source_digest: str,
    mapping: Mapping[str, str],
) -> str:
    canonical = json.dumps(
        {
            "schema": CLIENT_IMPORT_PREVIEW_SCHEMA,
            "product": product,
            "object": object_id,
            "workflowTemplateId": workflow_template_id,
            "sourceDigest": source_digest,
            "mapping": mapping,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"sha256:{sha256(canonical).hexdigest()}"


def validate_client_import_staging_package(value: object) -> ClientImportValidationResult:
    """Validate a complete import package without retaining or applying it."""

    package = _exact_object(
        value,
        "package",
        (
            "contract",
            "product",
            "object",
            "workflowTemplateId",
            "workspace",
            "owner",
            "source",
            "mapping",
            "rows",
            "controls",
        ),
    )
    if _package_size(package) > CLIENT_IMPORT_MAX_PACKAGE_BYTES:
        raise _fail("The staging package exceeds the server validation limit.")
    if package["contract"] != CLIENT_IMPORT_STAGING_SCHEMA:
        raise _fail("The staging package contract is unsupported.")

    product = _text(package["product"], "package.product", maximum=40)
    spec = CLIENT_IMPORT_OBJECTS.get(product)
    if spec is None:
        raise _fail("package.product is unsupported.")
    if package["object"] != spec.identifier:
        raise _fail("package.object does not match the selected product.")
    workflow_template_id = _text(
        package["workflowTemplateId"],
        "package.workflowTemplateId",
        maximum=80,
    )
    if workflow_template_id not in CLIENT_IMPORT_PROFILE_IDS[product]:
        raise _fail("package.workflowTemplateId is not valid for the selected product.")
    _text(package["workspace"], "package.workspace", maximum=120, formula_safe=False)
    _text(package["owner"], "package.owner", maximum=120, formula_safe=False)

    source = _exact_object(package["source"], "package.source", ("name", "digest", "previewDigest"))
    _text(source["name"], "package.source.name", maximum=180, formula_safe=False)
    source_digest = _text(source["digest"], "package.source.digest", maximum=71)
    preview_digest = _text(source["previewDigest"], "package.source.previewDigest", maximum=71)
    if not _DIGEST.fullmatch(source_digest) or not _DIGEST.fullmatch(preview_digest):
        raise _fail("Package source digests must use SHA-256.")

    field_ids = tuple(field.identifier for field in spec.fields)
    mapping_raw = _exact_object(package["mapping"], "package.mapping", field_ids)
    mapping: dict[str, str] = {}
    selected_headers: list[str] = []
    for field in spec.fields:
        header = _text(
            mapping_raw[field.identifier],
            f"package.mapping.{field.identifier}",
            maximum=CLIENT_IMPORT_MAX_MAPPING_HEADER,
            allow_blank=not field.required,
            formula_safe=False,
        )
        mapping[field.identifier] = header
        if header:
            selected_headers.append(_normalize_header(header))
    if len(selected_headers) != len(set(selected_headers)):
        raise _fail("A source column cannot supply more than one target field.")

    rows = package["rows"]
    if not isinstance(rows, list) or not rows or len(rows) > CLIENT_IMPORT_MAX_ROWS:
        raise _fail(f"package.rows must contain between 1 and {CLIENT_IMPORT_MAX_ROWS} rows.")
    seen_keys: set[str] = set()
    seen_source_rows: set[int] = set()
    previous_source_row = 1
    for index, candidate in enumerate(rows):
        row_path = f"package.rows[{index}]"
        row = _exact_object(candidate, row_path, ("sourceRow", "key", "values"))
        source_row = row["sourceRow"]
        if type(source_row) is not int or source_row < 2 or source_row > 1_000_000:
            raise _fail(f"{row_path}.sourceRow is invalid.")
        if source_row in seen_source_rows or source_row <= previous_source_row:
            raise _fail("Package source rows must be unique and increasing.")
        seen_source_rows.add(source_row)
        previous_source_row = source_row

        values_raw = _exact_object(row["values"], f"{row_path}.values", field_ids)
        values: dict[str, str] = {}
        for field in spec.fields:
            field_value = _field_value(
                values_raw[field.identifier],
                field,
                f"{row_path}.values.{field.identifier}",
            )
            if not mapping[field.identifier] and field_value:
                raise _fail(f"{row_path}.values.{field.identifier} has no source mapping.")
            values[field.identifier] = field_value
        key = _text(row["key"], f"{row_path}.key", maximum=80)
        if key != values[spec.key_field]:
            raise _fail(f"{row_path}.key does not match its canonical key field.")
        if key in seen_keys:
            raise _fail("Package row keys must be unique.")
        seen_keys.add(key)

    controls = _exact_object(
        package["controls"],
        "package.controls",
        ("rowCount", "humanReviewRequired", "externalWritesPerformed", "activationStatus"),
    )
    if type(controls["rowCount"]) is not int or controls["rowCount"] != len(rows):
        raise _fail("package.controls.rowCount does not match the checked rows.")
    if controls["humanReviewRequired"] is not True:
        raise _fail("The staging package must retain human review.")
    if controls["externalWritesPerformed"] is not False:
        raise _fail("A staging package cannot claim an external write.")
    if controls["activationStatus"] != "staged_not_applied":
        raise _fail("A staging package must remain not applied.")

    expected_preview_digest = _preview_digest(
        product=product,
        object_id=spec.identifier,
        workflow_template_id=workflow_template_id,
        source_digest=source_digest,
        mapping=mapping,
    )
    if not hmac.compare_digest(expected_preview_digest, preview_digest):
        raise _fail("The preview digest does not match this workflow and mapping.")

    return ClientImportValidationResult(
        product=product,
        object_id=spec.identifier,
        workflow_template_id=workflow_template_id,
        preview_digest=preview_digest,
        row_count=len(rows),
        target_surface=spec.target_surface,
        required_capability=spec.required_capability,
    )


__all__ = [
    "CLIENT_IMPORT_MAX_PACKAGE_BYTES",
    "CLIENT_IMPORT_MAX_ROWS",
    "CLIENT_IMPORT_OBJECTS",
    "CLIENT_IMPORT_PROFILE_IDS",
    "CLIENT_IMPORT_STAGING_SCHEMA",
    "CLIENT_IMPORT_VALIDATION_SCHEMA",
    "ClientImportValidationError",
    "ClientImportValidationResult",
    "validate_client_import_staging_package",
]
