import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const loopbackHost = '127.0.0.1'

function parseOptions(args) {
  const options = {
    verify: false,
    apiPort: process.env.SUPERMEGA_LOCAL_API_PORT || '8788',
    uiPort: process.env.SUPERMEGA_LOCAL_UI_PORT || '5173',
  }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--verify') {
      options.verify = true
      continue
    }
    if (argument === '--api-port' || argument === '--ui-port') {
      const value = args[index + 1]
      if (!value) throw new Error(`${argument} requires a port.`)
      if (argument === '--api-port') options.apiPort = value
      else options.uiPort = value
      index += 1
      continue
    }
    throw new Error(`Unknown local app option: ${argument}`)
  }
  return options
}

function parsePort(value, label) {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`${label} must be an integer from 1024 to 65535.`)
  }
  return port
}

function resolvePython() {
  const override = process.env.SUPERMEGA_LOCAL_PYTHON?.trim()
  if (override) return { command: override, argsPrefix: [] }
  const candidates = process.platform === 'win32'
    ? [
        { command: resolve(root, '.venv', 'Scripts', 'python.exe'), argsPrefix: [], requiresPath: true },
        { command: 'py', argsPrefix: ['-3'], requiresPath: false },
        { command: 'python', argsPrefix: [], requiresPath: false },
      ]
    : [
        { command: resolve(root, '.venv', 'bin', 'python'), argsPrefix: [], requiresPath: true },
        { command: resolve(root, '.venv', 'bin', 'python3'), argsPrefix: [], requiresPath: true },
        { command: 'python3', argsPrefix: [], requiresPath: false },
        { command: 'python', argsPrefix: [], requiresPath: false },
      ]
  const candidate = candidates.find((entry) => {
    if (entry.requiresPath && !existsSync(entry.command)) return false
    const result = spawnSync(entry.command, [...entry.argsPrefix, '--version'], {
      cwd: root,
      stdio: 'ignore',
      windowsHide: true,
    })
    return result.status === 0
  })
  if (!candidate) throw new Error('Python 3 is required for the local SuperMega API verifier.')
  return { command: candidate.command, argsPrefix: candidate.argsPrefix }
}

function isolatedEnvironment(uiUrl) {
  return {
    ...process.env,
    ANTHROPIC_API_KEY: '',
    OPENAI_API_KEY: '',
    SUPERMEGA_ORDER_INTAKE_PROVIDER: '',
    // Routine local product work should not serialize every FastAPI request as a
    // multi-kilobyte console span. Dedicated telemetry tests exercise tracing;
    // this isolated runner stays quiet, cheaper, and easier to diagnose.
    SUPERMEGA_OTEL_DISABLED: '1',
    CRON_SECRET: '',
    SUPERMEGA_CLOUD_TASKS_ALLOWED_HOSTS: '',
    SUPERMEGA_CLOUD_TASKS_WORKER_URL: '',
    SUPERMEGA_CORS_ORIGINS: uiUrl,
    SUPERMEGA_DATABASE_URL: '',
    SUPERMEGA_INTERNAL_CRON_TOKEN: '',
    SUPERMEGA_SUPABASE_PUBLISHABLE_KEY: '',
    SUPERMEGA_SUPABASE_URL: '',
    SUPERMEGA_TRIAL_IDENTITY_SECRET: '',
    SUPERMEGA_TRIAL_WRITES_ENABLED: 'false',
    SUPABASE_ANON_KEY: '',
    SUPABASE_PUBLISHABLE_KEY: '',
    SUPABASE_URL: '',
    VITE_SUPABASE_ANON_KEY: '',
    VITE_SUPABASE_PUBLISHABLE_KEY: '',
    VITE_SUPABASE_URL: '',
  }
}

function appendLog(current, chunk) {
  return `${current}${chunk}`.slice(-12_000)
}

function launch(label, command, args, env, quiet) {
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    windowsHide: true,
  })
  const state = {
    child,
    label,
    stderr: '',
    stdout: '',
    finished: null,
    exitPromise: null,
  }
  state.exitPromise = new Promise((resolveExit) => {
    child.once('error', (error) => {
      const result = { kind: 'error', error, label }
      state.finished = result
      resolveExit(result)
    })
    child.once('exit', (code, signal) => {
      const result = { kind: 'exit', code, signal, label }
      state.finished = result
      resolveExit(result)
    })
  })
  if (quiet) {
    child.stdout.on('data', (chunk) => { state.stdout = appendLog(state.stdout, chunk) })
    child.stderr.on('data', (chunk) => { state.stderr = appendLog(state.stderr, chunk) })
  }
  return state
}

function childFailure(state) {
  if (!state.finished) return ''
  if (state.finished.kind === 'error') {
    return `${state.label} failed to start: ${state.finished.error.message}`
  }
  const details = state.stderr.trim() || state.stdout.trim()
  return `${state.label} exited early (${state.finished.code ?? state.finished.signal ?? 'unknown'}).${details ? `\n${details}` : ''}`
}

async function waitForJson(url, state, accept, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  let lastIssue = ''
  while (Date.now() < deadline) {
    const failure = childFailure(state)
    if (failure) throw new Error(failure)
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(1_500),
      })
      const type = response.headers.get('content-type') ?? ''
      if (response.ok && type.includes('application/json')) {
        const body = await response.json()
        if (accept(body)) return { body, response }
        lastIssue = `Unexpected response from ${url}.`
      } else {
        lastIssue = `${url} returned HTTP ${response.status}.`
      }
    } catch (error) {
      lastIssue = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150))
  }
  const details = state.stderr.trim() || state.stdout.trim()
  throw new Error(`${state.label} did not become ready at ${url}. ${lastIssue}${details ? `\n${details}` : ''}`)
}

async function postJson(url, body, state, accept, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  let lastIssue = ''
  while (Date.now() < deadline) {
    const failure = childFailure(state)
    if (failure) throw new Error(failure)
    try {
      const response = await fetch(url, {
        method: 'POST',
        cache: 'no-store',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(1_500),
      })
      const type = response.headers.get('content-type') ?? ''
      const payload = type.includes('application/json') ? await response.json() : null
      if (accept(response, payload)) return { body: payload, response }
      lastIssue = `${url} returned HTTP ${response.status}${payload ? `: ${JSON.stringify(payload).slice(0, 500)}` : ''}.`
    } catch (error) {
      lastIssue = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150))
  }
  const details = state.stderr.trim() || state.stdout.trim()
  throw new Error(`${state.label} did not return accepted POST response at ${url}. ${lastIssue}${details ? `\n${details}` : ''}`)
}

async function stopChild(state) {
  if (!state || state.finished) return
  state.child.kill('SIGTERM')
  await Promise.race([
    state.exitPromise,
    new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000)),
  ])
  if (!state.finished) {
    state.child.kill('SIGKILL')
    await Promise.race([
      state.exitPromise,
      new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000)),
    ])
  }
}

async function run() {
  const options = parseOptions(process.argv.slice(2))
  const apiPort = parsePort(options.apiPort, 'API port')
  const uiPort = parsePort(options.uiPort, 'UI port')
  if (apiPort === uiPort) throw new Error('API and UI ports must differ.')

  const apiUrl = `http://${loopbackHost}:${apiPort}`
  const uiUrl = `http://${loopbackHost}:${uiPort}`
  const python = resolvePython()
  const viteEntrypoint = resolve(root, 'showroom', 'node_modules', 'vite', 'bin', 'vite.js')
  if (!existsSync(viteEntrypoint)) {
    throw new Error('Vite is missing. Run npm.cmd --prefix showroom ci first.')
  }

  const safeEnvironment = isolatedEnvironment(uiUrl)
  let apiState
  let uiState
  let resolveSignal
  const signalPromise = new Promise((resolveStop) => { resolveSignal = resolveStop })
  const signalHandlers = new Map(
    ['SIGINT', 'SIGTERM'].map((signal) => [
      signal,
      () => resolveSignal({ kind: 'signal', signal }),
    ]),
  )
  for (const [signal, handler] of signalHandlers) process.once(signal, handler)

  try {
    apiState = launch(
      'Canonical API',
      python.command,
      [
        ...python.argsPrefix,
        '-m',
        'uvicorn',
        'supermega_runtime.runtime:app',
        '--host',
        loopbackHost,
        '--port',
        String(apiPort),
        '--log-level',
        options.verify ? 'warning' : 'info',
        ...(options.verify ? ['--no-access-log'] : []),
      ],
      safeEnvironment,
      options.verify,
    )
    const apiHealth = await waitForJson(
      `${apiUrl}/api/health`,
      apiState,
      (body) => body?.service === 'supermega-service',
    )

    uiState = launch(
      'Vite app',
      process.execPath,
      [
        viteEntrypoint,
        resolve(root, 'showroom'),
        '--configLoader',
        'runner',
        '--host',
        loopbackHost,
        '--port',
        String(uiPort),
        '--strictPort',
      ],
      {
        ...safeEnvironment,
        SUPERMEGA_LOCAL_API: apiUrl,
      },
      options.verify,
    )
    const proxiedHealth = await waitForJson(
      `${uiUrl}/api/health`,
      uiState,
      (body) => body?.service === 'supermega-service',
    )
    const ecommerceOrderQueuePacket = {
      schema: 'supermega.ecommerce.order_queue_readiness.v1',
      version: 1,
      generatedAt: '2026-07-29T00:00:00.000Z',
      product: 'ecommerce',
      storeName: 'SuperMega Ecommerce Demo',
      sourceReview: {
        schema: 'supermega.ecommerce.order_import_review_packet.v1',
        generatedAt: '2026-07-29T00:00:00.000Z',
        operatingMode: 'browser_local_trial',
        catalogSource: 'shop-local',
        selectedSkus: ['SKU-001'],
        totalRows: 1,
        readyRows: 1,
        blockedRows: 0,
      },
      readiness: {
        status: 'ready_for_support',
        nextAction: 'Support can compare this packet with the managed Shop catalog before queue import approval.',
      },
      requiredControls: [
        'managed_postgres_rls',
        'workspace_identity',
        'shop_catalog_match',
        'source_message_retention',
        'owner_queue_approval',
        'audit_log',
        'scheduler_proof',
      ],
      forbiddenUntilReady: [
        'order_import',
        'production_queue_write',
        'customer_message_send',
        'payment_capture',
        'wallet_debit',
        'delivery_booking',
        'stock_move',
        'refund_write',
        'shop_write',
        'managed_activation',
      ],
    }
    const orderQueueValidation = await postJson(
      `${uiUrl}/api/trial/v1/ecommerce/order-queue/validate`,
      { workspace_id: 'verify-workspace', packet: ecommerceOrderQueuePacket },
      uiState,
      (response, payload) => response.ok
        && payload?.validation?.contract === 'supermega.ecommerce.order_queue_readiness_validation.v1'
        && payload.validation.status === 'ready_for_owner_review'
        && payload.validation.workspace_id === 'verify-workspace'
        && payload.validation.required_capability === 'commerce.write'
        && payload.identity_authority === 'isolated_demo_untrusted_workspace'
        && payload.validation.external_writes_performed === false
        && payload.external_writes_performed === false,
    )
    const tamperedOrderQueueValidation = await postJson(
      `${uiUrl}/api/trial/v1/ecommerce/order-queue/validate`,
      {
        workspace_id: 'verify-workspace',
        packet: { ...ecommerceOrderQueuePacket, forbiddenUntilReady: ['order_import'] },
      },
      uiState,
      (response, payload) => response.status === 422
        && String(payload?.detail ?? '').includes('failed validation'),
    )
    const ecommerceOrderQueueApprovalPacket = {
      contract: 'supermega.ecommerce.order_queue_owner_approval.v1',
      version: 1,
      createdAt: '2026-07-29T00:00:00.000Z',
      product: 'ecommerce',
      workspaceId: 'verify-workspace',
      storeName: ecommerceOrderQueuePacket.storeName,
      queuePacketSchema: ecommerceOrderQueuePacket.schema,
      validationContract: 'supermega.ecommerce.order_queue_readiness_validation.v1',
      validationStatus: 'ready_for_owner_review',
      targetSurface: 'commerce',
      requiredCapability: 'commerce.write',
      rowCount: 1,
      readyRows: 1,
      blockedRows: 0,
      selectedSkus: ['SKU-001'],
      sourceEvidence: {
        sourceReviewGeneratedAt: ecommerceOrderQueuePacket.sourceReview.generatedAt,
        sourceCatalog: ecommerceOrderQueuePacket.sourceReview.catalogSource,
        sourceMessagesRetained: true,
      },
      ownerDecision: 'Approve one managed Shop queue import after reviewing source messages, catalog match, and zero-write receipt.',
      ownerApprovalRequired: true,
      forbiddenUntilApproved: ecommerceOrderQueuePacket.forbiddenUntilReady,
      externalWritesPerformed: false,
      nextAction: 'Owner reviews this packet, then support records a named approval before one idempotent Shop queue import.',
    }
    const orderQueueImportPlan = await postJson(
      `${uiUrl}/api/trial/v1/ecommerce/order-queue/import-plan`,
      {
        workspace_id: 'verify-workspace',
        packet: ecommerceOrderQueuePacket,
        approval_packet: ecommerceOrderQueueApprovalPacket,
      },
      uiState,
      (response, payload) => response.ok
        && payload?.plan?.contract === 'supermega.ecommerce.shop_queue_import_plan.v1'
        && payload.plan.status === 'ready_for_managed_apply'
        && payload.plan.target_adapter === 'shop_order_queue'
        && String(payload.plan.idempotency_key || '').startsWith('ecommerce-shop-queue:')
        && payload.identity_authority === 'isolated_demo_untrusted_workspace'
        && payload.plan.external_writes_performed === false
        && payload.external_writes_performed === false,
    )
    const tamperedOrderQueueImportPlan = await postJson(
      `${uiUrl}/api/trial/v1/ecommerce/order-queue/import-plan`,
      {
        workspace_id: 'verify-workspace',
        packet: ecommerceOrderQueuePacket,
        approval_packet: { ...ecommerceOrderQueueApprovalPacket, selectedSkus: ['SKU-OTHER'] },
      },
      uiState,
      (response, payload) => response.status === 422
        && String(payload?.detail ?? '').includes('does not match'),
    )
    const orderQueueApplyPreflightUnauthorized = await postJson(
      `${uiUrl}/api/trial/v1/ecommerce/order-queue/apply-preflight`,
      {
        approval_id: 'approval-queue-001',
        plan: orderQueueImportPlan.body.plan,
      },
      uiState,
      (response, payload) => response.status === 401
        && String(payload?.detail ?? '').includes('trial_auth_required'),
    )

    const body = proxiedHealth.body
    const report = {
      ok: true,
      contract: 'supermega_local_full_stack',
      api: {
        url: apiUrl,
        status: apiHealth.body.status,
        service: apiHealth.body.service,
      },
      ui: {
        url: uiUrl,
        proxiedService: body.service,
      },
      runtime: {
        operatingMode: body.operating_mode,
        enterpriseDbReady: body.enterprise_db_ready,
        securityReady: body.security_ready,
        writesEnabled: body.trial_backend?.write_enabled,
        browserServiceRoleExposed: body.trial_backend?.browser_service_role_exposed,
      },
      headers: {
        cacheControl: proxiedHealth.response.headers.get('cache-control'),
        nosniff: proxiedHealth.response.headers.get('x-content-type-options'),
      },
      safety: {
        loopbackOnly: true,
        databaseUrlCleared: true,
        hostedAuthCleared: true,
        externalWorkerCleared: true,
      },
      ecommerceOrderQueueValidation: {
        contract: orderQueueValidation.body.validation.contract,
        status: orderQueueValidation.body.validation.status,
        writesPerformed: orderQueueValidation.body.validation.external_writes_performed,
        identityAuthority: orderQueueValidation.body.identity_authority,
        tamperRejected: tamperedOrderQueueValidation.response.status === 422,
      },
      ecommerceOrderQueueImportPlan: {
        contract: orderQueueImportPlan.body.plan.contract,
        status: orderQueueImportPlan.body.plan.status,
        targetAdapter: orderQueueImportPlan.body.plan.target_adapter,
        writesPerformed: orderQueueImportPlan.body.plan.external_writes_performed,
        identityAuthority: orderQueueImportPlan.body.identity_authority,
        tamperRejected: tamperedOrderQueueImportPlan.response.status === 422,
      },
      ecommerceOrderQueueApplyPreflight: {
        authRequired: orderQueueApplyPreflightUnauthorized.response.status === 401,
        writesPerformed: false,
        applyPreflightAuthRequired: orderQueueApplyPreflightUnauthorized.response.status === 401,
      },
    }

    if (options.verify) {
      console.log(JSON.stringify(report))
      return
    }

    console.log(`SuperMega app: ${uiUrl}`)
    console.log(`Canonical API: ${apiUrl}`)
    console.log('Mode: isolated demo; database, hosted auth, external workers, and managed writes are disabled.')
    const stopped = await Promise.race([
      apiState.exitPromise,
      uiState.exitPromise,
      signalPromise,
    ])
    if (stopped.kind !== 'signal') {
      throw new Error(childFailure(stopped.label === apiState.label ? apiState : uiState))
    }
  } finally {
    for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler)
    await stopChild(uiState)
    await stopChild(apiState)
  }
}

await run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
