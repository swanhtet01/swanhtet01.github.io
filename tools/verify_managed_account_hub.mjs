#!/usr/bin/env node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const fixture = mkdtempSync(join(tmpdir(), 'supermega-account-hub-fixture-'))

function run(arguments_, environment = process.env) {
  const result = spawnSync(process.execPath, arguments_, {
    cwd: process.cwd(),
    env: environment,
    encoding: 'utf8',
    windowsHide: true,
  })
  process.stdout.write(result.stdout || '')
  process.stderr.write(result.stderr || '')
  if (result.error || result.status !== 0) process.exitCode = result.status || 1
  return process.exitCode === undefined
}

try {
  if (run(['tools/build_managed_account_hub_fixture.mjs', fixture])) {
    run(['--test', 'tools/managed_account_hub_visual.test.mjs'], {
      ...process.env,
      SUPERMEGA_ACCOUNT_HUB_FIXTURE: fixture,
    })
  }
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
