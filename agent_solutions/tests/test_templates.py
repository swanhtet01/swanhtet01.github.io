from agent_solutions.contracts import TrialBlueprintBatchRequest, TrialBlueprintRequest
from agent_solutions.templates import build_trial_blueprint, build_trial_blueprints, list_templates


def test_catalog_contains_sellable_shop_plant_and_agent_templates() -> None:
    template_ids = {template.template_id for template in list_templates()}
    assert len(template_ids) >= 12
    assert "shop.daily-close" in template_ids
    assert "shop.receiving-evidence" in template_ids
    assert "plant.iso-capa" in template_ids
    assert "agent.inbox-brief" in template_ids
    assert "agent.approved-web-brief" in template_ids


def test_trial_blueprint_is_not_a_persisted_account() -> None:
    blueprint = build_trial_blueprint(
        TrialBlueprintRequest(template_id="plant.shift-handoff")
    )
    assert blueprint.status == "ready"
    assert blueprint.trial_state == "not_created"
    assert any("outside this service" in step.lower() for step in blueprint.first_run)


def test_batch_blueprints_do_not_create_customer_accounts() -> None:
    response = build_trial_blueprints(
        TrialBlueprintBatchRequest(
            trials=[
                {"template_id": "shop.daily-close"},
                {"template_id": "plant.shift-handoff"},
            ]
        )
    )
    assert response.blueprint_count == 2
    assert response.trial_state == "not_created"
