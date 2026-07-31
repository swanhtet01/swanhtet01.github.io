from __future__ import annotations

import ast
import hashlib
import importlib.util
import json
import os
import re
import secrets
import sqlite3
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from pathlib import Path
from tempfile import TemporaryDirectory
from types import FunctionType, ModuleType
from typing import Any
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from mark1_pilot.state_store import (
    APPROVAL_ACTION_RESERVATION_CONTRACT,
    add_approval_entry,
    complete_approval_action,
    list_approval_entries,
    load_approval_summary,
    reserve_approval_action,
    update_approval_entry,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
SERVER_PATH = REPO_ROOT / "tools" / "serve_solution.py"
LAUNCHER_PATH = REPO_ROOT / "tools" / "run_solution.ps1"
AGENT_RUNNER_PATH = REPO_ROOT / "tools" / "run_supermega_agent_jobs.py"
FOUNDER_CYCLE_PATH = REPO_ROOT / "tools" / "run_supermega_founder_cycle.ps1"
COMPOSE_PATH = REPO_ROOT / "docker-compose.yml"
PREVIEW_LAUNCHER_PATH = REPO_ROOT / "tools" / "deploy_preview.sh"
CLAIMABLE_LAUNCHER_PATH = REPO_ROOT / "tools" / "deploy_claimable_preview.sh"


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
        "PREVIEW_DEPLOY_MODE": "canonical_preview",
        "CANONICAL_VERCEL_TEAM_ID": "team_wI4l7ZgSxcEztQPSlCCYVeJ5",
        "CANONICAL_APP_VERCEL_PROJECT_ID": "prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG",
        "CANONICAL_APP_VERCEL_PROJECT_NAME": "megaos",
        "PREVIEW_RELEASE_REVIEW_SOURCE": "system:preview_release_review",
        "PREVIEW_RELEASE_REVIEW_CONTRACT": "supermega.preview-release-review.v1",
        "PREVIEW_RELEASE_REQUIRED_CONTRACTS": (
            "supermega_python_tests",
            "supermega_app_build",
            "supermega_local_full_stack",
            "supermega_coordinated_release_workflow",
            "supermega_app_security",
            "supermega_private_trial_migrations",
            "supermega_vercel_environment_state_tests",
            "supermega_vercel_domain_state_tests",
            "supermega_hq",
        ),
        "hashlib": hashlib,
        "json": json,
        "re": re,
        "secrets": secrets,
    }
    if name in {"_find_reusable_preview_release_review", "_validate_preview_deploy_approval"}:
        namespace["_validate_preview_release_review_packet"] = _isolated_function(
            path,
            "_validate_preview_release_review_packet",
        )
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


def _isolated_nested_function(path: Path, name: str) -> FunctionType:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    function = next(node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef) and node.name == name)
    module = ast.Module(body=[function], type_ignores=[])
    ast.fix_missing_locations(module)
    namespace: dict[str, object] = {"Any": Any, "urlparse": urlparse}
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


def _resign_release_review(review: dict[str, Any]) -> dict[str, Any]:
    packet = json.loads(json.dumps(review))
    packet.pop("packet_digest", None)
    canonical = json.dumps(packet, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    packet["packet_digest"] = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return packet


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
        approval_gate: str = "general",
        related_entity: str = "",
        payload: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return add_approval_entry(
            self.db_path,
            workspace_id=workspace_id,
            title=f"Approval for {workspace_id}",
            summary="Bounded approval request",
            approval_gate=approval_gate,
            requested_by=requested_by,
            owner="Management",
            status="pending",
            due="",
            related_route="/app/approvals",
            related_entity=related_entity,
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
        self.assertIn("reserve_approval_action", deploy_source)
        self.assertIn("complete_approval_action", deploy_source)
        self.assertIn("_require_canonical_preview_deploy_target", deploy_source)
        self.assertLess(
            deploy_source.index("_validate_preview_deploy_approval"),
            deploy_source.index("_run_preview_deploy"),
        )
        self.assertLess(
            deploy_source.index("_require_clean_preview_deploy_revision"),
            deploy_source.index("_require_canonical_preview_deploy_target"),
        )
        self.assertLess(
            deploy_source.index("_require_canonical_preview_deploy_target"),
            deploy_source.index("reserve_approval_action"),
        )
        self.assertLess(
            deploy_source.index("reserve_approval_action"),
            deploy_source.index("_run_preview_deploy"),
        )
        self.assertIn("revision=approved_revision", deploy_source)
        self.assertIn('status="failed"', deploy_source)
        revision_source = _nested_function_source(SERVER_PATH, "_require_clean_preview_deploy_revision")
        self.assertIn('"rev-parse", "--verify", "HEAD"', revision_source)
        self.assertIn('"status", "--porcelain=v1", "--untracked-files=all"', revision_source)
        self.assertIn("if normalized_requested_revision", revision_source)
        review_source = _nested_function_source(SERVER_PATH, "create_preview_deploy_review")
        self.assertIn("_require_approval_request_access", review_source)
        self.assertIn("_require_clean_preview_deploy_revision", review_source)
        self.assertIn("_build_preview_release_review_packet", review_source)
        self.assertIn("_find_reusable_preview_release_review", review_source)
        self.assertIn("preview_release_review_lock", review_source)
        self.assertIn("add_approval_entry", review_source)
        self.assertIn("PREVIEW_RELEASE_REVIEW_SOURCE", review_source)
        self.assertNotIn("_run_preview_deploy", review_source)

    def test_preview_deploy_requires_exact_workspace_bound_approval(self) -> None:
        validate = _isolated_function(SERVER_PATH, "_validate_preview_deploy_approval")
        build_review = _isolated_function(SERVER_PATH, "_build_preview_release_review_packet")
        revision = "a" * 40
        release_review = build_review(
            revision=revision,
            generated_at="2026-07-26T12:00:00+06:30",
            release_identity={
                "service": "supermega-app",
                "brand_version": "jade-v1-2026-07",
                "context_version": "2026-07-26.2",
                "catalog_version": "2026-07-26.2",
            },
        )
        valid_row = {
            "approval_id": "APR-DEPLOY-1",
            "source": "system:preview_release_review",
            "workspace_id": "workspace-a",
            "status": "approved",
            "approval_gate": "deployment.preview",
            "related_route": "/api/cloud/deployments/preview",
            "related_entity": f"cloud-preview:canonical_preview:{revision}",
            "payload": {
                "deployment_mode": "canonical_preview",
                "deployment_revision": revision,
                "release_review": release_review,
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
                mode="canonical_preview",
                revision=revision,
            ),
            valid_row,
        )

        invalid_rows = {
            "workspace": {**valid_row, "workspace_id": "workspace-b"},
            "status": {**valid_row, "status": "pending"},
            "source": {**valid_row, "source": "app:approval_queue"},
            "gate": {**valid_row, "approval_gate": "general"},
            "route": {**valid_row, "related_route": "/app/approvals"},
            "target": {**valid_row, "related_entity": f"cloud-preview:direct:{revision}"},
            "mode": {**valid_row, "payload": {**valid_row["payload"], "deployment_mode": "vercel_cli"}},
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
            "used": {
                **valid_row,
                "payload": {
                    **valid_row["payload"],
                    "_approval_action": {"status": "reserved"},
                },
            },
        }
        tampered_digest_review = json.loads(json.dumps(release_review))
        tampered_digest_review["candidate"]["repository"] = "forged-repository"
        wrong_revision_review = json.loads(json.dumps(release_review))
        wrong_revision_review["candidate"]["revision"] = "b" * 40
        wrong_target_review = json.loads(json.dumps(release_review))
        wrong_target_review["target"]["project_id"] = "prj_wrong"
        wrong_contracts_review = json.loads(json.dumps(release_review))
        wrong_contracts_review["verification"]["required_contracts"] = ["supermega_app_build"]
        wrong_rollback_review = json.loads(json.dumps(release_review))
        wrong_rollback_review["rollback"]["production_aliases_unchanged"] = False
        invalid_rows.update(
            {
                "review-digest": {
                    **valid_row,
                    "payload": {**valid_row["payload"], "release_review": tampered_digest_review},
                },
                "review-revision": {
                    **valid_row,
                    "payload": {
                        **valid_row["payload"],
                        "release_review": _resign_release_review(wrong_revision_review),
                    },
                },
                "review-target": {
                    **valid_row,
                    "payload": {
                        **valid_row["payload"],
                        "release_review": _resign_release_review(wrong_target_review),
                    },
                },
                "review-contracts": {
                    **valid_row,
                    "payload": {
                        **valid_row["payload"],
                        "release_review": _resign_release_review(wrong_contracts_review),
                    },
                },
                "review-rollback": {
                    **valid_row,
                    "payload": {
                        **valid_row["payload"],
                        "release_review": _resign_release_review(wrong_rollback_review),
                    },
                },
            }
        )
        for label, row in invalid_rows.items():
            with self.subTest(label=label), self.assertRaises(ValueError):
                validate(
                    [row],
                    workspace_id="workspace-a",
                    approval_id="APR-DEPLOY-1",
                    mode="canonical_preview",
                    revision=revision,
                )

        request_model = _isolated_model(SERVER_PATH, "CloudPreviewDeployRequest")
        with self.assertRaises(ValidationError):
            request_model(mode="canonical_preview", revision=revision)
        with self.assertRaises(ValidationError):
            request_model(approval_id="APR-DEPLOY-1", mode="unbounded", revision=revision)
        with self.assertRaises(ValidationError):
            request_model(approval_id="APR-DEPLOY-1", revision=revision, forged=True)
        with self.assertRaises(ValidationError):
            request_model(approval_id="APR-DEPLOY-1", revision="main")
        with self.assertRaises(ValidationError):
            request_model(approval_id="APR-DEPLOY-1", mode="claimable_preview", revision=revision)
        self.assertEqual(
            request_model(approval_id="APR-DEPLOY-1", revision=revision).mode,
            "canonical_preview",
        )

    def test_preview_release_review_packet_binds_candidate_target_checks_and_rollback(self) -> None:
        build_review = _isolated_function(SERVER_PATH, "_build_preview_release_review_packet")
        validate_review = _isolated_function(SERVER_PATH, "_validate_preview_release_review_packet")
        find_reusable = _isolated_function(SERVER_PATH, "_find_reusable_preview_release_review")
        revision = "c" * 40
        review = build_review(
            revision=revision,
            generated_at="2026-07-26T12:00:00+06:30",
            release_identity={
                "service": "supermega-app",
                "brand_version": "jade-v1-2026-07",
                "context_version": "2026-07-26.2",
                "catalog_version": "2026-07-26.2",
            },
        )
        self.assertIs(validate_review(review, mode="canonical_preview", revision=revision), review)
        self.assertEqual(review["candidate"]["revision"], revision)
        self.assertTrue(review["candidate"]["worktree_clean"])
        self.assertEqual(review["target"]["project_name"], "megaos")
        self.assertEqual(review["target"]["environment"], "preview")
        self.assertFalse(review["target"]["production_alias_mutation"])
        self.assertEqual(review["verification"]["status"], "human_review_required")
        self.assertEqual(review["rollback"]["strategy"], "discard_preview")
        self.assertTrue(review["rollback"]["production_aliases_unchanged"])
        self.assertRegex(review["packet_digest"], r"^[0-9a-f]{64}$")

        pending_row = {
            "approval_id": "APR-REVIEW-1",
            "source": "system:preview_release_review",
            "workspace_id": "workspace-a",
            "status": "pending",
            "approval_gate": "deployment.preview",
            "related_route": "/api/cloud/deployments/preview",
            "related_entity": f"cloud-preview:canonical_preview:{revision}",
            "payload": {
                "deployment_mode": "canonical_preview",
                "deployment_revision": revision,
                "release_review": review,
            },
        }
        self.assertEqual(
            find_reusable(
                [pending_row],
                workspace_id="workspace-a",
                mode="canonical_preview",
                revision=revision,
            ),
            pending_row,
        )
        self.assertIsNone(
            find_reusable(
                [{**pending_row, "status": "rejected"}],
                workspace_id="workspace-a",
                mode="canonical_preview",
                revision=revision,
            )
        )
        self.assertIsNone(
            find_reusable(
                [
                    {
                        **pending_row,
                        "payload": {**pending_row["payload"], "_approval_action": {"status": "failed"}},
                    }
                ],
                workspace_id="workspace-a",
                mode="canonical_preview",
                revision=revision,
            )
        )
        with self.assertRaisesRegex(ValueError, "preview_release_revision_invalid"):
            build_review(revision="main", generated_at="now", release_identity={})
        with self.assertRaisesRegex(ValueError, "preview_release_generated_at_missing"):
            build_review(
                revision=revision,
                generated_at="",
                release_identity={
                    "brand_version": "jade",
                    "context_version": "context",
                    "catalog_version": "catalog",
                },
            )
        with self.assertRaisesRegex(ValueError, "preview_release_identity_incomplete"):
            build_review(revision=revision, generated_at="now", release_identity={})

    def test_preview_target_is_exact_and_unlinked_launchers_fail_closed(self) -> None:
        target_state = _isolated_function(SERVER_PATH, "_canonical_preview_target_state")
        valid_link = {
            "orgId": "team_wI4l7ZgSxcEztQPSlCCYVeJ5",
            "projectId": "prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG",
        }
        valid_environment = {
            "VERCEL_ORG_ID": "team_wI4l7ZgSxcEztQPSlCCYVeJ5",
            "VERCEL_PROJECT_ID": "prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG",
            "VERCEL_TOKEN": "secret-not-returned",
        }
        ready = target_state(valid_link, valid_environment)
        self.assertTrue(ready["ready"])
        self.assertEqual(ready["project_name"], "megaos")
        self.assertFalse(ready["production_alias_mutation"])
        self.assertNotIn("secret-not-returned", json.dumps(ready))

        invalid_cases = {
            "link-team": ({**valid_link, "orgId": "team_wrong"}, valid_environment, "canonical_vercel_team_link_missing"),
            "link-project": ({**valid_link, "projectId": "prj_wrong"}, valid_environment, "canonical_vercel_project_link_missing"),
            "env-team": (valid_link, {**valid_environment, "VERCEL_ORG_ID": "team_wrong"}, "canonical_vercel_team_environment_missing"),
            "env-project": (valid_link, {**valid_environment, "VERCEL_PROJECT_ID": "prj_wrong"}, "canonical_vercel_project_environment_missing"),
            "token": (valid_link, {**valid_environment, "VERCEL_TOKEN": ""}, "vercel_token_missing"),
        }
        for label, (project_link, environment, blocker) in invalid_cases.items():
            with self.subTest(label=label):
                blocked = target_state(project_link, environment)
                self.assertFalse(blocked["ready"])
                self.assertIn(blocker, blocked["blockers"])

        server = SERVER_PATH.read_text(encoding="utf-8")
        self.assertIn('vercel@56.1.0', server)
        self.assertNotIn("claimable_preview", server)
        self.assertNotIn("deploy_claimable_preview.sh", server)
        for launcher_path in (PREVIEW_LAUNCHER_PATH, CLAIMABLE_LAUNCHER_PATH):
            launcher = launcher_path.read_text(encoding="utf-8")
            self.assertIn("Retired:", launcher)
            self.assertIn("exit 78", launcher)
            self.assertNotIn("codex-deploy-skills.vercel.sh", launcher)
            self.assertNotIn("curl ", launcher)

    def test_preview_launch_uses_one_pinned_prebuilt_artifact_without_production_aliases(self) -> None:
        runner_source = _nested_function_source(SERVER_PATH, "_run_vercel_cli_preview")
        wrapper_source = _nested_function_source(SERVER_PATH, "_run_preview_deploy")
        self.assertIn('"vercel@56.1.0"', runner_source)
        self.assertIn('["pull", "--yes", "--environment=preview"]', runner_source)
        self.assertIn('["build", "--yes"]', runner_source)
        self.assertIn('"--prebuilt"', runner_source)
        self.assertIn('"--no-wait"', runner_source)
        self.assertIn('f"githubCommitSha={normalized_revision}"', runner_source)
        self.assertIn('deploy_environment["SUPERMEGA_RELEASE_COMMIT"] = normalized_revision', runner_source)
        self.assertIn("_require_canonical_preview_deploy_target()", runner_source)
        self.assertIn("prebuilt_config.is_file()", runner_source)
        self.assertIn('"prebuilt": True', runner_source)
        self.assertNotIn('"--prod"', runner_source)
        self.assertNotIn('"--token"', runner_source)
        self.assertNotIn('"urls": urls', runner_source)
        self.assertNotIn("detail = combined_output", runner_source)
        self.assertLess(runner_source.index('"pull"'), runner_source.index('"build"'))
        self.assertLess(runner_source.index('"build"'), runner_source.index('"deploy"'))
        self.assertIn("revision: str", wrapper_source)
        self.assertIn("_run_vercel_cli_preview(revision)", wrapper_source)

        preferred_url = _isolated_nested_function(SERVER_PATH, "_preferred_deploy_url")
        valid_url = "https://megaos-review-abc.vercel.app"
        self.assertEqual(preferred_url([valid_url]), valid_url)
        invalid_urls = [
            "http://megaos-review-abc.vercel.app",
            "https://megaos-review-abc.vercel.app.evil.example",
            "https://user:password@megaos-review-abc.vercel.app",
            "https://megaos-review-abc.vercel.app/not-root",
            "https://megaos-review-abc.vercel.app?secret=value",
            "https://vercel.com/swanhtet01s-projects/megaos/deployment",
        ]
        for candidate in invalid_urls:
            with self.subTest(candidate=candidate):
                self.assertEqual(preferred_url([candidate]), "")

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

    def test_agent_runner_host_configuration_can_only_narrow_canonical_destinations(self) -> None:
        runner = _load_module(AGENT_RUNNER_PATH, "supermega_agent_runner_host_policy_test")
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(runner._allowed_remote_hosts(), runner.DEFAULT_ALLOWED_REMOTE_HOSTS)

        with patch.dict(os.environ, {"SUPERMEGA_AGENT_ALLOWED_HOSTS": "app.supermega.dev"}):
            self.assertEqual(runner._allowed_remote_hosts(), frozenset({"app.supermega.dev"}))
        with patch.dict(
            os.environ,
            {
                "SUPERMEGA_AGENT_ALLOWED_HOSTS": (
                    "app.supermega.dev,supermega-app-453184845544.asia-southeast1.run.app"
                )
            },
        ):
            self.assertEqual(runner._allowed_remote_hosts(), runner.DEFAULT_ALLOWED_REMOTE_HOSTS)

        for configured in ("evil.example", "app.supermega.dev,evil.example", "https://app.supermega.dev", ",,"):
            with self.subTest(configured=configured), patch.dict(
                os.environ,
                {"SUPERMEGA_AGENT_ALLOWED_HOSTS": configured},
            ), self.assertRaises(RuntimeError):
                runner._allowed_remote_hosts()

    def test_agent_runner_cycle_budget_is_canonical_bounded_and_scale_to_zero(self) -> None:
        runner = _load_module(AGENT_RUNNER_PATH, "supermega_agent_runner_cycle_budget_test")
        queued = runner.build_job_cycle_plan(None, durable_queue=True)
        self.assertEqual(queued["contract"], "supermega.agent-runner-cycle-budget.v1")
        self.assertEqual(queued["job_types"], runner.DEFAULT_JOB_TYPES)
        self.assertEqual(queued["requested_count"], 7)
        self.assertEqual(queued["process_limit"], 1)
        self.assertEqual(queued["max_processed_per_cycle"], 1)
        self.assertTrue(queued["scale_to_zero"])

        canonical = runner.build_job_cycle_plan(
            ["list_clerk", "OPS_WATCH", "list_clerk", "task_triage", "founder_brief", "github_release_watch"],
            durable_queue=True,
        )
        self.assertEqual(
            canonical["job_types"],
            ["ops_watch", "github_release_watch", "task_triage", "founder_brief", "list_clerk"],
        )
        self.assertEqual(canonical["process_limit"], 1)

        direct = runner.build_job_cycle_plan(["ops_watch"], durable_queue=False)
        self.assertEqual(direct["mode"], "workspace_login")
        self.assertEqual(direct["process_limit"], 1)
        for values, durable_queue, error in (
            (None, False, "workspace_login_requires_explicit_job_types"),
            (["ops_watch", "github_release_watch"], False, "workspace_login_job_limit_exceeded"),
            (["unknown"], True, "job_type_not_canonical"),
            ([""], True, "job_type_empty"),
            (["ops_watch"] * 25, True, "job_type_argument_limit_exceeded"),
        ):
            with self.subTest(error=error), self.assertRaisesRegex(RuntimeError, error):
                runner.build_job_cycle_plan(values, durable_queue=durable_queue)

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
                "_approval_action": {"status": "succeeded"},
                "business_context": "preserved",
            },
        )
        authority = row["payload"]["_approval_authority"]  # type: ignore[index]
        self.assertEqual(authority, {"workspace_id": "workspace-a", "requested_by": "Alice"})
        self.assertNotIn("decision_history", row["payload"])  # type: ignore[operator]
        self.assertNotIn("_approval_action", row["payload"])  # type: ignore[operator]

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

    def test_approved_action_is_atomically_single_use_and_claim_bound(self) -> None:
        target = f"cloud-preview:canonical_preview:{'a' * 40}"
        row = self._add_approval(
            "workspace-a",
            requested_by="Alice",
            approval_gate="deployment.preview",
            related_entity=target,
        )
        approved = update_approval_entry(
            self.db_path,
            approval_id=str(row["approval_id"]),
            workspace_id="workspace-a",
            actor="Owner",
            status="approved",
            note="Reviewed exact preview revision and recovery boundary.",
        )
        self.assertIsNotNone(approved)
        with self.assertRaisesRegex(ValueError, "approval_action_scope_mismatch"):
            reserve_approval_action(
                self.db_path,
                approval_id=str(row["approval_id"]),
                workspace_id="workspace-a",
                actor="Owner",
                action="deployment.preview",
                target=f"cloud-preview:canonical_preview:{'c' * 40}",
            )

        def reserve() -> tuple[str, object]:
            try:
                return (
                    "ready",
                    reserve_approval_action(
                        self.db_path,
                        approval_id=str(row["approval_id"]),
                        workspace_id="workspace-a",
                        actor="Owner",
                        action="deployment.preview",
                        target=target,
                    ),
                )
            except ValueError as exc:
                return "error", str(exc)

        with ThreadPoolExecutor(max_workers=2) as executor:
            attempts = list(executor.map(lambda _: reserve(), range(2)))
        winners = [payload for status, payload in attempts if status == "ready"]
        failures = [payload for status, payload in attempts if status == "error"]
        self.assertEqual(len(winners), 1)
        self.assertEqual(failures, ["approval_action_already_reserved"])
        claim = winners[0]
        self.assertIsInstance(claim, dict)
        assert isinstance(claim, dict)
        self.assertEqual(claim["contract"], APPROVAL_ACTION_RESERVATION_CONTRACT)
        self.assertEqual(claim["status"], "reserved")

        listed = list_approval_entries(self.db_path, workspace_id="workspace-a")
        action = listed[0]["payload"]["_approval_action"]
        self.assertEqual(action["status"], "reserved")
        self.assertNotIn("claim_token_digest", action)
        with self.assertRaisesRegex(ValueError, "approval_action_claim_invalid"):
            complete_approval_action(
                self.db_path,
                approval_id=str(row["approval_id"]),
                workspace_id="workspace-a",
                claim_token="wrong-token",
                status="succeeded",
            )

        receipt = complete_approval_action(
            self.db_path,
            approval_id=str(row["approval_id"]),
            workspace_id="workspace-a",
            claim_token=str(claim["claim_token"]),
            status="succeeded",
            outcome="preview_launch_accepted",
        )
        self.assertEqual(receipt["status"], "succeeded")
        self.assertEqual(receipt["outcome"], "preview_launch_accepted")
        self.assertNotIn("claim_token", receipt)
        with self.assertRaisesRegex(ValueError, "approval_action_already_reserved"):
            reserve_approval_action(
                self.db_path,
                approval_id=str(row["approval_id"]),
                workspace_id="workspace-a",
                actor="Owner",
                action="deployment.preview",
                target=target,
            )

    def test_failed_approved_action_remains_consumed_for_fresh_review(self) -> None:
        target = f"cloud-preview:canonical_preview:{'b' * 40}"
        row = self._add_approval(
            "workspace-a",
            requested_by="Alice",
            approval_gate="deployment.preview",
            related_entity=target,
        )
        update_approval_entry(
            self.db_path,
            approval_id=str(row["approval_id"]),
            workspace_id="workspace-a",
            actor="Owner",
            status="approved",
            note="Reviewed exact preview revision and recovery boundary.",
        )
        claim = reserve_approval_action(
            self.db_path,
            approval_id=str(row["approval_id"]),
            workspace_id="workspace-a",
            actor="Owner",
            action="deployment.preview",
            target=target,
        )
        receipt = complete_approval_action(
            self.db_path,
            approval_id=str(row["approval_id"]),
            workspace_id="workspace-a",
            claim_token=str(claim["claim_token"]),
            status="failed",
            outcome="http_502",
        )
        self.assertEqual(receipt["status"], "failed")
        self.assertEqual(receipt["outcome"], "http_502")
        with self.assertRaisesRegex(ValueError, "approval_action_already_reserved"):
            reserve_approval_action(
                self.db_path,
                approval_id=str(row["approval_id"]),
                workspace_id="workspace-a",
                actor="Owner",
                action="deployment.preview",
                target=target,
            )


if __name__ == "__main__":
    unittest.main()
