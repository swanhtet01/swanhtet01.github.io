import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppFrame } from './components/AppFrame'
import { RouteEffects } from './components/RouteEffects'
import { SiteFrame } from './components/SiteFrame'
import { ActionBoardPage } from './pages/ActionBoardPage'
import { AgentTeamsPage } from './pages/AgentTeamsPage'
import { BookPage } from './pages/BookPage'
import { ApprovalQueuePage } from './pages/ApprovalQueuePage'
import { DecisionJournalPage } from './pages/DecisionJournalPage'
import { DirectorDashboardPage } from './pages/DirectorDashboardPage'
import { DocumentIntakePage } from './pages/DocumentIntakePage'
import { ExceptionQueuePage } from './pages/ExceptionQueuePage'
import { HomePage } from './pages/HomePage'
import { InsightsPage } from './pages/InsightsPage'
import { InventoryPulsePage } from './pages/InventoryPulsePage'
import { LeadFinderPage } from './pages/LeadFinderPage'
import { LeadPipelinePage } from './pages/LeadPipelinePage'
import { LoginPage } from './pages/LoginPage'
import { MetricIntakePage } from './pages/MetricIntakePage'
import { NewsBriefPage } from './pages/NewsBriefPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PublicLeadFinderPage } from './pages/PublicLeadFinderPage'
import { ReceivingControlPage } from './pages/ReceivingControlPage'
import { SignupPage } from './pages/SignupPage'
import { SolutionArchitectPage } from './pages/SolutionArchitectPage'
import { WorkbenchPage } from './pages/WorkbenchPage'
import { WorkspaceLitePage } from './pages/WorkspaceLitePage'
import { WorkspacePage } from './pages/WorkspacePage'
import { hasLiveWorkspaceApp } from './lib/workspaceApi'
import { getTenantConfig } from './lib/tenantConfig'

function App() {
  const liveAppAvailable = hasLiveWorkspaceApp()
  const tenant = getTenantConfig()
  const publicWorkspaceFallback = tenant.key === 'ytf-plant-a' ? '/receiving-log' : '/company-list'
  const bookFallback = tenant.showBookCta ? <BookPage /> : <Navigate replace to={publicWorkspaceFallback} />

  return (
    <BrowserRouter>
      <RouteEffects />
      <Routes>
        <Route element={<SiteFrame />} path="/">
        <Route element={<HomePage />} index />
          <Route element={<PublicLeadFinderPage />} path="find-companies" />
          <Route element={<Navigate replace to="/find-companies" />} path="lead-finder" />
          <Route element={<WorkspaceLitePage />} path="company-list" />
          <Route element={<Navigate replace to="/company-list" />} path="saved-companies" />
          <Route element={<WorkspaceLitePage />} path="task-list" />
          <Route element={<Navigate replace to="/task-list" />} path="daily-tasks" />
          <Route element={<WorkspaceLitePage />} path="receiving-log" />
          <Route element={<Navigate replace to="/receiving-log" />} path="receiving" />
          <Route element={<Navigate replace to="/task-list" />} path="action-os" />
          <Route element={<Navigate replace to="/company-list" />} path="workspace" />
          <Route element={liveAppAvailable ? <LoginPage /> : <Navigate replace to={publicWorkspaceFallback} />} path="login" />
          <Route element={liveAppAvailable ? <SignupPage /> : <Navigate replace to={publicWorkspaceFallback} />} path="signup" />
          <Route element={bookFallback} path="book" />
          <Route element={<NotFoundPage />} path="*" />
        </Route>
        <Route element={<AppFrame />} path="/app">
          <Route element={<Navigate replace to="sales" />} index />
          <Route element={<WorkbenchPage />} path="overview" />
          <Route element={<InsightsPage />} path="insights" />
          <Route element={<DirectorDashboardPage />} path="director" />
          <Route element={<WorkspacePage />} path="actions" />
          <Route element={<DecisionJournalPage />} path="decisions" />
          <Route element={<ApprovalQueuePage />} path="approvals" />
          <Route element={<ExceptionQueuePage />} path="exceptions" />
          <Route element={<AgentTeamsPage />} path="teams" />
          <Route element={<LeadPipelinePage />} path="sales" />
          <Route element={<Navigate replace to="/app/sales" />} path="leads" />
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
