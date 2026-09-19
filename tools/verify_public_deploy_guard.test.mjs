import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const root = process.cwd()
const source = readFileSync(resolve(root, 'tools/verify_public_deploy_guard.mjs'), 'utf8')
  .replace(/^import .* from 'node:(?:fs|path)'\r?\n/gm, '')

function evaluate(transform = value => value) {
  const output = []
  const stopped = new Error('guard_exit')
  let exitCode = 0
  const capture = value => output.push(JSON.parse(value))
  try {
    runInNewContext(source, {
      existsSync, readdirSync, resolve,
      readFileSync(path, encoding) {
        const value = readFileSync(path, encoding)
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
