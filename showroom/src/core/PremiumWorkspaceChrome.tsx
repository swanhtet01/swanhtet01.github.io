import { Link } from 'react-router'
import { bi } from './i18n-actions'
import { commerceTabs, type CommerceTab } from './commerce-tabs'

export type SitesWorkspaceView = 'pages' | 'inquiries' | 'publish'

const sitesWorkspaceItems = [
  { id: 'pages', icon: 'pages', label: 'Pages', to: '/website/' },
  { id: 'inquiries', icon: 'inquiries', label: 'Inquiries', to: '/website/?view=inquiries' },
] as const

export function DesktopShopNavigation({ activeTab }: { activeTab: CommerceTab }) {
  return <nav className="core-nav core-task-nav" aria-label="Shop workspace">
    <span className="core-nav-label">Workspace</span>
    {commerceTabs.map((tab) => <Link aria-current={activeTab === tab.id ? 'page' : undefined} className={activeTab === tab.id ? 'active' : ''} key={tab.id} replace to={`/shop/?tab=${tab.id}`}><span className="shell-nav-icon" aria-hidden="true" data-icon={tab.id} /><span>{bi(tab.label)}</span></Link>)}
  </nav>
}

export function DesktopSitesNavigation({ activeView }: { activeView: SitesWorkspaceView }) {
  return <nav className="core-nav core-task-nav" aria-label="Sites workspace">
    <span className="core-nav-label">Workspace</span>
    {sitesWorkspaceItems.map((item) => <Link aria-current={activeView === item.id ? 'page' : undefined} className={activeView === item.id ? 'active' : ''} key={item.id} replace to={item.to}><span className="shell-nav-icon" aria-hidden="true" data-icon={item.icon} /><span>{item.label}</span></Link>)}
  </nav>
}

export function WorkspaceAccount({ companyLoginPath, companyName, companyRole }: { companyLoginPath: string; companyName?: string; companyRole?: string }) {
  return companyName && companyRole
    ? <div className="workspace-identity"><span aria-hidden="true">{companyName.slice(0, 1).toUpperCase()}</span><div><strong>{companyName}</strong><small>{companyRole}</small></div></div>
    : <Link aria-label="Login" className="account-shell-link mobile-account-link" to={companyLoginPath}>Login</Link>
}
