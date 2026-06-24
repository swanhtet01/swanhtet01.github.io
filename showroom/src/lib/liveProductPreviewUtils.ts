import type { LivePreviewVariant } from './liveProductPreviewModel'

export function previewVariantForStarterProduct(productId: string): LivePreviewVariant {
  if (productId === 'spa-service-desk') {
    return 'service-desk'
  }
  if (productId === 'company-cleanup') {
    return 'company-cleanup'
  }
  if (productId === 'receiving-control') {
    return 'receiving-control'
  }
  return 'sales-setup'
}

export function previewVariantForSoftwareModule(moduleId: string): LivePreviewVariant {
  if (moduleId === 'sales-system') {
    return 'sales-setup'
  }
  if (moduleId === 'operations-inbox' || moduleId === 'supplier-portal') {
    return 'receiving-control'
  }
  if (moduleId === 'industrial-dqms') {
    return 'industrial-dqms'
  }
  if (moduleId === 'knowledge-graph') {
    return 'knowledge-graph'
  }
  if (moduleId === 'agent-runtime') {
    return 'agent-runtime'
  }
  if (moduleId === 'tenant-control-plane') {
    return 'tenant-control'
  }
  if (moduleId === 'data-science-studio') {
    return 'data-science'
  }
  if (moduleId === 'founder-brief' || moduleId === 'director-command-center') {
    return 'founder-brief'
  }
  return 'portal'
}
