import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { generateShopBuildIdentity } from './generate_shop_build_identity.mjs'

const matrix = Object.freeze({
  android: {
    production: 'dev.supermega.supermega_shop',
    synthetic_qa_v1: 'dev.supermega.supermega_shop.qa',
  },
  ios: {
    production: 'dev.supermega.supermegaShop',
    synthetic_qa_v1: 'dev.supermega.supermegaShop.qa',
  },
  windows: {
    production: 'dev.supermega.supermega_shop.windows',
    synthetic_qa_v1: 'dev.supermega.supermega_shop.qa.windows',
  },
})

test('all six allowlisted platform/profile identities are deterministic', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shop-build-identity-'))
  try {
    for (const [platform, profiles] of Object.entries(matrix)) {
      for (const [profile, identity] of Object.entries(profiles)) {
        const output = join(root, `${platform}-${profile}.dart`)
        const first = await generateShopBuildIdentity({
          platform,
          profile,
          output,
          environment: {},
        })
        const firstSource = await readFile(output, 'utf8')
        const second = await generateShopBuildIdentity({
          platform,
          profile,
          output,
          environment: {},
        })
        assert.deepEqual(second, first)
        assert.equal(await readFile(output, 'utf8'), firstSource)
        assert.match(firstSource, new RegExp(identity.replaceAll('.', '\\.'), 'u'))
        assert.match(firstSource, new RegExp(`'${profile}'`, 'u'))
        assert.match(
          firstSource,
          new RegExp(`'${profile === 'synthetic_qa_v1' ? 'synthetic-qa-v1' : ''}'`, 'u'),
        )
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('unknown tuples and provider-bound QA generation fail closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shop-build-identity-'))
  try {
    await assert.rejects(
      generateShopBuildIdentity({
        platform: 'linux',
        profile: 'production',
        output: join(root, 'unknown-platform.dart'),
        environment: {},
      }),
      /shop_build_platform_unknown/u,
    )
    await assert.rejects(
      generateShopBuildIdentity({
        platform: 'android',
        profile: 'qa',
        output: join(root, 'unknown-profile.dart'),
        environment: {},
      }),
      /shop_build_profile_unknown/u,
    )
    for (const name of [
      'SUPABASE_URL',
      'SUPABASE_PUBLISHABLE_KEY',
      'SHOP_API_BASE_URL',
      'SHOP_CONNECTED_ORDERS_ENABLED',
    ]) {
      await assert.rejects(
        generateShopBuildIdentity({
          platform: 'android',
          profile: 'synthetic_qa_v1',
          output: join(root, `provider-${name}.dart`),
          environment: { [name]: 'configured' },
        }),
        new RegExp(`shop_qa_provider_value_forbidden:${name}`, 'u'),
      )
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('an existing symlink is never replaced', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shop-build-identity-'))
  try {
    const target = join(root, 'target.dart')
    const output = join(root, 'identity.dart')
    await symlink(target, output)
    await assert.rejects(
      generateShopBuildIdentity({
        platform: 'android',
        profile: 'production',
        output,
        environment: {},
      }),
      /shop_build_identity_symlink/u,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
