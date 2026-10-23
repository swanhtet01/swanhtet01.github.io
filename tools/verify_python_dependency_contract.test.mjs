import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { verifyPythonDependencyContract } from './verify_python_dependency_contract.mjs'

const inputs = {
  pyproject: await readFile('pyproject.toml', 'utf8'),
  uvLock: await readFile('uv.lock', 'utf8'),
  requirements: await readFile('requirements.txt', 'utf8'),
  requirementsTest: await readFile('requirements-test.txt', 'utf8'),
  workflows: {
    appCi: await readFile('.github/workflows/showroom-ci.yml', 'utf8'),
    security: await readFile('.github/workflows/dependency-security.yml', 'utf8'),
    coordinatedRelease: await readFile('.github/workflows/supermega-app-deploy.yml', 'utf8'),
    publicRelease: await readFile('.github/workflows/supermega-public-release.yml', 'utf8'),
  },
}

const mutate = (overrides) => ({
  ...inputs,
  ...overrides,
  workflows: { ...inputs.workflows, ...overrides.workflows },
})

test('required Python workflows consume one frozen hashed dependency graph', () => {
  const result = verifyPythonDependencyContract(inputs)
  assert.equal(result.ok, true)
  assert.deepEqual(result.failures, [])
  assert.equal(result.pythonVersion, '3.12.15')
  assert.equal(result.uvVersion, '0.11.30')
})

test('mutable Python, uv, cache, and pip resolution fail closed', () => {
  const source = inputs.workflows.appCi
    .replace("python-version: '3.12.15'", "python-version: '3.12'")
    .replace('cache-dependency-glob: uv.lock', 'cache-dependency-glob: requirements-test.txt')
    .replace('uv lock --check', 'true')
    .replace('uv sync --frozen --group test', 'python -m pip install -r requirements-test.txt')
  const result = verifyPythonDependencyContract(mutate({ workflows: { appCi: source } }))
  assert.ok(result.failures.includes('appCi_python_patch_not_pinned'))
  assert.ok(result.failures.includes('appCi_uv_cache_not_keyed_to_lock'))
  assert.ok(result.failures.includes('appCi_uv_lock_freshness_check_missing'))
  assert.ok(result.failures.includes('appCi_unlocked_pip_install_present'))
  assert.ok(result.failures.includes('appCi_frozen_test_sync_missing'))
})

test('dependency group or lock drift fails closed', () => {
  const projectDrift = verifyPythonDependencyContract(mutate({
    pyproject: inputs.pyproject.replace('httpx==0.28.1', 'httpx==0.28.0'),
  }))
  assert.ok(projectDrift.failures.includes('test_dependency_group_missing_or_drifted'))

  const lockDrift = verifyPythonDependencyContract(mutate({
    uvLock: inputs.uvLock.replace('name = "pip-audit"\nversion = "2.10.1"', 'name = "pip-audit"\nversion = "2.10.0"'),
  }))
  assert.ok(lockDrift.failures.includes('audit_direct_pin_missing_from_uv_lock:pip-audit'))
})

test('security audit must inspect the synced locked environment', () => {
  const source = inputs.workflows.security.replace(
    'uv run --frozen --group test --group audit pip-audit --local --skip-editable',
    'pip-audit -r requirements-test.txt',
  )
  const result = verifyPythonDependencyContract(mutate({ workflows: { security: source } }))
  assert.ok(result.failures.includes('security_locked_environment_audit_missing'))
})
