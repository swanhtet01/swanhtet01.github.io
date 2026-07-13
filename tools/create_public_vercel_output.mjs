import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const root = process.cwd()
const outputDir = resolve(root, '.vercel', 'output')
const staticDir = resolve(outputDir, 'static')
const functionsDir = resolve(outputDir, 'functions', 'api')

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

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="SuperMega"><rect x="4" y="4" width="56" height="56" rx="15" fill="#111827"/><rect x="4.75" y="4.75" width="54.5" height="54.5" rx="14.25" fill="none" stroke="#ffffff" stroke-opacity="0.12"/><path d="M21 23 31.5 32 21 41" fill="none" stroke="#2563eb" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M35 41h12" fill="none" stroke="#2563eb" stroke-width="5" stroke-linecap="round"/></svg>\n`

const sharedStyle = `
  :root {
    color-scheme: light;
    --page: #f6f8fb;
    --surface: #ffffff;
    --surface-muted: #edf2f8;
    --ink: #111827;
    --muted: #5f6d82;
    --line: rgba(17, 24, 39, 0.14);
    --accent: #2563eb;
    --accent-strong: #1d4ed8;
    --accent-soft: rgba(37, 99, 235, 0.11);
    --shadow: 0 16px 40px rgba(15, 23, 42, 0.1);
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --page: #0b1220;
    --surface: #111b2d;
    --surface-muted: #17243a;
    --ink: #edf3ff;
    --muted: #afbdd0;
    --line: rgba(219, 231, 255, 0.16);
    --accent: #7ca9ff;
    --accent-strong: #a6c4ff;
    --accent-soft: rgba(124, 169, 255, 0.16);
    --shadow: 0 18px 42px rgba(0, 0, 0, 0.32);
  }
  * { box-sizing: border-box; }
  html { background: var(--page); }
  body {
    min-width: 320px;
    margin: 0;
    background: var(--page);
    color: var(--ink);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    line-height: 1.5;
    text-rendering: optimizeLegibility;
  }
  button, input, textarea { font: inherit; }
  a { color: inherit; }
  .site-shell { width: min(100% - 48px, 1180px); margin: 0 auto; }
  .front-header {
    position: sticky;
    top: 0;
    z-index: 20;
    min-height: 72px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid var(--line);
    background: color-mix(in srgb, var(--page) 90%, transparent);
    backdrop-filter: blur(18px);
  }
  .brand {
    display: inline-flex;
    min-width: 0;
    min-height: 44px;
    align-items: center;
    gap: 9px;
    color: var(--ink);
    text-decoration: none;
  }
  .brand-text { white-space: nowrap; font-size: 18px; letter-spacing: 0; }
  .brand-text b { font-weight: 700; }
  .brand-mark { width: 26px; height: 26px; flex: none; }
  .nav { display: flex; min-width: 0; align-items: center; justify-content: flex-end; gap: 8px; }
  .btn, .icon-button {
    min-height: 44px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink);
    font-size: 14px;
    font-weight: 750;
    text-decoration: none;
    cursor: pointer;
  }
  .btn { display: inline-flex; align-items: center; justify-content: center; padding: 0 14px; white-space: nowrap; }
  .btn.primary { border-color: var(--accent); background: var(--accent); color: #ffffff; box-shadow: 0 8px 18px rgba(37, 99, 235, 0.2); }
  .btn.primary:hover { border-color: var(--accent-strong); background: var(--accent-strong); }
  .btn.secondary:hover, .icon-button:hover { border-color: var(--accent); color: var(--accent); }
  .icon-button { display: grid; width: 44px; place-items: center; padding: 0; }
  .icon-button svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.9; }
  .theme-moon { display: none; }
  :root[data-theme="dark"] .theme-sun { display: none; }
  :root[data-theme="dark"] .theme-moon { display: block; }
  .eyebrow { color: var(--accent); font-size: 12px; font-weight: 800; letter-spacing: 0; text-transform: uppercase; }
  footer {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    padding: 26px 0 34px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 13px;
    font-weight: 650;
  }
  .footer-links { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12px; }
  .footer-links a { display: inline-flex; min-height: 44px; align-items: center; color: var(--muted); text-decoration: none; }
  .footer-links a:hover { color: var(--accent); }
  :focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 38%, transparent); outline-offset: 3px; }
  @media (prefers-color-scheme: dark) { :root { color-scheme: dark; } }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
  }
  @media (max-width: 720px) {
    .site-shell { width: min(100% - 32px, 1180px); }
    .front-header { min-height: 76px; gap: 10px; }
    .nav { gap: 6px; }
    .btn { padding: 0 10px; font-size: 13px; }
    footer { display: grid; gap: 12px; }
    .footer-links { justify-content: flex-start; }
  }
  @media (max-width: 430px) {
    .brand-text { font-size: 16px; }
    .optional-nav { display: none; }
  }
`

const themeBootstrap = `<script>(function(){var root=document.documentElement;try{var theme=localStorage.getItem('sm-theme');if(!theme&&window.matchMedia){theme=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}root.setAttribute('data-theme',theme||'light');}catch(error){root.setAttribute('data-theme','light');}})();</script>`

const themeToggleScript = `<script>(function(){var root=document.documentElement,button=document.querySelector('[data-theme-toggle]');if(!button)return;function sync(){var dark=root.getAttribute('data-theme')==='dark';button.setAttribute('aria-pressed',String(dark));button.setAttribute('aria-label',dark?'Use light mode':'Use dark mode');button.setAttribute('title',dark?'Use light mode':'Use dark mode');}sync();button.addEventListener('click',function(){var next=root.getAttribute('data-theme')==='dark'?'light':'dark';root.setAttribute('data-theme',next);try{localStorage.setItem('sm-theme',next);}catch(error){}sync();});})();</script>`

const headerHtml = `${themeBootstrap}
<header class="front-header">
  <a class="brand" href="/" aria-label="SuperMega home">
    <img class="brand-mark" src="/favicon.svg" alt="" />
    <span class="brand-text"><b>supermega</b><b style="color:#5f6d82;font-weight:500">.dev</b></span>
  </a>
  <nav class="nav" aria-label="Primary">
    <button class="icon-button" type="button" data-theme-toggle aria-label="Use dark mode" title="Use dark mode"><svg class="theme-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg><svg class="theme-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z"></path></svg></button>
    <a class="btn secondary optional-nav" href="https://app.supermega.dev/?demo=shop" target="_blank" rel="noopener noreferrer">Open Shop</a>
    <a class="btn secondary optional-nav" href="https://demo.supermega.dev/" target="_blank" rel="noopener noreferrer">Try demo</a>
    <a class="btn primary" href="/contact/">Contact</a>
  </nav>
</header>
${themeToggleScript}`

const footerHtml = `<footer>
  <span>Powered by SuperMega Technologies</span>
  <span class="footer-links"><a href="https://app.supermega.dev/?demo=shop" target="_blank" rel="noopener noreferrer">Open Shop</a><a href="https://demo.supermega.dev/" target="_blank" rel="noopener noreferrer">Try demo</a><a href="/contact/">Contact</a><a href="/privacy/">Privacy</a></span>
</footer>`

function socialMeta(title, description, url) {
  const safeTitle = String(title).replaceAll('"', '&quot;')
  const safeDescription = String(description).replaceAll('"', '&quot;')
  return `<meta property="og:type" content="website" />\n    <meta property="og:site_name" content="SuperMega" />\n    <meta property="og:title" content="${safeTitle}" />\n    <meta property="og:description" content="${safeDescription}" />\n    <meta property="og:url" content="${url}" />\n    <meta name="twitter:card" content="summary" />`
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
    <meta name="theme-color" content="#111827" />
    <link rel="canonical" href="${canonical}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="manifest" href="/site.webmanifest" />
    ${socialMeta(title, description, canonical)}
    <style>${sharedStyle}\n${style}</style>
  </head>
  <body>
    <div class="site-shell">
      ${headerHtml}
      ${content}
      ${footerHtml}
    </div>
  </body>
</html>`
}

const homeHtml = documentHtml({
  title: 'SuperMega | Open Shop or try a demo',
  description: 'Open Shop, choose a live demo, or talk to SuperMega about work that needs a better system.',
  canonical: 'https://supermega.dev/',
  style: `
    .home-main { width: 100%; overflow: hidden; }
    .home-hero { border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--surface-muted); }
    .home-copy { width: min(100% - 48px, 1180px); margin: 0 auto; padding: 62px 0 30px; }
    .home-copy h1 { margin: 12px 0 18px; font-size: 72px; line-height: 0.98; letter-spacing: 0; }
    .home-copy p { max-width: 34ch; margin: 0; color: var(--muted); font-size: 20px; line-height: 1.48; }
    .home-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 30px; }
    .home-actions .btn { min-height: 48px; }
    .home-contact { display: inline-flex; min-height: 44px; align-items: center; color: var(--ink); font-size: 14px; font-weight: 800; text-decoration: underline; text-underline-offset: 4px; }
    .hero-media { height: 300px; overflow: hidden; border-top: 1px solid var(--line); background: #0b1220; }
    .hero-media img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center 10%; }
    .next-step { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding: 36px 0 52px; }
    .next-step p { max-width: 48ch; margin: 0; color: var(--muted); font-size: 17px; line-height: 1.55; }
    .next-step a { display: inline-flex; min-height: 44px; align-items: center; color: var(--accent); font-size: 15px; font-weight: 850; text-decoration: none; white-space: nowrap; }
    .next-step a:hover { text-decoration: underline; text-underline-offset: 4px; }
    @media (max-width: 720px) { .home-copy { width: 100%; padding: 50px 0 26px; } .home-copy h1 { font-size: 50px; } .home-copy p { font-size: 18px; } .home-actions .btn { flex: 1 1 148px; } .home-contact { width: 100%; } .hero-media { height: 210px; } .next-step { display: block; padding: 30px 0 42px; } .next-step a { margin-top: 14px; } }
  `,
  content: `<main class="home-main">
  <section class="home-hero" aria-labelledby="supermega-heading">
    <div class="home-copy">
      <div class="eyebrow">One place to start</div>
      <h1 id="supermega-heading">SuperMega</h1>
      <p>Open Shop, choose a live demo, or talk to us when your work needs a better system.</p>
      <div class="home-actions">
        <a class="btn primary" href="https://app.supermega.dev/?demo=shop" target="_blank" rel="noopener noreferrer">Open Shop</a>
        <a class="btn secondary" href="https://demo.supermega.dev/" target="_blank" rel="noopener noreferrer">Try demo</a>
        <a class="home-contact" href="/contact/">Need something built?</a>
      </div>
    </div>
    <div class="hero-media"><img src="/live-shop-dashboard.png" alt="Current Shop workspace dashboard" /></div>
  </section>
  <section class="next-step" aria-label="Start with SuperMega">
    <p>Already know where to begin? Open Shop. Want to look around first? Use the demo. For everything else, contact SuperMega.</p>
    <a href="/contact/">Talk to SuperMega</a>
  </section>
</main>`,
})

const contactHtml = documentHtml({
  title: 'Contact | SuperMega',
  description: 'Tell SuperMega what needs to work better.',
  canonical: 'https://supermega.dev/contact/',
  style: `
    .contact-main { display: grid; grid-template-columns: minmax(0, 0.84fr) minmax(340px, 1.16fr); gap: 72px; align-items: start; padding: 80px 0 72px; }
    .contact-copy { padding-top: 18px; }
    .contact-copy h1 { max-width: 10ch; margin: 12px 0 18px; font-size: 70px; line-height: 0.98; letter-spacing: 0; }
    .contact-copy p { max-width: 34ch; margin: 0; color: var(--muted); font-size: 18px; line-height: 1.52; }
    .contact-direct { display: grid; gap: 10px; margin-top: 32px; }
    .contact-direct small { color: var(--muted); font-size: 12px; font-weight: 850; letter-spacing: 0; text-transform: uppercase; }
    .contact-direct-links { display: flex; flex-wrap: wrap; gap: 8px; }
    .contact-direct a { display: inline-flex; min-height: 44px; align-items: center; border: 1px solid var(--line); border-radius: 8px; padding: 0 13px; color: var(--ink); font-size: 14px; font-weight: 800; text-decoration: none; }
    .contact-direct a:hover { border-color: var(--accent); color: var(--accent); }
    .contact-form { display: grid; gap: 18px; border: 1px solid var(--line); border-radius: 8px; padding: 28px; background: var(--surface); box-shadow: var(--shadow); }
    .contact-form h2 { margin: 0; font-size: 20px; line-height: 1.2; }
    .field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .field-grid label { display: grid; gap: 7px; color: var(--muted); font-size: 12px; font-weight: 850; letter-spacing: 0; text-transform: uppercase; }
    .field-grid label.wide { grid-column: 1 / -1; }
    .field-grid input, .field-grid textarea { width: 100%; min-width: 0; border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: var(--page); color: var(--ink); font: inherit; font-size: 16px; letter-spacing: 0; text-transform: none; }
    .field-grid textarea { min-height: 144px; resize: vertical; }
    .field-grid input:focus, .field-grid textarea:focus { outline: 3px solid color-mix(in srgb, var(--accent) 24%, transparent); border-color: var(--accent); }
    .contact-form button { justify-content: center; min-height: 48px; }
    .contact-policy, .form-status { margin: 0; color: var(--muted); font-size: 14px; font-weight: 700; line-height: 1.45; }
    .form-status { min-height: 1.45em; }
    @media (max-width: 820px) { .contact-main { grid-template-columns: 1fr; gap: 32px; padding: 48px 0; } .contact-copy { padding-top: 0; } }
    @media (max-width: 720px) { .contact-copy h1 { max-width: 9ch; font-size: 50px; } .contact-copy p { font-size: 17px; } .field-grid { grid-template-columns: 1fr; } .field-grid label.wide { grid-column: auto; } .contact-form { padding: 20px; } }
  `,
  content: `<main class="contact-main">
  <section class="contact-copy" aria-label="Contact SuperMega">
    <div class="eyebrow">Start with the work</div>
    <h1>Tell us what needs to work better.</h1>
    <p>Send a short note about the task that is slowing the team down. We will recommend the clearest next step.</p>
    <div class="contact-direct" aria-label="Direct contact options">
      <small>Or reach us directly</small>
      <div class="contact-direct-links">
        <a href="viber://chat?number=%2B9595000721">Chat on Viber</a>
        <a href="mailto:swanhtet@supermega.dev">Email SuperMega</a>
        <a href="tel:+9595000721">+95 9 500 0721</a>
      </div>
    </div>
  </section>
  <form class="contact-form" action="/api/contact-submissions" data-sm-contact-form method="post">
    <input type="hidden" name="workflow" value="General enquiry" />
    <input type="hidden" name="first_output" value="General enquiry" />
    <input type="hidden" name="requested_package" value="General enquiry" />
    <input type="hidden" name="product_area" value="General enquiry" />
    <input type="hidden" name="source_url" value="https://supermega.dev/contact/" />
    <input type="hidden" name="page_path" value="/contact/" />
    <input type="hidden" name="referrer" value="" />
    <input type="hidden" name="utm_source" value="" />
    <input type="hidden" name="utm_medium" value="" />
    <input type="hidden" name="utm_campaign" value="" />
    <input type="hidden" name="utm_content" value="" />
    <input type="hidden" name="utm_term" value="" />
    <h2>Contact SuperMega</h2>
    <div class="field-grid">
      <label>Name<input autocomplete="name" name="name" required /></label>
      <label>Work email<input autocomplete="email" name="email" required type="email" /></label>
      <label>Company<input autocomplete="organization" name="company" required /></label>
      <label class="wide">What do you need?<textarea name="goal" required></textarea></label>
    </div>
    <input autocomplete="off" name="website" style="display:none" tabindex="-1" />
    <button class="btn primary" type="submit">Send request</button>
    <p class="contact-policy">We use this note to recommend the clearest next step. No account or data connection is made before you approve it.</p>
    <p class="form-status" data-contact-status aria-live="polite"></p>
  </form>
</main>
<script>(function(){var form=document.querySelector('[data-sm-contact-form]');if(!form)return;function set(name,value){var input=form.querySelector('[name="'+name+'"]');if(input)input.value=value||'';}var search=new URLSearchParams(window.location.search);set('source_url',window.location.href);set('page_path',window.location.pathname+window.location.search);set('referrer',document.referrer||'');['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(key){set(key,search.get(key)||'');});var status=form.querySelector('[data-contact-status]');var submit=form.querySelector('button[type="submit"]');form.addEventListener('submit',async function(event){event.preventDefault();var honeypot=form.querySelector('[name="website"]');if(honeypot&&honeypot.value)return;if(status)status.textContent='Sending...';if(submit){submit.disabled=true;submit.textContent='Sending...';}try{var response=await fetch(form.action,{method:'POST',body:new FormData(form)});var body=await response.json().catch(function(){return {};});if(!response.ok)throw new Error(body.reason||'send_failed');if(status)status.textContent='Request sent.';form.reset();}catch(error){if(status)status.textContent='Could not send here. Email swanhtet@supermega.dev.';}finally{if(submit){submit.disabled=false;submit.textContent='Send request';}}});})();</script>`,
})

const privacyHtml = documentHtml({
  title: 'Privacy | SuperMega',
  description: 'How SuperMega handles contact requests.',
  canonical: 'https://supermega.dev/privacy/',
  style: `
    .privacy-main { max-width: 780px; padding: 78px 0 72px; }
    .privacy-main h1 { max-width: 12ch; margin: 12px 0 18px; font-size: 64px; line-height: 1; letter-spacing: 0; }
    .privacy-main > p { max-width: 54ch; margin: 0; color: var(--muted); font-size: 18px; }
    .privacy-prose { display: grid; gap: 28px; margin-top: 46px; }
    .privacy-prose section { padding-top: 26px; border-top: 1px solid var(--line); }
    .privacy-prose h2 { margin: 0; font-size: 22px; line-height: 1.2; }
    .privacy-prose p { margin: 10px 0 0; color: var(--muted); font-size: 16px; line-height: 1.6; }
    .privacy-prose a { display: inline-flex; min-height: 44px; align-items: center; color: var(--accent); }
    @media (max-width: 720px) { .privacy-main { padding: 50px 0 48px; } .privacy-main h1 { font-size: 48px; } }
  `,
  content: `<main class="privacy-main">
  <div class="eyebrow">Privacy</div>
  <h1>Only the details needed to reply.</h1>
  <p>SuperMega keeps the public site intentionally small. This page explains how a contact request is handled.</p>
  <div class="privacy-prose">
    <section><h2>What we collect</h2><p>When you contact us, we receive the name, work email, company, and request you choose to send.</p></section>
    <section><h2>How we use it</h2><p>We use those details to respond to the request and, if you approve a project, to deliver the agreed work. We do not sell or rent contact details.</p></section>
    <section><h2>Connections and accounts</h2><p>Sending a contact request does not create an account or connect any data source. Any later connection is discussed and approved separately.</p></section>
    <section><h2>Delete a request</h2><p>Email <a href="mailto:swanhtet@supermega.dev">swanhtet@supermega.dev</a> to request deletion of a contact record.</p></section>
  </div>
</main>`,
})

const notFoundHtml = documentHtml({
  title: 'Page not found | SuperMega',
  description: 'The requested page does not exist.',
  canonical: 'https://supermega.dev/404',
  style: `
    .not-found { min-height: 58vh; display: grid; align-content: center; padding: 72px 0; }
    .not-found h1 { margin: 12px 0 18px; font-size: 64px; line-height: 1; letter-spacing: 0; }
    .not-found p { max-width: 38ch; margin: 0; color: var(--muted); font-size: 18px; }
    .not-found .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 28px; }
    @media (max-width: 720px) { .not-found { padding: 48px 0; } .not-found h1 { font-size: 48px; } }
  `,
  content: `<main class="not-found"><div class="eyebrow">404</div><h1>Page not found.</h1><p>That page does not exist. Head back home, open Shop, or try the demo.</p><div class="actions"><a class="btn primary" href="/">Home</a><a class="btn secondary" href="https://demo.supermega.dev/" target="_blank" rel="noopener noreferrer">Try demo</a></div></main>`,
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

async function copyNodeDependency(dependency, functionDir, copiedDependencies) {
  if (copiedDependencies.has(dependency)) return
  copiedDependencies.add(dependency)
  const source = resolve(root, 'node_modules', dependency)
  try {
    await stat(source)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }

  const destination = resolve(functionDir, 'node_modules', dependency)
  await cp(source, destination, { recursive: true, force: true })
  try {
    const packageJson = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'))
    const children = Object.keys({ ...(packageJson.dependencies || {}), ...(packageJson.optionalDependencies || {}) })
    for (const child of children) await copyNodeDependency(child, functionDir, copiedDependencies)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
}

async function writeNodeFunction(name) {
  const functionDir = resolve(functionsDir, `${name}.func`)
  await mkdir(resolve(functionDir, 'api'), { recursive: true })
  await cp(resolve(root, 'api', name), resolve(functionDir, 'api', name), { force: true })
  await cp(resolve(root, 'api', 'lib'), resolve(functionDir, 'api', 'lib'), { recursive: true, force: true })

  const source = await readFile(resolve(root, 'api', name), 'utf8')
  const dependencies = [
    ...(source.includes('supermega-blob-queue') || source.includes('@vercel/blob') ? blobFunctionDependencies : []),
    ...(source.includes('supermega-datastore') || /require\\(['\"]pg['\"]\\)/.test(source) ? pgFunctionDependencies : []),
  ]
  const copiedDependencies = new Set()
  for (const dependency of dependencies) await copyNodeDependency(dependency, functionDir, copiedDependencies)

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
// The public hero uses a visually reviewed capture of the current disposable Shop demo.
await cp(resolve(root, 'tools', 'public-assets', 'live-shop-dashboard.png'), resolve(staticDir, 'live-shop-dashboard.png'), { force: true })
await writeStatic('index.html', homeHtml)
await writeStatic('404.html', notFoundHtml)
await writeStatic('contact/index.html', contactHtml)
await writeStatic('privacy/index.html', privacyHtml)
await writeStatic('robots.txt', 'User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://supermega.dev/sitemap.xml\n')
await writeStatic('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://supermega.dev/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n  <url><loc>https://supermega.dev/contact/</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>\n  <url><loc>https://supermega.dev/privacy/</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>\n</urlset>\n')
await writeStatic('sw.js', "const CACHE_VERSION = 'supermega-front-door-20260713'\nself.addEventListener('install', function(){ self.skipWaiting() })\nself.addEventListener('activate', function(event){ event.waitUntil(caches.keys().then(function(keys){ return Promise.all(keys.map(function(key){ return caches.delete(key) })) }).then(function(){ return self.clients.claim() })) })\n")
await writeStatic('site.webmanifest', `${JSON.stringify({
  name: 'SuperMega',
  short_name: 'SuperMega',
  start_url: '/',
  display: 'browser',
  background_color: '#f6f8fb',
  theme_color: '#111827',
  icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
}, null, 2)}\n`)

await writeNodeFunction('health.js')
await writeNodeFunction('contact-submissions.js')
await writeNodeFunction('not-found.js')
await writeFile(resolve(outputDir, 'config.json'), `${JSON.stringify(vercelConfig, null, 2)}\n`, 'utf8')

console.log('public_vercel_output=ready')
