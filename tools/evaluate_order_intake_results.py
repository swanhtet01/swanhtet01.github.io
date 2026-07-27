from __future__ import annotations

import argparse
import json
from pathlib import Path

from supermega_runtime.order_intake_eval import evaluate_order_intake_results


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FIXTURES = REPOSITORY_ROOT / "tests" / "fixtures" / "order_intake_v1.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Score pre-generated AI order-intake drafts without network, storage, "
            "command, payment, or customer-message side effects. Every result must "
            "include bounded latency, token, cost, and schema-attempt metrics."
        )
    )
    parser.add_argument(
        "--results",
        type=Path,
        required=True,
        help="JSON document using supermega.order_intake.results.v1.",
    )
    parser.add_argument(
        "--fixtures",
        type=Path,
        default=DEFAULT_FIXTURES,
        help="Bounded fixture corpus (defaults to the repository's 20 cases).",
    )
    return parser.parse_args()


def load_json(path: Path) -> dict[str, object]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def main() -> int:
    args = parse_args()
    report = evaluate_order_intake_results(
        load_json(args.fixtures),
        load_json(args.results),
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["quality_gate_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
