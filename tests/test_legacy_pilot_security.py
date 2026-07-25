from __future__ import annotations

import ast
import importlib.util
import sqlite3
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from types import FunctionType, ModuleType
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
AGENT_RUNNER_PATH = REPO_ROOT / "tools" / "run_supermega_agent_jobs.py"
FOUNDER_CYCLE_PATH = REPO_ROOT / "tools" / "run_supermega_founder_cycle.ps1"
COMPOSE_PATH = REPO_ROOT / "docker-compose.yml"


def _isolated_function(path: Path, name: str) -> FunctionType:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    function = next(
        node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name
    )
    module = ast.Module(body=[function], type_ignores=[])
    ast.fix_missing_locations(module)
    namespace: dict[str, object] = {
        "Any": Any,
        "PREVIEW_DEPLOY_APPROVAL_GATE": "deployment.preview",
        "PREVIEW_DEPLOY_APPROVAL_ROUTE": "/api/cloud/deployments/preview",
    }
    exec(compile(module, str(path), "exec", dont_inherit=True), namespace)
    return namespace[name]  # type: ignore[return-value]


def _load_module(path: Path, name: str) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _nested_function_source(path: Path, name: str) -> str:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source)
    node = next(item for item in ast.walk(tree) if isinstance(item, ast.FunctionDef) and item.name == name)
    return ast.get_source_segment(source, node) or ""


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

    def test_agent_view_execute_and_deploy_authority_are_separate(self) -> None:
        server = SERVER_PATH.read_text(encoding="utf-8")
        manager_block = server.split("MANAGER_CAPABILITIES =", 1)[1].split("OWNER_CAPABILITIES =", 1)[0]
        owner_block = server.split("OWNER_CAPABILITIES =", 1)[1].split("PLATFORM_ADMIN_CAPABILITIES =", 1)[0]
        self.assertIn('"agent_ops.view"', manager_block)
        self.assertNotIn('"agent_ops.execute"', manager_block)
        self.assertNotIn('"agent_ops.deploy"', manager_block)
        self.assertIn('"agent_ops.execute"', owner_block)
        self.assertIn('"agent_ops.deploy"', owner_block)

        self.assertIn(
            "_require_agent_ops_view_access(request)",
            _nested_function_source(SERVER_PATH, "agent_runs"),
        )
        for function_name in ("create_agent_run", "process_agent_run_queue", "run_default_agent_runs"):
            with self.subTest(function=function_name):
                function_source = _nested_function_source(SERVER_PATH, function_name)
                self.assertIn("_require_agent_ops_execute_access", function_source)
                self.assertNotIn("_require_agent_ops_view_access", function_source)
        workforce_source = _nested_function_source(SERVER_PATH, "apply_workforce_automation")
        self.assertIn("request.queue_default_jobs or request.process_queue", workforce_source)
        self.assertIn("_require_agent_ops_execute_access", workforce_source)
        deploy_source = _nested_function_source(SERVER_PATH, "cloud_preview_deploy")
        self.assertIn("_require_agent_ops_deploy_access", deploy_source)
        self.assertIn("_require_clean_preview_deploy_revision", deploy_source)
        self.assertIn("_validate_preview_deploy_approval", deploy_source)
        self.assertLess(
            deploy_source.index("_validate_preview_deploy_approval"),
            deploy_source.index("_run_preview_deploy"),
        )
        revision_source = _nested_function_source(SERVER_PATH, "_require_clean_preview_deploy_revision")
        self.assertIn('"rev-parse", "--verify", "HEAD"', revision_source)
        self.assertIn('"status", "--porcelain=v1", "--untracked-files=all"', revision_source)

    def test_preview_deploy_requires_exact_workspace_bound_approval(self) -> None:
        validate = _isolated_function(SERVER_PATH, "_validate_preview_deploy_approval")
        revision = "a" * 40
        valid_row = {
            "approval_id": "APR-DEPLOY-1",
            "workspace_id": "workspace-a",
            "status": "approved",
            "approval_gate": "deployment.preview",
            "related_route": "/api/cloud/deployments/preview",
            "related_entity": f"cloud-preview:claimable_preview:{revision}",
            "payload": {
                "deployment_mode": "claimable_preview",
                "deployment_revision": revision,
                "_approval_authority": {"workspace_id": "workspace-a", "requested_by": "Alice"},
                "decision_history": [
                    {
                        "actor": "Owner",
                        "to_status": "approved",
                        "note": "Reviewed exact preview target and mode.",
                    }
                ],
            },
        }
        self.assertEqual(
            validate(
                [valid_row],
                workspace_id="workspace-a",
                approval_id="APR-DEPLOY-1",
                mode="claimable_preview",
                revision=revision,
            ),
            valid_row,
        )

        invalid_rows = {
            "workspace": {**valid_row, "workspace_id": "workspace-b"},
            "status": {**valid_row, "status": "pending"},
            "gate": {**valid_row, "approval_gate": "general"},
            "route": {**valid_row, "related_route": "/app/approvals"},
            "target": {**valid_row, "related_entity": f"cloud-preview:direct:{revision}"},
            "mode": {**valid_row, "payload": {**valid_row["payload"], "deployment_mode": "direct"}},
            "revision": {
                **valid_row,
                "payload": {**valid_row["payload"], "deployment_revision": "b" * 40},
            },
            "authority": {
                **valid_row,
                "payload": {
                    **valid_row["payload"],
                    "_approval_authority": {"workspace_id": "workspace-b", "requested_by": "Alice"},
                },
            },
            "evidence": {
                **valid_row,
                "payload": {**valid_row["payload"], "decision_history": []},
            },
        }
        for label, row in invalid_rows.items():
            with self.subTest(label=label), self.assertRaises(ValueError):
                validate(
                    [row],
                    workspace_id="workspace-a",
                    approval_id="APR-DEPLOY-1",
                    mode="claimable_preview",
                    revision=revision,
                )

        request_model = _isolated_model(SERVER_PATH, "CloudPreviewDeployRequest")
        with self.assertRaises(ValidationError):
            request_model(mode="claimable_preview", revision=revision)
        with self.assertRaises(ValidationError):
            request_model(approval_id="APR-DEPLOY-1", mode="unbounded", revision=revision)
        with self.assertRaises(ValidationError):
            request_model(approval_id="APR-DEPLOY-1", revision=revision, forged=True)
        with self.assertRaises(ValidationError):
            request_model(approval_id="APR-DEPLOY-1", revision="main")

    def test_agent_runner_rejects_untrusted_destinations_and_unbounded_responses(self) -> None:
        runner = _load_module(AGENT_RUNNER_PATH, "supermega_agent_runner_security_test")
        allowed = frozenset({"app.supermega.dev"})
        self.assertEqual(
            runner.validate_base_url("https://app.supermega.dev/", allowed_hosts=allowed),
            "https://app.supermega.dev",
        )
        self.assertEqual(
            runner.validate_base_url("http://127.0.0.1:8787", allowed_hosts=allowed),
            "http://127.0.0.1:8787",
        )
        adversarial_urls = [
            "http://app.supermega.dev",
            "https://169.254.169.254/latest/meta-data",
            "https://10.0.0.1",
            "https://user:password@app.supermega.dev",
            "https://app.supermega.dev/private",
            "https://app.supermega.dev?next=https://evil.example",
            "https://app.supermega.dev#fragment",
            "https://app.supermega.dev:444",
            "https://localhost.evil.example",
            "https://evil.example",
        ]
        for url in adversarial_urls:
            with self.subTest(url=url), self.assertRaises(RuntimeError):
                runner.validate_base_url(url, allowed_hosts=allowed)

        class FakeResponse:
            def __init__(self, body: bytes, headers: dict[str, str]) -> None:
                self.body = body
                self.headers = headers

            def read(self, limit: int) -> bytes:
                return self.body[:limit]

        valid_response = FakeResponse(b'{"status":"ready"}', {"Content-Type": "application/json"})
        self.assertEqual(runner._read_json_response(valid_response), {"status": "ready"})
        rejected_responses = [
            FakeResponse(b"{}", {"Content-Type": "text/html"}),
            FakeResponse(b"[]", {"Content-Type": "application/json"}),
            FakeResponse(
                b"{}",
                {"Content-Type": "application/json", "Content-Length": str(runner.MAX_RESPONSE_BYTES + 1)},
            ),
            FakeResponse(b"x" * (runner.MAX_RESPONSE_BYTES + 1), {"Content-Type": "application/json"}),
        ]
        for response in rejected_responses:
            with self.subTest(headers=response.headers), self.assertRaises(RuntimeError):
                runner._read_json_response(response)
        with self.assertRaises(RuntimeError):
            runner.RejectRedirectHandler().redirect_request(None, None, 302, "Found", {}, "https://evil.example")

    def test_agent_credentials_are_not_defaulted_or_forwarded_on_cli(self) -> None:
        runner = AGENT_RUNNER_PATH.read_text(encoding="utf-8")
        founder = FOUNDER_CYCLE_PATH.read_text(encoding="utf-8")
        self.assertNotIn('parser.add_argument("--password"', runner)
        self.assertNotIn('parser.add_argument("--cron-token"', runner)
        self.assertNotIn('default="supermega-demo"', runner)
        self.assertNotIn("--password $Password", founder)
        self.assertNotIn('[string]$Password = "supermega-demo"', founder)
        self.assertIn("SUPERMEGA_AGENT_PASSWORD", founder)

    def test_root_compose_entrypoint_is_retired_and_fail_closed(self) -> None:
        compose = COMPOSE_PATH.read_text(encoding="utf-8")
        self.assertIn("services: {}", compose)
        for unsafe_service in ("openhands:", "n8n:", "flowise:", "qdrant:", "redis:", "/var/run/docker.sock"):
            with self.subTest(service=unsafe_service):
                self.assertNotIn(unsafe_service, compose)

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
