import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import {
  AgentsPage,
  CoreLayout,
  OperationsPage,
  OverviewPage,
  SettingsPage,
} from './core/CoreApp'

function LegacyEntryRedirect() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const demo = params.get('demo')?.toLowerCase()

  if (demo === 'plant' || demo === 'factory') return <Navigate replace to="/operations/?view=plant" />
  if (demo === 'shop' || demo === 'retail') return <Navigate replace to="/operations/?view=shop" />
  return <Navigate replace to="/" />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<CoreLayout />}>
          <Route element={<OverviewPage />} index />
          <Route element={<OperationsPage />} path="operations/*" />
          <Route element={<AgentsPage />} path="agents/*" />
          <Route element={<SettingsPage />} path="settings/*" />
          <Route element={<LegacyEntryRedirect />} path="legacy-entry" />
          <Route element={<Navigate replace to="/operations/?view=shop" />} path="shop/*" />
          <Route element={<Navigate replace to="/operations/?view=plant" />} path="plant/*" />
          <Route element={<Navigate replace to="/agents/" />} path="assist/*" />
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
