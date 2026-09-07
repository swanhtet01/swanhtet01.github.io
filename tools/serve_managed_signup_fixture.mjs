// Local human QA only; never a release, provider, identity or email-delivery proof.
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
if (args.length !== 2 || args[0] !== '--expected-head' || !/^[0-9a-f]{40}$/.test(args[1])) throw Error('exact_expected_head_required')
const git = (...argv) => execFileSync('git', argv, { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
const head = git('rev-parse', 'HEAD')
if (head !== args[1] || git('status', '--porcelain')) throw Error('clean_exact_source_required')
const require = createRequire(resolve(root, 'showroom/package.json'))
const { build } = await import(pathToFileURL(require.resolve('esbuild')).href)
const policy = { status: 'ready', authentication: {
  self_serve_signup_open: true, supabase_user_tokens_ready: true,
  anonymous_users_allowed: false, client_asserted_roles_allowed: false,
  self_serve_signup_terms_version: 'v1', self_serve_signup_terms_url: 'https://supermega.dev/terms/v1/',
} }
const result = await build({
  absWorkingDir: root, bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic',
  outdir: 'fixture-memory', minify: false, logLevel: 'error',
  define: { 'import.meta.env': JSON.stringify({
    VITE_SUPABASE_URL: 'https://auth.example.invalid',
    VITE_SUPABASE_PUBLISHABLE_KEY: ['sb', 'publishable', 'synthetic-unit-test-only'].join('_'),
  }), 'process.env.NODE_ENV': '"development"' },
  stdin: { resolveDir: resolve(root, 'showroom/src/core'), loader: 'tsx', contents: `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import { MemoryRouter, Routes, Route, Outlet } from 'react-router';
    import { ManagedLoginPage } from './ManagedLoginPage.tsx';
    import { readManagedSignupPolicy } from './managed-signup-policy.ts';
    import './core-app.css';
    const health = ${JSON.stringify(policy)};
    const counter = document.getElementById('fixture-counts');
    const counts = { authRequests: 0, healthReads: 0, blockedRequests: 0, errors: 0 };
    const show = () => { counter.textContent = Object.entries(counts).map(([key,value]) => key + ': ' + value).join(' · ') }; show();
    window.addEventListener('fixture-auth-request', () => { counts.authRequests++; show() });
    window.addEventListener('error', () => { counts.errors++; show() });
    window.addEventListener('unhandledrejection', () => { counts.errors++; show() });
    window.fetch = async (url, init = {}) => {
      if (url === '/api/health' && (init.method ?? 'GET') === 'GET') {
        counts.healthReads++; show(); return new Response(JSON.stringify(health), { headers: { 'content-type': 'application/json' } });
      }
      counts.blockedRequests++; show(); throw Error('fixture_network_denied');
    };
    function Frame() { return <main className="core-main"><div className="core-route-content"><Outlet context={{status:'demo', signupPolicy:readManagedSignupPolicy(health)}} /></div></main> }
    createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/login?product=shop']}>
      <Routes><Route element={<Frame/>}><Route path='/login' element={<ManagedLoginPage/>}/>
      <Route path='/account/recovery' element={<p>Recovery route reached. Synthetic QA does not send email.</p>}/></Route></Routes>
    </MemoryRouter>);
  ` },
  plugins: [{ name: 'local-only-auth-fixture', setup(builder) {
    builder.onResolve({ filter: /^@supabase\/auth-js$/ }, () => ({ path: 'provider', namespace: 'qa-auth' }))
    builder.onLoad({ filter: /.*/, namespace: 'qa-auth' }, () => ({ contents: `
      export class AuthClient {
        async getSession() { return { data: { session: null }, error: null } }
        async signUp(input) {
          if (input.email !== 'owner@example.invalid') throw Error('synthetic_email_only');
          window.dispatchEvent(new Event('fixture-auth-request'));
          return { data: { user: null, session: null }, error: null };
        }
        async resend(input) { return this.signUp(input) }
      }` }))
  } }],
})
const assets = new Map(result.outputFiles.map((file) => ['/' + file.path.split(/[\\/]/).at(-1), file.contents]))
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SuperMega synthetic signup QA</title><link rel="stylesheet" href="/stdin.css"><body><aside>LOCAL SYNTHETIC QA — no real account or email. Source ${head.slice(0, 8)}.</aside><output id="fixture-counts"></output><div id="root"></div><script type="module" src="/stdin.js"></script></body></html>`
const server = createServer((request, response) => {
  if (request.headers.host !== '127.0.0.1:4194' || request.method !== 'GET') { response.writeHead(403); response.end(); return }
  response.setHeader('cache-control', 'no-store')
  response.setHeader('content-security-policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'none'; font-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'")
  response.setHeader('referrer-policy', 'no-referrer')
  response.setHeader('x-content-type-options', 'nosniff')
  const path = request.url
  const asset = assets.get(path)
  if (path === '/') { response.setHeader('content-type', 'text/html; charset=utf-8'); response.end(html) }
  else if (asset) { response.setHeader('content-type', path.endsWith('.css') ? 'text/css' : 'text/javascript'); response.end(asset) }
  else { response.writeHead(404); response.end() }
})
server.listen(4194, '127.0.0.1', () => console.log(JSON.stringify({ mode: 'synthetic_only', head, url: 'http://127.0.0.1:4194/', externalRequestsAllowed: false })))
