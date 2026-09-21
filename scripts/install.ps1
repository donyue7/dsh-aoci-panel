<#
.SYNOPSIS
  把 dsh-aoci-panel 安装到某个 DSH profile，或从该 profile 卸载。

.DESCRIPTION
  安装做三件事（幂等）：
    1. 拷贝本包到 $DshHome/profiles/<Profile>/node_modules/dsh-aoci-panel
    2. 在该 profile 的 package.json 的 dsh.profile.bundles 末尾追加 "dsh-aoci-panel"
       （修改前自动备份为 package.json.bak-aoci）
    3. 提示重启 DSH

  插件包靠两点被发现：profile 的 dsh.profile.bundles 列出它，包内 cordis.patch.yml
  插入宿主行；package.json 的 dsh.client 声明让 Web 前端加载 ./client 浏览器 bundle。

.EXAMPLE
  pwsh -File scripts/install.ps1
  装进默认的 desktop profile。

.EXAMPLE
  pwsh -File scripts/install.ps1 -Profile web -WhatIfOnly
  只打印打算做什么，不落盘。

.EXAMPLE
  pwsh -File scripts/install.ps1 -Uninstall
  移除 bundles 行并删除包目录。
#>
[CmdletBinding()]
param(
  [string]$Profile = 'desktop',
  [string]$DshHome = (Join-Path $env:USERPROFILE '.dsh'),
  [switch]$Uninstall,
  [switch]$WhatIfOnly
)

$ErrorActionPreference = 'Stop'

$packageName = 'dsh-aoci-panel'
$source = Split-Path -Parent $PSScriptRoot
$profileDir = Join-Path $DshHome (Join-Path 'profiles' $Profile)
$profileManifest = Join-Path $profileDir 'package.json'
$target = Join-Path $profileDir (Join-Path 'node_modules' $packageName)

if (-not (Test-Path $profileManifest)) {
  throw "找不到 profile 清单：$profileManifest（profile 名是否正确？）"
}

Write-Host "[$packageName] profile 目录：$profileDir"

if ($Uninstall) {
  $manifest = Get-Content $profileManifest -Raw | ConvertFrom-Json
  $bundles = @($manifest.dsh.profile.bundles) | Where-Object { $_ -ne $packageName }
  $manifest.dsh.profile.bundles = $bundles
  if ($WhatIfOnly) {
    Write-Host "  [whatif] 从 bundles 移除 $packageName"
    Write-Host "  [whatif] 删除 $target"
    return
  }
  Copy-Item $profileManifest "$profileManifest.bak-aoci" -Force
  $manifest | ConvertTo-Json -Depth 10 | Set-Content $profileManifest -Encoding utf8
  if (Test-Path $target) { Remove-Item $target -Recurse -Force }
  Write-Host '  已卸载。请重启 DSH 生效。'
  return
}

if ($WhatIfOnly) {
  Write-Host "  [whatif] 拷贝 $source -> $target"
  Write-Host "  [whatif] 在 $profileManifest 的 dsh.profile.bundles 追加 $packageName"
  return
}

New-Item -ItemType Directory -Force -Path (Join-Path $target 'lib') | Out-Null
Copy-Item (Join-Path $source 'package.json') $target -Force
Copy-Item (Join-Path $source 'cordis.patch.yml') $target -Force
Copy-Item (Join-Path $source 'lib\index.js') (Join-Path $target 'lib') -Force
Copy-Item (Join-Path $source 'lib\client.js') (Join-Path $target 'lib') -Force
Write-Host "  已拷贝包文件到 $target"

$manifest = Get-Content $profileManifest -Raw | ConvertFrom-Json
$bundles = @($manifest.dsh.profile.bundles)
if ($bundles -contains $packageName) {
  Write-Host '  bundles 已包含该包，跳过清单修改。'
} else {
  Copy-Item $profileManifest "$profileManifest.bak-aoci" -Force
  $manifest.dsh.profile.bundles = $bundles + $packageName
  $manifest | ConvertTo-Json -Depth 10 | Set-Content $profileManifest -Encoding utf8
  Write-Host '  已在 dsh.profile.bundles 追加一行（原清单备份为 package.json.bak-aoci）'
}

Write-Host '  完成。请重启 DSH，然后打开任意会话顶部的 AOCI 标签。'
