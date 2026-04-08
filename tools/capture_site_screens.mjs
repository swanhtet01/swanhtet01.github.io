import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const baseUrl = (process.argv[2] || 'http://127.0.0.1:4198').replace(/\/+$/, '')
const outputDir = process.argv[3] || path.resolve('showroom', 'public', 'site')
const packageRoot = process.argv[4] || process.env.PLAYWRIGHT_PACKAGE_ROOT

let chromium

if (packageRoot) {
  const candidatePaths = [
    path.join(packageRoot, 'node_modules', 'playwright', 'index.mjs'),
    path.join(packageRoot, 'node_modules', 'playwright', 'index.js'),
  ]
  const packageEntry = candidatePaths.find((candidate) => fs.existsSync(candidate))

  if (!packageEntry) {
    console.error(`Playwright package not found under ${packageRoot}`)
    process.exit(1)
  }

  ;({ chromium } = await import(pathToFileURL(packageEntry).href))
} else {
  ;({ chromium } = await import('playwright'))
}

const edgeCandidates = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)

const edgePath = edgeCandidates.find((candidate) => fs.existsSync(candidate))

if (!edgePath) {
  console.error('Microsoft Edge executable not found.')
  process.exit(1)
}

fs.mkdirSync(outputDir, { recursive: true })

const targets = [
  { route: '/demos/sales-system', filename: 'sales-system-screen.png' },
  { route: '/demos/operations-inbox', filename: 'ops-inbox-screen.png' },
  { route: '/demos/founder-brief', filename: 'founder-brief-screen.png' },
  { route: '/demos/client-portal', filename: 'client-portal-screen.png' },
]

const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
})

const context = await browser.newContext({
  viewport: { width: 1560, height: 1300 },
  deviceScaleFactor: 2,
})

const page = await context.newPage()

for (const target of targets) {
  const url = `${baseUrl}${target.route}`
  const outputPath = path.join(outputDir, target.filename)

  await page.goto(url, { waitUntil: 'networkidle' })
  await page.locator('.sm-demo-frame').first().waitFor({ state: 'visible' })
  await page.locator('.sm-demo-frame').first().screenshot({
    path: outputPath,
    animations: 'disabled',
  })

  console.log(`${target.filename} <= ${url}`)
}

await browser.close()
