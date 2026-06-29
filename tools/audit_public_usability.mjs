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
      templateSetupLinks: document.querySelectorAll('#agent-templates a[href$="/setup/"]').length,
      starterKitLinks: document.querySelectorAll('#agent-templates a.link[href^="/agent-templates/"]').length,
      overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }))
    if (products.templateCards !== expectedTemplates.length) fail('template_cards_missing', { viewport: viewport.name, products })
    if (products.templateSetupLinks !== expectedTemplates.length) fail('template_setup_links_missing', { viewport: viewport.name, products })
    if (products.starterKitLinks !== expectedTemplates.length) fail('starter_kit_links_missing', { viewport: viewport.name, products })
    if (products.overflowX > 0) fail('products_horizontal_overflow', { viewport: viewport.name, products })

    const productsShot = resolve(outputDir, `supermega-agent-templates-${viewport.name}.png`)
    await page.locator('#agent-templates').screenshot({ path: productsShot, animations: 'disabled' })
    results.screenshots[`agent_templates_${viewport.name}`] = productsShot

    await open(page, `${baseUrl}/agent-templates/daily-intelligence-brief/setup/`, viewport.name)
    await expectCopy(
      page,
      ['Set up Daily Intelligence Brief Agent.', 'First proof', 'Send setup request'],
      'template_setup',
      viewport.name,
    )
    const setup = await page.evaluate(() => ({
      title: document.title,
      templateId: document.querySelector('input[name="template_id"]')?.value || '',
      starterKitUrl: document.querySelector('input[name="starter_kit_url"]')?.value || '',
      firstProofTarget: document.querySelector('input[name="first_proof_target"]')?.value || '',
      formAction: document.querySelector('[data-agent-template-setup]')?.getAttribute('action') || '',
      submitVisible: Boolean(document.querySelector('[data-agent-template-setup] button[type="submit"]')?.getBoundingClientRect().height),
      overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }))
    if (setup.templateId !== 'daily-intelligence-brief') fail('setup_template_id_missing', { viewport: viewport.name, setup })
    if (setup.starterKitUrl !== '/site/agent-templates/daily-intelligence-brief.json') fail('setup_starter_kit_url_missing', { viewport: viewport.name, setup })
    if (!setup.firstProofTarget.includes('One-page morning brief')) fail('setup_first_proof_missing', { viewport: viewport.name, setup })
    if (setup.formAction !== '/api/contact-submissions') fail('setup_form_action_wrong', { viewport: viewport.name, setup })
    if (!setup.submitVisible) fail('setup_submit_not_visible', { viewport: viewport.name, setup })
    if (setup.overflowX > 0) fail('setup_horizontal_overflow', { viewport: viewport.name, setup })

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

    await open(page, `${baseUrl}/operator/`, viewport.name)
    await expectCopy(page, ['Operator Console', 'Ops key', 'Load sample proof', 'Refresh queue', 'Run queue now'], 'operator_console', viewport.name)
    const operator = await page.evaluate(() => {
      const html = document.documentElement.innerHTML
      return {
        title: document.title,
        opsKeyVisible: Boolean(document.querySelector('#ops-key')?.getBoundingClientRect().height),
        sampleVisible: Boolean(document.querySelector('#load-sample')?.getBoundingClientRect().height),
        refreshVisible: Boolean(document.querySelector('#refresh')?.getBoundingClientRect().height),
        runnerVisible: Boolean(document.querySelector('#run-runner')?.getBoundingClientRect().height),
        hasStarterKitRenderer: html.includes('Open starter kit'),
        hasChecklistRenderer: html.includes("proofList('Checklist'"),
        hasAcceptanceRenderer: html.includes("proofList('Acceptance tests'"),
        hasBuyerReplyRenderer: html.includes('proofBuyerReply') && html.includes('Copy buyer reply'),
        hasProofDeliveryRenderer: html.includes('proofDeliveryPacket') && html.includes('Copy proof packet'),
        hasPilotCloseRenderer: html.includes('pilotClosePacket') && html.includes('Copy pilot packet'),
        hasPilotOrderRoomRenderer: html.includes('pilotOrderRoom') && html.includes('Copy payment request') && html.includes('Copy owner activation packet'),
        hasWorkspaceHandoffRenderer: html.includes('Copy workspace manifest') && html.includes('Copy workspace handoff') && html.includes('Copy first run queue'),
        hasOrderRoomPersistenceControls: html.includes('persistOrderRoomState') && html.includes('Save scope approval') && html.includes('Save payment proof'),
        hasSampleData: html.includes('samplePipelineData') && html.includes('No lead was created'),
        overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      }
    })
    if (operator.title !== 'Operator Console | SUPERMEGA.dev') fail('operator_title_not_current', { viewport: viewport.name, operator })
    if (!operator.opsKeyVisible || !operator.sampleVisible || !operator.refreshVisible || !operator.runnerVisible) fail('operator_controls_missing', { viewport: viewport.name, operator })
    if (!operator.hasStarterKitRenderer || !operator.hasChecklistRenderer || !operator.hasAcceptanceRenderer || !operator.hasBuyerReplyRenderer || !operator.hasProofDeliveryRenderer || !operator.hasPilotCloseRenderer || !operator.hasPilotOrderRoomRenderer || !operator.hasWorkspaceHandoffRenderer || !operator.hasOrderRoomPersistenceControls || !operator.hasSampleData) fail('operator_first_proof_renderer_missing', { viewport: viewport.name, operator })
    if (operator.overflowX > 0) fail('operator_horizontal_overflow', { viewport: viewport.name, operator })
    await page.click('#load-sample')
    await expectCopy(
      page,
      ['Sample Daily Intelligence Brief first proof', 'Open starter kit', 'Checklist', 'Acceptance tests', 'Buyer reply draft', 'Copy buyer reply', 'Proof delivery packet', 'Copy proof packet', 'Pilot close packet', 'Copy pilot packet', 'Paid pilot order room', 'Copy payment request', 'Copy payment ledger', 'Copy order ledger', 'Copy pilot start checklist', 'Copy owner activation packet', 'Copy owner action queue', 'Copy activation JSON', 'Copy workspace manifest', 'Copy workspace handoff', 'Copy first run queue', 'Save scope approval', 'Save payment proof', 'No lead was created'],
      'operator_sample_packet',
      viewport.name,
    )
    const operatorSample = await page.evaluate(() => ({
      renderedActions: document.querySelectorAll('#operator-actions .operator-item').length,
      sampleStatus: document.querySelector('#operator-status')?.textContent || '',
      starterLink: document.querySelector('#operator-actions .operator-proof-link')?.getAttribute('href') || '',
      buyerReply: document.querySelector('#operator-actions #buyer-reply-0')?.value || '',
      proofPacket: document.querySelector('#operator-actions #proof-delivery-0')?.value || '',
      pilotPacket: document.querySelector('#operator-actions #pilot-close-0')?.value || '',
      paymentRequest: document.querySelector('#operator-actions #payment-request-0')?.value || '',
      paymentLedger: document.querySelector('#operator-actions #payment-proof-ledger-0')?.value || '',
      orderLedger: document.querySelector('#operator-actions #order-room-ledger-0')?.value || '',
      pilotStartChecklist: document.querySelector('#operator-actions #pilot-start-checklist-0')?.value || '',
      ownerActivationPacket: document.querySelector('#operator-actions #owner-activation-packet-0')?.value || '',
      ownerActionQueue: document.querySelector('#operator-actions #owner-action-queue-0')?.value || '',
      activationSummary: document.querySelector('#operator-actions #activation-summary-0')?.value || '',
      workspaceManifest: document.querySelector('#operator-actions #workspace-manifest-0')?.value || '',
      workspaceHandoff: document.querySelector('#operator-actions #workspace-handoff-0')?.value || '',
      firstRunQueue: document.querySelector('#operator-actions #first-run-queue-0')?.value || '',
      copyButtons: document.querySelectorAll('#operator-actions .operator-copy').length,
      stateButtons: document.querySelectorAll('#operator-actions .operator-state').length,
      stateText: document.querySelector('#operator-actions .operator-order-room')?.textContent || '',
      overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }))
    if (operatorSample.renderedActions !== 1) fail('operator_sample_action_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.sampleStatus.includes('sample_loaded')) fail('operator_sample_status_missing', { viewport: viewport.name, operatorSample })
    if (operatorSample.starterLink !== '/site/agent-templates/daily-intelligence-brief.json') fail('operator_sample_starter_link_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.buyerReply.includes('Please send one approved sample source')) fail('operator_sample_buyer_reply_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.proofPacket.includes('## Acceptance test status')) fail('operator_sample_proof_packet_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.pilotPacket.includes('Price hint: 11,000,000 MMK setup')) fail('operator_sample_pilot_packet_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.paymentRequest.includes('PAYMENT_LINK_REQUIRED_AFTER_OWNER_APPROVAL')) fail('operator_sample_payment_request_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.paymentLedger.includes('payment_proof_required')) fail('operator_sample_payment_ledger_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.orderLedger.includes('order_not_started')) fail('operator_sample_order_ledger_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.pilotStartChecklist.includes('Payment proof is attached to the payment-proof ledger.')) fail('operator_sample_start_checklist_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.ownerActivationPacket.includes('Real MRR delta: 0 until payment proof is recorded.')) fail('operator_sample_owner_activation_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.ownerActionQueue.includes('start_private_pilot_workspace')) fail('operator_sample_owner_queue_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.activationSummary.includes('"real_mrr_delta": 0')) fail('operator_sample_activation_summary_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.workspaceManifest.includes('"first_run_mode": "approval_only"')) fail('operator_sample_workspace_manifest_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.workspaceHandoff.includes('Create workspace allowed: no')) fail('operator_sample_workspace_handoff_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.firstRunQueue.includes('owner_acceptance_review')) fail('operator_sample_first_run_queue_missing', { viewport: viewport.name, operatorSample })
    if (operatorSample.copyButtons < 13) fail('operator_sample_copy_missing', { viewport: viewport.name, operatorSample })
    if (operatorSample.stateButtons < 5 || !operatorSample.stateText.includes('not_created_until_payment_proof')) fail('operator_sample_state_controls_missing', { viewport: viewport.name, operatorSample })
    const copyButton = page.locator('#operator-actions .operator-copy').first()
    await copyButton.scrollIntoViewIfNeeded()
    await copyButton.click({ force: true })
    await page.waitForFunction(() => {
      const value = document.querySelector('#operator-status')?.textContent || ''
      return value.includes('buyer-reply-0') || value.includes('copy_failed')
    }, { timeout: 5000 }).catch(() => undefined)
    const copyStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!copyStatus.includes('buyer-reply-0') || !copyStatus.includes('Text copied')) fail('operator_sample_copy_failed', { viewport: viewport.name, copyStatus })
    const proofCopyButton = page.locator('#operator-actions .operator-copy').nth(1)
    await proofCopyButton.scrollIntoViewIfNeeded()
    await proofCopyButton.click({ force: true })
    await page.waitForFunction(() => {
      const value = document.querySelector('#operator-status')?.textContent || ''
      return value.includes('proof-delivery-0') || value.includes('copy_failed')
    }, { timeout: 5000 }).catch(() => undefined)
    const proofCopyStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!proofCopyStatus.includes('proof-delivery-0') || !proofCopyStatus.includes('Text copied')) fail('operator_sample_proof_copy_failed', { viewport: viewport.name, proofCopyStatus })
    const pilotCopyButton = page.locator('#operator-actions .operator-copy').nth(2)
    await pilotCopyButton.scrollIntoViewIfNeeded()
    await pilotCopyButton.click({ force: true })
    await page.waitForFunction(() => {
      const value = document.querySelector('#operator-status')?.textContent || ''
      return value.includes('pilot-close-0') || value.includes('copy_failed')
    }, { timeout: 5000 }).catch(() => undefined)
    const pilotCopyStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!pilotCopyStatus.includes('pilot-close-0') || !pilotCopyStatus.includes('Text copied')) fail('operator_sample_pilot_copy_failed', { viewport: viewport.name, pilotCopyStatus })
    const paymentCopyButton = page.locator('#operator-actions .operator-copy').nth(3)
    await paymentCopyButton.scrollIntoViewIfNeeded()
    await paymentCopyButton.click({ force: true })
    await page.waitForFunction(() => {
      const value = document.querySelector('#operator-status')?.textContent || ''
      return value.includes('payment-request-0') || value.includes('copy_failed')
    }, { timeout: 5000 }).catch(() => undefined)
    const paymentCopyStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!paymentCopyStatus.includes('payment-request-0') || !paymentCopyStatus.includes('Text copied')) fail('operator_sample_payment_copy_failed', { viewport: viewport.name, paymentCopyStatus })
    const activationCopyButton = page.locator('#operator-actions .operator-copy').nth(7)
    await activationCopyButton.scrollIntoViewIfNeeded()
    await activationCopyButton.click({ force: true })
    await page.waitForFunction(() => {
      const value = document.querySelector('#operator-status')?.textContent || ''
      return value.includes('owner-activation-packet-0') || value.includes('copy_failed')
    }, { timeout: 5000 }).catch(() => undefined)
    const activationCopyStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!activationCopyStatus.includes('owner-activation-packet-0') || !activationCopyStatus.includes('Text copied')) fail('operator_sample_activation_copy_failed', { viewport: viewport.name, activationCopyStatus })
    const stateButton = page.locator('#operator-actions .operator-state').first()
    await stateButton.scrollIntoViewIfNeeded()
    await stateButton.click({ force: true })
    const stateStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!stateStatus.includes('Paste the ops key first.')) fail('operator_sample_state_guard_failed', { viewport: viewport.name, stateStatus })
    if (operatorSample.overflowX > 0) fail('operator_sample_horizontal_overflow', { viewport: viewport.name, operatorSample })
    if (consoleMessages.length) fail('console_messages', { viewport: viewport.name, consoleMessages })

    results.checks[viewport.name] = { home, products, setup, contact, operator, operatorSample }
    await page.close()
  }

  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.close()
}
