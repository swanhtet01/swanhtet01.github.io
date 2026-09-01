"""Deterministic, no-I/O Website release-package foundation.

The foundation binds an already approved Website snapshot to versioned template,
brand, locale, media, role, candidate, rollback, and domain-handoff evidence.
It executes no deployment, domain, credential, provider request, or public claim.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime
from hashlib import sha256
import json
import re
import unicodedata
from typing import Any


WEBSITE_RELEASE_STATE_SCHEMA = "supermega.website.release_foundation.v1"
WEBSITE_RELEASE_PACKAGE_CONTRACT = "supermega.website.release_package.v1"
WEBSITE_RELEASE_PROJECTION_CONTRACT = "supermega.website.release_projection.v1"
WEBSITE_DEPLOY_PLAN_CONTRACT = "supermega.website.deploy_plan.v1"
WEBSITE_BRAND_TOKEN_CONTRACT = "supermega.website.brand_tokens.v1"
EMPTY_WEBSITE_RELEASE_DIGEST = f"sha256:{'0' * 64}"

_DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
_WEBSITE_FINGERPRINT = re.compile(r"^web-[0-9a-f]{8}$")
_TOKEN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,179}$")
_LANGUAGE_TAG = re.compile(r"^[a-z]{2,3}(?:-[A-Z]{2})?$")
_HEX_COLOR = re.compile(r"^#[0-9a-f]{6}$")
_ISO_TIMESTAMP = re.compile(
    r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}"
    r"(?:\.[0-9]{1,6})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$"
)
_MAX_SAFE_INTEGER = 9_007_199_254_740_991
_MAX_COMMANDS = 100
_MAX_LOCALES = 8
_MAX_MEDIA = 100
_MAX_MEDIA_BYTES = 50 * 1024 * 1024
_SOURCE_EVIDENCE_KINDS = ("content", "links", "responsive")
_REQUIRED_ROLES = ("content_owner", "release_manager", "release_reviewer")
_FONT_TOKENS = frozenset(
    {"system-sans", "noto-sans-myanmar", "system-serif"}
)
_TEMPLATE_COMPONENTS: dict[int, tuple[tuple[str, int], ...]] = {
    1: (("CMP-CONTENT", 1), ("CMP-HERO", 1), ("CMP-NAVIGATION", 1)),
    2: (("CMP-CONTENT", 1), ("CMP-HERO", 2), ("CMP-NAVIGATION", 2)),
}
_MIGRATION_OPERATIONS = ("CMP-HERO:1->2", "CMP-NAVIGATION:1->2")
_COMMAND_KINDS = frozenset(
    {"prepare_package", "upgrade_template", "approve_release", "prepare_deploy_plan"}
)


class WebsiteReleaseValidationError(ValueError):
    """Raised when Website release evidence cannot be proved consistent."""


def _fail(message: str) -> WebsiteReleaseValidationError:
    return WebsiteReleaseValidationError(message)


def _object(value: object, field: str, keys: Sequence[str]) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise _fail(f"{field} must be an object.")
    if any(not isinstance(key, str) for key in value) or frozenset(value) != frozenset(keys):
        raise _fail(f"{field} fields do not match the contract.")
    return value


def _array(
    value: object,
    field: str,
    *,
    minimum: int = 0,
    maximum: int,
) -> list[Any]:
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        raise _fail(f"{field} must contain between {minimum} and {maximum} items.")
    return value


def _text(
    value: object,
    field: str,
    *,
    maximum: int = 240,
    allow_blank: bool = False,
) -> str:
    if not isinstance(value, str) or value != value.strip() or (not allow_blank and not value):
        raise _fail(f"{field} must be trimmed text.")
    if unicodedata.normalize("NFC", value) != value:
        raise _fail(f"{field} must use normalized Unicode text.")
    if any(ord(character) <= 31 or ord(character) == 127 for character in value):
        raise _fail(f"{field} contains a control character.")
    if len(value.encode("utf-16-le")) // 2 > maximum:
        raise _fail(f"{field} exceeds its supported length.")
    return value


def _token(value: object, field: str) -> str:
    candidate = _text(value, field, maximum=180)
    if _TOKEN.fullmatch(candidate) is None:
        raise _fail(f"{field} must be a canonical token.")
    return candidate


def _integer(
    value: object,
    field: str,
    *,
    minimum: int = 0,
    maximum: int = _MAX_SAFE_INTEGER,
) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise _fail(f"{field} must be a supported integer.")
    return value


def _boolean(value: object, field: str) -> bool:
    if not isinstance(value, bool):
        raise _fail(f"{field} must be true or false.")
    return value


def _digest(value: object, field: str) -> str:
    candidate = _text(value, field, maximum=71)
    if _DIGEST.fullmatch(candidate) is None:
        raise _fail(f"{field} must be a SHA-256 digest.")
    return candidate


def _timestamp(value: object, field: str) -> str:
    candidate = _text(value, field, maximum=40)
    if _ISO_TIMESTAMP.fullmatch(candidate) is None:
        raise _fail(f"{field} must be an ISO timestamp with an explicit offset.")
    try:
        parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
    except ValueError as exc:
        raise _fail(f"{field} must be a real calendar timestamp.") from exc
    if parsed.utcoffset() is None:
        raise _fail(f"{field} must include a UTC offset.")
    return candidate


def _unique(values: Sequence[str], field: str) -> None:
    if len(values) != len(set(values)):
        raise _fail(f"{field} contains duplicates.")


def _sorted(values: Sequence[str], field: str) -> None:
    if list(values) != sorted(values):
        raise _fail(f"{field} must use canonical order.")


def _canonical_json(value: object) -> str:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise _fail("Website release evidence is not canonical JSON.") from exc


def _canonical_digest(value: object) -> str:
    return f"sha256:{sha256(_canonical_json(value).encode('utf-8')).hexdigest()}"


def _canonical_copy(value: object) -> Any:
    return json.loads(_canonical_json(value))


def website_release_evidence_digest(value: object) -> str:
    """Return the cross-runtime SHA-256 digest for release evidence."""

    return _canonical_digest(value)


def _proof(value: object, field: str) -> dict[str, str]:
    source = _object(
        value,
        field,
        ("actionId", "capturedAt", "actor", "reason", "evidenceReference"),
    )
    return {
        "actionId": _token(source["actionId"], f"{field}.actionId"),
        "capturedAt": _timestamp(source["capturedAt"], f"{field}.capturedAt"),
        "actor": _text(source["actor"], f"{field}.actor", maximum=120),
        "reason": _text(source["reason"], f"{field}.reason", maximum=300),
        "evidenceReference": _text(
            source["evidenceReference"],
            f"{field}.evidenceReference",
            maximum=220,
        ),
    }


def _source_evidence(value: object, field: str) -> list[dict[str, str]]:
    rows = _array(value, field, minimum=3, maximum=3)
    result: list[dict[str, str]] = []
    for index, candidate in enumerate(rows):
        row_field = f"{field}[{index}]"
        source = _object(
            candidate,
            row_field,
            ("id", "kind", "reference", "verifiedBy", "verifiedAt"),
        )
        kind = source["kind"]
        if kind not in _SOURCE_EVIDENCE_KINDS:
            raise _fail(f"{row_field}.kind is unsupported.")
        result.append(
            {
                "id": _token(source["id"], f"{row_field}.id"),
                "kind": kind,
                "reference": _text(
                    source["reference"], f"{row_field}.reference", maximum=220
                ),
                "verifiedBy": _text(
                    source["verifiedBy"], f"{row_field}.verifiedBy", maximum=120
                ),
                "verifiedAt": _timestamp(
                    source["verifiedAt"], f"{row_field}.verifiedAt"
                ),
            }
        )
    kinds = [row["kind"] for row in result]
    _unique(kinds, f"{field} kinds")
    _sorted(kinds, f"{field} kinds")
    if tuple(kinds) != _SOURCE_EVIDENCE_KINDS:
        raise _fail(f"{field} must cover content, links, and responsive review.")
    _unique([row["id"] for row in result], f"{field} IDs")
    return result


def _release_source(value: object, field: str) -> dict[str, Any]:
    source = _object(
        value,
        field,
        (
            "scope",
            "snapshotId",
            "websiteFingerprint",
            "artifactDigest",
            "contentRevision",
            "contentApprovalId",
            "contentApprovalActor",
            "contentApprovalAt",
            "evidence",
        ),
    )
    fingerprint = _text(
        source["websiteFingerprint"], f"{field}.websiteFingerprint", maximum=12
    )
    if _WEBSITE_FINGERPRINT.fullmatch(fingerprint) is None:
        raise _fail(f"{field}.websiteFingerprint is unsupported.")
    return {
        "scope": _token(source["scope"], f"{field}.scope"),
        "snapshotId": _token(source["snapshotId"], f"{field}.snapshotId"),
        "websiteFingerprint": fingerprint,
        "artifactDigest": _digest(
            source["artifactDigest"], f"{field}.artifactDigest"
        ),
        "contentRevision": _integer(
            source["contentRevision"], f"{field}.contentRevision", minimum=1
        ),
        "contentApprovalId": _token(
            source["contentApprovalId"], f"{field}.contentApprovalId"
        ),
        "contentApprovalActor": _text(
            source["contentApprovalActor"],
            f"{field}.contentApprovalActor",
            maximum=120,
        ),
        "contentApprovalAt": _timestamp(
            source["contentApprovalAt"], f"{field}.contentApprovalAt"
        ),
        "evidence": _source_evidence(source["evidence"], f"{field}.evidence"),
    }


def _template(value: object, field: str) -> dict[str, Any]:
    source = _object(value, field, ("templateId", "version", "components"))
    if source["templateId"] != "TPL-BUSINESS-001":
        raise _fail(f"{field}.templateId is unsupported.")
    version = _integer(source["version"], f"{field}.version", minimum=1, maximum=2)
    rows = _array(source["components"], f"{field}.components", minimum=3, maximum=3)
    components: list[dict[str, Any]] = []
    for index, candidate in enumerate(rows):
        row_field = f"{field}.components[{index}]"
        row = _object(candidate, row_field, ("componentId", "version"))
        components.append(
            {
                "componentId": _token(row["componentId"], f"{row_field}.componentId"),
                "version": _integer(
                    row["version"], f"{row_field}.version", minimum=1, maximum=20
                ),
            }
        )
    component_pairs = tuple(
        (row["componentId"], row["version"]) for row in components
    )
    if component_pairs != _TEMPLATE_COMPONENTS[version]:
        raise _fail(f"{field}.components do not match the template version.")
    return {
        "templateId": "TPL-BUSINESS-001",
        "version": version,
        "components": components,
    }


def website_release_template(version: int = 2) -> dict[str, Any]:
    """Return the canonical supported Website template descriptor."""

    if version not in _TEMPLATE_COMPONENTS:
        raise _fail("Website template version is unsupported.")
    return {
        "templateId": "TPL-BUSINESS-001",
        "version": version,
        "components": [
            {"componentId": component_id, "version": component_version}
            for component_id, component_version in _TEMPLATE_COMPONENTS[version]
        ],
    }


def _brand(value: object, field: str) -> dict[str, Any]:
    source = _object(value, field, ("schema", "palette", "typography", "radiusPx"))
    if source["schema"] != WEBSITE_BRAND_TOKEN_CONTRACT:
        raise _fail(f"{field}.schema is unsupported.")
    palette_source = _object(
        source["palette"], f"{field}.palette", ("accent", "ink", "surface")
    )
    palette: dict[str, str] = {}
    for name in ("accent", "ink", "surface"):
        color = _text(palette_source[name], f"{field}.palette.{name}", maximum=7)
        if _HEX_COLOR.fullmatch(color) is None:
            raise _fail(f"{field}.palette.{name} must be a lowercase six-digit color.")
        palette[name] = color
    typography_source = _object(
        source["typography"], f"{field}.typography", ("body", "heading")
    )
    typography: dict[str, str] = {}
    for name in ("body", "heading"):
        token = typography_source[name]
        if token not in _FONT_TOKENS:
            raise _fail(f"{field}.typography.{name} is unsupported.")
        typography[name] = token
    return {
        "schema": WEBSITE_BRAND_TOKEN_CONTRACT,
        "palette": palette,
        "typography": typography,
        "radiusPx": _integer(
            source["radiusPx"], f"{field}.radiusPx", maximum=32
        ),
    }


def _locales(value: object, field: str) -> list[dict[str, Any]]:
    rows = _array(value, field, minimum=1, maximum=_MAX_LOCALES)
    result: list[dict[str, Any]] = []
    for index, candidate in enumerate(rows):
        row_field = f"{field}[{index}]"
        source = _object(
            candidate,
            row_field,
            ("locale", "isDefault", "status", "contentDigest"),
        )
        locale = _text(source["locale"], f"{row_field}.locale", maximum=12)
        if _LANGUAGE_TAG.fullmatch(locale) is None:
            raise _fail(f"{row_field}.locale must be a canonical language tag.")
        status = source["status"]
        if status not in {"approved", "draft"}:
            raise _fail(f"{row_field}.status is unsupported.")
        result.append(
            {
                "locale": locale,
                "isDefault": _boolean(
                    source["isDefault"], f"{row_field}.isDefault"
                ),
                "status": status,
                "contentDigest": _digest(
                    source["contentDigest"], f"{row_field}.contentDigest"
                ),
            }
        )
    locale_ids = [row["locale"] for row in result]
    _unique(locale_ids, f"{field} locale tags")
    _sorted(locale_ids, f"{field} locale tags")
    defaults = [row for row in result if row["isDefault"]]
    if len(defaults) != 1 or defaults[0]["status"] != "approved":
        raise _fail(f"{field} must have one approved default locale.")
    return result


def _media(value: object, field: str, locales: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    rows = _array(value, field, maximum=_MAX_MEDIA)
    locale_ids = {row["locale"] for row in locales}
    approved_locale_ids = {row["locale"] for row in locales if row["status"] == "approved"}
    result: list[dict[str, Any]] = []
    for index, candidate in enumerate(rows):
        row_field = f"{field}[{index}]"
        source = _object(
            candidate,
            row_field,
            ("assetId", "kind", "digest", "bytes", "decorative", "alt"),
        )
        if source["kind"] != "image":
            raise _fail(f"{row_field}.kind is unsupported.")
        decorative = _boolean(source["decorative"], f"{row_field}.decorative")
        alt_rows = _array(
            source["alt"], f"{row_field}.alt", maximum=_MAX_LOCALES
        )
        alt: list[dict[str, str]] = []
        for alt_index, alt_candidate in enumerate(alt_rows):
            alt_field = f"{row_field}.alt[{alt_index}]"
            alt_source = _object(alt_candidate, alt_field, ("locale", "text"))
            locale = _text(alt_source["locale"], f"{alt_field}.locale", maximum=12)
            if locale not in locale_ids:
                raise _fail(f"{alt_field}.locale is not in the package locale manifest.")
            alt.append(
                {
                    "locale": locale,
                    "text": _text(
                        alt_source["text"], f"{alt_field}.text", maximum=240
                    ),
                }
            )
        alt_locales = [row["locale"] for row in alt]
        _unique(alt_locales, f"{row_field}.alt locales")
        _sorted(alt_locales, f"{row_field}.alt locales")
        if decorative and alt:
            raise _fail(f"{row_field} decorative images cannot claim alternative text.")
        if not decorative and set(alt_locales) != approved_locale_ids:
            raise _fail(
                f"{row_field} must have alternative text for every approved locale."
            )
        result.append(
            {
                "assetId": _token(source["assetId"], f"{row_field}.assetId"),
                "kind": "image",
                "digest": _digest(source["digest"], f"{row_field}.digest"),
                "bytes": _integer(
                    source["bytes"],
                    f"{row_field}.bytes",
                    minimum=1,
                    maximum=_MAX_MEDIA_BYTES,
                ),
                "decorative": decorative,
                "alt": alt,
            }
        )
    asset_ids = [row["assetId"] for row in result]
    _unique(asset_ids, f"{field} asset IDs")
    _sorted(asset_ids, f"{field} asset IDs")
    return result


def _roles(value: object, field: str) -> list[dict[str, str]]:
    rows = _array(value, field, minimum=3, maximum=3)
    result: list[dict[str, str]] = []
    for index, candidate in enumerate(rows):
        row_field = f"{field}[{index}]"
        source = _object(candidate, row_field, ("role", "actor"))
        role = source["role"]
        if role not in _REQUIRED_ROLES:
            raise _fail(f"{row_field}.role is unsupported.")
        result.append(
            {
                "role": role,
                "actor": _text(source["actor"], f"{row_field}.actor", maximum=120),
            }
        )
    role_ids = [row["role"] for row in result]
    _unique(role_ids, f"{field} roles")
    _sorted(role_ids, f"{field} roles")
    if tuple(role_ids) != _REQUIRED_ROLES:
        raise _fail(f"{field} must assign all required release roles.")
    return result


def _migration(value: object, field: str) -> dict[str, Any]:
    source = _object(
        value,
        field,
        (
            "migrationId",
            "fromPackageDigest",
            "fromTemplateVersion",
            "toTemplateVersion",
            "operations",
            "preserved",
        ),
    )
    operations = _array(
        source["operations"], f"{field}.operations", minimum=2, maximum=2
    )
    canonical_operations = [
        _text(value, f"{field}.operations[{index}]", maximum=80)
        for index, value in enumerate(operations)
    ]
    if tuple(canonical_operations) != _MIGRATION_OPERATIONS:
        raise _fail(f"{field}.operations are unsupported.")
    preserved_source = _object(
        source["preserved"],
        f"{field}.preserved",
        ("source", "brand", "locales", "media", "roles"),
    )
    return {
        "migrationId": _token(source["migrationId"], f"{field}.migrationId"),
        "fromPackageDigest": _digest(
            source["fromPackageDigest"], f"{field}.fromPackageDigest"
        ),
        "fromTemplateVersion": _integer(
            source["fromTemplateVersion"],
            f"{field}.fromTemplateVersion",
            minimum=1,
            maximum=2,
        ),
        "toTemplateVersion": _integer(
            source["toTemplateVersion"],
            f"{field}.toTemplateVersion",
            minimum=1,
            maximum=2,
        ),
        "operations": canonical_operations,
        "preserved": {
            name: _digest(preserved_source[name], f"{field}.preserved.{name}")
            for name in ("source", "brand", "locales", "media", "roles")
        },
    }


def _validate_package(value: object) -> dict[str, Any]:
    source = _object(
        value,
        "Website release package",
        (
            "contract",
            "packageId",
            "source",
            "template",
            "brand",
            "locales",
            "media",
            "roles",
            "previousPackageDigest",
            "migration",
            "packageDigest",
        ),
    )
    if source["contract"] != WEBSITE_RELEASE_PACKAGE_CONTRACT:
        raise _fail("Website release package.contract is unsupported.")
    release_source = _release_source(source["source"], "Website release package.source")
    template = _template(source["template"], "Website release package.template")
    brand = _brand(source["brand"], "Website release package.brand")
    locales = _locales(source["locales"], "Website release package.locales")
    media = _media(source["media"], "Website release package.media", locales)
    roles = _roles(source["roles"], "Website release package.roles")
    if _role_actor({"roles": roles}, "content_owner") != release_source["contentApprovalActor"]:
        raise _fail("Website release package content owner must match the approved content actor.")
    previous = source["previousPackageDigest"]
    if previous is not None:
        previous = _digest(previous, "Website release package.previousPackageDigest")
    migration = source["migration"]
    if migration is not None:
        migration = _migration(migration, "Website release package.migration")
    if (previous is None) != (migration is None):
        raise _fail("Website release package migration and previous digest must appear together.")
    if migration is not None:
        if (
            migration["fromPackageDigest"] != previous
            or migration["fromTemplateVersion"] != 1
            or migration["toTemplateVersion"] != 2
            or template["version"] != 2
        ):
            raise _fail("Website release package migration does not match its template lineage.")
        expected_preserved = {
            "source": _canonical_digest(release_source),
            "brand": _canonical_digest(brand),
            "locales": _canonical_digest(locales),
            "media": _canonical_digest(media),
            "roles": _canonical_digest(roles),
        }
        if migration["preserved"] != expected_preserved:
            raise _fail("Website release package migration preservation evidence drifted.")
    body = {
        "contract": WEBSITE_RELEASE_PACKAGE_CONTRACT,
        "packageId": _token(source["packageId"], "Website release package.packageId"),
        "source": release_source,
        "template": template,
        "brand": brand,
        "locales": locales,
        "media": media,
        "roles": roles,
        "previousPackageDigest": previous,
        "migration": migration,
    }
    package_digest = _digest(
        source["packageDigest"], "Website release package.packageDigest"
    )
    if package_digest != _canonical_digest(body):
        raise _fail("Website release package.packageDigest does not match its content.")
    return _canonical_copy({**body, "packageDigest": package_digest})


def build_website_release_package(
    *,
    package_id: object,
    source: object,
    template: object,
    brand: object,
    locales: object,
    media: object,
    roles: object,
) -> dict[str, Any]:
    """Build one immutable release package from approved Website evidence."""

    body = {
        "contract": WEBSITE_RELEASE_PACKAGE_CONTRACT,
        "packageId": _token(package_id, "package_id"),
        "source": _release_source(source, "source"),
        "template": _template(template, "template"),
        "brand": _brand(brand, "brand"),
        "locales": _locales(locales, "locales"),
        "media": [],
        "roles": _roles(roles, "roles"),
        "previousPackageDigest": None,
        "migration": None,
    }
    body["media"] = _media(media, "media", body["locales"])
    return _validate_package({**body, "packageDigest": _canonical_digest(body)})


def upgrade_website_release_package(
    package: object,
    *,
    package_id: object,
    migration_id: object,
) -> dict[str, Any]:
    """Upgrade v1 to v2 while retaining every approved non-template digest."""

    previous = _validate_package(package)
    if previous["template"]["version"] != 1:
        raise _fail("Only the supported Website template v1 can upgrade to v2.")
    preserved = {
        name: _canonical_digest(previous[name])
        for name in ("source", "brand", "locales", "media", "roles")
    }
    migration = {
        "migrationId": _token(migration_id, "migration_id"),
        "fromPackageDigest": previous["packageDigest"],
        "fromTemplateVersion": 1,
        "toTemplateVersion": 2,
        "operations": list(_MIGRATION_OPERATIONS),
        "preserved": preserved,
    }
    body = {
        "contract": WEBSITE_RELEASE_PACKAGE_CONTRACT,
        "packageId": _token(package_id, "package_id"),
        "source": previous["source"],
        "template": website_release_template(2),
        "brand": previous["brand"],
        "locales": previous["locales"],
        "media": previous["media"],
        "roles": previous["roles"],
        "previousPackageDigest": previous["packageDigest"],
        "migration": migration,
    }
    return _validate_package({**body, "packageDigest": _canonical_digest(body)})


def normalize_website_domain_hostname(value: object) -> str:
    """Return one canonical public hostname without claiming ownership."""

    candidate = _text(value, "domain.hostname", maximum=253).lower()
    if "://" in candidate or any(marker in candidate for marker in "/?#@:"):
        raise _fail(
            "domain.hostname must be a hostname without a scheme, port, path, query, fragment, or credentials."
        )
    try:
        hostname = candidate.encode("idna").decode("ascii").lower()
    except UnicodeError as error:
        raise _fail("domain.hostname must be a valid public hostname.") from error
    if (
        not hostname
        or len(hostname) > 253
        or hostname.endswith(".")
        or ".." in hostname
    ):
        raise _fail("domain.hostname must be a canonical public hostname.")
    labels = hostname.split(".")
    if len(labels) < 2 or any(
        re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) is None
        for label in labels
    ):
        raise _fail("domain.hostname must contain valid DNS labels.")
    final_label = labels[-1]
    if len(final_label) < 2 or final_label.isdigit():
        raise _fail("domain.hostname must have a public top-level domain.")
    if hostname == "localhost" or hostname.endswith(
        (".localhost", ".local", ".test", ".invalid", ".example")
    ):
        raise _fail("domain.hostname must not use a local or reserved suffix.")
    return hostname


def _target(value: object, field: str) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise _fail(f"{field} must be an object.")
    has_domain = "domain" in value
    source = _object(
        value,
        field,
        (
            "provider",
            "projectRef",
            "environment",
            "protection",
            *(("domain",) if has_domain else ()),
        ),
    )
    if source["provider"] != "vercel" or source["environment"] != "production":
        raise _fail(f"{field} must describe the reviewed Vercel production target.")
    if source["protection"] != "required":
        raise _fail(f"{field}.protection must remain required.")
    target: dict[str, Any] = {
        "provider": "vercel",
        "projectRef": _token(source["projectRef"], f"{field}.projectRef"),
        "environment": "production",
        "protection": "required",
    }
    if has_domain:
        domain = _object(
            source["domain"],
            f"{field}.domain",
            (
                "hostname",
                "ownership",
                "dnsChange",
                "tls",
                "previewAcceptance",
                "ownerActivationApproval",
            ),
        )
        if (
            domain["ownership"] != "unverified_owner_supplied"
            or domain["dnsChange"] != "separate_owner_action"
            or domain["tls"] != "required"
            or domain["previewAcceptance"] != "required_before_activation"
            or domain["ownerActivationApproval"] != "required"
        ):
            raise _fail(f"{field}.domain must preserve every owner and activation gate.")
        target["domain"] = {
            "hostname": normalize_website_domain_hostname(domain["hostname"]),
            "ownership": "unverified_owner_supplied",
            "dnsChange": "separate_owner_action",
            "tls": "required",
            "previewAcceptance": "required_before_activation",
            "ownerActivationApproval": "required",
        }
    return target


def _previous_deployment(value: object, field: str) -> dict[str, str] | None:
    if value is None:
        return None
    source = _object(
        value, field, ("deploymentId", "packageDigest", "artifactDigest")
    )
    return {
        "deploymentId": _token(source["deploymentId"], f"{field}.deploymentId"),
        "packageDigest": _digest(
            source["packageDigest"], f"{field}.packageDigest"
        ),
        "artifactDigest": _digest(
            source["artifactDigest"], f"{field}.artifactDigest"
        ),
    }


def _command_payload(value: object, field: str) -> dict[str, Any]:
    if not isinstance(value, Mapping) or value.get("kind") not in _COMMAND_KINDS:
        raise _fail(f"{field}.kind is unsupported.")
    kind = value["kind"]
    if kind in {"prepare_package", "upgrade_template"}:
        source = _object(value, field, ("kind", "id", "package", "proof"))
        package = _validate_package(source["package"])
        command_id = _token(source["id"], f"{field}.id")
        expected_id = (
            package["packageId"]
            if kind == "prepare_package"
            else package["migration"]["migrationId"] if package["migration"] else None
        )
        if command_id != expected_id:
            raise _fail(f"{field}.id does not match its package evidence.")
        return {
            "kind": kind,
            "id": command_id,
            "package": package,
            "proof": _proof(source["proof"], f"{field}.proof"),
        }
    if kind == "approve_release":
        source = _object(
            value, field, ("kind", "id", "packageDigest", "note", "proof")
        )
        return {
            "kind": kind,
            "id": _token(source["id"], f"{field}.id"),
            "packageDigest": _digest(
                source["packageDigest"], f"{field}.packageDigest"
            ),
            "note": _text(source["note"], f"{field}.note", maximum=300),
            "proof": _proof(source["proof"], f"{field}.proof"),
        }
    source = _object(
        value,
        field,
        (
            "kind",
            "id",
            "packageDigest",
            "approvalId",
            "target",
            "previousDeployment",
            "proof",
        ),
    )
    return {
        "kind": kind,
        "id": _token(source["id"], f"{field}.id"),
        "packageDigest": _digest(
            source["packageDigest"], f"{field}.packageDigest"
        ),
        "approvalId": _token(source["approvalId"], f"{field}.approvalId"),
        "target": _target(source["target"], f"{field}.target"),
        "previousDeployment": _previous_deployment(
            source["previousDeployment"], f"{field}.previousDeployment"
        ),
        "proof": _proof(source["proof"], f"{field}.proof"),
    }


def _role_actor(package: Mapping[str, Any], role: str) -> str:
    return next(row["actor"] for row in package["roles"] if row["role"] == role)


def _assert_upgrade(previous: Mapping[str, Any], upgraded: Mapping[str, Any]) -> None:
    if previous["template"]["version"] != 1 or upgraded["template"]["version"] != 2:
        raise _fail("Website release template upgrade must be v1 to v2.")
    if upgraded["previousPackageDigest"] != previous["packageDigest"]:
        raise _fail("Website release template upgrade lost its previous package.")
    for field in ("source", "brand", "locales", "media", "roles"):
        if upgraded[field] != previous[field]:
            raise _fail(f"Website release template upgrade changed approved {field}.")


def _deploy_plan(
    package: Mapping[str, Any],
    approval: Mapping[str, Any],
    command: Mapping[str, Any],
) -> dict[str, Any]:
    previous = command["previousDeployment"]
    rollback = (
        {
            "mode": "promote_exact_previous_deployment",
            "deploymentId": previous["deploymentId"],
            "packageDigest": previous["packageDigest"],
            "artifactDigest": previous["artifactDigest"],
            "status": "not_executed",
            "ownerApprovalRequired": True,
        }
        if previous
        else {
            "mode": "blocked_until_previous_deployment_bound",
            "deploymentId": None,
            "packageDigest": None,
            "artifactDigest": None,
            "status": "not_executed",
            "ownerApprovalRequired": True,
        }
    )
    domain = command["target"].get("domain")
    steps = [
        {
            "sequence": 1,
            "action": "build_prebuilt_candidate",
            "gate": "local_release_contracts_pass",
            "authority": "release_manager_review",
        },
        {
            "sequence": 2,
            "action": "create_protected_preview",
            "gate": "exact_project_and_credentials_bound",
            "authority": "owner_credentialed_action",
        },
        {
            "sequence": 3,
            "action": "verify_exact_candidate",
            "gate": "health_logs_links_mobile_desktop_pass",
            "authority": "release_reviewer",
        },
    ]
    if domain:
        steps.append(
            {
                "sequence": 4,
                "action": "verify_domain_ownership_and_dns_plan",
                "gate": "owner_domain_control_and_provider_records_verified",
                "authority": "release_reviewer",
            }
        )
    steps.append(
        {
            "sequence": 5 if domain else 4,
            "action": "promote_exact_candidate",
            "gate": "single_use_owner_approval",
            "authority": "owner_only",
        }
    )
    if domain:
        steps.append(
            {
                "sequence": 6,
                "action": "attach_verified_domain_and_check_https",
                "gate": "separate_domain_activation_approval",
                "authority": "owner_only",
            }
        )
    domain_blockers = (
        [
            "domain_ownership_unverified",
            "preview_acceptance_missing",
            "dns_plan_unverified",
            "owner_activation_approval_missing",
        ]
        if domain
        else ["customer_domain_not_bound"]
    )
    return {
        "contract": WEBSITE_DEPLOY_PLAN_CONTRACT,
        "planId": command["id"],
        "status": "not_executed",
        "candidate": {
            "packageDigest": package["packageDigest"],
            "artifactDigest": package["source"]["artifactDigest"],
            "approvalId": approval["id"],
            "approvedLocales": [
                row["locale"] for row in package["locales"] if row["status"] == "approved"
            ],
        },
        "target": command["target"],
        "steps": steps,
        "rollback": rollback,
        "domainActivation": {
            "hostname": domain["hostname"] if domain else None,
            "status": "not_executed",
            "blockers": domain_blockers,
            "ownerApprovalRequired": True,
            "providerWritesPerformed": False,
            "dnsWritesPerformed": False,
        },
        "proof": command["proof"],
        "ownerApprovalRequired": True,
    }


def _empty_projection() -> dict[str, Any]:
    return {
        "status": "unprepared",
        "package": None,
        "approval": None,
        "deployPlan": None,
        "approvedLocales": [],
        "draftLocales": [],
    }


def _replay_commands(commands: list[dict[str, Any]], scope: str) -> dict[str, Any]:
    if not commands:
        return _empty_projection()
    package: dict[str, Any] | None = None
    approval: dict[str, Any] | None = None
    deploy_plan: dict[str, Any] | None = None
    for index, command in enumerate(commands):
        field = f"commands[{index}].payload"
        kind = command["kind"]
        if index == 0 and kind != "prepare_package":
            raise _fail("The first Website release command must prepare a package.")
        if kind == "prepare_package":
            if package is not None or index != 0:
                raise _fail(f"{field} attempts to replace the initial package.")
            if command["package"]["previousPackageDigest"] is not None:
                raise _fail(f"{field} cannot import forged migration lineage.")
            if command["package"]["source"]["scope"] != scope:
                raise _fail(f"{field} crosses the Website release workspace scope.")
            if command["proof"]["actor"] != _role_actor(
                command["package"], "release_manager"
            ):
                raise _fail(f"{field} actor is not the assigned release manager.")
            package = command["package"]
            continue
        if package is None:
            raise _fail(f"{field} has no prepared Website release package.")
        if kind == "upgrade_template":
            if approval is not None or deploy_plan is not None:
                raise _fail(f"{field} follows release review or planning.")
            _assert_upgrade(package, command["package"])
            if command["proof"]["actor"] != _role_actor(
                package, "release_manager"
            ):
                raise _fail(f"{field} actor is not the assigned release manager.")
            package = command["package"]
            continue
        if kind == "approve_release":
            if approval is not None:
                raise _fail(f"{field} attempts to approve the package twice.")
            if deploy_plan is not None or command["packageDigest"] != package["packageDigest"]:
                raise _fail(f"{field} references a stale Website release package.")
            if command["proof"]["actor"] != _role_actor(package, "release_reviewer"):
                raise _fail(f"{field} actor is not the assigned release reviewer.")
            approval = {
                "id": command["id"],
                "packageDigest": package["packageDigest"],
                "reviewer": command["proof"]["actor"],
                "note": command["note"],
                "proof": command["proof"],
            }
            continue
        if deploy_plan is not None:
            raise _fail(f"{field} attempts to replace the immutable deploy plan.")
        if approval is None or command["approvalId"] != approval["id"]:
            raise _fail(f"{field} requires the current release review.")
        if command["packageDigest"] != package["packageDigest"]:
            raise _fail(f"{field} references a stale Website release package.")
        if command["proof"]["actor"] != _role_actor(package, "release_manager"):
            raise _fail(f"{field} actor is not the assigned release manager.")
        previous = command["previousDeployment"]
        if previous and previous["packageDigest"] == package["packageDigest"]:
            raise _fail(f"{field} rollback target cannot equal the candidate package.")
        deploy_plan = _deploy_plan(package, approval, command)

    if package is None:
        raise _fail("Website release history lacks its package.")
    if deploy_plan:
        status = "plan_ready"
    elif approval:
        status = "ready_for_plan"
    else:
        status = "needs_release_review"
    return {
        "status": status,
        "package": package,
        "approval": approval,
        "deployPlan": deploy_plan,
        "approvedLocales": [
            row["locale"] for row in package["locales"] if row["status"] == "approved"
        ],
        "draftLocales": [
            row["locale"] for row in package["locales"] if row["status"] == "draft"
        ],
    }


def create_empty_website_release_state(scope: object) -> dict[str, Any]:
    return {
        "schema": WEBSITE_RELEASE_STATE_SCHEMA,
        "scope": _token(scope, "scope"),
        "revision": 0,
        "headDigest": EMPTY_WEBSITE_RELEASE_DIGEST,
        "commands": [],
    }


def validate_website_release_state(value: object) -> dict[str, Any]:
    """Validate the append-only Website release command chain."""

    source = _object(
        value,
        "Website release state",
        ("schema", "scope", "revision", "headDigest", "commands"),
    )
    if source["schema"] != WEBSITE_RELEASE_STATE_SCHEMA:
        raise _fail("Website release state.schema is unsupported.")
    scope = _token(source["scope"], "Website release state.scope")
    revision = _integer(source["revision"], "Website release state.revision")
    head_digest = _digest(source["headDigest"], "Website release state.headDigest")
    raw_commands = _array(
        source["commands"], "Website release state.commands", maximum=_MAX_COMMANDS
    )
    if revision != len(raw_commands):
        raise _fail("Website release state.revision must equal its command count.")
    commands: list[dict[str, Any]] = []
    command_ids: list[str] = []
    action_ids: list[str] = []
    prior_digest = EMPTY_WEBSITE_RELEASE_DIGEST
    prior_timestamp: datetime | None = None
    for index, candidate in enumerate(raw_commands):
        field = f"Website release state.commands[{index}]"
        envelope = _object(
            candidate, field, ("sequence", "previousDigest", "payload", "digest")
        )
        sequence = _integer(envelope["sequence"], f"{field}.sequence", minimum=1)
        if sequence != index + 1:
            raise _fail(f"{field}.sequence is not contiguous.")
        previous_digest = _digest(
            envelope["previousDigest"], f"{field}.previousDigest"
        )
        if previous_digest != prior_digest:
            raise _fail(f"{field}.previousDigest breaks the command chain.")
        payload = _command_payload(envelope["payload"], f"{field}.payload")
        payload_timestamp = datetime.fromisoformat(
            payload["proof"]["capturedAt"].replace("Z", "+00:00")
        )
        if prior_timestamp is not None and payload_timestamp < prior_timestamp:
            raise _fail(f"{field}.payload.proof.capturedAt moves backwards.")
        body = {
            "sequence": sequence,
            "previousDigest": previous_digest,
            "payload": payload,
        }
        digest = _digest(envelope["digest"], f"{field}.digest")
        if digest != _canonical_digest(body):
            raise _fail(f"{field}.digest does not match its command evidence.")
        commands.append({**body, "digest": digest})
        command_ids.append(payload["id"])
        action_ids.append(payload["proof"]["actionId"])
        prior_digest = digest
        prior_timestamp = payload_timestamp
    _unique(command_ids, "Website release command IDs")
    _unique(action_ids, "Website release action IDs")
    expected_head = prior_digest if commands else EMPTY_WEBSITE_RELEASE_DIGEST
    if head_digest != expected_head:
        raise _fail("Website release state.headDigest does not match its command chain.")
    _replay_commands([command["payload"] for command in commands], scope)
    return _canonical_copy(
        {
            "schema": WEBSITE_RELEASE_STATE_SCHEMA,
            "scope": scope,
            "revision": revision,
            "headDigest": head_digest,
            "commands": commands,
        }
    )


def project_website_release(state: object) -> dict[str, Any]:
    validated = validate_website_release_state(state)
    projection = _replay_commands(
        [command["payload"] for command in validated["commands"]],
        validated["scope"],
    )
    return _canonical_copy(
        {
            "contract": WEBSITE_RELEASE_PROJECTION_CONTRACT,
            "scope": validated["scope"],
            "revision": validated["revision"],
            "headDigest": validated["headDigest"],
            **projection,
        }
    )


def _append_command(
    state: object,
    payload: object,
    *,
    expected_head_digest: object,
) -> dict[str, Any]:
    current = validate_website_release_state(state)
    canonical_payload = _command_payload(payload, "command payload")
    for command in current["commands"]:
        existing = command["payload"]
        if existing["id"] != canonical_payload["id"]:
            continue
        if existing != canonical_payload:
            raise _fail("The Website release command ID was reused with different evidence.")
        return {"state": current, "replayed": True}
    expected = _digest(expected_head_digest, "expected_head_digest")
    if expected != current["headDigest"]:
        raise _fail("The Website release snapshot changed before this command was applied.")
    sequence = current["revision"] + 1
    body = {
        "sequence": sequence,
        "previousDigest": current["headDigest"],
        "payload": canonical_payload,
    }
    envelope = {**body, "digest": _canonical_digest(body)}
    candidate = {
        "schema": WEBSITE_RELEASE_STATE_SCHEMA,
        "scope": current["scope"],
        "revision": sequence,
        "headDigest": envelope["digest"],
        "commands": [*current["commands"], envelope],
    }
    return {"state": validate_website_release_state(candidate), "replayed": False}


def prepare_website_release_package(
    state: object,
    package: object,
    proof: object,
    *,
    expected_head_digest: object,
) -> dict[str, Any]:
    reviewed = _validate_package(package)
    return _append_command(
        state,
        {
            "kind": "prepare_package",
            "id": reviewed["packageId"],
            "package": reviewed,
            "proof": _proof(proof, "proof"),
        },
        expected_head_digest=expected_head_digest,
    )


def apply_website_template_upgrade(
    state: object,
    package: object,
    proof: object,
    *,
    expected_head_digest: object,
) -> dict[str, Any]:
    upgraded = _validate_package(package)
    if upgraded["migration"] is None:
        raise _fail("Website template upgrade requires migration evidence.")
    return _append_command(
        state,
        {
            "kind": "upgrade_template",
            "id": upgraded["migration"]["migrationId"],
            "package": upgraded,
            "proof": _proof(proof, "proof"),
        },
        expected_head_digest=expected_head_digest,
    )


def approve_website_release_package(
    state: object,
    *,
    approval_id: object,
    package_digest: object,
    note: object,
    proof: object,
    expected_head_digest: object,
) -> dict[str, Any]:
    return _append_command(
        state,
        {
            "kind": "approve_release",
            "id": approval_id,
            "packageDigest": package_digest,
            "note": note,
            "proof": _proof(proof, "proof"),
        },
        expected_head_digest=expected_head_digest,
    )


def prepare_website_deploy_plan(
    state: object,
    *,
    plan_id: object,
    package_digest: object,
    approval_id: object,
    target: object,
    previous_deployment: object,
    proof: object,
    expected_head_digest: object,
) -> dict[str, Any]:
    return _append_command(
        state,
        {
            "kind": "prepare_deploy_plan",
            "id": plan_id,
            "packageDigest": package_digest,
            "approvalId": approval_id,
            "target": target,
            "previousDeployment": previous_deployment,
            "proof": _proof(proof, "proof"),
        },
        expected_head_digest=expected_head_digest,
    )


__all__ = (
    "EMPTY_WEBSITE_RELEASE_DIGEST",
    "WEBSITE_BRAND_TOKEN_CONTRACT",
    "WEBSITE_DEPLOY_PLAN_CONTRACT",
    "WEBSITE_RELEASE_PACKAGE_CONTRACT",
    "WEBSITE_RELEASE_PROJECTION_CONTRACT",
    "WEBSITE_RELEASE_STATE_SCHEMA",
    "WebsiteReleaseValidationError",
    "apply_website_template_upgrade",
    "approve_website_release_package",
    "build_website_release_package",
    "create_empty_website_release_state",
    "prepare_website_deploy_plan",
    "normalize_website_domain_hostname",
    "prepare_website_release_package",
    "project_website_release",
    "upgrade_website_release_package",
    "validate_website_release_state",
    "website_release_evidence_digest",
    "website_release_template",
)
