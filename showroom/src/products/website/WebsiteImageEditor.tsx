import { useEffect, useId, useRef, useState } from 'react'
import { isWebsiteImage, isWebsiteImageSource, type WebsiteImage } from './website-media'
import { assertPhotoFile } from './website-media-client'
import { useWebsiteMedia } from './WebsiteMediaContext'

export function WebsiteImageEditor({ image, onChange }: { image?: WebsiteImage; onChange: (image: WebsiteImage | undefined) => void }) {
  const { client, onEditingChange } = useWebsiteMedia()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [useLink, setUseLink] = useState(false)
  const [src, setSrc] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [alt, setAlt] = useState('')
  const [decorative, setDecorative] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const upload = useRef<AbortController | null>(null)
  const changeButton = useRef<HTMLButtonElement>(null)
  const firstField = useRef<HTMLInputElement>(null)
  const returnFocus = useRef(false)

  useEffect(() => {
    onEditingChange?.(open)
    if (open) firstField.current?.focus()
    return () => { upload.current?.abort(); onEditingChange?.(false) }
  }, [open, onEditingChange])

  useEffect(() => {
    if (!open && returnFocus.current) {
      returnFocus.current = false
      changeButton.current?.focus()
    }
  }, [open])

  function close() {
    upload.current?.abort()
    upload.current = null
    setBusy(false)
    setFile(null)
    returnFocus.current = true
    setOpen(false)
  }

  function begin() {
    setSrc(image && 'src' in image ? image.src : '')
    setUseLink(!client?.upload || Boolean(image && 'src' in image))
    setAlt(image?.alt ?? '')
    setDecorative(image?.decorative ?? false)
    setError('')
    setOpen(true)
  }

  async function apply() {
    const description = { alt: decorative ? '' : alt.trim(), decorative }
    if (!decorative && !description.alt) { setError('Add a short description, or choose decorative.'); return }
    const controller = new AbortController()
    upload.current = controller
    setBusy(true)
    setError('')
    try {
      let next: WebsiteImage
      if (useLink) {
        if (!isWebsiteImageSource(src.trim())) throw new Error('Use a public HTTPS image link, including its path.')
        next = { src: src.trim(), ...description }
      } else if (file && client?.upload) {
        next = { assetId: await client.upload(file, controller.signal), ...description }
      } else if (image && 'assetId' in image) {
        next = { assetId: image.assetId, ...description }
      } else throw new Error('Choose a photo first.')
      controller.signal.throwIfAborted()
      if (!isWebsiteImage(next)) throw new Error('Check the photo and its description.')
      onChange(next)
      close()
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'The photo could not be saved. Please try again.')
    } finally {
      if (upload.current === controller) { upload.current = null; setBusy(false) }
    }
  }

  return <section aria-label="Section image" className="website-image-editor" aria-busy={busy}>
    {open ? <>
      {!useLink ? <div className="website-photo-picker">
        <label htmlFor={`${id}-file`}>{file ? 'Choose a different photo' : 'Choose a photo'}</label>
        <input ref={firstField} id={`${id}-file`} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => {
          const selected = event.target.files?.[0]
          if (!selected) return
          // Decode only the server-normalized image after upload. Compressed
          // file size alone does not bound browser image-decoding memory.
          try { assertPhotoFile(selected); setFile(selected); setError('') }
          catch (failure) { setError(failure instanceof Error ? failure.message : 'Choose a different photo.'); event.target.value = '' }
        }} />
        <small>JPG, PNG or WebP · up to 4 MB</small>
        <button type="button" className="website-image-link-option" disabled={busy} onClick={() => { setUseLink(true); setFile(null); setError('') }}>Use an image link instead</button>
      </div> : <>
        <label htmlFor={`${id}-src`}>Image link</label>
        <input ref={firstField} id={`${id}-src`} type="url" disabled={busy} maxLength={2048} value={src} onChange={event => setSrc(event.target.value)} placeholder="https://your-site.com/photo.jpg" />
        {client?.upload ? <button type="button" className="website-image-link-option" onClick={() => setUseLink(false)}>Choose a photo from this device</button> : null}
      </>}
      <label htmlFor={`${id}-alt`}>Image description</label>
      <input id={`${id}-alt`} maxLength={200} disabled={decorative || busy} value={decorative ? '' : alt} onChange={event => setAlt(event.target.value)} placeholder="e.g. Our café, with tables beside the window" />
      <label className="website-image-decorative"><input type="checkbox" disabled={busy} checked={decorative} onChange={event => setDecorative(event.target.checked)} />Decorative image</label>
      {error ? <p role="alert" id={`${id}-error`}>{error}</p> : null}
      <div className="website-image-actions">
        <button type="button" className="website-button is-secondary" onClick={close}>Cancel</button>
        <button type="button" className="website-button is-primary" disabled={busy} onClick={() => void apply()}>{busy ? 'Saving photo…' : 'Use image'}</button>
      </div>
    </> : <div className="website-image-actions">
      <button ref={changeButton} type="button" className="website-button is-secondary" onClick={begin}>{image ? 'Change image' : 'Add image'}</button>
      {image ? <button type="button" className="website-button is-secondary" onClick={() => onChange(undefined)}>Remove image</button> : null}
    </div>}
  </section>
}
