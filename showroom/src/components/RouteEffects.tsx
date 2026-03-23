import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const titleMap: Record<string, string> = {
  '/': 'SuperMega | AI tools for operators',
  '/products': 'Products | SuperMega',
  '/examples': 'Try Tools | SuperMega',
  '/packages': 'Packages | SuperMega',
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
