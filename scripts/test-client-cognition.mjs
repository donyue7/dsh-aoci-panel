/**
 * 认知视图（浏览器半）冒烟测试：node scripts/test-client-cognition.mjs
 *
 * 面板的浏览器半是 `window.__ModuleLoader__.load({factory})` 形式的单文件模块，
 * 正常只在 DSH Web 里运行。这里用一个极小的 React 替代品把 CognitionView
 * 真正渲染一遍，验证三件事：
 *   1. 首帧载入 → fetch /aoci-panel/cognition → 渲染出 5 张价值卡与账本；
 *   2. 子视图切换（开发须知 / 认知地图 / 健康时间线 / 资产清单）都能渲染；
 *   3. 渲染结果里没有 undefined / [object Object] 这类泄漏。
 *
 * 不依赖浏览器与宿主：react、fetch、DOM 都在沙箱里替换。数据形状与
 * lib/cognition.js 的返回值保持一致（可用真实仓库数据替换 FIXTURE）。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')
	// 测试钩子：把组件暴露出来（真实运行时导出面不变）
	.replace('module.exports = {', 'module.exports = { __test: { CognitionView, AboutCard, IndexAssetsView },')
assert.ok(
	source.includes('__test: { CognitionView, AboutCard, IndexAssetsView }'),
	'client.js 导出结构已变化，请更新测试钩子',
)

const FIXTURE = {
	hasIndex: true,
	metrics: {
		sourceCount: 273,
		entryCount: 273,
		coveragePct: 100,
		blindSpots: 0,
		sEntries: 273,
		sPresent: 188,
		missingConstraints: 24,
		important: 152,
		budgetTokens: 49182,
		budgetTarget: 200000,
		budgetPct: 25,
		budgetStatus: 'healthy',
		aligned: true,
		driftCount: 0,
		pendingTransactions: 0,
		scopeIndex: 276,
		latest: { hash: '4338a14', date: '2026-10-20T17:53:00+08:00', subject: '录单页货品图片加载失败时兜底为内置默认图', changed: 2 },
	},
	constraints: [
		{ id: 'AGENTS.md', name: 'AGENTS.md', dir: '', tags: 'S69M', s: 'MCP MySQL 只读走只读库；发版必须先取得用户明确确认。' },
		{ id: 'Gys_backend/config.py', name: 'config.py', dir: 'Gys_backend', tags: 'C9M', s: '密钥一律取 env；OSS_ENDPOINT 生产为内网。' },
	],
	dirs: [
		{ dir: 'Gys_backend/sql', count: 53, sCount: 31, c9: 0 },
		{ dir: 'Gys_backend/models', count: 32, sCount: 27, c9: 5 },
	],
	commits: [
		{
			hash: '4338a14',
			date: '2026-10-20T17:53:00+08:00',
			subject: '录单页货品图片加载失败时兜底为内置默认图',
			changed: 2,
			ops: [
				{ kind: 'add', name: 'default-goods.svg', tags: 'ZU3T', dir: 'Gys_Frontend/src/assets', f: '货品默认占位图' },
				{ kind: 'update', name: 'StoreEntry.vue', tags: 'AB7L', dir: 'Gys_Frontend/src/views/group-buy', f: '门店端录单页' },
			],
		},
	],
	verifies: [
		{ file: '20261020T095310Z.txt', time: 1760953990000, result: 'AOCI Verify：Volumes v1候选结构有效', composite: '2ff6535ab35cc97f718ef55e63c8760940d9237b3f7f743564fd7f8a0f2a87ea' },
	],
	assets: [
		{ path: 'aoci.txt', use: '项目根卷', exists: true, size: 292, mtime: 1760953990000 },
		{ path: '.aoci/verify_history', use: '校验历史', exists: true, size: null, mtime: 1760953990000 },
		{ path: 'aoci.code.txt', use: '代码卷', exists: true, size: 148000, mtime: 1760953990000 },
	],
}


/** /aoci-panel/assets 的响应样例：三个文件里的两个（根清单 + 代码卷）。 */
const ASSETS_FIXTURE = {
	repo: 'C:\\Users\\19289\\Desktop\\dsh-aoci-panel',
	generatedAt: 1761650000000,
	limit: 204800,
	files: [
		{
			name: 'aoci.txt',
			label: '根清单',
			kind: 'root',
			hint: '卷清单与全局不变量（cognition-volumes/v1）',
			exists: true,
			content: '#AOCI-ROOT-MANIFEST: 1\n#Format-Version: cognition-volumes/v1\n#Volume: id=code kind=code path=aoci.code.txt\n',
			sha256: 'a'.repeat(64),
			bytes: 4096,
			lines: 122,
			eol: 'lf',
			modifiedAt: '2026-10-28T13:00:00.000Z',
			backups: ['aoci.txt.20261028-130000.bak'],
			validation: { ok: true, errors: [], warnings: [], stats: { entries: 0, volumes: 2, dictionaries: 0, dirs: {}, tags: 0 } },
		},
		{
			name: 'aoci.code.txt',
			label: '代码卷',
			kind: 'code',
			hint: '对象认知条目 F/R/A/S（object-fras-v2）',
			exists: true,
			content: '#AOCI-CODE-VOLUME: 1\n\n===C:/repo/lib/===\nalpha.js[EU7T]: F:alpha | R:- | A:- | S:-\n',
			sha256: 'b'.repeat(64),
			bytes: 2048,
			lines: 45,
			eol: 'lf',
			modifiedAt: '2026-10-28T13:00:00.000Z',
			backups: [],
			validation: { ok: true, errors: [], warnings: [], stats: { entries: 1, volumes: 0, dictionaries: 0, dirs: { lib: 1 }, tags: 0 } },
		},
		{
			name: 'aoci.meta.txt',
			label: '元卷',
			kind: 'meta',
			hint: '标签字典与作者化合同（meta-v1）',
			exists: false,
			content: '',
			sha256: '',
			bytes: 0,
			lines: 0,
			eol: 'none',
			modifiedAt: '',
			backups: [],
			validation: { ok: false, errors: ['文件不存在'], warnings: [], stats: { entries: 0, volumes: 0, dictionaries: 0, dirs: {}, tags: 0 } },
		},
	],
}

const text = (node) => {
	if (node === null || node === undefined || node === false) return ''
	if (typeof node === 'string' || typeof node === 'number') return String(node)
	if (Array.isArray(node)) return node.map(text).join('')
	if (node.props) {
		const children = node.props.children
		return text(Array.isArray(children) ? children : [children])
	}
	return ''
}

/** 收集所有元素节点，用于模拟点击/查找。 */
const nodes = (node, out = []) => {
	if (!node || typeof node !== 'object') return out
	if (Array.isArray(node)) {
		for (const item of node) nodes(item, out)
		return out
	}
	out.push(node)
	const children = node.props ? node.props.children : null
	if (children) nodes(children, out)
	return out
}

function makeHarness() {
	const state = { values: [], cursor: 0, effects: [] }
	const react = {
		createElement: (type, props, ...children) => ({
			type,
			props: Object.assign({}, props || {}, { children: children.length <= 1 ? children[0] : children }),
		}),
		useState: (initial) => {
			const index = state.cursor++
			if (!(index in state.values)) state.values[index] = initial
			return [
				state.values[index],
				(value) => {
					state.values[index] = typeof value === 'function' ? value(state.values[index]) : value
				},
			]
		},
		useEffect: (fn) => {
			state.effects.push(fn)
		},
	}
	return { react, state }
}

let loaded = null
const { react, state } = makeHarness()
const sandbox = {
	window: {
		__ModuleLoader__: {
			load: (def) => {
				loaded = def
			},
		},
		location: { origin: 'http://127.0.0.1:65535' },
	},
	document: {
		createElement: () => ({ setAttribute() {}, remove() {}, appendChild() {}, textContent: '' }),
		head: { appendChild() {} },
	},
	fetch: async (url, options) => {
		const target = String(url);
		if (target.indexOf('/aoci-panel/assets') >= 0) {
			const isPost = options && options.method === 'POST';
			return {
				json: async () =>
					isPost
						? { ok: true, name: 'aoci.txt', bytes: 4100, lines: 123, sha256: 'c'.repeat(64), hint: '索引已保存；建议再跑一次校验' }
						: ASSETS_FIXTURE,
			};
		}
		return { json: async () => FIXTURE };
	},
	URL,
	console,
	setTimeout,
	Promise,
}
vm.createContext(sandbox)
vm.runInContext(source, sandbox)
assert.ok(loaded && typeof loaded.factory === 'function', '应通过 __ModuleLoader__.load 注册模块')

const mod = loaded.factory((name) => {
	if (name === 'react') return react
	throw new Error('未知依赖：' + name)
})
const CognitionView = mod.__test && mod.__test.CognitionView
assert.ok(typeof CognitionView === 'function', 'CognitionView 应可用')

const props = { repo: 'C:\\Users\\19289\\Desktop\\Gys', bin: 'C:\\aoci\\bin\\aoci-rc19.exe' }
const render = () => {
	state.cursor = 0
	state.effects = []
	const tree = CognitionView(props)
	const effects = state.effects.slice()
	for (const fn of effects) fn()
	return tree
}

// 首帧：载入中
const first = render()
assert.ok(text(first).includes('载入'), '首帧应显示载入中')

// 让 fetch 的微任务落地后重渲染
await new Promise((resolve) => setTimeout(resolve, 10))
let tree = render()
let body = text(tree)
for (const expected of ['记忆覆盖', '约束缺口', '索引预算', '治理状态', '最近认知更新', '273 / 273', '24 条', '49.2K / 200K', 'aligned', '4338a14']) {
	assert.ok(body.includes(expected), '价值卡应包含：' + expected)
}
assert.ok(body.includes('＋'), '账本应含新增标记')
assert.ok(body.includes('default-goods.svg'), '账本应含条目名')
assert.ok(body.includes('StoreEntry.vue'), '账本应含更新条目')
assert.ok(!body.includes('undefined'), '渲染结果不应出现 undefined')
assert.ok(!body.includes('[object Object]'), '渲染结果不应出现对象泄漏')

/** 点击子视图按钮并重渲染。 */
function switchTo(label) {
	const target = nodes(tree).filter((node) => node.type === 'button' && text(node).trim() === label)[0]
	assert.ok(target, '找不到子视图按钮：' + label)
	target.props.onClick()
	tree = render()
	return text(tree)
}

const rules = switchTo('开发须知')
assert.ok(rules.includes('MCP MySQL 只读走只读库'), '开发须知应显示约束正文')
assert.ok(rules.includes('2 / 2'), '开发须知应显示条目计数')

const map = switchTo('认知地图')
assert.ok(map.includes('Gys_backend/sql'), '认知地图应显示目录')
assert.ok(map.includes('53'), '认知地图应显示条目数')

const health = switchTo('健康时间线')
assert.ok(health.includes('Volumes v1候选结构有效'), '时间线应显示 verify 结论')

const assets = switchTo('资产清单')
assert.ok(assets.includes('.aoci/verify_history'), '资产清单应含历史目录')
assert.ok(assets.includes('145.0') === false, '不应把目录大小当字节展示')
assert.ok(assets.includes('—') || assets.includes('缺失'), '目录资产的尺寸应显示占位符')

const AboutCard = mod.__test && mod.__test.AboutCard
assert.ok(typeof AboutCard === 'function', 'AboutCard 应可用')

state.values = []
state.cursor = 0
const aboutBody = text(AboutCard({
	about: {
		version: '0.5.0',
		profile: 'desktop',
		enabled: true,
		checkedAt: 1760953990000,
		latest: '0.6.0',
		updateAvailable: true,
		updateCommand: 'dsh plugin --profile desktop add dsh-aoci-panel@latest',
		homepage: 'https://github.com/donyue7/dsh-aoci-panel',
		config: { binDir: 'C:\\aoci\\bin', cacheTtlMs: 0 },
	},
	busy: false,
	onCheck: () => {},
}))
for (const expected of ['插件版本与更新', 'v0.5.0', 'desktop', 'v0.6.0', '有新版本可用', '复制更新命令', 'dsh plugin --profile desktop add dsh-aoci-panel@latest']) {
	assert.ok(aboutBody.includes(expected), '版本卡片应包含：' + expected)
}
assert.ok(!aboutBody.includes('undefined'), '版本卡片不应出现 undefined')

state.values = []
state.cursor = 0
const aboutOff = text(AboutCard({ about: { version: '0.5.0', enabled: false, config: {} }, busy: false }))
assert.ok(aboutOff.includes('更新检查已关闭'), '关闭更新检查时应说明原因')

// ---------------------------------------------------------------------------
// 索引文件视图：读取三个受管资产 → 编辑 → 保存成功 → 切换文件
// ---------------------------------------------------------------------------
const IndexAssetsView = mod.__test && mod.__test.IndexAssetsView
assert.ok(typeof IndexAssetsView === 'function', 'IndexAssetsView 应可用')

state.values = []
state.cursor = 0
const renderAssets = () => {
	state.cursor = 0
	state.effects = []
	const tree = IndexAssetsView({ repo: 'C:\\Users\\19289\\Desktop\\dsh-aoci-panel' })
	const effects = state.effects.slice()
	for (const fn of effects) fn()
	return tree
}

let assetsTree = renderAssets()
assert.ok(text(assetsTree).includes('索引文件管控'), '首帧应显示索引文件卡片')

await new Promise((resolve) => setTimeout(resolve, 10))
assetsTree = renderAssets()
let assetsBody = text(assetsTree)
for (const expected of ['根清单', '元卷', '代码卷', '结构校验通过', '122 行', '4.0 KB', 'EOL=lf', '已与磁盘一致', 'aoci.txt.20261028-130000.bak']) {
	assert.ok(assetsBody.includes(expected), '索引文件视图应包含：' + expected)
}
assert.ok(!assetsBody.includes('undefined'), '索引文件视图不应出现 undefined')

const editor = nodes(assetsTree).filter((node) => node.type === 'textarea')[0]
assert.ok(editor, '应有编辑框')
editor.props.onChange({ target: { value: editor.props.value + '# 手工备注\\n' } })
assetsTree = renderAssets()
assetsBody = text(assetsTree)
assert.ok(assetsBody.includes('有未保存修改'), '编辑后应提示未保存')

const saveButton = nodes(assetsTree).filter((node) => node.type === 'button' && text(node).trim() === '保存')[0]
assert.ok(saveButton, '应有保存按钮')
assert.equal(saveButton.props.disabled, false, '有改动时保存按钮应可用')
saveButton.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 10))
assetsBody = text(renderAssets())
assert.ok(assetsBody.includes('已保存'), '保存成功后应提示已保存')

// 切到代码卷：编辑器内容应换成该文件
const codeTab = nodes(renderAssets()).filter((node) => node.type === 'button' && text(node).indexOf('代码卷') >= 0)[0]
assert.ok(codeTab, '应有代码卷标签')
codeTab.props.onClick()
const codeEditor = nodes(renderAssets()).filter((node) => node.type === 'textarea')[0]
assert.ok(codeEditor && String(codeEditor.props.value).includes('#AOCI-CODE-VOLUME'), '切换后编辑器应载入代码卷内容')

// 切到缺失的元卷：应显示校验不通过与缺失原因，而不是崩掉
const metaTab = nodes(renderAssets()).filter((node) => node.type === 'button' && text(node).indexOf('元卷') >= 0)[0]
assert.ok(metaTab, '应有元卷标签')
metaTab.props.onClick()
assetsBody = text(renderAssets())
assert.ok(assetsBody.includes('结构校验未通过'), '缺失文件应显示校验不通过')
assert.ok(assetsBody.includes('文件不存在'), '应显示缺失原因')

console.log('client cognition smoke: OK (5 views + about card + index assets rendered)')

