import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

for (const github of [true, false]) test(`runner failure annotation is metadata-only (GitHub=${github})`, () => {
  const root = mkdtempSync(join(tmpdir(), 'supermega-runner-'))
  try {
    mkdirSync(join(root, 'tools'))
    copyFileSync(new URL('./run_app_verify.mjs', import.meta.url), join(root, 'tools/run_app_verify.mjs'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { 'app:verify:steps': 'node failure.mjs' } }))
    writeFileSync(join(root, 'failure.mjs'), "console.error('SYNTHETIC_PRIVATE_PAYLOAD'); process.exit(7)")
    const result = spawnSync(process.execPath, [join(root, 'tools/run_app_verify.mjs'), '--serial'], {
      encoding: 'utf8', timeout: 15000, windowsHide: true,
      env: { ...process.env, GITHUB_ACTIONS: String(github) },
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /"failedStep":"node failure.mjs","stepIndex":1,"totalSteps":1/)
    const annotations = result.stderr.split(/\r?\n/).filter(line => line.startsWith('::error '))
    assert.deepEqual(annotations, github ? ['::error title=Canonical verification failed::Step 1/1: node failure.mjs'] : [])
    assert.ok(annotations.every(line => !line.includes('SYNTHETIC_PRIVATE_PAYLOAD')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
