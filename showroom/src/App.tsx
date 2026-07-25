import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'

import {
  CoreLayout,
  OperationsPage,
  OverviewPage,
  SettingsPage,
} from './core/CoreApp'

const TeamsPage = lazy(() => import('./core/TeamWorkspace').then((module) => ({ default: module.TeamsPage })))
const WebsiteProduct = lazy(() => import('./products/website/WebsiteProduct').then((module) => ({ default: module.WebsiteProduct })))
const EcommerceProduct = lazy(() => import('./products/ecommerce/EcommerceProduct').then((module) => ({ default: module.EcommerceProduct })))

function ProductLoading({ name }: { name: string }) {
  return <div aria-live="polite" className="product-route-loading" role="status"><span>&gt;_</span><p>Loading {name} workspace…</p></div>
}

function LegacyEntryRedirect() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const demo = params.get('demo')?.toLowerCase()

  if (demo === 'plant' || demo === 'factory') return <Navigate replace to="/plant/" />
  if (demo === 'shop' || demo === 'retail') return <Navigate replace to="/shop/" />
  return <Navigate replace to="/" />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<CoreLayout />}>
          <Route element={<OverviewPage />} index />
          <Route element={<Suspense fallback={<ProductLoading name="HQ" />}><TeamsPage /></Suspense>} path="work/*" />
          <Route element={<OperationsPage />} path="operations/*" />
          <Route element={<OperationsPage product="commerce" />} path="shop/*" />
          <Route element={<OperationsPage product="production" />} path="plant/*" />
          <Route element={<Suspense fallback={<ProductLoading name="Website" />}><WebsiteProduct /></Suspense>} path="website/*" />
          <Route element={<Suspense fallback={<ProductLoading name="Ecommerce" />}><EcommerceProduct /></Suspense>} path="ecommerce/*" />
          <Route element={<Navigate replace to="/website/" />} path="products/website/*" />
          <Route element={<Navigate replace to="/ecommerce/" />} path="products/ecommerce/*" />
          <Route element={<SettingsPage />} path="settings/*" />
          <Route element={<LegacyEntryRedirect />} path="legacy-entry" />
          <Route element={<Navigate replace to="/work/?view=agents" />} path="agents/*" />
          <Route element={<Navigate replace to="/work/?view=agents" />} path="assist/*" />
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
