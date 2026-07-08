# Deploy anki-plus to server. Run: .\deploy\deploy.ps1

$ErrorActionPreference = "Stop"
$root = "C:\Users\31540\Desktop\project\study\anki_plus"
$remoteDir = "/var/www/anki-plus"
$sshHost = "aliyun"

if (-not (Test-Path $root)) {
  throw "Project folder not found: $root"
}

Set-Location $root

Write-Host "==> [1/3] Pack" -ForegroundColor Cyan
& "$root\deploy\pack.ps1"

$zip = Join-Path ([Environment]::GetFolderPath("Desktop")) "anki-plus.zip"
if (-not (Test-Path $zip)) {
  throw "Pack failed: $zip"
}

Write-Host "==> [2/3] Upload" -ForegroundColor Cyan
ssh $sshHost "mkdir -p $remoteDir/deploy"
scp $zip "${sshHost}:${remoteDir}/anki-plus.zip"
scp "$root\deploy\install.sh" "${sshHost}:${remoteDir}/deploy/install.sh"
scp "$root\deploy\update.sh" "${sshHost}:${remoteDir}/deploy/update.sh"

Write-Host "==> [3/3] Install on server" -ForegroundColor Cyan
ssh $sshHost "chmod +x $remoteDir/deploy/*.sh"
ssh $sshHost "bash $remoteDir/deploy/install.sh"

Write-Host ""
Write-Host "Done: http://39.105.176.96:3030" -ForegroundColor Green
