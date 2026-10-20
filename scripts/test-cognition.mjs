/**
 * 认知视图数据层测试（node --test）。
 *
 * 覆盖三件事：
 *   1. 解析器：卷条目（F/R/A/S）与 `git log -p` 账本文本，用合成样本断言；
 *   2. 指标换算：用构造的 governance 事实断言覆盖率/缺口/预算/漂移；
 *   3. 真实仓库：对 Gys（可用 TEST_REPO 覆盖）做只读采集，断言约束、目录、
 *      账本、verify 历史与资产清单都有内容，防止解析器随索引格式漂移而静默为空。
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  parseManifest,
  parseVolume,
  parseCommitLog,
  aggregateDirs,
  collectCognition,
} from '../lib/cognition.js'

const TEST_REPO = process.env.TEST_REPO || 'C:\\Users\\19289\\Desktop\\Gys'

test('parseManifest 读取元信息与卷声明', () => {
  const raw = [
    '#AOCI-ROOT-MANIFEST: 1',
    '#Format-Version: cognition-volumes/v1',
    '#Project: Gys',
    '#Volume: id=meta kind=meta path=aoci.meta.txt format=meta-v1 depends=- state=enabled',
    '#Volume: id=code kind=code path=aoci.code.txt format=object-fras-v2 depends=meta state=enabled',
  ].join('\n')
  const manifest = parseManifest(raw)
  assert.equal(manifest.meta.Project, 'Gys')
  assert.equal(manifest.volumes.length, 2)
  assert.equal(manifest.volumes[1].kind, 'code')
  assert.equal(manifest.volumes[1].path, 'aoci.code.txt')
})

test('parseVolume 解析分节、标签与 F/R/A/S', () => {
  const raw = [
    '#[Tag dictionary: code]',
    '===C:/ws/src===',
    'a.ts[SC9A]: F: 做甲 | R: 依赖乙 | A: 断言丙 | S: 约束丁',
    'b.md[FC4T]: F: 只有 F',
  ].join('\n')
  const entries = parseVolume(raw, 'C:/ws')
  assert.equal(entries.length, 2)
  const a = entries[0]
  assert.equal(a.dir, 'src')
  assert.equal(a.id, 'src/a.ts')
  assert.equal(a.tags, 'SC9A')
  assert.equal(a.f, '做甲')
  assert.equal(a.r, '依赖乙')
  assert.equal(a.a, '断言丙')
  assert.equal(a.s, '约束丁')
  const b = entries[1]
  assert.equal(b.name, 'b.md')
  assert.equal(b.s, '')
})

test('parseCommitLog 解析提交头与增删改', () => {
  const raw = [
    '@@@abc1234|2026-10-20T09:00:00+08:00|feat: 新增与重写',
    '--- a/aoci.code.txt',
    '+++ b/aoci.code.txt',
    '@@ -1,2 +1,3 @@',
    ' ===C:/ws/src===',
    '-old.js[AA1B]: F: 旧条目',
    '+old.js[AA2B]: F: 重写后的条目 | R: 关系 | A: 断言 | S: 约束',
    '+new.js[AA3B]: F: 新增条目',
    ' same.js[AA4B]: F: 未变',
    '@@@def5678|2026-10-19T10:00:00+08:00|fix: 删除条目',
    ' ===C:/ws/src===',
    '-gone.js[AA1B]: F: 已删',
  ].join('\n')
  const commits = parseCommitLog(raw)
  assert.equal(commits.length, 2)
  assert.equal(commits[0].hash, 'abc1234')
  assert.equal(commits[0].subject, 'feat: 新增与重写')
  assert.equal(commits[0].ops.length, 2)
  const [rewrite, add] = commits[0].ops
  assert.equal(rewrite.kind, 'update')
  assert.equal(rewrite.name, 'old.js')
  assert.equal(add.kind, 'add')
  assert.equal(add.name, 'new.js')
  assert.equal(rewrite.dir, 'C:/ws/src')
  assert.equal(rewrite.f, '重写后的条目')
  assert.equal(commits[1].ops[0].kind, 'del')
})

test('aggregateDirs 按目录聚合条目/S/C9', () => {
  const rows = aggregateDirs([
    { dir: 'src', tags: 'SC9A', s: '约束' },
    { dir: 'src', tags: 'FC4T', s: '' },
    { dir: 'lib', tags: 'FC5T', s: '-' },
  ])
  assert.deepEqual(
    rows.map((row) => [row.dir, row.count, row.sCount, row.c9]),
    [
      ['src', 2, 1, 1],
      ['lib', 1, 0, 0],
    ],
  )
})

test('collectCognition 用构造的 governance 换算指标', async () => {
  const gov = {
    code_source_count: 100,
    code_entry_count: 98,
    governance_aligned: true,
    pending_transactions: 0,
    code_drift: { missing: 1, orphan: 0, stale: 2, unbaselined: 0, line_ending_only: 5 },
    managed_scope: { index_count: 96, observe_count: 2, exclude_count: 2 },
    budget: {
      whole_index_tokens: 50000,
      target_tokens: 200000,
      status: 'healthy',
      s_coverage: [
        { min_c: 1, max_c: 4, entries: 60, s_present: 30 },
        { min_c: 9, max_c: 9, entries: 40, s_present: 40 },
      ],
      high_importance_entries: 50,
      high_importance_s_absent: 10,
    },
  }
  const data = await collectCognition(TEST_REPO, gov)
  assert.equal(data.hasIndex, true)
  assert.equal(data.degraded, false)
  assert.equal(data.reason, null)
  const m = data.metrics
  assert.equal(m.governanceAvailable, true)
  assert.equal(m.sourceCount, 100)
  assert.equal(m.entryCount, 98)
  assert.equal(m.coveragePct, 98)
  assert.equal(m.blindSpots, 2)
  assert.equal(m.sEntries, 100)
  assert.equal(m.sPresent, 70)
  assert.equal(m.sPct, 70)
  assert.equal(m.missingPct, 20)
  assert.equal(m.budgetPct, 25)
  assert.equal(m.driftCount, 3)
  assert.equal(m.scopeIndex, 96)
  assert.equal(m.aligned, true)
})

test('collectCognition 缺治理快照时显式降级：不把未知写成 0/false', async () => {
  const data = await collectCognition(TEST_REPO, null)
  assert.equal(data.degraded, true)
  assert.ok(String(data.reason).includes('治理快照不可用'))
  const m = data.metrics
  assert.equal(m.governanceAvailable, false)
  assert.equal(m.sourceCount, null, '源文件数只能来自治理快照')
  assert.equal(m.coveragePct, null)
  assert.equal(m.blindSpots, null)
  assert.equal(m.missingConstraints, null)
  assert.equal(m.important, null)
  assert.equal(m.missingPct, null)
  assert.equal(m.budgetTokens, null)
  assert.equal(m.budgetTarget, null)
  assert.equal(m.budgetPct, null)
  assert.equal(m.aligned, null, '未知不能写成未对齐')
  assert.equal(m.driftCount, null)
  assert.equal(m.pendingTransactions, null)
  assert.equal(m.scopeIndex, null)
  // 由索引文本本身可得的数字仍给真值
  assert.ok(m.entryCount > 0, '条目数可从 aoci.code.txt 得出')
  assert.ok(m.sEntries > 0)
  assert.ok(m.sPresent > 0)
  assert.ok(typeof m.sPct === 'number')
  assert.ok(data.constraints.length > 0, '约束视图不受影响')
})

test('collectCognition 采集真实仓库（Gys）', async () => {
  const data = await collectCognition(TEST_REPO, null)
  assert.equal(data.hasIndex, true, '需要仓库已有 aoci.txt')
  assert.ok(data.constraints.length > 0, '应解析出 S 约束')
  assert.ok(
    data.constraints.every((row) => row.s && row.s !== '-'),
    '约束项的 S 不应为空',
  )
  assert.ok(data.dirs.length > 0, '应有目录聚合')
  assert.equal(data.dirs[0].dir, data.dirs[0].dir, '目录首行可读')
  assert.ok(data.verifies.length > 0, '应有 verify 历史')
  assert.ok(data.verifies.length <= 10, '时间线最多 10 条')
  assert.ok(data.verifies[0].composite.length === 64, 'verify 记录含 composite 身份')

  const txt = data.assets.filter((asset) => asset.path === 'aoci.txt')[0]
  assert.ok(txt && txt.exists && txt.size > 0, 'aoci.txt 应存在且非空')
  const code = data.assets.filter((asset) => asset.path === 'aoci.code.txt')[0]
  assert.ok(code && code.exists && code.size > 0, 'aoci.code.txt 应存在且非空')
  const history = data.assets.filter((asset) => asset.path === '.aoci/verify_history')[0]
  assert.ok(history && history.exists && history.size === null, '历史目录只记存在性')

  assert.ok(Array.isArray(data.commits), '账本应为数组')
  if (data.commits.length > 0) {
    const commit = data.commits[0]
    assert.ok(/^[0-9a-f]{7,40}$/.test(commit.hash), '提交哈希形状')
    assert.ok(commit.date.length > 0, '提交时间')
    assert.ok(commit.ops.length > 0, '最近提交应有条目变更')
    assert.ok(
      commit.ops.every((op) => op.kind === 'add' || op.kind === 'update' || op.kind === 'del'),
      '变更类型白名单',
    )
  }
})
