import test from 'node:test'
import assert from 'node:assert/strict'
import { productionEntryDecision } from '../showroom/src/core/production-entry.ts'

test('public app hosts never fall back to local workspaces', () => {
  for (const host of ['app.supermega.dev', 'megaos.vercel.app']) {
    for (const status of ['local', 'reauthenticate', 'error', 'unknown']) {
      assert.equal(productionEntryDecision(host, false, status), 'login')
    }
    assert.equal(productionEntryDecision(host, false, 'checking'), 'checking')
    assert.equal(productionEntryDecision(host, false, 'ready'), 'continue')
  }
})

test('login and recovery remain reachable without a redirect loop', () => {
  for (const status of ['local', 'checking', 'reauthenticate', 'error']) {
    assert.equal(productionEntryDecision('app.supermega.dev', true, status), 'continue')
  }
})

test('local development and isolated acceptance hosts remain usable', () => {
  for (const host of ['localhost', '127.0.0.1', 'candidate.vercel.app']) {
    assert.equal(productionEntryDecision(host, false, 'local'), 'continue')
  }
})
