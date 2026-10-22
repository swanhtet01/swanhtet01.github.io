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
  const home = await html('index.html'), contactSource = await html('contact/index.html'), contact = main(contactSource)
  assert.match(home, /url=\/shop\//)
  assert.match(home, /rel="canonical" href="https:\/\/supermega\.dev\/shop\/"/)
  assert.match(home, /name="robots" content="noindex,follow"/)
  assert.doesNotMatch(home, /class="product-story"|Plant|all four/)
  assert.doesNotMatch(contact, /<select|<option|product=ecommerce|product=website|product=plant/)
  assert.match(contact, /name="product" value="guide"/)
  assert.match(contact, new RegExp(manifest.company.statement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  for (const product of activeProductContracts(manifest)) {
    const page = main(await html(product.id+'/index.html'))
    const fullPage = await html(product.id+'/index.html')
    assert.equal((fullPage.match(/href="https:\/\/app\.supermega\.dev\/login"/g) ?? []).length, 1)
    assert.doesNotMatch(fullPage, /aria-label="SuperMega Shop"/)
    assert.match(page, /src="\/images\/native-shop\/shop_checkout_1200_en\.png"/)
    assert.match(page, /srcset="\/images\/native-shop\/shop_checkout_820_en\.png"/)
    assert.match(page, />Shop<\/p>/)
    assert.match(page, /Shop Basic/)
    assert.match(page, /Assisted Launch/)
    assert.match(page, /Shop Pro/)
    assert.match(page, /Available for pilot/)
    assert.match(page, /Planned — not yet available/)
    assert.match(page, /See the available starting setups/)
    assert.doesNotMatch(page, /Scan or tap to sell/)
    assert.doesNotMatch(fullPage, /\.nav-sign-in\s*\{\s*display:\s*none/)
    assert.doesNotMatch(page, /SuperMega Shop|shop_[a-z]+_390_en\.png|Shop phone|>Phone</)
    assert.doesNotMatch(page, /data-platform-carousel|Open Ecommerce|Open Website/)
    assert.doesNotMatch(page, /product=plant|href="\/plant\//)
  }
  const myShop = main(await html('my/shop/index.html'))
  const myContactSource = await html('my/contact/index.html')
  assert.match(myShop, /src="\/images\/native-shop\/shop_checkout_1200_my\.png"/)
  assert.match(myShop, /srcset="\/images\/native-shop\/shop_checkout_820_my\.png"/)
  assert.match(myShop, />Shop<\/p>/)
  assert.match(myShop, /အခြေခံအစီအစဉ်/)
  assert.match(myShop, /တပ်ဆင်ကူညီမှု/)
  assert.match(myShop, /အဆင့်မြင့်အစီအစဉ်/)
  assert.match(myShop, /စီစဉ်ထားဆဲ — မရရှိသေးပါ/)
  assert.doesNotMatch(myShop, /Shop Basic|Assisted Launch|Shop Pro/)
  assert.doesNotMatch(myShop, /shop_[a-z]+_390_my\.png|ဖုန်းမျက်နှာပြင်/)
  assert.match(myContactSource, /လက်ရှိအလုပ်လုပ်ပုံကို ပြောပြပါ/)
  assert.doesNotMatch(myContactSource, /အသုံးပြုမည့်စက်များ/)

  const publicPages = [
    ['shop/index.html', '>Company<', 'SuperMega is a Myanmar software company and the maker of Shop.'],
    ['contact/index.html', '>Company<', 'SuperMega is a Myanmar software company and the maker of Shop.'],
    ['privacy/index.html', '>Company<', 'SuperMega is a Myanmar software company and the maker of Shop.'],
    ['my/shop/index.html', '>ကုမ္ပဏီ<', 'SuperMega သည် မြန်မာနိုင်ငံမှ ဆော့ဖ်ဝဲကုမ္ပဏီဖြစ်ပြီး Shop အက်ပ်ကို ဖန်တီးပါသည်။'],
    ['my/contact/index.html', '>ကုမ္ပဏီ<', 'SuperMega သည် မြန်မာနိုင်ငံမှ ဆော့ဖ်ဝဲကုမ္ပဏီဖြစ်ပြီး Shop အက်ပ်ကို ဖန်တီးပါသည်။'],
    ['my/privacy/index.html', '>ကုမ္ပဏီ<', 'SuperMega သည် မြန်မာနိုင်ငံမှ ဆော့ဖ်ဝဲကုမ္ပဏီဖြစ်ပြီး Shop အက်ပ်ကို ဖန်တီးပါသည်။'],
  ]
  for (const [path, forbiddenLabel, companyStatement] of publicPages) {
    const source = await html(path)
    const header = source.match(/<header\b[\s\S]*?<\/header>/)?.[0] ?? ''
    const footer = source.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? ''
    assert.ok(header && footer, `public chrome missing: ${path}`)
    assert.doesNotMatch(header, new RegExp(forbiddenLabel))
    assert.doesNotMatch(header, /href="\/"/)
    assert.match(footer, new RegExp(companyStatement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }

  const config = JSON.parse(await readFile(resolve(root,'.vercel/output/config.json'),'utf8'))
  assert.ok(config.routes.some(route => route.src === '^/(?:index\\.html)?$' && route.status === 308 && route.headers?.Location === '/shop/'))
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
