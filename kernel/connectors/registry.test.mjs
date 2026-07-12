// Registry resilience: one malformed connector must not crash the fleet. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register, get, registrationErrors } from './registry.mjs'

test('register skips a malformed connector (records it, does not throw)', () => {
  const before = registrationErrors.length
  const r = register({ key: 'bad-cat', name: 'Bad', category: 'NOPE', configured: () => true, health: async () => ({ ok: true }) })
  assert.equal(r, null, 'a bad connector returns null instead of throwing')
  assert.equal(registrationErrors.length, before + 1, 'the failure is recorded')
  assert.match(registrationErrors.at(-1).detail, /bad_category/)
})

test('a valid connector still registers after a bad one (fleet survives)', () => {
  const good = register({ key: 'good-one', name: 'Good', category: 'data', configured: () => true, health: async () => ({ ok: true }) })
  assert.ok(good, 'valid connector registers')
  assert.equal(get('good-one')?.key, 'good-one')
})
