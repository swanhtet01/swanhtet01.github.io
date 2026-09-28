export const AI_CONTENT_PROPOSAL_SCHEMA = 'supermega.ai_content_proposal.v1' as const

export type AiContentProduct = 'commerce' | 'website' | 'ecommerce'
export type AiContentField = 'headline' | 'service_description' | 'item_description' | 'store_summary'

const fieldsByProduct: Record<AiContentProduct, readonly AiContentField[]> = {
  commerce: ['service_description', 'item_description'],
  website: ['headline', 'service_description'],
  ecommerce: ['store_summary', 'item_description'],
}

type ProposalSource = {
  product: AiContentProduct
  workspaceScope: string
  templateId: string
  sourceRevision: number
  sourceDigest: string
  field: AiContentField
  currentText: string
  facts: readonly string[]
}

export type AiContentProposal = ProposalSource & {
  schema: typeof AI_CONTENT_PROPOSAL_SCHEMA
  proposalId: string
  generatedAt: string
  generatedClassification: 'ai_generated_unverified'
  candidateText: string
  meaningReviewed: false
  publicationAuthorized: false
  businessRecordMutationAuthorized: false
}

const digestPattern = /^sha256:[0-9a-f]{64}$/
const idPattern = /^[a-z][a-z0-9-]{1,63}$/
const proposalIdPattern = /^AIC-[A-Z0-9]{8,48}$/

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AI content proposal input must be an object.')
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string) {
  const actual = Object.keys(value).sort()
  const canonical = [...expected].sort()
  if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) {
    throw new Error(`${label} fields are invalid.`)
  }
}

function boundedText(value: unknown, label: string, max: number) {
  const hasUnsafeControl = typeof value === 'string' && Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13)
  })
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1 || value.length > max
    || hasUnsafeControl || /<[^>]*>/.test(value)) {
    throw new Error(`${label} must be bounded plain text.`)
  }
  return value
}

function iso(value: unknown) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || new Date(Date.parse(value)).toISOString() !== value) {
    throw new Error('generatedAt must be an exact ISO timestamp.')
  }
  return value
}

async function sha256(value: string) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure content digest is unavailable.')
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return `sha256:${Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function canonicalSource(input: Omit<ProposalSource, 'sourceDigest'>) {
  return JSON.stringify({
    product: input.product,
    workspaceScope: input.workspaceScope,
    templateId: input.templateId,
    sourceRevision: input.sourceRevision,
    field: input.field,
    currentText: input.currentText,
    facts: input.facts,
  })
}

function digestableSource(source: ProposalSource): Omit<ProposalSource, 'sourceDigest'> {
  return {
    product: source.product,
    workspaceScope: source.workspaceScope,
    templateId: source.templateId,
    sourceRevision: source.sourceRevision,
    field: source.field,
    currentText: source.currentText,
    facts: source.facts,
  }
}

export async function aiContentSourceDigest(input: Omit<ProposalSource, 'sourceDigest'>) {
  return sha256(canonicalSource(input))
}

function validateSource(value: unknown): ProposalSource {
  const input = record(value)
  exactKeys(input, ['product', 'workspaceScope', 'templateId', 'sourceRevision', 'sourceDigest', 'field', 'currentText', 'facts'], 'AI content source')
  if (!['commerce', 'website', 'ecommerce'].includes(String(input.product))) throw new Error('AI content product is invalid.')
  const product = input.product as AiContentProduct
  if (!idPattern.test(String(input.workspaceScope)) || !idPattern.test(String(input.templateId))) throw new Error('AI content scope is invalid.')
  if (!Number.isSafeInteger(input.sourceRevision) || Number(input.sourceRevision) < 0 || !digestPattern.test(String(input.sourceDigest))) throw new Error('AI content source binding is invalid.')
  if (!fieldsByProduct[product].includes(input.field as AiContentField)) throw new Error('AI content field is not allowed for this product.')
  if (!Array.isArray(input.facts) || input.facts.length < 1 || input.facts.length > 8) throw new Error('AI content needs one to eight source facts.')
  const facts = input.facts.map((fact, index) => boundedText(fact, `fact ${index + 1}`, 180))
  if (new Set(facts.map((fact) => fact.toLocaleLowerCase('en-US'))).size !== facts.length) throw new Error('AI content source facts must be unique.')
  return {
    product,
    workspaceScope: String(input.workspaceScope),
    templateId: String(input.templateId),
    sourceRevision: Number(input.sourceRevision),
    sourceDigest: String(input.sourceDigest),
    field: input.field as AiContentField,
    currentText: boundedText(input.currentText, 'currentText', 600),
    facts,
  }
}

export async function createAiContentProposal(value: unknown): Promise<AiContentProposal> {
  const input = record(value)
  exactKeys(input, ['proposalId', 'generatedAt', 'source', 'candidateText'], 'AI content proposal request')
  const source = validateSource(input.source)
  if (typeof input.proposalId !== 'string' || !proposalIdPattern.test(input.proposalId)) throw new Error('AI content proposal id is invalid.')
  const proposalId = input.proposalId
  const generatedAt = iso(input.generatedAt)
  const candidateText = boundedText(input.candidateText, 'candidateText', 600)
  if (await aiContentSourceDigest(digestableSource(source)) !== source.sourceDigest) throw new Error('AI content source digest is stale or invalid.')
  return {
    schema: AI_CONTENT_PROPOSAL_SCHEMA,
    proposalId,
    generatedAt,
    ...source,
    generatedClassification: 'ai_generated_unverified',
    candidateText,
    meaningReviewed: false,
    publicationAuthorized: false,
    businessRecordMutationAuthorized: false,
  }
}

export async function acceptAiContentProposalForDraft(
  proposalValue: unknown,
  currentSourceValue: unknown,
  review: { reviewedBy: unknown; meaningReviewed: unknown },
) {
  const proposal = record(proposalValue)
  exactKeys(proposal, ['schema', 'proposalId', 'generatedAt', 'product', 'workspaceScope', 'templateId', 'sourceRevision', 'sourceDigest', 'field', 'currentText', 'facts', 'generatedClassification', 'candidateText', 'meaningReviewed', 'publicationAuthorized', 'businessRecordMutationAuthorized'], 'AI content proposal')
  if (proposal.schema !== AI_CONTENT_PROPOSAL_SCHEMA || proposal.generatedClassification !== 'ai_generated_unverified'
    || proposal.meaningReviewed !== false || proposal.publicationAuthorized !== false || proposal.businessRecordMutationAuthorized !== false) {
    throw new Error('AI content proposal authority is invalid.')
  }
  const currentSource = validateSource(currentSourceValue)
  const source = validateSource({ product: proposal.product, workspaceScope: proposal.workspaceScope, templateId: proposal.templateId, sourceRevision: proposal.sourceRevision, sourceDigest: proposal.sourceDigest, field: proposal.field, currentText: proposal.currentText, facts: proposal.facts })
  if (typeof proposal.proposalId !== 'string' || !proposalIdPattern.test(proposal.proposalId)) throw new Error('AI content proposal id is invalid.')
  const proposalId = proposal.proposalId
  iso(proposal.generatedAt)
  const draftText = boundedText(proposal.candidateText, 'candidateText', 600)
  if (review.meaningReviewed !== true) throw new Error('A human meaning review is required.')
  const reviewedBy = boundedText(review.reviewedBy, 'reviewedBy', 80)
  if (await aiContentSourceDigest(digestableSource(currentSource)) !== currentSource.sourceDigest
    || JSON.stringify(currentSource) !== JSON.stringify(source)) throw new Error('AI content proposal is stale or belongs to another scope.')
  return {
    proposalId,
    product: currentSource.product,
    workspaceScope: currentSource.workspaceScope,
    templateId: currentSource.templateId,
    sourceRevision: currentSource.sourceRevision,
    sourceDigest: currentSource.sourceDigest,
    field: currentSource.field,
    draftText,
    reviewedBy,
    meaningReviewed: true as const,
    draftOnly: true as const,
    publicationAuthorized: false as const,
    businessRecordMutationAuthorized: false as const,
  }
}
