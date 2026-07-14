import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const root = process.cwd()
const outputDir = resolve(root, '.vercel', 'output')
const staticDir = resolve(outputDir, 'static')
const functionsDir = resolve(outputDir, 'functions', 'api')

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="supermega.dev terminal mark"><rect x="4" y="4" width="56" height="56" rx="12" fill="#090c11"/><rect x="4.75" y="4.75" width="54.5" height="54.5" rx="11.25" fill="none" stroke="#ffffff" stroke-opacity="0.14"/><path d="M18 21.5 30 32 18 42.5" fill="none" stroke="#5f8cff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M35 42.5h13" fill="none" stroke="#3dd6a2" stroke-width="5" stroke-linecap="round"/></svg>\n`

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
    box-shadow: 0 12px 34px rgba(6, 10, 18, 0.1);
    backdrop-filter: blur(24px) saturate(135%);
    -webkit-backdrop-filter: blur(24px) saturate(135%);
    pointer-events: auto;
  }
  .brand {
    display: inline-flex;
    min-width: 0;
    min-height: 44px;
    align-items: center;
    gap: 10px;
    color: var(--ink);
    text-decoration: none;
  }
  .terminal-mark {
    width: 34px;
    height: 34px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--inverse);
    color: #6b95ff;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    font-size: 14px;
    font-weight: 800;
    line-height: 1;
  }
  .terminal-mark span:last-child { color: #3dd6a2; }
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
  .footer-command { color: var(--accent); font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }
  .footer-links { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 14px; }
  .footer-links a { min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; color: var(--muted); text-decoration: none; }
  .footer-links a:hover { color: var(--ink); }
  :focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 40%, transparent); outline-offset: 3px; }
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .front-header { background: var(--surface-strong); }
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
    .header-cta { min-width: 112px; }
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
      <span class="terminal-mark" aria-hidden="true"><span>&gt;</span><span>_</span></span>
      <span class="brand-text">supermega<span class="domain">.dev</span></span>
    </a>
    <nav class="nav" aria-label="Primary">
      <a class="nav-link optional-nav" href="https://app.supermega.dev/?demo=shop">Shop</a>
      <a class="nav-link optional-nav" href="https://app.supermega.dev/?demo=plant">Plant</a>
      <a class="nav-link optional-nav" href="/contact/">Contact</a>
      <button class="icon-button" type="button" data-theme-toggle aria-label="Use dark mode" title="Use dark mode"><svg class="theme-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg><svg class="theme-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z"></path></svg></button>
      <a class="btn primary header-cta" href="/contact/">Start now</a>
    </nav>
  </header>
</div>
${themeToggleScript}`

const footerHtml = `<div class="footer-frame"><footer>
  <span class="footer-brand"><span class="footer-command">&gt;_</span> supermega.dev</span>
  <span class="footer-links"><a href="https://app.supermega.dev/?demo=shop">Shop</a><a href="https://app.supermega.dev/?demo=plant">Plant</a><a href="/contact/">Contact</a><a href="/privacy/">Privacy</a></span>
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

const liveStatusScript = `<script>(function(){var node=document.querySelector('[data-public-status]');if(!node)return;if(location.hostname==='127.0.0.1'||location.hostname==='localhost'){node.textContent='Local preview';return;}fetch('/api/health',{cache:'no-store',headers:{accept:'application/json'}}).then(function(response){if(!response.ok)throw new Error('unavailable');return response.json();}).then(function(body){node.textContent=body&&body.ok?'Public system ready':'Workspace available';var parent=node.closest('[data-status-shell]');if(parent)parent.classList.add('is-ready');}).catch(function(){node.textContent='Workspace available';});})();</script>`

const homeMotionScript = `<script>(function(){var nodes=document.querySelectorAll('[data-reveal]');if(!nodes.length)return;if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches){nodes.forEach(function(node){node.classList.add('is-visible');});return;}if(!('IntersectionObserver' in window)){nodes.forEach(function(node){node.classList.add('is-visible');});return;}var observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}});},{rootMargin:'0px 0px -8% 0px',threshold:.12});nodes.forEach(function(node){observer.observe(node);});})();</script>`

const homeHtml = documentHtml({
  title: 'supermega.dev | Shop and Plant',
  description: 'Open working Shop and Plant products, or contact SuperMega about one repeated workflow your team wants handled better.',
  canonical: 'https://supermega.dev/',
  style: `
    .home-main { width: 100%; overflow: clip; }
    .hero {
      position: relative;
      overflow: clip;
      border-bottom: 1px solid var(--line);
      padding: 122px 0 14px;
      background: var(--surface);
      isolation: isolate;
    }
    .hero-inner { width: min(100% - 48px, 1240px); margin-inline: auto; }
    .hero-head { display: grid; grid-template-columns: minmax(0, 1fr) minmax(340px, .72fr); align-items: end; gap: 72px; }
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
    .hero h1 { max-width: 12ch; margin: 18px 0 0; font-size: 56px; line-height: 1.02; letter-spacing: 0; font-weight: 790; }
    .hero-side > p { max-width: 45ch; margin: 0; color: var(--muted); font-size: 17px; line-height: 1.58; }
    .hero-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 26px; }
    .hero-actions .btn { min-height: 50px; }
    .hero-status { min-height: 36px; display: inline-flex; align-items: center; gap: 9px; margin-top: 18px; color: var(--muted); font-size: 12px; font-weight: 720; }
    .hero-media {
      position: relative;
      width: min(100%, 960px);
      margin: 30px auto 0;
      border: 1px solid var(--line-strong);
      border-radius: 8px;
      overflow: hidden;
      padding: 7px;
      background: var(--glass-strong);
      box-shadow: var(--shadow-deep);
      backdrop-filter: blur(24px) saturate(135%);
      -webkit-backdrop-filter: blur(24px) saturate(135%);
      animation: media-in 820ms 260ms cubic-bezier(.2,.8,.2,1) both;
    }
    .hero-media img { display: block; width: 100%; height: auto; border-radius: 5px; }
    .live-dot { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--quiet); box-shadow: 0 0 0 4px color-mix(in srgb, var(--quiet) 16%, transparent); }
    .hero-status.is-ready .live-dot { background: var(--signal); box-shadow: 0 0 0 4px color-mix(in srgb, var(--signal) 16%, transparent); }
    .hero-head > * { animation: copy-in 620ms cubic-bezier(.2,.8,.2,1) both; }
    .hero-side { animation-delay: 110ms; }
    @keyframes copy-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes media-in { from { opacity: 0; transform: translateY(26px) scale(.99); } to { opacity: 1; transform: translateY(0) scale(1); } }

    .entry-section { padding: 34px 0 104px; }
    .section-intro { display: grid; grid-template-columns: minmax(0, .9fr) minmax(280px, .55fr); gap: 48px; align-items: end; margin-bottom: 50px; }
    .section-intro h2 { max-width: 13ch; margin: 10px 0 0; font-size: 44px; line-height: 1.08; letter-spacing: 0; }
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

    .start-band { background: var(--inverse); color: var(--inverse-ink); }
    .start-inner { padding: 88px 0 92px; }
    .start-intro { display: grid; grid-template-columns: minmax(0, .9fr) minmax(280px, .55fr); align-items: end; gap: 48px; }
    .start-intro .eyebrow { color: #8faeff; }
    .start-intro h2 { max-width: 13ch; margin: 10px 0 0; font-size: 44px; line-height: 1.08; letter-spacing: 0; }
    .start-intro p { max-width: 42ch; margin: 0; color: var(--inverse-muted); font-size: 17px; line-height: 1.58; }
    .start-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 52px; border-block: 1px solid rgba(255,255,255,.16); }
    .start-step { min-height: 160px; padding: 28px 28px 28px 0; }
    .start-step + .start-step { border-left: 1px solid rgba(255,255,255,.16); padding-left: 28px; }
    .start-step span { color: #8faeff; font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 11px; font-weight: 760; }
    .start-step strong { display: block; margin-top: 15px; color: var(--inverse-ink); font-size: 18px; }
    .start-step p { max-width: 30ch; margin: 8px 0 0; color: var(--inverse-muted); font-size: 14px; line-height: 1.55; }
    .start-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 30px; }
    .start-actions .btn.secondary { border-color: rgba(255,255,255,.18); background: rgba(255,255,255,.08); color: var(--inverse-ink); }

    .workflow-section { border-bottom: 1px solid var(--line); padding: 98px 0 104px; }
    .workflow-inner { display: grid; grid-template-columns: 140px minmax(0, 1fr) minmax(180px, auto); align-items: end; gap: 38px; }
    .workflow-label { color: var(--accent); font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 12px; font-weight: 760; text-transform: uppercase; }
    .workflow-copy h2 { max-width: 17ch; margin: 0; font-size: 42px; line-height: 1.08; letter-spacing: 0; }
    .workflow-copy p { max-width: 52ch; margin: 16px 0 0; color: var(--muted); font-size: 16px; line-height: 1.58; }
    [data-reveal] { opacity: 0; transform: translateY(18px); transition: opacity 520ms ease, transform 520ms cubic-bezier(.2,.8,.2,1); }
    [data-reveal].is-visible { opacity: 1; transform: translateY(0); }

    @media (max-width: 980px) {
      .hero-head { grid-template-columns: 1fr; gap: 24px; }
      .hero-side { max-width: 680px; }
      .hero h1 { font-size: 50px; }
      .section-intro { grid-template-columns: 1fr; gap: 18px; }
      .destination-copy { grid-template-columns: minmax(160px, .5fr) 1fr; }
      .start-intro { grid-template-columns: 1fr; gap: 18px; }
      .workflow-inner { grid-template-columns: 110px minmax(0, 1fr); }
      .workflow-inner .btn { grid-column: 2; justify-self: start; }
    }
    @media (max-height: 800px) and (min-width: 721px) {
      .hero { padding-top: 104px; }
      .hero h1 { font-size: 48px; }
      .hero-media { width: min(100%, 760px); margin-top: 22px; }
    }
    @media (max-width: 720px) {
      .hero { padding: 104px 0 20px; }
      .hero-inner { width: min(100% - 32px, 1240px); }
      .hero h1 { max-width: 12ch; margin-top: 14px; font-size: 40px; line-height: 1.04; }
      .hero-side > p { max-width: 38ch; font-size: 15px; line-height: 1.5; }
      .hero-actions { gap: 8px; margin-top: 20px; }
      .hero-actions .btn { min-height: 46px; flex: 1 1 140px; }
      .hero-media { margin-top: 24px; padding: 4px; }
      .entry-section { padding: 30px 0 74px; }
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
      .start-inner { padding: 68px 0 72px; }
      .start-intro h2 { font-size: 36px; }
      .start-intro p { font-size: 16px; }
      .start-steps { grid-template-columns: 1fr; margin-top: 36px; }
      .start-step { min-height: 0; padding: 24px 0; }
      .start-step + .start-step { border-top: 1px solid rgba(255,255,255,.16); border-left: 0; padding-left: 0; }
      .workflow-section { padding: 72px 0 78px; }
      .workflow-inner { grid-template-columns: 1fr; gap: 18px; }
      .workflow-copy h2 { font-size: 34px; }
      .workflow-inner .btn { grid-column: auto; }
    }
    @media (max-width: 390px) {
      .hero-command { font-size: 11px; }
      .hero h1 { font-size: 36px; }
    }
  `,
  content: `<main class="home-main">
  <section class="hero" data-hero aria-labelledby="portfolio-heading">
    <div class="hero-inner">
      <div class="hero-head">
        <div>
          <div class="hero-command"><strong>&gt;_</strong><span>workspaces / live</span></div>
          <h1 id="portfolio-heading">Run the operation. See what matters.</h1>
        </div>
        <div class="hero-side">
          <p>Shop keeps sales, stock, customers, and books together. Plant keeps floor activity and machine history in view.</p>
          <div class="hero-actions">
            <a class="btn primary" href="https://app.supermega.dev/?demo=shop">Open Shop</a>
            <a class="btn secondary" href="https://app.supermega.dev/?demo=plant">Open Plant</a>
            <a class="btn secondary" href="/contact/">Contact us</a>
          </div>
          <div class="hero-status" data-status-shell><span class="live-dot" aria-hidden="true"></span><span data-public-status aria-live="polite">Checking public system</span></div>
        </div>
      </div>
      <div class="hero-media"><img src="/live-shop-workspace.png" alt="Current Shop workspace showing sales, cash, customers, and stock" width="1600" height="760" fetchpriority="high" /></div>
    </div>
  </section>

  <section class="entry-section page-frame" id="products" aria-labelledby="products-heading">
    <div class="section-intro">
      <div><div class="eyebrow">Two working products</div><h2 id="products-heading">Choose where you work.</h2></div>
      <p>Both products use the same responsive account and open directly in this browser.</p>
    </div>
    <div class="destination-list">
      <a class="destination" href="https://app.supermega.dev/?demo=shop"><span class="destination-index">01 / SHOP</span><span class="destination-copy"><strong>Shop</strong><span>Point of sale, customers, stock, receivables, and books.</span></span><span class="destination-arrow" aria-hidden="true">&#8594;</span></a>
      <a class="destination" href="https://app.supermega.dev/?demo=plant"><span class="destination-index">02 / PLANT</span><span class="destination-copy"><strong>Plant</strong><span>Floor state, machine history, shift events, and imports.</span></span><span class="destination-arrow" aria-hidden="true">&#8594;</span></a>
    </div>
  </section>

  <section class="start-band" id="start" aria-labelledby="start-heading">
    <div class="start-inner page-frame" data-reveal>
      <div class="start-intro">
        <div><div class="eyebrow">New here?</div><h2 id="start-heading">Try first. Add data later.</h2></div>
        <p>The demo needs no account. Create a workspace only when you want to keep your work and use it across devices.</p>
      </div>
      <div class="start-steps">
        <div class="start-step"><span>01 / TRY</span><strong>Open a demo</strong><p>Choose Shop or Plant and use the working screens immediately.</p></div>
        <div class="start-step"><span>02 / ACCOUNT</span><strong>Create your workspace</strong><p>Use email and password, or sign back in with an email code.</p></div>
        <div class="start-step"><span>03 / DATA</span><strong>Bring your data</strong><p>Import your own rows when you are ready, or start fresh.</p></div>
      </div>
      <div class="start-actions">
        <a class="btn primary" href="https://app.supermega.dev/?demo=shop">Try Shop</a>
        <a class="btn secondary" href="https://app.supermega.dev/?demo=plant">Try Plant</a>
      </div>
    </div>
  </section>

  <section class="workflow-section">
    <div class="workflow-inner page-frame" data-reveal>
      <div class="workflow-label">AI Agent Solutions</div>
      <div class="workflow-copy">
        <h2>Need a repeated task handled?</h2>
        <p>Tell us what your team repeats and what a useful result looks like. We start with one reviewed proof before connecting data or taking action.</p>
      </div>
      <a class="btn primary" href="/contact/?from=ai-agent-solution">Contact us</a>
    </div>
  </section>
</main>
${liveStatusScript}
${homeMotionScript}`,
})

const contactHtml = documentHtml({
  title: 'Contact | supermega.dev',
  description: 'Tell SuperMega what needs to work better.',
  canonical: 'https://supermega.dev/contact/',
  style: `
    .contact-main { width: min(100% - 48px, 1240px); margin-inline: auto; display: grid; grid-template-columns: minmax(0, .78fr) minmax(420px, 1.22fr); gap: 84px; align-items: start; padding: 142px 0 94px; }
    .contact-copy { padding-top: 26px; }
    .contact-command { color: var(--accent); font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 14px; font-weight: 800; }
    .contact-copy h1 { max-width: 11ch; margin: 16px 0 20px; font-size: 54px; line-height: 1.04; letter-spacing: 0; }
    .contact-copy > p { max-width: 37ch; margin: 0; color: var(--muted); font-size: 18px; line-height: 1.58; }
    .contact-direct { margin-top: 40px; border-bottom: 1px solid var(--line); }
    .contact-direct a { min-height: 56px; display: grid; grid-template-columns: 76px 1fr auto; align-items: center; gap: 14px; border-top: 1px solid var(--line); color: var(--ink); font-size: 14px; text-decoration: none; }
    .contact-direct a span:first-child { color: var(--quiet); font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 11px; text-transform: uppercase; }
    .contact-direct a span:last-child { color: var(--accent); }
    .contact-form { display: grid; gap: 20px; border: 1px solid var(--line); border-radius: 8px; padding: 32px; background: var(--glass); box-shadow: var(--shadow); backdrop-filter: blur(24px) saturate(130%); -webkit-backdrop-filter: blur(24px) saturate(130%); }
    .contact-form-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }
    .contact-form h2 { margin: 0; font-size: 20px; line-height: 1.2; }
    .form-ready { display: inline-flex; align-items: center; gap: 7px; color: var(--signal); font-size: 12px; font-weight: 760; }
    .form-ready::before { width: 8px; height: 8px; border-radius: 50%; background: var(--signal); content: ""; }
    .field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .field-grid label { display: grid; gap: 8px; color: var(--muted); font-size: 12px; font-weight: 780; letter-spacing: 0; text-transform: uppercase; }
    .field-grid label.wide { grid-column: 1 / -1; }
    .field-grid input, .field-grid textarea { width: 100%; min-width: 0; border: 1px solid var(--line); border-radius: 8px; padding: 13px 14px; background: var(--surface); color: var(--ink); font: inherit; font-size: 16px; letter-spacing: 0; text-transform: none; transition: border-color 160ms ease, background 160ms ease; }
    .field-grid textarea { min-height: 156px; resize: vertical; }
    .field-grid input:focus, .field-grid textarea:focus { outline: 3px solid color-mix(in srgb, var(--accent) 24%, transparent); border-color: var(--accent); background: var(--surface-strong); }
    .contact-form button { min-height: 50px; justify-content: center; }
    .contact-policy, .form-status { margin: 0; color: var(--muted); font-size: 13px; font-weight: 650; line-height: 1.5; }
    .form-status { min-height: 1.5em; }
    @media (max-width: 900px) { .contact-main { grid-template-columns: 1fr; gap: 40px; } .contact-copy { max-width: 720px; padding-top: 0; } }
    @media (max-width: 720px) { .contact-main { width: min(100% - 32px, 1240px); padding: 112px 0 64px; } .contact-copy h1 { max-width: 10ch; font-size: 40px; } .contact-copy > p { font-size: 16px; } .contact-form { padding: 20px; } .field-grid { grid-template-columns: 1fr; } .field-grid label.wide { grid-column: auto; } }
  `,
  content: `<main class="contact-main">
  <section class="contact-copy" aria-label="Contact SuperMega">
    <div class="contact-command" data-contact-command>&gt;_ direct / contact</div>
    <h1 data-contact-heading>What needs to work better?</h1>
    <p data-contact-intro>Send the shortest useful version of the problem. We will reply with the clearest next step.</p>
    <div class="contact-direct" aria-label="Direct contact options">
      <a href="viber://chat?number=%2B9595000721"><span>Viber</span><strong>Chat directly</strong><span aria-hidden="true">&#8599;</span></a>
      <a href="mailto:swanhtet@supermega.dev"><span>Email</span><strong>swanhtet@supermega.dev</strong><span aria-hidden="true">&#8594;</span></a>
      <a href="tel:+9595000721"><span>Phone</span><strong>+95 9 500 0721</strong><span aria-hidden="true">&#8594;</span></a>
    </div>
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
</main>
<script>(function(){
  var form=document.querySelector('[data-sm-contact-form]');
  if(!form)return;
  var search=new URLSearchParams(window.location.search);
  var agentIntent=search.get('from')==='ai-agent-solution';
  var submit=form.querySelector('[data-contact-submit]');
  var idleSubmitLabel='Send request';
  function text(selector,value){var element=document.querySelector(selector);if(element)element.textContent=value;}
  function set(name,value){var input=form.querySelector('[name="'+name+'"]');if(input)input.value=value||'';}
  function hydrateTracking(){
    set('source_url',window.location.href);
    set('page_path',window.location.pathname+window.location.search);
    set('referrer',document.referrer||'');
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(key){set(key,search.get(key)||'');});
  }
  if(agentIntent){
    form.dataset.intake='ai-agent-solution';
    text('[data-contact-command]','>_ contact / start');
    text('[data-contact-heading]','What do you want to improve?');
    text('[data-contact-intro]','Tell us what repeats today and what a useful result looks like. We will reply with the clearest place to start.');
    text('[data-contact-form-heading]','Start here');
    text('[data-contact-goal-label]','What should work better?');
    text('[data-contact-policy]','We start with one reviewed example. No account, data connection, or external action is made before you approve it.');
    idleSubmitLabel='Contact us';
    if(submit)submit.textContent=idleSubmitLabel;
  }
  hydrateTracking();
  var status=form.querySelector('[data-contact-status]');
  form.addEventListener('submit',async function(event){
    event.preventDefault();
    var honeypot=form.querySelector('[name="website"]');
    if(honeypot&&honeypot.value)return;
    if(status)status.textContent='Sending...';
    if(submit){submit.disabled=true;submit.textContent='Sending...';}
    try{
      var response=await fetch(form.action,{method:'POST',body:new FormData(form)});
      var body=await response.json().catch(function(){return {};});
      if(!response.ok)throw new Error(body.reason||'send_failed');
      if(status)status.textContent='Request sent.';
      form.reset();
      hydrateTracking();
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
  content: `<main class="not-found"><div class="not-found-command">&gt;_ 404 / not-found</div><h1>That route is gone.</h1><p>Return to SuperMega, open Shop, or open Plant.</p><div class="actions"><a class="btn primary" href="/">Home</a><a class="btn secondary" href="https://app.supermega.dev/?demo=shop">Shop</a><a class="btn secondary" href="https://app.supermega.dev/?demo=plant">Plant</a></div></main>`,
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
    {
      src: '^/(?:products|product|offers|pricing|plans|packages|agent-templates|ai-agents|work|operator|machine|card|megaos-preview|free)(?:/.*)?$',
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
// These captures come from the current disposable Shop demo on desktop and mobile.
await cp(resolve(root, 'tools', 'public-assets', 'live-shop-workspace.png'), resolve(staticDir, 'live-shop-workspace.png'), { force: true })
await cp(resolve(root, 'tools', 'public-assets', 'live-shop-mobile.png'), resolve(staticDir, 'live-shop-mobile.png'), { force: true })
await writeStatic('index.html', homeHtml)
await writeStatic('404.html', notFoundHtml)
await writeStatic('contact/index.html', contactHtml)
await writeStatic('privacy/index.html', privacyHtml)
await writeStatic('robots.txt', 'User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://supermega.dev/sitemap.xml\n')
await writeStatic('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://supermega.dev/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n  <url><loc>https://supermega.dev/contact/</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>\n  <url><loc>https://supermega.dev/privacy/</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>\n</urlset>\n')
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
