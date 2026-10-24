// Closed lazy portal entry. Importing the whole managed-trial namespace retains
// unused exports in the production bundle. Auth/product routes import their own
// functions directly; this entry changes neither membership checks nor timing.
export {
  currentManagedIdentity,
  discoverManagedWorkspacesForCurrentSession,
  loadManagedBootstrap,
  managedCapabilitiesFromBootstrap,
  managedProductsFromBootstrap,
} from './managed-trial.ts'
