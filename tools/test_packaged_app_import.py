"""Synthetic isolation/negative checks, not real Linux package acceptance."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from verify_packaged_app_import import ROUTES, layout, run_probe, safe_failure, child_failure_report


class PackagedImportTests(unittest.TestCase):
    def test_child_diagnostic_forwards_only_fixed_vocabulary(self):
        report = child_failure_report(json.dumps({'phase': 'application_import', 'errorType': 'ModuleNotFoundError', 'reason': 'PRIVATE_SENTINEL', 'details': 'PRIVATE_SENTINEL'}))
        self.assertEqual(report['phase'], 'application_import')
        self.assertEqual(report['errorType'], 'ModuleNotFoundError')
        self.assertNotIn('PRIVATE_SENTINEL', json.dumps(report))
        for value in ['PRIVATE_SENTINEL', '[]', '{"reason":[],"phase":{},"errorType":null}']:
            self.assertFalse(child_failure_report(value)['ok'])

    def test_diagnostics_preserve_fixed_codes_without_arbitrary_messages(self):
        self.assertEqual(safe_failure(ValueError('unsupported_vendor_layout'))['reason'], 'unsupported_vendor_layout')
        for error in [RuntimeError('PRIVATE_SENTINEL'), ImportError('PRIVATE_SENTINEL'), ValueError('PRIVATE_SENTINEL')]:
            report = safe_failure(error)
            self.assertNotIn('PRIVATE_SENTINEL', json.dumps(report))
            self.assertFalse(report['ok'])

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='supermega-packaged-probe-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bundle = self.root / 'app.func'
        self.bundle.mkdir()
        self.vendor = self.bundle / '_vendor'
        self.vendor.mkdir()
        self.config = {'runtime': f'python{sys.version_info.major}.{sys.version_info.minor}',
                       'handler': 'vc__handler__python.vc_handler'}
        self.write('.vc-config.json', json.dumps(self.config))
        self.write('vc__handler__python.py', "_vendor_rel = '_vendor'\nraise RuntimeError('launcher must not execute')\n")
        self.write('requirements.txt', 'fixture-dependency==1.0\n')
        self.write('_vendor/fixture_dependency-1.0.dist-info/METADATA',
                   'Metadata-Version: 2.1\nName: fixture-dependency\nVersion: 1.0\n')
        self.write('_vendor/fixture_dependency.py', 'VALUE = 1\n')
        self.write('supermega_runtime/__init__.py', '')
        self.write('api/__init__.py', '')
        self.source = ('import fixture_dependency, supermega_runtime\n'
                       'class App:\n'
                       f'    def openapi(self): return {repr({"paths": {p: {m: {}} for p, m in ROUTES.items()}})}\n'
                       'app = App()\n')
        self.write('api/app.py', self.source)

    def write(self, name, data):
        path = self.bundle / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(data)

    def assert_failed(self, prefix):
        self.write('api/app.py', prefix + '\n' + self.source)
        result = run_probe(self.bundle)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('PRIVATE_SENTINEL', result.stdout + result.stderr)

    def test_packaged_import_ignores_launcher_and_pth(self):
        self.write('_vendor/unsafe.pth', "import os; raise RuntimeError('pth must not execute')\n")
        result = run_probe(self.bundle)
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report['requiredRoutes'], len(ROUTES))
        self.assertEqual(report['providerBootstrap'], 'NOT RUN')

    def test_sanitized_environment_and_ignored_pythonpath(self):
        extra = self.root / 'ambient'
        extra.mkdir()
        (extra / 'ambient_only.py').write_text('VALUE = 1')
        with patch.dict('os.environ', {'DATABASE_URL': 'PRIVATE_SENTINEL', 'PYTHONPATH': str(extra)}):
            self.write('api/app.py', 'import os\nassert "DATABASE_URL" not in os.environ\n' + self.source)
            self.assertEqual(run_probe(self.bundle).returncode, 0)
            self.assert_failed('import ambient_only')

    def test_blocks_network_and_subprocess(self):
        for code in ['import socket; socket.socket().connect(("127.0.0.1", 1))',
                     'import subprocess, sys; subprocess.run([sys.executable, "-V"])']:
            with self.subTest(code=code):
                self.assert_failed(code)

    def test_redacts_import_failures(self):
        self.assert_failed('raise RuntimeError("PRIVATE_SENTINEL")')

    def test_missing_package_and_pin_mismatch(self):
        self.write('requirements.txt', 'fixture-dependency==2.0\n')
        self.assertNotEqual(run_probe(self.bundle).returncode, 0)
        self.write('requirements.txt', 'fixture-dependency==1.0\n')
        (self.vendor / 'fixture_dependency.py').unlink()
        self.assertNotEqual(run_probe(self.bundle).returncode, 0)

    def test_native_dependency_metadata_does_not_replace_import(self):
        self.write('requirements.txt', 'fixture-dependency==1.0\npsycopg[binary]==3.3.4\n')
        for name in ('psycopg', 'psycopg-binary'):
            self.write(f'_vendor/{name.replace("-", "_")}-3.3.4.dist-info/METADATA',
                       f'Metadata-Version: 2.1\nName: {name}\nVersion: 3.3.4\n')
        self.assertNotEqual(run_probe(self.bundle).returncode, 0)

    def test_missing_route(self):
        self.write('api/app.py', self.source + '\napp.openapi = lambda: {"paths": {}}\n')
        self.assertNotEqual(run_probe(self.bundle).returncode, 0)

    def test_every_sites_route_is_required_in_the_packaged_app(self):
        paths = {p: {m: {}} for p, m in ROUTES.items()}
        sites_routes = [p for p in paths if 'website-' in p or p.startswith(('/sites/', '/api/public/sites/'))]
        self.assertGreaterEqual(len(sites_routes), 12)
        for missing in sites_routes:
            with self.subTest(missing=missing):
                incomplete = {p: value for p, value in paths.items() if p != missing}
                self.write('api/app.py', self.source + f'\napp.openapi = lambda: {repr({"paths": incomplete})}\n')
                result = run_probe(self.bundle)
                self.assertEqual(child_failure_report(result.stderr)['reason'], 'required_route_missing')

    def test_pillow_metadata_does_not_replace_a_working_codec(self):
        self.write('requirements.txt', 'fixture-dependency==1.0\nPillow==12.3.0\n')
        self.write('_vendor/pillow-12.3.0.dist-info/METADATA', 'Metadata-Version: 2.1\nName: Pillow\nVersion: 12.3.0\n')
        self.write('_vendor/PIL/__init__.py', '')
        self.write('_vendor/PIL/_imaging.py', '')
        self.write('_vendor/PIL/Image.py', 'def new(*args): raise RuntimeError("PRIVATE_SENTINEL")\n')
        result = run_probe(self.bundle)
        self.assertEqual(child_failure_report(result.stderr)['reason'], 'packaged_photo_codec_failed')
        self.assertNotIn('PRIVATE_SENTINEL', result.stderr)

    def test_rejects_vendor_escape_without_executing_launcher(self):
        self.write('vc__handler__python.py', "_vendor_rel = '..'\n")
        with self.assertRaises(ValueError):
            layout(self.bundle)

    def test_missing_layout_files_have_fixed_diagnostics(self):
        for relative, code in [('.vc-config.json', 'package_metadata_missing'),
                               ('vc__handler__python.py', 'package_launcher_missing'),
                               ('_vendor', 'package_vendor_missing'),
                               ('api/app.py', 'package_entrypoint_missing')]:
            with self.subTest(relative=relative):
                path = self.bundle / relative
                held = path.with_name(path.name + '.held')
                path.rename(held)
                try:
                    result = run_probe(self.bundle)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertEqual(child_failure_report(result.stderr)['reason'], code)
                    self.assertNotIn(str(self.bundle), result.stderr)
                finally:
                    held.rename(path)

    def test_missing_vendor_reports_only_fixed_root_layout(self):
        (self.vendor / 'fixture_dependency-1.0.dist-info').rename(self.bundle / 'fixture_dependency-1.0.dist-info')
        self.vendor.rename(self.bundle / 'held_vendor')
        result = run_probe(self.bundle)
        report = child_failure_report(result.stderr)
        self.assertEqual(report['reason'], 'package_vendor_missing')
        self.assertEqual(report['dependencyLayout'], 'root_metadata')
        self.assertNotIn(str(self.bundle), result.stderr)
        self.assertEqual(child_failure_report('{"dependencyLayout":"PRIVATE_SENTINEL"}')['dependencyLayout'], 'unknown')

    def test_rejects_nonstandalone_file_map_without_exposing_paths(self):
        self.config['filePathMap'] = {'api/app.py': 'PRIVATE_SENTINEL'}
        self.write('.vc-config.json', json.dumps(self.config))
        result = run_probe(self.bundle)
        self.assertEqual(child_failure_report(result.stderr)['reason'], 'standalone_function_required')
        self.assertNotIn('PRIVATE_SENTINEL', result.stderr)

    def test_rejects_different_interpreter(self):
        self.config['runtime'] = 'python0.0'
        self.write('.vc-config.json', json.dumps(self.config))
        with self.assertRaises(ValueError):
            layout(self.bundle)


if __name__ == '__main__':
    unittest.main()
