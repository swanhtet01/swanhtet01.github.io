import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { activeProductContracts } from '../showroom/src/core/product-visibility.ts'
import { activeSetupProductContracts, productContracts, seedSetupForProduct,
  rememberProductSetup, readProductSetup, setupProductFromQuery } from '../showroom/src/core/product-setup.ts'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(await readFile(resolve(root, 'site-manifest.json'), 'utf8'))
const html = async path => readFile(resolve(root, '.vercel/output/static', path), 'utf8')
const main = value => value.match(/<main[\s\S]*?<\/main>/)?.[0] ?? ''

test('retired direct setup stops before write-capable onboarding hooks mount', async () => {
  const source = await readFile(resolve(root, 'showroom/src/core/ProductOnboardingPage.tsx'), 'utf8')
  const gate = source.slice(source.indexOf('export function ProductOnboardingPage('), source.indexOf('function ActiveProductOnboardingPage('))
  assert.match(gate, /!activeSetupProductContracts\.some\(contract => contract\.id === product\)/)
  assert.match(gate, /Open retained Plant workspace/)
  assert.match(gate, /return <ActiveProductOnboardingPage key=\{product\}/)
  assert.doesNotMatch(gate, /useSetupWorkspace|useProductionWorkspace|rememberProductSetup|useEffect/)
})

test('new trial choices consume active products and reject retired query selection', async () => {
  const source = await readFile(resolve(root, 'showroom/src/core/SignupPage.tsx'), 'utf8')
  assert.match(source, /activeSetupProductContracts\.map/)
  assert.match(source, /activeTrialChoices\.some\(choice => choice\.id === requested\) \? requested : 'commerce'/)
  assert.match(source, /activeTrialChoices\.map\(\(choice\) => <option/)
  assert.doesNotMatch(source, /TRIAL_SIGNUP_PRODUCT_CHOICES\.map\(/)
})

test('unavailable sign-in offers saved work and assisted setup without demo entry', async () => {
  const source = await readFile(resolve(root, 'showroom/src/core/ManagedLoginPage.tsx'), 'utf8')
  const unavailable = source.slice(source.indexOf('<section className="managed-login-panel" aria-label="Login unavailable">'))
  assert.match(unavailable, /to="\/\?choose=1">Saved work on this device/)
  assert.match(unavailable, /Contact support/)
  assert.doesNotMatch(unavailable, /Free trial|Try free demo|Try a sample/)
  assert.match(source, /Date\.now\(\) < cooldownUntil/)
})

test('release assets require the current login choices and local workspace boundary', async () => {
  const source = await readFile(resolve(root, 'tools/verify_app_release_live.mjs'), 'utf8')
  const body = source.slice(source.indexOf('export function verifyCurrentReleaseAssets('), source.indexOf('async function readArtifactChunk('))
    .replace('export function', 'function')
  // Extract only the pure validator: importing this CLI would make live requests.
  const validate = runInNewContext(`${body}; verifyCurrentReleaseAssets`)
  const inspectGroups = runInNewContext(`${body.replace('let checks = 0', 'return groups; let checks = 0')}; verifyCurrentReleaseAssets`)
  const keys = ['assetCorpus', 'operationsChunk', 'productSystemNavigatorChunk', 'productOnboardingChunk', 'settingsChunk', 'ecommerceProductCorpus', 'websiteChunk', 'clientDataOnboardingChunk', 'managedLoginChunk', 'managedAccountChunk', 'companyBackupCorpus', 'activationRunbookChunk']
  const input = { manifest: { brand: { colors: { accent: '#fixture-accent', ink: '#fixture-ink' } } }, ...Object.fromEntries(keys.map(key => [key, key])) }
  const groups = inspectGroups(input)
  for (const key of keys) input[key] = ''
  for (const [, key, required] of groups) input[key] += `${required.join('\n')}\n`
  assert.doesNotThrow(() => validate(input))
  const requiredLogin = groups.find(([name]) => name === 'company_login')[2]
  for (const label of ['Saved work on this device', 'Contact support', 'Contact support for account access. Your saved work is still available on this device.']) {
    assert.ok(requiredLogin.includes(label), `missing login contract: ${label}`)
  }
  for (const label of requiredLogin) {
    assert.throws(() => validate({ ...input, managedLoginChunk: input.managedLoginChunk.replaceAll(label, '') }), /missing_current_release_asset:company_login:/)
  }
  assert.throws(() => validate({ ...input, managedLoginChunk: 'Open your company. Try free demo Request company account' }), /missing_current_release_asset:company_login:/)
})

test('unauthenticated launcher preserves managed-only access and hides browser-local workspace detail', async () => {
  const source = await readFile(resolve(root, 'showroom/src/core/CoreShell.tsx'), 'utf8')
  assert.match(source, /!emptyCompany && managedPortal \? <nav aria-label="Your workspace"/)
  assert.match(source, /customerProducts\.filter\(\(\[name\]\) => managedProductIsVisible/)
  assert.match(source, /if \(!managedProductIsVisible\(portalAccess\.products, setupKey\)\) return null/)
  assert.match(source, /Sign in to your business\./)
  assert.match(source, /to=\{managedLoginPath\(null\)\}>Login<\/Link>/)
  for (const retiredBrowserDetail of ['localProductSetups', "readProductSetup(window.localStorage, 'production')", 'setSetupLoadFailed', 'Workspace unavailable', 'On this device']) {
    assert.ok(!source.includes(retiredBrowserDetail), `unauthenticated root must not expose ${retiredBrowserDetail}`)
  }
})

test('one source policy declares exactly three active acquisition doors', () => {
  const before = JSON.stringify(manifest)
  assert.deepEqual(activeProductContracts(manifest).map(p => p.id), ['shop', 'ecommerce', 'website'])
  assert.deepEqual(activeSetupProductContracts.map(p => p.id), ['commerce', 'ecommerce', 'website'])
  assert.equal(JSON.stringify(manifest), before)
  assert.deepEqual(Object.keys(productContracts), ['commerce', 'production', 'website', 'ecommerce'])
})

test('missing, overlapping, unknown or destructive visibility fails closed', () => {
  for (const mutate of [
    m => { delete m.productVisibility },
    m => { m.productVisibility.activeProductIds.push('plant') },
    m => { m.productVisibility.activeProductIds.push('unknown') },
    m => { m.productVisibility.activeProductIds.pop() },
    m => { m.productVisibility.activeProductIds.push('shop') },
    m => { m.productVisibility.deleteRetainedData = true },
    m => { m.productVisibility.retainedWorkspaceAccess = false },
    m => { m.customerProducts[1].runtimeId = 'commerce' },
  ]) {
    const altered = structuredClone(manifest); mutate(altered)
    assert.throws(() => activeProductContracts(altered), /product_visibility_contract_invalid/)
  }
})

test('saved Plant setup survives visibility projection byte-for-byte', () => {
  const values = new Map(), storage = {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}
  const saved = {...seedSetupForProduct('production'), workspace:'Retained fixture plant',owner:'Fixture owner',startedAt:'2026-09-15T00:00:00.000Z'}
  assert.equal(rememberProductSetup(storage, saved), true)
  const before = [...values]
  activeProductContracts(manifest)
  assert.equal(readProductSetup(storage, 'production').workspace, saved.workspace)
  assert.equal(setupProductFromQuery('plant'), 'production')
  assert.deepEqual([...values], before)
  assert.ok(productContracts.production.templates.length > 0)
})

test('generated public home and contact offer only active products', async () => {
  const home = main(await html('index.html')), contact = main(await html('contact/index.html'))
  assert.equal((home.match(/class="product-card-compact"/g)??[]).length, 3)
  assert.equal((home.match(/class="product-card-flow"/g)??[]).length, 3)
  assert.match(home, /Contact SuperMega/)
  assert.doesNotMatch(home, /Plant|all four|href="[^\"]*(?:\/plant\/|product=plant)/)
  assert.deepEqual([...contact.matchAll(/<option value="([^"]+)">/g)].map(m=>m[1]), ['guide','shop','ecommerce','website'])
  for (const product of activeProductContracts(manifest)) {
    const page = main(await html(product.id+'/index.html'))
    const fullPage = await html(product.id+'/index.html')
    assert.equal((fullPage.match(/href="https:\/\/app\.supermega\.dev\/login"/g) ?? []).length, 1)
    assert.match(page, /class="platform-image"/)
    assert.doesNotMatch(page, /Request assisted setup|Open Shop|Open Ecommerce|Open Website/)
    assert.doesNotMatch(page, /product=plant|href="\/plant\//)
  }
})

test('Plant public route becomes compatibility-only, not sales or new setup', async () => {
  const page = await html('plant/index.html'), content = main(page)
  assert.match(page, /name="robots" content="noindex,follow"/)
  assert.match(content, /not offered for new setup/)
  assert.match(content, /Existing workspace records are preserved/)
  assert.match(content, /href="\/#products">View current products/)
  assert.doesNotMatch(content, /Open retained workspace|href="[^\"]*\/plant\//)
  assert.doesNotMatch(content, /first-job-templates|Start free sample|Request assisted setup|product=plant|\?template=|\?pack=/)
  assert.doesNotMatch(await html('sitemap.xml'), /<loc>https:\/\/supermega.dev\/plant\/<\/loc>/)
  const config = JSON.parse(await readFile(resolve(root,'.vercel/output/config.json'),'utf8'))
  assert.ok(config.routes.some(route => route.headers?.Location === '/plant/'))
  assert.ok(!config.routes.some(route => route.headers?.Location === '/#plant'))
})
