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
  'Document / PDF Intake Ledger',
  'CRM Follow-up & Pipeline Assistant',
  'Proposal & SOW Builder',
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
    { name: 'tablet', width: 834, height: 1112, isMobile: true },
    { name: 'mobile', width: 390, height: 844, isMobile: true },
  ]) {
    const expectedDevice =
      viewport.name === 'mobile'
        ? { id: 'phone', label: 'Phone mode', copy: 'screenshots' }
        : viewport.name === 'tablet'
          ? { id: 'tablet', label: 'Tablet mode', copy: 'review queues' }
          : { id: 'desktop', label: 'Desktop mode', copy: 'source review' }
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
    await page.evaluate(() => {
      document.querySelectorAll('.section').forEach((section) => section.classList.add('sm-in'))
    })
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
    await page.locator('#products').scrollIntoViewIfNeeded()
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

    await open(page, `${baseUrl}/ai-agents/`, viewport.name)
    await page.evaluate(() => {
      window.localStorage.removeItem('sm_worker_role_mode')
      window.localStorage.removeItem('sm_worker_device_mode')
      window.localStorage.setItem('sm_worker_continue_state', JSON.stringify({
        template_id: 'daily-intelligence-brief',
        last_signal: 'template_clicked',
        signal_count: 3,
        first_seen_at: 'SAMPLE-FIRST-SEEN',
        last_seen_at: 'SAMPLE-LAST-SEEN',
        last_page_path: '/ai-agents/',
      }))
    })
    await page.reload({ waitUntil: 'commit', timeout: 45000 })
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
    const localWorker = await page.evaluate(() => ({
      visible: Boolean(document.querySelector('[data-local-worker-continue]')?.getBoundingClientRect().height),
      text: document.querySelector('[data-local-worker-continue]')?.textContent || '',
      setupHref: document.querySelector('[data-local-worker-continue] a[data-sm-template-link="daily-intelligence-brief"]')?.getAttribute('href') || '',
      guideHref: document.querySelector('[data-local-worker-continue] a[href="/ai-agents/guide/"]')?.getAttribute('href') || '',
      privacyCopy: document.body.textContent.includes('No source files, typed business text, credentials, or payment data are stored.'),
      overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }))
    if (!localWorker.visible || !localWorker.text.includes('Continue Daily Intelligence Brief Agent')) fail('local_worker_continue_panel_missing', { viewport: viewport.name, localWorker })
    if (localWorker.setupHref !== '/agent-templates/daily-intelligence-brief/setup/' || localWorker.guideHref !== '/ai-agents/guide/') fail('local_worker_continue_links_wrong', { viewport: viewport.name, localWorker })
    if (!localWorker.privacyCopy) fail('local_worker_continue_privacy_copy_missing', { viewport: viewport.name, localWorker })
    if (localWorker.overflowX > 0) fail('local_worker_continue_horizontal_overflow', { viewport: viewport.name, localWorker })
    const deviceMode = await page.evaluate(() => ({
      visible: Boolean(document.querySelector('[data-device-mode-panel]')?.getBoundingClientRect().height),
      text: document.querySelector('[data-device-mode-panel]')?.textContent || '',
      stored: window.localStorage.getItem('sm_worker_device_mode') || '',
      detected: window.supermegaDetectDeviceMode ? window.supermegaDetectDeviceMode().id : '',
      overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }))
    if (!deviceMode.visible || deviceMode.stored !== expectedDevice.id || deviceMode.detected !== expectedDevice.id || !deviceMode.text.includes('Device-aware onboarding') || !deviceMode.text.includes(expectedDevice.label) || !deviceMode.text.includes(expectedDevice.copy)) {
      fail('device_mode_panel_missing', { viewport: viewport.name, expectedDevice, deviceMode })
    }
    if (deviceMode.overflowX > 0) fail('device_mode_panel_horizontal_overflow', { viewport: viewport.name, deviceMode })
    const roleInitial = await page.evaluate(() => ({
      visible: Boolean(document.querySelector('[data-role-mode-panel]')?.getBoundingClientRect().height),
      text: document.querySelector('[data-role-mode-panel]')?.textContent || '',
      overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }))
    if (!roleInitial.visible || !roleInitial.text.includes('Role-aware onboarding') || !roleInitial.text.includes('Choose your role mode')) fail('role_mode_panel_missing', { viewport: viewport.name, roleInitial })
    if (roleInitial.overflowX > 0) fail('role_mode_panel_horizontal_overflow', { viewport: viewport.name, roleInitial })
    await page.click('[data-role-mode-choice="technical_admin"]')
    await page.waitForFunction(() => window.localStorage.getItem('sm_worker_role_mode') === 'technical_admin', null, { timeout: 5000 })
    const roleMode = await page.evaluate(() => ({
      stored: window.localStorage.getItem('sm_worker_role_mode') || '',
      text: document.querySelector('[data-role-mode-panel]')?.textContent || '',
      pressed: document.querySelector('[data-role-mode-choice="technical_admin"]')?.getAttribute('aria-pressed') || '',
      overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }))
    if (roleMode.stored !== 'technical_admin' || roleMode.pressed !== 'true' || !roleMode.text.includes('Using Technical admin mode') || !roleMode.text.includes('connector scope')) fail('role_mode_selection_missing', { viewport: viewport.name, roleMode })
    if (roleMode.overflowX > 0) fail('role_mode_selection_horizontal_overflow', { viewport: viewport.name, roleMode })
    await page.locator('[data-worker-router]').scrollIntoViewIfNeeded()
    await expectCopy(
      page,
      ['Adaptive Worker Matcher', 'Route a buyer to the right first worker before a call.', 'General AI Worker Toolkit', 'Document / PDF Intake Ledger'],
      'adaptive_worker_matcher',
      viewport.name,
    )
    await page.click('[data-worker-router] [data-router-choice="documents"]')
    await page.click('[data-worker-router] [data-router-choice="pdfs-docs"]')
    await page.click('[data-worker-router] [data-router-choice="professional-services"]')
    await page.click('[data-worker-router] [data-router-choice="ledger"]')
    await page.waitForFunction(() => document.querySelector('[data-router-result]')?.getAttribute('data-recommended-worker') === 'document-pdf-intake-ledger', null, { timeout: 5000 })
    const matcher = await page.evaluate(() => ({
      recommendedWorker: document.querySelector('[data-router-result]')?.getAttribute('data-recommended-worker') || '',
      resultText: document.querySelector('[data-router-result]')?.textContent || '',
      setupHref: document.querySelector('[data-router-result] a[data-sm-template-link="document-pdf-intake-ledger"]')?.getAttribute('href') || '',
      highlightedCards: document.querySelectorAll('[data-worker-template="document-pdf-intake-ledger"].is-router-match').length,
      pressedChoices: document.querySelectorAll('[data-worker-router] [aria-pressed="true"]').length,
      overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }))
    if (matcher.recommendedWorker !== 'document-pdf-intake-ledger') fail('adaptive_worker_matcher_recommendation_wrong', { viewport: viewport.name, matcher })
    if (!matcher.resultText.includes('Document / PDF Intake Ledger') || !matcher.resultText.includes('First proof')) fail('adaptive_worker_matcher_result_missing', { viewport: viewport.name, matcher })
    if (matcher.setupHref !== '/agent-templates/document-pdf-intake-ledger/setup/') fail('adaptive_worker_matcher_setup_link_wrong', { viewport: viewport.name, matcher })
    if (matcher.highlightedCards < 1 || matcher.pressedChoices !== 4) fail('adaptive_worker_matcher_state_missing', { viewport: viewport.name, matcher })
    if (matcher.overflowX > 0) fail('adaptive_worker_matcher_horizontal_overflow', { viewport: viewport.name, matcher })
    const matcherShot = resolve(outputDir, `supermega-adaptive-worker-matcher-${viewport.name}.png`)
    await page.locator('[data-worker-router]').screenshot({ path: matcherShot, animations: 'disabled' })
    results.screenshots[`adaptive_worker_matcher_${viewport.name}`] = matcherShot

    await open(page, `${baseUrl}/ai-agents/guide/`, viewport.name)
    await expectCopy(
      page,
      ['AI worker user guide', 'Use any worker in four steps.', 'Mobile, tablet, and desktop.', 'Connector setup rules.', 'Behavior adaptation loop', ...expectedTemplates],
      'ai_worker_user_guide',
      viewport.name,
    )
    const guide = await page.evaluate(() => ({
      title: document.title,
      workerCards: document.querySelectorAll('[data-guide-template]').length,
      setupLinks: document.querySelectorAll('[data-guide-template] a[href$="/setup/"]').length,
      hasRoleGuide: document.body.textContent.includes('Role-aware onboarding') && document.body.textContent.includes('Technical admin mode'),
      hasDeviceGuide: Boolean(document.querySelector('[data-device-mode-guide]')) && document.body.textContent.includes('Phone mode') && document.body.textContent.includes('Tablet mode') && document.body.textContent.includes('Desktop mode'),
      hasSafetyCopy: document.body.textContent.includes('no external sends, writes, payments, or browser/mobile actions without owner approval'),
      hasNoPrivateTextCopy: document.body.textContent.includes('No keystrokes, source files, credentials, or private business text are tracked.'),
      overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }))
    if (guide.title !== 'AI Worker User Guide | SUPERMEGA.dev') fail('ai_worker_user_guide_title_wrong', { viewport: viewport.name, guide })
    if (guide.workerCards !== expectedTemplates.length) fail('ai_worker_user_guide_cards_missing', { viewport: viewport.name, guide })
    if (guide.setupLinks !== expectedTemplates.length) fail('ai_worker_user_guide_setup_links_missing', { viewport: viewport.name, guide })
    if (!guide.hasRoleGuide) fail('ai_worker_user_guide_role_mode_missing', { viewport: viewport.name, guide })
    if (!guide.hasDeviceGuide) fail('ai_worker_user_guide_device_mode_missing', { viewport: viewport.name, guide })
    if (!guide.hasSafetyCopy || !guide.hasNoPrivateTextCopy) fail('ai_worker_user_guide_safety_copy_missing', { viewport: viewport.name, guide })
    if (guide.overflowX > 0) fail('ai_worker_user_guide_horizontal_overflow', { viewport: viewport.name, guide })
    await page.locator('[data-guide-template="deskpos-quickstart"]').scrollIntoViewIfNeeded()
    const guideLower = await page.evaluate(() => ({
      firstGuideCardVisible: Boolean(document.querySelector('[data-guide-template="deskpos-quickstart"]')?.getBoundingClientRect().height),
      connectorHeadingVisible: Boolean([...document.querySelectorAll('h2')].some((heading) => heading.textContent?.includes('Connector setup rules.'))),
      mobileHeadingVisible: Boolean([...document.querySelectorAll('h2')].some((heading) => heading.textContent?.includes('Mobile, tablet, and desktop.'))),
      lowerSectionOpacity: Math.min(
        ...[...document.querySelectorAll('[data-ai-worker-user-guide] .section')]
          .map((section) => Number.parseFloat(window.getComputedStyle(section).opacity || '0')),
      ),
    }))
    if (!guideLower.firstGuideCardVisible || !guideLower.connectorHeadingVisible || !guideLower.mobileHeadingVisible) fail('ai_worker_user_guide_lower_sections_missing', { viewport: viewport.name, guideLower })
    if (guideLower.lowerSectionOpacity < 0.98) fail('ai_worker_user_guide_lower_sections_faded', { viewport: viewport.name, guideLower })
    const guideShot = resolve(outputDir, `supermega-ai-worker-user-guide-${viewport.name}.png`)
    await page.screenshot({ path: guideShot, fullPage: true, animations: 'disabled' })
    results.screenshots[`ai_worker_user_guide_${viewport.name}`] = guideShot

    await open(page, `${baseUrl}/agent-templates/daily-intelligence-brief/setup/`, viewport.name)
    await expectCopy(
      page,
      ['Set up Daily Intelligence Brief Agent.', 'First proof', 'Queued job', 'Kickoff pack', 'Role playbook', 'Technical admin', 'Send setup request'],
      'template_setup',
      viewport.name,
    )
    const setup = await page.evaluate(() => ({
      title: document.title,
      templateId: document.querySelector('input[name="template_id"]')?.value || '',
      starterKitUrl: document.querySelector('input[name="starter_kit_url"]')?.value || '',
      userRoleMode: document.querySelector('input[name="user_role_mode"]')?.value || '',
      userRoleLabel: document.querySelector('input[name="user_role_label"]')?.value || '',
      userDeviceMode: document.querySelector('input[name="user_device_mode"]')?.value || '',
      userDeviceLabel: document.querySelector('input[name="user_device_label"]')?.value || '',
      firstProofTarget: document.querySelector('input[name="first_proof_target"]')?.value || '',
      intakeJobMode: document.querySelector('input[name="intake_job_mode"]')?.value || '',
      kickoffPackMode: document.querySelector('input[name="kickoff_pack_mode"]')?.value || '',
      firstRunMode: document.querySelector('input[name="first_run_mode"]')?.value || '',
      formAction: document.querySelector('[data-agent-template-setup]')?.getAttribute('action') || '',
      submitVisible: Boolean(document.querySelector('[data-agent-template-setup] button[type="submit"]')?.getBoundingClientRect().height),
      roleCards: document.querySelectorAll('[data-role-playbook-section] [data-role-playbook]').length,
      overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }))
    if (setup.templateId !== 'daily-intelligence-brief') fail('setup_template_id_missing', { viewport: viewport.name, setup })
    if (setup.starterKitUrl !== '/site/agent-templates/daily-intelligence-brief.json') fail('setup_starter_kit_url_missing', { viewport: viewport.name, setup })
    if (setup.userRoleMode !== 'technical_admin' || setup.userRoleLabel !== 'Technical admin') fail('setup_role_mode_hidden_missing', { viewport: viewport.name, setup })
    if (setup.userDeviceMode !== expectedDevice.id || setup.userDeviceLabel !== expectedDevice.label) fail('setup_device_mode_hidden_missing', { viewport: viewport.name, expectedDevice, setup })
    if (!setup.firstProofTarget.includes('One-page morning brief')) fail('setup_first_proof_missing', { viewport: viewport.name, setup })
    if (setup.intakeJobMode !== 'intake_to_first_proof') fail('setup_intake_job_mode_missing', { viewport: viewport.name, setup })
    if (setup.kickoffPackMode !== 'client_kickoff_pack') fail('setup_kickoff_pack_mode_missing', { viewport: viewport.name, setup })
    if (setup.firstRunMode !== 'approval_only') fail('setup_first_run_mode_missing', { viewport: viewport.name, setup })
    if (setup.formAction !== '/api/contact-submissions') fail('setup_form_action_wrong', { viewport: viewport.name, setup })
    if (!setup.submitVisible) fail('setup_submit_not_visible', { viewport: viewport.name, setup })
    if (setup.roleCards < 3) fail('setup_role_playbook_missing', { viewport: viewport.name, setup })
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
        hasSolutionRouteRenderer: html.includes('proofSolutionRoute') && html.includes('Copy solution route'),
        hasImplementationBlueprintRenderer: html.includes('proofImplementationBlueprint') && html.includes('Copy implementation blueprint'),
        hasIntakeJobRenderer: html.includes('proofIntakeJob') && html.includes('Copy intake job'),
        hasClientKickoffRenderer: html.includes('proofClientKickoff') && html.includes('Copy kickoff pack'),
        hasChecklistRenderer: html.includes("proofList('Checklist'"),
        hasAcceptanceRenderer: html.includes("proofList('Acceptance tests'"),
        hasBuyerReplyRenderer: html.includes('proofBuyerReply') && html.includes('Copy buyer reply'),
        hasProofDeliveryRenderer: html.includes('proofDeliveryPacket') && html.includes('Copy proof packet'),
        hasPilotCloseRenderer: html.includes('pilotClosePacket') && html.includes('Copy pilot packet'),
        hasPilotOrderRoomRenderer: html.includes('pilotOrderRoom') && html.includes('Copy payment request') && html.includes('Copy owner activation packet'),
        hasWorkspaceHandoffRenderer: html.includes('Copy workspace manifest') && html.includes('Copy workspace handoff') && html.includes('Copy first run queue') && html.includes('Create private workspace') && html.includes('startPrivateWorkspace') && html.includes('Prepare first-run acceptance') && html.includes('prepareFirstRunAcceptance') && html.includes('Record owner accepted') && html.includes('recordOwnerAcceptance') && html.includes('Record connector policy') && html.includes('recordConnectorPolicy') && html.includes('Prepare autopilot approval queue') && html.includes('prepareProductionApprovalQueue') && html.includes('Prepare enterprise delivery pack') && html.includes('prepareEnterpriseDeliveryPack'),
        hasCustomerSuccessRenderer: html.includes('Prepare customer success desk') && html.includes('prepareCustomerSuccessDesk') && html.includes('Copy customer success desk') && html.includes('Copy support ticket queue') && html.includes('Copy renewal queue') && html.includes('Copy client update draft'),
        hasRetainerGrowthRenderer: html.includes('Prepare retainer growth offer') && html.includes('prepareRetainerGrowthOffer') && html.includes('Copy retainer growth offer') && html.includes('Copy retainer options') && html.includes('Copy retainer invoice draft') && html.includes('Copy retainer email draft'),
        hasRetainerPaymentRenderer: html.includes('Record retainer payment proof') && html.includes('recordRetainerPaymentProof') && html.includes('Copy retainer payment record') && html.includes('Copy retainer payment ledger') && html.includes('Copy MRR summary'),
        hasSalesAutopilotDraftRenderer: html.includes('salesAutopilotDraft') && html.includes('Autopilot draft artifact') && html.includes('Copy autopilot draft') && html.includes('recordAutopilotDraftApproval') && html.includes('Approve autopilot draft') && html.includes('Request draft changes') && html.includes('data-autopilot-draft-type') && html.includes('autopilot_draft_packet'),
        hasAutopilotCommandRenderer: html.includes('renderAutopilotCommandBoard') && html.includes('Autopilot command board') && html.includes('Approval fallback ledger') && html.includes('approval-ledger') && html.includes('Copy autopilot command queue') && html.includes('Copy autopilot daily brief'),
        hasBehaviorSummaryRenderer: html.includes('renderBehaviorSummaryBoard') && html.includes('Behavior summary') && html.includes('behavior-summary-board') && html.includes('/api/behavior-events?summary=1') && html.includes('Adaptation queue'),
        hasFailoverReportRenderer: html.includes('renderDatastoreFailoverReport') && html.includes('Datastore failover report') && html.includes('datastore-failover-report') && html.includes('zero_until_payment_proof'),
        hasActivationCockpitRenderer: html.includes('renderActivationCockpit') && html.includes('Activation cockpit') && html.includes('operator-activation-cockpit') && html.includes('data-activation-command') && html.includes('payment_proof_gate') && html.includes('workspace_start_gate'),
        hasRevenueProofBoardRenderer: html.includes('renderRevenueProofBoard') && html.includes('Revenue proof board') && html.includes('Copy revenue payment ledger') && html.includes('Copy next cash actions'),
        hasOrderRoomPersistenceControls: html.includes('persistOrderRoomState') && html.includes('Save scope approval') && html.includes('Save payment proof'),
        hasSampleData: html.includes('samplePipelineData') && html.includes('No lead was created'),
        overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      }
    })
    if (operator.title !== 'Operator Console | SUPERMEGA.dev') fail('operator_title_not_current', { viewport: viewport.name, operator })
    if (!operator.opsKeyVisible || !operator.sampleVisible || !operator.refreshVisible || !operator.runnerVisible) fail('operator_controls_missing', { viewport: viewport.name, operator })
    if (!operator.hasStarterKitRenderer || !operator.hasSolutionRouteRenderer || !operator.hasImplementationBlueprintRenderer || !operator.hasIntakeJobRenderer || !operator.hasClientKickoffRenderer || !operator.hasChecklistRenderer || !operator.hasAcceptanceRenderer || !operator.hasBuyerReplyRenderer || !operator.hasProofDeliveryRenderer || !operator.hasPilotCloseRenderer || !operator.hasPilotOrderRoomRenderer || !operator.hasWorkspaceHandoffRenderer || !operator.hasCustomerSuccessRenderer || !operator.hasRetainerGrowthRenderer || !operator.hasRetainerPaymentRenderer || !operator.hasSalesAutopilotDraftRenderer || !operator.hasAutopilotCommandRenderer || !operator.hasBehaviorSummaryRenderer || !operator.hasFailoverReportRenderer || !operator.hasActivationCockpitRenderer || !operator.hasRevenueProofBoardRenderer || !operator.hasOrderRoomPersistenceControls || !operator.hasSampleData) fail('operator_first_proof_renderer_missing', { viewport: viewport.name, operator })
    if (operator.overflowX > 0) fail('operator_horizontal_overflow', { viewport: viewport.name, operator })
    await page.click('#load-sample')
    await expectCopy(
      page,
      ['Sample Daily Intelligence Brief first proof', 'Behavior summary', 'signals 24h', 'Top templates', 'daily-intelligence-brief', 'Adaptation queue', 'lead_form_submitted', 'operator_summary_no_ip_user_agent_or_raw_payloads', 'Datastore failover report', 'Blob fallback active', 'blob_queue_approval_only', 'client onboarding allowed', 'zero_until_payment_proof', 'Activation cockpit', 'One-click activation runbook', 'payment_proof_gate', 'workspace_start_gate', 'customer_success_gate', 'retainer_gate', 'Real MRR stays 0 until payment proof', 'Autopilot command board', 'approval_gated_autopilot', 'Top money commands', 'action queue sample_private_queue', 'Approval fallback ledger', 'sample_private_ledger', 'Copy autopilot command queue', 'Copy autopilot daily brief', 'cash_reconciliation', 'first_proof_delivery', 'Autopilot draft artifact', 'source_request_packet', 'approval pending', 'Copy autopilot draft', 'Approve autopilot draft', 'Request draft changes', 'No external send from the runner', 'Revenue proof board', 'Proof-backed MRR', 'Bank verified', 'Needs bank check', 'Copy revenue payment ledger', 'Copy next cash actions', 'Open starter kit', 'Solution route', 'Copy solution route', 'Implementation blueprint', 'Copy implementation blueprint', 'Intake job packet', 'Copy intake job', 'Client kickoff pack', 'Copy kickoff pack', 'Checklist', 'Acceptance tests', 'Buyer reply draft', 'Copy buyer reply', 'Proof delivery packet', 'Copy proof packet', 'Pilot close packet', 'Copy pilot packet', 'Paid pilot order room', 'Copy payment request', 'Copy payment ledger', 'Copy order ledger', 'Copy pilot start checklist', 'Copy owner activation packet', 'Copy owner action queue', 'Copy activation JSON', 'Copy workspace manifest', 'Copy workspace handoff', 'Copy first run queue', 'Copy customer success desk', 'Copy support ticket queue', 'Copy customer value ledger', 'Copy renewal queue', 'Copy client update draft', 'Copy retainer growth offer', 'Copy retainer options', 'Copy retainer decision ledger', 'Copy next module roadmap', 'Copy retainer invoice draft', 'Copy retainer email draft', 'Copy retainer payment record', 'Copy retainer payment ledger', 'Copy MRR summary', 'Save scope approval', 'Save payment proof', 'Create private workspace', 'Prepare first-run acceptance', 'Record owner accepted', 'Record changes requested', 'Record connector policy', 'Prepare autopilot approval queue', 'Prepare enterprise delivery pack', 'Prepare customer success desk', 'Prepare retainer growth offer', 'Record retainer payment proof', 'No lead was created'],
      'operator_sample_packet',
      viewport.name,
    )
    const operatorSample = await page.evaluate(() => ({
      renderedActions: document.querySelectorAll('#operator-actions .operator-item').length,
      sampleStatus: document.querySelector('#operator-status')?.textContent || '',
      salesAutopilotDraftText: document.querySelector('#operator-actions .operator-sales-draft')?.textContent || '',
      salesAutopilotDraftPacket: document.querySelector('#operator-actions #sales-autopilot-draft-1')?.value || '',
      salesAutopilotDraftButtons: document.querySelectorAll('#operator-actions .operator-sales-draft .operator-copy').length,
      salesAutopilotApprovalButtons: document.querySelectorAll('#operator-actions .operator-autopilot-approval').length,
      starterLink: document.querySelector('#operator-actions .operator-proof-link')?.getAttribute('href') || '',
      solutionRoute: document.querySelector('#operator-actions #solution-route-0')?.value || '',
      implementationBlueprint: document.querySelector('#operator-actions #implementation-blueprint-0')?.value || '',
      intakeJob: document.querySelector('#operator-actions #intake-job-0')?.value || '',
      clientKickoff: document.querySelector('#operator-actions #client-kickoff-0')?.value || '',
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
      customerSuccessPacket: document.querySelector('#operator-actions #customer-success-0')?.value || '',
      customerSuccessTicketQueue: document.querySelector('#operator-actions #customer-success-ticket-queue-0')?.value || '',
      customerSuccessValueLedger: document.querySelector('#operator-actions #customer-success-value-ledger-0')?.value || '',
      customerSuccessRenewalQueue: document.querySelector('#operator-actions #customer-success-renewal-queue-0')?.value || '',
      customerSuccessClientUpdate: document.querySelector('#operator-actions #customer-success-client-update-0')?.value || '',
      customerSuccessConfig: document.querySelector('#operator-actions #customer-success-config-0')?.value || '',
      retainerGrowthPacket: document.querySelector('#operator-actions #retainer-growth-0')?.value || '',
      retainerOptions: document.querySelector('#operator-actions #retainer-options-0')?.value || '',
      retainerDecisionLedger: document.querySelector('#operator-actions #retainer-decision-ledger-0')?.value || '',
      retainerRoadmap: document.querySelector('#operator-actions #retainer-roadmap-0')?.value || '',
      retainerInvoice: document.querySelector('#operator-actions #retainer-invoice-0')?.value || '',
      retainerEmail: document.querySelector('#operator-actions #retainer-email-0')?.value || '',
      retainerConfig: document.querySelector('#operator-actions #retainer-config-0')?.value || '',
      retainerPaymentPacket: document.querySelector('#operator-actions #retainer-payment-0')?.value || '',
      retainerPaymentLedger: document.querySelector('#operator-actions #retainer-payment-ledger-0')?.value || '',
      retainerMrrSummary: document.querySelector('#operator-actions #retainer-mrr-summary-0')?.value || '',
      autopilotCommandText: document.querySelector('#autopilot-command-board')?.textContent || '',
      autopilotCommandQueue: document.querySelector('#autopilot-command-board #autopilot-command-queue')?.value || '',
      autopilotDailyBrief: document.querySelector('#autopilot-command-board #autopilot-daily-brief')?.value || '',
      autopilotCopyButtons: document.querySelectorAll('#autopilot-command-board .operator-copy').length,
      behaviorSummaryText: document.querySelector('#behavior-summary-board')?.textContent || '',
      failoverReportText: document.querySelector('#datastore-failover-report')?.textContent || '',
      activationCockpitText: document.querySelector('#operator-activation-cockpit')?.textContent || '',
      activationButtons: document.querySelectorAll('#operator-activation-cockpit [data-activation-command]').length,
      revenueProofBoardText: document.querySelector('#revenue-proof-board')?.textContent || '',
      revenuePaymentLedger: document.querySelector('#revenue-proof-board #revenue-payment-ledger')?.value || '',
      revenueNextCashActions: document.querySelector('#revenue-proof-board #revenue-next-cash-actions')?.value || '',
      revenueCopyButtons: document.querySelectorAll('#revenue-proof-board .operator-copy').length,
      copyButtons: document.querySelectorAll('#operator-actions .operator-copy').length,
      stateButtons: document.querySelectorAll('#operator-actions .operator-state').length,
      workspaceButtons: document.querySelectorAll('#operator-actions .operator-workspace-start').length,
      acceptanceButtons: document.querySelectorAll('#operator-actions .operator-acceptance-prepare').length,
      ownerAcceptanceButtons: document.querySelectorAll('#operator-actions .operator-owner-acceptance').length,
      connectorPolicyButtons: document.querySelectorAll('#operator-actions .operator-connector-policy').length,
      productionApprovalButtons: document.querySelectorAll('#operator-actions .operator-production-approval').length,
      enterpriseDeliveryButtons: document.querySelectorAll('#operator-actions .operator-enterprise-delivery').length,
      customerSuccessButtons: document.querySelectorAll('#operator-actions .operator-customer-success').length,
      retainerGrowthButtons: document.querySelectorAll('#operator-actions .operator-retainer-growth').length,
      retainerPaymentButtons: document.querySelectorAll('#operator-actions .operator-retainer-payment').length,
      stateText: document.querySelector('#operator-actions .operator-order-room')?.textContent || '',
      overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }))
    if (operatorSample.renderedActions !== 2) fail('operator_sample_action_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.sampleStatus.includes('sample_loaded')) fail('operator_sample_status_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.salesAutopilotDraftText.includes('Autopilot draft artifact') || !operatorSample.salesAutopilotDraftText.includes('source_request_packet') || !operatorSample.salesAutopilotDraftText.includes('sent no')) fail('operator_sample_sales_autopilot_draft_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.salesAutopilotDraftPacket.includes('source request packet') || !operatorSample.salesAutopilotDraftPacket.includes('No external send from the runner') || !operatorSample.salesAutopilotDraftPacket.includes('owner approval')) fail('operator_sample_sales_autopilot_packet_missing', { viewport: viewport.name, operatorSample })
    if (operatorSample.salesAutopilotDraftButtons < 1) fail('operator_sample_sales_autopilot_copy_missing', { viewport: viewport.name, operatorSample })
    if (operatorSample.salesAutopilotApprovalButtons < 2) fail('operator_sample_sales_autopilot_approval_controls_missing', { viewport: viewport.name, operatorSample })
    if (operatorSample.starterLink !== '/site/agent-templates/daily-intelligence-brief.json') fail('operator_sample_starter_link_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.solutionRoute.includes('solution route') || !operatorSample.solutionRoute.includes('decision_brief_workcell') || !operatorSample.solutionRoute.includes('Premium delivery controls')) fail('operator_sample_solution_route_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.implementationBlueprint.includes('implementation blueprint') || !operatorSample.implementationBlueprint.includes('Acceptance gates') || !operatorSample.implementationBlueprint.includes('Enterprise controls')) fail('operator_sample_implementation_blueprint_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.intakeJob.includes('intake-to-first-proof job') || !operatorSample.intakeJob.includes('Source manifest')) fail('operator_sample_intake_job_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.clientKickoff.includes('client kickoff pack') || !operatorSample.clientKickoff.includes('First 48 hours')) fail('operator_sample_client_kickoff_missing', { viewport: viewport.name, operatorSample })
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
    if (!operatorSample.customerSuccessPacket.includes('customer_success_desk_ready') || !operatorSample.customerSuccessPacket.includes('30-day cadence')) fail('operator_sample_customer_success_packet_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.customerSuccessTicketQueue.includes('onboarding_blocker')) fail('operator_sample_customer_success_ticket_queue_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.customerSuccessValueLedger.includes('renewal_reason')) fail('operator_sample_customer_success_value_ledger_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.customerSuccessRenewalQueue.includes('decide_retainer')) fail('operator_sample_customer_success_renewal_queue_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.customerSuccessClientUpdate.includes('draft - review before sending')) fail('operator_sample_customer_success_client_update_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.customerSuccessConfig.includes('"managed_ai_agent_customer_success"')) fail('operator_sample_customer_success_config_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.retainerGrowthPacket.includes('retainer_growth_offer_ready') || !operatorSample.retainerGrowthPacket.includes('Real MRR delta: 0')) fail('operator_sample_retainer_growth_packet_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.retainerOptions.includes('growth_operator_retainer')) fail('operator_sample_retainer_options_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.retainerDecisionLedger.includes('approve_retainer_quote')) fail('operator_sample_retainer_decision_ledger_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.retainerRoadmap.includes('approval_inbox')) fail('operator_sample_retainer_roadmap_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.retainerInvoice.includes('OWNER_APPROVED_RETAINER_QUOTE_REQUIRED')) fail('operator_sample_retainer_invoice_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.retainerEmail.includes('managed AI-agent workcell')) fail('operator_sample_retainer_email_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.retainerConfig.includes('"evidence_gated_retainer_growth"')) fail('operator_sample_retainer_config_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.retainerPaymentPacket.includes('retainer_payment_proof_recorded') || !operatorSample.retainerPaymentPacket.includes('Normalized MRR delta MMK: 900000')) fail('operator_sample_retainer_payment_packet_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.retainerPaymentLedger.includes('SAMPLE-PAYMENT-PROOF') || !operatorSample.retainerPaymentLedger.includes('not_bank_verified')) fail('operator_sample_retainer_payment_ledger_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.retainerMrrSummary.includes('"real_mrr_delta": 900000') || !operatorSample.retainerMrrSummary.includes('"payment_proof_attached"')) fail('operator_sample_retainer_mrr_summary_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.autopilotCommandText.includes('Autopilot command board') || !operatorSample.autopilotCommandText.includes('commands 3') || !operatorSample.autopilotCommandText.includes('owner gates 3')) fail('operator_sample_autopilot_board_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.autopilotCommandQueue.includes('cash_reconciliation') || !operatorSample.autopilotCommandQueue.includes('draft_only_until_owner_approval')) fail('operator_sample_autopilot_queue_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.autopilotDailyBrief.includes('Autopilot daily money brief') || !operatorSample.autopilotDailyBrief.includes('approval_gated_autopilot')) fail('operator_sample_autopilot_brief_missing', { viewport: viewport.name, operatorSample })
    if (operatorSample.autopilotCopyButtons < 2) fail('operator_sample_autopilot_copy_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.behaviorSummaryText.includes('Behavior summary') || !operatorSample.behaviorSummaryText.includes('daily-intelligence-brief') || !operatorSample.behaviorSummaryText.includes('Adaptation queue') || !operatorSample.behaviorSummaryText.includes('operator_summary_no_ip_user_agent_or_raw_payloads')) fail('operator_sample_behavior_summary_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.failoverReportText.includes('Datastore failover report') || !operatorSample.failoverReportText.includes('Blob fallback active') || !operatorSample.failoverReportText.includes('blob_queue_approval_only') || !operatorSample.failoverReportText.includes('zero_until_payment_proof')) fail('operator_sample_failover_report_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.activationCockpitText.includes('Activation cockpit') || !operatorSample.activationCockpitText.includes('One-click activation runbook') || !operatorSample.activationCockpitText.includes('payment_proof_gate') || !operatorSample.activationCockpitText.includes('workspace_start_gate') || !operatorSample.activationCockpitText.includes('retainer_gate') || operatorSample.activationButtons < 8) fail('operator_sample_activation_cockpit_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.revenueProofBoardText.includes('Proof-backed MRR') || !operatorSample.revenueProofBoardText.includes('900,000 MMK') || !operatorSample.revenueProofBoardText.includes('Needs bank check')) fail('operator_sample_revenue_proof_board_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.revenuePaymentLedger.includes('SAMPLE-PAYMENT-PROOF') || !operatorSample.revenuePaymentLedger.includes('not_bank_verified')) fail('operator_sample_revenue_payment_ledger_missing', { viewport: viewport.name, operatorSample })
    if (!operatorSample.revenueNextCashActions.includes('bank_reconcile_payment_proof') || !operatorSample.revenueNextCashActions.includes('proof_backed_not_bank_verified')) fail('operator_sample_revenue_next_cash_missing', { viewport: viewport.name, operatorSample })
    if (operatorSample.revenueCopyButtons < 2) fail('operator_sample_revenue_copy_missing', { viewport: viewport.name, operatorSample })
    if (operatorSample.copyButtons < 34) fail('operator_sample_copy_missing', { viewport: viewport.name, operatorSample })
    if (operatorSample.stateButtons < 4 || operatorSample.workspaceButtons < 1 || operatorSample.acceptanceButtons < 1 || operatorSample.ownerAcceptanceButtons < 2 || operatorSample.connectorPolicyButtons < 1 || operatorSample.productionApprovalButtons < 1 || operatorSample.enterpriseDeliveryButtons < 1 || operatorSample.customerSuccessButtons < 1 || operatorSample.retainerGrowthButtons < 1 || operatorSample.retainerPaymentButtons < 1 || !operatorSample.stateText.includes('not_created_until_payment_proof')) fail('operator_sample_state_controls_missing', { viewport: viewport.name, operatorSample })
    const solutionRouteCopyButton = page.locator('#operator-actions [data-copy-target="solution-route-0"]')
    await solutionRouteCopyButton.scrollIntoViewIfNeeded()
    await solutionRouteCopyButton.click({ force: true })
    await page.waitForFunction(() => {
      const value = document.querySelector('#operator-status')?.textContent || ''
      return value.includes('solution-route-0') || value.includes('copy_failed')
    }, { timeout: 5000 }).catch(() => undefined)
    const solutionRouteCopyStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!solutionRouteCopyStatus.includes('solution-route-0') || !solutionRouteCopyStatus.includes('Text copied')) fail('operator_sample_solution_route_copy_failed', { viewport: viewport.name, solutionRouteCopyStatus })
    const implementationBlueprintCopyButton = page.locator('#operator-actions [data-copy-target="implementation-blueprint-0"]')
    await implementationBlueprintCopyButton.scrollIntoViewIfNeeded()
    await implementationBlueprintCopyButton.click({ force: true })
    await page.waitForFunction(() => {
      const value = document.querySelector('#operator-status')?.textContent || ''
      return value.includes('implementation-blueprint-0') || value.includes('copy_failed')
    }, { timeout: 5000 }).catch(() => undefined)
    const implementationBlueprintCopyStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!implementationBlueprintCopyStatus.includes('implementation-blueprint-0') || !implementationBlueprintCopyStatus.includes('Text copied')) fail('operator_sample_implementation_blueprint_copy_failed', { viewport: viewport.name, implementationBlueprintCopyStatus })
    const intakeCopyButton = page.locator('#operator-actions [data-copy-target="intake-job-0"]')
    await intakeCopyButton.scrollIntoViewIfNeeded()
    await intakeCopyButton.click({ force: true })
    await page.waitForFunction(() => {
      const value = document.querySelector('#operator-status')?.textContent || ''
      return value.includes('intake-job-0') || value.includes('copy_failed')
    }, { timeout: 5000 }).catch(() => undefined)
    const intakeCopyStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!intakeCopyStatus.includes('intake-job-0') || !intakeCopyStatus.includes('Text copied')) fail('operator_sample_intake_copy_failed', { viewport: viewport.name, intakeCopyStatus })
    const kickoffCopyButton = page.locator('#operator-actions [data-copy-target="client-kickoff-0"]')
    await kickoffCopyButton.scrollIntoViewIfNeeded()
    await kickoffCopyButton.click({ force: true })
    await page.waitForFunction(() => {
      const value = document.querySelector('#operator-status')?.textContent || ''
      return value.includes('client-kickoff-0') || value.includes('copy_failed')
    }, { timeout: 5000 }).catch(() => undefined)
    const kickoffCopyStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!kickoffCopyStatus.includes('client-kickoff-0') || !kickoffCopyStatus.includes('Text copied')) fail('operator_sample_kickoff_copy_failed', { viewport: viewport.name, kickoffCopyStatus })
    const copyButton = page.locator('#operator-actions [data-copy-target="buyer-reply-0"]')
    await copyButton.scrollIntoViewIfNeeded()
    await copyButton.click({ force: true })
    await page.waitForFunction(() => {
      const value = document.querySelector('#operator-status')?.textContent || ''
      return value.includes('buyer-reply-0') || value.includes('copy_failed')
    }, { timeout: 5000 }).catch(() => undefined)
    const copyStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!copyStatus.includes('buyer-reply-0') || !copyStatus.includes('Text copied')) fail('operator_sample_copy_failed', { viewport: viewport.name, copyStatus })
    const salesAutopilotCopyButton = page.locator('#operator-actions [data-copy-target="sales-autopilot-draft-1"]')
    await salesAutopilotCopyButton.scrollIntoViewIfNeeded()
    await salesAutopilotCopyButton.click({ force: true })
    await page.waitForFunction(() => {
      const value = document.querySelector('#operator-status')?.textContent || ''
      return value.includes('sales-autopilot-draft-1') || value.includes('copy_failed')
    }, { timeout: 5000 }).catch(() => undefined)
    const salesAutopilotCopyStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!salesAutopilotCopyStatus.includes('sales-autopilot-draft-1') || !salesAutopilotCopyStatus.includes('Text copied')) fail('operator_sample_sales_autopilot_copy_failed', { viewport: viewport.name, salesAutopilotCopyStatus })
    const salesAutopilotApprovalButton = page.locator('#operator-actions .operator-autopilot-approval').first()
    await salesAutopilotApprovalButton.scrollIntoViewIfNeeded()
    await salesAutopilotApprovalButton.click({ force: true })
    const salesAutopilotApprovalStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!salesAutopilotApprovalStatus.includes('Paste the ops key first.')) fail('operator_sample_sales_autopilot_approval_guard_failed', { viewport: viewport.name, salesAutopilotApprovalStatus })
    const proofCopyButton = page.locator('#operator-actions [data-copy-target="proof-delivery-0"]')
    await proofCopyButton.scrollIntoViewIfNeeded()
    await proofCopyButton.click({ force: true })
    await page.waitForFunction(() => {
      const value = document.querySelector('#operator-status')?.textContent || ''
      return value.includes('proof-delivery-0') || value.includes('copy_failed')
    }, { timeout: 5000 }).catch(() => undefined)
    const proofCopyStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!proofCopyStatus.includes('proof-delivery-0') || !proofCopyStatus.includes('Text copied')) fail('operator_sample_proof_copy_failed', { viewport: viewport.name, proofCopyStatus })
    const pilotCopyButton = page.locator('#operator-actions [data-copy-target="pilot-close-0"]')
    await pilotCopyButton.scrollIntoViewIfNeeded()
    await pilotCopyButton.click({ force: true })
    await page.waitForFunction(() => {
      const value = document.querySelector('#operator-status')?.textContent || ''
      return value.includes('pilot-close-0') || value.includes('copy_failed')
    }, { timeout: 5000 }).catch(() => undefined)
    const pilotCopyStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!pilotCopyStatus.includes('pilot-close-0') || !pilotCopyStatus.includes('Text copied')) fail('operator_sample_pilot_copy_failed', { viewport: viewport.name, pilotCopyStatus })
    const paymentCopyButton = page.locator('#operator-actions [data-copy-target="payment-request-0"]')
    await paymentCopyButton.scrollIntoViewIfNeeded()
    await paymentCopyButton.click({ force: true })
    await page.waitForFunction(() => {
      const value = document.querySelector('#operator-status')?.textContent || ''
      return value.includes('payment-request-0') || value.includes('copy_failed')
    }, { timeout: 5000 }).catch(() => undefined)
    const paymentCopyStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!paymentCopyStatus.includes('payment-request-0') || !paymentCopyStatus.includes('Text copied')) fail('operator_sample_payment_copy_failed', { viewport: viewport.name, paymentCopyStatus })
    const activationCopyButton = page.locator('#operator-actions [data-copy-target="owner-activation-packet-0"]')
    await activationCopyButton.scrollIntoViewIfNeeded()
    await activationCopyButton.click({ force: true })
    await page.waitForFunction(() => {
      const value = document.querySelector('#operator-status')?.textContent || ''
      return value.includes('owner-activation-packet-0') || value.includes('copy_failed')
    }, { timeout: 5000 }).catch(() => undefined)
    const activationCopyStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!activationCopyStatus.includes('owner-activation-packet-0') || !activationCopyStatus.includes('Text copied')) fail('operator_sample_activation_copy_failed', { viewport: viewport.name, activationCopyStatus })
    const customerSuccessCopyButton = page.locator('#operator-actions [data-copy-target="customer-success-0"]')
    await customerSuccessCopyButton.scrollIntoViewIfNeeded()
    await customerSuccessCopyButton.click({ force: true })
    await page.waitForFunction(() => {
      const value = document.querySelector('#operator-status')?.textContent || ''
      return value.includes('customer-success-0') || value.includes('copy_failed')
    }, { timeout: 5000 }).catch(() => undefined)
    const customerSuccessCopyStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!customerSuccessCopyStatus.includes('customer-success-0') || !customerSuccessCopyStatus.includes('Text copied')) fail('operator_sample_customer_success_copy_failed', { viewport: viewport.name, customerSuccessCopyStatus })
    const retainerCopyButton = page.locator('#operator-actions [data-copy-target="retainer-growth-0"]')
    await retainerCopyButton.scrollIntoViewIfNeeded()
    await retainerCopyButton.click({ force: true })
    await page.waitForFunction(() => {
      const value = document.querySelector('#operator-status')?.textContent || ''
      return value.includes('retainer-growth-0') || value.includes('copy_failed')
    }, { timeout: 5000 }).catch(() => undefined)
    const retainerCopyStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!retainerCopyStatus.includes('retainer-growth-0') || !retainerCopyStatus.includes('Text copied')) fail('operator_sample_retainer_growth_copy_failed', { viewport: viewport.name, retainerCopyStatus })
    const retainerPaymentCopyButton = page.locator('#operator-actions [data-copy-target="retainer-payment-0"]')
    await retainerPaymentCopyButton.scrollIntoViewIfNeeded()
    await retainerPaymentCopyButton.click({ force: true })
    await page.waitForFunction(() => {
      const value = document.querySelector('#operator-status')?.textContent || ''
      return value.includes('retainer-payment-0') || value.includes('copy_failed')
    }, { timeout: 5000 }).catch(() => undefined)
    const retainerPaymentCopyStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!retainerPaymentCopyStatus.includes('retainer-payment-0') || !retainerPaymentCopyStatus.includes('Text copied')) fail('operator_sample_retainer_payment_copy_failed', { viewport: viewport.name, retainerPaymentCopyStatus })
    const autopilotCopyButton = page.locator('#autopilot-command-board [data-copy-target="autopilot-command-queue"]')
    await autopilotCopyButton.scrollIntoViewIfNeeded()
    await autopilotCopyButton.click({ force: true })
    await page.waitForFunction(() => {
      const value = document.querySelector('#operator-status')?.textContent || ''
      return value.includes('autopilot-command-queue') || value.includes('copy_failed')
    }, { timeout: 5000 }).catch(() => undefined)
    const autopilotCopyStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!autopilotCopyStatus.includes('autopilot-command-queue') || !autopilotCopyStatus.includes('Text copied')) fail('operator_sample_autopilot_copy_failed', { viewport: viewport.name, autopilotCopyStatus })
    const revenuePaymentCopyButton = page.locator('#revenue-proof-board [data-copy-target="revenue-payment-ledger"]')
    await revenuePaymentCopyButton.scrollIntoViewIfNeeded()
    await revenuePaymentCopyButton.click({ force: true })
    await page.waitForFunction(() => {
      const value = document.querySelector('#operator-status')?.textContent || ''
      return value.includes('revenue-payment-ledger') || value.includes('copy_failed')
    }, { timeout: 5000 }).catch(() => undefined)
    const revenuePaymentCopyStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!revenuePaymentCopyStatus.includes('revenue-payment-ledger') || !revenuePaymentCopyStatus.includes('Text copied')) fail('operator_sample_revenue_payment_copy_failed', { viewport: viewport.name, revenuePaymentCopyStatus })
    const stateButton = page.locator('#operator-actions .operator-state').first()
    await stateButton.scrollIntoViewIfNeeded()
    await stateButton.click({ force: true })
    const stateStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!stateStatus.includes('Paste the ops key first.')) fail('operator_sample_state_guard_failed', { viewport: viewport.name, stateStatus })
    const workspaceButton = page.locator('#operator-actions .operator-workspace-start').first()
    await workspaceButton.scrollIntoViewIfNeeded()
    await workspaceButton.click({ force: true })
    const workspaceStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!workspaceStatus.includes('Paste the ops key first.')) fail('operator_sample_workspace_guard_failed', { viewport: viewport.name, workspaceStatus })
    const acceptanceButton = page.locator('#operator-actions .operator-acceptance-prepare').first()
    await acceptanceButton.scrollIntoViewIfNeeded()
    await acceptanceButton.click({ force: true })
    const acceptanceStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!acceptanceStatus.includes('Paste the ops key first.')) fail('operator_sample_acceptance_guard_failed', { viewport: viewport.name, acceptanceStatus })
    page.once('dialog', async (dialog) => {
      await dialog.dismiss()
    })
    const ownerAcceptanceButton = page.locator('#operator-actions .operator-owner-acceptance').first()
    await ownerAcceptanceButton.scrollIntoViewIfNeeded()
    await ownerAcceptanceButton.click({ force: true })
    const ownerAcceptanceStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!ownerAcceptanceStatus.includes('Paste the ops key first.')) fail('operator_sample_owner_acceptance_guard_failed', { viewport: viewport.name, ownerAcceptanceStatus })
    page.once('dialog', async (dialog) => {
      await dialog.dismiss()
    })
    const connectorPolicyButton = page.locator('#operator-actions .operator-connector-policy').first()
    await connectorPolicyButton.scrollIntoViewIfNeeded()
    await connectorPolicyButton.click({ force: true })
    const connectorPolicyStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!connectorPolicyStatus.includes('Paste the ops key first.')) fail('operator_sample_connector_policy_guard_failed', { viewport: viewport.name, connectorPolicyStatus })
    page.once('dialog', async (dialog) => {
      await dialog.dismiss()
    })
    const productionApprovalButton = page.locator('#operator-actions .operator-production-approval').first()
    await productionApprovalButton.scrollIntoViewIfNeeded()
    await productionApprovalButton.click({ force: true })
    const productionApprovalStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!productionApprovalStatus.includes('Paste the ops key first.')) fail('operator_sample_production_approval_guard_failed', { viewport: viewport.name, productionApprovalStatus })
    page.once('dialog', async (dialog) => {
      await dialog.dismiss()
    })
    const enterpriseDeliveryButton = page.locator('#operator-actions .operator-enterprise-delivery').first()
    await enterpriseDeliveryButton.scrollIntoViewIfNeeded()
    await enterpriseDeliveryButton.click({ force: true })
    const enterpriseDeliveryStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!enterpriseDeliveryStatus.includes('Paste the ops key first.')) fail('operator_sample_enterprise_delivery_guard_failed', { viewport: viewport.name, enterpriseDeliveryStatus })
    page.once('dialog', async (dialog) => {
      await dialog.dismiss()
    })
    const customerSuccessButton = page.locator('#operator-actions .operator-customer-success').first()
    await customerSuccessButton.scrollIntoViewIfNeeded()
    await customerSuccessButton.click({ force: true })
    const customerSuccessStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!customerSuccessStatus.includes('Paste the ops key first.')) fail('operator_sample_customer_success_guard_failed', { viewport: viewport.name, customerSuccessStatus })
    page.once('dialog', async (dialog) => {
      await dialog.dismiss()
    })
    const retainerGrowthButton = page.locator('#operator-actions .operator-retainer-growth').first()
    await retainerGrowthButton.scrollIntoViewIfNeeded()
    await retainerGrowthButton.click({ force: true })
    const retainerGrowthStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!retainerGrowthStatus.includes('Paste the ops key first.')) fail('operator_sample_retainer_growth_guard_failed', { viewport: viewport.name, retainerGrowthStatus })
    page.once('dialog', async (dialog) => {
      await dialog.dismiss()
    })
    const retainerPaymentButton = page.locator('#operator-actions .operator-retainer-payment').first()
    await retainerPaymentButton.scrollIntoViewIfNeeded()
    await retainerPaymentButton.click({ force: true })
    const retainerPaymentStatus = await page.locator('#operator-status').innerText({ timeout: 5000 }).catch(() => '')
    if (!retainerPaymentStatus.includes('Paste the ops key first.')) fail('operator_sample_retainer_payment_guard_failed', { viewport: viewport.name, retainerPaymentStatus })
    if (operatorSample.overflowX > 0) fail('operator_sample_horizontal_overflow', { viewport: viewport.name, operatorSample })
    if (consoleMessages.length) fail('console_messages', { viewport: viewport.name, consoleMessages })

    results.checks[viewport.name] = { home, products, setup, contact, operator, operatorSample }
    await page.close()
  }

  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.close()
}
