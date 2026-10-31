#!/usr/bin/env node

import { lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultOutput = resolve(
  repositoryRoot,
  'mobile/shop_pos/lib/shop_build_identity.g.dart',
)

const identities = Object.freeze({
  android: Object.freeze({
    production: 'dev.supermega.supermega_shop',
    synthetic_qa_v1: 'dev.supermega.supermega_shop.qa',
  }),
  ios: Object.freeze({
    production: 'dev.supermega.supermegaShop',
    synthetic_qa_v1: 'dev.supermega.supermegaShop.qa',
  }),
  windows: Object.freeze({
    production: 'dev.supermega.supermega_shop.windows',
    synthetic_qa_v1: 'dev.supermega.supermega_shop.qa.windows',
  }),
})

function parseArguments(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!['--platform', '--profile', '--output'].includes(key) || !value) {
      throw new Error(
        'usage: generate_shop_build_identity.mjs --platform android|ios|windows --profile production|synthetic_qa_v1 [--output path]',
      )
    }
    if (values.has(key)) throw new Error(`duplicate_argument:${key}`)
    values.set(key, value)
  }
  const platform = values.get('--platform')
  const profile = values.get('--profile')
  if (!Object.hasOwn(identities, platform)) {
    throw new Error('shop_build_platform_unknown')
  }
  if (!Object.hasOwn(identities[platform], profile)) {
    throw new Error('shop_build_profile_unknown')
  }
  return {
    platform,
    profile,
    output: resolve(values.get('--output') ?? defaultOutput),
  }
}

function assertProviderIsolation(profile, environment) {
  if (profile !== 'synthetic_qa_v1') return
  for (const name of [
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'SHOP_API_BASE_URL',
    'SHOP_CONNECTED_ORDERS_ENABLED',
  ]) {
    if ((environment[name] ?? '').trim()) {
      throw new Error(`shop_qa_provider_value_forbidden:${name}`)
    }
  }
}

function sourceFor(platform, profile) {
  const qaProfile = profile === 'synthetic_qa_v1' ? 'synthetic-qa-v1' : ''
  return `// GENERATED FILE. DO NOT EDIT.
// tools/generate_shop_build_identity.mjs binds the Dart runtime tuple to the
// platform package identity before a production or synthetic-QA build.
const shopBuildIdentityProfile = '${profile}';
const shopBuildIdentityQaProfileId = '${qaProfile}';
const shopBuildIdentityPlatformIdentity = '${identities[platform][profile]}';
const shopBuildIdentityAllowedProfiles = <String>[
  'production',
  'synthetic_qa_v1',
];
`
}

export async function generateShopBuildIdentity({
  platform,
  profile,
  output = defaultOutput,
  environment = process.env,
}) {
  if (!Object.hasOwn(identities, platform)) {
    throw new Error('shop_build_platform_unknown')
  }
  if (!Object.hasOwn(identities[platform], profile)) {
    throw new Error('shop_build_profile_unknown')
  }
  assertProviderIsolation(profile, environment)
  const destination = resolve(output)
  const existing = await lstat(destination).catch(error => {
    if (error?.code === 'ENOENT') return null
    throw error
  })
  if (existing?.isSymbolicLink()) throw new Error('shop_build_identity_symlink')
  await mkdir(dirname(destination), { recursive: true })
  const temporary = `${destination}.${process.pid}.tmp`
  try {
    await writeFile(temporary, sourceFor(platform, profile), {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
  return { output: destination, platform, profile }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  await generateShopBuildIdentity(options)
  process.stdout.write(
    `${JSON.stringify({
      contract: 'supermega.shop.build-identity.v1',
      platform: options.platform,
      profile: options.profile,
      output: options.output,
    })}\n`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
