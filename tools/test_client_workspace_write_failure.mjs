import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { initializeClientWorkspace } from './prepare_client_demo.mjs'

test('interrupted initialization reports failure and retry preserves partial files', async () => {
  const parent = await fs.mkdtemp(resolve(tmpdir(), 'supermega-write-failure-'))
  const directory = resolve(parent, 'workspace')
  const originalOpen = fs.open
  let writes = 0
  try {
    fs.open = async (path, flags, ...rest) => {
      if (flags === 'wx' && String(path).startsWith(directory)) {
        writes++
        if (writes === 2) throw Object.assign(new Error('Synthetic disk full'), { code: 'ENOSPC' })
      }
      return originalOpen(path, flags, ...rest)
    }
    syncBuiltinESMExports()
    await assert.rejects(initializeClientWorkspace({ directory, presetId: 'retail-network', products: ['commerce'] }), /client_workspace_init_write_failed/)
    fs.open = originalOpen
    syncBuiltinESMExports()
    assert.equal(writes, 2)
    const profile = await fs.readFile(resolve(directory, 'client.json'), 'utf8')
    assert.equal(JSON.parse(profile).schema, 'supermega.client_profile.v1')
    assert.deepEqual(await fs.readdir(resolve(directory, '_templates')), [])
    await assert.rejects(fs.stat(resolve(directory, 'START-HERE.md')), { code: 'ENOENT' })
    await assert.rejects(initializeClientWorkspace({ directory, presetId: 'retail-network', products: ['commerce'] }), /client_workspace_init_exists/)
    assert.equal(await fs.readFile(resolve(directory, 'client.json'), 'utf8'), profile)
  } finally {
    fs.open = originalOpen
    syncBuiltinESMExports()
    assert.ok(parent.startsWith(resolve(tmpdir()) + '\\') || parent.startsWith(resolve(tmpdir()) + '/'))
    await fs.rm(parent, { recursive: true, force: true })
  }
})
