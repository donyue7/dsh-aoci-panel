<#
.SYNOPSIS
  把 dsh-aoci-panel 安装到某个 DSH profile，或从该 profile 卸载。

.DESCRIPTION
  安装做三件事（幂等）：
    1. 把本包放进 $DshHome/profiles/<Profile>/node_modules/dsh-aoci-panel
    2. 在该 profile 的 package.json 的 dsh.profile.bundles 末尾追加 "dsh-aoci-panel"
       （修改前自动备份为 package.json.bak-aoci）
    3. 打印本次改动需要的生效方式

  第 1 步有两种模式：
    -Mode copy（默认）
      按 package.json 的 files 清单拷贝真实产物，与 npm 发布内容一致。用于发布前的
      真实安装验证，也用于普通用户安装。
    -Mode link
      在 profile 里创建指向本仓库的目录联接（junction），开发期保存即生效、无需重复
      拷贝。只用于开发；发布前请用 copy 模式再验一次。

  拷贝清单不再硬编码：files 是唯一真源，install 与 npm publish 因此不会各自漂移。

.EXAMPLE
  pwsh -File scripts/install.ps1
  以 copy 模式装进默认的 desktop profile。

.EXAMPLE
  pwsh -File scripts/install.ps1 -Mode link
  开发模式：profile 里的包直连本仓库，改完保存即生效。

.EXAMPLE
  pwsh -File scripts/install.ps1 -WhatIfOnly
  只打印打算做什么，不落盘。

.EXAMPLE
  pwsh -File scripts/install.ps1 -Uninstall
  移除 bundles 行并删除包目录（或联接）。
#>
[CmdletBinding()]
param(
  [ValidateSet('copy', 'link')]
  [string]$Mode = 'copy',
  [string]$Profile = 'desktop',
  [string]$DshHome = (Join-Path $env:USERPROFILE '.dsh'),
  [switch]$Uninstall,
  [switch]$WhatIfOnly
)

$ErrorActionPreference = 'Stop'

$packageName = 'dsh-aoci-panel'
$source = Split-Path -Parent $PSScriptRoot
$sourceManifest = Join-Path $source 'package.json'
$profileDir = Join-Path $DshHome (Join-Path 'profiles' $Profile)
$profileManifest = Join-Path $profileDir 'package.json'
$target = Join-Path $profileDir (Join-Path 'node_modules' $packageName)

if (-not (Test-Path $profileManifest)) {
  throw "找不到 profile 清单：$profileManifest（profile 名是否正确？）"
}
if (-not (Test-Path $sourceManifest)) {
  throw "找不到包清单：$sourceManifest"
}

Write-Host "[$packageName] 仓库：$source"
Write-Host "[$packageName] profile：$profileDir"

<#
  返回要放进 profile 的条目清单。
  package.json 由 npm 无条件发布，files 是显式清单，两者合起来即发布内容
  （npm 另外总会附带 README/LICENSE，DSH 不读它们，这里不拷）。
#>
function Get-ShippedPaths {
  param([string]$ManifestPath)
  $manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
  $shipped = @('package.json')
  foreach ($entry in @($manifest.files)) {
    if ($entry) { $shipped += [string]$entry }
  }
  return ($shipped | Select-Object -Unique)
}

<# 只摘链接、不碰链接目标；普通目录才递归删除。 #>
function Remove-Installed {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return }
  $item = Get-Item $Path -Force
  if ($item.LinkType -eq 'Junction' -or $item.LinkType -eq 'SymbolicLink') {
    # 对 junction 用 Remove-Item -Recurse 有删掉链接目标内容的先例，这里只删链接本身。
    [System.IO.Directory]::Delete($Path, $false)
    Write-Host "  已移除联接：$Path"
  } else {
    Remove-Item $Path -Recurse -Force
    Write-Host "  已删除目录：$Path"
  }
}

function Register-Bundle {
  param([string]$ManifestPath, [string]$Name, [bool]$WhatIf)
  $manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
  $bundles = @($manifest.dsh.profile.bundles)
  if ($bundles -contains $Name) {
    Write-Host '  bundles 已包含该包，跳过清单修改。'
    return
  }
  if ($WhatIf) {
    Write-Host "  [whatif] 在 dsh.profile.bundles 追加 $Name"
    return
  }
  Copy-Item $ManifestPath "$ManifestPath.bak-aoci" -Force
  $manifest.dsh.profile.bundles = $bundles + $Name
  $manifest | ConvertTo-Json -Depth 10 | Set-Content $ManifestPath -Encoding utf8
  Write-Host '  已在 dsh.profile.bundles 追加一行（原清单备份为 package.json.bak-aoci）'
}

function Unregister-Bundle {
  param([string]$ManifestPath, [string]$Name, [bool]$WhatIf)
  $manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
  $bundles = @($manifest.dsh.profile.bundles)
  if ($bundles -notcontains $Name) {
    Write-Host '  bundles 不含该包，跳过清单修改。'
    return
  }
  if ($WhatIf) {
    Write-Host "  [whatif] 从 dsh.profile.bundles 移除 $Name"
    return
  }
  Copy-Item $ManifestPath "$ManifestPath.bak-aoci" -Force
  $manifest.dsh.profile.bundles = @($bundles | Where-Object { $_ -ne $Name })
  $manifest | ConvertTo-Json -Depth 10 | Set-Content $ManifestPath -Encoding utf8
  Write-Host '  已从 dsh.profile.bundles 移除一行'
}

if ($Uninstall) {
  Unregister-Bundle -ManifestPath $profileManifest -Name $packageName -WhatIf $WhatIfOnly.IsPresent
  if ($WhatIfOnly) {
    Write-Host "  [whatif] 移除 $target"
    return
  }
  Remove-Installed -Path $target
  Write-Host '  已卸载。请重启 DSH 生效。'
  return
}

if ($WhatIfOnly) {
  if ($Mode -eq 'link') {
    Write-Host "  [whatif] 建立联接 $target -> $source"
  } else {
    Write-Host "  [whatif] 按 files 清单拷贝到 $target：$((Get-ShippedPaths -ManifestPath $sourceManifest) -join ', ')"
  }
  Write-Host "  [whatif] 在 dsh.profile.bundles 追加 $packageName"
  return
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null

if ($Mode -eq 'link') {
  Remove-Installed -Path $target
  New-Item -ItemType Junction -Path $target -Target $source | Out-Null
  Write-Host "  已建立联接：$target -> $source"
} else {
  Remove-Installed -Path $target
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  $shipped = Get-ShippedPaths -ManifestPath $sourceManifest
  foreach ($entry in $shipped) {
    $from = Join-Path $source $entry
    if (-not (Test-Path $from)) { throw "package.json 的 files 列出了不存在的路径：$entry" }
    $to = Join-Path $target $entry
    $parent = Split-Path -Parent $to
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    if ((Get-Item $from -Force).PSIsContainer) {
      Copy-Item $from $to -Recurse -Force
    } else {
      Copy-Item $from $to -Force
    }
  }
  Write-Host "  已按 files 清单拷贝：$($shipped -join ', ')"
}

Register-Bundle -ManifestPath $profileManifest -Name $packageName -WhatIf $false

if ($Mode -eq 'link') {
  Write-Host '  完成。开发模式（profile 直连本仓库）：'
  Write-Host '    · lib/client.js 改动保存即热更，面板会在浏览器里原地替换，不用刷新、不用重启'
  Write-Host '    · lib/index.js（宿主半）改动必须重启 DSH —— 桌面版宿主进程没有模块热重载'
  Write-Host '    · 重启前先跑 pwsh -File scripts/check.ps1'
} else {
  Write-Host '  完成。请重启 DSH，然后打开任意会话顶部的 AOCI 标签。'
}
