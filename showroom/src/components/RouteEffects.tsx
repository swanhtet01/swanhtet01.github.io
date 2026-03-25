import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const titleMap: Record<string, string> = {
  '/': 'SuperMega | AI operating software',
  '/products': 'Services | SuperMega',
  '/examples': 'Free tools | SuperMega',
  '/packages': 'Delivery | SuperMega',
  '/contact': 'Contact | SuperMega',
  '/workspace': 'Workspace | SuperMega',
}

export function RouteEffects() {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
    document.title = titleMap[location.pathname] ?? 'SuperMega'
  }, [location.pathname])

  return null
}
