import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'

import {
  CoreLayout,
  ProductHomePage,
} from './core/CoreShell'

const OperationsPage = lazy(() => import('./core/CoreApp').then((module) => ({ default: module.OperationsPage })))
const WebsiteProduct = lazy(() => import('./products/website/WebsiteProduct').then((module) => ({ default: module.WebsiteProduct })))
const EcommerceProduct = lazy(() => import('./products/ecommerce/EcommerceProduct').then((module) => ({ default: module.EcommerceProduct })))
const SettingsPage = lazy(() => import('./core/SettingsPage').then((module) => ({ default: module.SettingsPage })))

function ProductLoading({ name }: { name: string }) {
  return <div aria-live="polite" className="product-route-loading" role="status"><span>&gt;_</span><p>Loading {name}…</p></div>
}

function productDemoPath(value: string | null) {
  const demo = value?.toLowerCase()
  if (demo === 'plant' || demo === 'factory') return '/plant/'
  if (demo === 'shop' || demo === 'retail') return '/shop/'
  if (demo === 'website' || demo === 'site') return '/website/'
  if (demo === 'ecommerce' || demo === 'storefront' || demo === 'online-orders') return '/ecommerce/'
  return null
}

function ProductHomeEntry() {
  const location = useLocation()
  const route = productDemoPath(new URLSearchParams(location.search).get('demo'))
  return route ? <Navigate replace to={route} /> : <ProductHomePage />
}

function LegacyEntryRedirect() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const route = productDemoPath(params.get('demo'))

  return <Navigate replace to={route ?? '/'} />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<CoreLayout />}>
          <Route element={<ProductHomeEntry />} index />
          <Route element={<Suspense fallback={<ProductLoading name="Shop" />}><OperationsPage product="commerce" /></Suspense>} path="shop/*" />
          <Route element={<Suspense fallback={<ProductLoading name="Plant" />}><OperationsPage product="production" /></Suspense>} path="plant/*" />
          <Route element={<Suspense fallback={<ProductLoading name="Website" />}><WebsiteProduct /></Suspense>} path="website/*" />
          <Route element={<Suspense fallback={<ProductLoading name="Ecommerce" />}><EcommerceProduct /></Suspense>} path="ecommerce/*" />
          <Route element={<Navigate replace to="/shop/" />} path="operations/commerce/*" />
          <Route element={<Navigate replace to="/plant/" />} path="operations/production/*" />
          <Route element={<Navigate replace to="/" />} path="operations/*" />
          <Route element={<Navigate replace to="/" />} path="work/*" />
          <Route element={<Navigate replace to="/website/" />} path="products/website/*" />
          <Route element={<Navigate replace to="/ecommerce/" />} path="products/ecommerce/*" />
          <Route element={<Suspense fallback={<ProductLoading name="Settings" />}><SettingsPage /></Suspense>} path="settings/*" />
          <Route element={<LegacyEntryRedirect />} path="legacy-entry" />
          <Route element={<Navigate replace to="/#command-center" />} path="agents/*" />
          <Route element={<Navigate replace to="/#command-center" />} path="assist/*" />
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
