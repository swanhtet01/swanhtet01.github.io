import { useId, useRef, useState } from 'react'
import {
  acceptedReceiptLabelTarget,
  cappedShopBarcodeLabelCopies,
  catalogProductLabelTarget,
  isPrintableShopBarcode,
  MAX_SHOP_BARCODE_LABELS_PER_PRINT,
  type AcceptedStockReceiptLabel,
  type CatalogProductLabel,
} from './shop-barcode-labels'

export type { AcceptedStockReceiptLabel, CatalogProductLabel } from './shop-barcode-labels'

type ShopBarcodeLabelsProps = { disabled?: boolean } & (
  | { receipt: AcceptedStockReceiptLabel; product?: never }
  | { product: CatalogProductLabel; receipt?: never }
)

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

export function ShopBarcodeLabels(props: ShopBarcodeLabelsProps) {
  const target = props.receipt
    ? acceptedReceiptLabelTarget(props.receipt)
    : props.product ? catalogProductLabelTarget(props.product) : null
  const [copies, setCopies] = useState(() => target?.initialCopies ?? 1)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = `shop-barcode-label-title-${useId()}`
  const codeIsPrintable = Boolean(target && isPrintableShopBarcode(target.code))
  const barcode = target && codeIsPrintable ? code128BPath(target.code) : null

  function openLabelPreview() {
    if (props.disabled || !target) return
    dialogRef.current?.showModal()
  }

  function printLabels() {
    if (props.disabled || !barcode || !copies || !target || copies > target.maxCopies) return
    window.print()
  }

  if (!target) return null

  return <>
    <button aria-label={`Print labels for ${target.itemName}`} className="core-button compact shop-barcode-label-trigger" disabled={props.disabled} onClick={openLabelPreview} type="button">
      Print labels {target.buttonDescription ? <span>{target.buttonDescription}</span> : null}
    </button>
    <dialog aria-labelledby={titleId} className="shop-barcode-label-dialog" ref={dialogRef}>
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
          .shop-barcode-label-print-host * { visibility:visible !important; }
          .shop-barcode-label-print { display:grid; grid-template-rows:auto auto 1fr auto; align-content:center; justify-items:center; gap:1mm; width:50mm; height:30mm; padding:2mm; overflow:hidden; break-after:page; page-break-after:always; background:#fff; color:#111; }
          .shop-barcode-label-print:last-child { break-after:auto; page-break-after:auto; }
          .shop-barcode-label-print strong { width:100%; overflow:hidden; font:600 8pt/1.1 Arial,sans-serif; text-align:center; text-overflow:ellipsis; white-space:nowrap; }
          .shop-barcode-label-print small { font:6pt/1 Arial,sans-serif; }
          .shop-barcode-label-print svg { width:44mm; max-height:15mm; }
        }
      `}</style>
      <div className="shop-barcode-label-shell">
        <header className="shop-barcode-label-heading">
          <div><span className="shop-barcode-label-eyebrow">{target.sourceLabel}</span><h2 id={titleId}>Print product labels</h2><p>{target.itemName} · {target.description}</p></div>
          <button aria-label="Close label preview" className="shop-barcode-label-close" onClick={() => dialogRef.current?.close()} type="button">×</button>
        </header>
        {!codeIsPrintable ? <p className="shop-barcode-label-error" role="alert">This saved code can’t be printed as CODE128. Use a short, printable ASCII barcode or SKU.</p> : null}
        <div className="shop-barcode-label-controls">
          <label>Label quantity<input disabled={!codeIsPrintable || props.disabled} max={Math.min(target.maxCopies, MAX_SHOP_BARCODE_LABELS_PER_PRINT)} min="1" onChange={(event) => setCopies(cappedShopBarcodeLabelCopies(target.maxCopies, Number(event.target.value)))} type="number" value={copies} /></label>
          <p className="shop-barcode-label-note">Up to {Math.min(target.maxCopies, MAX_SHOP_BARCODE_LABELS_PER_PRINT)} per print. Printing does not change stock or the saved product.</p>
        </div>
        <div aria-label="Product label preview" className="shop-barcode-label-preview">
          <div className="shop-barcode-label-preview-card"><strong>{target.itemName}</strong>{barcode ? <svg aria-label={`Barcode for ${target.code}`} role="img" viewBox={`0 0 ${barcode.modules} 40`}><path d={barcode.path} /></svg> : <small>{target.code}</small>}<small>{target.detail}</small></div>
          <small className="shop-barcode-label-note">50 × 30 mm · CODE128 · print dialog opens on this device</small>
        </div>
        <div aria-hidden="true" className="shop-barcode-label-print-host">
          {barcode ? Array.from({ length: copies }, (_, index) => <div className="shop-barcode-label-print" key={`${target.id}:${index}`}><strong>{target.itemName}</strong><small>{target.code}</small><svg aria-hidden="true" preserveAspectRatio="none" viewBox={`0 0 ${barcode.modules} 40`}><path d={barcode.path} /></svg><small>{target.detail}</small></div>) : null}
        </div>
        <div className="shop-barcode-label-actions"><button className="core-button" onClick={() => dialogRef.current?.close()} type="button">Cancel</button><button className="core-button primary" disabled={props.disabled || !barcode || copies < 1 || copies > target.maxCopies} onClick={printLabels} type="button">Print {copies} {copies === 1 ? 'label' : 'labels'}</button></div>
      </div>
    </dialog>
  </>
}
