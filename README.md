# dsh-aoci-panel

给 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）用的 AOCI 认知面板插件：在会话视图标签栏
加一个 **`AOCI`** 标签，点开即可看到当前项目的 AOCI 认知索引概览、
治理状态与条目浏览；项目尚未构建 AOCI 时，可直接在面板里**引导式安装**。

## 功能

| 区块 | 内容 |
| --- | --- |
| 索引概览 | 项目名、布局模式、索引条目数、各卷状态、`composite_identity`、基线文件数与更新时间、最近一次 verify、待处理报告、最近操作 |
| 治理状态 | 是否对齐、`check` 结果与下一步、待处理事务、Recovery、预算水位、Scope 对齐与 index/observe/exclude 规则数、Code 漂移明细、Findings |
| 条目浏览 | 全部条目可按「路径 / 标签 / F 描述」搜索；点击展开单条完整 `F / R / A / S`，标签按元卷词典解成中文含义 |
| 安装向导 | 仓库没有 `aoci.txt` 时自动出现：环境预检（aoci CLI、DSH home）→ 安装选项（Locale / Scope / Agent / hook）→ 动作预览 → 执行 `aoci init`（+可选 `aoci scan`）与 DSH MCP 行追加 → 后续步骤引导（含可复制的会话提示词） |
| 引导卡片 | 顶部「引导」按钮：AOCI 概念、安装→构建→使用→维护的生命周期、面板区块说明、常用 CLI 命令速查 |

顶部工具条提供：**仓库切换**（来自 DSH 已注册工作区，默认自动定位到当前会话所在项目）、
**aoci 二进制切换**（自动探测目录下所有 `aoci*.exe` 并按 rc 版本降序）、**数据时间**、
**刷新**、**校验**（真实执行一次 `aoci verify`）、**引导**。

## 安装 AOCI（新项目接入）

被观察的仓库没有 AOCI 时，面板不再只是一句「未初始化」，而是一个完整的安装向导：

1. **环境预检**：确认仓库尚未初始化、探测 aoci 可执行文件（目录可改后重新检测）、
   定位 DSH home 并检查 `cordis.patch.yml` 的既有接入（按仓库路径幂等识别）。
2. **安装选项**：Locale（`zh-CN` / `en-US`）、Managed Scope（`production` / `full`）、
   其他 Agent 接入（`--agent claude/codex/cursor/opencode/all`，DSH 之外的客户端）、
   生命周期 hook、是否执行 `aoci scan` 建基线、是否接入 DSH。
3. **执行**：面板原样展示将执行的命令与将追加的 YAML 后才动手 ——
   `aoci init` 生成索引骨架与 AGENTS.md 契约区块；`aoci scan` 建基线指纹；
   接入 DSH 则向 `~/.dsh/cordis.patch.yml` 追加一条 `dsh-mcp-client` 行
   （行 id 与 `serverName` 自动防碰撞，跨 home/profile 补丁检测；写前做时间戳备份，
   追加前校验文件仍是合法条目列表，否则拒绝改写并把 YAML 原文交给用户手动处理）。
4. **后续引导**：重启 DSH 生效 → 在该仓库打开会话、粘贴面板给出的提示词让 Agent
   按 Guide 构建完整索引 → 回到面板查看治理状态。

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
- **治理事实**：调用本机 aoci CLI 的 `status --json` 与 `check --json`；点「校验」额外执行 `verify --json`。
- **安装向导**：`GET /aoci-panel/install` 做只读预检；`POST /aoci-panel/install` 执行安装
  （`aoci init` / `aoci scan` 走与治理事实相同的 CLI 通道；DSH 补丁行由宿主半经 `fs` 服务写入）。
- **CLI 通道**：按最小权限优先逐级回退 —— `subprocess` 直接 argv → `shell` 默认策略 → `shell` 显式放行。
  命中的通道会被记住并显示在面板底部（`通道=…`），不会静默降级。
- **缓存**：宿主按仓库在内存里缓存快照。**切换标签、重开面板、重新挂载都不会重新取数**；
  只有「刷新」与「校验」才触发重算（安装成功也会令该仓库缓存失效）。顶部 `数据 HH:MM:SS` 标明这份快照的时间。
  缓存活在本进程内，DSH 重启后首次打开会重新计算。

## 架构

```
dsh-aoci-panel
├── package.json         # main=宿主半，exports["./client"]=浏览器 bundle，dsh.client 声明
├── cordis.patch.yml     # bundle patch 层：向宿主组合插入 dsh-aoci-panel 行
└── lib
    ├── index.js         # 宿主半：/aoci-panel/{state,entry,verify} 三个只读精确路由
    │                    #         + /aoci-panel/install（GET 预检 / POST 执行安装）
    └── client.js        # 浏览器半：window.__ModuleLoader__.load 注册 conversation.view 标签页
                         #         含安装向导与引导卡片
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

- **除安装向导外只读**：面板不写业务文件、不修改 `aoci.txt` / `.aoci` 正式资产；安装向导显式触发的写入
  仅限目标仓库的 aoci init/scan 产物与可选的 DSH 补丁行（备份 + 幂等 + 防碰撞，见上）；
  「校验」会让 aoci 自己追加 `.aoci/verify_history` 审计记录（该目录已被 `.aoci/.gitignore` 忽略）。
- DSH 补丁行追加后需**重启 DSH** 才生效（组合在启动时装配）；向导的后续步骤里会提醒。
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
| 卡片显示「未取得治理事实」 | 看卡片底部 `CLI:` 行的 `通道=` 与 `尝试=` 列表，以及下方的错误详情 |
| 治理数字可疑（业务源文件 = 0） | 典型沙箱拦截迹象：CLI 被围栏后无法枚举业务源清单，请以终端里手跑的 `aoci verify` 为准 |
| 顶部仓库下拉是空的 | 该 DSH 实例还没有注册过工作区 |
| 安装向导提示未探测到 aoci CLI | 确认本机有 aoci 可执行文件（官方仓库 [aoci-spec/aoci-code](https://github.com/aoci-spec/aoci-code)），或在向导里改「aoci 可执行目录」后重新检测 |
| DSH 接入后工具没出现 | 确认重启过 DSH；检查 `~/.dsh/cordis.patch.yml` 的行 id / `serverName` 是否与其他行重复；DSH 日志中搜 `dsh-mcp-client` |

## 许可证

[MIT](LICENSE)
