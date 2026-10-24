import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

const REQUIRED_SCENARIOS = ['credential_compromise', 'tenant_leakage', 'fraudulent_correction', 'lost_device', 'failed_restore', 'signing_key_compromise']
const REQUIRED_ROLES = ['evidence_custodian', 'incident_commander', 'operations_lead', 'technical_lead']
const REQUIRED_SYSTEMS = ['billing_evidence', 'internal_console', 'merchant_portal', 'shop_native']
const REQUIRED_SEVERITIES = ['SEV0', 'SEV1', 'SEV2']
const REQUIRED_TABLETOP_EVIDENCE = ['named_participants', 'start_and_end_time', 'decisions', 'observed_gaps', 'corrective_actions_with_owner_and_due_date']
const EXPECTED_SCENARIO_SEVERITY = { credential_compromise: 'SEV1', tenant_leakage: 'SEV0', fraudulent_correction: 'SEV1', lost_device: 'SEV1', failed_restore: 'SEV1', signing_key_compromise: 'SEV0' }
const REVIEWED_CONTENT_DIGEST = 'b368a4354fc70163d514ff24eb3e449e906548ddee22e5c8a4e1445c981025dd'
const REQUIRED_CONTROLS = {
  credential_compromise: ['revoke_exact_identity', 'preserve_unaffected_state', 'block_privileged_actions', 'review_exposure_window', 'no_chat_credentials', 'no_unscoped_rotation'],
  tenant_leakage: ['disable_affected_route_or_membership', 'preserve_access_evidence', 'two_tenant_denial', 'revocation_proof', 'independent_reopen_review', 'no_exposed_data_copy'],
  fraudulent_correction: ['disable_correction_issuance', 'preserve_original_sale', 'freeze_authorization_target', 'reconcile_stock_shift_wallet', 'no_wallet_refund_claim', 'no_local_replacement_proof'],
  lost_device: ['revoke_hosted_sessions', 'record_last_backup', 'signed_replacement_only', 'verified_restore', 'no_remote_wipe_claim', 'no_passphrase_collection'],
  failed_restore: ['preserve_archive', 'preserve_source_database', 'no_replace_current_database', 'record_verifier_code', 'synthetic_reproduction', 'no_integrity_weakening'],
  signing_key_compromise: ['stop_distribution', 'preserve_signature_evidence', 'platform_owner_notification', 'reviewed_key_rotation', 'no_unsigned_emergency_build', 'no_key_reuse'],
}
function fail(code) { throw new Error(code) }
function exactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code)
}
function exactUniqueIds(values, expected, code) {
  if (!Array.isArray(values)) fail(code)
  const ids = values.map((value) => value?.id)
  if (new Set(ids).size !== ids.length || JSON.stringify([...ids].sort()) !== JSON.stringify([...expected].sort())) fail(code)
}
function nonempty(value, code) {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) fail(code)
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  return value
}
function rejectCredentialShapes(value, path = 'root') {
  if (Array.isArray(value)) return value.forEach((entry, index) => rejectCredentialShapes(entry, `${path}[${index}]`))
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (/^(?:password|secret|secret[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|service[_-]?role|dsn|credential)$/i.test(key)) fail(`incident_credential_field:${path}.${key}`)
      rejectCredentialShapes(entry, `${path}.${key}`)
    }
    return
  }
  if (typeof value === 'string' && (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value) || /\bbearer\s+[A-Za-z0-9._~+/-]{12,}/i.test(value) || /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s]+@/i.test(value) || /\b(?:sb_secret_|ghp_|github_pat_|sk-[A-Za-z0-9]{16,}|vercel_[A-Za-z0-9]{16,})/i.test(value))) fail(`incident_credential_value:${path}`)
}

export function verifySecurityIncidentResponse(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('incident_contract_invalid')
  exactKeys(value, ['claims', 'contract', 'lastReviewedDate', 'roles', 'scenarios', 'severity', 'status', 'systems', 'tabletop'], 'incident_top_level_shape_invalid')
  if (value.contract !== 'supermega.security-incident-response.v1') fail('incident_contract_wrong')
  if (value.status !== 'prepared_not_rehearsed') fail('incident_status_untruthful')
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.lastReviewedDate)
  if (!dateMatch) fail('incident_review_date_invalid')
  const reviewedDate = new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])))
  if (reviewedDate.toISOString().slice(0, 10) !== value.lastReviewedDate) fail('incident_review_date_invalid')
  exactKeys(value.claims, ['controlEffectivenessVerified', 'externalMessagesAuthorized', 'isoCertified', 'isoCompliant', 'liveActionsAuthorized', 'productionChangesAuthorized', 'rtoRpoApproved', 'staffRolloutAuthorized', 'tabletopCompleted'], 'incident_claims_shape_invalid')
  if (Object.values(value.claims).some((claim) => claim !== false)) fail('incident_claims_unsafe')
  exactUniqueIds(value.roles, REQUIRED_ROLES, 'incident_roles_invalid')
  for (const role of value.roles) {
    exactKeys(role, ['assignment', 'authority', 'communicationsAuthorized', 'id', 'inheritedProductionAuthority'], `incident_role_shape_invalid:${role.id}`)
    nonempty(role.assignment, `incident_role_assignment_invalid:${role.id}`)
    nonempty(role.authority, `incident_role_authority_invalid:${role.id}`)
    if (role.inheritedProductionAuthority !== false || role.communicationsAuthorized !== false) fail(`incident_role_authority_unsafe:${role.id}`)
  }
  exactUniqueIds(value.severity, REQUIRED_SEVERITIES, 'incident_severities_invalid')
  const severities = new Map((value.severity ?? []).map((entry) => [entry?.id, entry]))
  for (const id of REQUIRED_SEVERITIES) {
    const entry = severities.get(id)
    exactKeys(entry, ['definition', 'id', 'notificationTargetStatus', 'ownerNotificationMinutes'], `incident_severity_shape_invalid:${id}`)
    nonempty(entry.definition, `incident_severity_definition_invalid:${id}`)
    if (entry.ownerNotificationMinutes !== null || entry.notificationTargetStatus !== 'owner_decision_required') fail(`incident_severity_target_unapproved:${id}`)
  }
  const systems = value.systems ?? []
  exactUniqueIds(systems, REQUIRED_SYSTEMS, 'incident_systems_invalid')
  for (const system of systems) {
    exactKeys(system, ['id', 'recoveryEvidence', 'rpoMinutes', 'rtoMinutes', 'targetStatus'], `incident_system_shape_invalid:${system.id}`)
    nonempty(system.recoveryEvidence, `incident_system_evidence_invalid:${system.id}`)
    if (system.rtoMinutes !== null || system.rpoMinutes !== null) fail(`incident_target_unapproved:${system.id}`)
    const expectedStatus = system.id === 'internal_console' ? 'staff_rollout_blocked' : 'owner_decision_required'
    if (system.targetStatus !== expectedStatus) fail(`incident_target_status_invalid:${system.id}`)
  }
  exactUniqueIds(value.scenarios, REQUIRED_SCENARIOS, 'incident_scenarios_invalid')
  const scenarios = new Map((value.scenarios ?? []).map((scenario) => [scenario?.id, scenario]))
  for (const id of REQUIRED_SCENARIOS) {
    const scenario = scenarios.get(id)
    if (!scenario || !severities.has(scenario.severity)) fail(`incident_scenario_missing:${id}`)
    if (scenario.severity !== EXPECTED_SCENARIO_SEVERITY[id]) fail(`incident_scenario_severity_drift:${id}`)
    exactKeys(scenario, ['contain', 'controlIds', 'detect', 'evidence', 'forbidden', 'id', 'recover', 'severity'], `incident_scenario_shape_invalid:${id}`)
    if (JSON.stringify(scenario.controlIds) !== JSON.stringify(REQUIRED_CONTROLS[id])) fail(`incident_scenario_controls_invalid:${id}`)
    for (const field of ['detect', 'contain', 'evidence', 'recover', 'forbidden']) {
      const content = scenario[field]
      const invalid = field === 'detect' ? typeof content !== 'string' || !content.trim() : !Array.isArray(content) || content.length < 2 || content.some((entry) => typeof entry !== 'string' || !entry.trim())
      if (invalid) fail(`incident_scenario_${field}_invalid:${id}`)
    }
  }
  exactKeys(value.tabletop, ['evidenceRequired', 'externalEffectsAllowed', 'requiredScenarioIds', 'status'], 'incident_tabletop_shape_invalid')
  if (value.tabletop?.status !== 'not_run' || value.tabletop?.externalEffectsAllowed?.length !== 0) fail('incident_tabletop_untruthful')
  if (JSON.stringify(value.tabletop.requiredScenarioIds) !== JSON.stringify(REQUIRED_SCENARIOS)) fail('incident_tabletop_scenarios_drift')
  if (JSON.stringify(value.tabletop.evidenceRequired) !== JSON.stringify(REQUIRED_TABLETOP_EVIDENCE)) fail('incident_tabletop_evidence_drift')
  rejectCredentialShapes(value)
  const reviewed = { claims: value.claims, roles: value.roles, severity: value.severity, systems: value.systems, scenarios: value.scenarios, tabletop: value.tabletop }
  const digest = createHash('sha256').update(JSON.stringify(canonical(reviewed))).digest('hex')
  if (digest !== REVIEWED_CONTENT_DIGEST) fail('incident_reviewed_content_drift')
  return { ok: true, contract: value.contract, scenarioCount: scenarios.size, tabletopStatus: value.tabletop.status, externalEffectsPerformed: false }
}

function main() {
  const path = process.argv[2] || 'hq/security/incident-response.json'
  process.stdout.write(`${JSON.stringify(verifySecurityIncidentResponse(JSON.parse(readFileSync(path, 'utf8'))), null, 2)}\n`)
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main()
