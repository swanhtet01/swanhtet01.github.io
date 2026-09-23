import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const root = process.cwd()
const source = readFileSync(resolve(root, 'tools/verify_public_deploy_guard.mjs'), 'utf8')
  .replace(/^import .* from 'node:(?:fs|path)'\r?\n/gm, '')

function evaluate(transform = value => value, sourceTransforms = {}) {
  const output = []
  const stopped = new Error('guard_exit')
  let exitCode = 0
  const capture = value => output.push(JSON.parse(value))
  try {
    runInNewContext(source, {
      existsSync, readdirSync, resolve,
      readFileSync(path, encoding) {
        let value = readFileSync(path, encoding)
        for (const [relativePath, transformSource] of Object.entries(sourceTransforms)) {
          if (resolve(path) === resolve(root, relativePath)) value = transformSource(value)
        }
        if (resolve(path) !== resolve(root, 'package.json')) return value
        const pkg = JSON.parse(value)
        pkg.scripts['public:verify'] = transform(pkg.scripts['public:verify'])
        return JSON.stringify(pkg)
      },
      process: { cwd: () => root, exit(code) { exitCode = code; throw stopped } },
      console: { log: capture, error: capture },
    }, { timeout: 5000 })
  } catch (error) {
    if (error !== stopped) throw error
  }
  return { exitCode, report: output.at(-1) }
}

test('current exact public verification chain passes the actual guard', () => {
  const result = evaluate()
  assert.equal(result.exitCode, 0)
  assert.equal(result.report.ok, true)
})

for (const command of [
  'node --test --test-concurrency=1 tools/verify_public_release_live.test.mjs',
  'node --test tools/test_public_contact_receipt.mjs',
  'node tools/verify_public_vercel_artifact_budget.mjs',
  'npm run hq:verify',
]) {
  test(`removing ${command} remains blocked`, () => {
    const result = evaluate(value => value.split(' && ').filter(part => part !== command).join(' && '))
    assert.equal(result.exitCode, 1)
    assert.equal(result.report.ok, false)
    assert.ok(result.report.failures.includes('package_script_drift:public:verify'))
  })
}

for (const [path, token, failure] of [
  ['tools/verify_public_preview_live.mjs', 'validatePreviewContact(contact, policy)', 'preview_contact_readiness_not_verified'],
  ['tools/public_preview_profile.mjs', 'contact.accepting !== accepting', 'preview_contact_policy_missing'],
  ['tools/public_preview_profile.mjs', "contact.status !== (accepting ? 'ready' : 'attention')", 'preview_contact_policy_missing'],
  ['tools/public_preview_profile.mjs', "contact.controls?.idempotency !== 'required'", 'preview_contact_policy_missing'],
  ['tools/public_preview_profile.mjs', "contact.controls?.edge_rate_limit !== 'required'", 'preview_contact_policy_missing'],
  ['tools/verify_public_preview_live.mjs', 'validatePreviewLinks(homepage, policy, manifest.customerProducts, linkOptions)', 'preview_navigation_consumer_missing'],
  ['tools/verify_public_preview_live.mjs', 'validatePreviewLinks(html, policy, manifest.customerProducts,', 'preview_navigation_consumer_missing'],
  ['tools/public_preview_profile.mjs', 'public_preview_production_escape', 'preview_navigation_policy_missing'],
  ['tools/public_preview_profile.mjs', 'public_preview_retired_entry', 'preview_navigation_policy_missing'],
  ['tools/public_preview_profile.mjs', 'public_preview_app_route_invalid', 'preview_navigation_policy_missing'],
  ['tools/public_preview_profile.mjs', 'public_preview_action_missing', 'preview_navigation_policy_missing'],
  ['tools/verify_public_release_live.mjs', 'homepage_shop_action_missing', 'live_navigation_contract_missing'],
  ['tools/verify_public_release_live.mjs', 'guided_product_route_missing', 'live_navigation_contract_missing'],
  ['tools/verify_public_release_live.mjs', 'retired_product_marketed', 'live_navigation_contract_missing'],
]) {
  test(`removing ${token} remains blocked`, () => {
    const result = evaluate(value => value, { [path]: value => {
      assert.ok(value.includes(token), 'adversarial mutation must match current source')
      return value.replaceAll(token, 'REMOVED_CONTRACT')
    } })
    assert.equal(result.exitCode, 1)
    assert.ok(result.report.failures.some(value => value.startsWith(failure)))
  })
}
