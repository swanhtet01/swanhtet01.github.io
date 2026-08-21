"""Self-serve tenant creation: fail-closed window, one tenant per claim.

Covers spec step D of hq/strategy/SELF-SERVE-ONBOARDING-SPEC.md: the endpoint
ships dark behind SUPERMEGA_SELF_SERVE_ACTIVATION_WINDOW, requires a verified
email session, derives one RLS-isolated tenant per claim code, replays
idempotently for the same owner, rejects a different-user replay, rate limits
per user, and keeps the created event immutable.
"""

from __future__ import annotations

from collections.abc import Mapping
from contextlib import contextmanager
from copy import deepcopy
import os
import unittest
from unittest.mock import patch

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from supermega_runtime.trial_runtime import (
    SELF_SERVE_ACTIVATION_CONTRACT,
    SELF_SERVE_ACTIVATION_WINDOW_ENV,
    TrialSignupSession,
    create_trial_router,
)
from supermega_runtime.trial_store import (
    SELF_SERVE_OWNER_CAPABILITIES,
    SELF_SERVE_RATE_LIMIT_MAX,
    InMemoryTrialStore,
    TrialPrincipal,
    self_serve_workspace_id,
)


OWNER_SESSION = "verified-owner-session"
SECOND_OWNER_SESSION = "second-owner-session"
UNVERIFIED_SESSION = "unverified-session"

OWNER_ACTOR_ID = "2f8d24d8-308c-4dc8-a352-7b61df756728"
SECOND_ACTOR_ID = "3813d642-90f6-44e0-ad62-195ac8793aa8"

CLAIM_CODE = "SM-ABCD-2345"
OTHER_CLAIM_CODE = "SM-WXYZ-7890"
BUSINESS_NAME = "Yangon Tyre and Service"


@contextmanager
def activation_window(value: str | None):
    """Pin the founder's activation-window flag for one test block."""

    with patch.dict(os.environ):
        os.environ.pop(SELF_SERVE_ACTIVATION_WINDOW_ENV, None)
        if value is not None:
            os.environ[SELF_SERVE_ACTIVATION_WINDOW_ENV] = value
        yield


class MergeReducer:
    def __call__(
        self,
        surface: str,
        event_type: str,
        current: Mapping[str, object],
        payload: Mapping[str, object],
    ) -> Mapping[str, object]:
        next_state = dict(current)
        changes = payload.get("changes", {})
        if isinstance(changes, Mapping):
            next_state.update(changes)
        return next_state


class SelfServeWorkspaceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = InMemoryTrialStore(reducer=MergeReducer())
        self.sessions = {
            OWNER_SESSION: TrialSignupSession(
                actor_id=OWNER_ACTOR_ID,
                session_id="d8aaab28-a5a7-4a0d-9d75-7a6265a969c3",
                email_verified=True,
            ),
            SECOND_OWNER_SESSION: TrialSignupSession(
                actor_id=SECOND_ACTOR_ID,
                session_id="9c1a7e5e-13a1-4a8e-9be6-0d3f7a1c2b45",
                email_verified=True,
            ),
            UNVERIFIED_SESSION: TrialSignupSession(
                actor_id="4a1f0f70-1234-4c56-8def-abc123456789",
                session_id="7e6d5c4b-3a29-4180-9f0e-d1c2b3a49586",
                email_verified=False,
            ),
        }
        self.client = self._client(self.store)

    def tearDown(self) -> None:
        self.client.close()

    def _client(self, store: InMemoryTrialStore) -> TestClient:
        # The test session map stands in for trusted authentication middleware.
        def resolve_signup_session(request: Request) -> TrialSignupSession | None:
            return self.sessions.get(request.headers.get("x-test-signup-session", ""))

        app = FastAPI()
        app.include_router(
            create_trial_router(
                store=store,
                resolve_principal=lambda request: None,
                resolve_signup_session=resolve_signup_session,
            )
        )
        return TestClient(app)

    def _post(
        self,
        *,
        claim_code: str = CLAIM_CODE,
        business_name: str = BUSINESS_NAME,
        product: str = "commerce",
        session: str | None = OWNER_SESSION,
        client: TestClient | None = None,
    ):
        headers = {"x-test-signup-session": session} if session else {}
        return (client or self.client).post(
            "/api/trial/v1/workspaces",
            headers=headers,
            json={"claimCode": claim_code, "businessName": business_name, "product": product},
        )

    def _owner_readiness(self, workspace_id: str, actor_id: str = OWNER_ACTOR_ID):
        return self.store.readiness(TrialPrincipal(workspace_id, actor_id, "human"))

    def test_window_closed_returns_503_by_default(self) -> None:
        with activation_window(None):
            response = self._post()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["code"], "activation_window_closed")
        # Nothing was provisioned while the window stayed closed.
        readiness = self._owner_readiness(self_serve_workspace_id(CLAIM_CODE))
        self.assertFalse(readiness.membership_ready)

    def test_window_gate_requires_exactly_open(self) -> None:
        for value in ("", "Open", "OPEN", " open", "open ", "true", "1", "closed"):
            with self.subTest(value=repr(value)):
                with activation_window(value):
                    response = self._post()
                self.assertEqual(response.status_code, 503)
                self.assertEqual(
                    response.json()["detail"]["code"], "activation_window_closed"
                )

    def test_window_closed_wins_over_every_other_failure(self) -> None:
        # The gate answers first: no auth, parsing, or storage work leaks
        # through a closed window, even for callers that would otherwise fail.
        with activation_window(None):
            unauthenticated = self._post(session=None)
            invalid_claim = self._post(claim_code="not-a-claim")
        self.assertEqual(unauthenticated.status_code, 503)
        self.assertEqual(unauthenticated.json()["detail"]["code"], "activation_window_closed")
        self.assertEqual(invalid_claim.status_code, 503)
        self.assertEqual(invalid_claim.json()["detail"]["code"], "activation_window_closed")

    def test_open_window_creates_owner_workspace(self) -> None:
        with activation_window("open"):
            response = self._post()
        self.assertEqual(response.status_code, 200)
        body = response.json()
        workspace_id = self_serve_workspace_id(CLAIM_CODE)
        self.assertEqual(body["contract"], SELF_SERVE_ACTIVATION_CONTRACT)
        self.assertEqual(body["status"], "created")
        self.assertEqual(body["workspace"]["workspace_id"], workspace_id)
        self.assertEqual(body["workspace"]["label"], BUSINESS_NAME)
        self.assertEqual(body["workspace"]["access"], "owner")
        self.assertEqual(body["workspace"]["product"], "commerce")
        self.assertEqual(body["claim"]["claimCode"], CLAIM_CODE)
        self.assertEqual(body["claim"]["workspaceId"], workspace_id)
        self.assertFalse(body["idempotent_replay"])
        self.assertTrue(body["external_writes_performed"])
        self.assertFalse(body["secret_values_exposed"])
        # The tenant exists with owner controls plus only the selected product.
        readiness = self._owner_readiness(workspace_id)
        self.assertTrue(readiness.membership_ready)
        self.assertEqual(readiness.capabilities, SELF_SERVE_OWNER_CAPABILITIES)
        self.assertEqual(readiness.product_entitlements, ("commerce",))
        # The claim linkage record joins the device trial to the tenant.
        link = self.store._self_serve_links[CLAIM_CODE]
        self.assertEqual(link["workspace_id"], workspace_id)
        self.assertEqual(link["owner_actor_id"], OWNER_ACTOR_ID)
        self.assertEqual(link["business_name"], BUSINESS_NAME)

    def test_idempotent_replay_returns_the_same_workspace(self) -> None:
        with activation_window("open"):
            first = self._post()
            replay = self._post()
        self.assertEqual(first.status_code, 200)
        self.assertEqual(replay.status_code, 200)
        first_body = first.json()
        replay_body = replay.json()
        self.assertEqual(replay_body["status"], "already_created")
        self.assertTrue(replay_body["idempotent_replay"])
        self.assertFalse(replay_body["external_writes_performed"])
        self.assertEqual(
            replay_body["workspace"]["workspace_id"],
            first_body["workspace"]["workspace_id"],
        )
        self.assertEqual(replay_body["workspace"]["label"], BUSINESS_NAME)
        self.assertEqual(replay_body["created_at"], first_body["created_at"])

    def test_different_user_replay_of_the_same_claim_is_rejected(self) -> None:
        with activation_window("open"):
            first = self._post()
            second = self._post(session=SECOND_OWNER_SESSION)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(second.json()["detail"]["code"], "claim_code_conflict")
        # The second user gained no membership in the claimed tenant.
        workspace_id = self_serve_workspace_id(CLAIM_CODE)
        readiness = self._owner_readiness(workspace_id, SECOND_ACTOR_ID)
        self.assertFalse(readiness.membership_ready)

    def test_same_user_different_business_name_is_an_idempotency_conflict(self) -> None:
        with activation_window("open"):
            first = self._post()
            conflicting = self._post(business_name="A Different Company")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(conflicting.status_code, 409)
        self.assertEqual(
            conflicting.json()["detail"]["code"], "trial_idempotency_conflict"
        )

    def test_same_claim_cannot_change_its_product_entitlement(self) -> None:
        with activation_window("open"):
            first = self._post(product="commerce")
            conflicting = self._post(product="website")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(conflicting.status_code, 409)
        self.assertEqual(
            conflicting.json()["detail"]["code"], "trial_idempotency_conflict"
        )

    def test_website_activation_grants_only_website_product_access(self) -> None:
        with activation_window("open"):
            response = self._post(claim_code="SM-WXYZ-7890", product="website")
        self.assertEqual(response.status_code, 200)
        workspace_id = self_serve_workspace_id("SM-WXYZ-7890")
        readiness = self._owner_readiness(workspace_id)
        self.assertEqual(readiness.product_entitlements, ("website",))
        self.assertIn("website.write", readiness.capabilities)
        self.assertNotIn("commerce.write", readiness.capabilities)
        self.assertNotIn("production.write", readiness.capabilities)

    def test_unknown_product_is_rejected_without_creating_a_tenant(self) -> None:
        with activation_window("open"):
            response = self._post(claim_code="SM-WXYZ-7890", product="agents")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.store._self_serve_links, {})

    def test_invalid_claim_format_is_rejected(self) -> None:
        invalid_claims = (
            "SM-ABCI-2345",  # I is not in the Crockford alphabet
            "SM-ABCL-2345",  # L
            "SM-ABCO-2345",  # O
            "SM-ABCU-2345",  # U
            "sm-abcd-2345",  # lowercase
            "SM-ABC-2345",  # short group
            "SM-ABCD-23456",  # long group
            "SMABCD2345",  # missing separators
            "XX-ABCD-2345",  # wrong prefix
        )
        with activation_window("open"):
            for claim in invalid_claims:
                with self.subTest(claim=claim):
                    response = self._post(claim_code=claim)
                    self.assertEqual(response.status_code, 422)
                    self.assertEqual(
                        response.json()["detail"]["code"], "claim_code_invalid"
                    )
        self.assertEqual(self.store._self_serve_links, {})

    def test_non_canonical_business_name_is_rejected(self) -> None:
        with activation_window("open"):
            padded = self._post(business_name=" Padded Name")
            blank = self._post(business_name="   ")
            extra_field = self.client.post(
                "/api/trial/v1/workspaces",
                headers={"x-test-signup-session": OWNER_SESSION},
                json={
                    "claimCode": CLAIM_CODE,
                    "businessName": BUSINESS_NAME,
                    "workspace_id": "spoofed",
                },
            )
        self.assertEqual(padded.status_code, 422)
        self.assertEqual(padded.json()["detail"]["code"], "business_name_invalid")
        self.assertEqual(blank.status_code, 422)
        self.assertEqual(blank.json()["detail"]["code"], "business_name_invalid")
        self.assertEqual(extra_field.status_code, 422)
        self.assertEqual(
            extra_field.json()["detail"]["code"], "self_serve_request_invalid"
        )

    def test_unverified_email_is_rejected(self) -> None:
        with activation_window("open"):
            response = self._post(session=UNVERIFIED_SESSION)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json()["detail"]["code"], "email_verification_required"
        )
        self.assertEqual(self.store._self_serve_links, {})

    def test_unauthenticated_request_is_rejected(self) -> None:
        with activation_window("open"):
            response = self._post(session=None)
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"]["code"], "trial_auth_required")

    def test_rate_limit_applies_per_user(self) -> None:
        claims = [f"SM-TEST-000{index}" for index in range(SELF_SERVE_RATE_LIMIT_MAX + 1)]
        with activation_window("open"):
            for claim in claims[:SELF_SERVE_RATE_LIMIT_MAX]:
                response = self._post(claim_code=claim, business_name=f"Shop {claim}")
                self.assertEqual(response.status_code, 200)
            limited = self._post(
                claim_code=claims[SELF_SERVE_RATE_LIMIT_MAX],
                business_name="One Too Many",
            )
            # Another verified user keeps their own budget.
            other_user = self._post(
                claim_code=OTHER_CLAIM_CODE,
                business_name="Second Owner Shop",
                session=SECOND_OWNER_SESSION,
            )
        self.assertEqual(limited.status_code, 429)
        detail = limited.json()["detail"]
        self.assertEqual(detail["code"], "self_serve_rate_limited")
        self.assertEqual(detail["limit"], SELF_SERVE_RATE_LIMIT_MAX)
        self.assertEqual(other_user.status_code, 200)

    def test_created_event_is_immutable(self) -> None:
        with activation_window("open"):
            first = self._post()
        self.assertEqual(first.status_code, 200)
        workspace_id = self_serve_workspace_id(CLAIM_CODE)
        event_keys = [key for key in self.store._events if key[0] == workspace_id]
        self.assertEqual(len(event_keys), 1)
        original_event = deepcopy(self.store._events[event_keys[0]])

        with activation_window("open"):
            conflicting = self._post(business_name="Mutation Attempt")
            replay = self._post()
        self.assertEqual(conflicting.status_code, 409)
        self.assertEqual(replay.status_code, 200)
        # The conflicting command changed nothing: fingerprint, actor, and the
        # recorded result are byte-for-byte the original creation event.
        self.assertEqual(self.store._events[event_keys[0]], original_event)
        replay_body = replay.json()
        self.assertEqual(replay_body["workspace"]["label"], BUSINESS_NAME)
        self.assertEqual(replay_body["status"], "already_created")

    def test_store_not_ready_fails_closed_even_with_the_window_open(self) -> None:
        blocked_store = InMemoryTrialStore(reducer=MergeReducer(), write_enabled=False)
        client = self._client(blocked_store)
        try:
            with activation_window("open"):
                response = self._post(client=client)
        finally:
            client.close()
        self.assertEqual(response.status_code, 503)
        detail = response.json()["detail"]
        self.assertEqual(detail["code"], "trial_not_ready")
        self.assertIn("write_enabled", detail["blockers"])


class SelfServeWelcomeEmailTests(unittest.TestCase):
    """The courtesy welcome send can never change the activation outcome.

    It fires exactly once, only for a NEW tenant, only when the verified
    session carries an address, and a sender failure of any kind leaves the
    response identical to the no-sender path.
    """

    OWNER_EMAIL = "owner@example.invalid"

    def setUp(self) -> None:
        self.store = InMemoryTrialStore(reducer=MergeReducer())
        self.sends: list[dict[str, str]] = []
        self.sender_raises = False
        self.sessions = {
            OWNER_SESSION: TrialSignupSession(
                actor_id=OWNER_ACTOR_ID,
                session_id="d8aaab28-a5a7-4a0d-9d75-7a6265a969c3",
                email_verified=True,
                email=self.OWNER_EMAIL,
            ),
            SECOND_OWNER_SESSION: TrialSignupSession(
                actor_id=SECOND_ACTOR_ID,
                session_id="9c1a7e5e-13a1-4a8e-9be6-0d3f7a1c2b45",
                email_verified=True,
                # Verified session without a usable address: send must be skipped.
                email="",
            ),
        }

        def send_welcome_email(
            *, to_email: str, business_name: str, workspace_id: str, claim_code: str
        ) -> bool:
            if self.sender_raises:
                raise RuntimeError("provider exploded")
            self.sends.append(
                {
                    "to_email": to_email,
                    "business_name": business_name,
                    "workspace_id": workspace_id,
                    "claim_code": claim_code,
                }
            )
            return True

        def resolve_signup_session(request: Request) -> TrialSignupSession | None:
            return self.sessions.get(request.headers.get("x-test-signup-session", ""))

        app = FastAPI()
        app.include_router(
            create_trial_router(
                store=self.store,
                resolve_principal=lambda request: None,
                resolve_signup_session=resolve_signup_session,
                send_welcome_email=send_welcome_email,
            )
        )
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()

    def _post(self, *, claim_code: str = CLAIM_CODE, session: str = OWNER_SESSION):
        return self.client.post(
            "/api/trial/v1/workspaces",
            headers={"x-test-signup-session": session},
            json={"claimCode": claim_code, "businessName": BUSINESS_NAME, "product": "commerce"},
        )

    def test_new_tenant_sends_exactly_one_welcome_with_exact_fields(self) -> None:
        with activation_window("open"):
            response = self._post()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "created")
        self.assertEqual(
            self.sends,
            [
                {
                    "to_email": self.OWNER_EMAIL,
                    "business_name": BUSINESS_NAME,
                    "workspace_id": self_serve_workspace_id(CLAIM_CODE),
                    "claim_code": CLAIM_CODE,
                }
            ],
        )

    def test_idempotent_replay_never_sends_again(self) -> None:
        with activation_window("open"):
            self.assertEqual(self._post().status_code, 200)
            replay = self._post()
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay.json()["status"], "already_created")
        self.assertEqual(len(self.sends), 1)

    def test_session_without_address_skips_the_send(self) -> None:
        with activation_window("open"):
            response = self._post(claim_code=OTHER_CLAIM_CODE, session=SECOND_OWNER_SESSION)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "created")
        self.assertEqual(self.sends, [])

    def test_sender_exception_cannot_change_the_activation_response(self) -> None:
        self.sender_raises = True
        with activation_window("open"):
            response = self._post()
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "created")
        self.assertEqual(body["contract"], SELF_SERVE_ACTIVATION_CONTRACT)
        self.assertEqual(self.sends, [])
        # The tenant durably exists despite the sender failure.
        readiness = self.store.readiness(
            TrialPrincipal(self_serve_workspace_id(CLAIM_CODE), OWNER_ACTOR_ID, "human")
        )
        self.assertTrue(readiness.capabilities)


if __name__ == "__main__":
    unittest.main()
