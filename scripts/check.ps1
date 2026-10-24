<#
.SYNOPSIS
  dsh-aoci-panel 自检门的 pwsh 入口（实际检查在 scripts/check.mjs）。

.DESCRIPTION
  跨平台实现与全部检查项都在 scripts/check.mjs；本文件只负责把参数转过去，
  保持 `pwsh -File scripts/check.ps1` 这一既有用法可用。

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
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw '找不到 node：自检门需要 Node 20+（DSH 运行时自带，或自行安装）。'
}

$script = Join-Path $PSScriptRoot 'check.mjs'
$arguments = @($script, '--root', $Root)
if ($RequireAociAligned) { $arguments += '--require-aoci-aligned' }

& $node.Source @arguments
exit $LASTEXITCODE
