// Connector: payment — OnePay (Myanmar inter-bank payment platform).
//
// OnePay is an interoperable payment gateway in Myanmar that lets merchants accept
// transfers from multiple mobile wallets (KBZ, AYA, CB, Wave, etc.) through a single
// integration. It also issues virtual accounts for bank transfers.
//
// Status: SKELETON — connector registered and health-checked; capabilities added when
//         OnePay merchant API credentials are provisioned. To activate:
//           1. Apply for a merchant account at onepay.com.mm
//           2. Set ONEPAY_MERCHANT_ID, ONEPAY_API_KEY, ONEPAY_SECRET_KEY in Vercel env.
//           3. Implement createIntent() + verifyCallback() below.
//
// Env:
//   ONEPAY_MERCHANT_ID   (required)  merchant ID issued by OnePay
//   ONEPAY_API_KEY       (required)  API key for request authentication
//   ONEPAY_SECRET_KEY    (required)  secret for HMAC signature of callbacks
//   ONEPAY_SANDBOX       (optional)  'true' to use sandbox environment

import { register } from './registry.mjs'

const getMerchantId = () => String(process.env.ONEPAY_MERCHANT_ID || '').trim()
const getApiKey     = () => String(process.env.ONEPAY_API_KEY     || '').trim()
const getSecret     = () => String(process.env.ONEPAY_SECRET_KEY  || '').trim()
const isSandbox     = () => String(process.env.ONEPAY_SANDBOX     || '').toLowerCase() === 'true'
const configured    = () => !!(getMerchantId() && getApiKey() && getSecret())

export const paymentOnepay = {
  key: 'payment-onepay',
  name: 'OnePay',
  category: 'payment',
  docs: 'kernel/connectors/payment-onepay.mjs',
  configured,
  async health() {
    if (!configured()) {
      const missing = [
        !getMerchantId() && 'ONEPAY_MERCHANT_ID',
        !getApiKey()     && 'ONEPAY_API_KEY',
        !getSecret()     && 'ONEPAY_SECRET_KEY',
      ].filter(Boolean).join(', ')
      return { ok: false, configured: false, detail: `skeleton — set ${missing} to activate` }
    }
    const mode = isSandbox() ? 'sandbox' : 'production'
    return { ok: true, configured: true, detail: `credentials present (${mode}) — createIntent() pending` }
  },
}

register(paymentOnepay)
export default paymentOnepay
