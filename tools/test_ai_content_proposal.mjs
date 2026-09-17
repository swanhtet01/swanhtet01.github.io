import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)
const bundle = await build({ stdin: { contents: `export * from './ai-content-proposal.ts'`, resolveDir: 'showroom/src/core', loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error' })
const model = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
const check = (condition, label) => { checks += 1; assert.ok(condition, label) }

const sourceWithoutDigest = {
  product: 'website', workspaceScope: 'yangon-bakery', templateId: 'local-service', sourceRevision: 7,
  field: 'headline', currentText: 'Fresh bread for Yangon.', facts: ['Baked each morning', 'Pickup in Bahan'],
}
const source = { ...sourceWithoutDigest, sourceDigest: await model.aiContentSourceDigest(sourceWithoutDigest) }
const proposal = await model.createAiContentProposal({
  proposalId: 'AIC-1234ABCD', generatedAt: '2026-09-18T08:00:00.000Z', source,
  candidateText: 'Morning-baked bread, ready for pickup in Bahan.',
})

check(proposal.schema === 'supermega.ai_content_proposal.v1', 'schema is exact')
check(proposal.generatedClassification === 'ai_generated_unverified', 'proposal stays visibly unverified')
check(proposal.meaningReviewed === false, 'generation is not meaning review')
check(proposal.publicationAuthorized === false && proposal.businessRecordMutationAuthorized === false, 'generation grants no authority')
const accepted = await model.acceptAiContentProposalForDraft(proposal, source, { reviewedBy: 'Owner', meaningReviewed: true })
check(accepted.draftText === proposal.candidateText && accepted.draftOnly === true, 'accepted text enters only the ordinary draft')
check(accepted.publicationAuthorized === false && accepted.businessRecordMutationAuthorized === false, 'human review still grants no publication or record mutation')

await assert.rejects(model.acceptAiContentProposalForDraft(proposal, source, { reviewedBy: 'Owner', meaningReviewed: false }), /meaning review/)
for (const changed of [
  { ...source, workspaceScope: 'other-shop' },
  { ...source, templateId: 'other-template' },
  { ...source, sourceRevision: 8 },
  { ...source, sourceDigest: `sha256:${'f'.repeat(64)}` },
  { ...source, currentText: 'Changed after generation.' },
  { ...source, facts: ['Different fact'] },
]) await assert.rejects(model.acceptAiContentProposalForDraft(proposal, changed, { reviewedBy: 'Owner', meaningReviewed: true }), /stale|digest/)
checks += 6

for (const [product, field] of [['commerce', 'headline'], ['website', 'item_description'], ['ecommerce', 'service_description']]) {
  const invalid = { ...sourceWithoutDigest, product, field }
  await assert.rejects(model.createAiContentProposal({ proposalId: 'AIC-1234ABCD', generatedAt: '2026-09-18T08:00:00.000Z', source: { ...invalid, sourceDigest: await model.aiContentSourceDigest(invalid) }, candidateText: 'Bounded copy.' }), /not allowed/)
  checks += 1
}
for (const candidateText of ['<b>Injected</b>', ' ', `x${'y'.repeat(600)}`]) {
  await assert.rejects(model.createAiContentProposal({ proposalId: 'AIC-1234ABCD', generatedAt: '2026-09-18T08:00:00.000Z', source, candidateText }), /bounded plain text/)
  checks += 1
}
await assert.rejects(model.createAiContentProposal({ proposalId: 'AIC-1234ABCD', generatedAt: 'not-a-time', source, candidateText: 'Bounded copy.' }), /ISO timestamp/)
checks += 1
await assert.rejects(model.createAiContentProposal({ proposalId: 'AIC-1234ABCD', generatedAt: '2026-09-18T08:00:00.000Z', source: { ...source, surprise: true }, candidateText: 'Bounded copy.' }), /fields are invalid/)
checks += 1
await assert.rejects(model.createAiContentProposal({ proposalId: 'AIC-1234ABCD', generatedAt: '2026-09-18T08:00:00.000Z', source: { ...source, facts: ['Same', 'same'] }, candidateText: 'Bounded copy.' }), /unique/)
checks += 1

const implementation = readFileSync('showroom/src/core/ai-content-proposal.ts', 'utf8')
for (const forbidden of ['fetch(', 'localStorage', 'sessionStorage', 'XMLHttpRequest', 'navigator.sendBeacon']) {
  check(!implementation.includes(forbidden), `contract has no ${forbidden} side effect`)
}
console.log(`AI content proposal contract: ${checks} checks passed`)
