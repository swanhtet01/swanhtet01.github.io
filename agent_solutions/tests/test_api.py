import asyncio

import httpx

from agent_solutions.main import app
from agent_solutions.runtime import AgentQuotaUnavailable


def _post(path: str, payload: dict[str, object]) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.post(path, json=payload)

    return asyncio.run(send())


def _post_file(path: str, name: str, content: str) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.post(
                path,
                files={"file": (name, content, "text/csv")},
            )

    return asyncio.run(send())


def test_trial_blueprint_endpoint_is_non_persistent() -> None:
    response = _post("/v1/trial-blueprints", {"template_id": "shop.receiving-evidence"})
    assert response.status_code == 200
    assert response.json()["trial_state"] == "not_created"


def test_trial_blueprint_batch_is_non_persistent() -> None:
    response = _post(
        "/v1/trial-blueprints/batch",
        {
            "trials": [
                {"template_id": "shop.daily-close"},
                {"template_id": "plant.shift-handoff"},
            ]
        },
    )
    assert response.status_code == 200
    assert response.json()["blueprint_count"] == 2
    assert response.json()["trial_state"] == "not_created"


def test_csv_lead_import_is_review_only() -> None:
    response = _post_file(
        "/v1/lead-fit/csv",
        "approved-leads.csv",
        (
            "lead_id,business_name,industry,permission_status,source_owner\n"
            "lead-1,Example Factory,Manufacturing,customer_approved,Customer import\n"
        ),
    )
    assert response.status_code == 200
    assert response.json()["fits"][0]["disposition"] == "review"
    assert response.json()["fits"][0]["outreach_state"] == "not_started"


def test_unconfirmed_source_is_rejected_before_model_execution() -> None:
    response = _post(
        "/v1/briefs",
        {
            "template_id": "agent.inbox-brief",
            "sources": [
                {
                    "source_id": "unconfirmed-1",
                    "label": "Unconfirmed excerpt",
                    "source_kind": "provided_text",
                    "permission_status": "not_confirmed",
                    "source_owner": "Unknown",
                    "text": "This must not reach the model.",
                }
            ],
        },
    )
    assert response.status_code == 422


def test_unknown_template_is_not_a_model_failure() -> None:
    response = _post(
        "/v1/briefs",
        {
            "template_id": "missing.template",
            "sources": [
                {
                    "source_id": "approved-unknown-template",
                    "label": "Approved excerpt",
                    "source_kind": "provided_text",
                    "permission_status": "customer_provided",
                    "source_owner": "Customer",
                    "text": "A synthetic approved note.",
                }
            ],
        },
    )
    assert response.status_code == 404


def test_quota_is_a_truthful_service_state(monkeypatch: object) -> None:
    async def unavailable(_: object) -> object:
        raise AgentQuotaUnavailable("quota unavailable")

    monkeypatch.setattr("agent_solutions.main.run_insight_brief", unavailable)
    response = _post(
        "/v1/briefs",
        {
            "template_id": "agent.inbox-brief",
            "sources": [
                {
                    "source_id": "approved-1",
                    "label": "Approved excerpt",
                    "source_kind": "provided_text",
                    "permission_status": "customer_provided",
                    "source_owner": "Customer",
                    "text": "A synthetic approved note.",
                }
            ],
        },
    )
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "model_quota_unavailable"
