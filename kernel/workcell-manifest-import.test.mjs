import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import vm from 'node:vm'

async function loadParser() {
  const source = await readFile(new URL('./public/workcell-manifest-import.js', import.meta.url), 'utf8')
  const context = vm.createContext({ Intl, Date, JSON, Object, Set, Error, Number, String })
  vm.runInContext(source, context, { filename: 'workcell-manifest-import.js' })
  return context.SuperMegaManifestImport.parseActivationManifest
}

function manifest(workcell = 'cash-close') {
  return {
    version: 1,
    clientSlug: 'acme-trading',
    clientName: 'Acme Trading',
    clientId: 'workcell-acme-trading',
    projectName: 'supermega-wc-acme-trading',
    workcells: [workcell],
    timeZone: 'Asia/Yangon',
    currency: 'MMK',
    lookbackHours: 24,
    clickupListId: workcell === 'cash-close' ? '' : '123456789',
    deliveryUtc: '01:30',
    tokenCap: 150000,
  }
}

test('browser manifest parser accepts each fixed workcell without credential values', async () => {
  const parse = await loadParser()
  for (const workcell of ['cash-close', 'pipeline-control', 'owner-command']) {
    const parsed = parse(JSON.stringify(manifest(workcell)))
    assert.equal(parsed.workcells[0], workcell)
    assert.equal(parsed.clientId, 'workcell-acme-trading')
    assert.equal(parsed.projectName, 'supermega-wc-acme-trading')
    assert.equal(parsed.tokenCap, 150000)
    assert.equal(Object.hasOwn(parsed, 'credentials'), false)
    assert.equal(Object.hasOwn(parsed, 'secrets'), false)
  }
})

test('browser manifest parser derives canonical optional identifiers', async () => {
  const parse = await loadParser()
  const input = manifest('cash-close')
  delete input.clientId
  delete input.projectName
  const parsed = parse(input)
  assert.equal(parsed.clientId, 'workcell-acme-trading')
  assert.equal(parsed.projectName, 'supermega-wc-acme-trading')
})

test('browser manifest parser accepts an incomplete ClickUp handoff for operator completion', async () => {
  const parse = await loadParser()
  for (const workcell of ['pipeline-control', 'owner-command']) {
    const parsed = parse({ ...manifest(workcell), clickupListId: '' })
    assert.equal(parsed.workcells[0], workcell)
    assert.equal(parsed.clickupListId, '')
  }
})

test('browser manifest parser rejects wrappers, secret fields, and boundary changes', async () => {
  const parse = await loadParser()
  assert.throws(() => parse({ manifest_draft: manifest() }), /manifest_unexpected_field:manifest_draft/)
  assert.throws(() => parse({ ...manifest(), credentials: { token: 'secret' } }), /manifest_unexpected_field:credentials/)
  assert.throws(() => parse({ ...manifest(), apiKey: 'secret' }), /manifest_unexpected_field:apiKey/)
  assert.throws(() => parse({ ...manifest(), projectName: 'shared-console' }), /manifest_project_name_mismatch/)
  assert.throws(() => parse({ ...manifest(), clientId: 'other-client' }), /manifest_client_id_mismatch/)
  assert.throws(() => parse({ ...manifest(), workcells: ['cash-close', 'owner-command'] }), /manifest_one_workcell_required/)
  assert.throws(() => parse({ ...manifest(), workcells: ['invented'] }), /manifest_unknown_workcell:invented/)
  assert.throws(() => parse({ ...manifest('pipeline-control'), clickupListId: '../other-list' }), /manifest_invalid_clickup_list_id/)
  assert.throws(() => parse({ ...manifest(), clientName: 'Acme\u001b[2J' }), /manifest_client_name_required/)
  assert.throws(() => parse('{broken'), /manifest_json_invalid/)
})

test('browser manifest parser rejects values the server would normalize unexpectedly', async () => {
  const parse = await loadParser()
  assert.throws(() => parse({ ...manifest(), timeZone: 'Mars/Olympus' }), /manifest_invalid_time_zone/)
  assert.throws(() => parse({ ...manifest(), lookbackHours: 999 }), /manifest_invalid_lookback_hours/)
  assert.throws(() => parse({ ...manifest(), tokenCap: 1 }), /manifest_invalid_token_cap/)
  assert.throws(() => parse({ ...manifest(), deliveryUtc: '25:00' }), /manifest_invalid_delivery_utc/)
})
