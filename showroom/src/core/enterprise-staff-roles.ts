// Implementation of the staff-roles enterprise capability.
// See hq/research/enterprise-capabilities-design-2026-08.md Tier 2.
// Gated behind capability 'staff-roles' (enterprise tier, requires managedIdentity).
// Prerequisites: verified-statements proven in production.

export const STAFF_ROLE_ASSIGNMENT_SCHEMA = 'supermega.staff-role-assignment.v1' as const
export const REQUIRED_AUTHORITY_SCHEMA = 'supermega.required-authority.v1' as const

export type StaffRole =
  | 'cashier'
  | 'fulfiller'
  | 'stock-manager'
  | 'shop-supervisor'
  | 'plant-operator'
  | 'plant-supervisor'
  | 'quality-inspector'
  | 'accountant-liaison'
  | 'admin'
  | 'owner'

export const STAFF_ROLES: readonly StaffRole[] = [
  'cashier',
  'fulfiller',
  'stock-manager',
  'shop-supervisor',
  'plant-operator',
  'plant-supervisor',
  'quality-inspector',
  'accountant-liaison',
  'admin',
  'owner',
]

// Numeric level for ordering: higher number = more authority.
// owner is always highest; admin covers all non-configuration writes.
const ROLE_LEVEL: Record<StaffRole, number> = {
  cashier: 10,
  fulfiller: 10,
  'stock-manager': 10,
  'accountant-liaison': 10,
  'quality-inspector': 20,
  'plant-operator': 20,
  'plant-supervisor': 30,
  'shop-supervisor': 30,
  admin: 80,
  owner: 100,
}

export function roleLevel(role: StaffRole): number {
  return ROLE_LEVEL[role]
}

export type RoleAssignment = {
  schema: typeof STAFF_ROLE_ASSIGNMENT_SCHEMA
  tenantId: string
  roleId: StaffRole
  assignedTo: string        // authenticated user identity
  assignedAt: string        // ISO 8601 timestamp
  assignedBy: string        // must be 'owner' or 'admin' role holder
  effectiveTo?: string      // optional ISO 8601 expiry
  evidenceReference: string // why this person was given this role
}

export type RequiredAuthority = {
  schema: typeof REQUIRED_AUTHORITY_SCHEMA
  minimumRole: StaffRole
  ownerCanOverride: true    // always true; owner is never blocked
  requiresManagerApproval?: boolean
}

export function isRoleValid(role: string): role is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(role)
}

export function canPerformWrite(actorRole: StaffRole, required: RequiredAuthority): boolean {
  if (actorRole === 'owner') return true
  return ROLE_LEVEL[actorRole] >= ROLE_LEVEL[required.minimumRole]
}

export function isAssignmentExpired(assignment: RoleAssignment, asOf: string): boolean {
  if (!assignment.effectiveTo) return false
  return assignment.effectiveTo < asOf
}

export function buildRoleAssignment(input: {
  tenantId: string
  roleId: StaffRole
  assignedTo: string
  assignedAt: string
  assignedBy: StaffRole
  effectiveTo?: string
  evidenceReference: string
}): RoleAssignment | null {
  if (!isRoleValid(input.roleId)) return null
  if (!input.tenantId.trim()) return null
  if (!input.assignedTo.trim()) return null
  if (!input.assignedAt) return null
  if (!input.evidenceReference.trim()) return null
  if (input.assignedBy !== 'owner' && input.assignedBy !== 'admin') return null
  if (input.roleId === 'owner') return null  // owner role cannot be assigned via this path
  if (input.effectiveTo && input.effectiveTo <= input.assignedAt) return null

  return {
    schema: STAFF_ROLE_ASSIGNMENT_SCHEMA,
    tenantId: input.tenantId,
    roleId: input.roleId,
    assignedTo: input.assignedTo,
    assignedAt: input.assignedAt,
    assignedBy: input.assignedBy,
    ...(input.effectiveTo ? { effectiveTo: input.effectiveTo } : {}),
    evidenceReference: input.evidenceReference,
  }
}

export function buildRequiredAuthority(
  minimumRole: StaffRole,
  requiresManagerApproval?: boolean,
): RequiredAuthority {
  return {
    schema: REQUIRED_AUTHORITY_SCHEMA,
    minimumRole,
    ownerCanOverride: true,
    ...(requiresManagerApproval ? { requiresManagerApproval: true } : {}),
  }
}
