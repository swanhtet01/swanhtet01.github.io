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
requireContract('portfolio is current', portfolio.updatedAt === '2026-07-22' && now.includes('Updated: 2026-07-22'))
requireContract('portfolio is narrow', portfolio.portfolio?.map((entry) => entry.id).join(',') === 'company-system,commerce,production')
requireContract('portfolio paths are canonical', portfolio.portfolio?.map((entry) => entry.path).join(',') === '/,/operations/commerce/,/operations/production/')
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
requireContract('OneDrive archive is not authority', readme.includes('historical archive and source intake') && now.includes('unpinned/offline'))
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
