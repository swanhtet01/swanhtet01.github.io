import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const maxBytes = 1024 * 1024

function metadataOnlyReceipt(value) {
  const { workspaceId, ...receipt } = value
  return {
    ...receipt,
    ...(workspaceId ? { workspaceDigest: `sha256:${createHash('sha256').update(String(workspaceId), 'utf8').digest('hex')}` } : {}),
    clientIdentifiersExposed: false,
  }
}

function argumentsFrom(argv) {
  const [command, ...rest] = argv
  const values = new Map()
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index]
    const value = rest[index + 1]
    if (!key?.startsWith('--') || value === undefined || value.startsWith('--')) throw new Error('Arguments must use --name value pairs.')
    if (values.has(key)) throw new Error(`Argument ${key} was repeated.`)
    values.set(key, value)
  }
  return { command, values }
}

function required(values, name) {
  const value = values.get(name)
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} fields do not match the contract.`)
  return value
}

async function readJson(path, label) {
  const data = await readFile(resolve(path))
  if (!data.length || data.length > maxBytes) throw new Error(`${label} must be between 1 byte and 1 MiB.`)
  try {
    const value = JSON.parse(data.toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape')
    return value
  } catch {
    throw new Error(`${label} must be a UTF-8 JSON object.`)
  }
}

async function writeExclusive(path, value) {
  const destination = resolve(path)
  await writeFile(destination, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  return destination
}

async function loadModel() {
  const requireFromShowroom = createRequire(pathToFileURL(resolve(root, 'showroom', 'package.json')).href)
  const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)
  const bundle = await build({
    stdin: {
      contents: `
        export { buildClientDemoBlueprint } from './client-onboarding.ts'
        export {
          buildClientExtensionManifest,
          verifyClientExtensionManifest,
          buildClientExtensionActivationPlan,
          verifyClientExtensionActivationPlan,
          buildClientExtensionPortalBinding,
          verifyClientExtensionPortalBinding,
          buildClientExtensionRuntimeAuthorization,
          verifyClientExtensionRuntimeAuthorization,
          buildClientExtensionActivationReceipt,
          verifyClientExtensionActivationReceipt,
          buildClientExtensionAgentContext,
          verifyClientExtensionAgentContext,
        } from './client-extension-manifest.ts'
      `,
      resolveDir: resolve(root, 'showroom', 'src', 'core'),
      sourcefile: 'showroom/src/core/client-extension-cli-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'error',
  })
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)
}

async function verifiedBlueprint(path, model) {
  const preparationPath = resolve(path)
  try {
    execFileSync(process.execPath, [resolve(root, 'tools', 'prepare_client_demo.mjs'), '--verify', preparationPath], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 90_000,
    })
  } catch {
    throw new Error('The client preparation failed its canonical verifier.')
  }
  const preparation = await readJson(preparationPath, 'Client preparation')
  const client = exactKeys(
    preparation.client,
    ['workspace', 'owner', 'presetId', 'shopIndustryPackId', 'plantIndustryPackId'],
    'Client preparation identity',
  )
  if (!Array.isArray(preparation.products) || preparation.products.length < 1 || preparation.products.length > 4) {
    throw new Error('Client preparation products are invalid.')
  }
  return model.buildClientDemoBlueprint({
    workspace: client.workspace,
    owner: client.owner,
    presetId: client.presetId,
    selections: preparation.products.map((product) => ({ product: product.product, templateId: product.templateId })),
  })
}

async function main(argv) {
  const { command, values } = argumentsFrom(argv)
  if (!['request', 'verify-request', 'plan', 'verify-plan', 'bind-portal', 'verify-portal-binding', 'authorize-activation', 'verify-activation-authorization', 'record-activation', 'verify-activation-receipt', 'bind-agent-context', 'verify-agent-context'].includes(command)) {
    throw new Error('Choose a supported client extension lifecycle command.')
  }
  const allowedArguments = {
    request: ['--preparation', '--request', '--created-at', '--output'],
    'verify-request': ['--preparation', '--manifest'],
    plan: ['--preparation', '--manifest', '--evidence', '--output'],
    'verify-plan': ['--preparation', '--manifest', '--plan'],
    'bind-portal': ['--preparation', '--manifest', '--plan', '--portal', '--output'],
    'verify-portal-binding': ['--preparation', '--manifest', '--plan', '--portal', '--binding'],
    'authorize-activation': ['--preparation', '--manifest', '--plan', '--portal', '--binding', '--authorization-evidence', '--output'],
    'verify-activation-authorization': ['--preparation', '--manifest', '--plan', '--portal', '--binding', '--authorization', '--at'],
    'record-activation': ['--preparation', '--manifest', '--plan', '--portal', '--binding', '--authorization', '--receipt-evidence', '--output'],
    'verify-activation-receipt': ['--preparation', '--manifest', '--plan', '--portal', '--binding', '--authorization', '--receipt'],
    'bind-agent-context': ['--preparation', '--manifest', '--plan', '--portal', '--binding', '--authorization', '--receipt', '--context-profile', '--output'],
    'verify-agent-context': ['--preparation', '--manifest', '--plan', '--portal', '--binding', '--authorization', '--receipt', '--context-profile', '--agent-context'],
  }[command]
  if ([...values.keys()].some((key) => !allowedArguments.includes(key))) {
    throw new Error(`Command ${command} received an unsupported argument.`)
  }
  const model = await loadModel()
  const blueprint = await verifiedBlueprint(required(values, '--preparation'), model)

  if (command === 'request') {
    const request = exactKeys(
      await readJson(required(values, '--request'), 'Extension request'),
      ['id', 'label', 'outcome', 'baseProduct', 'domain', 'mode', 'records', 'roles', 'dependsOn', 'acceptanceCriteria'],
      'Extension request',
    )
    const manifest = await model.buildClientExtensionManifest(blueprint, request, required(values, '--created-at'))
    const output = await writeExclusive(required(values, '--output'), manifest)
    return { ok: true, contract: manifest.schema, output, digest: manifest.digest, status: manifest.lifecycle.status, externalWritesPerformed: false }
  }

  const manifest = await readJson(required(values, '--manifest'), 'Extension manifest')
  if (command === 'verify-request') {
    const verified = await model.verifyClientExtensionManifest(manifest, blueprint)
    return { ...verified, externalWritesPerformed: false }
  }

  if (command === 'plan') {
    const evidence = exactKeys(
      await readJson(required(values, '--evidence'), 'Extension activation evidence'),
      ['implementationVersion', 'implementationDigest', 'migrationDigest', 'rollbackDigest', 'securityReviewDigest', 'securityReviewedBy', 'securityReviewedAt', 'approvedBy', 'approvedAt'],
      'Extension activation evidence',
    )
    const plan = await model.buildClientExtensionActivationPlan(manifest, blueprint, evidence)
    const output = await writeExclusive(required(values, '--output'), plan)
    return { ok: true, contract: plan.schema, output, digest: plan.digest, manifestDigest: plan.manifestDigest, status: plan.authority.status, externalWritesPerformed: false }
  }

  const plan = await readJson(required(values, '--plan'), 'Extension activation plan')
  if (command === 'verify-plan') {
    const verified = await model.verifyClientExtensionActivationPlan(plan, manifest, blueprint)
    return { ...verified, externalWritesPerformed: false }
  }

  const portal = await readJson(required(values, '--portal'), 'Client portal activation manifest')
  if (command === 'bind-portal') {
    const binding = await model.buildClientExtensionPortalBinding(manifest, plan, blueprint, portal)
    const output = await writeExclusive(required(values, '--output'), binding)
    return {
      ok: true,
      contract: binding.schema,
      output,
      digest: binding.digest,
      portalManifestDigest: binding.portalManifestDigest,
      workspaceId: binding.tenant.workspaceId,
      status: binding.authority.status,
      externalWritesPerformed: false,
    }
  }

  const binding = await readJson(required(values, '--binding'), 'Client extension portal binding')
  if (command === 'verify-portal-binding') {
    const verified = await model.verifyClientExtensionPortalBinding(binding, manifest, plan, blueprint, portal)
    return { ...verified, externalWritesPerformed: false }
  }

  if (command === 'authorize-activation') {
    const evidence = exactKeys(
      await readJson(required(values, '--authorization-evidence'), 'Runtime activation authorization evidence'),
      ['environment', 'releaseCommit', 'approvedBy', 'approvedByActorId', 'approvedAt', 'expiresAt', 'idempotencyKey'],
      'Runtime activation authorization evidence',
    )
    const authorization = await model.buildClientExtensionRuntimeAuthorization(binding, manifest, plan, blueprint, portal, evidence)
    const output = await writeExclusive(required(values, '--output'), authorization)
    return {
      ok: true,
      contract: authorization.schema,
      output,
      digest: authorization.digest,
      portalBindingDigest: authorization.portalBindingDigest,
      workspaceId: authorization.tenant.workspaceId,
      releaseCommit: authorization.target.releaseCommit,
      expiresAt: authorization.approval.expiresAt,
      status: authorization.authority.status,
      externalWritesPerformed: false,
    }
  }

  const authorization = await readJson(required(values, '--authorization'), 'Runtime activation authorization')
  if (command === 'verify-activation-authorization') {
    const verified = await model.verifyClientExtensionRuntimeAuthorization(authorization, binding, manifest, plan, blueprint, portal, required(values, '--at'))
    return { ...verified, externalWritesPerformed: false }
  }

  if (command === 'record-activation') {
    const evidence = exactKeys(
      await readJson(required(values, '--receipt-evidence'), 'Extension activation receipt evidence'),
      ['activatedAt', 'activatedByActorId', 'idempotencyKey', 'runtimeRelease', 'tenantConfigRevision', 'tenantConfigDigest', 'executionEvidenceDigest', 'rollbackReady', 'customerRecordWritesPerformed', 'providerCallsPerformed', 'deploymentPerformed', 'externalMessagesSent', 'crossTenantWritesPerformed', 'crossProductWritesPerformed'],
      'Extension activation receipt evidence',
    )
    const receipt = await model.buildClientExtensionActivationReceipt(authorization, binding, manifest, plan, blueprint, portal, evidence)
    const output = await writeExclusive(required(values, '--output'), receipt)
    return {
      ok: true,
      contract: receipt.schema,
      output,
      digest: receipt.digest,
      authorizationDigest: receipt.authorizationDigest,
      workspaceId: receipt.tenant.workspaceId,
      tenantConfigRevision: receipt.execution.tenantConfigRevision,
      status: receipt.execution.status,
      externalWritesPerformed: false,
    }
  }

  const receipt = await readJson(required(values, '--receipt'), 'Extension activation receipt')
  if (command === 'verify-activation-receipt') {
    const verified = await model.verifyClientExtensionActivationReceipt(receipt, authorization, binding, manifest, plan, blueprint, portal)
    return { ...verified, externalWritesPerformed: false }
  }

  const profile = await readJson(required(values, '--context-profile'), 'Managed context profile')
  if (command === 'bind-agent-context') {
    const agentContext = await model.buildClientExtensionAgentContext(receipt, authorization, binding, manifest, plan, blueprint, portal, profile)
    const output = await writeExclusive(required(values, '--output'), agentContext)
    return {
      ok: true,
      contract: agentContext.schema,
      output,
      digest: agentContext.digest,
      activationReceiptDigest: agentContext.activationReceiptDigest,
      managedContextProfileDigest: agentContext.managedContextProfileDigest,
      workspaceId: agentContext.tenant.workspaceId,
      status: agentContext.agentPolicy.status,
      externalWritesPerformed: false,
    }
  }

  const agentContext = await readJson(required(values, '--agent-context'), 'Client extension agent context')
  const verified = await model.verifyClientExtensionAgentContext(
    agentContext, receipt, authorization, binding, manifest, plan, blueprint, portal, profile,
  )
  return { ...verified, externalWritesPerformed: false }
}

try {
  console.log(JSON.stringify(metadataOnlyReceipt(await main(process.argv.slice(2)))))
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    contract: 'supermega.client_extension_tool.v1',
    error: String(error instanceof Error ? error.message : error).slice(0, 240),
    externalWritesPerformed: false,
    clientIdentifiersExposed: false,
  }))
  process.exitCode = 1
}
