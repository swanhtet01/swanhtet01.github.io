import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { activeProductContracts } from '../showroom/src/core/product-visibility.ts'
import { parsePreviewAppBinding } from './public_preview_navigation.mjs'
import { activeSetupProductContracts, productContracts, seedSetupForProduct,
  rememberProductSetup, readProductSetup, setupProductFromQuery } from '../showroom/src/core/product-setup.ts'
import {
  managedCustomerProductIsVisible,
  managedCustomerProducts,
  productSwitcherVisible,
  resolveManagedProductHome,
  resolveManagedProductRoute,
} from '../showroom/src/core/managed-product-access.ts'

const root = resolve(import.meta.dirname, '..')
const isolatedOutputId = process.env.SUPERMEGA_PUBLIC_OUTPUT_ID || ''
if (isolatedOutputId && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(isolatedOutputId)) throw new Error('public_output_id_invalid')
const publicOutputDir = isolatedOutputId
  ? resolve(root, '.tmp', `supermega-public-output-${isolatedOutputId}`, 'static')
  : resolve(root, '.vercel/output/static')
const manifest = JSON.parse(await readFile(resolve(root, 'site-manifest.json'), 'utf8'))
const html = async path => readFile(resolve(publicOutputDir, path), 'utf8')
const release = JSON.parse(await html('__release.json'))
const previewAppBinding = release.previewNavigation
  ? parsePreviewAppBinding(JSON.stringify(release.previewNavigation), release.commit, release.commit)
  : null
const appOrigin = previewAppBinding?.origin || 'https://app.supermega.dev'
const main = value => value.match(/<main[\s\S]*?<\/main>/)?.[0] ?? ''

test('retired direct setup stops before write-capable onboarding hooks mount', async () => {
  const source = await readFile(resolve(root, 'showroom/src/core/ProductOnboardingPage.tsx'), 'utf8')
  const gate = source.slice(source.indexOf('export function ProductOnboardingPage('), source.indexOf('function ActiveProductOnboardingPage('))
  assert.match(gate, /!activeSetupProductContracts\.some\(contract => contract\.id === product\)/)
  assert.match(gate, /const retainedProduct = productContracts\[product\]/)
  assert.match(gate, /to=\{`\/\$\{retainedProduct\.slug\}\/`\}>Open retained \{retainedProduct\.name\} workspace/)
  assert.match(gate, /to="\/\?choose=1">Choose Shop<\/Link>/)
  assert.doesNotMatch(gate, /Open retained Plant workspace|Choose Shop, Ecommerce or Website/)
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
  const unavailableStart = source.indexOf('<section className="managed-login-panel"')
  assert.ok(unavailableStart >= 0)
  const unavailable = source.slice(unavailableStart)
  assert.match(unavailable, /aria-label=\{uiText\('Login unavailable'\)\}/)
  assert.match(unavailable, /to="\/\?choose=1">\{uiText\('Saved work on this device'\)\}/)
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
  assert.match(source, /!emptyCompany && managedPortal \? <nav aria-label=\{uiText\('Your workspace'\)\}/)
  assert.match(source, /customerProducts\.filter\(\(\[name\]\) => managedCustomerProductIsVisible/)
  assert.match(source, /if \(!managedCustomerProductIsVisible\(portalAccess\.products, setupKey\)\) return null/)
  assert.match(source, /uiText\('Sign in to your business\.'\)/)
  assert.match(source, /to=\{managedLoginPath\(null\)\}>\{uiText\('Login'\)\}<\/Link>/)
  for (const retiredBrowserDetail of ['localProductSetups', "readProductSetup(window.localStorage, 'production')", 'setSetupLoadFailed', 'Workspace unavailable', 'On this device']) {
    assert.ok(!source.includes(retiredBrowserDetail), `unauthenticated root must not expose ${retiredBrowserDetail}`)
  }
})

test('one source policy exposes Shop only and retains internal workspaces', () => {
  const before = JSON.stringify(manifest)
  assert.deepEqual(manifest.productVisibility.activeProductIds, ['shop'])
  assert.deepEqual(manifest.productVisibility.retainedOnlyProductIds, ['plant', 'website', 'ecommerce'])
  assert.equal(manifest.productVisibility.retainedWorkspaceAccess, true)
  assert.equal(manifest.productVisibility.deleteRetainedData, false)
  assert.deepEqual(activeProductContracts(manifest).map(p => p.id), ['shop'])
  assert.deepEqual(activeSetupProductContracts.map(p => p.id), ['commerce'])
  assert.equal(JSON.stringify(manifest), before)
  assert.deepEqual(Object.keys(productContracts), ['commerce', 'production', 'website', 'ecommerce'])
})

test('managed customer routes stay Shop-only even when internal product entitlements are assigned', () => {
  const assignments = ['commerce', 'website', 'ecommerce', 'production']
  assert.deepEqual(managedCustomerProducts(assignments), ['commerce'])
  assert.equal(managedCustomerProductIsVisible(assignments, 'commerce'), true)
  for (const internal of ['website', 'ecommerce', 'production']) {
    assert.equal(managedCustomerProductIsVisible(assignments, internal), false)
    assert.deepEqual(resolveManagedProductRoute(internal, assignments), {
      kind: 'redirect', product: 'commerce', path: '/shop/',
    })
  }
  assert.equal(productSwitcherVisible('ready', assignments), false)
  assert.deepEqual(resolveManagedProductHome({
    requestedProduct: null,
    requestedPath: null,
    rememberedProduct: 'ecommerce',
    choosingProduct: false,
    assignedProducts: assignments,
  }), { kind: 'redirect', product: 'commerce', path: '/shop/' })
})

test('internal-only assignments do not grant a managed customer product route', () => {
  const assignments = ['website', 'ecommerce', 'production']
  assert.deepEqual(managedCustomerProducts(assignments), [])
  for (const internal of assignments) assert.deepEqual(resolveManagedProductRoute(internal, assignments), { kind: 'empty' })
  assert.deepEqual(resolveManagedProductHome({
    requestedProduct: null,
    requestedPath: null,
    rememberedProduct: null,
    choosingProduct: false,
    assignedProducts: assignments,
  }), { kind: 'launcher' })
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

test('public root redirects to Shop while Contact introduces the company', async () => {
  const homeDocument = await html('index.html')
  const home = main(homeDocument), contact = main(await html('contact/index.html'))
  assert.equal(manifest.pages.find((page) => page.route === '/')?.redirectTo, '/shop/')
  assert.match(homeDocument, /name="robots" content="noindex,follow"/)
  assert.match(homeDocument, /rel="canonical" href="https:\/\/supermega\.dev\/shop\/"/)
  assert.match(homeDocument, /http-equiv="refresh" content="0; url=\/shop\/"/)
  assert.match(home, /href="\/shop\/">Continue to Shop<\/a>/)
  assert.doesNotMatch(home, /company-hero|actual-shop-|\/plant\/|\/website\/|\/ecommerce\//)
  assert.match(contact, /SuperMega is a Myanmar software company\. Shop is our first customer product for counter sales, stock and order follow-up\./)
  assert.match(contact, /<input type="hidden" name="product" value="guide" \/>/)
  assert.doesNotMatch(contact, /<select[^>]*name="product"/)
  assert.match(contact, /Tell us about your business and the workflow you want to improve\. We will reply by email\./)
  assert.doesNotMatch(contact, /English and Burmese are both welcome/)
  for (const product of activeProductContracts(manifest)) {
    const page = main(await html(product.id+'/index.html'))
    const fullPage = await html(product.id+'/index.html')
    const expectedLogin = `href="${appOrigin}/login?product=shop"`
    const loginLinks = [...fullPage.matchAll(/href="https:\/\/[^\"]+\/login[^\"]*"/g)].map(([link]) => link).filter(link => link.startsWith(`href="${appOrigin}/`))
    assert.deepEqual(loginLinks, [expectedLogin])
    if (product.id === 'shop') assert.match(page, /class="shop-hero-app"/)
    else assert.match(page, /class="platform-image"/)
    assert.doesNotMatch(page, /Request assisted setup/)
    if (product.status === 'available-in-app') {
      assert.match(page, /class="home-contact product-action"/)
      assert.ok(page.includes(`href="/contact/?product=${product.id}"`))
    } else {
      assert.doesNotMatch(page, /class="home-contact product-action"/)
    }
    assert.doesNotMatch(page, /product=plant|href="\/plant\//)
  }
})

test('internal Sites and Commerce routes preserve records without product capture or setup CTA', async () => {
  for (const id of ['website', 'ecommerce']) {
    const page = await html(id + '/index.html')
    assert.match(page, /name="robots" content="noindex,follow"/)
    assert.match(page, /not offered for new setup/)
    assert.match(page, /Existing workspace records are preserved/)
    assert.doesNotMatch(page, /class="platform-image|class="trade-card|Request assisted setup|Open (?:Website|Ecommerce)/)
  }
})

test('Plant public route becomes compatibility-only, not sales or new setup', async () => {
  const page = await html('plant/index.html'), content = main(page)
  assert.match(page, /name="robots" content="noindex,follow"/)
  assert.match(content, /not offered for new setup/)
  assert.match(content, /Existing workspace records are preserved/)
  assert.match(content, /href="\/shop\/">View current products/)
  assert.doesNotMatch(content, /Open retained workspace|href="[^\"]*\/plant\//)
  assert.doesNotMatch(content, /first-job-templates|Start free sample|Request assisted setup|product=plant|\?template=|\?pack=/)
  assert.doesNotMatch(await html('sitemap.xml'), /<loc>https:\/\/supermega.dev\/plant\/<\/loc>/)
  const configPath = isolatedOutputId
    ? resolve(root, '.tmp', `supermega-public-output-${isolatedOutputId}`, 'config.json')
    : resolve(root, '.vercel/output/config.json')
  const config = JSON.parse(await readFile(configPath,'utf8'))
  assert.ok(config.routes.some(route => route.headers?.Location === '/plant/'))
  assert.ok(!config.routes.some(route => route.headers?.Location === '/#plant'))
})
