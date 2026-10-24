#!/usr/bin/env node
/**
 * dsh-aoci-panel 自检门（跨平台版）：语法 / 交付清单 / 契约一致性 / 行尾 /
 * 显示资源 / AOCI 基线漂移。
 *
 * 替代原先只支持 Windows 的 scripts/check.ps1；两者行为一致，pwsh 版本只是
 * 调用本脚本的薄封装。零依赖：只用 Node 内置模块，不需要 aoci CLI。
 *
 * 退出码：0 = 没有 FAIL；1 = 有 FAIL。
 *
 * 用法：
 *   node scripts/check.mjs
 *   node scripts/check.mjs --require-aoci-aligned
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const requireAligned = args.includes('--require-aoci-aligned')
const rootArg = args.includes('--root') ? args[args.indexOf('--root') + 1] : ''
const ROOT = path.resolve(rootArg || path.join(SCRIPT_DIR, '..'))

const results = []
function add(level, name, detail) {
  results.push({ level, name, detail: detail || '' })
  const line = `[${level.toLowerCase()}] ${name}${detail ? ' — ' + detail : ''}`
  console.log(line)
}

async function test(name, body) {
  try {
    const out = await body()
    if (out && typeof out === 'object' && out.level) add(out.level, name, out.detail)
    else add('PASS', name, typeof out === 'string' ? out : '')
  } catch (error) {
    add('FAIL', name, String((error && error.message) || error).replace(/\s+/g, ' ').trim())
  }
}

const toPosix = (value) => value.replace(/\\/g, '/').replace(/^\.\//, '')

/** 递归列出目录下的文件（posix 相对路径）。 */
function walk(dir, base, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) walk(full, rel, out)
    else if (entry.isFile()) out.push(rel)
  }
  return out
}

let allFilesCache = null
function allFiles() {
  if (!allFilesCache) allFilesCache = walk(ROOT, '', [])
  return allFilesCache
}

function globToRegExp(pattern) {
  let out = '^'
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i]
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*'
        i += 1
        if (pattern[i + 1] === '/') i += 1
      } else out += '[^/]*'
    } else if (ch === '?') out += '[^/]'
    else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(out + '$')
}

/**
 * 把 package.json 的 files 条目展开成实际交付文件。
 * 支持目录、单文件与 `*` / `**` 通配（npm 的 files 语义）。
 */
function expandFiles(entries) {
  const out = new Set()
  for (const raw of entries) {
    if (!raw) continue
    const entry = toPosix(String(raw)).replace(/\/+$/, '')
    const full = path.join(ROOT, entry)
    if (!entry.includes('*')) {
      if (!existsSync(full)) continue
      if (statSync(full).isDirectory()) {
        for (const file of allFiles()) if (file.startsWith(entry + '/')) out.add(file)
      } else out.add(entry)
      continue
    }
    const re = globToRegExp(entry)
    for (const file of allFiles()) if (re.test(file)) out.add(file)
  }
  return out
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** 收集 exports 里的所有目标路径。 */
function exportTargets(node, out = []) {
  if (typeof node === 'string') out.push(node)
  else if (Array.isArray(node)) for (const item of node) exportTargets(item, out)
  else if (node && typeof node === 'object') for (const value of Object.values(node)) exportTargets(value, out)
  return out
}

const manifestPath = path.join(ROOT, 'package.json')
if (!existsSync(manifestPath)) {
  console.log(`[fail] 找不到 ${manifestPath}`)
  process.exit(1)
}

const manifest = readJson(manifestPath)
const shipped = expandFiles(Array.isArray(manifest.files) ? manifest.files : [])
shipped.add('package.json')
const shippedList = [...shipped].sort()
const shippedSet = new Set(shippedList)
const jsShipped = shippedList.filter((file) => file.endsWith('.js'))

console.log(`dsh-aoci-panel 自检 — ${ROOT}`)
console.log('')

await test('契约字段齐全（宿主半 / 浏览器半 / 补丁层 / 显示资源 / 引擎）', () => {
  const missing = []
  if (!manifest.name) missing.push('name')
  if (!manifest.version) missing.push('version')
  if (!manifest.main) missing.push('main（宿主半入口）')
  if (!manifest.exports) missing.push('exports（浏览器半入口）')
  else {
    if (!manifest.exports['./client']) missing.push('exports["./client"]（浏览器半）')
    if (!manifest.exports['./locale/*.json']) missing.push('exports["./locale/*.json"]（显示元数据）')
    if (!manifest.exports['./icon']) missing.push('exports["./icon"]（图标）')
  }
  if (!manifest.engines || !manifest.engines.dsh) missing.push('engines.dsh（DSH 兼容范围）')
  if (!manifest.dsh) missing.push('dsh')
  else {
    if (!manifest.dsh.bundle || !manifest.dsh.bundle.patch) missing.push('dsh.bundle.patch（bundle 补丁层）')
    if (!manifest.dsh.client) missing.push('dsh.client（浏览器半声明）')
    else {
      if (manifest.dsh.client.platform !== 'web') missing.push('dsh.client.platform 必须是 web')
      if (!Array.isArray(manifest.dsh.client.inject) || manifest.dsh.client.inject.length === 0) {
        missing.push('dsh.client.inject（插槽所属模块）')
      }
    }
  }
  if (missing.length > 0) throw new Error('缺：' + missing.join('、'))
  return `${manifest.name}@${manifest.version}（dsh ${manifest.engines.dsh}）`
})

await test('files 清单里的路径都存在', () => {
  const missing = []
  for (const entry of Array.isArray(manifest.files) ? manifest.files : []) {
    if (!entry) continue
    const raw = toPosix(String(entry)).replace(/\/+$/, '')
    if (raw.includes('*')) {
      const re = globToRegExp(raw)
      if (!allFiles().some((file) => re.test(file))) missing.push(entry)
      continue
    }
    if (!existsSync(path.join(ROOT, raw))) missing.push(entry)
  }
  if (missing.length > 0) throw new Error('找不到：' + missing.join('、'))
  return (manifest.files || []).join(', ')
})

await test('入口点都在交付内容里', () => {
  const entryPoints = new Set()
  if (manifest.main) entryPoints.add(toPosix(manifest.main))
  for (const target of exportTargets(manifest.exports)) {
    const normalized = toPosix(target)
    if (!normalized.includes('*')) entryPoints.add(normalized)
  }
  const patch = manifest.dsh && manifest.dsh.bundle ? manifest.dsh.bundle.patch : ''
  for (const item of Array.isArray(patch) ? patch : [patch]) if (item) entryPoints.add(toPosix(item))

  const missing = []
  for (const point of entryPoints) {
    if (!shippedSet.has(point)) missing.push(point)
  }
  // 带通配的 exports（如 ./locale/*.json）至少要命中一个交付文件。
  for (const target of exportTargets(manifest.exports)) {
    const normalized = toPosix(target)
    if (!normalized.includes('*')) continue
    const re = globToRegExp(normalized)
    if (!shippedList.some((file) => re.test(file))) missing.push(normalized)
  }
  if (missing.length > 0) {
    throw new Error('未随包发布：' + missing.join('、') + '（检查 package.json 的 files）')
  }
  return [...entryPoints].join(', ')
})

await test('JS 的相对 import 都在交付内容里', () => {
  const problems = []
  const pattern = /(?:from|import|require)\s*\(?\s*['"](\.[^'"\r\n]+)['"]/g
  for (const file of jsShipped) {
    const full = path.join(ROOT, file)
    const text = readFileSync(full, 'utf8')
    for (const match of text.matchAll(pattern)) {
      const specifier = match[1]
      const resolved = path.resolve(path.dirname(full), specifier)
      const rel = toPosix(path.relative(ROOT, resolved))
      if (!existsSync(resolved) && !existsSync(resolved + '.js')) {
        problems.push(`${file} 引用了不存在的 ${specifier}`)
      } else if (!shippedSet.has(rel) && !shippedSet.has(rel + '.js')) {
        problems.push(`${file} 引用了未随包发布的 ${specifier}`)
      }
    }
  }
  if (problems.length > 0) throw new Error(problems.join('；'))
  return `${jsShipped.length} 个 JS 文件`
})

await test('cordis.patch.yml 的 id/name 等于包名', () => {
  const patchPath = path.join(ROOT, 'cordis.patch.yml')
  if (!existsSync(patchPath)) throw new Error('找不到 cordis.patch.yml')
  const text = readFileSync(patchPath, 'utf8')
  const ids = [...text.matchAll(/^\s*-?\s*id:\s*(\S+)/gm)].map((m) => m[1].replace(/['"]/g, ''))
  const names = [...text.matchAll(/^\s*name:\s*(\S+)/gm)].map((m) => m[1].replace(/['"]/g, ''))
  if (!ids.includes(manifest.name)) throw new Error(`缺 id: ${manifest.name}（现有：${ids.join(', ')}）`)
  if (!names.includes(manifest.name)) throw new Error(`缺 name: ${manifest.name}（现有：${names.join(', ')}）`)
  return `id/name = ${manifest.name}`
})

await test('显示元数据（locale）完整', () => {
  const locales = shippedList.filter((file) => /^locale\/[^/]+\.json$/.test(file))
  if (!locales.includes('locale/en.json')) throw new Error('缺少 locale/en.json（DSH 要求 en 回退）')
  const problems = []
  for (const file of locales) {
    let parsed
    try {
      parsed = readJson(path.join(ROOT, file))
    } catch (error) {
      problems.push(`${file} 不是合法 JSON`)
      continue
    }
    const meta = parsed && parsed.meta
    if (!meta || typeof meta.title !== 'string' || meta.title.trim() === '') problems.push(`${file} 缺 meta.title`)
    if (!meta || typeof meta.description !== 'string' || meta.description.trim() === '') {
      problems.push(`${file} 缺 meta.description`)
    }
  }
  if (problems.length > 0) throw new Error(problems.join('；'))
  return locales.join(', ')
})

await test('图标是有效且未超限的图片', () => {
  const icon = shippedList.find((file) => file === 'icon.svg' || file === 'icon.png' || file === 'icon.webp' || file === 'icon.jpg')
  if (!icon) throw new Error('缺少 icon.svg（或 icon.png / icon.webp / icon.jpg）')
  const full = path.join(ROOT, icon)
  const bytes = readFileSync(full)
  const max = 256 * 1024
  if (bytes.length > max) throw new Error(`${icon} 超过 256 KiB（${bytes.length} 字节）`)
  const head = bytes.subarray(0, 512).toString('utf8')
  if (icon.endsWith('.svg')) {
    if (!/<svg[\s>]/i.test(head)) throw new Error(`${icon} 不是可识别的 SVG`)
  } else if (icon.endsWith('.png')) {
    if (!bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      throw new Error(`${icon} 不是合法 PNG`)
    }
  } else if (icon.endsWith('.webp')) {
    if (head.slice(0, 4) !== 'RIFF' || head.slice(8, 12) !== 'WEBP') throw new Error(`${icon} 不是合法 WebP`)
  } else if (icon.endsWith('.jpg')) {
    if (!bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) throw new Error(`${icon} 不是合法 JPEG`)
  }
  return `${icon}（${bytes.length} 字节）`
})

await test('交付文件是 LF 行尾', () => {
  const crlf = []
  for (const file of shippedList) {
    const bytes = readFileSync(path.join(ROOT, file))
    if (bytes.includes(13)) crlf.push(file)
  }
  if (crlf.length > 0) throw new Error('含 CR：' + crlf.join('、') + '（.gitattributes 强制 LF，CRLF 会污染 AOCI 基线）')
  return `${shippedList.length} 个文件`
})

await test('node --check 语法', () => {
  const failures = []
  for (const file of jsShipped) {
    const out = spawnSync(process.execPath, ['--check', path.join(ROOT, file)], { encoding: 'utf8' })
    if (out.status !== 0) failures.push(`${file}: ${(out.stderr || '').trim()}`)
  }
  if (failures.length > 0) throw new Error(failures.join('；'))
  return `${jsShipped.length} 个文件（${process.version}）`
})

await test('market/index.json 与当前版本一致', () => {
  const marketPath = path.join(ROOT, 'market', 'index.json')
  if (!existsSync(marketPath)) return { level: 'WARN', detail: '没有 market/index.json（运行 npm run market 生成）' }
  const index = readJson(marketPath)
  if (index.format !== 1) throw new Error('format 必须是 1')
  const entry = (index.plugins || []).find((plugin) => plugin.name === manifest.name)
  if (!entry) throw new Error(`索引里没有 ${manifest.name}`)
  const versions = (entry.versions || []).map((item) => item.version)
  if (!versions.includes(manifest.version)) {
    return { level: 'WARN', detail: `索引尚未包含当前版本 ${manifest.version}（发布后运行 npm run market）` }
  }
  return `${manifest.name}@${manifest.version}（${versions.length} 个版本）`
})

function findAociBin() {
  const candidates = []
  if (process.env.AOCI_BIN) candidates.push(process.env.AOCI_BIN)
  if (process.platform === 'win32') {
    candidates.push('C:\\aoci\\bin\\aoci-rc19.exe', 'C:\\aoci\\bin\\aoci.exe')
  } else {
    candidates.push('/usr/local/bin/aoci', '/opt/aoci/bin/aoci')
  }
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['aoci'], { encoding: 'utf8' })
  if (which.status === 0) {
    const first = String(which.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0]
    if (first) return first
  }
  return ''
}

function baselineDrift() {
  const baselinePath = path.join(ROOT, '.aoci', 'baseline.json')
  if (!existsSync(baselinePath)) return { changed: [], missing: [], absent: true }
  const baseline = readJson(baselinePath)
  const changed = []
  const missing = []
  for (const [file, info] of Object.entries(baseline.files || {})) {
    const full = path.join(ROOT, file)
    if (!existsSync(full)) {
      missing.push(file)
      continue
    }
    const hash = createHash('sha256').update(readFileSync(full)).digest('hex')
    if (info && info.sha256 && hash !== info.sha256) changed.push(file)
  }
  return { changed, missing, absent: false }
}

await test('AOCI 基线漂移', () => {
  const bin = findAociBin()
  if (bin) {
    const out = spawnSync(bin, ['check', '--json'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 })
    let parsed = null
    try {
      parsed = JSON.parse(String(out.stdout || ''))
    } catch (error) {
      parsed = null
    }
    if (parsed && parsed.governance) {
      if (parsed.governance.governance_aligned) return `与治理一致（${path.basename(bin)} aligned）`
      const drift = parsed.governance.code_drift || {}
      const parts = []
      for (const [key, label] of [
        ['missing', '缺'],
        ['orphan', '孤儿'],
        ['stale', '已改'],
        ['unbaselined', '未入基线'],
      ]) {
        const list = Array.isArray(drift[key]) ? drift[key] : []
        if (list.length > 0) parts.push(`${label}：${list.join('、')}`)
      }
      if (parts.length === 0) parts.push(`findings=${(parsed.findings || []).length}`)
      const detail = parts.join('；') + '；收尾时需按 AOCI Guide 维护认知'
      return { level: requireAligned ? 'FAIL' : 'WARN', detail }
    }
  }

  const drift = baselineDrift()
  if (drift.absent) return { level: 'WARN', detail: '没有 .aoci/baseline.json，跳过' }
  if (drift.changed.length === 0 && drift.missing.length === 0) return '与基线一致'
  const detail = []
  if (drift.changed.length > 0) detail.push('已改：' + drift.changed.join('、'))
  if (drift.missing.length > 0) detail.push('已删：' + drift.missing.join('、'))
  detail.push('收尾时需按 AOCI Guide 维护认知')
  return { level: requireAligned ? 'FAIL' : 'WARN', detail: detail.join('；') }
})

const failed = results.filter((item) => item.level === 'FAIL').length
const warned = results.filter((item) => item.level === 'WARN').length
const passed = results.filter((item) => item.level === 'PASS').length

console.log('')
console.log(`通过 ${passed}，警告 ${warned}，失败 ${failed}`)
process.exit(failed > 0 ? 1 : 0)
