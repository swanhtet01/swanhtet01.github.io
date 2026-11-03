import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const SHA256 = /^[0-9a-f]{64}$/
const ID = /^[a-z0-9][a-z0-9._-]{0,127}$/
const EXACT_SHA = /^[0-9a-f]{40}$/
const USES = new Set(['executed', 'imported', 'loaded'])
function fail(code) { throw new Error(code) }
function object(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }
function exact(value, keys) {
  return object(value) && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')
}
function integer(value, min, max) { return Number.isSafeInteger(value) && value >= min && value <= max }
function safeRelative(value) {
  if (typeof value !== 'string' || !value || isAbsolute(value)
    || value.startsWith('/') || value.startsWith('\\') || value.includes(':')) return false
  return value.split(/[\\/]/).every((part) => part && part !== '.' && part !== '..'
    && !/[. ]$/.test(part) && !/[\x00-\x1f\x7f]/.test(part)
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
}
function safeJson(bytes) {
  if (bytes.length < 2 || bytes.length > 1024 * 1024) fail('bootstrap_evidence_size_invalid')
  const text = bytes.toString('utf8')
  if (/postgres(?:ql)?:\/\//i.test(text) || /C:\\Users\\/i.test(text)
    || /runneradmin/i.test(text) || /"(?:password|connectionString|rowContents)"\s*:/i.test(text)) {
    fail('bootstrap_evidence_not_sanitized')
  }
  try { return JSON.parse(text) } catch { fail('bootstrap_evidence_json_invalid') }
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

export function validateObserverProbe(probe, expectedSha) {
  const keys = ['contract', 'authoritative', 'exactSha', 'captureMethod', 'runner',
    'osBuild', 'profileSha256', 'tools', 'traceStartedBeforeProbe', 'traceStopped',
    'traceParsed', 'droppedEvents', 'droppedBuffers', 'processEventObserved',
    'imageEventObserved', 'processEndObserved', 'stableProcessKeyObserved',
    'parentChildCorrelationObserved', 'exitStatusObserved', 'fullImagePathObserved',
    'moduleEventObserved', 'completeOrderingObserved',
    'probeExitCode', 'drainComplete', 'temporaryDataRemoved',
    'postgresDownloaded', 'postgresExecuted', 'databaseStarted', 'secretValuesExposed']
  if (!exact(probe, keys)
    || probe.contract !== 'supermega.windows-process-image-observer-probe.v1'
    || probe.authoritative !== false || probe.exactSha !== expectedSha
    || !EXACT_SHA.test(expectedSha)
    || probe.captureMethod !== 'windows-wpr-etw-process-image-probe-v1'
    || probe.runner !== 'windows-2025'
    || typeof probe.osBuild !== 'string' || !/^\d+(?:\.\d+){1,3}$/.test(probe.osBuild)
    || !SHA256.test(probe.profileSha256 || '')
    || !exact(probe.tools, ['wpr', 'tracerpt', 'parent', 'probe'])
    || probe.traceStartedBeforeProbe !== true || probe.traceStopped !== true
    || probe.traceParsed !== true || probe.droppedEvents !== 0 || probe.droppedBuffers !== 0
    || probe.processEventObserved !== true || probe.imageEventObserved !== true
    || probe.processEndObserved !== true || probe.stableProcessKeyObserved !== true
    || probe.parentChildCorrelationObserved !== true || probe.exitStatusObserved !== true
    || probe.fullImagePathObserved !== true || probe.moduleEventObserved !== true
    || probe.completeOrderingObserved !== true
    || probe.probeExitCode !== 0 || probe.drainComplete !== true
    || probe.temporaryDataRemoved !== true || probe.postgresDownloaded !== false
    || probe.postgresExecuted !== false || probe.databaseStarted !== false
    || probe.secretValuesExposed !== false) {
    fail('bootstrap_observer_probe_invalid')
  }
  for (const [name, tool] of Object.entries(probe.tools)) {
    if (!exact(tool, ['fileName', 'bytes', 'sha256', 'signatureStatus',
      'signerCertificateSha256'])
      || tool.fileName !== basename(tool.fileName || '')
      || !integer(tool.bytes, 1, Number.MAX_SAFE_INTEGER)
      || !SHA256.test(tool.sha256 || '') || tool.signatureStatus !== 'Valid'
      || !SHA256.test(tool.signerCertificateSha256 || '')
      || ({ wpr: 'wpr.exe', tracerpt: 'tracerpt.exe', parent: 'cmd.exe', probe: 'where.exe' })[name]
        !== tool.fileName.toLowerCase()) {
      fail('bootstrap_observer_probe_invalid')
    }
  }
  return { stage: 'observer-probe', exactSha: expectedSha, authoritative: false }
}

export function validateSanitizedClosure(closure, expectedSha) {
  const keys = ['contract', 'exactSha', 'captureStartedBeforeSpawn', 'rehearsalObserved',
    'droppedEvents', 'droppedBuffers', 'descendantCorrelationComplete', 'runtimeModulesComplete',
    'importCaptureStartedBeforeSpawn', 'importCaptureDrainedAfterExit',
    'droppedImportEvents', 'lateImportEvents', 'importCount', 'imports',
    'processTreeComplete', 'allProcessesExited', 'serviceInventoryUnchanged',
    'allSelectedPortsClosed', 'selectedPorts', 'temporaryDataRemoved', 'profileId',
    'runtimeClosureEvidenceSha256', 'sourceDigest', 'bindingDigest', 'receiptSha256',
    'rawReceiptSha256', 'processCount', 'runtimeFileCount', 'systemModuleCount', 'sourceIdentity',
    'processes', 'runtimeFiles', 'systemModules']
  if (!exact(closure, keys) || closure.contract !== 'supermega.windows-process-image-observer.v2'
    || closure.exactSha !== expectedSha || !EXACT_SHA.test(expectedSha)
    || closure.captureStartedBeforeSpawn !== true || closure.rehearsalObserved !== true
    || closure.droppedEvents !== 0 || closure.droppedBuffers !== 0
    || closure.importCaptureStartedBeforeSpawn !== true
    || closure.importCaptureDrainedAfterExit !== true
    || closure.droppedImportEvents !== 0 || closure.lateImportEvents !== 0
    || closure.descendantCorrelationComplete !== true
    || closure.runtimeModulesComplete !== true || closure.processTreeComplete !== true
    || closure.allProcessesExited !== true || closure.serviceInventoryUnchanged !== true
    || closure.allSelectedPortsClosed !== true || closure.temporaryDataRemoved !== true
    || typeof closure.profileId !== 'string' || !ID.test(closure.profileId)
    || ![closure.runtimeClosureEvidenceSha256, closure.sourceDigest, closure.bindingDigest,
      closure.receiptSha256, closure.rawReceiptSha256].every((value) => SHA256.test(value || ''))
    || !integer(closure.processCount, 1, 10000)
    || !integer(closure.runtimeFileCount, 1, 10000)
    || !integer(closure.systemModuleCount, 1, 10000)
    || !integer(closure.importCount, 1, 10000)
    || !Array.isArray(closure.selectedPorts) || closure.selectedPorts.length < 1
    || closure.selectedPorts.some((value) => !integer(value, 1, 65535))
    || new Set(closure.selectedPorts).size !== closure.selectedPorts.length
    || !Array.isArray(closure.processes) || closure.processes.length !== closure.processCount
    || !Array.isArray(closure.runtimeFiles) || closure.runtimeFiles.length !== closure.runtimeFileCount
    || !Array.isArray(closure.systemModules) || closure.systemModules.length !== closure.systemModuleCount
    || !Array.isArray(closure.imports) || closure.imports.length !== closure.importCount
    || !exact(closure.sourceIdentity, ['gitBindingId', 'gitSourceId', 'head', 'tree', 'clean',
      'headEvidenceSha256', 'treeEvidenceSha256', 'statusEvidenceSha256'])
    || !ID.test(closure.sourceIdentity.gitBindingId || '')
    || !ID.test(closure.sourceIdentity.gitSourceId || '')
    || closure.sourceIdentity.head !== expectedSha
    || !EXACT_SHA.test(closure.sourceIdentity.tree || '')
    || closure.sourceIdentity.clean !== true
    || ![closure.sourceIdentity.headEvidenceSha256, closure.sourceIdentity.treeEvidenceSha256,
      closure.sourceIdentity.statusEvidenceSha256].every((value) => SHA256.test(value || ''))) {
    fail('bootstrap_closure_inventory_invalid')
  }
  for (const process of closure.processes) {
    if (!exact(process, ['sequence', 'parentSequence', 'imageBindingId', 'sourceId', 'exitCode'])
      || !integer(process.sequence, 0, 1000000)
      || !(process.parentSequence === null || integer(process.parentSequence, 0, 1000000))
      || !ID.test(process.imageBindingId || '') || !ID.test(process.sourceId || '')
      || process.exitCode !== 0) fail('bootstrap_closure_inventory_invalid')
  }
  const processesBySequence = new Map()
  let roots = 0
  for (const process of closure.processes) {
    if (processesBySequence.has(process.sequence)) fail('bootstrap_closure_process_graph_invalid')
    processesBySequence.set(process.sequence, process)
    if (process.parentSequence === null) roots++
  }
  if (roots !== 1) fail('bootstrap_closure_process_graph_invalid')
  for (const process of closure.processes) {
    if (process.parentSequence !== null
      && (!processesBySequence.has(process.parentSequence)
        || process.parentSequence >= process.sequence)) {
      fail('bootstrap_closure_process_graph_invalid')
    }
  }
  for (const file of closure.runtimeFiles) {
    if (!exact(file, ['bindingId', 'sourceId', 'relativePath', 'bytes', 'sha256', 'uses'])
      || !ID.test(file.bindingId || '') || !ID.test(file.sourceId || '')
      || !safeRelative(file.relativePath) || !integer(file.bytes, 1, Number.MAX_SAFE_INTEGER)
      || !SHA256.test(file.sha256 || '') || !Array.isArray(file.uses) || file.uses.length < 1
      || new Set(file.uses).size !== file.uses.length || file.uses.some((use) => !USES.has(use))) {
      fail('bootstrap_closure_inventory_invalid')
    }
  }
  const filesByBinding = new Map()
  const paths = new Set()
  for (const file of closure.runtimeFiles) {
    const binding = `${file.bindingId}\0${file.sourceId}`
    const path = file.relativePath.replaceAll('\\', '/').toLowerCase()
    if (filesByBinding.has(binding) || paths.has(path)) {
      fail('bootstrap_closure_runtime_binding_ambiguous')
    }
    filesByBinding.set(binding, file)
    paths.add(path)
  }
  const executedBindings = new Set()
  for (const process of closure.processes) {
    const binding = `${process.imageBindingId}\0${process.sourceId}`
    const file = filesByBinding.get(binding)
    if (!file || !file.uses.includes('executed')) {
      fail('bootstrap_closure_process_image_unbound')
    }
    executedBindings.add(binding)
  }
  for (const [binding, file] of filesByBinding) {
    if (file.uses.includes('executed') && !executedBindings.has(binding)) {
      fail('bootstrap_closure_process_image_unobserved')
    }
  }
  const observedImports = new Set()
  const importedBindings = new Set()
  for (const entry of closure.imports) {
    if (!exact(entry, ['processSequence', 'bindingId', 'sourceId', 'relativePath', 'sha256'])
      || !integer(entry.processSequence, 0, 1000000)
      || !ID.test(entry.bindingId || '') || !ID.test(entry.sourceId || '')
      || !safeRelative(entry.relativePath) || !SHA256.test(entry.sha256 || '')
      || !processesBySequence.has(entry.processSequence)) {
      fail('bootstrap_closure_import_invalid')
    }
    const binding = `${entry.bindingId}\0${entry.sourceId}`
    const file = filesByBinding.get(binding)
    if (!file || !file.uses.includes('imported')
      || file.relativePath.replaceAll('\\', '/').toLowerCase()
        !== entry.relativePath.replaceAll('\\', '/').toLowerCase()
      || file.sha256 !== entry.sha256) {
      fail('bootstrap_closure_import_unbound')
    }
    const key = `${entry.processSequence}\0${binding}`
    if (observedImports.has(key)) fail('bootstrap_closure_import_duplicate')
    observedImports.add(key)
    importedBindings.add(binding)
  }
  for (const [binding, file] of filesByBinding) {
    if (file.uses.includes('imported') && !importedBindings.has(binding)) {
      fail('bootstrap_closure_import_unobserved')
    }
  }
  for (const module of closure.systemModules) {
    if (!exact(module, ['fileName', 'bytes', 'sha256'])
      || module.fileName !== basename(module.fileName || '')
      || !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,255}$/.test(module.fileName || '')
      || !integer(module.bytes, 1, Number.MAX_SAFE_INTEGER) || !SHA256.test(module.sha256 || '')) {
      fail('bootstrap_closure_inventory_invalid')
    }
  }
  const gitFiles = closure.runtimeFiles.filter((file) =>
    file.bindingId === closure.sourceIdentity.gitBindingId
      && file.sourceId === closure.sourceIdentity.gitSourceId
      && file.uses.includes('executed'))
  const gitProcesses = closure.processes.filter((process) =>
    process.imageBindingId === closure.sourceIdentity.gitBindingId
      && process.sourceId === closure.sourceIdentity.gitSourceId)
  if (gitFiles.length !== 1 || gitProcesses.length < 1) {
    fail('bootstrap_closure_inventory_invalid')
  }
  return { processCount: closure.processCount, runtimeFileCount: closure.runtimeFileCount,
    systemModuleCount: closure.systemModuleCount }
}

export async function verifyEvidenceDirectory(directory, stage, expectedSha) {
  if (!EXACT_SHA.test(expectedSha || '')
    || !['observer-probe', 'capture', 'rehearsal'].includes(stage)) {
    fail('bootstrap_evidence_arguments_invalid')
  }
  const expected = stage === 'observer-probe'
    ? ['postgres17-observer-probe.json']
    : stage === 'capture' ? ['postgres17-stage1-candidate.json']
      : ['postgres17-rehearsal.json', 'postgres17-rehearsal.json.raw.json',
        'postgres17-stage2-cleanup.json', 'postgres17-stage2-closure.json']
  const actual = (await readdir(directory)).sort()
  if (actual.join('\0') !== expected.sort().join('\0')) fail('bootstrap_evidence_file_set_invalid')
  const values = {}
  const bytes = {}
  for (const name of expected) {
    bytes[name] = await readFile(join(directory, name))
    values[name] = safeJson(bytes[name])
  }
  if (stage === 'observer-probe') {
    return validateObserverProbe(values['postgres17-observer-probe.json'], expectedSha)
  }
  if (stage === 'capture') {
    const candidate = values[expected[0]]
    // Capture is deliberately non-authoritative, but even its sanitized record
    // must describe the exact source-controlled artifact and publisher, not an
    // arbitrary validly signed installer supplied by a caller.
    const bootstrapPolicy = JSON.parse(await readFile(new URL(
      '../hq/research/postgres17-windows-bootstrap-policy.json', import.meta.url)))
    const publisherPolicy = JSON.parse(await readFile(new URL(
      '../hq/research/postgres17-publisher-policy.json', import.meta.url)))
    const installer = bootstrapPolicy.installer
    const signer = publisherPolicy.approvedSigners?.[0]
    const observationKeys = ['contract', 'artifactFileName', 'artifactBytes', 'artifactSha256',
      'signatureStatus', 'signatureType', 'signerCertificateSha256', 'signerSubject',
      'signerIssuer', 'timestampCertificateSha256', 'timestampSubject', 'ekuOids']
    if (!exact(candidate, ['contract', 'authoritative', 'exactSha', 'installer', 'documentation',
      'executionPerformed', 'databaseRehearsalReceiptCreated', 'cleanup', 'secretValuesExposed'])
      || !exact(candidate.installer, observationKeys)
      || !exact(candidate.documentation, ['url', 'sha256'])
      || !exact(candidate.cleanup,
        ['serviceInventoryUnchanged', 'temporaryDataRemoved', 'processOrPortCheckApplicable'])
      || candidate.contract !== 'supermega.postgres17-stage1-candidate.v1'
      || candidate.authoritative !== false || candidate.exactSha !== expectedSha
      || candidate.executionPerformed !== false
      || candidate.databaseRehearsalReceiptCreated !== false
      || candidate.secretValuesExposed !== false
      || candidate.installer.contract !== 'supermega.windows-authenticode-observation.v1'
      || typeof candidate.installer.artifactFileName !== 'string'
      || !integer(candidate.installer.artifactBytes, 1, Number.MAX_SAFE_INTEGER)
      || !SHA256.test(candidate.installer.artifactSha256 || '')
      || candidate.installer.signatureStatus !== 'Valid'
      || candidate.installer.signatureType !== 'Authenticode'
      || !SHA256.test(candidate.installer.signerCertificateSha256 || '')
      || typeof candidate.installer.signerSubject !== 'string'
      || typeof candidate.installer.signerIssuer !== 'string'
      || !SHA256.test(candidate.installer.timestampCertificateSha256 || '')
      || typeof candidate.installer.timestampSubject !== 'string'
      || !Array.isArray(candidate.installer.ekuOids)
      || candidate.installer.ekuOids.length < 1
      || candidate.installer.ekuOids.some((value) =>
        typeof value !== 'string' || !/^\d+(?:\.\d+)+$/.test(value))
      || typeof candidate.documentation.url !== 'string'
      || !candidate.documentation.url.startsWith('https://')
      || !SHA256.test(candidate.documentation.sha256 || '')
      || candidate.cleanup.serviceInventoryUnchanged !== true
      || candidate.cleanup.temporaryDataRemoved !== true
      || candidate.cleanup.processOrPortCheckApplicable !== false
      || bootstrapPolicy.contract !== 'supermega.postgres17-windows-bootstrap-policy.v1'
      || publisherPolicy.contract !== 'supermega.postgres17-publisher-policy.v1'
      || installer?.publisherPolicyPath !== 'hq/research/postgres17-publisher-policy.json'
      || candidate.installer.artifactFileName !== installer.fileName
      || candidate.installer.artifactBytes !== installer.bytes
      || candidate.installer.artifactSha256 !== installer.sha256
      || publisherPolicy.requiredSignatureType !== 'Authenticode'
      || candidate.installer.signerCertificateSha256 !== signer?.certificateSha256
      || candidate.installer.signerSubject !== signer?.subject
      || candidate.installer.signerIssuer !== signer?.issuer
      || !publisherPolicy.approvedTimestampCertificateSha256?.includes(
        candidate.installer.timestampCertificateSha256)
      || !publisherPolicy.requiredEkuOids?.every((oid) => candidate.installer.ekuOids.includes(oid))
      || candidate.documentation.url !== bootstrapPolicy.execution?.authoritativeDocumentationUrl
      || candidate.documentation.sha256 !== bootstrapPolicy.execution?.authoritativeDocumentationSha256) {
      fail('bootstrap_stage1_candidate_invalid')
    }
    return { stage, exactSha: expectedSha }
  }
  const closure = values['postgres17-stage2-closure.json']
  validateSanitizedClosure(closure, expectedSha)
  const cleanup = values['postgres17-stage2-cleanup.json']
  if (!exact(cleanup, ['contract', 'authoritative', 'exactSha', 'serviceInventoryUnchanged',
    'allSelectedPortsClosed', 'selectedPortCount', 'temporaryDataRemoved', 'allProcessesExited',
    'closureEvidenceSha256', 'receiptSha256', 'rawReceiptSha256',
    'receiptReconstructionRawRetained', 'secretValuesExposed'])
    || cleanup.contract !== 'supermega.postgres17-stage2-cleanup.v1'
    || cleanup.authoritative !== false || cleanup.exactSha !== expectedSha
    || cleanup.secretValuesExposed !== false || cleanup.serviceInventoryUnchanged !== true
    || cleanup.allSelectedPortsClosed !== true || cleanup.temporaryDataRemoved !== true
    || cleanup.allProcessesExited !== true || cleanup.receiptReconstructionRawRetained !== true
    || !integer(cleanup.selectedPortCount, 1, 65535)
    || cleanup.selectedPortCount !== closure.selectedPorts.length
    || cleanup.closureEvidenceSha256 !== digest(bytes['postgres17-stage2-closure.json'])
    || cleanup.receiptSha256 !== digest(bytes['postgres17-rehearsal.json'])
    || cleanup.rawReceiptSha256 !== digest(bytes['postgres17-rehearsal.json.raw.json'])
    || closure.receiptSha256 !== cleanup.receiptSha256
    || closure.rawReceiptSha256 !== cleanup.rawReceiptSha256) fail('bootstrap_stage2_evidence_invalid')
  return { stage, exactSha: expectedSha, receiptSha256: cleanup.receiptSha256 }
}

async function main() {
  const [directory, stage, expectedSha] = process.argv.slice(2)
  console.log(JSON.stringify(await verifyEvidenceDirectory(directory, stage, expectedSha)))
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
