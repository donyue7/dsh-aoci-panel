# dsh-aoci-panel

给 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）用的 AOCI 认知面板插件：在会话视图标签栏
加一个 **`AOCI`** 标签，点开即可看到**多工作区 AOCI 总览**、当前项目的索引概览、治理状态与条目浏览、
MCP 绑定诊断与快捷动作；项目尚未构建 AOCI 时，可直接在面板里**引导式初始化**（单仓库或批量）。

插件通过 DSH 官方插件机制安装（`dsh plugin add`），也可以从插件市场的「发现」页一键安装；
面板顶栏显示自身版本与可复制的更新命令。

## 快速开始

```powershell
# 从 npm 安装到默认 desktop profile（推荐）
dsh plugin --profile desktop add dsh-aoci-panel

# 开发本仓库：把当前目录链接进 profile（改完保存即生效，宿主半仍需重启）
dsh plugin --profile desktop add C:\Users\me\Desktop\dsh-aoci-panel
```

装完**重启 DSH**，打开任意会话顶部的 `AOCI` 标签。卸载：

```powershell
dsh plugin --profile desktop remove dsh-aoci-panel
```

> 桌面版默认不把 `dsh` 加进 PATH。可在桌面版「设置 → 通用 → Manage dsh Command…」安装命令行，
> 或直接用 `scripts/install.ps1`（它会自动找到桌面版自带的 CLI）。

## 功能

| 标签 | 内容 |
| --- | --- |
| 多工作区 | 一屏聚合所有注册 DSH 工作区的 AOCI 状态：是否 aligned / 需作者化 / Recovery / 待处理事务 / 报告待处理 / 条目数 / 各卷状态 / 最后 verify 时间与结果 / 绑定的 serverName 与工具命名空间；支持搜索与三种排序（名称 / 条目数 / 治理状态），点行展开单仓库深取详情 + 快捷动作 |
| 单仓库 | 索引概览（项目、布局、条目数、各卷、composite_identity、基线、最近 verify、待处理报告、最近操作）；治理状态（对齐结论、漂移明细、预算水位、Scope 规则、Findings、CLI 通道）；条目浏览（按路径/标签/F 搜索，展开完整 `F / R / A / S`，标签按元卷词典解义） |
| 绑定诊断 | 该仓库绑定的 MCP `serverName` 与工具命名空间（`mcp__<serverName>__`）；检测 serverName 冲突、未绑定、绑错仓库（`--repo` 不一致）、旧二进制（rc 版本落后）；一键「修复绑定」归一 command / `--repo`（写前备份，保留行 id 与 serverName）；给出可直接粘贴的 Agent 提示词（bootstrap / 绑定自检） |
| 索引文件 | `aoci.txt` / `aoci.meta.txt` / `aoci.code.txt` 的可视化编辑：读取即做结构校验（首行、Format-Version、code 卷 / 字典、条目解析与重复 id、单文件 200 KiB 上限），保存前用 sha256 做 CAS（文件被别处改过就拒绝）+ 自动备份到 `.aoci/<文件名>.<时间戳>.bak`，可一键从备份恢复；只允许这三个受管资产，其余 AOCI 资产仍由 CLI / MCP 维护 |
| 接入工具 | 合并自 `dsh-aoci-bind` 的 4 个 Agent 工具：`aoci_bind_status` / `aoci_bind_repair` / `aoci_project_init` / `aoci_doctor` —— 让 Agent 自己发现未绑定工作区、诊断与修复 MCP 绑定、初始化并体检（见「AOCI 接入工具」） |
| 初始化 | 单仓库安装向导（未初始化仓库自动出现）+ 多工作区**批量初始化**（多选未初始化工作区，每仓库独立 serverName，顺序执行） |
| 认知 | 回答「AOCI 对这个仓库做了什么、对开发者有什么用」：5 张价值卡（记忆覆盖 / 约束缺口 / 索引预算 / 治理状态 / 最近认知更新）+ 5 个子视图（变更账本 / 开发须知 / 认知地图 / 健康时间线 / 资产清单），全部来自仓库内既有产物，只读 |
| 引导 | 顶部「引导」按钮：AOCI 概念、生命周期、面板区块说明、常用 CLI 命令速查 |

顶部工具条提供：**标签切换**、**引导**、**版本/更新**（当前版本、最新版本与可复制的更新命令）、
**数据时间**、**刷新**、**校验**（真实执行一次 `aoci verify`）；
单仓库标签内另有**仓库切换**（来自 DSH 已注册工作区，默认自动定位到当前会话所在项目）与
**aoci 二进制切换**（自动探测目录下所有 `aoci*.exe` 并按 rc 版本降序，rc19+ 优先）。

## 认知视图（AOCI 对项目做了什么）

「认知」标签面向**接手项目的开发者**，回答三个问题：这个仓库被记住了多少、缺哪些红线、上次改了什么，
而不是只给出 `条目 420 · code present · meta present` 这种原理层面的叙述。

**价值卡（首屏）**

| 卡 | 内容 | 读法 |
| --- | --- | --- |
| 记忆覆盖 | `code_entry_count / code_source_count`、覆盖率、盲区 | 覆盖率 100% 表示每个受管源文件都有认知条目 |
| 约束缺口 | 高价值条目里缺 `S` 的数量，以及全量 `S` 覆盖 | 缺口就是「还没写下来的坑」 |
| 索引预算 | `whole_index_tokens / target_tokens` 与水位 | 索引占多少上下文预算 |
| 治理状态 | aligned / 未对齐、漂移数、待处理事务、受管条目 | 现在是否真的需要人介入 |
| 最近认知更新 | 最近一次 `aoci.code.txt` 提交的 hash 与标题 | 上次认知变化是什么 |

**子视图**

| 子视图 | 数据来源 | 回答什么 |
| --- | --- | --- |
| 变更账本 | `git log -p -- aoci.code.txt`（最近 8 次提交） | 每次提交新增 / 更新 / 删除了哪些条目（全路径 + 标签 + F） |
| 开发须知 | `aoci.code.txt` 的全部 `S` 约束（按目录分组、可搜索） | 改这个仓库前必须知道的红线 |
| 认知地图 | 条目按目录聚合（条目数 / S 覆盖 / C9 高价值） | 记住了哪部分、哪里还是盲区 |
| 健康时间线 | `.aoci/verify_history`（最近 10 条） | 治理是持续校验出来的过程，不是静态标签 |
| 资产清单 | `aoci.txt` / `aoci.code.txt` / `aoci.meta.txt` / `.aoci/baseline.json` / `.aoci/ledger.jsonl` / `.aoci/verify_history` | AOCI 在仓库里到底写了什么、多大、何时写入 |

对应只读端点 `GET /aoci-panel/cognition?repo=<路径>&bin=<aoci 可执行文件>`；解析与聚合在
`lib/cognition.js`（纯 Node，不调用 aoci CLI、不写文件）。它与其他端点保持同样的只读边界：
不修改 `aoci.txt` / `.aoci` 正式资产，`git log` 与 `verify_history` 都只是读取。

**降级语义**：`bin` 是可选参数。不传 `bin`、或本机 aoci 二进制不可用时，端点会返回
`degraded: true` + `reason`，且 `metrics.governanceAvailable = false`——凡是只能由治理快照得出的
指标（`sourceCount` / `coveragePct` / `budget*` / `aligned` / `driftCount` / `scope*`）一律为 `null`，
**不会写成 0 或 false**，避免消费者把「没查到」误读成「0 源、未对齐」。由索引文本本身可得的数字
（`entryCount` / `sEntries` / `sPresent` / `sPct`）与账本、约束、地图、资产视图照常可用。

## 索引文件管控

「索引文件」标签把 AOCI 的三个受管资产当成可直接编辑的文档来管：

- **读取**：`GET /aoci-panel/assets?repo=` 返回正文、行数、字节、EOL、sha256、修改时间、历史备份与结构校验结果；
  校验失败不会隐藏文件，只标出原因。
- **保存**：`POST /aoci-panel/assets` 要求 `{ repo, name, content, expectedSha256 }`。宿主先做名称白名单与
  sha256 CAS（不一致返回 `ASSET_CHANGED`，提示重新载入），再把内容归一为 LF、补齐末尾换行、跑结构校验
  （`lib/assets.js`，口径与 `aoci verify` 同源），通过后才把旧内容备份到
  `.aoci/<文件名>.<YYYYMMDD-HHmmss>.bak` 并写盘；任何一步失败都不落盘。
- **恢复**：`POST /aoci-panel/assets/restore` 只接受 `.aoci/` 下同名前缀的 `.bak`，恢复前同样做结构校验，
  并把当前内容另存一份备份。
- **范围与边界**：只管 `aoci.txt`、`aoci.meta.txt`、`aoci.code.txt`；不改 `.aoci/baseline.json`、
  `ledger.jsonl`、`verify_history`。保存成功后建议点顶栏「校验」（真实跑一次 `aoci verify`）让基线与内容
  重新对齐，或按 AOCI Guide 让 Agent 走 maintain 收尾——面板不会替你改治理状态。
- **校验口径**：根清单首行 / `Format-Version` / 至少一个 `kind=code` 卷；元卷首行 / `#[Tag dictionary: code]`
  / 必需字典行；代码卷复用 `parseVolume` 逐行切 `F / R / A / S`，空卷报错、可疑标签与重复 id 给警告、
  超过 200 KiB 直接拒绝。

## 快捷动作与提示词

多工作区详情与单仓库页都内置快捷动作：`verify` / `check` / `status` / `doctor` / `index agent guide`
一键执行，结果给**人话摘要**（错误码解释 + 下一步），原始 JSON 可折叠查看。

按治理状态生成可复制的 Agent 提示词（均带本仓库的 `mcp__<serverName>__` 前缀与绑定自检句）：

| 状态 | 提示词要点 |
| --- | --- |
| aligned | `maintain`：收尾时 aoci_maintain 领批次 → 创作完整 F/R/A/S → aoci_update_entry 完整批次提交，remaining 非零继续，最后 verify + check |
| 索引未对齐 / 待作者化 | `authoring`：aoci_rules → aoci_overview → 按 Guide 执行 Fresh Bootstrap 直到 aligned |
| repair_required | `repair`：只修 findings 命中的 retry_scope，其余字节不变，重提同一完整批次 |
| Recovery / 待处理事务 | `recovery`：按 Guide 的 stopped 处置规则（closure / Resume / Rollback），证据不足才停下请人工裁决 |

## AOCI 接入工具（合并自 dsh-aoci-bind）

面板负责给人看，四条工具负责让 Agent 自己发现、诊断、修复并初始化绑定。v0.6.0 起内置，
不再需要单独安装 `dsh-aoci-bind`。

| 工具 | 作用 |
| --- | --- |
| `aoci_bind_status` | 逐工作区诊断绑定：`bound` / `unbound` / `wrong_repo` / `name_conflict` / `duplicate_binding` / `no_index`；只读 |
| `aoci_bind_repair` | 应用最小修复（补行 / 改 `--repo` / 改 serverName / 可选删孤儿行）：幂等、写前时间戳备份、YAML 校验失败拒绝写入 |
| `aoci_project_init` | 对无索引仓库执行 `aoci init` + `aoci scan`、注册绑定，并返回带 `mcp__<serverName>__` 前缀与 root 自检的 bootstrap 提示词 |
| `aoci_doctor` | 环境体检：CLI 可达性与版本、补丁是否合法、serverName 唯一、未绑定索引、孤儿行、workspace registry 可读性 |

- 工具与面板共用同一套配置与补丁目标；`bind.enabled=false` 整体关闭，`bind.tools=false` 只关工具（面板仍可用）。
- 每个工具返回结构化 JSON + 可读摘要；所有写入都限于 `cordis.patch.yml` 里的 MCP 绑定行，绝不改索引内容。
- 工具修复 / 新增的绑定行需要**重启 DSH** 才会出现在会话工具表里（工具不会自行重启）。
- 迁移：原来单独安装的 `dsh-aoci-bind` 可以卸载；两者同时安装会重复注册同名工具，建议只保留本插件。

## 安装 AOCI（初始化闭环）

被观察的仓库没有 AOCI 时，面板不再只是一句「未初始化」，而是一个完整的安装向导（`初始化` 标签）：

1. **环境预检**：确认仓库尚未初始化、探测 aoci 可执行文件（目录可改后重新检测；rc19+ 优先，旧 rc14 探测降级）、
   探测 DSH home（**优先 `~\.dsh-harness-next`，兼容旧 `~\.dsh`**）并列出可选补丁目标
   （home 全局补丁 / 各 profile 的 `cordis.patch.yml`），按仓库路径幂等识别既有接入。
2. **安装选项**：Locale（`zh-CN` / `en-US`）、Managed Scope（`production` / `full`）、
   其他 Agent 接入（`--agent claude/codex/cursor/opencode/qoder/all`）、生命周期 hook、
   是否执行 `aoci scan` 建基线、是否接入 DSH、补丁目标。
3. **执行**：面板原样展示将执行的命令与将追加的 YAML 后才动手 ——
   `aoci init` 生成索引骨架与 AGENTS.md 契约区块；`aoci scan` 建基线指纹；
   接入 DSH 则向选定补丁目标追加一条 `dsh-mcp-client` 行
   （行 id 与 `serverName` 自动防碰撞，跨 home/profile 补丁检测；写前做时间戳备份，
   追加前校验文件仍是合法条目列表，否则拒绝改写并把 YAML 原文交给用户手动处理）。
4. **后续引导**：重启 DSH 生效 → 在该仓库打开会话、粘贴面板给出的提示词让 Agent
   按 Guide 构建完整索引 → 回到面板查看治理状态。

**批量初始化**（`初始化` 标签下半）：勾选多个未初始化工作区 → 统一选项 → 顺序执行
init（+scan）+ DSH 接入，每个仓库独立行 id / serverName（防碰撞），单个失败不影响后续。

安装只写入目标仓库的 AOCI 资产（`aoci.txt` / `aoci.code.txt` / `aoci.meta.txt` /
`.aoci/` / `AGENTS.md` / `.gitattributes`，均由 aoci CLI 生成）与可选的 DSH 组合补丁行，
不触碰业务代码。CLI 本体从 [aoci-spec/aoci-code](https://github.com/aoci-spec/aoci-code) 获取。

## 环境要求

- **Windows 桌面版 DSH `>= 0.2.0-rc.1`**（`package.json` 的 `engines.dsh` 会在安装时校验）
- 已由 AOCI 建立认知索引的仓库（没有的话直接用面板里的安装向导）
- aoci CLI：面板的功能分两档 ——
  - **展示索引内容**：不需要 CLI（直接解析 `aoci.txt` 与各卷文件，离线可用）；
  - **治理事实 / 校验 / 安装向导**：需要本机 aoci CLI（默认探测 `C:\aoci\bin`，可在面板里改，
    也可用配置项 `binDir` / `binPath` 覆盖）。

## 安装

### 方式一：官方插件命令（推荐）

```powershell
dsh plugin --profile desktop add dsh-aoci-panel        # 从 npm 安装最新版
dsh plugin --profile desktop add dsh-aoci-panel@0.5.0  # 固定版本
dsh plugin --profile desktop add C:\path\to\repo       # 本地链接（开发用）
```

这条命令由 DSH 转发给 pnpm，在 profile 目录里完成三件事，**不需要手工拷贝或改 JSON**：

1. 写入 profile 的 `dependencies`；
2. 安装到 `profiles/<profile>/node_modules`；
3. 把 `dsh-aoci-panel` 追加进 `dsh.profile.bundles`。

`desktop` profile 由桌面应用独占管理，但 `dsh plugin --profile desktop ...` 是官方允许的入口。

### 方式二：Windows 脚本（薄封装）

`scripts/install.ps1` 只是上面命令的包装：自动定位桌面版自带的 `dsh.cmd`、探测 DSH home，
并在安装后校验 profile 清单确实登记了依赖与 bundle。

```powershell
pwsh -File scripts/install.ps1                     # 本地链接（开发）
pwsh -File scripts/install.ps1 -Mode registry      # 从 npm 安装/更新
pwsh -File scripts/install.ps1 -Mode registry -Version 0.4.2  # 回滚到指定版本
pwsh -File scripts/install.ps1 -Profile web        # 指定 profile
pwsh -File scripts/install.ps1 -Mode uninstall     # 卸载
pwsh -File scripts/install.ps1 -WhatIfOnly         # 只打印将执行的命令
```

旧参数 `-Mode link` / `-Mode copy` 都按 `local` 处理，`-Uninstall` 等价于 `-Mode uninstall`。

### 方式三：插件市场「发现」

本仓库维护一个市场索引（见「插件市场」一节）。在 DSH 中：

1. 打开 **插件** → **实验性插件** 旁的 **更多**，启用 **自定义插件市场**；
2. 进入 **发现** → **添加索引源**，填入
   `https://donyue7.github.io/dsh-aoci-panel/index.json`；
3. 找到 **AOCI 认知面板** → **安装**，确认后走的就是官方安装流程。

### 卸载

```powershell
dsh plugin --profile desktop remove dsh-aoci-panel
# 或
pwsh -File scripts/install.ps1 -Mode uninstall
```

## 配置

宿主半支持 profile 级配置。在 `$DSH_HOME/profiles/<profile>/cordis.patch.yml` 里按行 id 覆盖
（`dsh` 的组合层会把它应用在本 bundle 之后）：

```yaml
- id: dsh-aoci-panel
  name: dsh-aoci-panel
  config:
    binDir: 'D:\aoci\bin'
    cacheTtlMs: 60000
    updateCheck: false
```

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `binDir` | `C:\aoci\bin` | aoci 可执行文件所在目录；面板内仍可临时切换 |
| `binPath` | `''` | 直接指定可执行文件；非空时优先于 `binDir` |
| `cliTimeoutMs` | `120000` | 单次 aoci CLI 调用超时（1000–3600000） |
| `cacheTtlMs` | `0` | 快照缓存有效期；`0` = 进程内一直有效，直到显式刷新（0–86400000） |
| `batchLimit` | `20` | 批量初始化允许的仓库数上限（1–100） |
| `locale` | `zh-CN` | 安装向导默认 locale（`zh-CN` / `en-US`） |
| `updateCheck` | `true` | 是否查询 npm registry 检查插件自身新版本 |
| `registryUrl` | `https://registry.npmjs.org` | registry 地址，可指向私有镜像 |
| `updateCheckTimeoutMs` | `5000` | 更新检查超时（500–60000） |
| `updateCheckTtlMs` | `21600000` | 更新检查结果的内存缓存（0–604800000） |
| `profile` | `''` | 更新命令里的 profile；留空读 `DSH_PROFILE`，再回退 `desktop` |
| `bind` | `{}` | 合并自 dsh-aoci-bind 的接入工具配置（字段见下） |

`bind` 是唯一嵌套对象，字段沿用 `dsh-aoci-bind` 的设计：`enabled`（默认 `true`，整体开关）、
`tools`（`true`，只关工具注册）、`promptSection`（`false`，是否在系统提示词加接入段）、
`aociBinary`（留空 = 复用面板探测到的 aoci）、`home` / `profile` / `profileDir`、`legacyHome`（`auto`）、
`syncProfilePatch`（`true`）、`serverNamePrefix`（`aoci`）、`scanRoots`（默认取已注册工作区的父目录）、
`backupDir`（`<home>/aoci-bind/backups`）、`initTimeoutMs`（`180000`）、`probeTimeoutMs`（`20000`）。

配置在装载时校验：类型错误、越界、非法 URL、拼错的字段都会让本行装载失败并在日志里报错，
不会带着错误默认值继续运行。`/aoci-panel/about` 会回显实际生效的关键配置。

## 更新

面板顶栏的 **`v0.6.0`** 按钮打开「插件版本与更新」卡片：当前版本、安装 profile、
最新版本、检查时间与一条可复制的命令：

```powershell
dsh plugin --profile desktop add dsh-aoci-panel@latest
```

更新检查只读 npm registry 的 `latest` 标签，带超时与内存缓存；网络不可用时静默降级
（卡片显示原因，面板其余功能不受影响）。**面板不会自动执行更新**：改 profile 必须重启 DSH 才会装载新的宿主半。

回滚：

```powershell
dsh plugin --profile desktop add dsh-aoci-panel@0.4.2
```

## 插件市场

`market/index.json` 是 DSH 插件市场索引，由 `scripts/market-index.mjs` 从 npm registry 生成
（版本、发布时间、`engines.dsh` 都取自 registry，不手工维护）：

```powershell
npm run market                 # 重新生成 market/index.json 与 market/icons/aoci.svg
node scripts/market-index.mjs --check   # 只校验
```

GitHub Actions 的 `Market Index` 工作流会在这些时机重新生成并发布到 GitHub Pages
（`https://donyue7.github.io/dsh-aoci-panel/index.json`）：

- `main` 上 `market/`、`icon.svg` 或生成脚本变更；
- `Publish Package` 工作流成功之后（新版本刚发布时索引自动跟上）；
- 每天定时（`17 3 * * *`）与手动触发。

因此发布新版本后通常**不需要**手工改索引；本地 `npm run market` 只是让仓库里的快照与线上一致。
首次启用需在仓库 **Settings → Pages** 把 Source 设为 **GitHub Actions**。

## 数据来源与缓存语义

- **索引内容**：宿主半直接解析仓库里的 `aoci.txt` 根清单与各卷文件。**不依赖 CLI**，因此离线也能用。
- **治理事实**：调用本机 aoci CLI 的 `status --json` 与 `check --json`；快捷动作按需执行
  `verify / check / status / doctor / index agent guide`（`--json`）。
- **多工作区总览**：`GET /aoci-panel/workspaces` 逐工作区做轻量取数（manifest + `status --json`），
  点行展开时才走单仓库深快照；CLI 不可用时自动降级为**离线只读**（`.aoci/` 基线更新时间 + ledger 尾部的
  最近 verify / check 结论），面板标注离线事实来源。
- **绑定诊断**：`GET /aoci-panel/binding` 行级扫描 home + 各 profile 补丁的 `dsh-mcp-client` 行；
  `POST /aoci-panel/fix-binding` 归一 command / `--repo`（写前时间戳备份，保留行 id 与 serverName）。
- **安装向导**：`GET /aoci-panel/install` 做只读预检；`POST /aoci-panel/install` 执行安装
  （body 带 `repos: [...]` 即批量模式；`aoci init` / `aoci scan` 走与治理事实相同的 CLI 通道；
  DSH 补丁行由宿主半经 `fs` 服务写入，home 与 profile 补丁目标都支持）。
- **接入工具**：`aoci_bind_status` / `aoci_bind_repair` / `aoci_project_init` / `aoci_doctor`
  走 `lib/bind/`，每次调用都重新读补丁文件与 workspace registry（无缓存，手工改完补丁立即反映）；
  写入统一经过 `lib/bind/patchfiles.js`（时间戳备份 + 原子替换 + 写前写后 YAML 校验）。
- **CLI 通道**：按最小权限优先逐级回退 —— `subprocess` 直接 argv → `shell` 默认策略 → `shell` 显式放行。
  命中的通道会被记住并显示在面板底部（`通道=…`），不会静默降级。
- **缓存**：宿主按仓库在内存里缓存快照（单仓库深快照与工作区轻量状态分开缓存）。
  **切换标签、重开面板、重新挂载都不会重新取数**；只有「刷新」「校验」与快捷动作 verify/check
  才触发重算（安装成功也会令该仓库缓存失效）。顶部 `数据 HH:MM:SS` 标明这份快照的时间。
  默认缓存活在本进程内、DSH 重启后首次打开会重新计算；把 `cacheTtlMs` 设为正数可让它按时间自动过期。
- **体验**：搜索 / 排序、区块折叠、最近操作时间线、错误码人话解释、数据时间与 aoci 版本标注；
  全部配色走 `--dsw-alias-*` 主题令牌，深色主题自动适配；窄屏下工具条与网格自动换行。

## 架构

```
dsh-aoci-panel
├── package.json         # main=宿主半，exports["./client"]=浏览器 bundle，dsh.client 声明
│                        # exports["./locale/*.json"] / "./icon" 供插件管理器读取显示元数据
├── cordis.patch.yml     # bundle patch 层：向宿主组合插入 dsh-aoci-panel 行
├── locale/{en,zh}.json  # meta.title / meta.description（插件管理器不激活插件也能读）
├── icon.svg             # 插件图标（≤256 KiB）
├── market/              # DSH 插件市场索引与图标（GitHub Pages 托管）
└── lib
    ├── index.js         # 宿主半：/aoci-panel/{state,cognition,entry,verify,workspaces,binding,about,assets} 只读精确路由
    │                    #         + /aoci-panel/{install,action,fix-binding}（GET 预检 / POST 执行）
    │                    #         + /aoci-panel/assets/restore（POST 备份恢复）
    ├── config.js        # 配置默认值、规格化与校验（装载期响亮失败）
    ├── about.js         # 版本比较、registry 更新检查、更新命令生成
    ├── cognition.js     # 认知数据层：条目/约束/目录聚合、git 变更账本、verify 时间线、资产清单（纯 Node，只读）
    ├── assets.js        # 索引文件管控纯函数：名称白名单、EOL/行数/SHA-256、备份命名、三资产结构校验（可单测）
    ├── bind/            # 合并自 dsh-aoci-bind 的 AOCI 接入工具（零第三方依赖）
    │   ├── index.js     # 工具挂载入口：tools 服务可用时注册 4 个工具
    │   ├── config.js    # 工具配置默认值与规格化
    │   ├── tools.js     # 4 个工具的 schema、校验与摘要渲染
    │   ├── binding.js   # 绑定诊断与修复计划（纯函数）
    │   ├── discovery.js # workspace registry 与扫描根发现
    │   ├── patchfiles.js# 补丁读取、时间戳备份、原子写入
    │   ├── yamlpatch.js # 行级 YAML 补丁模型（只拼不重排）
    │   ├── state.js     # 每次调用重建的只读快照
    │   ├── aoci.js      # aoci CLI 子进程 seam（init / scan / version）
    │   ├── toolkit.js   # 无依赖 ToolDefinition 构造与参数校验
    │   └── prompt.js    # bootstrap 提示词
    └── client.js        # 浏览器半：window.__ModuleLoader__.load 注册 conversation.view 标签页
                         #         含多工作区总览、认知视图、索引文件编辑、绑定诊断、安装向导、
                         #         批量初始化、版本/更新与引导卡片
```

- 宿主半是普通 Cordis 插件（`export { name, inject, apply }`），依赖 `webServer`；它只提供 JSON 端点，
  浏览器半用同源 `fetch` 取数。
- `apply(ctx, config)` 先做配置校验，再注册路由；路由注册异常不会阻断 profile 启动。
- 浏览器半注册进 `conversation.view`（`id: aoci`, `order: 30`），所以它与「对话 / 轨迹 / 上下文」同级并列，
  不替换任何既有 UI。
- 装载失败被 `apply` 内的 try/catch 包住：一个可选只读面板不会阻断 profile 启动。

## 开发

```powershell
pwsh -File scripts/install.ps1                 # 本地链接进 desktop profile（改完保存即生效）
node scripts/check.mjs                         # 自检门（跨平台，零依赖）
npm test                                       # 全部单元测试 + 浏览器半冒烟
pwsh -File scripts/install.ps1 -Mode registry  # 发布前用 registry 版本做一次真实安装验证
npm run market                                 # 发布后刷新市场索引
```

`npm test` 覆盖六层，全部离线、不启动 DSH：

```powershell
node --test scripts/test-cognition.mjs     # 数据层：解析器 + 指标换算 + 本仓库只读采集（TEST_REPO 可覆盖）
node --test scripts/test-host.mjs          # 宿主半：配置校验 / 版本比较 / 更新检查 / 市场索引
node --test scripts/test-assets.mjs        # 索引资产层：校验规则 / LF 归一 / 备份命名 / 本仓库三资产自校验
node --test scripts/test-host-routes.mjs   # 宿主半端点：假 ctx 装载 apply()，资产读写 / CAS / 校验拒绝 / 备份恢复
node --test test/bind/*.test.mjs           # 接入工具层：绑定补丁行模型 / 发现 / 工具注册（合并自 dsh-aoci-bind）
node scripts/test-client-cognition.mjs     # 浏览器半：用微型 React 替身真实渲染 5 个子视图 + 索引文件视图
```

### 改动如何生效

这两条不是经验之谈，是在本机 DSH Desktop 0.2.1-rc.3 上对着实现核对过的：

| 改哪里 | 生效方式 | 依据 |
| --- | --- | --- |
| `lib/client.js`（浏览器半） | **保存即生效**。`client-hmr` 行恒常挂载，其 node 半侧按 `pollIntervalMs = 500` 轮询每个已组装 bundle 的产物文件；文件一变即 `rebuilt()` → `/plugins/events` SSE → 页面**原地替换**该插件（React 状态丢失，会话与连接保留），不需要刷新页面、不需要重启 DSH | `dsh-web-app/cordis.patch.yml` 的 `client-hmr` 行；`dsh-client-hmr` README 与实现 |
| `lib/index.js`（宿主半） | **必须重启 DSH**。桌面宿主是 `utilityProcess.fork(host-process-entry.js, [], …)`，未传 `execArgv`，因此没有 `--expose-internals`；而 `cordis-plugin-hmr` 的服务构造要求它（`requireInternal` 里直接检查 `process.execArgv`），`dsh-base` 也把 `hmr` 行默认写成 `disabled: true`。宿主一旦退出，应用只提示“restart the application to reconnect”，不会自动拉起 | `resources/app/lib/main.js`、`dsh-base/cordis.patch.yml`、`cordis-plugin-hmr/src/index.ts` |

由此推出一条开发约定：**展示与解析逻辑尽量留在 `lib/client.js` 里迭代**（零重启），宿主半的改动攒起来、过一次自检门再重启。

### 自检门查什么

`node scripts/check.mjs` 只用 Node 内置模块，不需要 aoci CLI；`scripts/check.ps1` 只是它的 pwsh 薄封装。
CI（`.github/workflows/ci.yml`）在 Windows 与 Ubuntu 上都会跑。

1. `package.json` 的宿主半 / 浏览器半 / 补丁层 / 显示资源 / `engines.dsh` 声明齐全
2. `files` 清单列出的路径都真实存在（支持目录与 `*` / `**`）
3. `main`、`exports`、`dsh.bundle.patch` 都落在交付内容里
4. JS 里的相对 import 都落在交付内容里
5. `cordis.patch.yml` 的 id/name 等于包名
6. `locale/*.json` 都有非空 `meta.title` / `meta.description`，且必须有 `en.json`
7. 图标存在、格式可识别、不超过 256 KiB
8. 交付文件是 LF 行尾（`.gitattributes` 强制 LF；CRLF 会让 AOCI 基线整树 Stale）
9. `node --check` 语法
10. `market/index.json` 与当前版本一致（缺失或落后时 WARN）
11. 受管文件相对 `.aoci/baseline.json` 的漂移（默认 WARN，`--require-aoci-aligned` 时 FAIL，适合提交前跑）

第 3、4 项是这份脚本存在的理由：`files` 与安装脚本曾经各写一份清单，而漏项的后果是**发布出去的包缺文件**。
第 6、7 项对应 DSH 插件管理器：它不激活插件也要读标题、描述与图标。

## 已知限制

- **Windows 桌面版专属**：路径探测、安装脚本与文档都按 Windows 桌面版设计；未验证 macOS / Linux。
- **写路径只有三类**：安装向导（aoci init/scan 产物与可选 DSH 补丁行）、修复绑定（补丁行归一）、
  索引文件保存/恢复（三个受管索引 + `.aoci/` 时间戳备份，见「索引文件管控」）。除此之外面板只读：
  不写业务文件、不改 `.aoci/baseline.json`；「校验 / 快捷动作 verify」会让 aoci 自己追加
  `.aoci/verify_history` 审计记录（该目录已被 `.aoci/.gitignore` 忽略）。
- DSH 补丁行追加/归一后需**重启 DSH** 才生效（组合在启动时装配）；面板各处会提醒。**面板绝不自行重启 DSH。**
- 「修复绑定」只归一同一补丁文件里 `--repo` 指向该仓库的行的 command / `--repo`；
  serverName 冲突的**改名**不自动做（会改变会话里的工具命名空间），需人工裁决。
- 多工作区总览按工作区逐个调 CLI（轻量 `status --json`），工作区很多时首屏会慢一些；
  面板端有防抖（切换仓库不重复取数）与失败重试（「刷新」按钮），CLI 不可用时自动降级离线只读。
- 面板是宿主进程内的会话期缓存；重启后首屏需要重新取数（可用 `cacheTtlMs` 让它按时间过期）。
- **桌面版宿主半没有模块热重载**：`lib/index.js` 的改动必须重启 DSH（原因见「开发」一节）。
- 本地链接安装（`dsh plugin add <目录>`）是开发便利：`pnpm install`、插件市场装卸等操作可能把它换回
  真实目录，重跑一次 `dsh plugin add <目录>` 即可。正式使用请安装 registry 版本。
- 更新检查依赖 npm registry 可达；企业镜像或离线环境可用 `registryUrl` / `updateCheck` 调整。
- **接入工具依赖宿主 `tools` 服务**：Web 宿主默认具备；没有该服务时四条工具不注册，面板其余部分照常工作。
  工具修复 / 新增的 MCP 绑定行仍需重启 DSH 才在会话工具表出现。

## 故障排查

| 现象 | 排查 |
| --- | --- |
| 标签栏没有 `AOCI` | 先 `dsh plugin --profile desktop list` 确认已安装；profile 的 `dsh.profile.bundles` 是否含 `dsh-aoci-panel`；是否重启过 DSH；DSH 日志中搜 `dsh-aoci-panel` |
| 顶栏版本按钮显示「检查更新失败」 | registry 不可达或代理未配置；用 `registryUrl` 指向镜像，或 `updateCheck: false` 关闭检查（不影响面板使用） |
| 执行更新命令后版本没变 | 更新改的是 profile 依赖，必须重启 DSH；确认命令里的 `--profile` 与当前运行的一致（版本卡片会显示） |
| 卡片显示「未取得治理事实」 | 看卡片底部 `CLI:` 行的 `通道=` 与 `尝试=` 列表，以及下方的错误详情；CLI 全不可用时面板自动降级为离线只读（基线 + ledger） |
| 治理数字可疑（业务源文件 = 0） | 典型沙箱拦截迹象：CLI 被围栏后无法枚举业务源清单，请以终端里手跑的 `aoci verify` 为准 |
| 会话里拿不到某仓库的 aoci 工具 | 打开「绑定诊断」标签：看是否未绑定 / serverName 冲突 / 绑错仓库，按卡片给的修复动作处理；重启 DSH 后生效 |
| 会话拿到了**别的仓库**的 aoci 工具 | 用绑定诊断里的「绑定自检」提示词核对 `runtime_repository_root`；多仓库并存时认准各自行的 `mcp__<serverName>__` 前缀，别用通用 `mcp__aoci__*` |
| 保存索引文件被拒绝（`ASSET_CHANGED`） | 文件已被 aoci 或编辑器改过：点「重新载入」拿最新 sha 再保存；也可到 `.aoci/` 下用时间戳备份手工比对 |
| 索引文件保存后治理仍报 drift | 面板只写文件、不改基线：点顶栏「校验」跑一次 `aoci verify`，或按 AOCI Guide 让 Agent 走 maintain 收尾 |
| 顶部仓库下拉是空的 | 该 DSH 实例还没有注册过工作区 |
| 安装向导提示未探测到 aoci CLI | 确认本机有 aoci 可执行文件（官方仓库 [aoci-spec/aoci-code](https://github.com/aoci-spec/aoci-code)），或在向导里改「aoci 可执行目录」后重新检测 |
| DSH 接入后工具没出现 | 确认重启过 DSH；用绑定诊断查行 id / `serverName` 是否与其他行重复；DSH 日志中搜 `dsh-mcp-client` |
| 批量初始化某个仓库失败 | 看批量结果里该行的错误信息（单个失败不影响后续）；常见原因是目标仓库已有 aoci.txt 或 aoci init 退出码非 0 |
| 会话里没有 `aoci_bind_status` 等接入工具 | 确认 DSH 版本带 `tools` 服务并已重启；`绑定诊断` 标签能出数据说明补丁本身可读；再用 `aoci_doctor` 查 CLI 与 YAML 合法性 |
| 接入工具写补丁失败 | 看返回的 `errors`（多为 YAML 不合法或目标目录不可写）；备份在 `bind.backupDir`；YAML 校验失败时工具不会写入 |

## 许可证

[MIT](LICENSE)
