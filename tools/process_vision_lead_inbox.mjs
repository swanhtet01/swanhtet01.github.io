import { createHash } from 'node:crypto'
import { mkdir, open, readFile, readdir } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { qualifyVisionPilot, renderVisionPilotProposal, visionInputFromContactEvent } from './create_vision_pilot_proposal.mjs'

const MAX_EVENTS_PER_RUN = 100
const MAX_EVENT_BYTES = 256 * 1024

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function writeNew(path, content) {
  const handle = await open(path, 'wx')
  try {
    await handle.writeFile(content, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
}

function safeLeadId(event) {
  const value = String(event?.record?.lead_id || '')
  if (!/^LEAD-[A-F0-9]{16}$/.test(value)) throw new Error('canonical_lead_id_required')
  return value
}

async function recordRejection(rejectionsDirectory, sourceFile, inputSha256, reason) {
  const source = basename(sourceFile, '.json').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 60) || 'event'
  const target = join(rejectionsDirectory, `${source}-${inputSha256.slice(0, 12)}.json`)
  const receipt = {
    contract: 'supermega.vision.lead_rejection.v1',
    source_file: basename(sourceFile),
    input_sha256: inputSha256,
    reason: String(reason).slice(0, 120),
    effects: { external_requests: 0, messages_sent: 0, payments_accepted: 0, input_files_modified: 0 },
  }
  try { await writeNew(target, `${JSON.stringify(receipt, null, 2)}\n`) } catch (error) {
    if (error?.code !== 'EEXIST') throw error
  }
}

export async function processVisionLeadInbox({ inbox, outbox }) {
  const inboxDirectory = resolve(inbox)
  const outboxDirectory = resolve(outbox)
  const proposalsDirectory = join(outboxDirectory, 'proposals')
  const receiptsDirectory = join(outboxDirectory, 'receipts')
  const rejectionsDirectory = join(outboxDirectory, 'rejections')
  await Promise.all([mkdir(proposalsDirectory, { recursive: true }), mkdir(receiptsDirectory, { recursive: true }), mkdir(rejectionsDirectory, { recursive: true })])

  const entries = (await readdir(inboxDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, MAX_EVENTS_PER_RUN)

  const result = {
    contract: 'supermega.vision.lead_inbox_run.v1',
    processed: 0,
    replayed: 0,
    rejected: 0,
    ignored: 0,
    effects: { external_requests: 0, messages_sent: 0, payments_accepted: 0, input_files_modified: 0 },
  }

  for (const entry of entries) {
    const inputPath = join(inboxDirectory, entry.name)
    let source
    try {
      source = await readFile(inputPath)
      if (source.byteLength > MAX_EVENT_BYTES) throw new Error('event_too_large')
    } catch (error) {
      const inputSha256 = digest(entry.name)
      await recordRejection(rejectionsDirectory, entry.name, inputSha256, error.message)
      result.rejected += 1
      continue
    }

    const inputSha256 = digest(source)
    let event
    try {
      event = JSON.parse(source.toString('utf8'))
      if (event?.event !== 'supermega.contact.created' || event?.record?.workflow !== 'vision') {
        result.ignored += 1
        continue
      }
      const leadId = safeLeadId(event)
      const receiptPath = join(receiptsDirectory, `${leadId}.json`)
      const proposalPath = join(proposalsDirectory, `${leadId}.proposal.md`)

      try {
        const existing = JSON.parse(await readFile(receiptPath, 'utf8'))
        if (existing.input_sha256 === inputSha256 && existing.lead_id === leadId) {
          result.replayed += 1
          continue
        }
        throw new Error('lead_id_content_conflict')
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }

      const proposalInput = visionInputFromContactEvent(event)
      const qualification = qualifyVisionPilot(proposalInput)
      const proposal = renderVisionPilotProposal(proposalInput)
      const proposalSha256 = digest(proposal)
      await writeNew(proposalPath, proposal)
      const receipt = {
        contract: 'supermega.vision.lead_proposal_receipt.v1',
        lead_id: leadId,
        source_file: entry.name,
        input_sha256: inputSha256,
        proposal_sha256: proposalSha256,
        qualified: qualification.qualified,
        blockers: qualification.blockers,
        price_usd: qualification.priceUsd,
        proposal_file: basename(proposalPath),
        effects: result.effects,
      }
      await writeNew(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
      result.processed += 1
    } catch (error) {
      await recordRejection(rejectionsDirectory, entry.name, inputSha256, error.message)
      result.rejected += 1
    }
  }

  return result
}

async function main() {
  const args = process.argv.slice(2)
  const inboxIndex = args.indexOf('--inbox')
  const outboxIndex = args.indexOf('--outbox')
  if (inboxIndex < 0 || !args[inboxIndex + 1] || outboxIndex < 0 || !args[outboxIndex + 1]) {
    throw new Error('usage: node tools/process_vision_lead_inbox.mjs --inbox contact-events --outbox vision-sales')
  }
  process.stdout.write(`${JSON.stringify(await processVisionLeadInbox({ inbox: args[inboxIndex + 1], outbox: args[outboxIndex + 1] }))}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`)
    process.exitCode = 1
  })
}
