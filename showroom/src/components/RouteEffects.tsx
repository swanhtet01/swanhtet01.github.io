import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const titleMap: Record<string, string> = {
  '/': 'SuperMega | AI work tools',
  '/find-companies': 'Find Companies | SuperMega',
  '/find-leads': 'Find Companies | SuperMega',
  '/lead-finder': 'Find Companies | SuperMega',
  '/sales-follow-up': 'Sales Follow-Up | SuperMega',
  '/team-updates': 'Team Updates | SuperMega',
  '/follow-up-list': 'Sales Follow-Up | SuperMega',
  '/bring-a-list': 'Sales Follow-Up | SuperMega',
  '/paste-updates': 'Team Updates | SuperMega',
  '/queue-builder': 'Sales Follow-Up | SuperMega',
  '/sales-desk': 'Sales Desk | SuperMega',
  '/ops-desk': 'Ops Desk | SuperMega',
  '/book': 'Book Demo | SuperMega',
}

export function RouteEffects() {
  const location = useLocation()

  useEffect(() => {
    const normalizedPath = location.pathname.replace(/\/+$/, '') || '/'
    window.scrollTo({ top: 0, behavior: 'auto' })
    document.title = titleMap[normalizedPath] ?? 'SuperMega'
  }, [location.pathname])

  return null
}
