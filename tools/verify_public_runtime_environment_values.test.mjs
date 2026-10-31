import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { evaluate } from './verify_public_runtime_environment_values.mjs'

const supabaseOrigin = 'https://zvtzwcimpvvtkowflhda.supabase.co'
const webhookOrigin = 'https://lead-router.example.test'
const configured = {
  SUPABASE_URL: supabaseOrigin,
  SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-role-value',
  SUPERMEGA_EXPECTED_PUBLIC_SUPABASE_ORIGIN: supabaseOrigin,
  SUPERMEGA_LEAD_WEBHOOK_URL: `${webhookOrigin}/events`,
  SUPERMEGA_LEAD_WEBHOOK_SECRET: 'test-only-webhook-secret',
  SUPERMEGA_EXPECTED_LEAD_WEBHOOK_ORIGIN: webhookOrigin,
}

test('accepts disabled optional destinations without exposing secrets', () => {
  assert.deepEqual(evaluate({}), {
    ok: true,
    contract: 'supermega.public-runtime-environment-values.v1',
    supabaseDeliveryConfigured: false,
    supabaseOriginBound: false,
    webhookDeliveryConfigured: false,
    webhookOriginBound: false,
    secretValuesExposed: false,
    failures: [],
  })
})

test('accepts source-bound Supabase and explicitly approved webhook origins', () => {
  const result = evaluate(configured)
  assert.equal(result.ok, true)
  assert.equal(result.supabaseOriginBound, true)
  assert.equal(result.webhookOriginBound, true)
  assert.equal(JSON.stringify(result).includes('test-only'), false)
  assert.equal(JSON.stringify(result).includes('lead-router'), false)

  const publicMappedOrigin = 'https://[::ffff:808:808]'
  const publicMapped = evaluate({
    SUPERMEGA_LEAD_WEBHOOK_URL: `${publicMappedOrigin}/events`,
    SUPERMEGA_EXPECTED_LEAD_WEBHOOK_ORIGIN: publicMappedOrigin,
  })
  assert.equal(publicMapped.ok, true)
  assert.equal(publicMapped.webhookOriginBound, true)
})

test('requires complete Supabase delivery and the source-bound expected origin', () => {
  assert.ok(evaluate({ SUPABASE_URL: supabaseOrigin }).failures.includes('public_supabase_delivery_incomplete'))
  assert.ok(evaluate({ SUPABASE_SERVICE_ROLE_KEY: 'hidden' }).failures.includes('public_supabase_delivery_incomplete'))
  assert.ok(evaluate({ ...configured, SUPERMEGA_EXPECTED_PUBLIC_SUPABASE_ORIGIN: '' }).failures.includes('public_supabase_expected_origin_invalid'))
  assert.ok(evaluate({ ...configured, SUPERMEGA_EXPECTED_PUBLIC_SUPABASE_ORIGIN: 'https://other.supabase.co' }).failures.includes('public_supabase_expected_origin_invalid'))
  assert.ok(evaluate({ ...configured, SUPABASE_URL: 'https://other.supabase.co' }).failures.includes('public_supabase_target_invalid'))
})

test('rejects unsafe Supabase URLs without echoing their values', () => {
  for (const value of [
    'http://zvtzwcimpvvtkowflhda.supabase.co',
    'https://user:password@zvtzwcimpvvtkowflhda.supabase.co',
    `${supabaseOrigin}/rest/v1`,
    `${supabaseOrigin}?redirect=https://example.test`,
    `${supabaseOrigin}#fragment`,
    'not-a-url',
  ]) {
    const result = evaluate({ ...configured, SUPABASE_URL: value })
    assert.equal(result.ok, false)
    assert.ok(result.failures.includes('public_supabase_target_invalid'))
    assert.equal(JSON.stringify(result).includes(value), false)
  }
})

test('requires an approved webhook origin and rejects secret orphaning', () => {
  assert.ok(evaluate({ SUPERMEGA_LEAD_WEBHOOK_SECRET: 'hidden' }).failures.includes('public_webhook_secret_without_target'))
  assert.ok(evaluate({ ...configured, SUPERMEGA_EXPECTED_LEAD_WEBHOOK_ORIGIN: '' }).failures.includes('public_webhook_expected_origin_invalid'))
  assert.ok(evaluate({ ...configured, SUPERMEGA_EXPECTED_LEAD_WEBHOOK_ORIGIN: 'https://other.example.test' }).failures.includes('public_webhook_target_invalid'))
})

test('rejects unsafe, private, and ambiguous webhook destinations', () => {
  for (const value of [
    'http://lead-router.example.test/events',
    'https://user:password@lead-router.example.test/events',
    'https://lead-router.example.test:8443/events',
    'https://lead-router.example.test/events?token=hidden',
    'https://lead-router.example.test/events#fragment',
    'https://localhost/events',
    'https://service.local/events',
    'https://invalid_host.example/events',
    'https://127.0.0.1/events',
    'https://10.0.0.1/events',
    'https://169.254.169.254/latest/meta-data',
    'https://172.16.0.1/events',
    'https://192.168.1.1/events',
    'https://[::1]/events',
    'https://[fd00::1]/events',
    'https://[::ffff:0:1]/events',
    'https://[::ffff:7f00:1]/events',
    'https://[::ffff:a00:1]/events',
    'https://[::ffff:a9fe:a9fe]/events',
    'https://[::ffff:ac10:1]/events',
    'https://[::ffff:c0a8:1]/events',
    'not-a-url',
  ]) {
    const result = evaluate({
      ...configured,
      SUPERMEGA_LEAD_WEBHOOK_URL: value,
      SUPERMEGA_EXPECTED_LEAD_WEBHOOK_ORIGIN: (() => {
        try { return new URL(value).origin } catch { return webhookOrigin }
      })(),
    })
    assert.equal(result.ok, false, value)
    assert.ok(result.failures.some((failure) => failure.startsWith('public_webhook_')), value)
    assert.equal(JSON.stringify(result).includes(value), false)
  }
})

test('production release verifies effective public values before building', async () => {
  const workflow = await readFile(resolve(import.meta.dirname, '..', '.github', 'workflows', 'supermega-public-release.yml'), 'utf8')
  const metadataGate = workflow.indexOf('node tools/verify_vercel_environment_state.mjs public')
  const valueGate = workflow.indexOf('node tools/verify_public_runtime_environment_values.mjs')
  const publicBuild = workflow.indexOf('npm run public:prebuilt')
  assert.ok(metadataGate >= 0)
  assert.ok(valueGate > metadataGate)
  assert.ok(publicBuild > valueGate)
  assert.match(workflow, /vercel@56\.1\.0 env run --environment=production/)
  assert.match(workflow, /SUPERMEGA_EXPECTED_PUBLIC_SUPABASE_ORIGIN="\$EXPECTED_SUPABASE_ORIGIN"/)
  assert.match(workflow, /vars\.SUPERMEGA_APPROVED_LEAD_WEBHOOK_ORIGIN/)
})
