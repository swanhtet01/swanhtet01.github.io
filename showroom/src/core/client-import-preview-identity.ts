/** Bind staged source data to an authenticated company when one is selected. */
export function clientImportPreviewIdentityKey(
  identity: { userId: string; workspaceId: string } | null,
): string {
  return identity === null ? '' : JSON.stringify([identity.userId, identity.workspaceId])
}

/** A signed-out CSV remains local source data through the first sign-in. */
export function clientImportPreviewIdentityMatches(expected: string, current: string): boolean {
  return expected === '' || expected === current
}

export function isClientImportPreviewRequestCurrent(context: {
  requestId: number
  currentRequestId: number
  expectedProduct: string
  currentProduct: string
  expectedWorkflowTemplateId: string
  currentWorkflowTemplateId: string
  expectedIdentityKey: string
  currentIdentityKey: string
}): boolean {
  return context.requestId === context.currentRequestId
    && context.expectedProduct === context.currentProduct
    && context.expectedWorkflowTemplateId === context.currentWorkflowTemplateId
    && clientImportPreviewIdentityMatches(context.expectedIdentityKey, context.currentIdentityKey)
}

/** Clear staged source data when leaving an authenticated company identity. */
export function shouldClearClientImportPreviewOnIdentityChange(
  previous: string,
  current: string,
): boolean {
  return previous !== '' && previous !== current
}
