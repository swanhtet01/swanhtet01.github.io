// Connector: data — wraps the existing store.mjs spine. Does NOT reimplement DB access.
// category 'data' · configured = store.mode === 'supabase' · health = a trivial read.
//
// store.mjs already picks its mode (supabase | postgres | memory) from env. This adapter
// surfaces that to the registry so the Integrations page shows whether the real data spine
// is wired. We report "configured" only when the live Supabase spine is active — memory/
// postgres dev modes are healthy-but-not-the-production-data-store.

import store from '../store.mjs'
import { register } from './registry.mjs'

const configured = () => store.mode === 'supabase'

export const dataSupabase = {
  key: 'data-supabase',
  name: 'Supabase (data spine)',
  category: 'data',
  docs: 'kernel/store.mjs',
  configured,
  // Trivial read that works in every mode and never mutates: pull 1 activity row.
  async health() {
    try {
      await store.listActivity(1)
      return { ok: true, detail: `mode=${store.mode}` }
    } catch (e) {
      return { ok: false, detail: `mode=${store.mode}: ${String(e.message || 'read_failed').slice(0, 120)}` }
    }
  },
}

register(dataSupabase)
export default dataSupabase
