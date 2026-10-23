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
  assert.match(unavailable, /Contact us about Shop/)
  assert.match(unavailable, /Shop pilot access is issued during assisted setup/)
  assert.match(unavailable, /Native Shop can make its first local sale without this managed account/)
  assert.match(unavailable, /shopAccessIntent \? 'Contact us about Shop' : 'Contact support'/)
  assert.match(unavailable, /Contact support for account access\. Your saved work is still available on this device\./)
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
  for (const label of ['Saved work on this device', 'Contact us about Shop', 'Shop pilot access is issued during assisted setup. Native Shop can make its first local sale without this managed account. Your saved work is still available on this device.']) {
    assert.ok(requiredLogin.includes(label), `missing login contract: ${label}`)
  }
  for (const label of requiredLogin) {
    assert.throws(() => validate({ ...input, managedLoginChunk: input.managedLoginChunk.replaceAll(label, '') }), /missing_current_release_asset:company_login:/)
  }
  assert.throws(() => validate({ ...input, managedLoginChunk: 'Open your company. Try free demo Request company account' }), /missing_current_release_asset:company_login:/)
})

test('launcher consumes active policy without discarding retained or assigned access', async () => {
  const source = await readFile(resolve(root, 'showroom/src/core/CoreShell.tsx'), 'utf8')
  assert.match(source, /setActiveSetupIds\(activeSetupProductContracts\.map\(product => product\.id\)\)/)
  assert.ok(source.includes("Boolean(productSetups?.[PRODUCT_SETUP_KEY[name]]?.startedAt) || (name === 'Website' && Boolean(savedWebsiteName))"), 'local cards require saved work')
  assert.match(source, /!managedPortal && !activeSetupIds\.includes\(setupKey\) && !setup/)
  assert.match(source, /managedPortal && !managedProductIsVisible\(portalAccess\.products, setupKey\)/)
  assert.match(source, /readProductSetup\(window\.localStorage, 'production'\)/)
  assert.match(source, /setSetupLoadFailed\(true\)/)
  assert.match(source, /\[managedPortal, setupLoadAttempt\]/)
  assert.match(source, /setSetupLoadAttempt\(attempt => attempt \+ 1\)/)
  assert.match(source, /Workspace unavailable/)
})

test('one source policy exposes Shop publicly while preserving internal setup contracts', () => {
  const before = JSON.stringify(manifest)
  assert.deepEqual(activeProductContracts(manifest).map(p => p.id), ['shop'])
  assert.deepEqual(activeSetupProductContracts.map(p => p.id), ['commerce'])
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

test('generated public entry and contact expose only Shop', async () => {
  const home = await html('index.html'), contact = main(await html('contact/index.html'))
  assert.match(home, /url=\/shop\//)
  assert.doesNotMatch(home, /class="product-story"|Plant|all four/)
  assert.doesNotMatch(contact, /<select|<option|product=ecommerce|product=website|product=plant/)
  assert.match(contact, /name="product" value="guide"/)
  for (const product of activeProductContracts(manifest)) {
    const page = main(await html(product.id+'/index.html'))
    const fullPage = await html(product.id+'/index.html')
    assert.equal((fullPage.match(/href="https:\/\/app\.supermega\.dev\/login"/g) ?? []).length, 1)
    assert.match(page, /src="\/images\/native-shop\/shop_checkout_1200_en\.png"/)
    assert.match(page, /srcset="\/images\/native-shop\/shop_sell_390_en\.png"/)
    assert.match(page, />Shop for Myanmar retailers<\/p>/)
    assert.match(page, /Sell clearly\. Keep stock accurate\./)
    assert.match(page, /Find an item, take payment and see what needs attention—even when the connection is unreliable\./)
    assert.match(page, />Contact us about Shop<\/a>/)
    assert.match(page, /class="native-shop-tableau"/)
    assert.match(page, /Illustrative Shop preview with synthetic sample data\./)
    assert.match(page, /How it works at the counter/)
    assert.match(page, /Search or scan/)
    assert.match(page, /How to get Shop/)
    assert.match(page, /Public downloads and self-service signup are not open yet/)
    assert.match(page, /The web app, macOS and iPhone are not current customer Shop products\./)
    assert.equal((page.match(/class="shop-template-card"/g) ?? []).length, 4)
    assert.equal((page.match(/class="shop-platform-card"/g) ?? []).length, 3)
    assert.doesNotMatch(page, /data-platform-carousel|Open Ecommerce|Open Website/)
    assert.doesNotMatch(fullPage, /SuperMega Shop|Request a Shop pilot|Request a Shop walkthrough/)
    assert.doesNotMatch(page, />Desktop<|>Tablet<|>Phone</)
    assert.doesNotMatch(page, /product=plant|href="\/plant\//)
  }
  const myShop = main(await html('my/shop/index.html'))
  assert.match(myShop, /src="\/images\/native-shop\/shop_checkout_1200_my\.png"/)
  assert.match(myShop, /srcset="\/images\/native-shop\/shop_sell_390_my\.png"/)
  assert.match(myShop, />မြန်မာ လက်လီဆိုင်များအတွက် Shop<\/p>/)
  assert.match(myShop, /Shop အကြောင်း ဆက်သွယ်ရန်/)
  assert.match(myShop, /နမူနာဒေတာဖြင့် ဖော်ပြထားသော Shop အက်ပ်မြင်ကွင်း။/)
  assert.match(myShop, /ကောင်တာတွင် အလုပ်လုပ်ပုံ/)
  assert.match(myShop, /ရှာပါ သို့မဟုတ် စကင်ဖတ်ပါ/)
  assert.match(myShop, /Shop ရယူရန်/)
  assert.equal((myShop.match(/class="shop-template-card"/g) ?? []).length, 4)
  assert.equal((myShop.match(/class="shop-platform-card"/g) ?? []).length, 3)
})

test('Plant public route becomes compatibility-only, not sales or new setup', async () => {
  const page = await html('plant/index.html'), content = main(page)
  assert.match(page, /name="robots" content="noindex,follow"/)
  assert.match(content, /not offered for new setup/)
  assert.match(content, /Existing workspace records are preserved/)
  assert.match(content, /href="\/shop\/">View Shop/)
  assert.doesNotMatch(content, /Open retained workspace|href="[^\"]*\/plant\//)
  assert.doesNotMatch(content, /first-job-templates|Start free sample|Request assisted setup|product=plant|\?template=|\?pack=/)
  assert.doesNotMatch(await html('sitemap.xml'), /<loc>https:\/\/supermega.dev\/plant\/<\/loc>/)
  const config = JSON.parse(await readFile(resolve(root,'.vercel/output/config.json'),'utf8'))
  assert.ok(config.routes.some(route => route.headers?.Location === '/plant/'))
  assert.ok(!config.routes.some(route => route.headers?.Location === '/#plant'))
})
