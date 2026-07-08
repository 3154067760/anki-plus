# Pack anki-plus to Desktop\anki-plus.zip

$ErrorActionPreference = "Stop"
$root = "C:\Users\31540\Desktop\project\study\anki_plus"
$outZip = Join-Path ([Environment]::GetFolderPath("Desktop")) "anki-plus.zip"
$zipRoot = Join-Path $env:TEMP "anki-plus_pack"
$dest = Join-Path $zipRoot "anki-plus"

if (-not (Test-Path $root)) {
  throw "Project folder not found: $root"
}

Write-Host "Packing $root -> $outZip" -ForegroundColor Cyan

if (Test-Path $zipRoot) { Remove-Item $zipRoot -Recurse -Force }
New-Item -ItemType Directory -Path $dest -Force | Out-Null

robocopy $root $dest /E /XD node_modules data .git __pycache__ /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) {
  throw "robocopy failed with exit code $LASTEXITCODE"
}

if (Test-Path $outZip) { Remove-Item $outZip -Force }
Compress-Archive -Path $dest -DestinationPath $outZip -Force
Remove-Item $zipRoot -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Done: $outZip" -ForegroundColor Green
