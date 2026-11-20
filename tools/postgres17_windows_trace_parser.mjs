import { readFile } from 'node:fs/promises'
import { resolve, win32 } from 'node:path'
import { pathToFileURL } from 'node:url'

const MAX_XML_BYTES = 64 * 1024 * 1024
const MAX_SUMMARY_BYTES = 64 * 1024
const localName = (name) => name.split(':').at(-1)

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

// This is a diagnostic code, not a loss-counter parser. It never includes
// summary text or the value of a counter, and cannot authorize probe evidence.
export function lossCounterLineShapes(summary) {
  if (typeof summary !== 'string' || !summary
    || Buffer.byteLength(summary) > MAX_SUMMARY_BYTES || summary.includes('\0')) {
    fail('observer_probe_loss_summary_unsafe')
  }
  const shapes = []
  let candidateLines = 0
  for (const line of summary.split(/\r?\n/)) {
    const event = /events?/i.exec(line)
    const buffer = /buffers?/i.exec(line)
    const lost = /lost/i.exec(line)
    const loss = /loss/i.exec(line)
    const dropped = /dropp?ed/i.exec(line)
    if (!event && !buffer && !lost && !loss && !dropped) continue
    candidateLines = Math.min(candidateLines + 1, 9)
    if (shapes.length === 8) continue
    if (line.length > 512) {
      shapes.push('UUUUN')
      continue
    }
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
    shapes.push(`${role}${term}${order}${separator}${/\d/.test(tail) ? 'D' : 'N'}`)
  }
  return `v1;candidateLines=${candidateLines};more=${candidateLines > 8 ? 'yes' : 'no'};patterns=${shapes.join(',') || 'none'}`
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
  if (process.argv[2] === '--loss-counter-shape') {
    if (process.argv.length !== 4) fail('observer_probe_loss_summary_arguments_invalid')
    const bytes = await readFile(resolve(process.argv[3]))
    if (bytes.length < 1 || bytes.length > MAX_SUMMARY_BYTES) {
      fail('observer_probe_loss_summary_unsafe')
    }
    process.stdout.write(`${lossCounterLineShapes(bytes.toString('utf8'))}\n`)
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
