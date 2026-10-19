import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import type { ManagedCommercePublicContact } from '../products/ecommerce/managed-commerce-public'
import { readUiLocale, uiText } from './ui-locale'

type BuyerContactPanel =
  | { identityKey: string; status: 'loading' | 'unavailable' }
  | { identityKey: string; status: 'ready'; contact: ManagedCommercePublicContact }

type ShopBuyerContactDisclosureProps = {
  loadBuyerContact: ((shopRequestId: string) => Promise<ManagedCommercePublicContact>) | null
  shopRequestId: string
  workspaceIdentityKey: string
}

const shopRequestIdPattern = /^ECR-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/

export function ShopBuyerContactDisclosure({ loadBuyerContact, shopRequestId, workspaceIdentityKey }: ShopBuyerContactDisclosureProps) {
  const [panel, setPanel] = useState<BuyerContactPanel | null>(null)
  const requestEpoch = useRef(0)
  const canReadBuyerContact = Boolean(loadBuyerContact && workspaceIdentityKey)
  useEffect(() => () => { requestEpoch.current += 1 }, [])
  useEffect(() => {
    // Hide immediately during render when access disappears; this effect also invalidates
    // any request already in flight so a late response cannot restore revoked contact data.
    requestEpoch.current += 1
    setPanel(null)
  }, [canReadBuyerContact, workspaceIdentityKey])

  async function onToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    if (!event.currentTarget.open) {
      requestEpoch.current += 1
      setPanel(null)
      return
    }
    if (!shopRequestIdPattern.test(shopRequestId)) return
    if (!loadBuyerContact || !workspaceIdentityKey) {
      setPanel({ identityKey: workspaceIdentityKey, status: 'unavailable' })
      return
    }
    if (panel?.identityKey === workspaceIdentityKey && (panel.status === 'loading' || panel.status === 'ready')) return

    const epoch = ++requestEpoch.current
    setPanel({ identityKey: workspaceIdentityKey, status: 'loading' })
    try {
      const contact = await loadBuyerContact(shopRequestId)
      if (epoch !== requestEpoch.current) return
      if (contact.shopRequestId !== shopRequestId) throw new Error('Buyer contact does not match this order.')
      setPanel({ identityKey: workspaceIdentityKey, status: 'ready', contact })
    } catch {
      if (epoch === requestEpoch.current) setPanel({ identityKey: workspaceIdentityKey, status: 'unavailable' })
    }
  }

  const visiblePanel = canReadBuyerContact && panel?.identityKey === workspaceIdentityKey ? panel : null
  return <details className="order-record-details" onToggle={onToggle}>
    <summary><span>{uiText('Contact')}</span><small>{uiText('Details')}</small></summary>
    <div>
      {visiblePanel?.status === 'loading' ? <small role="status">…</small> : null}
      {visiblePanel?.status === 'unavailable' ? <small role="alert">{readUiLocale() === 'my' ? 'ဝယ်သူ၏ ဆက်သွယ်ရန်အချက်အလက် မရနိုင်ပါ။' : 'Buyer contact is unavailable or has expired.'}</small> : null}
      {visiblePanel?.status === 'ready' ? <><strong>{visiblePanel.contact.contact.name}</strong><small>{uiText('Phone')}: {visiblePanel.contact.contact.phone}</small>{visiblePanel.contact.contact.address ? <small>{visiblePanel.contact.contact.address.line1} · {visiblePanel.contact.contact.address.township} · {visiblePanel.contact.contact.address.city}{visiblePanel.contact.contact.address.instructions ? ` · ${visiblePanel.contact.contact.address.instructions}` : ''}</small> : null}</> : null}
    </div>
  </details>
}
