import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom'

import './core-app.css'

type ShopItem = {
  sku: string
  name: string
  onHand: number
  reorderAt: number
  price: number
}

type ShopSale = {
  id: string
  createdAt: string
  item: string
  quantity: number
  payment: string
  total: number
}

type ShopState = {
  items: ShopItem[]
  sales: ShopSale[]
  closes: Array<{ id: string; createdAt: string; total: number; transactions: number }>
}

type PlantJob = {
  id: string
  line: string
  product: string
  target: number
  output: number
}

type PlantIssue = {
  id: string
  createdAt: string
  area: string
  summary: string
  status: 'open' | 'resolved'
}

type PlantState = {
  jobs: PlantJob[]
  issues: PlantIssue[]
  machines: Array<{ id: string; name: string; state: 'running' | 'attention' | 'stopped' }>
}

type Approval = {
  id: string
  createdAt: string
  title: string
  evidence: string[]
  status: 'pending' | 'approved' | 'declined'
}

type CommandRoleId = 'product' | 'engineering' | 'operations' | 'growth' | 'finance_risk'

type CommandTask = {
  id: string
  createdAt: string
  title: string
  owner: CommandRoleId
  status: 'queued' | 'in_progress' | 'done'
}

type SetupState = {
  product: 'shop' | 'plant'
  template: string
  workspace: string
  owner: string
  savedAt?: string
}

const SHOP_KEY = 'supermega.shop.workspace.v2'
const PLANT_KEY = 'supermega.plant.workspace.v2'
const APPROVAL_KEY = 'supermega.approvals.v2'
const SETUP_KEY = 'supermega.setup.v2'
const COMMAND_KEY = 'supermega.command.tasks.v2'

const commandRoles = [
  {
    id: 'product',
    label: 'Product',
    agent: 'Product agent',
    authority: 'Prioritize outcomes, clarify acceptance, and coordinate handoffs.',
    boundary: 'Cannot approve its own release or customer-facing action.',
  },
  {
    id: 'engineering',
    label: 'Engineering',
    agent: 'Engineering agent',
    authority: 'Prepare implementation, testing, and release-candidate evidence.',
    boundary: 'Cannot promote production or change access controls.',
  },
  {
    id: 'operations',
    label: 'Operations',
    agent: 'Operations agent',
    authority: 'Coordinate Shop and Plant handoffs, exceptions, and daily control.',
    boundary: 'Cannot make irreversible production changes.',
  },
  {
    id: 'growth',
    label: 'Growth',
    agent: 'Growth agent',
    authority: 'Prepare onboarding, campaign, and lead follow-up drafts.',
    boundary: 'Cannot publish or contact a person without approval.',
  },
  {
    id: 'finance_risk',
    label: 'Finance / Risk',
    agent: 'Finance and risk agent',
    authority: 'Review spend, controls, exceptions, and supporting evidence.',
    boundary: 'Cannot pay, approve its own request, or weaken a control.',
  },
] as const satisfies ReadonlyArray<{
  id: CommandRoleId
  label: string
  agent: string
  authority: string
  boundary: string
}>

const seedShop: ShopState = {
  items: [
    { sku: 'SM-1001', name: 'Daily essentials basket', onHand: 34, reorderAt: 10, price: 18500 },
    { sku: 'SM-1002', name: 'Cold drink pack', onHand: 8, reorderAt: 12, price: 6500 },
    { sku: 'SM-1003', name: 'Household refill', onHand: 21, reorderAt: 8, price: 12000 },
    { sku: 'SM-1004', name: 'Personal care set', onHand: 13, reorderAt: 6, price: 22500 },
  ],
  sales: [
    { id: 'sale-seed-1', createdAt: new Date(Date.now() - 54 * 60 * 1000).toISOString(), item: 'Daily essentials basket', quantity: 2, payment: 'KBZPay', total: 37000 },
    { id: 'sale-seed-2', createdAt: new Date(Date.now() - 29 * 60 * 1000).toISOString(), item: 'Household refill', quantity: 1, payment: 'Cash', total: 12000 },
  ],
  closes: [],
}

const seedPlant: PlantState = {
  jobs: [
    { id: 'JOB-201', line: 'Line 01', product: 'Batch Alpha', target: 1200, output: 860 },
    { id: 'JOB-202', line: 'Line 02', product: 'Batch Beta', target: 900, output: 745 },
    { id: 'JOB-203', line: 'Line 03', product: 'Batch Gamma', target: 650, output: 650 },
  ],
  issues: [
    { id: 'ISS-301', createdAt: new Date(Date.now() - 82 * 60 * 1000).toISOString(), area: 'Line 02', summary: 'Temperature drift requires supervisor review', status: 'open' },
  ],
  machines: [
    { id: 'MC-01', name: 'Mixer 01', state: 'running' },
    { id: 'MC-02', name: 'Press 02', state: 'attention' },
    { id: 'MC-03', name: 'Finishing 01', state: 'running' },
  ],
}

const seedCommandTasks: CommandTask[] = [
  { id: 'TASK-101', createdAt: new Date(Date.now() - 46 * 60 * 1000).toISOString(), title: 'Review the low-stock exception in Shop', owner: 'operations', status: 'queued' },
  { id: 'TASK-102', createdAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(), title: 'Confirm the Line 02 temperature handoff', owner: 'operations', status: 'in_progress' },
]

function normalizeCommandOwner(value: unknown): CommandRoleId {
  const owner = String(value ?? '').trim().toLowerCase()
  const exactRole = commandRoles.find((role) => role.id === owner)
  if (exactRole) return exactRole.id
  if (/engineer|developer|technical/.test(owner)) return 'engineering'
  if (/growth|marketing|sales|lead/.test(owner)) return 'growth'
  if (/finance|risk|compliance|legal/.test(owner)) return 'finance_risk'
  if (/product|design|research/.test(owner)) return 'product'
  return 'operations'
}

function normalizeCommandTasks(value: CommandTask[]) {
  if (!Array.isArray(value)) return seedCommandTasks
  return value.map((task) => ({ ...task, owner: normalizeCommandOwner(task.owner) }))
}

function getCommandRole(owner: unknown) {
  const roleId = normalizeCommandOwner(owner)
  return commandRoles.find((role) => role.id === roleId) ?? commandRoles[2]
}

function uid(prefix: string) {
  const cryptoId = globalThis.crypto?.randomUUID?.().slice(0, 8)
  return `${prefix}-${cryptoId ?? Date.now().toString(36)}`.toUpperCase()
}

function useStoredState<T>(key: string, seed: T, normalize?: (value: T) => T) {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key)
      const value = stored ? (JSON.parse(stored) as T) : seed
      return normalize ? normalize(value) : value
    } catch {
      return seed
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // The workspace remains usable in memory when browser storage is unavailable.
    }
  }, [key, state])

  return [state, setState] as const
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('en-US').format(value)} MMK`
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function Brand() {
  return (
    <Link className="core-brand" to="/" aria-label="SuperMega app home">
      <img alt="" src="/favicon.svg" />
      <span>SuperMega<span>.dev</span></span>
    </Link>
  )
}

const navigation = [
  { to: '/', label: 'Command', index: '01', end: true },
  { to: '/shop/', label: 'Shop', index: '02', end: false },
  { to: '/plant/', label: 'Plant', index: '03', end: false },
  { to: '/assist/', label: 'Assist', index: '04', end: false },
  { to: '/setup/', label: 'Setup', index: '05', end: false },
  { to: '/trust/', label: 'Trust', index: '06', end: false },
] as const

type RuntimeStatus = 'checking' | 'enterprise' | 'demo'

type RuntimeHealth = {
  status: RuntimeStatus
  serviceStatus: string
  enterpriseDbReady: boolean
  securityReady: boolean
  coverageScore: number
  requirements: string[]
}

const checkingRuntime: RuntimeHealth = {
  status: 'checking',
  serviceStatus: 'checking',
  enterpriseDbReady: false,
  securityReady: false,
  coverageScore: 0,
  requirements: [],
}

function useRuntimeHealth() {
  const [runtime, setRuntime] = useState<RuntimeHealth>(checkingRuntime)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/health', { headers: { accept: 'application/json' }, signal: controller.signal })
      .then(async (response) => {
        const type = response.headers.get('content-type') ?? ''
        if (!response.ok || !type.includes('application/json')) throw new Error('health_unavailable')
        const body = (await response.json()) as {
          status?: string
          enterprise_db_ready?: boolean
          security_ready?: boolean
          coverage_score?: number
          enterprise_activation?: { requirements?: string[] }
        }
        const enterpriseReady = body.status === 'ready' && body.enterprise_db_ready === true && body.security_ready === true
        setRuntime({
          status: enterpriseReady ? 'enterprise' : 'demo',
          serviceStatus: body.status ?? 'unknown',
          enterpriseDbReady: body.enterprise_db_ready === true,
          securityReady: body.security_ready === true,
          coverageScore: Number.isFinite(body.coverage_score) ? Number(body.coverage_score) : 0,
          requirements: Array.isArray(body.enterprise_activation?.requirements) ? body.enterprise_activation.requirements : [],
        })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRuntime({ ...checkingRuntime, status: 'demo', serviceStatus: 'unavailable', requirements: ['Restore the application health endpoint before activating a managed workspace.'] })
        }
      })
    return () => controller.abort()
  }, [])

  return runtime
}

function RuntimeBadge({ status }: { status: RuntimeStatus }) {
  return <span className={`runtime-badge ${status}`}><i />{status === 'checking' ? 'Checking runtime' : status === 'enterprise' ? 'Enterprise ready' : 'Isolated demo'}</span>
}

export function CoreLayout() {
  const location = useLocation()
  const runtime = useRuntimeHealth()

  useEffect(() => {
    const routeName = navigation.find((item) => item.to !== '/' && location.pathname.startsWith(item.to))?.label ?? 'Command'
    document.title = `${routeName} | SuperMega`
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])

  return (
    <div className="core-shell">
      <a className="core-skip" href="#workspace-main">Skip to workspace</a>
      <aside className="core-sidebar">
        <Brand />
        <div className="workspace-label"><span>Workspace</span><strong>Demo / Myanmar</strong></div>
        <nav className="core-nav" aria-label="Application">
          {navigation.map((item) => (
            <NavLink className={({ isActive }) => isActive ? 'active' : ''} end={item.end} key={item.to} to={item.to}>
              <span>{item.index}</span>{item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <RuntimeBadge status={runtime.status} />
          <p>Private demo state stays in this browser until a managed workspace is configured.</p>
          <a href="https://supermega.dev/contact/">Configure a live workspace ↗</a>
        </div>
      </aside>
      <div className="core-stage">
        <header className="core-topbar">
          <div className="mobile-brand"><Brand /></div>
          <div><span className="terminal-prompt">&gt;_</span><strong>Operating workspace</strong></div>
          <div className="topbar-meta"><span>MMK</span><span>UTC+06:30</span><RuntimeBadge status={runtime.status} /></div>
        </header>
        <nav className="mobile-nav" aria-label="Mobile application">
          {navigation.map((item) => <NavLink className={({ isActive }) => isActive ? 'active' : ''} end={item.end} key={item.to} to={item.to}>{item.label}</NavLink>)}
        </nav>
        <main id="workspace-main" className="core-main"><Outlet context={runtime} /></main>
      </div>
    </div>
  )
}

function PageHeading({ eyebrow, title, copy, actions }: { eyebrow: string; title: string; copy: string; actions?: ReactNode }) {
  return (
    <section className="page-heading">
      <div><span className="core-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>
      {actions ? <div className="heading-actions">{actions}</div> : null}
    </section>
  )
}

function Metric({ label, value, note, tone = 'blue' }: { label: string; value: string; note: string; tone?: 'blue' | 'green' | 'neutral' }) {
  return <article className={`metric-card ${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state"><span>&gt;_</span><p>{children}</p></div>
}

export function OverviewPage() {
  const [shop] = useStoredState(SHOP_KEY, seedShop)
  const [plant] = useStoredState(PLANT_KEY, seedPlant)
  const [approvals] = useStoredState<Approval[]>(APPROVAL_KEY, [])
  const [tasks, setTasks] = useStoredState<CommandTask[]>(COMMAND_KEY, seedCommandTasks, normalizeCommandTasks)
  const [setup] = useStoredState<SetupState>(SETUP_KEY, { product: 'shop', template: setupTemplates.shop[0], workspace: '', owner: '' })
  const [taskTitle, setTaskTitle] = useState('')
  const [taskOwner, setTaskOwner] = useState<CommandRoleId>('product')
  const exceptions = shop.items.filter((item) => item.onHand <= item.reorderAt).length + plant.issues.filter((issue) => issue.status === 'open').length
  const openTasks = tasks.filter((task) => task.status !== 'done')
  const activeTasks = tasks.filter((task) => task.status === 'in_progress')
  const pendingApprovals = approvals.filter((item) => item.status === 'pending')
  const humanOwner = setup.owner.trim() || 'Workspace owner'
  const selectedRole = getCommandRole(taskOwner)
  const roleWorkloads = commandRoles.map((role) => {
    const roleTasks = tasks.filter((task) => task.owner === role.id)
    return {
      ...role,
      open: roleTasks.filter((task) => task.status !== 'done').length,
      active: roleTasks.filter((task) => task.status === 'in_progress').length,
      done: roleTasks.filter((task) => task.status === 'done').length,
    }
  })

  function assignTask(event: FormEvent) {
    event.preventDefault()
    if (!taskTitle.trim()) return
    const task: CommandTask = {
      id: uid('TASK'),
      createdAt: new Date().toISOString(),
      title: taskTitle.trim(),
      owner: taskOwner,
      status: 'queued',
    }
    setTasks((current) => [task, ...current])
    setTaskTitle('')
  }

  function advanceTask(taskId: string) {
    setTasks((current) => current.map((task) => task.id === taskId
      ? { ...task, status: task.status === 'queued' ? 'in_progress' : task.status === 'in_progress' ? 'done' : 'queued' }
      : task))
  }

  function reassignTask(taskId: string, owner: CommandRoleId) {
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, owner } : task))
  }

  return (
    <>
      <PageHeading eyebrow="Command / 01" title="Run the company. Keep the proof." copy="A practical operations desk for accountable work across product, engineering, operations, growth, and finance. Role agents organize local demo records; a responsible person retains authority." actions={<Link className="core-button primary" to="/setup/">Configure workspace</Link>} />
      <section className="metric-row" aria-label="Workspace overview">
        <Metric label="Open work" value={String(openTasks.length)} note="Role-owned Command tasks" />
        <Metric label="In progress" value={String(activeTasks.length)} note="Actively tracked local work" tone="green" />
        <Metric label="Open exceptions" value={String(exceptions)} note="Shop and Plant records needing review" tone="neutral" />
        <Metric label="Approval gate" value={String(pendingApprovals.length)} note="No external action runs automatically" tone="neutral" />
      </section>
      <section className="core-panel command-roster-panel" aria-labelledby="command-roster-title">
        <div className="panel-head">
          <div><span className="core-eyebrow">Accountability roster</span><h2 id="command-roster-title">Five desks. Explicit authority.</h2></div>
          <span className="panel-note">Human owner<br /><strong>{humanOwner}</strong></span>
        </div>
        <div className="command-roster-grid">
          {roleWorkloads.map((role, index) => (
            <article className="command-role-card" key={role.id}>
              <div className="role-card-head">
                <div><span>ROLE {String(index + 1).padStart(2, '0')}</span><h3>{role.label}</h3><small>{role.agent}</small></div>
                <div className="role-load" aria-label={`${role.open} open tasks`}><strong>{role.open}</strong><span>open</span></div>
              </div>
              <p>{role.authority}</p>
              <div className="role-boundary"><span>Boundary</span><p>{role.boundary}</p></div>
              <small className="role-activity">{role.active} active · {role.done} done</small>
            </article>
          ))}
        </div>
        <p className="roster-guardrail"><strong>Human authority:</strong> {humanOwner} reviews external sends, payments, publishing, production changes, and approvals. These demo agents only organize browser-local work.</p>
      </section>
      <div className="workspace-grid command-grid">
        <section className="core-panel">
          <div className="panel-head"><div><span className="core-eyebrow">Assign work</span><h2>Command intake</h2></div><span className="status-pill bounded">Reviewable</span></div>
          <form className="core-form" onSubmit={assignTask}>
            <label>Work item<input maxLength={160} required value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Example: Verify the daily close variance" /></label>
            <label>Accountable role<select value={taskOwner} onChange={(event) => setTaskOwner(event.target.value as CommandRoleId)}>{commandRoles.map((role) => <option key={role.id} value={role.id}>{role.label} · {role.agent}</option>)}</select></label>
            <div className="assignment-scope">
              <span>{selectedRole.agent}</span>
              <strong>{selectedRole.authority}</strong>
              <small>Boundary · {selectedRole.boundary}</small>
            </div>
            <button className="core-button primary wide" type="submit">Assign to command queue</button>
            <p className="form-notice">Assignment records role responsibility under {humanOwner}; it does not trigger an external action.</p>
          </form>
        </section>
        <section className="core-panel">
          <div className="panel-head"><div><span className="core-eyebrow">Owned work</span><h2>Command queue</h2></div><span className="panel-note">{openTasks.length} open<br />Human: {humanOwner}</span></div>
          <div className="command-list">
            {tasks.length ? tasks.slice(0, 8).map((task) => {
              const role = getCommandRole(task.owner)
              return (
                <article key={task.id}>
                  <div className="task-copy">
                    <div className="task-labels"><span className={`status-pill ${task.status === 'done' ? 'approved' : task.status === 'in_progress' ? 'bounded' : 'pending'}`}>{task.status.replace('_', ' ')}</span><span className="task-role">{role.label}</span></div>
                    <strong>{task.title}</strong>
                    <small>{task.id} · {role.agent} · {formatTime(task.createdAt)}</small>
                  </div>
                  <div className="task-controls">
                    <label><span>Assign role</span><select aria-label={`Assign ${task.title}`} value={role.id} onChange={(event) => reassignTask(task.id, event.target.value as CommandRoleId)}>{commandRoles.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
                    <button className="table-action" type="button" onClick={() => advanceTask(task.id)}>{task.status === 'queued' ? 'Start' : task.status === 'in_progress' ? 'Complete' : 'Reopen'}</button>
                  </div>
                </article>
              )
            }) : <Empty>No assigned work yet.</Empty>}
          </div>
        </section>
      </div>
      <section className="product-launch-grid">
        <Link className="launch-card shop" to="/shop/">
          <span className="card-index">02 / Commerce OS</span><h2>Shop</h2><p>Sell, control stock, review payments, and close the day from one record.</p><strong>Open Shop <span>→</span></strong>
        </Link>
        <Link className="launch-card plant" to="/plant/">
          <span className="card-index">03 / Production OS</span><h2>Plant</h2><p>Track jobs, output, machine state, quality issues, and shift handoff.</p><strong>Open Plant <span>→</span></strong>
        </Link>
        <Link className="launch-card assist" to="/assist/">
          <span className="card-index">04 / Governed assistance</span><h2>Assist</h2><p>Build an evidence-grounded brief and route draft actions through approval.</p><strong>Open Assist <span>→</span></strong>
        </Link>
      </section>
      <section className="control-strip"><div><span className="core-eyebrow">Operating rule</span><h2>AI prepares. A responsible person approves.</h2></div><p>Shop and Plant remain the systems of record. Assistance reads their approved records, shows evidence, and cannot send, pay, publish, or change production on its own.</p></section>
    </>
  )
}

export function ShopPage() {
  const [shop, setShop] = useStoredState(SHOP_KEY, seedShop)
  const [sku, setSku] = useState(shop.items[0]?.sku ?? '')
  const [quantity, setQuantity] = useState(1)
  const [payment, setPayment] = useState('KBZPay')
  const [notice, setNotice] = useState('')
  const selected = shop.items.find((item) => item.sku === sku) ?? shop.items[0]
  const revenue = shop.sales.reduce((total, sale) => total + sale.total, 0)
  const lowStock = shop.items.filter((item) => item.onHand <= item.reorderAt)

  function recordSale(event: FormEvent) {
    event.preventDefault()
    if (!selected || quantity < 1 || selected.onHand < quantity) {
      setNotice('Quantity is not available. Review stock before selling.')
      return
    }
    const sale: ShopSale = { id: uid('SALE'), createdAt: new Date().toISOString(), item: selected.name, quantity, payment, total: selected.price * quantity }
    setShop((current) => ({ ...current, items: current.items.map((item) => item.sku === selected.sku ? { ...item, onHand: item.onHand - quantity } : item), sales: [sale, ...current.sales] }))
    setQuantity(1)
    setNotice(`${sale.id} recorded · ${formatMoney(sale.total)}`)
  }

  function restock(itemSku: string) {
    setShop((current) => ({ ...current, items: current.items.map((item) => item.sku === itemSku ? { ...item, onHand: item.onHand + 10 } : item) }))
    setNotice(`${itemSku} received +10 units`)
  }

  function closeDay() {
    const close = { id: uid('CLOSE'), createdAt: new Date().toISOString(), total: revenue, transactions: shop.sales.length }
    setShop((current) => ({ ...current, closes: [close, ...current.closes] }))
    setNotice(`${close.id} saved. This creates an audit snapshot; it does not delete today’s transactions.`)
  }

  return (
    <>
      <PageHeading eyebrow="Shop / 02" title="Counter to close, one record." copy="A focused commerce workspace for sales, local payments, stock, and daily control." actions={<button className="core-button" onClick={closeDay} type="button">Close day</button>} />
      <section className="metric-row compact">
        <Metric label="Revenue" value={formatMoney(revenue)} note="Current demo ledger" />
        <Metric label="Transactions" value={String(shop.sales.length)} note="Each sale updates stock" tone="green" />
        <Metric label="Low stock" value={String(lowStock.length)} note="At or below reorder point" tone={lowStock.length ? 'neutral' : 'green'} />
        <Metric label="Close snapshots" value={String(shop.closes.length)} note="Reviewable daily checkpoints" tone="neutral" />
      </section>
      <div className="workspace-grid">
        <section className="core-panel sale-panel">
          <div className="panel-head"><div><span className="core-eyebrow">New sale</span><h2>Register</h2></div><span className="status-pill ready">Ready</span></div>
          <form className="core-form" onSubmit={recordSale}>
            <label>Item<select value={sku} onChange={(event) => setSku(event.target.value)}>{shop.items.map((item) => <option key={item.sku} value={item.sku}>{item.name} · {item.onHand} available</option>)}</select></label>
            <div className="form-row"><label>Quantity<input min="1" max={selected?.onHand ?? 1} type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label><label>Payment<select value={payment} onChange={(event) => setPayment(event.target.value)}><option>KBZPay</option><option>WavePay</option><option>Cash</option><option>Card</option></select></label></div>
            <div className="sale-total"><span>Total</span><strong>{formatMoney((selected?.price ?? 0) * Math.max(quantity, 0))}</strong></div>
            <button className="core-button primary wide" type="submit">Record sale</button>
            <p className="form-notice" aria-live="polite">{notice || 'Demo actions are stored only in this browser.'}</p>
          </form>
        </section>
        <section className="core-panel span-two">
          <div className="panel-head"><div><span className="core-eyebrow">Stock control</span><h2>Inventory</h2></div><span className="panel-note">Receive +10 is an isolated demo action</span></div>
          <div className="data-table" role="table" aria-label="Shop inventory">
            <div className="data-row table-head" role="row"><span>Item</span><span>On hand</span><span>Reorder</span><span>Price</span><span>Action</span></div>
            {shop.items.map((item) => <div className="data-row" role="row" key={item.sku}><span><strong>{item.name}</strong><small>{item.sku}</small></span><span className={item.onHand <= item.reorderAt ? 'warning-text' : ''}>{item.onHand}</span><span>{item.reorderAt}</span><span>{formatMoney(item.price)}</span><span><button className="table-action" type="button" onClick={() => restock(item.sku)}>Receive +10</button></span></div>)}
          </div>
        </section>
      </div>
      <section className="core-panel ledger-panel">
        <div className="panel-head"><div><span className="core-eyebrow">Audit trail</span><h2>Recent sales</h2></div><span className="panel-note">Newest first</span></div>
        {shop.sales.length ? <div className="activity-list">{shop.sales.slice(0, 8).map((sale) => <article key={sale.id}><span className="activity-icon">↳</span><div><strong>{sale.item} × {sale.quantity}</strong><small>{sale.id} · {sale.payment} · {formatTime(sale.createdAt)}</small></div><b>{formatMoney(sale.total)}</b></article>)}</div> : <Empty>No transactions recorded yet.</Empty>}
      </section>
    </>
  )
}

export function PlantPage() {
  const [plant, setPlant] = useStoredState(PLANT_KEY, seedPlant)
  const [jobId, setJobId] = useState(plant.jobs[0]?.id ?? '')
  const [quantity, setQuantity] = useState(25)
  const [area, setArea] = useState('Line 01')
  const [summary, setSummary] = useState('')
  const [notice, setNotice] = useState('')
  const output = plant.jobs.reduce((total, job) => total + job.output, 0)
  const target = plant.jobs.reduce((total, job) => total + job.target, 0)
  const openIssues = plant.issues.filter((issue) => issue.status === 'open')

  function recordOutput(event: FormEvent) {
    event.preventDefault()
    if (quantity < 1) return
    const selectedJob = plant.jobs.find((job) => job.id === jobId)
    if (!selectedJob) {
      setNotice('Choose an active job before recording output.')
      return
    }
    const recordedQuantity = Math.min(quantity, Math.max(0, selectedJob.target - selectedJob.output))
    if (recordedQuantity < 1) {
      setNotice(`${jobId} is already at target. No output was recorded.`)
      return
    }
    setPlant((current) => ({ ...current, jobs: current.jobs.map((job) => job.id === jobId ? { ...job, output: job.output + recordedQuantity } : job) }))
    setNotice(`${jobId} output updated +${recordedQuantity}${recordedQuantity < quantity ? ` (limited to the ${selectedJob.target.toLocaleString()} target)` : ''}.`)
  }

  function createIssue(event: FormEvent) {
    event.preventDefault()
    if (!summary.trim()) return
    const issue: PlantIssue = { id: uid('ISS'), createdAt: new Date().toISOString(), area, summary: summary.trim(), status: 'open' }
    setPlant((current) => ({ ...current, issues: [issue, ...current.issues] }))
    setSummary('')
    setNotice(`${issue.id} opened for ${issue.area}.`)
  }

  function resolveIssue(issueId: string) {
    setPlant((current) => ({ ...current, issues: current.issues.map((issue) => issue.id === issueId ? { ...issue, status: 'resolved' } : issue) }))
    setNotice(`${issueId} marked resolved.`)
  }

  function cycleMachine(machineId: string) {
    const next = { running: 'attention', attention: 'stopped', stopped: 'running' } as const
    setPlant((current) => ({ ...current, machines: current.machines.map((machine) => machine.id === machineId ? { ...machine, state: next[machine.state] } : machine) }))
  }

  return (
    <>
      <PageHeading eyebrow="Plant / 03" title="Plan, run, confirm, hand off." copy="A generic production workspace for job output, machine state, exceptions, and management review—without client data or client branding." />
      <section className="metric-row compact">
        <Metric label="Output" value={output.toLocaleString()} note={`${Math.round((output / target) * 100)}% of current target`} tone="green" />
        <Metric label="Target" value={target.toLocaleString()} note="Across active jobs" />
        <Metric label="Open issues" value={String(openIssues.length)} note="Requires human ownership" tone={openIssues.length ? 'neutral' : 'green'} />
        <Metric label="Machines running" value={`${plant.machines.filter((item) => item.state === 'running').length} / ${plant.machines.length}`} note="Demo state, not telemetry" tone="neutral" />
      </section>
      <div className="workspace-grid plant-grid">
        <section className="core-panel span-two">
          <div className="panel-head"><div><span className="core-eyebrow">Production plan</span><h2>Active jobs</h2></div><span className="panel-note">Output is capped at target</span></div>
          <div className="job-list">{plant.jobs.map((job) => { const progress = Math.min(100, Math.round((job.output / job.target) * 100)); return <article key={job.id}><div><span>{job.id} · {job.line}</span><strong>{job.product}</strong></div><div className="job-progress"><span><i style={{ width: `${progress}%` }} /></span><small>{job.output.toLocaleString()} / {job.target.toLocaleString()} · {progress}%</small></div></article> })}</div>
          <form className="inline-form" onSubmit={recordOutput}><label>Job<select value={jobId} onChange={(event) => setJobId(event.target.value)}>{plant.jobs.map((job) => <option key={job.id}>{job.id}</option>)}</select></label><label>Good output<input min="1" type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label><button className="core-button primary" type="submit">Record output</button></form>
        </section>
        <section className="core-panel">
          <div className="panel-head"><div><span className="core-eyebrow">Equipment</span><h2>Machine state</h2></div></div>
          <div className="machine-list">{plant.machines.map((machine) => <button key={machine.id} type="button" onClick={() => cycleMachine(machine.id)}><span className={`machine-dot ${machine.state}`} /><span><strong>{machine.name}</strong><small>{machine.id}</small></span><b>{machine.state}</b></button>)}</div>
          <p className="panel-footnote">Select a machine to cycle its isolated demo state. A live workspace accepts state only from authorized operators or approved telemetry.</p>
        </section>
        <section className="core-panel">
          <div className="panel-head"><div><span className="core-eyebrow">Exception</span><h2>Open an issue</h2></div></div>
          <form className="core-form" onSubmit={createIssue}><label>Area<select value={area} onChange={(event) => setArea(event.target.value)}><option>Line 01</option><option>Line 02</option><option>Line 03</option><option>Materials</option><option>Quality</option></select></label><label>What needs review?<textarea maxLength={240} required value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Describe the observation, not the assumption." /></label><button className="core-button primary wide" type="submit">Open issue</button><p className="form-notice" aria-live="polite">{notice || 'Issues remain open until a responsible person resolves them.'}</p></form>
        </section>
      </div>
      <section className="core-panel ledger-panel">
        <div className="panel-head"><div><span className="core-eyebrow">Shift review</span><h2>Issue register</h2></div><span className="panel-note">{openIssues.length} open</span></div>
        {plant.issues.length ? <div className="activity-list">{plant.issues.map((issue) => <article key={issue.id}><span className={`activity-icon ${issue.status}`}>{issue.status === 'open' ? '!' : '✓'}</span><div><strong>{issue.summary}</strong><small>{issue.id} · {issue.area} · {formatTime(issue.createdAt)}</small></div>{issue.status === 'open' ? <button className="table-action" onClick={() => resolveIssue(issue.id)} type="button">Resolve</button> : <b className="resolved-text">Resolved</b>}</article>)}</div> : <Empty>No plant issues recorded.</Empty>}
      </section>
    </>
  )
}

export function AssistPage() {
  const [shop] = useStoredState(SHOP_KEY, seedShop)
  const [plant] = useStoredState(PLANT_KEY, seedPlant)
  const [approvals, setApprovals] = useStoredState<Approval[]>(APPROVAL_KEY, [])
  const [brief, setBrief] = useState<string[]>([])
  const lowStock = shop.items.filter((item) => item.onHand <= item.reorderAt)
  const openIssues = plant.issues.filter((issue) => issue.status === 'open')
  const incompleteJobs = plant.jobs.filter((job) => job.output < job.target)

  function buildBrief() {
    const next = [
      `${shop.sales.length} Shop transactions total ${formatMoney(shop.sales.reduce((total, sale) => total + sale.total, 0))}.`,
      lowStock.length ? `${lowStock.length} Shop item${lowStock.length === 1 ? '' : 's'} reached the reorder boundary: ${lowStock.map((item) => item.name).join(', ')}.` : 'No Shop item is at its reorder boundary.',
      `${plant.jobs.length - incompleteJobs.length} of ${plant.jobs.length} Plant jobs reached target; ${openIssues.length} issue${openIssues.length === 1 ? ' remains' : 's remain'} open.`,
    ]
    setBrief(next)
  }

  function requestApproval() {
    const approval: Approval = {
      id: uid('APR'),
      createdAt: new Date().toISOString(),
      title: lowStock.length ? `Review purchase draft for ${lowStock.map((item) => item.sku).join(', ')}` : 'Review current operating brief',
      evidence: ['Shop inventory ledger', 'Shop sales ledger', 'Plant job records', 'Plant issue register'],
      status: 'pending',
    }
    setApprovals((current) => [approval, ...current])
  }

  function setApprovalStatus(id: string, status: Approval['status']) {
    setApprovals((current) => current.map((approval) => approval.id === id ? { ...approval, status } : approval))
  }

  return (
    <>
      <PageHeading eyebrow="Assist / 04" title="Evidence first. Authority last." copy="Build a deterministic operating brief from Shop and Plant records, then route any proposed action through a visible approval gate." actions={<button className="core-button primary" onClick={buildBrief} type="button">Build current brief</button>} />
      <div className="assist-grid">
        <section className="core-panel assist-output">
          <div className="panel-head"><div><span className="core-eyebrow">Operating brief</span><h2>Current evidence</h2></div><span className="status-pill bounded">Bounded</span></div>
          {brief.length ? <div className="brief-output"><div className="brief-command"><span>&gt;</span> summarize approved operational records</div>{brief.map((line) => <p key={line}>{line}</p>)}<div className="evidence-box"><strong>Sources used</strong><span>Shop inventory ledger</span><span>Shop sales ledger</span><span>Plant job records</span><span>Plant issue register</span></div><button className="core-button" onClick={requestApproval} type="button">Create approval request</button></div> : <Empty>Build a brief to inspect the current browser workspace. No external model is called in this transparent demo mode.</Empty>}
        </section>
        <aside className="core-panel guardrail-panel">
          <span className="core-eyebrow">Authority boundary</span><h2>What Assist can do</h2>
          <ul className="control-list"><li><i>✓</i><span><strong>Read</strong> approved demo records</span></li><li><i>✓</i><span><strong>Summarize</strong> observable state</span></li><li><i>✓</i><span><strong>Draft</strong> a review request</span></li><li className="blocked"><i>×</i><span><strong>Cannot</strong> send, pay, publish, or alter production</span></li></ul>
          <p>Model-backed assistance is activated only in a configured workspace with server-held credentials, source controls, evaluation, and audit.</p>
        </aside>
      </div>
      <section className="core-panel ledger-panel">
        <div className="panel-head"><div><span className="core-eyebrow">Human control</span><h2>Approval queue</h2></div><span className="panel-note">Approval records intent; it triggers no external side effect in demo mode.</span></div>
        {approvals.length ? <div className="approval-list">{approvals.map((approval) => <article key={approval.id}><div><span className={`status-pill ${approval.status}`}>{approval.status}</span><strong>{approval.title}</strong><small>{approval.id} · {formatTime(approval.createdAt)} · {approval.evidence.length} evidence sources</small></div>{approval.status === 'pending' ? <div><button className="table-action" type="button" onClick={() => setApprovalStatus(approval.id, 'declined')}>Decline</button><button className="core-button compact" type="button" onClick={() => setApprovalStatus(approval.id, 'approved')}>Approve record</button></div> : null}</article>)}</div> : <Empty>No approval requests yet.</Empty>}
      </section>
    </>
  )
}

const setupTemplates = {
  shop: ['Retail counter', 'Restaurant and inventory', 'Service and bookings', 'Multi-branch control'],
  plant: ['Production control', 'Maintenance and downtime', 'Quality and traceability', 'Material receiving'],
}

export function SetupPage() {
  const [setup, setSetup] = useStoredState<SetupState>(SETUP_KEY, { product: 'shop', template: setupTemplates.shop[0], workspace: '', owner: '' })
  const [shop] = useStoredState(SHOP_KEY, seedShop)
  const [plant] = useStoredState(PLANT_KEY, seedPlant)
  const [approvals] = useStoredState<Approval[]>(APPROVAL_KEY, [])
  const [tasks] = useStoredState<CommandTask[]>(COMMAND_KEY, seedCommandTasks, normalizeCommandTasks)
  const [notice, setNotice] = useState('')
  const [resetArmed, setResetArmed] = useState(false)
  const evidenceDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Yangon' }).format(new Date())
  const evidenceFilename = `supermega-trial-evidence-${evidenceDate}.json`
  const evidenceHref = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({
    contract: 'supermega_trial_evidence',
    version: 1,
    exportedAt: new Date().toISOString(),
    environment: 'isolated_demo',
    setup,
    shop,
    plant,
    approvals,
    tasks,
  }, null, 2))}`

  function changeProduct(product: SetupState['product']) {
    setSetup((current) => ({ ...current, product, template: setupTemplates[product][0] }))
  }

  function save(event: FormEvent) {
    event.preventDefault()
    const savedAt = new Date().toISOString()
    setSetup((current) => ({ ...current, savedAt }))
    setNotice('Setup draft saved in this browser. No source or account was connected.')
  }

  function resetDemoWorkspace() {
    ;[SHOP_KEY, PLANT_KEY, APPROVAL_KEY, SETUP_KEY, COMMAND_KEY].forEach((key) => window.localStorage.removeItem(key))
    window.location.assign('/')
  }

  return (
    <>
      <PageHeading eyebrow="Setup / 05" title="Start with one accountable workflow." copy="Choose the operating base, name the workspace owner, and preserve a handoff that can be reviewed before any live data is connected." />
      <div className="setup-layout">
        <form className="core-panel setup-form" onSubmit={save}>
          <div className="panel-head"><div><span className="core-eyebrow">Workspace draft</span><h2>Configuration</h2></div></div>
          <fieldset><legend>Product</legend><div className="choice-grid"><button className={setup.product === 'shop' ? 'selected' : ''} type="button" onClick={() => changeProduct('shop')}><span>02</span><strong>Shop</strong><small>Commerce operation</small></button><button className={setup.product === 'plant' ? 'selected' : ''} type="button" onClick={() => changeProduct('plant')}><span>03</span><strong>Plant</strong><small>Production operation</small></button></div></fieldset>
          <label>Starting template<select value={setup.template} onChange={(event) => setSetup((current) => ({ ...current, template: event.target.value }))}>{setupTemplates[setup.product].map((template) => <option key={template}>{template}</option>)}</select></label>
          <label>Workspace name<input maxLength={80} required value={setup.workspace} onChange={(event) => setSetup((current) => ({ ...current, workspace: event.target.value }))} placeholder={setup.product === 'shop' ? 'Example: Downtown Store' : 'Example: Main Production Site'} /></label>
          <label>Responsible owner<input maxLength={80} required value={setup.owner} onChange={(event) => setSetup((current) => ({ ...current, owner: event.target.value }))} placeholder="Name or role" /></label>
          <button className="core-button primary wide" type="submit">Save setup draft</button>
          <p className="form-notice" aria-live="polite">{notice || (setup.savedAt ? `Last saved ${formatTime(setup.savedAt)}` : 'Draft data stays in this browser.')}</p>
        </form>
        <aside className="core-panel lifecycle-panel"><span className="core-eyebrow">Go-live lifecycle</span><h2>From demo to dependable operation</h2><ol><li><span>01</span><div><strong>Map</strong><p>Confirm roles, records, decisions, and the acceptance boundary.</p></div></li><li><span>02</span><div><strong>Configure</strong><p>Set product template, workspace rules, and approved source contract.</p></div></li><li><span>03</span><div><strong>Trial</strong><p>Use isolated data; test daily close, handoff, backup, and recovery.</p></div></li><li><span>04</span><div><strong>Activate</strong><p>Connect managed persistence only after access and evidence checks pass.</p></div></li><li><span>05</span><div><strong>Improve</strong><p>Add governed assistance after the workflow is stable and measurable.</p></div></li></ol><a className="core-button" href="https://supermega.dev/contact/">Request implementation ↗</a></aside>
      </div>
      <section className="core-panel trial-control-panel">
        <div><span className="core-eyebrow">Trial controls</span><h2>Keep the evidence. Reset deliberately.</h2><p>Export the complete browser workspace for review, or explicitly reset all demo records back to the sample state.</p></div>
        <div className="trial-actions">
          <a className="core-button" download={evidenceFilename} href={evidenceHref} onClick={() => setNotice('Trial evidence exported. Review the JSON before sharing it.')}>Export trial evidence</a>
          {resetArmed ? <><button className="table-action" onClick={() => setResetArmed(false)} type="button">Cancel</button><button className="core-button danger" onClick={resetDemoWorkspace} type="button">Confirm reset</button></> : <button className="table-action danger-text" onClick={() => setResetArmed(true)} type="button">Reset demo workspace</button>}
        </div>
      </section>
    </>
  )
}

export function TrustPage() {
  const runtime = useOutletContext<RuntimeHealth>()
  const controls = [
    ['Private demo boundary', 'This public app uses isolated browser state and contains no client workspace or client data.'],
    ['Managed system of record', 'Production activation requires managed Postgres, explicit workspace ownership, and tested recovery.'],
    ['Role and row boundaries', 'Every production read and write must be limited by workspace and role; exposed Supabase tables require RLS.'],
    ['Server-held credentials', 'Service-role and model credentials stay on the server and are never included in the browser bundle.'],
    ['Human approval', 'External sends, payments, publishing, production changes, and irreversible actions require accountable approval.'],
    ['Observable release', 'Build identity, health, route checks, and rollback ownership are part of promotion—not post-launch cleanup.'],
  ]
  return (
    <>
      <PageHeading eyebrow="Trust / 06" title="Authority is earned, bounded, and reviewable." copy="The demo proves the interaction model. Production readiness is a separate gate covering identity, data, evidence, recovery, and release ownership." />
      <section className="readiness-grid" aria-label="Runtime readiness">
        <article className="core-panel readiness-card"><span>Runtime</span><strong>{runtime.serviceStatus}</strong><small>Health endpoint status</small></article>
        <article className="core-panel readiness-card"><span>Managed data</span><strong>{runtime.enterpriseDbReady ? 'Ready' : 'Not connected'}</strong><small>Tenant system of record</small></article>
        <article className="core-panel readiness-card"><span>Security gate</span><strong>{runtime.securityReady ? 'Ready' : 'Not ready'}</strong><small>Production identity boundary</small></article>
        <article className="core-panel readiness-card"><span>Source coverage</span><strong>{runtime.coverageScore}%</strong><small>Approved operational sources</small></article>
      </section>
      {runtime.status !== 'enterprise' ? <section className="core-panel requirement-panel"><div><span className="core-eyebrow">Activation requirements</span><h2>Enterprise mode remains locked.</h2></div><ul>{(runtime.requirements.length ? runtime.requirements : ['Configure managed tenant persistence.', 'Verify production identity and source coverage.']).map((requirement) => <li key={requirement}>{requirement}</li>)}</ul></section> : null}
      <section className="trust-grid">{controls.map(([title, copy], index) => <article className="core-panel" key={title}><span>0{index + 1}</span><h2>{title}</h2><p>{copy}</p></article>)}</section>
      <section className="control-strip"><div><span className="core-eyebrow">Current environment</span><h2>Demo-ready is not enterprise-ready.</h2></div><p>The live health boundary must continue to report managed persistence and source coverage truthfully. Until those checks pass, this app is an isolated product demonstration—not a customer system of record.</p></section>
    </>
  )
}
