import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { RouteEffects } from './components/RouteEffects'
import { SiteFrame } from './components/SiteFrame'
import { ActionBoardPage } from './pages/ActionBoardPage'
import { ContactPage } from './pages/ContactPage'
import { HomePage } from './pages/HomePage'
import { LeadFinderPage } from './pages/LeadFinderPage'
import { NewsBriefPage } from './pages/NewsBriefPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PackagesPage } from './pages/PackagesPage'
import { ProductsPage } from './pages/ProductsPage'
import { TryPage } from './pages/TryPage'
import { WorkspacePage } from './pages/WorkspacePage'

function App() {
  return (
    <BrowserRouter>
      <RouteEffects />
      <Routes>
        <Route element={<SiteFrame />} path="/">
          <Route element={<HomePage />} index />
          <Route element={<ProductsPage />} path="products" />
          <Route element={<TryPage />} path="examples" />
          <Route element={<LeadFinderPage />} path="lead-finder" />
          <Route element={<NewsBriefPage />} path="news-brief" />
          <Route element={<ActionBoardPage />} path="action-board" />
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
