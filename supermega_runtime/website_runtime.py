"""Fail-closed Website workspace validation for managed SuperMega trials."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from copy import deepcopy
from datetime import datetime, timezone
import json
import re
from typing import Any
from urllib.parse import urlsplit

from supermega_runtime.trial_store import TrialValidationError


WEBSITE_SCHEMA = "supermega.website.workspace.v2"
WEBSITE_EVENTS = frozenset(
    {
        "website.workspace.initialized",
        "website.content.saved",
        "website.selection.changed",
        "website.evidence.recorded",
        "website.revision.approved",
        "website.snapshot.recorded",
    }
)
WEBSITE_HUMAN_EVENTS = frozenset(
    {
        "website.evidence.recorded",
        "website.revision.approved",
        "website.snapshot.recorded",
    }
)

_MAX_SAFE_INTEGER = 9_007_199_254_740_991
_MAX_PAGES = 4
_MAX_SECTIONS = 4
_EVIDENCE_KINDS = frozenset({"content", "responsive", "links"})
_WORKFLOW_ACTIONS = frozenset(
    {
        "publish_evidence_recorded",
        "website_revision_approved",
        "local_snapshot_recorded",
    }
)
_FINGERPRINT = re.compile(r"^web-[a-f0-9]{8}$")
_SLUG = re.compile(r"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*/?)*$")
_JS_TRIM_CHARACTERS = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"

_STATE_FIELDS = frozenset(
    {
        "schema",
        "version",
        "revision",
        "contentRevision",
        "siteName",
        "pages",
        "selectedPageId",
        "evidence",
        "approvals",
        "localPublishes",
        "events",
    }
)
_PAGE_FIELDS = frozenset(
    {"id", "internalName", "slug", "stage", "navigation", "hero", "sections", "seo", "updatedAt"}
)
_NAVIGATION_FIELDS = frozenset({"label", "visible"})
_HERO_FIELDS = frozenset({"eyebrow", "headline", "summary", "ctaLabel", "ctaHref"})
_SECTION_FIELDS = frozenset({"id", "eyebrow", "title", "body"})
_SEO_FIELDS = frozenset({"title", "description"})
_SOURCE_FIELDS = frozenset({"contentRevision", "digest"})
_ARTIFACT_FIELDS = frozenset({"schema", "siteName", "fingerprint", "contentDigest", "source", "pages"})
_ARTIFACT_PAGE_FIELDS = frozenset({"id", "slug", "navigation", "hero", "sections", "seo"})
_EVIDENCE_FIELDS = frozenset(
    {"id", "kind", "finding", "reference", "verifiedBy", "verifiedAt", "fingerprint", "source", "migratedFromV1"}
)
_APPROVAL_FIELDS = frozenset(
    {"id", "reviewer", "note", "approvedAt", "fingerprint", "evidenceIds", "source", "migratedFromV1"}
)
_PUBLISH_FIELDS = frozenset(
    {
        "id",
        "recordedAt",
        "recordedBy",
        "fingerprint",
        "readyPageIds",
        "approvalId",
        "evidenceIds",
        "source",
        "migratedFromV1",
        "artifact",
    }
)
_METADATA_ONLY_PUBLISH_FIELDS = _PUBLISH_FIELDS - {"artifact"}
_COMMERCE_INTAKE_SOURCE_FIELDS = frozenset(
    {"fingerprint", "approvalId", "snapshotId", "pageId", "siteName", "pagePath"}
)
_EVENT_FIELDS = frozenset(
    {"id", "createdAt", "actorKind", "actor", "action", "subjectId", "reason", "evidenceReference", "source"}
)
_COMMAND_EVIDENCE_FIELDS = frozenset({"actionId", "capturedAt", "actor", "reason", "evidenceReference"})


def _object(value: object, field: str) -> dict[str, Any]:
    if not isinstance(value, Mapping) or any(not isinstance(key, str) for key in value):
        raise TrialValidationError(f"{field} must be an object with string keys.")
    return dict(value)


def _exact(value: Mapping[str, Any], field: str, expected: frozenset[str]) -> None:
    actual = set(value)
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    if missing:
        raise TrialValidationError(f"{field} is missing fields: {', '.join(missing)}.")
    if extra:
        raise TrialValidationError(f"{field} has unsupported fields: {', '.join(extra)}.")


def _text(value: object, field: str, *, maximum: int, allow_blank: bool = False) -> str:
    if not isinstance(value, str) or len(value) > maximum or (not allow_blank and not _js_trim(value)):
        raise TrialValidationError(f"{field} must be text of at most {maximum} characters.")
    try:
        value.encode("utf-8")
    except UnicodeEncodeError as exc:
        raise TrialValidationError(f"{field} must contain valid Unicode text.") from exc
    return value


def _js_trim(value: str) -> str:
    return value.strip(_JS_TRIM_CHARACTERS)


def _integer(value: object, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= _MAX_SAFE_INTEGER:
        raise TrialValidationError(f"{field} must be a non-negative safe integer.")
    return value


def _timestamp(value: object, field: str) -> str:
    timestamp = _text(value, field, maximum=40)
    try:
        parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError as exc:
        raise TrialValidationError(f"{field} must be an ISO-8601 timestamp.") from exc
    if parsed.tzinfo is None:
        raise TrialValidationError(f"{field} must be a canonical timezone-aware ISO-8601 timestamp.")
    canonical = parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    if canonical != timestamp:
        raise TrialValidationError(f"{field} must be a canonical timezone-aware ISO-8601 timestamp.")
    return timestamp


def _timestamp_value(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _array(value: object, field: str) -> list[Any]:
    if not isinstance(value, list):
        raise TrialValidationError(f"{field} must be an array.")
    return value


def _unique(values: Sequence[str], field: str) -> None:
    if len(values) != len(set(values)):
        raise TrialValidationError(f"{field} values must be unique.")


def _source(value: object, field: str) -> dict[str, Any]:
    source = _object(value, field)
    _exact(source, field, _SOURCE_FIELDS)
    _integer(source["contentRevision"], f"{field}.contentRevision")
    digest = _text(source["digest"], f"{field}.digest", maximum=12)
    if not _FINGERPRINT.fullmatch(digest):
        raise TrialValidationError(f"{field}.digest must be a Website fingerprint.")
    return source


def _same_source(left: Mapping[str, Any], right: Mapping[str, Any]) -> bool:
    return left.get("contentRevision") == right.get("contentRevision") and left.get("digest") == right.get("digest")


def _same_string_set(left: Sequence[str], right: Sequence[str]) -> bool:
    return len(left) == len(right) and set(left) == set(right)


def _canonical_digest(value: object) -> str:
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    data = encoded.encode("utf-16-le", errors="surrogatepass")
    digest = 2_166_136_261
    for index in range(0, len(data), 2):
        digest ^= data[index] | (data[index + 1] << 8)
        digest = (digest * 16_777_619) & 0xFFFFFFFF
    return f"{digest:08x}"


def _website_fingerprint(state: Mapping[str, Any]) -> str:
    publishable = {
        "siteName": _js_trim(str(state["siteName"])),
        "pages": [
            {
                "id": page["id"],
                "internalName": page["internalName"],
                "slug": page["slug"],
                "stage": page["stage"],
                "navigation": page["navigation"],
                "hero": page["hero"],
                "sections": page["sections"],
                "seo": page["seo"],
            }
            for page in state["pages"]
        ],
    }
    return f"web-{_canonical_digest(publishable)}"


def _website_artifact(state: Mapping[str, Any]) -> dict[str, Any]:
    source = {
        "contentRevision": state["contentRevision"],
        "digest": _website_fingerprint(state),
    }
    content = {
        "schema": "supermega.website.artifact.v1",
        "siteName": state["siteName"],
        "fingerprint": source["digest"],
        "source": source,
        "pages": [
            {
                "id": page["id"],
                "slug": _js_trim(str(page["slug"])).rstrip("/") or "/",
                "navigation": deepcopy(page["navigation"]),
                "hero": deepcopy(page["hero"]),
                "sections": deepcopy(page["sections"]),
                "seo": deepcopy(page["seo"]),
            }
            for page in state["pages"]
            if page["stage"] == "ready"
        ],
    }
    return {**content, "contentDigest": f"site-{_canonical_digest(content)}"}


def _page_anchor(path: str) -> str:
    return "home" if path == "/" else path.removeprefix("/").replace("/", "-")


def _safe_https_destination(value: str) -> bool:
    try:
        parsed = urlsplit(value)
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and bool(parsed.hostname)
        and parsed.username is None
        and parsed.password is None
    )


def _validate_page(value: object, field: str) -> dict[str, Any]:
    page = _object(value, field)
    _exact(page, field, _PAGE_FIELDS)
    _text(page["id"], f"{field}.id", maximum=80)
    _text(page["internalName"], f"{field}.internalName", maximum=60, allow_blank=True)
    _text(page["slug"], f"{field}.slug", maximum=100, allow_blank=True)
    if page["stage"] not in {"draft", "ready"}:
        raise TrialValidationError(f"{field}.stage must be draft or ready.")

    navigation = _object(page["navigation"], f"{field}.navigation")
    _exact(navigation, f"{field}.navigation", _NAVIGATION_FIELDS)
    _text(navigation["label"], f"{field}.navigation.label", maximum=40, allow_blank=True)
    if not isinstance(navigation["visible"], bool):
        raise TrialValidationError(f"{field}.navigation.visible must be boolean.")

    hero = _object(page["hero"], f"{field}.hero")
    _exact(hero, f"{field}.hero", _HERO_FIELDS)
    for name, maximum in (("eyebrow", 80), ("headline", 140), ("summary", 280), ("ctaLabel", 40), ("ctaHref", 160)):
        _text(hero[name], f"{field}.hero.{name}", maximum=maximum, allow_blank=True)

    sections = _array(page["sections"], f"{field}.sections")
    if len(sections) > _MAX_SECTIONS:
        raise TrialValidationError(f"{field}.sections exceeds the {_MAX_SECTIONS}-section limit.")
    section_ids: list[str] = []
    for index, candidate in enumerate(sections):
        section = _object(candidate, f"{field}.sections[{index}]")
        _exact(section, f"{field}.sections[{index}]", _SECTION_FIELDS)
        section_ids.append(_text(section["id"], f"{field}.sections[{index}].id", maximum=80))
        _text(section["eyebrow"], f"{field}.sections[{index}].eyebrow", maximum=60, allow_blank=True)
        _text(section["title"], f"{field}.sections[{index}].title", maximum=120, allow_blank=True)
        _text(section["body"], f"{field}.sections[{index}].body", maximum=360, allow_blank=True)
    _unique(section_ids, f"{field} section ID")

    seo = _object(page["seo"], f"{field}.seo")
    _exact(seo, f"{field}.seo", _SEO_FIELDS)
    _text(seo["title"], f"{field}.seo.title", maximum=70, allow_blank=True)
    _text(seo["description"], f"{field}.seo.description", maximum=160, allow_blank=True)
    _timestamp(page["updatedAt"], f"{field}.updatedAt")
    return page


def _validate_evidence(value: object, field: str) -> dict[str, Any]:
    evidence = _object(value, field)
    _exact(evidence, field, _EVIDENCE_FIELDS)
    _text(evidence["id"], f"{field}.id", maximum=100)
    if evidence["kind"] not in _EVIDENCE_KINDS:
        raise TrialValidationError(f"{field}.kind is unsupported.")
    _text(evidence["finding"], f"{field}.finding", maximum=180)
    _text(evidence["reference"], f"{field}.reference", maximum=220)
    _text(evidence["verifiedBy"], f"{field}.verifiedBy", maximum=80)
    _timestamp(evidence["verifiedAt"], f"{field}.verifiedAt")
    fingerprint = _text(evidence["fingerprint"], f"{field}.fingerprint", maximum=12)
    source = _source(evidence["source"], f"{field}.source")
    if fingerprint != source["digest"]:
        raise TrialValidationError(f"{field}.fingerprint must match its source digest.")
    if not isinstance(evidence["migratedFromV1"], bool):
        raise TrialValidationError(f"{field}.migratedFromV1 must be boolean.")
    return evidence


def _validate_approval(value: object, field: str) -> dict[str, Any]:
    approval = _object(value, field)
    _exact(approval, field, _APPROVAL_FIELDS)
    _text(approval["id"], f"{field}.id", maximum=100)
    _text(approval["reviewer"], f"{field}.reviewer", maximum=80)
    _text(approval["note"], f"{field}.note", maximum=240)
    _timestamp(approval["approvedAt"], f"{field}.approvedAt")
    fingerprint = _text(approval["fingerprint"], f"{field}.fingerprint", maximum=12)
    evidence_ids = _array(approval["evidenceIds"], f"{field}.evidenceIds")
    for index, item in enumerate(evidence_ids):
        _text(item, f"{field}.evidenceIds[{index}]", maximum=100)
    _unique(evidence_ids, f"{field}.evidenceIds")
    source = _source(approval["source"], f"{field}.source")
    if fingerprint != source["digest"]:
        raise TrialValidationError(f"{field}.fingerprint must match its source digest.")
    if not isinstance(approval["migratedFromV1"], bool):
        raise TrialValidationError(f"{field}.migratedFromV1 must be boolean.")
    return approval


def _validate_artifact_page(value: object, field: str) -> dict[str, Any]:
    page = _object(value, field)
    _exact(page, field, _ARTIFACT_PAGE_FIELDS)
    _text(page["id"], f"{field}.id", maximum=80)
    slug = _text(page["slug"], f"{field}.slug", maximum=100)
    if not _SLUG.fullmatch(slug) or (slug.rstrip("/") or "/") != slug:
        raise TrialValidationError(f"{field}.slug must be a canonical site path.")

    navigation = _object(page["navigation"], f"{field}.navigation")
    _exact(navigation, f"{field}.navigation", _NAVIGATION_FIELDS)
    _text(navigation["label"], f"{field}.navigation.label", maximum=40, allow_blank=True)
    if not isinstance(navigation["visible"], bool):
        raise TrialValidationError(f"{field}.navigation.visible must be boolean.")

    hero = _object(page["hero"], f"{field}.hero")
    _exact(hero, f"{field}.hero", _HERO_FIELDS)
    _text(hero["eyebrow"], f"{field}.hero.eyebrow", maximum=80, allow_blank=True)
    _text(hero["headline"], f"{field}.hero.headline", maximum=140)
    _text(hero["summary"], f"{field}.hero.summary", maximum=280)
    _text(hero["ctaLabel"], f"{field}.hero.ctaLabel", maximum=40, allow_blank=True)
    _text(hero["ctaHref"], f"{field}.hero.ctaHref", maximum=160, allow_blank=True)
    if bool(_js_trim(hero["ctaLabel"])) != bool(_js_trim(hero["ctaHref"])):
        raise TrialValidationError(f"{field}.hero CTA label and destination must be completed together.")

    sections = _array(page["sections"], f"{field}.sections")
    if not 1 <= len(sections) <= _MAX_SECTIONS:
        raise TrialValidationError(f"{field}.sections requires between 1 and {_MAX_SECTIONS} sections.")
    section_ids: list[str] = []
    for index, candidate in enumerate(sections):
        section = _object(candidate, f"{field}.sections[{index}]")
        _exact(section, f"{field}.sections[{index}]", _SECTION_FIELDS)
        section_ids.append(_text(section["id"], f"{field}.sections[{index}].id", maximum=80))
        _text(section["eyebrow"], f"{field}.sections[{index}].eyebrow", maximum=60, allow_blank=True)
        _text(section["title"], f"{field}.sections[{index}].title", maximum=120)
        _text(section["body"], f"{field}.sections[{index}].body", maximum=360)
    _unique(section_ids, f"{field} section ID")

    seo = _object(page["seo"], f"{field}.seo")
    _exact(seo, f"{field}.seo", _SEO_FIELDS)
    _text(seo["title"], f"{field}.seo.title", maximum=70)
    _text(seo["description"], f"{field}.seo.description", maximum=160)
    return page


def _validate_artifact(value: object, field: str) -> dict[str, Any]:
    artifact = _object(value, field)
    _exact(artifact, field, _ARTIFACT_FIELDS)
    if artifact["schema"] != "supermega.website.artifact.v1":
        raise TrialValidationError(f"{field}.schema is unsupported.")
    _text(artifact["siteName"], f"{field}.siteName", maximum=60)
    fingerprint = _text(artifact["fingerprint"], f"{field}.fingerprint", maximum=12)
    if not _FINGERPRINT.fullmatch(fingerprint):
        raise TrialValidationError(f"{field}.fingerprint must be a Website fingerprint.")
    content_digest = _text(artifact["contentDigest"], f"{field}.contentDigest", maximum=13)
    if not re.fullmatch(r"site-[a-f0-9]{8}", content_digest):
        raise TrialValidationError(f"{field}.contentDigest must be a site artifact digest.")
    source = _source(artifact["source"], f"{field}.source")
    if fingerprint != source["digest"]:
        raise TrialValidationError(f"{field}.fingerprint must match its source digest.")
    pages = [
        _validate_artifact_page(item, f"{field}.pages[{index}]")
        for index, item in enumerate(_array(artifact["pages"], f"{field}.pages"))
    ]
    if not 1 <= len(pages) <= _MAX_PAGES:
        raise TrialValidationError(f"{field}.pages requires between 1 and {_MAX_PAGES} ready pages.")
    _unique([page["id"] for page in pages], f"{field} page ID")
    _unique([page["slug"] for page in pages], f"{field} page path")
    _unique(
        [section["id"] for page in pages for section in page["sections"]],
        f"{field} section ID",
    )
    if sum(page["slug"] == "/" for page in pages) != 1:
        raise TrialValidationError(f"{field} must contain exactly one home page.")
    if not any(page["navigation"]["visible"] for page in pages):
        raise TrialValidationError(f"{field} must contain visible navigation.")
    ready_paths = {page["slug"] for page in pages}
    ready_anchors = {_page_anchor(path) for path in ready_paths}
    for page in pages:
        destination = _js_trim(page["hero"]["ctaHref"])
        if destination and not (
            (destination.startswith("#") and destination[1:] in ready_anchors)
            or _safe_https_destination(destination)
            or (destination.startswith("/") and (destination.rstrip("/") or "/") in ready_paths)
        ):
            raise TrialValidationError(f"{field} contains an unsafe or unavailable CTA destination.")
    content = {key: value for key, value in artifact.items() if key != "contentDigest"}
    if content_digest != f"site-{_canonical_digest(content)}":
        raise TrialValidationError(f"{field}.contentDigest does not match the retained artifact.")
    return artifact


def _validate_publish(value: object, field: str) -> dict[str, Any]:
    publish = _object(value, field)
    if set(publish) == _METADATA_ONLY_PUBLISH_FIELDS:
        publish["artifact"] = None
    _exact(publish, field, _PUBLISH_FIELDS)
    _text(publish["id"], f"{field}.id", maximum=100)
    _timestamp(publish["recordedAt"], f"{field}.recordedAt")
    _text(publish["recordedBy"], f"{field}.recordedBy", maximum=80)
    fingerprint = _text(publish["fingerprint"], f"{field}.fingerprint", maximum=12)
    for list_field, maximum in (("readyPageIds", 80), ("evidenceIds", 100)):
        values = _array(publish[list_field], f"{field}.{list_field}")
        for index, item in enumerate(values):
            _text(item, f"{field}.{list_field}[{index}]", maximum=maximum)
        _unique(values, f"{field}.{list_field}")
    if publish["approvalId"] is not None:
        _text(publish["approvalId"], f"{field}.approvalId", maximum=100)
    source = _source(publish["source"], f"{field}.source")
    if fingerprint != source["digest"]:
        raise TrialValidationError(f"{field}.fingerprint must match its source digest.")
    if not isinstance(publish["migratedFromV1"], bool):
        raise TrialValidationError(f"{field}.migratedFromV1 must be boolean.")
    if publish["artifact"] is not None:
        artifact = _validate_artifact(publish["artifact"], f"{field}.artifact")
        if (
            artifact["fingerprint"] != fingerprint
            or not _same_source(artifact["source"], source)
            or not _same_string_set(
                [page["id"] for page in artifact["pages"]],
                publish["readyPageIds"],
            )
        ):
            raise TrialValidationError(f"{field}.artifact must match the retained snapshot.")
    return publish


def _validate_workflow_event(value: object, field: str) -> dict[str, Any]:
    event = _object(value, field)
    _exact(event, field, _EVENT_FIELDS)
    _text(event["id"], f"{field}.id", maximum=120)
    _timestamp(event["createdAt"], f"{field}.createdAt")
    if event["actorKind"] != "human":
        raise TrialValidationError(f"{field}.actorKind must be human.")
    _text(event["actor"], f"{field}.actor", maximum=80)
    if event["action"] not in _WORKFLOW_ACTIONS:
        raise TrialValidationError(f"{field}.action is unsupported.")
    _text(event["subjectId"], f"{field}.subjectId", maximum=100)
    _text(event["reason"], f"{field}.reason", maximum=240)
    _text(event["evidenceReference"], f"{field}.evidenceReference", maximum=320)
    _source(event["source"], f"{field}.source")
    return event


def validate_website_state(value: object) -> dict[str, Any]:
    """Validate one Website snapshot structurally; command history establishes managed provenance."""

    state = _object(value, "website state")
    _exact(state, "website state", _STATE_FIELDS)
    if state["schema"] != WEBSITE_SCHEMA or state["version"] != 2:
        raise TrialValidationError(f"website state must use {WEBSITE_SCHEMA} version 2.")
    revision = _integer(state["revision"], "website state.revision")
    content_revision = _integer(state["contentRevision"], "website state.contentRevision")
    if content_revision > revision:
        raise TrialValidationError("website contentRevision cannot exceed revision.")
    _text(state["siteName"], "website state.siteName", maximum=60, allow_blank=True)

    pages = _array(state["pages"], "website state.pages")
    if not 1 <= len(pages) <= _MAX_PAGES:
        raise TrialValidationError(f"website state requires between 1 and {_MAX_PAGES} pages.")
    page_ids: list[str] = []
    section_ids: list[str] = []
    for index, candidate in enumerate(pages):
        page = _validate_page(candidate, f"pages[{index}]")
        page_ids.append(page["id"])
        section_ids.extend(section["id"] for section in page["sections"])
    _unique(page_ids, "Page ID")
    _unique(section_ids, "Section ID")
    selected_page_id = _text(state["selectedPageId"], "website state.selectedPageId", maximum=80)
    if selected_page_id not in page_ids:
        raise TrialValidationError("website selectedPageId must reference an existing page.")

    evidence = [_validate_evidence(item, f"evidence[{index}]") for index, item in enumerate(_array(state["evidence"], "website state.evidence"))]
    approvals = [_validate_approval(item, f"approvals[{index}]") for index, item in enumerate(_array(state["approvals"], "website state.approvals"))]
    publishes = [_validate_publish(item, f"localPublishes[{index}]") for index, item in enumerate(_array(state["localPublishes"], "website state.localPublishes"))]
    release_records = [*evidence, *approvals, *publishes]
    if any(item["migratedFromV1"] for item in release_records):
        raise TrialValidationError(
            "Website legacy release claims are not trusted; retain the source backup and record current review evidence."
        )
    confirmed_release_count = revision - content_revision
    if len(release_records) > confirmed_release_count:
        raise TrialValidationError("Website revision history does not match its release records.")
    events = [_validate_workflow_event(item, f"events[{index}]") for index, item in enumerate(_array(state["events"], "website state.events"))]
    for values, field in ((evidence, "Evidence ID"), (approvals, "Approval ID"), (publishes, "Publish ID"), (events, "Event ID")):
        _unique([item["id"] for item in values], field)
    _unique([item["subjectId"] for item in events], "Event subject ID")

    source_records = [*evidence, *approvals, *publishes, *events]
    if any(item["source"]["contentRevision"] > content_revision for item in source_records):
        raise TrialValidationError("Website evidence cannot reference a future content revision.")

    evidence_by_id = {item["id"]: item for item in evidence}
    approval_by_id = {item["id"]: item for item in approvals}
    event_by_subject = {item["subjectId"]: item for item in events}
    for item in evidence:
        if item["migratedFromV1"]:
            continue
        event = event_by_subject.get(item["id"])
        if not event or not (
            event["action"] == "publish_evidence_recorded"
            and event["actor"] == item["verifiedBy"]
            and event["createdAt"] == item["verifiedAt"]
            and event["reason"] == item["finding"]
            and event["evidenceReference"] == item["reference"]
            and _same_source(event["source"], item["source"])
        ):
            raise TrialValidationError("Website evidence must have one matching workflow event.")

    for item in approvals:
        bound = [evidence_by_id.get(identifier) for identifier in item["evidenceIds"]]
        if any(entry is None for entry in bound):
            raise TrialValidationError("Website approval references unknown evidence.")
        if item["migratedFromV1"]:
            continue
        event = event_by_subject.get(item["id"])
        kinds = {entry["kind"] for entry in bound if entry is not None}
        if not (
            len(item["evidenceIds"]) == len(_EVIDENCE_KINDS)
            and kinds == _EVIDENCE_KINDS
            and all(entry is not None and _same_source(entry["source"], item["source"]) for entry in bound)
            and event
            and event["action"] == "website_revision_approved"
            and event["actor"] == item["reviewer"]
            and event["createdAt"] == item["approvedAt"]
            and event["reason"] == item["note"]
            and event["evidenceReference"] == ",".join(item["evidenceIds"])
            and _same_source(event["source"], item["source"])
        ):
            raise TrialValidationError("Website approval must bind all current evidence and its workflow event.")

    page_id_set = set(page_ids)
    for item in publishes:
        if any(identifier not in evidence_by_id for identifier in item["evidenceIds"]):
            raise TrialValidationError("Website snapshot references unknown evidence.")
        if item["artifact"] is None and any(identifier not in page_id_set for identifier in item["readyPageIds"]):
            raise TrialValidationError("Website snapshot references an unknown page.")
        if item["migratedFromV1"]:
            continue
        approval = approval_by_id.get(item["approvalId"])
        event = event_by_subject.get(item["id"])
        if not (
            approval
            and _same_source(approval["source"], item["source"])
            and _same_string_set(item["evidenceIds"], approval["evidenceIds"])
            and item["recordedBy"] == approval["reviewer"]
            and _timestamp_value(item["recordedAt"]) >= _timestamp_value(approval["approvedAt"])
            and event
            and event["action"] == "local_snapshot_recorded"
            and event["actor"] == item["recordedBy"]
            and event["createdAt"] == item["recordedAt"]
            and event["evidenceReference"] == item["approvalId"]
            and _same_source(event["source"], item["source"])
        ):
            raise TrialValidationError("Website snapshot must bind its approval, evidence, and workflow event.")
    validated = deepcopy(state)
    validated["localPublishes"] = deepcopy(publishes)
    return validated


def validate_website_snapshot_source(
    website_state: object,
    source_value: object,
) -> dict[str, Any]:
    """Require a Commerce intake source to name retained managed Website proof."""

    state = validate_website_state(website_state)
    source = _object(source_value, "commerce Website source")
    _exact(source, "commerce Website source", _COMMERCE_INTAKE_SOURCE_FIELDS)
    fingerprint = _text(source["fingerprint"], "commerce Website source.fingerprint", maximum=12)
    if not _FINGERPRINT.fullmatch(fingerprint):
        raise TrialValidationError("commerce Website source.fingerprint must be a Website fingerprint.")
    approval_id = _text(source["approvalId"], "commerce Website source.approvalId", maximum=160)
    snapshot_id = _text(source["snapshotId"], "commerce Website source.snapshotId", maximum=160)
    page_id = _text(source["pageId"], "commerce Website source.pageId", maximum=160)
    _text(source["siteName"], "commerce Website source.siteName", maximum=160)
    page_path = _text(source["pagePath"], "commerce Website source.pagePath", maximum=160)
    if not page_path.startswith("/"):
        raise TrialValidationError("commerce Website source.pagePath must be absolute.")

    snapshots = [record for record in state["localPublishes"] if record["id"] == snapshot_id]
    approvals = [record for record in state["approvals"] if record["id"] == approval_id]
    if len(snapshots) != 1 or len(approvals) != 1:
        raise TrialValidationError("commerce Website source must reference one retained snapshot and approval.")
    snapshot = snapshots[0]
    approval = approvals[0]
    current_pages = [page for page in state["pages"] if page["id"] == page_id]
    current_source = {"contentRevision": state["contentRevision"], "digest": fingerprint}
    if (
        snapshot["migratedFromV1"]
        or snapshot["artifact"] is None
        or approval["migratedFromV1"]
        or _website_fingerprint(state) != fingerprint
        or not _same_source(snapshot["source"], current_source)
        or not _same_source(approval["source"], current_source)
        or state["siteName"] != source["siteName"]
        or len(current_pages) != 1
        or current_pages[0]["slug"] != page_path
        or snapshot["fingerprint"] != fingerprint
        or approval["fingerprint"] != fingerprint
        or snapshot["approvalId"] != approval_id
        or page_id not in snapshot["readyPageIds"]
        or not _same_source(snapshot["source"], approval["source"])
    ):
        raise TrialValidationError("commerce Website source does not match retained managed Website proof.")
    return deepcopy(source)


def _command_payload(payload: Mapping[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
    if set(payload) != {"state", "evidence"}:
        raise TrialValidationError("Website payload must contain exactly state and evidence objects.")
    evidence = _object(payload.get("evidence"), "command evidence")
    _exact(evidence, "command evidence", _COMMAND_EVIDENCE_FIELDS)
    validated = {
        "actionId": _text(evidence["actionId"], "command evidence.actionId", maximum=160),
        "capturedAt": _timestamp(evidence["capturedAt"], "command evidence.capturedAt"),
        "actor": _text(evidence["actor"], "command evidence.actor", maximum=160),
        "reason": _text(evidence["reason"], "command evidence.reason", maximum=240),
        "evidenceReference": _text(evidence["evidenceReference"], "command evidence.evidenceReference", maximum=320),
    }
    return validate_website_state(payload.get("state")), validated


def _unchanged(current: Mapping[str, Any], next_state: Mapping[str, Any], *fields: str) -> None:
    changed = [field for field in fields if current[field] != next_state[field]]
    if changed:
        raise TrialValidationError(f"Website event cannot change: {', '.join(changed)}.")


def _prepend_one(current: Sequence[Any], next_values: Sequence[Any], field: str) -> dict[str, Any]:
    if len(next_values) != len(current) + 1 or list(next_values[1:]) != list(current):
        raise TrialValidationError(f"Website event must prepend exactly one {field} record.")
    return _object(next_values[0], f"new {field}")


def _page_is_complete(page: Mapping[str, Any]) -> bool:
    cta_label = bool(_js_trim(str(page["hero"]["ctaLabel"])))
    cta_href = _js_trim(str(page["hero"]["ctaHref"]))
    destination_ok = (
        not cta_href
        or cta_href.startswith(("/", "#"))
        or _safe_https_destination(cta_href)
    )
    return bool(
        _js_trim(str(page["internalName"]))
        and _SLUG.fullmatch(_js_trim(str(page["slug"])))
        and _js_trim(str(page["hero"]["headline"]))
        and _js_trim(str(page["hero"]["summary"]))
        and cta_label == bool(cta_href)
        and destination_ok
        and page["sections"]
        and all(_js_trim(str(section["title"])) and _js_trim(str(section["body"])) for section in page["sections"])
        and _js_trim(str(page["seo"]["title"]))
        and _js_trim(str(page["seo"]["description"]))
    )


def _require_publish_ready(state: Mapping[str, Any]) -> None:
    ready_pages = [page for page in state["pages"] if page["stage"] == "ready"]
    normalized_slugs = [_js_trim(str(page["slug"])).rstrip("/") or "/" for page in ready_pages]
    ready_paths = set(normalized_slugs)
    ready_anchors = {_page_anchor(path) for path in ready_paths}
    visible = [page for page in state["pages"] if page["navigation"]["visible"]]
    source = {"contentRevision": state["contentRevision"], "digest": _website_fingerprint(state)}
    current_kinds = {
        evidence["kind"]
        for evidence in state["evidence"]
        if _same_source(evidence["source"], source)
    }
    if not (
        _js_trim(str(state["siteName"]))
        and ready_pages
        and all(_page_is_complete(page) for page in ready_pages)
        and normalized_slugs.count("/") == 1
        and len(set(normalized_slugs)) == len(normalized_slugs)
        and visible
        and all(page["stage"] == "ready" and _js_trim(str(page["navigation"]["label"])) for page in visible)
        and all(
            not (destination := _js_trim(str(page["hero"]["ctaHref"])))
            or (destination.startswith("#") and destination[1:] in ready_anchors)
            or _safe_https_destination(destination)
            or (destination.startswith("/") and (destination.rstrip("/") or "/") in ready_paths)
            for page in ready_pages
        )
        and current_kinds == _EVIDENCE_KINDS
    ):
        raise TrialValidationError("Website revision is not ready for approval or snapshot recording.")


def _validate_command_evidence(record: Mapping[str, Any], event: Mapping[str, Any], evidence: Mapping[str, str]) -> None:
    actor_field = next((field for field in ("verifiedBy", "reviewer", "recordedBy") if field in record), None)
    if not (
        evidence["actionId"] == record["id"]
        and evidence["capturedAt"] == event["createdAt"]
        and actor_field is not None
        and evidence["actor"] == event["actor"] == record[actor_field]
        and evidence["reason"] == event["reason"]
        and evidence["evidenceReference"] == event["evidenceReference"]
    ):
        raise TrialValidationError("Website command evidence must match the new accountable record.")


def reduce_website_state(
    event_type: str,
    current: Mapping[str, Any],
    payload: Mapping[str, Any],
) -> Mapping[str, Any]:
    """Apply one explicit Website lifecycle event to a complete validated state."""

    if event_type not in WEBSITE_EVENTS:
        raise TrialValidationError("Unsupported Website lifecycle event.")
    next_state, command_evidence = _command_payload(payload)
    if not current:
        if event_type != "website.workspace.initialized":
            raise TrialValidationError("An empty Website workspace must be initialized first.")
        if next_state["revision"] != 0 or next_state["contentRevision"] != 0:
            raise TrialValidationError("A managed Website workspace must initialize at revision zero.")
        if any(next_state[field] for field in ("evidence", "approvals", "localPublishes", "events")):
            raise TrialValidationError("A managed Website workspace cannot initialize with client-asserted release history.")
        return next_state

    current_state = validate_website_state(current)
    if next_state["revision"] != current_state["revision"] + 1:
        raise TrialValidationError("Website revision must advance exactly once per event.")
    if next_state["schema"] != current_state["schema"] or next_state["version"] != current_state["version"]:
        raise TrialValidationError("Website schema identity is immutable.")

    if event_type == "website.content.saved":
        if next_state["contentRevision"] != current_state["contentRevision"] + 1:
            raise TrialValidationError("Website content save must advance contentRevision exactly once.")
        if _website_fingerprint(next_state) == _website_fingerprint(current_state):
            raise TrialValidationError("Website content save must change publishable content.")
        _unchanged(current_state, next_state, "evidence", "approvals", "localPublishes", "events")
        return next_state

    if next_state["contentRevision"] != current_state["contentRevision"]:
        raise TrialValidationError("This Website event cannot change contentRevision.")
    if _website_fingerprint(next_state) != _website_fingerprint(current_state):
        raise TrialValidationError("This Website event cannot change publishable content.")

    if event_type == "website.selection.changed":
        _unchanged(current_state, next_state, "siteName", "pages", "evidence", "approvals", "localPublishes", "events")
        if next_state["selectedPageId"] == current_state["selectedPageId"]:
            raise TrialValidationError("Website selection event must select a different page.")
        return next_state

    _unchanged(current_state, next_state, "siteName", "pages", "selectedPageId")
    event = _prepend_one(current_state["events"], next_state["events"], "workflow event")
    if event_type == "website.evidence.recorded":
        record = _prepend_one(current_state["evidence"], next_state["evidence"], "evidence")
        _unchanged(current_state, next_state, "approvals", "localPublishes")
        expected_action = "publish_evidence_recorded"
    elif event_type == "website.revision.approved":
        record = _prepend_one(current_state["approvals"], next_state["approvals"], "approval")
        _unchanged(current_state, next_state, "evidence", "localPublishes")
        expected_action = "website_revision_approved"
        _require_publish_ready(next_state)
    else:
        record = _prepend_one(current_state["localPublishes"], next_state["localPublishes"], "snapshot")
        _unchanged(current_state, next_state, "evidence", "approvals")
        expected_action = "local_snapshot_recorded"
        _require_publish_ready(next_state)
        ready_page_ids = [page["id"] for page in next_state["pages"] if page["stage"] == "ready"]
        if not _same_string_set(record["readyPageIds"], ready_page_ids):
            raise TrialValidationError("Website snapshot must include the exact current ready-page set.")
        if record["artifact"] != _website_artifact(next_state):
            raise TrialValidationError("Website snapshot must retain the exact approved site artifact.")
    if event["action"] != expected_action or event["subjectId"] != record["id"]:
        raise TrialValidationError("Website lifecycle event does not match its new accountable record.")
    current_source = {"contentRevision": next_state["contentRevision"], "digest": _website_fingerprint(next_state)}
    if not _same_source(record["source"], current_source) or not _same_source(event["source"], current_source):
        raise TrialValidationError("Website accountable record must bind the current content revision.")
    _validate_command_evidence(record, event, command_evidence)
    return next_state
