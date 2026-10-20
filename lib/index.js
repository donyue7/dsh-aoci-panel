/**
 * dsh-aoci-panel —— 宿主半（Cordis 插件）。
 *
 * 为浏览器半提供本地端点 /aoci-panel/*：
 *   1. 解析仓库内的 AOCI 认知资产（根清单 aoci.txt 与各卷文件）；
 *   2. 通过多级通道调用本机 aoci CLI，取回真实治理事实（对齐/漂移/预算/scope）；
 *   3. 对同一仓库的内存快照做持久缓存，只有显式刷新或校验才重新取数；
 *   4. 多工作区总览 /workspaces：聚合所有注册 DSH 工作区的治理状态、绑定诊断与按需深取；
 *   5. 快捷动作 /action：verify / check / status / doctor / guide 一键执行，
 *      以及按治理状态生成给 Agent 的提示词（maintain / authoring / repair / recovery）；
 *   6. 安装向导 /install：仓库尚无 aoci.txt 时执行 `aoci init`（+可选 `aoci scan`），
 *      并把该仓库的 aoci MCP 服务器行追加进当前 DSH home 或指定 profile 的
 *      `cordis.patch.yml`（写前时间戳备份、幂等检测、行 id / serverName 防碰撞、
 *      同一补丁文件内既有 aoci 行的二进制/仓库归一，支持批量）。
 *
 * DSH home 解析兼容新旧布局：显式覆盖 → $DSH_HOME → %USERPROFILE%\.dsh-harness-next
 * （当前默认）→ %USERPROFILE%\.dsh（旧布局，只读兼容，绝不改写）。
 *
 * CLI 通道按最小权限优先排序：subprocess 直接 argv → shell 默认策略 → shell 显式放行。
 * 需要多级回退的原因：DSH 的 `shell` 服务带沙箱策略，而 aoci 需要枚举业务源清单与
 * managed scope，在沙箱下会退化成 `code_source_count=0` / `exit_code=1` 的假阻塞。
 *
 * 除安装向导与绑定修复显式触发的写入（目标仓库内的 aoci init/scan 产物，与可选的
 * DSH 补丁行追加/归一，均写前备份）外本插件只读：不写业务文件，不修改
 * aoci.txt / .aoci 正式资产；`verify` 端点触发的审计记录由 aoci 自身写入
 * `.aoci/verify_history`（该目录已被 .aoci/.gitignore 忽略）。
 */

/** 默认的 aoci 可执行文件目录；面板顶部可在探测结果中切换具体二进制。 */
const BIN_DIR_DEFAULT = 'C:\\aoci\\bin'
/** 条目列表里 F 字段的截断长度，完整内容由 /aoci-panel/entry 按需返回。 */
const LIST_F_LIMIT = 160
/** 单次 CLI 调用的兜底超时（毫秒）。 */
const CLI_TIMEOUT_MS = 120000
/** POST 请求体的大小上限（字节）。 */
const BODY_LIMIT = 256 * 1024
/** 安装向导允许的 init 选项白名单。 */
const INSTALL_LOCALES = ['zh-CN', 'en-US']
const INSTALL_PROFILES = ['production', 'full']
const INSTALL_AGENTS = ['', 'claude', 'codex', 'cursor', 'opencode', 'qoder', 'all']
/** 批量安装允许的仓库数上限。 */
const BATCH_LIMIT = 20
/** DSH home 探测的候选目录名（按优先级；旧 ~/.dsh 保持兼容）。 */
const DSH_HOME_CANDIDATES = ['.dsh-harness-next', '.dsh']
/** patch 目标里 “home” 表示当前 DSH home 的 cordis.patch.yml。 */
const PATCH_HOME = 'home'

import { collectCognition } from './cognition.js'

export const name = 'dsh-aoci-panel'
export const inject = ['webServer']

/**
 * 注册面板所需的路由。
 *
 * 整个安装过程包在 try/catch 里：本插件是可选面板，任何装载异常都不应
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

  /** 探测目录下的 aoci 可执行文件，按 rc 版本号降序（无 rc 记 0）；rc19+ 优先。 */
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

  /**
   * 原始 CLI 调用：与 runCli 同通道顺序，但以「命令真的跑起来」为准，
   * 不要求 JSON 输出（aoci init/scan 输出人读文本）。
   */
  async function runCliRaw(bin, argv, repo) {
    if (!bin) return { ran: false, error: '未指定 aoci 可执行文件', output: '' }
    const order = transport
      ? [transport, 'subprocess', 'shell', 'shell-full']
      : ['subprocess', 'shell', 'shell-full']
    const seen = {}
    let last = null
    for (const kind of order) {
      if (seen[kind]) continue
      seen[kind] = true
      const result =
        kind === 'subprocess'
          ? await viaSubprocess(bin, argv, repo)
          : await viaShell(bin, argv, repo, kind === 'shell-full')
      if (result.ran) {
        const output =
          str(result.stdout) +
          (str(result.stderr) ? (str(result.stdout) ? '\n[stderr]\n' : '[stderr]\n') + str(result.stderr) : '')
        return {
          ran: true,
          transport: kind,
          exitCode: result.exitCode === undefined ? null : result.exitCode,
          output,
          error: '',
        }
      }
      last = result
    }
    return {
      ran: false,
      error: last ? last.error || last.failure || 'CLI 未执行' : '无可用通道',
      output: '',
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
    const key = normPathKey(repo) + '|' + str(bin)
    const hit = cache.get(key)
    if (!force && hit) return hit.value
    const value = await buildSnapshot(repo, bin)
    cache.set(key, { bin, value })
    return value
  }

  /** workspaces 总览的轻量缓存（不覆盖单仓库深快照）。 */
  const lightCache = new Map()

  async function lightFor(repo, bin, force) {
    const key = normPathKey(repo) + '|' + str(bin)
    const hit = lightCache.get(key)
    if (!force && hit) return hit.value
    const value = await lightStatus(repo, bin)
    lightCache.set(key, { bin, value })
    return value
  }

  function invalidateRepo(repo) {
    const key = normPathKey(repo)
    for (const table of [cache, lightCache]) {
      for (const cacheKey of Array.from(table.keys())) {
        if (cacheKey.indexOf(key + '|') === 0) table.delete(cacheKey)
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * DSH home / profile 补丁层：探测、行扫描、幂等与防碰撞。
   * ------------------------------------------------------------------ */

  function userHome() {
    try {
      if (typeof process !== 'undefined' && process && process.env) {
        return str(process.env.USERPROFILE).trim()
      }
    } catch (error) {
      /* 无 process 环境 */
    }
    return ''
  }

  /**
   * 解析 DSH home 候选（按优先级）：显式覆盖 → $DSH_HOME →
   * %USERPROFILE%\.dsh-harness-next（存在 cordis.patch.yml 或 profiles 目录）→
   * %USERPROFILE%\.dsh。旧 home 保持兼容，绝不改写旧 home。
   */
  async function dshHomeCandidates(override) {
    const direct = str(override).trim()
    if (direct) return [direct]
    const out = []
    const seen = new Set()
    const push = (value) => {
      const v = str(value).trim()
      if (v && !seen.has(normPathKey(v))) {
        seen.add(normPathKey(v))
        out.push(v)
      }
    }
    try {
      if (typeof process !== 'undefined' && process && process.env) {
        push(str(process.env.DSH_HOME).trim())
      }
    } catch (error) {
      /* 无 process 环境 */
    }
    const profile = userHome()
    if (profile) {
      for (const name of DSH_HOME_CANDIDATES) {
        const candidate = winJoin(profile, name)
        if (
          name === '.dsh' ||
          (await exists(winJoin(candidate, 'cordis.patch.yml'))) ||
          (await exists(winJoin(candidate, 'profiles')))
        ) {
          push(candidate)
        }
      }
    }
    return out
  }

  /** 全部 DSH home 候选（新旧 home 兼容展示）。 */
  async function dshHomes(query) {
    return await dshHomeCandidates(query.get('dshHome'))
  }

  /** 当前生效的 DSH home（候选里的第一个）。 */
  async function dshHomeOf(override) {
    const list = await dshHomeCandidates(override)
    return list.length > 0 ? list[0] : ''
  }

  /** 列出某 DSH home 下的 profile 补丁目标（target=profile:<name>）。 */
  async function profilePatchTargets(dshHome) {
    const fs = ctx.get('fs')
    const out = []
    if (fs === undefined || !dshHome) return out
    try {
      const profilesTarget = await fs.resolve(winJoin(dshHome, 'profiles'))
      for (const entry of await fs.listDir(profilesTarget)) {
        if (entry.type !== 'dir') continue
        out.push({
          target: 'profile:' + entry.name,
          name: entry.name,
          path: winJoin(winJoin(winJoin(dshHome, 'profiles'), entry.name), 'cordis.patch.yml'),
        })
      }
    } catch (error) {
      /* profiles 目录缺失或不可读 */
    }
    return out
  }

  /** 路径归一化为比较键：正斜杠、去尾斜杠、小写。 */
  function normPathKey(value) {
    return str(value).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  }

  /** 仓库目录名压成行 id 片段（[a-z0-9_-]，≤27 字符，保证 serverName ≤32）。 */
  function repoSlug(repo) {
    const base =
      normPathKey(repo)
        .split('/')
        .filter(Boolean)
        .pop() || 'repo'
    const slug = base
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 27)
    return slug || 'repo'
  }

  /**
   * 行级扫描 DSH 补丁文件的 insert 行（与 dshmarket 的 readUserPatchState 同形态，
   * 刻意不做 YAML 解析）：提取 id / name / serverName / command / args，
   * 供幂等检测与防碰撞。name 是 dsh-mcp-client 才算 aoci/工具行，
   * 其他 name（如 ui 设置行）同名 id 不参与 aoci 防碰撞。
   */
  function scanPatchText(text) {
    const rows = []
    let inInsert = false
    let current = null
    for (const raw of str(text).split(/\r?\n/)) {
      const line = raw.replace(/#.*$/, '')
      if (line.trim() === '') continue
      if (/^- insert:\s*$/.test(line)) {
        inInsert = true
        current = null
        continue
      }
      if (/^- /.test(line)) {
        inInsert = false
        current = null
        continue
      }
      if (!inInsert) continue
      const id = /^\s*-?\s*id:\s*['"]?([^'"\s]+)/.exec(line)
      if (id) {
        current = { id: id[1], name: '', serverName: '', command: '', args: '' }
        rows.push(current)
        continue
      }
      if (!current) continue
      const name = /^\s*name:\s*['"]?([^'"\s]+)/.exec(line)
      if (name) {
        current.name = name[1]
        continue
      }
      const serverName = /^\s*serverName:\s*['"]?([^'"\s]+)/.exec(line)
      if (serverName) {
        current.serverName = serverName[1]
        continue
      }
      const command = /^\s*command:\s*['"]?([^'"\s]+)/.exec(line)
      if (command) {
        current.command = command[1]
        continue
      }
      // flow 形态 args: ['--repo', '…']（dsh-mcp-client README 最小配置即此形态）；
      // 漏读会让幂等检测错过手写行，向导重复追加同仓行导致 serverName 冲突。
      const argsFlow = /^\s*args:\s*\[(.*)\]\s*$/.exec(line)
      if (argsFlow) {
        current.args += ' ' + argsFlow[1].replace(/['",]/g, ' ')
        continue
      }
      const arg = /^\s*-\s+(.+)$/.exec(line)
      if (arg) {
        current.args += ' ' + arg[1].trim().replace(/^['"]|['"]$/g, '')
      }
    }
    return rows
  }

  /** 读取一个补丁文件的全部 insert 行；不可读时返回 null。 */
  async function readPatchRows(patchPath) {
    const text = await readText(patchPath)
    if (text === null) return null
    return scanPatchText(text)
  }

  /** 行内 --repo 参数指向的仓库（归一路径键）。 */
  function rowRepoKey(row) {
    const args = str(row.args)
    const m = /--repo\s+(\S+)/.exec(args)
    return m ? normPathKey(m[1]) : ''
  }

  /** 某 insert 行是否是 aoci MCP（dsh-mcp-client）工具行。 */
  function isAociRow(row) {
    return /dsh-mcp-client/i.test(str(row.name) + ' ' + str(row.command) + ' ' + str(row.args))
  }

  /** 某 insert 行是否已经指向该仓库（幂等检测）。 */
  function rowMatchesRepo(row, repo) {
    const key = normPathKey(repo)
    if (!key) return false
    const hay = normPathKey(str(row.args) + ' ' + str(row.command))
    return hay.indexOf(key) >= 0
  }

  /** 行内 aoci 二进制版本（rc 数；无 rc 记 0，未知记 -1）。 */
  function rowBinRank(row) {
    const m = /aoci[^/\s"']*rc(\d+)\.exe/i.exec(str(row.command))
    return m ? parseInt(m[1], 10) : /aoci[^/\s"']*\.exe/i.test(str(row.command)) ? 0 : -1
  }

  /**
   * 收集一个补丁文件 + 该 home 全部 profile 补丁里已占用的行 id 与 serverName。
   * 防碰撞必须跨层看：home 补丁对所有 profile 生效，与 profile 补丁同名会加载失败。
   */
  async function collectIdentities(dshHome, patchPath) {
    const ids = new Set()
    const names = new Set()
    const rows = []
    const target = patchPath || winJoin(dshHome, 'cordis.patch.yml')
    const own = await readPatchRows(target)
    if (own) for (const row of own) rows.push(Object.assign({}, row, { patchPath: target }))
    if (dshHome) {
      const files = [winJoin(dshHome, 'cordis.patch.yml')]
      for (const profile of await profilePatchTargets(dshHome)) files.push(profile.path)
      for (const file of files) {
        const fileRows = await readPatchRows(file)
        if (fileRows === null) continue
        for (const row of fileRows) {
          ids.add(row.id)
          if (row.serverName) names.add(row.serverName)
        }
      }
    }
    return { ids, names, rows, patchExists: own !== null }
  }

  /** 为新仓库挑不冲突的行 id 与 serverName（形态 aoci-<slug>[-N]，≤32 字符）。 */
  function pickRowIdentity(ids, names, repo) {
    const slug = repoSlug(repo)
    let rowId = 'aoci-' + slug
    let n = 2
    while (ids.has(rowId) || names.has(rowId)) {
      rowId = ('aoci-' + slug + '-' + n).slice(0, 32)
      n += 1
    }
    let serverName = rowId
    let m = 2
    while (names.has(serverName)) {
      serverName = ('aoci-' + slug + '-s' + m).slice(0, 32)
      m += 1
    }
    return { rowId, serverName }
  }

  /**
   * 追加前的保守校验（与 dshmarket appendPatchEntry 同立场）：
   * 空/纯注释/`[]` 占位可追加；顶层流式结构结尾或不像条目列表的文件拒绝改写。
   */
  function patchAppendable(text) {
    const raw = str(text)
    const withoutComments = raw.replace(/^[ \t]*#.*$/gm, '').trim()
    if (withoutComments === '') return { ok: true, placeholder: false }
    if (withoutComments === '[]' || withoutComments === '[ ]') return { ok: true, placeholder: true }
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*$/, '').replace(/\s+$/, ''))
      .filter((line) => line.trim() !== '')
    const last = lines.length > 0 ? lines[lines.length - 1] : ''
    if (/^[{[]/.test(last)) {
      return { ok: false, reason: '补丁文件以顶层流式结构结尾，拒绝自动追加；请先整理为条目列表' }
    }
    for (const line of lines) {
      if (!/^- /.test(line) && !/^\s/.test(line)) {
        return { ok: false, reason: '补丁文件不是合法的条目列表，拒绝自动追加；请先修正 YAML' }
      }
    }
    return { ok: true, placeholder: false }
  }

  /** 生成插入补丁文件的 aoci MCP 服务器行（单引号值，正斜杠路径，空格安全）。 */
  function dshPatchBlock(rowId, serverName, bin, repo) {
    const q = (value) => "'" + str(value).replace(/'/g, "''") + "'"
    return [
      '# dsh-aoci-panel 注入：AOCI MCP 服务器 —— ' + str(repo).replace(/\\/g, '/') + '（重启 DSH 后生效）',
      '- insert:',
      '    - id: ' + rowId,
      "      name: '@deepseek-ai/dsh-mcp-client'",
      '      config:',
      '        serverName: ' + q(serverName),
      '        transport: stdio',
      '        command: ' + q(str(bin).replace(/\\/g, '/')),
      '        args:',
      "          - '--repo'",
      '          - ' + q(str(repo).replace(/\\/g, '/')),
      "          - 'mcp'",
    ]
  }

  /**
   * 把补丁行追加进补丁文件：时间戳备份 → 校验可追加 →（`[]` 占位则注释掉）→ 原子写回。
   * 始终逐调用盖 danger-full-access：DSH home/profile 在会话工作区之外，
   * 宿主 fs 后端默认按 workspace-write 围栏（区外写直接 FS_SANDBOX_DENIED）。
   * fs-sandbox 的 writeText 第 5 参 sandboxPolicy 是该 seam 的显式放行机制。
   * 失败仍降级为把 YAML 交给用户手动追加。
   */
  async function writePatchFile(patchPath, nextText, dshHome) {
    const fs = ctx.get('fs')
    if (fs === undefined) return { ok: false, reason: 'fs 服务不可用' }
    const wide = { mode: 'danger-full-access', workspaceRoot: dshHome || '' }
    let text = ''
    try {
      const target = await fs.resolve(patchPath)
      const info = await fs.stat(target)
      if (info !== undefined && info.type === 'file') text = await fs.readText(target)
    } catch (error) {
      text = ''
    }
    const check = patchAppendable(text)
    if (!check.ok) return { ok: false, reason: check.reason }
    const eol = text.indexOf('\r\n') >= 0 ? '\r\n' : '\n'
    let next = nextText
    if (check.placeholder) {
      next = next.replace(/^[ \t]*\[[ \t]*\][ \t]*(?:#.*)?(?:\r?\n|$)/m, '#[]' + eol)
    }
    if (next !== '' && !next.endsWith(eol)) next += eol
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '-')
      .slice(0, 15)
    const backupPath = patchPath + '.bak-aoci-' + stamp
    try {
      if (text !== '') {
        const backupTarget = await fs.resolve(backupPath)
        await fs.writeText(backupTarget, text, undefined, undefined, wide)
      }
      const target = await fs.resolve(patchPath)
      await fs.writeText(target, next, undefined, undefined, wide)
    } catch (error) {
      return {
        ok: false,
        reason: '写入失败：' + clip(error && error.message ? error.message : error, 300),
      }
    }
    return { ok: true, patchPath, backupPath: text !== '' ? backupPath : '' }
  }

  /** 追加补丁块（保留在 writePatchFile 之上的便捷封装）。 */
  async function appendDshPatch(patchPath, block, dshHome) {
    const fs = ctx.get('fs')
    if (fs === undefined) return { ok: false, reason: 'fs 服务不可用' }
    let text = ''
    try {
      const target = await fs.resolve(patchPath)
      const info = await fs.stat(target)
      if (info !== undefined && info.type === 'file') text = await fs.readText(target)
    } catch (error) {
      text = ''
    }
    const eol = text.indexOf('\r\n') >= 0 ? '\r\n' : '\n'
    let next = text
    if (next !== '' && !next.endsWith(eol)) next += eol
    next += (next !== '' ? eol : '') + block.join(eol) + eol
    return await writePatchFile(patchPath, next, dshHome)
  }

  /**
   * 归一某个补丁文件里的 aoci 行：把 --repo 指向 repoKey 的行的 command 与 --repo 参数
   * 改写为给定 bin/repo（保留行 id 与 serverName，避免破坏既有会话命名空间）。
   * 只在确有改写时才走写入路径（写前时间戳备份）。
   */
  async function normalizePatchRows(patchPath, repoKey, repo, bin, dshHome) {
    const fs = ctx.get('fs')
    if (fs === undefined) return { ok: false, reason: 'fs 服务不可用' }
    let text = ''
    try {
      const target = await fs.resolve(patchPath)
      const info = await fs.stat(target)
      if (info !== undefined && info.type === 'file') text = await fs.readText(target)
    } catch (error) {
      text = ''
    }
    if (text === '') return { ok: false, reason: '补丁文件不存在或为空' }
    const rows = scanPatchText(text)
    const stale = rows.filter((row) => rowRepoKey(row) === repoKey)
    if (stale.length === 0) return { ok: false, reason: '未找到指向该仓库的补丁行' }
    const wantCommand = "'" + str(bin).replace(/\\/g, '/').replace(/'/g, "''") + "'"
    const wantRepo = "'" + str(repo).replace(/\\/g, '/').replace(/'/g, "''") + "'"
    const lines = str(text).split(/\r?\n/)
    const final = []
    let touched = 0
    let currentRow = null
    let replaceNext = false
    for (const raw of lines) {
      let line = raw
      const plain = line.replace(/#.*$/, '')
      const id = /^\s*-?\s*id:\s*['"]?([^'"\s]+)/.exec(plain)
      if (id) {
        currentRow = rows.find((row) => row.id === id[1]) || null
      }
      const inStale = currentRow !== null && rowRepoKey(currentRow) === repoKey
      if (inStale) {
        const command = /^(\s*command:\s*)(.*)$/.exec(line)
        if (command && /aoci/i.test(line) && line.trim() !== '') {
          line = command[1] + wantCommand
          touched += 1
        }
        if (/^\s*-\s+['"]?--repo['"]?\s*$/.test(plain)) {
          replaceNext = true
          final.push(line)
          continue
        }
        if (replaceNext) {
          const value = /^(\s*-\s+)(.*)$/.exec(line)
          if (value) {
            line = value[1] + wantRepo
            touched += 1
          }
          replaceNext = false
          final.push(line)
          continue
        }
      }
      final.push(line)
    }
    if (touched === 0) return { ok: false, reason: '补丁行已是目标形态，无需改写' }
    return await writePatchFile(patchPath, final.join('\n'), dshHome)
  }

  /** 只读解析补丁目标：home 或 profile:<name>，返回补丁文件路径。 */
  async function patchTargetPath(dshHome, target) {
    const wanted = str(target).trim()
    if (!wanted || wanted === PATCH_HOME) return winJoin(dshHome, 'cordis.patch.yml')
    const m = /^profile:(.+)$/.exec(wanted)
    if (m) {
      const profiles = await profilePatchTargets(dshHome)
      const hit = profiles.find((item) => item.name === m[1])
      return hit ? hit.path : ''
    }
    return ''
  }

  /**
   * 写入用的补丁目标解析：profile:<name> 的补丁文件不存在时按合法条目列表
   * 的空文件创建（与 writePatchFile 同样盖 danger-full-access 并先备份）。
   */
  async function patchTargetPathForWrite(dshHome, target) {
    const path = await patchTargetPath(dshHome, target)
    if (!path) return ''
    if (await exists(path)) return path
    return (await writePatchFile(path, '', dshHome)).ok ? path : ''
  }

  /* ------------------------------------------------------------------ *
   * 安装向导：为尚无 aoci.txt 的仓库执行 aoci init（+可选 scan），
   * 并可选把该仓库的 aoci MCP 服务器行追加进 DSH 组合补丁层。
   * ------------------------------------------------------------------ */

  /** aoci CLI 自身版本（`--version` 首行），面板标注用；失败返回空串。 */
  async function cliVersion(bin) {
    if (!bin) return ''
    const result = await runCliRaw(bin, ['--version'], '')
    if (!result.ran) return ''
    return str(result.output).split(/\r?\n/)[0].trim()
  }

  /** 安装预检：环境检查 + 默认选项 + 将写入的 DSH 行身份。 */
  async function buildInstallPlan(query) {
    const wanted = str(query.get('patchTarget')) || PATCH_HOME
    // 空 repo 是批量向导的探测请求：只取环境，不做单仓库预检。
    const repo = str(query.get('repo'))
    const binDir = str(query.get('binDir')) || BIN_DIR_DEFAULT
    const bins = await discoverBins(binDir)
    const bin = str(query.get('bin')) || (bins.length > 0 ? bins[0].path : '')
    const homes = await dshHomes(query)
    const dshHome = homes.length > 0 ? homes[0] : ''
    const targets = [{ target: PATCH_HOME, label: 'DSH home（全局生效）', path: dshHome ? winJoin(dshHome, 'cordis.patch.yml') : '' }]
    for (const profile of await profilePatchTargets(dshHome)) {
      targets.push({ target: profile.target, label: 'profile ' + profile.name, path: profile.path })
    }
    const patchPath = await patchTargetPath(dshHome, wanted)
    const hasIndex = repo ? await exists(winJoin(repo, 'aoci.txt')) : false
    const dsh = {
      home: dshHome,
      homes,
      targets,
      target: wanted,
      patchPath,
      patchExists: false,
      integrated: false,
      integratedRowId: '',
      integratedServerName: '',
      rowId: '',
      serverName: '',
      block: '',
    }
    if (dshHome && patchPath) {
      const identities = await collectIdentities(dshHome, patchPath)
      dsh.patchExists = identities.patchExists
      const hit = identities.rows.find((row) => rowMatchesRepo(row, repo))
      if (hit) {
        dsh.integrated = true
        dsh.integratedRowId = hit.id
        dsh.integratedServerName = str(hit.serverName)
      } else {
        const picked = pickRowIdentity(identities.ids, identities.names, repo)
        dsh.rowId = picked.rowId
        dsh.serverName = picked.serverName
        dsh.block = dshPatchBlock(picked.rowId, picked.serverName, bin, repo).join('\n')
      }
    }
    return {
      repo,
      hasIndex,
      binDir,
      bins,
      bin,
      cliAvailable:
        bin !== '' && (ctx.get('shell') !== undefined || ctx.get('subprocess') !== undefined),
      dsh,
      aociCliVersion: await cliVersion(bin),
      defaults: {
        locale: 'zh-CN',
        scopeProfile: 'production',
        hooks: false,
        agent: '',
        integrateDsh: dshHome !== '' && !dsh.integrated,
        runScan: true,
        patchTarget: PATCH_HOME,
      },
    }
  }

  /** 单实例护栏：同一时刻只允许一次安装在跑。 */
  let installing = false

  /** 执行安装（单仓库或批量）：init →（可选）scan →（可选）DSH 补丁行追加。 */
  async function runInstall(body) {
    if (installing) return { error: '已有一次安装正在进行中，请稍候' }
    installing = true
    try {
      if (body && Array.isArray(body.repos)) return await runInstallBatch(body)
      return await runInstallInner(body)
    } finally {
      installing = false
    }
  }

  async function runInstallBatch(body) {
    const repos = body.repos
      .map((repo) => str(repo).trim())
      .filter((repo) => repo !== '')
      .slice(0, BATCH_LIMIT)
    if (repos.length === 0) return { error: '缺少仓库路径' }
    const results = []
    for (const repo of repos) {
      results.push(await runInstallInner(Object.assign({}, body, { repo, repos: undefined })))
    }
    const okCount = results.filter((item) => item.ok).length
    return {
      ok: okCount === results.length,
      batch: true,
      total: results.length,
      okCount,
      results,
    }
  }

  async function runInstallInner(body) {
    if (!body || typeof body !== 'object') return { error: '请求体必须是 JSON 对象' }
    const repo = str(body.repo).trim()
    const bin = str(body.bin).trim()
    const locale = INSTALL_LOCALES.indexOf(str(body.locale)) >= 0 ? str(body.locale) : 'zh-CN'
    const scopeProfile =
      INSTALL_PROFILES.indexOf(str(body.scopeProfile)) >= 0 ? str(body.scopeProfile) : 'production'
    const hooks = body.hooks === true
    const agent = INSTALL_AGENTS.indexOf(str(body.agent)) >= 0 ? str(body.agent) : ''
    const runScan = body.runScan !== false
    const integrateDsh = body.integrateDsh !== false
    const patchTarget = str(body.patchTarget) || PATCH_HOME
    const dshHome = await dshHomeOf(str(body.dshHome))
    if (!repo) return { error: '缺少仓库路径' }
    if (!bin) return { error: '未指定 aoci 可执行文件（请先探测或选择二进制）' }
    if (await exists(winJoin(repo, 'aoci.txt'))) {
      return { error: '该仓库已存在 aoci.txt，无需重复初始化' }
    }

    const result = {
      ok: false,
      repo,
      steps: [],
      guide: [],
      prompt: '',
      integration: null,
      timeline: [],
    }
    const argv = ['init', '--repo', repo, '--locale', locale, '--scope-profile', scopeProfile]
    if (hooks) argv.push('--hooks')
    if (agent) argv.push('--agent', agent)
    const init = await runCliRaw(bin, argv, repo)
    result.steps.push({
      key: 'init',
      title: 'aoci init —— 生成索引骨架、治理配置与 AGENTS.md 区块',
      command: 'aoci ' + argv.join(' '),
      ran: init.ran,
      exitCode: init.exitCode,
      output: init.ran ? init.output : '',
      error: init.error,
    })
    result.timeline.push({ ts: Date.now(), op: 'init', ok: init.ran && init.exitCode === 0 })
    if (!init.ran || init.exitCode !== 0) {
      result.error = init.ran
        ? 'aoci init 退出码 ' + str(init.exitCode) + '，详见输出'
        : init.error || 'aoci init 未执行'
      return result
    }

    if (runScan) {
      const scan = await runCliRaw(bin, ['scan', '--repo', repo], repo)
      result.steps.push({
        key: 'scan',
        title: 'aoci scan —— 全量扫描并建立基线指纹（.aoci/baseline.json）',
        command: 'aoci scan --repo <repo>',
        ran: scan.ran,
        exitCode: scan.exitCode,
        output: scan.ran ? scan.output : '',
        error: scan.error,
      })
      result.timeline.push({ ts: Date.now(), op: 'scan', ok: scan.ran && scan.exitCode === 0 })
    }

    if (integrateDsh) {
      if (!dshHome) {
        result.steps.push({
          key: 'dsh',
          title: '接入 DSH（cordis.patch.yml 追加 MCP 服务器行）',
          ran: false,
          exitCode: null,
          output: '',
          error: '未定位到 DSH home，请在面板中填写后重试',
        })
      } else {
        const patchPath =
          (await patchTargetPathForWrite(dshHome, patchTarget)) || winJoin(dshHome, 'cordis.patch.yml')
        const identities = await collectIdentities(dshHome, patchPath)
        const hit = identities.rows.find((row) => rowMatchesRepo(row, repo))
        if (hit) {
          result.integration = {
            rowId: hit.id,
            serverName: str(hit.serverName),
            patchPath,
            target: patchTarget,
          }
          result.steps.push({
            key: 'dsh',
            title: '接入 DSH（cordis.patch.yml 追加 MCP 服务器行）',
            ran: true,
            exitCode: 0,
            output: '已存在指向该仓库的补丁行（id=' + hit.id + '），本次未改写。',
            error: '',
          })
        } else {
          const picked = pickRowIdentity(identities.ids, identities.names, repo)
          const block = dshPatchBlock(picked.rowId, picked.serverName, bin, repo)
          const outcome = await appendDshPatch(patchPath, block, dshHome)
          if (outcome.ok) {
            result.integration = {
              rowId: picked.rowId,
              serverName: picked.serverName,
              patchPath: outcome.patchPath,
              target: patchTarget,
            }
          }
          result.steps.push({
            key: 'dsh',
            title: '接入 DSH（cordis.patch.yml 追加 MCP 服务器行）',
            ran: outcome.ok,
            exitCode: outcome.ok ? 0 : null,
            output: outcome.ok
              ? '已追加行 id=' +
                picked.rowId +
                '，serverName=' +
                picked.serverName +
                (outcome.backupPath ? '；原文件备份于 ' + outcome.backupPath : '') +
                '。重启 DSH 后该仓库的 aoci MCP 工具即出现在会话中。'
              : '',
            error: outcome.ok ? '' : outcome.reason,
            yaml: outcome.ok ? '' : block.join('\n'),
          })
          result.timeline.push({ ts: Date.now(), op: 'dsh-patch', ok: outcome.ok })
        }
      }
    }

    invalidateRepo(repo)
    result.ok = true
    // 提示词与引导带上本仓库的工具命名空间：同机可能并存多个 aoci 绑定
    // （如旧的 mcp__aoci__* 指向别的仓库），不点名空间 Agent 会误用错绑，
    // 症状是工具返回的 runtime_repository_root 与本仓库不符。
    const prefix =
      result.integration && result.integration.serverName ? 'mcp__' + result.integration.serverName + '__' : ''
    result.prompt =
      '请为本仓库建立 AOCI 认知索引：先调用 ' +
      (prefix ? prefix + 'aoci_rules' : 'aoci_rules') +
      ' 取得会话运行合同，再调用 ' +
      (prefix ? prefix + 'aoci_overview' : 'aoci_overview') +
      ' 建立认知，然后按当前 Guide 的阶段与安全停点执行 Fresh Bootstrap，直到 Whole-Index 对齐（aligned）。' +
      (prefix ? '若 aoci 工具返回的 runtime_repository_root 不是本仓库，说明选错了绑定，改用 ' + prefix + ' 前缀的工具。' : '')
    result.guide = [
      '初始化产物：aoci.txt / aoci.meta.txt / aoci.code.txt 骨架、.aoci/ 治理目录、AGENTS.md 认知契约区块（init 不会伪造任何项目条目）。',
      result.integration
        ? '重启 DSH 使 ' + str(result.integration.patchPath) + ' 的 MCP 行生效；之后该仓库的会话里会出现 ' + prefix + 'aoci_* 工具。'
        : '如需 DSH 会话直接使用 aoci 工具，可重新勾选「接入 DSH」执行一次补丁行追加。',
      result.integration
        ? '会话内必须用 ' + prefix + ' 前缀的 aoci 工具：同机其他 aoci 绑定（如 mcp__aoci__*）会指向别的仓库；症状是工具返回的 runtime_repository_root 与本仓库不符。'
        : '同机存在多个 aoci 绑定时，认准本仓库对应行的 serverName 前缀，别用指向其他仓库的工具。',
      '在该仓库打开一个新会话，粘贴下述提示词让 Agent 构建完整条目索引（F/R/A/S 由模型创作，插件不伪造）；AGENTS.md 的 aoci 区块会指导 Agent 按 Guide 执行。',
      '构建完成后回到本面板查看治理状态与条目；日常改动后由 Agent 在收尾时维护，本面板的「校验」可随时跑 aoci verify。',
    ]
    return result
  }

  /* ------------------------------------------------------------------ *
   * 绑定诊断：serverName / 工具命名空间 / 仓库指向 / 二进制版本核对。
   * ------------------------------------------------------------------ */

  async function buildBinding(query) {
    const repo = norm(query.get('repo') || '')
    const wantedBin = str(query.get('bin') || '')
    const binDir = str(query.get('binDir')) || BIN_DIR_DEFAULT
    const bins = await discoverBins(binDir)
    const bin = wantedBin || (bins.length > 0 ? bins[0].path : '')
    const dshHome = await dshHomeOf(query.get('dshHome'))
    const homes = await dshHomes(query)
    const findings = []
    const rows = []
    if (!dshHome) {
      findings.push({
        code: 'DSH_HOME_MISSING',
        tone: 'bad',
        message: '未定位到 DSH home，无法读取 MCP 补丁行。',
        fix: '在面板里填写 DSH home 路径后重新检测。',
      })
      return { repo, bin, dshHome: '', homes, rows, findings, prompts: [] }
    }
    const targets = [{ target: PATCH_HOME, path: winJoin(dshHome, 'cordis.patch.yml') }]
    for (const profile of await profilePatchTargets(dshHome)) targets.push(profile)
    const seenNames = new Map()
    const wantedKey = normPathKey(repo)
    for (const item of targets) {
      const fileRows = await readPatchRows(item.path)
      if (fileRows === null) continue
      for (const row of fileRows) {
        if (!isAociRow(row)) continue
        const name = str(row.serverName)
        rows.push({
          target: item.target,
          path: item.path,
          id: row.id,
          serverName: name,
          command: str(row.command),
          repo: (rowRepoKey(row) ? rowRepoKey(row) : '').replace(/\\/g, '/'),
          matches: rowMatchesRepo(row, repo),
          binRank: rowBinRank(row),
        })
        if (name) {
          const seen = seenNames.get(name) || []
          seen.push(item.target + ':' + row.id)
          seenNames.set(name, seen)
        }
      }
    }
    for (const [name, seen] of Array.from(seenNames.entries())) {
      if (seen.length > 1) {
        findings.push({
          code: 'SERVER_NAME_CONFLICT',
          tone: 'bad',
          message: 'serverName「' + name + '」在 ' + seen.length + ' 处重复（' + seen.join('、') + '），Loader 可能加载失败。',
          fix: '保留一处，或用本面板「修复绑定」把其中一个改名为不冲突的 serverName。',
        })
      }
    }
    const matched = rows.filter((row) => row.matches)
    if (matched.length === 0) {
      findings.push({
        code: 'NOT_BOUND',
        tone: 'warn',
        message: '没有任何 MCP 补丁行指向该仓库 —— 会话里拿不到本仓库的 aoci 工具。',
        fix: '用安装向导的「接入 DSH」追加一行，或点下方「生成补丁行」复制 YAML 手动追加。',
      })
    }
    for (const row of matched) {
      if (row.repo && row.repo !== wantedKey) {
        findings.push({
          code: 'REPO_MISMATCH',
          tone: 'bad',
          message: '补丁行 ' + row.id + ' 名义指向本仓库但 --repo 实际指向 ' + row.repo + '。',
          fix: '用「修复绑定」把该行的 --repo 归一为本仓库路径。',
        })
      }
      if (bin && row.binRank >= 0) {
        const best = bins.length > 0 ? bins[0].rank : -1
        if (row.binRank < best) {
          findings.push({
            code: 'BIN_STALE',
            tone: 'warn',
            message:
              '补丁行 ' +
              row.id +
              ' 使用 aoci rc' +
              row.binRank +
              '，而目录里已有更高版本（' +
              (bins[0] ? bins[0].name : '') +
              '）。',
            fix: '点「修复绑定」把 command 归一为 ' + (bins[0] ? bins[0].path : '') + '。',
          })
        }
      }
    }
    const promptPrefix = matched.length > 0 && matched[0].serverName ? 'mcp__' + matched[0].serverName + '__' : ''
    const prompts = []
    if (promptPrefix) {
      prompts.push({
        key: 'bootstrap',
        title: '构建 / 恢复本仓库认知（复制到该仓库的会话）',
        text:
          '只使用 ' +
          promptPrefix +
          ' 前缀的 aoci 工具（忽略 mcp__aoci__* 等其他前缀）。先调用 ' +
          promptPrefix +
          'aoci_rules 取得会话运行合同，再调用 ' +
          promptPrefix +
          'aoci_overview 建立认知；若返回的 runtime_repository_root 不是 ' +
          repo +
          '，说明绑定错了，停下来报告。随后按当前 Guide 执行，直到 Whole-Index 对齐（aligned）。',
      })
      prompts.push({
        key: 'checkroot',
        title: '绑定自检（一句话）',
        text:
          '调用 ' +
          promptPrefix +
          'aoci_rules 并核对 runtime_repository_root 是否等于 ' +
          repo +
          '；不等就说明会话拿到了别的仓库的 aoci 绑定。',
      })
    } else {
      prompts.push({
        key: 'bootstrap',
        title: '构建 / 恢复本仓库认知（先接入 DSH 再复制）',
        text:
          '请为本仓库建立 AOCI 认知索引：先调用 aoci_rules 取得会话运行合同，再调用 aoci_overview 建立认知，然后按当前 Guide 执行 Fresh Bootstrap，直到 Whole-Index 对齐（aligned）。',
      })
    }
    return { repo, bin, dshHome, homes, rows, findings, prompts }
  }

  /** 修复绑定：归一某补丁文件里指向该仓库的 aoci 行的 command / --repo。 */
  async function runFixBinding(body) {
    if (!body || typeof body !== 'object') return { error: '请求体必须是 JSON 对象' }
    const repo = norm(str(body.repo).trim())
    const bin = str(body.bin).trim()
    const patchTarget = str(body.patchTarget) || PATCH_HOME
    const dshHome = await dshHomeOf(str(body.dshHome))
    if (!repo) return { error: '缺少仓库路径' }
    if (!bin) return { error: '未指定 aoci 可执行文件' }
    if (!dshHome) return { error: '未定位到 DSH home' }
    const patchPath = await patchTargetPath(dshHome, patchTarget)
    if (!patchPath) return { error: '未知补丁目标：' + patchTarget }
    const outcome = await normalizePatchRows(patchPath, normPathKey(repo), repo, bin, dshHome)
    if (!outcome.ok) return { error: outcome.reason }
    return {
      ok: true,
      patchPath: outcome.patchPath,
      backupPath: outcome.backupPath,
      note: '已归一补丁行的 command / --repo（保留行 id 与 serverName）；重启 DSH 后生效。',
    }
  }

  /* ------------------------------------------------------------------ *
   * 多工作区总览：一屏聚合所有注册工作区的治理状态、卷与绑定。
   * ------------------------------------------------------------------ */

  /** 无 CLI 时的离线只读降级：从 ledger / 基线读最近事实。 */
  async function offlineFacts(repo) {
    const baselineRaw = await readText(winJoin(winJoin(repo, '.aoci'), 'baseline.json'))
    let baselineUpdated = ''
    if (baselineRaw !== null) {
      const parsed = readJson(baselineRaw)
      baselineUpdated = parsed ? str(parsed.updated_at) : ''
    }
    const ledger = await ledgerTail(repo)
    const tail = await rawLedgerTail(repo, 30)
    const pick = (op) => {
      for (const item of tail) {
        if (item.op === op) return item
      }
      return null
    }
    const verify = pick('verify')
    const check = pick('check')
    return {
      baselineUpdated,
      lastVerify: verify ? verify.ts : '',
      lastVerifyResult: verify ? verify.result : '',
      lastCheck: check ? check.ts : '',
      lastCheckResult: check ? check.result : '',
      recentOps: ledger.map((item) => item.ts + ' ' + item.op + ' ' + item.result),
    }
  }

  /** ledger 尾部原始记录（不做 op 过滤），供离线时间线用。 */
  async function rawLedgerTail(repo, limit) {
    const raw = await readText(winJoin(winJoin(repo, '.aoci'), 'ledger.jsonl'))
    if (raw === null) return []
    const lines = str(raw)
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
    const out = []
    for (let index = lines.length - 1; index >= 0 && out.length < limit; index -= 1) {
      try {
        const record = JSON.parse(lines[index])
        out.push({ ts: str(record.ts), op: str(record.op), result: str(record.result) })
      } catch (error) {
        /* 跳过损坏行 */
      }
    }
    return out
  }

  /** 单仓库的轻量状态（workspaces 总览用）：文件事实 + status --json。 */
  async function lightStatus(repo, bin) {
    const manifestRaw = await readText(winJoin(repo, 'aoci.txt'))
    const hasIndex = manifestRaw !== null
    const offline = await offlineFacts(repo)
    if (!hasIndex) {
      return {
        hasIndex: false,
        repo,
        cachedAt: Date.now(),
        offline,
      }
    }
    const manifest = parseManifest(manifestRaw)
    const status = await runCli(bin, ['status', '--json', '--repo', repo], repo)
    const statusJson = status.json || null
    let entryCount = 0
    const volumeStates = statusJson && statusJson.volume_states ? statusJson.volume_states : {}
    for (const volume of manifest.volumes) {
      const body = volume.path ? await readText(winJoin(repo, volume.path)) : null
      if (body !== null) {
        const parsed = parseVolume(body, '')
        entryCount += parsed.entries.length
      }
    }
    return {
      hasIndex: true,
      repo,
      cachedAt: Date.now(),
      project: str(manifest.meta['Project']),
      formatVersion: str(manifest.meta['Format-Version']),
      entryCount,
      status: statusJson,
      volumeStates,
      offline,
      cliError: statusJson ? '' : str(status.error || status.detail || ''),
    }
  }

  /** 提示词工厂：按治理状态给出给 Agent 的维护 / 修复 / 恢复提示词。 */
  function buildPrompt(repo, kind, serverName) {
    const prefix = serverName ? 'mcp__' + serverName + '__' : ''
    const base =
      '仓库 ' +
      repo +
      '。只使用 ' +
      (prefix ? prefix : 'aoci_') +
      ' 前缀的 aoci 工具' +
      (prefix ? '（忽略 mcp__aoci__* 等其他前缀）' : '') +
      '；若 runtime_repository_root 不是本仓库，停下来报告绑定错误。'
    switch (kind) {
      case 'maintain':
        return (
          base +
          '本仓库受管对象已改到最终稳定状态，请在收尾时调用 ' +
          (prefix ? prefix : '') +
          'aoci_maintain 领取机器签发批次，基于真实证据创作完整 F/R/A/S 并经 aoci_update_entry 一次提交完整候选集合；remaining 非零则继续 Maintain 直到归零，最后 aoci_verify + aoci_check 保持 Whole-Index 对齐。'
        )
      case 'authoring':
        return (
          base +
          '本仓库尚未完成条目创作（索引存在但未对齐）。先调用 ' +
          (prefix ? prefix : '') +
          'aoci_rules 取得运行合同，再调用 ' +
          (prefix ? prefix : '') +
          'aoci_overview 建立认知，然后按当前 Guide 的阶段与安全停点执行 Fresh Bootstrap：创作 Header 与 Entries（F/R/A/S 由模型基于真实证据创作，不得猜写），直到 Whole-Index 对齐（aligned）。'
        )
      case 'repair':
        return (
          base +
          '维护批次被判定 repair_required。只修复 findings 明确命中的候选（retry_scope），其余条目保持字节不变，重新提交同一机器签发的完整批次；不要扩大改动范围，不要重写未命中的 Entry。'
        )
      case 'recovery':
        return (
          base +
          '治理状态存在待处理事务 / Recovery。先调用 ' +
          (prefix ? prefix : '') +
          'aoci_rules 与 aoci_overview 查看待处理事务与 failed_step，按 Guide 的 stopped 处置规则执行：可证明零写入则记录 closure 后重新 Plan；完整 Intent 与可证明 postimage 则 Resume；需要 Rollback 且 preimage 可证明则精确恢复。只有证据不足或第三方字节冲突才停下来请求人工裁决。'
        )
      default:
        return (
          base +
          '请调用 ' +
          (prefix ? prefix : '') +
          'aoci_rules 与 ' +
          (prefix ? prefix : '') +
          'aoci_overview 建立认知，然后按当前 Guide 完成下一步动作。'
        )
    }
  }

  /** 从 check/status 治理事实推断该仓库当下最需要哪种提示词。 */
  function promptKindFor(statusJson, governance) {
    if (governance && governance.recovery_pending) return 'recovery'
    if (governance && Number(governance.pending_transactions) > 0) return 'recovery'
    const findings = (governance && governance.findings) || []
    if (findings.some((item) => /repair/i.test(str(item.code) + str(item.rule_code)))) return 'repair'
    if (governance && governance.governance_aligned === true) return 'maintain'
    if (governance) return 'authoring'
    return 'default'
  }

  /** 多工作区总览。 */
  async function buildWorkspaces(query) {
    const binDir = str(query.get('binDir')) || BIN_DIR_DEFAULT
    const wantedBin = str(query.get('bin')) || ''
    const force = query.get('force') === '1'
    const deep = query.get('deep') === '1'
    const bins = await discoverBins(binDir)
    const bin = wantedBin || (bins.length > 0 ? bins[0].path : '')
    const sessionId = str(query.get('sessionId')) || ''
    const cwd = norm(sessionCwd(sessionId))
    const registry = ctx.get('workspaceRegistry')
    const list = []
    if (registry !== undefined) {
      try {
        for (const workspace of registry.list()) list.push(workspace)
      } catch (error) {
        /* registry 不可用 */
      }
    }
    const dshHome = await dshHomeOf(query.get('dshHome'))
    const targets = [{ target: PATCH_HOME, path: dshHome ? winJoin(dshHome, 'cordis.patch.yml') : '' }]
    for (const profile of await profilePatchTargets(dshHome)) targets.push(profile)
    const rows = []
    for (const item of targets) {
      const fileRows = await readPatchRows(item.path)
      if (fileRows === null) continue
      for (const row of fileRows) rows.push({ target: item.target, path: item.path, row })
    }
    const boundByKey = new Map()
    for (const entry of rows) {
      if (!isAociRow(entry.row)) continue
      const key = rowRepoKey(entry.row)
      if (!key) continue
      const listForKey = boundByKey.get(key) || []
      listForKey.push({
        target: entry.target,
        id: entry.row.id,
        serverName: str(entry.row.serverName),
        command: str(entry.row.command),
        binRank: rowBinRank(entry.row),
      })
      boundByKey.set(key, listForKey)
    }
    const conflicts = new Map()
    for (const entry of rows) {
      if (!isAociRow(entry.row)) continue
      const name = str(entry.row.serverName)
      if (!name) continue
      conflicts.set(name, (conflicts.get(name) || 0) + 1)
    }
    const workspaces = []
    for (const workspace of list) {
      const path = str(workspace.path)
      if (!path) continue
      const repoNorm = norm(path)
      const key = normPathKey(path)
      const isSession = !!cwd && (cwd === repoNorm || cwd.indexOf(repoNorm + '/') === 0)
      const bound = boundByKey.get(key) || []
      const binding = bound.map((item) => ({
        target: item.target,
        id: item.id,
        serverName: item.serverName,
        namespace: item.serverName ? 'mcp__' + item.serverName + '__' : '',
        binRank: item.binRank,
        conflict: item.serverName ? (conflicts.get(item.serverName) || 0) > 1 : false,
      }))
      let snap = null
      if (deep) {
        snap = await snapshotFor(path, bin, force)
      } else {
        snap = await lightFor(path, bin, force)
      }
      workspaces.push({
        id: str(workspace.id),
        title: str(workspace.title),
        path,
        isSession,
        hasIndex: snap.hasIndex,
        project: str(snap.project || ''),
        entryCount: snap.entryCount !== undefined ? snap.entryCount : (snap.entries ? snap.entries.length : 0),
        status: snap.status || null,
        volumeStates: snap.volumeStates || (snap.status && snap.status.volume_states) || {},
        governance: snap.governance || null,
        check: snap.check || null,
        binding,
        offline: snap.offline || null,
        cliError: str(snap.cliError || ''),
        cachedAt: snap.cachedAt || 0,
      })
    }
    return {
      binDir,
      bins,
      bin,
      dshHome,
      homes: await dshHomes(query),
      aociCliVersion: await cliVersion(bin),
      sessionRepo: cwd,
      generatedAt: Date.now(),
      deep,
      workspaces,
    }
  }

  /** 快捷动作：verify / check / status / doctor / guide。 */
  async function runAction(body) {
    if (!body || typeof body !== 'object') return { error: '请求体必须是 JSON 对象' }
    const repo = norm(str(body.repo).trim())
    const bin = str(body.bin).trim()
    const action = str(body.action)
    if (!repo) return { error: '缺少仓库路径' }
    if (!bin) return { error: '未指定 aoci 可执行文件' }
    const argvByKey = {
      verify: ['verify', '--json', '--repo', repo],
      check: ['check', '--json', '--repo', repo],
      status: ['status', '--json', '--repo', repo],
      doctor: ['doctor', '--json', '--repo', repo],
      guide: ['index', 'agent', 'guide', '--agent', 'codex', '--json', '--repo', repo],
    }
    const argv = argvByKey[action]
    if (!argv) return { error: '未知动作：' + action }
    const result = await runCli(bin, argv, repo)
    if (action === 'verify' || action === 'check') invalidateRepo(repo)
    if (!result.ran) {
      return { error: result.error || action + ' 未执行', detail: str(result.detail), action }
    }
    const payload = result.json
    return {
      action,
      ok: true,
      json: payload,
      summary: summarizeAction(action, payload),
      transport: result.transport,
      exitCode: result.exitCode,
    }
  }

  /** 人话摘要 + 错误码解释 + 下一步。 */
  function summarizeAction(action, payload) {
    const out = { headline: '', explain: [], next: '' }
    if (!payload) return out
    if (action === 'verify' || action === 'check') {
      const gov = payload.governance || {}
      const aligned = payload.governance_aligned === true
      out.headline = aligned ? '已对齐（aligned）' : '未对齐：' + str(gov.result || payload.result || '')
      for (const item of payload.findings || []) {
        out.explain.push({
          code: str(item.code || item.rule_code || ''),
          text: humanFinding(item),
          fix: str(item.safe_repair_action || item.cause || ''),
        })
      }
      if (gov.recovery_pending) {
        out.next = '存在待处理 Recovery/事务：用「recovery」提示词交给 Agent 按 Guide 处置。'
      } else if (aligned) {
        out.next = '无需动作；受管对象再有改动时用「maintain」提示词收尾维护。'
      } else {
        out.next = '用「' + promptKindFor(payload, gov) + '」提示词交给 Agent 处理。'
      }
    } else if (action === 'guide') {
      out.headline = payload.complete === true ? '阶段 ' + str(payload.stage) + '（complete）' : '阶段 ' + str(payload.stage) + '，next_action=' + str(payload.next_action)
      out.next = payload.complete === true ? '无待办。' : '把「' + promptKindFor(payload, payload.governance) + '」提示词交给该仓库的 Agent。'
    } else if (action === 'status') {
      out.headline = 'index_entries=' + str(payload.index_entries) + '，layout=' + str(payload.layout_mode)
      out.next = '纯读速览；对齐结论以 check 为准。'
    } else if (action === 'doctor') {
      out.headline = 'doctor 完成（详见输出）'
      out.next = '环境问题按输出逐项处理；doctor 只读，不改任何文件。'
    }
    return out
  }

  /** 把 findings 翻成人话。 */
  function humanFinding(item) {
    const code = str(item.code || item.rule_code || '')
    const cause = str(item.cause || '')
    const map = {
      missing: '条目对应的源文件已缺失（missing）',
      orphan: '条目指向的源文件不在受管清单里（orphan）',
      stale: '源文件在基线之后又变了（stale）',
      unbaselined: '源文件未纳入基线（unbaselined）',
      repair_required: '批次需要修复后重提（repair_required）',
    }
    for (const key of Object.keys(map)) {
      if (code.toLowerCase().indexOf(key) >= 0) return map[key] + (cause ? '：' + cause : '')
    }
    return (code || '未命名 finding') + (cause ? '：' + cause : '')
  }

  /* ------------------------------------------------------------------ *
   * 单仓库快照 / 条目 / 校验。
   * ------------------------------------------------------------------ */

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
    invalidateRepo(repo)
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

  /** 认知视图：索引覆盖/约束缺口/预算/治理 + 账本/须知/地图/时间线/资产。只读。 */
  async function buildCognition(query) {
    const repo = query.get('repo') || ''
    const bin = query.get('bin') || ''
    if (!repo) return { error: '缺少仓库路径' }
    const snap = await snapshotFor(repo, bin, false)
    if (snap && snap.hasIndex === false) return { error: '该仓库没有 aoci.txt' }
    try {
      return await collectCognition(repo, snap ? snap.governance : null)
    } catch (error) {
      return { error: '认知数据读取失败：' + str(error && error.message ? error.message : error) }
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

  /** 读取 POST 的 JSON 请求体；超限或非法 JSON 解析为 null，由处理器统一拒绝。 */
  function readBody(req) {
    return new Promise((resolve, reject) => {
      let text = ''
      let size = 0
      let settled = false
      req.setEncoding('utf8')
      req.on('data', (chunk) => {
        if (settled) return
        size += chunk.length
        if (size > BODY_LIMIT) {
          settled = true
          resolve(null)
          return
        }
        text += chunk
      })
      req.on('end', () => {
        if (settled) return
        settled = true
        if (!text.trim()) {
          resolve({})
          return
        }
        try {
          resolve(JSON.parse(text))
        } catch (error) {
          resolve(null)
        }
      })
      req.on('error', (error) => {
        if (settled) return
        settled = true
        reject(error)
      })
    })
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

  /** POST 变体：读 JSON 请求体，交给处理器。 */
  function routePost(handler) {
    return async (req, res) => {
      try {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: '仅支持 POST' })
          return
        }
        const body = await readBody(req)
        sendJson(res, 200, await handler(body))
      } catch (error) {
        sendJson(res, 500, { error: clip(error && error.message ? error.message : error, 500) })
      }
    }
  }

  /** GET/POST 合并路由（webServer 对同 path 重复注册会抛错）。 */
  function routeBoth(getHandler, postHandler) {
    return async (req, res) => {
      if (req.method === 'POST') return routePost(postHandler)(req, res)
      return route(getHandler)(req, res)
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
        path: '/aoci-panel/cognition',
        handler: route(buildCognition),
      }),
    'aoci-panel: cognition route',
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
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/aoci-panel/workspaces',
        handler: route(buildWorkspaces),
      }),
    'aoci-panel: workspaces route',
  )
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/aoci-panel/binding',
        handler: route(buildBinding),
      }),
    'aoci-panel: binding route',
  )
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/aoci-panel/action',
        handler: routeBoth(() => ({ error: '缺少动作参数' }), runAction),
      }),
    'aoci-panel: action route',
  )
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/aoci-panel/install',
        handler: routeBoth(buildInstallPlan, runInstall),
      }),
    'aoci-panel: install route',
  )
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/aoci-panel/fix-binding',
        handler: routeBoth(() => ({ error: '缺少参数' }), runFixBinding),
      }),
    'aoci-panel: fix-binding route',
  )
}
