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
  await expectBodyIncludes(page, ['DeskPOS', 'Document Extraction Ledger', 'Factory & Operations'], 'home_product_labels')

  const home = await page.evaluate(() => ({
    headline: document.querySelector('h1')?.textContent?.trim() || '',
    productsHeading: document.querySelector('#products h2')?.textContent?.trim() || '',
    contactLinks: document.querySelectorAll('a[href*="/contact/"]').length,
    productBlocks: document.querySelectorAll('#products [id][class*="product"]').length || document.querySelectorAll('#products article').length,
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
    ['Document Extraction Ledger', 'DeskPOS'],
    'products_key_labels',
  )
  const products = await page.evaluate(() => ({
    title: document.title,
    contactLinks: document.querySelectorAll('a[href*="/contact/"]').length,
    overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
  }))
  if (products.contactLinks < 1) fail('products_contact_link_missing', { products })
  if (products.overflowX > 0) fail('products_horizontal_overflow', { products })

  await open(page, '/contact/?package=document-extraction-ledger')
  await expectBodyIncludes(page, ['Send one workflow.', 'Document Extraction Ledger', 'Send request'], 'document_ledger_contact')
  const documentContact = await page.evaluate(() => ({
    headline: document.querySelector('h1')?.textContent?.trim() || '',
    selected:
      document.querySelector('.sm-selected-package strong')?.textContent?.trim() ||
      document.querySelector('.selected-path strong')?.textContent?.trim() ||
      document.querySelector('[data-selected-path] strong')?.textContent?.trim() ||
      '',
    submitVisible: Boolean(document.querySelector('button[type="submit"]')?.getBoundingClientRect().height),
  }))
  if (documentContact.selected !== 'Document Extraction Ledger') fail('document_ledger_contact_selection_wrong', { documentContact })
  if (!documentContact.submitVisible) fail('document_ledger_contact_submit_missing', { documentContact })

  await open(page, '/contact/?package=back-office-workflow-desk')
  await expectBodyIncludes(page, ['Send one workflow.', 'Back Office Workflow Desk', 'Send request'], 'workflow_desk_contact')
  const workflowContact = await page.evaluate(() => ({
    selected:
      document.querySelector('.sm-selected-package strong')?.textContent?.trim() ||
      document.querySelector('.selected-path strong')?.textContent?.trim() ||
      document.querySelector('[data-selected-path] strong')?.textContent?.trim() ||
      '',
  }))
  if (workflowContact.selected !== 'Back Office Workflow Desk') fail('workflow_desk_contact_selection_wrong', { workflowContact })

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

console.log(
  JSON.stringify(
    {
      status: 'ready',
      base_url: baseUrl,
      pages: [
        '/',
        '/products/',
        '/contact/?package=document-extraction-ledger',
        '/contact/?package=back-office-workflow-desk',
        '/contact/?package=agency-client-operator',
      ],
      contact_api: statusBody.status,
    },
    null,
    2,
  ),
)
