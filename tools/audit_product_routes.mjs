import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import AxeBuilder from '@axe-core/playwright'
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
const accessibilityTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']

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

async function collectAccessibility(page, tags) {
  const result = await new AxeBuilder({ page }).withTags(tags).analyze()
  return {
    engine: '@axe-core/playwright',
    engineVersion: result.testEngine?.version ?? null,
    incompleteCount: result.incomplete.reduce((total, finding) => total + finding.nodes.length, 0),
    passes: result.passes.length,
    tags,
    violationCount: result.violations.reduce((total, finding) => total + finding.nodes.length, 0),
    violations: result.violations
      .map((finding) => ({
        help: finding.help,
        helpUrl: finding.helpUrl,
        id: finding.id,
        impact: finding.impact ?? 'unknown',
        nodes: finding.nodes.map((node) => ({
          failureSummary: String(node.failureSummary ?? '').replace(/\s+/g, ' ').trim().slice(0, 500),
          targets: node.target
            .map((target) => Array.isArray(target) ? target.join(' > ') : String(target))
            .map((target) => target.slice(0, 240))
            .sort(),
        })),
        targets: finding.nodes
          .flatMap((node) => node.target.map((target) => Array.isArray(target) ? target.join(' > ') : String(target)))
          .map((target) => target.slice(0, 240))
          .sort(),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  }
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
  if (pageResult.accessibility.violationCount) {
    const ruleIds = pageResult.accessibility.violations.map((finding) => finding.id).join(',')
    failures.push(`accessibility_violations:${pageResult.accessibility.violationCount}:${ruleIds}`)
  }
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
    const accessibility = await collectAccessibility(page, accessibilityTags)
    const pageResult = {
      accessibility,
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

const onboardingJourneys = [
  {
    id: 'shop',
    behaviorProduct: 'commerce',
    heading: 'Make Shop yours',
    businessName: 'QA Shop',
    submitLabel: 'Create Shop and start selling',
    destination: '/shop/?tab=counter',
    outcome: 'Complete a sample sale',
    firstActionLabel: 'Add Daily essentials basket to this sale',
  },
  {
    id: 'plant',
    behaviorProduct: 'production',
    heading: 'Make Plant yours',
    businessName: 'QA Plant',
    submitLabel: 'Create Plant and open the job',
    destination: '/plant/?tab=production',
    outcome: 'Run a sample production job',
    firstActionLabel: 'Record output',
  },
  {
    id: 'website',
    behaviorProduct: 'website',
    heading: 'Make Website yours',
    businessName: 'QA Website',
    submitLabel: 'Create Website and preview it',
    destination: '/website/',
    outcome: 'Preview a business website',
    firstActionLabel: 'Download preview',
  },
  {
    id: 'ecommerce',
    behaviorProduct: 'ecommerce',
    heading: 'Make Ecommerce yours',
    businessName: 'QA Ecommerce',
    submitLabel: 'Create Ecommerce and open the store',
    destination: '/ecommerce/',
    outcome: 'Open a working online store',
    firstActionLabel: 'Start sample order',
  },
]

async function auditFourProductOnboardingFirstTaskWorkflow(browser, baseUrl, viewport) {
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
  try {
    for (const journey of onboardingJourneys) {
      const setupPath = `/settings/?product=${journey.id}`
      const response = await page.goto(`${baseUrl}${setupPath}`, { timeout: 20_000, waitUntil: 'domcontentloaded' })
      if (!response || response.status() < 200 || response.status() >= 400) fail(`workflow_${journey.id}_onboarding_http_status:${response?.status() ?? 'none'}`)
      await expectOneVisible(page.getByRole('heading', { name: journey.heading, exact: true }), `workflow_${journey.id}_onboarding_heading_count`, 8_000)

      const businessName = await expectOneVisible(page.getByLabel('Business name', { exact: true }), `workflow_${journey.id}_business_name_count`)
      await businessName.fill('')
      const submit = await expectOneVisible(page.getByRole('button', { name: journey.submitLabel, exact: true }), `workflow_${journey.id}_submit_count`)
      if (await submit.isEnabled()) fail(`workflow_${journey.id}_empty_setup_enabled`)
      await businessName.fill(journey.businessName)
      if (!await submit.isEnabled()) fail(`workflow_${journey.id}_named_setup_disabled`)
      await submit.click()
      await page.waitForURL((url) => `${url.pathname}${url.search}` === journey.destination, { timeout: 15_000 })
      const firstAction = journey.id === 'plant'
        ? page.locator('.plant-today-priority').getByRole('button', { name: journey.firstActionLabel, exact: true })
        : journey.id === 'website'
          ? page.locator('.website-today-priority').getByRole('button', { name: journey.firstActionLabel, exact: true })
          : page.getByRole('button', { name: journey.firstActionLabel, exact: true })
      await expectOneVisible(firstAction, `workflow_${journey.id}_first_action_count`, 10_000)

      const trail = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? '[]'), 'supermega.behavior-trail.v1')
      const setupIndex = trail.findLastIndex((entry) => entry.event === 'setup_opened'
        && entry.product === journey.behaviorProduct
        && entry.route === setupPath)
      const chosenIndex = trail.findIndex((entry, index) => index > setupIndex
        && entry.event === 'agent_job_chosen'
        && entry.product === journey.behaviorProduct
        && entry.route === journey.destination
        && entry.detail === journey.outcome)
      const openedIndex = trail.findIndex((entry, index) => index > chosenIndex
        && entry.event === 'product_opened'
        && entry.product === journey.behaviorProduct
        && entry.route === journey.destination)
      if (setupIndex < 0 || chosenIndex <= setupIndex || openedIndex <= chosenIndex) fail(`workflow_${journey.id}_behavior_order_invalid:${setupIndex}:${chosenIndex}:${openedIndex}`)
      const orderedEntries = [trail[setupIndex], trail[chosenIndex], trail[openedIndex]]
      if (orderedEntries.some((entry) => !Number.isFinite(Date.parse(entry?.createdAt)))) fail(`workflow_${journey.id}_behavior_timestamp_invalid`)
      if (orderedEntries.some((entry, index) => index > 0 && Date.parse(entry.createdAt) < Date.parse(orderedEntries[index - 1].createdAt))) fail(`workflow_${journey.id}_behavior_timestamp_order_invalid`)
      checkpoints.push(`${journey.id}_onboarding_first_task_ready`)
    }
  } catch (error) {
    failures.push(`workflow_exception:${error instanceof Error ? error.message : String(error)}`.slice(0, 500))
  } finally {
    await context.close()
  }
  if (consoleErrors.length) failures.push(`console_errors:${consoleErrors.length}`)
  if (pageErrors.length) failures.push(`page_errors:${pageErrors.length}`)
  if (externalRequests.length) failures.push(`external_requests:${externalRequests.length}`)
  return {
    workflowId: 'four-product-onboarding-first-task',
    viewport: viewport.id,
    ok: failures.length === 0,
    checkpoints,
    failures,
    consoleErrors,
    pageErrors,
    externalRequests,
  }
}

async function auditEcommerceShopOrderWorkflow(browser, baseUrl, viewport) {
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
  const customer = 'QA Customer'
  try {
    const response = await page.goto(`${baseUrl}/ecommerce/`, { timeout: 20_000, waitUntil: 'domcontentloaded' })
    if (!response || response.status() < 200 || response.status() >= 400) fail(`workflow_ecommerce_http_status:${response?.status() ?? 'none'}`)
    await waitForProduct(page, 'Ecommerce')

    await (await expectOne(page.getByRole('button', { name: 'Start sample order', exact: true }), 'workflow_start_sample_order_count')).click()
    await (await expectOne(page.getByLabel('Name', { exact: true }), 'workflow_customer_name_count')).fill(customer)
    await (await expectOne(page.getByLabel('Phone', { exact: true }), 'workflow_customer_phone_count')).fill('09123456789')
    checkpoints.push('sample_cart_ready')

    const preSubmitShopActions = await page.getByRole('button', { name: 'Open Shop operator review', exact: true }).count()
    if (preSubmitShopActions !== 0) fail(`workflow_shop_review_visible_before_request:${preSubmitShopActions}`)
    checkpoints.push('no_shop_order_before_request')

    const sendRequest = await expectOneVisible(page.getByRole('button', { name: 'Send order request', exact: true }), 'workflow_send_request_count')
    if (!await sendRequest.isEnabled()) fail('workflow_send_request_disabled')
    await sendRequest.click()
    await expectOneVisible(page.getByRole('heading', { name: 'Order request sent for Shop review', exact: true }), 'workflow_request_receipt_heading_count')
    const requestReceipt = await expectOneVisible(page.locator('article').filter({ hasText: `Request for ${customer}` }), 'workflow_request_receipt_count')
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
    try {
      await expectOneVisible(page.getByRole('heading', { name: '3 orders need action', exact: true }), 'workflow_postconfirm_order_count')
    } catch (error) {
      const notices = await page.locator('.form-notice, .form-error, [role="alert"]').allInnerTexts()
      fail(`${error instanceof Error ? error.message : String(error)}:${notices.join(' | ').replace(/\s+/g, ' ').slice(0, 500)}`)
    }
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
    viewport: viewport.id,
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

async function readShopSyncDatabase(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('supermega-sync-v1', 1)
    request.onerror = () => reject(request.error ?? new Error('sync_database_open_failed'))
    request.onblocked = () => reject(new Error('sync_database_open_blocked'))
    request.onsuccess = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('commerce-outbox') || !database.objectStoreNames.contains('commerce-receipts')) {
        database.close()
        reject(new Error('sync_database_stores_missing'))
        return
      }
      const transaction = database.transaction(['commerce-outbox', 'commerce-receipts'], 'readonly')
      const outboxRequest = transaction.objectStore('commerce-outbox').getAll()
      const receiptRequest = transaction.objectStore('commerce-receipts').getAll()
      transaction.onerror = () => reject(transaction.error ?? new Error('sync_database_read_failed'))
      transaction.onabort = () => reject(transaction.error ?? new Error('sync_database_read_aborted'))
      transaction.oncomplete = () => {
        database.close()
        resolve({ outbox: outboxRequest.result, receipts: receiptRequest.result })
      }
    }
  }))
}

async function auditShopSyncRecoveryWorkflow(browser, baseUrl, viewport) {
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
  const customer = `QA Sync Recovery ${viewport.id}`
  try {
    const response = await page.goto(`${baseUrl}/shop/?tab=counter`, { timeout: 20_000, waitUntil: 'domcontentloaded' })
    if (!response || response.status() < 200 || response.status() >= 400) fail(`workflow_shop_sync_http_status:${response?.status() ?? 'none'}`)
    await waitForProduct(page, 'Shop')
    await page.waitForFunction(() => document.querySelector('.commerce-mode-banner')?.getAttribute('data-sync') === 'ready', undefined, { timeout: 8_000 })
    const initialSync = await readShopSyncDatabase(page)
    if (initialSync.outbox.length !== 0 || initialSync.receipts.length !== 0) fail('workflow_shop_sync_initial_database_not_empty')
    checkpoints.push('sync_ready_before_write')

    await page.evaluate(() => {
      const originalDelete = IDBObjectStore.prototype.delete
      Object.defineProperty(globalThis, '__supermegaSyncOriginalDelete', { configurable: true, value: originalDelete })
      IDBObjectStore.prototype.delete = function interruptedDelete(key) {
        if (this.name === 'commerce-outbox') throw new DOMException('QA interrupted the outbox acknowledgement.', 'AbortError')
        return originalDelete.call(this, key)
      }
    })

    const product = await expectOneVisible(page.getByRole('button', { name: 'Add Daily essentials basket to this sale', exact: true }), 'workflow_shop_sync_product_count')
    await product.click()
    if (viewport.touch) await (await expectOneVisible(page.locator('button.shop-mobile-cart'), 'workflow_shop_sync_mobile_cart_count')).click()
    const currentSale = await expectOneVisible(page.locator('aside[aria-label="Current sale"]'), 'workflow_shop_sync_current_sale_count')
    await (await expectOne(currentSale.getByPlaceholder('Guest', { exact: true }), 'workflow_shop_sync_customer_count')).fill(customer)
    await (await expectOne(currentSale.getByRole('button', { name: 'Review order', exact: true }), 'workflow_shop_sync_review_count')).click()
    const review = await expectOneVisible(page.locator('dialog.accountable-action-gate'), 'workflow_shop_sync_review_dialog_count')
    await (await expectOne(review.getByRole('button', { name: 'Create order', exact: true }), 'workflow_shop_sync_create_count')).click()
    await review.waitFor({ state: 'hidden', timeout: 8_000 })
    checkpoints.push('approved_order_applied_locally')

    await page.waitForFunction(() => document.querySelector('.commerce-mode-banner')?.getAttribute('data-sync') === 'pending', undefined, { timeout: 8_000 })
    const pendingBanner = await expectOneVisible(page.locator('.commerce-mode-banner[data-sync="pending"]'), 'workflow_shop_sync_pending_banner_count')
    if (!(await pendingBanner.innerText()).includes('recovery receipt was interrupted')) fail('workflow_shop_sync_pending_message_missing')
    const interruptedSync = await readShopSyncDatabase(page)
    if (interruptedSync.outbox.length !== 1 || interruptedSync.receipts.length !== 0) fail(`workflow_shop_sync_interrupted_counts:${interruptedSync.outbox.length}:${interruptedSync.receipts.length}`)
    const pendingIntent = interruptedSync.outbox[0]
    if (pendingIntent?.contract !== 'supermega.commerce.sync-outbox.v1'
      || pendingIntent?.eventType !== 'commerce.order.created'
      || pendingIntent?.evidence?.actor !== 'Sample cashier'
      || !String(pendingIntent?.baseDigest ?? '').startsWith('sha256:')
      || !String(pendingIntent?.candidateDigest ?? '').startsWith('sha256:')) fail('workflow_shop_sync_pending_intent_invalid')
    checkpoints.push('ack_interruption_left_durable_intent')

    await page.evaluate(() => {
      const originalDelete = globalThis.__supermegaSyncOriginalDelete
      if (typeof originalDelete === 'function') IDBObjectStore.prototype.delete = originalDelete
      delete globalThis.__supermegaSyncOriginalDelete
    })
    const reloadShop = await expectOneVisible(page.getByRole('button', { name: 'Reload Shop', exact: true }), 'workflow_shop_sync_reload_action_count')
    await reloadShop.click({ timeout: 20_000 })
    await waitForProduct(page, 'Shop')
    await page.waitForFunction(() => document.querySelector('.commerce-mode-banner')?.getAttribute('data-sync') === 'ready', undefined, { timeout: 8_000 })
    const recoveredBanner = await expectOneVisible(page.locator('.commerce-mode-banner[data-sync="ready"]'), 'workflow_shop_sync_recovered_banner_count')
    if (!(await recoveredBanner.innerText()).includes('Recovered 1 reviewed Shop change') || !(await recoveredBanner.innerText()).includes('without duplicating it')) fail('workflow_shop_sync_recovered_message_missing')
    checkpoints.push('reload_reconciled_applied_intent')

    const recoveredSync = await readShopSyncDatabase(page)
    if (recoveredSync.outbox.length !== 0 || recoveredSync.receipts.length !== 1) fail(`workflow_shop_sync_recovered_counts:${recoveredSync.outbox.length}:${recoveredSync.receipts.length}`)
    const receipt = recoveredSync.receipts[0]
    if (receipt?.contract !== 'supermega.commerce.sync-outbox.v1'
      || receipt?.status !== 'local_applied'
      || receipt?.recovered !== true
      || receipt?.candidateDigest !== pendingIntent.candidateDigest) fail('workflow_shop_sync_receipt_invalid')
    checkpoints.push('outbox_drained_to_receipt')

    await (await expectOne(page.getByRole('button', { name: 'Orders', exact: true }), 'workflow_shop_sync_orders_tab_count')).click()
    await page.waitForURL((url) => url.pathname === '/shop/' && url.searchParams.get('tab') === 'orders', { timeout: 8_000 })
    const recoveredOrders = page.locator('.order-list article').filter({ hasText: customer })
    if (await recoveredOrders.count() !== 1) fail(`workflow_shop_sync_order_count:${await recoveredOrders.count()}`)
    const recoveredOrderText = await recoveredOrders.first().innerText()
    if (!recoveredOrderText.toLowerCase().includes('confirmed') || !recoveredOrderText.toLowerCase().includes('payment pending')) {
      fail(`workflow_shop_sync_order_state_invalid:${recoveredOrderText.replaceAll(/\s+/g, ' ').slice(0, 240)}`)
    }
    checkpoints.push('order_not_duplicated')
  } catch (error) {
    failures.push(`workflow_exception:${error instanceof Error ? error.message : String(error)}`.slice(0, 500))
  } finally {
    await context.close()
  }
  if (consoleErrors.length) failures.push(`console_errors:${consoleErrors.length}`)
  if (pageErrors.length) failures.push(`page_errors:${pageErrors.length}`)
  if (externalRequests.length) failures.push(`external_requests:${externalRequests.length}`)
  return {
    workflowId: 'shop-indexeddb-outbox-reload-recovery',
    viewport: viewport.id,
    ok: failures.length === 0,
    checkpoints,
    failures,
    consoleErrors,
    pageErrors,
    externalRequests,
  }
}

async function confirmPlantWorkflowAction(page, trigger, stage, expectedText) {
  await trigger.click()
  const dialog = await expectOneVisible(page.locator('dialog.accountable-action-gate'), `workflow_plant_${stage}_dialog_count`)
  const dialogText = await dialog.innerText()
  if (expectedText.some((value) => !dialogText.toLowerCase().includes(value.toLowerCase()))) fail(`workflow_plant_${stage}_review_evidence_missing`)
  const fields = [
    ['Your name', 'QA Plant operator'],
    ['Reason', `QA ${stage.replaceAll('_', ' ')} review`],
    ['Reference', `QA-PLANT-${stage.toUpperCase()}`],
  ]
  for (const [label, value] of fields) {
    const field = await expectOne(dialog.getByLabel(label, { exact: true }), `workflow_plant_${stage}_${label.toLowerCase().replaceAll(' ', '_')}_count`)
    if (await field.isEditable()) await field.fill(value)
    else if (!(await field.inputValue()).trim()) fail(`workflow_plant_${stage}_${label.toLowerCase().replaceAll(' ', '_')}_empty`)
  }
  await (await expectOne(dialog.getByRole('button', { name: 'Confirm change', exact: true }), `workflow_plant_${stage}_confirm_count`)).click()
  await dialog.waitFor({ state: 'hidden', timeout: 8_000 })
}

async function auditPlantPlanShiftCloseWorkflow(browser, baseUrl, viewport) {
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
  const shiftReference = `QA-SHIFT-${viewport.id.toUpperCase()}`
  const jobId = 'JOB-AI-101'
  try {
    const response = await page.goto(`${baseUrl}/plant/?tab=production`, { timeout: 20_000, waitUntil: 'domcontentloaded' })
    if (!response || response.status() < 200 || response.status() >= 400) fail(`workflow_plant_http_status:${response?.status() ?? 'none'}`)
    await waitForProduct(page, 'Plant')

    const addJob = await expectOneVisible(page.locator('details.catalog-disclosure').filter({ has: page.locator('summary').filter({ hasText: 'Add job' }) }), 'workflow_plant_add_job_count')
    if (!await addJob.evaluate((element) => element.open)) await (await expectOne(addJob.locator(':scope > summary'), 'workflow_plant_add_job_summary_count')).click()
    await (await expectOneVisible(addJob.getByRole('button', { name: 'Load sample job batch', exact: true }), 'workflow_plant_sample_job_count')).click()
    const importReview = await expectOneVisible(addJob.getByRole('status').filter({ hasText: 'Ready for review' }), 'workflow_plant_import_review_count')
    const importReviewText = await importReview.innerText()
    if (!importReviewText.includes('2 ready') || !importReviewText.includes(jobId) || !importReviewText.includes('no Plant write')) fail('workflow_plant_import_review_evidence_missing')
    checkpoints.push('job_import_reviewed')

    await confirmPlantWorkflowAction(page, await expectOne(addJob.getByRole('button', { name: 'Review job', exact: true }), 'workflow_plant_review_job_count'), 'create_job', [jobId, 'No production job', 'Line A', 'Plant supervisor', 'target 120'])
    const job = await expectOneVisible(page.locator('.job-list article').filter({ hasText: jobId }), 'workflow_plant_created_job_count')
    const createdJobText = await job.innerText()
    if (!createdJobText.includes('First production run') || !createdJobText.includes('0 good') || !createdJobText.includes('0 / 120')) fail('workflow_plant_created_job_evidence_missing')
    checkpoints.push('production_job_created')

    await (await expectOne(job.getByRole('button', { name: 'Record output', exact: true }), 'workflow_plant_record_output_count')).click()
    const outputPanel = await expectOneVisible(page.locator('#plant-output-panel'), 'workflow_plant_output_panel_count')
    await (await expectOne(outputPanel.locator('input[name="plant-output-shift-reference"]'), 'workflow_plant_shift_reference_count')).fill(shiftReference)
    await (await expectOne(outputPanel.locator('input[name="plant-output-quantity"]'), 'workflow_plant_output_quantity_count')).fill('10')
    checkpoints.push('output_review_ready')

    await confirmPlantWorkflowAction(page, await expectOne(outputPanel.getByRole('button', { name: 'Review good output', exact: true }), 'workflow_plant_review_output_count'), 'record_output', [jobId, shiftReference, '0 good', '10 good'])
    const materialDisclosure = await expectOneVisible(outputPanel.locator('details').filter({ hasText: 'Material use' }), 'workflow_plant_material_disclosure_count')
    if (!(await job.innerText()).includes('10 good')) fail('workflow_plant_output_not_persisted')
    checkpoints.push('good_output_recorded')

    await (await expectOne(materialDisclosure.locator('select').first(), 'workflow_plant_material_job_count')).selectOption(jobId)
    await (await expectOneVisible(outputPanel.getByRole('button', { name: 'Fill sample trace', exact: true }), 'workflow_plant_fill_trace_count')).click()
    await confirmPlantWorkflowAction(page, await expectOne(outputPanel.getByRole('button', { name: 'Review material use', exact: true }), 'workflow_plant_review_material_count'), 'record_material', [jobId, shiftReference, 'RM-SAMPLE-01', 'LOT-SAMPLE-01'])
    await outputPanel.waitFor({ state: 'hidden', timeout: 8_000 })
    checkpoints.push('same_shift_material_recorded')

    await (await expectOne(page.getByRole('button', { name: 'Problems', exact: true }), 'workflow_plant_problems_tab_count')).click()
    await page.waitForURL((url) => url.pathname === '/plant/' && url.searchParams.get('tab') === 'control', { timeout: 8_000 })
    const qualityIssue = await expectOneVisible(page.locator('.issue-list article').filter({ hasText: 'Temperature drift requires supervisor review' }), 'workflow_plant_quality_issue_count')
    await (await expectOne(qualityIssue.getByRole('button', { name: 'Review CAPA', exact: true }), 'workflow_plant_review_capa_count')).click()
    const capa = await expectOneVisible(page.getByRole('dialog', { name: 'Verify corrective action', exact: true }), 'workflow_plant_capa_dialog_count')
    await (await expectOne(capa.getByLabel('Verified root cause', { exact: true }), 'workflow_plant_root_cause_count')).fill('Reviewed calibration method caused the recorded temperature drift.')
    await (await expectOne(capa.getByLabel('Corrective action', { exact: true }), 'workflow_plant_corrective_action_count')).fill('Calibrated the process and reviewed the standard work with the line owner.')
    await (await expectOne(capa.getByLabel('Effectiveness evidence', { exact: true }), 'workflow_plant_effectiveness_count')).fill('Three reviewed checks remained within the accepted operating limit.')
    await confirmPlantWorkflowAction(page, await expectOne(capa.getByRole('button', { name: 'Review CAPA closeout', exact: true }), 'workflow_plant_capa_closeout_count'), 'resolve_quality', ['Resolve ISS-301', 'effective CAPA', 'no inventory or customer action'])
    await qualityIssue.waitFor({ state: 'hidden', timeout: 8_000 })
    checkpoints.push('quality_capa_resolved')

    const shiftClose = await expectOneVisible(page.locator('details.production-history').filter({ has: page.locator('summary').filter({ hasText: 'Shift close' }) }), 'workflow_plant_shift_close_count')
    if (!await shiftClose.evaluate((element) => element.open)) await (await expectOne(shiftClose.locator(':scope > summary'), 'workflow_plant_shift_close_summary_count')).click()
    const shiftInput = await expectOneVisible(shiftClose.getByLabel('Shift reference', { exact: true }), 'workflow_plant_close_shift_reference_count')
    if (await shiftInput.inputValue() !== shiftReference) await shiftInput.fill(shiftReference)
    await (await expectOne(shiftClose.getByRole('button', { name: 'Prepare shift close file', exact: true }), 'workflow_plant_prepare_close_count')).click()
    const checklist = await expectOneVisible(shiftClose.locator('[aria-label="Shift close checklist"]'), 'workflow_plant_close_checklist_count')
    const checklistText = await checklist.innerText()
    if (!checklistText.includes('10 good / 1 entries')
      || !checklistText.includes('1 traced')
      || (checklistText.match(/Clear/g)?.length ?? 0) < 3) fail('workflow_plant_close_checklist_not_ready')
    checkpoints.push('shift_close_packet_ready')

    await confirmPlantWorkflowAction(page, await expectOneVisible(shiftClose.getByRole('button', { name: 'Review shift close', exact: true }), 'workflow_plant_review_shift_close_count'), 'shift_close', [shiftReference, '10 good', '1 material entries', 'quality clear', 'WCM clear'])
    const closedState = await expectOneVisible(shiftClose.getByText('Shift closed by QA Plant operator', { exact: true }), 'workflow_plant_closed_state_count')
    const closedText = await closedState.locator('..').innerText()
    if (!closedText.includes(shiftReference) || !closedText.includes('10 good') || !closedText.includes('1 material entries')) fail('workflow_plant_saved_close_evidence_missing')
    checkpoints.push('shift_close_saved')
  } catch (error) {
    failures.push(`workflow_exception:${error instanceof Error ? error.message : String(error)}`.slice(0, 500))
  } finally {
    await context.close()
  }
  if (consoleErrors.length) failures.push(`console_errors:${consoleErrors.length}`)
  if (pageErrors.length) failures.push(`page_errors:${pageErrors.length}`)
  if (externalRequests.length) failures.push(`external_requests:${externalRequests.length}`)
  return {
    workflowId: 'plant-plan-output-material-quality-shift-close',
    viewport: viewport.id,
    ok: failures.length === 0,
    checkpoints,
    failures,
    consoleErrors,
    pageErrors,
    externalRequests,
  }
}

async function auditWebsiteEditReleaseWorkflow(browser, baseUrl, viewport) {
  const context = await browser.newContext({
    acceptDownloads: true,
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
  const businessName = `QA Website ${viewport.id}`
  try {
    const response = await page.goto(`${baseUrl}/website/`, { timeout: 20_000, waitUntil: 'domcontentloaded' })
    if (!response || response.status() < 200 || response.status() >= 400) fail(`workflow_website_http_status:${response?.status() ?? 'none'}`)
    await waitForProduct(page, 'Website')

    await (await expectOneVisible(page.getByRole('button', { name: 'Customize demo', exact: true }), 'workflow_website_customize_count')).click()
    const starter = await expectOneVisible(page.getByRole('region', { name: 'Edit', exact: true }), 'workflow_website_starter_region_count')
    const businessNameField = await expectOneVisible(starter.getByLabel('Business name', { exact: true }), 'workflow_website_business_name_count')
    await businessNameField.fill(businessName)
    const requiredBriefComplete = await starter.locator('input[required],textarea[required],select[required]').evaluateAll((fields) => fields.length >= 4 && fields.every((field) => String(field.value ?? '').trim().length > 0))
    if (!requiredBriefComplete) fail('workflow_website_starter_brief_incomplete')
    checkpoints.push('starter_brief_reviewed')

    await (await expectOne(starter.getByRole('button', { name: 'Make preview', exact: true }), 'workflow_website_make_preview_count')).click()
    const preview = await expectOneVisible(page.locator('.website-preview-site'), 'workflow_website_preview_count')
    if (!(await preview.innerText()).includes(businessName)) fail('workflow_website_custom_preview_missing')
    const readyMetrics = await expectOneVisible(page.getByRole('group', { name: 'Website today status', exact: true }), 'workflow_website_ready_metrics_count')
    const readyMetricsText = await readyMetrics.innerText()
    if (!readyMetricsText.includes('0/3 ready') || !readyMetricsText.includes('Blocked by draft')) fail(`workflow_website_generated_readiness_missing:${readyMetricsText.replace(/\s+/g, ' ').slice(0, 240)}`)
    checkpoints.push('client_preview_generated')

    const actionBar = await expectOneVisible(page.getByRole('region', { name: 'Website actions', exact: true }), 'workflow_website_action_bar_count')
    await (await expectOne(actionBar.getByRole('button', { name: 'Edit page', exact: true }), 'workflow_website_edit_page_count')).click()
    const pageSelect = await expectOneVisible(actionBar.getByLabel('Page', { exact: true }), 'workflow_website_page_select_count')
    const pageIds = await pageSelect.locator('option').evaluateAll((options) => options.map((option) => option.value))
    if (pageIds.length !== 3 || pageIds.some((id) => !id)) fail('workflow_website_generated_page_ids_invalid')
    for (const [index, pageId] of pageIds.entries()) {
      await pageSelect.selectOption(pageId)
      const markReady = await expectOneVisible(page.getByRole('button', { name: 'Mark page ready', exact: true }), `workflow_website_mark_ready_${index}_count`)
      if (!await markReady.isEnabled()) fail(`workflow_website_page_${index}_not_ready_for_review`)
      await markReady.click()
    }
    if (!(await readyMetrics.innerText()).includes('3/3 ready')) fail('workflow_website_all_pages_not_ready')
    checkpoints.push('pages_reviewed_ready')

    await (await expectOne(actionBar.getByRole('button', { name: 'Preview', exact: true }), 'workflow_website_open_preview_count')).click()
    const previewControls = await expectOneVisible(page.getByRole('group', { name: 'Responsive preview size', exact: true }), 'workflow_website_preview_controls_count')
    for (const [label, id] of [['Desktop', 'desktop'], ['Tablet', 'tablet'], ['Mobile', 'mobile']]) {
      const control = await expectOne(previewControls.getByRole('button', { name: label, exact: true }), `workflow_website_${id}_preview_count`)
      await control.click()
      if (await control.getAttribute('aria-pressed') !== 'true') fail(`workflow_website_${id}_preview_not_selected`)
      await expectOneVisible(page.locator(`.website-preview-frame.is-${id}`), `workflow_website_${id}_frame_count`)
    }
    checkpoints.push('responsive_preview_verified')

    if (await actionBar.getByRole('button', { name: 'Download preview', exact: true }).count()) fail('workflow_website_unsaved_download_available')
    await expectOne(actionBar.getByRole('button', { name: 'Save', exact: true }), 'workflow_website_save_count')
    checkpoints.push('unsaved_download_blocked')

    await actionBar.getByRole('button', { name: 'Save', exact: true }).click()
    const saveNotice = await expectOneVisible(page.locator('.website-notice').filter({ hasText: 'Website saved once as content revision' }), 'workflow_website_save_notice_count', 8_000)
    if (!(await saveNotice.innerText()).includes('Nothing was deployed')) fail('workflow_website_save_boundary_missing')
    await page.reload({ timeout: 20_000, waitUntil: 'domcontentloaded' })
    const restoredPreview = await expectOneVisible(page.locator('.website-preview-site'), 'workflow_website_restored_preview_count')
    if (!(await restoredPreview.innerText()).includes(businessName)) fail('workflow_website_saved_revision_not_restored')
    const savedState = await expectOneVisible(page.locator('.website-save-state'), 'workflow_website_saved_state_count')
    if (!['Saved on this device', 'Session only'].includes((await savedState.innerText()).trim())) fail('workflow_website_saved_state_invalid')
    checkpoints.push('saved_revision_restored')

    const restoredActionBar = await expectOneVisible(page.getByRole('region', { name: 'Website actions', exact: true }), 'workflow_website_restored_action_bar_count')
    const downloadButton = await expectOne(restoredActionBar.getByRole('button', { name: 'Download preview', exact: true }), 'workflow_website_download_count')
    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 })
    await downloadButton.click()
    const download = await downloadPromise
    const suggestedFilename = download.suggestedFilename()
    if (suggestedFilename !== `qa-website-${viewport.id}.html`) fail(`workflow_website_download_filename_invalid:${suggestedFilename}`)
    const downloadPath = await download.path()
    if (!downloadPath) fail('workflow_website_download_path_missing')
    const downloadedHtml = await readFile(downloadPath, 'utf8')
    if (downloadedHtml.length < 2_000 || !downloadedHtml.includes(businessName) || !downloadedHtml.toLowerCase().includes('<!doctype html>')) fail('workflow_website_download_content_invalid')
    checkpoints.push('reviewable_site_file_downloaded')

    const downloadNotice = await expectOneVisible(page.locator('.website-notice').filter({ hasText: 'standalone preview' }), 'workflow_website_download_notice_count')
    const downloadNoticeText = await downloadNotice.innerText()
    if (!downloadNoticeText.includes('no site or domain was deployed')) fail('workflow_website_deployment_boundary_missing')
    checkpoints.push('deployment_boundary_visible')
  } catch (error) {
    failures.push(`workflow_exception:${error instanceof Error ? error.message : String(error)}`.slice(0, 500))
  } finally {
    await context.close()
  }
  if (consoleErrors.length) failures.push(`console_errors:${consoleErrors.length}`)
  if (pageErrors.length) failures.push(`page_errors:${pageErrors.length}`)
  if (externalRequests.length) failures.push(`external_requests:${externalRequests.length}`)
  return {
    workflowId: 'website-brief-responsive-preview-release-file',
    viewport: viewport.id,
    ok: failures.length === 0,
    checkpoints,
    failures,
    consoleErrors,
    pageErrors,
    externalRequests,
  }
}

async function auditBlueprintPreviewWorkflow(browser, baseUrl, viewport) {
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
  const productStorage = () => page.evaluate(() => {
    const exactKeys = new Set([
      'supermega.commerce.workspace.v2',
      'supermega.production.workspace.v2',
      'supermega.website.workspace.v2',
    ])
    const prefixes = [
      'supermega.ecommerce.buying_lifecycle.',
      'supermega.ecommerce.storefront_draft.',
    ]
    return Object.fromEntries(Object.keys(localStorage)
      .filter((key) => exactKeys.has(key) || prefixes.some((prefix) => key.startsWith(prefix)))
      .sort()
      .map((key) => [key, localStorage.getItem(key)]))
  })
  try {
    const response = await page.goto(`${baseUrl}/shop/`, { timeout: 20_000, waitUntil: 'domcontentloaded' })
    if (!response || response.status() < 200 || response.status() >= 400) fail(`workflow_blueprint_http_status:${response?.status() ?? 'none'}`)
    await waitForProduct(page, 'Shop')
    const productStateBefore = await productStorage()

    const navigator = await expectOneVisible(page.locator('details.product-system-navigator'), 'workflow_blueprint_navigator_count')
    const navigatorSummary = await expectOneVisible(navigator.locator(':scope > summary'), 'workflow_blueprint_navigator_summary_count')
    checkpoints.push('blueprint_product_entry_ready')

    await navigatorSummary.click()
    const dataRegion = await expectOneVisible(navigator.getByRole('region', { name: 'Shop data', exact: true }), 'workflow_blueprint_data_region_count')
    const dataBoundary = await dataRegion.innerText()
    if (!dataBoundary.includes('matches columns locally') || !dataBoundary.includes('asks before changing Shop') || !dataBoundary.includes('Only Shop is prepared here')) fail('workflow_blueprint_data_boundary_invalid')
    checkpoints.push('blueprint_data_boundary_visible')

    await (await expectOneVisible(dataRegion.getByRole('button', { name: 'Use my Shop data', exact: true }), 'workflow_blueprint_open_data_count')).click()
    const importWorkspace = await expectOneVisible(navigator.locator('.catalog-import-workspace'), 'workflow_blueprint_import_workspace_count')
    const boundaryBeforePreview = await expectOneVisible(importWorkspace.locator('.catalog-import-boundary'), 'workflow_blueprint_boundary_count')
    if (!(await boundaryBeforePreview.innerText()).includes('Nothing is sent to AI or added to Shop while you review it')) fail('workflow_blueprint_review_boundary_missing')
    checkpoints.push('blueprint_import_opened')

    await (await expectOne(importWorkspace.getByRole('button', { name: 'Try sample', exact: true }), 'workflow_blueprint_try_sample_count')).click()
    const preview = await expectOneVisible(importWorkspace.locator('.catalog-import-preview'), 'workflow_blueprint_preview_count', 8_000)
    const sourceSummary = await expectOneVisible(preview.locator('.catalog-import-source'), 'workflow_blueprint_source_summary_count')
    const sourceSummaryText = await sourceSummary.innerText()
    const normalizedSourceSummary = sourceSummaryText.toLowerCase()
    if (!normalizedSourceSummary.includes('2 rows found') || !normalizedSourceSummary.includes('ready to prepare')) fail(`workflow_blueprint_sample_preview_invalid:${sourceSummaryText.replace(/\s+/g, ' ').trim()}`)
    checkpoints.push('sample_preview_ready')

    const approval = await expectOneVisible(preview.locator('label.website-intake-confirm'), 'workflow_blueprint_approval_count')
    const approvalCheckbox = await expectOne(approval.locator('input[type="checkbox"]'), 'workflow_blueprint_approval_checkbox_count')
    if (await approvalCheckbox.isChecked()) fail('workflow_blueprint_approval_preselected')
    const applyButton = await expectOneVisible(preview.getByRole('button', { name: /Add 2 .* to Shop/ }), 'workflow_blueprint_apply_count')
    if (await applyButton.isEnabled()) fail('workflow_blueprint_apply_unlocked_without_review')
    checkpoints.push('activation_remains_locked')

    if (JSON.stringify(await productStorage()) !== JSON.stringify(productStateBefore)) fail('workflow_blueprint_product_write_during_preview')
    checkpoints.push('product_state_unchanged')
  } catch (error) {
    failures.push(`workflow_exception:${error instanceof Error ? error.message : String(error)}`.slice(0, 500))
  } finally {
    await context.close()
  }
  if (consoleErrors.length) failures.push(`console_errors:${consoleErrors.length}`)
  if (pageErrors.length) failures.push(`page_errors:${pageErrors.length}`)
  if (externalRequests.length) failures.push(`external_requests:${externalRequests.length}`)
  return {
    workflowId: 'blueprint-shop-data-no-write-preview',
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
        for (const viewport of policy.viewports) workflowResults.push(await auditFourProductOnboardingFirstTaskWorkflow(browser, server.baseUrl, viewport))
        for (const viewport of policy.viewports) workflowResults.push(await auditEcommerceShopOrderWorkflow(browser, server.baseUrl, viewport))
        for (const viewport of policy.viewports) workflowResults.push(await auditShopSaleCloseWorkflow(browser, server.baseUrl, viewport))
        for (const viewport of policy.viewports) workflowResults.push(await auditShopSyncRecoveryWorkflow(browser, server.baseUrl, viewport))
        for (const viewport of policy.viewports) workflowResults.push(await auditPlantPlanShiftCloseWorkflow(browser, server.baseUrl, viewport))
        for (const viewport of policy.viewports) workflowResults.push(await auditWebsiteEditReleaseWorkflow(browser, server.baseUrl, viewport))
        for (const viewport of policy.viewports) workflowResults.push(await auditBlueprintPreviewWorkflow(browser, server.baseUrl, viewport))
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
    accessibilityViolations: result.accessibility.violationCount,
    accessibilityRules: result.accessibility.violations.map((finding) => finding.id),
  })),
}
process.stdout.write(`${JSON.stringify(process.argv.includes('--details') ? report : summary, null, 2)}\n`)
if (!report.ok || (process.argv.includes('--require-targets') && !report.simplicityTargetsMet)) process.exitCode = 1
