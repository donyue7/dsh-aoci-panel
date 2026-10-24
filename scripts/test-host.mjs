/**
 * 宿主半单元测试（node --test）：配置规格化、版本比较、更新检查器与市场索引校验。
 *
 * 这些测试不联网、不碰 DSH 运行时，CI 与本地都能跑：
 *   - 配置：默认值、类型/范围/未知字段的响亮失败；
 *   - 版本：SemVer 比较、预发布排序、更新命令与 profile 解析；
 *   - 更新检查：成功、非 2xx、非法 JSON、关闭开关、TTL 缓存与并发合并；
 *   - 市场：已提交的 market/index.json 通过校验，坏索引会被拒绝。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEFAULT_CONFIG, normalizeConfig } from '../lib/config.js'
import {
  parseVersion,
  compareVersions,
  isNewer,
  updateCommand,
  resolveProfile,
  fetchLatestVersion,
  createUpdateChecker,
} from '../lib/about.js'
import { validateIndex } from './market-index.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('normalizeConfig：空配置等于默认值且是副本', () => {
  const a = normalizeConfig(undefined)
  const b = normalizeConfig(null)
  assert.deepEqual(a, { ...DEFAULT_CONFIG })
  assert.deepEqual(b, { ...DEFAULT_CONFIG })
  a.binDir = 'D:\\other'
  assert.equal(DEFAULT_CONFIG.binDir, 'C:\\aoci\\bin', '不得改到默认值对象')
})

test('normalizeConfig：接受合法覆盖并做规范化', () => {
  const config = normalizeConfig({
    binDir: '  D:\\aoci\\bin  ',
    binPath: 'D:\\aoci\\bin\\aoci.exe',
    cliTimeoutMs: 5000,
    cacheTtlMs: 60000,
    batchLimit: 5,
    locale: 'en-US',
    updateCheck: false,
    registryUrl: 'https://registry.npmmirror.com/',
    updateCheckTimeoutMs: 2000,
    updateCheckTtlMs: 0,
    profile: 'work',
  })
  assert.equal(config.binDir, 'D:\\aoci\\bin')
  assert.equal(config.registryUrl, 'https://registry.npmmirror.com', '去掉尾部斜杠')
  assert.equal(config.updateCheck, false)
  assert.equal(config.locale, 'en-US')
  assert.equal(config.batchLimit, 5)
})

test('normalizeConfig：非法值响亮失败', () => {
  const cases = [
    [{ binDir: 1 }, /binDir 必须是字符串/],
    [{ cliTimeoutMs: 'abc' }, /cliTimeoutMs 必须是数字/],
    [{ cliTimeoutMs: 1.5 }, /必须是整数/],
    [{ cliTimeoutMs: 10 }, /不能小于 1000/],
    [{ cacheTtlMs: -1 }, /不能小于 0/],
    [{ batchLimit: 0 }, /不能小于 1/],
    [{ batchLimit: 1000 }, /不能大于 100/],
    [{ locale: 'fr-FR' }, /locale 只接受/],
    [{ updateCheck: 'yes' }, /必须是 true\/false/],
    [{ registryUrl: 'ftp://example.com' }, /必须使用 http\(s\)/],
    [{ registryUrl: 'https://u:p@example.com' }, /不能包含用户名或密码/],
    [{ registryUrl: 'https://example.com/#x' }, /不能包含 # 片段/],
    [{ binPath: 'aoci.exe' }, /必须是可执行文件的完整路径/],
    [{ typo: true }, /未知字段 typo/],
    ['nope', /config 必须是对象/],
    [[], /config 必须是对象/],
  ]
  for (const [raw, pattern] of cases) {
    assert.throws(() => normalizeConfig(raw), pattern, JSON.stringify(raw))
  }
})

test('parseVersion / compareVersions：SemVer 与预发布排序', () => {
  assert.deepEqual(parseVersion('v1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: '' })
  assert.equal(parseVersion('1.2'), null)
  assert.equal(parseVersion('nope'), null)

  assert.equal(compareVersions('1.2.3', '1.2.3'), 0)
  assert.equal(compareVersions('1.2.3', '1.2.4'), -1)
  assert.equal(compareVersions('2.0.0', '1.9.9'), 1)
  assert.equal(compareVersions('1.0.0-rc.1', '1.0.0'), -1, '预发布低于正式版')
  assert.equal(compareVersions('1.0.0-rc.1', '1.0.0-rc.2'), -1)
  assert.equal(compareVersions('1.0.0-rc.10', '1.0.0-rc.2'), 1, '数字段按数值比较')
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-alpha.1'), -1)
  assert.throws(() => compareVersions('x', '1.0.0'), /非法版本号/)
})

test('isNewer：非法输入不误报', () => {
  assert.equal(isNewer('0.5.0', '0.4.2'), true)
  assert.equal(isNewer('0.4.2', '0.4.2'), false)
  assert.equal(isNewer('0.4.1', '0.4.2'), false)
  assert.equal(isNewer('latest', '0.4.2'), false)
})

test('updateCommand / resolveProfile', () => {
  assert.equal(
    updateCommand({ packageName: 'dsh-aoci-panel', profile: 'desktop' }),
    'dsh plugin --profile desktop add dsh-aoci-panel@latest',
  )
  assert.equal(
    updateCommand({ packageName: 'dsh-aoci-panel', profile: 'work', version: '0.4.2' }),
    'dsh plugin --profile work add dsh-aoci-panel@0.4.2',
  )
  assert.equal(resolveProfile('work', { DSH_PROFILE: 'env' }), 'work')
  assert.equal(resolveProfile('', { DSH_PROFILE: 'env' }), 'env')
  assert.equal(resolveProfile('', {}), 'desktop')
})

test('fetchLatestVersion：成功、非 2xx、非法 JSON、缺版本号', async () => {
  const ok = await fetchLatestVersion({
    fetcher: async (url) => {
      assert.match(url, /^https:\/\/registry\.example\.com\/dsh-aoci-panel\/latest$/)
      return { status: 200, text: JSON.stringify({ version: '0.6.1' }) }
    },
    registryUrl: 'https://registry.example.com/',
  })
  assert.equal(ok, '0.6.1')

  await assert.rejects(
    () => fetchLatestVersion({ fetcher: async () => ({ status: 404, text: '' }) }),
    /HTTP 404/,
  )
  await assert.rejects(
    () => fetchLatestVersion({ fetcher: async () => ({ status: 200, text: '<html>' }) }),
    /不是合法 JSON/,
  )
  await assert.rejects(
    () => fetchLatestVersion({ fetcher: async () => ({ status: 200, text: '{"version":"x"}' }) }),
    /缺少合法的 version/,
  )
})

test('createUpdateChecker：TTL 缓存、force 刷新与并发合并', async () => {
  let calls = 0
  let clock = 1000
  const checker = createUpdateChecker({
    version: '0.5.0',
    registryUrl: 'https://registry.example.com',
    ttlMs: 1000,
    now: () => clock,
    fetcher: async () => {
      calls += 1
      return { status: 200, text: JSON.stringify({ version: '0.6.0' }) }
    },
  })

  const first = await checker.get()
  assert.equal(first.version, '0.5.0')
  assert.equal(first.latest, '0.6.0')
  assert.equal(first.updateAvailable, true)
  assert.equal(calls, 1)

  clock += 500
  await checker.get()
  assert.equal(calls, 1, 'TTL 内复用缓存')

  clock += 600
  await checker.get()
  assert.equal(calls, 2, 'TTL 过期后重新查询')

  const [a, b] = await Promise.all([checker.get(true), checker.get(true)])
  assert.equal(a.latest, b.latest)
  assert.equal(calls, 3, '并发的 force 查询合并为一次')
})

test('createUpdateChecker：失败降级与关闭开关', async () => {
  const failing = createUpdateChecker({
    version: '0.5.0',
    fetcher: async () => {
      throw new Error('ENOTFOUND')
    },
  })
  const failed = await failing.get()
  assert.equal(failed.latest, null)
  assert.equal(failed.updateAvailable, null)
  assert.match(failed.error, /ENOTFOUND/)

  let calls = 0
  const off = createUpdateChecker({
    version: '0.5.0',
    enabled: false,
    fetcher: async () => {
      calls += 1
      return { status: 200, text: '{"version":"9.9.9"}' }
    },
  })
  const skipped = await off.get()
  assert.equal(skipped.enabled, false)
  assert.equal(skipped.latest, null)
  assert.equal(calls, 0, '关闭后不联网')
})

test('market/index.json 通过校验且包含本包', () => {
  const index = JSON.parse(readFileSync(path.join(ROOT, 'market', 'index.json'), 'utf8'))
  assert.deepEqual(validateIndex(index), [])
  const entry = index.plugins.find((plugin) => plugin.name === 'dsh-aoci-panel')
  assert.ok(entry, '索引应包含 dsh-aoci-panel')
  assert.ok(entry.versions.length > 0)
  for (const version of entry.versions) {
    assert.equal(version.source.type, 'npm')
    assert.ok(Number.isInteger(version.publishTimestamp))
  }
})

test('validateIndex：坏索引被拒绝', () => {
  const bad = {
    format: 2,
    title: {},
    plugins: [
      { name: 'x', versions: [{ version: 'nope', publishTimestamp: 0, source: { type: 'git' } }] },
      { name: 'x', versions: [] },
    ],
  }
  const errors = validateIndex(bad)
  assert.ok(errors.some((error) => /format 必须是 1/.test(error)))
  assert.ok(errors.some((error) => /title/.test(error)))
  assert.ok(errors.some((error) => /重复：x/.test(error)))
  assert.ok(errors.some((error) => /非法版本/.test(error)))
  assert.ok(errors.some((error) => /publishTimestamp/.test(error)))
  assert.ok(errors.some((error) => /source\.type 必须是 npm/.test(error)))
  assert.ok(errors.some((error) => /versions 至少一项/.test(error)))
})
