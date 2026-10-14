#!/usr/bin/env python3
"""One bounded Sites domain recheck on the existing approved worker.

No scheduler, credentials, or provider resources are created by this file.
It emits aggregate counts only; a configured operator must schedule --apply.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import sys
from typing import Mapping
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

CONTRACT = 'supermega.website-domain-renewal.v1'
APP_PROJECT = 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG'
APP_TEAM = 'team_wI4l7ZgSxcEztQPSlCCYVeJ5'
REF = re.compile(r'^[a-z0-9]{20}$')


class RenewalConfigurationError(ValueError):
    """A static operator-safe error code."""


def validate_target(environ: Mapping[str, str], *, target: str, apply: bool) -> str:
    from tools.validate_supermega_database_url import (
        AuditConfigurationError, validate_supabase_activation_target,
    )

    if target not in ('preview', 'production') or environ.get('SUPERMEGA_WEBSITE_DOMAIN_RENEWAL_TARGET') != target:
        raise RenewalConfigurationError('renewal_target_mismatch')
    project_ref = environ.get('SUPERMEGA_WEBSITE_DOMAIN_PROJECT_REF', '')
    if not REF.fullmatch(project_ref):
        raise RenewalConfigurationError('renewal_project_ref_invalid')
    manifest = json.loads((Path(__file__).resolve().parents[1] / 'package.json').read_text(encoding='utf-8'))
    production_ref = manifest.get('supermega', {}).get('productionSupabaseProjectRef')
    if not isinstance(production_ref, str) or not REF.fullmatch(production_ref):
        raise RenewalConfigurationError('renewal_production_ref_invalid')
    if (target == 'production') != (project_ref == production_ref):
        raise RenewalConfigurationError('renewal_project_class_mismatch')
    if environ.get('SUPERMEGA_TRIAL_SCHEMA_VERSION') != '13':
        raise RenewalConfigurationError('renewal_schema_version_invalid')
    database_url = environ.get('SUPERMEGA_DATABASE_URL', '')
    try:
        sslmodes = parse_qs(urlsplit(database_url).query).get('sslmode', [])
        if sslmodes not in (['require'], ['verify-full']) or (target == 'production' and sslmodes != ['verify-full']):
            raise RenewalConfigurationError('renewal_tls_required')
        mode = validate_supabase_activation_target(database_url, expected_project_ref=project_ref)
        if mode == 'transaction_pooler':
            raise RenewalConfigurationError('renewal_pooler_mode_invalid')
    except (AuditConfigurationError, TypeError, ValueError) as error:
        if isinstance(error, RenewalConfigurationError):
            raise
        raise RenewalConfigurationError('renewal_database_target_invalid') from None
    if apply:
        if (environ.get('SUPERMEGA_WEBSITE_DOMAIN_RENEWAL_ENABLED') != 'true'
                or environ.get('SUPERMEGA_WEBSITE_DOMAINS_ENABLED') != 'true'
                or environ.get('SUPERMEGA_WEBSITE_PUBLISHING_ENABLED') != 'true'
                or environ.get('SUPERMEGA_WEBSITE_INGRESS') != 'vercel'
                or environ.get('SUPERMEGA_TRIAL_WRITES_ENABLED') != 'true'):
            raise RenewalConfigurationError('renewal_apply_disabled')
        if (environ.get('VERCEL_PROJECT_ID') != APP_PROJECT
                or environ.get('VERCEL_ORG_ID') != APP_TEAM
                or not environ.get('VERCEL_TOKEN')):
            raise RenewalConfigurationError('renewal_provider_target_invalid')
    return database_url


def main(argv: list[str] | None = None, *, environ: Mapping[str, str] | None = None,
         adapter_factory=None) -> int:
    parser = argparse.ArgumentParser(description='Bounded Sites custom-domain verification renewal')
    parser.add_argument('--expected-target', choices=('preview', 'production'), required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--limit', type=int, default=20)
    args = parser.parse_args(argv)
    environment = os.environ if environ is None else environ
    try:
        if not 1 <= args.limit <= 20:
            raise RenewalConfigurationError('renewal_limit_invalid')
        database_url = validate_target(environment, target=args.expected_target, apply=args.apply)
        if not args.apply:
            result = {'ok': True, 'contract': CONTRACT, 'mode': 'configuration-check',
                      'target': args.expected_target, 'databaseWritesPerformed': False,
                      'customerDataIncluded': False}
        else:
            if adapter_factory is None:
                from supermega_runtime.trial_store import PostgresTrialStore
                from supermega_runtime.website_domain import VercelDomainProvider, WebsiteDomainStore
                from supermega_runtime.runtime import reduce_trial_state
                provider = VercelDomainProvider(
                    project_id=APP_PROJECT, team_id=APP_TEAM, token=environment['VERCEL_TOKEN'])
                adapter = WebsiteDomainStore(PostgresTrialStore(
                    database_url, reducer=reduce_trial_state, write_enabled=True), provider=provider)
            else:
                adapter = adapter_factory(database_url, environment)
            counts = adapter.renew_due(limit=args.limit)
            result = {'ok': counts['notRenewed'] == 0, 'contract': CONTRACT, 'mode': 'apply',
                      'target': args.expected_target, **counts, 'databaseWritesPerformed': True,
                      'customerDataIncluded': False}
        print(json.dumps(result, sort_keys=True))
        return 0 if result['ok'] else 2
    except RenewalConfigurationError as error:
        print(json.dumps({'ok': False, 'contract': CONTRACT, 'error': str(error),
                          'databaseWritesPerformed': False, 'customerDataIncluded': False}, sort_keys=True))
        return 1
    except Exception:
        print(json.dumps({'ok': False, 'contract': CONTRACT, 'error': 'renewal_execution_unconfirmed',
                          'databaseWritesPerformed': None, 'customerDataIncluded': False}, sort_keys=True))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
