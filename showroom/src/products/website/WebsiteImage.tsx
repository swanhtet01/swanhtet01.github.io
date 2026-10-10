import { useEffect, useState } from 'react'
import { isWebsiteImage, websiteImageKey, type WebsiteImage as ImageValue } from './website-media'
import { useWebsiteMedia } from './WebsiteMediaContext'

export function WebsiteImage({ image, priority = false }: { image?: ImageValue; priority?: boolean }) {
  const { client } = useWebsiteMedia()
  if (!image || !isWebsiteImage(image)) return null
  return <SavedImage key={`${client?.scopeKey ?? 'local'}:${websiteImageKey(image)}`} image={image} priority={priority} />
}

function SavedImage({ image, priority }: { image: ImageValue; priority: boolean }) {
  const { client } = useWebsiteMedia()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [privateUrl, setPrivateUrl] = useState('')
  const assetId = 'assetId' in image ? image.assetId : null
  useEffect(() => {
    if (!assetId || !client) return
    const controller = new AbortController()
    let url = ''
    void client.load(assetId, controller.signal).then(blob => {
      if (controller.signal.aborted) return
      url = URL.createObjectURL(blob)
      setPrivateUrl(url)
    }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url) }
  }, [assetId, client, attempt])
  const src = 'src' in image ? image.src : privateUrl
  return <figure className="website-content-image">
    {failed || (assetId && !client) ? <div className="website-image-unavailable">
      <span role="img" aria-label={image.alt || 'Image unavailable'}>Image unavailable</span>
      <button className="website-button is-secondary is-compact" type="button" onClick={() => { setFailed(false); setPrivateUrl(''); setAttempt(value => value + 1) }}>Retry image</button>
    </div> : src ? <img src={src} alt={image.alt} decoding="async" loading={priority ? 'eager' : 'lazy'} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      : <div className="website-image-unavailable" role="status">Loading photo…</div>}
  </figure>
}
