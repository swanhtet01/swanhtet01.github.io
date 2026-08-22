import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const ENTRY = resolve(root, 'api', 'brief.mjs')
const FULL_STATUS = resolve(root, 'api', 'status.mjs')
const TOOLS = resolve(root, 'tools.mjs')
const CONNECTOR_INDEX = resolve(root, 'connectors', 'index.mjs')
const MAX_EAGER_FILES = 30
const MAX_EAGER_BYTES = 400 * 1024
const EXPECTED_CONNECTORS = 69
const EXPECTED_EAGER_MANIFEST = Object.freeze([
  'agent-company.mjs',
  'alert.mjs',
  'api/brief.mjs',
  'api/operator.mjs',
  'crew-run.mjs',
  'crew-runner.mjs',
  'gateway.mjs',
  'ops-key.mjs',
  'owner-evidence.mjs',
  'store.mjs',
  'supermega-hq-authority.mjs',
  'tools.mjs',
  'workcell-run.mjs',
  'workcells.mjs',
])
const OPTIONAL_TOOL_CONNECTORS = Object.freeze([
  'connectors/infra-http.mjs',
  'connectors/data-cbm-rate.mjs',
  'connectors/data-gmail.mjs',
  'connectors/data-sheets.mjs',
  'connectors/payment-paypal.mjs',
  'connectors/crm-pipedrive.mjs',
  'connectors/data-clickup.mjs',
  'connectors/messaging-telegram.mjs',
])

function localSpecifiers(source, includeDynamic = false) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const found = []
  const staticImport = /\bfrom\s+['"](\.[^'"]+)['"]|(?:^|\n)\s*import\s+['"](\.[^'"]+)['"]/g
  for (const match of code.matchAll(staticImport)) found.push(match[1] || match[2])
  if (includeDynamic) {
    const dynamicImport = /\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g
    for (const match of code.matchAll(dynamicImport)) found.push(match[1])
  }
  return found
}

async function resolveModule(fromFile, specifier) {
  const candidate = resolve(dirname(fromFile), specifier)
  return extname(candidate) ? candidate : `${candidate}.mjs`
}

async function closure(entry, includeDynamic = false) {
  const seen = new Set()
  const queue = [entry]
  while (queue.length) {
    const file = queue.shift()
    if (seen.has(file)) continue
    seen.add(file)
    const source = await readFile(file, 'utf8')
    for (const specifier of localSpecifiers(source, includeDynamic)) {
      const dependency = await resolveModule(file, specifier)
      try {
        const info = await stat(dependency)
        if (info.isFile()) queue.push(dependency)
      } catch {
        throw new Error(`function_footprint_missing_dependency:${relative(root, dependency).replaceAll('\\', '/')}`)
      }
    }
  }
  const files = [...seen].sort()
  const sizes = await Promise.all(files.map(async (file) => Buffer.byteLength(
    (await readFile(file, 'utf8')).replace(/\r\n/g, '\n'),
    'utf8',
  )))
  return {
    files,
    bytes: sizes.reduce((total, size) => total + size, 0),
  }
}

const eager = await closure(ENTRY)
const fullStatus = await closure(FULL_STATUS)
const portfolio = JSON.parse(await readFile(resolve(root, '..', 'hq', 'portfolio.json'), 'utf8'))
const recordedEagerFiles = portfolio.agentOperatingModel?.scheduledFunctionCurrentEagerFiles
const recordedEagerBytes = portfolio.agentOperatingModel?.scheduledFunctionCurrentEagerBytes
const briefSource = await readFile(ENTRY, 'utf8')
const toolsSource = await readFile(TOOLS, 'utf8')
const connectorIndexSource = await readFile(CONNECTOR_INDEX, 'utf8')
const relativeFiles = eager.files.map((file) => relative(root, file).replaceAll('\\', '/'))
const fullStatusFiles = fullStatus.files.map((file) => relative(root, file).replaceAll('\\', '/'))
const connectorImports = [...connectorIndexSource.matchAll(/(?:^|\n)\s*import\s+['"]\.\/[^'"]+['"]/g)].length

const checks = {
  eagerFileBudget: eager.files.length <= MAX_EAGER_FILES,
  eagerByteBudget: eager.bytes <= MAX_EAGER_BYTES,
  fullStatusNotEager: !relativeFiles.includes('api/status.mjs'),
  connectorFleetNotEager: !relativeFiles.includes('connectors/index.mjs'),
  companyOperationsNotEager: !relativeFiles.includes('agent-company-operations.mjs')
    && !relativeFiles.includes('agent-company-work-orders.mjs'),
  fullStatusOwnsConnectorFleet: fullStatusFiles.includes('connectors/index.mjs'),
  statusImportIsDeferred: toolsSource.includes("await import('./api/status.mjs')"),
  statusImportIsNotStatic: !/(?:from\s+|import\s+)['"]\.\/api\/status\.mjs['"]/.test(toolsSource),
  companyOperationsImportsAreDeferred: toolsSource.includes("await import('./agent-company-operations.mjs')")
    && briefSource.includes("import('../agent-company-operations.mjs')"),
  companyOperationsImportsAreNotStatic: !/(?:from\s+|import\s+)['"]\.\/agent-company-operations\.mjs['"]/.test(toolsSource)
    && !/(?:from\s+|import\s+)['"]\.\.\/agent-company-operations\.mjs['"]/.test(briefSource),
  optionalToolConnectorsNotEager: OPTIONAL_TOOL_CONNECTORS.every((file) => !relativeFiles.includes(file)),
  optionalToolConnectorImportsAreDeferred: OPTIONAL_TOOL_CONNECTORS.every((file) => (
    toolsSource.includes(`import('./${file}')`)
    && !new RegExp(`(?:from\\s+|import\\s+)['"]\\./${file.replaceAll('.', '\\.')}['"]`).test(toolsSource)
  )),
  connectorInventoryComplete: connectorImports === EXPECTED_CONNECTORS,
  recordedEagerFilesMatchMeasurement: recordedEagerFiles === eager.files.length,
  recordedEagerBytesMatchMeasurement: recordedEagerBytes === eager.bytes,
  eagerManifestExact: JSON.stringify(relativeFiles) === JSON.stringify([...EXPECTED_EAGER_MANIFEST]),
}
const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name)
const output = {
  ok: failed.length === 0,
  contract: 'supermega.kernel-function-footprint.v1',
  entry: 'api/brief.mjs',
  eager: {
    files: eager.files.length,
    bytes: eager.bytes,
    maxFiles: MAX_EAGER_FILES,
    maxBytes: MAX_EAGER_BYTES,
    recordedFiles: recordedEagerFiles,
    recordedBytes: recordedEagerBytes,
  },
  deferredFullStatus: {
    files: fullStatus.files.length,
    bytes: fullStatus.bytes,
    connectors: connectorImports,
  },
  checks,
  failed,
}

console.log(JSON.stringify(output, null, 2))
if (failed.length) process.exit(1)
