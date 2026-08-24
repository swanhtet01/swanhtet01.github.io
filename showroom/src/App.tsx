import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'

import {
  CoreLayout,
  ProductHomeEntry,
} from './core/CoreShell'

const OperationsPage = lazy(() => import('./core/OperationsPageRoute'))
const WebsiteProduct = lazy(() => import('./products/website/WebsiteProduct').then((module) => ({ default: module.WebsiteProduct })))
const EcommerceProduct = lazy(() => import('./products/ecommerce/EcommerceProduct').then((module) => ({ default: module.EcommerceProduct })))
const SettingsPage = lazy(() => import('./core/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const WorkspaceControlsPage = lazy(() => import('./core/WorkspaceControlsPage').then((module) => ({ default: module.WorkspaceControlsPage })))
const ProductOnboardingPage = lazy(() => import('./core/ProductOnboardingPage').then((module) => ({ default: module.ProductOnboardingPage })))
const ManagedLoginPage = lazy(() => import('./core/ManagedLoginPage').then((module) => ({ default: module.ManagedLoginPage })))
const ManagedAccountPage = lazy(() => import('./core/ManagedAccountPage').then((module) => ({ default: module.ManagedAccountPage })))
const SignupPage = lazy(() => import('./core/SignupPage').then((module) => ({ default: module.SignupPage })))
const visionPreviewEnabled = import.meta.env.DEV || import.meta.env.VITE_SUPERMEGA_VISION_PREVIEW === '1'
const VisionProduct = visionPreviewEnabled
  ? lazy(() => import('./products/vision/VisionProduct').then((module) => ({ default: module.VisionProduct })))
  : null

function ProductLoading({ name }: { name: string }) {
  return <div aria-live="polite" className="product-route-loading" role="status"><span>&gt;_</span><p>{name}</p></div>
}

function productDemoPath(value: string | null) {
  const demo = value?.toLowerCase()
  if (demo === 'plant' || demo === 'factory') return '/plant/'
  if (demo === 'shop' || demo === 'retail') return '/shop/'
  if (demo === 'website' || demo === 'site') return '/website/'
  if (demo === 'ecommerce' || demo === 'storefront' || demo === 'online-orders') return '/ecommerce/'
  if (visionPreviewEnabled && (demo === 'vision' || demo === 'computer-vision')) return '/vision/'
  return null
}

function setupProductFromQuery(value: string | null) {
  const product = value?.toLowerCase()
  if (product === 'shop' || product === 'commerce') return 'commerce' as const
  if (product === 'plant' || product === 'production') return 'production' as const
  if (product === 'website' || product === 'ecommerce') return product
  return null
}

function LegacyEntryRedirect() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const route = productDemoPath(params.get('demo'))

  return <Navigate replace to={route ?? '/'} />
}

function SettingsEntry() {
  const location = useLocation()
  const product = setupProductFromQuery(new URLSearchParams(location.search).get('product'))

  if (product) {
    return <Suspense fallback={<ProductLoading name="setup" />}><ProductOnboardingPage product={product} /></Suspense>
  }

  if (location.hash === '#controls' || location.hash === '#workspace-recovery') {
    return <Suspense fallback={<ProductLoading name="controls" />}><WorkspaceControlsPage /></Suspense>
  }

  return <Navigate replace to="/" />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<CoreLayout />}>
          <Route element={<ProductHomeEntry productDemoPath={productDemoPath} />} index />
          <Route element={<Suspense fallback={<ProductLoading name="Shop" />}><OperationsPage product="commerce" /></Suspense>} path="shop/*" />
          <Route element={<Suspense fallback={<ProductLoading name="Plant" />}><OperationsPage product="production" /></Suspense>} path="plant/*" />
          <Route element={<Suspense fallback={<ProductLoading name="Website" />}><WebsiteProduct /></Suspense>} path="website/*" />
          <Route element={<Suspense fallback={<ProductLoading name="Ecommerce" />}><EcommerceProduct /></Suspense>} path="ecommerce/*" />
          {visionPreviewEnabled && VisionProduct ? <Route element={<Suspense fallback={<ProductLoading name="Vision" />}><VisionProduct /></Suspense>} path="vision/*" /> : null}
          <Route element={<Navigate replace to="/shop/" />} path="operations/commerce/*" />
          <Route element={<Navigate replace to="/plant/" />} path="operations/production/*" />
          <Route element={<Navigate replace to="/" />} path="operations/*" />
          <Route element={<Navigate replace to="/" />} path="work/*" />
          <Route element={<Navigate replace to="/website/" />} path="products/website/*" />
          <Route element={<Navigate replace to="/ecommerce/" />} path="products/ecommerce/*" />
          <Route element={<SettingsEntry />} path="settings/*" />
          {import.meta.env.DEV ? <Route element={<Suspense fallback={<ProductLoading name="builder" />}><SettingsPage /></Suspense>} path="internal/client-builder/*" /> : null}
          <Route element={<LegacyEntryRedirect />} path="legacy-entry" />
          <Route element={<Navigate replace to="/" />} path="agents/*" />
          <Route element={<Navigate replace to="/" />} path="assist/*" />
          <Route element={<Navigate replace to="/" />} path="setup/*" />
          <Route element={<Navigate replace to="/settings/#controls" />} path="trust/*" />
          <Route element={<Navigate replace to="/" />} path="app/*" />
          <Route element={<Suspense fallback={<ProductLoading name="login" />}><ManagedLoginPage /></Suspense>} path="login" />
          <Route element={<Suspense fallback={<ProductLoading name="recovery" />}><ManagedAccountPage /></Suspense>} path="account/recovery" />
          <Route element={<Suspense fallback={<ProductLoading name="account" />}><ManagedAccountPage /></Suspense>} path="account/setup" />
          <Route element={<Suspense fallback={<ProductLoading name="trial" />}><SignupPage /></Suspense>} path="signup" />
          <Route element={<Navigate replace to="/" />} path="*" />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
