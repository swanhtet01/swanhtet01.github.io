import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const titleMap: Record<string, string> = {
  '/': 'SuperMega | Simple work tools',
  '/find-companies': 'Find Companies | SuperMega',
  '/find-leads': 'Find Companies | SuperMega',
  '/lead-finder': 'Find Companies | SuperMega',
  '/company-list': 'Company List | SuperMega',
  '/sales-list': 'Company List | SuperMega',
  '/sales-follow-up': 'Company List | SuperMega',
  '/task-list': 'Task List | SuperMega',
  '/team-tasks': 'Task List | SuperMega',
  '/team-updates': 'Task List | SuperMega',
  '/follow-up-list': 'Company List | SuperMega',
  '/bring-a-list': 'Company List | SuperMega',
  '/paste-updates': 'Task List | SuperMega',
  '/queue-builder': 'Company List | SuperMega',
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
    document.title = titleMap[normalizedPath] ?? 'SuperMega | Simple work tools'
  }, [location.pathname])

  return null
}
