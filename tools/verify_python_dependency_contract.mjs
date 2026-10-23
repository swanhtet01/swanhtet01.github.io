import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const PYTHON_VERSION = '3.12.15'
export const SETUP_UV_ACTION = 'astral-sh/setup-uv@c771a70e6277c0a99b617c7a806ffedaca235ff9'
export const UV_VERSION = '0.11.30'

const expectedGroupPins = {
  audit: ['pip-audit==2.10.1'],
  test: ['httpx==0.28.1', 'SQLAlchemy==2.0.51', 'sqlmodel==0.0.39'],
}

function requireToken(source, token, failure, failures) {
  if (!source.includes(token)) failures.push(failure)
}

function normalizedPins(lines) {
  return lines
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('-r '))
    .map((line) => line.toLowerCase())
    .sort()
}

function groupPins(pyproject, group) {
  const match = pyproject.match(new RegExp(`^${group} = \\[\\n([\\s\\S]*?)^\\]$`, 'm'))
  return match ? normalizedPins([...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1])) : []
}

export function verifyPythonDependencyContract({
  pyproject,
  uvLock,
  requirements,
  requirementsTest,
  workflows,
}) {
  const failures = []
  const runtimePins = normalizedPins(requirements.split(/\r?\n/))
  const projectPins = normalizedPins(
    [...(pyproject.match(/^dependencies = \[\n([\s\S]*?)^\]$/m)?.[1] ?? '').matchAll(/"([^"]+)"/g)]
      .map((entry) => entry[1]),
  )
  if (JSON.stringify(runtimePins) !== JSON.stringify(projectPins)) {
    failures.push('runtime_requirements_and_pyproject_drift')
  }

  const testPins = normalizedPins(requirementsTest.split(/\r?\n/))
  if (JSON.stringify(testPins) !== JSON.stringify(normalizedPins(expectedGroupPins.test))) {
    failures.push('test_requirements_not_exact_expected_pins')
  }
  for (const [group, pins] of Object.entries(expectedGroupPins)) {
    if (JSON.stringify(groupPins(pyproject, group)) !== JSON.stringify(normalizedPins(pins))) {
      failures.push(`${group}_dependency_group_missing_or_drifted`)
    }
    for (const pin of pins) {
      const [name, version] = pin.toLowerCase().split('==')
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (!new RegExp(`^name = "${escapedName}"\\nversion = "${escapedVersion}"$`, 'm').test(uvLock.toLowerCase())) {
        failures.push(`${group}_direct_pin_missing_from_uv_lock:${name}`)
      }
    }
  }
  requireToken(uvLock, '[package.metadata.requires-dev]', 'uv_lock_dependency_groups_missing', failures)

  for (const [name, source] of Object.entries(workflows)) {
    requireToken(source, `python-version: '${PYTHON_VERSION}'`, `${name}_python_patch_not_pinned`, failures)
    requireToken(source, `uses: ${SETUP_UV_ACTION}`, `${name}_setup_uv_action_not_pinned`, failures)
    requireToken(source, `version: '${UV_VERSION}'`, `${name}_uv_version_not_pinned`, failures)
    requireToken(source, 'enable-cache: true', `${name}_uv_cache_not_enabled`, failures)
    requireToken(source, 'cache-dependency-glob: uv.lock', `${name}_uv_cache_not_keyed_to_lock`, failures)
    requireToken(source, 'uv lock --check', `${name}_uv_lock_freshness_check_missing`, failures)
    if (/\bpip\s+install\b/.test(source)) failures.push(`${name}_unlocked_pip_install_present`)
  }

  for (const name of ['appCi', 'coordinatedRelease', 'publicRelease']) {
    requireToken(workflows[name], 'uv sync --frozen --group test', `${name}_frozen_test_sync_missing`, failures)
    requireToken(
      workflows[name],
      'uv run --frozen --group test python -m unittest',
      `${name}_frozen_test_run_missing`,
      failures,
    )
  }
  requireToken(
    workflows.security,
    'uv sync --frozen --group test --group audit',
    'security_frozen_audit_sync_missing',
    failures,
  )
  requireToken(
    workflows.security,
    'uv run --frozen --group test --group audit pip-audit --local --skip-editable',
    'security_locked_environment_audit_missing',
    failures,
  )
  for (const triggerPath of ['pyproject.toml', 'uv.lock']) {
    requireToken(
      workflows.coordinatedRelease,
      `- '${triggerPath}'`,
      `coordinated_release_${triggerPath.replace('.', '_')}_trigger_missing`,
      failures,
    )
  }

  return {
    ok: failures.length === 0,
    contract: 'supermega.python-dependency-reproducibility.v1',
    pythonVersion: PYTHON_VERSION,
    uvVersion: UV_VERSION,
    groups: expectedGroupPins,
    failures,
  }
}

async function loadContractInputs() {
  const paths = {
    pyproject: 'pyproject.toml',
    uvLock: 'uv.lock',
    requirements: 'requirements.txt',
    requirementsTest: 'requirements-test.txt',
  }
  const workflows = {
    appCi: '.github/workflows/showroom-ci.yml',
    security: '.github/workflows/dependency-security.yml',
    coordinatedRelease: '.github/workflows/supermega-app-deploy.yml',
    publicRelease: '.github/workflows/supermega-public-release.yml',
  }
  return {
    ...Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([name, path]) => [name, await readFile(path, 'utf8')]))),
    workflows: Object.fromEntries(
      await Promise.all(Object.entries(workflows).map(async ([name, path]) => [name, await readFile(path, 'utf8')])),
    ),
  }
}

async function main() {
  const result = verifyPythonDependencyContract(await loadContractInputs())
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
