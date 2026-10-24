#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize, resolve, sep } from 'node:path'

import { Cdp, findBrowser, launchBrowser } from './verify_app_entry_rendered.mjs'

const root = resolve(import.meta.dirname, '..')
const staticDir = resolve(root, '.vercel/output/static')
const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]
const routes = ['/shop/', '/my/shop/']
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

function serveStatic() {
  const server = createServer((request, response) => {
    let pathname
    try { pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname) }
    catch { response.writeHead(400).end(); return }
    let path = normalize(join(staticDir, pathname))
    if (path !== staticDir && !path.startsWith(staticDir + sep)) { response.writeHead(403).end(); return }
    if (!existsSync(path) || !statSync(path).isFile()) path = join(path, 'index.html')
    if (!existsSync(path) || !statSync(path).isFile()) { response.writeHead(404).end(); return }
    response.writeHead(200, { 'cache-control': 'no-store', 'content-type': mime[extname(path)] || 'application/octet-stream' })
    createReadStream(path).pipe(response)
  })
  return new Promise(resolveStarted => server.listen(0, '127.0.0.1', () => resolveStarted(server)))
}

async function evaluate(cdp, sessionId, expression) {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
  if (exceptionDetails) throw new Error(exceptionDetails.text || 'responsive_page_evaluation_failed')
  return result.value
}

async function waitForReady(cdp, sessionId) {
  for (let attempts = 0; attempts < 80; attempts += 1) {
    if (await evaluate(cdp, sessionId, 'document.readyState === "complete"')) return
    await new Promise(done => setTimeout(done, 50))
  }
  throw new Error('responsive_page_load_timeout')
}

const server = await serveStatic()
const userDataDir = await mkdtemp(join(tmpdir(), 'supermega-public-responsive-'))
let browser
let cdp
try {
  const started = await launchBrowser(findBrowser(), userDataDir)
  browser = started.browser
  cdp = await Cdp.connect(started.wsUrl)
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  await cdp.send('Target.activateTarget', { targetId })
  await cdp.send('Page.enable', {}, sessionId)
  await cdp.send('Runtime.enable', {}, sessionId)
  const { port } = server.address()
  const cases = []
  for (const route of routes) {
    for (const viewport of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false,
      }, sessionId)
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}${route}` }, sessionId)
      await waitForReady(cdp, sessionId)
      const faqFocusVisible = await evaluate(cdp, sessionId, `(() => {
        const summary = document.querySelector('.shop-faq-list summary')
        if (!summary) return false
        summary.focus()
        const style = getComputedStyle(summary)
        return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0
      })()`)
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, sessionId)
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, sessionId)
      const faqOpenedWithEnter = await evaluate(cdp, sessionId, `document.querySelector('.shop-faq-list details')?.open === true`)
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', text: ' ', unmodifiedText: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 }, sessionId)
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 }, sessionId)
      const faqClosedWithSpace = await evaluate(cdp, sessionId, `document.querySelector('.shop-faq-list details')?.open === false`)
      const result = await evaluate(cdp, sessionId, `(() => {
        const visible = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
        const primary = [...document.querySelectorAll('.button-primary')].filter(visible)
        const targets = [...document.querySelectorAll('.site-header a, .button-primary')].filter(visible)
        const tableau = document.querySelector('.native-shop-tableau')
        const figures = [...document.querySelectorAll('.native-shop-tableau .native-shop-shot')].filter(visible)
        const images = figures.map(figure => figure.querySelector('img'))
        const tableauBounds = tableau && tableau.getBoundingClientRect()
        const imageBounds = images.map(image => image && image.getBoundingClientRect())
        const figureBounds = figures.map(figure => figure.getBoundingClientRect())
        const windowBounds = figures.map(figure => figure.querySelector('.native-shop-shot-window')?.getBoundingClientRect())
        const captionBounds = figures.map(figure => figure.querySelector('figcaption')?.getBoundingClientRect())
        const overlaps = (a, b) => a && b && a.left < b.right - 1 && a.right > b.left + 1
          && a.top < b.bottom - 1 && a.bottom > b.top + 1
        const disclosure = document.querySelector('.native-shop-disclosure')
        const storySections = [...document.querySelectorAll('.shop-story-section')].filter(visible)
        const storyHeadings = storySections.map(section => section.querySelector('h2')).filter(visible)
        const accessLink = document.querySelector('.shop-access-link')
        const faqItems = [...document.querySelectorAll('.shop-faq-list details')]
        const faqSummaries = faqItems.map(item => item.querySelector('summary')).filter(visible)
        const switchLink = document.querySelector('[data-language-switch]')
        const focusTarget = primary[0]
        focusTarget && focusTarget.focus()
        const focusStyle = focusTarget ? getComputedStyle(focusTarget) : null
        const primaryFocusVisible = Boolean(focusStyle && focusStyle.outlineStyle !== 'none' && Number.parseFloat(focusStyle.outlineWidth) > 0)
        accessLink && accessLink.focus()
        const accessFocusStyle = accessLink ? getComputedStyle(accessLink) : null
        const faqSummaryHeights = faqSummaries.map(summary => Math.round(summary.getBoundingClientRect().height))
        faqItems.forEach(item => { item.open = true })
        const faqGeometryValid = faqItems.every(item => {
          const summary = item.querySelector('summary')?.getBoundingClientRect()
          const answer = item.querySelector('p')?.getBoundingClientRect()
          const bounds = item.getBoundingClientRect()
          return summary && answer && answer.top >= summary.bottom - 1
            && answer.left >= bounds.left - 1 && answer.right <= bounds.right + 1
            && answer.bottom <= bounds.bottom + 1
        })
        return {
          lang: document.documentElement.lang,
          viewportWidth: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          primaryCount: primary.length,
          targetHeights: targets.map(element => Math.round(element.getBoundingClientRect().height)),
          focusVisible: primaryFocusVisible,
          accessLinkVisible: visible(accessLink),
          accessLinkHeight: Math.round(accessLink?.getBoundingClientRect().height || 0),
          accessLinkFocusVisible: Boolean(accessFocusStyle && accessFocusStyle.outlineStyle !== 'none' && Number.parseFloat(accessFocusStyle.outlineWidth) > 0),
          faqCount: faqItems.length,
          faqSummaryHeights,
          faqGeometryValid,
          switchHref: switchLink && switchLink.getAttribute('href'),
          tableauCount: document.querySelectorAll('.native-shop-tableau').length,
          figureCount: figures.length,
          tableauHeight: tableau ? Math.round(tableau.getBoundingClientRect().height) : 0,
          imagesLoaded: images.every(image => image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0),
          imagesUnclipped: Boolean(tableauBounds && imageBounds.every(bounds => bounds
            && bounds.top >= tableauBounds.top - 1 && bounds.left >= tableauBounds.left - 1
            && bounds.right <= tableauBounds.right + 1 && bounds.bottom <= tableauBounds.bottom + 1)),
          figuresOverlap: figureBounds.some((bounds, index) => figureBounds.slice(index + 1).some(other => overlaps(bounds, other))),
          captionsOverlapImages: captionBounds.some((bounds, index) => overlaps(bounds, windowBounds[index])),
          primaryObscured: figureBounds.slice(1).some(bounds => overlaps(figureBounds[0], bounds)),
          primaryWidth: Math.round(images[0]?.getBoundingClientRect().width || 0),
          captionSizes: figures.map(figure => Number.parseFloat(getComputedStyle(figure.querySelector('figcaption')).fontSize)),
          disclosureVisible: visible(disclosure),
          disclosureText: disclosure?.textContent.trim() || '',
          storySectionCount: storySections.length,
          storyHeadingSizes: storyHeadings.map(heading => Number.parseFloat(getComputedStyle(heading).fontSize)),
          storyHeadingLineHeights: storyHeadings.map(heading => Number.parseFloat(getComputedStyle(heading).lineHeight)),
          storyHeadingTracking: storyHeadings.map(heading => getComputedStyle(heading).letterSpacing),
          templateCount: document.querySelectorAll('.shop-template-card').length,
          platformCount: document.querySelectorAll('.shop-platform-card').length,
          deviceLabels: [...document.querySelectorAll('figcaption')].some(node => /^(Desktop|Tablet|Phone)$/.test(node.textContent.trim())),
          forbiddenCopy: /SuperMega Shop|Request a Shop pilot|Request a Shop walkthrough/i.test(document.body.innerText),
        }
      })()`)
      result.faqFocusVisible = faqFocusVisible
      result.faqOpenedWithEnter = faqOpenedWithEnter
      result.faqClosedWithSpace = faqClosedWithSpace
      result.faqKeyboardInteraction = faqOpenedWithEnter && faqClosedWithSpace
      const expectedLang = route.startsWith('/my/') ? 'my' : 'en'
      const expectedSwitch = expectedLang === 'my' ? '/shop/' : '/my/shop/'
      const failures = []
      if (result.lang !== expectedLang) failures.push('locale')
      if (result.viewportWidth !== viewport.width || result.scrollWidth > viewport.width) failures.push('overflow')
      if (result.primaryCount !== 1) failures.push('primary_action')
      if (result.targetHeights.some(height => height < 48)) failures.push('touch_target')
      if (!result.focusVisible) failures.push('keyboard_focus')
      if (!result.accessLinkVisible || result.accessLinkHeight < 48 || !result.accessLinkFocusVisible) failures.push('secondary_action_accessibility')
      if (result.faqCount !== 5 || result.faqSummaryHeights.some(height => height < 48) || !result.faqGeometryValid
        || !result.faqFocusVisible || !result.faqKeyboardInteraction) failures.push('faq_accessibility')
      if (result.switchHref !== expectedSwitch) failures.push('language_switch')
      if (result.tableauCount !== 1 || result.figureCount !== 3 || result.tableauHeight < 360) failures.push('tableau')
      if (!result.imagesLoaded || !result.imagesUnclipped) failures.push('image_bounds')
      if (result.figuresOverlap || result.captionsOverlapImages) failures.push('composition_overlap')
      if (result.primaryObscured) failures.push('checkout_obscured')
      if (viewport.width === 390 && result.primaryWidth < 320) failures.push('primary_readability')
      if (result.captionSizes.some(size => size < 11.5)) failures.push('caption_readability')
      const expectedDisclosure = expectedLang === 'my'
        ? 'နမူနာဒေတာဖြင့် ဖော်ပြထားသော Shop အက်ပ်မြင်ကွင်း။'
        : 'Illustrative Shop preview with synthetic sample data.'
      if (!result.disclosureVisible || result.disclosureText !== expectedDisclosure) failures.push('sample_disclosure')
      if (result.storySectionCount !== 6 || result.templateCount !== 4 || result.platformCount !== 3) failures.push('story_structure')
      if (result.storyHeadingSizes.length !== 6 || result.storyHeadingSizes.some(size => size < 28)) failures.push('story_readability')
      if (expectedLang === 'my' && (result.storyHeadingLineHeights.some((height, index) => height < result.storyHeadingSizes[index] * 1.45)
        || result.storyHeadingTracking.some(value => value !== 'normal' && Math.abs(Number.parseFloat(value)) > 0.01))) failures.push('myanmar_story_typography')
      if (result.deviceLabels) failures.push('device_label')
      if (result.forbiddenCopy) failures.push('copy')
      cases.push({ route, ...viewport, ...result, failures })
    }
  }
  const failures = cases.flatMap(entry => entry.failures.map(failure => `${entry.route}@${entry.width}:${failure}`))
  const report = { ok: failures.length === 0, contract: 'supermega.public-shop-responsive.v1', cases, failures }
  console.log(JSON.stringify(report, null, 2))
  if (failures.length) process.exitCode = 1
} finally {
  if (cdp) {
    await cdp.send('Browser.close', {}, '', 2_000).catch(() => {})
    await cdp.close().catch(() => {})
  }
  server.close()
  browser?.kill()
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
}
