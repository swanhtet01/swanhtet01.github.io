import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  validateSanitizedClosure,
  verifyEvidenceDirectory,
} from './postgres17_windows_evidence_contract.mjs'

import {
  combinedPolicySha256,
  inspectOfficialRegistryPolicy,
  OFFICIAL_REGISTRY_OBSERVATION_CONTRACT,
  OFFICIAL_REGISTRY_SOURCE_METHOD,
  PYPI_RELEASE_JSON_METHOD,
  reconstructOfficialRegistryEvidence,
  verifyOfficialRegistryEvidence,
} from './postgres17_source_registry.mjs'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

function closureFixture() {
  const digest = 'a'.repeat(64)
  return {
    contract: 'supermega.windows-process-image-observer.v1', exactSha: 'b'.repeat(40),
    captureStartedBeforeSpawn: true, rehearsalObserved: true, droppedEvents: 0,
    descendantCorrelationComplete: true, runtimeModulesComplete: true,
    processTreeComplete: true, allProcessesExited: true, serviceInventoryUnchanged: true,
    allSelectedPortsClosed: true, selectedPorts: [54321], temporaryDataRemoved: true,
    profileId: 'fixture-profile', runtimeClosureEvidenceSha256: digest,
    sourceDigest: digest, bindingDigest: digest, receiptSha256: digest,
    rawReceiptSha256: digest, processCount: 1, runtimeFileCount: 1,
    systemModuleCount: 1,
    processes: [{ sequence: 0, parentSequence: null, imageBindingId: 'node-binding',
      sourceId: 'node-source', exitCode: 0 }],
    runtimeFiles: [{ bindingId: 'node-binding', sourceId: 'node-source',
      relativePath: 'node/node.exe', bytes: 10, sha256: digest, uses: ['executed'] }],
    systemModules: [{ fileName: 'kernel32.dll', bytes: 10, sha256: digest }],
  }
}

function registryFixture() {
  const artifactBytes = 123
  const artifactSha256 = sha256('artifact')
  const metadata = Buffer.from(JSON.stringify({
    info: { name: 'psycopg', version: '3.3.4' },
    urls: [{ filename: 'psycopg-3.3.4-py3-none-any.whl',
      url: 'https://files.pythonhosted.org/packages/psycopg-3.3.4-py3-none-any.whl',
      yanked: false,
      packagetype: 'bdist_wheel', size: artifactBytes,
      digests: { sha256: artifactSha256 } }],
  }))
  const artifact = {
    sourceId: 'psycopg-3.3.4-win-amd64', component: 'psycopg',
    artifactHost: 'files.pythonhosted.org', metadataHost: 'pypi.org',
    artifactUrl: 'https://files.pythonhosted.org/packages/psycopg-3.3.4-py3-none-any.whl',
    metadataUrl: 'https://pypi.org/pypi/psycopg/3.3.4/json',
    packageName: 'psycopg', packageVersion: '3.3.4', platform: 'any',
    fileName: 'psycopg-3.3.4-py3-none-any.whl', bytes: artifactBytes,
    sha256: artifactSha256, metadataKind: 'pypi-json-v1',
    authenticationMethod: PYPI_RELEASE_JSON_METHOD,
    authenticationRequirements: {
      nonYanked: true, packageType: 'bdist_wheel', requiredWheelTag: 'py3-none-any',
    },
    metadataBytes: metadata.length, metadataSha256: sha256(metadata),
  }
  const policy = {
    contract: 'supermega.postgres17-official-registry-policy.v1',
    policyId: 'fixture-registry-policy', status: 'reviewed', testOnly: false,
    requiredComponents: ['python', 'psycopg', 'psycopg_binary', 'openssl', 'node', 'git'],
    artifacts: [artifact],
    approval: { status: 'reviewed', reviewedBy: 'independent-reviewer',
      reviewedAt: '2026-10-31T00:00:00.000Z' },
  }
  const source = {
    sourceId: artifact.sourceId, component: artifact.component,
    fileName: artifact.fileName, bytes: artifact.bytes, sha256: artifact.sha256,
  }
  const authentication = { method: OFFICIAL_REGISTRY_SOURCE_METHOD,
    policyId: policy.policyId }
  const evidence = {
    contract: OFFICIAL_REGISTRY_OBSERVATION_CONTRACT, status: 'reviewed',
    sourceId: artifact.sourceId, component: artifact.component,
    artifactHost: artifact.artifactHost, metadataHost: artifact.metadataHost,
    artifactUrl: artifact.artifactUrl,
    metadataUrl: artifact.metadataUrl, packageName: artifact.packageName,
    packageVersion: artifact.packageVersion, platform: artifact.platform,
    fileName: artifact.fileName, artifactBytes: artifact.bytes,
    artifactSha256: artifact.sha256, metadataKind: artifact.metadataKind,
    metadataBytes: artifact.metadataBytes, metadataSha256: artifact.metadataSha256,
    authenticationMethod: artifact.authenticationMethod,
    authenticationRequirements: artifact.authenticationRequirements,
    retainedMetadata: { mediaType: 'text/plain', bodyBase64: metadata.toString('base64') },
    retainedAuthenticationEvidence: null,
    approval: { status: 'reviewed', reviewedBy: 'other-reviewer',
      reviewedAt: '2026-10-31T00:01:00.000Z' },
  }
  return { artifact, policy, source, authentication, evidence }
}

test('manual workflow is exact-SHA, read-only, pinned, credential-free, and never automatic', async () => {
  const workflow = await readFile(new URL('../.github/workflows/postgres17-windows-evidence.yml', import.meta.url), 'utf8')
  assert.match(workflow, /^on:\n  workflow_dispatch:/m)
  assert.doesNotMatch(workflow, /^  (push|pull_request|schedule):/m)
  assert.match(workflow, /^permissions:\n  contents: read$/m)
  assert.match(workflow, /runs-on: windows-2025/)
  assert.match(workflow, /persist-credentials: false/)
  assert.match(workflow, /dispatch_ref_not_exact_sha/)
  assert.match(workflow, /checkout_not_clean/)
  assert.match(workflow, /retention-days: 7/)
  assert.match(workflow, /if: success\(\)/)
  assert.match(workflow, /postgres17-stage1-candidate\.json/)
  assert.match(workflow, /postgres17-stage2-cleanup\.json/)
  assert.match(workflow, /postgres17-stage2-closure\.json/)
  assert.match(workflow, /postgres17-rehearsal\.json/)
  assert.match(workflow, /postgres17-rehearsal\.json\.raw\.json/)
  assert.doesNotMatch(workflow, /secrets\./)
  assert.doesNotMatch(workflow, /permissions:[\s\S]*id-token:\s*write/)
  for (const uses of workflow.matchAll(/^\s*uses:\s*([^\s]+)$/gm)) {
    assert.match(uses[1], /@[0-9a-f]{40}$/)
  }
  assert.equal(workflow.includes('record_postgres17_rehearsal.mjs'), false,
    'stage 1/2 selection stays inside the guarded bootstrap script')
  assert.doesNotMatch(workflow, /run:\s*\|[\s\S]*'\$\{\{\s*inputs\./)
  assert.match(workflow, /EXACT_SHA: \$\{\{ inputs\.exact_sha \}\}/)
})

test('bootstrap policy pins exact installer and documented service-free flags but remains disabled', async () => {
  const policy = JSON.parse(await readFile(new URL('../hq/research/postgres17-windows-bootstrap-policy.json', import.meta.url)))
  assert.equal(policy.status, 'pending-closure-observer')
  assert.equal(policy.installer.bytes, 413001200)
  assert.equal(policy.installer.sha256,
    '612c7f5400a003aaffa0372cb273eed52278f93c680ab911eb9cb2229e329072')
  assert.equal(policy.execution.authoritativeDocumentationSha256,
    '6b60234851ac72ff5d2447058d4d2826d0aef8652b9ba31da6c05e02c12133e0')
  assert.deepEqual(policy.execution.arguments, [
    '--extract-only', '1', '--mode', 'unattended', '--unattendedmodeui', 'none',
    '--prefix', '{runtimeRoot}', '--install_runtimes', '0', '--create_shortcuts', '0',
  ])
  assert.equal(policy.execution.serviceInstallationAllowed, false)
  assert.equal(policy.closureObserver.status, 'pending')
  assert.equal(policy.approval.status, 'pending')
})

test('PowerShell bootstrap separates non-executing capture from reviewed full-rehearsal observation', async () => {
  const source = await readFile(new URL('./postgres17_windows_evidence_bootstrap.ps1', import.meta.url), 'utf8')
  const download = source.indexOf('GetByteArrayAsync')
  const stage2 = source.indexOf("if ($Stage -eq 'Rehearsal')")
  const gate = source.indexOf("Fail 'bootstrap_closure_observer_unapproved'")
  const execute = source.indexOf('$process.StartInfo.FileName = $observer')
  assert.ok(download > 0 && download < stage2 && stage2 < gate && gate < execute)
  for (const required of [
    'bootstrap_source_head_mismatch', 'bootstrap_source_tree_dirty',
    'bootstrap_ambient_override_rejected_', 'bootstrap_source_identity_mismatch',
    'bootstrap_authenticode_identity_mismatch', 'captureStartedBeforeSpawn', 'rehearsalObserved',
    'droppedEvents', 'descendantCorrelationComplete', 'runtimeModulesComplete',
    'runtimeClosureEvidenceSha256', 'receiptSha256', 'rawReceiptSha256',
    'bootstrap_closure_inventory_incomplete', 'bootstrap_closure_inventory_invalid',
    'bootstrap_service_cleanup_failed', 'bootstrap_data_cleanup_failed',
    'bootstrap_stage2_authority_unapproved', 'bootstrap_registry_component_missing_',
    "$rawReceiptPath = $receiptPath + '.raw.json'", 'executionPerformed = $false',
  ]) assert.ok(source.includes(required), required)
  assert.equal(source.includes('Get-Process).Modules'), false)
  assert.equal(source.includes('Get-FileHash'), false)
  assert.equal(source.includes('Start-Service'), false)
})

test('official registry contract requires official metadata and independent approvals', () => {
  const input = registryFixture()
  // Keep the evidence-verifier fixture focused on Psycopg. Other component
  // method shapes are covered by fail-closed policy tests below.
  input.policy.requiredComponents = ['psycopg']
  input.policy.artifacts = [input.artifact]
  assert.throws(() => inspectOfficialRegistryPolicy(input.policy), /registry_policy_invalid/)
  input.policy.requiredComponents = ['python', 'psycopg', 'psycopg_binary', 'openssl', 'node', 'git']
  input.policy.artifacts = [input.artifact]
  const inspection = inspectOfficialRegistryPolicy(input.policy)
  assert.equal(inspection.ready, false)
  assert.ok(inspection.blockers.includes('registry_component_missing:python'))
  // Synthetic verification uses a structurally complete policy assembled by
  // the dedicated fixture helper below.
  input.policy = completeSyntheticRegistryPolicy(input.policy, input.artifact)
  const result = verifyOfficialRegistryEvidence(input)
  assert.equal(result.sourceId, input.source.sourceId)
  assert.equal(result.registryPolicyId, input.policy.policyId)
  for (const mutate of [
    (value) => { value.evidence.metadataSha256 = sha256('other') },
    (value) => { value.evidence.retainedMetadata.bodyBase64 = Buffer.from('other').toString('base64') },
    (value) => { value.evidence.artifactUrl = 'https://mirror.example.invalid/file.zip' },
    (value) => { value.evidence.approval.status = 'pending' },
    (value) => { value.evidence.approval.reviewedBy = value.policy.approval.reviewedBy },
    (value) => { value.evidence.approval.reviewedBy = value.policy.approval.reviewedBy.toUpperCase() },
    (value) => { value.evidence.approval.reviewedBy = ' ' },
    (value) => { value.authentication.policyId = 'other' },
  ]) {
    const changed = structuredClone(input); mutate(changed)
    assert.throws(() => verifyOfficialRegistryEvidence(changed), /registry_/)
  }
})

function completeSyntheticRegistryPolicy(policy, psycopgArtifact) {
  const metadata = Buffer.from('{"status":"reviewed"}')
  const digest = sha256(metadata)
  const artifactFor = (component, method, kind, requirements) => ({
    ...psycopgArtifact,
    sourceId: `${component}-fixture`, component,
    artifactUrl: `https://${component === 'node' ? 'nodejs.org' : component === 'python' ? 'python.org' : 'example.invalid'}/${component}.zip`,
    metadataUrl: `https://${component === 'node' ? 'nodejs.org' : component === 'python' ? 'python.org' : 'example.invalid'}/${component}.json`,
    artifactHost: component === 'node' ? 'nodejs.org' : component === 'python' ? 'python.org' : 'example.invalid',
    metadataHost: component === 'node' ? 'nodejs.org' : component === 'python' ? 'python.org' : 'example.invalid',
    packageName: component, fileName: `${component}.zip`,
    metadataKind: kind, metadataBytes: metadata.length, metadataSha256: digest,
    authenticationMethod: method, authenticationRequirements: requirements,
  })
  const authenticode = (evidenceId, seed) => ({
    evidencePath: `evidence/${evidenceId}.json`, evidenceBytes: 1,
    evidenceSha256: seed.repeat(64), requiredEkuOids: ['1.3.6.1.5.5.7.3.3'],
    signerCertificateSha256: String(Number(seed) + 1).repeat(64),
    timestampCertificateSha256: String(Number(seed) + 2).repeat(64),
  })
  const alignAuthenticodeMetadata = (artifact) => {
    artifact.metadataUrl = artifact.artifactUrl
    artifact.authenticationRequirements.evidenceBytes = artifact.metadataBytes
    artifact.authenticationRequirements.evidenceSha256 = artifact.metadataSha256
  }
  const pythonArtifact = artifactFor('python', 'windows-authenticode-artifact-v1',
    'windows-authenticode-observation-v1', {
      ...authenticode('python-policy', '1'),
    })
  pythonArtifact.fileName = 'python.exe'
  pythonArtifact.packageName = 'Python'
  pythonArtifact.artifactHost = 'www.python.org'; pythonArtifact.metadataHost = 'www.python.org'
  pythonArtifact.artifactUrl = 'https://www.python.org/ftp/python/3.12.15/python.exe'
  alignAuthenticodeMetadata(pythonArtifact)
  const postgresArtifact = artifactFor('postgresql', 'windows-authenticode-artifact-v1',
    'windows-authenticode-observation-v1', {
      evidencePath: 'evidence/postgres.json', evidenceBytes: 1,
      evidenceSha256: '9'.repeat(64), requiredEkuOids: ['1.3.6.1.5.5.7.3.3'],
      signerCertificateSha256: '8'.repeat(64), timestampCertificateSha256: '7'.repeat(64),
    })
  postgresArtifact.fileName = 'postgresql.exe'
  postgresArtifact.packageName = 'PostgreSQL'
  postgresArtifact.artifactHost = 'get.enterprisedb.com'
  postgresArtifact.metadataHost = 'get.enterprisedb.com'
  postgresArtifact.artifactUrl = 'https://get.enterprisedb.com/postgresql/postgresql.exe'
  alignAuthenticodeMetadata(postgresArtifact)
  const psycopgBinaryArtifact = artifactFor('psycopg_binary', 'pypi-release-json-v1',
    'pypi-json-v1', {
      nonYanked: true, packageType: 'bdist_wheel',
      requiredWheelTag: 'cp312-cp312-win_amd64',
    })
  psycopgBinaryArtifact.packageName = 'psycopg-binary'
  psycopgBinaryArtifact.artifactHost = 'files.pythonhosted.org'
  psycopgBinaryArtifact.metadataHost = 'pypi.org'
  psycopgBinaryArtifact.artifactUrl =
    'https://files.pythonhosted.org/packages/psycopg_binary-3.3.4-cp312-cp312-win_amd64.whl'
  psycopgBinaryArtifact.metadataUrl = 'https://pypi.org/pypi/psycopg-binary/3.3.4/json'
  psycopgBinaryArtifact.fileName = 'psycopg_binary-3.3.4-cp312-cp312-win_amd64.whl'
  psycopgBinaryArtifact.platform = 'win_amd64'
  const opensslArtifact = artifactFor('openssl', 'authenticated-bundle-member-v1',
    'bundle-entry-manifest-v1', {
      parentSourceId: 'postgresql-fixture', bundleRelativePath: 'bin/openssl.exe',
      inventoryEvidencePath: 'evidence/openssl.json', inventoryEvidenceBytes: 1,
      inventoryEvidenceSha256: 'd'.repeat(64),
    })
  for (const key of ['artifactUrl', 'artifactHost', 'packageVersion', 'platform']) {
    opensslArtifact[key] = postgresArtifact[key]
  }
  opensslArtifact.authenticationRequirements.inventoryEvidenceBytes = metadata.length
  opensslArtifact.authenticationRequirements.inventoryEvidenceSha256 = digest
  const nodeArtifact = artifactFor('node', 'windows-authenticode-artifact-v1',
    'windows-authenticode-observation-v1', authenticode('node-policy', '4'))
  nodeArtifact.packageName = 'Node.js'
  nodeArtifact.fileName = 'node.msi'
  nodeArtifact.artifactUrl = 'https://nodejs.org/dist/v3.3.4/node.msi'
  alignAuthenticodeMetadata(nodeArtifact)
  return {
    ...policy,
    artifacts: [psycopgArtifact,
      psycopgBinaryArtifact,
      postgresArtifact,
      pythonArtifact,
      opensslArtifact,
      nodeArtifact,
      (() => {
        const git = artifactFor('git', 'windows-authenticode-artifact-v1',
          'windows-authenticode-observation-v1', {
          evidencePath: 'evidence/git.json', evidenceBytes: 1,
          evidenceSha256: '1'.repeat(64), requiredEkuOids: ['1.3.6.1.5.5.7.3.3'],
          signerCertificateSha256: '2'.repeat(64), timestampCertificateSha256: '3'.repeat(64),
          })
        git.fileName = 'git.exe'; git.packageName = 'Git for Windows'
        git.artifactHost = 'github.com'; git.metadataHost = 'github.com'
        git.artifactUrl = 'https://github.com/git-for-windows/git/releases/download/v1/git.exe'
        alignAuthenticodeMetadata(git)
        return git
      })(),
    ],
  }
}

function componentEvidence(policy, component) {
  const artifact = policy.artifacts.find((candidate) => candidate.component === component)
  let metadata
  let retainedAuthenticationEvidence = null
  if (artifact.authenticationMethod === 'pypi-release-json-v1') {
    metadata = Buffer.from(JSON.stringify({
      info: { name: artifact.packageName, version: artifact.packageVersion },
      urls: [{ filename: artifact.fileName, url: artifact.artifactUrl, yanked: false,
        packagetype: 'bdist_wheel', size: artifact.bytes,
        digests: { sha256: artifact.sha256 } }],
    }))
  } else if (artifact.authenticationMethod === 'windows-authenticode-artifact-v1') {
    metadata = Buffer.from(JSON.stringify({
      contract: 'supermega.windows-authenticode-observation.v1',
      artifactFileName: artifact.fileName, artifactBytes: artifact.bytes,
      artifactSha256: artifact.sha256, signatureStatus: 'Valid', signatureType: 'Authenticode',
      signerCertificateSha256: artifact.authenticationRequirements.signerCertificateSha256,
      signerSubject: 'CN=Fixture Publisher', signerIssuer: 'CN=Fixture Issuer',
      timestampCertificateSha256: artifact.authenticationRequirements.timestampCertificateSha256,
      timestampSubject: 'CN=Fixture Timestamp',
      ekuOids: artifact.authenticationRequirements.requiredEkuOids,
    }))
    artifact.metadataUrl = artifact.artifactUrl
    retainedAuthenticationEvidence = { mediaType: 'application/json',
      bodyBase64: metadata.toString('base64') }
  } else {
    const body = { contract: `supermega.${artifact.authenticationMethod}.v1`,
      sourceId: artifact.sourceId, artifactSha256: artifact.sha256,
      artifactBytes: artifact.bytes, status: 'reviewed' }
    if (artifact.authenticationMethod === 'authenticated-bundle-member-v1') {
      Object.assign(body, {
        parentSourceId: artifact.authenticationRequirements.parentSourceId,
        parentArtifactSha256: policy.artifacts.find(({ sourceId }) =>
          sourceId === artifact.authenticationRequirements.parentSourceId).sha256,
        bundleRelativePath: artifact.authenticationRequirements.bundleRelativePath,
        entries: [{ relativePath: artifact.authenticationRequirements.bundleRelativePath,
          bytes: artifact.bytes, sha256: artifact.sha256 }],
      })
    }
    metadata = Buffer.from(JSON.stringify(body))
  }
  artifact.metadataBytes = metadata.length
  artifact.metadataSha256 = sha256(metadata)
  if (artifact.authenticationMethod === 'authenticated-bundle-member-v1') {
    artifact.authenticationRequirements.inventoryEvidenceBytes = metadata.length
    artifact.authenticationRequirements.inventoryEvidenceSha256 = artifact.metadataSha256
  }
  if (artifact.authenticationMethod === 'windows-authenticode-artifact-v1') {
    artifact.authenticationRequirements.evidenceBytes = metadata.length
    artifact.authenticationRequirements.evidenceSha256 = sha256(metadata)
  }
  const parentArtifact = artifact.authenticationMethod === 'authenticated-bundle-member-v1'
    ? policy.artifacts.find(({ sourceId }) =>
      sourceId === artifact.authenticationRequirements.parentSourceId)
    : null
  const verifiedParentAuthentication = parentArtifact ? {
    sourceId: parentArtifact.sourceId,
    sourceArtifactSha256: parentArtifact.sha256,
    signerCertificateSha256:
      parentArtifact.authenticationRequirements.signerCertificateSha256,
    timestampCertificateSha256:
      parentArtifact.authenticationRequirements.timestampCertificateSha256,
  } : null
  return {
    source: { sourceId: artifact.sourceId, component: artifact.component,
      fileName: artifact.fileName, bytes: artifact.bytes, sha256: artifact.sha256 },
    authentication: { method: OFFICIAL_REGISTRY_SOURCE_METHOD,
      policyId: policy.policyId },
    policy,
    observedAuthentication: retainedAuthenticationEvidence
      ? JSON.parse(Buffer.from(retainedAuthenticationEvidence.bodyBase64, 'base64').toString())
      : null,
    verifiedParentAuthentication,
    evidence: {
      contract: OFFICIAL_REGISTRY_OBSERVATION_CONTRACT, status: 'reviewed',
      sourceId: artifact.sourceId, component: artifact.component,
      artifactHost: artifact.artifactHost, metadataHost: artifact.metadataHost,
      artifactUrl: artifact.artifactUrl, metadataUrl: artifact.metadataUrl,
      packageName: artifact.packageName, packageVersion: artifact.packageVersion,
      platform: artifact.platform, fileName: artifact.fileName,
      artifactBytes: artifact.bytes, artifactSha256: artifact.sha256,
      metadataKind: artifact.metadataKind, metadataBytes: artifact.metadataBytes,
      metadataSha256: artifact.metadataSha256,
      authenticationMethod: artifact.authenticationMethod,
      authenticationRequirements: artifact.authenticationRequirements,
      retainedMetadata: { mediaType: 'application/json',
        bodyBase64: metadata.toString('base64') },
      retainedAuthenticationEvidence,
      approval: { status: 'reviewed', reviewedBy: 'component-reviewer',
        reviewedAt: '2026-10-31T00:02:00.000Z' },
    },
  }
}

test('retained component authentication evidence is parsed and exact-bound', () => {
  for (const component of ['python', 'node', 'git', 'psycopg_binary', 'openssl']) {
    const fixture = registryFixture()
    const policy = completeSyntheticRegistryPolicy(fixture.policy, fixture.artifact)
    const input = componentEvidence(policy, component)
    assert.equal(verifyOfficialRegistryEvidence(input).sourceId, input.source.sourceId)
    const changed = structuredClone(input)
    if (changed.evidence.retainedAuthenticationEvidence) {
      const body = JSON.parse(Buffer.from(
        changed.evidence.retainedAuthenticationEvidence.bodyBase64, 'base64').toString())
      body.signatureStatus = 'NotSigned'
      const bytes = Buffer.from(JSON.stringify(body))
      changed.evidence.retainedAuthenticationEvidence.bodyBase64 = bytes.toString('base64')
      const artifact = changed.policy.artifacts.find((value) => value.component === component)
      const requirements = artifact.authenticationRequirements
      const bytesKey = 'evidenceBytes'
      const hashKey = 'evidenceSha256'
      requirements[bytesKey] = bytes.length; requirements[hashKey] = sha256(bytes)
      artifact.metadataBytes = bytes.length; artifact.metadataSha256 = sha256(bytes)
      changed.evidence.retainedMetadata.bodyBase64 = bytes.toString('base64')
      changed.evidence.metadataBytes = bytes.length
      changed.evidence.metadataSha256 = artifact.metadataSha256
      changed.evidence.authenticationRequirements = requirements
    } else {
      const body = JSON.parse(Buffer.from(
        changed.evidence.retainedMetadata.bodyBase64, 'base64').toString())
      if (component === 'openssl') body.bundleRelativePath = 'bin/substituted.exe'
      else body.urls[0].yanked = true
      const bytes = Buffer.from(JSON.stringify(body))
      changed.evidence.retainedMetadata.bodyBase64 = bytes.toString('base64')
      const artifact = changed.policy.artifacts.find((value) => value.component === component)
      artifact.metadataBytes = bytes.length; artifact.metadataSha256 = sha256(bytes)
      if (component === 'openssl') {
        artifact.authenticationRequirements.inventoryEvidenceBytes = bytes.length
        artifact.authenticationRequirements.inventoryEvidenceSha256 = artifact.metadataSha256
      }
      changed.evidence.metadataBytes = bytes.length
      changed.evidence.metadataSha256 = artifact.metadataSha256
    }
    assert.throws(() => verifyOfficialRegistryEvidence(changed), /registry_metadata_/)
  }
})

test('receipt reconstruction is explicit and cannot replace fresh runtime authentication', () => {
  const fixture = registryFixture()
  const policy = completeSyntheticRegistryPolicy(fixture.policy, fixture.artifact)
  const input = componentEvidence(policy, 'python')
  const withoutFreshObservation = { ...input, observedAuthentication: null }
  assert.throws(() => verifyOfficialRegistryEvidence(withoutFreshObservation),
    /registry_metadata_binding_invalid/)
  assert.equal(reconstructOfficialRegistryEvidence(withoutFreshObservation).sourceId,
    input.source.sourceId)
  const tampered = structuredClone(withoutFreshObservation)
  tampered.evidence.retainedAuthenticationEvidence.bodyBase64 = Buffer.from('{}').toString('base64')
  assert.throws(() => reconstructOfficialRegistryEvidence(tampered), /registry_/)
})

test('generic digest metadata and unsupported component schemes cannot become production trust', () => {
  const input = registryFixture()
  input.policy.artifacts[0].component = 'python'
  assert.throws(() => inspectOfficialRegistryPolicy(input.policy), /registry_policy_invalid/)
  const opaque = registryFixture()
  opaque.policy = completeSyntheticRegistryPolicy(opaque.policy, opaque.artifact)
  opaque.evidence.retainedMetadata.bodyBase64 = Buffer.from('opaque approved bytes').toString('base64')
  assert.throws(() => verifyOfficialRegistryEvidence(opaque), /registry_metadata_/)
})

test('pending source registry policy cannot authenticate any production artifact', async () => {
  const policy = JSON.parse(await readFile(new URL('../hq/research/postgres17-official-source-policy.json', import.meta.url)))
  const inspection = inspectOfficialRegistryPolicy(policy)
  assert.equal(inspection.ready, false)
  assert.ok(inspection.blockers.includes('registry_policy_not_reviewed'))
  assert.ok(inspection.blockers.includes('registry_policy_independent_approval_missing'))
  for (const component of ['python', 'psycopg', 'psycopg_binary', 'openssl', 'node', 'git']) {
    assert.ok(inspection.blockers.includes(`registry_component_missing:${component}`))
  }
})

test('component policies reject weak signatures, unknown methods and unbound bundle members', () => {
  const fixture = registryFixture()
  const complete = completeSyntheticRegistryPolicy(fixture.policy, fixture.artifact)
  assert.equal(inspectOfficialRegistryPolicy(complete).ready, true)
  const mutations = [
    (policy) => { policy.artifacts.find(({ component }) => component === 'node')
      .authenticationRequirements.requiredEkuOids = [] },
    (policy) => { policy.artifacts.find(({ component }) => component === 'python')
      .authenticationRequirements.signerCertificateSha256 = null },
    (policy) => { policy.artifacts.find(({ component }) => component === 'git')
      .authenticationRequirements.requiredEkuOids = [] },
    (policy) => { policy.artifacts.find(({ component }) => component === 'openssl')
      .authenticationRequirements.bundleRelativePath = '../openssl.exe' },
    (policy) => { policy.artifacts.find(({ component }) => component === 'psycopg')
      .authenticationMethod = 'reviewed-source-digest-v1' },
    (policy) => { policy.artifacts.find(({ component }) => component === 'psycopg_binary')
      .fileName = 'psycopg_binary-3.3.4-cp313-cp313-win_amd64.whl' },
    (policy) => {
      const git = policy.artifacts.find(({ component }) => component === 'git')
      git.artifactHost = 'mirror.example.invalid'
      git.artifactUrl = 'https://mirror.example.invalid/git.exe'
    },
  ]
  for (const mutate of mutations) {
    const changed = structuredClone(complete); mutate(changed)
    assert.throws(() => inspectOfficialRegistryPolicy(changed), /registry_policy_invalid/)
  }
  const missingParent = structuredClone(complete)
  missingParent.artifacts.find(({ component }) => component === 'openssl')
    .authenticationRequirements.parentSourceId = 'unknown'
  const inspection = inspectOfficialRegistryPolicy(missingParent)
  assert.equal(inspection.ready, false)
  assert.ok(inspection.blockers.some((value) => value.startsWith('registry_bundle_parent_invalid:')))
  const mismatchedPair = structuredClone(complete)
  mismatchedPair.artifacts.find(({ component }) => component === 'psycopg_binary')
    .packageVersion = '3.3.5'
  assert.ok(inspectOfficialRegistryPolicy(mismatchedPair).blockers.includes(
    'registry_psycopg_pair_mismatch'))
  const duplicateParent = structuredClone(complete)
  const secondParent = structuredClone(duplicateParent.artifacts.find(
    ({ component }) => component === 'postgresql'))
  secondParent.sourceId = 'postgresql-second-fixture'
  secondParent.artifactUrl = 'https://get.enterprisedb.com/postgresql/postgresql-second.exe'
  secondParent.metadataUrl = secondParent.artifactUrl
  secondParent.fileName = 'postgresql-second.exe'
  duplicateParent.artifacts.push(secondParent)
  assert.ok(inspectOfficialRegistryPolicy(duplicateParent).blockers.includes(
    'registry_component_duplicate:postgresql'))
})

test('bundle member is bound to the freshly verified primary PostgreSQL source', () => {
  const fixture = registryFixture()
  const policy = completeSyntheticRegistryPolicy(fixture.policy, fixture.artifact)
  const input = componentEvidence(policy, 'openssl')
  assert.equal(verifyOfficialRegistryEvidence(input).sourceId, input.source.sourceId)
  for (const mutate of [
    (value) => { value.verifiedParentAuthentication = null },
    (value) => { value.verifiedParentAuthentication.sourceId = 'other-postgresql' },
    (value) => { value.verifiedParentAuthentication.sourceArtifactSha256 = 'f'.repeat(64) },
    (value) => { value.verifiedParentAuthentication.signerCertificateSha256 = 'e'.repeat(64) },
    (value) => { value.verifiedParentAuthentication.timestampCertificateSha256 = 'd'.repeat(64) },
  ]) {
    const changed = structuredClone(input)
    mutate(changed)
    assert.throws(() => verifyOfficialRegistryEvidence(changed),
      /registry_metadata_binding_invalid/)
  }
})

test('combined policy digest is domain-separated and length-framed', () => {
  assert.notEqual(combinedPolicySha256(Buffer.from('ab'), Buffer.from('c')),
    combinedPolicySha256(Buffer.from('a'), Buffer.from('bc')))
  assert.notEqual(combinedPolicySha256(Buffer.from('publisher'), Buffer.from('registry')),
    combinedPolicySha256(Buffer.from('registry'), Buffer.from('publisher')))
})

test('sanitized closure schema rejects omissions, wrong types, surplus fields, and rooted paths', () => {
  const valid = closureFixture()
  assert.deepEqual(validateSanitizedClosure(valid, valid.exactSha),
    { processCount: 1, runtimeFileCount: 1, systemModuleCount: 1 })
  const mutations = [
    (value) => { delete value.processes[0].exitCode },
    (value) => { value.processes[0].sequence = '0' },
    (value) => { value.processes[0].sourceId = ' ' },
    (value) => { delete value.runtimeFiles[0].bytes },
    (value) => { value.runtimeFiles[0].uses = [] },
    (value) => { value.runtimeFiles[0].extra = true },
    (value) => { delete value.systemModules[0].bytes },
    (value) => { value.processCount = '1' },
    (value) => { value.selectedPorts = [54321, 54321] },
    (value) => { value.runtimeFiles[0].relativePath = '/absolute/node.exe' },
    (value) => { value.runtimeFiles[0].relativePath = '\\server\\share\\node.exe' },
    (value) => { value.runtimeFiles[0].relativePath = '\\?\\C:\\node.exe' },
    (value) => { value.runtimeFiles[0].relativePath = 'C:\\node.exe' },
    (value) => { value.runtimeFiles[0].relativePath = '../node.exe' },
  ]
  for (const mutate of mutations) {
    const changed = structuredClone(valid); mutate(changed)
    assert.throws(() => validateSanitizedClosure(changed, valid.exactSha), /closure_inventory_invalid/)
  }
})

test('retained evidence verifier requires exact stage schemas and cross-file digests', async () => {
  const exactSha = 'b'.repeat(40)
  const directory = await mkdtemp(join(tmpdir(), 'postgres17-evidence-contract-'))
  try {
    const candidate = {
      contract: 'supermega.postgres17-stage1-candidate.v1', authoritative: false,
      exactSha,
      installer: {
        contract: 'supermega.windows-authenticode-observation.v1',
        artifactFileName: 'postgresql.exe', artifactBytes: 10, artifactSha256: 'a'.repeat(64),
        signatureStatus: 'Valid', signatureType: 'Authenticode',
        signerCertificateSha256: 'c'.repeat(64), signerSubject: 'publisher',
        signerIssuer: 'issuer', timestampCertificateSha256: 'd'.repeat(64),
        timestampSubject: 'timestamp', ekuOids: ['1.3.6.1.5.5.7.3.3'],
      },
      documentation: { url: 'https://example.invalid/docs', sha256: 'e'.repeat(64) },
      executionPerformed: false, databaseRehearsalReceiptCreated: false,
      cleanup: { serviceInventoryUnchanged: true, temporaryDataRemoved: true,
        processOrPortCheckApplicable: false },
      secretValuesExposed: false,
    }
    const candidatePath = join(directory, 'postgres17-stage1-candidate.json')
    await writeFile(candidatePath, JSON.stringify(candidate))
    assert.deepEqual(await verifyEvidenceDirectory(directory, 'capture', exactSha),
      { stage: 'capture', exactSha })
    candidate.unexpected = true
    await writeFile(candidatePath, JSON.stringify(candidate))
    await assert.rejects(verifyEvidenceDirectory(directory, 'capture', exactSha),
      /stage1_candidate_invalid/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }

  const rehearsalDirectory = await mkdtemp(join(tmpdir(), 'postgres17-evidence-contract-'))
  try {
    const receiptBytes = Buffer.from('{"receipt":true}')
    const rawBytes = Buffer.from('{"raw":true}')
    const closure = closureFixture()
    closure.exactSha = exactSha
    closure.receiptSha256 = sha256(receiptBytes)
    closure.rawReceiptSha256 = sha256(rawBytes)
    const closureBytes = Buffer.from(JSON.stringify(closure))
    const cleanup = {
      contract: 'supermega.postgres17-stage2-cleanup.v1', authoritative: false,
      exactSha, serviceInventoryUnchanged: true, allSelectedPortsClosed: true,
      selectedPortCount: 1, temporaryDataRemoved: true, allProcessesExited: true,
      closureEvidenceSha256: sha256(closureBytes), receiptSha256: sha256(receiptBytes),
      rawReceiptSha256: sha256(rawBytes), receiptReconstructionRawRetained: true,
      secretValuesExposed: false,
    }
    await Promise.all([
      writeFile(join(rehearsalDirectory, 'postgres17-stage2-closure.json'), closureBytes),
      writeFile(join(rehearsalDirectory, 'postgres17-stage2-cleanup.json'), JSON.stringify(cleanup)),
      writeFile(join(rehearsalDirectory, 'postgres17-rehearsal.json'), receiptBytes),
      writeFile(join(rehearsalDirectory, 'postgres17-rehearsal.json.raw.json'), rawBytes),
    ])
    assert.deepEqual(await verifyEvidenceDirectory(rehearsalDirectory, 'rehearsal', exactSha),
      { stage: 'rehearsal', exactSha, receiptSha256: sha256(receiptBytes) })
    cleanup.selectedPortCount = 2
    await writeFile(join(rehearsalDirectory, 'postgres17-stage2-cleanup.json'), JSON.stringify(cleanup))
    await assert.rejects(verifyEvidenceDirectory(rehearsalDirectory, 'rehearsal', exactSha),
      /stage2_evidence_invalid/)
  } finally {
    await rm(rehearsalDirectory, { recursive: true, force: true })
  }
})
