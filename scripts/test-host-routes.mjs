/**
 * 宿主半端点测试（node --test）：用假 ctx 装载 apply()，直接调用
 * `/aoci-panel/assets` 与 `/aoci-panel/assets/restore` 的处理器。
 *
 * 覆盖：路由注册、三资产读取与校验、CAS 冲突、结构校验拒绝、备份落盘、
 * CRLF 归一、备份恢复、备份名穿越拒绝、未初始化仓库。
 *
 * 全程只在 os.tmpdir() 下操作临时仓库：不联网、不碰真实 DSH 运行时、
 * 不碰仓库自己的索引文件。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs'
import { Readable } from 'node:stream'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { apply } from '../lib/index.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSET_NAMES = ['aoci.txt', 'aoci.meta.txt', 'aoci.code.txt']

/** 造一个只含三个索引资产的临时仓库（.aoci 预先建好，模拟 aoci init 之后的状态）。 */
function makeRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aoci-panel-assets-'))
  mkdirSync(path.join(dir, '.aoci'), { recursive: true })
  for (const name of ASSET_NAMES) {
    writeFileSync(path.join(dir, name), readFileSync(path.join(ROOT, name)))
  }
  return dir
}

/** 假 ctx：只提供插件装载与资产端点用到的服务。 */
function makeRig() {
  const routes = new Map()
  const fsService = {
    async resolve(target) {
      return { path: typeof target === 'string' ? target : String(target && target.path) }
    },
    async stat(target) {
      const p = typeof target === 'string' ? target : String(target && target.path)
      try {
        const info = statSync(p)
        return { type: info.isDirectory() ? 'dir' : 'file', size: info.size, mtimeMs: info.mtimeMs }
      } catch (error) {
        return undefined
      }
    },
    async readText(target) {
      const p = typeof target === 'string' ? target : String(target && target.path)
      return readFileSync(p, 'utf8')
    },
    async writeText(target, text) {
      const p = typeof target === 'string' ? target : String(target && target.path)
      writeFileSync(p, String(text), 'utf8')
    },
    listDir(dir) {
      return fsService.readdir(dir)
    },
    async readdir(dir) {
      const p = typeof dir === 'string' ? dir : String(dir && dir.path)
      return readdirSync(p).map((name) => {
        const full = path.join(p, name)
        return { name, type: statSync(full).isDirectory() ? 'dir' : 'file', target: full }
      })
    },
    processPath(target) {
      return typeof target === 'string' ? target : String(target && target.path)
    },
  }
  const services = {
    fs: fsService,
    sessions: { get: () => undefined },
    workspaceRegistry: { list: () => [] },
  }
  const ctx = {
    get: (name) => services[name],
    effect: (fn) => {
      fn()
      return () => {}
    },
    inject: () => {},
    webServer: {
      register(descriptor) {
        routes.set(descriptor.path, descriptor.handler)
        return () => routes.delete(descriptor.path)
      },
    },
  }
  apply(ctx, { binDir: 'C:\\aoci\\bin', updateCheck: false })
  return { routes }
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch (error) {
    return null
  }
}

/** 调用一个路由处理器：GET 给空 body，POST 把对象序列化成 JSON 流。 */
function call(handler, { method = 'GET', url = '/aoci-panel/assets', body = null } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = body === null ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]
    const req = Readable.from(chunks)
    req.method = method
    req.url = url
    const res = {
      status: 0,
      headers: null,
      text: '',
      writeHead(status, headers) {
        this.status = status
        this.headers = headers
      },
      end(text) {
        this.text = text || ''
        resolve({ status: this.status, json: parseJson(this.text), raw: this.text })
      },
    }
    Promise.resolve()
      .then(() => handler(req, res))
      .catch(reject)
  })
}

function assetsUrl(repo) {
  return '/aoci-panel/assets?repo=' + encodeURIComponent(repo)
}

test('apply 注册索引文件与恢复端点', () => {
  const { routes } = makeRig()
  assert.ok(routes.has('/aoci-panel/assets'))
  assert.ok(routes.has('/aoci-panel/assets/restore'))
})

test('GET assets：三资产可读且通过结构校验', async () => {
  const repo = makeRepo()
  try {
    const { routes } = makeRig()
    const res = await call(routes.get('/aoci-panel/assets'), { url: assetsUrl(repo) })
    assert.equal(res.status, 200)
    assert.equal(res.json.files.length, 3)
    const byName = Object.fromEntries(res.json.files.map((file) => [file.name, file]))
    for (const name of ASSET_NAMES) {
      assert.equal(byName[name].exists, true, name + ' 应存在')
      assert.equal(byName[name].validation.ok, true, name + ' 应通过校验：' + JSON.stringify(byName[name].validation.errors))
      assert.match(byName[name].sha256, /^[0-9a-f]{64}$/, name + ' 应有 sha256')
      assert.ok(byName[name].bytes > 0)
      assert.ok(byName[name].lines > 0)
      assert.equal(byName[name].eol, 'lf')
    }
    assert.ok(byName['aoci.code.txt'].validation.stats.entries >= 40, '代码卷应解析出 40+ 条目')
    assert.equal(typeof res.json.limit, 'number')
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('GET assets：未初始化仓库给出明确错误', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aoci-panel-empty-'))
  try {
    const { routes } = makeRig()
    const res = await call(routes.get('/aoci-panel/assets'), { url: assetsUrl(dir) })
    assert.equal(res.status, 200)
    assert.match(res.json.error, /没有 aoci\.txt/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('POST save：合法修改落盘、生成备份、sha 更新', async () => {
  const repo = makeRepo()
  try {
    const { routes } = makeRig()
    const read = await call(routes.get('/aoci-panel/assets'), { url: assetsUrl(repo) })
    const before = read.json.files.find((file) => file.name === 'aoci.txt')
    const next = before.content + '\n# editor smoke test\n'

    const saved = await call(routes.get('/aoci-panel/assets'), {
      method: 'POST',
      body: { repo, name: 'aoci.txt', content: next, expectedSha256: before.sha256 },
    })
    assert.equal(saved.json.ok, true, JSON.stringify(saved.json))
    assert.notEqual(saved.json.sha256, before.sha256)
    assert.ok(saved.json.backupPath, '应返回备份路径')
    assert.ok(existsSync(saved.json.backupPath), '备份文件应存在')
    assert.equal(readFileSync(saved.json.backupPath, 'utf8'), before.content, '备份应保存旧内容')
    assert.equal(readFileSync(path.join(repo, 'aoci.txt'), 'utf8'), next, '文件应写入新内容')
    assert.equal(saved.json.validation.ok, true)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('POST save：expectedSha256 不符时拒绝且不写盘', async () => {
  const repo = makeRepo()
  try {
    const { routes } = makeRig()
    const read = await call(routes.get('/aoci-panel/assets'), { url: assetsUrl(repo) })
    const before = read.json.files.find((file) => file.name === 'aoci.txt')
    const original = readFileSync(path.join(repo, 'aoci.txt'), 'utf8')

    const stale = await call(routes.get('/aoci-panel/assets'), {
      method: 'POST',
      body: { repo, name: 'aoci.txt', content: before.content + '\n# changed\n', expectedSha256: 'f'.repeat(64) },
    })
    assert.equal(stale.json.ok, false)
    assert.equal(stale.json.code, 'ASSET_CHANGED')
    assert.equal(stale.json.currentSha256, before.sha256)
    assert.equal(readFileSync(path.join(repo, 'aoci.txt'), 'utf8'), original, '冲突时不得写盘')
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('POST save：结构校验不通过时拒绝且不写盘', async () => {
  const repo = makeRepo()
  try {
    const { routes } = makeRig()
    const original = readFileSync(path.join(repo, 'aoci.txt'), 'utf8')

    const bad = await call(routes.get('/aoci-panel/assets'), {
      method: 'POST',
      body: { repo, name: 'aoci.txt', content: '# not a manifest\n' },
    })
    assert.equal(bad.json.ok, false)
    assert.equal(bad.json.code, 'VALIDATION_FAILED')
    assert.ok(bad.json.validation.errors.some((error) => /首行/.test(error)))
    assert.equal(readFileSync(path.join(repo, 'aoci.txt'), 'utf8'), original, '校验失败不得写盘')
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('POST save：CRLF 内容归一为 LF 后落盘', async () => {
  const repo = makeRepo()
  try {
    const { routes } = makeRig()
    const original = readFileSync(path.join(repo, 'aoci.txt'), 'utf8')
    const crlf = original.replace(/\n/g, '\r\n')

    const saved = await call(routes.get('/aoci-panel/assets'), {
      method: 'POST',
      body: { repo, name: 'aoci.txt', content: crlf },
    })
    assert.equal(saved.json.ok, true, JSON.stringify(saved.json))
    const written = readFileSync(path.join(repo, 'aoci.txt'), 'utf8')
    assert.equal(written.includes('\r'), false, '落盘内容必须是 LF')
    assert.equal(written, original)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('POST save：非受管文件名被拒绝', async () => {
  const repo = makeRepo()
  try {
    const { routes } = makeRig()
    const res = await call(routes.get('/aoci-panel/assets'), {
      method: 'POST',
      body: { repo, name: 'package.json', content: '{}' },
    })
    assert.equal(res.json.ok, false)
    assert.match(res.json.error, /只允许编辑/)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('POST restore：从备份恢复原内容并再备份当前内容', async () => {
  const repo = makeRepo()
  try {
    const { routes } = makeRig()
    const read = await call(routes.get('/aoci-panel/assets'), { url: assetsUrl(repo) })
    const before = read.json.files.find((file) => file.name === 'aoci.meta.txt')
    const next = before.content + '\n# meta editor smoke\n'
    const saved = await call(routes.get('/aoci-panel/assets'), {
      method: 'POST',
      body: { repo, name: 'aoci.meta.txt', content: next, expectedSha256: before.sha256 },
    })
    assert.equal(saved.json.ok, true, JSON.stringify(saved.json))
    const backupName = path.basename(saved.json.backupPath)

    const restored = await call(routes.get('/aoci-panel/assets/restore'), {
      method: 'POST',
      body: { repo, name: 'aoci.meta.txt', backup: backupName },
    })
    assert.equal(restored.json.ok, true, JSON.stringify(restored.json))
    assert.equal(restored.json.restoredFrom, backupName)
    assert.equal(readFileSync(path.join(repo, 'aoci.meta.txt'), 'utf8'), before.content, '应恢复旧内容')
    assert.ok(restored.json.backupPath && existsSync(restored.json.backupPath), '恢复前应备份当前内容')
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('POST restore：备份名穿越与非 .bak 后缀被拒绝', async () => {
  const repo = makeRepo()
  try {
    const { routes } = makeRig()
    for (const backup of ['../evil.bak', 'aoci.txt.notbak', 'other.txt.20260101-000000.bak']) {
      const res = await call(routes.get('/aoci-panel/assets/restore'), {
        method: 'POST',
        body: { repo, name: 'aoci.txt', backup },
      })
      assert.equal(res.json.ok, false, '应拒绝：' + backup)
    }
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})
