import { managedAccountHubLoginPath, managedAccountPath } from './account-routes.ts'

export function managedAccountRouteLoginPath(pathname: string, search: string) {
  if (pathname === '/account' || pathname === '/account/') return managedAccountHubLoginPath()
  if (!/^\/account\/(?:recovery|setup)\/?$/.test(pathname)) return '/login'
  const products = new URLSearchParams(search).getAll('product')
  return managedAccountPath('/login', products.length === 1 ? products[0] : null, search)
}
