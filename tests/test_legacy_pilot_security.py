from __future__ import annotations

import ast
import sqlite3
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from types import FunctionType
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from mark1_pilot.state_store import (
    add_approval_entry,
    list_approval_entries,
    load_approval_summary,
    update_approval_entry,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
SERVER_PATH = REPO_ROOT / "tools" / "serve_solution.py"
LAUNCHER_PATH = REPO_ROOT / "tools" / "run_solution.ps1"


def _isolated_function(path: Path, name: str) -> FunctionType:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    function = next(
        node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name
    )
    module = ast.Module(body=[function], type_ignores=[])
    ast.fix_missing_locations(module)
    namespace: dict[str, object] = {}
    exec(compile(module, str(path), "exec", dont_inherit=True), namespace)
    return namespace[name]  # type: ignore[return-value]


def _isolated_model(path: Path, name: str) -> type[BaseModel]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    model = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == name)
    module = ast.Module(body=[model], type_ignores=[])
    ast.fix_missing_locations(module)
    namespace = {
        "Any": Any,
        "BaseModel": BaseModel,
        "ConfigDict": ConfigDict,
        "Field": Field,
    }
    exec(compile(module, str(path), "exec", dont_inherit=True), namespace)
    return namespace[name]  # type: ignore[return-value]


class LegacyPilotSecurityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.db_path = Path(self.temp_dir.name) / "legacy-security.db"

    def _add_approval(
        self,
        workspace_id: str,
        *,
        requested_by: str = "Requester",
        payload: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return add_approval_entry(
            self.db_path,
            workspace_id=workspace_id,
            title=f"Approval for {workspace_id}",
            summary="Bounded approval request",
            approval_gate="general",
            requested_by=requested_by,
            owner="Management",
            status="pending",
            due="",
            related_route="/app/approvals",
            related_entity="",
            evidence_link="",
            payload=payload,
        )

    def test_remote_news_urls_are_rejected_before_any_network_path(self) -> None:
        fetch_context = _isolated_function(SERVER_PATH, "_fetch_url_brief_context")
        self.assertEqual(fetch_context([]), [])
        self.assertEqual(fetch_context(["", "  "]), [])
        adversarial_urls = [
            "http://127.0.0.1:5432/private",
            "http://169.254.169.254/latest/meta-data",
            "http://[::1]/admin",
            "https://user:password@example.com/",
            "https://public.example/redirect-to-private",
            "localhost:8787/status",
        ]
        for url in adversarial_urls:
            with self.subTest(url=url), self.assertRaisesRegex(
                ValueError,
                "remote_url_fetch_disabled_use_reviewed_text_or_connector",
            ):
                fetch_context([url])

    def test_launcher_is_loopback_only_and_server_route_is_authenticated(self) -> None:
        launcher = LAUNCHER_PATH.read_text(encoding="utf-8")
        server = SERVER_PATH.read_text(encoding="utf-8")
        self.assertIn('[string]$BindHost = "127.0.0.1"', launcher)
        self.assertIn("$loopbackBindHosts -notcontains $normalizedBindHost", launcher)
        self.assertIn("Remote pilot binding is disabled", launcher)
        self.assertNotIn('[string]$BindHost = "0.0.0.0"', launcher)
        self.assertIn('def tool_news_brief(request_http: Request, request: NewsBriefRequest)', server)
        self.assertIn('detail="News brief access required."', server)
        self.assertIn('"remote_url_fetch": "disabled"', server)

    def test_client_cannot_assert_approval_actor_or_initial_status(self) -> None:
        tree = ast.parse(SERVER_PATH.read_text(encoding="utf-8"))
        model = next(
            node
            for node in tree.body
            if isinstance(node, ast.ClassDef) and node.name == "ApprovalQueueRequest"
        )
        field_names = {
            node.target.id
            for node in model.body
            if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name)
        }
        self.assertNotIn("requested_by", field_names)
        self.assertNotIn("status", field_names)
        self.assertIn("model_config", {node.targets[0].id for node in model.body if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)})
        request_model = _isolated_model(SERVER_PATH, "ApprovalQueueRequest")
        update_model = _isolated_model(SERVER_PATH, "ApprovalQueueUpdateRequest")
        with self.assertRaises(ValidationError):
            request_model(title="Forged", requested_by="Mallory")
        with self.assertRaises(ValidationError):
            request_model(title="Forged", status="approved")
        with self.assertRaises(ValidationError):
            update_model(status="paid")

    def test_approval_rows_and_summaries_are_workspace_scoped(self) -> None:
        row_a = self._add_approval("workspace-a", requested_by="Alice")
        row_b = self._add_approval("workspace-b", requested_by="Bob")

        rows_a = list_approval_entries(self.db_path, workspace_id="workspace-a")
        rows_b = list_approval_entries(self.db_path, workspace_id="workspace-b")
        self.assertEqual([row["approval_id"] for row in rows_a], [row_a["approval_id"]])
        self.assertEqual([row["approval_id"] for row in rows_b], [row_b["approval_id"]])
        self.assertEqual(load_approval_summary(self.db_path, workspace_id="workspace-a")["approval_count"], 1)
        self.assertEqual(load_approval_summary(self.db_path, workspace_id="workspace-b")["approval_count"], 1)
        self.assertEqual(list_approval_entries(self.db_path, workspace_id=""), [])
        self.assertEqual(load_approval_summary(self.db_path, workspace_id="")["approval_count"], 0)

        cross_workspace = update_approval_entry(
            self.db_path,
            approval_id=str(row_a["approval_id"]),
            workspace_id="workspace-b",
            actor="Bob",
            status="approved",
            note="Attempted cross-workspace decision",
        )
        self.assertIsNone(cross_workspace)
        unchanged = list_approval_entries(self.db_path, workspace_id="workspace-a")[0]
        self.assertEqual(unchanged["status"], "pending")

    def test_legacy_unscoped_approval_rows_are_migrated_but_not_claimed(self) -> None:
        connection = sqlite3.connect(self.db_path)
        try:
            connection.execute(
                """
                CREATE TABLE approval_queue (
                    approval_id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    source TEXT NOT NULL,
                    title TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    approval_gate TEXT NOT NULL,
                    requested_by TEXT NOT NULL,
                    owner TEXT NOT NULL,
                    status TEXT NOT NULL,
                    due TEXT NOT NULL,
                    related_route TEXT NOT NULL,
                    related_entity TEXT NOT NULL,
                    evidence_link TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                )
                """
            )
            connection.execute(
                "INSERT INTO approval_queue VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    "APR-LEGACY",
                    "2026-07-01T00:00:00+00:00",
                    "legacy",
                    "Legacy approval",
                    "Unscoped historical row",
                    "general",
                    "Unknown",
                    "Management",
                    "pending",
                    "",
                    "/app/approvals",
                    "",
                    "",
                    "{}",
                ),
            )
            connection.commit()
        finally:
            connection.close()

        self.assertEqual(list_approval_entries(self.db_path, workspace_id="workspace-a"), [])
        legacy_rows = list_approval_entries(self.db_path)
        self.assertEqual(len(legacy_rows), 1)
        self.assertEqual(legacy_rows[0]["workspace_id"], "")
        self.assertIsNone(
            update_approval_entry(
                self.db_path,
                approval_id="APR-LEGACY",
                workspace_id="workspace-a",
                actor="Manager",
                status="approved",
                note="Must not claim unknown historical authority.",
            )
        )

    def test_approval_authority_transitions_and_evidence_fail_closed(self) -> None:
        with self.assertRaisesRegex(ValueError, "approval_must_start_pending"):
            add_approval_entry(
                self.db_path,
                workspace_id="workspace-a",
                title="Forged approved row",
                summary="",
                approval_gate="general",
                requested_by="Mallory",
                owner="Management",
                status="approved",
                due="",
                related_route="/app/approvals",
                related_entity="",
                evidence_link="",
            )

        row = self._add_approval(
            "workspace-a",
            requested_by="Alice",
            payload={
                "_approval_authority": {"workspace_id": "workspace-b", "requested_by": "Mallory"},
                "decision_history": [{"actor": "Mallory", "to_status": "approved"}],
                "business_context": "preserved",
            },
        )
        authority = row["payload"]["_approval_authority"]  # type: ignore[index]
        self.assertEqual(authority, {"workspace_id": "workspace-a", "requested_by": "Alice"})
        self.assertNotIn("decision_history", row["payload"])  # type: ignore[operator]

        with self.assertRaisesRegex(ValueError, "approval_actor_required"):
            update_approval_entry(
                self.db_path,
                approval_id=str(row["approval_id"]),
                workspace_id="workspace-a",
                actor="",
                status="review",
            )
        with self.assertRaisesRegex(ValueError, "approval_decision_note_required"):
            update_approval_entry(
                self.db_path,
                approval_id=str(row["approval_id"]),
                workspace_id="workspace-a",
                actor="Manager",
                status="approved",
            )

        approved = update_approval_entry(
            self.db_path,
            approval_id=str(row["approval_id"]),
            workspace_id="workspace-a",
            actor="Manager",
            status="approved",
            note="Evidence reviewed and accepted.",
        )
        self.assertIsNotNone(approved)
        self.assertEqual(approved["status"], "approved")  # type: ignore[index]
        history = approved["payload"]["decision_history"]  # type: ignore[index]
        self.assertEqual(history[-1]["actor"], "Manager")
        self.assertEqual(history[-1]["from_status"], "pending")
        self.assertEqual(history[-1]["to_status"], "approved")

        idempotent = update_approval_entry(
            self.db_path,
            approval_id=str(row["approval_id"]),
            workspace_id="workspace-a",
            actor="Manager",
            status="approved",
        )
        self.assertEqual(idempotent["payload"]["decision_history"], history)  # type: ignore[index]
        with self.assertRaisesRegex(ValueError, "invalid_approval_status_transition"):
            update_approval_entry(
                self.db_path,
                approval_id=str(row["approval_id"]),
                workspace_id="workspace-a",
                actor="Manager",
                status="rejected",
                note="Cannot reverse a terminal decision.",
            )


if __name__ == "__main__":
    unittest.main()
