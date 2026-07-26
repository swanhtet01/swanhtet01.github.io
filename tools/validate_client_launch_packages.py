from __future__ import annotations

import json
from pathlib import Path
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from supermega_runtime.client_import_runtime import (  # noqa: E402
    CLIENT_IMPORT_MAX_PACKAGE_BYTES,
    CLIENT_IMPORT_PROFILE_IDS,
    ClientImportValidationError,
    validate_client_import_staging_package,
)


BATCH_CONTRACT = "supermega.client_launch_validation_batch.v1"
RESULT_CONTRACT = "supermega.client_launch_server_validation.v1"
EXPECTED_PACKAGE_COUNT = 12
MAX_INPUT_BYTES = EXPECTED_PACKAGE_COUNT * CLIENT_IMPORT_MAX_PACKAGE_BYTES + 16_384
EXPECTED_PROFILES = tuple(
    (product, profile_id)
    for product, profile_ids in CLIENT_IMPORT_PROFILE_IDS.items()
    for profile_id in profile_ids
)


def _object_without_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for key, value in pairs:
        if key in output:
            raise ValueError("Duplicate JSON object keys are not allowed.")
        output[key] = value
    return output


def _read_payload() -> dict[str, Any]:
    raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
    if len(raw) > MAX_INPUT_BYTES:
        raise ValueError("The client launch validation batch is too large.")
    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=_object_without_duplicate_keys)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("The client launch validation batch must be UTF-8 JSON.") from exc
    if not isinstance(value, dict) or set(value) != {"contract", "packages"}:
        raise ValueError("The client launch validation batch fields are invalid.")
    if value["contract"] != BATCH_CONTRACT:
        raise ValueError("The client launch validation batch contract is unsupported.")
    packages = value["packages"]
    if not isinstance(packages, list) or len(packages) != EXPECTED_PACKAGE_COUNT:
        raise ValueError(f"The client launch rehearsal requires exactly {EXPECTED_PACKAGE_COUNT} packages.")
    return value


def validate_batch_context(packages: list[dict[str, Any]], results: list[dict[str, Any]]) -> None:
    actual_profiles = tuple(
        (result["product"], result["workflow_template_id"])
        for result in results
    )
    if actual_profiles != EXPECTED_PROFILES:
        raise ValueError("The validation batch must contain every workflow profile exactly once in canonical order.")
    workspace_contexts = {
        (package["workspace"], package["owner"])
        for package in packages
    }
    if len(workspace_contexts) != 1:
        raise ValueError("The validation batch must retain one workspace and responsible owner.")


def main() -> int:
    try:
        payload = _read_payload()
        results = [
            validate_client_import_staging_package(package).to_dict()
            for package in payload["packages"]
        ]
        validate_batch_context(payload["packages"], results)
        response = {
            "ok": True,
            "contract": RESULT_CONTRACT,
            "package_count": len(results),
            "results": results,
            "profile_coverage_complete": True,
            "single_workspace_context": True,
            "external_writes_performed": False,
        }
        print(json.dumps(response, ensure_ascii=False, separators=(",", ":")))
        return 0
    except (ClientImportValidationError, TypeError, ValueError) as exc:
        response = {
            "ok": False,
            "contract": RESULT_CONTRACT,
            "error": str(exc)[:240] or "Client launch validation failed.",
            "external_writes_performed": False,
        }
        print(json.dumps(response, ensure_ascii=False, separators=(",", ":")))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
