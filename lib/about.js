/**
 * 插件自身版本与更新检查（宿主半）。
 *
 * 只做三件事：
 *   1. 读到自己安装后的版本（package.json），用于面板展示与更新判断；
 *   2. 查询 npm registry 的 `latest` 版本（内存缓存 + 超时 + 失败降级）；
 *   3. 生成一条可直接复制的更新命令（复用 DSH 的安装机制，不自动执行）。
 *
 * 更新检查是**可选**的：网络不可用、registry 不可达或用户关闭 updateCheck 时，
 * 面板照常工作，只是不显示「有新版本」。
 */

/** 解析 SemVer（允许前缀 v 与 build 元数据），非法返回 null。 */
export function parseVersion(value) {
  const text = String(value === undefined || value === null ? '' : value)
    .trim()
    .replace(/^v/i, '')
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(text)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
  }
}

function comparePrerelease(a, b) {
  if (a === b) return 0
  if (a === '') return 1
  if (b === '') return -1
  const left = a.split('.')
  const right = b.split('.')
  const size = Math.max(left.length, right.length)
  for (let i = 0; i < size; i += 1) {
    const x = left[i]
    const y = right[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = /^\d+$/.test(x)
    const ny = /^\d+$/.test(y)
    if (nx && ny) {
      const diff = Number(x) - Number(y)
      if (diff !== 0) return diff < 0 ? -1 : 1
      continue
    }
    if (nx !== ny) return nx ? -1 : 1
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/**
 * 比较两个 SemVer。
 *
 * @returns {number} -1 / 0 / 1；任一侧非法时抛错（版本号是发布契约，不静默）。
 */
export function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a) throw new Error(`非法版本号：${left}`)
  if (!b) throw new Error(`非法版本号：${right}`)
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1
  }
  return comparePrerelease(a.prerelease, b.prerelease)
}

/** 候选版本是否比当前版本新（无法解析时返回 false，不误报更新）。 */
export function isNewer(candidate, current) {
  try {
    return compareVersions(candidate, current) > 0
  } catch (error) {
    return false
  }
}

/**
 * 生成更新命令。
 *
 * 链接安装（`dsh plugin add <本仓库目录>`）的 profile 也用同一条命令改为安装
 * registry 版本；`@latest` 由 pnpm 解析，便于用户复制执行。
 */
export function updateCommand(options) {
  const opts = options || {}
  const name = opts.packageName || 'dsh-aoci-panel'
  const version = opts.version || 'latest'
  const profile = opts.profile || 'desktop'
  const cli = opts.cli || 'dsh'
  return `${cli} plugin --profile ${profile} add ${name}@${version}`
}

/** 解析本次运行使用的 profile：显式配置 → DSH_PROFILE → desktop。 */
export function resolveProfile(configured, env) {
  const fromConfig = String(configured || '').trim()
  if (fromConfig) return fromConfig
  const fromEnv = String((env || {}).DSH_PROFILE || '').trim()
  return fromEnv || 'desktop'
}

/** 从 registry 的 `/<name>/latest` 取版本号；调用方负责超时与错误展示。 */
export async function fetchLatestVersion(options) {
  const opts = options || {}
  const registryUrl = String(opts.registryUrl || 'https://registry.npmjs.org').replace(/\/+$/, '')
  const name = opts.packageName || 'dsh-aoci-panel'
  const url = `${registryUrl}/${encodeURIComponent(name)}/latest`
  const response = await opts.fetcher(url, { timeoutMs: opts.timeoutMs })
  const status = Number(response && response.status)
  if (!Number.isFinite(status) || status < 200 || status >= 300) {
    throw new Error(`registry 返回 HTTP ${Number.isFinite(status) ? status : '?'}`)
  }
  let parsed
  try {
    parsed = JSON.parse(String(response.text || ''))
  } catch (error) {
    throw new Error('registry 响应不是合法 JSON')
  }
  const version = parsed && parsed.version
  if (!parseVersion(version)) throw new Error('registry 响应缺少合法的 version')
  return String(version)
}

/**
 * 创建带缓存的更新检查器。
 *
 * @param {object} options
 * @param {string} options.version 当前安装版本。
 * @param {(url: string, init: {timeoutMs: number}) => Promise<{status: number, text: string}>} options.fetcher
 * @returns {{ get: (force?: boolean) => Promise<object> }}
 */
export function createUpdateChecker(options) {
  const opts = options || {}
  const packageName = opts.packageName || 'dsh-aoci-panel'
  const current = String(opts.version || '0.0.0')
  const enabled = opts.enabled !== false
  const ttlMs = Number(opts.ttlMs) || 0
  const now = opts.now || (() => Date.now())
  let cached = null
  let inflight = null

  function state(extra) {
    const latest = extra.latest
    const available = latest ? isNewer(latest, current) : null
    return {
      packageName,
      version: current,
      enabled,
      checkedAt: extra.checkedAt,
      latest: latest || null,
      updateAvailable: available,
      error: extra.error || null,
    }
  }

  async function load() {
    const checkedAt = now()
    try {
      const latest = await fetchLatestVersion({
        registryUrl: opts.registryUrl,
        packageName,
        timeoutMs: opts.timeoutMs,
        fetcher: opts.fetcher,
      })
      return state({ latest, checkedAt })
    } catch (error) {
      return state({
        latest: null,
        checkedAt,
        error: error && error.message ? error.message : String(error),
      })
    }
  }

  return {
    async get(force) {
      if (!enabled) return state({ checkedAt: null, error: null })
      const age = cached ? now() - cached.checkedAt : Infinity
      if (!force && cached && age < ttlMs) return cached
      if (inflight) return inflight
      inflight = load().then((next) => {
        cached = next
        inflight = null
        return next
      })
      return inflight
    },
  }
}
