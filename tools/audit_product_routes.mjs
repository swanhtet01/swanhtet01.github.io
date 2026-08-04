import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const policyPath = join(root, 'hq', 'product-route-quality-policy.json')
const appRoot = join(root, 'showroom', 'dist')
const publicRoot = join(root, '.vercel', 'output', 'static')
const outputIndex = process.argv.indexOf('--out')
const outputPath = outputIndex >= 0 ? resolve(process.cwd(), process.argv[outputIndex + 1] ?? '') : null
const routeIndex = process.argv.indexOf('--route')
const routeFilter = routeIndex >= 0 ? process.argv[routeIndex + 1] : null
const viewportIndex = process.argv.indexOf('--viewport')
const viewportFilter = viewportIndex >= 0 ? process.argv[viewportIndex + 1] : null
const workflowOnly = process.argv.includes('--workflow')

function fail(message) {
  throw new Error(message)
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function validatePolicy(policy) {
  if (policy?.contract !== 'supermega.product-route-quality-policy.v1') fail('route_quality_policy_contract_invalid')
  if (!Number.isInteger(policy.settleMs) || policy.settleMs < 0 || policy.settleMs > 5000) fail('route_quality_policy_settle_invalid')
  if (!Array.isArray(policy.viewports) || policy.viewports.length !== 2) fail('route_quality_policy_viewports_invalid')
  if (!Array.isArray(policy.routes) || policy.routes.length < 10) fail('route_quality_policy_routes_invalid')
  const viewportIds = new Set(policy.viewports.map((viewport) => viewport.id))
  if (viewportIds.size !== policy.viewports.length || !viewportIds.has('mobile') || !viewportIds.has('desktop')) fail('route_quality_policy_viewport_ids_invalid')
  const routeIds = new Set()
  for (const route of policy.routes) {
    if (!route?.id || routeIds.has(route.id) || !['app', 'public'].includes(route.scope) || !route.path?.startsWith('/')) fail('route_quality_policy_route_invalid')
    if (!route.titleIncludes || !Array.isArray(route.requiredText) || !Number.isInteger(route.maxVisibleActions)) fail('route_quality_policy_route_requirements_invalid')
    if (route.expectedH1Count != null && (!Number.isInteger(route.expectedH1Count) || route.expectedH1Count < 1 || route.expectedH1Count > 3)) fail('route_quality_policy_heading_count_invalid')
    if (route.targetVisibleActions != null && (!Number.isInteger(route.targetVisibleActions) || route.targetVisibleActions > route.maxVisibleActions)) fail('route_quality_policy_action_target_invalid')
    if (!route.maxFirstViewportActions || [...viewportIds].some((id) => !Number.isInteger(route.maxFirstViewportActions[id]))) fail('route_quality_policy_action_budget_invalid')
    if (route.disclosures != null && (!Array.isArray(route.disclosures) || route.disclosures.some((check) => !check?.summaryIncludes || !check?.contentSelector))) fail('route_quality_policy_disclosure_checks_invalid')
    routeIds.add(route.id)
  }
}

function browserExecutable() {
  const configured = process.env.SUPERMEGA_QA_BROWSER_PATH
  const candidates = [
    configured,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter(Boolean)
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json'],
  ['.xml', 'application/xml; charset=utf-8'],
])

async function regularFile(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function startStaticServer(directory, { spaFallback }) {
  const absoluteRoot = resolve(directory)
  if (!existsSync(join(absoluteRoot, 'index.html'))) fail(`route_quality_artifact_missing:${absoluteRoot}`)
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
      const decoded = decodeURIComponent(requestUrl.pathname)
      const relative = decoded.replace(/^\/+/, '')
      const requested = resolve(absoluteRoot, relative)
      if (requested !== absoluteRoot && !requested.startsWith(`${absoluteRoot}${sep}`)) {
        response.writeHead(400).end('Bad request')
        return
      }
      const candidates = decoded.endsWith('/')
        ? [join(requested, 'index.html')]
        : [requested, join(requested, 'index.html')]
      let file = null
      for (const candidate of candidates) {
        if (await regularFile(candidate)) {
          file = candidate
          break
        }
      }
      if (!file && spaFallback) file = join(absoluteRoot, 'index.html')
      if (!file || !await regularFile(file)) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found')
        return
      }
      const body = await readFile(file)
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': body.length,
        'content-type': mimeTypes.get(extname(file).toLowerCase()) ?? 'application/octet-stream',
      })
      response.end(body)
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(error instanceof Error ? error.message : 'Server error')
    }
  })
  await new Promise((accept, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', accept)
  })
  const address = server.address()
  if (!address || typeof address === 'string') fail('route_quality_server_address_invalid')
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((accept, reject) => server.close((error) => error ? reject(error) : accept())),
  }
}

async function collectPageMetrics(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      if (element.closest('[hidden],[inert],[aria-hidden="true"]')) return false
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || '1') > 0.05
    }
    const accessibleName = (element) => {
      const labelledBy = element.getAttribute('aria-labelledby')
        ?.split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .filter(Boolean)
        .join(' ')
      const labels = 'labels' in element && element.labels
        ? [...element.labels].map((label) => label.textContent?.trim() ?? '').filter(Boolean).join(' ')
        : ''
      return [element.getAttribute('aria-label'), labelledBy, labels, element.getAttribute('alt'), element.textContent, element.getAttribute('placeholder'), element.getAttribute('title')]
        .map((value) => value?.trim() ?? '')
        .find(Boolean) ?? ''
    }
    const actionSelector = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="link"],[tabindex]:not([tabindex="-1"])'
    const actions = [...document.querySelectorAll(actionSelector)].filter(visible)
    const firstViewportActions = actions.filter((element) => {
      const rect = element.getBoundingClientRect()
      return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth
    })
    const touchRect = (element) => {
      if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)) {
        const label = [...(element.labels ?? [])].find(visible)
        if (label) return label.getBoundingClientRect()
      }
      return element.getBoundingClientRect()
    }
    const summarizeAction = (element) => {
      const rect = touchRect(element)
      return {
        name: accessibleName(element).slice(0, 120),
        tag: element.tagName.toLowerCase(),
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
      }
    }
    const ids = new Map()
    for (const element of document.querySelectorAll('[id]')) ids.set(element.id, (ids.get(element.id) ?? 0) + 1)
    const actionGroups = new Map()
    for (const action of actions) {
      const container = action.closest('dialog,form,details,section,nav,article')
      const labelledBy = container?.getAttribute('aria-labelledby')
      const label = container?.getAttribute('aria-label')
        || (labelledBy ? document.getElementById(labelledBy)?.textContent?.trim() : '')
        || container?.querySelector(':scope > summary')?.textContent?.trim()
        || container?.querySelector('h1,h2,h3')?.textContent?.trim()
        || (container?.className && typeof container.className === 'string' ? container.className.split(/\s+/).slice(0, 2).join('.') : '')
        || 'page shell'
      actionGroups.set(label, (actionGroups.get(label) ?? 0) + 1)
    }
    const mainElements = [...document.querySelectorAll('main,[role="main"]')].filter(visible)
    const h1Elements = [...document.querySelectorAll('h1')].filter(visible)
    return {
      bodyText: document.body?.innerText ?? '',
      duplicateIds: [...ids.entries()].filter(([, count]) => count > 1).map(([id, count]) => ({ id, count })),
      firstViewportActionCount: firstViewportActions.length,
      firstViewportActionNames: firstViewportActions.slice(0, 30).map((element) => accessibleName(element).slice(0, 120)),
      actionGroups: [...actionGroups.entries()].map(([name, count]) => ({ name: name.slice(0, 160), count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
      h1Count: h1Elements.length,
      h1Text: h1Elements.map((element) => element.textContent?.trim() ?? ''),
      horizontalOverflowPx: Math.max(0, Math.round((document.documentElement.scrollWidth - document.documentElement.clientWidth) * 10) / 10),
      mainCount: mainElements.length,
      placeholderLinks: actions
        .filter((element) => element instanceof HTMLAnchorElement && ['', '#'].includes(element.getAttribute('href')?.trim() ?? ''))
        .map(summarizeAction),
      unnamedActions: actions.filter((element) => !accessibleName(element)).map(summarizeAction),
      under44: actions.filter((element) => {
        const rect = touchRect(element)
        return rect.width < 44 || rect.height < 44
      }).map(summarizeAction),
      visibleActionNames: actions.map((element) => accessibleName(element).slice(0, 160)),
      visibleActionCount: actions.length,
    }
  })
}

function evaluateFindings(route, viewport, pageResult) {
  const failures = []
  const metrics = pageResult.metrics
  if (!pageResult.status || pageResult.status < 200 || pageResult.status >= 400) failures.push(`http_status:${pageResult.status ?? 'none'}`)
  if (!pageResult.title.toLowerCase().includes(route.titleIncludes.toLowerCase())) failures.push(`title_missing:${route.titleIncludes}`)
  for (const required of route.requiredText) {
    if (!metrics.bodyText.toLowerCase().includes(required.toLowerCase())) failures.push(`required_text_missing:${required}`)
  }
  if (metrics.mainCount !== 1) failures.push(`main_count:${metrics.mainCount}`)
  const expectedH1Count = route.expectedH1Count ?? 1
  if (metrics.h1Count !== expectedH1Count) failures.push(`h1_count:${metrics.h1Count}!=${expectedH1Count}`)
  if (metrics.horizontalOverflowPx > 1) failures.push(`horizontal_overflow:${metrics.horizontalOverflowPx}`)
  if (metrics.visibleActionCount > route.maxVisibleActions) failures.push(`visible_action_budget:${metrics.visibleActionCount}>${route.maxVisibleActions}`)
  const firstViewportBudget = route.maxFirstViewportActions[viewport.id]
  if (metrics.firstViewportActionCount > firstViewportBudget) failures.push(`first_viewport_action_budget:${metrics.firstViewportActionCount}>${firstViewportBudget}`)
  if (viewport.touch && metrics.under44.length) failures.push(`touch_targets_under_44:${metrics.under44.length}`)
  if (metrics.unnamedActions.length) failures.push(`unnamed_actions:${metrics.unnamedActions.length}`)
  if (metrics.duplicateIds.length) failures.push(`duplicate_ids:${metrics.duplicateIds.length}`)
  if (metrics.placeholderLinks.length) failures.push(`placeholder_links:${metrics.placeholderLinks.length}`)
  if (pageResult.consoleErrors.length) failures.push(`console_errors:${pageResult.consoleErrors.length}`)
  if (pageResult.pageErrors.length) failures.push(`page_errors:${pageResult.pageErrors.length}`)
  if (pageResult.externalRequests.length) failures.push(`external_requests:${pageResult.externalRequests.length}`)
  failures.push(...pageResult.disclosureFailures)
  return failures
}

async function verifyDisclosures(page, checks = []) {
  const failures = []
  for (const check of checks) {
    const summaries = page.locator('summary').filter({ hasText: check.summaryIncludes })
    const summaryCount = await summaries.count()
    if (summaryCount !== 1) {
      failures.push(`disclosure_summary_count:${check.summaryIncludes}:${summaryCount}`)
      continue
    }
    const summary = summaries.first()
    const content = summary.locator('..').locator(check.contentSelector)
    const contentCount = await content.count()
    if (contentCount !== 1) {
      failures.push(`disclosure_content_count:${check.summaryIncludes}:${contentCount}`)
      continue
    }
    if (await content.isVisible()) failures.push(`disclosure_initially_visible:${check.summaryIncludes}`)
    await summary.click()
    try {
      await content.waitFor({ state: 'visible', timeout: 2_000 })
    } catch {
      failures.push(`disclosure_did_not_open:${check.summaryIncludes}`)
    }
    await summary.click()
    try {
      await content.waitFor({ state: 'hidden', timeout: 2_000 })
    } catch {
      failures.push(`disclosure_did_not_close:${check.summaryIncludes}`)
    }
  }
  return failures
}

async function auditRoute(browser, baseUrl, route, viewport, settleMs) {
  const context = await browser.newContext({
    colorScheme: 'light',
    deviceScaleFactor: 1,
    hasTouch: viewport.touch,
    isMobile: viewport.touch,
    locale: 'en-US',
    reducedMotion: 'reduce',
    viewport: { width: viewport.width, height: viewport.height },
  })
  const page = await context.newPage()
  const consoleErrors = []
  const consoleWarnings = []
  const pageErrors = []
  const externalRequests = []
  const baseOrigin = new URL(baseUrl).origin
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 400))
    if (message.type() === 'warning') consoleWarnings.push(message.text().slice(0, 400))
  })
  page.on('pageerror', (error) => pageErrors.push(error.message.slice(0, 400)))
  await page.route('**/*', async (intercept) => {
    const url = intercept.request().url()
    const parsed = new URL(url)
    if (parsed.origin === baseOrigin || ['blob:', 'data:'].includes(parsed.protocol)) {
      await intercept.continue()
      return
    }
    externalRequests.push(`${intercept.request().method()} ${parsed.origin}${parsed.pathname}`.slice(0, 400))
    await intercept.abort('blockedbyclient')
  })
  let response = null
  try {
    response = await page.goto(`${baseUrl}${route.path}`, { timeout: 20_000, waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => {
      const visibleText = document.body?.innerText ?? ''
      return document.querySelector('h1') && !/Loading (Shop|Plant|Website|Ecommerce)…/.test(visibleText)
    }, null, { timeout: 8_000 }).catch(() => {})
    if (settleMs) await page.waitForTimeout(settleMs)
    const metrics = await collectPageMetrics(page)
    const disclosureFailures = await verifyDisclosures(page, route.disclosures)
    const pageResult = {
      consoleErrors,
      consoleWarnings,
      disclosureFailures,
      externalRequests,
      metrics,
      pageErrors,
      status: response?.status() ?? null,
      title: await page.title(),
    }
    const { bodyText: _bodyText, ...reportMetrics } = pageResult.metrics
    return {
      ...pageResult,
      metrics: reportMetrics,
      failures: evaluateFindings(route, viewport, pageResult),
      routeId: route.id,
      scope: route.scope,
      path: route.path,
      viewport: viewport.id,
    }
  } finally {
    await context.close()
  }
}

async function expectOne(locator, failure) {
  const count = await locator.count()
  if (count !== 1) fail(`${failure}:${count}`)
  return locator
}

async function expectOneVisible(locator, failure, timeout = 5_000) {
  try {
    await locator.waitFor({ state: 'visible', timeout })
  } catch {
    fail(`${failure}_not_visible`)
  }
  return expectOne(locator, failure)
}

async function waitForProduct(page, name) {
  await page.waitForFunction((expected) => document.querySelector('h1')?.textContent?.trim() === expected, name, { timeout: 8_000 })
}

async function auditEcommerceShopOrderWorkflow(browser, baseUrl) {
  const context = await browser.newContext({
    colorScheme: 'light',
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    locale: 'en-US',
    reducedMotion: 'reduce',
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  const checkpoints = []
  const consoleErrors = []
  const externalRequests = []
  const pageErrors = []
  const baseOrigin = new URL(baseUrl).origin
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 400))
  })
  page.on('pageerror', (error) => pageErrors.push(error.message.slice(0, 400)))
  await page.route('**/*', async (intercept) => {
    const url = intercept.request().url()
    const parsed = new URL(url)
    if (parsed.origin === baseOrigin || ['blob:', 'data:'].includes(parsed.protocol)) {
      await intercept.continue()
      return
    }
    externalRequests.push(`${intercept.request().method()} ${parsed.origin}${parsed.pathname}`.slice(0, 400))
    await intercept.abort('blockedbyclient')
  })
  const failures = []
  try {
    const response = await page.goto(`${baseUrl}/ecommerce/`, { timeout: 20_000, waitUntil: 'domcontentloaded' })
    if (!response || response.status() < 200 || response.status() >= 400) fail(`workflow_ecommerce_http_status:${response?.status() ?? 'none'}`)
    await waitForProduct(page, 'Ecommerce')

    await (await expectOne(page.getByRole('button', { name: 'Start sample order', exact: true }), 'workflow_start_sample_order_count')).click()
    await (await expectOne(page.getByLabel('Name', { exact: true }), 'workflow_customer_name_count')).fill('QA Customer')
    await (await expectOne(page.getByLabel('Phone', { exact: true }), 'workflow_customer_phone_count')).fill('09123456789')
    checkpoints.push('sample_cart_ready')

    const preSubmitShopActions = await page.getByRole('button', { name: 'Open Shop operator review', exact: true }).count()
    if (preSubmitShopActions !== 0) fail(`workflow_shop_review_visible_before_request:${preSubmitShopActions}`)
    checkpoints.push('no_shop_order_before_request')

    const sendRequest = await expectOneVisible(page.getByRole('button', { name: 'Send order request', exact: true }), 'workflow_send_request_count')
    if (!await sendRequest.isEnabled()) fail('workflow_send_request_disabled')
    await sendRequest.click()
    await expectOneVisible(page.getByRole('heading', { name: 'Order request sent for Shop review', exact: true }), 'workflow_request_receipt_heading_count')
    const requestReceipt = await expectOneVisible(page.locator('article').filter({ hasText: 'Request for QA Customer' }), 'workflow_request_receipt_count')
    const requestReceiptText = await requestReceipt.innerText()
    const requestReference = requestReceiptText.match(/Reference (ECR-[A-F0-9-]+)/)?.[1]
    if (!requestReference) fail('workflow_request_reference_missing')
    if (!requestReceiptText.includes('Payment Cash') && !requestReceiptText.includes('Pay on pickup')) fail('workflow_payment_boundary_missing')
    checkpoints.push('recoverable_request_receipt')

    await (await expectOne(page.getByRole('button', { name: 'Open Shop operator review', exact: true }), 'workflow_open_shop_review_count')).click()
    await page.waitForURL((url) => url.pathname === '/shop/', { timeout: 10_000 })
    await waitForProduct(page, 'Shop')
    await (await expectOne(page.getByRole('heading', { name: '2 orders need action', exact: true }), 'workflow_preconfirm_order_count')).waitFor({ state: 'visible', timeout: 5_000 })
    const addOrderDialog = await expectOneVisible(page.getByRole('dialog', { name: 'Add an order', exact: true }), 'workflow_add_order_dialog_count')
    const addOrderText = await addOrderDialog.innerText()
    if (!addOrderText.includes(requestReference) || !addOrderText.includes('no stock reserved')) fail('workflow_source_locked_handoff_missing')
    checkpoints.push('shop_handoff_without_write')

    await (await expectOne(addOrderDialog.getByRole('button', { name: 'Review order', exact: true }), 'workflow_review_order_count')).click()
    const reviewDialog = await expectOneVisible(page.getByRole('dialog', { name: 'Review Ecommerce order', exact: true }), 'workflow_review_dialog_count')
    const reviewText = await reviewDialog.innerText()
    if (!reviewText.includes(requestReference) || !reviewText.includes('Stock SM-1001 34 → 33') || !reviewText.includes('Owner confirming operator')) fail('workflow_accountable_review_evidence_missing')
    checkpoints.push('accountable_stock_review')

    await (await expectOne(reviewDialog.getByRole('button', { name: 'Confirm change', exact: true }), 'workflow_confirm_change_count')).click()
    await expectOneVisible(page.getByRole('heading', { name: '3 orders need action', exact: true }), 'workflow_postconfirm_order_count')
    await expectOneVisible(page.getByText('QA Customer · Daily essentials basket × 1', { exact: true }), 'workflow_confirmed_customer_count')
    await expectOneVisible(page.getByRole('button', { name: 'Start preparing', exact: true }), 'workflow_confirmed_next_action_count')
    checkpoints.push('shop_order_confirmed')

    await page.goto(`${baseUrl}/ecommerce/`, { timeout: 20_000, waitUntil: 'domcontentloaded' })
    await waitForProduct(page, 'Ecommerce')
    const tracking = await expectOneVisible(page.getByRole('region', { name: 'Customer order tracking', exact: true }), 'workflow_tracking_region_count')
    const trackingText = await tracking.innerText()
    if (!trackingText.includes(requestReference) || !trackingText.includes('Confirmed') || !trackingText.includes('Payment pending')) fail('workflow_customer_tracking_not_reconciled')
    await expectOne(page.getByRole('button', { name: 'Continue in Shop', exact: true }), 'workflow_continue_in_shop_count')
    checkpoints.push('customer_tracking_reconciled')
  } catch (error) {
    failures.push(`workflow_exception:${error instanceof Error ? error.message : String(error)}`.slice(0, 500))
  } finally {
    await context.close()
  }
  if (consoleErrors.length) failures.push(`console_errors:${consoleErrors.length}`)
  if (pageErrors.length) failures.push(`page_errors:${pageErrors.length}`)
  if (externalRequests.length) failures.push(`external_requests:${externalRequests.length}`)
  return {
    workflowId: 'ecommerce-request-shop-confirmation',
    viewport: 'mobile',
    ok: failures.length === 0,
    checkpoints,
    failures,
    consoleErrors,
    pageErrors,
    externalRequests,
  }
}

async function confirmShopWorkflowAction(page, trigger, stage, expectedText) {
  await trigger.click()
  const dialog = await expectOneVisible(page.locator('dialog.accountable-action-gate'), `workflow_shop_${stage}_dialog_count`)
  const dialogText = await dialog.innerText()
  if (expectedText.some((value) => !dialogText.includes(value))) fail(`workflow_shop_${stage}_review_evidence_missing`)
  await (await expectOne(dialog.getByLabel('Your name', { exact: true }), `workflow_shop_${stage}_actor_count`)).fill('QA Shop operator')
  await (await expectOne(dialog.getByLabel('Reason', { exact: true }), `workflow_shop_${stage}_reason_count`)).fill(`QA ${stage.replaceAll('_', ' ')} review`)
  await (await expectOne(dialog.getByLabel('Reference', { exact: true }), `workflow_shop_${stage}_reference_count`)).fill(`QA-SHOP-${stage.toUpperCase()}`)
  await (await expectOne(dialog.getByRole('button', { name: 'Confirm change', exact: true }), `workflow_shop_${stage}_confirm_count`)).click()
  await dialog.waitFor({ state: 'hidden', timeout: 8_000 })
}

async function auditShopSaleCloseWorkflow(browser, baseUrl, viewport) {
  const context = await browser.newContext({
    colorScheme: 'light',
    deviceScaleFactor: 1,
    hasTouch: viewport.touch,
    isMobile: viewport.touch,
    locale: 'en-US',
    reducedMotion: 'reduce',
    viewport: { width: viewport.width, height: viewport.height },
  })
  const page = await context.newPage()
  const checkpoints = []
  const consoleErrors = []
  const externalRequests = []
  const pageErrors = []
  const baseOrigin = new URL(baseUrl).origin
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 400))
  })
  page.on('pageerror', (error) => pageErrors.push(error.message.slice(0, 400)))
  await page.route('**/*', async (intercept) => {
    const url = intercept.request().url()
    const parsed = new URL(url)
    if (parsed.origin === baseOrigin || ['blob:', 'data:'].includes(parsed.protocol)) {
      await intercept.continue()
      return
    }
    externalRequests.push(`${intercept.request().method()} ${parsed.origin}${parsed.pathname}`.slice(0, 400))
    await intercept.abort('blockedbyclient')
  })
  const failures = []
  const customer = `QA Counter ${viewport.id}`
  try {
    const response = await page.goto(`${baseUrl}/shop/?tab=counter`, { timeout: 20_000, waitUntil: 'domcontentloaded' })
    if (!response || response.status() < 200 || response.status() >= 400) fail(`workflow_shop_http_status:${response?.status() ?? 'none'}`)
    await waitForProduct(page, 'Shop')

    const product = await expectOneVisible(page.getByRole('button', { name: 'Add Daily essentials basket to this sale', exact: true }), 'workflow_shop_product_count')
    if (!(await product.innerText()).includes('34 in stock')) fail('workflow_shop_opening_stock_missing')
    await product.click()
    if (viewport.touch) await (await expectOneVisible(page.locator('button.shop-mobile-cart'), 'workflow_shop_mobile_cart_count')).click()
    const currentSale = await expectOneVisible(page.locator('aside[aria-label="Current sale"]'), 'workflow_shop_current_sale_count')
    await (await expectOne(currentSale.getByPlaceholder('Guest', { exact: true }), 'workflow_shop_customer_count')).fill(customer)
    const cash = await expectOne(currentSale.getByRole('button', { name: 'Cash', exact: true }), 'workflow_shop_cash_count')
    if (await cash.getAttribute('aria-pressed') !== 'true') await cash.click()
    checkpoints.push('counter_sale_ready')

    await (await expectOne(currentSale.getByRole('button', { name: 'Review order', exact: true }), 'workflow_shop_review_sale_count')).click()
    const counterReview = await expectOneVisible(page.locator('dialog.accountable-action-gate'), 'workflow_shop_counter_review_dialog_count')
    const counterReviewText = await counterReview.innerText()
    if (!counterReviewText.includes('18,500 MMK')
      || !/stock SM-1001 34\s*[^0-9]+\s*33/i.test(counterReviewText)
      || !counterReviewText.includes('Payment and fulfilment stay pending')) fail('workflow_shop_counter_review_evidence_missing')
    checkpoints.push('accountable_counter_review')
    await (await expectOne(counterReview.getByRole('button', { name: 'Create order', exact: true }), 'workflow_shop_create_order_count')).click()
    await counterReview.waitFor({ state: 'hidden', timeout: 8_000 })
    await (await expectOne(page.getByRole('button', { name: 'Stock', exact: true }), 'workflow_shop_stock_tab_count')).click()
    await page.waitForURL((url) => url.pathname === '/shop/' && url.searchParams.get('tab') === 'inventory', { timeout: 8_000 })
    await (await expectOneVisible(page.locator('details.stock-catalog-disclosure > summary'), 'workflow_shop_other_products_count')).click()
    const stockRow = await expectOneVisible(page.locator('.data-row').filter({ hasText: 'Daily essentials basket' }), 'workflow_shop_updated_stock_count')
    const onHand = await expectOne(stockRow.locator('[role="cell"]').first(), 'workflow_shop_on_hand_cell_count')
    if ((await onHand.textContent())?.trim() !== '33') fail(`workflow_shop_stock_reservation_missing:${(await onHand.textContent())?.trim() ?? 'none'}`)
    checkpoints.push('stock_reservation_persisted')

    await (await expectOne(page.getByRole('button', { name: 'Orders', exact: true }), 'workflow_shop_orders_tab_count')).click()
    await page.waitForURL((url) => url.pathname === '/shop/' && url.searchParams.get('tab') === 'orders', { timeout: 8_000 })
    const order = await expectOneVisible(page.locator('.order-list article').filter({ hasText: customer }), 'workflow_shop_confirmed_order_count')
    const confirmedOrderText = await order.innerText()
    if (!confirmedOrderText.toLowerCase().includes('payment pending')) fail(`workflow_shop_confirmed_payment_state_missing:${confirmedOrderText.replace(/\s+/g, ' ').slice(0, 300)}`)
    checkpoints.push('confirmed_order_visible')

    await confirmShopWorkflowAction(page, await expectOne(order.getByRole('button', { name: 'Start preparing', exact: true }), 'workflow_shop_start_preparing_count'), 'start_preparing', ['confirmed', 'preparing'])
    await expectOneVisible(order.getByText('preparing', { exact: true }), 'workflow_shop_preparing_state_count')
    checkpoints.push('preparing_recorded')

    await confirmShopWorkflowAction(page, await expectOne(order.getByRole('button', { name: 'Mark ready', exact: true }), 'workflow_shop_mark_ready_count'), 'mark_ready', ['preparing', 'ready'])
    await expectOneVisible(order.getByText('ready', { exact: true }), 'workflow_shop_ready_state_count')
    await expectOneVisible(order.getByRole('button', { name: 'Reconcile payment', exact: true }), 'workflow_shop_payment_gate_count')
    checkpoints.push('payment_gate_before_completion')

    await confirmShopWorkflowAction(page, await expectOne(order.getByRole('button', { name: 'Reconcile payment', exact: true }), 'workflow_shop_reconcile_payment_count'), 'reconcile_payment', ['pending', 'reconciled'])
    await expectOneVisible(order.getByText('payment reconciled', { exact: true }), 'workflow_shop_payment_reconciled_state_count')
    checkpoints.push('payment_reconciled')

    await confirmShopWorkflowAction(page, await expectOne(order.getByRole('button', { name: 'Complete', exact: true }), 'workflow_shop_complete_count'), 'complete_fulfilment', ['ready', 'completed'])
    await order.waitFor({ state: 'hidden', timeout: 8_000 })
    const archive = await expectOneVisible(page.locator('details.order-archive'), 'workflow_shop_archive_count')
    await (await expectOne(archive.locator(':scope > summary'), 'workflow_shop_archive_summary_count')).click()
    const archivedOrder = await expectOneVisible(archive.locator('article').filter({ hasText: customer }), 'workflow_shop_archived_order_count')
    if (!(await archivedOrder.innerText()).includes('completed') || !(await archivedOrder.innerText()).includes('payment reconciled')) fail('workflow_shop_completed_record_missing')
    checkpoints.push('fulfilment_completed')

    const closeControls = await expectOneVisible(page.locator('#shop-close-controls'), 'workflow_shop_close_controls_count')
    await (await expectOne(closeControls.locator(':scope > summary'), 'workflow_shop_close_summary_count')).click()
    const settlement = await expectOneVisible(closeControls.locator('details[data-close-settlement="matched"]'), 'workflow_shop_settlement_count')
    const cashCount = await expectOneVisible(settlement.getByLabel('Cash counted', { exact: true }), 'workflow_shop_cash_counted_count')
    if (await cashCount.inputValue() !== '41000') fail(`workflow_shop_cash_count_drift:${await cashCount.inputValue()}`)
    checkpoints.push('matched_settlement_ready')

    const closeButton = await expectOneVisible(closeControls.getByRole('button', { name: 'Review and save close', exact: true }), 'workflow_shop_review_close_count')
    await confirmShopWorkflowAction(page, closeButton, 'daily_close', ['2 orders', '41,000 MMK', 'settlement matched'])
    await expectOneVisible(closeControls.getByRole('button', { name: 'Today is closed', exact: true }), 'workflow_shop_closed_button_count')
    const lastClose = await expectOneVisible(closeControls.locator('summary').filter({ hasText: 'Last close' }), 'workflow_shop_last_close_count')
    const lastCloseText = await lastClose.innerText()
    if (!lastCloseText.includes('2 orders') || !lastCloseText.includes('41,000 MMK')) fail('workflow_shop_saved_close_evidence_missing')
    await lastClose.click()
    await expectOneVisible(closeControls.getByRole('link', { name: 'Download close CSV', exact: true }), 'workflow_shop_close_export_count')
    checkpoints.push('daily_close_saved')
  } catch (error) {
    failures.push(`workflow_exception:${error instanceof Error ? error.message : String(error)}`.slice(0, 500))
  } finally {
    await context.close()
  }
  if (consoleErrors.length) failures.push(`console_errors:${consoleErrors.length}`)
  if (pageErrors.length) failures.push(`page_errors:${pageErrors.length}`)
  if (externalRequests.length) failures.push(`external_requests:${externalRequests.length}`)
  return {
    workflowId: 'shop-counter-sale-daily-close',
    viewport: viewport.id,
    ok: failures.length === 0,
    checkpoints,
    failures,
    consoleErrors,
    pageErrors,
    externalRequests,
  }
}

const policySource = await readFile(policyPath, 'utf8')
const policy = JSON.parse(policySource)
validatePolicy(policy)
if (outputIndex >= 0 && !process.argv[outputIndex + 1]) fail('route_quality_output_path_missing')
if (workflowOnly && (routeFilter || viewportFilter)) fail('route_quality_workflow_filter_conflict')
if (routeIndex >= 0 && (!routeFilter || !policy.routes.some((route) => route.id === routeFilter))) fail('route_quality_route_filter_invalid')
if (viewportIndex >= 0 && (!viewportFilter || !policy.viewports.some((viewport) => viewport.id === viewportFilter))) fail('route_quality_viewport_filter_invalid')
const selectedRoutes = workflowOnly ? [] : policy.routes.filter((route) => !routeFilter || route.id === routeFilter)
const selectedViewports = workflowOnly ? [] : policy.viewports.filter((viewport) => !viewportFilter || viewport.id === viewportFilter)
const executablePath = browserExecutable()
if (!executablePath) fail('route_quality_system_browser_missing:set SUPERMEGA_QA_BROWSER_PATH to Chrome, Edge, or Chromium')
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--disable-background-networking', '--disable-component-update', '--disable-default-apps'],
})
const results = []
const workflowResults = []
try {
  for (const scope of workflowOnly ? ['app'] : ['public', 'app']) {
    const server = await startStaticServer(scope === 'app' ? appRoot : publicRoot, { spaFallback: scope === 'app' })
    try {
      for (const viewport of selectedViewports) {
        for (const route of selectedRoutes.filter((candidate) => candidate.scope === scope)) {
          results.push(await auditRoute(browser, server.baseUrl, route, viewport, policy.settleMs))
        }
      }
      if (scope === 'app' && !routeFilter && !viewportFilter) {
        workflowResults.push(await auditEcommerceShopOrderWorkflow(browser, server.baseUrl))
        for (const viewport of policy.viewports) workflowResults.push(await auditShopSaleCloseWorkflow(browser, server.baseUrl, viewport))
      }
    } finally {
      await server.close()
    }
  }
} finally {
  await browser.close()
}

const failures = [
  ...results.flatMap((result) => result.failures.map((failure) => `${result.routeId}/${result.viewport}:${failure}`)),
  ...workflowResults.flatMap((result) => result.failures.map((failure) => `${result.workflowId}/${result.viewport}:${failure}`)),
]
const targetGaps = results.flatMap((result) => {
  const route = policy.routes.find((candidate) => candidate.id === result.routeId)
  return route?.targetVisibleActions != null && result.metrics.visibleActionCount > route.targetVisibleActions
    ? [`${result.routeId}/${result.viewport}:visible_actions:${result.metrics.visibleActionCount}>${route.targetVisibleActions}`]
    : []
})
const reportBasis = {
  contract: 'supermega.product-route-quality.v1',
  policyDigest: sha256(policySource),
  browser: basename(executablePath),
  routes: selectedRoutes.length,
  viewports: selectedViewports.length,
  checks: results.length,
  workflowChecks: workflowResults.length,
  ok: failures.length === 0,
  simplicityTargetsMet: targetGaps.length === 0,
  failures,
  targetGaps,
  results,
  workflows: workflowResults,
}
const report = { ...reportBasis, reportDigest: sha256(JSON.stringify(reportBasis)) }
const serialized = `${JSON.stringify(report, null, 2)}\n`
if (outputPath) await writeFile(outputPath, serialized, { encoding: 'utf8', flag: 'wx' })
const summary = {
  contract: report.contract,
  ok: report.ok,
  policyDigest: report.policyDigest,
  reportDigest: report.reportDigest,
  browser: report.browser,
  routes: report.routes,
  viewports: report.viewports,
  checks: report.checks,
  workflowChecks: report.workflowChecks,
  failures: report.failures,
  simplicityTargetsMet: report.simplicityTargetsMet,
  targetGaps: report.targetGaps,
  workflows: report.workflows.map((workflow) => ({
    workflowId: workflow.workflowId,
    viewport: workflow.viewport,
    ok: workflow.ok,
    checkpoints: workflow.checkpoints,
    failures: workflow.failures,
    consoleErrors: workflow.consoleErrors.length,
    pageErrors: workflow.pageErrors.length,
    externalRequests: workflow.externalRequests.length,
  })),
  results: report.results.map((result) => ({
    routeId: result.routeId,
    viewport: result.viewport,
    failures: result.failures,
    visibleActions: result.metrics.visibleActionCount,
    firstViewportActions: result.metrics.firstViewportActionCount,
    touchTargetsUnder44: result.metrics.under44.length,
    unnamedActions: result.metrics.unnamedActions.length,
    horizontalOverflowPx: result.metrics.horizontalOverflowPx,
    consoleErrors: result.consoleErrors.length,
    pageErrors: result.pageErrors.length,
    externalRequests: result.externalRequests.length,
    disclosureFailures: result.disclosureFailures.length,
  })),
}
process.stdout.write(`${JSON.stringify(process.argv.includes('--details') ? report : summary, null, 2)}\n`)
if (!report.ok || (process.argv.includes('--require-targets') && !report.simplicityTargetsMet)) process.exitCode = 1
