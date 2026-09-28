"""Synthetic isolation/negative checks, not real Linux package acceptance."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from verify_packaged_app_import import ROUTES, layout, run_probe


class PackagedImportTests(unittest.TestCase):
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
        self.assertEqual(report['requiredRoutes'], 8)
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

    def test_rejects_vendor_escape_without_executing_launcher(self):
        self.write('vc__handler__python.py', "_vendor_rel = '..'\n")
        with self.assertRaises(ValueError):
            layout(self.bundle)

    def test_rejects_different_interpreter(self):
        self.config['runtime'] = 'python0.0'
        self.write('.vc-config.json', json.dumps(self.config))
        with self.assertRaises(ValueError):
            layout(self.bundle)


if __name__ == '__main__':
    unittest.main()
