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
// Per-function dependency scoping (deploy-bloat fix, 2026-06-26): previously the FULL list below was
// copied into EVERY function's node_modules — ~11MB × 19 functions (@vercel/blob drags in zod 5.1MB,
// undici, jose, execa via @vercel/oidc's CLI deps), producing a 27k-file output past Vercel's 15k limit.
// blob and pg are BOTH lazy-required only through two lib modules (supermega-blob-queue / supermega-
// datastore); a function that imports neither can never reach them, so it needs neither tree. We now
// copy ONLY the group(s) a function actually references. This removes deps a function never requires —
// it cannot break a runtime require. (@vercel/blob's transitive tree, incl. its OIDC/CLI chain, is left
// intact for functions that DO use blob, so its env-dependent token path is unaffected.)
const blobFunctionDependencies = ['@vercel/blob']
const pgFunctionDependencies = [
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
const signalMarkHtml = '<span style="display:inline-flex;align-items:center;flex:none" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6.5 8 L11 12 L6.5 16" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.6 16.2 L18 16.2" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round"/></svg></span>'

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
      :root { color-scheme: dark; --bg:#07111f; --panel:rgba(255,255,255,.075); --line:rgba(255,255,255,.15); --text:#f6fbff; --muted:#a9b8c7; --cyan:#FF5C4D; --blue:#FF3B3B; --green:#8cf0b8; --ink:#06101d; }
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
        <a class="brand" href="/"><span style="display:inline-flex;align-items:center;flex:none" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6.5 8 L11 12 L6.5 16" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.6 16.2 L18 16.2" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round"/></svg></span><span class="wm" style="letter-spacing:-0.025em"><b style="font-weight:700">supermega</b><b style="color:#5E6B87;font-weight:500">.dev</b></span></a>
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

const publicCrewEndpoint = 'https://app.supermega.dev/api/crew'

function crewForPublicAgentTemplate(template) {
  const crews = {
    'deskpos-quickstart': 'owner-brief',
    'chat-ledger': 'read-my-chaos',
    'inbox-calendar-operator': 'owner-brief',
    'daily-intelligence-brief': 'owner-brief',
    'factory-ops-ledger': 'owner-brief',
    'data-clean-report-agent': 'read-my-chaos',
    'document-pdf-intake-ledger': 'read-my-chaos',
    'crm-follow-up-pipeline-assistant': 'outreach-draft',
    'proposal-sow-builder': 'outreach-draft',
  }
  return crews[template.id] || 'read-my-chaos'
}

function publicCrewRunUrl(template) {
  return `${publicCrewEndpoint}?crew=${encodeURIComponent(crewForPublicAgentTemplate(template))}&template=${encodeURIComponent(template.id)}`
}

function renderPublicAgentTemplateCards() {
  return publicAgentTemplates
    .map((template) => {
      const inputs = template.setupInputs.slice(0, 4).map((input) => `<li>${escapeHtml(input)}</li>`).join('')
      return `<article class="template-card" id="${escapeHtml(template.id)}" data-worker-template="${escapeHtml(template.id)}">
                <small>${escapeHtml(template.status)} / ${escapeHtml(template.sourceCategory)}</small>
                <h3>${escapeHtml(template.name)}</h3>
                <p>${escapeHtml(template.promise)}</p>
                <strong>${escapeHtml(template.pricingLabel)}</strong>
                <span>First proof: ${escapeHtml(template.firstProof)}</span>
                <ul>${inputs}</ul>
                <a class="btn secondary" data-sm-template-link="${escapeHtml(template.id)}" href="/agent-templates/${encodeURIComponent(template.id)}/setup/">Start this template</a>
                <a class="link" href="/agent-templates/${encodeURIComponent(template.id)}/">View setup kit</a>
              </article>`
    })
    .join('\n')
}

function entitlementValue(template, key, field = 'includes') {
  return template.entitlementLadder?.[key]?.[field] || ''
}

function renderWorkerEntitlementLadder(template) {
  const rows = ['free_core', 'paid_pilot', 'premium_maintained', 'gated_hands']
    .map((key) => {
      const item = template.entitlementLadder?.[key]
      if (!item) return ''
      return `<div class="worker-ladder-step" data-entitlement-code="${escapeHtml(item.entitlement_code)}">
                <strong>${escapeHtml(item.label)}</strong>
                <span>${escapeHtml(item.includes)}</span>
              </div>`
    })
    .join('')
  return `<div class="worker-ladder" data-worker-entitlements
              data-entitlement_free_core="${escapeHtml(entitlementValue(template, 'free_core'))}"
              data-entitlement_paid_pilot="${escapeHtml(entitlementValue(template, 'paid_pilot'))}"
              data-entitlement_premium="${escapeHtml(entitlementValue(template, 'premium_maintained'))}"
              data-entitlement_gated_hands="${escapeHtml(entitlementValue(template, 'gated_hands'))}">
            <strong>Sellable tool ladder</strong>
            <div>${rows}</div>
          </div>`
}

function renderSellableWorkerShelf() {
  return publicAgentTemplates
    .map((template) => {
      const outputs = template.outputs.slice(0, 3).map((output) => `<li>${escapeHtml(output)}</li>`).join('')
      const sourceInputs = template.setupInputs.slice(0, 3).join(', ')
      const crewId = crewForPublicAgentTemplate(template)
      return `<article class="worker-card" data-worker-template="${escapeHtml(template.id)}">
                <div class="worker-meta">
                  <span>${escapeHtml(template.status)}</span>
                  <span>${escapeHtml(template.sourceCategory)}</span>
                </div>
                <h3>${escapeHtml(template.name)}</h3>
                <p>${escapeHtml(template.promise)}</p>
                <div class="worker-fact"><strong>Buyer</strong><span>${escapeHtml(template.buyer)}</span></div>
                <div class="worker-fact"><strong>Source pack</strong><span>${escapeHtml(sourceInputs)}</span></div>
                <div class="worker-fact"><strong>First proof</strong><span>${escapeHtml(template.firstProof)}</span></div>
                <div class="worker-fact"><strong>Live crew</strong><span>${escapeHtml(crewId)} via POST { crew, input } at ${escapeHtml(publicCrewEndpoint)}. Draft-only and auth-gated.</span></div>
                <ul>${outputs}</ul>
                ${renderWorkerEntitlementLadder(template)}
                <div class="worker-price">${escapeHtml(template.pricingLabel)}</div>
                <div class="worker-actions">
                  <a class="btn primary" data-worker-run-action data-worker-run-endpoint="${escapeHtml(publicCrewEndpoint)}" data-worker-crew="${escapeHtml(crewId)}" href="${escapeHtml(publicCrewRunUrl(template))}" target="_blank" rel="noreferrer">Open run endpoint</a>
                  <a class="btn secondary" data-sm-template-link="${escapeHtml(template.id)}" href="/agent-templates/${encodeURIComponent(template.id)}/setup/">Start setup</a>
                  <a class="link" data-sm-template-link="${escapeHtml(template.id)}" href="/contact/?template=${encodeURIComponent(template.id)}&package=ai-workcell-pilot">Ask about this worker</a>
                </div>
              </article>`
    })
    .join('\n')
}

function workerMatcherCatalogJson() {
  const profiles = {
    'deskpos-quickstart': ['store-pos', 'pos-shop', 'retail-service', 'owner-founder', 'checkout', 'dashboard', 'sales-follow-up'],
    'chat-ledger': ['sales-follow-up', 'chat-orders', 'retail-service', 'owner-founder', 'ledger', 'follow-up'],
    'inbox-calendar-operator': ['daily-ops', 'email-calendar', 'admin-ops', 'owner-founder', 'brief', 'follow-up'],
    'daily-intelligence-brief': ['daily-ops', 'email-calendar', 'owner-founder', 'brief', 'dashboard', 'reports'],
    'factory-ops-ledger': ['factory', 'factory-records', 'factory-team', 'dashboard', 'ledger', 'daily-ops'],
    'data-clean-report-agent': ['documents', 'spreadsheet-files', 'admin-ops', 'reports', 'ledger', 'dashboard', 'professional-services'],
    'document-pdf-intake-ledger': ['documents', 'pdfs-docs', 'professional-services', 'admin-ops', 'ledger', 'reports'],
    'crm-follow-up-pipeline-assistant': ['sales-follow-up', 'email-calendar', 'chat-orders', 'sales-team', 'follow-up', 'ledger'],
    'proposal-sow-builder': ['sales-follow-up', 'scope-notes', 'professional-services', 'owner-founder', 'proposal'],
  }
  return JSON.stringify(
    publicAgentTemplates.map((template) => ({
      id: template.id,
      name: template.name,
      buyer: template.buyer,
      promise: template.promise,
      firstProof: template.firstProof,
      pricingLabel: template.pricingLabel,
      setupUrl: `/agent-templates/${template.id}/setup/`,
      contactUrl: `/contact/?template=${template.id}&package=ai-workcell-pilot`,
      crewId: crewForPublicAgentTemplate(template),
      runEndpoint: publicCrewEndpoint,
      runUrl: publicCrewRunUrl(template),
      signals: profiles[template.id] || [],
    })),
  ).replaceAll('<', '\\u003c')
}

function workerContinueCatalogJson() {
  return JSON.stringify(
    publicAgentTemplates.map((template) => ({
      id: template.id,
      setupUrl: `/agent-templates/${template.id}/setup/`,
      contactUrl: `/contact/?template=${template.id}&package=ai-workcell-pilot`,
    })),
  ).replaceAll('<', '\\u003c')
}

function workerSourcePackCatalogJson() {
  return JSON.stringify(
    publicAgentTemplates.map((template) => ({
      id: template.id,
      firstProof: template.firstProof,
      setupInputs: template.setupInputs,
      sampleSources: template.sampleSources,
      outputs: template.outputs,
      sourceCategory: template.sourceCategory,
      setupUrl: `/agent-templates/${template.id}/setup/`,
      contactUrl: `/contact/?template=${template.id}&package=ai-workcell-pilot`,
    })),
  ).replaceAll('<', '\\u003c')
}

function workerProofPlanCatalogJson() {
  return JSON.stringify(
    publicAgentTemplates.map((template) => ({
      id: template.id,
      firstProof: template.firstProof,
      setupInputs: template.setupInputs,
      sampleSources: template.sampleSources,
      firstRunWorkflow: template.firstRunWorkflow,
      outputs: template.outputs,
      setupUrl: `/agent-templates/${template.id}/setup/`,
      contactUrl: `/contact/?template=${template.id}&package=ai-workcell-pilot`,
    })),
  ).replaceAll('<', '\\u003c')
}

function workerValuePlanCatalogJson() {
  return JSON.stringify(
    publicAgentTemplates.map((template) => ({
      id: template.id,
      firstProof: template.firstProof,
      setupInputs: template.setupInputs,
      sampleSources: template.sampleSources,
      firstRunWorkflow: template.firstRunWorkflow,
      outputs: template.outputs,
      sourceCategory: template.sourceCategory,
      setupUrl: `/agent-templates/${template.id}/setup/`,
      contactUrl: `/contact/?template=${template.id}&package=ai-workcell-pilot`,
    })),
  ).replaceAll('<', '\\u003c')
}

function roleModeOptionsJson() {
  return JSON.stringify([
    {
      id: 'owner',
      label: 'Owner',
      nextStep: 'Approve goal, first proof, scope, price, payment route, and first production run.',
      proofFocus: 'Time saved, risk removed, revenue moved, and payment proof before any recurring claim.',
    },
    {
      id: 'operator',
      labelParts: ['Oper', 'ator'],
      nextStep: 'Collect source samples, check the first proof, flag missing fields, and report edge cases.',
      proofFocus: 'Less manual checking, fewer missed tasks, and a repeatable daily workflow.',
    },
    {
      id: 'technical_admin',
      label: 'Technical admin',
      nextStep: 'Confirm connector scope, accounts, permissions, audit logs, vaulting, and rollback boundary.',
      proofFocus: 'Clear read/write limits, logged actions, and no browser/mobile action without approval.',
    },
  ]).replaceAll('<', '\\u003c')
}

function deviceModeOptionsJson() {
  return JSON.stringify([
    {
      id: 'phone',
      label: 'Phone mode',
      minWidth: 0,
      maxWidth: 639,
      nextStep: 'Review first proofs, upload photos or screenshots, approve quick items, and check owner status.',
      proofFocus: 'Small-screen actions only: capture, review, approve, and send source samples after consent.',
    },
    {
      id: 'tablet',
      label: 'Tablet mode',
      minWidth: 640,
      maxWidth: 1023,
      nextStep: 'Use review queues, floor handoff, manager approvals, and checklist work during live operations.',
      proofFocus: 'Shared-work review: clear buttons, readable cards, no horizontal overflow, and approval-only actions.',
    },
    {
      id: 'desktop',
      label: 'Desktop mode',
      minWidth: 1024,
      maxWidth: 99999,
      nextStep: 'Use source review, setup forms, proof packets, control console, ledgers, and larger dashboards.',
      proofFocus: 'Full setup and operations: source trace, acceptance tests, private workspace, and behavior summary.',
    },
  ]).replaceAll('<', '\\u003c')
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
        entitlementFreeCore: entitlementValue(template, 'free_core'),
        entitlementPaidPilot: entitlementValue(template, 'paid_pilot'),
        entitlementPremium: entitlementValue(template, 'premium_maintained'),
        entitlementGatedHands: entitlementValue(template, 'gated_hands'),
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
    entitlement_ladder: kit.entitlement_ladder,
    json_url: `/site/agent-templates/${kit.id}.json`,
    markdown_url: `/site/agent-templates/${kit.id}.md`,
    contact_url: kit.contact_url,
  }))
  await mkdir(directory, { recursive: true })
  await writeTextFileEnsuringDir(
    resolve(directory, 'index.json'),
    `${JSON.stringify({ version: '2026-07-02', templates: index }, null, 2)}\n`,
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
        <a class="brand" href="/" aria-label="SUPERMEGA.dev home"><span style="display:inline-flex;align-items:center;flex:none" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6.5 8 L11 12 L6.5 16" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.6 16.2 L18 16.2" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round"/></svg></span><span class="wm" style="letter-spacing:-0.025em"><b style="font-weight:700">supermega</b><b style="color:#5E6B87;font-weight:500">.dev</b></span></a>
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
      :root { color-scheme: dark; --bg: #08100d; --panel: rgba(255,255,255,0.07); --line: rgba(255,255,255,0.14); --text: #f7fbf6; --muted: #aab8af; --green: #8cf0b8; --blue: #FF3B3B; --ink: #06100c; }
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
        <a class="brand" href="/" aria-label="SUPERMEGA.dev home"><span style="display:inline-flex;align-items:center;flex:none" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6.5 8 L11 12 L6.5 16" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.6 16.2 L18 16.2" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round"/></svg></span><span class="wm" style="letter-spacing:-0.025em"><b style="font-weight:700">supermega</b><b style="color:#5E6B87;font-weight:500">.dev</b></span></a>
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
      :root { color-scheme: dark; --bg: #0b1018; --panel: rgba(255,255,255,0.07); --line: rgba(255,255,255,0.14); --text: #f7fbff; --muted: #aab6c3; --green: #8cf0b8; --blue: #FF3B3B; --ink: #06100c; }
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
        <a class="brand" href="/" aria-label="SUPERMEGA.dev home"><span style="display:inline-flex;align-items:center;flex:none" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6.5 8 L11 12 L6.5 16" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.6 16.2 L18 16.2" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round"/></svg></span><span class="wm" style="letter-spacing:-0.025em"><b style="font-weight:700">supermega</b><b style="color:#5E6B87;font-weight:500">.dev</b></span></a>
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
        <a class="brand" href="/" aria-label="SUPERMEGA.dev home"><span style="display:inline-flex;align-items:center;flex:none" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6.5 8 L11 12 L6.5 16" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.6 16.2 L18 16.2" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round"/></svg></span><span class="wm" style="letter-spacing:-0.025em"><b style="font-weight:700">supermega</b><b style="color:#5E6B87;font-weight:500">.dev</b></span></a>
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
        --blue: #FF3B3B;
        --navy: #07111f;
        --shadow: 0 34px 90px rgba(13, 17, 23, 0.14);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        color: var(--ink);
        background:
          radial-gradient(circle at 80% 2%, rgba(233, 185, 73, 0.18), transparent 30rem),
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
      .btn.primary, button { color: #fff; border-color: transparent; background: linear-gradient(135deg, #07111f, #FF3B3B); box-shadow: 0 18px 46px rgba(18, 79, 255, 0.24); }
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
          <span style="display:inline-flex;align-items:center;flex:none" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6.5 8 L11 12 L6.5 16" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.6 16.2 L18 16.2" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round"/></svg></span>
          <span class="brand-text"><span class="wm" style="font-size:18px;letter-spacing:-0.025em"><b style="font-weight:700">supermega</b><b style="color:#5E6B87;font-weight:500">.dev</b></span></span>
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
    <title>Swan Htet | supermega.dev</title>
    <meta name="description" content="Swan Htet — founder of supermega.dev. Simple software that helps your business run better." />
    <link rel="canonical" href="https://supermega.dev/card/" />
    <meta property="og:type" content="profile" />
    <meta property="og:site_name" content="supermega.dev" />
    <meta property="og:title" content="Swan Htet | supermega.dev" />
    <meta property="og:description" content="Simple software that helps your business run better — one app, easy to use, and yours to keep." />
    <meta property="og:url" content="https://supermega.dev/card/" />
    <meta property="og:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <meta name="theme-color" content="#0A0E1C" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
      :root { color-scheme: dark; --bg:#0A0E1C; --surface:#111731; --elev:#1A2240; --ink:#EAEEF7; --muted:#93A0BC; --dim:#5E6B87; --accent:#FF3B3B; --accent-soft:rgba(255,59,59,.16); --line:rgba(255,255,255,.08); }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100svh; display: grid; place-items: center; padding: 24px; background-color: var(--bg); background-image: radial-gradient(ellipse at 82% 10%, rgba(255,59,59,0.12), transparent 32rem), radial-gradient(ellipse at 6% 92%, rgba(255,59,59,0.06), transparent 30rem), linear-gradient(160deg, #181B21, #101216 78%); color: var(--ink); font-family: "Inter", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
      a { color: inherit; text-decoration: none; }
      .card { position: relative; overflow: hidden; width: min(960px, 100%); min-height: min(600px, calc(100svh - 48px)); display: flex; align-items: center; gap: clamp(28px, 5vw, 56px); border: 1px solid var(--line); border-radius: clamp(24px, 4vw, 40px); background: linear-gradient(158deg, var(--surface) 0%, #191C23 100%); box-shadow: 0 50px 130px rgba(0,0,0,0.55); padding: clamp(30px, 6vw, 64px); }
      .card::before { content: "supermega"; position: absolute; right: -2%; bottom: -5%; color: transparent; -webkit-text-stroke: 1px rgba(255,255,255,0.028); font-size: clamp(56px, 13vw, 150px); font-weight: 700; letter-spacing: -0.04em; line-height: 0.8; pointer-events: none; font-family: "Space Grotesk", sans-serif; }
      .photo-col { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 18px; position: relative; }
      .avatar { width: clamp(140px, 20vw, 200px); height: clamp(140px, 20vw, 200px); border-radius: 50%; object-fit: cover; border: 1px solid var(--line); box-shadow: 0 16px 40px rgba(0,0,0,0.4), 0 0 0 4px var(--accent-soft); }
      .qr-panel { display: flex; flex-direction: column; align-items: center; gap: 9px; padding: 14px; border: 1px solid var(--line); border-radius: 16px; background: var(--elev); }
      .qr { width: 116px; height: 116px; border-radius: 10px; background: #fff; padding: 8px; display: block; }
      .qr-label { font-size: 10.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); display: flex; align-items: center; gap: 6px; }
      .qr-label::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 7px var(--accent); }
      .content { position: relative; flex: 1 1 auto; min-width: 0; max-width: 540px; }
      .brand { display: inline-flex; align-items: center; font-family: "Space Grotesk", sans-serif; font-weight: 700; letter-spacing: -0.025em; font-size: 16px; color: var(--ink); }
      .brand .bdot { width: 10px; height: 10px; border-radius: 3px; background: linear-gradient(135deg, #FF5C4D, #FF3B3B); box-shadow: 0 0 11px rgba(255,59,59,0.55); margin-right: 11px; }
      .brand .bd { color: var(--dim); font-weight: 500; }
      h1 { font-family: "Space Grotesk", sans-serif; margin: 22px 0 6px; font-size: clamp(40px, 6.5vw, 68px); line-height: 0.98; letter-spacing: -0.03em; font-weight: 700; color: var(--ink); }
      .role { margin: 0 0 18px; color: var(--accent); font-size: clamp(15px, 2.2vw, 18px); font-weight: 600; }
      .pitch { max-width: 32rem; margin: 0 0 26px; color: var(--muted); font-size: clamp(16px, 2vw, 19px); line-height: 1.5; font-weight: 400; }
      .details { display: grid; gap: 7px; margin-bottom: 26px; }
      .details a { width: fit-content; color: var(--ink); font-size: clamp(15px, 1.8vw, 18px); font-weight: 600; }
      .details a:hover { color: var(--accent); }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; }
      .button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; border-radius: 10px; padding: 0 20px; font-weight: 600; font-size: 15px; }
      .button.primary { background: var(--accent); color: #fff; }
      .button.viber { border: 1px solid var(--line); background: transparent; color: var(--ink); }
      .button.secondary { border: 1px solid var(--line); background: transparent; color: var(--ink); }
      @media (max-width: 760px) { body { padding: 14px; } .card { flex-direction: column; text-align: center; align-items: center; min-height: calc(100svh - 28px); padding: 34px 24px; gap: 24px; border-radius: 28px; } .content { display: flex; flex-direction: column; align-items: center; } .details a, .pitch { margin-left: auto; margin-right: auto; } .actions { justify-content: center; } }
    </style>
  </head>
  <body>
    <main class="card" aria-label="Swan Htet contact card">
      <div class="photo-col">
        <img class="avatar" src="/site/social/swan-htet.jpg" alt="Swan Htet, founder of supermega.dev" width="200" height="200" />
        <div class="qr-panel">
          <img class="qr" src="/site/social/supermega-contact-qr.png" alt="QR code — scan to open supermega.dev" width="116" height="116" loading="lazy" />
          <span class="qr-label">Scan to open</span>
        </div>
      </div>
      <section class="content">
        <a class="brand" href="/" aria-label="supermega.dev home"><span class="bdot"></span><b>supermega</b><span class="bd">.dev</span></a>
        <h1>Swan Htet</h1>
        <p class="role">Founder · supermega.dev</p>
        <p class="pitch">I build simple software that helps businesses run better — one app for the whole thing, easy to use, and yours to keep.</p>
        <div class="details">
          <a href="mailto:swanhtet@supermega.dev">swanhtet@supermega.dev</a>
          <a href="tel:+9595000721">+95 9 500 0721</a>
        </div>
        <div class="actions">
          <a class="button viber" href="viber://chat?number=%2B9595000721" aria-label="Chat on Viber"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm5.568 16.8c-.24.576-.96 1.056-1.608 1.2-.432.096-.984.168-2.856-.624-2.4-.984-3.936-3.432-4.056-3.6-.12-.168-.984-1.32-.984-2.52s.624-1.776 1.2-1.776c.216 0 .624.024.84.576.144.36.384.984.432 1.128.12.288.024.624-.12.84l-.384.48c-.12.168-.24.36-.12.696.576 1.44 1.872 2.376 3.48 3.024.264.096.456.048.624-.144l.528-.624c.192-.24.432-.264.696-.168.648.264 1.56.648 1.8.744.288.12.48.168.528.288.048.192.048.864-.192 1.296zm.12-4.848c-.072 0-.12-.024-.12-.096-.264-2.952-2.496-5.136-5.424-5.4-.072-.024-.12-.072-.12-.144v-.528c0-.072.048-.12.12-.12 3.336.288 5.976 2.904 6.264 6.168 0 .072-.048.12-.12.12h-.6zm-1.464-1.584c-.072 0-.144-.024-.144-.12-.216-1.68-1.536-3-3.216-3.24-.072 0-.12-.072-.12-.144v-.528c0-.072.048-.12.12-.12 2.016.264 3.624 1.848 3.888 3.864 0 .072-.048.12-.12.12h-.408zm-1.272-1.584c-.072 0-.12-.048-.12-.12-.144-.792-.768-1.416-1.56-1.56-.072-.024-.12-.072-.12-.144v-.528c0-.072.048-.12.12-.12 1.128.168 2.016 1.032 2.184 2.16 0 .072-.048.12-.12.12h-.384z"/></svg>Viber</a>
          <a class="button primary" href="${activeCardContactPath}">Open supermega.dev</a>
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
      :root { color-scheme: dark; --text: #f7fbff; --muted: #a8b8ca; --cyan: #FF3B3B; --blue: #FF3B3B; --ink: #06101d; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100svh; display: grid; place-items: center; padding: 24px; background-color: #07111f; background-image: radial-gradient(circle at 76% 18%, rgba(255,59,59,0.18), transparent 24rem), radial-gradient(circle at 8% 84%, rgba(79,140,255,0.18), transparent 26rem), linear-gradient(135deg, #07111f, #02050b 72%); color: var(--text); font-family: "Aptos", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
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
      <div class="brand"><span style="display:inline-flex;align-items:center;flex:none" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6.5 8 L11 12 L6.5 16" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.6 16.2 L18 16.2" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round"/></svg></span><span class="wm" style="letter-spacing:-0.025em"><b style="font-weight:700">supermega</b><b style="color:#5E6B87;font-weight:500">.dev</b></span></div>
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
        --blue: #FF3B3B;
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
      .btn:hover, button:hover { transform: translateY(-1px); border-color: rgba(255,59,59,0.40); }
      .btn.primary, button { color: #fff; border-color: transparent; background: linear-gradient(135deg, #b1542f, #D62828); box-shadow: 0 18px 40px rgba(194, 96, 63, 0.26); }
      .poster { display: grid; grid-template-columns: minmax(0, 0.84fr) minmax(340px, 1.16fr); gap: clamp(24px, 5vw, 72px); align-items: center; min-height: min(620px, calc(100svh - 86px)); padding: 10px 0 42px; }
      .eyebrow { color: var(--blue); font-size: 12px; font-weight: 950; letter-spacing: 0.22em; text-transform: uppercase; }
      h1, h2, h3 { font-family: var(--font-serif, "Georgia", ui-serif, serif); font-weight: 560; font-optical-sizing: auto; }
      h1 { margin: 12px 0 16px; max-width: 16ch; font-size: clamp(46px, 5.6vw, 74px); line-height: 1.02; letter-spacing: -0.02em; }
      h2 { margin: 0; max-width: 16ch; font-size: clamp(32px, 4.4vw, 56px); line-height: 1.03; letter-spacing: -0.02em; }
      h3 { margin: 0; font-size: clamp(23px, 2.8vw, 38px); line-height: 1.05; letter-spacing: -0.015em; }
      p { margin: 0; max-width: 34rem; color: var(--muted); font-size: clamp(17px, 1.8vw, 20px); line-height: 1.5; letter-spacing: -0.01em; }
      .cta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
      .product-stage { position: relative; display: grid; gap: 14px; }
      .product-stage::before { content: ""; position: absolute; inset: -4% 2% auto 12%; height: 70%; border-radius: 999px; background: linear-gradient(135deg, rgba(255,59,59,0.20), rgba(43,74,160,0.14)); filter: blur(46px); z-index: -1; }
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
      .product-ui { display: grid; gap: 14px; aspect-ratio: 16 / 10.4; padding: clamp(18px, 3vw, 30px); background: radial-gradient(circle at top right, rgba(255,59,59,.16), transparent 34%), linear-gradient(135deg, #fffaf0, #f6efe4); color: var(--ink); }
      .product-ui.dark { background: radial-gradient(circle at top right, rgba(255,59,59,.20), transparent 38%), linear-gradient(135deg, #221c17, #2c2620); color: #f8f4ec; }
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
      .product-ui.dark .app-chip.active { background: #FF3B3B; color: #06221f; }
      .app-body { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(156px, .72fr); gap: 12px; min-height: 0; }
      .app-card { border: 1px solid rgba(13,17,23,.10); border-radius: 20px; background: rgba(255,255,255,.76); padding: 13px; min-width: 0; box-shadow: 0 12px 28px rgba(13,17,23,.06); }
      .product-ui.dark .app-card { border-color: rgba(255,255,255,.14); background: rgba(255,255,255,.08); box-shadow: none; }
      .app-card h4 { margin: 0; font-size: 20px; line-height: 1; letter-spacing: -.055em; }
      .app-label { display: block; margin-bottom: 6px; color: var(--blue); font-size: 8px; font-weight: 950; letter-spacing: .18em; text-transform: uppercase; }
      .product-ui.dark .app-label { color: #FF3B3B; }
      .app-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; margin-top: 10px; }
      .app-kpi { border: 1px solid rgba(13,17,23,.08); border-radius: 13px; padding: 8px; background: rgba(255,255,255,.72); }
      .product-ui.dark .app-kpi { border-color: rgba(255,255,255,.12); background: rgba(255,255,255,.07); }
      .app-kpi b { display: block; color: var(--blue); font-size: 7px; letter-spacing: .14em; text-transform: uppercase; }
      .product-ui.dark .app-kpi b { color: #FF3B3B; }
      .app-kpi span { display: block; margin-top: 3px; font-size: 18px; font-weight: 950; letter-spacing: -.04em; }
      .app-table { display: grid; gap: 7px; margin-top: 10px; }
      .app-row { display: grid; grid-template-columns: minmax(0,1fr) auto auto; gap: 8px; align-items: center; border: 1px solid rgba(13,17,23,.08); border-radius: 12px; padding: 8px 9px; background: rgba(255,255,255,.78); }
      .product-ui.dark .app-row { border-color: rgba(255,255,255,.12); background: rgba(255,255,255,.07); }
      .app-row strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; letter-spacing: -.015em; }
      .app-row span { color: var(--muted); font-size: 9px; font-weight: 850; white-space: nowrap; }
      .product-ui.dark .app-row span { color: rgba(245,250,255,.66); }
      .app-row em { border-radius: 999px; padding: 5px 7px; background: rgba(255,59,59,.10); color: var(--blue); font-style: normal; font-size: 8px; font-weight: 950; white-space: nowrap; }
      .product-ui.dark .app-row em { background: rgba(255,59,59,.16); color: #FF3B3B; }
      .app-side { display: grid; gap: 9px; align-content: start; }
      .app-module { border: 1px solid rgba(13,17,23,.10); border-radius: 16px; padding: 10px; background: rgba(255,255,255,.70); }
      .product-ui.dark .app-module { border-color: rgba(255,255,255,.14); background: rgba(255,255,255,.08); }
      .app-module b { display: block; color: var(--blue); font-size: 8px; letter-spacing: .15em; text-transform: uppercase; }
      .product-ui.dark .app-module b { color: #FF3B3B; }
      .app-module span { display: block; margin-top: 5px; font-size: 11px; line-height: 1.18; font-weight: 900; }
      .product-top { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
      .product-title small { display: block; color: var(--blue); font-size: 10px; font-weight: 950; letter-spacing: .18em; text-transform: uppercase; }
      .product-title strong { display: block; margin-top: 5px; font-size: clamp(26px, 3.5vw, 42px); line-height: .94; letter-spacing: -.07em; }
      .product-ui.dark .product-title small { color: #FF3B3B; }
      .product-badge { border: 1px solid rgba(13,17,23,.10); border-radius: 999px; padding: 8px 10px; background: rgba(255,255,255,.72); font-size: 11px; font-weight: 950; text-transform: uppercase; white-space: nowrap; }
      .product-ui.dark .product-badge { border-color: rgba(255,255,255,.16); background: rgba(255,255,255,.08); color: #eaffff; }
      .metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
      .metric { border: 1px solid rgba(13,17,23,.10); border-radius: 16px; padding: 10px; background: rgba(255,255,255,.72); }
      .metric b { display: block; color: var(--blue); font-size: 9px; font-weight: 950; letter-spacing: .14em; text-transform: uppercase; }
      .metric span { display: block; margin-top: 4px; font-size: clamp(18px, 2vw, 28px); font-weight: 950; letter-spacing: -.05em; }
      .product-ui.dark .metric { border-color: rgba(255,255,255,.14); background: rgba(255,255,255,.08); }
      .product-ui.dark .metric b { color: #FF3B3B; }
      .work-list { display: grid; gap: 8px; }
      .work-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; border: 1px solid rgba(13,17,23,.10); border-radius: 16px; padding: 10px 12px; background: rgba(255,255,255,.78); }
      .work-item strong { display: block; font-size: 13px; letter-spacing: -.02em; }
      .work-item span { display: block; margin-top: 3px; color: var(--muted); font-size: 11px; font-weight: 800; }
      .work-item em { border-radius: 999px; padding: 6px 8px; background: #07111f; color: #fff; font-size: 10px; font-style: normal; font-weight: 950; white-space: nowrap; }
      .product-ui.dark .work-item { border-color: rgba(255,255,255,.14); background: rgba(255,255,255,.08); }
      .product-ui.dark .work-item span { color: rgba(245,250,255,.66); }
      .product-ui.dark .work-item em { background: #FF3B3B; color: #06221f; }
      .module-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }
      .module-tile { border: 1px solid rgba(13,17,23,.10); border-radius: 16px; padding: 11px; background: rgba(255,255,255,.68); }
      .module-tile b { display: block; color: var(--blue); font-size: 9px; letter-spacing: .14em; text-transform: uppercase; }
      .module-tile span { display: block; margin-top: 6px; font-size: 13px; font-weight: 950; letter-spacing: -.03em; }
      .product-ui.dark .module-tile { border-color: rgba(255,255,255,.14); background: rgba(255,255,255,.08); }
      .product-ui.dark .module-tile b { color: #FF3B3B; }
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
      .workcell-panel { border: 1px solid var(--line); border-radius: 28px; padding: clamp(22px,4vw,40px); background: linear-gradient(135deg, rgba(255,59,59,0.06), rgba(255,59,59,0.055)); }
      .workcell-panel p { color: var(--muted); line-height: 1.58; max-width: 66ch; }
      .workcell-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; margin-top: 22px; }
      .workcell-step { border: 1px solid var(--line); border-radius: 18px; padding: 16px; background: rgba(255,255,255,0.52); }
      .workcell-step strong { display: block; letter-spacing: -0.02em; }
      .workcell-step span { display: block; margin-top: 7px; color: var(--muted); font-size: 13px; line-height: 1.43; }
      .local-worker-continue { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 18px; align-items: center; margin: 8px 0 20px; border: 1px solid rgba(255,59,59,0.26); border-radius: 24px; padding: 16px; background: rgba(255,255,255,0.68); box-shadow: 0 18px 54px rgba(42,36,28,0.08); }
      .local-worker-continue[hidden] { display: none !important; }
      .local-worker-continue strong { display: block; margin-top: 5px; font-size: clamp(21px,2.4vw,30px); line-height: 1.05; letter-spacing: -0.035em; }
      .local-worker-continue p { margin-top: 6px; max-width: 62ch; font-size: 14px; line-height: 1.42; }
      .local-worker-continue .local-worker-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
      .local-worker-continue .local-worker-meta span { border: 1px solid var(--line); border-radius: 999px; padding: 5px 9px; color: var(--muted); font-size: 11px; font-weight: 900; }
      .local-worker-continue .local-worker-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
      .local-worker-continue .local-worker-clear { color: var(--muted); font-size: 12px; font-weight: 900; }
      .role-mode-panel { display: grid; grid-template-columns: minmax(0,1fr) minmax(260px,.72fr); gap: 16px; align-items: center; margin: 8px 0 20px; border: 1px solid rgba(43,105,124,0.24); border-radius: 24px; padding: 16px; background: rgba(255,255,255,0.64); box-shadow: 0 16px 48px rgba(42,36,28,0.07); }
      .role-mode-panel[hidden] { display: none !important; }
      .role-mode-panel strong { display: block; margin-top: 5px; font-size: clamp(20px,2.2vw,28px); line-height: 1.08; letter-spacing: -0.035em; }
      .role-mode-panel p { margin-top: 6px; max-width: 66ch; font-size: 14px; line-height: 1.42; }
      .role-mode-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
      .role-mode-choice { border: 1px solid var(--line); border-radius: 999px; background: rgba(255,255,255,0.72); min-height: 38px; padding: 0 12px; color: var(--ink); font: inherit; font-size: 12px; font-weight: 900; cursor: pointer; }
      .role-mode-choice[aria-pressed="true"] { border-color: rgba(43,105,124,0.5); background: rgba(43,105,124,0.12); color: var(--blue); }
      .role-mode-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
      .role-mode-meta span { border: 1px solid var(--line); border-radius: 999px; padding: 5px 9px; color: var(--muted); font-size: 11px; font-weight: 900; }
      .device-mode-panel { display: grid; grid-template-columns: minmax(0,1fr) minmax(220px,.56fr); gap: 16px; align-items: center; margin: 8px 0 20px; border: 1px solid rgba(255,59,59,0.34); border-radius: 24px; padding: 16px; background: rgba(255,255,255,0.62); box-shadow: 0 16px 48px rgba(42,36,28,0.07); }
      .device-mode-panel[hidden] { display: none !important; }
      .device-mode-panel strong { display: block; margin-top: 5px; font-size: clamp(20px,2.1vw,27px); line-height: 1.08; letter-spacing: -0.035em; }
      .device-mode-panel p { margin-top: 6px; max-width: 66ch; font-size: 14px; line-height: 1.42; }
      .device-mode-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
      .adaptive-plan-panel { display: grid; grid-template-columns: minmax(0,1fr) minmax(230px,.62fr); gap: 16px; align-items: center; margin: 8px 0 20px; border: 1px solid rgba(13,148,136,0.26); border-radius: 24px; padding: 16px; background: rgba(255,255,255,0.64); box-shadow: 0 16px 48px rgba(42,36,28,0.07); }
      .adaptive-plan-panel[hidden] { display: none !important; }
      .adaptive-plan-panel strong { display: block; margin-top: 5px; font-size: clamp(20px,2.1vw,27px); line-height: 1.08; letter-spacing: -0.035em; }
      .adaptive-plan-panel p { margin-top: 6px; max-width: 66ch; font-size: 14px; line-height: 1.42; }
      .adaptive-plan-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
      .source-pack-panel { display: grid; grid-template-columns: minmax(0,1fr) minmax(230px,.62fr); gap: 16px; align-items: center; margin: 8px 0 20px; border: 1px solid rgba(255,59,59,0.22); border-radius: 24px; padding: 16px; background: rgba(255,255,255,0.66); box-shadow: 0 16px 48px rgba(42,36,28,0.07); }
      .source-pack-panel[hidden] { display: none !important; }
      .source-pack-panel strong { display: block; margin-top: 5px; font-size: clamp(20px,2.1vw,27px); line-height: 1.08; letter-spacing: -0.035em; }
      .source-pack-panel p { margin-top: 6px; max-width: 66ch; font-size: 14px; line-height: 1.42; }
      .source-pack-panel ul { display: grid; gap: 6px; margin: 10px 0 0; padding-left: 18px; color: var(--muted); font-size: 13px; font-weight: 780; line-height: 1.35; }
      .source-pack-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
      .proof-plan-panel { display: grid; grid-template-columns: minmax(0,1fr) minmax(250px,.66fr); gap: 16px; align-items: center; margin: 8px 0 20px; border: 1px solid rgba(43,105,124,0.24); border-radius: 24px; padding: 16px; background: rgba(255,255,255,0.66); box-shadow: 0 16px 48px rgba(42,36,28,0.07); }
      .proof-plan-panel[hidden] { display: none !important; }
      .proof-plan-panel strong { display: block; margin-top: 5px; font-size: clamp(20px,2.1vw,27px); line-height: 1.08; letter-spacing: -0.035em; }
      .proof-plan-panel p { margin-top: 6px; max-width: 66ch; font-size: 14px; line-height: 1.42; }
      .proof-plan-panel ol { display: grid; gap: 6px; margin: 10px 0 0; padding-left: 18px; color: var(--muted); font-size: 13px; font-weight: 780; line-height: 1.35; }
      .proof-plan-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
      .value-plan-panel { display: grid; grid-template-columns: minmax(0,1fr) minmax(250px,.66fr); gap: 16px; align-items: center; margin: 8px 0 20px; border: 1px solid rgba(13,148,136,0.28); border-radius: 24px; padding: 16px; background: rgba(255,255,255,0.68); box-shadow: 0 16px 48px rgba(42,36,28,0.07); }
      .value-plan-panel[hidden] { display: none !important; }
      .value-plan-panel strong { display: block; margin-top: 5px; font-size: clamp(20px,2.1vw,27px); line-height: 1.08; letter-spacing: -0.035em; }
      .value-plan-panel p { margin-top: 6px; max-width: 66ch; font-size: 14px; line-height: 1.42; }
      .value-plan-panel ul { display: grid; gap: 6px; margin: 10px 0 0; padding-left: 18px; color: var(--muted); font-size: 13px; font-weight: 780; line-height: 1.35; }
      .value-plan-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
      .pilot-plan-panel { display: grid; grid-template-columns: minmax(0,1fr) minmax(250px,.66fr); gap: 16px; align-items: center; margin: 8px 0 20px; border: 1px solid rgba(255,59,59,0.34); border-radius: 24px; padding: 16px; background: rgba(255,255,255,0.68); box-shadow: 0 16px 48px rgba(42,36,28,0.07); }
      .pilot-plan-panel[hidden] { display: none !important; }
      .pilot-plan-panel strong { display: block; margin-top: 5px; font-size: clamp(20px,2.1vw,27px); line-height: 1.08; letter-spacing: -0.035em; }
      .pilot-plan-panel p { margin-top: 6px; max-width: 66ch; font-size: 14px; line-height: 1.42; }
      .pilot-plan-panel ol { display: grid; gap: 6px; margin: 10px 0 0; padding-left: 18px; color: var(--muted); font-size: 13px; font-weight: 780; line-height: 1.35; }
      .pilot-plan-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
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
        .poster, .split, .product-library-head, .output, .proof-system, .proof-board, .workcell-grid, .local-worker-continue, .role-mode-panel, .device-mode-panel, .adaptive-plan-panel, .source-pack-panel, .proof-plan-panel, .value-plan-panel, .pilot-plan-panel, .final { grid-template-columns: 1fr; }
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
        .local-worker-continue .local-worker-actions { justify-content: stretch; }
        .local-worker-continue .local-worker-actions .btn { flex: 1 1 auto; }
        .role-mode-actions { justify-content: stretch; }
        .role-mode-choice { flex: 1 1 auto; }
        .device-mode-actions { justify-content: stretch; }
        .device-mode-actions .btn { flex: 1 1 auto; }
        .adaptive-plan-actions { justify-content: stretch; }
        .adaptive-plan-actions .btn { flex: 1 1 auto; }
        .source-pack-actions { justify-content: stretch; }
        .source-pack-actions .btn { flex: 1 1 auto; }
        .proof-plan-actions { justify-content: stretch; }
        .proof-plan-actions .btn { flex: 1 1 auto; }
      }

      :root { --gilt: #FF3B3B; }
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
        --cream: #0A0E1C; --paper: #111731; --ink: #EAEEF7; --muted: #93A0BC;
        --line: rgba(148,164,210,0.12); --blue: #FF3B3B; --blue-soft: rgba(255,59,59,0.16);
        --aqua: #FF5C4D; --navy: #EAEEF7; --shadow: 0 34px 90px rgba(0,0,0,0.6); --gilt: #FF3B3B;
      }
      :root[data-theme="dark"] body {
        background:
          radial-gradient(circle at 84% 2%, rgba(255,59,59,0.13), transparent 32rem),
          radial-gradient(circle at 3% 20%, rgba(43,74,160,0.20), transparent 30rem),
          linear-gradient(180deg, #0C1122 0%, var(--cream) 55%, #070A15 100%);
      }
      :root[data-theme="dark"] body::before { background-image: linear-gradient(rgba(243,239,230,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(243,239,230,0.045) 1px, transparent 1px); }
      :root[data-theme="dark"] .btn, :root[data-theme="dark"] button { background: rgba(243,239,230,0.06); }
      :root[data-theme="dark"] .btn.primary, :root[data-theme="dark"] button { color: #fff; background: linear-gradient(135deg, #D62828, #FF3B3B); box-shadow: 0 18px 40px rgba(217, 119, 87, 0.28); }
      :root[data-theme="dark"] .output, :root[data-theme="dark"] .feature, :root[data-theme="dark"] .proof-card, :root[data-theme="dark"] .case, :root[data-theme="dark"] .proof-system, :root[data-theme="dark"] .workcell-panel, :root[data-theme="dark"] .workcell-step, :root[data-theme="dark"] .local-worker-continue, :root[data-theme="dark"] .role-mode-panel, :root[data-theme="dark"] .device-mode-panel, :root[data-theme="dark"] .adaptive-plan-panel, :root[data-theme="dark"] .source-pack-panel, :root[data-theme="dark"] .proof-plan-panel, :root[data-theme="dark"] .value-plan-panel, :root[data-theme="dark"] .pilot-plan-panel, :root[data-theme="dark"] .final, :root[data-theme="dark"] .home-shot-card, :root[data-theme="dark"] .browser, :root[data-theme="dark"] .proof, :root[data-theme="dark"] .upgrade-card, :root[data-theme="dark"] .shell-card, :root[data-theme="dark"] .setup-card, :root[data-theme="dark"] .market-card, :root[data-theme="dark"] form, :root[data-theme="dark"] .feature-pills span, :root[data-theme="dark"] .chip, :root[data-theme="dark"] .metric, :root[data-theme="dark"] .proof-step, :root[data-theme="dark"] footer .footer-links a {
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
      <script>(function(){try{var t=localStorage.getItem('sm-theme');if(!t){t='dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
      <header>
        <a class="brand" href="/" aria-label="SUPERMEGA.dev home">
          <span style="display:inline-flex;align-items:center;flex:none" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6.5 8 L11 12 L6.5 16" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.6 16.2 L18 16.2" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round"/></svg></span>
          <span class="brand-text"><span class="wm" style="font-size:18px;letter-spacing:-0.025em"><b style="font-weight:700">supermega</b><b style="color:#5E6B87;font-weight:500">.dev</b></span></span>
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
const publicBehaviorEventsScript = `
<script>
  (function () {
    var endpoint = '/api/behavior-events';
    var allowed = ['page_viewed', 'cta_clicked', 'template_clicked', 'setup_started', 'lead_form_submitted'];
    var params = new URLSearchParams(window.location.search || '');
    function text(value) { return String(value || '').slice(0, 240); }
    function templateFromHref(href) {
      var match = String(href || '').match(/\\/agent-templates\\/([^/?#]+)(?:\\/setup)?\\/?/);
      return match ? decodeURIComponent(match[1]) : '';
    }
    function hidden(form, name) {
      var field = form && form.querySelector ? form.querySelector('input[type="hidden"][name="' + name + '"]') : null;
      return field ? field.value : '';
    }
    function stored(key) {
      try {
        return window.localStorage ? (localStorage.getItem(key) || '') : '';
      } catch (error) {
        return '';
      }
    }
    function sessionHint() {
      try {
        var key = 'sm_behavior_session';
        var existing = window.localStorage && localStorage.getItem(key);
        if (existing) return existing;
        var next = 'sess-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        if (window.localStorage) localStorage.setItem(key, next);
        return next;
      } catch (error) {
        return 'session-storage-disabled';
      }
    }
    function send(eventType, detail) {
      if (allowed.indexOf(eventType) < 0) return;
      var body = {
        event_type: eventType,
        page_path: window.location.pathname,
        source_url: window.location.href,
        referrer: document.referrer || '',
        session_hint: sessionHint(),
        template_id: text(detail && detail.template_id),
        requested_package: text(detail && detail.requested_package),
        component: text(detail && detail.component),
        cta_text: text(detail && detail.cta_text),
        user_role_mode: text(stored('sm_worker_role_mode')),
        user_device_mode: text(stored('sm_worker_device_mode')),
        utm_source: text(params.get('utm_source')),
        utm_medium: text(params.get('utm_medium')),
        utm_campaign: text(params.get('utm_campaign')),
        utm_content: text(params.get('utm_content')),
        utm_term: text(params.get('utm_term'))
      };
      try {
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify(body)
        }).catch(function () {});
      } catch (error) {}
    }
    window.supermegaTrackBehavior = send;
    function setupTemplateId() {
      var match = window.location.pathname.match(/\\/agent-templates\\/([^/]+)\\/setup\\/?/);
      return match ? decodeURIComponent(match[1]) : '';
    }
    function workerName(id) {
      if (id === 'daily-intelligence-brief') return 'Daily Intelligence Brief Agent';
      if (id === 'deskpos-quickstart') return 'DeskPOS Quickstart';
      return String(id || '')
        .split('-')
        .filter(Boolean)
        .map(function (part) { return part.charAt(0).toUpperCase() + part.slice(1); })
        .join(' ')
        .replace(/\\bCrm\\b/g, 'CRM')
        .replace(/\\bPdf\\b/g, 'PDF')
        .replace(/\\bPos\\b/g, 'POS')
        .replace(/\\bSow\\b/g, 'SOW');
    }
    window.addEventListener('load', function () {
      send('page_viewed', { template_id: setupTemplateId() || params.get('template') || '' });
      if (setupTemplateId()) send('setup_started', { template_id: setupTemplateId(), component: 'agent_template_setup' });
    });
    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('a,button') : null;
      if (!target) return;
      var href = target.getAttribute('href') || '';
      var templateId = target.getAttribute('data-sm-template-link') || templateFromHref(href) || (target.closest('[data-worker-template]') && target.closest('[data-worker-template]').getAttribute('data-worker-template')) || '';
      var eventType = templateId ? 'template_clicked' : 'cta_clicked';
      send(eventType, {
        template_id: templateId,
        requested_package: params.get('package') || '',
        component: target.className || target.tagName || '',
        cta_text: target.textContent || ''
      });
    });
    document.addEventListener('submit', function (event) {
      var form = event.target;
      if (!form || !form.matches || !form.matches('form')) return;
      send('lead_form_submitted', {
        template_id: hidden(form, 'template_id') || params.get('template') || setupTemplateId(),
        requested_package: hidden(form, 'requested_package') || params.get('package') || '',
        component: form.getAttribute('data-agent-template-setup') !== null ? 'agent_template_setup_form' : 'lead_form'
      });
    }, true);
  })();
</script>`
const publicLocalWorkerAdaptationScript = `
<script>
  (function () {
    var catalog = ${workerContinueCatalogJson()};
    var storageKey = 'sm_worker_continue_state';
    var params = new URLSearchParams(window.location.search || '');
    function safeText(value) {
      return String(value || '').replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
      });
    }
    function templateFromHref(href) {
      var match = String(href || '').match(/\\/agent-templates\\/([^/?#]+)(?:\\/setup)?\\/?/);
      return match ? decodeURIComponent(match[1]) : '';
    }
    function setupTemplateId() {
      var match = window.location.pathname.match(/\\/agent-templates\\/([^/]+)\\/setup\\/?/);
      return match ? decodeURIComponent(match[1]) : '';
    }
    function workerName(id) {
      if (id === 'daily-intelligence-brief') return 'Daily Intelligence Brief Agent';
      if (id === 'deskpos-quickstart') return 'DeskPOS Quickstart';
      return String(id || '')
        .split('-')
        .filter(Boolean)
        .map(function (part) { return part.charAt(0).toUpperCase() + part.slice(1); })
        .join(' ')
        .replace(/\\bCrm\\b/g, 'CRM')
        .replace(/\\bPdf\\b/g, 'PDF')
        .replace(/\\bPos\\b/g, 'POS')
        .replace(/\\bSow\\b/g, 'SOW');
    }
    function findWorker(id) {
      id = String(id || '');
      for (var index = 0; index < catalog.length; index += 1) {
        if (catalog[index].id === id) return catalog[index];
      }
      return null;
    }
    function loadState() {
      try {
        var stored = window.localStorage && localStorage.getItem(storageKey);
        return stored ? JSON.parse(stored) : {};
      } catch (error) {
        return {};
      }
    }
    function saveState(state) {
      try {
        if (window.localStorage) localStorage.setItem(storageKey, JSON.stringify(state));
      } catch (error) {}
    }
    function rememberWorker(templateId, signal) {
      var worker = findWorker(templateId);
      if (!worker) return;
      var previous = loadState();
      var now = new Date().toISOString();
      saveState({
        template_id: worker.id,
        last_signal: String(signal || 'template_interest').slice(0, 80),
        signal_count: Math.max(1, Number(previous.signal_count || 0) + 1),
        first_seen_at: previous.first_seen_at || now,
        last_seen_at: now,
        last_page_path: window.location.pathname
      });
    }
    function clearWorker(event) {
      if (event) event.preventDefault();
      try {
        if (window.localStorage) localStorage.removeItem(storageKey);
      } catch (error) {}
      var panel = document.querySelector('[data-local-worker-continue]');
      if (panel) panel.hidden = true;
    }
    function renderPanel() {
      var state = loadState();
      var worker = findWorker(state.template_id);
      var wrap = document.querySelector('.wrap');
      var main = document.querySelector('main');
      if (!worker || !wrap || !main) return;
      var panel = document.querySelector('[data-local-worker-continue]');
      if (!panel) {
        panel = document.createElement('section');
        panel.className = 'local-worker-continue';
        panel.setAttribute('data-local-worker-continue', '');
        panel.setAttribute('aria-label', 'Browser-local worker continuation');
        wrap.insertBefore(panel, main);
      }
      var count = Math.max(1, Number(state.signal_count || 1));
      panel.innerHTML = [
        '<div>',
        '<div class="eyebrow">Browser-local continuation</div>',
        '<strong>Continue ' + safeText(workerName(worker.id)) + '.</strong>',
        '<p>Saved only in this browser: selected worker, last step, page path, and click count. No source files, typed business text, credentials, or payment data are stored.</p>',
        '<div class="local-worker-meta"><span>' + safeText(state.last_signal || 'template_interest') + '</span><span>' + count + ' signal' + (count === 1 ? '' : 's') + '</span><span>clear anytime</span></div>',
        '</div>',
        '<div class="local-worker-actions">',
        '<a class="btn primary" data-sm-template-link="' + safeText(worker.id) + '" href="' + safeText(worker.setupUrl) + '">Continue setup</a>',
        '<a class="btn secondary" data-sm-template-link="' + safeText(worker.id) + '" href="' + safeText(worker.contactUrl) + '">Ask for this worker</a>',
        '<a class="btn secondary" href="/ai-agents/guide/">User guide</a>',
        '<a class="local-worker-clear" href="#" data-local-worker-reset>Clear</a>',
        '</div>'
      ].join('');
      panel.hidden = false;
      var reset = panel.querySelector('[data-local-worker-reset]');
      if (reset) reset.addEventListener('click', clearWorker);
    }
    window.supermegaRememberWorker = rememberWorker;
    function rememberFromPage() {
      var currentTemplate = setupTemplateId() || params.get('template') || '';
      if (currentTemplate) rememberWorker(currentTemplate, setupTemplateId() ? 'setup_started' : 'template_param');
      renderPanel();
    }
    document.addEventListener('click', function (event) {
      var reset = event.target && event.target.closest ? event.target.closest('[data-local-worker-reset]') : null;
      if (reset) {
        clearWorker(event);
        return;
      }
      var target = event.target && event.target.closest ? event.target.closest('a,button') : null;
      if (!target) return;
      var href = target.getAttribute('href') || '';
      var templateId = target.getAttribute('data-sm-template-link') || templateFromHref(href) || (target.closest('[data-worker-template]') && target.closest('[data-worker-template]').getAttribute('data-worker-template')) || '';
      if (templateId) rememberWorker(templateId, 'template_clicked');
    });
    document.addEventListener('submit', function (event) {
      var form = event.target;
      if (!form || !form.querySelector) return;
      var field = form.querySelector('input[type="hidden"][name="template_id"]');
      if (field && field.value) rememberWorker(field.value, 'lead_form_submitted');
    }, true);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', rememberFromPage);
    } else {
      rememberFromPage();
    }
  })();
</script>`
const publicRoleModeScript = `
<script>
  (function () {
    var modes = ${roleModeOptionsJson()};
    var storageKey = 'sm_worker_role_mode';
    function safeText(value) {
      return String(value || '').replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
      });
    }
    function findMode(id) {
      id = String(id || '');
      for (var index = 0; index < modes.length; index += 1) {
        if (modes[index].id === id) return modes[index];
      }
      return null;
    }
    function modeLabel(mode) {
      if (!mode) return '';
      if (mode.label) return mode.label;
      return (mode.labelParts || []).join('');
    }
    function loadMode() {
      try {
        var stored = window.localStorage && localStorage.getItem(storageKey);
        return findMode(stored);
      } catch (error) {
        return null;
      }
    }
    function saveMode(id) {
      var mode = findMode(id);
      if (!mode) return null;
      try {
        if (window.localStorage) localStorage.setItem(storageKey, mode.id);
      } catch (error) {}
      return mode;
    }
    function ensureHidden(form, name) {
      var field = form.querySelector('input[type="hidden"][name="' + name + '"]');
      if (!field) {
        field = document.createElement('input');
        field.type = 'hidden';
        field.name = name;
        form.appendChild(field);
      }
      return field;
    }
    function applyRoleToForms() {
      var mode = loadMode();
      document.querySelectorAll('form').forEach(function (form) {
        ensureHidden(form, 'user_role_mode').value = mode ? mode.id : '';
        ensureHidden(form, 'user_role_label').value = mode ? modeLabel(mode) : '';
      });
    }
    function shouldShowPanel() {
      return /^\\/(ai-agents|agent-templates|contact)(\\/|$)/.test(window.location.pathname);
    }
    function renderPanel() {
      applyRoleToForms();
      if (!shouldShowPanel()) return;
      var wrap = document.querySelector('.wrap');
      var main = document.querySelector('main');
      if (!wrap || !main) return;
      var mode = loadMode();
      var panel = document.querySelector('[data-role-mode-panel]');
      if (!panel) {
        panel = document.createElement('section');
        panel.className = 'role-mode-panel';
        panel.setAttribute('data-role-mode-panel', '');
        panel.setAttribute('aria-label', 'Role-aware onboarding');
        wrap.insertBefore(panel, main);
      }
      var selectedCopy = mode
        ? '<strong>Using ' + safeText(modeLabel(mode)) + ' mode.</strong><p>' + safeText(mode.nextStep) + '</p><div class="role-mode-meta"><span>proof focus</span><span>' + safeText(mode.proofFocus) + '</span><span>saved only in this browser</span></div>'
        : '<strong>Choose your role mode.</strong><p>Owner, operator, and technical admin users need different next steps. This browser-local mode adapts setup forms and onboarding copy without storing private workflow text.</p><div class="role-mode-meta"><span>role only</span><span>no source text</span><span>clear by choosing another mode</span></div>';
      panel.innerHTML = [
        '<div>',
        '<div class="eyebrow">Role-aware onboarding</div>',
        selectedCopy,
        '</div>',
        '<div class="role-mode-actions">',
        modes.map(function (item) {
          return '<button class="role-mode-choice" type="button" data-role-mode-choice="' + safeText(item.id) + '" aria-pressed="' + (mode && mode.id === item.id ? 'true' : 'false') + '">' + safeText(modeLabel(item)) + '</button>';
        }).join(''),
        '</div>'
      ].join('');
    }
    window.supermegaSetRoleMode = function (id) {
      var mode = saveMode(id);
      renderPanel();
      applyRoleToForms();
      return mode;
    };
    document.addEventListener('click', function (event) {
      var button = event.target && event.target.closest ? event.target.closest('[data-role-mode-choice]') : null;
      if (!button) return;
      var mode = window.supermegaSetRoleMode(button.getAttribute('data-role-mode-choice'));
      if (mode && window.supermegaTrackBehavior) {
        window.supermegaTrackBehavior('cta_clicked', {
          requested_package: 'role-aware-onboarding',
          component: 'role_mode_panel',
          cta_text: 'role ' + mode.id
        });
      }
    });
    document.addEventListener('submit', applyRoleToForms, true);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', renderPanel);
    } else {
      renderPanel();
    }
  })();
</script>`
const publicDeviceModeScript = `
<script>
  (function () {
    var modes = ${deviceModeOptionsJson()};
    var storageKey = 'sm_worker_device_mode';
    var resizeTimer = null;
    function safeText(value) {
      return String(value || '').replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
      });
    }
    function viewportWidth() {
      return Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    }
    function detectMode() {
      var width = viewportWidth();
      var fallback = modes[0];
      for (var index = 0; index < modes.length; index += 1) {
        var item = modes[index];
        if (width >= item.minWidth && width <= item.maxWidth) return item;
      }
      return fallback;
    }
    function findMode(id) {
      id = String(id || '');
      for (var index = 0; index < modes.length; index += 1) {
        if (modes[index].id === id) return modes[index];
      }
      return null;
    }
    function saveMode(mode) {
      if (!mode) return null;
      try {
        if (window.localStorage) localStorage.setItem(storageKey, mode.id);
      } catch (error) {}
      return mode;
    }
    function loadMode() {
      var detected = detectMode();
      try {
        var stored = window.localStorage && localStorage.getItem(storageKey);
        if (!stored || stored !== detected.id) return saveMode(detected);
        return findMode(stored) || saveMode(detected);
      } catch (error) {
        return detected;
      }
    }
    function ensureHidden(form, name) {
      var field = form.querySelector('input[type="hidden"][name="' + name + '"]');
      if (!field) {
        field = document.createElement('input');
        field.type = 'hidden';
        field.name = name;
        form.appendChild(field);
      }
      return field;
    }
    function applyDeviceToForms() {
      var mode = loadMode();
      document.querySelectorAll('form').forEach(function (form) {
        ensureHidden(form, 'user_device_mode').value = mode ? mode.id : '';
        ensureHidden(form, 'user_device_label').value = mode ? mode.label : '';
      });
      return mode;
    }
    function shouldShowPanel() {
      return /^\\/(ai-agents|agent-templates|contact)(\\/|$)/.test(window.location.pathname);
    }
    function renderPanel(track) {
      var mode = applyDeviceToForms();
      if (!shouldShowPanel()) return mode;
      var wrap = document.querySelector('.wrap');
      var main = document.querySelector('main');
      if (!wrap || !main || !mode) return mode;
      var panel = document.querySelector('[data-device-mode-panel]');
      if (!panel) {
        panel = document.createElement('section');
        panel.className = 'device-mode-panel';
        panel.setAttribute('data-device-mode-panel', '');
        panel.setAttribute('aria-label', 'Device-aware onboarding');
        wrap.insertBefore(panel, main);
      }
      panel.innerHTML = [
        '<div>',
        '<div class="eyebrow">Device-aware onboarding</div>',
        '<strong>' + safeText(mode.label) + '.</strong>',
        '<p>' + safeText(mode.nextStep) + '</p>',
        '<div class="role-mode-meta"><span>screen fit</span><span>' + safeText(mode.proofFocus) + '</span><span>saved only in this browser</span></div>',
        '</div>',
        '<div class="device-mode-actions">',
        '<a class="btn primary" href="/agent-templates/">Setup kits</a>',
        '<a class="btn secondary" href="/ai-agents/guide/">User guide</a>',
        '</div>'
      ].join('');
      if (track && window.supermegaTrackBehavior) {
        window.supermegaTrackBehavior('cta_clicked', {
          requested_package: 'device-aware-onboarding',
          component: 'device_mode_panel',
          cta_text: mode.id
        });
      }
      return mode;
    }
    function scheduleRender() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () { renderPanel(false); }, 120);
    }
    window.supermegaDetectDeviceMode = loadMode;
    document.addEventListener('submit', applyDeviceToForms, true);
    window.addEventListener('resize', scheduleRender);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { renderPanel(true); });
    } else {
      renderPanel(true);
    }
  })();
</script>`
const publicAdaptiveSetupPlanScript = `
<script>
  (function () {
    var catalog = ${workerContinueCatalogJson()};
    var storageKey = 'sm_adaptive_setup_plan';
    var workerStateKey = 'sm_worker_continue_state';
    var roleKey = 'sm_worker_role_mode';
    var params = new URLSearchParams(window.location.search || '');
    var renderTimer = null;
    function safeText(value) {
      return String(value || '').replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
      });
    }
    function setupTemplateId() {
      var match = window.location.pathname.match(/\\/agent-templates\\/([^/]+)\\/setup\\/?/);
      return match ? decodeURIComponent(match[1]) : '';
    }
    function workerName(id) {
      if (id === 'daily-intelligence-brief') return 'Daily Intelligence Brief Agent';
      if (id === 'deskpos-quickstart') return 'DeskPOS Quickstart';
      return String(id || '')
        .split('-')
        .filter(Boolean)
        .map(function (part) { return part.charAt(0).toUpperCase() + part.slice(1); })
        .join(' ')
        .replace(/\\bCrm\\b/g, 'CRM')
        .replace(/\\bPdf\\b/g, 'PDF')
        .replace(/\\bPos\\b/g, 'POS')
        .replace(/\\bSow\\b/g, 'SOW');
    }
    function findWorker(id) {
      id = String(id || '');
      for (var index = 0; index < catalog.length; index += 1) {
        if (catalog[index].id === id) return catalog[index];
      }
      return null;
    }
    function readJson(key) {
      try {
        var stored = window.localStorage && localStorage.getItem(key);
        return stored ? JSON.parse(stored) : {};
      } catch (error) {
        return {};
      }
    }
    function readStored(key) {
      try {
        return window.localStorage ? localStorage.getItem(key) || '' : '';
      } catch (error) {
        return '';
      }
    }
    function selectedWorkerId() {
      var fromPath = setupTemplateId() || params.get('template') || params.get('agent_template') || '';
      if (fromPath) return fromPath;
      var recommended = document.querySelector('[data-router-result]')?.getAttribute('data-recommended-worker') || '';
      if (recommended) return recommended;
      return readJson(workerStateKey).template_id || '';
    }
    function roleLabel(role) {
      if (role === 'owner') return 'Owner mode';
      if (role === 'technical_admin') return 'Technical admin mode';
      if (role === 'operator') return 'Work reviewer mode';
      return 'Role not selected';
    }
    function roleStep(role) {
      if (role === 'owner') return 'Approve first proof target, payment route, and first production-run boundary.';
      if (role === 'technical_admin') return 'Confirm connector scope, permissions, vaulting, logs, and rollback boundary.';
      if (role === 'operator') return 'Collect source samples, review missing fields, and report daily workflow gaps.';
      return 'Choose a role mode so the setup request routes to the right checklist.';
    }
    function deviceStep(device) {
      if (device === 'phone') return 'Use phone for quick approval and screenshot capture.';
      if (device === 'tablet') return 'Use tablet for review queues, floor checks, and handoff.';
      if (device === 'desktop') return 'Use desktop for source review, setup forms, proof packets, and dashboards.';
      return 'Use the current screen for the first safe next step.';
    }
    function deviceMode() {
      if (window.supermegaDetectDeviceMode) {
        var detected = window.supermegaDetectDeviceMode();
        if (detected && detected.id) return detected;
      }
      return { id: readStored('sm_worker_device_mode'), label: '' };
    }
    function ensureHidden(form, name) {
      var field = form.querySelector('input[type="hidden"][name="' + name + '"]');
      if (!field) {
        field = document.createElement('input');
        field.type = 'hidden';
        field.name = name;
        form.appendChild(field);
      }
      return field;
    }
    function buildPlan() {
      var worker = findWorker(selectedWorkerId());
      var role = readStored(roleKey);
      var device = deviceMode();
      var nextStep = [roleStep(role), deviceStep(device.id)].join(' ');
      var summary = [
        worker ? workerName(worker.id) : 'No worker selected',
        roleLabel(role),
        device && device.label ? device.label : device.id || 'Device not detected'
      ].join(' | ');
      return {
        worker_id: worker ? worker.id : '',
        setup_url: worker ? worker.setupUrl : '/agent-templates/',
        contact_url: worker ? worker.contactUrl : '/contact/?package=ai-workcell-pilot',
        worker_name: worker ? workerName(worker.id) : 'Choose a worker',
        role_mode: role,
        role_label: roleLabel(role),
        device_mode: device && device.id ? device.id : '',
        device_label: device && device.label ? device.label : '',
        next_step: nextStep,
        summary: summary,
        generated_at: new Date().toISOString(),
        page_path: window.location.pathname
      };
    }
    function savePlan(plan) {
      try {
        if (window.localStorage) localStorage.setItem(storageKey, JSON.stringify(plan));
      } catch (error) {}
    }
    function applyPlanToForms(plan) {
      document.querySelectorAll('form').forEach(function (form) {
        ensureHidden(form, 'adaptive_worker_id').value = plan.worker_id || '';
        ensureHidden(form, 'adaptive_plan_summary').value = plan.summary || '';
        ensureHidden(form, 'adaptive_next_step').value = plan.next_step || '';
        ensureHidden(form, 'adaptive_user_path').value = plan.page_path || '';
      });
    }
    function shouldShowPanel() {
      return /^\\/(ai-agents|agent-templates|contact)(\\/|$)/.test(window.location.pathname);
    }
    function renderPlan(track) {
      var plan = buildPlan();
      savePlan(plan);
      applyPlanToForms(plan);
      if (!shouldShowPanel()) return plan;
      var wrap = document.querySelector('.wrap');
      var main = document.querySelector('main');
      if (!wrap || !main) return plan;
      var panel = document.querySelector('[data-adaptive-setup-plan]');
      if (!panel) {
        panel = document.createElement('section');
        panel.className = 'adaptive-plan-panel';
        panel.setAttribute('data-adaptive-setup-plan', '');
        panel.setAttribute('aria-label', 'Adaptive setup plan');
        wrap.insertBefore(panel, main);
      }
      panel.innerHTML = [
        '<div>',
        '<div class="eyebrow">Adaptive setup plan</div>',
        '<strong>' + safeText(plan.worker_name) + '</strong>',
        '<p>' + safeText(plan.next_step) + '</p>',
        '<div class="role-mode-meta"><span>' + safeText(plan.role_label) + '</span><span>' + safeText(plan.device_label || plan.device_mode || 'device pending') + '</span><span>first proof before production</span></div>',
        '</div>',
        '<div class="adaptive-plan-actions">',
        '<a class="btn primary" data-sm-template-link="' + safeText(plan.worker_id) + '" href="' + safeText(plan.setup_url) + '">Open setup</a>',
        '<a class="btn secondary" data-sm-template-link="' + safeText(plan.worker_id) + '" href="' + safeText(plan.contact_url) + '">Send request</a>',
        '<a class="btn secondary" href="/ai-agents/guide/">User guide</a>',
        '</div>'
      ].join('');
      if (track && window.supermegaTrackBehavior) {
        window.supermegaTrackBehavior('cta_clicked', {
          template_id: plan.worker_id,
          requested_package: 'adaptive-setup-plan',
          component: 'adaptive_setup_plan',
          cta_text: plan.role_mode + ' ' + plan.device_mode
        });
      }
      return plan;
    }
    function scheduleRender() {
      window.clearTimeout(renderTimer);
      renderTimer = window.setTimeout(function () { renderPlan(false); }, 140);
    }
    window.supermegaAdaptiveSetupPlan = renderPlan;
    document.addEventListener('submit', function () { renderPlan(false); }, true);
    document.addEventListener('click', function (event) {
      if (event.target && event.target.closest && event.target.closest('[data-role-mode-choice], [data-router-choice]')) scheduleRender();
    });
    window.addEventListener('resize', scheduleRender);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { renderPlan(true); });
    } else {
      renderPlan(true);
    }
  })();
</script>`
const publicAdaptiveSourcePackScript = `
<script>
  (function () {
    var catalog = ${workerSourcePackCatalogJson()};
    var storageKey = 'sm_adaptive_source_pack';
    var workerStateKey = 'sm_worker_continue_state';
    var params = new URLSearchParams(window.location.search || '');
    var renderTimer = null;
    function safeText(value) {
      return String(value || '').replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
      });
    }
    function setupTemplateId() {
      var match = window.location.pathname.match(/\\/agent-templates\\/([^/]+)\\/setup\\/?/);
      return match ? decodeURIComponent(match[1]) : '';
    }
    function workerName(id) {
      if (id === 'daily-intelligence-brief') return 'Daily Intelligence Brief Agent';
      if (id === 'deskpos-quickstart') return 'DeskPOS Quickstart';
      return String(id || '')
        .split('-')
        .filter(Boolean)
        .map(function (part) { return part.charAt(0).toUpperCase() + part.slice(1); })
        .join(' ')
        .replace(/\\bCrm\\b/g, 'CRM')
        .replace(/\\bPdf\\b/g, 'PDF')
        .replace(/\\bPos\\b/g, 'POS')
        .replace(/\\bSow\\b/g, 'SOW');
    }
    function readJson(key) {
      try {
        var stored = window.localStorage && localStorage.getItem(key);
        return stored ? JSON.parse(stored) : {};
      } catch (error) {
        return {};
      }
    }
    function selectedWorkerId() {
      var fromPath = setupTemplateId() || params.get('template') || params.get('agent_template') || '';
      if (fromPath) return fromPath;
      var recommended = document.querySelector('[data-router-result]')?.getAttribute('data-recommended-worker') || '';
      if (recommended) return recommended;
      var plan = readJson('sm_adaptive_setup_plan');
      if (plan.worker_id) return plan.worker_id;
      return readJson(workerStateKey).template_id || '';
    }
    function findWorker(id) {
      id = String(id || '');
      for (var index = 0; index < catalog.length; index += 1) {
        if (catalog[index].id === id) return catalog[index];
      }
      return null;
    }
    function ensureHidden(form, name) {
      var field = form.querySelector('input[type="hidden"][name="' + name + '"]');
      if (!field) {
        field = document.createElement('input');
        field.type = 'hidden';
        field.name = name;
        form.appendChild(field);
      }
      return field;
    }
    function buildPack() {
      var worker = findWorker(selectedWorkerId());
      if (!worker) {
        return {
          worker_id: '',
          worker_name: 'Choose a worker',
          required: [],
          samples: [],
          first_proof: '',
          readiness: 'choose_worker_first',
          summary: 'Choose a worker before sending sources.',
          setup_url: '/agent-templates/',
          contact_url: '/contact/?package=ai-workcell-pilot'
        };
      }
      var required = (worker.setupInputs || []).slice(0, 5);
      var samples = (worker.sampleSources || []).slice(0, 5);
      return {
        worker_id: worker.id,
        worker_name: workerName(worker.id),
        required: required,
        samples: samples,
        first_proof: worker.firstProof || '',
        readiness: 'selected_worker_source_pack',
        summary: required.join(', ') + ' | samples: ' + samples.join(', '),
        setup_url: worker.setupUrl,
        contact_url: worker.contactUrl,
        generated_at: new Date().toISOString()
      };
    }
    function savePack(pack) {
      try {
        if (window.localStorage) localStorage.setItem(storageKey, JSON.stringify(pack));
      } catch (error) {}
    }
    function applyPackToForms(pack) {
      document.querySelectorAll('form').forEach(function (form) {
        ensureHidden(form, 'source_pack_required').value = (pack.required || []).join('; ');
        ensureHidden(form, 'source_pack_samples').value = (pack.samples || []).join('; ');
        ensureHidden(form, 'source_pack_first_proof').value = pack.first_proof || '';
        ensureHidden(form, 'source_pack_readiness').value = pack.readiness || '';
      });
    }
    function shouldShowPanel() {
      return /^\\/(ai-agents|agent-templates|contact)(\\/|$)/.test(window.location.pathname);
    }
    function renderPack(track) {
      var pack = buildPack();
      savePack(pack);
      applyPackToForms(pack);
      if (!shouldShowPanel()) return pack;
      var wrap = document.querySelector('.wrap');
      var main = document.querySelector('main');
      if (!wrap || !main) return pack;
      var panel = document.querySelector('[data-adaptive-source-pack]');
      if (!panel) {
        panel = document.createElement('section');
        panel.className = 'source-pack-panel';
        panel.setAttribute('data-adaptive-source-pack', '');
        panel.setAttribute('aria-label', 'Source pack checklist');
        wrap.insertBefore(panel, main);
      }
      var samples = (pack.samples || []).slice(0, 4).map(function (item) { return '<li>' + safeText(item) + '</li>'; }).join('');
      panel.innerHTML = [
        '<div>',
        '<div class="eyebrow">Source pack checklist</div>',
        '<strong>' + safeText(pack.worker_name) + '</strong>',
        '<p>Send the smallest approved source pack that can prove the first output. Do not send credentials, payment secrets, or private system access first.</p>',
        '<ul>' + samples + '</ul>',
        '<div class="role-mode-meta"><span>' + safeText(pack.readiness) + '</span><span>first proof</span><span>' + safeText(pack.first_proof || 'pending') + '</span></div>',
        '</div>',
        '<div class="source-pack-actions">',
        '<a class="btn primary" data-sm-template-link="' + safeText(pack.worker_id) + '" href="' + safeText(pack.setup_url) + '">Use this checklist</a>',
        '<a class="btn secondary" data-sm-template-link="' + safeText(pack.worker_id) + '" href="' + safeText(pack.contact_url) + '">Send request</a>',
        '</div>'
      ].join('');
      if (track && window.supermegaTrackBehavior) {
        window.supermegaTrackBehavior('cta_clicked', {
          template_id: pack.worker_id,
          requested_package: 'adaptive-source-pack',
          component: 'adaptive_source_pack',
          cta_text: pack.readiness
        });
      }
      return pack;
    }
    function scheduleRender() {
      window.clearTimeout(renderTimer);
      renderTimer = window.setTimeout(function () { renderPack(false); }, 140);
    }
    window.supermegaAdaptiveSourcePack = renderPack;
    document.addEventListener('submit', function () { renderPack(false); }, true);
    document.addEventListener('click', function (event) {
      if (event.target && event.target.closest && event.target.closest('[data-router-choice], [data-role-mode-choice], [data-sm-template-link]')) scheduleRender();
    });
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { renderPack(true); });
    } else {
      renderPack(true);
    }
  })();
</script>`
const publicAdaptiveProofPlanScript = `
<script>
  (function () {
    var catalog = ${workerProofPlanCatalogJson()};
    var storageKey = 'sm_adaptive_proof_plan';
    var workerStateKey = 'sm_worker_continue_state';
    var params = new URLSearchParams(window.location.search || '');
    var renderTimer = null;
    function safeText(value) {
      return String(value || '').replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
      });
    }
    function setupTemplateId() {
      var match = window.location.pathname.match(/\\/agent-templates\\/([^/]+)\\/setup\\/?/);
      return match ? decodeURIComponent(match[1]) : '';
    }
    function workerName(id) {
      if (id === 'daily-intelligence-brief') return 'Daily Intelligence Brief Agent';
      if (id === 'deskpos-quickstart') return 'DeskPOS Quickstart';
      return String(id || '')
        .split('-')
        .filter(Boolean)
        .map(function (part) { return part.charAt(0).toUpperCase() + part.slice(1); })
        .join(' ')
        .replace(/\\bCrm\\b/g, 'CRM')
        .replace(/\\bPdf\\b/g, 'PDF')
        .replace(/\\bPos\\b/g, 'POS')
        .replace(/\\bSow\\b/g, 'SOW');
    }
    function readJson(key) {
      try {
        var stored = window.localStorage && localStorage.getItem(key);
        return stored ? JSON.parse(stored) : {};
      } catch (error) {
        return {};
      }
    }
    function readStored(key) {
      try {
        return window.localStorage ? localStorage.getItem(key) || '' : '';
      } catch (error) {
        return '';
      }
    }
    function selectedWorkerId() {
      var fromPath = setupTemplateId() || params.get('template') || params.get('agent_template') || '';
      if (fromPath) return fromPath;
      var recommended = document.querySelector('[data-router-result]')?.getAttribute('data-recommended-worker') || '';
      if (recommended) return recommended;
      var sourcePack = readJson('sm_adaptive_source_pack');
      if (sourcePack.worker_id) return sourcePack.worker_id;
      var plan = readJson('sm_adaptive_setup_plan');
      if (plan.worker_id) return plan.worker_id;
      return readJson(workerStateKey).template_id || '';
    }
    function findWorker(id) {
      id = String(id || '');
      for (var index = 0; index < catalog.length; index += 1) {
        if (catalog[index].id === id) return catalog[index];
      }
      return null;
    }
    function ensureHidden(form, name) {
      var field = form.querySelector('input[type="hidden"][name="' + name + '"]');
      if (!field) {
        field = document.createElement('input');
        field.type = 'hidden';
        field.name = name;
        form.appendChild(field);
      }
      return field;
    }
    function deviceMode() {
      if (window.supermegaDetectDeviceMode) {
        var detected = window.supermegaDetectDeviceMode();
        if (detected && detected.id) return detected;
      }
      return { id: readStored('sm_worker_device_mode'), label: '' };
    }
    function buildPlan() {
      var worker = findWorker(selectedWorkerId());
      var role = readStored('sm_worker_role_mode') || 'role_not_selected';
      var device = deviceMode();
      var sourcePack = readJson('sm_adaptive_source_pack');
      if (!worker) {
        return {
          worker_id: '',
          worker_name: 'Choose a worker',
          summary: 'Choose a worker before building the proof plan.',
          milestones: ['Choose worker', 'Send approved sample sources', 'Review first proof'],
          metrics: ['worker selected', 'source pack ready', 'approval gate clear'],
          gate: 'owner_approval_required_before_production',
          readiness: 'choose_worker_first',
          setup_url: '/agent-templates/',
          contact_url: '/contact/?package=ai-workcell-pilot',
          page_path: window.location.pathname,
          generated_at: new Date().toISOString()
        };
      }
      var firstInput = (worker.setupInputs || [])[0] || 'approved source boundary';
      var outputMetrics = (worker.outputs || []).slice(0, 3);
      var milestones = [
        'Day 1 source boundary: ' + firstInput,
        'Day 3 first proof: ' + (worker.firstProof || 'first useful output'),
        'Day 7 acceptance gate: accept, refine, or stop before production'
      ];
      var metrics = outputMetrics.concat(['source trace accepted', 'owner approval decision recorded']).slice(0, 5);
      return {
        worker_id: worker.id,
        worker_name: workerName(worker.id),
        summary: workerName(worker.id) + ' | ' + role + ' | ' + (device.label || device.id || 'device pending') + ' | ' + (sourcePack.readiness || 'source pack pending'),
        milestones: milestones,
        metrics: metrics,
        gate: 'owner_approval_required_before_production',
        readiness: 'first_proof_plan_ready',
        role_mode: role,
        device_mode: device.id || '',
        device_label: device.label || '',
        source_pack_readiness: sourcePack.readiness || '',
        setup_url: worker.setupUrl,
        contact_url: worker.contactUrl,
        page_path: window.location.pathname,
        generated_at: new Date().toISOString()
      };
    }
    function savePlan(plan) {
      try {
        if (window.localStorage) localStorage.setItem(storageKey, JSON.stringify(plan));
      } catch (error) {}
    }
    function applyPlanToForms(plan) {
      document.querySelectorAll('form').forEach(function (form) {
        ensureHidden(form, 'proof_plan_worker_id').value = plan.worker_id || '';
        ensureHidden(form, 'proof_plan_summary').value = plan.summary || '';
        ensureHidden(form, 'proof_plan_milestones').value = (plan.milestones || []).join('; ');
        ensureHidden(form, 'proof_plan_metrics').value = (plan.metrics || []).join('; ');
        ensureHidden(form, 'proof_plan_gate').value = plan.gate || '';
      });
    }
    function shouldShowPanel() {
      return /^\\/(ai-agents|agent-templates|contact)(\\/|$)/.test(window.location.pathname);
    }
    function renderPlan(track) {
      var plan = buildPlan();
      savePlan(plan);
      applyPlanToForms(plan);
      if (!shouldShowPanel()) return plan;
      var wrap = document.querySelector('.wrap');
      var main = document.querySelector('main');
      if (!wrap || !main) return plan;
      var panel = document.querySelector('[data-adaptive-proof-plan]');
      if (!panel) {
        panel = document.createElement('section');
        panel.className = 'proof-plan-panel';
        panel.setAttribute('data-adaptive-proof-plan', '');
        panel.setAttribute('aria-label', 'First proof planner');
        wrap.insertBefore(panel, main);
      }
      var milestones = (plan.milestones || []).slice(0, 3).map(function (item) { return '<li>' + safeText(item) + '</li>'; }).join('');
      panel.innerHTML = [
        '<div>',
        '<div class="eyebrow">First proof planner</div>',
        '<strong>' + safeText(plan.worker_name) + '</strong>',
        '<p>Use this 7-day proof plan to decide whether the worker is worth production setup before any recurring claim, connector write, or external action.</p>',
        '<ol>' + milestones + '</ol>',
        '<div class="role-mode-meta"><span>' + safeText(plan.readiness) + '</span><span>' + safeText(plan.gate) + '</span><span>' + safeText((plan.metrics || [])[0] || 'metric pending') + '</span></div>',
        '</div>',
        '<div class="proof-plan-actions">',
        '<a class="btn primary" data-sm-template-link="' + safeText(plan.worker_id) + '" href="' + safeText(plan.setup_url) + '">Start proof</a>',
        '<a class="btn secondary" data-sm-template-link="' + safeText(plan.worker_id) + '" href="' + safeText(plan.contact_url) + '">Send proof request</a>',
        '<a class="btn secondary" href="/ai-agents/guide/">User guide</a>',
        '</div>'
      ].join('');
      if (track && window.supermegaTrackBehavior) {
        window.supermegaTrackBehavior('cta_clicked', {
          template_id: plan.worker_id,
          requested_package: 'adaptive-first-proof-plan',
          component: 'adaptive_proof_plan',
          cta_text: plan.readiness
        });
      }
      return plan;
    }
    function scheduleRender() {
      window.clearTimeout(renderTimer);
      renderTimer = window.setTimeout(function () { renderPlan(false); }, 140);
    }
    window.supermegaAdaptiveProofPlan = renderPlan;
    document.addEventListener('submit', function () { renderPlan(false); }, true);
    document.addEventListener('click', function (event) {
      if (event.target && event.target.closest && event.target.closest('[data-router-choice], [data-role-mode-choice], [data-sm-template-link]')) scheduleRender();
    });
    window.addEventListener('resize', scheduleRender);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { renderPlan(true); });
    } else {
      renderPlan(true);
    }
  })();
</script>`
const publicAdaptiveValuePlanScript = `
<script>
  (function () {
    var catalog = ${workerValuePlanCatalogJson()};
    var storageKey = 'sm_adaptive_value_plan';
    var workerStateKey = 'sm_worker_continue_state';
    var params = new URLSearchParams(window.location.search || '');
    var renderTimer = null;
    function safeText(value) {
      return String(value || '').replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
      });
    }
    function setupTemplateId() {
      var match = window.location.pathname.match(/\\/agent-templates\\/([^/]+)\\/setup\\/?/);
      return match ? decodeURIComponent(match[1]) : '';
    }
    function workerName(id) {
      if (id === 'daily-intelligence-brief') return 'Daily Intelligence Brief Agent';
      if (id === 'deskpos-quickstart') return 'DeskPOS Quickstart';
      return String(id || '')
        .split('-')
        .filter(Boolean)
        .map(function (part) { return part.charAt(0).toUpperCase() + part.slice(1); })
        .join(' ')
        .replace(/\\bCrm\\b/g, 'CRM')
        .replace(/\\bPdf\\b/g, 'PDF')
        .replace(/\\bPos\\b/g, 'POS')
        .replace(/\\bSow\\b/g, 'SOW');
    }
    function readJson(key) {
      try {
        var stored = window.localStorage && localStorage.getItem(key);
        return stored ? JSON.parse(stored) : {};
      } catch (error) {
        return {};
      }
    }
    function selectedWorkerId() {
      var fromPath = setupTemplateId() || params.get('template') || params.get('agent_template') || '';
      if (fromPath) return fromPath;
      var recommended = document.querySelector('[data-router-result]')?.getAttribute('data-recommended-worker') || '';
      if (recommended) return recommended;
      var proofPlan = readJson('sm_adaptive_proof_plan');
      if (proofPlan.worker_id) return proofPlan.worker_id;
      var sourcePack = readJson('sm_adaptive_source_pack');
      if (sourcePack.worker_id) return sourcePack.worker_id;
      var plan = readJson('sm_adaptive_setup_plan');
      if (plan.worker_id) return plan.worker_id;
      return readJson(workerStateKey).template_id || '';
    }
    function findWorker(id) {
      id = String(id || '');
      for (var index = 0; index < catalog.length; index += 1) {
        if (catalog[index].id === id) return catalog[index];
      }
      return null;
    }
    function ensureHidden(form, name) {
      var field = form.querySelector('input[type="hidden"][name="' + name + '"]');
      if (!field) {
        field = document.createElement('input');
        field.type = 'hidden';
        field.name = name;
        form.appendChild(field);
      }
      return field;
    }
    function unique(values) {
      var seen = {};
      return (values || []).filter(function (value) {
        value = String(value || '').trim();
        if (!value || seen[value]) return false;
        seen[value] = true;
        return true;
      });
    }
    function metricsForWorker(worker) {
      var text = ((worker.outputs || []).join(' ') + ' ' + (worker.firstRunWorkflow || []).join(' ') + ' ' + (worker.firstProof || '')).toLowerCase();
      var metrics = ['time_saved', 'risk_removed'];
      if (/lead|deal|follow|payment|cash|pipeline|order|brief|decision/.test(text)) metrics.push('cash_followup');
      if (/quality|exception|error|validation|missing|risk|trace|clean|defect|claim/.test(text)) metrics.push('quality_or_error_reduction');
      if (metrics.indexOf('cash_followup') < 0) metrics.push('cash_followup');
      if (metrics.indexOf('quality_or_error_reduction') < 0) metrics.push('quality_or_error_reduction');
      return unique(metrics).slice(0, 4);
    }
    function evidenceForWorker(worker, sourcePack, proofPlan) {
      var outputs = worker.outputs || [];
      var outputText = outputs.join(' ').toLowerCase();
      var evidence = ['source trace accepted'];
      if (outputs.indexOf('decision queue') >= 0 || /decision/.test(outputText)) evidence.push('decision queue');
      if (outputs.indexOf('follow-up task list') >= 0 || /follow/.test(outputText)) evidence.push('follow-up task list');
      if (/exception|missing|validation|quality|risk|claim/.test(outputText)) evidence.push('exception or risk ledger');
      if (sourcePack && sourcePack.readiness) evidence.push('source pack boundary accepted');
      if (proofPlan && proofPlan.readiness) evidence.push('acceptance decision recorded');
      if (outputs[0]) evidence.push(outputs[0]);
      return unique(evidence).slice(0, 5);
    }
    function buildPlan() {
      var worker = findWorker(selectedWorkerId());
      var sourcePack = readJson('sm_adaptive_source_pack');
      var proofPlan = readJson('sm_adaptive_proof_plan');
      if (!worker) {
        return {
          worker_id: '',
          worker_name: 'Choose a worker',
          summary: 'Choose a worker before building the value proof plan.',
          metrics: ['time_saved', 'risk_removed', 'cash_followup'],
          evidence: ['source trace accepted', 'acceptance decision recorded'],
          gate: 'no_revenue_claim_without_payment_proof',
          readiness: 'choose_worker_first',
          setup_url: '/agent-templates/',
          contact_url: '/contact/?package=ai-workcell-pilot',
          page_path: window.location.pathname,
          generated_at: new Date().toISOString()
        };
      }
      var metrics = metricsForWorker(worker);
      var evidence = evidenceForWorker(worker, sourcePack, proofPlan);
      return {
        worker_id: worker.id,
        worker_name: workerName(worker.id),
        summary: workerName(worker.id) + ' value proof: ' + metrics.join(', ') + '. No revenue claim without payment proof.',
        metrics: metrics,
        evidence: evidence,
        gate: 'no_revenue_claim_without_payment_proof',
        readiness: 'value_proof_plan_ready',
        proof_plan_readiness: proofPlan.readiness || '',
        source_pack_readiness: sourcePack.readiness || '',
        first_proof: worker.firstProof || '',
        setup_url: worker.setupUrl,
        contact_url: worker.contactUrl,
        page_path: window.location.pathname,
        generated_at: new Date().toISOString()
      };
    }
    function savePlan(plan) {
      try {
        if (window.localStorage) localStorage.setItem(storageKey, JSON.stringify(plan));
      } catch (error) {}
    }
    function applyPlanToForms(plan) {
      document.querySelectorAll('form').forEach(function (form) {
        ensureHidden(form, 'value_plan_worker_id').value = plan.worker_id || '';
        ensureHidden(form, 'value_plan_summary').value = plan.summary || '';
        ensureHidden(form, 'value_plan_metrics').value = (plan.metrics || []).join('; ');
        ensureHidden(form, 'value_plan_evidence').value = (plan.evidence || []).join('; ');
        ensureHidden(form, 'value_plan_gate').value = plan.gate || '';
      });
    }
    function shouldShowPanel() {
      return /^\\/(ai-agents|agent-templates|contact)(\\/|$)/.test(window.location.pathname);
    }
    function renderPlan(track) {
      var plan = buildPlan();
      savePlan(plan);
      applyPlanToForms(plan);
      if (!shouldShowPanel()) return plan;
      var wrap = document.querySelector('.wrap');
      var main = document.querySelector('main');
      if (!wrap || !main) return plan;
      var panel = document.querySelector('[data-adaptive-value-plan]');
      if (!panel) {
        panel = document.createElement('section');
        panel.className = 'value-plan-panel';
        panel.setAttribute('data-adaptive-value-plan', '');
        panel.setAttribute('aria-label', 'Value proof plan');
        wrap.insertBefore(panel, main);
      }
      var evidence = (plan.evidence || []).slice(0, 4).map(function (item) { return '<li>' + safeText(item) + '</li>'; }).join('');
      panel.innerHTML = [
        '<div>',
        '<div class="eyebrow">Value proof plan</div>',
        '<strong>' + safeText(plan.worker_name) + '</strong>',
        '<p>No revenue claim without payment proof. Use this plan to prove time saved, risk removed, cash follow-up, and error reduction before retainer or production scale.</p>',
        '<ul>' + evidence + '</ul>',
        '<div class="role-mode-meta"><span>' + safeText(plan.readiness) + '</span><span>' + safeText(plan.gate) + '</span><span>' + safeText((plan.metrics || [])[0] || 'metric pending') + '</span></div>',
        '</div>',
        '<div class="value-plan-actions">',
        '<a class="btn primary" data-sm-template-link="' + safeText(plan.worker_id) + '" href="' + safeText(plan.setup_url) + '">Build value proof</a>',
        '<a class="btn secondary" data-sm-template-link="' + safeText(plan.worker_id) + '" href="' + safeText(plan.contact_url) + '">Send value plan</a>',
        '<a class="btn secondary" href="/ai-agents/guide/">User guide</a>',
        '</div>'
      ].join('');
      if (track && window.supermegaTrackBehavior) {
        window.supermegaTrackBehavior('cta_clicked', {
          template_id: plan.worker_id,
          requested_package: 'adaptive-value-proof-plan',
          component: 'adaptive_value_plan',
          cta_text: plan.readiness
        });
      }
      return plan;
    }
    function scheduleRender() {
      window.clearTimeout(renderTimer);
      renderTimer = window.setTimeout(function () { renderPlan(false); }, 140);
    }
    window.supermegaAdaptiveValuePlan = renderPlan;
    document.addEventListener('submit', function () { renderPlan(false); }, true);
    document.addEventListener('click', function (event) {
      if (event.target && event.target.closest && event.target.closest('[data-router-choice], [data-role-mode-choice], [data-sm-template-link]')) scheduleRender();
    });
    window.addEventListener('resize', scheduleRender);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { renderPlan(true); });
    } else {
      renderPlan(true);
    }
  })();
</script>`
const publicAdaptivePilotPlanScript = `
<script>
  (function () {
    var catalog = ${workerValuePlanCatalogJson()};
    var storageKey = 'sm_adaptive_pilot_plan';
    var workerStateKey = 'sm_worker_continue_state';
    var params = new URLSearchParams(window.location.search || '');
    var renderTimer = null;
    function safeText(value) {
      return String(value || '').replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
      });
    }
    function setupTemplateId() {
      var match = window.location.pathname.match(/\\/agent-templates\\/([^/]+)\\/setup\\/?/);
      return match ? decodeURIComponent(match[1]) : '';
    }
    function workerName(id) {
      if (id === 'daily-intelligence-brief') return 'Daily Intelligence Brief Agent';
      if (id === 'deskpos-quickstart') return 'DeskPOS Quickstart';
      return String(id || '')
        .split('-')
        .filter(Boolean)
        .map(function (part) { return part.charAt(0).toUpperCase() + part.slice(1); })
        .join(' ')
        .replace(/\\bCrm\\b/g, 'CRM')
        .replace(/\\bPdf\\b/g, 'PDF')
        .replace(/\\bPos\\b/g, 'POS')
        .replace(/\\bSow\\b/g, 'SOW');
    }
    function readJson(key) {
      try {
        var stored = window.localStorage && localStorage.getItem(key);
        return stored ? JSON.parse(stored) : {};
      } catch (error) {
        return {};
      }
    }
    function selectedWorkerId() {
      var fromPath = setupTemplateId() || params.get('template') || params.get('agent_template') || '';
      if (fromPath) return fromPath;
      var recommended = document.querySelector('[data-router-result]')?.getAttribute('data-recommended-worker') || '';
      if (recommended) return recommended;
      var valuePlan = readJson('sm_adaptive_value_plan');
      if (valuePlan.worker_id) return valuePlan.worker_id;
      var proofPlan = readJson('sm_adaptive_proof_plan');
      if (proofPlan.worker_id) return proofPlan.worker_id;
      var sourcePack = readJson('sm_adaptive_source_pack');
      if (sourcePack.worker_id) return sourcePack.worker_id;
      var plan = readJson('sm_adaptive_setup_plan');
      if (plan.worker_id) return plan.worker_id;
      return readJson(workerStateKey).template_id || '';
    }
    function findWorker(id) {
      id = String(id || '');
      for (var index = 0; index < catalog.length; index += 1) {
        if (catalog[index].id === id) return catalog[index];
      }
      return null;
    }
    function ensureHidden(form, name) {
      var field = form.querySelector('input[type="hidden"][name="' + name + '"]');
      if (!field) {
        field = document.createElement('input');
        field.type = 'hidden';
        field.name = name;
        form.appendChild(field);
      }
      return field;
    }
    function unique(values) {
      var seen = {};
      return (values || []).filter(function (value) {
        value = String(value || '').trim();
        if (!value || seen[value]) return false;
        seen[value] = true;
        return true;
      });
    }
    function buildPlan() {
      var worker = findWorker(selectedWorkerId());
      var valuePlan = readJson('sm_adaptive_value_plan');
      var proofPlan = readJson('sm_adaptive_proof_plan');
      if (!worker) {
        return {
          worker_id: '',
          worker_name: 'Choose a worker',
          summary: 'Choose a worker before building the paid pilot close plan.',
          scope: ['free proof first', 'owner-approved scope', 'payment proof before workspace'],
          next_action: 'Choose one worker and build the first proof.',
          gate: 'payment_proof_required_before_workspace_or_mrr',
          stage: 'choose_worker_first',
          readiness: 'choose_worker_first',
          setup_url: '/agent-templates/',
          contact_url: '/contact/?package=ai-workcell-pilot',
          page_path: window.location.pathname,
          generated_at: new Date().toISOString()
        };
      }
      var scope = unique([
        'free proof: ' + (worker.firstProof || 'first useful output'),
        'owner-approved paid pilot scope',
        'approval-only first run',
        'payment proof before workspace or MRR',
        'retainer review only after value evidence'
      ]);
      return {
        worker_id: worker.id,
        worker_name: workerName(worker.id),
        summary: workerName(worker.id) + ' paid pilot path: free proof, owner-approved paid pilot, payment proof before workspace or MRR.',
        scope: scope,
        next_action: 'Prepare paid pilot order room after owner-approved scope and payment proof.',
        gate: 'payment_proof_required_before_workspace_or_mrr',
        stage: 'free_proof_to_paid_pilot',
        readiness: 'pilot_close_plan_ready',
        value_plan_readiness: valuePlan.readiness || '',
        proof_plan_readiness: proofPlan.readiness || '',
        first_proof: worker.firstProof || '',
        setup_url: worker.setupUrl,
        contact_url: worker.contactUrl,
        page_path: window.location.pathname,
        generated_at: new Date().toISOString()
      };
    }
    function savePlan(plan) {
      try {
        if (window.localStorage) localStorage.setItem(storageKey, JSON.stringify(plan));
      } catch (error) {}
    }
    function applyPlanToForms(plan) {
      document.querySelectorAll('form').forEach(function (form) {
        ensureHidden(form, 'pilot_plan_worker_id').value = plan.worker_id || '';
        ensureHidden(form, 'pilot_plan_summary').value = plan.summary || '';
        ensureHidden(form, 'pilot_plan_scope').value = (plan.scope || []).join('; ');
        ensureHidden(form, 'pilot_plan_next_action').value = plan.next_action || '';
        ensureHidden(form, 'pilot_plan_gate').value = plan.gate || '';
      });
    }
    function shouldShowPanel() {
      return /^\\/(ai-agents|agent-templates|contact)(\\/|$)/.test(window.location.pathname);
    }
    function renderPlan(track) {
      var plan = buildPlan();
      savePlan(plan);
      applyPlanToForms(plan);
      if (!shouldShowPanel()) return plan;
      var wrap = document.querySelector('.wrap');
      var main = document.querySelector('main');
      if (!wrap || !main) return plan;
      var panel = document.querySelector('[data-adaptive-pilot-plan]');
      if (!panel) {
        panel = document.createElement('section');
        panel.className = 'pilot-plan-panel';
        panel.setAttribute('data-adaptive-pilot-plan', '');
        panel.setAttribute('aria-label', 'Paid pilot close plan');
        wrap.insertBefore(panel, main);
      }
      var scope = (plan.scope || []).slice(0, 4).map(function (item) { return '<li>' + safeText(item) + '</li>'; }).join('');
      panel.innerHTML = [
        '<div>',
        '<div class="eyebrow">Paid pilot close plan</div>',
        '<strong>' + safeText(plan.worker_name) + '</strong>',
        '<p>Free proof first. Paid pilot only after owner-approved scope. No workspace, retainer, or MRR claim before payment proof.</p>',
        '<ol>' + scope + '</ol>',
        '<div class="role-mode-meta"><span>' + safeText(plan.readiness) + '</span><span>' + safeText(plan.gate) + '</span><span>' + safeText(plan.stage) + '</span></div>',
        '</div>',
        '<div class="pilot-plan-actions">',
        '<a class="btn primary" data-sm-template-link="' + safeText(plan.worker_id) + '" href="' + safeText(plan.setup_url) + '">Open pilot setup</a>',
        '<a class="btn secondary" data-sm-template-link="' + safeText(plan.worker_id) + '" href="' + safeText(plan.contact_url) + '">Send pilot request</a>',
        '<a class="btn secondary" href="/ai-agents/guide/">User guide</a>',
        '</div>'
      ].join('');
      if (track && window.supermegaTrackBehavior) {
        window.supermegaTrackBehavior('cta_clicked', {
          template_id: plan.worker_id,
          requested_package: 'adaptive-paid-pilot-close-plan',
          component: 'adaptive_pilot_plan',
          cta_text: plan.readiness
        });
      }
      return plan;
    }
    function scheduleRender() {
      window.clearTimeout(renderTimer);
      renderTimer = window.setTimeout(function () { renderPlan(false); }, 140);
    }
    window.supermegaAdaptivePilotPlan = renderPlan;
    document.addEventListener('submit', function () { renderPlan(false); }, true);
    document.addEventListener('click', function (event) {
      if (event.target && event.target.closest && event.target.closest('[data-router-choice], [data-role-mode-choice], [data-sm-template-link]')) scheduleRender();
    });
    window.addEventListener('resize', scheduleRender);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { renderPlan(true); });
    } else {
      renderPlan(true);
    }
  })();
</script>`
const publicAdaptiveWorkerRouterScript = `
<script>
  (function () {
    var catalog = ${workerMatcherCatalogJson()};
    var storageKey = 'sm_adaptive_worker_router';
    function safeText(value) {
      return String(value || '').replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
      });
    }
    function loadState() {
      try {
        var stored = window.localStorage && localStorage.getItem(storageKey);
        return stored ? JSON.parse(stored) : {};
      } catch (error) {
        return {};
      }
    }
    function saveState(state) {
      try {
        if (window.localStorage) localStorage.setItem(storageKey, JSON.stringify(state));
      } catch (error) {}
    }
    function selectedValues(state) {
      return Object.keys(state).map(function (key) { return state[key]; }).filter(Boolean);
    }
    function scoreWorker(worker, values) {
      return values.reduce(function (score, value) {
        return score + (worker.signals.indexOf(value) >= 0 ? 1 : 0);
      }, 0);
    }
    function bestMatch(state) {
      var values = selectedValues(state);
      if (!values.length) return null;
      return catalog
        .map(function (worker) {
          return Object.assign({}, worker, { score: scoreWorker(worker, values) });
        })
        .sort(function (a, b) {
          if (b.score !== a.score) return b.score - a.score;
          return a.name.localeCompare(b.name);
        })[0] || null;
    }
    function setActiveChoices(router, state) {
      router.querySelectorAll('[data-router-choice]').forEach(function (button) {
        var active = state[button.getAttribute('data-router-group')] === button.getAttribute('data-router-choice');
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.classList.toggle('is-selected', active);
      });
    }
    function setWorkerHighlight(best) {
      document.querySelectorAll('[data-worker-template]').forEach(function (card) {
        var active = best && card.getAttribute('data-worker-template') === best.id;
        card.classList.toggle('is-router-match', Boolean(active));
        if (card.classList.contains('worker-card')) {
          card.style.order = active ? '-1' : '';
        }
      });
    }
    function renderResult(router, state) {
      var result = router.querySelector('[data-router-result]');
      if (!result) return;
      var best = bestMatch(state);
      setWorkerHighlight(best);
      if (!best || best.score < 1) {
        result.removeAttribute('data-recommended-worker');
        result.innerHTML = '<span>Recommendation</span><strong>Choose two or three signals.</strong><p>The matcher runs in the browser and does not read your typed business data.</p>';
        return;
      }
      result.setAttribute('data-recommended-worker', best.id);
      result.innerHTML = [
        '<span>Recommended first worker</span>',
        '<strong>' + safeText(best.name) + '</strong>',
        '<p>' + safeText(best.promise) + '</p>',
        '<div class="router-proof"><b>First proof</b><em>' + safeText(best.firstProof) + '</em></div>',
        '<div class="router-proof"><b>Buyer fit</b><em>' + safeText(best.buyer) + '</em></div>',
        '<div class="router-proof"><b>Live crew</b><em>' + safeText(best.crewId) + ' via ' + safeText(best.runEndpoint) + '</em></div>',
        '<div class="router-result-actions">',
        '<a class="btn primary" data-worker-run-action data-worker-run-endpoint="' + safeText(best.runEndpoint) + '" data-worker-crew="' + safeText(best.crewId) + '" href="' + safeText(best.runUrl) + '" target="_blank" rel="noreferrer">Open run endpoint</a>',
        '<a class="btn primary" data-sm-template-link="' + safeText(best.id) + '" href="' + safeText(best.setupUrl) + '">Start this worker</a>',
        '<a class="btn secondary" data-sm-template-link="' + safeText(best.id) + '" href="' + safeText(best.contactUrl) + '">Ask for this setup</a>',
        '</div>'
      ].join('');
      if (window.supermegaTrackBehavior) {
        window.supermegaTrackBehavior('template_clicked', {
          template_id: best.id,
          requested_package: 'adaptive-worker-matcher',
          component: 'adaptive_worker_matcher_result',
          cta_text: 'matched ' + best.name
        });
      }
    }
    function initRouter() {
      var router = document.querySelector('[data-worker-router]');
      if (!router) return;
      var state = loadState();
      setActiveChoices(router, state);
      renderResult(router, state);
      router.addEventListener('click', function (event) {
        var button = event.target && event.target.closest ? event.target.closest('[data-router-choice]') : null;
        if (!button) return;
        var group = button.getAttribute('data-router-group');
        var choice = button.getAttribute('data-router-choice');
        if (!group || !choice) return;
        state[group] = choice;
        saveState(state);
        setActiveChoices(router, state);
        renderResult(router, state);
      });
      var reset = router.querySelector('[data-router-reset]');
      if (reset) {
        reset.addEventListener('click', function () {
          state = {};
          saveState(state);
          setActiveChoices(router, state);
          renderResult(router, state);
        });
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initRouter);
    } else {
      initRouter();
    }
  })();
</script>`
const publicCrewEndpointDiscoveryScript = `
<script>
  (function () {
    var endpoint = '${publicCrewEndpoint}';
    function safeText(value) {
      return String(value || '').replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
      });
    }
    function setStatus(message, state) {
      document.querySelectorAll('[data-crew-endpoint-status]').forEach(function (el) {
        el.setAttribute('data-status', state || 'unknown');
        var target = el.querySelector('[data-crew-endpoint-message]');
        if (target) target.innerHTML = safeText(message);
      });
    }
    async function discover() {
      if (!document.querySelector('[data-crew-endpoint-status]')) return;
      setStatus('Checking live crew endpoint...', 'checking');
      try {
        var response = await fetch(endpoint, { method: 'GET', mode: 'cors', credentials: 'omit' });
        var payload = await response.json().catch(function () { return {}; });
        if (!response.ok || payload.ok !== true) {
          setStatus('Crew endpoint is live but not ready for public discovery. Draft-only run still requires owner-approved access.', 'blocked');
          return;
        }
        var crews = Array.isArray(payload.crews) ? payload.crews.join(', ') : 'read-my-chaos, owner-brief, outreach-draft';
        setStatus('Live crews discovered: ' + crews + '. POST { crew, input } is draft-only and auth-gated.', 'ready');
      } catch (error) {
        setStatus('Crew endpoint is configured; browser discovery is blocked or offline. Use the run endpoint after owner-approved access.', 'blocked');
      }
    }
    window.supermegaDiscoverLiveCrews = discover;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', discover);
    else discover();
  })();
</script>`
const publicRuntimeScripts = `${publicLanguageToggleScript}${publicBehaviorEventsScript}${publicLocalWorkerAdaptationScript}${publicRoleModeScript}${publicDeviceModeScript}${publicAdaptiveSetupPlanScript}${publicAdaptiveSourcePackScript}${publicAdaptiveProofPlanScript}${publicAdaptiveValuePlanScript}${publicAdaptivePilotPlanScript}`

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
    <title>AI Agent Army | SUPERMEGA.dev</title>
    <meta name="description" content="API-first AI agent crews, approval-gated workcells, and R&D-gated computer-use/mobile workers for real business tasks." />
    <meta name="theme-color" content="#0A0E1C" />
    <link rel="canonical" href="https://supermega.dev/ai-agents/" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    ${unicornSocialMeta({ title: 'AI Agent Army | SUPERMEGA.dev', description: 'Plug in real sources and get approval-gated AI agent crews with proof before scale.', url: 'https://supermega.dev/ai-agents/' })}
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
      .worker-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 16px; margin-top: 28px; }
      .worker-card { border: 1px solid var(--line); border-radius: 18px; padding: 22px; background: rgba(255,255,255,0.55); display: flex; flex-direction: column; gap: 13px; min-height: 100%; }
      .worker-meta { display: flex; gap: 8px; flex-wrap: wrap; }
      .worker-meta span { border: 1px solid var(--line); border-radius: 999px; padding: 4px 9px; color: var(--muted); font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
      .worker-card h3 { margin: 0; font-size: 20px; letter-spacing: -.02em; }
      .worker-card p { margin: 0; color: var(--muted); line-height: 1.5; font-size: 14px; }
      .worker-fact { display: grid; gap: 4px; }
      .worker-fact strong { font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: var(--blue); }
      .worker-fact span { color: var(--ink); font-size: 14px; line-height: 1.42; }
      .worker-card ul { margin: 0; padding-left: 18px; color: var(--muted); font-size: 13px; line-height: 1.45; }
      .worker-ladder { border: 1px solid rgba(42,36,28,.12); border-radius: 16px; padding: 14px; background: rgba(255,250,241,.62); display: grid; gap: 10px; }
      .worker-ladder > strong { display: block; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--clay); }
      .worker-ladder > div { display: grid; gap: 8px; }
      .worker-ladder-step { border-top: 1px solid rgba(42,36,28,.1); padding-top: 8px; }
      .worker-ladder-step:first-child { border-top: 0; padding-top: 0; }
      .worker-ladder-step strong { display: block; font-size: 13px; letter-spacing: -.01em; color: var(--ink); }
      .worker-ladder-step span { display: block; margin-top: 3px; color: var(--muted); font-size: 12px; line-height: 1.4; }
      .crew-endpoint-panel { border: 1px solid rgba(13,148,136,.28); border-radius: 18px; padding: 16px 18px; margin-top: 22px; background: rgba(13,148,136,.08); display: grid; gap: 8px; max-width: 76ch; }
      .crew-endpoint-panel strong { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--blue); }
      .crew-endpoint-panel code { white-space: normal; overflow-wrap: anywhere; font-size: 12px; color: var(--ink); }
      .crew-endpoint-panel span { color: var(--muted); line-height: 1.45; font-size: 13px; }
      .crew-endpoint-panel[data-status="ready"] { border-color: rgba(13,148,136,.42); background: rgba(13,148,136,.11); }
      .crew-endpoint-panel[data-status="blocked"] { border-color: rgba(255,59,59,.28); background: rgba(255,59,59,.08); }
      .worker-price { margin-top: auto; font-weight: 900; color: var(--ink); }
      .worker-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .worker-card.is-router-match { border-color: rgba(255,59,59,0.5); box-shadow: 0 22px 70px rgba(255,59,59,0.16); background: rgba(255,255,255,0.8); }
      .worker-router { display: grid; grid-template-columns: minmax(0,1.25fr) minmax(280px,.75fr); gap: 22px; align-items: stretch; }
      .router-copy p { color: var(--muted); line-height: 1.55; max-width: 62ch; }
      .router-groups { display: grid; gap: 16px; margin-top: 20px; }
      .router-choice-group { display: grid; gap: 9px; }
      .router-choice-group strong { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--blue); }
      .router-choice-row { display: flex; flex-wrap: wrap; gap: 8px; }
      .router-choice { border: 1px solid var(--line); border-radius: 999px; background: rgba(255,255,255,0.68); color: var(--ink); min-height: 40px; padding: 0 13px; font: inherit; font-size: 13px; font-weight: 850; cursor: pointer; }
      .router-choice.is-selected, .router-choice[aria-pressed="true"] { border-color: rgba(255,59,59,0.55); background: rgba(255,59,59,0.12); color: var(--blue); }
      .router-choice:focus-visible { outline: 3px solid rgba(255,59,59,0.22); outline-offset: 2px; }
      .router-result { border: 1px solid rgba(255,59,59,0.28); border-radius: 18px; padding: 20px; background: rgba(255,255,255,0.72); display: grid; gap: 12px; align-content: start; min-height: 100%; }
      .router-result span, .router-proof b { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--blue); font-style: normal; }
      .router-result strong { font-size: clamp(20px,2.4vw,30px); line-height: 1.08; letter-spacing: -.02em; }
      .router-result p { margin: 0; color: var(--muted); line-height: 1.48; }
      .router-proof { display: grid; gap: 4px; }
      .router-proof em { color: var(--ink); font-style: normal; line-height: 1.42; }
      .router-result-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
      .router-reset { justify-self: start; border: 0; background: transparent; color: var(--muted); font: inherit; font-size: 12px; font-weight: 850; cursor: pointer; padding: 4px 0; }
      .behavior-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; margin-top: 20px; }
      .behavior-step { border: 1px solid var(--line); border-radius: 18px; padding: 16px; background: rgba(255,255,255,0.5); }
      .behavior-step strong { display: block; }
      .behavior-step span { display: block; margin-top: 6px; color: var(--muted); font-size: 13px; line-height: 1.45; }
      .connector-section h2 { margin-bottom: 8px; }
      .connector-section .section-sub { color: var(--muted); font-size: 15px; margin-bottom: 28px; max-width: 52ch; }
      .connector-groups { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 24px; }
      .connector-group { display: grid; gap: 10px; }
      .connector-group-label { font-size: 11px; font-weight: 950; letter-spacing: 0.16em; text-transform: uppercase; color: var(--blue); }
      .connector-grid { display: flex; flex-wrap: wrap; gap: 8px; }
      .connector-chip { border: 1px solid var(--line); border-radius: 100px; padding: 6px 14px; font-size: 13px; font-weight: 500; color: var(--muted); background: rgba(255,255,255,0.55); transition: background 180ms ease, color 180ms ease; }
      .connector-chip:hover { background: var(--blue-soft); color: var(--blue); border-color: rgba(255,59,59,0.28); }
      .connector-note { margin-top: 28px; font-size: 14px; color: var(--muted); max-width: 52ch; }
      @media (max-width: 880px) { .connector-groups { grid-template-columns: 1fr; gap: 20px; } }
      .agent-proof { margin: 64px auto 0; max-width: 600px; text-align: center; }
      .agent-proof blockquote { font-family: 'Fraunces', Georgia, serif; font-size: clamp(17px,2vw,22px); font-style: italic; line-height: 1.45; color: var(--ink); border-left: 3px solid var(--blue); padding-left: 20px; text-align: left; margin: 0 0 20px; }
      .agent-proof cite { font-size: 14px; color: var(--muted); display: block; margin-top: 8px; }
      @media (max-width: 980px) { .worker-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } .behavior-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
      @media (max-width: 880px) { .sprint-grid, .worker-grid, .behavior-grid, .worker-router { grid-template-columns: 1fr; } }
      :root[data-theme="dark"] .sprint-card, :root[data-theme="dark"] .worker-card, :root[data-theme="dark"] .behavior-step { background: rgba(243,239,230,0.05); }
      :root[data-theme="dark"] .worker-card.is-router-match, :root[data-theme="dark"] .router-result, :root[data-theme="dark"] .router-choice { background: rgba(243,239,230,0.07); }
      :root[data-theme="dark"] .worker-ladder { background: rgba(243,239,230,.05); border-color: rgba(243,239,230,.12); }
      :root[data-theme="dark"] .crew-endpoint-panel { background: rgba(13,148,136,.08); }
      :root[data-theme="dark"] .connector-chip { background: rgba(243,239,230,0.05); border-color: rgba(243,239,230,0.12); }
      :root[data-theme="dark"] .connector-chip:hover { background: rgba(255,59,59,0.12); color: #FF3B3B; border-color: rgba(255,59,59,0.28); }
    </style>
  </head>
  <body>
    <div class="wrap">
${unicornHeader}
      <main>
        <section class="agent-hero section">
          <div class="eyebrow">AI Agent Army · API-first · owner-approved</div>
          <h1>Agents that do the tasks SaaS leaves for humans.</h1>
          <p>Connect approved sources, choose a worker, and get a traceable first proof. Safe jobs run through APIs and queues first. The first paid path is the AI Workcell Pilot. Computer-use and mobile app actions are gated workcells until reliability, consent, vaulting, legal review, and audit logs are proven.</p>
          <div class="cta"><a class="btn primary" href="/agent-templates/">Choose a worker</a><a class="btn secondary" href="/ai-agents/guide/">Read the user guide</a><a class="btn secondary" href="/contact/?package=ai-workcell-pilot">Start with one source pack</a></div>
          <p class="hero-tagline">Cast real work into software.</p>
        </section>

        <section class="section sm-in">
          <div class="workcell-panel">
            <div class="eyebrow">proof-to-maintenance</div>
            <h2>One practical path from sample data to a managed worker.</h2>
            <p>Every send, write, payment, browser/mobile action, or connector write waits for approval. The first month proves one valuable workflow; it does not pretend the company runs itself. MRR stays 0 until payment proof.</p>
            <div class="workcell-grid">
              <div class="workcell-step"><strong>Source pack</strong><span>You send the real files, messages, exports, or screenshots that define the work.</span></div>
              <div class="workcell-step"><strong>First proof</strong><span>We return one useful output with source trace before full pilot commitment.</span></div>
              <div class="workcell-step"><strong>First production run</strong><span>The first real run stays approval-only and records what happened in the ledger.</span></div>
              <div class="workcell-step"><strong>Owner acceptance</strong><span>You approve value, request changes, or stop. Nothing scales without a decision.</span></div>
              <div class="workcell-step"><strong>Maintenance</strong><span>After acceptance, we maintain the worker, monitor failures, and improve the workflow as evidence grows.</span></div>
            </div>
          </div>
        </section>

        <section class="section adaptive-worker-section" data-worker-router>
          <div class="workcell-panel worker-router">
            <div class="router-copy">
              <div class="eyebrow">Adaptive Worker Matcher</div>
              <h2>Route a buyer to the right first worker before a call.</h2>
              <p>Choose the job, source type, buyer, and output. The page recommends a first worker, highlights it in the shelf, and keeps the selected template in the setup path. No typed business data, uploaded files, credentials, or private source content are read by the matcher.</p>
              <div class="router-groups">
                <div class="router-choice-group">
                  <strong>Job</strong>
                  <div class="router-choice-row">
                    <button class="router-choice" type="button" data-router-group="job" data-router-choice="sales-follow-up" aria-pressed="false">Sales follow-up</button>
                    <button class="router-choice" type="button" data-router-group="job" data-router-choice="documents" aria-pressed="false">Documents</button>
                    <button class="router-choice" type="button" data-router-group="job" data-router-choice="daily-ops" aria-pressed="false">Daily ops</button>
                    <button class="router-choice" type="button" data-router-group="job" data-router-choice="store-pos" aria-pressed="false">Shop / POS</button>
                    <button class="router-choice" type="button" data-router-group="job" data-router-choice="factory" aria-pressed="false">Factory</button>
                  </div>
                </div>
                <div class="router-choice-group">
                  <strong>Source</strong>
                  <div class="router-choice-row">
                    <button class="router-choice" type="button" data-router-group="source" data-router-choice="chat-orders" aria-pressed="false">Chat orders</button>
                    <button class="router-choice" type="button" data-router-group="source" data-router-choice="pdfs-docs" aria-pressed="false">PDFs / scans</button>
                    <button class="router-choice" type="button" data-router-group="source" data-router-choice="spreadsheet-files" aria-pressed="false">Sheets</button>
                    <button class="router-choice" type="button" data-router-group="source" data-router-choice="email-calendar" aria-pressed="false">Inbox / calendar</button>
                    <button class="router-choice" type="button" data-router-group="source" data-router-choice="factory-records" aria-pressed="false">Plant records</button>
                    <button class="router-choice" type="button" data-router-group="source" data-router-choice="scope-notes" aria-pressed="false">Scope notes</button>
                  </div>
                </div>
                <div class="router-choice-group">
                  <strong>Buyer</strong>
                  <div class="router-choice-row">
                    <button class="router-choice" type="button" data-router-group="buyer" data-router-choice="owner-founder" aria-pressed="false">Owner</button>
                    <button class="router-choice" type="button" data-router-group="buyer" data-router-choice="sales-team" aria-pressed="false">Sales team</button>
                    <button class="router-choice" type="button" data-router-group="buyer" data-router-choice="admin-ops" aria-pressed="false">Admin ops</button>
                    <button class="router-choice" type="button" data-router-group="buyer" data-router-choice="factory-team" aria-pressed="false">Factory team</button>
                    <button class="router-choice" type="button" data-router-group="buyer" data-router-choice="professional-services" aria-pressed="false">Professional services</button>
                  </div>
                </div>
                <div class="router-choice-group">
                  <strong>Output</strong>
                  <div class="router-choice-row">
                    <button class="router-choice" type="button" data-router-group="output" data-router-choice="ledger" aria-pressed="false">Ledger</button>
                    <button class="router-choice" type="button" data-router-group="output" data-router-choice="follow-up" aria-pressed="false">Follow-up queue</button>
                    <button class="router-choice" type="button" data-router-group="output" data-router-choice="proposal" aria-pressed="false">Proposal</button>
                    <button class="router-choice" type="button" data-router-group="output" data-router-choice="brief" aria-pressed="false">Brief</button>
                    <button class="router-choice" type="button" data-router-group="output" data-router-choice="dashboard" aria-pressed="false">Dashboard</button>
                    <button class="router-choice" type="button" data-router-group="output" data-router-choice="checkout" aria-pressed="false">Checkout</button>
                  </div>
                </div>
              </div>
              <button class="router-reset" type="button" data-router-reset>Reset matcher</button>
            </div>
            <div class="router-result" data-router-result>
              <span>Recommendation</span>
              <strong>Choose two or three signals.</strong>
              <p>The matcher runs in the browser and does not read your typed business data.</p>
            </div>
          </div>
        </section>

        <section class="section worker-shelf-section">
          <div class="eyebrow">General AI Worker Toolkit</div>
          <h2>Pick one reusable worker and prove it on real sources.</h2>
          <p style="color:var(--muted);max-width:62ch">These are sellable general-use tools: each has a buyer, source pack, first proof, output list, setup kit, and approval boundary. Start with one worker; add connectors, schedules, and maintenance only after evidence.</p>
          <div class="crew-endpoint-panel" data-crew-endpoint-status data-crew-endpoint="${publicCrewEndpoint}">
            <strong>Live crew endpoint</strong>
            <code>${publicCrewEndpoint}</code>
            <span data-crew-endpoint-message>GET discovers live crews: read-my-chaos, owner-brief, outreach-draft. POST { crew, input } runs draft-only, auth-gated work after owner-approved access.</span>
          </div>
          <div class="worker-grid">
${renderSellableWorkerShelf()}
          </div>
        </section>

        <section class="section sm-in">
          <div class="workcell-panel">
            <div class="eyebrow">behavior loop</div>
            <h2>Built to learn which worker a buyer actually needs.</h2>
            <p>SuperMega records privacy-light first-party events: page viewed, CTA clicked, template clicked, setup started, and lead submitted. No keystrokes, source files, credentials, or private business text are tracked. The signal helps route each buyer to the right first proof and helps us improve the catalog.</p>
            <div class="behavior-grid">
              <div class="behavior-step"><strong>Watch intent</strong><span>Template clicks and setup starts show which worker the buyer is choosing.</span></div>
              <div class="behavior-step"><strong>Adapt the route</strong><span>Contact and setup forms keep the selected template, package, and campaign context.</span></div>
              <div class="behavior-step"><strong>Improve follow-up</strong><span>Operators see the worker context before asking for sample files or booking a call.</span></div>
              <div class="behavior-step"><strong>Keep it safe</strong><span>Analytics failures never block the site and do not trigger external actions.</span></div>
            </div>
          </div>
        </section>

        <section class="section connector-section">
          <h2>One kernel, wired into 51 real systems.</h2>
          <p class="section-sub">Agents read from the tools your team already uses and act through rails you already trust. API connectors come first; browser, desktop, and mobile hands are used only when no safer API/export path exists.</p>
          <div style="border:1px solid rgba(255,59,59,0.45);border-radius:18px;background:linear-gradient(135deg, rgba(255,59,59,0.12), rgba(255,59,59,0.06));padding:16px 20px;margin-bottom:20px">
            <div class="connector-group-label" style="color:#B8892E">★ Myanmar-native rails — built in, no global SaaS has these · 8</div>
            <div class="connector-grid" style="margin-top:10px">
              ${['KBZPay','WavePay','AYA Pay','CB Pay','OnePay','MMQR','CBM Rate','Viber'].map((n) => `<div class="connector-chip" style="border-color:rgba(255,59,59,0.55);background:rgba(255,59,59,0.14);color:#7a6320;font-weight:850">${n}</div>`).join('')}
            </div>
          </div>
          <div class="connector-groups">
            ${[
              ['Messaging & notify', ['Telegram', 'WhatsApp Business', 'Instagram', 'LINE', 'LINE Notify', 'Facebook Messenger', 'Slack', 'Microsoft Teams', 'Discord', 'SMS (Twilio)', 'Email (Resend)']],
              ['Data & work', ['Gmail', 'Google Drive', 'Google Sheets', 'Google Calendar', 'Notion', 'Airtable', 'HubSpot', 'Supabase', 'QuickBooks', 'Xero', 'Dropbox', 'Mailchimp']],
              ['AI models', ['Claude (gateway)', 'Anthropic (Claude)', 'OpenAI (GPT)', 'Google Gemini', 'OpenRouter', 'DeepSeek', 'Mistral', 'Groq', 'Cohere']],
              ['Commerce', ['Shopify', 'WooCommerce', 'Shopee', 'Lazada', 'Square', 'Barcode (EAN-13)']],
              ['Payments (global) & integration', ['Stripe', '2C2P', 'Generic Webhook', 'Zapier', 'Generic HTTP']],
            ].map(([label, items]) => `<div class="connector-group"><div class="connector-group-label">${label} · ${items.length}</div><div class="connector-grid">${items.map((n) => `<div class="connector-chip">${n}</div>`).join('')}</div></div>`).join('')}
          </div>
          <p class="connector-note">51 connectors live in the kernel today — and adding the next one is a single adapter file, not a rebuild. That's the architecture: it scales by addition, never by replacing what works. Most clients start with two or three.</p>
        </section>

        <section class="section">
          <div class="eyebrow">Technical architecture</div>
          <h2>Why this works when other platforms don't</h2>
          <p style="color:var(--muted);max-width:56ch;margin-bottom:32px">Most "AI tools" are wrappers over a single API. SuperMega is a kernel — a shared data spine, an action bus, and 51 pre-wired connectors that agents can combine to build real workflows from your actual data.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px">
            <div class="output"><strong>51 connectors, pre-wired</strong><span style="color:var(--muted);display:block;margin-top:6px;font-size:15px">Including Myanmar-native rails — KBZ Pay, Wave Pay, AYA Pay, CB Pay, MMQR, CBM Rate, and Viber. No international platform has these. An agent can read a Gmail thread, calculate in MMK at today's rate, and send a Viber alert — in one pipeline.</span></div>
            <div class="output"><strong>Multi-model AI kernel</strong><span style="color:var(--muted);display:block;margin-top:6px;font-size:15px">Claude, Gemini, and GPT-4o in one registry. Each agent call routes to the right model by task and cost. Drafting an email reply uses a cheap fast model. Classifying 500 warranty claims uses the most accurate one.</span></div>
            <div class="output"><strong>Approval-gated action bus</strong><span style="color:var(--muted);display:block;margin-top:6px;font-size:15px">Agents prepare work. You approve. Every money, send, and access action requires a human decision. The pipeline persists every action to a ledger — nothing happens silently, nothing repeats without cause.</span></div>
            <div class="output"><strong>Real-data, first call</strong><span style="color:var(--muted);display:block;margin-top:6px;font-size:15px">We connect to your actual Gmail, Drive, Sheets, and database on the first day. Not demo data, not sample exports. The first output is built from your real inputs so the price and timeline are accurate before any deposit.</span></div>
          </div>
        </section>

        <section class="section agent-proof">
          <blockquote>A Yangon factory had a year of warranty claims — about 120 of them — buried across hundreds of Gmail threads, with no owner and no way to see what was overdue. We turned them into one clean ledger: every claim with an owner, a status, and a link back to the email it came from.</blockquote>
          <cite>— A real build, from real data</cite>
          <div class="cta" style="justify-content:center;margin-top:28px">
            <a class="btn primary" href="/contact/?package=agent" style="background:linear-gradient(180deg,#F6851F,#F26419);border-color:#F26419;color:#fff;box-shadow:0 12px 30px rgba(242,100,25,0.30)">Start with one agent</a>
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
${publicRuntimeScripts}
${publicAdaptiveWorkerRouterScript}
${publicCrewEndpointDiscoveryScript}
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
    <title>supermega.dev — your business, in one simple app</title>
    <meta name="description" content="One simple app for your whole business — sales, stock, customers and money. Easy to use, yours to keep, and it works on the phone you already have." />
    <meta name="theme-color" content="#0A0E1C" />
    <link rel="canonical" href="https://supermega.dev/" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <link rel="manifest" href="/site.webmanifest?v=supermega-atelier-20260623" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SUPERMEGA.dev" />
    <meta property="og:title" content="supermega.dev — your business, in one simple app" />
    <meta property="og:description" content="One simple app for your whole business. Easy to use, yours to keep." />
    <meta property="og:url" content="https://supermega.dev/" />
    <meta property="og:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="supermega.dev — your business, in one simple app" />
    <meta name="twitter:description" content="One simple app for your whole business. Yours to keep." />
    <meta name="twitter:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"SUPERMEGA.dev","url":"https://supermega.dev/","logo":"https://supermega.dev/favicon.svg","description":"Free core business tools and premium AI workers for Myanmar SMBs and factories. POS, factory operations, AI agent crews, data cleanup, and approval-gated workcells.","email":"swanhtet@supermega.dev","telephone":"+95-9-500-0721","sameAs":["https://www.linkedin.com/in/theswanhtet"]}</script>
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
      .workcell-panel { border: 1px solid var(--line); border-radius: 28px; padding: clamp(22px,4vw,40px); background: linear-gradient(135deg, rgba(255,59,59,0.06), rgba(255,59,59,0.055)); }
      .workcell-panel p { color: var(--muted); line-height: 1.58; max-width: 66ch; }
      .workcell-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; margin-top: 22px; }
      .workcell-step { border: 1px solid var(--line); border-radius: 18px; padding: 16px; background: rgba(255,255,255,0.52); }
      .workcell-step strong { display: block; letter-spacing: -0.02em; }
      .workcell-step span { display: block; margin-top: 7px; color: var(--muted); font-size: 13px; line-height: 1.43; }
      :root[data-theme="dark"] .workcell-step { background: rgba(243,239,230,0.05); }
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
        .workcell-grid { grid-template-columns: 1fr; }
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
            <h1>Your whole business, in one simple app.</h1>
            <p style="font-size:clamp(16px,2vw,19px);color:var(--muted);margin:18px 0 0;max-width:36ch;line-height:1.55">Sales, stock, customers and money — together in one place, and easy to use. You own it, and it works on the phone you already have.</p>
            <div class="cta" style="margin-top:28px">
              <a class="btn primary" href="/free/">Start free</a>
              <a class="btn secondary" href="/offers/">See how it works</a>
            </div>
          </div>
          <aside class="product-stage" aria-label="supermega app">
            <img class="hero-img" src="/site/shots/live-product-restaurant-pos-menu-inventory.png?v=${publicShotVersion}" alt="supermega — your business in one app" loading="eager" decoding="async" />
            <div class="proof-line" aria-label="Why it is simple">
              <div class="proof"><b>Free to start</b><span>No card</span></div>
              <div class="proof"><b>Yours to keep</b><span>One app</span></div>
              <div class="proof"><b>On your phone</b><span>Nothing to install</span></div>
            </div>
          </aside>
        </section>

        <section class="section" id="products">
          <h2>Three tools, one place your business runs.</h2>
          <div class="uvp-grid">
            <div class="uvp-card" style="border-top:3px solid #FF3B3B"><strong>Shop</strong><span>Sales, stock, customers and money for your shop or restaurant — the everyday app.</span></div>
            <div class="uvp-card" style="border-top:3px solid #F59E1B"><strong>Factory</strong><span>Track issues, maintenance, quality and orders for your factory or workshop.</span></div>
            <div class="uvp-card" style="border-top:3px solid #8B5CF6"><strong>Studio</strong><span>Make your marketing — posts, product photos and ads — in minutes, with AI.</span></div>
          </div>
        </section>

        <section class="section">
          <div style="border:1px solid var(--line);border-radius:20px;padding:clamp(24px,4vw,36px);text-align:center;background:rgba(255,59,59,0.045)">
            <p style="font-size:clamp(18px,2.4vw,23px);font-weight:600;letter-spacing:-.01em;max-width:42ch;margin:0 auto;color:var(--ink)">Simple to start. Yours to keep. Made for the way your business really works.</p>
            <div class="cta" style="justify-content:center;margin-top:22px"><a class="btn primary" href="/free/">Start free</a></div>
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
${publicRuntimeScripts}
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
    <meta name="description" content="Free-core tools, premium AI/data layers, and custom agent crews for Myanmar shops, factories, and operators." />
    <meta name="theme-color" content="#0A0E1C" />
    <link rel="canonical" href="https://supermega.dev/products/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SUPERMEGA.dev" />
    <meta property="og:title" content="SUPERMEGA.dev products - free core tools and AI agent crews" />
    <meta property="og:description" content="DeskPOS, Factory & Operations App, and Custom Solutions & AI Agents: free-core tools, premium data layers, and approval-gated workers." />
    <meta property="og:url" content="https://supermega.dev/products/" />
    <meta property="og:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="SUPERMEGA.dev products" />
    <meta name="twitter:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"CollectionPage","name":"SUPERMEGA.dev products","url":"https://supermega.dev/products/","description":"Free-core tools, premium AI/data layers, and custom agent crews for Myanmar businesses."}</script>
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
      .mini-screen small { color: #FF3B3B; font-size: 10px; font-weight: 950; letter-spacing: .16em; text-transform: uppercase; }
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
            <div class="eyebrow">Free-core tools · Premium AI/data layers · Custom agent crews</div>
            <h1>Built for Myanmar. Designed to replace bloated SaaS.</h1>
            <p>Start with a useful free or fixed-scope tool. Add premium AI only when it handles a real money job: cleanup, reconciliation, reports, inboxes, approvals, and mobile or desktop workflows.</p>
            <div class="cta">
              <a class="btn primary" href="/free/" style="background:linear-gradient(180deg,#F6851F,#F26419);border-color:#F26419;color:#fff;box-shadow:0 12px 30px rgba(242,100,25,0.30)">Try the free tool</a>
              <a class="btn secondary" href="/ai-agents/">See agent crews</a>
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
          <h2>Plug-and-play templates for real workers.</h2>
          <p>Pick a worker, send one source sample, and get first proof before anything is connected, sent, billed, or changed. These templates become the reusable operating layer behind every premium agent crew.</p>
          <div class="template-grid">
${renderPublicAgentTemplateCards()}
          </div>
        </section>

        <section class="section sm-in">
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
${publicRuntimeScripts}
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
    <meta name="theme-color" content="#0A0E1C" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>${unicornShellStyle}
      .contact-main { display: grid; grid-template-columns: minmax(0, 0.78fr) minmax(320px, 1.22fr); gap: clamp(24px, 5vw, 64px); align-items: center; min-height: calc(100svh - 84px); padding: 14px 0 34px; }
      form { display: grid; gap: 10px; border: 1px solid rgba(255,255,255,0.74); border-radius: 28px; padding: clamp(16px, 2.8vw, 24px); background: rgba(255,255,255,0.62); box-shadow: var(--shadow); backdrop-filter: blur(22px); }
      .form-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; }
      .wide { grid-column: 1 / -1; }
      label { display: grid; gap: 7px; color: var(--muted); font-size: 12px; font-weight: 950; letter-spacing: 0.14em; text-transform: uppercase; }
      input, textarea, select { width: 100%; border: 1px solid var(--line); border-radius: 14px; background: rgba(255,250,241,0.86); color: var(--ink); padding: 11px 12px; font: inherit; outline: none; }
      input[type="file"] { cursor: pointer; }
      input[type="file"]::file-selector-button { margin-right: 10px; border: 0; border-radius: 999px; background: linear-gradient(135deg, #111827, #FF3B3B); color: #fff; cursor: pointer; font: inherit; font-size: 13px; font-weight: 950; padding: 9px 12px; }
      select { appearance: none; background-image: linear-gradient(45deg, transparent 50%, var(--muted) 50%), linear-gradient(135deg, var(--muted) 50%, transparent 50%); background-position: calc(100% - 20px) 20px, calc(100% - 14px) 20px; background-size: 6px 6px, 6px 6px; background-repeat: no-repeat; }
      textarea { min-height: 88px; resize: vertical; }
      input:focus, textarea:focus, select:focus { border-color: rgba(255,59,59,0.55); box-shadow: 0 0 0 4px rgba(255,59,59,0.10); }
      button { width: 100%; cursor: pointer; }
      button[disabled] { cursor: wait; opacity: 0.66; transform: none; }
      .form-status { min-height: 20px; margin: -2px 0 0; color: var(--muted); font-size: 13px; font-weight: 850; line-height: 1.35; }
      .field-help { color: var(--muted); font-size: 12px; font-weight: 800; letter-spacing: 0; line-height: 1.35; text-transform: none; }
      .upload-list { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 2px; }
      .upload-list span { border: 1px solid var(--line); border-radius: 999px; background: rgba(255,255,255,0.62); color: var(--muted); font-size: 12px; font-weight: 850; letter-spacing: 0; padding: 7px 9px; text-transform: none; }
      .next-card { display: grid; gap: 7px; border: 1px solid rgba(255,59,59,0.18); border-radius: 20px; padding: 14px; background: rgba(255,59,59,0.08); color: var(--ink); }
      .next-card[hidden] { display: none; }
      .next-card strong { font-size: 16px; letter-spacing: -0.02em; }
      .next-card span { color: var(--muted); line-height: 1.4; font-weight: 760; }
      .selected-path { display: grid; gap: 5px; border: 1px solid rgba(255,59,59,0.16); border-radius: 16px; background: rgba(255,59,59,0.055); padding: 11px 12px; }
      .selected-path small { color: var(--blue); font-size: 11px; font-weight: 950; letter-spacing: 0.14em; text-transform: uppercase; }
      .selected-path strong { font-size: 19px; letter-spacing: -0.035em; }
      .selected-path span { color: var(--muted); font-weight: 780; line-height: 1.35; }
      .source-handoff { display: grid; gap: 5px; border: 1px solid rgba(13,148,136,0.2); border-radius: 16px; background: rgba(13,148,136,0.075); padding: 11px 12px; }
      .source-handoff[hidden] { display: none; }
      .source-handoff small { color: #0f766e; font-size: 11px; font-weight: 950; letter-spacing: 0.14em; text-transform: uppercase; }
      .source-handoff strong { font-size: 16px; letter-spacing: -0.025em; }
      .source-handoff span, .source-handoff code { color: var(--muted); font-size: 12px; font-weight: 800; line-height: 1.35; }
      .source-handoff code { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
        .source-handoff { padding: 10px; }
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
            <input type="hidden" name="entitlement_free_core" value="" />
            <input type="hidden" name="entitlement_paid_pilot" value="" />
            <input type="hidden" name="entitlement_premium" value="" />
            <input type="hidden" name="entitlement_gated_hands" value="" />
            <input type="hidden" name="entitlement_gate" value="" />
            <input type="hidden" name="proof_plan_worker_id" value="" />
            <input type="hidden" name="proof_plan_summary" value="" />
            <input type="hidden" name="proof_plan_milestones" value="" />
            <input type="hidden" name="proof_plan_metrics" value="" />
            <input type="hidden" name="proof_plan_gate" value="" />
            <input type="hidden" name="value_plan_worker_id" value="" />
            <input type="hidden" name="value_plan_summary" value="" />
            <input type="hidden" name="value_plan_metrics" value="" />
            <input type="hidden" name="value_plan_evidence" value="" />
            <input type="hidden" name="value_plan_gate" value="" />
            <input type="hidden" name="pilot_plan_worker_id" value="" />
            <input type="hidden" name="pilot_plan_summary" value="" />
            <input type="hidden" name="pilot_plan_scope" value="" />
            <input type="hidden" name="pilot_plan_next_action" value="" />
            <input type="hidden" name="pilot_plan_gate" value="" />
            <input type="hidden" name="source_to_screen_workcell_id" value="" />
            <input type="hidden" name="source_to_screen_workcell_name" value="" />
            <input type="hidden" name="source_to_screen_source_hash" value="" />
            <input type="hidden" name="source_to_screen_proof_target" value="" />
            <input type="hidden" name="source_to_screen_order_packet" value="" />
            <input type="hidden" name="source_to_screen_free_load_policy" value="" />
            <div class="form-row">
              <label>Name<input autocomplete="name" name="name" required /></label>
              <label>Work email<input autocomplete="email" name="email" required type="email" /></label>
              <label class="optional-mobile">Phone / WhatsApp<input autocomplete="tel" name="phone" type="tel" /></label>
              <label>Company<input autocomplete="organization" name="company" required /></label>
              <div class="wide selected-path" data-selected-path hidden><small>Selected</small><strong>General enquiry</strong><span class="selected-price" data-selected-price hidden></span><span class="selected-next" data-selected-next hidden></span></div>
              <div class="wide source-handoff" data-source-to-screen-handoff hidden><small>Source-to-Screen packet carried from free draft</small><strong data-source-to-screen-handoff-title></strong><span data-source-to-screen-handoff-proof></span><code data-source-to-screen-handoff-hash></code></div>
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
${publicRuntimeScripts}
    <script>
      for (const form of document.querySelectorAll('[data-sm-lead-form]')) {
        const search = new URLSearchParams(window.location.search);
        const set = (name, value) => {
          const input = form.querySelector('[name="' + name + '"]');
          if (input) input.value = value || '';
        };
        const get = (name) => form.querySelector('[name="' + name + '"]')?.value || '';
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
          'agent': 'ai-workcell-pilot',
          'agent-email': 'ai-workcell-pilot',
          'agent-drive': 'ai-workcell-pilot',
          'agent-digest': 'ai-workcell-pilot',
          'ai-agent': 'ai-workcell-pilot',
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
          'ai-workcell-pilot': {
            name: 'AI Workcell Pilot',
            heading: 'Tell us what to build.',
            price: 'From 11,000,000 MMK',
            lead: 'AI Workcell Pilot - from 11,000,000 MMK. Send one source pack and the first proof target.',
            placeholder: 'Describe the messy recurring work, the sources it reads, and what must stay approval-only.',
            next: 'Next: source pack review, First proof, then owner-approved pilot scope.'
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
            set('entitlement_free_core', selectedTemplate.entitlementFreeCore);
            set('entitlement_paid_pilot', selectedTemplate.entitlementPaidPilot);
            set('entitlement_premium', selectedTemplate.entitlementPremium);
            set('entitlement_gated_hands', selectedTemplate.entitlementGatedHands);
            set('entitlement_gate', 'owner-approved computer-use or mobile actions only after consent, vaulting, audit logs, rollback, and explicit approval');
            set('utm_campaign', search.get('utm_campaign') || 'agent_template_intake');
            set('data', [
              'Template intake: ' + selectedTemplate.id,
              'Template status: ' + selectedTemplate.status,
              'First proof: ' + selectedTemplate.firstProof,
              'Starter kit: ' + selectedTemplate.starterKitUrl,
              'Source category: ' + selectedTemplate.sourceCategory,
              'Source area: ' + selectedTemplate.sourceArea,
              'Price hint: ' + selectedTemplate.price,
              'Entitlement free core: ' + selectedTemplate.entitlementFreeCore,
              'Entitlement paid pilot: ' + selectedTemplate.entitlementPaidPilot,
              'Entitlement premium: ' + selectedTemplate.entitlementPremium,
              'Entitlement gated hands: ' + selectedTemplate.entitlementGatedHands
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
        const sourceToScreenTemplates = {
          daily_close: {
            name: 'Daily cash close',
            proof_target: 'Owner can see today sales, cash variance, missing proof, and tomorrow action queue.'
          },
          receivables_chase: {
            name: 'Receivables chase',
            proof_target: 'Owner can see who owes money, what was promised, and the next safe follow-up draft.'
          },
          inventory_exception: {
            name: 'Inventory exception desk',
            proof_target: 'Owner can see shortage, overstock, supplier risk, and reorder actions from messy stock data.'
          },
          lead_reply: {
            name: 'Lead reply desk',
            proof_target: 'Owner can see qualified leads, reply drafts, and follow-up priorities without losing source trace.'
          },
          document_ledger: {
            name: 'Document ledger',
            proof_target: 'Owner can see receipts, screenshots, files, and notes converted into searchable actions.'
          }
        };
        function loadSourceToScreenOrder(){
          let stored = {};
          try {
            stored = JSON.parse(localStorage.getItem('sm_source_to_screen_order') || '{}') || {};
          } catch (error) {
            stored = {};
          }
          const workcellId = search.get('workcell') || stored.workcell_id || '';
          const sourceHash = search.get('source_hash') || stored.source_hash || '';
          if (!workcellId && !sourceHash && !stored.source_to_screen_order_packet && !stored.order_packet) return;
          const template = sourceToScreenTemplates[workcellId] || {};
          const workcellName = stored.workcell_template || stored.workcell_name || template.name || workcellId || 'Source-to-Screen draft';
          const proofTarget = stored.proof_target || template.proof_target || 'Confirm the first proof target from the free draft.';
          const packet = stored.source_to_screen_order_packet || stored.order_packet || [
            '# AI Workcell Pilot order packet',
            '',
            'workcell_template: ' + workcellName,
            'workcell_id: ' + (workcellId || 'unknown'),
            'source_hash: ' + (sourceHash || 'missing'),
            'free_load_policy: browser_only_until_contact',
            'real_mrr_delta: 0',
            '',
            'proof_target: ' + proofTarget
          ].join('\\n');
          set('source_to_screen_workcell_id', workcellId || stored.workcell_id || '');
          set('source_to_screen_workcell_name', workcellName);
          set('source_to_screen_source_hash', sourceHash || stored.source_hash || '');
          set('source_to_screen_proof_target', proofTarget);
          set('source_to_screen_order_packet', packet);
          set('source_to_screen_free_load_policy', stored.free_load_policy || 'browser_only_until_contact');
          if (!get('requested_package') || get('requested_package') === 'General enquiry') {
            set('workflow', 'AI Workcell Pilot');
            set('requested_package', 'AI Workcell Pilot');
            set('first_output', 'AI Workcell Pilot');
            set('product_area', 'AI agent workcell');
            set('public_package', 'AI Workcell Pilot');
            set('first_step', 'Review Source-to-Screen packet and request approved source pack.');
          }
          const previousData = get('data');
          const handoffData = [
            'Source-to-Screen handoff: ' + workcellName,
            'Source hash: ' + (sourceHash || stored.source_hash || 'missing'),
            'Proof target: ' + proofTarget,
            'Free load policy: browser_only_until_contact'
          ].join(' | ');
          if (!previousData.includes('Source-to-Screen handoff:')) set('data', [previousData, handoffData].filter(Boolean).join(' | '));
          const handoff = document.querySelector('[data-source-to-screen-handoff]');
          if (handoff) {
            handoff.hidden = false;
            const title = handoff.querySelector('[data-source-to-screen-handoff-title]');
            const proof = handoff.querySelector('[data-source-to-screen-handoff-proof]');
            const hash = handoff.querySelector('[data-source-to-screen-handoff-hash]');
            if (title) title.textContent = workcellName;
            if (proof) proof.textContent = proofTarget;
            if (hash) hash.textContent = 'source_hash=' + (sourceHash || stored.source_hash || 'missing');
          }
        }
        loadSourceToScreenOrder();
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

const publicSourceToScreenHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Free Source-to-Screen | SUPERMEGA.dev</title>
    <meta name="description" content="Paste one messy source and get a browser-only first useful screen draft before any account, connector, model run, or payment." />
    <link rel="canonical" href="https://supermega.dev/free/" />
    <meta name="theme-color" content="#0A0E1C" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>${unicornShellStyle}
      .free-main { display:grid; grid-template-columns:minmax(0,.82fr) minmax(360px,1.18fr); gap:clamp(24px,5vw,64px); align-items:start; padding:clamp(26px,5vw,58px) 0 46px; }
      .free-panel, .free-output, .free-rules { border:1px solid var(--line); border-radius:8px; background:rgba(255,255,255,.58); box-shadow:var(--shadow); padding:clamp(16px,2.6vw,24px); }
      .free-form { display:grid; gap:12px; }
      .free-form label { display:grid; gap:7px; color:var(--muted); font-size:12px; font-weight:950; letter-spacing:.12em; text-transform:uppercase; }
      .free-form input, .free-form textarea, .free-form select { width:100%; border:1px solid var(--line); border-radius:12px; background:rgba(255,250,241,.9); color:var(--ink); padding:11px 12px; font:inherit; }
      .free-form textarea { min-height:132px; resize:vertical; }
      .free-actions { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
      .free-output { display:grid; gap:12px; margin-top:14px; }
      .free-output pre { white-space:pre-wrap; overflow:auto; margin:0; border:1px solid var(--line); border-radius:8px; background:#111827; color:#f8fafc; padding:14px; font-size:13px; line-height:1.5; }
      .free-rules { display:grid; gap:9px; margin-top:18px; }
      .free-rules div { display:flex; gap:9px; align-items:flex-start; color:var(--muted); font-weight:820; line-height:1.4; }
      .free-rules b { color:var(--clay); min-width:118px; }
      .workcell-picker { border:1px solid var(--line); border-radius:8px; background:rgba(255,255,255,.5); padding:14px; margin-top:18px; }
      .workcell-picker > strong { display:block; margin-bottom:10px; }
      .workcell-template-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
      .workcell-template-grid button { text-align:left; border:1px solid var(--line); border-radius:8px; background:rgba(255,250,241,.86); color:var(--ink); padding:11px; cursor:pointer; min-height:92px; }
      .workcell-template-grid button[data-selected="true"] { border-color:rgba(255,59,59,.58); box-shadow:0 0 0 4px rgba(255,59,59,.10); background:#fffaf1; }
      .workcell-template-grid strong { display:block; margin-bottom:5px; }
      .workcell-template-grid span { color:var(--muted); font-size:13px; font-weight:760; line-height:1.35; }
      .workcell-path { display:grid; gap:10px; margin-top:18px; }
      .workcell-path article { border:1px solid var(--line); border-radius:8px; padding:13px; background:rgba(255,255,255,.45); }
      .workcell-path strong { display:block; margin-bottom:4px; }
      .workcell-path span { color:var(--muted); font-size:14px; line-height:1.4; }
      @media (max-width: 900px) { .free-main { grid-template-columns:1fr; } }
      @media (max-width: 560px) { .workcell-template-grid { grid-template-columns:1fr; } }
    </style>
  </head>
  <body>
    <div class="wrap">
${unicornHeader}
      <main class="free-main">
        <section>
          <div class="eyebrow">Free Source-to-Screen</div>
          <h1>Paste one messy source.</h1>
          <p>Get one browser-only first screen draft: extracted facts, missing fields, owner queue, and the next approval-gated workcell step. This is free acquisition and source-normalization, not a full SaaS account.</p>
          <div class="free-rules" aria-label="Free load controls">
            <div><b>Browser-only first pass</b><span>No network submit is required to generate the draft on this page.</span></div>
            <div><b>No model call until</b><span>You submit a clear source sample and contact details for a paid first proof.</span></div>
            <div><b>Cache by source hash</b><span>Repeated samples should reuse a prior draft before any queued AI job runs.</span></div>
            <div><b>Second run or export requires contact</b><span>The free mode shows value; private rooms, exports, connectors, and scheduled runs are paid.</span></div>
            <div><b>No free connectors</b><span>No Gmail, Drive, browser automation, payment, team seat, or writeback is enabled here.</span></div>
          </div>
          <div class="workcell-picker" aria-label="Workcell templates">
            <strong>Workcell templates</strong>
            <div class="workcell-template-grid">
              <button type="button" data-workcell-template="daily_close" data-selected="true"><strong>Daily cash close</strong><span>Turn POS/chat/spreadsheet notes into owner close, gaps, and tomorrow queue.</span></button>
              <button type="button" data-workcell-template="receivables_chase"><strong>Receivables chase</strong><span>Turn invoices and chat promises into who owes, next message, and proof trail.</span></button>
              <button type="button" data-workcell-template="inventory_exception"><strong>Inventory exception desk</strong><span>Turn stock rows and supplier notes into shortage, overstock, and reorder queue.</span></button>
              <button type="button" data-workcell-template="lead_reply"><strong>Lead reply desk</strong><span>Turn DMs, forms, and calls into reply drafts and follow-up priorities.</span></button>
              <button type="button" data-workcell-template="document_ledger"><strong>Document ledger</strong><span>Turn receipts, screenshots, and files into a clean searchable action ledger.</span></button>
            </div>
          </div>
          <div class="workcell-path" aria-label="Paid upgrade path">
            <article><strong>1. Free draft</strong><span>One source becomes one useful screen draft in the browser.</span></article>
            <article><strong>2. First proof</strong><span>Submit the approved source pack and we prepare a traceable first proof.</span></article>
            <article><strong>3. AI Workcell Pilot</strong><span>Start AI Workcell Pilot after scope and price approval. MRR stays 0 until payment proof.</span></article>
          </div>
        </section>
        <section class="free-panel" aria-label="Source-to-screen builder">
          <form class="free-form" data-source-to-screen-form>
            <label>Output type<select data-output-type>
              <option value="daily_close">Daily close board</option>
              <option value="document_ledger">Document ledger</option>
              <option value="lead_followup">Lead follow-up queue</option>
              <option value="inventory_issue">Inventory issue queue</option>
            </select></label>
            <label>Source sample<textarea data-source-sample placeholder="Paste a redacted POS export, chat thread, invoice list, staff note, screenshot text, or messy spreadsheet rows."></textarea></label>
            <div class="free-actions">
              <button class="btn primary" type="submit">Build free screen draft</button>
              <a class="btn secondary" data-start-paid-pilot-link href="/contact/?package=ai-workcell-pilot&utm_source=free_source_to_screen&utm_content=free_workcell_order&workcell=daily_close">Start AI Workcell Pilot</a>
            </div>
          </form>
          <div class="free-output" aria-live="polite">
            <strong>First screen draft</strong>
            <pre data-source-to-screen-output>Paste one approved sample to generate a local draft. Nothing is sent, connected, written, billed, or claimed as revenue from this free page.</pre>
          </div>
          <div class="free-output" aria-live="polite">
            <strong>Proof order packet</strong>
            <pre data-proof-order-output>Choose a template and build a free draft to produce the paid-pilot order packet. This packet is local until you contact us.</pre>
          </div>
        </section>
      </main>
      <footer><span>SUPERMEGA.dev - free source-to-screen entry.</span><span class="footer-links"><a href="/ai-agents/">AI Agents</a><a href="/offers/">Pricing</a><a href="/contact/">Contact</a></span></footer>
    </div>
${publicLanguageToggleScript}
    <script>
      (function(){
        const form = document.querySelector('[data-source-to-screen-form]');
        const output = document.querySelector('[data-source-to-screen-output]');
        const proofOrderOutput = document.querySelector('[data-proof-order-output]');
        const paidPilotLink = document.querySelector('[data-start-paid-pilot-link]');
        const templateButtons = Array.prototype.slice.call(document.querySelectorAll('[data-workcell-template]'));
        const sample = form && form.querySelector('[data-source-sample]');
        const type = form && form.querySelector('[data-output-type]');
        const orderStorageKey = 'sm_source_to_screen_order';
        const workcellTemplates = {
          daily_close: {
            name: 'Daily cash close',
            proof_target: 'Owner can see today sales, cash variance, missing proof, and tomorrow action queue.',
            required_sources: ['POS close or sales export', 'cash/mobile-money note', 'manager or cashier note'],
            first_run_acceptance: ['cash variance explained', 'missing proof listed', 'tomorrow queue visible']
          },
          receivables_chase: {
            name: 'Receivables chase',
            proof_target: 'Owner can see who owes money, what was promised, and the next safe follow-up draft.',
            required_sources: ['invoice or customer balance list', 'chat promise or payment note', 'owner follow-up rule'],
            first_run_acceptance: ['debtors ranked', 'message drafts separated from sends', 'owner approval required before contact']
          },
          inventory_exception: {
            name: 'Inventory exception desk',
            proof_target: 'Owner can see shortage, overstock, supplier risk, and reorder actions from messy stock data.',
            required_sources: ['stock export or shelf count', 'supplier note', 'sales velocity or recent orders'],
            first_run_acceptance: ['exceptions grouped', 'reorder queue visible', 'writeback blocked until accepted']
          },
          lead_reply: {
            name: 'Lead reply desk',
            proof_target: 'Owner can see qualified leads, reply drafts, and follow-up priorities without losing source trace.',
            required_sources: ['DM/form/call rows', 'offer or price rule', 'owner no-send rule'],
            first_run_acceptance: ['lead intent classified', 'reply draft ready', 'send remains approval-only']
          },
          document_ledger: {
            name: 'Document ledger',
            proof_target: 'Owner can see receipts, screenshots, files, and notes converted into searchable actions.',
            required_sources: ['receipt or document samples', 'folder or chat context', 'required ledger fields'],
            first_run_acceptance: ['records normalized', 'missing fields listed', 'source trace preserved']
          }
        };
        let selectedWorkcell = 'daily_close';
        function hashText(text){
          let hash = 0;
          for(let i=0;i<text.length;i++){ hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0; }
          return Math.abs(hash).toString(16).padStart(8,'0');
        }
        function lines(text){
          return String(text || '').split(/\\r?\\n/).map(function(line){ return line.trim(); }).filter(Boolean);
        }
        function buildSourceToScreenDraft(kind, text){
          const sourceLines = lines(text).slice(0, 12);
          const sourceHash = hashText(text || '');
          const missing = [];
          if(!/date|today|yesterday|202\\d|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(text)) missing.push('date or period');
          if(!/owner|manager|staff|cashier|sales|admin|supplier|customer/i.test(text)) missing.push('owner or responsible person');
          if(!/mmk|ks|kyat|amount|total|qty|quantity|price|paid|cash/i.test(text)) missing.push('amount or quantity');
          const title = {
            daily_close: 'Daily close board',
            document_ledger: 'Document ledger',
            lead_followup: 'Lead follow-up queue',
            inventory_issue: 'Inventory issue queue'
          }[kind] || 'Source-to-screen draft';
          const facts = sourceLines.length ? sourceLines.slice(0, 5) : ['No source rows pasted yet.'];
          return [
            '# ' + title,
            '',
            'Status: browser_only_first_pass',
            'Source hash: ' + sourceHash,
            'Network submit: no',
            'Connector access: blocked',
            'Real MRR delta: 0',
            '',
            '## Extracted facts',
            facts.map(function(item, index){ return String(index + 1) + '. ' + item; }).join('\\n'),
            '',
            '## Missing fields',
            (missing.length ? missing : ['enough for a first proof review']).map(function(item){ return '- ' + item; }).join('\\n'),
            '',
            '## Owner queue',
            '- Confirm the source is approved for a first proof.',
            '- Decide what output should be judged useful.',
            '- Submit contact details only if you want a private AI Workcell Pilot.',
            '',
            '## Upgrade boundary',
            'Free mode stops here: no export, connector, scheduled run, browser action, payment action, or team workspace.'
          ].join('\\n');
        }
        function buildPaidPilotOrderPacket(kind, text){
          const template = workcellTemplates[kind] || workcellTemplates.daily_close;
          const sourceHash = hashText(text || '');
          return [
            '# AI Workcell Pilot order packet',
            '',
            'workcell_template: ' + template.name,
            'workcell_id: ' + kind,
            'source_hash: ' + sourceHash,
            'free_load_policy: browser_only_until_contact',
            'network_submit: no',
            'model_call: no',
            'connector_access: blocked',
            'real_mrr_delta: 0',
            '',
            'proof_target: ' + template.proof_target,
            '',
            'required_sources:',
            template.required_sources.map(function(item){ return '- ' + item; }).join('\\n'),
            '',
            'first_run_acceptance:',
            template.first_run_acceptance.map(function(item){ return '- ' + item; }).join('\\n'),
            '',
            'paid_boundary:',
            '- First proof, private workspace, exports, connectors, scheduled runs, browser actions, and team usage require approved paid pilot scope.',
            '- Payment proof and owner acceptance are required before recurring revenue is recorded.'
          ].join('\\n');
        }
        function saveWorkcellOrderPacket(kind, sourceHash, packet){
          const template = workcellTemplates[kind] || workcellTemplates.daily_close;
          try {
            localStorage.setItem(orderStorageKey, JSON.stringify({
              source_to_screen_order_packet: packet,
              order_packet: packet,
              workcell_id: kind,
              workcell_template: template.name,
              workcell_name: template.name,
              source_hash: sourceHash,
              proof_target: template.proof_target,
              required_sources: template.required_sources,
              first_run_acceptance: template.first_run_acceptance,
              free_load_policy: 'browser_only_until_contact',
              real_mrr_delta: 0,
              saved_at: new Date().toISOString()
            }));
          } catch (error) {}
        }
        function syncWorkcellSelection(kind){
          selectedWorkcell = workcellTemplates[kind] ? kind : 'daily_close';
          templateButtons.forEach(function(button){
            button.dataset.selected = button.getAttribute('data-workcell-template') === selectedWorkcell ? 'true' : 'false';
          });
          if(type){
            type.value = selectedWorkcell === 'receivables_chase' || selectedWorkcell === 'lead_reply' ? 'lead_followup' : selectedWorkcell === 'document_ledger' ? 'document_ledger' : selectedWorkcell === 'inventory_exception' ? 'inventory_issue' : 'daily_close';
          }
          const sourceHash = hashText(sample && sample.value || '');
          if(paidPilotLink){
            paidPilotLink.href = '/contact/?package=ai-workcell-pilot&utm_source=free_source_to_screen&utm_content=free_workcell_order&workcell=' + encodeURIComponent(selectedWorkcell) + '&source_hash=' + encodeURIComponent(sourceHash);
          }
          if(proofOrderOutput){
            const packet = buildPaidPilotOrderPacket(selectedWorkcell, sample && sample.value || '');
            proofOrderOutput.textContent = packet;
            saveWorkcellOrderPacket(selectedWorkcell, sourceHash, packet);
          }
        }
        templateButtons.forEach(function(button){
          button.addEventListener('click', function(){
            syncWorkcellSelection(button.getAttribute('data-workcell-template'));
          });
        });
        if(type){
          type.addEventListener('change', function(){
            const next = type.value === 'lead_followup' ? 'lead_reply' : type.value === 'inventory_issue' ? 'inventory_exception' : type.value;
            syncWorkcellSelection(next);
          });
        }
        if(sample){
          sample.addEventListener('input', function(){ syncWorkcellSelection(selectedWorkcell); });
        }
        if(form){
          form.addEventListener('submit', function(event){
            event.preventDefault();
            output.textContent = buildSourceToScreenDraft(type.value, sample.value || '');
            proofOrderOutput.textContent = buildPaidPilotOrderPacket(selectedWorkcell, sample.value || '');
          });
        }
        syncWorkcellSelection(selectedWorkcell);
      })();
    </script>
  </body>
</html>`

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
      src: '^/api/source-pack-submissions$',
      dest: '/api/source-pack-submissions.js',
    },
    {
      src: '^/api/source-pack-submissions/status$',
      dest: '/api/source-pack-submissions.js',
    },
    {
      src: '^/api/proof-review-submissions$',
      dest: '/api/proof-review-submissions.js',
    },
    {
      src: '^/api/proof-review-submissions/status$',
      dest: '/api/proof-review-submissions.js',
    },
    {
      src: '^/api/first-run-acceptance-submissions$',
      dest: '/api/first-run-acceptance-submissions.js',
    },
    {
      src: '^/api/first-run-acceptance-submissions/status$',
      dest: '/api/first-run-acceptance-submissions.js',
    },
    {
      src: '^/api/pilot-payment-submissions$',
      dest: '/api/pilot-payment-submissions.js',
    },
    {
      src: '^/api/pilot-payment-submissions/status$',
      dest: '/api/pilot-payment-submissions.js',
    },
    {
      src: '^/api/campaign-clicks$',
      dest: '/api/campaign-clicks.js',
    },
    {
      src: '^/api/behavior-events$',
      dest: '/api/behavior-events.js',
    },
    {
      src: '^/api/behavior-events/status$',
      dest: '/api/behavior-events.js',
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
      src: '^/app/proof-review/?$',
      dest: '/app/proof-review/index.html',
    },
    {
      src: '^/app/payment-proof/?$',
      dest: '/app/payment-proof/index.html',
    },
    {
      src: '^/app/source-pack/?$',
      dest: '/app/source-pack/index.html',
    },
    {
      src: '^/app/start/?$',
      dest: '/app/start/index.html',
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
      dest: '/free/index.html',
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
  const copiedDependencies = new Set()
  const copyNodeDependency = async (dependency) => {
    if (copiedDependencies.has(dependency)) return
    copiedDependencies.add(dependency)
    const sourceDependency = resolve(root, 'node_modules', dependency)
    try {
      await stat(sourceDependency)
    } catch (error) {
      if (error?.code === 'ENOENT') return
      throw error
    }
    await cp(sourceDependency, resolve(functionDir, 'node_modules', dependency), {
      recursive: true,
      force: true,
    })
    try {
      const packageJson = JSON.parse(await readFile(resolve(sourceDependency, 'package.json'), 'utf8'))
      const childDependencies = Object.keys({
        ...(packageJson.dependencies || {}),
        ...(packageJson.optionalDependencies || {}),
      })
      for (const childDependency of childDependencies) {
        await copyNodeDependency(childDependency)
      }
    } catch (error) {
      if (error?.code === 'ENOENT') return
      throw error
    }
  }
  // Detect which heavy dep groups THIS function can reach. blob is lazy-required only via
  // api/lib/supermega-blob-queue.js (or a direct @vercel/blob import, e.g. pipeline-control.js);
  // pg only via api/lib/supermega-datastore.js. No other lib module imports either, so scanning the
  // function's own source is sufficient. A function referencing neither gets an empty node_modules.
  const functionSource = await readFile(resolve(root, 'api', name), 'utf8').catch(() => '')
  const needsBlob = /supermega-blob-queue|@vercel\/blob/.test(functionSource)
  const needsPg = /supermega-datastore|require\(['"]pg['"]\)/.test(functionSource)
  const functionDependencies = [
    ...(needsBlob ? blobFunctionDependencies : []),
    ...(needsPg ? pgFunctionDependencies : []),
  ]
  for (const dependency of functionDependencies) {
    await copyNodeDependency(dependency)
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
  const allowedRootDirs = new Set(['assets', 'site', 'social', 'products', 'agent-templates', 'app', 'start', 'contact', 'offers', 'work', 'operator', 'machine', 'card', 'c', 'demo', 'ai-agents', 'privacy', 'megaos-preview'])
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
// Brand favicon is owned here (revert-proof against OneDrive restoring the old file): Capsule Forge mark.
await writeFile(resolve(staticDir, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="supermega"><rect x="4" y="4" width="56" height="56" rx="15" fill="#111731"/><rect x="4.75" y="4.75" width="54.5" height="54.5" rx="14.25" fill="none" stroke="#ffffff" stroke-opacity="0.10"/><path d="M21 23 L31.5 32 L21 41" fill="none" stroke="#FF3B3B" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M35 41 L47 41" fill="none" stroke="#FF3B3B" stroke-width="5" stroke-linecap="round"/></svg>\n`, 'utf8')
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
    <meta name="theme-color" content="#0A0E1C" />
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
${publicRuntimeScripts}
  </body>
</html>`
}

function renderKitList(items) {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
}

function renderRolePlaybookCards(kit) {
  return Object.entries(kit.role_playbook || {})
    .map(
      ([id, role]) => `<article class="kit-card" data-role-playbook="${escapeHtml(id)}">
        <h3>${escapeHtml(role.label)}</h3>
        <ul>
          <li><strong>First action:</strong> ${escapeHtml(role.first_action)}</li>
          <li><strong>Approval focus:</strong> ${escapeHtml(role.approval_focus)}</li>
          <li><strong>Success signal:</strong> ${escapeHtml(role.success_signal)}</li>
        </ul>
      </article>`,
    )
    .join('\n')
}

function formHidden(name, value) {
  return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value || '')}" />`
}

function buildAiWorkerUserGuideHtml() {
  const workerRows = publicAgentTemplateStarterKits
    .map(
      (kit) => `<article class="guide-worker" data-guide-template="${escapeHtml(kit.id)}">
        <div><span>${escapeHtml(kit.status)}</span><h3>${escapeHtml(kit.name)}</h3></div>
        <p>${escapeHtml(kit.offer.promise)}</p>
        <ul>
          <li><strong>First proof:</strong> ${escapeHtml(kit.offer.first_proof)}</li>
          <li><strong>Sample sources:</strong> ${escapeHtml(kit.intake_schema.sample_sources.slice(0, 3).join(', '))}</li>
          <li><strong>Approval:</strong> ${escapeHtml(kit.deployment_mode.human_gate)}</li>
        </ul>
        <div class="guide-actions"><a class="btn secondary" data-sm-template-link="${escapeHtml(kit.id)}" href="${escapeHtml(kit.setup_url)}">Start setup</a><a class="guide-link" href="/agent-templates/${escapeHtml(kit.id)}/">Setup kit</a></div>
      </article>`,
    )
    .join('\n')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>AI Worker User Guide | SUPERMEGA.dev</title>
    <meta name="description" content="How to start, use, approve, and improve SUPERMEGA.dev AI workers across desktop, tablet, and mobile." />
    <link rel="canonical" href="https://supermega.dev/ai-agents/guide/" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    ${unicornSocialMeta({ title: 'AI Worker User Guide | SUPERMEGA.dev', description: 'Start with one approved source pack, get a first proof, then scale an approval-gated AI worker.', url: 'https://supermega.dev/ai-agents/guide/' })}
    <style>${unicornShellStyle}
      .guide-hero { min-height: auto; grid-template-columns: minmax(0, 1fr) minmax(300px, .82fr); align-items: start; }
      .guide-panel { border: 1px solid var(--line); border-radius: 18px; padding: 20px; background: rgba(255,255,255,.58); box-shadow: var(--shadow); }
      .guide-panel strong { display:block; font-size: 13px; letter-spacing: .1em; text-transform: uppercase; color: var(--blue); }
      .guide-panel span { display:block; margin-top: 8px; color: var(--muted); line-height: 1.45; }
      .guide-grid { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 20px; }
      .guide-step, .guide-rule, .guide-worker { border: 1px solid var(--line); border-radius: 18px; padding: 18px; background: rgba(255,255,255,.52); }
      .guide-step n { display:grid; place-items:center; width: 34px; height: 34px; border-radius:999px; background: var(--blue); color: #fff; font-weight:900; }
      .guide-step strong, .guide-rule strong { display:block; margin-top: 12px; font-size: 18px; letter-spacing: -.02em; }
      .guide-step span, .guide-rule span, .guide-worker p, .guide-worker li { color: var(--muted); line-height: 1.45; }
      .guide-rule-grid { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }
      .guide-worker-grid { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 20px; }
      .guide-worker { display:grid; gap: 10px; }
      .guide-worker span { color: var(--blue); font-size: 11px; font-weight: 950; letter-spacing: .12em; text-transform: uppercase; }
      .guide-worker h3 { margin: 4px 0 0; font-size: 20px; line-height: 1.1; letter-spacing: -.03em; }
      .guide-worker ul { margin: 0; padding-left: 18px; }
      .guide-actions { display:flex; gap: 10px; flex-wrap: wrap; align-items: center; }
      .guide-link { color: var(--blue); font-size: 12px; font-weight: 900; text-decoration: none; }
      .guide-safety { border: 1px solid rgba(255,59,59,.35); border-radius: 18px; padding: 20px; background: rgba(255,59,59,.08); margin-top: 18px; }
      .guide-safety p { color: var(--ink); max-width: 68ch; }
      [data-ai-worker-user-guide] .section,
      [data-ai-worker-user-guide] .section.reveal,
      [data-ai-worker-user-guide] .section.sm-in { opacity: 1 !important; transform: none !important; }
      @media (max-width: 980px) { .guide-grid, .guide-rule-grid, .guide-worker-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 760px) { .guide-hero, .guide-grid, .guide-rule-grid, .guide-worker-grid { grid-template-columns: 1fr; } }
      :root[data-theme="dark"] .guide-panel, :root[data-theme="dark"] .guide-step, :root[data-theme="dark"] .guide-rule, :root[data-theme="dark"] .guide-worker { background: rgba(243,239,230,.05); }
    </style>
  </head>
  <body>
    <div class="wrap" data-ai-worker-user-guide>
${unicornHeader}
      <main>
        <section class="poster guide-hero">
          <div class="copy">
            <div class="eyebrow">AI worker user guide</div>
            <h1>Use the worker like a real teammate.</h1>
            <p>Start with one approved source pack, get a first proof, then decide whether the worker should become a maintained workflow. The same operating rules work on desktop, tablet, and mobile.</p>
            <div class="cta"><a class="btn primary" href="/agent-templates/">Choose a worker</a><a class="btn secondary" href="/ai-agents/">Back to AI agents</a></div>
          </div>
          <aside class="guide-panel">
            <strong>Operating promise</strong>
            <span>Every AI worker starts read-only, shows source trace, and keeps no external sends, writes, payments, or browser/mobile actions without owner approval.</span>
            <strong style="margin-top:16px">Behavior adaptation loop</strong>
            <span>Privacy-light first-party events help route buyers to the right worker and improve the catalog. No keystrokes, source files, credentials, or private business text are tracked.</span>
          </aside>
        </section>

        <section class="section sm-in">
          <div class="eyebrow">Quick start</div>
          <h2>Use any worker in four steps.</h2>
          <div class="guide-grid">
            <div class="guide-step"><n>1</n><strong>Pick the job</strong><span>Use the matcher or setup kits to choose the worker that matches your source and first proof.</span></div>
            <div class="guide-step"><n>2</n><strong>Send one source pack</strong><span>Share a small approved sample: screenshot, export, folder link, email thread, sheet, PDF, or chat sample.</span></div>
            <div class="guide-step"><n>3</n><strong>Review first proof</strong><span>Check the output, source trace, missing fields, and approval boundary before connecting more tools.</span></div>
            <div class="guide-step"><n>4</n><strong>Accept or refine</strong><span>Approve, request changes, or stop. Production runs and recurring support begin only after owner acceptance.</span></div>
          </div>
        </section>

        <section class="section sm-in" data-role-mode-guide>
          <div class="eyebrow">Role-aware onboarding</div>
          <h2>Choose the mode that matches the user.</h2>
          <p style="color:var(--muted);max-width:64ch">Owner, operator, and technical admin users need different proof and approval steps. The public site saves only the selected role in this browser and passes it into setup forms as a routing hint.</p>
          <div class="guide-rule-grid">
            <div class="guide-rule"><strong>Owner mode</strong><span>Approve the goal, first proof, price, payment route, and first production run before any recurring claim.</span></div>
            <div class="guide-rule"><strong>Operator mode</strong><span>Collect source samples, check missing fields, report edge cases, and confirm whether the proof matches daily work.</span></div>
            <div class="guide-rule"><strong>Technical admin mode</strong><span>Confirm connector scope, permissions, logs, vaulting, and rollback before account access or browser/mobile actions.</span></div>
          </div>
        </section>

        <section class="section sm-in" data-device-mode-guide>
          <div class="eyebrow">Daily use</div>
          <h2>Mobile, tablet, and desktop.</h2>
          <p style="color:var(--muted);max-width:66ch">Device-aware onboarding detects the current screen size and routes first steps toward phone, tablet, or desktop work without storing private source text.</p>
          <div class="guide-rule-grid">
            <div class="guide-rule"><strong>Phone mode</strong><span>Review first proofs, approve quick items, capture photos or screenshots, and check owner status.</span></div>
            <div class="guide-rule"><strong>Tablet mode</strong><span>Use review queues, floor checks, approval lists, checklist work, and manager handoff during live operations.</span></div>
            <div class="guide-rule"><strong>Desktop mode</strong><span>Use source review, setup forms, control console, ledgers, proof packets, and larger dashboards.</span></div>
          </div>
        </section>

        <section class="section sm-in" data-adaptive-plan-guide>
          <div class="eyebrow">Adaptive setup plan</div>
          <h2>The next step changes with the user.</h2>
          <p style="color:var(--muted);max-width:66ch">The public flow combines selected worker, role mode, and device mode into a first-proof plan before the request is sent. It passes only routing hints into forms: worker ID, plan summary, next step, and page path.</p>
          <div class="guide-rule-grid">
            <div class="guide-rule"><strong>Worker signal</strong><span>Selected setup kit or remembered worker decides which first-proof checklist should open.</span></div>
            <div class="guide-rule"><strong>Role signal</strong><span>Owner, work reviewer, or technical admin mode changes approval, source, and connector tasks.</span></div>
            <div class="guide-rule"><strong>Device signal</strong><span>Phone, tablet, and desktop users get different next actions without tracking private business text.</span></div>
          </div>
        </section>

        <section class="section sm-in" data-source-pack-guide>
          <div class="eyebrow">Source pack checklist</div>
          <h2>Send the smallest approved source pack.</h2>
          <p style="color:var(--muted);max-width:66ch">Each worker shows the minimum inputs and sample sources needed for the first proof. The checklist is generated from the worker template and passes only source-pack requirements into the setup request.</p>
          <div class="guide-rule-grid">
            <div class="guide-rule"><strong>Minimum inputs</strong><span>Start with the smallest source set that can prove the promised output.</span></div>
            <div class="guide-rule"><strong>No secrets first</strong><span>Do not send credentials, payment secrets, or live system access for the first proof.</span></div>
            <div class="guide-rule"><strong>Proof before scale</strong><span>Expand to connectors, schedules, and production workflows only after the first output is accepted.</span></div>
          </div>
        </section>

        <section class="section sm-in" data-proof-plan-guide>
          <div class="eyebrow">First proof planner</div>
          <h2>Prove value before production.</h2>
          <p style="color:var(--muted);max-width:66ch">The public flow turns selected worker, role, device, and source-pack readiness into a 7-day proof plan. Setup requests carry only milestone labels, metric names, and the owner approval gate.</p>
          <div class="guide-rule-grid">
            <div class="guide-rule"><strong>Day 1 source boundary</strong><span>Confirm the smallest approved source pack and what the worker is allowed to read.</span></div>
            <div class="guide-rule"><strong>Day 3 first proof</strong><span>Review the first useful output, source trace, missing fields, and acceptance tests.</span></div>
            <div class="guide-rule"><strong>Day 7 acceptance gate</strong><span>Accept, refine, or stop before production setup, connector writes, or external actions.</span></div>
          </div>
        </section>

        <section class="section sm-in" data-value-plan-guide>
          <div class="eyebrow">Value proof plan</div>
          <h2>Prove value before retainer.</h2>
          <p style="color:var(--muted);max-width:66ch">The value proof plan converts the selected worker and first-proof state into buyer evidence labels before any retainer, production scale, or recurring revenue claim. No revenue claim without payment proof.</p>
          <div class="guide-rule-grid">
            <div class="guide-rule"><strong>Time saved</strong><span>Capture where manual review, copy-paste, matching, or follow-up work becomes shorter.</span></div>
            <div class="guide-rule"><strong>Risk removed</strong><span>Show missed items, missing fields, source trace, and owner approval gates before live actions.</span></div>
            <div class="guide-rule"><strong>Cash follow-up</strong><span>Separate useful buyer follow-up from claimed revenue until payment proof is attached.</span></div>
          </div>
        </section>

        <section class="section sm-in" data-pilot-plan-guide>
          <div class="eyebrow">Paid pilot close plan</div>
          <h2>Close paid pilot after proof.</h2>
          <p style="color:var(--muted);max-width:66ch">The pilot close plan keeps the commercial path explicit: free proof first, paid pilot after owner-approved scope, and no workspace, retainer, or MRR before payment proof.</p>
          <div class="guide-rule-grid">
            <div class="guide-rule"><strong>Free proof</strong><span>Use approved source samples to show the first useful output before asking for paid pilot scope.</span></div>
            <div class="guide-rule"><strong>Paid pilot</strong><span>Move only after the owner approves scope, first-run boundaries, and the payment route.</span></div>
            <div class="guide-rule"><strong>Payment proof</strong><span>No private workspace, retainer, recurring claim, or MRR until payment proof is attached.</span></div>
          </div>
        </section>

        <section class="section sm-in" data-entitlement-ladder-guide>
          <div class="eyebrow">Entitlement ladder</div>
          <h2>Make every worker sellable without overpromising.</h2>
          <p style="color:var(--muted);max-width:66ch">Each worker has the same commercial ladder, so buyers can start free, approve a paid pilot, and upgrade only after proof. Computer-use and mobile actions stay behind the strictest gate.</p>
          <div class="guide-rule-grid">
            <div class="guide-rule"><strong>Free core</strong><span>Free core stays deterministic: matcher, setup checklist, sample-source proof, and no private connector writes.</span></div>
            <div class="guide-rule"><strong>Paid pilot</strong><span>Paid pilot starts after owner-approved scope, source boundary, payment proof, and first-run checklist.</span></div>
            <div class="guide-rule"><strong>Premium maintained</strong><span>Premium maintained adds monitoring, connectors, scheduled runs, and support after accepted proof.</span></div>
            <div class="guide-rule"><strong>Gated hands</strong><span>Gated hands require consent, vaulting, audit logs, and owner approval before computer-use or mobile actions.</span></div>
          </div>
        </section>

        <section class="section sm-in">
          <div class="eyebrow">Connectors</div>
          <h2>Connector setup rules.</h2>
          <div class="guide-rule-grid">
            <div class="guide-rule"><strong>Export first</strong><span>Start with files, screenshots, or exports before granting account access. Prove value before credentials.</span></div>
            <div class="guide-rule"><strong>API before browser</strong><span>Use official APIs, webhooks, and scheduled jobs before computer-use or mobile-app action workers.</span></div>
            <div class="guide-rule"><strong>Approval ledger</strong><span>Every send, write, payment, browser action, mobile action, or live record edit needs owner approval and evidence.</span></div>
          </div>
          <div class="guide-safety"><p>Computer-use and mobile workers are available only as gated workcells after reliability, consent, vaulting, legal review, and audit logs are proven.</p></div>
        </section>

        <section class="section sm-in">
          <div class="eyebrow">Template guide</div>
          <h2>What to send for each worker.</h2>
          <div class="guide-worker-grid">
${workerRows}
          </div>
        </section>

        <section class="section sm-in">
          <div class="final">
            <div>
              <div class="eyebrow">Start safely</div>
              <h2>Choose one worker and one source pack.</h2>
              <p>The first useful output is the proof. The platform scales only after the first proof is accepted.</p>
            </div>
            <a class="btn primary" href="/agent-templates/">Choose a setup kit</a>
          </div>
        </section>
      </main>
      <footer><span>SUPERMEGA.dev AI worker guide.</span><span class="footer-links"><a href="/ai-agents/">AI agents</a><a href="/agent-templates/">Setup kits</a><a href="/contact/">Contact</a></span></footer>
    </div>
${publicRuntimeScripts}
  </body>
</html>`
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
    <meta name="theme-color" content="#0A0E1C" />
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
              <a class="btn secondary" href="/ai-agents/guide/">User guide</a>
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
        <section class="section" data-entitlement-ladder>
          <div class="eyebrow">Sellable tool ladder</div>
          <h2>Start free, upgrade only after proof.</h2>
          <div class="kit-grid">
            <article class="kit-card"><h3>${escapeHtml(kit.entitlement_ladder.free_core.label)}</h3><p>${escapeHtml(kit.entitlement_ladder.free_core.includes)}</p><small>${escapeHtml(kit.entitlement_ladder.free_core.gate)}</small></article>
            <article class="kit-card"><h3>${escapeHtml(kit.entitlement_ladder.paid_pilot.label)}</h3><p>${escapeHtml(kit.entitlement_ladder.paid_pilot.includes)}</p><small>${escapeHtml(kit.entitlement_ladder.paid_pilot.gate)}</small></article>
            <article class="kit-card"><h3>${escapeHtml(kit.entitlement_ladder.premium_maintained.label)}</h3><p>${escapeHtml(kit.entitlement_ladder.premium_maintained.includes)}</p><small>${escapeHtml(kit.entitlement_ladder.premium_maintained.gate)}</small></article>
            <article class="kit-card"><h3>${escapeHtml(kit.entitlement_ladder.gated_hands.label)}</h3><p>${escapeHtml(kit.entitlement_ladder.gated_hands.includes)}</p><small>${escapeHtml(kit.entitlement_ladder.gated_hands.gate)}</small></article>
          </div>
        </section>
        <section class="section" data-role-playbook-section>
          <div class="eyebrow">Role playbook</div>
          <h2>Use this worker differently by role.</h2>
          <div class="kit-grid">${renderRolePlaybookCards(kit)}</div>
        </section>
        <section class="section">
          <h2>Acceptance tests</h2>
          <div class="kit-card"><ul>${renderKitList(kit.acceptance_tests)}</ul></div>
          <p style="margin-top:14px"><a class="kit-json" href="/site/agent-templates/${escapeHtml(kit.id)}.json">Agent-readable JSON</a></p>
        </section>
      </main>
      <footer><span>SUPERMEGA.dev setup kit.</span><span class="footer-links"><a href="/ai-agents/guide/">User guide</a><a href="/products/">Products</a><a href="/contact/">Contact</a></span></footer>
    </div>
${publicRuntimeScripts}
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
    ['entitlement_free_core', kit.entitlement_ladder.free_core.includes],
    ['entitlement_paid_pilot', kit.entitlement_ladder.paid_pilot.includes],
    ['entitlement_premium', kit.entitlement_ladder.premium_maintained.includes],
    ['entitlement_gated_hands', kit.entitlement_ladder.gated_hands.includes],
    ['entitlement_gate', kit.entitlement_ladder.gated_hands.gate],
    ['acceptance_tests', kit.acceptance_tests.join('\n')],
    ['first_step', `Produce first proof: ${kit.offer.first_proof}`],
    ['onboarding_stage', 'source_review'],
    ['access_policy', 'approval_required'],
    ['workspace_status', 'not_created_until_approved'],
    ['intake_job_mode', 'intake_to_first_proof'],
    ['kickoff_pack_mode', 'client_kickoff_pack'],
    ['first_run_mode', 'approval_only'],
    ['user_role_mode', ''],
    ['user_role_label', ''],
    ['user_device_mode', ''],
    ['user_device_label', ''],
    ['adaptive_worker_id', ''],
    ['adaptive_plan_summary', ''],
    ['adaptive_next_step', ''],
    ['adaptive_user_path', ''],
    ['source_pack_required', ''],
    ['source_pack_samples', ''],
    ['source_pack_first_proof', ''],
    ['source_pack_readiness', ''],
    ['proof_plan_worker_id', ''],
    ['proof_plan_summary', ''],
    ['proof_plan_milestones', ''],
    ['proof_plan_metrics', ''],
    ['proof_plan_gate', ''],
    ['value_plan_worker_id', ''],
    ['value_plan_summary', ''],
    ['value_plan_metrics', ''],
    ['value_plan_evidence', ''],
    ['value_plan_gate', ''],
    ['pilot_plan_worker_id', ''],
    ['pilot_plan_summary', ''],
    ['pilot_plan_scope', ''],
    ['pilot_plan_next_action', ''],
    ['pilot_plan_gate', ''],
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
      .setup-form input:focus,.setup-form textarea:focus { border-color:rgba(255,59,59,.55); box-shadow:0 0 0 4px rgba(255,59,59,.10); }
      .setup-proof { display:grid; gap:10px; margin-top:18px; }
      .setup-proof li { margin:7px 0; color:var(--muted); font-weight:780; line-height:1.4; }
      .setup-role-grid { display:grid; gap:10px; margin-top:16px; }
      .setup-role-grid .kit-card { border:1px solid var(--line); border-radius:18px; padding:14px; background:rgba(255,255,255,.5); }
      .setup-role-grid .kit-card h3 { margin:0 0 8px; font-size:17px; letter-spacing:-.02em; }
      .setup-role-grid .kit-card ul { margin:0; padding-left:18px; }
      .setup-role-grid .kit-card li { margin:6px 0; color:var(--muted); font-size:13px; line-height:1.38; }
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
            <strong>Queued job</strong>
            <span>Intake-to-first-proof packet with source manifest, first run steps, acceptance tests, and approval boundary.</span>
            <strong>Kickoff pack</strong>
            <span>Client-ready kickoff message, source request, 48-hour plan, and operator checklist.</span>
            <strong>What we need</strong>
            <ul>${renderKitList(kit.intake_schema.setup_inputs)}</ul>
            <strong>Accepted samples</strong>
            <ul>${renderKitList(kit.intake_schema.sample_sources)}</ul>
            <strong>Sellable tool ladder</strong>
            <ul>
              <li><strong>${escapeHtml(kit.entitlement_ladder.free_core.label)}:</strong> ${escapeHtml(kit.entitlement_ladder.free_core.includes)}</li>
              <li><strong>${escapeHtml(kit.entitlement_ladder.paid_pilot.label)}:</strong> ${escapeHtml(kit.entitlement_ladder.paid_pilot.includes)}</li>
              <li><strong>${escapeHtml(kit.entitlement_ladder.premium_maintained.label)}:</strong> ${escapeHtml(kit.entitlement_ladder.premium_maintained.includes)}</li>
              <li><strong>${escapeHtml(kit.entitlement_ladder.gated_hands.label)}:</strong> ${escapeHtml(kit.entitlement_ladder.gated_hands.includes)}</li>
            </ul>
            <strong>Role playbook</strong>
            <span>Choose owner, operator, or technical admin mode above. The selected role is added to this setup request as a routing hint.</span>
            <div class="setup-role-grid" data-role-playbook-section>${renderRolePlaybookCards(kit)}</div>
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
      <footer><span>SUPERMEGA.dev agent setup.</span><span class="footer-links"><a href="/ai-agents/guide/">User guide</a><a href="/agent-templates/${escapeHtml(kit.id)}/">Setup kit</a><a href="/contact/?template=${escapeHtml(kit.id)}">Contact route</a></span></footer>
    </div>
${publicRuntimeScripts}
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
            <div class="cta"><a class="btn secondary" href="/ai-agents/guide/">Read the user guide</a></div>
          </div>
        </section>
        <section class="section"><div class="kit-grid">${cards}</div></section>
      </main>
      <footer><span>SUPERMEGA.dev setup kits.</span><span class="footer-links"><a href="/products/">Products</a><a href="/contact/">Contact</a></span></footer>
    </div>
${publicRuntimeScripts}
  </body>
</html>`
}

for (const detailDoc of productDetailDocs) {
  await mkdir(resolve(staticDir, 'products', detailDoc.slug), { recursive: true })
  await writeFile(resolve(staticDir, 'products', detailDoc.slug, 'index.html'), normalizePublicProductNames(buildProductDetailHtml(detailDoc)), 'utf8')
}
await mkdir(resolve(staticDir, 'agent-templates'), { recursive: true })
await writeFile(resolve(staticDir, 'agent-templates', 'index.html'), normalizePublicProductNames(buildAgentTemplateIndexHtml()), 'utf8')
await mkdir(resolve(staticDir, 'ai-agents', 'guide'), { recursive: true })
await writeFile(resolve(staticDir, 'ai-agents', 'guide', 'index.html'), normalizePublicProductNames(buildAiWorkerUserGuideHtml()), 'utf8')
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
    slug: 'dashboard', name: 'Custom build — dashboard / internal tool', mmkDisplay: serviceMmk('dashboard'),
    who: 'Your numbers live across five spreadsheets and nobody trusts them.',
    gets: ['One screen that updates itself from your real data', 'Built around how you actually work', 'Export to clean CSV anytime'],
    cta: 'Scope my build',
  },
  {
    slug: 'ai-workcell-pilot', name: 'AI Workcell Pilot', mmkDisplay: serviceMmk('ai-agent'), flagship: true,
    who: 'You want an AI worker for one real task: cleanup, reports, inbox, reconciliation, migration, or launch ops.',
    gets: ['Source pack intake and First proof from real data', 'First production run stays approval-only until Owner acceptance', 'Maintenance path with customer success desk; no recurring claim until payment proof'],
    cta: 'Start the pilot',
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
    <meta name="description" content="MMK starting prices for free-core upgrades, custom builds, AI agent crews, and full systems for Myanmar businesses." />
    <meta name="theme-color" content="#0A0E1C" />
    <link rel="canonical" href="https://supermega.dev/offers/" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SUPERMEGA.dev" />
    <meta property="og:title" content="Pricing - free-core upgrades and AI agent crews" />
    <meta property="og:description" content="Clear MMK starting prices for tools, dashboards, AI agent crews, and full systems. Built for Myanmar, yours to keep." />
    <meta property="og:url" content="https://supermega.dev/offers/" />
    <meta property="og:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Pricing - free-core upgrades and AI agent crews" />
    <meta name="twitter:description" content="Clear MMK starting prices for tools, dashboards, AI agent crews, and full systems." />
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
            <h1>Start free. Pay when the worker proves value.</h1>
            <p>Free core tools show the workflow first. Paid builds add private data, connectors, source trace, approval queues, scheduled runs, and maintenance. Starting prices in MMK; final quote after one short call.</p>
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
          <div class="workcell-panel">
            <div class="eyebrow">AI Workcell Pilot</div>
            <h2>The proof-to-maintenance path.</h2>
            <p>Premium setup means easy setup for the client: send one source pack, get a First proof, approve a First production run, then decide after Owner acceptance whether the workcell should be maintained. Every client gets a private workspace, acceptance tests, source trace, and a customer success desk. Recurring revenue stays 0 until payment proof.</p>
            <div class="workcell-grid">
              <div class="workcell-step"><strong>Source pack</strong><span>One messy workflow: Gmail, Sheet, chat export, POS CSV, PDF, or screenshot batch.</span></div>
              <div class="workcell-step"><strong>First proof</strong><span>One useful output from real data before the full pilot is approved.</span></div>
              <div class="workcell-step"><strong>First production run</strong><span>The first live run is approval-only; no send, write, payment, or connector action happens silently.</span></div>
              <div class="workcell-step"><strong>Maintenance</strong><span>After Owner acceptance, we keep the workcell improving with clear proof of value.</span></div>
            </div>
          </div>
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
${publicRuntimeScripts}
  </body>
</html>`

await mkdir(resolve(staticDir, 'contact'), { recursive: true })
await writeFile(resolve(staticDir, 'contact', 'index.html'), normalizePublicProductNames(collapsedContactHtml), 'utf8')
await mkdir(resolve(staticDir, 'free'), { recursive: true })
await writeFile(resolve(staticDir, 'free', 'index.html'), normalizePublicProductNames(publicSourceToScreenHtml), 'utf8')
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
    <meta name="theme-color" content="#0A0E1C" />
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
${publicRuntimeScripts}
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
    .operator-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}
    .operator-kpi{border:1px solid var(--line);padding:12px;background:color-mix(in srgb,var(--paper) 92%,var(--ink) 8%)}
    .operator-kpi strong{display:block;font-size:24px;line-height:1}
    .operator-behavior-board{border:1px solid var(--line);padding:14px;background:color-mix(in srgb,var(--paper) 93%,#1c8a5a 7%)}
    .operator-signal-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:10px}
    .operator-signal-cell{border:1px solid var(--line);padding:10px;background:color-mix(in srgb,var(--paper) 96%,var(--ink) 4%)}
    .operator-signal-cell strong{display:block;font-size:20px;line-height:1.1}
    .operator-failover-report{border:1px solid var(--line);padding:14px;background:color-mix(in srgb,var(--paper) 96%,var(--ink) 4%)}
    .operator-activation-cockpit{border:1px solid var(--line);padding:14px;background:color-mix(in srgb,var(--paper) 93%,var(--accent) 7%)}
    .operator-activation-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-top:10px}
    .operator-activation-step{border:1px solid var(--line);padding:10px;background:color-mix(in srgb,var(--paper) 96%,var(--ink) 4%);display:grid;gap:8px;align-content:start}
    .operator-activation-step strong{font-size:14px;line-height:1.2}
    .operator-activation-step.is-done{background:color-mix(in srgb,var(--paper) 90%,#1c8a5a 10%)}
    .operator-activation-step.is-next{background:color-mix(in srgb,var(--paper) 88%,var(--accent) 12%)}
    .operator-activation-session{border:1px solid var(--line);padding:14px;background:color-mix(in srgb,var(--paper) 95%,#1c8a5a 5%)}
    .operator-activation-session label{display:grid;gap:6px}
    .operator-revenue-board{border:1px solid var(--line);padding:14px;background:color-mix(in srgb,var(--paper) 94%,var(--ink) 6%)}
    .operator-command-board{border:1px solid var(--line);padding:14px;background:color-mix(in srgb,var(--paper) 91%,var(--ink) 9%)}
    .operator-money-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
    .operator-money-cell{border:1px solid var(--line);padding:10px}
    .operator-money-cell strong{display:block;font-size:20px;line-height:1.1}
    .operator-list{display:grid;gap:10px}
    .operator-item{border:1px solid var(--line);padding:14px;background:transparent}
    .operator-meta{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0;color:var(--muted);font-size:13px}
    .operator-chip{border:1px solid var(--line);padding:3px 7px}
    .operator-proof{margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}
    .operator-proof-link{display:inline-flex;margin-top:10px;color:var(--ink);font-weight:900;text-decoration:underline;text-underline-offset:3px}
    .operator-proof-section{margin-top:10px}
    .operator-proof-section span{display:block;color:var(--muted);font-size:12px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}
    .operator-proof ul{margin:8px 0 0;padding-left:18px}
    .operator-reply{width:100%;min-height:150px;margin-top:8px;border:1px solid var(--line);background:color-mix(in srgb,var(--paper) 93%,var(--ink) 7%);color:var(--ink);padding:10px;font:inherit;font-size:13px;line-height:1.45;resize:vertical}
    .operator-output{white-space:pre-wrap;overflow:auto;max-height:240px;border:1px solid var(--line);padding:12px;font-size:13px;background:color-mix(in srgb,var(--paper) 90%,var(--ink) 10%)}
    @media(max-width:840px){.operator-grid{grid-template-columns:1fr}.operator-kpis,.operator-money-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <div class="wrap">
    <script>(function(){try{var t=localStorage.getItem('sm-theme');if(!t){t='dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
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
            <button id="load-sample" class="btn secondary" type="button">Load sample proof</button>
            <button id="refresh" class="btn primary" type="button">Refresh queue</button>
            <button id="run-runner" class="btn secondary" type="button">Run queue now</button>
          </div>
          <div class="operator-stack operator-activation-session" id="operator-activation-session">
            <div>
              <div class="eyebrow">Autopilot intake</div>
              <h2>Start activation session</h2>
            </div>
            <label>
              <span>Company or buyer</span>
              <input class="operator-input" data-activation-session-field="company" value="Yangon owner-operated business" />
            </label>
            <label>
              <span>Package</span>
              <input class="operator-input" data-activation-session-field="requested_package" value="Managed AI Workcell" />
            </label>
            <label>
              <span>Buyer goal</span>
              <textarea class="operator-input" data-activation-session-field="buyer_goal">Turn messy daily messages, files, and follow-ups into one owner-approved action queue.</textarea>
            </label>
            <label>
              <span>Source sample</span>
              <textarea class="operator-input" data-activation-session-field="source_sample" placeholder="Paste a Drive folder, screenshot note, file list, inbox label, POS export, or sample workflow."></textarea>
            </label>
            <label>
              <span>First proof target</span>
              <input class="operator-input" data-activation-session-field="first_proof_target" value="One-page action brief with source trace and next owner decision." />
            </label>
            <label>
              <span>Price hint</span>
              <input class="operator-input" data-activation-session-field="price_hint" value="owner-approved MMK quote after first proof" />
            </label>
            <div class="operator-proof-section">
              <span>Safety boundary</span>
              <div>No external send, connector write, browser/mobile action, payment request, or revenue claim without owner approval. Real MRR stays 0 until payment proof is recorded.</div>
            </div>
            <button id="start-activation-session" class="btn primary" type="button">Start activation session</button>
          </div>
          <div class="operator-output" id="operator-status">No data loaded.</div>
        </div>
        <div class="operator-panel operator-stack">
          <div class="operator-kpis" id="operator-kpis"></div>
          <div class="operator-proof-section operator-behavior-board" id="behavior-summary-board"></div>
          <div class="operator-proof-section operator-failover-report" id="datastore-failover-report"></div>
          <div class="operator-proof-section operator-activation-cockpit" id="operator-activation-cockpit"></div>
          <div class="operator-proof-section operator-command-board" id="autopilot-command-board"></div>
          <div class="operator-proof-section operator-revenue-board" id="revenue-proof-board"></div>
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
    const behaviorBoardEl = document.getElementById('behavior-summary-board');
    const failoverReportEl = document.getElementById('datastore-failover-report');
    const activationCockpitEl = document.getElementById('operator-activation-cockpit');
    const commandBoardEl = document.getElementById('autopilot-command-board');
    const revenueBoardEl = document.getElementById('revenue-proof-board');
    const activationSessionEl = document.getElementById('operator-activation-session');
    keyInput.value = sessionStorage.getItem('supermega_ops_key') || '';
    function esc(value){return String(value == null ? '' : value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]})}
    function token(){return keyInput.value.trim()}
    function authHeaders(){return {accept:'application/json',authorization:'Bearer '+token()}}
    function setStatus(value){statusBox.textContent = typeof value === 'string' ? value : JSON.stringify(value,null,2)}
    function samplePipelineData(){
      return {
        status:'ready',
        runtime_status:'sample_only',
        metrics:{open_action_count:2,recent_lead_count:1,recent_action_count:2,proof_backed_mrr_mmk:900000,bank_verified_mrr_mmk:0,bank_unverified_mrr_mmk:900000},
        behavior_summary:{
          status:'ready',
          source:'sample_private_queue',
          adapter:'sample',
          generated_at:'SAMPLE-GENERATED-AT',
          events_24h:17,
          events_7d:52,
          event_counts:[
            {event_type:'setup_started',count:9,last_recorded_at:'SAMPLE-RECORDED-AT'},
            {event_type:'template_clicked',count:21,last_recorded_at:'SAMPLE-RECORDED-AT'},
            {event_type:'lead_form_submitted',count:2,last_recorded_at:'SAMPLE-RECORDED-AT'}
          ],
          top_templates:[
            {template_id:'daily-intelligence-brief',count:18,setup_starts:6,template_clicks:11,lead_form_submits:1,last_recorded_at:'SAMPLE-RECORDED-AT'},
            {template_id:'document-pdf-intake-ledger',count:9,setup_starts:2,template_clicks:7,lead_form_submits:0,last_recorded_at:'SAMPLE-RECORDED-AT'}
          ],
          adaptation_queue:[
            {priority:'critical',signal:'lead_form_submitted',template_id:'daily-intelligence-brief',event_count:18,setup_starts:6,template_clicks:11,lead_form_submits:1,recommended_next_step:'Open the lead queue and prepare the first-proof source request for daily-intelligence-brief.',owner_gate:'no_external_send_or_connector_write_without_owner_approval'},
            {priority:'medium',signal:'setup_started',template_id:'document-pdf-intake-ledger',event_count:9,setup_starts:2,template_clicks:7,lead_form_submits:0,recommended_next_step:'Prepare a short follow-up offer and sample source checklist for document-pdf-intake-ledger.',owner_gate:'no_external_send_or_connector_write_without_owner_approval'}
          ],
          sellable_tool_recommendations:[
            {priority:'critical',signal:'lead_form_submitted',template_id:'daily-intelligence-brief',tool_name:'Daily Intelligence Brief Agent',buyer:'Importer, trader, factory owner, agency, or executive team',free_core_tool:'Free one-page watchlist brief from approved sources',premium_upgrade:'Scheduled operating brief with source-change log, decision queue, and follow-up task list',proof_metric:'important source changes ranked with exact owner decisions and next actions',source_pack_ask:'watchlist URLs, company names, inbox labels, decision categories, send time',next_entitlement_offer:'paid_pilot',entitlement_ladder:{free_core:'Free one-page watchlist brief from approved sources',paid_pilot:'Owner-approved paid pilot after proof: watchlist URLs, company names, inbox labels, decision categories, send time',premium_maintained:'Scheduled operating brief with source-change log, decision queue, and follow-up task list',gated_hands:'Owner-approved computer-use or mobile actions only after consent, vaulting, audit logs, rollback plan, and explicit approval'},recommended_sales_motion:'Open the lead queue, send the free proof request, and prepare the paid-pilot path.',owner_gate:'no_external_send_or_connector_write_without_owner_approval'},
            {priority:'high',signal:'setup_started',template_id:'document-pdf-intake-ledger',tool_name:'Document / PDF Intake Ledger',buyer:'Law office, accountant, importer, school admin, clinic, or operations team processing repeated PDFs',free_core_tool:'Free five-document extraction proof with confidence notes',premium_upgrade:'Document intake ledger with missing-field queue, source trace, and review workflow',proof_metric:'five documents extracted into a clean table with gaps and source trace',source_pack_ask:'document samples, target fields, naming rules, exception examples, review owner',next_entitlement_offer:'free_core_to_paid_pilot',entitlement_ladder:{free_core:'Free five-document extraction proof with confidence notes',paid_pilot:'Owner-approved paid pilot after proof: document samples, target fields, naming rules, exception examples, review owner',premium_maintained:'Document intake ledger with missing-field queue, source trace, and review workflow',gated_hands:'Owner-approved computer-use or mobile actions only after consent, vaulting, audit logs, rollback plan, and explicit approval'},recommended_sales_motion:'Ask for the smallest source pack, then prove the document ledger before a premium build.',owner_gate:'no_external_send_or_connector_write_without_owner_approval'}
          ],
          user_adaptation_segments:[
            {priority:'high',user_device_mode:'phone',user_role_mode:'owner',visitor_stage:'proof_setup_started',event_count:14,setup_starts:4,template_clicks:8,lead_form_submits:0,recommended_ui_adaptation:'Keep one recommended worker, one source-pack ask, and one tap-to-contact CTA above the fold.',recommended_sales_adaptation:'Lead with value proof, payment-proof gate, and owner approval before production.',privacy_gate:'aggregate_role_device_only_no_keystrokes_or_source_content'},
            {priority:'medium',user_device_mode:'desktop',user_role_mode:'technical_admin',visitor_stage:'worker_discovery',event_count:10,setup_starts:0,template_clicks:7,lead_form_submits:0,recommended_ui_adaptation:'Expose the full matcher, setup kit, proof plan, and operator-grade source trace because desktop users can review more detail.',recommended_sales_adaptation:'Lead with connector scope, permissions, audit log, vaulting, and rollback boundary.',privacy_gate:'aggregate_role_device_only_no_keystrokes_or_source_content'}
          ],
          recent_events:[
            {event_id:'BEHAV-SAMPLE-01',event_type:'setup_started',page_path:'/agent-templates/daily-intelligence-brief/setup/',template_id:'daily-intelligence-brief',requested_package:'Managed AI Workcell',component:'starter-kit',cta_text:'Send setup request',utm_campaign:'sample',recorded_at:'SAMPLE-RECORDED-AT'}
          ],
          privacy:'operator_summary_no_ip_user_agent_or_raw_payloads'
        },
        approval_inbox:{status:'sample',pending_count:1},
        blob_action_queue:{status:'sample_private_queue',adapter:'vercel_blob',access:'private',purpose:'Durable action queue when SQL is degraded.'},
        datastore_failover_report:{
          status:'active',
          report_type:'datastore_failover_report',
          runtime_status:'degraded',
          primary:{status:'not_configured',provider:'vercel_postgres_neon',adapter:'pg'},
          fallback:{status:'ready',provider:'vercel_blob',adapter:'vercel_blob'},
          client_onboarding_allowed:true,
          operator_mode:'blob_queue_approval_only',
          real_mrr_policy:'zero_until_payment_proof',
          safe_actions:['capture_leads','run_action_runner','prepare_first_proof','start_private_workspace_after_payment_proof'],
          blocked_actions:['external_send_without_owner_approval','connector_writes_without_owner_acceptance','payment_request_without_owner_approval','claim_mrr_without_payment_proof'],
          next_fix:'Provision or uncap Vercel Postgres/Neon, set POSTGRES_URL or DATABASE_URL, then run the lead-ledger schema.'
        },
        operator_runtime_summary:'Blob fallback active: client onboarding allowed in approval-only mode; restore SQL for primary ledger durability.',
        approval_ledger:{status:'sample_private_ledger',adapter:'vercel_blob',access:'private',sdk:'sample',recent:[{decision:'pending',title:'Sample Daily Intelligence Brief source request approval',recorded_at:'SAMPLE-RECORDED-AT',approval_reference:'SAMPLE-OWNER-REVIEW'}]},
        revenue_proof_board:{
          status:'ready',
          board_type:'revenue_proof_board',
          action_count:1,
          payment_record_count:1,
          proof_backed_mrr_mmk:900000,
          bank_verified_mrr_mmk:0,
          bank_unverified_mrr_mmk:900000,
          stage_counts:{queued:1},
          payment_records:[{
            action_id:'SAMPLE-FIRST-PROOF',
            lead_id:'SAMPLE-SETUP',
            title:'Sample Daily Intelligence Brief first proof',
            workspace_slug:'pilot-daily-intelligence-brief-sample-setup',
            template_name:'Daily Intelligence Brief Agent',
            normalized_mrr_delta_mmk:900000,
            payment_period:'monthly',
            payment_proof_reference:'SAMPLE-PAYMENT-PROOF',
            owner_approval_reference:'SAMPLE-OWNER-APPROVAL',
            bank_reconciliation_state:'not_bank_verified',
            recorded_at:'SAMPLE-RECORDED-AT'
          }],
          next_cash_actions:[{
            action_id:'SAMPLE-FIRST-PROOF',
            lead_id:'SAMPLE-SETUP',
            title:'Sample Daily Intelligence Brief first proof',
            next_action:'bank_reconcile_payment_proof',
            owner:'Revenue Pod',
            evidence_required:'bank_match_or_manual_owner_reconciliation',
            revenue_claim_state:'proof_backed_not_bank_verified'
          }],
          open_proof_gaps:[],
          payment_ledger_csv:[
            '"action_id","lead_id","title","workspace_slug","template_name","normalized_mrr_delta_mmk","payment_period","payment_proof_reference","owner_approval_reference","bank_reconciliation_state","recorded_at"',
            '"SAMPLE-FIRST-PROOF","SAMPLE-SETUP","Sample Daily Intelligence Brief first proof","pilot-daily-intelligence-brief-sample-setup","Daily Intelligence Brief Agent","900000","monthly","SAMPLE-PAYMENT-PROOF","SAMPLE-OWNER-APPROVAL","not_bank_verified","SAMPLE-RECORDED-AT"'
          ].join('\\n'),
          next_cash_actions_csv:[
            '"action_id","lead_id","title","next_action","owner","evidence_required","revenue_claim_state"',
            '"SAMPLE-FIRST-PROOF","SAMPLE-SETUP","Sample Daily Intelligence Brief first proof","bank_reconcile_payment_proof","Revenue Pod","bank_match_or_manual_owner_reconciliation","proof_backed_not_bank_verified"'
          ].join('\\n'),
          guardrails:['proof_backed_mrr_requires_retainer_payment_proof_record','bank_verified_mrr_is_separate_from_payment_proof','drafts_and_offers_do_not_count_as_mrr']
        },
        autopilot_command_board:{
          status:'ready',
          board_type:'autopilot_command_board',
          mode:'approval_gated_autopilot',
          command_count:3,
          critical_count:1,
          internal_autorun_count:2,
          owner_approval_count:3,
          blocked_count:0,
          commands:[{
            command_id:'cash-reconciliation-sample-first-proof',
            lane:'cash_reconciliation',
            priority:'critical',
            owner:'Revenue Pod',
            title:'Reconcile payment proof: Sample Daily Intelligence Brief first proof',
            lead_id:'SAMPLE-SETUP',
            action_id:'SAMPLE-FIRST-PROOF',
            suggested_action:'Match the payment proof to bank/payment evidence, then mark bank verification only after a human-confirmed match.',
            evidence_required:'bank_match_or_manual_owner_reconciliation',
            expected_value:'turn proof-backed MRR into bank-verified MRR',
            approval_required:true,
            internal_autorun:true,
            external_action_state:'internal_review',
            revenue_claim_state:'proof_backed_not_bank_verified'
          },{
            command_id:'first-proof-delivery-sample-first-proof',
            lane:'first_proof_delivery',
            priority:'high',
            owner:'Revenue Pod',
            title:'Build first proof: Sample Daily Intelligence Brief first proof',
            lead_id:'SAMPLE-SETUP',
            action_id:'SAMPLE-FIRST-PROOF',
            suggested_action:'Run the first-proof packet, attach source trace, and queue the buyer reply for owner review.',
            evidence_required:'One-page morning brief with what changed, why it matters, and exact follow-up actions.',
            expected_value:'make the buyer see useful output before a paid pilot',
            approval_required:true,
            internal_autorun:true,
            external_action_state:'draft_only_until_owner_approval',
            revenue_claim_state:'not_claimed'
          },{
            command_id:'approval-inbox-sample-first-proof',
            lane:'approval_inbox',
            priority:'high',
            owner:'Founder',
            title:'Review approval: owner-safe buyer reply',
            lead_id:'SAMPLE-SETUP',
            action_id:'SAMPLE-FIRST-PROOF',
            suggested_action:'Review buyer reply, payment path, and external-send boundary before any outreach.',
            evidence_required:'owner_decision',
            expected_value:'clear the human gate blocking delivery and revenue',
            approval_required:true,
            internal_autorun:false,
            external_action_state:'owner_decision_required',
            revenue_claim_state:'not_claimed'
          }],
          command_queue_csv:[
            '"command_id","lane","priority","owner","lead_id","action_id","title","suggested_action","evidence_required","expected_value","approval_required","internal_autorun","external_action_state","revenue_claim_state"',
            '"cash-reconciliation-sample-first-proof","cash_reconciliation","critical","Revenue Pod","SAMPLE-SETUP","SAMPLE-FIRST-PROOF","Reconcile payment proof: Sample Daily Intelligence Brief first proof","Match the payment proof to bank/payment evidence, then mark bank verification only after a human-confirmed match.","bank_match_or_manual_owner_reconciliation","turn proof-backed MRR into bank-verified MRR","yes","yes","internal_review","proof_backed_not_bank_verified"',
            '"first-proof-delivery-sample-first-proof","first_proof_delivery","high","Revenue Pod","SAMPLE-SETUP","SAMPLE-FIRST-PROOF","Build first proof: Sample Daily Intelligence Brief first proof","Run the first-proof packet, attach source trace, and queue the buyer reply for owner review.","One-page morning brief with what changed, why it matters, and exact follow-up actions.","make the buyer see useful output before a paid pilot","yes","yes","draft_only_until_owner_approval","not_claimed"',
            '"approval-inbox-sample-first-proof","approval_inbox","high","Founder","SAMPLE-SETUP","SAMPLE-FIRST-PROOF","Review approval: owner-safe buyer reply","Review buyer reply, payment path, and external-send boundary before any outreach.","owner_decision","clear the human gate blocking delivery and revenue","yes","no","owner_decision_required","not_claimed"'
          ].join('\\n'),
          operator_brief_markdown:[
            '# Autopilot daily money brief',
            '',
            'Status: commands_ready',
            'Mode: approval_gated_autopilot',
            'Proof-backed MRR MMK: 900000',
            'Bank-unverified MRR MMK: 900000',
            '',
            '## Top commands',
            '1. [critical] cash_reconciliation - Reconcile payment proof: Sample Daily Intelligence Brief first proof :: Match the payment proof to bank/payment evidence, then mark bank verification only after a human-confirmed match.',
            '2. [high] first_proof_delivery - Build first proof: Sample Daily Intelligence Brief first proof :: Run the first-proof packet, attach source trace, and queue the buyer reply for owner review.',
            '3. [high] approval_inbox - Review approval: owner-safe buyer reply :: Review buyer reply, payment path, and external-send boundary before any outreach.',
            '',
            '## Guardrails',
            '- Internal preparation can run automatically when internal_autorun is yes.',
            '- External sends, payment requests, connector writes, and production writes remain owner-approved.',
            '- Revenue is not claimed from drafts, offers, or unverified assumptions.'
          ].join('\\n'),
          guardrails:['approval_gated_autopilot','internal_drafts_allowed_external_actions_blocked_until_owner_approval','money_actions_require_payment_or_bank_evidence','no_revenue_claim_without_payment_proof']
        },
        recent_actions:[{
          action_id:'SAMPLE-FIRST-PROOF',
          lead_id:'SAMPLE-SETUP',
          task_id:'SAMPLE-FIRST-PROOF',
          action_type:'lead_followup',
          status:'queued',
          priority:'high',
          owner:'Revenue Pod',
          title:'Sample Daily Intelligence Brief first proof',
          next_step:'Review source notes, open the starter kit, then produce the one-page brief.',
          approval_required:true,
          approval_state:'pending',
          notification_channel:'console',
          notification_status:'sample',
          first_proof:{
            status:'queued_for_runner',
            template_id:'daily-intelligence-brief',
            template_name:'Daily Intelligence Brief Agent',
            starter_kit_url:'/site/agent-templates/daily-intelligence-brief.json',
            first_proof_target:'One-page morning brief with what changed, why it matters, and exact follow-up actions.',
            title:'Daily Intelligence Brief Agent first proof for sample buyer',
            solution_route_packet:[
              '# Daily Intelligence Brief Agent solution route',
              '',
              'Status: route_ready',
              'Lead: SAMPLE-SETUP',
              'Recommended template: daily-intelligence-brief',
              'Product area: Custom Solutions & AI Agents',
              'Delivery lane: decision_brief_workcell',
              'Fit score: 100',
              'Matched keywords: brief, daily',
              'Price hint: 11,000,000 MMK setup',
              '',
              '## First proof',
              'One-page morning brief with what changed, why it matters, and exact follow-up actions.',
              '',
              '## What to request',
              '- watchlist URLs',
              '- company names or keywords',
              '- inbox labels',
              '- decision categories',
              '',
              '## Sales motion',
              'Sell a recurring owner brief after one source-traced decision packet is accepted.',
              '',
              '## Premium delivery controls',
              '- Source trace on important outputs.',
              '- Role separation: buyer owner, buyer operator, SuperMega operator, agent worker.',
              '- Approval queue before external sends, connector writes, credentialed browser actions, or payment requests.',
              '- Value ledger before any recurring revenue claim.'
            ].join('\\n'),
            implementation_blueprint_packet:[
              '# Daily Intelligence Brief Agent implementation blueprint',
              '',
              'Status: implementation_blueprint_ready',
              'Lead: SAMPLE-SETUP',
              'Template: daily-intelligence-brief',
              'Delivery lane: decision_brief_workcell',
              'First proof: One-page morning brief with what changed, why it matters, and exact follow-up actions.',
              'Price hint: 11,000,000 MMK setup',
              '',
              '## Modules',
              '- buyer_goal',
              '- approved_sources',
              '- source_trace',
              '- first_proof',
              '- approval_queue',
              '- delivery_packet',
              '- watchlist',
              '- source_change_log',
              '- decision_brief',
              '- risk_flags',
              '- followup_queue',
              '',
              '## Roles',
              '- client_owner: approve scope, sources, payment route, external sends, connector writes, and acceptance evidence',
              '- client_operator: provide source samples, review drafts, request corrections, and confirm daily workflow fit',
              '- supermega_operator: configure the workcell, run proofs, maintain source trace, and prepare client-safe packets',
              '- agent_worker: draft from approved sources only; no credentials, no autonomous sends, no live writes',
              '',
              '## Delivery plan',
              '- day_0: Confirm buyer goal, first proof target, source samples, role owner, and approval boundary.',
              '- day_1: Build the first proof.',
              '- day_2: Review source trace, acceptance checks, delivery risk, and buyer usefulness.',
              '- day_3_to_7: Turn accepted proof into a private approval-gated pilot workspace after scope and payment proof.',
              '',
              '## Acceptance gates',
              '- [ ] Buyer confirms the first proof is useful.',
              '- [ ] Important claims include source trace.',
              '- [ ] Owner approves scope, price, and payment route before payment request.',
              '- [ ] Private workspace starts only after payment proof.',
              '',
              '## Enterprise controls',
              '- Source trace on important outputs.',
              '- Role separation for owner, operator, SuperMega operator, and agent worker.',
              '- Approval queue before send/write/payment/browser actions.',
              '- Value ledger before recurring revenue claims.'
            ].join('\\n'),
            intake_job_packet:[
              '# Daily Intelligence Brief Agent intake-to-first-proof job',
              '',
              'Lead: SAMPLE-SETUP',
              'Company: Sample buyer',
              'Template: daily-intelligence-brief',
              'First proof: One-page morning brief with what changed, why it matters, and exact follow-up actions.',
              'Job state: ready_for_first_proof_build',
              '',
              '## Source manifest',
              '- buyer_goal: provided - Build a daily owner brief from approved source samples.',
              '- sample_sources: provided - /site/agent-templates/daily-intelligence-brief.json',
              '- starter_kit: provided - /site/agent-templates/daily-intelligence-brief.json',
              '- approval_boundary: provided - Approval required before external sends, connector writes, payment actions, or live record edits.',
              '',
              '## First run steps',
              '1. Read the starter kit and buyer goal.',
              '2. Open only the approved sample sources.',
              '3. Extract the minimum facts needed for the first proof.',
              '4. Draft the first proof: One-page morning brief with what changed, why it matters, and exact follow-up actions.',
              '5. Attach source trace and acceptance-test status.',
              '6. Queue buyer reply and pilot close packet for owner review.',
              '',
              '## Approval boundary',
              '- No external send without owner approval.',
              '- No connector write without owner approval.',
              '- No payment action without owner approval.',
              '- Real MRR stays 0 until payment proof is recorded.'
            ].join('\\n'),
            client_kickoff_packet:[
              '# Daily Intelligence Brief Agent client kickoff pack',
              '',
              'Lead: SAMPLE-SETUP',
              'Company: Sample buyer',
              'Template: daily-intelligence-brief',
              'Status: ready_for_first_proof',
              'Price hint: 11,000,000 MMK setup',
              '',
              '## Buyer promise',
              'First useful output: One-page morning brief with what changed, why it matters, and exact follow-up actions.',
              '',
              '## What we need',
              '- Approved sample source is enough to start the first proof run.',
              '',
              '## First 48 hours',
              '1. Confirm the first proof target.',
              '2. Use only buyer-approved sample sources.',
              '3. Produce the first proof with source trace.',
              '4. Review acceptance tests with the owner.',
              '5. Only then discuss pilot scope, payment route, and private workspace.',
              '',
              '## Operator checklist',
              '- [ ] Open the intake job packet.',
              '- [ ] Approved sample source is enough to start the first proof run.',
              '- [ ] Build the first proof: One-page morning brief with what changed, why it matters, and exact follow-up actions.',
              '- [ ] Attach source trace for important claims.',
              '- [ ] Copy buyer reply only after owner review.',
              '- [ ] Keep payment and workspace actions blocked until explicit approval.',
              '',
              '## Guardrails',
              '- No external send without owner approval.',
              '- No connector write without owner approval.',
              '- No payment action without owner approval.',
              '- No private workspace before payment proof.',
              '- Real MRR remains 0 until payment proof is recorded.'
            ].join('\\n'),
            checklist:[
              'Open starter kit and confirm buyer inputs.',
              'Review sample source links and missing source notes.',
              'Draft the one-page morning brief with source trace.',
              'Mark any missing access before asking for approval.',
              'Do not send or change business records without owner approval.'
            ],
            acceptance_tests:[
              'Shows what changed, why it matters, and exact follow-up actions.',
              'Uses only approved sample sources.',
              'Includes source trace for important claims.',
              'Keeps external actions approval-only.'
            ],
            buyer_reply_draft:[
              'Hi there,',
              '',
              'I can start with the Daily Intelligence Brief Agent first proof.',
              '',
              'First proof: One-page morning brief with what changed, why it matters, and exact follow-up actions.',
              '',
              'Please send one approved sample source: a file, screenshot, export, folder link, or email thread that represents the workflow. I will use it only to prepare the first proof and will not send messages, write records, connect accounts, or take payment actions without owner approval.',
              '',
              'Next step: Review source notes, open the starter kit, then produce the one-page brief.',
              '',
              'Swan',
              'SUPERMEGA.dev'
            ].join('\\n'),
            proof_delivery_packet:[
              '# Daily Intelligence Brief Agent first proof',
              '',
              'Status: draft - review before sending',
              'Lead: SAMPLE-SETUP',
              'First proof target: One-page morning brief with what changed, why it matters, and exact follow-up actions.',
              '',
              '## Result',
              '[Paste the first useful output here after reviewing the approved source sample.]',
              '',
              '## Source trace',
              '- Starter kit: /site/agent-templates/daily-intelligence-brief.json',
              '- Lead: SAMPLE-SETUP',
              '',
              '## Acceptance test status',
              '- [ ] Shows what changed, why it matters, and exact follow-up actions.',
              '- [ ] Uses only approved sample sources.',
              '- [ ] Includes source trace for important claims.',
              '- [ ] Keeps external actions approval-only.',
              '',
              '## Approval request',
              'Please confirm whether this first proof matches the workflow. I will not send messages, write records, connect accounts, or take payment actions without owner approval.'
            ].join('\\n'),
            pilot_close_packet:[
              '# Daily Intelligence Brief Agent pilot close packet',
              '',
              'Lead: SAMPLE-SETUP',
              'Pilot offer: turn the approved first proof into a working owner-triggered workflow.',
              'Price hint: 11,000,000 MMK setup',
              '',
              '## Scope',
              '- Build around the approved first proof: One-page morning brief with what changed, why it matters, and exact follow-up actions.',
              '- Use only buyer-approved source samples, connectors, and accounts.',
              '- Keep external sends, production writes, account connections, and payment actions approval-only.',
              '- Deliver a private operator workspace, source trace, and acceptance-test checklist.',
              '',
              '## Buyer approval needed',
              '- Confirm the first proof is useful.',
              '- Confirm source access and approval boundary.',
              '- Confirm pilot scope and price before any paid build starts.',
              '',
              '## Close message',
              'If this first proof is useful, I can turn it into the working Daily Intelligence Brief Agent pilot. The current price hint is 11,000,000 MMK setup. I will keep the first production run approval-only and show source trace for the important outputs.'
            ].join('\\n'),
            pilot_order_room:{
              status:'draft_owner_approval_required',
              payment_state:'payment_proof_required',
              order_state:'order_not_started',
              payment_request_draft:[
                '# Daily Intelligence Brief Agent payment request draft',
                '',
                'Status: draft - owner approval required before sending',
                'Lead: SAMPLE-SETUP',
                'Pilot amount: 11,000,000 MMK setup',
                'Payment route: PAYMENT_LINK_REQUIRED_AFTER_OWNER_APPROVAL',
                '',
                '## Buyer message',
                'Approved scope: turn the first proof into the working Daily Intelligence Brief Agent pilot.',
                'Amount to approve: 11,000,000 MMK setup.',
                'I will start the pilot only after payment route approval and payment proof are attached to the order room.',
                '',
                '## Guardrails',
                '- Do not send this request until owner approves the scope and payment route.',
                '- Do not create a live payment link or checkout session from this packet.',
                '- Do not start the private workspace until payment proof is attached.',
                '- Do not claim real MRR until payment proof is recorded.'
              ].join('\\n'),
              payment_proof_ledger_csv:[
                '"lead_id","template_id","amount_hint","payment_route","payment_status","payment_proof","real_mrr_delta","next_step"',
                '"SAMPLE-SETUP","daily-intelligence-brief","11,000,000 MMK setup","PAYMENT_LINK_REQUIRED_AFTER_OWNER_APPROVAL","payment_proof_required","attach_receipt_or_transfer_reference","0","owner_approval_before_payment_request"'
              ].join('\\n'),
              order_room_ledger_csv:[
                '"lead_id","template_id","order_status","scope_status","payment_status","workspace_status","start_permission","real_mrr_delta","next_step"',
                '"SAMPLE-SETUP","daily-intelligence-brief","order_not_started","scope_approval_required","payment_proof_required","not_created_until_payment_proof","owner_approval_required","0","confirm_scope_price_and_payment_proof"'
              ].join('\\n'),
              pilot_start_checklist:[
                'Buyer confirms the first proof is useful.',
                'Owner confirms pilot scope and MMK price.',
                'Owner approves payment route before any payment request is sent.',
                'Payment proof is attached to the payment-proof ledger.',
                'Private operator workspace is created only after payment proof.',
                'First production run remains approval-only until accepted.'
              ],
              owner_activation_packet:[
                '# Daily Intelligence Brief Agent owner activation packet',
                '',
                'Status: draft - owner approval required',
                'Lead: SAMPLE-SETUP',
                'Pilot amount: 11,000,000 MMK setup',
                'Payment surface: Payment Links first; Checkout Sessions only if app checkout is needed.',
                'Checkout endpoint: /api/checkout-start',
                'Live payment link: PAYMENT_LINK_REQUIRED_AFTER_OWNER_APPROVAL',
                'Real MRR delta: 0 until payment proof is recorded.',
                '',
                '## Owner action queue',
                '1. Approve first proof usefulness and pilot scope.',
                '2. Approve the MMK price and payment route.',
                '3. Create or paste the owner-approved payment link or manual invoice.',
                '4. Send the payment request only after owner approval.',
                '5. Attach receipt, transfer reference, or payment screenshot to the payment-proof ledger.',
                '6. Create the private pilot workspace only after payment proof exists.',
                '7. Run the first production job approval-only until accepted.',
                '',
                '## Stop conditions',
                '- No payment request if scope is not approved.',
                '- No live payment link in this packet.',
                '- No private workspace before payment proof.',
                '- No revenue claim before payment proof.'
              ].join('\\n'),
              owner_action_queue_csv:[
                '"lead_id","action_id","owner_action","approval_state","external_action_state","payment_state","workspace_state","real_mrr_delta","evidence_required"',
                '"SAMPLE-SETUP","approve_scope_price","Approve first proof, pilot scope, MMK price, and payment route","owner_approval_required","not_sent","not_requested","not_created","0","approved_scope_and_price"',
                '"SAMPLE-SETUP","send_payment_request","Send owner-approved payment request","owner_approval_required","not_sent","payment_link_required_after_owner_approval","not_created","0","owner_approved_payment_route"',
                '"SAMPLE-SETUP","attach_payment_proof","Attach payment proof before pilot start","owner_approval_required","not_sent","payment_proof_required","not_created","0","receipt_transfer_reference_or_screenshot"',
                '"SAMPLE-SETUP","start_private_pilot_workspace","Create private pilot workspace and run approval-only first job","owner_approval_required","not_sent","payment_proof_required","not_created_until_payment_proof","0","payment_proof_and_acceptance_checklist"'
              ].join('\\n'),
              activation_summary_json:JSON.stringify({
                status:'owner_activation_ready_draft_only',
                lead_id:'SAMPLE-SETUP',
                template_id:'daily-intelligence-brief',
                price_hint:'11,000,000 MMK setup',
                checkout_endpoint:'/api/checkout-start',
                live_payment_link:'PAYMENT_LINK_REQUIRED_AFTER_OWNER_APPROVAL',
                checkout_session_state:'not_created',
                payment_proof_state:'payment_proof_required',
                private_workspace_state:'not_created_until_payment_proof',
                real_mrr_delta:0,
                guardrails:['owner_approval_before_payment_request','no_live_payment_link_in_packet','no_workspace_before_payment_proof','no_revenue_claim_without_payment_proof']
              },null,2),
              private_workspace_manifest:{
                status:'blocked_until_payment_proof',
                workspace_slug:'pilot-daily-intelligence-brief-sample-setup',
                lead_id:'SAMPLE-SETUP',
                template_id:'daily-intelligence-brief',
                template_name:'Daily Intelligence Brief Agent',
                starter_kit_url:'/site/agent-templates/daily-intelligence-brief.json',
                first_proof_target:'One-page morning brief with what changed, why it matters, and exact follow-up actions.',
                price_hint:'11,000,000 MMK setup',
                create_workspace_allowed:false,
                private_workspace_state:'not_created_until_payment_proof',
                payment_proof_reference:'required_before_workspace',
                first_run_mode:'approval_only',
                real_mrr_delta:0,
                modules:['buyer_goal','approved_sources','source_trace','first_run_queue','approval_log','delivery_packet'],
                first_run_queue:[
                  {step_id:'import_approved_sources',title:'Import only buyer-approved sample sources',owner:'Revenue Pod',external_action_state:'manual_owner_approved',evidence_required:'source_trace'},
                  {step_id:'build_first_production_run',title:'Build the first approval-only Daily Intelligence Brief Agent run',owner:'Delivery Pod',external_action_state:'not_sent',evidence_required:'first_run_output'},
                  {step_id:'owner_acceptance_review',title:'Collect owner acceptance before live connector writes or sends',owner:'Founder',external_action_state:'approval_required',evidence_required:'acceptance_checklist'}
                ],
                guardrails:['create_private_workspace_only_after_payment_proof','first_production_run_is_approval_only','no_connector_writes_without_owner_acceptance','no_real_mrr_claim_without_payment_proof']
              },
              private_workspace_manifest_json:JSON.stringify({
                status:'blocked_until_payment_proof',
                workspace_slug:'pilot-daily-intelligence-brief-sample-setup',
                lead_id:'SAMPLE-SETUP',
                template_id:'daily-intelligence-brief',
                first_run_mode:'approval_only',
                create_workspace_allowed:false,
                real_mrr_delta:0,
                guardrails:['create_private_workspace_only_after_payment_proof','first_production_run_is_approval_only','no_connector_writes_without_owner_acceptance','no_real_mrr_claim_without_payment_proof']
              },null,2),
              private_workspace_handoff_packet:[
                '# Daily Intelligence Brief Agent private pilot workspace',
                '',
                'Status: blocked_until_payment_proof',
                'Workspace slug: pilot-daily-intelligence-brief-sample-setup',
                'Lead: SAMPLE-SETUP',
                'Template: daily-intelligence-brief',
                'First run mode: approval_only',
                'Create workspace allowed: no',
                'Payment proof: required_before_workspace',
                'Real MRR delta: 0',
                '',
                '## Modules',
                '- buyer_goal',
                '- approved_sources',
                '- source_trace',
                '- first_run_queue',
                '- approval_log',
                '- delivery_packet',
                '',
                '## First run queue',
                '- [ ] import_approved_sources: Import only buyer-approved sample sources (manual_owner_approved)',
                '- [ ] build_first_production_run: Build the first approval-only Daily Intelligence Brief Agent run (not_sent)',
                '- [ ] owner_acceptance_review: Collect owner acceptance before live connector writes or sends (approval_required)',
                '',
                '## Guardrails',
                '- create_private_workspace_only_after_payment_proof',
                '- first_production_run_is_approval_only',
                '- no_connector_writes_without_owner_acceptance',
                '- no_real_mrr_claim_without_payment_proof'
              ].join('\\n'),
              first_run_queue_csv:[
                '"workspace_slug","lead_id","step_id","title","owner","external_action_state","evidence_required","real_mrr_delta"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","import_approved_sources","Import only buyer-approved sample sources","Revenue Pod","manual_owner_approved","source_trace","0"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","build_first_production_run","Build the first approval-only Daily Intelligence Brief Agent run","Delivery Pod","not_sent","first_run_output","0"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","owner_acceptance_review","Collect owner acceptance before live connector writes or sends","Founder","approval_required","acceptance_checklist","0"'
              ].join('\\n'),
              customer_success_packet:[
                '# Daily Intelligence Brief Agent 30-day customer success desk',
                '',
                'Status: customer_success_desk_ready',
                'Lead: SAMPLE-SETUP',
                'Workspace: pilot-daily-intelligence-brief-sample-setup',
                'Evidence reference: SAMPLE-CS-REFERENCE',
                'Desk type: managed_ai_agent_customer_success',
                'Support window: business-hours Myanmar time, urgent blockers reviewed same day',
                'Recurring revenue state: not_claimed',
                'Real MRR delta: 0',
                '',
                '## 30-day cadence',
                '- day_1: Confirm the first managed run outcome, source trace, blockers, and owner approval queue.',
                '- day_3: Resolve onboarding friction and record the first buyer-visible value evidence.',
                '- day_7: Review repeated tasks, exception patterns, and support tickets before expanding automation.',
                '- day_14: Prepare the second value proof and decide whether another module is justified.',
                '- day_30: Run renewal review with value ledger, open risks, next-module proposal, and owner decision.',
                '',
                '## Renewal motion',
                '- collect_value_evidence: open',
                '- prepare_30_day_review: open',
                '- confirm_next_module: blocked_until_value_evidence',
                '- decide_retainer: not_requested'
              ].join('\\n'),
              customer_success_ticket_queue_csv:[
                '"workspace_slug","lead_id","ticket_type","owner","state","evidence_required","external_action_state","real_mrr_delta"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","onboarding_blocker","SuperMega operator","watch","client_message_or_failed_step_trace","draft_only","0"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","source_quality_issue","Agent Pod","watch","source_trace_and_missing_field_note","not_external","0"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","user_training_gap","Client operator","watch","screen_recording_or_operator_note","draft_only","0"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","value_exception","Founder","review","buyer_visible_value_note","owner_approval_required","0"'
              ].join('\\n'),
              customer_success_value_ledger_csv:[
                '"workspace_slug","lead_id","value_metric","baseline","current_evidence","owner_confirmed","renewal_note","real_mrr_delta"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","time_saved","unknown_until_client_confirms","timed_workflow_or_operator_note_required","no","prove before renewal","0"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","revenue_influenced","unknown_until_client_confirms","lead_order_or_followup_evidence_required","no","do not claim without buyer evidence","0"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","risk_removed","unknown_until_client_confirms","error_prevented_or_missing_task_closed","no","tie to support ticket","0"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","renewal_reason","not_claimed","30_day_value_review_required","no","decision pending","0"'
              ].join('\\n'),
              customer_success_renewal_queue_csv:[
                '"workspace_slug","lead_id","renewal_step","owner","state","evidence_required","real_mrr_delta"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","collect_value_evidence","SuperMega operator","open","source_traced_value_ledger","0"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","prepare_30_day_review","Revenue Pod","open","client_update_and_open_risk_summary","0"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","confirm_next_module","Founder","blocked_until_value_evidence","buyer_visible_need_and_scope","0"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","decide_retainer","Client owner","not_requested","payment_and_value_evidence_before_claim","0"'
              ].join('\\n'),
              customer_success_client_update:[
                '# Daily Intelligence Brief Agent client update draft',
                '',
                'Status: draft - review before sending',
                'Lead: SAMPLE-SETUP',
                'Workspace: pilot-daily-intelligence-brief-sample-setup',
                'Evidence reference: SAMPLE-CS-REFERENCE',
                '',
                '## What happened',
                '- First managed run is in support mode.',
                '- Open issues are tracked in the customer success ticket queue.',
                '- Value evidence is being recorded before any renewal or upsell claim.',
                '',
                '## What we need from the client',
                '- Confirm whether the latest output was useful.',
                '- Send one example of a missed, slow, or repeated task we should improve.',
                '- Approve any external message, connector write, account action, or next-module change before it happens.'
              ].join('\\n'),
              customer_success_config_json:JSON.stringify({
                status:'customer_success_desk_ready',
                desk_type:'managed_ai_agent_customer_success',
                workspace_slug:'pilot-daily-intelligence-brief-sample-setup',
                lead_id:'SAMPLE-SETUP',
                template_name:'Daily Intelligence Brief Agent',
                cadence_days:['day_1','day_3','day_7','day_14','day_30'],
                ticket_types:['onboarding_blocker','source_quality_issue','user_training_gap','value_exception'],
                renewal_steps:['collect_value_evidence','prepare_30_day_review','confirm_next_module','decide_retainer'],
                external_send_state:'approval_required_per_action',
                connector_write_state:'approval_required_per_action',
                recurring_revenue_state:'not_claimed',
                real_mrr_delta:0
              },null,2),
              retainer_growth_packet:[
                '# Daily Intelligence Brief Agent retainer growth offer',
                '',
                'Status: retainer_growth_offer_ready',
                'Lead: SAMPLE-SETUP',
                'Workspace: pilot-daily-intelligence-brief-sample-setup',
                'Evidence reference: SAMPLE-RETAINER-REFERENCE',
                'Offer type: evidence_gated_retainer_growth',
                'Retainer quote: OWNER_APPROVED_RETAINER_QUOTE_REQUIRED',
                'Recurring revenue state: not_claimed',
                'Real MRR delta: 0',
                '',
                '## Offer options',
                '- managed_support_retainer: weekly support, fixes, source maintenance, and owner reporting',
                '- growth_operator_retainer: recurring agent runs with approval queue and operator review',
                '- next_module_build: new agent module or connector added after value review',
                '',
                '## Decision ledger',
                '- confirm_value_evidence: open / source_traced_value_ledger',
                '- approve_retainer_quote: owner_approval_required / owner_approved_mmk_quote',
                '- attach_payment_proof: payment_proof_required / receipt_transfer_reference_or_checkout_record'
              ].join('\\n'),
              retainer_offer_options_csv:[
                '"workspace_slug","lead_id","option_id","retainer_shape","buyer_value_proof_required","included_work","approval_state","payment_state","real_mrr_delta"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","managed_support_retainer","weekly support, fixes, source maintenance, and owner reporting","confirmed_support_or_time_saved_evidence","support queue review, source trace maintenance, client update draft, monthly value ledger","owner_review_required","not_requested","0"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","growth_operator_retainer","recurring agent runs with approval queue and operator review","buyer_visible_repeated_work_or_revenue_followup_evidence","scheduled agent runs, approval queue, value ledger, renewal review, next-module proposal","owner_review_required","not_requested","0"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","next_module_build","new agent module or connector added after value review","specific_next_module_need_and_source_sample","module blueprint, source manifest, first proof, acceptance tests, delivery pack","scope_review_required","not_requested","0"'
              ].join('\\n'),
              retainer_decision_ledger_csv:[
                '"workspace_slug","lead_id","renewal_action","owner","state","evidence_required","real_mrr_delta"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","confirm_value_evidence","SuperMega operator","open","source_traced_value_ledger","0"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","choose_offer_shape","Founder","blocked_until_value_evidence","client_success_review_note","0"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","approve_retainer_quote","Founder","owner_approval_required","owner_approved_mmk_quote","0"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","send_retainer_offer","Founder","not_sent","owner_approved_client_message","0"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","attach_payment_proof","Revenue Pod","payment_proof_required","receipt_transfer_reference_or_checkout_record","0"'
              ].join('\\n'),
              retainer_next_module_roadmap_csv:[
                '"workspace_slug","lead_id","module_id","trigger","proof_needed","state","real_mrr_delta"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","source_monitor","client confirms repeated source checking work","source list and missed-change example","candidate","0"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","approval_inbox","client has recurring outbound or writeback approvals","sample message or target record","candidate","0"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","reporting_pack","client asks for weekly/monthly owner reporting","report format or decision question","candidate","0"'
              ].join('\\n'),
              retainer_invoice_request_draft:[
                '# Daily Intelligence Brief Agent retainer invoice request draft',
                '',
                'Status: draft - owner approval required before sending',
                'Lead: SAMPLE-SETUP',
                'Workspace: pilot-daily-intelligence-brief-sample-setup',
                'Retainer quote: OWNER_APPROVED_RETAINER_QUOTE_REQUIRED',
                'Payment route: PAYMENT_LINK_REQUIRED_AFTER_OWNER_APPROVAL',
                'Real MRR delta: 0',
                '',
                '## Stop conditions',
                '- Do not send this invoice request without owner approval.',
                '- Do not create a live payment link from this packet.',
                '- Do not claim MRR until payment proof is attached and reconciled.'
              ].join('\\n'),
              retainer_client_email_draft:[
                '# Daily Intelligence Brief Agent retainer offer email draft',
                '',
                'Status: draft - review before sending',
                'Lead: SAMPLE-SETUP',
                'Workspace: pilot-daily-intelligence-brief-sample-setup',
                'Evidence reference: SAMPLE-RETAINER-REFERENCE',
                '',
                'Based on the first support cycle, I can keep this running as a managed AI-agent workcell instead of a one-off build.',
                '',
                'The next step is a short value review: confirm what saved time, reduced risk, or moved revenue, then choose the retainer shape that matches the real workflow.',
                '',
                'I will not send payment requests, connect accounts, write records, or claim recurring revenue without owner approval and payment proof.'
              ].join('\\n'),
              retainer_growth_config_json:JSON.stringify({
                status:'retainer_growth_offer_ready',
                offer_type:'evidence_gated_retainer_growth',
                workspace_slug:'pilot-daily-intelligence-brief-sample-setup',
                lead_id:'SAMPLE-SETUP',
                template_name:'Daily Intelligence Brief Agent',
                retainer_quote:'OWNER_APPROVED_RETAINER_QUOTE_REQUIRED',
                option_ids:['managed_support_retainer','growth_operator_retainer','next_module_build'],
                decision_actions:['confirm_value_evidence','choose_offer_shape','approve_retainer_quote','send_retainer_offer','attach_payment_proof'],
                next_module_candidates:['source_monitor','approval_inbox','reporting_pack'],
                recurring_revenue_state:'not_claimed',
                payment_state:'payment_proof_required_before_mrr',
                real_mrr_delta:0
              },null,2),
              retainer_payment_record:{
                status:'retainer_payment_proof_recorded',
                revenue_event_type:'retainer_payment_proof',
                amount_mmk:900000,
                payment_period:'monthly',
                normalized_mrr_delta_mmk:900000,
                real_mrr_delta:900000,
                payment_state:'payment_proof_attached',
                bank_reconciliation_state:'not_bank_verified'
              },
              retainer_payment_packet:[
                '# Daily Intelligence Brief Agent retainer payment proof record',
                '',
                'Status: retainer_payment_proof_recorded',
                'Lead: SAMPLE-SETUP',
                'Workspace: pilot-daily-intelligence-brief-sample-setup',
                'Amount MMK: 900000',
                'Payment period: monthly',
                'Normalized MRR delta MMK: 900000',
                'Payment proof reference: SAMPLE-PAYMENT-PROOF',
                'Owner approval reference: SAMPLE-OWNER-APPROVAL',
                'Recurring revenue state: payment_proof_recorded',
                'Bank reconciliation state: not_bank_verified'
              ].join('\\n'),
              retainer_payment_ledger_csv:[
                '"workspace_slug","lead_id","template_name","amount_mmk","payment_period","normalized_mrr_delta_mmk","payment_proof_reference","owner_approval_reference","bank_reconciliation_state","recorded_at"',
                '"pilot-daily-intelligence-brief-sample-setup","SAMPLE-SETUP","Daily Intelligence Brief Agent","900000","monthly","900000","SAMPLE-PAYMENT-PROOF","SAMPLE-OWNER-APPROVAL","not_bank_verified","SAMPLE-RECORDED-AT"'
              ].join('\\n'),
              retainer_mrr_summary_json:JSON.stringify({
                status:'retainer_payment_proof_recorded',
                revenue_event_type:'retainer_payment_proof',
                workspace_slug:'pilot-daily-intelligence-brief-sample-setup',
                lead_id:'SAMPLE-SETUP',
                template_name:'Daily Intelligence Brief Agent',
                amount_mmk:900000,
                payment_period:'monthly',
                normalized_mrr_delta_mmk:900000,
                real_mrr_delta:900000,
                recurring_revenue_state:'payment_proof_recorded',
                payment_state:'payment_proof_attached',
                payment_proof_reference:'SAMPLE-PAYMENT-PROOF',
                owner_approval_reference:'SAMPLE-OWNER-APPROVAL',
                bank_reconciliation_state:'not_bank_verified'
              },null,2),
              state:{
                status:'not_persisted',
                scope_approval_state:'pending',
                price_approval_state:'pending',
                payment_route_state:'not_approved',
                payment_request_state:'not_sent',
                payment_proof_state:'payment_proof_required',
                private_workspace_state:'not_created_until_payment_proof',
                real_mrr_delta:0
              }
            },
            approval_required:true,
            human_gate:'owner approval before send/write/payment actions'
          }
        },{
          action_id:'AUTO-SAMPLE-SOURCE',
          lead_id:'SAMPLE-SETUP',
          task_id:'AUTO-SAMPLE-SOURCE',
          action_type:'source_request',
          status:'done',
          priority:'high',
          owner:'Revenue Pod',
          title:'Autopilot draft: source request',
          next_step:'Review the source request packet and send only after owner approval.',
          approval_required:true,
          approval_state:'pending',
          notification_channel:'internal_queue',
          notification_status:'queued',
          autopilot_draft:{
            status:'ready',
            type:'source_request_packet',
            package_name:'Daily Intelligence Brief Agent',
            lead_id:'SAMPLE-SETUP',
            title:'Daily Intelligence Brief Agent source request packet',
            packet:[
              '# Daily Intelligence Brief Agent source request packet',
              '',
              'Status: internal_draft_ready',
              'Lead: SAMPLE-SETUP',
              'Buyer: Sample buyer',
              'Package: Daily Intelligence Brief Agent',
              'External send state: blocked_until_owner_approval',
              'Payment or connector state: blocked_until_owner_approval',
              '',
              '## Source sample to request',
              'Ask for one supplier email thread, shipment sheet, or Viber update sample.',
              '',
              '## Why this source matters',
              'It lets SuperMega prepare the first proof: one owner-ready morning brief with source trace and exact follow-up actions.',
              '',
              '## Draft buyer ask',
              'Please send one current screenshot, sheet, export, file, or thread that shows this workflow. I will use it only to prepare the first proof and will not connect accounts, send messages, write records, or request payment without owner approval.',
              '',
              '## Guardrails',
              '- Internal draft only.',
              '- No external send from the runner.',
              '- No payment request, connector access, or production write.',
              '- Owner approval required before the buyer sees this message.'
            ].join('\\n'),
            source_request:'Ask for one supplier email thread, shipment sheet, or Viber update sample.',
            first_output:'One owner-ready morning brief with source trace and exact follow-up actions.',
            external_action_state:'blocked_until_owner_approval',
            payment_or_connector_state:'blocked_until_owner_approval',
            real_mrr_delta:0,
            approval_required:true,
            sent:false,
            guardrails:['Internal draft only','No external send from the runner','Owner approval before buyer message','No payment or connector access without owner approval'],
            approval:{status:'pending_owner_review',decision:'pending',sent:false,real_mrr_delta:0}
          }
        }]
      };
    }
    function proofList(title, items){
      const values = (items || []).filter(Boolean).slice(0,6);
      if(!values.length)return '';
      return '<div class="operator-proof-section"><span>'+esc(title)+'</span><ul>'+values.map(function(item){return '<li>'+esc(item)+'</li>'}).join('')+'</ul></div>';
    }
    function loadSample(){
      const data = samplePipelineData();
      renderKpis(data); renderBehaviorSummaryBoard(data); renderDatastoreFailoverReport(data); renderActivationCockpit(data); renderAutopilotCommandBoard(data); renderRevenueProofBoard(data); renderActions(data); setStatus({status:'sample_loaded', note:'No lead was created. This is a no-write first-proof demo packet.'});
    }
    function proofStarterLink(proof){
      if(!proof || !proof.starter_kit_url)return '';
      return '<a class="operator-proof-link" href="'+esc(proof.starter_kit_url)+'" target="_blank" rel="noreferrer">Open starter kit</a>';
    }
    function proofIntakeJob(proof, index){
      if(!proof || (!proof.intake_job_packet && !proof.intake_job_json))return '';
      const id = 'intake-job-'+index;
      return '<div class="operator-proof-section"><span>Intake job packet</span><textarea class="operator-reply" id="'+id+'" readonly>'+esc(proof.intake_job_packet || proof.intake_job_json || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+id+'">Copy intake job</button></div>';
    }
    function proofSolutionRoute(proof, index){
      if(!proof || (!proof.solution_route_packet && !proof.solution_route_json))return '';
      const id = 'solution-route-'+index;
      return '<div class="operator-proof-section"><span>Solution route</span><textarea class="operator-reply" id="'+id+'" readonly>'+esc(proof.solution_route_packet || proof.solution_route_json || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+id+'">Copy solution route</button></div>';
    }
    function proofImplementationBlueprint(proof, index){
      if(!proof || (!proof.implementation_blueprint_packet && !proof.implementation_blueprint_json))return '';
      const id = 'implementation-blueprint-'+index;
      return '<div class="operator-proof-section"><span>Implementation blueprint</span><textarea class="operator-reply" id="'+id+'" readonly>'+esc(proof.implementation_blueprint_packet || proof.implementation_blueprint_json || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+id+'">Copy implementation blueprint</button></div>';
    }
    function proofClientKickoff(proof, index){
      if(!proof || (!proof.client_kickoff_packet && !proof.client_kickoff_json))return '';
      const id = 'client-kickoff-'+index;
      return '<div class="operator-proof-section"><span>Client kickoff pack</span><textarea class="operator-reply" id="'+id+'" readonly>'+esc(proof.client_kickoff_packet || proof.client_kickoff_json || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+id+'">Copy kickoff pack</button></div>';
    }
    function proofSourcePackRequest(action, proof, index){
      const request = proof && proof.source_pack_request;
      if(!request && !proof.source_pack_request_packet && !proof.source_pack_request_json)return '';
      const id = 'source-pack-request-'+index;
      const intakeUrl = request && request.intake_url ? request.intake_url : '';
      const packet = proof.source_pack_request_packet || (request && request.client_message) || proof.source_pack_request_json || '';
      const approval = (request && request.approval) || proof.source_pack_request_approval || {};
      const approvalDecision = approval && approval.decision ? approval.decision : 'pending';
      const actionId = (action && action.action_id) || (request && request.action_id) || '';
      const leadId = (action && action.lead_id) || (request && request.lead_id) || '';
      const templateName = (request && request.template_name) || proof.template_name || proof.template_id || '';
      const link = intakeUrl ? '<a class="operator-proof-link" href="'+esc(intakeUrl)+'" target="_blank" rel="noreferrer">Source-pack intake link</a>' : '';
      const approvalButtons = '<div class="operator-row"><button class="btn primary" type="button" data-source-pack-request-decision="approved" data-source-pack-request-target="'+id+'" data-source-pack-request-url="'+esc(intakeUrl)+'" data-source-pack-request-template-name="'+esc(templateName)+'" data-action-id="'+esc(actionId)+'" data-lead-id="'+esc(leadId)+'">Approve source request</button><button class="btn secondary" type="button" data-source-pack-request-decision="changes_requested" data-source-pack-request-target="'+id+'" data-source-pack-request-url="'+esc(intakeUrl)+'" data-source-pack-request-template-name="'+esc(templateName)+'" data-action-id="'+esc(actionId)+'" data-lead-id="'+esc(leadId)+'">Request source changes</button></div>';
      return '<div class="operator-proof-section" data-source-pack-request="client_source_pack_intake"><span>Client source request</span><div class="operator-meta"><span class="operator-chip">3 approved source samples</span><span class="operator-chip">'+esc(request && request.external_action_state || 'blocked_until_owner_approval')+'</span><span class="operator-chip">approval '+esc(approvalDecision)+'</span></div>'+link+'<textarea class="operator-reply" id="'+id+'" readonly>'+esc(packet || proof.source_pack_request_json || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+id+'">Copy source request</button>'+approvalButtons+'</div>';
    }
    function proofReviewRequest(proof, index){
      const request = proof && proof.proof_review_request;
      if(!request && !proof.proof_review_request_packet && !proof.proof_review_request_json)return '';
      const id = 'proof-review-request-'+index;
      const acceptanceId = 'proof-acceptance-json-'+index;
      const reviewUrl = request && request.review_url ? request.review_url : '';
      const packet = proof.proof_review_request_packet || (request && request.client_review_message) || proof.proof_review_request_json || '';
      const link = reviewUrl ? '<a class="operator-proof-link" href="'+esc(reviewUrl)+'" target="_blank" rel="noreferrer">Proof-review link</a>' : '';
      return '<div class="operator-proof-section" data-proof-review-request="client_first_proof_review"><span>Client proof review</span><div class="operator-meta"><span class="operator-chip">ready_for_paid_pilot</span><span class="operator-chip">changes_requested</span><span class="operator-chip">'+esc(request && request.external_action_state || 'blocked_until_owner_approval')+'</span></div>'+link+'<textarea class="operator-reply" id="'+id+'" readonly>'+esc(packet || proof.proof_review_request_json || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+id+'">Copy review request</button><textarea class="operator-reply" id="'+acceptanceId+'" name="proof_acceptance_json" placeholder="Paste Proof acceptance JSON copied from /app/proof-review."></textarea><button class="btn secondary" type="button" data-proof-acceptance-json-command="record_proof_review_acceptance" data-proof-acceptance-json-target="'+acceptanceId+'" data-action-id="'+esc(proof.action_id || request && request.action_id || '')+'" data-lead-id="'+esc(proof.lead_id || request && request.lead_id || '')+'">Import proof acceptance JSON</button></div>';
    }
    function proofBuyerReply(proof, index){
      if(!proof || !proof.buyer_reply_draft)return '';
      const id = 'buyer-reply-'+index;
      return '<div class="operator-proof-section"><span>Buyer reply draft</span><textarea class="operator-reply" id="'+id+'" readonly>'+esc(proof.buyer_reply_draft)+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+id+'">Copy buyer reply</button></div>';
    }
    function proofDeliveryPacket(proof, index){
      if(!proof || !proof.proof_delivery_packet)return '';
      const id = 'proof-delivery-'+index;
      return '<div class="operator-proof-section"><span>Proof delivery packet</span><textarea class="operator-reply" id="'+id+'" readonly>'+esc(proof.proof_delivery_packet)+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+id+'">Copy proof packet</button></div>';
    }
    function pilotClosePacket(proof, index){
      if(!proof || !proof.pilot_close_packet)return '';
      const id = 'pilot-close-'+index;
      return '<div class="operator-proof-section"><span>Pilot close packet</span><textarea class="operator-reply" id="'+id+'" readonly>'+esc(proof.pilot_close_packet)+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+id+'">Copy pilot packet</button></div>';
    }
    function pilotOrderRoom(action, proof, index){
      const room = proof && proof.pilot_order_room;
      if(!room)return '';
      const paymentId = 'payment-request-'+index;
      const paymentLedgerId = 'payment-proof-ledger-'+index;
      const orderLedgerId = 'order-room-ledger-'+index;
      const checklistId = 'pilot-start-checklist-'+index;
      const activationId = 'owner-activation-packet-'+index;
      const actionQueueId = 'owner-action-queue-'+index;
      const activationJsonId = 'activation-summary-'+index;
      const workspaceManifestId = 'workspace-manifest-'+index;
      const workspaceHandoffId = 'workspace-handoff-'+index;
      const firstRunQueueId = 'first-run-queue-'+index;
      const firstRunOutputId = 'first-run-output-'+index;
      const firstRunEvidenceId = 'first-run-evidence-reference-'+index;
      const firstRunSourceTraceId = 'first-run-source-trace-'+index;
      const firstProductionRunId = 'first-production-run-'+index;
      const firstProductionRunLedgerId = 'first-production-run-ledger-'+index;
      const firstRunAcceptanceId = 'first-run-acceptance-'+index;
      const firstRunAcceptanceQueueId = 'first-run-acceptance-queue-'+index;
      const ownerAcceptanceId = 'owner-acceptance-'+index;
      const ownerAcceptanceQueueId = 'owner-acceptance-queue-'+index;
      const connectorPolicyId = 'connector-policy-'+index;
      const connectorPolicyQueueId = 'connector-policy-queue-'+index;
      const connectorPolicyConfigId = 'connector-policy-config-'+index;
      const productionApprovalId = 'production-approval-'+index;
      const productionApprovalQueueId = 'production-approval-queue-'+index;
      const productionApprovalConfigId = 'production-approval-config-'+index;
      const enterpriseDeliveryReferenceId = 'enterprise-delivery-reference-'+index;
      const enterpriseDeliveryId = 'enterprise-delivery-'+index;
      const enterpriseAccessMatrixId = 'enterprise-access-matrix-'+index;
      const enterpriseValueLedgerId = 'enterprise-value-ledger-'+index;
      const enterpriseDeliveryConfigId = 'enterprise-delivery-config-'+index;
      const customerSuccessReferenceId = 'customer-success-reference-'+index;
      const customerSuccessId = 'customer-success-'+index;
      const customerSuccessTicketQueueId = 'customer-success-ticket-queue-'+index;
      const customerSuccessValueLedgerId = 'customer-success-value-ledger-'+index;
      const customerSuccessRenewalQueueId = 'customer-success-renewal-queue-'+index;
      const customerSuccessClientUpdateId = 'customer-success-client-update-'+index;
      const customerSuccessConfigId = 'customer-success-config-'+index;
      const retainerGrowthReferenceId = 'retainer-growth-reference-'+index;
      const retainerGrowthId = 'retainer-growth-'+index;
      const retainerOptionsId = 'retainer-options-'+index;
      const retainerDecisionLedgerId = 'retainer-decision-ledger-'+index;
      const retainerRoadmapId = 'retainer-roadmap-'+index;
      const retainerInvoiceId = 'retainer-invoice-'+index;
      const retainerEmailId = 'retainer-email-'+index;
      const retainerConfigId = 'retainer-config-'+index;
      const retainerPaymentAmountId = 'retainer-payment-amount-'+index;
      const retainerPaymentPeriodId = 'retainer-payment-period-'+index;
      const retainerPaymentOwnerId = 'retainer-payment-owner-'+index;
      const retainerPaymentProofId = 'retainer-payment-proof-'+index;
      const retainerPaymentId = 'retainer-payment-'+index;
      const retainerPaymentLedgerId = 'retainer-payment-ledger-'+index;
      const retainerMrrSummaryId = 'retainer-mrr-summary-'+index;
      const scopeSummaryId = 'approved-scope-summary-'+index;
      const scopePriceId = 'approved-price-mmk-'+index;
      const scopeRouteId = 'approved-payment-route-'+index;
      const scopeReferenceId = 'scope-price-owner-reference-'+index;
      const scopePacketId = 'scope-price-approval-'+index;
      const paymentGateId = 'payment-request-gate-'+index;
      const pilotPaymentAmountId = 'pilot-payment-amount-'+index;
      const pilotPaymentMethodId = 'pilot-payment-method-'+index;
      const pilotPaymentProofId = 'pilot-payment-proof-reference-'+index;
      const pilotPaymentOwnerId = 'pilot-payment-owner-reference-'+index;
      const pilotPaymentPacketId = 'pilot-payment-proof-'+index;
      const pilotPaymentLedgerId = 'pilot-payment-proof-ledger-'+index;
      const pilotPaymentSummaryId = 'pilot-payment-proof-summary-'+index;
      const clientPaymentSubmissionId = 'client-payment-submission-'+index;
      const clientPaymentProofUrlId = 'client-payment-proof-url-'+index;
      const clientPaymentOwnerReferenceId = 'client-payment-owner-reference-'+index;
      const clientFirstRunAcceptanceId = 'client-first-run-acceptance-'+index;
      const ownerAcceptanceReferenceId = 'owner-acceptance-reference-'+index;
      const ownerAcceptanceNoteId = 'owner-acceptance-note-'+index;
      const connectorPolicyReferenceId = 'connector-policy-reference-'+index;
      const connectorPolicyNoteId = 'connector-policy-note-'+index;
      const productionQueueReferenceId = 'production-queue-reference-'+index;
      const state = room.state || {};
      const actionId = action && action.action_id || '';
      const leadId = action && action.lead_id || '';
      const checklist = (room.pilot_start_checklist || []).filter(Boolean).map(function(item){return '- [ ] '+item}).join('\\n');
      const stateChips = '<div class="operator-meta"><span class="operator-chip">'+esc(state.scope_approval_state || 'pending')+'</span><span class="operator-chip">'+esc(state.payment_request_state || 'not_sent')+'</span><span class="operator-chip">'+esc(state.payment_proof_state || 'payment_proof_required')+'</span><span class="operator-chip">'+esc(state.private_workspace_state || 'not_created_until_payment_proof')+'</span><span class="operator-chip">MRR '+esc(state.real_mrr_delta ?? 0)+'</span></div>';
      const stateButtons = '<div class="operator-row"><button class="btn secondary operator-state" type="button" data-state-command="approve_scope" data-action-id="'+esc(actionId)+'" data-lead-id="'+esc(leadId)+'">Save scope approval</button><button class="btn secondary operator-state" type="button" data-state-command="approve_payment_request" data-action-id="'+esc(actionId)+'" data-lead-id="'+esc(leadId)+'">Save payment request approval</button><button class="btn secondary operator-state" type="button" data-state-command="mark_payment_sent" data-action-id="'+esc(actionId)+'" data-lead-id="'+esc(leadId)+'">Save payment request sent</button><button class="btn secondary operator-state" type="button" data-state-command="attach_payment_proof" data-action-id="'+esc(actionId)+'" data-lead-id="'+esc(leadId)+'">Save payment proof</button></div>';
      const workspaceButton = '<div class="operator-row"><button class="btn primary operator-workspace-start" type="button" data-workspace-command="start_private_workspace" data-action-id="'+esc(actionId)+'" data-lead-id="'+esc(leadId)+'">Create private workspace</button></div>';
      const acceptanceButton = '<div class="operator-row"><button class="btn primary operator-acceptance-prepare" type="button" data-acceptance-command="prepare_first_run_acceptance" data-action-id="'+esc(actionId)+'" data-lead-id="'+esc(leadId)+'">Prepare first-run acceptance</button></div>';
      const scopeApproval = room.scope_price_approval || {};
      const paymentGate = room.payment_request_gate || scopeApproval.payment_request_gate || {};
      const pilotPaymentProof = room.pilot_payment_proof || {};
      const clientPaymentSubmission = room.client_pilot_payment_submission || {};
      const firstProductionRun = room.first_production_run || {};
      const clientFirstRunAcceptance = room.client_first_run_acceptance || {};
      const ownerAcceptance = room.owner_acceptance || {};
      const connectorPolicy = room.connector_policy || {};
      const productionQueueState = room.production_approval_queue || {};
      const enterpriseDelivery = room.enterprise_delivery_pack || {};
      const customerSuccessDesk = room.customer_success_desk || {};
      const retainerGrowthOffer = room.retainer_growth_offer || {};
      const retainerPaymentRecord = room.retainer_payment_record || {};
      const scopeControl = '<div class="operator-proof-section operator-scope-price"><span>Approved pilot scope</span><textarea class="operator-reply" id="'+scopeSummaryId+'" name="approved_scope_summary" placeholder="Approved pilot scope after useful first proof.">'+esc(scopeApproval.approved_scope_summary || proof.first_proof_target || '')+'</textarea><div class="operator-row"><input class="operator-input" id="'+scopePriceId+'" name="approved_price_mmk" value="'+esc(scopeApproval.approved_price_mmk || '11000000')+'" aria-label="Approved price MMK" placeholder="Approved price MMK" /><input class="operator-input" id="'+scopeRouteId+'" name="payment_route" value="'+esc(scopeApproval.payment_route || 'manual_invoice_or_payment_link_after_owner_approval')+'" aria-label="Payment route" placeholder="Payment route" /></div><input class="operator-input" id="'+scopeReferenceId+'" name="owner_approval_reference" value="'+esc(scopeApproval.owner_approval_reference || '')+'" aria-label="Owner approval reference" placeholder="Owner approval reference" /><button class="btn primary" type="button" data-scope-price-command="record_scope_price_approval" data-scope-summary-target="'+scopeSummaryId+'" data-scope-price-target="'+scopePriceId+'" data-scope-route-target="'+scopeRouteId+'" data-scope-reference-target="'+scopeReferenceId+'" data-action-id="'+esc(actionId)+'" data-lead-id="'+esc(leadId)+'">Record scope + payment approval</button></div>';
      const pilotPaymentControl = '<div class="operator-proof-section operator-pilot-payment-proof"><span>Pilot payment proof</span><div class="operator-row"><input class="operator-input" id="'+pilotPaymentAmountId+'" name="payment_amount_mmk" value="'+esc(pilotPaymentProof.payment_amount_mmk || scopeApproval.approved_price_mmk || '11000000')+'" aria-label="Payment amount MMK" placeholder="Payment amount MMK" /><input class="operator-input" id="'+pilotPaymentMethodId+'" name="payment_method" value="'+esc(pilotPaymentProof.payment_method || 'manual_invoice_or_payment_link_after_owner_approval')+'" aria-label="Payment method" placeholder="Payment method" /></div><input class="operator-input" id="'+pilotPaymentProofId+'" name="payment_proof_reference" value="'+esc(pilotPaymentProof.payment_proof_reference || '')+'" aria-label="Payment proof reference" placeholder="Payment proof reference" /><input class="operator-input" id="'+pilotPaymentOwnerId+'" name="owner_reconciliation_reference" value="'+esc(pilotPaymentProof.owner_reconciliation_reference || '')+'" aria-label="Owner reconciliation reference" placeholder="Owner reconciliation reference" /><button class="btn primary" type="button" data-pilot-payment-proof-command="record_pilot_payment_proof" data-pilot-payment-amount-target="'+pilotPaymentAmountId+'" data-pilot-payment-method-target="'+pilotPaymentMethodId+'" data-pilot-payment-proof-target="'+pilotPaymentProofId+'" data-pilot-payment-owner-target="'+pilotPaymentOwnerId+'" data-action-id="'+esc(actionId)+'" data-lead-id="'+esc(leadId)+'">Record pilot payment proof</button></div>';
      const firstRunSourceTraceValue = Array.isArray(firstProductionRun.source_trace) ? firstProductionRun.source_trace.join('\\n') : '';
      const firstProductionRunControl = '<div class="operator-proof-section operator-first-production-run"><span>First production run</span><textarea class="operator-reply" id="'+firstRunOutputId+'" name="first_run_output" placeholder="First production run output">'+esc(firstProductionRun.output || '')+'</textarea><input class="operator-input" id="'+firstRunEvidenceId+'" name="first_run_evidence_reference" value="'+esc(firstProductionRun.evidence_reference || '')+'" aria-label="First run evidence reference" placeholder="First run evidence reference" /><textarea class="operator-reply" id="'+firstRunSourceTraceId+'" name="first_run_source_trace" placeholder="Source trace">'+esc(firstRunSourceTraceValue)+'</textarea><button class="btn primary" type="button" data-first-production-run-command="record_first_production_run" data-first-run-output-target="'+firstRunOutputId+'" data-first-run-evidence-target="'+firstRunEvidenceId+'" data-first-run-source-trace-target="'+firstRunSourceTraceId+'" data-action-id="'+esc(actionId)+'" data-lead-id="'+esc(leadId)+'">Record first production run</button></div>';
      const firstProductionRunPacket = room.first_production_run_packet ? '<div class="operator-proof-section"><span>First production run packet</span><textarea class="operator-reply" id="'+firstProductionRunId+'" readonly>'+esc(room.first_production_run_packet || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+firstProductionRunId+'">Copy first production run</button></div>' : '';
      const firstProductionRunLedger = room.first_production_run_ledger_csv ? '<textarea class="operator-reply" id="'+firstProductionRunLedgerId+'" readonly>'+esc(room.first_production_run_ledger_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+firstProductionRunLedgerId+'">Copy first production run ledger</button>' : '';
      const acceptancePacket = room.first_run_acceptance_packet ? '<textarea class="operator-reply" id="'+firstRunAcceptanceId+'" readonly>'+esc(room.first_run_acceptance_packet || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+firstRunAcceptanceId+'">Copy first-run acceptance packet</button>' : '';
      const acceptanceQueue = room.first_run_acceptance_queue_csv ? '<textarea class="operator-reply" id="'+firstRunAcceptanceQueueId+'" readonly>'+esc(room.first_run_acceptance_queue_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+firstRunAcceptanceQueueId+'">Copy first-run acceptance queue</button>' : '';
      const clientFirstRunAcceptanceBlock = clientFirstRunAcceptance.status ? '<div class="operator-proof-section operator-client-first-run-acceptance"><span>Client first-run acceptance</span><div class="operator-meta"><span class="operator-chip">'+esc(clientFirstRunAcceptance.status || 'first_run_acceptance_submitted')+'</span><span class="operator-chip">'+esc(clientFirstRunAcceptance.decision || 'decision_missing')+'</span><span class="operator-chip">'+esc(clientFirstRunAcceptance.next_gate || 'operator_owner_acceptance_record_required')+'</span><span class="operator-chip">MRR '+esc(clientFirstRunAcceptance.real_mrr_delta ?? 0)+'</span></div><textarea class="operator-reply" id="'+clientFirstRunAcceptanceId+'" readonly>'+esc(room.client_first_run_acceptance_json || JSON.stringify(clientFirstRunAcceptance,null,2))+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+clientFirstRunAcceptanceId+'">Copy client first-run acceptance</button></div>' : '';
      const ownerReferenceDefault = ownerAcceptance.evidence_reference || (clientFirstRunAcceptance.recorded_at ? 'client_first_run_acceptance:'+clientFirstRunAcceptance.recorded_at : '');
      const ownerAcceptanceControl = '<div class="operator-proof-section operator-owner-acceptance-control"><span>Owner acceptance evidence</span><div class="operator-meta"><span class="operator-chip">requires first-run acceptance</span><span class="operator-chip">connector writes stay blocked</span><span class="operator-chip">MRR 0</span></div><input class="operator-input" id="'+ownerAcceptanceReferenceId+'" data-owner-acceptance-reference-for="'+esc(actionId)+'" data-owner-acceptance-reference-lead="'+esc(leadId)+'" name="owner_acceptance_reference" value="'+esc(ownerReferenceDefault)+'" aria-label="Owner acceptance evidence reference" placeholder="Owner acceptance evidence reference" /><textarea class="operator-reply" id="'+ownerAcceptanceNoteId+'" data-owner-acceptance-note-for="'+esc(actionId)+'" data-owner-acceptance-note-lead="'+esc(leadId)+'" name="owner_acceptance_note" placeholder="Owner note for acceptance or requested changes">'+esc(ownerAcceptance.owner_note || '')+'</textarea><div class="operator-row"><button class="btn primary operator-owner-acceptance" type="button" data-owner-acceptance="accepted" data-owner-acceptance-reference-target="'+ownerAcceptanceReferenceId+'" data-owner-acceptance-note-target="'+ownerAcceptanceNoteId+'" data-action-id="'+esc(actionId)+'" data-lead-id="'+esc(leadId)+'">Record owner accepted</button><button class="btn secondary operator-owner-acceptance" type="button" data-owner-acceptance="changes_requested" data-owner-acceptance-reference-target="'+ownerAcceptanceReferenceId+'" data-owner-acceptance-note-target="'+ownerAcceptanceNoteId+'" data-action-id="'+esc(actionId)+'" data-lead-id="'+esc(leadId)+'">Record changes requested</button></div></div>';
      const connectorReferenceDefault = connectorPolicy.evidence_reference || (ownerAcceptance.recorded_at ? 'owner_acceptance:'+ownerAcceptance.recorded_at : '');
      const connectorPolicyControl = '<div class="operator-proof-section operator-connector-policy-control"><span>Connector policy evidence</span><div class="operator-meta"><span class="operator-chip">approval_only</span><span class="operator-chip">per-action approval required</span><span class="operator-chip">no autonomous writes</span></div><input class="operator-input" id="'+connectorPolicyReferenceId+'" data-connector-policy-reference-for="'+esc(actionId)+'" data-connector-policy-reference-lead="'+esc(leadId)+'" name="connector_policy_reference" value="'+esc(connectorReferenceDefault)+'" aria-label="Connector policy evidence reference" placeholder="Connector policy evidence reference" /><textarea class="operator-reply" id="'+connectorPolicyNoteId+'" data-connector-policy-note-for="'+esc(actionId)+'" data-connector-policy-note-lead="'+esc(leadId)+'" name="connector_policy_note" placeholder="Owner note for connector policy">'+esc(connectorPolicy.owner_note || 'Approval-only connector policy. Allowed actions: read approved sources, draft next run, queue external sends/writes for owner approval, record source trace.')+'</textarea><button class="btn primary operator-connector-policy" type="button" data-connector-policy="approval_only" data-connector-policy-reference-target="'+connectorPolicyReferenceId+'" data-connector-policy-note-target="'+connectorPolicyNoteId+'" data-action-id="'+esc(actionId)+'" data-lead-id="'+esc(leadId)+'">Record connector policy</button></div>';
      const productionQueueReferenceDefault = productionQueueState.evidence_reference || (connectorPolicy.recorded_at ? 'connector_policy:'+connectorPolicy.recorded_at : '');
      const productionApprovalControl = '<div class="operator-proof-section operator-production-approval-control"><span>Production approval queue evidence</span><input class="operator-input" id="'+productionQueueReferenceId+'" data-production-queue-reference-for="'+esc(actionId)+'" data-production-queue-reference-lead="'+esc(leadId)+'" name="production_queue_reference" value="'+esc(productionQueueReferenceDefault)+'" aria-label="Production queue evidence reference" placeholder="Production queue evidence reference" /><button class="btn primary operator-production-approval" type="button" data-production-approval="prepare_production_approval_queue" data-production-queue-reference-target="'+productionQueueReferenceId+'" data-action-id="'+esc(actionId)+'" data-lead-id="'+esc(leadId)+'">Prepare autopilot approval queue</button></div>';
      const enterpriseReferenceDefault = enterpriseDelivery.evidence_reference || (productionQueueState.recorded_at ? 'production_queue:'+productionQueueState.recorded_at : '');
      const enterpriseDeliveryControl = '<div class="operator-proof-section operator-enterprise-delivery-control"><span>Enterprise delivery evidence</span><input class="operator-input" id="'+enterpriseDeliveryReferenceId+'" name="enterprise_delivery_reference" value="'+esc(enterpriseReferenceDefault)+'" aria-label="Enterprise delivery evidence reference" placeholder="Enterprise delivery evidence reference" /><button class="btn primary operator-enterprise-delivery" type="button" data-enterprise-delivery="prepare_enterprise_delivery_pack" data-enterprise-delivery-reference-target="'+enterpriseDeliveryReferenceId+'" data-action-id="'+esc(actionId)+'" data-lead-id="'+esc(leadId)+'">Prepare enterprise delivery pack</button></div>';
      const customerSuccessReferenceDefault = customerSuccessDesk.evidence_reference || (enterpriseDelivery.recorded_at ? 'enterprise_delivery:'+enterpriseDelivery.recorded_at : '');
      const customerSuccessControl = '<div class="operator-proof-section operator-customer-success-control"><span>Customer success evidence</span><input class="operator-input" id="'+customerSuccessReferenceId+'" name="customer_success_reference" value="'+esc(customerSuccessReferenceDefault)+'" aria-label="Customer success evidence reference" placeholder="Customer success evidence reference" /><button class="btn primary operator-customer-success" type="button" data-customer-success="prepare_customer_success_desk" data-customer-success-reference-target="'+customerSuccessReferenceId+'" data-action-id="'+esc(actionId)+'" data-lead-id="'+esc(leadId)+'">Prepare customer success desk</button></div>';
      const retainerGrowthReferenceDefault = retainerGrowthOffer.evidence_reference || (customerSuccessDesk.recorded_at ? 'customer_success:'+customerSuccessDesk.recorded_at : '');
      const retainerGrowthControl = '<div class="operator-proof-section operator-retainer-growth-control"><span>Retainer growth evidence</span><input class="operator-input" id="'+retainerGrowthReferenceId+'" name="retainer_growth_reference" value="'+esc(retainerGrowthReferenceDefault)+'" aria-label="Retainer growth evidence reference" placeholder="Retainer growth evidence reference" /><button class="btn primary operator-retainer-growth" type="button" data-retainer-growth="prepare_retainer_growth_offer" data-retainer-growth-reference-target="'+retainerGrowthReferenceId+'" data-action-id="'+esc(actionId)+'" data-lead-id="'+esc(leadId)+'">Prepare retainer growth offer</button></div>';
      const retainerPaymentControl = '<div class="operator-proof-section operator-retainer-payment-control"><span>Retainer payment proof</span><div class="operator-row"><input class="operator-input" id="'+retainerPaymentAmountId+'" name="retainer_amount_mmk" value="'+esc(retainerPaymentRecord.amount_mmk || '')+'" aria-label="Retainer amount MMK" placeholder="Retainer amount MMK" /><select class="operator-input" id="'+retainerPaymentPeriodId+'" name="retainer_payment_period" aria-label="Retainer payment period"><option value="monthly">monthly</option><option value="quarterly">quarterly</option><option value="annual">annual</option><option value="one_time_retainer">one_time_retainer</option></select></div><input class="operator-input" id="'+retainerPaymentOwnerId+'" name="retainer_owner_approval_reference" value="'+esc(retainerPaymentRecord.owner_approval_reference || '')+'" aria-label="Owner approval reference" placeholder="Owner approval reference" /><input class="operator-input" id="'+retainerPaymentProofId+'" name="retainer_payment_proof_reference" value="'+esc(retainerPaymentRecord.payment_proof_reference || '')+'" aria-label="Retainer payment proof reference" placeholder="Retainer payment proof reference" /><button class="btn primary operator-retainer-payment" type="button" data-retainer-payment="record_retainer_payment_proof" data-retainer-payment-amount-target="'+retainerPaymentAmountId+'" data-retainer-payment-period-target="'+retainerPaymentPeriodId+'" data-retainer-payment-owner-target="'+retainerPaymentOwnerId+'" data-retainer-payment-proof-target="'+retainerPaymentProofId+'" data-action-id="'+esc(actionId)+'" data-lead-id="'+esc(leadId)+'">Record retainer payment proof</button></div>';
      const ownerPacket = room.owner_acceptance_packet ? '<textarea class="operator-reply" id="'+ownerAcceptanceId+'" readonly>'+esc(room.owner_acceptance_packet || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+ownerAcceptanceId+'">Copy owner acceptance record</button>' : '';
      const ownerQueue = room.owner_acceptance_queue_csv ? '<textarea class="operator-reply" id="'+ownerAcceptanceQueueId+'" readonly>'+esc(room.owner_acceptance_queue_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+ownerAcceptanceQueueId+'">Copy owner acceptance queue</button>' : '';
      const connectorPacket = room.connector_policy_packet ? '<textarea class="operator-reply" id="'+connectorPolicyId+'" readonly>'+esc(room.connector_policy_packet || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+connectorPolicyId+'">Copy connector policy</button>' : '';
      const connectorQueue = room.connector_policy_queue_csv ? '<textarea class="operator-reply" id="'+connectorPolicyQueueId+'" readonly>'+esc(room.connector_policy_queue_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+connectorPolicyQueueId+'">Copy connector policy queue</button>' : '';
      const connectorConfig = room.connector_policy_config_json ? '<textarea class="operator-reply" id="'+connectorPolicyConfigId+'" readonly>'+esc(room.connector_policy_config_json || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+connectorPolicyConfigId+'">Copy connector policy config</button>' : '';
      const productionPacket = room.production_approval_packet ? '<textarea class="operator-reply" id="'+productionApprovalId+'" readonly>'+esc(room.production_approval_packet || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+productionApprovalId+'">Copy autopilot approval packet</button>' : '';
      const productionQueueCsv = room.production_approval_queue_csv ? '<textarea class="operator-reply" id="'+productionApprovalQueueId+'" readonly>'+esc(room.production_approval_queue_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+productionApprovalQueueId+'">Copy autopilot approval queue</button>' : '';
      const productionConfig = room.production_approval_config_json ? '<textarea class="operator-reply" id="'+productionApprovalConfigId+'" readonly>'+esc(room.production_approval_config_json || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+productionApprovalConfigId+'">Copy autopilot approval config</button>' : '';
      const enterprisePacket = room.enterprise_delivery_packet ? '<textarea class="operator-reply" id="'+enterpriseDeliveryId+'" readonly>'+esc(room.enterprise_delivery_packet || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+enterpriseDeliveryId+'">Copy enterprise delivery pack</button>' : '';
      const enterpriseAccess = room.enterprise_access_matrix_csv ? '<textarea class="operator-reply" id="'+enterpriseAccessMatrixId+'" readonly>'+esc(room.enterprise_access_matrix_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+enterpriseAccessMatrixId+'">Copy enterprise access matrix</button>' : '';
      const enterpriseValue = room.enterprise_value_ledger_csv ? '<textarea class="operator-reply" id="'+enterpriseValueLedgerId+'" readonly>'+esc(room.enterprise_value_ledger_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+enterpriseValueLedgerId+'">Copy enterprise value ledger</button>' : '';
      const enterpriseConfig = room.enterprise_delivery_config_json ? '<textarea class="operator-reply" id="'+enterpriseDeliveryConfigId+'" readonly>'+esc(room.enterprise_delivery_config_json || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+enterpriseDeliveryConfigId+'">Copy enterprise delivery config</button>' : '';
      const customerSuccessPacket = room.customer_success_packet ? '<textarea class="operator-reply" id="'+customerSuccessId+'" readonly>'+esc(room.customer_success_packet || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+customerSuccessId+'">Copy customer success desk</button>' : '';
      const customerSuccessTickets = room.customer_success_ticket_queue_csv ? '<textarea class="operator-reply" id="'+customerSuccessTicketQueueId+'" readonly>'+esc(room.customer_success_ticket_queue_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+customerSuccessTicketQueueId+'">Copy support ticket queue</button>' : '';
      const customerSuccessValue = room.customer_success_value_ledger_csv ? '<textarea class="operator-reply" id="'+customerSuccessValueLedgerId+'" readonly>'+esc(room.customer_success_value_ledger_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+customerSuccessValueLedgerId+'">Copy customer value ledger</button>' : '';
      const customerSuccessRenewal = room.customer_success_renewal_queue_csv ? '<textarea class="operator-reply" id="'+customerSuccessRenewalQueueId+'" readonly>'+esc(room.customer_success_renewal_queue_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+customerSuccessRenewalQueueId+'">Copy renewal queue</button>' : '';
      const customerSuccessClientUpdate = room.customer_success_client_update ? '<textarea class="operator-reply" id="'+customerSuccessClientUpdateId+'" readonly>'+esc(room.customer_success_client_update || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+customerSuccessClientUpdateId+'">Copy client update draft</button>' : '';
      const customerSuccessConfig = room.customer_success_config_json ? '<textarea class="operator-reply" id="'+customerSuccessConfigId+'" readonly>'+esc(room.customer_success_config_json || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+customerSuccessConfigId+'">Copy customer success config</button>' : '';
      const retainerPacket = room.retainer_growth_packet ? '<textarea class="operator-reply" id="'+retainerGrowthId+'" readonly>'+esc(room.retainer_growth_packet || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+retainerGrowthId+'">Copy retainer growth offer</button>' : '';
      const retainerOptions = room.retainer_offer_options_csv ? '<textarea class="operator-reply" id="'+retainerOptionsId+'" readonly>'+esc(room.retainer_offer_options_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+retainerOptionsId+'">Copy retainer options</button>' : '';
      const retainerDecisionLedger = room.retainer_decision_ledger_csv ? '<textarea class="operator-reply" id="'+retainerDecisionLedgerId+'" readonly>'+esc(room.retainer_decision_ledger_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+retainerDecisionLedgerId+'">Copy retainer decision ledger</button>' : '';
      const retainerRoadmap = room.retainer_next_module_roadmap_csv ? '<textarea class="operator-reply" id="'+retainerRoadmapId+'" readonly>'+esc(room.retainer_next_module_roadmap_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+retainerRoadmapId+'">Copy next module roadmap</button>' : '';
      const retainerInvoice = room.retainer_invoice_request_draft ? '<textarea class="operator-reply" id="'+retainerInvoiceId+'" readonly>'+esc(room.retainer_invoice_request_draft || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+retainerInvoiceId+'">Copy retainer invoice draft</button>' : '';
      const retainerEmail = room.retainer_client_email_draft ? '<textarea class="operator-reply" id="'+retainerEmailId+'" readonly>'+esc(room.retainer_client_email_draft || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+retainerEmailId+'">Copy retainer email draft</button>' : '';
      const retainerConfig = room.retainer_growth_config_json ? '<textarea class="operator-reply" id="'+retainerConfigId+'" readonly>'+esc(room.retainer_growth_config_json || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+retainerConfigId+'">Copy retainer config</button>' : '';
      const retainerPaymentPacket = room.retainer_payment_packet ? '<textarea class="operator-reply" id="'+retainerPaymentId+'" readonly>'+esc(room.retainer_payment_packet || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+retainerPaymentId+'">Copy retainer payment record</button>' : '';
      const retainerPaymentLedger = room.retainer_payment_ledger_csv ? '<textarea class="operator-reply" id="'+retainerPaymentLedgerId+'" readonly>'+esc(room.retainer_payment_ledger_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+retainerPaymentLedgerId+'">Copy retainer payment ledger</button>' : '';
      const retainerMrrSummary = room.retainer_mrr_summary_json ? '<textarea class="operator-reply" id="'+retainerMrrSummaryId+'" readonly>'+esc(room.retainer_mrr_summary_json || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+retainerMrrSummaryId+'">Copy MRR summary</button>' : '';
      const scopePacket = room.scope_price_approval_packet ? '<div class="operator-proof-section"><span>Scope + price approval packet</span><textarea class="operator-reply" id="'+scopePacketId+'" readonly>'+esc(room.scope_price_approval_packet || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+scopePacketId+'">Copy scope approval</button></div>' : '';
      const paymentGatePacket = room.payment_request_gate_packet || paymentGate.packet ? '<div class="operator-proof-section"><span>Payment request gate</span><textarea class="operator-reply" id="'+paymentGateId+'" readonly>'+esc(room.payment_request_gate_packet || paymentGate.packet || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+paymentGateId+'">Copy payment request gate</button></div>' : '';
      const pilotPaymentPacket = room.pilot_payment_proof_packet ? '<div class="operator-proof-section"><span>Pilot payment proof record</span><textarea class="operator-reply" id="'+pilotPaymentPacketId+'" readonly>'+esc(room.pilot_payment_proof_packet || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+pilotPaymentPacketId+'">Copy pilot payment proof</button></div>' : '';
      const pilotPaymentLedger = room.pilot_payment_proof_ledger_csv ? '<textarea class="operator-reply" id="'+pilotPaymentLedgerId+'" readonly>'+esc(room.pilot_payment_proof_ledger_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+pilotPaymentLedgerId+'">Copy pilot payment ledger</button>' : '';
      const pilotPaymentSummary = room.pilot_payment_summary_json ? '<textarea class="operator-reply" id="'+pilotPaymentSummaryId+'" readonly>'+esc(room.pilot_payment_summary_json || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+pilotPaymentSummaryId+'">Copy pilot payment summary</button>' : '';
      const clientPaymentProofUrlBlock = room.client_payment_proof_url ? '<div class="operator-proof-section"><span>Client payment proof link</span><textarea class="operator-reply" id="'+clientPaymentProofUrlId+'" readonly>'+esc(room.client_payment_proof_url || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+clientPaymentProofUrlId+'">Copy client payment link</button></div>' : '';
      const clientPaymentSubmissionBlock = clientPaymentSubmission.status ? '<div class="operator-proof-section"><span>Client payment proof submission</span><div class="operator-meta"><span class="operator-chip">'+esc(clientPaymentSubmission.status || 'client_pilot_payment_submitted')+'</span><span class="operator-chip">'+esc(clientPaymentSubmission.payment_proof_state || 'client_submitted_owner_review_required')+'</span><span class="operator-chip">MRR '+esc(clientPaymentSubmission.real_mrr_delta ?? 0)+'</span></div><textarea class="operator-reply" id="'+clientPaymentSubmissionId+'" readonly>'+esc(room.client_pilot_payment_submission_json || JSON.stringify(clientPaymentSubmission,null,2))+'</textarea><input class="operator-input" id="'+clientPaymentOwnerReferenceId+'" name="client_payment_owner_reference" value="" aria-label="Owner reconciliation reference" placeholder="Owner reconciliation reference" /><div class="operator-row"><button class="btn primary" type="button" data-client-payment-reconcile="reconcile_client_payment_submission" data-client-payment-owner-target="'+clientPaymentOwnerReferenceId+'" data-action-id="'+esc(actionId)+'" data-lead-id="'+esc(leadId)+'">Reconcile client payment + create workspace</button><button class="btn secondary operator-copy" type="button" data-copy-target="'+clientPaymentSubmissionId+'">Copy client payment proof</button></div></div>' : '';
      return '<div class="operator-proof-section operator-order-room"><span>Paid pilot order room</span><div class="operator-meta"><span class="operator-chip">'+esc(room.status || 'draft_owner_approval_required')+'</span><span class="operator-chip">'+esc(room.payment_state || 'payment_proof_required')+'</span><span class="operator-chip">'+esc(room.order_state || 'order_not_started')+'</span></div>'+stateChips+scopeControl+pilotPaymentControl+stateButtons+workspaceButton+firstProductionRunControl+acceptanceButton+clientFirstRunAcceptanceBlock+ownerAcceptanceControl+connectorPolicyControl+productionApprovalControl+enterpriseDeliveryControl+customerSuccessControl+retainerGrowthControl+retainerPaymentControl+scopePacket+paymentGatePacket+clientPaymentProofUrlBlock+clientPaymentSubmissionBlock+pilotPaymentPacket+pilotPaymentLedger+pilotPaymentSummary+firstProductionRunPacket+firstProductionRunLedger+'<textarea class="operator-reply" id="'+paymentId+'" readonly>'+esc(room.payment_request_draft || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+paymentId+'">Copy payment request</button><textarea class="operator-reply" id="'+paymentLedgerId+'" readonly>'+esc(room.payment_proof_ledger_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+paymentLedgerId+'">Copy payment ledger</button><textarea class="operator-reply" id="'+orderLedgerId+'" readonly>'+esc(room.order_room_ledger_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+orderLedgerId+'">Copy order ledger</button><textarea class="operator-reply" id="'+checklistId+'" readonly>'+esc(checklist)+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+checklistId+'">Copy pilot start checklist</button><textarea class="operator-reply" id="'+activationId+'" readonly>'+esc(room.owner_activation_packet || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+activationId+'">Copy owner activation packet</button><textarea class="operator-reply" id="'+actionQueueId+'" readonly>'+esc(room.owner_action_queue_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+actionQueueId+'">Copy owner action queue</button><textarea class="operator-reply" id="'+activationJsonId+'" readonly>'+esc(room.activation_summary_json || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+activationJsonId+'">Copy activation JSON</button><textarea class="operator-reply" id="'+workspaceManifestId+'" readonly>'+esc(room.private_workspace_manifest_json || JSON.stringify(room.private_workspace_manifest || {},null,2))+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+workspaceManifestId+'">Copy workspace manifest</button><textarea class="operator-reply" id="'+workspaceHandoffId+'" readonly>'+esc(room.private_workspace_handoff_packet || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+workspaceHandoffId+'">Copy workspace handoff</button><textarea class="operator-reply" id="'+firstRunQueueId+'" readonly>'+esc(room.first_run_queue_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+firstRunQueueId+'">Copy first run queue</button>'+acceptancePacket+acceptanceQueue+ownerPacket+ownerQueue+connectorPacket+connectorQueue+connectorConfig+productionPacket+productionQueueCsv+productionConfig+enterprisePacket+enterpriseAccess+enterpriseValue+enterpriseConfig+customerSuccessPacket+customerSuccessTickets+customerSuccessValue+customerSuccessRenewal+customerSuccessClientUpdate+customerSuccessConfig+retainerPacket+retainerOptions+retainerDecisionLedger+retainerRoadmap+retainerInvoice+retainerEmail+retainerConfig+retainerPaymentPacket+retainerPaymentLedger+retainerMrrSummary+'</div>';
    }
    function legacyCopy(el){
      el.focus();
      el.select();
      const ok = document.execCommand('copy');
      if(window.getSelection) window.getSelection().removeAllRanges();
      return ok;
    }
    async function copyDraft(id){
      const el = document.getElementById(id);
      if(!el)return;
      const value = el.value || el.textContent || '';
      try{
        if(navigator.clipboard && window.isSecureContext){await navigator.clipboard.writeText(value);}
        else if(!legacyCopy(el)){throw new Error('legacy_copy_failed');}
        setStatus({status:'copied', target:id, note:'Text copied. Review before sending.'});
      }catch(error){
        try{
          if(legacyCopy(el)){setStatus({status:'copied', target:id, note:'Text copied. Review before sending.'});return;}
        }catch(fallbackError){}
        setStatus({status:'copy_failed', target:id, reason:String(error.message||error)});
      }
    }
    function statePatch(command){
      const patches = {
        approve_scope:{scope_approval_state:'approved',price_approval_state:'approved'},
        approve_payment_request:{scope_approval_state:'approved',price_approval_state:'approved',payment_route_state:'approved',payment_request_state:'approved_to_send'},
        mark_payment_sent:{scope_approval_state:'approved',price_approval_state:'approved',payment_route_state:'approved',payment_request_state:'sent'},
        attach_payment_proof:{scope_approval_state:'approved',price_approval_state:'approved',payment_route_state:'approved',payment_request_state:'sent',payment_proof_state:'proof_attached',private_workspace_state:'ready_after_payment_proof',payment_proof_reference:'OWNER_PROOF_REFERENCE_REQUIRED'}
      };
      return patches[command] || {};
    }
    function fieldByTargetOrAction(button,targetAttr,actionAttr,leadAttr){
      const target = button.getAttribute(targetAttr || '') || '';
      if(target){
        const direct = document.getElementById(target);
        if(direct)return direct;
      }
      const actionId = button.getAttribute('data-action-id') || '';
      const leadId = button.getAttribute('data-lead-id') || '';
      const candidates = Array.prototype.slice.call(document.querySelectorAll('['+actionAttr+']'));
      return candidates.find(function(field){
        return (actionId && field.getAttribute(actionAttr) === actionId) || (leadId && field.getAttribute(leadAttr) === leadId);
      }) || null;
    }
    function fieldText(field){
      return field ? String(field.value || field.textContent || '').trim() : '';
    }
    function activationSessionPayload(){
      const payload = { operation:'start_activation_session' };
      if(!activationSessionEl)return payload;
      activationSessionEl.querySelectorAll('[data-activation-session-field]').forEach(function(field){
        const key = field.getAttribute('data-activation-session-field');
        payload[key] = field.value || '';
      });
      payload.automation_boundary = 'No external send, connector write, browser/mobile action, payment request, or revenue claim without owner approval.';
      payload.source_category = 'operator_approved_sample';
      payload.product_area = 'AI agent workcell';
      return payload;
    }
    async function startActivationSession(){
      if(!token()){setStatus('Paste the ops key first.');return}
      const payload = activationSessionPayload();
      if(!(payload.company || '').trim()){setStatus('Add a company or buyer first.');return}
      if(!(payload.first_proof_target || '').trim()){setStatus('Add the first proof target first.');return}
      setStatus({status:'starting_activation_session', note:'Creating approval-gated first-proof action. Real MRR stays 0 until payment proof.'});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    async function persistOrderRoomState(button){
      if(!token()){setStatus('Paste the ops key first.');return}
      const command = button.getAttribute('data-state-command') || '';
      const payload = Object.assign({
        operation:'update_order_room',
        action_id:button.getAttribute('data-action-id') || '',
        lead_id:button.getAttribute('data-lead-id') || ''
      },statePatch(command));
      setStatus({status:'saving_order_room_state', command});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    async function recordScopePriceApproval(button){
      if(!token()){setStatus('Paste the ops key first.');return}
      const scopeEl = document.getElementById(button.getAttribute('data-scope-summary-target') || '');
      const priceEl = document.getElementById(button.getAttribute('data-scope-price-target') || '');
      const routeEl = document.getElementById(button.getAttribute('data-scope-route-target') || '');
      const referenceEl = document.getElementById(button.getAttribute('data-scope-reference-target') || '');
      const approvedScope = scopeEl ? scopeEl.value.trim() : '';
      const approvedPrice = priceEl ? priceEl.value.trim() : '';
      const paymentRoute = routeEl ? routeEl.value.trim() : '';
      const ownerReference = referenceEl ? referenceEl.value.trim() : '';
      if(!approvedPrice){setStatus({status:'error',reason:'scope_price_amount_required'});return}
      if(!ownerReference){setStatus({status:'error',reason:'scope_price_approval_reference_required'});return}
      const payload = {
        operation:'record_scope_price_approval',
        action_id:button.getAttribute('data-action-id') || '',
        lead_id:button.getAttribute('data-lead-id') || '',
        approved_scope_summary:approvedScope,
        approved_price_mmk:approvedPrice,
        payment_route:paymentRoute || 'manual_invoice_or_payment_link_after_owner_approval',
        deposit_terms:'50_percent_to_start',
        owner_approval_reference:ownerReference
      };
      setStatus({status:'recording_scope_price_approval', note:'Approving payment request gate. MRR remains 0 until payment proof.'});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    async function recordPilotPaymentProof(button){
      if(!token()){setStatus('Paste the ops key first.');return}
      const amountEl = document.getElementById(button.getAttribute('data-pilot-payment-amount-target') || '');
      const methodEl = document.getElementById(button.getAttribute('data-pilot-payment-method-target') || '');
      const proofEl = document.getElementById(button.getAttribute('data-pilot-payment-proof-target') || '');
      const ownerEl = document.getElementById(button.getAttribute('data-pilot-payment-owner-target') || '');
      const amount = amountEl ? amountEl.value.trim() : '';
      const method = methodEl ? methodEl.value.trim() : '';
      const proofReference = proofEl ? proofEl.value.trim() : '';
      const ownerReference = ownerEl ? ownerEl.value.trim() : '';
      if(!amount){setStatus({status:'error',reason:'pilot_payment_amount_required'});return}
      if(!proofReference){setStatus({status:'error',reason:'pilot_payment_proof_reference_required'});return}
      if(!ownerReference){setStatus({status:'error',reason:'pilot_payment_owner_reference_required'});return}
      const payload = {
        operation:'record_pilot_payment_proof',
        action_id:button.getAttribute('data-action-id') || '',
        lead_id:button.getAttribute('data-lead-id') || '',
        payment_amount_mmk:amount,
        payment_method:method || 'manual_payment',
        payment_proof_reference:proofReference,
        owner_reconciliation_reference:ownerReference
      };
      setStatus({status:'recording_pilot_payment_proof', note:'Attaching setup payment proof. Workspace can start after this; MRR remains 0.'});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    async function reconcileClientPaymentSubmission(button){
      if(!token()){setStatus('Paste the ops key first.');return}
      const ownerEl = document.getElementById(button.getAttribute('data-client-payment-owner-target') || '');
      const ownerReference = ownerEl ? ownerEl.value.trim() : '';
      if(!ownerReference){setStatus({status:'error',reason:'client_payment_owner_reference_required'});return}
      const payload = {
        operation:'reconcile_client_payment_submission',
        action_id:button.getAttribute('data-action-id') || '',
        lead_id:button.getAttribute('data-lead-id') || '',
        owner_reconciliation_reference:ownerReference,
        create_workspace:true
      };
      setStatus({status:'reconciling_client_payment_submission'});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    async function startPrivateWorkspace(button){
      if(!token()){setStatus('Paste the ops key first.');return}
      const payload = {
        operation:'start_private_workspace',
        action_id:button.getAttribute('data-action-id') || '',
        lead_id:button.getAttribute('data-lead-id') || ''
      };
      setStatus({status:'starting_private_workspace'});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    async function recordFirstProductionRun(button){
      if(!token()){setStatus('Paste the ops key first.');return}
      const outputEl = document.getElementById(button.getAttribute('data-first-run-output-target') || '');
      const evidenceEl = document.getElementById(button.getAttribute('data-first-run-evidence-target') || '');
      const sourceTraceEl = document.getElementById(button.getAttribute('data-first-run-source-trace-target') || '');
      const firstRunOutput = outputEl ? outputEl.value.trim() : '';
      const evidenceReference = evidenceEl ? evidenceEl.value.trim() : '';
      const sourceTrace = sourceTraceEl ? sourceTraceEl.value.split(/\\r?\\n/).map(function(item){return item.trim()}).filter(Boolean) : [];
      if(!firstRunOutput){setStatus({status:'error',reason:'first_run_output_required'});return}
      if(!evidenceReference){setStatus({status:'error',reason:'first_run_evidence_reference_required'});return}
      const payload = {
        operation:'record_first_production_run',
        action_id:button.getAttribute('data-action-id') || '',
        lead_id:button.getAttribute('data-lead-id') || '',
        first_run_output:firstRunOutput,
        first_run_evidence_reference:evidenceReference,
        source_trace:sourceTrace
      };
      setStatus({status:'recording_first_production_run', note:'First run stays approval-only until owner acceptance.'});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    async function prepareFirstRunAcceptance(button){
      if(!token()){setStatus('Paste the ops key first.');return}
      const payload = {
        operation:'prepare_first_run_acceptance',
        action_id:button.getAttribute('data-action-id') || '',
        lead_id:button.getAttribute('data-lead-id') || ''
      };
      setStatus({status:'preparing_first_run_acceptance'});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    async function recordOwnerAcceptance(button){
      if(!token()){setStatus('Paste the ops key first.');return}
      const decision = button.getAttribute('data-owner-acceptance') || '';
      const referenceEl = fieldByTargetOrAction(button,'data-owner-acceptance-reference-target','data-owner-acceptance-reference-for','data-owner-acceptance-reference-lead');
      const noteEl = fieldByTargetOrAction(button,'data-owner-acceptance-note-target','data-owner-acceptance-note-for','data-owner-acceptance-note-lead');
      const reference = fieldText(referenceEl);
      const ownerNote = fieldText(noteEl);
      if(!reference){setStatus({status:'error',reason:'owner_acceptance_reference_required'});return}
      const payload = {
        operation:'record_owner_acceptance',
        action_id:button.getAttribute('data-action-id') || '',
        lead_id:button.getAttribute('data-lead-id') || '',
        owner_acceptance_decision:decision,
        owner_acceptance_reference:reference,
        owner_note:ownerNote
      };
      setStatus({status:'recording_owner_acceptance', decision});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    async function recordConnectorPolicy(button){
      if(!token()){setStatus('Paste the ops key first.');return}
      const mode = button.getAttribute('data-connector-policy') || 'approval_only';
      const referenceEl = fieldByTargetOrAction(button,'data-connector-policy-reference-target','data-connector-policy-reference-for','data-connector-policy-reference-lead');
      const noteEl = fieldByTargetOrAction(button,'data-connector-policy-note-target','data-connector-policy-note-for','data-connector-policy-note-lead');
      const reference = fieldText(referenceEl);
      const ownerNote = fieldText(noteEl);
      if(!reference){setStatus({status:'error',reason:'connector_policy_reference_required'});return}
      const payload = {
        operation:'record_connector_policy',
        action_id:button.getAttribute('data-action-id') || '',
        lead_id:button.getAttribute('data-lead-id') || '',
        connector_policy_mode:mode,
        connector_policy_reference:reference,
        allowed_connector_actions:[
          'read_approved_sources',
          'draft_next_run',
          'queue_external_send_for_owner_approval',
          'queue_connector_write_for_owner_approval',
          'record_source_trace'
        ],
        owner_note:ownerNote
      };
      setStatus({status:'recording_connector_policy', mode});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    async function prepareProductionApprovalQueue(button){
      if(!token()){setStatus('Paste the ops key first.');return}
      const referenceEl = fieldByTargetOrAction(button,'data-production-queue-reference-target','data-production-queue-reference-for','data-production-queue-reference-lead');
      const reference = fieldText(referenceEl);
      if(!reference){setStatus({status:'error',reason:'production_queue_reference_required'});return}
      const payload = {
        operation:'prepare_production_approval_queue',
        action_id:button.getAttribute('data-action-id') || '',
        lead_id:button.getAttribute('data-lead-id') || '',
        production_queue_reference:reference
      };
      setStatus({status:'preparing_autopilot_approval_queue'});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    async function prepareEnterpriseDeliveryPack(button){
      if(!token()){setStatus('Paste the ops key first.');return}
      const referenceEl = document.getElementById(button.getAttribute('data-enterprise-delivery-reference-target') || '');
      const reference = referenceEl ? referenceEl.value.trim() : '';
      if(!reference){setStatus({status:'error',reason:'enterprise_delivery_reference_required'});return}
      const payload = {
        operation:'prepare_enterprise_delivery_pack',
        action_id:button.getAttribute('data-action-id') || '',
        lead_id:button.getAttribute('data-lead-id') || '',
        enterprise_delivery_reference:reference
      };
      setStatus({status:'preparing_enterprise_delivery_pack'});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    async function prepareCustomerSuccessDesk(button){
      if(!token()){setStatus('Paste the ops key first.');return}
      const referenceEl = document.getElementById(button.getAttribute('data-customer-success-reference-target') || '');
      const reference = referenceEl ? referenceEl.value.trim() : '';
      if(!reference){setStatus({status:'error',reason:'customer_success_reference_required'});return}
      const payload = {
        operation:'prepare_customer_success_desk',
        action_id:button.getAttribute('data-action-id') || '',
        lead_id:button.getAttribute('data-lead-id') || '',
        customer_success_reference:reference
      };
      setStatus({status:'preparing_customer_success_desk'});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    async function prepareRetainerGrowthOffer(button){
      if(!token()){setStatus('Paste the ops key first.');return}
      const referenceEl = document.getElementById(button.getAttribute('data-retainer-growth-reference-target') || '');
      const reference = referenceEl ? referenceEl.value.trim() : '';
      if(!reference){setStatus({status:'error',reason:'retainer_growth_reference_required'});return}
      const payload = {
        operation:'prepare_retainer_growth_offer',
        action_id:button.getAttribute('data-action-id') || '',
        lead_id:button.getAttribute('data-lead-id') || '',
        retainer_growth_reference:reference
      };
      setStatus({status:'preparing_retainer_growth_offer'});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    async function recordRetainerPaymentProof(button){
      if(!token()){setStatus('Paste the ops key first.');return}
      const amountEl = document.getElementById(button.getAttribute('data-retainer-payment-amount-target') || '');
      const periodEl = document.getElementById(button.getAttribute('data-retainer-payment-period-target') || '');
      const ownerEl = document.getElementById(button.getAttribute('data-retainer-payment-owner-target') || '');
      const proofEl = document.getElementById(button.getAttribute('data-retainer-payment-proof-target') || '');
      const amount = amountEl ? amountEl.value.trim() : '';
      const period = periodEl ? periodEl.value.trim() : 'monthly';
      const ownerReference = ownerEl ? ownerEl.value.trim() : '';
      const paymentReference = proofEl ? proofEl.value.trim() : '';
      if(!amount){setStatus({status:'error',reason:'retainer_payment_amount_required'});return}
      if(!ownerReference){setStatus({status:'error',reason:'retainer_payment_owner_reference_required'});return}
      if(!paymentReference){setStatus({status:'error',reason:'retainer_payment_proof_reference_required'});return}
      const payload = {
        operation:'record_retainer_payment_proof',
        action_id:button.getAttribute('data-action-id') || '',
        lead_id:button.getAttribute('data-lead-id') || '',
        amount_mmk:amount,
        payment_period:period || 'monthly',
        owner_approval_reference:ownerReference,
        payment_proof_reference:paymentReference
      };
      setStatus({status:'recording_retainer_payment_proof'});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    async function recordAutopilotDraftApproval(button){
      if(!token()){setStatus('Paste the ops key first.');return}
      const decision = button.getAttribute('data-autopilot-draft-decision') || '';
      const draftRoot = button.closest ? button.closest('.operator-sales-draft') : null;
      const draftBody = draftRoot ? draftRoot.querySelector('textarea.operator-reply') : null;
      const reference = window.prompt(decision === 'approved' ? 'Owner approval reference for this draft' : 'Change request reference for this draft');
      if(!reference || !reference.trim()){setStatus('Paste autopilot draft approval reference first.');return}
      const note = window.prompt('Operator note (optional)','') || '';
      const payload = {
        operation:'record_autopilot_draft_approval',
        action_id:button.getAttribute('data-action-id') || '',
        lead_id:button.getAttribute('data-lead-id') || '',
        autopilot_draft_type:button.getAttribute('data-autopilot-draft-type') || '',
        package_name:button.getAttribute('data-autopilot-package-name') || '',
        title:button.getAttribute('data-autopilot-draft-title') || '',
        autopilot_draft_packet:draftBody ? draftBody.value : '',
        autopilot_draft_decision:decision,
        autopilot_draft_reference:reference.trim(),
        operator_note:note.trim()
      };
      setStatus({status:'recording_autopilot_draft_approval', decision});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    async function recordSourcePackRequestDecision(button){
      if(!token()){setStatus('Paste the ops key first.');return}
      const decision = button.getAttribute('data-source-pack-request-decision') || '';
      const packetEl = document.getElementById(button.getAttribute('data-source-pack-request-target') || '');
      const reference = window.prompt(decision === 'approved' ? 'Owner approval reference for this source request' : 'Change request reference for this source request');
      if(!reference || !reference.trim()){setStatus('Paste source request approval reference first.');return}
      const note = window.prompt('Operator note (optional)','') || '';
      const payload = {
        operation:'record_source_pack_request_approval',
        action_id:button.getAttribute('data-action-id') || '',
        lead_id:button.getAttribute('data-lead-id') || '',
        source_pack_request_decision:decision,
        source_pack_request_reference:reference.trim(),
        source_pack_request_packet:packetEl ? packetEl.value : '',
        source_pack_request_url:button.getAttribute('data-source-pack-request-url') || '',
        source_pack_request_template_name:button.getAttribute('data-source-pack-request-template-name') || '',
        operator_note:note.trim()
      };
      setStatus({status:'recording_source_pack_request_approval', decision});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    function formatMmk(value){
      const amount = Number(value || 0);
      if(!Number.isFinite(amount))return '0 MMK';
      return amount.toLocaleString('en-US')+' MMK';
    }
    function renderBehaviorSummaryBoard(data){
      const summary = data.behavior_summary || {};
      if(!summary.status){
        behaviorBoardEl.innerHTML = '<span>Behavior summary</span><div>No behavior summary loaded. Refresh with the ops key to see first-party worker signals.</div>';
        return;
      }
      const eventCounts = Array.isArray(summary.event_counts) ? summary.event_counts.slice(0,5) : [];
      const topTemplates = Array.isArray(summary.top_templates) ? summary.top_templates.slice(0,5) : [];
      const adaptations = Array.isArray(summary.adaptation_queue) ? summary.adaptation_queue.slice(0,5) : [];
      const sellableTools = Array.isArray(summary.sellable_tool_recommendations) ? summary.sellable_tool_recommendations.slice(0,5) : [];
      const userSegments = Array.isArray(summary.user_adaptation_segments) ? summary.user_adaptation_segments.slice(0,6) : [];
      const recent = Array.isArray(summary.recent_events) ? summary.recent_events.slice(0,4) : [];
      const topHtml = topTemplates.length ? '<div class="operator-proof-section"><span>Top templates</span><ul>'+topTemplates.map(function(item){return '<li><strong>'+esc(item.template_id || 'unknown-template')+'</strong> - '+esc(item.count || 0)+' events, '+esc(item.setup_starts || 0)+' setup starts, '+esc(item.lead_form_submits || 0)+' lead forms</li>'}).join('')+'</ul></div>' : '<div class="operator-proof-section"><span>Top templates</span><div>No template-level signals yet.</div></div>';
      const eventHtml = eventCounts.length ? '<div class="operator-proof-section"><span>Event mix</span><ul>'+eventCounts.map(function(item){return '<li>'+esc(item.event_type || 'unknown')+': '+esc(item.count || 0)+'</li>'}).join('')+'</ul></div>' : '';
      const adaptationHtml = adaptations.length ? '<div class="operator-proof-section"><span>Adaptation queue</span><ul>'+adaptations.map(function(item){return '<li><strong>'+esc(item.priority || 'medium')+'</strong> '+esc(item.signal || 'signal')+' '+(item.template_id ? '('+esc(item.template_id)+') ' : '')+'- '+esc(item.recommended_next_step || '')+'</li>'}).join('')+'</ul></div>' : '';
      const sellableHtml = sellableTools.length ? '<div class="operator-proof-section"><span>Sellable tools to push</span><ul>'+sellableTools.map(function(item){var ladder=item.entitlement_ladder||{};return '<li><strong>'+esc(item.tool_name || item.template_id || 'AI worker')+'</strong> - '+esc(item.buyer || 'target buyer')+'<br><small>Next entitlement: '+esc(item.next_entitlement_offer || 'free_core')+'</small><br><small>Free: '+esc(ladder.free_core || item.free_core_tool || '')+' | Paid pilot: '+esc(ladder.paid_pilot || '')+' | Premium: '+esc(ladder.premium_maintained || item.premium_upgrade || '')+'</small><br><small>Gated hands: '+esc(ladder.gated_hands || 'owner-approved computer-use or mobile actions only')+'</small><br><small>Proof: '+esc(item.proof_metric || '')+'</small><br><small>Next: '+esc(item.recommended_sales_motion || '')+'</small></li>'}).join('')+'</ul></div>' : '';
      const segmentHtml = userSegments.length ? '<div class="operator-proof-section"><span>User adaptation segments</span><ul>'+userSegments.map(function(item){return '<li><strong>'+esc(item.user_device_mode || 'device_unknown')+' / '+esc(item.user_role_mode || 'role_unknown')+'</strong> - '+esc(item.visitor_stage || 'stage_unknown')+' · '+esc(item.event_count || 0)+' signals<br><small>UI: '+esc(item.recommended_ui_adaptation || '')+'</small><br><small>Sales: '+esc(item.recommended_sales_adaptation || '')+'</small></li>'}).join('')+'</ul></div>' : '';
      const recentHtml = recent.length ? '<div class="operator-proof-section"><span>Recent signals</span><ul>'+recent.map(function(item){return '<li>'+esc(item.event_type || 'event')+' '+(item.template_id ? esc(item.template_id)+' ' : '')+esc(item.page_path || '')+'</li>'}).join('')+'</ul></div>' : '';
      behaviorBoardEl.innerHTML = [
        '<span>Behavior summary</span>',
        '<div class="operator-meta"><span class="operator-chip">'+esc(summary.status || 'unknown')+'</span><span class="operator-chip">'+esc(summary.source || 'unknown_source')+'</span><span class="operator-chip">'+esc(summary.privacy || 'operator_summary')+'</span></div>',
        '<div class="operator-signal-grid"><div class="operator-signal-cell"><strong>'+esc(summary.events_24h || 0)+'</strong><span>signals 24h</span></div><div class="operator-signal-cell"><strong>'+esc(summary.events_7d || 0)+'</strong><span>signals 7d</span></div><div class="operator-signal-cell"><strong>'+esc(topTemplates.length)+'</strong><span>workers with intent</span></div></div>',
        summary.reason ? '<div class="operator-proof-section"><span>Summary state</span><div>'+esc(summary.reason)+'</div></div>' : '',
        topHtml,
        eventHtml,
        sellableHtml,
        segmentHtml,
        adaptationHtml,
        recentHtml
      ].join('');
    }
    function renderDatastoreFailoverReport(data){
      const report = data.datastore_failover_report || {};
      if(!report.report_type && !report.status){
        failoverReportEl.innerHTML = '<span>Datastore failover report</span><div>No failover report loaded.</div>';
        return;
      }
      const primary = report.primary || {};
      const fallback = report.fallback || {};
      const safeActions = (report.safe_actions || []).slice(0,6);
      const blockedActions = (report.blocked_actions || []).slice(0,6);
      failoverReportEl.innerHTML = [
        '<span>Datastore failover report</span>',
        '<div class="operator-meta"><span class="operator-chip">'+esc(report.status || 'unknown')+'</span><span class="operator-chip">'+esc(report.operator_mode || 'manual_review_required')+'</span><span class="operator-chip">primary '+esc(primary.adapter || primary.provider || 'unknown')+' '+esc(primary.status || 'unknown')+'</span><span class="operator-chip">fallback '+esc(fallback.adapter || fallback.provider || 'unknown')+' '+esc(fallback.status || 'unknown')+'</span><span class="operator-chip">'+esc(report.client_onboarding_allowed ? 'client onboarding allowed' : 'client onboarding blocked')+'</span><span class="operator-chip">'+esc(report.real_mrr_policy || 'zero_until_payment_proof')+'</span></div>',
        '<div>'+esc(data.operator_runtime_summary || 'Runtime summary unavailable.')+'</div>',
        safeActions.length ? '<div class="operator-proof-section"><span>Safe autopilot actions</span><ul>'+safeActions.map(function(item){return '<li>'+esc(item)+'</li>'}).join('')+'</ul></div>' : '',
        blockedActions.length ? '<div class="operator-proof-section"><span>Blocked until owner proof</span><ul>'+blockedActions.map(function(item){return '<li>'+esc(item)+'</li>'}).join('')+'</ul></div>' : '',
        report.next_fix ? '<div class="operator-proof-section"><span>Next infrastructure fix</span><div>'+esc(report.next_fix)+'</div></div>' : ''
      ].join('');
    }
    function activationTargetAction(data){
      const actions = Array.isArray(data.recent_actions) ? data.recent_actions : Array.isArray(data.actions) ? data.actions : [];
      return actions.find(function(action){return action && action.first_proof && action.first_proof.pilot_order_room}) || actions.find(function(action){return action && action.first_proof}) || actions[0] || null;
    }
    function activationStepState(action){
      const proof = action && action.first_proof || {};
      const room = proof.pilot_order_room || {};
      const state = room.state || {};
      const manifest = room.private_workspace_manifest || {};
      const hasScope = state.scope_approval_state === 'approved' && state.price_approval_state === 'approved';
      const hasPaymentRequest = state.payment_request_state === 'approved_to_send' || state.payment_request_state === 'sent';
      const hasPaymentProof = state.payment_proof_state === 'proof_attached' || state.private_workspace_state === 'ready_after_payment_proof' || state.private_workspace_state === 'created_after_payment_proof';
      const hasWorkspace = Boolean(manifest.workspace_created || manifest.status === 'private_workspace_created' || state.private_workspace_state === 'created_after_payment_proof');
      const hasFirstProductionRun = Boolean(room.first_production_run_packet || room.first_production_run_ledger_csv);
      const hasFirstRunAcceptance = Boolean(room.first_run_acceptance_packet || room.first_run_acceptance_queue_csv);
      const hasOwnerAcceptance = Boolean(room.owner_acceptance_packet || room.owner_acceptance_queue_csv);
      const hasConnectorPolicy = Boolean(room.connector_policy_packet || room.connector_policy_config_json);
      const hasProductionQueue = Boolean(room.production_approval_packet || room.production_approval_queue_csv);
      const hasEnterprisePack = Boolean(room.enterprise_delivery_packet || room.enterprise_delivery_config_json);
      const hasCustomerSuccess = Boolean(room.customer_success_packet || room.customer_success_config_json);
      const hasRetainerOffer = Boolean(room.retainer_growth_packet || room.retainer_growth_config_json);
      const hasRetainerPayment = Boolean(room.retainer_payment_packet || room.retainer_mrr_summary_json);
      const proofReady = proof.status === 'operator_brief_ready' || proof.status === 'ready' || Boolean(proof.proof_delivery_packet);
      const steps = [
        { id:'first_proof_gate', title:'First proof', status:proof.status || 'not_loaded', done:proofReady, command:'', button:'' },
        { id:'scope_price_gate', title:'Scope + price', status:hasScope ? 'approved' : 'owner_approval_required', done:hasScope, command:'approve_scope', button:'Save scope approval' },
        { id:'payment_request_gate', title:'Payment request', status:hasPaymentRequest ? state.payment_request_state : 'approval_required', done:hasPaymentRequest, command:'approve_payment_request', button:'Approve payment request' },
        { id:'payment_proof_gate', title:'Payment proof', status:hasPaymentProof ? 'proof_attached' : 'payment_proof_required', done:hasPaymentProof, command:'attach_payment_proof', button:'Attach payment proof' },
        { id:'workspace_start_gate', title:'Workspace start', status:hasWorkspace ? 'workspace_created' : 'blocked_until_payment_proof', done:hasWorkspace, command:'start_private_workspace', button:'Create workspace' },
        { id:'first_production_run_gate', title:'First production run', status:hasFirstProductionRun ? 'run_recorded' : 'approval_only_output_needed', done:hasFirstProductionRun, command:'record_first_production_run', button:'Record first run' },
        { id:'first_run_acceptance_gate', title:'First-run acceptance', status:hasFirstRunAcceptance ? 'acceptance_packet_ready' : 'approval_only_first_run', done:hasFirstRunAcceptance, command:'prepare_first_run_acceptance', button:'Prepare acceptance' },
        { id:'owner_acceptance_gate', title:'Owner acceptance', status:hasOwnerAcceptance ? 'recorded' : 'owner_decision_required', done:hasOwnerAcceptance, command:'record_owner_acceptance', button:'Record accepted' },
        { id:'connector_policy_gate', title:'Connector policy', status:hasConnectorPolicy ? 'approval_only_policy_ready' : 'writes_blocked', done:hasConnectorPolicy, command:'record_connector_policy', button:'Record policy' },
        { id:'production_approval_gate', title:'Production queue', status:hasProductionQueue ? 'queue_ready' : 'approval_queue_needed', done:hasProductionQueue, command:'prepare_production_approval_queue', button:'Prepare queue' },
        { id:'enterprise_delivery_gate', title:'Enterprise delivery', status:hasEnterprisePack ? 'delivery_pack_ready' : 'pack_needed', done:hasEnterprisePack, command:'prepare_enterprise_delivery_pack', button:'Prepare pack' },
        { id:'customer_success_gate', title:'Customer success', status:hasCustomerSuccess ? 'desk_ready' : 'desk_needed', done:hasCustomerSuccess, command:'prepare_customer_success_desk', button:'Prepare CS desk' },
        { id:'retainer_gate', title:'Retainer offer', status:hasRetainerOffer ? 'offer_ready' : 'value_evidence_required', done:hasRetainerOffer, command:'prepare_retainer_growth_offer', button:'Prepare retainer' },
        { id:'retainer_payment_gate', title:'Retainer payment', status:hasRetainerPayment ? 'payment_recorded' : 'zero_until_payment_proof', done:hasRetainerPayment, command:'record_retainer_payment_proof', button:'Record retainer payment' }
      ];
      const nextIndex = steps.findIndex(function(step){return !step.done && step.command});
      return { proof, room, state, manifest, steps: steps.map(function(step,index){return Object.assign({},step,{is_next:index === nextIndex})}) };
    }
    function renderActivationCockpit(data){
      const action = activationTargetAction(data);
      const report = data.datastore_failover_report || {};
      if(!action){
        activationCockpitEl.innerHTML = '<span>Activation cockpit</span><div>No paid-pilot action loaded.</div>';
        return;
      }
      const state = activationStepState(action);
      const steps = state.steps;
      const completed = steps.filter(function(step){return step.done}).length;
      const actionId = action.action_id || '';
      const leadId = action.lead_id || '';
      const templateName = state.proof.template_name || action.title || 'paid pilot';
      const stepCards = steps.map(function(step){
        const classes = 'operator-activation-step '+(step.done ? 'is-done' : step.is_next ? 'is-next' : '');
        const button = step.command ? '<button class="btn secondary operator-activation-action" type="button" data-activation-command="'+esc(step.command)+'" data-action-id="'+esc(actionId)+'" data-lead-id="'+esc(leadId)+'">'+esc(step.button)+'</button>' : '';
        return '<article class="'+classes+'" data-activation-step="'+esc(step.id)+'"><strong>'+esc(step.title)+'</strong><div class="operator-meta"><span class="operator-chip">'+esc(step.id)+'</span><span class="operator-chip">'+esc(step.done ? 'done' : step.is_next ? 'next' : 'waiting')+'</span></div><div>'+esc(step.status)+'</div>'+button+'</article>';
      }).join('');
      activationCockpitEl.innerHTML = [
        '<span>Activation cockpit</span>',
        '<div class="operator-meta"><span class="operator-chip">'+esc(leadId || 'lead_missing')+'</span><span class="operator-chip">'+esc(actionId || 'action_missing')+'</span><span class="operator-chip">'+esc(completed)+'/'+esc(steps.length)+' gates</span><span class="operator-chip">'+esc(report.client_onboarding_allowed ? 'client onboarding allowed' : 'client onboarding blocked')+'</span><span class="operator-chip">'+esc(report.operator_mode || 'operator_mode_unknown')+'</span></div>',
        '<div><strong>One-click activation runbook</strong>: '+esc(templateName)+' moves through these gates in order. Real MRR stays 0 until payment proof is recorded and bank verification remains separate.</div>',
        '<div class="operator-activation-grid">'+stepCards+'</div>'
      ].join('');
      activationCockpitEl.querySelectorAll('[data-activation-command]').forEach(function(button){button.addEventListener('click',function(){runActivationStep(button)})});
    }
    function runActivationStep(button){
      const command = button.getAttribute('data-activation-command') || '';
      const stateCommands = ['approve_scope','approve_payment_request','attach_payment_proof'];
      if(stateCommands.includes(command)){
        button.setAttribute('data-state-command',command);
        persistOrderRoomState(button);
        return;
      }
      if(command === 'start_private_workspace'){startPrivateWorkspace(button);return}
      if(command === 'record_first_production_run'){recordFirstProductionRun(button);return}
      if(command === 'prepare_first_run_acceptance'){prepareFirstRunAcceptance(button);return}
      if(command === 'record_owner_acceptance'){button.setAttribute('data-owner-acceptance','accepted');recordOwnerAcceptance(button);return}
      if(command === 'record_connector_policy'){button.setAttribute('data-connector-policy','approval_only');recordConnectorPolicy(button);return}
      if(command === 'prepare_production_approval_queue'){prepareProductionApprovalQueue(button);return}
      if(command === 'prepare_enterprise_delivery_pack'){prepareEnterpriseDeliveryPack(button);return}
      if(command === 'prepare_customer_success_desk'){prepareCustomerSuccessDesk(button);return}
      if(command === 'prepare_retainer_growth_offer'){prepareRetainerGrowthOffer(button);return}
      if(command === 'record_retainer_payment_proof'){recordRetainerPaymentProof(button);return}
      setStatus({status:'activation_step_unsupported', activation_step:command});
    }
    function renderAutopilotCommandBoard(data){
      const board = data.autopilot_command_board || {};
      const ledger = data.approval_ledger || {};
      const blobQueue = data.blob_action_queue || {};
      if(!board.status){
        commandBoardEl.innerHTML = '<span>Autopilot command board</span><div>No command queue loaded.</div>';
        return;
      }
      const commands = (board.commands || []).slice(0,5);
      const commandList = commands.length ? '<ul>'+commands.map(function(command){return '<li><strong>'+esc(command.priority || 'medium')+'</strong> '+esc(command.lane || 'operator_review')+' - '+esc(command.title || '')+'<br><span>'+esc(command.suggested_action || '')+'</span></li>'}).join('')+'</ul>' : '<div>No commands ready.</div>';
      const ledgerRecent = (ledger.recent || []).slice(0,3);
      const ledgerList = ledgerRecent.length ? '<ul>'+ledgerRecent.map(function(item){return '<li><strong>'+esc(item.decision || item.status || 'record')+'</strong> '+esc(item.title || item.package_name || item.action_id || item.lead_id || '')+'<br><span>'+esc(item.recorded_at || item.approval_reference || '')+'</span></li>'}).join('')+'</ul>' : '<div>No approval ledger records loaded.</div>';
      commandBoardEl.innerHTML = [
        '<span>Autopilot command board</span>',
        '<div class="operator-meta"><span class="operator-chip">'+esc(board.status || 'ready')+'</span><span class="operator-chip">'+esc(board.mode || 'approval_gated_autopilot')+'</span><span class="operator-chip">commands '+esc(board.command_count ?? commands.length)+'</span><span class="operator-chip">internal '+esc(board.internal_autorun_count ?? 0)+'</span><span class="operator-chip">owner gates '+esc(board.owner_approval_count ?? 0)+'</span><span class="operator-chip">action queue '+esc(blobQueue.status || blobQueue.adapter || 'primary_db')+'</span><span class="operator-chip">approval ledger '+esc(ledger.status || 'not_configured')+'</span></div>',
        '<div class="operator-proof-section"><span>Top money commands</span>'+commandList+'</div>',
        '<div class="operator-proof-section" id="approval-ledger"><span>Approval fallback ledger</span><div class="operator-meta"><span class="operator-chip">'+esc(ledger.adapter || 'vercel_blob')+'</span><span class="operator-chip">'+esc(ledger.access || 'private')+'</span><span class="operator-chip">'+esc(ledger.sdk || ledger.reason || 'status')+'</span></div>'+ledgerList+'</div>',
        '<div class="operator-proof-section"><span>Autopilot command queue</span><textarea class="operator-reply" id="autopilot-command-queue" readonly>'+esc(board.command_queue_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="autopilot-command-queue">Copy autopilot command queue</button></div>',
        '<div class="operator-proof-section"><span>Autopilot daily brief</span><textarea class="operator-reply" id="autopilot-daily-brief" readonly>'+esc(board.operator_brief_markdown || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="autopilot-daily-brief">Copy autopilot daily brief</button></div>'
      ].join('');
      commandBoardEl.querySelectorAll('[data-copy-target]').forEach(function(button){button.addEventListener('click',function(){copyDraft(button.getAttribute('data-copy-target'))})});
    }
    function renderRevenueProofBoard(data){
      const board = data.revenue_proof_board || {};
      if(!board.status){
        revenueBoardEl.innerHTML = '<span>Revenue proof board</span><div>No proof-backed MRR records loaded.</div>';
        return;
      }
      const stageCounts = board.stage_counts || {};
      const stageText = Object.keys(stageCounts).length ? Object.keys(stageCounts).map(function(key){return key+': '+stageCounts[key]}).join(' / ') : 'no action stages';
      const guardrails = (board.guardrails || []).slice(0,4);
      revenueBoardEl.innerHTML = [
        '<span>Revenue proof board</span>',
        '<div class="operator-meta"><span class="operator-chip">'+esc(board.status || 'ready')+'</span><span class="operator-chip">'+esc(board.board_type || 'revenue_proof_board')+'</span><span class="operator-chip">'+esc(stageText)+'</span></div>',
        '<div class="operator-money-grid">',
          '<div class="operator-money-cell"><span>Proof-backed MRR</span><strong>'+esc(formatMmk(board.proof_backed_mrr_mmk))+'</strong></div>',
          '<div class="operator-money-cell"><span>Bank verified</span><strong>'+esc(formatMmk(board.bank_verified_mrr_mmk))+'</strong></div>',
          '<div class="operator-money-cell"><span>Needs bank check</span><strong>'+esc(formatMmk(board.bank_unverified_mrr_mmk))+'</strong></div>',
        '</div>',
        '<div class="operator-proof-section"><span>Revenue payment ledger</span><textarea class="operator-reply" id="revenue-payment-ledger" readonly>'+esc(board.payment_ledger_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="revenue-payment-ledger">Copy revenue payment ledger</button></div>',
        '<div class="operator-proof-section"><span>Next cash actions</span><textarea class="operator-reply" id="revenue-next-cash-actions" readonly>'+esc(board.next_cash_actions_csv || '')+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="revenue-next-cash-actions">Copy next cash actions</button></div>',
        guardrails.length ? '<div class="operator-proof-section"><span>Guardrails</span><ul>'+guardrails.map(function(item){return '<li>'+esc(item)+'</li>'}).join('')+'</ul></div>' : ''
      ].join('');
      revenueBoardEl.querySelectorAll('[data-copy-target]').forEach(function(button){button.addEventListener('click',function(){copyDraft(button.getAttribute('data-copy-target'))})});
    }
    function renderKpis(data){
      const metrics = data.metrics || {};
      const board = data.revenue_proof_board || {};
      const commandBoard = data.autopilot_command_board || {};
      kpisEl.innerHTML = [
        ['Open actions', metrics.open_action_count ?? data.approval_inbox?.pending_count ?? '-'],
        ['Recent leads', metrics.recent_lead_count ?? '-'],
        ['Recent actions', metrics.recent_action_count ?? '-'],
        ['Proof MRR', formatMmk(metrics.proof_backed_mrr_mmk ?? board.proof_backed_mrr_mmk ?? 0)],
        ['Commands', metrics.autopilot_command_count ?? commandBoard.command_count ?? 0],
      ].map(function(row){return '<div class="operator-kpi"><span>'+esc(row[0])+'</span><strong>'+esc(row[1])+'</strong></div>'}).join('');
    }
    function salesAutopilotDraft(action,index){
      const draft = action && action.autopilot_draft;
      if(!draft || !draft.type)return '';
      const id = 'sales-autopilot-draft-'+index;
      const body = draft.packet || draft.body || '';
      const guardrails = (draft.guardrails || []).slice(0,4);
      const approval = draft.approval || {};
      const subject = draft.subject ? '<div class="operator-proof-section"><span>Subject</span><div>'+esc(draft.subject)+'</div></div>' : '';
      const approvalText = approval.decision && approval.decision !== 'pending' ? '<div class="operator-proof-section"><span>Approval record</span><div>'+esc(approval.decision)+' / '+esc(approval.approval_reference || approval.status || '')+'</div></div>' : '';
      const draftAttrs = ' data-autopilot-draft-type="'+esc(draft.type || '')+'" data-autopilot-package-name="'+esc(draft.package_name || '')+'" data-autopilot-draft-title="'+esc(draft.title || draft.package_name || action.title || '')+'"';
      const approvalButtons = '<div class="operator-row"><button class="btn primary operator-autopilot-approval" type="button" data-autopilot-draft-decision="approved" data-action-id="'+esc(action.action_id || '')+'" data-lead-id="'+esc(action.lead_id || '')+'"'+draftAttrs+'>Approve autopilot draft</button><button class="btn secondary operator-autopilot-approval" type="button" data-autopilot-draft-decision="changes_requested" data-action-id="'+esc(action.action_id || '')+'" data-lead-id="'+esc(action.lead_id || '')+'"'+draftAttrs+'>Request draft changes</button></div>';
      return [
        '<div class="operator-proof operator-sales-draft">',
          '<strong>Autopilot draft artifact</strong>',
          '<div class="operator-meta"><span class="operator-chip">'+esc(draft.type)+'</span><span class="operator-chip">'+esc(draft.external_action_state || 'blocked_until_owner_approval')+'</span><span class="operator-chip">'+esc(draft.payment_or_connector_state || 'blocked_until_owner_approval')+'</span><span class="operator-chip">approval '+esc(approval.decision || 'pending')+'</span><span class="operator-chip">sent '+esc(draft.sent === true ? 'yes' : 'no')+'</span><span class="operator-chip">MRR '+esc(draft.real_mrr_delta ?? 0)+'</span></div>',
          '<div>'+esc(draft.package_name || draft.title || action.title || '')+'</div>',
          subject,
          approvalText,
          body ? '<div class="operator-proof-section"><span>Draft body</span><textarea class="operator-reply" id="'+id+'" readonly>'+esc(body)+'</textarea><button class="btn secondary operator-copy" type="button" data-copy-target="'+id+'">Copy autopilot draft</button></div>' : '',
          approvalButtons,
          guardrails.length ? '<div class="operator-proof-section"><span>Guardrails</span><ul>'+guardrails.map(function(item){return '<li>'+esc(item)+'</li>'}).join('')+'</ul></div>' : '',
        '</div>'
      ].join('');
    }
    function sourcePackControl(action,index){
      if(!action || !action.first_proof)return '';
      const packNameId = 'activation-source-pack-name-'+index;
      const sourceTypeId = 'activation-source-pack-type-'+index;
      const sourceRefId = 'activation-source-pack-reference-'+index;
      const sourceContentId = 'activation-source-pack-content-'+index;
      const sourceJsonId = 'activation-source-pack-json-'+index;
      const proof = action.first_proof || {};
      const pack = proof.activation_source_pack || action.activation_source_pack || action.source_pack || (action.result && action.result.activation_source_pack) || {};
      const clientSubmission = proof.client_source_pack_submission || {};
      const clientSubmissionJson = proof.client_source_pack_submission_json || (clientSubmission && clientSubmission.source_count ? JSON.stringify(clientSubmission, null, 2) : '');
      const packStatus = pack && pack.source_count ? '<div class="operator-meta"><span class="operator-chip">source pack attached</span><span class="operator-chip">'+esc(pack.source_count)+' sources</span><span class="operator-chip">'+esc(pack.external_action_state || 'blocked_until_owner_approval')+'</span></div>' : '<div class="operator-meta"><span class="operator-chip">no source pack attached</span><span class="operator-chip">owner-approved data only</span></div>';
      const submissionStatus = clientSubmission && clientSubmission.source_count ? '<div class="operator-meta"><span class="operator-chip">client submitted source pack</span><span class="operator-chip">'+esc(clientSubmission.source_count)+' sources</span><span class="operator-chip">'+esc(clientSubmission.external_action_state || 'blocked_until_owner_approval')+'</span></div>' : '';
      const importLabel = clientSubmission && clientSubmission.source_count ? 'Attach submitted source pack' : 'Import source pack JSON';
      const submittedPackProofButton = clientSubmission && clientSubmission.source_count ? '<button class="btn primary" type="button" data-submitted-source-pack-proof="prepare_first_proof_from_submitted_source_pack" data-action-id="'+esc(action.action_id || '')+'" data-lead-id="'+esc(action.lead_id || '')+'">Attach submitted pack + prepare proof</button>' : '';
      return [
        '<div class="operator-proof-section operator-activation-source-pack">',
          '<span>Client source pack</span>',
          packStatus,
          submissionStatus,
          '<textarea class="operator-reply" id="'+sourceJsonId+'" name="source_pack_json" placeholder="Paste Source pack JSON copied from /app/source-pack.">'+esc(clientSubmissionJson)+'</textarea>',
          '<div class="operator-row"><button class="btn secondary" type="button" data-source-pack-json-command="attach_activation_source_pack" data-source-pack-json-target="'+sourceJsonId+'" data-action-id="'+esc(action.action_id || '')+'" data-lead-id="'+esc(action.lead_id || '')+'">'+importLabel+'</button>'+submittedPackProofButton+'</div>',
          '<input class="operator-input" id="'+packNameId+'" name="source_pack_name" value="'+esc(pack.source_pack_name || 'Day 1 client source pack')+'" aria-label="Source pack name" />',
          '<div class="operator-row">',
            '<select class="operator-input" id="'+sourceTypeId+'" aria-label="Source type"><option value="google_drive">Google Drive</option><option value="gmail">Gmail</option><option value="uploaded_file">Uploaded file</option><option value="manual_note">Manual note</option><option value="pos_export">POS export</option></select>',
            '<input class="operator-input" id="'+sourceRefId+'" value="approved client source" aria-label="Source reference" />',
          '</div>',
          '<textarea class="operator-reply" id="'+sourceContentId+'" placeholder="Paste approved client data: messages, Drive docs, CSV rows, notes, screenshots, or order records."></textarea>',
          '<div class="operator-row"><button class="btn secondary" type="button" data-source-pack-command="attach_activation_source_pack" data-source-pack-name-target="'+packNameId+'" data-source-type-target="'+sourceTypeId+'" data-source-reference-target="'+sourceRefId+'" data-source-content-target="'+sourceContentId+'" data-action-id="'+esc(action.action_id || '')+'" data-lead-id="'+esc(action.lead_id || '')+'">Attach source pack</button><button class="btn primary" type="button" data-activation-proof-command="prepare_activation_first_proof" data-use-source-pack="true" data-action-id="'+esc(action.action_id || '')+'" data-lead-id="'+esc(action.lead_id || '')+'">Prepare proof from attached pack</button></div>',
        '</div>'
      ].join('');
    }
    function proofActivationSourceControl(action,index){
      if(!action || !action.first_proof)return '';
      const sourceId = 'activation-proof-source-'+index;
      const refId = 'activation-proof-reference-'+index;
      return [
        '<div class="operator-proof-section operator-activation-source">',
          '<span>Approved source to proof</span>',
          '<textarea class="operator-reply" id="'+sourceId+'" placeholder="Paste the approved source sample: message thread, file excerpt, POS export, notes, or screenshot text."></textarea>',
          '<input class="operator-input" id="'+refId+'" value="operator-approved source sample" aria-label="Source reference" />',
          '<button class="btn primary" type="button" data-activation-proof-command="prepare_activation_first_proof" data-source-target="'+sourceId+'" data-source-reference-target="'+refId+'" data-action-id="'+esc(action.action_id || '')+'" data-lead-id="'+esc(action.lead_id || '')+'">Prepare proof from source</button>',
        '</div>'
      ].join('');
    }
    function renderActions(data){
      const actions = Array.isArray(data.recent_actions) && data.recent_actions.length ? data.recent_actions : Array.isArray(data.actions) ? data.actions : [];
      if(!actions.length){actionsEl.innerHTML = '<div class="operator-item">No recent actions.</div>';return}
      actionsEl.innerHTML = actions.map(function(action,index){
        const proof = action.first_proof;
        const proofHtml = proof ? '<div class="operator-proof"><strong>'+esc(proof.title || 'First proof')+'</strong><div class="operator-meta"><span class="operator-chip">'+esc(proof.status)+'</span><span class="operator-chip">'+esc(proof.template_id)+'</span><span class="operator-chip">'+esc(proof.human_gate)+'</span></div><div>'+esc(proof.first_proof_target || '')+'</div>'+proofStarterLink(proof)+proofSolutionRoute(proof,index)+proofImplementationBlueprint(proof,index)+proofIntakeJob(proof,index)+proofClientKickoff(proof,index)+proofSourcePackRequest(action,proof,index)+proofList('Checklist',proof.checklist)+proofList('Acceptance tests',proof.acceptance_tests)+sourcePackControl(action,index)+proofActivationSourceControl(action,index)+proofBuyerReply(proof,index)+proofDeliveryPacket(proof,index)+proofReviewRequest(proof,index)+pilotClosePacket(proof,index)+pilotOrderRoom(action,proof,index)+'</div>' : '';
        return '<article class="operator-item"><strong>'+esc(action.title || action.action_type)+'</strong><div class="operator-meta"><span class="operator-chip">'+esc(action.status)+'</span><span class="operator-chip">'+esc(action.priority)+'</span><span class="operator-chip">'+esc(action.approval_state)+'</span><span>'+esc(action.lead_id)+'</span></div><div>'+esc(action.next_step || '')+'</div>'+salesAutopilotDraft(action,index)+proofHtml+'</article>';
      }).join('');
      actionsEl.querySelectorAll('[data-copy-target]').forEach(function(button){button.addEventListener('click',function(){copyDraft(button.getAttribute('data-copy-target'))})});
      actionsEl.querySelectorAll('[data-state-command]').forEach(function(button){button.addEventListener('click',function(){persistOrderRoomState(button)})});
      actionsEl.querySelectorAll('[data-scope-price-command]').forEach(function(button){button.addEventListener('click',function(){recordScopePriceApproval(button)})});
      actionsEl.querySelectorAll('[data-pilot-payment-proof-command]').forEach(function(button){button.addEventListener('click',function(){recordPilotPaymentProof(button)})});
      actionsEl.querySelectorAll('[data-client-payment-reconcile]').forEach(function(button){button.addEventListener('click',function(){reconcileClientPaymentSubmission(button)})});
      actionsEl.querySelectorAll('[data-workspace-command]').forEach(function(button){button.addEventListener('click',function(){startPrivateWorkspace(button)})});
      actionsEl.querySelectorAll('[data-first-production-run-command]').forEach(function(button){button.addEventListener('click',function(){recordFirstProductionRun(button)})});
      actionsEl.querySelectorAll('[data-acceptance-command]').forEach(function(button){button.addEventListener('click',function(){prepareFirstRunAcceptance(button)})});
      actionsEl.querySelectorAll('[data-owner-acceptance]').forEach(function(button){button.addEventListener('click',function(){recordOwnerAcceptance(button)})});
      actionsEl.querySelectorAll('[data-connector-policy]').forEach(function(button){button.addEventListener('click',function(){recordConnectorPolicy(button)})});
      actionsEl.querySelectorAll('[data-production-approval]').forEach(function(button){button.addEventListener('click',function(){prepareProductionApprovalQueue(button)})});
      actionsEl.querySelectorAll('[data-enterprise-delivery]').forEach(function(button){button.addEventListener('click',function(){prepareEnterpriseDeliveryPack(button)})});
      actionsEl.querySelectorAll('[data-customer-success]').forEach(function(button){button.addEventListener('click',function(){prepareCustomerSuccessDesk(button)})});
      actionsEl.querySelectorAll('[data-retainer-growth]').forEach(function(button){button.addEventListener('click',function(){prepareRetainerGrowthOffer(button)})});
      actionsEl.querySelectorAll('[data-retainer-payment]').forEach(function(button){button.addEventListener('click',function(){recordRetainerPaymentProof(button)})});
      actionsEl.querySelectorAll('[data-autopilot-draft-decision]').forEach(function(button){button.addEventListener('click',function(){recordAutopilotDraftApproval(button)})});
      actionsEl.querySelectorAll('[data-source-pack-request-decision]').forEach(function(button){button.addEventListener('click',function(){recordSourcePackRequestDecision(button)})});
      actionsEl.querySelectorAll('[data-source-pack-json-command]').forEach(function(button){button.addEventListener('click',function(){attachActivationSourcePackJson(button)})});
      actionsEl.querySelectorAll('[data-submitted-source-pack-proof]').forEach(function(button){button.addEventListener('click',function(){prepareFirstProofFromSubmittedSourcePack(button)})});
      actionsEl.querySelectorAll('[data-source-pack-command]').forEach(function(button){button.addEventListener('click',function(){attachActivationSourcePack(button)})});
      actionsEl.querySelectorAll('[data-activation-proof-command]').forEach(function(button){button.addEventListener('click',function(){prepareActivationFirstProof(button)})});
      actionsEl.querySelectorAll('[data-proof-acceptance-json-command]').forEach(function(button){button.addEventListener('click',function(){recordProofReviewAcceptanceJson(button)})});
    }
    async function recordProofReviewAcceptanceJson(button){
      if(!token()){setStatus('Paste the ops key first.');return}
      const jsonEl = document.getElementById(button.getAttribute('data-proof-acceptance-json-target') || '');
      const rawJson = jsonEl ? jsonEl.value.trim() : '';
      if(!rawJson){setStatus('Paste Proof acceptance JSON first.');return}
      let imported;
      try {
        imported = JSON.parse(rawJson);
      } catch (error) {
        setStatus({status:'error',reason:'proof_acceptance_json_parse_failed',message:String(error && error.message || error)});
        return;
      }
      const payload = {
        operation:'record_proof_review_acceptance',
        action_id:imported.action_id || button.getAttribute('data-action-id') || '',
        lead_id:imported.lead_id || button.getAttribute('data-lead-id') || '',
        proof_acceptance_json:rawJson,
        decision:imported.decision || '',
        operator_note:'Imported client Proof acceptance JSON. Scope, price, payment, workspace creation, external sends, browser actions, and connector writes remain blocked until owner approval.'
      };
      setStatus({status:'importing_proof_acceptance_json', note:'Recording proof review result for owner scope and price gate.'});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    async function attachActivationSourcePackJson(button){
      if(!token()){setStatus('Paste the ops key first.');return}
      const jsonEl = document.getElementById(button.getAttribute('data-source-pack-json-target') || '');
      const rawJson = jsonEl ? jsonEl.value.trim() : '';
      if(!rawJson){setStatus('Paste Source pack JSON first.');return}
      let imported;
      try {
        imported = JSON.parse(rawJson);
      } catch (error) {
        setStatus({status:'error',reason:'source_pack_json_parse_failed',message:String(error && error.message || error)});
        return;
      }
      const rawSources = Array.isArray(imported) ? imported : Array.isArray(imported.sources) ? imported.sources : [];
      const sources = rawSources.map(function(source,index){
        return {
          source_id:source.source_id || 'SRC-'+String(index+1).padStart(2,'0'),
          source_type:source.source_type || source.type || 'manual_note',
          reference:source.reference || source.label || source.name || 'source '+String(index+1),
          content:source.content || source.content_excerpt || source.text || source.sample || '',
          approved:source.approved !== false
        };
      }).filter(function(source){return source.reference || source.content});
      if(!sources.length){setStatus({status:'error',reason:'missing_activation_sources',message:'Source pack JSON needs a sources array with content.'});return}
      const payload = {
        operation:'attach_activation_source_pack',
        action_id:imported.action_id || button.getAttribute('data-action-id') || '',
        lead_id:imported.lead_id || button.getAttribute('data-lead-id') || '',
        source_pack_name:imported.source_pack_name || 'Imported client source pack',
        source_pack_json:rawJson,
        sources:sources,
        operator_note:'Imported owner-approved client Source pack JSON. External sends, writes, payments, and connector access remain blocked until owner approval.'
      };
      setStatus({status:'importing_source_pack_json', note:'Attaching approved Source pack JSON to the action.'});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    async function prepareFirstProofFromSubmittedSourcePack(button){
      if(!token()){setStatus('Paste the ops key first.');return}
      const note = window.prompt('Owner review note for submitted source pack','Owner reviewed submitted pack and approved first-proof preparation only.');
      if(note === null){setStatus({status:'cancelled', reason:'operator_cancelled_submitted_source_pack_proof'});return}
      const payload = {
        operation:'prepare_first_proof_from_submitted_source_pack',
        action_id:button.getAttribute('data-action-id') || '',
        lead_id:button.getAttribute('data-lead-id') || '',
        operator_note:(note || '').trim() || 'Owner reviewed submitted pack and approved first-proof preparation only.'
      };
      setStatus({status:'preparing_first_proof_from_submitted_source_pack', note:'Attaching client-submitted source pack and preparing first proof. External actions remain blocked.'});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    async function attachActivationSourcePack(button){
      if(!token()){setStatus('Paste the ops key first.');return}
      const packNameEl = document.getElementById(button.getAttribute('data-source-pack-name-target') || '');
      const sourceTypeEl = document.getElementById(button.getAttribute('data-source-type-target') || '');
      const referenceEl = document.getElementById(button.getAttribute('data-source-reference-target') || '');
      const contentEl = document.getElementById(button.getAttribute('data-source-content-target') || '');
      const sourceContent = contentEl ? contentEl.value.trim() : '';
      if(!sourceContent){setStatus('Paste approved client source content first.');return}
      const payload = {
        operation:'attach_activation_source_pack',
        action_id:button.getAttribute('data-action-id') || '',
        lead_id:button.getAttribute('data-lead-id') || '',
        source_pack_name:packNameEl && packNameEl.value ? packNameEl.value.trim() : 'Day 1 client source pack',
        sources:[{
          source_type:sourceTypeEl && sourceTypeEl.value ? sourceTypeEl.value : 'manual_note',
          reference:referenceEl && referenceEl.value ? referenceEl.value.trim() : 'approved client source',
          content:sourceContent,
          approved:true
        }],
        operator_note:'Attached owner-approved client source pack. External sends, writes, payments, and connector access remain blocked until owner approval.'
      };
      setStatus({status:'attaching_activation_source_pack', note:'Saving approved client source pack for proof generation.'});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    async function prepareActivationFirstProof(button){
      if(!token()){setStatus('Paste the ops key first.');return}
      const useSourcePack = button.getAttribute('data-use-source-pack') === 'true';
      const sourceEl = document.getElementById(button.getAttribute('data-source-target') || '');
      const referenceEl = document.getElementById(button.getAttribute('data-source-reference-target') || '');
      const sourceSample = sourceEl ? sourceEl.value.trim() : '';
      if(!sourceSample && !useSourcePack){setStatus('Paste an approved source sample first.');return}
      const payload = {
        operation:'prepare_activation_first_proof',
        action_id:button.getAttribute('data-action-id') || '',
        lead_id:button.getAttribute('data-lead-id') || '',
        source_reference:sourceSample && referenceEl && referenceEl.value ? referenceEl.value.trim() : 'attached activation source pack',
        operator_note:useSourcePack ? 'Prepared from attached owner-approved source pack. No external send/write/payment action is allowed without owner approval.' : 'Prepared from operator-approved source sample. No external send/write/payment action is allowed without owner approval.'
      };
      if(sourceSample) payload.approved_source_sample = sourceSample;
      setStatus({status:'preparing_activation_first_proof', note:'Building proof packet from approved source. External actions remain blocked.'});
      const response = await fetch('/api/pipeline-control',{method:'POST',headers:Object.assign({},authHeaders(),{'content-type':'application/json'}),body:JSON.stringify(payload),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      setStatus(data);
      if(response.ok) await refresh();
    }
    async function refresh(){
      if(!token()){setStatus('Paste the ops key first.');return}
      setStatus('Loading pipeline-control...');
      const response = await fetch('/api/pipeline-control/status',{headers:authHeaders(),cache:'no-store'});
      const data = await response.json().catch(function(){return {status:'error',reason:'invalid_json',code:response.status}});
      if(!response.ok){setStatus(data);return}
      try {
        const behaviorResponse = await fetch('/api/behavior-events?summary=1',{headers:authHeaders(),cache:'no-store'});
        const behaviorData = await behaviorResponse.json().catch(function(){return {status:'error',reason:'invalid_json',code:behaviorResponse.status}});
        data.behavior_summary = behaviorData.behavior_summary || {status:'error',reason:behaviorData.reason || 'behavior_summary_unavailable'};
      } catch (error) {
        data.behavior_summary = {status:'error',reason:String(error && error.message || 'behavior_summary_fetch_failed')};
      }
      renderKpis(data); renderBehaviorSummaryBoard(data); renderDatastoreFailoverReport(data); renderActivationCockpit(data); renderAutopilotCommandBoard(data); renderRevenueProofBoard(data); renderActions(data); setStatus(data);
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
    document.getElementById('load-sample').addEventListener('click',loadSample);
    document.getElementById('refresh').addEventListener('click',refresh);
    document.getElementById('run-runner').addEventListener('click',runRunner);
    document.getElementById('start-activation-session').addEventListener('click',startActivationSession);
  </script>
</body>
</html>`
await mkdir(resolve(staticDir, 'operator'), { recursive: true })
await writeFile(resolve(staticDir, 'operator', 'index.html'), publicOperatorConsoleHtml, 'utf8')
const publicProofReviewHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex,nofollow" />
  <title>AI Workcell Proof Review | SUPERMEGA.dev</title>
  <meta name="description" content="Client proof review room for SuperMega AI workcell first proofs." />
  <meta name="theme-color" content="#1b1815" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
  <style>
    :root { color-scheme: light; --paper:#f4efe6; --ink:#1b1815; --muted:#6f675d; --line:rgba(27,24,21,.16); --panel:#fffaf1; --panel2:#ebe2d3; --accent:#FF3B3B; --green:#1c8a5a; --red:#a14432; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--paper); color: var(--ink); font-family: "Aptos", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
    main { width: min(1180px, calc(100% - 28px)); margin: 0 auto; padding: 24px 0 54px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0 22px; border-bottom: 1px solid var(--line); }
    .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: inherit; font-weight: 950; }
    .mark { width: 38px; height: 38px; border-radius: 12px; background: #1b1815; display: grid; place-items: center; border: 1px solid rgba(27,24,21,.22); }
    .mark img { width: 100%; height: 100%; display: block; border-radius: inherit; }
    .btn { border: 1px solid var(--line); border-radius: 999px; padding: 11px 14px; background: var(--panel); color: var(--ink); font-weight: 850; text-decoration: none; cursor: pointer; }
    .btn.primary { background: var(--ink); color: var(--paper); border-color: var(--ink); }
    .btn:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 3px solid rgba(255,59,59,.28); outline-offset: 2px; }
    .hero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 430px); gap: 16px; padding: 28px 0 20px; align-items: stretch; }
    .eyebrow { color: var(--accent); font-size: 12px; font-weight: 950; text-transform: uppercase; letter-spacing: 0; }
    h1 { margin: 10px 0 0; max-width: 12ch; font-size: clamp(44px, 8vw, 84px); line-height: .9; letter-spacing: 0; }
    h2 { margin: 0; font-size: clamp(24px, 3vw, 34px); letter-spacing: 0; }
    p { color: var(--muted); font-size: 16px; line-height: 1.55; margin: 12px 0 0; max-width: 62rem; }
    .summary, .panel, .decision-card { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
    .summary { padding: 18px; display: grid; gap: 10px; align-content: start; }
    .summary-row { display: grid; grid-template-columns: 108px 1fr; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--line); }
    .summary-row:last-child { border-bottom: 0; }
    .summary-row span { color: var(--muted); font-size: 12px; font-weight: 900; text-transform: uppercase; }
    .summary-row strong { overflow-wrap: anywhere; }
    .band { border-top: 1px solid var(--line); padding-top: 22px; margin-top: 18px; }
    .grid { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(320px, .95fr); gap: 12px; margin-top: 12px; align-items: start; }
    .panel { padding: 16px; display: grid; gap: 12px; background: var(--panel2); }
    .decision-card { padding: 14px; display: grid; gap: 10px; }
    label { display: grid; gap: 7px; color: var(--muted); font-size: 12px; font-weight: 900; text-transform: uppercase; }
    input, textarea, select { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 11px 12px; background: #fffaf1; color: var(--ink); font: inherit; }
    textarea { min-height: 190px; resize: vertical; line-height: 1.45; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .pill { display: inline-flex; align-items: center; width: fit-content; border-radius: 999px; padding: 7px 9px; background: rgba(28,138,90,.1); color: var(--green); font-size: 11px; font-weight: 950; text-transform: uppercase; }
    .pill.stop { background: rgba(161,68,50,.1); color: var(--red); }
    pre { margin: 0; overflow: auto; white-space: pre-wrap; border: 1px solid var(--line); border-radius: 8px; background: rgba(255,250,241,.85); padding: 14px; font-size: 13px; line-height: 1.45; max-height: 420px; }
    footer { margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
    @media (max-width: 900px) { .hero, .grid { grid-template-columns: 1fr; } header { align-items: flex-start; } .summary-row { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <header>
      <a class="brand" href="/" aria-label="SUPERMEGA.dev home"><span style="display:inline-flex;align-items:center;flex:none" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6.5 8 L11 12 L6.5 16" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.6 16.2 L18 16.2" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round"/></svg></span><span class="wm" style="letter-spacing:-0.025em"><b style="font-weight:700">supermega</b><b style="color:#5E6B87;font-weight:500">.dev</b></span></a>
      <a class="btn" href="/operator/">Operator console</a>
    </header>
    <section class="hero">
      <div>
        <div class="eyebrow">client review</div>
        <h1>AI Workcell Proof Review</h1>
        <p>Review the first proof and submit an acceptance artifact for operator review. This page does not send messages, connect accounts, request payment, or claim revenue.</p>
      </div>
      <aside class="summary" aria-label="Proof review summary">
        <div class="summary-row"><span>Lead</span><strong data-lead-id>Loading</strong></div>
        <div class="summary-row"><span>Action</span><strong data-action-id>Loading</strong></div>
        <div class="summary-row"><span>Decision</span><strong data-decision-summary>Waiting</strong></div>
        <div class="summary-row"><span>Gate</span><strong>owner approval before send/write/payment/browser actions</strong></div>
      </aside>
    </section>
    <section class="band">
      <div class="actions"><h2>First proof review</h2><span class="pill stop">No external action</span></div>
      <div class="grid">
        <div class="panel">
          <label>Proof packet<textarea id="proof-packet" placeholder="Paste the first proof packet from the operator if it is not already included in your message."></textarea></label>
          <label>Review decision<select id="review-decision"><option value="ready_for_paid_pilot">ready_for_paid_pilot</option><option value="changes_requested">changes_requested</option><option value="not_useful">not_useful</option></select></label>
          <label>Client note<textarea id="client-note" placeholder="What is useful, what needs changing, or why it is not useful yet."></textarea></label>
        </div>
        <div class="decision-card">
          <h2>Proof acceptance JSON</h2>
          <p>Submit this back to the SuperMega operator. It is an acceptance artifact only; payment and production still need owner approval.</p>
          <div class="actions"><button class="btn primary" id="submit-acceptance" type="button">Submit proof review</button><button class="btn" id="copy-acceptance" type="button">Copy acceptance JSON</button><button class="btn" id="refresh-acceptance" type="button">Refresh JSON</button></div>
          <pre id="acceptance-json">Loading proof acceptance JSON.</pre>
          <p id="copy-status">Submitting stores the proof review for operator review only.</p>
        </div>
      </div>
    </section>
    <footer>First-proof review only. Guardrail: owner approval before send/write/payment/browser actions. Real MRR stays 0 until payment proof is recorded.</footer>
  </main>
  <script>
    (function(){
      var params = new URLSearchParams(window.location.search);
      var lead = (params.get('lead') || 'lead-required').slice(0, 80);
      var action = (params.get('action') || 'action-required').slice(0, 80);
      var leadEl = document.querySelector('[data-lead-id]');
      var actionEl = document.querySelector('[data-action-id]');
      var decisionEl = document.getElementById('review-decision');
      var decisionSummary = document.querySelector('[data-decision-summary]');
      var proofEl = document.getElementById('proof-packet');
      var noteEl = document.getElementById('client-note');
      var output = document.getElementById('acceptance-json');
      var copyStatus = document.getElementById('copy-status');
      if (leadEl) leadEl.textContent = lead;
      if (actionEl) actionEl.textContent = action;
      function buildAcceptance() {
        var decision = decisionEl && decisionEl.value ? decisionEl.value : 'ready_for_paid_pilot';
        if (decisionSummary) decisionSummary.textContent = decision;
        return {
          acceptance_type: 'first_proof_review',
          lead_id: lead,
          action_id: action,
          decision: decision,
          client_note: noteEl && noteEl.value ? noteEl.value.trim() : '',
          proof_packet_excerpt: proofEl && proofEl.value ? proofEl.value.trim().slice(0, 1400) : '',
          next_gate: decision === 'ready_for_paid_pilot' ? 'scope_price_owner_approval_required' : 'proof_revision_required',
          human_gate: 'owner approval before send/write/payment/browser actions',
          external_action_state: 'blocked_until_owner_approval',
          connector_write_state: 'blocked_until_owner_approval',
          browser_action_state: 'blocked_until_owner_approval',
          payment_request_state: 'blocked_until_owner_approval',
          real_mrr_delta: 0,
          reviewed_at: new Date().toISOString(),
          status: 'proof_review_acceptance_recorded'
        };
      }
      function render() {
        if (!output) return;
        output.textContent = JSON.stringify(buildAcceptance(), null, 2);
      }
      document.querySelectorAll('textarea, select').forEach(function(el){ el.addEventListener('input', render); el.addEventListener('change', render); });
      var refresh = document.getElementById('refresh-acceptance');
      if (refresh) refresh.addEventListener('click', render);
      var submit = document.getElementById('submit-acceptance');
      if (submit) submit.addEventListener('click', async function(){
        render();
        var acceptance = buildAcceptance();
        submit.disabled = true;
        if (copyStatus) copyStatus.textContent = 'Submitting proof review for operator review...';
        try {
          var response = await fetch('/api/proof-review-submissions', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(acceptance),
            cache: 'no-store'
          });
          var data = await response.json().catch(function(){ return { status:'error', reason:'invalid_json', code:response.status }; });
          if (!response.ok || data.status !== 'ready') {
            if (copyStatus) copyStatus.textContent = 'Submit failed: ' + (data.reason || response.status || 'unknown');
            return;
          }
          if (copyStatus) copyStatus.textContent = 'Submitted for operator review. SuperMega can prepare scope and price after owner approval.';
        } catch (error) {
          if (copyStatus) copyStatus.textContent = 'Submit failed. Copy the JSON and send it to SuperMega.';
        } finally {
          submit.disabled = false;
        }
      });
      var copy = document.getElementById('copy-acceptance');
      if (copy) copy.addEventListener('click', async function(){
        render();
        try {
          await navigator.clipboard.writeText(output.textContent || '');
          if (copyStatus) copyStatus.textContent = 'Copied. Send this JSON to the SuperMega operator.';
        } catch (error) {
          if (copyStatus) copyStatus.textContent = 'Copy failed. Select the JSON manually and copy it.';
        }
      });
      render();
    })();
  </script>
</body>
</html>`
await mkdir(resolve(staticDir, 'app', 'proof-review'), { recursive: true })
await writeFile(resolve(staticDir, 'app', 'proof-review', 'index.html'), publicProofReviewHtml, 'utf8')
const publicPaymentProofHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex,nofollow" />
  <title>AI Workcell Payment Proof | SUPERMEGA.dev</title>
  <meta name="description" content="Client payment-proof submission room for SuperMega AI workcell paid pilots." />
  <meta name="theme-color" content="#1b1815" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
  <style>
    :root { color-scheme: light; --paper:#f4efe6; --ink:#1b1815; --muted:#6f675d; --line:rgba(27,24,21,.16); --panel:#fffaf1; --panel2:#ebe2d3; --accent:#FF3B3B; --green:#1c8a5a; --red:#a14432; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--paper); color: var(--ink); font-family: "Aptos", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
    main { width: min(1180px, calc(100% - 28px)); margin: 0 auto; padding: 24px 0 54px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0 22px; border-bottom: 1px solid var(--line); }
    .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: inherit; font-weight: 950; }
    .mark { width: 38px; height: 38px; border-radius: 12px; background: #1b1815; display: grid; place-items: center; border: 1px solid rgba(27,24,21,.22); }
    .mark img { width: 100%; height: 100%; display: block; border-radius: inherit; }
    .btn { border: 1px solid var(--line); border-radius: 999px; padding: 11px 14px; background: var(--panel); color: var(--ink); font-weight: 850; text-decoration: none; cursor: pointer; }
    .btn.primary { background: var(--ink); color: var(--paper); border-color: var(--ink); }
    .btn:focus-visible, input:focus-visible, textarea:focus-visible { outline: 3px solid rgba(255,59,59,.28); outline-offset: 2px; }
    .hero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 430px); gap: 16px; padding: 28px 0 20px; align-items: stretch; }
    .eyebrow { color: var(--accent); font-size: 12px; font-weight: 950; text-transform: uppercase; letter-spacing: 0; }
    h1 { margin: 10px 0 0; max-width: 12ch; font-size: clamp(44px, 8vw, 84px); line-height: .9; letter-spacing: 0; }
    h2 { margin: 0; font-size: clamp(24px, 3vw, 34px); letter-spacing: 0; }
    p { color: var(--muted); font-size: 16px; line-height: 1.55; margin: 12px 0 0; max-width: 62rem; }
    .summary, .panel, .proof-card { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
    .summary { padding: 18px; display: grid; gap: 10px; align-content: start; }
    .summary-row { display: grid; grid-template-columns: 116px 1fr; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--line); }
    .summary-row:last-child { border-bottom: 0; }
    .summary-row span { color: var(--muted); font-size: 12px; font-weight: 900; text-transform: uppercase; }
    .summary-row strong { overflow-wrap: anywhere; }
    .band { border-top: 1px solid var(--line); padding-top: 22px; margin-top: 18px; }
    .grid { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(320px, .95fr); gap: 12px; margin-top: 12px; align-items: start; }
    .panel { padding: 16px; display: grid; gap: 12px; background: var(--panel2); }
    .proof-card { padding: 14px; display: grid; gap: 10px; }
    label { display: grid; gap: 7px; color: var(--muted); font-size: 12px; font-weight: 900; text-transform: uppercase; }
    input, textarea { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 11px 12px; background: #fffaf1; color: var(--ink); font: inherit; }
    textarea { min-height: 150px; resize: vertical; line-height: 1.45; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .pill { display: inline-flex; align-items: center; width: fit-content; border-radius: 999px; padding: 7px 9px; background: rgba(28,138,90,.1); color: var(--green); font-size: 11px; font-weight: 950; text-transform: uppercase; }
    .pill.stop { background: rgba(161,68,50,.1); color: var(--red); }
    pre { margin: 0; overflow: auto; white-space: pre-wrap; border: 1px solid var(--line); border-radius: 8px; background: rgba(255,250,241,.85); padding: 14px; font-size: 13px; line-height: 1.45; max-height: 380px; }
    footer { margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
    @media (max-width: 900px) { .hero, .grid { grid-template-columns: 1fr; } header { align-items: flex-start; } .summary-row { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <header>
      <a class="brand" href="/" aria-label="SUPERMEGA.dev home"><span style="display:inline-flex;align-items:center;flex:none" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6.5 8 L11 12 L6.5 16" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.6 16.2 L18 16.2" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round"/></svg></span><span class="wm" style="letter-spacing:-0.025em"><b style="font-weight:700">supermega</b><b style="color:#5E6B87;font-weight:500">.dev</b></span></a>
      <a class="btn" href="/operator/">Operator console</a>
    </header>
    <section class="hero">
      <div>
        <div class="eyebrow">client payment evidence</div>
        <h1>AI Workcell Payment Proof</h1>
        <p>Submit payment evidence for operator reconciliation. This does not create a workspace, verify a bank match, send messages, or claim revenue.</p>
      </div>
      <aside class="summary" aria-label="Payment proof summary">
        <div class="summary-row"><span>Lead</span><strong data-lead-id>Loading</strong></div>
        <div class="summary-row"><span>Action</span><strong data-action-id>Loading</strong></div>
        <div class="summary-row"><span>Status</span><strong data-payment-summary>Waiting</strong></div>
        <div class="summary-row"><span>Gate</span><strong>owner reconciliation before workspace or revenue claim</strong></div>
      </aside>
    </section>
    <section class="band">
      <div class="actions"><h2>Payment proof</h2><span class="pill stop">Owner review required</span></div>
      <div class="grid">
        <div class="panel">
          <label>Payment amount MMK<input id="payment-amount" inputmode="numeric" placeholder="5500000" /></label>
          <label>Payment method<input id="payment-method" placeholder="KBZPay transfer, bank transfer, WavePay, cash deposit" /></label>
          <label>Payment proof reference<textarea id="payment-reference" placeholder="Receipt number, transfer reference, screenshot filename, or payment confirmation text."></textarea></label>
          <label>Client note<textarea id="client-note" placeholder="Anything the operator should know when reconciling the payment."></textarea></label>
        </div>
        <div class="proof-card">
          <h2>Submission JSON</h2>
          <p>Submit this evidence for operator reconciliation. Workspace start remains blocked until owner review.</p>
          <div class="actions"><button class="btn primary" id="submit-payment-proof" type="button">Submit payment proof</button><button class="btn" id="copy-payment-proof" type="button">Copy JSON</button><button class="btn" id="refresh-payment-proof" type="button">Refresh JSON</button></div>
          <pre id="payment-proof-json">Loading payment proof JSON.</pre>
          <p id="copy-status">Submitting stores the payment proof for operator reconciliation only.</p>
        </div>
      </div>
    </section>
    <footer>Payment evidence only. Guardrail: owner reconciliation before workspace, bank verification is separate, and real MRR stays 0.</footer>
  </main>
  <script>
    (function(){
      var params = new URLSearchParams(window.location.search);
      var lead = (params.get('lead') || 'lead-required').slice(0, 80);
      var action = (params.get('action') || 'action-required').slice(0, 80);
      var amountEl = document.getElementById('payment-amount');
      var methodEl = document.getElementById('payment-method');
      var referenceEl = document.getElementById('payment-reference');
      var noteEl = document.getElementById('client-note');
      var output = document.getElementById('payment-proof-json');
      var copyStatus = document.getElementById('copy-status');
      var summary = document.querySelector('[data-payment-summary]');
      var leadEl = document.querySelector('[data-lead-id]');
      var actionEl = document.querySelector('[data-action-id]');
      if (leadEl) leadEl.textContent = lead;
      if (actionEl) actionEl.textContent = action;
      function buildPaymentProof() {
        var amount = amountEl && amountEl.value ? amountEl.value.trim() : '';
        var method = methodEl && methodEl.value ? methodEl.value.trim() : 'client_submitted_payment_proof';
        var reference = referenceEl && referenceEl.value ? referenceEl.value.trim() : '';
        if (summary) summary.textContent = reference ? 'ready to submit' : 'proof reference required';
        return {
          status: 'client_pilot_payment_submitted',
          submission_type: 'client_pilot_payment_proof',
          lead_id: lead,
          action_id: action,
          payment_amount_mmk: amount,
          payment_method: method,
          payment_proof_reference: reference,
          client_note: noteEl && noteEl.value ? noteEl.value.trim() : '',
          payment_proof_state: 'client_submitted_owner_review_required',
          private_workspace_state: 'not_created_until_owner_reconciliation',
          setup_cash_delta_mmk: 0,
          real_mrr_delta: 0,
          submitted_at: new Date().toISOString()
        };
      }
      function render() {
        if (!output) return;
        output.textContent = JSON.stringify(buildPaymentProof(), null, 2);
      }
      document.querySelectorAll('input, textarea').forEach(function(el){ el.addEventListener('input', render); el.addEventListener('change', render); });
      var refresh = document.getElementById('refresh-payment-proof');
      if (refresh) refresh.addEventListener('click', render);
      var submit = document.getElementById('submit-payment-proof');
      if (submit) submit.addEventListener('click', async function(){
        render();
        var paymentProof = buildPaymentProof();
        if (!paymentProof.payment_amount_mmk) { if (copyStatus) copyStatus.textContent = 'Add the payment amount before submitting.'; return; }
        if (!paymentProof.payment_proof_reference) { if (copyStatus) copyStatus.textContent = 'Add the payment proof reference before submitting.'; return; }
        submit.disabled = true;
        if (copyStatus) copyStatus.textContent = 'Submitting payment proof for operator reconciliation...';
        try {
          var response = await fetch('/api/pilot-payment-submissions', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(paymentProof),
            cache: 'no-store'
          });
          var data = await response.json().catch(function(){ return { status:'error', reason:'invalid_json', code:response.status }; });
          if (!response.ok || data.status !== 'ready') {
            if (copyStatus) copyStatus.textContent = 'Submit failed: ' + (data.reason || response.status || 'unknown');
            return;
          }
          if (copyStatus) copyStatus.textContent = 'Submitted for operator reconciliation. Workspace starts only after owner review.';
        } catch (error) {
          if (copyStatus) copyStatus.textContent = 'Submit failed. Copy the JSON and send it to SuperMega.';
        } finally {
          submit.disabled = false;
        }
      });
      var copy = document.getElementById('copy-payment-proof');
      if (copy) copy.addEventListener('click', async function(){
        render();
        try {
          await navigator.clipboard.writeText(output.textContent || '');
          if (copyStatus) copyStatus.textContent = 'Copied. You can also submit it here for operator reconciliation.';
        } catch (error) {
          if (copyStatus) copyStatus.textContent = 'Copy failed. Select the JSON manually and copy it.';
        }
      });
      render();
    })();
  </script>
</body>
</html>`
await mkdir(resolve(staticDir, 'app', 'payment-proof'), { recursive: true })
await writeFile(resolve(staticDir, 'app', 'payment-proof', 'index.html'), publicPaymentProofHtml, 'utf8')
const publicSourcePackIntakeHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex,nofollow" />
  <title>AI Workcell Source Pack Intake | SUPERMEGA.dev</title>
  <meta name="description" content="Client source pack intake for SuperMega AI workcell first proofs." />
  <meta name="theme-color" content="#1b1815" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
  <style>
    :root { color-scheme: light; --paper:#f4efe6; --ink:#1b1815; --muted:#6f675d; --line:rgba(27,24,21,.16); --panel:#fffaf1; --panel2:#ebe2d3; --accent:#FF3B3B; --green:#1c8a5a; --red:#a14432; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--paper); color: var(--ink); font-family: "Aptos", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
    main { width: min(1180px, calc(100% - 28px)); margin: 0 auto; padding: 24px 0 54px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0 22px; border-bottom: 1px solid var(--line); }
    .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: inherit; font-weight: 950; }
    .mark { width: 38px; height: 38px; border-radius: 12px; background: #1b1815; display: grid; place-items: center; border: 1px solid rgba(27,24,21,.22); }
    .mark img { width: 100%; height: 100%; display: block; border-radius: inherit; }
    .btn { border: 1px solid var(--line); border-radius: 999px; padding: 11px 14px; background: var(--panel); color: var(--ink); font-weight: 850; text-decoration: none; cursor: pointer; }
    .btn.primary { background: var(--ink); color: var(--paper); border-color: var(--ink); }
    .btn:focus-visible, input:focus-visible, textarea:focus-visible { outline: 3px solid rgba(255,59,59,.28); outline-offset: 2px; }
    .hero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 430px); gap: 16px; padding: 28px 0 20px; align-items: stretch; }
    .eyebrow { color: var(--accent); font-size: 12px; font-weight: 950; text-transform: uppercase; letter-spacing: 0; }
    h1 { margin: 10px 0 0; max-width: 12ch; font-size: clamp(44px, 8vw, 84px); line-height: .9; letter-spacing: 0; }
    h2 { margin: 0; font-size: clamp(24px, 3vw, 34px); letter-spacing: 0; }
    p { color: var(--muted); font-size: 16px; line-height: 1.55; margin: 12px 0 0; max-width: 62rem; }
    .summary, .panel, .source-card { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
    .summary { padding: 18px; display: grid; gap: 10px; align-content: start; }
    .summary-row { display: grid; grid-template-columns: 108px 1fr; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--line); }
    .summary-row:last-child { border-bottom: 0; }
    .summary-row span { color: var(--muted); font-size: 12px; font-weight: 900; text-transform: uppercase; }
    .summary-row strong { overflow-wrap: anywhere; }
    .band { border-top: 1px solid var(--line); padding-top: 22px; margin-top: 18px; }
    .source-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
    .source-card { padding: 14px; display: grid; gap: 9px; }
    .source-card strong { font-size: 18px; }
    label { display: grid; gap: 7px; color: var(--muted); font-size: 12px; font-weight: 900; text-transform: uppercase; }
    input, textarea { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 11px 12px; background: #fffaf1; color: var(--ink); font: inherit; }
    textarea { min-height: 150px; resize: vertical; line-height: 1.45; }
    .panel { padding: 16px; display: grid; gap: 12px; background: var(--panel2); }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .pill { display: inline-flex; align-items: center; width: fit-content; border-radius: 999px; padding: 7px 9px; background: rgba(28,138,90,.1); color: var(--green); font-size: 11px; font-weight: 950; text-transform: uppercase; }
    .pill.stop { background: rgba(161,68,50,.1); color: var(--red); }
    pre { margin: 0; overflow: auto; white-space: pre-wrap; border: 1px solid var(--line); border-radius: 8px; background: rgba(255,250,241,.85); padding: 14px; font-size: 13px; line-height: 1.45; max-height: 420px; }
    footer { margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
    @media (max-width: 900px) { .hero, .source-grid { grid-template-columns: 1fr; } header { align-items: flex-start; } .summary-row { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <header>
      <a class="brand" href="/" aria-label="SUPERMEGA.dev home"><span style="display:inline-flex;align-items:center;flex:none" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6.5 8 L11 12 L6.5 16" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.6 16.2 L18 16.2" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round"/></svg></span><span class="wm" style="letter-spacing:-0.025em"><b style="font-weight:700">supermega</b><b style="color:#5E6B87;font-weight:500">.dev</b></span></a>
      <a class="btn" href="/operator/">Operator console</a>
    </header>
    <section class="hero">
      <div>
        <div class="eyebrow">client intake</div>
        <h1>AI Workcell Source Pack Intake</h1>
        <p>Send the smallest approved source pack for a first proof: one customer message, one order or work-list export, and one process note or screenshot. This page stores the source pack for operator review only. No external access, no account connection, no connector write, and no payment request happens here.</p>
      </div>
      <aside class="summary" aria-label="Source pack summary">
        <div class="summary-row"><span>Lead</span><strong data-lead-id>Loading</strong></div>
        <div class="summary-row"><span>Action</span><strong data-action-id>Loading</strong></div>
        <div class="summary-row"><span>Mode</span><strong>first proof only</strong></div>
        <div class="summary-row"><span>Gate</span><strong>owner approval before send/write/payment/browser actions</strong></div>
      </aside>
    </section>
    <section class="band">
      <div class="actions"><h2>3 approved source samples</h2><span class="pill stop">No external access</span></div>
      <div class="source-grid">
        <article class="source-card">
          <strong>Customer messages</strong>
          <p>Paste a Gmail thread, Viber chat, WhatsApp chat, Messenger screenshot text, or customer request sample.</p>
          <label>Reference<input data-source-reference="0" value="Customer message sample" /></label>
          <label>Content<textarea data-source-content="0" placeholder="Paste approved customer message text here."></textarea></label>
        </article>
        <article class="source-card">
          <strong>Orders or work list</strong>
          <p>Paste a POS export excerpt, Google Sheet rows, Excel rows, CSV sample, invoice list, or delivery queue.</p>
          <label>Reference<input data-source-reference="1" value="Order or work-list export" /></label>
          <label>Content<textarea data-source-content="1" placeholder="Paste approved rows or summary here."></textarea></label>
        </article>
        <article class="source-card">
          <strong>Process context</strong>
          <p>Paste a note, screenshot text, checklist, or short explanation of how the work is handled today.</p>
          <label>Reference<input data-source-reference="2" value="Process note or screenshot" /></label>
          <label>Content<textarea data-source-content="2" placeholder="Paste approved process context here."></textarea></label>
        </article>
      </div>
    </section>
    <section class="band">
      <div class="panel">
        <div class="actions"><h2>Source pack JSON</h2><button class="btn primary" id="submit-source-pack" type="button">Submit source pack</button><button class="btn" id="copy-source-pack" type="button">Copy source pack</button><button class="btn" id="refresh-source-pack" type="button">Refresh JSON</button></div>
        <pre id="source-pack-json">Loading source pack template.</pre>
        <p id="copy-status">Submitting stores the pack for operator review only. You can also copy the JSON for your records.</p>
      </div>
    </section>
    <footer>First-proof source intake only. Guardrail: owner approval before send/write/payment/browser actions. Real MRR stays 0 until payment proof is recorded.</footer>
  </main>
  <script>
    (function(){
      var params = new URLSearchParams(window.location.search);
      var lead = (params.get('lead') || 'lead-required').slice(0, 80);
      var action = (params.get('action') || 'action-required').slice(0, 80);
      var leadEl = document.querySelector('[data-lead-id]');
      var actionEl = document.querySelector('[data-action-id]');
      var output = document.getElementById('source-pack-json');
      var copyStatus = document.getElementById('copy-status');
      if (leadEl) leadEl.textContent = lead;
      if (actionEl) actionEl.textContent = action;
      function value(selector, index) {
        var el = document.querySelector(selector + '="' + index + '"]');
        return el && el.value ? el.value.trim() : '';
      }
      function buildSourcePack() {
        var types = ['gmail_or_chat','spreadsheet_or_pos_export','process_note_or_screenshot'];
        var labels = ['Customer messages','Orders or work list','Process context'];
        return {
          source_pack_name: 'Client approved first-proof source pack',
          lead_id: lead,
          action_id: action,
          status: 'client_source_pack_submitted',
          approval_scope: 'first_proof_only',
          human_gate: 'owner approval before send/write/payment/browser actions',
          external_action_state: 'blocked_until_owner_approval',
          connector_write_state: 'blocked_until_owner_approval',
          browser_action_state: 'blocked_until_owner_approval',
          payment_request_state: 'blocked_until_owner_approval',
          real_mrr_delta: 0,
          sources: types.map(function(type, index){
            return {
              source_id: 'SRC-' + String(index + 1).padStart(2, '0'),
              source_type: type,
              label: labels[index],
              reference: value('[data-source-reference', index) || labels[index],
              content: value('[data-source-content', index),
              approved: true
            };
          })
        };
      }
      function render() {
        if (!output) return;
        output.textContent = JSON.stringify(buildSourcePack(), null, 2);
      }
      document.querySelectorAll('input, textarea').forEach(function(el){ el.addEventListener('input', render); });
      var refresh = document.getElementById('refresh-source-pack');
      if (refresh) refresh.addEventListener('click', render);
      var submit = document.getElementById('submit-source-pack');
      if (submit) submit.addEventListener('click', async function(){
        render();
        var pack = buildSourcePack();
        var filled = pack.sources.filter(function(source){ return source.content && source.content.trim(); });
        if (!filled.length) {
          if (copyStatus) copyStatus.textContent = 'Add at least one approved source sample before submitting.';
          return;
        }
        submit.disabled = true;
        if (copyStatus) copyStatus.textContent = 'Submitting source pack for operator review...';
        try {
          var response = await fetch('/api/source-pack-submissions', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(pack),
            cache: 'no-store'
          });
          var data = await response.json().catch(function(){ return { status:'error', reason:'invalid_json', code:response.status }; });
          if (!response.ok || data.status !== 'ready') {
            if (copyStatus) copyStatus.textContent = 'Submit failed: ' + (data.reason || response.status || 'unknown');
            return;
          }
          if (copyStatus) copyStatus.textContent = 'Submitted for operator review. SuperMega can prepare the first proof after owner review.';
        } catch (error) {
          if (copyStatus) copyStatus.textContent = 'Submit failed. Copy the JSON and send it to SuperMega.';
        } finally {
          submit.disabled = false;
        }
      });
      var copy = document.getElementById('copy-source-pack');
      if (copy) copy.addEventListener('click', async function(){
        render();
        try {
          await navigator.clipboard.writeText(output.textContent || '');
          if (copyStatus) copyStatus.textContent = 'Copied. You can also submit it here for operator review.';
        } catch (error) {
          if (copyStatus) copyStatus.textContent = 'Copy failed. Select the JSON manually and copy it.';
        }
      });
      render();
    })();
  </script>
</body>
</html>`
await mkdir(resolve(staticDir, 'app', 'source-pack'), { recursive: true })
await writeFile(resolve(staticDir, 'app', 'source-pack', 'index.html'), publicSourcePackIntakeHtml, 'utf8')
const publicPilotWorkspaceHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Private Pilot Workspace | SUPERMEGA.dev</title>
  <meta name="description" content="Approval-only SuperMega private pilot workspace handoff." />
  <meta name="theme-color" content="#1b1815" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
  <style>
    :root { color-scheme: light; --paper:#f4efe6; --ink:#1b1815; --muted:#6f675d; --line:rgba(27,24,21,.16); --panel:#fffaf1; --panel2:#ebe2d3; --accent:#FF3B3B; --green:#1c8a5a; --blue:#255f99; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--paper); color: var(--ink); font-family: "Aptos", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
    a { color: inherit; }
    main { width: min(1180px, calc(100% - 28px)); margin: 0 auto; padding: 24px 0 56px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0 22px; border-bottom: 1px solid var(--line); }
    .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; font-weight: 900; }
    .mark { width: 38px; height: 38px; border-radius: 12px; background: #1b1815; display: grid; place-items: center; border: 1px solid rgba(27,24,21,.22); }
    .mark img { width: 100%; height: 100%; display: block; border-radius: inherit; }
    .top-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .btn { border: 1px solid var(--line); border-radius: 999px; padding: 11px 14px; background: var(--panel); color: var(--ink); font-weight: 850; text-decoration: none; cursor: pointer; }
    .btn.primary { background: var(--ink); color: var(--paper); border-color: var(--ink); }
    .btn:focus-visible, input:focus-visible, textarea:focus-visible { outline: 3px solid rgba(255,59,59,.28); outline-offset: 2px; }
    .hero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 420px); gap: 16px; align-items: stretch; padding: 28px 0 18px; }
    .workspace-title { padding: clamp(22px, 4vw, 42px) 0; }
    .eyebrow { color: var(--accent); font-size: 12px; font-weight: 950; text-transform: uppercase; letter-spacing: 0; }
    h1 { margin: 10px 0 0; max-width: 13ch; font-size: clamp(46px, 8vw, 86px); line-height: .9; letter-spacing: 0; }
    p { color: var(--muted); font-size: 17px; line-height: 1.55; margin: 14px 0 0; max-width: 55rem; }
    .summary { border: 1px solid var(--line); background: var(--panel); border-radius: 8px; padding: 18px; display: grid; gap: 12px; align-content: start; }
    .summary-row { display: grid; grid-template-columns: 128px 1fr; gap: 10px; align-items: start; padding: 10px 0; border-bottom: 1px solid var(--line); }
    .summary-row:last-child { border-bottom: 0; }
    .summary-row span { color: var(--muted); font-size: 12px; font-weight: 900; text-transform: uppercase; }
    .summary-row strong { overflow-wrap: anywhere; }
    .band { margin-top: 16px; border-top: 1px solid var(--line); padding-top: 22px; }
    .section-title { display: flex; align-items: end; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
    .section-title h2 { margin: 0; font-size: clamp(24px, 3vw, 38px); letter-spacing: 0; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .card { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 16px; min-height: 150px; }
    .card span { display: block; color: var(--accent); font-size: 11px; font-weight: 950; text-transform: uppercase; letter-spacing: 0; }
    .card strong { display: block; margin-top: 10px; font-size: 20px; letter-spacing: 0; }
    .card p { font-size: 14px; margin-top: 8px; }
    .artifact-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .artifact { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 16px; display: grid; gap: 12px; min-width: 0; }
    .artifact.wide { grid-column: 1 / -1; }
    .artifact-header { display: flex; align-items: start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .artifact-header span { display: block; color: var(--accent); font-size: 11px; font-weight: 950; text-transform: uppercase; letter-spacing: 0; }
    .artifact-header strong { display: block; margin-top: 6px; font-size: 20px; letter-spacing: 0; }
    textarea { width: 100%; min-height: 220px; resize: vertical; border: 1px solid var(--line); border-radius: 8px; background: rgba(255,250,241,.72); color: var(--ink); padding: 14px; font: 13px/1.45 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace; }
    #first-run-queue { min-height: 150px; }
    .run-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .run-form label { display: grid; gap: 7px; color: var(--muted); font-size: 12px; font-weight: 900; text-transform: uppercase; }
    .run-form label.wide { grid-column: 1 / -1; }
    .run-form textarea { min-height: 130px; }
    .run-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .queue { display: grid; gap: 10px; }
    .queue-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 14px; }
    .step { width: 28px; height: 28px; border-radius: 999px; display: grid; place-items: center; background: var(--ink); color: var(--paper); font-weight: 950; }
    .pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 7px 9px; background: rgba(28,138,90,.1); color: var(--green); font-size: 11px; font-weight: 950; text-transform: uppercase; white-space: nowrap; }
    .operator-panel { display: grid; gap: 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel2); padding: 16px; }
    .operator-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
    input { width: 100%; border: 1px solid var(--line); border-radius: 999px; padding: 12px 14px; background: var(--panel); color: var(--ink); font: inherit; }
    pre { margin: 0; overflow: auto; white-space: pre-wrap; border: 1px solid var(--line); border-radius: 8px; background: rgba(255,250,241,.7); padding: 14px; font-size: 13px; line-height: 1.45; }
    footer { margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
    @media (max-width: 820px) { .hero, .grid, .artifact-grid, .run-form { grid-template-columns: 1fr; } .artifact.wide, .run-form label.wide { grid-column: auto; } header { align-items: flex-start; } .summary-row, .operator-form { grid-template-columns: 1fr; } .queue-row { grid-template-columns: auto minmax(0, 1fr); } .queue-row .pill { grid-column: 2; width: fit-content; } }
  </style>
</head>
<body>
  <main>
    <header>
      <a class="brand" href="/" aria-label="SUPERMEGA.dev home"><span style="display:inline-flex;align-items:center;flex:none" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6.5 8 L11 12 L6.5 16" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.6 16.2 L18 16.2" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round"/></svg></span><span class="wm" style="letter-spacing:-0.025em"><b style="font-weight:700">supermega</b><b style="color:#5E6B87;font-weight:500">.dev</b></span></a>
      <nav class="top-actions" aria-label="Workspace actions">
        <a class="btn" href="/operator/">Operator console</a>
        <a class="btn primary" href="/contact/">Start another pilot</a>
      </nav>
    </header>
    <section class="hero">
      <div class="workspace-title">
        <div class="eyebrow">approval_only paid pilot</div>
        <h1>Private Pilot Workspace</h1>
        <p>This room turns the approved first proof into the first production run. It is built for enterprise delivery: source trace, owner approval, no external sends, and no connector writes until the client accepts the run.</p>
      </div>
      <aside class="summary" aria-label="Workspace summary">
        <div class="summary-row"><span>Workspace</span><strong data-workspace-slug>Loading</strong></div>
        <div class="summary-row"><span>Lead</span><strong data-lead-id>Loading</strong></div>
        <div class="summary-row"><span>Mode</span><strong>approval_only</strong></div>
        <div class="summary-row"><span>Gate</span><strong data-delivery-gate>approval_only_until_owner_acceptance</strong></div>
        <div class="summary-row"><span>Revenue</span><strong>Proof-backed MRR: 0</strong></div>
      </aside>
    </section>
    <section class="band">
      <div class="section-title">
        <h2>Client delivery room</h2>
        <span class="pill" data-delivery-status>workspace_delivery_room_ready</span>
      </div>
      <div class="grid">
        <article class="card"><span>Status</span><strong data-next-action>record_first_production_run</strong><p>The next operator move is to run the first useful output inside this workspace, then request owner acceptance.</p></article>
        <article class="card"><span>Client boundary</span><strong>Approval-only until accepted</strong><p>All browser, email, payment, POS, CRM, and sheet actions stay blocked until the client accepts the first production run.</p></article>
        <article class="card"><span>Revenue rule</span><strong>Setup cash is not MRR</strong><p>Payment proof can unlock delivery. Recurring revenue is still zero until a recurring payment proof is recorded.</p></article>
      </div>
    </section>
    <section class="band">
      <div class="section-title">
        <h2>Delivery artifacts</h2>
        <span class="pill">copy-ready</span>
      </div>
      <div class="artifact-grid">
        <article class="artifact">
          <div class="artifact-header">
            <div><span>Client kickoff packet</span><strong>What the client approves and provides</strong></div>
            <button class="btn" type="button" data-copy-target="kickoff-packet">Copy kickoff packet</button>
          </div>
          <textarea id="kickoff-packet" readonly># Client kickoff packet

Status: workspace_delivery_room_ready
Gate: approval_only_until_owner_acceptance
Goal: turn the approved first proof into a useful first production run.
Access needed: approved screenshots, exports, folders, files, or threads only.
No external sends, connector writes, account changes, or payment actions until owner acceptance.</textarea>
        </article>
        <article class="artifact">
          <div class="artifact-header">
            <div><span>Proof delivery packet</span><strong>What the first run must prove</strong></div>
            <button class="btn" type="button" data-copy-target="proof-packet">Copy proof packet</button>
          </div>
          <textarea id="proof-packet" readonly># Proof delivery packet

Result: first useful output goes here.
Source trace: attach the approved source that created each important claim or task.
Acceptance: client marks accepted, changes requested, or blocked.
External actions: blocked until owner acceptance.</textarea>
        </article>
        <article class="artifact wide">
          <div class="artifact-header">
            <div><span>First production run queue</span><strong>Operator queue for the paid pilot</strong></div>
            <button class="btn" type="button" data-copy-target="first-run-queue">Copy first run queue</button>
          </div>
          <textarea id="first-run-queue" readonly>"workspace_slug","lead_id","step_id","title","owner","external_action_state","evidence_required","real_mrr_delta"
"workspace-required","lead-required","import_approved_sources","Import only buyer-approved sample sources","Revenue Pod","manual_owner_approved","source_trace","0"
"workspace-required","lead-required","build_first_production_run","Build the first approval-only agent run","Delivery Pod","not_sent","first_run_output","0"
"workspace-required","lead-required","owner_acceptance_review","Collect owner acceptance before live connector writes or sends","Founder","approval_required","acceptance_checklist","0"</textarea>
        </article>
      </div>
    </section>
    <section class="band">
      <div class="section-title">
        <h2>Record first production run</h2>
        <span class="pill">protected write</span>
      </div>
      <div class="operator-panel">
        <p>Use this after the workspace output is drafted. It calls <code>operation: 'record_first_production_run'</code> with <code>first_run_output</code>, <code>first_run_evidence_reference</code>, and <code>source_trace</code>. Success should move the action to <code>first_run_output_ready</code> and the run to <code>ready_for_owner_acceptance</code>. No external send, connector write, browser action, or payment action is triggered.</p>
        <div class="run-form">
          <label>Evidence reference<input id="first-run-evidence-reference" autocomplete="off" placeholder="workspace output URL, file, screenshot, or internal evidence id" /></label>
          <label>Source trace<textarea id="first-run-source-trace" placeholder="One approved source per line: Gmail thread, Sheet row, POS export, screenshot, file, folder..."></textarea></label>
          <label class="wide">First run output<textarea id="first-run-output" placeholder="Paste the first useful production output that the owner should accept or reject."></textarea></label>
        </div>
        <div class="run-actions">
          <span class="pill">approval_only_until_owner_acceptance</span>
          <button id="record-first-run" class="btn primary" type="button">Record first run</button>
        </div>
        <pre id="first-run-record-status">Waiting for operator key and first run output.</pre>
      </div>
    </section>
    <section class="band">
      <div class="section-title">
        <h2>Submit first-run acceptance</h2>
        <span class="pill">client write</span>
      </div>
      <div class="operator-panel">
        <p>Submitting stores the first-run decision for operator review only. It posts to <code>/api/first-run-acceptance-submissions</code> as <code>first_run_acceptance_submitted</code>; no external send, connector write, browser action, payment action, or recurring revenue claim is triggered.</p>
        <div class="run-form">
          <label>Decision<select id="first-run-client-decision"><option value="accepted">Accepted</option><option value="changes_requested">Changes requested</option></select></label>
          <label>First-run excerpt<textarea id="first-run-packet-excerpt" placeholder="Optional: paste the output or short excerpt you are accepting or requesting changes on."></textarea></label>
          <label class="wide">Client note<textarea id="first-run-client-note" placeholder="What worked? What should change before this becomes the next run or managed retainer?"></textarea></label>
        </div>
        <div class="run-actions">
          <span class="pill">operator owner-acceptance review required</span>
          <button id="submit-first-run-acceptance" class="btn primary" type="button">Submit first-run acceptance</button>
        </div>
        <pre id="first-run-acceptance-status">Waiting for client decision.</pre>
      </div>
    </section>
    <section class="band">
      <div class="section-title">
        <h2>First run queue</h2>
        <span class="pill">owner gated</span>
      </div>
      <div class="queue">
        <div class="queue-row"><span class="step">1</span><div><strong>Import approved sources</strong><p>Use only client-approved screenshots, files, exports, folders, or threads. Keep a source trace for important outputs.</p></div><span class="pill">manual source</span></div>
        <div class="queue-row"><span class="step">2</span><div><strong>Build the first production run</strong><p>Draft the useful output inside the workspace. External sends stay blocked until owner approval.</p></div><span class="pill">not sent</span></div>
        <div class="queue-row"><span class="step">3</span><div><strong>Owner acceptance review</strong><p>No connector writes without owner acceptance. Record accepted, changes requested, or blocked with evidence.</p></div><span class="pill">approval required</span></div>
      </div>
    </section>
    <section class="band">
      <div class="section-title">
        <h2>Delivery controls</h2>
        <span class="pill">enterprise rails</span>
      </div>
      <div class="grid">
        <article class="card"><span>Guardrail</span><strong>No connector writes without owner acceptance</strong><p>Browser actions, Gmail, Sheets, POS, CRM, and payment actions stay approval-only until the client signs off.</p></article>
        <article class="card"><span>Evidence</span><strong>Source trace before trust</strong><p>The first run must show what source created each important claim, decision, or follow-up action.</p></article>
        <article class="card"><span>Money</span><strong>Proof-backed MRR: 0</strong><p>Drafts, offers, and workspaces do not count as MRR. Only attached payment proof changes the revenue ledger.</p></article>
      </div>
    </section>
    <section class="band">
      <div class="section-title">
        <h2>Operator status</h2>
        <span class="pill">optional live check</span>
      </div>
      <div class="operator-panel">
        <p>Paste the operator key to load live status from <code>/api/pipeline-control/status</code>. The loader reads <code>actions</code> or <code>recent_actions</code> and includes <code>datastore_failover_report</code> and <code>operator_runtime_summary</code> so degraded SQL never hides the client onboarding state.</p>
        <div class="operator-form">
          <input id="ops-key" type="password" autocomplete="off" placeholder="SUPERMEGA_OPS_KEY" aria-label="Operator key" />
          <button id="load-status" class="btn primary" type="button">Load operator status</button>
        </div>
        <pre id="workspace-status">Waiting for operator key.</pre>
      </div>
    </section>
    <footer>Private pilot workspace handoff. This page is noindex and approval-only; use the operator console for protected actions.</footer>
  </main>
  <script>
    (function(){
      var params = new URLSearchParams(window.location.search);
      var workspace = (params.get('workspace') || 'workspace-required').slice(0, 96);
      var lead = (params.get('lead') || 'lead-required').slice(0, 64);
      var currentActionId = (params.get('action') || '').slice(0, 64);
      var workspaceEl = document.querySelector('[data-workspace-slug]');
      var leadEl = document.querySelector('[data-lead-id]');
      var deliveryStatusEl = document.querySelector('[data-delivery-status]');
      var deliveryGateEl = document.querySelector('[data-delivery-gate]');
      var nextActionEl = document.querySelector('[data-next-action]');
      var kickoffEl = document.getElementById('kickoff-packet');
      var proofEl = document.getElementById('proof-packet');
      var queueEl = document.getElementById('first-run-queue');
      var statusEl = document.getElementById('workspace-status');
      var runStatusEl = document.getElementById('first-run-record-status');
      var runOutputEl = document.getElementById('first-run-output');
      var runEvidenceEl = document.getElementById('first-run-evidence-reference');
      var runSourceTraceEl = document.getElementById('first-run-source-trace');
      var clientDecisionEl = document.getElementById('first-run-client-decision');
      var clientNoteEl = document.getElementById('first-run-client-note');
      var firstRunExcerptEl = document.getElementById('first-run-packet-excerpt');
      var acceptanceStatusEl = document.getElementById('first-run-acceptance-status');
      if (workspaceEl) workspaceEl.textContent = workspace;
      if (leadEl) leadEl.textContent = lead;
      function defaultKickoff(manifest) {
        return [
          '# Client kickoff packet',
          '',
          'Status: ' + (manifest.delivery_room_status || 'workspace_delivery_room_ready'),
          'Workspace: ' + (manifest.workspace_slug || workspace),
          'Lead: ' + (manifest.lead_id || lead),
          'Gate: ' + (manifest.workspace_delivery_gate || 'approval_only_until_owner_acceptance'),
          'Goal: turn the approved first proof into a useful first production run.',
          'Access needed: approved screenshots, exports, folders, files, or threads only.',
          'No external sends, connector writes, account changes, or payment actions until owner acceptance.'
        ].join('\\n');
      }
      function defaultProof(manifest) {
        return [
          '# Proof delivery packet',
          '',
          'Workspace: ' + (manifest.workspace_slug || workspace),
          'Result: first useful output goes here.',
          'Source trace: attach the approved source that created each important claim or task.',
          'Acceptance: client marks accepted, changes requested, or blocked.',
          'External actions: blocked until owner acceptance.'
        ].join('\\n');
      }
      function defaultQueue(manifest) {
        var slug = manifest.workspace_slug || workspace;
        var leadId = manifest.lead_id || lead;
        return [
          '"workspace_slug","lead_id","step_id","title","owner","external_action_state","evidence_required","real_mrr_delta"',
          '"' + slug + '","' + leadId + '","import_approved_sources","Import only buyer-approved sample sources","Revenue Pod","manual_owner_approved","source_trace","0"',
          '"' + slug + '","' + leadId + '","build_first_production_run","Build the first approval-only agent run","Delivery Pod","not_sent","first_run_output","0"',
          '"' + slug + '","' + leadId + '","owner_acceptance_review","Collect owner acceptance before live connector writes or sends","Founder","approval_required","acceptance_checklist","0"'
        ].join('\\n');
      }
      function applyManifest(manifest) {
        manifest = manifest || {};
        if (deliveryStatusEl) deliveryStatusEl.textContent = manifest.delivery_room_status || 'workspace_delivery_room_ready';
        if (deliveryGateEl) deliveryGateEl.textContent = manifest.workspace_delivery_gate || 'approval_only_until_owner_acceptance';
        if (nextActionEl) nextActionEl.textContent = manifest.next_operator_action || 'record_first_production_run';
        if (kickoffEl) kickoffEl.value = manifest.client_kickoff_packet || defaultKickoff(manifest);
        if (proofEl) proofEl.value = manifest.proof_delivery_packet || defaultProof(manifest);
        if (queueEl) queueEl.value = manifest.first_run_queue_csv || defaultQueue(manifest);
      }
      applyManifest({
        workspace_slug: workspace,
        lead_id: lead,
        delivery_room_status: 'workspace_delivery_room_ready',
        workspace_delivery_gate: 'approval_only_until_owner_acceptance',
        next_operator_action: 'record_first_production_run'
      });
      function setStatus(value) {
        if (!statusEl) return;
        statusEl.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      }
      function getOpsKey() {
        return (document.getElementById('ops-key') && document.getElementById('ops-key').value || '').trim();
      }
      function setRunStatus(value) {
        if (!runStatusEl) return;
        runStatusEl.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      }
      function setAcceptanceStatus(value) {
        if (!acceptanceStatusEl) return;
        acceptanceStatusEl.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      }
      function summarize(action, payload) {
        var room = action && action.first_proof && action.first_proof.pilot_order_room ? action.first_proof.pilot_order_room : {};
        var manifest = room.private_workspace_manifest || {};
        if (action && action.action_id) currentActionId = action.action_id;
        if (firstRunExcerptEl && room.first_production_run_packet && !firstRunExcerptEl.value) firstRunExcerptEl.value = String(room.first_production_run_packet).slice(0, 1800);
        applyManifest(manifest);
        return {
          status: action ? action.status : 'not_found',
          workspace_slug: manifest.workspace_slug || workspace,
          lead_id: action ? action.lead_id : lead,
          first_proof: action && action.first_proof ? action.first_proof.status : 'not_loaded',
          workspace_status: manifest.status || 'not_loaded',
          delivery_room_status: manifest.delivery_room_status || 'workspace_delivery_room_ready',
          workspace_delivery_gate: manifest.workspace_delivery_gate || 'approval_only_until_owner_acceptance',
          next_operator_action: manifest.next_operator_action || 'record_first_production_run',
          first_run_mode: manifest.first_run_mode || 'approval_only',
          datastore_failover_report: payload && payload.datastore_failover_report ? {
            status: payload.datastore_failover_report.status,
            operator_mode: payload.datastore_failover_report.operator_mode,
            client_onboarding_allowed: payload.datastore_failover_report.client_onboarding_allowed,
            real_mrr_policy: payload.datastore_failover_report.real_mrr_policy
          } : null,
          operator_runtime_summary: payload && payload.operator_runtime_summary ? payload.operator_runtime_summary : 'Runtime status not loaded.',
          proof_backed_mrr_mmk: payload && payload.metrics ? payload.metrics.proof_backed_mrr_mmk : 0,
          next_step: action ? action.next_step : 'Open the operator console and confirm the order room exists.'
        };
      }
      var loadButton = document.getElementById('load-status');
      if (loadButton) {
        loadButton.addEventListener('click', async function(){
          var key = getOpsKey();
          if (!key) { setStatus('Paste the ops key first.'); return; }
          setStatus('Loading /api/pipeline-control/status...');
          try {
            var response = await fetch('/api/pipeline-control/status', { cache: 'no-store', headers: { authorization: 'Bearer ' + key, accept: 'application/json' } });
            var payload = await response.json().catch(function(){ return { status: 'error', reason: 'invalid_json', code: response.status }; });
            if (!response.ok) { setStatus(payload); return; }
          var actions = Array.isArray(payload.actions) ? payload.actions : (Array.isArray(payload.recent_actions) ? payload.recent_actions : []);
            var match = actions.find(function(action){
              var room = action && action.first_proof && action.first_proof.pilot_order_room ? action.first_proof.pilot_order_room : {};
              var manifest = room.private_workspace_manifest || {};
              return action.lead_id === lead || action.action_id === lead || manifest.workspace_slug === workspace;
            });
            setStatus(summarize(match, payload));
          } catch (error) {
            setStatus({ status: 'error', reason: String(error && error.message || error) });
          }
        });
      }
      var recordFirstRunButton = document.getElementById('record-first-run');
      if (recordFirstRunButton) {
        recordFirstRunButton.addEventListener('click', async function(){
          var key = getOpsKey();
          var firstRunOutput = (runOutputEl && runOutputEl.value || '').trim();
          var evidenceReference = (runEvidenceEl && runEvidenceEl.value || '').trim();
          var sourceTrace = (runSourceTraceEl && runSourceTraceEl.value || '')
            .split(/\\r?\\n/)
            .map(function(item){ return item.trim(); })
            .filter(Boolean);
          if (!key) { setRunStatus('Paste the ops key first.'); return; }
          if (!firstRunOutput) { setRunStatus('Add the first_run_output first.'); return; }
          if (!evidenceReference) { setRunStatus('Add the first_run_evidence_reference first.'); return; }
          setRunStatus('Recording first production run...');
          try {
            var response = await fetch('/api/pipeline-control', {
              method: 'POST',
              cache: 'no-store',
              headers: {
                authorization: 'Bearer ' + key,
                accept: 'application/json',
                'content-type': 'application/json'
              },
              body: JSON.stringify({
                operation: 'record_first_production_run',
                action_id: currentActionId,
                lead_id: lead,
                first_run_output: firstRunOutput,
                first_run_evidence_reference: evidenceReference,
                source_trace: sourceTrace
              })
            });
            var payload = await response.json().catch(function(){ return { status: 'error', reason: 'invalid_json', code: response.status }; });
            if (!response.ok) { setRunStatus(payload); return; }
            setRunStatus({
              status: payload.status,
              operation_status: payload.operation_status,
              action_status: payload.action ? payload.action.status : 'not_returned',
              first_run_status: payload.first_production_run ? payload.first_production_run.status : 'not_returned',
              first_run_state: payload.first_production_run ? payload.first_production_run.first_run_state : 'not_returned',
              external_action_state: payload.first_production_run ? payload.first_production_run.external_action_state : 'approval_only_until_owner_acceptance',
              real_mrr_delta: payload.first_production_run ? payload.first_production_run.real_mrr_delta : 0,
              next_step: payload.action ? payload.action.next_step : 'Prepare owner acceptance before any external send or connector write.'
            });
          } catch (error) {
            setRunStatus({ status: 'error', reason: String(error && error.message || error) });
          }
        });
      }
      var submitFirstRunAcceptanceButton = document.getElementById('submit-first-run-acceptance');
      if (submitFirstRunAcceptanceButton) {
        submitFirstRunAcceptanceButton.addEventListener('click', async function(){
          var decision = (clientDecisionEl && clientDecisionEl.value || '').trim();
          var clientNote = (clientNoteEl && clientNoteEl.value || '').trim();
          var firstRunExcerpt = (firstRunExcerptEl && firstRunExcerptEl.value || '').trim();
          if (!currentActionId) { setAcceptanceStatus('Missing action id. Open this room with ?action=TASK_ID or ask the operator to load status first.'); return; }
          if (!decision) { setAcceptanceStatus('Choose accepted or changes_requested first.'); return; }
          setAcceptanceStatus('Submitting first-run acceptance...');
          try {
            var response = await fetch('/api/first-run-acceptance-submissions', {
              method: 'POST',
              cache: 'no-store',
              headers: {
                accept: 'application/json',
                'content-type': 'application/json'
              },
              body: JSON.stringify({
                action_id: currentActionId,
                lead_id: lead,
                decision: decision,
                client_note: clientNote,
                first_run_packet_excerpt: firstRunExcerpt
              })
            });
            var payload = await response.json().catch(function(){ return { status: 'error', reason: 'invalid_json', code: response.status }; });
            if (!response.ok || payload.status !== 'ready') { setAcceptanceStatus(payload); return; }
            setAcceptanceStatus({
              status: payload.status,
              submission_status: payload.submission_status,
              first_run_acceptance_status: payload.first_run_acceptance ? payload.first_run_acceptance.status : 'not_returned',
              decision: payload.first_run_acceptance ? payload.first_run_acceptance.decision : decision,
              action_status: payload.action ? payload.action.status : 'not_returned',
              next_gate: payload.first_run_acceptance ? payload.first_run_acceptance.next_gate : 'operator_owner_acceptance_record_required',
              external_action_state: payload.first_run_acceptance ? payload.first_run_acceptance.external_action_state : 'blocked_until_operator_owner_acceptance',
              connector_write_state: payload.first_run_acceptance ? payload.first_run_acceptance.connector_write_state : 'blocked_until_operator_owner_acceptance',
              recurring_revenue_state: payload.first_run_acceptance ? payload.first_run_acceptance.recurring_revenue_state : 'not_claimed',
              real_mrr_delta: payload.first_run_acceptance ? payload.first_run_acceptance.real_mrr_delta : 0,
              message: 'Submitted for operator owner-acceptance review.'
            });
          } catch (error) {
            setAcceptanceStatus({ status: 'error', reason: String(error && error.message || error) });
          }
        });
      }
      document.querySelectorAll('[data-copy-target]').forEach(function(button){
        button.addEventListener('click', async function(){
          var target = document.getElementById(button.getAttribute('data-copy-target'));
          if (!target) return;
          var original = button.textContent;
          try {
            await navigator.clipboard.writeText(target.value || target.textContent || '');
            button.textContent = 'Copied';
          } catch (_error) {
            target.focus();
            target.select();
            button.textContent = 'Select and copy';
          }
          setTimeout(function(){ button.textContent = original; }, 1400);
        });
      });
    })();
  </script>
</body>
</html>`
await mkdir(resolve(staticDir, 'app', 'start'), { recursive: true })
await writeFile(resolve(staticDir, 'app', 'start', 'index.html'), publicPilotWorkspaceHtml, 'utf8')
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
  <meta name="theme-color" content="#0A0E1C" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
  <style>${unicornShellStyle}</style>
</head>
<body>
<div class="wrap">
  <script>(function(){try{var t=localStorage.getItem('sm-theme');if(!t){t='dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
  <header>
    <a class="brand" href="/" aria-label="SUPERMEGA.dev home">
      <span style="display:inline-flex;align-items:center;flex:none" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6.5 8 L11 12 L6.5 16" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.6 16.2 L18 16.2" stroke="#FF3B3B" stroke-width="2.6" stroke-linecap="round"/></svg></span>
      <span class="brand-text"><span class="wm" style="font-size:18px;letter-spacing:-0.025em"><b style="font-weight:700">supermega</b><b style="color:#5E6B87;font-weight:500">.dev</b></span></span>
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
${publicRuntimeScripts}
</body>
</html>`
await mkdir(resolve(staticDir, 'privacy'), { recursive: true })
await writeFile(resolve(staticDir, 'privacy', 'index.html'), unicornPrivacyHtml, 'utf8')
await mkdir(resolve(staticDir, 'machine'), { recursive: true })
await writeFile(resolve(staticDir, 'machine', 'index.html'), normalizePublicProductNames(publicMachineHtml), 'utf8')
await mkdir(resolve(staticDir, 'card'), { recursive: true })
await writeFile(resolve(staticDir, 'card', 'index.html'), publicCardHtml, 'utf8')
// MegaOS Command Center — dark-direction preview (ADDITIVE + noindex). Serves the committed
// reference page from brand/megaos/ so the chosen new brand is viewable as a REAL site page at
// /megaos-preview/, not just a claude.ai artifact. Touches no existing page. NOT the live brand
// yet — the full rebrand rollout is held for the founder's explicit go on the SUPERMEGA→MegaOS name.
await mkdir(resolve(staticDir, 'megaos-preview'), { recursive: true })
const megaosPreviewBody = await readFile(resolve(root, 'brand', 'megaos', 'reference-app-home.html'), 'utf8').catch(() => '')
if (megaosPreviewBody) {
  await writeFile(
    resolve(staticDir, 'megaos-preview', 'index.html'),
    `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="UTF-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n<meta name="robots" content="noindex,nofollow" />\n<title>MegaOS — dark direction preview</title>\n</head>\n<body>\n${megaosPreviewBody}\n</body>\n</html>\n`,
    'utf8',
  )
}
// Demo hub (source lives in C:/sm-site, outside OneDrive) served at /demo/
await mkdir(resolve(staticDir, 'demo'), { recursive: true })
await cp('C:/sm-site/supermega-demo/index.html', resolve(staticDir, 'demo', 'index.html'), { force: true }).catch(() => undefined)
await cp('C:/sm-site/supermega-demo/favicon.svg', resolve(staticDir, 'demo', 'favicon.svg'), { force: true }).catch(() => undefined)
await writeFile(resolve(staticDir, 'robots.txt'), 'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /app/\nDisallow: /clients/\nDisallow: /machine/\nDisallow: /operator/\nSitemap: https://supermega.dev/sitemap.xml\n', 'utf8')
await writeFile(resolve(staticDir, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://supermega.dev/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n  <url><loc>https://supermega.dev/products/</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>\n  <url><loc>https://supermega.dev/products/pos/</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n  <url><loc>https://supermega.dev/products/factory/</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n  <url><loc>https://supermega.dev/products/documents/</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n  <url><loc>https://supermega.dev/free/</loc><changefreq>weekly</changefreq><priority>0.86</priority></url>\n  <url><loc>https://supermega.dev/ai-agents/</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n  <url><loc>https://supermega.dev/agent-templates/</loc><changefreq>weekly</changefreq><priority>0.85</priority></url>\n  <url><loc>https://supermega.dev/agent-templates/deskpos-quickstart/</loc><changefreq>weekly</changefreq><priority>0.72</priority></url>\n  <url><loc>https://supermega.dev/agent-templates/chat-ledger/</loc><changefreq>weekly</changefreq><priority>0.72</priority></url>\n  <url><loc>https://supermega.dev/agent-templates/inbox-calendar-operator/</loc><changefreq>weekly</changefreq><priority>0.72</priority></url>\n  <url><loc>https://supermega.dev/agent-templates/daily-intelligence-brief/</loc><changefreq>weekly</changefreq><priority>0.72</priority></url>\n  <url><loc>https://supermega.dev/agent-templates/factory-ops-ledger/</loc><changefreq>weekly</changefreq><priority>0.72</priority></url>\n  <url><loc>https://supermega.dev/agent-templates/data-clean-report-agent/</loc><changefreq>weekly</changefreq><priority>0.72</priority></url>\n  <url><loc>https://supermega.dev/offers/</loc><changefreq>weekly</changefreq><priority>0.95</priority></url>\n  <url><loc>https://supermega.dev/work/</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n  <url><loc>https://supermega.dev/contact/</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>\n  <url><loc>https://supermega.dev/card/</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>\n  <url><loc>https://supermega.dev/privacy/</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>\n</urlset>\n', 'utf8')
const publicSitemapUrls = [
  ['/', 'weekly', '1.0'],
  ['/products/', 'weekly', '0.9'],
  ['/products/pos/', 'weekly', '0.8'],
  ['/products/factory/', 'weekly', '0.8'],
  ['/products/documents/', 'weekly', '0.8'],
  ['/free/', 'weekly', '0.86'],
  ['/ai-agents/', 'weekly', '0.8'],
  ['/ai-agents/guide/', 'weekly', '0.82'],
  ['/agent-templates/', 'weekly', '0.85'],
  ...publicAgentTemplateStarterKits.map((kit) => [kit.contact_url.replace('/contact/?template=', '/agent-templates/') + '/', 'weekly', '0.72']),
  ['/offers/', 'weekly', '0.95'],
  ['/work/', 'weekly', '0.8'],
  ['/contact/', 'monthly', '0.9'],
  ['/card/', 'monthly', '0.6'],
  ['/privacy/', 'yearly', '0.3'],
]
await writeFile(
  resolve(staticDir, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${publicSitemapUrls
    .map(([path, changefreq, priority]) => `  <url><loc>https://supermega.dev${path}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`)
    .join('\n')}\n</urlset>\n`,
  'utf8',
)
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
await writeNodeFunction('source-pack-submissions.js')
await writeNodeFunction('proof-review-submissions.js')
await writeNodeFunction('first-run-acceptance-submissions.js')
await writeNodeFunction('pilot-payment-submissions.js')
await writeNodeFunction('campaign-clicks.js')
await writeNodeFunction('behavior-events.js')
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
await mkdir(resolve(staticDir, 'free'), { recursive: true })
await writeFile(resolve(staticDir, 'free', 'index.html'), normalizePublicProductNames(publicSourceToScreenHtml), 'utf8')
await writeFile(
  resolve(staticDir, 'private-not-found.html'),
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Not found</title><body>Not found.</body></html>\n',
  'utf8',
)
await writeFile(resolve(outputDir, 'config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8')

console.log('public_vercel_output=ready')
