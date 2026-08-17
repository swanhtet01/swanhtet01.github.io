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
import { execFile } from 'node:child_process'
import { cpus } from 'node:os'

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

function check(path) {
  return new Promise((done) => {
    execFile(process.execPath, ['--check', path], (error, _stdout, stderr) => {
      if (!error) { done(null); return }
      const detail = String(stderr ?? error.message ?? '')
        .split('\n')
        .find((line) => /Error|error/.test(line)) ?? 'unparseable'
      done({ path, detail: detail.trim().slice(0, 160) })
    })
  })
}

// Each `node --check` is independent, so run a bounded pool instead of serially
// spawning ~one process at a time (this step was ~35% of the whole gate). Results
// are written back by index, so `broken` stays in sorted-scripts order and the
// output is deterministic regardless of completion timing.
const results = new Array(scripts.length).fill(null)
let cursor = 0
async function worker() {
  for (;;) {
    const i = cursor
    cursor += 1
    if (i >= scripts.length) return
    results[i] = await check(scripts[i])
  }
}
await Promise.all(Array.from({ length: Math.max(1, cpus().length) }, () => worker()))
const broken = results.filter(Boolean)

if (broken.length) {
  console.error(JSON.stringify({ ok: false, error: 'tool_syntax_invalid', broken }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, contract: 'supermega.tool-syntax.v1', scripts: scripts.length }))
