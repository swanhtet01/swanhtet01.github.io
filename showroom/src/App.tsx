import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { RouteEffects } from './components/RouteEffects'
import { SiteFrame } from './components/SiteFrame'
import { ActionBoardPage } from './pages/ActionBoardPage'
import { ContactPage } from './pages/ContactPage'
import { DocumentIntakePage } from './pages/DocumentIntakePage'
import { HomePage } from './pages/HomePage'
import { InventoryPulsePage } from './pages/InventoryPulsePage'
import { LeadFinderPage } from './pages/LeadFinderPage'
import { MetricIntakePage } from './pages/MetricIntakePage'
import { NewsBriefPage } from './pages/NewsBriefPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PackagesPage } from './pages/PackagesPage'
import { PlatformPage } from './pages/PlatformPage'
import { ProductsPage } from './pages/ProductsPage'
import { ReceivingControlPage } from './pages/ReceivingControlPage'
import { SolutionArchitectPage } from './pages/SolutionArchitectPage'
import { TryPage } from './pages/TryPage'
import { WorkspacePage } from './pages/WorkspacePage'

function App() {
  return (
    <BrowserRouter>
      <RouteEffects />
      <Routes>
        <Route element={<SiteFrame />} path="/">
          <Route element={<HomePage />} index />
          <Route element={<PlatformPage />} path="platform" />
          <Route element={<ProductsPage />} path="products" />
          <Route element={<TryPage />} path="examples" />
          <Route element={<LeadFinderPage />} path="lead-finder" />
          <Route element={<NewsBriefPage />} path="news-brief" />
          <Route element={<ActionBoardPage />} path="action-board" />
          <Route element={<DocumentIntakePage />} path="document-intake" />
          <Route element={<MetricIntakePage />} path="ops-intake" />
          <Route element={<MetricIntakePage />} path="metric-intake" />
          <Route element={<SolutionArchitectPage />} path="solution-architect" />
          <Route element={<ReceivingControlPage />} path="receiving-control" />
          <Route element={<InventoryPulsePage />} path="inventory-pulse" />
          <Route element={<WorkspacePage />} path="workspace" />
          <Route element={<Navigate replace to="/examples" />} path="demos" />
          <Route element={<Navigate replace to="/examples" />} path="prototypes" />
          <Route element={<Navigate replace to="/examples" />} path="try" />
          <Route element={<PackagesPage />} path="packages" />
          <Route element={<ContactPage />} path="contact" />
          <Route element={<Navigate replace to="/" />} path="home" />
          <Route element={<NotFoundPage />} path="*" />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
