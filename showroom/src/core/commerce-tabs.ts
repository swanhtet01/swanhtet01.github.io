// Shop's task modes, shared by the two surfaces that render them: the in-page
// workspace toolbar (CoreApp.tsx OperationsPage) and the phone bottom bar
// (CoreShell.tsx .mobile-nav, design phase 3 "bottom-nav work modes"). CoreApp
// is chunk-isolated by vite.config.ts manualChunks and already imports FROM
// CoreShell, so the shell can never import CoreApp directly — this module is
// the one sanctioned meeting point, and it keeps the two navigations unable to
// drift (same ids, same labels, same default tab).
export type CommerceTab = 'today' | 'counter' | 'orders' | 'inventory'

export const commerceTabs: Array<{ id: CommerceTab; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'counter', label: 'Sell' },
  { id: 'orders', label: 'Orders' },
  { id: 'inventory', label: 'Stock' },
]

// The canonical ?tab= defaulting rule. OperationsPage (CoreApp.tsx) replaces
// the URL with this resolution, so any surface highlighting the active task
// must apply the same rule or its active state desyncs during the frame before
// canonicalization runs (and while the lazy product chunk is still loading).
export function activeCommerceTab(requestedTab: string | null): CommerceTab {
  return commerceTabs.some((tab) => tab.id === requestedTab) ? requestedTab as CommerceTab : 'counter'
}
