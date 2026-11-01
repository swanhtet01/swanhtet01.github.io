import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  validateShopQaArtifactManifest,
  writeShopQaArtifactManifest,
} from './write_shop_qa_artifact_manifest.mjs'

const source = {
  sha: '1'.repeat(40),
  tree: '2'.repeat(40),
  nativeTree: '3'.repeat(40),
}
const flutter = {
  frameworkVersion: '3.47.8',
  frameworkRevision: '4'.repeat(40),
  dartSdkVersion: '3.13.7',
}

function execution(command, args) {
  if (command === 'git' && args.join(' ') === 'rev-parse HEAD') return source.sha
  if (command === 'git' && args.join(' ') === 'rev-parse HEAD^{tree}') return source.tree
  if (command === 'git' && args.join(' ') === 'rev-parse HEAD:mobile/shop_pos') return source.nativeTree
  throw new Error(`unexpected_command:${command}:${args.join(' ')}`)
}

const platformInputs = Object.freeze({
  android: {
    artifact: 'app-qa-debug.apk',
    environment: {
      GITHUB_SHA: source.sha,
      RUNNER_OS: 'Linux',
      RUNNER_ARCH: 'X64',
      ImageOS: 'ubuntu24',
      ImageVersion: '20261030.1',
    },
  },
  ios: {
    artifact: 'Runner.app.zip',
    environment: {
      GITHUB_SHA: source.sha,
      RUNNER_OS: 'macOS',
      RUNNER_ARCH: 'ARM64',
      ImageOS: 'macos15',
      ImageVersion: '20261030.1',
    },
  },
  windows: {
    artifact: 'supermega-shop-windows-qa.zip',
    environment: {
      GITHUB_SHA: source.sha,
      RUNNER_OS: 'Windows',
      RUNNER_ARCH: 'X64',
      ImageOS: 'win25',
      ImageVersion: '20261030.1',
    },
  },
})

async function fixture(platform = 'ios') {
  const root = await mkdtemp(join(tmpdir(), 'shop-qa-manifest-'))
  await mkdir(join(root, 'mobile', 'shop_pos'), { recursive: true })
  const definition = platformInputs[platform]
  const artifactPath = join(root, definition.artifact)
  const checksumPath = `${artifactPath}.sha256`
  const toolchainPath = `${artifactPath}.toolchain.json`
  const signingPath = `${artifactPath}.signing.json`
  const identityPath = platform === 'android' ? `${artifactPath}.identity.json` : null
  const outputPath = `${artifactPath}.manifest`
  const bytes = Buffer.from(`artifact-${platform}`)
  const { createHash } = await import('node:crypto')
  const digest = createHash('sha256').update(bytes).digest('hex')
  await writeFile(artifactPath, bytes)
  await writeFile(checksumPath, `${digest}  ${definition.artifact}\n`)
  await writeFile(toolchainPath, JSON.stringify(flutter))
  await writeFile(signingPath, JSON.stringify(platform === 'android' ? {
    classification: 'android_debug',
    productionSigned: false,
    stableUpdateIdentityProven: false,
    certificateSha256: '5'.repeat(64),
    signatureVerified: true,
    apksignerBuildToolsVersion: '36.0.0',
    apksignerSha256: '6'.repeat(64),
    apksignerJarSha256: '8'.repeat(64),
    buildToolsSourcePropertiesSha256: '7'.repeat(64),
  } : {
    classification: platform === 'ios' ? 'ios_no_codesign' : 'windows_unsigned',
    productionSigned: false,
    stableUpdateIdentityProven: false,
  }))
  if (identityPath) {
    await writeFile(identityPath, JSON.stringify({
      applicationId: 'dev.supermega.supermega_shop.qa',
      applicationLabel: 'Shop QA',
      capabilityContract: 'supermega.shop.android-qa-capabilities.v1',
      evidenceContract: 'supermega.shop.synthetic-qa-evidence.v1',
      scopedEncryptedRestore: true,
      scopedSyntheticExport: true,
      generalExternalFileAccess: false,
      versionCode: '1',
      versionName: '1.0.0',
      compileSdk: 36,
      minSdk: 24,
      targetSdk: 36,
      abis: ['arm64-v8a', 'armeabi-v7a', 'x86_64'],
      buildIdentitySha256: '9'.repeat(64),
    }))
  }
  return {
    root,
    artifactPath,
    checksumPath,
    toolchainPath,
    signingPath,
    identityPath,
    outputPath,
    digest,
    environment: definition.environment,
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}

async function writeFixture(platform = 'ios', changes = {}) {
  const item = await fixture(platform)
  const manifest = await writeShopQaArtifactManifest({
    platform,
    artifactPath: item.artifactPath,
    checksumPath: item.checksumPath,
    toolchainPath: item.toolchainPath,
    signingPath: item.signingPath,
    identityPath: item.identityPath,
    outputPath: item.outputPath,
    root: item.root,
    environment: item.environment,
    execute: execution,
    ...changes,
  })
  return { ...item, manifest }
}

test('writes canonical exact-source Android, iOS and Windows manifests', async () => {
  for (const platform of ['android', 'ios', 'windows']) {
    const item = await writeFixture(platform)
    try {
      assert.equal(item.manifest.source.sourceSha, source.sha)
      assert.equal(item.manifest.source.sourceTree, source.tree)
      assert.equal(item.manifest.source.nativeTree, source.nativeTree)
      assert.equal(item.manifest.artifact.sha256, item.digest)
      assert.equal(item.manifest.claimBoundary.promotionEligible, false)
      assert.equal(item.manifest.signing.productionSigned, false)
      if (platform === 'android') {
        assert.equal(item.manifest.artifact.identity.applicationId, 'dev.supermega.supermega_shop.qa')
        assert.equal(item.manifest.artifact.identity.targetSdk, 36)
        assert.equal(item.manifest.signing.classification, 'android_debug')
        assert.equal(item.manifest.signing.signatureVerified, true)
      }
      assert.equal(validateShopQaArtifactManifest(item.manifest), item.manifest)
      const retained = await readFile(item.outputPath, 'utf8')
      assert.equal(retained, `${JSON.stringify(item.manifest)}\n`)
    } finally {
      await item.cleanup()
    }
  }
})

test('Android identity and debug signer evidence fail closed when incomplete or altered', async () => {
  const identityMutations = [
    value => ({ ...value, applicationId: 'dev.supermega.supermega_shop' }),
    value => ({ ...value, capabilityContract: 'wrong' }),
    value => ({ ...value, compileSdk: 35, targetSdk: 36 }),
    value => ({ ...value, minSdk: 37, targetSdk: 36 }),
    value => ({ ...value, abis: ['x86_64', 'arm64-v8a'] }),
    value => ({ ...value, abis: [] }),
  ]
  for (const mutate of identityMutations) {
    const item = await fixture('android')
    try {
      const original = JSON.parse(await readFile(item.identityPath, 'utf8'))
      await writeFile(item.identityPath, JSON.stringify(mutate(original)))
      await assert.rejects(
        writeShopQaArtifactManifest({
          platform: 'android', artifactPath: item.artifactPath, checksumPath: item.checksumPath,
          toolchainPath: item.toolchainPath, signingPath: item.signingPath,
          identityPath: item.identityPath, outputPath: item.outputPath, root: item.root,
          environment: item.environment, execute: execution,
        }),
        /shop_qa_manifest_android_identity_evidence_invalid/,
      )
    } finally { await item.cleanup() }
  }

  for (const signing of [
    { classification: 'android_debug', productionSigned: false, stableUpdateIdentityProven: false, certificateSha256: '5'.repeat(64), signatureVerified: false, apksignerBuildToolsVersion: '36.0.0', apksignerSha256: '6'.repeat(64), apksignerJarSha256: '8'.repeat(64), buildToolsSourcePropertiesSha256: '7'.repeat(64) },
    { classification: 'android_debug', productionSigned: false, stableUpdateIdentityProven: false, certificateSha256: 'not-a-digest', signatureVerified: true, apksignerBuildToolsVersion: '36.0.0', apksignerSha256: '6'.repeat(64), apksignerJarSha256: '8'.repeat(64), buildToolsSourcePropertiesSha256: '7'.repeat(64) },
    { classification: 'android_release', productionSigned: false, stableUpdateIdentityProven: false, certificateSha256: '5'.repeat(64), signatureVerified: true, apksignerBuildToolsVersion: '36.0.0', apksignerSha256: '6'.repeat(64), apksignerJarSha256: '8'.repeat(64), buildToolsSourcePropertiesSha256: '7'.repeat(64) },
  ]) {
    const item = await fixture('android')
    try {
      await writeFile(item.signingPath, JSON.stringify(signing))
      await assert.rejects(
        writeShopQaArtifactManifest({
          platform: 'android', artifactPath: item.artifactPath, checksumPath: item.checksumPath,
          toolchainPath: item.toolchainPath, signingPath: item.signingPath,
          identityPath: item.identityPath, outputPath: item.outputPath, root: item.root,
          environment: item.environment, execute: execution,
        }),
        /shop_qa_manifest_signing_evidence_invalid/,
      )
    } finally { await item.cleanup() }
  }
})

test('changed or swapped artifact bytes fail against the canonical checksum', async () => {
  const item = await fixture('ios')
  try {
    await writeFile(item.artifactPath, 'changed-after-checksum')
    await assert.rejects(
      writeShopQaArtifactManifest({
        platform: 'ios', artifactPath: item.artifactPath, checksumPath: item.checksumPath,
        toolchainPath: item.toolchainPath, signingPath: item.signingPath,
        outputPath: item.outputPath, root: item.root, environment: item.environment, execute: execution,
      }),
      /shop_qa_manifest_checksum_invalid/,
    )
  } finally {
    await item.cleanup()
  }
})

test('checksum filename, casing, token and line drift fail closed', async () => {
  for (const checksumText of [
    value => `${value.digest.toUpperCase()}  Runner.app.zip\n`,
    value => `${value.digest}  other.zip\n`,
    value => `${value.digest} Runner.app.zip\n`,
    value => `${value.digest}  Runner.app.zip extra\n`,
    value => `${value.digest}  Runner.app.zip\nsecond line\n`,
    value => `${value.digest}  Runner.app.zip \n`,
    value => `${value.digest}  Runner.app.zip\t\n`,
    value => `${value.digest}  Runner.app.zip\n\n`,
  ]) {
    const item = await fixture('ios')
    try {
      await writeFile(item.checksumPath, checksumText(item))
      await assert.rejects(
      writeShopQaArtifactManifest({
        platform: 'ios', artifactPath: item.artifactPath, checksumPath: item.checksumPath,
        toolchainPath: item.toolchainPath, signingPath: item.signingPath,
          outputPath: item.outputPath, root: item.root, environment: item.environment, execute: execution,
        }),
        /shop_qa_manifest_checksum_invalid/,
      )
    } finally {
      await item.cleanup()
    }
  }
})

test('wrong source, runner, platform tuple and existing output fail closed', async () => {
  const wrongSource = await fixture('ios')
  try {
    await assert.rejects(
      writeShopQaArtifactManifest({
        platform: 'ios', artifactPath: wrongSource.artifactPath, checksumPath: wrongSource.checksumPath,
        toolchainPath: wrongSource.toolchainPath, signingPath: wrongSource.signingPath,
        outputPath: wrongSource.outputPath, root: wrongSource.root,
        environment: { ...wrongSource.environment, GITHUB_SHA: '9'.repeat(40) }, execute: execution,
      }),
      /shop_qa_manifest_github_sha_mismatch/,
    )
  } finally { await wrongSource.cleanup() }

  const wrongRunner = await fixture('ios')
  try {
    await assert.rejects(
      writeShopQaArtifactManifest({
        platform: 'ios', artifactPath: wrongRunner.artifactPath, checksumPath: wrongRunner.checksumPath,
        toolchainPath: wrongRunner.toolchainPath, signingPath: wrongRunner.signingPath,
        outputPath: wrongRunner.outputPath, root: wrongRunner.root,
        environment: { ...wrongRunner.environment, RUNNER_OS: 'Windows' }, execute: execution,
      }),
      /shop_qa_manifest_runner_identity_invalid/,
    )
  } finally { await wrongRunner.cleanup() }

  const wrongPlatform = await fixture('ios')
  try {
    await assert.rejects(
      writeShopQaArtifactManifest({
        platform: 'windows', artifactPath: wrongPlatform.artifactPath, checksumPath: wrongPlatform.checksumPath,
        toolchainPath: wrongPlatform.toolchainPath, signingPath: wrongPlatform.signingPath,
        outputPath: wrongPlatform.outputPath, root: wrongPlatform.root,
        environment: platformInputs.windows.environment, execute: execution,
      }),
      /shop_qa_manifest_path_contract_invalid/,
    )
  } finally { await wrongPlatform.cleanup() }

  const existing = await fixture('ios')
  try {
    await writeFile(existing.outputPath, 'preexisting')
    await assert.rejects(
      writeShopQaArtifactManifest({
        platform: 'ios', artifactPath: existing.artifactPath, checksumPath: existing.checksumPath,
        toolchainPath: existing.toolchainPath, signingPath: existing.signingPath,
        outputPath: existing.outputPath, root: existing.root, environment: existing.environment, execute: execution,
      }),
      /shop_qa_manifest_output_exists/,
    )
  } finally { await existing.cleanup() }
})

test('symlinked inputs and outputs are rejected', async () => {
  const input = await fixture('ios')
  try {
    const target = join(input.root, 'real.zip')
    await writeFile(target, 'real')
    await rm(input.artifactPath)
    await symlink(target, input.artifactPath)
    await assert.rejects(
      writeShopQaArtifactManifest({
        platform: 'ios', artifactPath: input.artifactPath, checksumPath: input.checksumPath,
        toolchainPath: input.toolchainPath, signingPath: input.signingPath,
        outputPath: input.outputPath, root: input.root, environment: input.environment, execute: execution,
      }),
      /shop_qa_manifest_artifact_invalid/,
    )
  } finally { await input.cleanup() }

  const output = await fixture('ios')
  try {
    const target = join(output.root, 'manifest-target')
    await writeFile(target, 'target')
    await symlink(target, output.outputPath)
    await assert.rejects(
      writeShopQaArtifactManifest({
        platform: 'ios', artifactPath: output.artifactPath, checksumPath: output.checksumPath,
        toolchainPath: output.toolchainPath, signingPath: output.signingPath,
        outputPath: output.outputPath, root: output.root, environment: output.environment, execute: execution,
      }),
      /shop_qa_manifest_output_exists/,
    )
  } finally { await output.cleanup() }
})

test('parent-directory symlinks cannot escape the repository root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shop-qa-parent-root-'))
  const outside = await mkdtemp(join(tmpdir(), 'shop-qa-parent-outside-'))
  try {
    const definition = platformInputs.ios
    const artifactPath = join(outside, definition.artifact)
    const checksumPath = `${artifactPath}.sha256`
    const toolchainPath = `${artifactPath}.toolchain.json`
    const signingPath = `${artifactPath}.signing.json`
    await writeFile(artifactPath, 'escaped-artifact')
    const { createHash } = await import('node:crypto')
    const digest = createHash('sha256').update('escaped-artifact').digest('hex')
    await writeFile(checksumPath, `${digest}  ${definition.artifact}`)
    await writeFile(toolchainPath, JSON.stringify(flutter))
    await writeFile(signingPath, JSON.stringify({
      classification: 'ios_no_codesign', productionSigned: false, stableUpdateIdentityProven: false,
    }))
    await symlink(outside, join(root, 'escaped'))
    await assert.rejects(
      writeShopQaArtifactManifest({
        platform: 'ios',
        artifactPath: join(root, 'escaped', definition.artifact),
        checksumPath: join(root, 'escaped', `${definition.artifact}.sha256`),
        toolchainPath: join(root, 'escaped', `${definition.artifact}.toolchain.json`),
        signingPath: join(root, 'escaped', `${definition.artifact}.signing.json`),
        outputPath: join(root, 'escaped', `${definition.artifact}.manifest`),
        root,
        environment: definition.environment,
        execute: execution,
      }),
      /shop_qa_manifest_path_outside_repository/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})

test('malformed Git identities and unverified signing receipts fail closed', async () => {
  const malformedGit = await fixture('ios')
  try {
    await assert.rejects(
      writeShopQaArtifactManifest({
        platform: 'ios', artifactPath: malformedGit.artifactPath, checksumPath: malformedGit.checksumPath,
        toolchainPath: malformedGit.toolchainPath, signingPath: malformedGit.signingPath,
        outputPath: malformedGit.outputPath, root: malformedGit.root,
        environment: malformedGit.environment,
        execute: (command, args, cwd) => args.join(' ') === 'rev-parse HEAD^{tree}'
          ? 'not-a-tree'
          : execution(command, args, cwd),
      }),
      /shop_qa_manifest_git_identity_invalid/,
    )
  } finally { await malformedGit.cleanup() }

  for (const evidence of [
    { classification: 'ios_signed', productionSigned: false, stableUpdateIdentityProven: false },
    { classification: 'ios_no_codesign', productionSigned: true, stableUpdateIdentityProven: false },
    { classification: 'ios_no_codesign', productionSigned: false, stableUpdateIdentityProven: true },
    { classification: 'ios_no_codesign', productionSigned: false },
  ]) {
    const item = await fixture('ios')
    try {
      await writeFile(item.signingPath, JSON.stringify(evidence))
      await assert.rejects(
        writeShopQaArtifactManifest({
          platform: 'ios', artifactPath: item.artifactPath, checksumPath: item.checksumPath,
          toolchainPath: item.toolchainPath, signingPath: item.signingPath,
          outputPath: item.outputPath, root: item.root, environment: item.environment, execute: execution,
        }),
        /shop_qa_manifest_signing_evidence_invalid/,
      )
    } finally { await item.cleanup() }
  }
})

test('manifest validation rejects key, identity, toolchain, signing, claim and digest tampering', async () => {
  const item = await writeFixture('windows')
  try {
    const mutations = [
      value => ({ ...value, extra: true }),
      value => ({ ...value, source: { ...value.source, nativeTree: '0'.repeat(40) } }),
      value => ({ ...value, artifact: { ...value.artifact, identity: { ...value.artifact.identity, productName: 'Shop' } } }),
      value => ({ ...value, toolchain: { ...value.toolchain, flutterVersion: 'stable' } }),
      value => ({ ...value, signing: { ...value.signing, productionSigned: true } }),
      value => ({ ...value, signing: { ...value.signing, classification: 'windows_signed' } }),
      value => ({ ...value, signing: { ...value.signing, stableUpdateIdentityProven: true } }),
      value => ({ ...value, claimBoundary: { ...value.claimBoundary, promotionEligible: true } }),
      value => ({ ...value, digest: `sha256:${'0'.repeat(64)}` }),
    ]
    for (const mutate of mutations) {
      assert.throws(() => validateShopQaArtifactManifest(mutate(item.manifest)), /shop_qa_manifest_/)
    }
  } finally {
    await item.cleanup()
  }
})
