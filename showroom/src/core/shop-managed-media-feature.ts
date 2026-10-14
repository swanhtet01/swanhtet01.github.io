// Shared Shop photos remain a source candidate until ambiguous upload retries
// have a durable per-attempt ledger and lifecycle cleanup. Keep the browser
// capability out of release bundles while preserving device-local photos.
export const MANAGED_SHOP_PHOTOS_ENABLED = false
