import pytest

from agent_solutions.lead_csv import LeadCsvError, parse_lead_csv


def test_parses_customer_approved_csv_without_enabling_outreach() -> None:
    request = parse_lead_csv(
        (
            "lead_id,business_name,industry,permission_status,source_owner,do_not_contact\n"
            "plant-1,Example Factory,Manufacturing,customer_approved,Customer import,false\n"
        ).encode()
    )
    assert request.leads[0].business_name == "Example Factory"
    assert request.leads[0].permission_status == "customer_approved"
    assert request.leads[0].do_not_contact is False


def test_rejects_csv_without_permission_status_column() -> None:
    with pytest.raises(LeadCsvError, match="permission_status"):
        parse_lead_csv(b"lead_id,business_name\nlead-1,Example\n")


def test_rejects_unparseable_do_not_contact_value() -> None:
    with pytest.raises(LeadCsvError, match="do_not_contact"):
        parse_lead_csv(
            b"lead_id,business_name,permission_status,do_not_contact\nlead-1,Example,customer_provided,maybe\n"
        )
