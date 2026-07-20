import { chromium } from 'playwright'

const publicBaseUrl = (process.argv[2] || process.env.SUPERMEGA_PUBLIC_BASE_URL || 'https://supermega.dev').replace(/\/$/, '')
const expectedAppHost = process.env.SUPERMEGA_APP_HOST || 'app.supermega.dev'
const timeoutMs = Number(process.env.SUPERMEGA_PUBLIC_HANDOFF_TIMEOUT_MS || 45000)

async function bodyExcerpt(page) {
  const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')
  return text.replace(/\s+/g, ' ').trim().slice(0, 700)
}

async function waitForFinalBody(page) {
  const deadline = Date.now() + timeoutMs
  let excerpt = ''
  while (Date.now() < deadline) {
    excerpt = await bodyExcerpt(page)
    if (excerpt.length > 80 && !/Opening workspace|Loading workspace|Loading page/i.test(excerpt)) {
      return excerpt
    }
    await page.waitForTimeout(350)
  }
  return excerpt
}

async function run() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
  })
  const page = await context.newPage()

  try {
    const clientHandoff = await context.request.get(`${publicBaseUrl}/app/start?handoff_smoke=${Date.now()}`, {
      maxRedirects: 0,
      timeout: timeoutMs,
    })
    const clientLocation = clientHandoff.headers().location || ''
    const clientHandoffOk =
      [301, 302, 303, 307, 308].includes(clientHandoff.status()) &&
      clientLocation.includes(expectedAppHost) &&
      clientLocation.includes(expectedAppHost) &&
      !/yangon|ytf|plant|private/i.test(clientLocation)
    if (!clientHandoffOk) {
      throw new Error(`Public client handoff leaked private path or used wrong redirect: HTTP ${clientHandoff.status()} ${clientLocation}`)
    }

    const targetUrl = clientLocation
    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
    if (!response || !response.ok()) {
      throw new Error(`${targetUrl} returned ${response?.status() ?? 'no_response'}`)
    }

    const finalUrl = page.url()
    const final = new URL(finalUrl)
    const body = await waitForFinalBody(page)
    const workspace = final.searchParams.get('workspace') || ''
    const lead = final.searchParams.get('lead') || ''
    const passed =
      final.hostname === expectedAppHost &&
      final.pathname === '/' &&
      body.length > 80 &&
      !/app\.supermega\.dev\/login|yangon tyre|YTF|Plant A|Plant B/i.test(body)

    const result = {
      status: passed ? 'ready' : 'blocked',
      public_base_url: publicBaseUrl,
      expected_app_host: expectedAppHost,
      expected_public_path: '/app/start -> /',
      final_url: finalUrl,
      workspace_param: workspace,
      lead_param: lead,
      body_excerpt: body,
    }
    console.log(JSON.stringify(result, null, 2))
    if (!passed) {
      process.exit(1)
    }
  } finally {
    await context.close()
    await browser.close()
  }
}

run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: 'error',
        public_base_url: publicBaseUrl,
        expected_app_host: expectedAppHost,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  )
  process.exit(1)
})
