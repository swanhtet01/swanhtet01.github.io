import { createHash } from 'node:crypto'
import { chmod, lstat, open, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const CLIENT_LAUNCH_DASHBOARD_CONTRACT = 'supermega.client_launch_dashboard.v1'

const BOARD_CONTRACT = 'supermega.client_launch_board.v1'
const MAX_BOARD_BYTES = 512 * 1024
const MAX_DASHBOARD_BYTES = 128 * 1024
const PRODUCT_ORDER = ['shop', 'plant', 'website', 'ecommerce']

function fail(code) {
  throw new Error(code)
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  fail('client_launch_dashboard_value_invalid')
}

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`
}

function bounded(value, code, maximum = 240) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) fail(code)
  return value.trim()
}

function boundedList(value, code, maximum = 24) {
  if (!Array.isArray(value) || value.length > maximum) fail(code)
  return value.map((item) => bounded(item, code))
}

export function verifyClientLaunchBoardForDashboard(board) {
  if (!board || typeof board !== 'object' || Array.isArray(board) || board.contract !== BOARD_CONTRACT) fail('client_launch_dashboard_board_invalid')
  if (!/^sha256:[0-9a-f]{64}$/.test(board.boardDigest ?? '')) fail('client_launch_dashboard_digest_invalid')
  const unsigned = structuredClone(board)
  delete unsigned.boardDigest
  if (digest(unsigned) !== board.boardDigest) fail('client_launch_dashboard_digest_mismatch')
  if (!Array.isArray(board.products) || board.products.length < 1 || board.products.length > PRODUCT_ORDER.length) fail('client_launch_dashboard_products_invalid')
  const productIds = board.products.map((product) => bounded(product?.productId, 'client_launch_dashboard_product_invalid', 24))
  if (new Set(productIds).size !== productIds.length
    || productIds.some((product) => !PRODUCT_ORDER.includes(product))
    || JSON.stringify(productIds) !== JSON.stringify(PRODUCT_ORDER.filter((product) => productIds.includes(product)))) fail('client_launch_dashboard_products_invalid')
  for (const product of board.products) {
    for (const field of ['label', 'templateId', 'dataStatus', 'acceptedOutcomeStatus', 'approvedAiContextStatus', 'managedTrialRequestStatus', 'nextAction']) {
      bounded(product[field], 'client_launch_dashboard_product_invalid')
    }
  }
  if (!Array.isArray(board.launchStages) || board.launchStages.length !== 6) fail('client_launch_dashboard_stages_invalid')
  for (const stage of board.launchStages) {
    bounded(stage?.id, 'client_launch_dashboard_stage_invalid', 80)
    bounded(stage?.status, 'client_launch_dashboard_stage_invalid', 40)
    bounded(stage?.proof, 'client_launch_dashboard_stage_invalid', 320)
  }
  if (!Array.isArray(board.connections) || board.connections.length > 3) fail('client_launch_dashboard_connections_invalid')
  for (const connection of board.connections) {
    bounded(connection?.label, 'client_launch_dashboard_connection_invalid', 180)
    if (connection.automaticCrossProductWrites !== false) fail('client_launch_dashboard_connection_invalid')
  }
  boundedList(board.blockingGates, 'client_launch_dashboard_blockers_invalid')
  boundedList(board.nextActions, 'client_launch_dashboard_actions_invalid')
  if (board.customSolutions?.tenantBound !== true || board.customSolutions?.automaticActivation !== false) fail('client_launch_dashboard_custom_solution_invalid')
  if (board.controls?.containsRawClientRows !== false
    || board.controls?.containsSecrets !== false
    || board.controls?.tenantWritesPerformed !== false
    || board.controls?.providerCallsPerformed !== false
    || board.controls?.externalMessagesSent !== false
    || board.controls?.deploymentPerformed !== false
    || board.controls?.productionActivationPerformed !== false
    || board.controls?.syntheticEvidenceCannotAuthorizeProduction !== true) fail('client_launch_dashboard_controls_invalid')
  bounded(board.status, 'client_launch_dashboard_status_invalid', 80)
  return structuredClone(board)
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function humanize(value) {
  return escapeHtml(value.replaceAll(':', ' — ').replaceAll('_', ' ').replaceAll('-', ' '))
}

function tone(status) {
  if (status === 'ready') return 'ready'
  if (status === 'blocked') return 'blocked'
  return 'waiting'
}

export function renderClientLaunchDashboard(input) {
  const board = verifyClientLaunchBoardForDashboard(input)
  const products = board.products.map((product) => `
        <article class="product">
          <div class="product-head"><span class="prompt">&gt;_</span><h3>${escapeHtml(product.label)}</h3><span class="pill ${tone(product.dataStatus)}">${humanize(product.dataStatus)}</span></div>
          <dl>
            <div><dt>Template</dt><dd>${humanize(product.templateId)}</dd></div>
            <div><dt>Outcome</dt><dd>${humanize(product.acceptedOutcomeStatus)}</dd></div>
            <div><dt>AI context</dt><dd>${humanize(product.approvedAiContextStatus)}</dd></div>
          </dl>
          <p class="next"><strong>Next:</strong> ${humanize(product.nextAction)}</p>
        </article>`).join('')
  const stages = board.launchStages.map((stage, index) => `
          <li class="stage"><span class="step">${index + 1}</span><div><strong>${humanize(stage.id)}</strong><p>${escapeHtml(stage.proof)}</p></div><span class="pill ${tone(stage.status)}">${humanize(stage.status)}</span></li>`).join('')
  const actions = board.nextActions.length
    ? board.nextActions.slice(0, 5).map((action) => `<li>${humanize(action)}</li>`).join('')
    : '<li>Review the verified launch board with the implementation owner.</li>'
  const connections = board.connections.length
    ? board.connections.map((connection) => `<li>${escapeHtml(connection.label)} <span>available after tenant activation</span></li>`).join('')
    : '<li>No cross-product workflow is enabled for this portal yet.</li>'
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">
  <title>SuperMega private client launch</title>
  <style>
    :root{color-scheme:dark;--bg:#07110f;--panel:#0d1b17;--panel2:#11231e;--ink:#f2f7f4;--muted:#9eb2aa;--line:#25443a;--jade:#45e0a8;--amber:#ffc766;--red:#ff8e86}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 90% 0,#143b2f 0,transparent 35%),var(--bg);color:var(--ink);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}main{width:min(1080px,calc(100% - 32px));margin:auto;padding:32px 0 48px}.brand{display:flex;align-items:center;gap:10px;color:var(--jade);font-weight:800;letter-spacing:.08em}.prompt{color:var(--jade);font:800 1.05rem ui-monospace,Consolas,monospace}.hero{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:end;padding:36px 0 24px;border-bottom:1px solid var(--line)}h1{max-width:720px;margin:8px 0;font-size:clamp(2rem,7vw,4.5rem);line-height:.98;letter-spacing:-.055em}.lede{max-width:680px;color:var(--muted);font-size:1.05rem}.not-live{max-width:250px;padding:16px;border:1px solid #725d2d;background:#261f10;border-radius:16px;color:#ffe1a8}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}.metric,.panel,.product{border:1px solid var(--line);background:linear-gradient(145deg,var(--panel2),var(--panel));border-radius:18px}.metric{padding:16px}.metric strong{display:block;font-size:1.65rem}.metric span,dt{color:var(--muted);font-size:.78rem;text-transform:uppercase;letter-spacing:.08em}.layout{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.75fr);gap:16px}.panel{padding:20px;margin-bottom:16px}h2{font-size:1.05rem;margin:0 0 14px}h3{margin:0;font-size:1.05rem}.products{display:grid;gap:12px}.product{padding:18px}.product-head{display:flex;align-items:center;gap:10px}.product-head h3{flex:1}dl{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0}dl div{padding:10px;background:#081510;border-radius:10px}dd{margin:3px 0 0}.next{margin:0;color:#d9e7e1}.pill{display:inline-flex;align-items:center;border-radius:999px;padding:4px 9px;font-size:.72rem;font-weight:750;text-transform:uppercase;letter-spacing:.04em}.ready{background:#123e30;color:#75f0c0}.blocked{background:#3d1d1b;color:#ffaaa4}.waiting{background:#392e16;color:#ffd887}.stages,.plain{list-style:none;margin:0;padding:0}.stage{display:grid;grid-template-columns:28px 1fr auto;gap:10px;align-items:start;padding:12px 0;border-top:1px solid var(--line)}.stage:first-child{border-top:0}.step{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;background:#18382e;color:var(--jade);font-weight:800}.stage p{margin:3px 0;color:var(--muted);font-size:.86rem}.plain li{padding:9px 0;border-top:1px solid var(--line)}.plain li:first-child{border-top:0}.plain span{display:block;color:var(--muted);font-size:.82rem}.guard{border-color:#3d674f}.guard strong{color:var(--jade)}code{overflow-wrap:anywhere;color:var(--muted);font-size:.74rem}.foot{margin-top:20px;color:var(--muted);font-size:.8rem}@media(max-width:760px){main{width:min(100% - 20px,680px);padding-top:20px}.hero{grid-template-columns:1fr;padding-top:22px}.not-live{max-width:none}.summary{grid-template-columns:repeat(3,1fr)}.layout{grid-template-columns:1fr}dl{grid-template-columns:1fr}.stage{grid-template-columns:28px 1fr}.stage .pill{grid-column:2;width:max-content}h1{font-size:2.6rem}}@media(max-width:430px){.summary{grid-template-columns:1fr}.product-head{align-items:flex-start;flex-wrap:wrap}.product-head h3{min-width:55%}}
  </style>
</head>
<body>
  <main>
    <div class="brand"><span class="prompt">&gt;_</span> SUPERMEGA / PRIVATE CLIENT PORTAL</div>
    <header class="hero">
      <div><p class="pill waiting">Founder review</p><h1>One clear path to launch.</h1><p class="lede">Only the selected products, the evidence still needed, and the next action. No company internals, agent controls, or setup clutter.</p></div>
      <aside class="not-live"><strong>Not live yet</strong><br>This page does not activate a tenant, deploy software, send a message, or call a provider.</aside>
    </header>
    <section class="summary" aria-label="Launch summary">
      <div class="metric"><strong>${board.products.length}</strong><span>Selected product${board.products.length === 1 ? '' : 's'}</span></div>
      <div class="metric"><strong>${board.blockingGates.length}</strong><span>Blocking gate${board.blockingGates.length === 1 ? '' : 's'}</span></div>
      <div class="metric"><strong>${board.connections.length}</strong><span>Product connection${board.connections.length === 1 ? '' : 's'}</span></div>
    </section>
    <div class="layout">
      <div>
        <section class="panel"><h2>Selected products</h2><div class="products">${products}</div></section>
        <section class="panel"><h2>Launch path</h2><ol class="stages">${stages}</ol></section>
      </div>
      <aside>
        <section class="panel"><h2>Do next</h2><ol class="plain">${actions}</ol></section>
        <section class="panel"><h2>Connected workflows</h2><ul class="plain">${connections}</ul></section>
        <section class="panel guard"><h2>Custom solutions</h2><p><strong>Available after the base product review.</strong> Extensions stay tenant-bound, versioned, security-reviewed, owner-authorized, and reversible.</p></section>
        <section class="panel guard"><h2>Safety boundary</h2><p>No raw client rows or secrets are shown. Production activation remains owner-gated.</p><code>${escapeHtml(board.boardDigest)}</code></section>
      </aside>
    </div>
    <p class="foot">Private local review artifact · SuperMega &gt;_ · Generated from a digest-verified launch board</p>
  </main>
</body>
</html>
`
}

export function verifyClientLaunchDashboard(html, board) {
  const expected = renderClientLaunchDashboard(board)
  if (typeof html !== 'string' || html !== expected) fail('client_launch_dashboard_stale_or_altered')
  return { contract: CLIENT_LAUNCH_DASHBOARD_CONTRACT, bytes: Buffer.byteLength(html), digest: digest(html) }
}

export async function writeClientLaunchDashboard(html, outputPath) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) fail('client_launch_dashboard_output_invalid')
  const bytes = Buffer.byteLength(html, 'utf8')
  if (bytes < 1 || bytes > MAX_DASHBOARD_BYTES) fail('client_launch_dashboard_output_invalid')
  const target = resolve(outputPath)
  const existing = await lstat(target).catch(() => null)
  if (existing) fail('client_launch_dashboard_output_exists')
  const handle = await open(target, 'wx', 0o600)
  try { await handle.writeFile(html, 'utf8') } finally { await handle.close() }
  await chmod(target, 0o600).catch(() => null)
  return { contract: CLIENT_LAUNCH_DASHBOARD_CONTRACT, bytes, digest: digest(html) }
}

async function readBoard(path) {
  const target = resolve(path)
  const metadata = await lstat(target).catch(() => null)
  if (!metadata || !metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1 || metadata.size > MAX_BOARD_BYTES) fail('client_launch_dashboard_board_file_invalid')
  try { return JSON.parse(await readFile(target, 'utf8')) } catch { fail('client_launch_dashboard_board_file_invalid') }
}

function parseArgs(argv) {
  const board = argv.indexOf('--board')
  const output = argv.indexOf('--output')
  if (argv.length !== 4 || board < 0 || !argv[board + 1] || output < 0 || !argv[output + 1]) fail('client_launch_dashboard_arguments_invalid')
  return { board: argv[board + 1], output: argv[output + 1] }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const board = await readBoard(args.board)
  const html = renderClientLaunchDashboard(board)
  const written = await writeClientLaunchDashboard(html, args.output)
  const persisted = await readFile(resolve(args.output), 'utf8')
  verifyClientLaunchDashboard(persisted, board)
  process.stdout.write(`${JSON.stringify({
    ok: true,
    contract: written.contract,
    bytes: written.bytes,
    dashboardDigest: written.digest,
    productCount: board.products.length,
    blockingGateCount: board.blockingGates.length,
    externalWritesPerformed: false,
    tenantWritesPerformed: false,
    productionActivationPerformed: false,
  })}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, contract: CLIENT_LAUNCH_DASHBOARD_CONTRACT, error: String(error?.message || 'client_launch_dashboard_failed').slice(0, 160), externalWritesPerformed: false })}\n`)
    process.exitCode = 1
  })
}
