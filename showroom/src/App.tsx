import { Suspense, lazy, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { AppFrame } from './components/AppFrame'
import { RouteEffects } from './components/RouteEffects'
import { SiteFrame } from './components/SiteFrame'
import { hasLiveWorkspaceApp } from './lib/workspaceApi'
import { getTenantConfig, isPlatformAppHost } from './lib/tenantConfig'
import { isPublicMarketingHost, isYtfClientHost, normalizeHostname, supermegaPosHost } from './lib/domainRouting'
import { UiLanguageProvider } from './lib/uiLanguage'

const ActionBoardPage = lazy(() => import('./pages/ActionBoardPage').then((module) => ({ default: module.ActionBoardPage })))
const AboutPage = lazy(() => import('./pages/AboutPage').then((module) => ({ default: module.AboutPage })))
const AiErpPage = lazy(() => import('./pages/AiErpPage').then((module) => ({ default: module.AiErpPage })))
const AiWorkflowDeskAppPage = lazy(() => import('./pages/AiWorkflowDeskAppPage').then((module) => ({ default: module.AiWorkflowDeskAppPage })))
const AppLaunchpadPage = lazy(() => import('./pages/AppLaunchpadPage').then((module) => ({ default: module.AppLaunchpadPage })))
const AgentWorkspacePage = lazy(() => import('./pages/AgentWorkspacePage').then((module) => ({ default: module.AgentWorkspacePage })))
const AgentWorkbenchPage = lazy(() => import('./pages/AgentWorkbenchPage').then((module) => ({ default: module.AgentWorkbenchPage })))
const AdoptionCommandPage = lazy(() => import('./pages/AdoptionCommandPage').then((module) => ({ default: module.AdoptionCommandPage })))
const AdoptionPlaybookPage = lazy(() => import('./pages/AdoptionPlaybookPage').then((module) => ({ default: module.AdoptionPlaybookPage })))
const AppHomeRedirectPage = lazy(() => import('./pages/AppHomeRedirectPage').then((module) => ({ default: module.AppHomeRedirectPage })))
const AgentTeamsPage = lazy(() => import('./pages/AgentTeamsPage').then((module) => ({ default: module.AgentTeamsPage })))
const ApprovalQueuePage = lazy(() => import('./pages/ApprovalQueuePage').then((module) => ({ default: module.ApprovalQueuePage })))
const BuildStudioPage = lazy(() => import('./pages/BuildStudioPage').then((module) => ({ default: module.BuildStudioPage })))
const CardPage = lazy(() => import('./pages/CardPage').then((module) => ({ default: module.CardPage })))
const CampaignRedirectPage = lazy(() => import('./pages/CampaignRedirectPage').then((module) => ({ default: module.CampaignRedirectPage })))
const CloudAgentArmyPage = lazy(() => import('./pages/CloudAgentArmyPage').then((module) => ({ default: module.CloudAgentArmyPage })))
const CloudOpsPage = lazy(() => import('./pages/CloudOpsPage').then((module) => ({ default: module.CloudOpsPage })))
const ClientBuildPage = lazy(() => import('./pages/ClientBuildPage').then((module) => ({ default: module.ClientBuildPage })))
const ClientRoomPage = lazy(() => import('./pages/ClientRoomPage').then((module) => ({ default: module.ClientRoomPage })))
const CommercialSystemPage = lazy(() => import('./pages/CommercialSystemPage').then((module) => ({ default: module.CommercialSystemPage })))
const ConnectorOpsPage = lazy(() => import('./pages/ConnectorOpsPage').then((module) => ({ default: module.ConnectorOpsPage })))
const ContactPage = lazy(() => import('./pages/ContactPage').then((module) => ({ default: module.ContactPage })))
const DataFabricPage = lazy(() => import('./pages/DataFabricPage').then((module) => ({ default: module.DataFabricPage })))
const DailyEntryPage = lazy(() => import('./pages/DailyEntryPage').then((module) => ({ default: module.DailyEntryPage })))
const DecisionJournalPage = lazy(() => import('./pages/DecisionJournalPage').then((module) => ({ default: module.DecisionJournalPage })))
const DQMSDeskPage = lazy(() => import('./pages/DQMSDeskPage').then((module) => ({ default: module.DQMSDeskPage })))
const DocumentIntakePage = lazy(() => import('./pages/DocumentIntakePage').then((module) => ({ default: module.DocumentIntakePage })))
const ExceptionQueuePage = lazy(() => import('./pages/ExceptionQueuePage').then((module) => ({ default: module.ExceptionQueuePage })))
const FoundryReleaseDeskPage = lazy(() => import('./pages/FoundryReleaseDeskPage').then((module) => ({ default: module.FoundryReleaseDeskPage })))
const FounderMachinePage = lazy(() => import('./pages/FounderMachinePage').then((module) => ({ default: module.FounderMachinePage })))
const GrowthCommandPage = lazy(() => import('./pages/GrowthCommandPage').then((module) => ({ default: module.GrowthCommandPage })))
const InsightsPage = lazy(() => import('./pages/InsightsPage').then((module) => ({ default: module.InsightsPage })))
const InventoryPulsePage = lazy(() => import('./pages/InventoryPulsePage').then((module) => ({ default: module.InventoryPulsePage })))
const IndustrialDailyBriefPage = lazy(() => import('./pages/IndustrialDailyBriefPage').then((module) => ({ default: module.IndustrialDailyBriefPage })))
const InvisibleIsoPage = lazy(() => import('./pages/InvisibleIsoPage').then((module) => ({ default: module.InvisibleIsoPage })))
const LeadFinderPage = lazy(() => import('./pages/LeadFinderPage').then((module) => ({ default: module.LeadFinderPage })))
const LeadPipelinePage = lazy(() => import('./pages/LeadPipelinePage').then((module) => ({ default: module.LeadPipelinePage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })))
const MetricIntakePage = lazy(() => import('./pages/MetricIntakePage').then((module) => ({ default: module.MetricIntakePage })))
const MaintenanceDeskPage = lazy(() => import('./pages/MaintenanceDeskPage').then((module) => ({ default: module.MaintenanceDeskPage })))
const ManagerOperatingSystemPage = lazy(() => import('./pages/ManagerOperatingSystemPage').then((module) => ({ default: module.ManagerOperatingSystemPage })))
const MarketIntelPage = lazy(() => import('./pages/MarketIntelPage').then((module) => ({ default: module.MarketIntelPage })))
const MenuPublicPage = lazy(() => import('./pages/MenuPublicPage').then((module) => ({ default: module.MenuPublicPage })))
const MetaOpsPage = lazy(() => import('./pages/MetaOpsPage').then((module) => ({ default: module.MetaOpsPage })))
const MetaToolsPage = lazy(() => import('./pages/MetaToolsPage').then((module) => ({ default: module.MetaToolsPage })))
const MetaWorkspacePage = lazy(() => import('./pages/MetaWorkspacePage').then((module) => ({ default: module.MetaWorkspacePage })))
const ModelOpsPage = lazy(() => import('./pages/ModelOpsPage').then((module) => ({ default: module.ModelOpsPage })))
const NewsBriefPage = lazy(() => import('./pages/NewsBriefPage').then((module) => ({ default: module.NewsBriefPage })))
const KnowledgeControlPage = lazy(() => import('./pages/KnowledgeControlPage').then((module) => ({ default: module.KnowledgeControlPage })))
const LabPage = lazy(() => import('./pages/LabPage').then((module) => ({ default: module.LabPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))
const OpenSourceRadarPage = lazy(() => import('./pages/OpenSourceRadarPage').then((module) => ({ default: module.OpenSourceRadarPage })))
const OperationsTwinPage = lazy(() => import('./pages/OperationsTwinPage').then((module) => ({ default: module.OperationsTwinPage })))
const IntegrationStudioPage = lazy(() => import('./pages/IntegrationStudioPage').then((module) => ({ default: module.IntegrationStudioPage })))
const PlatformAdminPage = lazy(() => import('./pages/PlatformAdminPage').then((module) => ({ default: module.PlatformAdminPage })))
const PosLoginPage = lazy(() => import('./pages/PosLoginPage').then((module) => ({ default: module.PosLoginPage })))
const PosRoleSelectionPage = lazy(() => import('./pages/PosRoleSelectionPage').then((module) => ({ default: module.PosRoleSelectionPage })))
const PosWorkspacePage = lazy(() => import('./pages/PosWorkspacePage').then((module) => ({ default: module.PosWorkspacePage })))
const PortalFactoryPage = lazy(() => import('./pages/PortalFactoryPage').then((module) => ({ default: module.PortalFactoryPage })))
const PolicyControlPage = lazy(() => import('./pages/PolicyControlPage').then((module) => ({ default: module.PolicyControlPage })))
const ProductOperationsPage = lazy(() => import('./pages/ProductOperationsPage').then((module) => ({ default: module.ProductOperationsPage })))
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage').then((module) => ({ default: module.ProductDetailPage })))
const ProductsPage = lazy(() => import('./pages/ProductsPage').then((module) => ({ default: module.ProductsPage })))
const PublicIntakePage = lazy(() => import('./pages/PublicIntakePage').then((module) => ({ default: module.PublicIntakePage })))
const PublicStartPage = lazy(() => import('./pages/PublicStartPage').then((module) => ({ default: module.PublicStartPage })))
const PrototypeForgePage = lazy(() => import('./pages/PrototypeForgePage').then((module) => ({ default: module.PrototypeForgePage })))
const ProcessOrganizerPage = lazy(() => import('./pages/ProcessOrganizerPage').then((module) => ({ default: module.ProcessOrganizerPage })))
const RuntimeOverviewPage = lazy(() => import('./pages/RuntimeOverviewPage').then((module) => ({ default: module.RuntimeOverviewPage })))
const SalesDeskPage = lazy(() => import('./pages/SalesDeskPage').then((module) => ({ default: module.SalesDeskPage })))
const OperationsDeskPage = lazy(() => import('./pages/OperationsDeskPage').then((module) => ({ default: module.OperationsDeskPage })))
const ServiceDeskPage = lazy(() => import('./pages/ServiceDeskPage').then((module) => ({ default: module.ServiceDeskPage })))
const PilotCommandPage = lazy(() => import('./pages/PilotCommandPage').then((module) => ({ default: module.PilotCommandPage })))
const PlantATransitionPage = lazy(() => import('./pages/PlantATransitionPage').then((module) => ({ default: module.PlantATransitionPage })))
const PlantManagerPage = lazy(() => import('./pages/PlantManagerPage').then((module) => ({ default: module.PlantManagerPage })))
const PlantManagerSopPage = lazy(() => import('./pages/PlantManagerSopPage').then((module) => ({ default: module.PlantManagerSopPage })))
const PlantOsTemplateWorkforcePage = lazy(() => import('./pages/PlantOsTemplateWorkforcePage').then((module) => ({ default: module.PlantOsTemplateWorkforcePage })))
const PlantOperatingSystemPage = lazy(() => import('./pages/PlantOperatingSystemPage').then((module) => ({ default: module.PlantOperatingSystemPage })))
const ReceivingControlPage = lazy(() => import('./pages/ReceivingControlPage').then((module) => ({ default: module.ReceivingControlPage })))
const RestaurantOperatingSystemPage = lazy(() => import('./pages/RestaurantOperatingSystemPage').then((module) => ({ default: module.RestaurantOperatingSystemPage })))
const SignupPage = lazy(() => import('./pages/SignupPage').then((module) => ({ default: module.SignupPage })))
const SolutionArchitectPage = lazy(() => import('./pages/SolutionArchitectPage').then((module) => ({ default: module.SolutionArchitectPage })))
const TenantPortalHomePage = lazy(() => import('./pages/TenantPortalHomePage').then((module) => ({ default: module.TenantPortalHomePage })))
const WorkspaceOnboardingPage = lazy(() => import('./pages/WorkspaceOnboardingPage').then((module) => ({ default: module.WorkspaceOnboardingPage })))
const WorkspacePage = lazy(() => import('./pages/WorkspacePage').then((module) => ({ default: module.WorkspacePage })))
const WorkbenchPage = lazy(() => import('./pages/WorkbenchPage').then((module) => ({ default: module.WorkbenchPage })))
const WorkforceCommandPage = lazy(() => import('./pages/WorkforceCommandPage').then((module) => ({ default: module.WorkforceCommandPage })))
const YtfAttendancePayrollPage = lazy(() => import('./pages/YtfAttendancePayrollPage').then((module) => ({ default: module.YtfAttendancePayrollPage })))
const YtfAiStackPage = lazy(() => import('./pages/YtfAiStackPage').then((module) => ({ default: module.YtfAiStackPage })))
const YtfChangeMonitorPage = lazy(() => import('./pages/YtfChangeMonitorPage').then((module) => ({ default: module.YtfChangeMonitorPage })))
const YtfDataQualityPage = lazy(() => import('./pages/YtfDataQualityPage').then((module) => ({ default: module.YtfDataQualityPage })))
const YtfEvaluationPage = lazy(() => import('./pages/YtfEvaluationPage').then((module) => ({ default: module.YtfEvaluationPage })))
const YtfFactoryUsePage = lazy(() => import('./pages/YtfFactoryUsePage').then((module) => ({ default: module.YtfFactoryUsePage })))
const YtfErpPage = lazy(() => import('./pages/YtfErpPage').then((module) => ({ default: module.YtfErpPage })))
const YtfLiveDataPage = lazy(() => import('./pages/YtfLiveDataPage').then((module) => ({ default: module.YtfLiveDataPage })))
const YtfOwnerBriefPage = lazy(() => import('./pages/YtfOwnerBriefPage').then((module) => ({ default: module.YtfOwnerBriefPage })))
const YtfSystemPage = lazy(() => import('./pages/YtfSystemPage').then((module) => ({ default: module.YtfSystemPage })))
const YtfCeoReviewPage = lazy(() => import('./pages/YtfCeoReviewPage').then((module) => ({ default: module.YtfCeoReviewPage })))
const SecurityControlPage = lazy(() => import('./pages/SecurityControlPage').then((module) => ({ default: module.SecurityControlPage })))
const SimpleToolsPage = lazy(() => import('./pages/SimpleToolsPage').then((module) => ({ default: module.SimpleToolsPage })))
const SupermegaDevPage = lazy(() => import('./pages/SupermegaDevPage').then((module) => ({ default: module.SupermegaDevPage })))

function routeElement(element: ReactNode) {
  return <Suspense fallback={<div className="sm-route-loading">Loading page...</div>}>{element}</Suspense>
}

function PublicAppHandoffPage() {
  const location = useLocation()
  const nextPath = `${location.pathname}${location.search}${location.hash}` || '/app/start'
  const loginHref = (() => {
    if (typeof window === 'undefined') {
      return '/intake'
    }

    const hostname = window.location.hostname.trim().toLowerCase()
    const protocol = window.location.protocol || 'https:'
    const baseHost = hostname.startsWith('www.') ? hostname.slice(4) : hostname
    if (!baseHost.endsWith('supermega.dev')) {
      return '/intake'
    }

    const appHost = `app.${baseHost}`
    const url = new URL(`${protocol}//${appHost}/login/`)
    url.searchParams.set('next', nextPath || '/app/start')
    return url.toString()
  })()

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.location.replace(loginHref)
  }, [loginHref])

  return (
    <main className="sm-auth-shell sm-public-handoff mx-auto grid min-h-[72vh] w-full place-items-center px-4 py-10">
      <section className="sm-public-handoff-card">
        <p className="sm-public-handoff-kicker">Client sign-in</p>
        <h1>Client sign-in is at app.supermega.dev.</h1>
        <a className="sm-button-primary" href={loginHref}>
          Continue to app.supermega.dev
        </a>
      </section>
    </main>
  )
}

const publicProductsRedirects = [
  'agents',
  'factory',
  'software',
  'implementation',
  'how-it-works',
  'work',
  'systems',
  'templates',
] as const

const publicCaseStudyRedirects = ['proof', 'portfolio'] as const
const publicContactRedirects = [
  'book',
  'get-started',
  'free',
  'free-tool',
  'free-tools',
  'builder',
  'tool-builder',
  'scan',
  'calculator',
  'workflow-scan',
  'daily-close',
  'payment-close',
  'close-checker',
  'mmqr',
  'store-tool',
  'agent-builder',
  'agent-scope',
  'ai-agent',
  'agent-tool',
  'agents',
] as const
const publicSignupRedirects = ['setup'] as const
const publicAboutRedirects = ['modules', 'portal-types'] as const
const publicTryRedirects = ['try', 'demo', 'demos'] as const

const legacyPublicProductMap: Record<string, string> = {
  agentops: 'agentops-toolbox',
  'agentops-toolbox': 'agentops-toolbox',
  'ai-agent-operator': 'agentops-toolbox',
  'ai-back-office': 'agentops-toolbox',
  'back-office-operator': 'agentops-toolbox',
  'back-office-workflow-desk': 'agentops-toolbox',
  'document-intake-data-cleanroom': 'agentops-toolbox',
  'document-extraction-ledger': 'ai-workflow-desk',
  'source-intake': 'agentops-toolbox',
  'build-app-from-workflow': 'ai-workflow-desk',
  'workflow-app-sprint': 'ai-workflow-desk',
  'workflow-desk-sprint': 'ai-workflow-desk',
  'industrial-plant-os': 'operations-digital-twin',
  'factory-issues-maintenance-quality': 'operations-digital-twin',
  'restaurant-pos-menu-inventory': 'restaurant-group-os',
}

const detailedIntakeKeys = new Set([
  'agentops',
  'agentops-toolbox',
  'ai-agent-operator',
  'ai-back-office',
  'back-office-operator',
  'back-office-workflow-desk',
  'document-intake-data-cleanroom',
  'document-extraction-ledger',
  'source-intake',
])

function readLegacyPublicKey(search: string, hash: string) {
  const params = new URLSearchParams(search)
  const fromSearch =
    params.get('tool')?.trim()
    || params.get('package')?.trim()
    || params.get('wedge')?.trim()
    || params.get('product')?.trim()
    || ''
  const fromHash = hash.replace(/^#/, '').trim()
  return (fromSearch || fromHash).toLowerCase()
}

function LegacyPublicRedirectPage({ fallbackTarget }: { fallbackTarget: string }) {
  const location = useLocation()
  const requestedKey = readLegacyPublicKey(location.search, location.hash)

  if (!requestedKey) {
    return <Navigate replace to={fallbackTarget} />
  }

  if (detailedIntakeKeys.has(requestedKey)) {
    return <Navigate replace to={`/intake/?tool=${encodeURIComponent(requestedKey)}`} />
  }

  const mappedProduct = legacyPublicProductMap[requestedKey]
  if (mappedProduct) {
    return <Navigate replace to={`/products/?product=${encodeURIComponent(mappedProduct)}`} />
  }

  return <Navigate replace to={`/contact/?tool=${encodeURIComponent(requestedKey)}`} />
}

function App() {
  const liveAppAvailable = hasLiveWorkspaceApp()
  const tenant = getTenantConfig()
  const appHost = isPlatformAppHost()
  const browserHostname = typeof window === 'undefined' ? '' : normalizeHostname(window.location.hostname)
  const isPosDemoHost = browserHostname === supermegaPosHost
    || browserHostname === `www.${supermegaPosHost}`
    || browserHostname.endsWith(`.${supermegaPosHost}`)
  const isYtfTenant =
    tenant.key === 'ytf-plant-a' ||
    isYtfClientHost(browserHostname) ||
    browserHostname === 'ytf.supermega.dev' ||
    browserHostname === 'www.ytf.supermega.dev' ||
    browserHostname === 'ytf-plant-a.supermega.dev'
  const marketingHost = isPublicMarketingHost() && !isYtfTenant
  const ytfPortalEntryRoute = '/login?next=/app/portal'
  const posAuthEntryRoute = '/pos/login'
  const appPortalEntryRoute = isPosDemoHost ? posAuthEntryRoute : '/login?next=/app/start'
  const platformAppOnly = appHost && !isYtfTenant
  const publicWorkspaceFallback = '/contact'
  const tenantPublicOnlyElement = (element: ReactNode, ytfTarget = ytfPortalEntryRoute, appTarget = appPortalEntryRoute) => {
    if (isPosDemoHost) {
      return <Navigate replace to={posAuthEntryRoute} />
    }
    if (isYtfTenant) {
      return <Navigate replace to={ytfTarget} />
    }
    if (platformAppOnly) {
      return <Navigate replace to={appTarget} />
    }
    return element
  }
  const productRedirectTarget = isPosDemoHost ? posAuthEntryRoute : isYtfTenant ? ytfPortalEntryRoute : platformAppOnly ? appPortalEntryRoute : '/products'
  const caseStudyRedirectTarget = isPosDemoHost ? posAuthEntryRoute : isYtfTenant ? ytfPortalEntryRoute : platformAppOnly ? appPortalEntryRoute : '/products'
  const contactRedirectTarget = isPosDemoHost ? posAuthEntryRoute : isYtfTenant || platformAppOnly ? (isYtfTenant ? ytfPortalEntryRoute : appPortalEntryRoute) : '/contact'
  const aboutRedirectTarget = isPosDemoHost ? posAuthEntryRoute : isYtfTenant || platformAppOnly ? (isYtfTenant ? ytfPortalEntryRoute : appPortalEntryRoute) : '/about'
  const signupElement =
    isPosDemoHost || isYtfTenant || platformAppOnly
      ? <Navigate replace to={isYtfTenant ? ytfPortalEntryRoute : appPortalEntryRoute} />
      : liveAppAvailable
        ? routeElement(<SignupPage />)
        : <Navigate replace to={publicWorkspaceFallback} />
  const homeElement = isPosDemoHost
    ? <Navigate replace to={posAuthEntryRoute} />
    : isYtfTenant
      ? <Navigate replace to={ytfPortalEntryRoute} />
      : liveAppAvailable && appHost
        ? <Navigate replace to={appPortalEntryRoute} />
        : routeElement(<ProductsPage />)

  return (
    <UiLanguageProvider>
    <BrowserRouter>
      <RouteEffects />
      <Routes>
        <Route element={<SiteFrame />} path="/">
          <Route element={homeElement} index />
          {publicProductsRedirects.map((path) => (
            <Route element={<Navigate replace to={productRedirectTarget} />} key={path} path={path} />
          ))}
          {publicCaseStudyRedirects.map((path) => (
            <Route element={<Navigate replace to={caseStudyRedirectTarget} />} key={path} path={path} />
          ))}
          <Route element={<Navigate replace to={caseStudyRedirectTarget} />} path="case-study" />
          <Route element={<Navigate replace to={productRedirectTarget} />} path="platform" />
          <Route element={<Navigate replace to={productRedirectTarget} />} path="solutions" />
          <Route element={tenantPublicOnlyElement(routeElement(<PublicStartPage />))} path="start" />
          <Route element={tenantPublicOnlyElement(routeElement(<PublicIntakePage />))} path="intake" />
          <Route element={tenantPublicOnlyElement(routeElement(<LegacyPublicRedirectPage fallbackTarget={productRedirectTarget} />))} path="proof" />
          <Route element={tenantPublicOnlyElement(routeElement(<LegacyPublicRedirectPage fallbackTarget={productRedirectTarget} />))} path="tools" />
          <Route element={<Navigate replace to={contactRedirectTarget} />} path="free-tools" />
          <Route element={tenantPublicOnlyElement(routeElement(<LegacyPublicRedirectPage fallbackTarget={productRedirectTarget} />))} path="value" />
          <Route element={tenantPublicOnlyElement(routeElement(<ProductsPage />))} path="products" />
          <Route element={tenantPublicOnlyElement(<Navigate replace to="/products/?product=agentops-toolbox" />)} path="agentops" />
          <Route element={tenantPublicOnlyElement(<Navigate replace to="/products/?product=agentops-toolbox" />)} path="ai-back-office" />
          <Route element={<Navigate replace to={productRedirectTarget} />} path="myanmar" />
          <Route element={<Navigate replace to={contactRedirectTarget} />} path="pricing" />
          <Route element={<Navigate replace to={contactRedirectTarget} />} path="plans" />
          <Route element={<Navigate replace to={contactRedirectTarget} />} path="packages" />
          <Route element={<Navigate replace to={productRedirectTarget} />} path="demo-center" />
          <Route element={<Navigate replace to={productRedirectTarget} />} path="enterprise-demo" />
          <Route element={<Navigate replace to={contactRedirectTarget} />} path="sprint" />
          <Route element={tenantPublicOnlyElement(routeElement(<ProductDetailPage />))} path="products/:productId" />
          <Route element={isPosDemoHost ? <Navigate replace to={posAuthEntryRoute} /> : liveAppAvailable ? routeElement(<LoginPage />) : <Navigate replace to={publicWorkspaceFallback} />} path="login" />
          <Route element={isPosDemoHost ? routeElement(<PosLoginPage />) : <Navigate replace to="/login?next=/app/start" />} path="pos/login" />
          <Route element={isPosDemoHost ? routeElement(<PosRoleSelectionPage />) : <Navigate replace to="/login?next=/app/start" />} path="pos/role" />
          <Route element={isPosDemoHost ? routeElement(<PosWorkspacePage />) : <Navigate replace to="/login?next=/app/start" />} path="pos/workspace" />
          {publicTryRedirects.map((path) => (
            <Route element={<Navigate replace to={isYtfTenant ? ytfPortalEntryRoute : appPortalEntryRoute} />} key={path} path={path} />
          ))}
          <Route element={signupElement} path="signup" />
          {publicSignupRedirects.map((path) => (
            <Route element={signupElement} key={path} path={path} />
          ))}
          <Route element={tenantPublicOnlyElement(routeElement(<ContactPage />))} path="contact" />
          <Route element={tenantPublicOnlyElement(routeElement(<CardPage />))} path="card" />
          <Route element={tenantPublicOnlyElement(routeElement(<CampaignRedirectPage />))} path="c/:campaignSlug" />
          {publicContactRedirects.map((path) => (
            <Route element={<Navigate replace to={contactRedirectTarget} />} key={path} path={path} />
          ))}
          <Route element={<Navigate replace to={isYtfTenant ? ytfPortalEntryRoute : '/products'} />} path="find-companies" />
          <Route element={<Navigate replace to={isYtfTenant ? ytfPortalEntryRoute : '/products'} />} path="company-list" />
          <Route element={<Navigate replace to={isYtfTenant ? ytfPortalEntryRoute : '/products'} />} path="task-list" />
          <Route element={<Navigate replace to={isYtfTenant ? ytfPortalEntryRoute : '/products'} />} path="receiving-log" />
          <Route element={<Navigate replace to="/menu/sample" />} path="menu" />
          <Route element={tenantPublicOnlyElement(routeElement(<MenuPublicPage />))} path="menu/:menuSlug" />
          <Route element={isYtfTenant || platformAppOnly ? <Navigate replace to={aboutRedirectTarget} /> : tenantPublicOnlyElement(routeElement(<AboutPage />))} path="about" />
          {publicAboutRedirects.map((path) => (
            <Route element={<Navigate replace to={aboutRedirectTarget} />} key={path} path={path} />
          ))}
          <Route element={isPosDemoHost ? <Navigate replace to={posAuthEntryRoute} /> : platformAppOnly ? <Navigate replace to={appPortalEntryRoute} /> : routeElement(<NotFoundPage />)} path="*" />
        </Route>
        <Route element={isPosDemoHost ? <Navigate replace to="/pos/login" /> : marketingHost ? <PublicAppHandoffPage /> : <AppFrame />} path="/app/*">
          <Route element={routeElement(<AppHomeRedirectPage />)} index />
          <Route element={isYtfTenant ? <Navigate replace to="/app" /> : routeElement(<AppLaunchpadPage />)} path="start" />
          <Route element={isYtfTenant ? routeElement(<AppHomeRedirectPage />) : routeElement(<TenantPortalHomePage />)} path="portal" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/daily-entry" /> : routeElement(<YtfFactoryUsePage />)} path="use" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/plant-manager" /> : routeElement(<PlantATransitionPage />)} path="plant-a" />
          <Route element={isYtfTenant ? routeElement(<YtfErpPage />) : routeElement(<AiErpPage />)} path="erp" />
          <Route element={routeElement(<DailyEntryPage />)} path="daily-entry" />
          <Route element={routeElement(<AdoptionCommandPage />)} path="adoption-command" />
          <Route element={routeElement(<AdoptionPlaybookPage />)} path="adoption" />
          <Route element={routeElement(<PilotCommandPage />)} path="pilot" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/live-data" /> : routeElement(<DataFabricPage />)} path="data-fabric" />
          <Route element={routeElement(<YtfLiveDataPage />)} path="live-data" />
          <Route element={routeElement(<YtfAiStackPage />)} path="ai-stack" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/live-data?view=actions" /> : routeElement(<YtfChangeMonitorPage />)} path="change-monitor" />
          <Route element={routeElement(<YtfDataQualityPage />)} path="data-quality" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/platform-admin" /> : routeElement(<YtfEvaluationPage />)} path="evaluation" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/plant-manager" /> : routeElement(<YtfOwnerBriefPage />)} path="owner-brief" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/portal" /> : routeElement(<YtfSystemPage />)} path="system" />
          <Route element={routeElement(<CloudOpsPage />)} path="cloud" />
          <Route element={<Navigate replace to="/app/cloud" />} path="cloud-ops" />
          <Route element={routeElement(<SupermegaDevPage />)} path="supermega-dev" />
          <Route element={routeElement(<FounderMachinePage />)} path="founder-machine" />
          <Route element={routeElement(<MarketIntelPage />)} path="market-intel" />
          <Route element={routeElement(<PrototypeForgePage />)} path="prototype-forge" />
          <Route element={routeElement(<ModelOpsPage />)} path="model-ops" />
          <Route element={routeElement(<AgentWorkspacePage />)} path="agent-space" />
          <Route element={routeElement(<AiWorkflowDeskAppPage />)} path="custom-workflow" />
          <Route element={<Navigate replace to="/app/documents" />} path="ai-workflow-desk" />
          <Route element={<Navigate replace to="/app/documents" />} path="document-extraction-ledger" />
          <Route element={routeElement(<ClientRoomPage />)} path="client-room" />
          <Route element={routeElement(<CloudAgentArmyPage />)} path="cloud-agent-army" />
          <Route element={routeElement(<AgentWorkbenchPage />)} path="agent-workbench" />
          <Route element={routeElement(<WorkforceCommandPage />)} path="workforce" />
          <Route element={routeElement(<WorkbenchPage />)} path="workbench" />
          <Route element={<Navigate replace to="/app/meta" />} path="overview" />
          <Route element={routeElement(<MetaWorkspacePage />)} path="meta" />
          <Route element={routeElement(<MetaOpsPage />)} path="meta-ops" />
          <Route element={routeElement(<MetaToolsPage />)} path="meta-tools" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/platform-admin" /> : routeElement(<OpenSourceRadarPage />)} path="open-source-radar" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/platform-admin" /> : routeElement(<OpenSourceRadarPage />)} path="general-use-tools" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/platform-admin" /> : routeElement(<IntegrationStudioPage />)} path="integration-studio" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/platform-admin" /> : routeElement(<IntegrationStudioPage />)} path="tool-integration" />
          <Route element={<Navigate replace to="/app/meta-tools" />} path="infrastructure" />
          <Route element={routeElement(<ProcessOrganizerPage />)} path="process" />
          <Route element={<Navigate replace to="/app/process" />} path="process-organizer" />
          <Route element={routeElement(<InsightsPage />)} path="insights" />
          <Route element={isYtfTenant ? routeElement(<YtfCeoReviewPage />) : routeElement(<PlantOperatingSystemPage />)} path="director" />
          <Route element={routeElement(<ManagerOperatingSystemPage />)} path="manager-system" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/dqms" /> : routeElement(<InvisibleIsoPage />)} path="invisible-iso" />
          <Route element={routeElement(<SimpleToolsPage />)} path="simple-tools" />
          <Route element={routeElement(<PlantManagerSopPage />)} path="manager-sops" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/daily-entry" /> : routeElement(<OperationsDeskPage />)} path="operations" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/manager-system" /> : routeElement(<YtfAttendancePayrollPage />)} path="attendance-payroll" />
          <Route element={routeElement(<PlantManagerPage />)} path="plant-manager" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/plant-manager" /> : routeElement(<OperationsTwinPage />)} path="factory-operations" />
          <Route element={<Navigate replace to={isYtfTenant ? '/app/plant-manager' : '/app/factory-operations'} />} path="operations-twin" />
          <Route element={<Navigate replace to={isYtfTenant ? '/app/plant-manager' : '/app/factory-operations'} />} path="digital-twin" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/plant-manager" /> : routeElement(<PlantOperatingSystemPage />)} path="plant-os" />
          <Route element={<Navigate replace to={isYtfTenant ? '/app/plant-manager' : '/app/operations-twin'} />} path="industrial-os" />
          <Route element={routeElement(<PlantOsTemplateWorkforcePage />)} path="plantos-template" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/plant-manager" /> : routeElement(<IndustrialDailyBriefPage />)} path="daily-brief" />
          <Route element={routeElement(<DQMSDeskPage />)} path="dqms" />
          <Route element={routeElement(<MaintenanceDeskPage />)} path="maintenance" />
          <Route element={routeElement(<ConnectorOpsPage />)} path="email" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/action-board" /> : routeElement(<WorkspacePage />)} path="actions" />
          <Route element={tenant.key === 'ytf-plant-a' ? <Navigate replace to="/app/platform-admin" /> : routeElement(<WorkspaceOnboardingPage />)} path="onboarding" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/action-board" /> : routeElement(<DecisionJournalPage />)} path="decisions" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/action-board" /> : routeElement(<ApprovalQueuePage />)} path="approvals" />
          <Route element={routeElement(<ExceptionQueuePage />)} path="exceptions" />
          <Route element={routeElement(<AgentTeamsPage />)} path="teams" />
          <Route element={routeElement(<SalesDeskPage />)} path="revenue" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/revenue" /> : routeElement(<CommercialSystemPage />)} path="revenue/offers" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/revenue" /> : routeElement(<GrowthCommandPage />)} path="revenue/growth" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/revenue" /> : routeElement(<LeadPipelinePage />)} path="revenue/pipeline" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/revenue" /> : routeElement(<LeadFinderPage />)} path="revenue/prospecting" />
          <Route element={<Navigate replace to="/app/revenue" />} path="sales" />
          <Route element={<Navigate replace to={isYtfTenant ? '/app/revenue' : '/app/revenue/offers'} />} path="sales/offers" />
          <Route element={<Navigate replace to={isYtfTenant ? '/app/revenue' : '/app/revenue/offers'} />} path="commercial" />
          <Route element={<Navigate replace to="/app/revenue" />} path="sales/growth" />
          <Route element={<Navigate replace to={isYtfTenant ? '/app/revenue' : '/app/revenue/pipeline'} />} path="sales/pipeline" />
          <Route element={<Navigate replace to={isYtfTenant ? '/app/revenue' : '/app/revenue/prospecting'} />} path="sales/prospecting" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/revenue" /> : routeElement(<LeadPipelinePage />)} path="leads" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/revenue" /> : routeElement(<LeadFinderPage />)} path="leads/advanced" />
          <Route element={routeElement(<MetricIntakePage />)} path="intake" />
          <Route element={routeElement(<ReceivingControlPage />)} path="receiving" />
          <Route element={routeElement(<InventoryPulsePage />)} path="inventory" />
          <Route element={routeElement(<NewsBriefPage />)} path="news" />
          <Route element={routeElement(<RuntimeOverviewPage />)} path="runtime" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/action-board" /> : routeElement(<ActionBoardPage />)} path="work" />
          <Route element={routeElement(<ActionBoardPage />)} path="action-board" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/erp" /> : routeElement(<ServiceDeskPage />)} path="service-desk" />
          <Route element={isPosDemoHost ? <Navigate replace to="/pos/login" /> : routeElement(<RestaurantOperatingSystemPage />)} path="restaurant-pos" />
          <Route element={isPosDemoHost ? <Navigate replace to="/pos/login" /> : <Navigate replace to="/app/restaurant-pos" />} path="restaurant-os" />
          <Route element={routeElement(<DocumentIntakePage />)} path="documents" />
          <Route element={routeElement(<LabPage />)} path="lab" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/platform-admin" /> : routeElement(<SolutionArchitectPage />)} path="architect" />
          <Route element={routeElement(<FoundryReleaseDeskPage />)} path="foundry" />
          <Route element={isYtfTenant ? <Navigate replace to="/app/platform-admin" /> : routeElement(<ClientBuildPage />)} path="client-build" />
          <Route element={<Navigate replace to="/app/client-build" />} path="client-signup" />
          <Route element={routeElement(<BuildStudioPage />)} path="factory" />
          <Route element={<Navigate replace to="/app/factory" />} path="build-studio" />
          <Route element={routeElement(<PortalFactoryPage />)} path="portal-factory" />
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
    </UiLanguageProvider>
  )
}

export default App
