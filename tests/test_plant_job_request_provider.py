from __future__ import annotations

import asyncio
from collections.abc import Mapping
from datetime import datetime
import hashlib
import json
import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from supermega_runtime.plant_job_request_provider import (
    OllamaPlantJobRequestProvider,
    PlantJobRequestModelExtraction,
    build_plant_job_request_draft,
    configured_plant_job_request_provider,
)
from supermega_runtime.runtime import create_app


SOURCE = (
    "Make 1,200 Aloe shampoo bottles on Filling Line 2 by 2099-08-18 17:30. "
    "Owner: Production lead. Urgent."
)


def extraction(**changes: object) -> PlantJobRequestModelExtraction:
    payload: dict[str, object] = {
        "line": "Filling Line 2",
        "product": "Aloe shampoo bottles",
        "target": "1,200 Aloe shampoo bottles on Filling Line 2",
        "owner": "Production lead",
        "priority": "Urgent",
        "due_at": "2099-08-18 17:30",
        "uncertain_fields": [],
    }
    payload.update(changes)
    return PlantJobRequestModelExtraction.model_validate(payload)


class FakePlantJobRequestProvider:
    provider_id = "ollama-local"

    def __init__(self) -> None:
        self.calls: list[dict[str, str]] = []

    async def generate(self, *, source_text: str, workspace_id: str, actor_id: str):
        self.calls.append({"source_text": source_text, "workspace_id": workspace_id, "actor_id": actor_id})
        return build_plant_job_request_draft(
            source_text=source_text,
            extraction=extraction(),
            receipt_id="ollama-local-route-receipt",
            model="llama3.2:1b",
            now=datetime(2026, 8, 15, 12, 0),
        )


class PlantJobRequestProviderTests(unittest.TestCase):
    def test_exact_source_fields_become_a_reviewable_job_draft(self) -> None:
        draft = build_plant_job_request_draft(
            source_text=SOURCE,
            extraction=extraction(),
            receipt_id="ollama-local-test-receipt",
            model="llama3.2:1b",
            now=datetime(2026, 8, 15, 12, 0),
        )

        self.assertEqual(draft.status, "ready_for_review")
        self.assertEqual(draft.job_id, "JOB-AI-" + hashlib.sha256(SOURCE.encode()).hexdigest()[:10].upper())
        self.assertEqual(draft.target, 1_200)
        self.assertEqual(draft.due_at, "2099-08-18T17:30")
        self.assertEqual(draft.priority, "urgent")
        self.assertEqual(draft.grounded_fields, ["line", "product", "target", "owner", "priority", "due_at"])
        self.assertEqual(draft.missing_fields, [])
        self.assertEqual(draft.defaulted_fields, [])

    def test_invented_and_relative_values_are_quarantined(self) -> None:
        source = "Make 40 soap bars on Line A tomorrow. Owner: Shift lead."
        draft = build_plant_job_request_draft(
            source_text=source,
            extraction=extraction(
                line="Line A",
                product="soap bars",
                target="40",
                owner="Factory manager",
                priority=None,
                due_at="tomorrow",
            ),
            receipt_id="ollama-local-test-receipt",
            model="llama3.2:1b",
            now=datetime(2026, 8, 15, 12, 0),
        )

        self.assertEqual(draft.status, "needs_clarification")
        self.assertIsNone(draft.owner)
        self.assertIsNone(draft.due_at)
        self.assertEqual(draft.priority, "normal")
        self.assertEqual(draft.defaulted_fields, ["priority"])
        self.assertEqual(draft.missing_fields, ["owner", "due_at"])
        self.assertIn("owner", draft.uncertain_fields)
        self.assertIn("due_at", draft.uncertain_fields)

    def test_product_measurement_is_not_treated_as_output_quantity(self) -> None:
        source = "Make 500ml shampoo bottles on Line A by 2099-08-18 17:30. Owner: Shift lead."
        draft = build_plant_job_request_draft(
            source_text=source,
            extraction=extraction(
                line="Line A",
                product="500ml shampoo bottles",
                target="500ml",
                owner="Shift lead",
                priority=None,
                due_at="2099-08-18 17:30",
            ),
            receipt_id="ollama-local-test-receipt",
            model="llama3.2:1b",
            now=datetime(2026, 8, 15, 12, 0),
        )

        self.assertIsNone(draft.target)
        self.assertIn("target", draft.missing_fields)
        self.assertEqual(draft.status, "needs_clarification")

    def test_provider_uses_serial_scale_to_zero_ollama_chat(self) -> None:
        calls: list[tuple[Mapping[str, object], float]] = []

        def transport(payload: Mapping[str, object], timeout: float) -> Mapping[str, object]:
            calls.append((payload, timeout))
            return {
                "done": True,
                "model": "llama3.2:1b",
                "message": {"role": "assistant", "content": json.dumps(extraction().model_dump())},
            }

        provider = OllamaPlantJobRequestProvider(
            model="llama3.2:1b",
            receipt_secret="test-secret",
            transport=transport,
        )
        draft = asyncio.run(provider.generate(source_text=SOURCE, workspace_id="plant-a", actor_id="reviewer-a"))

        self.assertEqual(draft.status, "ready_for_review")
        self.assertEqual(len(calls), 1)
        payload = calls[0][0]
        self.assertFalse(payload["think"])
        self.assertEqual(payload["keep_alive"], 0)
        self.assertNotIn("tools", payload)
        self.assertEqual(payload["model"], "llama3.2:1b")
        self.assertIn(SOURCE, str(payload["messages"]))

    def test_configuration_never_falls_through_to_cloud(self) -> None:
        with patch.dict(os.environ, {"SUPERMEGA_OLLAMA_ENABLED": "1", "SUPERMEGA_AI_PROVIDER_POLICY": "local-only"}, clear=True):
            self.assertIsInstance(configured_plant_job_request_provider(), OllamaPlantJobRequestProvider)
        with patch.dict(os.environ, {"SUPERMEGA_OLLAMA_ENABLED": "1", "SUPERMEGA_AI_PROVIDER_POLICY": "cloud-enabled"}, clear=True):
            self.assertIsNone(configured_plant_job_request_provider())
        with patch.dict(os.environ, {"SUPERMEGA_OLLAMA_ENABLED": "1", "SUPERMEGA_AI_PROVIDER_POLICY": "local-only", "VERCEL": "1"}, clear=True):
            self.assertIsNone(configured_plant_job_request_provider())

    def test_route_is_loopback_bound_and_performs_no_action(self) -> None:
        origin = "http://127.0.0.1:5190"
        payload = {"source_label": "plant-job-request", "request_text": SOURCE}
        provider = FakePlantJobRequestProvider()
        environment = {
            "SUPERMEGA_DATABASE_URL": "",
            "SUPERMEGA_TRIAL_WRITES_ENABLED": "false",
            "SUPERMEGA_CORS_ORIGINS": origin,
            "SUPERMEGA_AI_PROVIDER_POLICY": "local-only",
            "SUPERMEGA_OLLAMA_ENABLED": "0",
        }
        with patch.dict(os.environ, environment, clear=False), patch(
            "supermega_runtime.runtime.configured_plant_job_request_provider",
            return_value=provider,
        ):
            with TestClient(create_app(), base_url="http://127.0.0.1:8790", client=("127.0.0.1", 50_000)) as client:
                health = client.get("/api/health").json()
                missing_header = client.post("/api/local/v1/plant/job-request-drafts", headers={"origin": origin}, json=payload)
                invalid = client.post(
                    "/api/local/v1/plant/job-request-drafts",
                    headers={"origin": origin, "x-supermega-local-review": "plant-job-request-v1"},
                    json={**payload, "unexpected": True},
                )
                response = client.post(
                    "/api/local/v1/plant/job-request-drafts",
                    headers={"origin": origin, "x-supermega-local-review": "plant-job-request-v1"},
                    json=payload,
                )

        self.assertTrue(health["ai"]["local_plant_job_request_review_enabled"])
        self.assertEqual(health["ai"]["plant_job_request_provider"], "ollama-local")
        self.assertEqual(missing_header.status_code, 404)
        self.assertEqual(invalid.status_code, 422)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["draft"]["status"], "ready_for_review")
        self.assertFalse(body["raw_request_retained"])
        self.assertEqual(body["jobs_created"], 0)
        self.assertEqual(body["schedule_changes_performed"], 0)
        self.assertEqual(body["material_actions_performed"], 0)
        self.assertEqual(body["equipment_actions_performed"], 0)
        self.assertFalse(body["external_writes_performed"])
        self.assertEqual(provider.calls[0]["workspace_id"], "local-demo-plant")


if __name__ == "__main__":
    unittest.main()
