import { useMemo, useRef, useState } from 'react'

export type AcceptedStockReceiptLabel = {
  id: string
  purchaseOrderId: string
  sku: string
  itemName: string
  acceptedQuantity: number
}

const MAX_LABELS_PER_PRINT = 50
// Code 128 symbol patterns adapted from JsBarcode 3.12.3 (MIT, Johan Lindell).
// This Code Set B subset keeps other symbologies out of the Shop runtime bundle.
const CODE128_BARS = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100', '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110', '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
  '11001001110', '11011100100', '11001110100', '11101101110', '11101001100', '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000', '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110', '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
  '11000101110', '11011101000', '11011100010', '11011101110', '11101011000', '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100', '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010', '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100', '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110', '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
  '10111101110', '11101011110', '11110101110', '11010000100', '11010010000', '11010011100', '1100011101011',
]

function isPrintableCode128(value: string) {
  return value.length > 0 && value.length <= 80 && value.trim() === value && /^[\x20-\x7e]+$/.test(value)
}

function cappedBarcodeCopies(acceptedQuantity: number, requestedCopies: number) {
  if (!Number.isSafeInteger(acceptedQuantity) || acceptedQuantity < 1) return 0
  const safeRequested = Number.isSafeInteger(requestedCopies) ? requestedCopies : 1
  return Math.max(1, Math.min(acceptedQuantity, MAX_LABELS_PER_PRINT, safeRequested))
}

function code128BPath(value: string) {
  const symbols = [104, ...Array.from(value, (character) => character.charCodeAt(0) - 32)]
  let checksum = symbols[0]
  for (let index = 1; index < symbols.length; index++) checksum += symbols[index] * index
  const modules = [...symbols, checksum % 103, 106].map((symbol) => CODE128_BARS[symbol]).join('')
  let start = -1
  let path = ''
  for (let index = 0; index <= modules.length; index++) {
    if (modules[index] === '1' && start < 0) start = index
    if (modules[index] !== '1' && start >= 0) {
      const width = index - start
      path += `M${start} 0h${width}v40h-${width}z`
      start = -1
    }
  }
  return { modules: modules.length, path }
}

export function ShopBarcodeLabels({ receipt }: { receipt: AcceptedStockReceiptLabel }) {
  const [copies, setCopies] = useState(() => cappedBarcodeCopies(receipt.acceptedQuantity, receipt.acceptedQuantity))
  const dialogRef = useRef<HTMLDialogElement>(null)
  const skuIsPrintable = isPrintableCode128(receipt.sku)
  const barcode = useMemo(() => skuIsPrintable ? code128BPath(receipt.sku) : null, [receipt.sku, skuIsPrintable])

  function openLabelPreview() {
    if (!Number.isSafeInteger(receipt.acceptedQuantity) || receipt.acceptedQuantity < 1) return
    dialogRef.current?.showModal()
  }

  function printLabels() {
    if (!barcode || !copies || copies > receipt.acceptedQuantity) return
    window.print()
  }

  if (!Number.isSafeInteger(receipt.acceptedQuantity) || receipt.acceptedQuantity < 1) return null

  return <>
    <button aria-label={`Print labels for ${receipt.itemName}, ${receipt.acceptedQuantity} units accepted`} className="core-button compact shop-barcode-label-trigger" onClick={openLabelPreview} type="button">
      Print labels <span>{receipt.acceptedQuantity} accepted</span>
    </button>
    <dialog aria-labelledby={`barcode-label-title-${receipt.id}`} className="shop-barcode-label-dialog" ref={dialogRef}>
      <style>{`
        .shop-barcode-label-dialog { width:min(560px,calc(100vw - 32px)); max-width:560px; max-height:min(86vh,760px); padding:0; border:1px solid #e3e5eb; border-radius:20px; color:#111827; box-shadow:0 28px 90px #11182735; }
        .shop-barcode-label-dialog::backdrop { background:#12182775; backdrop-filter:blur(3px); }
        .shop-barcode-label-shell { padding:24px; }
        .shop-barcode-label-heading { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:20px; }
        .shop-barcode-label-heading h2 { margin:4px 0 6px; font-size:1.35rem; letter-spacing:-.025em; }
        .shop-barcode-label-heading p,.shop-barcode-label-note { margin:0; color:#667085; font-size:.9rem; line-height:1.5; }
        .shop-barcode-label-eyebrow { color:#5542df; font:600 .7rem/1.3 ui-monospace,SFMono-Regular,Consolas,monospace; letter-spacing:.09em; text-transform:uppercase; }
        .shop-barcode-label-close { min-width:40px; min-height:40px; border:1px solid #e3e5eb; border-radius:12px; background:#fff; color:#111827; font-size:1.2rem; }
        .shop-barcode-label-controls { display:flex; align-items:end; gap:14px; margin:20px 0; }
        .shop-barcode-label-controls label { display:grid; gap:7px; color:#344054; font-size:.85rem; font-weight:600; }
        .shop-barcode-label-controls input { width:112px; min-height:44px; padding:8px 12px; border:1px solid #d9dce4; border-radius:11px; color:#111827; font:inherit; }
        .shop-barcode-label-preview { display:grid; justify-items:center; gap:8px; margin:18px 0; padding:20px; border:1px solid #e7e8ee; border-radius:16px; background:linear-gradient(145deg,#f9f9fc,#f1f0ff); }
        .shop-barcode-label-preview-card { display:grid; align-content:center; justify-items:center; gap:5px; width:250px; min-height:150px; padding:10px 14px; border:1px solid #e5e7eb; border-radius:8px; background:#fff; box-shadow:0 8px 24px #10182812; text-align:center; }
        .shop-barcode-label-preview-card strong { width:100%; overflow:hidden; color:#111827; font-size:13px; text-overflow:ellipsis; white-space:nowrap; }
        .shop-barcode-label-preview-card small { color:#667085; font:11px ui-monospace,SFMono-Regular,Consolas,monospace; }
        .shop-barcode-label-preview-card svg { width:100%; max-height:64px; }
        .shop-barcode-label-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:22px; }
        .shop-barcode-label-print-host { display:none; }
        .shop-barcode-label-error { color:#b42318; }
        .shop-barcode-label-trigger span { margin-left:6px; color:#667085; font-size:.78rem; font-weight:500; }
        @media print {
          @page { size:50mm 30mm; margin:0; }
          body * { visibility:hidden !important; }
          dialog.shop-barcode-label-dialog[open] { position:fixed; inset:0; display:block; width:50mm; height:30mm; max-width:none; max-height:none; overflow:visible; padding:0; border:0; border-radius:0; background:#fff; box-shadow:none; }
          .shop-barcode-label-shell,.shop-barcode-label-heading,.shop-barcode-label-controls,.shop-barcode-label-preview,.shop-barcode-label-actions,.shop-barcode-label-note { display:none !important; }
          .shop-barcode-label-print-host { position:fixed; inset:0; display:block !important; visibility:visible !important; background:#fff; }
          .shop-barcode-label-print { display:grid; grid-template-rows:auto auto 1fr auto; align-content:center; justify-items:center; gap:1mm; width:50mm; height:30mm; padding:2mm; overflow:hidden; break-after:page; page-break-after:always; background:#fff; color:#111; }
          .shop-barcode-label-print:last-child { break-after:auto; page-break-after:auto; }
          .shop-barcode-label-print strong { width:100%; overflow:hidden; font:600 8pt/1.1 Arial,sans-serif; text-align:center; text-overflow:ellipsis; white-space:nowrap; }
          .shop-barcode-label-print small { font:6pt/1 Arial,sans-serif; }
          .shop-barcode-label-print svg { width:44mm; max-height:15mm; }
        }
      `}</style>
      <div className="shop-barcode-label-shell">
        <header className="shop-barcode-label-heading">
          <div><span className="shop-barcode-label-eyebrow">Received stock</span><h2 id={`barcode-label-title-${receipt.id}`}>Print product labels</h2><p>{receipt.itemName} · {receipt.acceptedQuantity.toLocaleString()} units accepted</p></div>
          <button aria-label="Close label preview" className="shop-barcode-label-close" onClick={() => dialogRef.current?.close()} type="button">×</button>
        </header>
        {!skuIsPrintable ? <p className="shop-barcode-label-error" role="alert">This SKU can’t be printed as CODE128. Use a short, printable ASCII SKU.</p> : null}
        <div className="shop-barcode-label-controls">
          <label>Label quantity<input disabled={!skuIsPrintable} max={Math.min(receipt.acceptedQuantity, MAX_LABELS_PER_PRINT)} min="1" onChange={(event) => setCopies(cappedBarcodeCopies(receipt.acceptedQuantity, Number(event.target.value)))} type="number" value={copies} /></label>
          <p className="shop-barcode-label-note">One label per accepted unit. Print up to {MAX_LABELS_PER_PRINT} at a time; repeat for larger receipts.</p>
        </div>
        <div aria-label="Product label preview" className="shop-barcode-label-preview">
          <div className="shop-barcode-label-preview-card"><strong>{receipt.itemName}</strong>{barcode ? <svg aria-label={`Barcode for ${receipt.sku}`} role="img" viewBox={`0 0 ${barcode.modules} 40`}><path d={barcode.path} /></svg> : <small>{receipt.sku}</small>}<small>Receipt {receipt.purchaseOrderId}</small></div>
          <small className="shop-barcode-label-note">50 × 30 mm · CODE128 · print dialog opens on this device</small>
        </div>
        <div aria-hidden="true" className="shop-barcode-label-print-host">
          {barcode ? Array.from({ length: copies }, (_, index) => <div className="shop-barcode-label-print" key={`${receipt.id}:${index}`}><strong>{receipt.itemName}</strong><small>{receipt.sku}</small><svg aria-hidden="true" preserveAspectRatio="none" viewBox={`0 0 ${barcode.modules} 40`}><path d={barcode.path} /></svg><small>{receipt.purchaseOrderId}</small></div>) : null}
        </div>
        <div className="shop-barcode-label-actions"><button className="core-button" onClick={() => dialogRef.current?.close()} type="button">Cancel</button><button className="core-button primary" disabled={!barcode || copies < 1 || copies > receipt.acceptedQuantity} onClick={printLabels} type="button">Print {copies} {copies === 1 ? 'label' : 'labels'}</button></div>
      </div>
    </dialog>
  </>
}
