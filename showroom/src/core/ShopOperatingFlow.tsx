import { buildShopOperatingFlow, type ShopOperatingFlowInput } from './shop-operating-flow'

type ShopOperatingFlowProps = ShopOperatingFlowInput & {
  disabled: boolean
  onOpenOrder: (mode: 'manual' | 'online') => void
}

export function ShopOperatingFlow({ disabled, onOpenOrder, ...input }: ShopOperatingFlowProps) {
  const flow = buildShopOperatingFlow(input)
  const opensComposer = flow.next.orderMode !== undefined

  return <section aria-label="Shop operating flow" className="shop-operating-flow">
    <div className="shop-next-work">
      <div><span className="core-eyebrow">Next work</span><strong>{flow.next.title}</strong><small>{flow.next.detail}</small></div>
      {opensComposer
        ? <button className="core-button primary compact" disabled={disabled} onClick={() => onOpenOrder(flow.next.orderMode!)} type="button">{flow.next.action}</button>
        : <a className="core-button compact" href={flow.next.target}>{flow.next.action}</a>}
    </div>
    <ol className="shop-flow-stages">
      {flow.stages.map((stage) => <li className={stage.count ? 'has-work' : undefined} key={stage.id}>
        <a href={stage.target}><span>{stage.label}</span><b>{stage.count}</b><small>{stage.detail}</small></a>
      </li>)}
    </ol>
  </section>
}
