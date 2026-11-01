import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const MAX_XML_BYTES = 64 * 1024 * 1024
const localName = (name) => name.split(':').at(-1)

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
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

export function correlateTraceXml(xml, expectedImagePath) {
  const expectedLeaf = basename(expectedImagePath ?? '')
  if (!expectedLeaf || expectedLeaf === '.' || expectedLeaf === '..') {
    fail('observer_probe_trace_expected_image_invalid')
  }
  const document = parseXml(xml)
  const records = []
  for (const event of allDescendants(document, 'Event')) {
    const system = one(event, 'System')
    const fields = dataFields(event)
    const imageName = exactlyOneField(fields, ['ImageName', 'ImageFileName', 'FileName'])
    if (!imageName || basename(imageName).toLowerCase() !== expectedLeaf.toLowerCase()) continue
    const task = attributeOrText(one(system, 'Task'))?.toLowerCase()
    const opcode = attributeOrText(one(system, 'Opcode'))?.toLowerCase()
    let kind
    if (task === 'process' && ['start', 'dcstart'].includes(opcode)) kind = 'start'
    else if (task === 'process' && ['end', 'dcend', 'stop'].includes(opcode)) kind = 'end'
    else if (['image', 'imageload', 'loader'].includes(task)
      && ['load', 'start', 'dcstart'].includes(opcode)) kind = 'image'
    else fail('observer_probe_trace_task_opcode_unknown')
    const processKey = exactlyOneField(fields, ['ProcessKey', 'UniqueProcessKey'])
    if (!processKey) fail('observer_probe_trace_process_key_missing')
    records.push({
      kind,
      pid: parsePid(fields, system),
      processKey,
      timestamp: parseTimestamp(system),
    })
  }
  const starts = records.filter(({ kind }) => kind === 'start')
  const images = records.filter(({ kind }) => kind === 'image')
  const ends = records.filter(({ kind }) => kind === 'end')
  if (starts.length !== 1 || images.length !== 1 || ends.length !== 1) {
    fail('observer_probe_trace_correlation_ambiguous')
  }
  const [start] = starts; const [image] = images; const [end] = ends
  if (start.pid !== image.pid || start.pid !== end.pid
    || start.processKey !== image.processKey || start.processKey !== end.processKey
    || image.timestamp < start.timestamp || end.timestamp <= image.timestamp) {
    fail('observer_probe_trace_correlation_mismatch')
  }
  return {
    contract: 'supermega.windows-process-image-correlation.v1',
    processEventObserved: true,
    imageEventObserved: true,
    processEndObserved: true,
    stableProcessKeyObserved: true,
  }
}

async function main() {
  if (process.argv.length !== 4) fail('observer_probe_trace_parser_arguments_invalid')
  const xmlPath = resolve(process.argv[2])
  const bytes = await readFile(xmlPath)
  if (bytes.length < 1 || bytes.length > MAX_XML_BYTES) fail('observer_probe_trace_xml_unsafe')
  process.stdout.write(`${JSON.stringify(correlateTraceXml(bytes.toString('utf8'), process.argv[3]))}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(() => {
    process.stderr.write('observer_probe_trace_parser_failed\n')
    process.exitCode = 1
  })
}
