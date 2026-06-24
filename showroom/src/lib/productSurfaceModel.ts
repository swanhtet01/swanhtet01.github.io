import { getCapabilityDomainsForProductCategory, getKnowledgeRuntimeStagesForProductCategory, type ProductArchitectureCategory } from './aiReferenceArchitecture'
import {
  getIndustryPortalKitsForSoftwareModule,
  getIndustryPortalKitsForStarterPack,
  getPortalWorkspaceTypesForSoftwareModule,
  getPortalWorkspaceTypesForStarterPack,
} from './industryPortalKits'
import { getStarterPackDetail } from './salesControl'
import {
  getSoftwareModuleDetail,
  getSoftwareModuleGalleryShots,
  getSoftwareModuleValueModel,
  type ProductGalleryShot,
} from './softwareCatalog'

function starterPackArchitectureCategory(): ProductArchitectureCategory {
  return 'Starter'
}

export function getSoftwareModuleBuyerSurface(productIdOrSlug: string | null | undefined) {
  const detail = getSoftwareModuleDetail(productIdOrSlug)
  if (!detail) {
    return null
  }

  return {
    detail,
    galleryShots: getSoftwareModuleGalleryShots(detail.id),
    valueModel: getSoftwareModuleValueModel(detail.id),
    portalKits: getIndustryPortalKitsForSoftwareModule(detail.id),
    workspaceTypes: getPortalWorkspaceTypesForSoftwareModule(detail.id),
    capabilityDomains: getCapabilityDomainsForProductCategory(detail.category),
    runtimeStages: getKnowledgeRuntimeStagesForProductCategory(detail.category),
  }
}

export function getStarterPackBuyerSurface(productIdOrSlug: string | null | undefined) {
  const detail = getStarterPackDetail(productIdOrSlug)
  if (!detail) {
    return null
  }

  const galleryShots: ProductGalleryShot[] = detail.image
    ? [
        {
          src: detail.image,
          alt: detail.name,
          caption: detail.promise,
        },
      ]
    : []

  return {
    detail,
    galleryShots,
    portalKits: getIndustryPortalKitsForStarterPack(detail.id),
    workspaceTypes: getPortalWorkspaceTypesForStarterPack(detail.id),
    capabilityDomains: getCapabilityDomainsForProductCategory(starterPackArchitectureCategory()),
    runtimeStages: getKnowledgeRuntimeStagesForProductCategory(starterPackArchitectureCategory()),
  }
}
