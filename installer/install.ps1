# ============================================================================
# AC Car Studio — GitHub PowerShell Online Installer (One-Liner Supported)
# Usage:
#   irm https://raw.githubusercontent.com/Lagularge/ac-car-studio/main/installer/install.ps1 | iex
# ============================================================================

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RepoApi = 'https://api.github.com/repos/Lagularge/ac-car-studio/releases/latest'
$InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\AC Car Studio'
$TargetExe = Join-Path $InstallDir 'AC Car Studio.exe'

Write-Host '======================================================' -ForegroundColor Cyan
Write-Host '  AC Car Studio — GitHub オンラインインストーラー' -ForegroundColor Cyan
Write-Host '======================================================' -ForegroundColor Cyan

Write-Host '[1/4] GitHub Releases から最新バージョン情報を取得中...' -ForegroundColor Yellow
$Release = Invoke-RestMethod -Uri $RepoApi -Headers @{ 'User-Agent' = 'AC-Car-Studio-PS-Installer' }
$Asset = $Release.assets | Where-Object { $_.name -match 'portable.*\.exe$' } | Select-Object -First 1
if (-not $Asset) {
  $Asset = $Release.assets | Where-Object { $_.name -match '\.exe$' -and $_.name -notmatch 'Online-Setup' } | Select-Object -First 1
}
if (-not $Asset) {
  throw 'GitHub リリース内に配布用 .exe アセットが見つかりませんでした。'
}

$SizeMb = [Math]::Round($Asset.size / 1MB, 1)
Write-Host "  -> 最新バージョン: $($Release.tag_name) ($($Asset.name) / $SizeMb MB)" -ForegroundColor Green

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$TempFile = Join-Path $InstallDir 'AC-Car-Studio.download.tmp'

Write-Host "[2/4] GitHub からダウンロード中 ($SizeMb MB)..." -ForegroundColor Yellow
Invoke-WebRequest -Uri $Asset.browser_download_url -OutFile $TempFile -UseBasicParsing

if (Test-Path $TargetExe) {
  Remove-Item -Force $TargetExe
}
Move-Item -Force $TempFile $TargetExe
Set-Content -Path (Join-Path $InstallDir 'version.txt') -Value $Release.tag_name -Encoding UTF8

Write-Host '[3/4] デスクトップ & スタートメニューのショートカットを作成中...' -ForegroundColor Yellow
$WshShell = New-Object -ComObject WScript.Shell
$DesktopShortcut = $WshShell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'AC Car Studio.lnk'))
$DesktopShortcut.TargetPath = $TargetExe
$DesktopShortcut.WorkingDirectory = $InstallDir
$DesktopShortcut.Description = 'AC Car Studio — Assetto Corsa Vehicle Creator & Physics Studio'
$DesktopShortcut.Save()

$StartMenuDir = Join-Path ([Environment]::GetFolderPath('Programs')) 'AC Car Studio'
New-Item -ItemType Directory -Force -Path $StartMenuDir | Out-Null
$StartShortcut = $WshShell.CreateShortcut((Join-Path $StartMenuDir 'AC Car Studio.lnk'))
$StartShortcut.TargetPath = $TargetExe
$StartShortcut.WorkingDirectory = $InstallDir
$StartShortcut.Description = 'AC Car Studio — Assetto Corsa Vehicle Creator & Physics Studio'
$StartShortcut.Save()

Write-Host "[4/4] インストール完了！ ($TargetExe)" -ForegroundColor Green
Start-Process -FilePath $TargetExe -WorkingDirectory $InstallDir
