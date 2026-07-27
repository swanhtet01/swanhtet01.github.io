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
    OPENAI_API_KEY: '',
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
