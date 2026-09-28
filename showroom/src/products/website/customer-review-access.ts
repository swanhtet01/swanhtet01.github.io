// One access epoch spans loading, digest verification and submission. Invalidate
// synchronously in event handlers; React passive-effect cleanup is too late.
export function createReviewAccessBoundary<Identity>(readIdentity: () => Promise<Identity | null>, sameIdentity: (left: Identity, right: Identity) => boolean, now = Date.now) {
  let generation = 0
  return {
    invalidate: () => ++generation,
    capture: () => generation,
    isCurrent: (epoch: number) => epoch === generation,
    async commit(epoch: number, expected: Identity, expiresAt: string, apply: () => void) {
      if (epoch !== generation) return false
      let identity: Identity | null
      try { identity = await readIdentity() } catch { return false }
      if (epoch !== generation || !identity || !sameIdentity(identity, expected) || !(Date.parse(expiresAt) > now())) return false
      apply()
      return true
    },
  }
}
