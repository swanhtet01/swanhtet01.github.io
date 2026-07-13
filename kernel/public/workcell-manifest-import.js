(function attachWorkcellManifestImport(root) {
  'use strict'

  const ALLOWED_KEYS = new Set([
    'version',
    'clientSlug',
    'clientName',
    'clientId',
    'projectName',
    'workcells',
    'timeZone',
    'currency',
    'lookbackHours',
    'clickupListId',
    'deliveryUtc',
    'tokenCap',
  ])
  const WORKCELLS = new Set(['cash-close', 'pipeline-control', 'owner-command'])
  const CLIENT_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/
  const CLICKUP_LIST_RE = /^\d{1,32}$/
  const DELIVERY_UTC_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/
  const CONTROL_CHARACTER_RE = /[\u0000-\u001f\u007f]/

  function fail(reason) {
    const error = new Error(reason)
    error.code = reason
    throw error
  }

  function boundedText(value, max, reason) {
    const candidate = String(value == null ? '' : value).trim()
    if (!candidate || candidate.length > max || CONTROL_CHARACTER_RE.test(candidate)) fail(reason)
    return candidate
  }

  function boundedInteger(value, min, max, reason) {
    const candidate = Number(value)
    if (!Number.isInteger(candidate) || candidate < min || candidate > max) fail(reason)
    return candidate
  }

  function parseActivationManifest(input) {
    let parsed = input
    if (typeof input === 'string') {
      if (!input.trim() || input.length > 65_536) fail('manifest_file_invalid_size')
      try { parsed = JSON.parse(input) } catch { fail('manifest_json_invalid') }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('manifest_object_required')

    for (const key of Object.keys(parsed)) {
      if (!ALLOWED_KEYS.has(key)) fail(`manifest_unexpected_field:${key}`)
    }
    if (Number(parsed.version) !== 1) fail('manifest_version_must_be_1')

    const clientSlug = boundedText(parsed.clientSlug, 40, 'manifest_invalid_client_slug').toLowerCase()
    if (!CLIENT_SLUG_RE.test(clientSlug)) fail('manifest_invalid_client_slug')
    const clientName = boundedText(parsed.clientName, 120, 'manifest_client_name_required')
    const expectedClientId = `workcell-${clientSlug}`
    const clientId = parsed.clientId == null || parsed.clientId === ''
      ? expectedClientId
      : boundedText(parsed.clientId, 80, 'manifest_invalid_client_id')
    if (clientId !== expectedClientId) fail('manifest_client_id_mismatch')
    const expectedProjectName = `supermega-wc-${clientSlug}`
    const projectName = parsed.projectName == null || parsed.projectName === ''
      ? expectedProjectName
      : boundedText(parsed.projectName, 100, 'manifest_invalid_project_name')
    if (projectName !== expectedProjectName) fail('manifest_project_name_mismatch')

    if (!Array.isArray(parsed.workcells) || parsed.workcells.length !== 1) fail('manifest_one_workcell_required')
    const workcell = boundedText(parsed.workcells[0], 60, 'manifest_unknown_workcell').toLowerCase()
    if (!WORKCELLS.has(workcell)) fail(`manifest_unknown_workcell:${workcell}`)

    const timeZone = boundedText(parsed.timeZone || 'Asia/Yangon', 80, 'manifest_invalid_time_zone')
    try { new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0)) } catch { fail('manifest_invalid_time_zone') }
    const currency = boundedText(parsed.currency || 'MMK', 8, 'manifest_invalid_currency').toUpperCase()
    if (!/^[A-Z]{3,8}$/.test(currency)) fail('manifest_invalid_currency')
    const lookbackHours = boundedInteger(parsed.lookbackHours == null ? 24 : parsed.lookbackHours, 1, 168, 'manifest_invalid_lookback_hours')
    const clickupListId = String(parsed.clickupListId == null ? '' : parsed.clickupListId).trim()
    if (clickupListId && !CLICKUP_LIST_RE.test(clickupListId)) fail('manifest_invalid_clickup_list_id')
    const deliveryUtc = String(parsed.deliveryUtc || '01:30').trim()
    if (!DELIVERY_UTC_RE.test(deliveryUtc)) fail('manifest_invalid_delivery_utc')
    const tokenCap = boundedInteger(parsed.tokenCap == null ? 150_000 : parsed.tokenCap, 10_000, 5_000_000, 'manifest_invalid_token_cap')

    return {
      version: 1,
      clientSlug,
      clientName,
      clientId,
      projectName,
      workcells: [workcell],
      timeZone,
      currency,
      lookbackHours,
      clickupListId,
      deliveryUtc,
      tokenCap,
    }
  }

  root.SuperMegaManifestImport = Object.freeze({ parseActivationManifest })
})(globalThis)
