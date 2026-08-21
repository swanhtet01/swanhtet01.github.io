import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const maxBytes = 1024 * 1024

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
  if (!['request', 'verify-request', 'plan', 'verify-plan'].includes(command)) {
    throw new Error('Command must be request, verify-request, plan, or verify-plan.')
  }
  const allowedArguments = {
    request: ['--preparation', '--request', '--created-at', '--output'],
    'verify-request': ['--preparation', '--manifest'],
    plan: ['--preparation', '--manifest', '--evidence', '--output'],
    'verify-plan': ['--preparation', '--manifest', '--plan'],
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
  const verified = await model.verifyClientExtensionActivationPlan(plan, manifest, blueprint)
  return { ...verified, externalWritesPerformed: false }
}

try {
  console.log(JSON.stringify(await main(process.argv.slice(2))))
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    contract: 'supermega.client_extension_tool.v1',
    error: String(error instanceof Error ? error.message : error).slice(0, 240),
    externalWritesPerformed: false,
  }))
  process.exitCode = 1
}
