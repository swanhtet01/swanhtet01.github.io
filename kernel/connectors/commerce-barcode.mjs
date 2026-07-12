// Connector: commerce — EAN-13 product barcodes for DeskPOS / factory inventory.
//
// Fills the "no inventory/barcode" gap the platform review flagged. Pure server-side EAN-13
// generation + validation (no credentials), so any product can get a scannable, checksum-valid
// barcode for labels and scan-to-lookup. health() runs a real self-test (canonical vector +
// validate), so a broken checksum surfaces on the Integrations page instead of bad labels.

import { register } from './registry.mjs'
import { generateEan13, validateEan13, ean13CheckDigit, selfTest } from './_barcode-core.mjs'

export const commerceBarcode = {
  key: 'commerce-barcode',
  name: 'Barcode (EAN-13)',
  category: 'commerce',
  docs: 'kernel/connectors/_barcode-core.mjs',
  configured: () => true, // pure transform — no credentials needed
  async health() {
    const t = selfTest()
    if (t.ok) return { ok: true, detail: 'EAN-13 generate+validate OK (mod-10 check, canonical vector verified)' }
    return { ok: false, detail: `barcode self-test failed (gen=${t.ok1} validate+=${t.ok2} validate-=${t.ok3})` }
  },
  // Exposed so other kernel code can build/validate without re-importing the core.
  generate: generateEan13,
  validate: validateEan13,
  checkDigit: ean13CheckDigit,
}

register(commerceBarcode)
export default commerceBarcode
