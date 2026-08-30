import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { validatePlantBusinessTemplates } from '../showroom/src/products/plant/business-templates.ts'
import { validateShopBusinessTemplates } from '../showroom/src/products/shop/business-templates.ts'

const run = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = resolve(root, '.vercel', 'output')
const staticDir = resolve(outputDir, 'static')
const functionsDir = resolve(outputDir, 'functions', 'api')
const manifest = JSON.parse(await readFile(resolve(root, 'site-manifest.json'), 'utf8'))

// Branded 1200x630 social share cards, committed at tools/public-assets/ and
// emitted verbatim on every release: og-card.png for the shared pages plus one
// og-card-<productId>.png per customer product for its landing page
// (regenerate the product cards via tools/generate_og_product_cards.ps1).
const OG_CARD_WIDTH = 1200
const OG_CARD_HEIGHT = 630
const OG_CARD_PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const ogCardPng = await readFile(resolve(root, 'tools', 'public-assets', 'og-card.png'))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(manifest.schemaVersion === 'supermega.site-context.v2', 'unsupported_site_manifest')
assert(manifest.brand?.version && manifest.contextVersion && manifest.catalogVersion, 'site_manifest_versions_missing')
assert(manifest.customerProducts?.map((product) => product.id).join(',') === 'shop,plant,website,ecommerce', 'site_manifest_customer_product_order_changed')
assert(manifest.customerProducts?.map((product) => product.runtimeId).join(',') === 'commerce,production,website,ecommerce', 'site_manifest_runtime_identity_changed')
assert(manifest.sharedCapabilities?.map((capability) => capability.id).join(',') === 'ai-assistance', 'site_manifest_shared_capability_missing')
assert(manifest.company?.publicPricing === false, 'public_pricing_must_remain_hidden')
assert(ogCardPng.subarray(0, 8).equals(OG_CARD_PNG_SIGNATURE), 'og_card_not_png')
assert(ogCardPng.readUInt32BE(16) === OG_CARD_WIDTH && ogCardPng.readUInt32BE(20) === OG_CARD_HEIGHT, 'og_card_dimensions_wrong')

const productOgCards = new Map()
for (const product of manifest.customerProducts) {
  const fileName = `og-card-${product.id}.png`
  const cardPng = await readFile(resolve(root, 'tools', 'public-assets', fileName))
  assert(cardPng.subarray(0, 8).equals(OG_CARD_PNG_SIGNATURE), `og_card_not_png:${fileName}`)
  assert(cardPng.readUInt32BE(16) === OG_CARD_WIDTH && cardPng.readUInt32BE(20) === OG_CARD_HEIGHT, `og_card_dimensions_wrong:${fileName}`)
  productOgCards.set(fileName, cardPng)
}

const publicProducts = manifest.customerProducts

const brand = manifest.brand

function productFirstOperatingLoop(product) {
  assert(Array.isArray(product.firstOperatingLoop), `first_operating_loop_missing:${product.id}`)
  assert(product.firstOperatingLoop.length === 4, `first_operating_loop_length:${product.id}`)
  assert(product.firstOperatingLoop.every((item) => typeof item === 'string' && item.length >= 24 && item.length <= 96), `first_operating_loop_copy_invalid:${product.id}`)
  return product.firstOperatingLoop
}

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
    --quiet: #5f6c64;
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
  .skip-link { position: fixed; z-index: 60; top: 12px; left: 12px; padding: 10px 14px; border-radius: 10px; background: var(--ink); color: #ffffff; font-size: 13px; font-weight: 720; text-decoration: none; transform: translateY(-160%); }
  .skip-link:focus { transform: translateY(0); }
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
  .hero { padding: 76px 0 68px; }
  .hero-copy { max-width: 900px; }
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
  .trial-proof-summary { margin-top: 34px; padding: 24px 0; border-block: 1px solid var(--line); }
  .trial-proof-summary[hidden] { display: none; }
  .trial-proof-summary h3 { margin-top: 8px; }
  .trial-proof-summary > p { font-size: 14px; }
  .trial-proof-metrics { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 1px; margin: 22px 0 0; background: var(--line); }
  .trial-proof-metrics div { min-width: 0; padding: 14px; background: var(--background); }
  .trial-proof-metrics dt { color: var(--quiet); font-size: 11px; font-weight: 700; text-transform: uppercase; }
  .trial-proof-metrics dd { margin: 4px 0 0; color: var(--ink); font-size: 18px; font-weight: 800; }
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
  .contact-honeypot { position: absolute; left: -9999px; }
  .prose { max-width: 820px; padding-bottom: 100px; }
  .prose section { display: grid; grid-template-columns: 220px 1fr; gap: 42px; border-top: 1px solid var(--line); padding: 30px 0; }
  .prose p { color: var(--muted); }
  .site-footer { margin-top: 32px; border-top: 1px solid var(--line); padding: 34px 0 48px; }
  .footer-inner { display: flex; align-items: center; justify-content: space-between; gap: 24px; color: var(--quiet); font-size: 12px; }
  .footer-links { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 18px; }
  .footer-links a { min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; text-decoration: none; }
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
  .solution-modules span { min-height: 52px; display: grid; grid-template-columns: 34px 1fr; gap: 12px; align-items: center; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 14px; line-height: 1.45; padding: 10px 0; }
  .solution-modules i { color: var(--green); font-family: "SFMono-Regular", Consolas, monospace; font-size: 11px; font-style: normal; font-variant-numeric: tabular-nums; }
  /* Design tribunal phase 1 language, applied to the public site: the free/premium/
     managed story and the registry-backed trade demo links, at a readable size on a cheap phone. */
  .tier-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 20px; border-top: 1px solid var(--line-strong); padding-top: 24px; }
  .tier-lane h3 { margin: 4px 0 8px; font-size: 17px; letter-spacing: -.01em; }
  .tier-lane .eyebrow { color: var(--green); }
  .trade-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; }
  .trade-card { min-height: 76px; display: grid; align-content: center; gap: 4px; border: 1px solid var(--line-strong); border-radius: 12px; padding: 14px 16px; color: inherit; text-decoration: none; transition: border-color .15s ease, transform .15s ease; }
  .trade-card:hover { border-color: var(--green); transform: translateY(-2px); }
  .trade-card:focus-visible { outline: 3px solid var(--green); outline-offset: 2px; }
  .trade-card strong { font-size: 15px; }
  .trade-card span { color: var(--muted); font-size: 13px; line-height: 1.4; }
  @media (max-width: 900px) { .tier-grid { grid-template-columns: 1fr; gap: 24px; } .trade-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
  @media (max-width: 560px) { .trade-grid { grid-template-columns: 1fr; } .solution-modules span { grid-template-columns: 28px 1fr; font-size: 14px; } }
  .template-catalog { margin-top: 54px; scroll-margin-top: 92px; }
  .template-tags { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 18px; }
  .template-tags span { min-height: 38px; display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 999px; padding: 0 13px; color: var(--muted); font-size: 11px; }
  .trust-compact { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .trust-compact .principle-card { min-height: 210px; }
  .trust-strip { padding-bottom: 24px; }
  .control-line { grid-column: 1/-1; display: flex; align-items: center; justify-content: space-between; gap: 22px; border: 1px solid rgba(11,116,94,.2); border-radius: var(--radius); padding: 18px 22px; background: var(--green-soft); }
  .control-line p { max-width: 760px; margin: 0; color: var(--muted); font-size: 12px; }
  .compact-solutions { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; }
  .compact-solution { min-width: 0; min-height: 270px; display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: var(--radius); padding: 28px; background: var(--panel-solid); box-shadow: 0 12px 34px rgba(25,54,42,.045); }
  .compact-solution h3 { margin: 20px 0 9px; font-size: 30px; }
  .compact-solution > p { min-height: 44px; color: var(--muted); font-size: 13px; }
  .compact-first { display: grid; gap: 4px; margin-top: 14px; border-left: 2px solid var(--green); padding-left: 10px; color: var(--muted); font-size: 11px; line-height: 1.4; }
  .compact-first span { color: var(--green); font-family: "SFMono-Regular", Consolas, monospace; font-size: 9px; font-weight: 760; text-transform: uppercase; }
  .compact-solution > .card-link { margin-top: auto; }
  .compact-solution > .card-link + .card-link { margin-top: 2px; }
  .first-loop { scroll-margin-top: 92px; }
  .first-loop-list { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
  .first-loop-list li { min-height: 58px; display: grid; grid-template-columns: 34px minmax(0,1fr); gap: 12px; align-items: center; border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; background: var(--panel-solid); color: var(--muted); font-size: 14px; line-height: 1.45; }
  .first-loop-list i { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 999px; background: var(--green-soft); color: var(--green); font-family: "SFMono-Regular", Consolas, monospace; font-size: 10px; font-style: normal; font-weight: 800; }
  .product-roadmap { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; margin-top: 14px; }
  .roadmap-solution { min-height: 228px; display: flex; flex-direction: column; }
  .roadmap-solution > p { min-height: 0; }
  .roadmap-solution .card-link, .roadmap-solution .status-note { margin-top: auto; }
  .status-note { display: inline-flex; min-height: 44px; align-items: center; color: var(--quiet); font-size: 11px; font-weight: 760; }
  .shared-capability { display: grid; grid-template-columns: minmax(0,.35fr) minmax(0,1fr) auto; gap: 22px; align-items: center; margin-top: 14px; border: 1px solid rgba(11,116,94,.2); border-radius: var(--radius); padding: 20px 24px; background: var(--green-soft); scroll-margin-top: 92px; }
  .shared-capability h3, .shared-capability p { margin: 0; }
  .shared-capability h3 { font-size: 22px; }
  .shared-capability p { color: var(--muted); font-size: 12px; }
  .module-tags { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 5px; margin-top: 18px; }
  .module-tags span { min-height: 34px; display: flex; align-items: center; border: 1px solid var(--line); border-radius: 4px; padding: 0 9px; color: var(--muted); font-size: 9px; }
  .template-line { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 16px; border-top: 1px solid var(--line); padding-top: 14px; }
  .template-line span { color: var(--quiet); font-family: "SFMono-Regular", Consolas, monospace; font-size: 8px; }
  .detail-disclosure { margin-top: 16px; border-top: 1px solid var(--line); }
  .detail-disclosure > summary { min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 16px; color: var(--blue-strong); cursor: pointer; font-size: 12px; font-weight: 760; list-style: none; }
  .detail-disclosure > summary::-webkit-details-marker { display: none; }
  .detail-disclosure > summary::after { color: var(--green); content: "+"; font-family: "SFMono-Regular", Consolas, monospace; font-size: 17px; }
  .detail-disclosure[open] > summary::after { content: "−"; }
  .disclosure-body { padding-top: 4px; }
  .boundary-note { margin: 0; border-left: 2px solid var(--green); padding: 2px 0 2px 12px; color: var(--quiet); font-size: 10px; }
  .closing-strip { display: grid; grid-template-columns: 1fr auto; gap: 30px; align-items: center; margin-top: 14px; border: 1px solid rgba(11,116,94,.2); border-radius: var(--radius); padding: 24px 28px; background: var(--panel-soft); }
  .closing-strip h2 { margin-bottom: 6px; font-size: 27px; }
  .closing-strip p { margin: 0; color: var(--muted); font-size: 12px; }
  .offer-model-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); border-block: 1px solid var(--line-strong); }
  .offer-model-lane { min-width: 0; padding: 30px 34px 30px 0; }
  .offer-model-lane + .offer-model-lane { border-left: 1px solid var(--line-strong); padding-right: 0; padding-left: 34px; }
  .offer-model-lane h3 { margin: 14px 0 9px; font-size: 25px; }
  .offer-model-lane > p { max-width: 520px; color: var(--muted); font-size: 13px; }
  .offer-model-list { display: grid; gap: 0; margin: 22px 0 0; padding: 0; list-style: none; }
  .offer-model-list li { min-height: 45px; display: flex; align-items: center; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
  .offer-model-list li::before { margin-right: 10px; color: var(--green); content: ">"; font-family: "SFMono-Regular", Consolas, monospace; font-weight: 800; }
  .offer-model-action { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-top: 24px; }
  .offer-model-action p { max-width: 720px; margin: 0; color: var(--quiet); font-size: 11px; }
  :focus-visible { outline: 3px solid rgba(11,116,94,.34); outline-offset: 3px; }
  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } *, *::before, *::after { transition-duration: .01ms !important; } }
  @media (max-width: 980px) { .hero { grid-template-columns: 1fr; gap: 42px; padding-top: 60px; } .hero-copy { max-width: 820px; } .workspace { transform: none; } .split, .solution-block { grid-template-columns: 1fr; gap: 30px; } .sticky-copy { position: static; } .surface-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } .surface-card:last-child { grid-column: 1/-1; min-height: 210px; } .principle-grid, .trust-compact { grid-template-columns: repeat(2,minmax(0,1fr)); } .product-roadmap { grid-template-columns: 1fr; } .contact-layout { grid-template-columns: 1fr; gap: 42px; } }
  @media (max-width: 760px) { .frame { width: min(calc(100% - 30px), 1200px); } .header-inner { min-height: 62px; gap: 10px; } .brand { gap: 8px; font-size: 11px; } .nav-link { padding-inline: 8px; } .nav-optional { display: none; } .header-cta { min-height: 42px; padding-inline: 13px; } .hero, .page-hero { padding-top: 46px; } .hero { padding-bottom: 52px; } .workspace-body { grid-template-columns: 1fr; min-height: 0; } .workspace-nav { display: none; } .workspace-main { padding: 16px; } .metric-grid { grid-template-columns: 1fr; } .metric { min-height: 76px; } .surface-grid, .product-grid, .template-grid, .module-grid, .principle-grid, .trust-compact, .case-grid, .compact-solutions, .product-roadmap, .shared-capability { grid-template-columns: 1fr; } .surface-card, .surface-card:last-child { grid-column: auto; min-height: 220px; } .solution-block { padding: 24px; } .system-preview-body { padding: 18px; } .system-row { grid-template-columns: 28px 92px minmax(0, 1fr); } .system-row i { display: none; } .section { padding: 50px 0; } .control-line, .closing-strip { display: grid; grid-template-columns: 1fr; } .callout { grid-template-columns: 1fr; } .callout { padding: 26px; } .contact-form { padding: 20px; } .field-grid { grid-template-columns: 1fr; } label.wide { grid-column: auto; } .prose section { grid-template-columns: 1fr; gap: 6px; } .footer-inner { display: grid; } .footer-links { justify-content: flex-start; } }
  @media (max-width: 420px) { .nav-link { display: none; } h1 { font-size: 38px; } .product-card { padding: 24px; } .compact-solution { padding: 22px; } }
  @media (min-width: 761px) { .detail-disclosure > summary { display: none; } details.detail-disclosure:not([open]) > .disclosure-body { display: block; } .detail-disclosure { margin-top: 0; border-top: 0; } .product-disclosure .disclosure-body { padding-top: 16px; } }
  @media (max-width: 760px) { .hero { gap: 28px; padding-top: 28px; padding-bottom: 32px; } .hero-note { display: none; } .section { padding: 32px 0; } .section-head { margin-bottom: 18px; } .section-head p { font-size: 16px; } .workspace-bar { min-height: 44px; } .system-preview-body { padding: 14px 16px; } .system-row { min-height: 44px; } .system-boundary { margin-top: 14px; } .compact-solution > p { min-height: 0; } .closing-strip { padding: 22px; } }
  @media (max-width: 420px) { .compact-solution { padding: 18px; } .first-loop-list li { grid-template-columns: 28px minmax(0,1fr); padding: 10px 11px; font-size: 13px; } }
  @media (max-width: 520px) { .compact-solutions { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; } .compact-solution { min-height: 250px; padding: 16px; } .compact-solution h3 { margin-top: 12px; font-size: 22px; } .compact-solution > p { font-size: 11px; line-height: 1.45; } .compact-solution .card-index { min-height: 28px; font-size: 8px; } .compact-solution .module-tags { display: none; } .compact-solution .card-link { font-size: 12px; } }
  @media (max-width: 760px) { .offer-model-grid { grid-template-columns: 1fr; } .offer-model-lane { padding: 24px 0; } .offer-model-lane + .offer-model-lane { border-top: 1px solid var(--line-strong); border-left: 0; padding-left: 0; } .offer-model-action { align-items: stretch; flex-direction: column; } .offer-model-action .button { width: 100%; } }
`

function brandHtml() {
  return `<a class="brand" href="/" aria-label="SuperMega home"><span class="brand-mark" aria-hidden="true">&gt;_</span><span class="brand-name">SUPERMEGA</span></a>`
}

function headerHtml() {
  return `<header class="site-header"><div class="frame header-inner">${brandHtml()}<a class="button compact header-cta" href="https://app.supermega.dev/login">Company sign in</a></div></header>`
}

function footerHtml(route) {
  const contactLink = route === '/' ? '' : '<a href="/contact/">Contact</a>'
  return `<footer class="site-footer"><div class="frame footer-inner"><span>© ${new Date().getUTCFullYear()} SuperMega · Accountable company software.</span><span class="footer-links">${contactLink}<a href="/privacy/">Privacy</a></span></div></footer>`
}

// JSON-LD structured data ships as <script type="application/ld+json"> blocks.
// Those are HTML data blocks, not scripts: the "prepare a script element" HTML
// algorithm bails out before any CSP check because application/ld+json is not a
// JavaScript MIME type, so browsers never execute them and the script-src
// directive (pinned to the single contact-script hash) does not apply to them.
// Verified against the built output served with the exact production CSP.
function structuredDataHtml(schema) {
  if (!schema) return ''
  const json = JSON.stringify({ '@context': 'https://schema.org', ...schema }).replaceAll('<', '\\u003c')
  return `\n    <script type="application/ld+json">${json}</script>`
}

const publicObservabilityHosts = Object.freeze(['supermega.dev', 'www.supermega.dev'])
const publicObservabilityPaths = Object.freeze(manifest.pages.map((page) => page.route))
assert(publicObservabilityPaths.join(',') === '/,/shop/,/plant/,/website/,/ecommerce/,/contact/,/privacy/', 'public_observability_path_surface_changed')

// Source presence is only delivery readiness. Provider-visible pageviews and
// vitals remain unobserved until a separate read-only provider receipt proves
// them after deployment.
const publicObservabilityScript = `(function () {
  var hosts = ${JSON.stringify(publicObservabilityHosts)}
  var paths = new Set(${JSON.stringify(publicObservabilityPaths)})
  if (location.protocol !== 'https:' || !hosts.includes(location.hostname)) return
  function safeEvent(event, expectedType) {
    if (!event || event.type !== expectedType || typeof event.url !== 'string') return null
    var url
    try { url = new URL(event.url, location.origin) } catch { return null }
    if (url.origin !== location.origin || !paths.has(url.pathname)) return null
    var safe = { type: expectedType, url: url.origin + url.pathname }
    if (expectedType === 'vital') safe.route = url.pathname
    return safe
  }
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments) }
  window.si = window.si || function () { (window.siq = window.siq || []).push(arguments) }
  window.va('beforeSend', function (event) { return safeEvent(event, 'pageview') })
  window.si('beforeSend', function (event) { return safeEvent(event, 'vital') })
  for (var src of ['/_vercel/insights/script.js', '/_vercel/speed-insights/script.js']) {
    var script = document.createElement('script')
    script.defer = true
    script.src = src
    document.head.append(script)
  }
})()
`

function documentHtml({ route, title, description, content, schema = null, robots = 'index,follow', shareImage = '/og-card.png' }) {
  const url = canonical(route)
  const shareImageUrl = canonical(shareImage)
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
    <meta property="og:image" content="${escapeHtml(shareImageUrl)}" />
    <meta property="og:image:width" content="${OG_CARD_WIDTH}" />
    <meta property="og:image:height" content="${OG_CARD_HEIGHT}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${escapeHtml(shareImageUrl)}" />${structuredDataHtml(schema)}
    <style>${sharedStyle}</style>
  </head>
  <body data-brand-version="${escapeHtml(brand.version)}" data-context-version="${escapeHtml(manifest.contextVersion)}">
    <a class="skip-link" href="#content">Skip to content</a>
    <div class="shell">${headerHtml(route)}${content}${footerHtml(route)}</div>
    <script src="/vercel-insights.js"></script>
  </body>
</html>`
}

function guidedSampleAction(product) {
  const href = `https://app.supermega.dev/settings/?product=${encodeURIComponent(product.id)}`
  return product.id === 'shop'
    ? { href, label: 'Choose Shop type or continue saved' }
    : { href, label: 'Start free sample' }
}

function assistedSetupAction(product) {
  const expectedHref = `/contact/?product=${encodeURIComponent(product.id)}`
  assert(product.secondaryCta?.label === 'Request assisted setup', `assisted_setup_label_invalid:${product.id}`)
  assert(product.secondaryCta.url === expectedHref, `assisted_setup_route_invalid:${product.id}`)
  return { href: product.secondaryCta.url, label: product.secondaryCta.label }
}

function shopProfitControlAction() {
  const shop = publicProducts.find((product) => product.id === 'shop')
  assert(shop?.primaryCta?.label === 'Open Shop Profit Control', 'shop_profit_control_label_invalid')
  assert(shop.primaryCta.url === 'https://app.supermega.dev/shop/?tab=today', 'shop_profit_control_route_invalid')
  return { href: shop.primaryCta.url, label: shop.primaryCta.label }
}

const SHOP_PROFIT_CONTROL_ACTION = shopProfitControlAction()

function productCardHtml(product, index) {
  const capabilities = (product.modules?.length ? product.modules : product.workflow).slice(0, 3)
  const firstLoop = productFirstOperatingLoop(product)
  const guidedSample = guidedSampleAction(product)
  return `<article class="compact-solution" id="${escapeHtml(product.id)}">
    <span class="card-index">0${index + 1} / ${escapeHtml(product.eyebrow)}</span>
    <h3>${escapeHtml(product.name)}</h3>
    <p>${escapeHtml(product.headline)}</p>
    <div class="compact-first"><span>First loop</span>${escapeHtml(firstLoop[0])}</div>
    <div class="module-tags" role="group" aria-label="Core capabilities">${capabilities.map((capability) => `<span>${escapeHtml(capability)}</span>`).join('')}</div>
    <a class="card-link" href="/${escapeHtml(product.id)}/">${escapeHtml(product.name)} overview</a>
    <a class="card-link" href="${escapeHtml(guidedSample.href)}">${escapeHtml(guidedSample.label)}</a>
  </article>`
}

const homePage = manifest.pages.find((page) => page.route === '/')
assert(homePage?.file === 'index.html', 'home_page_manifest_entry_invalid')
assert(typeof homePage.title === 'string' && homePage.title.includes('Shop Profit Control'), 'home_page_title_invalid')
assert(typeof homePage.description === 'string' && homePage.description.length >= 40, 'home_page_description_invalid')

const homeHtml = documentHtml({
  route: '/',
  title: homePage.title,
  description: homePage.description,
  schema: { '@type': 'Organization', name: 'SuperMega', url: canonical('/'), description: homePage.description },
  content: `<main id="content">
    <section class="frame hero"><div class="hero-copy"><span class="eyebrow">${escapeHtml(manifest.company.positioning)}</span><h1>${escapeHtml(manifest.company.headline)}</h1><p class="lede">${escapeHtml(manifest.company.supporting)}</p><div class="actions"><a class="button primary" href="${escapeHtml(SHOP_PROFIT_CONTROL_ACTION.href)}">${escapeHtml(SHOP_PROFIT_CONTROL_ACTION.label)}</a><a class="button" href="#products">Explore all products</a></div><div class="hero-note"><span>POS-independent</span><span>Read-only local record</span><span>No payment or stock write</span></div></div></section>
    <section class="frame section" id="products"><div class="section-head"><span class="eyebrow">Products</span><h2>Start with Shop Profit Control, then choose a connected workflow.</h2><p>Shop surfaces the first accountable operating action. Plant, Website, and Ecommerce remain focused local products with guided samples of their own.</p></div><div class="compact-solutions">${publicProducts.map(productCardHtml).join('')}</div></section>
    <section class="frame section offer-model" id="model" aria-label="Free and managed SuperMega"><div class="section-head"><span class="eyebrow">Free product. Managed intelligence.</span><h2>Run the products free. Add managed company intelligence when the workflow proves value.</h2><p>The free workspace keeps the operating software useful on its own. Managed service adds approved AI context and company controls without replacing the underlying record.</p></div><div class="offer-model-grid"><div class="offer-model-lane"><span class="eyebrow">Free local workspace</span><h3>Operate without a stripped-down plan.</h3><p>Every workflow visible in Shop, Plant, Website, and Ecommerce remains available in the browser workspace.</p><ul class="offer-model-list"><li>Full local operating modules and imports</li><li>Grounded answers from validated local records</li><li>Approvals, evidence, backup, and export</li><li>No account or model call required</li></ul></div><div class="offer-model-lane"><span class="eyebrow">Managed company intelligence</span><h3>Use approved context across products.</h3><p>SuperMega can retain reviewed context, rank next actions, and prepare controlled work only after company controls pass.</p><ul class="offer-model-list"><li>Approved AI context across all four products</li><li>Persistent company history and role-aware access</li><li>Reviewed recommendations and accountable actions</li><li>Managed setup, recovery, and support</li></ul></div></div><div class="offer-model-action"><p>Managed activation proceeds only after identity, tenant isolation, recovery, and write controls pass for the company.</p><a class="button primary" href="/contact/?product=guide&amp;source=managed-intelligence">Request managed pilot</a></div></section>
    <section class="frame trust-strip" id="trust" aria-label="Security boundary"><div class="control-line"><span class="eyebrow">Secure by default</span><p>Every real send, payment, publish, access change, stock movement, or production write stays behind explicit authority and verified server-side controls.</p></div></section>
  </main>`,
})

// Every validated Shop trade template is projected into the public site. Keeping
// this projection registry-backed prevents a shipped template from disappearing
// from the public door when the product registry changes.
const SHOP_TRADES = validateShopBusinessTemplates().map((template) => ({
  id: template.id,
  name: template.name.en,
  note: template.description,
}))

function tradeTemplatesHtml() {
  return `<section class="frame section" id="trades"><div class="section-head"><span class="eyebrow">Start in your trade</span><h2>Open Shop already set up for your business.</h2><p>Each one opens Sell with a real catalog, sample sales and a live order in your browser. Nothing to install and no account required.</p></div><div class="trade-grid">${SHOP_TRADES.map(({ id, name, note }) => `<a class="trade-card" href="https://app.supermega.dev/shop/?template=${escapeHtml(id)}"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(note)}</span></a>`).join('')}</div></section>`
}

function customerProductContract(id) {
  const product = publicProducts.find((candidate) => candidate.id === id)
  assert(product, `customer_product_missing:${id}`)
  return product
}

function validatedProductTemplates(productId, expectedCount) {
  const templates = customerProductContract(productId).templates
  assert(Array.isArray(templates) && templates.length === expectedCount, `public_template_count_changed:${productId}`)
  assert(templates.every((template) => /^[a-z][a-z0-9-]{1,39}$/.test(template.id)
    && typeof template.name === 'string' && template.name.trim()
    && typeof template.outcome === 'string' && template.outcome.trim()), `public_template_copy_invalid:${productId}`)
  assert(new Set(templates.map((template) => template.id)).size === templates.length, `public_template_id_duplicate:${productId}`)
  return templates
}

function guidedTemplateRoute(productId, templateId, extra = {}) {
  const query = new URLSearchParams({ product: productId, template: templateId, ...extra })
  return `https://app.supermega.dev/settings/?${query.toString()}`
}

const plantWorkflowTemplate = validatedProductTemplates('plant', 3).find((template) => template.id === 'production-control')
assert(plantWorkflowTemplate, 'plant_primary_workflow_template_missing')
const FIRST_JOB_TEMPLATE_SECTIONS = {
  plant: {
    title: 'Choose a shipped production sample.',
    intro: 'Each door carries its validated Plant pack and first production workflow into guided setup.',
    doors: validatePlantBusinessTemplates().map((template) => ({
      id: template.id,
      name: template.name.en,
      note: template.description,
      href: guidedTemplateRoute('plant', plantWorkflowTemplate.id, { pack: template.industryPackId }),
    })),
  },
  website: {
    title: 'Choose the first job for your website.',
    intro: 'Start from one validated layout, then review the local draft before any publishing decision.',
    doors: validatedProductTemplates('website', 3).map((template) => ({
      id: template.id,
      name: template.name,
      note: template.outcome,
      href: guidedTemplateRoute('website', template.id),
    })),
  },
  ecommerce: {
    title: 'Choose the first ordering workflow.',
    intro: 'Start with one validated Shop-connected request flow while Shop remains the operating record.',
    doors: validatedProductTemplates('ecommerce', 3).map((template) => ({
      id: template.id,
      name: template.name,
      note: template.outcome,
      href: guidedTemplateRoute('ecommerce', template.id),
    })),
  },
}

function firstJobTemplatesHtml(productId) {
  const section = FIRST_JOB_TEMPLATE_SECTIONS[productId]
  if (!section) return ''
  const hrefs = section.doors.map((door) => door.href)
  assert(new Set(hrefs).size === hrefs.length, `public_template_route_duplicate:${productId}`)
  return `<section class="frame section" id="first-job-templates"><div class="section-head"><span class="eyebrow">${escapeHtml(section.doors.length)} validated starting points</span><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.intro)}</p></div><div class="trade-grid" aria-label="${escapeHtml(customerProductContract(productId).name)} first-job templates">${section.doors.map(({ id, name, note, href }) => `<a class="trade-card first-job-card" data-template="${escapeHtml(id)}" href="${escapeHtml(href)}"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(note)}</span></a>`).join('')}</div><div class="control-line"><span class="eyebrow">Browser-local setup only</span><p>Opening a door does not overwrite an existing workspace, create a managed record, contact a customer, publish or send anything, accept payment, move stock, or record revenue. Any later setup change remains an explicit reviewed action.</p></div></section>`
}

function productLandingHtml(product, page) {
  const guidedSample = guidedSampleAction(product)
  const assistedSetup = assistedSetupAction(product)
  const leadingAction = product.id === 'shop' ? SHOP_PROFIT_CONTROL_ACTION : guidedSample
  const actionsHtml = product.id === 'shop'
    ? `<a class="button primary" href="${escapeHtml(leadingAction.href)}">${escapeHtml(leadingAction.label)}</a><a class="button" href="${escapeHtml(guidedSample.href)}">${escapeHtml(guidedSample.label)}</a><a class="button" href="${escapeHtml(assistedSetup.href)}">${escapeHtml(assistedSetup.label)}</a>`
    : `<a class="button primary" href="${escapeHtml(guidedSample.href)}">${escapeHtml(guidedSample.label)}</a><a class="button" href="${escapeHtml(assistedSetup.href)}">${escapeHtml(assistedSetup.label)}</a>`
  const description = page.description || product.description
  const moduleItems = product.modules?.length ? product.modules : product.id === 'website' ? product.workflow : product.views
  const firstLoop = productFirstOperatingLoop(product)
  const launchModuleLimit = manifest.templatePackPolicy.maxEnabledModulesAtLaunch
  assert(Number.isSafeInteger(launchModuleLimit) && launchModuleLimit >= 1 && launchModuleLimit <= 8, 'launch_module_limit_invalid')
  const launchModules = moduleItems.slice(0, launchModuleLimit)
  return documentHtml({
    route: page.route,
    title: page.title,
    description,
    shareImage: `/og-card-${product.id}.png`,
    schema: { '@type': 'Product', name: product.name, description, url: canonical(page.route) },
    content: `<main id="content">
    <section class="frame page-hero"><span class="eyebrow">${escapeHtml(product.eyebrow)}</span><h1>${escapeHtml(product.headline)}</h1><p class="lede">${escapeHtml(description)}</p><div class="actions">${actionsHtml}</div><div class="hero-note"><span>Free browser sample</span><span>No account or model call required</span><span>Mobile-ready workflows</span></div></section>
    <section class="frame section first-loop" id="first-loop"><div class="section-head"><span class="eyebrow">First operating loop</span><h2>Start with one ${escapeHtml(product.name)} job.</h2><p>This is the path a new owner should understand before looking at advanced modules.</p></div><ol class="first-loop-list" aria-label="${escapeHtml(product.name)} first operating loop">${firstLoop.map((item, index) => `<li><i>${String(index + 1).padStart(2, '0')}</i>${escapeHtml(item)}</li>`).join('')}</ol></section>
    ${firstJobTemplatesHtml(product.id)}
    <section class="frame section" id="modules"><div class="section-head"><span class="eyebrow">Start here</span><h2>${escapeHtml(launchModules.length)} core ${escapeHtml(product.name)} workflows.</h2><p>Begin with the work used most often. Advanced tools stay inside the workspace and appear when they are relevant.</p></div><div class="solution-modules" aria-label="${escapeHtml(product.name)} core workflows">${launchModules.map((item, index) => `<span><i>${String(index + 1).padStart(2, '0')}</i>${escapeHtml(item)}</span>`).join('')}</div></section>
    ${product.id === 'shop' ? tradeTemplatesHtml() : ''}
    <section class="frame section" id="free-sample"><div class="section-head"><span class="eyebrow">Free local workspace</span><h2>Use the core workflow before adding complexity.</h2><p>The guided workspace runs on the owner’s device. Managed service is only for shared records, approved AI context, and infrastructure the business asks SuperMega to operate.</p></div><div class="tier-grid"><div class="tier-lane"><span class="eyebrow">Local</span><h3>Start one real job</h3><ul class="offer-model-list"><li>The ${escapeHtml(launchModules.length)} core workflows above</li><li>Backup and restore</li><li>Review before consequential actions</li></ul></div><div class="tier-lane"><span class="eyebrow">AI assisted</span><h3>Prepare, then review</h3><ul class="offer-model-list"><li>Source-backed drafts from approved records</li><li>Ranked next actions</li><li>No automatic send or payment</li></ul></div><div class="tier-lane"><span class="eyebrow">Managed</span><h3>One company workspace</h3><ul class="offer-model-list"><li>Separate client portal</li><li>Staff sign-ins and limits</li><li>Shared records with recovery controls</li></ul></div></div></section>
    <section class="frame trust-strip" aria-label="Security boundary"><div class="control-line"><span class="eyebrow">Secure by default</span><p>Every real send, payment, publish, access change, stock movement, or production write stays behind explicit authority and verified server-side controls.</p></div></section>
    <section class="frame section"><div class="closing-strip"><div><h2>Free product. Managed intelligence.</h2><p>Managed activation proceeds only after identity, tenant isolation, recovery, and write controls pass for the company.</p></div><a class="button primary" href="${escapeHtml(leadingAction.href)}">${escapeHtml(leadingAction.label)}</a></div></section>
  </main>`,
  })
}

const contactScript = `<script>(function(){
  var form=document.querySelector('[data-contact-form]');if(!form)return;
  var query=new URLSearchParams(location.search),handoff=new URLSearchParams(location.hash.slice(1)),status=form.querySelector('[data-form-status]'),submit=form.querySelector('button[type="submit"]'),product=form.querySelector('[name="product"]'),template=form.querySelector('[name="template"]'),company=form.querySelector('[name="company"]'),goal=form.querySelector('[name="goal"]'),heading=document.querySelector('[data-contact-heading]'),lede=document.querySelector('[data-contact-lede]'),copyHeading=document.querySelector('[data-contact-copy-heading]'),copy=document.querySelector('[data-contact-copy]'),requestKey=form.querySelector('[name="idempotency_key"]'),source=form.querySelector('[name="source_url"]'),referrer=form.querySelector('[name="referrer"]'),proofSummary=document.querySelector('[data-trial-proof]');
  var contextProofNames=['proof_context_contract','proof_context_digest','proof_context_outcome_digest','proof_context_approved','proof_context_raw_records'],proofNames=['proof_contract','proof_version','proof_digest','proof_product','proof_template','proof_readiness','proof_sources','proof_behavior','proof_decisions','proof_outcome','proof_outcome_digest','proof_outcome_accepted','proof_raw_records'].concat(contextProofNames);
  function newKey(){if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();var bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes,function(value){return value.toString(16).padStart(2,'0')}).join('')}
  function boundedInteger(value,max){return /^(?:0|[1-9][0-9]{0,6})$/.test(value)&&Number(value)<=max}
  function readProof(){
    var values=Object.fromEntries(proofNames.map(function(name){return [name,handoff.get(name)||'']}));
    var attempted=proofNames.some(function(name){return values[name]});
    if(!attempted)return {attempted:false,proof:null};
    var outcomeStarted=values.proof_outcome!=='not_started',outcomeDigestValid=outcomeStarted?/^sha256:[0-9a-f]{64}$/.test(values.proof_outcome_digest):values.proof_outcome_digest==='',outcomeAccepted=values.proof_outcome_accepted==='true',contextAttempted=contextProofNames.some(function(name){return values[name]});
    var contextValid=!contextAttempted||(values.proof_context_contract==='supermega.ai_context_export.v1'&&/^sha256:[0-9a-f]{64}$/.test(values.proof_context_digest)&&values.proof_context_outcome_digest===values.proof_outcome_digest&&values.proof_context_approved==='true'&&values.proof_context_raw_records==='false'&&Number(values.proof_sources)>0&&Number(values.proof_behavior)>0&&Number(values.proof_decisions)>0&&outcomeAccepted);
    var valid=values.proof_contract==='supermega.managed_trial_proof.v2'&&values.proof_version==='2'&&/^sha256:[0-9a-f]{64}$/.test(values.proof_digest)&&/^(shop|plant|website|ecommerce)$/.test(values.proof_product)&&/^[a-z0-9][a-z0-9._-]{0,119}$/.test(values.proof_template)&&boundedInteger(values.proof_readiness,100)&&boundedInteger(values.proof_sources,1000000)&&boundedInteger(values.proof_behavior,1000000)&&boundedInteger(values.proof_decisions,1000000)&&/^(not_started|collecting|target_met|improved|unchanged|regressed)$/.test(values.proof_outcome)&&outcomeDigestValid&&/^(true|false)$/.test(values.proof_outcome_accepted)&&(!outcomeAccepted||/^(target_met|improved)$/.test(values.proof_outcome))&&values.proof_raw_records==='false'&&values.proof_product===(query.get('product')||'')&&values.proof_template===(query.get('template')||'')&&contextValid;
    return {attempted:true,proof:valid?values:null};
  }
  var requestedProduct=query.get('product'),managedIntelligenceRequest=query.get('source')==='managed-intelligence';if(product&&/^(guide|shop|plant|website|ecommerce)$/.test(requestedProduct||''))product.value=requestedProduct;
  if(query.get('template')&&template)template.value=query.get('template');
  if(handoff.get('company')&&company)company.value=handoff.get('company').slice(0,180);
  if(handoff.get('goal')&&goal)goal.value=handoff.get('goal').slice(0,4000);
  var claimInput=form.querySelector('[name="trial_claim_code"]'),claimValue=(handoff.get('claim')||'').toUpperCase();
  if(claimInput&&/^SM-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(claimValue))claimInput.value=claimValue;
  var proofResult=readProof(),proof=proofResult.proof;
  if(proof){
    proofNames.forEach(function(name){var input=form.querySelector('[name="'+name+'"]');if(!input){input=document.createElement('input');input.type='hidden';input.name=name;form.appendChild(input)}input.value=proof[name]});
    if(proofSummary){proofSummary.hidden=false;proofSummary.querySelector('[data-proof-readiness]').textContent=proof.proof_readiness+'%';proofSummary.querySelector('[data-proof-sources]').textContent=proof.proof_sources;proofSummary.querySelector('[data-proof-behavior]').textContent=proof.proof_behavior;proofSummary.querySelector('[data-proof-decisions]').textContent=proof.proof_decisions;var metrics=proofSummary.querySelector('.trial-proof-metrics'),outcome=document.createElement('div'),term=document.createElement('dt'),description=document.createElement('dd');term.textContent='Outcome';description.textContent=proof.proof_outcome_accepted==='true'?proof.proof_outcome.replace('_',' ')+' / accepted':proof.proof_outcome.replace('_',' ');outcome.append(term,description);metrics.appendChild(outcome);if(proof.proof_context_contract){var context=document.createElement('div'),contextTerm=document.createElement('dt'),contextDescription=document.createElement('dd');contextTerm.textContent='AI context';contextDescription.textContent='Approved summary / '+proof.proof_context_digest.slice(7,19);context.append(contextTerm,contextDescription);metrics.appendChild(context)}var note=proofSummary.querySelector('p');if(note)note.textContent=proof.proof_context_contract?'Attached from this browser. The owner-approved context digest is included and raw records remain excluded; this does not verify a managed account.':'Attached from this browser. The outcome is a client-provided, digest-bound aggregate summary; it does not verify a managed account.';}
  }
  function detachProofIfChanged(){
    if(!proof)return;
    if(proof.proof_product===(product&&product.value||'')&&proof.proof_template===(template&&template.value.trim().toLowerCase()||''))return;
    proof=null;proofNames.forEach(function(name){var input=form.querySelector('[name="'+name+'"]');if(input)input.value=''});if(proofSummary)proofSummary.hidden=true;
    if(copyHeading)copyHeading.textContent='Your setup is ready.';if(copy)copy.textContent='Only the company and goal remain attached. The trial summary was removed because the product or template changed.';status.textContent='Trial summary detached. Review the updated request before sending.';
  }
  if(product)product.addEventListener('change',detachProofIfChanged);
  if(template)template.addEventListener('input',detachProofIfChanged);
  if(managedIntelligenceRequest&&!handoff.toString()){
    if(heading)heading.textContent='Request managed company intelligence.';
    if(lede)lede.textContent='Describe the first Shop, Plant, Website, or Ecommerce workflow that should use approved company context.';
    if(copyHeading)copyHeading.textContent='Start with one proven workflow.';
    if(copy)copy.textContent='We will confirm the records, responsible owner, acceptance test, tenant boundary, recovery plan, and actions that must stay review-gated.';
    submit.textContent='Request managed pilot';
  }
  if(handoff.toString()){
    var productName=product&&product.selectedOptions.length?product.selectedOptions[0].textContent:'managed AI';
    if(heading)heading.textContent='Finish your '+productName+' request.';
    if(lede)lede.textContent='Your company and goal are already filled. Add your name and reply email, review the request, then send it.';
    if(copyHeading)copyHeading.textContent=proof?'Your trial proof is attached.':'Your setup is ready.';
    if(copy)copy.textContent=proof?'Readiness, source count, behavior count, reviewed decisions, and the digest-bound outcome summary move forward. Raw records, questions, approval contents, and account details stay out.':'Only this summary moves forward. No raw product records, account connection, automation, or external action begins from this form.';
    status.textContent=proof?'Trial summary attached for review. Nothing has been sent.':proofResult.attempted?'Company and goal are ready. Trial proof was not attached because it did not match this request.':'Company and goal are ready for review from your AI memory.';
    history.replaceState(null,'',location.pathname+location.search);
  }
  form.addEventListener('submit',async function(event){
    event.preventDefault();status.textContent='Sending...';submit.disabled=true;if(!requestKey.value)requestKey.value=newKey();source.value=location.href;referrer.value=document.referrer||'';
    var payload=Object.fromEntries(new FormData(form).entries());
    try{
      var response=await fetch('/api/contact-submissions',{method:'POST',headers:{'content-type':'application/json','accept':'application/json','x-idempotency-key':requestKey.value},body:JSON.stringify(payload)});
      var body=await response.json().catch(function(){return {}});if(!response.ok)throw new Error(body.reason||'send_failed');form.reset();requestKey.value='';status.textContent='Request received: '+(body.request_id||'confirmed')+'. Keep this ID for follow-up.';
    }catch(error){status.textContent=error&&error.message==='rate_limited'?'Too many requests from this connection. Please wait ten minutes and try again.':error&&error.message==='trial_proof_invalid'?'The attached trial summary changed or does not match this request. Open the request again from SuperMega.':'Could not route the request here. Please wait and try again.';}finally{submit.disabled=false;}
  });
})();</script>`

const inlineDigest = (value) => createHash('sha256').update(value).digest('base64')
const contactScriptBody = contactScript.slice('<script>'.length, -'</script>'.length)
const publicSecurityHeaders = {
  'content-security-policy': `default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'sha256-${inlineDigest(contactScriptBody)}'; script-src-attr 'none'; style-src 'self' 'sha256-${inlineDigest(sharedStyle)}'; style-src-attr 'none'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; media-src 'none'; worker-src 'none'; manifest-src 'self'`,
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
}
const contactHtml = documentHtml({
  route: '/contact/',
  title: 'Contact | SuperMega',
  description: 'Tell SuperMega which company workflow should run better.',
  content: `<main class="frame" id="content"><section class="page-hero"><span class="eyebrow">Start a system</span><h1 data-contact-heading>What should run better?</h1><p class="lede" data-contact-lede>Describe one real workflow or recurring handoff, and note any screenshot or spreadsheet you can share. We will reply with the smallest useful system step.</p></section><section class="contact-layout"><div class="contact-copy"><h2 data-contact-copy-heading>Start with the work.</h2><p data-contact-copy>No account, data connection, automation, or external action begins from this form. We first identify the operating records, owner, acceptance test, and authority boundary.</p><section class="trial-proof-summary" data-trial-proof hidden><span class="eyebrow">Client-provided trial proof</span><h3>Reviewed setup summary</h3><p>Attached from this browser. SuperMega checks that the summary belongs to this request after you send; it does not verify a managed account.</p><dl class="trial-proof-metrics"><div><dt>Readiness</dt><dd data-proof-readiness>0%</dd></div><div><dt>Sources</dt><dd data-proof-sources>0</dd></div><div><dt>Behavior</dt><dd data-proof-behavior>0</dd></div><div><dt>Decisions</dt><dd data-proof-decisions>0</dd></div></dl></section></div><form class="contact-form" action="/api/contact-submissions" method="post" data-contact-form><h3>Send the workflow</h3><div class="field-grid"><label>Name<input name="name" autocomplete="name" required maxlength="120" /></label><label>Reply email<input name="email" type="email" autocomplete="email" required maxlength="180" /></label><label class="wide">Company<input name="company" autocomplete="organization" required maxlength="180" /></label><label>Starting point<select name="product"><option value="guide">Help me choose</option><option value="shop">Shop</option><option value="plant">Plant</option><option value="website">Website</option><option value="ecommerce">Ecommerce</option></select></label><label>Template, if known<input name="template" maxlength="120" /></label><label class="wide">What happens now, and what should be better?<textarea name="goal" required maxlength="4000"></textarea></label></div><input type="hidden" name="source_url" /><input type="hidden" name="referrer" /><input type="hidden" name="idempotency_key" /><input type="hidden" name="trial_claim_code" /><input type="hidden" name="proof_contract" /><input type="hidden" name="proof_version" /><input type="hidden" name="proof_digest" /><input type="hidden" name="proof_product" /><input type="hidden" name="proof_template" /><input type="hidden" name="proof_readiness" /><input type="hidden" name="proof_sources" /><input type="hidden" name="proof_behavior" /><input type="hidden" name="proof_decisions" /><input type="hidden" name="proof_raw_records" /><input type="hidden" name="proof_context_contract" /><input type="hidden" name="proof_context_digest" /><input type="hidden" name="proof_context_outcome_digest" /><input type="hidden" name="proof_context_approved" /><input type="hidden" name="proof_context_raw_records" /><input class="contact-honeypot" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" inert /><button class="button primary" type="submit">Send workflow</button><p class="form-note">Your note is used only to respond and prepare the agreed next step.</p><p class="form-status" data-form-status aria-live="polite"></p></form></section></main>${contactScript}`,
})

const privacyHtml = documentHtml({
  route: '/privacy/',
  title: 'Privacy | SuperMega',
  description: 'How SuperMega handles public contact requests and product implementation data.',
  content: `<main class="frame" id="content"><section class="page-hero"><span class="eyebrow">Privacy</span><h1>Collect what the work requires. Protect the rest.</h1><p class="lede">The public site uses the details you choose to send so SuperMega can respond to your request.</p></section><div class="prose"><section><h3>Site measurement</h3><p>On the production SuperMega public site, first-party Vercel Web Analytics records aggregate page views and Speed Insights measures Core Web Vitals. Before either tool starts, SuperMega allows only the seven public page paths and removes query strings and fragments from the URL. SuperMega supplies no custom or conversion event, contact-form value, identity, free text, customer record, payment, or commercial proof in its measurement event fields. Vercel may add a timestamp, referrer, approximate location, browser, operating system, and device information to its aggregate reporting. Source code or a reachable script does not prove that provider telemetry was observed.</p></section><section><h3>Contact requests</h3><p>We receive your name, work email, company, selected product or template, request, source page, referrer, and an optional trial proof summary, outcome status, and digest, plus an approved AI context digest and no-raw-record boundary when you attach them. We use them to reply, qualify the workflow, and prepare the next agreed step.</p></section><section><h3>Product data</h3><p>Trial proof includes bounded readiness, source, behavior, reviewed-decision counts, and a digest-bound aggregate outcome. It excludes raw product records, questions, approval contents, and account details. Sending a request does not create an account or connect a source.</p></section><section><h3>AI processing</h3><p>Governed assistance is configured only against approved sources and roles. Consequential external actions remain behind explicit approval.</p></section><section><h3>Sharing</h3><p>We do not sell contact details. Service providers are used only where needed to host, secure, communicate, or deliver the agreed system.</p></section><section><h3>Deletion</h3><p>Email <a href="mailto:swanhtet@supermega.dev">swanhtet@supermega.dev</a> to request correction or deletion of a public contact record.</p></section></div></main>`,
})

const notFoundHtml = documentHtml({
  route: '/404',
  title: 'Page not found | SuperMega',
  description: 'The requested SuperMega route does not exist.',
  robots: 'noindex,nofollow',
  content: `<main class="frame" id="content"><section class="page-hero"><span class="eyebrow">404 / route retired</span><h1>That page is no longer part of SuperMega.</h1><p class="lede">The public product is now one focused page.</p><div class="actions"><a class="button primary" href="/">Return home</a></div></section></main>`,
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

// Retired public API surface. The legacy ops endpoints (pipeline-control,
// commercial-control, checkout-start, product-activation, sales-daily,
// behavior-events, campaign-clicks, public-app-handoff) were deliberately
// removed in the public-site consolidation (f8c5299e). Their old ops-key 401
// contract is retired with them: every unknown /api/* request — anonymous or
// credentialed — answers 404 {"status":"not_found"} with no auth semantics.
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
const CONTACT_FINGERPRINT_CURRENT_VERSION = 2
const CONTACT_FINGERPRINT_LEGACY_VERSION = 1
const CONTACT_FINGERPRINT_ALGORITHM = 'sha256'
const TRIAL_PROOF_CONTRACT = 'supermega.managed_trial_proof.v2'
const TRIAL_PROOF_VERSION = 2
const TRIAL_PROOF_BASE_FIELDS = ['proof_contract', 'proof_version', 'proof_digest', 'proof_product', 'proof_template', 'proof_readiness', 'proof_sources', 'proof_behavior', 'proof_decisions', 'proof_outcome', 'proof_outcome_digest', 'proof_outcome_accepted', 'proof_raw_records']
const APPROVED_CONTEXT_FIELDS = ['proof_context_contract', 'proof_context_digest', 'proof_context_outcome_digest', 'proof_context_approved', 'proof_context_raw_records']
const TRIAL_PROOF_FIELDS = [...TRIAL_PROOF_BASE_FIELDS, ...APPROVED_CONTEXT_FIELDS]
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

function privacyUrl(value, max = 700) {
  const source = text(value, max)
  if (!source) return ''
  try {
    const parsed = new URL(source)
    parsed.hash = ''
    return text(parsed.toString(), max)
  } catch {
    return text(source.split('#')[0], max)
  }
}

function canonicalInteger(value, max) {
  const source = text(value, 24)
  if (!/^(?:0|[1-9][0-9]{0,6})$/.test(source)) return null
  const parsed = Number(source)
  return Number.isSafeInteger(parsed) && parsed <= max ? parsed : null
}

function publicProduct(product) {
  return product === 'commerce' ? 'shop' : product === 'production' ? 'plant' : product
}

function trialProofProjection(proof) {
  return [proof.contract, proof.version, proof.product, proof.template, proof.readiness_score, proof.source_record_count, proof.behavior_signal_count, proof.reviewed_decision_count, proof.outcome_status, proof.outcome_digest, proof.outcome_accepted, false]
}

function normalizeTrialProof(payload, product, template) {
  const attempted = TRIAL_PROOF_FIELDS.some((field) => text(payload[field], 160))
  if (!attempted) return null
  if (!TRIAL_PROOF_BASE_FIELDS.filter((field) => field !== 'proof_outcome_digest').every((field) => text(payload[field], 160))) throw new Error('trial_proof_invalid')
  const approvedContextAttempted = APPROVED_CONTEXT_FIELDS.some((field) => text(payload[field], 160))
  if (approvedContextAttempted && !APPROVED_CONTEXT_FIELDS.every((field) => text(payload[field], 160))) throw new Error('trial_proof_invalid')
  const proof = {
    contract: text(payload.proof_contract, 80),
    version: canonicalInteger(payload.proof_version, 2),
    summary_digest: text(payload.proof_digest, 80),
    product: text(payload.proof_product, 40).toLowerCase(),
    template: text(payload.proof_template, 120).toLowerCase(),
    readiness_score: canonicalInteger(payload.proof_readiness, 100),
    source_record_count: canonicalInteger(payload.proof_sources, 1000000),
    behavior_signal_count: canonicalInteger(payload.proof_behavior, 1000000),
    reviewed_decision_count: canonicalInteger(payload.proof_decisions, 1000000),
    outcome_status: text(payload.proof_outcome, 40),
    outcome_digest: text(payload.proof_outcome_digest, 80) || null,
    outcome_accepted: text(payload.proof_outcome_accepted, 10) === 'true',
    raw_records_included: false,
    verification: 'client_provided_summary',
  }
  if (proof.contract !== TRIAL_PROOF_CONTRACT
    || proof.version !== TRIAL_PROOF_VERSION
    || !/^sha256:[0-9a-f]{64}$/.test(proof.summary_digest)
    || !/^(shop|plant|website|ecommerce)$/.test(proof.product)
    || !/^[a-z0-9][a-z0-9._-]{0,119}$/.test(proof.template)
    || proof.readiness_score === null
    || proof.source_record_count === null
    || proof.behavior_signal_count === null
    || proof.reviewed_decision_count === null
    || !/^(not_started|collecting|target_met|improved|unchanged|regressed)$/.test(proof.outcome_status)
    || (proof.outcome_status === 'not_started' ? proof.outcome_digest !== null : !/^sha256:[0-9a-f]{64}$/.test(proof.outcome_digest || ''))
    || !/^(true|false)$/.test(text(payload.proof_outcome_accepted, 10))
    || (proof.outcome_accepted && !/^(target_met|improved)$/.test(proof.outcome_status))
    || text(payload.proof_raw_records, 20) !== 'false'
    || proof.product !== publicProduct(product)
    || proof.template !== template.toLowerCase()) throw new Error('trial_proof_invalid')
  const expectedDigest = 'sha256:' + createHash('sha256').update(JSON.stringify(trialProofProjection(proof))).digest('hex')
  if (proof.summary_digest !== expectedDigest) throw new Error('trial_proof_invalid')
  if (approvedContextAttempted) {
    const approvedContext = {
      contract: text(payload.proof_context_contract, 80),
      digest: text(payload.proof_context_digest, 80),
      outcome_digest: text(payload.proof_context_outcome_digest, 80),
      approved: text(payload.proof_context_approved, 10) === 'true',
      raw_records_included: false,
      verification: 'client_provided_digest',
    }
    if (approvedContext.contract !== 'supermega.ai_context_export.v1'
      || !/^sha256:[0-9a-f]{64}$/.test(approvedContext.digest)
      || approvedContext.outcome_digest !== proof.outcome_digest
      || text(payload.proof_context_approved, 10) !== 'true'
      || text(payload.proof_context_raw_records, 20) !== 'false'
      || proof.source_record_count < 1
      || proof.behavior_signal_count < 1
      || proof.reviewed_decision_count < 1
      || !proof.outcome_accepted) throw new Error('trial_proof_invalid')
    proof.approved_context = approvedContext
  }
  return proof
}

function normalizePayload(payload) {
  const requestedProduct = text(payload.product, 40).toLowerCase()
  const product = requestedProduct === 'shop' ? 'commerce' : requestedProduct === 'plant' ? 'production' : requestedProduct
  const template = text(payload.template, 120)
  const safeProduct = ['commerce', 'production', 'website', 'ecommerce', 'guide'].includes(product) ? product : ''
  const claimCode = text(payload.trial_claim_code, 20).toUpperCase()
  const safe = {
    name: text(payload.name, 120),
    email: text(payload.email, 180).toLowerCase(),
    company: text(payload.company, 180),
    product: safeProduct,
    template,
    goal: text(payload.goal, 4000),
    source_url: privacyUrl(payload.source_url, 700),
    referrer: privacyUrl(payload.referrer, 700),
    // Only added when valid so legacy payload fingerprints stay byte-identical.
    ...(/^SM-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(claimCode) ? { trial_claim_code: claimCode } : {}),
  }
  return { ...safe, trial_proof: normalizeTrialProof(payload, safe.product, template) }
}

function keyedDigest(value) {
  return createHmac('sha256', idempotencySecret()).update(value).digest('hex')
}

function fingerprintVersion(safe) {
  return safe.trial_proof ? CONTACT_FINGERPRINT_CURRENT_VERSION : CONTACT_FINGERPRINT_LEGACY_VERSION
}

function payloadFingerprint(safe, version = fingerprintVersion(safe)) {
  const { trial_proof: _trialProof, ...legacySafe } = safe
  const projection = version === CONTACT_FINGERPRINT_LEGACY_VERSION ? legacySafe : safe
  return createHash(CONTACT_FINGERPRINT_ALGORITHM).update('supermega.contact.payload.v' + version + '\\n' + JSON.stringify(projection)).digest('hex')
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

function sourceAttribution(sourceUrl) {
  const fallback = { page_path: '/contact/', utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' }
  try {
    const source = new URL(sourceUrl)
    if (source.protocol !== 'https:' && source.protocol !== 'http:') return fallback
    const campaign = (name) => text(source.searchParams.get(name), 160)
    return {
      page_path: text(source.pathname + source.search, 700) || '/contact/',
      utm_source: campaign('utm_source'),
      utm_medium: campaign('utm_medium'),
      utm_campaign: campaign('utm_campaign'),
      utm_content: campaign('utm_content'),
      utm_term: campaign('utm_term'),
    }
  } catch {
    return fallback
  }
}

function recordFrom(safe, req, idempotencyKey, fingerprint) {
  const submittedAt = new Date().toISOString()
  const leadId = 'LEAD-' + keyedDigest('lead:' + idempotencyKey).slice(0, 16).toUpperCase()
  const taskId = 'TASK-' + keyedDigest('task:' + idempotencyKey).slice(0, 16).toUpperCase()
  const attribution = sourceAttribution(safe.source_url)
  const { trial_proof: trialProof, ...contactSafe } = safe
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
    page_path: attribution.page_path,
    referrer: safe.referrer,
    utm_source: attribution.utm_source,
    utm_medium: attribution.utm_medium,
    utm_campaign: attribution.utm_campaign,
    utm_content: attribution.utm_content,
    utm_term: attribution.utm_term,
    lead_score: 50,
    lead_stage: 'new',
    status: 'new',
    owner: 'SuperMega',
    next_step: 'Review the workflow and reply with the smallest useful next step.',
    submitted_at: submittedAt,
    raw: {
      ...contactSafe,
      ...(trialProof ? { trial_proof: trialProof } : {}),
      user_agent: text(req.headers?.['user-agent'], 240),
      contact_idempotency: {
        version: fingerprintVersion(safe),
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
    ![CONTACT_FINGERPRINT_LEGACY_VERSION, CONTACT_FINGERPRINT_CURRENT_VERSION].includes(marker.version) ||
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
  const body = ['New SuperMega request', '', 'Product: ' + record.workflow, 'Template: ' + (record.requested_package || 'not selected'), 'Company: ' + record.company, 'Name: ' + record.name, 'Email: ' + record.email].concat(record.raw.trial_claim_code ? ['Trial claim code: ' + record.raw.trial_claim_code] : []).concat(['', record.goal, '', 'Source: ' + record.source_url, 'Lead: ' + record.lead_id]).join('\\n')
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json', 'idempotency-key': 'supermega-contact-email/' + record.lead_id }, body: JSON.stringify({ from, to: [to], reply_to: record.email, subject: 'SuperMega request — ' + record.company, text: body }), signal: AbortSignal.timeout(9000) })
  if (!response.ok) throw new Error('email_' + response.status)
  return { status: 'ready', channel: 'email' }
}

async function sendTelegram(record) {
  const token = env('TELEGRAM_BOT_TOKEN')
  const chatId = env('TELEGRAM_CHAT_ID')
  if (!token || !chatId) return { status: 'skipped' }
  const message = ['New SuperMega request', record.company + ' · ' + record.name, record.email, 'Product: ' + record.workflow, 'Template: ' + (record.requested_package || 'not selected')].concat(record.raw.trial_claim_code ? ['Claim: ' + record.raw.trial_claim_code] : []).concat(['', record.goal, '', record.lead_id]).join('\\n').slice(0, 3900)
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

async function sendCustomerAcknowledgement(record) {
  const key = env('RESEND_API_KEY')
  if (!key) return { status: 'skipped' }
  if (!emailOk(record.email)) return { status: 'skipped' }
  const from = env('SUPERMEGA_CONTACT_FROM_EMAIL') || 'SuperMega <leads@supermega.dev>'
  const replyTo = env('SUPERMEGA_CONTACT_NOTIFY_EMAIL') || 'swanhtet@supermega.dev'
  const body = ['Hi ' + record.name + ',', '', 'Thanks for reaching out to SuperMega. Your request for ' + record.workflow + ' is in.', '', 'What happens next:', '1. A founder reads every request personally.', '2. You get a reply from a real person, usually within one business day.', '3. Your trial keeps working on your device the whole time.', '', 'Your reference: ' + record.lead_id].concat(record.raw.trial_claim_code ? ['Your trial claim code: ' + record.raw.trial_claim_code] : []).concat(['', 'Reply to this email any time. It reaches the founder directly.', '', 'SuperMega - https://supermega.dev']).join('\\n')
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json', 'idempotency-key': 'supermega-contact-ack/' + record.lead_id }, body: JSON.stringify({ from, to: [record.email], reply_to: replyTo, subject: 'We received your request - SuperMega', text: body }), signal: AbortSignal.timeout(9000) })
  if (!response.ok) throw new Error('ack_email_' + response.status)
  return { status: 'ready', channel: 'ack_email' }
}

module.exports = async function handler(req, res) {
  const method = String(req.method || 'GET').toUpperCase()
  if (method === 'GET') {
    const accepting = configured()
    send(res, 200, { status: accepting ? 'ready' : 'attention', service: 'supermega-contact', accepting, controls: { idempotency: 'required', edge_rate_limit: 'required', trial_proof: 'optional_client_provided' } })
    return
  }
  if (method !== 'POST') { send(res, 405, { status: 'error', reason: 'method_not_allowed' }); return }
  let payload
  try { payload = await parseBody(req) } catch { send(res, 400, { status: 'error', reason: 'invalid_request' }); return }
  if (text(payload.website, 120)) { send(res, 202, { status: 'ready' }); return }
  if (!sameOrigin(req)) { send(res, 403, { status: 'error', reason: 'origin_not_allowed' }); return }
  let safe
  try { safe = normalizePayload(payload) } catch (error) {
    send(res, 400, { status: 'error', reason: error?.message === 'trial_proof_invalid' ? 'trial_proof_invalid' : 'invalid_request' })
    return
  }
  if (!safe.name || !safe.company || !safe.goal || !emailOk(safe.email)) { send(res, 400, { status: 'error', reason: 'required_fields_missing' }); return }
  if (!safe.product) { send(res, 400, { status: 'error', reason: 'product_not_supported' }); return }
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
  const acceptedBody = { status: 'ready', request_id: record.lead_id, proof_bound: Boolean(safe.trial_proof) }
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
  try { await sendCustomerAcknowledgement(record) } catch {}
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

for (const page of manifest.pages.filter((entry) => entry.productId)) {
  const product = publicProducts.find((candidate) => candidate.id === page.productId)
  assert(product, `landing_page_product_missing:${page.productId}`)
  assert(page.route === `/${product.id}/` && page.file === `${product.id}/index.html`, `landing_page_route_drift:${page.route}`)
  assert(page.liveGate === 'post-release', `landing_page_live_gate_missing:${page.route}`)
  pageFiles.set(page.file, productLandingHtml(product, page))
}

const vercelConfig = {
  version: 3,
  routes: [
    { src: '^/(.*)$', headers: publicSecurityHeaders, continue: true },
    { src: '^/api/contact-submissions/status/?$', dest: '/api/contact-submissions.js' },
    { src: '^/api/contact-submissions/?$', dest: '/api/contact-submissions.js' },
    { src: '^/api/health/?$', dest: '/api/health.js' },
    { src: '^/api/(.*)$', dest: '/api/not-found.js' },
    ...manifest.redirects.map((redirect) => ({ src: redirect.source, status: 308, headers: { Location: redirect.destination } })),
    { src: '^/__release\\.json$', headers: { 'cache-control': 'no-store, max-age=0' }, continue: true },
    { src: '^/vercel-insights\\.js$', headers: { 'cache-control': 'no-store, max-age=0' }, continue: true },
    { src: '^/(?:favicon\\.svg|site\\.webmanifest|og-card(?:-(?:shop|plant|website|ecommerce))?\\.png)$', headers: { 'cache-control': 'public, max-age=86400, stale-while-revalidate=604800' }, continue: true },
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
await writeStatic('vercel-insights.js', publicObservabilityScript)
await writeFile(resolve(staticDir, 'og-card.png'), ogCardPng)
for (const [fileName, cardPng] of productOgCards) await writeFile(resolve(staticDir, fileName), cardPng)
await writeStatic('__release.json', `${JSON.stringify(release, null, 2)}\n`)
await writeStatic('robots.txt', 'User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://supermega.dev/sitemap.xml\n')
await writeStatic('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${manifest.pages.map((page) => `  <url><loc>${escapeHtml(canonical(page.route))}</loc><lastmod>${release.generatedAt.slice(0, 10)}</lastmod><changefreq>${page.route === '/privacy/' ? 'yearly' : 'weekly'}</changefreq></url>`).join('\n')}\n</urlset>\n`)
await writeStatic('site.webmanifest', `${JSON.stringify({ name: 'SuperMega', short_name: 'SuperMega', start_url: '/', display: 'browser', background_color: brand.colors.background, theme_color: brand.colors.background, icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] }, null, 2)}\n`)

await writeFunction('health.js', healthFunction)
await writeFunction('contact-submissions.js', contactFunction)
await writeFunction('not-found.js', notFoundFunction)
await writeFile(resolve(outputDir, 'config.json'), `${JSON.stringify(vercelConfig, null, 2)}\n`, 'utf8')

console.log(JSON.stringify({ ok: true, contract: 'supermega_public_build', pages: manifest.pages.map((page) => page.route), release }))
