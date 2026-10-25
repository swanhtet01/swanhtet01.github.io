#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises'
import { resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const libRoot = 'mobile/shop_pos/lib'

const requiredExisting = [
  'mobile/shop_pos/android/app/build.gradle.kts',
  'mobile/shop_pos/ios/Runner.xcodeproj/project.pbxproj',
  'mobile/shop_pos/lib/main.dart',
  'mobile/shop_pos/lib/shop_database.dart',
  'mobile/shop_pos/lib/shop_startup.dart',
  'mobile/shop_pos/lib/shop_backup_export_screen.dart',
  'mobile/shop_pos/lib/shop_operational_export_saver.dart',
  'mobile/shop_pos/lib/printer_services.dart',
  'mobile/shop_pos/lib/printer_setup_screen.dart',
  'mobile/shop_pos/lib/menu_import_screen.dart',
  'mobile/shop_pos/lib/menu_import_service.dart',
  'mobile/shop_pos/lib/camera_barcode_scanner.dart',
  'mobile/shop_pos/lib/connected_orders_screen.dart',
  'mobile/shop_pos/lib/connected_orders_service.dart',
  'mobile/shop_pos/lib/recent_sales_screen.dart',
  'mobile/shop_pos/lib/shop_correction_authorization_service.dart',
  '.github/workflows/shop-native-ci.yml',
]

const implementationFiles = [
  'mobile/shop_pos/lib/shop_runtime_profile.dart',
  'mobile/shop_pos/lib/shop_runtime_scope.dart',
  'mobile/shop_pos/lib/shop_build_identity.g.dart',
  'tools/generate_shop_build_identity.mjs',
  'mobile/shop_pos/scripts/configure_windows_qa_runner.ps1',
  'mobile/shop_pos/android/app/src/production/AndroidManifest.xml',
  'mobile/shop_pos/android/app/src/qa/AndroidManifest.xml',
  'mobile/shop_pos/ios/Runner.xcodeproj/xcshareddata/xcschemes/qa.xcscheme',
  'mobile/shop_pos/ios/Runner/Info.plist',
  'mobile/shop_pos/ios/Flutter/Debug.xcconfig',
  'mobile/shop_pos/ios/Flutter/Release.xcconfig',
  'mobile/shop_pos/ios/Flutter/QA.xcconfig',
]

const currentUnsafeCeilings = new Map([
  ['SharedPreferences.getInstance', new Map([['mobile/shop_pos/lib/main.dart', 4], ['mobile/shop_pos/lib/shop_startup.dart', 1], ['mobile/shop_pos/lib/printer_services.dart', 1], ['mobile/shop_pos/lib/shop_runtime_scope.dart', 1]])],
  ['getApplicationDocumentsDirectory', new Map([['mobile/shop_pos/lib/main.dart', 1], ['mobile/shop_pos/lib/shop_backup_export_screen.dart', 1], ['mobile/shop_pos/lib/shop_runtime_scope.dart', 1]])],
  ['getTemporaryDirectory', new Map([['mobile/shop_pos/lib/shop_startup.dart', 1], ['mobile/shop_pos/lib/shop_backup_export_screen.dart', 1], ['mobile/shop_pos/lib/shop_runtime_scope.dart', 1]])],
  ['getApplicationSupportDirectory', new Map([['mobile/shop_pos/lib/shop_runtime_scope.dart', 1]])],
  ['Supabase.initialize', new Map([['mobile/shop_pos/lib/main.dart', 1]])],
  ['ImagePicker(', new Map([['mobile/shop_pos/lib/main.dart', 2], ['mobile/shop_pos/lib/menu_import_screen.dart', 1]])],
  ['MobileScanner(', new Map([['mobile/shop_pos/lib/camera_barcode_scanner.dart', 1]])],
  ['FileSaver.instance.saveAs', new Map([['mobile/shop_pos/lib/shop_backup_export_screen.dart', 1], ['mobile/shop_pos/lib/shop_operational_export_saver.dart', 1]])],
  ['openFile(', new Map([['mobile/shop_pos/lib/shop_startup.dart', 1]])],
  ['.post(', new Map([['mobile/shop_pos/lib/menu_import_service.dart', 1]])],
  ['_client.send(', new Map([['mobile/shop_pos/lib/connected_orders_service.dart', 1], ['mobile/shop_pos/lib/shop_correction_authorization_service.dart', 1]])],
  ['NetworkInfo(', new Map([['mobile/shop_pos/lib/printer_services.dart', 3]])],
  ['http.Client(', new Map([['mobile/shop_pos/lib/connected_orders_service.dart', 1], ['mobile/shop_pos/lib/menu_import_service.dart', 1], ['mobile/shop_pos/lib/shop_correction_authorization_service.dart', 1]])],
  ['PrinterManager(', new Map([['mobile/shop_pos/lib/printer_services.dart', 2]])],
  ['Socket.connect', new Map([['mobile/shop_pos/lib/printer_services.dart', 1]])],
  ['PrinterDiscoveryService(', new Map([['mobile/shop_pos/lib/printer_setup_screen.dart', 1], ['mobile/shop_pos/lib/printer_services.dart', 1]])],
])

function occurrences(text, token) {
  let count = 0
  let cursor = 0
  while ((cursor = text.indexOf(token, cursor)) >= 0) {
    count += 1
    cursor += token.length
  }
  return count
}

function add(list, code, detail) {
  list.push({ code, detail })
}

function codeOnly(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

function yamlCodeLine(line) {
  let singleQuoted = false
  let doubleQuoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === "'" && !doubleQuoted) singleQuoted = !singleQuoted
    else if (character === '"' && !singleQuoted && line[index - 1] !== '\\') doubleQuoted = !doubleQuoted
    else if (character === '#' && !singleQuoted && !doubleQuoted && (index === 0 || /\s/.test(line[index - 1]))) return line.slice(0, index).trimEnd()
  }
  return line.trimEnd()
}

function yamlIndent(line) {
  return line.match(/^\s*/)[0].replaceAll('\t', '  ').length
}

function yamlScalar(value) {
  const clean = yamlCodeLine(value).trim()
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) return clean.slice(1, -1)
  return clean
}

function yamlBlockScalar(lines, startIndex, parentIndent, folded) {
  const content = []
  let index = startIndex + 1
  let contentIndent = null
  while (index < lines.length) {
    const raw = lines[index]
    if (raw.trim() && yamlIndent(raw) <= parentIndent) break
    if (raw.trim() && contentIndent === null) contentIndent = yamlIndent(raw)
    if (!raw.trim()) content.push('')
    else content.push(raw.slice(Math.min(contentIndent ?? 0, raw.length)))
    index += 1
  }
  return { value: folded ? content.join(' ') : content.join('\n'), endIndex: index }
}

function workflowSteps(workflow) {
  const lines = workflow.split(/\r?\n/)
  const jobsIndex = lines.findIndex(line => /^jobs\s*:\s*$/.test(yamlCodeLine(line).trim()))
  if (jobsIndex < 0) return []
  const jobsIndent = yamlIndent(lines[jobsIndex])
  let jobsEnd = lines.length
  for (let index = jobsIndex + 1; index < lines.length; index += 1) {
    if (lines[index].trim() && yamlIndent(lines[index]) <= jobsIndent) { jobsEnd = index; break }
  }
  const jobIndent = lines.slice(jobsIndex + 1, jobsEnd)
    .filter(line => line.trim() && /^[-A-Za-z0-9_]+\s*:\s*$/.test(yamlCodeLine(line).trim()))
    .reduce((minimum, line) => Math.min(minimum, yamlIndent(line)), Number.MAX_SAFE_INTEGER)
  if (!Number.isFinite(jobIndent) || jobIndent === Number.MAX_SAFE_INTEGER) return []
  const jobs = []
  for (let index = jobsIndex + 1; index < jobsEnd; index += 1) {
    const header = yamlCodeLine(lines[index]).trim().match(/^([-A-Za-z0-9_]+)\s*:\s*$/)
    if (!header || yamlIndent(lines[index]) !== jobIndent) continue
    let end = jobsEnd
    for (let cursor = index + 1; cursor < jobsEnd; cursor += 1) {
      if (lines[cursor].trim() && yamlIndent(lines[cursor]) === jobIndent && /^[-A-Za-z0-9_]+\s*:\s*$/.test(yamlCodeLine(lines[cursor]).trim())) { end = cursor; break }
    }
    jobs.push({ id: header[1], start: index, end })
    index = end - 1
  }

  const parsed = []
  for (const job of jobs) {
    const stepsIndex = lines.findIndex((line, index) => index > job.start && index < job.end && /^steps\s*:\s*$/.test(yamlCodeLine(line).trim()))
    if (stepsIndex < 0) continue
    const jobScalar = key => {
      for (let index = job.start + 1; index < stepsIndex; index += 1) {
        if (yamlIndent(lines[index]) !== jobIndent + 2) continue
        const match = yamlCodeLine(lines[index]).match(new RegExp(`^\\s*${key}\\s*:\\s*(.*)$`))
        if (match) return yamlScalar(match[1])
      }
      return ''
    }
    const jobIf = jobScalar('if')
    const jobNeeds = jobScalar('needs')
    const jobContinueOnError = jobScalar('continue-on-error')
    const jobShell = jobScalar('shell')
    const stepsIndent = yamlIndent(lines[stepsIndex])
    const stepIndent = lines.slice(stepsIndex + 1, job.end)
      .filter(line => /^\s*-\s+(?:name|uses|run)\s*:/.test(yamlCodeLine(line)))
      .reduce((minimum, line) => Math.min(minimum, yamlIndent(line)), Number.MAX_SAFE_INTEGER)
    if (!Number.isFinite(stepIndent) || stepIndent === Number.MAX_SAFE_INTEGER) continue
    const ranges = []
    for (let index = stepsIndex + 1; index < job.end; index += 1) {
      if (yamlIndent(lines[index]) === stepIndent && /^\s*-\s+(?:name|uses|run)\s*:/.test(yamlCodeLine(lines[index]))) ranges.push(index)
    }
    ranges.push(job.end)
    for (let rangeIndex = 0; rangeIndex < ranges.length - 1; rangeIndex += 1) {
      const start = ranges[rangeIndex]
      const end = ranges[rangeIndex + 1]
      const stepLines = lines.slice(start, end)
      const scalar = key => {
        for (const line of stepLines) {
          const indent = yamlIndent(line)
          if (indent !== stepIndent && indent !== stepIndent + 2) continue
          const match = yamlCodeLine(line).match(new RegExp(`^\\s*(?:-\\s+)?${key}\\s*:\\s*(.*)$`))
          if (match) return yamlScalar(match[1])
        }
        return ''
      }
      const nestedScalar = (section, key) => {
        const sectionIndex = stepLines.findIndex(line => new RegExp(`^\\s*${section}\\s*:\\s*$`).test(yamlCodeLine(line)))
        if (sectionIndex < 0) return ''
        const sectionIndent = yamlIndent(stepLines[sectionIndex])
        for (let index = sectionIndex + 1; index < stepLines.length; index += 1) {
          if (stepLines[index].trim() && yamlIndent(stepLines[index]) <= sectionIndent) break
          const match = yamlCodeLine(stepLines[index]).match(new RegExp(`^\\s*${key}\\s*:\\s*(.*)$`))
          if (match) {
            const indicator = match[1].trim()
            if (/^[>|][+-]?\d*$/.test(indicator)) return yamlBlockScalar(stepLines, index, yamlIndent(stepLines[index]), indicator.startsWith('>')).value
            return yamlScalar(indicator)
          }
        }
        return ''
      }
      let run = ''
      for (let offset = 0; offset < stepLines.length; offset += 1) {
        const match = yamlCodeLine(stepLines[offset]).match(/^\s*(?:-\s+)?run\s*:\s*(.*)$/)
        if (!match) continue
        const indicator = match[1].trim()
        if (/^[>|][+-]?\d*$/.test(indicator)) run = yamlBlockScalar(stepLines, offset, yamlIndent(stepLines[offset]), indicator.startsWith('>')).value
        else run = yamlScalar(indicator)
        break
      }
      parsed.push({
        job: job.id,
        index: parsed.length,
        name: scalar('name'),
        uses: scalar('uses'),
        artifactName: nestedScalar('with', 'name'),
        artifactPath: nestedScalar('with', 'path'),
        ifCondition: scalar('if'),
        continueOnError: scalar('continue-on-error'),
        shell: scalar('shell'),
        jobIf,
        jobNeeds,
        jobContinueOnError,
        jobShell,
        run,
        source: stepLines.map(yamlCodeLine).join('\n'),
      })
    }
  }
  return parsed
}

function executableCommands(run) {
  const commands = []
  let continuation = ''
  for (const rawLine of run.split(/\r?\n/)) {
    const line = yamlCodeLine(rawLine).trim()
    if (!line || line.startsWith('#')) continue
    const continued = /(?:\\|`)\s*$/.test(line)
    continuation += `${continuation ? ' ' : ''}${line.replace(/(?:\\|`)\s*$/, '').trim()}`
    if (continued) continue
    for (const command of continuation.split(/\s*(?:&&|;)\s*/)) {
      const normalized = command.trim().replace(/^&\s+/, '').replace(/\s+/g, ' ')
      if (normalized) commands.push(normalized)
    }
    continuation = ''
  }
  if (continuation) commands.push(continuation.replace(/^&\s+/, '').replace(/\s+/g, ' '))
  return commands
}

function workflowDefaultRunShells(workflow) {
  const lines = workflow.split(/\r?\n/)
  const shells = []
  for (let defaultsIndex = 0; defaultsIndex < lines.length; defaultsIndex += 1) {
    if (!/^defaults\s*:\s*$/.test(yamlCodeLine(lines[defaultsIndex]).trim())) continue
    const defaultsIndent = yamlIndent(lines[defaultsIndex])
    let defaultsEnd = lines.length
    for (let index = defaultsIndex + 1; index < lines.length; index += 1) {
      if (lines[index].trim() && yamlIndent(lines[index]) <= defaultsIndent) { defaultsEnd = index; break }
    }
    for (let runIndex = defaultsIndex + 1; runIndex < defaultsEnd; runIndex += 1) {
      if (!/^run\s*:\s*$/.test(yamlCodeLine(lines[runIndex]).trim())) continue
      const runIndent = yamlIndent(lines[runIndex])
      for (let index = runIndex + 1; index < defaultsEnd; index += 1) {
        if (lines[index].trim() && yamlIndent(lines[index]) <= runIndent) break
        const match = yamlCodeLine(lines[index]).match(/^\s*shell\s*:\s*(.*)$/)
        if (match) shells.push(yamlScalar(match[1]))
      }
    }
  }
  return shells
}

const workflowTuples = Object.freeze([
  { platform: 'android', profile: 'production', build: 'flutter build apk --debug --no-pub --flavor production' },
  { platform: 'android', profile: 'synthetic_qa_v1', build: 'flutter build apk --debug --no-pub --flavor qa --dart-define=SHOP_RUNTIME_PROFILE=synthetic_qa_v1 --dart-define=SHOP_QA_PROFILE_ID=synthetic-qa-v1', artifact: 'app-qa-debug.apk', inspection: ['manifest application-id app-qa-debug.apk', 'dev.supermega.supermega_shop.qa', 'manifest print app-qa-debug.apk', 'android:label="Shop QA"'] },
  { platform: 'ios', profile: 'production', build: 'flutter build ios --debug --no-codesign --no-pub' },
  { platform: 'ios', profile: 'synthetic_qa_v1', build: 'flutter build ios --debug --no-codesign --no-pub --flavor qa --dart-define=SHOP_RUNTIME_PROFILE=synthetic_qa_v1 --dart-define=SHOP_QA_PROFILE_ID=synthetic-qa-v1', artifact: 'Runner.app.zip', inspection: ["info='build/ios/iphoneos/Runner.app/Info.plist'", 'Print :CFBundleIdentifier', 'dev.supermega.supermegaShop.qa', 'Print :CFBundleDisplayName', 'Print :CFBundleName', 'Shop QA'] },
  { platform: 'windows', profile: 'production', build: 'flutter build windows --release --no-pub' },
  { platform: 'windows', profile: 'synthetic_qa_v1', build: 'flutter build windows --release --no-pub --dart-define=SHOP_RUNTIME_PROFILE=synthetic_qa_v1 --dart-define=SHOP_QA_PROFILE_ID=synthetic-qa-v1', artifact: 'supermega-shop-windows-qa.zip', configure: true, inspection: ["$identity.ProductName -cne 'Shop QA'", "$identity.FileDescription -cne 'Shop QA'", "$identity.InternalName -cne 'supermega_shop_qa'", "$identity.OriginalFilename -cne 'supermega_shop_qa.exe'"], package: 'Compress-Archive -Path $releaseDirectory -DestinationPath $packagePath' },
])

function jobTargetsPlatform(job, platform) {
  const tokens = job.toLowerCase().split(/[-_.]+/)
  return tokens.includes(platform) && !['android', 'ios', 'windows'].some(other => other !== platform && tokens.includes(other))
}

function requiredStepIsUnconditional(step) {
  const shell = step.shell || step.jobShell
  return !step.ifCondition
    && !step.jobIf
    && !step.jobNeeds
    && (!(step.continueOnError || step.jobContinueOnError) || /^false$/i.test(step.continueOnError || step.jobContinueOnError))
    && (!shell || /^(?:bash|pwsh|powershell)$/.test(shell))
}

function exactArtifactEntries(value) {
  return new Set(value.split(/\r?\n/).map(entry => entry.trim()).filter(Boolean))
}

function escapedPattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function qaWorkflowBlockers(workflow) {
  const steps = workflowSteps(workflow)
  const missing = []
  const invalidDefaultShells = workflowDefaultRunShells(workflow).filter(shell => !/^(?:bash|pwsh|powershell)$/.test(shell))
  if (invalidDefaultShells.length) missing.push('workflow:non_executing_default_shell')
  const tupleJobs = new Map()
  for (const tuple of workflowTuples) {
    const platformSteps = steps.filter(step => jobTargetsPlatform(step.job, tuple.platform))
    let matched = null
    for (const job of new Set(platformSteps.map(step => step.job))) {
      const commands = platformSteps.filter(step => step.job === job).flatMap(step => {
        const executable = executableCommands(step.run)
        return executable.map(command => ({ command, step: step.index, exactStep: executable.length === 1, safe: requiredStepIsUnconditional(step) }))
      })
      const generator = `node tools/generate_shop_build_identity.mjs --platform ${tuple.platform} --profile ${tuple.profile}`
      const generatorIndex = commands.findIndex(entry => entry.safe && entry.exactStep && entry.command === generator)
      const buildIndex = commands.findIndex((entry, index) => index > generatorIndex && entry.safe && entry.exactStep && entry.command === tuple.build)
      if (generatorIndex < 0 || buildIndex < 0) continue
      if (tuple.configure) {
        const configurationIndex = commands.findIndex((entry, index) => index > generatorIndex && index < buildIndex && entry.safe && /^(?:pwsh(?:\.exe)?\s+-File\s+)?(?:\.\\|\.\/)?(?:mobile[\\/]shop_pos[\\/])?scripts[\\/]configure_windows_qa_runner\.ps1$/i.test(entry.command))
        if (configurationIndex < 0) continue
      }
      matched = { job, buildStep: commands[buildIndex].step }
      break
    }
    if (!matched) {
      missing.push(`${tuple.platform}:${tuple.profile}:ordered_generator_build`)
      continue
    }
    tupleJobs.set(`${tuple.platform}:${tuple.profile}`, matched.job)
    if (!tuple.artifact) continue
    const laterSteps = platformSteps.filter(step => step.job === matched.job && step.index > matched.buildStep)
    const artifact = escapedPattern(tuple.artifact)
    const inspectionStep = laterSteps.find(step => requiredStepIsUnconditional(step) && tuple.inspection?.every(token => step.run.includes(token)))
    const checksumStep = laterSteps.find(step => requiredStepIsUnconditional(step) && executableCommands(step.run).some(command => (
      new RegExp(`^(?:sha256sum|shasum\\s+-a\\s+256)\\s+${artifact}\\s*>\\s*${artifact}\\.sha256$`, 'i').test(command)
        || new RegExp(`^Get-FileHash\\s+-Algorithm\\s+SHA256\\s+${artifact}\\s*\\|\\s*Out-File\\s+${artifact}\\.sha256$`, 'i').test(command)
        || (tuple.platform === 'windows'
          && step.run.includes(`$artifact = '${tuple.artifact}'`)
          && command.includes('Get-FileHash -Algorithm SHA256 -LiteralPath $artifact')
          && command.includes('.Hash.ToLowerInvariant()'))
    )))
    const checksum = Boolean(checksumStep)
    const packageStep = tuple.package
      ? laterSteps.find(step => requiredStepIsUnconditional(step) && step.run.includes(tuple.package))
      : inspectionStep
    const inspectedBeforeChecksum = Boolean(inspectionStep && packageStep && checksumStep
      && inspectionStep.index <= packageStep.index && packageStep.index < checksumStep.index)
    const windowsCanonicalChecksum = tuple.platform !== 'windows' || laterSteps.some(step => requiredStepIsUnconditional(step)
      && step.run.includes(`$artifact = '${tuple.artifact}'`)
      && step.run.includes('"$digest  $artifact"')
      && step.run.includes('if ($recorded -cne $expected)'))
    const metadata = laterSteps.some(step => requiredStepIsUnconditional(step) && executableCommands(step.run).some(command => (
      command.includes('source-sha=${{ github.sha }}')
        && /promotion-ineligible/i.test(command)
        && new RegExp(`(?:cat|Get-Content)\\s+${artifact}\\.sha256`, 'i').test(command)
        && new RegExp(`(?:>\\s*|Out-File\\s+)${artifact}\\.manifest$`, 'i').test(command)
    )))
    const upload = laterSteps.find(step => /^actions\/upload-artifact@(?:v4(?:\.\d+\.\d+)?|[0-9a-f]{40})$/.test(step.uses)
      && requiredStepIsUnconditional(step)
      && /synthetic-qa/i.test(step.artifactName)
      && /promotion-ineligible/i.test(step.artifactName)
      && step.artifactName.includes('${{ github.sha }}')
      && /sha-?256/i.test(step.artifactName)
      && exactArtifactEntries(step.artifactPath).has(tuple.artifact)
      && exactArtifactEntries(step.artifactPath).has(`${tuple.artifact}.sha256`)
      && exactArtifactEntries(step.artifactPath).has(`${tuple.artifact}.manifest`))
    if (!checksum || !metadata || !upload || !inspectedBeforeChecksum || !windowsCanonicalChecksum) {
      missing.push(`${tuple.platform}:${tuple.profile}:artifact_checksum_promotion_binding(checksum=${checksum},metadata=${metadata},upload=${Boolean(upload)},inspection=${inspectedBeforeChecksum},canonical=${windowsCanonicalChecksum})`)
    }
  }
  for (const platform of ['android', 'ios', 'windows']) {
    const productionJob = tupleJobs.get(`${platform}:production`)
    const qaJob = tupleJobs.get(`${platform}:synthetic_qa_v1`)
    if (productionJob && qaJob && productionJob === qaJob) missing.push(`${platform}:production_qa_workspace_not_separate`)
  }
  return missing
}

function workflowHasProviderValue(workflow) {
  const provider = '(?:SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY|SHOP_API_BASE_URL)'
  const lines = workflow.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const code = yamlCodeLine(lines[index])
    const env = code.trim().match(/^env\s*:\s*(.*)$/)
    if (!env) continue
    if (new RegExp(`(?:(?:"|')?${provider}(?:"|')?)\\s*:\\s*[^},\\s]+`, 'i').test(env[1])) return true
    const parentIndent = yamlIndent(lines[index])
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (lines[cursor].trim() && yamlIndent(lines[cursor]) <= parentIndent) break
      const entry = yamlCodeLine(lines[cursor]).trim()
      if (new RegExp(`^(?:"|')?${provider}(?:"|')?\\s*:\\s*\\S+`, 'i').test(entry)) return true
    }
  }
  return workflowSteps(workflow).some(step => executableCommands(step.run).some(command => (
    new RegExp(`(?:^|\\s)${provider}\\s*=\\s*\\S+`, 'i').test(command)
      || new RegExp(`\\$env:${provider}\\s*=\\s*\\S+`, 'i').test(command)
  )))
}

function enclosingCallable(text, index) {
  const candidates = []
  const pattern = /\b(?:Future(?:<[^>{}]+>)?|void|Widget|[A-Za-z_]\w*(?:<[^>{}]+>)?\??)\s+[A-Za-z_]\w*\s*\([^;{}]*\)\s*(?:async\s*)?\{/g
  let match
  while ((match = pattern.exec(text)) !== null) {
    const open = text.indexOf('{', match.index)
    if (open < 0 || open >= index) continue
    let depth = 0
    let close = -1
    for (let cursor = open; cursor < text.length; cursor += 1) {
      if (text[cursor] === '{') depth += 1
      else if (text[cursor] === '}' && --depth === 0) { close = cursor; break }
    }
    if (close >= index) candidates.push({ open, close })
  }
  candidates.sort((left, right) => (left.close - left.open) - (right.close - right.open))
  return candidates[0] || null
}

function hasTerminatingGuardBefore(text, capability, beforeIndex) {
  const callable = enclosingCallable(text, beforeIndex)
  if (!callable) return false
  const callableText = text.slice(callable.open + 1, beforeIndex)
  const escaped = capability.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `if\\s*\\(\\s*!(?:scope|runtimeScope)\\.capabilities\\.${escaped}\\s*\\)\\s*(?:\\{\\s*(?:return\\s*;|throw\\s+StateError\\([^;]+;)\\s*\\}|return\\s*;|throw\\s+StateError\\([^;]+;)`,
    'g',
  )
  let match
  let found = false
  while ((match = pattern.exec(callableText)) !== null) {
    found = true
  }
  return found
}

export function assessShopQaIsolationContract({ sources }) {
  const fatal = []
  const blockers = []
  if (!sources || typeof sources !== 'object' || Array.isArray(sources)) {
    return { ok: false, strictReady: false, fatal: [{ code: 'sources_invalid', detail: 'Source map is required.' }], blockers: [] }
  }
  for (const [path, source] of Object.entries(sources)) {
    if (typeof source !== 'string') add(fatal, 'source_unreadable', path)
  }
  for (const path of requiredExisting) {
    if (typeof sources[path] !== 'string' || !sources[path].length) add(fatal, 'required_source_missing', path)
  }
  if (fatal.length) return { ok: false, strictReady: false, fatal, blockers }

  const gradle = codeOnly(sources['mobile/shop_pos/android/app/build.gradle.kts'])
  const ios = codeOnly(sources['mobile/shop_pos/ios/Runner.xcodeproj/project.pbxproj'])
  const database = codeOnly(sources['mobile/shop_pos/lib/shop_database.dart'])
  const corpus = Object.entries(sources).map(([path, source]) => path.endsWith('.dart') ? codeOnly(source) : source).join('\n')
  if (occurrences(gradle, 'applicationId = "dev.supermega.supermega_shop"') !== 1) add(fatal, 'production_android_identity_drift', 'dev.supermega.supermega_shop')
  if (occurrences(ios, 'PRODUCT_BUNDLE_IDENTIFIER = dev.supermega.supermegaShop;') !== 3) add(fatal, 'production_ios_identity_drift', 'dev.supermega.supermegaShop')
  if (occurrences(database, 'supermega_shop.sqlite') !== 1) add(fatal, 'production_database_name_drift', 'supermega_shop.sqlite')
  for (const key of ['shop_locale_myanmar', 'shop_pending_picker_intent', 'shop_receipt_printer_host_v1', 'shop_receipt_paper_width_v1']) {
    if (!corpus.includes(key)) add(fatal, 'production_preference_key_drift', key)
  }

  const dartPaths = Object.keys(sources).filter(path => path.startsWith(`${libRoot}/`) && path.endsWith('.dart'))
  for (const [token, allowed] of currentUnsafeCeilings) {
    for (const path of dartPaths) {
      const count = occurrences(sources[path], token)
      const ceiling = allowed.get(path) ?? 0
      if (count > ceiling) add(fatal, 'new_unsafe_io_callsite', `${path}:${token}:${count}>${ceiling}`)
    }
  }

  for (const path of implementationFiles) {
    if (typeof sources[path] !== 'string' || !sources[path].length) add(blockers, 'isolation_source_missing', path)
  }
  const profile = sources['mobile/shop_pos/lib/shop_runtime_profile.dart'] || ''
  const scope = sources['mobile/shop_pos/lib/shop_runtime_scope.dart'] || ''
  const main = sources['mobile/shop_pos/lib/main.dart']
  const workflow = sources['.github/workflows/shop-native-ci.yml']
  const identity = sources['mobile/shop_pos/lib/shop_build_identity.g.dart'] || ''

  for (const token of ['enum ShopRuntimeProfile', 'ShopRuntimeProfile resolve', 'String.fromEnvironment', "'SHOP_RUNTIME_PROFILE'", "'SHOP_QA_PROFILE_ID'", 'synthetic_qa_v1', 'synthetic-qa-v1', 'throw StateError']) {
    if (!profile.includes(token)) add(blockers, 'runtime_profile_contract_missing', token)
  }
  for (const identity of ['dev.supermega.supermega_shop.qa', 'dev.supermega.supermegaShop.qa', 'dev.supermega.supermega_shop.qa.windows']) {
    if (!profile.includes(identity)) add(blockers, 'runtime_qa_platform_identity_missing', identity)
  }
  for (const identity of ['production-current', 'dev.supermega.supermega_shop', 'dev.supermega.supermegaShop', 'dev.supermega.supermega_shop.windows']) {
    if (!profile.includes(identity)) add(blockers, 'runtime_production_platform_identity_missing', identity)
  }
  if (!profile.includes('static const failClosed = ShopRuntimeCapabilities(')) add(blockers, 'runtime_fail_closed_capabilities_missing', 'fixture routes must not inherit production capabilities')
  if (!profile.includes('defaultValue: shopBuildIdentityProfile') || !profile.includes('defaultValue: shopBuildIdentityQaProfileId')) add(blockers, 'generated_runtime_tuple_default_missing', 'generated profile and QA id must bind runtime defaults')
  if (!profile.includes("runtime == 'production'") || !profile.includes("buildProfile == 'production'") || !profile.includes('profileId.isEmpty') || !profile.includes('buildQaProfile.isEmpty')) add(blockers, 'exact_production_tuple_missing', 'generated production startup must require one exact tuple')
  for (const forbidden of ['externalIoOverride', 'ALLOW_EXTERNAL_IO', 'allowExternalIo']) {
    if (profile.includes(forbidden)) add(fatal, 'qa_external_io_override_forbidden', forbidden)
  }
  if (!/unknown|unsupported/i.test(profile) || !/partial|complete|all/i.test(profile)) add(blockers, 'runtime_profile_fail_closed_missing', 'unknown and partial tuples')
  for (const token of ['class ShopRuntimeScope', 'Future<ShopRuntimeScope> resolve', 'getApplicationSupportDirectory', 'getTemporaryDirectory', 'SharedPreferences.getInstance']) {
    if (!scope.includes(token)) add(blockers, 'scoped_roots_missing', token)
  }
  if (!scope.includes('requireShopRuntimeScopeOrTestSeam') || !scope.includes('shop_runtime_scope_required')) add(blockers, 'missing_scope_guard_missing', 'null runtime scopes must fail closed outside an explicit test seam')
  for (const path of [
    'mobile/shop_pos/lib/connected_orders_service.dart',
    'mobile/shop_pos/lib/menu_import_service.dart',
    'mobile/shop_pos/lib/shop_correction_authorization_service.dart',
    'mobile/shop_pos/lib/printer_services.dart',
  ]) {
    const text = codeOnly(sources[path] || '')
    if (/testOnlyAllowMissingRuntimeScope\s*:\s*[\s\S]{0,160}\|\|/.test(text)) {
      add(blockers, 'implicit_missing_scope_test_seam', path)
    }
  }
  const camera = codeOnly(sources['mobile/shop_pos/lib/camera_barcode_scanner.dart'] || '')
  if (!camera.includes('testOnlyAllowMissingRuntimeScope') || !camera.includes('requireShopRuntimeScopeOrTestSeam')) {
    add(blockers, 'camera_callback_scope_guard_missing', 'camera callbacks require scope or an explicit test-only seam')
  }
  if (!camera.includes("if (builder == null) throw StateError('shop_runtime_scope_required')")) {
    add(blockers, 'camera_test_seam_can_reach_device', 'the missing-scope seam must require an injected camera view')
  }
  if (!main.includes('testOnlyAllowMissingRuntimeScope') || !main.includes('requireShopRuntimeScopeOrTestSeam')) {
    add(blockers, 'shop_home_callback_scope_guard_missing', 'ShopHome callbacks require scope or an explicit test-only seam')
  }
  for (const path of [
    'mobile/shop_pos/lib/connected_orders_screen.dart',
    'mobile/shop_pos/lib/menu_import_screen.dart',
    'mobile/shop_pos/lib/printer_setup_screen.dart',
    'mobile/shop_pos/lib/recent_sales_screen.dart',
  ]) {
    const source = codeOnly(sources[path] || '')
    if (!source.includes('testOnlyAllowMissingRuntimeScope') || !source.includes('requireShopRuntimeScopeOrTestSeam')) {
      add(blockers, 'routed_screen_scope_guard_missing', path)
    }
  }
  if (main.includes('runtimeCapabilities = ShopRuntimeCapabilities.production')) add(blockers, 'widget_default_inherits_production_capabilities', 'Shop widgets must require an explicit production scope')
  if (!scope.includes('synthetic-evidence') || !scope.includes('sentinel')) add(blockers, 'scoped_evidence_boundary_missing', 'synthetic evidence root and sentinel')
  if (!identity.includes('synthetic_qa_v1') || !identity.includes('platform')) add(blockers, 'build_identity_contract_missing', 'profile/platform binding')

  const profileValidation = scope.indexOf('ShopRuntimeConfiguration.fromEnvironment')
  const scopeValidation = main.indexOf('final runtimeScope = await resolveShopRuntimeScopeForStartup()')
  const firstIo = Math.min(...['SharedPreferences.getInstance', 'getApplicationDocumentsDirectory', 'Supabase.initialize'].map(token => {
    const index = main.indexOf(token)
    return index < 0 ? Number.MAX_SAFE_INTEGER : index
  }))
  if (profileValidation < 0 || scopeValidation < 0 || scopeValidation > firstIo) add(blockers, 'profile_validation_not_first', 'profile and scope must validate before preferences, paths, providers, or I/O')

  const serviceGuards = [
    ['mobile/shop_pos/lib/connected_orders_service.dart', 'connectedOrders', '_client.send('],
    ['mobile/shop_pos/lib/menu_import_service.dart', 'remoteImport', '.post('],
    ['mobile/shop_pos/lib/shop_correction_authorization_service.dart', 'correctionAuthorization', '_client.send('],
    ['mobile/shop_pos/lib/camera_barcode_scanner.dart', 'camera', 'MobileScanner('],
    ['mobile/shop_pos/lib/printer_services.dart', 'networkPrinter', 'Socket.connect'],
    ['mobile/shop_pos/lib/shop_startup.dart', 'externalFileSaving', 'openFile('],
    ['mobile/shop_pos/lib/shop_backup_export_screen.dart', 'externalFileSaving', 'FileSaver.instance.saveAs'],
    ['mobile/shop_pos/lib/shop_operational_export_saver.dart', 'externalFileSaving', 'FileSaver.instance.saveAs'],
  ]
  for (const [path, capability, ioToken] of serviceGuards) {
    const text = codeOnly(sources[path] || '')
    const scopeIndex = text.indexOf('ShopRuntimeScope')
    const capabilityIndex = text.indexOf(capability)
    const ioIndex = text.indexOf(ioToken)
    const guarded = ioIndex < 0 || hasTerminatingGuardBefore(text, capability, ioIndex)
    if (scopeIndex < 0 || capabilityIndex < 0 || !guarded) {
      add(blockers, 'service_boundary_guard_missing', `${path}:${capability}`)
    }
  }

  const guardedPrimitives = [
    ['Supabase.initialize', new Map([['mobile/shop_pos/lib/main.dart', 'managedAuth']])],
    ['ImagePicker(', new Map([['mobile/shop_pos/lib/main.dart', 'camera'], ['mobile/shop_pos/lib/menu_import_screen.dart', 'gallery']])],
    ['MobileScanner(', new Map([['mobile/shop_pos/lib/camera_barcode_scanner.dart', 'camera']])],
    ['http.Client(', new Map([['mobile/shop_pos/lib/connected_orders_service.dart', 'connectedOrders'], ['mobile/shop_pos/lib/menu_import_service.dart', 'remoteImport'], ['mobile/shop_pos/lib/shop_correction_authorization_service.dart', 'correctionAuthorization']])],
    ['PrinterManager(', new Map([['mobile/shop_pos/lib/printer_services.dart', 'networkPrinter']])],
    ['PrinterDiscoveryService()', new Map([['mobile/shop_pos/lib/printer_setup_screen.dart', 'networkPrinter']])],
    ['NetworkInfo(', new Map([['mobile/shop_pos/lib/printer_services.dart', 'networkPrinter']])],
    ['Socket.connect', new Map([['mobile/shop_pos/lib/printer_services.dart', 'networkPrinter']])],
    ['openFile(', new Map([['mobile/shop_pos/lib/shop_startup.dart', 'externalFileSaving']])],
    ['FileSaver.instance.saveAs', new Map([['mobile/shop_pos/lib/shop_backup_export_screen.dart', 'externalFileSaving'], ['mobile/shop_pos/lib/shop_operational_export_saver.dart', 'externalFileSaving']])],
  ]
  for (const [token, allowed] of guardedPrimitives) {
    for (const path of dartPaths) {
      const text = codeOnly(sources[path])
      let cursor = 0
      while ((cursor = text.indexOf(token, cursor)) >= 0) {
        const capability = allowed.get(path)
        if (!capability || !hasTerminatingGuardBefore(text, capability, cursor)) {
          add(blockers, 'dangerous_primitive_not_terminated', `${path}:${token}`)
        }
        cursor += token.length
      }
    }
  }
  const allowedDefines = new Set(['dart.vm.product', 'SHOP_CONNECTED_ORDERS_ENABLED', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SHOP_API_BASE_URL', 'SHOP_RUNTIME_PROFILE', 'SHOP_QA_PROFILE_ID'])
  for (const path of dartPaths) {
    for (const match of sources[path].matchAll(/(?:(?:String|bool|int)\.fromEnvironment|bool\.hasEnvironment)\(\s*['"]([^'"]+)['"]/g)) {
      if (!allowedDefines.has(match[1])) add(fatal, 'unknown_build_define', `${path}:${match[1]}`)
    }
  }

  const strictDirectPaths = new Map([
    ['SharedPreferences.getInstance', new Set(['mobile/shop_pos/lib/shop_runtime_scope.dart'])],
    ['getApplicationDocumentsDirectory', new Set(['mobile/shop_pos/lib/shop_runtime_scope.dart'])],
    ['getApplicationSupportDirectory', new Set(['mobile/shop_pos/lib/shop_runtime_scope.dart'])],
    ['getTemporaryDirectory', new Set(['mobile/shop_pos/lib/shop_runtime_scope.dart'])],
  ])
  for (const [token, allowedPaths] of strictDirectPaths) {
    for (const path of dartPaths) {
      if (occurrences(sources[path], token) > 0 && !allowedPaths.has(path)) add(blockers, 'legacy_direct_io_not_scoped', `${path}:${token}`)
    }
  }

  const databaseFilenamePaths = dartPaths.filter(path => codeOnly(sources[path]).includes('supermega_shop.sqlite'))
  if (databaseFilenamePaths.length !== 1 || databaseFilenamePaths[0] !== 'mobile/shop_pos/lib/shop_database.dart'
    || occurrences(codeOnly(database), 'supermega_shop.sqlite') !== 1
    || !codeOnly(database).includes('privateDatabaseFile')) add(blockers, 'database_filename_seam_invalid', databaseFilenamePaths.join(','))
  for (const key of ['shop_locale_myanmar', 'shop_pending_picker_intent', 'shop_receipt_printer_host_v1', 'shop_receipt_paper_width_v1']) {
    const paths = dartPaths.filter(path => codeOnly(sources[path]).includes(key))
    if (paths.length !== 1 || paths[0] !== 'mobile/shop_pos/lib/shop_runtime_scope.dart') add(blockers, 'preference_key_not_scoped', `${key}:${paths.join(',')}`)
  }

  const generator = sources['tools/generate_shop_build_identity.mjs'] || ''
  const windows = sources['mobile/shop_pos/scripts/configure_windows_qa_runner.ps1'] || ''
  const androidProduction = sources['mobile/shop_pos/android/app/src/production/AndroidManifest.xml'] || ''
  const androidQa = sources['mobile/shop_pos/android/app/src/qa/AndroidManifest.xml'] || ''
  const iosScheme = sources['mobile/shop_pos/ios/Runner.xcodeproj/xcshareddata/xcschemes/qa.xcscheme'] || ''
  const iosConfig = sources['mobile/shop_pos/ios/Flutter/QA.xcconfig'] || ''
  const iosInfo = sources['mobile/shop_pos/ios/Runner/Info.plist'] || ''
  const iosDebug = sources['mobile/shop_pos/ios/Flutter/Debug.xcconfig'] || ''
  const iosRelease = sources['mobile/shop_pos/ios/Flutter/Release.xcconfig'] || ''
  if (!/create\("production"\)/.test(gradle) || !/create\("qa"\)/.test(gradle) || !gradle.includes('verifyShopAndroidProductionIdentity') || !gradle.includes('verifyShopAndroidQaIdentity') || !gradle.includes('preProduction') || !gradle.includes('preQa') || !gradle.includes("shopBuildIdentityProfile = '\$profile'") || !gradle.includes("shopBuildIdentityQaProfileId = '\$qaProfile'") || !gradle.includes("shopBuildIdentityPlatformIdentity = '\$identity'") || !gradle.includes('shop_android_build_identity_mismatch') || !androidProduction.includes('Shop') || !androidQa.includes('Shop QA') || !androidQa.includes('tools:replace="android:label"')) add(blockers, 'android_qa_identity_missing', 'exact production/qa flavors, native generated-identity guard, and manifests')
  const iosQaActions = iosScheme.match(/buildConfiguration="Debug-qa"/g) ?? []
  const iosRunnerProductNames = ios.match(/PRODUCT_NAME = "\$\(TARGET_NAME\)";/g) ?? []
  if (!ios.includes('dev.supermega.supermegaShop.qa') || !ios.includes('Verify Shop build identity') || !ios.includes('shop_ios_build_identity_missing') || !ios.includes("shopBuildIdentityProfile = 'synthetic_qa_v1'") || !ios.includes("shopBuildIdentityQaProfileId = 'synthetic-qa-v1'") || !ios.includes("shopBuildIdentityProfile = 'production'") || !ios.includes("shopBuildIdentityQaProfileId = ''") || !ios.includes('shop_ios_build_configuration_unknown') || iosQaActions.length !== 5 || /buildConfiguration="(?:Debug|Profile|Release)"/.test(iosScheme) || iosRunnerProductNames.length < 6 || !ios.includes('path = Runner.app;') || !iosConfig.includes('dev.supermega.supermegaShop.qa') || iosConfig.includes('PRODUCT_NAME=') || !iosConfig.includes('SHOP_DISPLAY_NAME=Shop QA') || !iosConfig.includes('SHOP_BUNDLE_NAME=Shop QA') || !iosInfo.includes('$(SHOP_DISPLAY_NAME)') || !iosInfo.includes('$(SHOP_BUNDLE_NAME)') || !iosDebug.includes('SHOP_DISPLAY_NAME=Shop') || !iosDebug.includes('SHOP_BUNDLE_NAME=supermega_shop') || !iosRelease.includes('SHOP_DISPLAY_NAME=Shop') || !iosRelease.includes('SHOP_BUNDLE_NAME=supermega_shop')) add(blockers, 'ios_qa_identity_missing', 'Runner.app product, native generated-identity guard, QA bundle identity, and unchanged production display/bundle names')
  if (!generator.includes('synthetic_qa_v1') || !generator.includes('production') || !generator.includes('windows')) add(blockers, 'identity_generator_missing', 'allowlisted platform/profile generator')
  if (!windows.includes('supermega_shop_qa.exe') || !windows.includes('Shop QA')) add(blockers, 'windows_qa_identity_missing', 'QA executable and product identity')
  const workflowBlockers = qaWorkflowBlockers(workflow)
  if (workflowBlockers.length) add(blockers, 'qa_build_contract_missing', workflowBlockers.join(','))
  if (workflowHasProviderValue(workflow)) add(fatal, 'qa_build_provider_value_forbidden', 'provider value in native workflow')

  const strictReady = fatal.length === 0 && blockers.length === 0
  return {
    ok: fatal.length === 0,
    strictReady,
    evidenceLevel: 'source',
    artifactIdentityVerified: false,
    installedIsolationVerified: false,
    launchAuthorized: false,
    fatal,
    blockers,
  }
}

async function collectSources(base = root) {
  const sources = {}
  async function walk(relativeDirectory) {
    const entries = await readdir(resolve(base, relativeDirectory), { withFileTypes: true })
    for (const entry of entries) {
      const path = `${relativeDirectory}/${entry.name}`
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile() && path.endsWith('.dart')) sources[path] = await readFile(resolve(base, path), 'utf8')
    }
  }
  await walk(libRoot)
  for (const path of [...requiredExisting, ...implementationFiles]) {
    if (sources[path] !== undefined) continue
    try { sources[path] = await readFile(resolve(base, path), 'utf8') } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  return sources
}

async function main() {
  const mode = process.argv[2]
  if (!['--audit', '--strict'].includes(mode)) throw new Error('usage: verify_shop_qa_isolation_contract.mjs --audit|--strict')
  const result = assessShopQaIsolationContract({ sources: await collectSources() })
  console.log(JSON.stringify({ contract: 'supermega.shop.qa-isolation.v1', mode: mode.slice(2), ...result }, null, 2))
  if (!result.ok || (mode === '--strict' && !result.strictReady)) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
