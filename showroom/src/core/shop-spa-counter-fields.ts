export function spaCounterFields(customer: string, payment: string, managedSpa: boolean, appointment?: { clientId: string; customerName: string }) {
  if (!managedSpa) return { customer, payment }
  if (appointment) {
    if (!appointment.clientId || customer.trim() !== appointment.customerName.trim()) throw new Error('The client changed. Return to the appointment and open the sale again.')
    customer = appointment.clientId
  }
  if (!/^client-[A-Za-z0-9_-]+$/.test(customer)) throw new Error('Open this sale from the client appointment so it uses the correct client record.')
  const methods: Record<string, string> = { Cash: 'cash', KBZPay: 'mobile_wallet', WavePay: 'mobile_wallet', 'AYA Pay': 'mobile_wallet', MMQR: 'mobile_wallet', cash: 'cash', mobile_wallet: 'mobile_wallet', bank_transfer: 'bank_transfer' }
  const method = Object.hasOwn(methods, payment) ? methods[payment] : undefined
  if (!method) throw new Error('Choose cash or a supported manual payment method.')
  return { customer, payment: method }
}
