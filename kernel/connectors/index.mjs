// SUPERMEGA connectors — single import point. Importing this side-effect-registers every
// built-in connector, then re-exports the registry API. Anything that wants the registry should
// `import connectors from '.../connectors/index.mjs'` so it can't accidentally miss an adapter.
//
// To add a connector: create connectors/<key>.mjs that calls register(...) at module load,
// then add one import line below. That's the whole wiring. See README.md.

import registry from './registry.mjs'

// Side-effect imports — each module calls register(...) when loaded.
import './ai-gateway.mjs'
import './data-supabase.mjs'
import './data-sheets.mjs'
import './data-drive.mjs'
import './data-gmail.mjs'
import './data-calendar.mjs'
import './payment-stripe.mjs'
import './payment-mmqr.mjs'
import './messaging-resend.mjs'
import './messaging-telegram.mjs'
import './messaging-viber.mjs'

export * from './registry.mjs'
export default registry
