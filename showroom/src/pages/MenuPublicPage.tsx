import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { resolveProductAppEntryRoute } from '../lib/demoSurfaces'
import {
  loadRestaurantWorkspace,
  parseRestaurantMenuSharePayload,
  type RestaurantMenuItem,
  type RestaurantMenuTransition,
} from '../lib/restaurantOperatingSystem'

type PublicMenuData = {
  branchName: string
  businessDate: string
  orderingMode: RestaurantMenuTransition['orderingMode']
  items: RestaurantMenuItem[]
}

function getPublicMenuData(): PublicMenuData | null {
  if (typeof window === 'undefined') {
    return null
  }
  const shared = parseRestaurantMenuSharePayload(window.location.hash)
  if (shared?.items.length) {
    return {
      branchName: shared.branchName,
      businessDate: shared.businessDate,
      orderingMode: shared.orderingMode === 'order-request' ? 'order-request' : 'digital-menu',
      items: shared.items,
    }
  }
  const workspace = loadRestaurantWorkspace()
  if (!workspace.menu.items.length) {
    return null
  }
  return {
    branchName: workspace.branchName,
    businessDate: workspace.businessDate,
    orderingMode: workspace.menu.orderingMode,
    items: workspace.menu.items,
  }
}

function groupMenuItems(items: RestaurantMenuItem[]) {
  const sections = new Map<string, RestaurantMenuItem[]>()
  for (const item of items) {
    sections.set(item.section, [...(sections.get(item.section) ?? []), item])
  }
  return [...sections.entries()]
}

export function MenuPublicPage() {
  const { menuSlug } = useParams()
  const posAppEntryRoute = resolveProductAppEntryRoute('restaurant-group-os', '/app/restaurant-pos')
  const menu = useMemo(() => getPublicMenuData(), [])
  const sections = useMemo(() => groupMenuItems(menu?.items ?? []), [menu?.items])
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [customerName, setCustomerName] = useState('')
  const [note, setNote] = useState('')
  const [orderText, setOrderText] = useState('')

  const selectedItems = (menu?.items ?? [])
    .map((item) => ({ ...item, quantity: quantities[item.id] ?? 0 }))
    .filter((item) => item.quantity > 0)
  const total = selectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0)

  function changeQuantity(itemId: string, delta: number) {
    setQuantities((current) => ({
      ...current,
      [itemId]: Math.max(0, (current[itemId] ?? 0) + delta),
    }))
  }

  function createOrderRequest() {
    const lines = selectedItems.map((item) => `${item.quantity} x ${item.name} - ${(item.quantity * item.price).toLocaleString()}`)
    const text = [
      `Order request for ${menu?.branchName ?? menuSlug}`,
      customerName ? `Customer: ${customerName}` : '',
      ...lines,
      `Total: ${total.toLocaleString()}`,
      note ? `Note: ${note}` : '',
    ].filter(Boolean).join('\n')
    setOrderText(text)
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(text)
    }
  }

  if (!menu) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center">
          <p className="sm-kicker text-[var(--sm-accent)]">Menu not published</p>
          <h1 className="mt-4 text-4xl font-black text-white">This customer menu has no shared payload yet.</h1>
          <p className="mt-4 text-[var(--sm-muted)]">
            Open Restaurant POS + Inventory, generate the customer menu, then scan the generated code. Production mode will publish this to the shared backend.
          </p>
          <Link className="sm-button-primary mt-8 inline-flex" to={posAppEntryRoute}>
            Open Restaurant POS + Inventory
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 lg:py-16">
      <section className="rounded-[2.2rem] border border-[#eadfcd] bg-[#fffdf8] p-5 text-[#211a14] shadow-[0_24px_80px_-56px_rgba(0,0,0,0.45)] md:p-8">
        <div className="flex flex-col gap-5 border-b border-[#eadfcd] pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#9b6b2d]">{menu.orderingMode === 'order-request' ? 'Order request menu' : 'Digital menu'}</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">{menu.branchName}</h1>
            <p className="mt-2 text-sm text-[#6b6258]">{menu.businessDate || menuSlug}</p>
          </div>
          <Link className="rounded-full border border-[#eadfcd] px-4 py-2 text-sm font-bold text-[#211a14]" to={posAppEntryRoute}>
            Powered by SuperMega
          </Link>
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-8">
            {sections.map(([section, items]) => (
              <section key={section}>
                <h2 className="text-sm font-black uppercase tracking-[0.18em] text-[#9b6b2d]">{section}</h2>
                <div className="mt-3 divide-y divide-[#eadfcd]">
                  {items.map((item) => (
                    <article className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-start" key={item.id}>
                      <div>
                        <p className="text-lg font-black">{item.name}</p>
                        {item.description ? <p className="mt-1 text-sm text-[#6b6258]">{item.description}</p> : null}
                      </div>
                      <div className="flex items-center gap-3 sm:justify-end">
                        <span className="font-black">{item.price.toLocaleString()}</span>
                        {menu.orderingMode === 'order-request' ? (
                          <div className="flex items-center rounded-full border border-[#eadfcd] bg-white">
                            <button className="px-3 py-1 font-black" onClick={() => changeQuantity(item.id, -1)} type="button">-</button>
                            <span className="min-w-6 text-center text-sm font-black">{quantities[item.id] ?? 0}</span>
                            <button className="px-3 py-1 font-black" onClick={() => changeQuantity(item.id, 1)} type="button">+</button>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <aside className="rounded-[1.5rem] border border-[#eadfcd] bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#9b6b2d]">Order request</p>
            {menu.orderingMode === 'order-request' ? (
              <div className="mt-4 grid gap-3">
                <input className="rounded-2xl border border-[#eadfcd] px-4 py-3 text-sm outline-none" onChange={(event) => setCustomerName(event.target.value)} placeholder="Your name" value={customerName} />
                <textarea className="min-h-24 rounded-2xl border border-[#eadfcd] px-4 py-3 text-sm outline-none" onChange={(event) => setNote(event.target.value)} placeholder="Table, pickup time, notes" value={note} />
                <div className="rounded-2xl bg-[#fbf7ef] p-3">
                  {selectedItems.length ? selectedItems.map((item) => (
                    <p className="flex justify-between gap-3 text-sm" key={item.id}>
                      <span>{item.quantity} x {item.name}</span>
                      <strong>{(item.quantity * item.price).toLocaleString()}</strong>
                    </p>
                  )) : <p className="text-sm text-[#6b6258]">Select items from the menu.</p>}
                  <p className="mt-3 flex justify-between border-t border-[#eadfcd] pt-3 font-black">
                    <span>Total</span>
                    <span>{total.toLocaleString()}</span>
                  </p>
                </div>
                <button className="rounded-full bg-[#211a14] px-5 py-3 text-sm font-black text-white" disabled={!selectedItems.length} onClick={createOrderRequest} type="button">
                  Copy order request
                </button>
                {orderText ? <pre className="whitespace-pre-wrap rounded-2xl bg-[#fbf7ef] p-3 text-xs text-[#4b4037]">{orderText}</pre> : null}
              </div>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-[#6b6258]">This QR is a menu-only mode. Ask the server to place an order.</p>
            )}
          </aside>
        </div>
      </section>
    </main>
  )
}
