import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { RouteEffects } from './components/RouteEffects'
import { SiteFrame } from './components/SiteFrame'
import { ActionBoardPage } from './pages/ActionBoardPage'
import { ContactPage } from './pages/ContactPage'
import { DocumentIntakePage } from './pages/DocumentIntakePage'
import { HomePage } from './pages/HomePage'
import { InventoryPulsePage } from './pages/InventoryPulsePage'
import { LeadFinderPage } from './pages/LeadFinderPage'
import { LoginPage } from './pages/LoginPage'
import { MetricIntakePage } from './pages/MetricIntakePage'
import { NewsBriefPage } from './pages/NewsBriefPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PackagesPage } from './pages/PackagesPage'
import { PlatformPage } from './pages/PlatformPage'
import { ProductsPage } from './pages/ProductsPage'
import { ReceivingControlPage } from './pages/ReceivingControlPage'
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
          <Route element={<WorkbenchPage />} path="app" />
          <Route element={<WorkspacePage />} path="app/actions" />
          <Route element={<LeadFinderPage />} path="app/leads" />
          <Route element={<MetricIntakePage />} path="app/intake" />
          <Route element={<ReceivingControlPage />} path="app/receiving" />
          <Route element={<InventoryPulsePage />} path="app/inventory" />
          <Route element={<NewsBriefPage />} path="app/news" />
          <Route element={<ActionBoardPage />} path="app/action-board" />
          <Route element={<DocumentIntakePage />} path="app/documents" />
          <Route element={<SolutionArchitectPage />} path="app/architect" />
          <Route element={<ProductsPage />} path="products" />
          <Route element={<PackagesPage />} path="solutions" />
          <Route element={<LeadFinderPage />} path="lead-finder" />
          <Route element={<LoginPage />} path="login" />
          <Route element={<Navigate replace to="/app" />} path="workbench" />
          <Route element={<Navigate replace to="/app/actions" />} path="workspace" />
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
          <Route element={<PackagesPage />} path="packages" />
          <Route element={<ContactPage />} path="contact" />
          <Route element={<ContactPage />} path="book" />
          <Route element={<Navigate replace to="/" />} path="home" />
          <Route element={<NotFoundPage />} path="*" />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
