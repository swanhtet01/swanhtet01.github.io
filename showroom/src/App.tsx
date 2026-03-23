import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { RouteEffects } from './components/RouteEffects'
import { SiteFrame } from './components/SiteFrame'
import { AboutPage } from './pages/AboutPage'
import { CaseStudiesPage } from './pages/CaseStudiesPage'
import { ContactPage } from './pages/ContactPage'
import { DqmsPage } from './pages/DqmsPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PackagesPage } from './pages/PackagesPage'
import { ProductsPage } from './pages/ProductsPage'
import { SolutionsPage } from './pages/SolutionsPage'
import { TryPage } from './pages/TryPage'

function App() {
  return (
    <BrowserRouter>
      <RouteEffects />
      <Routes>
        <Route element={<SiteFrame />} path="/">
          <Route element={<HomePage />} index />
          <Route element={<ProductsPage />} path="products" />
          <Route element={<TryPage />} path="prototypes" />
          <Route element={<TryPage />} path="try" />
          <Route element={<SolutionsPage />} path="solutions" />
          <Route element={<PackagesPage />} path="packages" />
          <Route element={<CaseStudiesPage />} path="case-studies" />
          <Route element={<DqmsPage />} path="dqms" />
          <Route element={<AboutPage />} path="about" />
          <Route element={<ContactPage />} path="contact" />
          <Route element={<Navigate replace to="/" />} path="home" />
          <Route element={<NotFoundPage />} path="*" />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
