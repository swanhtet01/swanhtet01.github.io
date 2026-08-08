// Connector: AI — wraps the existing gateway.mjs. Does NOT reimplement model calls.
// category 'ai' · configured = provider admitted by the central policy · health = no-spend metadata.
//
// The gateway already owns tiers/retry/fallback/cost-caps. This adapter just exposes it to
// the connector registry so the Integrations page can show "AI: configured / healthy".

import gateway, { providerPolicy } from '../gateway.mjs'
import { register } from './registry.mjs'

const configured = () => gateway.providerChain().length > 0

export const aiGateway = {
  key: 'ai-gateway',
  name: 'SuperMega AI gateway',
  category: 'ai',
  docs: 'kernel/gateway.mjs',
  configured,
  // Cheap by design: a real ping costs tokens on every console load. Configured == healthy.
  // (To upgrade to a live ping later: call gateway.complete({ tier:'bulk', maxTokens:1, ... }).)
  async health() {
    try {
      const policy = providerPolicy()
      const providers = gateway.providerChain().map((provider) => provider.name)
      if (policy === 'invalid') return { ok: false, detail: 'invalid_provider_policy' }
      if (!providers.length) {
        return { ok: false, detail: policy === 'local-only' ? 'local_provider_unavailable' : 'provider_unavailable' }
      }
      return { ok: true, detail: `policy=${policy}; providers=${providers.join(',')}` }
    } catch (err) {
      return { ok: false, detail: String(err.message).slice(0, 100) }
    }
  },
}

register(aiGateway)
export default aiGateway
