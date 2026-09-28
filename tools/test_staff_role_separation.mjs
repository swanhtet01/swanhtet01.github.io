import assert from 'node:assert/strict'
import test from 'node:test'
import { STAFF_ROLES, buildRequiredAuthority, canPerformWrite } from '../showroom/src/core/enterprise-staff-roles.ts'

test('all role pairs use explicit job-family inheritance, never numeric rank', () => {
  const inherited = { 'shop-supervisor': ['cashier', 'fulfiller', 'stock-manager'], 'plant-supervisor': ['plant-operator', 'quality-inspector'] }
  for (const actor of STAFF_ROLES) for (const target of STAFF_ROLES) {
    const expected = actor === 'owner' || (actor === 'admin' && target !== 'owner') || actor === target || (inherited[actor] ?? []).includes(target)
    assert.equal(canPerformWrite(actor, buildRequiredAuthority(target)), expected, actor + ' -> ' + target)
  }
})
test('unknown actor or required role fails closed even for owner', () => {
  assert.equal(canPerformWrite('unknown', buildRequiredAuthority('cashier')), false)
  assert.equal(canPerformWrite('owner', { ...buildRequiredAuthority('cashier'), minimumRole: 'unknown' }), false)
})
