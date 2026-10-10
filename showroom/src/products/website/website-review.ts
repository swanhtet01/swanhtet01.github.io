import { websiteSource, type EvidenceKind, type WebsiteSourceRef, type WebsiteWorkspace } from './website-model'

export const reviewStatements: ReadonlyArray<{ kind: EvidenceKind; label: string; finding: string }> = [
  { kind: 'content', label: 'The words, photos and business details are correct.', finding: 'Owner confirmed the saved pages, photos and business details after reviewing the page preview.' },
  { kind: 'responsive', label: 'I checked every page on desktop, tablet and mobile.', finding: 'Owner inspected every ready page in the desktop, tablet and mobile previews.' },
  { kind: 'links', label: 'I checked the navigation and button destinations.', finding: 'Owner checked navigation and call-to-action destinations in the saved pages.' },
]

export type ReviewEvidenceInput = { kind: EvidenceKind; finding: string; reference: string; verifiedBy: string; source: WebsiteSourceRef }
export type ReviewApprovalInput = { reviewer: string; note: string; source: WebsiteSourceRef }
export type ReviewCallbacks = {
  onAddEvidence: (input: ReviewEvidenceInput) => Promise<boolean>
  onApprove: (input: ReviewApprovalInput) => Promise<boolean>
  onRecordPublish: (source: WebsiteSourceRef) => Promise<boolean>
}

export function requireReviewedSource(workspace: WebsiteWorkspace, expected: WebsiteSourceRef) {
  const actual = websiteSource(workspace)
  if (actual.digest !== expected.digest || actual.contentRevision !== expected.contentRevision) {
    throw new Error('Your website changed during review. Review the updated pages before saving this version.')
  }
}

// Separate durable commands preserve the server's one-event-per-command rule.
// A partial save remains in history; a failed stage never advances to publication.
export async function saveReviewedWebsite(input: {
  source: WebsiteSourceRef
  reviewer: string
  confirmed: boolean
  callbacks: ReviewCallbacks
}) {
  if (!input.confirmed || !input.reviewer.trim()) throw new Error('Complete the website review first.')
  const { callbacks, source, reviewer } = input
  for (const statement of reviewStatements) {
    const ok = await callbacks.onAddEvidence({ kind: statement.kind, finding: statement.finding, reference: `Saved page preview ${source.digest} / revision ${source.contentRevision}`, verifiedBy: reviewer, source })
    if (!ok) throw new Error('Could not confirm the review save.')
  }
  if (!await callbacks.onApprove({ source, reviewer, note: 'Owner reviewed the saved pages, all three preview sizes and link destinations, and approved this version.' })) throw new Error('Could not confirm the review save.')
  if (!await callbacks.onRecordPublish(source)) throw new Error('Could not confirm the saved website version.')
}
