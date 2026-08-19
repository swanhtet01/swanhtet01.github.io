from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stdout

from fastapi.testclient import TestClient

from agent_os import finance_agent
from agent_os.gateway_main import app


RETIRED_DETAIL = "legacy_agent_os_retired_use_canonical_managed_queue"
RETIRED_STATUS = {
    "service": "legacy-agent-os-gateway",
    "status": "retired",
    "ready": False,
    "writes_enabled": False,
    "replacement": "canonical-managed-agent-queue",
}


class RetiredAgentOsGatewayTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_root_and_health_report_retired_and_fail_closed(self) -> None:
        for path in ("/", "/health"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), RETIRED_STATUS)

    def test_logs_and_status_return_410_with_exact_retirement_reason(self) -> None:
        for path in ("/logs/finance", "/logs/anything", "/status"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 410)
                self.assertEqual(response.json(), {"detail": RETIRED_DETAIL})

    def test_api_documentation_surfaces_stay_disabled(self) -> None:
        for path in ("/docs", "/redoc", "/openapi.json"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 404)

    def test_finance_agent_exits_78_with_retired_fail_closed_payload(self) -> None:
        captured = io.StringIO()
        with redirect_stdout(captured):
            exit_code = finance_agent.main()
        self.assertEqual(exit_code, 78)
        payload = json.loads(captured.getvalue())
        self.assertEqual(payload["service"], "legacy-finance-agent")
        self.assertEqual(payload["status"], "retired")
        self.assertFalse(payload["writes_enabled"])
        self.assertFalse(payload["payments_enabled"])


if __name__ == "__main__":
    unittest.main()
