import type { WebsiteReleasePackage } from '../products/website/website-release-foundation.ts'

export type WebsiteReleaseMigrationBrief = {
  hasMigration: boolean
  isFirstRelease: boolean
  hasChain: boolean
  operationCount: number
  fromTemplateVersion: 1 | null
  toTemplateVersion: 2 | null
}

export function projectWebsiteReleaseMigrationBrief(pkg: WebsiteReleasePackage): WebsiteReleaseMigrationBrief {
  const { migration, previousPackageDigest } = pkg
  return {
    hasMigration: migration !== null,
    isFirstRelease: previousPackageDigest === null,
    hasChain: previousPackageDigest !== null,
    operationCount: migration !== null ? migration.operations.length : 0,
    fromTemplateVersion: migration !== null ? migration.fromTemplateVersion : null,
    toTemplateVersion: migration !== null ? migration.toTemplateVersion : null,
  }
}
