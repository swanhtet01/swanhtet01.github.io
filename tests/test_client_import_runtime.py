from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import unittest

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from supermega_runtime.client_import_runtime import (
    CLIENT_IMPORT_MAX_PACKAGE_BYTES,
    CLIENT_IMPORT_MAX_ROWS,
    CLIENT_IMPORT_OBJECTS,
    CLIENT_IMPORT_PREVIEW_SCHEMA,
    CLIENT_IMPORT_PROFILE_IDS,
    CLIENT_IMPORT_STAGING_SCHEMA,
    ClientImportValidationError,
    validate_client_import_staging_package,
)
from supermega_runtime.runtime import reduce_trial_state
from supermega_runtime.trial_runtime import create_trial_router
from supermega_runtime.trial_store import InMemoryTrialStore, TrialPrincipal


PRODUCT_FIXTURES: dict[str, dict[str, object]] = {
    "commerce": {
        "mapping": {
            "sku": "sku",
            "name": "item_name",
            "onHand": "opening_stock",
            "reorderAt": "reorder_at",
            "price": "price_mmk",
        },
        "values": {
            "sku": "COFFEE-250",
            "name": "Myanmar coffee 250g",
            "onHand": "24",
            "reorderAt": "8",
            "price": "7000",
        },
        "key": "COFFEE-250",
    },
    "production": {
        "mapping": {
            "jobCode": "job_code",
            "productName": "product_name",
            "targetQuantity": "target_quantity",
            "dueDate": "due_date",
            "line": "production_line",
        },
        "values": {
            "jobCode": "JOB-001",
            "productName": "20 inch tyre",
            "targetQuantity": "500",
            "dueDate": "2026-08-15",
            "line": "Line A",
        },
        "key": "JOB-001",
    },
    "website": {
        "mapping": {
            "slug": "page_slug",
            "title": "page_title",
            "headline": "headline",
            "body": "body",
            "contactUrl": "contact_url",
        },
        "values": {
            "slug": "home",
            "title": "Home",
            "headline": "Clear help for your customers",
            "body": "Explain the main service and strongest proof.",
            "contactUrl": "https://example.com/contact",
        },
        "key": "home",
    },
    "ecommerce": {
        "mapping": {
            "sku": "sku",
            "featured": "featured",
            "collection": "collection",
            "displayName": "display_name",
            "note": "merchandising_note",
        },
        "values": {
            "sku": "COFFEE-250",
            "featured": "true",
            "collection": "Best sellers",
            "displayName": "Myanmar coffee 250g",
            "note": "Lead with the locally sourced proof.",
        },
        "key": "COFFEE-250",
    },
}


def _preview_digest(package: dict[str, object]) -> str:
    source = package["source"]
    assert isinstance(source, dict)
    mapping = package["mapping"]
    assert isinstance(mapping, dict)
    canonical = json.dumps(
        {
            "schema": CLIENT_IMPORT_PREVIEW_SCHEMA,
            "product": package["product"],
            "object": package["object"],
            "workflowTemplateId": package["workflowTemplateId"],
            "sourceDigest": source["digest"],
            "mapping": mapping,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"sha256:{sha256(canonical).hexdigest()}"


def _resign(package: dict[str, object]) -> dict[str, object]:
    source = package["source"]
    assert isinstance(source, dict)
    source["previewDigest"] = _preview_digest(package)
    return package


def _package(product: str = "commerce", workflow_template_id: str | None = None) -> dict[str, object]:
    fixture = PRODUCT_FIXTURES[product]
    spec = CLIENT_IMPORT_OBJECTS[product]
    package: dict[str, object] = {
        "contract": CLIENT_IMPORT_STAGING_SCHEMA,
        "product": product,
        "object": spec.identifier,
        "workflowTemplateId": workflow_template_id or CLIENT_IMPORT_PROFILE_IDS[product][0],
        "workspace": "Example Myanmar Company",
        "owner": "Accountable owner",
        "source": {
            "name": f"{product}-import.csv",
            "digest": f"sha256:{sha256((product + '-source').encode()).hexdigest()}",
            "previewDigest": "",
        },
        "mapping": deepcopy(fixture["mapping"]),
        "rows": [
            {
                "sourceRow": 2,
                "key": fixture["key"],
                "values": deepcopy(fixture["values"]),
            }
        ],
        "controls": {
            "rowCount": 1,
            "humanReviewRequired": True,
            "externalWritesPerformed": False,
            "activationStatus": "staged_not_applied",
        },
    }
    return _resign(package)


class ClientImportValidatorTests(unittest.TestCase):
    def assert_invalid(self, package: object) -> None:
        with self.assertRaises(ClientImportValidationError):
            validate_client_import_staging_package(package)

    def test_all_manifest_workflow_profiles_validate_without_activation(self) -> None:
        manifest = json.loads(
            (Path(__file__).resolve().parents[1] / "site-manifest.json").read_text(encoding="utf-8")
        )
        manifest_products = {product["id"]: product for product in manifest["customerProducts"]}
        manifest_profiles = {
            "commerce": tuple(item["id"] for item in manifest_products["shop"]["templates"]),
            "production": tuple(item["id"] for item in manifest_products["plant"]["templates"]),
            "website": tuple(item["id"] for item in manifest_products["website"]["templates"]),
            "ecommerce": tuple(item["id"] for item in manifest_products["ecommerce"]["templates"]),
        }
        self.assertEqual(manifest_profiles, CLIENT_IMPORT_PROFILE_IDS)

        for product, profile_ids in CLIENT_IMPORT_PROFILE_IDS.items():
            for profile_id in profile_ids:
                with self.subTest(product=product, profile=profile_id):
                    result = validate_client_import_staging_package(_package(product, profile_id))
                    self.assertEqual(result.product, product)
                    self.assertEqual(result.workflow_template_id, profile_id)
                    response = result.to_dict()
                    self.assertEqual(response["status"], "valid")
                    self.assertEqual(response["activation"]["status"], "not_applied")
                    self.assertTrue(response["activation"]["human_approval_required"])
                    self.assertFalse(response["activation"]["atomic_adapter_ready"])
                    self.assertFalse(response["activation"]["external_writes_performed"])

    def test_optional_website_values_and_mapping_can_be_blank(self) -> None:
        package = _package("website")
        package["mapping"]["contactUrl"] = ""
        package["rows"][0]["values"]["contactUrl"] = ""
        result = validate_client_import_staging_package(_resign(package))
        self.assertEqual(result.object_id, "website_pages")

    def test_context_labels_and_unicode_digest_match_the_browser_contract(self) -> None:
        package = _package()
        package["workspace"] = "+ Partners"
        package["owner"] = "@Accountable owner"
        package["mapping"] = {
            "sku": "sku📦",
            "name": "name🧾",
            "onHand": "stock📊",
            "reorderAt": "reorder🔁",
            "price": "price💰",
        }
        _resign(package)
        self.assertEqual(
            package["source"]["previewDigest"],
            "sha256:feda23212bdadf0a780005ae08454ec4935612bbbdbfd517287861f4f54971bb",
        )
        result = validate_client_import_staging_package(package)
        self.assertEqual(result.workflow_template_id, "social-commerce")
        self.assertEqual(
            result.package_digest,
            "sha256:603e8c30da4b4e35129c3b55a393341b7671f5d09e851836b4058917a3f7f16b",
        )

    def test_package_digest_binds_rows_owner_and_workspace_context(self) -> None:
        baseline = _package()
        baseline_result = validate_client_import_staging_package(baseline)

        def reverse_object_keys(value: object) -> object:
            if isinstance(value, list):
                return [reverse_object_keys(item) for item in value]
            if isinstance(value, dict):
                return {
                    key: reverse_object_keys(nested)
                    for key, nested in reversed(tuple(value.items()))
                }
            return value

        reordered_result = validate_client_import_staging_package(reverse_object_keys(baseline))
        self.assertEqual(reordered_result.package_digest, baseline_result.package_digest)
        variants = []

        changed_row = deepcopy(baseline)
        changed_row["rows"][0]["values"]["name"] = "Myanmar coffee 500g"
        variants.append(changed_row)

        changed_owner = deepcopy(baseline)
        changed_owner["owner"] = "Different accountable owner"
        variants.append(changed_owner)

        changed_workspace = deepcopy(baseline)
        changed_workspace["workspace"] = "Different Myanmar Company"
        variants.append(changed_workspace)

        for candidate in variants:
            with self.subTest(candidate=candidate["owner"]):
                result = validate_client_import_staging_package(candidate)
                self.assertEqual(result.preview_digest, baseline_result.preview_digest)
                self.assertNotEqual(result.package_digest, baseline_result.package_digest)

    def test_identity_mapping_rows_controls_and_digest_fail_closed(self) -> None:
        cases: list[tuple[str, dict[str, object]]] = []

        wrong_object = _package()
        wrong_object["object"] = "website_pages"
        cases.append(("wrong object", wrong_object))

        wrong_profile = _package()
        wrong_profile["workflowTemplateId"] = "business-presence"
        cases.append(("cross-product workflow", _resign(wrong_profile)))

        duplicate_mapping = _package()
        duplicate_mapping["mapping"]["name"] = "sku"
        cases.append(("duplicate mapping", _resign(duplicate_mapping)))

        equivalent_mapping = _package()
        equivalent_mapping["mapping"]["name"] = "SKU!"
        cases.append(("equivalent mapping", _resign(equivalent_mapping)))

        missing_mapping = _package()
        missing_mapping["mapping"]["sku"] = ""
        cases.append(("missing mapping", _resign(missing_mapping)))

        extra_value = _package()
        extra_value["rows"][0]["values"]["workspace_id"] = "workspace-b"
        cases.append(("extra row field", extra_value))

        unmapped_value = _package("website")
        unmapped_value["mapping"]["contactUrl"] = ""
        cases.append(("value without mapping", _resign(unmapped_value)))

        wrong_key = _package()
        wrong_key["rows"][0]["key"] = "TEA-20"
        cases.append(("key mismatch", wrong_key))

        duplicate_key = _package()
        duplicate_key["rows"].append(deepcopy(duplicate_key["rows"][0]))
        duplicate_key["rows"][1]["sourceRow"] = 3
        duplicate_key["controls"]["rowCount"] = 2
        cases.append(("duplicate key", duplicate_key))

        duplicate_source_row = _package()
        second_row = deepcopy(duplicate_source_row["rows"][0])
        second_row["key"] = "TEA-20"
        second_row["values"]["sku"] = "TEA-20"
        duplicate_source_row["rows"].append(second_row)
        duplicate_source_row["controls"]["rowCount"] = 2
        cases.append(("duplicate source row", duplicate_source_row))

        false_review = _package()
        false_review["controls"]["humanReviewRequired"] = False
        cases.append(("review removed", false_review))

        claimed_write = _package()
        claimed_write["controls"]["externalWritesPerformed"] = True
        cases.append(("claimed write", claimed_write))

        claimed_activation = _package()
        claimed_activation["controls"]["activationStatus"] = "applied"
        cases.append(("claimed activation", claimed_activation))

        tampered_digest = _package()
        tampered_digest["source"]["previewDigest"] = "sha256:" + "0" * 64
        cases.append(("digest tamper", tampered_digest))

        extra_contract_field = _package()
        extra_contract_field["workspace_id"] = "workspace-b"
        cases.append(("client tenant identity", extra_contract_field))

        for name, candidate in cases:
            with self.subTest(case=name):
                self.assert_invalid(candidate)

    def test_field_values_are_revalidated_server_side(self) -> None:
        cases: list[tuple[str, dict[str, object]]] = []

        formula = _package()
        formula["rows"][0]["values"]["name"] = "=HYPERLINK(1)"
        cases.append(("formula", formula))

        non_normalized = _package()
        non_normalized["rows"][0]["values"]["name"] = "Cafe\u0301"
        cases.append(("unicode normalization", non_normalized))

        decimal = _package()
        decimal["rows"][0]["values"]["price"] = "7.5"
        cases.append(("decimal integer", decimal))

        impossible_date = _package("production")
        impossible_date["rows"][0]["values"]["dueDate"] = "2026-02-30"
        cases.append(("impossible date", impossible_date))

        unsafe_url = _package("website")
        unsafe_url["rows"][0]["values"]["contactUrl"] = "javascript:alert(1)"
        cases.append(("unsafe url", unsafe_url))

        credential_url = _package("website")
        credential_url["rows"][0]["values"]["contactUrl"] = "https://user:pass@example.com/"
        cases.append(("credential url", credential_url))

        invalid_port = _package("website")
        invalid_port["rows"][0]["values"]["contactUrl"] = "https://example.com:99999/"
        cases.append(("invalid port", invalid_port))

        invalid_boolean = _package("ecommerce")
        invalid_boolean["rows"][0]["values"]["featured"] = "TRUE"
        cases.append(("noncanonical boolean", invalid_boolean))

        for name, candidate in cases:
            with self.subTest(case=name):
                self.assert_invalid(candidate)

    def test_package_and_row_resource_limits_are_enforced(self) -> None:
        oversized = _package()
        oversized["workspace"] = "x" * CLIENT_IMPORT_MAX_PACKAGE_BYTES
        self.assert_invalid(oversized)

        too_many = _package()
        template = deepcopy(too_many["rows"][0])
        rows = []
        for index in range(CLIENT_IMPORT_MAX_ROWS + 1):
            row = deepcopy(template)
            row["sourceRow"] = index + 2
            row["key"] = f"SKU-{index:03d}"
            row["values"]["sku"] = row["key"]
            rows.append(row)
        too_many["rows"] = rows
        too_many["controls"]["rowCount"] = len(rows)
        self.assert_invalid(too_many)


class CounterReducer:
    def __init__(self) -> None:
        self.calls = 0

    def __call__(self, surface: str, event_type: str, current: object, payload: object) -> dict[str, object]:
        self.calls += 1
        return dict(reduce_trial_state(surface, event_type, current, payload))


class ClientImportRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.reducer = CounterReducer()
        self.store = InMemoryTrialStore(reducer=self.reducer)
        self.setup_reader = TrialPrincipal("workspace-a", "setup-reader", "human")
        self.setup_writer = TrialPrincipal("workspace-b", "setup-writer", "human")
        self.setup_only = TrialPrincipal("workspace-c", "setup-only", "human")
        self.setup_agent = TrialPrincipal("workspace-d", "setup-agent", "agent")
        self.other_reader = TrialPrincipal("workspace-a", "commerce-reader", "human")
        self.missing_member = TrialPrincipal("workspace-a", "missing-member", "human")
        self.sessions = {
            "reader": self.setup_reader,
            "writer": self.setup_writer,
            "setup-only": self.setup_only,
            "agent": self.setup_agent,
            "other": self.other_reader,
            "missing": self.missing_member,
        }
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="setup-reader",
            actor_kind="human",
            capabilities=("setup.read",),
        )
        self.store.provision_membership(
            workspace_id="workspace-b",
            actor_id="setup-writer",
            actor_kind="human",
            capabilities=("setup.write", "commerce.write"),
        )
        self.store.provision_membership(
            workspace_id="workspace-c",
            actor_id="setup-only",
            actor_kind="human",
            capabilities=("setup.write",),
        )
        self.store.provision_membership(
            workspace_id="workspace-d",
            actor_id="setup-agent",
            actor_kind="agent",
            capabilities=("setup.write", "commerce.write"),
        )
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="commerce-reader",
            actor_kind="human",
            capabilities=("commerce.read",),
        )
        self.client = self._client(self.store)

    def tearDown(self) -> None:
        self.client.close()

    def _client(self, store: InMemoryTrialStore) -> TestClient:
        def resolve_principal(request: Request) -> TrialPrincipal | None:
            return self.sessions.get(request.headers.get("x-test-session", ""))

        app = FastAPI()
        app.include_router(create_trial_router(store=store, resolve_principal=resolve_principal))
        return TestClient(app)

    @staticmethod
    def _headers(session: str = "reader") -> dict[str, str]:
        return {"x-test-session": session}

    def test_authenticated_validation_is_tenant_bound_and_has_no_writes(self) -> None:
        before = (deepcopy(self.store._states), deepcopy(self.store._events))
        response = self.client.post(
            "/api/trial/v1/imports/validate",
            headers=self._headers(),
            json=_package("commerce", "retail-wholesale"),
        )
        self.assertEqual(response.status_code, 200)
        validation = response.json()["validation"]
        self.assertEqual(validation["workspace_id"], "workspace-a")
        self.assertEqual(validation["workflow_template_id"], "retail-wholesale")
        self.assertRegex(validation["package_digest"], r"^sha256:[0-9a-f]{64}$")
        self.assertEqual(validation["activation"]["status"], "not_applied")
        self.assertEqual((self.store._states, self.store._events), before)
        self.assertEqual(self.reducer.calls, 0)

        writer_response = self.client.post(
            "/api/trial/v1/imports/validate",
            headers=self._headers("writer"),
            json=_package("website"),
        )
        self.assertEqual(writer_response.status_code, 200)
        self.assertEqual(writer_response.json()["validation"]["workspace_id"], "workspace-b")
        self.assertEqual(self.reducer.calls, 0)

    def test_auth_membership_and_capability_are_checked_before_body(self) -> None:
        oversized = b'{"padding":"' + b"x" * CLIENT_IMPORT_MAX_PACKAGE_BYTES + b'"}'

        unauthenticated = self.client.post(
            "/api/trial/v1/imports/validate",
            headers={"content-type": "application/json"},
            content=oversized,
        )
        self.assertEqual(unauthenticated.status_code, 401)
        self.assertEqual(unauthenticated.json()["detail"]["code"], "trial_auth_required")

        missing_membership = self.client.post(
            "/api/trial/v1/imports/validate",
            headers={**self._headers("missing"), "content-type": "application/json"},
            content=oversized,
        )
        self.assertEqual(missing_membership.status_code, 403)
        self.assertEqual(
            missing_membership.json()["detail"]["code"],
            "trial_membership_required",
        )

        forbidden = self.client.post(
            "/api/trial/v1/imports/validate",
            headers={**self._headers("other"), "content-type": "application/json"},
            content=oversized,
        )
        self.assertEqual(forbidden.status_code, 403)
        self.assertEqual(forbidden.json()["detail"]["required_capability"], "setup.read")

        too_large = self.client.post(
            "/api/trial/v1/imports/validate",
            headers={**self._headers(), "content-type": "application/json"},
            content=oversized,
        )
        self.assertEqual(too_large.status_code, 413)
        self.assertEqual(too_large.json()["detail"]["code"], "client_import_too_large")

        underdeclared = self.client.post(
            "/api/trial/v1/imports/validate",
            headers={
                **self._headers(),
                "content-type": "application/json",
                "content-length": "1",
            },
            content=oversized,
        )
        self.assertEqual(underdeclared.status_code, 413)
        self.assertEqual(underdeclared.json()["detail"]["code"], "client_import_too_large")

    def test_json_transport_and_contract_errors_are_sanitized(self) -> None:
        wrong_media = self.client.post(
            "/api/trial/v1/imports/validate",
            headers={**self._headers(), "content-type": "text/plain"},
            content=b"{}",
        )
        self.assertEqual(wrong_media.status_code, 415)
        self.assertEqual(wrong_media.json()["detail"]["code"], "client_import_json_required")

        invalid_json = self.client.post(
            "/api/trial/v1/imports/validate",
            headers={**self._headers(), "content-type": "application/json"},
            content=b'{"contract":',
        )
        self.assertEqual(invalid_json.status_code, 422)
        self.assertEqual(invalid_json.json()["detail"]["code"], "client_import_invalid_json")

        raw_package = json.dumps(_package(), separators=(",", ":"))
        duplicate_product = raw_package.replace(
            '"product":"commerce"',
            '"product":"website","product":"commerce"',
            1,
        )
        duplicate_key = self.client.post(
            "/api/trial/v1/imports/validate",
            headers={**self._headers(), "content-type": "application/json"},
            content=duplicate_product.encode("utf-8"),
        )
        self.assertEqual(duplicate_key.status_code, 422)
        self.assertEqual(duplicate_key.json()["detail"]["code"], "client_import_invalid_json")

        tampered = _package()
        tampered["rows"][0]["values"]["price"] = "-1"
        rejected = self.client.post(
            "/api/trial/v1/imports/validate",
            headers=self._headers(),
            json=tampered,
        )
        self.assertEqual(rejected.status_code, 422)
        detail = rejected.json()["detail"]
        self.assertEqual(detail["code"], "client_import_validation_error")
        self.assertNotIn("-1", detail["message"])

    def test_validation_remains_available_when_product_writes_are_disabled(self) -> None:
        locked_store = InMemoryTrialStore(reducer=self.reducer, write_enabled=False, audit_ready=False)
        locked_store.provision_membership(
            workspace_id="workspace-a",
            actor_id="setup-reader",
            actor_kind="human",
            capabilities=("setup.read",),
        )
        with self._client(locked_store) as locked_client:
            response = locked_client.post(
                "/api/trial/v1/imports/validate",
                headers=self._headers(),
                json=_package("ecommerce"),
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["validation"]["activation"]["status"], "not_applied")
        self.assertEqual(self.reducer.calls, 0)

    def test_reviewed_shop_import_applies_once_as_one_revisioned_catalog(self) -> None:
        package = _package("commerce", "retail-wholesale")
        second_row = deepcopy(package["rows"][0])
        second_row["sourceRow"] = 3
        second_row["key"] = "TEA-100"
        second_row["values"] = {
            "sku": "TEA-100",
            "name": "Myanmar green tea",
            "onHand": "12",
            "reorderAt": "4",
            "price": "4500",
        }
        package["rows"].append(second_row)
        package["controls"]["rowCount"] = 2
        package = _resign(package)
        validation = validate_client_import_staging_package(package)
        body = {
            "command_id": "00000000-0000-4000-8000-000000000101",
            "expected_version": 0,
            "confirmation": f"APPLY {validation.package_digest}",
            "package": package,
        }

        applied = self.client.post(
            "/api/trial/v1/imports/apply",
            headers=self._headers("writer"),
            json=body,
        )
        self.assertEqual(applied.status_code, 200)
        response = applied.json()
        self.assertEqual(
            response["activation"],
            {
                "contract": "supermega.client_import_activation.v1",
                "status": "applied",
                "product": "commerce",
                "object": "shop_catalog",
                "workflow_template_id": "retail-wholesale",
                "package_digest": validation.package_digest,
                "row_count": 2,
                "workspace_id": "workspace-b",
                "external_writes_performed": True,
            },
        )
        self.assertEqual(response["result"]["version"], 1)
        self.assertFalse(response["result"]["idempotent_replay"])
        self.assertEqual(
            response["result"]["state"],
            {
                "schema": "supermega.commerce.workspace.v2",
                "items": [
                    {
                        "sku": "COFFEE-250",
                        "name": "Myanmar coffee 250g",
                        "onHand": 24,
                        "reorderAt": 8,
                        "price": 7000,
                    },
                    {
                        "sku": "TEA-100",
                        "name": "Myanmar green tea",
                        "onHand": 12,
                        "reorderAt": 4,
                        "price": 4500,
                    },
                ],
                "orders": [],
                "movements": [],
                "closes": [],
            },
        )
        self.assertEqual(self.reducer.calls, 1)
        self.assertEqual(len(self.store._events), 1)

        replay = self.client.post(
            "/api/trial/v1/imports/apply",
            headers=self._headers("writer"),
            json=body,
        )
        self.assertEqual(replay.status_code, 200)
        self.assertTrue(replay.json()["result"]["idempotent_replay"])
        self.assertEqual(self.reducer.calls, 1)
        self.assertEqual(len(self.store._events), 1)

    def test_import_activation_fails_closed_before_every_product_write(self) -> None:
        package = _package("commerce")
        validation = validate_client_import_staging_package(package)
        body = {
            "command_id": "00000000-0000-4000-8000-000000000102",
            "expected_version": 0,
            "confirmation": f"APPLY {validation.package_digest}",
            "package": package,
        }
        baseline = (deepcopy(self.store._states), deepcopy(self.store._events))

        wrong_confirmation = self.client.post(
            "/api/trial/v1/imports/apply",
            headers=self._headers("writer"),
            json={**body, "confirmation": "APPLY sha256:" + "0" * 64},
        )
        self.assertEqual(wrong_confirmation.status_code, 409)
        self.assertEqual(
            wrong_confirmation.json()["detail"]["code"],
            "client_import_confirmation_mismatch",
        )

        missing_product_capability = self.client.post(
            "/api/trial/v1/imports/apply",
            headers=self._headers("setup-only"),
            json=body,
        )
        self.assertEqual(missing_product_capability.status_code, 403)
        self.assertEqual(
            missing_product_capability.json()["detail"]["required_capability"],
            "commerce.write",
        )

        nonhuman = self.client.post(
            "/api/trial/v1/imports/apply",
            headers=self._headers("agent"),
            json=body,
        )
        self.assertEqual(nonhuman.status_code, 403)
        self.assertEqual(nonhuman.json()["detail"]["code"], "trial_human_approval_required")

        website_package = _package("website")
        website_validation = validate_client_import_staging_package(website_package)
        unsupported = self.client.post(
            "/api/trial/v1/imports/apply",
            headers=self._headers("writer"),
            json={
                **body,
                "confirmation": f"APPLY {website_validation.package_digest}",
                "package": website_package,
            },
        )
        self.assertEqual(unsupported.status_code, 409)
        self.assertEqual(
            unsupported.json()["detail"]["code"],
            "client_import_activation_not_ready",
        )
        self.assertEqual((self.store._states, self.store._events), baseline)
        self.assertEqual(self.reducer.calls, 0)


if __name__ == "__main__":
    unittest.main()
