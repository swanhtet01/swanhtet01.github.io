"""Focused source tests for the read-only installed Shop Orders boundary."""

from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from supermega_runtime.shop_order_snapshot import (
    SHOP_ORDER_SNAPSHOT_SCHEMA,
    project_shop_order_snapshot,
)
from supermega_runtime.trial_runtime import create_trial_router
from supermega_runtime.trial_store import InMemoryTrialStore, TrialPrincipal, TrialState


def test_snapshot_projects_lines_without_contact_or_payment_evidence():
    order = {
        "id": "ORD-1042",
        "sourceRecordId": "ECR-123",
        "createdAt": "2026-10-22T02:00:00Z",
        "customer": "Private customer name",
        "paymentEvidenceReference": "private receipt reference",
        "channel": "Private customer channel note",
        "status": "preparing",
        "paymentStatus": "pending",
        "refundStatus": "none",
        "paymentDueAt": "2026-10-29T02:00:00Z",
        "promisedAt": "2026-10-23T02:00:00Z",
        "fulfilment": "Private delivery address",
        "item": "Private customer summary",
        "quantity": 2,
        "total": 24000,
        "lines": [{"sku": "RICE-01", "name": "Rice", "nameMy": "ဆန်", "quantity": 2, "unitPriceMmk": 12000}],
    }
    result = project_shop_order_snapshot(
        {"orders": [order], "storefrontRequests": [{"contact": "Private phone"}]},
        workspace_id="shop-a", workspace_version=7,
        workspace_updated_at="2026-10-22T02:01:00Z",
    )

    assert result["schema"] == SHOP_ORDER_SNAPSHOT_SCHEMA
    assert result["scope"] == "confirmed-orders-only"
    assert result["workspaceVersion"] == 7
    assert result["orders"][0]["lines"] == [
        {"sku": "RICE-01", "name": "Rice", "nameMy": "ဆန်", "quantity": 2, "unitPriceMmk": 12000}
    ]
    assert result["orders"][0]["totalMmk"] == 24000
    assert "Private" not in str(result)
    assert "storefrontRequests" not in str(result)
    assert "sourceRecordId" not in result["orders"][0]


def test_legacy_order_has_no_invented_lines_or_payment_deadline():
    result = project_shop_order_snapshot({"orders": [{
        "id": "ORD-OLD", "createdAt": "2026-10-21T00:00:00Z", "channel": "Counter",
        "status": "confirmed", "paymentStatus": "pending", "refundStatus": "none",
        "item": "Rice", "quantity": 1, "total": 12000,
    }]}, workspace_id="shop-a", workspace_version=1, workspace_updated_at="")
    order = result["orders"][0]
    assert order["lineSnapshotsAvailable"] is False
    assert order["lines"] == []
    assert order["paymentDueAt"] is None


def test_duplicate_order_identity_fails_closed():
    order = {
        "id": "ORD-DUP", "createdAt": "2026-10-22T00:00:00Z", "channel": "Counter",
        "status": "confirmed", "paymentStatus": "pending", "refundStatus": "none",
        "item": "Rice", "quantity": 1, "total": 12000,
    }
    try:
        project_shop_order_snapshot(
            {"orders": [order, order]}, workspace_id="shop-a",
            workspace_version=2, workspace_updated_at="",
        )
    except ValueError:
        pass
    else:
        raise AssertionError("Duplicate order IDs must not be silently displayed twice.")


def test_endpoint_is_tenant_scoped_and_requires_shop_user_session():
    store = InMemoryTrialStore(reducer=lambda _surface, _event, _current, payload: payload)
    empty_state = {"schema": "supermega.commerce.workspace.v2", "items": [],
                   "orders": [], "movements": [], "closes": []}
    actors = {
        "alice": "00000000-0000-4000-8000-000000000001",
        "bob": "00000000-0000-4000-8000-000000000002",
        "carol": "00000000-0000-4000-8000-000000000003",
        "new_shop": "00000000-0000-4000-8000-000000000004",
        "no_read": "00000000-0000-4000-8000-000000000005",
    }
    session = "00000000-0000-4000-8000-000000000010"
    for workspace, actor, product in (
        ("shop-a", "alice", "commerce"),
        ("shop-b", "bob", "commerce"),
        ("ecommerce-c", "carol", "ecommerce"),
        ("shop-new", "new_shop", "commerce"),
        ("shop-no-read", "no_read", "commerce"),
    ):
        store.provision_membership(
            workspace_id=workspace, actor_id=actors[actor], actor_kind="human",
            capabilities=["company.read"] if actor == "no_read" else ["commerce.read"],
        )
        store.provision_product_entitlements(workspace_id=workspace, products=[product])
        if actor not in {"new_shop", "no_read"}:
            store._states[(workspace, "commerce")] = TrialState(
                workspace, "commerce", 3, empty_state, updated_at="2026-10-22T00:00:00Z",
            )

    principals = {
        "alice": TrialPrincipal("shop-a", actors["alice"], "human", session_id=session, identity_provider="supabase"),
        "bob": TrialPrincipal("shop-b", actors["bob"], "human", session_id=session, identity_provider="supabase"),
        "carol": TrialPrincipal("ecommerce-c", actors["carol"], "human", session_id=session, identity_provider="supabase"),
        "new_shop": TrialPrincipal("shop-new", actors["new_shop"], "human", session_id=session, identity_provider="supabase"),
        "no_read": TrialPrincipal("shop-no-read", actors["no_read"], "human", session_id=session, identity_provider="supabase"),
        "gateway": TrialPrincipal("shop-a", actors["alice"], "human", identity_provider="gateway"),
        "agent": TrialPrincipal("shop-a", actors["alice"], "agent", session_id=session, identity_provider="supabase"),
    }
    app = FastAPI()
    app.include_router(create_trial_router(
        store=store, resolve_principal=lambda request: principals.get(request.headers.get("x-test-user", "")),
    ))
    client = TestClient(app)
    path = "/api/trial/v1/shop/orders"

    assert client.get(path).status_code == 401
    assert client.get(path + "?workspace_id=shop-b").status_code == 401
    assert client.get(path, headers={"x-test-user": "gateway"}).status_code == 401
    assert client.get(path, headers={"x-test-user": "agent"}).status_code == 401
    ecommerce_response = client.get(path, headers={"x-test-user": "carol"})
    assert ecommerce_response.status_code == 403, ecommerce_response.json()
    assert ecommerce_response.json()["detail"]["code"] == "shop_orders_shop_entitlement_required"
    no_read_response = client.get(path, headers={"x-test-user": "no_read"})
    assert no_read_response.status_code == 403, no_read_response.json()
    assert no_read_response.json()["detail"]["required_capability"] == "commerce.read"
    assert client.get(path + "?workspace_id=shop-b", headers={"x-test-user": "alice"}).status_code == 422
    for actor, workspace in (("alice", "shop-a"), ("bob", "shop-b")):
        response = client.get(path, headers={"x-test-user": actor})
        assert response.status_code == 200
        assert response.headers["cache-control"] == "private, no-store"
        assert response.json()["workspaceId"] == workspace
        assert response.json()["orders"] == []

    # An authorized first-run Shop tenant has no Commerce state row. Its own
    # empty v0 snapshot is readable without borrowing another tenant's data.
    new_shop_response = client.get(path, headers={"x-test-user": "new_shop"})
    assert new_shop_response.status_code == 200, new_shop_response.json()
    assert new_shop_response.headers["cache-control"] == "private, no-store"
    assert new_shop_response.json()["workspaceId"] == "shop-new"
    assert new_shop_response.json()["workspaceVersion"] == 0
    assert new_shop_response.json()["workspaceUpdatedAt"] == ""
    assert new_shop_response.json()["orders"] == []

    # Isolate the route's tenant selection from the existing Commerce validator;
    # the projection's exact field allowlist is tested above.
    shop_a_state = {**empty_state, "orders": [{
        "id": "ORD-A", "createdAt": "2026-10-22T00:00:00Z", "channel": "Website",
        "status": "confirmed", "paymentStatus": "pending", "refundStatus": "none",
        "item": "Rice", "quantity": 1, "total": 12000, "customer": "Alice customer",
    }]}
    store._states[("shop-a", "commerce")] = TrialState("shop-a", "commerce", 4, shop_a_state)
    with patch("supermega_runtime.trial_runtime.validate_commerce_state", side_effect=lambda state: state):
        alice = client.get(path, headers={"x-test-user": "alice"})
        bob = client.get(path, headers={"x-test-user": "bob"})
    assert alice.status_code == 200
    assert [order["id"] for order in alice.json()["orders"]] == ["ORD-A"]
    assert bob.status_code == 200
    assert bob.json()["orders"] == []
    assert "Alice customer" not in alice.text

    # A persisted but empty Commerce row is inconsistent, not a first-run
    # workspace. It must not be silently reported as a valid empty snapshot.
    store._states[("shop-new", "commerce")] = TrialState("shop-new", "commerce", 4, {})
    corrupt_response = client.get(path, headers={"x-test-user": "new_shop"})
    assert corrupt_response.status_code == 409
