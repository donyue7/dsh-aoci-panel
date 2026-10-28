/**
 * AOCI 索引资产层（lib/assets.js）单元测试：node --test scripts/test-assets.mjs
 *
 * 覆盖三类资产的结构校验（根清单 / 元卷 / 代码卷）、保存前的规范化
 * （LF 行尾、末尾换行、行数、大小上限）、备份命名与真实仓库自校验。
 * 校验口径必须与 `aoci verify` 一致：这里故意用「合法 / 非法」成对样例锁住。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  ASSET_LIMIT,
  ASSET_NAMES,
  ASSET_SPECS,
  assetSpec,
  backupFileName,
  countLines,
  detectEol,
  ensureTrailingNewline,
  isAssetName,
  sha256Hex,
  toLf,
  validateAsset,
} from '../lib/assets.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')

const REPO = 'C:/fixture/repo'

const ROOT_OK = [
  '#AOCI-ROOT-MANIFEST: 1',
  '#Format-Version: cognition-volumes/v1',
  '#Locale: zh-CN',
  '#Project: fixture',
  '#Volume: id=meta kind=meta path=aoci.meta.txt format=meta-v1 depends=- state=enabled',
  '#Volume: id=code kind=code path=aoci.code.txt format=object-fras-v2 depends=meta state=enabled',
  '',
].join('\n')

const META_OK = [
  '#AOCI-META-VOLUME: 1',
  '#FRAS-Discipline: 2',
  '#[Tag dictionary: code]',
  '#A Layer: C-共享基础 E-入口边界 A-应用编排',
  '#B Module: U-用户交互 G-跨域通用',
  '#C Importance: 9-最高 7-高',
  '#E Scale: L-大 M-中 S-小 T-微',
  '',
].join('\n')

const CODE_OK = [
  '#AOCI-CODE-VOLUME: 1',
  '',
  '===C:/fixture/repo/lib/===',
  'alpha.js[EU7T]: F:alpha 模块的用途 | R:- | A:- | S:-',
  'beta.js[EE8L]: F:beta 模块的用途 | R:code:lib/alpha.js | A:- | S:必须保留的单行约束',
  '',
].join('\n')

test('资产清单固定为三个受管文件', () => {
  assert.deepEqual(ASSET_NAMES, ['aoci.txt', 'aoci.meta.txt', 'aoci.code.txt'])
  assert.equal(ASSET_SPECS.length, 3)
  for (const spec of ASSET_SPECS) {
    assert.ok(spec.label && spec.hint && spec.kind, '每个资产都要有展示用元数据')
    assert.ok(isAssetName(spec.name))
    assert.equal(assetSpec(spec.name).name, spec.name)
  }
  assert.equal(isAssetName('aoci.code.txt'), true)
  assert.equal(isAssetName('.aoci/baseline.json'), false)
  assert.equal(assetSpec('aoci.md'), null)
})

test('未知资产直接拒绝', () => {
  const result = validateAsset('aoci.md', '#AOCI-ROOT-MANIFEST: 1\n')
  assert.equal(result.ok, false)
  assert.ok(result.errors.join(' ').includes('未知索引资产'))
})

test('根清单：合法声明通过并统计卷数', () => {
  const result = validateAsset('aoci.txt', ROOT_OK)
  assert.equal(result.ok, true, result.errors.join('；'))
  assert.equal(result.stats.volumes, 2)
  assert.deepEqual(result.warnings, [])
})

test('根清单：首行与 Format-Version 必须合法', () => {
  const badHead = 'not a root manifest\n' + ROOT_OK.split('\n').slice(1).join('\n')
  const badFirst = validateAsset('aoci.txt', badHead)
  assert.equal(badFirst.ok, false)
  assert.ok(badFirst.errors.join(' ').includes('首行必须是 #AOCI-ROOT-MANIFEST'))

  const badVersion = validateAsset('aoci.txt', ROOT_OK.replace('cognition-volumes/v1', 'cognition-volumes/v3'))
  assert.equal(badVersion.ok, false)
  assert.ok(badVersion.errors.join(' ').includes('不支持的 Format-Version'))
})

test('根清单：必须声明 code 卷', () => {
  const onlyMeta = ROOT_OK.split('\n').filter((line) => !line.startsWith('#Volume: id=code')).join('\n')
  const result = validateAsset('aoci.txt', onlyMeta)
  assert.equal(result.ok, false)
  assert.ok(result.errors.join(' ').includes('缺少 kind=code 的卷声明'))
})

test('元卷：code 字典必须有，缺失即报错', () => {
  const ok = validateAsset('aoci.meta.txt', META_OK)
  assert.equal(ok.ok, true, ok.errors.join('；'))
  assert.equal(ok.stats.dictionaries, 1)

  const noCodeDict = META_OK.replace('#[Tag dictionary: code]', '#[Tag dictionary: database]')
  const bad = validateAsset('aoci.meta.txt', noCodeDict)
  assert.equal(bad.ok, false)
  assert.ok(bad.errors.join(' ').includes('缺少 code 域'))

  const noDict = META_OK.replace('#[Tag dictionary: code]\n', '')
  const worse = validateAsset('aoci.meta.txt', noDict)
  assert.equal(worse.ok, false)
  assert.ok(worse.errors.join(' ').includes('缺少 #[Tag dictionary: code]'))
})

test('元卷：非注释行只给警告，不阻断保存', () => {
  const withBody = META_OK + '正文混进了元卷\n'
  const result = validateAsset('aoci.meta.txt', withBody)
  assert.equal(result.ok, true)
  assert.ok(result.warnings.join(' ').includes('非注释内容'))
})

test('代码卷：复用 parseVolume 统计条目、目录与标签', () => {
  const result = validateAsset('aoci.code.txt', CODE_OK, { repoRoot: REPO })
  assert.equal(result.ok, true, result.errors.join('；'))
  assert.equal(result.stats.entries, 2)
  assert.deepEqual(result.stats.dirs, { lib: 2 })
  assert.deepEqual(result.warnings, [])
})

test('代码卷：空卷报错、无法解析的行给警告', () => {
  const empty = validateAsset('aoci.code.txt', '#AOCI-CODE-VOLUME: 1\n')
  assert.equal(empty.ok, false)
  assert.ok(empty.errors.join(' ').includes('没有任何可解析条目'))

  const messy = CODE_OK + '这不是条目\n'
  const result = validateAsset('aoci.code.txt', messy, { repoRoot: REPO })
  assert.equal(result.ok, true)
  assert.ok(result.warnings.join(' ').includes('无法解析为条目'))
})

test('代码卷：重复条目 id 进警告', () => {
  const dup = [
    '#AOCI-CODE-VOLUME: 1',
    '',
    'dup.js[EU7T]: F:同一条目 | R:- | A:- | S:-',
    'dup.js[EU7T]: F:同一条目又写了一次 | R:- | A:- | S:-',
    '',
  ].join('\n')
  const result = validateAsset('aoci.code.txt', dup)
  assert.equal(result.ok, true)
  assert.ok(result.warnings.join(' ').includes('条目 id 重复'))
})

test('保存前规范化：CRLF → LF、补末尾换行、行数正确', () => {
  assert.equal(toLf('a\r\nb\r\nc'), 'a\nb\nc')
  assert.equal(detectEol('a\r\nb'), 'crlf')
  assert.equal(detectEol('a\nb'), 'lf')
  assert.equal(ensureTrailingNewline('a\nb'), 'a\nb\n')
  assert.equal(ensureTrailingNewline('a\nb\n'), 'a\nb\n')
  assert.equal(ensureTrailingNewline(''), '')
  assert.equal(countLines(''), 0)
  assert.equal(countLines('a'), 1)
  assert.equal(countLines('a\n'), 1)
  assert.equal(countLines('a\nb'), 2)

  const crlfBody = ROOT_OK.replace(/\n/g, '\r\n')
  const result = validateAsset('aoci.txt', crlfBody)
  assert.equal(result.ok, true)
  assert.equal(result.stats.eol, 'crlf')
  assert.ok(result.warnings.join(' ').includes('CRLF'))
})

test('超过单文件上限直接拒绝', () => {
  const huge = '#AOCI-CODE-VOLUME: 1\n' + 'x'.repeat(ASSET_LIMIT)
  const result = validateAsset('aoci.code.txt', huge)
  assert.equal(result.ok, false)
  assert.ok(result.errors.join(' ').includes('超过单文件上限'))
})

test('备份命名与摘要工具', () => {
  const name = backupFileName('aoci.code.txt', new Date('2026-10-28T13:05:09Z'))
  assert.equal(name, 'aoci.code.txt.20261028-130509.bak')
  assert.match(name, /^aoci\.code\.txt\.\d{8}-\d{6}\.bak$/)
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
})

test('本仓库三个索引文件都通过面板校验（与 verify 同源）', () => {
  for (const spec of ASSET_SPECS) {
    const text = readFileSync(join(repoRoot, spec.name), 'utf8')
    const result = validateAsset(spec.name, text, { repoRoot })
    assert.equal(result.ok, true, spec.name + ' 校验失败：' + result.errors.join('；'))
  }
  const code = readFileSync(join(repoRoot, 'aoci.code.txt'), 'utf8')
  const codeResult = validateAsset('aoci.code.txt', code, { repoRoot })
  assert.ok(codeResult.stats.entries > 40, '代码卷应能解析出全部条目')
  assert.equal(codeResult.stats.volumes, 0)
})
