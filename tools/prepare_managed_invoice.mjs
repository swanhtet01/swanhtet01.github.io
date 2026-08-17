// Managed-tier billing rail: deterministic manual invoice packet preparation.
//
// Design: hq/strategy/BILLING-RAIL-DESIGN.md (audit gate 9). Path adapted on
// cherry-pick from design/managed-billing-rail, where this line pointed at
// docs/billing/managed-billing-design.md; that document was superseded and does
// not exist on this branch. Everything else is verbatim from commit 3aab5edc.
// This tool PREPARES a founder action. It performs zero network activity, writes
// only with `wx` (never overwrites), and takes every monetary value exclusively
// from the founder-supplied config file. There are no default amounts, prices,
// currencies, or exponents anywhere in this file. Marking an invoice issued,
// paid, or void is a founder action outside this tool.

import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MANAGED_BILLING_CONTRACT = 'supermega.managed-billing.v1'
export const INVOICE_CONFIG_CONTRACT = 'supermega.managed-billing.invoice-config.v1'
export const INVOICE_PACKET_CONTRACT = 'supermega.managed-billing.invoice-packet.v1'

const INVOICE_ID_RE = /^INV-[A-Za-z0-9-]{4,40}$/
// Kernel tenant id rule (kernel/store.mjs CONTROL_ID_RE).
const TENANT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/
const CURRENCY_RE = /^[A-Z]{3}$/
const PAYMENT_CATEGORIES = Object.freeze(['bank_transfer', 'mobile_money', 'cash'])
const STATUS_LIFECYCLE = Object.freeze({
  initial: 'draft',
  terminal: ['paid', 'void'],
  transitions: ['draft->issued', 'draft->void', 'issued->paid', 'issued->void'],
})
const MAX_LINE_ITEMS = 20
const MAX_CHANNELS = 5

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value, field, required, optional = []) {
  if (!isRecord(value)) fail(`${field}_invalid`)
  const keys = Object.keys(value)
  for (const key of required) if (!(key in value)) fail(`${field}_${key}_missing`)
  for (const key of keys) if (!required.includes(key) && !optional.includes(key)) fail(`${field}_unknown_key_${key}`)
  return value
}

function boundedText(value, field, max = 180) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field}_required`)
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) fail(`${field}_invalid`)
  return normalized
}

function minorAmount(value, field) {
  // Monetary values must be explicit non-negative integers in minor units.
  // A string, float, or missing value fails closed; nothing is defaulted.
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(`${field}_invalid`)
  return value
}

function dateOnly(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${field}_invalid`)
  const instant = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 10) !== value) fail(`${field}_invalid`)
  return { value, instant }
}

function isoInstant(value, field) {
  if (typeof value !== 'string') fail(`${field}_invalid`)
  const instant = Date.parse(value)
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== value) fail(`${field}_invalid`)
  return value
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
}

function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex')
}

export function invoiceDigest(core) {
  return `sha256:${sha256Hex(stableJson(core))}`
}

export function formatMinorAmount(minor, exponent, currency) {
  const digits = String(minor)
  if (exponent === 0) return `${digits} ${currency}`
  const padded = digits.padStart(exponent + 1, '0')
  return `${padded.slice(0, -exponent)}.${padded.slice(-exponent)} ${currency}`
}

export function validateInvoiceConfig(config) {
  exactKeys(config, 'config', [
    'contract', 'invoiceId', 'workspace', 'customer', 'period', 'amount',
    'lineItems', 'tax', 'paymentChannels', 'issuedAt', 'dueDate', 'issuer',
  ], ['notes'])
  if (config.contract !== INVOICE_CONFIG_CONTRACT) fail('config_contract_invalid')
  const invoiceId = boundedText(config.invoiceId, 'config_invoice_id', 44)
  if (!INVOICE_ID_RE.test(invoiceId)) fail('config_invoice_id_invalid')

  exactKeys(config.workspace, 'config_workspace', ['id', 'name'])
  const workspaceId = boundedText(config.workspace.id, 'config_workspace_id', 80)
  if (!TENANT_ID_RE.test(workspaceId)) fail('config_workspace_id_invalid')
  const workspace = { id: workspaceId, name: boundedText(config.workspace.name, 'config_workspace_name') }

  exactKeys(config.customer, 'config_customer', ['name'], ['contact'])
  const customer = { name: boundedText(config.customer.name, 'config_customer_name') }
  if (config.customer.contact !== undefined) customer.contact = boundedText(config.customer.contact, 'config_customer_contact')

  exactKeys(config.period, 'config_period', ['label', 'start', 'end'])
  const periodStart = dateOnly(config.period.start, 'config_period_start')
  const periodEnd = dateOnly(config.period.end, 'config_period_end')
  if (periodStart.instant > periodEnd.instant) fail('config_period_order_invalid')
  const period = { label: boundedText(config.period.label, 'config_period_label', 40), start: periodStart.value, end: periodEnd.value }

  exactKeys(config.amount, 'config_amount', ['currency', 'exponent', 'totalMinor'])
  if (typeof config.amount.currency !== 'string' || !CURRENCY_RE.test(config.amount.currency)) fail('config_currency_invalid')
  if (!Number.isSafeInteger(config.amount.exponent) || config.amount.exponent < 0 || config.amount.exponent > 4) fail('config_exponent_invalid')
  const totalMinor = minorAmount(config.amount.totalMinor, 'config_total_minor')
  if (totalMinor < 1) fail('config_total_minor_invalid')

  if (!Array.isArray(config.lineItems) || config.lineItems.length < 1 || config.lineItems.length > MAX_LINE_ITEMS) fail('config_line_items_invalid')
  const lineItems = config.lineItems.map((item, index) => {
    exactKeys(item, `config_line_item_${index}`, ['description', 'amountMinor'])
    return {
      description: boundedText(item.description, `config_line_item_${index}_description`),
      amountMinor: minorAmount(item.amountMinor, `config_line_item_${index}_amount`),
    }
  })
  if (!lineItems.some((item) => item.amountMinor > 0)) fail('config_line_items_all_zero')

  exactKeys(config.tax, 'config_tax', ['decided'], ['description', 'amountMinor'])
  let tax
  if (config.tax.decided === false) {
    if ('description' in config.tax || 'amountMinor' in config.tax) fail('config_tax_undecided_extra')
    tax = { decided: false }
  } else if (config.tax.decided === true) {
    tax = {
      decided: true,
      description: boundedText(config.tax.description, 'config_tax_description'),
      amountMinor: minorAmount(config.tax.amountMinor, 'config_tax_amount'),
    }
  } else fail('config_tax_invalid')

  const lineSum = lineItems.reduce((sum, item) => sum + item.amountMinor, 0) + (tax.decided ? tax.amountMinor : 0)
  if (lineSum !== totalMinor) fail('config_total_mismatch')

  if (!Array.isArray(config.paymentChannels) || config.paymentChannels.length < 1 || config.paymentChannels.length > MAX_CHANNELS) fail('config_payment_channels_invalid')
  const paymentChannels = config.paymentChannels.map((channel, index) => {
    exactKeys(channel, `config_payment_channel_${index}`, ['category', 'label', 'reference'])
    if (!PAYMENT_CATEGORIES.includes(channel.category)) fail(`config_payment_channel_${index}_category_invalid`)
    return {
      category: channel.category,
      label: boundedText(channel.label, `config_payment_channel_${index}_label`),
      reference: boundedText(channel.reference, `config_payment_channel_${index}_reference`),
    }
  })

  const issuedAt = isoInstant(config.issuedAt, 'config_issued_at')
  const dueDate = dateOnly(config.dueDate, 'config_due_date')
  if (dueDate.instant < Date.parse(issuedAt.slice(0, 10) + 'T00:00:00.000Z')) fail('config_due_date_before_issue')

  exactKeys(config.issuer, 'config_issuer', ['name'])
  const core = {
    contract: MANAGED_BILLING_CONTRACT,
    invoiceId,
    workspace,
    customer,
    period,
    lineItems,
    tax,
    amount: { currency: config.amount.currency, exponent: config.amount.exponent, totalMinor },
    paymentChannels,
    issuedToPayBy: { issuedAt, dueDate: dueDate.value },
    issuer: { name: boundedText(config.issuer.name, 'config_issuer_name') },
  }
  if (config.notes !== undefined) core.notes = boundedText(config.notes, 'config_notes', 400)
  return core
}

export function buildInvoicePacket(configText) {
  const normalized = String(configText).replace(/\r\n?/g, '\n')
  let parsed
  try { parsed = JSON.parse(normalized) } catch { fail('config_json_invalid') }
  const invoice = validateInvoiceConfig(parsed)
  const digest = invoiceDigest(invoice)
  const packet = {
    contract: INVOICE_PACKET_CONTRACT,
    status: STATUS_LIFECYCLE.initial,
    statusLifecycle: STATUS_LIFECYCLE,
    invoice,
    invoiceDigest: digest,
    configDigest: `sha256:${sha256Hex(normalized)}`,
    proposedControlRecord: {
      record_key: `managed-billing-invoice:${invoice.workspace.id}:${invoice.invoiceId}`,
      record_type: 'managed_billing_invoice',
      tenant_id: invoice.workspace.id,
      status: STATUS_LIFECYCLE.initial,
      plan_hash: digest.slice('sha256:'.length),
      note: 'Proposal only. Storage requires the managed-billing-invoice: prefix in kernel CONTROL_RECORD_PREFIXES and a separate founder decision; every status transition needs an owner-approval proof (actionId, capturedAt, actor, reason, evidenceReference).',
    },
    controls: {
      networkActivity: 'none',
      externalWritesPerformed: false,
      founderActionRequired: true,
      monetaryValuesFromConfigOnly: true,
      pricingDecided: false,
      taxDecided: invoice.tax.decided,
    },
  }
  return { packet, text: printableInvoice(packet) }
}

export function printableInvoice(packet) {
  const invoice = packet.invoice
  const { currency, exponent } = invoice.amount
  const money = (minor) => formatMinorAmount(minor, exponent, currency)
  const lines = [
    'SUPERMEGA MANAGED SERVICE INVOICE (DRAFT - founder approval required before issue)',
    '='.repeat(78),
    `Invoice        ${invoice.invoiceId}`,
    `Issuer         ${invoice.issuer.name}`,
    `Workspace      ${invoice.workspace.name} (${invoice.workspace.id})`,
    `Customer       ${invoice.customer.name}${invoice.customer.contact ? ` — ${invoice.customer.contact}` : ''}`,
    `Period         ${invoice.period.label} (${invoice.period.start} to ${invoice.period.end})`,
    `Issued at      ${invoice.issuedToPayBy.issuedAt}`,
    `Pay by         ${invoice.issuedToPayBy.dueDate}`,
    '-'.repeat(78),
    'Line items',
    ...invoice.lineItems.map((item) => `  ${item.description.padEnd(56).slice(0, 56)} ${money(item.amountMinor)}`),
    invoice.tax.decided
      ? `  ${invoice.tax.description.padEnd(56).slice(0, 56)} ${money(invoice.tax.amountMinor)}`
      : '  Tax: not decided (founder decision pending; no tax line applied)',
    '-'.repeat(78),
    `TOTAL DUE      ${money(invoice.amount.totalMinor)}`,
    '-'.repeat(78),
    'Pay through one founder-named channel and quote the invoice id:',
    ...invoice.paymentChannels.map((channel) => `  [${channel.category}] ${channel.label} — ${channel.reference}`),
    ...(invoice.notes ? ['-'.repeat(78), `Notes: ${invoice.notes}`] : []),
    '-'.repeat(78),
    `Record digest  ${packet.invoiceDigest}`,
    'Payment is verified manually by the issuer before this invoice is marked paid.',
    '',
  ]
  return lines.join('\n')
}

export function verifyInvoicePacket(packetText) {
  let parsed
  try { parsed = JSON.parse(String(packetText)) } catch { fail('packet_json_invalid') }
  if (!isRecord(parsed) || parsed.contract !== INVOICE_PACKET_CONTRACT) fail('packet_contract_invalid')
  if (parsed.status !== 'draft') fail('packet_status_invalid')
  if (stableJson(parsed.statusLifecycle) !== stableJson(STATUS_LIFECYCLE)) fail('packet_lifecycle_invalid')
  const rebuilt = validateInvoiceConfig({
    contract: INVOICE_CONFIG_CONTRACT,
    invoiceId: parsed.invoice?.invoiceId,
    workspace: parsed.invoice?.workspace,
    customer: parsed.invoice?.customer,
    period: parsed.invoice?.period,
    amount: parsed.invoice?.amount,
    lineItems: parsed.invoice?.lineItems,
    tax: parsed.invoice?.tax,
    paymentChannels: parsed.invoice?.paymentChannels,
    issuedAt: parsed.invoice?.issuedToPayBy?.issuedAt,
    dueDate: parsed.invoice?.issuedToPayBy?.dueDate,
    issuer: parsed.invoice?.issuer,
    ...(parsed.invoice?.notes !== undefined ? { notes: parsed.invoice.notes } : {}),
  })
  if (stableJson(rebuilt) !== stableJson(parsed.invoice)) fail('packet_invoice_not_canonical')
  const digest = invoiceDigest(rebuilt)
  if (parsed.invoiceDigest !== digest) fail('packet_digest_mismatch')
  if (!/^sha256:[0-9a-f]{64}$/.test(parsed.configDigest || '')) fail('packet_config_digest_invalid')
  const control = parsed.proposedControlRecord
  if (!isRecord(control)
    || control.record_key !== `managed-billing-invoice:${rebuilt.workspace.id}:${rebuilt.invoiceId}`
    || control.record_type !== 'managed_billing_invoice'
    || control.tenant_id !== rebuilt.workspace.id
    || control.status !== 'draft'
    || control.plan_hash !== digest.slice('sha256:'.length)) fail('packet_control_record_invalid')
  if (parsed.controls?.externalWritesPerformed !== false
    || parsed.controls?.founderActionRequired !== true
    || parsed.controls?.monetaryValuesFromConfigOnly !== true
    || parsed.controls?.pricingDecided !== false) fail('packet_controls_invalid')
  return { invoiceId: rebuilt.invoiceId, workspaceId: rebuilt.workspace.id, invoiceDigest: digest }
}

async function prepare(configPath, outDir) {
  const configText = await readFile(resolve(configPath), 'utf8')
  const { packet, text } = buildInvoicePacket(configText)
  const directory = resolve(outDir)
  await mkdir(directory, { recursive: true })
  const jsonPath = join(directory, `${packet.invoice.invoiceId}.json`)
  const textPath = join(directory, `${packet.invoice.invoiceId}.txt`)
  // wx: refuse to overwrite an existing packet. Reissuing requires a new invoice id
  // or the founder explicitly removing the stale draft.
  await writeFile(jsonPath, `${JSON.stringify(packet, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  await writeFile(textPath, text, { encoding: 'utf8', flag: 'wx' })
  return { packet, jsonPath, textPath }
}

function expectFailure(fn, expectedCode, label) {
  try {
    fn()
  } catch (error) {
    if (String(error.message) !== expectedCode) throw new Error(`self_test_${label}_wrong_error_${error.message}`)
    return
  }
  throw new Error(`self_test_${label}_did_not_fail`)
}

function sampleConfig() {
  // Self-test fixture only. These numbers are arbitrary test values, not prices:
  // real amounts exist only in founder-supplied configs.
  return {
    contract: INVOICE_CONFIG_CONTRACT,
    invoiceId: 'INV-SELFTEST-0001',
    workspace: { id: 'selftest-workspace', name: 'Self Test Workspace' },
    customer: { name: 'Self Test Customer', contact: 'owner@example.test' },
    period: { label: '2026-07', start: '2026-07-01', end: '2026-07-31' },
    amount: { currency: 'MMK', exponent: 0, totalMinor: 125000 },
    lineItems: [
      { description: 'Managed workspace service period', amountMinor: 120000 },
      { description: 'Support window', amountMinor: 5000 },
    ],
    tax: { decided: false },
    paymentChannels: [
      { category: 'bank_transfer', label: 'Test Bank', reference: 'ACCT-000-TEST' },
      { category: 'mobile_money', label: 'Test Wallet', reference: '09-0000-TEST' },
    ],
    issuedAt: '2026-08-01T03:30:00.000Z',
    dueDate: '2026-08-15',
    issuer: { name: 'Super Mega Inc' },
  }
}

async function selfTest() {
  const configText = `${JSON.stringify(sampleConfig(), null, 2)}\n`

  // Determinism: identical config bytes produce byte-identical packets and digests.
  const first = buildInvoicePacket(configText)
  const second = buildInvoicePacket(configText)
  if (JSON.stringify(first.packet) !== JSON.stringify(second.packet)) throw new Error('self_test_packet_not_deterministic')
  if (first.text !== second.text) throw new Error('self_test_text_not_deterministic')
  if (!/^sha256:[0-9a-f]{64}$/.test(first.packet.invoiceDigest)) throw new Error('self_test_digest_shape_invalid')

  // Verify round-trip on the serialized packet.
  const verified = verifyInvoicePacket(`${JSON.stringify(first.packet, null, 2)}\n`)
  if (verified.invoiceDigest !== first.packet.invoiceDigest) throw new Error('self_test_verify_mismatch')

  // Tampered amount must fail digest verification.
  const tampered = JSON.parse(JSON.stringify(first.packet))
  tampered.invoice.amount.totalMinor = 999999
  tampered.invoice.lineItems[0].amountMinor = 994999
  expectFailure(() => verifyInvoicePacket(JSON.stringify(tampered)), 'packet_digest_mismatch', 'tampered_amount')

  // Fail-closed validation: no defaults, no fabricated money.
  const withoutAmount = sampleConfig(); delete withoutAmount.amount
  expectFailure(() => validateInvoiceConfig(withoutAmount), 'config_amount_missing', 'missing_amount')
  const noTotal = sampleConfig(); delete noTotal.amount.totalMinor
  expectFailure(() => validateInvoiceConfig(noTotal), 'config_amount_totalMinor_missing', 'missing_total')
  const zeroTotal = sampleConfig()
  zeroTotal.amount.totalMinor = 0
  zeroTotal.lineItems = [{ description: 'Zero', amountMinor: 0 }]
  expectFailure(() => validateInvoiceConfig(zeroTotal), 'config_total_minor_invalid', 'zero_total')
  const mismatch = sampleConfig(); mismatch.amount.totalMinor = 125001
  expectFailure(() => validateInvoiceConfig(mismatch), 'config_total_mismatch', 'total_mismatch')
  const floatAmount = sampleConfig(); floatAmount.lineItems[0].amountMinor = 120000.5
  expectFailure(() => validateInvoiceConfig(floatAmount), 'config_line_item_0_amount_invalid', 'float_amount')
  const stringAmount = sampleConfig(); stringAmount.amount.totalMinor = '125000'
  expectFailure(() => validateInvoiceConfig(stringAmount), 'config_total_minor_invalid', 'string_amount')
  const badCurrency = sampleConfig(); badCurrency.amount.currency = 'mmk'
  expectFailure(() => validateInvoiceConfig(badCurrency), 'config_currency_invalid', 'bad_currency')
  const badChannel = sampleConfig(); badChannel.paymentChannels[0].category = 'card_gateway'
  expectFailure(() => validateInvoiceConfig(badChannel), 'config_payment_channel_0_category_invalid', 'bad_channel')
  const noChannels = sampleConfig(); noChannels.paymentChannels = []
  expectFailure(() => validateInvoiceConfig(noChannels), 'config_payment_channels_invalid', 'no_channels')
  const implicitTax = sampleConfig(); implicitTax.tax = { decided: true }
  expectFailure(() => validateInvoiceConfig(implicitTax), 'config_tax_description_required', 'implicit_tax')
  const unknownKey = sampleConfig(); unknownKey.autoCharge = true
  expectFailure(() => validateInvoiceConfig(unknownKey), 'config_unknown_key_autoCharge', 'unknown_key')
  const badWorkspace = sampleConfig(); badWorkspace.workspace.id = ' bad id '
  expectFailure(() => validateInvoiceConfig(badWorkspace), 'config_workspace_id_invalid', 'bad_workspace_id')
  const dueBeforeIssue = sampleConfig(); dueBeforeIssue.dueDate = '2026-07-31'
  expectFailure(() => validateInvoiceConfig(dueBeforeIssue), 'config_due_date_before_issue', 'due_before_issue')

  // Filesystem behaviour: wx-writes never overwrite an existing packet.
  const scratch = await mkdtemp(join(tmpdir(), 'managed-invoice-selftest-'))
  try {
    const configPath = join(scratch, 'config.json')
    await writeFile(configPath, configText, { encoding: 'utf8', flag: 'wx' })
    const outDir = join(scratch, 'out')
    const written = await prepare(configPath, outDir)
    const reread = await readFile(written.jsonPath, 'utf8')
    if (reread !== `${JSON.stringify(first.packet, null, 2)}\n`) throw new Error('self_test_written_packet_differs')
    verifyInvoicePacket(reread)
    let overwriteError = null
    try { await prepare(configPath, outDir) } catch (error) { overwriteError = error }
    if (overwriteError?.code !== 'EEXIST') throw new Error('self_test_wx_overwrite_not_refused')
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }

  return {
    ok: true,
    contract: INVOICE_PACKET_CONTRACT,
    checks: 20,
    deterministic: true,
    networkActivity: 'none',
    monetaryDefaults: 'none',
  }
}

function argValue(args, flag) {
  const index = args.indexOf(flag)
  if (index === -1 || !args[index + 1]) fail(`argument_${flag.replace(/^--/, '')}_required`)
  return args[index + 1]
}

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === '--self-test' && args.length === 1) {
    console.log(JSON.stringify(await selfTest()))
    return
  }
  if (args[0] === '--verify' && args.length === 2) {
    const result = verifyInvoicePacket(await readFile(resolve(args[1]), 'utf8'))
    console.log(JSON.stringify({ ok: true, ...result }))
    return
  }
  if (args.includes('--config') && args.includes('--out') && args.length === 4) {
    const { packet, jsonPath, textPath } = await prepare(argValue(args, '--config'), argValue(args, '--out'))
    console.log(JSON.stringify({
      ok: true,
      invoiceId: packet.invoice.invoiceId,
      status: packet.status,
      invoiceDigest: packet.invoiceDigest,
      packet: basename(jsonPath),
      printable: basename(textPath),
      founderActionRequired: true,
    }))
    return
  }
  fail('usage: prepare_managed_invoice --config <config.json> --out <dir> | --verify <packet.json> | --self-test')
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: String(error?.message || 'managed_invoice_failed').slice(0, 240), externalWritesPerformed: false }))
    process.exitCode = 1
  })
}
