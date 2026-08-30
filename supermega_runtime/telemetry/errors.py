"""Server-side error lane — the observability gap that survived checking.

`hq/strategy/ENTERPRISE-READINESS-SCORECARD.md` section 6 lists four
observability gaps. Three are closed (tracing shipped, target-state alerting
shipped, analytics persisted). The one that survived is error tracking, and
its own recommendation 2 is explicit about the shape: *an error lane on the
existing no-PII beacon, not Sentry*. `showroom/src/core/client-error-reporter.ts`
implements that on the browser side. This is the same lane, server-side.

DESIGN, mirroring the client reporter deliberately rather than inventing a
second vocabulary:

* **Structural PII exclusion, not scrubbing-as-afterthought.** The event has
  exactly five fields and every key is already in
  ``schema.ATTRIBUTE_WHITELIST`` (``error.type``, ``error.code``,
  ``http.method``, ``http.route``, ``http.status_code``). A key not on that
  list cannot be emitted, because ``build_error_event`` runs the finished
  mapping through ``redact.scrub_attributes``, which is opt-in by design.
* **The message text never leaves the process.** It is reduced to a one-way
  SHA-256 prefix, the server analogue of the client's FNV-1a hash. Two
  occurrences of the same fault correlate; the text cannot be recovered.
* **The ROUTE TEMPLATE, never the resolved path.** This is the subtle one.
  ``request.url.path`` on ``/api/v1/commerce/orders/ORD-1042`` carries a
  record identifier, and on a customer-named route it could carry worse.
  ``request.scope['route'].path`` is the unfilled template
  (``/api/v1/commerce/orders/{order_id}``), which is structural metadata and
  is what the plan's "safe to include" table actually sanctions. If the
  template is unavailable the route is dropped entirely rather than guessed.
* **Fail-open at every rail.** An error inside the error lane must never turn
  a handled 500 into an unhandled one. Every public function here swallows
  its own faults and returns a safe value; the caller in ``tracing.py``
  re-raises the ORIGINAL exception so FastAPI's normal handling is unchanged.

This module has no OpenTelemetry import, so it can be unit tested without the
SDK installed — the same property ``schema.py`` was written for.
"""

from __future__ import annotations

import hashlib
from typing import Any

from . import schema
from .redact import customer_content_values, scrub_attributes

# Closed taxonomy. Server-shaped rather than a copy of the browser's DOM-flavoured
# list, but the same rule: an exception maps to one of these members or to
# "unknown", and free text never becomes a class name.
ERROR_CLASSES: tuple[str, ...] = (
    "validation",  # request body or params failed schema validation
    "not_found",  # addressed a record that does not exist
    "conflict",  # optimistic-concurrency or state-machine refusal
    "permission_denied",  # authorization refusal, including RLS
    "schema_mismatch",  # managed schema version guard refused
    "database",  # driver/connection level failure
    "timeout",
    "upstream",  # a dependency this process called failed
    "serialization",  # encode/decode of a payload
    "generic_error",  # an Exception subclass not covered above
    "non_error",  # something not derived from Exception was raised
    "unknown",
)

_MESSAGE_DIGEST_LENGTH = 12

# Matched against the exception's own class name, lowercased. Ordered: the first
# hit wins, so put the specific before the general.
_CLASS_NAME_MARKERS: tuple[tuple[str, str], ...] = (
    ("validationerror", "validation"),
    ("requestvalidation", "validation"),
    ("notfound", "not_found"),
    ("doesnotexist", "not_found"),
    ("conflict", "conflict"),
    ("integrityerror", "conflict"),
    ("permission", "permission_denied"),
    ("forbidden", "permission_denied"),
    ("unauthorized", "permission_denied"),
    ("insufficientprivilege", "permission_denied"),
    ("schemaversion", "schema_mismatch"),
    ("schemamismatch", "schema_mismatch"),
    ("operationalerror", "database"),
    ("databaseerror", "database"),
    ("interfaceerror", "database"),
    ("psycopg", "database"),
    ("timeout", "timeout"),
    ("timeouterror", "timeout"),
    ("connectionerror", "upstream"),
    ("httperror", "upstream"),
    ("urlerror", "upstream"),
    ("jsondecodeerror", "serialization"),
    ("decodeerror", "serialization"),
    ("unicodedecodeerror", "serialization"),
)

# HTTP status is a stronger signal than a class name when the framework has
# already decided the outcome, so it is consulted first for the 4xx family.
_STATUS_CLASSES: dict[int, str] = {
    400: "validation",
    401: "permission_denied",
    403: "permission_denied",
    404: "not_found",
    409: "conflict",
    422: "validation",
    504: "timeout",
}


def classify_exception(exc: Any, *, status_code: int | None = None) -> str:
    """Map an exception to exactly one member of ERROR_CLASSES.

    Never returns free text. Never raises: an unclassifiable input is
    "unknown", which is a real bucket rather than a failure.
    """

    try:
        if not isinstance(exc, BaseException):
            return "non_error"
        if status_code is not None and status_code in _STATUS_CLASSES:
            return _STATUS_CLASSES[status_code]
        name = type(exc).__name__.lower()
        module = (type(exc).__module__ or "").lower()
        haystack = f"{module}.{name}"
        for marker, error_class in _CLASS_NAME_MARKERS:
            if marker in haystack:
                return error_class
        if isinstance(exc, Exception):
            return "generic_error"
        return "unknown"
    except Exception:  # pragma: no cover - classification must never raise
        return "unknown"


def message_digest(exc: Any) -> str:
    """One-way digest of the exception's type and message.

    The raw message never leaves this function. Identical faults produce an
    identical digest so occurrences correlate; the text is not recoverable
    from it. Mirrors the client reporter's message hash, with SHA-256 rather
    than FNV-1a because there is no bundle-size pressure here.
    """

    try:
        label = f"{type(exc).__name__}:{exc}"
    except Exception:  # pragma: no cover - a __str__ that raises must not propagate
        label = f"{type(exc).__name__}:<unprintable>"
    try:
        return hashlib.sha256(label.encode("utf-8", "replace")).hexdigest()[
            :_MESSAGE_DIGEST_LENGTH
        ]
    except Exception:  # pragma: no cover
        return "0" * _MESSAGE_DIGEST_LENGTH


def route_template(request: Any) -> str | None:
    """The unfilled route template, or None.

    Deliberately NOT ``request.url.path``: a resolved path carries record
    identifiers and can carry customer content. If the template cannot be
    read, this returns None and the caller omits the attribute — an absent
    route is a smaller loss than a leaked one.
    """

    try:
        route = request.scope.get("route")
    except Exception:
        return None
    path = getattr(route, "path", None)
    if isinstance(path, str) and path:
        return path
    return None


def build_error_event(
    exc: Any,
    *,
    request: Any = None,
    status_code: int | None = None,
) -> dict[str, Any]:
    """Build the flat, whitelisted, scrubbed attribute mapping for one failure.

    Every key here is already a member of ``schema.ATTRIBUTE_WHITELIST``. The
    finished mapping is passed through ``scrub_attributes`` regardless, so the
    allowlist is enforced by the same code path that guards every other span
    rather than by this function being careful.
    """

    try:
        attributes: dict[str, Any] = {
            "error.type": classify_exception(exc, status_code=status_code),
            "error.code": message_digest(exc),
        }
        if status_code is not None:
            attributes["http.status_code"] = int(status_code)
        if request is not None:
            method = getattr(request, "method", None)
            if isinstance(method, str) and method:
                attributes["http.method"] = method
            template = route_template(request)
            if template is not None:
                attributes["http.route"] = template
        scrubbed = scrub_attributes(attributes, customer_content_values())
        return dict(scrubbed) if scrubbed else {}
    except Exception:  # pragma: no cover - the lane must never add a second failure
        return {}


__all__ = [
    "ERROR_CLASSES",
    "classify_exception",
    "message_digest",
    "route_template",
    "build_error_event",
]
