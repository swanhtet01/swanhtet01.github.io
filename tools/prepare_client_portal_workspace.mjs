import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  renderClientLaunchDashboard,
  verifyClientLaunchDashboard,
  writeClientLaunchDashboard,
} from './render_client_launch_dashboard.mjs'

export const CLIENT_PORTAL_WORKSPACE_CONTRACT = 'supermega.client_portal_workspace.v1'

const ROOT = resolve(import.meta.dirname, '..')
const MAX_JSON_BYTES = 4 * 1024 * 1024
const FILES = {
  preparation: 'client-preparation.private.json',
  portal: 'client-portal-provisioning.private.json',
  board: 'client-launch-board.private.json',
  dashboard: 'START-HERE.html',
  manifest: 'client-workspace-manifest.json',
}

function fail(code) {
  throw new Error(code)
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  fail('client_portal_workspace_value_invalid')
}

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`
}

function bytesDigest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

async function guardedFile(pathValue, code, maximum = MAX_JSON_BYTES) {
  const path = resolve(pathValue)
  const metadata = await lstat(path).catch(() => null)
  if (!metadata || !metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1 || metadata.size > maximum) fail(code)
  return { path, bytes: await readFile(path) }
}

async function guardedJson(pathValue, code) {
  const file = await guardedFile(pathValue, code)
  try { return { ...file, value: JSON.parse(file.bytes.toString('utf8')) } } catch { fail(code) }
}

function runPython(label, arguments_) {
  const result = spawnSync('python', ['-s', ...arguments_], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
  })
  if (result.status !== 0) fail(`${label}_failed`)
  try {
    const receipt = JSON.parse(result.stdout.trim())
    if (receipt.ok !== true
      || receipt.tenantWritesPerformed !== false
      || receipt.productionActivationPerformed !== false) fail(`${label}_unsafe_receipt`)
    return receipt
  } catch {
    fail(`${label}_receipt_invalid`)
  }
}

function parseArgs(argv) {
  const command = argv[0]
  if (!['prepare', 'verify'].includes(command)) fail('client_portal_workspace_command_invalid')
  const values = new Map()
  const managedRequests = []
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || !value || value.startsWith('--')) fail('client_portal_workspace_arguments_invalid')
    if (key === '--managed-request-file') managedRequests.push(value)
    else {
      if (!['--preparation', '--workspace'].includes(key) || values.has(key)) fail('client_portal_workspace_arguments_invalid')
      values.set(key, value)
    }
  }
  if (!values.get('--workspace') || (command === 'prepare') !== Boolean(values.get('--preparation'))) fail('client_portal_workspace_arguments_invalid')
  return { command, preparation: values.get('--preparation'), workspace: values.get('--workspace'), managedRequests }
}

function managedRequestArguments(paths) {
  return paths.flatMap((path) => ['--managed-request-file', resolve(path)])
}

async function artifactDigests(directory) {
  const entries = {}
  for (const [id, filename] of Object.entries(FILES)) {
    if (id === 'manifest') continue
    const file = await guardedFile(join(directory, filename), 'client_portal_workspace_artifact_invalid')
    entries[id] = { filename, bytes: file.bytes.length, digest: bytesDigest(file.bytes) }
  }
  return entries
}

function manifestPayload(preparation, portal, board, dashboardProof, artifacts) {
  return {
    contract: CLIENT_PORTAL_WORKSPACE_CONTRACT,
    version: 1,
    status: board.status,
    source: {
      preparationDigest: preparation.bundleDigest,
      portalProvisioningDigest: portal.bundleDigest,
      launchBoardDigest: board.boardDigest,
      dashboardDigest: dashboardProof.digest,
      managedTrialRequestDigests: [...board.source.managedTrialRequestDigests],
    },
    products: board.products.map(({ productId, templateId, startPath }) => ({ productId, templateId, startPath })),
    connections: board.connections.map(({ id, sourceProduct, targetProduct }) => ({ id, sourceProduct, targetProduct })),
    blockingGates: [...board.blockingGates],
    artifacts,
    controls: {
      privateLocalWorkspace: true,
      containsReviewedClientPreparation: true,
      terminalReceiptContainsClientIdentity: false,
      tenantWritesPerformed: false,
      providerCallsPerformed: false,
      externalMessagesSent: false,
      deploymentPerformed: false,
      productionActivationPerformed: false,
    },
  }
}

async function writePrivate(path, bytes) {
  await writeFile(path, bytes, { flag: 'wx', mode: 0o600 })
  await chmod(path, 0o600).catch(() => null)
}

async function verifyWorkspace(directory, managedRequests) {
  const preparationFile = await guardedJson(join(directory, FILES.preparation), 'client_portal_workspace_preparation_invalid')
  const portalFile = await guardedJson(join(directory, FILES.portal), 'client_portal_workspace_portal_invalid')
  const boardFile = await guardedJson(join(directory, FILES.board), 'client_portal_workspace_board_invalid')
  const dashboardFile = await guardedFile(join(directory, FILES.dashboard), 'client_portal_workspace_dashboard_invalid', 128 * 1024)
  const manifestFile = await guardedJson(join(directory, FILES.manifest), 'client_portal_workspace_manifest_invalid')

  runPython('client_portal_workspace_portal_verify', [
    resolve('tools/prepare_client_portal_provisioning.py'), 'verify',
    '--bundle', portalFile.path,
    '--preparation', preparationFile.path,
  ])
  runPython('client_portal_workspace_board_verify', [
    resolve('tools/prepare_client_launch_board.py'), 'verify',
    '--preparation', preparationFile.path,
    '--board', boardFile.path,
    ...managedRequestArguments(managedRequests),
  ])
  const dashboardProof = verifyClientLaunchDashboard(dashboardFile.bytes.toString('utf8'), boardFile.value)
  const artifacts = await artifactDigests(directory)
  const payload = manifestPayload(preparationFile.value, portalFile.value, boardFile.value, dashboardProof, artifacts)
  const expected = { ...payload, workspaceDigest: digest(payload) }
  if (JSON.stringify(manifestFile.value) !== JSON.stringify(expected)) fail('client_portal_workspace_manifest_stale_or_altered')
  return { manifest: expected, board: boardFile.value }
}

async function prepareWorkspace(target, preparationPath, managedRequests) {
  const existing = await lstat(target).catch(() => null)
  if (existing) fail('client_portal_workspace_output_exists')
  const parent = dirname(target)
  await mkdir(parent, { recursive: true })
  const parentMetadata = await lstat(parent)
  if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink()) fail('client_portal_workspace_parent_invalid')
  const staging = await mkdtemp(join(parent, '.supermega-client-workspace-'))
  let published = false
  try {
    const source = await guardedJson(preparationPath, 'client_portal_workspace_preparation_invalid')
    await writePrivate(join(staging, FILES.preparation), source.bytes)
    const localPreparation = join(staging, FILES.preparation)
    const portalPath = join(staging, FILES.portal)
    const boardPath = join(staging, FILES.board)
    const dashboardPath = join(staging, FILES.dashboard)

    runPython('client_portal_workspace_portal_prepare', [
      resolve('tools/prepare_client_portal_provisioning.py'), 'prepare',
      '--preparation', localPreparation,
      '--output', portalPath,
    ])
    runPython('client_portal_workspace_board_prepare', [
      resolve('tools/prepare_client_launch_board.py'), 'prepare',
      '--preparation', localPreparation,
      '--output', boardPath,
      ...managedRequestArguments(managedRequests),
    ])

    const board = (await guardedJson(boardPath, 'client_portal_workspace_board_invalid')).value
    const html = renderClientLaunchDashboard(board)
    await writeClientLaunchDashboard(html, dashboardPath)
    const portal = (await guardedJson(portalPath, 'client_portal_workspace_portal_invalid')).value
    const dashboardProof = verifyClientLaunchDashboard(html, board)
    const artifacts = await artifactDigests(staging)
    const payload = manifestPayload(source.value, portal, board, dashboardProof, artifacts)
    await writePrivate(join(staging, FILES.manifest), `${JSON.stringify({ ...payload, workspaceDigest: digest(payload) }, null, 2)}\n`)
    await verifyWorkspace(staging, managedRequests)
    await rename(staging, target)
    published = true
    return verifyWorkspace(target, managedRequests)
  } finally {
    if (!published) {
      const resolvedStaging = resolve(staging)
      if (dirname(resolvedStaging) !== parent || !basename(resolvedStaging).startsWith('.supermega-client-workspace-') || !resolvedStaging.startsWith(`${parent}${sep}`)) {
        fail('client_portal_workspace_staging_boundary_invalid')
      }
      await rm(resolvedStaging, { recursive: true, force: true })
    }
  }
}

function receipt(result) {
  return {
    ok: true,
    contract: CLIENT_PORTAL_WORKSPACE_CONTRACT,
    status: result.manifest.status,
    workspaceDigest: result.manifest.workspaceDigest,
    productCount: result.board.products.length,
    connectionCount: result.board.connections.length,
    blockingGateCount: result.board.blockingGates.length,
    safeEntryFilename: FILES.dashboard,
    terminalReceiptContainsClientIdentity: false,
    externalWritesPerformed: false,
    tenantWritesPerformed: false,
    providerCallsPerformed: false,
    externalMessagesSent: false,
    deploymentPerformed: false,
    productionActivationPerformed: false,
  }
}

async function main(argv) {
  const args = parseArgs(argv)
  const workspace = resolve(args.workspace)
  const result = args.command === 'prepare'
    ? await prepareWorkspace(workspace, args.preparation, args.managedRequests)
    : await verifyWorkspace(workspace, args.managedRequests)
  process.stdout.write(`${JSON.stringify(receipt(result))}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      contract: CLIENT_PORTAL_WORKSPACE_CONTRACT,
      error: String(error?.message || 'client_portal_workspace_failed').slice(0, 180),
      terminalReceiptContainsClientIdentity: false,
      externalWritesPerformed: false,
      tenantWritesPerformed: false,
      productionActivationPerformed: false,
    })}\n`)
    process.exitCode = 1
  })
}
