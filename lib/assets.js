/**
 * AOCI 索引资产（aoci.txt / aoci.meta.txt / aoci.code.txt）的纯函数层。
 *
 * 面板的「索引文件」标签页需要把这三个受管文件当作可读可改的资产来管控：
 * 名称白名单、行尾探测、规范化、SHA-256、备份命名与结构校验都在这里，
 * 端点只负责真正的文件读写与缓存失效 —— 因此本文件不碰文件系统，可单测。
 *
 * 校验口径刻意与 `aoci verify` 保持同源：
 *   - 根清单：卷声明必须存在且至少有一个 code 卷；
 *   - 元卷：标签字典（code）必须有，否则标签无法解义；
 *   - 代码卷：复用 lib/cognition.js 的 parseVolume 逐行切分 F/R/A/S。
 * 校验失败会阻止保存；行尾、制表符、未知行等只给警告，交给编辑者判断。
 */

import { createHash } from 'node:crypto'

import { parseVolume } from './cognition.js'

/** 面板可直接管控的三个索引资产（其余 AOCI 资产仍由 CLI / MCP 维护）。 */
export const ASSET_SPECS = [
  {
    name: 'aoci.txt',
    label: '根清单',
    kind: 'root',
    hint: '卷清单与全局不变量（cognition-volumes/v1）',
  },
  {
    name: 'aoci.meta.txt',
    label: '元卷',
    kind: 'meta',
    hint: '标签字典与作者化合同（meta-v1）',
  },
  {
    name: 'aoci.code.txt',
    label: '代码卷',
    kind: 'code',
    hint: '对象认知条目 F/R/A/S（object-fras-v2）',
  },
]

export const ASSET_NAMES = ASSET_SPECS.map((spec) => spec.name)

/** 单文件正文上限：低于 HTTP 请求体上限（256 KiB），留出 JSON/转义余量。 */
export const ASSET_LIMIT = 200 * 1024

/** 备份文件放在 .aoci/ 下：该目录的 .gitignore 默认忽略一切运行时产物。 */
export const BACKUP_DIR = '.aoci'

export function assetSpec(name) {
  const key = String(name == null ? '' : name)
  return ASSET_SPECS.filter((spec) => spec.name === key)[0] || null
}

export function isAssetName(name) {
  return assetSpec(name) !== null
}

/** 文本的 SHA-256（十六进制，UTF-8）；用于保存时的 CAS 与界面展示。 */
export function sha256Hex(text) {
  return createHash('sha256').update(String(text == null ? '' : text), 'utf8').digest('hex')
}

/** 行尾风格；编辑统一写 LF（AOCI 基线按原始字节比对，CRLF 会整树漂移）。 */
export function detectEol(text) {
  return String(text == null ? '' : text).indexOf('\r\n') >= 0 ? 'crlf' : 'lf'
}

/** 统一成 LF（编辑器里手粘的 CRLF 不应把整棵索引改成 CRLF）。 */
export function toLf(text) {
  return String(text == null ? '' : text).replace(/\r\n?/g, '\n')
}

/** 行数：末尾换行不额外算一行。 */
export function countLines(text) {
  const value = String(text == null ? '' : text)
  if (value === '') return 0
  const parts = value.split(/\r?\n/)
  return value.endsWith('\n') ? parts.length - 1 : parts.length
}

/** 保存前补齐末尾换行，避免两次保存产生无意义 diff。 */
export function ensureTrailingNewline(text) {
  const value = String(text == null ? '' : text)
  if (value === '') return value
  return value.endsWith('\n') ? value : value + '\n'
}

/** 备份文件名的时间戳：YYYYMMDD-HHmmss（UTC，与安装脚本备份风格一致）。 */
export function backupStamp(date) {
  const value = date instanceof Date ? date : new Date()
  return value
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .slice(0, 15)
}

export function backupFileName(name, stamp) {
  return name + '.' + backupStamp(stamp) + '.bak'
}

const VOLUME_LINE = /^#Volume:\s*(.+)$/
const TAG_LINE = /^#\[Tag dictionary:\s*([A-Za-z0-9_-]+)\s*\]$/
const ENTRY_LINE = /^(.+?)\[([^\]]*)\]:\s*(.*)$/
const TAG_SHAPE = /^[A-Z]{2}[1-9][A-Z]{1,2}$/
const TAG_SCALES = 'LMST'

function clip(list, limit) {
  return list.length > limit ? list.slice(0, limit) : list
}

function parseVolumeDeclarations(text) {
  const volumes = []
  const errors = []
  const warnings = []
  for (const line of text.split('\n')) {
    const match = VOLUME_LINE.exec(line.trim())
    if (!match) continue
    const fields = {}
    for (const part of match[1].split(/\s+/)) {
      const at = part.indexOf('=')
      if (at <= 0) continue
      fields[part.slice(0, at).trim()] = part.slice(at + 1).trim()
    }
    if (!fields.id) {
      errors.push('存在缺少 id 的 #Volume 声明：' + line.trim())
      continue
    }
    if (!fields.kind) warnings.push('#Volume ' + fields.id + ' 缺少 kind')
    if (!fields.path) warnings.push('#Volume ' + fields.id + ' 缺少 path')
    volumes.push(fields)
  }
  return { volumes, errors, warnings }
}

function validateRoot(text, stats) {
  const errors = []
  const warnings = []
  const head = text.split('\n').filter((line) => line.trim() !== '')[0] || ''
  if (!/^#AOCI-ROOT-MANIFEST:/.test(head)) {
    errors.push('首行必须是 #AOCI-ROOT-MANIFEST: 1')
  }
  const version = /^#Format-Version:\s*(.+)$/m.exec(text)
  if (!version) {
    warnings.push('缺少 #Format-Version；当前面板按 cognition-volumes/v1 解析')
  } else if (version[1].trim() !== 'cognition-volumes/v1') {
    errors.push('不支持的 Format-Version：' + version[1].trim() + '（面板只解析 cognition-volumes/v1）')
  }
  const parsed = parseVolumeDeclarations(text)
  errors.push.apply(errors, parsed.errors)
  warnings.push.apply(warnings, parsed.warnings)
  stats.volumes = parsed.volumes.length
  const codeVolumes = parsed.volumes.filter((item) => item.kind === 'code')
  if (codeVolumes.length === 0) {
    errors.push('缺少 kind=code 的卷声明：面板依赖代码卷展示与校验认知条目')
  }
  for (const volume of codeVolumes) {
    if (volume.path && volume.path !== 'aoci.code.txt') {
      warnings.push('代码卷 path=' + volume.path + '，面板的「索引文件」编辑器只直接编辑 aoci.code.txt')
    }
  }
  const seen = {}
  for (const volume of parsed.volumes) {
    if (seen[volume.id]) warnings.push('卷 id 重复：' + volume.id)
    seen[volume.id] = true
  }
  if (parsed.volumes.length === 0) warnings.push('没有任何 #Volume 声明')
  return { errors, warnings }
}

function validateMeta(text, stats) {
  const errors = []
  const warnings = []
  const head = text.split('\n').filter((line) => line.trim() !== '')[0] || ''
  if (!/^#AOCI-META-VOLUME:/.test(head)) {
    errors.push('首行必须是 #AOCI-META-VOLUME: 1')
  }
  const dictionaries = []
  let uncommented = 0
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const match = TAG_LINE.exec(trimmed)
    if (match) dictionaries.push(match[1])
    if (trimmed.charAt(0) !== '#') uncommented += 1
  }
  stats.dictionaries = dictionaries.length
  if (dictionaries.length === 0) {
    errors.push('缺少 #[Tag dictionary: code]：没有字典标签无法解义')
  } else if (dictionaries.indexOf('code') < 0) {
    errors.push('标签字典缺少 code 域：面板按 code 字典解义条目标签')
  }
  if (!/^#A Layer:/m.test(text)) warnings.push('字典缺少 #A Layer 行：标签 A 位将无法解义')
  if (!/^#C Importance:/m.test(text)) warnings.push('字典缺少 #C Importance 行：标签重要度无法解义')
  if (uncommented > 0) warnings.push('元卷出现 ' + uncommented + ' 行非注释内容；元卷只应有 # 注释')
  return { errors, warnings }
}

function validateCode(text, stats, repoRoot) {
  const errors = []
  const warnings = []
  const entries = parseVolume(text, repoRoot || '')
  stats.entries = entries.length
  stats.dirs = {}
  let unknownLines = 0
  let lineNo = 0
  for (const line of text.split('\n')) {
    lineNo += 1
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.charAt(0) === '#') continue
    if (trimmed.indexOf('===') === 0) continue
    const head = ENTRY_LINE.exec(trimmed)
    if (!head) {
      unknownLines += 1
      if (unknownLines <= 5) warnings.push('第 ' + lineNo + ' 行无法解析为条目：' + trimmed.slice(0, 60))
      continue
    }
    const label = head[1].trim()
    const tag = head[2].trim()
    if (!TAG_SHAPE.test(tag) || TAG_SCALES.indexOf(tag.charAt(tag.length - 1)) < 0) {
      if (warnings.length < 20) warnings.push('标签格式可疑（应为 A+B+C+[D]+E）：' + label + '[' + tag + ']')
    }
  }
  if (unknownLines > 5) warnings.push('另有 ' + (unknownLines - 5) + ' 行无法解析为条目')
  const seenIds = {}
  for (const entry of entries) {
    if (seenIds[entry.id] && warnings.length < 20) warnings.push('条目 id 重复：' + entry.id)
    seenIds[entry.id] = true
  }
  for (const entry of entries) {
    if (!entry.f || entry.f === '-') warnings.push('条目缺少 F 描述：' + entry.name)
    if (warnings.length >= 30) break
  }
  if (entries.length === 0) errors.push('代码卷没有任何可解析条目')
  const dirs = {}
  for (const entry of entries) {
    const key = entry.dir || '(根)'
    dirs[key] = (dirs[key] || 0) + 1
  }
  stats.dirs = dirs
  return { errors, warnings }
}

/**
 * 校验一个索引资产。
 *
 * @param {string} name 资产名（必须命中 ASSET_SPECS）
 * @param {string} raw 文件正文
 * @returns {{ok:boolean, errors:string[], warnings:string[], stats:object}}
 */
export function validateAsset(name, raw, options) {
  const spec = assetSpec(name)
  if (!spec) {
    return { ok: false, errors: ['未知索引资产：' + String(name)], warnings: [], stats: {} }
  }
  const repoRoot = options && options.repoRoot ? String(options.repoRoot) : ''
  const original = String(raw == null ? '' : raw)
  const text = toLf(original)
  const stats = {
    bytes: Buffer.byteLength(text, 'utf8'),
    lines: countLines(text),
    eol: detectEol(original),
    trailingNewline: text === '' ? false : text.endsWith('\n'),
    entries: 0,
    volumes: 0,
    dictionaries: 0,
    dirs: {},
  }
  const errors = []
  const warnings = []

  if (text.trim() === '') {
    return { ok: false, errors: ['内容为空'], warnings, stats }
  }
  if (stats.bytes > ASSET_LIMIT) {
    errors.push('正文 ' + stats.bytes + ' 字节，超过单文件上限 ' + ASSET_LIMIT + ' 字节')
  }
  if (stats.eol === 'crlf') {
    warnings.push('检测到 CRLF 行尾；保存时会统一为 LF（AOCI 基线按原始字节比对）')
  }
  if (/\t/.test(text)) {
    warnings.push('含制表符缩进；AOCI 资产惯例使用空格，避免解析歧义')
  }
  if (!stats.trailingNewline) {
    warnings.push('缺少末尾换行；保存时会自动补齐')
  }

  let detail = { errors: [], warnings: [] }
  if (spec.kind === 'root') detail = validateRoot(text, stats)
  else if (spec.kind === 'meta') detail = validateMeta(text, stats)
  else detail = validateCode(text, stats, repoRoot)

  errors.push.apply(errors, detail.errors)
  warnings.push.apply(warnings, detail.warnings)
  return {
    ok: errors.length === 0,
    errors: clip(errors, 12),
    warnings: clip(warnings, 30),
    stats,
  }
}
