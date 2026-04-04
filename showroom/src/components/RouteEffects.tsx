import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const titleMap: Record<string, string> = {
  '/': 'SuperMega | AI work tools',
  '/find-leads': 'Find Leads | SuperMega',
  '/lead-finder': 'Find Leads | SuperMega',
  '/follow-up-list': 'Follow-Up List | SuperMega',
  '/queue-builder': 'Follow-Up List | SuperMega',
  '/sales-desk': 'Sales Desk | SuperMega',
  '/ops-desk': 'Ops Desk | SuperMega',
  '/book': 'Book | SuperMega',
}

export function RouteEffects() {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
    document.title = titleMap[location.pathname] ?? 'SuperMega'
  }, [location.pathname])

  return null
}
