// One deployment-wide owner gate for every SuperMega email sender.
//
// Email is an external side effect. It stays off unless the owner deliberately
// enables it with two independent environment values. Existing feature-level
// flags are intentionally insufficient on their own.

const UNLOCK_PHRASE = 'UNLOCK_SUPERMEGA_OUTBOUND_EMAIL_001'

function text(value) {
  return String(value == null ? '' : value).trim()
}

function getOutboundEmailPolicy(env = process.env) {
  const requested = text(env.SUPERMEGA_OUTBOUND_EMAILS_ENABLED || env.SUPERMEGA_EMAIL_SENDS_ENABLED) === '1'
  const approved = text(env.SUPERMEGA_OUTBOUND_EMAIL_APPROVAL) === UNLOCK_PHRASE
  if (!requested) return { allowed: false, reason: 'outbound_email_disabled' }
  if (!approved) return { allowed: false, reason: 'outbound_email_locked' }
  return { allowed: true, reason: 'outbound_email_enabled' }
}

module.exports = { getOutboundEmailPolicy }
