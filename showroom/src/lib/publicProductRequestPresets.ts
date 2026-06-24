export type PublicRequestPreset = {
  situationId: string
  requestedPackage: string
}

export function normalizePackageKey(value: string) {
  return value.trim().toLowerCase()
}

export const START_REQUEST_PRESETS: Record<string, PublicRequestPreset> = {
  'ai-workflow-desk': {
    situationId: 'replace-manual-browser-work',
    requestedPackage: 'Document Extraction Ledger',
  },
  'custom-workflow': {
    situationId: 'replace-manual-browser-work',
    requestedPackage: 'Workflow Desk Deployment Sprint',
  },
  'custom-workflow-app': {
    situationId: 'replace-manual-browser-work',
    requestedPackage: 'Workflow Desk Deployment Sprint',
  },
  'build-app-from-workflow': {
    situationId: 'replace-manual-browser-work',
    requestedPackage: 'Document Extraction Ledger',
  },
  'workflow-app-sprint': {
    situationId: 'replace-manual-browser-work',
    requestedPackage: 'Workflow Desk Deployment Sprint',
  },
  'workflow-desk-sprint': {
    situationId: 'replace-manual-browser-work',
    requestedPackage: 'Workflow Desk Deployment Sprint',
  },
  agentops: {
    situationId: 'replace-manual-browser-work',
    requestedPackage: 'Back Office Workflow Desk',
  },
  'agentops-toolbox': {
    situationId: 'replace-manual-browser-work',
    requestedPackage: 'Back Office Workflow Desk',
  },
  'back-office-workflow-desk': {
    situationId: 'replace-manual-browser-work',
    requestedPackage: 'Back Office Workflow Desk',
  },
  'ai-agent-operator': {
    situationId: 'replace-manual-browser-work',
    requestedPackage: 'Back Office Workflow Desk',
  },
  'ai-back-office': {
    situationId: 'replace-manual-browser-work',
    requestedPackage: 'Back Office Workflow Desk',
  },
  'back-office-operator': {
    situationId: 'replace-manual-browser-work',
    requestedPackage: 'Back Office Workflow Desk',
  },
  'document-intake-data-cleanroom': {
    situationId: 'data-room-replacement',
    requestedPackage: 'Document Extraction Ledger',
  },
  'document-extraction-ledger': {
    situationId: 'data-room-replacement',
    requestedPackage: 'Document Extraction Ledger',
  },
  'source-intake': {
    situationId: 'data-room-replacement',
    requestedPackage: 'Document Extraction Ledger',
  },
  'industrial-plant-os': {
    situationId: 'replace-erp-chasing',
    requestedPackage: 'Factory Operations App Sprint',
  },
  'industrial-plant-os-sprint': {
    situationId: 'replace-erp-chasing',
    requestedPackage: 'Factory Operations App Sprint',
  },
  'erp-to-plant-os': {
    situationId: 'replace-erp-chasing',
    requestedPackage: 'Factory Operations App Starter Sprint',
  },
  'easy-erp': {
    situationId: 'replace-erp-chasing',
    requestedPackage: 'Factory Operations App Starter Sprint',
  },
  'factory-operations': {
    situationId: 'replace-erp-chasing',
    requestedPackage: 'Factory Operations App Sprint',
  },
  'factory-operations-app': {
    situationId: 'replace-erp-chasing',
    requestedPackage: 'Factory Operations App Sprint',
  },
  'factory-issues-maintenance-quality': {
    situationId: 'replace-erp-chasing',
    requestedPackage: 'Factory Operations App Sprint',
  },
  'factory-twin-os': {
    situationId: 'replace-erp-chasing',
    requestedPackage: 'Factory Operations App Sprint',
  },
  'operations-digital-twin': {
    situationId: 'replace-erp-chasing',
    requestedPackage: 'Factory Operations App Sprint',
  },
  'operations-twin': {
    situationId: 'replace-erp-chasing',
    requestedPackage: 'Factory Operations App Sprint',
  },
  'restaurant-pos-desk': {
    situationId: 'replace-service-ops',
    requestedPackage: 'Restaurant POS + Inventory Sprint',
  },
  'restaurant-pos-sprint': {
    situationId: 'replace-service-ops',
    requestedPackage: 'Restaurant POS + Inventory Sprint',
  },
  'restaurant-pos-menu-inventory': {
    situationId: 'replace-service-ops',
    requestedPackage: 'Restaurant POS + Inventory Sprint',
  },
  'restaurant-group-os': {
    situationId: 'replace-service-ops',
    requestedPackage: 'Restaurant POS + Inventory Sprint',
  },
  'store-pay-desk': {
    situationId: 'replace-service-ops',
    requestedPackage: 'Restaurant POS + Inventory Sprint',
  },
  'service-desk-pos': {
    situationId: 'replace-service-ops',
    requestedPackage: 'Restaurant POS + Inventory Sprint',
  },
  'service-business-os': {
    situationId: 'replace-service-ops',
    requestedPackage: 'Restaurant POS + Inventory Sprint',
  },
  'portal-factory': {
    situationId: 'replace-manual-browser-work',
    requestedPackage: 'Workflow Desk Deployment Sprint',
  },
  'portal-launch-sprint': {
    situationId: 'replace-manual-browser-work',
    requestedPackage: 'Workflow Desk Deployment Sprint',
  },
  'retail-distribution-desk': {
    situationId: 'replace-erp-chasing',
    requestedPackage: 'Retail and Distribution Sprint',
  },
  'people-attendance-desk': {
    situationId: 'replace-service-ops',
    requestedPackage: 'People and Attendance Sprint',
  },
}

export const INTAKE_REQUEST_PRESETS: Record<string, PublicRequestPreset> = {
  'ai-workflow-desk': {
    situationId: 'data-room-replacement',
    requestedPackage: 'Document Extraction Ledger',
  },
  'custom-workflow': {
    situationId: 'browser-work-replacement',
    requestedPackage: 'Workflow Desk Deployment Sprint',
  },
  'custom-workflow-app': {
    situationId: 'browser-work-replacement',
    requestedPackage: 'Workflow Desk Deployment Sprint',
  },
  'build-app-from-workflow': {
    situationId: 'data-room-replacement',
    requestedPackage: 'Document Extraction Ledger',
  },
  'workflow-app-sprint': {
    situationId: 'browser-work-replacement',
    requestedPackage: 'Workflow Desk Deployment Sprint',
  },
  'workflow-desk-sprint': {
    situationId: 'browser-work-replacement',
    requestedPackage: 'Workflow Desk Deployment Sprint',
  },
  agentops: {
    situationId: 'browser-work-replacement',
    requestedPackage: 'Back Office Workflow Desk',
  },
  'agentops-toolbox': {
    situationId: 'browser-work-replacement',
    requestedPackage: 'Back Office Workflow Desk',
  },
  'back-office-workflow-desk': {
    situationId: 'browser-work-replacement',
    requestedPackage: 'Back Office Workflow Desk',
  },
  'ai-agent-operator': {
    situationId: 'browser-work-replacement',
    requestedPackage: 'Back Office Workflow Desk',
  },
  'ai-back-office': {
    situationId: 'browser-work-replacement',
    requestedPackage: 'Back Office Workflow Desk',
  },
  'back-office-operator': {
    situationId: 'browser-work-replacement',
    requestedPackage: 'Back Office Workflow Desk',
  },
  'document-intake-data-cleanroom': {
    situationId: 'data-room-replacement',
    requestedPackage: 'Document Extraction Ledger',
  },
  'document-extraction-ledger': {
    situationId: 'data-room-replacement',
    requestedPackage: 'Document Extraction Ledger',
  },
  'source-intake': {
    situationId: 'data-room-replacement',
    requestedPackage: 'Document Extraction Ledger',
  },
  'industrial-plant-os': {
    situationId: 'erp-action-layer',
    requestedPackage: 'Factory Operations App Sprint',
  },
  'industrial-plant-os-sprint': {
    situationId: 'erp-action-layer',
    requestedPackage: 'Factory Operations App Sprint',
  },
  'erp-to-plant-os': {
    situationId: 'erp-action-layer',
    requestedPackage: 'Factory Operations App Sprint',
  },
  'easy-erp': {
    situationId: 'erp-action-layer',
    requestedPackage: 'Factory Operations App Sprint',
  },
  'factory-operations': {
    situationId: 'erp-action-layer',
    requestedPackage: 'Factory Operations App Sprint',
  },
  'factory-operations-app': {
    situationId: 'erp-action-layer',
    requestedPackage: 'Factory Operations App Sprint',
  },
  'factory-issues-maintenance-quality': {
    situationId: 'erp-action-layer',
    requestedPackage: 'Factory Operations App Sprint',
  },
  'operations-digital-twin': {
    situationId: 'erp-action-layer',
    requestedPackage: 'Factory Operations App Sprint',
  },
  'operations-twin': {
    situationId: 'erp-action-layer',
    requestedPackage: 'Factory Operations App Sprint',
  },
  'restaurant-pos-desk': {
    situationId: 'service-ops-replacement',
    requestedPackage: 'Restaurant POS + Inventory Sprint',
  },
  'restaurant-pos-sprint': {
    situationId: 'service-ops-replacement',
    requestedPackage: 'Restaurant POS + Inventory Sprint',
  },
  'restaurant-pos-menu-inventory': {
    situationId: 'service-ops-replacement',
    requestedPackage: 'Restaurant POS + Inventory Sprint',
  },
  'restaurant-group-os': {
    situationId: 'service-ops-replacement',
    requestedPackage: 'Restaurant POS + Inventory Sprint',
  },
  'store-pay-desk': {
    situationId: 'service-ops-replacement',
    requestedPackage: 'Restaurant POS + Inventory Sprint',
  },
  'service-desk-pos': {
    situationId: 'service-ops-replacement',
    requestedPackage: 'Restaurant POS + Inventory Sprint',
  },
  'service-business-os': {
    situationId: 'service-ops-replacement',
    requestedPackage: 'Restaurant POS + Inventory Sprint',
  },
  'portal-factory': {
    situationId: 'browser-work-replacement',
    requestedPackage: 'Workflow Desk Deployment Sprint',
  },
  'portal-launch-sprint': {
    situationId: 'browser-work-replacement',
    requestedPackage: 'Workflow Desk Deployment Sprint',
  },
  'retail-distribution-desk': {
    situationId: 'erp-action-layer',
    requestedPackage: 'Retail and Distribution Sprint',
  },
  'people-attendance-desk': {
    situationId: 'service-ops-replacement',
    requestedPackage: 'People and Attendance Sprint',
  },
}
