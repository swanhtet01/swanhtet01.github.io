import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const titleMap: Record<string, string> = {
  '/': 'SuperMega | AI operations software',
  '/products': 'Solutions | SuperMega',
  '/examples': 'Free Tools | SuperMega',
  '/packages': 'How We Work | SuperMega',
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
