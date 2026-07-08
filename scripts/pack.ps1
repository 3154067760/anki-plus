# 打包脚本：生成可上传到服务器的 zip（不含 node_modules 和 data）
# 用法: powershell -ExecutionPolicy Bypass -File scripts/pack.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$out = Join-Path (Split-Path -Parent $root) "anki_plus.zip"

$items = @(
  "server.js", "db.js", "sm2.js",
  "package.json", "package-lock.json",
  "ecosystem.config.js", "README.md",
  "public", "deploy", "docs"
)

$temp = Join-Path $env:TEMP "anki_plus_pack"
if (Test-Path $temp) { Remove-Item -Recurse -Force $temp }
New-Item -ItemType Directory -Path $temp | Out-Null

foreach ($item in $items) {
  $src = Join-Path $root $item
  if (Test-Path $src) {
    Copy-Item -Recurse $src (Join-Path $temp $item)
  }
}

if (Test-Path $out) { Remove-Item $out }
Compress-Archive -Path "$temp\*" -DestinationPath $out -Force
Remove-Item -Recurse -Force $temp

Write-Host "已生成: $out"
Write-Host "上传到服务器 /var/www/ 后解压，执行 npm install --production"
