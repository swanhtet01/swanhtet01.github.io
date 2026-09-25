import { createHash } from 'node:crypto'

const hash = value => createHash('sha256').update(value).digest('hex')
const failure = (reason, status = 409) => ({ ok: false, reason, status })

// A claim survives uncertain dispatch and is never released automatically. An accepted
// receipt can repair deal status on retry without contacting the provider again.
export async function sendOutreachOnce({ dealId, message, store, send }) {
  if (!dealId || !message?.to || !message.subject) return failure('invalid_outreach_request', 400)
  const id = 'outreach-send:' + hash(String(dealId))
  const fingerprint = hash(JSON.stringify([message.to, message.subject, message.html || '', message.text || '']))
  const pending = 'dispatch:' + fingerprint
  const acceptedPrefix = 'accepted:' + fingerprint + ':'
  const kind = 'outreach_send_claim'
  let claim
  try { claim = await store.claimActivity({ id, kind, summary: 'Outreach dispatch reservation', ref: pending }) }
  catch { return failure('outreach_claim_unavailable', 503) }
  if (!claim?.durable) return failure('outreach_claim_unavailable', 503)
  let retained
  try { retained = await store.getActivityClaim(id) }
  catch { return failure('outreach_claim_unavailable', 503) }
  if (!retained?.durable || retained.claim?.id !== id || retained.claim?.kind !== kind) return failure('outreach_claim_unavailable', 503)
  const ref = retained.claim.ref || ''
  let emailId
  if (!claim.fresh) {
    if (ref.startsWith(acceptedPrefix)) emailId = ref.slice(acceptedPrefix.length)
    else return failure(ref === pending ? 'outreach_send_unconfirmed' : 'outreach_payload_conflict')
  } else {
    if (ref !== pending) return failure('outreach_payload_conflict')
    let receipt
    try { receipt = await send(message) }
    catch { return failure('outreach_send_unconfirmed') }
    if (!receipt?.ok || !/^[A-Za-z0-9_-]{1,80}$/.test(receipt.id || '')) return failure('outreach_send_unconfirmed')
    emailId = receipt.id
    let transition
    try { transition = await store.transitionActivityClaim(id, pending, acceptedPrefix + emailId) }
    catch { return failure('outreach_receipt_unconfirmed') }
    if (!transition?.durable || !transition.updated) return failure('outreach_receipt_unconfirmed')
  }
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(emailId || '')) return failure('outreach_receipt_unconfirmed')
  let updated
  try { updated = await store.updateDeal(dealId, { status: 'sent' }) }
  catch { return failure('outreach_sent_status_unconfirmed') }
  if (updated?.id !== dealId || updated?.status !== 'sent') return failure('outreach_sent_status_unconfirmed')
  return { ok: true, email_id: emailId, to: message.to, deal: updated, replayed: !claim.fresh }
}


// Read-only projection: never expose recipient, body, fingerprint or provider receipt.
export async function readOutreachState(dealId, store) {
  if (!dealId) return 'unavailable'
  const id = 'outreach-send:' + hash(String(dealId))
  let retained
  try { retained = await store.getActivityClaim(id) } catch { return 'unavailable' }
  if (!retained?.durable) return 'unavailable'
  if (!retained.claim) return 'none'
  if (retained.claim.id !== id || retained.claim.kind !== 'outreach_send_claim') return 'unavailable'
  if (/^dispatch:[a-f0-9]{64}$/.test(retained.claim.ref || '')) return 'unconfirmed'
  if (/^accepted:[a-f0-9]{64}:[A-Za-z0-9_-]{1,80}$/.test(retained.claim.ref || '')) return 'accepted'
  return 'unavailable'
}
