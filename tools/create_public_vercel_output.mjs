import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { build } from 'esbuild'

const root = process.cwd()
const outputDir = resolve(root, '.vercel', 'output')
const staticDir = resolve(outputDir, 'static')
const functionsDir = resolve(outputDir, 'functions', 'api')
const shopStartUrl = 'https://app.supermega.dev/?demo=shop&returnTo=%2Fstart'
const plantStartUrl = 'https://app.supermega.dev/?demo=plant&returnTo=%2Fstart'
const shopStartHref = shopStartUrl.replaceAll('&', '&amp;')
const plantStartHref = plantStartUrl.replaceAll('&', '&amp;')

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="supermega.dev terminal mark" shape-rendering="geometricPrecision"><rect x="2.5" y="2.5" width="59" height="59" rx="12" fill="#090d13"/><rect x="3.25" y="3.25" width="57.5" height="57.5" rx="11.25" fill="none" stroke="#ffffff" stroke-opacity="0.18"/><path d="M15 19 29 32 15 45" fill="none" stroke="#6b95ff" stroke-width="4.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M36 45h14" fill="none" stroke="#3dd6a2" stroke-width="4.25" stroke-linecap="round"/></svg>\n`

// The public site accepts only contact requests. It uses the contact handler's Supabase REST
// fallback when those variables are configured and never opens a direct Postgres connection.
// This keeps the public artifact small and prevents dormant operator-database access from leaking
// into the simple front-door runtime.
const publicDatastoreShim = `function supabaseConfigured() {
  return Boolean(String(process.env.SUPABASE_URL || '').trim() && String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim())
}

function datastoreStatus() {
  return {
    status: supabaseConfigured() ? 'configured' : 'not_configured',
    provider: 'supabase_rest',
    env: 'SUPABASE_URL_and_SUPABASE_SERVICE_ROLE_KEY',
    source: 'public_contact_runtime',
  }
}

function postgresConfigured() {
  return false
}

async function ping() {
  return {
    ok: true,
    reachable: false,
    configured: false,
    detail: supabaseConfigured() ? 'supabase_rest_configured' : 'no_db_configured',
  }
}

async function publicDirectPostgresDisabled() {
  return { status: 'skipped', reason: 'public_direct_postgres_disabled' }
}

module.exports = {
  datastoreStatus,
  postgresConfigured,
  ping,
  query: publicDirectPostgresDisabled,
  saveLeadLedger: publicDirectPostgresDisabled,
  savePipelineAction: publicDirectPostgresDisabled,
  saveSalesRun: publicDirectPostgresDisabled,
  latestSalesRun: publicDirectPostgresDisabled,
  pipelineSnapshot: publicDirectPostgresDisabled,
}
`

const sharedStyle = `
  :root {
    color-scheme: light;
    --page: #edf1f4;
    --surface: #f8fafb;
    --surface-strong: #ffffff;
    --glass: rgba(255, 255, 255, 0.68);
    --glass-strong: rgba(255, 255, 255, 0.84);
    --glass-highlight: rgba(255, 255, 255, 0.88);
    --ink: #0b0e13;
    --muted: #586271;
    --quiet: #798391;
    --line: rgba(11, 14, 19, 0.14);
    --line-strong: rgba(11, 14, 19, 0.24);
    --accent: #2658d9;
    --accent-strong: #1744bd;
    --accent-soft: rgba(38, 88, 217, 0.12);
    --signal: #008f6c;
    --inverse: #090c11;
    --inverse-ink: #f6f8fa;
    --inverse-muted: #aeb7c3;
    --shadow: 0 24px 70px rgba(17, 24, 39, 0.13);
    --shadow-deep: 0 36px 100px rgba(3, 8, 18, 0.3);
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --page: #090c11;
    --surface: #10151c;
    --surface-strong: #151b23;
    --glass: rgba(15, 20, 27, 0.68);
    --glass-strong: rgba(18, 24, 32, 0.86);
    --glass-highlight: rgba(255, 255, 255, 0.09);
    --ink: #f3f5f7;
    --muted: #a4aeba;
    --quiet: #7e8997;
    --line: rgba(238, 244, 255, 0.14);
    --line-strong: rgba(238, 244, 255, 0.25);
    --accent: #6b95ff;
    --accent-strong: #91afff;
    --accent-soft: rgba(107, 149, 255, 0.16);
    --signal: #3dd6a2;
    --shadow: 0 24px 70px rgba(0, 0, 0, 0.3);
    --shadow-deep: 0 40px 110px rgba(0, 0, 0, 0.55);
  }
  * { box-sizing: border-box; }
  html { min-width: 320px; background: var(--page); scroll-behavior: smooth; }
  body {
    min-width: 320px;
    margin: 0;
    overflow-x: hidden;
    background: var(--page);
    color: var(--ink);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    line-height: 1.5;
    text-rendering: optimizeLegibility;
  }
  body::before {
    position: fixed;
    inset: 0;
    z-index: -1;
    border: 1px solid transparent;
    background: var(--page);
    content: "";
  }
  button, input, textarea { font: inherit; }
  button:disabled { cursor: wait; opacity: 0.72; }
  a { color: inherit; }
  img { max-width: 100%; }
  .site-shell { min-height: 100svh; overflow: clip; }
  .page-frame { width: min(100% - 48px, 1240px); margin-inline: auto; }
  .header-wrap {
    position: fixed;
    inset: 16px 0 auto;
    z-index: 50;
    pointer-events: none;
  }
  .front-header {
    width: min(calc(100% - 32px), 1240px);
    min-height: 64px;
    margin: 0 auto;
    padding: 8px 9px 8px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--glass);
    box-shadow: inset 0 1px 0 var(--glass-highlight), 0 16px 42px rgba(6, 10, 18, 0.16);
    backdrop-filter: blur(24px) saturate(135%);
    -webkit-backdrop-filter: blur(24px) saturate(135%);
    pointer-events: auto;
  }
  .brand {
    display: inline-flex;
    min-width: 44px;
    min-height: 44px;
    align-items: center;
    gap: 10px;
    color: var(--ink);
    text-decoration: none;
  }
  .terminal-mark {
    width: 36px;
    height: 36px;
    flex: none;
    display: block;
  }
  .terminal-mark img { display: block; width: 100%; height: 100%; }
  .brand-text { min-width: 0; white-space: nowrap; font-size: 17px; font-weight: 780; letter-spacing: 0; }
  .brand-text .domain { color: var(--quiet); font-weight: 580; }
  .nav { display: flex; min-width: 0; align-items: center; justify-content: flex-end; gap: 6px; }
  .nav-link {
    min-width: 44px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 12px;
    color: var(--muted);
    font-size: 14px;
    font-weight: 720;
    text-decoration: none;
  }
  .nav-link:hover { color: var(--ink); }
  .btn, .icon-button {
    min-height: 46px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--glass-strong);
    color: var(--ink);
    font-size: 14px;
    font-weight: 780;
    letter-spacing: 0;
    text-decoration: none;
    cursor: pointer;
    transition: border-color 160ms ease, background 160ms ease, color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
  }
  .btn { display: inline-flex; align-items: center; justify-content: center; padding: 0 17px; white-space: nowrap; }
  .btn.primary { border-color: var(--accent); background: var(--accent); color: #ffffff; box-shadow: 0 12px 28px rgba(38, 88, 217, 0.22); }
  .btn.primary:hover { border-color: var(--accent-strong); background: var(--accent-strong); transform: translateY(-1px); box-shadow: 0 16px 34px rgba(38, 88, 217, 0.26); }
  .btn.secondary:hover, .icon-button:hover { border-color: var(--line-strong); background: var(--surface-strong); transform: translateY(-1px); }
  .icon-button { width: 46px; display: grid; place-items: center; padding: 0; }
  .icon-button svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.9; }
  .theme-moon { display: none; }
  :root[data-theme="dark"] .theme-sun { display: none; }
  :root[data-theme="dark"] .theme-moon { display: block; }
  .eyebrow {
    color: var(--accent);
    font-size: 12px;
    font-weight: 820;
    letter-spacing: 0;
    text-transform: uppercase;
  }
  .footer-frame { width: min(100% - 48px, 1240px); margin-inline: auto; }
  footer {
    min-height: 108px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 13px;
    font-weight: 650;
  }
  .footer-brand { display: inline-flex; align-items: center; gap: 9px; color: var(--ink); font-weight: 780; }
  .footer-mark { width: 24px; height: 24px; display: block; }
  .footer-links { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 14px; }
  .footer-links a { min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; color: var(--muted); text-decoration: none; }
  .footer-links a:hover { color: var(--ink); }
  :focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 40%, transparent); outline-offset: 3px; }
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .front-header { background: var(--surface-strong); }
  }
  @media (prefers-reduced-transparency: reduce) {
    .front-header, .hero-product-picker, .preview-toolbar { background: var(--surface-strong); backdrop-filter: none; -webkit-backdrop-filter: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
  }
  @media (max-width: 720px) {
    .page-frame, .footer-frame { width: min(100% - 32px, 1240px); }
    .header-wrap { top: 10px; }
    .front-header { width: calc(100% - 20px); min-height: 60px; padding: 6px 7px 6px 10px; gap: 8px; }
    .terminal-mark { width: 32px; height: 32px; }
    .nav { gap: 4px; }
    .nav-link { padding: 0 8px; }
    .btn { padding: 0 12px; font-size: 13px; }
    footer { min-height: 0; display: grid; gap: 8px; padding: 24px 0 30px; }
    .footer-links { justify-content: flex-start; gap: 12px; }
  }
  @media (max-width: 520px) {
    .optional-nav { display: none; }
    .header-cta { min-width: 136px; }
  }
  @media (max-width: 360px) {
    .brand-text { display: none; }
  }
`

const themeBootstrap = `<script>(function(){var root=document.documentElement;try{var theme=localStorage.getItem('sm-theme');if(!theme&&window.matchMedia){theme=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}root.setAttribute('data-theme',theme||'light');}catch(error){root.setAttribute('data-theme','light');}})();</script>`

const themeToggleScript = `<script>(function(){var root=document.documentElement,button=document.querySelector('[data-theme-toggle]');if(!button)return;function sync(){var dark=root.getAttribute('data-theme')==='dark';button.setAttribute('aria-pressed',String(dark));button.setAttribute('aria-label',dark?'Use light mode':'Use dark mode');button.setAttribute('title',dark?'Use light mode':'Use dark mode');}sync();button.addEventListener('click',function(){var next=root.getAttribute('data-theme')==='dark'?'light':'dark';root.setAttribute('data-theme',next);try{localStorage.setItem('sm-theme',next);}catch(error){}sync();});})();</script>`

const headerHtml = `${themeBootstrap}
<div class="header-wrap">
  <header class="front-header">
    <a class="brand" href="/" aria-label="SuperMega home">
      <span class="terminal-mark" aria-hidden="true"><img src="/favicon.svg" alt="" width="64" height="64" /></span>
      <span class="brand-text">supermega<span class="domain">.dev</span></span>
    </a>
    <nav class="nav" aria-label="Primary">
      <a class="nav-link optional-nav" href="/work/">Work</a>
      <a class="nav-link optional-nav" href="${shopStartHref}">Shop</a>
      <a class="nav-link optional-nav" href="${plantStartHref}">Plant</a>
      <button class="icon-button" type="button" data-theme-toggle aria-label="Use dark mode" title="Use dark mode"><svg class="theme-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg><svg class="theme-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z"></path></svg></button>
      <a class="btn primary header-cta" href="/contact/">Talk to us</a>
    </nav>
  </header>
</div>
${themeToggleScript}`

const footerHtml = `<div class="footer-frame"><footer>
  <span class="footer-brand"><img class="footer-mark" src="/favicon.svg" alt="" width="64" height="64" /> supermega.dev</span>
  <span class="footer-links"><a href="/work/">Work</a><a href="${shopStartHref}">Shop</a><a href="${plantStartHref}">Plant</a><a href="/contact/">Contact</a><a href="/privacy/">Privacy</a></span>
</footer></div>`

function socialMeta(title, description, url) {
  const safeTitle = String(title).replaceAll('"', '&quot;')
  const safeDescription = String(description).replaceAll('"', '&quot;')
  return `<meta property="og:type" content="website" />\n    <meta property="og:site_name" content="supermega.dev" />\n    <meta property="og:title" content="${safeTitle}" />\n    <meta property="og:description" content="${safeDescription}" />\n    <meta property="og:url" content="${url}" />\n    <meta name="twitter:card" content="summary_large_image" />`
}

function documentHtml({ title, description, canonical, content, style = '' }) {
  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta name="theme-color" content="#090c11" />
    <link rel="canonical" href="${canonical}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="manifest" href="/site.webmanifest" />
    ${socialMeta(title, description, canonical)}
    <style>${sharedStyle}\n${style}</style>
  </head>
  <body>
    ${headerHtml}
    <div class="site-shell">
      ${content}
      ${footerHtml}
    </div>
  </body>
</html>`
}

const liveStatusScript = `<script>(function(){var node=document.querySelector('[data-public-status]');if(!node)return;if(location.hostname==='127.0.0.1'||location.hostname==='localhost'){node.textContent='Demo ready';var localParent=node.closest('[data-status-shell]');if(localParent)localParent.classList.add('is-ready');return;}fetch('/api/health',{cache:'no-store',headers:{accept:'application/json'}}).then(function(response){if(!response.ok)throw new Error('unavailable');return response.json();}).then(function(body){node.textContent=body&&body.ok?'Live demos ready':'Demos available';var parent=node.closest('[data-status-shell]');if(parent)parent.classList.add('is-ready');}).catch(function(){node.textContent='Demos available';});})();</script>`

const homeProductPreviewScript = `<script>(function(){var root=document.querySelector('[data-product-preview]');if(!root)return;var image=root.querySelector('[data-product-preview-image]'),label=root.querySelector('[data-product-preview-label]'),description=root.querySelector('[data-product-preview-description]'),openLink=root.querySelector('[data-preview-open]'),proofLink=root.querySelector('[data-preview-proof-link]'),buttons=Array.from(root.querySelectorAll('[data-product-preview-button]'));if(!image||!label||!description||!openLink||!buttons.length)return;var views={shop:{src:'/live-shop-workspace.png',alt:'Current Shop workspace showing priority checks, sales, cash, customers, and stock',label:'Shop / live workspace',description:'Sales, stock, customers, and daily close in one operating flow.',href:'${shopStartUrl}',cta:'Open Shop demo',proofLabel:'Open the live Shop workspace'},plant:{src:'/live-plant-workspace.png',alt:'Current Plant workspace showing production plan navigation and machine state across two lines',label:'Plant / live workspace',description:'Production plans, machine state, and handoffs in one floor view.',href:'${plantStartUrl}',cta:'Open Plant demo',proofLabel:'Open the live Plant workspace'}};function show(id){var view=views[id];if(!view)return;buttons.forEach(function(button){button.setAttribute('aria-pressed',String(button.getAttribute('data-product-preview-button')===id));});label.textContent=view.label;description.textContent=view.description;openLink.href=view.href;openLink.textContent=view.cta;openLink.setAttribute('aria-label',view.cta);if(proofLink){proofLink.href=view.href;proofLink.setAttribute('aria-label',view.proofLabel);}if(image.getAttribute('data-view')===id)return;image.classList.add('is-switching');image.alt=view.alt;image.setAttribute('data-view',id);image.src=view.src;window.setTimeout(function(){image.classList.remove('is-switching');},360);}image.addEventListener('load',function(){image.classList.remove('is-switching');});buttons.forEach(function(button){button.addEventListener('click',function(){show(button.getAttribute('data-product-preview-button'));});});var preloadDesktop=new Image();preloadDesktop.src=views.plant.src;})();</script>`

const homeHtml = documentHtml({
  title: 'supermega.dev | Shop and Plant, ready for real work.',
  description: 'Try Shop or Plant free — live demos already set up for your trade, nothing to install. When it fits, we set up a private workspace for your team.',
  canonical: 'https://supermega.dev/',
  style: `
    .home-main { width: 100%; overflow: clip; }
    .hero {
      position: relative;
      overflow: clip;
      border-bottom: 1px solid var(--line);
      padding: 112px 0 72px;
      background: var(--surface);
      isolation: isolate;
    }
    .hero::before {
      position: absolute;
      inset: 0;
      z-index: -1;
      background-image: linear-gradient(to right, color-mix(in srgb, var(--line) 55%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--line) 42%, transparent) 1px, transparent 1px);
      background-size: 96px 96px;
      opacity: .38;
      content: "";
    }
    .hero-inner { position: relative; width: min(100% - 48px, 1240px); margin-inline: auto; }
    .hero-stage { display: grid; grid-template-columns: minmax(0, .76fr) minmax(480px, 1.02fr); align-items: center; gap: 76px; }
    .hero-copy { max-width: 540px; padding: 20px 0; animation: copy-in 620ms cubic-bezier(.2,.8,.2,1) both; }
    .hero-command {
      display: inline-flex;
      min-height: 32px;
      align-items: center;
      gap: 9px;
      border-bottom: 1px solid var(--line-strong);
      color: var(--muted);
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .hero-command strong { color: var(--accent); }
    .terminal-cursor { display: inline-block; color: var(--signal); animation: cursor-pulse 1.35s steps(2, end) infinite; }
    .hero-lead { display: block; margin-bottom: 9px; color: var(--ink); font-size: 19px; font-weight: 820; letter-spacing: 0; }
    .hero h1 { max-width: 11ch; margin: 17px 0 0; font-size: 56px; line-height: 1.02; letter-spacing: 0; font-weight: 790; }
    .hero-copy > p { max-width: 42ch; margin: 24px 0 0; color: var(--muted); font-size: 17px; line-height: 1.58; }
    .hero-product-picker { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 26px; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--glass); box-shadow: inset 0 1px 0 var(--glass-highlight); backdrop-filter: blur(20px) saturate(132%); -webkit-backdrop-filter: blur(20px) saturate(132%); }
    .hero-product-picker button { min-height: 76px; display: flex; flex-direction: column; justify-content: center; gap: 4px; border: 0; padding: 12px 15px; background: transparent; color: var(--muted); font: inherit; text-align: left; cursor: pointer; transition: background 160ms ease, color 160ms ease, box-shadow 160ms ease; }
    .hero-product-picker button + button { border-left: 1px solid var(--line); }
    .hero-product-picker button[aria-pressed="true"] { background: var(--surface-strong); color: var(--ink); box-shadow: inset 0 1px 0 var(--glass-highlight), 0 8px 24px rgba(3, 8, 18, 0.08); }
    .picker-label { font-size: 16px; font-weight: 800; line-height: 1.2; }
    .picker-detail { color: var(--quiet); font-size: 12px; font-weight: 650; line-height: 1.3; }
    .hero-product-picker button[aria-pressed="true"] .picker-detail { color: var(--muted); }
    .hero-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 16px; }
    .hero-actions .btn { min-height: 50px; }
    .hero-meta { min-height: 36px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; margin-top: 18px; color: var(--muted); font-size: 12px; font-weight: 720; }
    .hero-status { display: inline-flex; align-items: center; gap: 9px; }
    .hero-note { display: inline-flex; align-items: center; gap: 8px; }
    .hero-note::before { width: 20px; border-top: 1px solid var(--line-strong); content: ""; }
    .hero-setup { display: inline-flex; min-height: 28px; align-items: center; color: var(--accent); font-weight: 780; text-decoration: none; }
    .hero-setup::after { margin-left: 6px; content: "->"; }
    .hero-setup:hover { color: var(--accent-strong); }
    .hero-preview {
      position: relative;
      width: 100%;
      margin: 0;
      border: 1px solid var(--line-strong);
      border-radius: 8px;
      overflow: hidden;
      background: color-mix(in srgb, var(--glass-strong) 88%, transparent);
      box-shadow: inset 0 1px 0 var(--glass-highlight), 0 30px 82px rgba(3, 8, 18, 0.22);
      animation: media-in 820ms 260ms cubic-bezier(.2,.8,.2,1) both;
    }
    .preview-toolbar { min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--line); padding: 7px 16px; background: var(--glass); box-shadow: inset 0 1px 0 var(--glass-highlight); backdrop-filter: blur(22px) saturate(135%); -webkit-backdrop-filter: blur(22px) saturate(135%); }
    .preview-label { min-width: 0; display: inline-flex; align-items: center; gap: 9px; color: var(--muted); font-size: 12px; font-weight: 760; }
    .preview-badge { display: inline-flex; min-height: 28px; align-items: center; border: 1px solid var(--line); border-radius: 6px; padding: 0 9px; color: var(--quiet); font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 10px; font-weight: 780; letter-spacing: 0; text-transform: uppercase; }
    .preview-media { overflow: hidden; background: #071524; }
    .preview-media picture { display: block; }
    .preview-media img { display: block; width: 100%; height: auto; aspect-ratio: 10 / 3; object-fit: contain; object-position: top; opacity: 1; transition: opacity 180ms ease; }
    .preview-media img.is-switching { opacity: .28; }
    .preview-foot { min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-top: 1px solid var(--line); padding: 10px 16px; background: color-mix(in srgb, var(--glass-strong) 86%, transparent); }
    .preview-description { margin: 0; color: var(--muted); font-size: 13px; font-weight: 650; line-height: 1.4; }
    .preview-live { display: inline-flex; flex: none; align-items: center; gap: 7px; color: var(--signal); font-size: 11px; font-weight: 800; white-space: nowrap; }
    .live-dot { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--quiet); box-shadow: 0 0 0 4px color-mix(in srgb, var(--quiet) 16%, transparent); }
    .hero-status.is-ready .live-dot { background: var(--signal); box-shadow: 0 0 0 4px color-mix(in srgb, var(--signal) 16%, transparent); }
    @keyframes copy-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes media-in { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes cursor-pulse { 50% { opacity: .3; } }

    .entry-section { padding: 70px 0 104px; }
    .section-intro { display: grid; grid-template-columns: minmax(0, .9fr) minmax(280px, .55fr); gap: 48px; align-items: end; margin-bottom: 38px; }
    .section-intro h2 { max-width: 15ch; margin: 10px 0 0; font-size: 44px; line-height: 1.08; letter-spacing: 0; }
    .section-intro p { max-width: 42ch; margin: 0; color: var(--muted); font-size: 17px; line-height: 1.55; }
    .destination-list { border-bottom: 1px solid var(--line); }
    .destination {
      min-height: 112px;
      display: grid;
      grid-template-columns: 100px minmax(0, 1fr) 48px;
      align-items: center;
      gap: 24px;
      border-top: 1px solid var(--line);
      padding: 18px 16px 18px 0;
      color: var(--ink);
      text-decoration: none;
      transition: background 180ms ease, padding 180ms ease;
    }
    .destination:hover { padding-left: 16px; background: var(--glass); }
    .destination-index { color: var(--quiet); font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 12px; font-weight: 760; }
    .destination-copy { min-width: 0; display: grid; grid-template-columns: minmax(170px, .45fr) minmax(240px, 1fr); align-items: center; gap: 28px; }
    .destination-copy strong { font-size: 23px; line-height: 1.2; }
    .destination-copy span { color: var(--muted); font-size: 15px; line-height: 1.5; }
    .destination-arrow { display: grid; width: 44px; height: 44px; place-items: center; border: 1px solid var(--line); border-radius: 8px; color: var(--accent); font-size: 20px; transition: border-color 160ms ease, transform 160ms ease; }
    .destination:hover .destination-arrow { border-color: var(--accent); transform: translate(2px, -2px); }

    .brief-band { border-bottom: 1px solid rgba(255,255,255,.14); background: var(--inverse); color: var(--inverse-ink); }
    .brief-inner { padding: 96px 0 100px; }
    .brief-intro { display: grid; grid-template-columns: minmax(0, .92fr) minmax(300px, .56fr); align-items: end; gap: 54px; }
    .brief-intro .eyebrow { color: #8faeff; }
    .brief-intro h2 { max-width: 14ch; margin: 10px 0 0; font-size: 46px; line-height: 1.06; letter-spacing: 0; }
    .brief-intro p { max-width: 43ch; margin: 0; color: var(--inverse-muted); font-size: 17px; line-height: 1.58; }
    .brief-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 54px; border-block: 1px solid rgba(255,255,255,.16); }
    .brief-step { min-height: 172px; padding: 28px 30px 28px 0; }
    .brief-step + .brief-step { border-left: 1px solid rgba(255,255,255,.16); padding-left: 30px; }
    .brief-step span { color: #8faeff; font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 11px; font-weight: 780; }
    .brief-step strong { display: block; margin-top: 15px; color: var(--inverse-ink); font-size: 18px; line-height: 1.3; }
    .brief-step p { max-width: 31ch; margin: 8px 0 0; color: var(--inverse-muted); font-size: 14px; line-height: 1.55; }
    .brief-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 18px; margin-top: 30px; }
    .brief-actions .btn.primary { box-shadow: 0 14px 34px rgba(38, 88, 217, 0.28); }
    .brief-aside { color: var(--inverse-muted); font-size: 13px; font-weight: 650; }

    .trade-section { padding: 0 0 104px; }
    .trade-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(172px, 1fr)); gap: 10px; }
    .trade-chip {
      min-height: 58px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0 16px;
      background: var(--glass-strong);
      box-shadow: inset 0 1px 0 var(--glass-highlight);
      color: var(--ink);
      font-size: 14.5px;
      font-weight: 760;
      text-decoration: none;
      transition: border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
    }
    .trade-chip::after { color: var(--accent); font-weight: 800; content: "->"; transition: transform 160ms ease; }
    .trade-chip:hover { border-color: var(--accent); transform: translateY(-1px); box-shadow: 0 10px 26px rgba(38, 88, 217, 0.14); }
    .trade-chip:hover::after { transform: translateX(2px); }
    .trade-note { max-width: 62ch; margin: 18px 0 0; color: var(--muted); font-size: 14px; line-height: 1.55; }
    .trade-note a { color: var(--accent); font-weight: 760; text-decoration: none; }
    .trade-note a:hover { color: var(--accent-strong); }

    @media (max-width: 980px) {
      .hero { padding: 106px 0 58px; }
      .hero-stage { grid-template-columns: 1fr; gap: 32px; }
      .hero-copy { max-width: 700px; padding: 0; }
      .hero h1 { font-size: 50px; }
      .hero-preview { max-width: 820px; }
      .section-intro { grid-template-columns: 1fr; gap: 18px; }
      .destination-copy { grid-template-columns: minmax(160px, .5fr) 1fr; }
      .brief-intro { grid-template-columns: 1fr; gap: 18px; }
    }
    @media (max-height: 800px) and (min-width: 721px) {
      .hero { padding-top: 98px; padding-bottom: 48px; }
      .hero h1 { font-size: 50px; }
    }
    @media (max-width: 720px) {
      .hero { padding: 96px 0 42px; }
      .hero-inner { width: min(100% - 32px, 1240px); }
      .hero-stage { gap: 26px; }
      .hero h1 { max-width: 12ch; margin-top: 14px; font-size: 40px; line-height: 1.04; }
      .hero-lead { margin-bottom: 7px; font-size: 17px; }
      .hero-copy > p { max-width: 38ch; margin-top: 20px; font-size: 15px; line-height: 1.5; }
      .hero-product-picker { margin-top: 22px; }
      .hero-product-picker button { min-height: 70px; padding-inline: 12px; }
      .picker-label { font-size: 15px; }
      .picker-detail { font-size: 11px; }
      .hero-actions { gap: 8px; margin-top: 14px; }
      .hero-actions .btn { min-height: 46px; flex: 1 1 140px; }
      .hero-meta { gap: 8px 14px; }
      .preview-toolbar { min-height: 52px; padding-inline: 12px; }
      .preview-badge { min-height: 26px; padding-inline: 8px; font-size: 9px; }
      .preview-foot { min-height: 0; align-items: flex-start; padding: 10px 12px; }
      .preview-description { font-size: 12px; }
      .preview-live { padding-top: 2px; font-size: 10px; }
      .entry-section { padding: 40px 0 74px; }
      .trade-section { padding-bottom: 74px; }
      .trade-grid { grid-template-columns: repeat(auto-fill, minmax(142px, 1fr)); gap: 8px; }
      .trade-chip { min-height: 54px; padding: 0 13px; font-size: 13.5px; }
      .section-intro { margin-bottom: 34px; }
      .section-intro h2 { font-size: 36px; }
      .section-intro p { font-size: 16px; }
      .destination { min-height: 126px; grid-template-columns: 1fr 44px; gap: 14px; padding: 20px 0; }
      .destination:hover { padding-left: 0; }
      .destination-index { grid-column: 1; }
      .destination-copy { grid-column: 1; display: grid; grid-template-columns: 1fr; gap: 5px; }
      .destination-copy strong { font-size: 21px; }
      .destination-copy span { font-size: 14px; }
      .destination-arrow { grid-column: 2; grid-row: 1 / span 2; align-self: center; }
      .brief-inner { padding: 72px 0 76px; }
      .brief-intro h2 { font-size: 37px; }
      .brief-intro p { font-size: 16px; }
      .brief-steps { grid-template-columns: 1fr; margin-top: 38px; }
      .brief-step { min-height: 0; padding: 24px 0; }
      .brief-step + .brief-step { border-top: 1px solid rgba(255,255,255,.16); border-left: 0; padding-left: 0; }
    }
    @media (max-width: 390px) {
      .hero-command { font-size: 11px; }
      .hero h1 { font-size: 37px; }
    }
  `,
  content: `<main class="home-main">
  <section class="hero" data-hero aria-labelledby="portfolio-heading">
    <div class="hero-inner" data-product-preview>
      <div class="hero-stage">
        <div class="hero-copy">
          <div class="hero-command"><strong>&gt;<span class="terminal-cursor">_</span></strong><span>operational software / live</span></div>
          <h1 id="portfolio-heading">Run the day. Keep the handoffs.</h1>
          <p><strong class="hero-lead">Shop and Plant, ready for real work.</strong> Try a live workspace free and see the real flow first. When it fits, we set up a private one for your team.</p>
          <div class="hero-product-picker" role="group" aria-label="Choose a live workspace">
            <button type="button" data-product-preview-button="shop" aria-pressed="true"><span class="picker-label">Shop</span><span class="picker-detail">Sales, stock, and daily close</span></button>
            <button type="button" data-product-preview-button="plant" aria-pressed="false"><span class="picker-label">Plant</span><span class="picker-detail">Floor, maintenance, and handoffs</span></button>
          </div>
          <div class="hero-actions">
            <a class="btn primary" data-preview-open aria-label="Open Shop demo" href="${shopStartHref}">Open Shop demo</a>
            <a class="btn secondary" href="/work/">See it in use</a>
          </div>
          <div class="hero-meta"><span class="hero-status" data-status-shell><span class="live-dot" aria-hidden="true"></span><span data-public-status aria-live="polite">Checking live demos</span></span><span class="hero-note">Free trial</span><span class="hero-note">No signup</span><a class="hero-setup" href="/contact/?from=homepage-private-setup">Private setup</a></div>
        </div>
        <div class="hero-preview">
          <div class="preview-toolbar">
            <span class="preview-label"><span class="live-dot" aria-hidden="true"></span><span data-product-preview-label aria-live="polite">Shop / live workspace</span></span>
            <span class="preview-badge">Current demo</span>
          </div>
          <div class="preview-media"><img data-product-preview-image data-view="shop" src="/live-shop-workspace.png" alt="Current Shop workspace showing priority checks, sales, cash, customers, and stock" width="1600" height="480" fetchpriority="high" /></div>
          <div class="preview-foot"><p class="preview-description" data-product-preview-description>Sales, stock, customers, and daily close in one operating flow.</p><span class="preview-live"><span class="live-dot" aria-hidden="true"></span>LIVE</span></div>
        </div>
      </div>
    </div>
  </section>

  <section class="entry-section page-frame" id="workspaces" aria-labelledby="workspaces-heading">
    <div class="section-intro">
      <div><div class="eyebrow">Two working systems</div><h2 id="workspaces-heading">Start with the work that matters.</h2></div>
      <p>Shop takes the commercial loop. Plant gives the floor one shared record. Private workspaces add supervised, data-grounded decision support after approved sources are connected.</p>
    </div>
    <div class="destination-list">
      <a class="destination" href="${shopStartHref}" aria-label="Try Shop live"><span class="destination-index">01 / SHOP</span><span class="destination-copy"><strong>Shop</strong><span>Sales, stock, customers, receivables, purchasing, and daily close in one operating flow.</span></span><span class="destination-arrow" aria-hidden="true">&#8594;</span></a>
      <a class="destination" href="${plantStartHref}" aria-label="Try Plant live"><span class="destination-index">02 / PLANT</span><span class="destination-copy"><strong>Plant</strong><span>Production plans, machine state, maintenance, quality, and handoff history in one floor view.</span></span><span class="destination-arrow" aria-hidden="true">&#8594;</span></a>
    </div>
  </section>

  <section class="trade-section page-frame" id="your-trade" aria-labelledby="trade-heading">
    <div class="section-intro">
      <div><div class="eyebrow">Free trial / your trade</div><h2 id="trade-heading">Open a demo of your business.</h2></div>
      <p>Pick your trade. The demo opens already set up — services, prices, and a daily close — free to try on your phone. Nothing to install.</p>
    </div>
    <nav class="trade-grid" aria-label="Open a live Shop demo for your trade">
      <a class="trade-chip" href="https://pos.supermega.dev/?demo=spa">Massage &amp; spa</a>
      <a class="trade-chip" href="https://pos.supermega.dev/?demo=salon">Hair &amp; beauty salon</a>
      <a class="trade-chip" href="https://pos.supermega.dev/?demo=retail">Shop &amp; minimart</a>
      <a class="trade-chip" href="https://pos.supermega.dev/?demo=cafe">Cafe &amp; tea shop</a>
      <a class="trade-chip" href="https://pos.supermega.dev/?demo=restaurant">Restaurant</a>
      <a class="trade-chip" href="https://pos.supermega.dev/?demo=pharmacy">Pharmacy</a>
      <a class="trade-chip" href="https://pos.supermega.dev/?demo=clinic">Clinic &amp; dental</a>
      <a class="trade-chip" href="https://pos.supermega.dev/?demo=gym">Gym &amp; fitness</a>
      <a class="trade-chip" href="https://pos.supermega.dev/?demo=service">Service &amp; repair</a>
      <a class="trade-chip" href="https://pos.supermega.dev/?demo=school">Tuition &amp; school</a>
      <a class="trade-chip" href="https://pos.supermega.dev/?demo=laundry">Laundry</a>
    </nav>
    <p class="trade-note">Run a factory, workshop, or distribution route? <a href="${plantStartHref}">Open Plant instead</a> — or <a href="/contact/?from=homepage-your-trade">tell us your trade</a> and we set one up.</p>
  </section>

  <section class="brief-band" id="start" aria-labelledby="brief-heading">
    <div class="brief-inner page-frame">
      <div class="brief-intro">
        <div><div class="eyebrow">Need a different route?</div><h2 id="brief-heading">Bring us the handoff that still breaks.</h2></div>
        <p>Send one real example: a file, approval, repeated decision, or browser task. We build the smallest useful path, connect only approved sources, and keep consequential actions reviewable.</p>
      </div>
      <div class="brief-steps">
        <div class="brief-step"><span>01 / INPUT</span><strong>Bring the real example</strong><p>Share the file, screen, people, and handoff that create the work.</p></div>
        <div class="brief-step"><span>02 / BOUNDARY</span><strong>Set the limits</strong><p>Name the sources, exceptions, and approvals that cannot disappear.</p></div>
        <div class="brief-step"><span>03 / PROOF</span><strong>Run it on your workflow</strong><p>See the result before private setup or approved data is added.</p></div>
      </div>
      <div class="brief-actions">
        <a class="btn primary" href="/contact/">Start with one workflow</a>
        <span class="brief-aside">One useful example is enough to start.</span>
      </div>
    </div>
  </section>
</main>
${liveStatusScript}
${homeProductPreviewScript}`,
})

const workHtml = documentHtml({
  title: 'Work | supermega.dev',
  description: 'See how SuperMega Shop and Plant turn daily operating work into clear, connected workflows.',
  canonical: 'https://supermega.dev/work/',
  style: `
    .work-main { width: 100%; overflow: clip; }
    .work-hero { position: relative; overflow: clip; border-bottom: 1px solid var(--line); background: var(--surface); isolation: isolate; }
    .work-hero::before { position: absolute; inset: 0; z-index: -1; background-image: linear-gradient(to right, color-mix(in srgb, var(--line) 55%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--line) 42%, transparent) 1px, transparent 1px); background-size: 96px 96px; opacity: .38; content: ""; }
    .work-hero-inner { position: relative; width: min(100% - 48px, 1240px); margin-inline: auto; padding: 112px 0 72px; }
    .work-stage { display: grid; grid-template-columns: minmax(0, .76fr) minmax(480px, 1.02fr); align-items: center; gap: 76px; }
    .work-copy { max-width: 540px; padding: 20px 0; animation: work-in 640ms cubic-bezier(.2,.8,.2,1) both; }
    .work-command { color: var(--accent); font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 12px; font-weight: 800; text-transform: uppercase; }
    .work-copy h1 { max-width: 11ch; margin: 16px 0 0; font-size: 56px; line-height: 1.02; letter-spacing: 0; }
    .work-copy > p { max-width: 40ch; margin: 24px 0 0; color: var(--muted); font-size: 17px; line-height: 1.58; }
    .work-product-picker { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 26px; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--glass); box-shadow: inset 0 1px 0 var(--glass-highlight); backdrop-filter: blur(20px) saturate(132%); -webkit-backdrop-filter: blur(20px) saturate(132%); }
    .work-product-picker button { min-height: 76px; display: flex; flex-direction: column; justify-content: center; gap: 4px; border: 0; padding: 12px 15px; background: transparent; color: var(--muted); font: inherit; text-align: left; cursor: pointer; transition: background 160ms ease, color 160ms ease, box-shadow 160ms ease; }
    .work-product-picker button + button { border-left: 1px solid var(--line); }
    .work-product-picker button[aria-pressed="true"] { background: var(--surface-strong); color: var(--ink); box-shadow: inset 0 1px 0 var(--glass-highlight), 0 8px 24px rgba(3, 8, 18, 0.08); }
    .work-picker-label { font-size: 16px; font-weight: 800; line-height: 1.2; }
    .work-picker-detail { color: var(--quiet); font-size: 12px; font-weight: 650; line-height: 1.3; }
    .work-product-picker button[aria-pressed="true"] .work-picker-detail { color: var(--muted); }
    .work-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
    .work-actions .btn { min-height: 50px; }
    .work-proof { width: 100%; margin: 0; overflow: hidden; border: 1px solid var(--line-strong); border-radius: 8px; background: color-mix(in srgb, var(--glass-strong) 88%, transparent); box-shadow: inset 0 1px 0 var(--glass-highlight), 0 30px 82px rgba(3, 8, 18, 0.22); animation: work-in 820ms 180ms cubic-bezier(.2,.8,.2,1) both; }
    .work-proof-toolbar { min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--line); padding: 7px 16px; background: var(--glass); box-shadow: inset 0 1px 0 var(--glass-highlight); backdrop-filter: blur(22px) saturate(135%); -webkit-backdrop-filter: blur(22px) saturate(135%); }
    .work-proof-label { display: inline-flex; min-width: 0; align-items: center; gap: 9px; color: var(--muted); font-size: 12px; font-weight: 760; }
    .work-proof-label::before { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--signal); box-shadow: 0 0 0 4px color-mix(in srgb, var(--signal) 16%, transparent); content: ""; }
    .work-proof-badge { display: inline-flex; min-height: 28px; align-items: center; border: 1px solid var(--line); border-radius: 6px; padding: 0 9px; color: var(--quiet); font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 10px; font-weight: 780; letter-spacing: 0; text-transform: uppercase; }
    .work-proof-link { display: block; }
    .work-proof img { display: block; width: 100%; height: auto; aspect-ratio: 10 / 3; object-fit: contain; object-position: top; }
    .work-proof-foot { min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-top: 1px solid var(--line); padding: 10px 16px; background: color-mix(in srgb, var(--glass-strong) 86%, transparent); }
    .work-proof-description { margin: 0; color: var(--muted); font-size: 13px; font-weight: 650; line-height: 1.4; }
    .work-proof-state { display: inline-flex; flex: none; align-items: center; gap: 7px; color: var(--signal); font-size: 11px; font-weight: 800; white-space: nowrap; }
    .work-proof-state::before { width: 8px; height: 8px; border-radius: 50%; background: var(--signal); box-shadow: 0 0 0 4px color-mix(in srgb, var(--signal) 16%, transparent); content: ""; }
    @keyframes work-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

    .case-band { border-bottom: 1px solid var(--line); padding: 84px 0 92px; }
    .case-band.alt { background: var(--surface); }
    .case-inner { width: min(100% - 48px, 1240px); margin-inline: auto; }
    .case-head { display: grid; grid-template-columns: minmax(220px, .45fr) minmax(0, 1fr); gap: 64px; align-items: start; }
    .case-label { display: grid; gap: 10px; }
    .case-index { color: var(--accent); font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 12px; font-weight: 800; }
    .case-label h2 { margin: 0; font-size: 42px; line-height: 1.08; letter-spacing: 0; }
    .case-copy { display: grid; grid-template-columns: minmax(0, .95fr) minmax(260px, .72fr); gap: 48px; }
    .case-copy > p { max-width: 43ch; margin: 0; color: var(--muted); font-size: 18px; line-height: 1.62; }
    .case-points { margin: 0; border-bottom: 1px solid var(--line); }
    .case-point { min-height: 52px; display: grid; grid-template-columns: 94px minmax(0, 1fr) 24px; align-items: center; gap: 16px; border-top: 1px solid var(--line); color: var(--ink); text-decoration: none; transition: background 160ms ease; }
    .case-point-label { color: var(--quiet); font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 11px; font-weight: 760; text-transform: uppercase; }
    .case-point strong { min-width: 0; font-size: 14px; font-weight: 720; }
    .case-point-arrow { color: var(--accent); font-size: 17px; text-align: center; transition: transform 160ms ease; }
    .case-point:hover { background: var(--glass); }
    .case-point:hover .case-point-arrow { transform: translateX(3px); }
    .case-media { margin-top: 44px; overflow: hidden; border: 1px solid var(--line-strong); border-radius: 8px; background: #071524; box-shadow: var(--shadow-deep); }
    .case-toolbar { min-height: 54px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--line); padding: 6px 8px 6px 16px; background: var(--glass); backdrop-filter: blur(22px) saturate(135%); -webkit-backdrop-filter: blur(22px) saturate(135%); }
    .case-toolbar span { display: inline-flex; align-items: center; gap: 9px; color: var(--muted); font-size: 12px; font-weight: 760; }
    .case-toolbar span::before { width: 8px; height: 8px; border-radius: 50%; background: var(--signal); box-shadow: 0 0 0 4px color-mix(in srgb, var(--signal) 16%, transparent); content: ""; }
    .case-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 6px; }
    .case-toolbar .btn { min-height: 44px; }
    .case-media picture { display: block; }
    .case-media img { display: block; width: 100%; height: auto; aspect-ratio: 10 / 3; object-fit: contain; object-position: top; }

    .work-close { background: var(--inverse); color: var(--inverse-ink); }
    .work-close-inner { width: min(100% - 48px, 1240px); margin-inline: auto; display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, .62fr); align-items: end; gap: 72px; padding: 86px 0 92px; }
    .work-close .eyebrow { color: #8faeff; }
    .work-close h2 { max-width: 14ch; margin: 10px 0 0; font-size: 46px; line-height: 1.06; letter-spacing: 0; }
    .work-close-copy p { max-width: 43ch; margin: 0; color: var(--inverse-muted); font-size: 17px; line-height: 1.6; }
    .work-close-copy .btn { margin-top: 26px; min-height: 50px; }

    @media (max-width: 900px) {
      .work-stage, .work-close-inner { grid-template-columns: 1fr; gap: 32px; }
      .work-copy { max-width: 700px; padding: 0; }
      .work-copy h1 { font-size: 50px; }
      .work-proof { max-width: 820px; }
      .case-head { grid-template-columns: 1fr; gap: 26px; }
      .case-copy { grid-template-columns: minmax(0, 1fr) minmax(260px, .72fr); }
    }
    @media (max-width: 720px) {
      .work-hero-inner, .case-inner, .work-close-inner { width: min(100% - 32px, 1240px); }
      .work-hero-inner { padding: 96px 0 42px; }
      .work-stage { gap: 26px; }
      .work-copy h1 { font-size: 40px; }
      .work-copy > p, .case-copy > p { font-size: 16px; }
      .work-product-picker { margin-top: 22px; }
      .work-product-picker button { min-height: 70px; padding-inline: 12px; }
      .work-picker-label { font-size: 15px; }
      .work-picker-detail { font-size: 11px; }
      .work-actions .btn { flex: 1 1 140px; min-height: 46px; }
      .work-proof { width: 100%; }
      .work-proof-toolbar { min-height: 52px; padding-inline: 12px; }
      .work-proof-badge { min-height: 26px; padding-inline: 8px; font-size: 9px; }
      .work-proof-foot { min-height: 0; align-items: flex-start; padding: 10px 12px; }
      .work-proof-description { font-size: 12px; }
      .work-proof-state { padding-top: 2px; font-size: 10px; }
      .case-band { padding: 60px 0 66px; }
      .case-label h2 { font-size: 34px; }
      .case-copy { grid-template-columns: 1fr; gap: 28px; }
      .case-media { margin-top: 32px; }
      .case-toolbar { min-height: 52px; padding-left: 12px; }
      .case-toolbar .btn { min-height: 44px; }
      .case-media { background: #071524; }
      .case-media img { width: min(100% - 28px, 320px); max-width: 320px; margin-inline: auto; aspect-ratio: 360 / 732; object-fit: contain; }
      .work-close-inner { padding: 68px 0 74px; }
      .work-close h2 { font-size: 37px; }
      .work-close-copy p { font-size: 16px; }
    }
  `,
  content: `<main class="work-main">
  <section class="work-hero" aria-labelledby="work-heading">
    <div class="work-hero-inner">
      <div class="work-stage" data-product-preview>
        <div class="work-copy">
          <div class="work-command">&gt;_ work / live systems</div>
          <h1 id="work-heading">See the work before the pitch.</h1>
          <p>Open Shop or Plant in the same tab and follow a real operating path. The demo is there to use, not just look at.</p>
          <div class="work-product-picker" role="group" aria-label="Choose a live workspace">
            <button type="button" data-product-preview-button="shop" aria-pressed="true"><span class="work-picker-label">Shop</span><span class="work-picker-detail">Sales, stock, and daily close</span></button>
            <button type="button" data-product-preview-button="plant" aria-pressed="false"><span class="work-picker-label">Plant</span><span class="work-picker-detail">Floor, maintenance, and handoffs</span></button>
          </div>
          <div class="work-actions"><a class="btn primary" data-preview-open aria-label="Open Shop demo" href="${shopStartHref}">Open Shop demo</a><a class="btn secondary" href="/contact/?from=homepage-private-setup">Private setup</a></div>
        </div>
        <div class="work-proof">
          <div class="work-proof-toolbar"><span class="work-proof-label" data-product-preview-label aria-live="polite">Shop / live workspace</span><span class="work-proof-badge">Current demo</span></div>
          <a class="work-proof-link" data-preview-proof-link href="${shopStartHref}" aria-label="Open the live Shop workspace"><img data-product-preview-image data-view="shop" src="/live-shop-workspace.png" alt="Current Shop workspace showing priority checks, sales, cash, customers, and stock" width="1600" height="480" fetchpriority="high" /></a>
          <div class="work-proof-foot"><p class="work-proof-description" data-product-preview-description>Sales, stock, customers, and daily close in one operating flow.</p><span class="work-proof-state">LIVE</span></div>
        </div>
      </div>
    </div>
  </section>

  <section class="case-band" aria-labelledby="shop-case-heading">
    <div class="case-inner">
      <div class="case-head">
        <div class="case-label"><span class="case-index">01 / SHOP</span><h2 id="shop-case-heading">Keep the day together.</h2></div>
        <div class="case-copy"><p>Sales, customers, stock, receivables, and books stay in one operating flow. The useful next action is visible without turning the owner into the integration layer.</p><div class="case-points" aria-label="Try a Shop workflow"><a class="case-point" href="https://app.supermega.dev/?demo=shop&amp;returnTo=%2Fsales" aria-label="Try a new sale in the live Shop demo"><span class="case-point-label">Sell</span><strong>Fast sale and customer flow</strong><span class="case-point-arrow" aria-hidden="true">&rarr;</span></a><a class="case-point" href="https://app.supermega.dev/?demo=shop&amp;returnTo=%2Fbooks%3Ftab%3Dreorder" aria-label="Try stock reorder in the live Shop demo"><span class="case-point-label">Control</span><strong>Stock, cash, and money owed</strong><span class="case-point-arrow" aria-hidden="true">&rarr;</span></a><a class="case-point" href="https://app.supermega.dev/?demo=shop&amp;returnTo=%2Fsales%3Fview%3Dclose" aria-label="Try Daily Close in the live Shop demo"><span class="case-point-label">Close</span><strong>Daily handoff with variance</strong><span class="case-point-arrow" aria-hidden="true">&rarr;</span></a></div></div>
      </div>
      <div class="case-media"><div class="case-toolbar"><span>Shop workspace / live</span><div class="case-actions"><a class="btn secondary" href="${shopStartHref}" aria-label="Try the live Shop workspace">Try live</a><a class="btn primary" href="/contact/?from=shop-workspace" aria-label="Request a private Shop workspace">Request</a></div></div><picture><source media="(max-width: 720px)" srcset="/live-shop-mobile.png" /><img src="/live-shop-workspace.png" alt="Current Shop workspace showing priority checks, sales, cash, customers, and stock" width="1600" height="480" loading="lazy" /></picture></div>
    </div>
  </section>

  <section class="case-band alt" aria-labelledby="plant-case-heading">
    <div class="case-inner">
      <div class="case-head">
        <div class="case-label"><span class="case-index">02 / PLANT</span><h2 id="plant-case-heading">Give the floor a memory.</h2></div>
        <div class="case-copy"><p>Production targets, material readiness, machine state, breakdowns, and handoffs stay connected. The next shift sees the plan, what happened, and what still needs attention.</p><div class="case-points" aria-label="Try a Plant workflow"><a class="case-point" href="https://app.supermega.dev/?demo=plant&amp;returnTo=%2Fplan" aria-label="Try production planning in the live Plant demo"><span class="case-point-label">Plan</span><strong>Targets, material readiness, and owner</strong><span class="case-point-arrow" aria-hidden="true">&rarr;</span></a><a class="case-point" href="https://app.supermega.dev/?demo=plant&amp;returnTo=%2Ffactory" aria-label="Try the live Plant floor"><span class="case-point-label">See</span><strong>Floor state and line readiness</strong><span class="case-point-arrow" aria-hidden="true">&rarr;</span></a><a class="case-point" href="https://app.supermega.dev/?demo=plant&amp;returnTo=%2Fhandoff" aria-label="Try shift handoff in the live Plant demo"><span class="case-point-label">Handoff</span><strong>Accountable next-shift brief</strong><span class="case-point-arrow" aria-hidden="true">&rarr;</span></a></div></div>
      </div>
      <div class="case-media"><div class="case-toolbar"><span>Plant workspace / live</span><div class="case-actions"><a class="btn secondary" href="${plantStartHref}" aria-label="Try the live Plant workspace">Try live</a><a class="btn primary" href="/contact/?from=plant-workspace" aria-label="Request a private Plant workspace">Request</a></div></div><picture><source media="(max-width: 720px)" srcset="/live-plant-mobile.png" /><img src="/live-plant-workspace.png" alt="Current Plant workspace showing production plan navigation and machine state across two lines" width="1600" height="480" loading="lazy" /></picture></div>
    </div>
  </section>

  <section class="work-close" aria-labelledby="work-close-heading">
    <div class="work-close-inner"><div><div class="eyebrow">Your operation, not another catalog</div><h2 id="work-close-heading">One useful workflow is enough to start.</h2></div><div class="work-close-copy"><p>When Shop or Plant is close but not exact, show us the real handoff, file, or repeated decision. We will shape the smallest route worth proving and keep consequential actions reviewable.</p><a class="btn primary" href="/contact/">Describe the workflow</a></div></div>
  </section>
</main>
${homeProductPreviewScript}`,
})

const contactHtml = documentHtml({
  title: 'Contact | supermega.dev',
  description: 'Tell SuperMega what needs to work better.',
  canonical: 'https://supermega.dev/contact/',
  style: `
    .header-cta { display: none; }
    .contact-main { width: min(100% - 48px, 1240px); margin-inline: auto; display: grid; grid-template-areas: "intro form" "support form"; grid-template-columns: minmax(0, .78fr) minmax(420px, 1.22fr); grid-template-rows: auto 1fr; column-gap: 84px; row-gap: 40px; align-items: start; padding: 142px 0 94px; }
    .contact-intro { grid-area: intro; padding-top: 26px; }
    .contact-support { grid-area: support; }
    .contact-intro, .contact-support, .contact-form { animation: contact-in 620ms cubic-bezier(.2,.8,.2,1) both; }
    .contact-form { animation-delay: 110ms; }
    @keyframes contact-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
    .contact-command { color: var(--accent); font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 14px; font-weight: 800; }
    .contact-intro h1 { max-width: 11ch; margin: 16px 0 20px; font-size: 54px; line-height: 1.04; letter-spacing: 0; }
    .contact-intro > p { max-width: 37ch; margin: 0; color: var(--muted); font-size: 18px; line-height: 1.58; }
    .contact-direct { border-bottom: 1px solid var(--line); }
    .contact-direct a { min-height: 56px; display: grid; grid-template-columns: 76px 1fr auto; align-items: center; gap: 14px; border-top: 1px solid var(--line); color: var(--ink); font-size: 14px; text-decoration: none; }
    .contact-direct a span:first-child { color: var(--quiet); font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 11px; text-transform: uppercase; }
    .contact-direct a span:last-child { color: var(--accent); }
    .contact-next { margin-top: 32px; border-top: 1px solid var(--line); }
    .contact-next h2 { margin: 0; padding: 20px 0 12px; color: var(--ink); font-size: 14px; line-height: 1.25; }
    .contact-next-list { list-style: none; margin: 0; padding: 0; border-bottom: 1px solid var(--line); }
    .contact-next-item { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 12px; padding: 15px 0; }
    .contact-next-item + .contact-next-item { border-top: 1px solid var(--line); }
    .contact-next-index { color: var(--accent); font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 11px; font-weight: 800; }
    .contact-next-item strong { display: block; color: var(--ink); font-size: 14px; line-height: 1.35; }
    .contact-next-item p { max-width: 35ch; margin: 4px 0 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
    .contact-form { grid-area: form; display: grid; gap: 20px; border: 1px solid var(--line); border-radius: 8px; padding: 32px; background: var(--glass); box-shadow: var(--shadow); backdrop-filter: blur(24px) saturate(130%); -webkit-backdrop-filter: blur(24px) saturate(130%); }
    .contact-form-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }
    .contact-form h2 { margin: 0; font-size: 20px; line-height: 1.2; }
    .form-ready { display: inline-flex; align-items: center; gap: 7px; color: var(--signal); font-size: 12px; font-weight: 760; }
    .form-ready::before { width: 8px; height: 8px; border-radius: 50%; background: var(--signal); content: ""; }
    .contact-product-choice { min-inline-size: 0; margin: 0; border: 0; padding: 0; }
    .contact-product-choice[hidden] { display: none; }
    .contact-product-choice legend { margin: 0 0 10px; padding: 0; color: var(--muted); font-size: 12px; font-weight: 780; letter-spacing: 0; text-transform: uppercase; }
    .workspace-choice { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); overflow: hidden; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); box-shadow: inset 0 1px 0 var(--glass-highlight); }
    .workspace-choice button { min-height: 68px; display: flex; flex-direction: column; justify-content: center; gap: 4px; border: 0; padding: 10px 12px; background: transparent; color: var(--muted); font: inherit; text-align: left; cursor: pointer; transition: background 160ms ease, color 160ms ease, box-shadow 160ms ease; }
    .workspace-choice button + button { border-left: 1px solid var(--line); }
    .workspace-choice button[aria-pressed="true"] { background: var(--surface-strong); color: var(--ink); box-shadow: inset 0 1px 0 var(--glass-highlight), 0 8px 22px rgba(3, 8, 18, 0.08); }
    .workspace-choice strong { font-size: 14px; line-height: 1.2; }
    .workspace-choice span { color: var(--quiet); font-size: 11px; font-weight: 650; line-height: 1.3; }
    .workspace-choice button[aria-pressed="true"] span { color: var(--muted); }
    .field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .field-grid label { display: grid; gap: 8px; color: var(--muted); font-size: 12px; font-weight: 780; letter-spacing: 0; text-transform: uppercase; }
    .field-grid label.wide { grid-column: 1 / -1; }
    .field-grid input, .field-grid textarea { width: 100%; min-width: 0; border: 1px solid var(--line); border-radius: 8px; padding: 13px 14px; background: var(--surface); color: var(--ink); font: inherit; font-size: 16px; letter-spacing: 0; text-transform: none; transition: border-color 160ms ease, background 160ms ease; }
    .field-grid textarea { min-height: 156px; resize: vertical; }
    .field-grid input:focus, .field-grid textarea:focus { outline: 3px solid color-mix(in srgb, var(--accent) 24%, transparent); border-color: var(--accent); background: var(--surface-strong); }
    .contact-form button { min-height: 50px; justify-content: center; }
    .contact-policy, .form-status { margin: 0; color: var(--muted); font-size: 13px; font-weight: 650; line-height: 1.5; }
    .form-status { min-height: 1.5em; }
    @media (max-width: 900px) { .contact-main { grid-template-areas: "intro" "form" "support"; grid-template-columns: 1fr; grid-template-rows: auto; row-gap: 36px; } .contact-intro { max-width: 720px; padding-top: 0; } .contact-form { width: 100%; } .contact-support { width: 100%; max-width: 720px; } }
    @media (max-width: 720px) { .contact-main { width: min(100% - 32px, 1240px); row-gap: 30px; padding: 112px 0 64px; } .contact-intro h1 { max-width: 10ch; font-size: 40px; } .contact-intro > p { font-size: 16px; } .contact-next { margin-top: 28px; } .contact-form { padding: 20px; } .workspace-choice button { min-height: 64px; padding-inline: 10px; } .workspace-choice strong { font-size: 13px; } .workspace-choice span { font-size: 10px; } .field-grid { grid-template-columns: 1fr; } .field-grid label.wide { grid-column: auto; } }
  `,
  content: `<main class="contact-main">
  <section class="contact-intro" aria-label="Contact SuperMega">
    <div class="contact-command" data-contact-command>&gt;_ direct / contact</div>
    <h1 data-contact-heading>What should run better?</h1>
    <p data-contact-intro>Send one real example. We will reply with the clearest next step, not a generic demo.</p>
  </section>
  <form class="contact-form" action="/api/contact-submissions" data-sm-contact-form method="post">
    <input type="hidden" name="source_url" value="https://supermega.dev/contact/" />
    <input type="hidden" name="page_path" value="/contact/" />
    <input type="hidden" name="referrer" value="" />
    <input type="hidden" name="utm_source" value="" />
    <input type="hidden" name="utm_medium" value="" />
    <input type="hidden" name="utm_campaign" value="" />
    <input type="hidden" name="utm_content" value="" />
    <input type="hidden" name="utm_term" value="" />
    <div class="contact-form-header"><h2 data-contact-form-heading>Send a request</h2><span class="form-ready">Ready</span></div>
    <fieldset class="contact-product-choice" data-workspace-choice hidden>
      <legend>Choose the first workspace</legend>
      <div class="workspace-choice" role="group" aria-label="Choose the first workspace">
        <button type="button" data-workspace-choice-button="shop" aria-pressed="false"><strong>Shop</strong><span>Sales and close</span></button>
        <button type="button" data-workspace-choice-button="plant" aria-pressed="false"><strong>Plant</strong><span>Floor and handoff</span></button>
        <button type="button" data-workspace-choice-button="guide" aria-pressed="false"><strong>Guide me</strong><span>We will help choose</span></button>
      </div>
    </fieldset>
    <div class="field-grid">
      <label>Name<input autocomplete="name" name="name" required /></label>
      <label>Work email<input autocomplete="email" name="email" required type="email" /></label>
      <label class="wide">Company<input autocomplete="organization" name="company" required /></label>
      <label class="wide"><span data-contact-goal-label>What do you need?</span><textarea name="goal" required></textarea></label>
    </div>
    <input autocomplete="off" name="website" style="display:none" tabindex="-1" />
    <button class="btn primary" type="submit" data-contact-submit>Send request</button>
    <p class="contact-policy" data-contact-policy>We use this note to recommend the clearest next step. No account or data connection is made before you approve it.</p>
    <p class="form-status" data-contact-status aria-live="polite"></p>
  </form>
  <section class="contact-support" aria-labelledby="contact-next-heading">
    <div class="contact-direct" aria-label="Direct contact options">
      <a href="viber://chat?number=%2B9595000721"><span>Viber</span><strong>Chat directly</strong><span aria-hidden="true">&#8599;</span></a>
      <a href="mailto:swanhtet@supermega.dev"><span>Email</span><strong>swanhtet@supermega.dev</strong><span aria-hidden="true">&#8594;</span></a>
      <a href="tel:+9595000721"><span>Phone</span><strong>+95 9 500 0721</strong><span aria-hidden="true">&#8594;</span></a>
    </div>
    <section class="contact-next" aria-labelledby="contact-next-heading">
      <h2 id="contact-next-heading">What happens next</h2>
      <ol class="contact-next-list">
        <li class="contact-next-item"><span class="contact-next-index">01</span><div><strong>We read the handoff</strong><p>A short note, screen, or repeat task is enough to understand the constraint.</p></div></li>
        <li class="contact-next-item"><span class="contact-next-index">02</span><div><strong>We name the smallest next step</strong><p>That can be a live Shop or Plant path, or a scoped workflow worth proving.</p></div></li>
        <li class="contact-next-item"><span class="contact-next-index">03</span><div><strong>You approve before setup</strong><p>No account, data connection, or external action starts without approval.</p></div></li>
      </ol>
    </section>
  </section>
</main>
<script>(function(){
  var form=document.querySelector('[data-sm-contact-form]');
  if(!form)return;
  var search=new URLSearchParams(window.location.search);
  var entryIntent=search.get('from')||'';
  var workspaceProduct=entryIntent==='shop-workspace'?'Shop':entryIntent==='plant-workspace'?'Plant':'';
  var privateSetupIntent=entryIntent==='homepage-private-setup';
  var submit=form.querySelector('[data-contact-submit]');
  var goal=form.querySelector('[name="goal"]');
  var workspaceChoice=form.querySelector('[data-workspace-choice]');
  var workspaceChoiceButtons=Array.prototype.slice.call(form.querySelectorAll('[data-workspace-choice-button]'));
  var workspaceFocus='';
  var initialWorkspaceChoice=workspaceProduct?workspaceProduct.toLowerCase():'';
  var idleSubmitLabel='Send request';
  function text(selector,value){var element=document.querySelector(selector);if(element)element.textContent=value;}
  function set(name,value){var input=form.querySelector('[name="'+name+'"]');if(input)input.value=value||'';}
  function chooseWorkspace(value,focusGoal){
    workspaceFocus=value||'';
    workspaceChoiceButtons.forEach(function(button){button.setAttribute('aria-pressed',String(button.getAttribute('data-workspace-choice-button')===workspaceFocus));});
    if(workspaceFocus==='shop')text('[data-contact-goal-label]','What should Shop be ready for?');
    else if(workspaceFocus==='plant')text('[data-contact-goal-label]','What should Plant be ready for?');
    else if(workspaceFocus==='guide')text('[data-contact-goal-label]','What repeats or breaks today?');
    else text('[data-contact-goal-label]','What should be ready first?');
    if(focusGoal&&goal)goal.focus();
  }
  function revealWorkspaceChoice(defaultValue){
    if(!workspaceChoice)return;
    workspaceChoice.hidden=false;
    chooseWorkspace(defaultValue||'',false);
  }
  function normalizeWorkspaceGoal(){
    if(!goal||!goal.value.trim()||(workspaceFocus!=='shop'&&workspaceFocus!=='plant'))return;
    var product=workspaceFocus==='shop'?'Shop':'Plant';
    var value=goal.value.trim();
    if(value.slice(0,product.length+2)!==product+': ')goal.value=product+': '+value;
  }
  workspaceChoiceButtons.forEach(function(button){button.addEventListener('click',function(){chooseWorkspace(button.getAttribute('data-workspace-choice-button'),true);});});
  function hydrateTracking(){
    set('source_url',window.location.href);
    set('page_path',window.location.pathname+window.location.search);
    set('referrer',document.referrer||'');
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(key){set(key,search.get(key)||'');});
  }
  if(workspaceProduct||privateSetupIntent){
    form.dataset.intake=workspaceProduct?entryIntent:'private-workspace';
    text('[data-contact-command]','>_ contact / workspace');
    if(workspaceProduct){
      text('[data-contact-heading]','Request a private '+workspaceProduct+' workspace.');
      text('[data-contact-intro]','Tell us who will use it and what should be ready first. SuperMega will set it up and verify it before handover.');
      text('[data-contact-form-heading]','Request '+workspaceProduct);
    }else{
      text('[data-contact-heading]','Set up a private workspace.');
      text('[data-contact-intro]','Tell us whether Shop or Plant should be ready first and who will use it. SuperMega will define the setup path and verify it before handover.');
      text('[data-contact-form-heading]','Private setup');
    }
    text('[data-contact-goal-label]','What should be ready first?');
    text('[data-contact-policy]','Sending this request does not create an account or connect data. Setup begins only after scope approval.');
    idleSubmitLabel='Request workspace';
    if(submit)submit.textContent=idleSubmitLabel;
    revealWorkspaceChoice(initialWorkspaceChoice);
  }
  hydrateTracking();
  var status=form.querySelector('[data-contact-status]');
  form.addEventListener('submit',async function(event){
    event.preventDefault();
    var honeypot=form.querySelector('[name="website"]');
    if(honeypot&&honeypot.value)return;
    normalizeWorkspaceGoal();
    if(status)status.textContent='Sending...';
    if(submit){submit.disabled=true;submit.textContent='Sending...';}
    try{
      var response=await fetch(form.action,{method:'POST',body:new FormData(form)});
      var body=await response.json().catch(function(){return {};});
      if(!response.ok)throw new Error(body.reason||'send_failed');
      if(status)status.textContent='Request sent.';
      form.reset();
      hydrateTracking();
      if(workspaceChoice&&!workspaceChoice.hidden)chooseWorkspace(initialWorkspaceChoice,false);
    }catch(error){
      if(status)status.textContent='Could not send here. Email swanhtet@supermega.dev.';
    }finally{
      if(submit){submit.disabled=false;submit.textContent=idleSubmitLabel;}
    }
  });
})();</script>`,
})

const privacyHtml = documentHtml({
  title: 'Privacy | supermega.dev',
  description: 'How SuperMega handles contact requests.',
  canonical: 'https://supermega.dev/privacy/',
  style: `
    .privacy-main { width: min(100% - 48px, 900px); margin-inline: auto; padding: 142px 0 92px; }
    .privacy-command { color: var(--accent); font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 13px; font-weight: 800; }
    .privacy-main h1 { max-width: 13ch; margin: 16px 0 20px; font-size: 52px; line-height: 1.04; letter-spacing: 0; }
    .privacy-main > p { max-width: 54ch; margin: 0; color: var(--muted); font-size: 18px; line-height: 1.58; }
    .privacy-prose { margin-top: 52px; border-bottom: 1px solid var(--line); }
    .privacy-prose section { display: grid; grid-template-columns: minmax(180px, .4fr) minmax(0, 1fr); gap: 36px; padding: 30px 0; border-top: 1px solid var(--line); }
    .privacy-prose h2 { margin: 0; font-size: 19px; line-height: 1.3; }
    .privacy-prose p { margin: 0; color: var(--muted); font-size: 16px; line-height: 1.65; }
    .privacy-prose a { display: inline-flex; min-height: 44px; align-items: center; color: var(--accent); }
    @media (max-width: 720px) { .privacy-main { width: min(100% - 32px, 900px); padding: 112px 0 64px; } .privacy-main h1 { font-size: 40px; } .privacy-main > p { font-size: 16px; } .privacy-prose section { grid-template-columns: 1fr; gap: 8px; } }
  `,
  content: `<main class="privacy-main">
  <div class="privacy-command">&gt;_ privacy / public</div>
  <h1>Only the details needed to reply.</h1>
  <p>The public site stays deliberately direct. This is how a contact request is handled.</p>
  <div class="privacy-prose">
    <section><h2>What we collect</h2><p>When you contact us, we receive the name, work email, company, and request you choose to send.</p></section>
    <section><h2>How we use it</h2><p>We use those details to respond to the request and, if you approve a project, to deliver the agreed work. We do not sell or rent contact details.</p></section>
    <section><h2>Connections and accounts</h2><p>Sending a contact request does not create an account or connect any data source. Any later connection is discussed and approved separately.</p></section>
    <section><h2>Delete a request</h2><p>Email <a href="mailto:swanhtet@supermega.dev">swanhtet@supermega.dev</a> to request deletion of a contact record.</p></section>
  </div>
</main>`,
})

const notFoundHtml = documentHtml({
  title: 'Page not found | supermega.dev',
  description: 'The requested page does not exist.',
  canonical: 'https://supermega.dev/404',
  style: `
    .not-found { width: min(100% - 48px, 1240px); min-height: 78svh; margin-inline: auto; display: grid; align-content: center; padding: 120px 0 72px; }
    .not-found-command { color: var(--accent); font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 14px; font-weight: 800; }
    .not-found h1 { max-width: 11ch; margin: 16px 0 18px; font-size: 54px; line-height: 1.04; letter-spacing: 0; }
    .not-found p { max-width: 40ch; margin: 0; color: var(--muted); font-size: 18px; }
    .not-found .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 28px; }
    @media (max-width: 720px) { .not-found { width: min(100% - 32px, 1240px); min-height: 72svh; } .not-found h1 { font-size: 40px; } }
  `,
  content: `<main class="not-found"><div class="not-found-command">&gt;_ 404 / not-found</div><h1>That route is gone.</h1><p>Return to SuperMega, open Shop, or open Plant.</p><div class="actions"><a class="btn primary" href="/">Home</a><a class="btn secondary" href="${shopStartHref}">Shop</a><a class="btn secondary" href="${plantStartHref}">Plant</a></div></main>`,
})

const vercelConfig = {
  version: 3,
  routes: [
    { src: '^/api/contact-submissions$', dest: '/api/contact-submissions.js' },
    { src: '^/api/contact-submissions/status$', dest: '/api/contact-submissions.js' },
    { src: '^/api/health$', dest: '/api/health.js' },
    { src: '^/api/(.*)$', dest: '/api/not-found.js' },
    { src: '^/(?:login|app|clients)(?:/.*)?$', status: 308, headers: { Location: 'https://app.supermega.dev/' } },
    { src: '^/demo/?$', status: 308, headers: { Location: 'https://demo.supermega.dev/' } },
    { src: '^/start/?$', status: 308, headers: { Location: '/contact/' } },
    { src: '^/reconcile(?:/.*)?$', status: 308, headers: { Location: '/contact/?from=workflow' } },
    {
      src: '^/(?:products|product|offers|pricing|plans|packages|agent-templates|ai-agents|workcell|operator|machine|card|megaos-preview|free)(?:/.*)?$',
      status: 308,
      headers: { Location: '/' },
    },
    {
      src: '^/(?:agentops|agentops-toolbox|ai-back-office|back-office-operator|back-office-workflow-desk|openclaw|office-operator|try|book|setup|get-started|intake|free-tools|free-tool|builder|tool-builder|scan|calculator|workflow-scan|daily-close|payment-close|close-checker|mmqr|store-tool|agent-builder|agent-scope|ai-agent|agent-tool|agents|about|demos|demo-center|enterprise-demo|modules|portal-types|implementation|how-it-works|portfolio|tools|value|proof|platform|solutions|find-companies|company-list|task-list|receiving-log)/?$',
      status: 308,
      headers: { Location: '/' },
    },
    { src: '^/c/([^/]+)/?$', status: 308, headers: { Location: '/' } },
    { src: '^/(?:favicon\\.svg|site\\.webmanifest|robots\\.txt|sitemap\\.xml|sw\\.js)$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
    { handle: 'filesystem' },
    { src: '^/(.*)$', status: 404, dest: '/404.html' },
  ],
}

async function writeStatic(relativePath, content) {
  const destination = resolve(staticDir, relativePath)
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, content, 'utf8')
}

async function writeNodeFunction(name) {
  const functionDir = resolve(functionsDir, `${name}.func`)
  await mkdir(resolve(functionDir, 'api'), { recursive: true })
  await cp(resolve(root, 'api', name), resolve(functionDir, 'api', name), { force: true })
  await cp(resolve(root, 'api', 'lib'), resolve(functionDir, 'api', 'lib'), { recursive: true, force: true })
  await writeFile(resolve(functionDir, 'api', 'lib', 'supermega-datastore.js'), publicDatastoreShim, 'utf8')
  if (name === 'contact-submissions.js') {
    const blobEntry = resolve(functionDir, 'api', 'lib', 'vercel-blob-entry.mjs')
    await writeFile(blobEntry, "export { get, list, put } from '@vercel/blob'\n", 'utf8')
    await build({
      entryPoints: [blobEntry],
      outfile: resolve(functionDir, 'api', 'lib', 'vercel-blob-runtime.js'),
      bundle: true,
      platform: 'node',
      target: 'node24',
      format: 'cjs',
      minify: true,
      legalComments: 'none',
      logLevel: 'silent',
      alias: {
        undici: resolve(root, 'node_modules', '@vercel', 'blob', 'dist', 'undici-browser.js'),
      },
    })
    await rm(blobEntry, { force: true })
  }

  await writeFile(resolve(functionDir, 'package.json'), `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`, 'utf8')
  await writeFile(
    resolve(functionDir, '.vc-config.json'),
    `${JSON.stringify({
      handler: `api/${name}`,
      runtime: 'nodejs24.x',
      architecture: 'x86_64',
      environment: {},
      shouldDisableAutomaticFetchInstrumentation: false,
      launcherType: 'Nodejs',
      shouldAddHelpers: true,
      shouldAddSourcemapSupport: false,
      awsLambdaHandler: '',
    }, null, 2)}\n`,
    'utf8',
  )
}

await rm(outputDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
await mkdir(staticDir, { recursive: true })
await mkdir(functionsDir, { recursive: true })

await writeStatic('favicon.svg', faviconSvg)
// These straight, clean-boundary captures come from the current disposable Shop and Plant demos.
await cp(resolve(root, 'tools', 'public-assets', 'live-shop-workspace.png'), resolve(staticDir, 'live-shop-workspace.png'), { force: true })
await cp(resolve(root, 'tools', 'public-assets', 'live-plant-workspace.png'), resolve(staticDir, 'live-plant-workspace.png'), { force: true })
await cp(resolve(root, 'tools', 'public-assets', 'live-shop-mobile.png'), resolve(staticDir, 'live-shop-mobile.png'), { force: true })
await cp(resolve(root, 'tools', 'public-assets', 'live-plant-mobile.png'), resolve(staticDir, 'live-plant-mobile.png'), { force: true })
await writeStatic('index.html', homeHtml)
await writeStatic('404.html', notFoundHtml)
await writeStatic('work/index.html', workHtml)
await writeStatic('contact/index.html', contactHtml)
await writeStatic('privacy/index.html', privacyHtml)
await writeStatic('robots.txt', 'User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://supermega.dev/sitemap.xml\n')
await writeStatic('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://supermega.dev/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n  <url><loc>https://supermega.dev/work/</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>\n  <url><loc>https://supermega.dev/contact/</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>\n  <url><loc>https://supermega.dev/privacy/</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>\n</urlset>\n')
await writeStatic('sw.js', "const CACHE_VERSION = 'supermega-front-door-20260713-terminal'\nself.addEventListener('install', function(){ self.skipWaiting() })\nself.addEventListener('activate', function(event){ event.waitUntil(caches.keys().then(function(keys){ return Promise.all(keys.map(function(key){ return caches.delete(key) })) }).then(function(){ return self.clients.claim() })) })\n")
await writeStatic('site.webmanifest', `${JSON.stringify({
  name: 'supermega.dev',
  short_name: 'supermega',
  start_url: '/',
  display: 'browser',
  background_color: '#090c11',
  theme_color: '#090c11',
  icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
}, null, 2)}\n`)

await writeNodeFunction('health.js')
await writeNodeFunction('contact-submissions.js')
await writeNodeFunction('not-found.js')
await writeFile(resolve(outputDir, 'config.json'), `${JSON.stringify(vercelConfig, null, 2)}\n`, 'utf8')

console.log('public_vercel_output=ready')
