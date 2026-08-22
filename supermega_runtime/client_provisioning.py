"""Pure, fail-closed planning for versioned SuperMega client recipes."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from copy import deepcopy
from hashlib import sha256
import json
import re
import unicodedata
from typing import Any

from supermega_runtime.client_import_runtime import (
    CLIENT_IMPORT_OBJECTS,
    CLIENT_IMPORT_PROFILE_IDS,
)


CLIENT_PROVISIONING_RECIPE_CONTRACT = "supermega.client_provisioning_recipe.v1"
CLIENT_PROVISIONING_PLAN_CONTRACT = "supermega.client_provisioning_plan.v1"

_IDENTIFIER = re.compile(r"^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$")
_FIELD_IDENTIFIER = re.compile(r"^[A-Za-z][A-Za-z0-9]{0,63}$")
_SOURCE_ALIAS = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
_KNOWN_CAPABILITIES = frozenset(
    {
        "setup.read",
        "setup.write",
        "commerce.read",
        "commerce.write",
        "production.read",
        "production.write",
        "website.read",
        "website.write",
        "company.read",
        "company.write",
        "company.baseline.approve",
        "company.control.approve",
        "approvals.read",
        "approvals.request",
        "approvals.decide",
    }
)
_KNOWN_EVENTS = frozenset(
    {
        "commerce.order.advanced",
        "commerce.order.cancelled",
        "production.job.advanced",
        "production.job.cancelled",
        "website.release.advanced",
        "website.release.withdrawn",
        "ecommerce.request.advanced",
        "ecommerce.request.cancelled",
    }
)
_PRODUCT_RUNTIME_PAIRS = {
    "shop": "commerce",
    "plant": "production",
    "website": "website",
    "ecommerce": "ecommerce",
}
_SURFACE_CAPABILITIES = {
    runtime: frozenset({f"{runtime}.read", f"{runtime}.write"})
    for runtime in ("commerce", "production", "website", "ecommerce")
}
_OBJECT_SOURCES = frozenset({"client-import", "runtime", "immutable-events"})
_ACCEPTANCE_KINDS = frozenset(
    {"contract", "migration", "rollback", "security", "usability"}
)
_MIGRATION_OPERATIONS = frozenset({"plan-create-resources"})
_ROLLBACK_OPERATIONS = frozenset(
    {"assert-plan-digest", "plan-restore-snapshot"}
)


class ClientProvisioningError(ValueError):
    """Raised when a recipe or requested plan cannot be proved safe."""


def _fail(message: str) -> ClientProvisioningError:
    return ClientProvisioningError(message)


def _exact_object(
    value: object, field: str, expected: Sequence[str]
) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise _fail(f"{field} must be an object.")
    expected_keys = frozenset(expected)
    actual_keys = frozenset(str(key) for key in value)
    if actual_keys != expected_keys or any(not isinstance(key, str) for key in value):
        raise _fail(f"{field} fields do not match the recipe contract.")
    return value


def _array(value: object, field: str, *, minimum: int = 1, maximum: int) -> list[Any]:
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        raise _fail(f"{field} must contain between {minimum} and {maximum} items.")
    return value


def _text(value: object, field: str, *, maximum: int) -> str:
    if not isinstance(value, str) or not value or value != value.strip():
        raise _fail(f"{field} must be nonblank trimmed text.")
    if unicodedata.normalize("NFC", value) != value:
        raise _fail(f"{field} must use normalized Unicode text.")
    if any(ord(character) <= 31 or ord(character) == 127 for character in value):
        raise _fail(f"{field} contains a control character.")
    if len(value.encode("utf-16-le")) // 2 > maximum:
        raise _fail(f"{field} exceeds its supported length.")
    return value


def _identifier(value: object, field: str) -> str:
    candidate = _text(value, field, maximum=80)
    if not _IDENTIFIER.fullmatch(candidate):
        raise _fail(f"{field} must be a canonical identifier.")
    return candidate


def _field_identifier(value: object, field: str) -> str:
    candidate = _text(value, field, maximum=64)
    if not _FIELD_IDENTIFIER.fullmatch(candidate):
        raise _fail(f"{field} must be a canonical field identifier.")
    return candidate


def _version(value: object, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 1000:
        raise _fail(f"{field} must be a supported integer version.")
    return value


def _boolean(value: object, field: str) -> bool:
    if not isinstance(value, bool):
        raise _fail(f"{field} must be boolean.")
    return value


def _unique(values: Sequence[str], field: str) -> None:
    if len(values) != len(set(values)):
        raise _fail(f"{field} contains duplicates.")


def _step(
    value: object,
    field: str,
    *,
    allowed_operations: frozenset[str],
) -> dict[str, object]:
    item = _exact_object(value, field, ("id", "operation"))
    step_id = _identifier(item["id"], f"{field}.id")
    operation = _identifier(item["operation"], f"{field}.operation")
    if operation not in allowed_operations:
        raise _fail(f"{field}.operation is not allowed.")
    return {"id": step_id, "operation": operation}


def _canonical_digest(value: object) -> str:
    try:
        encoded = json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise _fail("Provisioning evidence is not canonical JSON.") from exc
    return f"sha256:{sha256(encoded).hexdigest()}"


def validate_client_provisioning_recipe(recipe: object) -> dict[str, Any]:
    """Validate one complete recipe and return a detached canonical copy."""

    source = _exact_object(
        recipe,
        "recipe",
        (
            "contract",
            "recipeId",
            "recipeVersion",
            "productId",
            "runtimeProductId",
            "templateId",
            "compatibleFromVersions",
            "roles",
            "objects",
            "stateMachines",
            "importMappings",
            "dashboard",
            "acceptanceChecks",
            "migrations",
            "rollback",
        ),
    )
    if source["contract"] != CLIENT_PROVISIONING_RECIPE_CONTRACT:
        raise _fail("recipe.contract is unsupported.")

    recipe_id = _identifier(source["recipeId"], "recipe.recipeId")
    recipe_version = _version(source["recipeVersion"], "recipe.recipeVersion")
    product_id = _identifier(source["productId"], "recipe.productId")
    runtime_product_id = _identifier(
        source["runtimeProductId"], "recipe.runtimeProductId"
    )
    template_id = _identifier(source["templateId"], "recipe.templateId")
    if recipe_id != f"{product_id}.{template_id}":
        raise _fail("recipe identity must bind its product and template.")
    if _PRODUCT_RUNTIME_PAIRS.get(product_id) != runtime_product_id:
        raise _fail("recipe product and runtime identity are incompatible.")
    if template_id not in CLIENT_IMPORT_PROFILE_IDS[runtime_product_id]:
        raise _fail("The recipe template is not supported by the trusted importer.")
    import_spec = CLIENT_IMPORT_OBJECTS[runtime_product_id]

    compatible_versions = [
        _version(value, f"recipe.compatibleFromVersions[{index}]")
        for index, value in enumerate(
            _array(
                source["compatibleFromVersions"],
                "recipe.compatibleFromVersions",
                maximum=16,
            )
        )
    ]
    _unique([str(value) for value in compatible_versions], "compatible versions")
    if compatible_versions != sorted(compatible_versions):
        raise _fail("Compatible versions must be ordered.")
    if recipe_version not in compatible_versions:
        raise _fail("The current recipe version must be compatible with itself.")

    role_ids: list[str] = []
    owner_capabilities: frozenset[str] | None = None
    for index, value in enumerate(
        _array(source["roles"], "recipe.roles", maximum=8)
    ):
        field = f"recipe.roles[{index}]"
        role = _exact_object(value, field, ("id", "label", "actorKind", "capabilities"))
        role_id = _identifier(role["id"], f"{field}.id")
        _text(role["label"], f"{field}.label", maximum=80)
        if role["actorKind"] != "human":
            raise _fail(f"{field}.actorKind must remain human in recipe v1.")
        capabilities = [
            _text(capability, f"{field}.capabilities[{capability_index}]", maximum=40)
            for capability_index, capability in enumerate(
                _array(role["capabilities"], f"{field}.capabilities", maximum=16)
            )
        ]
        _unique(capabilities, f"{field}.capabilities")
        if any(capability not in _KNOWN_CAPABILITIES for capability in capabilities):
            raise _fail(f"{field} requests an unknown capability.")
        role_ids.append(role_id)
        if role_id == "owner":
            owner_capabilities = frozenset(capabilities)
    _unique(role_ids, "recipe.roles")
    required_owner_capabilities = {
        "setup.write",
        import_spec.required_capability,
        "company.write",
        "company.baseline.approve",
        "company.control.approve",
        "approvals.decide",
    }
    if owner_capabilities is None or not required_owner_capabilities.issubset(owner_capabilities):
        raise _fail("The owner role lacks required accountable capabilities.")

    object_ids: list[str] = []
    objects_by_id: dict[str, Mapping[str, Any]] = {}
    for index, value in enumerate(
        _array(source["objects"], "recipe.objects", maximum=16)
    ):
        field = f"recipe.objects[{index}]"
        item = _exact_object(
            value,
            field,
            ("id", "surface", "keyField", "source", "requiredCapability"),
        )
        object_id = _identifier(item["id"], f"{field}.id")
        surface = _identifier(item["surface"], f"{field}.surface")
        if surface not in _SURFACE_CAPABILITIES:
            raise _fail(f"{field}.surface is unsupported.")
        _field_identifier(item["keyField"], f"{field}.keyField")
        if item["source"] not in _OBJECT_SOURCES:
            raise _fail(f"{field}.source is unsupported.")
        if item["requiredCapability"] not in _SURFACE_CAPABILITIES[surface]:
            raise _fail(f"{field}.requiredCapability is unsupported.")
        object_ids.append(object_id)
        objects_by_id[object_id] = item
    _unique(object_ids, "recipe.objects")
    object_id_set = frozenset(object_ids)

    state_machine_ids: list[str] = []
    for index, value in enumerate(
        _array(source["stateMachines"], "recipe.stateMachines", maximum=8)
    ):
        field = f"recipe.stateMachines[{index}]"
        machine = _exact_object(
            value, field, ("id", "initialState", "terminalStates", "transitions")
        )
        machine_id = _identifier(machine["id"], f"{field}.id")
        initial_state = _identifier(machine["initialState"], f"{field}.initialState")
        terminal_states = [
            _identifier(item, f"{field}.terminalStates[{terminal_index}]")
            for terminal_index, item in enumerate(
                _array(machine["terminalStates"], f"{field}.terminalStates", maximum=8)
            )
        ]
        _unique(terminal_states, f"{field}.terminalStates")
        if initial_state in terminal_states:
            raise _fail(f"{field}.initialState cannot be terminal.")
        transition_ids: list[str] = []
        edges: dict[str, set[str]] = {}
        for transition_index, transition_value in enumerate(
            _array(machine["transitions"], f"{field}.transitions", maximum=32)
        ):
            transition_field = f"{field}.transitions[{transition_index}]"
            transition = _exact_object(
                transition_value,
                transition_field,
                ("id", "fromState", "toState", "event", "approval"),
            )
            transition_id = _identifier(
                transition["id"], f"{transition_field}.id"
            )
            from_state = _identifier(
                transition["fromState"], f"{transition_field}.fromState"
            )
            to_state = _identifier(
                transition["toState"], f"{transition_field}.toState"
            )
            if from_state in terminal_states or from_state == to_state:
                raise _fail(f"{transition_field} is not a valid state transition.")
            if transition["event"] not in _KNOWN_EVENTS:
                raise _fail(f"{transition_field}.event is unsupported.")
            event_surface = "commerce" if runtime_product_id == "ecommerce" else runtime_product_id
            if not str(transition["event"]).startswith(f"{event_surface}."):
                raise _fail(f"{transition_field}.event crossed the product runtime boundary.")
            if transition["approval"] != "named-human":
                raise _fail(f"{transition_field}.approval must remain named-human.")
            transition_ids.append(transition_id)
            edges.setdefault(from_state, set()).add(to_state)
        _unique(transition_ids, f"{field}.transitions")
        reachable = {initial_state}
        frontier = [initial_state]
        while frontier:
            current = frontier.pop()
            for target in edges.get(current, set()):
                if target not in reachable:
                    reachable.add(target)
                    frontier.append(target)
        if not set(terminal_states).issubset(reachable):
            raise _fail(f"{field} has an unreachable terminal state.")
        state_machine_ids.append(machine_id)
    _unique(state_machine_ids, "recipe.stateMachines")

    import_ids: list[str] = []
    for index, value in enumerate(
        _array(source["importMappings"], "recipe.importMappings", maximum=8)
    ):
        field = f"recipe.importMappings[{index}]"
        item = _exact_object(
            value,
            field,
            (
                "id",
                "objectId",
                "workflowTemplateId",
                "fields",
                "previewRequired",
                "humanConfirmationRequired",
            ),
        )
        import_id = _identifier(item["id"], f"{field}.id")
        if item["objectId"] not in object_id_set:
            raise _fail(f"{field}.objectId does not name a recipe object.")
        if item["workflowTemplateId"] != template_id:
            raise _fail(f"{field}.workflowTemplateId drifted from the recipe.")
        target_object = objects_by_id[str(item["objectId"])]
        if (
            target_object["source"] != "client-import"
            or target_object["keyField"] != import_spec.key_field
            or target_object["surface"] != import_spec.target_surface
            or target_object["requiredCapability"] != import_spec.required_capability
        ):
            raise _fail(f"{field}.objectId is not bound to the trusted import target.")
        if not _boolean(item["previewRequired"], f"{field}.previewRequired"):
            raise _fail(f"{field} must require preview.")
        if not _boolean(
            item["humanConfirmationRequired"],
            f"{field}.humanConfirmationRequired",
        ):
            raise _fail(f"{field} must require human confirmation.")
        targets: list[str] = []
        aliases: list[str] = []
        for mapping_index, mapping_value in enumerate(
            _array(item["fields"], f"{field}.fields", maximum=64)
        ):
            mapping_field = f"{field}.fields[{mapping_index}]"
            mapping = _exact_object(
                mapping_value, mapping_field, ("target", "sourceAliases")
            )
            target = _field_identifier(mapping["target"], f"{mapping_field}.target")
            source_aliases = [
                _text(alias, f"{mapping_field}.sourceAliases[{alias_index}]", maximum=64)
                for alias_index, alias in enumerate(
                    _array(
                        mapping["sourceAliases"],
                        f"{mapping_field}.sourceAliases",
                        maximum=16,
                    )
                )
            ]
            if any(not _SOURCE_ALIAS.fullmatch(alias) for alias in source_aliases):
                raise _fail(f"{mapping_field} has a noncanonical source alias.")
            _unique(source_aliases, f"{mapping_field}.sourceAliases")
            targets.append(target)
            aliases.extend(source_aliases)
        _unique(targets, f"{field}.fields")
        _unique(aliases, f"{field} source aliases")
        if targets != [field_spec.identifier for field_spec in import_spec.fields]:
            raise _fail(f"{field}.fields drifted from the trusted import contract.")
        import_ids.append(import_id)
    _unique(import_ids, "recipe.importMappings")

    dashboard = _exact_object(
        source["dashboard"],
        "recipe.dashboard",
        ("id", "primaryAction", "maxVisiblePanels", "panels"),
    )
    _identifier(dashboard["id"], "recipe.dashboard.id")
    _text(dashboard["primaryAction"], "recipe.dashboard.primaryAction", maximum=160)
    maximum_panels = _version(
        dashboard["maxVisiblePanels"], "recipe.dashboard.maxVisiblePanels"
    )
    panels = _array(dashboard["panels"], "recipe.dashboard.panels", maximum=6)
    if maximum_panels != len(panels) or maximum_panels > 3:
        raise _fail("The task-first dashboard must expose one to three bounded panels.")
    panel_ids: list[str] = []
    valid_sources = object_id_set | frozenset(state_machine_ids)
    for index, value in enumerate(panels):
        field = f"recipe.dashboard.panels[{index}]"
        panel = _exact_object(value, field, ("id", "sourceId", "label"))
        panel_ids.append(_identifier(panel["id"], f"{field}.id"))
        if panel["sourceId"] not in valid_sources:
            raise _fail(f"{field}.sourceId does not name a recipe resource.")
        _text(panel["label"], f"{field}.label", maximum=120)
    _unique(panel_ids, "recipe.dashboard.panels")

    acceptance_ids: list[str] = []
    acceptance_kinds: set[str] = set()
    for index, value in enumerate(
        _array(source["acceptanceChecks"], "recipe.acceptanceChecks", maximum=16)
    ):
        field = f"recipe.acceptanceChecks[{index}]"
        check = _exact_object(value, field, ("id", "kind", "required"))
        acceptance_ids.append(_identifier(check["id"], f"{field}.id"))
        if check["kind"] not in _ACCEPTANCE_KINDS:
            raise _fail(f"{field}.kind is unsupported.")
        acceptance_kinds.add(str(check["kind"]))
        if not _boolean(check["required"], f"{field}.required"):
            raise _fail(f"{field} must remain required.")
    _unique(acceptance_ids, "recipe.acceptanceChecks")
    if acceptance_kinds != set(_ACCEPTANCE_KINDS):
        raise _fail("Recipe acceptance must cover contract, migration, rollback, security, and usability.")

    migration_from_versions: list[int] = []
    for index, value in enumerate(
        _array(source["migrations"], "recipe.migrations", minimum=0, maximum=16)
    ):
        field = f"recipe.migrations[{index}]"
        migration = _exact_object(value, field, ("fromVersion", "toVersion", "steps"))
        from_version = _version(migration["fromVersion"], f"{field}.fromVersion")
        to_version = _version(migration["toVersion"], f"{field}.toVersion")
        if from_version == recipe_version or to_version != recipe_version:
            raise _fail(f"{field} must end at the current recipe version.")
        steps = [
            _step(
                step,
                f"{field}.steps[{step_index}]",
                allowed_operations=_MIGRATION_OPERATIONS,
            )
            for step_index, step in enumerate(
                _array(migration["steps"], f"{field}.steps", maximum=16)
            )
        ]
        _unique([str(step["id"]) for step in steps], f"{field}.steps")
        migration_from_versions.append(from_version)
    _unique([str(value) for value in migration_from_versions], "recipe.migrations")
    expected_migrations = set(compatible_versions) - {recipe_version}
    if set(migration_from_versions) != expected_migrations:
        raise _fail("Recipe migrations do not cover every compatible prior version exactly once.")

    rollback = _exact_object(
        source["rollback"],
        "recipe.rollback",
        (
            "strategy",
            "requiresExactPlanDigest",
            "requiresHumanApproval",
            "steps",
        ),
    )
    if rollback["strategy"] != "restore-pre-provision-snapshot":
        raise _fail("recipe.rollback.strategy is unsupported.")
    if not _boolean(
        rollback["requiresExactPlanDigest"],
        "recipe.rollback.requiresExactPlanDigest",
    ) or not _boolean(
        rollback["requiresHumanApproval"],
        "recipe.rollback.requiresHumanApproval",
    ):
        raise _fail("Rollback must bind the exact plan and a human decision.")
    rollback_steps = [
        _step(
            step,
            f"recipe.rollback.steps[{index}]",
            allowed_operations=_ROLLBACK_OPERATIONS,
        )
        for index, step in enumerate(
            _array(rollback["steps"], "recipe.rollback.steps", maximum=8)
        )
    ]
    _unique([str(step["id"]) for step in rollback_steps], "recipe.rollback.steps")
    if {str(step["operation"]) for step in rollback_steps} != set(
        _ROLLBACK_OPERATIONS
    ):
        raise _fail("Rollback must verify plan identity and restore the reviewed snapshot.")

    try:
        return json.loads(
            json.dumps(source, ensure_ascii=False, sort_keys=True, allow_nan=False)
        )
    except (TypeError, ValueError) as exc:
        raise _fail("Recipe is not detached canonical JSON.") from exc


def derive_client_provisioning_recipe(
    base_recipe: object,
    *,
    template_id: object,
) -> dict[str, Any]:
    """Bind a product's reviewed resource recipe to another trusted import template."""

    validated = validate_client_provisioning_recipe(base_recipe)
    target_template = _identifier(template_id, "template_id")
    runtime_product = str(validated["runtimeProductId"])
    if target_template not in CLIENT_IMPORT_PROFILE_IDS[runtime_product]:
        raise _fail("The requested template is not supported by the trusted importer.")
    if target_template == validated["templateId"]:
        return validated

    derived = deepcopy(validated)
    derived["recipeId"] = f"{derived['productId']}.{target_template}"
    derived["templateId"] = target_template
    for mapping in derived["importMappings"]:
        mapping["workflowTemplateId"] = target_template
    for migration in derived["migrations"]:
        for step in migration["steps"]:
            if step["operation"] == "plan-create-resources":
                step["id"] = f"introduce-{target_template}-recipe"
    return validate_client_provisioning_recipe(derived)


def build_client_provisioning_plan(
    recipe: object,
    *,
    workspace: object,
    owner: object,
    current_recipe_version: object | None = None,
) -> dict[str, Any]:
    """Create deterministic no-write fresh, upgrade, and rollback evidence."""

    validated = validate_client_provisioning_recipe(recipe)
    workspace_name = _text(workspace, "workspace", maximum=80)
    owner_name = _text(owner, "owner", maximum=80)
    recipe_version = int(validated["recipeVersion"])
    compatible_versions = tuple(int(value) for value in validated["compatibleFromVersions"])

    if current_recipe_version is None:
        mode = "fresh"
        from_version: int | None = None
        change_steps = [
            {"id": "create-configured-resources", "operation": "plan-create-resources"}
        ]
    else:
        from_version = _version(current_recipe_version, "current_recipe_version")
        if from_version not in compatible_versions:
            raise _fail("The current client recipe version is incompatible.")
        if from_version == recipe_version:
            mode = "current"
            change_steps = []
        else:
            mode = "upgrade"
            migration = next(
                (
                    item
                    for item in validated["migrations"]
                    if int(item["fromVersion"]) == from_version
                ),
                None,
            )
            if migration is None:
                raise _fail("No deterministic migration reaches the requested recipe version.")
            change_steps = deepcopy(migration["steps"])

    recipe_digest = _canonical_digest(validated)
    identity = {
        "recipeDigest": recipe_digest,
        "workspace": workspace_name,
        "owner": owner_name,
        "fromVersion": from_version,
        "toVersion": recipe_version,
    }
    identity_digest = _canonical_digest(identity).removeprefix("sha256:")
    plan_id = f"provision-{identity_digest[:24]}"

    if mode == "upgrade":
        rollback_strategy = validated["rollback"]["strategy"]
        rollback_steps = deepcopy(validated["rollback"]["steps"])
    elif mode == "fresh":
        rollback_strategy = "discard-unapplied-plan"
        rollback_steps = [
            {"id": "discard-unapplied-plan", "operation": "discard-unapplied-plan"}
        ]
    else:
        rollback_strategy = "no-change"
        rollback_steps = []

    plan: dict[str, Any] = {
        "contract": CLIENT_PROVISIONING_PLAN_CONTRACT,
        "status": "planned_not_applied",
        "planId": plan_id,
        "workspace": workspace_name,
        "owner": owner_name,
        "product": {
            "id": validated["productId"],
            "runtimeId": validated["runtimeProductId"],
            "templateId": validated["templateId"],
        },
        "recipe": {
            "id": validated["recipeId"],
            "version": recipe_version,
            "digest": recipe_digest,
        },
        "mode": mode,
        "resources": {
            "roles": deepcopy(validated["roles"]),
            "objects": deepcopy(validated["objects"]),
            "stateMachines": deepcopy(validated["stateMachines"]),
            "importMappings": deepcopy(validated["importMappings"]),
            "dashboard": deepcopy(validated["dashboard"]),
        },
        "upgradePlan": {
            "fromVersion": from_version,
            "toVersion": recipe_version,
            "steps": change_steps,
        },
        "rollbackPlan": {
            "status": "planned_not_applied",
            "strategy": rollback_strategy,
            "boundPlanId": plan_id,
            "requiresExactPlanDigest": True,
            "requiresHumanApproval": mode != "current",
            "steps": rollback_steps,
        },
        "acceptanceChecks": deepcopy(validated["acceptanceChecks"]),
        "authority": {
            "humanApprovalRequired": True,
            "tenantWritesPerformed": False,
            "providerCallsPerformed": False,
            "externalMessagesSent": False,
            "deploymentPerformed": False,
        },
    }
    plan["planDigest"] = _canonical_digest(plan)
    return plan
