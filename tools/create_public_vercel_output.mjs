import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

const root = process.cwd()
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
  return canonFounderLockedProductNames(
    String(content)
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
  )
}

// Terminal product-name canon (founder-locked 2026-07-10): collapse every retired display
// name — including the intermediate targets produced by normalizePublicProductNames above —
// to the two founder-locked names Shop (the counter app; was DeskPOS / Retail OS / Restaurant
// POS + Inventory) and Plant (operations/ERP; was Factory OS / Factory Operations App).
// Touches only human-readable display strings, never lowercase slugs / ids / query params, so
// it is safe to apply to raw-copied pages (e.g. the demo hub) without breaking their routing.
function canonFounderLockedProductNames(content) {
  return String(content)
    .replace(/Restaurant POS \+ Inventory|Restaurant POS and Inventory/g, 'Shop')
    .replace(/\bRetail OS\b/g, 'Shop')
    .replace(/Factory Operations App|Factory & Operations App/g, 'Plant')
    .replace(/\bFactory OS\b/g, 'Plant')
    .replace(/\bDeskPOS\b/g, 'Shop')
}

const publicShellHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>SUPERMEGA.dev | Messy Work In, Useful Output Out</title>
    <meta name="description" content="Send a spreadsheet, folder, screenshot, PDF, email thread, or business question that slows your team down. Get one useful screen, record, or owner report." />
    <meta name="theme-color" content="#f7f4ed" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <link rel="manifest" href="/site.webmanifest?v=supermega-atelier-20260623" />
    <style>
      :root {
        color-scheme: light;
        --bg: #f7f4ed;
        --paper: #fffaf0;
        --card: #ffffff;
        --line: #ded6c7;
        --text: #14110c;
        --muted: #6f6a60;
        --blue: #2458ff;
        --cyan: #2458ff;
        --blue-soft: #e7edff;
        --ink: #ffffff;
      }
      * { box-sizing: border-box; }
      html { scroll-behavior: smooth; }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          linear-gradient(90deg, rgba(20, 17, 12, 0.035) 1px, transparent 1px),
          linear-gradient(180deg, rgba(20, 17, 12, 0.035) 1px, transparent 1px),
          var(--bg);
        background-size: 44px 44px;
        color: var(--text);
        font-family: "Aptos", "Segoe UI Variable", "Segoe UI", system-ui, -apple-system, sans-serif;
        text-rendering: optimizeLegibility;
        -webkit-font-smoothing: antialiased;
      }
      a { color: inherit; text-decoration: none; }
      .wrap { width: min(1120px, calc(100% - 32px)); margin: 0 auto; }
      header { display: flex; justify-content: space-between; align-items: center; padding: 22px 0; border-bottom: 1px solid var(--line); }
      .nav { display: flex; align-items: center; gap: 10px; }
      .brand { display: flex; gap: 12px; align-items: center; font-weight: 900; letter-spacing: -0.04em; }
      .mark { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px; background: var(--text); border: 1px solid var(--text); color: #ffffff; }
      .wordmark { display: grid; gap: 2px; }
      .wordmark small { color: var(--muted); font-size: 10px; font-weight: 850; letter-spacing: 0.22em; }
      .btn { border: 1px solid var(--line); border-radius: 999px; padding: 13px 18px; background: rgba(255,255,255,0.72); font-weight: 850; }
      .btn.primary, button { background: var(--blue); color: var(--ink); border-color: var(--blue); box-shadow: none; }
      main { padding: 24px 0 56px; }
      .hero { min-height: min(720px, calc(100svh - 110px)); display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 0.9fr); gap: clamp(22px, 5vw, 70px); align-items: center; }
      .copy { padding: clamp(6px, 2vw, 20px) 0; }
      .eyebrow { color: var(--cyan); font-size: 12px; font-weight: 950; letter-spacing: 0.2em; text-transform: uppercase; }
      h1 { margin: 18px 0 18px; max-width: 9.8ch; font-size: clamp(58px, 9vw, 118px); line-height: 0.86; letter-spacing: -0.085em; }
      p { color: var(--muted); font-size: clamp(18px, 2.1vw, 23px); line-height: 1.48; margin: 0; max-width: 34rem; }
      .cta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
      .hero-art { display: grid; gap: 14px; }
      .hero-shot { overflow: hidden; border: 1px solid var(--line); border-radius: 28px; background: var(--card); box-shadow: 0 24px 70px rgba(20,17,12,0.10); }
      .hero-shot img { display: block; width: 100%; aspect-ratio: 16 / 11; object-fit: cover; object-position: top left; background: #fbf7ef; }
      .caption { display: grid; gap: 6px; border: 1px solid var(--line); border-radius: 20px; background: rgba(255,255,255,0.78); padding: 16px; }
      .caption span { color: var(--blue); font-size: 11px; font-weight: 950; letter-spacing: 0.16em; text-transform: uppercase; }
      .caption strong { font-size: clamp(22px, 3vw, 34px); line-height: 0.96; letter-spacing: -0.055em; }
      .section { border-top: 1px solid var(--line); padding: 42px 0; }
      .split { display: grid; grid-template-columns: minmax(0, 0.92fr) minmax(320px, 1.08fr); gap: clamp(18px, 4vw, 38px); align-items: start; }
      h2 { margin: 0; max-width: 13ch; font-size: clamp(36px, 6vw, 72px); line-height: 0.92; letter-spacing: -0.07em; }
      .film { display: grid; gap: 12px; border: 1px solid var(--line); border-radius: 24px; padding: 18px; background: rgba(255,255,255,0.72); }
      .film-row { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; border-radius: 16px; border: 1px solid var(--line); background: #fbf7ef; padding: 14px; }
      .film-row b { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 999px; background: var(--blue); color: #ffffff; }
      .film-row strong { display: block; }
      .film-row small { color: var(--muted); font-weight: 760; }
      .pulse { min-width: 78px; border-radius: 999px; padding: 8px 10px; color: var(--blue); background: var(--blue-soft); text-align: center; font-size: 12px; font-weight: 950; }
      .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      .tile { border: 1px solid var(--line); border-radius: 20px; padding: 18px; background: var(--card); min-height: 132px; }
      .tile strong { display: block; margin-bottom: 10px; font-size: 19px; }
      .tile span { color: var(--muted); line-height: 1.45; }
      .cases { display: grid; gap: 10px; }
      .case { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 14px; align-items: center; border: 1px solid var(--line); border-radius: 20px; padding: 16px; background: var(--card); }
      .case b { display: block; margin-bottom: 5px; color: var(--blue); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; }
      .case strong { display: block; font-size: 18px; letter-spacing: -0.035em; }
      .case span { color: var(--muted); line-height: 1.38; }
      .arrow { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 999px; background: var(--text); color: #ffffff; font-weight: 950; }
      .shots { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      .shot { overflow: hidden; border: 1px solid var(--line); border-radius: 22px; background: var(--card); box-shadow: 0 20px 56px rgba(20,17,12,0.08); }
      .shot img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; object-position: top left; background: #fbf7ef; }
      .shot div { display: grid; gap: 6px; padding: 15px; }
      .shot strong { font-size: 17px; letter-spacing: -0.03em; }
      .shot span { color: var(--muted); line-height: 1.4; font-size: 14px; }
      form { display: grid; gap: 12px; border: 1px solid var(--line); border-radius: 24px; padding: clamp(18px, 3vw, 28px); background: var(--card); }
      label { display: grid; gap: 7px; color: var(--muted); font-size: 12px; font-weight: 950; letter-spacing: 0.14em; text-transform: uppercase; }
      input, textarea { width: 100%; border: 1px solid var(--line); border-radius: 14px; background: #fffdf8; color: var(--text); padding: 13px 14px; font: inherit; outline: none; }
      textarea { min-height: 112px; resize: vertical; }
      input:focus, textarea:focus { border-color: var(--blue); box-shadow: 0 0 0 4px rgba(36,88,255,0.12); }
      button { cursor: pointer; min-height: 50px; border: 0; border-radius: 999px; padding: 14px 18px; font: inherit; font-weight: 950; }
      .email { color: var(--blue); font-weight: 850; }
      footer { border-top: 1px solid var(--line); padding: 22px 0; color: var(--muted); font-weight: 760; }
      @media (max-width: 820px) {
        header { gap: 14px; align-items: flex-start; }
        .nav { justify-content: flex-end; flex-wrap: wrap; }
        .secondary-nav.optional-nav { display: none; }
        .wordmark small { display: none; }
        .btn { padding: 12px 15px; }
        .hero, .split, .cards, .shots, .case { grid-template-columns: 1fr; }
        .arrow { transform: rotate(90deg); }
        .hero { min-height: auto; padding: 28px 0 34px; }
        h1 { font-size: clamp(58px, 18vw, 82px); }
        .hero-shot { border-radius: 24px; }
        .cards { gap: 10px; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <a class="brand" href="/" aria-label="SUPERMEGA.dev home">
          <span class="mark"><img src="/favicon.svg" alt="" /></span>
          <span class="wordmark"><span>SUPERMEGA.dev</span><small>Messy work in. Useful output out.</small></span>
        </a>
        <nav class="nav" aria-label="Primary">
          <a class="btn secondary-nav" href="/products/">Examples</a>
          <a class="btn primary" href="/contact/">Contact</a>
        </nav>
      </header>
      <main>
        <section class="hero">
          <div class="copy">
            <h1>Messy work in. Useful output out.</h1>
            <p>Send the spreadsheet, folder, screenshot, PDF, email thread, or question that slows your team down. We return one clear result first.</p>
            <div class="cta">
              <a class="btn primary" href="/contact/">Send one source</a>
            </div>
          </div>
          <aside class="hero-art" aria-label="SuperMega product example">
            <a class="hero-shot" href="/products/#back-office-workflow-desk">
              <img src="/site/shots/live-demo-service-desk.png" alt="SuperMega product screen showing daily business work in one screen" loading="eager" decoding="async" />
            </a>
            <a class="caption" href="/products/#back-office-workflow-desk">
              <span>Example result</span>
              <strong>A real daily desk your team can open.</strong>
            </a>
          </aside>
        </section>
        <section class="section split" aria-label="Common client examples">
          <h2>Three easy starts.</h2>
          <div class="cases">
            <a class="case" href="/contact/?example=messy-list">
              <div><b>Send</b><strong>A spreadsheet nobody trusts.</strong><span>Old rows, missing owners, duplicate names.</span></div>
              <span class="arrow">-&gt;</span>
              <div><b>Get</b><strong>A clean work record.</strong><span>Owner, evidence, status, and next step.</span></div>
            </a>
            <a class="case" href="/contact/?example=manager-report">
              <div><b>Send</b><strong>"What happened this week?"</strong><span>The answer is spread across files and messages.</span></div>
              <span class="arrow">-&gt;</span>
              <div><b>Get</b><strong>One owner report.</strong><span>Risks, decisions, and the next move.</span></div>
            </a>
            <a class="case" href="/contact/?example=operations-issue">
              <div><b>Send</b><strong>Photos, invoices, and notes.</strong><span>The team keeps chasing the same proof.</span></div>
              <span class="arrow">-&gt;</span>
              <div><b>Get</b><strong>One work record with owner.</strong><span>Evidence, status, and closeout in one place.</span></div>
            </a>
          </div>
        </section>
        <section class="section split" aria-label="What gets built">
          <h2>What comes back.</h2>
          <div class="cards">
            <a class="tile" href="/products/#back-office-workflow-desk"><strong>Back Office Workflow Desk</strong><span>Source, owner, proof, status, and next action.</span></a>
            <a class="tile" href="/products/#factory-issues-maintenance-quality"><strong>Factory Operations App</strong><span>WCM, ISO evidence, CAPA, maintenance, receiving, and assets.</span></a>
            <a class="tile" href="/products/#restaurant-pos-menu-inventory"><strong>Restaurant POS + Inventory</strong><span>Menu, QR, orders, payment proof, stock, and daily close.</span></a>
          </div>
        </section>
        <section class="section split" aria-label="Real product screens">
          <h2>Examples you can recognize.</h2>
          <div class="shots">
            <a class="shot" href="/products/#back-office-workflow-desk">
              <img src="/site/shots/live-product-build-app-from-workflow.png" alt="Custom Workflow App product screen" loading="lazy" decoding="async" />
              <div><strong>Custom Workflow App</strong><span>One repeated process becomes a daily app screen.</span></div>
            </a>
            <a class="shot" href="/products/#factory-issues-maintenance-quality">
              <img src="/site/shots/live-demo-industrial-os.png" alt="Operations product screen" loading="lazy" decoding="async" />
              <div><strong>Factory Operations App</strong><span>Issues, evidence, CAPA, and actions in one view.</span></div>
            </a>
            <a class="shot" href="/products/#restaurant-pos-menu-inventory">
              <img src="/site/shots/live-demo-restaurant-os.png" alt="Store operations product example" loading="lazy" decoding="async" />
              <div><strong>Restaurant POS + Inventory</strong><span>Menu, QR, orders, stock, pay, and daily close.</span></div>
            </a>
          </div>
        </section>
        <section class="section split" aria-label="Contact SUPERMEGA">
          <h2>Start with one source.</h2>
          <div class="film">
            <div class="film-row"><b>1</b><div><strong>Share the messy source.</strong><small>A sheet, PDF, screenshot, folder, email thread, or question.</small></div><span class="pulse">Input</span></div>
            <div class="film-row"><b>2</b><div><strong>Review the first result.</strong><small>A screen, record, report, or operations app you can judge immediately.</small></div><a class="pulse" href="/contact/">Start</a></div>
          </div>
        </section>
      </main>
      <footer>SUPERMEGA.dev turns messy business work into useful output. Contact: swanhtet@supermega.dev</footer>
    </div>
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
        const packages = {
          'team-work': 'Team Work',
          'factory-work': 'Factory Work',
          'service-work': 'Service Work',
          'answer-brief': 'Custom Workflow App',
          'clean-list': 'Custom Workflow App',
          'workdesk': 'Custom Workflow App',
          'clear-brief': 'Custom Workflow App',
          'file-cleanup': 'Custom Workflow App',
          'work-screen': 'Custom Workflow App',
          'work-system': 'Team Work',
          'plant-system': 'Factory Work',
          'service-system': 'Service Work'
        };
        const selectedPackage = packages[search.get('package') || ''];
        if (selectedPackage) {
          set('workflow', selectedPackage);
          set('requested_package', selectedPackage);
        }
      }
    </script>
  </body>
</html>
`

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

const publicDemoHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>SUPERMEGA.dev | Products</title>
    <meta name="description" content="Three simple starting points for business software: team work, factory work, and service work." />
    <meta name="theme-color" content="#07111f" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>
      :root { color-scheme: dark; --bg: #07111f; --panel: rgba(255,255,255,0.078); --line: rgba(255,255,255,0.15); --text: #f6fbff; --muted: #a9b8c7; --cyan: #72f3ff; --blue: #4f8cff; --ink: #06101d; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; color: var(--text); background-color: #07111f; background-image: radial-gradient(circle at 88% 0%, rgba(114,243,255,0.18), transparent 26rem), linear-gradient(135deg, #07111f, #030712 70%); font-family: "Aptos", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
      a { color: inherit; text-decoration: none; }
      .wrap { width: min(1120px, calc(100% - 32px)); margin: 0 auto; }
      header { display: flex; justify-content: space-between; align-items: center; gap: 18px; padding: 22px 0; }
      .brand { display: flex; align-items: center; gap: 12px; font-weight: 950; letter-spacing: -0.04em; }
      .mark { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 15px; background: linear-gradient(135deg, #12375d, #07111f); border: 1px solid var(--line); }
      .nav { display: flex; align-items: center; gap: 10px; }
      .btn { display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 999px; padding: 13px 18px; background: rgba(255,255,255,0.065); font-weight: 900; }
      .btn.primary { background: linear-gradient(135deg, var(--cyan), var(--blue)); color: var(--ink); border-color: transparent; box-shadow: 0 20px 50px rgba(79,140,255,0.24); }
      main { padding: 36px 0 64px; }
      .hero { display: grid; grid-template-columns: minmax(0, 0.95fr) minmax(320px, 1.05fr); gap: clamp(20px, 4vw, 48px); align-items: end; margin-bottom: 24px; }
      .eyebrow { color: var(--cyan); font-size: 12px; font-weight: 950; letter-spacing: 0.2em; text-transform: uppercase; }
      h1 { margin: 16px 0; max-width: 12ch; font-size: clamp(52px, 8vw, 104px); line-height: 0.82; letter-spacing: -0.085em; }
      p { margin: 0; max-width: 34rem; color: var(--muted); font-size: clamp(18px, 2vw, 22px); line-height: 1.48; }
      .cta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
      .panel { border: 1px solid var(--line); border-radius: 28px; padding: clamp(18px, 3vw, 28px); background: var(--panel); box-shadow: 0 28px 80px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.14); }
      .steps { display: grid; gap: 12px; }
      .step { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: start; padding: 14px; border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; background: rgba(3,8,16,0.32); }
      .num { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 999px; background: rgba(114,243,255,0.13); color: var(--cyan); font-weight: 950; }
      .step strong { display: block; margin-bottom: 4px; }
      .step span { color: var(--muted); }
      .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 18px; }
      .card { display: grid; gap: 16px; min-height: 320px; border: 1px solid var(--line); border-radius: 26px; padding: 20px; background: rgba(255,255,255,0.06); }
      .card h2 { margin: 0; font-size: 30px; line-height: 0.95; letter-spacing: -0.055em; }
      .card p { font-size: 16px; }
      .facts { display: grid; gap: 8px; }
      .fact { border: 1px solid rgba(255,255,255,0.10); border-radius: 18px; padding: 11px 12px; background: rgba(255,255,255,0.04); color: var(--muted); }
      .fact strong { display: block; margin-bottom: 4px; color: var(--text); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; }
      .card .btn { align-self: end; }
      .note { margin-top: 18px; color: var(--muted); font-size: 14px; }
      @media (max-width: 880px) { header, .hero { align-items: flex-start; } .hero, .grid { grid-template-columns: 1fr; } .nav, .cta { flex-wrap: wrap; justify-content: flex-end; } .secondary-nav { display: none; } h1 { font-size: clamp(58px, 17vw, 86px); } .card { min-height: auto; } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <a class="brand" href="/" aria-label="SUPERMEGA.dev home"><span class="mark"><img src="/favicon.svg" alt="" /></span><span>SUPERMEGA.dev</span></a>
        <nav class="nav" aria-label="Primary">
          <a class="btn secondary-nav" href="/">Home</a>
          <a class="btn primary" href="/contact/">Contact</a>
        </nav>
      </header>
      <main>
        <section class="hero">
            <div>
            <div class="eyebrow">Products</div>
            <h1>Choose one product path.</h1>
            <p>Pick one situation, send the current source, and start with one workflow first.</p>
            <div class="cta">
              <a class="btn primary" href="/products/">See products</a>
              <a class="btn" href="#products">View examples</a>
            </div>
          </div>
          <aside class="panel">
            <div class="eyebrow">Simple rollout</div>
            <div class="steps">
              <div class="step"><span class="num">1</span><div><strong>Send the workflow that wastes time.</strong><span>What is slow, who handles it, and where the data lives.</span></div></div>
              <div class="step"><span class="num">2</span><div><strong>Map the first screen.</strong><span>Use the source to define the first module and expected result.</span></div></div>
              <div class="step"><span class="num">3</span><div><strong>Add more only when useful.</strong><span>No giant rollout. One working part first.</span></div></div>
            </div>
          </aside>
        </section>
        <section id="products" class="grid" aria-label="SUPERMEGA starting systems">
          <article class="card">
            <div>
              <div class="eyebrow">Teams</div>
              <h2>Team Work</h2>
            </div>
            <p>For follow-up, approvals, files, and status scattered across chat and spreadsheets.</p>
            <div class="facts">
              <div class="fact"><strong>Builds</strong>Request list, owner view, file intake, approval history, and daily report.</div>
              <div class="fact"><strong>Best for</strong>Sales admin, finance requests, HR tasks, document review, and manager follow-up.</div>
            </div>
            <a class="btn primary" href="/contact/?package=team-work">Ask about Team Work</a>
          </article>
          <article class="card">
            <div>
              <div class="eyebrow">Operations</div>
              <h2>Factory Work</h2>
            </div>
            <p>For receiving, quality, maintenance, production issues, and manager handoffs.</p>
            <div class="facts">
              <div class="fact"><strong>Builds</strong>Issue capture, evidence files, root-cause notes, approval closeout, and KPI snapshot.</div>
              <div class="fact"><strong>Best for</strong>QC, receiving, maintenance, production blockers, and daily plant review.</div>
            </div>
            <a class="btn primary" href="/contact/?package=factory-work">Ask about Factory Work</a>
          </article>
          <article class="card">
            <div>
              <div class="eyebrow">Service</div>
              <h2>Service Work</h2>
            </div>
            <p>For bookings, customer requests, team assignments, daily cash-up, and service follow-up.</p>
            <div class="facts">
              <div class="fact"><strong>Builds</strong>Customer record, appointment flow, service queue, payment notes, and owner report.</div>
              <div class="fact"><strong>Best for</strong>Clinics, spas, repair shops, agencies, and appointment-based teams.</div>
            </div>
            <a class="btn primary" href="/contact/?package=service-work">Ask about Service Work</a>
          </article>
        </section>
        <p class="note">No giant rollout. One useful screen first, then more only when the team needs it.</p>
      </main>
    </div>
  </body>
</html>
`

const publicProductsHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Examples | SUPERMEGA.dev</title>
    <meta name="description" content="Core SUPERMEGA product examples: Custom Workflow App, Factory Operations App, and Restaurant POS + Inventory." />
    <meta name="theme-color" content="#f7f4ed" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>
      :root { color-scheme: light; --bg:#f7f4ed; --panel:#ffffff; --line:#ded6c7; --text:#14110c; --muted:#6f6a60; --blue:#2458ff; --cyan:#2458ff; --soft:#e7edff; --green:#18794e; --gold:#8c5b00; --ink:#ffffff; }
      * { box-sizing:border-box; }
      body { margin:0; min-height:100vh; color:var(--text); background:linear-gradient(90deg,rgba(20,17,12,.035) 1px,transparent 1px),linear-gradient(180deg,rgba(20,17,12,.035) 1px,transparent 1px),var(--bg); background-size:44px 44px; font-family:"Aptos","Segoe UI Variable","Segoe UI",system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
      a { color:inherit; text-decoration:none; }
      .wrap { width:min(1120px,calc(100% - 32px)); margin:0 auto; }
      header { display:flex; justify-content:space-between; align-items:center; gap:18px; padding:22px 0; border-bottom:1px solid var(--line); }
      .brand { display:flex; align-items:center; gap:12px; font-weight:950; letter-spacing:-.04em; }
      .mark { display:grid; place-items:center; width:42px; height:42px; border-radius:12px; background:var(--text); border:1px solid var(--text); color:#fff; }
      .nav { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
      .btn { display:inline-flex; align-items:center; justify-content:center; border:1px solid var(--line); border-radius:999px; padding:13px 18px; background:rgba(255,255,255,.72); font-weight:900; }
      .btn.primary { background:var(--blue); color:var(--ink); border-color:var(--blue); box-shadow:none; }
      main { padding:36px 0 70px; }
      .hero { display:grid; grid-template-columns:minmax(0,.9fr) minmax(320px,1.1fr); gap:clamp(20px,4vw,48px); align-items:center; margin-bottom:34px; }
      .eyebrow { color:var(--blue); font-size:12px; font-weight:950; letter-spacing:.16em; text-transform:uppercase; }
      h1 { margin:16px 0; max-width:11ch; font-size:clamp(54px,8vw,96px); line-height:.88; letter-spacing:-.08em; }
      h2 { margin:0; font-size:clamp(30px,5vw,52px); line-height:.92; letter-spacing:-.06em; }
      p { margin:0; max-width:34rem; color:var(--muted); font-size:clamp(18px,2vw,22px); line-height:1.48; }
      .hero-card, .product { border:1px solid var(--line); border-radius:24px; background:var(--panel); box-shadow:0 24px 70px rgba(20,17,12,.08); }
      .hero-card { overflow:hidden; padding:0; display:grid; gap:0; }
      .hero-card img { display:block; width:100%; aspect-ratio:16/10; object-fit:cover; object-position:top left; background:#fbf7ef; }
      .hero-card .demo-copy { padding:18px; }
      .mini-row { display:grid; grid-template-columns:auto 1fr auto; gap:12px; align-items:center; border:1px solid var(--line); border-radius:16px; padding:14px; background:#fbf7ef; }
      .dot { width:10px; height:10px; border-radius:999px; background:var(--green); }
      .mini-row strong { display:block; }
      .mini-row small { display:block; color:var(--muted); margin-top:3px; font-weight:760; }
      .pill { border-radius:999px; padding:8px 10px; background:var(--soft); color:var(--blue); font-size:11px; font-weight:950; }
      .showcase { display:grid; gap:14px; }
      .demo-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; margin:0 0 22px; }
      .demo-card { overflow:hidden; border:1px solid var(--line); border-radius:22px; background:#fff; box-shadow:0 18px 50px rgba(20,17,12,.07); }
      .demo-card img { display:block; width:100%; aspect-ratio:16/9; object-fit:cover; background:rgba(255,255,255,.08); }
      .demo-copy { display:grid; gap:9px; padding:16px; }
      .demo-copy strong { font-size:18px; letter-spacing:-.03em; }
      .demo-copy span { color:var(--muted); font-size:13px; line-height:1.35; }
      .demo-copy a { color:var(--cyan); font-size:13px; font-weight:950; }
      .shell-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin:0 0 22px; }
      .shell-card { border:1px solid var(--line); border-radius:18px; padding:16px; background:#fff; }
      .shell-card strong { display:block; margin-bottom:8px; font-size:17px; letter-spacing:-.02em; }
      .shell-card span { color:var(--muted); font-size:13px; line-height:1.4; }
      .section-head { display:flex; justify-content:space-between; align-items:end; gap:18px; margin:34px 0 16px; }
      .section-head p { font-size:15px; max-width:34rem; }
      .product { display:grid; grid-template-columns:minmax(0,.72fr) minmax(300px,1.28fr); gap:0; overflow:hidden; }
      .product-copy { padding:clamp(20px,3vw,30px); display:grid; gap:16px; align-content:center; }
      .product-copy p { font-size:16px; }
      .screen { overflow:hidden; background:#fbf7ef; border-left:1px solid var(--line); display:grid; gap:0; }
      .screen img { display:block; width:100%; height:100%; min-height:280px; object-fit:cover; object-position:top left; background:#fbf7ef; }
      .screen-note { display:flex; justify-content:space-between; gap:12px; align-items:center; padding:14px 16px; border-top:1px solid var(--line); background:#fff; }
      .screen-note strong { display:block; }
      .screen-note span { color:var(--muted); font-size:13px; line-height:1.35; }
      .screen-top { display:flex; justify-content:space-between; gap:12px; align-items:center; padding-bottom:10px; border-bottom:1px solid var(--line); }
      .screen-top strong { font-size:18px; }
      .artifact { display:grid; gap:10px; border:1px solid var(--line); border-radius:18px; background:#fff; padding:15px; }
      .artifact h3 { margin:0; font-size:clamp(24px,4vw,40px); line-height:.95; letter-spacing:-.06em; }
      .artifact-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
      .cell { border:1px solid var(--line); border-radius:12px; padding:10px; color:var(--muted); font-size:13px; line-height:1.35; }
      .cell b { display:block; margin-bottom:5px; color:var(--blue); font-size:10px; letter-spacing:.14em; text-transform:uppercase; }
      .table { display:grid; gap:7px; }
      .table-row { display:grid; grid-template-columns:1.1fr .9fr auto; gap:8px; align-items:center; border:1px solid rgba(255,255,255,.1); border-radius:14px; padding:10px; font-size:13px; color:rgba(246,251,255,.9); }
      .table-row span { color:var(--muted); }
      .cta { display:flex; flex-wrap:wrap; gap:10px; margin-top:22px; }
      .lane-grid, .proof-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-top:16px; }
      .lane-card, .proof-card { border:1px solid var(--line); border-radius:20px; padding:18px; background:#fff; }
      .lane-card strong, .proof-card strong { display:block; margin:8px 0; font-size:20px; letter-spacing:-.035em; }
      .lane-card span, .proof-card span { color:var(--gold); font-size:11px; font-weight:950; letter-spacing:.16em; text-transform:uppercase; }
      .lane-card p, .proof-card p { font-size:14px; line-height:1.45; }
      .lane-card small { display:block; margin-top:12px; color:rgba(246,251,255,.72); font-weight:850; line-height:1.4; }
      @media (max-width:1100px) { .demo-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
      @media (max-width:900px) { header,.hero,.product,.section-head { grid-template-columns:1fr; align-items:flex-start; } .section-head { display:grid; } .screen { border-left:0; border-top:1px solid var(--line); } .screen img { min-height:auto; aspect-ratio:16/10; } .artifact-grid,.demo-grid,.shell-grid,.lane-grid,.proof-grid { grid-template-columns:1fr; } .secondary-nav { display:none; } h1 { font-size:clamp(54px,16vw,82px); } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <a class="brand" href="/" aria-label="SUPERMEGA.dev home"><span class="mark"><img src="/favicon.svg" alt="" /></span><span>SUPERMEGA.dev</span></a>
        <nav class="nav" aria-label="Primary">
          <a class="btn secondary-nav" href="/">Home</a>
          <a class="btn primary" href="/contact/?source=products">Contact</a>
        </nav>
      </header>
      <main>
        <section class="hero">
          <div>
            <div class="eyebrow">Products</div>
            <h1>Useful software from real work.</h1>
            <p>Pick one workflow, folder, machine, meter, or manager decision. The first screen is visible before a bigger rollout.</p>
            <div class="cta">
              <a class="btn primary" href="/contact/?package=back-office-workflow-desk">Send one source</a>
            </div>
          </div>
          <aside class="hero-card" aria-label="Product screenshot example">
            <img src="/site/shots/live-product-build-app-from-workflow.png" alt="SuperMega product screenshot showing a usable operations app" loading="eager" decoding="async" />
            <div class="demo-copy"><strong>Real product screen</strong><span>Simple enough to explain in one minute.</span></div>
          </aside>
        </section>
        <section class="shell-grid" aria-label="Client examples">
          <a class="shell-card" href="#back-office-workflow-desk">
            <strong>Custom Workflow App</strong>
            <span>For repeated work stuck in email, spreadsheets, folders, chat, or forms.</span>
          </a>
          <a class="shell-card" href="#factory-issues-maintenance-quality">
            <strong>Factory Operations App</strong>
            <span>For quality, maintenance, receiving, assets, WCM boards, ISO evidence, and factory actions.</span>
          </a>
          <a class="shell-card" href="#restaurant-pos-menu-inventory">
            <strong>Restaurant POS + Inventory</strong>
            <span>For menus, QR handoff, orders, payment proof, stock, shift notes, and daily close.</span>
          </a>
        </section>
        <section class="showcase" aria-label="Visual product examples">
          <article class="product" id="back-office-workflow-desk">
            <div class="product-copy">
              <div class="eyebrow">General workflow</div>
              <h2>Custom Workflow App</h2>
              <p>Turn one repeated process into a daily app with source, owner, status, proof, and next action.</p>
              <a class="btn primary" href="/contact/?package=back-office-workflow-desk">Start with this</a>
            </div>
            <div class="screen">
              <img src="/site/shots/live-product-build-app-from-workflow.png" alt="Custom Workflow App product screenshot" loading="lazy" decoding="async" />
              <div class="screen-note"><strong>Output</strong><span>Source, queue, evidence, approval, next move.</span></div>
            </div>
          </article>
          <article class="product" id="factory-issues-maintenance-quality">
            <div class="product-copy">
              <div class="eyebrow">Factory operations</div>
              <h2>Factory Operations App</h2>
              <p>One daily control screen for issues, ISO evidence, CAPA, maintenance, receiving, assets, and manager review.</p>
              <a class="btn primary" href="/contact/?tool=industrial-plant-os">Start with this</a>
            </div>
            <div class="screen">
              <img src="/site/shots/live-demo-industrial-os.png" alt="Factory Operations App product screenshot" loading="lazy" decoding="async" />
              <div class="screen-note"><strong>Output</strong><span>Blocker, owner, evidence, meter signal, CAPA, closeout.</span></div>
            </div>
          </article>
          <article class="product" id="restaurant-pos-menu-inventory">
            <div class="product-copy">
              <div class="eyebrow">Restaurant and cafe</div>
              <h2>Restaurant POS + Inventory</h2>
              <p>Menu setup, QR handoff, payment proof, cash-up close, shift handover, stock notes, and owner report in one simple POS screen.</p>
              <a class="btn primary" href="/contact/?package=restaurant-pos-menu-inventory">Start with this</a>
            </div>
            <div class="screen">
              <img src="/site/shots/live-demo-restaurant-os.png" alt="Restaurant POS + Inventory product screenshot" loading="lazy" decoding="async" />
              <div class="screen-note"><strong>Output</strong><span>Menu, payment proof, shift close, owner report.</span></div>
            </div>
          </article>
        </section>
        <section class="section-head" aria-label="Start">
          <div>
            <div class="eyebrow">Start</div>
            <h2>Send the first source.</h2>
          </div>
          <p>Share a folder, sheet, PDF, notes, links, screenshots, or repeated work task. We return one useful output before proposing anything bigger.</p>
        </section>
      </main>
    </div>
  </body>
</html>`

const publicFreeScanHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Free Workflow Scan | SUPERMEGA.dev</title>
    <meta name="description" content="Use the free SUPERMEGA workflow scan to estimate what SaaS, spreadsheet, inbox, or manual admin loop should be replaced first." />
    <meta name="theme-color" content="#07111f" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>
      :root { color-scheme: dark; --bg:#07111f; --panel:rgba(255,255,255,.075); --line:rgba(255,255,255,.15); --text:#f6fbff; --muted:#a9b8c7; --cyan:#72f3ff; --blue:#4f8cff; --green:#8cf0b8; --gold:#f2c86d; --ink:#06101d; }
      * { box-sizing:border-box; }
      body { margin:0; min-height:100vh; color:var(--text); background:#07111f; background-image:radial-gradient(circle at 84% 0%,rgba(114,243,255,.19),transparent 26rem),radial-gradient(circle at 8% 28%,rgba(79,140,255,.16),transparent 30rem),linear-gradient(135deg,#07111f,#030712 70%); font-family:"Aptos","Segoe UI Variable","Segoe UI",system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
      a { color:inherit; text-decoration:none; }
      .wrap { width:min(1120px,calc(100% - 32px)); margin:0 auto; }
      header { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:22px 0; }
      .brand { display:flex; align-items:center; gap:12px; font-weight:950; letter-spacing:-.04em; }
      .mark { display:grid; place-items:center; width:44px; height:44px; border-radius:15px; background:linear-gradient(135deg,#12375d,#07111f); border:1px solid var(--line); color:#dffbff; }
      .nav { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
      .btn, button { display:inline-flex; align-items:center; justify-content:center; border:1px solid var(--line); border-radius:999px; padding:13px 18px; background:rgba(255,255,255,.065); color:var(--text); font:inherit; font-weight:900; cursor:pointer; }
      .btn.primary, button { background:linear-gradient(135deg,var(--cyan),var(--blue)); color:var(--ink); border-color:transparent; box-shadow:0 20px 50px rgba(79,140,255,.24); }
      main { padding:36px 0 70px; }
      .hero { display:grid; grid-template-columns:minmax(0,.9fr) minmax(320px,1.1fr); gap:clamp(20px,4vw,48px); align-items:start; }
      .eyebrow { color:var(--cyan); font-size:12px; font-weight:950; letter-spacing:.2em; text-transform:uppercase; }
      h1 { margin:16px 0; max-width:11ch; font-size:clamp(58px,9vw,112px); line-height:.8; letter-spacing:-.09em; }
      h2 { margin:0 0 12px; font-size:clamp(30px,5vw,54px); line-height:.9; letter-spacing:-.065em; }
      p { margin:0; max-width:35rem; color:var(--muted); font-size:clamp(18px,2vw,22px); line-height:1.48; }
      .panel { border:1px solid var(--line); border-radius:30px; background:var(--panel); box-shadow:0 28px 90px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.13); backdrop-filter:blur(20px); }
      form, .result { padding:clamp(18px,3vw,28px); display:grid; gap:14px; }
      label { display:grid; gap:8px; color:rgba(246,251,255,.82); font-size:12px; font-weight:950; letter-spacing:.14em; text-transform:uppercase; }
      input, select, textarea { width:100%; border:1px solid rgba(255,255,255,.14); border-radius:16px; background:rgba(3,8,16,.48); color:var(--text); padding:13px 14px; font:inherit; outline:none; }
      textarea { min-height:96px; resize:vertical; }
      input:focus, select:focus, textarea:focus { border-color:rgba(114,243,255,.45); box-shadow:0 0 0 4px rgba(114,243,255,.08); }
      .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
      .score { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
      .metric { border:1px solid rgba(255,255,255,.12); border-radius:18px; padding:14px; background:rgba(3,8,16,.38); }
      .metric span { display:block; color:var(--muted); font-size:12px; font-weight:900; letter-spacing:.12em; text-transform:uppercase; }
      .metric strong { display:block; margin-top:6px; font-size:clamp(24px,4vw,38px); line-height:.9; letter-spacing:-.06em; }
      .plan { display:grid; gap:10px; }
      .row { display:grid; grid-template-columns:auto 1fr auto; gap:12px; align-items:center; border:1px solid rgba(255,255,255,.12); border-radius:18px; padding:14px; background:rgba(3,8,16,.36); }
      .row b { display:grid; place-items:center; width:32px; height:32px; border-radius:999px; background:rgba(114,243,255,.13); color:var(--cyan); }
      .row strong { display:block; }
      .row small { display:block; color:var(--muted); margin-top:3px; font-weight:760; }
      .pill { border-radius:999px; padding:8px 10px; background:rgba(114,243,255,.12); color:#dffbff; font-size:11px; font-weight:950; }
      .cta { display:flex; flex-wrap:wrap; gap:10px; margin-top:22px; }
      @media (max-width:880px) { header,.hero { grid-template-columns:1fr; align-items:flex-start; } .secondary-nav { display:none; } .grid,.score { grid-template-columns:1fr; } h1 { font-size:clamp(58px,17vw,86px); } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <a class="brand" href="/" aria-label="SUPERMEGA.dev home"><span class="mark"><img src="/favicon.svg" alt="" /></span><span>SUPERMEGA.dev</span></a>
        <nav class="nav" aria-label="Primary">
          <a class="btn secondary-nav" href="/products/">Examples</a>
          <a class="btn primary" href="/start/">Start sprint</a>
        </nav>
      </header>
      <main>
        <section class="hero">
          <div>
            <div class="eyebrow">Free tool</div>
            <h1>Free workflow scan.</h1>
            <p>Use this to pick the first SaaS, spreadsheet, inbox, or manual admin loop worth replacing. It creates a quick replacement brief you can send to SUPERMEGA.</p>
            <div class="cta">
              <a class="btn primary" href="#scan">Run scan</a>
              <a class="btn" href="/products/">Products</a>
            </div>
          </div>
          <aside id="scan" class="panel">
            <form data-scan-form>
              <div class="grid">
                <label>Work to improve<input name="workflow" required placeholder="Lead research, messy files, weekly report" /></label>
                <label>Current tool<select name="tool"><option>SaaS app</option><option>Spreadsheet</option><option>Email or inbox</option><option>Paper/PDF</option><option>Browser routine</option></select></label>
                <label>Monthly cost USD<input name="cost" inputmode="decimal" value="300" /></label>
                <label>Hours wasted weekly<input name="hours" inputmode="decimal" value="8" /></label>
              </div>
              <label>Where the data lives<textarea name="sources" placeholder="Google Drive folder, Gmail inbox, exported CSV, PDFs, screenshots, WhatsApp notes"></textarea></label>
              <button type="submit">Generate replacement brief</button>
            </form>
          </aside>
        </section>
        <section class="panel result" aria-live="polite" data-result>
          <div class="eyebrow">Replacement brief</div>
          <h2>Run the scan to create a first-module plan.</h2>
          <div class="score">
            <div class="metric"><span>Priority</span><strong>Ready</strong></div>
            <div class="metric"><span>Likely first screen</span><strong>Queue</strong></div>
            <div class="metric"><span>Review gate</span><strong>Human</strong></div>
          </div>
          <div class="plan">
            <div class="row"><b>1</b><div><strong>Input</strong><small>Name the workflow and send one real source sample.</small></div><span class="pill">Scope</span></div>
            <div class="row"><b>2</b><div><strong>Build</strong><small>Make the first useful screen with data intake, owner, status, and evidence.</small></div><span class="pill">Sprint</span></div>
            <div class="row"><b>3</b><div><strong>Prepared action</strong><small>Add one reviewed action: classify, summarize, clean, draft, or route.</small></div><span class="pill">Review</span></div>
          </div>
          <div class="cta"><a class="btn primary" href="/contact/?source=free-workflow-scan">Send this scan</a><a class="btn" href="/products/">See products</a></div>
        </section>
      </main>
    </div>
    <script>
      const form = document.querySelector('[data-scan-form]');
      const result = document.querySelector('[data-result]');
      const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
      function text(value) {
        return String(value || '').replace(/[<>]/g, '').trim();
      }
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const workflow = text(data.get('workflow')) || 'this workflow';
        const tool = text(data.get('tool')) || 'current tool';
        const sources = text(data.get('sources')) || 'one export, folder, screenshot, or sample file';
        const cost = Number(String(data.get('cost') || '0').replace(/[^0-9.]/g, '')) || 0;
        const hours = Number(String(data.get('hours') || '0').replace(/[^0-9.]/g, '')) || 0;
        const monthlyHours = Math.round(hours * 4.3);
        const painScore = Math.min(100, Math.round(cost / 20 + hours * 6 + sources.length / 6));
        const priority = painScore >= 75 ? 'Replace first' : painScore >= 45 ? 'Good sprint' : 'Keep simple';
        const aiAction = /pdf|folder|sheet|csv|file|drive/i.test(sources) ? 'clean and extract source records' : /email|inbox|whatsapp|message/i.test(sources) ? 'summarize and draft follow-up' : 'classify and route work';
        result.innerHTML =
          '<div class="eyebrow">Replacement brief</div>' +
          '<h2>' + workflow + '</h2>' +
          '<div class="score">' +
            '<div class="metric"><span>Priority</span><strong>' + priority + '</strong></div>' +
            '<div class="metric"><span>Monthly waste</span><strong>' + monthlyHours + 'h</strong></div>' +
            '<div class="metric"><span>Tool cost</span><strong>$' + money.format(cost) + '</strong></div>' +
          '</div>' +
          '<div class="plan">' +
            '<div class="row"><b>1</b><div><strong>Replace the visible pain.</strong><small>Current system: ' + tool + '. First screen: owner queue, status, evidence, and next action.</small></div><span class="pill">Screen</span></div>' +
            '<div class="row"><b>2</b><div><strong>Use real source evidence.</strong><small>Start from: ' + sources + '.</small></div><span class="pill">Source</span></div>' +
            '<div class="row"><b>3</b><div><strong>Add one reviewed action.</strong><small>Recommended first prepared loop: ' + aiAction + ' with human approval before writeback.</small></div><span class="pill">Review</span></div>' +
          '</div>' +
          '<div class="cta"><a class="btn primary" href="/contact/?source=free-workflow-scan&workflow=' + encodeURIComponent(workflow) + '">Send this scan</a><a class="btn" href="/start/?workflow=' + encodeURIComponent(workflow) + '">Start sprint</a></div>';
        result.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    </script>
  </body>
</html>`

const publicWorkflowBlueprintHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Business Tool Builder | SUPERMEGA.dev</title>
    <meta name="description" content="Use the free SUPERMEGA Business Tool Builder to turn one repeated task into a first-screen software plan." />
    <meta name="theme-color" content="#07111f" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>
      :root { color-scheme: dark; --bg:#07111f; --panel:rgba(255,255,255,.075); --line:rgba(255,255,255,.15); --text:#f6fbff; --muted:#a9b8c7; --cyan:#72f3ff; --blue:#4f8cff; --green:#8cf0b8; --gold:#f2c86d; --ink:#06101d; }
      * { box-sizing:border-box; }
      html { scroll-behavior:smooth; }
      body { margin:0; min-height:100vh; color:var(--text); background:#07111f; background-image:radial-gradient(circle at 84% 0%,rgba(114,243,255,.18),transparent 27rem),radial-gradient(circle at 8% 30%,rgba(79,140,255,.16),transparent 30rem),linear-gradient(135deg,#07111f,#030712 72%); font-family:"Aptos","Segoe UI Variable","Segoe UI",system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
      a { color:inherit; text-decoration:none; }
      .wrap { width:min(1120px,calc(100% - 32px)); margin:0 auto; }
      header { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:22px 0; }
      .brand { display:flex; align-items:center; gap:12px; font-weight:950; letter-spacing:-.04em; }
      .mark { display:grid; place-items:center; width:44px; height:44px; border-radius:15px; background:linear-gradient(135deg,#12375d,#07111f); border:1px solid var(--line); color:#dffbff; }
      .nav { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
      .btn, button { display:inline-flex; align-items:center; justify-content:center; border:1px solid var(--line); border-radius:999px; padding:13px 18px; background:rgba(255,255,255,.065); color:var(--text); font:inherit; font-weight:900; cursor:pointer; }
      .btn.primary, button { background:linear-gradient(135deg,var(--cyan),var(--blue)); color:var(--ink); border-color:transparent; box-shadow:0 20px 50px rgba(79,140,255,.24); }
      main { padding:36px 0 70px; }
      .hero { display:grid; grid-template-columns:minmax(0,.9fr) minmax(320px,1.1fr); gap:clamp(20px,4vw,48px); align-items:start; }
      .eyebrow { color:var(--cyan); font-size:12px; font-weight:950; letter-spacing:.2em; text-transform:uppercase; }
      h1 { margin:16px 0; max-width:12ch; font-size:clamp(54px,8vw,104px); line-height:.83; letter-spacing:-.085em; }
      h2 { margin:0 0 12px; font-size:clamp(30px,5vw,52px); line-height:.92; letter-spacing:-.06em; }
      h3 { margin:0; font-size:18px; line-height:1.05; letter-spacing:-.025em; }
      p { margin:0; max-width:35rem; color:var(--muted); font-size:clamp(18px,2vw,22px); line-height:1.48; }
      .panel { border:1px solid var(--line); border-radius:28px; background:var(--panel); box-shadow:0 28px 90px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.13); backdrop-filter:blur(20px); }
      form, .result { padding:clamp(18px,3vw,28px); display:grid; gap:14px; }
      label { display:grid; gap:8px; color:rgba(246,251,255,.82); font-size:12px; font-weight:950; letter-spacing:.14em; text-transform:uppercase; }
      input, select, textarea { width:100%; border:1px solid rgba(255,255,255,.14); border-radius:16px; background:rgba(3,8,16,.48); color:var(--text); padding:13px 14px; font:inherit; outline:none; }
      textarea { min-height:96px; resize:vertical; }
      input:focus, select:focus, textarea:focus { border-color:rgba(114,243,255,.45); box-shadow:0 0 0 4px rgba(114,243,255,.08); }
      .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
      .score { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
      .metric { border:1px solid rgba(255,255,255,.12); border-radius:18px; padding:14px; background:rgba(3,8,16,.38); }
      .metric span { display:block; color:var(--muted); font-size:12px; font-weight:900; letter-spacing:.12em; text-transform:uppercase; }
      .metric strong { display:block; margin-top:6px; font-size:clamp(22px,3.4vw,36px); line-height:.9; letter-spacing:-.055em; }
      .meter { height:12px; overflow:hidden; border-radius:999px; background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.12); }
      .meter span { display:block; height:100%; width:var(--score,68%); background:linear-gradient(90deg,var(--green),var(--cyan),var(--blue)); }
      .plan { display:grid; gap:10px; }
      .row { display:grid; grid-template-columns:auto 1fr auto; gap:12px; align-items:center; border:1px solid rgba(255,255,255,.12); border-radius:18px; padding:14px; background:rgba(3,8,16,.36); }
      .row b { display:grid; place-items:center; width:32px; height:32px; border-radius:999px; background:rgba(114,243,255,.13); color:var(--cyan); }
      .row strong { display:block; }
      .row small { display:block; color:var(--muted); margin-top:3px; font-weight:760; }
      .pill { border-radius:999px; padding:8px 10px; background:rgba(114,243,255,.12); color:#dffbff; font-size:11px; font-weight:950; }
      .stack, .cards { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
      .mini { border:1px solid rgba(255,255,255,.12); border-radius:18px; padding:14px; background:rgba(3,8,16,.34); display:grid; gap:8px; min-height:126px; }
      .mini p, .mini li { color:var(--muted); font-size:14px; line-height:1.45; }
      .mini ul { margin:0; padding-left:18px; display:grid; gap:5px; }
      .tagbar { display:flex; flex-wrap:wrap; gap:8px; }
      .tag { border:1px solid rgba(255,255,255,.12); border-radius:999px; padding:8px 10px; color:#dffbff; background:rgba(255,255,255,.06); font-size:12px; font-weight:900; }
      .copy-box { white-space:pre-wrap; overflow:auto; max-height:340px; border:1px solid rgba(255,255,255,.12); border-radius:18px; padding:16px; background:rgba(3,8,16,.52); color:#e7f6ff; font-family:"Cascadia Mono","SFMono-Regular",Consolas,monospace; font-size:13px; line-height:1.5; }
      .hint { color:var(--muted); font-size:13px; font-weight:800; line-height:1.45; }
      .cta { display:flex; flex-wrap:wrap; gap:10px; margin-top:22px; }
      .lead-form { margin-top:18px; border:1px solid rgba(114,243,255,.18); border-radius:18px; padding:16px; background:rgba(114,243,255,.055); display:grid; gap:12px; }
      .lead-form h3 { margin:0; font-size:18px; line-height:1.15; }
      .lead-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
      .lead-form button { width:max-content; }
      .lead-status { min-height:20px; margin:0; }
      .quick-tools { margin:26px 0; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
      .quick-tool { border:1px solid rgba(255,255,255,.12); border-radius:20px; padding:16px; background:rgba(255,255,255,.05); color:#eaf8ff; text-decoration:none; display:grid; gap:8px; min-height:150px; }
      .quick-tool small { color:var(--accent); font-size:11px; font-weight:950; letter-spacing:.14em; text-transform:uppercase; }
      .quick-tool strong { font-size:19px; line-height:1.1; }
      .quick-tool span { color:var(--muted); font-size:13px; line-height:1.45; font-weight:760; }
      .honeypot { position:absolute; left:-9999px; width:1px; height:1px; opacity:0; pointer-events:none; }
      @media (max-width:880px) { header,.hero { grid-template-columns:1fr; align-items:flex-start; } .secondary-nav { display:none; } .grid,.score,.stack,.cards,.lead-grid,.quick-tools { grid-template-columns:1fr; } h1 { font-size:clamp(46px,13vw,70px); line-height:.9; letter-spacing:-.075em; } .row { grid-template-columns:auto 1fr; } .row .pill { grid-column:2; width:max-content; } .lead-form button { width:100%; } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <a class="brand" href="/" aria-label="SUPERMEGA.dev home"><span class="mark"><img src="/favicon.svg" alt="" /></span><span>SUPERMEGA.dev</span></a>
        <nav class="nav" aria-label="Primary">
          <a class="btn secondary-nav" href="/products/">Screens</a>
          <a class="btn primary" href="/contact/">Contact</a>
        </nav>
      </header>
      <main>
        <section class="hero">
          <div>
            <div class="eyebrow">Free tool</div>
            <h1>Business Tool Builder.</h1>
            <p>Describe one repeated task. Get the first screen, the data needed, the review rules, and the next step.</p>
            <div class="cta">
              <a class="btn primary" href="#blueprint">Build my tool plan</a>
              <a class="btn" href="/products/">See screens</a>
            </div>
            <p class="hint" style="margin-top:16px">No login. No payment. The draft stays in your browser unless you send it.</p>
          </div>
          <aside id="blueprint" class="panel">
            <form data-blueprint-form>
              <div class="grid">
                <label>Task to turn into a tool<input name="workflow" required value="Customer follow-up desk" placeholder="Daily cash close, file cleanup, weekly owner report" /></label>
                <label>Business type<input name="business" value="Small business" placeholder="Restaurant, factory, clinic, shop, service company" /></label>
                <label>Main user<input name="role" value="Owner / manager" placeholder="Owner, cashier, plant manager, admin, accountant" /></label>
                <label>Where it happens now<select name="tool"><option>Spreadsheet</option><option>Email or inbox</option><option>Drive folder and PDFs</option><option>WhatsApp / Messenger</option><option>POS or app export</option><option>Paper or photos</option></select></label>
                <label>Best sample to share<select name="source"><option>Spreadsheet export</option><option>PDF, screenshot, or photo</option><option>Email or inbox</option><option>Drive folder</option><option>POS or app export</option><option>Meeting notes or transcript</option></select></label>
                <label>Approval level<select name="risk"><option>Normal: owner reviews first</option><option>Low: read-only summary is enough</option><option>High: money, customer, or compliance sensitive</option></select></label>
              </div>
              <label>What is painful today?<textarea name="pain">The owner cannot see what changed, who owns it, and what needs action today.</textarea></label>
              <label>What should the first screen show?<textarea name="screen">A daily list with owner, source proof, status, and next action.</textarea></label>
              <div class="grid">
                <label>Monthly SaaS cost USD<input name="cost" inputmode="decimal" value="450" /></label>
                <label>Hours wasted weekly<input name="hours" inputmode="decimal" value="10" /></label>
              </div>
              <button type="submit">Create my tool plan</button>
            </form>
          </aside>
        </section>
        <section class="quick-tools" aria-label="Fast product tools">
          <a class="quick-tool" href="/contact/?package=menu-to-qr">
            <small>Restaurant</small>
            <strong>Menu-to-QR Pack</strong>
            <span>Send menu text, PDF, or photo. Get a customer QR menu and owner review packet.</span>
          </a>
          <a class="quick-tool" href="/daily-close/">
            <small>Store</small>
            <strong>Payment Close Checker</strong>
            <span>Match provider proof, order refs, settlement refs, and cash-up gaps.</span>
          </a>
          <a class="quick-tool" href="/contact/?package=supplier-claim-packet">
            <small>Factory</small>
            <strong>Supplier Claim Packet</strong>
            <span>Turn invoice, receiving issue, photo proof, and email into a reviewed claim.</span>
          </a>
          <a class="quick-tool" href="/contact/?package=daily-owner-summary">
            <small>Owner</small>
            <strong>Daily Owner Summary</strong>
            <span>One daily brief with changed records, risks, decisions, and missing evidence.</span>
          </a>
          <a class="quick-tool" href="/contact/?package=workflow-scope-builder">
            <small>Workflow</small>
            <strong>Workflow Scope Builder</strong>
            <span>Pick one job, one source, one output, and the approval gate before building.</span>
          </a>
        </section>
        <section class="panel result" aria-live="polite" data-blueprint-result>
          <div class="eyebrow">Business Tool Builder</div>
          <h2>Run the tool to create a first-module plan.</h2>
          <div class="meter" aria-hidden="true" style="--score:68%"><span></span></div>
          <div class="score">
            <div class="metric"><span>Readiness</span><strong>68</strong></div>
            <div class="metric"><span>First module</span><strong>Queue</strong></div>
            <div class="metric"><span>Prepared action</span><strong>Draft</strong></div>
            <div class="metric"><span>Review gate</span><strong>Human</strong></div>
          </div>
          <div class="cards">
            <div class="mini"><h3>First module</h3><p>One operational queue with owner, evidence, status, due date, and next action.</p></div>
            <div class="mini"><h3>Work rules</h3><p>Intake, cleanup, draft, review, and QA rules before anything changes.</p></div>
          </div>
          <div class="tagbar" aria-label="Modern framework stack">
            <span class="tag">Read source</span><span class="tag">Clean data</span><span class="tag">Draft action</span><span class="tag">Human review</span><span class="tag">QA check</span>
          </div>
          <pre class="copy-box" data-copy-box>Workflow: CRM follow-up and lead tracking
First module: daily lead queue
Source model: contacts, messages, notes, follow-up tasks, reviewed actions
Work system: intake, cleanup, operator draft, risk review, QA
Guardrail: human approval before writeback
Modern build stack: OpenAI, Vercel, workflow orchestration, state graph, Playwright QA
Next step: copy this packet or share the blueprint link with SUPERMEGA.</pre>
          <div class="cta"><button type="button" data-copy-packet>Copy plan</button><button type="button" data-share-link>Copy share link</button><button type="button" data-download-packet>Download .txt</button><a class="btn" href="/contact/?source=business-tool-builder">Contact</a></div>
          <form class="lead-form" data-blueprint-lead-form>
            <h3>Send this plan</h3>
            <p class="hint">SuperMega receives the generated plan, then replies with the first screen, source sample, and approval path.</p>
            <div class="lead-grid">
              <label>Name<input name="name" required autocomplete="name" placeholder="Your name" /></label>
              <label>Work email<input name="email" required type="email" autocomplete="email" placeholder="you@company.com" /></label>
              <label>Company<input name="company" required autocomplete="organization" placeholder="Company" /></label>
            </div>
            <label class="honeypot">Website<input name="website" autocomplete="off" tabindex="-1" /></label>
            <button type="submit">Send plan</button>
            <p class="hint lead-status" data-blueprint-lead-status></p>
          </form>
        </section>
      </main>
    </div>
    <script>
      const form = document.querySelector('[data-blueprint-form]');
      const result = document.querySelector('[data-blueprint-result]');
      const storageKey = 'supermega-business-tool-builder-v2';
      const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
      const frameworkStack = ['OpenAI', 'Vercel', 'workflow orchestration', 'state graph', 'Playwright QA'];
      const blueprints = {
        sales: {
          module: 'Revenue follow-up queue',
          screen: 'Daily account desk',
          action: 'Draft',
          schema: ['account', 'contact', 'conversation', 'next_action', 'owner', 'status', 'evidence_link'],
          agents: ['research check', 'message draft', 'pipeline review', 'risk check', 'browser QA'],
          steps: ['Import one lead/export sample', 'Normalize contacts and last-touch notes', 'Generate reviewed follow-up drafts', 'Show owner queue and overdue accounts'],
          price: 'Starter tool build, then monthly improvement support'
        },
        operations: {
          module: 'Exception command queue',
          screen: 'Daily operating board',
          action: 'Route',
          schema: ['job', 'source', 'issue_type', 'owner', 'priority', 'due_date', 'evidence_link', 'resolution'],
          agents: ['intake classifier', 'source evidence check', 'operator draft', 'manager review', 'QA smoke'],
          steps: ['Capture messy jobs from the real source', 'Classify and dedupe exceptions', 'Route each item to an owner', 'Escalate overdue or risky work'],
    price: 'Custom operations app plus weekly improvement retainer'
        },
        data: {
          module: 'File cleanroom',
          screen: 'Source-to-record review table',
          action: 'Extract',
          schema: ['source_file', 'record', 'missing_field', 'confidence', 'review_status', 'owner', 'export_target'],
          agents: ['document intake', 'schema map', 'data cleanup', 'review gate', 'regression QA'],
          steps: ['Load one folder or export', 'Extract reviewable records with confidence', 'Flag missing fields for review', 'Export a usable table or app view'],
          price: 'Document intake sprint, then managed ingestion pipeline'
        },
        admin: {
          module: 'Work inbox replacement',
          screen: 'Reviewed task queue',
          action: 'Summarize',
          schema: ['request', 'source', 'owner', 'status', 'summary', 'next_action', 'approval_state'],
          agents: ['request intake', 'summary', 'task routing', 'approval review', 'QA playback'],
          steps: ['Collect requests from one source', 'Summarize and classify work', 'Create owner-ready tasks', 'Keep final action behind approval'],
          price: 'First workflow sprint plus automation maintenance'
        }
      };
      function clean(value) {
        return String(value || '').replace(/[<>]/g, '').trim();
      }
      function esc(value) {
        return String(value || '').replace(/[&<>"']/g, function (char) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
        });
      }
      function list(items) {
        return '<ul>' + items.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') + '</ul>';
      }
      function fields() {
        const data = new FormData(form);
        const raw = {};
        data.forEach(function (value, key) { raw[key] = clean(value); });
        raw.workflow = raw.workflow || 'this workflow';
        raw.business = raw.business || 'the business';
        raw.role = raw.role || 'the operator';
        raw.pain = raw.pain || 'Work is scattered and hard to review.';
        raw.screen = raw.screen || 'A simple reviewed work queue.';
        raw.cost = Number(String(raw.cost || '0').replace(/[^0-9.]/g, '')) || 0;
        raw.hours = Number(String(raw.hours || '0').replace(/[^0-9.]/g, '')) || 0;
        return raw;
      }
      function kindFor(raw) {
        const haystack = [raw.workflow, raw.business, raw.role, raw.tool, raw.source, raw.pain, raw.screen].join(' ').toLowerCase();
        if (/lead|crm|sales|client|customer|quote|invoice|follow|pipeline|outreach|account/.test(haystack)) return 'sales';
        if (/factory|inventory|stock|job|ticket|service|delivery|qc|issue|exception|ops|operation|booking|close/.test(haystack)) return 'operations';
        if (/pdf|file|folder|drive|sheet|spreadsheet|csv|excel|report|dashboard|document|screenshot|photo|clean/.test(haystack)) return 'data';
        return 'admin';
      }
      function scoreFor(raw) {
        let score = 35;
        score += Math.min(20, Math.round(raw.cost / 80));
        score += Math.min(24, Math.round(raw.hours * 2.2));
        if (raw.pain.length > 80) score += 8;
        if (raw.screen.length > 45) score += 8;
        if (/High/.test(raw.risk)) score -= 7;
        if (/Low/.test(raw.risk)) score += 3;
        return Math.max(32, Math.min(96, score));
      }
      function packet(raw, model, score) {
        const nl = String.fromCharCode(10);
        return [
          'SUPERMEGA business tool plan',
          'Workflow: ' + raw.workflow,
          'Business: ' + raw.business,
          'Main user: ' + raw.role,
          'Current system: ' + raw.tool,
          'Source sample: ' + raw.source,
          'Pain: ' + raw.pain,
          'First useful screen: ' + raw.screen,
          'Readiness score: ' + score + '/100',
          'First module: ' + model.module,
          'Data model: ' + model.schema.join(', '),
          'Prepared work rules: ' + model.agents.join(', '),
          'Guardrails: ' + raw.risk + '; source evidence required; human approval before writeback; QA replay before launch.',
          'Build stack: ' + frameworkStack.join(', '),
          'Support path: ' + model.price,
          'Next step: send one real source sample and build the first working screen.'
        ].join(nl);
      }
      function agentPrompt(raw, model, score) {
        const nl = String.fromCharCode(10);
        return [
          'Build this as a SUPERMEGA custom business tool request.',
          'Use the business tool plan below as the product brief.',
          '',
          packet(raw, model, score),
          '',
          'Implementation rules:',
          '- Build one useful screen first, not a broad platform.',
          '- Show source evidence beside every prepared answer.',
          '- Keep human approval before customer-visible writeback.',
          '- Use a small controlled work system: intake, cleanup, operator draft, risk review, QA.',
          '- Verify the workflow in a browser with Playwright before handoff.'
        ].join(nl);
      }
      function leadFormHtml() {
        return '<form class="lead-form" data-blueprint-lead-form>' +
          '<h3>Send this plan</h3>' +
          '<p class="hint">SuperMega receives this exact generated plan, then replies with the recommended first screen, source sample, and approval path.</p>' +
          '<div class="lead-grid">' +
            '<label>Name<input name="name" required autocomplete="name" placeholder="Your name" /></label>' +
            '<label>Work email<input name="email" required type="email" autocomplete="email" placeholder="you@company.com" /></label>' +
            '<label>Company<input name="company" required autocomplete="organization" placeholder="Company" /></label>' +
          '</div>' +
          '<label>Phone or WhatsApp, optional<input name="phone" autocomplete="tel" placeholder="+95..." /></label>' +
          '<label class="honeypot">Website<input name="website" autocomplete="off" tabindex="-1" /></label>' +
          '<button type="submit">Send plan</button>' +
          '<p class="hint lead-status" data-blueprint-lead-status></p>' +
        '</form>';
      }
      function encodeState(raw) {
        return btoa(unescape(encodeURIComponent(JSON.stringify(raw)))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
      }
      function decodeState(value) {
        const token = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
        const padded = token + '='.repeat((4 - (token.length % 4)) % 4);
        return JSON.parse(decodeURIComponent(escape(atob(padded))));
      }
      function shareUrl(raw) {
        const url = new URL(window.location.href);
        url.search = '';
        url.hash = '';
        url.searchParams.set('blueprint', encodeState(raw));
        return url.toString();
      }
      function currentModel() {
        const raw = fields();
        const model = blueprints[kindFor(raw)];
        const score = scoreFor(raw);
        return { raw, model, score };
      }
      function copyText(text, label) {
        const write = navigator.clipboard?.writeText(text);
        if (write?.catch) write.catch(function () {});
        label.textContent = 'Copied';
        setTimeout(function () { label.textContent = label.dataset.originalLabel || 'Copy'; }, 1400);
      }
      function downloadText(filename, text) {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }
      function render(scroll) {
        const raw = fields();
        const model = blueprints[kindFor(raw)];
        const score = scoreFor(raw);
        const monthlyHours = Math.round(raw.hours * 4.3);
        const copyText = packet(raw, model, score);
        const promptText = agentPrompt(raw, model, score);
        const shareLink = shareUrl(raw);
        localStorage.setItem(storageKey, JSON.stringify(raw));
        result.innerHTML =
          '<div class="eyebrow">Business Tool Builder</div>' +
          '<h2>' + esc(raw.workflow) + '</h2>' +
          '<div class="meter" aria-label="Readiness score ' + score + ' out of 100" style="--score:' + score + '%"><span></span></div>' +
          '<div class="score">' +
            '<div class="metric"><span>Readiness</span><strong>' + score + '</strong></div>' +
            '<div class="metric"><span>Monthly waste</span><strong>' + monthlyHours + 'h</strong></div>' +
            '<div class="metric"><span>SaaS cost</span><strong>$' + money.format(raw.cost) + '</strong></div>' +
            '<div class="metric"><span>Prepared action</span><strong>' + esc(model.action) + '</strong></div>' +
          '</div>' +
          '<div class="cards">' +
            '<div class="mini"><h3>First module</h3><p>' + esc(model.module) + ' for ' + esc(raw.role) + '. First screen: ' + esc(raw.screen) + '</p></div>' +
            '<div class="mini"><h3>Source model</h3>' + list(model.schema) + '</div>' +
            '<div class="mini"><h3>Work rules</h3>' + list(model.agents) + '</div>' +
            '<div class="mini"><h3>Guardrails checklist</h3>' + list(['show source evidence on every prepared answer', 'human approval before writeback', 'audit log for prepared actions', 'QA replay with Playwright before launch']) + '</div>' +
          '</div>' +
          '<div class="plan">' +
            model.steps.map(function (step, index) {
              return '<div class="row"><b>' + (index + 1) + '</b><div><strong>' + esc(step) + '</strong><small>Built around the current system: ' + esc(raw.tool) + ' and source: ' + esc(raw.source) + '.</small></div><span class="pill">Step ' + (index + 1) + '</span></div>';
            }).join('') +
          '</div>' +
          '<div class="stack"><div class="mini"><h3>Review design</h3><div class="tagbar">' + ['Read source', 'Clean data', 'Draft action', 'Human review', 'QA check'].map(function (item) { return '<span class="tag">' + esc(item) + '</span>'; }).join('') + '</div><p>The system prepares the work. A person approves the final action before anything changes.</p></div><div class="mini"><h3>Support path</h3><p>' + esc(model.price) + '. Start with one source sample and one working screen before expanding into a full custom app.</p></div></div>' +
          '<pre class="copy-box" data-copy-box>' + esc(copyText) + '</pre>' +
          '<pre class="copy-box" data-agent-prompt-box hidden>' + esc(promptText) + '</pre>' +
          '<input type="hidden" data-share-url value="' + esc(shareLink) + '" />' +
          '<div class="cta"><button type="button" data-copy-packet>Copy plan</button><button type="button" data-copy-agent-prompt>Copy build prompt</button><button type="button" data-share-link>Copy share link</button><button type="button" data-download-packet>Download .txt</button><button type="button" data-reset-blueprint>Reset</button><a class="btn" href="/contact/?source=business-tool-builder&workflow=' + encodeURIComponent(raw.workflow) + '">Contact</a></div>' +
          leadFormHtml();
        if (scroll) result.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      try {
        const query = new URLSearchParams(window.location.search);
        const shared = query.get('blueprint');
        const saved = shared ? decodeState(shared) : JSON.parse(localStorage.getItem(storageKey) || '{}');
        Array.from(form.elements).forEach(function (field) {
          if (field.name && saved[field.name]) field.value = saved[field.name];
        });
      } catch (error) {}
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        render(true);
      });
      form.addEventListener('input', function () {
        render(false);
      });
      form.addEventListener('change', function () {
        render(false);
      });
      result.addEventListener('submit', async function (event) {
        const leadForm = event.target.closest('[data-blueprint-lead-form]');
        if (!leadForm) return;
        event.preventDefault();
        const status = leadForm.querySelector('[data-blueprint-lead-status]');
        const submit = leadForm.querySelector('button[type="submit"]');
        const { raw, model, score } = currentModel();
        const blueprint = packet(raw, model, score);
        const promptText = agentPrompt(raw, model, score);
        const params = new URLSearchParams(window.location.search);
        const payload = Object.fromEntries(new FormData(leadForm));
        payload.workflow = raw.workflow;
        payload.requested_package = 'Business Tool Builder';
        payload.data = promptText.slice(0, 900);
        payload.team = [raw.role, raw.business].filter(Boolean).join(' / ');
        payload.goal = blueprint;
        payload.source_url = window.location.href;
        payload.page_path = window.location.pathname;
        payload.referrer = document.referrer || '';
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (key) {
          const value = params.get(key);
          if (value) payload[key] = value;
        });
          status.textContent = 'Sending plan...';
        if (submit) submit.disabled = true;
        try {
          const response = await fetch('/api/contact-submissions', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const body = await response.json().catch(function () { return {}; });
          if (!response.ok) throw new Error(body.reason || 'send_failed');
          const leadId = body.pipeline?.lead_id || body.submission?.lead_id || 'routed';
          status.textContent = 'Sent. SuperMega captured this plan as ' + leadId + '.';
          leadForm.reset();
        } catch (error) {
          status.textContent = 'Could not send here. Copy the packet or email swanhtet@supermega.dev.';
        } finally {
          if (submit) submit.disabled = false;
        }
      });
      result.addEventListener('click', function (event) {
        if (event.target.matches('[data-copy-packet]')) {
          const text = result.querySelector('[data-copy-box]')?.textContent || '';
          event.target.dataset.originalLabel = 'Copy plan';
          copyText(text, event.target);
        }
        if (event.target.matches('[data-copy-agent-prompt]')) {
          const text = result.querySelector('[data-agent-prompt-box]')?.textContent || '';
          event.target.dataset.originalLabel = 'Copy AI build prompt';
          copyText(text, event.target);
        }
        if (event.target.matches('[data-share-link]')) {
          const { raw } = currentModel();
          const link = shareUrl(raw);
          history.replaceState(null, '', link);
          event.target.dataset.originalLabel = 'Copy share link';
          copyText(link, event.target);
        }
        if (event.target.matches('[data-download-packet]')) {
          const { raw, model, score } = currentModel();
          downloadText('supermega-business-tool-plan.txt', packet(raw, model, score) + String.fromCharCode(10, 10) + agentPrompt(raw, model, score));
        }
        if (event.target.matches('[data-reset-blueprint]')) {
          localStorage.removeItem(storageKey);
          history.replaceState(null, '', window.location.pathname);
          form.reset();
          render(false);
        }
      });
      render(false);
    </script>
  </body>
</html>`

const publicDailyCloseCheckerHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Daily Close Checker | SUPERMEGA.dev</title>
    <meta name="description" content="Free store close checker for cash, QR payments, proof gaps, and owner daily summary." />
    <meta name="theme-color" content="#f6f2e8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>
      :root { color-scheme: light; --bg:#f6f2e8; --ink:#15120d; --muted:#6d675d; --line:#ded6c7; --blue:#2458ff; --paper:#fffaf0; --card:#ffffff; }
      * { box-sizing:border-box; }
      body { margin:0; min-height:100vh; background:linear-gradient(90deg,rgba(21,18,13,.04) 1px,transparent 1px),linear-gradient(180deg,rgba(21,18,13,.04) 1px,transparent 1px),var(--bg); background-size:42px 42px; color:var(--ink); font-family:"Aptos","Segoe UI Variable","Segoe UI",system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
      a { color:inherit; text-decoration:none; }
      .wrap { width:min(1080px,calc(100% - 32px)); margin:0 auto; }
      header { display:flex; justify-content:space-between; align-items:center; padding:22px 0; border-bottom:1px solid var(--line); }
      .brand { display:flex; gap:12px; align-items:center; font-weight:950; letter-spacing:-.05em; }
      .mark { width:40px; height:40px; border-radius:12px; display:grid; place-items:center; background:var(--ink); color:#fff; }
      .btn, button { border:1px solid var(--line); border-radius:999px; padding:12px 16px; background:rgba(255,255,255,.72); font:inherit; font-weight:900; cursor:pointer; }
      .btn.primary, button.primary { background:var(--blue); border-color:var(--blue); color:#fff; }
      main { padding:32px 0 64px; }
      .hero { display:grid; grid-template-columns:minmax(0,.9fr) minmax(320px,1fr); gap:clamp(24px,5vw,70px); align-items:start; }
      .eyebrow { color:var(--blue); font-size:12px; font-weight:950; letter-spacing:.18em; text-transform:uppercase; }
      h1 { margin:18px 0; max-width:9ch; font-size:clamp(56px,9vw,112px); line-height:.86; letter-spacing:-.085em; }
      p { margin:0; color:var(--muted); font-size:clamp(18px,2vw,22px); line-height:1.46; max-width:34rem; }
      .panel { border:1px solid var(--line); border-radius:28px; background:rgba(255,255,255,.78); padding:clamp(18px,3vw,28px); box-shadow:0 24px 70px rgba(21,18,13,.08); }
      form { display:grid; gap:12px; }
      .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
      label { display:grid; gap:7px; color:var(--muted); font-size:12px; font-weight:950; letter-spacing:.13em; text-transform:uppercase; }
      input, textarea { width:100%; border:1px solid var(--line); border-radius:15px; background:#fffdf8; color:var(--ink); padding:13px 14px; font:inherit; outline:none; }
      textarea { min-height:96px; resize:vertical; }
      input:focus, textarea:focus { border-color:var(--blue); box-shadow:0 0 0 4px rgba(36,88,255,.12); }
      .result { margin-top:18px; display:grid; gap:12px; }
      .cards { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
      .card { border:1px solid var(--line); border-radius:20px; background:var(--paper); padding:16px; }
      .card small { display:block; color:var(--blue); font-weight:950; letter-spacing:.14em; text-transform:uppercase; }
      .card strong { display:block; margin-top:8px; font-size:clamp(24px,4vw,38px); letter-spacing:-.06em; }
      pre { white-space:pre-wrap; margin:0; border:1px solid var(--line); border-radius:20px; background:#15120d; color:#fffaf0; padding:16px; line-height:1.45; }
      .note { margin-top:18px; display:grid; gap:10px; }
      .status { min-height:20px; color:var(--muted); font-weight:800; }
      .hint { margin-top:12px; font-size:14px; }
      .actions { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
      @media (max-width:820px) { header,.hero,.grid,.cards { grid-template-columns:1fr; } h1 { font-size:clamp(48px,15vw,72px); } .btn,button { width:100%; text-align:center; } }
      @media (max-width:820px) { .actions { grid-template-columns:1fr; } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <a class="brand" href="/"><span class="mark"><img src="/favicon.svg" alt="" /></span><span>SUPERMEGA.dev</span></a>
        <a class="btn" href="/contact/?tool=daily-close-checker">Contact</a>
      </header>
      <main>
        <section class="hero">
          <div>
            <div class="eyebrow">Free business tool</div>
            <h1>Close the day clean.</h1>
            <p>Enter expected sales, cash, QR/payment totals, unpaid amounts, expenses, and notes. Get the owner summary before screenshots turn into confusion.</p>
            <p class="hint">Custom links work too: add <strong>?type=restaurant</strong>, <strong>?type=shop</strong>, or <strong>?type=service</strong> for a client-specific first screen.</p>
          </div>
          <aside class="panel">
            <form data-close-form>
              <div class="grid">
                <label>Business<input name="business" value="Store / restaurant" /></label>
                <label>Contact<input name="contact" placeholder="Phone, WhatsApp, or email" /></label>
                <label>Date<input name="date" type="date" /></label>
                <label>Expected sales<input name="expected" inputmode="decimal" placeholder="0" /></label>
                <label>Cash collected<input name="cash" inputmode="decimal" placeholder="0" /></label>
                <label>KBZPay / KPay<input name="kpay" inputmode="decimal" placeholder="0" /></label>
                <label>WavePay<input name="wave" inputmode="decimal" placeholder="0" /></label>
                <label>Bank / card / other<input name="other" inputmode="decimal" placeholder="0" /></label>
                <label>Unpaid / pending<input name="pending" inputmode="decimal" placeholder="0" /></label>
                <label>Expenses paid from cash<input name="expenses" inputmode="decimal" placeholder="0" /></label>
              </div>
              <label>What needs checking?<textarea name="notes" placeholder="Missing payment screenshot, cash mismatch, refund, discount, shift note..."></textarea></label>
              <button class="primary" type="submit">Check close</button>
            </form>
          </aside>
        </section>
        <section class="panel result" data-close-result aria-live="polite">
          <div class="eyebrow">Daily Close Checker</div>
          <h2 style="margin:6px 0 0;font-size:clamp(36px,6vw,70px);line-height:.92;letter-spacing:-.07em">Run the check.</h2>
          <p>Works now without a merchant account. When merchant setup is ready, this becomes the payment-proof flow inside Restaurant POS + Inventory.</p>
        </section>
      </main>
    </div>
    <script>
      const form = document.querySelector('[data-close-form]');
      const result = document.querySelector('[data-close-result]');
      const params = new URLSearchParams(window.location.search);
      const today = new Date().toISOString().slice(0, 10);
      form.elements.date.value = today;
      const presets = {
        restaurant: { business: 'Restaurant / cafe', note: 'QR payment screenshot, delivery order, discount, refund, shift note...' },
        cafe: { business: 'Restaurant / cafe', note: 'QR payment screenshot, delivery order, discount, refund, shift note...' },
        shop: { business: 'Shop / retail counter', note: 'Cash mismatch, supplier payment, unpaid customer, return, staff note...' },
        retail: { business: 'Shop / retail counter', note: 'Cash mismatch, supplier payment, unpaid customer, return, staff note...' },
        service: { business: 'Service counter', note: 'Booking deposit, completed job, unpaid customer, staff commission, expense...' },
        clinic: { business: 'Clinic / appointment desk', note: 'Patient payment proof, unpaid balance, appointment note, refund, expense...' }
      };
      const type = String(params.get('type') || params.get('industry') || '').toLowerCase();
      if (presets[type]) {
        form.elements.business.value = presets[type].business;
        form.elements.notes.placeholder = presets[type].note;
      }
      const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
      function n(name) {
        return Number(String(form.elements[name].value || '0').replace(/,/g, '')) || 0;
      }
      function text(name) {
        return String(form.elements[name].value || '').trim();
      }
      function brief(data) {
        return [
          'Daily close: ' + data.business + ' / ' + data.date,
          data.contact ? 'Contact: ' + data.contact : '',
          'Expected sales: ' + (data.expected > 0 ? money.format(data.expected) : 'not entered'),
          'Collected: ' + money.format(data.totalCollected),
          'Digital/payment proof: ' + money.format(data.digitalTotal),
          'Cash after expenses: ' + money.format(data.cashAfterExpenses),
          'Pending/unpaid: ' + money.format(data.pending),
          data.expected > 0 ? 'Variance: ' + money.format(data.variance) : '',
          'Owner focus: ' + data.focus,
          'Source: ' + data.type + ' / ' + data.campaign,
          data.notes ? 'Notes: ' + data.notes : ''
        ].filter(Boolean).join(String.fromCharCode(10));
      }
      function csv(data) {
        const row = [data.date, data.business, data.contact, data.expected, data.totalCollected, data.cash, data.digitalTotal, data.pending, data.expenses, data.variance, data.focus, data.notes].map(function (value) {
          return '"' + String(value ?? '').replace(/"/g, '""') + '"';
        }).join(',');
        return 'date,business,contact,expected,total_collected,cash,digital,pending,expenses,variance,owner_focus,notes' + String.fromCharCode(10) + row;
      }
      function download(filename, body) {
        const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
      function model() {
        const cash = n('cash');
        const kpay = n('kpay');
        const wave = n('wave');
        const other = n('other');
        const expected = n('expected');
        const pending = n('pending');
        const expenses = n('expenses');
        const digitalTotal = kpay + wave + other;
        const cashAfterExpenses = cash - expenses;
        const totalCollected = cash + digitalTotal;
        const variance = expected > 0 ? totalCollected + pending - expected : 0;
        const focus = expected > 0 && Math.abs(variance) > 0 ? 'Resolve the expected-vs-actual difference and attach proof.' : pending > 0 ? 'Collect pending payments and attach proof.' : expenses > cash ? 'Cash expenses exceed cash collected. Review proof.' : digitalTotal > cash ? 'Check QR/payment settlement proof first.' : 'Close looks normal. Keep proof attached.';
        return { business: text('business') || 'Business', contact: text('contact'), date: text('date') || today, expected, cash, kpay, wave, other, pending, expenses, digitalTotal, cashAfterExpenses, totalCollected, variance, focus, notes: text('notes'), campaign: params.get('ref') || params.get('utm_campaign') || 'direct', type: type || 'general' };
      }
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        const data = model();
        const packet = brief(data);
        result.innerHTML =
          '<div class="eyebrow">Owner summary</div>' +
          '<div class="cards">' +
          '<div class="card"><small>Collected</small><strong>' + money.format(data.totalCollected) + '</strong></div>' +
          '<div class="card"><small>Payment proof</small><strong>' + money.format(data.digitalTotal) + '</strong></div>' +
          '<div class="card"><small>Variance</small><strong>' + (data.expected > 0 ? money.format(data.variance) : '-') + '</strong></div>' +
          '</div>' +
          '<pre data-close-copy>' + packet.replace(/[&<>]/g, function (c) { return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;" })[c]; }) + '</pre>' +
          '<div class="note"><div class="actions"><button type="button" data-copy-close>Copy summary</button><button type="button" data-download-close>Download CSV</button><button class="primary" type="button" data-send-close>Send to SuperMega</button></div><p class="status" data-close-status></p></div>';
        result.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      result.addEventListener('click', async function (event) {
        if (event.target.matches('[data-copy-close]')) {
          await navigator.clipboard.writeText(result.querySelector('[data-close-copy]')?.textContent || '');
          event.target.textContent = 'Copied';
        }
        if (event.target.matches('[data-download-close]')) {
          const data = model();
          download('supermega-daily-close-' + data.date + '.csv', csv(data));
        }
        if (event.target.matches('[data-send-close]')) {
          const status = result.querySelector('[data-close-status]');
          const data = model();
          status.textContent = 'Sending...';
          try {
            const response = await fetch('/api/contact-submissions', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                name: data.business,
                email: data.contact.includes('@') ? data.contact : '',
                company: data.business,
                phone: data.contact.includes('@') ? '' : data.contact,
                requested_package: 'Daily Close Checker',
                workflow: 'Store daily close and payment proof',
                data: brief(data),
                goal: 'Turn this close flow into Restaurant POS + Inventory.',
                campaign: data.campaign,
                business_type: data.type,
                source_url: window.location.href,
                page_path: window.location.pathname
              })
            });
            const body = await response.json().catch(function () { return {}; });
            if (!response.ok) throw new Error(body.reason || 'send_failed');
            status.textContent = 'Sent. Lead ID: ' + (body.pipeline?.lead_id || body.submission?.lead_id || 'routed');
          } catch (error) {
            status.textContent = 'Could not send here. Copy the summary or email swanhtet@supermega.dev.';
          }
        }
      });
    </script>
  </body>
</html>`

const publicAgentScopeBuilderHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Workflow Scope Builder | SUPERMEGA.dev</title>
    <meta name="description" content="A free tool for scoping one safe, useful workflow before building custom business software." />
    <meta name="theme-color" content="#f5f1e8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>
      :root { color-scheme: light; --bg:#f5f1e8; --ink:#10141b; --muted:#706b62; --line:#ddd4c4; --blue:#2458ff; --cyan:#18bfd1; --paper:#fffaf0; --panel:#ffffff; --dark:#10141b; }
      * { box-sizing:border-box; }
      html { scroll-behavior:smooth; }
      body { margin:0; min-height:100vh; background:radial-gradient(circle at 78% 0%,rgba(24,191,209,.22),transparent 28rem),linear-gradient(90deg,rgba(16,20,27,.045) 1px,transparent 1px),linear-gradient(180deg,rgba(16,20,27,.045) 1px,transparent 1px),var(--bg); background-size:auto,44px 44px,44px 44px; color:var(--ink); font-family:"Aptos","Segoe UI Variable","Segoe UI",system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
      a { color:inherit; text-decoration:none; }
      .wrap { width:min(1120px,calc(100% - 32px)); margin:0 auto; }
      header { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:22px 0; border-bottom:1px solid var(--line); }
      .brand { display:flex; align-items:center; gap:12px; font-weight:950; letter-spacing:-.045em; }
      .mark { width:42px; height:42px; display:grid; place-items:center; border-radius:14px; background:var(--dark); color:#ecfbff; box-shadow:0 14px 40px rgba(16,20,27,.16); }
      .btn, button { display:inline-flex; justify-content:center; align-items:center; border:1px solid var(--line); border-radius:999px; padding:12px 16px; background:rgba(255,255,255,.76); color:var(--ink); font:inherit; font-weight:950; cursor:pointer; }
      .btn.primary, button.primary { border-color:transparent; background:linear-gradient(135deg,var(--cyan),var(--blue)); color:#fff; box-shadow:0 18px 45px rgba(36,88,255,.22); }
      main { padding:34px 0 70px; }
      .hero { display:grid; grid-template-columns:minmax(0,.9fr) minmax(340px,1.1fr); gap:clamp(24px,5vw,64px); align-items:start; }
      .eyebrow { color:var(--blue); font-size:12px; font-weight:950; letter-spacing:.18em; text-transform:uppercase; }
      h1 { margin:18px 0; max-width:9ch; font-size:clamp(58px,9vw,108px); line-height:.84; letter-spacing:-.085em; }
      h2 { margin:6px 0 0; font-size:clamp(34px,6vw,70px); line-height:.9; letter-spacing:-.075em; }
      h3 { margin:0; font-size:20px; line-height:1.05; letter-spacing:-.03em; }
      p { margin:0; max-width:34rem; color:var(--muted); font-size:clamp(18px,2vw,22px); line-height:1.45; }
      .panel { border:1px solid var(--line); border-radius:30px; background:rgba(255,255,255,.78); padding:clamp(18px,3vw,28px); box-shadow:0 28px 80px rgba(16,20,27,.1); }
      form { display:grid; gap:12px; }
      .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
      label { display:grid; gap:8px; color:#625e56; font-size:12px; font-weight:950; letter-spacing:.13em; text-transform:uppercase; }
      input, select, textarea { width:100%; border:1px solid var(--line); border-radius:16px; background:#fffdf8; color:var(--ink); padding:13px 14px; font:inherit; outline:none; }
      textarea { min-height:96px; resize:vertical; }
      input:focus, select:focus, textarea:focus { border-color:var(--blue); box-shadow:0 0 0 4px rgba(36,88,255,.12); }
      .result { margin-top:20px; display:grid; gap:14px; }
      .steps { display:grid; gap:10px; margin-top:4px; }
      .step { display:grid; grid-template-columns:auto 1fr; gap:12px; align-items:start; border:1px solid var(--line); border-radius:18px; background:var(--paper); padding:14px; }
      .step b { width:30px; height:30px; display:grid; place-items:center; border-radius:999px; background:var(--dark); color:#fff; }
      .step strong { display:block; }
      .step small { display:block; margin-top:3px; color:var(--muted); line-height:1.45; font-weight:760; }
      .cards { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
      .card { border:1px solid var(--line); border-radius:20px; background:var(--panel); padding:16px; }
      .card small { display:block; color:var(--blue); font-size:11px; font-weight:950; letter-spacing:.14em; text-transform:uppercase; }
      .card strong { display:block; margin-top:7px; font-size:clamp(24px,4vw,38px); letter-spacing:-.06em; line-height:.95; }
      pre { white-space:pre-wrap; margin:0; border:1px solid var(--line); border-radius:20px; background:var(--dark); color:#f7fbff; padding:16px; font-size:13px; line-height:1.5; overflow:auto; }
      .actions { display:flex; flex-wrap:wrap; gap:10px; }
      .status { min-height:20px; color:var(--muted); font-weight:850; }
      .hint { margin-top:14px; font-size:14px; color:var(--muted); }
      @media (max-width:860px) { header,.hero,.grid,.cards { grid-template-columns:1fr; } h1 { font-size:clamp(48px,15vw,74px); } .btn,button { width:100%; text-align:center; } .actions { display:grid; grid-template-columns:1fr; } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <a class="brand" href="/"><span class="mark"><img src="/favicon.svg" alt="" /></span><span>SUPERMEGA.dev</span></a>
        <a class="btn" href="/contact/?tool=workflow-scope-builder">Contact</a>
      </header>
      <main>
        <section class="hero">
          <div>
            <div class="eyebrow">Free workflow tool</div>
            <h1>Scope one useful workflow.</h1>
            <p>Pick one job, one source, one output, and one approval gate. SuperMega turns it into a safe first screen your team can actually use.</p>
            <p class="hint">Best first workflows: read, clean, draft, route, summarize, check. Do not start with full autonomy.</p>
          </div>
          <aside class="panel">
            <form data-agent-form>
              <div class="grid">
                <label>Workflow job<input name="job" required value="Prepare the daily owner summary" /></label>
                <label>Business type<input name="business" value="Shop / service business" /></label>
                <label>Main source<select name="source"><option>Gmail or inbox</option><option>Drive folder / PDFs</option><option>Spreadsheet / CSV</option><option>POS or payment export</option><option>WhatsApp / Messenger notes</option><option>Photos or screenshots</option></select></label>
                <label>Allowed action<select name="action"><option>Read and summarize</option><option>Prepare reviewable records</option><option>Draft reply or task</option><option>Route to owner</option><option>Flag mismatch</option><option>Export report</option></select></label>
                <label>Approval gate<select name="approval"><option>Human approves before anything changes</option><option>Read-only report only</option><option>Manager approves before sending</option><option>Owner approves before payment/customer action</option></select></label>
                <label>Output<select name="output"><option>Daily brief</option><option>Review queue</option><option>Clean table</option><option>Draft message</option><option>Exception list</option><option>Report packet</option></select></label>
              </div>
              <label>What should it never do?<textarea name="never">Never send messages, change records, or make payment/customer decisions without approval.</textarea></label>
              <label>What does success look like?<textarea name="success">The owner sees what changed, what is missing, who owns it, and what needs a decision today.</textarea></label>
              <div class="grid">
                <label>Your name<input name="name" placeholder="Optional" /></label>
                <label>Contact<input name="contact" placeholder="Phone, WhatsApp, or email" /></label>
              </div>
              <button class="primary" type="submit">Build workflow scope</button>
            </form>
          </aside>
        </section>
        <section class="panel result" data-agent-result aria-live="polite">
          <div class="eyebrow">Workflow Scope Builder</div>
          <h2>Start with control.</h2>
          <p>Run the builder to get a workflow card, guardrails, data checklist, and SuperMega build packet.</p>
          <div class="steps">
            <div class="step"><b>1</b><div><strong>Read first.</strong><small>Connect one source and produce one reviewable output.</small></div></div>
            <div class="step"><b>2</b><div><strong>Approve before writeback.</strong><small>The first version drafts and flags. A person confirms.</small></div></div>
            <div class="step"><b>3</b><div><strong>Measure usefulness.</strong><small>Track time saved, errors caught, and decisions prepared.</small></div></div>
          </div>
        </section>
      </main>
    </div>
    <script>
      const form = document.querySelector('[data-agent-form]');
      const result = document.querySelector('[data-agent-result]');
      const params = new URLSearchParams(window.location.search);
      function text(name) { return String(form.elements[name].value || '').trim(); }
      function esc(value) { return String(value || '').replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
      function classify(source, action) {
        const haystack = (source + ' ' + action).toLowerCase();
        if (/payment|pos/.test(haystack)) return 'Payment proof workflow';
        if (/drive|pdf|photo|screenshot/.test(haystack)) return 'File cleanroom workflow';
        if (/gmail|inbox|whatsapp|messenger/.test(haystack)) return 'Inbox triage workflow';
        if (/spreadsheet|csv/.test(haystack)) return 'Record cleanup workflow';
        return 'Operator review workflow';
      }
      function packet(data) {
        return [
          'Workflow scope: ' + data.name,
          'Business: ' + data.business,
          'Job: ' + data.job,
          'Source: ' + data.source,
          'Allowed action: ' + data.action,
          'Output: ' + data.output,
          'Approval gate: ' + data.approval,
          'Must never do: ' + data.never,
          'Success: ' + data.success,
          'First SuperMega build:',
          '1. Connect one sample source.',
          '2. Extract or summarize into a review screen.',
          '3. Attach source evidence to every claim.',
          '4. Require human approval before writeback.',
          '5. Log every run, output, and decision.'
        ].join(String.fromCharCode(10));
      }
      function model() {
        const source = text('source');
        const action = text('action');
        return {
          name: classify(source, action),
          job: text('job') || 'Prepare one repeated task',
          business: text('business') || 'Business',
          source,
          action,
          approval: text('approval'),
          output: text('output'),
          never: text('never'),
          success: text('success'),
          contact: text('contact'),
          person: text('name'),
          campaign: params.get('ref') || params.get('utm_campaign') || 'direct'
        };
      }
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        const data = model();
        const body = packet(data);
        result.innerHTML =
          '<div class="eyebrow">Workflow card</div>' +
          '<h2>' + esc(data.name) + '</h2>' +
          '<div class="cards">' +
          '<div class="card"><small>Source</small><strong>' + esc(data.source) + '</strong></div>' +
          '<div class="card"><small>Action</small><strong>' + esc(data.action) + '</strong></div>' +
          '<div class="card"><small>Gate</small><strong>Approve</strong></div>' +
          '</div>' +
          '<div class="steps">' +
          '<div class="step"><b>1</b><div><strong>Use one real source.</strong><small>' + esc(data.source) + ' becomes the first sample.</small></div></div>' +
          '<div class="step"><b>2</b><div><strong>Produce one output.</strong><small>' + esc(data.output) + ' is the first deliverable.</small></div></div>' +
          '<div class="step"><b>3</b><div><strong>Keep the workflow controlled.</strong><small>' + esc(data.approval) + '.</small></div></div>' +
          '</div>' +
          '<pre data-agent-copy>' + esc(body) + '</pre>' +
          '<div class="actions"><button type="button" data-copy-agent>Copy scope</button><button type="button" data-download-agent>Download .txt</button><button class="primary" type="button" data-send-agent>Send to SuperMega</button></div>' +
          '<p class="status" data-agent-status></p>';
        result.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      result.addEventListener('click', async function (event) {
        if (event.target.matches('[data-copy-agent]')) {
          await navigator.clipboard.writeText(result.querySelector('[data-agent-copy]')?.textContent || '');
          event.target.textContent = 'Copied';
        }
        if (event.target.matches('[data-download-agent]')) {
          const blob = new Blob([result.querySelector('[data-agent-copy]')?.textContent || ''], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'supermega-workflow-scope.txt';
          a.click();
          URL.revokeObjectURL(url);
        }
        if (event.target.matches('[data-send-agent]')) {
          const data = model();
          const status = result.querySelector('[data-agent-status]');
          status.textContent = 'Sending...';
          try {
            const response = await fetch('/api/contact-submissions', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                name: data.person || data.business,
                email: data.contact.includes('@') ? data.contact : '',
                phone: data.contact.includes('@') ? '' : data.contact,
                company: data.business,
                requested_package: 'Workflow Scope Builder',
                workflow: data.job,
                data: packet(data),
                goal: 'Build one controlled workflow with source evidence and human approval.',
                campaign: data.campaign,
                source_url: window.location.href,
                page_path: window.location.pathname
              })
            });
            const body = await response.json().catch(function () { return {}; });
            if (!response.ok) throw new Error(body.reason || 'send_failed');
            status.textContent = 'Sent. Lead ID: ' + (body.pipeline?.lead_id || body.submission?.lead_id || 'routed');
          } catch (error) {
            status.textContent = 'Could not send here. Copy the scope or email swanhtet@supermega.dev.';
          }
        }
      });
    </script>
  </body>
</html>`

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
          <span class="brand-text"><strong>SUPERMEGA.dev</strong><small>Business apps for real work</small></span>
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
    <meta name="description" content="Swan Htet builds simple AI work tools for business teams." />
    <link rel="canonical" href="https://supermega.dev/card/" />
    <meta property="og:type" content="profile" />
    <meta property="og:site_name" content="SUPERMEGA.dev" />
    <meta property="og:title" content="Swan Htet | SUPERMEGA.dev" />
    <meta property="og:description" content="Swan Htet builds simple AI work tools for business teams." />
    <meta property="og:url" content="https://supermega.dev/card/" />
    <meta property="og:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <meta name="theme-color" content="#07111f" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>
      :root { color-scheme: dark; --bg: #07111f; --text: #f7fbff; --muted: #a8b8ca; --cyan: #64efff; --blue: #4f8cff; --ink: #06101d; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100svh; display: grid; place-items: center; padding: 24px; background-color: #07111f; background-image: radial-gradient(circle at 76% 22%, rgba(100,239,255,0.2), transparent 24rem), radial-gradient(circle at 6% 88%, rgba(79,140,255,0.18), transparent 26rem), linear-gradient(135deg, #07111f, #030710 70%); color: var(--text); font-family: "Aptos", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
      a { color: inherit; text-decoration: none; }
      .card { position: relative; overflow: hidden; width: min(980px, 100%); min-height: min(660px, calc(100svh - 48px)); display: flex; align-items: center; border: 1px solid rgba(217,247,255,0.14); border-radius: clamp(28px, 5vw, 54px); background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.035)); box-shadow: inset 0 1px 0 rgba(255,255,255,0.12), 0 42px 120px rgba(0,0,0,0.38); padding: clamp(28px, 7vw, 78px); }
      .card::before { content: "SUPERMEGA"; position: absolute; right: -5%; bottom: 0; color: transparent; -webkit-text-stroke: 1.5px rgba(247,251,255,0.045); font-size: clamp(68px, 16vw, 190px); font-weight: 950; letter-spacing: -0.1em; line-height: 0.8; }
      .content { position: relative; max-width: 690px; }
      .brand { display: inline-flex; align-items: center; gap: 12px; color: var(--cyan); font-size: 12px; font-weight: 950; letter-spacing: 0.22em; text-transform: uppercase; }
      .mark { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 14px; overflow: hidden; background: #07111f; border: 1px solid rgba(255,255,255,0.16); }
      .mark img { width: 100%; height: 100%; display: block; }
      h1 { margin: 28px 0 10px; font-size: clamp(74px, 16vw, 154px); line-height: 0.8; letter-spacing: -0.1em; }
      .role { margin: 0 0 18px; color: var(--cyan); font-size: clamp(18px, 3vw, 24px); font-weight: 850; }
      .event { display: inline-flex; margin-top: 22px; border: 1px solid rgba(100,239,255,0.2); border-radius: 999px; padding: 9px 12px; color: rgba(247,251,255,0.78); background: rgba(100,239,255,0.06); font-size: 12px; font-weight: 850; letter-spacing: 0.08em; text-transform: uppercase; }
      .pitch { max-width: 36rem; margin: 0 0 30px; color: rgba(247,251,255,0.84); font-size: clamp(20px, 3vw, 28px); line-height: 1.22; font-weight: 760; letter-spacing: -0.035em; }
      .details { display: grid; gap: 10px; margin-bottom: 28px; }
      .details a { width: fit-content; color: var(--text); font-size: clamp(18px, 3vw, 26px); font-weight: 850; }
      .details a:hover { color: var(--cyan); }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; }
      .button { display: inline-flex; align-items: center; justify-content: center; min-height: 54px; border-radius: 999px; padding: 0 22px; background: linear-gradient(135deg, var(--cyan), var(--blue)); color: var(--ink); font-weight: 950; box-shadow: 0 22px 60px rgba(79,140,255,0.28); }
      .button.secondary { border: 1px solid rgba(247,251,255,0.16); background: rgba(255,255,255,0.06); color: var(--text); box-shadow: none; }
      @media (max-width: 560px) { body { padding: 14px; } .card { align-items: flex-end; min-height: calc(100svh - 28px); padding: 28px; border-radius: 30px; } h1 { font-size: clamp(72px, 22vw, 104px); } .pitch { font-size: 20px; } .details a { font-size: 18px; } }
    </style>
  </head>
  <body>
    <main class="card" aria-label="Swan Htet contact card">
      <section class="content">
        <a class="brand" href="/" aria-label="SUPERMEGA.dev home"><span class="mark"><img src="/favicon.svg?v=supermega-atelier-20260623" alt="" /></span><span>SUPERMEGA.dev</span></a>
        <h1>Swan Htet</h1>
        <p class="role">Founder</p>
        <div class="details">
          <a href="mailto:swanhtet@supermega.dev">swanhtet@supermega.dev</a>
          <a href="tel:+9595000721">+95 9 500 0721</a>
        </div>
        <div class="actions">
          <a class="button" href="${activeCardContactPath}">Website</a>
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

const publicContactHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Contact | SUPERMEGA.dev</title>
    <meta name="description" content="Contact SUPERMEGA with one file, folder, screenshot, list, link, or business question." />
    <meta name="theme-color" content="#f7f4ed" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>
      :root { color-scheme: light; --text: #14110c; --muted: #6f6a60; --cyan: #2458ff; --blue: #2458ff; --ink: #ffffff; --line: #ded6c7; --panel: #ffffff; --bg: #f7f4ed; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100svh; background: linear-gradient(90deg, rgba(20,17,12,.035) 1px, transparent 1px), linear-gradient(180deg, rgba(20,17,12,.035) 1px, transparent 1px), var(--bg); background-size: 44px 44px; color: var(--text); font-family: "Aptos", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
      a { color: inherit; text-decoration: none; }
      .wrap { width: min(1040px, calc(100% - 32px)); margin: 0 auto; }
      header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 22px 0; }
      .brand { display: inline-flex; align-items: center; gap: 12px; font-weight: 950; letter-spacing: -0.04em; }
      .mark { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 15px; background: var(--text); border: 1px solid var(--text); color: #ffffff; }
      .btn, button { display: inline-flex; align-items: center; justify-content: center; min-height: 52px; border: 1px solid var(--line); border-radius: 999px; padding: 0 20px; background: rgba(255,255,255,0.72); color: var(--text); font: inherit; font-weight: 950; }
      button { width: 100%; cursor: pointer; background: var(--blue); border: 0; color: var(--ink); box-shadow: none; }
      main { display: grid; min-height: calc(100svh - 88px); grid-template-columns: minmax(0, 0.9fr) minmax(320px, 1.1fr); gap: clamp(20px, 5vw, 62px); align-items: center; padding: 28px 0 70px; }
      .eyebrow { color: var(--cyan); font-size: 12px; font-weight: 950; letter-spacing: 0.2em; text-transform: uppercase; }
      h1 { margin: 18px 0; max-width: 9ch; font-size: clamp(62px, 11vw, 126px); line-height: 0.78; letter-spacing: -0.1em; }
      p { margin: 0; max-width: 34rem; color: var(--muted); font-size: clamp(19px, 2.5vw, 27px); line-height: 1.35; letter-spacing: -0.025em; }
      .direct { display: grid; gap: 8px; margin-top: 18px; }
      .direct a { width: fit-content; color: var(--text); font-size: 18px; font-weight: 850; }
      .panel { border: 1px solid var(--line); border-radius: 28px; background: var(--panel); box-shadow: 0 24px 70px rgba(20,17,12,0.08); padding: clamp(18px, 4vw, 30px); }
      form { display: grid; gap: 13px; }
      label { display: grid; gap: 7px; color: var(--muted); font-size: 12px; font-weight: 950; letter-spacing: 0.14em; text-transform: uppercase; }
      input, textarea { width: 100%; border: 1px solid var(--line); border-radius: 17px; background: #fffdf8; color: var(--text); padding: 14px 15px; font: inherit; outline: none; }
      textarea { min-height: 132px; resize: vertical; }
      input:focus, textarea:focus { border-color: var(--blue); box-shadow: 0 0 0 4px rgba(36,88,255,0.12); }
      .hint { margin-top: 18px; display: flex; flex-wrap: wrap; gap: 8px; }
      .hint span { border: 1px solid rgba(100,239,255,0.18); border-radius: 999px; padding: 8px 10px; color: rgba(247,251,255,0.82); background: rgba(100,239,255,0.065); font-size: 12px; font-weight: 850; }
      .contact-foot { margin-top: 18px; border-top: 1px solid rgba(255,255,255,0.11); padding-top: 16px; }
      @media (max-width: 820px) {
        .wrap { width: min(100% - 28px, 1040px); }
        header { padding: 14px 0; }
        .mark { width: 40px; height: 40px; border-radius: 14px; }
        .btn, button { min-height: 46px; padding: 0 16px; }
        main { min-height: auto; grid-template-columns: 1fr; align-items: start; gap: 16px; padding: 12px 0 42px; }
        h1 { margin: 10px 0 8px; max-width: 9ch; font-size: clamp(52px, 16vw, 68px); line-height: 0.82; }
        p { font-size: 18px; line-height: 1.35; }
        .panel { border-radius: 24px; padding: 16px; }
        form { gap: 10px; }
        label { gap: 5px; font-size: 11px; }
        input, textarea { border-radius: 14px; padding: 11px 12px; }
        textarea { min-height: 88px; }
        .contact-foot { margin-top: 14px; padding-top: 12px; }
        .direct { margin-top: 0; gap: 6px; }
        .direct a { font-size: 15px; }
        .hint { margin-top: 10px; gap: 6px; }
        .hint span { padding: 7px 9px; font-size: 11px; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <a class="brand" href="/" aria-label="SUPERMEGA.dev home"><span class="mark"><img src="/favicon.svg?v=supermega-atelier-20260623" alt="" /></span><span>SUPERMEGA.dev</span></a>
        <a class="btn" href="/">Home</a>
      </header>
      <main>
        <section aria-label="Contact SUPERMEGA">
          <div class="eyebrow">Contact</div>
          <h1>Send something.</h1>
          <p data-contact-lead>One file, folder, screenshot, list, link, or question. I will reply with the first useful next step.</p>
        </section>
        <section class="panel" aria-label="Workflow contact form">
          <form action="/api/contact-submissions" data-sm-lead-form enctype="multipart/form-data" method="post">
            <input type="hidden" name="workflow" value="First useful output" />
            <input type="hidden" name="requested_package" value="First useful output" />
            <input type="hidden" name="data" value="Public contact page" />
            <input type="hidden" name="source_url" value="https://supermega.dev/contact/" />
            <input type="hidden" name="page_path" value="/contact/" />
            <input type="hidden" name="referrer" value="" />
            <input type="hidden" name="utm_source" value="" />
            <input type="hidden" name="utm_medium" value="" />
            <input type="hidden" name="utm_campaign" value="" />
            <input type="hidden" name="utm_content" value="" />
            <input type="hidden" name="utm_term" value="" />
            <label>Name<input autocomplete="name" name="name" required /></label>
            <label>Work email<input autocomplete="email" name="email" required type="email" /></label>
            <label>Phone / WhatsApp<input autocomplete="tel" name="phone" type="tel" /></label>
            <label>Company<input autocomplete="organization" name="company" required /></label>
            <label>Paste a link or describe it<textarea name="goal" placeholder="Example: sales list needs cleanup, invoices and photos for one issue, or weekly report from emails." required></textarea></label>
            <input autocomplete="off" name="website" style="display:none" tabindex="-1" />
            <button type="submit">Send to Swan</button>
          </form>
          <div class="contact-foot">
            <div class="direct">
              <a href="mailto:swanhtet@supermega.dev">swanhtet@supermega.dev</a>
              <a href="tel:+9595000721">+95 9 500 0721</a>
            </div>
          </div>
        </section>
      </main>
    </div>
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
        const packages = {
          'team-work': 'Team Work',
          'factory-work': 'Factory Work',
          'service-work': 'Service Work',
          'answer-brief': 'Custom Workflow App',
          'clean-list': 'Custom Workflow App',
          'workdesk': 'Custom Workflow App',
          'clear-brief': 'Custom Workflow App',
          'file-cleanup': 'Custom Workflow App',
          'work-screen': 'Custom Workflow App',
          'work-system': 'Team Work',
          'plant-system': 'Factory Work',
          'service-system': 'Service Work'
        };
        const selectedPackage = packages[search.get('tool') || search.get('package') || ''];
        if (selectedPackage) {
          set('workflow', selectedPackage);
          set('requested_package', selectedPackage);
        }
        const campaign = search.get('utm_campaign') || '';
        if (/umfcci-ai-20260511/i.test(campaign)) {
          const lead = document.querySelector('[data-contact-lead]');
          const goal = form.querySelector('[name="goal"]');
          if (lead) lead.textContent = 'Good meeting you. Send one useful source.';
          if (goal) goal.placeholder = 'Paste a link, describe the source, or ask the question.';
        } else if (selectedPackage) {
          const lead = document.querySelector('[data-contact-lead]');
          const goal = form.querySelector('[name="goal"]');
          if (lead) lead.textContent = selectedPackage + ': send one source to start.';
          if (goal) goal.placeholder = 'Paste a link, describe the source, or ask the question.';
        }
      }
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
      .product-ui.dark { background: radial-gradient(circle at top right, rgba(60,220,185,.22), transparent 32%), linear-gradient(135deg, #081522, #132033); color: #f8fbff; }
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
      :root[data-theme="dark"] .btn.primary, :root[data-theme="dark"] button { color: #fff; background: linear-gradient(135deg, #b1542f, #cc6e48); }
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
          <span class="brand-text"><strong>SUPERMEGA.dev</strong><small>Business apps for real work</small></span>
        </a>
        <nav class="nav" aria-label="Primary">
          <button class="btn secondary theme-toggle" type="button" aria-label="Toggle dark mode" onclick="var r=document.documentElement,n=r.getAttribute('data-theme')==='dark'?'light':'dark';r.setAttribute('data-theme',n);try{localStorage.setItem('sm-theme',n)}catch(e){}"></button>
          <a class="btn secondary optional-nav" href="/#products">What we build</a>
          <a class="btn secondary" href="/work/">Work</a>
          <a class="btn secondary" href="/demo/">Demos</a>
          <a class="btn secondary" href="/offers/">Pricing</a>
          <a class="btn primary" href="/contact/">Contact</a>
        </nav>
      </header>
      <script>(function(){if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;if(!('IntersectionObserver'in window))return;var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{rootMargin:'0px 0px -8% 0px',threshold:0.06});addEventListener('DOMContentLoaded',function(){document.querySelectorAll('.section').forEach(function(el){if(el.getBoundingClientRect().top>window.innerHeight*0.9){el.classList.add('reveal');io.observe(el);}});});})();</script>`

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
    <title>Custom business software, built for Myanmar | SUPERMEGA.dev</title>
    <meta name="description" content="Custom software at SaaS prices — AI-native builds from $600 for Myanmar shops, factories, and distributors. You own it. No per-seat fees. KBZPay, MMQR, offline-ready." />
    <meta name="theme-color" content="#f4efe6" />
    <link rel="canonical" href="https://supermega.dev/" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <link rel="manifest" href="/site.webmanifest?v=supermega-atelier-20260623" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SUPERMEGA.dev" />
    <meta property="og:title" content="Custom business software, built for Myanmar | SUPERMEGA.dev" />
    <meta property="og:description" content="Custom software at SaaS prices — AI-native, made for how you work, yours to keep. Builds from $600. KBZPay · MMQR · MY/EN · offline." />
    <meta property="og:url" content="https://supermega.dev/" />
    <meta property="og:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Custom business software, built for Myanmar | SUPERMEGA.dev" />
    <meta name="twitter:description" content="Custom software at SaaS prices. AI-native builds from $600. KBZPay · MMQR · MY/EN · offline." />
    <meta name="twitter:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"SUPERMEGA.dev","url":"https://supermega.dev/","logo":"https://supermega.dev/favicon.svg","description":"Custom business software at SaaS prices, AI-native, built for Myanmar SMBs and factories. POS, factory operations, dashboards, AI agents, and more.","email":"swanhtet@supermega.dev","telephone":"+95-9-500-0721","sameAs":["https://www.linkedin.com/in/theswanhtet"]}</script>
    <style>${unicornShellStyle}
      /* Homepage extras */
      .proof-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px,1fr)); margin-top: 44px; border: 1px solid var(--line); border-radius: 18px; overflow: hidden; }
      .proof-strip > div { padding: 18px 22px; border-right: 1px solid var(--line); }
      .proof-strip > div:last-child { border-right: 0; }
      :root[data-theme="dark"] .proof-strip > div { border-color: rgba(243,239,230,0.1); }
      .proof-strip strong { display: block; font-size: 22px; letter-spacing: -0.03em; }
      .proof-strip span { display: block; margin-top: 4px; color: var(--muted); font-size: 13px; line-height: 1.4; }
      .proof-strip a { color: inherit; text-decoration: none; }
      .proof-strip a:hover strong { color: var(--blue); }
      .uvp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap: 14px; margin-top: 24px; }
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
      @media (max-width: 880px) {
        .how-steps { grid-template-columns: 1fr 1fr; }
        .proof-strip { grid-template-columns: 1fr 1fr; }
        .proof-strip > div { border-right: 0; border-bottom: 1px solid var(--line); }
        .proof-strip > div:last-child { border-bottom: 0; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
${unicornHeader}
      <main>
        <section class="poster">
          <div class="copy">
            <div class="eyebrow">AI-native · Myanmar-built · Yours to keep</div>
            <h1>Custom software at SaaS prices.</h1>
            <p>We build the exact software your business needs — not a generic SaaS product built for someone else. AI-native, made for how you actually work, and yours forever. No per-seat tax that grows when you hire.</p>
            <div class="cta">
              <a class="btn primary" href="/offers/">See pricing</a>
              <a class="btn secondary" href="/demo/">See live demos</a>
              <a class="btn secondary" href="/contact/">Talk to us</a>
            </div>
          </div>
          <aside class="product-stage" aria-label="DeskPOS live product — point-of-sale for Myanmar shops">
            <img class="hero-img" src="/site/shots/live-product-restaurant-pos-menu-inventory.png?v=${publicShotVersion}" alt="DeskPOS — point of sale, KBZPay, MMQR, daily close" loading="eager" decoding="async" />
            <div class="proof-line" aria-label="What the software does">
              <div class="proof"><b>Live</b><span>pos.supermega.dev</span></div>
              <div class="proof"><b>Payment</b><span>KBZPay · MMQR · cash</span></div>
              <div class="proof"><b>Works</b><span>Offline-ready</span></div>
            </div>
          </aside>
        </section>

        <div class="proof-strip section">
          <a href="https://pos.supermega.dev/" target="_blank" rel="noopener noreferrer"><div><strong>Live now</strong><span>Try DeskPOS free — no signup</span></div></a>
          <div><strong>From $600</strong><span>Paid once — not a subscription</span></div>
          <div><strong>You own it</strong><span>No per-seat fees, ever</span></div>
          <div><strong>Offline-ready</strong><span>Keeps working when the internet drops</span></div>
        </div>

        <section class="section product-library" id="products">
          <div class="product-library-head">
            <h2>What we build</h2>
          </div>
          <p style="max-width:48rem;color:var(--muted);margin:-4px 0 2px;line-height:1.55">We're a custom studio — no fixed catalog. DeskPOS is live to try right now; the rest are the kinds of systems we build to fit how you actually work.</p>
          <div class="outputs">
            <article class="output" id="build-app-from-workflow">
              <div class="output-copy">
                <h3>Document Extraction Ledger</h3>
                <p>Emails, chat photos, and scanned forms become one clean, reviewable record — with owners, statuses, and a source link on every row.</p>
                <div class="feature-pills"><span>Intake</span><span>Queue</span><span>Proof</span></div>
                <div class="cta"><a class="btn primary" href="/products/documents/">See details</a><a class="btn secondary" href="${productRequestLinks.workflow}">Contact</a></div>
              </div>
              ${workflowProductMedia}
            </article>
            <article class="output" id="factory-issues-maintenance-quality">
              <div class="output-copy">
                <h3>Factory Operations App</h3>
                <p>Production, quality inspections, defect tracking, CAPA, and maintenance work orders — one system for the floor, the QC manager, and the CEO brief.</p>
                <div class="feature-pills"><span>Production</span><span>Quality</span><span>CAPA</span></div>
                <div class="cta"><a class="btn primary" href="/products/factory/">See details</a><a class="btn secondary" href="${productRequestLinks.factory}">Contact</a></div>
              </div>
              ${factoryProductMedia}
            </article>
            <article class="output" id="restaurant-pos-menu-inventory">
              <div class="output-copy">
                <h3>DeskPOS — Point of Sale</h3>
                <p>Ring up orders, take KBZPay / AYA Pay / MMQR / cash, track stock, and close the day with a cash-up the owner can trust. Works offline.</p>
                <div class="feature-pills"><span>Orders</span><span>Payments</span><span>Daily close</span></div>
                <div class="cta"><a class="btn primary" href="/products/pos/">See details</a><a class="btn secondary" href="https://pos.supermega.dev/" target="_blank" rel="noopener">Try it live ↗</a></div>
              </div>
              ${restaurantProductMedia}
            </article>
            <article class="output" id="back-office-ai-desk">
              <div class="output-copy">
                <h3>Back Office AI Desk</h3>
                <p>An AI helper scoped to one recurring job — daily close audit, reorder watch, or supplier follow-up. It drafts; you approve. Nothing acts on its own.</p>
                <div class="feature-pills"><span>Draft</span><span>Approve</span><span>Log</span></div>
                <div class="cta"><a class="btn primary" href="/products/back-office/">See details</a><a class="btn secondary" href="${productRequestLinks.agentops}">Contact</a></div>
              </div>
              ${agentOpsProductMedia}
            </article>
          </div>
        </section>

        <section class="section">
          <h2>Why custom beats SaaS</h2>
          <div class="uvp-grid">
            <div class="uvp-card"><strong>You own it.</strong><span>No per-seat tax that grows when you hire. No vendor that can switch it off. The software is yours to keep.</span></div>
            <div class="uvp-card"><strong>The exact thing.</strong><span>Built around how you actually work — not the average workflow some other company built a template for.</span></div>
            <div class="uvp-card"><strong>AI-native.</strong><span>AI is the substrate: every build can read messy real inputs, draft the next step, and explain itself. Not a chatbot bolted on.</span></div>
            <div class="uvp-card"><strong>Built for Myanmar.</strong><span>MMK, KBZPay / MMQR, MY/EN bilingual, works when the power and the internet don't. Made here, for here.</span></div>
          </div>
        </section>

        <section class="section">
          <h2>How it works</h2>
          <div class="how-steps">
            <div class="how-step"><n>1</n><strong>Scope</strong><span>One short call. We agree exactly what ships and what is out of scope — fixed, no open-ended hours.</span></div>
            <div class="how-step"><n>2</n><strong>Deposit</strong><span>50% to start — KBZPay, MMQR, cash, or card. Keeps both sides honest.</span></div>
            <div class="how-step"><n>3</n><strong>Ship</strong><span>We build it and hand you a running thing at a live URL. Not a folder of files.</span></div>
            <div class="how-step"><n>4</n><strong>Care</strong><span>Optional monthly plan keeps it running and improving. Or take it and go.</span></div>
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
        <span>SUPERMEGA.dev — custom business software at SaaS prices.</span>
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
    <meta name="description" content="SUPERMEGA.dev products for Myanmar shops, factories, and restaurants: DeskPOS (KBZPay/MMQR, offline), Factory Operations, the Document Extraction Ledger, and the Back Office Workflow Desk — built from real work." />
    <meta name="theme-color" content="#f4efe6" />
    <link rel="canonical" href="https://supermega.dev/products/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SUPERMEGA.dev" />
    <meta property="og:title" content="SUPERMEGA.dev products — software for Myanmar shops, factories, and restaurants" />
    <meta property="og:description" content="DeskPOS, Factory Operations, the Document Extraction Ledger, and the Back Office Workflow Desk — built from real work." />
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
      @media (max-width: 980px) {
        .shell { grid-template-columns: 1fr; }
        .shell-grid, .setup, .tool-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .market-card { grid-template-columns: 1fr; }
      }
      @media (max-width: 880px) {
        .feature { grid-template-columns: 1fr; border-radius: 26px; }
        .feature img { border-left: 0; border-top: 1px solid var(--line); min-height: auto; aspect-ratio: 16 / 10; }
      }
      @media (max-width: 620px) {
        .shell-grid, .setup, .tool-grid { grid-template-columns: 1fr; }
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
            <h1>Systems we build, shaped to your work.</h1>
            <p>We're a custom studio — there's no fixed catalog. DeskPOS is live to try right now; everything else we build to fit how you actually work. Tell us the one thing to fix first.</p>
            <div class="cta">
              <a class="btn primary" href="/offers/">See pricing</a>
              <a class="btn secondary" href="/demo/">See live demos</a>
              <a class="btn secondary" href="/contact/">Talk to us</a>
            </div>
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
              <div class="chips"><span class="chip">Source capture</span><span class="chip">Source intake</span><span class="chip">Work queue</span><span class="chip">Owner review</span><span class="chip">Proof pack</span></div>
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

          <article class="feature" id="back-office-ai-desk">
            <div class="feature-copy">
              <div class="eyebrow">Back office and admin</div>
              <h2>Back Office AI Desk.</h2>
              <p>A scoped AI helper for one recurring job — daily close audit, reorder watch, or supplier follow-up. It drafts; you approve. Nothing acts on its own.</p>
              <div class="chips"><span class="chip">Draft</span><span class="chip">Approve</span><span class="chip">Run ledger</span><span class="chip">Weekly report</span></div>
              <div class="use"><strong>First result</strong><span>Each day it reads your source, drafts findings ranked by money at risk, and holds them for your approval.</span></div>
              <a class="btn primary" href="/products/back-office/">See details</a>
            </div>
            <div class="shot-gallery" aria-label="Back Office AI Desk product screenshot">
              <img src="/site/shots/live-demo-agent-builder.png?v=${publicShotVersion}" alt="Back Office AI Desk — draft-and-approve queue" loading="lazy" decoding="async" />
            </div>
          </article>
        </section>


        <section class="section">
          <div class="final">
            <div>
              <div class="eyebrow">Start small</div>
              <h2>Tell us the one thing to fix first.</h2>
              <p>We reply with what we'd build first, the price, and the timeline. Fixed scope, 50% deposit by KBZPay or MMQR to start.</p>
            </div>
            <div style="display:flex;gap:12px;flex-wrap:wrap"><a class="btn primary" href="/contact/?package=build">Book a build</a><a class="btn secondary" href="/offers/">See pricing</a></div>
          </div>
        </section>
      </main>
      <footer>
        <span>Start with one useful app. Expand only after proof.</span>
        <span class="footer-links">
          <a href="mailto:swanhtet@supermega.dev">swanhtet@supermega.dev</a>
          <a href="tel:+9595000721">+95 9 500 0721</a>
          <a href="https://www.linkedin.com/in/theswanhtet" rel="noreferrer" target="_blank">LinkedIn</a>
        </span>
      </footer>
    </div>
${publicLanguageToggleScript}
  </body>
</html>`

const publicProductsShowcaseHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Products | SUPERMEGA.dev</title>
    <meta name="description" content="Concrete SUPERMEGA product screens: Custom Workflow App, Factory Operations App, and Restaurant POS + Inventory." />
    <meta name="theme-color" content="#f4efe6" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>${unicornShellStyle}
      main { padding-bottom: 72px; }
      .poster { min-height: auto; align-items: end; padding-top: 34px; }
      .poster h1 { max-width: 10.2ch; }
      .poster p { max-width: 40rem; }
      .product-stage .browser > img { object-fit: contain; object-position: center; }
      .gallery { display: grid; gap: 18px; }
      .feature { display: grid; grid-template-columns: minmax(0, 0.72fr) minmax(320px, 1.28fr); gap: 0; overflow: hidden; border: 1px solid rgba(255,255,255,0.74); border-radius: 36px; background: rgba(255,255,255,0.60); box-shadow: var(--shadow); backdrop-filter: blur(22px); }
      .feature-copy { display: grid; align-content: start; gap: 14px; padding: clamp(24px, 4vw, 44px); }
      .feature-copy p { font-size: 17px; }
      .feature-copy h2 { max-width: 17ch; font-size: clamp(34px, 4vw, 56px); line-height: .98; letter-spacing: 0; }
      .feature > img { display: block; width: 100%; height: auto; min-height: 0; object-fit: contain; object-position: center; border-left: 1px solid var(--line); background: #f8f4ec; }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
      .chip { border: 1px solid var(--line); border-radius: 999px; padding: 8px 10px; background: rgba(255,255,255,0.64); color: var(--muted); font-size: 12px; font-weight: 900; }
      .screen-gallery { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 4px 0; }
      .mini-screen { display: grid; gap: 7px; min-height: 112px; border: 1px solid var(--line); border-radius: 16px; background: rgba(255,255,255,.68); padding: 11px; }
      .mini-screen small { color: var(--blue); font-size: 9px; font-weight: 950; letter-spacing: .14em; text-transform: uppercase; }
      .mini-screen strong { color: var(--ink); font-size: 15px; line-height: 1; letter-spacing: -.04em; }
      .mini-screen span { color: var(--muted); font-size: 11px; font-weight: 780; line-height: 1.25; }
      .use { display: grid; gap: 10px; border-top: 1px solid var(--line); padding-top: 14px; }
      .use span { color: var(--muted); font-weight: 760; line-height: 1.42; }
      .screen-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .screen-actions .btn { margin-top: 0; }
      .benchmark-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 18px; }
      .benchmark-card { border: 1px solid var(--line); border-radius: 24px; padding: 18px; background: rgba(255,255,255,0.58); box-shadow: 0 18px 54px rgba(13,17,23,0.08); }
      .benchmark-card small { display: block; color: var(--blue); font-size: 10px; font-weight: 950; letter-spacing: 0.14em; text-transform: uppercase; }
      .benchmark-card h3 { margin: 8px 0 12px; color: var(--ink); font-size: 22px; letter-spacing: -0.05em; line-height: 1; }
      .benchmark-card p { margin: 9px 0 0; color: var(--muted); font-size: 13px; font-weight: 800; line-height: 1.38; }
      .benchmark-card strong { color: var(--ink); }
      .shot-gallery { display: grid; align-content: center; padding: 14px; background: linear-gradient(135deg, rgba(255,255,255,.78), rgba(229,242,255,.58)); border-left: 1px solid var(--line); }
      .feature .product-shot-gallery { align-content: stretch; border-left: 1px solid var(--line); }
      .product-media-stack { gap: 12px; }
      .product-media-stack .product-shot-gallery { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 0; border-left: 0; background: transparent; }
      .product-media-stack .product-shot-card:first-child { grid-column: 1 / -1; grid-row: auto; }
      .product-media-stack .product-shot-card img { aspect-ratio: 48 / 35; height: auto; min-height: 0; object-fit: contain; object-position: center; background: #fffaf0; }
      .product-media-stack .product-shot-card:first-child img { aspect-ratio: 48 / 35; height: auto; min-height: 0; object-fit: contain; object-position: center; }
      .browser .product-shot-gallery { border-left: 0; }
      .shot-gallery .product-ui { width: 100%; height: auto; min-height: 0; aspect-ratio: auto; border: 1px solid rgba(13,17,23,.08); border-radius: 26px; box-shadow: 0 18px 42px rgba(13,17,23,.10); }
      .shot-gallery .app-frame { height: auto; }
      .shot-gallery > .product-ui .app-body { grid-template-columns: minmax(0, 1.36fr) minmax(138px, .64fr); align-items: start; }
      .shot-gallery > .product-ui .app-side { grid-template-columns: 1fr; }
      .shot-gallery > .product-ui .app-card h4 { font-size: 19px; }
      .product-shot-card .app-card h4 { font-size: 13px; line-height: 1.05; letter-spacing: 0; }
      @media (max-width: 980px) {
        .feature { grid-template-columns: 1fr; border-radius: 26px; }
        .feature .product-ui { border-left: 0; border-top: 1px solid var(--line); min-height: auto; }
        .screen-gallery { grid-template-columns: 1fr; }
        .shot-gallery { grid-template-columns: 1fr; border-left: 0; border-top: 1px solid var(--line); }
        .product-media-stack .product-shot-gallery { grid-template-columns: 1fr; }
        .benchmark-grid { grid-template-columns: 1fr; }
        .shot-gallery .app-body { grid-template-columns: 1fr; }
        .shot-gallery .app-side { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 880px) {
        .poster { padding-top: 18px; }
        .shot-gallery .product-ui { aspect-ratio: auto; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
${unicornHeader}
      <main>
        <section class="poster">
          <div class="copy">
            <div class="eyebrow">Products</div>
            <h1>Pick one app to start.</h1>
            <p>Send the current source. We map the first screen, modules, owner action, and approval boundary.</p>
            <p>Each gallery shows the actual product modules: overview, action queue, and feature screens.</p>
            <div class="cta">
              <a class="btn primary" href="/contact/?package=back-office-workflow-desk">Request app map</a>
              <a class="btn secondary" href="/contact/?source=products">Send a source</a>
            </div>
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
              <div class="eyebrow">Custom Workflow App</div>
              <h2>Custom Workflow App.</h2>
              <p>Requests, files, proof, and next action for repeated work stuck in email, Drive, sheets, screenshots, and chat.</p>
              <div class="chips"><span class="chip">Source capture</span><span class="chip">Source intake</span><span class="chip">Work queue</span><span class="chip">Owner review</span><span class="chip">Proof pack</span></div>
              <div class="screen-gallery" aria-label="Custom Workflow App feature modules">
                <div class="mini-screen"><small>Workflow control</small><strong>Overview</strong><span>Source, owner, evidence, status, and next action.</span></div>
                <div class="mini-screen"><small>Queue action</small><strong>Work queue</strong><span>Customer requests, supplier updates, and manager reports.</span></div>
                <div class="mini-screen"><small>Proof modules</small><strong>Intake and review</strong><span>Email, files, approvals, exports, and proof pack.</span></div>
              </div>
              <div class="use"><strong>What it includes</strong><span>Source intake, work queue, owner review, approvals, exports, and proof pack.</span></div>
              <div class="screen-actions"><a class="btn primary" href="/contact/?package=back-office-workflow-desk">Request app map</a><a class="btn secondary" href="/contact/?source=custom-workflow-product" aria-label="Send source for this Custom Workflow App">Send source</a></div>
            </div>
            ${workflowProductMedia}
          </article>

          <article class="feature" id="factory-issues-maintenance-quality">
            <div class="feature-copy">
              <div class="eyebrow">Factory Operations App</div>
              <h2>Factory Operations App.</h2>
              <p>Issues, assets, readings, and manager actions for QC, maintenance, receiving, and evidence in one operating screen.</p>
              <div class="chips"><span class="chip">WCM board</span><span class="chip">ISO evidence</span><span class="chip">CAPA / 5W1H</span><span class="chip">Maintenance</span></div>
              <div class="screen-gallery" aria-label="Factory Operations App feature modules">
                <div class="mini-screen"><small>Factory evidence</small><strong>Overview</strong><span>WCM, ISO, quality, maintenance, receiving, assets, and readings.</span></div>
                <div class="mini-screen"><small>Asset action</small><strong>Asset map</strong><span>Machine, meter, vehicle, room, or line becomes a controlled lane.</span></div>
                <div class="mini-screen"><small>Manager module</small><strong>Manager actions</strong><span>Anomalies, source packets, review, and closeout.</span></div>
              </div>
              <div class="use"><strong>What it includes</strong><span>Asset map, WCM board, ISO evidence, NCR/CAPA review, maintenance, and manager closeout.</span></div>
              <div class="screen-actions"><a class="btn primary" href="/contact/?package=factory-issues-maintenance-quality">Request app map</a><a class="btn secondary" href="/contact/?source=factory-operations-product" aria-label="Send source for this Factory Operations App setup">Send source</a></div>
            </div>
            ${factoryProductMedia}
          </article>

          <article class="feature" id="restaurant-pos-menu-inventory">
            <div class="feature-copy">
              <div class="eyebrow">Restaurant POS + Inventory</div>
              <h2>Restaurant POS + Inventory.</h2>
              <p>Orders, payment proof, stock, and daily close for shops and restaurants before a larger ERP.</p>
              <div class="chips"><span class="chip">Menu and QR</span><span class="chip">Orders</span><span class="chip">Payment proof</span><span class="chip">Daily close</span></div>
              <div class="screen-gallery" aria-label="Restaurant POS and Inventory feature modules">
                <div class="mini-screen"><small>Restaurant close</small><strong>Overview</strong><span>Orders, payment proof, stock risk, cash-up, and branch context.</span></div>
                <div class="mini-screen"><small>Shift action</small><strong>Shift and stock</strong><span>Prep, waste, stock notes, and handover issues.</span></div>
                <div class="mini-screen"><small>Menu module</small><strong>Menu and QR</strong><span>Item updates, QR menu work, and owner approval.</span></div>
              </div>
              <div class="use"><strong>What it includes</strong><span>Menu and QR, orders, payment proof, stock notes, shift close, and owner report.</span></div>
              <div class="screen-actions"><a class="btn primary" href="/contact/?package=restaurant-pos-menu-inventory">Request app map</a><a class="btn secondary" href="/contact/?source=restaurant-pos-product" aria-label="Send source for this Restaurant POS and Inventory setup">Send source</a></div>
            </div>
            ${restaurantProductMedia}
          </article>
        </section>

        <section class="section" aria-label="Setup path">
          <div class="eyebrow">Setup</div>
          <h2>First reply: app map.</h2>
          <div class="benchmark-grid">
            <article class="benchmark-card"><small>01</small><h3>Send one source</h3><p>A file, screenshot, sheet, export, menu, payment proof, issue log, device note, or repeated task is enough to start.</p><p><strong>Gate:</strong> No account, connector, automation, or data write before approval.</p></article>
            <article class="benchmark-card"><small>02</small><h3>Approve the app map</h3><p>We reply with product path, first screen, source map, missing fields, and safety boundary.</p><p><strong>Gate:</strong> You approve product path, owner, data boundary, and first acceptance test.</p></article>
            <article class="benchmark-card"><small>03</small><h3>Use the approved app</h3><p>Approved clients get the first usable app, role setup, source register, proof pack, and next-module checklist.</p><p><strong>Gate:</strong> External sends, record writes, ERP updates, and automation stay review-gated.</p></article>
          </div>
        </section>

        <section class="section">
          <div class="final">
            <div>
              <div class="eyebrow">Start small</div>
              <h2>Send one source.</h2>
              <p>The first reply is simple: what screen to build, what source to connect, and what result your team should see first.</p>
            </div>
            <a class="btn primary" href="/contact/?source=products-bottom">Contact</a>
          </div>
        </section>
      </main>
    </div>
${publicLanguageToggleScript}
  </body>
</html>`

const publicAiWorkflowDeskHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
<title>Custom Workflow App | SUPERMEGA.dev</title>
    <meta name="description" content="Replace one messy workflow with a source-backed work queue, reviewed actions, approval gates, and proof pack." />
    <meta name="theme-color" content="#f4efe6" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>${unicornShellStyle}
      .desk-hero { display: grid; grid-template-columns: minmax(0, 0.82fr) minmax(320px, 1.18fr); gap: clamp(24px, 6vw, 72px); align-items: end; padding: clamp(42px, 8vw, 92px) 0 38px; }
      .desk-hero h1 { max-width: 9ch; }
      .desk-hero p { max-width: 680px; }
      .desk-shot { overflow: hidden; border: 1px solid rgba(255,255,255,0.74); border-radius: 34px; background: rgba(255,255,255,0.62); box-shadow: var(--shadow); }
      .desk-shot .product-ui { width: 100%; min-height: 410px; }
      .desk-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin: 20px 0 48px; }
      .desk-card { border: 1px solid rgba(255,255,255,0.72); border-radius: 24px; padding: 18px; background: rgba(255,255,255,0.58); box-shadow: 0 18px 54px rgba(13,17,23,0.08); }
      .desk-card small { color: var(--blue); font-weight: 950; letter-spacing: 0.15em; text-transform: uppercase; }
      .desk-card strong { display: block; margin: 9px 0; font-size: 20px; letter-spacing: -0.04em; }
      .desk-card span { display: block; color: var(--muted); font-weight: 800; line-height: 1.42; }
      .desk-band { display: grid; grid-template-columns: minmax(0, 0.75fr) minmax(320px, 1.25fr); gap: 16px; align-items: stretch; margin-bottom: 72px; }
      .desk-panel { border: 1px solid rgba(255,255,255,0.72); border-radius: 28px; padding: clamp(20px, 3vw, 30px); background: rgba(255,255,255,0.58); box-shadow: 0 18px 54px rgba(13,17,23,0.08); }
      .desk-list { display: grid; gap: 10px; }
      .desk-list div { border: 1px solid var(--line); border-radius: 18px; padding: 14px; background: rgba(255,255,255,0.64); color: var(--muted); font-weight: 850; line-height: 1.42; }
      @media (max-width: 980px) {
        .desk-hero, .desk-band { grid-template-columns: 1fr; }
        .desk-grid { grid-template-columns: 1fr; }
        .desk-shot .product-ui { min-height: auto; aspect-ratio: 16 / 10; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
${unicornHeader}
      <main>
        <section class="desk-hero">
          <div>
            <div class="eyebrow">Flagship offer</div>
<h1>Custom Workflow App</h1>
            <p>Replace one messy workflow with a source-backed work queue, prepared actions, human approval, and a proof pack.</p>
            <div class="cta">
<a class="btn primary" href="/contact/?package=back-office-workflow-desk">Get app map</a>
          <a class="btn" href="/contact/?package=back-office-workflow-desk">Send source</a>
            </div>
          </div>
          <aside class="desk-shot">
${workflowProductUi}
          </aside>
        </section>
<section class="desk-grid" aria-label="Custom Workflow App modules">
          <article class="desk-card"><small>01</small><strong>Source Register</strong><span>Files, sheets, emails, exports, screenshots, and browser steps stay tied to the work.</span></article>
          <article class="desk-card"><small>02</small><strong>Work Queue</strong><span>Prepared work is visible with owner, risk, evidence, and next action.</span></article>
          <article class="desk-card"><small>03</small><strong>Step Checklist</strong><span>Repeatable web or admin steps are staged as reviewed checklists before writeback.</span></article>
          <article class="desk-card"><small>04</small><strong>Approval Gate</strong><span>External sends, billing, client claims, and record writes wait for a person.</span></article>
          <article class="desk-card"><small>05</small><strong>Evidence Pack</strong><span>Before and after proof, tests, screenshots, source links, and ROI notes stay attached.</span></article>
        </section>
        <section class="desk-band">
          <article class="desk-panel">
            <div class="eyebrow">Client sends</div>
            <h2>One painful workflow.</h2>
            <p>The buyer does not choose tools. They send the workflow, source samples, current screenshots, approval owner, and what done looks like.</p>
          </article>
          <article class="desk-panel">
            <div class="desk-list">
              <div>Intake scopes the workflow and missing-source checklist.</div>
              <div>Source cleanup normalizes records with provenance and confidence.</div>
              <div>Workflow design creates the smallest usable desk.</div>
              <div>Step review stages repeatable web actions for approval.</div>
              <div>QA writes the proof pack before client handoff.</div>
            </div>
          </article>
        </section>
      </main>
    </div>
${publicLanguageToggleScript}
  </body>
</html>`

const unicornAboutHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex,follow" />
    <meta http-equiv="refresh" content="0; url=/#products" />
    <title>Products | SUPERMEGA.dev</title>
    <meta name="description" content="SUPERMEGA.dev product screens." />
    <link rel="canonical" href="https://supermega.dev/" />
    <meta name="theme-color" content="#f4efe6" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>${unicornShellStyle}
      main { min-height: 70vh; display: grid; place-items: center; text-align: center; }
      .redirect-card { max-width: 560px; border: 1px solid rgba(255,255,255,0.78); border-radius: 34px; padding: clamp(24px, 5vw, 44px); background: rgba(255,255,255,0.68); box-shadow: var(--shadow); }
      .redirect-card h1 { font-size: clamp(44px, 8vw, 88px); }
    </style>
    <script>location.replace('/#products')</script>
  </head>
  <body>
    <div class="wrap">
${unicornHeader}
      <main>
        <section class="redirect-card">
          <h1>Opening products.</h1>
          <p>This page moved to the product section.</p>
          <a class="btn primary" href="/#products">Open products</a>
        </section>
      </main>
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
        .optional-phone, .optional-mobile { display: none; }
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
            <div class="form-row">
              <label>Name<input autocomplete="name" name="name" required /></label>
              <label>Work email<input autocomplete="email" name="email" required type="email" /></label>
              <label class="optional-phone">Phone / WhatsApp<input autocomplete="tel" name="phone" type="tel" /></label>
              <label>Company<input autocomplete="organization" name="company" required /></label>
              <div class="wide selected-path" data-selected-path hidden><small>Selected</small><strong>General enquiry</strong><span class="selected-price" data-selected-price hidden></span><span class="selected-next" data-selected-next hidden></span></div>
              <label class="wide file-label">Upload files<input data-file-picker multiple name="source_files" type="file" /><span class="upload-list" data-upload-list></span></label>
              <label class="wide">Source link or system<input name="source_links" placeholder="Drive folder, sheet, email thread, POS export, meter reading, device, or note" /></label>
              <label class="wide">What should become clear?<textarea name="goal" placeholder="Example: what changed, who owns it, what is missing, and what should happen next." required></textarea></label>
            </div>
            <input autocomplete="off" name="website" style="display:none" tabindex="-1" />
            <button type="submit">Send request</button>
            <p class="policy">No account or data connection before you approve the first step.</p>
            <p class="form-status" data-lead-status aria-live="polite"></p>
            <div class="next-card" data-next-card hidden><strong>Saved</strong><span>We review the workflow and reply with the first app to build. Nothing changes without approval.</span></div>
          </form>
        </section>
      </main>
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
            price: 'From $600',
            lead: 'Tool in a week — from $600. Tell us the one job to build.',
            placeholder: 'Describe the single sharp tool you need and the job it does.',
            next: 'Next: a short scope call, then 50% deposit to start.'
          },
          'dashboard': {
            name: 'Custom dashboard',
            heading: 'Tell us what to build.',
            price: 'From $1,500',
            lead: 'Custom dashboard — from $1,500. What should it show?',
            placeholder: 'Describe the numbers and sources it should pull together, and who reads it.',
            next: 'Next: a short scope call, then 50% deposit to start.'
          },
          'ai-agent': {
            name: 'AI agent / automation',
            heading: 'Tell us what to build.',
            price: 'From $2,500',
            lead: 'AI agent — from $2,500. What recurring job should it do?',
            placeholder: 'Describe the recurring task, the inputs it reads, and what must stay approval-only.',
            next: 'Next: a short scope call, then 50% deposit to start.'
          },
          'design-ship': {
            name: 'Design + ship system',
            heading: 'Tell us what to build.',
            price: 'From $6,000',
            lead: 'Design + ship system — from $6,000. What do you want built?',
            placeholder: 'Describe the system you want — what it does, who uses it, and what it replaces.',
            next: 'Next: a short scope call, then 50% deposit to start.'
          },
          'care-plan': {
            name: 'Care plan',
            heading: 'Keep it running.',
            price: 'From $300/mo',
            lead: 'Care plan — from $300/mo. What should we keep running?',
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
        const requestedPackage = search.get('tool') || search.get('package') || '';
        const selectedPackage = packages[packageAliases[requestedPackage] || requestedPackage || ''];
        if (selectedPackage) {
          set('workflow', selectedPackage.name);
          set('requested_package', selectedPackage.name);
          set('first_output', selectedPackage.name);
          set('product_area', selectedPackage.name);
          set('first_step', 'Review the source and reply with the first useful app.');
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

const activationProductsHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>SUPERMEGA.dev | Product Activation</title>
    <meta name="description" content="Three SUPERMEGA product packages with setup inputs, acceptance tests, blockers, and approval boundaries." />
    <meta name="theme-color" content="#f7f8fb" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>
      :root { color-scheme: light; --bg:#f7f8fb; --panel:#ffffff; --panel-2:#f1f4f8; --line:#dbe2ea; --ink:#111827; --muted:#667085; --blue:#145cff; --green:#147a52; --amber:#9a5b00; --red:#b42318; }
      * { box-sizing: border-box; }
      html, body { height: 100%; }
      body { margin: 0; height: 100svh; overflow: hidden; color: var(--ink); background: var(--bg); font-family: "Aptos", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
      a { color: inherit; text-decoration: none; }
      .shell { height: 100svh; display: grid; grid-template-rows: auto minmax(0, 1fr); width: min(1440px, 100%); margin: 0 auto; padding: 0 clamp(12px, 2vw, 24px); }
      header { min-height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 14px; border-bottom: 1px solid var(--line); }
      .brand { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 950; letter-spacing: -0.02em; }
      .mark { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--ink); color: #fff; }
      .mark img { width: 100%; height: 100%; display: block; border-radius: inherit; }
      nav { display: flex; align-items: center; gap: 8px; }
      .btn { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; border: 1px solid var(--line); border-radius: 999px; padding: 9px 14px; background: #fff; color: var(--ink); font-size: 13px; font-weight: 900; white-space: nowrap; }
      .btn.primary { border-color: var(--blue); background: var(--blue); color: #fff; }
      main { min-height: 0; display: grid; grid-template-columns: minmax(280px, 0.72fr) minmax(0, 1.28fr); gap: clamp(12px, 2vw, 22px); padding: clamp(12px, 2vw, 24px) 0; overflow: hidden; }
      .brief { min-height: 0; display: grid; align-content: center; gap: 16px; }
      .eyebrow, .label { color: var(--blue); font-size: 11px; font-weight: 950; letter-spacing: 0.13em; text-transform: uppercase; }
      h1 { margin: 0; max-width: 11ch; font-size: clamp(44px, 6.4vw, 88px); line-height: 0.88; letter-spacing: 0; }
      .brief p { margin: 0; max-width: 35rem; color: var(--muted); font-size: clamp(16px, 1.6vw, 20px); line-height: 1.38; font-weight: 760; }
      .status-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 4px; }
      .status-card { min-width: 0; border: 1px solid var(--line); border-radius: 14px; padding: 12px; background: var(--panel); }
      .status-card strong { display: block; margin-top: 6px; font-size: 15px; letter-spacing: -0.02em; }
      .products { min-height: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; overflow: hidden; }
      .product-card { min-height: 0; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; gap: 10px; border: 1px solid var(--line); border-radius: 18px; padding: 12px; background: var(--panel); box-shadow: 0 18px 48px rgba(17, 24, 39, 0.07); overflow: hidden; }
      .product-card img { width: 100%; aspect-ratio: 16 / 8.6; object-fit: cover; object-position: top left; border: 1px solid var(--line); border-radius: 12px; background: var(--panel-2); }
      .card-head { display: grid; gap: 7px; }
      .card-head h2 { margin: 0; font-size: clamp(22px, 2.3vw, 32px); line-height: 0.96; letter-spacing: 0; }
      .card-head p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.34; font-weight: 760; }
      .detail-stack { min-height: 0; display: grid; gap: 7px; overflow: auto; padding-right: 2px; scrollbar-width: thin; }
      .detail { border: 1px solid var(--line); border-radius: 12px; padding: 10px; background: var(--panel-2); }
      .detail strong { display: block; margin: 4px 0 0; font-size: 13px; line-height: 1.25; }
      .detail span { display: block; margin-top: 3px; color: var(--muted); font-size: 12px; line-height: 1.32; font-weight: 760; }
      .detail.acceptance { border-color: rgba(20,122,82,0.28); background: rgba(20,122,82,0.07); }
      .detail.blockers { border-color: rgba(180,35,24,0.24); background: rgba(180,35,24,0.06); }
      .actions { display: grid; gap: 8px; }
      .actions .btn { width: 100%; }
      .footnote { color: var(--muted); font-size: 12px; font-weight: 820; line-height: 1.3; }
      @media (max-width: 980px) {
        .shell { padding: 0 10px; }
        header { min-height: 54px; }
        nav .btn:not(.primary) { display: none; }
        main { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); gap: 10px; padding: 10px 0; }
        .brief { align-content: start; gap: 9px; }
        h1 { max-width: none; font-size: clamp(34px, 10vw, 46px); line-height: 0.92; }
        .brief p { font-size: 13px; line-height: 1.26; }
        .status-grid { grid-template-columns: repeat(3, minmax(120px, 1fr)); overflow-x: auto; padding-bottom: 2px; }
        .status-card { padding: 9px; }
        .status-card strong { font-size: 12px; }
        .products { display: flex; gap: 10px; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scroll-snap-type: x mandatory; padding-bottom: 4px; }
        .product-card { flex: 0 0 min(326px, calc(100vw - 28px)); scroll-snap-align: start; border-radius: 16px; padding: 10px; }
        .product-card img { aspect-ratio: 16 / 7.2; }
        .card-head h2 { font-size: 22px; }
        .card-head p, .detail span, .footnote { font-size: 11px; }
        .detail { padding: 8px; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header>
        <a class="brand" href="/" aria-label="SUPERMEGA.dev home">${signalMarkHtml}<span>SUPERMEGA.dev</span></a>
        <nav aria-label="Primary">
          <a class="btn" href="/products/">Products</a>
          <a class="btn" href="/machine/">Sales machine</a>
          <a class="btn primary" href="/contact/">Send source</a>
        </nav>
      </header>
      <main id="products" aria-label="SUPERMEGA product activation">
        <section class="brief">
          <div class="eyebrow">Product activation</div>
          <h1>Three products. One setup contract.</h1>
          <p>Choose the product, send the current source, and approve the first acceptance test. We sell the smallest useful app first, then expand only after proof.</p>
          <div class="status-grid" aria-label="Activation status">
            <div class="status-card"><span class="label">Sell status</span><strong>Quote-ready setup</strong></div>
            <div class="status-card"><span class="label">First proof</span><strong>One real operating packet</strong></div>
            <div class="status-card"><span class="label">Boundary</span><strong>Approval before access or writes</strong></div>
          </div>
          <div class="footnote">No client workspace, connector, external send, or record write starts until scope, source access, and owner approval are explicit.</div>
        </section>
        <section class="products" aria-label="Sellable product packages">
          <article class="product-card" id="build-app-from-workflow">
            <img src="/site/shots/live-product-build-app-from-workflow.png" alt="Custom Workflow App product screen" />
            <div class="card-head">
              <div class="eyebrow">Custom Workflow App</div>
              <h2>Repeated work becomes one operating screen.</h2>
              <p>For email, sheets, files, chat follow-up, owner review, and proof packs.</p>
            </div>
            <div class="detail-stack">
              <div class="detail"><span class="label">Setup inputs</span><strong>Source folder, spreadsheet, email thread, owner list.</strong></div>
              <div class="detail"><span class="label">Setup questions</span><strong>Who owns each status? What source proves completion? What must never auto-send?</strong></div>
              <div class="detail acceptance"><span class="label">Acceptance test</span><strong>A real request moves from source to owner review to proof pack.</strong></div>
              <div class="detail blockers"><span class="label">Launch blockers</span><strong>No source owner | No approval policy | No example records</strong></div>
            </div>
            <div class="actions">
              <a class="btn primary" href="/contact/?package=back-office-workflow-desk">Start this setup</a>
            </div>
          </article>
          <article class="product-card" id="factory-issues-maintenance-quality">
            <img src="/site/shots/live-product-factory-issues-maintenance-quality.png" alt="Factory Operations App product screen" />
            <div class="card-head">
              <div class="eyebrow">Factory Operations App</div>
              <h2>Issue, asset, QC, and maintenance control.</h2>
              <p>For WCM boards, ISO evidence, receiving, CAPA, readings, and manager closeout.</p>
            </div>
            <div class="detail-stack">
              <div class="detail"><span class="label">Setup inputs</span><strong>Issue log, QC record, maintenance note, asset list.</strong></div>
              <div class="detail"><span class="label">Setup questions</span><strong>What closes an issue? Which evidence is mandatory? Who approves risk?</strong></div>
              <div class="detail acceptance"><span class="label">Acceptance test</span><strong>One factory issue shows source, evidence, owner, risk, and approved action.</strong></div>
              <div class="detail blockers"><span class="label">Launch blockers</span><strong>No issue source | No closeout owner | No evidence rule</strong></div>
            </div>
            <div class="actions">
              <a class="btn primary" href="/contact/?package=factory-issues-maintenance-quality">Start this setup</a>
            </div>
          </article>
          <article class="product-card" id="restaurant-pos-menu-inventory">
            <img src="/site/shots/live-product-restaurant-pos-menu-inventory.png" alt="Restaurant POS and Inventory product screen" />
            <div class="card-head">
              <div class="eyebrow">Restaurant POS + Inventory</div>
              <h2>Orders, stock, payment proof, and daily close.</h2>
              <p>For menus, QR handoff, counter orders, cash gaps, stock notes, and owner reports.</p>
            </div>
            <div class="detail-stack">
              <div class="detail"><span class="label">Setup inputs</span><strong>Menu, payment proof, stock notes, shift close.</strong></div>
              <div class="detail"><span class="label">Setup questions</span><strong>Who can change prices? What proof closes payment? What branch reports daily?</strong></div>
              <div class="detail acceptance"><span class="label">Acceptance test</span><strong>One branch day closes with sales proof, cash gaps, stock notes, and owner report.</strong></div>
              <div class="detail blockers"><span class="label">Launch blockers</span><strong>No menu source | No price-change approver | No closeout owner</strong></div>
            </div>
            <div class="actions">
              <a class="btn primary" href="/contact/?package=restaurant-pos-menu-inventory">Start this setup</a>
            </div>
          </article>
        </section>
      </main>
    </div>
  </body>
</html>`

const activationContactHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Contact | SUPERMEGA.dev</title>
    <meta name="description" content="Send one source to start a SUPERMEGA product setup contract." />
    <meta name="theme-color" content="#f7f8fb" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <style>
      :root { color-scheme: light; --bg:#f7f8fb; --panel:#ffffff; --panel-2:#f1f4f8; --line:#dbe2ea; --ink:#111827; --muted:#667085; --blue:#145cff; --green:#147a52; --red:#b42318; }
      * { box-sizing: border-box; }
      html, body { height: 100%; }
      body { margin: 0; height: 100svh; overflow: hidden; color: var(--ink); background: var(--bg); font-family: "Aptos", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
      a { color: inherit; text-decoration: none; }
      .shell { height: 100svh; display: grid; grid-template-rows: auto minmax(0, 1fr); width: min(1320px, 100%); margin: 0 auto; padding: 0 clamp(12px, 2vw, 24px); }
      header { min-height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 14px; border-bottom: 1px solid var(--line); }
      .brand { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 950; letter-spacing: -0.02em; }
      .mark { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--ink); color: #fff; }
      .mark img { width: 100%; height: 100%; display: block; border-radius: inherit; }
      nav { display: flex; align-items: center; gap: 8px; }
      .btn, button { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; border: 1px solid var(--line); border-radius: 999px; padding: 9px 14px; background: #fff; color: var(--ink); font: inherit; font-size: 13px; font-weight: 900; white-space: nowrap; cursor: pointer; }
      .btn.primary, button { border-color: var(--blue); background: var(--blue); color: #fff; }
      button[disabled] { opacity: 0.7; cursor: wait; }
      main { min-height: 0; display: grid; grid-template-columns: minmax(280px, 0.62fr) minmax(0, 1.38fr); gap: clamp(12px, 2vw, 22px); padding: clamp(12px, 2vw, 22px) 0; overflow: hidden; }
      .brief { min-height: 0; display: grid; align-content: center; gap: 14px; }
      .eyebrow, label span, .label { color: var(--blue); font-size: 11px; font-weight: 950; letter-spacing: 0.13em; text-transform: uppercase; }
      h1 { margin: 0; max-width: 9ch; font-size: clamp(44px, 6vw, 78px); line-height: 0.88; letter-spacing: 0; }
      p { margin: 0; color: var(--muted); font-size: clamp(15px, 1.5vw, 18px); line-height: 1.36; font-weight: 760; }
      .contact-panel { min-height: 0; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(260px, 0.95fr); gap: 10px; overflow: hidden; }
      form, .setup-packet { min-height: 0; border: 1px solid var(--line); border-radius: 18px; background: var(--panel); box-shadow: 0 18px 48px rgba(17, 24, 39, 0.07); }
      form { display: grid; grid-template-rows: minmax(0, 1fr) auto; gap: 10px; padding: 12px; overflow: hidden; }
      .fields { min-height: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; overflow: auto; padding-right: 2px; scrollbar-width: thin; }
      label { display: grid; gap: 5px; color: var(--muted); font-size: 12px; font-weight: 850; }
      .wide { grid-column: 1 / -1; }
      input, textarea { width: 100%; border: 1px solid var(--line); border-radius: 12px; background: var(--panel-2); color: var(--ink); padding: 9px 10px; font: inherit; outline: none; }
      textarea { min-height: 78px; resize: vertical; }
      input:focus, textarea:focus { border-color: rgba(20,92,255,0.55); box-shadow: 0 0 0 3px rgba(20,92,255,0.1); }
      .selected-path { grid-column: 1 / -1; border: 1px solid rgba(20,92,255,0.2); border-radius: 12px; background: rgba(20,92,255,0.07); padding: 10px; }
      .selected-path strong { display: block; margin-top: 3px; font-size: 17px; }
      .form-footer { display: grid; gap: 7px; }
      .policy, .form-status { color: var(--muted); font-size: 12px; font-weight: 780; line-height: 1.25; }
      .next-card[hidden] { display: none; }
      .next-card { border: 1px solid rgba(20,122,82,0.26); border-radius: 12px; background: rgba(20,122,82,0.08); padding: 9px; }
      .setup-packet { display: grid; align-content: start; gap: 8px; padding: 12px; overflow: auto; scrollbar-width: thin; }
      .setup-card { border: 1px solid var(--line); border-radius: 12px; padding: 10px; background: var(--panel-2); }
      .setup-card strong { display: block; margin-top: 4px; font-size: 13px; line-height: 1.28; }
      .setup-card span { display: block; margin-top: 3px; color: var(--muted); font-size: 12px; line-height: 1.3; font-weight: 760; }
      @media (max-width: 880px) {
        .shell { padding: 0 10px; }
        header { min-height: 54px; }
        nav .btn:not(.primary) { display: none; }
        main { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); gap: 9px; padding: 9px 0; }
        .brief { align-content: start; gap: 7px; }
        h1 { max-width: none; font-size: clamp(34px, 10vw, 45px); line-height: 0.92; }
        p { font-size: 13px; line-height: 1.26; }
        .contact-panel { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr); }
        .setup-packet { display: none; }
        form { border-radius: 16px; padding: 10px; }
        .fields { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
        label { font-size: 11px; }
        input, textarea { padding: 8px 9px; }
        textarea { min-height: 60px; }
        .selected-path { padding: 8px; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header>
        <a class="brand" href="/" aria-label="SUPERMEGA.dev home">${signalMarkHtml}<span>SUPERMEGA.dev</span></a>
        <nav aria-label="Primary">
          <a class="btn" href="/products/">Products</a>
          <a class="btn primary" href="/contact/">Send source</a>
        </nav>
      </header>
      <main aria-label="SUPERMEGA setup request">
        <section class="brief">
          <div class="eyebrow">Start setup</div>
          <h1>Send one source.</h1>
          <p data-contact-lead>Send one workflow. Attach or link the file, sheet, menu, issue log, payment proof, email thread, screenshot, or repeated task that should become a useful app.</p>
          <p>We reply with the product path, setup questions, first proof target, acceptance test, blockers, and approval boundary.</p>
        </section>
        <section class="contact-panel" aria-label="Setup request form">
          <form action="/api/contact-submissions" data-sm-lead-form enctype="multipart/form-data" method="post">
            <input type="hidden" name="workflow" value="General enquiry" />
            <input type="hidden" name="first_output" value="General enquiry" />
            <input type="hidden" name="requested_package" value="General enquiry" />
            <input type="hidden" name="public_package" value="build-app-from-workflow" />
            <input type="hidden" name="first_proof_target" value="One approved workflow packet from real source to owner review." />
            <input type="hidden" name="acceptance_tests" value="A real request moves from source to owner review to proof pack." />
            <input type="hidden" name="launch_blockers" value="No source owner | No approval policy | No example records" />
            <input type="hidden" name="automation_boundary" value="No account, connector, external send, or record write before owner approval." />
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
            <div class="fields">
              <label><span>Name</span><input autocomplete="name" name="name" required /></label>
              <label><span>Work email</span><input autocomplete="email" name="email" required type="email" /></label>
              <label><span>Company</span><input autocomplete="organization" name="company" required /></label>
              <label><span>Phone</span><input autocomplete="tel" name="phone" type="tel" /></label>
              <div class="selected-path" data-selected-path><span class="label">Selected setup</span><strong>Custom Workflow App</strong><p>First proof: one approved workflow packet.</p></div>
              <label class="wide"><span>Upload source files</span><input data-file-picker multiple name="source_files" type="file" /></label>
              <label class="wide"><span>Source link or system</span><input name="source_links" placeholder="Drive folder, sheet, menu, POS export, issue log, or screenshots" /></label>
              <label class="wide"><span>What should become clear?</span><textarea name="goal" placeholder="Example: what changed, who owns it, what is missing, and what should happen next." required></textarea></label>
            </div>
            <input autocomplete="off" name="website" style="display:none" tabindex="-1" />
            <div class="form-footer">
              <button type="submit">Send request</button>
              <div class="policy">No account or data connection before you approve the first step.</div>
              <div class="form-status" data-lead-status aria-live="polite"></div>
              <div class="next-card" data-next-card hidden><strong>Saved.</strong> We review the source and reply with the first setup packet.</div>
            </div>
          </form>
          <aside class="setup-packet" aria-label="Setup packet">
            <div class="eyebrow">Setup packet</div>
            <div class="setup-card"><span class="label">First proof</span><strong data-first-proof>One approved workflow packet from real source to owner review.</strong></div>
            <div class="setup-card"><span class="label">Setup questions</span><strong data-setup-questions>Who owns each status? What source proves completion? What must never auto-send?</strong></div>
            <div class="setup-card"><span class="label">Acceptance test</span><strong data-acceptance-tests>A real request moves from source to owner review to proof pack.</strong></div>
            <div class="setup-card"><span class="label">Launch blockers</span><strong data-launch-blockers>No source owner | No approval policy | No example records</strong></div>
            <div class="setup-card"><span class="label">Approval boundary</span><strong data-automation-boundary>No account, connector, external send, or record write before owner approval.</strong></div>
          </aside>
        </section>
      </main>
    </div>
    <script>
      const packageContracts = {
        'document-extraction-ledger': {
          name: 'Document Extraction Ledger',
          lead: 'Document Extraction Ledger: send files, screenshots, exports, or forms that should become reviewed records.',
          placeholder: 'Paste the folder, file list, export sample, screenshot set, or data room that should become reviewable records.',
          firstStep: 'Review the source and scope the first reviewed extraction ledger.',
          firstProof: 'One source batch becomes reviewed rows with fields, flags, and owner decisions.',
          setupQuestions: 'Which fields matter? Who reviews exceptions? What must never write back automatically?',
          acceptanceTests: 'One source batch becomes reviewed rows with fields, flags, and owner decisions.',
          launchBlockers: 'No source sample | No reviewer | No output field list',
          automationBoundary: 'No downstream writeback, send, billing, or customer-facing action before reviewer approval.'
        },
        'back-office-workflow-desk': {
          name: 'Back Office Workflow Desk',
          lead: 'Back Office Workflow Desk: send one repeated workflow, source, screenshot, or file set.',
          placeholder: 'Paste a link or describe the repeated work, who owns it, what proof exists, and what result your team needs.',
          firstStep: 'Review the source and scope the first usable app screen.',
          firstProof: 'One approved workflow packet from real source to owner review.',
          setupQuestions: 'Who owns each status? What source proves completion? What must never auto-send?',
          acceptanceTests: 'A real request moves from source to owner review to proof pack.',
          launchBlockers: 'No source owner | No approval policy | No example records',
          automationBoundary: 'No account, connector, external send, or record write before owner approval.'
        },
        'agency-client-operator': {
          name: 'Agency Client Operator',
          lead: 'Agency Client Operator: send one client inbox, tracker, delivery workflow, or report handoff.',
          placeholder: 'Paste the client inbox, status sheet, project tracker, reporting deck, or delivery notes that should become an owner-reviewed client operator.',
          firstStep: 'Review the client workflow and scope the first client-ops operator screen.',
          firstProof: 'One real client request becomes a reviewed status packet with next action and owner approval.',
          setupQuestions: 'Which clients matter first? What source proves status? What must never be sent without approval?',
          acceptanceTests: 'One client request moves from source to reviewed update, next action, and proof pack.',
          launchBlockers: 'No client source | No approval owner | No delivery status rule',
          automationBoundary: 'No client message, CRM write, invoice, or project update before owner approval.'
        },
        'agent-app-control-room': {
          name: 'Agent App Control Room',
          lead: 'Agent App Control Room: send one app, form, workflow, browser task, or approval path.',
          placeholder: 'Paste the form, approval path, browser task, spreadsheet, or SOP that should become a controlled agent app.',
          firstStep: 'Review the workflow and scope the first controlled agent app.',
          firstProof: 'One task runs through plan, draft output, review state, and approved action boundary.',
          setupQuestions: 'Who approves actions? Which tools can the agent use? What logs prove it worked?',
          acceptanceTests: 'One real task moves from request to draft output to approval-ready action.',
          launchBlockers: 'No workflow source | No approval rule | No tool boundary',
          automationBoundary: 'No external action, browser submission, tool write, or account change before approval.'
        },
        'custom-agent-workcell': {
          name: 'Custom Agent Workcell',
          lead: 'Custom Agent Workcell: send one repeated team task, file set, or software workflow.',
          placeholder: 'Paste the repeated desk task, source files, screenshots, or software steps that a human repeats today.',
          firstStep: 'Review the task and scope the first narrow AI-worker workcell.',
          firstProof: 'One repeated task becomes an operator queue with source, draft result, QA, and owner decision.',
          setupQuestions: 'What task repeats weekly? Which source is trusted? What output does the owner approve?',
          acceptanceTests: 'One task runs from source to reviewed output with proof and blocked-action rules.',
          launchBlockers: 'No repeat task | No sample source | No owner review rule',
          automationBoundary: 'No writeback, send, system change, or customer-facing action before owner approval.'
        },
        'agentic-data-story-desk': {
          name: 'Agentic Data Story Desk',
          lead: 'Agentic Data Story Desk: send one workbook, export, messy folder, or reporting workflow.',
          placeholder: 'Paste the workbook, exports, reporting screenshots, or messy source folder that should become a reviewed insight pack.',
          firstStep: 'Review the data source and scope the first insight/story packet.',
          firstProof: 'One messy source becomes cleaned fields, exception notes, charts, and a decision-ready brief.',
          setupQuestions: 'What decision should the report support? Which fields are trusted? Who approves the story?',
          acceptanceTests: 'One data batch becomes a reviewed insight pack with source trace and exceptions.',
          launchBlockers: 'No data sample | No target decision | No reviewer',
          automationBoundary: 'No external report send, dashboard publish, or system write before owner approval.'
        },
        'no-api-desktop-operator': {
          name: 'No-API Desktop Operator',
          lead: 'No-API Desktop Operator: send one desktop software task that has no usable API.',
          placeholder: 'Describe the software, clicks, files, screenshots, and approval rule for the desktop workflow that has no usable API.',
          firstStep: 'Review the desktop task and scope the first supervised automation run.',
          firstProof: 'One desktop task produces an audit log, screenshots, draft result, and approval checkpoint.',
          setupQuestions: 'Which machine or app is used? What screenshots prove progress? What action must be blocked?',
          acceptanceTests: 'One desktop task reaches an approval checkpoint with screenshots and replayable steps.',
          launchBlockers: 'No desktop task sample | No test account | No approval checkpoint',
          automationBoundary: 'No production click, submission, payment, or account change before owner approval.'
        },
        'social-commerce-inbox-operator': {
          name: 'Social Commerce Inbox Operator',
          lead: 'Social Commerce Inbox Operator: send one inbox, product list, order flow, or handoff rule.',
          placeholder: 'Paste sample messages, product notes, order statuses, payment proof, or handoff rules for the inbox operator.',
          firstStep: 'Review the inbox workflow and scope the first commerce triage operator.',
          firstProof: 'One real message becomes a classified request, draft reply, order status, and owner-approved next step.',
          setupQuestions: 'Which messages matter first? What proof confirms order or payment? What must never auto-reply?',
          acceptanceTests: 'One message moves from inbox source to reviewed draft reply and next action.',
          launchBlockers: 'No message samples | No product/order source | No reply approval rule',
          automationBoundary: 'No customer reply, payment confirmation, order change, or refund before owner approval.'
        },
        'operations-digital-twin': {
          aliasFor: 'factory-issues-maintenance-quality'
        },
        'factory-issues-maintenance-quality': {
          name: 'Factory Operations App',
          lead: 'Factory Operations App: send one issue log, QC record, maintenance note, receiving file, or asset list.',
          placeholder: 'Paste the workbook, Drive folder, issue log, QC file, receiving note, maintenance note, or manager screenshot.',
          firstStep: 'Review the source and scope the first daily factory control screen.',
          firstProof: 'One factory issue shows source, evidence, owner, risk, and approved action.',
          setupQuestions: 'What closes an issue? Which evidence is mandatory? Who approves risk?',
          acceptanceTests: 'One factory issue shows source, evidence, owner, risk, and approved action.',
          launchBlockers: 'No issue source | No closeout owner | No evidence rule',
          automationBoundary: 'No external send, supplier message, asset update, or closeout write before owner approval.'
        },
        'restaurant-group-os': {
          aliasFor: 'restaurant-pos-menu-inventory'
        },
        'restaurant-pos-menu-inventory': {
          name: 'Restaurant POS + Inventory',
          lead: 'Restaurant POS + Inventory: send your menu, QR flow, payment proof, stock notes, or daily close process.',
          placeholder: 'Paste the menu link/file, payment provider proof, cash-up process, stock notes, or shift handover screenshots.',
          firstStep: 'Review the branch flow and scope the first counter operations screen.',
          firstProof: 'One daily-close packet for a real branch day.',
          setupQuestions: 'Who can change prices? What proof closes payment? What branch report matters daily?',
          acceptanceTests: 'One branch day closes with sales proof, cash gaps, stock notes, and owner report.',
          launchBlockers: 'No menu source | No price-change approver | No closeout owner',
          automationBoundary: 'No price change, payment status change, inventory write, or customer message before owner approval.'
        }
      };
      const aliases = {
        'ai-workflow-desk': 'document-extraction-ledger',
        'build-app-from-workflow': 'document-extraction-ledger',
        'document-extraction-ledger': 'document-extraction-ledger',
        'agency-client-operator': 'agency-client-operator',
        'agent-app-control-room': 'agent-app-control-room',
        'custom-agent-workcell': 'custom-agent-workcell',
        'agentic-data-story-desk': 'agentic-data-story-desk',
        'no-api-desktop-operator': 'no-api-desktop-operator',
        'social-commerce-inbox-operator': 'social-commerce-inbox-operator',
        'agentops': 'agent-app-control-room',
        'ai-agent-operator': 'agent-app-control-room',
        'managed-agentops': 'agent-app-control-room',
        'factory-work': 'factory-issues-maintenance-quality',
        'digital-twin': 'factory-issues-maintenance-quality',
        'smart-meter-twin': 'factory-issues-maintenance-quality',
        'restaurant-pos': 'restaurant-pos-menu-inventory',
        'restaurant-desk': 'restaurant-pos-menu-inventory',
        'restaurant-pos-desk': 'restaurant-pos-menu-inventory'
      };
      for (const form of document.querySelectorAll('[data-sm-lead-form]')) {
        const search = new URLSearchParams(window.location.search);
        const requested = search.get('tool') || search.get('package') || '';
        let key = aliases[requested] || requested || 'back-office-workflow-desk';
        let selectedPackage = packageContracts[key] || packageContracts['back-office-workflow-desk'];
        if (selectedPackage.aliasFor) {
          key = selectedPackage.aliasFor;
          selectedPackage = packageContracts[key] || packageContracts['back-office-workflow-desk'];
        }
        const set = (name, value) => {
          const input = form.querySelector('[name="' + name + '"]');
          if (input) input.value = value || '';
        };
        set('source_url', window.location.href);
        set('page_path', window.location.pathname + window.location.search);
        set('referrer', document.referrer || '');
        for (const utmKey of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
          set(utmKey, search.get(utmKey) || '');
        }
        set('workflow', selectedPackage.name);
        set('requested_package', selectedPackage.name);
        set('first_output', selectedPackage.name);
        set('product_area', selectedPackage.name);
        set('public_package', key);
        set('first_step', selectedPackage.firstStep);
        set('first_proof_target', selectedPackage.firstProof);
        set('acceptance_tests', selectedPackage.acceptanceTests);
        set('launch_blockers', selectedPackage.launchBlockers);
        set('automation_boundary', selectedPackage.automationBoundary);
        const lead = document.querySelector('[data-contact-lead]');
        const goal = form.querySelector('[name="goal"]');
        const selectedPath = document.querySelector('[data-selected-path]');
        if (lead) lead.textContent = selectedPackage.lead;
        if (goal) goal.placeholder = selectedPackage.placeholder;
        if (selectedPath) selectedPath.innerHTML = '<span class="label">Selected setup</span><strong>' + selectedPackage.name + '</strong><p>First proof: ' + selectedPackage.firstProof + '</p>';
        const bindText = (selector, value) => {
          const element = document.querySelector(selector);
          if (element) element.textContent = value;
        };
        bindText('[data-first-proof]', selectedPackage.firstProof);
        bindText('[data-setup-questions]', selectedPackage.setupQuestions);
        bindText('[data-acceptance-tests]', selectedPackage.acceptanceTests);
        bindText('[data-launch-blockers]', selectedPackage.launchBlockers);
        bindText('[data-automation-boundary]', selectedPackage.automationBoundary);
        const filePicker = form.querySelector('[data-file-picker]');
        if (filePicker) {
          filePicker.addEventListener('change', () => {
            const files = Array.from(filePicker.files || []).map((file) => file.name + ' (' + Math.ceil(file.size / 1024) + ' KB)');
            set('source_file_names', files.join('; '));
            set('source_file_count', String(files.length));
          });
        }
        const status = form.querySelector('[data-lead-status]');
        const submit = form.querySelector('button[type="submit"]');
        const nextCard = form.querySelector('[data-next-card]');
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (form.querySelector('[name="website"]')?.value) return;
          set('first_output', form.querySelector('[name="requested_package"]')?.value || selectedPackage.name);
          const payload = new FormData(form);
          if (status) status.textContent = 'Sending...';
          if (nextCard) nextCard.hidden = true;
          if (submit) {
            submit.disabled = true;
            submit.textContent = 'Sending...';
          }
          try {
            const response = await fetch('/api/contact-submissions', { method: 'POST', body: payload });
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
      src: '^/api/commercial-control/status$',
      dest: '/api/commercial-control.js',
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
      src: '^/api/behavior-events/?$',
      dest: '/api/behavior-events.js',
    },
    {
      src: '^/api/behavior-events/status/?$',
      dest: '/api/behavior-events.js',
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
      src: '^/ai-agent-solutions/?$',
      dest: '/ai-agent-solutions/index.html',
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
      src: '^/ai-agent-solutions/?$',
      dest: '/ai-agent-solutions/index.html',
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
  ],
}

async function writeNodeFunction(name) {
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
  for (const dependency of nodeFunctionDependencies) {
    const sourceDependency = resolve(root, 'node_modules', dependency)
    await cp(sourceDependency, resolve(functionDir, 'node_modules', dependency), {
      recursive: true,
      force: true,
    }).catch((error) => {
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
  const allowedRootDirs = new Set(['assets', 'site', 'social', 'products', 'start', 'contact', 'offers', 'work', 'machine', 'card', 'c', 'demo'])
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
  const allowedSiteEntries = new Set(['shots', 'social'])
  for (const entry of await readdir(resolve(staticDir, 'site'), { withFileTypes: true }).catch(() => [])) {
    if (allowedSiteEntries.has(entry.name)) continue
    await rm(resolve(staticDir, 'site', entry.name), { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
  }
}

await rm(outputDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
await mkdir(outputDir, { recursive: true })
await copyPublicStatic(resolve(root, 'api-static'), staticDir)
await mkdir(staticDir, { recursive: true })
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
await mkdir(resolve(staticDir, 'site', 'shots'), { recursive: true })
await mkdir(resolve(staticDir, 'site', 'social'), { recursive: true })
for (const filename of ['supermega-portal-card.png', 'supermega-contact-qr.png']) {
  await cp(resolve(root, 'showroom', 'public', 'social', filename), resolve(staticDir, 'site', 'social', filename), { force: true })
}
const publicShotCopies = [
  ['actual-custom-workflow-queue.png'],
  ['actual-custom-workflow-modules.png'],
  ['actual-custom-workflow-overview.png'],
  ['actual-factory-assets.png'],
  ['actual-factory-actions.png'],
  ['actual-factory-overview.png'],
  ['actual-restaurant-shift-stock.png'],
  ['actual-restaurant-menu.png'],
  ['actual-restaurant-overview.png'],
  ['live-demo-agent-builder.png'],
  ['live-demo-service-desk.png'],
  ['live-demo-industrial-os.png'],
  ['live-demo-restaurant-os.png'],
  ['live-demo-portal-factory.png'],
  ['live-product-build-app-from-workflow.png', 'live-product-build-app-from-workflow.png'],
  ['live-product-factory-issues-maintenance-quality.png', 'live-product-factory-issues-maintenance-quality.png'],
  ['live-product-restaurant-pos-menu-inventory.png', 'live-product-restaurant-pos-menu-inventory.png'],
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
    subhead: 'The counter app for Myanmar spas, salons, retail shops, cafes, restaurants, and repair counters. Take cash, KBZPay, AYA Pay, and MMQR; track stock and bookings; and close every day with a clean cash-up the owner can trust — even when the internet drops.',
    shot: '/site/shots/live-product-restaurant-pos-menu-inventory.png',
    whatItDoes: [
      'Rings up orders fast on a phone, tablet, or counter screen, in MMK',
      'Takes cash, KBZPay, AYA Pay, and MMQR, and keeps the payment slip against each order',
      'Reconciles the day’s payments by method and flags anything still missing proof',
      'Counts the cash drawer and shows the variance against expected sales',
      'Tracks stock with low-stock alerts and logs waste and prep notes',
      'Keeps working offline and syncs the moment the connection returns',
    ],
    howItWorks: [
      { step: 'Ring up the order', detail: 'Staff add items and take payment — cash, KBZPay, AYA Pay, or MMQR — and attach the slip. Stock and the running day total update on the spot.' },
      { step: 'Match payments through the day', detail: 'Each payment is lined up against its order and anything still needing a slip is flagged, so reconciliation is mostly done before close.' },
      { step: 'Close the day', detail: 'Count the drawer, clear any variance and stock exceptions, and the owner digest goes out. The day closes with a record that holds up tomorrow.' },
    ],
    features: [
      { title: 'Fast counter checkout', desc: 'Add items, apply a discount, and take payment in a few taps — built for a busy counter on a phone or tablet, prices in MMK.' },
      { title: 'Every payment method, with proof', desc: 'Cash, KBZPay, AYA Pay, and MMQR on one screen. Each order keeps its slip and reference, so a payment has evidence behind it.' },
      { title: 'Daily close and cash-up', desc: 'Payments reconciled by method, the drawer counted against expected cash, variance shown clearly. Nothing closes until gaps are explained.' },
      { title: 'Stock and low-stock alerts', desc: 'Sales draw down stock as they happen; items below their reorder point surface on the close, alongside waste and prep notes.' },
      { title: 'Works offline', desc: 'Sales, payments, and notes save on the device first and sync when the connection returns — a dropped line never stops the counter.' },
      { title: 'Owner daily digest', desc: 'At close the owner gets a one-line summary: sales, top items, cash variance, and anything still needing proof.' },
    ],
    proofPoint: 'Live and in use — try the full point-of-sale, payments, and daily-close flow with realistic Myanmar shop data at pos.supermega.dev, no signup required.',
    whoFor: 'Owners and counter staff at Myanmar spas, salons, retail shops, cafes, restaurants, and repair counters — especially operators who want a clean daily close and payment proof without migrating to a heavy POS.',
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
      { step: 'Capture on the floor', detail: 'Inspectors and operators record inspections, grades, defects, downtime, and work orders on a tablet or phone — bilingual, with photos, working even when the WiFi drops.' },
      { step: 'Link and surface', detail: 'Each record ties back to the batch, line, operator, and shift, so the board shows the live reject rate, a defect Pareto, and the incidents that need attention now.' },
      { step: 'Close the loop', detail: 'Defects become 5W1H incidents and owned CAPA; machine issues become work orders. Managers track them to verified closure and read one daily brief.' },
    ],
    features: [
      { title: 'Line and shift production tracking', desc: 'Output versus target for each line, with machine status and downtime reasons captured as they happen — not reconstructed the next morning.' },
      { title: 'Inspection and grading', desc: 'Scan a serial, pick the defect, attach a photo, assign a grade. The reject rate updates live by line and shift and flags the moment a line breaches target.' },
      { title: 'Defect tracking on your taxonomy', desc: 'Defects are logged against your actual categories and product models. A Pareto view shows the few defects driving most loss; a spike alert fires on repeat defects in the same window.' },
      { title: 'DQMS: incidents, 5W1H, CAPA', desc: 'Every flagged unit becomes a structured incident and opens a corrective/preventive action with an owner and due date. Nothing auto-closes — full audit trail.' },
      { title: 'Maintenance work orders', desc: 'When a machine goes down or drifts out of spec, raise a work order from the same screen, assign it, and track it to completion.' },
      { title: 'Plant-manager and CEO brief', desc: 'One daily summary — reject rate against target, top defects, lines over target, downtime, overdue CAPA — bilingual English and Burmese.' },
    ],
    proofPoint: 'We build it around your real factory operations — your line targets, defect taxonomy, grading rules, downtime reasons, and CAPA owners. We stand up the first working version in a few working days once we have your taxonomy and a sample of real records.',
    whoFor: 'Discrete manufacturers that still run on log books and Excel — for QC managers, production supervisors, maintenance leads, and the plant manager who needs one honest picture of the floor.',
    primaryCta: { label: 'Talk to us about your plant', href: '/contact/' },
  },
  {
    slug: 'documents',
    displayName: 'Document Extraction Ledger',
    eyebrow: 'Document extraction ledger',
    headline: 'Turn messy files into clean records you can act on',
    subhead: 'Emails, spreadsheets, chat photos, and scanned forms become one structured ledger — with a work queue, owners, status, approvals, and a link back to the original source for every record.',
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
      { title: 'Built for your formats', desc: 'Tuned to your own document shapes, Burmese business names, MMK amounts, and KBZPay / MMQR references — and exports clean CSV.' },
    ],
    proofPoint: 'We turn messy operating records — hundreds of emails, chat threads, and scanned forms — into one structured ledger of reviewable claims, decisions, owners, and source-linked evidence. We build yours around your real document shapes, Burmese business names, and MMK / MMQR references.',
    whoFor: 'Myanmar shops, factories, and distributors whose real work arrives as emails, chat messages, and photos — and the office staff who today re-key all of it into spreadsheets by hand.',
    primaryCta: { label: 'Talk to us about your documents', href: '/contact/' },
  },
  {
    slug: 'back-office',
    displayName: 'Back Office AI Desk',
    eyebrow: 'Back office · Upcoming',
    headline: 'An AI helper for one back-office job — it drafts, you approve',
    subhead: 'Takes one recurring task you already do by hand — the daily close audit, reorder watch, or supplier follow-up — and prepares the work for you each day. Every finding and message is held in a review queue. Nothing is sent, posted, or changed until you press approve.',
    shot: '/site/shots/live-demo-agent-builder.png',
    whatItDoes: [
      'Reads the source you already have — register Z-reports, KBZPay/MMQR settlement exports, a stock sheet — and prepares one job',
      'Drafts findings and suggested next steps, ranked by money at risk, instead of doing anything on its own',
      'Holds every draft in an approval queue: approve, edit, or dismiss, one at a time',
      'Keeps sends, edits, refunds, and anything customer-facing blocked until you say so',
      'Logs every run so you can see exactly what was read, what was drafted, and what you approved',
    ],
    howItWorks: [
      { step: 'Pick one job and send examples', detail: 'You choose the single recurring task and share a few real examples — past closes, a stock sheet, supplier threads — plus the actions that must stay approval-only.' },
      { step: 'The desk drafts each day', detail: 'Each run, the agent reads your source, prepares findings and next steps ranked by what matters most, and places them in your review queue. It takes no action.' },
      { step: 'You review and approve', detail: 'Approve, edit, or dismiss each draft. Approved items are the only ones that ever go anywhere, and every decision is written to the run ledger.' },
    ],
    features: [
      { title: 'Scoped to one job', desc: 'Set up around a single recurring task — daily close audit, reorder watch, or supplier follow-up — so it does one thing well, not many loosely.' },
      { title: 'Approve before anything happens', desc: 'Every output lands in a review queue as a draft. The agent never sends, edits the books, or messages anyone on its own.' },
      { title: 'Findings with evidence attached', desc: 'Each finding cites the exact numbers and source rows — system total vs counted cash, a missing settlement, a void with no note — so you can check it in seconds.' },
      { title: 'Blocked actions stay blocked', desc: 'Sends, writes, payments, credentials, and customer-impacting decisions are off by default. You decide which, if any, are ever turned on — and it is logged.' },
      { title: 'A run ledger you can trust', desc: 'Every run records what was read, what was drafted, who approved it, and when. No hidden activity, nothing autonomous to wonder about.' },
      { title: 'Weekly value report', desc: 'A short weekly report shows findings raised, money flagged, and time saved — so the desk has to keep proving it is worth keeping.' },
    ],
    proofPoint: 'Built on a strict draft-only boundary: sends, writes, payments, credentials, and customer-impacting decisions stay blocked until you approve them, and every run is logged. This is an early product — we set up the first desk in 4–5 working days once the job, examples, and blocked actions are agreed.',
    whoFor: 'Shop, restaurant, and factory owners and their operations managers in Myanmar who do the same back-office check every day by hand and want a careful AI helper that prepares the work but never acts without approval.',
    primaryCta: { label: 'Talk to us about a pilot', href: '/contact/?package=back-office-workflow-desk' },
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
        <span>SUPERMEGA.dev builds custom business apps from real work.</span>
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
for (const detailDoc of productDetailDocs) {
  await mkdir(resolve(staticDir, 'products', detailDoc.slug), { recursive: true })
  await writeFile(resolve(staticDir, 'products', detailDoc.slug, 'index.html'), normalizePublicProductNames(buildProductDetailHtml(detailDoc)), 'utf8')
}

// Offers / pricing — the revenue surface. Public "from" anchors (USD primary, MMK derived at the ~4,800 market rate).
const publicOffers = [
  {
    slug: 'tool-week', name: 'Tool in a week', usd: '600', mmk: '~2,900,000 MMK',
    who: 'You have one sharp, specific job to fix.',
    gets: ['One focused tool, fixed scope', 'Live at a real URL in days, not months', 'Yours to keep — no per-seat fee', 'One round of revisions included'],
    cta: 'Start this',
  },
  {
    slug: 'dashboard', name: 'Custom dashboard / internal tool', usd: '1,500', mmk: '~7,200,000 MMK',
    who: 'Your numbers live across five spreadsheets and nobody trusts them.',
    gets: ['One screen that updates itself from your real data', 'Built around how you actually work', 'Bilingual MY/EN, MMK-native', 'Export to clean CSV anytime'],
    cta: 'Scope my dashboard',
  },
  {
    slug: 'ai-agent', name: 'AI agent / automation', usd: '2,500', mmk: '~12,000,000 MMK',
    who: 'The same back-office task eats hours every single day.',
    gets: ['An agent that reads your real inputs and drafts the work', 'Approval gate on anything that sends, pays, or changes the books', 'A run ledger — nothing happens silently', 'Weekly report on time and money saved'],
    cta: 'Describe the job',
  },
  {
    slug: 'design-ship', name: 'Design + ship system', usd: '6,000', mmk: '~29,000,000 MMK', flagship: true,
    who: 'You want it to look premium and actually run — one build, end to end.',
    gets: ['Brand and UI designed on our system', 'A full working system, live and in use', 'Local payments, offline-ready, bilingual', 'Hands over as a running thing, not a pile of files'],
    cta: 'Book a build',
  },
  {
    slug: 'care-plan', name: 'Care plan', usd: '300', per: '/mo', mmk: '~1,440,000 MMK / mo',
    who: 'Keep what we built running, fresh, and improving.',
    gets: ['Hosting, monitoring, and small changes', 'One shipped improvement every quarter', 'Priority on fixes', 'Sold after a build — never "hours per month"'],
    cta: 'Add a care plan',
  },
]
const publicOffersHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>Pricing | SUPERMEGA.dev</title>
    <meta name="description" content="Custom software at SaaS prices. Clear from-anchor pricing for tools, dashboards, AI agents, full systems, and care plans — built for Myanmar, yours to keep." />
    <meta name="theme-color" content="#f4efe6" />
    <link rel="canonical" href="https://supermega.dev/offers/" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=supermega-atelier-20260623" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SUPERMEGA.dev" />
    <meta property="og:title" content="Pricing — custom software at SaaS prices" />
    <meta property="og:description" content="Clear from-anchor pricing for tools, dashboards, AI agents, full systems, and care plans. Built for Myanmar, yours to keep." />
    <meta property="og:url" content="https://supermega.dev/offers/" />
    <meta property="og:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="https://supermega.dev/site/social/supermega-portal-card.png" />
    <style>${unicornShellStyle}
      .of-thesis { border: 1px solid var(--blue); background: var(--blue-soft); border-radius: 20px; padding: 24px 26px; }
      .of-thesis p { color: var(--ink); max-width: 64rem; font-size: 18px; line-height: 1.55; }
      .of-pillars { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px,1fr)); gap: 14px; margin-top: 24px; }
      .of-pillar { border: 1px solid var(--line); border-radius: 16px; padding: 18px; background: rgba(255,255,255,0.5); }
      :root[data-theme="dark"] .of-pillar { background: rgba(243,239,230,0.05); }
      .of-pillar strong { display: block; font-size: 16px; letter-spacing: -0.02em; }
      .of-pillar span { display: block; margin-top: 7px; color: var(--muted); font-size: 14px; line-height: 1.5; }
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
      .of-price .per { color: var(--muted); font-size: 15px; font-weight: 600; }
      .of-mmk { margin-top: 5px; color: var(--muted); font-size: 13px; }
      .of-gets { list-style: none; padding: 0; margin: 18px 0 0; display: grid; gap: 9px; }
      .of-gets li { display: grid; grid-template-columns: auto minmax(0,1fr); gap: 10px; align-items: start; color: var(--ink); font-size: 14px; line-height: 1.45; }
      .of-gets li::before { content: ""; margin-top: 7px; width: 6px; height: 6px; border-radius: 999px; background: var(--blue); }
      .of-card .btn { margin-top: 20px; width: 100%; text-align: center; }
      .of-card .of-spacer { flex: 1; }
      .compare { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; }
      .compare > div { border: 1px solid var(--line); border-radius: 18px; padding: 22px; }
      .compare h3 { margin: 0 0 10px; font-size: 16px; letter-spacing: -0.01em; }
      .compare p { color: var(--muted); font-size: 14px; line-height: 1.55; }
      .compare .win { border-color: var(--blue); background: var(--blue-soft); }
      .compare .win p { color: var(--ink); }
      .of-note { margin-top: 16px; color: var(--muted); font-size: 13px; max-width: 60rem; }
      .pd-steps { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 16px; margin-top: 24px; }
      .pd-step n { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 999px; background: var(--blue); color: #fff; font-weight: 600; font-size: 15px; }
      .pd-step strong { display: block; margin-top: 13px; font-size: 17px; letter-spacing: -0.02em; }
      .pd-step span { display: block; margin-top: 7px; color: var(--muted); font-size: 14px; line-height: 1.5; }
      @media (max-width: 880px) { .pd-steps { grid-template-columns: 1fr 1fr; } .compare { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <div class="wrap">
${unicornHeader}
      <main>
        <section class="poster" style="min-height:auto;align-items:center">
          <div class="copy">
            <div class="eyebrow">Pricing</div>
            <h1>Custom software at SaaS prices</h1>
            <p>SaaS sells you the average and rents it back forever, per seat. We build you the exact thing — AI-native, made for how you actually work, and yours to keep. Clear starting prices below; the final quote comes after one short call.</p>
            <div class="cta">
              <a class="btn primary" href="/contact/?package=design-ship">Book a build</a>
              <a class="btn secondary" href="/demo/">See live demos</a>
            </div>
          </div>
        </section>

        <section class="section">
          <div class="of-thesis"><p><strong>SaaS sells the average. We build the exact</strong> — and because we build <em>with</em> AI, the exact now costs less than two or three years of renting the average. One system instead of seven subscriptions that fight each other, with no per-seat tax that grows every time you hire.</p></div>
          <div class="of-pillars">
            <div class="of-pillar"><strong>You own it</strong><span>No per-seat fee, no vendor that can switch it off. The thing is yours.</span></div>
            <div class="of-pillar"><strong>AI-native</strong><span>AI is the substrate — every build can read messy real inputs and draft the next step.</span></div>
            <div class="of-pillar"><strong>Built for Myanmar</strong><span>MMK, KBZPay / WavePay / MMQR, MY/EN — and it works when the internet doesn't.</span></div>
            <div class="of-pillar"><strong>One system, not seven</strong><span>Your tools stop fighting each other; your data lives in one place you control.</span></div>
          </div>
        </section>

        <section class="section">
          <h2>What you can start</h2>
          <div class="of-grid">
            ${publicOffers.map((o) => `<div class="of-card${o.flagship ? ' flagship' : ''}">${o.flagship ? '<span class="of-tag">Most complete</span>' : ''}
              <h3>${o.name}</h3>
              <p class="of-who">${o.who}</p>
              <div class="of-price"><span class="from">from</span><b>$${o.usd}</b>${o.per ? `<span class="per">${o.per}</span>` : ''}</div>
              <div class="of-mmk">${o.mmk}</div>
              <ul class="of-gets">${o.gets.map((g) => `<li>${g}</li>`).join('')}</ul>
              <div class="of-spacer"></div>
              <a class="btn ${o.flagship ? 'primary' : 'secondary'}" href="/contact/?package=${o.slug}">${o.cta}</a>
            </div>`).join('')}
          </div>
          <p class="of-note">All prices are starting "from" anchors in USD, with the MMK equivalent at the market rate. Final scope and price are agreed on a short call. Fixed-scope projects with clear revision caps; 50% deposit to start (KBZPay / MMQR / cash, or card for international).</p>
        </section>

        <section class="section">
          <h2>How we work</h2>
          <div class="pd-steps">
            <div class="pd-step"><n>1</n><strong>Scope</strong><span>One short call. We agree exactly what ships and what's out of scope — no open-ended hours.</span></div>
            <div class="pd-step"><n>2</n><strong>Deposit</strong><span>50% to start — KBZPay, MMQR, cash, or card. The local norm, and it keeps us both honest.</span></div>
            <div class="pd-step"><n>3</n><strong>Ship</strong><span>We build it AI-native and hand you a running thing at a live URL — not a folder of files.</span></div>
            <div class="pd-step"><n>4</n><strong>Care</strong><span>Optional care plan keeps it running and improving. You can also just take it and go.</span></div>
          </div>
        </section>

        <section class="section">
          <h2>Why this beats another subscription</h2>
          <div class="compare">
            <div><h3>The SaaS path</h3><p>A 15-person shop on separate POS, accounting, and HR tools easily pays $200–400 a month — over $7,000 in two to three years — and it grows with every hire. Most SMBs run 25+ apps, add about seven a month, and leave over half the seats underused. The tools rarely talk to each other.</p></div>
            <div class="win"><h3>The SuperMega path</h3><p>One custom build, paid once, plus a light care plan if you want it. It's shaped to your work, it speaks to itself, and the price doesn't climb when you hire. You own it. Over two to three years it wins on total cost — and you stop paying the integration tax forever.</p></div>
          </div>
          <p class="of-note">Sources: Zylo 2025 SaaS Management Index; JumpCloud; Spendesk. Figures are industry averages used to frame total cost — your numbers are confirmed on the scoping call.</p>
        </section>

        <section class="section">
          <div class="final">
            <div><h2>Tell us the one thing to fix first.</h2></div>
            <a class="btn primary" href="/contact/?package=design-ship">Book a build</a>
          </div>
        </section>
      </main>
      <footer>
        <span>SUPERMEGA.dev builds custom business apps from real work.</span>
        <span class="footer-links">
          <a href="mailto:swanhtet@supermega.dev">swanhtet@supermega.dev</a>
          <a href="/products/">Products</a>
          <a href="/demo/">Demos</a>
          <a href="/contact/">Contact</a>
        </span>
      </footer>
    </div>
${publicLanguageToggleScript}
  </body>
</html>`
await rm(resolve(staticDir, 'pricing'), { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
await rm(resolve(staticDir, 'start'), { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
await mkdir(resolve(staticDir, 'card'), { recursive: true })
await writeTextFileEnsuringDir(resolve(staticDir, 'card', 'index.html'), normalizePublicProductNames(publicCardHtml))
await rm(resolve(staticDir, 'about'), { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
await mkdir(resolve(staticDir, 'c'), { recursive: true })
await writeTextFileEnsuringDir(resolve(staticDir, 'c', 'index.html'), normalizePublicProductNames(publicCampaignRedirectHtml))
await mkdir(resolve(staticDir, 'contact'), { recursive: true })
await writeFile(resolve(staticDir, 'contact', 'index.html'), normalizePublicProductNames(collapsedContactHtml), 'utf8')
await mkdir(resolve(staticDir, 'offers'), { recursive: true })
await writeFile(resolve(staticDir, 'offers', 'index.html'), normalizePublicProductNames(publicOffersHtml), 'utf8')

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
  {
    eyebrow: 'HR & Payroll · Live now',
    headline: 'A salary spreadsheet becomes printable payslips in seconds',
    story: 'Payroll staff were hand-making payslips from a monthly salary spreadsheet, one person at a time. We built a browser tool that takes the .xlsx — even password-protected — and turns it into clean, printable payslips for everyone. Nothing leaves the browser.',
    built: ['Reads your existing salary .xlsx', 'Decrypts password-protected files in the browser', 'A clean, printable payslip per person', 'No upload — runs entirely on your device'],
    proof: 'Live and open — try it with your own salary file.',
    cta: { label: 'Try it live ↗', href: 'https://payslip-maker-topaz.vercel.app/', ext: true },
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
              <a class="btn primary" href="/offers/">See pricing</a>
              <a class="btn secondary" href="/demo/">See live demos</a>
            </div>
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
        <span>SUPERMEGA.dev — custom business software at SaaS prices.</span>
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
await mkdir(resolve(staticDir, 'machine'), { recursive: true })
await writeFile(resolve(staticDir, 'machine', 'index.html'), normalizePublicProductNames(publicMachineHtml), 'utf8')
const publicAiAgentSolutionsHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="referrer" content="no-referrer" />
    <title>AI Agent Solutions | SUPERMEGA.dev</title>
    <meta name="description" content="Practical AI workers that turn inbox, files, chat, and browser tasks into reviewed work for your team." />
    <link rel="canonical" href="https://supermega.dev/ai-agent-solutions/" />
    <style>
      :root { color-scheme: light; --ink:#18221f; --muted:#5d6b65; --line:#d8e0da; --paper:#f7faf7; --accent:#0b6b55; }
      * { box-sizing:border-box; } body { margin:0; background:var(--paper); color:var(--ink); font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif; }
      .page { max-width:1080px; margin:auto; padding:28px 22px 72px; } nav { display:flex; justify-content:space-between; gap:18px; align-items:center; padding-bottom:64px; } nav a { color:inherit; text-decoration:none; font-weight:700; }
      .eyebrow { color:var(--accent); font-size:12px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; } h1 { max-width:760px; margin:14px 0 20px; font-size:clamp(38px,6vw,72px); line-height:1.02; letter-spacing:-.03em; } h2 { font-size:28px; line-height:1.1; margin:0 0 12px; } p { max-width:700px; color:var(--muted); }
      .lede { font-size:20px; max-width:680px; } .actions { display:flex; flex-wrap:wrap; gap:12px; margin-top:28px; } .btn { display:inline-block; border:1px solid var(--ink); border-radius:6px; padding:12px 17px; text-decoration:none; font-weight:750; } .primary { background:var(--ink); color:white; } .secondary { color:var(--ink); background:white; }
      .grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; margin:72px 0; } .item { border-top:2px solid var(--ink); padding-top:16px; } .item p { font-size:15px; }
      .proof { border-top:1px solid var(--line); border-bottom:1px solid var(--line); padding:34px 0; } .proof strong { display:block; font-size:20px; margin-bottom:8px; } footer { display:flex; justify-content:space-between; gap:18px; margin-top:52px; color:var(--muted); font-size:14px; } footer a { color:inherit; }
      @media (max-width:720px) { nav { padding-bottom:42px; } .grid { grid-template-columns:1fr; margin:48px 0; } footer { display:block; } footer span { display:block; margin-top:8px; } }
    </style>
  </head>
  <body>
    <main class="page" data-social-destination="ai-agent-solutions">
      <nav><a href="/">SUPERMEGA.dev</a><a href="/products/">Products</a></nav>
      <div class="eyebrow">AI Agent Solutions</div>
      <h1>Put the repeatable work on a worker your team can review.</h1>
      <p class="lede">We connect the tools you already use, turn messy information into a useful brief or next action, and keep every consequential step behind an approval boundary.</p>
      <div class="actions"><a class="btn primary" href="/contact/" rel="noreferrer">Start with one workflow</a><a class="btn secondary" href="/offers/">See how we work</a></div>
      <section class="grid" aria-label="AI worker capabilities">
        <article class="item"><h2>Inbox and files</h2><p>Summarize Gmail, Drive, PDFs, spreadsheets, and shared folders into decisions, risks, and assigned follow-ups.</p></article>
        <article class="item"><h2>Chat and browser</h2><p>Prepare answers, compare sources, monitor selected sites, and assemble a work packet without pretending the agent is a human.</p></article>
        <article class="item"><h2>Context that compounds</h2><p>Use approved company data, operating rules, and prior outcomes so each run gets more relevant without exposing private sources publicly.</p></article>
      </section>
      <section class="proof"><strong>What you receive</strong><p>A configured worker, source map, operating prompt, review queue, failure log, and handoff instructions your team can actually own. We start with one measurable task, prove it, then add the next.</p></section>
      <div class="actions"><a class="btn primary" href="/contact/?package=ai-agent">Describe the job</a><a class="btn secondary" href="/">Back to Shop and Plant</a></div>
      <footer><span>Supervised automation. No unapproved external sends or money actions.</span><span><a href="/contact/">Contact</a> · <a href="/offers/">Offers</a></span></footer>
    </main>
    <script>
      (function () {
        function emit(eventType, ctaText) {
          var body = JSON.stringify({ event_type: eventType, page_path: location.pathname, component: 'ai-agent-solutions', cta_text: ctaText || '' });
          try {
            var blob = new Blob([body], { type: 'application/json' });
            if (navigator.sendBeacon) navigator.sendBeacon('/api/behavior-events', blob);
            else fetch('/api/behavior-events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true });
          } catch (_) {}
        }
        emit('page_viewed');
        document.addEventListener('click', function (event) {
          var link = event.target.closest && event.target.closest('a');
          if (link && link.textContent) emit('cta_clicked', link.textContent.trim().slice(0, 160));
        });
      }());
    </script>
  </body>
</html>`
// Demo hub (source lives in C:/sm-site, outside OneDrive) served at /demo/
await mkdir(resolve(staticDir, 'demo'), { recursive: true })
// The demo hub is a separate lane's artifact (supermega-demo); copy it verbatim EXCEPT run it
// through the founder-locked display-name canon so the bundled /demo/ page can't regress to
// retired product names (DeskPOS etc.). Only display strings are touched, never the demo app's
// own lowercase slugs / query params, so its routing stays intact.
await readFile('C:/sm-site/supermega-demo/index.html', 'utf8')
  .then((demoHtml) => writeFile(resolve(staticDir, 'demo', 'index.html'), canonFounderLockedProductNames(demoHtml), 'utf8'))
  .catch(() => undefined)
await cp('C:/sm-site/supermega-demo/favicon.svg', resolve(staticDir, 'demo', 'favicon.svg'), { force: true }).catch(() => undefined)
await writeFile(resolve(staticDir, 'robots.txt'), 'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /app/\nDisallow: /clients/\nDisallow: /machine/\nSitemap: https://supermega.dev/sitemap.xml\n', 'utf8')
await writeFile(resolve(staticDir, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://supermega.dev/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n  <url><loc>https://supermega.dev/products/</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>\n  <url><loc>https://supermega.dev/offers/</loc><changefreq>weekly</changefreq><priority>0.95</priority></url>\n  <url><loc>https://supermega.dev/work/</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n  <url><loc>https://supermega.dev/contact/</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>\n  <url><loc>https://supermega.dev/card/</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>\n</urlset>\n', 'utf8')
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
await writeNodeFunction('behavior-events.js')
await writeNodeFunction('contact-submissions.js')
await writeNodeFunction('campaign-clicks.js')
await writeNodeFunction('commercial-control.js')
await writeNodeFunction('pipeline-control.js')
await writeNodeFunction('checkout-start.js')
await writeNodeFunction('product-activation.js')
await writeNodeFunction('sales-daily.js')
await writeNodeFunction('not-found.js')
await writeNodeFunction('public-app-handoff.js')
await removePrivateRootFunctions()
await prunePublicSiteDir()
await prunePublicStaticRoot()
await mkdir(staticDir, { recursive: true })
await mkdir(resolve(staticDir, 'ai-agent-solutions'), { recursive: true })
await writeFile(resolve(staticDir, 'ai-agent-solutions', 'index.html'), publicAiAgentSolutionsHtml, 'utf8')
await writeFile(
  resolve(staticDir, 'private-not-found.html'),
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Not found</title><body>Not found.</body></html>\n',
  'utf8',
)
await writeFile(resolve(outputDir, 'config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8')

console.log('public_vercel_output=ready')
