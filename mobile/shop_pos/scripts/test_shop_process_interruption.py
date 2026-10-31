#!/usr/bin/env python3
"""Terminate real Flutter checkout workers and verify the reopened Shop store."""

from __future__ import annotations

import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time


WORKER = "test/shop_process_interrupt_worker_test.dart"
TEST_NAME = "synthetic process interruption worker"


class HarnessFailure(RuntimeError):
    pass


def _flutter() -> str:
    configured = os.environ.get("FLUTTER_BIN", "").strip()
    candidate = configured or shutil.which("flutter") or ""
    path = Path(candidate)
    if not path.is_file() or not os.access(path, os.X_OK):
        raise HarnessFailure("Set FLUTTER_BIN to the reviewed Flutter executable.")
    return str(path.resolve())


def _environment(
    phase: str,
    database: Path,
    marker: Path,
    authorization_issued_at: int,
) -> dict[str, str]:
    environment = os.environ.copy()
    environment.update(
        {
            # Flutter compiler scratch data belongs to this scenario and is
            # removed with its synthetic database even when the worker dies.
            "TMPDIR": str(database.parent),
            "SUPERMEGA_PROCESS_INTERRUPT_PHASE": phase,
            "SUPERMEGA_PROCESS_INTERRUPT_DATABASE": str(database),
            "SUPERMEGA_PROCESS_INTERRUPT_MARKER": str(marker),
            "SUPERMEGA_PROCESS_INTERRUPT_AUTH_ISSUED_AT": str(
                authorization_issued_at
            ),
        }
    )
    return environment


def _command(flutter: str) -> list[str]:
    return [
        flutter,
        "test",
        "--no-pub",
        WORKER,
        "--plain-name",
        TEST_NAME,
        "--concurrency=1",
    ]


def _descendants(root_pid: int) -> list[int]:
    parents: dict[int, int] = {}
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            stat = (entry / "stat").read_text(encoding="utf-8")
            fields = stat[stat.rfind(")") + 2 :].split()
            parents[int(entry.name)] = int(fields[1])
        except (FileNotFoundError, IndexError, PermissionError, ValueError):
            continue
    found: list[int] = []
    frontier = [root_pid]
    while frontier:
        parent = frontier.pop()
        children = [pid for pid, ppid in parents.items() if ppid == parent]
        found.extend(children)
        frontier.extend(children)
    return found


def _kill_tree(process: subprocess.Popen[str]) -> None:
    descendants = _descendants(process.pid)
    for pid in reversed(descendants):
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    process.wait(timeout=15)
    survivors = [pid for pid in descendants if Path(f"/proc/{pid}").exists()]
    for pid in survivors:
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def _kill_at_marker(
    flutter: str,
    phase: str,
    database: Path,
    marker: Path,
    authorization_issued_at: int,
) -> None:
    with tempfile.TemporaryFile(mode="w+") as output:
        process = subprocess.Popen(
            _command(flutter),
            env=_environment(
                phase,
                database,
                marker,
                authorization_issued_at,
            ),
            stdout=output,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            text=True,
        )
        deadline = time.monotonic() + 90
        try:
            while time.monotonic() < deadline:
                if marker.is_file():
                    _kill_tree(process)
                    return_code = process.returncode
                    if return_code >= 0:
                        raise HarnessFailure(
                            f"{phase} did not end from an OS signal: {return_code}"
                        )
                    return
                return_code = process.poll()
                if return_code is not None:
                    output.seek(0)
                    raise HarnessFailure(
                        f"{phase} exited before its checkpoint ({return_code}):\n"
                        + output.read()[-4000:]
                    )
                time.sleep(0.05)
            raise HarnessFailure(f"{phase} did not reach its checkpoint in time.")
        finally:
            if process.poll() is None:
                _kill_tree(process)


def _verify(
    flutter: str,
    phase: str,
    database: Path,
    marker: Path,
    authorization_issued_at: int,
) -> None:
    process = subprocess.Popen(
        _command(flutter),
        env=_environment(
            phase,
            database,
            marker,
            authorization_issued_at,
        ),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        start_new_session=True,
    )
    try:
        output, _ = process.communicate(timeout=120)
    except subprocess.TimeoutExpired as exc:
        _kill_tree(process)
        partial = exc.output if isinstance(exc.output, str) else ""
        raise HarnessFailure(f"{phase} verification timed out:\n{partial[-6000:]}") from exc
    if process.returncode != 0:
        raise HarnessFailure(
            f"{phase} verification failed ({process.returncode}):\n"
            + output[-6000:]
        )


def _scenario(flutter: str, kill_phase: str, verify_phase: str) -> None:
    with tempfile.TemporaryDirectory(prefix="supermega-shop-process-interrupt-") as root:
        directory = Path(root)
        database = directory / "shop.sqlite"
        marker = directory / "checkpoint"
        authorization_issued_at = int(time.time() * 1000) - 1000
        _kill_at_marker(
            flutter,
            kill_phase,
            database,
            marker,
            authorization_issued_at,
        )
        _verify(
            flutter,
            verify_phase,
            database,
            marker,
            authorization_issued_at,
        )


def main() -> None:
    flutter = _flutter()
    _scenario(flutter, "kill_during_transaction", "verify_rolled_back")
    _scenario(flutter, "kill_after_commit", "verify_committed")
    _scenario(
        flutter,
        "kill_stock_during_transaction",
        "verify_stock_rolled_back",
    )
    _scenario(flutter, "kill_stock_after_commit", "verify_stock_committed")
    _scenario(
        flutter,
        "kill_shift_close_during_transaction",
        "verify_shift_close_rolled_back",
    )
    _scenario(
        flutter,
        "kill_shift_close_after_commit",
        "verify_shift_close_committed",
    )
    _scenario(
        flutter,
        "kill_cash_movement_during_transaction",
        "verify_cash_movement_rolled_back",
    )
    _scenario(
        flutter,
        "kill_cash_movement_after_commit",
        "verify_cash_movement_committed",
    )
    _scenario(
        flutter,
        "kill_cafe_sale_during_transaction",
        "verify_cafe_sale_rolled_back",
    )
    _scenario(
        flutter,
        "kill_cafe_sale_after_commit",
        "verify_cafe_sale_committed",
    )
    _scenario(
        flutter,
        "kill_cash_reversal_during_transaction",
        "verify_cash_reversal_rolled_back",
    )
    _scenario(
        flutter,
        "kill_cash_reversal_after_commit",
        "verify_cash_reversal_committed",
    )
    _scenario(
        flutter,
        "kill_wallet_cancel_during_transaction",
        "verify_wallet_cancel_rolled_back",
    )
    _scenario(
        flutter,
        "kill_wallet_cancel_after_commit",
        "verify_wallet_cancel_committed",
    )
    print("Shop process-interruption scenarios passed: 14")


if __name__ == "__main__":
    main()
