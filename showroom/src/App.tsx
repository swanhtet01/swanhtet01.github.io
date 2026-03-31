import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppFrame } from './components/AppFrame'
import { RouteEffects } from './components/RouteEffects'
import { SiteFrame } from './components/SiteFrame'
import { ActionBoardPage } from './pages/ActionBoardPage'
import { BookPage } from './pages/BookPage'
import { ContactPage } from './pages/ContactPage'
import { ApprovalQueuePage } from './pages/ApprovalQueuePage'
import { DecisionJournalPage } from './pages/DecisionJournalPage'
import { DirectorDashboardPage } from './pages/DirectorDashboardPage'
import { DocumentIntakePage } from './pages/DocumentIntakePage'
import { ExceptionQueuePage } from './pages/ExceptionQueuePage'
import { HomePage } from './pages/HomePage'
import { InsightsPage } from './pages/InsightsPage'
import { InventoryPulsePage } from './pages/InventoryPulsePage'
import { LeadFinderPage } from './pages/LeadFinderPage'
import { LoginPage } from './pages/LoginPage'
import { MetricIntakePage } from './pages/MetricIntakePage'
import { NewsBriefPage } from './pages/NewsBriefPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlatformPage } from './pages/PlatformPage'
import { ReceivingControlPage } from './pages/ReceivingControlPage'
import { SignupPage } from './pages/SignupPage'
import { SolutionArchitectPage } from './pages/SolutionArchitectPage'
import { WorkbenchPage } from './pages/WorkbenchPage'
import { WorkspacePage } from './pages/WorkspacePage'

function App() {
  return (
    <BrowserRouter>
      <RouteEffects />
      <Routes>
        <Route element={<SiteFrame />} path="/">
          <Route element={<HomePage />} index />
          <Route element={<PlatformPage />} path="platform" />
          <Route element={<Navigate replace to="/platform" />} path="products" />
          <Route element={<Navigate replace to="/platform" />} path="solutions" />
          <Route element={<LeadFinderPage />} path="lead-finder" />
          <Route element={<LoginPage />} path="login" />
          <Route element={<SignupPage />} path="signup" />
          <Route element={<BookPage />} path="book" />
          <Route element={<Navigate replace to="/app" />} path="workbench" />
          <Route element={<Navigate replace to="/app/actions" />} path="workspace" />
          <Route element={<Navigate replace to="/app/director" />} path="director" />
          <Route element={<Navigate replace to="/app/insights" />} path="insights" />
          <Route element={<Navigate replace to="/app/decisions" />} path="decisions" />
          <Route element={<Navigate replace to="/app/approvals" />} path="approvals" />
          <Route element={<Navigate replace to="/app/exceptions" />} path="exceptions" />
          <Route element={<Navigate replace to="/app/intake" />} path="ops-intake" />
          <Route element={<Navigate replace to="/app/intake" />} path="metric-intake" />
          <Route element={<Navigate replace to="/app/receiving" />} path="receiving-control" />
          <Route element={<Navigate replace to="/app/inventory" />} path="inventory-pulse" />
          <Route element={<Navigate replace to="/app/news" />} path="news-brief" />
          <Route element={<Navigate replace to="/app/action-board" />} path="action-board" />
          <Route element={<Navigate replace to="/app/documents" />} path="document-intake" />
          <Route element={<Navigate replace to="/app/architect" />} path="solution-architect" />
          <Route element={<Navigate replace to="/lead-finder" />} path="examples" />
          <Route element={<Navigate replace to="/lead-finder" />} path="tools" />
          <Route element={<Navigate replace to="/lead-finder" />} path="demos" />
          <Route element={<Navigate replace to="/lead-finder" />} path="prototypes" />
          <Route element={<Navigate replace to="/lead-finder" />} path="try" />
          <Route element={<Navigate replace to="/platform" />} path="packages" />
          <Route element={<ContactPage />} path="contact" />
          <Route element={<Navigate replace to="/" />} path="home" />
          <Route element={<NotFoundPage />} path="*" />
        </Route>
        <Route element={<AppFrame />} path="/app">
          <Route element={<WorkbenchPage />} index />
          <Route element={<InsightsPage />} path="insights" />
          <Route element={<DirectorDashboardPage />} path="director" />
          <Route element={<WorkspacePage />} path="actions" />
          <Route element={<DecisionJournalPage />} path="decisions" />
          <Route element={<ApprovalQueuePage />} path="approvals" />
          <Route element={<ExceptionQueuePage />} path="exceptions" />
          <Route element={<LeadFinderPage />} path="leads" />
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
