"""The VPS/cloud worker must be inert until explicitly targeted and enabled."""

from contextlib import redirect_stdout
import io
import json
import unittest
from unittest.mock import Mock

from tools.run_commerce_public_retention import _production_project_ref, main


PREVIEW_REF = 'abcdefghijklmnopqrst'
RUN_ID = '550e8400-e29b-41d4-a716-446655440000'
URL = f'postgresql://supermega_runtime:synthetic@db.{PREVIEW_REF}.supabase.co/postgres?sslmode=require'


def environment(**changes):
    result = {
        'SUPERMEGA_COMMERCE_RETENTION_TARGET': 'preview',
        'SUPERMEGA_COMMERCE_RETENTION_PROJECT_REF': PREVIEW_REF,
        'SUPERMEGA_DATABASE_URL': URL,
        'SUPERMEGA_TRIAL_SCHEMA_VERSION': '13',
        'SUPERMEGA_BILLING_SCHEMA_VERSION': '13',
    }
    result.update(changes)
    return result


def invoke(args, env, factory):
    output = io.StringIO()
    with redirect_stdout(output):
        code = main(args, environ=env, adapter_factory=factory)
    return code, json.loads(output.getvalue())


class CommercePublicRetentionRunnerTests(unittest.TestCase):
    def test_check_is_read_only_and_overdue_is_monitorable(self):
        adapter = Mock()
        adapter.reconciliation_due_count.return_value = 0
        adapter.redaction_due_count.return_value = 2
        factory = Mock(return_value=adapter)
        code, receipt = invoke(['--expected-target', 'preview', '--limit', '20'], environment(), factory)
        self.assertEqual(code, 2)
        self.assertEqual(receipt['status'], 'overdue')
        self.assertEqual(receipt['reconciliationDueCapped'], 0)
        self.assertEqual(receipt['redactionDueCapped'], 2)
        self.assertFalse(receipt['databaseWritesPerformed'])
        self.assertFalse(receipt['customerDataIncluded'])
        adapter.reconcile_closes.assert_not_called()
        adapter.redact_due.assert_not_called()
        factory.assert_called_once_with(URL, False)

    def test_check_reports_stranded_human_close_before_redaction_is_due(self):
        adapter = Mock()
        adapter.reconciliation_due_count.return_value = 1
        adapter.redaction_due_count.return_value = 0
        code, receipt = invoke(['--expected-target', 'preview'], environment(),
                               Mock(return_value=adapter))
        self.assertEqual(code, 2)
        self.assertEqual(receipt['status'], 'reconciliation_due')
        self.assertEqual(receipt['reconciliationDueCapped'], 1)
        self.assertFalse(receipt['databaseWritesPerformed'])
        adapter.reconcile_closes.assert_not_called()
        adapter.redact_due.assert_not_called()

    def test_apply_requires_enablement_before_connecting(self):
        factory = Mock()
        code, receipt = invoke(['--expected-target', 'preview', '--apply', '--run-id', RUN_ID],
                               environment(), factory)
        self.assertEqual(code, 1)
        self.assertEqual(receipt['error'], 'retention_apply_disabled')
        factory.assert_not_called()

    def test_target_and_tls_binding_precede_connection(self):
        factory = Mock()
        code, receipt = invoke(['--expected-target', 'production'], environment(), factory)
        self.assertEqual(code, 1)
        self.assertEqual(receipt['error'], 'retention_target_mismatch')
        code, receipt = invoke(['--expected-target', 'preview'],
                               environment(SUPERMEGA_DATABASE_URL=URL.replace('sslmode=require', 'sslmode=disable')),
                               factory)
        self.assertEqual(code, 1)
        self.assertEqual(receipt['error'], 'retention_tls_required')
        code, receipt = invoke(['--expected-target', 'preview'],
                               environment(SUPERMEGA_COMMERCE_RETENTION_PROJECT_REF='zyxwvutsrqponmlkjihg'),
                               factory)
        self.assertEqual(code, 1)
        self.assertEqual(receipt['error'], 'retention_database_target_invalid')
        pooler_url = (f'postgresql://supermega_runtime.{PREVIEW_REF}:synthetic@'
                      'aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require')
        code, receipt = invoke(['--expected-target', 'preview'],
                               environment(SUPERMEGA_DATABASE_URL=pooler_url), factory)
        self.assertEqual(code, 1)
        self.assertEqual(receipt['error'], 'retention_pooler_mode_invalid')
        production_ref = _production_project_ref()
        production_url = f'postgresql://supermega_runtime:synthetic@db.{production_ref}.supabase.co/postgres?sslmode=require'
        code, receipt = invoke(['--expected-target', 'production'],
                               environment(SUPERMEGA_COMMERCE_RETENTION_TARGET='production',
                                           SUPERMEGA_COMMERCE_RETENTION_PROJECT_REF=production_ref,
                                           SUPERMEGA_DATABASE_URL=production_url), factory)
        self.assertEqual(code, 1)
        self.assertEqual(receipt['error'], 'retention_production_tls_required')
        code, receipt = invoke(['--expected-target', 'production', '--apply', '--run-id', RUN_ID],
                               environment(SUPERMEGA_COMMERCE_RETENTION_TARGET='production',
                                           SUPERMEGA_COMMERCE_RETENTION_PROJECT_REF=production_ref,
                                           SUPERMEGA_DATABASE_URL=production_url,
                                           SUPERMEGA_COMMERCE_RETENTION_ENABLED='1',
                                           SUPERMEGA_TRIAL_WRITES_ENABLED='true'), factory)
        self.assertEqual(code, 1)
        self.assertEqual(receipt['error'], 'retention_production_apply_not_activated')
        code, receipt = invoke(['--expected-target', 'preview'],
                               environment(SUPERMEGA_TRIAL_SCHEMA_VERSION='10'), factory)
        self.assertEqual(code, 1)
        self.assertEqual(receipt['error'], 'retention_schema_version_invalid')
        factory.assert_not_called()

    def test_apply_reconciles_before_redaction_and_checks_backlog(self):
        calls = []
        adapter = Mock()
        adapter.reconciliation_due_count.side_effect = lambda *, cap: calls.append(('reconciliation_due', cap)) or 0
        adapter.redaction_due_count.side_effect = lambda *, cap: calls.append(('due', cap)) or (1 if cap == 100 else 0)
        adapter.reconcile_closes.side_effect = lambda *, run_id, limit: calls.append(('reconcile', run_id, limit)) or 1
        adapter.redact_due.side_effect = lambda *, run_id, limit: calls.append(('redact', run_id, limit)) or 1
        code, receipt = invoke(['--expected-target', 'preview', '--apply', '--run-id', RUN_ID],
                               environment(SUPERMEGA_COMMERCE_RETENTION_ENABLED='1',
                                           SUPERMEGA_TRIAL_WRITES_ENABLED='true'),
                               Mock(return_value=adapter))
        self.assertEqual(code, 0)
        self.assertEqual(calls, [('reconciliation_due', 100), ('due', 100),
                                 ('reconcile', RUN_ID, 100), ('redact', RUN_ID, 100),
                                 ('reconciliation_due', 1), ('due', 1)])
        self.assertEqual(receipt['runId'], RUN_ID)
        self.assertEqual(receipt['redacted'], 1)
        self.assertEqual(receipt['reconciled'], 1)
        self.assertEqual(receipt['status'], 'clear')
        self.assertTrue(receipt['databaseWritesPerformed'])

    def test_uncertain_apply_keeps_run_id_without_leaking_driver_error(self):
        adapter = Mock()
        adapter.reconciliation_due_count.return_value = 0
        adapter.redaction_due_count.return_value = 1
        adapter.reconcile_closes.return_value = 1
        adapter.redact_due.side_effect = RuntimeError('private customer name and database password')
        output = io.StringIO()
        with redirect_stdout(output):
            code = main(['--expected-target', 'preview', '--apply', '--run-id', RUN_ID],
                        environ=environment(SUPERMEGA_COMMERCE_RETENTION_ENABLED='1',
                                            SUPERMEGA_TRIAL_WRITES_ENABLED='true'),
                        adapter_factory=Mock(return_value=adapter))
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(output.getvalue())['runId'], RUN_ID)
        self.assertIn('retention_execution_unconfirmed', output.getvalue())
        self.assertNotIn('private customer', output.getvalue())
        self.assertNotIn('database password', output.getvalue())

    def test_reconciliation_at_batch_cap_requires_another_run(self):
        adapter = Mock()
        adapter.reconciliation_due_count.return_value = 0
        adapter.redaction_due_count.return_value = 0
        adapter.reconcile_closes.return_value = 10
        adapter.redact_due.return_value = 0
        code, receipt = invoke(['--expected-target', 'preview', '--apply', '--run-id', RUN_ID,
                                '--limit', '10'],
                               environment(SUPERMEGA_COMMERCE_RETENTION_ENABLED='1',
                                           SUPERMEGA_TRIAL_WRITES_ENABLED='true'),
                               Mock(return_value=adapter))
        self.assertEqual(code, 2)
        self.assertEqual(receipt['status'], 'more_possible')
        self.assertTrue(receipt['reconciliationLimitReached'])

    def test_apply_alerts_when_a_stranded_close_remains(self):
        adapter = Mock()
        adapter.reconciliation_due_count.return_value = 1
        adapter.redaction_due_count.return_value = 0
        adapter.reconcile_closes.return_value = 0
        adapter.redact_due.return_value = 0
        code, receipt = invoke(['--expected-target', 'preview', '--apply',
                                '--run-id', RUN_ID],
                               environment(SUPERMEGA_COMMERCE_RETENTION_ENABLED='1',
                                           SUPERMEGA_TRIAL_WRITES_ENABLED='true'),
                               Mock(return_value=adapter))
        self.assertEqual(code, 2)
        self.assertEqual(receipt['status'], 'reconciliation_due')
        self.assertEqual(receipt['reconciliationDueAfterCapped'], 1)

    def test_invalid_run_id_never_connects(self):
        factory = Mock()
        code, receipt = invoke(['--expected-target', 'preview', '--apply', '--run-id', 'not-a-uuid'],
                               environment(SUPERMEGA_COMMERCE_RETENTION_ENABLED='1',
                                           SUPERMEGA_TRIAL_WRITES_ENABLED='true'), factory)
        self.assertEqual(code, 1)
        self.assertEqual(receipt['error'], 'retention_run_id_invalid')
        factory.assert_not_called()


if __name__ == '__main__':
    unittest.main()
