#!/usr/bin/env python3
"""Synthetic Python TestClient -> two native v41 SQLite stores; never live sync."""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import tempfile
import time

from supermega_runtime.connected_site_v15 import canonical_json
from tests.v41_native_http_bridge_fixture import build_response


ROOT = Path(__file__).resolve().parents[1]
NATIVE = ROOT / "mobile/shop_pos"
NATIVE_TEST = "test/shop_connected_cloud_feed_schema_test.dart"
FIXTURES = (
    ("device-a", "v41 signed historical page stays closed after later revocation"),
    ("device-b", "v41 second device persists independent signed feed after outage"),
)


def _run(command: list[str], *, label: str, cwd: Path,
         env: dict[str, str], timeout: int) -> None:
    started = time.monotonic()
    completed = subprocess.run(
        command, cwd=cwd, env=env, capture_output=True, text=True,
        timeout=timeout, check=False,
    )
    if completed.returncode:
        raise RuntimeError(
            f"native_v41_bridge_failed:{completed.returncode}:{label}:\n"
            + (completed.stdout + completed.stderr)[-3000:]
        )
    print(f"native_v41_bridge_passed:{label}:{time.monotonic() - started:.3f}", flush=True)


def main() -> None:
    flutter = Path(os.environ.get("FLUTTER_BIN", ""))
    if not flutter.is_file() or not os.access(flutter, os.X_OK):
        raise RuntimeError("Set FLUTTER_BIN to the verified Flutter executable")
    with tempfile.TemporaryDirectory(prefix="supermega-v41-http-bridge-") as directory:
        root = Path(directory)
        responses: dict[str, Path] = {}
        for name, test_name in FIXTURES:
            database = root / f"{name}.sqlite"
            env = {**os.environ, "TMPDIR": directory,
                   "SUPERMEGA_CLOUD_FEED_V41_FIXTURE_DATABASE": str(database)}
            _run([str(flutter), "test", "--no-pub", NATIVE_TEST,
                  "--plain-name", test_name, "--reporter=expanded"],
                 label=f"export_{name}", cwd=NATIVE, env=env, timeout=120)
            if not database.is_file():
                raise RuntimeError(f"native_v41_bridge_fixture_missing:{name}")
            response = build_response(database)
            output = root / f"{name}.json"
            output.write_text(canonical_json(response) + "\n", encoding="utf-8")
            responses[name] = output
        env = {
            **os.environ, "TMPDIR": directory,
            "SUPERMEGA_CLOUD_FEED_V41_HTTP_RESPONSE_A": str(responses["device-a"]),
            "SUPERMEGA_CLOUD_FEED_V41_HTTP_RESPONSE": str(responses["device-b"]),
        }
        _run([str(flutter), "test", "--no-pub", NATIVE_TEST,
              "--reporter=expanded"], label="signed_http_to_native_a_b",
             cwd=NATIVE, env=env, timeout=240)


if __name__ == "__main__":
    main()
