"""Offline evaluation for source-backed order-intake drafts.

The evaluator accepts already-produced drafts and performs no network, storage,
command, or customer-message operation. Live model generation is intentionally
separate so this scorer can be run repeatedly without operational side effects.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from hashlib import sha256
from math import ceil
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
_REQUIRED_ORDER_FIELDS = ("channel", "sku", "quantity", "payment")
_RESULT_KEYS = frozenset({"fixture_id", "outcome", "draft", "metrics"})
_RESULT_OUTCOMES = frozenset(
    {"completed", "refused", "provider_error", "schema_error"}
)
_METRIC_KEYS = frozenset(
    {
        "latency_ms",
        "input_tokens",
        "cached_input_tokens",
        "output_tokens",
        "estimated_cost_microusd",
        "schema_attempts",
    }
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


def _require_exact_keys(
    value: Mapping[str, Any],
    expected: frozenset[str],
    field: str,
) -> None:
    actual = frozenset(str(key) for key in value)
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        raise ValueError(f"{field} keys are invalid; missing={missing!r}, extra={extra!r}")


def _bounded_integer(
    value: object,
    field: str,
    *,
    minimum: int,
    maximum: int,
) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{field} must be an integer")
    if value < minimum or value > maximum:
        raise ValueError(f"{field} must be between {minimum} and {maximum}")
    return value


def _result_metrics(
    result: Mapping[str, Any],
    fixture_id: str,
) -> dict[str, int]:
    metrics = _object(result.get("metrics"), f"{fixture_id}.metrics")
    _require_exact_keys(metrics, _METRIC_KEYS, f"{fixture_id}.metrics")
    parsed = {
        "latency_ms": _bounded_integer(
            metrics.get("latency_ms"),
            f"{fixture_id}.metrics.latency_ms",
            minimum=0,
            maximum=600_000,
        ),
        "input_tokens": _bounded_integer(
            metrics.get("input_tokens"),
            f"{fixture_id}.metrics.input_tokens",
            minimum=0,
            maximum=2_000_000,
        ),
        "cached_input_tokens": _bounded_integer(
            metrics.get("cached_input_tokens"),
            f"{fixture_id}.metrics.cached_input_tokens",
            minimum=0,
            maximum=2_000_000,
        ),
        "output_tokens": _bounded_integer(
            metrics.get("output_tokens"),
            f"{fixture_id}.metrics.output_tokens",
            minimum=0,
            maximum=2_000_000,
        ),
        "estimated_cost_microusd": _bounded_integer(
            metrics.get("estimated_cost_microusd"),
            f"{fixture_id}.metrics.estimated_cost_microusd",
            minimum=0,
            maximum=1_000_000_000,
        ),
        "schema_attempts": _bounded_integer(
            metrics.get("schema_attempts"),
            f"{fixture_id}.metrics.schema_attempts",
            minimum=1,
            maximum=3,
        ),
    }
    if parsed["cached_input_tokens"] > parsed["input_tokens"]:
        raise ValueError(
            f"{fixture_id}.metrics.cached_input_tokens cannot exceed input_tokens"
        )
    return parsed


def _nearest_rank(values: list[int], percentile: float) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, ceil(len(ordered) * percentile) - 1)]


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
    _require_exact_keys(
        results_document,
        frozenset({"schema", "results"}),
        "results document",
    )
    private_keys = sorted(
        _matching_keys(results_document, _FORBIDDEN_PRIVATE_KEYS)
    )
    if private_keys:
        raise ValueError(
            f"results document contains private source keys {private_keys!r}"
        )
    operational_keys = sorted(
        _matching_keys(results_document, _FORBIDDEN_OPERATIONAL_KEYS)
    )
    if operational_keys:
        raise ValueError(
            f"results document contains operational keys {operational_keys!r}"
        )
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
    result_by_id: dict[str, dict[str, Any]] = {}
    duplicate_ids: list[str] = []
    for raw_result in raw_results:
        result = _object(raw_result, "result")
        _require_exact_keys(result, _RESULT_KEYS, "result")
        fixture_id = str(result.get("fixture_id"))
        outcome = result.get("outcome")
        if outcome not in _RESULT_OUTCOMES:
            raise ValueError(f"{fixture_id}.outcome is unsupported")
        draft = result.get("draft")
        if outcome == "completed" and not isinstance(draft, Mapping):
            raise ValueError(f"{fixture_id}.draft is required for completed results")
        if outcome != "completed" and draft is not None:
            raise ValueError(
                f"{fixture_id}.draft must be null when outcome is {outcome}"
            )
        metrics = _result_metrics(result, fixture_id)
        if fixture_id in result_by_id:
            duplicate_ids.append(fixture_id)
        result_by_id[fixture_id] = {
            "fixture_id": fixture_id,
            "outcome": outcome,
            "draft": draft,
            "metrics": metrics,
        }

    failures: list[dict[str, Any]] = []
    passed = 0
    schema_valid = 0
    required_field_checks = 0
    required_field_matches = 0
    required_correction_fixtures = 0
    provenance_required = 0
    provenance_covered = 0
    fabricated_critical_facts = 0
    unsafe_ready_for_review = 0
    outcome_counts = {outcome: 0 for outcome in sorted(_RESULT_OUTCOMES)}
    latencies: list[int] = []
    input_tokens = 0
    cached_input_tokens = 0
    output_tokens = 0
    estimated_cost_microusd = 0
    schema_attempts = 0
    for fixture_id, fixture in fixture_by_id.items():
        result = result_by_id.get(fixture_id)
        findings: list[str] = []
        expected = _object(fixture.get("expected"), f"{fixture_id}.expected")
        expected_values = _object(
            expected.get("values"),
            f"{fixture_id}.expected.values",
        )
        draft: OrderIntakeDraft | None = None
        if result is None:
            findings.append("result is missing")
        else:
            outcome = str(result["outcome"])
            outcome_counts[outcome] += 1
            metrics = result["metrics"]
            latencies.append(metrics["latency_ms"])
            input_tokens += metrics["input_tokens"]
            cached_input_tokens += metrics["cached_input_tokens"]
            output_tokens += metrics["output_tokens"]
            estimated_cost_microusd += metrics["estimated_cost_microusd"]
            schema_attempts += metrics["schema_attempts"]
            if outcome != "completed":
                findings.append(f"provider outcome was {outcome}")
            else:
                try:
                    draft = OrderIntakeDraft.model_validate(result.get("draft"))
                except ValidationError as exc:
                    findings.append(
                        "draft contract validation failed: "
                        f"{exc.error_count()} errors"
                    )
                else:
                    schema_valid += 1
                    findings.extend(_fixture_findings(fixture, draft))

        required_mismatch = False
        for field in _REQUIRED_ORDER_FIELDS:
            required_field_checks += 1
            expected_value = expected_values.get(field)
            actual_value = getattr(draft, field) if draft is not None else None
            if draft is not None and actual_value == expected_value:
                required_field_matches += 1
            else:
                required_mismatch = True
            if expected_value is not None:
                provenance_required += 1
                if draft is not None and any(
                    record.field == field for record in draft.provenance
                ):
                    provenance_covered += 1
            elif draft is not None and actual_value is not None:
                fabricated_critical_facts += 1

        if required_mismatch:
            required_correction_fixtures += 1
        if draft is not None and draft.status == "ready_for_review":
            if (
                expected.get("status") != "ready_for_review"
                or required_mismatch
                or bool(draft.blockers)
            ):
                unsafe_ready_for_review += 1
        if findings:
            failures.append({"fixture_id": fixture_id, "findings": findings})
        else:
            passed += 1

    extra_ids = sorted(set(result_by_id) - set(fixture_by_id))
    missing_ids = sorted(set(fixture_by_id) - set(result_by_id))
    result_set_valid = not duplicate_ids and not extra_ids and not missing_ids
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
    if missing_ids:
        failures.append(
            {
                "fixture_id": "__result_set__",
                "findings": [f"missing result IDs: {missing_ids!r}"],
            }
        )
    total = len(fixtures)
    schema_validity_rate = schema_valid / total
    required_field_accuracy = required_field_matches / required_field_checks
    provenance_coverage = (
        provenance_covered / provenance_required
        if provenance_required
        else 1.0
    )
    metrics_complete = (
        result_set_valid
        and len(latencies) == total
        and sum(outcome_counts.values()) == total
    )
    gates = {
        "complete_result_set": result_set_valid,
        "metrics_complete": metrics_complete,
        "schema_validity_100": schema_validity_rate == 1.0,
        "provenance_coverage_100": provenance_coverage == 1.0,
        "required_field_accuracy_at_least_90": required_field_accuracy >= 0.9,
        "zero_fabricated_critical_facts": fabricated_critical_facts == 0,
        "zero_unsafe_ready_for_review": unsafe_ready_for_review == 0,
        "zero_side_effect_scorer": True,
    }
    quality_gate_passed = all(gates.values())
    return {
        "schema": ORDER_INTAKE_EVALUATION_SCHEMA,
        "total": total,
        "passed": passed,
        "failed": total - passed,
        "pass_rate": passed / total,
        "result_set_valid": result_set_valid,
        "passed_all": passed == total and result_set_valid and metrics_complete,
        "quality_gate_passed": quality_gate_passed,
        "zero_side_effect_scorer": True,
        "gates": gates,
        "quality": {
            "schema_valid_results": schema_valid,
            "schema_validity_rate": schema_validity_rate,
            "required_field_checks": required_field_checks,
            "required_field_matches": required_field_matches,
            "required_field_accuracy": required_field_accuracy,
            "required_correction_fixtures": required_correction_fixtures,
            "required_correction_rate": required_correction_fixtures / total,
            "provenance_required_fields": provenance_required,
            "provenance_covered_fields": provenance_covered,
            "provenance_coverage": provenance_coverage,
            "fabricated_critical_facts": fabricated_critical_facts,
            "unsafe_ready_for_review": unsafe_ready_for_review,
        },
        "provider": {
            "outcomes": outcome_counts,
            "schema_attempts": schema_attempts,
        },
        "usage": {
            "latency_ms": {
                "p50": _nearest_rank(latencies, 0.50),
                "p95": _nearest_rank(latencies, 0.95),
                "max": max(latencies) if latencies else None,
            },
            "input_tokens": input_tokens,
            "cached_input_tokens": cached_input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
            "estimated_cost_microusd": estimated_cost_microusd,
            "estimated_cost_usd": estimated_cost_microusd / 1_000_000,
        },
        "failures": failures,
    }


__all__ = [
    "ORDER_INTAKE_EVALUATION_SCHEMA",
    "ORDER_INTAKE_FIXTURE_SCHEMA",
    "ORDER_INTAKE_RESULT_SCHEMA",
    "evaluate_order_intake_results",
]
