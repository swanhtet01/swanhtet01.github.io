import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { buildAgentTemplateStarterKits, buildPublicAgentTemplates, renderAgentTemplateStarterKitMarkdown } from './public_agent_templates.mjs'

const root = process.cwd()
const pricing = JSON.parse(readFileSync(resolve(root, 'pricing.json'), 'utf8'))
const pricingServiceByKey = Object.fromEntries((pricing.services || []).map((s) => [s.key, s]))
const mmk = (raw) => {
  const value = String(raw || '').trim()
  return /MMK/i.test(value) ? value : `${value} MMK`
}
const serviceMmk = (key) => mmk(pricingServiceByKey[key]?.mmk)
const publicAgentTemplates = buildPublicAgentTemplates(pricing)
const publicAgentTemplateStarterKits = buildAgentTemplateStarterKits(publicAgentTemplates)
const outputDir = resolve(root, '.vercel', 'output')
const staticDir = resolve(outputDir, 'static')
const functionsDir = resolve(outputDir, 'functions', 'api')
const nodeFunctionDependencies = [
  'pg',
  'pg-cloudflare',
  'pg-connection-string',
  'pg-int8',
  'pg-pool',
  'pg-protocol',
  'pg-types',
  'pgpass',
  'postgres-array',
  'postgres-bytea',
  'postgres-date',
  'postgres-interval',
  'split2',
  'xtend',
]

const publicPathBlocklist = [/^app(?:\/|$)/i, /^clients(?:\/|$)/i, /^showroom(?:\/|$)/i]
const tenantAssetNameBlocklist = [/yangon/i, /\bytf\b/i, /tyre/i, /Ytf/, /DataFabricPage/, /OwnerBrief/, /Warehouse/]
const tenantContentBlocklist = [
  /Yangon Tyre/i,
  /YANGON_TYRE/,
  /\bytf\b/i,
  /ytf\.supermega\.dev/i,
  /ytf-plant-a\.supermega\.dev/i,
  /isYtfHost/,
  /YTF Industrial/i,
  /YTF Portal/i,
  /YTF Viber/i,
  /YTF WeChat/i,
  /Plant A operations/i,
  /Plant A shared/i,
]
const publicShellAsset = /^assets\/index-[^/]+\.js$/i
const requiredPublicSiteJsonFiles = [
  'agent-tool-stack-radar.json',
  'automated-value-engine.json',
  'autonomous-ops-center.json',
  'client-start-packets.json',
  'commercial-execution-board.json',
  'company-gap-fix-plan.json',
  'gap-closure-control.json',
  'general-products.json',
  'growth-machine.json',
  'open-source-integration-radar.json',
  'open-source-integration-studio.json',
  'pipeline-datastore-options.json',
  'product-activation-readiness.json',
  'product-competitive-review.json',
  'product-domain-audit.json',
  'product-upgrade-plan.json',
  'social-oauth-readiness.json',
  'social-post-queue.json',
  'stripe-activation-plan.json',
  'supermega-100k-growth-plan.json',
  'tool-proof-packs.json',
  'value-intake-router.json',
]
const legacyInitialsMarkHtml = ['<span class="mark">', String.fromCharCode(83, 77), '</span>'].join('')
const signalMarkHtml = '<span class="mark"><img src="/favicon.svg" alt="" /></span>'

async function writeTextFileEnsuringDir(destination, content) {
  const targetDir = dirname(destination)
  await mkdir(targetDir, { recursive: true })
  try {
    await writeFile(destination, content, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
    // OneDrive-backed Windows paths can briefly lose the just-created
    // directory during large static-output rewrites. Recreate and retry once.
    await mkdir(targetDir, { recursive: true })
    await writeFile(destination, content, 'utf8')
  }
}

function normalizePublicProductNames(content) {
  return String(content)
    .replaceAll(legacyInitialsMarkHtml, signalMarkHtml)
    .replace(/\.mark \{([^}]*)\}/g, '.mark {$1}.mark img { width: 100%; height: 100%; display: block; border-radius: inherit; }')
    .replace(/Back Office Back Office Workflow Desk/g, 'Back Office Workflow Desk')
    .replace(/AI Back Office Operator/g, 'Back Office Workflow Desk')
    .replace(/Custom Workflow App/g, 'Document Extraction Ledger')
    .replace(/product-workdesk|product-flowline|product-custom-workflow-app|product-custom-business-app-builder|product-workflow-to-app-builder|product-build-app-from-workflow|product-workflow(?!-to-app-builder)/g, 'product-back-office-workflow-desk')
    .replace(/product-factorydesk|product-plantline|product-factory-operations-app|product-factory-maintenance-quality-app|product-factory-issue-maintenance-tracker|product-factory-issues-maintenance-quality/g, 'product-factory-issues-maintenance-quality')
    .replace(/product-storedesk|product-counterline|product-counter(?!-(overview|payment|queue))|product-restaurant-pos-app|product-restaurant-pos-inventory-app|product-restaurant-pos-stock-tracker|product-restaurant-pos-menu-inventory/g, 'product-restaurant-pos-menu-inventory')
    .replace(/#workdesk|#flowline|#custom-workflow-app|#custom-business-app-builder|#workflow-to-app-builder|#build-app-from-workflow|#workflow(?!-to-app-builder)/g, '#back-office-workflow-desk')
    .replace(/#factorydesk|#plantline|#factory-operations-app|#factory-maintenance-quality-app|#factory-issue-maintenance-tracker|#factory-issues-maintenance-quality/g, '#factory-issues-maintenance-quality')
    .replace(/#storedesk|#counterline|#counter|#restaurant-pos-app|#restaurant-pos-inventory-app|#restaurant-pos-stock-tracker|#restaurant-pos-menu-inventory/g, '#restaurant-pos-menu-inventory')
    .replace(/id="workdesk"|id="flowline"|id="workflow"|id="custom-workflow-app"|id="custom-business-app-builder"|id="workflow-to-app-builder"|id="build-app-from-workflow"/g, 'id="back-office-workflow-desk"')
    .replace(/id="factorydesk"|id="plantline"|id="factory-operations-app"|id="factory-maintenance-quality-app"|id="factory-issue-maintenance-tracker"|id="factory-issues-maintenance-quality"/g, 'id="factory-issues-maintenance-quality"')
    .replace(/id="storedesk"|id="counterline"|id="counter"|id="restaurant-pos-app"|id="restaurant-pos-inventory-app"|id="restaurant-pos-stock-tracker"|id="restaurant-pos-menu-inventory"/g, 'id="restaurant-pos-menu-inventory"')
    .replace(/\?package=workdesk|\?package=flowline|\?package=custom-workflow-app|\?package=custom-business-app-builder|\?package=workflow-to-app-builder|\?package=back-office-workflow-desk|\?package=workflow(?!-to-app-builder)/g, '?package=back-office-workflow-desk')
    .replace(/\?package=factorydesk|\?package=plantline|\?package=factory-operations-app|\?package=factory-maintenance-quality-app|\?package=factory-issue-maintenance-tracker|\?package=factory-issues-maintenance-quality/g, '?package=factory-issues-maintenance-quality')
    .replace(/\?package=storedesk|\?package=counterline|\?package=counter|\?package=restaurant-pos-app|\?package=restaurant-pos-inventory-app|\?package=restaurant-pos-stock-tracker|\?package=restaurant-pos-menu-inventory/g, '?package=restaurant-pos-menu-inventory')
    .replace(/\?package=agentops|\?package=back-office-workflow-desk|\?package=ai-agent-operator|\?package=ai-back-office|\?package=back-office-operator|\?package=openclaw/g, '?package=back-office-workflow-desk')
    .replace(/(['"])workdesk\1\s*:/g, "'back-office-workflow-desk':")
    .replace(/(['"])factorydesk\1\s*:/g, "'factory-issues-maintenance-quality':")
    .replace(/(['"])storedesk\1\s*:/g, "'restaurant-pos-menu-inventory':")
    .replace(/demo=workdesk|demo=ai-workflow-desk/g, 'proof=ai-workflow-desk')
    .replace(/demo=factorydesk|demo=operations-digital-twin/g, 'proof=operations-digital-twin')
    .replace(/demo=storedesk|demo=restaurant-group-os/g, 'proof=restaurant-group-os')
    .replace(/%2Fapp%2Fworkdesk|%2Fapp%2Fai-workflow-desk/g, '%2Fapp%2Fcustom-workflow')
    .replace(/%2Fapp%2Ffactorydesk|%2Fapp%2Foperations-twin|%2Fapp%2Fdigital-twin/g, '%2Fapp%2Ffactory-operations')
    .replace(/%2Fapp%2Fstoredesk|%2Fapp%2Frestaurant-os/g, '%2Fapp%2Frestaurant-pos')
    .replace(/WorkDesk|Flow App|Flowline|Workflow OS|Custom Business App Builder|Workflow-to-App Builder|Build an App From One Workflow|Workflow Desk/g, 'Back Office Workflow Desk')
    .replace(/FactoryDesk|Plant App|Plantline|Factory OS|Industrial Plant OS|EasyERP|EasyOps|Factory Twin OS|Factory Maintenance & Quality App|Factory Issue & Maintenance Tracker|Track Factory Issues, Maintenance & Quality/g, 'Factory Operations App')
    .replace(/StoreDesk|Counter App|Counterline|Shopfront OS|EasyPOS|Restaurant POS App|Restaurant POS & Inventory App|Restaurant POS & Stock Tracker|Run Restaurant POS, Menu & Inventory/g, 'Restaurant POS + Inventory')
    .replace(/AgentOps Toolbox|AI Agent Operator|AI Back Office(?! Operator)|OpenClaw Operator/g, 'Back Office Workflow Desk')
    .replace(/\/site\/shots\/live-product-custom-workflow-app\.png|\/site\/shots\/live-product-custom-business-app-builder\.png|\/site\/shots\/live-product-workflow-to-app-builder\.png|\/site\/shots\/live-product-back-office-workflow-desk\.png/g, '/site/shots/live-product-build-app-from-workflow.png')
    .replace(/\/site\/shots\/live-product-factory-operations-app\.png|\/site\/shots\/live-product-factory-maintenance-quality-app\.png|\/site\/shots\/live-product-factory-issue-maintenance-tracker\.png/g, '/site/shots/live-product-factory-issues-maintenance-quality.png')
    .replace(/\/site\/shots\/live-product-restaurant-pos-app\.png|\/site\/shots\/live-product-restaurant-pos-inventory-app\.png|\/site\/shots\/live-product-restaurant-pos-stock-tracker\.png/g, '/site/shots/live-product-restaurant-pos-menu-inventory.png')
    .replace(/\/site\/shots\/product-custom-business-app-builder\.svg|\/site\/shots\/product-custom-workflow-app\.svg|\/site\/shots\/product-workflow-to-app-builder\.svg/g, '/site/shots/product-build-app-from-workflow.svg')
    .replace(/\/site\/shots\/product-factory-maintenance-quality-app\.svg|\/site\/shots\/product-factory-operations-app\.svg|\/site\/shots\/product-factory-issue-maintenance-tracker\.svg/g, '/site/shots/product-factory-issues-maintenance-quality.svg')
    .replace(/\/site\/shots\/product-restaurant-pos-inventory-app\.svg|\/site\/shots\/product-restaurant-pos-app\.svg|\/site\/shots\/product-restaurant-pos-stock-tracker\.svg/g, '/site/shots/product-restaurant-pos-menu-inventory.svg')
    .replace(/Back Office (?:Back Office )+Workflow Desk/g, 'Back Office Workflow Desk')
    // FINAL CANONICALIZATION — collapse every legacy/variant product name to the only 3 public
    // names (CEO-ratified, pricing.json taxonomy: DeskPOS · Factory & Operations App · Custom
    // Solutions & AI Agents). Runs last so nothing slips through, on every normalized page.
    .replace(/Restaurant POS \+ Inventory|Restaurant POS and Inventory/g, 'DeskPOS')
    .replace(/DeskPOS\s*[—–-]\s*Point of Sale/g, 'DeskPOS')
    .replace(/Factory Operations App/g, 'Factory & Operations App')
    .replace(/Document Extraction Ledger/g, 'Custom Solutions & AI Agents')
    .replace(/Back Office AI Desk|Back Office Workflow Desk/g, 'Custom Solutions & AI Agents')
    // Retire the old tagline. Header sub-mark → clean wordmark; every other use → the one CEO line.
    .replace(/<small>Cast real work into software<\/small>/g, '')
    .replace(/Cast real work into software\.?/g, 'Stop running your business on Viber & Excel.')
}

const publicMachineHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex,nofollow" />
    <title>Sales Machine | SUPERMEGA.dev</title>
    <meta name="description" content="Public-safe SuperMega commercial machine status." />
    <meta name="theme-color" content="#07111f" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>
      :root { color-scheme: dark; --bg:#07111f; --panel:rgba(255,255,255,.075); --line:rgba(255,255,255,.15); --text:#f6fbff; --muted:#a9b8c7; --cyan:#72f3ff; --blue:#4f8cff; --green:#8cf0b8; --ink:#06101d; }
      * { box-sizing: border-box; }
      body { margin:0; min-height:100vh; background: radial-gradient(circle at 80% 8%, rgba(114,243,255,.2), transparent 28rem), radial-gradient(circle at 8% 24%, rgba(79,140,255,.18), transparent 28rem), linear-gradient(135deg,#07111f,#02050b); color:var(--text); font-family:"Aptos","Segoe UI Variable","Segoe UI",system-ui,sans-serif; -webkit-font-smoothing: antialiased; }
      main { width:min(1120px, calc(100% - 32px)); margin:0 auto; padding:28px 0 56px; }
      header { display:flex; align-items:center; justify-content:space-between; gap:18px; margin-bottom:28px; }
      a { color:inherit; text-decoration:none; }
      .brand { display:flex; align-items:center; gap:12px; font-weight:950; letter-spacing:-.04em; }
      .mark { display:grid; place-items:center; width:44px; height:44px; border-radius:15px; background:linear-gradient(135deg,#12375d,#08111f 58%,#02050b); border:1px solid var(--line); color:#dffbff; }
      .btn { border:1px solid var(--line); border-radius:999px; padding:12px 16px; background:rgba(255,255,255,.07); font-weight:900; }
      .hero { display:grid; grid-template-columns:minmax(0, .9fr) minmax(320px, 1.1fr); gap:18px; align-items:stretch; }
      .panel { border:1px solid var(--line); border-radius:30px; background:var(--panel); box-shadow: inset 0 1px 0 rgba(255,255,255,.14), 0 34px 90px rgba(0,0,0,.28); backdrop-filter: blur(20px); }
      .intro { padding:clamp(24px, 5vw, 48px); }
      h1 { margin:0; max-width:9ch; font-size:clamp(64px, 12vw, 132px); line-height:.78; letter-spacing:-.095em; }
      p { margin:18px 0 0; color:var(--muted); font-size:clamp(17px, 2vw, 22px); line-height:1.48; max-width:34rem; }
      .status { display:grid; gap:12px; padding:18px; }
      .metric { display:grid; grid-template-columns:1fr auto; gap:12px; align-items:end; border:1px solid rgba(255,255,255,.12); border-radius:22px; padding:18px; background:rgba(3,8,16,.34); }
      .metric span { display:block; color:var(--cyan); font-size:11px; font-weight:950; letter-spacing:.16em; text-transform:uppercase; }
      .metric strong { display:block; margin-top:8px; font-size:clamp(28px, 4vw, 52px); letter-spacing:-.06em; }
      .grid { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:12px; margin-top:14px; }
      .card { border:1px solid rgba(255,255,255,.12); border-radius:22px; background:rgba(255,255,255,.055); padding:18px; min-height:130px; }
      .card span, .next span { color:var(--cyan); font-size:11px; font-weight:950; letter-spacing:.16em; text-transform:uppercase; }
      .card strong { display:block; margin-top:10px; font-size:28px; letter-spacing:-.05em; }
      .next { margin-top:14px; border:1px solid rgba(114,243,255,.22); border-radius:26px; padding:22px; background:linear-gradient(135deg,rgba(79,140,255,.18),rgba(114,243,255,.12)); }
      .next strong { display:block; margin-top:8px; font-size:clamp(26px, 4vw, 48px); line-height:.92; letter-spacing:-.065em; }
      .list { display:grid; gap:10px; margin-top:14px; }
      .row { display:grid; grid-template-columns:auto 1fr auto; gap:12px; align-items:center; border:1px solid rgba(255,255,255,.12); border-radius:18px; padding:14px; background:rgba(3,8,16,.35); }
      .dot { width:10px; height:10px; border-radius:999px; background:var(--green); box-shadow:0 0 24px rgba(140,240,184,.55); }
      .row strong { display:block; text-transform:capitalize; }
      .row small { display:block; margin-top:3px; color:var(--muted); font-weight:760; }
      .pill { border-radius:999px; padding:8px 10px; color:#dffbff; background:rgba(114,243,255,.12); font-size:11px; font-weight:950; }
      .foot { margin-top:16px; color:var(--muted); font-size:13px; font-weight:800; }
      @media (max-width: 840px) { header, .hero { grid-template-columns:1fr; } header { align-items:flex-start; } h1 { font-size:clamp(64px, 21vw, 92px); } .grid { grid-template-columns:1fr; } }
    </style>
  </head>
  <body>
    <main>
      <header>
        <a class="brand" href="/"><span class="mark"><img src="/favicon.svg" alt="" /></span><span>SUPERMEGA.dev</span></a>
        <a class="btn" href="/contact/">Contact</a>
      </header>
      <section class="hero">
        <article class="panel intro">
          <h1>Sales machine.</h1>
          <p>No laptop dependency. The website captures leads, the daily agent writes the brief, Supabase keeps the evidence, and email delivers the next actions.</p>
          <div class="grid">
            <div class="card"><span>Leads 24h</span><strong data-leads-24h>...</strong></div>
            <div class="card"><span>Leads 7d</span><strong data-leads-7d>...</strong></div>
            <div class="card"><span>Latest run</span><strong data-latest-run>...</strong></div>
          </div>
          <div class="next"><span>Next action</span><strong data-next-action>Loading the machine...</strong></div>
          <p class="foot">Source: <code>/api/commercial-control/status</code>. Public-safe: no names, emails, or phone numbers.</p>
        </article>
        <aside class="panel status" aria-label="Commercial machine status">
          <div class="metric"><div><span>Cloud status</span><strong data-cloud-status>Checking</strong></div><span class="pill">Live</span></div>
          <div class="list" data-machine-list></div>
          <div class="list" data-lead-list></div>
        </aside>
      </section>
    </main>
    <script>
      const setText = (selector, value) => {
        const element = document.querySelector(selector);
        if (element) element.textContent = value || 'Ã¢â‚¬â€';
      };
      const safeDate = (value) => value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No run yet';
      async function loadMachine() {
        const response = await fetch('/api/commercial-control/status', { headers: { accept: 'application/json' }, cache: 'no-store' });
        const payload = await response.json();
        if (payload.status !== 'ready') throw new Error(payload.reason || 'not_ready');
        setText('[data-cloud-status]', 'Ready');
        setText('[data-leads-24h]', String(payload.leads.last_24h));
        setText('[data-leads-7d]', String(payload.leads.last_7d));
        setText('[data-latest-run]', payload.sales_runs.latest?.run_id ? payload.sales_runs.latest.run_id.replace('SALESRUN-', '').slice(0, 6) : 'None');
        setText('[data-next-action]', payload.next_action);
        document.querySelector('[data-machine-list]').innerHTML = Object.entries(payload.machine).map(([key, value]) => '<div class="row"><span class="dot"></span><div><strong>' + key.replaceAll('_', ' ') + '</strong><small>' + value + '</small></div><span class="pill">OK</span></div>').join('');
        document.querySelector('[data-lead-list]').innerHTML = (payload.leads.recent || []).slice(0, 4).map((lead) => '<div class="row"><span class="dot"></span><div><strong>' + lead.lead_id + '</strong><small>' + safeDate(lead.submitted_at) + ' / ' + lead.requested_package + '</small></div><span class="pill">' + lead.lead_stage + '</span></div>').join('') || '<div class="row"><span class="dot"></span><div><strong>No recent leads</strong><small>Use the QR/contact flow to create the next one.</small></div><span class="pill">Ready</span></div>';
      }
      loadMachine().catch((error) => {
        setText('[data-cloud-status]', 'Blocked');
        setText('[data-next-action]', 'Check Vercel env, Supabase, and Resend before running outreach.');
        document.querySelector('[data-machine-list]').innerHTML = '<div class="row"><span class="dot"></span><div><strong>Status load failed</strong><small>' + String(error.message || error).slice(0, 120) + '</small></div><span class="pill">Check</span></div>';
      });
    </script>
  </body>
</html>
`

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const publicToolCopy = {
  'market-intel-agent-room': {
    name: 'Market Intel',
    tagline: 'Research a company, sector, competitor, or decision.',
    input: 'company, sector, competitor, or question',
    output: 'brief, sources, risks, and next move',
  },
  'document-intake-data-cleanroom': {
    name: 'File Cleanroom',
    tagline: 'Turn messy files into reviewable records and tasks.',
    input: 'Drive folder, PDFs, CSV, screenshots, or email batch',
    output: 'clean table, missing fields, and action list',
  },
  'board-pack-report-builder': {
    name: 'Report Builder',
    tagline: 'Make a useful report from raw notes, sheets, and updates.',
    input: 'notes, spreadsheet, KPI list, or weekly update',
    output: 'management brief, chart ideas, and slide outline',
  },
}

const publicProductIds = ['market-intel-agent-room', 'document-intake-data-cleanroom', 'board-pack-report-builder']
const publicProductIdSet = new Set(publicProductIds)

function publicProductName(id, fallback) {
  const normalizedId = String(id || '').replace(/-proof-pack$/, '')
  return publicToolCopy[normalizedId]?.name || fallback
}

function renderPublicAgentTemplateCards() {
  return publicAgentTemplates
    .map((template) => {
      const inputs = template.setupInputs.slice(0, 4).map((input) => `<li>${escapeHtml(input)}</li>`).join('')
      return `<article class="template-card" id="${escapeHtml(template.id)}">
                <small>${escapeHtml(template.status)} / ${escapeHtml(template.sourceCategory)}</small>
                <h3>${escapeHtml(template.name)}</h3>
                <p>${escapeHtml(template.promise)}</p>
                <strong>${escapeHtml(template.pricingLabel)}</strong>
                <span>First proof: ${escapeHtml(template.firstProof)}</span>
                <ul>${inputs}</ul>
                <a class="btn secondary" href="/agent-templates/${encodeURIComponent(template.id)}/setup/">Start this template</a>
                <a class="link" href="/agent-templates/${encodeURIComponent(template.id)}/">View setup kit</a>
              </article>`
    })
    .join('\n')
}

function contactTemplatePackagesJson() {
  const packages = Object.fromEntries(
    publicAgentTemplates.map((template) => [
      template.id,
      {
        id: template.id,
        name: template.contactPackage,
        heading: 'Start with this template.',
        lead: `${template.name} - ${template.pricingLabel}. ${template.buyer}.`,
        placeholder: template.placeholder,
        price: template.pricingLabel,
        firstProof: template.firstProof,
        productArea: template.productArea,
        sourceCategory: template.sourceCategory,
        sourceArea: template.sourceArea,
        status: template.status,
        next: template.next,
        starterKitUrl: `/site/agent-templates/${template.id}.json`,
      },
    ]),
  )
  return JSON.stringify(packages).replaceAll('<', '\\u003c')
}

async function writePublicAgentTemplateStarterKits() {
  const directory = resolve(staticDir, 'site', 'agent-templates')
  const index = publicAgentTemplateStarterKits.map((kit) => ({
    id: kit.id,
    name: kit.name,
    status: kit.status,
    buyer: kit.buyer,
    price_hint: kit.offer.price_hint,
    first_proof: kit.offer.first_proof,
    json_url: `/site/agent-templates/${kit.id}.json`,
    markdown_url: `/site/agent-templates/${kit.id}.md`,
    contact_url: kit.contact_url,
  }))
  await mkdir(directory, { recursive: true })
  await writeTextFileEnsuringDir(
    resolve(directory, 'index.json'),
    `${JSON.stringify({ version: '2026-06-29', templates: index }, null, 2)}\n`,
  )
  for (const kit of publicAgentTemplateStarterKits) {
    await writeTextFileEnsuringDir(resolve(directory, `${kit.id}.json`), `${JSON.stringify(kit, null, 2)}\n`)
    await writeTextFileEnsuringDir(resolve(directory, `${kit.id}.md`), renderAgentTemplateStarterKitMarkdown(kit))
  }
}

function renderToolCards(products) {
  return products
    .map((product) => {
      const display = publicToolCopy[product.id] || {
        name: product.name,
        tagline: product.advertise_hook || product.one_liner,
        input: product.demo_input,
        output: product.output,
      }
      const useCases = (Array.isArray(product.use_cases) ? product.use_cases.slice(0, 2) : [])
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join('')
      return `<article class="tool" id="${escapeHtml(product.id)}">
            <div class="tool-head">
              <span>${escapeHtml(product.category)}</span>
              <strong>${escapeHtml(display.name)}</strong>
            </div>
            <p>${escapeHtml(display.tagline)}</p>
            <div class="io"><span>Send</span><strong>${escapeHtml(display.input)}</strong></div>
            <div class="io"><span>Get</span><strong>${escapeHtml(display.output)}</strong></div>
            <ul>${useCases}</ul>
            <a class="mini" href="/contact/?tool=${encodeURIComponent(product.id)}">Ask for this</a>
          </article>`
    })
    .join('\n')
}

function renderBundleRows(bundles, productNames) {
  return bundles
    .map((bundle) => {
      const included = (bundle.includes ?? []).map((id) => productNames.get(id) || id).join(', ')
      return `<div class="bundle">
            <strong>${escapeHtml(bundle.name)}</strong>
            <span>${escapeHtml(bundle.price_band)}</span>
            <p>${escapeHtml(bundle.best_for)}</p>
            <small>${escapeHtml(included)}</small>
          </div>`
    })
    .join('\n')
}

function renderAgentStackRows(radar) {
  const lanes = Array.isArray(radar?.adoption_lanes) ? radar.adoption_lanes : []
  if (!lanes.length) {
    return '<div class="tool"><div class="tool-head"><span>Agent stack</span><strong>Radar pending</strong></div><p>Run npm run agent:tools before deployment to publish current agent-tool decisions.</p></div>'
  }
  return lanes
    .slice(0, 6)
    .map((lane) => {
      const stack = (lane.stack ?? [])
        .slice(0, 4)
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join('')
      return `<article class="lane">
            <div class="tool-head"><span>${escapeHtml(lane.status)}</span><strong>${escapeHtml(lane.name)}</strong></div>
            <p>${escapeHtml(lane.use_for)}</p>
            <small>${escapeHtml(lane.next_build)}</small>
            <ul>${stack}</ul>
          </article>`
    })
    .join('\n')
}

function renderSocialOauthRows(oauth) {
  const providers = Array.isArray(oauth?.providers) ? oauth.providers : []
  if (!providers.length) {
    return '<div class="lane"><div class="tool-head"><span>OAuth</span><strong>Readiness pending</strong></div><p>Run npm run social:oauth before deployment to publish connector posture.</p></div>'
  }
  return providers
    .map(
      (provider) => `<article class="connector">
            <div class="tool-head"><span>${escapeHtml(provider.status)}</span><strong>${escapeHtml(provider.name)}</strong></div>
            <p>${escapeHtml(provider.purpose)}</p>
            <small>${escapeHtml(provider.next_action)}</small>
          </article>`,
    )
    .join('\n')
}

function publicToolsHtmlFromCatalog(catalog, agentRadar = {}, socialOAuth = {}) {
  const products = Array.isArray(catalog.products) ? catalog.products : []
  const featuredProducts = publicProductIds
    .map((id) => products.find((product) => product.id === id))
    .filter(Boolean)
  const productCards = renderToolCards(featuredProducts.length ? featuredProducts : products.slice(0, 6))
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Product Examples | SUPERMEGA.dev</title>
    <meta name="description" content="SuperMega product examples that turn sources into briefs, reviewable records, and management reports." />
    <meta name="theme-color" content="#0b0f14" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>
      :root { color-scheme: dark; --bg: #0b0f14; --panel: rgba(255,255,255,0.07); --line: rgba(255,255,255,0.14); --text: #f7fafc; --muted: #aeb8c2; --green: #8cf0b8; --gold: #f2c86d; --ink: #08100d; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; color: var(--text); background: #0b0f14; font-family: "Aptos", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
      a { color: inherit; text-decoration: none; }
      .wrap { width: min(1180px, calc(100% - 32px)); margin: 0 auto; }
      header { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 22px 0; border-bottom: 1px solid var(--line); }
      .brand { display: flex; align-items: center; gap: 12px; font-weight: 950; letter-spacing: -0.04em; }
      .mark { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 8px; background: #13231b; border: 1px solid rgba(140,240,184,0.35); color: var(--green); }
      .nav, .actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .btn, .mini { display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 999px; padding: 12px 16px; background: rgba(255,255,255,0.06); font-weight: 900; }
      .btn.primary, .mini { background: var(--green); color: var(--ink); border-color: transparent; }
      main { padding: 40px 0 70px; }
      .hero { display: grid; gap: 18px; margin-bottom: 34px; }
      .eyebrow { color: var(--green); font-size: 12px; font-weight: 950; letter-spacing: 0.2em; text-transform: uppercase; }
      h1 { margin: 14px 0 16px; max-width: 10ch; font-size: clamp(58px, 9vw, 118px); line-height: 0.82; letter-spacing: -0.08em; }
      h2 { margin: 0 0 18px; font-size: clamp(34px, 6vw, 72px); line-height: 0.88; letter-spacing: -0.065em; }
      p { margin: 0; color: var(--muted); font-size: clamp(17px, 2vw, 22px); line-height: 1.5; max-width: 42rem; }
      .proof { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
      .proof span { border: 1px solid var(--line); border-radius: 999px; padding: 9px 12px; color: rgba(247,250,252,0.86); font-size: 12px; font-weight: 950; letter-spacing: 0.14em; text-transform: uppercase; }
      .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      .tool { display: grid; gap: 14px; border: 1px solid var(--line); border-radius: 18px; padding: clamp(16px, 2.4vw, 22px); background: linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.035)); min-height: 350px; }
      .panel { border: 1px solid var(--line); border-radius: 18px; padding: clamp(18px, 3vw, 28px); background: rgba(255,255,255,0.055); margin-top: 34px; }
      .panel-head { display: flex; align-items: end; justify-content: space-between; gap: 18px; flex-wrap: wrap; margin-bottom: 18px; }
      .panel-head p { font-size: 17px; max-width: 47rem; }
      .lane-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      .connector-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
      .lane, .connector { display: grid; gap: 12px; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 16px; background: rgba(255,255,255,0.04); }
      .lane small, .connector small { color: rgba(247,250,252,0.72); line-height: 1.4; }
      .tool-head { display: grid; gap: 6px; }
      .tool-head span, .gate { color: var(--gold); font-size: 11px; font-weight: 950; letter-spacing: 0.16em; text-transform: uppercase; }
      .tool-head strong { font-size: clamp(24px, 3vw, 38px); line-height: 0.98; letter-spacing: -0.045em; }
      .io { border: 1px solid rgba(255,255,255,0.11); border-radius: 14px; padding: 11px; display: grid; gap: 5px; background: rgba(255,255,255,0.035); }
      .io span { color: var(--green); font-size: 11px; font-weight: 950; letter-spacing: 0.14em; text-transform: uppercase; }
      .io strong { color: rgba(247,250,252,0.9); line-height: 1.35; font-size: 15px; }
      ul { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
      li { border: 1px solid rgba(255,255,255,0.12); border-radius: 999px; padding: 7px 10px; color: rgba(247,250,252,0.82); font-size: 12px; font-weight: 800; }
      .note { margin-top: 22px; color: rgba(247,250,252,0.72); font-size: 14px; }
      @media (max-width: 980px) { .grid, .lane-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .connector-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 860px) { header, .hero { align-items: flex-start; } .hero, .grid, .lane-grid, .connector-grid { grid-template-columns: 1fr; } .nav { justify-content: flex-end; } .secondary-nav { display: none; } h1 { font-size: clamp(58px, 18vw, 88px); } .tool { min-height: auto; } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <a class="brand" href="/" aria-label="SUPERMEGA.dev home"><span class="mark"><img src="/favicon.svg" alt="" /></span><span>SUPERMEGA.dev</span></a>
        <nav class="nav" aria-label="Primary">
          <a class="btn secondary-nav" href="/">Home</a>
          <a class="btn primary" href="/contact/?source=tools">Contact</a>
        </nav>
      </header>
      <main>
        <section class="hero">
          <div>
            <div class="eyebrow">Products</div>
            <h1>Pick one output.</h1>
            <p>Start small. Send one source and get a brief, clean table, or report your team can use.</p>
            <div class="proof">
              <span>Market Intel</span>
              <span>File Cleanroom</span>
              <span>Report Builder</span>
            </div>
            <div class="actions" style="margin-top:24px">
              <a class="btn primary" href="/contact/?package=product-output">Request an output</a>
            </div>
          </div>
        </section>
        <section aria-label="Product examples">
          <div class="grid">
${productCards}
          </div>
        </section>
        <section class="panel" aria-label="Tool stack">
          <div class="panel-head">
            <div>
              <div class="eyebrow">Tool stack</div>
              <h2>Tools become product lanes.</h2>
              <p>${escapeHtml(agentRadar.operating_rule || 'Deterministic software first. External tools are piloted only where messy sources, browser steps, or review creates leverage.')}</p>
            </div>
          </div>
          <div class="lane-grid">
${renderAgentStackRows(agentRadar)}
          </div>
        </section>
        <section class="panel" aria-label="Social OAuth readiness">
          <div class="panel-head">
            <div>
              <div class="eyebrow">Social OAuth</div>
              <h2>Draft now. Publish after approval.</h2>
              <p>LinkedIn, Facebook, Google, and YouTube connectors stay approval-gated until tokens, scopes, account identity, and audit rows are verified. No auto-posting from public pages.</p>
            </div>
          </div>
          <div class="connector-grid">
${renderSocialOauthRows(socialOAuth)}
          </div>
        </section>
        <p class="note">Need something else? Send the work. We shape it into a small paid tool before building anything bigger.</p>
      </main>
    </div>
  </body>
</html>
`
}

function renderRunbookRows(runbook) {
  return (Array.isArray(runbook) ? runbook : [])
    .map(
      (step) => `<div class="step">
            <b>${escapeHtml(step.step)}</b>
            <p>${escapeHtml(step.automated_output)}</p>
            <small>${escapeHtml(step.human_gate)}</small>
          </div>`,
    )
    .join('\n')
}

function renderValueCellCards(cells) {
  return (Array.isArray(cells) ? cells : [])
    .map((cell) => {
      const deliverables = (cell.auto_deliverables ?? [])
        .slice(0, 4)
        .map((deliverable) => `<li>${escapeHtml(deliverable.name)}</li>`)
        .join('')
      return `<article class="cell" id="${escapeHtml(cell.id)}">
            <span>${escapeHtml(cell.status)}</span>
            <strong>${escapeHtml(cell.product_name)}</strong>
            <p>${escapeHtml(cell.next_automated_actions?.[0] || 'Generate one reviewed value artifact.')}</p>
            <ul>${deliverables}</ul>
            <div class="price">Activation reviewed after scope approval</div>
            <a href="${escapeHtml(cell.product_route)}">View tool</a>
          </article>`
    })
    .join('\n')
}

function publicValueHtmlFromEngine(engine) {
  const cells = Array.isArray(engine.value_cells) ? engine.value_cells : []
  const runbook = Array.isArray(engine.autopilot_runbook) ? engine.autopilot_runbook : []
  const generatedAt = escapeHtml(engine.generated_at || '')
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Automated Value Engine | SUPERMEGA.dev</title>
    <meta name="description" content="SuperMega automated value engine for intake, scoring, proof packs, quote readiness, and human-approved paid tool delivery." />
    <meta name="theme-color" content="#08100d" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>
      :root { color-scheme: dark; --bg: #08100d; --panel: rgba(255,255,255,0.07); --line: rgba(255,255,255,0.14); --text: #f7fbf6; --muted: #aab8af; --green: #8cf0b8; --blue: #73a9ff; --ink: #06100c; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: #08100d; color: var(--text); font-family: "Aptos", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
      a { color: inherit; text-decoration: none; }
      .wrap { width: min(1180px, calc(100% - 32px)); margin: 0 auto; }
      header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 22px 0; border-bottom: 1px solid var(--line); }
      .brand { display: flex; align-items: center; gap: 12px; font-weight: 950; letter-spacing: -0.04em; }
      .mark { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 8px; background: #13231b; border: 1px solid rgba(140,240,184,0.35); color: var(--green); }
      .nav, .actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .btn { display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 999px; padding: 12px 16px; background: rgba(255,255,255,0.06); font-weight: 900; }
      .btn.primary { background: var(--green); color: var(--ink); border-color: transparent; }
      main { padding: 42px 0 74px; }
      .hero { display: grid; grid-template-columns: minmax(0, 0.85fr) minmax(330px, 0.75fr); gap: clamp(24px, 5vw, 60px); align-items: center; margin-bottom: 42px; }
      .eyebrow { color: var(--green); font-size: 12px; font-weight: 950; letter-spacing: 0.2em; text-transform: uppercase; }
      h1 { margin: 14px 0 16px; max-width: 10ch; font-size: clamp(58px, 9vw, 116px); line-height: 0.82; letter-spacing: -0.08em; }
      h2 { margin: 0 0 18px; font-size: clamp(34px, 6vw, 72px); line-height: 0.88; letter-spacing: -0.065em; }
      p { margin: 0; color: var(--muted); font-size: clamp(17px, 2vw, 22px); line-height: 1.5; max-width: 42rem; }
      .visual { border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: var(--panel); }
      .visual img { display: block; width: 100%; border-radius: 6px; aspect-ratio: 1.25 / 1; object-fit: cover; background: #111820; }
      .metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 24px; }
      .metric { border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: rgba(255,255,255,0.055); }
      .metric strong { display: block; font-size: 30px; letter-spacing: -0.04em; }
      .metric span, .cell span, .price { color: var(--green); font-size: 11px; font-weight: 950; letter-spacing: 0.14em; text-transform: uppercase; }
      .steps { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-bottom: 34px; }
      .step, .cell { border: 1px solid var(--line); border-radius: 8px; padding: 16px; background: rgba(255,255,255,0.055); }
      .step b { display: block; font-size: 22px; margin-bottom: 8px; }
      .step small { display: block; margin-top: 10px; color: var(--blue); line-height: 1.35; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .cell { display: grid; gap: 12px; }
      .cell strong { font-size: clamp(24px, 3vw, 38px); line-height: 0.98; letter-spacing: -0.045em; }
      ul { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
      li { border: 1px solid rgba(255,255,255,0.12); border-radius: 999px; padding: 7px 10px; color: rgba(247,251,246,0.82); font-size: 12px; font-weight: 800; }
      .cell a { width: fit-content; border-bottom: 1px solid rgba(140,240,184,0.5); color: var(--green); font-weight: 950; }
      .note { margin-top: 24px; color: rgba(247,251,246,0.72); font-size: 14px; }
      @media (max-width: 920px) { .hero, .steps, .grid, .metrics { grid-template-columns: 1fr; } .secondary-nav { display: none; } h1 { font-size: clamp(58px, 18vw, 88px); } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <a class="brand" href="/" aria-label="SUPERMEGA.dev home"><span class="mark"><img src="/favicon.svg" alt="" /></span><span>SUPERMEGA.dev</span></a>
        <nav class="nav" aria-label="Primary">
          <a class="btn secondary-nav" href="/tools/">Tools</a>
          <a class="btn secondary-nav" href="/start/">Start</a>
          <a class="btn primary" href="/contact/?source=value">Contact</a>
        </nav>
      </header>
      <main>
        <section class="hero">
          <div>
            <div class="eyebrow">Automated value engine</div>
            <h1>Turn tools into paid outcomes.</h1>
            <p>Intake, score, draft, proof pack, approval queue, and quote readiness for every paid SuperMega tool. Human approval required before posting, sending, or billing.</p>
            <div class="metrics">
              <div class="metric"><strong>${escapeHtml(engine.metrics?.value_cell_count)}</strong><span>Value cells</span></div>
              <div class="metric"><strong>${escapeHtml(engine.metrics?.auto_deliverable_count)}</strong><span>Auto deliverables</span></div>
              <div class="metric"><strong>${escapeHtml(engine.metrics?.stripe_readiness_count)}</strong><span>Stripe records</span></div>
            </div>
            <div class="actions" style="margin-top:24px">
              <a class="btn primary" href="/contact/?package=value-engine">Request paid access</a>
              <a class="btn" href="/site/automated-value-engine.json">View value JSON</a>
              <a class="btn" href="/site/stripe-activation-plan.json">View checkout plan</a>
            </div>
          </div>
          <div class="visual">
            <img src="/site/social/supermega-portal-card.png" alt="SuperMega automated value engine card" />
          </div>
        </section>
        <section aria-label="Automation runbook">
          <div class="steps">
${renderRunbookRows(runbook)}
          </div>
        </section>
        <section aria-label="Value cells">
          <div class="eyebrow">Value cells</div>
          <h2>Each tool gets a delivery path.</h2>
          <div class="grid">
${renderValueCellCards(cells)}
          </div>
          <p class="note">Stripe products pending. Generated ${generatedAt}. Human approval required for external posting, outreach sending, billing activation, and advice-sensitive use.</p>
        </section>
      </main>
    </div>
  </body>
</html>
`
}

function publicIntakeHtmlFromRouter(router) {
  const rawRoutes = Array.isArray(router.intake_routes) ? router.intake_routes : []
  const routes = rawRoutes.filter((route) => publicProductIdSet.has(route.product_id))
  const generatedAt = escapeHtml(router.generated_at || '')
  const routeOptions = routes
    .map((route) => `<option value="${escapeHtml(route.product_id)}">${escapeHtml(publicProductName(route.product_id, route.product_name))}</option>`)
    .join('\n')
  const situations = [
    {
      id: 'market-brief',
      name: 'I need a clear brief.',
      pain: 'Research, competitors, or a decision need to become a short answer.',
      tool: 'market-intel-agent-room',
      prompt: 'I need a concise brief with sources, risks, and next moves.',
    },
    {
      id: 'messy-files',
      name: 'I have messy files.',
      pain: 'PDFs, spreadsheets, screenshots, folders, or notes need to become reviewable records.',
      tool: 'document-intake-data-cleanroom',
      prompt: 'I have messy files, PDFs, spreadsheets, screenshots, or notes that need to become reviewable records and a review queue.',
    },
    {
      id: 'report',
      name: 'I need a useful report.',
      pain: 'Notes, updates, and tables need to become a management-ready summary.',
      tool: 'board-pack-report-builder',
      prompt: 'I need notes, updates, or KPI tables turned into a management report with findings, risks, and next actions.',
    },
  ]
  const situationRows = situations
    .map((situation) => `<button class="situation" type="button" data-situation="${escapeHtml(situation.id)}"><strong>${escapeHtml(situation.name)}</strong><span>${escapeHtml(situation.pain)}</span></button>`)
    .join('\n')
  const routeData = JSON.stringify(
    routes.map((route) => ({
      product_id: route.product_id,
      product_name: publicProductName(route.product_id, route.product_name),
      keywords: route.trigger_keywords,
      first_offer: route.recommended_first_offer?.name,
      price_hint: route.recommended_first_offer?.price_hint,
      output: route.recommended_first_offer?.expected_output,
      approval: route.approval_boundary,
      next: route.next_automation,
      workflow: route.lead_capture_prefill?.workflow,
      requested_package: route.lead_capture_prefill?.requested_package,
    })),
  )
  const situationData = JSON.stringify(situations)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Start Here | SUPERMEGA.dev</title>
    <meta name="description" content="Pick one useful output. SuperMega turns the source into a brief, clean table, or report." />
    <meta name="theme-color" content="#0b1018" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>
      :root { color-scheme: dark; --bg: #0b1018; --panel: rgba(255,255,255,0.07); --line: rgba(255,255,255,0.14); --text: #f7fbff; --muted: #aab6c3; --green: #8cf0b8; --blue: #73a9ff; --ink: #06100c; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: #0b1018; color: var(--text); font-family: "Aptos", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
      a { color: inherit; text-decoration: none; }
      .wrap { width: min(1180px, calc(100% - 32px)); margin: 0 auto; }
      header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 22px 0; border-bottom: 1px solid var(--line); }
      .brand { display: flex; align-items: center; gap: 12px; font-weight: 950; letter-spacing: -0.04em; }
      .mark { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 8px; background: #13231b; border: 1px solid rgba(140,240,184,0.35); color: var(--green); }
      .nav { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .btn, button { display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 999px; padding: 12px 16px; background: rgba(255,255,255,0.06); color: var(--text); font: inherit; font-weight: 900; }
      .btn.primary, button.primary { background: var(--green); color: var(--ink); border-color: transparent; }
      main { padding: 42px 0 74px; }
      .hero { display: grid; grid-template-columns: minmax(0, 0.72fr) minmax(360px, 0.9fr); gap: clamp(24px, 5vw, 60px); align-items: start; }
      .eyebrow { color: var(--green); font-size: 12px; font-weight: 950; letter-spacing: 0.2em; text-transform: uppercase; }
      h1 { margin: 14px 0 16px; max-width: 10ch; font-size: clamp(58px, 9vw, 112px); line-height: 0.82; letter-spacing: -0.08em; }
      p { margin: 0; color: var(--muted); font-size: clamp(17px, 2vw, 22px); line-height: 1.5; max-width: 39rem; }
      .situations { display: grid; gap: 10px; margin-top: 24px; }
      .situation { width: 100%; justify-content: flex-start; border-radius: 8px; padding: 14px; text-align: left; background: rgba(255,255,255,0.055); }
      .situation strong { display: block; margin-right: 8px; }
      .situation span { color: var(--muted); font-size: 14px; line-height: 1.35; }
      .situation.active { border-color: rgba(140,240,184,0.55); background: rgba(140,240,184,0.12); }
      .panel { border: 1px solid var(--line); border-radius: 8px; padding: clamp(16px, 3vw, 24px); background: var(--panel); }
      form { display: grid; gap: 12px; }
      .pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      label { display: grid; gap: 7px; color: rgba(247,251,255,0.78); font-size: 12px; font-weight: 950; letter-spacing: 0.13em; text-transform: uppercase; }
      input, textarea, select { width: 100%; border: 1px solid rgba(255,255,255,0.14); border-radius: 8px; background: rgba(3,8,16,0.5); color: var(--text); padding: 13px 14px; font: inherit; outline: none; }
      textarea { min-height: 98px; resize: vertical; }
      input:focus, textarea:focus, select:focus { border-color: rgba(140,240,184,0.5); box-shadow: 0 0 0 4px rgba(140,240,184,0.08); }
      details { border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 12px; background: rgba(255,255,255,0.04); }
      summary { cursor: pointer; color: rgba(247,251,255,0.84); font-weight: 900; }
      details label { margin-top: 12px; }
      .nextbox { display: grid; gap: 8px; border: 1px solid rgba(115,169,255,0.24); border-radius: 8px; padding: 14px; background: rgba(115,169,255,0.07); }
      .nextbox strong { font-size: 17px; }
      .nextbox ol { margin: 0; padding-left: 20px; color: rgba(247,251,255,0.84); line-height: 1.5; }
      .nextbox li + li { margin-top: 5px; }
      .result { display: grid; gap: 8px; margin: 4px 0; border: 1px solid rgba(140,240,184,0.24); border-radius: 8px; padding: 14px; background: rgba(140,240,184,0.07); }
      .result strong { font-size: 22px; letter-spacing: -0.035em; }
      .result span { color: var(--green); font-size: 12px; font-weight: 950; letter-spacing: 0.14em; text-transform: uppercase; }
      .score { display: flex; gap: 8px; flex-wrap: wrap; color: rgba(247,251,255,0.82); font-size: 13px; font-weight: 850; }
      .score b { color: var(--green); }
      .note { margin-top: 20px; color: rgba(247,251,255,0.72); font-size: 14px; }
      @media (max-width: 880px) { .hero, .pair { grid-template-columns: 1fr; } .secondary-nav { display: none; } h1 { font-size: clamp(58px, 18vw, 88px); } main { padding-top: 28px; } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <a class="brand" href="/" aria-label="SUPERMEGA.dev home"><span class="mark"><img src="/favicon.svg" alt="" /></span><span>SUPERMEGA.dev</span></a>
        <nav class="nav" aria-label="Primary">
          <a class="btn secondary-nav" href="/tools/">Tools</a>
          <a class="btn secondary-nav" href="/proof/">Proof</a>
          <a class="btn primary" href="/contact/?source=intake">Contact</a>
        </nav>
      </header>
      <main>
        <section class="hero">
          <div>
            <div class="eyebrow">Start here</div>
            <h1>Pick the output.</h1>
            <p>Choose what you need first. Send a source. We return the first useful artifact.</p>
            <div class="situations" aria-label="Simple buyer situations">
${situationRows}
            </div>
            <p class="note">Human approval required before proposals, posts, outbound messages, billing activation, or advice-sensitive use. Generated ${generatedAt}.</p>
          </div>
          <section class="panel" aria-label="SuperMega value intake form">
            <form action="/api/contact-submissions" data-sm-intake-form method="post">
              <input type="hidden" name="workflow" value="Value intake" />
              <input type="hidden" name="requested_package" value="First output request" />
              <input type="hidden" name="data" value="Public product intake" />
              <input type="hidden" name="source_url" value="https://supermega.dev/intake/" />
              <input type="hidden" name="page_path" value="/intake/" />
              <input type="hidden" name="referrer" value="" />
              <input type="hidden" name="utm_source" value="" />
              <input type="hidden" name="utm_medium" value="" />
              <input type="hidden" name="utm_campaign" value="product_output_intake" />
              <input type="hidden" name="utm_content" value="" />
              <input type="hidden" name="utm_term" value="" />
              <input type="hidden" name="first_step" value="First useful output" />
              <details>
                <summary>I know what I want.</summary>
                <label>Product<select name="tool_interest" data-tool-select>
                  <option value="">Let SuperMega decide</option>
${routeOptions}
                </select></label>
              </details>
              <label>What do you need?<textarea name="goal" data-router-text placeholder="Example: turn this folder into a short report." required></textarea></label>
              <label>Source<textarea name="source_links" data-source-links placeholder="Paste a Drive folder, Sheet, PDF link, or write: I will send it after you reply."></textarea></label>
              <div class="pair">
                <label>Source type<input name="sources" data-fit-field placeholder="Sheet, PDF, links, notes, folder..." required /></label>
                <label>Urgency<select name="urgency" data-fit-field required>
                  <option value="">Select</option>
                  <option>Today or tomorrow</option>
                  <option>This week</option>
                  <option>This month</option>
                </select></label>
              </div>
              <div class="pair">
                <label>Reviewer<input name="reviewer" data-fit-field placeholder="Who approves the output?" required /></label>
                <label>Why it matters<input name="value" data-fit-field placeholder="Decision, sales, time saved, risk reduced..." required /></label>
              </div>
              <div class="pair">
                <label>Name<input autocomplete="name" name="name" required /></label>
                <label>Work email<input autocomplete="email" name="email" type="email" required /></label>
              </div>
              <div class="pair">
                <label>Company<input autocomplete="organization" name="company" required /></label>
                <label>Phone / WhatsApp<input autocomplete="tel" name="phone" type="tel" /></label>
              </div>
              <div class="result" data-router-result>
                <span>Selected output</span>
                <strong>Pick one output to start.</strong>
                <p>SuperMega recommends the first product before you send.</p>
                <div class="score"><b>0</b> / 100 ready</div>
              </div>
              <div class="nextbox" aria-label="What happens after sending">
                <strong>After you send this</strong>
                <ol>
                  <li>We confirm the first useful output.</li>
                  <li>You approve scope, access, and rollout before build.</li>
                  <li>A bigger system is proposed only after the first output works.</li>
                </ol>
              </div>
              <input autocomplete="off" name="website" style="display:none" tabindex="-1" />
              <button class="primary" type="submit">Send request</button>
            </form>
          </section>
        </section>
      </main>
    </div>
    <script type="application/json" id="sm-intake-routes">${routeData.replaceAll('<', '\\u003c')}</script>
    <script type="application/json" id="sm-intake-situations">${situationData.replaceAll('<', '\\u003c')}</script>
    <script>
      const routes = JSON.parse(document.getElementById('sm-intake-routes').textContent || '[]');
      const situations = JSON.parse(document.getElementById('sm-intake-situations').textContent || '[]');
      const form = document.querySelector('[data-sm-intake-form]');
      const select = form.querySelector('[data-tool-select]');
      const text = form.querySelector('[data-router-text]');
      const result = form.querySelector('[data-router-result]');
      const hiddenWorkflow = form.querySelector('[name="workflow"]');
      const hiddenPackage = form.querySelector('[name="requested_package"]');
      const hiddenData = form.querySelector('[name="data"]');
      const hiddenFirstStep = form.querySelector('[name="first_step"]');
      const sourceLinks = form.querySelector('[data-source-links]');
      const search = new URLSearchParams(window.location.search);
      const set = (name, value) => {
        const input = form.querySelector('[name="' + name + '"]');
        if (input) input.value = value || '';
      };
      set('source_url', window.location.href);
      set('page_path', window.location.pathname + window.location.search);
      set('referrer', document.referrer || '');
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
        if (search.get(key)) set(key, search.get(key));
      }
      if (search.get('tool')) select.value = search.get('tool');
      function chosenRoute() {
        const selected = routes.find((route) => route.product_id === select.value);
        if (selected) return selected;
        const haystack = (text.value || '').toLowerCase();
        return routes
          .map((route) => ({
            route,
            score: (route.keywords || []).filter((keyword) => haystack.includes(String(keyword).toLowerCase())).length,
          }))
          .sort((a, b) => b.score - a.score)[0]?.route || routes.find((route) => route.product_id === 'workflow-simulator-roi-calculator') || routes[0];
      }
      function scoreFit() {
        const fields = [text, ...form.querySelectorAll('[data-fit-field]')];
        return Math.round((fields.filter((field) => String(field.value || '').trim().length > 0).length / fields.length) * 100);
      }
      function render() {
        const route = chosenRoute();
        const score = scoreFit();
        if (!route) return;
        hiddenWorkflow.value = route.workflow || route.product_name;
        hiddenPackage.value = route.first_offer || route.product_name + ' first output';
        hiddenFirstStep.value = 'First useful output for ' + route.product_name;
        hiddenData.value = 'Intake route: ' + route.product_id + '; fit score: ' + score + '; output: ' + route.output + '; source links: ' + (sourceLinks.value || 'send after reply');
        result.innerHTML = '<span>Recommended product</span><strong>' + route.product_name + '</strong><p>' + route.output + '</p><div class="score"><b>' + score + '</b> / 100 ready - ' + route.price_hint + ' - ' + route.approval + '</div>';
      }
      form.addEventListener('input', render);
      form.addEventListener('change', render);
      for (const button of document.querySelectorAll('[data-situation]')) {
        button.addEventListener('click', () => {
          const situation = situations.find((item) => item.id === button.dataset.situation);
          if (!situation) return;
          for (const node of document.querySelectorAll('[data-situation]')) node.classList.remove('active');
          button.classList.add('active');
          text.value = situation.prompt;
          select.value = situation.tool || '';
          render();
        });
      }
      render();
    </script>
  </body>
</html>
`
}

function renderProofPackCards(packs) {
  return (Array.isArray(packs) ? packs : [])
    .map((pack) => {
      const checks = (pack.acceptance_checks ?? [])
        .slice(0, 4)
        .map((check) => `<li>${escapeHtml(check)}</li>`)
        .join('')
      const sections = (pack.artifact_sections ?? [])
        .slice(0, 3)
        .map((section) => `<span>${escapeHtml(section.name)}</span>`)
        .join('')
      return `<article class="pack" id="${escapeHtml(pack.id)}">
            <div class="pack-head">
              <span>${escapeHtml(pack.status)}</span>
              <strong>${escapeHtml(publicProductName(pack.id, pack.product_name))}</strong>
            </div>
            <p>${escapeHtml(pack.buyer_scene)}</p>
            <div class="sections">${sections}</div>
            <ul>${checks}</ul>
            <div class="next">${escapeHtml(pack.next_sales_action)}</div>
            <div class="links">
              <a href="${escapeHtml(pack.tool_route)}">Tool</a>
              <a href="${escapeHtml(pack.intake_route)}">Intake</a>
            </div>
          </article>`
    })
    .join('\n')
}

function publicProofHtmlFromPacks(proof) {
  const packs = (Array.isArray(proof.proof_packs) ? proof.proof_packs : []).filter((pack) =>
    publicProductIdSet.has(String(pack.id || '').replace(/-proof-pack$/, '')),
  )
  const generatedAt = escapeHtml(proof.generated_at || '')
  const acceptanceCheckCount = packs.reduce((total, pack) => total + (pack.acceptance_checks?.length || 0), 0)
  const objectionCount = packs.reduce((total, pack) => total + (pack.objection_replies?.length || 0), 0)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Proof Packs | SUPERMEGA.dev</title>
    <meta name="description" content="SuperMega product proof: sample inputs, finished outputs, and acceptance checks." />
    <meta name="theme-color" content="#0d1117" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>
      :root { color-scheme: dark; --bg: #0d1117; --panel: rgba(255,255,255,0.065); --line: rgba(255,255,255,0.14); --text: #f8fbff; --muted: #aeb9c5; --green: #8cf0b8; --gold: #f2c86d; --blue: #91d7ff; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: #0d1117; color: var(--text); font-family: "Aptos", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
      a { color: inherit; text-decoration: none; }
      .wrap { width: min(1180px, calc(100% - 32px)); margin: 0 auto; }
      header { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 20px 0 34px; }
      .brand { display: flex; align-items: center; gap: 12px; font-weight: 950; letter-spacing: -0.04em; }
      .mark { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 8px; background: #13231b; border: 1px solid rgba(140,240,184,0.35); color: var(--green); }
      .nav { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
      .btn { display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 999px; padding: 12px 16px; background: rgba(255,255,255,0.06); font-weight: 900; }
      .btn.primary { background: var(--green); color: #07110d; border-color: transparent; }
      main { display: grid; gap: 34px; padding-bottom: 56px; }
      .hero { display: grid; grid-template-columns: minmax(0, 0.98fr) minmax(320px, 1.02fr); gap: clamp(20px, 4vw, 48px); align-items: end; }
      .eyebrow { color: var(--green); font-size: 12px; font-weight: 950; letter-spacing: 0.2em; text-transform: uppercase; }
      h1 { margin: 14px 0 16px; max-width: 10ch; font-size: clamp(58px, 9vw, 116px); line-height: 0.82; letter-spacing: -0.08em; }
      h2 { margin: 0 0 18px; font-size: clamp(34px, 6vw, 72px); line-height: 0.88; letter-spacing: -0.065em; }
      p { margin: 0; color: var(--muted); font-size: clamp(17px, 2vw, 22px); line-height: 1.5; max-width: 42rem; }
      .metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 24px; max-width: 38rem; }
      .metric { border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: rgba(255,255,255,0.055); }
      .metric strong { display: block; font-size: 34px; line-height: 0.95; }
      .metric span, .pack-head span { color: var(--green); font-size: 11px; font-weight: 950; letter-spacing: 0.14em; text-transform: uppercase; }
      .visual { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: rgba(255,255,255,0.05); }
      .visual img { display: block; width: 100%; height: auto; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
      .pack { display: grid; gap: 14px; border: 1px solid var(--line); border-radius: 8px; padding: 18px; background: var(--panel); }
      .pack-head { display: grid; gap: 8px; }
      .pack-head strong { font-size: clamp(24px, 3vw, 38px); line-height: 0.98; letter-spacing: -0.045em; }
      .sections { display: flex; flex-wrap: wrap; gap: 8px; }
      .sections span, li { border: 1px solid rgba(255,255,255,0.12); border-radius: 999px; padding: 7px 10px; color: rgba(248,251,255,0.82); font-size: 12px; font-weight: 800; }
      ul { display: flex; flex-wrap: wrap; gap: 8px; padding: 0; margin: 0; list-style: none; }
      .next { color: var(--blue); font-weight: 820; line-height: 1.4; }
      .links { display: flex; gap: 12px; flex-wrap: wrap; }
      .links a { border-bottom: 1px solid rgba(140,240,184,0.5); color: var(--green); font-weight: 950; }
      .note { color: var(--muted); font-size: 14px; }
      @media (max-width: 880px) { header, .hero { align-items: flex-start; } .hero, .grid, .metrics { grid-template-columns: 1fr; } .secondary-nav { display: none; } h1 { font-size: clamp(56px, 17vw, 86px); } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <a class="brand" href="/" aria-label="SUPERMEGA.dev home"><span class="mark"><img src="/favicon.svg" alt="" /></span><span>SUPERMEGA.dev</span></a>
        <nav class="nav" aria-label="Primary">
          <a class="btn secondary-nav" href="/tools/">Tools</a>
          <a class="btn secondary-nav" href="/value/">Value</a>
          <a class="btn secondary-nav" href="/intake/">Intake</a>
          <a class="btn primary" href="/contact/?source=proof">Contact</a>
        </nav>
      </header>
      <main>
        <section class="hero">
          <div>
            <div class="eyebrow">Proof</div>
            <h1>Show the output first.</h1>
            <p>Sample inputs, finished outputs, and acceptance checks for the three products we sell first.</p>
            <div class="metrics">
              <div class="metric"><strong>${escapeHtml(packs.length)}</strong><span>Proof packs</span></div>
              <div class="metric"><strong>${escapeHtml(acceptanceCheckCount)}</strong><span>Acceptance checks</span></div>
              <div class="metric"><strong>${escapeHtml(objectionCount)}</strong><span>Objection replies</span></div>
            </div>
            <div class="actions" style="margin-top:24px">
              <a class="btn primary" href="/contact/?package=proof-pack">Request proof</a>
              <a class="btn" href="/site/tool-proof-packs.json">View proof JSON</a>
            </div>
          </div>
          <div class="visual">
            <img src="/site/social/supermega-portal-card.png" alt="SuperMega proof pack card" />
          </div>
        </section>
        <section aria-label="Proof packs">
          <div class="eyebrow">Examples</div>
          <h2>Each product starts with one artifact.</h2>
          <div class="grid">
${renderProofPackCards(packs)}
          </div>
          <p class="note">Generated ${generatedAt}. Human approval required before anything is sent externally.</p>
        </section>
      </main>
    </div>
  </body>
</html>
`
}

function renderPublicPricingHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Start | SUPERMEGA.dev</title>
    <meta name="description" content="Start a SUPERMEGA product from one real workflow, source sample, app map, and approval path." />
    <meta name="theme-color" content="#f4f8f6" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>
      :root {
        color-scheme: light;
        --cream: #f4f8f6;
        --paper: #ffffff;
        --ink: #0d1117;
        --muted: #5f6b66;
        --line: rgba(13, 17, 23, 0.13);
        --blue: #124fff;
        --navy: #07111f;
        --shadow: 0 34px 90px rgba(13, 17, 23, 0.14);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        color: var(--ink);
        background:
          radial-gradient(circle at 80% 2%, rgba(25, 216, 255, 0.18), transparent 30rem),
          radial-gradient(circle at 4% 18%, rgba(18, 79, 255, 0.12), transparent 26rem),
          linear-gradient(180deg, #fbfcfb 0%, var(--cream) 58%, #e8f0ed 100%);
        font-family: "Aptos", "Segoe UI Variable", "Segoe UI", system-ui, -apple-system, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      a { color: inherit; text-decoration: none; }
      .wrap { width: min(1180px, calc(100% - 36px)); margin: 0 auto; position: relative; overflow: clip; }
      header { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 22px 0; }
      .brand { display: inline-flex; align-items: center; gap: 12px; font-weight: 950; letter-spacing: -0.045em; }
      .mark { position: relative; display: grid; place-items: center; width: 43px; height: 43px; border-radius: 14px; overflow: hidden; background: var(--navy); box-shadow: 0 14px 34px rgba(7,17,31,0.22), inset 0 1px 0 rgba(255,255,255,0.18); }
      .mark img { display: block; width: 100%; height: 100%; }
      .brand-text { display: grid; gap: 2px; }
      .brand-text strong { font-size: 18px; }
      .brand-text small { color: var(--muted); font-size: 10px; font-weight: 900; letter-spacing: 0.18em; text-transform: uppercase; }
      .nav, .cta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .btn, button { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; border: 1px solid var(--line); border-radius: 999px; padding: 0 18px; background: rgba(255,255,255,0.58); color: var(--ink); font: inherit; font-weight: 950; backdrop-filter: blur(18px); }
      .btn.primary, button { color: #fff; border-color: transparent; background: linear-gradient(135deg, #07111f, #124fff); box-shadow: 0 18px 46px rgba(18, 79, 255, 0.24); }
      .poster { display: grid; grid-template-columns: minmax(0, 0.84fr) minmax(340px, 1.16fr); gap: clamp(24px, 5vw, 72px); align-items: center; min-height: min(620px, calc(100svh - 86px)); padding: 10px 0 42px; }
      .eyebrow { color: var(--blue); font-size: 12px; font-weight: 950; letter-spacing: 0.22em; text-transform: uppercase; }
      h1, h2, h3 { font-family: var(--font-serif, "Georgia", ui-serif, serif); font-weight: 560; font-optical-sizing: auto; }
      h1 { margin: 12px 0 16px; max-width: 16ch; font-size: clamp(46px, 5.6vw, 74px); line-height: 1.02; letter-spacing: -0.02em; }
      h2 { margin: 0; max-width: 16ch; font-size: clamp(32px, 4.4vw, 56px); line-height: 1.03; letter-spacing: -0.02em; }
      h3 { margin: 0; font-size: clamp(23px, 2.8vw, 38px); line-height: 1.05; letter-spacing: -0.015em; }
      p { margin: 0; max-width: 34rem; color: var(--muted); font-size: clamp(17px, 1.8vw, 20px); line-height: 1.5; letter-spacing: -0.01em; }
      .section { border-top: 1px solid var(--line); padding: 46px 0; }
      .final { display: flex; align-items: center; justify-content: space-between; gap: 20px; border: 1px solid rgba(255,255,255,0.78); border-radius: 32px; padding: clamp(18px, 3vw, 28px); background: rgba(255,255,255,0.62); box-shadow: var(--shadow); }
      .start-board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 24px; }
      .start-card { display: grid; gap: 10px; border: 1px solid var(--line); border-radius: 24px; padding: 18px; background: rgba(255,255,255,0.68); box-shadow: 0 18px 46px rgba(13,17,23,0.08); }
      .start-card strong { font-size: 22px; letter-spacing: -0.04em; }
      .start-card span { color: var(--muted); font-size: 15px; line-height: 1.38; font-weight: 760; }
      .path-panel { border: 1px solid rgba(255,255,255,0.82); border-radius: 34px; padding: clamp(18px, 3vw, 28px); background: rgba(255,255,255,0.68); box-shadow: var(--shadow); backdrop-filter: blur(24px); }
      .path-list { display: grid; gap: 12px; margin-top: 18px; }
      .path-row { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: start; border: 1px solid var(--line); border-radius: 18px; padding: 13px; background: rgba(255,255,255,0.78); }
      .path-row b { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 999px; color: #fff; background: var(--blue); font-size: 13px; }
      .path-row strong { display: block; letter-spacing: -0.025em; }
      .path-row span { display: block; margin-top: 3px; color: var(--muted); font-size: 14px; line-height: 1.36; font-weight: 760; }
      @media (max-width: 880px) { .poster, .start-board { grid-template-columns: 1fr; } .path-panel { border-radius: 24px; } .final { align-items: flex-start; flex-direction: column; } .brand-text strong, .brand-text small { display: none; } h1 { font-size: clamp(44px, 12vw, 60px); } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <a class="brand" href="/" aria-label="SUPERMEGA.dev home">
          <span class="mark"><svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" aria-hidden="true"><g stroke="#D97757" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M35.8 10.3 A22 22 0 1 1 28.2 10.3"/><path d="M22 45 L22 26 L32 38 L42 26 L42 45" stroke-width="4"/></g><path d="M32 34.5 L33.2 37 L35.5 38 L33.2 39 L32 41.5 L30.8 39 L28.5 38 L30.8 37 Z" fill="#C9A24B"/><path d="M32 7.6 L32.9 9.7 L35 10.3 L32.9 10.9 L32 13 L31.1 10.9 L29 10.3 L31.1 9.7 Z" fill="#C9A24B"/></svg></span>
          <span class="brand-text"><strong>SUPERMEGA.dev</strong></span>
        </a>
        <nav class="nav" aria-label="Primary">
          <a class="btn secondary" href="/products/">Products</a>
          <a class="btn primary" href="/contact/">Contact</a>
        </nav>
      </header>
      <main>
        <section class="poster">
          <div class="copy">
            <div class="eyebrow">Start</div>
            <h1>Start with one source.</h1>
            <p>Send one real source. We map the first useful app, the owner decision, the safety boundary, and the acceptance test.</p>
            <div class="cta">
              <a class="btn primary" href="/contact/?source=start-page">Send a source</a>
              <a class="btn secondary" href="viber://chat?number=%2B9595000721" aria-label="Chat with us on Viber">Chat on Viber</a>
              <a class="btn secondary" href="/products/">See products</a>
            </div>
          </div>
          <aside class="path-panel" aria-label="SUPERMEGA start path">
            <div class="eyebrow">Simple path</div>
            <div class="path-list">
              <div class="path-row"><b>1</b><div><strong>Source</strong><span>File, sheet, folder, screenshot, export, menu, issue log, or repeated task.</span></div></div>
              <div class="path-row"><b>2</b><div><strong>App map</strong><span>First screen, modules, owner action, data boundary, and missing fields.</span></div></div>
              <div class="path-row"><b>3</b><div><strong>Build</strong><span>One usable desktop/mobile app first, then expand after proof.</span></div></div>
            </div>
          </aside>
        </section>
        <section class="section" aria-label="Start products">
          <div class="eyebrow">Products</div>
          <h2>Choose one product.</h2>
          <div class="start-board">
            <article class="start-card"><div class="eyebrow">Daily work</div><strong>Custom Workflow App</strong><span>Intake, queue, owner review, source proof, and next action.</span></article>
            <article class="start-card"><div class="eyebrow">Factories</div><strong>Factory Operations App</strong><span>Issues, assets, readings, WCM board, CAPA, ISO evidence, and manager closeout.</span></article>
            <article class="start-card"><div class="eyebrow">Shops</div><strong>Restaurant POS + Inventory</strong><span>Menu and QR, orders, payment proof, stock exceptions, shift close, and owner report.</span></article>
          </div>
        </section>
        <section class="section">
          <div class="final">
            <div>
              <div class="eyebrow">Approval first</div>
              <h2>No account before approval.</h2>
              <p>No connector, data write, external send, or automation runs until the source boundary and owner approval are clear.</p>
            </div>
            <a class="btn primary" href="/contact/?source=start-bottom">Send a source</a>
          </div>
        </section>
      </main>
    </div>
  </body>
</html>
`
}

const activeCardCampaignSlug = 'umfcci-ai-20260511'
const activeCardContactPath = '/'

const publicCardHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Swan Htet | SUPERMEGA.dev</title>
    <meta name="description" content="Swan Htet — founder of SUPERMEGA.dev. Custom software for Myanmar businesses, starting from your real data. Priced in MMK." />
    <link rel="canonical" href="https://supermega.dev/card/" />
    <meta property="og:type" content="profile" />
    <meta property="og:site_name" content="SUPERMEGA.dev" />
    <meta property="og:title" content="Swan Htet | SUPERMEGA.dev" />
    <meta property="og:description" content="Custom software for Myanmar businesses — starting from your real data. Priced in MMK. Built in weeks. Yours to keep." />
    <meta property="og:url" content="https://supermega.dev/card/" />
    <meta property="og:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <meta name="theme-color" content="#1b1815" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;700;900&display=swap');
      :root { color-scheme: light dark; --cream:#f7f4ec; --paper:#fffdf8; --ink:#2a241c; --muted:#6b6052; --clay:#c2603f; --gilt:#c9a24b; --line:rgba(42,36,28,0.12); --bg:#1b1815; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100svh; display: grid; place-items: center; padding: 24px; background-color: #1b1815; background-image: radial-gradient(ellipse at 80% 12%, rgba(201,162,75,0.13), transparent 30rem), radial-gradient(ellipse at 8% 88%, rgba(194,96,63,0.15), transparent 30rem), linear-gradient(160deg, #1f1b17, #13110e 75%); color: var(--ink); font-family: "Inter", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
      a { color: inherit; text-decoration: none; }
      .card { position: relative; overflow: hidden; width: min(980px, 100%); min-height: min(640px, calc(100svh - 48px)); display: flex; align-items: center; gap: clamp(28px, 5vw, 60px); border: 1px solid var(--line); border-radius: clamp(28px, 5vw, 52px); background: linear-gradient(158deg, var(--paper) 0%, var(--cream) 100%); box-shadow: 0 50px 130px rgba(0,0,0,0.5), 0 8px 32px rgba(0,0,0,0.26); padding: clamp(32px, 6vw, 68px); }
      .card::before { content: "SUPERMEGA"; position: absolute; right: -3%; bottom: -4%; color: transparent; -webkit-text-stroke: 1px rgba(42,36,28,0.05); font-size: clamp(60px, 14vw, 168px); font-weight: 900; letter-spacing: -0.1em; line-height: 0.8; pointer-events: none; }
      .photo-col { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 14px; position: relative; }
      .avatar { width: clamp(148px, 22vw, 216px); height: clamp(148px, 22vw, 216px); border-radius: 50%; object-fit: cover; border: 3px solid var(--paper); box-shadow: 0 16px 40px rgba(42,36,28,0.3), 0 0 0 1px var(--line); }
      .qr { width: 104px; height: 104px; border-radius: 14px; background: var(--paper); border: 1px solid var(--line); padding: 7px; box-shadow: 0 6px 16px rgba(42,36,28,0.12); }
      .qr-label { font-size: 10.5px; font-weight: 900; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); margin-top: -4px; }
      .content { position: relative; flex: 1 1 auto; min-width: 0; max-width: 560px; }
      .brand { display: inline-flex; align-items: center; gap: 10px; color: var(--clay); font-size: 11px; font-weight: 950; letter-spacing: 0.22em; text-transform: uppercase; }
      .mark { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; overflow: hidden; background: var(--bg); border: 1px solid var(--line); }
      .mark img { width: 100%; height: 100%; display: block; }
      h1 { font-family: "Fraunces", Georgia, serif; margin: 18px 0 6px; font-size: clamp(48px, 8vw, 84px); line-height: 0.92; letter-spacing: -0.02em; font-weight: 600; color: var(--ink); }
      .role { margin: 0 0 16px; color: var(--clay); font-size: clamp(16px, 2.4vw, 20px); font-weight: 850; }
      .pitch { max-width: 34rem; margin: 0 0 26px; color: var(--muted); font-size: clamp(17px, 2.2vw, 21px); line-height: 1.42; font-weight: 500; }
      .details { display: grid; gap: 8px; margin-bottom: 26px; }
      .details a { width: fit-content; color: var(--ink); font-size: clamp(16px, 2vw, 20px); font-weight: 850; }
      .details a:hover { color: var(--clay); }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; }
      .button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 50px; border-radius: 999px; padding: 0 22px; font-weight: 900; font-size: 15px; }
      .button.primary { background: linear-gradient(135deg, var(--clay), #a84e30); color: #fff; box-shadow: 0 18px 44px rgba(194,96,63,0.3); }
      .button.viber { background: var(--blue, #c2603f); color: #fff; box-shadow: 0 18px 44px rgba(194,96,63,0.28); }
      .button.secondary { border: 1px solid var(--line); background: var(--paper); color: var(--ink); }
      @media (max-width: 760px) { body { padding: 14px; } .card { flex-direction: column; text-align: center; align-items: center; min-height: calc(100svh - 28px); padding: 38px 26px; gap: 22px; border-radius: 32px; } .content { display: flex; flex-direction: column; align-items: center; } .details a, .pitch { margin-left: auto; margin-right: auto; } .actions { justify-content: center; } .qr, .qr-label { display: none; } }
    </style>
  </head>
  <body>
    <main class="card" aria-label="Swan Htet contact card">
      <div class="photo-col">
        <img class="avatar" src="/site/social/swan-htet.jpg" alt="Swan Htet, founder of SUPERMEGA.dev" width="216" height="216" />
        <img class="qr" src="/site/social/supermega-contact-qr.png" alt="QR code linking to supermega.dev" width="104" height="104" loading="lazy" />
        <span class="qr-label">Scan to visit</span>
      </div>
      <section class="content">
        <a class="brand" href="/" aria-label="SUPERMEGA.dev home"><span class="mark"><img src="/favicon.svg?v=supermega-atelier-20260623" alt="" /></span><span>SUPERMEGA.dev</span></a>
        <h1>Swan Htet</h1>
        <p class="role">Founder — custom software for Myanmar business</p>
        <p class="pitch">I build the software your team actually needs — starting from your real data. Priced in MMK. Built in weeks. Yours to keep.</p>
        <div class="details">
          <a href="mailto:swanhtet@supermega.dev">swanhtet@supermega.dev</a>
          <a href="tel:+9595000721">+95 9 500 0721</a>
        </div>
        <div class="actions">
          <a class="button viber" href="viber://chat?number=%2B9595000721" aria-label="Chat on Viber"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm5.568 16.8c-.24.576-.96 1.056-1.608 1.2-.432.096-.984.168-2.856-.624-2.4-.984-3.936-3.432-4.056-3.6-.12-.168-.984-1.32-.984-2.52s.624-1.776 1.2-1.776c.216 0 .624.024.84.576.144.36.384.984.432 1.128.12.288.024.624-.12.84l-.384.48c-.12.168-.24.36-.12.696.576 1.44 1.872 2.376 3.48 3.024.264.096.456.048.624-.144l.528-.624c.192-.24.432-.264.696-.168.648.264 1.56.648 1.8.744.288.12.48.168.528.288.048.192.048.864-.192 1.296zm.12-4.848c-.072 0-.12-.024-.12-.096-.264-2.952-2.496-5.136-5.424-5.4-.072-.024-.12-.072-.12-.144v-.528c0-.072.048-.12.12-.12 3.336.288 5.976 2.904 6.264 6.168 0 .072-.048.12-.12.12h-.6zm-1.464-1.584c-.072 0-.144-.024-.144-.12-.216-1.68-1.536-3-3.216-3.24-.072 0-.12-.072-.12-.144v-.528c0-.072.048-.12.12-.12 2.016.264 3.624 1.848 3.888 3.864 0 .072-.048.12-.12.12h-.408zm-1.272-1.584c-.072 0-.12-.048-.12-.12-.144-.792-.768-1.416-1.56-1.56-.072-.024-.12-.072-.12-.144v-.528c0-.072.048-.12.12-.12 1.128.168 2.016 1.032 2.184 2.16 0 .072-.048.12-.12.12h-.384z"/></svg>Viber</a>
          <a class="button primary" href="${activeCardContactPath}">supermega.dev</a>
          <a class="button secondary" href="https://www.linkedin.com/in/theswanhtet" rel="noreferrer" target="_blank">LinkedIn</a>
        </div>
      </section>
    </main>
  </body>
</html>
`

const publicCampaignRedirectHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex,follow" />
    <title>Opening SUPERMEGA.dev</title>
    <meta name="theme-color" content="#07111f" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>
      :root { color-scheme: dark; --text: #f7fbff; --muted: #a8b8ca; --cyan: #64efff; --blue: #4f8cff; --ink: #06101d; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100svh; display: grid; place-items: center; padding: 24px; background-color: #07111f; background-image: radial-gradient(circle at 76% 18%, rgba(100,239,255,0.18), transparent 24rem), radial-gradient(circle at 8% 84%, rgba(79,140,255,0.18), transparent 26rem), linear-gradient(135deg, #07111f, #02050b 72%); color: var(--text); font-family: "Aptos", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
      main { width: min(640px, 100%); border: 1px solid rgba(217,247,255,0.16); border-radius: 34px; background: rgba(255,255,255,0.07); box-shadow: inset 0 1px 0 rgba(255,255,255,0.12), 0 36px 100px rgba(0,0,0,0.36); padding: clamp(28px, 7vw, 54px); }
      .brand { display: inline-flex; align-items: center; gap: 12px; color: var(--cyan); font-size: 12px; font-weight: 950; letter-spacing: 0.22em; text-transform: uppercase; }
      .mark { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 14px; overflow: hidden; background: #07111f; border: 1px solid rgba(255,255,255,0.16); }
      .mark img { width: 100%; height: 100%; display: block; }
      h1 { margin: 34px 0 12px; font-size: clamp(52px, 13vw, 92px); line-height: .82; letter-spacing: -.09em; }
      p { margin: 0; color: var(--muted); font-size: 18px; line-height: 1.5; }
      a { display: inline-flex; align-items: center; justify-content: center; min-height: 52px; margin-top: 24px; border-radius: 999px; padding: 0 20px; background: linear-gradient(135deg, var(--cyan), var(--blue)); color: var(--ink); font-weight: 950; text-decoration: none; }
    </style>
  </head>
  <body>
    <main>
      <div class="brand"><span class="mark"><img src="/favicon.svg?v=supermega-atelier-20260623" alt="" /></span><span>SUPERMEGA.dev</span></div>
      <h1>Opening SUPERMEGA.</h1>
      <p>Sending you to the main site.</p>
      <a data-sm-campaign-link href="${activeCardContactPath}">Continue</a>
    </main>
    <script>
      const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '${activeCardCampaignSlug}');
      const query = new URLSearchParams(location.search);
      const fallback = '/';
      const link = document.querySelector('[data-sm-campaign-link]');
      if (link) link.href = fallback;
      const payload = {
        campaign: slug,
        utm_source: query.get('utm_source') || 'business_card',
        utm_medium: query.get('utm_medium') || 'qr',
        utm_content: query.get('utm_content') || 'front_qr',
        source_url: location.href,
        page_path: location.pathname + location.search,
        referrer: document.referrer || ''
      };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 950);
      fetch('/api/campaign-clicks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
        keepalive: true
      })
        .then((response) => response.ok ? response.json() : null)
        .then((body) => {
          const destination = body && body.destination_url ? body.destination_url : fallback;
          window.location.replace(destination);
        })
        .catch(() => window.location.replace(fallback))
        .finally(() => clearTimeout(timeout));
    </script>
  </body>
</html>
`

const unicornShellStyle = `
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Inter:wght@400..900&display=swap');
      :root {
        color-scheme: light;
        --cream: #f7f4ec;
        --paper: #fffdf8;
        --ink: #2a241c;
        --muted: #6f665a;
        --line: rgba(42, 36, 28, 0.14);
        --blue: #c2603f;
        --blue-soft: #f2e4db;
        --aqua: #d9895f;
        --navy: #2a241c;
        --shadow: 0 34px 90px rgba(42, 36, 28, 0.13);
        --font-sans: "Inter", "Aptos", "Segoe UI Variable", "Segoe UI", system-ui, -apple-system, sans-serif;
        --font-serif: "Fraunces", "Georgia", "Cambria", ui-serif, serif;
      }
      * { box-sizing: border-box; }
      html { scroll-behavior: smooth; }
      body {
        margin: 0;
        min-height: 100vh;
        overflow-x: hidden;
        color: var(--ink);
        background:
          radial-gradient(circle at 80% 2%, rgba(217, 119, 87, 0.14), transparent 30rem),
          radial-gradient(circle at 4% 18%, rgba(194, 96, 63, 0.10), transparent 26rem),
          linear-gradient(180deg, #fbf9f3 0%, var(--cream) 58%, #efe9dd 100%);
        font-family: var(--font-sans);
        text-rendering: optimizeLegibility;
        -webkit-font-smoothing: antialiased;
      }
      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        opacity: 0.12;
        background-image:
          linear-gradient(rgba(13, 17, 23, 0.055) 1px, transparent 1px),
          linear-gradient(90deg, rgba(13, 17, 23, 0.055) 1px, transparent 1px);
        background-size: 64px 64px;
        mask-image: linear-gradient(180deg, #000 0%, transparent 72%);
      }
      a { color: inherit; text-decoration: none; }
      img { max-width: 100%; }
      .wrap { width: min(1180px, calc(100% - 36px)); margin: 0 auto; position: relative; overflow: clip; }
      header { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 22px 0; }
      .brand { display: inline-flex; align-items: center; gap: 12px; font-weight: 950; letter-spacing: -0.045em; }
      .mark { position: relative; display: grid; place-items: center; width: 43px; height: 43px; border-radius: 14px; overflow: hidden; background: var(--navy); box-shadow: 0 14px 34px rgba(7,17,31,0.22), inset 0 1px 0 rgba(255,255,255,0.18); }
      .mark img { display: block; width: 100%; height: 100%; }
      .brand-text { display: grid; gap: 2px; }
      .brand-text strong { font-size: 18px; }
      .brand-text small { color: var(--muted); font-size: 10px; font-weight: 900; letter-spacing: 0.18em; text-transform: uppercase; }
      .nav { display: flex; align-items: center; gap: 10px; }
      .btn, button { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; border: 1px solid var(--line); border-radius: 999px; padding: 0 18px; background: rgba(255,255,255,0.64); color: var(--ink); font: inherit; font-weight: 650; backdrop-filter: blur(18px); transition: transform 180ms ease, background 180ms ease, border-color 180ms ease; }
      .btn:hover, button:hover { transform: translateY(-1px); border-color: rgba(194,96,63,0.40); }
      .btn.primary, button { color: #fff; border-color: transparent; background: linear-gradient(135deg, #b1542f, #cc6e48); box-shadow: 0 18px 40px rgba(194, 96, 63, 0.26); }
      .poster { display: grid; grid-template-columns: minmax(0, 0.84fr) minmax(340px, 1.16fr); gap: clamp(24px, 5vw, 72px); align-items: center; min-height: min(620px, calc(100svh - 86px)); padding: 10px 0 42px; }
      .eyebrow { color: var(--blue); font-size: 12px; font-weight: 950; letter-spacing: 0.22em; text-transform: uppercase; }
      h1, h2, h3 { font-family: var(--font-serif, "Georgia", ui-serif, serif); font-weight: 560; font-optical-sizing: auto; }
      h1 { margin: 12px 0 16px; max-width: 16ch; font-size: clamp(46px, 5.6vw, 74px); line-height: 1.02; letter-spacing: -0.02em; }
      h2 { margin: 0; max-width: 16ch; font-size: clamp(32px, 4.4vw, 56px); line-height: 1.03; letter-spacing: -0.02em; }
      h3 { margin: 0; font-size: clamp(23px, 2.8vw, 38px); line-height: 1.05; letter-spacing: -0.015em; }
      p { margin: 0; max-width: 34rem; color: var(--muted); font-size: clamp(17px, 1.8vw, 20px); line-height: 1.5; letter-spacing: -0.01em; }
      .cta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
      .product-stage { position: relative; display: grid; gap: 14px; }
      .product-stage::before { content: ""; position: absolute; inset: -4% 2% auto 12%; height: 70%; border-radius: 999px; background: linear-gradient(135deg, rgba(217,119,87,0.20), rgba(200,168,119,0.14)); filter: blur(46px); z-index: -1; }
      .browser { overflow: hidden; border: 1px solid rgba(255,255,255,0.84); border-radius: 36px; background: rgba(255,255,255,0.62); box-shadow: var(--shadow); backdrop-filter: blur(24px); }
      .browser-top { display: none; }
      .dots { display: inline-flex; gap: 6px; }
      .dots span { width: 9px; height: 9px; border-radius: 50%; background: #0d1117; opacity: 0.18; }
      .browser-top strong { font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); }
      .browser > img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10.4; object-fit: contain; object-position: center; background: #f7faf8; }
      .hero-browser-shot { aspect-ratio: 16 / 10.4; background: #f7faf8 var(--hero-shot) center / contain no-repeat; }
      .hero-browser-shot > img { height: 100%; opacity: 0; }
      .live-screen { display: grid; gap: 14px; aspect-ratio: 16 / 10.4; padding: clamp(18px, 3vw, 34px); background: linear-gradient(135deg, #ffffff, #edf7ff); }
      .screen-head { display: grid; gap: 6px; }
      .screen-head small { color: var(--blue); font-size: 11px; font-weight: 950; letter-spacing: 0.18em; text-transform: uppercase; }
      .screen-head strong { color: var(--ink); font-size: clamp(28px, 4vw, 50px); line-height: 0.92; letter-spacing: -0.07em; }
      .screen-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
      .screen-stat { border: 1px solid var(--line); border-radius: 18px; padding: 12px; background: rgba(255,255,255,0.78); }
      .screen-stat b { display: block; color: var(--blue); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; }
      .screen-stat span { display: block; margin-top: 5px; color: var(--ink); font-size: 22px; font-weight: 950; letter-spacing: -0.05em; }
      .screen-queue { display: grid; gap: 8px; }
      .screen-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 12px; align-items: center; border: 1px solid var(--line); border-radius: 16px; padding: 12px; background: rgba(255,255,255,0.8); color: var(--ink); font-size: 14px; font-weight: 900; }
      .screen-row span { color: var(--muted); font-size: 12px; font-weight: 850; }
      .screen-row em { border-radius: 999px; padding: 6px 9px; background: #07111f; color: #fff; font-style: normal; font-size: 11px; }
      .product-ui { display: grid; gap: 14px; aspect-ratio: 16 / 10.4; padding: clamp(18px, 3vw, 30px); background: radial-gradient(circle at top right, rgba(217,119,87,.16), transparent 34%), linear-gradient(135deg, #fffaf0, #f6efe4); color: var(--ink); }
      .product-ui.dark { background: radial-gradient(circle at top right, rgba(217,119,87,.20), transparent 38%), linear-gradient(135deg, #221c17, #2c2620); color: #f8f4ec; }
      .product-ui.retail { background: radial-gradient(circle at top right, rgba(255,184,80,.24), transparent 34%), linear-gradient(135deg, #fff8eb, #f5fbff); }
      .app-frame { display: grid; grid-template-rows: auto 1fr; gap: 14px; height: 100%; min-height: 0; }
      .app-topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid rgba(13,17,23,.10); border-radius: 18px; padding: 10px 12px; background: rgba(255,255,255,.72); }
      .product-ui.dark .app-topbar { border-color: rgba(255,255,255,.14); background: rgba(255,255,255,.08); }
      .app-brand { display: flex; align-items: center; gap: 9px; min-width: 0; }
      .app-logo { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 9px; background: #07111f; overflow: hidden; }
      .app-logo img { width: 100%; height: 100%; display: block; }
      .app-brand strong { display: block; font-size: 13px; letter-spacing: -.03em; }
      .app-brand small { display: block; margin-top: 2px; color: var(--muted); font-size: 7px; font-weight: 950; letter-spacing: .22em; text-transform: uppercase; }
      .product-ui.dark .app-brand small { color: rgba(245,250,255,.62); }
      .app-nav { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
      .app-chip { border: 1px solid rgba(13,17,23,.10); border-radius: 999px; padding: 6px 8px; background: rgba(255,255,255,.72); font-size: 9px; font-weight: 950; white-space: nowrap; }
      .app-chip.active { background: #07111f; color: #fff; border-color: #07111f; }
      .product-ui.dark .app-chip { border-color: rgba(255,255,255,.14); background: rgba(255,255,255,.08); color: #f8fbff; }
      .product-ui.dark .app-chip.active { background: #d97757; color: #06221f; }
      .app-body { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(156px, .72fr); gap: 12px; min-height: 0; }
      .app-card { border: 1px solid rgba(13,17,23,.10); border-radius: 20px; background: rgba(255,255,255,.76); padding: 13px; min-width: 0; box-shadow: 0 12px 28px rgba(13,17,23,.06); }
      .product-ui.dark .app-card { border-color: rgba(255,255,255,.14); background: rgba(255,255,255,.08); box-shadow: none; }
      .app-card h4 { margin: 0; font-size: 20px; line-height: 1; letter-spacing: -.055em; }
      .app-label { display: block; margin-bottom: 6px; color: var(--blue); font-size: 8px; font-weight: 950; letter-spacing: .18em; text-transform: uppercase; }
      .product-ui.dark .app-label { color: #d97757; }
      .app-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; margin-top: 10px; }
      .app-kpi { border: 1px solid rgba(13,17,23,.08); border-radius: 13px; padding: 8px; background: rgba(255,255,255,.72); }
      .product-ui.dark .app-kpi { border-color: rgba(255,255,255,.12); background: rgba(255,255,255,.07); }
      .app-kpi b { display: block; color: var(--blue); font-size: 7px; letter-spacing: .14em; text-transform: uppercase; }
      .product-ui.dark .app-kpi b { color: #d97757; }
      .app-kpi span { display: block; margin-top: 3px; font-size: 18px; font-weight: 950; letter-spacing: -.04em; }
      .app-table { display: grid; gap: 7px; margin-top: 10px; }
      .app-row { display: grid; grid-template-columns: minmax(0,1fr) auto auto; gap: 8px; align-items: center; border: 1px solid rgba(13,17,23,.08); border-radius: 12px; padding: 8px 9px; background: rgba(255,255,255,.78); }
      .product-ui.dark .app-row { border-color: rgba(255,255,255,.12); background: rgba(255,255,255,.07); }
      .app-row strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; letter-spacing: -.015em; }
      .app-row span { color: var(--muted); font-size: 9px; font-weight: 850; white-space: nowrap; }
      .product-ui.dark .app-row span { color: rgba(245,250,255,.66); }
      .app-row em { border-radius: 999px; padding: 5px 7px; background: rgba(194,96,63,.10); color: var(--blue); font-style: normal; font-size: 8px; font-weight: 950; white-space: nowrap; }
      .product-ui.dark .app-row em { background: rgba(217,119,87,.16); color: #d97757; }
      .app-side { display: grid; gap: 9px; align-content: start; }
      .app-module { border: 1px solid rgba(13,17,23,.10); border-radius: 16px; padding: 10px; background: rgba(255,255,255,.70); }
      .product-ui.dark .app-module { border-color: rgba(255,255,255,.14); background: rgba(255,255,255,.08); }
      .app-module b { display: block; color: var(--blue); font-size: 8px; letter-spacing: .15em; text-transform: uppercase; }
      .product-ui.dark .app-module b { color: #d97757; }
      .app-module span { display: block; margin-top: 5px; font-size: 11px; line-height: 1.18; font-weight: 900; }
      .product-top { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
      .product-title small { display: block; color: var(--blue); font-size: 10px; font-weight: 950; letter-spacing: .18em; text-transform: uppercase; }
      .product-title strong { display: block; margin-top: 5px; font-size: clamp(26px, 3.5vw, 42px); line-height: .94; letter-spacing: -.07em; }
      .product-ui.dark .product-title small { color: #d97757; }
      .product-badge { border: 1px solid rgba(13,17,23,.10); border-radius: 999px; padding: 8px 10px; background: rgba(255,255,255,.72); font-size: 11px; font-weight: 950; text-transform: uppercase; white-space: nowrap; }
      .product-ui.dark .product-badge { border-color: rgba(255,255,255,.16); background: rgba(255,255,255,.08); color: #eaffff; }
      .metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
      .metric { border: 1px solid rgba(13,17,23,.10); border-radius: 16px; padding: 10px; background: rgba(255,255,255,.72); }
      .metric b { display: block; color: var(--blue); font-size: 9px; font-weight: 950; letter-spacing: .14em; text-transform: uppercase; }
      .metric span { display: block; margin-top: 4px; font-size: clamp(18px, 2vw, 28px); font-weight: 950; letter-spacing: -.05em; }
      .product-ui.dark .metric { border-color: rgba(255,255,255,.14); background: rgba(255,255,255,.08); }
      .product-ui.dark .metric b { color: #d97757; }
      .work-list { display: grid; gap: 8px; }
      .work-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; border: 1px solid rgba(13,17,23,.10); border-radius: 16px; padding: 10px 12px; background: rgba(255,255,255,.78); }
      .work-item strong { display: block; font-size: 13px; letter-spacing: -.02em; }
      .work-item span { display: block; margin-top: 3px; color: var(--muted); font-size: 11px; font-weight: 800; }
      .work-item em { border-radius: 999px; padding: 6px 8px; background: #07111f; color: #fff; font-size: 10px; font-style: normal; font-weight: 950; white-space: nowrap; }
      .product-ui.dark .work-item { border-color: rgba(255,255,255,.14); background: rgba(255,255,255,.08); }
      .product-ui.dark .work-item span { color: rgba(245,250,255,.66); }
      .product-ui.dark .work-item em { background: #d97757; color: #06221f; }
      .module-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }
      .module-tile { border: 1px solid rgba(13,17,23,.10); border-radius: 16px; padding: 11px; background: rgba(255,255,255,.68); }
      .module-tile b { display: block; color: var(--blue); font-size: 9px; letter-spacing: .14em; text-transform: uppercase; }
      .module-tile span { display: block; margin-top: 6px; font-size: 13px; font-weight: 950; letter-spacing: -.03em; }
      .product-ui.dark .module-tile { border-color: rgba(255,255,255,.14); background: rgba(255,255,255,.08); }
      .product-ui.dark .module-tile b { color: #d97757; }
      .proof-line { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
      .proof { border: 1px solid rgba(255,255,255,0.72); border-radius: 20px; padding: 14px; background: rgba(255,255,255,0.62); backdrop-filter: blur(16px); }
      .proof b { display: block; color: var(--blue); font-size: 11px; letter-spacing: 0.17em; text-transform: uppercase; }
      .proof span { display: block; margin-top: 6px; font-weight: 900; letter-spacing: -0.035em; }
      .proof-board { display: grid; grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr); gap: clamp(18px, 4vw, 44px); align-items: stretch; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: clamp(26px, 6vw, 62px) 0; }
      .proof-board h2 { max-width: 9ch; }
      .proof-board p { max-width: 35rem; font-size: 18px; }
      .proof-columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
      .proof-card { display: grid; align-content: space-between; min-height: 190px; border: 1px solid rgba(255,255,255,0.76); border-radius: 28px; padding: 18px; background: linear-gradient(145deg, rgba(255,255,255,0.74), rgba(230,240,255,0.48)); box-shadow: 0 18px 58px rgba(18, 45, 90, 0.08); }
      .proof-card small { color: var(--blue); font-size: 11px; font-weight: 950; letter-spacing: 0.17em; text-transform: uppercase; }
      .proof-card strong { display: block; margin-top: 12px; font-size: clamp(26px, 3vw, 42px); line-height: 0.92; letter-spacing: -0.07em; }
      .proof-card span { display: block; color: var(--muted); font-weight: 800; line-height: 1.38; }
      .section { border-top: 1px solid var(--line); padding: clamp(34px, 5vw, 62px) 0; }
      .split { display: grid; grid-template-columns: minmax(0, 0.72fr) minmax(320px, 1.28fr); gap: clamp(22px, 5vw, 56px); align-items: start; }
      .product-library { display: grid; gap: 22px; }
      .product-library-head { display: block; max-width: 620px; }
      .product-library-head h2 { max-width: 10ch; font-size: clamp(34px, 5vw, 58px); }
      .product-library-head p { max-width: 36rem; font-size: 18px; }
      .home-shot-proof { display: grid; gap: 18px; }
      .home-shot-proof-head { display: grid; gap: 8px; max-width: 720px; }
      .home-shot-proof-head h2 { max-width: 13ch; }
      .home-shot-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      .home-shot-card { display: grid; grid-template-rows: minmax(0, 1fr) auto; overflow: hidden; border: 1px solid rgba(255,255,255,0.76); border-radius: 28px; background: rgba(255,255,255,0.68); box-shadow: 0 22px 64px rgba(13,17,23,0.10); backdrop-filter: blur(18px); }
      .home-shot-card img { display: block; width: 100%; min-height: 210px; aspect-ratio: 16 / 11; object-fit: cover; object-position: 50% 18%; background: #fffaf0; }
      .home-shot-card span { display: grid; gap: 4px; min-height: 82px; padding: 14px; border-top: 1px solid rgba(13,17,23,0.08); }
      .home-shot-card strong { color: var(--ink); font-size: 17px; line-height: 1.05; letter-spacing: -0.04em; }
      .home-shot-card small { color: var(--muted); font-size: 12px; font-weight: 780; line-height: 1.32; }
      .outputs { display: grid; gap: 16px; }
      .output { display: grid; grid-template-columns: minmax(210px, 0.33fr) minmax(0, 1.67fr); gap: 0; overflow: hidden; min-height: 0; border: 1px solid rgba(255,255,255,0.76); border-radius: 28px; background: rgba(255,255,255,0.62); box-shadow: 0 22px 66px rgba(13,17,23,0.10); backdrop-filter: blur(20px); }
      .output-copy { display: grid; align-content: start; gap: 12px; padding: clamp(18px, 2.4vw, 28px); }
      .output-copy h3 { font-size: clamp(24px, 2.45vw, 34px); line-height: 1; }
      .output-copy p { max-width: 19rem; font-size: 14px; line-height: 1.36; }
      .feature-pills { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 4px; }
      .feature-pills span { border: 1px solid var(--line); border-radius: 999px; padding: 7px 9px; background: rgba(255,255,255,0.62); color: var(--muted); font-size: 11px; font-weight: 900; }
      .product-carousel { display: grid; grid-template-areas: "gallery gallery gallery" "prev dots next"; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: center; min-width: 0; padding-bottom: 12px; background: #fffaf0; border-left: 1px solid var(--line); }
      .product-shot-gallery { grid-area: gallery; display: flex; align-items: flex-start; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scroll-behavior: smooth; scroll-snap-type: x mandatory; gap: 0; padding: 0; background: transparent; scrollbar-width: thin; transition: height .18s ease; }
      .product-shot-card { flex: 0 0 100%; align-self: flex-start; display: grid; grid-template-rows: auto auto; gap: 0; overflow: visible; margin: 0; border: 0; border-radius: 0; background: #fffaf0; scroll-snap-align: center; }
      .product-shot-card .shot-open { display: block; min-width: 0; min-height: 0; padding: clamp(12px, 1.4vw, 18px); color: inherit; background: #f7faf7; }
      .product-shot-card img { display: block; width: 100%; height: auto; max-height: none; min-height: 0; aspect-ratio: auto; object-fit: contain; object-position: center; border: 1px solid rgba(13,17,23,.08); border-radius: 16px; background: #fffaf0; box-shadow: 0 14px 34px rgba(13,17,23,.08); }
      .product-shot-card .product-ui { min-height: 0; height: auto; aspect-ratio: 1 / 1.05; border: 0; border-radius: 0; padding: 14px; overflow: hidden; }
      .product-shot-card figcaption { display: grid; gap: 3px; min-height: 0; padding: 11px 14px; border-top: 1px solid rgba(13,17,23,.08); background: rgba(255,255,255,.9); }
      .product-shot-card figcaption strong { color: var(--ink); font-size: 15px; line-height: 1.08; letter-spacing: 0; }
      .product-shot-card figcaption span { color: var(--muted); font-size: 11px; font-weight: 780; line-height: 1.25; }
      .carousel-btn { width: 38px; height: 38px; min-height: 38px; padding: 0; border-radius: 999px; background: rgba(255,255,255,0.82); color: var(--ink); box-shadow: none; font-size: 24px; line-height: 1; }
      .carousel-btn.prev { grid-area: prev; justify-self: start; margin-left: 12px; }
      .carousel-btn.next { grid-area: next; justify-self: end; margin-right: 12px; }
      .carousel-dots { grid-area: dots; justify-self: center; display: flex; align-items: center; gap: 6px; border: 1px solid rgba(13,17,23,.08); border-radius: 999px; padding: 5px 7px; background: rgba(255,255,255,.82); box-shadow: none; }
      .carousel-dots button { width: 7px; height: 7px; min-height: 7px; padding: 0; border: 0; border-radius: 999px; background: rgba(13,17,23,.28); transition: width .18s ease, background .18s ease; }
      .carousel-dots button.active { width: 20px; background: var(--blue); }
      .product-shot-gallery .app-frame { height: auto; gap: 8px; }
      .product-shot-gallery .app-topbar { padding: 7px; border-radius: 14px; }
      .product-shot-gallery .app-logo { width: 20px; height: 20px; border-radius: 7px; }
      .product-shot-gallery .app-brand strong { font-size: 10px; }
      .product-shot-gallery .app-brand small { display: none; }
      .product-shot-gallery .app-chip { padding: 5px 7px; font-size: 8px; }
      .product-shot-gallery .app-nav .app-chip:nth-child(n+3) { display: none; }
      .product-shot-gallery .app-body { grid-template-columns: 1fr; gap: 8px; }
      .product-shot-gallery .app-card { padding: 10px; border-radius: 16px; }
      .product-shot-gallery .app-card h4 { font-size: 16px; line-height: 1; letter-spacing: -.05em; }
      .product-shot-gallery .app-label { margin-bottom: 5px; font-size: 7px; }
      .product-shot-gallery .app-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; margin-top: 8px; }
      .product-shot-gallery .app-kpi { padding: 6px; border-radius: 10px; }
      .product-shot-gallery .app-kpi:nth-child(n+4) { display: none; }
      .product-shot-gallery .app-kpi b { font-size: 6px; }
      .product-shot-gallery .app-kpi span { font-size: 14px; }
      .product-shot-gallery .app-table { gap: 5px; margin-top: 8px; }
      .product-shot-gallery .app-row { grid-template-columns: minmax(0, 1fr) auto; gap: 6px; padding: 7px; border-radius: 10px; }
      .product-shot-gallery .app-row:nth-child(n+3) { display: none; }
      .product-shot-gallery .app-row strong { font-size: 10px; }
      .product-shot-gallery .app-row span { display: none; }
      .product-shot-gallery .app-row em { padding: 4px 6px; font-size: 7px; }
      .product-shot-gallery .app-side { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
      .product-shot-gallery .app-side .app-module:nth-child(n+3) { display: none; }
      .product-shot-gallery .app-module { padding: 8px; border-radius: 12px; }
      .product-shot-gallery .app-module b { font-size: 7px; }
      .product-shot-gallery .app-module span { font-size: 10px; line-height: 1.18; }
      .output .product-ui { width: 100%; height: 100%; min-height: 430px; aspect-ratio: auto; border-left: 1px solid var(--line); padding: clamp(22px, 2.6vw, 32px); }
      .output .product-shot-gallery { border-left: 1px solid var(--line); }
      .output .app-frame { height: 100%; }
      .output .app-body { grid-template-columns: minmax(0, 1.4fr) minmax(170px, 0.6fr); align-items: stretch; }
      .output .app-card { display: grid; align-content: start; }
      .output .app-card h4 { font-size: clamp(22px, 2.1vw, 30px); line-height: 0.98; }
      .output .app-row strong { font-size: 12px; }
      .output .app-module span { font-size: 12px; line-height: 1.24; }
      .output > img { display: block; width: 100%; height: 100%; min-height: 260px; object-fit: cover; object-position: 72% 18%; border-left: 1px solid var(--line); background: #f8f4ec; }
      .mini { display: grid; gap: 8px; border-top: 1px solid var(--line); padding-top: 14px; }
      .mini span { color: var(--muted); line-height: 1.4; font-weight: 760; }
      .cases { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      .case { min-height: 230px; display: grid; align-content: space-between; gap: 20px; border: 1px solid rgba(255,255,255,0.70); border-radius: 28px; padding: 22px; background: linear-gradient(145deg, rgba(255,255,255,0.74), rgba(255,255,255,0.38)); box-shadow: 0 20px 60px rgba(13,17,23,0.09); backdrop-filter: blur(18px); }
      .case p { font-size: 16px; line-height: 1.42; }
      .case small { color: var(--blue); font-size: 11px; font-weight: 950; letter-spacing: 0.17em; text-transform: uppercase; }
      .proof-system { display: grid; grid-template-columns: minmax(0, 0.78fr) minmax(320px, 1.22fr); gap: clamp(22px, 5vw, 56px); align-items: stretch; border: 1px solid rgba(255,255,255,0.76); border-radius: 38px; padding: clamp(24px, 5vw, 44px); background: linear-gradient(135deg, rgba(255,255,255,0.74), rgba(255,255,255,0.46)); box-shadow: var(--shadow); backdrop-filter: blur(22px); }
      .proof-system p { font-size: 17px; }
      .proof-flow { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
      .proof-step { display: grid; align-content: space-between; gap: 26px; min-height: 190px; border: 1px solid var(--line); border-radius: 24px; padding: 18px; background: rgba(255,250,241,0.72); }
      .proof-step b { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 999px; color: #fff; background: var(--ink); }
      .proof-step strong { display: block; font-size: 23px; letter-spacing: -0.045em; }
      .proof-step span { display: block; margin-top: 7px; color: var(--muted); line-height: 1.42; font-weight: 760; }
      .final { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 20px; align-items: center; border: 1px solid rgba(255,255,255,0.76); border-radius: 36px; padding: clamp(24px, 5vw, 48px); background: rgba(255,255,255,0.62); box-shadow: var(--shadow); backdrop-filter: blur(22px); }
      footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 24px 0 32px; color: var(--muted); font-weight: 800; }
      footer .footer-links { display: flex; flex-wrap: wrap; gap: 10px; }
      footer .footer-links a { border: 1px solid var(--line); border-radius: 999px; padding: 8px 11px; background: rgba(255,255,255,0.52); color: var(--ink); font-size: 13px; font-weight: 950; }
      @media (prefers-reduced-motion: no-preference) {
        .copy, .product-stage { animation: rise 620ms ease both; }
        .product-stage { animation-delay: 90ms; }
        @keyframes rise { from { opacity: 1; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      }
      @media (max-width: 880px) {
        .wrap { width: min(100% - 28px, 1180px); overflow: clip; }
        header { gap: 8px; padding: 18px 0 10px; }
        .mark { width: 38px; height: 38px; border-radius: 12px; }
        .brand { flex: 1 1 auto; min-width: 0; gap: 8px; }
        .brand-text { min-width: 0; }
        .brand-text strong { display: block; max-width: 142px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 16px; }
        .brand-text strong, .brand-text small, .nav .optional-nav { display: none; }
        .nav { flex: 0 0 auto; gap: 6px; }
        .btn, button { min-height: 42px; padding: 0 12px; }
        .poster, .split, .product-library-head, .output, .proof-system, .proof-board, .final { grid-template-columns: 1fr; }
        .poster { min-height: auto; gap: 18px; padding: 20px 0 38px; }
        .eyebrow { font-size: 11px; letter-spacing: 0.18em; }
        h1 { max-width: 11ch; font-size: clamp(44px, 12vw, 60px); line-height: 0.98; letter-spacing: -0.065em; }
        h2 { font-size: clamp(34px, 10vw, 56px); }
        p { font-size: 17px; line-height: 1.42; }
        .cta { margin-top: 22px; }
        .product-stage { gap: 9px; }
        .product-stage::before { inset: -2% 0 auto 0; width: 100%; height: 54%; filter: blur(32px); }
        .browser { border-radius: 24px; }
        .browser-top { display: none; padding: 10px 13px; }
        .browser-top strong { font-size: 10px; letter-spacing: 0.11em; }
        .dots span { width: 8px; height: 8px; }
        .browser > img, .live-screen { aspect-ratio: 1.35 / 1; object-fit: contain; object-position: center; }
        .hero-browser-shot { aspect-ratio: 1.35 / 1; }
        .hero-browser-shot > img { min-height: 0; }
        .live-screen { padding: 16px; gap: 10px; overflow: hidden; }
        .product-ui { aspect-ratio: auto; min-height: 360px; padding: 16px; gap: 10px; overflow: visible; }
        .metric-grid, .module-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .metric:nth-child(4), .module-tile:nth-child(3) { display: none; }
        .product-title strong { font-size: 28px; }
        .app-frame { gap: 9px; }
        .app-topbar { padding: 8px; border-radius: 14px; }
        .app-brand small { display: none; }
        .app-nav .app-chip:nth-child(n+3) { display: none; }
        .app-body { grid-template-columns: 1fr; gap: 8px; }
        .app-card { padding: 10px; border-radius: 16px; }
        .app-card h4 { font-size: 19px; }
        .app-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
        .app-kpi:nth-child(4), .app-side .app-module:nth-child(n+3) { display: none; }
        .app-kpi { padding: 7px; }
        .app-row { grid-template-columns: 1fr auto; padding: 7px; }
        .app-row strong { overflow: visible; text-overflow: clip; white-space: normal; line-height: 1.1; }
        .app-row span { display: none; }
        .app-row:nth-child(n+3) { display: none; }
        .app-side { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .app-module { padding: 8px; border-radius: 13px; }
        .work-item { padding: 9px; }
        .screen-head strong { font-size: 30px; }
        .screen-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
        .screen-stat { padding: 9px; border-radius: 14px; }
        .screen-stat span { font-size: 18px; }
        .screen-row { grid-template-columns: 1fr; gap: 5px; padding: 10px; font-size: 13px; }
        .screen-row:nth-child(n+3) { display: none; }
        .proof-line { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
        .proof { min-height: 64px; border-radius: 16px; padding: 10px; }
        .proof b { font-size: 9px; letter-spacing: 0.13em; }
        .proof span { margin-top: 5px; font-size: 12px; line-height: 1.12; letter-spacing: -0.03em; }
        .cases, .proof-flow, .proof-columns { grid-template-columns: 1fr; }
        .output, .case, .proof-system, .proof-step, .proof-card, .final { border-radius: 24px; }
        .proof-card { min-height: 150px; }
        .output { min-height: 0; }
        .output .product-ui { min-height: 390px; height: auto; aspect-ratio: auto; overflow: visible; border-left: 0; border-top: 1px solid var(--line); }
        .product-carousel { border-left: 0; border-top: 1px solid var(--line); }
        .product-shot-card .shot-open { min-height: 0; padding: 12px; }
        .product-shot-card img { max-height: none; aspect-ratio: auto; object-fit: contain; object-position: center; }
        .carousel-btn { width: 36px; height: 36px; min-height: 36px; font-size: 22px; }
        .product-shot-card .product-ui { aspect-ratio: auto; min-height: 310px; }
        .home-shot-grid { grid-template-columns: 1fr; }
        .home-shot-card img { min-height: 205px; }
        .output .app-frame { height: auto; }
        .output .app-body { grid-template-columns: 1fr; }
        .output > img { border-left: 0; border-top: 1px solid var(--line); min-height: auto; aspect-ratio: 16 / 10; }
        .output-copy { padding: 15px 16px 16px; gap: 8px; }
        .output-copy h3 { font-size: clamp(25px, 8vw, 32px); line-height: 0.98; }
        .output-copy p { font-size: 14px; line-height: 1.32; }
        .feature-pills span { padding: 6px 8px; font-size: 10px; }
        .mini { padding-top: 10px; }
        .final .btn { width: 100%; }
      }

      :root { --gilt: #C9A24B; }
      .reveal { opacity: 0; transform: translateY(18px); transition: opacity .66s cubic-bezier(.22,1,.36,1), transform .66s cubic-bezier(.22,1,.36,1); }
      .reveal.in { opacity: 1; transform: none; }
      .hero-tagline { font-family: var(--font-serif); font-style: italic; color: var(--blue); font-size: clamp(15px, 1.4vw, 17px); margin-top: 20px; letter-spacing: -0.01em; opacity: 0.88; max-width: 28ch; }
      a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, summary:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
      .btn.primary:focus-visible, .theme-toggle:focus-visible { outline-color: var(--ink); }
      @media (prefers-reduced-motion: reduce) { html, .product-shot-gallery { scroll-behavior: auto; } .reveal, .copy, .product-stage { animation: none !important; transition: none !important; opacity: 1 !important; transform: none !important; } }
      .theme-toggle::before { content: 'Dark'; }
      :root[data-theme="dark"] .theme-toggle::before { content: 'Light'; }
      :root[data-theme="dark"] {
        color-scheme: dark;
        --cream: #1B1815; --paper: #242019; --ink: #F3EFE6; --muted: #A8A092;
        --line: rgba(243,239,230,0.12); --blue: #D97757; --blue-soft: rgba(217,119,87,0.16);
        --aqua: #E0A06B; --navy: #F3EFE6; --shadow: 0 34px 90px rgba(0,0,0,0.5); --gilt: #D7B25C;
      }
      :root[data-theme="dark"] body {
        background:
          radial-gradient(circle at 80% 2%, rgba(217,119,87,0.14), transparent 30rem),
          radial-gradient(circle at 4% 18%, rgba(200,168,119,0.08), transparent 26rem),
          linear-gradient(180deg, #1d1916 0%, var(--cream) 55%, #161310 100%);
      }
      :root[data-theme="dark"] body::before { background-image: linear-gradient(rgba(243,239,230,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(243,239,230,0.045) 1px, transparent 1px); }
      :root[data-theme="dark"] .btn, :root[data-theme="dark"] button { background: rgba(243,239,230,0.06); }
      :root[data-theme="dark"] .btn.primary, :root[data-theme="dark"] button { color: #fff; background: linear-gradient(135deg, #cc6e48, #d97757); box-shadow: 0 18px 40px rgba(217, 119, 87, 0.28); }
      :root[data-theme="dark"] .output, :root[data-theme="dark"] .feature, :root[data-theme="dark"] .proof-card, :root[data-theme="dark"] .case, :root[data-theme="dark"] .proof-system, :root[data-theme="dark"] .final, :root[data-theme="dark"] .home-shot-card, :root[data-theme="dark"] .browser, :root[data-theme="dark"] .proof, :root[data-theme="dark"] .upgrade-card, :root[data-theme="dark"] .shell-card, :root[data-theme="dark"] .setup-card, :root[data-theme="dark"] .market-card, :root[data-theme="dark"] form, :root[data-theme="dark"] .feature-pills span, :root[data-theme="dark"] .chip, :root[data-theme="dark"] .metric, :root[data-theme="dark"] .proof-step, :root[data-theme="dark"] footer .footer-links a {
        background: rgba(243,239,230,0.05); border-color: rgba(243,239,230,0.12);
      }
      :root[data-theme="dark"] .product-carousel, :root[data-theme="dark"] .product-shot-card, :root[data-theme="dark"] .product-shot-card .shot-open, :root[data-theme="dark"] .output > img { background: #201c17; }
      /* Premium product-screenshot framing — real-software look, clean on light + dark */
      .product-shot-card img { border: 1px solid rgba(42,36,28,0.12); border-radius: 14px; box-shadow: 0 22px 55px -30px rgba(42,36,28,0.45); }
      :root[data-theme="dark"] .product-shot-card img { border-color: rgba(243,239,230,0.14); box-shadow: 0 24px 60px -28px rgba(0,0,0,0.62); }
      .product-shot-card figcaption { background: transparent; border-top: 1px solid var(--line); }
      .carousel-btn { background: var(--paper); color: var(--ink); border: 1px solid var(--line); box-shadow: 0 6px 16px -10px rgba(42,36,28,0.4); }
      .carousel-dots { background: var(--paper); border-color: var(--line); box-shadow: none; }
      .carousel-dots button { background: color-mix(in srgb, var(--ink) 28%, transparent); }
      .carousel-dots button.active { background: var(--blue); }
      .output > img { border-radius: 0; }
`

const unicornHeader = `
      <script>(function(){try{var t=localStorage.getItem('sm-theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
      <header>
        <a class="brand" href="/" aria-label="SUPERMEGA.dev home">
          <span class="mark"><svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" aria-hidden="true"><g stroke="#D97757" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M35.8 10.3 A22 22 0 1 1 28.2 10.3"/><path d="M22 45 L22 26 L32 38 L42 26 L42 45" stroke-width="4"/></g><path d="M32 34.5 L33.2 37 L35.5 38 L33.2 39 L32 41.5 L30.8 39 L28.5 38 L30.8 37 Z" fill="#C9A24B"/><path d="M32 7.6 L32.9 9.7 L35 10.3 L32.9 10.9 L32 13 L31.1 10.9 L29 10.3 L31.1 9.7 Z" fill="#C9A24B"/></svg></span>
          <span class="brand-text"><strong>SUPERMEGA.dev</strong></span>
        </a>
        <nav class="nav" aria-label="Primary">
          <button class="btn secondary theme-toggle" type="button" aria-label="Toggle dark mode" onclick="var r=document.documentElement,n=r.getAttribute('data-theme')==='dark'?'light':'dark';r.setAttribute('data-theme',n);try{localStorage.setItem('sm-theme',n)}catch(e){}"></button>
          <a class="btn secondary optional-nav" href="/products/">Products</a>
          <a class="btn secondary optional-nav" href="/ai-agents/">AI Agents</a>
          <a class="btn secondary" href="/demo/">Demos</a>
          <a class="btn secondary" href="/offers/">Pricing</a>
          <a class="btn primary" href="/contact/">Contact</a>
        </nav>
      </header>
      <script>(function(){if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;if(!('IntersectionObserver'in window))return;var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{rootMargin:'0px 0px -8% 0px',threshold:0.06});addEventListener('DOMContentLoaded',function(){document.querySelectorAll('.section,.product-stage,.proof-card,.output,.uvp-card,.how-step,.home-shot-card,.sprint-card,.of-card').forEach(function(el){if(el.getBoundingClientRect().top>window.innerHeight*0.9){el.classList.add('reveal');io.observe(el);}});});})();</script>`

const productRequestLinks = {
  workflow: '/contact/?package=back-office-workflow-desk',
  factory: '/contact/?package=factory-issues-maintenance-quality',
  restaurant: '/contact/?package=restaurant-pos-menu-inventory',
  agentops: '/contact/?package=back-office-workflow-desk',
}

const publicProductBenchmarkCards = [
  {
    label: 'Custom Workflow App',
    market: 'Custom work management and workflow automation',
    incumbents: 'Airtable, monday.com, Retool Workflows',
    pattern: 'Interfaces on shared data, templates, automations, activity logs, connectors, and developer escape hatches.',
    gap: 'Reusable source-schema builder, automation simulation ledger, and connector scope packet.',
    upgrades: 'Add intake/queue/proof templates, source mapping, approval gates, Drive/Sheets/Gmail/API adapters, and OpenAI eval fixtures.',
  },
  {
    label: 'Factory Operations App',
    market: 'Frontline operations, quality, maintenance, and light MES',
    incumbents: 'Tulip, Odoo Manufacturing, MaintainX',
    pattern: 'Operator tablet flows, work orders, barcode/QR, quality checks, preventive maintenance, assets, parts, and reporting.',
    gap: 'First-class asset, work-order, inspection, CAPA, downtime, repeat-fault, and ISO evidence entities.',
    upgrades: 'Add asset/work-order tables, CAPA/5W1H approval, QR scanning, mobile photo proof, maintenance metrics, and Postgres audit trails.',
  },
  {
    label: 'Restaurant POS + Inventory',
    market: 'Restaurant POS, menu, payments, stock, kitchen, and owner reporting',
    incumbents: 'Square for Restaurants, Toast, Lightspeed Restaurant',
    pattern: 'Fast POS screens, menu modifiers, payments, receipts, inventory, kitchen routing, staff tools, and multi-location reports.',
    gap: 'Payment-provider boundaries, receipt hardware, menu modifiers, low-stock flow, cash-up proof, and settlement review.',
    upgrades: 'Add menu/modifier builder, payment proof parser, daily close, stock alerts, offline-safe local queue, receipt export, and branch dashboard.',
  },
]
  .map(
    (card) => `
              <article class="benchmark-card">
                <small>${card.market}</small>
                <h3>${card.label}</h3>
                <p><strong>Incumbents:</strong> ${card.incumbents}</p>
                <p><strong>Best borrowed pattern:</strong> ${card.pattern}</p>
                <p><strong>Gap to close:</strong> ${card.gap}</p>
                <p><strong>Next upgrades:</strong> ${card.upgrades}</p>
              </article>`,
  )
  .join('')

const publicProductUpgradePlanCards = [
  {
    label: 'Custom Workflow App',
    score: 78,
    grade: 'Sellable as a scoped pilot; needs stronger connector contracts and durable automation before broad client rollout.',
    next: 'Ship source-schema builder and connector scope packet.',
    safety: 'Agent security drill for prompt injection, malicious source text, and tool misuse.',
    integration: 'Source field map and validation rule per workflow.',
    runtime: 'LangGraph or Vercel Workflow for resumable approval loops plus OpenTelemetry traces.',
  },
  {
    label: 'Factory Operations App',
    score: 74,
    grade: 'Strong proof narrative; needs first-class asset/work-order data and mobile proof before production factory claims.',
    next: 'Ship asset/work-order/CAPA data model and starter records.',
    safety: 'Human approval before closing CAPA, changing asset state, or escalating external notifications.',
    integration: 'Asset and machine register import contract.',
    runtime: 'Postgres audit tables, QR/barcode capture, and durable maintenance escalation workflow.',
  },
  {
    label: 'Restaurant POS + Inventory',
    score: 72,
    grade: 'Useful for menu, proof, and owner reporting; needs payment, receipt, offline, and stock contracts before POS replacement.',
    next: 'Ship menu/modifier/QR publish review and daily close seed data.',
    safety: 'Manager approval before settlement changes, refunds, cash variance closeout, or menu changes.',
    integration: 'Menu, modifier, item availability, and QR publish contract.',
    runtime: 'Offline-safe local queue, payment proof parser, receipt/export adapter, and mobile cashier QA.',
  },
]
  .map(
    (card) => `
              <article class="benchmark-card">
                <small>Score ${card.score}/100</small>
                <h3>${card.label}</h3>
                <p><strong>Current grade:</strong> ${card.grade}</p>
                <p><strong>Next 30 days:</strong> ${card.next}</p>
                <p><strong>Agent safety gate:</strong> ${card.safety}</p>
                <p><strong>Integration contract:</strong> ${card.integration}</p>
                <p><strong>Runtime/tool upgrade:</strong> ${card.runtime}</p>
              </article>`,
  )
  .join('')

function productModuleShot({ tone = '', ariaLabel, appName, subtitle, nav, active, label, headline, metrics, rows, modules }) {
  const navHtml = nav.map((item) => `<span class="app-chip ${item === active ? 'active' : ''}">${item}</span>`).join('')
  const metricsHtml = metrics.map(([metricLabel, value]) => `<div class="app-kpi"><b>${metricLabel}</b><span>${value}</span></div>`).join('')
  const rowsHtml = rows.map(([title, owner, state]) => `<div class="app-row"><strong>${title}</strong><span>${owner}</span><em>${state}</em></div>`).join('')
  const modulesHtml = modules.map(([title, detail]) => `<div class="app-module"><b>${title}</b><span>${detail}</span></div>`).join('')
  return `
                <div class="product-ui ${tone}" role="img" aria-label="${ariaLabel}">
                  <div class="app-frame">
                    <div class="app-topbar">
                      <div class="app-brand"><span class="app-logo"><img src="/favicon.svg?v=supermega-atelier-20260623" alt="" /></span><div><strong>SUPERMEGA.dev</strong><small>${subtitle}</small></div></div>
                      <div class="app-nav">${navHtml}</div>
                    </div>
                    <div class="app-body">
                      <div class="app-card">
                        <span class="app-label">${label}</span>
                        <h4>${headline}</h4>
                        <div class="app-kpis">${metricsHtml}</div>
                        <div class="app-table">${rowsHtml}</div>
                      </div>
                      <div class="app-side">${modulesHtml}</div>
                    </div>
                  </div>
                </div>`
}

const publicShotVersion = '20260523-uncropped'

function publicShotSrc(src) {
  if (!src || src.includes('?')) return src
  return `${src}?v=${publicShotVersion}`
}

function productShotGallery(ariaLabel, shots) {
  return `
            <div class="product-carousel" data-carousel aria-label="${ariaLabel}">
              <button class="carousel-btn prev" type="button" data-carousel-prev aria-label="Previous screenshot">&lsaquo;</button>
              <div class="shot-gallery product-shot-gallery">
                ${shots.map((shot) => `
              <figure class="product-shot-card">
                ${shot.ui || `<a class="shot-open" href="${publicShotSrc(shot.src)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${shot.title} screenshot"><img src="${publicShotSrc(shot.src)}" alt="${shot.alt}" loading="eager" decoding="async" /></a>`}
                <figcaption><strong>${shot.title}</strong>${shot.caption ? `<span>${shot.caption}</span>` : ''}</figcaption>
              </figure>`).join('')}
              </div>
              <div class="carousel-dots" aria-label="Screenshot slides">
                ${shots.map((_, index) => `<button class="${index === 0 ? 'active' : ''}" type="button" data-carousel-dot data-slide="${index}" aria-label="Show screenshot ${index + 1}"${index === 0 ? ' aria-current="true"' : ''}></button>`).join('')}
              </div>
              <button class="carousel-btn next" type="button" data-carousel-next aria-label="Next screenshot">&rsaquo;</button>
            </div>`
}

const workflowProductGallery = productShotGallery('Custom Workflow App product screen gallery', [
  {
    ui: productModuleShot({
      ariaLabel: 'Custom Workflow App source intake screen',
      appName: 'Custom Workflow App',
      subtitle: 'Custom Workflow App',
      nav: ['Intake', 'Queue', 'Review', 'Proof'],
      active: 'Intake',
      label: 'Source intake',
      headline: 'Source records from files and messages.',
      metrics: [['Sources', '12'], ['Extracted', '9'], ['Needs review', '3']],
      rows: [['Supplier email with PDF', 'Ops', 'Indexed'], ['Drive folder import', 'Sales', 'Cleaned'], ['Photo proof upload', 'Owner', 'Review']],
      modules: [['Intake', 'Email, Drive, sheets, forms, screenshots, notes.'], ['Records', 'Rows keep source, owner, proof, and status.']],
    }),
    title: 'Source intake screen',
    caption: 'Email, Drive, forms, screenshots, and files become source records.',
  },
  {
    ui: productModuleShot({
      ariaLabel: 'Custom Workflow App work queue screen',
      appName: 'Custom Workflow App',
      subtitle: 'Custom Workflow App',
      nav: ['Intake', 'Queue', 'Review', 'Proof'],
      active: 'Queue',
      label: 'Work queue',
      headline: 'Owner, proof, status, and next action.',
      metrics: [['Open', '12'], ['Proof', '31'], ['Ready', '3'], ['Next', '5']],
      rows: [['Customer request from email', 'Sales', 'Review'], ['Supplier document update', 'Ops', 'Needs proof'], ['Manager report draft', 'Owner', 'Approve']],
      modules: [['Queue', 'Owner, risk, proof, age, and next action.'], ['Approvals', 'External sends and writes wait for review.']],
    }),
    title: 'Work queue screen',
    caption: 'Open work shows owner, proof, status, age, and next action.',
  },
  {
    ui: productModuleShot({
      ariaLabel: 'Custom Workflow App owner review screen',
      appName: 'Custom Workflow App',
      subtitle: 'Custom Workflow App',
      nav: ['Intake', 'Queue', 'Review', 'Proof'],
      active: 'Review',
      label: 'Owner review',
      headline: 'Approvals, proof pack, and owner summary.',
      metrics: [['Approvals', '5'], ['Blocked', '2'], ['Exports', '1'], ['Proof', 'Ready']],
      rows: [['Draft customer reply', 'Sales', 'Human approval'], ['Request missing invoice page', 'Ops', 'Safe to send'], ['Prepare owner summary', 'Owner', 'Review']],
      modules: [['Review', 'Approve replies, exports, and claims.'], ['Proof pack', 'Before/after evidence and release notes.']],
    }),
    title: 'Owner review screen',
    caption: 'Manager approval, proof pack, and daily owner summary in one view.',
  },
])

const factoryProductGallery = productShotGallery('Factory Operations App product screen gallery', [
  {
    ui: productModuleShot({
      ariaLabel: 'Factory Operations App WCM board screen',
      appName: 'Factory Operations App',
      subtitle: 'Factory Operations App',
      nav: ['WCM', 'Assets', 'CAPA', 'Daily'],
      active: 'WCM',
      label: 'WCM board',
      headline: 'Issue, owner, risk, due date, and evidence.',
      metrics: [['Open', '7'], ['High risk', '2'], ['Due today', '4']],
      rows: [['Inbound batch needs QC disposition', 'Quality', 'Review'], ['Main incoming meter above baseline', 'Maint.', 'Watch'], ['Shift handoff missing photo proof', 'Line 2', 'Blocked']],
      modules: [['WCM', 'Daily board, owner, risk, and due date.'], ['Evidence', 'Photos, check sheets, and source files.']],
    }),
    title: 'WCM board screen',
    caption: 'Open issues connect area, owner, risk, due date, and evidence.',
  },
  {
    ui: productModuleShot({
      ariaLabel: 'Factory Operations App assets and signals screen',
      appName: 'Factory Operations App',
      subtitle: 'Factory Operations App',
      nav: ['WCM', 'Assets', 'CAPA', 'Daily'],
      active: 'Assets',
      label: 'Assets and signals',
      headline: 'Meters, assets, photos, and exceptions.',
      metrics: [['Assets', '3'], ['Readings', '18'], ['Anomalies', '2']],
      rows: [['Utility compressor runtime under 78%', 'Assets', 'Alert'], ['Boiler pressure reading drift', 'Maint.', 'Watch'], ['Forklift checklist skipped', 'Warehouse', 'Assign']],
      modules: [['Assets', 'Machine, meter, vehicle, room, or line.'], ['Signals', 'Readings, photos, source packets, exceptions.']],
    }),
    title: 'Assets and signals screen',
    caption: 'Meters, maintenance notes, assets, photos, and exceptions become action.',
  },
  {
    ui: productModuleShot({
      ariaLabel: 'Factory Operations App CAPA and ISO evidence screen',
      appName: 'Factory Operations App',
      subtitle: 'Factory Operations App',
      nav: ['WCM', 'Assets', 'CAPA', 'Daily'],
      active: 'CAPA',
      label: 'CAPA and ISO evidence',
      headline: 'CAPA, ISO evidence, and manager review.',
      metrics: [['CAPA', '6'], ['ISO', '14'], ['Review', '16:00']],
      rows: [['Defect cluster containment', 'Quality', 'CAPA'], ['Audit trail needs source packet', 'QA', 'Evidence'], ['Manager countermeasure review', 'Director', 'Approve']],
      modules: [['CAPA', '5W1H, Ishikawa, countermeasure, owner.'], ['ISO', 'Evidence, audit trail, and closeout proof.']],
    }),
    title: 'CAPA and ISO evidence screen',
    caption: '5W1H, CAPA, ISO evidence, closeout proof, and manager review.',
  },
])

const restaurantProductGallery = productShotGallery('Restaurant POS + Inventory product screen gallery', [
  {
    ui: productModuleShot({
      tone: 'retail',
      ariaLabel: 'Restaurant POS and Inventory menu and QR screen',
      appName: 'Restaurant POS + Inventory',
      subtitle: 'Restaurant POS + Inventory',
      nav: ['Pay', 'Shift', 'Menu'],
      active: 'Menu',
      label: 'Menu and QR',
      headline: 'Menu items, approval queue, and QR page.',
      metrics: [['Items', '42'], ['Drafts', '6'], ['QR', 'Ready']],
      rows: [['Lunch menu text imported', 'Manager', 'Review'], ['QR route generated', 'Owner', 'Approve'], ['Price mismatch flagged', 'Cashier', 'Fix']],
      modules: [['Menu', 'Source text, files, item state.'], ['QR', 'Customer menu page and publish review.']],
    }),
    title: 'Menu and QR screen',
    caption: 'Photos, PDFs, or sheets become menu items, review queue, and QR page.',
  },
  {
    ui: productModuleShot({
      tone: 'retail',
      ariaLabel: 'Restaurant POS and Inventory payment proof screen',
      appName: 'Restaurant POS + Inventory',
      subtitle: 'Restaurant POS + Inventory',
      nav: ['Pay', 'Shift', 'Menu'],
      active: 'Pay',
      label: 'Payment proof',
      headline: 'Orders, payment proof, stock, and shift state.',
      metrics: [['Sales', '1.82M'], ['Pay gaps', '2'], ['Stock', '6'], ['Report', 'Draft']],
      rows: [['Payment proof needs settlement check', 'Cashier', 'Check'], ['Provider slip added to order', 'Manager', 'Paid'], ['Cash-up variance over limit', 'Owner', 'Review']],
      modules: [['Orders', 'Order ref, amount, provider, status.'], ['Payment', 'QR payload, slip, settlement ref, proof.']],
    }),
    title: 'Payment proof screen',
    caption: 'Orders, payment proof, cash gaps, stock notes, and shift state stay together.',
  },
  {
    ui: productModuleShot({
      tone: 'retail',
      ariaLabel: 'Restaurant POS and Inventory owner closeout screen',
      appName: 'Restaurant POS + Inventory',
      subtitle: 'Restaurant POS + Inventory',
      nav: ['Pay', 'Shift', 'Menu'],
      active: 'Shift',
      label: 'Owner closeout',
      headline: 'Daily close, exceptions, and owner action.',
      metrics: [['Close', 'Today'], ['Exceptions', '4'], ['Owner', 'Next']],
      rows: [['Chicken curry portions below par', 'Kitchen', 'High'], ['Evening shift handover saved', 'Manager', 'Ready'], ['Owner daily report drafted', 'Owner', 'Review']],
      modules: [['Shift', 'Stock, handover, blockers, queue.'], ['Owner', 'Daily cash and stock report.']],
    }),
    title: 'Owner closeout screen',
    caption: 'Daily close, exceptions, stock variance, and owner action are visible.',
  },
])

const workflowActualProductGallery = productShotGallery('Document Extraction Ledger product screenshot gallery', [
  { src: '/site/shots/live-product-build-app-from-workflow.png', alt: 'Document Extraction Ledger — records, queue, and source trail', title: 'Ledger view', caption: '' },
])

const factoryActualProductGallery = productShotGallery('Factory Operations App product screenshot gallery', [
  { src: '/site/shots/live-product-factory-issues-maintenance-quality.png', alt: 'Factory Operations App — quality, defects, CAPA, and maintenance', title: 'Factory view', caption: '' },
])

const restaurantActualProductGallery = productShotGallery('DeskPOS product screenshot gallery', [
  { src: '/site/shots/live-product-restaurant-pos-menu-inventory.png', alt: 'DeskPOS — point of sale, KBZPay, MMQR, daily close', title: 'POS view', caption: '' },
])

const workflowProductUi = `
<div class="product-ui" role="img" aria-label="Custom Workflow App product interface">
  <div class="app-frame">
    <div class="app-topbar">
      <div class="app-brand"><span class="app-logo"><img src="/favicon.svg?v=supermega-atelier-20260623" alt="" /></span><div><strong>SUPERMEGA.dev</strong><small>Custom Workflow App</small></div></div>
      <div class="app-nav"><span class="app-chip active">Queue</span><span class="app-chip">Evidence</span><span class="app-chip">Review</span><span class="app-chip">Export</span></div>
    </div>
    <div class="app-body">
      <div class="app-card">
        <span class="app-label">Open work, ready to act.</span>
        <h4>Every request has source, owner, proof, and next move.</h4>
        <div class="app-kpis">
          <div class="app-kpi"><b>Input</b><span>12</span></div>
          <div class="app-kpi"><b>Proof</b><span>31</span></div>
          <div class="app-kpi"><b>Next</b><span>5</span></div>
          <div class="app-kpi"><b>Ready</b><span>3</span></div>
        </div>
        <div class="app-table">
          <div class="app-row"><strong>Customer request from email</strong><span>Sales</span><em>Review</em></div>
          <div class="app-row"><strong>Supplier document update</strong><span>Ops</span><em>Needs proof</em></div>
          <div class="app-row"><strong>Manager report draft</strong><span>Owner</span><em>Approve</em></div>
        </div>
      </div>
      <div class="app-side">
        <div class="app-module"><b>Intake</b><span>Email, Drive, forms, photos, sheets.</span></div>
        <div class="app-module"><b>Records</b><span>Rows with owner, proof, status.</span></div>
        <div class="app-module"><b>Actions</b><span>Draft reply, assign, export, close.</span></div>
      </div>
    </div>
  </div>
</div>`

const factoryProductUi = `
<div class="product-ui" role="img" aria-label="Factory Operations App product interface">
  <div class="app-frame">
    <div class="app-topbar">
      <div class="app-brand"><span class="app-logo"><img src="/favicon.svg?v=supermega-atelier-20260623" alt="" /></span><div><strong>SUPERMEGA.dev</strong><small>Factory Operations App</small></div></div>
      <div class="app-nav"><span class="app-chip active">Quality</span><span class="app-chip">Assets</span><span class="app-chip">Maintenance</span><span class="app-chip">Daily</span></div>
    </div>
    <div class="app-body">
      <div class="app-card">
        <span class="app-label">Issues, assets, proof.</span>
        <h4>Plant work stays connected from issue to owner closeout.</h4>
        <div class="app-kpis">
          <div class="app-kpi"><b>Open</b><span>7</span></div>
          <div class="app-kpi"><b>Assets</b><span>3</span></div>
          <div class="app-kpi"><b>Risk</b><span>2</span></div>
          <div class="app-kpi"><b>Proof</b><span>14</span></div>
        </div>
        <div class="app-table">
          <div class="app-row"><strong>Main incoming meter above baseline</strong><span>Maint.</span><em>Watch</em></div>
          <div class="app-row"><strong>Inbound batch needs QC disposition</strong><span>Quality</span><em>Review</em></div>
          <div class="app-row"><strong>Utility compressor runtime under 78%</strong><span>Assets</span><em>Alert</em></div>
        </div>
      </div>
      <div class="app-side">
        <div class="app-module"><b>WCM</b><span>Daily board, owner, due date.</span></div>
        <div class="app-module"><b>ISO</b><span>Evidence, CAPA, audit trail.</span></div>
        <div class="app-module"><b>Signals</b><span>Meters, photos, check sheets.</span></div>
      </div>
    </div>
  </div>
</div>`

const restaurantProductUi = `
<div class="product-ui retail" role="img" aria-label="Restaurant POS and Inventory product interface">
  <div class="app-frame">
    <div class="app-topbar">
      <div class="app-brand"><span class="app-logo"><img src="/favicon.svg?v=supermega-atelier-20260623" alt="" /></span><div><strong>SUPERMEGA.dev</strong><small>Restaurant POS + Inventory</small></div></div>
      <div class="app-nav"><span class="app-chip active">Close</span><span class="app-chip">Menu</span><span class="app-chip">Stock</span><span class="app-chip">Pay</span></div>
    </div>
    <div class="app-body">
      <div class="app-card">
        <span class="app-label">Close the day cleanly.</span>
        <h4>Orders, QR menu, payment proof, stock, and owner report.</h4>
        <div class="app-kpis">
          <div class="app-kpi"><b>Sales</b><span>1.82M</span></div>
          <div class="app-kpi"><b>Pay gaps</b><span>2</span></div>
          <div class="app-kpi"><b>Stock</b><span>6</span></div>
          <div class="app-kpi"><b>Report</b><span>Draft</span></div>
        </div>
        <div class="app-table">
          <div class="app-row"><strong>Payment proof needs settlement check</strong><span>Cashier</span><em>Check</em></div>
          <div class="app-row"><strong>Menu QR ready for owner approval</strong><span>Manager</span><em>Approve</em></div>
          <div class="app-row"><strong>Chicken curry portions below par</strong><span>Kitchen</span><em>High</em></div>
        </div>
      </div>
      <div class="app-side">
        <div class="app-module"><b>POS</b><span>Orders, counter log, cashier close.</span></div>
        <div class="app-module"><b>Menu</b><span>QR menu updates and approval.</span></div>
        <div class="app-module"><b>Owner</b><span>Daily cash and stock report.</span></div>
      </div>
    </div>
  </div>
</div>`

const agentOpsProductGallery = productShotGallery('AI Back Office Operator product screenshot gallery', [
  { src: '/site/shots/live-demo-agent-builder.png', alt: 'AI Back Office Operator builder and work queue screen', title: 'Operator Builder', caption: '' },
  { src: '/site/shots/live-demo-service-desk.png', alt: 'AI Back Office Operator service queue screen', title: 'Service Queue', caption: '' },
  { src: '/site/shots/live-demo-industrial-os.png', alt: 'AI Back Office Operator run control screen', title: 'Run Control', caption: '' },
])

function productMediaStack(_productUi, gallery) {
  return `
            <div class="shot-gallery product-media-stack">
              ${gallery.replace('class="shot-gallery product-shot-gallery"', 'class="product-shot-gallery"')}
            </div>`
}

const workflowProductMedia = productMediaStack(workflowProductUi, workflowActualProductGallery)
const factoryProductMedia = productMediaStack(factoryProductUi, factoryActualProductGallery)
const restaurantProductMedia = productMediaStack(restaurantProductUi, restaurantActualProductGallery)
const agentOpsProductMedia = productMediaStack('', agentOpsProductGallery)

const publicLanguageToggleScript = ''

function unicornSocialMeta({ title, description, url }) {
  const t = String(title || '').replace(/"/g, '&quot;')
  const d = String(description || '').replace(/"/g, '&quot;')
  const u = String(url || '')
  return `<meta property="og:type" content="website" />
    <meta property="og:site_name" content="SUPERMEGA.dev" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:url" content="${u}" />
    <meta property="og:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />`
}

const unicornAiAgentsHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>AI Agents in Days | SUPERMEGA.dev</title>
    <meta name="description" content="Commission an AI agent built around your real workflow. Deposit today, running in 1–5 days. Yours to keep." />
    <meta name="theme-color" content="#f4efe6" />
    <link rel="canonical" href="https://supermega.dev/ai-agents/" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    ${unicornSocialMeta({ title: 'AI Agents in Days | SUPERMEGA.dev', description: 'Commission an AI agent built around your real workflow. Deposit today, running in 1–5 days.', url: 'https://supermega.dev/ai-agents/' })}
    <style>${unicornShellStyle}
      .agent-hero { padding: clamp(56px,10vw,96px) 0 0; text-align: center; }
      .agent-hero .eyebrow { margin-bottom: 18px; }
      .agent-hero h1 { font-family: 'Fraunces', Georgia, serif; font-size: clamp(38px,6vw,72px); line-height: .95; letter-spacing: -.04em; max-width: 14ch; margin: 0 auto 24px; }
      .agent-hero p:not(.hero-tagline) { max-width: 46ch; margin: 0 auto 36px; color: var(--muted); font-size: clamp(16px,1.5vw,19px); line-height: 1.6; }
      .agent-hero .hero-tagline { margin: 16px auto 0; text-align: center; }
      .sprint-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 20px; margin-top: 48px; }
      .sprint-card { border: 1px solid var(--line); border-radius: 18px; padding: 28px; background: rgba(255,255,255,0.55); display: flex; flex-direction: column; gap: 14px; }
      .sprint-card .s-time { font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--blue); }
      .sprint-card h3 { font-size: 20px; letter-spacing: -.02em; margin: 0; }
      .sprint-card p { font-size: 15px; color: var(--muted); line-height: 1.55; margin: 0; flex: 1; }
      .sprint-card .btn { align-self: flex-start; }
      .connector-section h2 { margin-bottom: 8px; }
      .connector-section .section-sub { color: var(--muted); font-size: 15px; margin-bottom: 28px; max-width: 52ch; }
      .connector-groups { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 24px; }
      .connector-group { display: grid; gap: 10px; }
      .connector-group-label { font-size: 11px; font-weight: 950; letter-spacing: 0.16em; text-transform: uppercase; color: var(--blue); }
      .connector-grid { display: flex; flex-wrap: wrap; gap: 8px; }
      .connector-chip { border: 1px solid var(--line); border-radius: 100px; padding: 6px 14px; font-size: 13px; font-weight: 500; color: var(--muted); background: rgba(255,255,255,0.55); transition: background 180ms ease, color 180ms ease; }
      .connector-chip:hover { background: var(--blue-soft); color: var(--blue); border-color: rgba(194,96,63,0.28); }
      .connector-note { margin-top: 28px; font-size: 14px; color: var(--muted); max-width: 52ch; }
      @media (max-width: 880px) { .connector-groups { grid-template-columns: 1fr; gap: 20px; } }
      .agent-proof { margin: 64px auto 0; max-width: 600px; text-align: center; }
      .agent-proof blockquote { font-family: 'Fraunces', Georgia, serif; font-size: clamp(17px,2vw,22px); font-style: italic; line-height: 1.45; color: var(--ink); border-left: 3px solid var(--blue); padding-left: 20px; text-align: left; margin: 0 0 20px; }
      .agent-proof cite { font-size: 14px; color: var(--muted); display: block; margin-top: 8px; }
      @media (max-width: 880px) { .sprint-grid { grid-template-columns: 1fr; } }
      :root[data-theme="dark"] .sprint-card { background: rgba(243,239,230,0.05); }
      :root[data-theme="dark"] .connector-chip { background: rgba(243,239,230,0.05); border-color: rgba(243,239,230,0.12); }
      :root[data-theme="dark"] .connector-chip:hover { background: rgba(217,119,87,0.12); color: #D97757; border-color: rgba(217,119,87,0.28); }
    </style>
  </head>
  <body>
    <div class="wrap">
${unicornHeader}
      <main>
        <section class="agent-hero section">
          <div class="eyebrow">Sprint builds · 1–5 days · Yours to keep</div>
          <h1>An AI agent for your exact job.</h1>
          <p>Tell us the one task eating your team's time. We build an agent that reads your real data — Gmail, Drive, Sheets, Viber — drafts the work, and holds for your sign-off before anything moves.</p>
          <div class="cta"><a class="btn primary" href="/contact/?package=agent">Commission a build</a><a class="btn secondary" href="/offers/">See pricing</a></div>
          <p class="hero-tagline">Cast real work into software.</p>
        </section>

        <section class="section">
          <div class="sprint-grid">
            <div class="sprint-card">
              <div class="s-time">3–5 days</div>
              <h3>Email Intelligence Agent</h3>
              <p>Reads your inbox, surfaces what needs action, writes reply drafts. You approve before anything sends.</p>
              <a class="btn secondary" href="/contact/?package=agent-email">Commission this agent</a>
            </div>
            <div class="sprint-card">
              <div class="s-time">3–5 days</div>
              <h3>Drive Document Processor</h3>
              <p>A file lands in your Drive. AI pulls the key fields and updates your Sheet automatically — no re-typing.</p>
              <a class="btn secondary" href="/contact/?package=agent-drive">Commission this agent</a>
            </div>
            <div class="sprint-card">
              <div class="s-time">1–2 days</div>
              <h3>Scheduled Digest Agent</h3>
              <p>Daily or weekly AI summary of what matters, delivered to your inbox. Set it once, it runs itself.</p>
              <a class="btn secondary" href="/contact/?package=agent-digest">Start in 2 days</a>
            </div>
          </div>
        </section>

        <section class="section connector-section">
          <h2>One kernel, wired into 36 real systems.</h2>
          <p class="section-sub">Agents read from the tools your team already uses and act through rails you already trust — including Myanmar-native ones no global platform has. Pick two or three to scope your first agent.</p>
          <div style="border:1px solid rgba(201,162,75,0.45);border-radius:18px;background:linear-gradient(135deg, rgba(201,162,75,0.12), rgba(194,96,63,0.06));padding:16px 20px;margin-bottom:20px">
            <div class="connector-group-label" style="color:#9a7d2f">★ Myanmar-native rails — built in, no global SaaS has these · 8</div>
            <div class="connector-grid" style="margin-top:10px">
              ${['KBZPay','WavePay','AYA Pay','CB Pay','OnePay','MMQR','CBM Rate','Viber'].map((n) => `<div class="connector-chip" style="border-color:rgba(201,162,75,0.55);background:rgba(201,162,75,0.14);color:#7a6320;font-weight:850">${n}</div>`).join('')}
            </div>
          </div>
          <div class="connector-groups">
            ${[
              ['Messaging & notify', ['Telegram', 'WhatsApp Business', 'LINE', 'LINE Notify', 'Facebook Messenger', 'Slack', 'Microsoft Teams', 'Discord', 'SMS (Twilio)', 'Email (Resend)']],
              ['Data & work', ['Gmail', 'Google Drive', 'Google Sheets', 'Google Calendar', 'Notion', 'Airtable', 'HubSpot', 'Supabase']],
              ['AI models', ['Claude (gateway)', 'Anthropic (Claude)', 'OpenAI (GPT)', 'Google Gemini', 'OpenRouter']],
              ['Commerce', ['Shopify', 'WooCommerce']],
              ['Payments (global) & integration', ['Stripe', 'Generic Webhook', 'Generic HTTP']],
            ].map(([label, items]) => `<div class="connector-group"><div class="connector-group-label">${label} · ${items.length}</div><div class="connector-grid">${items.map((n) => `<div class="connector-chip">${n}</div>`).join('')}</div></div>`).join('')}
          </div>
          <p class="connector-note">36 connectors live in the kernel today — and adding the next one is a single adapter file, not a rebuild. That's the architecture: it scales by addition, never by replacing what works. Most clients start with two or three.</p>
        </section>

        <section class="section">
          <div class="eyebrow">Technical architecture</div>
          <h2>Why this works when other platforms don't</h2>
          <p style="color:var(--muted);max-width:56ch;margin-bottom:32px">Most "AI tools" are wrappers over a single API. SuperMega is a kernel — a shared data spine, an action bus, and 36 pre-wired connectors that agents can combine to build real workflows from your actual data.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px">
            <div class="output"><strong>36 connectors, pre-wired</strong><span style="color:var(--muted);display:block;margin-top:6px;font-size:15px">Including Myanmar-native rails — KBZ Pay, Wave Pay, AYA Pay, CB Pay, MMQR, CBM Rate, and Viber. No international platform has these. An agent can read a Gmail thread, calculate in MMK at today's rate, and send a Viber alert — in one pipeline.</span></div>
            <div class="output"><strong>Multi-model AI kernel</strong><span style="color:var(--muted);display:block;margin-top:6px;font-size:15px">Claude, Gemini, and GPT-4o in one registry. Each agent call routes to the right model by task and cost. Drafting an email reply uses a cheap fast model. Classifying 500 warranty claims uses the most accurate one.</span></div>
            <div class="output"><strong>Approval-gated action bus</strong><span style="color:var(--muted);display:block;margin-top:6px;font-size:15px">Agents prepare work. You approve. Every money, send, and access action requires a human decision. The pipeline persists every action to a ledger — nothing happens silently, nothing repeats without cause.</span></div>
            <div class="output"><strong>Real-data, first call</strong><span style="color:var(--muted);display:block;margin-top:6px;font-size:15px">We connect to your actual Gmail, Drive, Sheets, and database on the first day. Not demo data, not sample exports. The first output is built from your real inputs so the price and timeline are accurate before any deposit.</span></div>
          </div>
        </section>

        <section class="section agent-proof">
          <blockquote>A Yangon factory had a year of warranty claims — about 120 of them — buried across hundreds of Gmail threads, with no owner and no way to see what was overdue. We turned them into one clean ledger: every claim with an owner, a status, and a link back to the email it came from.</blockquote>
          <cite>— A real build, from real data</cite>
          <div class="cta" style="justify-content:center;margin-top:28px">
            <a class="btn primary" href="/contact/?package=agent">Start with one agent</a>
          </div>
        </section>
      </main>
      <footer>
        <span>© 2026 SUPERMEGA.dev — custom business software for Myanmar. Built from your real data.</span>
        <span class="footer-links">
          <a href="mailto:swanhtet@supermega.dev">swanhtet@supermega.dev</a>
          <a href="/products/">Products</a>
          <a href="/demo/">Demos</a>
          <a href="/offers/">Pricing</a>
          <a href="/contact/">Contact</a>
          <a href="/privacy/">Privacy</a>
          <a href="https://www.linkedin.com/in/theswanhtet" rel="noreferrer" target="_blank">LinkedIn</a>
        </span>
      </footer>
    </div>
${publicLanguageToggleScript}
  </body>
</html>`

const productCarouselScript = `
    <script>
      document.querySelectorAll('[data-carousel]').forEach((carousel) => {
        const track = carousel.querySelector('.product-shot-gallery');
        const dots = Array.from(carousel.querySelectorAll('[data-carousel-dot]'));
        const slides = Array.from(carousel.querySelectorAll('.product-shot-card'));
        if (!track) return;
        const activeIndex = () => Math.round(track.scrollLeft / (track.getBoundingClientRect().width || track.clientWidth || 1));
        const setTrackHeight = (index) => {
          const activeSlide = slides[Math.max(0, Math.min(slides.length - 1, index))];
          if (!activeSlide) return;
          track.style.height = activeSlide.offsetHeight + 'px';
        };
        const update = () => {
          const index = Math.max(0, Math.min(dots.length - 1, activeIndex()));
          dots.forEach((dot, dotIndex) => {
            dot.classList.toggle('active', dotIndex === index);
            if (dotIndex === index) dot.setAttribute('aria-current', 'true');
            else dot.removeAttribute('aria-current');
          });
          setTrackHeight(index);
        };
        const move = (direction) => {
          const width = track.getBoundingClientRect().width || track.clientWidth || 1;
          track.scrollTo({ left: (activeIndex() + direction) * width, behavior: 'smooth' });
          window.setTimeout(update, 520);
        };
        dots.forEach((dot) => dot.addEventListener('click', () => {
          const width = track.getBoundingClientRect().width || track.clientWidth || 1;
          track.scrollTo({ left: Number(dot.dataset.slide || 0) * width, behavior: 'smooth' });
          window.setTimeout(update, 520);
        }));
        track.addEventListener('scroll', () => window.requestAnimationFrame(update), { passive: true });
        track.querySelectorAll('img').forEach((image) => {
          if (image.complete) return;
          image.addEventListener('load', update, { once: true });
        });
        window.addEventListener('resize', update);
        carousel.querySelector('[data-carousel-prev]')?.addEventListener('click', () => move(-1));
        carousel.querySelector('[data-carousel-next]')?.addEventListener('click', () => move(1));
        update();
      });
    </script>`

const unicornPublicShellHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>SUPERMEGA.dev — Custom Software for Myanmar Business</title>
    <meta name="description" content="We build custom software for Myanmar factories, distributors, and service businesses — starting from your real data. From 2,500,000 MMK. Delivered in weeks. Yours to keep." />
    <meta name="theme-color" content="#f4efe6" />
    <link rel="canonical" href="https://supermega.dev/" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <link rel="manifest" href="/site.webmanifest?v=supermega-atelier-20260623" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SUPERMEGA.dev" />
    <meta property="og:title" content="Custom business software, built for Myanmar | SUPERMEGA.dev" />
    <meta property="og:description" content="We build custom software from your real data — Viber threads, Excel, Gmail — and hand you a running system in weeks. From 2,500,000 MMK. Yours to keep." />
    <meta property="og:url" content="https://supermega.dev/" />
    <meta property="og:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Custom business software, built for Myanmar | SUPERMEGA.dev" />
    <meta name="twitter:description" content="Custom software built from your real data. From 2,500,000 MMK, delivered in weeks, yours to keep." />
    <meta name="twitter:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"SUPERMEGA.dev","url":"https://supermega.dev/","logo":"https://supermega.dev/favicon.svg","description":"Custom AI-native business software for Myanmar SMBs and factories. POS, factory operations, dashboards, AI agents, and more.","email":"swanhtet@supermega.dev","telephone":"+95-9-500-0721","sameAs":["https://www.linkedin.com/in/theswanhtet"]}</script>
    <style>${unicornShellStyle}
      /* Homepage extras */
      .proof-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px,1fr)); margin-top: 44px; border: 1px solid var(--line); border-radius: 18px; overflow: hidden; }
      .proof-strip > div { padding: 18px 22px; border-right: 1px solid var(--line); }
      .proof-strip > div:last-child { border-right: 0; }
      :root[data-theme="dark"] .proof-strip > div { border-color: rgba(243,239,230,0.1); }
      .proof-strip strong { display: block; font-family: var(--font-serif); font-size: 22px; letter-spacing: -0.03em; }
      .proof-strip span { display: block; margin-top: 4px; color: var(--muted); font-size: 13px; line-height: 1.4; }
      .proof-strip a { color: inherit; text-decoration: none; }
      .proof-strip a:hover strong { color: var(--blue); }
      .hero-tagline { font-family: var(--font-serif); font-style: italic; color: var(--blue); font-size: clamp(15px, 1.4vw, 17px); margin-top: 22px; letter-spacing: -0.01em; opacity: 0.9; }
      .uvp-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; margin-top: 24px; }
      .uvp-card { border: 1px solid var(--line); border-radius: 18px; padding: 22px; background: rgba(255,255,255,0.5); }
      :root[data-theme="dark"] .uvp-card { background: rgba(243,239,230,0.05); }
      .uvp-card strong { display: block; font-size: 18px; letter-spacing: -0.02em; }
      .uvp-card span { display: block; margin-top: 8px; color: var(--muted); font-size: 14px; line-height: 1.5; }
      .how-steps { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 16px; margin-top: 24px; }
      .how-step n { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 999px; background: var(--blue); color: #fff; font-weight: 600; font-size: 15px; }
      .how-step strong { display: block; margin-top: 12px; font-size: 18px; letter-spacing: -0.02em; }
      .how-step span { display: block; margin-top: 7px; color: var(--muted); font-size: 14px; line-height: 1.5; }
      .hero-img { width: 100%; display: block; border-radius: 16px; border: 1px solid rgba(42,36,28,0.12); box-shadow: var(--shadow); background: #f5f1e8; }
      :root[data-theme="dark"] .hero-img { border-color: rgba(243,239,230,0.14); }
      /* Founder section */
      .founder-inner { display: grid; grid-template-columns: 220px 1fr; gap: 48px; align-items: start; }
      .founder-photo-wrap { position: sticky; top: 24px; }
      .founder-photo { width: 100%; border-radius: 16px; border: 1px solid rgba(42,36,28,0.12); box-shadow: var(--shadow); display: block; }
      :root[data-theme="dark"] .founder-photo { border-color: rgba(243,239,230,0.14); }
      .founder-quote { font-family: 'Fraunces', Georgia, serif; font-size: clamp(18px,2.2vw,22px); line-height: 1.45; color: var(--ink); font-style: italic; margin: 0 0 20px; border-left: 3px solid var(--blue); padding-left: 20px; }
      .founder-copy p { color: var(--muted); line-height: 1.65; margin: 0 0 14px; }
      .founder-sig { margin-top: 24px; display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
      .founder-sig strong { font-size: 16px; letter-spacing: -0.02em; }
      .founder-sig span { font-size: 14px; color: var(--muted); }
      .founder-linkedin { font-size: 14px; font-weight: 600; color: var(--blue); text-decoration: none; }
      .founder-linkedin:hover { text-decoration: underline; }
      @media (max-width: 880px) {
        .uvp-grid { grid-template-columns: 1fr; }
        .how-steps { grid-template-columns: 1fr 1fr; }
        .proof-strip { grid-template-columns: 1fr 1fr; }
        .proof-strip > div { border-right: 0; border-bottom: 1px solid var(--line); }
        .proof-strip > div:last-child { border-bottom: 0; }
        .founder-inner { grid-template-columns: 1fr; gap: 28px; }
        .founder-photo-wrap { position: static; max-width: 180px; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
${unicornHeader}
      <main>
        <section class="poster">
          <div class="copy">
            <div class="eyebrow">Starts from your real data · Built to last · Yours to keep</div>
            <h1>Your real work, turned into software.</h1>
            <p lang="my" style="font-size:clamp(15px,2vw,18px);color:var(--clay);font-weight:800;margin:2px 0 14px;line-height:1.5">သင့်လုပ်ငန်းရဲ့ အလုပ်အကိုင်တွေကို သင်ကိုယ်တိုင် ပိုင်ဆိုင်တဲ့ ဆော့ဖ်ဝဲအဖြစ် တည်ဆောက်ပေးပါတယ်။</p>
            <p>Most businesses we work with already have a system — it's spread across a group chat, a shared Excel, and someone's memory. We pull that out, structure it, and give you software you actually own. From 2,500,000 MMK. Delivered in weeks.</p>
            <div class="cta">
              <a class="btn primary" href="/contact/">Share one workflow</a>
              <a class="btn secondary" href="viber://chat?number=%2B9595000721" aria-label="Chat with us on Viber">Chat on Viber</a>
              <a class="btn secondary" href="/demo/">See live demos</a>
              <a class="btn secondary" href="/offers/">See pricing</a>
            </div>
            <p class="hero-tagline">Cast real work into software.</p>
          </div>
          <aside class="product-stage" aria-label="DeskPOS live product — point-of-sale for Myanmar shops">
            <img class="hero-img" src="/site/shots/live-product-restaurant-pos-menu-inventory.png?v=${publicShotVersion}" alt="DeskPOS — live point of sale system" loading="eager" decoding="async" />
            <div class="proof-line" aria-label="What the software does">
              <div class="proof"><b>Live</b><span>pos.supermega.dev</span></div>
              <div class="proof"><b>First order</b><span>in 5 min</span></div>
              <div class="proof"><b>Yours to keep</b><span>One-time payment</span></div>
            </div>
          </aside>
        </section>

        <div class="proof-strip section">
          <a href="https://pos.supermega.dev/" target="_blank" rel="noopener" class="strip-item"><strong>Live now</strong><span>Try DeskPOS free ↗</span></a>
          <div class="strip-item"><strong>From 2,500,000 MMK</strong><span>Paid once, no monthly fee</span></div>
          <div class="strip-item"><strong>You own it</strong><span>No per-seat fees, ever</span></div>
          <div class="strip-item"><strong>Delivered in weeks</strong><span>Not months</span></div>
        </div>


        <section class="section" id="products">
          <h2>What we actually build</h2>
          <div class="uvp-grid">
            <div class="uvp-card"><strong>You own it.</strong><span>No per-seat fees that grow when you hire. No vendor who can switch it off. The software is yours to keep.</span></div>
            <div class="uvp-card"><strong>Built around how you work.</strong><span>Not a generic template — built from your actual data, your team's real workflow.</span></div>
            <div class="uvp-card"><strong>Reads your existing data.</strong><span>Gmail, Viber, Drive, Sheets, Telegram — we pull structure from what you already have. No migration, no manual entry.</span></div>
            <div class="uvp-card"><strong>Works in Myanmar conditions.</strong><span>Handles Burmese text, local number formats, and spotty internet. Runs fast on the hardware you already own.</span></div>
            <div class="uvp-card"><strong>Every number is traceable.</strong><span>Every extracted record links to the source chat, email, or file it came from. Nothing is made up.</span></div>
            <div class="uvp-card"><strong>You approve every action.</strong><span>AI drafts the next step; you decide whether it sends, saves, or posts. Nothing acts without your sign-off.</span></div>
          </div>
        </section>

        <section class="section">
          <div style="border:1px solid var(--line);border-radius:28px;padding:clamp(22px,4vw,40px);background:linear-gradient(135deg, rgba(194,96,63,0.055), rgba(201,162,75,0.05));">
            <div class="eyebrow" style="color:#c2603f">The part global software can't copy</div>
            <h2 style="margin:8px 0 20px;max-width:20ch">One kernel. 36 connectors. Your data, structured.</h2>
            <style>.lk-stage{margin:0 -6px}@media(max-width:680px){.lk-stage{overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:8px;scrollbar-width:thin}.lk-stage svg{min-width:600px}}</style>
            <div class="lk-stage" role="group" aria-label="Scroll to view the full kernel diagram">
            <svg viewBox="0 0 960 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="lk-t lk-d" style="width:100%;height:auto;display:block;max-width:920px;margin:0 auto" font-family="Inter, system-ui, sans-serif">
              <title id="lk-t">The SUPERMEGA kernel: your data flows in, the kernel structures it, approved actions flow out</title>
              <desc id="lk-d">Data sources (Gmail, Viber, Drive, Sheets, Telegram) feed a central kernel of 36 connectors; approved actions flow out (KBZPay request, MMK total at the CBM rate, Viber alert, approval queue, audit-linked record). Myanmar-native rails are highlighted in gold.</desc>
              <defs>
                <radialGradient id="lkCore" cx="50%" cy="38%" r="68%"><stop offset="0%" stop-color="#d3754f"/><stop offset="55%" stop-color="#c2603f"/><stop offset="100%" stop-color="#9c4a2d"/></radialGradient>
                <filter id="lkSoft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                <style>
                  .lk-pill{fill:#fffdf8;stroke:rgba(42,36,28,.16);stroke-width:1.2}
                  .lk-pill.lk-gilt{stroke:#c9a24b;stroke-width:1.6}
                  .lk-pl{fill:#2a241c;font-size:15px;font-weight:650;letter-spacing:-.01em}
                  .lk-ps{fill:#8a8073;font-size:11px;font-weight:700}
                  .lk-col{fill:#9c4a2d;font-size:11px;font-weight:900;letter-spacing:.2em}
                  .lk-wire{fill:none;stroke-linecap:round}
                  .lk-flow-in{stroke:#c2603f;stroke-width:2;stroke-dasharray:2 11;opacity:.55;animation:lkin 1.5s linear infinite}
                  .lk-flow-out{stroke:#c9a24b;stroke-width:2.2;stroke-dasharray:2 11;opacity:.7;animation:lkout 1.4s linear infinite}
                  @keyframes lkin{to{stroke-dashoffset:-13}}
                  @keyframes lkout{to{stroke-dashoffset:-13}}
                  .lk-ring{fill:none;stroke:#c9a24b;stroke-width:1.5;opacity:.5;transform-origin:480px 200px;animation:lkpulse 3.4s ease-out infinite}
                  @keyframes lkpulse{0%{transform:scale(.82);opacity:.55}70%{opacity:0}100%{transform:scale(1.5);opacity:0}}
                  .lk-dot{animation:lkblink 2.6s ease-in-out infinite}
                  @keyframes lkblink{0%,100%{opacity:.4}50%{opacity:1}}
                  @media (prefers-reduced-motion: reduce){.lk-flow-in,.lk-flow-out,.lk-ring,.lk-dot{animation:none}.lk-flow-in,.lk-flow-out{stroke-dasharray:none;opacity:.4}}
                </style>
              </defs>
              <text x="118" y="22" text-anchor="middle" class="lk-col">YOUR DATA</text>
              <text x="842" y="22" text-anchor="middle" class="lk-col" fill="#9a7d2f">ACTIONS · YOU APPROVE</text>
              <path class="lk-wire lk-flow-in" d="M212,75 C 300,75 330,200 392,200"/>
              <path class="lk-wire lk-flow-in" d="M212,137 C 300,137 332,200 392,200"/>
              <path class="lk-wire lk-flow-in" d="M212,199 C 320,199 350,200 392,200"/>
              <path class="lk-wire lk-flow-in" d="M212,261 C 320,261 350,200 392,200"/>
              <path class="lk-wire lk-flow-in" d="M212,323 C 300,323 332,200 392,200"/>
              <path class="lk-wire lk-flow-out" d="M568,200 C 630,200 660,75 748,75"/>
              <path class="lk-wire lk-flow-out" d="M568,200 C 630,200 660,137 748,137"/>
              <path class="lk-wire lk-flow-out" d="M568,200 C 640,200 670,199 748,199"/>
              <path class="lk-wire lk-flow-out" d="M568,200 C 640,200 670,261 748,261"/>
              <path class="lk-wire lk-flow-out" d="M568,200 C 630,200 660,323 748,323"/>
              <g>
                <rect class="lk-pill" x="24" y="52" width="188" height="46" rx="23"/><text class="lk-pl" x="48" y="80">Gmail</text>
                <rect class="lk-pill lk-gilt" x="24" y="114" width="188" height="46" rx="23"/><circle class="lk-dot" cx="40" cy="137" r="4" fill="#c9a24b"/><text class="lk-pl" x="56" y="142">Viber</text>
                <rect class="lk-pill" x="24" y="176" width="188" height="46" rx="23"/><text class="lk-pl" x="48" y="204">Google Drive</text>
                <rect class="lk-pill" x="24" y="238" width="188" height="46" rx="23"/><text class="lk-pl" x="48" y="266">Sheets</text>
                <rect class="lk-pill" x="24" y="300" width="188" height="46" rx="23"/><text class="lk-pl" x="48" y="328">Telegram</text>
              </g>
              <circle class="lk-ring" cx="480" cy="200" r="86"/>
              <circle cx="480" cy="200" r="82" fill="url(#lkCore)" filter="url(#lkSoft)"/>
              <circle cx="480" cy="200" r="82" fill="none" stroke="#c9a24b" stroke-width="2" opacity=".85"/>
              <text x="480" y="176" text-anchor="middle" fill="#fff" font-size="13" font-weight="900" letter-spacing=".18em">SUPERMEGA</text>
              <text x="480" y="210" text-anchor="middle" fill="#fff" font-family="Fraunces, Georgia, serif" font-size="40" font-weight="600">36</text>
              <text x="480" y="232" text-anchor="middle" fill="#f7e9d8" font-size="12" font-weight="800">connectors</text>
              <text x="480" y="306" text-anchor="middle" fill="#6f665a" font-size="12.5" font-weight="800">one kernel · one data spine</text>
              <g>
                <rect class="lk-pill lk-gilt" x="748" y="52" width="188" height="46" rx="23"/><circle class="lk-dot" cx="764" cy="75" r="4" fill="#c9a24b"/><text class="lk-pl" x="780" y="80">KBZPay request</text>
                <rect class="lk-pill lk-gilt" x="748" y="114" width="188" height="46" rx="23"/><circle class="lk-dot" cx="764" cy="137" r="4" fill="#c9a24b"/><text class="lk-pl" x="780" y="134">MMK total</text><text class="lk-ps" x="780" y="150">at today's CBM rate</text>
                <rect class="lk-pill lk-gilt" x="748" y="176" width="188" height="46" rx="23"/><circle class="lk-dot" cx="764" cy="199" r="4" fill="#c9a24b"/><text class="lk-pl" x="780" y="204">Viber alert</text>
                <rect class="lk-pill" x="748" y="238" width="188" height="46" rx="23"/><text class="lk-pl" x="772" y="266">Approval queue</text>
                <rect class="lk-pill" x="748" y="300" width="188" height="46" rx="23"/><text class="lk-pl" x="772" y="322">Audit-linked</text><text class="lk-ps" x="772" y="336">every number traceable</text>
              </g>
            </svg>
            </div>
            <p style="max-width:64ch;color:var(--muted);line-height:1.6;margin:18px auto 0;text-align:center">SUPERMEGA reads the tools your team already uses, structures the work in one kernel, and acts only when you approve. <strong style="color:#9a7d2f">Myanmar-native rails — KBZPay, Wave, AYA, CB Pay, MMQR, the live CBM rate, and Viber — are built in. No global SaaS has them.</strong></p>
          </div>
        </section>

        <style>
          @media (prefers-reduced-motion: no-preference){
            html.sm-js .section{opacity:0;transform:translateY(18px);transition:opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1)}
            html.sm-js .section.sm-in{opacity:1;transform:none}
          }
          .uvp-card,.how-step,.strip-item{transition:transform .2s ease, box-shadow .2s ease}
          .uvp-card:hover,.how-step:hover{transform:translateY(-2px)}
          a:focus-visible,.btn:focus-visible,button:focus-visible{outline:2px solid #c2603f;outline-offset:3px;border-radius:10px}
        </style>
        <script>
          (function(){
            var d=document, root=d.documentElement;
            root.classList.add('sm-js');
            function reveal(){
              var secs=[].slice.call(d.querySelectorAll('.section'));
              if(!('IntersectionObserver' in window)){secs.forEach(function(s){s.classList.add('sm-in')});return}
              var io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){en.target.classList.add('sm-in');io.unobserve(en.target)}})},{threshold:.08,rootMargin:'0px 0px -8% 0px'});
              secs.forEach(function(s){io.observe(s)});
              setTimeout(function(){secs.forEach(function(s){s.classList.add('sm-in')})},1400);
            }
            if(d.readyState!=='loading')reveal();else d.addEventListener('DOMContentLoaded',reveal);
          })();
        </script>

        <section class="section">
          <h2>How it works</h2>
          <div class="how-steps">
            <div class="how-step"><n>1</n><strong>Send one source</strong><span>A file, Viber export, Gmail chain, or spreadsheet — we start from data you already have, not a blank template.</span></div>
            <div class="how-step"><n>2</n><strong>Deposit</strong><span>50% to start. Keeps both sides honest.</span></div>
            <div class="how-step"><n>3</n><strong>Ship</strong><span>We build it and hand you a running thing at a live URL. Not a folder of files.</span></div>
            <div class="how-step"><n>4</n><strong>Care</strong><span>Optional monthly plan keeps it running and improving. Or take it and go.</span></div>
          </div>
        </section>

        <section class="section founder-section" id="founder">
          <div class="founder-inner">
            <div class="founder-photo-wrap">
              <img class="founder-photo" src="/site/social/swan-htet.jpg" alt="Swan Htet — founder, SUPERMEGA.dev" width="220" height="220" loading="lazy" decoding="async" />
            </div>
            <div class="founder-copy">
              <p class="founder-quote">"Every Myanmar business I've sat with has the same look when I ask them how they track their warranty claims — or their orders, or their suppliers. A slight pause, then: 'We have a system.' And they do. It's just split across a Viber group, a notebook on someone's desk, and one person who would be impossible to replace if they ever left."</p>
              <p>A manufacturer here in Yangon came to me last year with 18 months of warranty claims buried in Gmail. No one knew what was overdue. No one knew who owned what. The team was capable — they just had no surface to work from. Within three weeks I had built them a weekly ops brief pulled from their own data: owner column, days-open, escalation flag. They run it every Monday now. No subscription. No vendor to call. It's theirs.</p>
              <p>I do this full-time, one business at a time, here in Yangon. I don't pitch you a platform or ask you to change how your team works. I start by turning your existing data — whatever you have, however messy — into one screen that's immediately useful. If that first screen doesn't feel worth it to you, we stop there and you owe me nothing. The only ask is one honest conversation about what's actually breaking.</p>
              <div class="founder-sig">
                <strong>Swan Htet</strong>
                <span>Founder, SUPERMEGA.dev</span>
                <a class="founder-linkedin" href="https://www.linkedin.com/in/theswanhtet" target="_blank" rel="noopener noreferrer">LinkedIn →</a>
              </div>
            </div>
          </div>
        </section>

        <section class="section">
          <div class="final">
            <div><h2>Tell us the one thing to fix first.</h2></div>
            <div style="display:flex;gap:12px;flex-wrap:wrap">
              <a class="btn primary" href="/contact/?package=build">Book a build</a>
              <a class="btn secondary" href="/offers/">See pricing</a>
            </div>
          </div>
        </section>
      </main>
      <footer>
        <span>© 2026 SUPERMEGA.dev — custom business software for Myanmar. Built from your real data.</span>
        <span class="footer-links">
          <a href="mailto:swanhtet@supermega.dev">swanhtet@supermega.dev</a>
          <a href="tel:+9595000721">+95 9 500 0721</a>
          <a href="/products/">Products</a>
          <a href="/demo/">Demos</a>
          <a href="/offers/">Pricing</a>
          <a href="https://www.linkedin.com/in/theswanhtet" rel="noreferrer" target="_blank">LinkedIn</a>
        </span>
      </footer>
    </div>
${publicLanguageToggleScript}
${productCarouselScript}
  </body>
</html>`

const unicornProductsHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Products | SUPERMEGA.dev</title>
    <meta name="description" content="SUPERMEGA.dev products for Myanmar shops, factories, and restaurants: DeskPOS, the Factory & Operations App, and Custom Solutions & AI Agents — built from your real data." />
    <meta name="theme-color" content="#f4efe6" />
    <link rel="canonical" href="https://supermega.dev/products/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SUPERMEGA.dev" />
    <meta property="og:title" content="SUPERMEGA.dev products — software for Myanmar shops, factories, and restaurants" />
    <meta property="og:description" content="DeskPOS, the Factory & Operations App, and Custom Solutions & AI Agents — built from real work." />
    <meta property="og:url" content="https://supermega.dev/products/" />
    <meta property="og:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="SUPERMEGA.dev products" />
    <meta name="twitter:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"CollectionPage","name":"SUPERMEGA.dev products","url":"https://supermega.dev/products/","description":"Custom business software for Myanmar shops, factories, and restaurants."}</script>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>${unicornShellStyle}
      main { padding-bottom: 72px; }
      .poster { min-height: auto; align-items: end; padding-top: 34px; }
      .poster h1 { max-width: 10.2ch; }
      .poster p { max-width: 40rem; }
      .gallery { display: grid; gap: 18px; }
      .feature { display: grid; grid-template-columns: minmax(0, 0.72fr) minmax(320px, 1.28fr); gap: 0; overflow: hidden; border: 1px solid rgba(255,255,255,0.74); border-radius: 36px; background: rgba(255,255,255,0.60); box-shadow: var(--shadow); backdrop-filter: blur(22px); }
      .feature-copy { display: grid; align-content: start; gap: 14px; padding: clamp(24px, 4vw, 44px); }
      .feature-copy p { font-size: 17px; }
      .feature-copy h2 { max-width: 17ch; font-size: clamp(34px, 4vw, 56px); line-height: .98; letter-spacing: 0; }
      .feature .product-ui { height: 100%; min-height: 390px; border-left: 1px solid var(--line); }
      .screen-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
      .screen-strip span { display: grid; gap: 5px; min-height: 72px; border: 1px solid var(--line); border-radius: 16px; padding: 10px; background: rgba(255,255,255,0.68); color: var(--ink); font-size: 13px; font-weight: 950; }
      .screen-strip small { color: var(--blue); font-size: 10px; font-weight: 950; letter-spacing: 0.13em; text-transform: uppercase; }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
      .chip { border: 1px solid var(--line); border-radius: 999px; padding: 8px 10px; background: rgba(255,255,255,0.64); color: var(--muted); font-size: 12px; font-weight: 900; }
      .screen-gallery { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 8px 0 2px; }
      .mini-screen { display: grid; gap: 8px; min-height: 120px; border: 1px solid var(--line); border-radius: 18px; background: linear-gradient(180deg, rgba(255,255,255,.88), rgba(248,244,236,.78)); padding: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,.9); }
      .mini-screen small { color: #1265ff; font-size: 10px; font-weight: 950; letter-spacing: .16em; text-transform: uppercase; }
      .mini-screen strong { color: #0d1117; font-size: 16px; line-height: 1; letter-spacing: -.04em; }
      .mini-screen span { color: var(--muted); font-size: 12px; font-weight: 780; line-height: 1.25; }
      .shot-gallery { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: center; gap: 10px; padding: 14px; background: linear-gradient(135deg, rgba(255,255,255,.78), rgba(229,242,255,.58)); border-left: 1px solid var(--line); }
      .shot-gallery img { width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; object-position: 50% 18%; border: 1px solid rgba(13,17,23,.08); border-radius: 22px; background: rgba(255,255,255,.72); box-shadow: 0 18px 42px rgba(13,17,23,.10); }
      .shot-gallery img:first-child { grid-column: 1 / -1; aspect-ratio: 16 / 8; object-position: 50% 14%; }
      .shot-gallery img:nth-child(2), .shot-gallery img:nth-child(3), .shot-gallery img:nth-child(4) { object-position: 50% 34%; }
      .use { display: grid; gap: 10px; border-top: 1px solid var(--line); padding-top: 14px; }
      .use span { color: var(--muted); font-weight: 760; line-height: 1.42; }
      .upgrade-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-top: 18px; }
      .upgrade-card { border: 1px solid var(--line); border-radius: 24px; padding: 18px; background: rgba(255,255,255,0.58); box-shadow: 0 18px 54px rgba(13,17,23,0.08); }
      .upgrade-card small { display: block; color: var(--blue); font-size: 10px; font-weight: 950; letter-spacing: 0.14em; text-transform: uppercase; }
      .upgrade-card strong { display: block; margin-top: 8px; color: var(--ink); font-size: 18px; letter-spacing: -0.04em; line-height: 1.05; }
      .upgrade-card span { display: block; margin-top: 9px; color: var(--muted); font-size: 12px; font-weight: 800; line-height: 1.35; }
      .shell { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(320px, 1.2fr); gap: 18px; align-items: start; margin-top: 18px; }
      .shell-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
      .shell-card, .setup-card { border: 1px solid var(--line); border-radius: 22px; padding: 18px; background: rgba(255,255,255,0.58); }
      .shell-card strong, .setup-card strong { display: block; margin-bottom: 8px; letter-spacing: -0.03em; }
      .shell-card span, .setup-card span { color: var(--muted); font-weight: 760; line-height: 1.42; }
      .setup { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 18px; }
      .market { display: grid; gap: 12px; margin-top: 18px; }
      .market-card { display: grid; grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr); gap: 14px; border: 1px solid var(--line); border-radius: 28px; padding: 18px; background: rgba(255,255,255,0.58); }
      .market-card small, .tool-card small { display: block; color: var(--blue); font-size: 11px; font-weight: 950; letter-spacing: 0.13em; text-transform: uppercase; }
      .market-card h3 { margin-top: 8px; font-size: clamp(24px, 3vw, 34px); line-height: 0.94; letter-spacing: -0.06em; }
      .market-card p { margin: 9px 0 0; font-size: 15px; }
      .market-tags { display: flex; flex-wrap: wrap; gap: 7px; align-content: start; }
      .market-tags span { border: 1px solid var(--line); border-radius: 999px; padding: 8px 9px; background: rgba(255,255,255,0.64); color: var(--muted); font-size: 11px; font-weight: 900; }
      .tool-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 18px; }
      .tool-card { border: 1px solid var(--line); border-radius: 24px; padding: 18px; background: rgba(255,255,255,0.58); }
      .tool-card h3 { margin-top: 8px; font-size: 20px; letter-spacing: -0.04em; }
      .tool-card p { margin-top: 10px; font-size: 14px; }
      .template-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 20px; }
      .template-card { display: grid; gap: 10px; border: 1px solid var(--line); border-radius: 24px; padding: 18px; background: rgba(255,255,255,0.62); box-shadow: 0 18px 54px rgba(13,17,23,0.08); }
      .template-card small { color: var(--blue); font-size: 10px; font-weight: 950; letter-spacing: .13em; text-transform: uppercase; }
      .template-card h3 { margin: 0; font-size: 22px; line-height: 1.04; letter-spacing: -0.04em; }
      .template-card p, .template-card span, .template-card li { color: var(--muted); font-size: 13px; font-weight: 780; line-height: 1.35; }
      .template-card strong { color: var(--ink); font-size: 15px; letter-spacing: -0.02em; }
      .template-card ul { margin: 0; padding-left: 18px; }
      .template-card .btn { width: fit-content; min-height: 42px; padding: 0 14px; font-size: 13px; }
      .template-card .link { color: var(--blue); font-size: 12px; font-weight: 900; text-decoration: none; }
      @media (max-width: 980px) {
        .shell { grid-template-columns: 1fr; }
        .shell-grid, .setup, .tool-grid, .template-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .market-card { grid-template-columns: 1fr; }
      }
      @media (max-width: 880px) {
        .feature { grid-template-columns: 1fr; border-radius: 26px; }
        .feature img { border-left: 0; border-top: 1px solid var(--line); min-height: auto; aspect-ratio: 16 / 10; }
      }
      @media (max-width: 620px) {
        .shell-grid, .setup, .tool-grid, .template-grid { grid-template-columns: 1fr; }
      }
    </style>
    <script>
      const selectedProduct = {
        '#build-app-from-workflow': 'build-app-from-workflow',
        '#factory-issues-maintenance-quality': 'factory-issues-maintenance-quality',
        '#restaurant-pos-menu-inventory': 'restaurant-pos-menu-inventory'
      }[window.location.hash];
      if (selectedProduct) window.location.replace('/contact/?package=' + encodeURIComponent(selectedProduct));
    </script>
  </head>
  <body>
    <div class="wrap">
${unicornHeader}
      <main>
        <section class="poster">
          <div class="copy">
            <div class="eyebrow">What we build</div>
            <h1>Built for Myanmar. Yours to keep.</h1>
            <p>We're a custom studio — no fixed catalog. Pick one workflow that's hurting you right now. We return the first working screen before you approve anything bigger.</p>
            <div class="cta">
              <a class="btn primary" href="/contact/">Tell us what to fix</a>
              <a class="btn secondary" href="/demo/">See live demos</a>
              <a class="btn secondary" href="/offers/">Pricing</a>
            </div>
            <p class="hero-tagline">Cast real work into software.</p>
          </div>
          <aside class="product-stage">
            <div class="browser">
            ${workflowProductUi}
            </div>
          </aside>
        </section>

        <section class="gallery" aria-label="SUPERMEGA product lineup">
          <article class="feature" id="build-app-from-workflow">
            <div class="feature-copy">
              <div class="eyebrow">Main offer</div>
              <h2>Custom Workflow App.</h2>
              <p>For repeated work stuck in email, spreadsheets, folders, chat, or forms.</p>
              <div class="chips"><span class="chip">Daily ledger</span><span class="chip">Owner assigned</span><span class="chip">Status tracked</span><span class="chip">Overdue flagged</span><span class="chip">Source linked</span></div>
              <div class="use"><strong>First result</strong><span>A daily screen with source, owner, status, proof, and next action.</span></div>
              <a class="btn primary" href="/products/documents/">See details</a>
            </div>
            <div class="shot-gallery" aria-label="Custom Workflow App product screenshots">
              ${workflowProductUi}
            </div>
          </article>

          <article class="feature" id="factory-issues-maintenance-quality">
            <div class="feature-copy">
              <div class="eyebrow">Factory and operations</div>
              <h2>Factory Operations App.</h2>
              <p>For quality, maintenance, receiving, assets, WCM boards, ISO evidence, and factory actions.</p>
              <div class="chips"><span class="chip">WCM board</span><span class="chip">ISO evidence</span><span class="chip">CAPA / 5W1H</span><span class="chip">Maintenance</span></div>
              <div class="use"><strong>First result</strong><span>One factory screen for open issues, evidence, owner, risk, and approved action.</span></div>
              <a class="btn primary" href="/products/factory/">See details</a>
            </div>
            <div class="shot-gallery" aria-label="Factory Operations App product screenshots">
              ${factoryProductUi}
            </div>
          </article>

          <article class="feature" id="restaurant-pos-menu-inventory">
            <div class="feature-copy">
              <div class="eyebrow">Retail and service</div>
              <h2>DeskPOS — Point of Sale.</h2>
              <p>For menus, QR handoff, orders, payment proof, stock, shift notes, and daily close. Live now.</p>
              <div class="chips"><span class="chip">Menu and QR</span><span class="chip">Orders</span><span class="chip">Payment proof</span><span class="chip">Daily close</span></div>
              <div class="use"><strong>First result</strong><span>One branch can close the day with sales proof, cash gaps, stock notes, and owner report.</span></div>
              <div class="cta"><a class="btn primary" href="/products/pos/">See details</a><a class="btn secondary" href="https://pos.supermega.dev/" target="_blank" rel="noopener">Try it live ↗</a></div>
            </div>
            <div class="shot-gallery" aria-label="Restaurant POS + Inventory product screenshots">
              ${restaurantProductUi}
            </div>
          </article>

        </section>


        <section class="section" id="agent-templates" aria-label="AI agent templates">
          <div class="eyebrow">AI agent templates</div>
          <h2>Start with one useful worker.</h2>
          <p>Pick a template, send one source sample, and we return the first proof before anything is connected, sent, billed, or changed.</p>
          <div class="template-grid">
${renderPublicAgentTemplateCards()}
          </div>
        </section>

        <section class="section">
          <div class="final">
            <div>
              <div class="eyebrow">Start small</div>
              <h2>Tell us the one thing to fix first.</h2>
              <p>We reply with what we'd build first, the price, and the timeline. Fixed scope, 50% deposit to start.</p>
            </div>
            <div style="display:flex;gap:12px;flex-wrap:wrap"><a class="btn primary" href="/contact/?package=build">Book a build</a><a class="btn secondary" href="/offers/">See pricing</a></div>
          </div>
        </section>
      </main>
      <footer>
        <span>© 2026 SUPERMEGA.dev — start with one useful app. Expand only after proof.</span>
        <span class="footer-links">
          <a href="mailto:swanhtet@supermega.dev">swanhtet@supermega.dev</a>
          <a href="tel:+9595000721">+95 9 500 0721</a>
          <a href="https://www.linkedin.com/in/theswanhtet" rel="noreferrer" target="_blank">LinkedIn</a>
          <a href="/contact/">Contact</a>
        </span>
      </footer>
    </div>
${publicLanguageToggleScript}
  </body>
</html>`

const unicornContactHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Contact | SUPERMEGA.dev</title>
    <meta name="description" content="Send one workflow to SUPERMEGA. We reply with the first useful app, timeline, and approval path." />
    <link rel="canonical" href="https://supermega.dev/contact/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SUPERMEGA.dev" />
    <meta property="og:title" content="Contact SUPERMEGA.dev — send one workflow" />
    <meta property="og:description" content="Send one workflow to SUPERMEGA. We reply with the first useful app, timeline, and approval path." />
    <meta property="og:url" content="https://supermega.dev/contact/" />
    <meta property="og:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <meta name="theme-color" content="#f4efe6" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>${unicornShellStyle}
      .contact-main { display: grid; grid-template-columns: minmax(0, 0.78fr) minmax(320px, 1.22fr); gap: clamp(24px, 5vw, 64px); align-items: center; min-height: calc(100svh - 84px); padding: 14px 0 34px; }
      form { display: grid; gap: 10px; border: 1px solid rgba(255,255,255,0.74); border-radius: 28px; padding: clamp(16px, 2.8vw, 24px); background: rgba(255,255,255,0.62); box-shadow: var(--shadow); backdrop-filter: blur(22px); }
      .form-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; }
      .wide { grid-column: 1 / -1; }
      label { display: grid; gap: 7px; color: var(--muted); font-size: 12px; font-weight: 950; letter-spacing: 0.14em; text-transform: uppercase; }
      input, textarea, select { width: 100%; border: 1px solid var(--line); border-radius: 14px; background: rgba(255,250,241,0.86); color: var(--ink); padding: 11px 12px; font: inherit; outline: none; }
      input[type="file"] { cursor: pointer; }
      input[type="file"]::file-selector-button { margin-right: 10px; border: 0; border-radius: 999px; background: linear-gradient(135deg, #111827, #1265ff); color: #fff; cursor: pointer; font: inherit; font-size: 13px; font-weight: 950; padding: 9px 12px; }
      select { appearance: none; background-image: linear-gradient(45deg, transparent 50%, var(--muted) 50%), linear-gradient(135deg, var(--muted) 50%, transparent 50%); background-position: calc(100% - 20px) 20px, calc(100% - 14px) 20px; background-size: 6px 6px, 6px 6px; background-repeat: no-repeat; }
      textarea { min-height: 88px; resize: vertical; }
      input:focus, textarea:focus, select:focus { border-color: rgba(194,96,63,0.55); box-shadow: 0 0 0 4px rgba(194,96,63,0.10); }
      button { width: 100%; cursor: pointer; }
      button[disabled] { cursor: wait; opacity: 0.66; transform: none; }
      .form-status { min-height: 20px; margin: -2px 0 0; color: var(--muted); font-size: 13px; font-weight: 850; line-height: 1.35; }
      .field-help { color: var(--muted); font-size: 12px; font-weight: 800; letter-spacing: 0; line-height: 1.35; text-transform: none; }
      .upload-list { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 2px; }
      .upload-list span { border: 1px solid var(--line); border-radius: 999px; background: rgba(255,255,255,0.62); color: var(--muted); font-size: 12px; font-weight: 850; letter-spacing: 0; padding: 7px 9px; text-transform: none; }
      .next-card { display: grid; gap: 7px; border: 1px solid rgba(194,96,63,0.18); border-radius: 20px; padding: 14px; background: rgba(194,96,63,0.08); color: var(--ink); }
      .next-card[hidden] { display: none; }
      .next-card strong { font-size: 16px; letter-spacing: -0.02em; }
      .next-card span { color: var(--muted); line-height: 1.4; font-weight: 760; }
      .selected-path { display: grid; gap: 5px; border: 1px solid rgba(194,96,63,0.16); border-radius: 16px; background: rgba(194,96,63,0.055); padding: 11px 12px; }
      .selected-path small { color: var(--blue); font-size: 11px; font-weight: 950; letter-spacing: 0.14em; text-transform: uppercase; }
      .selected-path strong { font-size: 19px; letter-spacing: -0.035em; }
      .selected-path span { color: var(--muted); font-weight: 780; line-height: 1.35; }
      .selected-price { color: var(--blue); font-weight: 950; font-size: 14px; letter-spacing: 0.02em; }
      .selected-next { color: var(--muted); font-weight: 800; font-size: 13px; line-height: 1.35; }
      .policy { margin: 0; color: var(--muted); font-size: 13px; font-weight: 820; line-height: 1.4; }
      @media (max-width: 880px) {
        .contact-main { grid-template-columns: 1fr; min-height: auto; padding: 10px 0 24px; }
        .contact-main > section[aria-label="Contact SUPERMEGA"] { order: 1; }
        .contact-main > section[aria-label="Workflow contact form"] { order: 2; }
        form { gap: 7px; border-radius: 22px; padding: 12px; }
        .form-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
        label { gap: 5px; font-size: 11px; letter-spacing: 0.1em; }
        input, textarea, select { border-radius: 12px; padding: 9px 10px; }
        textarea { min-height: 64px; }
        .contact-main h1 { font-size: clamp(48px, 14vw, 66px); margin-bottom: 10px; }
        .contact-main p { font-size: 16px; line-height: 1.32; }
        .optional-mobile { display: none; }
        .selected-path, .file-label { display: none; }
        button { min-height: 44px; padding: 12px 16px; }
        .policy { font-size: 12px; line-height: 1.25; }
        .form-status { min-height: 16px; font-size: 12px; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
${unicornHeader}
      <main class="contact-main">
        <section aria-label="Contact SUPERMEGA">
          <div class="eyebrow">Contact</div>
          <h1 data-contact-heading>Send one workflow.</h1>
          <p data-contact-lead>Send the source your team already uses.</p>
        </section>
        <section aria-label="Workflow contact form">
          <form action="/api/contact-submissions" data-sm-lead-form enctype="multipart/form-data" method="post">
            <input type="hidden" name="workflow" value="General enquiry" />
            <input type="hidden" name="first_output" value="General enquiry" />
            <input type="hidden" name="requested_package" value="General enquiry" />
            <input type="hidden" name="team" value="Owner or first operating team" />
            <input type="hidden" name="urgency" value="This week" />
            <input type="hidden" name="data" value="Public contact page" />
            <input type="hidden" name="source_url" value="https://supermega.dev/contact/" />
            <input type="hidden" name="page_path" value="/contact/" />
            <input type="hidden" name="referrer" value="" />
            <input type="hidden" name="utm_source" value="" />
            <input type="hidden" name="utm_medium" value="" />
            <input type="hidden" name="utm_campaign" value="" />
            <input type="hidden" name="utm_content" value="" />
            <input type="hidden" name="utm_term" value="" />
            <input type="hidden" name="first_step" value="Review one workflow and reply with the first useful app." />
            <input type="hidden" name="onboarding_stage" value="source_review" />
            <input type="hidden" name="access_policy" value="approval_required" />
            <input type="hidden" name="workspace_status" value="not_created_until_approved" />
            <input type="hidden" name="management_owner" value="swanhtet@supermega.dev" />
            <input type="hidden" name="source_file_names" value="" />
            <input type="hidden" name="source_file_count" value="0" />
            <input type="hidden" name="product_area" value="General enquiry" />
            <input type="hidden" name="public_package" value="" />
            <input type="hidden" name="template_id" value="" />
            <input type="hidden" name="template_status" value="" />
            <input type="hidden" name="template_source_category" value="" />
            <input type="hidden" name="template_source_area" value="" />
            <input type="hidden" name="starter_kit_url" value="" />
            <input type="hidden" name="first_proof_target" value="" />
            <input type="hidden" name="price_hint" value="" />
            <div class="form-row">
              <label>Name<input autocomplete="name" name="name" required /></label>
              <label>Work email<input autocomplete="email" name="email" required type="email" /></label>
              <label class="optional-mobile">Phone / WhatsApp<input autocomplete="tel" name="phone" type="tel" /></label>
              <label>Company<input autocomplete="organization" name="company" required /></label>
              <div class="wide selected-path" data-selected-path hidden><small>Selected</small><strong>General enquiry</strong><span class="selected-price" data-selected-price hidden></span><span class="selected-next" data-selected-next hidden></span></div>
              <label class="wide file-label">Upload files<input data-file-picker multiple name="source_files" type="file" /><span class="upload-list" data-upload-list></span></label>
              <label class="wide">Source link or system<input name="source_links" placeholder="Drive folder, sheet, email thread, POS export, meter reading, device, or note" /></label>
              <label class="wide">What should become clear?<textarea name="goal" placeholder="Example: what changed, who owns it, what is missing, and what should happen next." required></textarea></label>
            </div>
            <input autocomplete="off" name="website" style="display:none" tabindex="-1" />
            <button type="submit">Send request</button>
            <p class="policy">No account or data connection before you approve the first step.</p>
            <p class="policy" style="border-top:1px solid var(--line);margin-top:10px;padding-top:10px"><strong style="color:var(--clay)">14-day money-back guarantee.</strong> KBZPay · AYA Pay · Wave Money · bank transfer. 50% deposit, fully refundable.</p>
            <p class="form-status" data-lead-status aria-live="polite"></p>
            <div class="next-card" data-next-card hidden><strong>Saved</strong><span>We review the workflow and reply with the first app to build. Nothing changes without approval.</span></div>
          </form>
        </section>
        <section aria-label="Direct contact options" style="margin-top:32px;padding-top:24px;border-top:1px solid var(--line)">
          <p style="font-size:13px;color:var(--muted);margin:0 0 14px;font-weight:850;letter-spacing:0.08em;text-transform:uppercase">Or reach us directly</p>
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
            <a href="viber://chat?number=%2B9595000721" style="display:inline-flex;align-items:center;gap:8px;background:transparent;border:1px solid var(--line);color:var(--ink);padding:11px 18px;border-radius:12px;font-size:15px;font-weight:850;text-decoration:none;letter-spacing:-0.01em" aria-label="Chat on Viber">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm5.568 16.8c-.24.576-.96 1.056-1.608 1.2-.432.096-.984.168-2.856-.624-2.4-.984-3.936-3.432-4.056-3.6-.12-.168-.984-1.32-.984-2.52s.624-1.776 1.2-1.776c.216 0 .624.024.84.576.144.36.384.984.432 1.128.12.288.024.624-.12.84l-.384.48c-.12.168-.24.36-.12.696.576 1.44 1.872 2.376 3.48 3.024.264.096.456.048.624-.144l.528-.624c.192-.24.432-.264.696-.168.648.264 1.56.648 1.8.744.288.12.48.168.528.288.048.192.048.864-.192 1.296zm.12-4.848c-.072 0-.12-.024-.12-.096-.264-2.952-2.496-5.136-5.424-5.4-.072-.024-.12-.072-.12-.144v-.528c0-.072.048-.12.12-.12 3.336.288 5.976 2.904 6.264 6.168 0 .072-.048.12-.12.12h-.6zm-1.464-1.584c-.072 0-.144-.024-.144-.12-.216-1.68-1.536-3-3.216-3.24-.072 0-.12-.072-.12-.144v-.528c0-.072.048-.12.12-.12 2.016.264 3.624 1.848 3.888 3.864 0 .072-.048.12-.12.12h-.408zm-1.272-1.584c-.072 0-.12-.048-.12-.12-.144-.792-.768-1.416-1.56-1.56-.072-.024-.12-.072-.12-.144v-.528c0-.072.048-.12.12-.12 1.128.168 2.016 1.032 2.184 2.16 0 .072-.048.12-.12.12h-.384z"/></svg>
              Chat on Viber
            </a>
            <a href="mailto:swanhtet@supermega.dev" style="display:inline-flex;align-items:center;gap:8px;background:transparent;border:1px solid var(--line);color:var(--ink);padding:11px 18px;border-radius:12px;font-size:15px;font-weight:750;text-decoration:none">
              swanhtet@supermega.dev
            </a>
            <a href="tel:+9595000721" style="display:inline-flex;align-items:center;gap:8px;background:transparent;border:1px solid var(--line);color:var(--ink);padding:11px 18px;border-radius:12px;font-size:15px;font-weight:750;text-decoration:none">
              +95 9 500 0721
            </a>
          </div>
        </section>
      </main>
      <footer>
        <span>© 2026 SUPERMEGA.dev — custom business software for Myanmar. Built from your real data.</span>
        <span class="footer-links">
          <a href="mailto:swanhtet@supermega.dev">swanhtet@supermega.dev</a>
          <a href="tel:+9595000721">+95 9 500 0721</a>
          <a href="/products/">Products</a>
          <a href="/demo/">Demos</a>
          <a href="/offers/">Pricing</a>
          <a href="/privacy/">Privacy</a>
        </span>
      </footer>
    </div>
${publicLanguageToggleScript}
    <script>
      for (const form of document.querySelectorAll('[data-sm-lead-form]')) {
        const search = new URLSearchParams(window.location.search);
        const set = (name, value) => {
          const input = form.querySelector('[name="' + name + '"]');
          if (input) input.value = value || '';
        };
        set('source_url', window.location.href);
        set('page_path', window.location.pathname + window.location.search);
        set('referrer', document.referrer || '');
        for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
          set(key, search.get(key) || '');
        }
        const filePicker = form.querySelector('[data-file-picker]');
        const uploadList = form.querySelector('[data-upload-list]');
        const syncFiles = () => {
          const files = Array.from(filePicker?.files || []).map((file) => file.name + ' (' + Math.ceil(file.size / 1024) + ' KB)');
          set('source_file_names', files.join('; '));
          set('source_file_count', String(files.length));
          if (uploadList) {
            uploadList.innerHTML = files.map((file) => '<span>' + file.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])) + '</span>').join('');
          }
        };
        if (filePicker) filePicker.addEventListener('change', syncFiles);
        const templatePackages = ${contactTemplatePackagesJson()};
        const packageAliases = {
        'ai-workflow-desk': 'document-extraction-ledger',
        'workdesk': 'back-office-workflow-desk',
        'workflow-desk': 'back-office-workflow-desk',
        'first-workflow': 'back-office-workflow-desk',
        'document-extraction-ledger': 'document-extraction-ledger',
          'operations-digital-twin': 'factory-issues-maintenance-quality',
          'digital-twin': 'factory-issues-maintenance-quality',
          'factorydesk': 'factory-issues-maintenance-quality',
          'factory-desk': 'factory-issues-maintenance-quality',
          'industrial-plant-os': 'factory-issues-maintenance-quality',
          'restaurant-group-os': 'restaurant-pos-menu-inventory',
          'restaurant-pos': 'restaurant-pos-menu-inventory',
          'restaurant-pos-desk': 'restaurant-pos-menu-inventory',
          'restaurant-desk': 'restaurant-pos-menu-inventory',
          'storedesk': 'restaurant-pos-menu-inventory',
          'service-desk-pos': 'restaurant-pos-menu-inventory'
        };
        const packages = {
          'build': {
            name: 'Custom build',
            heading: 'Tell us what to build.',
            lead: 'Tell us the one thing to build first.',
            placeholder: 'Describe what you want built — what it should do, who uses it, and what it replaces today.',
            next: 'Next: a short scope call, then 50% deposit to start.'
          },
          'tool-week': {
            name: 'Tool in a week',
            heading: 'Tell us what to build.',
            price: 'From 2,500,000 MMK',
            lead: 'Tool in a week — from 2,500,000 MMK. Tell us the one job to build.',
            placeholder: 'Describe the single sharp tool you need and the job it does.',
            next: 'Next: a short scope call, then 50% deposit to start.'
          },
          'dashboard': {
            name: 'Custom dashboard',
            heading: 'Tell us what to build.',
            price: 'From 8,000,000 MMK',
            lead: 'Custom dashboard — from 8,000,000 MMK. What should it show?',
            placeholder: 'Describe the numbers and sources it should pull together, and who reads it.',
            next: 'Next: a short scope call, then 50% deposit to start.'
          },
          'ai-agent': {
            name: 'AI agent / automation',
            heading: 'Tell us what to build.',
            price: 'From 11,000,000 MMK',
            lead: 'AI agent — from 11,000,000 MMK. What recurring job should it do?',
            placeholder: 'Describe the recurring task, the inputs it reads, and what must stay approval-only.',
            next: 'Next: a short scope call, then 50% deposit to start.'
          },
          'design-ship': {
            name: 'Design + ship system',
            heading: 'Tell us what to build.',
            price: 'From 25,000,000 MMK',
            lead: 'Design + ship system — from 25,000,000 MMK. What do you want built?',
            placeholder: 'Describe the system you want — what it does, who uses it, and what it replaces.',
            next: 'Next: a short scope call, then 50% deposit to start.'
          },
          'care-plan': {
            name: 'Care plan',
            heading: 'Keep it running.',
            price: 'Monthly plan',
            lead: 'Care plan — keep it running. What should we keep running?',
            placeholder: 'Tell us what needs hosting, changes, and improvements each month.',
            next: 'Next: we confirm scope and start the monthly plan.'
          },
          'document-extraction-ledger': {
            name: 'Document Extraction Ledger',
            lead: 'Send one source file set.',
            placeholder: 'Paste a Drive link, file list, export sample, screenshot set, or folder that should become reviewed records.'
          },
          'back-office-workflow-desk': {
            name: 'Back Office Workflow Desk',
            lead: 'Send one workflow source.',
            placeholder: 'Paste a link or describe the repeated work.'
          },
          'factory-issues-maintenance-quality': {
            name: 'Factory Operations App',
            lead: 'Send one factory source.',
            placeholder: 'Paste an issue log, QC file, maintenance note, receiving file, asset list, or source folder.'
          },
          'restaurant-pos-menu-inventory': {
            name: 'Restaurant POS + Inventory',
            lead: 'Send one restaurant source.',
            placeholder: 'Paste the menu, payment proof, stock note, order export, or daily close source.'
          }
        };
        const requestedTemplate = search.get('template') || search.get('agent_template') || '';
        const selectedTemplate = templatePackages[requestedTemplate] || templatePackages[search.get('tool') || ''] || null;
        const requestedPackage = selectedTemplate ? '' : (search.get('tool') || search.get('package') || '');
        const selectedPackage = selectedTemplate || packages[packageAliases[requestedPackage] || requestedPackage || ''];
        if (selectedPackage) {
          set('workflow', selectedPackage.name);
          set('requested_package', selectedPackage.name);
          set('first_output', selectedPackage.name);
          set('product_area', selectedPackage.productArea || selectedPackage.name);
          set('public_package', selectedPackage.name);
          set('first_step', selectedPackage.firstProof ? 'Produce first proof: ' + selectedPackage.firstProof : 'Review the source and reply with the first useful app.');
          if (selectedTemplate) {
            set('template_id', selectedTemplate.id);
            set('template_status', selectedTemplate.status);
            set('template_source_category', selectedTemplate.sourceCategory);
            set('template_source_area', selectedTemplate.sourceArea);
            set('starter_kit_url', selectedTemplate.starterKitUrl);
            set('first_proof_target', selectedTemplate.firstProof);
            set('price_hint', selectedTemplate.price);
            set('utm_campaign', search.get('utm_campaign') || 'agent_template_intake');
            set('data', [
              'Template intake: ' + selectedTemplate.id,
              'Template status: ' + selectedTemplate.status,
              'First proof: ' + selectedTemplate.firstProof,
              'Starter kit: ' + selectedTemplate.starterKitUrl,
              'Source category: ' + selectedTemplate.sourceCategory,
              'Source area: ' + selectedTemplate.sourceArea,
              'Price hint: ' + selectedTemplate.price
            ].join(' | '));
          }
          const selectedBox = document.querySelector('[data-selected-path]');
          if (selectedBox) selectedBox.hidden = false;
          const selectedPath = selectedBox && selectedBox.querySelector('strong');
          if (selectedPath) selectedPath.textContent = selectedPackage.name;
          const lead = document.querySelector('[data-contact-lead]');
          const goal = form.querySelector('[name="goal"]');
          if (lead) lead.textContent = selectedPackage.lead;
          if (goal) goal.placeholder = selectedPackage.placeholder;
          const priceEl = document.querySelector('[data-selected-price]');
          if (priceEl && selectedPackage.price) { priceEl.textContent = selectedPackage.price; priceEl.hidden = false; }
          const nextEl = document.querySelector('[data-selected-next]');
          if (nextEl) { nextEl.textContent = selectedPackage.next || 'Next: a short scope call, then 50% deposit to start.'; nextEl.hidden = false; }
          const heading = document.querySelector('[data-contact-heading]');
          if (heading && selectedPackage.heading) heading.textContent = selectedPackage.heading;
        }
        const status = form.querySelector('[data-lead-status]');
        const submit = form.querySelector('button[type="submit"]');
        const nextCard = form.querySelector('[data-next-card]');
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (form.querySelector('[name="website"]')?.value) return;
          set('first_output', form.querySelector('[name="requested_package"]')?.value || 'Custom Workflow App');
          const payload = new FormData(form);
          if (status) status.textContent = 'Sending...';
          if (nextCard) nextCard.hidden = true;
          if (submit) {
            submit.disabled = true;
            submit.textContent = 'Sending...';
          }
          try {
            const response = await fetch('/api/contact-submissions', {
              method: 'POST',
              body: payload
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.reason || 'send_failed');
            const leadId = body.pipeline?.lead_id || body.submission?.lead_id || '';
            if (status) status.textContent = leadId ? 'Sent. Reference ' + leadId + '.' : 'Sent.';
            if (nextCard) nextCard.hidden = false;
          } catch {
            if (status) status.textContent = 'Could not send here. Email swanhtet@supermega.dev.';
            if (nextCard) nextCard.hidden = true;
          } finally {
            if (submit) {
              submit.disabled = false;
              submit.textContent = 'Send request';
            }
          }
        });
      }
    </script>
  </body>
</html>`

const collapsedContactHtml = unicornContactHtml

function publicContactRedirectHtml(packageId) {
  const target = `/contact/?package=${encodeURIComponent(packageId)}`
  const escapedTarget = escapeHtml(target)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex,follow" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta http-equiv="refresh" content="0;url=${escapedTarget}" />
    <title>Continue to SuperMega</title>
    <script>window.location.replace(${JSON.stringify(target)});</script>
  </head>
  <body>
    <a href="${escapedTarget}">Continue to request this product.</a>
  </body>
</html>
`
}

function publicRedirectHtml(target, label = 'Continue') {
  const escapedTarget = escapeHtml(target)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex,follow" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta http-equiv="refresh" content="0;url=${escapedTarget}" />
    <title>Continue to SuperMega</title>
    <script>window.location.replace(${JSON.stringify(target)});</script>
  </head>
  <body>
    <a href="${escapedTarget}">${escapeHtml(label)}</a>
  </body>
</html>
`
}

function scrubTenantContent(content) {
  return content
    .replace(/Yangon Tyre/gi, 'Private client')
    .replace(/YANGON_TYRE/g, 'PRIVATE_CLIENT')
    .replace(/ytf\.supermega\.dev/gi, 'private-client.invalid')
    .replace(/www\.ytf\.supermega\.dev/gi, 'private-client.invalid')
    .replace(/ytf-plant-a\.supermega\.dev/gi, 'private-client.invalid')
    .replace(/isYtfHost/g, 'isPrivateClientHost')
    .replace(/dataset\.tenant = 'ytf'/g, "dataset.tenant = 'client'")
    .replace(/dataset\.tenant = "ytf"/g, 'dataset.tenant = "client"')
    .replace(/YTF Industrial/gi, 'Private industrial')
    .replace(/YTF Portal/gi, 'Private portal')
    .replace(/YTF Viber/gi, 'Private chat')
    .replace(/YTF WeChat/gi, 'Private chat')
    .replace(/Plant A operations/gi, 'Private operations')
    .replace(/Plant A shared/gi, 'Private shared')
}

const priceLikeJsonKey = /(?:price|pricing|usd|mrr|arr)/i

function sanitizePublicJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePublicJsonValue(item))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !priceLikeJsonKey.test(key) || /^target_pipeline_usd$/i.test(key))
        .map(([key, item]) => [key, sanitizePublicJsonValue(item)]),
    )
  }
  if (typeof value !== 'string') {
    return value
  }
  return value
    .replace(/\bUSD\s*[\d,]+(?:\s*(?:-|to)\s*(?:USD\s*)?[\d,]+)?(?:\s*\/\s*month|\s*\/month|\s*one-time|\s*monthly)?/gi, 'scope reviewed after approval')
    .replace(/\bprice\s*(?:band|range|hint)?\b/gi, 'scope')
    .replace(/\bpricing\b/gi, 'scope')
    .replace(/\bpaid\s+(?:step|diagnostic)\b/gi, 'approved first step')
}

function sanitizePublicJsonContent(content) {
  try {
    return `${JSON.stringify(sanitizePublicJsonValue(JSON.parse(content)), null, 2)}\n`
  } catch {
    return scrubTenantContent(content)
  }
}

const config = {
  version: 3,
  routes: [
    {
      src: '^/api/contact-submissions$',
      dest: '/api/contact-submissions.js',
    },
    {
      src: '^/api/contact-submissions/status$',
      dest: '/api/contact-submissions.js',
    },
    {
      src: '^/api/campaign-clicks$',
      dest: '/api/campaign-clicks.js',
    },
    {
      src: '^/api/commercial-control$',
      dest: '/api/commercial-control.js',
    },
    {
      src: '^/api/commercial-control/status$',
      dest: '/api/commercial-control.js',
    },
    {
      src: '^/api/telegram-webhook$',
      dest: '/api/telegram-webhook.js',
    },
    {
      src: '^/api/action-runner$',
      dest: '/api/action-runner.js',
    },
    {
      src: '^/api/pipeline-control/status$',
      dest: '/api/pipeline-control.js',
    },
    {
      src: '^/api/pipeline-control$',
      dest: '/api/pipeline-control.js',
    },
    {
      src: '^/api/checkout-start$',
      dest: '/api/checkout-start.js',
    },
    {
      src: '^/api/checkout-start/status$',
      dest: '/api/checkout-start.js',
    },
    {
      src: '^/api/product-activation/status$',
      dest: '/api/product-activation.js',
    },
    {
      src: '^/api/product-activation$',
      dest: '/api/product-activation.js',
    },
    {
      src: '^/api/cron/sales-daily/status$',
      dest: '/api/sales-daily.js',
    },
    {
      src: '^/api/cron/sales-daily$',
      dest: '/api/sales-daily.js',
    },
    {
      src: '^/api/health$',
      dest: '/api/health.js',
    },
    {
      src: '^/api/lead$',
      dest: '/api/lead.js',
    },
    {
      src: '^/api/(.*)$',
      dest: '/api/not-found.js',
    },
    {
      src: '^/login/?$',
      dest: '/api/public-app-handoff.js',
    },
    {
      src: '^/(app|clients)(?:/.*)?$',
      dest: '/api/public-app-handoff.js',
    },
    {
      src: '^/(?:agentops|agentops-toolbox|ai-back-office|back-office-operator|back-office-workflow-desk|openclaw|office-operator)/?$',
      status: 308,
      headers: {
        Location: '/contact/?package=back-office-workflow-desk',
      },
    },
    {
      src: '^/(?:try|book|setup|get-started|intake|free-tools|free-tool|free|builder|tool-builder|scan|calculator|workflow-scan|daily-close|payment-close|close-checker|mmqr|store-tool|agent-builder|agent-scope|ai-agent|agent-tool|agents)/?$',
      status: 308,
      headers: {
        Location: '/contact/',
      },
    },
    {
      src: '^/(?:about|demos|demo-center|enterprise-demo|modules|portal-types|implementation|how-it-works|portfolio|tools|value|proof|platform|solutions|find-companies|company-list|task-list|receiving-log|products/(?:industrial-dqms|knowledge-graph|agent-runtime|tenant-control-plane|data-science-studio))/?$',
      status: 308,
      headers: {
        Location: '/#products',
      },
    },
    {
      src: '^/products/?$',
      dest: '/products/index.html',
    },
    {
      src: '^/products/(?:ai-workflow-desk|build-app-from-workflow|workflow-desk|workdesk)/?$',
      status: 308,
      headers: {
        Location: '/contact/?package=document-extraction-ledger',
      },
    },
    {
      src: '^/products/(?:factory-issues-maintenance-quality|factorydesk|industrial-plant-os|operations-digital-twin)/?$',
      status: 308,
      headers: {
        Location: '/contact/?package=factory-issues-maintenance-quality',
      },
    },
    {
      src: '^/products/(?:restaurant-pos-desk|restaurant-pos-menu-inventory|service-desk-pos|storedesk)/?$',
      status: 308,
      headers: {
        Location: '/contact/?package=restaurant-pos-menu-inventory',
      },
    },
    {
      src: '^/products/(?:agentops|agentops-toolbox|ai-agent-operator|ai-back-office|back-office-operator|back-office-workflow-desk|openclaw)/?$',
      status: 308,
      headers: {
        Location: '/contact/?package=back-office-workflow-desk',
      },
    },
    {
      src: '^/start/?$',
      status: 308,
      headers: {
        Location: '/contact/',
      },
    },
    {
      src: '^/(?:pricing|plans|packages)/?$',
      status: 308,
      headers: {
        Location: '/offers/',
      },
    },
    {
      src: '^/c/([^/]+)/?$',
      dest: '/c/index.html',
    },
    {
      src: '^/machine/?$',
      dest: '/machine/index.html',
    },
    {
      // /ai-agents/ serves its real page (kernel story + connector catalogue + Myanmar-rails moat).
      // Un-retired 2026-06-26: the page is generated, nav-linked sitewide, in the sitemap, and
      // self-canonical, so the prior 308->/products/ left all those signals pointing at a redirect
      // (flagged high-severity by live QA). Serving the page resolves it in the value-preserving
      // direction. NOTE for Technical: if full retirement was intended instead, revert this and also
      // drop the /ai-agents/ nav link + sitemap entry + self-canonical so the signals agree.
      src: '^/ai-agents/?$',
      dest: '/ai-agents/index.html',
    },
    {
      src: '^/pricing/?$',
      status: 308,
      headers: { Location: '/offers/' },
    },
    {
      src: '^/work/?$',
      dest: '/work/index.html',
    },
    {
      src: '^/(?:site/.*|favicon\\.svg|favicon-[0-9]+\\.png|apple-touch-icon\\.png|vite\\.svg|site\\.webmanifest)$',
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
      continue: true,
    },
    {
      handle: 'filesystem',
    },
    {
      src: '^/(.*)$',
      status: 404,
      dest: '/404.html',
    },
  ],
  crons: [
    {
      path: '/api/cron/sales-daily',
      schedule: '30 2 * * *',
    },
    {
      path: '/api/action-runner',
      schedule: '*/5 * * * *',
    },
  ],
}

async function writeNodeFunction(name, opts = {}) {
  const functionDir = resolve(functionsDir, `${name}.func`)
  await mkdir(resolve(functionDir, 'api'), { recursive: true })
  await cp(resolve(root, 'api', name), resolve(functionDir, 'api', name), { force: true })
  await cp(resolve(root, 'api', 'lib'), resolve(functionDir, 'api', 'lib'), { recursive: true, force: true }).catch(() => undefined)
  if (name === 'product-activation.js') {
    await cp(
      resolve(root, 'api-static', 'site', 'product-activation-readiness.json'),
      resolve(functionDir, 'api', 'product-activation-readiness.json'),
      { force: true },
    ).catch((error) => {
      if (error?.code === 'ENOENT') return
      throw error
    })
  }
  await mkdir(resolve(functionDir, 'node_modules'), { recursive: true })
  await mkdir(resolve(functionDir, 'api', 'node_modules'), { recursive: true })
  for (const dependency of nodeFunctionDependencies) {
    const sourceDependency = resolve(root, 'node_modules', dependency)
    await Promise.all([
      cp(sourceDependency, resolve(functionDir, 'node_modules', dependency), {
        recursive: true,
        force: true,
      }),
      cp(sourceDependency, resolve(functionDir, 'api', 'node_modules', dependency), {
        recursive: true,
        force: true,
      }),
    ]).catch((error) => {
      if (error?.code === 'ENOENT') return
      throw error
    })
  }
  await writeFile(
    resolve(functionDir, 'package.json'),
    `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
    'utf8',
  )
  await writeFile(
    resolve(functionDir, '.vc-config.json'),
    `${JSON.stringify(
      {
        handler: `api/${name}`,
        runtime: 'nodejs24.x',
        architecture: 'x86_64',
        environment: {},
        shouldDisableAutomaticFetchInstrumentation: false,
        launcherType: 'Nodejs',
        shouldAddHelpers: true,
        shouldAddSourcemapSupport: false,
        awsLambdaHandler: '',
        ...(opts.maxDuration ? { maxDuration: opts.maxDuration } : {}),
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

async function removePrivateRootFunctions() {
  const rootFunctionsDir = resolve(outputDir, 'functions')
  const entries = await readdir(rootFunctionsDir).catch(() => [])
  for (const entry of entries) {
    if (entry !== 'api') {
      await rm(resolve(rootFunctionsDir, entry), { recursive: true, force: true, maxRetries: 12, retryDelay: 250 })
    }
  }
}

async function copyPublicStatic(source, destination, rootSource = source) {
  let sourceStat
  try {
    sourceStat = await stat(source)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return
    }
    throw error
  }
  const relativePath = relative(rootSource, source).replace(/\\/g, '/')
  if (relativePath && publicPathBlocklist.some((pattern) => pattern.test(relativePath))) {
    return
  }

  if (!sourceStat.isDirectory()) {
    const filename = relativePath.split('/').pop() || ''
    if (tenantAssetNameBlocklist.some((pattern) => pattern.test(filename))) {
      return
    }
    const isTextAsset = /\.(js|css|html|json|svg|txt|webmanifest)$/i.test(filename)
    if (isTextAsset) {
      const content = await readFile(source, 'utf8').catch((error) => {
        if (error?.code === 'ENOENT') return null
        throw error
      })
      if (content === null) return
      if (tenantContentBlocklist.some((pattern) => pattern.test(content))) {
        if (publicShellAsset.test(relativePath) || relativePath === 'index.html') {
          await writeTextFileEnsuringDir(destination, scrubTenantContent(content))
          return
        }
        return
      }
    }
    await mkdir(dirname(destination), { recursive: true })
    await cp(source, destination, { force: true }).catch((error) => {
      if (error?.code === 'ENOENT') return
      throw error
    })
    return
  }

  await mkdir(destination, { recursive: true })
  const entries = await readdir(source, { withFileTypes: true }).catch((error) => {
    if (error?.code === 'ENOENT') return []
    throw error
  })
  for (const entry of entries) {
    await copyPublicStatic(resolve(source, entry.name), resolve(destination, entry.name), rootSource)
  }
}

async function prunePublicStaticRoot() {
  const allowedRootDirs = new Set(['assets', 'site', 'social', 'products', 'agent-templates', 'start', 'contact', 'offers', 'work', 'operator', 'machine', 'card', 'c', 'demo', 'ai-agents', 'privacy'])
  for (const entry of await readdir(staticDir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || allowedRootDirs.has(entry.name)) continue
    await rm(resolve(staticDir, entry.name), { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
  }
}

// The public site only needs site/shots (product screenshots) and site/social (OG images). Everything else
// copied from api-static/site is internal AgentOps machine output — activation kits, first-wave prospect /
// runtime / account-brief files, sales sprints, install kits, and internal planning JSONs/SVGs for products
// we don't sell. None of it is customer-facing; strip it from the public output.
async function prunePublicSiteDir() {
  const allowedSiteEntries = new Set(['shots', 'social', 'agent-templates'])
  for (const entry of await readdir(resolve(staticDir, 'site'), { withFileTypes: true }).catch(() => [])) {
    if (allowedSiteEntries.has(entry.name)) continue
    await rm(resolve(staticDir, 'site', entry.name), { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
  }
}

await rm(outputDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
await mkdir(outputDir, { recursive: true })
await copyPublicStatic(resolve(root, 'api-static'), staticDir)
// Brand favicon is owned here (revert-proof against OneDrive restoring the old file): Arcane Atelier mark.
await writeFile(resolve(staticDir, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="SuperMega"><rect width="64" height="64" rx="16" fill="#1B1815"/><g fill="none" stroke="#D97757" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M35.8 10.3 A22 22 0 1 1 28.2 10.3"/><path d="M22 45 L22 26 L32 38 L42 26 L42 45" stroke-width="4"/></g><path d="M32 34.5 L33.2 37 L35.5 38 L33.2 39 L32 41.5 L30.8 39 L28.5 38 L30.8 37 Z" fill="#C9A24B"/><path d="M32 7.6 L32.9 9.7 L35 10.3 L32.9 10.9 L32 13 L31.1 10.9 L29 10.3 L31.1 9.7 Z" fill="#C9A24B"/><rect x=".75" y=".75" width="62.5" height="62.5" rx="15.25" fill="none" stroke="#F3EFE6" stroke-opacity=".14" stroke-width="1.5"/></svg>\n`, 'utf8')
for (const entry of await readdir(resolve(staticDir, 'site')).catch(() => [])) {
  if (/\.json$/i.test(entry)) {
    await rm(resolve(staticDir, 'site', entry), { force: true })
  }
}
await mkdir(resolve(staticDir, 'site'), { recursive: true })
for (const filename of requiredPublicSiteJsonFiles) {
  const sourceJson = await readFile(resolve(root, 'api-static', 'site', filename), 'utf8').catch(() => '')
  if (sourceJson) {
    await writeTextFileEnsuringDir(resolve(staticDir, 'site', filename), sanitizePublicJsonContent(scrubTenantContent(sourceJson)))
  }
}
await writePublicAgentTemplateStarterKits()
await mkdir(resolve(staticDir, 'site', 'shots'), { recursive: true })
await mkdir(resolve(staticDir, 'site', 'social'), { recursive: true })
for (const filename of ['supermega-portal-card.png', 'supermega-contact-qr.png', 'swan-htet.jpg']) {
  await cp(resolve(root, 'showroom', 'public', 'social', filename), resolve(staticDir, 'site', 'social', filename), { force: true })
}
const publicShotCopies = [
  ['live-demo-agent-builder.png'],
  ['live-demo-service-desk.png'],
  ['live-demo-industrial-os.png'],
  ['live-demo-restaurant-os.png'],
  ['live-demo-portal-factory.png'],
  ['live-product-build-app-from-workflow.png', 'live-product-build-app-from-workflow.png'],
  ['live-product-factory-issues-maintenance-quality.png', 'live-product-factory-issues-maintenance-quality.png'],
  ['live-product-restaurant-pos-menu-inventory.png', 'live-product-restaurant-pos-menu-inventory.png'],
  ['actual-custom-workflow-queue.png'],
  ['actual-custom-workflow-modules.png'],
  ['actual-custom-workflow-overview.png'],
  ['actual-factory-assets.png'],
  ['actual-factory-actions.png'],
  ['actual-factory-overview.png'],
  ['actual-restaurant-shift-stock.png'],
  ['actual-restaurant-menu.png'],
  ['actual-restaurant-overview.png'],
  ['product-build-app-from-workflow-intake.svg'],
  ['product-build-app-from-workflow-brief.svg'],
  ['product-factory-issues-maintenance-quality.svg'],
  ['product-factory-issues-maintenance-quality-capa.svg'],
  ['product-factory-issues-maintenance-quality-meters.svg'],
  ['product-restaurant-pos-menu-inventory-menu.svg'],
  ['product-restaurant-pos-menu-inventory-owner.svg'],
]
for (const [sourceShot, publicShot = sourceShot] of publicShotCopies) {
  await cp(resolve(root, 'showroom', 'public', 'site', 'shots', sourceShot), resolve(staticDir, 'site', 'shots', publicShot), { force: true })
}
const stalePublicAssets = [
  ['site', 'shots', 'live-demo-clean-records.svg'],
  ['site', 'shots', 'live-demo-operations-desk.svg'],
  ['site', 'shots', 'product-build-app-from-workflow.svg'],
  ['site', 'shots', 'product-factory-issue-maintenance-tracker.svg'],
  ['site', 'shots', 'product-factory-issue-maintenance-tracker-capa.svg'],
  ['site', 'shots', 'product-factory-issue-maintenance-tracker-meters.svg'],
  ['site', 'shots', 'product-factory-maintenance-quality-app.svg'],
  ['site', 'shots', 'product-factory-maintenance-quality-app-capa.svg'],
  ['site', 'shots', 'product-factory-maintenance-quality-app-meters.svg'],
  ['site', 'shots', 'product-restaurant-pos-menu-inventory.svg'],
  ['site', 'shots', 'live-product-flow-queue.png'],
  ['site', 'shots', 'live-product-flow-records.png'],
  ['site', 'shots', 'live-product-flow-actions.png'],
  ['site', 'shots', 'live-product-plant-overview.png'],
  ['site', 'shots', 'live-product-plant-assets.png'],
  ['site', 'shots', 'live-product-plant-actions.png'],
  ['site', 'shots', 'live-product-counter-overview.png'],
  ['site', 'shots', 'live-product-counter-payment.png'],
  ['site', 'shots', 'live-product-counter-queue.png'],
  ['social', 'supermega-portal-card.svg'],
]
for (const parts of stalePublicAssets) {
  await rm(resolve(staticDir, ...parts), { force: true })
}
for (const entry of await readdir(staticDir, { withFileTypes: true })) {
  if (entry.isDirectory() && !['site', 'social'].includes(entry.name)) {
    await rm(resolve(staticDir, entry.name), { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
  }
}
await writeFile(resolve(staticDir, 'index.html'), normalizePublicProductNames(unicornPublicShellHtml), 'utf8')
await writeFile(resolve(staticDir, '404.html'), `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="robots" content="noindex,nofollow" /><title>Page not found | SUPERMEGA.dev</title><meta name="theme-color" content="#1b1815" /><link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" /><style>${unicornShellStyle}</style></head><body><div class="wrap">${unicornHeader}<main><section class="poster" style="min-height:58vh;align-items:center"><div class="copy"><div class="eyebrow">404</div><h1>Page not found.</h1><p>That page doesn’t exist. Head back home, or see what we build.</p><div class="cta"><a class="btn primary" href="/">Home</a><a class="btn secondary" href="/products/">Products</a></div></div></section></main></div></body></html>`, 'utf8')
await mkdir(resolve(staticDir, 'products'), { recursive: true })
await writeFile(resolve(staticDir, 'products', 'index.html'), normalizePublicProductNames(unicornProductsHtml), 'utf8')
// Premium product detail pages (one per product, data-driven, shares the brand shell)
const productDetailDocs = [
  {
    slug: 'pos',
    displayName: 'DeskPOS — Point of Sale',
    eyebrow: 'Point of sale',
    headline: 'Ring up sales, take any payment, and close the day with proof',
    subhead: 'The counter app for spas, salons, retail shops, cafes, restaurants, and repair counters. Take cash or any digital payment; track stock and bookings; and close every day with a clean cash-up the owner can trust — even when the internet drops.',
    shot: '/site/shots/live-product-restaurant-pos-menu-inventory.png',
    whatItDoes: [
      'Rings up orders fast on a phone, tablet, or counter screen',
      'Takes cash and digital payments, and keeps the payment slip against each order',
      'Reconciles the day’s payments by method and flags anything still missing proof',
      'Counts the cash drawer and shows the variance against expected sales',
      'Tracks stock with low-stock alerts and logs waste and prep notes',
      'Keeps working offline and syncs the moment the connection returns',
    ],
    howItWorks: [
      { step: 'Ring up the order', detail: 'Staff add items and take payment — cash or any digital method — and attach the slip. Stock and the running day total update on the spot.' },
      { step: 'Match payments through the day', detail: 'Each payment is lined up against its order and anything still needing a slip is flagged, so reconciliation is mostly done before close.' },
      { step: 'Close the day', detail: 'Count the drawer, clear any variance and stock exceptions, and the owner digest goes out. The day closes with a record that holds up tomorrow.' },
    ],
    features: [
      { title: 'Fast counter checkout', desc: 'Add items, apply a discount, and take payment in a few taps — built for a busy counter on a phone or tablet.' },
      { title: 'Every payment method, with proof', desc: 'Cash and digital payments on one screen. Each order keeps its slip and reference, so a payment has evidence behind it.' },
      { title: 'Daily close and cash-up', desc: 'Payments reconciled by method, the drawer counted against expected cash, variance shown clearly. Nothing closes until gaps are explained.' },
      { title: 'Stock and low-stock alerts', desc: 'Sales draw down stock as they happen; items below their reorder point surface on the close, alongside waste and prep notes.' },
      { title: 'Works offline', desc: 'Sales, payments, and notes save on the device first and sync when the connection returns — a dropped line never stops the counter.' },
      { title: 'Owner daily digest', desc: 'At close the owner gets a one-line summary: sales, top items, cash variance, and anything still needing proof.' },
    ],
    proofPoint: 'Live and in use — try the full point-of-sale, payments, and daily-close flow at pos.supermega.dev, no signup required.',
    whoFor: 'Owners and counter staff at spas, salons, retail shops, cafes, restaurants, and repair counters — especially operators who want a clean daily close and payment proof without migrating to a heavy POS.',
    primaryCta: { label: 'Open the live demo', href: 'https://pos.supermega.dev/' },
  },
  {
    slug: 'factory',
    displayName: 'Factory Operations App',
    eyebrow: 'Factory operations',
    headline: 'Run production, quality, and maintenance from one system',
    subhead: 'Built for factories that need to replace shop-floor log books and scattered Excel files with one production, quality, and maintenance operating lane.',
    shot: '/site/shots/live-product-factory-issues-maintenance-quality.png',
    whatItDoes: [
      'Tracks output by line and shift against daily targets',
      'Grades inspected units with live reject and rework rates measured against your target',
      'Logs defects against your real taxonomy with photo, location, operator, and source evidence',
      'Turns a defect into a structured 5W1H incident and an owned CAPA with a due date',
      'Raises and tracks maintenance work orders when a machine goes down or drifts out of spec',
      'Gives the plant manager and CEO a daily brief: reject rate, top defects, lines over target, overdue actions',
    ],
    howItWorks: [
      { step: 'Capture on the floor', detail: 'Inspectors and operators record inspections, grades, defects, downtime, and work orders on a tablet or phone — with photos, working even when the WiFi drops.' },
      { step: 'Link and surface', detail: 'Each record ties back to the batch, line, operator, and shift, so the board shows the live reject rate, a defect Pareto, and the incidents that need attention now.' },
      { step: 'Close the loop', detail: 'Defects become 5W1H incidents and owned CAPA; machine issues become work orders. Managers track them to verified closure and read one daily brief.' },
    ],
    features: [
      { title: 'Line and shift production tracking', desc: 'Output versus target for each line, with machine status and downtime reasons captured as they happen — not reconstructed the next morning.' },
      { title: 'Inspection and grading', desc: 'Scan a serial, pick the defect, attach a photo, assign a grade. The reject rate updates live by line and shift and flags the moment a line breaches target.' },
      { title: 'Defect tracking on your taxonomy', desc: 'Defects are logged against your actual categories and product models. A Pareto view shows the few defects driving most loss; a spike alert fires on repeat defects in the same window.' },
      { title: 'DQMS: incidents, 5W1H, CAPA', desc: 'Every flagged unit becomes a structured incident and opens a corrective/preventive action with an owner and due date. Nothing auto-closes — full audit trail.' },
      { title: 'Maintenance work orders', desc: 'When a machine goes down or drifts out of spec, raise a work order from the same screen, assign it, and track it to completion.' },
      { title: 'Plant-manager and CEO brief', desc: 'One daily summary — reject rate against target, top defects, lines over target, downtime, overdue CAPA.' },
    ],
    proofPoint: 'We build it around your real factory operations — your line targets, defect taxonomy, grading rules, downtime reasons, and CAPA owners. We stand up the first working version in a few working days once we have your taxonomy and a sample of real records.',
    whoFor: 'Discrete manufacturers that still run on log books and Excel — for QC managers, production supervisors, maintenance leads, and the plant manager who needs one honest picture of the floor.',
    primaryCta: { label: 'Talk to us about your plant', href: '/contact/' },
  },
  {
    slug: 'documents',
    displayName: 'Custom Solutions & AI Agents',
    eyebrow: 'Custom solutions & AI agents',
    headline: 'Turn messy files into clean records you can act on',
    subhead: 'We build you a custom AI agent for one job you do by hand — reading your Gmail, Viber, LINE, Drive, and spreadsheets and turning them into one structured ledger with a work queue, owners, status, approvals, and a link back to the source for every record.',
    shot: '/site/shots/live-product-build-app-from-workflow.png',
    whatItDoes: [
      'Reads the documents you already work in — Gmail, Viber and LINE chats, Drive files, spreadsheets, and photos of handwritten forms',
      'Pulls the fields that matter into clean rows: claim numbers, products, amounts, dealers, dates, and decisions — no re-typing',
      'Gives every record an owner, a status, and a review queue, so nothing sits half-handled in an inbox',
      'Keeps a link to the original message or file behind each row, so any figure can be traced and trusted',
      'Flags low-confidence reads for a human to check before they are recorded, instead of guessing silently',
    ],
    howItWorks: [
      { step: 'Connect your sources', detail: 'Point it at the inbox, chat groups, Drive folders, or spreadsheets your work already lives in. No new system for your team to learn.' },
      { step: 'We map your records', detail: 'We set up the fields and statuses for your work — claims, purchase orders, shipments — so each document lands as a clean, consistent row.' },
      { step: 'Review and act in the queue', detail: 'Records flow into the ledger with owners and statuses. Your team reviews flagged items, approves, and exports — every figure traceable to its source.' },
    ],
    features: [
      { title: 'One ledger, many sources', desc: 'Gmail, Viber, LINE, Drive, spreadsheets, and photos feed the same structured table. A claim raised over Viber and confirmed by email becomes one record, not two.' },
      { title: 'Work queue with owners and status', desc: 'Every record has an owner and a state — needs review, approved, rejected, partial. Filter to needs-review and clear the queue instead of scrolling an inbox.' },
      { title: 'Source and proof trail', desc: 'Each row links back to the exact email or message it came from, with the matched text highlighted. Show where any number came from in one click.' },
      { title: 'Approvals before it is recorded', desc: 'Decisions from the right person are captured as an explicit step, with who decided and when, so the ledger reflects real sign-off.' },
      { title: 'Confidence checks, not blind guesses', desc: 'Clear reads go straight through; anything uncertain is held for a person to confirm. You see the confidence on every field.' },
      { title: 'Built for your formats', desc: 'Tuned to your own document shapes, business names, amounts, and payment references — and exports clean CSV.' },
    ],
    proofPoint: 'We turn messy operating records — hundreds of emails, chat threads, and scanned forms — into one structured ledger of reviewable claims, decisions, owners, and source-linked evidence. We build yours around your real document shapes and naming conventions.',
    whoFor: 'Shops, factories, and distributors whose real work arrives as emails, chat messages, and photos — and the office staff who today re-key all of it into spreadsheets by hand.',
    primaryCta: { label: 'Talk to us about your documents', href: '/contact/' },
  },
]
function buildProductDetailHtml(p) {
  const ext = /^https?:/.test(p.primaryCta.href) ? ' target="_blank" rel="noopener noreferrer"' : ''
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>${p.displayName} | SUPERMEGA.dev</title>
    <meta name="description" content="${p.subhead.replace(/"/g, '&quot;')}" />
    <meta name="theme-color" content="#f4efe6" />
    <link rel="canonical" href="https://supermega.dev/products/${p.slug}/" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SUPERMEGA.dev" />
    <meta property="og:title" content="${p.displayName.replace(/"/g, '&quot;')}" />
    <meta property="og:description" content="${p.subhead.replace(/"/g, '&quot;')}" />
    <meta property="og:url" content="https://supermega.dev/products/${p.slug}/" />
    <meta property="og:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <style>${unicornShellStyle}
      .pd-list { display: grid; gap: 11px; margin-top: 16px; }
      .pd-point { display: grid; grid-template-columns: auto minmax(0,1fr); gap: 12px; align-items: start; }
      .pd-point i { margin-top: 9px; width: 7px; height: 7px; border-radius: 999px; background: var(--blue); }
      .pd-point span { color: var(--ink); font-size: 16px; line-height: 1.5; }
      .pd-shot { width: 100%; display: block; border-radius: 16px; border: 1px solid rgba(42,36,28,0.12); box-shadow: var(--shadow); background: #f5f1e8; }
      :root[data-theme="dark"] .pd-shot { border-color: rgba(243,239,230,0.14); }
      .pd-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(248px, 1fr)); gap: 14px; margin-top: 24px; }
      .pd-card { border: 1px solid var(--line); border-radius: 18px; padding: 20px; background: rgba(255,255,255,0.5); }
      :root[data-theme="dark"] .pd-card { background: rgba(243,239,230,0.05); }
      .pd-card strong { display: block; font-size: 17px; letter-spacing: -0.02em; }
      .pd-card span { display: block; margin-top: 8px; color: var(--muted); font-size: 14px; line-height: 1.5; }
      .pd-steps { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 16px; margin-top: 24px; }
      .pd-step n { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 999px; background: var(--blue); color: #fff; font-weight: 600; font-size: 15px; }
      .pd-step strong { display: block; margin-top: 13px; font-size: 18px; letter-spacing: -0.02em; }
      .pd-step span { display: block; margin-top: 8px; color: var(--muted); font-size: 14px; line-height: 1.5; }
      .pd-proof { border: 1px solid var(--blue); background: var(--blue-soft); border-radius: 20px; padding: 24px 26px; }
      .pd-proof p { color: var(--ink); max-width: 64rem; font-size: 17px; }
      .pd-prose { max-width: 62rem; font-size: 17px; }
      @media (max-width: 880px) { .pd-steps { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <div class="wrap">
${unicornHeader}
      <main>
        <section class="poster" style="min-height:auto;align-items:center">
          <div class="copy">
            <div class="eyebrow">${p.eyebrow}</div>
            <h1>${p.headline}</h1>
            <p>${p.subhead}</p>
            <div class="cta">
              <a class="btn primary" href="${p.primaryCta.href}"${ext}>${p.primaryCta.label}</a>
              <a class="btn secondary" href="/offers/">See pricing</a>
              <a class="btn secondary optional-nav" href="/products/">All products</a>
            </div>
            <p class="hero-tagline">Cast real work into software.</p>
          </div>
          <aside class="product-stage">
            <img class="pd-shot" src="${p.shot}" alt="${p.displayName.replace(/"/g, '&quot;')} product screen" loading="eager" decoding="async" />
          </aside>
        </section>

        <section class="section">
          <h2>What it does</h2>
          <div class="pd-list">
            ${p.whatItDoes.map((x) => `<div class="pd-point"><i></i><span>${x}</span></div>`).join('')}
          </div>
        </section>

        <section class="section">
          <h2>How it works</h2>
          <div class="pd-steps">
            ${p.howItWorks.map((s, i) => `<div class="pd-step"><n>${i + 1}</n><strong>${s.step}</strong><span>${s.detail}</span></div>`).join('')}
          </div>
        </section>

        <section class="section">
          <h2>Core capabilities</h2>
          <div class="pd-grid">
            ${p.features.map((f) => `<div class="pd-card"><strong>${f.title}</strong><span>${f.desc}</span></div>`).join('')}
          </div>
        </section>

        <section class="section">
          <h2>${p.slug === 'pos' ? 'Proof it&rsquo;s real' : 'What it&rsquo;s grounded in'}</h2>
          <div class="pd-proof"><p>${p.proofPoint}</p></div>
        </section>

        <section class="section">
          <h2>Who it&rsquo;s for</h2>
          <p class="pd-prose">${p.whoFor}</p>
        </section>

        <section class="section">
          <div class="final">
            <div><h2>Want this for your business?</h2></div>
            <a class="btn primary" href="${p.primaryCta.href}"${ext}>${p.primaryCta.label}</a>
          </div>
        </section>
      </main>
      <footer>
        <span>© 2026 SUPERMEGA.dev — builds custom business apps from real work.</span>
        <span class="footer-links">
          <a href="mailto:swanhtet@supermega.dev">swanhtet@supermega.dev</a>
          <a href="/products/">Products</a>
          <a href="/contact/">Contact</a>
        </span>
      </footer>
    </div>
${publicLanguageToggleScript}
  </body>
</html>`
}

function renderKitList(items) {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
}

function formHidden(name, value) {
  return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value || '')}" />`
}

function buildAgentTemplatePageHtml(kit) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>${escapeHtml(kit.name)} setup kit | SUPERMEGA.dev</title>
    <meta name="description" content="${escapeHtml(kit.offer.promise)}" />
    <meta name="theme-color" content="#f4efe6" />
    <link rel="canonical" href="https://supermega.dev/agent-templates/${escapeHtml(kit.id)}/" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>${unicornShellStyle}
      .kit-hero { min-height: auto; grid-template-columns: minmax(0, 1.05fr) minmax(320px, .95fr); }
      .kit-panel { border: 1px solid var(--line); border-radius: 22px; padding: clamp(18px, 3vw, 28px); background: rgba(255,255,255,.58); box-shadow: var(--shadow); }
      .kit-panel strong { display: block; color: var(--ink); font-size: 15px; }
      .kit-panel span { display: block; margin-top: 6px; color: var(--muted); font-size: 14px; line-height: 1.45; }
      .kit-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 22px; }
      .kit-card { border: 1px solid var(--line); border-radius: 18px; padding: 18px; background: rgba(255,255,255,.52); }
      .kit-card h3 { margin: 0 0 10px; font-size: 19px; letter-spacing: -.03em; }
      .kit-card li { margin: 8px 0; color: var(--muted); font-weight: 760; line-height: 1.4; }
      .kit-json { font-size: 12px; color: var(--blue); font-weight: 900; text-decoration: none; }
      @media (max-width: 880px) { .kit-hero, .kit-grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <div class="wrap">
${unicornHeader}
      <main>
        <section class="poster kit-hero">
          <div class="copy">
            <div class="eyebrow">Setup kit / ${escapeHtml(kit.status)}</div>
            <h1>${escapeHtml(kit.name)}</h1>
            <p>${escapeHtml(kit.offer.promise)}</p>
            <div class="cta">
              <a class="btn primary" href="${escapeHtml(kit.setup_url)}">Start this template</a>
              <a class="btn secondary" href="/agent-templates/">All setup kits</a>
            </div>
          </div>
          <aside class="kit-panel">
            <strong>Buyer</strong><span>${escapeHtml(kit.buyer)}</span>
            <strong style="margin-top:16px">Price hint</strong><span>${escapeHtml(kit.offer.price_hint)}</span>
            <strong style="margin-top:16px">First proof</strong><span>${escapeHtml(kit.offer.first_proof)}</span>
            <strong style="margin-top:16px">Deployment mode</strong><span>${escapeHtml(kit.deployment_mode.first_run)} first, then ${escapeHtml(kit.deployment_mode.production)}.</span>
          </aside>
        </section>
        <section class="section">
          <div class="kit-grid">
            <article class="kit-card"><h3>Setup inputs</h3><ul>${renderKitList(kit.intake_schema.setup_inputs)}</ul></article>
            <article class="kit-card"><h3>Sample sources</h3><ul>${renderKitList(kit.intake_schema.sample_sources)}</ul></article>
            <article class="kit-card"><h3>First run workflow</h3><ol>${renderKitList(kit.first_run_workflow)}</ol></article>
            <article class="kit-card"><h3>Outputs</h3><ul>${renderKitList(kit.outputs)}</ul></article>
          </div>
        </section>
        <section class="section">
          <h2>Acceptance tests</h2>
          <div class="kit-card"><ul>${renderKitList(kit.acceptance_tests)}</ul></div>
          <p style="margin-top:14px"><a class="kit-json" href="/site/agent-templates/${escapeHtml(kit.id)}.json">Agent-readable JSON</a></p>
        </section>
      </main>
      <footer><span>SUPERMEGA.dev setup kit.</span><span class="footer-links"><a href="/products/">Products</a><a href="/contact/">Contact</a></span></footer>
    </div>
${publicLanguageToggleScript}
  </body>
</html>`
}

function buildAgentTemplateSetupHtml(kit) {
  const hiddenFields = [
    ['workflow', kit.name],
    ['first_output', kit.offer.first_proof],
    ['requested_package', kit.name],
    ['public_package', kit.name],
    ['product_area', kit.product_area],
    ['template_id', kit.id],
    ['template_status', kit.status],
    ['template_source_category', kit.source_category],
    ['template_source_area', kit.source_area],
    ['starter_kit_url', `/site/agent-templates/${kit.id}.json`],
    ['first_proof_target', kit.offer.first_proof],
    ['price_hint', kit.offer.price_hint],
    ['acceptance_tests', kit.acceptance_tests.join('\n')],
    ['first_step', `Produce first proof: ${kit.offer.first_proof}`],
    ['onboarding_stage', 'source_review'],
    ['access_policy', 'approval_required'],
    ['workspace_status', 'not_created_until_approved'],
    ['management_owner', 'swanhtet@supermega.dev'],
    ['team', 'Owner or first operating team'],
    ['urgency', 'This week'],
    ['data', `Template setup: ${kit.id} | ${kit.offer.promise}`],
    ['source_url', `https://supermega.dev${kit.setup_url}`],
    ['page_path', kit.setup_url],
    ['utm_campaign', 'agent_template_setup'],
  ]
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Set up ${escapeHtml(kit.name)} | SUPERMEGA.dev</title>
    <meta name="description" content="Start ${escapeHtml(kit.name)} with one goal and one source sample." />
    <link rel="canonical" href="https://supermega.dev${escapeHtml(kit.setup_url)}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>${unicornShellStyle}
      .setup-main { display:grid; grid-template-columns:minmax(0,.82fr) minmax(320px,1.18fr); gap:clamp(22px,5vw,58px); align-items:start; padding:clamp(22px,5vw,58px) 0 72px; }
      .setup-card { border:1px solid var(--line); border-radius:24px; padding:clamp(18px,3vw,28px); background:rgba(255,255,255,.58); box-shadow:var(--shadow); }
      .setup-form { display:grid; gap:12px; }
      .setup-row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
      .setup-form label { display:grid; gap:6px; color:var(--muted); font-size:12px; font-weight:950; letter-spacing:.12em; text-transform:uppercase; }
      .setup-form input,.setup-form textarea { width:100%; border:1px solid var(--line); border-radius:14px; background:rgba(255,250,241,.88); color:var(--ink); padding:11px 12px; font:inherit; outline:none; }
      .setup-form textarea { min-height:110px; resize:vertical; }
      .setup-form input:focus,.setup-form textarea:focus { border-color:rgba(194,96,63,.55); box-shadow:0 0 0 4px rgba(194,96,63,.10); }
      .setup-proof { display:grid; gap:10px; margin-top:18px; }
      .setup-proof li { margin:7px 0; color:var(--muted); font-weight:780; line-height:1.4; }
      .setup-status { min-height:20px; color:var(--muted); font-size:13px; font-weight:850; }
      .setup-success { display:none; border:1px solid rgba(13,148,136,.28); background:rgba(13,148,136,.08); border-radius:18px; padding:14px; color:var(--ink); }
      .setup-success[data-show="true"] { display:block; }
      @media(max-width:880px){.setup-main,.setup-row{grid-template-columns:1fr}.setup-main{padding-top:18px}.setup-card{border-radius:20px;padding:14px}}
    </style>
  </head>
  <body>
    <div class="wrap">
${unicornHeader}
      <main class="setup-main">
        <section>
          <div class="eyebrow">Agent setup</div>
          <h1>Set up ${escapeHtml(kit.name)}.</h1>
          <p>${escapeHtml(kit.offer.promise)}</p>
          <div class="setup-card setup-proof">
            <strong>First proof</strong>
            <span>${escapeHtml(kit.offer.first_proof)}</span>
            <strong>What we need</strong>
            <ul>${renderKitList(kit.intake_schema.setup_inputs)}</ul>
            <strong>Accepted samples</strong>
            <ul>${renderKitList(kit.intake_schema.sample_sources)}</ul>
          </div>
        </section>
        <section class="setup-card">
          <form class="setup-form" data-agent-template-setup method="post" action="/api/contact-submissions">
            ${hiddenFields.map(([name, value]) => formHidden(name, value)).join('\n            ')}
            <input autocomplete="off" name="website" style="display:none" tabindex="-1" />
            <div class="setup-row">
              <label>Name<input name="name" autocomplete="name" required /></label>
              <label>Email<input name="email" autocomplete="email" type="email" required /></label>
              <label>Company<input name="company" autocomplete="organization" required /></label>
              <label>Phone / chat<input name="phone" autocomplete="tel" /></label>
            </div>
            <label>Goal<textarea name="goal" required placeholder="What decision, report, ledger, reply, or daily action should this agent produce first?"></textarea></label>
            <label>Sample sources<textarea name="source_links" required placeholder="${escapeHtml(kit.intake_schema.sample_sources.join(', '))}"></textarea></label>
            <label>Rules and blockers<textarea name="launch_blockers" placeholder="Anything it must never do without approval, source access limits, formats, languages, or edge cases."></textarea></label>
            <button type="submit">Send setup request</button>
            <p class="setup-status" data-setup-status aria-live="polite"></p>
            <div class="setup-success" data-setup-success>
              <strong>Setup request saved.</strong>
              <p>It is now queued for a first-proof build. The operator console will show the checklist, acceptance tests, and approval boundary.</p>
            </div>
          </form>
        </section>
      </main>
      <footer><span>SUPERMEGA.dev agent setup.</span><span class="footer-links"><a href="/agent-templates/${escapeHtml(kit.id)}/">Setup kit</a><a href="/contact/?template=${escapeHtml(kit.id)}">Contact route</a></span></footer>
    </div>
${publicLanguageToggleScript}
    <script>
      const form = document.querySelector('[data-agent-template-setup]');
      const statusEl = document.querySelector('[data-setup-status]');
      const successEl = document.querySelector('[data-setup-success]');
      const esc = (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
      const setHidden = (name, value) => { const input = form.querySelector('[name="' + name + '"]'); if (input) input.value = value || ''; };
      const search = new URLSearchParams(window.location.search);
      setHidden('source_url', window.location.href);
      setHidden('page_path', window.location.pathname + window.location.search);
      setHidden('referrer', document.referrer || '');
      for (const key of ['utm_source', 'utm_medium', 'utm_content', 'utm_term']) setHidden(key, search.get(key) || '');
      if (search.get('utm_campaign')) setHidden('utm_campaign', search.get('utm_campaign'));
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        statusEl.textContent = 'Saving setup request...';
        successEl.dataset.show = 'false';
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
          const response = await fetch('/api/contact-submissions', {
            method: 'POST',
            headers: { 'accept': 'application/json', 'x-supermega-response': 'json' },
            body: new FormData(form),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload.status === 'error') throw new Error(payload.reason || 'setup_request_failed');
          statusEl.textContent = 'Saved: ' + esc(payload.lead_id || payload.task_id || 'queued');
          successEl.dataset.show = 'true';
          form.reset();
        } catch (error) {
          statusEl.textContent = 'Could not save. Email swanhtet@supermega.dev or try again. ' + String(error.message || error).slice(0, 90);
        } finally {
          button.disabled = false;
        }
      });
    </script>
  </body>
</html>`
}

function buildAgentTemplateIndexHtml() {
  const cards = publicAgentTemplateStarterKits
    .map(
      (kit) => `<article class="kit-card"><h3>${escapeHtml(kit.name)}</h3><p>${escapeHtml(kit.offer.first_proof)}</p><strong>${escapeHtml(kit.offer.price_hint)}</strong><div class="cta" style="margin-top:14px"><a class="btn secondary" href="/agent-templates/${escapeHtml(kit.id)}/">View setup kit</a><a class="btn secondary" href="${escapeHtml(kit.setup_url)}">Start</a></div></article>`,
    )
    .join('')
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>AI Agent Setup Kits | SUPERMEGA.dev</title>
    <meta name="description" content="Practical setup kits for SUPERMEGA.dev AI-agent templates." />
    <link rel="canonical" href="https://supermega.dev/agent-templates/" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>${unicornShellStyle}
      .kit-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
      .kit-card { border: 1px solid var(--line); border-radius: 18px; padding: 18px; background: rgba(255,255,255,.55); }
      .kit-card h3 { margin: 0; font-size: 20px; letter-spacing: -.03em; }
      .kit-card p { margin-top: 10px; font-size: 14px; color: var(--muted); }
      .kit-card strong { display:block; margin-top: 10px; }
      @media (max-width: 980px) { .kit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 620px) { .kit-grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <div class="wrap">
${unicornHeader}
      <main>
        <section class="poster" style="min-height:auto">
          <div class="copy">
            <div class="eyebrow">AI agent setup kits</div>
            <h1>Start from a working template.</h1>
            <p>Each kit defines the buyer, sample inputs, first proof, workflow, outputs, and acceptance tests before any client system is connected.</p>
          </div>
        </section>
        <section class="section"><div class="kit-grid">${cards}</div></section>
      </main>
      <footer><span>SUPERMEGA.dev setup kits.</span><span class="footer-links"><a href="/products/">Products</a><a href="/contact/">Contact</a></span></footer>
    </div>
${publicLanguageToggleScript}
  </body>
</html>`
}

for (const detailDoc of productDetailDocs) {
  await mkdir(resolve(staticDir, 'products', detailDoc.slug), { recursive: true })
  await writeFile(resolve(staticDir, 'products', detailDoc.slug, 'index.html'), normalizePublicProductNames(buildProductDetailHtml(detailDoc)), 'utf8')
}
await mkdir(resolve(staticDir, 'agent-templates'), { recursive: true })
await writeFile(resolve(staticDir, 'agent-templates', 'index.html'), normalizePublicProductNames(buildAgentTemplateIndexHtml()), 'utf8')
for (const kit of publicAgentTemplateStarterKits) {
  await mkdir(resolve(staticDir, 'agent-templates', kit.id), { recursive: true })
  await writeFile(resolve(staticDir, 'agent-templates', kit.id, 'index.html'), normalizePublicProductNames(buildAgentTemplatePageHtml(kit)), 'utf8')
  await mkdir(resolve(staticDir, 'agent-templates', kit.id, 'setup'), { recursive: true })
  await writeFile(resolve(staticDir, 'agent-templates', kit.id, 'setup', 'index.html'), normalizePublicProductNames(buildAgentTemplateSetupHtml(kit)), 'utf8')
}

// Offers / pricing — the revenue surface. Public "from" prices in MMK only, read from pricing.json. Rate: 4,300 MMK/USD (canonical). No USD on public pages.
const publicOffers = [
  {
    slug: 'tool-week', name: pricingServiceByKey['tool-week'].name, mmkDisplay: serviceMmk('tool-week'),
    who: 'You have one sharp, specific job to fix.',
    gets: ['One focused tool, fixed scope', 'Live at a real URL in days, not months', 'One round of revisions included'],
    cta: 'Start this',
  },
  {
    slug: 'dashboard', name: 'Custom build — dashboard / internal tool', mmkDisplay: serviceMmk('dashboard'), flagship: true,
    who: 'Your numbers live across five spreadsheets and nobody trusts them.',
    gets: ['One screen that updates itself from your real data', 'Built around how you actually work', 'Export to clean CSV anytime'],
    cta: 'Scope my build',
  },
  {
    slug: 'ai-agent', name: pricingServiceByKey['ai-agent'].name, mmkDisplay: serviceMmk('ai-agent'),
    who: 'The same back-office task eats hours every single day.',
    gets: ['An agent that reads your real inputs and drafts the work', 'Approval gate on anything that sends, pays, or changes the books', 'A run ledger — nothing happens silently'],
    cta: 'Describe the job',
  },
  {
    slug: 'design-ship', name: pricingServiceByKey['design-ship'].name, mmkDisplay: serviceMmk('design-ship'),
    who: 'You want it to look premium and actually run — one build, end to end.',
    gets: ['Brand and UI designed on our system', 'A full working system, live and in use', 'Hands over as a running thing, not a pile of files'],
    cta: 'Book a build',
  },
]
// By-product view — 2 honest tiers per product class, MMK only, from pricing.json.
// Only DeskPOS is a shipped product; Factory & Custom are build-to-order. NO Starter/Pro/Operator.
const publicProductTiers = (pricing.products || []).map((p) => ({
  name: p.name,
  note: p.note,
  buildToOrder: /build-to-order/i.test(p.note || ''),
  tiers: Object.entries(p.tiers || {}).map(([tierName, price]) => ({ tierName, price: mmk(price) })),
}))
const publicOffersHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Pricing | SUPERMEGA.dev</title>
    <meta name="description" content="Custom software, priced in MMK. Clear starting prices for tools, dashboards, AI agents, and full systems — built for Myanmar, yours to keep." />
    <meta name="theme-color" content="#f4efe6" />
    <link rel="canonical" href="https://supermega.dev/offers/" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SUPERMEGA.dev" />
    <meta property="og:title" content="Pricing — custom software, priced in MMK" />
    <meta property="og:description" content="Clear starting prices for tools, dashboards, AI agents, and full systems. Built for Myanmar, yours to keep." />
    <meta property="og:url" content="https://supermega.dev/offers/" />
    <meta property="og:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Pricing — custom software, priced in MMK" />
    <meta name="twitter:description" content="Clear starting prices for tools, dashboards, AI agents, and full systems. Built for Myanmar, yours to keep." />
    <meta name="twitter:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <style>${unicornShellStyle}
      .of-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px,1fr)); gap: 16px; margin-top: 24px; align-items: stretch; }
      .of-card { position: relative; display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 20px; padding: 24px; background: rgba(255,255,255,0.55); }
      :root[data-theme="dark"] .of-card { background: rgba(243,239,230,0.05); }
      .of-card.flagship { border-color: var(--blue); box-shadow: var(--shadow); }
      .of-tag { position: absolute; top: -11px; left: 22px; background: var(--blue); color: #fff; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 11px; border-radius: 999px; }
      .of-card h3 { margin: 0; font-size: 20px; letter-spacing: -0.02em; }
      .of-who { margin-top: 8px; color: var(--muted); font-size: 14px; line-height: 1.5; min-height: 42px; }
      .of-price { margin-top: 16px; display: flex; align-items: baseline; gap: 8px; }
      .of-price b { font-size: 34px; letter-spacing: -0.03em; line-height: 1; }
      .of-price .from { color: var(--muted); font-size: 13px; font-weight: 600; }
      .of-gets { list-style: none; padding: 0; margin: 18px 0 0; display: grid; gap: 9px; }
      .of-gets li { display: grid; grid-template-columns: auto minmax(0,1fr); gap: 10px; align-items: start; color: var(--ink); font-size: 14px; line-height: 1.45; }
      .of-gets li::before { content: ""; margin-top: 7px; width: 6px; height: 6px; border-radius: 999px; background: var(--blue); }
      .of-card .btn { margin-top: 20px; width: 100%; text-align: center; }
      .of-card .of-spacer { flex: 1; }
      .of-gets li strong { color: var(--ink); font-weight: 750; }
      .of-note { margin-top: 16px; color: var(--muted); font-size: 13px; max-width: 60rem; }
      .pd-steps { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 16px; margin-top: 24px; }
      .pd-step n { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 999px; background: var(--blue); color: #fff; font-weight: 600; font-size: 15px; }
      .pd-step strong { display: block; margin-top: 13px; font-size: 17px; letter-spacing: -0.02em; }
      .pd-step span { display: block; margin-top: 7px; color: var(--muted); font-size: 14px; line-height: 1.5; }
      @media (max-width: 880px) { .pd-steps { grid-template-columns: 1fr 1fr; } }
    </style>
  </head>
  <body>
    <div class="wrap">
${unicornHeader}
      <main>
        <section class="poster" style="min-height:auto;align-items:center">
          <div class="copy">
            <div class="eyebrow">Pricing</div>
            <h1>You own it. No per-seat bill, ever.</h1>
            <p>We build the exact version that fits how your business actually works — and you keep it outright. One payment, no ongoing vendor fees. Starting prices in MMK; final quote after one short call.</p>
            <div class="cta">
              <a class="btn primary" href="/contact/?package=build">Get a quote</a>
              <a class="btn secondary" href="viber://chat?number=%2B9595000721" aria-label="Chat with us on Viber">Chat on Viber</a>
              <a class="btn secondary" href="/demo/">See live demos</a>
            </div>
            <p class="hero-tagline">Cast real work into software.</p>
          </div>
        </section>

        <section class="section">
          <h2>What you can start</h2>
          <div class="of-grid">
            ${publicOffers.map((o) => `<div class="of-card${o.flagship ? ' flagship' : ''}">${o.flagship ? '<span class="of-tag">Most chosen</span>' : ''}
              <h3>${o.name}</h3>
              <p class="of-who">${o.who}</p>
              <div class="of-price"><span class="from">from</span><b>${o.mmkDisplay}</b></div>
              <ul class="of-gets">${o.gets.map((g) => `<li>${g}</li>`).join('')}</ul>
              <div class="of-spacer"></div>
              <a class="btn ${o.flagship ? 'primary' : 'secondary'}" href="/contact/?package=${o.slug}">${o.cta}</a>
            </div>`).join('')}
          </div>
          <p class="of-note">Starting "from" prices in MMK. Final scope and price confirmed on a short call. Fixed-scope with clear revision caps; 50% deposit to start, payment method confirmed on first call.</p>
        </section>

        <section class="section">
          <div class="eyebrow">How it works</div>
          <h2>From one workflow to a running system</h2>
          <div class="pd-steps">
            <div class="pd-step"><strong>1. Send one workflow</strong><span>Share one file, screenshot, email chain, or chat export. That's enough to scope the first screen.</span></div>
            <div class="pd-step"><strong>2. Scope call (free)</strong><span>We review your source, show you the first screen, and confirm the price. No payment, no access required.</span></div>
            <div class="pd-step"><strong>3. 50% deposit to start</strong><span>Fixed-scope, fixed price. The second 50% is due when the system is live and you're satisfied.</span></div>
            <div class="pd-step"><strong>4. Delivered in weeks</strong><span>A running system at a real URL. You own it outright — no monthly fees, no vendor lock-in.</span></div>
          </div>
        </section>

        <section class="section">
          <div class="trust-note" style="margin-top:24px;padding:20px 24px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,0.5);max-width:640px;">
            <strong style="display:block;font-size:15px;letter-spacing:-0.02em;margin-bottom:8px;">Our guarantee</strong>
            <p style="font-size:14px;color:var(--muted);margin:0;line-height:1.55;">If we haven't delivered a working first screen within 14 days of your deposit, we refund in full. We accept KBZPay, AYA Pay, Wave Money, and bank transfer.</p>
          </div>
        </section>

        <section class="section">
          <div class="final">
            <div><h2>Tell us the one thing to fix first.</h2></div>
            <a class="btn primary" href="/contact/?package=build">Get a quote</a>
          </div>
        </section>
      </main>
      <footer>
        <span>© 2026 SUPERMEGA.dev — builds custom business apps from real work.</span>
        <span class="footer-links">
          <a href="mailto:swanhtet@supermega.dev">swanhtet@supermega.dev</a>
          <a href="/products/">Products</a>
          <a href="/demo/">Demos</a>
          <a href="/contact/">Contact</a>
          <a href="/privacy/">Privacy</a>
        </span>
      </footer>
    </div>
${publicLanguageToggleScript}
  </body>
</html>`

await mkdir(resolve(staticDir, 'contact'), { recursive: true })
await writeFile(resolve(staticDir, 'contact', 'index.html'), normalizePublicProductNames(collapsedContactHtml), 'utf8')
await mkdir(resolve(staticDir, 'offers'), { recursive: true })
await writeFile(resolve(staticDir, 'offers', 'index.html'), normalizePublicProductNames(publicOffersHtml), 'utf8')
await mkdir(resolve(staticDir, 'ai-agents'), { recursive: true })
await writeFile(resolve(staticDir, 'ai-agents', 'index.html'), normalizePublicProductNames(unicornAiAgentsHtml), 'utf8')

// Work / case studies — public proof. Honest, de-identified real builds (live products + client systems).
const publicWorkCases = [
  {
    eyebrow: 'Retail & F&B · Live now',
    headline: 'A daily close the owner can actually trust',
    story: 'Counter staff were juggling cash, KBZPay, AYA Pay, and MMQR with no clean way to reconcile at the end of the day. We built DeskPOS: ring up orders, take any payment with the slip attached, track stock, and close the day with the drawer counted against expected sales — even when the internet drops.',
    built: ['Fast counter checkout, priced in MMK', 'Every payment method, with proof attached', 'Offline-first — syncs when the line returns', 'One-tap daily cash-up and owner digest'],
    proof: 'Live and open — try the full point-of-sale and daily-close flow with realistic Myanmar shop data, no signup.',
    cta: { label: 'Try it live ↗', href: 'https://pos.supermega.dev/', ext: true },
  },
  {
    eyebrow: 'Manufacturing · Client build',
    headline: 'Log books and Excel, replaced by one operations system',
    story: 'A Myanmar manufacturer ran production, quality, and maintenance on shop-floor log books and scattered Excel files. We built one system: capture on the floor (bilingual, works offline), grade inspections with a live reject rate, turn defects into owned corrective actions, and give the plant manager one daily brief.',
    built: ['Line and shift production vs. target', 'Inspections and defects with a live reject rate', '5W1H incidents → owned CAPA with due dates', 'Maintenance work orders + a daily plant-manager brief'],
    proof: 'Built around real factory operating data — line targets, defect taxonomy, grading rules, and CAPA owners.',
    cta: { label: 'See how it works', href: '/products/factory/', ext: false },
  },
]
const publicWorkHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Our work | SUPERMEGA.dev</title>
    <meta name="description" content="Real software we've built and shipped for businesses in Myanmar — live products you can try right now, and custom systems built from real, messy work." />
    <meta name="theme-color" content="#f4efe6" />
    <link rel="canonical" href="https://supermega.dev/work/" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SUPERMEGA.dev" />
    <meta property="og:title" content="Our work — real software, running in real businesses" />
    <meta property="og:description" content="Live products you can try right now, and custom systems we've shipped for businesses in Myanmar." />
    <meta property="og:url" content="https://supermega.dev/work/" />
    <meta property="og:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <style>${unicornShellStyle}
      .wk-list { display: grid; gap: 18px; margin-top: 28px; }
      .wk-case { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: clamp(18px,4vw,40px); align-items: start; border: 1px solid var(--line); border-radius: 22px; padding: clamp(20px,3vw,32px); background: rgba(255,255,255,0.5); }
      :root[data-theme="dark"] .wk-case { background: rgba(243,239,230,0.05); }
      .wk-case .eyebrow { margin-bottom: 10px; }
      .wk-case h2 { font-size: clamp(24px,3vw,32px); letter-spacing: -0.03em; line-height: 1.08; margin: 0; }
      .wk-story { margin-top: 14px; color: var(--muted); font-size: 16px; line-height: 1.6; }
      .wk-built { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
      .wk-built-label { color: var(--blue); font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; margin: 0 0 12px; }
      .wk-built li { display: grid; grid-template-columns: auto minmax(0,1fr); gap: 10px; align-items: start; color: var(--ink); font-size: 15px; line-height: 1.45; }
      .wk-built li::before { content: ""; margin-top: 7px; width: 6px; height: 6px; border-radius: 999px; background: var(--blue); }
      .wk-proof { margin-top: 18px; border-left: 2px solid var(--blue); padding: 4px 0 4px 14px; color: var(--ink); font-size: 14px; line-height: 1.5; }
      .wk-case .btn { margin-top: 18px; }
      @media (max-width: 820px) { .wk-case { grid-template-columns: 1fr; gap: 18px; } }
    </style>
  </head>
  <body>
    <div class="wrap">
${unicornHeader}
      <main>
        <section class="poster" style="min-height:auto;align-items:center">
          <div class="copy">
            <div class="eyebrow">Our work</div>
            <h1>Real software, running in real businesses.</h1>
            <p>A few of the things we've built — live products you can try right now, and custom systems we've shipped for businesses in Myanmar. Every one started from someone's real, messy work.</p>
            <div class="cta">
              <a class="btn primary" href="/contact/">Tell us what to fix</a>
              <a class="btn secondary" href="/demo/">See live demos</a>
              <a class="btn secondary" href="/offers/">Pricing</a>
            </div>
            <p class="hero-tagline">Cast real work into software.</p>
          </div>
        </section>

        <section class="section">
          <div class="wk-list">
            ${publicWorkCases.map((c) => `<article class="wk-case">
              <div>
                <div class="eyebrow">${c.eyebrow}</div>
                <h2>${c.headline}</h2>
                <p class="wk-story">${c.story}</p>
                <div class="wk-proof">${c.proof}</div>
                <a class="btn primary" href="${c.cta.href}"${c.cta.ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${c.cta.label}</a>
              </div>
              <div>
                <p class="wk-built-label">What we built</p>
                <ul class="wk-built">${c.built.map((b) => `<li>${b}</li>`).join('')}</ul>
              </div>
            </article>`).join('')}
          </div>
        </section>

        <section class="section">
          <div class="final">
            <div><h2>Want one built for your business?</h2></div>
            <div style="display:flex;gap:12px;flex-wrap:wrap">
              <a class="btn primary" href="/contact/?package=build">Book a build</a>
              <a class="btn secondary" href="/offers/">See pricing</a>
            </div>
          </div>
        </section>
      </main>
      <footer>
        <span>© 2026 SUPERMEGA.dev — custom business software for Myanmar. Built from your real data.</span>
        <span class="footer-links">
          <a href="mailto:swanhtet@supermega.dev">swanhtet@supermega.dev</a>
          <a href="/products/">Products</a>
          <a href="/demo/">Demos</a>
          <a href="/offers/">Pricing</a>
        </span>
      </footer>
    </div>
${publicLanguageToggleScript}
  </body>
</html>`
await mkdir(resolve(staticDir, 'work'), { recursive: true })
await writeFile(resolve(staticDir, 'work', 'index.html'), normalizePublicProductNames(publicWorkHtml), 'utf8')
const publicOperatorConsoleHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Operator Console | SUPERMEGA.dev</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
  <style>${unicornShellStyle}
    .operator-main{padding:clamp(24px,4vw,48px) 0 72px}
    .operator-grid{display:grid;grid-template-columns:minmax(280px,.9fr) minmax(320px,1.4fr);gap:18px;align-items:start}
    .operator-panel{border:1px solid var(--line);background:var(--paper);padding:18px}
    .operator-panel h2{font-size:18px;margin:0 0 12px}
    .operator-stack{display:grid;gap:12px}
    .operator-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .operator-input{width:100%;min-height:42px;border:1px solid var(--line);background:transparent;color:var(--ink);padding:10px 12px;font:inherit}
    .operator-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    .operator-kpi{border:1px solid var(--line);padding:12px;background:color-mix(in srgb,var(--paper) 92%,var(--ink) 8%)}
    .operator-kpi strong{display:block;font-size:24px;line-height:1}
    .operator-list{display:grid;gap:10px}
    .operator-item{border:1px solid var(--line);padding:14px;background:transparent}
    .operator-meta{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0;color:var(--muted);font-size:13px}
    .operator-chip{border:1px solid var(--line);padding:3px 7px}
    .operator-proof{margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}
    .operator-proof-link{display:inline-flex;margin-top:10px;color:var(--ink);font-weight:900;text-decoration:underline;text-underline-offset:3px}
    .operator-proof-section{margin-top:10px}
    .operator-proof-section span{display:block;color:var(--muted);font-size:12px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}
    .operator-proof ul{margin:8px 0 0;padding-left:18px}
    .operator-output{white-space:pre-wrap;overflow:auto;max-height:240px;border:1px solid var(--line);padding:12px;font-size:13px;background:color-mix(in srgb,var(--paper) 90%,var(--ink) 10%)}
    @media(max-width:840px){.operator-grid{grid-template-columns:1fr}.operator-kpis{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <div class="wrap">
    <script>(function(){try{var t=localStorage.getItem('sm-theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
    ${unicornHeader}
    <main class="operator-main">
      <section class="operator-grid">
        <div class="operator-panel operator-stack">
          <div>
            <div class="eyebrow">Private</div>
            <h1>Operator Console</h1>
          </div>
          <label class="operator-stack">
            <span>Ops key</span>
            <input id="ops-key" class="operator-input" type="password" autocomplete="off" placeholder="Paste SUPERMEGA_OPS_KEY" />
          </label>
          <div class="operator-row">
            <button id="save-key" class="btn secondary" type="button">Save key</button>
            <button id="refresh" class="btn primary" type="button">Refresh queue</button>
            <button id="run-runner" class="btn secondary" type="button">Run queue now</button>
          </div>
          <div class="operator-output" id="operator-status">No data loaded.</div>
        </div>
        <div class="operator-panel operator-stack">
          <div class="operator-kpis" id="operator-kpis"></div>
          <div class="operator-list" id="operator-actions"></div>
        </div>
      </section>
    </main>
  </div>
  <script>
    const keyInput = document.getElementById('ops-key');
    const statusBox = document.getElementById('operator-status');
    const actionsEl = document.getElementById('operator-actions');
    const kpisEl = document.getElementById('operator-kpis');
    keyInput.value = sessionStorage.getItem('supermega_ops_key') || '';
    function esc(value){return String(value == null ? '' : value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]})}
    function token(){return keyInput.value.trim()}
    function authHeaders(){return {accept:'application/json',authorization:'Bearer '+token()}}
    function setStatus(value){statusBox.textContent = typeof value === 'string' ? value : JSON.stringify(value,null,2)}
    function proofList(title, items){
      const values = (items || []).filter(Boolean).slice(0,6);
      if(!values.length)return '';
      return '<div class="operator-proof-section"><span>'+esc(title)+'</span><ul>'+values.map(function(item){return '<li>'+esc(item)+'</li>'}).join('')+'</ul></div>';
    }
    function proofStarterLink(proof){
      if(!proof || !proof.starter_kit_url)return '';
      return '<a class="operator-proof-link" href="'+esc(proof.starter_kit_url)+'" target="_blank" rel="noreferrer">Open starter kit</a>';
    }
    function renderKpis(data){
      const metrics = data.metrics || {};
      kpisEl.innerHTML = [
        ['Open actions', metrics.open_action_count ?? data.approval_inbox?.pending_count ?? '-'],
        ['Recent leads', metrics.recent_lead_count ?? '-'],
        ['Recent actions', metrics.recent_action_count ?? '-'],
      ].map(function(row){return '<div class="operator-kpi"><span>'+esc(row[0])+'</span><strong>'+esc(row[1])+'</strong></div>'}).join('');
    }
    function renderActions(data){
      const actions = data.recent_actions || [];
      if(!actions.length){actionsEl.innerHTML = '<div class="operator-item">No recent actions.</div>';return}
      actionsEl.innerHTML = actions.map(function(action){
        const proof = action.first_proof;
        const proofHtml = proof ? '<div class="operator-proof"><strong>'+esc(proof.title || 'First proof')+'</strong><div class="operator-meta"><span class="operator-chip">'+esc(proof.status)+'</span><span class="operator-chip">'+esc(proof.template_id)+'</span><span class="operator-chip">'+esc(proof.human_gate)+'</span></div><div>'+esc(proof.first_proof_target || '')+'</div>'+proofStarterLink(proof)+proofList('Checklist',proof.checklist)+proofList('Acceptance tests',proof.acceptance_tests)+'</div>' : '';
        return '<article class="operator-item"><strong>'+esc(action.title || action.action_type)+'</strong><div class="operator-meta"><span class="operator-chip">'+esc(action.status)+'</span><span class="operator-chip">'+esc(action.priority)+'</span><span class="operator-chip">'+esc(action.approval_state)+'</span><span>'+esc(action.lead_id)+'</span></div><div>'+esc(action.next_step || '')+'</div>'+proofHtml+'</article>';
      }).join('');
    }
    async function refresh(){
      if(!token()){setStatus('Paste the ops key first.');return}
      setStatus('Loading pipeline-control...');
      const response = await fetch('/api/pipeline-control/status',{headers:authHeaders(),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      if(!response.ok){setStatus(data);return}
      renderKpis(data); renderActions(data); setStatus(data);
    }
    async function runRunner(){
      if(!token()){setStatus('Paste the ops key first.');return}
      setStatus('Running action-runner...');
      const response = await fetch('/api/action-runner',{method:'POST',headers:authHeaders(),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    document.getElementById('save-key').addEventListener('click',function(){sessionStorage.setItem('supermega_ops_key',token());setStatus('Ops key saved for this browser tab.')});
    document.getElementById('refresh').addEventListener('click',refresh);
    document.getElementById('run-runner').addEventListener('click',runRunner);
  </script>
</body>
</html>`
await mkdir(resolve(staticDir, 'operator'), { recursive: true })
await writeFile(resolve(staticDir, 'operator', 'index.html'), publicOperatorConsoleHtml, 'utf8')
const unicornPrivacyHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="index,follow" />
  <title>Privacy Policy | SUPERMEGA.dev</title>
  <meta name="description" content="SUPERMEGA.dev privacy policy — how we handle your data when you contact us or use our software." />
  ${unicornSocialMeta({ title: 'Privacy Policy | SUPERMEGA.dev', description: 'How SUPERMEGA.dev handles your data when you contact us or use our software.', url: 'https://supermega.dev/privacy/' })}
  <link rel="canonical" href="https://supermega.dev/privacy/" />
  <meta name="theme-color" content="#f4efe6" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
  <style>${unicornShellStyle}</style>
</head>
<body>
<div class="wrap">
  <script>(function(){try{var t=localStorage.getItem('sm-theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
  <header>
    <a class="brand" href="/" aria-label="SUPERMEGA.dev home">
      <span class="mark"><svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" aria-hidden="true"><g stroke="#D97757" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M35.8 10.3 A22 22 0 1 1 28.2 10.3"/><path d="M22 45 L22 26 L32 38 L42 26 L42 45" stroke-width="4"/></g><path d="M32 34.5 L33.2 37 L35.5 38 L33.2 39 L32 41.5 L30.8 39 L28.5 38 L30.8 37 Z" fill="#C9A24B"/><path d="M32 7.6 L32.9 9.7 L35 10.3 L32.9 10.9 L32 13 L31.1 10.9 L29 10.3 L31.1 9.7 Z" fill="#C9A24B"/></svg></span>
      <span class="brand-text"><strong>SUPERMEGA.dev</strong></span>
    </a>
    <nav class="nav" aria-label="Primary">
      <button class="btn secondary theme-toggle" type="button" aria-label="Toggle dark mode" onclick="var r=document.documentElement,n=r.getAttribute('data-theme')==='dark'?'light':'dark';r.setAttribute('data-theme',n);try{localStorage.setItem('sm-theme',n)}catch(e){}"></button>
      <a class="btn secondary optional-nav" href="/products/">Products</a>
      <a class="btn secondary" href="/demo/">Demos</a>
      <a class="btn secondary" href="/offers/">Pricing</a>
      <a class="btn primary" href="/contact/">Contact</a>
    </nav>
  </header>
  <main>
    <section style="padding: clamp(28px,5vw,64px) 0 clamp(40px,7vw,80px); max-width: 720px;">
      <div class="eyebrow">Privacy</div>
      <h1 style="margin-bottom: 28px;">Privacy Policy</h1>
      <p style="margin-bottom: 10px; font-size: 14px; color: var(--muted);">Last updated: June 2026</p>

      <h2 style="font-size: clamp(22px,3vw,30px); margin: 32px 0 12px;">What we collect</h2>
      <p>When you submit the contact form or reach us directly, we collect your name, email address, phone number, business name, and anything you describe about your workflow. We use this to reply and, if you become a client, to scope and build your project.</p>

      <h2 style="font-size: clamp(22px,3vw,30px); margin: 32px 0 12px;">How we use it</h2>
      <p>We use your contact details only to respond to your enquiry and to deliver the agreed work. We do not sell, trade, or rent your information to third parties. We do not send marketing email without your consent.</p>

      <h2 style="font-size: clamp(22px,3vw,30px); margin: 32px 0 12px;">Where it is stored</h2>
      <p>Enquiry data is stored in a private Supabase database (hosted by Supabase Inc., US region). Access is restricted to the SUPERMEGA.dev team. Data is encrypted in transit (TLS) and at rest.</p>

      <h2 style="font-size: clamp(22px,3vw,30px); margin: 32px 0 12px;">Cookies and analytics</h2>
      <p>This site does not use third-party analytics or advertising cookies. We do not use Google Analytics, Meta Pixel, or any tracking scripts. The only persistent storage is a theme preference (light/dark) saved locally in your browser.</p>

      <h2 style="font-size: clamp(22px,3vw,30px); margin: 32px 0 12px;">Your rights</h2>
      <p>You can request that we delete your contact record at any time. Email <a href="mailto:swanhtet@supermega.dev" style="color:var(--blue)">swanhtet@supermega.dev</a> and we will remove it within 7 days.</p>

      <h2 style="font-size: clamp(22px,3vw,30px); margin: 32px 0 12px;">Contact</h2>
      <p>Questions about this policy: <a href="mailto:swanhtet@supermega.dev" style="color:var(--blue)">swanhtet@supermega.dev</a> · Swan Htet, Founder, SUPERMEGA.dev, Yangon, Myanmar.</p>
    </section>
  </main>
  <footer>
    <span>© 2026 SUPERMEGA.dev — custom business software for Myanmar. Built from your real data.</span>
    <span class="footer-links">
      <a href="mailto:swanhtet@supermega.dev">swanhtet@supermega.dev</a>
      <a href="tel:+9595000721">+95 9 500 0721</a>
      <a href="/products/">Products</a>
      <a href="/demo/">Demos</a>
      <a href="/offers/">Pricing</a>
      <a href="/contact/">Contact</a>
    </span>
  </footer>
</div>
${publicLanguageToggleScript}
</body>
</html>`
await mkdir(resolve(staticDir, 'privacy'), { recursive: true })
await writeFile(resolve(staticDir, 'privacy', 'index.html'), unicornPrivacyHtml, 'utf8')
await mkdir(resolve(staticDir, 'machine'), { recursive: true })
await writeFile(resolve(staticDir, 'machine', 'index.html'), normalizePublicProductNames(publicMachineHtml), 'utf8')
await mkdir(resolve(staticDir, 'card'), { recursive: true })
await writeFile(resolve(staticDir, 'card', 'index.html'), publicCardHtml, 'utf8')
// Demo hub (source lives in C:/sm-site, outside OneDrive) served at /demo/
await mkdir(resolve(staticDir, 'demo'), { recursive: true })
await cp('C:/sm-site/supermega-demo/index.html', resolve(staticDir, 'demo', 'index.html'), { force: true }).catch(() => undefined)
await cp('C:/sm-site/supermega-demo/favicon.svg', resolve(staticDir, 'demo', 'favicon.svg'), { force: true }).catch(() => undefined)
await writeFile(resolve(staticDir, 'robots.txt'), 'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /app/\nDisallow: /clients/\nDisallow: /machine/\nDisallow: /operator/\nSitemap: https://supermega.dev/sitemap.xml\n', 'utf8')
await writeFile(resolve(staticDir, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://supermega.dev/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n  <url><loc>https://supermega.dev/products/</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>\n  <url><loc>https://supermega.dev/products/pos/</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n  <url><loc>https://supermega.dev/products/factory/</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n  <url><loc>https://supermega.dev/products/documents/</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n  <url><loc>https://supermega.dev/ai-agents/</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n  <url><loc>https://supermega.dev/agent-templates/</loc><changefreq>weekly</changefreq><priority>0.85</priority></url>\n  <url><loc>https://supermega.dev/agent-templates/deskpos-quickstart/</loc><changefreq>weekly</changefreq><priority>0.72</priority></url>\n  <url><loc>https://supermega.dev/agent-templates/chat-ledger/</loc><changefreq>weekly</changefreq><priority>0.72</priority></url>\n  <url><loc>https://supermega.dev/agent-templates/inbox-calendar-operator/</loc><changefreq>weekly</changefreq><priority>0.72</priority></url>\n  <url><loc>https://supermega.dev/agent-templates/daily-intelligence-brief/</loc><changefreq>weekly</changefreq><priority>0.72</priority></url>\n  <url><loc>https://supermega.dev/agent-templates/factory-ops-ledger/</loc><changefreq>weekly</changefreq><priority>0.72</priority></url>\n  <url><loc>https://supermega.dev/agent-templates/data-clean-report-agent/</loc><changefreq>weekly</changefreq><priority>0.72</priority></url>\n  <url><loc>https://supermega.dev/offers/</loc><changefreq>weekly</changefreq><priority>0.95</priority></url>\n  <url><loc>https://supermega.dev/work/</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n  <url><loc>https://supermega.dev/contact/</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>\n  <url><loc>https://supermega.dev/card/</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>\n  <url><loc>https://supermega.dev/privacy/</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>\n</urlset>\n', 'utf8')
await writeFile(
  resolve(staticDir, 'sw.js'),
  `const CACHE_VERSION = 'supermega-public-clean-20260522'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})
`,
  'utf8',
)
await writeNodeFunction('health.js')
await writeNodeFunction('contact-submissions.js')
await writeNodeFunction('campaign-clicks.js')
await writeNodeFunction('commercial-control.js')
await writeNodeFunction('pipeline-control.js')
await writeNodeFunction('checkout-start.js')
await writeNodeFunction('product-activation.js')
await writeNodeFunction('sales-daily.js', { maxDuration: 25 })
await writeNodeFunction('telegram-webhook.js')
await writeNodeFunction('action-runner.js', { maxDuration: 25 })
await writeNodeFunction('lead.js')
await writeNodeFunction('not-found.js')
await writeNodeFunction('public-app-handoff.js')
await removePrivateRootFunctions()
await prunePublicSiteDir()
await prunePublicStaticRoot()
await mkdir(staticDir, { recursive: true })
await writeFile(
  resolve(staticDir, 'private-not-found.html'),
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Not found</title><body>Not found.</body></html>\n',
  'utf8',
)
await writeFile(resolve(outputDir, 'config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8')

console.log('public_vercel_output=ready')
