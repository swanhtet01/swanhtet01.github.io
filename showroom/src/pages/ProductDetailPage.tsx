import { Navigate, useParams } from 'react-router-dom'

const legacyProductPackageMap: Record<string, string> = {
  agentops: 'agentops-toolbox',
  'agentops-toolbox': 'agentops-toolbox',
  'ai-agent-operator': 'agentops-toolbox',
  'ai-back-office': 'agentops-toolbox',
  'back-office-operator': 'agentops-toolbox',
  'managed-agent-ops': 'agentops-toolbox',
  openclaw: 'agentops-toolbox',
  'agency-client-operator': 'agency-client-operator',
  'agency-operator': 'agency-client-operator',
  'client-operator': 'agency-client-operator',

  'ai-workflow-desk': 'ai-workflow-desk',
  'ai-workflow-desk-sprint': 'ai-workflow-desk',
  'build-app-from-workflow': 'ai-workflow-desk',
  'custom-app-sprint': 'ai-workflow-desk',
  'first-workflow': 'ai-workflow-desk',
  'workflow': 'ai-workflow-desk',
  'workflow-app-sprint': 'ai-workflow-desk',
  'workflow-desk': 'ai-workflow-desk',
  'workflow-desk-sprint': 'ai-workflow-desk',
  'workdesk': 'ai-workflow-desk',

  'digital-twin': 'operations-digital-twin',
  'factory': 'operations-digital-twin',
  'factory-desk': 'operations-digital-twin',
  'factory-issues-maintenance-quality': 'operations-digital-twin',
  'factory-work': 'operations-digital-twin',
  'factorydesk': 'operations-digital-twin',
  'industrial-plant-os': 'operations-digital-twin',
  'industrial-plant-os-sprint': 'operations-digital-twin',
  'operations-digital-twin': 'operations-digital-twin',
  'operations-twin': 'operations-digital-twin',
  'smart-meter-twin': 'operations-digital-twin',

  'counter': 'restaurant-group-os',
  'menu-to-qr-os': 'restaurant-group-os',
  'restaurant-desk': 'restaurant-group-os',
  'restaurant-group-os': 'restaurant-group-os',
  'restaurant-pos-desk': 'restaurant-group-os',
  'restaurant-pos-menu-inventory': 'restaurant-group-os',
  'service-business-os': 'restaurant-group-os',
  'service-desk-pos': 'restaurant-group-os',
  'spa-service-desk': 'restaurant-group-os',
  'store-pay-desk': 'restaurant-group-os',
  'storedesk': 'restaurant-group-os',
}

function productTargetForProduct(productId: string | undefined) {
  const normalized = productId?.trim().toLowerCase() ?? ''
  const productSelectorId = legacyProductPackageMap[normalized]
  if (!productSelectorId) {
    return '/products/'
  }
  return `/products/?product=${encodeURIComponent(productSelectorId)}`
}

export function ProductDetailPage() {
  const { productId } = useParams()
  return <Navigate replace to={productTargetForProduct(productId)} />
}
