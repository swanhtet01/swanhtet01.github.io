import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runnerPath = resolve(root, 'tools', 'run_local_app.mjs')
const [packageText, runnerSource, verificationRunnerSource, readme] = await Promise.all([
  readFile(resolve(root, 'package.json'), 'utf8'),
  readFile(runnerPath, 'utf8'),
  readFile(resolve(root, 'tools', 'run_app_verify.mjs'), 'utf8'),
  readFile(resolve(root, 'README.md'), 'utf8'),
])
const packageJson = JSON.parse(packageText)

const failures = []
const requireContract = (name, condition) => { if (!condition) failures.push(name) }
requireContract('dev command uses the canonical runner',
  packageJson.scripts?.dev === 'node tools/run_local_app.mjs')
requireContract('full-stack verification is part of app verification',
  packageJson.scripts?.['app:dev:verify'] === 'node tools/verify_local_app_dev.mjs'
  && packageJson.scripts?.['app:verify'] === 'node tools/run_app_verify.mjs --serial'
  && packageJson.scripts?.['app:verify:steps']?.includes('npm run app:dev:verify')
  && verificationRunnerSource.includes("pkg.scripts?.['app:verify:steps']")
  && verificationRunnerSource.includes('const failure = await runSerial(steps)'))
requireContract('runner starts the canonical runtime',
  runnerSource.includes("'supermega_runtime.runtime:app'")
  && runnerSource.includes("body?.service === 'supermega-service'"))
requireContract('runner proves ecommerce order queue validation through the app proxy',
  runnerSource.includes('/api/trial/v1/ecommerce/order-queue/validate')
  && runnerSource.includes("contract === 'supermega.ecommerce.order_queue_readiness_validation.v1'")
  && runnerSource.includes("payload.identity_authority === 'isolated_demo_untrusted_workspace'")
  && runnerSource.includes('payload.validation.external_writes_performed === false')
  && runnerSource.includes("forbiddenUntilReady: ['order_import']")
  && runnerSource.includes('response.status === 422'))
requireContract('runner proves ecommerce Shop queue import plan through the app proxy',
  runnerSource.includes('/api/trial/v1/ecommerce/order-queue/import-plan')
  && runnerSource.includes("contract === 'supermega.ecommerce.shop_queue_import_plan.v1'")
  && runnerSource.includes("payload.plan.status === 'ready_for_managed_apply'")
  && runnerSource.includes("payload.plan.target_adapter === 'shop_order_queue'")
  && runnerSource.includes("payload.identity_authority === 'isolated_demo_untrusted_workspace'")
  && runnerSource.includes('payload.plan.external_writes_performed === false')
  && runnerSource.includes('tamperedOrderQueueImportPlan.response.status === 422'))
requireContract('runner proves ecommerce Shop queue apply preflight is managed-auth only',
  runnerSource.includes('/api/trial/v1/ecommerce/order-queue/apply-preflight')
  && runnerSource.includes('orderQueueApplyPreflightUnauthorized.response.status === 401')
  && runnerSource.includes("String(payload?.detail ?? '').includes('trial_auth_required')")
  && runnerSource.includes('applyPreflightAuthRequired: orderQueueApplyPreflightUnauthorized.response.status === 401'))
requireContract('runner is loopback-only and connects Vite explicitly',
  runnerSource.includes("const loopbackHost = '127.0.0.1'")
  && runnerSource.includes('SUPERMEGA_LOCAL_API: apiUrl')
  && runnerSource.includes("'--strictPort'"))
requireContract('runner always isolates local authority',
  runnerSource.includes("SUPERMEGA_DATABASE_URL: ''")
  && runnerSource.includes("SUPERMEGA_TRIAL_WRITES_ENABLED: 'false'")
  && runnerSource.includes("SUPERMEGA_TRIAL_IDENTITY_SECRET: ''")
  && runnerSource.includes("SUPERMEGA_SUPABASE_URL: ''")
  && runnerSource.includes("OPENAI_API_KEY: ''")
  && runnerSource.includes("SUPERMEGA_CLOUD_TASKS_WORKER_URL: ''"))
requireContract('runner owns child cleanup',
  runnerSource.includes("state.child.kill('SIGTERM')")
  && runnerSource.includes("state.child.kill('SIGKILL')")
  && runnerSource.includes('await stopChild(uiState)')
  && runnerSource.includes('await stopChild(apiState)'))
requireContract('local command is documented',
  readme.includes('starts the canonical FastAPI runtime and Vite together')
  && readme.includes('managed writes remain disabled'))

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_local_full_stack', failures }, null, 2))
  process.exit(1)
}

if (process.env.VERCEL === '1') {
  console.log(JSON.stringify({
    ok: true,
    contract: 'supermega_local_full_stack',
    checks: 7,
    integration: 'skipped_in_vercel_build',
    reason: 'GitHub runs the isolated full-stack rehearsal; the coordinated release verifies the deployed API separately.',
  }, null, 2))
  process.exit(0)
}

async function reservePort() {
  const server = createServer()
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not reserve a local verification port.')
  return { port: address.port, server }
}

const apiReservation = await reservePort()
const uiReservation = await reservePort()
const apiPort = apiReservation.port
const uiPort = uiReservation.port
await Promise.all([
  new Promise((resolveClose) => apiReservation.server.close(resolveClose)),
  new Promise((resolveClose) => uiReservation.server.close(resolveClose)),
])

const child = spawn(
  process.execPath,
  [
    runnerPath,
    '--verify',
    '--api-port',
    String(apiPort),
    '--ui-port',
    String(uiPort),
  ],
  {
    cwd: root,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
)
let stdout = ''
let stderr = ''
child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-20_000) })
child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-20_000) })

let timedOut = false
const timeout = setTimeout(() => {
  timedOut = true
  child.kill('SIGTERM')
}, 45_000)
const result = await new Promise((resolveExit) => {
  child.once('error', (error) => resolveExit({ code: null, signal: null, error }))
  child.once('exit', (code, signal) => resolveExit({ code, signal, error: null }))
})
clearTimeout(timeout)

if (timedOut || result.error || result.code !== 0) {
  console.error(JSON.stringify({
    ok: false,
    contract: 'supermega_local_full_stack',
    failure: timedOut
      ? 'verification_timeout'
      : result.error?.message ?? `runner_exit_${result.code ?? result.signal ?? 'unknown'}`,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  }, null, 2))
  process.exit(1)
}

const reportLine = stdout.trim().split(/\r?\n/).findLast((line) => line.startsWith('{'))
let report
try {
  report = JSON.parse(reportLine ?? '')
} catch {
  console.error(JSON.stringify({
    ok: false,
    contract: 'supermega_local_full_stack',
    failure: 'runner_report_missing',
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  }, null, 2))
  process.exit(1)
}

requireContract('full stack reports the canonical proxied service',
  report.ok === true
  && report.contract === 'supermega_local_full_stack'
  && report.api?.service === 'supermega-service'
  && report.ui?.proxiedService === 'supermega-service')
requireContract('full stack remains fail-closed',
  report.runtime?.operatingMode === 'isolated_demo'
  && report.runtime?.enterpriseDbReady === false
  && report.runtime?.securityReady === false
  && report.runtime?.writesEnabled === false
  && report.runtime?.browserServiceRoleExposed === false)
requireContract('full stack keeps security headers and local safety',
  report.headers?.cacheControl === 'no-store'
  && report.headers?.nosniff === 'nosniff'
  && report.safety?.loopbackOnly === true
  && report.safety?.databaseUrlCleared === true
  && report.safety?.hostedAuthCleared === true
  && report.safety?.externalWorkerCleared === true)
requireContract('full stack proves zero-write ecommerce queue validation',
  report.ecommerceOrderQueueValidation?.contract === 'supermega.ecommerce.order_queue_readiness_validation.v1'
  && report.ecommerceOrderQueueValidation?.status === 'ready_for_owner_review'
  && report.ecommerceOrderQueueValidation?.identityAuthority === 'isolated_demo_untrusted_workspace'
  && report.ecommerceOrderQueueValidation?.writesPerformed === false
  && report.ecommerceOrderQueueValidation?.tamperRejected === true)
requireContract('full stack proves zero-write ecommerce Shop queue import plan',
  report.ecommerceOrderQueueImportPlan?.contract === 'supermega.ecommerce.shop_queue_import_plan.v1'
  && report.ecommerceOrderQueueImportPlan?.status === 'ready_for_managed_apply'
  && report.ecommerceOrderQueueImportPlan?.targetAdapter === 'shop_order_queue'
  && report.ecommerceOrderQueueImportPlan?.identityAuthority === 'isolated_demo_untrusted_workspace'
  && report.ecommerceOrderQueueImportPlan?.writesPerformed === false
  && report.ecommerceOrderQueueImportPlan?.tamperRejected === true)
requireContract('full stack proves ecommerce Shop queue apply preflight is auth-gated',
  report.ecommerceOrderQueueApplyPreflight?.authRequired === true
  && report.ecommerceOrderQueueApplyPreflight?.applyPreflightAuthRequired === true
  && report.ecommerceOrderQueueApplyPreflight?.writesPerformed === false)

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_local_full_stack', failures, report }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({
  ok: true,
  contract: 'supermega_local_full_stack',
  checks: 14,
  operatingMode: report.runtime.operatingMode,
  writesEnabled: report.runtime.writesEnabled,
  loopbackOnly: report.safety.loopbackOnly,
}, null, 2))
