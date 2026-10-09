from __future__ import annotations

import unittest

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from supermega_runtime.trial_runtime import create_trial_router
from supermega_runtime.trial_store import InMemoryTrialStore


class TrialManualMessageOrderIntakeTests(unittest.TestCase):
    def test_manual_pasted_message_order_endpoint_is_not_registered(self) -> None:
        app = FastAPI()
        app.include_router(
            create_trial_router(
                store=InMemoryTrialStore(reducer=lambda *_args: {}),
                resolve_principal=lambda _request: None,
            )
        )
        with TestClient(app) as client:
            response = client.post(
                "/api/trial/v1/commerce/order-intake/drafts",
                json={"source_label": "MSG-001", "message": "Order this item"},
            )
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
