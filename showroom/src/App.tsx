import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppFrame } from './components/AppFrame'
import { RouteEffects } from './components/RouteEffects'
import { SiteFrame } from './components/SiteFrame'
import { ActionBoardPage } from './pages/ActionBoardPage'
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

function App() {
  const liveAppAvailable = hasLiveWorkspaceApp()

  return (
    <BrowserRouter>
      <RouteEffects />
      <Routes>
        <Route element={<SiteFrame />} path="/">
          <Route element={<HomePage />} index />
          <Route element={<Navigate replace to="/workspace?view=queue" />} path="action-os" />
          <Route element={<Navigate replace to="/workspace" />} path="platform" />
          <Route element={<Navigate replace to="/workspace" />} path="products" />
          <Route element={<Navigate replace to="/workspace" />} path="solutions" />
          <Route element={<Navigate replace to="/workspace" />} path="lab" />
          <Route element={<PublicLeadFinderPage />} path="lead-finder" />
          <Route element={<WorkspaceLitePage />} path="workspace" />
          <Route element={liveAppAvailable ? <LoginPage /> : <Navigate replace to="/workspace" />} path="login" />
          <Route element={liveAppAvailable ? <SignupPage /> : <Navigate replace to="/workspace" />} path="signup" />
          <Route element={<BookPage />} path="book" />
          <Route element={<Navigate replace to="/workspace" />} path="examples" />
          <Route element={<Navigate replace to="/workspace" />} path="tools" />
          <Route element={<Navigate replace to="/workspace" />} path="demos" />
          <Route element={<Navigate replace to="/workspace" />} path="prototypes" />
          <Route element={<Navigate replace to="/workspace" />} path="try" />
          <Route element={<Navigate replace to="/workspace" />} path="packages" />
          <Route element={<Navigate replace to="/book" />} path="contact" />
          <Route element={<Navigate replace to="/" />} path="home" />
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
