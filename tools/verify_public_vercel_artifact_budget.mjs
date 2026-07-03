import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = process.cwd()
const outputDir = resolve(root, '.vercel/output')
const functionsApiDir = resolve(outputDir, 'functions/api')

function fail(code, detail = {}) {
  console.error(JSON.stringify({ ok: false, code, ...detail }, null, 2))
  process.exit(1)
}

function walk(dir, visitor) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) walk(fullPath, visitor)
    else if (entry.isFile()) visitor(fullPath, statSync(fullPath))
  }
}

if (!existsSync(outputDir)) fail('public_output_missing', { path: outputDir })
if (!existsSync(functionsApiDir)) fail('public_functions_missing', { path: functionsApiDir })

let totalFiles = 0
let totalBytes = 0
let duplicateApiNodeModules = 0

walk(outputDir, (file, stats) => {
  totalFiles += 1
  totalBytes += stats.size
  if (file.includes(`${join('.func', 'api', 'node_modules')}`)) duplicateApiNodeModules += 1
})

const functionBudgets = []
for (const entry of readdirSync(functionsApiDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.endsWith('.func')) continue
  let files = 0
  let bytes = 0
  walk(join(functionsApiDir, entry.name), (_file, stats) => {
    files += 1
    bytes += stats.size
  })
  functionBudgets.push({ name: entry.name, files, mb: Number((bytes / 1024 / 1024).toFixed(2)) })
}

const worstFunction = functionBudgets.sort((a, b) => b.files - a.files)[0]

if (duplicateApiNodeModules > 0) fail('duplicate_api_node_modules_present', { duplicateApiNodeModules })
if (totalFiles > 30000) fail('public_output_file_budget_exceeded', { totalFiles, maxFiles: 30000, worstFunction })
if (totalBytes > 180 * 1024 * 1024) {
  fail('public_output_size_budget_exceeded', {
    totalMb: Number((totalBytes / 1024 / 1024).toFixed(2)),
    maxMb: 180,
    worstFunction,
  })
}

console.log(
  JSON.stringify(
    {
      ok: true,
      contract: 'public_vercel_artifact_budget',
      totalFiles,
      totalMb: Number((totalBytes / 1024 / 1024).toFixed(2)),
      worstFunction,
    },
    null,
    2,
  ),
)
