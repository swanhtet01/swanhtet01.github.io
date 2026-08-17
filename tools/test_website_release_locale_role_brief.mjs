// Website release locale/role brief: locale status distribution + role distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWebsiteReleaseLocaleRoleBrief } from './website-release-locale-role-brief.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectWebsiteReleaseLocaleRoleBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function releaseLocale({ locale = 'my', isDefault = false, status = 'approved' } = {}) {
  return { locale, isDefault, status, contentDigest: `cd-${locale}` }
}

function releaseRole({ role = 'content_owner', actor = 'user-1' } = {}) {
  return { role, actor }
}

function pkg({ locales = [], roles = [] } = {}) {
  return {
    contract: 'supermega.website.release_package.v1',
    packageId: 'pkg-1',
    source: { kind: 'template', templateId: 'business-presence' },
    template: { templateId: 'business-presence', revision: 1, digest: 'tpl-digest' },
    brand: {
      schema: 'supermega.website.brand_tokens.v1',
      palette: { accent: '#ff0000', ink: '#000000', surface: '#ffffff' },
      typography: { body: 'system-sans', heading: 'system-sans' },
      radiusPx: 8,
    },
    locales,
    media: [],
    roles,
    previousPackageDigest: null,
    migration: null,
    packageDigest: 'pkg-digest-1',
  }
}

// 1. Empty package
{
  const r = projectWebsiteReleaseLocaleRoleBrief(pkg())
  check(r.totalLocales === 0, 'empty: totalLocales 0')
  check(r.approvedLocaleCount === 0, 'empty: approvedCount 0')
  check(r.draftLocaleCount === 0, 'empty: draftCount 0')
  check(r.approvedLocaleRate === 0, 'empty: approvedRate 0')
  check(r.hasDefaultLocale === false, 'empty: hasDefaultLocale false')
  check(r.totalRoles === 0, 'empty: totalRoles 0')
  check(r.uniqueActors === 0, 'empty: uniqueActors 0')
}

// 2. All approved locales
{
  const r = projectWebsiteReleaseLocaleRoleBrief(
    pkg({ locales: [releaseLocale({ status: 'approved' }), releaseLocale({ locale: 'en', status: 'approved' })] }),
  )
  check(r.approvedLocaleCount === 2, 'all-approved: approvedCount 2')
  check(r.draftLocaleCount === 0, 'all-approved: draftCount 0')
  check(r.approvedLocaleRate === 100, 'all-approved: rate 100')
}

// 3. All draft locales
{
  const r = projectWebsiteReleaseLocaleRoleBrief(
    pkg({ locales: [releaseLocale({ status: 'draft' })] }),
  )
  check(r.draftLocaleCount === 1, 'all-draft: draftCount 1')
  check(r.approvedLocaleRate === 0, 'all-draft: approvedRate 0')
}

// 4. hasDefaultLocale
{
  const r = projectWebsiteReleaseLocaleRoleBrief(
    pkg({ locales: [releaseLocale({ isDefault: true }), releaseLocale({ locale: 'en', isDefault: false })] }),
  )
  check(r.hasDefaultLocale === true, 'default: hasDefaultLocale true')
}
{
  const r = projectWebsiteReleaseLocaleRoleBrief(
    pkg({ locales: [releaseLocale({ isDefault: false })] }),
  )
  check(r.hasDefaultLocale === false, 'no-default: hasDefaultLocale false')
}

// 5. Locale counts sum to total
{
  const r = projectWebsiteReleaseLocaleRoleBrief(
    pkg({ locales: [releaseLocale({ status: 'approved' }), releaseLocale({ locale: 'en', status: 'draft' })] }),
  )
  check(r.approvedLocaleCount + r.draftLocaleCount === r.totalLocales, 'invariant: locale counts sum')
}

// 6. Role distribution
{
  const r = projectWebsiteReleaseLocaleRoleBrief(
    pkg({
      roles: [
        releaseRole({ role: 'content_owner', actor: 'alice' }),
        releaseRole({ role: 'release_manager', actor: 'bob' }),
        releaseRole({ role: 'release_reviewer', actor: 'carol' }),
      ],
    }),
  )
  check(r.contentOwnerCount === 1, 'roles: contentOwnerCount 1')
  check(r.releaseManagerCount === 1, 'roles: releaseManagerCount 1')
  check(r.releaseReviewerCount === 1, 'roles: releaseReviewerCount 1')
  check(r.uniqueActors === 3, 'roles: uniqueActors 3')
}

// 7. Same actor in multiple roles
{
  const r = projectWebsiteReleaseLocaleRoleBrief(
    pkg({
      roles: [
        releaseRole({ role: 'content_owner', actor: 'alice' }),
        releaseRole({ role: 'release_manager', actor: 'alice' }),
      ],
    }),
  )
  check(r.uniqueActors === 1, 'same-actor: uniqueActors 1')
  check(r.totalRoles === 2, 'same-actor: totalRoles 2')
}

// 8. Approved locale rate rounding: 1/3 → 33%
{
  const r = projectWebsiteReleaseLocaleRoleBrief(
    pkg({
      locales: [
        releaseLocale({ locale: 'my', status: 'approved' }),
        releaseLocale({ locale: 'en', status: 'draft' }),
        releaseLocale({ locale: 'zh', status: 'draft' }),
      ],
    }),
  )
  check(r.approvedLocaleRate === 33, 'round: approvedRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
