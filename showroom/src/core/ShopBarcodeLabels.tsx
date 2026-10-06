import { useEffect, useRef, useState } from 'react'

export type AcceptedStockReceiptLabel = {
  id: string
  purchaseOrderId: string
  sku: string
  itemName: string
  acceptedQuantity: number
}

const MAX_LABELS_PER_PRINT = 50

export function isPrintableCode128(value: string) {
  return value.length > 0 && value.length <= 80 && value.trim() === value && /^[\x20-\x7e]+$/.test(value)
}

export function cappedBarcodeCopies(acceptedQuantity: number, requestedCopies: number) {
  if (!Number.isSafeInteger(acceptedQuantity) || acceptedQuantity < 1) return 0
  const safeRequested = Number.isSafeInteger(requestedCopies) ? requestedCopies : 1
  return Math.max(1, Math.min(acceptedQuantity, MAX_LABELS_PER_PRINT, safeRequested))
}

export function ShopBarcodeLabels({ receipt }: { receipt: AcceptedStockReceiptLabel }) {
  const [open, setOpen] = useState(false)
  const [copies, setCopies] = useState(() => cappedBarcodeCopies(receipt.acceptedQuantity, receipt.acceptedQuantity))
  const [barcodeMarkup, setBarcodeMarkup] = useState('')
  const [barcodeError, setBarcodeError] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const barcodeRef = useRef<SVGSVGElement>(null)
  const skuIsPrintable = isPrintableCode128(receipt.sku)

  useEffect(() => {
    if (!open || !skuIsPrintable || !barcodeRef.current) return undefined
    let active = true
    setBarcodeError('')
    setBarcodeMarkup('')
    import('jsbarcode').then(({ default: JsBarcode }) => {
      if (!active || !barcodeRef.current) return
      JsBarcode(barcodeRef.current, receipt.sku, {
        format: 'CODE128',
        displayValue: false,
        margin: 0,
        width: 1.6,
        height: 40,
        lineColor: '#111827',
        background: '#ffffff',
      })
      setBarcodeMarkup(barcodeRef.current.outerHTML)
    }).catch(() => {
      if (active) setBarcodeError('Barcode generation failed. Your receipt and stock were not changed.')
    })
    return () => { active = false }
  }, [open, receipt.sku, skuIsPrintable])

  function openLabelPreview() {
    if (!Number.isSafeInteger(receipt.acceptedQuantity) || receipt.acceptedQuantity < 1) return
    setOpen(true)
    dialogRef.current?.showModal()
  }

  function printLabels() {
    if (!barcodeMarkup || !copies || copies > receipt.acceptedQuantity) return
    window.print()
  }

  if (!Number.isSafeInteger(receipt.acceptedQuantity) || receipt.acceptedQuantity < 1) return null

  return <>
    <button aria-label={`Print labels for ${receipt.itemName}, ${receipt.acceptedQuantity} units accepted`} className="core-button compact shop-barcode-label-trigger" onClick={openLabelPreview} type="button">
      Print labels <span>{receipt.acceptedQuantity} accepted</span>
    </button>
    <dialog aria-labelledby={`barcode-label-title-${receipt.id}`} className="shop-barcode-label-dialog" onClose={() => setOpen(false)} ref={dialogRef}>
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
        {barcodeError ? <p className="shop-barcode-label-error" role="alert">{barcodeError}</p> : null}
        <div className="shop-barcode-label-controls">
          <label>Label quantity<input disabled={!skuIsPrintable} max={Math.min(receipt.acceptedQuantity, MAX_LABELS_PER_PRINT)} min="1" onChange={(event) => setCopies(cappedBarcodeCopies(receipt.acceptedQuantity, Number(event.target.value)))} type="number" value={copies} /></label>
          <p className="shop-barcode-label-note">One label per accepted unit. Print up to {MAX_LABELS_PER_PRINT} at a time; repeat for larger receipts.</p>
        </div>
        <div aria-label="Product label preview" className="shop-barcode-label-preview">
          <div className="shop-barcode-label-preview-card"><strong>{receipt.itemName}</strong>{barcodeMarkup ? <svg aria-label={`Barcode for ${receipt.sku}`} ref={barcodeRef} /> : <svg aria-hidden="true" ref={barcodeRef} />}{!barcodeMarkup ? <small>{receipt.sku}</small> : null}<small>Receipt {receipt.purchaseOrderId}</small></div>
          <small className="shop-barcode-label-note">50 × 30 mm · CODE128 · print dialog opens on this device</small>
        </div>
        <div aria-hidden="true" className="shop-barcode-label-print-host">
          {barcodeMarkup ? Array.from({ length: copies }, (_, index) => <div className="shop-barcode-label-print" key={`${receipt.id}:${index}`}><strong>{receipt.itemName}</strong><small>{receipt.sku}</small><span dangerouslySetInnerHTML={{ __html: barcodeMarkup }} /><small>{receipt.purchaseOrderId}</small></div>) : null}
        </div>
        <div className="shop-barcode-label-actions"><button className="core-button" onClick={() => dialogRef.current?.close()} type="button">Cancel</button><button className="core-button primary" disabled={!barcodeMarkup || Boolean(barcodeError) || copies < 1 || copies > receipt.acceptedQuantity} onClick={printLabels} type="button">Print {copies} {copies === 1 ? 'label' : 'labels'}</button></div>
      </div>
    </dialog>
  </>
}
