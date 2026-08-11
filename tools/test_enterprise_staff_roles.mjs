import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      STAFF_ROLE_ASSIGNMENT_SCHEMA,
      REQUIRED_AUTHORITY_SCHEMA,
      STAFF_ROLES,
      isRoleValid,
      roleLevel,
      canPerformWrite,
      isAssignmentExpired,
      buildRoleAssignment,
      buildRequiredAuthority,
    } from './enterprise-staff-roles.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/staff-roles-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  STAFF_ROLE_ASSIGNMENT_SCHEMA,
  REQUIRED_AUTHORITY_SCHEMA,
  STAFF_ROLES,
  isRoleValid,
  roleLevel,
  canPerformWrite,
  isAssignmentExpired,
  buildRoleAssignment,
  buildRequiredAuthority,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const TENANT = 'tenant-yangon-tyre'
const AT = '2026-08-11T09:00:00.000Z'
const BY_OWNER = 'owner'
const TO = 'cashier@business.mm'
const EVIDENCE = 'Enrolled as cashier for morning shift'

// 1. Schema constants
check(STAFF_ROLE_ASSIGNMENT_SCHEMA === 'supermega.staff-role-assignment.v1', 'assignment schema constant')
check(REQUIRED_AUTHORITY_SCHEMA === 'supermega.required-authority.v1', 'required authority schema constant')

// 2. STAFF_ROLES has 10 roles
check(STAFF_ROLES.length === 10, 'ten staff roles defined')

// 3. All expected roles present
for (const role of ['cashier', 'fulfiller', 'stock-manager', 'shop-supervisor', 'plant-operator', 'plant-supervisor', 'quality-inspector', 'accountant-liaison', 'admin', 'owner']) {
  check(STAFF_ROLES.includes(role), `role ${role} is present`)
}

// 4. isRoleValid
check(isRoleValid('cashier'), 'cashier is valid')
check(isRoleValid('owner'), 'owner is valid')
check(!isRoleValid('receptionist'), 'unknown role is invalid')
check(!isRoleValid(''), 'empty string is invalid')

// 5. roleLevel ordering: owner > admin > supervisor > operator > cashier
check(roleLevel('owner') > roleLevel('admin'), 'owner > admin')
check(roleLevel('admin') > roleLevel('shop-supervisor'), 'admin > shop-supervisor')
check(roleLevel('shop-supervisor') > roleLevel('cashier'), 'shop-supervisor > cashier')
check(roleLevel('plant-supervisor') > roleLevel('plant-operator'), 'plant-supervisor > plant-operator')
check(roleLevel('quality-inspector') === roleLevel('plant-operator'), 'quality-inspector and plant-operator are peer level')

// 6. canPerformWrite: owner always succeeds
const allRoles = STAFF_ROLES
for (const r of allRoles) {
  const req = buildRequiredAuthority(r)
  check(canPerformWrite('owner', req), `owner can perform write requiring ${r}`)
}

// 7. canPerformWrite: cashier can perform cashier-level writes
check(canPerformWrite('cashier', buildRequiredAuthority('cashier')), 'cashier can do cashier-level write')

// 8. canPerformWrite: cashier cannot do shop-supervisor write
check(!canPerformWrite('cashier', buildRequiredAuthority('shop-supervisor')), 'cashier cannot do shop-supervisor write')

// 9. canPerformWrite: shop-supervisor can do cashier write
check(canPerformWrite('shop-supervisor', buildRequiredAuthority('cashier')), 'shop-supervisor can do cashier write')

// 10. canPerformWrite: plant-operator cannot do shop-supervisor write (separate hierarchy)
check(!canPerformWrite('plant-operator', buildRequiredAuthority('shop-supervisor')), 'plant-operator cannot do shop-supervisor write')

// 11. canPerformWrite: admin can do everything except owner-level (admin < owner)
check(canPerformWrite('admin', buildRequiredAuthority('shop-supervisor')), 'admin can do shop-supervisor write')
check(canPerformWrite('admin', buildRequiredAuthority('plant-supervisor')), 'admin can do plant-supervisor write')
check(canPerformWrite('admin', buildRequiredAuthority('quality-inspector')), 'admin can do quality-inspector write')

// 12. buildRoleAssignment: valid assignment
const a1 = buildRoleAssignment({ tenantId: TENANT, roleId: 'cashier', assignedTo: TO, assignedAt: AT, assignedBy: BY_OWNER, evidenceReference: EVIDENCE })
check(a1 !== null, 'valid assignment builds')
check(a1.schema === STAFF_ROLE_ASSIGNMENT_SCHEMA, 'assignment has correct schema')
check(a1.roleId === 'cashier', 'assignment stores roleId')
check(a1.tenantId === TENANT, 'assignment stores tenantId')
check(a1.assignedTo === TO, 'assignment stores assignedTo')
check(a1.assignedAt === AT, 'assignment stores assignedAt')
check(a1.assignedBy === 'owner', 'assignment stores assignedBy')
check(a1.evidenceReference === EVIDENCE, 'assignment stores evidenceReference')
check(a1.effectiveTo === undefined, 'effectiveTo absent when not provided')

// 13. buildRoleAssignment: with optional expiry
const a2 = buildRoleAssignment({ tenantId: TENANT, roleId: 'fulfiller', assignedTo: TO, assignedAt: AT, assignedBy: BY_OWNER, effectiveTo: '2026-11-11T09:00:00.000Z', evidenceReference: EVIDENCE })
check(a2 !== null, 'assignment with effectiveTo builds')
check(a2.effectiveTo === '2026-11-11T09:00:00.000Z', 'effectiveTo stored')

// 14. buildRoleAssignment: admin can also assign
const a3 = buildRoleAssignment({ tenantId: TENANT, roleId: 'cashier', assignedTo: TO, assignedAt: AT, assignedBy: 'admin', evidenceReference: EVIDENCE })
check(a3 !== null, 'admin can assign roles')

// 15. buildRoleAssignment: cashier cannot assign (non-owner/admin)
const aBadAssigner = buildRoleAssignment({ tenantId: TENANT, roleId: 'cashier', assignedTo: TO, assignedAt: AT, assignedBy: 'cashier', evidenceReference: EVIDENCE })
check(aBadAssigner === null, 'cashier cannot assign roles')

// 16. buildRoleAssignment: owner role cannot be assigned via this path
const aOwner = buildRoleAssignment({ tenantId: TENANT, roleId: 'owner', assignedTo: TO, assignedAt: AT, assignedBy: BY_OWNER, evidenceReference: EVIDENCE })
check(aOwner === null, 'owner role cannot be assigned via buildRoleAssignment')

// 17. buildRoleAssignment: empty tenantId returns null
check(buildRoleAssignment({ tenantId: '', roleId: 'cashier', assignedTo: TO, assignedAt: AT, assignedBy: BY_OWNER, evidenceReference: EVIDENCE }) === null, 'empty tenantId returns null')

// 18. buildRoleAssignment: empty assignedTo returns null
check(buildRoleAssignment({ tenantId: TENANT, roleId: 'cashier', assignedTo: '', assignedAt: AT, assignedBy: BY_OWNER, evidenceReference: EVIDENCE }) === null, 'empty assignedTo returns null')

// 19. buildRoleAssignment: empty evidenceReference returns null
check(buildRoleAssignment({ tenantId: TENANT, roleId: 'cashier', assignedTo: TO, assignedAt: AT, assignedBy: BY_OWNER, evidenceReference: '' }) === null, 'empty evidenceReference returns null')

// 20. buildRoleAssignment: empty assignedAt returns null
check(buildRoleAssignment({ tenantId: TENANT, roleId: 'cashier', assignedTo: TO, assignedAt: '', assignedBy: BY_OWNER, evidenceReference: EVIDENCE }) === null, 'empty assignedAt returns null')

// 21. buildRoleAssignment: effectiveTo <= assignedAt returns null
check(buildRoleAssignment({ tenantId: TENANT, roleId: 'cashier', assignedTo: TO, assignedAt: AT, assignedBy: BY_OWNER, effectiveTo: AT, evidenceReference: EVIDENCE }) === null, 'effectiveTo == assignedAt returns null')
check(buildRoleAssignment({ tenantId: TENANT, roleId: 'cashier', assignedTo: TO, assignedAt: AT, assignedBy: BY_OWNER, effectiveTo: '2026-08-01T00:00:00.000Z', evidenceReference: EVIDENCE }) === null, 'effectiveTo before assignedAt returns null')

// 22. isAssignmentExpired: not expired when no effectiveTo
const aNoExpiry = buildRoleAssignment({ tenantId: TENANT, roleId: 'cashier', assignedTo: TO, assignedAt: AT, assignedBy: BY_OWNER, evidenceReference: EVIDENCE })
check(!isAssignmentExpired(aNoExpiry, '2099-01-01T00:00:00.000Z'), 'no-expiry assignment is not expired')

// 23. isAssignmentExpired: expired when asOf is past effectiveTo
const aExpiring = buildRoleAssignment({ tenantId: TENANT, roleId: 'cashier', assignedTo: TO, assignedAt: AT, assignedBy: BY_OWNER, effectiveTo: '2026-09-01T00:00:00.000Z', evidenceReference: EVIDENCE })
check(!isAssignmentExpired(aExpiring, '2026-08-31T23:59:59.000Z'), 'not expired before effectiveTo')
check(isAssignmentExpired(aExpiring, '2026-09-01T01:00:00.000Z'), 'expired after effectiveTo')

// 24. buildRequiredAuthority returns correct shape
const req = buildRequiredAuthority('shop-supervisor')
check(req.schema === REQUIRED_AUTHORITY_SCHEMA, 'required authority has correct schema')
check(req.minimumRole === 'shop-supervisor', 'minimum role stored')
check(req.ownerCanOverride === true, 'ownerCanOverride is always true')
check(req.requiresManagerApproval === undefined, 'requiresManagerApproval absent by default')

// 25. buildRequiredAuthority with manager approval flag
const reqMgr = buildRequiredAuthority('cashier', true)
check(reqMgr.requiresManagerApproval === true, 'requiresManagerApproval set when requested')

console.log(`\ntest_enterprise_staff_roles: ${checks} checks passed\n`)
