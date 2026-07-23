import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const [readme, now, current, manifestText, portfolioText] = await Promise.all([
  readFile(resolve(root, 'hq', 'README.md'), 'utf8'),
  readFile(resolve(root, 'hq', 'NOW.md'), 'utf8'),
  readFile(resolve(root, 'CURRENT.md'), 'utf8'),
  readFile(resolve(root, 'site-manifest.json'), 'utf8'),
  readFile(resolve(root, 'hq', 'portfolio.json'), 'utf8'),
])

const manifest = JSON.parse(manifestText)
const portfolio = JSON.parse(portfolioText)
const failures = []
const requireContract = (name, condition) => { if (!condition) failures.push(name) }

requireContract('portfolio schema', portfolio.schemaVersion === 'supermega.hq.portfolio.v1')
requireContract('portfolio is current', portfolio.updatedAt === '2026-07-24' && now.includes('Updated: 2026-07-24') && current.includes('Last confirmed: 2026-07-24'))
requireContract('portfolio is narrow', portfolio.portfolio?.map((entry) => entry.id).join(',') === 'company-system,website,commerce,production')
requireContract('portfolio paths are canonical', portfolio.portfolio?.map((entry) => entry.path).join(',') === '/,/products/website/,/operations/commerce/,/operations/production/')
requireContract('Website remains a truthful local release candidate', portfolio.portfolio?.find((entry) => entry.id === 'website')?.status === 'release-candidate-local'
  && portfolio.portfolio?.find((entry) => entry.id === 'website')?.surfaces?.join(',') === 'Pages,Navigation,Publish'
  && portfolio.portfolio?.find((entry) => entry.id === 'website')?.nextGate?.includes('managed site artifact')
  && now.includes('without deploying a site or changing a domain'))
requireContract('Website mobile shell is task first', current.includes('mobile opens one task-first editor with Edit and Publish')
  && current.includes('page, navigation, or search controls inside Site settings')
  && now.includes('mobile reduces the primary choice to Edit or Publish'))
requireContract('Commerce owns Website order intake', portfolio.portfolio?.find((entry) => entry.id === 'commerce')?.job.includes('Website') && !portfolio.portfolio?.some((entry) => entry.id === 'ecommerce'))
requireContract('Commerce managed intake remains adoption-gated', portfolio.portfolio?.find((entry) => entry.id === 'commerce')?.status === 'release-candidate-local'
  && portfolio.portfolio?.find((entry) => entry.id === 'commerce')?.nextGate?.includes('authenticated human Commerce confirmation'))
requireContract('product workspaces open on real work', portfolio.portfolio?.find((entry) => entry.id === 'commerce')?.surfaces?.join(',') === 'Orders,Stock'
  && portfolio.portfolio?.find((entry) => entry.id === 'production')?.surfaces?.join(',') === 'Jobs,Problems'
  && current.includes('/operations/commerce/?tab=orders')
  && current.includes('/operations/production/?tab=production')
  && !current.includes('/operations/commerce/?tab=today')
  && !current.includes('/operations/production/?tab=today'))
requireContract('application navigation is current', portfolio.portfolio?.[0]?.surfaces?.join(',') === 'Home,Work,Products,Settings (utility),Agent teams (internal)'
  && now.includes('Home, Work, and Products are the only primary destinations')
  && current.includes('Home, Work, and Products are the only primary navigation'))
requireContract('release evidence is current', now.includes('PR `#258`')
  && now.includes('its validated implementation head is')
  && now.includes('4ac6a88c1d9699249169bad081807b894e82f4fe')
  && now.includes('run `158` passed every validation job')
  && now.includes('178 product/runtime checks')
  && now.includes('96 Python tests'))
requireContract('hosted database readiness remains truthful', now.includes('PostgreSQL 17.6.1')
  && now.includes('are not installed')
  && now.includes('27 informational `rls_enabled_no_policy` findings')
  && now.includes('Do not treat its healthy status or server version as application readiness'))
requireContract('product lifecycle is explicit', portfolio.portfolio?.[0]?.lifecycle?.join(',') === 'discover,define,build,release,learn')
requireContract('manifest aligns to operating modules', manifest.products?.map((entry) => `${entry.id}:${entry.name}`).join(',') === 'commerce:Commerce,production:Production')
const expectedTemplateIds = {
  commerce: 'social-commerce,retail-wholesale,restaurant-ordering',
  production: 'production-control,maintenance-downtime,quality-traceability',
}
let workflowProfileCount = 0
for (const productId of Object.keys(expectedTemplateIds)) {
  const hqProduct = portfolio.portfolio?.find((entry) => entry.id === productId)
  const manifestProduct = manifest.products?.find((entry) => entry.id === productId)
  requireContract(`${productId} points to shared template contract`, hqProduct?.templateContract?.file === '../site-manifest.json' && hqProduct?.templateContract?.productId === productId && !Object.hasOwn(hqProduct, 'templates'))
  requireContract(`${productId} template set is supported`, manifestProduct?.templates?.map((entry) => entry.id).join(',') === expectedTemplateIds[productId])
  requireContract(`${productId} template profiles are executable`, manifestProduct?.templates?.every((entry) => entry.outcome?.trim() && entry.metric?.trim() && entry.workflow?.length >= 5 && entry.entryPoints?.length >= 3))
  workflowProfileCount += manifestProduct?.templates?.length || 0
}
requireContract('current authority includes HQ', current.includes('hq/portfolio.json') && current.includes('## Internal HQ'))
requireContract('OneDrive archive is not authority', readme.includes('historical archive and source intake') && readme.includes('does not override this repository'))
requireContract('source provenance retained', ['1VkuZ5_aUQ7DiYirt2asvzwsQJT9F_AuA', '1uxZ1Ey8xLX5yGmOCZrJ7Mx3I0HMd1unT', 'DawBDyzkTf8', '7483054882816675840'].every((token) => readme.includes(token)))
requireContract('HQ stays concise', readme.length < 7000 && now.length < 7000 && portfolioText.length < 12000)
requireContract('research remains gated', portfolio.researchGates?.some((entry) => entry.decision === 'reject') && current.includes('Research does not automatically become a dependency.'))
requireContract('research uses official sources', portfolio.researchGates?.every((entry) => /^https:\/\/(?:vercel\.com|tanstack\.com|supabase\.com)\//.test(entry.source || '')))

for (const forbidden of ['Yangon Tyre', 'ytf.supermega.dev', 'pos.supermega.dev', 'twelve product', 'autonomous employee', 'Service bookings', 'Material receiving']) {
  requireContract(`retired HQ context absent: ${forbidden}`, !`${readme}\n${now}\n${current}\n${portfolioText}`.toLowerCase().includes(forbidden.toLowerCase()))
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_hq', failures }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, contract: 'supermega_hq', products: portfolio.portfolio.map((entry) => entry.id), workflowProfiles: workflowProfileCount, researchGates: portfolio.researchGates.length }, null, 2))
