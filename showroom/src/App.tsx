import { Suspense, lazy, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppFrame } from './components/AppFrame'
import { RouteEffects } from './components/RouteEffects'
import { SiteFrame } from './components/SiteFrame'
import { hasLiveWorkspaceApp } from './lib/workspaceApi'
import { getTenantConfig } from './lib/tenantConfig'

const ActionBoardPage = lazy(() => import('./pages/ActionBoardPage').then((module) => ({ default: module.ActionBoardPage })))
const AgentsPage = lazy(() => import('./pages/AgentsPage').then((module) => ({ default: module.AgentsPage })))
const AgentTeamsPage = lazy(() => import('./pages/AgentTeamsPage').then((module) => ({ default: module.AgentTeamsPage })))
const ApprovalQueuePage = lazy(() => import('./pages/ApprovalQueuePage').then((module) => ({ default: module.ApprovalQueuePage })))
const BuildStudioPage = lazy(() => import('./pages/BuildStudioPage').then((module) => ({ default: module.BuildStudioPage })))
const ConnectorOpsPage = lazy(() => import('./pages/ConnectorOpsPage').then((module) => ({ default: module.ConnectorOpsPage })))
const ContactPage = lazy(() => import('./pages/ContactPage').then((module) => ({ default: module.ContactPage })))
const DecisionJournalPage = lazy(() => import('./pages/DecisionJournalPage').then((module) => ({ default: module.DecisionJournalPage })))
const DirectorDashboardPage = lazy(() => import('./pages/DirectorDashboardPage').then((module) => ({ default: module.DirectorDashboardPage })))
const DocumentIntakePage = lazy(() => import('./pages/DocumentIntakePage').then((module) => ({ default: module.DocumentIntakePage })))
const ExceptionQueuePage = lazy(() => import('./pages/ExceptionQueuePage').then((module) => ({ default: module.ExceptionQueuePage })))
const HomePage = lazy(() => import('./pages/HomePage').then((module) => ({ default: module.HomePage })))
const InsightsPage = lazy(() => import('./pages/InsightsPage').then((module) => ({ default: module.InsightsPage })))
const InventoryPulsePage = lazy(() => import('./pages/InventoryPulsePage').then((module) => ({ default: module.InventoryPulsePage })))
const LeadFinderPage = lazy(() => import('./pages/LeadFinderPage').then((module) => ({ default: module.LeadFinderPage })))
const LeadPipelinePage = lazy(() => import('./pages/LeadPipelinePage').then((module) => ({ default: module.LeadPipelinePage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })))
const MetricIntakePage = lazy(() => import('./pages/MetricIntakePage').then((module) => ({ default: module.MetricIntakePage })))
const NewsBriefPage = lazy(() => import('./pages/NewsBriefPage').then((module) => ({ default: module.NewsBriefPage })))
const KnowledgeControlPage = lazy(() => import('./pages/KnowledgeControlPage').then((module) => ({ default: module.KnowledgeControlPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))
const PlatformNarrativePage = lazy(() => import('./pages/PlatformNarrativePage').then((module) => ({ default: module.PlatformNarrativePage })))
const PlatformAdminPage = lazy(() => import('./pages/PlatformAdminPage').then((module) => ({ default: module.PlatformAdminPage })))
const PolicyControlPage = lazy(() => import('./pages/PolicyControlPage').then((module) => ({ default: module.PolicyControlPage })))
const ProductsPage = lazy(() => import('./pages/ProductsPage').then((module) => ({ default: module.ProductsPage })))
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage').then((module) => ({ default: module.ProductDetailPage })))
const PublicLeadFinderPage = lazy(() => import('./pages/PublicLeadFinderPage').then((module) => ({ default: module.PublicLeadFinderPage })))
const ReceivingControlPage = lazy(() => import('./pages/ReceivingControlPage').then((module) => ({ default: module.ReceivingControlPage })))
const SignupPage = lazy(() => import('./pages/SignupPage').then((module) => ({ default: module.SignupPage })))
const SolutionArchitectPage = lazy(() => import('./pages/SolutionArchitectPage').then((module) => ({ default: module.SolutionArchitectPage })))
const WorkbenchPage = lazy(() => import('./pages/WorkbenchPage').then((module) => ({ default: module.WorkbenchPage })))
const WorkspaceLitePage = lazy(() => import('./pages/WorkspaceLitePage').then((module) => ({ default: module.WorkspaceLitePage })))
const WorkspacePage = lazy(() => import('./pages/WorkspacePage').then((module) => ({ default: module.WorkspacePage })))
const YangonTyrePage = lazy(() => import('./pages/YangonTyrePage').then((module) => ({ default: module.YangonTyrePage })))
const ProductPortfolioPage = lazy(() => import('./pages/ProductPortfolioPage').then((module) => ({ default: module.ProductPortfolioPage })))

function routeElement(element: ReactNode) {
  return <Suspense fallback={<div className="sm-chip text-white">Loading page...</div>}>{element}</Suspense>
}

function App() {
  const liveAppAvailable = hasLiveWorkspaceApp()
  const tenant = getTenantConfig()
  const publicWorkspaceFallback = tenant.key === 'ytf-plant-a' ? '/receiving-log' : '/company-list'
  const homeElement = tenant.key === 'ytf-plant-a' ? routeElement(<YangonTyrePage />) : routeElement(<HomePage />)

  return (
    <BrowserRouter>
      <RouteEffects />
      <Routes>
        <Route element={<SiteFrame />} path="/">
          <Route element={homeElement} index />
          <Route element={routeElement(<PlatformNarrativePage />)} path="platform" />
          <Route element={routeElement(<ProductPortfolioPage />)} path="portfolio" />
          <Route element={<Navigate replace to="/platform" />} path="solutions" />
          <Route element={routeElement(<AgentsPage />)} path="agents" />
          <Route element={routeElement(<BuildStudioPage />)} path="factory" />
          <Route element={routeElement(<YangonTyrePage />)} path="clients/yangon-tyre" />
          <Route element={<Navigate replace to="/clients/yangon-tyre" />} path="ytf" />
          <Route element={routeElement(<ProductsPage />)} path="products" />
          <Route element={<Navigate replace to="/products" />} path="software" />
          <Route element={<Navigate replace to="/platform" />} path="how-it-works" />
          <Route element={routeElement(<ProductDetailPage />)} path="products/:productId" />
          <Route element={<Navigate replace to="/products" />} path="work" />
          <Route element={<Navigate replace to="/products" />} path="systems" />
          <Route element={<Navigate replace to="/products" />} path="templates" />
          <Route element={routeElement(<PublicLeadFinderPage />)} path="find-companies" />
          <Route element={<Navigate replace to="/find-companies" />} path="lead-finder" />
          <Route element={routeElement(<WorkspaceLitePage />)} path="company-list" />
          <Route element={<Navigate replace to="/company-list" />} path="saved-companies" />
          <Route element={routeElement(<WorkspaceLitePage />)} path="task-list" />
          <Route element={<Navigate replace to="/task-list" />} path="daily-tasks" />
          <Route element={routeElement(<WorkspaceLitePage />)} path="receiving-log" />
          <Route element={<Navigate replace to="/receiving-log" />} path="receiving" />
          <Route element={<Navigate replace to="/task-list" />} path="action-os" />
          <Route element={<Navigate replace to="/company-list" />} path="workspace" />
          <Route element={liveAppAvailable ? routeElement(<LoginPage />) : <Navigate replace to={publicWorkspaceFallback} />} path="login" />
          <Route element={liveAppAvailable ? routeElement(<SignupPage />) : <Navigate replace to={publicWorkspaceFallback} />} path="signup" />
          <Route element={routeElement(<ContactPage />)} path="contact" />
          <Route element={<Navigate replace to="/contact" />} path="book" />
          <Route element={routeElement(<NotFoundPage />)} path="*" />
        </Route>
        <Route element={<AppFrame />} path="/app">
          <Route element={<Navigate replace to="actions" />} index />
          <Route element={routeElement(<WorkbenchPage />)} path="overview" />
          <Route element={routeElement(<InsightsPage />)} path="insights" />
          <Route element={routeElement(<DirectorDashboardPage />)} path="director" />
          <Route element={routeElement(<WorkspacePage />)} path="actions" />
          <Route element={routeElement(<DecisionJournalPage />)} path="decisions" />
          <Route element={routeElement(<ApprovalQueuePage />)} path="approvals" />
          <Route element={routeElement(<ExceptionQueuePage />)} path="exceptions" />
          <Route element={routeElement(<AgentTeamsPage />)} path="teams" />
          <Route element={routeElement(<LeadPipelinePage />)} path="sales" />
          <Route element={<Navigate replace to="/app/sales" />} path="leads" />
          <Route element={routeElement(<LeadFinderPage />)} path="leads/advanced" />
          <Route element={routeElement(<MetricIntakePage />)} path="intake" />
          <Route element={routeElement(<ReceivingControlPage />)} path="receiving" />
          <Route element={routeElement(<InventoryPulsePage />)} path="inventory" />
          <Route element={routeElement(<NewsBriefPage />)} path="news" />
          <Route element={routeElement(<ActionBoardPage />)} path="action-board" />
          <Route element={routeElement(<DocumentIntakePage />)} path="documents" />
          <Route element={routeElement(<SolutionArchitectPage />)} path="architect" />
          <Route element={routeElement(<BuildStudioPage />)} path="factory" />
          <Route element={routeElement(<PlatformAdminPage />)} path="platform-admin" />
          <Route element={<Navigate replace to="/app/platform-admin" />} path="tenant-admin" />
          <Route element={routeElement(<PolicyControlPage />)} path="security" />
          <Route element={routeElement(<ConnectorOpsPage />)} path="connectors" />
          <Route element={routeElement(<KnowledgeControlPage />)} path="knowledge" />
          <Route element={routeElement(<PolicyControlPage />)} path="policies" />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
