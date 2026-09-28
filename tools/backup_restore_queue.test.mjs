import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const { build } = await import(pathToFileURL(require.resolve('esbuild')).href)
const bundle = await build({ stdin: {
  contents: `export * from './local-workspace-backup.ts'; export * from './company-backup.ts'`,
  resolveDir: 'showroom/src/core', loader: 'ts',
}, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' })
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text + '\n//# sourceURL=backup-queue-bundle.mjs').toString('base64')}`)
const commerce = 'supermega-commerce-workspace-v2'
const production = 'supermega-production-workspace-v2'
const key = 'supermega.commerce.workspace.v2'
function storage(value, failIncoming) {
  const values = new Map([[key, value]])
  return {
    get length() { return values.size }, key: i => [...values.keys()][i] ?? null,
    getItem: k => values.get(k) ?? null, removeItem: k => values.delete(k),
    setItem(k, v) { if (failIncoming && v === '{"state":"incoming"}') throw new Error('synthetic_failure'); values.set(k, v) },
  }
}
for (const format of ['local', 'encrypted']) {
  for (const fail of [false, true]) {
    test(`${format}: queued writer sees ${fail ? 'rolled-back' : 'restored'} state`, { timeout: 5000 }, async () => {
      const source = storage('{"state":"incoming"}', false)
      const target = storage('{"state":"original"}', fail)
      const payload = format === 'local' ? api.collectLocalWorkspaceBackup(source)
        : await api.inspectEncryptedCompanyBackup((await api.createEncryptedCompanyBackup(source, 'synthetic-test-passphrase-only')).json, 'synthetic-test-passphrase-only')
      const locks = globalThis.navigator.locks
      let releaseBlock, blockEntered, restoreWaiting
      const blocked = new Promise(resolve => { blockEntered = resolve })
      const released = new Promise(resolve => { releaseBlock = resolve })
      const waiting = new Promise(resolve => { restoreWaiting = resolve })
      const blocker = locks.request(production, { mode: 'exclusive' }, async () => { blockEntered(); await released })
      await blocked
      const observedLocks = { request(name, options, callback) {
        if (name === production) restoreWaiting()
        return locks.request(name, options, callback)
      } }
      const restore = (format === 'local' ? api.applyLocalWorkspaceBackup : api.restoreCompanyBackup)(target, payload, observedLocks)
      const settled = restore.then(() => null, error => error.message)
      try {
        await waiting
        let writerEntered = false
        const writer = locks.request(commerce, { mode: 'exclusive' }, async () => {
          writerEntered = true
          const seen = target.getItem(key)
          target.setItem(key, '{"state":"writer-after-restore"}')
          return seen
        })
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(writerEntered, false, 'writer entered while restore was waiting for its second lock')
        releaseBlock()
        assert.equal(await writer, fail ? '{"state":"original"}' : '{"state":"incoming"}')
        const error = await settled
        assert.equal(error !== null, fail)
        assert.equal(target.getItem(key), '{"state":"writer-after-restore"}')
      } finally { releaseBlock(); await blocker; await settled }
    })
  }
}
