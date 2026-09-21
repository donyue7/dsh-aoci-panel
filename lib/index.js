/**
 * dsh-aoci-panel —— 宿主半（Cordis 插件）。
 *
 * 为浏览器半提供本地只读端点 `/aoci-panel/*`：
 *   1. 解析仓库内的 AOCI 认知资产（根清单 aoci.txt 与各卷文件）；
 *   2. 通过多级通道调用本机 aoci CLI，取回真实治理事实（对齐/漂移/预算/scope）；
 *   3. 对同一仓库的内存快照做持久缓存，只有显式刷新或校验才重新取数。
 *
 * CLI 通道按最小权限优先排序：subprocess 直接 argv → shell 默认策略 → shell 显式放行。
 * 需要多级回退的原因：DSH 的 `shell` 服务带沙箱策略，而 aoci 需要枚举业务源清单与
 * managed scope，在沙箱下会退化成 `code_source_count=0` / `exit_code=1` 的假阻塞。
 *
 * 本插件只读：不写业务文件，不修改 aoci.txt / .aoci 正式资产；`verify` 端点触发的
 * 审计记录由 aoci 自身写入 `.aoci/verify_history`（该目录已被 .aoci/.gitignore 忽略）。
 */

/** 默认的 aoci 可执行文件目录；面板顶部可在探测结果中切换具体二进制。 */
const BIN_DIR_DEFAULT = 'C:\\aoci\\bin'
/** 条目列表里 F 字段的截断长度，完整内容由 /aoci-panel/entry 按需返回。 */
const LIST_F_LIMIT = 160
/** 单次 CLI 调用的兜底超时（毫秒）。 */
const CLI_TIMEOUT_MS = 120000

export const name = 'dsh-aoci-panel'
export const inject = ['webServer']

/**
 * 注册面板所需的只读路由。
 *
 * 整个安装过程包在 try/catch 里：本插件是可选的只读面板，任何装载异常都不应
 * 让宿主 profile 启动失败（否则用户会因一个面板被锁在启动流程外）。
 *
 * @param ctx - Cordis 上下文；`webServer` 为硬依赖。
 */
export function apply(ctx) {
  try {
    install(ctx)
  } catch (error) {
    console.error('[dsh-aoci-panel] 装载失败：', error)
  }
}

function install(ctx) {
  const cache = new Map()
  let transport = ''

  const str = (value) => (value === undefined || value === null ? '' : String(value))

  function clip(value, limit) {
    const text = str(value)
    return text.length > limit ? text.slice(0, limit) + '…' : text
  }

  function winJoin(dir, leaf) {
    const base = str(dir).replace(/[\\/]+$/, '')
    return base ? base + '\\' + leaf : leaf
  }

  function norm(value) {
    return str(value).replace(/\\/g, '/').replace(/\/+$/, '')
  }

  function quote(value) {
    return '"' + str(value) + '"'
  }

  async function readText(path) {
    const fs = ctx.get('fs')
    if (fs === undefined || !path) return null
    try {
      const target = await fs.resolve(path)
      const info = await fs.stat(target)
      if (info === undefined || info.type !== 'file') return null
      return await fs.readText(target)
    } catch (error) {
      return null
    }
  }

  async function exists(path) {
    const fs = ctx.get('fs')
    if (fs === undefined || !path) return false
    try {
      const target = await fs.resolve(path)
      return (await fs.stat(target)) !== undefined
    } catch (error) {
      return false
    }
  }

  /** 取会话的工作目录，用于把面板自动定位到当前项目；失败时返回空串。 */
  function sessionCwd(sessionId) {
    const sessions = ctx.get('sessions')
    if (!sessionId || sessions === undefined) return ''
    try {
      const session = sessions.get(sessionId)
      if (!session) return ''
      const header = session.header
      if (header && typeof header.cwd === 'string') return header.cwd
      if (typeof session.cwd === 'string') return session.cwd
    } catch (error) {
      return ''
    }
    return ''
  }

  /** 探测目录下的 aoci 可执行文件，按 rc 版本号降序（无 rc 记 0）。 */
  async function discoverBins(binDir) {
    const fs = ctx.get('fs')
    const found = []
    if (fs !== undefined && binDir) {
      try {
        const target = await fs.resolve(binDir)
        const entries = await fs.listDir(target)
        for (const entry of entries) {
          if (entry.type !== 'file') continue
          if (!/^aoci.*\.exe$/i.test(entry.name)) continue
          let path = ''
          try {
            path = fs.processPath(entry.target)
          } catch (error) {
            path = ''
          }
          if (!path) path = winJoin(binDir, entry.name)
          const rc = /rc(\d+)/i.exec(entry.name)
          found.push({ name: entry.name, path, rank: rc ? parseInt(rc[1], 10) : 0 })
        }
      } catch (error) {
        /* 目录不可读时保持为空，面板会提示未探测到二进制 */
      }
    }
    found.sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))
    return found
  }

  /** 解析根清单：`#Key: value` 进 meta，`#Volume: k=v ...` 进 volumes。 */
  function parseManifest(raw) {
    const meta = {}
    const volumes = []
    for (const line of str(raw).split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (trimmed.indexOf('#Volume:') === 0) {
        const kv = {}
        for (const part of trimmed.slice(8).trim().split(/\s+/)) {
          const at = part.indexOf('=')
          if (at > 0) kv[part.slice(0, at)] = part.slice(at + 1)
        }
        volumes.push({
          id: str(kv.id),
          kind: str(kv.kind),
          path: str(kv.path),
          format: str(kv.format),
          state: str(kv.state),
        })
      } else if (trimmed.charAt(0) === '#') {
        const at = trimmed.indexOf(':')
        if (at > 1) meta[trimmed.slice(1, at).trim()] = trimmed.slice(at + 1).trim()
      }
    }
    return { meta, volumes }
  }

  /** 解析卷头部的标签词典（`#[Tag dictionary: code]` 之后的 A/B/C/E 行）。 */
  function parseDictionary(lines) {
    const out = {}
    let domain = ''
    for (const line of lines) {
      const head = /^#\[Tag dictionary:\s*([a-z]+)\]/i.exec(line)
      if (head) {
        domain = head[1].toLowerCase()
        out[domain] = {}
        continue
      }
      if (!domain) continue
      const part = /^#([ABCE])\s+[^:]+:\s*(.+)$/.exec(line)
      if (!part) continue
      const map = {}
      for (const token of part[2].trim().split(/\s+/)) {
        const at = token.indexOf('-')
        if (at > 0) map[token.slice(0, at)] = token.slice(at + 1)
      }
      out[domain][part[1]] = map
    }
    return out
  }

  /**
   * 解析卷文件：`===<目录>===` 为分节，其余非注释行为
   * `name[TAGS]: F:… | R:… | A:… | S:…`。
   * R/A/S 用 lastIndexOf 逆序切分，避免正文里出现 ` | ` 时错位。
   */
  function parseVolume(raw, repoRoot) {
    const lines = str(raw).split(/\r?\n/)
    const entries = []
    let dir = ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (trimmed.charAt(0) === '#') continue
      if (trimmed.indexOf('===') === 0) {
        dir = trimmed.replace(/^=+/, '').replace(/=+$/, '').trim()
        continue
      }
      const head = /^(.+?)\[([^\]]*)\]:\s*(.*)$/.exec(trimmed)
      if (!head) continue
      const label = head[1].trim()
      const tags = head[2].trim()
      const rest = head[3]
      let f = rest
      let r = ''
      let a = ''
      let s = ''
      const iS = rest.lastIndexOf(' | S:')
      const iA = rest.lastIndexOf(' | A:')
      const iR = rest.lastIndexOf(' | R:')
      if (iR > 2 && iA > iR && iS > iA) {
        f = rest.slice(2, iR)
        r = rest.slice(iR + 6, iA)
        a = rest.slice(iA + 6, iS)
        s = rest.slice(iS + 6)
      } else if (rest.indexOf('F:') === 0) {
        f = rest.slice(2)
      }
      const dirNorm = norm(dir)
      const rel =
        repoRoot && dirNorm.toLowerCase().indexOf(repoRoot.toLowerCase()) === 0
          ? dirNorm.slice(repoRoot.length).replace(/^\/+/, '')
          : ''
      entries.push({
        id: (rel ? rel + '/' : '') + label,
        name: label,
        dir: rel,
        tags,
        f: f.trim(),
        r: r.trim(),
        a: a.trim(),
        s: s.trim(),
      })
    }
    const dictLines = lines.filter(
      (line) => line.indexOf('#[Tag dictionary:') === 0 || /^#[ABCE]\s/.test(line),
    )
    return { entries, dictionary: parseDictionary(dictLines) }
  }

  function readJson(text) {
    const raw = str(text)
    const start = raw.indexOf('{')
    if (start < 0) return null
    try {
      return JSON.parse(raw.slice(start))
    } catch (error) {
      return null
    }
  }

  /** 用 timer 服务给 Promise 加超时护栏；timer 不可用时直接等待。 */
  async function withGuard(promise, ms, onTimeout) {
    const timer = ctx.get('timer')
    if (timer === undefined) return await promise
    let cancel = null
    const guard = new Promise((resolve) => {
      cancel = timer.timeout(() => resolve({ guarded: true }), ms)
    })
    const outcome = await Promise.race([promise, guard])
    if (cancel) {
      try {
        cancel()
      } catch (error) {
        /* 定时器已触发 */
      }
    }
    if (outcome && outcome.guarded) {
      onTimeout()
      return await promise
    }
    return outcome
  }

  /** 通道一：subprocess 直接 argv —— 不经 shell 解释，且该 seam 无沙箱策略字段。 */
  async function viaSubprocess(bin, argv, repo) {
    const subprocess = ctx.get('subprocess')
    if (subprocess === undefined) {
      return { ran: false, transport: 'subprocess', error: 'subprocess 服务不可用' }
    }
    let handle = null
    try {
      handle = subprocess.spawn({
        argv: [bin].concat(argv),
        cwd: repo,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: 8 * 1024 * 1024 },
          stderr: { maxBytes: 256 * 1024 },
        },
        graceMs: 3000,
      })
    } catch (error) {
      return {
        ran: false,
        transport: 'subprocess',
        error: clip(error && error.message ? error.message : error, 300),
      }
    }
    const settled = handle.done.then(
      (outcome) => outcome || {},
      (error) => ({ failure: clip(error && error.message ? error.message : error, 300) }),
    )
    const outcome = await withGuard(settled, CLI_TIMEOUT_MS, () => {
      try {
        handle.terminate()
      } catch (error) {
        /* 忽略终止失败 */
      }
    })
    let stdout = ''
    let stderr = ''
    try {
      if (handle.collected && handle.collected.stdout) {
        stdout = str(handle.collected.stdout.readFrom(0).text)
      }
    } catch (error) {
      stdout = ''
    }
    try {
      if (handle.collected && handle.collected.stderr) {
        stderr = str(handle.collected.stderr.readFrom(0).text)
      }
    } catch (error) {
      stderr = ''
    }
    return {
      ran: true,
      transport: 'subprocess',
      exitCode: outcome && outcome.exitCode !== undefined ? outcome.exitCode : null,
      stdout,
      stderr,
      failure: outcome && outcome.failure ? outcome.failure : '',
    }
  }

  /** 通道二/三：shell 服务；`hard` 时显式声明 danger-full-access。 */
  async function viaShell(bin, argv, repo, hard) {
    const shell = ctx.get('shell')
    const kind = hard ? 'shell-full' : 'shell'
    if (shell === undefined) return { ran: false, transport: kind, error: 'shell 服务不可用' }
    try {
      const command = quote(bin) + ' ' + argv.map(quote).join(' ')
      const request = { command, workdir: repo, timeoutMs: CLI_TIMEOUT_MS }
      if (hard) request.sandboxPolicy = { mode: 'danger-full-access', workspaceRoot: repo }
      const result = await shell.run(shell.resolve(request))
      return {
        ran: true,
        transport: kind,
        exitCode: result ? result.exitCode : null,
        stdout: result && result.stdout ? str(result.stdout.text) : '',
        stderr: result && result.stderr ? str(result.stderr.text) : '',
        sandbox: result && result.sandbox ? str(result.sandbox.mode) : '',
      }
    } catch (error) {
      return {
        ran: false,
        transport: kind,
        error: clip(error && error.message ? error.message : error, 300),
      }
    }
  }

  /** 依次尝试各通道，命中可解析 JSON 的通道即记住它。 */
  async function runCli(bin, argv, repo) {
    if (!bin) return { ran: false, error: '未指定 aoci 可执行文件', attempts: [] }
    const order = transport
      ? [transport, 'subprocess', 'shell', 'shell-full']
      : ['subprocess', 'shell', 'shell-full']
    const seen = {}
    const attempts = []
    let last = null
    for (const kind of order) {
      if (seen[kind]) continue
      seen[kind] = true
      const result =
        kind === 'subprocess'
          ? await viaSubprocess(bin, argv, repo)
          : await viaShell(bin, argv, repo, kind === 'shell-full')
      const json = result.ran ? readJson(result.stdout) : null
      attempts.push(kind + (json ? '✓' : result.ran ? '~' : '✗'))
      if (json) {
        transport = kind
        return {
          ran: true,
          transport: kind,
          exitCode: result.exitCode,
          json,
          sandbox: str(result.sandbox),
          attempts,
        }
      }
      last = result
    }
    const detail = last
      ? '[' +
        str(last.transport) +
        '] ' +
        (last.error || last.failure || clip(last.stderr || last.stdout || '无输出', 300))
      : '无可用通道'
    return {
      ran: false,
      error: 'CLI 未返回 JSON',
      detail,
      sandbox: last ? str(last.sandbox) : '',
      attempts,
    }
  }

  /** CLI 不可用时的兜底：读 ledger 里最近几条真实运行的结论。 */
  async function ledgerTail(repo) {
    const raw = await readText(winJoin(winJoin(repo, '.aoci'), 'ledger.jsonl'))
    if (raw === null) return []
    const lines = str(raw)
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
    const out = []
    for (let index = lines.length - 1; index >= 0 && out.length < 5; index -= 1) {
      try {
        const record = JSON.parse(lines[index])
        const op = str(record.op)
        if (op !== 'verify' && op !== 'check' && op !== 'maintain') continue
        out.push({
          ts: str(record.ts),
          op,
          result: str(record.result),
          exitCode: record.exit_code === undefined ? '-' : record.exit_code,
          warnings: record.warnings_count,
          source: str(record.source),
        })
      } catch (error) {
        /* 跳过损坏行 */
      }
    }
    return out
  }

  /** 构建某仓库的完整快照（昂贵部分：两次 CLI 调用）。 */
  async function buildSnapshot(repo, bin) {
    const manifestRaw = await readText(winJoin(repo, 'aoci.txt'))
    if (manifestRaw === null) return { hasIndex: false, repo, cachedAt: Date.now() }
    const manifest = parseManifest(manifestRaw)
    const repoRoot = norm(repo)
    const volumes = []
    const entries = []
    let dictionary = {}
    for (const volume of manifest.volumes) {
      const body = volume.path ? await readText(winJoin(repo, volume.path)) : null
      const parsed = body === null ? null : parseVolume(body, repoRoot)
      volumes.push({
        id: volume.id,
        kind: volume.kind,
        path: volume.path,
        format: volume.format,
        state: volume.state,
        present: parsed !== null,
        entryCount: parsed ? parsed.entries.length : 0,
      })
      if (parsed) {
        if (Object.keys(dictionary).length === 0 && Object.keys(parsed.dictionary).length > 0) {
          dictionary = parsed.dictionary
        }
        if (volume.kind === 'code' || volume.kind === 'database') {
          for (const entry of parsed.entries) {
            entries.push({
              id: entry.id,
              name: entry.name,
              dir: entry.dir,
              tags: entry.tags,
              f: clip(entry.f, LIST_F_LIMIT),
              domain: volume.kind,
            })
          }
        }
      }
    }
    const status = await runCli(bin, ['status', '--json', '--repo', repo], repo)
    const check = await runCli(bin, ['check', '--json', '--repo', repo], repo)
    const governance = check.json && check.json.governance ? check.json.governance : null
    const ledger = governance ? [] : await ledgerTail(repo)
    return {
      hasIndex: true,
      repo,
      cachedAt: Date.now(),
      project: str(manifest.meta['Project']),
      formatVersion: str(manifest.meta['Format-Version']),
      locale: str(manifest.meta['Locale']),
      volumes,
      entries,
      dictionary,
      status: status.json ? status.json : null,
      governance,
      ledger,
      check: check.json
        ? {
            ok: check.json.ok === true,
            exitCode: check.json.exit_code,
            nextAction: str(check.json.next_action),
            findings: check.json.findings || [],
            structureValid: check.json.structure_valid === true,
            governanceAligned: check.json.governance_aligned === true,
          }
        : null,
      cli: {
        available: ctx.get('shell') !== undefined || ctx.get('subprocess') !== undefined,
        bin,
        transport: str(check.transport || status.transport),
        sandbox: str(check.sandbox || status.sandbox),
        attempts: check.attempts || status.attempts || [],
        detail: str(check.detail || status.detail),
      },
    }
  }

  async function snapshotFor(repo, bin, force) {
    const hit = cache.get(repo)
    if (!force && hit && hit.bin === bin) return hit.value
    const value = await buildSnapshot(repo, bin)
    cache.set(repo, { bin, value })
    return value
  }

  /** 一次调用返回面板首屏所需的全部信息：二进制、工作区、当前仓库与快照。 */
  async function buildState(query) {
    const binDir = query.get('binDir') || BIN_DIR_DEFAULT
    const wantedBin = query.get('bin') || ''
    const force = query.get('force') === '1'
    const sessionId = query.get('sessionId') || ''
    const bins = await discoverBins(binDir)
    const bin = wantedBin || (bins.length > 0 ? bins[0].path : '')
    const cwd = norm(sessionCwd(sessionId))
    const registry = ctx.get('workspaceRegistry')
    const repos = []
    if (registry !== undefined) {
      let list = []
      try {
        list = registry.list()
      } catch (error) {
        list = []
      }
      for (const workspace of list) {
        const path = str(workspace.path)
        if (!path) continue
        const repoNorm = norm(path)
        const isSession = !!cwd && (cwd === repoNorm || cwd.indexOf(repoNorm + '/') === 0)
        repos.push({
          id: str(workspace.id),
          title: str(workspace.title),
          path,
          isSession,
          hasIndex: await exists(winJoin(path, 'aoci.txt')),
        })
      }
    }
    const wantedRepo = norm(query.get('repo') || '')
    const preferred =
      repos.filter((item) => wantedRepo && norm(item.path) === wantedRepo)[0] ||
      repos.filter((item) => item.isSession)[0] ||
      repos.filter((item) => item.hasIndex)[0] ||
      repos[0] ||
      null
    let snapshot = null
    if (preferred) snapshot = await snapshotFor(preferred.path, bin, force)
    return {
      binDir,
      bins,
      repos,
      sessionRepo: cwd,
      repo: preferred ? preferred.path : '',
      snapshot,
    }
  }

  /** 读取单条条目的完整 F/R/A/S（按需，避免首屏传输整卷正文）。 */
  async function buildEntry(query) {
    const repo = query.get('repo') || ''
    const id = query.get('id') || ''
    if (!repo || !id) return { error: '缺少参数' }
    const manifestRaw = await readText(winJoin(repo, 'aoci.txt'))
    if (manifestRaw === null) return { error: '该仓库没有 aoci.txt' }
    const manifest = parseManifest(manifestRaw)
    const repoRoot = norm(repo)
    for (const volume of manifest.volumes) {
      if (volume.kind !== 'code' && volume.kind !== 'database') continue
      const body = volume.path ? await readText(winJoin(repo, volume.path)) : null
      if (body === null) continue
      const parsed = parseVolume(body, repoRoot)
      for (const entry of parsed.entries) {
        if (entry.id === id) {
          return {
            id: entry.id,
            name: entry.name,
            dir: entry.dir,
            tags: entry.tags,
            f: entry.f,
            r: entry.r,
            a: entry.a,
            s: entry.s,
            domain: volume.kind,
          }
        }
      }
    }
    return { error: '未找到条目：' + id }
  }

  /** 显式校验：跑 aoci verify 并写审计，然后令该仓库缓存失效。 */
  async function runVerify(query) {
    const repo = query.get('repo') || ''
    const bin = query.get('bin') || ''
    if (!repo) return { error: '缺少仓库路径' }
    const result = await runCli(bin, ['verify', '--json', '--repo', repo], repo)
    cache.delete(repo)
    if (!result.ran) return { error: result.error || 'verify 未执行', detail: str(result.detail) }
    const payload = result.json
    return {
      result: str(payload.result),
      governanceAligned: payload.governance_aligned === true,
      nextRequiredAction: str(payload.next_required_action),
      findings: payload.findings || [],
      governance: payload.governance || null,
      transport: result.transport,
      exitCode: result.exitCode,
    }
  }

  function sendJson(res, status, payload) {
    let body = ''
    try {
      body = JSON.stringify(payload)
    } catch (error) {
      body = JSON.stringify({ error: '响应序列化失败' })
      status = 500
    }
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(body)
  }

  function route(handler) {
    return async (req, res) => {
      try {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          sendJson(res, 405, { error: '仅支持 GET' })
          return
        }
        const url = new URL(req.url || '/', 'http://127.0.0.1')
        sendJson(res, 200, await handler(url.searchParams))
      } catch (error) {
        sendJson(res, 500, { error: clip(error && error.message ? error.message : error, 500) })
      }
    }
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/aoci-panel/state',
        handler: route(buildState),
      }),
    'aoci-panel: state route',
  )
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/aoci-panel/entry',
        handler: route(buildEntry),
      }),
    'aoci-panel: entry route',
  )
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/aoci-panel/verify',
        handler: route(runVerify),
      }),
    'aoci-panel: verify route',
  )
}
