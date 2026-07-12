// Barcode core — EAN-13 product barcodes for inventory/POS. Pure + deterministic, zero deps
// (matches _mmqr-core.mjs). EAN-13 = 12 base digits + 1 mod-10 check digit. DeskPOS and the
// factory stock module both need product barcodes; this gives the platform server-side
// generation + validation (print labels, scan-to-lookup, dedupe) with a verifiable checksum.

// Mod-10 check digit over the 12 base digits: odd positions (1,3,5,…) weight 1, even
// positions (2,4,6,…) weight 3; check = (10 - (sum mod 10)) mod 10.
export function ean13CheckDigit(digits12) {
  const d = String(digits12).replace(/\D/g, '').slice(0, 12).padStart(12, '0')
  let sum = 0
  for (let i = 0; i < 12; i += 1) {
    const n = d.charCodeAt(i) - 48
    sum += i % 2 === 0 ? n : n * 3 // 0-indexed i=0 is position 1 (odd → weight 1)
  }
  return String((10 - (sum % 10)) % 10)
}

// Build a valid EAN-13 from any numeric input (pads/truncates to 12 base digits, appends check).
export function generateEan13(input) {
  const base = String(input == null ? '' : input).replace(/\D/g, '').slice(0, 12).padStart(12, '0')
  return base + ean13CheckDigit(base)
}

// True only for a well-formed 13-digit EAN-13 whose check digit matches.
export function validateEan13(code) {
  const c = String(code == null ? '' : code).replace(/\D/g, '')
  if (c.length !== 13) return false
  return ean13CheckDigit(c.slice(0, 12)) === c[12]
}

// Self-test for the connector health probe: canonical EAN-13 vector 590123412345 → check 7,
// plus a positive and a negative validate. A broken checksum fails loudly at health-check time.
export function selfTest() {
  const ok1 = generateEan13('590123412345') === '5901234123457'
  const ok2 = validateEan13('5901234123457') === true
  const ok3 = validateEan13('5901234123450') === false
  return { ok: ok1 && ok2 && ok3, ok1, ok2, ok3 }
}
