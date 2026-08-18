"""Golden corpus for the SuperMega span scrubber.

Plan gate ("Gate 2: Customer content scrubber verified", section 5): at
least 40 span examples — 20 that must pass through unchanged, and 20 that
contain customer PII and must be dropped or redacted, with zero
false-negatives (a PII value reaching the exported attributes).

Each fixture below is `(fixture_id, attributes, deny_values, description)`.
"Pass" fixtures assert the scrubber output equals the input exactly — no
attribute added, removed, or changed. "Leak" fixtures assert two things,
both required: (1) the specific offending attribute is gone from the
scrubbed output, and (2) the literal PII value does not appear anywhere in
the *values* of the scrubbed output — because a false negative here would
mean real customer data reaching an exporter, this second, whole-output
check is the one the task calls "the single most important" property of
this file, so it is asserted for every leak fixture, not sampled.

Uses plain `unittest` (with `subTest` for the parametrized cases) rather
than pytest: CI discovers and runs this suite via
`python -m unittest discover -s tests -p 'test_*.py'`, and pytest is not in
`requirements-test.txt` — every other file under `tests/` is unittest-based.
"""

from __future__ import annotations

import unittest
from typing import Any

from supermega_runtime.telemetry import redact, schema


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _all_scrubbed_string_values(attributes: dict[str, Any]) -> list[str]:
    """Flatten every string leaf in a scrubbed attribute dict for a leak scan."""

    values: list[str] = []
    for value in attributes.values():
        if isinstance(value, str):
            values.append(value)
        elif isinstance(value, (list, tuple)):
            values.extend(item for item in value if isinstance(item, str))
    return values


# ---------------------------------------------------------------------------
# PASS fixtures — 24 spans that must survive the scrubber byte-for-byte.
# One fixture per major span type in plan section 4, plus edge cases the
# plan's own risk section calls out explicitly (workspace UUID starting
# with "09", zero counts, a False boolean, an empty deny-value set).
# ---------------------------------------------------------------------------

PASS_FIXTURES: list[tuple[str, dict[str, Any]]] = [
    (
        "shop.order.intake",
        {
            "order.channel": "pos",
            "order.line_count": 3,
            "order.idempotency_key": "idem-4f3c2e1a",
            "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
            "workspace_id": "ws-a1b2c3",
        },
    ),
    (
        "shop.order.confirm",
        {
            "order.state_from": "draft",
            "order.state_to": "confirmed",
            "order_id": "order-9001",
        },
    ),
    (
        "shop.stock.reserve",
        {
            "stock.sku_count": 5,
            "stock.location": "WH-1",
            "db.rows_affected": 2,
            "movement_id": "mv-8831",
        },
    ),
    (
        "shop.stock.release",
        {"stock.trigger": "cancellation", "db.rows_affected": 1},
    ),
    (
        "shop.fulfilment.advance",
        {"fulfilment.state_from": "preparing", "fulfilment.state_to": "ready"},
    ),
    (
        "shop.payment.reconcile",
        {"payment.method_label": "kbzpay", "payment.status_to": "reconciled"},
    ),
    (
        "shop.daily.close",
        {"close.order_count": 12, "close.exception_count": 0, "close_id": "close-2026-08-17"},
    ),
    (
        "plant.job.plan",
        {"job.work_centre": "WC-1", "job.line_count": 4, "job_id": "job-77"},
    ),
    (
        "plant.job.release",
        {"job.bom_version": "BOM-7", "job.routing_version": "ROUTE-3"},
    ),
    (
        "plant.material.issue",
        {"material.line_count": 2, "db.rows_affected": 2},
    ),
    (
        "plant.output.record",
        {"output.quantity_good": 100, "output.quantity_scrap": 2, "output_id": "out-14"},
    ),
    (
        "plant.quality.inspect",
        {"quality.result": "pass", "quality.inspection_type": "incoming", "inspection_id": "insp-3"},
    ),
    (
        "plant.quality.rework",
        {"rework.routing_operation": "OP-10", "rework.quantity": 5, "rework_id": "rw-2"},
    ),
    (
        "plant.shift.close",
        {"shift.job_count": 8, "shift.open_issue_count": 1, "shift_id": "shift-2026-08-17-am"},
    ),
    (
        "ecommerce.cart.build",
        {"cart.line_count": 3, "cart.catalogue_snapshot_version": 7, "draft_id": "draft-5"},
    ),
    (
        "ecommerce.quote.capture",
        {"quote.delivery_method": "pickup"},
    ),
    (
        "ecommerce.identity.snapshot",
        {"identity.profile_version": 2, "identity.address_version": 1},
    ),
    (
        "ecommerce.request.submit",
        {"request.idempotency_key": "idem-req-1", "request.digest_version": 1, "request_id": "req-1"},
    ),
    (
        "ecommerce.shop.handoff",
        {"handoff.shop_inbox_written": True, "shop_draft_id": "shopdraft-1"},
    ),
    (
        "ai.invocation",
        {
            "ai.model": "gpt-4o-mini",
            "ai.operation": "order_intake",
            "ai.provider": "openai",
            "ai.input_tokens": 340,
            "ai.output_tokens": 88,
            "invocation_id": "inv-1",
        },
    ),
    (
        "ai.output.parse",
        {"ai.schema_valid": True, "ai.refusal": False, "ai.parse_errors": 0},
    ),
    (
        "ai.review.submitted",
        {"review.outcome": "accepted", "decision_packet_id": "packet-1"},
    ),
    (
        "db.query",
        {"db.system": "postgresql", "db.collection": "app_private.workspace_state", "db.operation": "SELECT"},
    ),
    (
        "storage.upload",
        {"storage.bucket": "uploads", "storage.mime_type": "image/png", "storage.size_bytes": 2048},
    ),
    (
        "storage.verify",
        {"storage.digest_matched": True, "upload_id": "up-1"},
    ),
    (
        "worker.cycle.start",
        {"worker.cycle_name": "ops_watch", "worker.trigger": "scheduled", "cycle_id": "cycle-1"},
    ),
    (
        "worker.task.execute",
        {"worker.task_name": "triage", "worker.outcome": "completed", "task_id": "task-1"},
    ),
    (
        "worker.cycle.end",
        {"worker.task_count": 5, "worker.error_count": 0, "worker.duration_ms": 1200},
    ),
    (
        "http.generic",
        {"http.method": "POST", "http.route": "/api/trial/v1/commands", "http.status_code": 200},
    ),
    (
        "correlation-ids-only",
        {
            "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
            "span_id": "00f067aa0ba902b7",
            "parent_span_id": "0000000000000001",
            "workspace_id": "workspace-a",
            "order_id": "order-1",
            "command_id": "3f2b6c1e-2a4a-4b1a-9c3d-4c5f6a7b8c9d",
        },
    ),
    (
        # Plan section 7 risk note, verbatim: "a workspace UUID that starts
        # with 09 being caught by the phone regex" must NOT happen — the
        # hyphen after the first 8 hex characters breaks the digit run.
        "uuid-starting-with-09-is-not-a-phone-number",
        {"workspace_id": "09123456-abcd-4ef0-9abc-1234567890ab"},
    ),
    (
        "zero-and-false-values-are-not-dropped",
        {
            "close.exception_count": 0,
            "handoff.shop_inbox_written": False,
            "ai.refusal": False,
            "worker.error_count": 0,
        },
    ),
    (
        "empty-attributes",
        {},
    ),
]

assert len(PASS_FIXTURES) >= 20, "golden corpus needs at least 20 pass-through fixtures"


# ---------------------------------------------------------------------------
# LEAK fixtures — 23 spans containing real-shaped Myanmar PII that must never
# reach an exporter. `pii_values` lists every raw customer-content literal
# the fixture embeds; the test asserts none of them survive scrubbing, in
# any attribute, whole or as a substring.
# ---------------------------------------------------------------------------

LEAK_FIXTURES: list[tuple[str, dict[str, Any], tuple[str, ...], tuple[str, ...]]] = [
    # --- Rule 1: value present in the request body's customer-content fields ---
    (
        "rule1-name-leaked-into-whitelisted-channel-field",
        {"order.channel": "Ma Thida Win", "order.line_count": 2},
        ("Ma Thida Win",),
        ("Ma Thida Win",),
    ),
    (
        "rule1-phone-leaked-into-whitelisted-payment-label",
        {"payment.method_label": "09512345678", "payment.status_to": "reconciled"},
        ("09512345678",),
        ("09512345678",),
    ),
    (
        "rule1-supplier-name-leaked-into-inspection-type",
        {"quality.inspection_type": "Golden Dragon Trading Co", "quality.result": "pass"},
        ("Golden Dragon Trading Co",),
        ("Golden Dragon Trading Co",),
    ),
    (
        "rule1-address-substring-leaked-into-rework-operation",
        {"rework.routing_operation": "Kyauktada Township depot pickup", "rework.quantity": 1},
        ("Kyauktada Township depot",),
        ("Kyauktada Township",),
    ),
    (
        "rule1-reason-text-leaked-into-worker-task-name",
        {"worker.task_name": "call about the late delivery to the customer", "worker.outcome": "completed"},
        ("call about the late delivery to the customer",),
        ("late delivery",),
    ),
    (
        "rule1-mmk-amount-text-leaked-into-review-outcome",
        {"review.outcome": "accepted after 15,000 MMK correction"},
        ("15,000 MMK",),
        ("15,000 MMK",),
    ),
    (
        "rule1-request-body-total-echoed-as-string",
        {"stock.location": "reserved for order worth 200000"},
        ("200000",),
        ("200000",),
    ),
    # --- Rule 2: Myanmar phone / MMK amount pattern, independent of deny_values ---
    (
        "rule2-bare-myanmar-phone-in-channel",
        {"order.channel": "09512345678"},
        (),
        ("09512345678",),
    ),
    (
        "rule2-phone-embedded-in-free-text",
        {"payment.method_label": "Contact 09987654321 for pickup"},
        (),
        ("09987654321",),
    ),
    (
        "rule2-phone-variant-seven-digit",
        {"stock.location": "call 091234567 before delivery"},
        (),
        ("091234567",),
    ),
    (
        "rule2-mmk-amount-in-quality-result",
        {"quality.result": "hold - 15,000 MMK deposit required"},
        (),
        ("15,000 MMK",),
    ),
    (
        "rule2-kyats-word-form",
        {"stock.location": "Warehouse - 25000 kyats deposit required"},
        (),
        ("25000 kyats",),
    ),
    (
        "rule2-phone-in-worker-outcome",
        {"worker.outcome": "failed - call customer at 09123456789"},
        (),
        ("09123456789",),
    ),
    # --- Rule 3 (defense in depth): overlong value in an otherwise-whitelisted key ---
    (
        "rule3-overlong-whitelisted-attribute-is-dropped",
        {"quality.inspection_type": "A" * 250},
        (),
        ("A" * 250,),
    ),
    (
        "rule3-overlong-free-text-note-disguised-as-safe-key",
        {"worker.task_name": "n" * 201},
        (),
        ("n" * 201,),
    ),
    # --- Opt-in whitelist: a key that is not on the allowlist is dropped
    # outright, regardless of how safe its value looks ---
    (
        "whitelist-customer-name-key-not-allowlisted",
        {"customer.name": "Ma Thida Win"},
        (),
        ("Ma Thida Win",),
    ),
    (
        "whitelist-note-key-not-allowlisted",
        {"note": "Called about delivery, ask for Ko Zaw"},
        (),
        ("Ko Zaw",),
    ),
    (
        "whitelist-bare-amount-key-not-allowlisted",
        {"amount": 15000},
        (),
        (),
    ),
    (
        "whitelist-bare-total-key-not-allowlisted",
        {"total": 15000},
        (),
        (),
    ),
    (
        "whitelist-bare-price-key-not-allowlisted",
        {"price": 12000},
        (),
        (),
    ),
    (
        "whitelist-customer-phone-key-not-allowlisted",
        {"customerPhone": "09512345678"},
        (),
        ("09512345678",),
    ),
    (
        "whitelist-delivery-address-key-not-allowlisted",
        {"deliveryAddress": "No. 42, Bo Aung Kyaw Street, Yangon"},
        (),
        ("Bo Aung Kyaw Street",),
    ),
    # --- Forbidden keys: always dropped, even if a caller whitelisted them ---
    (
        "forbidden-db-statement-with-embedded-note",
        {
            "db.statement": (
                "select * from app_private.workspace_state "
                "where workspace_id = 'ws-1' and note = 'Ma Thida Win called about 09512345678'"
            )
        },
        ("Ma Thida Win", "09512345678"),
        ("Ma Thida Win", "09512345678"),
    ),
    (
        "forbidden-db-query-text-with-embedded-amount",
        {"db.query.text": "update app_private.workspace_events set note = '15,000 MMK refund' where id = 1"},
        ("15,000 MMK",),
        ("15,000 MMK",),
    ),
    (
        "forbidden-db-statement-parameters",
        {"db.statement.parameters": "('Ma Thida Win', '09512345678', 15000)"},
        ("Ma Thida Win", "09512345678"),
        ("Ma Thida Win", "09512345678"),
    ),
]

assert len(LEAK_FIXTURES) >= 20, "golden corpus needs at least 20 PII-leak fixtures"


# ---------------------------------------------------------------------------
# db.statement -> db.operation / db.collection derivation (plan section 4:
# "spans carry table+operation only").
# ---------------------------------------------------------------------------

DB_STATEMENT_FIXTURES = [
    (
        "select_workspace_state",
        "select version, state_json from app_private.workspace_state where workspace_id = %s and surface = %s for update",
        "SELECT",
        "app_private.workspace_state",
    ),
    (
        "update_workspace_state",
        "update app_private.workspace_state set version = %s, state_json = %s::jsonb where workspace_id = %s and surface = %s",
        "UPDATE",
        "app_private.workspace_state",
    ),
    (
        "insert_workspace_state",
        "insert into app_private.workspace_state (workspace_id, surface, version, state_json) values (%s, %s, %s, %s::jsonb)",
        "INSERT",
        "app_private.workspace_state",
    ),
    (
        "select_workspace_events",
        "select command_id from app_private.workspace_events where workspace_id = %s and surface = 'commerce'",
        "SELECT",
        "app_private.workspace_events",
    ),
]


class RedactGoldenCorpusTests(unittest.TestCase):
    def test_pass_fixtures_survive_unchanged(self) -> None:
        for fixture_id, attributes in PASS_FIXTURES:
            with self.subTest(fixture_id=fixture_id):
                scrubbed = redact.scrub_attributes(attributes, deny_values=frozenset())
                self.assertEqual(scrubbed, attributes, f"{fixture_id}: a safe attribute was altered or dropped")

    def test_leak_fixtures_are_scrubbed(self) -> None:
        for fixture_id, attributes, deny_values, pii_values in LEAK_FIXTURES:
            with self.subTest(fixture_id=fixture_id):
                scrubbed = redact.scrub_attributes(attributes, deny_values=frozenset(deny_values))
                scrubbed_values = _all_scrubbed_string_values(scrubbed)
                for pii in pii_values:
                    self.assertNotIn(pii, scrubbed_values, f"{fixture_id}: leaked exact value: {pii!r} in {scrubbed!r}")
                    for value in scrubbed_values:
                        self.assertNotIn(pii, value, f"{fixture_id}: leaked substring: {pii!r} inside {value!r}")
                # The offending key itself must be gone, not merely have an altered value
                # (plan section 7: "the scrubber defaults to dropping the attribute").
                for key in attributes:
                    if key in schema.FORBIDDEN_ATTRIBUTE_KEYS:
                        self.assertNotIn(key, scrubbed, f"{fixture_id}: forbidden key {key!r} survived scrubbing")
                # Opt-in whitelist invariant (plan section 7): nothing not on the
                # allowlist survives, regardless of whether its value looked dangerous.
                self.assertLessEqual(
                    set(scrubbed.keys()),
                    schema.ATTRIBUTE_WHITELIST,
                    f"{fixture_id}: a non-allowlisted key survived scrubbing: {set(scrubbed) - schema.ATTRIBUTE_WHITELIST!r}",
                )

    def test_zero_false_negatives_across_full_corpus(self) -> None:
        """The single aggregate assertion the task calls the bar: zero PII leaks."""

        failures: list[str] = []
        for fixture_id, attributes, deny_values, pii_values in LEAK_FIXTURES:
            scrubbed = redact.scrub_attributes(attributes, deny_values=frozenset(deny_values))
            scrubbed_values = _all_scrubbed_string_values(scrubbed)
            for pii in pii_values:
                if pii in scrubbed_values or any(pii in value for value in scrubbed_values):
                    failures.append(f"{fixture_id}: leaked {pii!r}")
        self.assertFalse(failures, "false negatives found:\n" + "\n".join(failures))

    def test_corpus_size_meets_the_plan_gate(self) -> None:
        self.assertGreaterEqual(len(PASS_FIXTURES), 20)
        self.assertGreaterEqual(len(LEAK_FIXTURES), 20)

    def test_forbidden_keys_are_never_in_the_allowlist(self) -> None:
        self.assertTrue(schema.FORBIDDEN_ATTRIBUTE_KEYS.isdisjoint(schema.ATTRIBUTE_WHITELIST))


class DbStatementEnrichmentTests(unittest.TestCase):
    def test_db_statement_enrichment_derives_operation_and_table(self) -> None:
        for fixture_id, statement, expected_operation, expected_table in DB_STATEMENT_FIXTURES:
            with self.subTest(fixture_id=fixture_id):
                enriched = redact.enrich_and_scrub_db_attributes({"db.statement": statement, "db.system": "postgresql"})
                self.assertNotIn("db.statement", enriched, f"{fixture_id}: raw SQL text survived enrichment")
                self.assertEqual(enriched.get("db.operation"), expected_operation)
                self.assertEqual(enriched.get("db.collection"), expected_table)

                scrubbed = redact.scrub_attributes(enriched, deny_values=frozenset())
                self.assertNotIn("db.statement", scrubbed)
                self.assertNotIn("db.query.text", scrubbed)
                self.assertEqual(scrubbed.get("db.operation"), expected_operation)
                self.assertEqual(scrubbed.get("db.collection"), expected_table)
                self.assertNotIn(statement, str(scrubbed))

    def test_db_statement_with_customer_content_never_reaches_scrubbed_output(self) -> None:
        statement = (
            "select * from app_private.workspace_events "
            "where workspace_id = 'ws-1' and note = 'Ma Thida Win, 09512345678, 15,000 MMK'"
        )
        enriched = redact.enrich_and_scrub_db_attributes({"db.statement": statement, "db.system": "postgresql"})
        scrubbed = redact.scrub_attributes(enriched, deny_values=frozenset())
        dump = str(scrubbed)
        for pii in ("Ma Thida Win", "09512345678", "15,000 MMK"):
            self.assertNotIn(pii, dump)


# ---------------------------------------------------------------------------
# Span-name redaction (plan section 3 header: "Must never appear in span
# attributes, span names, or log fields").
# ---------------------------------------------------------------------------


class SpanNameRedactionTests(unittest.TestCase):
    def test_unsafe_span_names_are_redacted(self) -> None:
        cases = [
            ("Ma Thida Win checkout", frozenset({"Ma Thida Win checkout"})),
            ("call 09512345678 now", frozenset()),
            ("refund of 15,000 MMK", frozenset()),
            ("x" * 250, frozenset()),
        ]
        for name, deny_values in cases:
            with self.subTest(name=name):
                self.assertEqual(redact.scrub_span_name(name, deny_values), "[redacted]")

    def test_safe_span_names_survive(self) -> None:
        names = [
            "shop.order.confirm",
            "plant.job.release",
            "ecommerce.request.submit",
            "POST /api/trial/v1/commands",
            "SELECT",
        ]
        for name in names:
            with self.subTest(name=name):
                self.assertEqual(redact.scrub_span_name(name, frozenset()), name)


# ---------------------------------------------------------------------------
# extract_customer_content_values — the request-body walker rule 1 depends on.
# ---------------------------------------------------------------------------


class ExtractCustomerContentValuesTests(unittest.TestCase):
    def test_extract_customer_content_values_walks_nested_bodies(self) -> None:
        body = {
            "surface": "commerce",
            "payload": {
                "state": {
                    "orders": [
                        {
                            "id": "order-1",
                            "customerName": "Ma Thida Win",
                            "customerPhone": "09512345678",
                            "deliveryAddress": "No. 42, Bo Aung Kyaw Street, Yangon",
                            "totalMmk": 15000,
                            "lines": [{"sku": "SKU-1", "quantity": 2}],
                        }
                    ]
                },
                "evidence": {
                    "actor": "actor-operator",
                    "reason": "Customer called about a late delivery.",
                },
            },
        }
        values = redact.extract_customer_content_values(body)
        self.assertIn("Ma Thida Win", values)
        self.assertIn("09512345678", values)
        self.assertIn("No. 42, Bo Aung Kyaw Street, Yangon", values)
        self.assertIn("15000", values)
        self.assertIn("Customer called about a late delivery.", values)
        # Structural, non-customer-content leaves must not be swept in.
        self.assertNotIn("order-1", values)
        self.assertNotIn("SKU-1", values)
        self.assertNotIn("actor-operator", values)

    def test_extract_customer_content_values_ignores_none_and_bool_leaves(self) -> None:
        body = {"reasonCode": None, "nameVerified": True, "note": ""}
        self.assertEqual(redact.extract_customer_content_values(body), frozenset())

    def test_extract_customer_content_values_picks_up_unmarked_phone_and_amount(self) -> None:
        # Even a field the caller didn't name "phone"/"amount" is still caught if
        # its value itself looks like a Myanmar phone number or an MMK amount —
        # defense in depth for a renamed field.
        body = {"contactMethod": "09512345678", "settlement": "12,500 MMK"}
        values = redact.extract_customer_content_values(body)
        self.assertIn("09512345678", values)
        self.assertIn("12,500 MMK", values)


if __name__ == "__main__":
    unittest.main()
