<#
.SYNOPSIS
  把 dsh-aoci-panel 安装到某个 DSH profile、从 registry 更新，或卸载。

.DESCRIPTION
  安装/更新只做一件事：调用 DSH 官方插件命令

      dsh plugin --profile <profile> add <spec>

  由 DSH/pnpm 负责写入 profile 的 dependencies、node_modules 与
  dsh.profile.bundles。脚本不再手工拷贝目录或改写 profile 的 package.json，
  因此不会与 `pnpm install`、插件市场装卸互相覆盖。

  三种模式：
    -Mode local（默认）
      把本仓库作为本地包链接进 profile，适合开发：改完保存即生效
      （浏览器半热更，宿主半仍需重启）。
    -Mode registry
      从 npm 安装/更新发布版本；-Version 可指定版本或保留默认 latest。
    -Mode uninstall
      从 profile 移除本包（等价于 `dsh plugin remove dsh-aoci-panel`）。

  兼容旧参数：-Mode link / -Mode copy 都按 local 处理；-Uninstall 等价于
  -Mode uninstall。

.EXAMPLE
  pwsh -File scripts/install.ps1
  开发安装：把当前仓库链接进 desktop profile。

.EXAMPLE
  pwsh -File scripts/install.ps1 -Mode registry
  安装/更新 npm 上的最新发布版。

.EXAMPLE
  pwsh -File scripts/install.ps1 -Mode registry -Version 0.4.2
  固定版本（回滚用）。

.EXAMPLE
  pwsh -File scripts/install.ps1 -Profile web
  指定 profile。

.EXAMPLE
  pwsh -File scripts/install.ps1 -Uninstall
  卸载。

.EXAMPLE
  pwsh -File scripts/install.ps1 -WhatIfOnly
  只打印将执行的命令，不落盘。

.NOTES
  dsh CLI 探测顺序：-DshCli → PATH 上的 dsh → 桌面版安装目录
  （注册表 Uninstall 项的 InstallLocation\resources\runtime\cli\bin\dsh.cmd）。
  DSH home 探测顺序：-DshHome → $env:DSH_HOME → ~/.dsh-harness-next → ~/.dsh。
#>
[CmdletBinding()]
param(
  [string]$Mode = 'local',
  [string]$Profile = 'desktop',
  [string]$Version = 'latest',
  [string]$DshHome = '',
  [string]$DshCli = '',
  [switch]$Uninstall,
  [switch]$WhatIfOnly
)

$ErrorActionPreference = 'Stop'

$packageName = 'dsh-aoci-panel'
$source = Split-Path -Parent $PSScriptRoot
$sourceManifest = Join-Path $source 'package.json'

if (-not (Test-Path $sourceManifest)) {
  throw "找不到包清单：$sourceManifest"
}

if ($Uninstall) { $Mode = 'uninstall' }
$Mode = $Mode.ToLowerInvariant()
if ($Mode -eq 'link' -or $Mode -eq 'copy') {
  Write-Host "[$packageName] -Mode $Mode 已并入 -Mode local（统一走 dsh plugin add）。"
  $Mode = 'local'
}
if (@('local', 'registry', 'uninstall') -notcontains $Mode) {
  throw "未知的 -Mode '$Mode'（可用：local / registry / uninstall）"
}

<#
  解析 dsh CLI：
    1. 显式 -DshCli
    2. PATH 上的 dsh
    3. 桌面版安装目录（注册表 Uninstall 项的 InstallLocation）
    4. 常见的每用户安装路径
  桌面版默认不把 dsh 加进 PATH；第 3 步让脚本仍可直接用。
#>
function Resolve-DshCli {
  param([string]$Explicit)

  if ($Explicit) {
    if (-not (Test-Path -LiteralPath $Explicit)) { throw "找不到 -DshCli 指定的命令：$Explicit" }
    return $Explicit
  }

  $command = Get-Command dsh -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $uninstallRoots = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  $installs = @()
  foreach ($root in $uninstallRoots) {
    $installs += Get-ItemProperty $root -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -like 'DeepSeek Harness*' -and $_.InstallLocation }
  }
  foreach ($install in $installs) {
    $candidate = Join-Path $install.InstallLocation 'resources\runtime\cli\bin\dsh.cmd'
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }

  $fallback = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
  if (Test-Path -LiteralPath $fallback) { return $fallback }

  throw @'
找不到 dsh CLI。请任选一种方式后重试：
  1. 在桌面版里打开「设置 → 通用 → Manage dsh Command…」安装命令行；
  2. 用 -DshCli 指定 dsh.cmd 的完整路径，例如：
     -DshCli "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
'@
}

<# 解析 DSH home：显式 → $DSH_HOME → 新布局 → 旧布局；取第一个已有 profiles 的。 #>
function Resolve-DshHome {
  param([string]$Explicit)

  $candidates = New-Object System.Collections.Generic.List[string]
  if ($Explicit) { $candidates.Add($Explicit) }
  if ($env:DSH_HOME) { $candidates.Add($env:DSH_HOME) }
  $candidates.Add((Join-Path $env:USERPROFILE '.dsh-harness-next'))
  $candidates.Add((Join-Path $env:USERPROFILE '.dsh'))

  foreach ($candidate in $candidates) {
    if (Test-Path (Join-Path $candidate 'profiles')) { return $candidate }
  }
  if ($Explicit) { return $Explicit }
  # 全新机器：让 dsh plugin 自己初始化 ~/.dsh。
  return (Join-Path $env:USERPROFILE '.dsh')
}

<# 读取 profile 里当前安装的版本；没装过返回空串。 #>
function Get-InstalledVersion {
  param([string]$HomePath, [string]$ProfileName)
  $manifest = Join-Path $HomePath "profiles\$ProfileName\node_modules\$packageName\package.json"
  if (-not (Test-Path -LiteralPath $manifest)) { return '' }
  try {
    return [string]((Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json).version)
  } catch {
    return ''
  }
}

<# 校验安装后 profile 清单确实登记了本包（bundles 与 dependencies）。 #>
function Assert-ProfileRegistered {
  param([string]$HomePath, [string]$ProfileName)
  $manifestPath = Join-Path $HomePath "profiles\$ProfileName\package.json"
  if (-not (Test-Path -LiteralPath $manifestPath)) {
    return "profile 清单尚未生成：$manifestPath"
  }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $bundles = @($manifest.dsh.profile.bundles)
  $deps = @($manifest.dependencies.PSObject.Properties.Name)
  $problems = @()
  if ($bundles -notcontains $packageName) { $problems += 'dsh.profile.bundles 未登记' }
  if ($deps -notcontains $packageName) { $problems += 'dependencies 未登记' }
  if ($problems.Count -gt 0) { throw ("安装命令已执行，但 profile 清单异常：" + ($problems -join '；')) }
  return "已登记 bundles 与 dependencies（$manifestPath）"
}

$DshHome = Resolve-DshHome -Explicit $DshHome
$cli = Resolve-DshCli -Explicit $DshCli
$profileDir = Join-Path $DshHome "profiles\$Profile"
$installed = Get-InstalledVersion -HomePath $DshHome -ProfileName $Profile

Write-Host "[$packageName] dsh      ：$cli"
Write-Host "[$packageName] DSH home ：$DshHome"
Write-Host "[$packageName] profile  ：$Profile"
if ($installed) { Write-Host "[$packageName] 当前版本 ：$installed" } else { Write-Host "[$packageName] 当前版本 ：未安装" }

if ($Mode -eq 'uninstall') {
  if ($WhatIfOnly) {
    Write-Host "  [whatif] $cli plugin --profile $Profile remove $packageName"
    return
  }
  if (-not $installed -and -not (Test-Path $profileDir)) {
    Write-Host '  该 profile 里没有本包，无需卸载。'
    return
  }
  Write-Host "  执行：dsh plugin --profile $Profile remove $packageName"
  & $cli plugin --profile $Profile remove $packageName 2>&1 | ForEach-Object { Write-Host $_ }
  if ($LASTEXITCODE -ne 0) { throw "卸载失败（dsh 退出码 $LASTEXITCODE）" }

  # pnpm 不会删除本地链接（junction），卸载后需要显式移除，否则下次安装会 EPERM。
  $leftover = Join-Path $profileDir "node_modules\$packageName"
  if (Test-Path -LiteralPath $leftover) {
    $item = Get-Item -LiteralPath $leftover -Force
    if ($item.LinkType) {
      cmd /c rmdir "$leftover"
      if ($LASTEXITCODE -eq 0) { Write-Host "  已移除本地链接：$leftover" }
    } elseif (@(Get-ChildItem -LiteralPath $leftover -Force).Count -eq 0) {
      Remove-Item -LiteralPath $leftover -Force
      Write-Host "  已移除空目录：$leftover"
    } else {
      Write-Host "  提示：$leftover 仍有残留文件，请手动检查。" -ForegroundColor DarkGray
    }
  }

  Write-Host '  已移除依赖；请重启 DSH。'
  return
}

if ($Mode -eq 'local') {
  $spec = $source
  if (-not (Test-Path -LiteralPath $profileDir)) {
    if ($Profile -eq 'desktop') {
      throw "找不到 desktop profile：$profileDir。请先启动一次桌面版 DSH，再重试。"
    }
  }
} else {
  $spec = if ($Version -and $Version -ne 'latest') { "$packageName@$Version" } else { "$packageName@latest" }
}

Write-Host "[$packageName] 安装方式：$Mode"
Write-Host "[$packageName] 安装目标：$spec"

<#
  pnpm 无法用真实目录覆盖 Windows 的目录联接（junction），会报
  EPERM: rename ... -> dsh-aoci-panel。从本地链接切换到 registry 版本时，
  先显式移除链接（rmdir 只删链接，不会删仓库内容）。
#>
if ($Mode -eq 'registry') {
  $linked = Join-Path $profileDir "node_modules\$packageName"
  if (Test-Path -LiteralPath $linked) {
    $item = Get-Item -LiteralPath $linked -Force
    if ($item.LinkType) {
      if ($WhatIfOnly) {
        Write-Host "  [whatif] 移除本地链接：$linked（$($item.LinkType)）"
      } else {
        Write-Host "  检测到本地链接安装，先移除链接再安装 registry 版本：$linked"
        cmd /c rmdir "$linked"
        if ($LASTEXITCODE -ne 0) { throw "无法移除本地链接：$linked（退出码 $LASTEXITCODE）" }
      }
    }
  }
}

if ($WhatIfOnly) {
  Write-Host "  [whatif] $cli plugin --profile $Profile add $spec"
  Write-Host '  [whatif] 由 DSH/pnpm 写入 dependencies、node_modules 与 dsh.profile.bundles'
  return
}

if ($Mode -eq 'registry' -and -not $env:HTTPS_PROXY -and -not $env:HTTP_PROXY) {
  Write-Host '  提示：registry 安装需要网络；若本机走代理，请先设置 $env:HTTPS_PROXY。' -ForegroundColor DarkGray
}

Write-Host "  执行：dsh plugin --profile $Profile add $spec"
& $cli plugin --profile $Profile add $spec 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) {
  throw "安装失败（dsh 退出码 $LASTEXITCODE）。若错误含 EPERM / rename，请关闭正在占用该 profile 的程序（或先移除本地链接）后重试；若提示构建脚本未授权，请按输出把包键加入该 profile 的 pnpm-workspace.yaml 后重试。"
}

$nowInstalled = Get-InstalledVersion -HomePath $DshHome -ProfileName $Profile
Write-Host ''
Write-Host ('  ' + (Assert-ProfileRegistered -HomePath $DshHome -ProfileName $Profile))
if ($nowInstalled) { Write-Host "  安装后版本：$nowInstalled" }

if (Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue) {
  Write-Host '  检测到 DSH 正在运行：请重启 DSH 后打开任意会话顶部的 AOCI 标签。' -ForegroundColor Yellow
} else {
  Write-Host '  完成。启动 DSH 后打开任意会话顶部的 AOCI 标签。'
}
