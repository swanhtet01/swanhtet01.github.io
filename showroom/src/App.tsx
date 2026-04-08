import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppFrame } from './components/AppFrame'
import { RouteEffects } from './components/RouteEffects'
import { SiteFrame } from './components/SiteFrame'
import { ActionBoardPage } from './pages/ActionBoardPage'
import { AgentTeamsPage } from './pages/AgentTeamsPage'
import { ApprovalQueuePage } from './pages/ApprovalQueuePage'
import { ContactPage } from './pages/ContactPage'
import { DataVisibilityPage } from './pages/DataVisibilityPage'
import { DecisionJournalPage } from './pages/DecisionJournalPage'
import { DemoDetailPage } from './pages/DemoDetailPage'
import { DemosPage } from './pages/DemosPage'
import { DirectorDashboardPage } from './pages/DirectorDashboardPage'
import { DocumentIntakePage } from './pages/DocumentIntakePage'
import { ExceptionQueuePage } from './pages/ExceptionQueuePage'
import { FounderControlPlanePage } from './pages/FounderControlPlanePage'
import { HomePage } from './pages/HomePage'
import { InsightsPage } from './pages/InsightsPage'
import { InventoryPulsePage } from './pages/InventoryPulsePage'
import { LeadFinderPage } from './pages/LeadFinderPage'
import { LeadPipelinePage } from './pages/LeadPipelinePage'
import { LoginPage } from './pages/LoginPage'
import { MetricIntakePage } from './pages/MetricIntakePage'
import { NewsBriefPage } from './pages/NewsBriefPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProductsPage } from './pages/ProductsPage'
import { ProductDetailPage } from './pages/ProductDetailPage'
import { PublicLeadFinderPage } from './pages/PublicLeadFinderPage'
import { PortalStudioPage } from './pages/PortalStudioPage'
import { ReceivingControlPage } from './pages/ReceivingControlPage'
import { SignupPage } from './pages/SignupPage'
import { SolutionArchitectPage } from './pages/SolutionArchitectPage'
import { WorkspaceLitePage } from './pages/WorkspaceLitePage'
import { WorkspacePage } from './pages/WorkspacePage'
import { hasLiveWorkspaceApp } from './lib/workspaceApi'
import { getTenantConfig } from './lib/tenantConfig'

function App() {
  const liveAppAvailable = hasLiveWorkspaceApp()
  const tenant = getTenantConfig()
  const publicWorkspaceFallback = tenant.key === 'ytf-plant-a' ? '/receiving-log' : '/company-list'

  return (
    <BrowserRouter>
      <RouteEffects />
      <Routes>
        <Route element={<SiteFrame />} path="/">
          <Route element={<HomePage />} index />
          <Route element={<Navigate replace to="/products" />} path="systems" />
          <Route element={<ProductsPage />} path="products" />
          <Route element={<Navigate replace to="/products/sales-system" />} path="products/distributor-sales-desk" />
          <Route element={<Navigate replace to="/products/operations-inbox" />} path="products/list-cleanup-desk" />
          <Route element={<Navigate replace to="/products/operations-inbox" />} path="products/receiving-control" />
          <Route element={<ProductDetailPage />} path="products/:productId" />
          <Route element={<DemosPage />} path="demos" />
          <Route element={<DemoDetailPage />} path="demos/:demoId" />
          <Route element={<Navigate replace to="/products" />} path="work" />
          <Route element={<Navigate replace to="/products" />} path="templates" />
          <Route element={<PublicLeadFinderPage />} path="find-companies" />
          <Route element={<Navigate replace to="/find-companies" />} path="lead-finder" />
          <Route element={<WorkspaceLitePage />} path="company-list" />
          <Route element={<Navigate replace to="/company-list" />} path="saved-companies" />
          <Route element={<WorkspaceLitePage />} path="task-list" />
          <Route element={<Navigate replace to="/task-list" />} path="sort-updates" />
          <Route element={<Navigate replace to="/task-list" />} path="daily-tasks" />
          <Route element={<WorkspaceLitePage />} path="receiving-log" />
          <Route element={<Navigate replace to="/receiving-log" />} path="receiving" />
          <Route element={<Navigate replace to="/task-list" />} path="action-os" />
          <Route element={<Navigate replace to="/company-list" />} path="workspace" />
          <Route element={liveAppAvailable ? <LoginPage /> : <Navigate replace to={publicWorkspaceFallback} />} path="login" />
          <Route element={liveAppAvailable ? <SignupPage /> : <Navigate replace to={publicWorkspaceFallback} />} path="signup" />
          <Route element={<ContactPage />} path="contact" />
          <Route element={<Navigate replace to="/contact" />} path="book" />
          <Route element={<NotFoundPage />} path="*" />
        </Route>
        <Route element={<AppFrame />} path="/app">
          <Route element={<Navigate replace to="hq" />} index />
          <Route element={<FounderControlPlanePage />} path="control-plane" />
          <Route element={<PortalStudioPage />} path="portal-studio" />
          <Route element={<DirectorDashboardPage />} path="hq" />
          <Route element={<LeadPipelinePage />} path="deals" />
          <Route element={<WorkspacePage />} path="workflows" />
          <Route element={<DataVisibilityPage />} path="data" />
          <Route element={<AgentTeamsPage />} path="agents" />
          <Route element={<DecisionJournalPage />} path="company" />
          <Route element={<Navigate replace to="/app/portal-studio" />} path="portals" />
          <Route element={<Navigate replace to="/app/portal-studio" />} path="portal-builder" />
          <Route element={<Navigate replace to="/app/control-plane" />} path="dev-desk" />
          <Route element={<Navigate replace to="/app/control-plane" />} path="control" />
          <Route element={<Navigate replace to="/app/control-plane" />} path="meta" />
          <Route element={<Navigate replace to="/app/hq" />} path="overview" />
          <Route element={<InsightsPage />} path="insights" />
          <Route element={<Navigate replace to="/app/hq" />} path="director" />
          <Route element={<Navigate replace to="/app/workflows" />} path="actions" />
          <Route element={<Navigate replace to="/app/data" />} path="connectors" />
          <Route element={<Navigate replace to="/app/data" />} path="memory" />
          <Route element={<Navigate replace to="/app/data" />} path="sources" />
          <Route element={<Navigate replace to="/app/company" />} path="decisions" />
          <Route element={<ApprovalQueuePage />} path="approvals" />
          <Route element={<ExceptionQueuePage />} path="exceptions" />
          <Route element={<Navigate replace to="/app/agents" />} path="teams" />
          <Route element={<Navigate replace to="/app/deals" />} path="sales" />
          <Route element={<Navigate replace to="/app/deals" />} path="leads" />
          <Route element={<LeadFinderPage />} path="leads/advanced" />
          <Route element={<MetricIntakePage />} path="intake" />
          <Route element={<ReceivingControlPage />} path="receiving" />
          <Route element={<InventoryPulsePage />} path="inventory" />
          <Route element={<NewsBriefPage />} path="news" />
          <Route element={<ActionBoardPage />} path="action-board" />
          <Route element={<DocumentIntakePage />} path="documents" />
          <Route element={<SolutionArchitectPage />} path="architect" />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
