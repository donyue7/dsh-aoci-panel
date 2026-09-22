<#
.SYNOPSIS
  dsh-aoci-panel 自检门：语法 / 交付清单 / 契约一致性 / 行尾 / AOCI 基线漂移。

.DESCRIPTION
  在每次重启 DSH 之前、以及每次提交之前跑它。零依赖：只用 pwsh 与 node，不需要 aoci CLI。
  退出码 0 = 没有 FAIL；1 = 有 FAIL。

  检查项：
    1. package.json 可解析，且宿主半 / 浏览器半 / 补丁层 / 插槽注入的契约字段齐全
    2. files 清单列出的路径都真实存在
    3. main、exports、dsh.bundle.patch 都落在交付内容（package.json + files）里 ——
       漏在 files 之外的产物在 npm 发布后会缺失
    4. JS 里的相对 import 都落在交付内容里（新增模块忘了进 files 的必检项）
    5. cordis.patch.yml 的 id/name 等于包名（DSH 按 id 定位、按 name 解析宿主半）
    6. 交付文件是 LF 行尾（.gitattributes 强制 LF；CRLF 会让 AOCI 基线整树 Stale）
    7. node --check 语法
    8. 受管文件相对 .aoci/baseline.json 的漂移（开发期只是 WARN；加 -RequireAociAligned 变 FAIL）

.EXAMPLE
  pwsh -File scripts/check.ps1

.EXAMPLE
  pwsh -File scripts/check.ps1 -RequireAociAligned
  提交前用：AOCI 基线不一致时直接失败。
#>
[CmdletBinding()]
param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [switch]$RequireAociAligned
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$Root = (Resolve-Path $Root).Path

$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
  param([string]$Level, [string]$Name, [string]$Detail = '')
  $results.Add([pscustomobject]@{ Level = $Level; Name = $Name; Detail = $Detail }) | Out-Null
  $line = "[$($Level.ToLower())] $Name"
  if ($Detail) { $line += " — $Detail" }
  switch ($Level) {
    'PASS' { Write-Host $line -ForegroundColor DarkGray }
    'WARN' { Write-Host $line -ForegroundColor Yellow }
    default { Write-Host $line -ForegroundColor Red }
  }
}

function Test-Item {
  param([string]$Name, [scriptblock]$Body)
  try {
    $out = & $Body
    if ($out -is [hashtable]) {
      Add-Result -Level $out.level -Name $Name -Detail ([string]$out.detail)
    } else {
      Add-Result -Level 'PASS' -Name $Name -Detail ([string]$out)
    }
  } catch {
    Add-Result -Level 'FAIL' -Name $Name -Detail (($_.Exception.Message -replace '\s+', ' ').Trim())
  }
}

function Get-ShippedPaths {
  param([string]$ManifestPath)
  $parsed = Get-Content $ManifestPath -Raw | ConvertFrom-Json
  $shipped = @('package.json')
  foreach ($entry in @($parsed.files)) {
    if ($entry) { $shipped += [string]$entry }
  }
  return ($shipped | Select-Object -Unique)
}

function ConvertTo-Rel {
  param([string]$Path)
  return (($Path -replace '\\', '/') -replace '^\./', '')
}

function Get-ExportTargets {
  param($Node)
  $out = @()
  if ($Node -is [string]) {
    $out += $Node
  } elseif ($Node -is [System.Management.Automation.PSCustomObject]) {
    foreach ($property in $Node.PSObject.Properties) { $out += Get-ExportTargets -Node $property.Value }
  } elseif ($Node -is [System.Collections.IEnumerable]) {
    foreach ($item in $Node) { $out += Get-ExportTargets -Node $item }
  }
  return $out
}

$manifestPath = Join-Path $Root 'package.json'
if (-not (Test-Path $manifestPath)) {
  Write-Host "[fail] 找不到 $manifestPath" -ForegroundColor Red
  exit 1
}
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$shippedNorm = @(Get-ShippedPaths -ManifestPath $manifestPath | ForEach-Object { ConvertTo-Rel $_ })
$jsShipped = @($shippedNorm | Where-Object { $_ -like '*.js' })

Write-Host "dsh-aoci-panel 自检 — $Root" -ForegroundColor Cyan

Test-Item '契约字段齐全（宿主半 / 浏览器半 / 补丁层 / 插槽）' {
  $missing = @()
  if (-not $manifest.name) { $missing += 'name' }
  if (-not $manifest.version) { $missing += 'version' }
  if (-not $manifest.main) { $missing += 'main（宿主半入口）' }
  if (-not $manifest.exports) { $missing += 'exports（浏览器半入口）' }
  elseif (-not $manifest.exports.'./client') { $missing += 'exports["./client"]（浏览器半）' }
  if (-not $manifest.dsh) { $missing += 'dsh' }
  else {
    if (-not $manifest.dsh.bundle.patch) { $missing += 'dsh.bundle.patch（bundle 补丁层）' }
    if (-not $manifest.dsh.client) { $missing += 'dsh.client（浏览器半声明）' }
    else {
      if ($manifest.dsh.client.platform -ne 'web') { $missing += 'dsh.client.platform 必须是 web' }
      if (-not @($manifest.dsh.client.inject).Count) { $missing += 'dsh.client.inject（插槽所属模块）' }
    }
  }
  if ($missing.Count) { throw ('缺：' + ($missing -join '、')) }
  return "$($manifest.name)@$($manifest.version)"
}

Test-Item 'files 清单里的路径都存在' {
  $missing = @()
  foreach ($entry in @($manifest.files)) {
    if ($entry -and -not (Test-Path (Join-Path $Root ([string]$entry)))) { $missing += $entry }
  }
  if ($missing.Count) { throw ('找不到：' + ($missing -join '、')) }
  return (@($manifest.files) -join ', ')
}

Test-Item '入口点都在交付内容里' {
  $entryPoints = @()
  if ($manifest.main) { $entryPoints += [string]$manifest.main }
  $entryPoints += Get-ExportTargets -Node $manifest.exports
  if ($manifest.dsh.bundle.patch) { $entryPoints += [string]$manifest.dsh.bundle.patch }
  $entryPoints = @($entryPoints | Where-Object { $_ } | ForEach-Object { ConvertTo-Rel $_ } | Select-Object -Unique)
  $missing = @($entryPoints | Where-Object { $shippedNorm -notcontains $_ })
  if ($missing.Count) { throw ('未随包发布：' + ($missing -join '、') + '（加进 package.json 的 files）') }
  return ($entryPoints -join ', ')
}

Test-Item 'JS 的相对 import 都在交付内容里' {
  $problems = @()
  foreach ($file in $jsShipped) {
    $full = Join-Path $Root $file
    $text = Get-Content $full -Raw
    foreach ($match in [regex]::Matches($text, "(?:from|import|require)\s*\(?\s*['""](\.[^'""\r\n]+)['""]")) {
      $specifier = $match.Groups[1].Value
      $resolved = [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $full) $specifier))
      $rel = ConvertTo-Rel $resolved.Substring($Root.Length).TrimStart('\', '/')
      if (-not (Test-Path $resolved) -and -not (Test-Path "$resolved.js")) {
        $problems += "$file 引用了不存在的 $specifier"
      } elseif ($shippedNorm -notcontains $rel -and $shippedNorm -notcontains "$rel.js") {
        $problems += "$file 引用了未随包发布的 $specifier"
      }
    }
  }
  if ($problems.Count) { throw ($problems -join '；') }
  return "$($jsShipped.Count) 个 JS 文件"
}

Test-Item 'cordis.patch.yml 的 id/name 等于包名' {
  $patchPath = Join-Path $Root 'cordis.patch.yml'
  if (-not (Test-Path $patchPath)) { throw '找不到 cordis.patch.yml' }
  $text = Get-Content $patchPath -Raw
  $ids = @([regex]::Matches($text, '(?m)^\s*-?\s*id:\s*(\S+)') | ForEach-Object { $_.Groups[1].Value.Trim("'`"") })
  $names = @([regex]::Matches($text, '(?m)^\s*name:\s*(\S+)') | ForEach-Object { $_.Groups[1].Value.Trim("'`"") })
  if ($ids -notcontains $manifest.name) { throw "缺 id: $($manifest.name)（现有：$($ids -join ', ')）" }
  if ($names -notcontains $manifest.name) { throw "缺 name: $($manifest.name)（现有：$($names -join ', ')）" }
  return "id/name = $($manifest.name)"
}

Test-Item '交付文件是 LF 行尾' {
  $crlf = @()
  foreach ($file in $shippedNorm) {
    $bytes = [System.IO.File]::ReadAllBytes((Join-Path $Root $file))
    foreach ($byte in $bytes) { if ($byte -eq 13) { $crlf += $file; break } }
  }
  if ($crlf.Count) { throw ('含 CR：' + ($crlf -join '、') + '（.gitattributes 强制 LF，CRLF 会污染 AOCI 基线）') }
  return "$($shippedNorm.Count) 个文件"
}

Test-Item 'node --check 语法' {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    return @{ level = 'WARN'; detail = 'PATH 上没有 node，跳过语法检查' }
  }
  $failures = @()
  foreach ($file in $jsShipped) {
    $output = & node --check (Join-Path $Root $file) 2>&1
    if ($LASTEXITCODE -ne 0) { $failures += "${file}: $($output -join ' ')" }
  }
  if ($failures.Count) { throw ($failures -join '；') }
  return "$($jsShipped.Count) 个文件（$(& node -v)）"
}

Test-Item 'AOCI 基线漂移' {
  $baselinePath = Join-Path $Root '.aoci\baseline.json'
  if (-not (Test-Path $baselinePath)) {
    return @{ level = 'WARN'; detail = '没有 .aoci/baseline.json，跳过' }
  }
  $baseline = Get-Content $baselinePath -Raw | ConvertFrom-Json
  $changed = @()
  $missing = @()
  foreach ($property in $baseline.files.PSObject.Properties) {
    $path = Join-Path $Root $property.Name
    if (-not (Test-Path $path)) { $missing += $property.Name; continue }
    $hash = (Get-FileHash $path -Algorithm SHA256).Hash.ToLower()
    if ($hash -ne $property.Value.sha256) { $changed += $property.Name }
  }
  if (-not $changed.Count -and -not $missing.Count) { return '与基线一致' }
  $detail = @()
  if ($changed.Count) { $detail += '已改：' + ($changed -join '、') }
  if ($missing.Count) { $detail += '已删：' + ($missing -join '、') }
  $detail += '收尾时需按 AOCI Guide 维护认知'
  $level = if ($RequireAociAligned) { 'FAIL' } else { 'WARN' }
  return @{ level = $level; detail = ($detail -join '；') }
}

$failed = @($results | Where-Object { $_.Level -eq 'FAIL' }).Count
$warned = @($results | Where-Object { $_.Level -eq 'WARN' }).Count
$passed = @($results | Where-Object { $_.Level -eq 'PASS' }).Count

Write-Host ''
Write-Host "通过 $passed，警告 $warned，失败 $failed" -ForegroundColor $(if ($failed) { 'Red' } elseif ($warned) { 'Yellow' } else { 'Green' })

if ($failed) { exit 1 }
exit 0
