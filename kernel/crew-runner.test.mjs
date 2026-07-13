// Crew loader + convention validation — both shipped crews load, the schema rules hold, and the
// legal bright line is structural (not a comment). `node --test`. No network, no store.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCrew, listCrews, validateCrew, BRIGHT_LINE_FLAGS } from './crew-runner.mjs'
import { TIERS } from './gateway.mjs'

test('listCrews enumerates every shipped crew', async () => {
  const slugs = (await listCrews()).map((c) => c.slug)
  assert.equal(slugs.length, 12)
  assert.ok(slugs.includes('reconcile-premium'), 'reconcile-premium is registered')
  assert.ok(slugs.includes('read-my-chaos'), 'read-my-chaos is registered')
  assert.ok(slugs.includes('source-to-screen-pilot'), 'source-to-screen-pilot is registered')
  for (const slug of ['data-insights-desk', 'customer-support-desk', 'knowledge-base-desk', 'project-control-desk']) {
    assert.ok(slugs.includes(slug), `${slug} is registered`)
  }
})

test('general-use workforce crews are bounded, sellable, and contract-complete', async () => {
  const expected = {
    'data-insights-desk': ['data_quality', 'metrics', 'decision_story', 'blocked_claims'],
    'customer-support-desk': ['resolution_path', 'reply_draft', 'escalations', 'blocked_actions'],
    'knowledge-base-desk': ['canonical_answers', 'procedures', 'update_queue', 'publication_boundary'],
    'project-control-desk': ['critical_path', 'risks', 'owner_actions', 'update_draft'],
  }
  for (const [slug, fields] of Object.entries(expected)) {
    const crew = await loadCrew(slug)
    assert.equal(validateCrew(crew, { slug }).length, 0, `${slug} validates clean`)
    assert.equal(crew.roles.length, 3, `${slug} stays within one three-role specialist budget`)
    assert.equal(crew.roles[0].id, 'intake')
    assert.equal(crew.requires_account_access, undefined)
    for (const field of fields) assert.ok(crew.output_contract.fields.includes(field), `${slug} returns ${field}`)
  }
})

test('shipped crews follow the convention: INTAKE first, real tier per role, output contract', async () => {
  for (const slug of ['reconcile-premium', 'read-my-chaos', 'source-to-screen-pilot']) {
    const crew = await loadCrew(slug)
    assert.equal(validateCrew(crew, { slug }).length, 0, `${slug} validates clean`)
    assert.equal(crew.roles[0].id, 'intake', `${slug} starts with the generic INTAKE role`)
    for (const role of crew.roles) assert.ok(TIERS[role.tier], `${slug}/${role.id}: '${role.tier}' is a real gateway tier`)
    assert.ok(crew.output_contract.fields.length > 0, `${slug} has a non-empty output contract`)
  }
})

test('source-to-screen-pilot is the paid upgrade path from free browser drafts', async () => {
  const crew = await loadCrew('source-to-screen-pilot')
  assert.equal(crew.plan, 'pilot')
  assert.match(crew.free_tier_fallback, /browser-only/i, 'free users keep the browser-only proof draft')
  assert.ok(crew.intake.accepts.includes('source-to-screen order packet'), 'accepts the saved free order packet')
  assert.ok(crew.roles.some((r) => r.id === 'proof-builder' && r.tier === 'reason'), 'paid pilot has a proof-builder role')
  for (const field of ['source_trace', 'first_proof', 'approval_queue', 'blocked_actions', 'paid_pilot_scope']) {
    assert.ok(crew.output_contract.fields.includes(field), `${field} is in the output contract`)
  }
})

test('reconcile-premium is the Pro differentiator with a free-tier fallback', async () => {
  const crew = await loadCrew('reconcile-premium')
  assert.equal(crew.plan, 'pro')
  assert.match(crew.free_tier_fallback, /end-of-day/, 'free tier keeps the end-of-day close')
  assert.ok(crew.roles.some((r) => r.id === 'shortfall-sentinel'), 'live intra-day shortfall role exists')
  assert.ok(crew.output_contract.fields.includes('flags_by_staff_shift'), 'flags are broken down by staff/shift')
})

test('read-my-chaos embeds the legal bright line, all flags true', async () => {
  const crew = await loadCrew('read-my-chaos')
  assert.equal(crew.requires_account_access, true)
  for (const flag of BRIGHT_LINE_FLAGS) assert.equal(crew.policy[flag], true, `policy.${flag} is true`)
})

test('validateCrew rejects rule-breakers', () => {
  const good = {
    slug: 'x-crew', name: 'X', description: 'd', version: 1,
    intake: { accepts: ['a'], description: 'd' },
    roles: [{ id: 'intake', title: 'Intake', tier: 'bulk', goal: 'g' }],
    output_contract: { format: 'json', fields: ['f'] },
  }
  assert.equal(validateCrew(good).length, 0, 'the fixture itself is valid')
  assert.ok(validateCrew({ ...good, roles: [{ id: 'solo', title: 'S', tier: 'bulk', goal: 'g' }] }).some((e) => /INTAKE/.test(e)), 'missing intake role rejected')
  assert.ok(validateCrew({ ...good, roles: [{ id: 'intake', title: 'I', tier: 'mega', goal: 'g' }] }).some((e) => /tier/.test(e)), 'unknown tier rejected')
  assert.ok(validateCrew({ ...good, output_contract: { format: 'json', fields: [] } }).some((e) => /fields/.test(e)), 'empty output contract rejected')
  const noBrightLine = validateCrew({ ...good, requires_account_access: true })
  for (const flag of BRIGHT_LINE_FLAGS) assert.ok(noBrightLine.some((e) => e.includes(flag)), `account access without policy.${flag} rejected`)
  assert.ok(validateCrew(good, { slug: 'other-name' }).some((e) => /filename/.test(e)), 'slug/filename mismatch rejected')
})

test('loadCrew is strict: bad slugs never touch the filesystem', async () => {
  await assert.rejects(() => loadCrew('../store'), /crew_bad_slug/)
  await assert.rejects(() => loadCrew('No_Caps'), /crew_bad_slug/)
})
