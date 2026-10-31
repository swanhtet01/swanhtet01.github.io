import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(resolve('showroom/package.json'))
const { build } = require('esbuild')
const dependencyRoot = resolve(dirname(require.resolve('react/package.json')), '..')
const output = resolve(process.argv[2] || '/tmp/supermega-account-hub-fixture')
mkdirSync(output, { recursive: true })

await build({
  stdin: {
    resolveDir: resolve('.'),
    loader: 'tsx',
    contents: `
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
      import './showroom/src/core/core-app.css'
      import { ManagedAccountHubPage } from './showroom/src/core/ManagedAccountHubPage'
      function RouteProbe({ label }) {
        const location = useLocation()
        return <section data-route-probe="true"><h1>{label}</h1><p>{location.pathname}{location.search}</p></section>
      }
      createRoot(document.getElementById('root')!).render(
        <MemoryRouter initialEntries={['/account' + window.location.search]}>
          <Routes>
            <Route path="/account" element={<ManagedAccountHubPage />} />
            <Route path="/login" element={<RouteProbe label="Sign in required" />} />
            <Route path="/settings/" element={<RouteProbe label="Shop setup" />} />
          </Routes>
        </MemoryRouter>,
      )
    `,
  },
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  jsxImportSource: 'react',
  platform: 'browser',
  target: 'es2022',
  nodePaths: [dependencyRoot],
  outfile: resolve(output, 'fixture.js'),
  define: { 'import.meta.env': '{}' },
  plugins: [{
    name: 'account-hub-synthetic-boundary',
    setup(plugin) {
      plugin.onResolve({ filter: /^\.\/CoreShell$/ }, (args) => args.importer.endsWith('ManagedAccountHubPage.tsx')
        ? { path: 'account-hub-shell', namespace: 'account-hub-fixture' }
        : undefined)
      plugin.onResolve({ filter: /^\.\/managed-portal-access-context$/ }, (args) => args.importer.endsWith('ManagedAccountHubPage.tsx')
        ? { path: 'account-hub-access', namespace: 'account-hub-fixture' }
        : undefined)
      plugin.onResolve({ filter: /^\.\/managed-trial$/ }, (args) => args.importer.endsWith('ManagedAccountHubPage.tsx')
        ? { path: 'account-hub-transport', namespace: 'account-hub-fixture' }
        : undefined)
      plugin.onLoad({ filter: /.*/, namespace: 'account-hub-fixture' }, (args) => {
        if (args.path === 'account-hub-shell') return {
          loader: 'tsx',
          resolveDir: resolve('.'),
          contents: `
            export function PageHeading({ eyebrow, title, copy, actions }) {
              return <header className="page-heading"><div><span className="core-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div><div className="heading-actions">{actions}</div></header>
            }
          `,
        }
        if (args.path === 'account-hub-access') return {
          loader: 'js',
          resolveDir: resolve('.'),
          contents: `
            export function useCurrentManagedPortalAccess() {
              const query = new URLSearchParams(location.search)
              const access = query.get('access')
              if (access === 'staff' || access === 'service' || access === 'signed-out') return { status: 'reauthenticate' }
              const viewer = access === 'viewer'
              const noShop = query.get('product') === 'none'
              return { status: 'ready', products: noShop ? [] : ['commerce'], capabilities: viewer ? [] : ['billing.read'], workspaceId: 'workspace-a', companyName: 'Mingalar Mini Mart', companyRole: viewer ? 'viewer' : 'owner', accountEmail: 'owner@example.test' }
            }
          `,
        }
        return {
          loader: 'js',
          resolveDir: resolve('.'),
          contents: `
            const summary = {
              contract: 'supermega.managed_account_billing.v1',
              identity: { workspace_id: 'workspace-a', actor_id: 'actor-owner', actor_kind: 'human' },
              billing: {
                contract: 'supermega.merchant_billing_summary.v1', workspaceId: 'workspace-a', asOf: '2026-10-24T00:00:00Z',
                package: { bindingStatus: 'legacy_entitlement_only', packageCode: null, term: null, renewalAt: null, entitlementKey: 'premium', entitlementStatus: 'none' },
                invoices: [{ invoiceId: 'invoice-0001', status: 'issued', issuedAt: '2026-10-20T00:00:00Z', dueDate: '2026-11-20', currency: 'MMK', exponent: 0, totalMinor: 125000, refundedMinor: 0, outstandingMinor: 125000, paymentState: 'pending_manual_verification', providerSettlementVerified: false, receiptAvailable: false }],
                excluded: [], totalOutstandingMinorByCurrency: { MMK: 125000 }, recurringBillingConfigured: false, providerSettlementVerified: false, administrativeActionsExposed: false, externalWritesPerformed: false, secretValuesExposed: false,
              },
            }
            export async function currentManagedIdentity() {
              const workspaceId = new URLSearchParams(location.search).get('identity') === 'other-tenant' ? 'workspace-b' : 'workspace-a'
              return { userId: 'actor-owner', email: 'owner@example.test', workspaceId }
            }
            export async function loadManagedAccountBilling() {
              window.__supermegaSyntheticBillingCalls = (window.__supermegaSyntheticBillingCalls || 0) + 1
              const variant = new URLSearchParams(location.search).get('variant')
              await new Promise(resolve => setTimeout(resolve, variant === 'loading' ? 60000 : 25))
              if (variant === 'error') throw new Error('Plan and billing are temporarily unavailable.')
              if (variant === 'empty') return { ...summary, billing: { ...summary.billing, invoices: [], totalOutstandingMinorByCurrency: {} } }
              return summary
            }
          `,
        }
      })
    },
  }],
})

writeFileSync(resolve(output, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./fixture.css"><title>Shop account fixture</title></head><body><main id="root"></main><script type="module" src="./fixture.js"></script></body></html>`)
console.log(JSON.stringify({ ok: true, output, syntheticData: true }))
