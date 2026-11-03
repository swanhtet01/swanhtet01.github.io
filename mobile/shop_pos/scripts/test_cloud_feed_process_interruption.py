#!/usr/bin/env python3
"""Kill task-owned signed-page workers and verify SQLite recovery exactly once."""

from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

from test_shop_process_interruption import _kill_tree


WORKER = "test/shop_connected_cloud_feed_interrupt_worker_test.dart"
TEST_NAME = "synthetic authenticated cloud page process interruption"


def _run(flutter: str, phase: str, database: Path, marker: Path, *, kill: bool) -> None:
    print(f"cloud_feed_process_interruption_phase_started:{phase}", flush=True)
    environment = os.environ.copy()
    environment.update({
        "SUPERMEGA_CLOUD_FEED_INTERRUPT_PHASE": phase,
        "SUPERMEGA_CLOUD_FEED_INTERRUPT_DATABASE": str(database),
        "SUPERMEGA_CLOUD_FEED_INTERRUPT_MARKER": str(marker),
        "TMPDIR": str(database.parent),
    })
    command = [flutter, "test", "--no-pub", WORKER, "--plain-name", TEST_NAME,
               "--concurrency=1", "--reporter=expanded"]
    with tempfile.TemporaryFile(mode="w+") as output:
        process = subprocess.Popen(
            command, env=environment, stdout=output, stderr=subprocess.STDOUT,
            start_new_session=True, text=True,
        )
        try:
            deadline = time.monotonic() + 75
            if kill:
                while time.monotonic() < deadline:
                    if marker.is_file():
                        _kill_tree(process)
                        if process.returncode >= 0:
                            raise RuntimeError(f"{phase} exited without an OS signal")
                        return
                    if process.poll() is not None:
                        break
                    time.sleep(0.05)
                output.seek(0)
                raise RuntimeError(f"{phase} did not reach marker:\n{output.read()[-3000:]}")
            try:
                process.wait(timeout=90)
            except subprocess.TimeoutExpired as exc:
                raise RuntimeError(f"{phase} verification timed out") from exc
            if process.returncode != 0:
                output.seek(0)
                raise RuntimeError(f"{phase} failed:\n{output.read()[-3000:]}")
        finally:
            if process.poll() is None:
                _kill_tree(process)


def main() -> None:
    candidate = Path(os.environ.get("FLUTTER_BIN", "") or shutil.which("flutter") or "")
    if not candidate.is_file() or not os.access(candidate, os.X_OK):
        raise RuntimeError("Set FLUTTER_BIN to the reviewed Flutter executable")
    flutter = str(candidate.resolve())
    for kill_phase, verify_phase in (
        ("kill_after_insert", "verify_rollback"),
        ("kill_after_commit", "verify_commit"),
    ):
        started = time.monotonic()
        print(f"cloud_feed_process_interruption_started:{kill_phase}:{verify_phase}", flush=True)
        with tempfile.TemporaryDirectory(prefix="shop-cloud-feed-interrupt-") as root:
            directory = Path(root)
            database = directory / "shop.sqlite"
            marker = directory / "checkpoint"
            _run(flutter, kill_phase, database, marker, kill=True)
            _run(flutter, verify_phase, database, marker, kill=False)
        print(
            f"cloud_feed_process_interruption_passed:{kill_phase}:{verify_phase}:"
            f"{time.monotonic() - started:.3f}", flush=True,
        )


if __name__ == "__main__":
    main()
