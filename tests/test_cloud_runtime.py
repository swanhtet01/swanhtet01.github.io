from __future__ import annotations

import json
import os
import unittest
import urllib.error
from contextlib import contextmanager
from collections.abc import Iterator
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from supermega_runtime.cloud_runtime import DAILY_CRON_PATH, QUEUE_CRON_PATH, router


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

    @staticmethod
    def _environment(**overrides: str) -> dict[str, str]:
        return {
            "CRON_SECRET": "cron-secret",
            "SUPERMEGA_INTERNAL_CRON_TOKEN": "worker-secret",
            "SUPERMEGA_CLOUD_TASKS_WORKER_URL": CloudRuntimeTests.worker_url,
            "SUPERMEGA_CLOUD_TASKS_ALLOWED_HOSTS": "worker.supermega.dev",
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
            explicit_header = client.get(QUEUE_CRON_PATH, headers={"x-cron-secret": "worker-secret"})

        for response in (missing, wrong, malformed, ambiguous):
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.json()["detail"], "cron_auth_required")
        self.assertEqual(bearer.status_code, 200)
        self.assertEqual(explicit_header.status_code, 200)

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

    def test_queue_and_daily_routes_forward_fixed_meaningful_job_types(self) -> None:
        responses = [
            FakeWorkerResponse(self._success_payload()),
            FakeWorkerResponse(self._success_payload()),
        ]
        with patch("supermega_runtime.cloud_runtime._open_worker_request", side_effect=responses) as open_worker:
            with self._client() as client:
                queue = client.get(QUEUE_CRON_PATH, headers={"authorization": "Bearer cron-secret"})
                daily = client.get(DAILY_CRON_PATH, headers={"authorization": "Bearer cron-secret"})

        self.assertEqual(queue.json()["status"], "accepted")
        self.assertEqual(daily.json()["status"], "accepted")
        queue_request = open_worker.call_args_list[0].args[0]
        daily_request = open_worker.call_args_list[1].args[0]
        queue_payload = json.loads(queue_request.data)
        daily_payload = json.loads(daily_request.data)
        self.assertEqual(queue_payload["contract_version"], "supermega.hosted-agent-scheduler.v1")
        self.assertEqual(queue_payload["cycle"], "queue")
        self.assertEqual(queue_payload["job_types"], ["task_triage", "ops_watch"])
        self.assertEqual(queue_payload["limit"], 8)
        self.assertEqual(daily_payload["cycle"], "daily")
        self.assertEqual(daily_payload["job_types"], ["founder_brief", "github_release_watch"])
        self.assertEqual(daily_payload["limit"], 4)

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
        worker_payload = self._success_payload(
            processed_count=3,
            summary=(" completed\u0000 " * 300),
            token="must-not-leak",
            nested={"authorization": "Bearer must-not-leak", "safe": "kept"},
            jobs=[{"job_id": index, "status": "done"} for index in range(40)],
            side_effects={
                "writes_performed": True,
                "external_messages_sent": False,
            },
        )
        with patch(
            "supermega_runtime.cloud_runtime._open_worker_request",
            return_value=FakeWorkerResponse(worker_payload),
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
        self.assertEqual(body["worker_result"]["token"], "[redacted]")
        self.assertEqual(body["worker_result"]["nested"]["authorization"], "[redacted]")
        self.assertLessEqual(len(body["worker_result"]["summary"]), 1_024)
        self.assertEqual(len(body["worker_result"]["jobs"]), 33)
        self.assertTrue(body["worker_result"]["jobs"][-1]["_truncated"])
        self.assertNotIn("must-not-leak", json.dumps(body))

        worker_request = open_worker.call_args.args[0]
        request_headers = {key.lower(): value for key, value in worker_request.header_items()}
        self.assertEqual(request_headers["authorization"], "Bearer worker-secret")
        self.assertEqual(request_headers["x-supermega-cron-token"], "worker-secret")
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


if __name__ == "__main__":
    unittest.main()
