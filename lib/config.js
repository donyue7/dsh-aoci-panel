/**
 * 插件配置：默认值、规格化与校验。
 *
 * 本包不依赖 @deepseek-ai/schemastery，因此不导出 Cordis 的 `Config` schema，
 * 而是在宿主半装载时用这里做同等强度的校验：类型不对、URL 非法、取值越界都在
 * 装载期直接抛错（响亮失败），未知字段也报错，避免拼错字段后静默使用默认值。
 *
 * 用户在 profile 的 `cordis.patch.yml` 里按行 id 覆盖配置：
 *
 *   - id: dsh-aoci-panel
 *     name: dsh-aoci-panel
 *     config:
 *       binDir: 'D:\\aoci\\bin'
 *       updateCheck: false
 */

/** 默认配置；每一项都对应 README「配置」表里的一行。 */
import { DEFAULT_CONFIG as BIND_CONFIG_DEFAULTS } from './bind/config.js'

export const DEFAULT_CONFIG = Object.freeze({
  /** aoci 可执行文件所在目录（Windows 桌面版默认约定）。 */
  binDir: 'C:\\aoci\\bin',
  /** 直接指定 aoci 可执行文件；非空时优先于 binDir 的自动探测。 */
  binPath: '',
  /** 单次 aoci CLI 调用的超时（毫秒）。 */
  cliTimeoutMs: 120000,
  /** 快照缓存有效期（毫秒）；0 表示只在进程内缓存、直到显式刷新。 */
  cacheTtlMs: 0,
  /** 批量初始化允许的仓库数上限。 */
  batchLimit: 20,
  /** 安装向导默认 locale，同时也是 aoci init 的 --locale 取值。 */
  locale: 'zh-CN',
  /** 是否查询 npm registry 检查插件自身是否有新版本。 */
  updateCheck: true,
  /** npm registry 地址（可指向私有镜像）。 */
  registryUrl: 'https://registry.npmjs.org',
  /** 更新检查的超时（毫秒）。 */
  updateCheckTimeoutMs: 5000,
  /** 更新检查结果的内存缓存时间（毫秒）。 */
  updateCheckTtlMs: 21600000,
  /** 更新命令里使用的 profile 名；留空时读取 DSH_PROFILE，再回退到 desktop。 */
  profile: '',
  /**
   * 合并自 dsh-aoci-bind 的 AOCI 接入工具配置，字段与 lib/bind/config.js 的
   * DEFAULT_CONFIG 一致（enabled / tools / promptSection / aociBinary / home /
   * profile / legacyHome / syncProfilePatch / serverNamePrefix / scanRoots /
   * backupDir / initTimeoutMs / probeTimeoutMs，另可用 profileDir 显式指定
   * profile 目录）。空对象 = 全部使用 bind 的默认值；aociBinary 留空时自动
   * 复用面板探测到的 aoci（binPath 或 binDir 里 rc 版本最高者）。
   */
  bind: Object.freeze({}),
})

/** 允许的字段名，用于未知字段报错。 */
export const CONFIG_KEYS = Object.freeze(Object.keys(DEFAULT_CONFIG))

/** bind 子配置允许的字段名（bind 的默认配置 + profileDir）。 */
export const BIND_CONFIG_KEYS = Object.freeze([...Object.keys(BIND_CONFIG_DEFAULTS), 'profileDir'])

/** bind 子配置中接受布尔值的字段。 */
const BIND_BOOL_KEYS = ['enabled', 'tools', 'promptSection', 'syncProfilePatch']
/** bind 子配置中接受字符串的字段。 */
const BIND_STRING_KEYS = ['aociBinary', 'home', 'profile', 'profileDir', 'serverNamePrefix', 'backupDir']
/** bind 子配置中接受毫秒整数的字段。 */
const BIND_MS_KEYS = ['initTimeoutMs', 'probeTimeoutMs']

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 校验 bind 子配置：字段名拼错、类型不对都在装载期报错；取值本身交给
 * lib/bind/config.js 的 normalizeConfig 在注册工具时补默认值与展开路径。
 */
function asBindConfig(key, value, fallback) {
  if (value === undefined || value === null) return { ...fallback }
  if (!isPlainObject(value)) fail(`${key} 必须是对象（收到 ${Array.isArray(value) ? 'array' : typeof value}）`)
  const unknown = Object.keys(value).filter((item) => !BIND_CONFIG_KEYS.includes(item))
  if (unknown.length > 0) {
    fail(`${key} 含未知字段 ${unknown.join('、')}（可用字段：${BIND_CONFIG_KEYS.join('、')}）`)
  }
  const out = {}
  for (const [field, fieldValue] of Object.entries(value)) {
    if (fieldValue === undefined) continue
    if (BIND_BOOL_KEYS.includes(field)) {
      if (typeof fieldValue !== 'boolean') {
        fail(`${key}.${field} 必须是 true/false（收到 ${JSON.stringify(fieldValue)}）`)
      }
      out[field] = fieldValue
      continue
    }
    if (BIND_STRING_KEYS.includes(field)) {
      if (typeof fieldValue !== 'string') fail(`${key}.${field} 必须是字符串（收到 ${typeof fieldValue}）`)
      out[field] = fieldValue.trim()
      continue
    }
    if (field === 'legacyHome') {
      if (!['auto', 'on', 'off'].includes(fieldValue)) {
        fail(`${key}.legacyHome 只接受 auto / on / off（收到 ${JSON.stringify(fieldValue)}）`)
      }
      out[field] = fieldValue
      continue
    }
    if (field === 'scanRoots') {
      if (!Array.isArray(fieldValue) || fieldValue.some((entry) => typeof entry !== 'string')) {
        fail(`${key}.scanRoots 必须是字符串数组`)
      }
      out[field] = fieldValue.map((entry) => entry.trim()).filter((entry) => entry !== '')
      continue
    }
    if (BIND_MS_KEYS.includes(field)) {
      out[field] = asNumber(`${key}.${field}`, fieldValue, BIND_CONFIG_DEFAULTS[field], {
        min: 1000,
        max: 3600000,
      })
      continue
    }
    out[field] = fieldValue
  }
  return out
}

const LOCALES = ['zh-CN', 'en-US']

function fail(message) {
  throw new Error('[dsh-aoci-panel] 配置无效：' + message)
}

function asString(key, value, fallback) {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string') fail(`${key} 必须是字符串（收到 ${typeof value}）`)
  return value.trim()
}

function asNumber(key, value, fallback, options) {
  if (value === undefined || value === null) return fallback
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(n)) fail(`${key} 必须是数字（收到 ${JSON.stringify(value)}）`)
  if (!Number.isInteger(n)) fail(`${key} 必须是整数（收到 ${n}）`)
  if (options.min !== undefined && n < options.min) fail(`${key} 不能小于 ${options.min}（收到 ${n}）`)
  if (options.max !== undefined && n > options.max) fail(`${key} 不能大于 ${options.max}（收到 ${n}）`)
  return n
}

function asBoolean(key, value, fallback) {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'boolean') fail(`${key} 必须是 true/false（收到 ${JSON.stringify(value)}）`)
  return value
}

function asRegistryUrl(key, value, fallback) {
  const raw = asString(key, value, fallback)
  let url
  try {
    url = new URL(raw)
  } catch (error) {
    fail(`${key} 不是合法 URL：${raw}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') fail(`${key} 必须使用 http(s)：${raw}`)
  if (url.username || url.password) fail(`${key} 不能包含用户名或密码`)
  if (url.hash) fail(`${key} 不能包含 # 片段`)
  return raw.replace(/\/+$/, '')
}

/**
 * 把用户配置规格化为完整配置。
 *
 * @param {Record<string, unknown> | undefined} raw 行里的 config。
 * @returns {typeof DEFAULT_CONFIG} 完整配置（新对象，可安全修改）。
 */
export function normalizeConfig(raw) {
  if (raw === undefined || raw === null) return { ...DEFAULT_CONFIG }
  if (typeof raw !== 'object' || Array.isArray(raw)) fail('config 必须是对象')

  const unknown = Object.keys(raw).filter((key) => !CONFIG_KEYS.includes(key))
  if (unknown.length > 0) {
    fail(`未知字段 ${unknown.join('、')}（可用字段：${CONFIG_KEYS.join('、')}）`)
  }

  const config = {
    binDir: asString('binDir', raw.binDir, DEFAULT_CONFIG.binDir),
    binPath: asString('binPath', raw.binPath, DEFAULT_CONFIG.binPath),
    cliTimeoutMs: asNumber('cliTimeoutMs', raw.cliTimeoutMs, DEFAULT_CONFIG.cliTimeoutMs, {
      min: 1000,
      max: 3600000,
    }),
    cacheTtlMs: asNumber('cacheTtlMs', raw.cacheTtlMs, DEFAULT_CONFIG.cacheTtlMs, {
      min: 0,
      max: 86400000,
    }),
    batchLimit: asNumber('batchLimit', raw.batchLimit, DEFAULT_CONFIG.batchLimit, { min: 1, max: 100 }),
    locale: asString('locale', raw.locale, DEFAULT_CONFIG.locale),
    updateCheck: asBoolean('updateCheck', raw.updateCheck, DEFAULT_CONFIG.updateCheck),
    registryUrl: asRegistryUrl('registryUrl', raw.registryUrl, DEFAULT_CONFIG.registryUrl),
    updateCheckTimeoutMs: asNumber(
      'updateCheckTimeoutMs',
      raw.updateCheckTimeoutMs,
      DEFAULT_CONFIG.updateCheckTimeoutMs,
      { min: 500, max: 60000 },
    ),
    updateCheckTtlMs: asNumber(
      'updateCheckTtlMs',
      raw.updateCheckTtlMs,
      DEFAULT_CONFIG.updateCheckTtlMs,
      { min: 0, max: 604800000 },
    ),
    profile: asString('profile', raw.profile, DEFAULT_CONFIG.profile),
    bind: asBindConfig('bind', raw.bind, DEFAULT_CONFIG.bind),
  }

  if (!LOCALES.includes(config.locale)) {
    fail(`locale 只接受 ${LOCALES.join(' / ')}（收到 ${config.locale}）`)
  }
  if (config.binPath !== '' && !/[\\/]/.test(config.binPath)) {
    fail('binPath 必须是可执行文件的完整路径（含目录分隔符）')
  }
  return config
}
