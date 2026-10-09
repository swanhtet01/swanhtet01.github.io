import type { WebsiteLead, WebsiteLeadLedger } from './website-leads'

export type WebsiteInquiryFilter = 'open' | 'all' | 'closed'

export type WebsiteInquiryView = { filter: WebsiteInquiryFilter; page: number }
export type WebsiteInquiryViewAction =
  | { type: 'filter'; filter: WebsiteInquiryFilter }
  | { type: 'page'; page: number; leads: readonly WebsiteLead[] }
  | { type: 'ledger'; leads: readonly WebsiteLead[] }
  | { type: 'confirmed'; ledger: WebsiteLeadLedger | null | undefined }

export const WEBSITE_INQUIRY_PAGE_SIZE = 8

export function websiteInquiryWindow(leads: readonly WebsiteLead[], filter: WebsiteInquiryFilter, requestedPage: number) {
  const matching = leads.filter((lead) => filter === 'all'
    || (filter === 'closed' ? lead.status === 'closed' : lead.status !== 'closed'))
  const total = matching.length
  const pageCount = Math.max(1, Math.ceil(total / WEBSITE_INQUIRY_PAGE_SIZE))
  const page = Math.min(Math.max(0, Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 0), pageCount - 1)
  const offset = page * WEBSITE_INQUIRY_PAGE_SIZE
  return {
    items: matching.slice(offset, offset + WEBSITE_INQUIRY_PAGE_SIZE),
    total,
    page,
    pageCount,
    start: total ? offset + 1 : 0,
    end: Math.min(offset + WEBSITE_INQUIRY_PAGE_SIZE, total),
  }
}

export function websiteInquiryViewReducer(view: WebsiteInquiryView, action: WebsiteInquiryViewAction): WebsiteInquiryView {
  if (action.type === 'filter') return action.filter === view.filter && view.page === 0
    ? view
    : { filter: action.filter, page: 0 }
  const leads = action.type === 'confirmed' ? action.ledger?.leads ?? [] : action.leads
  const page = websiteInquiryWindow(leads, view.filter, action.type === 'page' ? action.page : view.page).page
  return page === view.page ? view : { ...view, page }
}
