import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const { build } = require('esbuild')
const bundle = await build({
  stdin: { contents: `export * from './website-model.ts'; export * from './website-media.ts'; export * from './website-export.ts';`,
    resolveDir: fileURLToPath(new URL('../showroom/src/products/website', import.meta.url)), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
})
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)
const base = api.createInitialWorkspace()
const original = JSON.stringify(base)
assert.deepEqual(api.restoreWorkspace(JSON.parse(original)), base, 'existing records remain unchanged')
const image = { src: 'https://images.example.com/menu.jpg?width=1200&quality=80', alt: 'ဆိုင်ရှေ့တွင် ပြထားသော မီနူး', decorative: false }
const session = api.createWebsiteEditSession(base)
const edit = api.updateWebsiteEditSession(session, current => ({ ...current, pages: current.pages.map((page, index) => index ? page : {
  ...page, hero: api.withWebsiteImage(page.hero, image),
  sections: page.sections.map((section, i) => i ? section : api.withWebsiteImage(section, { ...image, decorative: true, alt: '' })),
}) }))
assert.equal(edit.ok, true)
const committed = api.applyWebsiteWorkspaceUpdate(base, current => api.commitWebsiteEditSession(current, edit.session))
assert.equal(committed.ok, true)
const saved = committed.workspace
const reopened = api.restoreWorkspace(JSON.parse(JSON.stringify(saved)))
assert.deepEqual(reopened.pages[0].hero.image, image, 'image metadata survives save/reopen')
assert.notEqual(api.workspaceFingerprint(saved), api.workspaceFingerprint(base), 'images participate in review identity')
assert.equal(saved.contentRevision, base.contentRevision + 1)
assert.equal(JSON.stringify(base), original, 'editing does not mutate saved source')
const artifact = api.createWebsiteArtifact(reopened)
const html = api.buildWebsiteHtml(artifact)
assert.match(html, /img-src https:/)
assert.match(html, /width=1200&amp;quality=80/)
assert.match(html, /referrerpolicy="no-referrer"/)
assert.match(html, /alt="" loading="lazy"/)
assert.match(html, new RegExp(image.alt))
reopened.pages[0].hero.image.alt = 'Changed after artifact creation'
assert.equal(artifact.pages[0].hero.image.alt, image.alt, 'retained artifact does not alias editable image metadata')
const removed = api.withWebsiteImage(saved.pages[0].hero, undefined)
assert.equal(Object.hasOwn(removed, 'image'), false, 'removal restores legacy-compatible shape')
assert.equal(saved.pages[0].hero.image.src, image.src)

const invalidImages = [
  { assetId: '../photo.webp', alt: 'Photo', decorative: false },
  { assetId: 'a'.repeat(64) + '.webp', src: image.src, alt: 'Photo', decorative: false },
  { assetId: 'a'.repeat(64) + '.webp', alt: '', decorative: false },
  ...['javascript:alert(1)', 'data:image/png;base64,abc', 'blob:https://example.com/id', 'http://example.com/photo.jpg',
    '/photo.jpg', 'https://user:secret@example.com/photo.jpg', 'https://127.0.0.1/photo.jpg',
    'https://localhost/photo.jpg', 'https://store.local/photo.jpg', 'https://store.local./photo.jpg',
    'https://images.example.com:443/photo.jpg', 'https://example.123/photo.jpg', 'https://images.example.com\\@evil.com/photo.jpg',
    'https://images.example.com/photo.jpg#secret', 'https://images.example.com/\nphoto.jpg',
    `https://images.example.com/${'x'.repeat(2048)}`].map(src => ({ ...image, src })),
  { ...image, alt: '' }, { ...image, alt: '   ' }, { ...image, alt: 'x'.repeat(201) }, { ...image, alt: '😀'.repeat(101) }, { ...image, alt: '\ud800' },
  { ...image, decorative: true }, { ...image, decorative: 'false' }, { ...image, secret: 'unexpected' }, null,
]
for (const bad of invalidImages) {
  assert.equal(api.isWebsiteImage(bad), false)
  const state = structuredClone(saved)
  state.pages[0].hero.image = bad
  assert.equal(api.restoreWorkspace(state), null, 'invalid image fails workspace validation')
  const badArtifact = structuredClone(artifact)
  badArtifact.pages[0].hero.image = bad
  assert.throws(() => api.buildWebsiteHtml(badArtifact), /not exportable/)
}
const escaped = structuredClone(artifact)
escaped.pages[0].hero.image.alt = '\" onerror=\"alert(1)<script>'
const escapedHtml = api.buildWebsiteHtml(escaped)
assert.ok(escapedHtml.includes('&quot; onerror=&quot;alert(1)&lt;script&gt;'))
assert.ok(!escapedHtml.includes('alt="" onerror="'))

// Exercise the real server reducer and compare digests/artifacts, not a second
// test implementation of the content model.
const python = process.env.PYTHON || 'python'
const script = `import json,sys,copy
from supermega_runtime.website_runtime import validate_website_state,reduce_website_state,_website_fingerprint,_website_artifact
from supermega_runtime.trial_store import TrialValidationError
d=json.load(sys.stdin)
assert validate_website_state(d['base']) == d['base']
state=reduce_website_state('website.content.saved',d['base'],{'state':d['saved'],'evidence':{'actionId':'image-save','capturedAt':'2026-10-10T00:00:00.000Z','actor':'synthetic-editor','reason':'Add section images','evidenceReference':'local-test'}})
assert state == d['saved']
assert _website_fingerprint(state) == d['fingerprint']
assert _website_artifact(state) == d['artifact']
for image in d['invalid']:
    changed=copy.deepcopy(state);changed['pages'][0]['hero']['image']=image
    try: validate_website_state(changed)
    except TrialValidationError: pass
    else: raise AssertionError('server accepted invalid image')
print('server reducer, digest, artifact and rejection parity PASS')`
const backend = spawnSync(python, ['-X', 'utf8', '-c', script], {
  cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', windowsHide: true,
  input: JSON.stringify({ base, saved, artifact, fingerprint: api.workspaceFingerprint(saved), invalid: invalidImages }),
})
assert.equal(backend.status, 0, backend.stderr || String(backend.error))
const privateImage = { assetId: 'a'.repeat(64) + '.webp', alt: 'Saved workspace photo', decorative: false }
const privateEdit = api.updateWebsiteEditSession(api.createWebsiteEditSession(base), current => ({ ...current,
  pages: current.pages.map((page, index) => index ? page : { ...page, hero: api.withWebsiteImage(page.hero, privateImage) }),
}))
assert.equal(privateEdit.ok, true)
const privateSaved = api.applyWebsiteWorkspaceUpdate(base, current => api.commitWebsiteEditSession(current, privateEdit.session)).workspace
const privateArtifact = api.createWebsiteArtifact(privateSaved)
assert.deepEqual(api.restoreWorkspace(JSON.parse(JSON.stringify(privateSaved))).pages[0].hero.image, privateImage)
assert.throws(() => api.buildWebsiteHtml(privateArtifact), /saved photo could not be included/)
for (const unsafe of ['https://example.com/private.webp', 'blob:local', 'data:image/svg+xml;base64,AAAA', 'data:image/webp;base64,\" onerror=\"bad']) {
  assert.throws(() => api.buildWebsiteHtml(privateArtifact, new Map([[privateImage.assetId, unsafe]])))
}
const privateBackend = spawnSync(python, ['-X', 'utf8', '-c', script], {
  cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', windowsHide: true,
  input: JSON.stringify({ base, saved: privateSaved, artifact: privateArtifact, fingerprint: api.workspaceFingerprint(privateSaved), invalid: invalidImages }),
})
assert.equal(privateBackend.status, 0, privateBackend.stderr || String(privateBackend.error))
console.log(JSON.stringify({ ok: true, contract: 'website_section_images', invalidCases: invalidImages.length, backend: backend.stdout.trim() }))
