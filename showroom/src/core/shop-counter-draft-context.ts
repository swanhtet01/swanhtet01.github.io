// Legacy counter recovery is local-only. Never apply its device-wide basket to a company.
export function shopCounterDraftContext(confirmedLocalShop: boolean, identity: { workspaceId: string; userId: string } | null) {
  if (identity) return { key: JSON.stringify(['managed', identity.workspaceId, identity.userId]), persistLocalDraft: false }
  return { key: confirmedLocalShop ? 'local' : 'checking', persistLocalDraft: confirmedLocalShop }
}
