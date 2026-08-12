import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')

test('app Vercel generator emits zero crons and a bounded Python function', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'supermega-vercel-config-'))
  try {
    await mkdir(join(workspace, 'tools'))
    for (const file of ['write_app_vercel_config.mjs', 'scheduler_authority_contract.mjs', 'supermega_scheduler_authority.json']) {
      await copyFile(resolve(root, 'tools', file), join(workspace, 'tools', file))
    }
    const result = spawnSync(process.execPath, [join(workspace, 'tools', 'write_app_vercel_config.mjs')], {
      cwd: workspace,
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    const config = JSON.parse(await readFile(join(workspace, 'vercel.json'), 'utf8'))
    const project = JSON.parse(await readFile(join(workspace, '.vercel', 'project.json'), 'utf8'))
    assert.equal(config.functions['api/app.py'].maxDuration, 60)
    assert.equal(config.functions['api/app.py'].includeFiles, '{supermega_runtime/**,hq/readiness/managed-pilot-readiness.json}')
    assert.deepEqual(config.crons, [])
    assert.equal(config.git.deploymentEnabled, false)
    assert.equal(project.projectName, 'megaos')
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})
