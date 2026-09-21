# dsh-aoci-panel

给 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）用的 AOCI 认知面板插件：在会话视图标签栏
加一个 **`AOCI`** 标签，点开即可看到当前项目的 AOCI 认知索引概览、
治理状态与条目浏览。

## 功能

| 区块 | 内容 |
| --- | --- |
| 索引概览 | 项目名、布局模式、索引条目数、各卷状态、`composite_identity`、基线文件数与更新时间、最近一次 verify、待处理报告、最近操作 |
| 治理状态 | 是否对齐、`check` 结果与下一步、待处理事务、Recovery、预算水位、Scope 对齐与 index/observe/exclude 规则数、Code 漂移明细、Findings |
| 条目浏览 | 全部条目可按「路径 / 标签 / F 描述」搜索；点击展开单条完整 `F / R / A / S`，标签按元卷词典解成中文含义 |

顶部工具条提供：**仓库切换**（来自 DSH 已注册工作区，默认自动定位到当前会话所在项目）、
**aoci 二进制切换**（自动探测目录下所有 `aoci*.exe` 并按 rc 版本降序）、**数据时间**、
**刷新**、**校验**（真实执行一次 `aoci verify`）。

## 环境要求

- DSH（DeepSeek Harness）桌面版，或任意带 Web 前端的 profile
- 被观察的仓库已由 AOCI 建立认知索引（根清单 `aoci.txt` + 各卷文件）
- 可选但推荐：本机有 `aoci` CLI，用于取回**实时治理事实**；没有时面板仍可展示索引内容

## 安装

### 方式一：一键脚本（推荐）

```powershell
pwsh -File scripts/install.ps1                  # 默认装进 desktop profile
pwsh -File scripts/install.ps1 -Profile web     # 或指定 profile
pwsh -File scripts/install.ps1 -WhatIfOnly      # 只看它打算做什么
```

脚本做三件事，并且是幂等的：

1. 把本包拷到 `$DSH_HOME/profiles/<profile>/node_modules/dsh-aoci-panel`
2. 在该 profile 的 `package.json` 的 `dsh.profile.bundles` 末尾追加 `"dsh-aoci-panel"`（改之前自动备份为 `package.json.bak-aoci`）
3. 提示你重启 DSH

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
- **CLI 通道**：按最小权限优先逐级回退 —— `subprocess` 直接 argv → `shell` 默认策略 → `shell` 显式放行。
  命中的通道会被记住并显示在面板底部（`通道=…`），不会静默降级。
- **缓存**：宿主按仓库在内存里缓存快照。**切换标签、重开面板、重新挂载都不会重新取数**；
  只有「刷新」与「校验」才触发重算。顶部 `数据 HH:MM:SS` 标明这份快照的时间。
  缓存活在本进程内，DSH 重启后首次打开会重新计算。

## 架构

```
dsh-aoci-panel
├── package.json         # main=宿主半，exports["./client"]=浏览器 bundle，dsh.client 声明
├── cordis.patch.yml     # bundle patch 层：向宿主组合插入 dsh-aoci-panel 行
└── lib
    ├── index.js         # 宿主半：注册 /aoci-panel/{state,entry,verify} 三个只读精确路由
    └── client.js        # 浏览器半：window.__ModuleLoader__.load 注册 conversation.view 标签页
```

- 宿主半是普通 Cordis 插件（`export { name, inject, apply }`），依赖 `webServer`；它只提供 JSON 端点，
  浏览器半用同源 `fetch` 取数。
- 浏览器半注册进 `conversation.view`（`id: aoci`, `order: 30`），所以它与「对话 / 轨迹 / 上下文」同级并列，
  不替换任何既有 UI。
- 装载失败被 `apply` 内的 try/catch 包住：一个可选只读面板不会阻断 profile 启动。

## 已知限制

- **只读**：不写业务文件、不修改 `aoci.txt` / `.aoci` 正式资产；「校验」会让 aoci 自己追加
  `.aoci/verify_history` 审计记录（该目录已被 `.aoci/.gitignore` 忽略）。
- 本包是**本地包**，只登记在 `dsh.profile.bundles`、未写进 `dependencies`，以避免 `pnpm install`
  去 npm 拉同名包。若你用插件市场装卸其他插件导致 bundles 被重写，标签可能消失，把那一行加回即可。
- 面板是宿主进程内的会话期缓存；重启后首屏需要重新取数。

## 故障排查

| 现象 | 排查 |
| --- | --- |
| 标签栏没有 `AOCI` | profile 的 `dsh.profile.bundles` 是否含 `dsh-aoci-panel`；是否重启过 DSH；DSH 日志里搜 `dsh-aoci-panel` |
| 卡片显示「未取得治理事实」 | 看卡片底部 `CLI:` 行的 `通道=` 与 `尝试=` 列表，以及下方的错误详情 |
| 治理数字可疑（业务源文件 = 0） | 典型沙箱拦截迹象：CLI 被围栏后无法枚举业务源清单，请以终端里手跑的 `aoci verify` 为准 |
| 顶部仓库下拉是空的 | 该 DSH 实例还没有注册过工作区 |

## 许可证

[MIT](LICENSE)
