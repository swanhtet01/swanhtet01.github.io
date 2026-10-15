"""Run the real disposable Sites database suite; a skipped test is not acceptance."""
import argparse
import json
import os
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
MODULES = (
    'tests.test_website_media_postgres',
    'tests.test_website_published_media',
    'tests.test_website_inquiry_sql',
    'tests.test_website_inquiry_followup',
)


def acceptance_result(result):
    return {
        'ok': result.wasSuccessful() and result.testsRun > 0 and not result.skipped,
        'evidence': 'disposable_postgres_sites_integration',
        'tests': result.testsRun, 'skipped': len(result.skipped),
        'failures': len(result.failures), 'errors': len(result.errors),
        'python': f'{sys.version_info.major}.{sys.version_info.minor}',
        'platform': sys.platform,
        'supportedPlatform': sys.platform == 'linux' and sys.version_info[:2] == (3, 12),
        'realProviderStorage': False, 'managedAuth': False, 'hostedAcceptance': False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require-supported-python', action='store_true')
    parser.add_argument('--receipt', type=Path)
    args = parser.parse_args()
    if args.require_supported_python and (sys.platform != 'linux' or sys.version_info[:2] != (3, 12)):
        parser.error('This acceptance lane requires Linux and Python 3.12.')
    if any(os.environ.get(key) != value for key, value in {
        'SUPERMEGA_TEST_POSTGRES': '1', 'SUPERMEGA_RUN_WEBSITE_INQUIRY_SQL': '1',
        'SUPERMEGA_TRIAL_SCHEMA_VERSION': '13',
    }.items()):
        parser.error('Explicit disposable database opt-ins and schema version 13 are required.')
    suite = unittest.defaultTestLoader.loadTestsFromNames(MODULES)
    report = acceptance_result(unittest.TextTestRunner(verbosity=2).run(suite))
    if args.receipt:
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        args.receipt.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
