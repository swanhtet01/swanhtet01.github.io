#!/usr/bin/env python3
"""Synthetic Python TestClient -> two native v41 SQLite stores; never live sync."""

from __future__ import annotations

import os
import json
from pathlib import Path
import subprocess
import tempfile
import time

from supermega_runtime.connected_site_v15 import canonical_json
from tests.v41_native_http_bridge_fixture import build_response, build_pg_response


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
    real_pg = os.environ.get("SUPERMEGA_CLOUD_FEED_V41_DISPOSABLE_PG17") == "1"
    if real_pg and os.environ.get("SUPERMEGA_TEST_DISPOSABLE_PG17") != "1":
        raise RuntimeError("native_v41_bridge_disposable_pg17_flag_required")
    # The existing rehearsal helper creates a fresh loopback cluster, installs
    # source migrations and enforces teardown. Never accept a caller DB URL.
    pg_fixture = None
    if real_pg:
        from tests.test_connected_site_postgres17 import ConnectedSitePostgres17Tests
        pg_fixture = ConnectedSitePostgres17Tests
        try:
            pg_fixture.setUpClass()
        except BaseException:
            pg_fixture.doClassCleanups()
            raise
    try:
        _run_bridge(flutter, real_pg=real_pg, pg_fixture=pg_fixture)
    finally:
        if pg_fixture is not None:
            pg_fixture.doClassCleanups()


def _run_bridge(flutter: Path, *, real_pg: bool, pg_fixture) -> None:
    with tempfile.TemporaryDirectory(prefix="supermega-v41-http-bridge-") as directory:
        root = Path(directory)
        responses: dict[str, Path] = {}
        fixture_env = {**os.environ, "TMPDIR": directory}
        if real_pg:
            # Both devices share one authority, but each request is signed
            # immediately before its own checked PostgreSQL read.
            fixture_env["SUPERMEGA_CLOUD_FEED_V41_REAL_PG_ANCHOR"] = "1"
            fixture_env["SUPERMEGA_CLOUD_FEED_V41_AUTHORITY_NOW_MILLIS"] = str(
                int(time.time() * 1000))
        previous: tuple[str, str, str] | None = None
        for index, (name, test_name) in enumerate(FIXTURES):
            database = root / f"{name}.sqlite"
            if real_pg:
                fixture_env[
                    "SUPERMEGA_CLOUD_FEED_V41_FIXTURE_NOW_MILLIS_A"
                    if index == 0 else "SUPERMEGA_CLOUD_FEED_V41_FIXTURE_NOW_MILLIS_B"
                ] = str(int(time.time() * 1000))
            env = {**fixture_env,
                   "SUPERMEGA_CLOUD_FEED_V41_FIXTURE_DATABASE": str(database)}
            _run([str(flutter), "test", "--no-pub", NATIVE_TEST,
                  "--plain-name", test_name, "--reporter=expanded"],
                 label=f"export_{name}", cwd=NATIVE, env=env, timeout=120)
            if not database.is_file():
                raise RuntimeError(f"native_v41_bridge_fixture_missing:{name}")
            if real_pg:
                if pg_fixture is None:
                    raise RuntimeError("native_v41_bridge_pg_fixture_missing")
                response, previous = build_pg_response(
                    database, admin_url=pg_fixture.admin_url,
                    runtime_url=pg_fixture.runtime_url,
                    first=index == 0, previous=previous,
                )
            else:
                response = build_response(database)
            output = root / f"{name}.json"
            output.write_text(canonical_json(response) + "\n", encoding="utf-8")
            responses[name] = output
            if real_pg:
                proof = json.loads(response["proofJson"])
                trusted_now = int(time.time() * 1000)
                if (
                    type(proof.get("issuedAtMillis")) is not int
                    or type(proof.get("expiresAtMillis")) is not int
                    or not proof["issuedAtMillis"] <= trusted_now < proof["expiresAtMillis"]
                ):
                    raise RuntimeError("native_v41_bridge_proof_outside_live_window")
                suffix = "A" if index == 0 else "B"
                consume_env = {
                    **fixture_env,
                    f"SUPERMEGA_CLOUD_FEED_V41_TRUSTED_NOW_MILLIS_{suffix}": str(trusted_now),
                    "SUPERMEGA_CLOUD_FEED_V41_HTTP_RESPONSE_A": str(responses["device-a"]),
                }
                if index == 1:
                    consume_env["SUPERMEGA_CLOUD_FEED_V41_HTTP_RESPONSE"] = str(
                        responses["device-b"])
                consume_name = (
                    "v41 first device consumes authenticated HTTP feed after outage"
                    if index == 0 else test_name
                )
                _run([str(flutter), "test", "--no-pub", NATIVE_TEST,
                      "--plain-name", consume_name, "--reporter=expanded"],
                     label=f"checked_pg_to_native_{name}", cwd=NATIVE,
                     env=consume_env, timeout=60)
                if int(time.time() * 1000) >= proof["expiresAtMillis"]:
                    raise RuntimeError("native_v41_bridge_consume_exceeded_proof_expiry")
        if real_pg:
            return
        env = {
            **fixture_env,
            "SUPERMEGA_CLOUD_FEED_V41_HTTP_RESPONSE_A": str(responses["device-a"]),
            "SUPERMEGA_CLOUD_FEED_V41_HTTP_RESPONSE": str(responses["device-b"]),
        }
        _run([str(flutter), "test", "--no-pub", NATIVE_TEST,
              "--reporter=expanded"], label="signed_http_to_native_a_b",
             cwd=NATIVE, env=env, timeout=240)


if __name__ == "__main__":
    main()
