import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')

async function buildVercelWorkspace() {
  const workspace = await mkdtemp(join(tmpdir(), 'supermega-vercel-config-'))
  await mkdir(join(workspace, 'tools'))
  for (const file of ['write_app_vercel_config.mjs', 'scheduler_authority_contract.mjs', 'supermega_scheduler_authority.json']) {
    await copyFile(resolve(root, 'tools', file), join(workspace, 'tools', file))
  }
  const result = spawnSync(process.execPath, [join(workspace, 'tools', 'write_app_vercel_config.mjs')], {
    cwd: workspace,
    encoding: 'utf8',
  })
  return { workspace, result }
}

test('app Vercel generator emits zero crons and a bounded Python function', async () => {
  const { workspace, result } = await buildVercelWorkspace()
  try {
    assert.equal(result.status, 0, result.stderr)
    const config = JSON.parse(await readFile(join(workspace, 'vercel.json'), 'utf8'))
    const project = JSON.parse(await readFile(join(workspace, '.vercel', 'project.json'), 'utf8'))
    assert.equal(config.functions['api/app.py'].maxDuration, 60)
    assert.deepEqual(config.crons, [])
    assert.equal(config.git.deploymentEnabled, false)
    assert.equal(project.projectName, 'megaos')
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test('generated Content-Security-Policy locks down clickjacking and script execution', async () => {
  const { workspace, result } = await buildVercelWorkspace()
  try {
    assert.equal(result.status, 0, result.stderr)
    const config = JSON.parse(await readFile(join(workspace, 'vercel.json'), 'utf8'))
    const catchAll = config.routes.find((route) => route.src === '/(.*)' && route.continue)
    assert.ok(catchAll, 'catch-all route with security headers must exist')
    const csp = catchAll.headers['Content-Security-Policy']
    assert.ok(csp, 'Content-Security-Policy header must be present')
    assert.ok(csp.includes("frame-ancestors 'none'"), 'CSP must block clickjacking via frame-ancestors')
    assert.ok(csp.includes("object-src 'none'"), 'CSP must eliminate plugin attack surface')
    assert.ok(csp.includes("script-src 'self'"), 'CSP must restrict script sources to same origin')
    assert.ok(!csp.includes("'unsafe-eval'"), "CSP must not allow 'unsafe-eval'")
    assert.ok(!csp.includes("'unsafe-inline'") || csp.includes("style-src"), "CSP must not permit 'unsafe-inline' on script-src")
    assert.equal(catchAll.headers['X-Frame-Options'], 'DENY', 'X-Frame-Options must be DENY')
    assert.equal(catchAll.headers['X-Content-Type-Options'], 'nosniff', 'X-Content-Type-Options must be nosniff')
    assert.equal(catchAll.headers['Referrer-Policy'], 'no-referrer', 'Referrer-Policy must be no-referrer')
    assert.equal(
      catchAll.headers['Permissions-Policy'],
      'camera=(self), geolocation=(), microphone=(), payment=(), usb=()',
      'Permissions-Policy must allow only same-origin camera scanning and deny other sensitive capabilities',
    )
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test('generated .vercelignore excludes build noise but preserves required build inputs', async () => {
  const { workspace, result } = await buildVercelWorkspace()
  try {
    assert.equal(result.status, 0, result.stderr)
    const ignoreText = await readFile(join(workspace, '.vercelignore'), 'utf8')
    const lines = new Set(ignoreText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
    for (const required of ['.github', 'kernel', 'supabase']) {
      assert.ok(!lines.has(required), `.vercelignore must not exclude required build input: ${required}`)
    }
    for (const excluded of ['showroom/dist', 'node_modules', '.env*', '**/__pycache__/**']) {
      assert.ok(lines.has(excluded), `.vercelignore must exclude build noise: ${excluded}`)
    }
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})
