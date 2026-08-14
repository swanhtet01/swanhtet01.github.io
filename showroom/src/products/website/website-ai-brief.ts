type WebsiteStarterTemplateId = 'business-presence' | 'lead-generation' | 'catalog-showcase'
type WebsiteBriefField = 'business_name' | 'audience' | 'offer' | 'proof' | 'contact_href'

export type LocalWebsiteBriefDraft = {
  schema_version: 'supermega.website.brief-draft.v1'
  source_digest: string
  status: 'ready_for_review' | 'needs_clarification'
  template_id: WebsiteStarterTemplateId
  business_name: string | null
  audience: string | null
  offer: string | null
  proof: string | null
  contact_href: string | null
  missing_fields: WebsiteBriefField[]
  uncertain_fields: WebsiteBriefField[]
  generation: { provider: 'ollama-local'; model: 'llama3.2:1b' | 'llama3.2:3b'; receipt_id: string }
}

export class LocalWebsiteBriefError extends Error {
  code: string

  constructor(code: string) {
    super(code)
    this.code = code
  }
}

const templates = ['business-presence', 'lead-generation', 'catalog-showcase']
const fields = ['business_name', 'audience', 'offer', 'proof', 'contact_href']
const limits = { business_name: 60, audience: 70, offer: 140, proof: 360, contact_href: 160 }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const fieldList = (value: unknown) => Array.isArray(value) && value.every((item) => fields.includes(String(item)))
const bounded = (value: unknown, field: keyof typeof limits) => value === null || (typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= limits[field])

function validDraft(value: unknown): value is LocalWebsiteBriefDraft {
  if (!record(value) || !record(value.generation)) return false
  const contact = value.contact_href
  let contactSafe = contact === null
  if (typeof contact === 'string') {
    try { const url = new URL(contact); contactSafe = url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password && !url.hash } catch { contactSafe = false }
  }
  return value.schema_version === 'supermega.website.brief-draft.v1'
    && /^sha256:[0-9a-f]{64}$/.test(String(value.source_digest))
    && ['ready_for_review', 'needs_clarification'].includes(String(value.status))
    && templates.includes(String(value.template_id))
    && bounded(value.business_name, 'business_name')
    && bounded(value.audience, 'audience')
    && bounded(value.offer, 'offer')
    && bounded(value.proof, 'proof')
    && bounded(contact, 'contact_href') && contactSafe
    && fieldList(value.missing_fields) && fieldList(value.uncertain_fields)
    && value.generation.provider === 'ollama-local'
    && ['llama3.2:1b', 'llama3.2:3b'].includes(String(value.generation.model))
    && typeof value.generation.receipt_id === 'string'
    && value.generation.receipt_id.startsWith('ollama-local-')
}

async function responseError(response: Response) {
  try {
    const body: unknown = await response.json()
    if (record(body) && record(body.detail) && typeof body.detail.code === 'string') return body.detail.code
  } catch { /* Redacted stable fallback below. */ }
  return response.status === 404 ? 'local_website_brief_unavailable' : 'local_website_brief_failed'
}

export async function prepareLocalWebsiteBrief(sourceText: string) {
  const brief = sourceText.trim()
  if (brief.length < 20 || brief.length > 1_800) throw new LocalWebsiteBriefError('local_website_brief_request_invalid')
  const response = await fetch('/api/local/v1/website/brief-drafts', {
    method: 'POST',
    body: JSON.stringify({ source_label: 'website-starter', brief }),
    cache: 'no-store',
    credentials: 'omit',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-supermega-local-review': 'website-brief-v1',
    },
    redirect: 'error',
  })
  if (!response.ok) throw new LocalWebsiteBriefError(await responseError(response))
  const body: unknown = await response.json()
  if (!record(body)
    || body.raw_brief_retained !== false
    || body.website_changes_performed !== 0
    || body.publish_performed !== false
    || body.external_writes_performed !== false
    || !validDraft(body.draft)) {
    throw new LocalWebsiteBriefError('local_website_brief_response_invalid')
  }
  return body.draft
}
