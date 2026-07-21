import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import {
  AssistPage,
  CoreLayout,
  OverviewPage,
  PlantPage,
  SetupPage,
  ShopPage,
  TrustPage,
} from './core/CoreApp'

function LegacyRedirect() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const demo = params.get('demo')?.toLowerCase()

  if (demo === 'shop' || demo === 'retail') return <Navigate replace to="/shop/" />
  if (demo === 'plant' || demo === 'factory') return <Navigate replace to="/plant/" />
  return <Navigate replace to="/" />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<CoreLayout />}>
          <Route element={<LegacyRedirect />} path="/legacy-entry" />
          <Route element={<OverviewPage />} index />
          <Route element={<ShopPage />} path="shop/*" />
          <Route element={<PlantPage />} path="plant/*" />
          <Route element={<AssistPage />} path="assist/*" />
          <Route element={<SetupPage />} path="setup/*" />
          <Route element={<TrustPage />} path="trust/*" />
          <Route element={<Navigate replace to="/" />} path="app/*" />
          <Route element={<Navigate replace to="/" />} path="login" />
          <Route element={<Navigate replace to="/" />} path="signup" />
          <Route element={<Navigate replace to="/" />} path="*" />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
