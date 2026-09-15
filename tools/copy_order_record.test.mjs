import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const source = readFileSync(new URL('../showroom/src/core/copy-order-record.ts', import.meta.url), 'utf8')
const { copyOrderRecordText } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)

test('copy confirms success only after the exact record is written', async () => {
  let value
  const result = await copyOrderRecordText('Synthetic order record', { writeText: async text => { value = text } })
  assert.equal(value, 'Synthetic order record')
  assert.equal(result, 'Order record copied.')
})

test('denied and missing clipboard return actionable feedback, not an unhandled error', async () => {
  for (const clipboard of [undefined, { writeText: async () => { throw new Error('private browser detail') } }]) {
    const result = await copyOrderRecordText('Synthetic order record', clipboard)
    assert.match(result, /^Could not copy\./)
    assert.match(result, /use Print order record to save a copy\./)
    assert.doesNotMatch(result, /Print receipt/)
    assert.doesNotMatch(result, /private browser detail/)
  }
})

test('dialog announces the result only for the acknowledgement that was copied', () => {
  const dialog = readFileSync(new URL('../showroom/src/core/ReceiptDialog.tsx', import.meta.url), 'utf8')
  assert.match(dialog, /aria-live="polite" role="status"/)
  assert.match(dialog, /copyResult\?\.record === ack \? copyResult.notice : ''/)
  assert.match(dialog, /bi\('Print order record'\)/)
  assert.doesNotMatch(dialog, /bi\('Print receipt'\)/)
})

test('active and archived orders open the same honestly labelled order record', () => {
  const core = readFileSync(new URL('../showroom/src/core/CoreApp.tsx', import.meta.url), 'utf8')
  const viewAction = core.split('\n').find(line => line.includes('data-order-receipt="view"'))
  assert.ok(viewAction?.includes('>View order record</button>'), 'shared view action names the order record')
  assert.doesNotMatch(core, />View receipt<\/button>/)
  assert.match(core, /onViewReceipt\(acknowledgement\.artifact\)/)
})
