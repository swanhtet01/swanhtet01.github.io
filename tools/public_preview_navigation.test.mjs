import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bindPreviewNavigation, parsePreviewAppBinding } from './public_preview_navigation.mjs'

const root = resolve(import.meta.dirname, '..')
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const binding = { projectId: 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG', commit,
  deploymentId: 'dpl_synthetic123', origin: 'https://megaos-a1b2c3d4e-swanhtet01s-projects.vercel.app' }
const parse = value => parsePreviewAppBinding(JSON.stringify(value), commit, commit)

test('default is byte-preserving and explicit blank metadata fails closed', () => {
  assert.equal(parsePreviewAppBinding(undefined, 'unknown', null), null)
  assert.equal(bindPreviewNavigation('<a href="https://app.supermega.dev/shop/">Shop</a>', null), '<a href="https://app.supermega.dev/shop/">Shop</a>')
  assert.throws(() => parsePreviewAppBinding('', commit, commit), /binding_invalid/)
  assert.deepEqual(parse(binding), binding)
})

test('reject malformed, foreign, aliased and unbound metadata', () => {
  for (const value of [null, [], {}, { ...binding, extra: true }, { ...binding, projectId: 'other' },
    { ...binding, deploymentId: '' }, { ...binding, commit: 'a'.repeat(40) }]) {
    assert.throws(() => parse(value), /binding_invalid/)
  }
  assert.throws(() => parsePreviewAppBinding(JSON.stringify(binding), commit, 'b'.repeat(40)), /binding_invalid/)
  for (const origin of ['https://app.supermega.dev', 'https://megaos.vercel.app', 'https://example.com',
    binding.origin + '/', binding.origin + '?x=1', binding.origin + '#x', binding.origin + ':443',
    binding.origin.replace('https:', 'http:'), binding.origin.replace('https://', 'https://user@'),
    binding.origin.replace('megaos-', 'other-'), binding.origin + '.example.com']) {
    assert.throws(() => parse({ ...binding, origin }), /binding_invalid/)
  }
})

test('preserve escaped path/query/hash and leave SEO and unrelated targets unchanged', () => {
  const html = '<link rel="canonical" href="https://app.supermega.dev/shop/"><a href="https://app.supermega.dev/shop/?template=bakery&amp;x=1#details">Go</a><a href="https://app.supermega.dev.example.com/">Other</a>'
  assert.equal(bindPreviewNavigation(html, parse(binding)), html.replace('<a href="https://app.supermega.dev/', `<a href="${binding.origin}/`))
})

test('actual generator maps every production app anchor, preserves default contract and SEO', () => {
  const env = { ...process.env, SUPERMEGA_RELEASE_COMMIT: commit }
  delete env.SUPERMEGA_PUBLIC_PREVIEW_APP_BINDING
  const build = extra => execFileSync(process.execPath, ['tools/create_public_vercel_output.mjs'], {
    cwd: root, env: { ...env, ...extra }, encoding: 'utf8', stdio: 'pipe', timeout: 30000,
  })
  const read = name => readFileSync(resolve(root, '.vercel/output/static', name), 'utf8')
  const manifest = JSON.parse(readFileSync(resolve(root, 'site-manifest.json'), 'utf8'))
  build({})
  const pages = new Map(manifest.pages.map(page => [page.file, read(page.file)]))
  let mapped = 0
  try {
    build({ SUPERMEGA_PUBLIC_PREVIEW_APP_BINDING: JSON.stringify(binding) })
    for (const [name, original] of pages) {
      const expected = bindPreviewNavigation(original, binding)
      const actual = read(name)
      assert.equal(actual, expected, name)
      assert.equal(/<a\b[^>]*href="https:\/\/app\.supermega\.dev(?:\/|")/.test(actual), false, name)
      mapped += (original.match(/<a\b[^>]*href="https:\/\/app\.supermega\.dev\//g) || []).length
    }
    assert.ok(mapped >= 20, `expected all doors and repeated CTAs, got ${mapped}`)
    assert.deepEqual(JSON.parse(read('__release.json')).previewNavigation, binding)
    assert.equal(read('robots.txt'), 'User-agent: *\nDisallow: /\n')
    const config = JSON.parse(readFileSync(resolve(root, '.vercel/output/config.json'), 'utf8'))
    assert.equal(config.routes[0].headers['X-Robots-Tag'], 'noindex, noarchive')
    // Invalid binding fails before replacing the previously generated output.
    assert.throws(() => build({ SUPERMEGA_PUBLIC_PREVIEW_APP_BINDING: '{}' }))
    assert.deepEqual(JSON.parse(read('__release.json')).previewNavigation, binding)
  } finally { build({}) }
})
