import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const baseUrl = (process.argv[2] || process.env.SUPERMEGA_PUBLIC_BASE_URL || 'https://supermega.dev').replace(/\/$/, '')
const outputDir = resolve(process.cwd(), 'output', 'playwright')
const expectedTemplates = [
  'DeskPOS Quickstart',
  'Viber / WhatsApp Business Ledger',
  'Inbox & Calendar Operator',
  'Daily Intelligence Brief Agent',
  'Factory Ops Ledger',
  'Data Cleanup & Reporting Agent',
]

function fail(reason, extra = {}) {
  console.error(JSON.stringify({ status: 'error', reason, base_url: baseUrl, ...extra }, null, 2))
  process.exit(1)
}

async function expectCopy(page, tokens, label, viewport) {
  const body = await page.locator('body').innerText({ timeout: 10000 }).catch(() => '')
  const normalized = body.replace(/\s+/g, ' ').toLowerCase()
  const missing = tokens.filter((token) => !normalized.includes(token.toLowerCase()))
  if (missing.length) fail('copy_missing', { label, viewport, missing, excerpt: body.replace(/\s+/g, ' ').slice(0, 900) })
}

async function open(page, url, viewport) {
  let response
  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await page.goto(url, { waitUntil: 'commit', timeout: 45000 })
      lastError = undefined
      break
    } catch (error) {
      lastError = error
      await page.goto('about:blank', { waitUntil: 'commit', timeout: 5000 }).catch(() => undefined)
      await page.waitForTimeout(750 * attempt)
    }
  }
  if (lastError) fail('page_navigation_timeout', { viewport, url, message: lastError.message })
  if (!response || !response.ok()) fail('page_not_ok', { viewport, url, status: response?.status() ?? 'no_response' })
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => undefined)
}

await mkdir(outputDir, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = { status: 'ready', base_url: baseUrl, screenshots: {}, checks: {} }

try {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 980 },
    { name: 'mobile', width: 390, height: 844, isMobile: true },
  ]) {
    const page = await browser.newPage()
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    const consoleMessages = []
    page.on('console', (message) => {
      if (!['error', 'warning'].includes(message.type())) return
      const text = message.text()
      if (text.includes('Failed to load resource: net::ERR_CONNECTION_RESET')) return
      consoleMessages.push(`${message.type()}: ${text}`)
    })

    await open(page, baseUrl, viewport.name)
    await page.locator('#products').scrollIntoViewIfNeeded()
    await expectCopy(
      page,
      ['What we actually build', 'You own it.', 'Built around how you work.', 'Reads your existing data.'],
      'home_products',
      viewport.name,
    )
    const home = await page.evaluate(() => ({
      headline: document.querySelector('h1')?.textContent?.trim() || '',
      productsHeading: document.querySelector('#products h2')?.textContent?.trim() || '',
      productBlocks: document.querySelectorAll('#products .uvp-card').length,
      contactLinks: document.querySelectorAll('a[href*="/contact/"]').length,
      overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }))
    if (!home.headline) fail('home_headline_missing', { viewport: viewport.name, home })
    if (home.productsHeading !== 'What we actually build') fail('products_heading_not_current', { viewport: viewport.name, home })
    if (home.productBlocks < 6) fail('home_products_missing', { viewport: viewport.name, home })
    if (home.contactLinks < 1) fail('home_contact_link_missing', { viewport: viewport.name, home })
    if (home.overflowX > 0) fail('home_horizontal_overflow', { viewport: viewport.name, home })

    const homeShot = resolve(outputDir, `supermega-home-${viewport.name}.png`)
    await page.screenshot({ path: homeShot, fullPage: false, animations: 'disabled' })
    results.screenshots[`home_${viewport.name}`] = homeShot
    const productsAnchorShot = resolve(outputDir, `supermega-products-anchor-${viewport.name}.png`)
    await page.locator('#products').screenshot({ path: productsAnchorShot, animations: 'disabled' })
    results.screenshots[`products_anchor_${viewport.name}`] = productsAnchorShot

    await open(page, `${baseUrl}/products/`, viewport.name)
    await page.locator('#agent-templates').scrollIntoViewIfNeeded()
    await expectCopy(page, ['AI agent templates', 'View setup kit', ...expectedTemplates], 'products_templates', viewport.name)
    const products = await page.evaluate(() => ({
      title: document.title,
      templateCards: document.querySelectorAll('#agent-templates .template-card').length,
      templateLinks: document.querySelectorAll('#agent-templates a[href*="/contact/?template="]').length,
      starterKitLinks: document.querySelectorAll('#agent-templates a[href*="/agent-templates/"]').length,
      overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }))
    if (products.templateCards !== expectedTemplates.length) fail('template_cards_missing', { viewport: viewport.name, products })
    if (products.templateLinks !== expectedTemplates.length) fail('template_links_missing', { viewport: viewport.name, products })
    if (products.starterKitLinks !== expectedTemplates.length) fail('starter_kit_links_missing', { viewport: viewport.name, products })
    if (products.overflowX > 0) fail('products_horizontal_overflow', { viewport: viewport.name, products })

    const productsShot = resolve(outputDir, `supermega-agent-templates-${viewport.name}.png`)
    await page.locator('#agent-templates').screenshot({ path: productsShot, animations: 'disabled' })
    results.screenshots[`agent_templates_${viewport.name}`] = productsShot

    await open(page, `${baseUrl}/contact/?template=daily-intelligence-brief`, viewport.name)
    await expectCopy(
      page,
      ['Start with this template.', 'Daily Intelligence Brief Agent', '11,000,000 MMK setup', 'Send request'],
      'template_contact',
      viewport.name,
    )
    const contact = await page.evaluate(() => ({
      headline: document.querySelector('h1')?.textContent?.trim() || '',
      submitVisible: Boolean(document.querySelector('button[type="submit"]')?.getBoundingClientRect().height),
      selectedPackage:
        document.querySelector('.sm-selected-package strong')?.textContent?.trim() ||
        document.querySelector('.selected-path strong')?.textContent?.trim() ||
        document.querySelector('[data-selected-path] strong')?.textContent?.trim() ||
        '',
      templateId: document.querySelector('input[name="template_id"]')?.value || '',
      starterKitUrl: document.querySelector('input[name="starter_kit_url"]')?.value || '',
      productArea: document.querySelector('input[name="product_area"]')?.value || '',
      overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }))
    if (contact.headline !== 'Start with this template.') fail('contact_headline_not_current', { viewport: viewport.name, contact })
    if (contact.selectedPackage !== 'Daily Intelligence Brief Agent') fail('contact_template_not_selected', { viewport: viewport.name, contact })
    if (contact.templateId !== 'daily-intelligence-brief') fail('contact_template_id_missing', { viewport: viewport.name, contact })
    if (contact.starterKitUrl !== '/site/agent-templates/daily-intelligence-brief.json') fail('contact_starter_kit_url_missing', { viewport: viewport.name, contact })
    if (!contact.submitVisible) fail('contact_submit_not_visible', { viewport: viewport.name, contact })
    if (contact.overflowX > 0) fail('contact_horizontal_overflow', { viewport: viewport.name, contact })
    if (consoleMessages.length) fail('console_messages', { viewport: viewport.name, consoleMessages })

    results.checks[viewport.name] = { home, products, contact }
    await page.close()
  }

  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.close()
}
