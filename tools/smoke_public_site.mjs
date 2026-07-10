import { chromium } from 'playwright'

const baseUrl = (process.argv[2] || process.env.SUPERMEGA_PUBLIC_BASE_URL || 'https://supermega.dev').replace(/\/$/, '')
const timeoutMs = Number(process.env.SUPERMEGA_PUBLIC_SMOKE_TIMEOUT_MS || 45000)

function fail(error, extra = {}) {
  console.error(JSON.stringify({ status: 'error', base_url: baseUrl, error, ...extra }, null, 2))
  process.exit(1)
}

async function fetchRedirect(path) {
  return fetch(`${baseUrl}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
}

async function bodyText(page) {
  return (await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')).replace(/\s+/g, ' ').trim()
}

async function open(page, path) {
  const response = await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
  if (!response || !response.ok()) fail('page_not_ok', { path, status_code: response?.status() ?? 'no_response' })
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => undefined)
}

async function expectBodyIncludes(page, expected, label) {
  try {
    await page.waitForFunction(
      (tokens) => {
        const body = document.body?.innerText?.replace(/\s+/g, ' ').toLowerCase() || ''
        return tokens.every((token) => body.includes(String(token).toLowerCase()))
      },
      expected,
      { timeout: timeoutMs },
    )
  } catch {
    fail('copy_missing', { label, expected, body: (await bodyText(page)).slice(0, 900), url: page.url() })
  }
}

const productsRedirect = await fetchRedirect('/products/')
const productsLocation = productsRedirect.headers.get('location') || ''
if (productsRedirect.status !== 200) {
  fail('products_route_not_static_page', { status_code: productsRedirect.status, location: productsLocation })
}

const workflowRedirect = await fetchRedirect('/products/ai-workflow-desk')
const workflowLocation = workflowRedirect.headers.get('location') || ''
if (![301, 302, 303, 307, 308].includes(workflowRedirect.status) || !workflowLocation.includes('/contact/?package=document-extraction-ledger')) {
  fail('workflow_product_route_not_mapped', { status_code: workflowRedirect.status, location: workflowLocation })
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } })

try {
  await open(page, '/')
  await page.locator('#products').scrollIntoViewIfNeeded()
  await expectBodyIncludes(
    page,
    ['What we actually build', 'You own it.', 'Built around how you work.', 'Reads your existing data.'],
    'home_product_anchor',
  )

  const home = await page.evaluate(() => ({
    headline: document.querySelector('h1')?.textContent?.trim() || '',
    productsHeading: document.querySelector('#products h2')?.textContent?.trim() || '',
    contactLinks: document.querySelectorAll('a[href*="/contact/"]').length,
    productBlocks: document.querySelectorAll('#products .uvp-card').length,
    overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
  }))

  if (!home.headline) fail('home_headline_missing', { home })
  if (!home.productsHeading) fail('products_heading_not_current', { home })
  if (home.contactLinks < 1) fail('public_contact_link_missing', { home })
  if (home.productBlocks < 3) fail('public_products_missing', { home })
  if (home.overflowX > 0) fail('public_horizontal_overflow', { home })

  await open(page, '/products/')
  await expectBodyIncludes(
    page,
    ['AI agent templates', 'Shop Quickstart', 'Daily Intelligence Brief Agent', 'Factory Ops Ledger', 'View setup kit', 'Shop'],
    'products_key_labels',
  )
  const products = await page.evaluate(() => ({
    title: document.title,
    contactLinks: document.querySelectorAll('a[href*="/contact/"]').length,
    overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
  }))
  if (products.contactLinks < 1) fail('products_contact_link_missing', { products })
  if (products.overflowX > 0) fail('products_horizontal_overflow', { products })

  await open(page, '/agent-templates/daily-intelligence-brief/')
  await expectBodyIncludes(
    page,
    ['Daily Intelligence Brief Agent', 'Setup inputs', 'First run workflow', 'Acceptance tests', 'Start this template'],
    'template_setup_page',
  )

  await open(page, '/contact/?template=daily-intelligence-brief')
  await expectBodyIncludes(
    page,
    ['Start with this template.', 'Daily Intelligence Brief Agent', '11,000,000 MMK setup', 'Send request'],
    'template_contact',
  )
  const templateContact = await page.evaluate(() => ({
    headline: document.querySelector('h1')?.textContent?.trim() || '',
    selected:
      document.querySelector('.sm-selected-package strong')?.textContent?.trim() ||
      document.querySelector('.selected-path strong')?.textContent?.trim() ||
      document.querySelector('[data-selected-path] strong')?.textContent?.trim() ||
      '',
    starterKitUrl: document.querySelector('input[name="starter_kit_url"]')?.value || '',
    submitVisible: Boolean(document.querySelector('button[type="submit"]')?.getBoundingClientRect().height),
  }))
  if (templateContact.selected !== 'Daily Intelligence Brief Agent') fail('template_contact_selection_wrong', { templateContact })
  if (templateContact.starterKitUrl !== '/site/agent-templates/daily-intelligence-brief.json') fail('template_contact_starter_kit_missing', { templateContact })
  if (!templateContact.submitVisible) fail('template_contact_submit_missing', { templateContact })

  await open(page, '/contact/')
  await expectBodyIncludes(page, ['Send one workflow.', 'Send request'], 'general_contact')
} finally {
  await page.close().catch(() => undefined)
  await browser.close().catch(() => undefined)
}

const statusResponse = await fetch(`${baseUrl}/api/contact-submissions/status`, {
  headers: { accept: 'application/json', 'user-agent': 'supermega-public-smoke/2.0' },
  signal: AbortSignal.timeout(timeoutMs),
})
const statusBody = await statusResponse.json().catch(() => ({}))
if (!statusResponse.ok || statusBody.status !== 'ready') {
  fail('contact_status_not_ready', { status_code: statusResponse.status, statusBody })
}

const starterResponse = await fetch(`${baseUrl}/site/agent-templates/daily-intelligence-brief.json`, {
  headers: { accept: 'application/json', 'user-agent': 'supermega-public-smoke/2.0' },
  signal: AbortSignal.timeout(timeoutMs),
})
const starterBody = await starterResponse.json().catch(() => ({}))
if (!starterResponse.ok || starterBody.id !== 'daily-intelligence-brief' || !Array.isArray(starterBody.acceptance_tests)) {
  fail('starter_kit_not_ready', { status_code: starterResponse.status, starterBody })
}

console.log(
  JSON.stringify(
    {
      status: 'ready',
      base_url: baseUrl,
      pages: [
        '/',
        '/products/',
        '/agent-templates/daily-intelligence-brief/',
        '/contact/?template=daily-intelligence-brief',
        '/contact/',
      ],
      contact_api: statusBody.status,
      starter_kit: starterBody.id,
    },
    null,
    2,
  ),
)
