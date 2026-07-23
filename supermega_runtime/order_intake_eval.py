"""Offline evaluation for source-backed order-intake drafts.

The evaluator accepts already-produced drafts and performs no network, storage,
command, or customer-message operation. Live model generation is intentionally
separate so this scorer can be run repeatedly without operational side effects.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from hashlib import sha256
from typing import Any

from pydantic import ValidationError

from supermega_runtime.order_intake import OrderIntakeDraft


ORDER_INTAKE_FIXTURE_SCHEMA = "supermega.order_intake.fixtures.v1"
ORDER_INTAKE_RESULT_SCHEMA = "supermega.order_intake.results.v1"
ORDER_INTAKE_EVALUATION_SCHEMA = "supermega.order_intake.evaluation.v1"
_ORDER_FIELDS = (
    "customer_reference",
    "channel",
    "sku",
    "quantity",
    "payment",
    "fulfilment",
)
_FORBIDDEN_OPERATIONAL_KEYS = frozenset(
    {
        "action",
        "actions",
        "command",
        "commands",
        "tool",
        "tools",
        "tool_calls",
        "payment_action",
        "customer_message",
    }
)
_FORBIDDEN_PRIVATE_KEYS = frozenset(
    {
        "input_text",
        "message",
        "provider_output",
        "raw_message",
        "source_text",
    }
)


def _object(value: object, field: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{field} must be an object")
    return value


def _sequence(value: object, field: str) -> Sequence[Any]:
    if not isinstance(value, Sequence) or isinstance(
        value,
        (str, bytes, bytearray),
    ):
        raise ValueError(f"{field} must be an array")
    return value


def _matching_keys(value: object, forbidden_keys: frozenset[str]) -> set[str]:
    found: set[str] = set()
    if isinstance(value, Mapping):
        for key, nested in value.items():
            normalized = str(key).casefold()
            if normalized in forbidden_keys:
                found.add(normalized)
            found.update(_matching_keys(nested, forbidden_keys))
    elif isinstance(value, Sequence) and not isinstance(
        value,
        (str, bytes, bytearray),
    ):
        for nested in value:
            found.update(_matching_keys(nested, forbidden_keys))
    return found


def _fixture_findings(
    fixture: Mapping[str, Any],
    draft: OrderIntakeDraft,
) -> list[str]:
    findings: list[str] = []
    fixture_id = str(fixture.get("id", "unknown"))
    message = fixture.get("message")
    expected = _object(fixture.get("expected"), f"{fixture_id}.expected")
    values = _object(expected.get("values"), f"{fixture_id}.expected.values")
    source_quotes = _object(
        expected.get("source_quotes"),
        f"{fixture_id}.expected.source_quotes",
    )
    if not isinstance(message, str):
        return ["fixture message is not text"]

    if draft.scope != expected.get("scope"):
        findings.append(
            f"scope expected {expected.get('scope')!r}, received {draft.scope!r}"
        )
    if draft.status != expected.get("status"):
        findings.append(
            f"status expected {expected.get('status')!r}, received {draft.status!r}"
        )
    for field in _ORDER_FIELDS:
        actual = getattr(draft, field)
        if actual != values.get(field):
            findings.append(
                f"{field} expected {values.get(field)!r}, received {actual!r}"
            )
    expected_uncertain = list(
        _sequence(
            expected.get("uncertain_fields"),
            f"{fixture_id}.expected.uncertain_fields",
        )
    )
    if draft.uncertain_fields != expected_uncertain:
        findings.append(
            "uncertain_fields expected "
            f"{expected_uncertain!r}, received {draft.uncertain_fields!r}"
        )

    actual_quotes = {
        record.field: {span.quote for span in record.source_spans}
        for record in draft.provenance
    }
    for field, quotes_value in source_quotes.items():
        quotes = set(_sequence(quotes_value, f"{fixture_id}.{field}.source_quotes"))
        missing_quotes = sorted(quotes - actual_quotes.get(str(field), set()))
        if missing_quotes:
            findings.append(
                f"{field} is missing expected source quotes {missing_quotes!r}"
            )

    expected_digest = f"sha256:{sha256(message.encode('utf-8')).hexdigest()}"
    if draft.message_digest != expected_digest:
        findings.append("message digest does not match the fixture source")
    serialized = draft.model_dump(mode="json")
    private_keys = sorted(_matching_keys(serialized, _FORBIDDEN_PRIVATE_KEYS))
    if private_keys:
        findings.append(f"draft contains private source keys {private_keys!r}")
    operational_keys = sorted(
        _matching_keys(serialized, _FORBIDDEN_OPERATIONAL_KEYS)
    )
    if operational_keys:
        findings.append(f"draft contains operational keys {operational_keys!r}")
    return findings


def evaluate_order_intake_results(
    corpus: Mapping[str, Any],
    results_document: Mapping[str, Any],
) -> dict[str, Any]:
    """Score one complete result set against the bounded fixture corpus."""

    if corpus.get("schema") != ORDER_INTAKE_FIXTURE_SCHEMA:
        raise ValueError("unsupported order-intake fixture schema")
    if results_document.get("schema") != ORDER_INTAKE_RESULT_SCHEMA:
        raise ValueError("unsupported order-intake result schema")
    fixtures = _sequence(corpus.get("fixtures"), "fixtures")
    if len(fixtures) != 20:
        raise ValueError("the approved order-intake evaluation requires 20 fixtures")
    fixture_by_id = {
        str(_object(fixture, "fixture").get("id")): _object(fixture, "fixture")
        for fixture in fixtures
    }
    if len(fixture_by_id) != len(fixtures) or "None" in fixture_by_id:
        raise ValueError("fixture IDs must be present and unique")

    raw_results = _sequence(results_document.get("results"), "results")
    result_by_id: dict[str, Mapping[str, Any]] = {}
    duplicate_ids: list[str] = []
    for raw_result in raw_results:
        result = _object(raw_result, "result")
        fixture_id = str(result.get("fixture_id"))
        if fixture_id in result_by_id:
            duplicate_ids.append(fixture_id)
        result_by_id[fixture_id] = result

    failures: list[dict[str, Any]] = []
    passed = 0
    for fixture_id, fixture in fixture_by_id.items():
        result = result_by_id.get(fixture_id)
        findings: list[str] = []
        if result is None:
            findings.append("result is missing")
        else:
            try:
                draft = OrderIntakeDraft.model_validate(result.get("draft"))
            except ValidationError as exc:
                findings.append(f"draft contract validation failed: {exc.error_count()} errors")
            else:
                findings.extend(_fixture_findings(fixture, draft))
        if findings:
            failures.append({"fixture_id": fixture_id, "findings": findings})
        else:
            passed += 1

    extra_ids = sorted(set(result_by_id) - set(fixture_by_id))
    result_set_valid = not duplicate_ids and not extra_ids
    if duplicate_ids:
        failures.append(
            {
                "fixture_id": "__result_set__",
                "findings": [f"duplicate result IDs: {sorted(set(duplicate_ids))!r}"],
            }
        )
    if extra_ids:
        failures.append(
            {
                "fixture_id": "__result_set__",
                "findings": [f"unexpected result IDs: {extra_ids!r}"],
            }
        )
    total = len(fixtures)
    return {
        "schema": ORDER_INTAKE_EVALUATION_SCHEMA,
        "total": total,
        "passed": passed,
        "failed": total - passed,
        "pass_rate": passed / total,
        "result_set_valid": result_set_valid,
        "passed_all": passed == total and result_set_valid,
        "zero_side_effect_scorer": True,
        "failures": failures,
    }


__all__ = [
    "ORDER_INTAKE_EVALUATION_SCHEMA",
    "ORDER_INTAKE_FIXTURE_SCHEMA",
    "ORDER_INTAKE_RESULT_SCHEMA",
    "evaluate_order_intake_results",
]
