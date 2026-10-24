import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { verifySecurityIncidentResponse } from './verify_security_incident_response.mjs'

const source = JSON.parse(readFileSync(new URL('../hq/security/incident-response.json', import.meta.url), 'utf8'))
const copy = () => structuredClone(source)

test('current incident response is prepared but not falsely rehearsed or certified', () => {
  assert.deepEqual(verifySecurityIncidentResponse(copy()), { ok: true, contract: 'supermega.security-incident-response.v1', scenarioCount: 6, tabletopStatus: 'not_run', externalEffectsPerformed: false })
})

test('missing roles, scenarios and response phases fail closed', () => {
  for (const [mutate, code] of [
    [(value) => value.roles.pop(), 'incident_roles_invalid'],
    [(value) => value.scenarios.pop(), 'incident_scenarios_invalid'],
    [(value) => { value.scenarios[0].evidence = [] }, 'incident_scenario_evidence_invalid:credential_compromise'],
    [(value) => { value.scenarios[0].severity = 'SEV9' }, 'incident_scenario_missing:credential_compromise'],
    [(value) => { value.scenarios[0].controlIds.pop() }, 'incident_scenario_controls_invalid:credential_compromise'],
    [(value) => { value.scenarios[1].severity = 'SEV2' }, 'incident_scenario_severity_drift:tenant_leakage'],
    [(value) => { value.tabletop.evidenceRequired = [] }, 'incident_tabletop_evidence_drift'],
  ]) { const value = copy(); mutate(value); assert.throws(() => verifySecurityIncidentResponse(value), new RegExp(code)) }
})

test('certification, rehearsal, external-effect and invented recovery claims fail closed', () => {
  for (const [mutate, code] of [
    [(value) => { value.claims.isoCertified = true }, 'incident_claims_unsafe'],
    [(value) => { value.claims.tabletopCompleted = true }, 'incident_claims_unsafe'],
    [(value) => { value.tabletop.status = 'pass' }, 'incident_tabletop_untruthful'],
    [(value) => { value.tabletop.externalEffectsAllowed = ['production_write'] }, 'incident_tabletop_untruthful'],
    [(value) => { value.systems[0].rtoMinutes = 60 }, 'incident_target_unapproved:shop_native'],
    [(value) => { value.severity[0].ownerNotificationMinutes = 15 }, 'incident_severity_target_unapproved:SEV0'],
    [(value) => { value.roles[0].inheritedProductionAuthority = true }, 'incident_role_authority_unsafe:incident_commander'],
  ]) { const value = copy(); mutate(value); assert.throws(() => verifySecurityIncidentResponse(value), new RegExp(code)) }
})

test('unknown scope, duplicate identifiers and unsafe role shapes fail closed', () => {
  for (const [mutate, code] of [
    [(value) => { value.unreviewed = true }, 'incident_top_level_shape_invalid'],
    [(value) => { value.claims.isoCompliant = true }, 'incident_claims_unsafe'],
    [(value) => { value.claims.extraClaim = false }, 'incident_claims_shape_invalid'],
    [(value) => { value.roles[1].id = value.roles[0].id }, 'incident_roles_invalid'],
    [(value) => { value.roles[0].assignment = '' }, 'incident_role_assignment_invalid:incident_commander'],
    [(value) => { value.systems[0].id = 'arbitrary' }, 'incident_systems_invalid'],
    [(value) => { value.severity.push(structuredClone(value.severity[0])) }, 'incident_severities_invalid'],
    [(value) => { value.lastReviewedDate = '24-10-2026' }, 'incident_review_date_invalid'],
    [(value) => { value.lastReviewedDate = '2026-02-30' }, 'incident_review_date_invalid'],
  ]) { const value = copy(); mutate(value); assert.throws(() => verifySecurityIncidentResponse(value), new RegExp(code)) }
})

test('credential-shaped fields and values are rejected without banning ordinary prose', () => {
  assert.equal(verifySecurityIncidentResponse(copy()).ok, true)
  for (const [mutate, code] of [
    [(value) => { value.scenarios[0].credential = 'value' }, 'incident_scenario_shape_invalid:credential_compromise'],
    [(value) => { value.roles[0].authority = 'Bearer abcdefghijklmnopqrstuvwxyz' }, 'incident_credential_value'],
    [(value) => { value.roles[0].authority = 'postgres' + 'ql://user:value@example.invalid/db' }, 'incident_credential_value'],
    [(value) => { value.roles[0].authority = '-----BEGIN PRIVATE KEY-----' }, 'incident_credential_value'],
  ]) { const value = copy(); mutate(value); assert.throws(() => verifySecurityIncidentResponse(value), new RegExp(code)) }
})

test('reviewed human instructions, role authority and recovery evidence are digest bound', () => {
  for (const mutate of [
    (value) => { value.scenarios[2].forbidden = ['claim refund', 'delete audit'] },
    (value) => { value.roles[1].authority = 'unreviewed broad authority' },
    (value) => { value.systems[0].recoveryEvidence = 'ready' },
  ]) {
    const value = copy()
    mutate(value)
    assert.throws(() => verifySecurityIncidentResponse(value), /incident_reviewed_content_drift/)
  }
})
