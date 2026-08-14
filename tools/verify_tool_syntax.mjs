// Parses every tool in tools/ and fails if any of them is not valid JavaScript.
//
// This exists because a tool that app:verify does not RUN has no safety net at all. The
// mutation audit is deliberately excluded from app:verify -- it rewrites source files and
// takes minutes -- and a broken version of it was committed and pushed with every gate
// green, because nothing parsed it. Three separate escaping faults in this branch wrote a
// literal newline into a JS string; each produced a file that looked fine in a diff.
//
// Parsing is cheap enough to do for all of them, including the ones app:verify already runs:
// those fail loudly anyway, so covering them costs nothing and keeps the rule simple.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const TOOLS = 'tools'
const scripts = readdirSync(TOOLS)
  .filter((entry) => entry.endsWith('.mjs'))
  .map((entry) => join(TOOLS, entry))
  .filter((path) => statSync(path).isFile())
  .sort()

if (scripts.length < 10) {
  console.error(JSON.stringify({ ok: false, error: 'tool_scan_found_too_few_scripts', found: scripts.length }))
  process.exit(1)
}

const broken = []
for (const path of scripts) {
  try {
    execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' })
  } catch (error) {
    const detail = String(error.stderr ?? error.message ?? '')
      .split('\n')
      .find((line) => /Error|error/.test(line)) ?? 'unparseable'
    broken.push({ path, detail: detail.trim().slice(0, 160) })
  }
}

if (broken.length) {
  console.error(JSON.stringify({ ok: false, error: 'tool_syntax_invalid', broken }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, contract: 'supermega.tool-syntax.v1', scripts: scripts.length }))
