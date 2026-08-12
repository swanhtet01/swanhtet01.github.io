"""Run the Order Intake golden-set evaluation and write a sanitized results document.

Live mode requires ANTHROPIC_API_KEY or OPENAI_API_KEY (fails closed with zero
network calls without either; set SUPERMEGA_ORDER_INTAKE_PROVIDER to choose
explicitly), feeds the 20-fixture corpus through the hardened provider, captures the
bounded metrics contract per fixture, writes the
supermega.order_intake.results.v1 document, and scores it with the offline
evaluator. `--self-test` proves the whole pipeline offline: drafts are built
from the corpus's expected values, the produced document must pass every
quality gate, and no network is touched.

The results document is structurally sanitized: it carries only drafts and
bounded metrics, and the scorer rejects any private-source or operational key.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from supermega_runtime.order_intake import (  # noqa: E402
    OrderIntakeCatalogItem,
    build_order_intake_draft,
)
from supermega_runtime.order_intake_eval import (  # noqa: E402
    ORDER_INTAKE_RESULT_SCHEMA,
    evaluate_order_intake_results,
)

FIXTURE_PATH = REPO_ROOT / "tests" / "fixtures" / "order_intake_v1.json"
DEFAULT_OUTPUT_PATH = REPO_ROOT / "evidence" / "order-intake-eval-results.json"

# Explicit pricing assumptions for the estimated-cost metric, in microUSD per
# token; override via environment when provider pricing changes.
INPUT_PRICE_MICROUSD_PER_TOKEN = float(os.getenv("SUPERMEGA_ORDER_INTAKE_INPUT_PRICE", "0.25"))
CACHED_PRICE_MICROUSD_PER_TOKEN = float(os.getenv("SUPERMEGA_ORDER_INTAKE_CACHED_PRICE", "0.025"))
OUTPUT_PRICE_MICROUSD_PER_TOKEN = float(os.getenv("SUPERMEGA_ORDER_INTAKE_OUTPUT_PRICE", "2.0"))


def load_corpus() -> dict[str, object]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def estimated_cost_microusd(input_tokens: int, cached_tokens: int, output_tokens: int) -> int:
    fresh_input = max(0, input_tokens - cached_tokens)
    cost = (
        fresh_input * INPUT_PRICE_MICROUSD_PER_TOKEN
        + cached_tokens * CACHED_PRICE_MICROUSD_PER_TOKEN
        + output_tokens * OUTPUT_PRICE_MICROUSD_PER_TOKEN
    )
    return max(0, round(cost))


def run_live(output_path: Path) -> int:
    from supermega_runtime.order_intake_provider import order_intake_provider_from_environment

    provider = order_intake_provider_from_environment()
    if provider is None:
        print(json.dumps({
            "ok": False,
            "error": "order_intake_api_key_missing",
            "detail": (
                "Set ANTHROPIC_API_KEY or OPENAI_API_KEY to run the live evaluation; "
                "no network call was made."
            ),
        }))
        return 2

    corpus = load_corpus()
    catalog = [OrderIntakeCatalogItem.model_validate(item) for item in corpus["catalog"]]
    captured_usage: list[dict[str, int]] = []
    original_transport = provider._transport  # noqa: SLF001 - deliberate capture shim

    def capturing_transport(*args, **kwargs):
        response = original_transport(*args, **kwargs)
        usage = response.get("usage") if isinstance(response, dict) else None
        usage = usage if isinstance(usage, dict) else {}
        details = usage.get("input_tokens_details")
        details = details if isinstance(details, dict) else {}
        # OpenAI reports cache hits under input_tokens_details.cached_tokens;
        # Anthropic reports them as a sibling cache_read_input_tokens counter.
        cached_input_tokens = int(
            details.get("cached_tokens") or usage.get("cache_read_input_tokens") or 0
        )
        captured_usage.append({
            "input_tokens": int(usage.get("input_tokens") or 0),
            "cached_input_tokens": cached_input_tokens,
            "output_tokens": int(usage.get("output_tokens") or 0),
        })
        return response

    provider._transport = capturing_transport  # noqa: SLF001

    results: list[dict[str, object]] = []
    for fixture in corpus["fixtures"]:
        fixture_id = str(fixture["id"])
        started = time.monotonic()
        try:
            draft = asyncio.run(provider.generate(
                message=str(fixture["message"]),
                catalog=catalog,
                workspace_id="order-intake-eval",
                actor_id="eval-runner",
            ))
        except Exception as error:  # noqa: BLE001 - abort with a truthful failure record
            print(json.dumps({
                "ok": False,
                "error": "order_intake_eval_fixture_failed",
                "fixture_id": fixture_id,
                "detail": str(error)[:240],
                "completed_before_failure": len(results),
            }))
            return 1
        latency_ms = max(0, round((time.monotonic() - started) * 1_000))
        usage = captured_usage[-1] if captured_usage else {"input_tokens": 0, "cached_input_tokens": 0, "output_tokens": 0}
        results.append({
            "fixture_id": fixture_id,
            "outcome": "completed",
            "draft": draft.model_dump(mode="json"),
            "metrics": {
                "latency_ms": min(latency_ms, 600_000),
                "input_tokens": usage["input_tokens"],
                "cached_input_tokens": min(usage["cached_input_tokens"], usage["input_tokens"]),
                "output_tokens": usage["output_tokens"],
                "estimated_cost_microusd": estimated_cost_microusd(
                    usage["input_tokens"], usage["cached_input_tokens"], usage["output_tokens"],
                ),
                "schema_attempts": 1,
            },
        })

    document = {"schema": ORDER_INTAKE_RESULT_SCHEMA, "results": results}
    return score_and_write(corpus, document, output_path)


def run_self_test(output_path: Path) -> int:
    from tests.test_order_intake import evaluation_metrics, extraction_from_fixture

    corpus = load_corpus()
    catalog = [OrderIntakeCatalogItem.model_validate(item) for item in corpus["catalog"]]
    results: list[dict[str, object]] = []
    for index, fixture in enumerate(corpus["fixtures"], start=1):
        draft = build_order_intake_draft(
            message=str(fixture["message"]),
            catalog=catalog,
            extraction=extraction_from_fixture(fixture),
            response_id=f"resp-self-test-{index}",
            model="self-test-fixture-model",
            request_id=f"OID-{index:032x}",
            generated_at=datetime(2026, 8, 7, 10, index, tzinfo=UTC),
        )
        results.append({
            "fixture_id": str(fixture["id"]),
            "outcome": "completed",
            "draft": draft.model_dump(mode="json"),
            "metrics": evaluation_metrics(index),
        })
    document = {"schema": ORDER_INTAKE_RESULT_SCHEMA, "results": results}
    return score_and_write(corpus, document, output_path, self_test=True)


def score_and_write(
    corpus: dict[str, object],
    document: dict[str, object],
    output_path: Path,
    *,
    self_test: bool = False,
) -> int:
    report = evaluate_order_intake_results(corpus, document)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "ok": bool(report["quality_gate_passed"]),
        "mode": "self_test" if self_test else "live",
        "output": str(output_path.relative_to(REPO_ROOT)) if output_path.is_relative_to(REPO_ROOT) else str(output_path),
        "total": report["total"],
        "passed": report["passed"],
        "failed": report["failed"],
        "quality_gate_passed": report["quality_gate_passed"],
        "quality": report["quality"],
        "usage": report["usage"],
    }, ensure_ascii=False))
    return 0 if report["quality_gate_passed"] else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the Order Intake golden-set evaluation.")
    parser.add_argument("--out", default=None)
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Prove the runner offline from fixture expectations; no network, no key.",
    )
    args = parser.parse_args()
    if args.out is None:
        # A synthetic self-test document must never land beside real evidence.
        import tempfile
        default_out = (
            Path(tempfile.gettempdir()) / "supermega-order-intake-self-test.json"
            if args.self_test
            else DEFAULT_OUTPUT_PATH
        )
    else:
        default_out = Path(args.out)
    output_path = default_out
    if not output_path.is_absolute():
        output_path = REPO_ROOT / output_path
    if args.self_test:
        return run_self_test(output_path)
    return run_live(output_path)


if __name__ == "__main__":
    raise SystemExit(main())
