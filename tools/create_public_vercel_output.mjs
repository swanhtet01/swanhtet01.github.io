import { execFile } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = resolve(root, '.vercel', 'output')
const staticDir = resolve(outputDir, 'static')
const functionsDir = resolve(outputDir, 'functions', 'api')
const manifest = JSON.parse(await readFile(resolve(root, 'site-manifest.json'), 'utf8'))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(manifest.schemaVersion === 'supermega.site-context.v1', 'unsupported_site_manifest')
assert(manifest.brand?.version && manifest.contextVersion && manifest.catalogVersion, 'site_manifest_versions_missing')
assert(Array.isArray(manifest.products) && manifest.products.length === 2, 'site_manifest_requires_commerce_and_production')
assert(manifest.products.map((product) => product.id).join(',') === 'commerce,production', 'site_manifest_product_order_changed')
assert(manifest.company?.publicPricing === false, 'public_pricing_must_remain_hidden')

const brand = manifest.brand

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function canonical(route) {
  return new URL(route, `${manifest.release.productionDomain}/`).href
}

async function currentCommit() {
  for (const candidate of [process.env.SUPERMEGA_RELEASE_COMMIT, process.env.GITHUB_SHA, process.env.VERCEL_GIT_COMMIT_SHA, process.env.COMMIT_SHA]) {
    const releaseId = String(candidate || '').trim().toLowerCase()
    if (/^(?:[0-9a-f]{40}|preview-[a-z0-9-]{8,64})$/.test(releaseId)) return releaseId
  }
  try {
    const result = await run('git', ['rev-parse', 'HEAD'], { cwd: root, windowsHide: true })
    const commit = result.stdout.trim().toLowerCase()
    if (/^[0-9a-f]{40}$/.test(commit)) return commit
  } catch {
    // A source archive can build without .git; CI supplies GITHUB_SHA.
  }
  return 'unknown'
}

const release = {
  service: 'supermega-public-site',
  commit: await currentCommit(),
  brandVersion: brand.version,
  contextVersion: manifest.contextVersion,
  catalogVersion: manifest.catalogVersion,
  generatedAt: new Date().toISOString(),
}

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="SuperMega terminal mark" shape-rendering="geometricPrecision"><rect width="64" height="64" rx="8" fill="${brand.colors.background}"/><rect x="1" y="1" width="62" height="62" rx="7" fill="none" stroke="${brand.colors.ink}" stroke-opacity=".16"/><path d="M13 18 27 32 13 46" fill="none" stroke="${brand.colors.accent}" stroke-width="4.5" stroke-linecap="square" stroke-linejoin="miter"/><path d="M34 46h17" fill="none" stroke="${brand.colors.ink}" stroke-width="4.5" stroke-linecap="square"/></svg>\n`

const sharedStyle = `
  :root {
    color-scheme: light;
    --bg: #f6f4ee;
    --bg-raised: #eef2ec;
    --panel: rgba(255, 255, 255, .92);
    --panel-solid: #ffffff;
    --panel-soft: #eef4ef;
    --ink: #17231d;
    --muted: #56665d;
    --quiet: #7b8980;
    --line: rgba(31, 68, 51, .12);
    --line-strong: rgba(31, 68, 51, .2);
    --blue: #0b745e;
    --blue-strong: #075c4b;
    --green: #0b745e;
    --green-soft: rgba(11, 116, 94, .1);
    --blue-soft: rgba(11, 116, 94, .1);
    --shadow: 0 22px 65px rgba(25, 54, 42, .1);
    --radius: 16px;
  }
  * { box-sizing: border-box; }
  html { min-width: 320px; scroll-behavior: smooth; background: var(--bg); }
  body { min-width: 320px; margin: 0; overflow-x: hidden; background: var(--bg); color: var(--ink); font-family: Geist, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.55; text-rendering: optimizeLegibility; }
  body::before { position: fixed; inset: 0; z-index: -2; background: radial-gradient(circle at 76% -16%, rgba(11,116,94,.12), transparent 34%), linear-gradient(180deg, #fbfaf6 0, var(--bg) 54%, #f2f4ef 100%); content: ""; }
  body::after { display: none; content: ""; }
  a { color: inherit; }
  button, input, select, textarea { font: inherit; }
  img, svg { display: block; max-width: 100%; }
  .shell { min-height: 100svh; }
  .frame { width: min(calc(100% - 48px), 1200px); margin-inline: auto; }
  .site-header { position: sticky; top: 0; z-index: 40; border-bottom: 1px solid var(--line); background: rgba(246,244,238,.9); backdrop-filter: blur(18px); }
  .header-inner { min-height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 18px; }
  .brand { display: inline-flex; min-height: 44px; align-items: center; gap: 12px; text-decoration: none; font-size: 13px; font-weight: 820; letter-spacing: .08em; }
  .brand-mark { color: var(--green); font-family: "SFMono-Regular", Consolas, monospace; font-size: 20px; letter-spacing: -.12em; }
  .brand-name { color: var(--ink); }
  .nav { display: flex; min-width: 0; align-items: center; justify-content: flex-end; gap: 4px; }
  .nav-link { min-height: 44px; display: inline-flex; align-items: center; border-radius: 10px; padding: 0 11px; color: var(--muted); font-size: 13px; font-weight: 720; text-decoration: none; }
  .nav-link:hover, .nav-link[aria-current="page"] { background: var(--green-soft); color: var(--ink); }
  .button { min-height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 9px; border: 1px solid var(--line-strong); border-radius: 12px; padding: 0 18px; background: #fff; color: var(--ink); font-size: 13px; font-weight: 780; text-decoration: none; transition: transform 160ms ease, border-color 160ms ease, background 160ms ease; }
  .button:hover { transform: translateY(-1px); border-color: var(--green); background: var(--green-soft); }
  .button.primary { border-color: var(--green); background: var(--green); color: #fff; box-shadow: 0 12px 28px rgba(11,116,94,.18); }
  .button.primary:hover { background: var(--blue-strong); }
  .button.compact { min-height: 44px; padding-inline: 15px; }
  .eyebrow { display: inline-flex; align-items: center; gap: 9px; color: var(--green); font-family: "SFMono-Regular", Consolas, monospace; font-size: 12px; font-weight: 760; letter-spacing: .04em; text-transform: uppercase; }
  .eyebrow::before { width: 7px; height: 7px; border-radius: 50%; background: currentColor; content: ""; }
  h1, h2, h3, p { margin-top: 0; }
  h1 { margin-bottom: 18px; font-size: clamp(42px, 5vw, 68px); line-height: .98; letter-spacing: -.058em; }
  h2 { margin-bottom: 12px; font-size: clamp(28px, 3.4vw, 44px); line-height: 1.04; letter-spacing: -.04em; }
  h3 { margin-bottom: 9px; font-size: 20px; line-height: 1.2; letter-spacing: -.02em; }
  .lede { max-width: 720px; color: var(--muted); font-size: clamp(18px, 2vw, 23px); line-height: 1.55; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 30px; }
  .hero { display: grid; grid-template-columns: minmax(0, .96fr) minmax(400px, 1.04fr); gap: 52px; align-items: center; padding: 52px 0 58px; }
  .hero-copy { position: relative; z-index: 2; }
  .hero h1 { max-width: 820px; margin-top: 20px; }
  .hero-note { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 34px; color: var(--quiet); font-size: 12px; font-weight: 720; }
  .hero-note span { display: inline-flex; align-items: center; gap: 7px; }
  .hero-note span::before { color: var(--green); content: "✓"; }
  .workspace { overflow: hidden; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--panel-solid); box-shadow: var(--shadow); }
  .workspace-bar { min-height: 48px; display: flex; align-items: center; justify-content: space-between; gap: 14px; border-bottom: 1px solid var(--line); padding: 0 16px; color: var(--quiet); font-family: "SFMono-Regular", Consolas, monospace; font-size: 11px; }
  .workspace-dots { display: flex; gap: 6px; }
  .workspace-dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--quiet); opacity: .55; }
  .workspace-body { display: grid; grid-template-columns: 150px minmax(0,1fr); min-height: 430px; }
  .workspace-nav { border-right: 1px solid var(--line); padding: 18px 12px; }
  .workspace-nav strong { display: block; margin: 0 8px 18px; font-size: 13px; }
  .workspace-nav span { display: block; margin-bottom: 5px; border-radius: 8px; padding: 9px 10px; color: var(--quiet); font-size: 11px; font-weight: 680; }
  .workspace-nav span.active { background: var(--blue-soft); color: var(--blue-strong); }
  .workspace-main { padding: 22px; }
  .workspace-title { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 22px; }
  .workspace-title strong { font-size: 18px; }
  .workspace-title small { display: block; margin-top: 4px; color: var(--quiet); }
  .live-pill, .status-pill { display: inline-flex; min-height: 28px; align-items: center; gap: 7px; border: 1px solid rgba(11,116,94,.2); border-radius: 999px; padding: 0 10px; background: var(--green-soft); color: var(--green); font-size: 10px; font-weight: 760; text-transform: uppercase; }
  .live-pill::before, .status-pill::before { width: 6px; height: 6px; border-radius: 50%; background: currentColor; content: ""; }
  .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .metric { min-height: 94px; border: 1px solid var(--line); border-radius: 13px; padding: 14px; background: var(--panel-soft); }
  .metric span { color: var(--quiet); font-size: 10px; text-transform: uppercase; }
  .metric strong { display: block; margin-top: 14px; font-size: 15px; }
  .work-list { margin-top: 12px; border: 1px solid var(--line); border-radius: 13px; padding: 8px 14px; background: #fff; }
  .work-row { display: grid; grid-template-columns: 1fr 84px; gap: 14px; align-items: center; min-height: 53px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 11px; }
  .work-row:last-child { border-bottom: 0; }
  .progress { height: 6px; overflow: hidden; border-radius: 999px; background: var(--line); }
  .progress i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--blue), var(--green)); }
  .section { padding: 72px 0; border-top: 1px solid var(--line); }
  .section-head { max-width: 760px; margin-bottom: 30px; }
  .section-head h2 { margin-top: 17px; }
  .section-head p { color: var(--muted); font-size: 18px; }
  .surface-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
  .surface-card { min-height: 260px; display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: var(--radius); padding: 28px; background: var(--panel-solid); box-shadow: 0 12px 34px rgba(25,54,42,.055); }
  .surface-card > span { color: var(--green); font-family: "SFMono-Regular", Consolas, monospace; font-size: 10px; }
  .surface-card h3 { margin-top: 46px; font-size: 31px; }
  .surface-card p { margin: 0; color: var(--muted); }
  .surface-card small { margin-top: auto; padding-top: 24px; color: var(--quiet); font-size: 11px; }
  .product-grid, .template-grid, .principle-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
  .product-card, .template-card, .principle-card, .module-card, .case-card { position: relative; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius); padding: 30px; background: var(--panel-solid); box-shadow: 0 12px 34px rgba(25,54,42,.055); }
  .product-card::after { position: absolute; width: 220px; height: 220px; top: -130px; right: -80px; border-radius: 50%; background: var(--blue); opacity: .12; filter: blur(2px); content: ""; }
  .product-card.production::after { background: var(--green); }
  .card-index { color: var(--quiet); font-family: "SFMono-Regular", Consolas, monospace; font-size: 11px; }
  .product-card h3 { margin-top: 54px; font-size: clamp(34px,4vw,54px); }
  .product-card p { max-width: 520px; color: var(--muted); }
  .card-link { display: inline-flex; min-height: 44px; align-items: center; margin-top: 20px; color: var(--blue-strong); font-weight: 760; text-decoration: none; }
  .card-link::after { margin-left: 8px; content: "→"; }
  .split { display: grid; grid-template-columns: minmax(0,.8fr) minmax(0,1.2fr); gap: 70px; align-items: start; }
  .sticky-copy { position: sticky; top: 112px; }
  .module-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
  .module-card { min-height: 150px; padding: 22px; }
  .module-card span { color: var(--blue); font-family: "SFMono-Regular", Consolas, monospace; font-size: 11px; }
  .module-card strong { display: block; margin-top: 34px; font-size: 16px; }
  .template-card { min-height: 220px; display: flex; flex-direction: column; align-items: flex-start; }
  .template-card p { color: var(--muted); }
  .template-card .card-link { margin-top: auto; }
  .product-label { display: inline-flex; min-height: 30px; align-items: center; border: 1px solid var(--line); border-radius: 999px; padding: 0 10px; color: var(--muted); font-size: 11px; font-weight: 760; }
  .callout { display: grid; grid-template-columns: 1fr auto; gap: 34px; align-items: center; border: 1px solid rgba(11,116,94,.2); border-radius: var(--radius); padding: 36px; background: linear-gradient(120deg, rgba(11,116,94,.1), rgba(255,255,255,.76)); }
  .callout p { max-width: 700px; margin: 0; color: var(--muted); }
  .steps { counter-reset: step; display: grid; gap: 0; border-top: 1px solid var(--line); }
  .step { counter-increment: step; display: grid; grid-template-columns: 54px 1fr; gap: 22px; border-bottom: 1px solid var(--line); padding: 25px 0; }
  .step::before { color: var(--blue); font-family: "SFMono-Regular", Consolas, monospace; font-size: 12px; content: "0" counter(step); }
  .step p { margin: 5px 0 0; color: var(--muted); }
  .page-hero { max-width: 930px; padding: 90px 0 78px; }
  .page-hero h1 { margin-top: 18px; }
  .page-hero .lede { max-width: 790px; }
  .case-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 14px; }
  .case-card { min-height: 250px; padding: 24px; }
  .case-card p { color: var(--muted); }
  .case-card span { color: var(--green); font-family: "SFMono-Regular", Consolas, monospace; font-size: 11px; }
  .principle-grid { grid-template-columns: repeat(3,minmax(0,1fr)); }
  .principle-card { min-height: 235px; padding: 24px; }
  .principle-card p { color: var(--muted); }
  .contact-layout { display: grid; grid-template-columns: minmax(0,.78fr) minmax(430px,1.22fr); gap: 76px; align-items: start; padding-bottom: 110px; }
  .contact-copy { padding-top: 24px; }
  .contact-copy p { color: var(--muted); font-size: 18px; }
  .direct-links { display: grid; margin-top: 34px; border-top: 1px solid var(--line); }
  .direct-links a { min-height: 55px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--line); color: var(--muted); text-decoration: none; }
  .direct-links a:hover { color: var(--ink); }
  .contact-form { display: grid; gap: 18px; border: 1px solid var(--line-strong); border-radius: var(--radius); padding: 30px; background: var(--panel); box-shadow: var(--shadow); }
  .field-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; }
  label { display: grid; gap: 7px; color: var(--muted); font-size: 12px; font-weight: 700; }
  label.wide { grid-column: 1/-1; }
  input, select, textarea { width: 100%; min-width: 0; border: 1px solid var(--line); border-radius: 11px; padding: 13px 14px; background: #fff; color: var(--ink); outline: none; }
  input:focus, select:focus, textarea:focus { border-color: var(--green); box-shadow: 0 0 0 3px rgba(11,116,94,.1); }
  textarea { min-height: 150px; resize: vertical; }
  .form-note, .form-status { margin: 0; color: var(--quiet); font-size: 12px; }
  .form-status { min-height: 1.5em; color: var(--green); }
  .prose { max-width: 820px; padding-bottom: 100px; }
  .prose section { display: grid; grid-template-columns: 220px 1fr; gap: 42px; border-top: 1px solid var(--line); padding: 30px 0; }
  .prose p { color: var(--muted); }
  .site-footer { margin-top: 32px; border-top: 1px solid var(--line); padding: 34px 0 48px; }
  .footer-inner { display: flex; align-items: center; justify-content: space-between; gap: 24px; color: var(--quiet); font-size: 12px; }
  .footer-links { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 18px; }
  .footer-links a { min-height: 44px; display: inline-flex; align-items: center; text-decoration: none; }
  .footer-links a:hover { color: var(--ink); }
  .system-preview { transform: none; border-radius: 8px; }
  .system-preview-body { padding: 24px; }
  .system-kicker { margin-bottom: 18px; color: var(--quiet); font-family: "SFMono-Regular", Consolas, monospace; font-size: 10px; letter-spacing: .1em; }
  .system-flow { display: grid; border-top: 1px solid var(--line); }
  .system-row { min-height: 55px; display: grid; grid-template-columns: 34px 112px minmax(0, 1fr) 10px; gap: 12px; align-items: center; border-bottom: 1px solid var(--line); }
  .system-row > span { color: var(--green); font-family: "SFMono-Regular", Consolas, monospace; font-size: 10px; }
  .system-row strong { font-size: 13px; }
  .system-row small { color: var(--quiet); font-size: 10px; }
  .system-row i { width: 7px; height: 7px; border-radius: 50%; background: var(--green); }
  .system-boundary { display: grid; gap: 5px; margin-top: 22px; border-left: 2px solid var(--green); padding: 4px 0 4px 14px; }
  .system-boundary span { color: var(--green); font-family: "SFMono-Regular", Consolas, monospace; font-size: 9px; letter-spacing: .08em; }
  .system-boundary strong { color: var(--muted); font-size: 11px; font-weight: 650; }
  .solution-stack { display: grid; gap: 16px; }
  .solution-block { display: grid; grid-template-columns: minmax(0, .9fr) minmax(340px, 1.1fr); gap: 56px; align-items: start; border: 1px solid var(--line); border-radius: var(--radius); padding: 40px; background: var(--panel-solid); }
  .solution-block h3 { margin-top: 24px; font-size: clamp(30px, 4vw, 48px); }
  .solution-block p { color: var(--muted); }
  .solution-modules { display: grid; border-top: 1px solid var(--line); }
  .solution-modules span { min-height: 48px; display: grid; grid-template-columns: 32px 1fr; gap: 10px; align-items: center; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; }
  .solution-modules i { color: var(--green); font-family: "SFMono-Regular", Consolas, monospace; font-size: 9px; font-style: normal; }
  .template-catalog { margin-top: 54px; scroll-margin-top: 92px; }
  .template-tags { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 18px; }
  .template-tags span { min-height: 38px; display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 999px; padding: 0 13px; color: var(--muted); font-size: 11px; }
  .trust-compact { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .trust-compact .principle-card { min-height: 210px; }
  .operating-map { display: grid; grid-template-columns: minmax(0,.84fr) minmax(0,1.16fr); gap: 14px; }
  .operating-cards { grid-column: 1/-1; display: grid; grid-template-columns: minmax(0,.84fr) minmax(0,1.16fr); gap: 14px; }
  .operating-surface { min-height: 270px; border: 1px solid var(--line); border-radius: var(--radius); padding: 26px; background: var(--panel-solid); }
  .operating-surface.product-surface { display: grid; grid-template-columns: minmax(0,.72fr) minmax(300px,1.28fr); gap: 24px; }
  .operating-surface h3 { margin-top: 34px; font-size: 28px; }
  .operating-surface p { color: var(--muted); font-size: 13px; }
  .operating-list { display: grid; margin-top: 20px; border-top: 1px solid var(--line); }
  .operating-list span { min-height: 42px; display: flex; align-items: center; justify-content: space-between; gap: 18px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 11px; }
  .operating-list b { color: var(--green); font-family: "SFMono-Regular", Consolas, monospace; font-size: 9px; font-weight: 720; }
  .lifecycle-rail { display: grid; align-content: center; gap: 7px; }
  .lifecycle-rail span { min-height: 40px; display: grid; grid-template-columns: 30px 86px 1fr; gap: 10px; align-items: center; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 10px; }
  .lifecycle-rail i { color: var(--green); font-family: "SFMono-Regular", Consolas, monospace; font-size: 9px; font-style: normal; }
  .lifecycle-rail strong { color: var(--ink); font-size: 11px; }
  .control-line { grid-column: 1/-1; display: flex; align-items: center; justify-content: space-between; gap: 22px; border: 1px solid rgba(11,116,94,.2); border-radius: var(--radius); padding: 18px 22px; background: var(--green-soft); }
  .control-line p { max-width: 760px; margin: 0; color: var(--muted); font-size: 12px; }
  .compact-solutions { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; }
  .compact-solution { min-width: 0; border: 1px solid var(--line); border-radius: var(--radius); padding: 28px; background: var(--panel-solid); }
  .compact-solution h3 { margin: 20px 0 9px; font-size: 30px; }
  .compact-solution > p { min-height: 62px; color: var(--muted); font-size: 13px; }
  .module-tags { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 5px; margin-top: 18px; }
  .module-tags span { min-height: 34px; display: flex; align-items: center; border: 1px solid var(--line); border-radius: 4px; padding: 0 9px; color: var(--muted); font-size: 9px; }
  .template-line { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 16px; border-top: 1px solid var(--line); padding-top: 14px; }
  .template-line span { color: var(--quiet); font-family: "SFMono-Regular", Consolas, monospace; font-size: 8px; }
  .closing-strip { display: grid; grid-template-columns: 1fr auto; gap: 30px; align-items: center; margin-top: 14px; border: 1px solid rgba(11,116,94,.2); border-radius: var(--radius); padding: 24px 28px; background: linear-gradient(120deg, rgba(11,116,94,.1), rgba(255,255,255,.78)); }
  .closing-strip h2 { margin-bottom: 6px; font-size: 27px; }
  .closing-strip p { margin: 0; color: var(--muted); font-size: 12px; }
  .mobile-rail-label { display: none; }
  :focus-visible { outline: 3px solid rgba(11,116,94,.34); outline-offset: 3px; }
  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } *, *::before, *::after { transition-duration: .01ms !important; } }
  @media (max-width: 980px) { .hero { grid-template-columns: 1fr; gap: 42px; padding-top: 60px; } .hero-copy { max-width: 820px; } .workspace { transform: none; } .split, .solution-block, .operating-map { grid-template-columns: 1fr; gap: 30px; } .operating-cards { grid-template-columns: 1fr; gap: 30px; } .sticky-copy { position: static; } .surface-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } .surface-card:last-child { grid-column: 1/-1; min-height: 210px; } .principle-grid, .trust-compact { grid-template-columns: repeat(2,minmax(0,1fr)); } .contact-layout { grid-template-columns: 1fr; gap: 42px; } }
  @media (max-width: 760px) { .frame { width: min(calc(100% - 30px), 1200px); } .header-inner { min-height: 62px; gap: 10px; } .brand { gap: 8px; font-size: 11px; } .nav-link { padding-inline: 8px; } .nav-optional { display: none; } .header-cta { min-height: 42px; padding-inline: 13px; } .hero, .page-hero { padding-top: 46px; } .hero { padding-bottom: 52px; } .workspace-body { grid-template-columns: 1fr; min-height: 0; } .workspace-nav { display: none; } .workspace-main { padding: 16px; } .metric-grid { grid-template-columns: 1fr; } .metric { min-height: 76px; } .surface-grid, .product-grid, .template-grid, .module-grid, .principle-grid, .trust-compact, .case-grid, .compact-solutions { grid-template-columns: 1fr; } .surface-card, .surface-card:last-child { grid-column: auto; min-height: 220px; } .solution-block { padding: 24px; } .system-preview-body { padding: 18px; } .system-row { grid-template-columns: 28px 92px minmax(0, 1fr); } .system-row i { display: none; } .section { padding: 50px 0; } .operating-surface.product-surface { grid-template-columns: 1fr; } .control-line, .closing-strip { display: grid; grid-template-columns: 1fr; } .callout { grid-template-columns: 1fr; } .callout { padding: 26px; } .contact-form { padding: 20px; } .field-grid { grid-template-columns: 1fr; } label.wide { grid-column: auto; } .prose section { grid-template-columns: 1fr; gap: 6px; } .footer-inner { display: grid; } .footer-links { justify-content: flex-start; } }
  @media (max-width: 760px) {
    .hero { gap: 30px; padding-top: 34px; padding-bottom: 40px; }
    .hero h1 { margin-top: 14px; }
    .lede { font-size: 17px; line-height: 1.45; }
    .actions { margin-top: 22px; }
    .actions .button { width: 100%; }
    .hero-note { display: grid; gap: 7px; margin-top: 22px; }
    .system-preview-body { padding: 14px; }
    .system-kicker { margin-bottom: 10px; }
    .system-row { min-height: 44px; grid-template-columns: 24px 80px minmax(0, 1fr); gap: 8px; }
    .system-boundary { margin-top: 14px; }
    .section { padding: 40px 0; }
    .section-head { margin-bottom: 22px; }
    .section-head p { font-size: 16px; }
    .mobile-rail-label { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0; color: var(--quiet); font-family: "SFMono-Regular", Consolas, monospace; font-size: 10px; font-weight: 720; letter-spacing: .04em; text-transform: uppercase; }
    .mobile-rail-label::after { color: var(--green); content: "SWIPE >"; }
    .operating-map { gap: 16px; }
    .operating-cards, .compact-solutions { display: grid; grid-auto-flow: column; grid-auto-columns: 86%; grid-template-columns: none; gap: 10px; overflow-x: auto; overscroll-behavior-inline: contain; padding-bottom: 12px; scroll-padding-inline: 0; scroll-snap-type: x mandatory; scrollbar-color: var(--green) var(--line); scrollbar-width: thin; }
    .operating-cards > *, .compact-solutions > * { scroll-snap-align: start; }
    .operating-surface { min-height: 0; }
    .operating-surface.product-surface { display: block; }
    .lifecycle-rail { margin-top: 18px; }
    .compact-solution > p { min-height: 0; }
    .closing-strip { margin-top: 18px; padding: 22px; }
  }
  @media (max-width: 420px) { .nav-link { display: none; } h1 { font-size: 38px; } .product-card { padding: 24px; } .compact-solution, .operating-surface { padding: 22px; } }
`

function brandHtml() {
  return `<a class="brand" href="/" aria-label="SuperMega home"><span class="brand-mark" aria-hidden="true">&gt;_</span><span class="brand-name">SUPERMEGA</span></a>`
}

function headerHtml() {
  return `<header class="site-header"><div class="frame header-inner">${brandHtml()}<a class="button primary compact header-cta" href="https://app.supermega.dev/">Open workspace</a></div></header>`
}

function footerHtml() {
  return `<footer class="site-footer"><div class="frame footer-inner"><span>© ${new Date().getUTCFullYear()} SuperMega · Accountable company software.</span><span class="footer-links"><a href="/contact/">Contact</a><a href="/privacy/">Privacy</a></span></div></footer>`
}

function documentHtml({ route, title, description, content, robots = 'index,follow' }) {
  const url = canonical(route)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="robots" content="${robots}" />
    <meta name="theme-color" content="${brand.colors.background}" />
    <meta name="supermega-brand-version" content="${escapeHtml(brand.version)}" />
    <meta name="supermega-context-version" content="${escapeHtml(manifest.contextVersion)}" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(url)}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=${escapeHtml(brand.version)}" />
    <link rel="manifest" href="/site.webmanifest" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SuperMega" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    <meta name="twitter:card" content="summary" />
    <style>${sharedStyle}</style>
  </head>
  <body data-brand-version="${escapeHtml(brand.version)}" data-context-version="${escapeHtml(manifest.contextVersion)}">
    <div class="shell">${headerHtml(route)}${content}${footerHtml()}</div>
  </body>
</html>`
}

function workspacePreview() {
  const rows = [
    ['01', 'Today', 'Work, exceptions, and owner decisions'],
    ['02', 'Product', 'Discover, define, build, release, learn'],
    ['03', 'Commerce', 'Channel order, stock, fulfilment, close'],
    ['04', 'Production', 'Plan, output, quality, equipment, handoff'],
  ]
  return `<div class="workspace system-preview" aria-label="SuperMega operating system preview">
    <div class="workspace-bar"><span>&gt;_ supermega / company-system</span><span class="live-pill">Local trial</span></div>
    <div class="system-preview-body">
      <div class="system-kicker">ONE OPERATING LAYER</div>
      <div class="system-flow">${rows.map(([index, title, copy]) => `<div class="system-row"><span>${index}</span><strong>${title}</strong><small>${copy}</small><i></i></div>`).join('')}</div>
      <div class="system-boundary"><span>HUMAN CONTROL</span><strong>External sends · payments · publishing · production changes</strong></div>
    </div>
  </div>`
}

const mobileRailScript = `<script>(function(){var media=window.matchMedia('(max-width: 760px)'),reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches,rails=Array.from(document.querySelectorAll('[data-mobile-rail]'));function sync(){rails.forEach(function(rail){if(media.matches){rail.tabIndex=0;rail.setAttribute('aria-describedby',rail.dataset.mobileDescription);rail.setAttribute('aria-label',rail.dataset.mobileLabel);rail.setAttribute('aria-keyshortcuts','ArrowLeft ArrowRight Home End');}else{rail.tabIndex=-1;rail.removeAttribute('aria-describedby');rail.removeAttribute('aria-label');rail.removeAttribute('aria-keyshortcuts');}});}rails.forEach(function(rail){rail.addEventListener('keydown',function(event){if(!media.matches||event.target!==rail||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||rail.scrollWidth<=rail.clientWidth)return;var keys=['ArrowLeft','ArrowRight','Home','End'];if(keys.indexOf(event.key)===-1)return;var cards=Array.from(rail.children),stride=cards[1]?cards[1].offsetLeft-cards[0].offsetLeft:rail.clientWidth,current=Math.round(rail.scrollLeft/Math.max(stride,1)),target=event.key==='Home'?0:event.key==='End'?cards.length-1:Math.max(0,Math.min(cards.length-1,current+(event.key==='ArrowRight'?1:-1)));rail.scrollTo({left:cards[target].offsetLeft-cards[0].offsetLeft,behavior:reduced?'auto':'smooth'});event.preventDefault();});});sync();if(media.addEventListener)media.addEventListener('change',sync);else media.addListener(sync);})();</script>`

const homeHtml = documentHtml({
  route: '/',
  title: 'SuperMega | Operating software for real company work',
  description: manifest.company.statement,
  content: `<main>
    <section class="frame hero"><div class="hero-copy"><span class="eyebrow">${escapeHtml(manifest.company.positioning)}</span><h1>${escapeHtml(manifest.company.headline)}</h1><p class="lede">${escapeHtml(manifest.company.supporting)}</p><div class="actions"><a class="button primary" href="https://app.supermega.dev/">Explore the product workspace</a></div><div class="hero-note"><span>Channels people already use</span><span>Evidence with the work</span><span>Human authority where it matters</span></div></div>${workspacePreview()}</section>
    <section class="frame section" id="product" aria-labelledby="product-heading"><div class="section-head"><span class="eyebrow">Company system</span><h2 id="product-heading">Product is a working lifecycle, not another showcase page.</h2><p>Today, Teams, and Operations share owners, outcomes, evidence, exceptions, release checks, and decisions.</p></div><div class="operating-map"><p class="mobile-rail-label" id="company-system-rail-hint">2 operating views</p><div class="operating-cards" role="list" tabindex="-1" data-mobile-rail data-mobile-description="company-system-rail-hint" data-mobile-label="Company operating views. Swipe or use left and right arrow keys."><article class="operating-surface" role="listitem"><span class="card-index">01 / TODAY</span><h3>One queue for the company.</h3><p>See delivery, customer orders, production exceptions, release readiness, and approvals without rebuilding context.</p><div class="operating-list"><span>Company work <b>OWNED</b></span><span>Operating exceptions <b>VISIBLE</b></span><span>Owner decisions <b>GATED</b></span></div></article><article class="operating-surface product-surface" role="listitem"><div><span class="card-index">02 / PRODUCT TEAM</span><h3>From signal to evidence.</h3><p>Product, Engineering, Growth, and Finance use one accountable work contract.</p></div><div class="lifecycle-rail">${[['01','Discover','Customer signal'],['02','Define','Outcome and acceptance'],['03','Build','Delivery and tests'],['04','Release','Checks and identity'],['05','Learn','Usage and next decision']].map(([index,title,copy]) => `<span><i>${index}</i><strong>${title}</strong>${copy}</span>`).join('')}</div></article></div><div class="control-line" id="trust"><span class="eyebrow">Control boundary</span><p>Assistance may organize, inspect, summarize, and draft from approved records. Sends, payments, publishing, access changes, and production writes wait for the responsible owner.</p></div></div></section>
    <section class="frame section" id="operations"><div class="section-head"><span class="eyebrow">Focused operating modules</span><h2>Two operational wedges. One company foundation.</h2><p>Commerce and Production model accountable records and actions in browser-local workspaces. Templates change the starting workflow, not the brand or core controls.</p></div><p class="mobile-rail-label" id="operations-rail-hint">2 operating modules</p><div class="compact-solutions" role="list" tabindex="-1" data-mobile-rail data-mobile-description="operations-rail-hint" data-mobile-label="Operating modules. Swipe or use left and right arrow keys.">${manifest.products.map((product, index) => `<article class="compact-solution" id="${escapeHtml(product.id)}" role="listitem"><span class="card-index">0${index + 1} / ${escapeHtml(product.eyebrow)}</span><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.description)}</p><div class="module-tags">${product.modules.map((module) => `<span>${escapeHtml(module)}</span>`).join('')}</div><div class="template-line">${product.templates.map((template) => `<span>${escapeHtml(template.name)}</span>`).join('')}</div><a class="card-link" href="${escapeHtml(product.primaryCta.url)}">${escapeHtml(product.primaryCta.label)}</a></article>`).join('')}</div><div class="closing-strip"><div><h2>Start with one real workflow.</h2><p>Send the channel, record, owner, and outcome. SuperMega will define the smallest useful implementation and acceptance test.</p></div><a class="button primary" href="/contact/">Contact SuperMega</a></div></section>
  </main>${mobileRailScript}`,
})

const contactScript = `<script>(function(){var form=document.querySelector('[data-contact-form]');if(!form)return;var query=new URLSearchParams(location.search),status=form.querySelector('[data-form-status]'),submit=form.querySelector('button[type="submit"]'),product=form.querySelector('[name="product"]'),template=form.querySelector('[name="template"]'),requestKey=form.querySelector('[name="idempotency_key"]'),source=form.querySelector('[name="source_url"]'),referrer=form.querySelector('[name="referrer"]');function newKey(){if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();var bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes,function(value){return value.toString(16).padStart(2,'0')}).join('')}if(query.get('product')&&product)product.value=query.get('product');if(query.get('template')&&template)template.value=query.get('template');form.addEventListener('submit',async function(event){event.preventDefault();status.textContent='Sending...';submit.disabled=true;if(!requestKey.value)requestKey.value=newKey();source.value=location.href;referrer.value=document.referrer||'';var payload=Object.fromEntries(new FormData(form).entries());try{var response=await fetch('/api/contact-submissions',{method:'POST',headers:{'content-type':'application/json','accept':'application/json','x-idempotency-key':requestKey.value},body:JSON.stringify(payload)});var body=await response.json().catch(function(){return {};});if(!response.ok)throw new Error(body.reason||'send_failed');form.reset();requestKey.value='';status.textContent='Request received. We will reply with the clearest next step.';}catch(error){status.textContent=error&&error.message==='rate_limited'?'Too many requests from this connection. Please wait ten minutes or email swanhtet@supermega.dev.':'Could not route the request here. Email swanhtet@supermega.dev.';}finally{submit.disabled=false;}});})();</script>`

const contactHtml = documentHtml({
  route: '/contact/',
  title: 'Contact | SuperMega',
  description: 'Tell SuperMega which company workflow should run better.',
  content: `<main class="frame"><section class="page-hero"><span class="eyebrow">Start a system</span><h1>What should run better?</h1><p class="lede">Describe one real workflow or recurring handoff, and note any screenshot or spreadsheet you can share. We will reply with the smallest useful system step.</p></section><section class="contact-layout"><div class="contact-copy"><h2>Start with the work.</h2><p>No account, data connection, automation, or external action begins from this form. We first identify the operating records, owner, acceptance test, and authority boundary.</p><div class="direct-links"><a href="mailto:swanhtet@supermega.dev"><span>Email</span><strong>swanhtet@supermega.dev &gt;</strong></a><a href="tel:+9595000721"><span>Phone</span><strong>+95 9 500 0721 &gt;</strong></a></div></div><form class="contact-form" action="/api/contact-submissions" method="post" data-contact-form><h3>Send the workflow</h3><div class="field-grid"><label>Name<input name="name" autocomplete="name" required maxlength="120" /></label><label>Work email<input name="email" type="email" autocomplete="email" required maxlength="180" /></label><label class="wide">Company<input name="company" autocomplete="organization" required maxlength="180" /></label><label>Starting point<select name="product"><option value="guide">Help me choose</option><option value="company-system">Company system</option><option value="product-team">Product team</option><option value="commerce">Commerce / website-to-order workflow</option><option value="production">Production operations</option></select></label><label>Template, if known<input name="template" maxlength="120" /></label><label class="wide">What happens now, and what should be better?<textarea name="goal" required maxlength="4000"></textarea></label></div><input type="hidden" name="source_url" /><input type="hidden" name="referrer" /><input type="hidden" name="idempotency_key" /><input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" /><button class="button primary" type="submit">Send workflow</button><p class="form-note">Your note is used only to respond and prepare the agreed next step.</p><p class="form-status" data-form-status aria-live="polite"></p></form></section></main>${contactScript}`,
})

const privacyHtml = documentHtml({
  route: '/privacy/',
  title: 'Privacy | SuperMega',
  description: 'How SuperMega handles public contact requests and product implementation data.',
  content: `<main class="frame"><section class="page-hero"><span class="eyebrow">Privacy</span><h1>Collect what the work requires. Protect the rest.</h1><p class="lede">The public site uses the details you choose to send so SuperMega can respond to your request.</p></section><div class="prose"><section><h3>Contact requests</h3><p>We receive your name, work email, company, selected product or template, request, source page, and referrer. We use them to reply, qualify the workflow, and prepare the next agreed step.</p></section><section><h3>Product data</h3><p>Sending a request does not create an account or connect a source. Product access, imports, retention, roles, and integrations are agreed separately before implementation.</p></section><section><h3>AI processing</h3><p>Governed assistance is configured only against approved sources and roles. Consequential external actions remain behind explicit approval.</p></section><section><h3>Sharing</h3><p>We do not sell contact details. Service providers are used only where needed to host, secure, communicate, or deliver the agreed system.</p></section><section><h3>Deletion</h3><p>Email <a href="mailto:swanhtet@supermega.dev">swanhtet@supermega.dev</a> to request correction or deletion of a public contact record.</p></section></div></main>`,
})

const notFoundHtml = documentHtml({
  route: '/404',
  title: 'Page not found | SuperMega',
  description: 'The requested SuperMega route does not exist.',
  robots: 'noindex,nofollow',
  content: `<main class="frame"><section class="page-hero"><span class="eyebrow">404 / route retired</span><h1>That page is no longer part of SuperMega.</h1><p class="lede">The public product is now one focused page.</p><div class="actions"><a class="button primary" href="/">Return home</a></div></section></main>`,
})

const healthFunction = `'use strict'
const release = ${JSON.stringify(release)}
module.exports = async function handler(_req, res) {
  res.statusCode = 200
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify({ ok: true, status: 'ready', service: release.service, brand_version: release.brandVersion, context_version: release.contextVersion, catalog_version: release.catalogVersion, commit: release.commit }))
}
`

const notFoundFunction = `'use strict'
module.exports = function handler(_req, res) {
  res.statusCode = 404
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify({ status: 'not_found' }))
}
`

const contactFunction = `'use strict'
const { createHash, createHmac } = require('node:crypto')

const RATE_LIMIT = 5
const RATE_WINDOW_MS = 10 * 60 * 1000
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_LIMIT = 2000
const CONTACT_FINGERPRINT_VERSION = 1
const CONTACT_FINGERPRINT_ALGORITHM = 'sha256'
const replayCache = new Map()
const rateBuckets = new Map()

const text = (value, max = 4000) => String(value || '').trim().slice(0, max)
const env = (name) => text(process.env[name], 2000)
const emailOk = (value) => /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value)
const idempotencySecret = () => {
  const value = env('SUPERMEGA_CONTACT_IDEMPOTENCY_SECRET')
  return value.length >= 32 ? value : ''
}
const deliveryConfigured = () => Boolean((env('SUPABASE_URL') && env('SUPABASE_SERVICE_ROLE_KEY')) || env('RESEND_API_KEY') || (env('TELEGRAM_BOT_TOKEN') && env('TELEGRAM_CHAT_ID')) || env('SUPERMEGA_LEAD_WEBHOOK_URL'))
const configured = () => Boolean(idempotencySecret() && deliveryConfigured())

function send(res, statusCode, body, headers = {}) {
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value)
  res.end(JSON.stringify(body))
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    if (Buffer.byteLength(JSON.stringify(req.body), 'utf8') > 131072) throw new Error('request_too_large')
    return req.body
  }
  let raw = typeof req.body === 'string' ? req.body : ''
  if (!raw) {
    for await (const chunk of req) {
      raw += chunk
      if (raw.length > 131072) throw new Error('request_too_large')
    }
  }
  const type = text(req.headers?.['content-type'], 120).toLowerCase()
  if (type.includes('application/json')) return JSON.parse(raw || '{}')
  return Object.fromEntries(new URLSearchParams(raw))
}

function normalizePayload(payload) {
  const requestedProduct = text(payload.product, 40).toLowerCase()
  const product = requestedProduct === 'shop' ? 'commerce' : requestedProduct === 'plant' ? 'production' : requestedProduct
  return {
    name: text(payload.name, 120),
    email: text(payload.email, 180).toLowerCase(),
    company: text(payload.company, 180),
    product: ['commerce', 'production', 'product-team', 'company-system', 'guide'].includes(product) ? product : 'guide',
    template: text(payload.template, 120),
    goal: text(payload.goal, 4000),
    source_url: text(payload.source_url, 700),
    referrer: text(payload.referrer, 700),
  }
}

function keyedDigest(value) {
  return createHmac('sha256', idempotencySecret()).update(value).digest('hex')
}

function payloadFingerprint(safe) {
  return createHash(CONTACT_FINGERPRINT_ALGORITHM).update('supermega.contact.payload.v1\\n' + JSON.stringify(safe)).digest('hex')
}

function pruneCaches(now) {
  for (const [key, value] of replayCache) if (value.expiresAt <= now) replayCache.delete(key)
  for (const [key, value] of rateBuckets) if (value.resetAt <= now) rateBuckets.delete(key)
  while (replayCache.size > CACHE_LIMIT) replayCache.delete(replayCache.keys().next().value)
  while (rateBuckets.size > CACHE_LIMIT) rateBuckets.delete(rateBuckets.keys().next().value)
}

function sameOrigin(req) {
  const origin = text(req.headers?.origin, 400)
  const host = text(req.headers?.['x-forwarded-host'] || req.headers?.host, 300).toLowerCase()
  if (!origin || !host) return false
  try {
    const parsed = new URL(origin)
    return parsed.protocol === 'https:' && parsed.host.toLowerCase() === host
  } catch {
    return false
  }
}

function idempotencyKeyFrom(payload, req) {
  const value = text(req.headers?.['x-idempotency-key'] || payload.idempotency_key, 120)
  return /^[A-Za-z0-9_-]{20,120}$/.test(value) ? value : ''
}

function localRateLimit(req, now) {
  const forwarded = text(req.headers?.['x-vercel-forwarded-for'] || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown', 240)
  const address = forwarded.split(',')[0].trim() || 'unknown'
  const key = keyedDigest('rate:' + address)
  const current = rateBuckets.get(key)
  const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + RATE_WINDOW_MS }
  if (bucket.count >= RATE_LIMIT) return { allowed: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  bucket.count += 1
  rateBuckets.set(key, bucket)
  return { allowed: true, retryAfter: 0 }
}

function recordFrom(safe, req, idempotencyKey, fingerprint) {
  const submittedAt = new Date().toISOString()
  const leadId = 'LEAD-' + keyedDigest('lead:' + idempotencyKey).slice(0, 16).toUpperCase()
  const taskId = 'TASK-' + keyedDigest('task:' + idempotencyKey).slice(0, 16).toUpperCase()
  return {
    lead_id: leadId,
    task_id: taskId,
    source: 'supermega.dev',
    name: safe.name,
    email: safe.email,
    company: safe.company,
    workflow: safe.product,
    requested_package: safe.template,
    goal: safe.goal,
    data: '',
    team: '',
    source_url: safe.source_url,
    page_path: (() => { try { const source = new URL(safe.source_url); return source.pathname + source.search } catch { return '/contact/' } })(),
    referrer: safe.referrer,
    utm_source: '',
    utm_medium: '',
    utm_campaign: '',
    utm_content: '',
    utm_term: '',
    lead_score: 50,
    lead_stage: 'new',
    status: 'new',
    owner: 'SuperMega',
    next_step: 'Review the workflow and reply with the smallest useful next step.',
    submitted_at: submittedAt,
    raw: {
      ...safe,
      user_agent: text(req.headers?.['user-agent'], 240),
      contact_idempotency: {
        version: CONTACT_FINGERPRINT_VERSION,
        algorithm: CONTACT_FINGERPRINT_ALGORITHM,
        payload_fingerprint: fingerprint,
      },
    },
  }
}

const hasOwn = (value, key) => Boolean(value && Object.prototype.hasOwnProperty.call(value, key))

function legacySafeFromRow(row) {
  const raw = row && typeof row.raw === 'object' && !Array.isArray(row.raw) ? row.raw : null
  const pick = (column, rawField, required = false) => {
    if (hasOwn(row, column)) return row[column]
    if (hasOwn(raw, rawField)) return raw[rawField]
    if (required) throw new Error('lead_store_legacy_ambiguous')
    return ''
  }
  return normalizePayload({
    name: pick('name', 'name', true),
    email: pick('email', 'email', true),
    company: pick('company', 'company', true),
    product: pick('workflow', 'product', true),
    template: pick('requested_package', 'template'),
    goal: pick('goal', 'goal', true),
    source_url: pick('source_url', 'source_url'),
    referrer: pick('referrer', 'referrer'),
  })
}

function storedFingerprint(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('lead_store_ambiguous_row')
  const raw = row.raw && typeof row.raw === 'object' && !Array.isArray(row.raw) ? row.raw : null
  const marker = raw?.contact_idempotency
  if (marker === undefined) return { fingerprint: payloadFingerprint(legacySafeFromRow(row)), legacy: true }
  if (
    !marker ||
    typeof marker !== 'object' ||
    Array.isArray(marker) ||
    marker.version !== CONTACT_FINGERPRINT_VERSION ||
    marker.algorithm !== CONTACT_FINGERPRINT_ALGORITHM ||
    typeof marker.payload_fingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(marker.payload_fingerprint)
  ) throw new Error('lead_store_fingerprint_ambiguous')
  return { fingerprint: marker.payload_fingerprint, legacy: false }
}

async function responseRows(response) {
  const rows = await response.json().catch(() => null)
  if (!Array.isArray(rows)) throw new Error('lead_store_ambiguous_response')
  return rows
}

async function fetchSupabaseLead(base, key, leadId) {
  const query = new URLSearchParams({
    lead_id: 'eq.' + leadId,
    select: 'lead_id,name,email,company,workflow,requested_package,goal,source_url,referrer,raw',
    limit: '2',
  })
  const response = await fetch(base + '/rest/v1/supermega_leads?' + query.toString(), {
    method: 'GET',
    headers: { apikey: key, authorization: 'Bearer ' + key, accept: 'application/json' },
    signal: AbortSignal.timeout(9000),
  })
  if (!response.ok) throw new Error('lead_store_lookup_' + response.status)
  const rows = await responseRows(response)
  if (rows.length !== 1 || text(rows[0]?.lead_id, 80) !== leadId) throw new Error('lead_store_lookup_ambiguous')
  return rows[0]
}

async function saveSupabase(record, fingerprint) {
  const base = env('SUPABASE_URL').replace(/\\/$/, '')
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!base || !key) return { status: 'skipped' }
  const response = await fetch(base + '/rest/v1/supermega_leads?on_conflict=lead_id', { method: 'POST', headers: { apikey: key, authorization: 'Bearer ' + key, 'content-type': 'application/json', prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(record), signal: AbortSignal.timeout(9000) })
  if (!response.ok) throw new Error('lead_store_' + response.status)
  const rows = await responseRows(response)
  if (rows.length > 1) throw new Error('lead_store_insert_ambiguous')
  if (rows.length === 1) {
    if (text(rows[0]?.lead_id, 80) !== record.lead_id) throw new Error('lead_store_insert_mismatch')
    const persisted = storedFingerprint(rows[0])
    if (persisted.legacy || persisted.fingerprint !== fingerprint) throw new Error('lead_store_insert_fingerprint_mismatch')
    return { status: 'ready', channel: 'lead_store', created: true }
  }

  // The POST is the atomic insert-if-absent step. A zero-row representation means
  // lead_id already existed; the exact follow-up read resolves replay vs conflict.
  const existing = await fetchSupabaseLead(base, key, record.lead_id)
  const persisted = storedFingerprint(existing)
  if (persisted.fingerprint !== fingerprint) return { status: 'conflict', channel: 'lead_store' }
  return { status: 'ready', channel: 'lead_store', created: false, legacy: persisted.legacy }
}

async function sendResend(record) {
  const key = env('RESEND_API_KEY')
  if (!key) return { status: 'skipped' }
  const to = env('SUPERMEGA_CONTACT_NOTIFY_EMAIL') || 'swanhtet@supermega.dev'
  const from = env('SUPERMEGA_CONTACT_FROM_EMAIL') || 'SuperMega <leads@supermega.dev>'
  const body = ['New SuperMega request', '', 'Product: ' + record.workflow, 'Template: ' + (record.requested_package || 'not selected'), 'Company: ' + record.company, 'Name: ' + record.name, 'Email: ' + record.email, '', record.goal, '', 'Source: ' + record.source_url, 'Lead: ' + record.lead_id].join('\\n')
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json', 'idempotency-key': 'supermega-contact-email/' + record.lead_id }, body: JSON.stringify({ from, to: [to], reply_to: record.email, subject: 'SuperMega request — ' + record.company, text: body }), signal: AbortSignal.timeout(9000) })
  if (!response.ok) throw new Error('email_' + response.status)
  return { status: 'ready', channel: 'email' }
}

async function sendTelegram(record) {
  const token = env('TELEGRAM_BOT_TOKEN')
  const chatId = env('TELEGRAM_CHAT_ID')
  if (!token || !chatId) return { status: 'skipped' }
  const message = ['New SuperMega request', record.company + ' · ' + record.name, record.email, 'Product: ' + record.workflow, 'Template: ' + (record.requested_package || 'not selected'), '', record.goal, '', record.lead_id].join('\\n').slice(0, 3900)
  const response = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true }), signal: AbortSignal.timeout(9000) })
  if (!response.ok) throw new Error('telegram_' + response.status)
  return { status: 'ready', channel: 'telegram' }
}

async function sendWebhook(record) {
  const url = env('SUPERMEGA_LEAD_WEBHOOK_URL')
  if (!url) return { status: 'skipped' }
  const secret = env('SUPERMEGA_LEAD_WEBHOOK_SECRET')
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'supermega.contact.created/' + record.lead_id, ...(secret ? { authorization: 'Bearer ' + secret } : {}) }, body: JSON.stringify({ event: 'supermega.contact.created', record }), signal: AbortSignal.timeout(9000) })
  if (!response.ok) throw new Error('webhook_' + response.status)
  return { status: 'ready', channel: 'webhook' }
}

module.exports = async function handler(req, res) {
  const method = String(req.method || 'GET').toUpperCase()
  if (method === 'GET') {
    const accepting = configured()
    send(res, 200, { status: accepting ? 'ready' : 'attention', service: 'supermega-contact', accepting, controls: { idempotency: 'required', edge_rate_limit: 'required' } })
    return
  }
  if (method !== 'POST') { send(res, 405, { status: 'error', reason: 'method_not_allowed' }); return }
  let payload
  try { payload = await parseBody(req) } catch { send(res, 400, { status: 'error', reason: 'invalid_request' }); return }
  if (text(payload.website, 120)) { send(res, 202, { status: 'ready' }); return }
  if (!sameOrigin(req)) { send(res, 403, { status: 'error', reason: 'origin_not_allowed' }); return }
  const safe = normalizePayload(payload)
  if (!safe.name || !safe.company || !safe.goal || !emailOk(safe.email)) { send(res, 400, { status: 'error', reason: 'required_fields_missing' }); return }
  if (!idempotencySecret()) { send(res, 503, { status: 'error', reason: 'contact_controls_unavailable', fallback_email: 'swanhtet@supermega.dev' }); return }
  const idempotencyKey = idempotencyKeyFrom(payload, req)
  if (!idempotencyKey) { send(res, 400, { status: 'error', reason: 'idempotency_key_required' }); return }

  const now = Date.now()
  pruneCaches(now)
  const cacheKey = keyedDigest('idempotency:' + idempotencyKey)
  const fingerprint = payloadFingerprint(safe)
  const cached = replayCache.get(cacheKey)
  if (cached && cached.fingerprint !== fingerprint) { send(res, 409, { status: 'error', reason: 'idempotency_conflict' }); return }
  if (cached) { send(res, 202, cached.body, { 'x-idempotent-replay': 'true' }); return }

  const rate = localRateLimit(req, now)
  if (!rate.allowed) { send(res, 429, { status: 'error', reason: 'rate_limited' }, { 'retry-after': String(rate.retryAfter) }); return }

  const record = recordFrom(safe, req, idempotencyKey, fingerprint)
  let storeResult
  try { storeResult = await saveSupabase(record, fingerprint) } catch {
    send(res, 503, { status: 'error', reason: 'contact_persistence_unavailable', fallback_email: 'swanhtet@supermega.dev' })
    return
  }
  const acceptedBody = { status: 'ready', request_id: record.lead_id }
  if (storeResult.status === 'conflict') {
    send(res, 409, { status: 'error', reason: 'idempotency_conflict' })
    return
  }
  if (storeResult.status === 'ready' && storeResult.created === false) {
    replayCache.set(cacheKey, { fingerprint, body: acceptedBody, expiresAt: now + IDEMPOTENCY_TTL_MS })
    send(res, 202, acceptedBody, { 'x-idempotent-replay': 'true' })
    return
  }

  const attempts = await Promise.allSettled([Promise.resolve(storeResult), sendResend(record), sendTelegram(record), sendWebhook(record)])
  const ready = attempts.some((attempt) => attempt.status === 'fulfilled' && attempt.value?.status === 'ready')
  if (!ready) { send(res, 503, { status: 'error', reason: 'contact_channel_unavailable', fallback_email: 'swanhtet@supermega.dev' }); return }
  replayCache.set(cacheKey, { fingerprint, body: acceptedBody, expiresAt: now + IDEMPOTENCY_TTL_MS })
  send(res, 202, acceptedBody)
}
`

const pageFiles = new Map([
  ['index.html', homeHtml],
  ['contact/index.html', contactHtml],
  ['privacy/index.html', privacyHtml],
  ['404.html', notFoundHtml],
])

const vercelConfig = {
  version: 3,
  routes: [
    { src: '^/api/contact-submissions/status/?$', dest: '/api/contact-submissions.js' },
    { src: '^/api/contact-submissions/?$', dest: '/api/contact-submissions.js' },
    { src: '^/api/health/?$', dest: '/api/health.js' },
    { src: '^/api/(.*)$', dest: '/api/not-found.js' },
    ...manifest.redirects.map((redirect) => ({ src: redirect.source, status: 308, headers: { Location: redirect.destination } })),
    { src: '^/__release\\.json$', headers: { 'cache-control': 'no-store, max-age=0' }, continue: true },
    { src: '^/(?:favicon\\.svg|site\\.webmanifest)$', headers: { 'cache-control': 'public, max-age=86400, stale-while-revalidate=604800' }, continue: true },
    { handle: 'filesystem' },
    { src: '^/(.*)$', status: 404, dest: '/404.html' },
  ],
}

async function writeStatic(relativePath, content) {
  const destination = resolve(staticDir, relativePath)
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, content, 'utf8')
}

async function writeFunction(name, source) {
  const functionDir = resolve(functionsDir, `${name}.func`)
  await mkdir(functionDir, { recursive: true })
  await writeFile(resolve(functionDir, 'index.js'), source, 'utf8')
  await writeFile(resolve(functionDir, 'package.json'), `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`, 'utf8')
  await writeFile(resolve(functionDir, '.vc-config.json'), `${JSON.stringify({ handler: 'index.js', runtime: 'nodejs24.x', architecture: 'x86_64', environment: {}, shouldDisableAutomaticFetchInstrumentation: false, launcherType: 'Nodejs', shouldAddHelpers: true, shouldAddSourcemapSupport: false, awsLambdaHandler: '' }, null, 2)}\n`, 'utf8')
}

await rm(outputDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
await mkdir(staticDir, { recursive: true })
await mkdir(functionsDir, { recursive: true })

for (const [relativePath, content] of pageFiles) await writeStatic(relativePath, content)
await writeStatic('favicon.svg', faviconSvg)
await writeStatic('__release.json', `${JSON.stringify(release, null, 2)}\n`)
await writeStatic('robots.txt', 'User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://supermega.dev/sitemap.xml\n')
await writeStatic('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${manifest.pages.map((page) => `  <url><loc>${escapeHtml(canonical(page.route))}</loc><changefreq>${page.route === '/privacy/' ? 'yearly' : 'weekly'}</changefreq></url>`).join('\n')}\n</urlset>\n`)
await writeStatic('site.webmanifest', `${JSON.stringify({ name: 'SuperMega', short_name: 'SuperMega', start_url: '/', display: 'browser', background_color: brand.colors.background, theme_color: brand.colors.background, icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] }, null, 2)}\n`)

await writeFunction('health.js', healthFunction)
await writeFunction('contact-submissions.js', contactFunction)
await writeFunction('not-found.js', notFoundFunction)
await writeFile(resolve(outputDir, 'config.json'), `${JSON.stringify(vercelConfig, null, 2)}\n`, 'utf8')

console.log(JSON.stringify({ ok: true, contract: 'supermega_public_build', pages: manifest.pages.map((page) => page.route), release }))
