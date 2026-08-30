from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import unittest

from supermega_runtime.client_provisioning import (
    CLIENT_PROVISIONING_PLAN_CONTRACT,
    CLIENT_PROVISIONING_RECIPE_CONTRACT,
    ClientProvisioningError,
    build_client_provisioning_plan,
    derive_client_provisioning_recipe,
    validate_client_provisioning_recipe,
)


def _recipe_registry() -> dict[str, object]:
    return json.loads(
        (Path(__file__).resolve().parents[1] / "client-provisioning-recipes.json").read_text(
            encoding="utf-8"
        )
    )


def _manifest_recipe() -> dict[str, object]:
    return deepcopy(_recipe_registry()["recipes"][0])


def _manifest_recipes() -> list[dict[str, object]]:
    return deepcopy(_recipe_registry()["recipes"])


def _reverse_object_keys(value: object) -> object:
    if isinstance(value, list):
        return [_reverse_object_keys(item) for item in value]
    if isinstance(value, dict):
        return {
            key: _reverse_object_keys(item)
            for key, item in reversed(tuple(value.items()))
        }
    return value


class ClientProvisioningRecipeTests(unittest.TestCase):
    def assert_invalid(self, recipe: object) -> None:
        with self.assertRaises(ClientProvisioningError):
            validate_client_provisioning_recipe(recipe)

    def test_manifest_recipe_is_bound_to_the_real_shop_template(self) -> None:
        recipe = _manifest_recipe()
        validated = validate_client_provisioning_recipe(recipe)

        self.assertEqual(validated["contract"], CLIENT_PROVISIONING_RECIPE_CONTRACT)
        self.assertEqual(validated["recipeId"], "shop.social-commerce")
        self.assertEqual(validated["productId"], "shop")
        self.assertEqual(validated["runtimeProductId"], "commerce")
        self.assertEqual(validated["templateId"], "social-commerce")
        self.assertEqual(
            [item["id"] for item in validated["roles"]],
            ["owner", "order-operator", "stock-keeper"],
        )
        self.assertEqual(len(validated["dashboard"]["panels"]), 3)

    def test_four_product_recipes_build_deterministic_tenant_bound_plans(self) -> None:
        recipes = _manifest_recipes()
        self.assertEqual(
            [(item["productId"], item["runtimeProductId"], item["templateId"]) for item in recipes],
            [
                ("shop", "commerce", "social-commerce"),
                ("plant", "production", "production-control"),
                ("website", "website", "lead-generation"),
                ("ecommerce", "ecommerce", "social-storefront"),
            ],
        )
        plans = [
            build_client_provisioning_plan(
                recipe,
                workspace="Beauty Spa Client Portal",
                owner="Named Client Owner",
            )
            for recipe in recipes
        ]
        self.assertEqual(len({plan["planId"] for plan in plans}), 4)
        self.assertEqual(len({plan["planDigest"] for plan in plans}), 4)
        self.assertTrue(all(plan["status"] == "planned_not_applied" for plan in plans))
        self.assertTrue(all(plan["mode"] == "fresh" for plan in plans))
        self.assertTrue(all(plan["workspace"] == "Beauty Spa Client Portal" for plan in plans))
        self.assertTrue(all(plan["owner"] == "Named Client Owner" for plan in plans))
        self.assertTrue(all(plan["authority"] == {
            "humanApprovalRequired": True,
            "tenantWritesPerformed": False,
            "providerCallsPerformed": False,
            "externalMessagesSent": False,
            "deploymentPerformed": False,
        } for plan in plans))
        self.assertEqual(
            [plan["product"]["runtimeId"] for plan in plans],
            ["commerce", "production", "website", "ecommerce"],
        )

    def test_recipe_events_cannot_cross_product_runtime_boundaries(self) -> None:
        for recipe in _manifest_recipes():
            with self.subTest(recipe=recipe["recipeId"]):
                crossed = deepcopy(recipe)
                event_surface = (
                    "commerce"
                    if recipe["runtimeProductId"] in {"commerce", "ecommerce"}
                    else recipe["runtimeProductId"]
                )
                crossed["stateMachines"][0]["transitions"][0]["event"] = (
                    "commerce.order.advanced"
                    if event_surface != "commerce"
                    else "website.release.advanced"
                )
                self.assert_invalid(crossed)

    def test_ecommerce_recipe_uses_the_real_shared_commerce_engine(self) -> None:
        recipe = next(item for item in _manifest_recipes() if item["productId"] == "ecommerce")
        validated = validate_client_provisioning_recipe(recipe)
        owner = next(role for role in validated["roles"] if role["id"] == "owner")
        self.assertIn("commerce.read", owner["capabilities"])
        self.assertIn("commerce.write", owner["capabilities"])
        self.assertNotIn("ecommerce.read", owner["capabilities"])
        self.assertNotIn("ecommerce.write", owner["capabilities"])
        self.assertTrue(all(item["surface"] == "commerce" for item in validated["objects"]))
        self.assertTrue(all(
            transition["event"].startswith("commerce.")
            for machine in validated["stateMachines"]
            for transition in machine["transitions"]
        ))

    def test_reviewed_product_recipes_cover_all_twelve_client_templates(self) -> None:
        manifest = json.loads(
            (Path(__file__).resolve().parents[1] / "site-manifest.json").read_text(
                encoding="utf-8"
            )
        )
        bases = {recipe["productId"]: recipe for recipe in _manifest_recipes()}
        derived = []
        for product in manifest["customerProducts"]:
            for template in product["templates"]:
                recipe = derive_client_provisioning_recipe(
                    bases[product["id"]],
                    template_id=template["id"],
                )
                self.assertEqual(recipe["recipeId"], f"{product['id']}.{template['id']}")
                self.assertEqual(recipe["runtimeProductId"], product["runtimeId"])
                self.assertEqual(recipe["importMappings"][0]["workflowTemplateId"], template["id"])
                derived.append(recipe)
        self.assertEqual(len(derived), 12)
        self.assertEqual(len({item["recipeId"] for item in derived}), 12)

        rejected = deepcopy(bases["website"])
        with self.assertRaises(ClientProvisioningError):
            derive_client_provisioning_recipe(rejected, template_id="unknown-template")

    def test_fresh_plan_is_deterministic_detached_and_performs_no_writes(self) -> None:
        recipe = _manifest_recipe()
        original = deepcopy(recipe)

        first = build_client_provisioning_plan(
            recipe, workspace="Shwe Store", owner="Daw Mya"
        )
        second = build_client_provisioning_plan(
            recipe, workspace="Shwe Store", owner="Daw Mya"
        )

        self.assertEqual(first, second)
        self.assertEqual(recipe, original)
        self.assertEqual(first["contract"], CLIENT_PROVISIONING_PLAN_CONTRACT)
        self.assertEqual(first["status"], "planned_not_applied")
        self.assertEqual(first["mode"], "fresh")
        self.assertRegex(first["planId"], r"^provision-[0-9a-f]{24}$")
        self.assertRegex(first["recipe"]["digest"], r"^sha256:[0-9a-f]{64}$")
        self.assertRegex(first["planDigest"], r"^sha256:[0-9a-f]{64}$")
        self.assertEqual(first["product"]["runtimeId"], "commerce")
        self.assertEqual(len(first["resources"]["roles"]), 3)
        self.assertEqual(len(first["resources"]["objects"]), 3)
        self.assertEqual(len(first["resources"]["dashboard"]["panels"]), 3)
        self.assertEqual(
            first["upgradePlan"]["steps"],
            [{"id": "create-configured-resources", "operation": "plan-create-resources"}],
        )
        self.assertEqual(first["rollbackPlan"]["strategy"], "discard-unapplied-plan")
        self.assertEqual(
            first["authority"],
            {
                "humanApprovalRequired": True,
                "tenantWritesPerformed": False,
                "providerCallsPerformed": False,
                "externalMessagesSent": False,
                "deploymentPerformed": False,
            },
        )

        first["resources"]["roles"][0]["label"] = "Changed"
        self.assertEqual(recipe, original)

    def test_json_key_order_does_not_change_plan_or_recipe_digests(self) -> None:
        recipe = _manifest_recipe()
        reversed_recipe = _reverse_object_keys(recipe)

        baseline = build_client_provisioning_plan(
            recipe, workspace="Mingalar Shop", owner="Ko Aung"
        )
        reordered = build_client_provisioning_plan(
            reversed_recipe, workspace="Mingalar Shop", owner="Ko Aung"
        )

        self.assertEqual(baseline["recipe"]["digest"], reordered["recipe"]["digest"])
        self.assertEqual(baseline["planId"], reordered["planId"])
        self.assertEqual(baseline["planDigest"], reordered["planDigest"])

    def test_upgrade_and_current_plans_have_exact_rollback_semantics(self) -> None:
        recipe = _manifest_recipe()
        upgrade = build_client_provisioning_plan(
            recipe,
            workspace="Mingalar Shop",
            owner="Ko Aung",
            current_recipe_version=0,
        )
        current = build_client_provisioning_plan(
            recipe,
            workspace="Mingalar Shop",
            owner="Ko Aung",
            current_recipe_version=1,
        )

        self.assertEqual(upgrade["mode"], "upgrade")
        self.assertEqual(upgrade["upgradePlan"]["fromVersion"], 0)
        self.assertEqual(upgrade["upgradePlan"]["toVersion"], 1)
        self.assertEqual(
            upgrade["upgradePlan"]["steps"],
            [{
                "id": "introduce-social-commerce-recipe",
                "operation": "plan-create-resources",
            }],
        )
        self.assertEqual(
            upgrade["rollbackPlan"]["strategy"],
            "restore-pre-provision-snapshot",
        )
        self.assertEqual(
            {item["operation"] for item in upgrade["rollbackPlan"]["steps"]},
            {"assert-plan-digest", "plan-restore-snapshot"},
        )
        self.assertEqual(
            upgrade["rollbackPlan"]["boundPlanId"], upgrade["planId"]
        )
        self.assertTrue(upgrade["rollbackPlan"]["requiresHumanApproval"])

        self.assertEqual(current["mode"], "current")
        self.assertEqual(current["upgradePlan"]["steps"], [])
        self.assertEqual(current["rollbackPlan"]["strategy"], "no-change")
        self.assertEqual(current["rollbackPlan"]["steps"], [])
        self.assertFalse(current["rollbackPlan"]["requiresHumanApproval"])

    def test_versions_are_integer_bounded_and_compatible(self) -> None:
        recipe = _manifest_recipe()
        for value in (True, -1, 2, 1001, "0"):
            with self.subTest(value=value):
                with self.assertRaises(ClientProvisioningError):
                    build_client_provisioning_plan(
                        recipe,
                        workspace="Mingalar Shop",
                        owner="Ko Aung",
                        current_recipe_version=value,
                    )

        unordered = deepcopy(recipe)
        unordered["compatibleFromVersions"] = [1, 0]
        self.assert_invalid(unordered)

        bool_version = deepcopy(recipe)
        bool_version["recipeVersion"] = True
        self.assert_invalid(bool_version)

    def test_contract_and_identity_drift_fail_closed(self) -> None:
        mutations = (
            ("unknown contract", lambda value: value.__setitem__("contract", "other.v1")),
            ("extra field", lambda value: value.__setitem__("extra", True)),
            ("recipe identity", lambda value: value.__setitem__("recipeId", "shop.retail")),
            ("product", lambda value: value.__setitem__("productId", "plant")),
            ("runtime", lambda value: value.__setitem__("runtimeProductId", "production")),
            ("template", lambda value: value.__setitem__("templateId", "retail-wholesale")),
        )
        for label, mutate in mutations:
            with self.subTest(label=label):
                recipe = _manifest_recipe()
                mutate(recipe)
                self.assert_invalid(recipe)

    def test_roles_remain_human_unique_and_least_privilege_known(self) -> None:
        mutations = (
            ("non-human", lambda value: value["roles"][1].__setitem__("actorKind", "agent")),
            ("duplicate role", lambda value: value["roles"][1].__setitem__("id", "owner")),
            (
                "duplicate capability",
                lambda value: value["roles"][1]["capabilities"].append("commerce.read"),
            ),
            (
                "unknown capability",
                lambda value: value["roles"][1]["capabilities"].append("admin.all"),
            ),
            (
                "owner authority missing",
                lambda value: value["roles"][0]["capabilities"].remove("approvals.decide"),
            ),
            (
                "owner baseline authority missing",
                lambda value: value["roles"][0]["capabilities"].remove("company.baseline.approve"),
            ),
            (
                "owner control authority missing",
                lambda value: value["roles"][0]["capabilities"].remove("company.control.approve"),
            ),
        )
        for label, mutate in mutations:
            with self.subTest(label=label):
                recipe = _manifest_recipe()
                mutate(recipe)
                self.assert_invalid(recipe)

    def test_state_machine_requires_reachable_human_approved_known_events(self) -> None:
        mutations = (
            (
                "unreachable terminal",
                lambda value: value["stateMachines"][0].__setitem__(
                    "terminalStates", ["completed", "cancelled", "abandoned"]
                ),
            ),
            (
                "terminal source",
                lambda value: value["stateMachines"][0]["transitions"][0].__setitem__(
                    "fromState", "completed"
                ),
            ),
            (
                "self transition",
                lambda value: value["stateMachines"][0]["transitions"][0].__setitem__(
                    "toState", "confirmed"
                ),
            ),
            (
                "unknown event",
                lambda value: value["stateMachines"][0]["transitions"][0].__setitem__(
                    "event", "commerce.order.deleted"
                ),
            ),
            (
                "automated approval",
                lambda value: value["stateMachines"][0]["transitions"][0].__setitem__(
                    "approval", "automatic"
                ),
            ),
        )
        for label, mutate in mutations:
            with self.subTest(label=label):
                recipe = _manifest_recipe()
                mutate(recipe)
                self.assert_invalid(recipe)

    def test_import_mapping_requires_known_object_profile_and_unambiguous_aliases(self) -> None:
        mutations = (
            (
                "unknown object",
                lambda value: value["importMappings"][0].__setitem__("objectId", "missing"),
            ),
            (
                "wrong profile",
                lambda value: value["importMappings"][0].__setitem__(
                    "workflowTemplateId", "retail-wholesale"
                ),
            ),
            (
                "no preview",
                lambda value: value["importMappings"][0].__setitem__(
                    "previewRequired", False
                ),
            ),
            (
                "no confirmation",
                lambda value: value["importMappings"][0].__setitem__(
                    "humanConfirmationRequired", False
                ),
            ),
            (
                "duplicate target",
                lambda value: value["importMappings"][0]["fields"][1].__setitem__(
                    "target", "sku"
                ),
            ),
            (
                "trusted target drift",
                lambda value: value["importMappings"][0]["fields"][1].__setitem__(
                    "target", "displayName"
                ),
            ),
            (
                "duplicate alias",
                lambda value: value["importMappings"][0]["fields"][1][
                    "sourceAliases"
                ].append("sku"),
            ),
            (
                "noncanonical alias",
                lambda value: value["importMappings"][0]["fields"][0][
                    "sourceAliases"
                ].append("SKU Name"),
            ),
        )
        for label, mutate in mutations:
            with self.subTest(label=label):
                recipe = _manifest_recipe()
                mutate(recipe)
                self.assert_invalid(recipe)

        object_drift = _manifest_recipe()
        object_drift["objects"][0]["requiredCapability"] = "commerce.read"
        self.assert_invalid(object_drift)

    def test_dashboard_is_bounded_and_acceptance_is_complete(self) -> None:
        too_many_panels = _manifest_recipe()
        too_many_panels["dashboard"]["panels"].append(
            {"id": "fourth-panel", "sourceId": "shop-orders", "label": "More"}
        )
        too_many_panels["dashboard"]["maxVisiblePanels"] = 4
        self.assert_invalid(too_many_panels)

        bad_source = _manifest_recipe()
        bad_source["dashboard"]["panels"][0]["sourceId"] = "missing"
        self.assert_invalid(bad_source)

        missing_kind = _manifest_recipe()
        missing_kind["acceptanceChecks"].pop()
        self.assert_invalid(missing_kind)

        optional_check = _manifest_recipe()
        optional_check["acceptanceChecks"][0]["required"] = False
        self.assert_invalid(optional_check)

    def test_migrations_and_rollback_allow_only_complete_planning_operations(self) -> None:
        mutations = (
            ("migration missing", lambda value: value.__setitem__("migrations", [])),
            (
                "wrong destination",
                lambda value: value["migrations"][0].__setitem__("toVersion", 2),
            ),
            (
                "unsafe migration",
                lambda value: value["migrations"][0]["steps"][0].__setitem__(
                    "operation", "apply-now"
                ),
            ),
            (
                "weak rollback",
                lambda value: value["rollback"].__setitem__(
                    "strategy", "best-effort"
                ),
            ),
            (
                "no digest",
                lambda value: value["rollback"].__setitem__(
                    "requiresExactPlanDigest", False
                ),
            ),
            (
                "unsafe rollback",
                lambda value: value["rollback"]["steps"][0].__setitem__(
                    "operation", "delete-live-data"
                ),
            ),
        )
        for label, mutate in mutations:
            with self.subTest(label=label):
                recipe = _manifest_recipe()
                mutate(recipe)
                self.assert_invalid(recipe)

    def test_context_is_trimmed_normalized_bounded_and_digest_bound(self) -> None:
        recipe = _manifest_recipe()
        baseline = build_client_provisioning_plan(
            recipe, workspace="ရွှေဆိုင်", owner="ဒေါ်မြ"
        )
        changed_workspace = build_client_provisioning_plan(
            recipe, workspace="ရွှေဆိုင် ၂", owner="ဒေါ်မြ"
        )
        changed_owner = build_client_provisioning_plan(
            recipe, workspace="ရွှေဆိုင်", owner="ဦးအောင်"
        )

        self.assertNotEqual(baseline["planId"], changed_workspace["planId"])
        self.assertNotEqual(baseline["planDigest"], changed_owner["planDigest"])

        invalid_contexts = (
            ("", "Owner"),
            (" Workspace ", "Owner"),
            ("Workspace\n", "Owner"),
            ("W" * 81, "Owner"),
            ("Workspace", "Owner\x00"),
            ("Workspace", "O" * 81),
        )
        for workspace, owner in invalid_contexts:
            with self.subTest(workspace=workspace, owner=owner):
                with self.assertRaises(ClientProvisioningError):
                    build_client_provisioning_plan(
                        recipe, workspace=workspace, owner=owner
                    )


if __name__ == "__main__":
    unittest.main()
