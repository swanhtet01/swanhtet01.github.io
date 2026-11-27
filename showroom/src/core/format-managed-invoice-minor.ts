import type { ManagedBillingInvoice } from './managed-account-billing'

export function formatManagedInvoiceMinor(
  invoice: Pick<ManagedBillingInvoice, 'currency' | 'exponent'>,
  value: number,
): string {
  if (!invoice
    || typeof invoice.currency !== 'string'
    || !/^[A-Z]{3}$/u.test(invoice.currency)
    || !Number.isSafeInteger(invoice.exponent)
    || invoice.exponent < 0
    || invoice.exponent > 6
    || !Number.isSafeInteger(value)
    || value < 0) {
    throw new Error('Invoice amount cannot be formatted.')
  }

  const scale = 10n ** BigInt(invoice.exponent)
  const minor = BigInt(value)
  const whole = minor / scale
  const fraction = invoice.exponent ? (minor % scale).toString().padStart(invoice.exponent, '0') : ''
  const options = {
    minimumFractionDigits: invoice.exponent,
    maximumFractionDigits: invoice.exponent,
  }

  function exactParts(formatter: Intl.NumberFormat): string {
    const parts = formatter.formatToParts(whole)
    if (invoice.exponent) {
      const index = parts.findIndex((part) => part.type === 'fraction')
      if (index < 0) throw new Error('Invoice fraction cannot be formatted.')
      parts[index] = { ...parts[index], value: fraction }
    }
    return parts.map((part) => part.value).join('')
  }

  try {
    return exactParts(new Intl.NumberFormat('en-US', { ...options, style: 'currency', currency: invoice.currency }))
  } catch {
    return `${invoice.currency} ${exactParts(new Intl.NumberFormat('en-US', options))}`
  }
}
