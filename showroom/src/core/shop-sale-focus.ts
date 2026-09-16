// Match the existing CSS overlay breakpoint. Desktop remains a non-modal aside.
export const SHOP_SALE_OVERLAY_QUERY = '(max-width: 840px)'

export function installShopSaleFocus(panel: HTMLElement, close: () => void, fallback: () => HTMLElement | null) {
  const doc = panel.ownerDocument
  const view = doc.defaultView
  if (!view) return () => {}
  const media = view.matchMedia(SHOP_SALE_OVERLAY_QUERY)
  const opener = doc.activeElement as HTMLElement | null
  const originalRole = panel.getAttribute('role')
  const originalModal = panel.getAttribute('aria-modal')
  let focusFrame: number | undefined
  let disposed = false
  const visible = (element: HTMLElement | null): element is HTMLElement => Boolean(element?.isConnected
    && element.getClientRects().length && view.getComputedStyle(element).visibility !== 'hidden')
  const nativeModalOpen = () => Boolean(doc.querySelector('dialog:modal'))
  const candidates = () => Array.from(panel.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,summary,[tabindex]'))
    .filter(element => element.tabIndex >= 0 && !element.matches(':disabled,[inert], [inert] *') && visible(element))
  const focusFirst = () => (candidates()[0] ?? panel).focus({ preventScroll: true })
  const restoreAttribute = (name: string, value: string | null) => value === null ? panel.removeAttribute(name) : panel.setAttribute(name, value)
  const syncMode = () => {
    if (focusFrame !== undefined) view.cancelAnimationFrame(focusFrame)
    if (media.matches) {
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-modal', 'true')
      if (!nativeModalOpen() && !panel.contains(doc.activeElement)) focusFirst()
      // A visibility transition can reject focus during the opening commit.
      // Retry after layout, but never displace a user's focus already inside.
      focusFrame = view.requestAnimationFrame(() => {
        focusFrame = undefined
        if (!disposed && media.matches && !nativeModalOpen() && !panel.contains(doc.activeElement)) focusFirst()
      })
    } else {
      restoreAttribute('role', originalRole)
      restoreAttribute('aria-modal', originalModal)
    }
  }
  const onKey = (event: globalThis.KeyboardEvent) => {
    // The sale's native confirmation dialog owns its own Tab/Escape keys.
    if (!media.matches || nativeModalOpen()) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
    } else if (event.key === 'Tab') {
      const elements = candidates()
      const first = elements[0]
      const last = elements.at(-1)
      const active = doc.activeElement
      if (!first || !last) { event.preventDefault(); panel.focus(); return }
      if (!panel.contains(active) || active === panel || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      }
    }
  }
  const onFocus = () => {
    if (media.matches && !nativeModalOpen() && !panel.contains(doc.activeElement)) focusFirst()
  }
  doc.addEventListener('keydown', onKey, true)
  doc.addEventListener('focusin', onFocus)
  media.addEventListener('change', syncMode)
  syncMode()
  return () => {
    disposed = true
    if (focusFrame !== undefined) view.cancelAnimationFrame(focusFrame)
    doc.removeEventListener('keydown', onKey, true)
    doc.removeEventListener('focusin', onFocus)
    media.removeEventListener('change', syncMode)
    restoreAttribute('role', originalRole)
    restoreAttribute('aria-modal', originalModal)
    if (media.matches && !nativeModalOpen()) {
      const target = visible(opener) ? opener : fallback()
      if (visible(target)) target.focus({ preventScroll: true })
    }
  }
}
