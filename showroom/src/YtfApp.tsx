import { Suspense, lazy, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppFrame } from './components/AppFrame'
import { RouteEffects } from './components/RouteEffects'
import { UiLanguageProvider } from './lib/uiLanguage'

const ActionBoardPage = lazy(() => import('./pages/ActionBoardPage').then((module) => ({ default: module.ActionBoardPage })))
const AppHomeRedirectPage = lazy(() => import('./pages/AppHomeRedirectPage').then((module) => ({ default: module.AppHomeRedirectPage })))
const DailyEntryPage = lazy(() => import('./pages/DailyEntryPage').then((module) => ({ default: module.DailyEntryPage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })))
const ManagerOperatingSystemPage = lazy(() => import('./pages/ManagerOperatingSystemPage').then((module) => ({ default: module.ManagerOperatingSystemPage })))
const PlantManagerPage = lazy(() => import('./pages/PlantManagerPage').then((module) => ({ default: module.PlantManagerPage })))
const PlatformAdminPage = lazy(() => import('./pages/PlatformAdminPage').then((module) => ({ default: module.PlatformAdminPage })))
const YtfCeoReviewPage = lazy(() => import('./pages/YtfCeoReviewPage').then((module) => ({ default: module.YtfCeoReviewPage })))
const YtfErpPage = lazy(() => import('./pages/YtfErpPage').then((module) => ({ default: module.YtfErpPage })))
const YtfLiveDataPage = lazy(() => import('./pages/YtfLiveDataPage').then((module) => ({ default: module.YtfLiveDataPage })))

function routeElement(element: ReactNode) {
  return <Suspense fallback={<div className="sm-route-loading">Loading page...</div>}>{element}</Suspense>
}

function YtfApp() {
  const portalLogin = '/login?next=/app'

  return (
    <UiLanguageProvider>
      <BrowserRouter>
        <RouteEffects />
        <Routes>
          <Route element={<Navigate replace to={portalLogin} />} path="/" />
          <Route element={routeElement(<LoginPage />)} path="/login" />
          <Route element={<AppFrame />} path="/app">
            <Route element={routeElement(<AppHomeRedirectPage />)} index />
            <Route element={routeElement(<AppHomeRedirectPage />)} path="start" />
            <Route element={routeElement(<AppHomeRedirectPage />)} path="portal" />
            <Route element={routeElement(<AppHomeRedirectPage />)} path="system" />
            <Route element={routeElement(<ManagerOperatingSystemPage />)} path="manager-system" />
            <Route element={routeElement(<DailyEntryPage />)} path="daily-entry" />
            <Route element={routeElement(<ActionBoardPage />)} path="action-board" />
            <Route element={routeElement(<ActionBoardPage />)} path="work" />
            <Route element={routeElement(<YtfLiveDataPage />)} path="live-data" />
            <Route element={routeElement(<YtfErpPage />)} path="erp" />
            <Route element={<Navigate replace to="/app/live-data?view=kpi" />} path="data-quality" />
            <Route element={<Navigate replace to="/app/live-data?view=data" />} path="data-fabric" />
            <Route element={<Navigate replace to="/app/live-data?view=data" />} path="documents" />
            <Route element={<Navigate replace to="/app/live-data?view=kpi" />} path="inventory" />
            <Route element={<Navigate replace to="/app/live-data?view=kpi" />} path="revenue" />
            <Route element={routeElement(<PlantManagerPage />)} path="plant-manager" />
            <Route element={routeElement(<YtfCeoReviewPage />)} path="director" />
            <Route element={routeElement(<YtfCeoReviewPage />)} path="ceo" />
            <Route element={routeElement(<PlatformAdminPage />)} path="platform-admin" />
            <Route element={<Navigate replace to="/app/live-data?view=kpi" />} path="ai-stack" />
            <Route element={<Navigate replace to="/app/platform-admin" />} path="users" />
            <Route element={<Navigate replace to="/app/platform-admin" />} path="setup" />
            <Route element={<Navigate replace to="/app/action-board" />} path="email" />
            <Route element={<Navigate replace to="/app/action-board" />} path="connectors" />
            <Route element={<Navigate replace to="/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection" />} path="dqms" />
            <Route element={<Navigate replace to="/app/daily-entry?mode=normal_abnormal&section=QC%20%2F%20inspection" />} path="quality" />
            <Route element={<Navigate replace to="/app/daily-entry?mode=normal_abnormal&section=Maintenance" />} path="maintenance" />
            <Route element={<Navigate replace to="/app/action-board" />} path="actions" />
            <Route element={<Navigate replace to="/app/manager-system" />} path="attendance-payroll" />
            <Route element={<Navigate replace to="/app/manager-system" />} path="*" />
          </Route>
          <Route element={<Navigate replace to={portalLogin} />} path="*" />
        </Routes>
      </BrowserRouter>
    </UiLanguageProvider>
  )
}

export default YtfApp
