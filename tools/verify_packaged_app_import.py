"""Offline packaged app import. Does not execute the Vercel launcher/lifespan."""
import ast
import json
import os
from pathlib import Path
import subprocess
import sys

ROUTES = {
    '/api/trial/v1/bootstrap': 'get',
    '/api/trial/v1/commands': 'post',
    '/api/trial/v1/website-reviews/{review_id}': 'get',
    '/api/trial/v1/website-reviews/{review_id}/acceptance': 'post',
    '/api/trial/v1/ecommerce-reviews/{review_id}': 'get',
    '/api/trial/v1/ecommerce-reviews/{review_id}/decisions': 'get',
    '/api/trial/v1/ecommerce-reviews/{review_id}/acceptance': 'post',
    '/api/trial/v1/ecommerce-reviews/{review_id}/change-requests': 'post',
}

SAFE_FAILURE_CODES = frozenset({
    'package_path_escape', 'interpreter_runtime_mismatch',
    'interpreter_architecture_mismatch', 'unsupported_launcher',
    'unsupported_vendor_layout', 'vendor_directory_missing',
    'isolated_interpreter_required', 'offline_package_side_effect_forbidden',
    'dependency_pins_missing', 'packaged_dependency_pin_mismatch',
    'packaged_psycopg_binary_not_loaded', 'required_route_missing',
    'application_origin_outside_bundle', 'dependency_origin_outside_bundle',
    'runtime_modules_missing', 'Linux_required_for_package_acceptance',
    'packaged_import_failed', 'invalid_probe_result',
    'package_metadata_missing', 'package_launcher_missing', 'package_vendor_missing',
    'package_entrypoint_missing', 'standalone_function_required',
})
PROBE_PHASES = frozenset({'layout', 'dependencies', 'native_imports', 'application_import', 'routes', 'module_origins'})
ERROR_TYPES = frozenset({'ValueError', 'RuntimeError', 'ImportError', 'ModuleNotFoundError', 'FileNotFoundError', 'KeyError', 'TypeError', 'OSError', 'Exception'})
_probe_phase = 'layout'
_dependency_layout = 'unknown'


def child_failure_report(text):
    try:
        value = json.loads(text)
    except (ValueError, TypeError):
        value = {}
    if not isinstance(value, dict):
        value = {}
    return {'ok': False, 'evidence': 'packaged_application_import',
            'reason': value.get('reason') if isinstance(value.get('reason'), str) and value['reason'] in SAFE_FAILURE_CODES else 'packaged_import_failed',
            'phase': value.get('phase') if isinstance(value.get('phase'), str) and value['phase'] in PROBE_PHASES else 'unknown',
            'dependencyLayout': value.get('dependencyLayout') if value.get('dependencyLayout') in ('root_metadata', 'no_root_metadata') else 'unknown',
            'errorType': value.get('errorType') if isinstance(value.get('errorType'), str) and value['errorType'] in ERROR_TYPES else 'Exception'}


def safe_failure(error):
    code = str(error)
    return {'ok': False, 'evidence': 'packaged_application_import',
            'phase': _probe_phase, 'dependencyLayout': _dependency_layout,
            'reason': code if code in SAFE_FAILURE_CODES else 'package_probe_exception',
            'errorType': type(error).__name__ if type(error) in (
                ValueError, RuntimeError, ImportError, ModuleNotFoundError,
                FileNotFoundError, KeyError, TypeError, OSError) else 'Exception'}


def contained(root, path):
    path = path.resolve(strict=True)
    if not path.is_relative_to(root):
        raise ValueError('package_path_escape')
    return path


def required_path(bundle, relative, missing_code):
    try:
        return contained(bundle, bundle / relative)
    except FileNotFoundError:
        raise ValueError(missing_code) from None


def layout(bundle):
    global _dependency_layout
    bundle = bundle.resolve(strict=True)
    config = json.loads(required_path(bundle, '.vc-config.json', 'package_metadata_missing').read_text())
    if config.get('filePathMap'):
        raise ValueError('standalone_function_required')
    expected = f'python{sys.version_info.major}.{sys.version_info.minor}'
    if config.get('runtime') != expected:
        raise ValueError('interpreter_runtime_mismatch')
    import platform
    expected_arch = {'x86_64': 'x86_64', 'AMD64': 'x86_64', 'aarch64': 'arm64', 'ARM64': 'arm64'}.get(platform.machine())
    if not expected_arch or config.get('architecture', 'x86_64') != expected_arch:
        raise ValueError('interpreter_architecture_mismatch')
    if config.get('handler') != 'vc__handler__python.vc_handler':
        raise ValueError('unsupported_launcher')
    tree = ast.parse(required_path(bundle, 'vc__handler__python.py', 'package_launcher_missing').read_text())
    values = [node.value.value for node in tree.body
              if isinstance(node, ast.Assign)
              and any(isinstance(t, ast.Name) and t.id == '_vendor_rel' for t in node.targets)
              and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str)]
    if len(values) != 1 or not values[0] or Path(values[0]).is_absolute():
        raise ValueError('unsupported_vendor_layout')
    _dependency_layout = 'root_metadata' if any(bundle.glob('*.dist-info/METADATA')) else 'no_root_metadata'
    vendor = required_path(bundle, values[0], 'package_vendor_missing')
    if not vendor.is_dir():
        raise ValueError('vendor_directory_missing')
    required_path(bundle, 'api/app.py', 'package_entrypoint_missing')
    return bundle, vendor


def probe(bundle):
    global _probe_phase
    # The child is launched with -I -S: ambient site-packages and PYTHONPATH are absent.
    if not sys.flags.isolated or not sys.flags.no_site:
        raise ValueError('isolated_interpreter_required')
    bundle, vendor = layout(bundle)
    import importlib.metadata as metadata
    stdlib = [Path(p).resolve() for p in sys.path if p]

    def deny_side_effects(event, args):
        if event in {'socket.connect', 'socket.getaddrinfo', 'socket.bind', 'socket.sendto',
                     'subprocess.Popen', 'os.system', 'os.posix_spawn', 'os.exec', 'os.spawn'}:
            raise RuntimeError('offline_package_side_effect_forbidden')
    sys.addaudithook(deny_side_effects)
    sys.path[:0] = [str(bundle), str(vendor)]
    # Deliberately no site.addsitedir: executable .pth files and launcher are not run.
    _probe_phase = 'dependencies'
    pins = {}
    for raw in contained(bundle, bundle / 'requirements.txt').read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        name, version = line.split('==')
        pins[name.split('[')[0]] = version
        if name == 'psycopg[binary]':
            pins['psycopg-binary'] = version
    if not pins:
        raise ValueError('dependency_pins_missing')
    normalize = lambda name: name.lower().replace('_', '-').replace('.', '-')
    installed = {}
    for dist in metadata.distributions(path=[str(bundle), str(vendor)]):
        installed.setdefault(normalize(dist.metadata['Name']), []).append(dist.version)
    for name, version in pins.items():
        if installed.get(normalize(name)) != [version]:
            raise ValueError('packaged_dependency_pin_mismatch')
    # These native-backed dependencies are otherwise lazy or disabled by offline telemetry.
    _probe_phase = 'native_imports'
    from importlib import import_module
    native_imports = []
    for pin, module_name in [('psycopg-binary', 'psycopg_binary'),
                             ('opentelemetry-exporter-otlp-proto-grpc', 'grpc')]:
        if pin in pins:
            if module_name == 'psycopg_binary':
                psycopg = import_module('psycopg')
                if psycopg.pq.__impl__ != 'binary':
                    raise ValueError('packaged_psycopg_binary_not_loaded')
            import_module(module_name)
            native_imports.append(module_name)
    _probe_phase = 'application_import'
    from api.app import app
    _probe_phase = 'routes'
    schema = app.openapi()
    for route, method in ROUTES.items():
        if method not in schema['paths'][route]:
            raise ValueError('required_route_missing')
    _probe_phase = 'module_origins'
    runtime_count = 0
    for name, module in list(sys.modules.items()):
        origin = getattr(module, '__file__', None)
        if not origin or origin.startswith('<'):
            continue
        path = Path(origin).resolve()
        if name == 'api.app' or name == 'supermega_runtime' or name.startswith('supermega_runtime.'):
            if not path.is_relative_to(bundle):
                raise ValueError('application_origin_outside_bundle')
            runtime_count += name.startswith('supermega_runtime')
        elif not path.is_relative_to(bundle) and (
                any(part in ('site-packages', 'dist-packages') for part in path.parts)
                or not any(path.is_relative_to(p) for p in stdlib)):
            # This script itself is trusted tooling outside the package.
            if name != '__main__':
                raise ValueError('dependency_origin_outside_bundle')
    if not runtime_count:
        raise ValueError('runtime_modules_missing')
    return {'ok': True, 'evidence': 'packaged_application_import', 'runtimeModules': runtime_count,
            'dependencyPins': len(pins), 'requiredRoutes': len(ROUTES), 'nativeImports': native_imports,
            'providerBootstrap': 'NOT RUN', 'hostedAcceptance': 'NOT RUN'}


def run_probe(bundle):
    env = {key: os.environ[key] for key in ('SystemRoot', 'WINDIR', 'TEMP', 'TMP') if key in os.environ}
    env['OTEL_SDK_DISABLED'] = 'true'
    return subprocess.run([sys.executable, '-I', '-S', '-B', str(Path(__file__).resolve()),
                           '--probe', str(bundle.resolve())], cwd=bundle, env=env,
                          capture_output=True, text=True, timeout=60)


def main():
    try:
        if len(sys.argv) == 3 and sys.argv[1] == '--probe':
            print(json.dumps(probe(Path(sys.argv[2]))))
            return
        if sys.platform != 'linux':
            raise ValueError('Linux_required_for_package_acceptance')
        output = Path(sys.argv[1] if len(sys.argv) == 2 else '.vercel/output')
        functions = (output / 'functions').resolve(strict=True)
        bundle = contained(functions, functions / 'api/app.func')
        result = run_probe(bundle)
        if result.returncode:
            print(json.dumps(child_failure_report(result.stderr)), file=sys.stderr)
            raise SystemExit(1)
        report = json.loads(result.stdout)
        if report.get('evidence') != 'packaged_application_import' or report.get('ok') is not True:
            raise ValueError('invalid_probe_result')
        print(json.dumps(report))
    except Exception as error:
        # Never echo arbitrary import output or generated environment metadata.
        print(json.dumps(safe_failure(error)), file=sys.stderr)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
