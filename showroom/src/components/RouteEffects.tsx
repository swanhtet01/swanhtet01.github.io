import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const titleMap: Record<string, string> = {
  '/': 'SuperMega | Simple work tools',
  '/find-companies': 'Find Companies | SuperMega',
  '/lead-finder': 'Find Companies | SuperMega',
  '/company-list': 'Company List | SuperMega',
  '/task-list': 'Task List | SuperMega',
  '/action-os': 'Task List | SuperMega',
  '/workspace': 'Company List | SuperMega',
  '/book': 'Book Setup Call | SuperMega',
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
