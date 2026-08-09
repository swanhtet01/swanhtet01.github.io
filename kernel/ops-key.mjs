// The single owner passcode behind every kernel surface.
//
// SUPERMEGA_OPS_KEY is typed by a human into one "Owner key" field and gates the console,
// crew, approvals, operator, integrations, owner-evidence and workcell endpoints. Nothing in
// the code can tell a strong passcode from a weak one, so the only available control is to
// refuse to run below a floor — the same control tools/create_public_vercel_output.mjs
// already applies to the contact secret.
//
// The floor lived in kernel/console/api.mjs alone, which was worse than useless: it closed
// the console while every higher-privilege endpoint kept accepting the same weak key, and it
// invented a distinct 'ops_key_too_weak' reason the others did not have — announcing to an
// unauthenticated caller that the key is short, which is exactly the fact that makes guessing
// worth attempting.
//
// A key below the floor is therefore reported as ABSENT. Every caller already refuses a
// missing key with 503 ops_key_not_configured, so routing through here gives one consistent
// behaviour with no new failure mode and no disclosure. The reason reaches the server log,
// where the owner can read it and an attacker cannot.
export const OPS_KEY_MINIMUM_LENGTH = 32

let warnedLength = 0

export function usableOpsKey(raw) {
  const key = String(raw ?? '').trim()
  if (!key) return ''
  if (key.length < OPS_KEY_MINIMUM_LENGTH) {
    // Once per distinct length per process: enough for the owner to notice and fix, not
    // enough to flood the log if something retries.
    if (warnedLength !== key.length) {
      warnedLength = key.length
      console.error(`SUPERMEGA_OPS_KEY is ${key.length} characters; at least ${OPS_KEY_MINIMUM_LENGTH} are required. Every owner surface is refusing requests until it is longer.`)
    }
    return ''
  }
  return key
}

export default { OPS_KEY_MINIMUM_LENGTH, usableOpsKey }
