# dsh-aoci-panel

给 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）用的 AOCI 认知面板插件：在会话视图标签栏
加一个 **`AOCI`** 标签，点开即可看到**多工作区 AOCI 总览**、当前项目的索引概览、治理状态与条目浏览、
MCP 绑定诊断与快捷动作；项目尚未构建 AOCI 时，可直接在面板里**引导式初始化**（单仓库或批量）。

## 功能

| 标签 | 内容 |
| --- | --- |
| 多工作区 | 一屏聚合所有注册 DSH 工作区的 AOCI 状态：是否 aligned / 需作者化 / Recovery / 待处理事务 / 报告待处理 / 条目数 / 各卷状态 / 最后 verify 时间与结果 / 绑定的 serverName 与工具命名空间；支持搜索与三种排序（名称 / 条目数 / 治理状态），点行展开单仓库深取详情 + 快捷动作 |
| 单仓库 | 索引概览（项目、布局、条目数、各卷、composite_identity、基线、最近 verify、待处理报告、最近操作）；治理状态（对齐结论、漂移明细、预算水位、Scope 规则、Findings、CLI 通道）；条目浏览（按路径/标签/F 搜索，展开完整 `F / R / A / S`，标签按元卷词典解义） |
| 绑定诊断 | 该仓库绑定的 MCP `serverName` 与工具命名空间（`mcp__<serverName>__`）；检测 serverName 冲突、未绑定、绑错仓库（`--repo` 不一致）、旧二进制（rc 版本落后）；一键「修复绑定」归一 command / `--repo`（写前备份，保留行 id 与 serverName）；给出可直接粘贴的 Agent 提示词（bootstrap / 绑定自检） |
| 初始化 | 单仓库安装向导（未初始化仓库自动出现）+ 多工作区**批量初始化**（多选未初始化工作区，每仓库独立 serverName，顺序执行） |
| 认知 | 回答「AOCI 对这个仓库做了什么、对开发者有什么用」：5 张价值卡（记忆覆盖 / 约束缺口 / 索引预算 / 治理状态 / 最近认知更新）+ 5 个子视图（变更账本 / 开发须知 / 认知地图 / 健康时间线 / 资产清单），全部来自仓库内既有产物，只读 |
| 引导 | 顶部「引导」按钮：AOCI 概念、生命周期、面板区块说明、常用 CLI 命令速查 |

顶部工具条提供：**标签切换**、**引导**、**数据时间**、**刷新**、**校验**（真实执行一次 `aoci verify`）；
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

- DSH（DeepSeek Harness）桌面版，或任意带 Web 前端的 profile
- 已由 AOCI 建立认知索引的仓库（没有的话直接用上面的安装向导）
- aoci CLI：面板的功能分两档 ——
  - **展示索引内容**：不需要 CLI（直接解析 `aoci.txt` 与各卷文件，离线可用）；
  - **治理事实 / 校验 / 安装向导**：需要本机 aoci CLI（默认探测 `C:\aoci\bin`，可在向导里改）。

## 安装

### 方式一：一键脚本（推荐）

```powershell
pwsh -File scripts/install.ps1                  # copy 模式（默认）：按 files 清单拷贝，与 npm 发布内容一致
pwsh -File scripts/install.ps1 -Mode link       # link 模式：profile 直连本仓库（junction），开发用
pwsh -File scripts/install.ps1 -Profile web     # 或指定 profile
pwsh -File scripts/install.ps1 -WhatIfOnly      # 只看它打算做什么
```

脚本做三件事，并且是幂等的：

1. 把本包放进 `$DSH_HOME/profiles/<profile>/node_modules/dsh-aoci-panel`
2. 在该 profile 的 `package.json` 的 `dsh.profile.bundles` 末尾追加 `"dsh-aoci-panel"`（改之前自动备份为 `package.json.bak-aoci`）
3. 打印本次改动需要的生效方式

第 1 步的清单**不硬编码**：`copy` 模式直接读 `package.json` 的 `files`，安装内容与 npm 发布内容因此不会各自漂移；
`link` 模式只建一个目录联接，改完保存即生效。发布前请用默认的 `copy` 模式再验一次真实安装。

### 方式二：手工三步

```powershell
$prof = "$env:USERPROFILE\.dsh\profiles\desktop"
New-Item -ItemType Directory -Force -Path "$prof\node_modules\dsh-aoci-panel\lib" | Out-Null
Copy-Item .\package.json, .\cordis.patch.yml "$prof\node_modules\dsh-aoci-panel\" -Force
Copy-Item .\lib\*.js "$prof\node_modules\dsh-aoci-panel\lib\" -Force
```

然后编辑 `$prof\package.json`，在 `dsh.profile.bundles` 数组里加一项 `"dsh-aoci-panel"`，重启 DSH。

插件包靠两点被发现：profile 的 `dsh.profile.bundles` 列出它，包内 `cordis.patch.yml` 插入宿主行；
`package.json` 的 `dsh.client` 声明让 Web 前端加载 `./client` 浏览器 bundle。

### 卸载

```powershell
pwsh -File scripts/install.ps1 -Uninstall
```

或手工：删掉 `dsh.profile.bundles` 里那一行（也可直接还原 `package.json.bak-aoci`），
再删掉 `node_modules\dsh-aoci-panel` 目录，重启。

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
- **CLI 通道**：按最小权限优先逐级回退 —— `subprocess` 直接 argv → `shell` 默认策略 → `shell` 显式放行。
  命中的通道会被记住并显示在面板底部（`通道=…`），不会静默降级。
- **缓存**：宿主按仓库在内存里缓存快照（单仓库深快照与工作区轻量状态分开缓存）。
  **切换标签、重开面板、重新挂载都不会重新取数**；只有「刷新」「校验」与快捷动作 verify/check
  才触发重算（安装成功也会令该仓库缓存失效）。顶部 `数据 HH:MM:SS` 标明这份快照的时间。
  缓存活在本进程内，DSH 重启后首次打开会重新计算。
- **体验**：搜索 / 排序、区块折叠、最近操作时间线、错误码人话解释、数据时间与 aoci 版本标注；
  全部配色走 `--dsw-alias-*` 主题令牌，深色主题自动适配；窄屏下工具条与网格自动换行。

## 架构

```
dsh-aoci-panel
├── package.json         # main=宿主半，exports["./client"]=浏览器 bundle，dsh.client 声明
├── cordis.patch.yml     # bundle patch 层：向宿主组合插入 dsh-aoci-panel 行
└── lib
    ├── index.js         # 宿主半：/aoci-panel/{state,cognition,entry,verify,workspaces,binding} 只读精确路由
    │                    #         + /aoci-panel/{install,action,fix-binding}（GET 预检 / POST 执行）
    ├── cognition.js     # 认知数据层：条目/约束/目录聚合、git 变更账本、verify 时间线、资产清单（纯 Node，只读）
    └── client.js        # 浏览器半：window.__ModuleLoader__.load 注册 conversation.view 标签页
                         #         含多工作区总览、认知视图、绑定诊断、安装向导、批量初始化与引导卡片
```

- 宿主半是普通 Cordis 插件（`export { name, inject, apply }`），依赖 `webServer`；它只提供 JSON 端点，
  浏览器半用同源 `fetch` 取数。
- 浏览器半注册进 `conversation.view`（`id: aoci`, `order: 30`），所以它与「对话 / 轨迹 / 上下文」同级并列，
  不替换任何既有 UI。
- 装载失败被 `apply` 内的 try/catch 包住：一个可选只读面板不会阻断 profile 启动。

## 开发

```powershell
pwsh -File scripts/install.ps1 -Mode link   # 装一次：profile 直连本仓库
pwsh -File scripts/check.ps1                # 自检门：语法 / 交付清单 / 契约 / 行尾 / AOCI 基线
pwsh -File scripts/install.ps1              # 发布前用 copy 模式做一次真实安装验证

# 认知视图的两层测试（零外部依赖，不启动 DSH）
node --test scripts/test-cognition.mjs        # 数据层：解析器 + 指标换算 + 真实仓库（TEST_REPO，默认 Gys）
node scripts/test-client-cognition.mjs        # 浏览器半：用微型 React 替身真实渲染 5 个子视图
```

### 改动如何生效

这两条不是经验之谈，是在本机 DSH Desktop 2.0.13 上对着实现核对过的：

| 改哪里 | 生效方式 | 依据 |
| --- | --- | --- |
| `lib/client.js`（浏览器半） | **保存即生效**。`client-hmr` 行恒常挂载，其 node 半侧按 `pollIntervalMs = 500` 轮询每个已组装 bundle 的产物文件；文件一变即 `rebuilt()` → `/plugins/events` SSE → 页面**原地替换**该插件（React 状态丢失，会话与连接保留），不需要刷新页面、不需要重启 DSH | `dsh-web-app/cordis.patch.yml` 的 `client-hmr` 行；`dsh-client-hmr` README 与实现 |
| `lib/index.js`（宿主半） | **必须重启 DSH**。桌面宿主是 `utilityProcess.fork(host-process-entry.js, [], …)`，未传 `execArgv`，因此没有 `--expose-internals`；而 `cordis-plugin-hmr` 的服务构造要求它（`requireInternal` 里直接检查 `process.execArgv`），`dsh-base` 也把 `hmr` 行默认写成 `disabled: true`。宿主一旦退出，应用只提示“restart the application to reconnect”，不会自动拉起 | `resources/app/lib/main.js`、`dsh-base/cordis.patch.yml`、`cordis-plugin-hmr/src/index.ts` |

由此推出一条开发约定：**展示与解析逻辑尽量留在 `lib/client.js` 里迭代**（零重启），宿主半的改动攒起来、过一次自检门再重启。

### 自检门查什么

`scripts/check.ps1` 只用 pwsh + node，不需要 aoci CLI：

1. `package.json` 的宿主半 / 浏览器半 / 补丁层 / 插槽声明齐全
2. `files` 清单列出的路径都真实存在
3. `main`、`exports`、`dsh.bundle.patch` 都落在交付内容里
4. JS 里的相对 import 都落在交付内容里
5. `cordis.patch.yml` 的 id/name 等于包名
6. 交付文件是 LF 行尾（`.gitattributes` 强制 LF；CRLF 会让 AOCI 基线整树 Stale）
7. `node --check` 语法
8. 受管文件相对 `.aoci/baseline.json` 的漂移（默认 WARN，`-RequireAociAligned` 时 FAIL，适合提交前跑）

第 3、4 项是这份脚本存在的理由：`files` 与安装脚本曾经各写一份清单，而漏项的后果是**发布出去的包缺文件**。

## 已知限制

- **除安装向导与「修复绑定」外只读**：面板不写业务文件、不修改 `aoci.txt` / `.aoci` 正式资产；
  显式触发的写入仅限目标仓库的 aoci init/scan 产物、可选的 DSH 补丁行追加/归一（备份 + 幂等 + 防碰撞，见上）；
  「校验 / 快捷动作 verify」会让 aoci 自己追加 `.aoci/verify_history` 审计记录（该目录已被 `.aoci/.gitignore` 忽略）。
- DSH 补丁行追加/归一后需**重启 DSH** 才生效（组合在启动时装配）；面板各处会提醒。**面板绝不自行重启 DSH。**
- 「修复绑定」只归一同一补丁文件里 `--repo` 指向该仓库的行的 command / `--repo`；
  serverName 冲突的**改名**不自动做（会改变会话里的工具命名空间），需人工裁决。
- 多工作区总览按工作区逐个调 CLI（轻量 `status --json`），工作区很多时首屏会慢一些；
  面板端有防抖（切换仓库不重复取数）与失败重试（「刷新」按钮），CLI 不可用时自动降级离线只读。
- 本包是**本地包**，只登记在 `dsh.profile.bundles`、未写进 `dependencies`，以避免 `pnpm install`
  去 npm 拉同名包。若你用插件市场装卸其他插件导致 bundles 被重写，标签可能消失，把那一行加回即可。
- 面板是宿主进程内的会话期缓存；重启后首屏需要重新取数。
- **桌面版宿主半没有模块热重载**：`lib/index.js` 的改动必须重启 DSH（原因见「开发」一节）。
- `-Mode link` 是开发便利：profile 里的 `node_modules/dsh-aoci-panel` 会变成指向本仓库的目录联接。
  `pnpm install`、插件市场装卸等操作可能把它换回真实目录或清掉 `bundles` 里的那一行，重跑脚本即可。

## 故障排查

| 现象 | 排查 |
| --- | --- |
| 标签栏没有 `AOCI` | profile 的 `dsh.profile.bundles` 是否含 `dsh-aoci-panel`；是否重启过 DSH；DSH 日志中搜 `dsh-aoci-panel` |
| 卡片显示「未取得治理事实」 | 看卡片底部 `CLI:` 行的 `通道=` 与 `尝试=` 列表，以及下方的错误详情；CLI 全不可用时面板自动降级为离线只读（基线 + ledger） |
| 治理数字可疑（业务源文件 = 0） | 典型沙箱拦截迹象：CLI 被围栏后无法枚举业务源清单，请以终端里手跑的 `aoci verify` 为准 |
| 会话里拿不到某仓库的 aoci 工具 | 打开「绑定诊断」标签：看是否未绑定 / serverName 冲突 / 绑错仓库，按卡片给的修复动作处理；重启 DSH 后生效 |
| 会话拿到了**别的仓库**的 aoci 工具 | 用绑定诊断里的「绑定自检」提示词核对 `runtime_repository_root`；多仓库并存时认准各自行的 `mcp__<serverName>__` 前缀，别用通用 `mcp__aoci__*` |
| 顶部仓库下拉是空的 | 该 DSH 实例还没有注册过工作区 |
| 安装向导提示未探测到 aoci CLI | 确认本机有 aoci 可执行文件（官方仓库 [aoci-spec/aoci-code](https://github.com/aoci-spec/aoci-code)），或在向导里改「aoci 可执行目录」后重新检测 |
| DSH 接入后工具没出现 | 确认重启过 DSH；用绑定诊断查行 id / `serverName` 是否与其他行重复；DSH 日志中搜 `dsh-mcp-client` |
| 批量初始化某个仓库失败 | 看批量结果里该行的错误信息（单个失败不影响后续）；常见原因是目标仓库已有 aoci.txt 或 aoci init 退出码非 0 |

## 许可证

[MIT](LICENSE)
