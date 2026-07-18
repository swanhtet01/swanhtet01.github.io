from agent_solutions.contracts import TrialBlueprintRequest
from agent_solutions.templates import build_trial_blueprint, list_templates


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
