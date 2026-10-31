// Capability parsing is a separate closed lazy entry so the product portal
// facade remains an exact, auditable read-only surface.
export { managedCapabilitiesFromBootstrap } from './managed-trial.ts'
