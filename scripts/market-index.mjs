#!/usr/bin/env node
/**
 * 生成 DSH 插件市场索引（market/index.json）。
 *
 * 索引里的版本、发布时间与 engines.dsh 全部来自 npm registry，因此不会与
 * 实际发布内容漂移；图标放在 market/icons/ 下，与索引一起静态托管即可。
 *
 * 用法：
 *   node scripts/market-index.mjs                 # 生成/更新 market/index.json
 *   node scripts/market-index.mjs --check         # 只校验已提交的索引
 *   node scripts/market-index.mjs --registry https://registry.npmmirror.com
 *
 * 需要代理时：Windows 下先 `$env:NODE_USE_ENV_PROXY=1` 并设置 HTTPS_PROXY
 * （Node 24+ 才读取环境代理），或让 CI 直接访问 registry。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareVersions } from '../lib/about.js'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(SCRIPT_DIR, '..')
const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const valueOf = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)

const REGISTRY = String(valueOf('--registry', 'https://registry.npmjs.org')).replace(/\/+$/, '')
const OUT = path.resolve(ROOT, valueOf('--out', 'market/index.json'))
const ICON_SOURCE = path.join(ROOT, 'icon.svg')
const ICON_TARGET = path.join(path.dirname(OUT), 'icons', 'aoci.svg')

const PLUGIN = {
  name: 'dsh-aoci-panel',
  title: { en: 'AOCI Cognition Panel', zh: 'AOCI 认知面板' },
  description: {
    en: 'AOCI cognition, governance and MCP binding for every workspace, plus guided initialization for projects without an index.',
    zh: '按工作区查看 AOCI 认知、治理事实与 MCP 绑定，并为尚未建立索引的项目提供引导式初始化。',
  },
  author: 'donyue7',
  homepage: 'https://github.com/donyue7/dsh-aoci-panel',
  repository: { url: 'https://github.com/donyue7/dsh-aoci-panel' },
  icon: 'icons/aoci.svg',
  metadata: { category: 'aoci', labels: ['cognition', 'governance', 'workspace'] },
}

function fail(message) {
  console.error(`[market] ${message}`)
  process.exit(1)
}

function isSemver(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(String(value || ''))
}

/** 校验索引格式；返回错误列表（空数组表示通过）。 */
export function validateIndex(index) {
  const errors = []
  if (!index || typeof index !== 'object') return ['索引必须是 JSON 对象']
  if (index.format !== 1) errors.push('format 必须是 1')
  if (!index.title || typeof index.title !== 'object' || typeof index.title.en !== 'string') {
    errors.push('title 必须是含 en 的 LocalizedText')
  }
  if (!Array.isArray(index.plugins) || index.plugins.length === 0) errors.push('plugins 必须是非空数组')
  const names = new Set()
  for (const plugin of index.plugins || []) {
    if (!plugin || typeof plugin.name !== 'string') {
      errors.push('plugin.name 必填')
      continue
    }
    if (names.has(plugin.name)) errors.push(`plugin.name 重复：${plugin.name}`)
    names.add(plugin.name)
    if (plugin.icon && typeof plugin.icon !== 'string') errors.push(`${plugin.name}: icon 必须是字符串`)
    if (!Array.isArray(plugin.versions) || plugin.versions.length === 0) {
      errors.push(`${plugin.name}: versions 至少一项`)
      continue
    }
    const seen = new Set()
    for (const version of plugin.versions) {
      if (!version || !isSemver(version.version)) {
        errors.push(`${plugin.name}: 非法版本 ${JSON.stringify(version && version.version)}`)
      } else {
        if (seen.has(version.version)) errors.push(`${plugin.name}: 版本重复 ${version.version}`)
        seen.add(version.version)
      }
      if (!version) continue
      if (!Number.isInteger(version.publishTimestamp) || version.publishTimestamp <= 0) {
        errors.push(`${plugin.name}@${version.version}: publishTimestamp 必须是正整数（Unix 秒）`)
      }
      const source = version.source || {}
      if (source.type !== 'npm') errors.push(`${plugin.name}@${version.version}: source.type 必须是 npm`)
      if (source.registry !== undefined && typeof source.registry !== 'string') {
        errors.push(`${plugin.name}@${version.version}: source.registry 必须是字符串`)
      }
      if (version.engines !== undefined) {
        if (!version.engines || typeof version.engines.dsh !== 'string') {
          errors.push(`${plugin.name}@${version.version}: engines.dsh 必须是字符串`)
        }
      }
    }
  }
  return errors
}

function validateLocalAssets(index) {
  const errors = []
  const base = path.dirname(OUT)
  for (const plugin of index.plugins || []) {
    if (!plugin.icon || /^(?:[a-z]+:)?\/\//i.test(plugin.icon) || plugin.icon.startsWith('data:')) continue
    const iconPath = path.resolve(base, plugin.icon)
    if (!existsSync(iconPath)) errors.push(`图标不存在：${plugin.icon}`)
    else if (readFileSync(iconPath).length > 256 * 1024) errors.push(`图标超过 256 KiB：${plugin.icon}`)
  }
  return errors
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' }, redirect: 'follow' })
  if (!response.ok) throw new Error(`${url} 返回 HTTP ${response.status}`)
  return await response.json()
}

async function generate() {
  const doc = await fetchJson(`${REGISTRY}/${encodeURIComponent(PLUGIN.name)}`)
  const versions = []
  for (const [version, manifest] of Object.entries(doc.versions || {})) {
    if (!isSemver(version)) continue
    if (manifest.deprecated) continue
    if (!manifest.dsh || !manifest.dsh.bundle) continue
    const published = Date.parse((doc.time || {})[version] || '')
    if (!Number.isFinite(published)) continue
    const entry = {
      version,
      publishTimestamp: Math.floor(published / 1000),
      source: { type: 'npm' },
    }
    if (manifest.engines && typeof manifest.engines.dsh === 'string') {
      entry.engines = { dsh: manifest.engines.dsh }
    }
    versions.push(entry)
  }
  if (versions.length === 0) fail(`registry 上没有可用的 ${PLUGIN.name} 版本`)
  versions.sort((a, b) => compareVersions(b.version, a.version))

  const index = {
    format: 1,
    title: { en: 'AOCI plugins', zh: 'AOCI 插件' },
    description: {
      en: 'Plugins that bring AOCI repository cognition into DeepSeek Harness.',
      zh: '把 AOCI 仓库认知带进 DeepSeek Harness 的插件。',
    },
    metadata: {
      categories: { aoci: { title: { en: 'AOCI', zh: 'AOCI 认知' } } },
      labels: {
        cognition: { title: { en: 'Cognition', zh: '认知' } },
        governance: { title: { en: 'Governance', zh: '治理' } },
        workspace: { title: { en: 'Workspace', zh: '工作区' } },
      },
    },
    plugins: [{ ...PLUGIN, versions }],
  }

  const errors = validateIndex(index)
  if (errors.length > 0) fail('生成的索引不合法：\n  ' + errors.join('\n  '))

  mkdirSync(path.dirname(OUT), { recursive: true })
  mkdirSync(path.dirname(ICON_TARGET), { recursive: true })
  if (existsSync(ICON_SOURCE) && ICON_SOURCE !== ICON_TARGET) copyFileSync(ICON_SOURCE, ICON_TARGET)
  writeFileSync(OUT, JSON.stringify(index, null, 2) + '\n', 'utf8')
  console.log(`[market] 写入 ${path.relative(ROOT, OUT)}：${PLUGIN.name} ${versions.length} 个版本（最新 ${versions[0].version}）`)
  console.log(`[market] 图标 ${path.relative(ROOT, ICON_TARGET)}`)
}

function check() {
  if (!existsSync(OUT)) fail(`找不到 ${OUT}，先运行 node scripts/market-index.mjs`)
  let index
  try {
    index = JSON.parse(readFileSync(OUT, 'utf8'))
  } catch (error) {
    fail(`${OUT} 不是合法 JSON：${error.message}`)
  }
  const errors = validateIndex(index).concat(validateLocalAssets(index))
  if (errors.length > 0) fail('索引校验失败：\n  ' + errors.join('\n  '))
  const entry = index.plugins.find((plugin) => plugin.name === PLUGIN.name)
  console.log(`[market] 校验通过：${entry.versions.length} 个版本，最新 ${entry.versions[0].version}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (flag('--check')) check()
  else {
    generate().catch((error) => fail(error && error.message ? error.message : String(error)))
  }
}
