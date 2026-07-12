// Locks the crew-forge guarantee: buildCrewFromSpec must ALWAYS emit a crew that passes validateCrew
// (so the registry loads it + runCrew executes it) — for any spec, including empty and garbage input.
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCrewFromSpec } from './crew-forge.mjs'
import { validateCrew } from './crew-runner.mjs'

const specs = [
  { name: 'Chase the Money', requires_account_access: true, intake: { accepts: ['viber export'] }, roles: [{ title: 'extractor', tier: 'bulk', goal: 'pull unpaid balances' }, { title: 'drafter', tier: 'reason', goal: 'draft reminders' }], outputs: ['unpaid', 'drafts', 'brief'] },
  { name: 'Daily Brief', roles: ['reader', 'ranker'], outputs: ['headline', 'actions'] },
  { name: 'Quick Summary' },
  {},
  { name: '!!!', roles: [{ tier: 'nonsense' }], outputs: ['a b c', '', 123] },
]

test('crew forge compiles every spec to a valid, runnable crew', () => {
  for (const s of specs) {
    const { crew, validation } = buildCrewFromSpec(s)
    assert.equal(validation.ok, true, `spec ${s.name || '(empty)'} → invalid: ${validation.errors.join('; ')}`)
    assert.equal(crew.roles[0].id, 'intake', 'the generic INTAKE role must be first')
    assert.equal(validateCrew(crew, { slug: crew.slug }).length, 0)
    assert.ok(crew.output_contract.fields.length > 0)
  }
})

test('account-reading crews auto-wire the legal bright line', () => {
  const { crew, validation } = buildCrewFromSpec({ name: 'Reader', requires_account_access: true })
  assert.equal(validation.ok, true)
  assert.equal(crew.policy.own_accounts_only, true)
  assert.equal(crew.policy.skip_personal, true)
  assert.equal(crew.policy.read_only, true)
})
