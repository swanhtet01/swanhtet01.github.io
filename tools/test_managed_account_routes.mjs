import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  alternateManagedWorkspaceId,
  managedAccountPath,
  managedAccountRequestUrl,
  managedPortalEntryPath,
} from '../showroom/src/core/account-routes.ts'

const productRoutes = new Map([
  ['shop', '/shop/'],
  ['commerce', '/shop/'],
  ['plant', '/plant/'],
  ['production', '/plant/'],
  ['website', '/website/'],
  ['ecommerce', '/ecommerce/'],
])

for (const [intent, expected] of productRoutes) {
  assert.equal(managedPortalEntryPath(intent), expected)
  assert.equal(managedPortalEntryPath(`  ${intent.toUpperCase()}  `), expected)
}

for (const intent of [null, '', 'guide', 'settings', 'https://example.com']) {
  assert.equal(managedPortalEntryPath(intent), '/?choose=1')
}

assert.equal(managedAccountPath('/login', 'commerce'), '/login?product=shop')
assert.equal(managedAccountPath('/account/recovery', 'production'), '/account/recovery?product=plant')
assert.match(managedAccountRequestUrl('website'), /product=website/)
assert.equal(alternateManagedWorkspaceId([
  { workspaceId: 'company-a' },
  { workspaceId: 'company-b' },
], 'company-a'), 'company-b')
assert.equal(alternateManagedWorkspaceId([{ workspaceId: 'company-a' }], 'company-a'), '')
assert.equal(alternateManagedWorkspaceId([], 'company-a'), '')

const managedLoginSource = readFileSync(new URL('../showroom/src/core/ManagedLoginPage.tsx', import.meta.url), 'utf8')
for (const required of [
  'alternateManagedWorkspaceId(signIn.workspaces, existingIdentity.workspaceId)',
  'setDirectory(signIn)',
  'await signOutManagedTrial()',
  'Switch company',
  'Sign out',
]) assert.match(managedLoginSource, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

const coreShellSource = readFileSync(new URL('../showroom/src/core/CoreShell.tsx', import.meta.url), 'utf8')
for (const required of [
  'discoverManagedWorkspacesForCurrentSession()',
  'directory.workspaces.find((workspace) => workspace.workspaceId === selectedWorkspace)',
  "directory.userId !== identity.userId",
  'aria-label="Active company"',
  '{portalAccess.companyName}',
  '{portalAccess.accountEmail}',
  '{portalAccess.companyRole}',
  'Switch company',
]) assert.match(coreShellSource, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

console.log(JSON.stringify({
  ok: true,
  contract: 'supermega.managed-account-routes.v1',
  checks: (productRoutes.size * 2) + 24,
  defaultEntry: managedPortalEntryPath(null),
}))
