import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const titleMap: Record<string, string> = {
  '/': 'SuperMega | AI agent systems',
  '/products': 'Agents | SuperMega',
  '/examples': 'Live Lab | SuperMega',
  '/packages': 'Pricing | SuperMega',
  '/contact': 'Contact | SuperMega',
}

export function RouteEffects() {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
    document.title = titleMap[location.pathname] ?? 'SuperMega'
  }, [location.pathname])

  return null
}
