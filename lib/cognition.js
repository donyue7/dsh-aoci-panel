/**
 * dsh-aoci-panel —— 认知视图数据层（纯 Node，只读）。
 *
 * 面板的「认知」tab 回答一个问题：AOCI 对这个仓库到底做了什么、对开发者
 * 有什么用。数据全部来自仓库内既有产物，本模块不调用 aoci CLI、不写任何
 * 文件、不修改 aoci.txt / .aoci 正式资产：
 *
 *   1. 条目与约束：解析 aoci.code.txt（F/R/A/S），抽出全部 S 约束与目录分布；
 *   2. 变更账本：`git log -p -- aoci.code.txt`，逐提交列出新增/更新/删除的条目；
 *   3. 健康时间线：列举 .aoci/verify_history 里最近的 verify 记录；
 *   4. 资产清单：aoci.txt / aoci.code.txt / aoci.meta.txt / .aoci/baseline.json
 *      / .aoci/ledger.jsonl / .aoci/verify_history 的存在、大小与最后写入时间。
 *
 * 与宿主半的其余部分（lib/index.js）保持同样的只读边界；这里的 node:fs 与
 * node:child_process 用法都限定在读取仓库文件与执行 `git log` 两类操作。
 */

import { promises as fsp } from 'node:fs'
import { execFile } from 'node:child_process'
import { join } from 'node:path'

/** 变更账本最多回看多少个提交。 */
const COMMIT_LIMIT = 8
/** 账本里展示的 F 摘要长度。 */
const LEDGER_F_LIMIT = 200
/** 健康时间线最多展示多少条 verify 记录。 */
const VERIFY_LIMIT = 10
/** git 调用的兜底超时（毫秒）。 */
const GIT_TIMEOUT_MS = 20000

/** AOCI 在仓库里生成并维护的资产；用途文案与 README 保持一致。 */
const ASSET_SPEC = [
  { path: 'aoci.txt', use: '项目根卷：Header/Meta 规则与全局认知入口' },
  { path: 'aoci.code.txt', use: '代码卷：逐文件认知（F/R/A/S）' },
  { path: 'aoci.meta.txt', use: '元卷：项目级共享规则与标签字典' },
  { path: join('.aoci', 'baseline.json'), use: '基线指纹：受管源文件的内容哈希' },
  { path: join('.aoci', 'ledger.jsonl'), use: '治理账本：每次 maintain/verify 的审计记录' },
  { path: join('.aoci', 'verify_history'), use: '校验历史：最近若干次 verify 记录', dir: true },
]

function str(value) {
  return value === undefined || value === null ? '' : String(value)
}

function num(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function clip(value, limit) {
  const text = str(value)
  return text.length > limit ? text.slice(0, limit) + '…' : text
}

/** 路径归一：反斜杠转正斜杠、去掉尾部斜杠（与宿主半 norm 一致）。 */
function norm(value) {
  return str(value).replace(/\\/g, '/').replace(/\/+$/, '')
}

function winJoin(dir, leaf) {
  return str(dir).replace(/[\\/]+$/, '') + '\\' + str(leaf)
}

/** 解析根清单：`#Key: value` 进 meta，`#Volume: k=v ...` 进 volumes。 */
export function parseManifest(raw) {
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

/**
 * 解析卷文件：`===<目录>===` 为分节，其余非注释行为
 * `name[TAGS]: F:… | R:… | A:… | S:…`。切分方式与宿主半 parseVolume 一致。
 */
export function parseVolume(raw, repoRoot) {
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
    const rootLow = norm(repoRoot).toLowerCase()
    const rel =
      rootLow && dirNorm.toLowerCase().indexOf(rootLow) === 0
        ? dirNorm.slice(norm(repoRoot).length).replace(/^\/+/, '')
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
  return entries
}

/**
 * 从一段 `git log -p` 文本解析逐提交的条目变更。
 *
 * 输入格式由本模块调用处固定为 `--format=@@@%h|%ad|%s --date=iso-strict`，
 * 因此提交头可无歧义识别；其余行只看 diff 的 `+` / `-` 前缀。
 */
export function parseCommitLog(raw) {
  const commits = []
  let current = null
  let dir = ''
  const push = () => {
    if (current) commits.push(current)
  }
  for (const line of str(raw).split(/\r?\n/)) {
    if (line.indexOf('@@@') === 0) {
      push()
      const parts = line.slice(3).split('|')
      current = {
        hash: str(parts[0]).trim(),
        date: str(parts[1]).trim(),
        subject: str(parts.slice(2).join('|')).trim(),
        ops: [],
      }
      dir = ''
      continue
    }
    if (!current) continue
    const marker = line.charAt(0)
    if (marker !== '+' && marker !== '-' && marker !== ' ') continue
    const body = line.slice(1)
    const section = /^=+\s*(.*?)\s*=+$/.exec(body.trim())
    if (section) {
      dir = section[1]
      continue
    }
    const head = /^(.+?)\[([^\]]*)\]:\s*(.*)$/.exec(body.trim())
    if (!head) continue
    const kind = marker === '+' ? 'add' : marker === '-' ? 'del' : 'ctx'
    if (kind === 'ctx') continue
    const rest = head[3]
    let f = rest
    if (rest.indexOf('F:') === 0) {
      const iR = rest.indexOf(' | R:')
      f = iR > 2 ? rest.slice(2, iR) : rest.slice(2)
    }
    current.ops.push({
      kind,
      name: head[1].trim(),
      tags: head[2].trim(),
      dir: norm(dir),
      f: clip(f.trim(), LEDGER_F_LIMIT),
    })
  }
  push()
  for (const commit of commits) {
    // 同一提交里先删后加同一文件（内容重写）只要有一处 add 就记为更新
    const seen = {}
    for (const op of commit.ops) {
      const key = op.dir + '/' + op.name
      if (op.kind === 'add' && seen[key] === 'del') {
        op.kind = 'update'
        seen[key] = 'update'
      } else {
        seen[key] = op.kind
      }
    }
    commit.ops = commit.ops.filter((op) => op.kind !== 'del' || seen[op.dir + '/' + op.name] !== 'update')
    commit.changed = commit.ops.length
  }
  return commits
}

/** 执行一个本地命令并返回 stdout（失败时返回空串，不抛错）。 */
function runCapture(file, args, cwd) {
  return new Promise((resolve) => {
    let settled = false
    const done = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    try {
      execFile(
        file,
        args,
        { cwd, timeout: GIT_TIMEOUT_MS, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
        (error, stdout) => done(error ? '' : str(stdout)),
      )
    } catch (error) {
      done('')
    }
    setTimeout(() => done(''), GIT_TIMEOUT_MS + 2000).unref?.()
  })
}

/** 读取目录列表；不存在或不可读时返回空数组。 */
async function listDirSafe(dir) {
  try {
    const items = await fsp.readdir(join(dir), { withFileTypes: true })
    return items.map((item) => ({ name: item.name, dir: item.isDirectory() }))
  } catch (error) {
    return []
  }
}

/** 读取文件大小与修改时间；不存在时返回 null。 */
async function statSafe(path) {
  try {
    const info = await fsp.stat(path)
    return { size: info.size, mtime: info.mtimeMs, dir: info.isDirectory() }
  } catch (error) {
    return null
  }
}

/** 列出 verify 历史（文件名按时间倒序，取最近若干条）。 */
async function readVerifies(repo) {
  const dir = join(repo, '.aoci', 'verify_history')
  const files = (await listDirSafe(dir))
    .filter((item) => item.dir === false && /\.txt$/i.test(item.name))
    .map((item) => item.name)
    .sort()
    .reverse()
    .slice(0, VERIFY_LIMIT)
  const out = []
  for (const name of files) {
    let text = ''
    try {
      text = await fsp.readFile(join(dir, name), 'utf8')
    } catch (error) {
      continue
    }
    const result = clip(str(text).split(/\r?\n/)[0], 160)
    const composite = (/composite_identity:\s*([0-9a-f]{64})/i.exec(text) || [])[1] || ''
    const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(name)
    const ms = match
      ? Date.UTC(
          Number(match[1]),
          Number(match[2]) - 1,
          Number(match[3]),
          Number(match[4]),
          Number(match[5]),
          Number(match[6]),
        )
      : null
    out.push({ file: name, time: ms, result, composite })
  }
  return out
}

/** 把条目聚合成目录维度：条目数、S 覆盖数、C9 高价值条目数。 */
export function aggregateDirs(entries) {
  const map = new Map()
  for (const entry of entries) {
    const key = entry.dir || '.'
    const row = map.get(key) || { dir: key, count: 0, sCount: 0, c9: 0 }
    row.count += 1
    if (entry.s && entry.s !== '-') row.sCount += 1
    if (/C9/.test(entry.tags)) row.c9 += 1
    map.set(key, row)
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.dir.localeCompare(b.dir))
}

/**
 * 收集一个仓库的认知视图全部数据。
 *
 * @param repo 仓库绝对路径。
 * @param governance 宿主半快照里的 `check --json` governance 事实（可为 null）。
 * @returns 认知视图数据；仓库没有 aoci.txt 时返回 `{ hasIndex: false }`。
 */
export async function collectCognition(repo, governance) {
  const manifestRaw = await fsp.readFile(winJoin(repo, 'aoci.txt'), 'utf8').catch(() => null)
  if (manifestRaw === null) return { hasIndex: false, repo }
  const manifest = parseManifest(manifestRaw)
  const entries = []
  for (const volume of manifest.volumes) {
    if (volume.kind !== 'code' && volume.kind !== 'database') continue
    if (!volume.path) continue
    const body = await fsp.readFile(winJoin(repo, volume.path), 'utf8').catch(() => null)
    if (body === null) continue
    for (const entry of parseVolume(body, repo)) {
      entries.push({ ...entry, domain: volume.kind })
    }
  }

  const constraints = entries
    .filter((entry) => entry.s && entry.s !== '-')
    .map((entry) => ({ id: entry.id, name: entry.name, dir: entry.dir, tags: entry.tags, s: entry.s }))

  const log = await runCapture(
    'git',
    [
      '-C',
      repo,
      'log',
      '-p',
      '-' + String(COMMIT_LIMIT),
      '--date=iso-strict',
      '--format=@@@%h|%ad|%s',
      '--',
      'aoci.code.txt',
    ],
    repo,
  )
  const commits = parseCommitLog(log)

  const assets = []
  for (const spec of ASSET_SPEC) {
    const info = await statSafe(winJoin(repo, spec.path))
    const volume = manifest.volumes.filter((item) => norm(item.path) === norm(spec.path))[0]
    assets.push({
      path: spec.path.replace(/\\/g, '/'),
      use: spec.use,
      exists: info !== null,
      size: info ? (spec.dir ? null : info.size) : null,
      mtime: info ? info.mtime : null,
      missing: volume ? volume.state === 'missing' : false,
    })
  }

  const verifies = await readVerifies(repo)

  // 治理事实（check --json 的 governance）是可选的：调用方没给二进制、或
  // aoci check 不可用时拿不到。这时绝不能把「不知道」写成 0 / false ——
  // 那会让消费者把「没查到」误读成「这个仓 0 源、未对齐」。凡是只能由
  // governance 得出的指标一律给 null，并用 degraded + reason 显式说明。
  const govAvailable =
    governance !== null &&
    governance !== undefined &&
    typeof governance === 'object' &&
    !Array.isArray(governance) &&
    Object.keys(governance).length > 0
  const g = govAvailable ? governance : {}
  const drift = g.code_drift || {}
  const budget = g.budget || {}
  const scope = g.managed_scope || {}
  const sCov = Array.isArray(budget.s_coverage) ? budget.s_coverage : []
  const latest = commits[0] || null

  // 由索引文本本身可得的数字（不依赖 governance）。
  const textEntries = entries.length
  const textS = constraints.length
  const sourceCount = govAvailable ? num(g.code_source_count) : null
  const entryCount = govAvailable ? num(g.code_entry_count) : textEntries
  const sEntries = govAvailable
    ? sCov.reduce((sum, row) => sum + num(row.entries), 0)
    : textEntries
  const sPresent = govAvailable
    ? sCov.reduce((sum, row) => sum + num(row.s_present), 0)
    : textS
  const missingConstraints = govAvailable ? num(budget.high_importance_s_absent) : null
  const important = govAvailable ? num(budget.high_importance_entries) : null

  const metrics = {
    governanceAvailable: govAvailable,
    project: str(manifest.meta['Project']),
    sourceCount,
    entryCount,
    coveragePct:
      sourceCount !== null && sourceCount > 0 ? Math.round((entryCount / sourceCount) * 100) : null,
    blindSpots: sourceCount !== null ? Math.max(sourceCount - entryCount, 0) : null,
    sEntries,
    sPresent,
    sPct: sEntries > 0 ? Math.round((sPresent / sEntries) * 100) : null,
    missingConstraints,
    important,
    missingPct:
      important !== null && important > 0
        ? Math.round((missingConstraints / important) * 100)
        : null,
    budgetTokens: govAvailable ? num(budget.whole_index_tokens) : null,
    budgetTarget: govAvailable ? num(budget.target_tokens) : null,
    budgetPct:
      govAvailable && num(budget.target_tokens) > 0
        ? Math.round((num(budget.whole_index_tokens) / num(budget.target_tokens)) * 100)
        : null,
    budgetStatus: govAvailable ? str(budget.status) : null,
    aligned: govAvailable ? g.governance_aligned === true : null,
    driftCount: govAvailable
      ? num(drift.missing) + num(drift.orphan) + num(drift.stale) + num(drift.unbaselined)
      : null,
    pendingTransactions: govAvailable ? num(g.pending_transactions) : null,
    scopeIndex: govAvailable ? num(scope.index_count) : null,
    scopeObserve: govAvailable ? num(scope.observe_count) : null,
    scopeExclude: govAvailable ? num(scope.exclude_count) : null,
    latest: latest
      ? { hash: latest.hash, date: latest.date, subject: latest.subject, changed: latest.changed }
      : null,
    changeCount: commits.reduce((sum, commit) => sum + commit.changed, 0),
  }

  return {
    hasIndex: true,
    repo,
    degraded: !govAvailable,
    reason: govAvailable
      ? null
      : '治理快照不可用（未传 bin 参数，或本机 aoci 二进制不可用）：覆盖/预算/对齐等指标暂缺，其余视图（账本、约束、地图、资产）不受影响。',
    metrics,
    constraints,
    dirs: aggregateDirs(entries),
    commits,
    verifies,
    assets,
  }
}
