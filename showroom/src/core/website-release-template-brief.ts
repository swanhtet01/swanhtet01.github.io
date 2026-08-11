import type { WebsiteReleasePackage } from '../products/website/website-release-foundation.ts'

export type WebsiteReleaseTemplateBrief = {
  templateId: 'TPL-BUSINESS-001'
  templateVersion: 1 | 2
  isV1: boolean
  isV2: boolean
  componentCount: number
  uniqueComponentIds: number
}

export function projectWebsiteReleaseTemplateBrief(pkg: WebsiteReleasePackage): WebsiteReleaseTemplateBrief {
  const { template } = pkg
  const uniqueComponentIds = new Set(template.components.map(c => c.componentId)).size
  return {
    templateId: template.templateId,
    templateVersion: template.version,
    isV1: template.version === 1,
    isV2: template.version === 2,
    componentCount: template.components.length,
    uniqueComponentIds,
  }
}
