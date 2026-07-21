import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'showroom', 'dist')
const failures = []
const fail = (reason) => failures.push(reason)

async function exists(path) {
  try { await stat(path); return true } catch { return false }
}

async function walk(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(path))
    else files.push(path)
  }
  return files
}

for (const route of ['', 'shop', 'plant', 'assist', 'setup', 'trust']) {
  const page = resolve(dist, route, 'index.html')
  if (!await exists(page)) fail(`missing_route:${route || '/'}`)
}

const releasePath = resolve(dist, '__release.json')
if (!await exists(releasePath)) fail('missing_release_metadata')
else {
  const release = JSON.parse(await readFile(releasePath, 'utf8'))
  if (release.service !== 'supermega-app') fail('wrong_release_service')
  if (release.canonicalDomain !== 'https://app.supermega.dev') fail('wrong_release_domain')
}

const faviconPath = resolve(dist, 'favicon.svg')
const manifestPath = resolve(dist, 'site.webmanifest')
if (!await exists(faviconPath)) fail('missing_terminal_favicon')
else {
  const favicon = await readFile(faviconPath, 'utf8')
  if (!favicon.includes('SuperMega terminal mark') || !favicon.includes('#6b95ff') || !favicon.includes('#3dd6a2')) fail('wrong_terminal_favicon')
}
if (!await exists(manifestPath)) fail('missing_app_webmanifest')
else {
  const webmanifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (webmanifest.name !== 'SuperMega Operating Workspace' || webmanifest.icons?.[0]?.src !== '/favicon.svg') fail('wrong_app_webmanifest')
}

const files = await walk(dist)
const textFiles = files.filter((path) => /\.(?:html|js|css|json|svg)$/.test(path))
const corpus = (await Promise.all(textFiles.map((path) => readFile(path, 'utf8')))).join('\n')
for (const required of ['SuperMega', 'Shop', 'Plant', 'Evidence first', '#6b95ff', '#3dd6a2']) {
  if (!corpus.includes(required)) fail(`missing_context:${required}`)
}
for (const forbidden of ['pos.supermega.dev', 'ytf.supermega.dev', 'Yangon Tyre', 'ytf-plant-a', 'Company Systems That Replace Tool Sprawl']) {
  if (corpus.toLowerCase().includes(forbidden.toLowerCase())) fail(`retired_context:${forbidden}`)
}
for (const marker of ['\uFFFD', '\u00e2\u20ac\u201d', '\u00e2\u20ac\u201c', '\u00c2', '\u00f0\u0178']) {
  if (corpus.includes(marker)) fail('app_copy_encoding_corrupt')
}

const bytes = (await Promise.all(files.map(async (path) => (await stat(path)).size))).reduce((total, size) => total + size, 0)
if (bytes > 2_500_000) fail(`artifact_budget:${bytes}`)

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_app_build', failures }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ ok: true, contract: 'supermega_app_build', routes: 6, bytes }, null, 2))
