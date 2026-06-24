const PERSON_OWNER_TO_TEAM: Record<string, string> = {
  aungkoothant: 'Maintenance team',
  aungnaing: 'Maintenance team',
  aungthu: 'Sales / inventory team',
  hlainghlaingaye: 'Curing team',
  htetkhaunghtut: 'Operations / admin team',
  kyawlwinoo: 'Utility team',
  kyawsoewin1qc: 'QC team',
  minlwin: 'Admin / planning team',
  swelatt: 'Mixing team',
  umyolintun: 'Maintenance team',
  yelintun: 'Tyre building team',
  zawminoo2: 'Tyre building team',
}

const TEAM_WORDS = [
  'admin',
  'assign',
  'commercial',
  'desk',
  'finance',
  'hr',
  'maintenance',
  'management',
  'operations',
  'planning',
  'procurement',
  'qc',
  'quality',
  'sales',
  'stores',
  'team',
  'utility',
  'ytf',
]

export const YTF_PLANT_SCOPE_OPTIONS = [
  {
    value: 'plant_a',
    label: 'Factory Floor',
    detail: 'Yangon / Shwe Pyi Thar. Bias, nylon, agricultural tyres.',
  },
  {
    value: 'plant_b',
    label: 'Plant B',
    detail: 'Bilin / Mon State. Radial and motorcycle tyres at govt No.2 Large Machinery Factory.',
  },
  {
    value: 'shared',
    label: 'Shared / head office',
    detail: 'Finance, sales, supplier, CEO, or mixed-company source.',
  },
]

function ownerKey(value?: string | null) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

export function ytfOwnerLabel(value?: string | null, fallback = 'Factory team') {
  const raw = String(value || '').trim()
  if (!raw) return fallback

  const mapped = PERSON_OWNER_TO_TEAM[ownerKey(raw)]
  if (mapped) return mapped

  const lower = raw.toLowerCase()
  if (lower.includes('plant manager')) return fallback
  if (TEAM_WORDS.some((word) => lower.includes(word))) return raw

  const wordCount = raw.split(/\s+/).filter(Boolean).length
  return wordCount >= 2 ? fallback : raw
}

export function ytfStorageOwner(value?: string | null) {
  return ytfOwnerLabel(value)
}

export function inferYtfPlantScope(...values: Array<string | null | undefined>) {
  const haystack = values
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (
    /\bplant\s*b\b/.test(haystack) ||
    haystack.includes('bilin') ||
    haystack.includes('mon state') ||
    haystack.includes('radial') ||
    haystack.includes('motorcycle') ||
    haystack.includes('govt no.2') ||
    haystack.includes('large machinery')
  ) {
    return YTF_PLANT_SCOPE_OPTIONS[1]
  }

  if (
    /\bplant\s*a\b/.test(haystack) ||
    /\byangon\s+(plant|factory|site)\b/.test(haystack) ||
    haystack.includes('shwe pyi thar') ||
    haystack.includes('bias') ||
    haystack.includes('nylon') ||
    haystack.includes('agricultural') ||
    haystack.includes('mixing') ||
    haystack.includes('curing') ||
    haystack.includes('tyre building')
  ) {
    return YTF_PLANT_SCOPE_OPTIONS[0]
  }

  return YTF_PLANT_SCOPE_OPTIONS[2]
}

export function formatYtfDateTime(value?: string | null) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function compact(value?: string | null, max = 120) {
  const trimmed = String(value || '').replace(/\s+/g, ' ').trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 3).trim()}...` : trimmed
}

function tryParseObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function tryParseEmbeddedObject(value: string): Record<string, unknown> | null {
  const start = value.indexOf('{')
  const end = value.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  return tryParseObject(value.slice(start, end + 1))
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

export function summarizeYtfTaskNotes(notes?: string | null, title?: string | null) {
  const raw = String(notes || '').trim()
  const fallbackTitle = compact(title || 'Check factory record', 88)

  if (!raw) {
    return {
      summary: 'No readable note yet. Open the item and add one fact plus one evidence note.',
      source: 'Source: workspace task',
      plant: inferYtfPlantScope(title).label,
    }
  }

  const parsed = raw.startsWith('{') ? tryParseObject(raw) : tryParseEmbeddedObject(raw)
  if (parsed) {
    const nestedClassification =
      parsed.classification && typeof parsed.classification === 'object' && !Array.isArray(parsed.classification)
        ? (parsed.classification as Record<string, unknown>)
        : {}
    const domain = stringField(parsed, 'domain') || stringField(nestedClassification, 'domain') || 'record'
    const source =
      stringField(parsed, 'source') ||
      stringField(parsed, 'source_system') ||
      stringField(parsed, 'source_root_title') ||
      stringField(parsed, 'sender') ||
      'structured source'
    const subject = stringField(parsed, 'subject') || stringField(parsed, 'title') || fallbackTitle
    const summary =
      stringField(parsed, 'summary') ||
      stringField(parsed, 'next_action') ||
      stringField(nestedClassification, 'summary') ||
      subject
    const plant = inferYtfPlantScope(
      stringField(parsed, 'plant'),
      stringField(parsed, 'source_root_title'),
      stringField(parsed, 'path'),
      subject,
      domain,
    )

    return {
      summary: compact(summary, 118),
      source: `Source: ${compact(source, 52)} / ${domain}`,
      plant: `${plant.label}: ${plant.detail}`,
    }
  }

  const parts = raw
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
  const keyMap = new Map<string, string>()
  for (const part of parts) {
    const [key, ...rest] = part.split(':')
    if (rest.length) keyMap.set(key.trim().toLowerCase(), rest.join(':').trim())
  }

  if (keyMap.size) {
    const domain = keyMap.get('domain') || 'source'
    const plantValue = keyMap.get('plant') || ''
    const changed = keyMap.get('source change') || keyMap.get('change') || 'changed'
    const source = keyMap.get('source') || domain
    const file = keyMap.get('file') || fallbackTitle
    const detected = formatYtfDateTime(keyMap.get('detected') || '')
    const plant = inferYtfPlantScope(plantValue, domain, title, source, file)
    return {
      summary: compact(`${file}. ${changed} ${domain} record. Route only if it affects today.`, 118),
      source: `Source: ${compact(source, 48)}${detected ? ` / detected ${detected}` : ''}`,
      plant: `${plant.label}: ${plant.detail}`,
    }
  }

  return {
    summary: compact(raw.replace(/[{}[\]"]/g, ' '), 118),
    source: 'Source: workspace note',
    plant: inferYtfPlantScope(raw, title).label,
  }
}

export function ytfSourceLine(input: {
  sourceRootTitle?: string | null
  sourceMode?: string | null
  sourceSystem?: string | null
  domain?: string | null
  plant?: string | null
  modifiedTime?: string | null
  title?: string | null
}) {
  const plant = inferYtfPlantScope(input.plant, input.sourceRootTitle, input.title, input.domain)
  const source = compact(input.sourceRootTitle || input.sourceSystem || input.sourceMode || input.domain || 'YTF source', 54)
  const modified = formatYtfDateTime(input.modifiedTime)
  return `${source} / ${plant.label}${modified ? ` / updated ${modified}` : ''}`
}

type YtfTaskLike = {
  title?: string | null
  template?: string | null
  notes?: string | null
  owner?: string | null
}

const YTF_INTERNAL_OR_BUILD_TASK_PATTERN =
  /qa smoke|ytf-smoke|test record|restaurant|founder|module pack|module proof|adaptive module|saas|supermega|product line|release gate|portfolio|client walkthrough|first-client|walkthrough|prototype|market wedge|go-to-market|r&d|research|platform build|product ops|portal factory|extract kpi|kpi candidate|ranked for .*extraction|changed source|changed data|source record|source update|drive change|google_drive|detected|review this record|review structured source|structured source record|needs review|source-backed review|source ref|source_ref|shortcut evidence|shortcut-style|shortcut backed|target files|promote stable|promote .*structured|promote .*record|structured erp|showroom pc|file update|file check|file agent|service account|data manager|connector|pipeline|sync|refresh|governance update|open director|open plant|convert the signal|owner and admin|admin data steward|agent runtime|agent routing|ai-handled|database|postgres|cron|gmail oauth|google analytics|facebook|admin setup|setup gap|cloud job|workbook|reader contract|coverage|source behavior|background status|selected books|key holds|file rows|profiled/i

const YTF_FACTORY_WORK_TASK_PATTERN =
  /production|mixing|curing|building|qc|quality|claim|defect|reject|hold|capa|inspection|maintenance|machine|downtime|repair|utility|spare|receiving|stores|grn|raw|stock|inventory|sales|showroom|dealer|dispatch|supplier|po\b|daily close|board photo|whiteboard|5w1h|5s|abnormal|normal|wip|output|shift|tyre|work order/i

export function isYtfInternalOrBuildTask(task: YtfTaskLike) {
  const haystack = `${task.title ?? ''} ${task.template ?? ''} ${task.notes ?? ''} ${task.owner ?? ''}`.toLowerCase()
  return YTF_INTERNAL_OR_BUILD_TASK_PATTERN.test(haystack)
}

export function isYtfFactoryFacingTask(task: YtfTaskLike) {
  const haystack = `${task.title ?? ''} ${task.template ?? ''} ${task.notes ?? ''} ${task.owner ?? ''}`.toLowerCase()
  return !isYtfInternalOrBuildTask(task) && YTF_FACTORY_WORK_TASK_PATTERN.test(haystack)
}
