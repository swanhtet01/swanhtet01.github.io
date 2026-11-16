"""Source-only default-off contract for the portable app Compose example.

This test reads source text. It never imports the application, runs Compose,
starts a service, or supplies a real credential.
"""

import ast
import hashlib
from pathlib import Path
import re
import unittest


SOURCE = Path(__file__).resolve().parents[1]
COMPOSE = SOURCE / 'docker-compose.app.yml'
DOCKERFILE = SOURCE / 'Dockerfile'
API_ENTRY = SOURCE / 'api_app.py'
CRON_SOURCE = SOURCE / 'supermega_runtime/cloud_runtime.py'
BASE_CRON_SOURCE_SHA256 = '9721d47666fa1121e28a0980e37c0c3260aa23efed5a1b088236a54745cc17b0'

# Reject a default credential even if written as an environment interpolation.
# An enabled scheduler is also excluded from this default-off example.
FORBIDDEN_ENV = re.compile(
    r'^\s*(?:-\s*)?[\x27\"]?(SUPERMEGA_INTERNAL_CRON_TOKEN|CRON_SECRET|'
    r'SUPERMEGA_HOSTED_SCHEDULER_ENABLED)[\x27\"]?\s*[:=]',
    re.MULTILINE,
)


def forbidden_default_fields(compose_text: str) -> set[str]:
    active_lines = '\n'.join(
        line for line in compose_text.splitlines()
        if not line.lstrip().startswith('#')
    )
    return set(FORBIDDEN_ENV.findall(active_lines))


def function(tree: ast.Module, name: str) -> ast.FunctionDef:
    matches = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == name]
    if len(matches) != 1:
        raise AssertionError(f'expected one source function: {name}')
    return matches[0]


class AppComposeCronDefaultStaticTest(unittest.TestCase):
    def test_default_compose_has_no_cron_credential_or_activation(self) -> None:
        compose = COMPOSE.read_text(encoding='utf-8')
        self.assertEqual(forbidden_default_fields(compose), set())
        for field in ('supermega-app:', 'dockerfile: Dockerfile', 'ports:',
                      'environment:', 'SUPERMEGA_PILOT_DATA:', 'SUPERMEGA_CORS_ORIGINS:',
                      'volumes:', 'restart: unless-stopped'):
            with self.subTest(field=field):
                self.assertIn(field, compose)

    def test_checker_rejects_reintroduced_defaults(self) -> None:
        compose = COMPOSE.read_text(encoding='utf-8')
        self.assertEqual(compose.count('    environment:\n'), 1)
        for field in ('SUPERMEGA_INTERNAL_CRON_TOKEN', 'CRON_SECRET',
                      'SUPERMEGA_HOSTED_SCHEDULER_ENABLED'):
            with self.subTest(field=field):
                value = 'true' if field == 'SUPERMEGA_HOSTED_SCHEDULER_ENABLED' else 'synthetic-only'
                changed = compose.replace('    environment:\n',
                                          f'    environment:\n      {field}: {value}\n', 1)
                self.assertIn(field, forbidden_default_fields(changed))
        list_form = compose + '\n      - "SUPERMEGA_INTERNAL_CRON_TOKEN=synthetic-only"\n'
        self.assertIn('SUPERMEGA_INTERNAL_CRON_TOKEN', forbidden_default_fields(list_form))

    def test_actual_entrypoint_and_unmodified_fail_closed_guard(self) -> None:
        dockerfile = DOCKERFILE.read_text(encoding='utf-8')
        entrypoint = API_ENTRY.read_text(encoding='utf-8')
        self.assertIn('uvicorn api_app:app', dockerfile)
        self.assertIn('from supermega_runtime.runtime import app', entrypoint)

        cron_bytes = CRON_SOURCE.read_bytes()
        self.assertEqual(hashlib.sha256(cron_bytes).hexdigest(), BASE_CRON_SOURCE_SHA256)
        tree = ast.parse(cron_bytes, filename=str(CRON_SOURCE))
        auth = function(tree, '_authorized')
        self.assertTrue(any(
            isinstance(node, ast.If)
            and isinstance(node.test, ast.UnaryOp)
            and isinstance(node.test.op, ast.Not)
            and isinstance(node.test.operand, ast.Name)
            and node.test.operand.id == 'expected_tokens'
            and any(isinstance(child, ast.Return)
                    and isinstance(child.value, ast.Constant)
                    and child.value.value is False for child in node.body)
            for node in auth.body
        ), 'missing configured cron tokens must deny authentication')

        gate = function(tree, '_require_cron_auth')
        self.assertTrue(any(
            isinstance(node, ast.Raise)
            and isinstance(node.exc, ast.Call)
            and any(keyword.arg == 'status_code'
                    and isinstance(keyword.value, ast.Constant)
                    and keyword.value.value == 401 for keyword in node.exc.keywords)
            for node in ast.walk(gate)
        ), 'cron routes must return unauthorized without a configured token')

        activation = function(tree, '_scheduler_activation_state')
        self.assertTrue(any(
            isinstance(node, ast.If)
            and any(isinstance(child, ast.Return)
                    and isinstance(child.value, ast.Tuple)
                    and len(child.value.elts) >= 2
                    and all(isinstance(value, ast.Constant) and value.value is False
                            for value in child.value.elts[:2]) for child in node.body)
            for node in activation.body
        ), 'absent scheduler activation must remain disabled')


if __name__ == '__main__':
    unittest.main()
