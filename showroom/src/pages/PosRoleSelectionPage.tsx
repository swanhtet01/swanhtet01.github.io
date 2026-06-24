import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'

import {
  getPosActiveLocation,
  getPosBusinessProfile,
  getPosLocationCatalog,
  getPosRoleCatalogForBusiness,
  getPosRoleProfile,
  getPosWorkspaceScopeKey,
  loadPosSession,
  setPosActiveLocation,
  setPosActiveRole,
  type PosBusinessType,
  type PosUserRole,
} from '../lib/posAuth'
import { loadPosStaffDirectory } from '../lib/posStaffDirectory'

function isInternalPosSession(session: { username: string; workspaceSlug: string }) {
  const username = session.username.trim().toLowerCase()
  const workspaceSlug = session.workspaceSlug.trim().toLowerCase()
  return username === 'demo' || username.endsWith('@supermega.dev') || workspaceSlug === 'supermega-demo-group'
}

function getRoleLandingPath(role: PosUserRole, businessType: PosBusinessType, _isInternalOperator: boolean) {
  if (role === 'owner') {
    return '/pos/workspace?surface=workspace&view=overview'
  }
  if (role === 'manager') {
    return '/pos/workspace?surface=control&control=deployment'
  }
  if (role === 'auditor') {
    return '/pos/workspace?surface=control&control=readiness'
  }
  if (role === 'front-desk' || role === 'service-provider') {
    return '/pos/workspace?surface=workspace&view=overview'
  }
  if (role === 'inventory-clerk' && businessType === 'retail') {
    return '/pos/workspace?surface=workspace&view=overview'
  }
  return '/pos/workspace?surface=workspace&view=overview'
}

export function PosRoleSelectionPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [session, setSession] = useState(() => loadPosSession())
  const isInternalOperator = useMemo(() => (session ? isInternalPosSession(session) : false), [session])
  const activeRoleProfile = useMemo(
    () => getPosRoleProfile(session?.activeRole, session?.activeBusinessType),
    [session?.activeRole, session?.activeBusinessType],
  )
  const activeBusinessProfile = useMemo(
    () => getPosBusinessProfile(session?.activeBusinessType),
    [session?.activeBusinessType],
  )
  const activeLocation = useMemo(() => getPosActiveLocation(session), [session])
  const locationOptions = useMemo(() => getPosLocationCatalog(session), [session])
  const roleOptions = useMemo(() => {
    if (!session) {
      return []
    }
    const businessRoles = getPosRoleCatalogForBusiness(session.activeBusinessType)
    return businessRoles.filter((item) => session.roles.includes(item.id))
  }, [session])
  const [selectedRole, setSelectedRole] = useState<string>('')
  const [roleGateMessage, setRoleGateMessage] = useState('')
  const selectedRoleProfile = useMemo(
    () => roleOptions.find((roleOption) => roleOption.id === selectedRole) || null,
    [roleOptions, selectedRole],
  )
  const requiresStaffAssignment = useMemo(
    () => selectedRole !== 'owner' && selectedRole !== 'manager',
    [selectedRole],
  )
  const activeRoleAssignments = useMemo(() => {
    if (!session) {
      return 0
    }
    const scopeKey = getPosWorkspaceScopeKey(session)
    const staff = loadPosStaffDirectory(scopeKey, session)
    return staff.filter((member) =>
      member.status === 'active'
      && member.locationId === session.activeLocationId
      && member.role === (selectedRole as PosUserRole),
    ).length
  }, [selectedRole, session])
  const locked = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('locked') === '1'
  }, [location.search])

  useEffect(() => {
    if (!roleOptions.length) {
      setSelectedRole('')
      setRoleGateMessage('')
      return
    }
    setSelectedRole((current) => (roleOptions.some((role) => role.id === current) ? current : roleOptions[0].id))
  }, [roleOptions])

  useEffect(() => {
    if (!selectedRole) {
      setRoleGateMessage('')
      return
    }
    if (!requiresStaffAssignment) {
      setRoleGateMessage('Owner and manager roles can open directly. Add staff assignments later from POS Control > Staff.')
      return
    }
    if (activeRoleAssignments > 0) {
      setRoleGateMessage(`${activeRoleAssignments} active staff assignment(s) available for this role and location.`)
      return
    }
    setRoleGateMessage(
      'No active staff assignment for this role at the selected location. Add staff in POS Control > Staff before opening this lane.',
    )
  }, [activeRoleAssignments, requiresStaffAssignment, selectedRole])

  if (!session) {
    return <Navigate replace to="/pos/login" />
  }

  function handleSelect(roleId: (typeof roleOptions)[number]['id']) {
    const nextSession = setPosActiveRole(roleId)
    if (!nextSession) {
      return
    }
    setSession(nextSession)
    navigate(getRoleLandingPath(roleId, nextSession.activeBusinessType, isInternalPosSession(nextSession)), { replace: true })
  }

  function handleContinue() {
    const nextRole = selectedRole || roleOptions[0]?.id
    if (!nextRole) {
      return
    }
    if (requiresStaffAssignment && activeRoleAssignments <= 0) {
      setRoleGateMessage(
        'Role open is blocked. Assign at least one active staff profile to this role and location first.',
      )
      return
    }
    handleSelect(nextRole as (typeof roleOptions)[number]['id'])
  }

  function handleLocationSelect(locationId: string) {
    const nextSession = setPosActiveLocation(locationId)
    if (!nextSession) {
      return
    }
    setSession(nextSession)
  }

  return (
    <div className="sm-clean-login sm-pos-auth-screen sm-pos-role-screen">
      <section className="sm-clean-login-card sm-pos-auth-card sm-pos-role-card">
        <div className="sm-clean-login-copy">
          <p className="sm-kicker text-[var(--sm-accent)]">Open the right lane</p>
          <h1>Select workspace pack and role.</h1>
          <p>
            Account: <strong>{session.displayName}</strong> / {session.companyName}
          </p>
          <p className="sm-clean-login-gate">
            Pick the assigned location and role. SuperMega applies the correct POS modules automatically.
          </p>
          <div className="sm-pos-launch-boundary" aria-label="POS launch mode">
            <span>{isInternalOperator ? 'Internal operator' : 'Pilot mode'}</span>
            <strong>Manual/external payment proof, normal browser print or PDF, and human approval stay active until production DB strict gate passes.</strong>
          </div>
          {locationOptions.length ? (
            <div className="sm-pos-role-grid" aria-label="POS location options">
              <label className="sm-pos-role-field grid gap-2 text-sm text-[var(--sm-muted)]">
                Workspace pack
                <select
                  className="sm-input"
                  onChange={(event) => handleLocationSelect(event.target.value)}
                  value={session.activeLocationId}
                >
                  {locationOptions.map((locationOption) => (
                    <option key={locationOption.id} value={locationOption.id}>
                      {locationOption.label}
                    </option>
                  ))}
                </select>
              </label>
              {activeLocation ? (
                <article className="sm-pos-role-option is-active">
                  <span>{activeLocation.label}</span>
                  <strong>
                    {getPosBusinessProfile(activeLocation.businessType).label} / {activeLocation.currency} / {activeLocation.timezone}
                  </strong>
                  <small>Status: {activeLocation.status}</small>
                </article>
              ) : null}
              <p className="sm-pos-role-capability">
                {locationOptions.length} pack{locationOptions.length === 1 ? '' : 's'} available in this account.
              </p>
            </div>
          ) : null}
          {locked ? <p className="sm-clean-login-gate">Session locked due to inactivity. Select role to continue.</p> : null}
          {activeRoleProfile ? (
            <div className="sm-pos-role-active">
              <span>Current selection</span>
              <strong>{activeLocation?.label || 'Main location'} / {activeBusinessProfile.label} / {activeRoleProfile.label}</strong>
              <small>{activeRoleProfile.summary}</small>
            </div>
          ) : null}
        </div>

        <div className="sm-pos-role-grid" role="list" aria-label="POS role options">
          <label className="sm-pos-role-field grid gap-2 text-sm text-[var(--sm-muted)]">
            Role
            <select className="sm-input" onChange={(event) => setSelectedRole(event.target.value)} value={selectedRole}>
              {roleOptions.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
          {selectedRoleProfile ? (
            <article className="sm-pos-role-option is-active">
              <span>{selectedRoleProfile.label}</span>
              <strong>{selectedRoleProfile.summary}</strong>
              <small>{selectedRoleProfile.focus}</small>
            </article>
          ) : null}
          {roleGateMessage ? <p className="sm-pos-role-capability">{roleGateMessage}</p> : null}
          <div className="sm-pos-role-actions">
            <button className="sm-button-primary" onClick={handleContinue} type="button">
              Open workspace
            </button>
            <button className="sm-button-secondary sm-pos-role-back" onClick={() => navigate('/pos/login')} type="button">
              Back to login
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
