"""One bounded Commerce intake maintenance run on an approved managed target.

No scheduler is registered here. The caller supplies a stable run ID so a
retried invocation replays the database receipts rather than applying twice.
Output contains counts and status only, never customer data or a database URL.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import sys
from typing import Any, Mapping
from urllib.parse import parse_qs, urlsplit
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

CONTRACT = 'supermega.commerce-public-retention-worker.v1'
_TARGET_ENV = 'SUPERMEGA_COMMERCE_RETENTION_TARGET'
_PROJECT_ENV = 'SUPERMEGA_COMMERCE_RETENTION_PROJECT_REF'
_ENABLE_ENV = 'SUPERMEGA_COMMERCE_RETENTION_ENABLED'
_REF = re.compile(r'^[a-z0-9]{20}$')


class RetentionConfigurationError(ValueError):
    """A static error code safe to include in an operator receipt."""


def _run_id(value: object) -> str:
    try:
        parsed = UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        raise RetentionConfigurationError('retention_run_id_invalid') from None
    if parsed.version != 4 or str(parsed) != value:
        raise RetentionConfigurationError('retention_run_id_invalid')
    return str(parsed)


def _limit(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 500:
        raise RetentionConfigurationError('retention_limit_invalid')
    return value


def _production_project_ref() -> str:
    manifest = json.loads((Path(__file__).resolve().parents[1] / 'package.json').read_text(encoding='utf-8'))
    project_ref = manifest.get('supermega', {}).get('productionSupabaseProjectRef')
    if not isinstance(project_ref, str) or not _REF.fullmatch(project_ref):
        raise RetentionConfigurationError('retention_production_ref_invalid')
    return project_ref


def validate_target(environ: Mapping[str, str], *, expected_target: str, apply: bool) -> str:
    """Bind the runtime URL to an explicit preview or production project."""
    from tools.validate_supermega_database_url import (
        AuditConfigurationError, validate_supabase_activation_target,
    )

    if expected_target not in ('preview', 'production') or environ.get(_TARGET_ENV) != expected_target:
        raise RetentionConfigurationError('retention_target_mismatch')
    project_ref = environ.get(_PROJECT_ENV, '')
    if not isinstance(project_ref, str) or not _REF.fullmatch(project_ref):
        raise RetentionConfigurationError('retention_project_ref_invalid')
    production_ref = _production_project_ref()
    if (expected_target == 'production') != (project_ref == production_ref):
        raise RetentionConfigurationError('retention_project_class_mismatch')
    if apply and expected_target == 'production':
        raise RetentionConfigurationError('retention_production_apply_not_activated')
    if (environ.get('SUPERMEGA_TRIAL_SCHEMA_VERSION') != '13'
            or environ.get('SUPERMEGA_BILLING_SCHEMA_VERSION') != '13'):
        raise RetentionConfigurationError('retention_schema_version_invalid')
    database_url = environ.get('SUPERMEGA_DATABASE_URL', '')
    try:
        sslmodes = parse_qs(urlsplit(database_url).query).get('sslmode', [])
        if sslmodes not in (['require'], ['verify-full']):
            raise RetentionConfigurationError('retention_tls_required')
        if expected_target == 'production' and sslmodes != ['verify-full']:
            raise RetentionConfigurationError('retention_production_tls_required')
        mode = validate_supabase_activation_target(database_url, expected_project_ref=project_ref)
        if mode == 'transaction_pooler':
            raise RetentionConfigurationError('retention_pooler_mode_invalid')
    except (AuditConfigurationError, TypeError, ValueError) as error:
        if isinstance(error, RetentionConfigurationError):
            raise
        raise RetentionConfigurationError('retention_database_target_invalid') from None
    if apply and (environ.get(_ENABLE_ENV) != '1'
                  or environ.get('SUPERMEGA_TRIAL_WRITES_ENABLED') != 'true'):
        raise RetentionConfigurationError('retention_apply_disabled')
    return database_url


def run_maintenance(adapter: Any, *, apply: bool, run_id: str | None, limit: int) -> dict[str, Any]:
    """Check due work, then reconcile and redact in bounded receipt-backed runs."""
    limit = _limit(limit)
    if apply:
        run_id = _run_id(run_id)
    elif run_id is not None:
        raise RetentionConfigurationError('retention_run_id_without_apply')
    due_before = adapter.redaction_due_count(cap=limit)
    if not apply:
        return {
            'ok': True, 'contract': CONTRACT, 'mode': 'check',
            'status': 'overdue' if due_before else 'clear',
            'redactionDueCapped': due_before, 'cap': limit,
            'databaseWritesPerformed': False, 'customerDataIncluded': False,
        }
    reconciled = adapter.reconcile_closes(run_id=run_id, limit=limit)
    redacted = adapter.redact_due(run_id=run_id, limit=limit)
    due_after = adapter.redaction_due_count(cap=1)
    limit_reached = reconciled == limit
    return {
        'ok': True, 'contract': CONTRACT, 'mode': 'apply',
        'status': 'overdue' if due_after else ('more_possible' if limit_reached else 'clear'),
        'runId': run_id,
        'reconciled': reconciled, 'redacted': redacted,
        'reconciliationLimitReached': limit_reached,
        'redactionDueBeforeCapped': due_before, 'redactionDueAfterCapped': due_after,
        'cap': limit, 'databaseWritesPerformed': True, 'customerDataIncluded': False,
    }


def main(argv: list[str] | None = None, *, environ: Mapping[str, str] | None = None,
         adapter_factory: Any = None) -> int:
    parser = argparse.ArgumentParser(description='Check or apply bounded Commerce contact retention')
    parser.add_argument('--expected-target', choices=('preview', 'production'), required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--run-id')
    parser.add_argument('--limit', type=int, default=100)
    args = parser.parse_args(argv)
    environment = os.environ if environ is None else environ
    try:
        _limit(args.limit)
        if args.apply:
            _run_id(args.run_id)
        elif args.run_id is not None:
            raise RetentionConfigurationError('retention_run_id_without_apply')
        database_url = validate_target(environment, expected_target=args.expected_target, apply=args.apply)
        if adapter_factory is None:
            from supermega_runtime.commerce_public_storefront import CommercePublicStorefront
            from supermega_runtime.runtime import reduce_trial_state
            from supermega_runtime.trial_store import PostgresTrialStore
            adapter = CommercePublicStorefront(PostgresTrialStore(
                database_url, reducer=reduce_trial_state, write_enabled=args.apply))
        else:
            adapter = adapter_factory(database_url, args.apply)
        result = run_maintenance(adapter, apply=args.apply, run_id=args.run_id, limit=args.limit)
        result['target'] = args.expected_target
        print(json.dumps(result, sort_keys=True))
        return 2 if result['status'] != 'clear' else 0
    except RetentionConfigurationError as error:
        print(json.dumps({'ok': False, 'contract': CONTRACT, 'error': str(error),
                          'databaseWritesConfirmed': False, 'customerDataIncluded': False}, sort_keys=True))
        return 1
    except Exception:
        # A database acknowledgement may be uncertain. The caller must retry
        # with the same run ID; never report an unconfirmed write as absent.
        print(json.dumps({'ok': False, 'contract': CONTRACT, 'error': 'retention_execution_unconfirmed',
                          'runId': args.run_id if args.apply else None,
                          'databaseWritesConfirmed': None, 'customerDataIncluded': False}, sort_keys=True))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
