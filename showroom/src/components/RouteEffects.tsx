import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const titleMap: Record<string, string> = {
  '/': 'SuperMega | Simple work tools',
  '/find-companies': 'Find Companies | SuperMega',
  '/find-leads': 'Find Companies | SuperMega',
  '/lead-finder': 'Find Companies | SuperMega',
  '/sales-list': 'Sales List | SuperMega',
  '/sales-follow-up': 'Sales List | SuperMega',
  '/team-tasks': 'Team Tasks | SuperMega',
  '/team-updates': 'Team Tasks | SuperMega',
  '/follow-up-list': 'Sales List | SuperMega',
  '/bring-a-list': 'Sales List | SuperMega',
  '/paste-updates': 'Team Tasks | SuperMega',
  '/queue-builder': 'Sales List | SuperMega',
  '/sales-desk': 'Sales Setup | SuperMega',
  '/ops-desk': 'Operations Setup | SuperMega',
  '/book': 'Book Demo | SuperMega',
  '/book-demo': 'Book Demo | SuperMega',
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
