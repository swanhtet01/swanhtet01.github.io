import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const { build } = await import(pathToFileURL(require.resolve('esbuild')).href)
const bundled = await build({ entryPoints: ['showroom/src/core/local-workspace-backup.ts'], bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' })
const { collectLocalWorkspaceBackup, restoreLocalWorkspaceBackup, applyLocalWorkspaceBackup } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`)

function memoryStorage(initial, rejectWrite = () => false) {
  const records = new Map(Object.entries(initial))
  return {
    records,
    get length() { return records.size },
    key: index => [...records.keys()][index] ?? null,
    getItem: key => records.get(key) ?? null,
    removeItem: key => records.delete(key),
    setItem: (key, value) => {
      if (rejectWrite(key, value)) throw new Error('synthetic_storage_write_failure')
      records.set(key, value)
    },
  }
}
const fixture = collectLocalWorkspaceBackup(memoryStorage({ 'supermega.website.leads.v1': '[]', 'supermega.behavior-trail.v1': '[]' }))
assert.ok(fixture && Object.keys(fixture.records).length === 2)
// Optional exact local download supplied by the operator. No browser or disk state is written.
const selected = process.env.SUPERMEGA_BACKUP_TEST_FILE
  ? restoreLocalWorkspaceBackup(JSON.parse(readFileSync(process.env.SUPERMEGA_BACKUP_TEST_FILE, 'utf8')))
  : fixture
assert.ok(selected, 'selected backup must pass the shipping parser')

test('download JSON round trips exact registered records and preserves unrelated keys', async () => {
  const backup = restoreLocalWorkspaceBackup(JSON.parse(JSON.stringify(selected)))
  assert.ok(backup)
  const target = memoryStorage({ 'unrelated.preference': 'keep', 'supermega.website.leads.v1': '[{"synthetic":"old"}]' })
  await applyLocalWorkspaceBackup(target, backup)
  assert.deepEqual(collectLocalWorkspaceBackup(target).records, backup.records)
  assert.equal(target.getItem('unrelated.preference'), 'keep')
})

test('unregistered file contents are rejected without changing the target', async () => {
  const target = memoryStorage({ 'unrelated.preference': 'keep', 'supermega.website.leads.v1': '[]' })
  const before = [...target.records]
  const bad = { ...selected, records: { ...selected.records, 'unregistered.private.key': '{}' } }
  assert.equal(restoreLocalWorkspaceBackup(bad), null)
  await assert.rejects(applyLocalWorkspaceBackup(target, bad), /invalid or too large/)
  assert.deepEqual([...target.records], before)
})

test('a failed incoming write rolls back the original registered data', async () => {
  for (const failureAt of [1, 2]) {
    let writes = 0
    const original = { 'unrelated.preference': 'keep', 'supermega.website.leads.v1': '[{"synthetic":"original"}]' }
    const target = memoryStorage(original, () => ++writes === failureAt)
    const incoming = Object.keys(selected.records).length >= 2 ? selected : fixture
    await assert.rejects(applyLocalWorkspaceBackup(target, incoming), /synthetic_storage_write_failure/)
    assert.ok(writes > failureAt, 'rollback writes were attempted after the injected failure')
    assert.deepEqual(Object.fromEntries(target.records), original)
  }
})
