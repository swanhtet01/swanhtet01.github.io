// Connector: AI — wraps the existing gateway.mjs. Does NOT reimplement model calls.
// category 'ai' · configured = ANTHROPIC/CLAUDE key present · health = configured() (no spend).
//
// The gateway already owns tiers/retry/fallback/cost-caps. This adapter just exposes it to
// the connector registry so the Integrations page can show "AI: configured / healthy".

import gateway from '../gateway.mjs'
import { register } from './registry.mjs'

const configured = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY)

export const aiGateway = {
  key: 'ai-gateway',
  name: 'Claude (AI gateway)',
  category: 'ai',
  docs: 'kernel/gateway.mjs',
  configured,
  // Cheap by design: a real ping costs tokens on every console load. Configured == healthy.
  // (To upgrade to a live ping later: call gateway.complete({ tier:'bulk', maxTokens:1, ... }).)
  async health() {
    try {
      if (!configured()) return { ok: false, detail: 'missing ANTHROPIC_API_KEY' }
      return { ok: true, detail: `configured (tiers: ${Object.keys(gateway.TIERS).join('/')})` }
    } catch (err) {
      return { ok: false, detail: String(err.message).slice(0, 100) }
    }
  },
}

register(aiGateway)
export default aiGateway
