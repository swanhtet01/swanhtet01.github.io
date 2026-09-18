"""Offline readiness failures must stay coarse publicly and private in logs."""

import unittest
from unittest.mock import MagicMock, patch

from supermega_runtime.trial_store import (
    PostgresTrialStore, TrialNotReadyError, TrialPrincipal, _log_readiness_failure,
)


LOGGER = "supermega_runtime.trial_store"
SECRET = "PRIVATE_READINESS_TEST_DATA_MUST_NOT_APPEAR_IN_LOGS"


class ReadinessDiagnosticsTests(unittest.TestCase):
    def make_store(self):
        store = PostgresTrialStore(SECRET, reducer=lambda *args: {}, write_enabled=False)
        connection = MagicMock()
        connection.__enter__.return_value = connection
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.fetchone.return_value = {"ready": 1}
        store._connect = MagicMock(return_value=connection)
        store._assert_runtime_role = MagicMock()
        store._assert_schema = MagicMock()
        store._assert_audit = MagicMock()
        return store, connection

    def assert_reset(self, result):
        for flag in ("database_ready", "role_ready", "schema_ready", "audit_ready", "membership_ready"):
            self.assertFalse(getattr(result, flag), flag)

    def test_unexpected_failures_identify_stage_without_exception_data(self):
        for stage, method in (("connect", "_connect"), ("role", "_assert_runtime_role"),
                              ("schema", "_assert_schema"), ("audit", "_assert_audit")):
            with self.subTest(stage=stage):
                store, _ = self.make_store()
                getattr(store, method).side_effect = RuntimeError(SECRET)
                with self.assertLogs(LOGGER, level="WARNING") as captured:
                    result = store.readiness(None)
                self.assert_reset(result)
                self.assertEqual(len(captured.records), 1)
                record = captured.records[0]
                self.assertEqual(record.getMessage(), f"trial_readiness_failure stage={stage} category=unexpected_error")
                self.assertIsNone(record.exc_info)
                self.assertIsNone(record.stack_info)
                self.assertNotIn(SECRET, str(record.__dict__))

    def test_missing_configuration_and_driver_have_distinct_categories(self):
        store, _ = self.make_store()
        store.database_url = ""
        with self.assertLogs(LOGGER) as captured:
            self.assert_reset(store.readiness(None))
        self.assertIn("stage=configuration category=missing_configuration", captured.output[0])
        store._connect.assert_not_called()
        store.database_url = SECRET
        store._connect.side_effect = TrialNotReadyError(("postgres_driver_ready", SECRET))
        with self.assertLogs(LOGGER) as captured:
            self.assert_reset(store.readiness(None))
        self.assertIn("stage=connect category=driver_unavailable", captured.output[0])
        self.assertNotIn(SECRET, str(captured.records[0].__dict__))

    def test_expected_schema_rejection_preserves_prior_success_flags(self):
        store, _ = self.make_store()
        store._assert_schema.side_effect = TrialNotReadyError(("schema_ready", SECRET))
        with self.assertLogs(LOGGER) as captured:
            result = store.readiness(None)
        self.assertTrue(result.database_ready)
        self.assertTrue(result.role_ready)
        self.assertFalse(result.schema_ready)
        self.assertIn("stage=schema category=contract_not_ready", captured.output[0])
        self.assertNotIn(SECRET, str(captured.records[0].__dict__))

    def test_context_close_failures_reset_successful_probes(self):
        for stage in ("cursor_close", "transaction_close", "connection_close"):
            with self.subTest(stage=stage):
                store, connection = self.make_store()
                target = {"cursor_close": connection.cursor.return_value,
                          "transaction_close": connection.transaction.return_value,
                          "connection_close": connection}[stage]
                target.__exit__.side_effect = RuntimeError(SECRET)
                with self.assertLogs(LOGGER) as captured:
                    self.assert_reset(store.readiness(None))
                self.assertIn(f"stage={stage} category=unexpected_error", captured.output[0])

    def test_success_is_quiet_and_logging_failure_does_not_escape(self):
        store, _ = self.make_store()
        with self.assertNoLogs(LOGGER):
            result = store.readiness(None)
        self.assertTrue(result.database_ready and result.role_ready and result.schema_ready and result.audit_ready)
        store._assert_audit.side_effect = RuntimeError(SECRET)
        with patch(f"{LOGGER}._READINESS_LOG.warning", side_effect=RuntimeError(SECRET)):
            self.assert_reset(store.readiness(None))

    def test_unknown_values_are_not_logged(self):
        with self.assertLogs(LOGGER) as captured:
            _log_readiness_failure(SECRET, SECRET)
        self.assertEqual(captured.records[0].getMessage(), "trial_readiness_failure stage=unknown category=unknown")

    def test_revoked_session_denies_readiness_before_membership_and_keeps_logs_coarse(self):
        store, _ = self.make_store()
        store._assert_active_identity_session = MagicMock(side_effect=TrialNotReadyError(('auth_session_active', SECRET)))
        store._load_membership = MagicMock()
        actor = TrialPrincipal('example-company', '11111111-1111-4111-8111-111111111111', 'human',
            session_id='22222222-2222-4222-8222-222222222222', identity_provider='supabase')
        with self.assertLogs(LOGGER) as captured:
            result = store.readiness(actor)
        self.assertTrue(result.database_ready and result.schema_ready and result.role_ready)
        self.assertFalse(result.auth_ready)
        self.assertFalse(result.membership_ready)
        self.assertEqual(result.capabilities, frozenset())
        store._load_membership.assert_not_called()
        self.assertIn('stage=session category=contract_not_ready', captured.output[0])
        self.assertNotIn(SECRET, str(captured.records[0].__dict__))


if __name__ == "__main__":
    unittest.main()
