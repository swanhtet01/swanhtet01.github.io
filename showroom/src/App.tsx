import { Suspense, lazy, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppFrame } from './components/AppFrame'
import { RouteEffects } from './components/RouteEffects'
import { SiteFrame } from './components/SiteFrame'
import { hasLiveWorkspaceApp } from './lib/workspaceApi'
import { getTenantConfig } from './lib/tenantConfig'

const ActionBoardPage = lazy(() => import('./pages/ActionBoardPage').then((module) => ({ default: module.ActionBoardPage })))
const AppLaunchpadPage = lazy(() => import('./pages/AppLaunchpadPage').then((module) => ({ default: module.AppLaunchpadPage })))
const AgentWorkspacePage = lazy(() => import('./pages/AgentWorkspacePage').then((module) => ({ default: module.AgentWorkspacePage })))
const AdoptionCommandPage = lazy(() => import('./pages/AdoptionCommandPage').then((module) => ({ default: module.AdoptionCommandPage })))
const AdoptionPlaybookPage = lazy(() => import('./pages/AdoptionPlaybookPage').then((module) => ({ default: module.AdoptionPlaybookPage })))
const AppHomeRedirectPage = lazy(() => import('./pages/AppHomeRedirectPage').then((module) => ({ default: module.AppHomeRedirectPage })))
const AgentTeamsPage = lazy(() => import('./pages/AgentTeamsPage').then((module) => ({ default: module.AgentTeamsPage })))
const ApprovalQueuePage = lazy(() => import('./pages/ApprovalQueuePage').then((module) => ({ default: module.ApprovalQueuePage })))
const BuildStudioPage = lazy(() => import('./pages/BuildStudioPage').then((module) => ({ default: module.BuildStudioPage })))
const CloudOpsPage = lazy(() => import('./pages/CloudOpsPage').then((module) => ({ default: module.CloudOpsPage })))
const ConnectorOpsPage = lazy(() => import('./pages/ConnectorOpsPage').then((module) => ({ default: module.ConnectorOpsPage })))
const ContactPage = lazy(() => import('./pages/ContactPage').then((module) => ({ default: module.ContactPage })))
const DataFabricPage = lazy(() => import('./pages/DataFabricPage').then((module) => ({ default: module.DataFabricPage })))
const DecisionJournalPage = lazy(() => import('./pages/DecisionJournalPage').then((module) => ({ default: module.DecisionJournalPage })))
const DemoCenterPage = lazy(() => import('./pages/DemoCenterPage').then((module) => ({ default: module.DemoCenterPage })))
const DirectorDashboardPage = lazy(() => import('./pages/DirectorDashboardPage').then((module) => ({ default: module.DirectorDashboardPage })))
const DQMSDeskPage = lazy(() => import('./pages/DQMSDeskPage').then((module) => ({ default: module.DQMSDeskPage })))
const DocumentIntakePage = lazy(() => import('./pages/DocumentIntakePage').then((module) => ({ default: module.DocumentIntakePage })))
const ExceptionQueuePage = lazy(() => import('./pages/ExceptionQueuePage').then((module) => ({ default: module.ExceptionQueuePage })))
const FoundryReleaseDeskPage = lazy(() => import('./pages/FoundryReleaseDeskPage').then((module) => ({ default: module.FoundryReleaseDeskPage })))
const HomePage = lazy(() => import('./pages/HomePage').then((module) => ({ default: module.HomePage })))
const InsightsPage = lazy(() => import('./pages/InsightsPage').then((module) => ({ default: module.InsightsPage })))
const InventoryPulsePage = lazy(() => import('./pages/InventoryPulsePage').then((module) => ({ default: module.InventoryPulsePage })))
const LeadFinderPage = lazy(() => import('./pages/LeadFinderPage').then((module) => ({ default: module.LeadFinderPage })))
const LeadPipelinePage = lazy(() => import('./pages/LeadPipelinePage').then((module) => ({ default: module.LeadPipelinePage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })))
const MetricIntakePage = lazy(() => import('./pages/MetricIntakePage').then((module) => ({ default: module.MetricIntakePage })))
const MaintenanceDeskPage = lazy(() => import('./pages/MaintenanceDeskPage').then((module) => ({ default: module.MaintenanceDeskPage })))
const MetaWorkspacePage = lazy(() => import('./pages/MetaWorkspacePage').then((module) => ({ default: module.MetaWorkspacePage })))
const ModelOpsPage = lazy(() => import('./pages/ModelOpsPage').then((module) => ({ default: module.ModelOpsPage })))
const NewsBriefPage = lazy(() => import('./pages/NewsBriefPage').then((module) => ({ default: module.NewsBriefPage })))
const KnowledgeControlPage = lazy(() => import('./pages/KnowledgeControlPage').then((module) => ({ default: module.KnowledgeControlPage })))
const LabPage = lazy(() => import('./pages/LabPage').then((module) => ({ default: module.LabPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))
const PlatformAdminPage = lazy(() => import('./pages/PlatformAdminPage').then((module) => ({ default: module.PlatformAdminPage })))
const PlatformNarrativePage = lazy(() => import('./pages/PlatformNarrativePage').then((module) => ({ default: module.PlatformNarrativePage })))
const PolicyControlPage = lazy(() => import('./pages/PolicyControlPage').then((module) => ({ default: module.PolicyControlPage })))
const ProductOperationsPage = lazy(() => import('./pages/ProductOperationsPage').then((module) => ({ default: module.ProductOperationsPage })))
const RuntimeOverviewPage = lazy(() => import('./pages/RuntimeOverviewPage').then((module) => ({ default: module.RuntimeOverviewPage })))
const SalesDeskPage = lazy(() => import('./pages/SalesDeskPage').then((module) => ({ default: module.SalesDeskPage })))
const ProductsPage = lazy(() => import('./pages/ProductsPage').then((module) => ({ default: module.ProductsPage })))
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage').then((module) => ({ default: module.ProductDetailPage })))
const OperationsDeskPage = lazy(() => import('./pages/OperationsDeskPage').then((module) => ({ default: module.OperationsDeskPage })))
const PackagesPage = lazy(() => import('./pages/PackagesPage').then((module) => ({ default: module.PackagesPage })))
const PilotCommandPage = lazy(() => import('./pages/PilotCommandPage').then((module) => ({ default: module.PilotCommandPage })))
const PlantManagerPage = lazy(() => import('./pages/PlantManagerPage').then((module) => ({ default: module.PlantManagerPage })))
const PublicLeadFinderPage = lazy(() => import('./pages/PublicLeadFinderPage').then((module) => ({ default: module.PublicLeadFinderPage })))
const ReceivingControlPage = lazy(() => import('./pages/ReceivingControlPage').then((module) => ({ default: module.ReceivingControlPage })))
const SignupPage = lazy(() => import('./pages/SignupPage').then((module) => ({ default: module.SignupPage })))
const SolutionArchitectPage = lazy(() => import('./pages/SolutionArchitectPage').then((module) => ({ default: module.SolutionArchitectPage })))
const TenantPortalHomePage = lazy(() => import('./pages/TenantPortalHomePage').then((module) => ({ default: module.TenantPortalHomePage })))
const WorkspaceLitePage = lazy(() => import('./pages/WorkspaceLitePage').then((module) => ({ default: module.WorkspaceLitePage })))
const WorkspaceOnboardingPage = lazy(() => import('./pages/WorkspaceOnboardingPage').then((module) => ({ default: module.WorkspaceOnboardingPage })))
const WorkspacePage = lazy(() => import('./pages/WorkspacePage').then((module) => ({ default: module.WorkspacePage })))
const WorkbenchPage = lazy(() => import('./pages/WorkbenchPage').then((module) => ({ default: module.WorkbenchPage })))
const WorkforceCommandPage = lazy(() => import('./pages/WorkforceCommandPage').then((module) => ({ default: module.WorkforceCommandPage })))
const YangonTyrePage = lazy(() => import('./pages/YangonTyrePage').then((module) => ({ default: module.YangonTyrePage })))
const SecurityControlPage = lazy(() => import('./pages/SecurityControlPage').then((module) => ({ default: module.SecurityControlPage })))
const ServiceDeskPage = lazy(() => import('./pages/ServiceDeskPage').then((module) => ({ default: module.ServiceDeskPage })))
const SupermegaDevPage = lazy(() => import('./pages/SupermegaDevPage').then((module) => ({ default: module.SupermegaDevPage })))

function routeElement(element: ReactNode) {
  return <Suspense fallback={<div className="sm-chip text-white">Loading page...</div>}>{element}</Suspense>
}

function App() {
  const liveAppAvailable = hasLiveWorkspaceApp()
  const tenant = getTenantConfig()
  const publicWorkspaceFallback = tenant.key === 'ytf-plant-a' ? '/receiving-log' : '/company-list'
  const homeElement = tenant.key === 'ytf-plant-a' ? <Navigate replace to="/app/portal" /> : routeElement(<HomePage />)

  return (
    <BrowserRouter>
      <RouteEffects />
      <Routes>
        <Route element={<SiteFrame />} path="/">
          <Route element={homeElement} index />
          <Route element={routeElement(<PlatformNarrativePage />)} path="platform" />
          <Route element={<Navigate replace to="/clients/yangon-tyre" />} path="proof" />
          <Route element={routeElement(<DemoCenterPage />)} path="demo-center" />
          <Route element={<Navigate replace to="/clients/yangon-tyre" />} path="portfolio" />
          <Route element={<Navigate replace to="/products" />} path="solutions" />
          <Route element={<Navigate replace to="/products" />} path="agents" />
          <Route element={<Navigate replace to="/products" />} path="factory" />
          <Route element={routeElement(<YangonTyrePage />)} path="clients/yangon-tyre" />
          <Route element={<Navigate replace to="/clients/yangon-tyre" />} path="ytf" />
          <Route element={routeElement(<ProductsPage />)} path="products" />
          <Route element={routeElement(<PackagesPage />)} path="packages" />
          <Route element={<Navigate replace to="/products" />} path="software" />
          <Route element={<Navigate replace to="/packages" />} path="pricing" />
          <Route element={<Navigate replace to="/packages" />} path="plans" />
          <Route element={<Navigate replace to="/platform" />} path="implementation" />
          <Route element={<Navigate replace to="/platform" />} path="how-it-works" />
          <Route element={routeElement(<ProductDetailPage />)} path="products/:productId" />
          <Route element={<Navigate replace to="/products" />} path="work" />
          <Route element={<Navigate replace to="/platform" />} path="systems" />
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
          <Route element={routeElement(<AppHomeRedirectPage />)} index />
          <Route element={routeElement(<AppLaunchpadPage />)} path="start" />
          <Route element={routeElement(<TenantPortalHomePage />)} path="portal" />
          <Route element={routeElement(<AdoptionCommandPage />)} path="adoption-command" />
          <Route element={routeElement(<AdoptionPlaybookPage />)} path="adoption" />
          <Route element={routeElement(<PilotCommandPage />)} path="pilot" />
          <Route element={routeElement(<DataFabricPage />)} path="data-fabric" />
          <Route element={routeElement(<CloudOpsPage />)} path="cloud" />
          <Route element={routeElement(<SupermegaDevPage />)} path="supermega-dev" />
          <Route element={routeElement(<ModelOpsPage />)} path="model-ops" />
          <Route element={routeElement(<AgentWorkspacePage />)} path="agent-space" />
          <Route element={routeElement(<WorkforceCommandPage />)} path="workforce" />
          <Route element={routeElement(<WorkbenchPage />)} path="workbench" />
          <Route element={<Navigate replace to="/app/meta" />} path="overview" />
          <Route element={routeElement(<MetaWorkspacePage />)} path="meta" />
          <Route element={routeElement(<InsightsPage />)} path="insights" />
          <Route element={routeElement(<DirectorDashboardPage />)} path="director" />
          <Route element={routeElement(<PlantManagerPage />)} path="plant-manager" />
          <Route element={routeElement(<OperationsDeskPage />)} path="operations" />
          <Route element={<Navigate replace to="/app/plant-manager" />} path="manager-system" />
          <Route element={routeElement(<DQMSDeskPage />)} path="dqms" />
          <Route element={routeElement(<MaintenanceDeskPage />)} path="maintenance" />
          <Route element={routeElement(<WorkspacePage />)} path="actions" />
          <Route element={routeElement(<WorkspaceOnboardingPage />)} path="onboarding" />
          <Route element={routeElement(<DecisionJournalPage />)} path="decisions" />
          <Route element={routeElement(<ApprovalQueuePage />)} path="approvals" />
          <Route element={routeElement(<ExceptionQueuePage />)} path="exceptions" />
          <Route element={routeElement(<AgentTeamsPage />)} path="teams" />
          <Route element={routeElement(<SalesDeskPage />)} path="revenue" />
          <Route element={routeElement(<LeadPipelinePage />)} path="revenue/pipeline" />
          <Route element={routeElement(<LeadFinderPage />)} path="revenue/prospecting" />
          <Route element={<Navigate replace to="/app/revenue" />} path="sales" />
          <Route element={<Navigate replace to="/app/revenue/pipeline" />} path="sales/pipeline" />
          <Route element={<Navigate replace to="/app/revenue/prospecting" />} path="sales/prospecting" />
          <Route element={<Navigate replace to="/app/revenue" />} path="leads" />
          <Route element={routeElement(<LeadFinderPage />)} path="leads/advanced" />
          <Route element={routeElement(<MetricIntakePage />)} path="intake" />
          <Route element={routeElement(<ReceivingControlPage />)} path="receiving" />
          <Route element={routeElement(<InventoryPulsePage />)} path="inventory" />
          <Route element={routeElement(<NewsBriefPage />)} path="news" />
          <Route element={routeElement(<RuntimeOverviewPage />)} path="runtime" />
          <Route element={routeElement(<ActionBoardPage />)} path="action-board" />
          <Route element={routeElement(<ServiceDeskPage />)} path="service-desk" />
          <Route element={routeElement(<DocumentIntakePage />)} path="documents" />
          <Route element={routeElement(<LabPage />)} path="lab" />
          <Route element={routeElement(<SolutionArchitectPage />)} path="architect" />
          <Route element={routeElement(<FoundryReleaseDeskPage />)} path="foundry" />
          <Route element={routeElement(<BuildStudioPage />)} path="factory" />
          <Route element={routeElement(<ProductOperationsPage />)} path="product-ops" />
          <Route element={routeElement(<PlatformAdminPage />)} path="platform-admin" />
          <Route element={<Navigate replace to="/app/platform-admin" />} path="tenant-admin" />
          <Route element={routeElement(<SecurityControlPage />)} path="security" />
          <Route element={routeElement(<ConnectorOpsPage />)} path="connectors" />
          <Route element={routeElement(<KnowledgeControlPage />)} path="knowledge" />
          <Route element={routeElement(<PolicyControlPage />)} path="policies" />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
