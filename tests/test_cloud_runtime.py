from __future__ import annotations

import ast
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import tempfile
import unittest
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing, contextmanager
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from supermega_runtime.cloud_runtime import DAILY_CRON_PATH, QUEUE_CRON_PATH, router
from supermega_runtime.scheduler_activation import (
    CANONICAL_SCHEDULER_PROJECT_ID,
    REQUIRED_SCHEDULER_ACTIVATION_EVIDENCE_IDS,
    SCHEDULER_ACTIVATION_EVIDENCE_CONTRACT,
    SCHEDULER_ACTIVATION_EVIDENCE_ENV,
    SCHEDULER_ACTIVATION_SIGNING_SECRET_ENV,
    SCHEDULER_AUTHORITY_DIGEST,
    sign_scheduler_activation_evidence,
)
from mark1_pilot.agent_governance import (
    AGENT_ACTIVE_ASSIGNMENT_LIMIT,
    AGENT_AUTOMATED_JOB_TYPES,
    AGENT_AUTOMATION_LANES,
    AGENT_BUDGET_ACCOUNTING_CONTRACT,
    AGENT_BUDGET_GRANT_CONTRACT,
    AGENT_CADENCE_ADMISSION_CONTRACT,
    AGENT_CAPACITY_PLAN_CONTRACT,
    AGENT_DAILY_RUN_LIMIT,
    AGENT_DAILY_WORK_UNIT_LIMIT,
    AGENT_JOB_CADENCE_SECONDS,
    AGENT_JOB_DAILY_LIMITS,
    AGENT_JOB_MAX_ATTEMPTS,
    AGENT_JOB_PRIORITIES,
    AGENT_JOB_UNITS,
    AGENT_LEASE_LIMIT_SECONDS,
    AGENT_QUEUE_LIMIT,
    AGENT_RETRY_POLICY_CONTRACT,
    AGENT_ROSTER_LIMIT,
    AgentGovernanceError,
    AgentWorkforcePolicy,
    agent_job_cadence_state,
    issue_agent_budget_grant,
    load_agent_workforce_policy,
    plan_agent_capacity,
    verify_agent_budget_grant,
)
from mark1_pilot.enterprise_store import (
    claim_agent_runs,
    complete_agent_run,
    create_agent_run,
    create_and_reserve_agent_run,
    ensure_workspace,
    get_agent_capacity_plan,
    get_agent_run,
)


class FakeWorkerResponse:
    def __init__(self, payload: object | None = None, *, raw: bytes | None = None, status: int = 200) -> None:
        self.status = status
        self._body = raw if raw is not None else json.dumps(payload).encode("utf-8")

    def read(self, limit: int = -1) -> bytes:
        return self._body if limit < 0 else self._body[:limit]

    def getcode(self) -> int:
        return self.status

    def __enter__(self) -> FakeWorkerResponse:
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        del exc_type, exc, traceback


class CloudRuntimeTests(unittest.TestCase):
    worker_url = "https://worker.supermega.dev/api/internal/agent-runs/process-queue"
    worker_secret = "0123456789abcdef0123456789abcdef"
    activation_secret = "scheduler-activation-secret-0123456789abcdef"
    release_commit = "a" * 40

    @classmethod
    def _signed_activation_evidence(
        cls,
        *,
        issued_at: datetime | None = None,
        expires_at: datetime | None = None,
        **overrides: object,
    ) -> str:
        issued = (issued_at or datetime.now(timezone.utc) - timedelta(minutes=1)).replace(microsecond=0)
        expires = (expires_at or issued + timedelta(days=1)).replace(microsecond=0)
        captured_at = issued.strftime("%Y-%m-%dT%H:%M:%SZ")
        bundle: dict[str, object] = {
            "contract": SCHEDULER_ACTIVATION_EVIDENCE_CONTRACT,
            "authority_digest": SCHEDULER_AUTHORITY_DIGEST,
            "project_id": CANONICAL_SCHEDULER_PROJECT_ID,
            "environment": "production",
            "release_commit": cls.release_commit,
            "managed_tenant_id": "supermega-managed-pilot",
            "issued_at": issued.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "expires_at": expires.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "owner_decision_id": "owner-scheduler-activation-001",
            "evidence": [
                {
                    "id": evidence_id,
                    "status": "passed",
                    "captured_at": captured_at,
                    "digest": f"sha256:{hashlib.sha256(evidence_id.encode()).hexdigest()}",
                }
                for evidence_id in REQUIRED_SCHEDULER_ACTIVATION_EVIDENCE_IDS
            ],
            **overrides,
        }
        signed = sign_scheduler_activation_evidence(bundle, secret=cls.activation_secret)
        return json.dumps(signed, separators=(",", ":"), sort_keys=True)

    @classmethod
    def _environment(cls, **overrides: str) -> dict[str, str]:
        return {
            "CRON_SECRET": "cron-secret",
            "SUPERMEGA_INTERNAL_CRON_TOKEN": cls.worker_secret,
            "SUPERMEGA_CLOUD_TASKS_WORKER_URL": cls.worker_url,
            "SUPERMEGA_CLOUD_TASKS_ALLOWED_HOSTS": "worker.supermega.dev",
            "SUPERMEGA_HOSTED_SCHEDULER_ENABLED": "1",
            SCHEDULER_ACTIVATION_EVIDENCE_ENV: cls._signed_activation_evidence(),
            SCHEDULER_ACTIVATION_SIGNING_SECRET_ENV: cls.activation_secret,
            "VERCEL_ENV": "production",
            "VERCEL_PROJECT_ID": CANONICAL_SCHEDULER_PROJECT_ID,
            "VERCEL_GIT_COMMIT_SHA": cls.release_commit,
            **overrides,
        }

    @contextmanager
    def _client(self, **overrides: str) -> Iterator[TestClient]:
        controlled = self._environment(**overrides)
        with patch.dict(os.environ, controlled, clear=False):
            app = FastAPI()
            app.include_router(router)
            with TestClient(app) as client:
                yield client

    @staticmethod
    def _success_payload(**overrides: object) -> dict[str, object]:
        return {
            "status": "completed",
            "processed_count": 2,
            "side_effects": {
                "writes_performed": False,
                "external_messages_sent": False,
            },
            **overrides,
        }

    @classmethod
    def _success_payload_for_request(cls, request: object, **overrides: object) -> dict[str, object]:
        request_payload = json.loads(getattr(request, "data"))
        grant = request_payload["budget_grant"]
        return cls._success_payload(
            budget_accounting={
                "contract": AGENT_BUDGET_ACCOUNTING_CONTRACT,
                "grant_id": grant["grant_id"],
                "reserved_runs": grant["max_runs"],
                "reserved_work_units": grant["max_work_units"],
                "consumed_runs": grant["max_runs"],
                "consumed_work_units": grant["max_work_units"],
                "status": "consumed",
            },
            **overrides,
        )

    @classmethod
    def _success_response(cls, request: object) -> FakeWorkerResponse:
        return FakeWorkerResponse(cls._success_payload_for_request(request))

    def test_cron_auth_is_required_and_ambiguous_credentials_are_rejected(self) -> None:
        with self._client(SUPERMEGA_CLOUD_TASKS_WORKER_URL="", SUPERMEGA_CLOUD_TASKS_ALLOWED_HOSTS="") as client:
            missing = client.get(QUEUE_CRON_PATH)
            wrong = client.get(QUEUE_CRON_PATH, headers={"authorization": "Bearer wrong"})
            malformed = client.get(QUEUE_CRON_PATH, headers={"authorization": "cron-secret"})
            ambiguous = client.get(
                QUEUE_CRON_PATH,
                headers={
                    "authorization": "Bearer cron-secret",
                    "x-cron-secret": "different-secret",
                },
            )
            bearer = client.get(QUEUE_CRON_PATH, headers={"authorization": "Bearer cron-secret"})
            explicit_header = client.get(QUEUE_CRON_PATH, headers={"x-cron-secret": self.worker_secret})

        for response in (missing, wrong, malformed, ambiguous):
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.json()["detail"], "cron_auth_required")
        self.assertEqual(bearer.status_code, 200)
        self.assertEqual(explicit_header.status_code, 200)

    def test_vercel_is_the_only_scheduler_authority_and_gcp_mutation_is_retired(self) -> None:
        powershell = shutil.which("pwsh") or shutil.which("powershell")
        if not powershell:
            self.skipTest("PowerShell is unavailable")

        scheduler_path = Path(__file__).resolve().parents[1] / "tools" / "ensure_supermega_scheduler.ps1"
        authority_path = scheduler_path.with_name("supermega_scheduler_authority.json")
        authority = json.loads(authority_path.read_text(encoding="utf-8"))
        authority_digest = "sha256:" + hashlib.sha256(
            json.dumps(authority, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
        ).hexdigest()
        self.assertEqual(authority_digest, SCHEDULER_AUTHORITY_DIGEST)
        self.assertEqual(
            authority["activation"]["evidence_contract"],
            SCHEDULER_ACTIVATION_EVIDENCE_CONTRACT,
        )
        self.assertEqual(
            authority["activation"]["evidence_environment_key"],
            SCHEDULER_ACTIVATION_EVIDENCE_ENV,
        )
        self.assertEqual(
            authority["activation"]["signing_secret_environment_key"],
            SCHEDULER_ACTIVATION_SIGNING_SECRET_ENV,
        )
        self.assertEqual(
            tuple(authority["activation"]["required_evidence"]),
            REQUIRED_SCHEDULER_ACTIVATION_EVIDENCE_IDS,
        )
        self.assertEqual(authority["activation"]["maximum_bundle_ttl_seconds"], 604800)
        self.assertEqual(authority["activation"]["maximum_evidence_age_seconds"], 604800)
        scheduler_source = scheduler_path.read_text(encoding="utf-8")
        for retired_marker in (
            "gcloud",
            "Invoke-Gcloud",
            "Ensure-SchedulerJob",
            "SUPERMEGA_INTERNAL_CRON_TOKEN",
            "x-supermega-cron-token",
        ):
            self.assertNotIn(retired_marker, scheduler_source)

        completed = subprocess.run(
            [powershell, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", str(scheduler_path)],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
        diagnostics = f"{completed.stdout}\n{completed.stderr}"
        self.assertEqual(completed.returncode, 0, diagnostics)
        result = json.loads(completed.stdout)
        self.assertEqual(result["contract"], "supermega.scheduler-authority.v2")
        self.assertEqual(result["status"], "retired_compatibility_entrypoint")
        self.assertEqual(result["scheduler_authority"], "vercel")
        self.assertEqual(result["environment"], "production")
        self.assertEqual(result["activation_state"], "dormant")
        self.assertEqual(result["cron_count"], 0)
        self.assertEqual(result["maximum_scheduler_invocations_per_day"], 0)
        self.assertEqual(result["activation_plan_cron_count"], 2)
        self.assertEqual(result["activation_plan_maximum_invocations_per_day"], 25)
        self.assertEqual(result["worker_dispatch"], "enqueue-on-demand")
        self.assertFalse(result["gcp_scheduler_mutation_allowed"])
        self.assertFalse(result["provider_reads_performed"])
        self.assertFalse(result["provider_writes_performed"])

    def test_degraded_mode_is_truthful_and_does_not_invoke_a_worker(self) -> None:
        with patch("supermega_runtime.cloud_runtime._open_worker_request") as open_worker:
            with self._client(SUPERMEGA_CLOUD_TASKS_ALLOWED_HOSTS="") as client:
                status = client.get("/api/cloud-autonomy/status")
                run = client.get(QUEUE_CRON_PATH, headers={"authorization": "Bearer cron-secret"})

        self.assertEqual(status.status_code, 200)
        self.assertEqual(status.json()["status"], "degraded")
        self.assertIn("worker_allowlist_missing", status.json()["scheduler"]["configuration_errors"])
        self.assertEqual(run.status_code, 200)
        self.assertEqual(run.json()["status"], "degraded")
        self.assertEqual(run.json()["execution"], "hosted_runtime_not_configured")
        self.assertFalse(run.json()["side_effects"]["worker_invoked"])
        self.assertFalse(run.json()["writes_performed"])
        self.assertFalse(run.json()["external_messages_sent"])
        open_worker.assert_not_called()

    def test_dormant_scheduler_cannot_invoke_a_fully_configured_worker(self) -> None:
        with patch("supermega_runtime.cloud_runtime._open_worker_request") as open_worker:
            with self._client(SUPERMEGA_HOSTED_SCHEDULER_ENABLED="0") as client:
                status = client.get("/api/cloud-autonomy/status")
                run = client.get(QUEUE_CRON_PATH, headers={"authorization": "Bearer cron-secret"})

        self.assertEqual(status.json()["status"], "degraded")
        self.assertFalse(status.json()["scheduler"]["activation_enabled"])
        self.assertIn("scheduler_activation_disabled", status.json()["scheduler"]["configuration_errors"])
        self.assertEqual(run.json()["execution"], "hosted_runtime_not_configured")
        self.assertFalse(run.json()["side_effects"]["worker_invoked"])
        open_worker.assert_not_called()

    def test_activation_flag_alone_cannot_invoke_a_worker(self) -> None:
        with patch("supermega_runtime.cloud_runtime._open_worker_request") as open_worker:
            with self._client(**{SCHEDULER_ACTIVATION_EVIDENCE_ENV: ""}) as client:
                status = client.get("/api/cloud-autonomy/status")
                run = client.get(QUEUE_CRON_PATH, headers={"authorization": "Bearer cron-secret"})

        scheduler = status.json()["scheduler"]
        self.assertTrue(scheduler["activation_requested"])
        self.assertFalse(scheduler["activation_enabled"])
        self.assertFalse(scheduler["activation_evidence_valid"])
        self.assertIn("activation_evidence_missing", scheduler["configuration_errors"])
        self.assertEqual(run.json()["execution"], "hosted_runtime_not_configured")
        self.assertFalse(run.json()["side_effects"]["worker_invoked"])
        open_worker.assert_not_called()

    def test_signed_activation_evidence_is_exact_release_and_provider_bound(self) -> None:
        cases = (
            ({"VERCEL_ENV": "preview"}, "activation_runtime_environment_invalid"),
            ({"VERCEL_PROJECT_ID": "prj_wrong"}, "activation_runtime_project_invalid"),
            ({"VERCEL_GIT_COMMIT_SHA": "b" * 40}, "activation_evidence_release_mismatch"),
        )
        for overrides, expected_error in cases:
            with self.subTest(expected_error=expected_error):
                with patch("supermega_runtime.cloud_runtime._open_worker_request") as open_worker:
                    with self._client(**overrides) as client:
                        status = client.get("/api/cloud-autonomy/status")
                        run = client.get(QUEUE_CRON_PATH, headers={"authorization": "Bearer cron-secret"})
                self.assertIn(expected_error, status.json()["scheduler"]["configuration_errors"])
                self.assertFalse(run.json()["side_effects"]["worker_invoked"])
                open_worker.assert_not_called()

    def test_tampered_incomplete_and_expired_activation_evidence_fail_closed(self) -> None:
        tampered = json.loads(self._signed_activation_evidence())
        tampered["signature"] = f"hmac-sha256:{'0' * 64}"
        incomplete = self._signed_activation_evidence(evidence=[])
        issued = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(days=2)
        expired = self._signed_activation_evidence(
            issued_at=issued,
            expires_at=issued + timedelta(days=1),
        )
        cases = (
            (json.dumps(tampered, separators=(",", ":"), sort_keys=True), "activation_evidence_signature_invalid"),
            (incomplete, "activation_evidence_incomplete"),
            (expired, "activation_evidence_expired"),
        )
        for evidence, expected_error in cases:
            with self.subTest(expected_error=expected_error):
                with patch("supermega_runtime.cloud_runtime._open_worker_request") as open_worker:
                    with self._client(**{SCHEDULER_ACTIVATION_EVIDENCE_ENV: evidence}) as client:
                        status = client.get("/api/cloud-autonomy/status")
                        run = client.get(QUEUE_CRON_PATH, headers={"authorization": "Bearer cron-secret"})
                self.assertIn(expected_error, status.json()["scheduler"]["configuration_errors"])
                self.assertFalse(run.json()["side_effects"]["worker_invoked"])
                open_worker.assert_not_called()

    def test_activation_status_exposes_metadata_only(self) -> None:
        raw_evidence = self._signed_activation_evidence()
        with self._client(**{SCHEDULER_ACTIVATION_EVIDENCE_ENV: raw_evidence}) as client:
            status = client.get("/api/cloud-autonomy/status")

        scheduler = status.json()["scheduler"]
        serialized = json.dumps(scheduler, sort_keys=True)
        self.assertEqual(status.json()["status"], "ready")
        self.assertTrue(scheduler["activation_requested"])
        self.assertTrue(scheduler["activation_enabled"])
        self.assertTrue(scheduler["activation_evidence_valid"])
        self.assertEqual(scheduler["activation_evidence_count"], 5)
        self.assertRegex(scheduler["activation_evidence_digest"], r"^sha256:[a-f0-9]{64}$")
        self.assertEqual(scheduler["activation_evidence_release_commit"], self.release_commit)
        self.assertNotIn(self.activation_secret, serialized)
        self.assertNotIn(raw_evidence, serialized)
        self.assertNotIn("hmac-sha256", serialized)

    def test_queue_and_daily_routes_forward_fixed_meaningful_job_types(self) -> None:
        with patch("supermega_runtime.cloud_runtime._open_worker_request", side_effect=self._success_response) as open_worker:
            with self._client() as client:
                status = client.get("/api/cloud-autonomy/status")
                queue = client.get(QUEUE_CRON_PATH, headers={"authorization": "Bearer cron-secret"})
                daily = client.get(DAILY_CRON_PATH, headers={"authorization": "Bearer cron-secret"})

        self.assertEqual(status.json()["capacity"]["contract"], AGENT_CAPACITY_PLAN_CONTRACT)
        self.assertEqual(status.json()["capacity"]["execution_model"], "ephemeral_demand_driven")
        self.assertFalse(status.json()["capacity"]["registered_specialists_consume_compute"])
        self.assertEqual(status.json()["scheduler"]["max_jobs_per_run"], 2)
        self.assertEqual(queue.json()["status"], "accepted")
        self.assertEqual(daily.json()["status"], "accepted")
        queue_request = open_worker.call_args_list[0].args[0]
        daily_request = open_worker.call_args_list[1].args[0]
        queue_payload = json.loads(queue_request.data)
        daily_payload = json.loads(daily_request.data)
        self.assertEqual(queue_payload["contract_version"], "supermega.hosted-agent-scheduler.v1")
        self.assertEqual(queue_payload["cycle"], "queue")
        self.assertEqual(queue_payload["job_types"], ["task_triage", "ops_watch"])
        self.assertEqual(queue_payload["limit"], 2)
        self.assertEqual(queue_payload["capacity_contract"], AGENT_CAPACITY_PLAN_CONTRACT)
        self.assertEqual(queue_payload["execution_model"], "ephemeral_demand_driven")
        self.assertEqual(queue_payload["budget_grant"]["contract"], AGENT_BUDGET_GRANT_CONTRACT)
        self.assertEqual(queue_payload["budget_grant"]["job_types"], queue_payload["job_types"])
        self.assertEqual(queue_payload["budget_grant"]["max_runs"], 2)
        verify_agent_budget_grant(
            queue_payload["budget_grant"],
            secret=self.worker_secret,
            requested_job_types=queue_payload["job_types"],
        )
        self.assertEqual(daily_payload["cycle"], "daily")
        self.assertEqual(daily_payload["job_types"], ["founder_brief", "github_release_watch"])
        self.assertEqual(daily_payload["limit"], 2)
        self.assertEqual(tuple(queue_payload["job_types"]), AGENT_AUTOMATION_LANES["queue"])
        self.assertEqual(tuple(daily_payload["job_types"]), AGENT_AUTOMATION_LANES["daily"])
        self.assertEqual(
            tuple(dict.fromkeys([*queue_payload["job_types"], *daily_payload["job_types"]])),
            AGENT_AUTOMATED_JOB_TYPES,
        )

    def test_ops_watch_monitors_only_automated_jobs_and_suppresses_open_task_rewrites(self) -> None:
        server_path = Path(__file__).resolve().parents[1] / "tools" / "serve_solution.py"
        tree = ast.parse(server_path.read_text(encoding="utf-8"))
        function = next(
            node for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "_build_ops_watch_result"
        )
        module = ast.Module(body=[function], type_ignores=[])
        ast.fix_missing_locations(module)
        namespace: dict[str, object] = {"Any": Any}
        exec(compile(module, str(server_path), "exec", dont_inherit=True), namespace)
        watch = namespace["_build_ops_watch_result"]
        added: list[list[dict[str, object]]] = []
        existing_tasks = [{"template": "ops_watch", "status": "open", "title": "Review agent runtime health"}]
        watch.__globals__.update(
            {
                "AGENT_AUTOMATED_JOB_TYPES": AGENT_AUTOMATED_JOB_TYPES,
                "AGENT_JOB_TEMPLATES": [
                    {"job_type": job_type, "cadence": "hourly"}
                    for job_type in (*AGENT_AUTOMATED_JOB_TYPES, "revenue_scout", "list_clerk", "template_clerk")
                ],
                "datetime": datetime,
                "_group_agent_runs_by_job_type": lambda rows: {},
                "_parse_iso_datetime": lambda value: None,
                "_cadence_threshold_hours": lambda cadence: 1,
                "enterprise_list_agent_runs": lambda *args, **kwargs: [],
                "load_approval_summary": lambda *args, **kwargs: {"pending_count": 0},
                "enterprise_list_workspace_tasks": lambda *args, **kwargs: existing_tasks,
                "enterprise_add_workspace_tasks": lambda *args, **kwargs: added.append(kwargs["rows"]) or {"saved_count": 1},
            }
        )

        result = watch(state_db="state.db", enterprise_db_url="sqlite://", workspace_id="supermega")

        self.assertEqual(result["monitored_jobs"], list(AGENT_AUTOMATED_JOB_TYPES))
        self.assertEqual(set(result["stale_jobs"]), set(AGENT_AUTOMATED_JOB_TYPES))
        self.assertNotIn("revenue_scout", result["stale_jobs"])
        self.assertEqual(result["metrics"]["monitored_job_count"], 4)
        self.assertEqual(result["metrics"]["saved_watch_task_count"], 0)
        self.assertEqual(result["metrics"]["suppressed_duplicate_task_count"], 1)
        self.assertEqual(added, [])

    def test_company_agent_connectors_are_core_only_and_catalogs_are_tenant_scoped(self) -> None:
        server_path = Path(__file__).resolve().parents[1] / "tools" / "serve_solution.py"
        tree = ast.parse(server_path.read_text(encoding="utf-8"))
        mapping_assignment = next(
            node for node in tree.body
            if isinstance(node, ast.AnnAssign)
            and isinstance(node.target, ast.Name)
            and node.target.id == "AGENT_JOB_CONNECTOR_MAP"
        )
        mapping = ast.literal_eval(mapping_assignment.value)
        self.assertEqual(set(mapping), set(AGENT_JOB_PRIORITIES))
        self.assertEqual(
            {str(item.get("connector_id", "")) for item in mapping.values()},
            {"core-agent-operations", "core-github-build"},
        )
        self.assertFalse(any("ytf-" in str(item) for item in mapping.values()))

        function = next(
            node for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "_scope_connector_catalog"
        )
        module = ast.Module(body=[function], type_ignores=[])
        ast.fix_missing_locations(module)
        namespace: dict[str, object] = {"Any": Any}
        exec(compile(module, str(server_path), "exec", dont_inherit=True), namespace)
        scope_catalog = namespace["_scope_connector_catalog"]
        catalog = [
            {"id": "core", "tenant": "core"},
            {"id": "ytf", "tenant": "yangon-tyre"},
            {"id": "client", "tenant": "client-a"},
        ]
        self.assertEqual([row["id"] for row in scope_catalog(catalog, "default")], ["core"])
        self.assertEqual([row["id"] for row in scope_catalog(catalog, "yangon-tyre")], ["ytf"])
        self.assertEqual([row["id"] for row in scope_catalog(catalog, "client-a")], ["client"])
        self.assertEqual(scope_catalog(catalog, ""), [])

    def test_scheduler_emits_one_bounded_structured_log_without_secrets(self) -> None:
        with patch("supermega_runtime.cloud_runtime._open_worker_request", side_effect=self._success_response):
            with self._client() as client:
                with self.assertLogs("supermega.cloud_runtime", level="INFO") as captured:
                    response = client.get(QUEUE_CRON_PATH, headers={"authorization": "Bearer cron-secret"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(captured.records), 1)
        log_payload = json.loads(captured.records[0].getMessage())
        self.assertEqual(log_payload["event"], "supermega_agent_scheduler_cycle")
        self.assertEqual(log_payload["cycle"], "queue")
        self.assertEqual(log_payload["status"], "accepted")
        self.assertTrue(log_payload["worker_invoked"])
        self.assertGreaterEqual(log_payload["duration_ms"], 0)
        self.assertNotIn(self.worker_secret, captured.records[0].getMessage())

    def test_non_https_unlisted_and_query_worker_urls_are_rejected_without_network_access(self) -> None:
        cases = (
            ("http://worker.supermega.dev/run", "worker.supermega.dev", "worker_url_https_required"),
            ("https://unlisted.supermega.dev/run", "worker.supermega.dev", "worker_host_not_allowed"),
            (
                "https://worker.supermega.dev/run?credential=value",
                "worker.supermega.dev",
                "worker_url_query_or_fragment_forbidden",
            ),
        )
        for worker_url, allowed_hosts, expected_error in cases:
            with self.subTest(worker_url=worker_url):
                with patch("supermega_runtime.cloud_runtime._open_worker_request") as open_worker:
                    with self._client(
                        SUPERMEGA_CLOUD_TASKS_WORKER_URL=worker_url,
                        SUPERMEGA_CLOUD_TASKS_ALLOWED_HOSTS=allowed_hosts,
                    ) as client:
                        response = client.get(QUEUE_CRON_PATH, headers={"authorization": "Bearer cron-secret"})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["status"], "degraded")
                self.assertIn(expected_error, response.json()["configuration_errors"])
                open_worker.assert_not_called()

    def test_successful_forwarding_sanitizes_and_bounds_worker_results(self) -> None:
        def worker_response(request: object) -> FakeWorkerResponse:
            return FakeWorkerResponse(self._success_payload_for_request(
                request,
                processed_count=3,
                summary=(" completed\u0000 " * 300),
                token="must-not-leak",
                nested={"authorization": "Bearer must-not-leak", "safe": "kept"},
                jobs=[{"job_id": index, "status": "done"} for index in range(40)],
                side_effects={
                    "writes_performed": True,
                    "external_messages_sent": False,
                },
            ))
        with patch(
            "supermega_runtime.cloud_runtime._open_worker_request",
            side_effect=worker_response,
        ) as open_worker:
            with self._client() as client:
                response = client.get(QUEUE_CRON_PATH, headers={"authorization": "Bearer cron-secret"})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "accepted")
        self.assertEqual(body["execution"], "hosted_runtime_forwarded")
        self.assertTrue(body["writes_performed"])
        self.assertFalse(body["external_messages_sent"])
        self.assertEqual(body["side_effects"]["reporting"], "worker_reported_unverified")
        self.assertEqual(body["side_effects"]["budget_reporting"], "worker_reported_budget_bound")
        self.assertEqual(body["budget_accounting"]["status"], "consumed")
        self.assertEqual(body["worker_result"]["token"], "[redacted]")
        self.assertEqual(body["worker_result"]["nested"]["authorization"], "[redacted]")
        self.assertLessEqual(len(body["worker_result"]["summary"]), 1_024)
        self.assertEqual(len(body["worker_result"]["jobs"]), 33)
        self.assertTrue(body["worker_result"]["jobs"][-1]["_truncated"])
        self.assertNotIn("must-not-leak", json.dumps(body))

        worker_request = open_worker.call_args.args[0]
        request_headers = {key.lower(): value for key, value in worker_request.header_items()}
        self.assertEqual(request_headers["authorization"], f"Bearer {self.worker_secret}")
        self.assertEqual(request_headers["x-supermega-cron-token"], self.worker_secret)
        self.assertEqual(worker_request.full_url, self.worker_url)

    def test_missing_side_effect_report_fails_closed(self) -> None:
        with patch(
            "supermega_runtime.cloud_runtime._open_worker_request",
            return_value=FakeWorkerResponse({"status": "completed", "processed_count": 1}),
        ):
            with self._client() as client:
                response = client.get(DAILY_CRON_PATH, headers={"authorization": "Bearer cron-secret"})

        body = response.json()
        self.assertEqual(body["status"], "degraded")
        self.assertEqual(body["execution"], "worker_response_invalid")
        self.assertEqual(body["worker_error"], "worker_side_effect_report_required")
        self.assertIsNone(body["writes_performed"])
        self.assertIsNone(body["external_messages_sent"])

    def test_missing_or_mismatched_budget_accounting_fails_closed(self) -> None:
        def missing_accounting(_: object) -> FakeWorkerResponse:
            return FakeWorkerResponse(self._success_payload())

        with patch("supermega_runtime.cloud_runtime._open_worker_request", side_effect=missing_accounting):
            with self._client() as client:
                missing = client.get(QUEUE_CRON_PATH, headers={"authorization": "Bearer cron-secret"})

        self.assertEqual(missing.json()["status"], "degraded")
        self.assertEqual(missing.json()["worker_error"], "worker_budget_accounting_required")

        def mismatched_accounting(request: object) -> FakeWorkerResponse:
            payload = self._success_payload_for_request(request)
            accounting = dict(payload["budget_accounting"])
            accounting["grant_id"] = "0" * 32
            payload["budget_accounting"] = accounting
            return FakeWorkerResponse(payload)

        with patch("supermega_runtime.cloud_runtime._open_worker_request", side_effect=mismatched_accounting):
            with self._client() as client:
                mismatched = client.get(QUEUE_CRON_PATH, headers={"authorization": "Bearer cron-secret"})

        self.assertEqual(mismatched.json()["status"], "degraded")
        self.assertEqual(mismatched.json()["worker_error"], "worker_budget_grant_mismatch")

    def test_worker_failure_reports_unknown_side_effects_without_leaking_details(self) -> None:
        with patch(
            "supermega_runtime.cloud_runtime._open_worker_request",
            side_effect=urllib.error.URLError("private-worker-detail"),
        ):
            with self._client() as client:
                response = client.get(QUEUE_CRON_PATH, headers={"authorization": "Bearer cron-secret"})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "degraded")
        self.assertEqual(body["execution"], "worker_error")
        self.assertEqual(body["worker_error"], "worker_unavailable")
        self.assertTrue(body["retryable"])
        self.assertTrue(body["side_effects"]["worker_invoked"])
        self.assertEqual(body["side_effects"]["reporting"], "unknown")
        self.assertIsNone(body["writes_performed"])
        self.assertIsNone(body["external_messages_sent"])
        self.assertNotIn("private-worker-detail", json.dumps(body))

    def test_oversized_worker_response_is_rejected_without_parsing(self) -> None:
        oversized = b"{" + (b"x" * 40_000) + b"}"
        with patch(
            "supermega_runtime.cloud_runtime._open_worker_request",
            return_value=FakeWorkerResponse(raw=oversized),
        ):
            with self._client() as client:
                response = client.get(QUEUE_CRON_PATH, headers={"authorization": "Bearer cron-secret"})

        body = response.json()
        self.assertEqual(body["status"], "degraded")
        self.assertEqual(body["execution"], "worker_response_invalid")
        self.assertEqual(body["worker_error"], "worker_response_too_large")
        self.assertIsNone(body["writes_performed"])
        self.assertIsNone(body["external_messages_sent"])


class AgentGovernanceTests(unittest.TestCase):
    grant_secret = "0123456789abcdef0123456789abcdef"
    job_types = [
        "revenue_scout",
        "list_clerk",
        "task_triage",
        "template_clerk",
        "ops_watch",
        "founder_brief",
        "github_release_watch",
    ]

    @contextmanager
    def _database(self) -> Iterator[tuple[str, str, Path]]:
        with tempfile.TemporaryDirectory(prefix="supermega-agent-governance-") as directory:
            database_path = Path(directory) / "agent-governance.db"
            database_url = f"sqlite:///{database_path.as_posix()}"
            workspace = ensure_workspace(database_url, slug="governance-test", name="Governance Test")
            yield database_url, str(workspace["workspace_id"]), database_path

    def test_signed_grants_are_bounded_tamper_evident_and_expiring(self) -> None:
        observed_at = datetime(2026, 7, 26, 6, 0, tzinfo=timezone.utc)
        grant = issue_agent_budget_grant(
            secret=self.grant_secret,
            cycle="queue",
            job_types=["task_triage", "ops_watch"],
            now=observed_at,
        )
        verified = verify_agent_budget_grant(
            grant,
            secret=self.grant_secret,
            requested_job_types=["task_triage", "ops_watch"],
            now=observed_at + timedelta(minutes=1),
        )
        self.assertEqual(verified["max_runs"], 2)
        self.assertEqual(verified["max_work_units"], 2)

        tampered = {**grant, "max_runs": 1}
        with self.assertRaises(AgentGovernanceError) as tampered_error:
            verify_agent_budget_grant(tampered, secret=self.grant_secret, now=observed_at)
        self.assertEqual(tampered_error.exception.code, "budget_grant_signature_invalid")

        with self.assertRaises(AgentGovernanceError) as expired_error:
            verify_agent_budget_grant(grant, secret=self.grant_secret, now=observed_at + timedelta(minutes=6))
        self.assertEqual(expired_error.exception.code, "budget_grant_expired")

        with self.assertRaises(AgentGovernanceError) as weak_secret_error:
            issue_agent_budget_grant(
                secret="worker-secret",
                cycle="queue",
                job_types=["task_triage"],
                now=observed_at,
            )
        self.assertEqual(weak_secret_error.exception.code, "budget_grant_secret_invalid")

        with patch.dict(os.environ, {"SUPERMEGA_AGENT_MAX_RUNNING": "5"}):
            with self.assertRaises(AgentGovernanceError) as policy_error:
                load_agent_workforce_policy()
        self.assertEqual(policy_error.exception.code, "agent_policy_invalid")

        with patch.dict(os.environ, {"SUPERMEGA_AGENT_MAX_BATCH_JOBS": "5"}):
            with self.assertRaises(AgentGovernanceError) as batch_policy_error:
                load_agent_workforce_policy()
        self.assertEqual(batch_policy_error.exception.code, "agent_policy_invalid")

        with patch.dict(os.environ, {"SUPERMEGA_AGENT_MAX_REGISTERED_SPECIALISTS": "13"}):
            with self.assertRaises(AgentGovernanceError) as roster_policy_error:
                load_agent_workforce_policy()
        self.assertEqual(roster_policy_error.exception.code, "agent_policy_invalid")

        expanding_overrides = {
            "SUPERMEGA_AGENT_MAX_QUEUED": AGENT_QUEUE_LIMIT + 1,
            "SUPERMEGA_AGENT_MAX_DAILY_RUNS": AGENT_DAILY_RUN_LIMIT + 1,
            "SUPERMEGA_AGENT_MAX_DAILY_UNITS": AGENT_DAILY_WORK_UNIT_LIMIT + 1,
            "SUPERMEGA_AGENT_LEASE_SECONDS": AGENT_LEASE_LIMIT_SECONDS + 1,
        }
        for variable, value in expanding_overrides.items():
            with self.subTest(variable=variable):
                with patch.dict(os.environ, {variable: str(value)}):
                    with self.assertRaises(AgentGovernanceError) as expansion_error:
                        load_agent_workforce_policy()
                self.assertEqual(expansion_error.exception.code, "agent_policy_invalid")

        with patch.dict(os.environ, {
            "SUPERMEGA_AGENT_MAX_QUEUED": "2",
            "SUPERMEGA_AGENT_MAX_DAILY_RUNS": "8",
            "SUPERMEGA_AGENT_MAX_DAILY_UNITS": "12",
            "SUPERMEGA_AGENT_LEASE_SECONDS": "120",
        }):
            narrowed = load_agent_workforce_policy()
        self.assertEqual(
            (narrowed.max_queued, narrowed.max_daily_runs, narrowed.max_daily_units, narrowed.lease_seconds),
            (2, 8, 12, 120),
        )

    def test_roster_cap_rejects_agent_sprawl_and_valid_roster_scales_to_zero(self) -> None:
        workforce_path = Path(__file__).resolve().parents[1] / "agent_os" / "workforce" / "supermega_build_workforce.json"
        workforce = json.loads(workforce_path.read_text(encoding="utf-8"))
        policy = load_agent_workforce_policy()
        runtime_policy = workforce["runtime_policy"]
        self.assertEqual(runtime_policy["max_running"], policy.max_running)
        self.assertEqual(runtime_policy["max_batch_jobs"], policy.max_batch_jobs)
        self.assertEqual(runtime_policy["max_registered_specialists"], policy.max_registered_specialists)
        self.assertEqual(runtime_policy["max_queued"], AGENT_QUEUE_LIMIT)
        self.assertEqual(runtime_policy["max_daily_runs"], AGENT_DAILY_RUN_LIMIT)
        self.assertEqual(runtime_policy["max_daily_work_units"], AGENT_DAILY_WORK_UNIT_LIMIT)
        self.assertEqual(runtime_policy["specialist_job_types"], list(policy.allowed_job_types))
        self.assertEqual(runtime_policy["job_units"], AGENT_JOB_UNITS)
        self.assertEqual(runtime_policy["job_daily_limits"], AGENT_JOB_DAILY_LIMITS)
        self.assertEqual(runtime_policy["job_priorities"], AGENT_JOB_PRIORITIES)
        self.assertEqual(runtime_policy["job_cadence_seconds"], AGENT_JOB_CADENCE_SECONDS)
        self.assertEqual(runtime_policy["cadence_admission_contract"], AGENT_CADENCE_ADMISSION_CONTRACT)
        self.assertEqual(runtime_policy["job_max_attempts"], AGENT_JOB_MAX_ATTEMPTS)
        self.assertEqual(runtime_policy["retry_policy_contract"], AGENT_RETRY_POLICY_CONTRACT)
        self.assertEqual(
            runtime_policy["dispatch_policy"],
            "fixed_priority_then_work_unit_efficiency_then_fifo",
        )

        for unsafe_policy in (
            AgentWorkforcePolicy(max_running=AGENT_ACTIVE_ASSIGNMENT_LIMIT + 1),
            AgentWorkforcePolicy(max_batch_jobs=AGENT_ACTIVE_ASSIGNMENT_LIMIT + 1),
            AgentWorkforcePolicy(max_registered_specialists=AGENT_ROSTER_LIMIT + 1),
            AgentWorkforcePolicy(max_queued=AGENT_QUEUE_LIMIT + 1),
            AgentWorkforcePolicy(max_daily_runs=AGENT_DAILY_RUN_LIMIT + 1),
            AgentWorkforcePolicy(max_daily_units=AGENT_DAILY_WORK_UNIT_LIMIT + 1),
            AgentWorkforcePolicy(lease_seconds=AGENT_LEASE_LIMIT_SECONDS + 1),
        ):
            with self.subTest(unsafe_policy=unsafe_policy):
                with self.assertRaises(AgentGovernanceError) as custom_policy_error:
                    plan_agent_capacity(
                        queued_job_types=self.job_types,
                        running_job_types=[],
                        daily_job_types=[],
                        registered_specialists=0,
                        policy=unsafe_policy,
                    )
                self.assertEqual(custom_policy_error.exception.code, "agent_policy_invalid")

        idle = plan_agent_capacity(
            queued_job_types=[],
            running_job_types=[],
            daily_job_types=[],
            registered_specialists=AGENT_ROSTER_LIMIT,
        )
        self.assertEqual(idle["contract"], AGENT_CAPACITY_PLAN_CONTRACT)
        self.assertEqual(idle["decision"], "scale_to_zero")
        self.assertEqual(idle["target_active_executions"], 0)
        self.assertEqual(idle["idle_registered_specialists"], AGENT_ROSTER_LIMIT)
        self.assertFalse(idle["registered_specialists_consume_compute"])
        self.assertTrue(idle["registry_attention"])
        self.assertEqual(idle["registry_slots_remaining"], 0)
        self.assertEqual(idle["limits"]["max_registered_specialists"], AGENT_ROSTER_LIMIT)

        for roster_size in (13, 175):
            with self.subTest(roster_size=roster_size):
                with self.assertRaises(AgentGovernanceError) as roster_error:
                    plan_agent_capacity(
                        queued_job_types=[],
                        running_job_types=[],
                        daily_job_types=[],
                        registered_specialists=roster_size,
                    )
                self.assertEqual(roster_error.exception.code, "agent_capacity_state_invalid")

        busy = plan_agent_capacity(
            queued_job_types=self.job_types,
            running_job_types=[],
            daily_job_types=[],
            registered_specialists=AGENT_ROSTER_LIMIT,
        )
        self.assertEqual(busy["decision"], "scale_up")
        self.assertEqual(busy["target_active_executions"], load_agent_workforce_policy().max_running)
        self.assertEqual(
            busy["recommended_claim_job_types"],
            ["ops_watch", "github_release_watch"],
        )
        self.assertEqual(
            busy["recommended_claims"],
            [
                {"job_type": "ops_watch", "priority": 100, "work_units": 1},
                {"job_type": "github_release_watch", "priority": 90, "work_units": 2},
            ],
        )
        self.assertEqual(busy["idle_registered_specialists"], AGENT_ROSTER_LIMIT - AGENT_ACTIVE_ASSIGNMENT_LIMIT)

    def test_cadence_state_is_deterministic_and_fails_closed(self) -> None:
        observed_at = datetime(2026, 7, 26, 6, 0, tzinfo=timezone.utc)
        never_run = agent_job_cadence_state(
            job_type="ops_watch",
            last_finished_at=None,
            now=observed_at,
        )
        self.assertEqual(never_run["contract"], AGENT_CADENCE_ADMISSION_CONTRACT)
        self.assertEqual(never_run["decision"], "due_never_run")
        self.assertTrue(never_run["due"])
        self.assertEqual(never_run["cadence_seconds"], 3600)

        deferred = agent_job_cadence_state(
            job_type="ops_watch",
            last_finished_at=observed_at,
            now=observed_at + timedelta(minutes=59, seconds=59),
        )
        self.assertFalse(deferred["due"])
        self.assertEqual(deferred["decision"], "deferred_cadence_not_elapsed")

        due = agent_job_cadence_state(
            job_type="ops_watch",
            last_finished_at=observed_at,
            now=observed_at + timedelta(hours=1),
        )
        self.assertTrue(due["due"])
        self.assertEqual(due["decision"], "due_cadence_elapsed")

        precise_finished_at = observed_at.replace(microsecond=750_000)
        precise_early = agent_job_cadence_state(
            job_type="ops_watch",
            last_finished_at=precise_finished_at,
            now=observed_at + timedelta(hours=1),
        )
        self.assertFalse(precise_early["due"])
        self.assertTrue(
            agent_job_cadence_state(
                job_type="ops_watch",
                last_finished_at=precise_finished_at,
                now=precise_finished_at + timedelta(hours=1),
            )["due"]
        )

        with self.assertRaises(AgentGovernanceError) as future_error:
            agent_job_cadence_state(
                job_type="ops_watch",
                last_finished_at=observed_at + timedelta(minutes=6),
                now=observed_at,
            )
        self.assertEqual(future_error.exception.code, "agent_cadence_state_invalid")

        with self.assertRaises(AgentGovernanceError) as naive_error:
            agent_job_cadence_state(
                job_type="ops_watch",
                last_finished_at=observed_at,
                now=datetime(2026, 7, 26, 6, 0),
            )
        self.assertEqual(naive_error.exception.code, "agent_time_invalid")

    def test_automated_cadence_admission_is_atomic_and_manual_runs_remain_available(self) -> None:
        with self._database() as (database_url, workspace_id, database_path):
            initial = create_and_reserve_agent_run(
                database_url,
                workspace_id=workspace_id,
                job_type="ops_watch",
            )
            completed = complete_agent_run(
                database_url,
                workspace_id=workspace_id,
                run_id=initial["run_id"],
                claim_token=initial["claim_token"],
                status="ready",
            )
            self.assertIsNotNone(completed)

            with closing(sqlite3.connect(database_path)) as connection:
                run_count_before = connection.execute("SELECT COUNT(*) FROM enterprise_agent_runs").fetchone()[0]
                reservation_count_before = connection.execute(
                    "SELECT COUNT(*) FROM enterprise_agent_budget_reservations"
                ).fetchone()[0]

            with self.assertRaises(AgentGovernanceError) as queued_error:
                create_agent_run(
                    database_url,
                    workspace_id=workspace_id,
                    job_type="ops_watch",
                    respect_cadence=True,
                )
            self.assertEqual(queued_error.exception.code, "agent_cadence_not_elapsed")

            with self.assertRaises(AgentGovernanceError) as direct_error:
                create_and_reserve_agent_run(
                    database_url,
                    workspace_id=workspace_id,
                    job_type="ops_watch",
                    respect_cadence=True,
                )
            self.assertEqual(direct_error.exception.code, "agent_cadence_not_elapsed")

            with closing(sqlite3.connect(database_path)) as connection:
                self.assertEqual(
                    connection.execute("SELECT COUNT(*) FROM enterprise_agent_runs").fetchone()[0],
                    run_count_before,
                )
                self.assertEqual(
                    connection.execute("SELECT COUNT(*) FROM enterprise_agent_budget_reservations").fetchone()[0],
                    reservation_count_before,
                )

            finished_at = datetime.fromisoformat(str((completed or {})["finished_at"]))
            due = create_agent_run(
                database_url,
                workspace_id=workspace_id,
                job_type="ops_watch",
                respect_cadence=True,
                now=finished_at + timedelta(hours=1),
            )
            self.assertEqual(due["status"], "queued")

        with self._database() as (database_url, workspace_id, _):
            initial = create_and_reserve_agent_run(
                database_url,
                workspace_id=workspace_id,
                job_type="task_triage",
            )
            complete_agent_run(
                database_url,
                workspace_id=workspace_id,
                run_id=initial["run_id"],
                claim_token=initial["claim_token"],
                status="ready",
            )
            manual = create_agent_run(
                database_url,
                workspace_id=workspace_id,
                job_type="task_triage",
            )
            self.assertEqual(manual["status"], "queued")

    def test_capacity_plan_is_priority_stable_and_budget_efficient(self) -> None:
        plan = plan_agent_capacity(
            queued_job_types=list(reversed(self.job_types)),
            running_job_types=[],
            daily_job_types=[],
            registered_specialists=AGENT_ROSTER_LIMIT,
            max_claim_runs=2,
            max_claim_work_units=4,
        )
        self.assertEqual(plan["selection_policy"], "fixed_priority_then_work_unit_efficiency_then_fifo")
        self.assertEqual(
            plan["recommended_claim_job_types"],
            ["ops_watch", "github_release_watch"],
        )
        self.assertEqual(plan["recommended_claim_work_units"], 3)
        self.assertEqual(plan["target_active_executions"], 2)
        self.assertEqual(plan["deferred_reasons"]["run_or_concurrency_limit"], 5)

        with self._database() as (database_url, workspace_id, _):
            for job_type in self.job_types:
                create_agent_run(database_url, workspace_id=workspace_id, job_type=job_type)
            claimed = claim_agent_runs(database_url, workspace_id=workspace_id, limit=4)
            self.assertEqual(
                [row["job_type"] for row in claimed],
                ["ops_watch", "github_release_watch"],
            )

    def test_capacity_plan_skips_expensive_work_that_cannot_fit_remaining_budget(self) -> None:
        with patch.dict(os.environ, {"SUPERMEGA_AGENT_MAX_DAILY_UNITS": "4"}):
            with self._database() as (database_url, workspace_id, _):
                founder = create_and_reserve_agent_run(
                    database_url,
                    workspace_id=workspace_id,
                    job_type="founder_brief",
                )
                complete_agent_run(
                    database_url,
                    workspace_id=workspace_id,
                    run_id=founder["run_id"],
                    claim_token=founder["claim_token"],
                    status="ready",
                )
                expensive = create_agent_run(database_url, workspace_id=workspace_id, job_type="revenue_scout")
                useful = create_agent_run(database_url, workspace_id=workspace_id, job_type="ops_watch")

                capacity = get_agent_capacity_plan(
                    database_url,
                    workspace_id=workspace_id,
                    registered_specialists=12,
                )
                self.assertEqual(capacity["recommended_claim_job_types"], ["ops_watch"])
                self.assertEqual(capacity["target_active_executions"], 1)
                self.assertEqual(capacity["idle_registered_specialists"], 11)
                self.assertEqual(capacity["budget"]["daily_work_units_remaining"], 1)

                claimed = claim_agent_runs(database_url, workspace_id=workspace_id, limit=5)
                self.assertEqual([row["run_id"] for row in claimed], [useful["run_id"]])
                self.assertEqual(
                    get_agent_run(database_url, workspace_id=workspace_id, run_id=expensive["run_id"])["status"],
                    "queued",
                )

    def test_queue_deduplicates_and_completion_requires_one_live_claim(self) -> None:
        with self._database() as (database_url, workspace_id, _):
            queued = create_agent_run(
                database_url,
                workspace_id=workspace_id,
                job_type="revenue_scout",
                idempotency_key="queue-once",
            )
            self.assertEqual(queued["status"], "queued")
            with self.assertRaises(AgentGovernanceError) as duplicate_error:
                create_agent_run(database_url, workspace_id=workspace_id, job_type="revenue_scout")
            self.assertEqual(duplicate_error.exception.code, "agent_job_already_in_flight")

            claimed = claim_agent_runs(database_url, workspace_id=workspace_id, limit=5)
            self.assertEqual(len(claimed), 1)
            self.assertTrue(claimed[0]["execution_authorized"])
            self.assertNotEqual(claimed[0]["claim_token"], claimed[0]["budget_reservation"]["reservation_id"])

            with self.assertRaises(AgentGovernanceError) as missing_claim:
                complete_agent_run(
                    database_url,
                    workspace_id=workspace_id,
                    run_id=queued["run_id"],
                    status="ready",
                )
            self.assertEqual(missing_claim.exception.code, "agent_claim_required")

            completed = complete_agent_run(
                database_url,
                workspace_id=workspace_id,
                run_id=queued["run_id"],
                claim_token=claimed[0]["claim_token"],
                status="ready",
                summary="done",
            )
            self.assertEqual(completed["status"], "ready")
            self.assertEqual(completed["budget_accounting"]["status"], "consumed")
            with self.assertRaises(AgentGovernanceError) as stale_claim:
                complete_agent_run(
                    database_url,
                    workspace_id=workspace_id,
                    run_id=queued["run_id"],
                    claim_token=claimed[0]["claim_token"],
                    status="error",
                )
            self.assertEqual(stale_claim.exception.code, "agent_claim_invalid")
            self.assertEqual(get_agent_run(database_url, workspace_id=workspace_id, run_id=queued["run_id"])["status"], "ready")

    def test_retry_allowance_is_server_owned_and_narrowing_only(self) -> None:
        with self._database() as (database_url, workspace_id, _):
            retryable = create_agent_run(
                database_url,
                workspace_id=workspace_id,
                job_type="task_triage",
            )
            narrowed = create_agent_run(
                database_url,
                workspace_id=workspace_id,
                job_type="list_clerk",
                max_attempts=1,
            )
            mutating = create_agent_run(
                database_url,
                workspace_id=workspace_id,
                job_type="ops_watch",
                max_attempts=3,
            )

            self.assertEqual(retryable["max_attempts"], 2)
            self.assertEqual(narrowed["max_attempts"], 1)
            self.assertEqual(mutating["max_attempts"], 1)
            with self.assertRaises(AgentGovernanceError) as invalid_error:
                create_agent_run(
                    database_url,
                    workspace_id=workspace_id,
                    job_type="revenue_scout",
                    max_attempts=True,
                )
            self.assertEqual(invalid_error.exception.code, "agent_attempt_budget_invalid")

    def test_terminal_idempotency_key_cannot_reexecute(self) -> None:
        with self._database() as (database_url, workspace_id, _):
            first = create_and_reserve_agent_run(
                database_url,
                workspace_id=workspace_id,
                job_type="founder_brief",
                idempotency_key="daily-founder-brief",
            )
            complete_agent_run(
                database_url,
                workspace_id=workspace_id,
                run_id=first["run_id"],
                claim_token=first["claim_token"],
                status="ready",
            )
            replay = create_and_reserve_agent_run(
                database_url,
                workspace_id=workspace_id,
                job_type="founder_brief",
                idempotency_key="daily-founder-brief",
            )
            self.assertEqual(replay["run_id"], first["run_id"])
            self.assertEqual(replay["status"], "ready")
            self.assertFalse(replay["execution_authorized"])
            self.assertEqual(replay["governance"]["decision"], "idempotent_replay")

    def test_concurrent_claimers_cannot_exceed_workspace_concurrency(self) -> None:
        with self._database() as (database_url, workspace_id, _):
            for job_type in self.job_types:
                create_agent_run(database_url, workspace_id=workspace_id, job_type=job_type)

            def claim() -> list[dict[str, object]]:
                return claim_agent_runs(
                    database_url,
                    workspace_id=workspace_id,
                    job_types=self.job_types,
                    limit=5,
                )

            with ThreadPoolExecutor(max_workers=2) as executor:
                batches = list(executor.map(lambda _: claim(), range(2)))
            claims = [row for batch in batches for row in batch]
            self.assertEqual(len(claims), load_agent_workforce_policy().max_running)
            self.assertEqual(len({row["run_id"] for row in claims}), len(claims))
            self.assertEqual(len({row["claim_token"] for row in claims}), len(claims))

    def test_signed_grant_is_consumed_once(self) -> None:
        with self._database() as (database_url, workspace_id, _):
            for job_type in ("task_triage", "ops_watch"):
                create_agent_run(database_url, workspace_id=workspace_id, job_type=job_type)
            grant = issue_agent_budget_grant(
                secret=self.grant_secret,
                cycle="queue",
                job_types=["task_triage", "ops_watch"],
            )
            claimed = claim_agent_runs(
                database_url,
                workspace_id=workspace_id,
                job_types=["task_triage", "ops_watch"],
                limit=8,
                budget_grant=grant,
                grant_secret=self.grant_secret,
                require_budget_grant=True,
            )
            self.assertEqual(len(claimed), 2)
            self.assertEqual({row["budget_reservation"]["grant_id"] for row in claimed}, {grant["grant_id"]})
            with self.assertRaises(AgentGovernanceError) as replay_error:
                claim_agent_runs(
                    database_url,
                    workspace_id=workspace_id,
                    job_types=["task_triage", "ops_watch"],
                    limit=8,
                    budget_grant=grant,
                    grant_secret=self.grant_secret,
                    require_budget_grant=True,
                )
            self.assertEqual(replay_error.exception.code, "budget_grant_replayed")

    def test_expired_lease_rejects_stale_worker_completion(self) -> None:
        with self._database() as (database_url, workspace_id, database_path):
            claimed = create_and_reserve_agent_run(
                database_url,
                workspace_id=workspace_id,
                job_type="github_release_watch",
            )
            with closing(sqlite3.connect(database_path)) as connection:
                connection.execute(
                    "UPDATE enterprise_agent_budget_reservations SET expires_at = ? WHERE run_id = ?",
                    ("2000-01-01T00:00:00+00:00", claimed["run_id"]),
                )
                connection.commit()
            with self.assertRaises(AgentGovernanceError) as stale_error:
                complete_agent_run(
                    database_url,
                    workspace_id=workspace_id,
                    run_id=claimed["run_id"],
                    claim_token=claimed["claim_token"],
                    status="ready",
                )
            self.assertEqual(stale_error.exception.code, "agent_claim_invalid")
            row = get_agent_run(database_url, workspace_id=workspace_id, run_id=claimed["run_id"])
            self.assertEqual(row["status"], "error")
            self.assertIn("lease expired", row["error_text"].lower())

    def test_expired_read_only_lease_requeues_once_with_a_new_claim(self) -> None:
        with self._database() as (database_url, workspace_id, database_path):
            first = create_and_reserve_agent_run(
                database_url,
                workspace_id=workspace_id,
                job_type="task_triage",
            )
            self.assertEqual(first["attempt_count"], 1)
            self.assertEqual(first["max_attempts"], 2)
            with closing(sqlite3.connect(database_path)) as connection:
                connection.execute(
                    "UPDATE enterprise_agent_budget_reservations SET expires_at = ? WHERE run_id = ?",
                    ("2000-01-01T00:00:00+00:00", first["run_id"]),
                )
                connection.commit()

            capacity = get_agent_capacity_plan(
                database_url,
                workspace_id=workspace_id,
            )
            self.assertEqual(capacity["expired_leases_reconciled"], 1)
            self.assertEqual(capacity["queue_total"], 1)
            self.assertEqual(capacity["queue_runnable"], 1)
            requeued = get_agent_run(
                database_url,
                workspace_id=workspace_id,
                run_id=first["run_id"],
            )
            self.assertEqual(requeued["status"], "queued")
            self.assertEqual(requeued["attempt_count"], 1)
            self.assertEqual(requeued["max_attempts"], 2)
            self.assertIn("previous execution lease expired", requeued["error_text"].lower())

            with self.assertRaises(AgentGovernanceError) as stale_error:
                complete_agent_run(
                    database_url,
                    workspace_id=workspace_id,
                    run_id=first["run_id"],
                    claim_token=first["claim_token"],
                    status="ready",
                )
            self.assertEqual(stale_error.exception.code, "agent_claim_invalid")

            reclaimed = claim_agent_runs(
                database_url,
                workspace_id=workspace_id,
                job_types=["task_triage"],
                limit=1,
            )
            self.assertEqual(len(reclaimed), 1)
            second = reclaimed[0]
            self.assertEqual(second["run_id"], first["run_id"])
            self.assertEqual(second["attempt_count"], 2)
            self.assertNotEqual(second["claim_token"], first["claim_token"])
            self.assertNotEqual(
                second["budget_reservation"]["reservation_id"],
                first["budget_reservation"]["reservation_id"],
            )

            completed = complete_agent_run(
                database_url,
                workspace_id=workspace_id,
                run_id=second["run_id"],
                claim_token=second["claim_token"],
                status="ready",
            )
            self.assertEqual(completed["status"], "ready")
            with closing(sqlite3.connect(database_path)) as connection:
                run_count = connection.execute(
                    "SELECT COUNT(*) FROM enterprise_agent_runs WHERE run_id = ?",
                    (first["run_id"],),
                ).fetchone()[0]
                reservation_statuses = sorted(
                    row[0]
                    for row in connection.execute(
                        "SELECT status FROM enterprise_agent_budget_reservations WHERE run_id = ?",
                        (first["run_id"],),
                    ).fetchall()
                )
            self.assertEqual(run_count, 1)
            self.assertEqual(reservation_statuses, ["consumed", "expired"])


if __name__ == "__main__":
    unittest.main()
