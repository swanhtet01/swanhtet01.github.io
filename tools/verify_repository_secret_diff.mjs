#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const MAX_DIFF_BYTES = 256 * 1024 * 1024

const RULES = Object.freeze([
  ['private-key', /-----BEGIN (?:(?:RSA|EC|OPENSSH|DSA|ENCRYPTED) )?PRIVATE KEY-----/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['openai-key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{30,}\b/],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['stripe-live-secret', /\bsk_live_[A-Za-z0-9]{20,}\b/],
  ['supabase-secret-key', /\bsb_secret_[A-Za-z0-9_-]{20,}\b/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/],
  ['bearer-token', /\bBearer\s+[A-Za-z0-9._~+\/-]{20,}\b/],
  ['member-card-token', /\bSMC1\.[A-Za-z0-9_-]{32,}\b/],
  ['credential-url', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:@/]+:[^\s@/]+@[^\s/]+/],
])

function pathDigest(file) {
  return `sha256:${createHash('sha256').update(String(file || '')).digest('hex')}`
}

export function scanAddedLines(diffSource) {
  const findings = []
  let file = null
  let newLine = 0
  let addedLines = 0
  let inHunk = false

  for (const line of String(diffSource).split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      inHunk = false
      continue
    }
    if (!inHunk && line.startsWith('+++ b/')) {
      file = line.slice(6)
      continue
    }
    const hunk = line.match(/^@@ -[^ ]+ \+(\d+)/)
    if (hunk) {
      inHunk = true
      newLine = Number(hunk[1])
      continue
    }
    if (inHunk && line.startsWith('+')) {
      addedLines += 1
      const content = line.slice(1)
      for (const [rule, pattern] of RULES) {
        if (pattern.test(content)) findings.push({ rule, pathDigest: pathDigest(file), line: newLine })
      }
      newLine += 1
    } else if (line.startsWith(' ')) {
      newLine += 1
    }
  }

  return {
    ok: findings.length === 0,
    contract: 'supermega.repository-secret-diff.v1',
    addedLines,
    findingCount: findings.length,
    findings,
    valuesExposed: false,
  }
}

function parseArgs(argv) {
  const args = { base: null, head: null }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--base') args.base = argv[++index]
    else if (argv[index] === '--head') args.head = argv[++index]
    else throw new Error(`repository_secret_diff_unknown_arg:${argv[index]}`)
  }
  if (!args.base || !args.head) throw new Error('repository_secret_diff_base_and_head_required')
  return args
}

function gitDiff(base, head) {
  for (const revision of [base, head]) {
    execFileSync('git', ['rev-parse', '--verify', `${revision}^{commit}`], {
      stdio: ['ignore', 'ignore', 'ignore'],
    })
  }
  return execFileSync(
    'git',
    ['diff', '--no-ext-diff', '--text', '--unified=0', '--no-renames', base, head, '--'],
    { encoding: 'utf8', maxBuffer: MAX_DIFF_BYTES },
  )
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const result = scanAddedLines(gitDiff(args.base, args.head))
  console.log(JSON.stringify({ ...result, base: args.base, head: args.head }, null, 2))
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main()
}
