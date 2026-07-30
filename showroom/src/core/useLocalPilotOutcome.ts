import { useEffect, useState } from 'react'

import { readLocalBusinessSnapshot } from './business-command'
import {
  PILOT_OUTCOME_STORAGE_KEY,
  buildPilotOutcomeMetric,
  buildPilotOutcomeReport,
  type PilotOutcomeSetup,
} from './pilot-outcome'

export function useLocalPilotOutcome(setup: PilotOutcomeSetup) {
  const [, setRevision] = useState(0)
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1)
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === PILOT_OUTCOME_STORAGE_KEY) refresh()
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', onStorage)
    window.addEventListener('supermega:pilot-outcome', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('supermega:pilot-outcome', refresh)
    }
  }, [])
  const metric = buildPilotOutcomeMetric(readLocalBusinessSnapshot(window.localStorage), setup.product)
  return {
    metric,
    report: buildPilotOutcomeReport(window.localStorage, setup, metric),
    refresh: () => window.dispatchEvent(new Event('supermega:pilot-outcome')),
  }
}
