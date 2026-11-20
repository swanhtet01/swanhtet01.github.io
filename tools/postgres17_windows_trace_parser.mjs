import { lstat, open, readFile } from 'node:fs/promises'
import { resolve, win32 } from 'node:path'
import { pathToFileURL } from 'node:url'

const MAX_XML_BYTES = 64 * 1024 * 1024
const MAX_XML_PREFIX_BYTES = 256 * 1024
const MAX_SUMMARY_BYTES = 64 * 1024
const HEADER_GUID = '68fdd900-4a3e-11d1-84f4-0000f80464e3'
const localName = (name) => name.split(':').at(-1)
const boundedCount = (count) => count >= 9 ? '9plus' : String(count)
const headerCount = (count) => count >= 2 ? '2plus' : String(count)
const UNBOUND_HEADER_SHAPE = 'headerTyped=invalid;typeSite=unbound;headerGuid=invalid;headerJoint=invalid;provider=unbound;end=unbound;fields=unbound'
const UNBOUND_PREFIX_SHAPE = 'prefixTyped=invalid;prefixTypeSite=unbound;prefixGuid=invalid;prefixJoint=invalid;prefixProvider=unbound;prefixEnd=unbound;prefixFields=unbound'

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

// Diagnostic input status is deliberately independent of the proof parser.
// It emits only a fixed enum; neither bytes, paths, nor exception text leave.
async function readDiagnosticInput(path, maximum) {
  const resolved = resolve(path)
  let item
  try { item = await lstat(resolved) }
  catch (error) {
    return { status: error?.code === 'ENOENT' ? 'missing' : 'unreadable' }
  }
  if (!item.isFile() || item.isSymbolicLink()) return { status: 'nonregular' }
  if (item.size < 1) return { status: 'empty' }
  if (item.size > maximum) return { status: 'oversize' }
  let bytes
  try { bytes = await readFile(resolved) }
  catch { return { status: 'unreadable' } }
  if (bytes.length < 1) return { status: 'empty' }
  if (bytes.length > maximum) return { status: 'oversize' }
  return { status: 'bounded', bytes }
}

const xmlSizeBand = (size) => size <= MAX_XML_BYTES ? 'within64'
  : size <= 128 * 1024 * 1024 ? 'over64to128'
    : size <= 256 * 1024 * 1024 ? 'over128to256'
      : size <= 512 * 1024 * 1024 ? 'over256to512' : 'over512'

// Oversized tracerpt XML is never admitted as proof. Read only a fixed prefix
// to learn whether the documented first header is even rendered by this image.
async function readXmlDiagnosticInput(path) {
  const resolved = resolve(path)
  let item
  try { item = await lstat(resolved) }
  catch (error) {
    return { status: error?.code === 'ENOENT' ? 'missing' : 'unreadable', band: 'unbound' }
  }
  if (!item.isFile() || item.isSymbolicLink()) return { status: 'nonregular', band: 'unbound' }
  if (item.size < 1) return { status: 'empty', band: 'unbound' }
  if (item.size <= MAX_XML_BYTES) {
    const input = await readDiagnosticInput(resolved, MAX_XML_BYTES)
    return { ...input, band: input.status === 'bounded' ? 'within64' : 'unbound' }
  }
  let file
  try {
    file = await open(resolved, 'r')
    const opened = await file.stat()
    if (!opened.isFile() || opened.size !== item.size) {
      return { status: 'unreadable', band: 'unbound' }
    }
    const prefix = Buffer.alloc(MAX_XML_PREFIX_BYTES)
    const { bytesRead } = await file.read(prefix, 0, prefix.length, 0)
    if (bytesRead !== prefix.length) return { status: 'unreadable', band: 'unbound' }
    return { status: 'oversize', band: xmlSizeBand(opened.size), prefix: prefix.toString('utf8') }
  } catch {
    return { status: 'unreadable', band: 'unbound' }
  } finally {
    if (file) await file.close()
  }
}

// This is a diagnostic code, not a loss-counter parser. It never includes
// summary text or the value of a counter, and cannot authorize probe evidence.
export function lossCounterLineShapes(summary) {
  if (typeof summary !== 'string' || !summary
    || Buffer.byteLength(summary) > MAX_SUMMARY_BYTES || summary.includes('\0')) {
    fail('observer_probe_loss_summary_unsafe')
  }
  const shapes = new Map()
  let candidateLines = 0
  for (const line of summary.split(/\r?\n/)) {
    const event = /events?/i.exec(line)
    const buffer = /buffers?/i.exec(line)
    const lost = /lost/i.exec(line)
    const loss = /loss/i.exec(line)
    const dropped = /dropp?ed/i.exec(line)
    if (!event && !buffer && !lost && !loss && !dropped) continue
    candidateLines += 1
    let shape
    if (line.length > 512) {
      shape = 'UUUUN'
    } else {
      const role = event && buffer ? 'X' : event ? 'E' : buffer ? 'B' : 'U'
      const term = lost ? 'L' : loss ? 'O' : dropped ? 'D' : 'U'
      const roleMatch = event && buffer ? (event.index < buffer.index ? event : buffer)
        : event ?? buffer
      const termMatch = lost ?? loss ?? dropped
      const order = !roleMatch || !termMatch ? 'U'
        : roleMatch.index < termMatch.index ? 'F' : 'R'
      const tailStart = Math.max(roleMatch ? roleMatch.index + roleMatch[0].length : 0,
        termMatch ? termMatch.index + termMatch[0].length : 0)
      const tail = line.slice(tailStart)
      const separator = /^\s*:/.test(tail) ? 'C' : /^\s*=/.test(tail) ? 'Q'
        : /^[^<]{0,32}[<>]/.test(tail) ? 'X' : /^\s+/.test(tail) ? 'S' : 'U'
      shape = `${role}${term}${order}${separator}${/\d/.test(tail) ? 'D' : 'N'}`
    }
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1)
  }
  const histogram = [...shapes].sort(([left], [right]) => left.localeCompare(right))
    .map(([shape, count]) => `${shape}:${boundedCount(count)}`)
  return `v2;candidateLines=${boundedCount(candidateLines)};patterns=${histogram.join(',') || 'none'}`
}

// The summary proof accepts only the two already-supported label forms. A
// second exact counter or a differently shaped loss label makes the summary
// ambiguous, even if one supported counter says zero. Only fixed statuses
// leave this function; counter values and summary text never do.
export function lossSummaryStatus(summary) {
  if (typeof summary !== 'string' || !summary
    || Buffer.byteLength(summary) > MAX_SUMMARY_BYTES || summary.includes('\0')) {
    fail('observer_probe_loss_summary_unsafe')
  }
  const accepted = []
  const values = []
  for (const role of ['Events', 'Buffers']) {
    const line = new RegExp(`^[ \\t]*${role}(?:Lost| Lost)[ \\t]*[:=][ \\t]*(\\d+)[ \\t]*$`, 'gim')
    const tag = new RegExp(`<${role}Lost>[ \\t]*(\\d+)[ \\t]*</${role}Lost>`, 'gis')
    const matches = [...summary.matchAll(line), ...summary.matchAll(tag)]
    if (matches.length !== 1) return 'unavailable'
    accepted.push({ index: matches[0].index, length: matches[0][0].length })
    values.push(matches[0][1])
  }
  let remaining = summary
  for (const { index, length } of accepted.sort((a, b) => b.index - a.index)) {
    remaining = remaining.slice(0, index) + remaining.slice(index + length)
  }
  // Do not guess which of the many unrecognized word orders is authoritative.
  // Even a split-line loss label or prose about loss is competing evidence
  // unless it was one of the two exact counters removed above.
  if (/lost|loss|dropp?ed/i.test(remaining)) return 'unavailable'
  return values.every((value) => /^0+$/.test(value)) ? 'zero' : 'nonzero'
}

function parseAttributes(source) {
  const attributes = Object.create(null)
  let rest = source.trim()
  while (rest) {
    const match = /^([^\s=/>]+)\s*=\s*(["'])([^&<>]*?)\2\s*/.exec(rest)
    if (!match) fail('observer_probe_trace_xml_invalid')
    const name = localName(match[1])
    if (Object.hasOwn(attributes, name)) fail('observer_probe_trace_field_ambiguous')
    attributes[name] = match[3]
    rest = rest.slice(match[0].length)
  }
  return attributes
}

function parseXml(xml) {
  if (typeof xml !== 'string' || !xml || Buffer.byteLength(xml) > MAX_XML_BYTES
    || /<!DOCTYPE|<!ENTITY|<!\[CDATA\[|&/i.test(xml)) {
    fail('observer_probe_trace_xml_unsafe')
  }
  const root = { name: '#document', attributes: {}, children: [], text: '' }
  const stack = [root]
  const token = /<\?xml\s+[^?]*\?>|<\/[^>]+>|<[^>]+>|[^<]+/gy
  let offset = 0
  for (let match; (match = token.exec(xml));) {
    if (match.index !== offset) fail('observer_probe_trace_xml_invalid')
    offset = token.lastIndex
    const value = match[0]
    if (value.startsWith('<?xml')) continue
    if (value.startsWith('</')) {
      const closing = localName(value.slice(2, -1).trim())
      if (stack.length === 1 || stack.at(-1).name !== closing) {
        fail('observer_probe_trace_xml_invalid')
      }
      stack.pop()
      continue
    }
    if (value.startsWith('<')) {
      const selfClosing = value.endsWith('/>')
      const body = value.slice(1, selfClosing ? -2 : -1).trim()
      const nameMatch = /^([^\s/>]+)([\s\S]*)$/.exec(body)
      if (!nameMatch || nameMatch[1].startsWith('!')) fail('observer_probe_trace_xml_invalid')
      const node = {
        name: localName(nameMatch[1]),
        attributes: parseAttributes(nameMatch[2]),
        children: [],
        text: '',
      }
      stack.at(-1).children.push(node)
      if (!selfClosing) stack.push(node)
      continue
    }
    if (value.includes('>')) fail('observer_probe_trace_xml_invalid')
    stack.at(-1).text += value
  }
  if (offset !== xml.length || stack.length !== 1) fail('observer_probe_trace_xml_invalid')
  if (root.children.length !== 1 || root.text.trim()) fail('observer_probe_trace_xml_invalid')
  return root
}

const children = (node, name) => node.children.filter((child) => child.name === name)
function one(node, name, required = true) {
  const found = children(node, name)
  if (found.length > 1 || (required && found.length !== 1)) {
    fail('observer_probe_trace_field_ambiguous')
  }
  return found[0] ?? null
}

function attributeOrText(node) {
  if (!node) return null
  const values = [node.attributes.Name, node.attributes.Value, node.text.trim()]
    .filter((value) => typeof value === 'string' && value.length > 0)
  const unique = [...new Set(values)]
  if (unique.length > 1) fail('observer_probe_trace_field_ambiguous')
  return unique[0] ?? null
}

function dataFields(event) {
  const eventData = one(event, 'EventData', false)
  const fields = Object.create(null)
  if (!eventData) return fields
  for (const data of children(eventData, 'Data')) {
    const name = data.attributes.Name
    if (!name || Object.hasOwn(fields, name)) fail('observer_probe_trace_field_ambiguous')
    fields[name] = data.text.trim()
  }
  return fields
}

function exactlyOneField(fields, names) {
  const values = names.filter((name) => fields[name]).map((name) => fields[name])
  const unique = [...new Set(values)]
  if (unique.length > 1) fail('observer_probe_trace_field_ambiguous')
  return unique[0] ?? null
}

function allDescendants(node, name, result = []) {
  for (const child of node.children) {
    if (child.name === name) result.push(child)
    allDescendants(child, name, result)
  }
  return result
}

function eventDescendants(event, name, result = []) {
  for (const child of event.children) {
    if (child.name === 'Event') continue
    if (child.name === name) result.push(child)
    eventDescendants(child, name, result)
  }
  return result
}

function headerTypeMarkers(event) {
  let count = 0
  let site = 'unbound'
  const visit = (node) => {
    if (node !== event && node.name === 'Event') return
    const markerCount = Number(node.name === 'EventTrace_Header')
      + Object.values(node.attributes).filter((value) => value === 'EventTrace_Header').length
      + Number(node.text.trim() === 'EventTrace_Header')
    if (markerCount) {
      const location = node.name === 'Task' ? 'task'
        : ['Event', 'Type', 'EventType'].includes(node.name) ? 'type' : 'other'
      site = site === 'unbound' ? location : site === location ? site : 'ambiguous'
      count += markerCount
      // Conflicting Task representations are not a unique type marker.
      if (node.name === 'Task' && [node.attributes.Name, node.attributes.Value, node.text.trim()]
        .filter((value) => typeof value === 'string' && value.length > 0).length > 1) {
        count += 1
      }
    }
    for (const child of node.children) visit(child)
  }
  visit(event)
  return { count, site: count === 1 ? site : count === 0 ? 'unbound' : 'ambiguous' }
}

// This only describes shapes seen in tracerpt XML. The actual EventTrace_Header
// encoding is not yet known. "typed" counts exact literal markers anywhere in
// an Event; the bounded site reports where one was found. Even a synthetic
// "match" cannot prove drain or authorize a loss counter. No values or XML leave.
export function eventTraceHeaderShape(xml) {
  if (typeof xml !== 'string' || xml.includes('\0')) fail('observer_probe_trace_xml_unsafe')
  const document = parseXml(xml)
  const events = allDescendants(document, 'Event')
  let typed = 0
  let guid = 0
  let joint = 0
  let uniqueTypedEvent = null
  let uniqueTypeSite = 'unbound'
  let uniqueGuidEvent = null
  for (const event of events) {
    const systems = children(event, 'System')
    const markers = headerTypeMarkers(event)
    const typeMarkers = markers.count
    const providers = systems.flatMap((system) => children(system, 'Provider'))
    const matchingProviders = providers.filter((provider) =>
      typeof provider.attributes.Guid === 'string'
      && provider.attributes.Guid.replace(/^\{(.*)\}$/, '$1').toLowerCase() === HEADER_GUID)
    typed += typeMarkers
    guid += matchingProviders.length
    if (typeMarkers === 1) {
      uniqueTypedEvent = event
      uniqueTypeSite = markers.site
    }
    if (matchingProviders.length === 1 && systems.length === 1 && providers.length === 1) {
      uniqueGuidEvent = event
    }
    if (typeMarkers === 1 && matchingProviders.length === 1 && systems.length === 1
      && providers.length === 1) {
      joint += 1
    }
  }

  let provider = 'unbound'
  if (typed === 1 && uniqueTypedEvent) {
    const systems = children(uniqueTypedEvent, 'System')
    const providers = systems.flatMap((system) => children(system, 'Provider'))
    provider = systems.length !== 1 || providers.length > 1 ? 'ambiguous'
      : providers.length === 0 || !providers[0].attributes.Guid ? 'missing'
        : providers[0].attributes.Guid.replace(/^\{(.*)\}$/, '$1').toLowerCase()
          === HEADER_GUID ? 'match' : 'other'
  }

  let end = 'unbound'
  let fields = 'unbound'
  // A unique provider-GUID event can describe field presence even when tracerpt
  // represents the documented type in an unknown way. It remains diagnostic.
  if (guid === 1 && uniqueGuidEvent) {
    const named = (name) => [
      ...eventDescendants(uniqueGuidEvent, 'Data').filter((node) => node.attributes.Name === name),
      ...eventDescendants(uniqueGuidEvent, name),
    ]
    const eventLoss = named('EventsLost')
    const bufferLoss = named('BuffersLost')
    fields = eventLoss.length > 1 || bufferLoss.length > 1 ? 'ambiguous'
      : eventLoss.length && bufferLoss.length ? 'both'
        : eventLoss.length ? 'events' : bufferLoss.length ? 'buffers' : 'none'
    const endNodes = named('EndTime')
    if (endNodes.length === 0) end = 'missing'
    else if (endNodes.length > 1) end = 'ambiguous'
    else {
      const values = [endNodes[0].attributes.Value, endNodes[0].text.trim()]
        .filter((value) => typeof value === 'string' && value.length > 0)
      if (values.length > 1) end = 'ambiguous'
      else if (values.length === 0) end = 'other'
      else if (/^(?:0+|0x0+)$/i.test(values[0])) end = 'zero'
      else if (/^[1-9]\d*$/.test(values[0])) end = 'decimal'
      else if (/^0x[0-9a-f]+$/i.test(values[0])) end = 'hex'
      else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(values[0])
        && Number.isFinite(Date.parse(values[0]))) end = 'iso'
      else end = 'other'
    }
  }
  const typeSite = typed === 1 ? uniqueTypeSite : typed === 0 ? 'unbound' : 'ambiguous'
  return `headerTyped=${headerCount(typed)};typeSite=${typeSite};headerGuid=${headerCount(guid)};headerJoint=${headerCount(joint)}`
    + `;provider=${provider};end=${end};fields=${fields}`
}

// Diagnostic only: a complete first Event inside 256 KiB can reveal tracerpt's
// rendering. This does not validate the rest of the file, loss, or drain.
export function eventTraceHeaderPrefixShape(prefix) {
  if (typeof prefix !== 'string' || !prefix
    || Buffer.byteLength(prefix) > MAX_XML_PREFIX_BYTES) {
    fail('observer_probe_trace_prefix_unsafe')
  }
  const unbound = (status) => `prefixEvent=${status};${UNBOUND_PREFIX_SHAPE}`
  const opener = /<((?:[A-Za-z_][\w.-]*:)?Event)(?=[\s>])/g
  const first = opener.exec(prefix)
  const before = prefix.slice(0, first?.index ?? prefix.length)
  if (/<!|&|\0/.test(before)) return unbound('unsafe')
  if (!first) return unbound('not_in_prefix')
  const openEnd = prefix.indexOf('>', first.index)
  if (openEnd < 0) return unbound('truncated')
  const escapedName = first[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const closing = new RegExp(`</${escapedName}\\s*>`, 'g')
  closing.lastIndex = openEnd + 1
  const last = closing.exec(prefix)
  if (!last) return unbound('truncated')
  opener.lastIndex = openEnd + 1
  if ((opener.exec(prefix)?.index ?? Infinity) < last.index) return unbound('invalid')
  const fragment = prefix.slice(first.index, closing.lastIndex)
  let header
  try { header = eventTraceHeaderShape(`<Events>${fragment}</Events>`) }
  catch { return unbound('invalid') }
  return `prefixEvent=complete;${header.replace('headerTyped=', 'prefixTyped=')
    .replace('typeSite=', 'prefixTypeSite=').replace('headerGuid=', 'prefixGuid=')
    .replace('headerJoint=', 'prefixJoint=').replace('provider=', 'prefixProvider=')
    .replace('end=', 'prefixEnd=').replace('fields=', 'prefixFields=')}`
}

function parseTimestamp(system) {
  const created = one(system, 'TimeCreated')
  const raw = created.attributes.SystemTime
  const value = Date.parse(raw ?? '')
  if (!raw || !Number.isFinite(value)) fail('observer_probe_trace_identity_missing')
  return value
}

function parsePid(fields, system) {
  let raw = exactlyOneField(fields, ['ProcessID', 'ProcessId', 'PID'])
  if (!raw) {
    const execution = one(system, 'Execution', false)
    raw = execution?.attributes.ProcessID ?? null
  }
  if (!raw || !/^[1-9]\d*$/.test(raw)) fail('observer_probe_trace_identity_missing')
  return raw
}

function parseOptionalPid(fields, names) {
  const raw = exactlyOneField(fields, names)
  if (raw === null) return null
  if (!/^[1-9]\d*$/.test(raw)) fail('observer_probe_trace_identity_missing')
  return raw
}

function parseExitStatus(fields) {
  const raw = exactlyOneField(fields, ['ExitStatus', 'ExitCode'])
  if (raw === null) return null
  if (!/^(?:0+|0x0+)$/i.test(raw)) fail('observer_probe_trace_exit_status_nonzero')
  return raw
}

function canonicalWindowsPath(value) {
  if (typeof value !== 'string' || !/^[A-Za-z]:\\[^\0]+$/.test(value)
    || value.includes('/') || value.split('\\').some((part) => part === '..')) {
    return null
  }
  return value.toLowerCase()
}

export function correlateTraceXml(xml, expectedParentPath, expectedChildPath) {
  const expectedParent = canonicalWindowsPath(expectedParentPath)
  const expectedChild = canonicalWindowsPath(expectedChildPath)
  const expectedLeaves = new Set([
    win32.basename(expectedParentPath ?? '').toLowerCase(),
    win32.basename(expectedChildPath ?? '').toLowerCase(),
  ])
  if (!expectedParent || !expectedChild || expectedParent === expectedChild
    || expectedLeaves.size !== 2 || expectedLeaves.has('')
    || expectedLeaves.has('.') || expectedLeaves.has('..')) {
    fail('observer_probe_trace_expected_image_invalid')
  }
  const document = parseXml(xml)
  const records = []
  for (const event of allDescendants(document, 'Event')) {
    const system = one(event, 'System')
    const fields = dataFields(event)
    const imageName = exactlyOneField(fields, ['ImageName', 'ImageFileName', 'FileName'])
    if (!imageName) continue
    const task = attributeOrText(one(system, 'Task'))?.toLowerCase()
    const opcode = attributeOrText(one(system, 'Opcode'))?.toLowerCase()
    let kind
    if (task === 'process' && ['start', 'dcstart'].includes(opcode)) kind = 'start'
    else if (task === 'process' && ['end', 'dcend', 'stop'].includes(opcode)) kind = 'end'
    else if (['image', 'imageload', 'loader'].includes(task)
      && ['load', 'start', 'dcstart'].includes(opcode)) kind = 'image'
    else {
      if (expectedLeaves.has(win32.basename(imageName).toLowerCase())) {
        fail('observer_probe_trace_task_opcode_unknown')
      }
      continue
    }
    const processKey = exactlyOneField(fields, ['ProcessKey', 'UniqueProcessKey'])
    records.push({
      kind,
      pid: parsePid(fields, system),
      processKey,
      timestamp: parseTimestamp(system),
      imagePath: canonicalWindowsPath(imageName),
      parentPid: parseOptionalPid(fields, ['ParentID', 'ParentId', 'ParentProcessID', 'ParentProcessId']),
      parentProcessKey: exactlyOneField(fields, ['ParentProcessKey', 'ParentUniqueProcessKey']),
      exitStatus: kind === 'end' ? parseExitStatus(fields) : null,
    })
  }

  const lifecycle = (expectedPath) => {
    const matching = records.filter(({ imagePath }) => imagePath === expectedPath)
    const starts = matching.filter(({ kind }) => kind === 'start')
    const images = matching.filter(({ kind }) => kind === 'image')
    const ends = matching.filter(({ kind }) => kind === 'end')
    if (starts.length !== 1 || images.length !== 1 || ends.length !== 1) {
      fail('observer_probe_trace_correlation_ambiguous')
    }
    const [start] = starts; const [image] = images; const [end] = ends
    if (!start.processKey || !image.processKey || !end.processKey) {
      fail('observer_probe_trace_process_key_missing')
    }
    if (start.pid !== image.pid || start.pid !== end.pid
      || start.processKey !== image.processKey || start.processKey !== end.processKey
      || image.timestamp < start.timestamp || end.timestamp <= image.timestamp
      || end.exitStatus === null) {
      fail('observer_probe_trace_correlation_mismatch')
    }
    return { start, image, end }
  }

  const parent = lifecycle(expectedParent)
  const child = lifecycle(expectedChild)
  if (child.start.parentPid !== parent.start.pid
    || child.start.parentProcessKey !== parent.start.processKey
    || child.start.timestamp <= parent.start.timestamp
    || child.end.timestamp > parent.end.timestamp
    || child.start.processKey === parent.start.processKey) {
    fail('observer_probe_trace_correlation_mismatch')
  }
  const childLifetimeImages = records.filter(({ kind, pid, imagePath, timestamp }) => kind === 'image'
    && pid === child.start.pid && imagePath !== null && imagePath !== expectedChild
    && timestamp >= child.start.timestamp && timestamp <= child.end.timestamp)
  if (childLifetimeImages.some(({ processKey }) => !processKey)) {
    fail('observer_probe_trace_process_key_missing')
  }
  const childModules = childLifetimeImages.filter(({ processKey }) =>
    processKey === child.start.processKey)
  if (childModules.length < 1) fail('observer_probe_trace_module_event_missing')
  return {
    contract: 'supermega.windows-process-image-correlation.v2',
    processEventObserved: true,
    imageEventObserved: true,
    processEndObserved: true,
    stableProcessKeyObserved: true,
    parentChildCorrelationObserved: true,
    exitStatusObserved: true,
    fullImagePathObserved: true,
    moduleEventObserved: true,
    completeOrderingObserved: true,
  }
}

async function main() {
  if (process.argv[2] === '--loss-summary-proof') {
    if (process.argv.length !== 4) fail('observer_probe_loss_summary_arguments_invalid')
    const bytes = await readFile(resolve(process.argv[3]))
    if (bytes.length < 1 || bytes.length > MAX_SUMMARY_BYTES) {
      fail('observer_probe_loss_summary_unsafe')
    }
    process.stdout.write(`${lossSummaryStatus(bytes.toString('utf8'))}\n`)
    return
  }
  if (process.argv[2] === '--loss-header-shape') {
    if (process.argv.length !== 5) fail('observer_probe_loss_summary_arguments_invalid')
    const summary = await readDiagnosticInput(process.argv[3], MAX_SUMMARY_BYTES)
    const xml = await readXmlDiagnosticInput(process.argv[4])
    let summaryShape = 'candidateLines=unbound;patterns=unbound'
    if (summary.status === 'bounded') {
      try { summaryShape = lossCounterLineShapes(summary.bytes.toString('utf8')).slice(3) }
      catch { summary.status = 'unsafe' }
    }
    let header = UNBOUND_HEADER_SHAPE
    let prefix = `prefixEvent=not_needed;${UNBOUND_PREFIX_SHAPE}`
    if (xml.status === 'bounded') {
      try { header = eventTraceHeaderShape(xml.bytes.toString('utf8')) }
      catch { /* The bounded XML did not have a trustworthy header shape. */ }
    } else if (xml.status === 'oversize') {
      try { prefix = eventTraceHeaderPrefixShape(xml.prefix) }
      catch { prefix = `prefixEvent=invalid;${UNBOUND_PREFIX_SHAPE}` }
    }
    process.stdout.write(`v4;summaryInput=${summary.status};${summaryShape};xmlInput=${xml.status};xmlSizeBand=${xml.band};${prefix};${header}\n`)
    return
  }
  if (process.argv.length !== 5) fail('observer_probe_trace_parser_arguments_invalid')
  const xmlPath = resolve(process.argv[2])
  const bytes = await readFile(xmlPath)
  if (bytes.length < 1 || bytes.length > MAX_XML_BYTES) fail('observer_probe_trace_xml_unsafe')
  process.stdout.write(`${JSON.stringify(correlateTraceXml(
    bytes.toString('utf8'), process.argv[3], process.argv[4]))}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(() => {
    process.stderr.write('observer_probe_trace_parser_failed\n')
    process.exitCode = 1
  })
}
