import js from '@eslint/js'
import globals from 'globals'
import { defineConfig, globalIgnores } from 'eslint/config'

// Node ESM lint config for kernel/ — connectors, orchestration scripts, and
// their node:test files. No React/browser tooling here; that lives in
// showroom/eslint.config.js.
//
// First adoption pass (2026-08): kernel/ had zero static analysis before
// this config, so `js.configs.recommended` surfaced ~50 pre-existing findings
// across 91+ files. `no-undef` (undefined globals) had zero hits and stays a
// hard error. Everything below is either a real-but-harmless pattern already
// baked into the codebase (defensive `let x = ''` before a try/catch,
// scaffolding `try/catch` around code that always returns, `\#`/`\!` escaped
// in regexes) or genuinely stylistic (control-character regexes used
// on purpose in sanitizers, `case` fallthrough in parsers). Downgraded to
// `warn` so `npm run lint` is green on adoption; each is still visible in
// output for anyone doing cleanup. Tighten back to `error` file-by-file as
// they're fixed rather than silencing the rule outright.
const adoptionRules = {
  'no-unused-vars': [
    'warn',
    {
      args: 'after-used',
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrors: 'none',
    },
  ],
  'no-case-declarations': 'warn',
  'no-control-regex': 'warn',
  'no-fallthrough': 'warn',
  'no-empty': 'warn',
  'no-constant-condition': ['warn', { checkLoops: false }],
  'no-useless-assignment': 'warn',
  'no-useless-escape': 'warn',
  'no-unreachable': 'warn',
  'preserve-caught-error': 'warn',
}

export default defineConfig([
  globalIgnores(['node_modules']),
  {
    files: ['**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-undef': 'error',
      ...adoptionRules,
    },
  },
  {
    // Browser script served directly to clients — no Node globals, and it's
    // a classic script (no import/export), not a module.
    files: ['public/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: globals.browser,
    },
    rules: {
      'no-undef': 'error',
      ...adoptionRules,
    },
  },
])
