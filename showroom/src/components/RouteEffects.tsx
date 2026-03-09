import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const titleMap: Record<string, string> = {
  '/': 'SuperMega | AI Agents for Myanmar SMBs',
  '/solutions': 'Solutions | SuperMega',
  '/packages': 'Packages | SuperMega',
  '/case-studies': 'Case Studies | SuperMega',
  '/dqms': 'DQMS Add-ons | SuperMega',
  '/about': 'About | SuperMega',
  '/contact': 'Contact | SuperMega',
}

export function RouteEffects() {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    document.title = titleMap[location.pathname] ?? 'SuperMega'
  }, [location.pathname])

  return null
}
