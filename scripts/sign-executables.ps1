# ============================================================================
# AC Car Studio — Authenticode Code-Signing Script
#
# Modes:
#  1. Commercial / CA Certificate (.pfx):
#     Set environment variables CSC_LINK (path to .pfx) and CSC_KEY_PASSWORD
#  2. Automatic Publisher Certificate (Self-Signed CodeSigningCert):
#     Generates or reuses "CN=Lagularge (AC Car Studio), O=Lagularge" in
#     Cert:\CurrentUser\My, exports public key to installer\AC-Car-Studio-Publisher.cer,
#     registers in Cert:\CurrentUser\TrustedPublisher, and signs all release/*.exe
#     with SHA-256 + DigiCert Timestamp Server.
# ============================================================================

param(
  [switch]$InstallRootTrust
)

$ErrorActionPreference = 'Stop'
$RootDir = Split-Path -Parent $PSScriptRoot
$CerPath = Join-Path $RootDir 'installer\AC-Car-Studio-Publisher.cer'
$ReleaseDir = Join-Path $RootDir 'release'

$Cert = $null

if ($env:CSC_LINK -and (Test-Path $env:CSC_LINK)) {
  Write-Host "[sign] Loading PFX certificate from CSC_LINK: $($env:CSC_LINK)" -ForegroundColor Cyan
  $flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
  if ($env:CSC_KEY_PASSWORD) {
    $Cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($env:CSC_LINK, $env:CSC_KEY_PASSWORD, $flags)
  } else {
    $Cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($env:CSC_LINK)
  }
} else {
  $Cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
    Where-Object { $_.Subject -like '*Lagularge*' -and $_.NotAfter -gt (Get-Date) } |
    Sort-Object NotAfter -Descending |
    Select-Object -First 1

  if (-not $Cert) {
    Write-Host '[sign] Creating new 3072-bit SHA-256 Code Signing Certificate for Lagularge (AC Car Studio)...' -ForegroundColor Yellow
    $Cert = New-SelfSignedCertificate `
      -Type CodeSigningCert `
      -Subject 'CN=Lagularge (AC Car Studio), O=Lagularge, C=JP' `
      -FriendlyName 'AC Car Studio Publisher Certificate' `
      -KeyAlgorithm RSA `
      -KeyLength 3072 `
      -HashAlgorithm SHA256 `
      -CertStoreLocation 'Cert:\CurrentUser\My' `
      -NotAfter (Get-Date).AddYears(5)
  } else {
    Write-Host "[sign] Using existing Code Signing Certificate: $($Cert.Subject) (Thumbprint: $($Cert.Thumbprint))" -ForegroundColor Cyan
  }

  # Export public certificate (.cer only, no private key) so users/installers can trust the publisher
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $CerPath) | Out-Null
  Export-Certificate -Cert $Cert -FilePath $CerPath -Force | Out-Null
  Write-Host "[sign] Exported public certificate: $CerPath" -ForegroundColor Green

  # Register in CurrentUser\TrustedPublisher (no modal prompt)
  try {
    $tpStore = New-Object System.Security.Cryptography.X509Certificates.X509Store('TrustedPublisher', 'CurrentUser')
    $tpStore.Open('ReadWrite')
    $tpStore.Add($Cert)
    $tpStore.Close()
  } catch {
    # Ignore if restricted
  }

  if ($InstallRootTrust) {
    Write-Host '[sign] Registering certificate in CurrentUser\Root (confirm the Windows prompt if shown)...' -ForegroundColor Yellow
    $rootStore = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'CurrentUser')
    $rootStore.Open('ReadWrite')
    $rootStore.Add($Cert)
    $rootStore.Close()
  }
}

$Targets = @()
if (Test-Path $ReleaseDir) {
  $Targets += Get-ChildItem -Path $ReleaseDir -Filter '*.exe' -File | Select-Object -ExpandProperty FullName
  $UnpackedExe = Join-Path $ReleaseDir 'win-unpacked\AC Car Studio.exe'
  if (Test-Path $UnpackedExe) {
    $Targets += $UnpackedExe
  }
}

if ($Targets.Count -eq 0) {
  Write-Host '[sign] No .exe files found in release/ to sign.' -ForegroundColor Yellow
  exit 0
}

foreach ($ExePath in $Targets) {
  Write-Host "[sign] Signing: $ExePath" -ForegroundColor Cyan
  Unblock-File -Path $ExePath -ErrorAction SilentlyContinue

  $Sig = Set-AuthenticodeSignature `
    -FilePath $ExePath `
    -Certificate $Cert `
    -HashAlgorithm SHA256 `
    -TimestampServer 'http://timestamp.digicert.com' `
    -ErrorAction SilentlyContinue

  if (-not $Sig -or -not $Sig.SignerCertificate) {
    # Fallback without timestamp server if offline
    $Sig = Set-AuthenticodeSignature `
      -FilePath $ExePath `
      -Certificate $Cert `
      -HashAlgorithm SHA256
  }

  $tsSubject = if ($Sig.TimeStamperCertificate) { $Sig.TimeStamperCertificate.Subject } else { 'None' }
  Write-Host "  -> Signer: $($Sig.SignerCertificate.Subject) | Timestamp: $tsSubject | StatusMessage: $($Sig.StatusMessage)" -ForegroundColor Green
}
