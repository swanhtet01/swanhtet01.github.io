from __future__ import annotations

import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from tools.prepare_client_launch_board import (
    ClientLaunchBoardError,
    build_client_launch_board,
    verify_client_launch_board,
)


ROOT = Path(__file__).resolve().parents[1]
PREPARE_TOOL = ROOT / "tools" / "prepare_client_demo.mjs"
BOARD_TOOL = ROOT / "tools" / "prepare_client_launch_board.py"


def _run(*arguments: object) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(argument) for argument in arguments],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=90,
        check=False,
    )


class ClientLaunchBoardTests(unittest.TestCase):
    def _preparation(
        self,
        directory: Path,
        *,
        products: str = "shop,website,ecommerce",
        real_client_data: bool = False,
    ) -> Path:
        intake = directory / "intake"
        initialized = _run(
            "node", PREPARE_TOOL, "--init", intake,
            "--preset", "service-business",
            "--products", products,
        )
        self.assertEqual(initialized.returncode, 0, initialized.stderr)
        profile_path = intake / "client.json"
        profile = json.loads(profile_path.read_text(encoding="utf-8"))
        profile["workspace"] = "Lotus Wellness Spa" if real_client_data else "Beauty Spa Client Pilot"
        profile["owner"] = "Mya Mya Win" if real_client_data else "SuperMega implementation owner"
        profile_path.write_text(
            json.dumps(profile, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        if real_client_data:
            for product in ("commerce", "production", "website", "ecommerce"):
                template = intake / "_templates" / f"{product}.csv"
                if template.exists():
                    shutil.copyfile(template, intake / f"{product}.csv")
        preparation_path = directory / "private-review.json"
        prepared = _run("node", PREPARE_TOOL, "--data-dir", intake, "--out", preparation_path)
        self.assertEqual(prepared.returncode, 0, prepared.stderr)
        return preparation_path

    def test_cli_builds_one_spa_launch_board_and_verifies_it(self) -> None:
        with tempfile.TemporaryDirectory(prefix="supermega-launch-board-") as temporary:
            directory = Path(temporary)
            preparation_path = self._preparation(directory)
            board_path = directory / "client-launch-board.json"
            prepared = _run(
                sys.executable, "-s", BOARD_TOOL, "prepare",
                "--preparation", preparation_path,
                "--output", board_path,
            )
            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            summary = json.loads(prepared.stdout)
            self.assertEqual(summary["productCount"], 3)
            self.assertEqual(summary["connectionCount"], 2)
            self.assertFalse(summary["tenantWritesPerformed"])

            board = json.loads(board_path.read_text(encoding="utf-8"))
            self.assertEqual(board["status"], "blocked_for_real_client_evidence")
            self.assertEqual(
                [product["productId"] for product in board["products"]],
                ["shop", "website", "ecommerce"],
            )
            self.assertEqual(board["products"][0]["startPath"], "/settings/?product=shop&pack=spa")
            self.assertEqual(
                [connection["id"] for connection in board["connections"]],
                ["website-shop-intake", "ecommerce-shop-orders"],
            )
            self.assertTrue(all(not item["automaticCrossProductWrites"] for item in board["connections"]))
            self.assertEqual(board["launchStages"][1]["status"], "ready")
            self.assertEqual(board["launchStages"][-1]["status"], "owner_gated")
            self.assertEqual(board["customSolutions"]["availableForProducts"], ["shop", "website", "ecommerce"])
            self.assertFalse(board["controls"]["containsRawClientRows"])
            self.assertFalse(board["controls"]["providerCallsPerformed"])

            verified = _run(
                sys.executable, "-s", BOARD_TOOL, "verify",
                "--preparation", preparation_path,
                "--board", board_path,
            )
            self.assertEqual(verified.returncode, 0, verified.stderr)
            self.assertEqual(json.loads(verified.stdout)["boardDigest"], board["boardDigest"])

    def test_real_identity_and_rows_advance_only_the_intake_stage(self) -> None:
        with tempfile.TemporaryDirectory(prefix="supermega-launch-board-real-") as temporary:
            directory = Path(temporary)
            preparation_path = self._preparation(directory, real_client_data=True)
            preparation = json.loads(preparation_path.read_text(encoding="utf-8"))
            board = build_client_launch_board(preparation)
            self.assertEqual(board["launchStages"][0]["status"], "ready")
            self.assertEqual(board["launchStages"][2]["status"], "blocked")
            self.assertEqual(board["launchStages"][3]["status"], "blocked")
            self.assertIn("managed_trial_request_required:shop", board["blockingGates"])
            self.assertNotIn("reviewed_client_data_required:shop", board["blockingGates"])

    def test_connections_require_both_entitled_products(self) -> None:
        with tempfile.TemporaryDirectory(prefix="supermega-launch-board-single-") as temporary:
            directory = Path(temporary)
            preparation_path = self._preparation(directory, products="website")
            preparation = json.loads(preparation_path.read_text(encoding="utf-8"))
            board = build_client_launch_board(preparation)
            self.assertEqual(board["customSolutions"]["availableForProducts"], ["website"])
            self.assertEqual(board["connections"], [])

    def test_verifier_rejects_a_tampered_gate(self) -> None:
        with tempfile.TemporaryDirectory(prefix="supermega-launch-board-tamper-") as temporary:
            directory = Path(temporary)
            preparation_path = self._preparation(directory)
            preparation = json.loads(preparation_path.read_text(encoding="utf-8"))
            board = build_client_launch_board(preparation)
            board["launchStages"][-1]["status"] = "ready"
            with self.assertRaises(ClientLaunchBoardError):
                verify_client_launch_board(board, preparation)


if __name__ == "__main__":
    unittest.main()
