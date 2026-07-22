import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import {
  CoreLayout,
  OperationsPage,
  OverviewPage,
  SettingsPage,
} from './core/CoreApp'
import { TeamsPage } from './core/TeamWorkspace'

const WebsiteProduct = lazy(() => import('./products/website/WebsiteProduct').then((module) => ({ default: module.WebsiteProduct })))
const EcommerceOrdersProduct = lazy(() => import('./products/ecommerce/EcommerceOrdersProduct').then((module) => ({ default: module.EcommerceOrdersProduct })))

function ProductLoading({ name }: { name: string }) {
  return <main className="product-route-loading"><span>&gt;_</span><p>Loading {name} workspace…</p></main>
}

function LegacyEntryRedirect() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const demo = params.get('demo')?.toLowerCase()

  if (demo === 'plant' || demo === 'factory') return <Navigate replace to="/operations/production/" />
  if (demo === 'shop' || demo === 'retail') return <Navigate replace to="/operations/commerce/" />
  return <Navigate replace to="/" />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Suspense fallback={<ProductLoading name="Website" />}><WebsiteProduct /></Suspense>} path="products/website/*" />
        <Route element={<Suspense fallback={<ProductLoading name="Ecommerce" />}><EcommerceOrdersProduct /></Suspense>} path="products/ecommerce/*" />
        <Route element={<CoreLayout />}>
          <Route element={<OverviewPage />} index />
          <Route element={<TeamsPage />} path="work/*" />
          <Route element={<OperationsPage />} path="operations/*" />
          <Route element={<SettingsPage />} path="settings/*" />
          <Route element={<LegacyEntryRedirect />} path="legacy-entry" />
          <Route element={<Navigate replace to="/operations/commerce/" />} path="shop/*" />
          <Route element={<Navigate replace to="/operations/production/" />} path="plant/*" />
          <Route element={<Navigate replace to="/#brief" />} path="agents/*" />
          <Route element={<Navigate replace to="/#brief" />} path="assist/*" />
          <Route element={<Navigate replace to="/settings/" />} path="setup/*" />
          <Route element={<Navigate replace to="/settings/#controls" />} path="trust/*" />
          <Route element={<Navigate replace to="/" />} path="app/*" />
          <Route element={<Navigate replace to="/" />} path="login" />
          <Route element={<Navigate replace to="/" />} path="signup" />
          <Route element={<Navigate replace to="/" />} path="*" />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
