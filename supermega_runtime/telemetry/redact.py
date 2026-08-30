"""Customer-content scrubber for SuperMega spans.

Implements the redaction rule in
``hq/research/opentelemetry-implementation-plan-2026-08.md`` section 3
exactly:

    Before any span is exported, a scrubber function runs over all
    string-typed attribute values. The scrubber rejects spans that contain:

    1. Any value that was present in the request body's customer-content
       fields (name, phone, address, reason, note, amount).
    2. Any string matching Myanmar phone patterns (``09\\d{7,9}`` and
       variants) or MMK amount patterns (``[0-9,]+\\s*MMK`` or numeric
       fields named ``total``, ``amount``, ``price``).
    3. Any value longer than 200 characters in a non-whitelisted attribute.

Section 7's own risk mitigation resolves an ambiguity in the rules above in
the strict direction: "the scrubber whitelist is opt-in (only listed
attributes pass through); any new attribute not on the list is dropped by
default." This module therefore drops (not merely truncates or flags) any
attribute whose key is not in ``schema.ATTRIBUTE_WHITELIST``, in addition to
the three numbered checks. Rule 2's "numeric fields named total, amount,
price" clause is enforced structurally by that same opt-in whitelist, since
no bare ``total`` / ``amount`` / ``price`` key is ever whitelisted.

The default outcome for a redaction hit is to drop the single offending
attribute, not the whole span — this matches section 7's "The scrubber
defaults to dropping the attribute rather than passing it," and keeps the
rest of a span's safe, structural attributes (trace id, workspace id,
outcome, duration) usable for debugging.

This module has no FastAPI/Starlette import so it can be unit tested in
isolation from the web layer.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from contextvars import ContextVar, Token
import hashlib
import re
from typing import Any

from supermega_runtime.telemetry.schema import ATTRIBUTE_WHITELIST, FORBIDDEN_ATTRIBUTE_KEYS


MAX_ATTRIBUTE_LENGTH = 200
_MIN_SUBSTRING_MATCH_LENGTH = 4
_REDACTED_SPAN_NAME = "[redacted]"

# Rule 2: Myanmar mobile numbers. `09` followed by 7-9 more digits, with no
# adjacent digit on either side (so a longer digit run, e.g. inside a phone
# number with a country code glued on, cannot slip through by accident, and
# a *shorter* run inside a longer opaque token like a UUID cannot trigger a
# false positive — see the false-redaction risk note in plan section 7).
MYANMAR_PHONE_PATTERN = re.compile(r"(?<!\d)09\d{7,9}(?!\d)")

# Rule 2: MMK amounts written as digits followed by "MMK" or "kyat(s)".
MMK_AMOUNT_PATTERN = re.compile(r"(?<![\w.])[0-9][0-9,]*(?:\.[0-9]+)?\s*(?:mmk|kyats?)\b", re.IGNORECASE)

# Rule 1: request-body field names that mark a leaf value as customer
# content, matched as a case-insensitive substring of the JSON key. This is
# deliberately broader than the plan's parenthetical list (name, phone,
# address, reason, note, amount) to also catch the "total" / "price" phrasing
# this codebase actually uses for order amounts (see MMK_AMOUNT_PATTERN's
# sibling clause in rule 2, "numeric fields named total, amount, price").
CUSTOMER_CONTENT_FIELD_MARKERS: tuple[str, ...] = (
    "name",
    "phone",
    "address",
    "reason",
    "note",
    "amount",
    "total",
    "price",
)

# Populated per-request by `supermega_runtime.telemetry.tracing`'s request
# middleware, and read here at span-export time. A SpanProcessor has no
# access to the HTTP request, so the deny-list of literal customer-content
# values travels through this contextvar instead. Each ASGI request runs in
# its own asyncio Task, which gets its own copy of the context, so concurrent
# requests never see each other's values.
_CUSTOMER_CONTENT_VALUES: ContextVar[frozenset[str]] = ContextVar(
    "supermega_customer_content_values",
    default=frozenset(),
)


def customer_content_values() -> frozenset[str]:
    """Return the current request's customer-content deny-list, if any."""

    return _CUSTOMER_CONTENT_VALUES.get()


def push_customer_content_scope(payload: Any) -> Token[frozenset[str]]:
    """Extract and activate the deny-list for one request. Returns a reset token."""

    return _CUSTOMER_CONTENT_VALUES.set(extract_customer_content_values(payload))


def pop_customer_content_scope(token: Token[frozenset[str]]) -> None:
    _CUSTOMER_CONTENT_VALUES.reset(token)


def _iter_leaf_values(node: Any, *, key_hint: str) -> Iterable[tuple[str, Any]]:
    if isinstance(node, Mapping):
        for key, value in node.items():
            yield from _iter_leaf_values(value, key_hint=str(key))
    elif isinstance(node, (list, tuple)):
        for item in node:
            yield from _iter_leaf_values(item, key_hint=key_hint)
    else:
        yield key_hint, node


def extract_customer_content_values(payload: Any) -> frozenset[str]:
    """Walk a parsed JSON request body and collect customer-content leaves.

    A leaf value is collected when either is true:
      * its immediate key contains one of `CUSTOMER_CONTENT_FIELD_MARKERS`
        (rule 1: "the request body's customer-content fields"), or
      * the value itself already looks like a Myanmar phone number or an
        MMK amount (defense in depth for a field the caller renamed).

    Only scalar leaves (str/int/float) are collected; booleans and None are
    never customer content. Values are normalized with ``str(...).strip()``
    so an integer amount in the request body still matches a stringified
    span attribute.
    """

    values: set[str] = set()
    for key_hint, leaf in _iter_leaf_values(payload, key_hint=""):
        if leaf is None or isinstance(leaf, bool):
            continue
        if not isinstance(leaf, (str, int, float)):
            continue
        text = str(leaf).strip()
        if not text:
            continue
        lowered_key = key_hint.casefold()
        is_marked_field = any(marker in lowered_key for marker in CUSTOMER_CONTENT_FIELD_MARKERS)
        looks_sensitive = bool(
            MYANMAR_PHONE_PATTERN.search(text) or MMK_AMOUNT_PATTERN.search(text)
        )
        if is_marked_field or looks_sensitive:
            values.add(text)
    return frozenset(values)


def _matches_customer_content(value: str, deny_values: frozenset[str]) -> bool:
    if not value or not deny_values:
        return False
    if value in deny_values:
        return True
    if len(value) < _MIN_SUBSTRING_MATCH_LENGTH:
        return False
    return any(
        len(deny) >= _MIN_SUBSTRING_MATCH_LENGTH and deny in value
        for deny in deny_values
    )


def _looks_like_pii_pattern(value: str) -> bool:
    return bool(MYANMAR_PHONE_PATTERN.search(value) or MMK_AMOUNT_PATTERN.search(value))


def is_string_value_safe(value: str, deny_values: frozenset[str]) -> bool:
    """Return True only if `value` passes rules 1, 2, and the length check.

    Exposed standalone so tests (and callers who only have a value, not a
    whole span) can exercise the string-level rules directly.
    """

    if _matches_customer_content(value, deny_values):
        return False
    if _looks_like_pii_pattern(value):
        return False
    if len(value) > MAX_ATTRIBUTE_LENGTH:
        return False
    return True


def _scrub_scalar(value: Any, deny_values: frozenset[str]) -> tuple[Any, bool]:
    """Return (value, keep) for one non-container attribute value."""

    if isinstance(value, str):
        if is_string_value_safe(value, deny_values):
            return value, True
        return None, False
    # bool must be checked before int (bool is an int subclass in Python).
    if isinstance(value, (bool, int, float)):
        return value, True
    # Anything else (bytes, custom objects, …) is not a structural metadata
    # shape the whitelist expects; drop it rather than guess.
    return None, False


def scrub_attribute(key: str, value: Any, deny_values: frozenset[str]) -> Any | None:
    """Return the sanitized value for one attribute, or None to drop it."""

    if key in FORBIDDEN_ATTRIBUTE_KEYS:
        return None
    if key not in ATTRIBUTE_WHITELIST:
        return None
    if isinstance(value, (list, tuple)):
        kept: list[Any] = []
        for item in value:
            scrubbed, keep = _scrub_scalar(item, deny_values)
            if not keep:
                return None
            kept.append(scrubbed)
        return tuple(kept) if isinstance(value, tuple) else kept
    scrubbed, keep = _scrub_scalar(value, deny_values)
    return scrubbed if keep else None


def scrub_attributes(
    attributes: Mapping[str, Any],
    deny_values: frozenset[str] | None = None,
) -> dict[str, Any]:
    """Return a new attribute mapping with every unsafe entry removed."""

    active_deny_values = deny_values if deny_values is not None else customer_content_values()
    sanitized: dict[str, Any] = {}
    for key, value in attributes.items():
        scrubbed = scrub_attribute(key, value, active_deny_values)
        if scrubbed is not None:
            sanitized[key] = scrubbed
    return sanitized


def scrub_span_name(name: str, deny_values: frozenset[str] | None = None) -> str:
    """Return `name` unchanged unless it itself looks like customer content."""

    active_deny_values = deny_values if deny_values is not None else customer_content_values()
    if not isinstance(name, str):
        return _REDACTED_SPAN_NAME
    if _matches_customer_content(name, active_deny_values) or _looks_like_pii_pattern(name):
        return _REDACTED_SPAN_NAME
    if len(name) > MAX_ATTRIBUTE_LENGTH:
        return _REDACTED_SPAN_NAME
    return name


_SQL_OPERATION_PATTERN = re.compile(
    r"^\s*(select|insert|update|delete|begin|commit|rollback)\b", re.IGNORECASE
)
_SQL_TABLE_PATTERN = re.compile(
    r"\b(?:from|into|update|join)\s+([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)?)", re.IGNORECASE
)


def derive_db_operation_and_collection(statement: str) -> tuple[str | None, str | None]:
    """Best-effort ``(operation, table)`` extraction from a raw SQL statement.

    Only SQL keywords and identifiers are read — never a bound parameter
    value, since psycopg sends those out-of-band from the statement text.
    Called once, immediately before the raw statement is discarded, so the
    plan's required ``db.operation`` / ``db.collection`` attributes (section
    4) survive even though ``db.statement`` itself is always dropped.
    """

    if not isinstance(statement, str) or not statement.strip():
        return None, None
    operation_match = _SQL_OPERATION_PATTERN.search(statement)
    table_match = _SQL_TABLE_PATTERN.search(statement)
    operation = operation_match.group(1).upper() if operation_match else None
    table = table_match.group(1) if table_match else None
    return operation, table


_STATEMENT_ATTRIBUTE_KEYS: Sequence[str] = ("db.statement", "db.query.text")


def enrich_and_scrub_db_attributes(attributes: Mapping[str, Any]) -> dict[str, Any]:
    """Derive safe db.operation/db.collection, then drop the raw statement.

    Applied before the general `scrub_attributes` opt-in pass so the derived
    attributes are present when that pass runs (and so they are themselves
    still subject to it — a defensive double-check, not a bypass).
    """

    enriched = dict(attributes)
    statement = next(
        (enriched[key] for key in _STATEMENT_ATTRIBUTE_KEYS if isinstance(enriched.get(key), str)),
        None,
    )
    if statement:
        operation, table = derive_db_operation_and_collection(statement)
        if operation and "db.operation" not in enriched:
            enriched["db.operation"] = operation
        if table and "db.collection" not in enriched:
            enriched["db.collection"] = table
    for key in FORBIDDEN_ATTRIBUTE_KEYS:
        enriched.pop(key, None)
    return enriched


# Span-event keys written by OpenTelemetry's own exception recording
# (`Span.record_exception`, which FastAPI/ASGI instrumentation calls on every
# unhandled error). Their values are free-form: `exception.message` is
# `str(exc)` verbatim and `exception.stacktrace` is the formatted traceback,
# which carries source lines and therefore whatever the failing code was
# holding. Neither can be whitelisted by key the way `scrub_attribute` works,
# so they get their own handling below.
EXCEPTION_TYPE_KEY = "exception.type"
EXCEPTION_MESSAGE_KEY = "exception.message"
EXCEPTION_STACKTRACE_KEY = "exception.stacktrace"
EXCEPTION_MESSAGE_DIGEST_KEY = "exception.message_digest"

_MESSAGE_DIGEST_LENGTH = 12


def message_text_digest(text: Any) -> str:
    """One-way digest of a free-form message string.

    The same fault digests identically, so occurrences still correlate in a
    trace backend, but the text is not recoverable. Deliberately mirrors
    `errors.message_digest` (same hash, same length) so an error-lane
    attribute and a span-event digest for one fault agree.
    """

    try:
        label = text if isinstance(text, str) else str(text)
    except Exception:  # pragma: no cover - a __str__ that raises must not propagate
        label = "<unprintable>"
    try:
        return hashlib.sha256(label.encode("utf-8", "replace")).hexdigest()[
            :_MESSAGE_DIGEST_LENGTH
        ]
    except Exception:  # pragma: no cover
        return "0" * _MESSAGE_DIGEST_LENGTH


def scrub_event_attributes(
    attributes: Mapping[str, Any] | None,
    deny_values: frozenset[str] | None = None,
) -> dict[str, Any]:
    """Scrub one span event's attributes, fail-closed on the exception pair.

    `exception.message` is replaced by a digest and `exception.stacktrace` is
    dropped outright — neither is ever exported as text, regardless of whether
    the current request scope happens to know the customer values inside it.
    That last point is why this cannot simply defer to `scrub_attributes`:
    deny-value matching only catches content the scope already knows about,
    and an exception message can carry data from anywhere (a database error
    echoing a row, a parse error quoting its input). Everything else goes
    through the normal per-key whitelist.
    """

    source = dict(attributes or {})
    sanitized: dict[str, Any] = {}

    raw_message = source.pop(EXCEPTION_MESSAGE_KEY, None)
    source.pop(EXCEPTION_STACKTRACE_KEY, None)
    exception_type = source.pop(EXCEPTION_TYPE_KEY, None)

    sanitized.update(scrub_attributes(source, deny_values))

    if isinstance(exception_type, str):
        # A class name, not content. Held to the same shape rules as any
        # other span name so a dynamically-built exception class cannot
        # smuggle a value through in its `__name__`.
        sanitized[EXCEPTION_TYPE_KEY] = scrub_span_name(exception_type, deny_values)
    if raw_message is not None:
        sanitized[EXCEPTION_MESSAGE_DIGEST_KEY] = message_text_digest(raw_message)

    return sanitized


def scrub_events(events: Any, deny_values: frozenset[str] | None = None) -> list[Any]:
    """Rebuild a span's events with scrubbed names and attributes.

    Returns plain `Event` objects; a malformed event is dropped rather than
    exported unscrubbed.
    """

    from opentelemetry.sdk.trace import Event

    sanitized: list[Any] = []
    for event in events or ():
        try:
            name = scrub_span_name(getattr(event, "name", ""), deny_values)
            sanitized.append(
                Event(
                    name=name,
                    attributes=scrub_event_attributes(
                        getattr(event, "attributes", None), deny_values
                    ),
                    timestamp=getattr(event, "timestamp", None),
                )
            )
        except Exception:  # pragma: no cover - never export an unscrubbed event
            continue
    return sanitized


__all__ = [
    "MAX_ATTRIBUTE_LENGTH",
    "EXCEPTION_TYPE_KEY",
    "EXCEPTION_MESSAGE_KEY",
    "EXCEPTION_STACKTRACE_KEY",
    "EXCEPTION_MESSAGE_DIGEST_KEY",
    "message_text_digest",
    "scrub_event_attributes",
    "scrub_events",
    "MYANMAR_PHONE_PATTERN",
    "MMK_AMOUNT_PATTERN",
    "CUSTOMER_CONTENT_FIELD_MARKERS",
    "customer_content_values",
    "push_customer_content_scope",
    "pop_customer_content_scope",
    "extract_customer_content_values",
    "is_string_value_safe",
    "scrub_attribute",
    "scrub_attributes",
    "scrub_span_name",
    "derive_db_operation_and_collection",
    "enrich_and_scrub_db_attributes",
]
