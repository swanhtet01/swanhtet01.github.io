"""Offline source-bundle cold import; not a Vercel/Linux package acceptance test."""
from pathlib import Path
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PROBE = r"""
import builtins, json, pathlib, sys
from importlib.metadata import version
bundle = pathlib.Path(sys.argv[1]).resolve()
sys.path.insert(0, str(bundle))
def deny_network(event, args):
    if event in ('socket.connect', 'socket.connect_ex', 'socket.getaddrinfo', 'socket.bind'):
        raise RuntimeError('offline_bundle_network_forbidden')
sys.addaudithook(deny_network)
original_import = builtins.__import__
def guarded(name, *args, **kwargs):
    if name.split('.')[0] in ('mark1_pilot', 'tools', 'tests', 'hyper_unicorn'):
        raise RuntimeError('excluded_source_imported')
    return original_import(name, *args, **kwargs)
builtins.__import__ = guarded
pins = {}
for line in (bundle / 'requirements.txt').read_text().splitlines():
    if not line.strip() or line.startswith('#'):
        continue
    name, expected = line.split('==')
    pins[name.split('[')[0]] = expected
    if name == 'psycopg[binary]':
        pins['psycopg-binary'] = expected
for name, expected in pins.items():
    assert version(name) == expected, f'dependency_pin_mismatch:{name}'
from api.app import app
schema = app.openapi()
required = {
    '/api/trial/v1/bootstrap': 'get',
    '/api/trial/v1/commands': 'post',
    '/api/trial/v1/website-reviews/{review_id}': 'get',
    '/api/trial/v1/website-reviews/{review_id}/acceptance': 'post',
    '/api/trial/v1/ecommerce-reviews/{review_id}': 'get',
    '/api/trial/v1/ecommerce-reviews/{review_id}/decisions': 'get',
    '/api/trial/v1/ecommerce-reviews/{review_id}/acceptance': 'post',
    '/api/trial/v1/ecommerce-reviews/{review_id}/change-requests': 'post',
}
for path, method in required.items():
    assert method in schema['paths'][path], path
modules = [m for name, m in sys.modules.items() if name == 'supermega_runtime' or name.startswith('supermega_runtime.')]
for module in modules:
    assert pathlib.Path(module.__file__).resolve().is_relative_to(bundle)
print(json.dumps({'ok': True, 'evidence': 'isolated_source_cold_import', 'runtimeModules': len(modules),
                  'requiredRoutes': len(required), 'dependencyPins': len(pins), 'hostedAcceptance': False, 'providerPackage': False}))
"""

def main():
    # Explicit allowlist: no inherited database, Auth, provider, or telemetry secrets.
    env = {k: os.environ[k] for k in ('SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP') if k in os.environ}
    env.update(OTEL_SDK_DISABLED='true', PYTHONDONTWRITEBYTECODE='1')
    with tempfile.TemporaryDirectory(prefix='supermega-app-import-') as directory:
        bundle = Path(directory)
        shutil.copytree(ROOT / 'supermega_runtime', bundle / 'supermega_runtime',
                        ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
        shutil.copy2(ROOT / 'requirements.txt', bundle / 'requirements.txt')
        (bundle / 'api').mkdir()
        shutil.copy2(ROOT / 'api/app.py', bundle / 'api/app.py')
        result = subprocess.run([sys.executable, '-I', '-B', '-c', PROBE, str(bundle)],
                                cwd=bundle, env=env, text=True, capture_output=True, timeout=60)
        if result.returncode:
            # Environment is sanitized and only synthetic/source data is loaded.
            sys.stderr.write(result.stderr)
            raise SystemExit(result.returncode)
        print(result.stdout.strip())

if __name__ == '__main__':
    main()
