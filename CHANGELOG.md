# Changelog

本文件记录用户可见的变更。版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## 0.6.0 — 2026-10-28

把 `dsh-aoci-bind` 并入本插件：面板与 Agent 接入工具合成一个包。

### 合并

- 新增 `lib/bind/`（11 个模块，零第三方依赖，源自 dsh-aoci-bind 0.1.0）：workspace 发现、绑定诊断与修复计划、
  行级 YAML 补丁模型、备份与原子写入、aoci CLI seam、工具 schema 与摘要渲染。
- 宿主半在 `tools` 服务可用时注册 4 个工具：`aoci_bind_status` / `aoci_bind_repair` /
  `aoci_project_init` / `aoci_doctor`；工具服务缺失时只跳过注册，面板不受影响。
- 配置新增嵌套字段 `bind`（字段与 dsh-aoci-bind 一致），装载期同样严格校验；
  `bind.aociBinary` 留空时自动复用面板探测到的 aoci。
- 测试新增 58 个用例（`test/bind/*.test.mjs`），覆盖 YAML 行模型、workspace 发现、
  绑定诊断与修复计划、4 个工具与插件挂载；`npm test` 与 `npm run check` 全绿。
- README 增补「AOCI 接入工具」章节、`bind` 配置与排障条目；`package.json` 摘要与关键词同步。

### 升级

- 已单独安装 `dsh-aoci-bind` 的 profile 请先卸载再升级本插件，避免重复注册同名工具。
- 接入工具修复 / 新增的 MCP 绑定行仍需重启 DSH 才在会话工具表生效。

## 0.5.0 — 2026-10-25

安装、更新、配置与维护全面转向 DSH 官方机制；面板功能保持不变。

### 安装 / 更新

- **改用官方安装链路**：`dsh plugin --profile <p> add dsh-aoci-panel`。不再手工拷贝到
  `node_modules` 或改写 profile 的 `package.json`，因此不会与 `pnpm install`、插件市场装卸互相覆盖。
- `scripts/install.ps1` 改为薄封装：`-Mode local | registry | uninstall`，自动定位桌面版自带的
  `dsh.cmd` 与 DSH home，安装后校验 `dependencies` 与 `dsh.profile.bundles`。
- 新增 `engines.dsh >= 0.2.0-rc.1`，安装期即做 DSH 兼容性检查。
- 新增 `CHANGELOG.md`。

### 版本与更新提示

- 新增 `GET /aoci-panel/about` 与面板顶栏版本按钮：显示当前版本、安装 profile、最新版本、
  检查时间与一条可复制的更新命令。registry 查询带超时、内存缓存与静默降级；**不自动执行更新**。
- 新增 `lib/about.js`：SemVer 比较、`latest` 查询、更新命令生成、profile 解析。

### 配置

- 新增 `lib/config.js`：`binDir` / `binPath` / `cliTimeoutMs` / `cacheTtlMs` / `batchLimit` /
  `locale` / `updateCheck` / `registryUrl` / `updateCheckTimeoutMs` / `updateCheckTtlMs` / `profile`。
- 配置在装载期校验：类型、范围、URL、未知字段都会响亮失败，不再静默使用默认值。
- 去掉 `C:\aoci\bin`、120s 超时、批量上限等硬编码（改为可覆盖的默认值）。

### 插件市场

- 新增 `market/index.json` 与 `scripts/market-index.mjs`：从 npm registry 生成版本、发布时间与
  `engines.dsh`；`--check` 可校验已提交的索引。
- 新增 `Market Index` 工作流：`main` 变更、每日定时与手动触发时重新生成并发布到 GitHub Pages。
  索引地址：`https://donyue7.github.io/dsh-aoci-panel/index.json`。
- 新增显示元数据 `locale/en.json`、`locale/zh.json` 与 `icon.svg`，导出 `./locale/*.json` 与 `./icon`，
  供 DSH 插件管理器在未激活时展示标题、描述与图标。

### 维护 / CI

- 自检门改为跨平台 `scripts/check.mjs`（`scripts/check.ps1` 为薄封装），新增显示资源、图标、
  市场索引一致性检查。
- 新增 `CI` 工作流：push / PR 在 Windows 与 Ubuntu 上跑自检门、单元测试与市场校验；
  Windows 额外验证 pwsh 入口。
- `Publish Package` 工作流新增：tag 必须等于 `v<package.json version>`，发布前必须通过自检门、
  单元测试与市场索引校验。
- 新增 `scripts/test-host.mjs`：配置校验、版本比较、更新检查（缓存/并发/降级）、市场索引校验。
- `scripts/test-cognition.mjs` 默认以本仓库为真实样本（`TEST_REPO` 可覆盖），CI 无需外部 checkout。

### 文档

- README 重写「快速开始 / 安装 / 配置 / 更新 / 插件市场 / 开发 / 自检门 / 已知限制 / 故障排查」，
  删除手工拷贝与 `-Mode copy` 的过时说明。

## 0.4.2 — 2026-10-20

- 修复：`bin` 未选择时回退到最新 aoci 二进制，避免治理指标整体降级。

## 0.4.1 — 2026-10-20

- 修复：缺少治理快照时显式降级，不再把未知写成 `0` / `false`。

## 0.4.0 — 2026-10-20

- 新增认知视图：价值卡、变更账本、开发须知、认知地图、健康时间线与资产清单。
- 发布清单改为目录形式（`lib/`），避免新增模块漏发布。

## 0.3.0 — 2026-10-18

- 新增多工作区总览、MCP 绑定诊断、快捷动作与提示词、批量 AOCI 初始化。

## 0.2.0 — 2026-09-23

- 新增安装向导与引导卡片：在面板内为未初始化仓库构建 AOCI 并接入 DSH。

## 0.1.1 — 2026-09-23

- 验证 npm 受信发布（OIDC）流水线。

## 0.1.0 — 2026-09-21

- 首个版本：会话视图中的 AOCI 认知面板（单仓库索引、治理状态、条目浏览）。
