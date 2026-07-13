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
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) walk(fullPath, visitor)
    else if (entry.isFile()) {
      try {
        visitor(fullPath, statSync(fullPath))
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
    }
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
const expectedFunctions = new Set(['contact-submissions.js.func', 'health.js.func', 'not-found.js.func'])
const actualFunctions = new Set(functionBudgets.map((entry) => entry.name))

for (const name of actualFunctions) {
  if (!expectedFunctions.has(name)) fail('retired_public_function_present', { name })
}
for (const name of expectedFunctions) {
  if (!actualFunctions.has(name)) fail('required_public_function_missing', { name })
}

if (duplicateApiNodeModules > 0) fail('duplicate_api_node_modules_present', { duplicateApiNodeModules })
if (totalFiles > 60) fail('public_output_file_budget_exceeded', { totalFiles, maxFiles: 60, worstFunction })
if (totalBytes > 1024 * 1024) {
  fail('public_output_size_budget_exceeded', {
    totalMb: Number((totalBytes / 1024 / 1024).toFixed(2)),
    maxMb: 1,
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
