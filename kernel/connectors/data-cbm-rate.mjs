// Connector: data — Myanmar Central Bank (CBM) daily reference exchange rates.
//
// The Central Bank of Myanmar publishes official MMK reference rates daily.
// This connector fetches the latest rates (public endpoint, no auth required).
// Useful for any client that needs live MMK/USD conversion without hardcoding.
//
// Env: none required (public endpoint).
//   CBM_RATE_OVERRIDE_USD  optional — if set, returned as the USD rate (for testing / fallback).
//
// Rate source: https://forex.cbm.gov.mm/api/latest
// Note: CBM rate = official reference rate. Market rate may differ. SuperMega canonical
// rate for MMK-only pricing is in pricing.json (currently 4,300 MMK/USD). This connector
// is for LIVE market data, not pricing display.

import { register } from './registry.mjs'

const CBM_BASE = 'https://forex.cbm.gov.mm/api'
const TIMEOUT_MS = 8000

async function fetchLatest() {
  const res = await fetch(`${CBM_BASE}/latest`, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'supermega-kernel/1.0' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`cbm_http_${res.status}`)
  return res.json()
}

/**
 * getRates — fetch today's CBM reference rates.
 * @returns {Promise<{ok:boolean, rates?:{USD:number, EUR:number, SGD:number, ...}, timestamp?:string, source?:string, reason?:string}>}
 */
export async function getRates() {
  // Optional override for testing / cold-start fallback
  const usdOverride = process.env.CBM_RATE_OVERRIDE_USD
  if (usdOverride && !isNaN(Number(usdOverride))) {
    return {
      ok: true,
      rates: { USD: Number(usdOverride) },
      timestamp: new Date().toISOString(),
      source: 'override',
    }
  }

  try {
    const data = await fetchLatest()
    // CBM returns: { timestamp, logo, rates: { "USD": "4300.0", "EUR": "...", ... } }
    // OR:           { timestamp, rates: { "USD": { "buy": "...", "sell": "...", "rate": "4300.0" } } }
    const rawRates = data.rates || {}
    const parsed = {}
    for (const [ccy, val] of Object.entries(rawRates)) {
      if (typeof val === 'string') {
        const n = parseFloat(val.replace(/,/g, ''))
        if (!isNaN(n)) parsed[ccy] = n
      } else if (typeof val === 'object' && val !== null) {
        const r = parseFloat(String(val.rate || val.reference || val.sell || '').replace(/,/g, ''))
        if (!isNaN(r)) parsed[ccy] = r
      }
    }
    if (!parsed.USD) throw new Error('cbm_usd_rate_missing')
    return {
      ok: true,
      rates: parsed,
      timestamp: data.timestamp || new Date().toISOString(),
      source: 'cbm',
    }
  } catch (err) {
    return { ok: false, reason: String(err.message).slice(0, 160) }
  }
}

/**
 * getUSD — convenience: just the USD/MMK rate (most commonly needed).
 * @returns {Promise<{ok:boolean, mmkPerUsd?:number, timestamp?:string, source?:string, reason?:string}>}
 */
export async function getUSD() {
  const r = await getRates()
  if (!r.ok) return r
  return { ok: true, mmkPerUsd: r.rates.USD, timestamp: r.timestamp, source: r.source }
}

// ─── connector object ────────────────────────────────────────────────────────

export const dataCbmRate = {
  key:      'data-cbm-rate',
  name:     'Myanmar CBM Exchange Rate',
  category: 'data',
  docs:     'kernel/connectors/data-cbm-rate.mjs',
  configured: () => true, // no credentials needed
  async health() {
    try {
      const r = await getUSD()
      if (!r.ok) return { ok: false, detail: r.reason }
      return { ok: true, detail: `USD/MMK = ${r.mmkPerUsd.toLocaleString()} (${r.source})` }
    } catch (e) {
      return { ok: false, detail: String(e.message).slice(0, 120) }
    }
  },
  getRates,
  getUSD,
}

register(dataCbmRate)
export default dataCbmRate
